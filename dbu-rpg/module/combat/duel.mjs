import { DBU } from "../config.mjs";
import { dbuRoll, postInfoCard } from "../dice/roller.mjs";
import { emitGM, safeUpdate } from "../socket.mjs";
import { attackProfileEffects, profileAccess, profileEffects, profileKeys } from "../rules/profiles.mjs";
import { staminaPayment } from "./adversary.mjs";
import { attackFxData } from "../canvas/attack-fx.mjs";

/**
 * Duel Maneuver (dbu-rpg.com/actions-maneuvers): the target of an Attacking Maneuver with 2+ Energy Charges or a Ki
 * Wager of 10(bT)+ answers with an Attacking Maneuver of the same Foundation (Energy and Magic count as one), or with
 * a Power Duel. The attacker may first try the Duel Escape Maneuver; once the Duel starts the attacker gets the Ki
 * Wager back, and three Duel Clashes follow, each side wagering in secret up to 1/2 of the Max Capacity (United Duels:
 * allies add up to 1/10 of theirs and +1(T) each). The winner of 2 hits every Character on the other side with its
 * attack and every Ki Wager of the Duel; a tie on the third Duel Clash costs everyone 1/2 of the Ki wagered in Life
 * Points. Everyone's Capacity ends at 0.
 */
const { DialogV2 } = foundry.applications.api;
const FDE = () => foundry.applications.ux.FormDataExtended;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const FLAG = "dbu-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Energy and Magic count as a single Foundation for a Duel Maneuver. */
const kiGroup = f => ((f === "physical") ? "physical" : "ki");

/** Can this attack be answered with a Duel Maneuver? */
export function duelable(attack) {
  if ( !attack || attack.fromDuel ) return false;
  return !!attack.duelOnly || ((attack.charges ?? 0) >= 2) || ((attack.wager ?? 0) >= (10 * (attack.bT ?? 1)));
}

async function actorOf(t) {
  if ( t?.tokenUuid ) {
    const token = await fromUuid(t.tokenUuid);
    if ( token?.actor ) return token.actor;
  }
  return t?.actorUuid ? fromUuid(t.actorUuid) : null;
}

const powerShotOf = sig => sig?.advantages?.find(a => a.key === "powerShot")?.rank ?? 0;
const gmWhisper = () => game.users.filter(u => u.isGM).map(u => u.id);
/** An ally's key in the Ki Wagers waiting: a UUID's dots would turn into nested objects in a flag update. */
const hk = uuid => String(uuid ?? "").replaceAll(".", "_");

/** Everyone in the Duel: the two primary Characters and the allies of a United Duel. */
function participants(duel) {
  return [
    { side: "a", primary: true, ...duel.a }, { side: "b", primary: true, ...duel.b },
    ...(duel.helpers?.a ?? []).map(h => ({ side: "a", primary: false, ...h })),
    ...(duel.helpers?.b ?? []).map(h => ({ side: "b", primary: false, ...h }))
  ];
}

/** The duel card that is still going on for an attack, if any. */
function activeDuelOf(attack) {
  for ( const t of attack?.targets ?? [] ) {
    const m = t.duel ? game.messages.get(t.duel) : null;
    const d = m?.getFlag(FLAG, "duel");
    if ( d && !d.done ) return m;
  }
  return null;
}

/* -------------------------------------------- */
/*  Starting a Duel                             */
/* -------------------------------------------- */

