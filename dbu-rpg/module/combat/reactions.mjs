/**
 * Roll reactions (feature C3): the "roll" triggers of the actor that rolls, applied inside dice/roller.mjs dbuRoll after
 * the dice and before the result is used or posted, then the "rolled" event with the final result (GM side).
 *
 * Variables of both events (rollVariables): @kind_<kind> (strike, dodge, wound, save, skill, clash, steadfast, stress),
 * @combatRoll (Strike, Dodge or Wound), @natural, @rawNatural, @crit, @botch, @critTarget, @botchPenalty, @total, @tn,
 * @success, @thresholdCheck, @inClash, plus the roll's own scope (an attack's variables, @critStrike on its Wound Roll).
 *
 * Effects, only on "roll": reroll (resource "base" = the Base Die again, the default; "all" = every die), natural (±
 * Natural Result, 1–10), naturalSet, rollBonus (+ Dice Score, dice allowed), critical (a Critical Result, not a Botch),
 * succeed (a check with a Target Number counts as a success); "message" is a line on the card.
 * Automatic reactions apply once per roll, in item order. "ask" ones (or with an amount) are buttons of one dialog shown
 * until the player is done; each is used at most once per roll. cost, amount, limit, limitKey and group work as on the
 * option pieces: triggers with one group form ONE button, its amount is the first one's, the costs are summed and paid
 * once, each trigger keeps its condition (with @n) and its limit.
 */
import { evaluate, hasDice, rollExpression, test } from "../rules/formula.mjs";
import { encounterOthers } from "../rules/allies.mjs";
import { possessedAwakenings } from "../rules/awakening.mjs";
import { askAmount, collectTriggers, costPlan, encounterOf, fireEvent, payTriggerCost, triggerLimitKey, triggerUsesLeft,
  useTriggerLimit } from "./triggers.mjs";
import { addRollBonus, forceCritical, rerollAll, rerollBase, setNatural, settleRoll, shiftNatural } from "../dice/roller.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const blank = v => !String(v ?? "").trim();
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** The trigger effects that change a roll (only on the "roll" event). */
export const REACTION_EFFECTS = ["reroll", "natural", "naturalSet", "rollBonus", "critical", "succeed"];
const COMBAT_KINDS = new Set(["strike", "dodge", "wound"]);

/** The formula variables of a roll and its result (numbers only: they travel to the GM with the "rolled" event). */
export function rollVariables(config, result) {
  const kind = config.kind ?? "other";
  const tn = config.target;
  const own = {};
  for ( const [k, v] of Object.entries(config.scope ?? {}) ) {
    if ( (typeof v === "number") || (typeof v === "boolean") ) own[k] = Number(v);
    else if ( v && (typeof v === "object") && !Array.isArray(v) ) own[k] = v;
  }
  return {
    ...own,
    [`kind_${kind}`]: 1, combatRoll: COMBAT_KINDS.has(kind) ? 1 : 0,
    natural: result.natural, rawNatural: result.rawNatural, crit: result.crit ? 1 : 0, botch: result.botch ? 1 : 0,
    critTarget: config.critTarget ?? 10, botchPenalty: config.botchPenalty ?? 0, total: result.total,
    tn: tn ?? 0, success: ((tn !== undefined) && (result.forceSuccess || (result.total >= tn))) ? 1 : 0,
    thresholdCheck: own.thresholdCheck ? 1 : 0,
    // (CS1: the effects that reacted to it, @reacted.<fx ref>: Forged in Battle's Impediment)
    ...(result.reacted ? { reacted: { ...result.reacted } } : {})
  };
}

/** The roll triggers, the copies of a per-Stack choice folded into their first one (times). */
function rollTriggers(actor) {
  const out = [];
  for ( const t of collectTriggers(actor, "roll") ) {
    if ( t.copy && out.length && (triggerLimitKey(out.at(-1)) === triggerLimitKey(t)) ) { out.at(-1).times += 1; continue; }
    out.push({ ...t, times: 1 });
  }
  return out;
}

