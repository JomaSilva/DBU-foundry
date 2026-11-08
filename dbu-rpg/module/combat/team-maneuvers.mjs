/**
 * Package RB (round 22): the team Maneuvers of the rules (dbu-rpg.com/actions-maneuvers), run from the attack card.
 *
 * - United Attack [Instant, 1/Round]: an Ally adjacent to the attacker spends 1 Action and the Ki Points of the same
 *   Profile for themself (± "kpCost.use.unitedattack"): the attack's Wound Roll gets 1/2 of their Force Modifier (Magic
 *   for a Magic Attack) and the Ki Wager they add (up to 1/4 of their Max Capacity). The Advantages of their Signature
 *   stay with the table (a card line says so).
 * - Intervene [Counter]: an Ally of a hit target, not at Long Range from it and not a target of that attack, spends 1
 *   Counter Action and the option's Ki Points (± "kpCost.use.intervene"): Defense Wall [0] takes the target's place
 *   (Damage beyond their Life Points goes to that Ally, reduced by its Soak and DR as usual); Deflect [2(bT)] makes a
 *   Might Clash against the attacker (−1(T) per Energy Charge or rank of Power Shot): won, the attack misses every target;
 *   lost, they take the target's place and the Damage Category rises by 1; Distant Deflect [8(bT)]: the same Clash, and
 *   a lost one changes nothing. Once per Ally and attack. Moving next to the Ally stays with the player.
 * - Reflect [Out-of-Sequence, 5(T) ± "kpCost.use.reflect"]: who avoided an Energy / Magic attack without an AoE through
 *   Parry, or deflected it through Intervene, rolls Strike against an Opponent they target with the attack's Profile: a
 *   new attack card whose Wound Roll the original attacker makes (with its Ki Wager and Energy Charges).
 *
 * Each use fires "maneuverUsed" (@via_unitedattack / @via_intervene / @via_reflect, through noteItemUse: the actor's
 * item of that name when it has one) and the usual "opponentManeuver" / "allyManeuver".
 */
import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { LONG_RANGE } from "../rules/height.mjs";
import { distanceBetween } from "../rules/versus.mjs";

const L = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const FLAG = "dbu-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const bucket = (actor, key) => Number(actor?.system?.buckets?.[key]?.total ?? 0) || 0;
const asActor = d => ((d?.documentName === "Token") ? d.actor : d) ?? null;

/** The Characters of the attack's encounter (actors, with their token disposition). */
async function encounterCharacters(actor) {
  const { encounterOf } = await import("./triggers.mjs");
  const combat = encounterOf(actor);
  if ( !combat ) return [];
  const out = [];
  const seen = new Set();
  for ( const cb of combat.combatants ) {
    const a = cb.actor;
    if ( !a || seen.has(a.uuid) || cb.isDefeated ) continue;
    seen.add(a.uuid);
    out.push({ actor: a, disposition: cb.token?.disposition ?? 0 });
  }
  return out;
}
const dispositionIn = (list, actor) => list.find(e => e.actor.uuid === actor?.uuid)?.disposition ?? 0;

/** One of the user's eligible Characters: the only one, else a controlled token's, else the assigned one, else asked. */
async function pickHelper(candidates, title) {
  if ( !candidates.length ) return null;
  if ( candidates.length === 1 ) return candidates[0];
  const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(t => t.actor?.uuid).filter(Boolean);
  const mine = candidates.find(a => controlled.includes(a.uuid)) ?? candidates.find(a => a.uuid === game.user.character?.uuid);
  if ( mine ) return mine;
  const content = `<div class="form-group"><label>${L("DBU.Team.Who")}</label><select name="who">${candidates
    .map(a => `<option value="${a.uuid}">${esc(a.name)}</option>`).join("")}</select></div>`;
  const data = await foundry.applications.api.DialogV2.prompt({ window: { title }, content, rejectClose: false,
    ok: { label: L("DBU.Team.Go"), callback: (ev, button) => new foundry.applications.ux.FormDataExtended(button.form).object } });
  return data?.who ? (candidates.find(a => a.uuid === data.who) ?? null) : null;
}