/** The defender picks the Initiating Attack: a Signature Technique, a Basic Attack or a Power Duel. */
async function chooseInitiating(actor, attack) {
  const group = kiGroup(attack.foundation);
  const sigs = actor.items.filter(i => (i.type === "signature") && (kiGroup(i.system.foundation) === group));
  const profiles = Object.entries(DBU.profiles).filter(([k, p]) => p.foundations.some(f => kiGroup(f) === group)
    && profileAccess(actor, k));
  const foundations = (group === "physical") ? ["physical"] : ["energy", "magic"];
  const first = sigs[0] ? `sig:${sigs[0].id}` : `basic:${(group === "physical") ? "simple" : "beam"}`;
  const option = (v, label) => `<option value="${v}" ${v === first ? "selected" : ""}>${esc(label)}</option>`;
  const content = `<div class="dbu-dialog">
    <p>${L("DBU.Duel.Intro", { name: esc(attack.name) })}</p>
    <div class="form-group"><label>${L("DBU.Duel.Attack")}</label><select name="pick">
      ${sigs.map(s => option(`sig:${s.id}`, `${s.name} (${s.system.computed?.profileLabel ?? ""})`)).join("")}
      ${profiles.map(([k, p]) => option(`basic:${k}`, `${L("DBU.Attack.Basic")}: ${p.label}`)).join("")}
      ${option("power", L("DBU.Duel.Power"))}
    </select></div>
    <div class="form-group"><label>${L("DBU.Attack.Foundation")}</label><select name="foundation">
      ${foundations.map(f => `<option value="${f}">${L(DBU.foundations[f])}</option>`).join("")}</select></div>
    <p class="hint">${L("DBU.Duel.Hint", { n: actor.system.combat.energyCharges ?? 0 })}</p>
  </div>`;
  const data = await DialogV2.wait({
    window: { title: L("DBU.Duel.Title"), icon: "fa-solid fa-burst" }, position: { width: 440 }, content,
    buttons: [
      { action: "ok", label: L("DBU.Duel.Start"), icon: "fa-solid fa-burst", default: true, callback: (e, b) => new (FDE())(b.form).object },
      { action: "cancel", label: L("Cancel") }
    ],
    rejectClose: false
  });
  return (data && (data !== "cancel")) ? data : null;
}

/** One side of the Duel: its Initiating Attack (Energy Charges, Power Shot, Ki Point Cost, look on the canvas). */
function initiatingSide(actor, pick, chosenFoundation, tokenUuid) {
  const sys = actor.system;
  if ( pick === "power" ) {
    const foundation = (sys.attributes.ma.mod > sys.attributes.fo.mod) ? "magic" : "physical";
    return { power: true, name: L("DBU.Duel.Power"), foundation, profiles: [], charges: 0, powerShot: 0, kp: 0, cutting: false,
      fx: attackFxData({ from: tokenUuid, profiles: ["simple"], foundation }) };
  }
  const [kind, key] = String(pick).split(":");
  const item = (kind === "sig") ? actor.items.get(key) : null;
  const s = item?.system ?? null;
  const profileKey = s ? s.profile : key;
  const prof = DBU.profiles[profileKey] ?? DBU.profiles.simple;
  const foundation = s ? s.foundation : (prof.foundations.includes(chosenFoundation) ? chosenFoundation : prof.foundations[0]);
  const fx = profileEffects(profileKeys(profileKey, s));
  // Energy Charges: the ones gathered with the Energy Charge Maneuver, the Profile's, and an Ultimate's
  let charges = (sys.combat.energyCharges ?? 0) + fx.freeCharges;
  if ( s?.computed?.ultimate ) charges += sys.health.count;
  charges = Math.min(charges, s ? s.computed.maxCharges : fx.maxCharges) + fx.bonusCharges;
  // Ki Point Cost of the attack (with its minimum)
  const kpT = sys.top.kp;
  const units = s ? (s.computed.kpUnits + s.computed.kpAdjust) : prof.kp;
  const minUnits = s ? s.computed.kpMinUnits : (prof.kp / 2);
  let minKp = Math.ceil(minUnits * kpT);
  if ( sys.costs.perfectKiControl ) minKp = Math.min(minKp, 2 * kpT);
  const kp = Math.max(0, minKp, Math.ceil(units * kpT) + sys.costs.attack + (sys.kpCostByFoundation?.[foundation] ?? 0));
  return {
    power: false, name: item?.name ?? `${L("DBU.Attack.Basic")}: ${prof.label}`, signatureId: item?.id ?? null,
    profile: profileKey, profiles: fx.keys, foundation, charges, powerShot: powerShotOf(s), kp, cutting: fx.cutting,
    fx: attackFxData({ from: tokenUuid, profiles: fx.keys, foundation, vfx: s?.vfx ?? null, category: fx.cat, charges })
  };
}

/** The attacker's side: the attack on the card is its Initiating Attack. */
function attackerSide(attacker, attack) {
  const sig = attack.signatureId ? attacker?.items.get(attack.signatureId)?.system : null;
  const fx = attackProfileEffects(attack);
  return {
    power: false, name: attack.name, signatureId: attack.signatureId ?? null, profile: attack.profile, profiles: fx.keys,
    foundation: attack.foundation, charges: attack.charges ?? 0, powerShot: (attack.powerShot ?? 0) + powerShotOf(sig),
    // Power Shot stacks of the attack itself (Planet Burst), for its Wound Roll if it wins
    extraPowerShot: attack.powerShot ?? 0, kp: 0, cutting: fx.cutting,
    fx: attack.fx ?? attackFxData({ from: attack.fromToken ?? null, profiles: fx.keys, foundation: attack.foundation, charges: attack.charges })
  };
}