/** The buttons / automatic applications: one per group, or per trigger. */
function boxesOf(triggers) {
  const boxes = new Map();
  triggers.forEach((t, i) => {
    const key = blank(t.group) ? `t${i}` : `g:${String(t.group).trim()}`;
    let b = boxes.get(key);
    if ( !b ) boxes.set(key, b = { key, pieces: [], ask: false, amount: "" });
    b.pieces.push(t);
    if ( (t.mode === "ask") || !blank(t.amount) ) b.ask = true;
    if ( blank(b.amount) && !blank(t.amount) ) b.amount = t.amount;
  });
  return [...boxes.values()];
}

const pieceData = (base, t, n) => ({ ...base, ...(t.ctx ?? {}), n });
const pieceLabel = t => t.label || t.source;

/** The most @n of a box (its first amount), 0 without one. */
function boxMax(box, base) {
  if ( blank(box.amount) ) return 0;
  const first = box.pieces.find(t => !blank(t.amount)) ?? box.pieces[0];
  return Math.max(0, evaluate(box.amount, pieceData(base, first, 1)));
}

/**
 * Would this piece change nothing? A Critical Result on a roll that already is one; a success on a roll without a
 * Target Number or that already succeeds (it would cost and count for nothing).
 */
function idle(config, base, t) {
  if ( t.effect === "critical" ) return !!base.crit;
  if ( t.effect === "succeed" ) return (config.target === undefined) || !!base.success;
  return false;
}

/** The pieces of a box that apply with this n (condition, a use left, a known effect that changes something). */
function applicable(config, box, base, n) {
  return box.pieces.filter(t => (REACTION_EFFECTS.includes(t.effect) || (t.effect === "message")) && !idle(config, base, t)
    && test(t.condition, pieceData(base, t, n)) && triggerUsesLeft(config.actor, t, triggerLimitKey(t)));
}

/** Can the box be used now (with n = 1 or its most)? */
function usable(config, box, base) {
  const max = boxMax(box, base);
  if ( !blank(box.amount) && (max < 1) ) return false;
  return [1, ...(max > 1 ? [max] : [])].some(n => applicable(config, box, base, n).length);
}

/**
 * KR: an Opponent's "foeGuard.critToBotch" piece (Karmic Reflection, its limit counted on it) turns this Combat Roll's
 * Critical Result into a Botch Result, whatever its Natural Result.
 */
export async function opponentCritToBotch(config, result) {
  const { allyGuards } = await import("../rules/allies.mjs");
  const { triggerUsesLeft, useTriggerLimit } = await import("./triggers.mjs");
  for ( const g of allyGuards(config.actor, "critToBotch", { foe: true }) ) {
    if ( g.limit && !triggerUsesLeft(g.giver, { limit: g.limit }, g.key) ) continue;
    config.noCrit = true;
    config.forceBotch = true;
    await settleRoll(config, result);
    (result.reactionNotes ??= []).push(L("DBU.Reaction.CritToBotch", { label: g.label }));
    if ( g.limit ) {
      if ( g.giver.isOwner ) await useTriggerLimit(g.giver, { limit: g.limit }, g.key);
      else { const { emitGM } = await import("../socket.mjs"); emitGM("useLimit", { actorUuid: g.giver.uuid, limit: g.limit, key: g.key }); }
    }
    return true;
  }
  return false;
}

