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
import { askAmount, collectTriggers, costPlan, encounterOf, fireEvent, payTriggerCost, triggerLimitKey, triggerUsesLeft,
  useTriggerLimit } from "./triggers.mjs";
import { addRollBonus, forceCritical, rerollAll, rerollBase, setNatural, shiftNatural } from "../dice/roller.mjs";

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
    thresholdCheck: own.thresholdCheck ? 1 : 0
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

/** Apply one reaction effect to the result; the text of the change. */
async function applyEffect(config, result, t, value, label) {
  switch ( t.effect ) {
    case "reroll": {
      const all = String(t.resource ?? "").trim().toLowerCase() === "all";
      const before = result.total;
      await (all ? rerollAll(config, result) : rerollBase(config, result));
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
  const texts = [];
  for ( const t of pieces ) {
    // Worked out with the result as it is now (an earlier piece of the box may have changed it)
    const data = pieceData(scopeOf(config, result), t, n);
    const value = evaluate(t.value, data);
    for ( let k = 0; k < (t.times ?? 1); k++ ) {
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