/**
 * Button "Duel" on an attack card: the target's owner answers the attack with a Duel Maneuver (1 Counter Action and
 * the Ki Point Cost of the Initiating Attack). If that attack is already in a Duel, the target joins it (United Duel).
 */
export async function startDuel(message, index) {
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  const t = attack?.targets?.[index];
  if ( !t ) return null;
  if ( t.result || t.duel ) return ui.notifications.info(L("DBU.Defense.AlreadyResolved"));
  if ( !duelable(attack) ) return ui.notifications.warn(L("DBU.Duel.NotAllowed"));
  const defender = await actorOf(t);
  if ( !defender ) return ui.notifications.warn(L("DBU.Notify.NoActor"));
  if ( !defender.isOwner ) return ui.notifications.warn(L("DBU.Notify.NotOwner"));
  // Several targets of one attack enter the same Duel: the first plays it through, the others are its allies
  const running = activeDuelOf(attack);
  if ( running ) return sendJoin(running, "b", defender, t.tokenUuid ?? null, index);
  const attacker = await fromUuid(attack.attackerUuid);
  const choice = await chooseInitiating(defender, attack);
  if ( !choice ) return null;
  const sys = defender.system;
  const side = initiatingSide(defender, choice.pick, choice.foundation, t.tokenUuid);
  // Pay: 1 Counter Action and the Ki Point Cost (Narrative Stamina first); the Energy Charges go into the attack
  const pay = staminaPayment(defender, side.kp);
  if ( pay.fromKi > sys.ki.value ) ui.notifications.warn(L("DBU.Attack.ErrKi", { need: pay.fromKi, have: sys.ki.value }));
  if ( (sys.combat.counters ?? 0) < 1 ) ui.notifications.warn(L("DBU.Defense.NoCounter"));
  const upd = { "system.combat.counters": Math.max(0, (sys.combat.counters ?? 0) - 1) };
  if ( side.kp ) upd["system.ki.value"] = Math.max(0, sys.ki.value - pay.fromKi);
  if ( pay.fromStamina ) upd["system.adversary.stamina"] = sys.adversary.stamina - pay.fromStamina;
  if ( !side.power ) upd["system.combat.energyCharges"] = 0;
  await defender.update(upd);
  // The duel card (everyone sees the struggle on the canvas); the Duel starts with the first Ki Wager, after the
  // attacker had the chance of the Duel Escape Maneuver
  const duel = {
    attackMessageId: message.id, targetIndex: index, physical: kiGroup(attack.foundation) === "physical",
    a: { actorUuid: attacker?.uuid ?? attack.attackerUuid, tokenUuid: attack.fx?.from ?? attack.fromToken ?? null,
      name: attacker?.name ?? "?", img: attacker?.img ?? "", attack: attackerSide(attacker, attack) },
    b: { actorUuid: defender.uuid, tokenUuid: t.tokenUuid ?? null, name: defender.name, img: t.img ?? defender.img,
      attack: side, targetIndex: index },
    helpers: { a: [], b: [] }, pending: { a: null, b: null, help: {} },
    started: false, refund: attack.wager ?? 0, escape: null,
    clashes: [], wins: { a: 0, b: 0 }, wagered: 0, point: 0.5, done: false, result: null
  };
  const content = await renderDuel(duel);
  const created = await ChatMessage.create({ author: game.user.id, speaker: ChatMessage.getSpeaker({ actor: defender }), content,
    flags: { [FLAG]: { kind: "duel", duel } } });
  t.duel = created.id;
  const { updateAttackCard } = await import("./attack.mjs");
  await updateAttackCard(message, attack);
  return created;
}

/** The attacking Character regains Ki Points and Capacity equal to the initial Ki Wager, losing the Ki Wager. */
async function beginDuel(duel) {
  if ( duel.started ) return;
  duel.started = true;
  const attacker = await fromUuid(duel.a.actorUuid);
  const refund = duel.refund ?? 0;
  if ( (refund > 0) && attacker ) {
    const a = attacker.system;
    await attacker.update({ "system.ki.value": Math.min(a.ki.max, a.ki.value + refund),
      "system.capacity.value": Math.min(a.capacity.max, a.capacity.value + refund) });
  }
  const attackMessage = game.messages.get(duel.attackMessageId);
  const attack = foundry.utils.deepClone(attackMessage?.getFlag(FLAG, "attack"));
  if ( attack && (attack.wager !== 0) ) {
    attack.wager = 0;
    const { updateAttackCard } = await import("./attack.mjs");
    await updateAttackCard(attackMessage, attack);
  }
}