/** Apply one reaction effect to the result; the text of the change. */
export async function applyEffect(config, result, t, value, label) {
  switch ( t.effect ) {
    case "reroll": {
      const all = String(t.resource ?? "").trim().toLowerCase() === "all";
      // (T25 resource "high": roll it twice and apply the higher result)
      const high = String(t.resource ?? "").trim().toLowerCase() === "high";
      const before = result.total;
      await (all ? rerollAll(config, result) : rerollBase(config, result, { keepHigher: high }));
      return L(all ? "DBU.Reaction.RerollAll" : "DBU.Reaction.Reroll", { before, total: result.total, natural: result.natural });
    }
    case "natural": {
      if ( !value ) return "";
      const before = result.natural;
      await shiftNatural(config, result, value);
      return L("DBU.Reaction.Natural", { before, natural: result.natural });
    }
    case "naturalSet": {
      const before = result.natural;
      await setNatural(config, result, value);
      // NF resource "flat": no Critical nor Botch on this roll, and +1 Dice Score per effect of yours that raises its Natural
      // Result or lowers its Critical Target (Lingering Instincts)
      if ( /\bflat\b/i.test(String(t.resource ?? "")) ) {
        config.noCrit = true;
        config.noBotch = true;
        const kind = String(config.kind ?? "");
        const b = config.actor?.system?.buckets ?? {};
        const count = [...(b["natural.combat"]?.parts ?? []), ...(b[`natural.${kind}`]?.parts ?? [])].filter(p => Number(p.value) > 0).length
          + [...(b["crit.combat"]?.parts ?? []), ...(b[`crit.${kind}`]?.parts ?? [])].filter(p => Number(p.value) < 0).length;
        if ( count ) result.reactionParts = [...(result.reactionParts ?? []), { label: L("DBU.Reaction.FlatBonus"), value: count }];
        await settleRoll(config, result);
      }
      return L("DBU.Reaction.Natural", { before, natural: result.natural });
    }
    case "rollBonus": {
      const before = result.total;
      const formula = hasDice(t.value) ? String(rollExpression(t.value, t._data ?? {})).trim() : "";
      if ( !formula && !value ) return "";
      await addRollBonus(config, result, label, value, formula);
      return L("DBU.Reaction.Bonus", { before, total: result.total });
    }
    case "critical": {
      if ( result.crit ) return "";
      await forceCritical(config, result);
      return L("DBU.Reaction.Critical", { total: result.total });
    }
    case "succeed":
      result.forceSuccess = true;
      return L("DBU.Reaction.Succeed");
    case "message":
      return String(t.value ?? "");
    default: return "";
  }
}

/**
 * Use a box: test its pieces with n, pay the summed cost, count every limit (once per key), apply the effects.
 * @returns {Promise<string[]|null>}  the card lines, null when nothing was applied
 */