/** Pay a trigger-style cost ("ki:6; actions:1"): the text paid, or null when it cannot be paid (a warning says why). */
async function pay(actor, cost, name) {
  if ( !cost ) return "";
  const T = await import("./triggers.mjs");
  const plan = T.triggerCostPlan(actor, cost, {});
  if ( plan.problems.length ) {
    ui.notifications.warn(L("DBU.Use.CantPay", { name, why: plan.problems.join(" ") }));
    return null;
  }
  return (await T.payTriggerCost(actor, plan)) || "";
}

/** NM5: is this Character the one whose technique the attack's Copied Technique is (its name or uuid)? */
const copySourceOf = (attack, a) => {
  const from = String(attack?.copiedFrom ?? "").trim().toLowerCase();
  return (from && a && [a.uuid, a.id, a.name].filter(Boolean).map(x => String(x).toLowerCase()).includes(from)) ? 1 : 0;
};

/** "maneuverUsed" for a rules Maneuver (the actor's item of that name when it has one). */
async function noteUse(actor, name, maneuverType, actionCost) {
  const T = await import("./triggers.mjs");
  const item = T.itemNamed(actor, name) ?? { name, type: "maneuver", system: { maneuverType, actionCost } };
  await T.noteItemUse(actor, item).catch(err => console.error("DBU | team maneuver use", err));
}

/** Has any Damage of the attack been applied? */
const damaged = attack => (attack.targets ?? []).some(t => (t.damage !== null) && (t.damage !== undefined));

/**
 * The usable pieces of an actor for one of the team targets (their condition sees `scope`; their limit counted when
 * spent): "intervene.noCounter" / "intervene.noCounterFor", "united.noAction" / "unitedBy.noAction", "united.wound",
 * "unitedBy.charges", "reflect.strike".
 */
async function teamPieces(actor, target, scope) {
  if ( !actor ) return [];
  const { optionPieces } = await import("../rules/options.mjs");
  try { return optionPieces(actor, target, scope); } catch(err) { console.error("DBU | team pieces", err); return []; }
}
async function pieceTotal(actor, pieces, scope) {
  const { pieceValue } = await import("../rules/options.mjs");
  return pieces.reduce((t, p) => t + (Number(pieceValue(actor, p, scope, 1)) || 0), 0);
}
async function spendPieces(actor, pieces) {
  const { useTriggerLimit } = await import("./triggers.mjs");
  const seen = new Set();
  for ( const p of pieces ) {
    if ( !String(p.limit ?? "").trim() || seen.has(p.useKey) ) continue;
    seen.add(p.useKey);
    await useTriggerLimit(actor, { limit: p.limit, ctx: p.ctx }, p.useKey).catch(() => null);
  }
}
const pieceNames = pieces => [...new Set(pieces.map(p => p.label || p.own).filter(Boolean))].join(", ");
async function vsOf(self, other) {
  const { versusData } = await import("../rules/versus.mjs");
  try { return versusData(self, other); } catch(err) { return {}; }
}

/* -------------------------------------------- */
/*  United Attack                               */
/* -------------------------------------------- */

/** May an attack card still be joined (United Attack)? */
export function unitedOpen(attack) {
  return !!attack && !attack.nullified && !attack.reflected && !attack.duelOnly && !damaged(attack) && ((attack.targets ?? []).length > 0);
}