/* -------------------------------------------- */
/*  Duel Escape and United Duels                */
/* -------------------------------------------- */

/** Button "Duel Escape" (the attacker, before the Duel starts): an Impulsive Clash against the one who started it. */
export async function escapeDuel(message) {
  const duel = message.getFlag(FLAG, "duel");
  if ( !duel || duel.done || duel.started || duel.escape ) return ui.notifications.info(L("DBU.Duel.EscapeLate"));
  const attacker = await fromUuid(duel.a.actorUuid);
  if ( !attacker?.isOwner ) return ui.notifications.warn(L("DBU.Notify.NotOwner"));
  if ( game.user.isGM ) return runQueued(() => resolveEscape(message.id));
  emitGM("duelEscape", { messageId: message.id });
}

async function resolveEscape(messageId) {
  const message = game.messages.get(messageId);
  const duel = foundry.utils.deepClone(message?.getFlag(FLAG, "duel"));
  if ( !duel || duel.done || duel.started || duel.escape ) return;
  const A = await fromUuid(duel.a.actorUuid);
  const B = await fromUuid(duel.b.actorUuid);
  if ( !A || !B ) return;
  // Duel Escape Maneuver: 1 Counter Action
  if ( (A.system.combat.counters ?? 0) < 1 ) ui.notifications.warn(L("DBU.Defense.NoCounter"));
  await A.update({ "system.combat.counters": Math.max(0, (A.system.combat.counters ?? 0) - 1) });
  const ra = await A.rollSave("impulsive");
  const rb = await B.rollSave("impulsive");
  // The one escaping makes the Clash: the other wins a tie
  const won = (ra?.total ?? 0) > (rb?.total ?? 0);
  duel.escape = { a: ra?.total ?? 0, b: rb?.total ?? 0, won };
  const lines = [L(won ? "DBU.Duel.EscapeWon" : "DBU.Duel.EscapeLost", { name: duel.a.name, other: duel.b.name, a: duel.escape.a, b: duel.escape.b })];
  if ( won ) {
    // The attack is nullified (its Ki Points stay spent) and the attacker regains its Action Cost
    duel.done = true;
    duel.result = "escaped";
    const attackMessage = game.messages.get(duel.attackMessageId);
    const attack = foundry.utils.deepClone(attackMessage?.getFlag(FLAG, "attack"));
    if ( attack ) {
      attack.nullified = true;
      for ( const t of attack.targets ) if ( !t.result ) { t.result = "miss"; t.defense = { mode: "Duel Escape" }; }
      const { updateAttackCard } = await import("./attack.mjs");
      await updateAttackCard(attackMessage, attack);
      const cost = attack.actionCost ?? 0;
      if ( cost > 0 ) {
        await A.update({ "system.combat.actions": (A.system.combat.actions ?? 0) + cost });
        lines.push(L("DBU.Duel.EscapeActions", { n: cost }));
      }
    }
  }
  else await beginDuel(duel);
  await saveDuel(message, duel);
  await postInfoCard({ actor: A, title: "Duel Escape", lines });
}