async function useBox(config, result, box, n, { auto = false } = {}) {
  const actor = config.actor;
  const base = scopeOf(config, result);
  const pieces = applicable(config, box, base, n);
  if ( !pieces.length ) return null;
  const plan = costPlan(actor, pieces.filter(t => !blank(t.cost)).map(t => ({ cost: t.cost, data: pieceData(base, t, n) })));
  const label = [...new Set(pieces.map(pieceLabel))].join(" + ");
  if ( plan.problems.length ) {
    const why = L("DBU.Trigger.CantPay", { why: plan.problems.join(" ") });
    if ( auto ) return [`${label}: ${why}`];
    ui.notifications.warn(`${label}: ${why}`);
    return null;
  }
  const counted = new Set();
  for ( const t of pieces ) {
    const key = triggerLimitKey(t);
    if ( blank(t.limit) || counted.has(key) ) continue;
    counted.add(key);
    await useTriggerLimit(actor, t, key);
  }
  const paid = plan.empty ? "" : await payTriggerCost(actor, plan);
  // RX: which effects reacted to this roll (@reacted.<fx ref>) and the resources they spent on it (@rollSpent.<kind>.<slug>)
  for ( const t of pieces ) if ( t.fx ) result.reacted = { ...(result.reacted ?? {}), [String(t.fx).toLowerCase()]: 1 };
  for ( const r of plan.res ?? [] ) {
    const slug = String(r.name ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    if ( slug && (Number(r.n) > 0) ) result.rollSpent = { ...(result.rollSpent ?? {}), [slug]: (result.rollSpent?.[slug] ?? 0) + Number(r.n) };
  }
  const texts = [];
  for ( const t of pieces ) {
    // Worked out with the result as it is now (an earlier piece of the box may have changed it)
    const data = pieceData(scopeOf(config, result), t, n);
    const value = evaluate(t.value, data);
    // (F15 "flag.tailAPDouble": the Adaptation Points pieces (group aw2) count twice on a Tail Attack's Wound Roll)
    const twice = ((t.group === "aw2") && (t.effect === "rollBonus") && data.kind_wound && data.via_tailattack
      && ((config.actor?.system?.buckets?.["flag.tailAPDouble"]?.total ?? 0) > 0)) ? 2 : 1;
    for ( let k = 0; k < (t.times ?? 1) * twice; k++ ) {
      const text = await applyEffect(config, result, { ...t, _data: data }, value, pieceLabel(t));
      if ( text ) texts.push(text);
      if ( ["reroll", "naturalSet", "critical", "succeed", "message"].includes(t.effect) ) break;
    }
  }
  if ( paid ) texts.push(L("DBU.Trigger.Paid", { cost: paid }));
  return texts.length ? [L("DBU.Reaction.Applied", { label, what: texts.join(" · ") })] : null;
}

/** The formula data of the reactions: the actor's, the round, the roll's variables. */
function scopeOf(config, result) {
  const actor = config.actor;
  return { ...(actor.system?.rollData ?? {}), round: encounterOf(actor)?.round ?? 0, ...rollVariables(config, result) };
}

/** The dialog of the asked reactions: the result, a button per usable box, Done. */
async function askReactions(config, result, boxes) {
  const lines = [];
  const used = new Set();
  for ( let guard = 0; guard < 50; guard++ ) {
    const base = scopeOf(config, result);
    const open = boxes.filter(b => !used.has(b.key) && usable(config, b, base));
    if ( !open.length ) break;
    const status = [result.crit ? L("DBU.Roll.Critical") : "", result.botch ? L("DBU.Roll.Botch") : "", result.forceSuccess ? L("DBU.Roll.Success") : ""]
      .filter(Boolean).join(" · ");
    const buttonLabel = b => {
      const label = [...new Set(b.pieces.map(pieceLabel))].join(" + ");
      const max = boxMax(b, base);
      const cost = b.pieces.map(t => t.cost).filter(c => !blank(c)).join("; ");
      return [label, max > 1 ? L("DBU.Trigger.UpTo", { max }) : "", cost ? L("DBU.Trigger.CostShort", { cost }) : ""].filter(Boolean).join(" · ");
    };
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: `${L("DBU.Reaction.Title")}: ${config.title ?? ""}`, icon: "fa-solid fa-dice-d10" },
      position: { width: 460 },
      content: `<div class="dbu-dialog"><p><strong>${esc(L("DBU.Reaction.Result", { total: result.total, natural: result.natural }))}</strong>${status ? ` — ${esc(status)}` : ""}</p>
        ${lines.length ? `<ul class="dbu-lines">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}<p class="hint">${esc(L("DBU.Reaction.Hint"))}</p></div>`,
      buttons: [
        ...open.map((b, i) => ({ action: `r${i}`, label: buttonLabel(b), icon: "fa-solid fa-wand-sparkles" })),
        { action: "done", label: L("DBU.Reaction.Done"), icon: "fa-solid fa-check", default: true }
      ],
      rejectClose: false
    });
    const m = /^r(\d+)$/.exec(String(choice ?? ""));
    if ( !m ) break;
    const box = open[Number(m[1])];
    used.add(box.key);
    let n = 1;
    const max = boxMax(box, base);
    if ( !blank(box.amount) ) {
      n = await askAmount(buttonLabel(box), max);
      if ( !n ) { used.delete(box.key); continue; }
    }
    const done = await useBox(config, result, box, n);
    if ( done ) lines.push(...done);
    else used.delete(box.key);
  }
  return lines;
}

/**
 * The reactions of one roll (dice/roller.mjs dbuRoll, on the client that owns the actor), then its "rolled" event.
 * Changes `result` in place; the lines go to result.reactionNotes (the roll card shows them).
 */
export async function rollReactions(config, result) {
  const actor = config.actor;
  const all = rollTriggers(actor);
  if ( all.length ) {
    const notes = [];
    // Reminders (mode "remind"): a line on the card, nothing applied
    for ( const t of all.filter(x => x.mode === "remind") ) {
      if ( !test(t.condition, pieceData(scopeOf(config, result), t, 1)) || !triggerUsesLeft(actor, t, triggerLimitKey(t)) ) continue;
      if ( !blank(t.limit) && !(await useTriggerLimit(actor, t, triggerLimitKey(t))) ) continue;
      notes.push(`${pieceLabel(t)}${(t.effect === "message") && !blank(t.value) ? `: ${t.value}` : ""}`);
    }
    const boxes = boxesOf(all.filter(x => x.mode !== "remind"));
    // Automatic reactions first, once per roll, in item order
    for ( const b of boxes.filter(x => !x.ask) ) {
      const lines = await useBox(config, result, b, 1, { auto: true });
      if ( lines ) notes.push(...lines);
    }
    const asked = boxes.filter(x => x.ask);
    if ( asked.length && asked.some(b => usable(config, b, scopeOf(config, result))) ) notes.push(...await askReactions(config, result, asked));
    if ( notes.length ) result.reactionNotes = [...(result.reactionNotes ?? []), ...notes];
  }
  fireRolled(actor, config.other ?? null, rollVariables(config, result));
  return result;
}

/**
 * L: a roll of a Character of a Combat Encounter is also a moment of the others: "opponentRolled" for its Opponents and
 * "allyRolled" for its Allies (other = who rolled), with the roll's variables (@natural, @botch, @crit, @success,
 * @kind_<kind>, @combatRoll...), @againstMe (1: the roll was made against you: you are its other Character) and
 * @rollerDistance (Squares between you; 99 when unknown). Only those with such triggers are told.
 */
export function fireRollWatchers(config, result) {
  const actor = config.actor;
  if ( !actor?.system ) return;
  let others;
  try { others = encounterOthers(actor); } catch(err) { return; }
  if ( !others.length ) return;
  const vars = rollVariables(config, result);
  for ( const o of others ) {
    const ev = o.ally ? "allyRolled" : (o.opponent ? "opponentRolled" : null);
    // (one Character that cannot be read never stops the others)
    try {
      if ( !ev || !collectTriggers(o.actor, ev).length ) continue;
      const against = (config.other?.uuid === o.actor.uuid) || (config.others ?? []).some(a => a?.uuid === o.actor.uuid);
      fireEvent(o.actor, ev, { other: actor, scope: { ...vars, againstMe: against ? 1 : 0,
        rollerDistance: o.distance } });
    } catch(err) { console.warn("DBU | Roll watchers", err); }
  }
}

/**
 * Actors whose "rolled" triggers are running on this client (the GM's): a roll made meanwhile for that actor (the check of
 * one of those triggers: "check": "steadfast") fires no "rolled" again, so such a trigger cannot set off itself forever.
 */
const ROLLED_RUNNING = new Set();
function fireRolled(actor, other, scope) {
  const key = actor.uuid;
  if ( ROLLED_RUNNING.has(key) ) return;
  ROLLED_RUNNING.add(key);
  let running = null;
  try { running = fireEvent(actor, "rolled", { other, scope }); }
  finally {
    const done = () => ROLLED_RUNNING.delete(key);
    if ( running && (typeof running.then === "function") ) running.then(done, done);
    else done();
  }
}

/* -------------------------------------------- */
/*  F13 The others' reactions to a roll         */
/* -------------------------------------------- */

/** The effects another Character's reaction may have on this roll (no dice: they are worked out on its owner's side). */
const FOREIGN_EFFECTS = ["rollBonus", "natural"];
const PENDING = new Map();

async function actorOf(uuid) {
  const d = uuid ? await fromUuid(uuid).catch(() => null) : null;
  return (d?.documentName === "Token") ? d.actor : d;
}

/** Who answers for a reacting Character: an active player who owns it, else the active GM. */
function reactingUser(actor) {
  const players = (game.users ?? []).filter(u => u.active && !u.isGM && actor.testUserPermission?.(u, "OWNER"));
  return players.find(u => u === game.user) ?? players[0] ?? game.users?.activeGM ?? null;
}

/** The formula data of a reacting Character: its own, the roll's variables, @rollerDistance, @againstMe, @vs (the roller). */
async function foreignBase(reactor, roller, req) {
  const { versusData } = await import("../rules/versus.mjs");
  let vs = {};
  try { vs = roller ? versusData(reactor, roller) : {}; } catch(err) { vs = {}; }
  return { ...(reactor.system?.rollData ?? {}), round: encounterOf(reactor)?.round ?? 0, ...(req.vars ?? {}), ...(req.extra ?? {}), vs };
}

// (F15 "triggerRoll": rerolls of a shared trigger roll)
const foreignBoxes = (reactor, event) => boxesOf(collectTriggers(reactor, event)
  .filter(t => ((event === "triggerRoll") ? ["reroll"] : FOREIGN_EFFECTS).includes(t.effect)));

/**
 * The reactions of the others to a roll (dice/roller.mjs dbuRoll, after the roller's own, before the result is used):
 * "allyRoll" for its Allies, "opponentRoll" for its Opponents (rollBonus without dice, natural). Each one with a usable
 * piece is asked through its owner (here, or by socket: 60 s at most); the owner picks, pays the costs and counts the
 * limits, and the effects change the roll here.
 */
export async function foreignRollReactions(config, result) {
  const actor = config.actor;
  let others;
  try { others = encounterOthers(actor); } catch(err) { return; }
  for ( const o of others ) {
    const event = o.ally ? "allyRoll" : (o.opponent ? "opponentRoll" : null);
    if ( !event || !o.actor?.system ) continue;
    try {
      const boxes = foreignBoxes(o.actor, event);
      if ( !boxes.length ) continue;
      const against = (config.other?.uuid === o.actor.uuid) || (config.others ?? []).some(a => a?.uuid === o.actor.uuid);
      const req = { reactor: o.actor.uuid, roller: actor.uuid, event, vars: rollVariables(config, result),
        extra: { rollerDistance: o.distance ?? 99, againstMe: against ? 1 : 0, ...(o.ally ? { allyHasAwk: possessedAwakenings(actor) } : {}) },
        title: config.title ?? "", total: result.total, natural: result.natural };
      const base = await foreignBase(o.actor, actor, req);
      if ( !boxes.some(b => usable({ actor: o.actor }, b, base)) ) continue;
      const user = reactingUser(o.actor);
      if ( !user ) continue;
      const answer = (user === game.user) ? await answerRollAsk(req) : await askRemote(user, req);
      for ( const a of answer?.applied ?? [] ) {
        const value = Number(a.value) || 0;
        const text = await applyEffect(config, result, { effect: a.effect, value: String(value) }, value, a.label);
        if ( text ) result.reactionNotes = [...(result.reactionNotes ?? []), L("DBU.Reaction.Applied", { label: a.label, what: text })];
      }
    } catch(err) { console.warn("DBU | Foreign roll reactions", err); }
  }
}

function askRemote(user, req) {
  const reqId = foundry.utils.randomID();
  return new Promise(resolve => {
    const timer = setTimeout(() => { PENDING.delete(reqId); resolve(null); }, 60000);
    PENDING.set(reqId, a => { clearTimeout(timer); PENDING.delete(reqId); resolve(a); });
    game.socket.emit("system.dbu-rpg", { action: "rollAsk", userId: user.id, data: { ...req, reqId, from: game.user.id } });
  });
}

/** The socket's "rollAnswer" (on the roller's client). */
export function onRollAnswer(data) { PENDING.get(data?.reqId)?.(data); }

/** The socket's "rollAsk" (on the reacting Character's owner's client): ask, then answer. */
export async function onRollAsk(data) {
  let answer = { applied: [] };
  try { answer = (await answerRollAsk(data)) ?? answer; } catch(err) { console.error("DBU | Roll ask", err); }
  game.socket.emit("system.dbu-rpg", { action: "rollAnswer", userId: data.from, data: { reqId: data.reqId, applied: answer.applied ?? [] } });
}

/** The owner's dialog: the usable pieces of the reacting Character (an amount where they have one), paid and counted. */
export async function answerRollAsk(req) {
  const reactor = await actorOf(req.reactor);
  if ( !reactor?.system ) return { applied: [] };
  const roller = await actorOf(req.roller);
  const base = await foreignBase(reactor, roller, req);
  const cfg = { actor: reactor };
  const boxes = foreignBoxes(reactor, req.event).filter(b => usable(cfg, b, base));
  if ( !boxes.length ) return { applied: [] };
  const rows = boxes.map((b, i) => {
    const label = [...new Set(b.pieces.map(pieceLabel))].join(" + ");
    const max = boxMax(b, base);
    const cost = b.pieces.map(t => t.cost).filter(c => !blank(c)).join("; ");
    return `<div class="form-group"><label class="check"><input type="checkbox" name="r${i}"> ${esc(label)}${cost ? ` <small>(${esc(cost)})</small>` : ""}</label>
      ${blank(b.amount) ? "" : `<input type="number" name="n${i}" value="1" min="1" max="${Math.max(1, max)}" step="1" style="max-width:5em">`}</div>`;
  }).join("");
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `${L("DBU.Reaction.Title")}: ${reactor.name}`, icon: "fa-solid fa-dice-d10" },
    position: { width: 460 },
    content: `<div class="dbu-dialog"><p>${esc(L("DBU.F13.OtherRolled", { name: roller?.name ?? "", title: req.title ?? "", total: req.total, natural: req.natural }))}</p>${rows}</div>`,
    buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), icon: "fa-solid fa-check", default: true,
      callback: (e, b) => boxes.map((x, i) => ({ on: !!b.form.elements[`r${i}`]?.checked, n: Number(b.form.elements[`n${i}`]?.value) || 1 })) },
    { action: "skip", label: L("DBU.Reaction.Done") }],
    rejectClose: false
  });
  if ( !Array.isArray(picked) ) return { applied: [] };
  const applied = [];
  for ( let i = 0; i < boxes.length; i++ ) {
    if ( !picked[i]?.on ) continue;
    const box = boxes[i];
    const n = blank(box.amount) ? 1 : Math.clamp(Math.floor(picked[i].n), 1, Math.max(1, boxMax(box, base)));
    const pieces = applicable(cfg, box, base, n);
    if ( !pieces.length ) continue;
    const plan = costPlan(reactor, pieces.filter(t => !blank(t.cost)).map(t => ({ cost: t.cost, data: pieceData(base, t, n) })));
    if ( plan.problems.length ) {
      ui.notifications.warn(L("DBU.Trigger.CantPay", { why: plan.problems.join(" ") }));
      continue;
    }
    const counted = new Set();
    for ( const t of pieces ) {
      const key = triggerLimitKey(t);
      if ( blank(t.limit) || counted.has(key) ) continue;
      counted.add(key);
      await useTriggerLimit(reactor, t, key);
    }
    if ( !plan.empty ) await payTriggerCost(reactor, plan);
    for ( const t of pieces ) {
      applied.push({ effect: t.effect, value: evaluate(t.value, pieceData(base, t, n)), label: `${pieceLabel(t)} (${reactor.name})` });
    }
  }
  return { applied };
}

/**
 * F15 A shared trigger roll (sharedRoll, its rollKey) rolled again: the actor's "triggerRoll" reroll pieces
 * (@rollKey_<key>, @roll, @rollNatural) are asked through its owner, who pays and counts them. @returns true to reroll.
 */
export async function triggerRollReroll(actor, key, vars, title = "") {
  const boxes = foreignBoxes(actor, "triggerRoll");
  if ( !boxes.length ) return false;
  const req = { reactor: actor.uuid, roller: actor.uuid, event: "triggerRoll", vars: { ...vars, [`rollKey_${key}`]: 1 }, extra: {},
    title, total: vars.roll, natural: vars.rollNatural };
  const base = await foreignBase(actor, null, req);
  if ( !boxes.some(b => usable({ actor }, b, base)) ) return false;
  const user = reactingUser(actor);
  if ( !user ) return false;
  const answer = (user === game.user) ? await answerRollAsk(req) : await askRemote(user, req);
  return (answer?.applied ?? []).some(a => a.effect === "reroll");
}