/** Button "United Attack": one of the user's Characters adjacent to the attacker joins the attack. */
export async function unitedAttack(message) {
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  if ( !unitedOpen(attack) ) return ui.notifications.info(L("DBU.Team.UnitedClosed"));
  const attacker = asActor(await fromUuid(attack.attackerUuid));
  if ( !attacker ) return;
  const chars = await encounterCharacters(attacker);
  const side = dispositionIn(chars, attacker);
  const { encounterOf } = await import("./triggers.mjs");
  const combat = encounterOf(attacker);
  const usedNow = a => { const f = a.getFlag(FLAG, "unitedUsed"); return !!f && combat && (f.combat === combat.id) && (f.round === combat.round); };
  // (the attack's variables for the pieces' conditions: @signature, @physical..., @unitedCount: who joined before)
  const { attackScope } = await import("./attack.mjs");
  const atkScope = { ...attackScope(attack), unitedCount: (attack.united ?? []).length };
  const freeFor = async a => [...(await teamPieces(a, "united.noAction", { ...atkScope, vs: await vsOf(a, attacker) })).map(p => [a, p]),
    ...(await teamPieces(attacker, "unitedBy.noAction", { ...atkScope, copySource: copySourceOf(attack, a), vs: await vsOf(attacker, a) })).map(p => [attacker, p])];
  const candidates = [];
  for ( const e of chars ) {
    if ( !e.actor.isOwner || (e.actor.uuid === attacker.uuid) || !side || (e.disposition !== side) ) continue;
    if ( (distanceBetween(e.actor, attacker) > 1) || usedNow(e.actor) || (attack.united ?? []).some(u => u.uuid === e.actor.uuid) ) continue;
    if ( ((e.actor.system.combat?.actions ?? 0) < 1) && !(await freeFor(e.actor)).length ) continue;
    candidates.push(e.actor);
  }
  if ( !candidates.length ) return ui.notifications.warn(L("DBU.Team.NoUnited"));
  const helper = await pickHelper(candidates, L("DBU.Team.United"));
  if ( !helper ) return;
  const hs = helper.system;
  // RB pieces: no Action spent (the joiner's "united.noAction" or the attacker's "unitedBy.noAction"), + Wound
  // ("united.wound"), + Energy Charges for the attacker ("unitedBy.charges")
  const free = (await freeFor(helper))[0] ?? null;
  const woundPieces = await teamPieces(helper, "united.wound", { ...atkScope, vs: await vsOf(helper, attacker) });
  const chargePieces = await teamPieces(attacker, "unitedBy.charges", { ...atkScope, vs: await vsOf(attacker, helper) });
  const extraWound = await pieceTotal(helper, woundPieces, { ...atkScope });
  const extraCharges = Math.max(0, Math.floor(await pieceTotal(attacker, chargePieces, { ...atkScope })));
  const { profileKpFor } = await import("./attack.mjs");
  const kp = (bucket(helper, "kpCost.useFree.unitedattack") > 0) ? 0
    : Math.max(0, Math.floor(profileKpFor(helper, attack.profile, attack.foundation) + bucket(helper, "kpCost.use.unitedattack")));
  const attrKey = (attack.foundation === "magic") ? "ma" : "fo";
  const bonus = Math.floor((hs.attributes?.[attrKey]?.mod ?? 0) / 2);
  const maxWager = Math.max(0, Math.floor((hs.capacity?.max ?? 0) / 4));
  const content = `<p>${L("DBU.Team.UnitedText", { name: esc(helper.name), kp, bonus, attr: L(DBU.attributes[attrKey]) })}</p>
    <div class="form-group"><label>${L("DBU.Team.UnitedWager", { max: maxWager })}</label>
    <input type="number" name="wager" value="0" min="0" max="${maxWager}" step="1"></div>`;
  const data = await foundry.applications.api.DialogV2.prompt({ window: { title: `${L("DBU.Team.United")} — ${attack.name}` }, content,
    rejectClose: false, ok: { label: L("DBU.Team.Go"), callback: (ev, button) => new foundry.applications.ux.FormDataExtended(button.form).object } });
  if ( !data ) return;
  const wager = Math.max(0, Math.min(maxWager, Math.floor(Number(data.wager) || 0)));
  const paid = await pay(helper, [(kp + wager) ? `ki:${kp + wager}` : "", free ? "" : "actions:1"].filter(Boolean).join("; "), L("DBU.Team.United"));
  if ( paid === null ) return;
  if ( free ) await spendPieces(free[0], [free[1]]);
  await spendPieces(helper, woundPieces);
  await spendPieces(attacker, chargePieces);
  if ( combat ) await helper.setFlag(FLAG, "unitedUsed", { combat: combat.id, round: combat.round });
  const add = bonus + wager + Math.floor(extraWound);
  const label = L("DBU.Team.UnitedLabel", { name: helper.name });
  // (re-read: another click may have changed the card meanwhile)
  const fresh = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  if ( add ) {
    if ( fresh.wound ) fresh.wound = { ...fresh.wound, total: (fresh.wound.total ?? 0) + add };
    else fresh.extraWound = [...(fresh.extraWound ?? []), { label, value: add }];
  }
  // (Energy Charges before the Wound Roll join the attack; after it, their dice are rolled now: bumpStoredWound)
  if ( extraCharges && !fresh.wound ) fresh.charges = (fresh.charges ?? 0) + extraCharges;
  fresh.united = [...(fresh.united ?? []), { uuid: helper.uuid, name: helper.name, add, wager }];
  const notes = [L("DBU.Team.UnitedNote", { name: helper.name, n: add, wager }),
    ...(free ? [L("DBU.Team.NoActionSpent", { what: pieceNames([free[1]]) })] : []),
    ...(extraCharges ? [L("DBU.Team.UnitedCharges", { n: extraCharges, what: pieceNames(chargePieces) })] : []),
    ...(helper.items.some(i => i.type === "signature") ? [L("DBU.Team.UnitedAdvantages", { n: hs.top?.base ?? 1 })] : [])];
  fresh.notes = [...(fresh.notes ?? []), ...notes];
  const { updateAttackCard, bumpStoredWound } = await import("./attack.mjs");
  await updateAttackCard(message, fresh);
  if ( extraCharges && fresh.wound ) await bumpStoredWound(message.id, { charges: extraCharges, label: pieceNames(chargePieces) });
  await noteUse(helper, "United Attack Maneuver", "Instant", "N/A");
  await postInfoCard({ actor: helper, title: L("DBU.Team.United"), subtitle: attack.name,
    lines: [...notes, paid ? L("DBU.Use.Paid", { cost: paid }) : ""].filter(Boolean) });
}