/** Button "Entrar no Duel": one of the user's Characters joins a side as an ally (United Duel). */
export async function joinDuel(message) {
  const duel = message.getFlag(FLAG, "duel");
  if ( !duel || duel.done ) return;
  const inDuel = new Set(participants(duel).map(p => p.actorUuid));
  const tokens = (canvas?.ready ? canvas.tokens.placeables : []).filter(t => t.actor?.isOwner && !inDuel.has(t.actor.uuid));
  if ( !tokens.length ) return ui.notifications.warn(L("DBU.Duel.NoAlly"));
  const sel = canvas.tokens.controlled.find(t => tokens.includes(t)) ?? tokens[0];
  const data = await DialogV2.wait({
    window: { title: L("DBU.Duel.JoinTitle") },
    content: `<div class="dbu-dialog"><p>${L("DBU.Duel.JoinHint")}</p>
      <div class="form-group"><label>${L("DBU.Duel.Who")}</label><select name="token">
        ${tokens.map(t => `<option value="${t.document.uuid}" ${t === sel ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>
      <div class="form-group"><label>${L("DBU.Duel.Side")}</label><select name="side">
        <option value="a">${esc(duel.a.name)}</option><option value="b">${esc(duel.b.name)}</option></select></div></div>`,
    buttons: [
      { action: "ok", label: L("DBU.Duel.Join"), default: true, callback: (e, b) => new (FDE())(b.form).object },
      { action: "cancel", label: L("Cancel") }
    ],
    rejectClose: false
  });
  if ( !data || (data === "cancel") ) return;
  const token = await fromUuid(data.token);
  if ( !token?.actor ) return;
  return sendJoin(message, data.side, token.actor, token.uuid, null);
}

function sendJoin(message, side, actor, tokenUuid, targetIndex) {
  const helper = { actorUuid: actor.uuid, tokenUuid, name: actor.name, img: actor.img, targetIndex };
  if ( game.user.isGM ) return runQueued(() => recordJoin(message.id, side, helper));
  emitGM("duelJoin", { messageId: message.id, side, helper });
  return null;
}

async function recordJoin(messageId, side, helper) {
  const message = game.messages.get(messageId);
  const duel = foundry.utils.deepClone(message?.getFlag(FLAG, "duel"));
  if ( !duel || duel.done || !["a", "b"].includes(side) ) return;
  if ( participants(duel).some(p => p.actorUuid === helper.actorUuid) ) return;
  (duel.helpers ??= { a: [], b: [] })[side].push(helper);
  duel.pending.help ??= {};
  duel.pending.help[hk(helper.actorUuid)] = null;
  // A target of the attack who joins: its row on the attack card is in the Duel too
  if ( Number.isInteger(helper.targetIndex) ) {
    const attackMessage = game.messages.get(duel.attackMessageId);
    const attack = foundry.utils.deepClone(attackMessage?.getFlag(FLAG, "attack"));
    const t = attack?.targets?.[helper.targetIndex];
    if ( t && !t.result ) {
      t.duel = message.id;
      const { updateAttackCard } = await import("./attack.mjs");
      await updateAttackCard(attackMessage, attack);
    }
  }
  await saveDuel(message, duel);
}

/* -------------------------------------------- */
/*  Duel Clashes                                */
/* -------------------------------------------- */

/** Most a Character can wager on a Duel Clash: 1/2 of the Max Capacity (an ally: 1/10), within its Ki Points. */
function wagerMax(actor, ally = false) {
  const sys = actor.system;
  const stamina = ((actor.type === "adversary") && sys.adversary?.staminaPays) ? (sys.adversary.stamina ?? 0) : 0;
  return Math.max(0, Math.min(Math.floor(sys.capacity.max / (ally ? 10 : 2)), sys.ki.value + stamina));
}

/** Button "Apostar" on the duel card: the Ki Wager of the next Duel Clash (kept hidden until all are in). */
export async function commitDuelWager(message, side, helperUuid = "") {
  const duel = message.getFlag(FLAG, "duel");
  if ( !duel || duel.done || !["a", "b"].includes(side) ) return;
  const ally = !!helperUuid;
  const pendingNow = ally ? duel.pending.help?.[hk(helperUuid)] : duel.pending[side];
  if ( (pendingNow !== null) && (pendingNow !== undefined) ) return ui.notifications.info(L("DBU.Duel.AlreadyWagered"));
  const actor = await fromUuid(ally ? helperUuid : duel[side].actorUuid);
  if ( !actor?.isOwner ) return ui.notifications.warn(L("DBU.Notify.NotOwner"));
  const max = wagerMax(actor, ally);
  const n = duel.clashes.filter(c => !c.redo).length + 1;
  const data = await DialogV2.wait({
    window: { title: L("DBU.Duel.WagerTitle", { n }) },
    content: `<div class="dbu-dialog"><p>${L(ally ? "DBU.Duel.WagerHintAlly" : "DBU.Duel.WagerHint", { max })}</p>
      <div class="form-group"><label>Ki Wager</label><input type="number" name="wager" value="0" min="0" max="${max}" step="1" autofocus></div></div>`,
    buttons: [
      { action: "ok", label: L("DBU.Duel.Commit"), default: true, callback: (e, b) => new (FDE())(b.form).object },
      { action: "cancel", label: L("Cancel") }
    ],
    rejectClose: false
  });
  if ( !data || (data === "cancel") ) return;
  const wager = Math.clamp(Math.floor(Number(data.wager) || 0), 0, max);
  if ( game.user.isGM ) return applyDuelWager(message.id, side, wager, helperUuid);
  emitGM("duelWager", { messageId: message.id, side, wager, helper: helperUuid });
}

let queue = Promise.resolve();
const runQueued = fn => {
  queue = queue.then(fn).catch(console.error);
  return queue;
};

/** GM: record a Ki Wager; with everyone in, roll the Duel Clash. Runs one at a time. */
export function applyDuelWager(messageId, side, wager, helperUuid = "") {
  return runQueued(() => recordWager(messageId, side, wager, helperUuid));
}
/** GM side of the socket actions. */
export const applyDuelEscape = messageId => runQueued(() => resolveEscape(messageId));
export const applyDuelJoin = (messageId, side, helper) => runQueued(() => recordJoin(messageId, side, helper));

async function recordWager(messageId, side, wager, helperUuid) {
  const message = game.messages.get(messageId);
  const duel = foundry.utils.deepClone(message?.getFlag(FLAG, "duel"));
  if ( !duel || duel.done ) return;
  if ( helperUuid ) {
    const key = hk(helperUuid);
    if ( !(key in (duel.pending.help ?? {})) || (duel.pending.help[key] !== null) ) return;
    duel.pending.help[key] = wager;
  }
  else {
    if ( duel.pending[side] !== null ) return;
    duel.pending[side] = wager;
  }
  // The first Ki Wager starts the Duel: the attacker can no longer escape it and gets its Ki Wager back
  await beginDuel(duel);
  const allIn = (duel.pending.a !== null) && (duel.pending.b !== null)
    && Object.values(duel.pending.help ?? {}).every(v => v !== null);
  if ( allIn ) await resolveClash(message, duel);
  else await saveDuel(message, duel);
}

/**
 * A Duel Clash roll: the higher of Force and Magic, the Initiating Attack's Wound dice and bonuses, the Ki Wager, and
 * a United Duel's allies (+1(T) each and their Ki Wagers).
 */
async function rollDuelClash(actor, side, wager, n, { allies = 0, allyWager = 0 } = {}) {
  const sys = actor.system;
  const T = sys.top.current;
  const fo = sys.attributes.fo.mod;
  const ma = sys.attributes.ma.mod;
  const w = sys.rolls.wound[side.foundation] ?? sys.rolls.wound.energy;
  const states = ["raging", "mindful"].filter(k => (sys._effectiveStates?.[k] ?? 0) > 0).length;
  // Stacks that raise the Wound Rolls: Power, and split resources placed on the Wound Roll (Battle Born...)
  const stacks = (sys.combat.power ?? 0) + (sys.resources ?? []).reduce((t, r) => t + (r.split ? (r.alloc?.wound ?? 0) : 0), 0);
  const parts = [
    { label: L(DBU.attributes[(ma > fo) ? "ma" : "fo"]), value: Math.max(fo, ma) },
    { label: L("DBU.Attack.Charges"), value: 2 * T * side.charges },
    { label: "Power Shot", value: T * side.powerShot },
    { label: "Super Stacks", value: T * (sys.superStacks ?? 0) },
    { label: L("DBU.Duel.States"), value: T * states },
    { label: L("DBU.Duel.Stacks"), value: T * stacks },
    { label: L("DBU.Duel.Allies", { n: allies }), value: T * allies },
    { label: "Ki Wager", value: wager },
    { label: L("DBU.Duel.AllyWager"), value: allyWager }
  ].filter(p => p.value);
  const r = await dbuRoll({
    actor, kind: "clash", title: L("DBU.Duel.ClashTitle", { n }), subtitle: side.name, diceGroups: w.dice, parts,
    critTarget: side.cutting ? 5 : w.crit, botchRange: w.botch, critDice: w.critDice, botchPenalty: w.botchPenalty, toMessage: false
  });
  const detail = [`1d10 ${r.natural}`, ...r.extra.map(e => `${e.formula} ${e.total}`), ...parts.map(p => `${p.label} ${p.value}`)];
  if ( r.critRoll ) detail.push(`${L("DBU.Roll.CritDice")} ${r.critRoll.total}`);
  return { total: r.total, natural: r.natural, crit: r.crit, botch: r.botch, wager: wager + allyWager, detail: detail.join(" · ") };
}

/** Spend a Ki Wager: Ki Points only (a Duel's Ki Wagers do not reduce the Capacity), Narrative Stamina first. */
async function spendWager(actor, wager) {
  if ( !(wager > 0) || !actor ) return;
  const sys = actor.system;
  const pay = staminaPayment(actor, wager);
  const upd = { "system.ki.value": Math.max(0, sys.ki.value - pay.fromKi) };
  if ( pay.fromStamina ) upd["system.adversary.stamina"] = sys.adversary.stamina - pay.fromStamina;
  await actor.update(upd);
}

async function resolveClash(message, duel) {
  const A = await fromUuid(duel.a.actorUuid);
  const B = await fromUuid(duel.b.actorUuid);
  if ( !A || !B ) return;
  const n = duel.clashes.filter(c => !c.redo).length + 1;
  const help = duel.pending.help ?? {};
  const allyWager = s => (duel.helpers?.[s] ?? []).reduce((t, h) => t + (help[hk(h.actorUuid)] ?? 0), 0);
  const ra = await rollDuelClash(A, duel.a.attack, duel.pending.a, n, { allies: duel.helpers?.a?.length ?? 0, allyWager: allyWager("a") });
  const rb = await rollDuelClash(B, duel.b.attack, duel.pending.b, n, { allies: duel.helpers?.b?.length ?? 0, allyWager: allyWager("b") });
  const winner = (ra.total > rb.total) ? "a" : ((rb.total > ra.total) ? "b" : "tie");
  const entry = { n, winner, a: ra, b: rb };
  const reset = () => {
    duel.pending = { a: null, b: null, help: Object.fromEntries(Object.keys(help).map(k => [k, null])) };
  };
  // A tie before the third Duel Clash: the Ki Wagers come back (they were never spent) and the Duel Clash is redone
  if ( (winner === "tie") && (n < 3) ) {
    entry.redo = true;
    duel.clashes.push(entry);
    reset();
    return saveDuel(message, duel);
  }
  await spendWager(A, duel.pending.a);
  await spendWager(B, duel.pending.b);
  for ( const h of [...(duel.helpers?.a ?? []), ...(duel.helpers?.b ?? [])] ) await spendWager(await fromUuid(h.actorUuid), help[hk(h.actorUuid)]);
  duel.wagered += duel.pending.a + duel.pending.b + Object.values(help).reduce((t, w) => t + (w ?? 0), 0);
  if ( winner !== "tie" ) {
    duel.wins[winner] += 1;
    // The winner of each Duel Clash pushes the meeting point towards the other
    duel.point = Math.clamp(duel.point + ((winner === "a") ? 0.17 : -0.17), 0.12, 0.88);
  }
  duel.clashes.push(entry);
  reset();
  if ( n >= 3 ) {
    duel.done = true;
    duel.result = (duel.wins.a >= 2) ? "a" : ((duel.wins.b >= 2) ? "b" : "tie");
    if ( duel.result !== "tie" ) duel.point = (duel.result === "a") ? 1 : 0;
  }
  await saveDuel(message, duel);
  if ( duel.done ) await finishDuel(message, duel, A, B);
}

/* -------------------------------------------- */
/*  The end of the Duel                         */
/* -------------------------------------------- */

async function finishDuel(message, duel, A, B) {
  const lines = [];
  const everyone = [];
  for ( const p of participants(duel) ) {
    const actor = await fromUuid(p.actorUuid);
    if ( actor ) everyone.push({ ...p, actor });
  }
  // Every Character in the Duel ends with no Capacity
  for ( const p of everyone ) await p.actor.update({ "system.capacity.value": 0 });
  const { applyAttackDamage, rollWound, updateAttackCard, executeAttack, computeDamage, applyDamageToActor } = await import("./attack.mjs");
  // The attack card: its rows in the Duel are settled by the Duel (the others keep going as usual)
  const attackMessage = game.messages.get(duel.attackMessageId);
  const attack = foundry.utils.deepClone(attackMessage?.getFlag(FLAG, "attack"));
  if ( attack ) {
    for ( const t of attack.targets ) {
      if ( (t.duel === message.id) && !t.result ) {
        t.result = "duel";
        t.defense = { mode: (duel.result === "tie") ? L("DBU.Duel.TieShort") : L("DBU.Duel.Winner", { name: duel[duel.result]?.name ?? "?" }) };
      }
    }
    await updateAttackCard(attackMessage, attack);
  }
  if ( (duel.result === "a") || (duel.result === "b") ) {
    const win = duel.result;
    const lose = (win === "a") ? "b" : "a";
    const winner = (win === "a") ? A : B;
    const losers = everyone.filter(p => p.side === lose);
    lines.push(L("DBU.Duel.Won", { name: duel[win].name, other: losers.map(p => p.name).join(", "), wager: duel.wagered }));
    const side = duel[win].attack;
    if ( side.power ) {
      // Power Duel: the Might plus every Ki Wager is the Wound Roll's Dice Score; the loser becomes Shaken
      const wound = winner.system.aptitudes.might + duel.wagered;
      const fake = { name: L("DBU.Duel.Power"), profile: "simple", profiles: ["simple"], category: 1, wound: { total: wound } };
      for ( const p of losers ) {
        const res = computeDamage(p.actor, fake, winner, null);
        await applyDamageToActor(p.actor, res.damage, { attacker: winner, attack: fake,
          lines: [L("DBU.Duel.PowerWound", { n: wound }), ...res.lines] });
        if ( (p.actor.system.life.value > 0) && !(p.actor.system.conditions.shaken > 0) ) {
          await safeUpdate(p.actor, { "system.conditions.shaken": 1 });
          lines.push(L("DBU.Duel.Shaken", { name: p.name, other: winner.name }));
        }
      }
    }
    else {
      // The winner's Initiating Attack hits every Character on the other side, with every Ki Wager of the Duel
      const targets = losers.map(p => ({ tokenUuid: p.tokenUuid, actorUuid: p.actorUuid, name: p.name, img: p.img }));
      const result = await executeAttack(winner, { signatureId: side.signatureId, profile: side.profile, foundation: side.foundation,
        duel: { charges: side.charges, wager: duel.wagered, targets, extraProfiles: side.profiles,
          extraWoundT: 2 * (side.extraPowerShot ?? 0), name: side.name } });
      if ( result ) {
        await rollWound(result);
        for ( let i = 0; i < targets.length; i++ ) await applyAttackDamage(game.messages.get(result.id), i);
      }
    }
  }
  else if ( duel.result === "tie" ) {
    // A tie on the third Duel Clash: everyone loses 1/2 of all the Ki wagered in Life Points
    const loss = Math.floor(duel.wagered / 2);
    lines.push(L("DBU.Duel.Tie", { n: loss }));
    for ( const p of everyone ) {
      await p.actor.update({ "system.life.value": Math.max(0, p.actor.system.life.value - loss) }, { dbuSelfInflicted: true });
    }
  }
  lines.push(L("DBU.Duel.CapacityZero"));
  await postInfoCard({ actor: (duel.result === "b") ? B : A, title: L("DBU.Duel.EndTitle"), lines });
}

/* -------------------------------------------- */
/*  The duel card                               */
/* -------------------------------------------- */

async function saveDuel(message, duel) {
  const content = await renderDuel(duel);
  return message.update({ content, [`flags.${FLAG}.duel`]: duel });
}

function renderDuel(duel) {
  const help = duel.pending?.help ?? {};
  const side = k => {
    const s = duel[k];
    const allies = (duel.helpers?.[k] ?? []).map(h => ({ ...h, waiting: !duel.done && (help[hk(h.actorUuid)] === null),
      ready: !duel.done && (help[hk(h.actorUuid)] !== null) && (help[hk(h.actorUuid)] !== undefined) }));
    return { ...s, key: k, wins: duel.wins[k], waiting: !duel.done && (duel.pending[k] === null),
      ready: !duel.done && (duel.pending[k] !== null), charges: s.attack.charges, attackName: s.attack.name, allies };
  };
  const clashes = duel.clashes.map(c => ({ ...c, label: c.redo ? L("DBU.Duel.Redo")
    : ((c.winner === "tie") ? L("DBU.Duel.TieShort") : duel[c.winner].name) }));
  const n = duel.clashes.filter(c => !c.redo).length + 1;
  let result = "";
  if ( duel.done ) {
    if ( duel.result === "tie" ) result = L("DBU.Duel.TieShort");
    else if ( duel.result === "escaped" ) result = L("DBU.Duel.Escaped", { name: duel.a.name });
    else result = L("DBU.Duel.Winner", { name: duel[duel.result].name });
  }
  const escape = duel.escape ? L(duel.escape.won ? "DBU.Duel.EscapeWonShort" : "DBU.Duel.EscapeLostShort", duel.escape) : "";
  return foundry.applications.handlebars.renderTemplate("systems/dbu-rpg/templates/chat/duel-card.hbs", {
    sides: [side("a"), side("b")], clashes, next: Math.min(3, n), done: duel.done, result, wagered: duel.wagered,
    canEscape: !duel.done && !duel.started && !duel.escape, attackerUuid: duel.a.actorUuid, escape
  });
}