/* -------------------------------------------- */
/*  Intervene                                   */
/* -------------------------------------------- */

/** May someone Intervene for this target row? */
export function interveneOpen(attack, t) {
  return !!attack && !!t && !attack.nullified && (t.result === "hit") && !t.intervened && !attack.deflected
    && ((t.damage === null) || (t.damage === undefined));
}

const INTERVENE = { wall: { cost: 0, key: "DefenseWall" }, deflect: { cost: 2, key: "Deflect" }, distant: { cost: 8, key: "DistantDeflect" } };

/** Button "Intervene" on a hit target's row. */
export async function intervene(message, index) {
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  const t = attack?.targets?.[index];
  if ( !interveneOpen(attack, t) ) return ui.notifications.info(L("DBU.Team.InterveneClosed"));
  const ally = asActor(await fromUuid(t.tokenUuid ?? t.actorUuid));
  const attacker = asActor(await fromUuid(attack.attackerUuid));
  if ( !ally || !attacker ) return;
  const chars = await encounterCharacters(ally);
  const side = dispositionIn(chars, ally);
  const targeted = new Set();
  for ( const x of attack.targets ) { const a = asActor(await fromUuid(x.tokenUuid ?? x.actorUuid)); if ( a ) targeted.add(a.uuid); }
  // RB pieces: no Counter Action spent (the one who steps in: "intervene.noCounter", @vs = the Ally; the Ally:
  // "intervene.noCounterFor", @vs = the one who steps in), seen with the option (@wall / @deflect / @distant) and the
  // attack's variables (@physical, @energy...)
  const { attackScope } = await import("./attack.mjs");
  const atkScope = attackScope(attack);
  const freeFor = async (a, option = null) => {
    const opts = option ? [option] : Object.keys(INTERVENE);
    const out = [];
    for ( const k of opts ) {
      // (F15 @attackerVs: the attacker as the one who steps in sees it)
      const sc = { ...atkScope, wall: 0, deflect: 0, distant: 0, [k]: 1, attackerVs: await vsOf(a, attacker) };
      out.push(...(await teamPieces(a, "intervene.noCounter", { ...sc, vs: await vsOf(a, ally) })).map(p => [a, p, k]),
        ...(await teamPieces(ally, "intervene.noCounterFor", { ...sc, vs: await vsOf(ally, a) })).map(p => [ally, p, k]));
    }
    return out;
  };
  const candidates = [];
  for ( const e of chars ) {
    if ( !e.actor.isOwner || targeted.has(e.actor.uuid) || !side || (e.disposition !== side) ) continue;
    if ( distanceBetween(e.actor, ally) >= LONG_RANGE ) continue;
    if ( ((e.actor.system.combat?.counters ?? 0) < 1) && !(await freeFor(e.actor)).length ) continue;
    candidates.push(e.actor);
  }
  if ( !candidates.length ) return ui.notifications.warn(L("DBU.Team.NoIntervene"));
  const helper = await pickHelper(candidates, L("DBU.Team.Intervene"));
  if ( !helper ) return;
  const bT = helper.system.top?.base ?? 1;
  const extra = bucket(helper, "kpCost.use.intervene");
  const kpFree = bucket(helper, "kpCost.useFree.intervene") > 0;
  const costOf = k => (kpFree ? 0 : Math.max(0, Math.floor(INTERVENE[k].cost * bT + (INTERVENE[k].cost ? extra : 0))));
  const ki = helper.system.ki?.value ?? 0;
  const hasCounter = (helper.system.combat?.counters ?? 0) >= 1;
  const freeOpts = new Set((await freeFor(helper)).map(f => f[2]));
  const options = Object.keys(INTERVENE).map(k => `<label class="checkbox"><input type="radio" name="option" value="${k}" ${k === "wall" ? "checked" : ""}
    ${((costOf(k) > ki) || (!hasCounter && !freeOpts.has(k))) ? "disabled" : ""}> ${L(`DBU.Team.${INTERVENE[k].key}`)} (${costOf(k)} KP${freeOpts.has(k)
      ? `, ${L("DBU.Team.NoCounterShort")}` : ""})</label>`).join("<br>");
  const content = `<p>${L("DBU.Team.InterveneText", { name: esc(helper.name), ally: esc(ally.name), attack: esc(attack.name) })}</p>${options}
    <p class="hint">${L("DBU.Team.InterveneHint")}</p>`;
  const data = await foundry.applications.api.DialogV2.prompt({ window: { title: `${L("DBU.Team.Intervene")} — ${ally.name}` }, content,
    rejectClose: false, ok: { label: L("DBU.Team.Go"), callback: (ev, button) => new foundry.applications.ux.FormDataExtended(button.form).object } });
  const option = data?.option;
  if ( !INTERVENE[option] ) return;
  const kp = costOf(option);
  const free = (await freeFor(helper, option))[0] ?? null;
  const paid = await pay(helper, [kp ? `ki:${kp}` : "", free ? "" : "counters:1"].filter(Boolean).join("; "), L("DBU.Team.Intervene"));
  if ( paid === null ) return;
  if ( free ) await spendPieces(free[0], [free[1]]);
  await noteUse(helper, "Intervene Maneuver", "Counter", free ? "N/A" : "1 Counter");
  const lines = [L("DBU.Team.InterveneUsed", { name: helper.name, ally: ally.name, what: L(`DBU.Team.${INTERVENE[option].key}`) })];
  if ( free ) lines.push(L("DBU.Team.NoCounterSpent", { what: pieceNames([free[1]]) }));
  if ( paid ) lines.push(L("DBU.Use.Paid", { cost: paid }));
  // The Might Clash of the Deflect options (−1(T) per Energy Charge or rank of Power Shot of the attack)
  let won = null;
  if ( option !== "wall" ) {
    const { resolveClash } = await import("./clash.mjs");
    const shots = (attack.charges ?? 0) + (attack.powerShot ?? 0) + (Number(attack.vars?.opt_powerShot) || 0);
    const T = helper.system.top?.current ?? 1;
    const r = await resolveClash(helper, attacker, { mine: "might", theirs: "might", via: "deflect", label: `${L("DBU.Team.Intervene")}: ${L(`DBU.Team.${INTERVENE[option].key}`)}`,
      extra: shots ? [{ label: L("DBU.Team.DeflectPenalty"), value: -shots * T }] : [] });
    won = !!r?.won;
  }
  const fresh = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  const row = fresh.targets[index];
  const takePlace = async () => {
    const tok = helper.token ?? helper.getActiveTokens?.()?.[0]?.document ?? null;
    fresh.targets[index] = { ...row, tokenUuid: tok?.uuid ?? null, actorUuid: helper.uuid, name: helper.name, img: tok?.texture?.src ?? helper.img,
      defense: { mode: "intervene", ...(free ? { free: 1, freeFx: String(free[1]?.fx ?? "") } : {}) }, dimApplied: true,
      intervened: { by: helper.name, byUuid: helper.uuid, forName: ally.name, forUuid: row.tokenUuid ?? row.actorUuid, option } };
  };
  if ( option === "wall" ) {
    await takePlace();
    lines.push(L("DBU.Team.WallDone", { name: helper.name, ally: ally.name }));
  }
  else if ( won ) {
    // Deflected away from every target (the ones whose Damage is not applied yet)
    for ( const x of fresh.targets ) {
      if ( (x.damage !== null) && (x.damage !== undefined) ) continue;
      x.result = "miss";
      x.defense = { ...(x.defense ?? {}), mode: L("DBU.Team.Deflected"), noAbsolute: true };
    }
    fresh.deflected = { byUuid: helper.uuid, by: helper.name };
    lines.push(L("DBU.Team.DeflectWon", { name: helper.name }));
  }
  else if ( option === "deflect" ) {
    await takePlace();
    fresh.targets[index].categoryBonus = 1;
    lines.push(L("DBU.Team.DeflectLost", { name: helper.name, ally: ally.name }));
  }
  else {
    fresh.targets[index] = { ...row, intervened: { by: helper.name, byUuid: helper.uuid, forName: ally.name, option } };
    lines.push(L("DBU.Team.DistantLost", { name: helper.name }));
  }
  fresh.notes = [...(fresh.notes ?? []), lines[0]];
  const { updateAttackCard } = await import("./attack.mjs");
  await updateAttackCard(message, fresh);
  await postInfoCard({ actor: helper, title: L("DBU.Team.Intervene"), subtitle: attack.name, lines });
}

/* -------------------------------------------- */
/*  Reflect                                     */
/* -------------------------------------------- */

/** Who may Reflect this attack now: [{ uuid, name }] (Parry avoided it, or Intervene deflected it). */
export function reflectors(attack) {
  if ( !attack || attack.reflected || attack.nullified || !["energy", "magic"].includes(attack.foundation) ) return [];
  if ( attack.vars?.aoe || attack.aoe ) return [];
  const used = new Set(attack.reflectUsed ?? []);
  const out = [];
  for ( const t of attack.targets ?? [] ) {
    if ( (t.result === "miss") && (t.defense?.mode === "parry") ) out.push({ uuid: t.tokenUuid ?? t.actorUuid, name: t.name });
  }
  if ( attack.deflected?.byUuid ) out.push({ uuid: attack.deflected.byUuid, name: attack.deflected.by });
  return out.filter((r, i) => r.uuid && !used.has(r.uuid) && (out.findIndex(x => x.uuid === r.uuid) === i));
}

/** Button "Reflect": roll Strike against the user's target; a new attack card the original attacker's Wound Roll follows. */
export async function reflect(message, uuid) {
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  if ( !reflectors(attack).some(r => r.uuid === uuid) ) return ui.notifications.info(L("DBU.Team.ReflectClosed"));
  const reflector = asActor(await fromUuid(uuid));
  if ( !reflector?.isOwner ) return ui.notifications.warn(L("DBU.Notify.NotOwner"));
  const target = Array.from(game.user.targets ?? []).find(tk => tk.actor && (tk.actor.uuid !== reflector.uuid));
  if ( !target ) return ui.notifications.warn(L("DBU.Team.ReflectTarget"));
  const T = reflector.system.top?.current ?? 1;
  const kp = (bucket(reflector, "kpCost.useFree.reflect") > 0) ? 0 : Math.max(0, Math.floor(5 * T + bucket(reflector, "kpCost.use.reflect")));
  const paid = await pay(reflector, kp ? `ki:${kp}` : "", L("DBU.Team.Reflect"));
  if ( paid === null ) return;
  // RB pieces: + Strike for the Reflect ("reflect.strike"; @vs = the new target, the attack's variables)
  const { attackScope } = await import("./attack.mjs");
  const sc = { ...attackScope(attack), vs: await vsOf(reflector, target.actor) };
  const strikePieces = await teamPieces(reflector, "reflect.strike", sc);
  const extra = [];
  for ( const p of strikePieces ) {
    const { pieceValue } = await import("../rules/options.mjs");
    const v = Number(pieceValue(reflector, p, sc, 1)) || 0;
    if ( v ) extra.push({ label: p.label || p.own || "Reflect", value: v });
  }
  await spendPieces(reflector, strikePieces);
  // The Strike Roll with the initial attack's Profile (its Foundation)
  const r = await reflector.rollCombat("strike", { foundation: attack.foundation, extra, subtitle: `${L("DBU.Team.Reflect")} — ${attack.name}` });
  if ( !r ) return;
  const fresh = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  fresh.reflectUsed = [...(fresh.reflectUsed ?? []), uuid];
  const { updateAttackCard, postAttackMessage } = await import("./attack.mjs");
  await updateAttackCard(message, fresh);
  const copy = foundry.utils.deepClone(attack);
  for ( const k of ["united", "deflected", "reflectUsed", "extraWound"] ) delete copy[k];
  Object.assign(copy, {
    name: `${L("DBU.Team.Reflect")}: ${attack.name}`,
    strike: { total: r.total, natural: r.natural, crit: !!r.crit, botch: !!r.botch },
    wound: null, autoHit: false, noStrike: false, fromDuel: false,
    reflected: { byUuid: reflector.uuid, by: reflector.name, fromMessage: message.id },
    notes: [L("DBU.Team.ReflectNote", { name: reflector.name, attacker: (await fromUuid(attack.attackerUuid))?.name ?? "" })],
    targets: [{ tokenUuid: target.document?.uuid ?? null, actorUuid: target.actor?.uuid ?? null, name: target.name,
      img: target.document?.texture?.src ?? target.actor?.img, result: null, defense: null, damage: null, dimApplied: false }]
  });
  // (the attack's Wound Roll keeps its Ki Wager, Energy Charges and their bonuses: the original attacker rolls it)
  await postAttackMessage(reflector, copy, r);
  await noteUse(reflector, "Reflect Maneuver", "Out-of-Sequence", "N/A");
  if ( paid ) await postInfoCard({ actor: reflector, title: L("DBU.Team.Reflect"), subtitle: attack.name, lines: [L("DBU.Use.Paid", { cost: paid })] });
}
