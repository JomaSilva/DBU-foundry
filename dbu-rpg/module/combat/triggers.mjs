import { DBU } from "../config.mjs";
import { evaluate, rollExpression, test } from "../rules/formula.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { changeStacks, setStacks } from "./stacks.mjs";
import { awakeningSlug, stackChoiceCount } from "../rules/awakening.mjs";
import { twinnedOff } from "../rules/modifiers.mjs";
import { fxForcedOn, fxPiece } from "../rules/fx.mjs";
import { allocTotal, resourceSlug } from "../rules/resources.mjs";
import { ignoresCapacity, staminaPayment } from "./adversary.mjs";
import { emitGM } from "../socket.mjs";
import { alliesInRange, encounterOthers, opponentsInRange } from "../rules/allies.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const { DialogV2 } = foundry.applications.api;
const blank = v => !String(v ?? "").trim();

/**
 * Formula data Package B keeps for the triggers (rules/derived.mjs may put the same values in rollData):
 * @marks.<slug> (Characters carrying your mark), @resGained.<slug> / @resSpent.<slug> (this Combat Round, flag roundRes),
 * @chargesRound, @surgesRound (Energy Charges / Surges used this Combat Round), @damagedSinceTurn (times an attack
 * damaged you since the start of your last turn).
 */
export function triggerData(actor) {
  const c = actor?.system?.combat ?? {};
  const marks = actor?.getFlag?.("dbu-rpg", "marks") ?? {};
  const combat = encounterOf(actor);
  const rr = actor?.getFlag?.("dbu-rpg", "roundRes");
  const now = !!combat && !!rr && (rr.combat === combat.id) && (rr.round === combat.round);
  return {
    marks: Object.fromEntries(Object.entries(marks).map(([k, list]) => [k, (list ?? []).length])),
    resGained: now ? { ...(rr.gained ?? {}) } : {}, resSpent: now ? { ...(rr.spent ?? {}) } : {},
    chargesRound: c.chargesRound ?? 0, surgesRound: c.surgesRound ?? 0, damagedSinceTurn: c.damagedSinceTurn ?? 0
  };
}

/** rules/versus.mjs (Package A), once loaded (null while it does not exist): @vs.* in the scopes of the events. */
let VERSUS = undefined;
async function versusModule() {
  if ( VERSUS === undefined ) {
    try { VERSUS = await import("../rules/versus.mjs"); } catch(err) { VERSUS = null; }
  }
  return VERSUS;
}
// Loaded as soon as this module is, so that the sheet's Trait uses (worked out synchronously) see @vs.* from the start
versusModule();
const readsVs = list => list.some(t => /@vs./.test(`${t.condition ?? ""} ${t.value ?? ""} ${t.cost ?? ""} ${t.amount ?? ""}`));
/** { vs: versusData(actor, other) } when one of the triggers reads @vs.* and the other Character is known, else {}. */
function versusVars(actor, other, triggers) {
  if ( !other || (typeof VERSUS?.versusData !== "function") || !readsVs(triggers) ) return {};
  try {
    const vs = VERSUS.versusData(actor, other);
    return (vs && (typeof vs.then !== "function")) ? { vs } : {};
  } catch(err) {
    console.warn("DBU | @vs", err);
    return {};
  }
}

/**
 * A trigger whose effect waits for a click: ask, a Maneuver, an amount, the clicking user's target, a Clash check, a
 * Combat Condition the player picks ("removeCondition any": the event triggers run on the GM's client, the pick is the
 * player's).
 */
const isButton = t => (t.mode === "ask") || (t.effect === "maneuver") || !blank(t.amount) || (t.target === "targeted")
  || /^\s*clash:/i.test(String(t.check ?? "")) || ((t.effect === "removeCondition") && /^\s*any(!|\s*$)/i.test(String(t.resource ?? "")));
/** Who an effect goes to ("targeted": resolved when its button is clicked). */
const whoOf = (t, actor, other) => ((t.target === "other") ? other : actor);
/**
 * G2: every Character an effect goes to: "allies" (your Allies, within the trigger's `range` when set), "team" (you and
 * them), "ally" (the Ally of an ally event, scope.allyUuid); otherwise the one of whoOf.
 */
function whoListOf(t, actor, other, scope = {}) {
  if ( t.target === "ally" ) {
    let a = scope.allyUuid ? globalThis.fromUuidSync?.(scope.allyUuid) : null;
    if ( a?.documentName === "Token" ) a = a.actor;
    return a ? [a] : [];
  }
  // J: every Opponent of your encounter (within `range`)
  if ( t.target === "opponents" ) return opponentsInRange(actor, t.range);
  if ( (t.target === "allies") || (t.target === "team") ) {
    const list = alliesInRange(actor, t.range);
    return (t.target === "team") ? [actor, ...list] : list;
  }
  const who = whoOf(t, actor, other);
  return who ? [who] : [];
}
const manyTargets = t => ["allies", "team", "opponents"].includes(t.target);

/**
 * Gather the active turn/round triggers of an actor for one event. `itemId`: the Transformation the event is about (the
 * one just left still runs its "when you leave this Transformation" triggers).
 */
export function collectTriggers(actor, event, { itemId = null, alsoActive = null } = {}) {
  const list = [];
  // A Trait possessed at all times (Legendary) runs once, even outside its Transformation or carried by two of them
  const possessed = new Set();
  // D1: what the other effects do to a piece (rules/fx.mjs fxPass, worked out with the actor's data)
  const fx = actor.system?._fx ?? null;
  for ( const item of actor.items ) {
    const s = item.system;
    if ( !s?.triggers?.length ) continue;
    // (Q alsoActive: the Transformations a Defeat just left, for the "threshold" event of that Defeat)
    const active = (s.isActive ?? true) || ((event === "revert") && (item.id === itemId)) || !!alsoActive?.includes(item.id);
    const ctx = (item.type === "transformation") ? s.formulaContext : {};
    for ( let t of s.triggers ) {
      if ( twinnedOff(item, t) ) continue;
      if ( t.fx && fx ) {
        // fxOn: an effect switched on while its item does not work
        if ( !(active || t.always) && !fxForcedOn(t, fx) ) continue;
        t = fxPiece(t, fx);
        if ( !t ) continue;
        if ( !(active || t.always) ) t = { ...t, always: true };
      }
      // Per-Stack choices of an Awakening: an option runs once per Stack that picked it, an unpicked Trait not at all
      const count = (item.type === "transformation") ? stackChoiceCount(s, t.label) : null;
      if ( ((count === null) ? !t.active : (count === 0)) || (t.event !== event) || !(active || t.always) ) continue;
      if ( t.always ) {
        const key = [t.label, t.event, t.effect, t.value, t.condition].join("|");
        if ( possessed.has(key) ) continue;
        possessed.add(key);
      }
      // A reminder shows once however many Stacks picked it
      const times = ((t.effect === "message") || (t.mode === "remind")) ? Math.min(1, count ?? 1) : (count ?? 1);
      // copy: the effect runs once per Stack; its cost and its limit count once (copy 0)
      for ( let k = 0; k < times; k++ ) list.push({ ...t, active: true, source: item.name, itemId: item.id, ctx, copy: k });
    }
  }
  for ( const t of actor.system.customTriggers ?? [] ) {
    if ( t.active && (t.event === event) ) list.push({ ...t, source: t.label || L("DBU.Custom"), ctx: {}, copy: 0 });
  }
  // D1: the built-in effects of the States (DBU.stateTriggers: the Surging State's Focus and Fatigued...), unless
  // ignored ("ignoreState.<state>.<n>")
  for ( const st of DBU.stateTriggers ?? [] ) {
    if ( (st.event !== event) || stateEffectIgnoredNow(actor, st.state, st.n) ) continue;
    list.push({ effect: "message", value: "", resource: "", condition: "", mode: "auto", duration: "none", target: "self", limit: "",
      ...st, label: `${L(`DBU.State.${st.state}`)} (${st.n})`, source: L(`DBU.State.${st.state}`), active: true, ctx: {}, copy: 0 });
  }
  return list;
}

/** Is that built-in effect of a State ignored now ("ignoreState.<state>.<n>" modifiers, summed by rules/derived.mjs)? */
export function stateEffectIgnoredNow(actor, state, n) {
  const b = actor?.system?.buckets ?? {};
  return (b[`ignorestate.${String(state).toLowerCase()}.${n}`]?.total ?? 0) > 0;
}

/* -------------------------------------------- */
/*  Events of the attack flow                   */
/* -------------------------------------------- */

/** Events that happen during the attack flow, Health Thresholds and Transformations (not the turn/round ones). */
export const ACTION_EVENTS = ["attackMade", "attackHit", "damaged", "attackMissed", "dodged", "threshold", "transform", "revert", "burstLimit", "grandAwakening", "powerUp", "surge", "energyCharge", "stateEnter", "targeted"];

/**
 * Something happened to an actor (it hit, was hit, crossed a Health Threshold...): its triggers for that event run on the
 * GM's client, who may change both Characters. `other` is the other Character of the event; `scope` adds formula
 * variables (@damage, @crit, @physical...). `scope.itemId`: the Transformation the event is about (entered, left, its Burst
 * Limit): its own triggers see @this = 1.
 */
/** Y: the events that are a Maneuver used, and the slug they give @by_<slug> (null: read from the event). */
const MANEUVER_WATCH = { maneuverUsed: null, powerUp: "powerup", energyCharge: "energycharge", surge: null, transform: "transformation",
  combatRecovery: "combatrecovery" };

/** Y: "opponentManeuver" / "allyManeuver" for the others of the encounter (other = the one who used it). */
function fireManeuverWatch(actor, event, scope) {
  if ( !actor?.system || !encounterOf(actor) ) return;
  let slug = MANEUVER_WATCH[event];
  if ( event === "surge" ) slug = scope.healingSurge ? "healingsurge" : "kisurge";
  if ( event === "maneuverUsed" ) slug = Object.keys(scope).find(k => k.startsWith("via_") && scope[k])?.slice(4) ?? "";
  if ( !slug ) return;
  const kind = {};
  for ( const k of ["oos", "ua", "god", "villainous", "special", "standard", "instant", "counterManeuver", "modifierManeuver"] ) {
    if ( k in scope ) kind[k] = Number(scope[k]) || 0;
  }
  if ( event !== "maneuverUsed" ) Object.assign(kind, { standard: 1, oos: actor._dbuOutOfSequence ? 1 : 0 });
  for ( const e of encounterOthers(actor) ) {
    if ( !e.ally && !e.opponent ) continue;
    const ev = e.opponent ? "opponentManeuver" : "allyManeuver";
    if ( !collectTriggers(e.actor, ev).length ) continue;
    fireEvent(e.actor, ev, { other: actor, scope: { [`by_${slug}`]: 1, distance: e.distance, ...kind } });
  }
}

export function fireEvent(actor, event, { other = null, scope = {} } = {}) {
  if ( event in MANEUVER_WATCH ) {
    try { fireManeuverWatch(actor, event, scope); } catch(err) { console.error("DBU | maneuver watch", err); }
  }
  // E1: an attack that damaged someone is also an event of the Allies ("allyHit" / "allyDamaged")
  if ( ["attackHit", "damaged", "attackMade", "powerUp", "surge", "targeted"].includes(event) ) {
    try { fireAllyEvents(actor, event, other, scope); } catch(err) { console.error("DBU | ally events", err); }
  }
  // D1 @viaFx.<ref>: the events of a Maneuver used through a "maneuver" button of that effect
  if ( actor?._dbuViaFx && !scope.viaFx ) scope = { ...scope, viaFx: { [actor._dbuViaFx]: 1 } };
  if ( !actor?.system?.top || !collectTriggers(actor, event, { itemId: scope.itemId, alsoActive: scope.defeatForms }).length ) return;
  if ( game.user.isActiveGM ) return runEventTriggers(actor, event, { other, scope }).catch(console.error);
  emitGM("triggerEvent", { actorUuid: actor.uuid, otherUuid: other?.uuid ?? null, event, scope });
}

/** GM side of fireEvent. */
export async function runEventTriggers(actor, event, { other = null, scope = {}, manyOnly = false } = {}) {
  if ( typeof actor === "string" ) actor = await fromUuid(actor);
  if ( typeof other === "string" ) other = await fromUuid(other);
  if ( actor?.documentName === "Token" ) actor = actor.actor;
  if ( other?.documentName === "Token" ) other = other.actor;
  if ( !actor?.system?.top ) return;
  // (manyOnly: the turn / round triggers that go to several Characters, which runTriggers hands over)
  const triggers = collectTriggers(actor, event, { itemId: scope.itemId, alsoActive: scope.defeatForms }).filter(t => !manyOnly || manyTargets(t));
  if ( !triggers.length ) return;
  const combat = encounterOf(actor);
  // Q: the Transformations a Defeat just left still count as active for the conditions of their triggers (@active.<slug>)
  if ( scope.defeatForms?.length ) {
    const slugs = scope.defeatForms.map(id => actor.items.get(id)).filter(Boolean).map(i => awakeningSlug(i.name));
    scope = { ...scope, active: { ...(actor.system.rollData?.active ?? {}), ...Object.fromEntries(slugs.map(sl => [sl, 1])) } };
  }
  if ( other && readsVs(triggers) ) await versusModule();
  const data = { ...(actor.system.rollData ?? {}), ...triggerData(actor), ...versusVars(actor, other, triggers), round: combat?.round ?? 0,
    ...scope };
  const lines = [];
  const buttons = [];
  // B4: one roll / check per rollKey in this firing; the ask triggers with a roll or a check, grouped by rollKey
  const rolls = new Map();
  const rolledButtons = new Map();
  // K: the rolls and checks made against each Character of a many-target trigger
  const perTarget = new Map();
  const rollsOf = w => perTarget.get(w.uuid) ?? perTarget.set(w.uuid, new Map()).get(w.uuid);
  for ( const t of triggers ) {
    // A Burst Limit runs the effects of the Burst Limit Trait triggered, not the others
    if ( (event === "burstLimit") && scope.burst && !String(t.label ?? "").startsWith(scope.burst) ) continue;
    // E4 "stackGain": the Awakening that gained the Stack, and not its reminders (the Stack's card lists them)
    if ( (event === "stackGain") && ((t.itemId !== scope.itemId) || (t.effect === "message") || (t.mode === "remind")) ) continue;
    const own = { ...t.ctx, this: (scope.itemId && (t.itemId === scope.itemId)) ? 1 : 0 };
    // @n: the event's own count (counterSpent, holdingBackGain...), else 1 (an amount picked on a button replaces it)
    let sc = { ...data, ...own, n: scope.n ?? 1 };
    const button = isButton(t);
    const rolled = !blank(t.roll) || !blank(t.check);
    if ( !rolled && !test(t.condition, sc) ) continue;
    const whos = whoListOf(t, actor, other, scope);
    const who = whos[0];
    if ( !who ) continue;
    const label = t.label || t.source;
    const limitKey = triggerLimitKey(t);
    // K: an automatic trigger with a roll or a check that goes to several Characters makes it against each of them
    if ( rolled && !button && manyTargets(t) ) {
      if ( !triggerUsesLeft(actor, t, limitKey) ) continue;
      let plan = null;
      if ( !blank(t.cost) ) {
        plan = triggerCostPlan(actor, t.cost, sc);
        if ( plan.problems.length ) {
          lines.push(`${label}: ${L("DBU.Trigger.CantPay", { why: plan.problems.join(" ") })}`);
          continue;
        }
      }
      if ( !(await useTriggerLimit(actor, t, limitKey)) ) continue;
      const paid = plan ? await payTriggerCost(actor, plan, {}) : "";
      if ( paid ) lines.push(`${label}: ${L("DBU.Trigger.Paid", { cost: paid })}`);
      if ( readsVs([t]) || /clash:/i.test(String(t.check ?? "")) ) await versusModule();
      const clash = /^\s*clash:/i.test(String(t.check ?? ""));
      for ( const w of whos ) {
        // (a Clash is made against the others: you are not your own Opponent)
        if ( clash && (w === actor) ) continue;
        const base = { ...sc, ...versusVars(actor, w, [t]) };
        const scW = await rollAndCheck(actor, t, base, { other: w, rolls: rollsOf(w), label: `${label} → ${w.name}`, lines });
        if ( !scW ) continue;
        if ( (t.effect === "message") || (t.mode === "remind") ) {
          lines.push(`${label} → ${w.name}${t.value && (t.effect === "message") ? `: ${t.value}` : ""}`);
          continue;
        }
        const valueW = ["state", "condition"].includes(t.effect) && !t.value ? 1 : evaluate(t.value, scW);
        const optsW = { duration: baseDuration(t.duration), ...rawOf(t.duration), event, label, itemId: t.itemId ?? null,
          ...timedOptions(actor, w, t.duration), ...effectOptions(actor, w, t, event, scope) };
        const text = await applyOn(actor, w, t, valueW, withInflictor(actor, w, t, event, optsW));
        if ( text ) lines.push(`${label} → ${w.name}: ${text}`);
      }
      continue;
    }
    // A roll / check of an automatic trigger is made now (before its condition is tested for good)
    if ( rolled && !button ) {
      if ( !triggerUsesLeft(actor, t, limitKey) ) continue;
      sc = await rollAndCheck(actor, t, sc, { other, rolls, label, lines });
      if ( !sc ) continue;
    }
    // (Y: a "targeted" button whose condition reads @vs: tested when it is clicked, against the clicking user's target)
    else if ( rolled && !(((t.target === "targeted") && /@vs[A-Za-z]*\./.test(String(t.condition ?? ""))) || maybeHolds(t, sc)) ) continue;
    if ( ((t.effect === "message") && !(button && rolled)) || (t.mode === "remind") ) {
      if ( !(await useTriggerLimit(actor, t, limitKey)) ) continue;
      lines.push(`${label}${t.value && (t.effect === "message") ? `: ${t.value}` : ""}`);
      continue;
    }
    const value = (t.effect === "message") ? 0 : (["state", "condition"].includes(t.effect) && !t.value ? 1 : evaluate(t.value, sc));
    const options = { duration: baseDuration(t.duration), ...rawOf(t.duration), event, label, itemId: t.itemId ?? null, ...timedOptions(actor, who, t.duration),
      ...effectOptions(actor, who, t, event, scope) };
    // P: an attack Maneuver of the event's effect targets the event's other Character (combat/triggers.mjs targetOther)
    if ( (t.effect === "maneuver") && other?.uuid ) options.otherUuid = other.uuid;
    // An amount to pick ("up to M stacks") needs the player: a chat button
    if ( button ) {
      if ( !triggerUsesLeft(actor, t, limitKey) ) continue;
      const btnScope = { round: combat?.round ?? 0, ...scope, ...own };
      // B4: the ask triggers sharing a rollKey are ONE button that rolls (or checks) when clicked; B3: the ones sharing a
      // group are ONE button that applies them all; G2: one for every Ally ("allies" / "team")
      // (K: with a roll or a check, its click makes it against each of them)
      const gk = (rolled && manyTargets(t)) ? `per:${blank(t.rollKey) ? limitKey : `roll:${String(t.rollKey).trim()}`}`
        : (groupKey(t, rolled, rolledButtons) ?? (manyTargets(t) ? `team:${limitKey}` : null));
      if ( gk ) {
        const g = rolledButtons.get(gk);
        const its = whos.map(w => ({ t, who: w, options: { ...options, ...timedOptions(actor, w, t.duration) }, value }));
        if ( g ) g.items.push(...its);
        else rolledButtons.set(gk, { t, who, value, options, limitKey, scope: btnScope, data: sc, other, items: its,
          many: manyTargets(t), perTarget: rolled && manyTargets(t) });
        continue;
      }
      buttons.push(askButton(actor, t, { who, value, options, limitKey, scope: btnScope, data: sc }));
      continue;
    }
    // An automatic trigger with a cost pays it when it can
    let plan = null;
    if ( !blank(t.cost) ) {
      if ( !triggerUsesLeft(actor, t, limitKey) ) continue;
      plan = triggerCostPlan(actor, t.cost, sc);
      if ( plan.problems.length ) {
        lines.push(`${label}: ${L("DBU.Trigger.CantPay", { why: plan.problems.join(" ") })}`);
        continue;
      }
    }
    if ( !(await useTriggerLimit(actor, t, limitKey)) ) continue;
    const paid = plan ? await payTriggerCost(actor, plan, options.resEvent ? { resEvent: true } : {}) : "";
    // G2: the same effect on every Character of "allies" / "team" (each one's own timing)
    for ( const [k, w] of whos.entries() ) {
      const opts = (w === who) ? options : { ...options, ...timedOptions(actor, w, t.duration), ...effectOptions(actor, w, t, event, scope) };
      const text = await applyOn(actor, w, t, value, withInflictor(actor, w, t, event, opts));
      const cost = (k === 0) && paid ? L("DBU.Trigger.Paid", { cost: paid }) : "";
      if ( text || cost ) lines.push(`${label}${w !== actor ? ` → ${w.name}` : ""}: ${[text, cost].filter(Boolean).join(" · ")}`);
    }
  }
  for ( const g of rolledButtons.values() ) buttons.push(rolledButton(actor, g));
  if ( lines.length || buttons.length ) {
    await postInfoCard({ actor, title: L(`DBU.Trigger.Event.${event}`, { name: actor.name }), lines, buttons });
  }
}

/**
 * Options of applyTriggerEffect that only some effects and events need (so that the buttons of the other triggers keep
 * their payload): the marker of a mark, the one-shot buckets of a Maneuver ("with"), the loop guards of the resource,
 * State and mark events, the mark a "markPlaced" effect ends with.
 */
function effectOptions(actor, who, t, event, scope = {}) {
  const out = {};
  // D1: the effect the piece comes from (its State, its Maneuver, the "fxUsed" event of its owner)
  if ( t.fx ) {
    out.fx = t.fx;
    if ( event !== "fxUsed" ) out.fxOwner = actor.uuid;
  }
  if ( ["mark", "unmark"].includes(t.effect) ) out.markerUuid = actor.uuid;
  // M2: the attack of the event, for "attackWound"
  if ( (t.effect === "attackWound") && scope.messageId ) out.messageId = scope.messageId;
  if ( (t.effect === "maneuver") && !blank(t.with) ) out.with = String(t.with);
  if ( ["resourceGain", "resourceSpend"].includes(event) ) out.resEvent = true;
  if ( event === "stateLeave" ) out.noLeave = true;
  if ( (event === "markPlaced") && scope.markKey && (who !== actor) ) out.withMark = scope.markKey;
  // A mark placed by a "markPlaced" trigger does not fire it again
  if ( (event === "markPlaced") && (t.effect === "mark") ) out.quietMark = true;
  return out;
}

/** G2: an automatic effect on a Character this client may not change goes through the GM (as a clicked button does). */
async function applyOn(actor, who, t, value, options) {
  if ( (who === actor) || who.isOwner || ["mark", "unmark"].includes(t.effect) ) return applyTriggerEffect(who, t.effect, value, t.resource, options);
  if ( emitGM("applyTrigger", { uuid: who.uuid, effect: t.effect, value, resource: t.resource, options }) ) {
    return describeEffect(t.effect, value, t.resource, options.duration);
  }
  return "";
}

/** B3 "inflict": a Combat Condition given to another Character says who gave it (set when the effect is applied). */
const withInflictor = (actor, who, t, event, options) => (((t.effect === "condition") && who && (who !== actor) && (event !== "inflict"))
  ? { ...options, inflictor: actor.uuid } : options);

/* -------------------------------------------- */
/*  Maneuvers and items used, Allies (E1)       */
/* -------------------------------------------- */

/** The slug of an item's name without the word "Maneuver" ("Hype Maneuver" → "hype", "Bite Attack" → "biteattack"). */
export const viaSlug = name => awakeningSlug(String(name ?? "").replace(/\bmaneuver\b/gi, ""));

/** The slugs a use is counted under (@used.<slug>, @usedEnc.<slug>): without "Maneuver", and the full name. */
const useSlugs = name => [...new Set([viaSlug(name), awakeningSlug(name)])].filter(Boolean);

/**
 * The variables of "maneuverUsed" (a Maneuver or a Unique Ability) and "itemUsed" (a Basic Item, an Accessory):
 * @via_<slug> = 1, @oos (Out-of-Sequence); a Maneuver / Unique Ability: @ua, @special (a Special Maneuver: not a
 * Maneuver of the Actions & Maneuvers page, nor a God or Villainous one), @god, @villainous, @standard, @instant,
 * @counterManeuver, @modifierManeuver (its Maneuver type), @actionCost (its Actions; 0 for none or a variable cost),
 * @uaType_<type> (a Unique Ability's type: @uaType_magical); an item: @consumable, @food, @basic, @accessory.
 */
export function itemUseScope(actor, item, extra = {}) {
  const s = item?.system ?? {};
  const scope = { [`via_${viaSlug(item?.name)}`]: 1, oos: actor?._dbuOutOfSequence ? 1 : 0 };
  if ( item?.type === "item" ) {
    const details = String(s.details ?? "");
    Object.assign(scope, { consumable: /consumable/i.test(details) ? 1 : 0, food: /food/i.test(details) ? 1 : 0,
      basic: (s.itemType !== "accessory") ? 1 : 0, accessory: (s.itemType === "accessory") ? 1 : 0 });
    return { ...scope, ...extra };
  }
  const type = String(s.maneuverType ?? "");
  const ua = item?.type === "uniqueAbility";
  Object.assign(scope, {
    ua: ua ? 1 : 0, god: s.god ? 1 : 0, villainous: s.villainous ? 1 : 0,
    special: ((item?.type === "maneuver") && !s.god && !s.villainous && (s.source?.slug !== "actions-maneuvers")) ? 1 : 0,
    standard: /^standard/i.test(type) ? 1 : 0, instant: /^instant/i.test(type) ? 1 : 0, counterManeuver: /^counter/i.test(type) ? 1 : 0,
    modifierManeuver: /^modifier/i.test(type) ? 1 : 0, actionCost: Number(/^\s*(\d+)/.exec(String(s.actionCost ?? ""))?.[1] ?? 0)
  });
  if ( ua && awakeningSlug(s.abilityType) ) scope[`uaType_${awakeningSlug(s.abilityType)}`] = 1;
  return { ...scope, ...extra };
}

/**
 * Count a use in the Combat Encounter: flags.dbu-rpg.maneuverUses = { combat, round, r: { <slug>: n }, e: { <slug>: n } }
 * (r starts again each Combat Round, everything each encounter); rules/derived.mjs reads it as @used.<slug> /
 * @usedEnc.<slug>.
 */
export async function recordItemUse(actor, item) {
  const combat = encounterOf(actor);
  if ( !combat || !actor?.isOwner || (typeof actor.setFlag !== "function") ) return;
  const prev = actor.getFlag("dbu-rpg", "maneuverUses");
  const sameEnc = !!prev && (prev.combat === combat.id);
  const sameRound = sameEnc && (prev.round === combat.round);
  const next = { combat: combat.id, round: combat.round, r: sameRound ? { ...(prev.r ?? {}) } : {}, e: sameEnc ? { ...(prev.e ?? {}) } : {} };
  for ( const slug of useSlugs(item?.name) ) {
    next.r[slug] = (next.r[slug] ?? 0) + 1;
    next.e[slug] = (next.e[slug] ?? 0) + 1;
  }
  // setFlag merges objects: the counts of an old round (or encounter) would stay in it
  if ( prev && !sameRound ) await actor.unsetFlag("dbu-rpg", "maneuverUses");
  await actor.setFlag("dbu-rpg", "maneuverUses", next);
}

/**
 * A Maneuver, a Unique Ability or an item was used: count it, then fire "maneuverUsed" (other = your target) or "itemUsed".
 * `extra`: more variables (@oos...).
 */
export async function noteItemUse(actor, item, extra = {}) {
  if ( !actor || !item ) return;
  try { await recordItemUse(actor, item); } catch(err) { console.warn("DBU | maneuverUses", err); }
  const event = (item.type === "item") ? "itemUsed" : "maneuverUsed";
  fireEvent(actor, event, { other: (event === "maneuverUsed") ? currentTarget(actor) : null, scope: itemUseScope(actor, item, extra) });
  // S: the Maneuvers only their item uses (Arrogant Declaration, Terrain Lift, Ride) provoke the Exploit
  if ( item.type === "maneuver" ) await (await import("../rules/exploit.mjs")).provokeByItem(actor, item).catch(err => console.error("DBU | exploit", err));
}

/** The item types "item:<Name>" looks for, in this order. */
const USE_TYPES = ["maneuver", "uniqueAbility", "signature", "transformation", "item"];

/**
 * The actor's item of that name (any case; "Hype" also finds "Hype Maneuver" and the other way round), a Maneuver,
 * Unique Ability, Signature, Transformation or item before any other type, or null.
 */
export function itemNamed(actor, name) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if ( !wanted ) return null;
  const items = Array.from(actor?.items ?? []);
  for ( const type of [...USE_TYPES, null] ) {
    const pool = items.filter(i => (type ? (i.type === type) : !USE_TYPES.includes(i.type)));
    const hit = pool.find(i => i.name.trim().toLowerCase() === wanted) ?? pool.find(i => viaSlug(i.name) === viaSlug(wanted));
    if ( hit ) return hit;
  }
  return null;
}

/** The non-Defeated Allies of a Character in its Combat Encounter (the same token disposition; not itself). */
export function alliesOf(actor) {
  const combat = encounterOf(actor);
  if ( !combat ) return [];
  const dispositionOf = uuid => combat.combatants.find(c => c.actor?.uuid === uuid)?.token?.disposition ?? 0;
  const mine = dispositionOf(actor.uuid);
  if ( !mine ) return [];
  const out = [];
  const seen = new Set([actor.uuid]);
  for ( const c of combat.combatants ) {
    const a = c.actor;
    if ( !a || seen.has(a.uuid) || ((c.token?.disposition ?? 0) !== mine) ) continue;
    seen.add(a.uuid);
    if ( !isDefeated(a) ) out.push(a);
  }
  return out;
}

const isMinionActor = a => ((a?.type === "npc") && (a.system?.npcType === "minion")) ? 1 : 0;
/** G2 @allyDistance: Squares between you and the Ally of the event (99 when unknown). */
function allyDistance(me, ally) {
  try { return encounterOthers(me).find(o => o.actor?.uuid === ally?.uuid)?.distance ?? 99; }
  catch(err) { return 99; }
}

/** { <slug>: 1 } for the marks `marker` placed on `target` (@allyMark.<slug>: the Ally of the event carries your mark). */
function marksOn(marker, target) {
  const marks = marker?.getFlag?.("dbu-rpg", "marks") ?? {};
  return Object.fromEntries(Object.entries(marks).filter(([, list]) => (list ?? []).some(e => e.uuid === target?.uuid)).map(([k]) => [k, 1]));
}

/**
 * E1: "attackHit" → "allyHit" for every Ally of the attacker the target is an Opponent of (other = the target hit);
 * "damaged" → "allyDamaged" for every Ally of the damaged Character (other = the attacker; @allyBelow = the Health
 * Thresholds the damaged Ally is below). Both keep the attack's variables and add @allyMinion (the Ally of the event is
 * a Minion) and @allyMark.<slug>; @vs is worked out for the Ally.
 */
const ALLY_EVENT = { attackHit: "allyHit", damaged: "allyDamaged", attackMade: "allyAttack", powerUp: "allyPowerUp", surge: "allySurge",
  targeted: "allyTargeted" };
function fireAllyEvents(actor, event, other, scope = {}) {
  if ( !actor?.system ) return;
  const hit = event === "attackHit";
  // The Opponent of the Allies: whom the attack hit, or who made it (G2: whom the Ally's attack targets; none for a
  // Power Up or a Surge)
  const opponent = ["powerUp", "surge"].includes(event) ? null : (other ?? null);
  if ( hit && !other ) return;
  const combat = encounterOf(actor);
  if ( !combat ) return;
  const dispositionOf = uuid => combat.combatants.find(c => c.actor?.uuid === uuid)?.token?.disposition ?? 0;
  const ev = ALLY_EVENT[event];
  const { vs, viaFx, itemId, ...base } = scope;
  for ( const ally of alliesOf(actor) ) {
    if ( other && (ally.uuid === other.uuid) ) continue;
    // "allyHit" / "allyAttack": the target is an Opponent of that Ally
    if ( (hit || (["attackMade", "targeted"].includes(event) && other)) && (dispositionOf(other.uuid) === dispositionOf(ally.uuid)) ) continue;
    const triggers = collectTriggers(ally, ev);
    if ( !triggers.length ) continue;
    // G2 allyUuid: the Ally of the event (trigger target "ally")
    const extra = { allyMinion: isMinionActor(actor), allyMark: marksOn(ally, actor), allyUuid: actor.uuid,
      allyDistance: allyDistance(ally, actor) };
    if ( !hit ) extra.allyBelow = actor.system.health?.count ?? 0;
    fireEvent(ally, ev, { other: opponent, scope: { ...base, ...extra, ...versusVars(ally, opponent, triggers) } });
  }
}

/* -------------------------------------------- */
/*  Rolls and checks inside triggers (B4)       */
/* -------------------------------------------- */

/** The results a roll / check may give, tried to know whether a trigger may apply before rolling (a band such as
 * "@roll >= 4 && @roll <= 7" holds for neither the best nor the worst result). */
const span = (a, b) => Array.from({ length: (b - a) + 1 }, (_, k) => a + k);
const RESULTS = {
  roll: [...span(0, 40), 50, 60, 75, 100, 150, 200, 9999],
  rollNatural: span(1, 10),
  checkTotal: [...span(0, 40), 50, 60, 75, 100, 150, 200, 9999],
  checkSuccess: [0, 1],
  margin: [-9999, -100, -50, ...span(-40, 40), 50, 100, 9999]
};
const ROLL_VARS = ["roll", "rollNatural"];
const CHECK_VARS = ["checkTotal", "checkSuccess", "margin"];
/**
 * Can `condition` hold for some result of the variables `keys` (not known yet), the rest of `sc` as it is? Only the ones
 * it reads are tried, in every combination (beyond 4000 of them it is taken as "it may").
 */
function mayHold(condition, sc, keys = [...ROLL_VARS, ...CHECK_VARS]) {
  const cond = String(condition ?? "");
  const read = keys.filter(k => new RegExp(`@${k}(?![\\w])`).test(cond));
  if ( !read.length ) return test(cond, sc);
  const lists = read.map(k => RESULTS[k]);
  const total = lists.reduce((n, l) => n * l.length, 1);
  if ( total > 4000 ) return true;
  const probe = { ...sc };
  for ( let n = 0; n < total; n++ ) {
    let r = n;
    read.forEach((k, i) => {
      probe[k] = lists[i][r % lists[i].length];
      r = Math.floor(r / lists[i].length);
    });
    if ( test(cond, probe) ) return true;
  }
  return false;
}
/** Can the trigger's condition hold for some result of its roll and check? */
export const maybeHolds = (t, sc) => mayHold(t.condition, sc);

/**
 * "steadfast", "steadfast:-2", "save.morale:15", "skill.perception:12", "clash:might", "clash:might vs corporeal",
 * "clash:strike|might vs dodge".
 * @returns {{kind: string, mod?: number, key?: string, tn?: number, mine?: string, theirs?: string}|null}
 */
export function parseCheck(check) {
  const s = String(check ?? "").trim();
  let m;
  if ( (m = /^steadfast(?::\s*([+-]?\d+))?$/i.exec(s)) ) return { kind: "steadfast", mod: Number(m[1] ?? 0) };
  if ( (m = /^(save|skill)\.(\w+):\s*(\d+)$/i.exec(s)) ) return { kind: m[1].toLowerCase(), key: m[2], tn: Number(m[3]) };
  if ( (m = /^clash:\s*([\w|]+)(?:\s+vs\s+([\w|]+))?$/i.exec(s)) ) return { kind: "clash", mine: m[1], theirs: m[2] ?? m[1] };
  return null;
}

/** One side of a Clash rolled by hand (when combat/clash.mjs is not there): "might", a Save, a Skill, strike, dodge. */
async function rollClashSide(actor, spec) {
  let best = null;
  for ( const k of String(spec).split("|").map(x => x.trim()).filter(Boolean) ) {
    let r = null;
    if ( k === "might" ) r = await actor.rollClash?.("might");
    else if ( DBU.saves?.[k] ) r = await actor.rollSave?.(k);
    else if ( DBU.skills?.[k] ) r = await actor.rollSkill?.(k);
    else if ( ["strike", "dodge"].includes(k) ) r = await actor.rollCombat?.(k);
    const total = Number(r?.total ?? 0);
    if ( !best || (total > best) ) best = total;
  }
  return best ?? 0;
}

/**
 * Make a trigger's check: a Steadfast Check, a Saving Throw or a Skill Check against a TN (the Rolls API of the actor),
 * or a Clash against `other` (combat/clash.mjs resolveClash; ties go to the Defender).
 * @returns {Promise<{total: number, success: boolean, margin: number}|null>}  null when it cannot be made
 */
export async function runCheck(actor, check, other = null, { label = "", via = "" } = {}) {
  const spec = parseCheck(check);
  if ( !spec ) return null;
  const ok = (r, total, tn) => !!(r?.forceSuccess || ((typeof r?.success === "boolean") ? r.success : (total >= tn)));
  switch ( spec.kind ) {
    case "steadfast": {
      const r = await actor.rollSteadfast({ penalty: spec.mod });
      const total = Number(r?.total ?? 0);
      return { total, success: ok(r, total, 6), margin: total - 6 };
    }
    case "save":
    case "skill": {
      // (a Saving Throw or Skill the actor does not have: no check, rather than an error that stops the event)
      if ( !((spec.kind === "save") ? actor.system?.saves : actor.system?.skills)?.[spec.key] ) return null;
      const r = (spec.kind === "save") ? await actor.rollSave(spec.key, { tn: spec.tn }) : await actor.rollSkill(spec.key, { tn: spec.tn });
      const total = Number(r?.total ?? 0);
      return { total, success: ok(r, total, spec.tn), margin: total - spec.tn };
    }
    case "clash": {
      if ( !other ) return null;
      let C = null;
      try { C = await import("./clash.mjs"); } catch(err) { C = null; }
      if ( typeof C?.resolveClash === "function" ) {
        const r = await C.resolveClash(actor, other, { mine: spec.mine, theirs: spec.theirs, label, ...(via ? { via } : {}) });
        if ( !r ) return null;
        return { total: Number(r.mine ?? 0), success: !!r.won, margin: Number(r.margin ?? ((r.mine ?? 0) - (r.theirs ?? 0))) };
      }
      const mine = await rollClashSide(actor, spec.mine);
      const theirs = await rollClashSide(other, spec.theirs);
      return { total: mine, success: mine > theirs, margin: mine - theirs };
    }
    default: return null;
  }
}

/** The roll of a trigger (@roll, @rollNatural), made once per rollKey in `rolls` and shown in chat. */
async function sharedRoll(actor, t, rolls, label, lines, scope = null) {
  const key = `roll|${blank(t.rollKey) ? `${t.source}|${t.label}|${t.effect}|${t.resource}` : String(t.rollKey).trim()}`;
  if ( rolls.has(key) ) return rolls.get(key);
  const formula = String(t.roll).trim();
  let vars = { roll: 0, rollNatural: 0 };
  try {
    // "1d6(bT)", "2d4(T) + 1(T)": the Tier of Power scaling is worked out first (rules/formula.mjs)
    const data = { ...(actor.system.rollData ?? {}), ...(scope ?? {}) };
    const expr = /\((?:b)?T\)/.test(formula) ? rollExpression(formula, data) : formula;
    const roll = await new Roll(expr, data).evaluate();
    const first = roll.dice?.[0]?.results?.find(r => r.active !== false)?.result;
    vars = { roll: Number(roll.total) || 0, rollNatural: Number(first ?? roll.total) || 0 };
    await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: label });
  } catch(err) {
    console.warn(`DBU | Could not roll "${formula}"`, err);
  }
  lines?.push(L("DBU.Trigger.RollLine", { label, formula, total: vars.roll }));
  rolls.set(key, vars);
  return vars;
}

/** The check of a trigger, made once per rollKey and check in `rolls`. */
async function sharedCheck(actor, t, other, rolls, label, lines) {
  const check = String(t.check).trim();
  const key = `check|${blank(t.rollKey) ? `${t.source}|${t.label}|${t.effect}|${t.resource}` : String(t.rollKey).trim()}|${check}`;
  if ( rolls.has(key) ) return rolls.get(key);
  let c = null;
  // W: the Clash of a trigger of a Unique Ability / Maneuver item is made through it (@via_uniqueability...)
  const item = t.itemId ? actor.items?.get?.(t.itemId) : null;
  let via = "";
  if ( item ) { try { via = (await import("./clash.mjs")).viaOfItem(item); } catch(err) { via = ""; } }
  try { c = await runCheck(actor, check, other, { label, via }); }
  catch(err) { console.warn(`DBU | Could not make the check "${check}"`, err); }
  if ( !c ) lines?.push(`${label}: ${L("DBU.Trigger.CheckNone", { check })}`);
  else lines?.push(L(c.success ? "DBU.Trigger.CheckPassed" : "DBU.Trigger.CheckFailed", { label, check, total: c.total }));
  rolls.set(key, c);
  return c;
}

/**
 * The roll and the check of a trigger that runs now: its scope with @roll, @rollNatural, @checkTotal, @checkSuccess and
 * @margin, or null when it does not apply (its condition, or the check's result against onCheck: success / fail).
 */
async function rollAndCheck(actor, t, sc, { other = null, rolls, label, lines }) {
  if ( !maybeHolds(t, sc) ) return null;
  let scope = sc;
  if ( !blank(t.roll) ) scope = { ...scope, ...(await sharedRoll(actor, t, rolls, label, lines)) };
  if ( !blank(t.check) ) {
    // With the roll known, a condition that cannot hold for any result of the check decides first (no check for nothing)
    if ( !mayHold(t.condition, scope, CHECK_VARS) ) return null;
    const c = await sharedCheck(actor, t, other, rolls, label, lines);
    if ( !c ) return null;
    scope = { ...scope, checkTotal: c.total, checkSuccess: c.success ? 1 : 0, margin: c.margin };
    if ( c.success === (String(t.onCheck ?? "").trim().toLowerCase() === "fail") ) return null;
  }
  return test(t.condition, scope) ? scope : null;
}

/**
 * The chat button of ask triggers with a roll or a check (one per rollKey): when clicked, the roll is made (or the
 * check), then only the triggers whose condition and onCheck match are applied (applyRolledTrigger).
 */
function rolledButton(actor, g) {
  const b = askButton(actor, g.t, { who: g.who, value: g.value, options: g.options, limitKey: g.limitKey, scope: g.scope, data: g.data });
  const payload = JSON.parse(b.payload);
  payload.scope = g.scope;
  // The event's other Character (whom a Clash check is made against, @vs.*), whoever the effects go to
  if ( g.other?.uuid ) payload.otherUuid = g.other.uuid;
  payload.rolled = {
    roll: String(g.t.roll ?? ""), check: String(g.t.check ?? ""), ...(g.perTarget ? { perTarget: true } : {}),
    items: g.items.map(({ t, who, options }) => ({
      effect: t.effect, formula: t.value ?? "", resource: t.resource ?? "", condition: t.condition ?? "",
      onCheck: t.onCheck ?? "", check: t.check ?? "", target: t.target ?? "self", ctx: t.ctx ?? {},
      targetUuid: (who && (who !== actor)) ? who.uuid : null, options
    }))
  };
  const check = String(g.t.check ?? "").trim() || String(g.t.roll ?? "").trim();
  const more = g.items.length > 1 ? ` ×${g.items.length}` : "";
  // A group without a roll or a check: what each of its effects does
  const shown = g.many ? g.items.filter((i, k) => g.items.findIndex(j => j.t === i.t) === k) : g.items;
  const what = check ? `${check}${g.many ? "" : more}` : shown.map(i => describeEffect(i.t.effect, i.value, i.t.resource, i.t.duration ?? "none"))
    .filter(Boolean).join(" + ");
  const whom = (g.t.target === "targeted") ? ` (${L("DBU.Trigger.Target.targeted")})`
    : (g.many ? ` (${L(`DBU.Trigger.Target.${g.t.target}`)})` : ((g.who && (g.who !== actor)) ? ` (${g.who.name})` : ""));
  return { ...b, label: `${g.options.label}${whom}: ${what}`, payload: JSON.stringify(payload) };
}

/**
 * Which shared button a button trigger joins: its rollKey (with a roll or a check; without one, a button of its own) or
 * its group (one button that applies every trigger of the group). null: a plain button.
 */
function groupKey(t, rolled, map) {
  if ( rolled ) return blank(t.rollKey) ? `#${map.size}` : `roll:${String(t.rollKey).trim()}`;
  return blank(t.group) ? null : `group:${String(t.group).trim()}`;
}

/**
 * A rolled button was clicked (chat.mjs, after its limit and cost): make the roll or the check, then apply the triggers
 * whose condition and onCheck match. `other`: the Character a Clash is made against (the event's other Character or the
 * clicking user's target).
 * @returns {Promise<string[]>}  The chat lines
 */
/**
 * Y: does any effect of a grouped button (no roll, no check, no amount) apply now? Tested before its limit is counted and
 * its cost paid, so a click that applies nothing spends nothing.
 */
export async function rolledItemsHold(actor, p, other = null) {
  const r = p?.rolled ?? {};
  if ( !blank(r.roll) || !blank(r.check) || r.perTarget || !blank(p.amount) || (r.items ?? []).some(i => !blank(i.check)) ) return true;
  const read = (r.items ?? []).map(i => ({ condition: i.condition, value: i.formula }));
  if ( other && readsVs(read) ) await versusModule();
  const base = { ...(actor.system.rollData ?? {}), ...triggerData(actor), ...versusVars(actor, other, read), ...(p.scope ?? {}),
    n: Number(p.scope?.n ?? 1) || 1 };
  return (r.items ?? []).some(i => test(i.condition, { ...base, ...(i.ctx ?? {}) }));
}

export async function applyRolledTrigger(actor, p, { other = null, n = 1 } = {}) {
  const r = p.rolled ?? {};
  // K: the roll / check is made against each Character the button goes to (a Clash with every Opponent in the area)
  if ( r.perTarget ) {
    const all = [];
    // (the items of one Character together: one roll / check for all of them)
    const byWho = new Map();
    for ( const item of r.items ?? [] ) {
      const k = item.targetUuid ?? actor.uuid;
      if ( !byWho.has(k) ) byWho.set(k, []);
      byWho.get(k).push(item);
    }
    const clash = [r.check, ...(r.items ?? []).map(i => i.check)].some(c => /^\s*clash:/i.test(String(c ?? "")));
    for ( const [uuid, items] of byWho ) {
      let w = (uuid === actor.uuid) ? actor : await fromUuid(uuid);
      if ( w?.documentName === "Token" ) w = w.actor;
      if ( !w || (clash && (w === actor)) ) continue;
      const sub = await applyRolledTrigger(actor, { ...p, rolled: { ...r, perTarget: false, items } }, { other: w, n });
      all.push(...sub);
    }
    return all;
  }
  const lines = [];
  const rolls = new Map();
  // (@vs.* of the other Character, when a condition or value reads it: their conditions are tested again now)
  const read = (r.items ?? []).map(i => ({ condition: i.condition, value: i.formula }));
  if ( other && readsVs(read) ) await versusModule();
  const base = { ...(actor.system.rollData ?? {}), ...triggerData(actor), ...versusVars(actor, other, read), ...(p.scope ?? {}) };
  const label = p.label ?? "";
  let vars = {};
  if ( !blank(r.roll) ) vars = await sharedRoll(actor, { roll: r.roll, rollKey: "button" }, rolls, label, lines);
  let check = null;
  for ( const item of r.items ?? [] ) {
    const sc = { ...base, ...(item.ctx ?? {}), ...vars, n };
    if ( !blank(item.check) ) {
      check ??= await sharedCheck(actor, { check: item.check, rollKey: "button", itemId: item.options?.itemId ?? null }, other, rolls, label, lines);
      if ( !check ) continue;
      Object.assign(sc, { checkTotal: check.total, checkSuccess: check.success ? 1 : 0, margin: check.margin });
      if ( check.success === (String(item.onCheck ?? "").trim().toLowerCase() === "fail") ) continue;
    }
    if ( !test(item.condition, sc) ) continue;
    // Y: a message of a rolled button: its text once the roll / check let it through
    if ( item.effect === "message" ) { lines.push(`${label}: ${item.formula || ""}`.replace(/: $/, "")); continue; }
    let who = actor;
    if ( item.target === "targeted" ) who = currentTarget(actor);
    else if ( item.targetUuid ) {
      who = await fromUuid(item.targetUuid);
      if ( who?.documentName === "Token" ) who = who.actor;
    }
    if ( !who ) { lines.push(`${label}: ${L("DBU.TraitUse.NoTarget")}`); continue; }
    const value = ["state", "condition"].includes(item.effect) && blank(item.formula) ? 1 : evaluate(item.formula, sc);
    const options = { ...(item.options ?? {}), ...((item.target === "targeted") ? timedOptions(actor, who, item.options?.rawDuration ?? item.options?.duration) : {}) };
    // (not on an "inflict" event: its own Conditions never fire it again)
    if ( (item.effect === "condition") && (who !== actor) && (options.event !== "inflict") ) options.inflictor = actor.uuid;
    let text = "";
    if ( who.isOwner || ["mark", "unmark"].includes(item.effect) ) text = await applyTriggerEffect(who, item.effect, value, item.resource, options);
    else if ( emitGM("applyTrigger", { uuid: who.uuid, effect: item.effect, value, resource: item.resource, options }) ) {
      text = describeEffect(item.effect, value, item.resource, options.duration);
    }
    if ( text ) lines.push(`${who !== actor ? `${who.name}: ` : ""}${text}`);
  }
  return lines;
}

/** The Character the user targets (not the actor itself), or null. */
export function currentTarget(actor) {
  return Array.from(game.user?.targets ?? []).map(tk => tk.actor).find(a => a && (a !== actor) && (a.uuid !== actor?.uuid)) ?? null;
}

/**
 * "Until the end of your (next) turn" / "until the start of your next turn" on someone else ends with the turn of the one
 * whose effect it is.
 */
function timedOptions(source, who, duration) {
  if ( THEIR[duration] ) return {};
  if ( !who || (who === source) || !["endOfTurn", "endOfNextTurn", "startOfNextTurn"].includes(duration) ) return {};
  if ( duration === "startOfNextTurn" ) return { timedDuration: "startOfSourceTurn", source: source.uuid, skip: 0 };
  const myTurn = encounterOf(source)?.combatant?.actor?.uuid === source.uuid;
  return { timedDuration: "endOfSourceTurn", source: source.uuid, skip: ((duration === "endOfNextTurn") && myTurn) ? 1 : 0 };
}
export { timedOptions as timedOptionsFor };

/**
 * H: "endOfTheirTurn" / "endOfTheirNextTurn" / "startOfTheirNextTurn": like endOfTurn / endOfNextTurn / startOfNextTurn,
 * but always with the turns of the Character who gets the effect (an Ally's "until the end of its next turn").
 */
const THEIR = { endOfTheirTurn: "endOfTurn", endOfTheirNextTurn: "endOfNextTurn", startOfTheirNextTurn: "startOfNextTurn" };
export const baseDuration = d => THEIR[d] ?? d ?? "none";
/** The duration as written, kept on a button only when it differs from its base one (the click works the timing out). */
const rawOf = d => (THEIR[d] ? { rawDuration: d } : {});

/** The key a trigger's uses are counted under: its limitKey (shared by every trigger with it), or the trigger itself. */
export const triggerLimitKey = t => (String(t.limitKey ?? "").trim() || [t.source, t.label, t.event, t.effect, t.resource].join("|"));
const flagKey = key => String(key).replace(/[.\s]/g, "_");

/**
 * "1/Round", "2/Encounter", "1/Turn", "M/Encounter", "@Z/Round", "1/Round, 3/Encounter" (every one applies): the limits
 * of a trigger, with their uses worked out from `data` (formula data and the Transformation's variables).
 * @returns {{max: number, per: string, text: string}[]}
 */
export function parseLimits(limit, data = {}) {
  const out = [];
  for ( const part of splitTop(limit) ) {
    const m = /^(.*?)\s*\/\s*(round|encounter|turn)\b/i.exec(part.trim());
    if ( !m || blank(m[1]) ) continue;
    const raw = m[1].trim();
    let max = /^\d+$/.test(raw) ? Number(raw) : evaluate(raw, data, { strict: true });
    // Not a formula ("Uses: 1/Round"): the number written just before the "/", as before
    if ( !Number.isFinite(max) ) {
      const d = /(\d+)\s*$/.exec(raw);
      if ( !d ) continue;
      max = Number(d[1]);
    }
    out.push({ max, per: m[2].toLowerCase(), text: `${max}/${m[2]}` });
  }
  return out;
}

/** The parts of a limit, split at the commas and semicolons outside of parentheses ("max(1, M)/Encounter" is one). */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for ( const ch of String(s ?? "") ) {
    if ( ch === "(" ) depth++;
    else if ( ch === ")" ) depth = Math.max(0, depth - 1);
    if ( !depth && ((ch === ",") || (ch === ";")) ) {
      out.push(cur);
      cur = "";
    }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** A limit written only with numbers ("1/Round, 3/Encounter") needs no formula data. */
const plainLimit = limit => splitTop(limit).every(p => blank(p) || /^\s*\d+\s*\/\s*(round|encounter|turn)\s*$/i.test(p));

function sameWindow(u, combat, per) {
  if ( !u || (u.combat !== combat.id) ) return false;
  if ( per === "encounter" ) return true;
  return (u.round === combat.round) && ((per !== "turn") || (u.turn === combat.turn));
}

/** Fields of the stored count for each window: uses this Combat Encounter, this Combat Round, this turn. */
const WINDOW_FIELD = { encounter: "e", round: "r", turn: "t" };

/** Uses counted in a window of the running combat (an older count only has `n`, for the window of its own limit). */
function usesIn(u, combat, per) {
  if ( !sameWindow(u, combat, per) ) return 0;
  const field = WINDOW_FIELD[per];
  return Number((field in u) ? u[field] : u.n) || 0;
}

/**
 * Every limit of a trigger with the uses already counted (none outside of combat: there it is unlimited).
 * `t.ctx`: the Transformation's variables for a limit that is a formula.
 * @returns {{max: number, per: string, text: string, used: number}[]}
 */
export function triggerLimits(actor, t, key = triggerLimitKey(t)) {
  const combat = encounterOf(actor);
  if ( !combat || blank(t.limit) ) return [];
  const limits = parseLimits(t.limit, { ...(actor.system.rollData ?? {}), ...(t.ctx ?? {}) });
  const u = actor.getFlag("dbu-rpg", "triggerUses")?.[flagKey(key)];
  return limits.map(l => ({ ...l, used: usesIn(u, combat, l.per) }));
}

/** Uses left of a limited trigger in the current combat (unlimited outside of combat). */
export function triggerUsesLeft(actor, t, key = triggerLimitKey(t)) {
  return triggerLimits(actor, t, key).every(l => l.used < l.max);
}

/** Count one use of a limited trigger; false when none is left. */
export async function useTriggerLimit(actor, t, key = triggerLimitKey(t)) {
  const limits = triggerLimits(actor, t, key);
  if ( !limits.length ) return true;
  if ( !limits.every(l => l.used < l.max) ) return false;
  const combat = encounterOf(actor);
  const k = flagKey(key);
  const u = actor.getFlag("dbu-rpg", "triggerUses")?.[k];
  const next = { combat: combat.id, round: combat.round, turn: combat.turn };
  for ( const [per, field] of Object.entries(WINDOW_FIELD) ) next[field] = usesIn(u, combat, per) + 1;
  next.n = next[WINDOW_FIELD[limits[0].per]];
  await actor.update({ [`flags.dbu-rpg.triggerUses.${k}`]: next });
  return true;
}

/* -------------------------------------------- */
/*  Costs and amounts                           */
/* -------------------------------------------- */

/** Names a cost may be written with. */
const COST_KINDS = { ki: "ki", kp: "ki", life: "life", lp: "life", dkp: "dkp", capacity: "capacity", counters: "counters",
  counter: "counters", actions: "actions", action: "actions", power: "power", charges: "charges", charge: "charges",
  res: "res", resource: "res",
  // V: Life Points paid "safely": the Health Thresholds this loss crosses pass their Steadfast Checks and give no
  // Reduced Momentum
  safelife: "safelife", safelp: "safelife",
  // L: Adversary Actions (only an Adversary with One-Man Army has them: its Counter Actions)
  aa: "aa", adversaryactions: "aa" };

/** "ki:2(bT); counters:1; res:Battle Born:all" → [{ kind, amount, name }] (amount: a formula, "all" for a resource). */
export function parseCost(cost) {
  const out = [];
  for ( const part of String(cost ?? "").split(";") ) {
    if ( blank(part) ) continue;
    const [kind, ...rest] = part.split(":").map(s => s.trim());
    const k = COST_KINDS[kind.toLowerCase()] ?? kind;
    if ( k === "res" ) out.push({ kind: k, name: rest[0] ?? "", amount: rest.slice(1).join(":") || "1" });
    else out.push({ kind: k, amount: rest.join(":") || "1" });
  }
  return out;
}

/** Stacks a prepared resource holds (a split one: on every Combat Roll and still to be placed). */
const stacksOf = r => (r.split ? allocTotal(r) + (r.unassigned ?? 0) : (r.value ?? 0));

/**
 * What the costs of one or more triggers take from the actor, and why they cannot be paid (problems). Each entry is
 * { cost, data }: the cost and the formula data it is worked out with (@n, the Transformation's variables...).
 * Ki Points are spent like a Maneuver's: Capacity too (Divine Ki Points when preferred in the God Ki State: half of it;
 * Narrative Stamina first for an Adversary that pays with it), Divine Ki Points with half the Capacity. Actions and
 * Counter Actions are only spent in a Combat Encounter.
 * @returns {{problems: string[], need: object, res: object[], text: string, empty: boolean}}
 */
export function costPlan(actor, entries) {
  const sys = actor.system;
  const need = {};
  const res = [];
  const problems = [];
  for ( const { cost, data = {} } of entries ) {
    for ( const c of parseCost(cost) ) {
      if ( c.kind === "res" ) {
        const r = (sys.resources ?? []).find(x => resourceSlug(x.name) === resourceSlug(c.name));
        const have = r ? stacksOf(r) : 0;
        const all = /^all$/i.test(c.amount);
        const n = all ? have : Math.max(0, evaluate(c.amount, data));
        const name = r?.name ?? c.name;
        const prev = res.find(x => resourceSlug(x.name) === resourceSlug(name));
        if ( prev ) prev.n += n;
        else res.push({ name, n, have, all });
        if ( all && !have ) problems.push(L("DBU.Trigger.CostNeed", { what: name, need: 1, have }));
        continue;
      }
      if ( c.kind === "aa" ) {
        if ( !sys.adversaryInfo?.oneManArmy ) { problems.push(L("DBU.Adversary.NoOneManArmy")); continue; }
        need.counters = (need.counters ?? 0) + Math.max(0, evaluate(c.amount, data));
        continue;
      }
      if ( !["ki", "life", "safelife", "dkp", "capacity", "counters", "actions", "power", "charges"].includes(c.kind) ) {
        problems.push(`${c.kind}?`);
        continue;
      }
      need[c.kind] = (need[c.kind] ?? 0) + Math.max(0, evaluate(c.amount, data));
    }
  }
  const fighting = !!encounterOf(actor);
  if ( !fighting ) { delete need.actions; delete need.counters; }
  const check = (what, n, have) => { if ( n > have ) problems.push(L("DBU.Trigger.CostNeed", { what, need: n, have })); };
  const noCapacity = ignoresCapacity(actor);
  const divine = !!(sys.dkp?.usable && sys.dkp.prefer);
  let capacity = need.capacity ?? 0;
  if ( need.ki ) {
    const stamina = divine ? { fromStamina: 0, fromKi: need.ki } : staminaPayment(actor, need.ki);
    need.kiPool = divine ? "dkp" : "ki";
    need.kiPaid = stamina.fromKi;
    need.stamina = stamina.fromStamina;
    capacity += divine ? Math.ceil(need.ki / 2) : need.ki;
  }
  if ( need.dkp ) capacity += Math.ceil(need.dkp / 2);
  if ( noCapacity ) capacity = 0;
  need.capacityTotal = capacity;
  // Ki Points from the Divine Ki pool add to an explicit Divine Ki cost
  const kpFromKi = (need.kiPool === "ki") ? need.kiPaid : 0;
  const dkpTotal = (need.dkp ?? 0) + ((need.kiPool === "dkp") ? need.kiPaid : 0);
  if ( kpFromKi ) check("KP", kpFromKi, sys.ki?.value ?? 0);
  if ( dkpTotal ) check("DKP", dkpTotal, sys.dkp?.value ?? 0);
  if ( need.life || need.safelife ) check("LP", (need.life ?? 0) + (need.safelife ?? 0), sys.life?.value ?? 0);
  if ( capacity ) check(L("DBU.Capacity"), capacity, sys.capacity?.value ?? 0);
  if ( need.counters ) check("Counter", need.counters, sys.combat?.counters ?? 0);
  if ( need.actions ) check(L("DBU.Actions"), need.actions, sys.combat?.actions ?? 0);
  if ( need.power ) check("Power", need.power, sys.combat?.power ?? 0);
  if ( need.charges ) check("Energy Charges", need.charges, sys.combat?.energyCharges ?? 0);
  for ( const r of res ) if ( !r.all ) check(r.name, r.n, r.have);
  const text = [
    need.ki ? `${need.ki} ${divine ? "DKP" : "KP"}` : "", need.dkp ? `${need.dkp} DKP` : "", need.life ? `${need.life} LP` : "",
    need.safelife ? `${need.safelife} LP` : "",
    need.capacity ? `${need.capacity} ${L("DBU.Capacity")}` : "", need.counters ? `${need.counters} Counter` : "",
    need.actions ? `${need.actions} ${L("DBU.Actions")}` : "", need.power ? `${need.power} Power` : "",
    need.charges ? `${need.charges} Energy Charge(s)` : "", ...res.filter(r => r.n).map(r => `${r.n} ${r.name}`)
  ].filter(Boolean).join(", ");
  return { problems, need, res, text, empty: !text };
}

/** The cost of one trigger (see costPlan). */
export function triggerCostPlan(actor, cost, data = {}) {
  return costPlan(actor, [{ cost, data }]);
}

/**
 * Pay what a cost plan takes (checked first with costPlan). Losing Life Points this way is self-inflicted.
 * @returns {Promise<string>}  What was paid ("4 KP, 1 Counter"), "" when nothing
 */
export async function payTriggerCost(actor, plan, { resEvent = false } = {}) {
  if ( !plan || plan.empty ) return "";
  const sys = actor.system;
  const need = plan.need;
  // B2: what a cost takes fires "resourceSpend" (@viaCost), unless it is paid by a resource event's own trigger
  const via = { dbuSource: "cost", ...(resEvent ? { dbuResEvent: true } : {}) };
  const updates = {};
  if ( need.kiPaid ) updates[`system.${need.kiPool}.value`] = Math.max(0, (sys[need.kiPool]?.value ?? 0) - need.kiPaid);
  if ( need.stamina ) updates["system.adversary.stamina"] = Math.max(0, (sys.adversary?.stamina ?? 0) - need.stamina);
  if ( need.dkp ) {
    const from = updates["system.dkp.value"] ?? sys.dkp?.value ?? 0;
    updates["system.dkp.value"] = Math.max(0, from - need.dkp);
  }
  if ( need.life || need.safelife ) updates["system.life.value"] = (sys.life?.value ?? 0) - (need.life ?? 0) - (need.safelife ?? 0);
  if ( need.capacityTotal ) updates["system.capacity.value"] = Math.max(0, (sys.capacity?.value ?? 0) - need.capacityTotal);
  if ( need.counters ) updates["system.combat.counters"] = Math.max(0, (sys.combat?.counters ?? 0) - need.counters);
  if ( need.actions ) updates["system.combat.actions"] = Math.max(0, (sys.combat?.actions ?? 0) - need.actions);
  if ( need.charges ) updates["system.combat.energyCharges"] = Math.max(0, (sys.combat?.energyCharges ?? 0) - need.charges);
  // (V: only "safelife" LP: a safe loss; with "life" LP too, the usual self-inflicted loss)
  const lifeVia = need.life ? { dbuSelfInflicted: true } : (need.safelife ? { dbuSelfInflicted: true, dbuSafeLoss: true } : {});
  if ( !foundry.utils.isEmpty(updates) ) await actor.update(updates, { ...lifeVia, ...via });
  // Power: its timers go with it (and a lower Max Capacity lowers the Capacity)
  if ( need.power ) {
    const cur = actor.system.combat.power ?? 0;
    if ( typeof actor.setPower === "function" ) await actor.setPower(Math.max(0, cur - need.power), { via: "cost", resEvent });
    else await actor.update({ "system.combat.power": Math.max(0, cur - need.power) });
  }
  // Split resources (Battle Born) lose the stacks not placed yet first, then from the Combat Roll with the most
  for ( const r of plan.res ) if ( r.n > 0 ) await changeStacks(actor, r.name, -r.n, { via: "cost", resEvent });
  return plan.text;
}

/* -------------------------------------------- */
/*  Resource events (B2)                        */
/* -------------------------------------------- */

/** A modifier or trigger of the actor reads @resGained / @resSpent (only then is the round's count kept). */
function readsRoundRes(actor) {
  const re = /res(Gained|Spent)\./;
  const pieces = [...(actor.system?.customModifiers ?? []), ...(actor.system?.customTriggers ?? [])];
  for ( const i of actor.items ?? [] ) pieces.push(...(i.system?.modifiers ?? []), ...(i.system?.triggers ?? []));
  return pieces.some(p => re.test(`${p.value ?? ""} ${p.condition ?? ""} ${p.cost ?? ""} ${p.amount ?? ""}`));
}

/** Count what was gained / spent this Combat Round (flags.dbu-rpg.roundRes = { combat, round, gained, spent }). */
async function trackRoundRes(actor, field, slug, n) {
  const combat = encounterOf(actor);
  if ( !combat || !(n > 0) || !actor.isOwner || !readsRoundRes(actor) ) return;
  const prev = actor.getFlag("dbu-rpg", "roundRes");
  const same = prev && (prev.combat === combat.id) && (prev.round === combat.round);
  const next = { combat: combat.id, round: combat.round, gained: same ? { ...(prev.gained ?? {}) } : {}, spent: same ? { ...(prev.spent ?? {}) } : {} };
  next[field][slug] = (next[field][slug] ?? 0) + n;
  // A new round starts from nothing: setFlag merges objects, so the old round's counts would stay in it
  if ( prev && !same ) await actor.unsetFlag("dbu-rpg", "roundRes");
  await actor.setFlag("dbu-rpg", "roundRes", next);
}

/**
 * The system gained or spent stacks of a sheet resource, Power, Life Points or Ki Points (`slug`: the resource's slug,
 * "power", "life", "ki"): count it for the round and fire "resourceGain" (@gained after the caps, @wanted before them,
 * @overflow, @res_<slug>, @viaSurge, @viaRecovery, @viaTrigger) or "resourceSpend" (@spent, @res_<slug>, @viaCost,
 * @viaDamage). `via`: what did it ("trigger", "cost", "maneuver", "surge", "recovery", "legend", "regen", "dot",
 * "empower"...). Nothing fires for the gains and spends of a resource event's own triggers (`resEvent`).
 */
export async function resourceEvent(actor, kind, { slug, n = 0, wanted = n, via = "", damage = false, resEvent = false } = {}) {
  if ( !actor?.system?.top || resEvent || !slug ) return;
  const gain = kind === "gain";
  if ( gain ? !(Math.max(n, wanted) > 0) : !(n > 0) ) return;
  await trackRoundRes(actor, gain ? "gained" : "spent", slug, Math.max(0, n));
  const scope = gain
    ? { gained: Math.max(0, n), wanted: Math.max(n, wanted), overflow: Math.max(0, wanted - n), [`res_${slug}`]: 1,
      viaSurge: (via === "surge") ? 1 : 0, viaRecovery: (via === "recovery") ? 1 : 0, viaTrigger: (via === "trigger") ? 1 : 0 }
    : { spent: n, [`res_${slug}`]: 1, viaCost: ["cost", "maneuver", "attack"].includes(via) ? 1 : 0, viaAttack: (via === "attack") ? 1 : 0,
      viaDamage: damage ? 1 : 0 };
  fireEvent(actor, gain ? "resourceGain" : "resourceSpend", { scope });
}

/** How many (1 … max) the player uses: the `amount` of a trigger. null when cancelled. */
/**
 * M: the resources a "resourcePick" effect offers: its names ("Flame Stance|Wind Stance"), and for an entry "* <suffix>"
 * ("* Stance") every sheet resource whose name ends with it plus every one the character's pieces read (@res.<x>stance →
 * "X Stance").
 */
export function pickOptions(actor, spec) {
  const out = [];
  const add = n => { if ( n && !out.some(o => resourceSlug(o) === resourceSlug(n)) ) out.push(n); };
  for ( const part of String(spec ?? "").split("|").map(p => p.trim()).filter(Boolean) ) {
    if ( !part.startsWith("*") ) { add(part); continue; }
    const suffix = part.slice(1).trim();
    const sfx = resourceSlug(suffix);
    if ( !sfx ) continue;
    for ( const r of actor.system?.resources ?? [] ) if ( resourceSlug(r.name).endsWith(sfx) && (resourceSlug(r.name) !== sfx) ) add(r.name);
    const re = new RegExp(`@res\\.([a-z0-9]+)${sfx}(?![a-z0-9])`, "g");
    for ( const i of actor.items ?? [] ) {
      // (only the items that work now: a Grand Awakening's Void Stance is not offered before it is active)
      const works = i.system?.isActive ?? true;
      for ( const p of [...(i.system?.modifiers ?? []), ...(i.system?.triggers ?? [])] ) {
        if ( !works && !p.always ) continue;
        for ( const m of `${p.condition ?? ""} ${p.value ?? ""}`.matchAll(re) ) {
          add(`${m[1].charAt(0).toUpperCase()}${m[1].slice(1)} ${suffix}`);
        }
      }
    }
  }
  return out;
}

/** M: which of the resources to keep at 1 ("" = none of them); null when cancelled. */
async function askPick(title, names, current = "") {
  const opts = [`<option value="">${L("DBU.Trigger.PickNone")}</option>`,
    ...names.map(n => `<option value="${String(n).replace(/"/g, "&quot;")}" ${(n === current) ? "selected" : ""}>${n}</option>`)];
  const v = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-list" },
    content: `<div class="dbu-dialog"><div class="form-group"><label>${L("DBU.Trigger.PickAsk")}</label>
      <select name="pick">${opts.join("")}</select></div></div>`,
    buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), icon: "fa-solid fa-check", default: true,
      callback: (event, button) => String(button.form.elements.pick.value ?? "") },
    { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }],
    rejectClose: false
  });
  return (typeof v === "string") ? v : null;
}

export async function askAmount(title, max, hint = "") {
  max = Math.max(1, Math.floor(max));
  if ( max === 1 ) return 1;
  const n = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-hashtag" },
    content: `<div class="dbu-dialog">${hint ? `<p class="hint">${hint}</p>` : ""}<div class="form-group">
      <label>${L("DBU.Trigger.AmountAsk", { max })}</label>
      <input type="number" name="n" value="${max}" min="1" max="${max}" step="1" autofocus></div></div>`,
    buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), icon: "fa-solid fa-check", default: true,
      callback: (event, button) => Number(button.form.elements.n.value) || 0 },
    { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }],
    rejectClose: false
  });
  if ( (typeof n !== "number") || (n < 1) ) return null;
  return Math.clamp(Math.floor(n), 1, max);
}

/**
 * A trigger used by hand (a chat button): ask the amount, work out its value with @n and check its cost.
 * `p`: { cost, amount, formula, effect, value, scope, label, ctx }. null when the player cancels.
 * @returns {Promise<{n: number, value: number, plan: object|null}|null>}
 */
export async function prepareTriggerUse(actor, p) {
  const base = { ...(actor.system.rollData ?? {}), ...(p.scope ?? {}) };
  let n = 1;
  if ( !blank(p.amount) ) {
    const max = evaluate(p.amount, { ...base, n: 1 });
    if ( max < 1 ) return { n: 0, value: 0, plan: { problems: [L("DBU.TraitUse.NoAmount")] } };
    n = await askAmount(p.label ?? "", max);
    if ( !n ) return null;
  }
  const data = { ...base, n };
  const value = ["state", "condition"].includes(p.effect) && blank(p.formula) ? 1
    : (("formula" in p) ? evaluate(p.formula, data) : (Number(p.value) || 0));
  return { n, value, plan: blank(p.cost) ? null : triggerCostPlan(actor, p.cost, data) };
}

/**
 * The chat button of an "ask" trigger (a maneuver, a trigger with an amount to pick). Its cost and amount are paid /
 * asked when it is clicked: the payload then carries the formulas and the event's variables (`scope`).
 */
function askButton(actor, t, { who = actor, value, options, limitKey = null, scope = {}, data = {}, limits = true }) {
  const label = options.label;
  const payload = { effect: t.effect, value, resource: t.resource, ...options };
  // "targeted": the clicking user's target, resolved when the button is clicked
  const targeted = t.target === "targeted";
  if ( limits ) {
    Object.assign(payload, { targetUuid: (who !== actor) && !targeted ? who.uuid : null, limitKey: t.limit ? limitKey : null, limit: t.limit || null });
    // A limit that is a formula ("M/Encounter") is worked out again with the Transformation's variables
    if ( t.limit && !plainLimit(t.limit) ) payload.ctx = t.ctx ?? {};
  }
  if ( targeted ) payload.targeted = true;
  let extra = "";
  if ( !blank(t.cost) || !blank(t.amount) ) {
    Object.assign(payload, { cost: t.cost ?? "", amount: t.amount ?? "", formula: t.value ?? "", scope });
    const max = blank(t.amount) ? 0 : evaluate(t.amount, data);
    const plan = blank(t.cost) ? null : triggerCostPlan(actor, t.cost, data);
    extra = [max ? L("DBU.Trigger.UpTo", { max }) : "", plan?.text ? L("DBU.Trigger.CostShort", { cost: plan.text }) : ""]
      .filter(Boolean).join(" · ");
  }
  const whom = targeted ? ` (${L("DBU.Trigger.Target.targeted")})` : (who !== actor ? ` (${who.name})` : "");
  return {
    action: "applyTrigger", icon: "fa-solid fa-check", actorUuid: actor.uuid,
    label: `${label}${whom}: ${describeEffect(t.effect, value, t.resource, options.duration)}${extra ? ` (${extra})` : ""}`,
    payload: JSON.stringify(payload)
  };
}

/**
 * Run the triggers of an actor for a combat event and report them in chat.
 * @param {Actor} actor
 * @param {string} event
 * @param {{round?: number, turn?: number}} context
 */
export async function runTriggers(actor, event, { round = 0, turn = 0 } = {}) {
  if ( !actor?.system?.top ) return;
  const triggers = collectTriggers(actor, event);
  if ( !triggers.length ) return;
  const data = { ...(actor.system.rollData ?? {}), ...triggerData(actor), round, turn, even: (round % 2 === 0) ? 1 : 0 };
  const lines = [];
  const buttons = [];
  const pendingEffects = [];
  const blocked = new Set();
  const rolls = new Map();
  const rolledButtons = new Map();
  // D: the ones that go to several Characters ("allies" / "team" / "opponents") run like the other events' triggers
  if ( triggers.some(manyTargets) ) await runEventTriggers(actor, event, { scope: { turn, even: (round % 2 === 0) ? 1 : 0 }, manyOnly: true });
  for ( const t of triggers ) {
    if ( manyTargets(t) ) continue;
    let scope = { ...data, ...t.ctx, n: 1 };
    const button = isButton(t);
    const rolled = !blank(t.roll) || !blank(t.check);
    if ( !rolled && !test(t.condition, scope) ) continue;
    const label = t.label || t.source;
    // B4: the roll / check of an automatic trigger is made now, a button's when it is clicked
    if ( rolled && !button ) {
      if ( !triggerUsesLeft(actor, t, triggerLimitKey(t)) ) continue;
      scope = await rollAndCheck(actor, t, scope, { other: null, rolls, label, lines });
      if ( !scope ) continue;
    }
    else if ( rolled && !maybeHolds(t, scope) ) continue;
    if ( (t.effect === "message") || (t.mode === "remind") ) {
      lines.push(`${label}${t.value && (t.effect === "message") ? `: ${t.value}` : ""}`);
      continue;
    }
    const value = ["state", "condition"].includes(t.effect) && !t.value ? 1 : evaluate(t.value, scope);
    const options = { duration: baseDuration(t.duration), ...rawOf(t.duration), event, label, itemId: t.itemId ?? null, ...effectOptions(actor, actor, t, event) };
    // Its limit ("[Triggered/Start of Turn, 1/Encounter]"): a button only while uses are left, counted when clicked. The
    // copies of a per-Stack choice follow their first one (the limit counts once)
    const limitKey = triggerLimitKey(t);
    if ( t.copy ? blocked.has(limitKey) : !triggerUsesLeft(actor, t, limitKey) ) {
      blocked.add(limitKey);
      continue;
    }
    if ( button ) {
      const btnScope = { round, turn, even: data.even, ...t.ctx };
      const gk = groupKey(t, rolled, rolledButtons);
      if ( gk ) {
        const g = rolledButtons.get(gk);
        if ( g ) g.items.push({ t, who: actor, options, value });
        else rolledButtons.set(gk, { t, who: actor, value, options, limitKey, scope: btnScope, data: scope, items: [{ t, who: actor, options, value }] });
        continue;
      }
      buttons.push(askButton(actor, t, { value, options, limitKey, scope: btnScope, data: scope }));
      continue;
    }
    pendingEffects.push({ effect: t.effect, value, resource: t.resource, label, options, cost: t.cost, data: scope, t, limitKey });
  }
  for ( const e of pendingEffects ) {
    // An automatic trigger with a cost pays it when it can
    let paid = "";
    if ( !blank(e.cost) ) {
      const plan = triggerCostPlan(actor, e.cost, e.data);
      if ( plan.problems.length ) {
        lines.push(`${e.label}: ${L("DBU.Trigger.CantPay", { why: plan.problems.join(" ") })}`);
        continue;
      }
    }
    if ( !e.t.copy && !(await useTriggerLimit(actor, e.t, e.limitKey)) ) continue;
    if ( !blank(e.cost) ) paid = await payTriggerCost(actor, triggerCostPlan(actor, e.cost, e.data));
    const text = await applyTriggerEffect(actor, e.effect, e.value, e.resource, e.options);
    if ( text || paid ) lines.push(`${e.label}: ${[text, paid ? L("DBU.Trigger.Paid", { cost: paid }) : ""].filter(Boolean).join(" · ")}`);
  }
  for ( const g of rolledButtons.values() ) buttons.push(rolledButton(actor, g));
  if ( lines.length || buttons.length ) {
    await postInfoCard({ actor, title: L(`DBU.Trigger.Event.${event}`, { name: actor.name, round }), lines, buttons });
  }
}

/* -------------------------------------------- */
/*  Activated Traits (event "use")              */
/* -------------------------------------------- */

/** The value of a trigger's effect: a State or Combat Condition without one is level 1; a message or reminder has none. */
const effectValue = (t, data) => (((t.effect === "message") || (t.mode === "remind")) ? 0
  : ((["state", "condition"].includes(t.effect) && !t.value) ? 1 : evaluate(t.value, data)));

/** Formula data of a Trait used from the sheet: @myTurn (1 during your turn), @inCombat, @round, @turn. */
function useData(actor, triggers = []) {
  const combat = encounterOf(actor);
  return { ...(actor.system.rollData ?? {}), ...triggerData(actor), ...versusVars(actor, currentTarget(actor), triggers),
    round: combat?.round ?? 0, turn: combat?.turn ?? 0, myTurn: isActorsTurn(actor) ? 1 : 0, inCombat: combat ? 1 : 0 };
}

/** The condition of a use: a trigger with a roll or a check holds while some result of it would let it apply. */
const useHolds = (t, data) => ((!blank(t.roll) || !blank(t.check)) ? maybeHolds(t, data) : test(t.condition, data));

/**
 * The Activated Traits of an actor: its "use" triggers that apply now (active Transformations, Traits possessed at all
 * times, the other items that are in use, the sheet's own triggers). Triggers with the same label and limitKey form ONE
 * use (one button that applies them all).
 * @returns {{key: string, label: string, sources: string[], triggers: object[]}[]}
 */
export function traitUses(actor) {
  const groups = new Map();
  for ( const t of collectTriggers(actor, "use") ) {
    const label = t.label || t.source;
    const key = `${label}|${String(t.limitKey ?? "").trim()}`;
    if ( !groups.has(key) ) groups.set(key, { key, label, sources: [], triggers: [] });
    const g = groups.get(key);
    g.triggers.push(t);
    if ( !g.sources.includes(t.source) ) g.sources.push(t.source);
  }
  return Array.from(groups.values());
}

/**
 * Can a Trait use be used now? The triggers whose condition holds (formula data, the Transformation's variables, @n),
 * the limit they share, the amount to pick and the cost (each trigger's own, once however many Stacks picked it).
 * `reason`: why it cannot ("" when it can).
 */
export function traitUseState(actor, g, { n = 1 } = {}) {
  const base = useData(actor, g.triggers);
  const live = g.triggers.filter(t => useHolds(t, { ...base, ...t.ctx, n }));
  // What a use would take is shown even while its condition does not hold
  const own = (live.length ? live : g.triggers).filter(t => !t.copy);
  const holder = own.find(t => !blank(t.limit)) ?? null;
  const limitKey = holder ? triggerLimitKey(holder) : null;
  const limits = holder ? triggerLimits(actor, holder, limitKey) : [];
  const amountOf = own.find(t => !blank(t.amount)) ?? null;
  const amountMax = amountOf ? evaluate(amountOf.amount, { ...base, ...amountOf.ctx, n: 1 }) : 0;
  const plan = costPlan(actor, own.filter(t => !blank(t.cost)).map(t => ({ cost: t.cost, data: { ...base, ...t.ctx, n } })));
  let reason = "";
  if ( !live.length ) reason = L("DBU.TraitUse.Condition");
  else if ( limits.some(l => l.used >= l.max) ) reason = L("DBU.TraitUse.Limit", { limit: holder.limit });
  else if ( amountOf && (amountMax < 1) ) reason = L("DBU.TraitUse.NoAmount");
  else if ( plan.problems.length ) reason = L("DBU.Trigger.CantPay", { why: plan.problems.join(" ") });
  return { ok: !reason, reason, base, live, holder, limitKey, limits, amountMax: amountOf ? amountMax : 0, plan };
}

/** The Trait uses for the sheet's Combat tab: label, what it does, its cost and limit, and why it cannot be used. */
export function traitUseRows(actor) {
  return traitUses(actor).map(g => {
    const s = traitUseState(actor, g);
    const counts = new Map();
    for ( const t of (s.live.length ? s.live : g.triggers) ) {
      const text = (t.effect === "message") ? (t.value || t.label || "") : ((t.mode === "remind") ? (t.label || "")
        : describeEffect(t.effect, effectValue(t, { ...s.base, ...t.ctx, n: 1 }), t.resource, t.duration ?? "none"));
      if ( text ) counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    const effects = Array.from(counts.entries()).map(([text, k]) => (k > 1 ? `${text} ×${k}` : text));
    const limitText = s.limits.length ? s.limits.map(l => `${l.text} (${L("DBU.TraitUse.Used", { n: l.used })})`).join(", ")
      : (s.holder?.limit ?? "");
    const tip = [
      s.reason ? `<strong>${foundry.utils.escapeHTML(s.reason)}</strong>` : "",
      L("DBU.Traits.From", { name: foundry.utils.escapeHTML(g.sources.join(", ")) }),
      ...effects.map(e => foundry.utils.escapeHTML(e)),
      s.amountMax ? L("DBU.Trigger.UpTo", { max: s.amountMax }) : "",
      s.plan.text ? L("DBU.Trigger.CostShort", { cost: s.plan.text }) : "",
      limitText ? `${L("DBU.Trigger.LimitLabel")}: ${limitText}` : ""
    ].filter(Boolean).join("<br>");
    const first = s.limits[0];
    return { key: g.key, label: g.label, blocked: !s.ok, tip, uses: first ? `${Math.max(0, first.max - first.used)}/${first.max}` : "",
      cost: s.plan.text };
  });
}

/**
 * Use an Activated Trait (a button of the sheet): check its condition and limit, ask the amount, pay the cost, then
 * apply every effect. A "maneuver" effect is an Out-of-Sequence Maneuver (an Instant Maneuver spends no Action); an
 * effect on the "other" Character goes to your target.
 */
export async function useTrait(actor, key) {
  const g = traitUses(actor).find(x => x.key === key);
  if ( !g ) return null;
  if ( readsVs(g.triggers) ) await versusModule();
  let s = traitUseState(actor, g);
  if ( !s.ok ) return ui.notifications.warn(`${g.label}: ${s.reason}`);
  let n = 1;
  if ( s.amountMax ) {
    n = await askAmount(g.label, s.amountMax);
    if ( !n ) return null;
    s = traitUseState(actor, g, { n });
    if ( !s.ok ) return ui.notifications.warn(`${g.label}: ${s.reason}`);
  }
  // An effect on the "other" Character needs a target (and a GM for one you do not own) before the use is counted and
  // paid
  const other = currentTarget(actor);
  const onOther = t => ["other", "targeted"].includes(t.target);
  const needsOther = s.live.some(t => (onOther(t) || (/^\s*clash:/i.test(String(t.check ?? "")) && !manyTargets(t))) && (t.effect !== "message")
    && (t.effect !== "maneuver") && (t.mode !== "remind"));
  if ( needsOther && !other ) return ui.notifications.warn(`${g.label}: ${L("DBU.TraitUse.NoTarget")}`);
  const viaGM = s.live.some(t => onOther(t) && !["mark", "unmark", "message", "maneuver"].includes(t.effect) && (t.mode !== "remind"));
  if ( viaGM && !other.isOwner && !game.users.activeGM ) return ui.notifications.warn(L("DBU.Notify.NoGM"));
  // B3 removeCondition "any": the Condition is picked before the use is counted and paid (a cancel costs nothing, and the
  // GM is not asked for a Character the player does not own)
  const picked = new Map();
  for ( const t of s.live ) {
    if ( t.effect !== "removeCondition" ) continue;
    const pick = await pickRemovedCondition(onOther(t) ? other : actor, t.resource, g.label);
    if ( !pick ) return null;
    picked.set(t, pick.resource);
  }
  if ( s.holder && !(await useTriggerLimit(actor, s.holder, s.limitKey)) ) {
    return ui.notifications.warn(L("DBU.Trigger.LimitUsed", { label: g.label, limit: s.holder.limit }));
  }
  // The values are worked out before the cost is paid (a cost of "all" stacks still sees them)
  const pre = [];
  const runs = [];
  const rolls = new Map();
  // K: the rolls / checks made against each Character of a many-target use
  const rollsByWho = new Map();
  for ( const t of s.live ) {
    let data = { ...s.base, ...t.ctx, n };
    // K: a use that goes to several Characters ("allies" / "team" / "opponents"), each with its own roll / check
    if ( manyTargets(t) ) {
      const rolledT = !blank(t.roll) || !blank(t.check);
      if ( rolledT && (readsVs([t]) || /clash:/i.test(String(t.check ?? ""))) ) await versusModule();
      const clashT = /^\s*clash:/i.test(String(t.check ?? ""));
      for ( const w of whoListOf(t, actor, other, {}) ) {
        let dw = data;
        if ( rolledT ) {
          if ( clashT && (w === actor) ) continue;
          if ( !rollsByWho.has(w.uuid) ) rollsByWho.set(w.uuid, new Map());
          dw = await rollAndCheck(actor, t, { ...data, ...versusVars(actor, w, [t]) }, { other: w, rolls: rollsByWho.get(w.uuid),
            label: `${g.label} → ${w.name}`, lines: pre });
          if ( !dw ) continue;
        }
        runs.push({ t, value: effectValue(t, dw), who: w });
      }
      continue;
    }
    // B4: a roll / check made by the use itself (one per rollKey); the triggers it does not let apply drop out
    if ( !blank(t.roll) || !blank(t.check) ) {
      data = await rollAndCheck(actor, t, data, { other, rolls, label: g.label, lines: pre });
      if ( !data ) continue;
    }
    runs.push({ t, value: effectValue(t, data) });
  }
  const paid = await payTriggerCost(actor, s.plan);
  const lines = [...(paid ? [L("DBU.Trigger.Paid", { cost: paid })] : []), ...pre];
  const later = [];
  for ( const { t, value, who: runWho } of runs ) {
    if ( (t.effect === "message") || (t.mode === "remind") ) {
      lines.push((t.effect === "message") && t.value ? t.value : (t.label || g.label));
      continue;
    }
    // Out-of-Sequence Maneuvers (yours) post their own cards: after this one
    if ( t.effect === "maneuver" ) {
      lines.push(describeEffect(t.effect, value, t.resource));
      later.push({ t, value });
      continue;
    }
    const who = runWho ?? (onOther(t) ? other : actor);
    if ( !who ) {
      lines.push(`${describeEffect(t.effect, value, t.resource, t.duration ?? "none")}: ${L("DBU.TraitUse.NoTarget")}`);
      continue;
    }
    const options = { duration: baseDuration(t.duration), ...rawOf(t.duration), event: "use", label: g.label, itemId: t.itemId ?? null,
      ...timedOptions(actor, who, t.duration), ...effectOptions(actor, who, t, "use"), ...withInflictor(actor, who, t, "use", {}) };
    let text = "";
    const resource = picked.get(t) ?? t.resource;
    // A mark lives on the marker (you): it never needs the marked Character's owner
    if ( who.isOwner || ["mark", "unmark"].includes(t.effect) ) text = await applyTriggerEffect(who, t.effect, value, resource, options);
    // Someone the player does not own: through the GM
    else if ( emitGM("applyTrigger", { uuid: who.uuid, effect: t.effect, value, resource, options }) ) {
      text = describeEffect(t.effect, value, t.resource, options.duration);
    }
    if ( text ) lines.push(`${who !== actor ? `${who.name}: ` : ""}${text}`);
  }
  await postInfoCard({ actor, title: g.label, subtitle: L("DBU.Trigger.Event.use", { name: actor.name }), lines });
  for ( const { t, value } of later ) {
    await applyTriggerEffect(actor, t.effect, value, t.resource, { event: "use", label: g.label, itemId: t.itemId ?? null,
      ...(blank(t.with) ? {} : { with: String(t.with) }) });
  }
  return true;
}

/** Resolve a State or Combat Condition key from a key or an English/Portuguese name ("Surging", "God Ki", "Guard Down"). */
function statusKey(kind, name) {
  const table = kind === "state" ? DBU.states : DBU.conditions;
  const raw = String(name ?? "").trim();
  if ( raw in table ) return raw;
  const norm = s => String(s).toLowerCase().replace(/(special )?(state|combat condition)$/i, "").replace(/[^a-z0-9]/g, "");
  const wanted = norm(raw);
  for ( const key of Object.keys(table) ) {
    if ( (norm(key) === wanted) || (norm(statusLabel(kind, key)) === wanted) ) return key;
  }
  return null;
}

function statusLabel(kind, key) {
  if ( kind === "flag" ) return game.i18n.localize(`DBU.Timed.${key}`);
  return game.i18n.localize(`DBU.${kind === "state" ? "State" : "Condition"}.${key}`);
}

/** The "maneuver" keys that are attacks (their dialog reads the user's targets). */
const ATTACK_KEYS = /^(exploit|feint|basicAttack|signature|item:.*)$/;

/** Target the token of that Character (an actor or token uuid) on the scene, releasing the other targets. */
async function targetOther(uuid) {
  try {
    const doc = await fromUuid(uuid);
    const actor = (doc?.documentName === "Token") ? doc.actor : doc;
    const tokens = actor?.getActiveTokens?.() ?? [];
    const token = (doc?.documentName === "Token") ? doc.object : (tokens.find(t => t.document?.parent === canvas?.scene) ?? tokens[0]);
    token?.setTarget?.(true, { releaseOthers: true, groupSelection: false });
  } catch(err) { console.warn("DBU | target other", err); }
}

/** The Maneuvers of a "maneuver" effect: one ("powerUp") or a list to pick from ("powerUp|energyCharge|empower"). */
const maneuverKeys = resource => String(resource ?? "").split("|").map(s => s.trim()).filter(Boolean);

/** A Maneuver key's label (E2 "item:<Name>": the item's name). */
export const maneuverLabel = key => (String(key ?? "").startsWith("item:") ? String(key).slice(5).trim()
  : game.i18n.localize(`DBU.Trigger.Maneuver.${key}`));

/** Which Maneuver of a list to use Out-of-Sequence (null when cancelled). */
async function pickManeuver(keys, label = "") {
  const key = await DialogV2.wait({
    window: { title: label || L("DBU.Trigger.Effect.maneuver"), icon: "fa-solid fa-forward" },
    content: `<p>${L("DBU.Trigger.ManeuverPick")}</p>`,
    // (an "item:<Name>" key is no action name: the buttons go by their place)
    buttons: [...keys.map((k, i) => ({ action: /^\w+$/.test(k) ? k : `pick${i}`, label: foundry.utils.escapeHTML(maneuverLabel(k)) })),
      { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }],
    rejectClose: false
  });
  const picked = /^pick\d+$/.test(String(key)) ? keys[Number(String(key).slice(4))] : key;
  return (picked && (picked !== "cancel") && keys.includes(picked)) ? picked : null;
}
export { pickManeuver as pickManeuverKey };

/** The Maneuver keys the system uses that are Standard Maneuvers with an Action Cost of 1 Action. */
const STANDARD_KEYS = ["powerUp", "energyCharge", "basicAttack", "signature", "transformation", "movement"];
/** Their items' slugs (an item of the same Maneuver is not listed twice). */
const STANDARD_SLUGS = new Set(["powerup", "energycharge", "basicattack", "signaturetechnique", "transformation", "movement"]);

/**
 * E2 "standard": what a 1-Action Standard Maneuver Out-of-Sequence may be: the Maneuvers the system uses, then the actor's
 * Maneuver and Unique Ability items that are Standard Maneuvers costing 1 Action ("item:<Name>").
 */
export function standardManeuverKeys(actor) {
  const items = Array.from(actor?.items ?? []).filter(i => ["maneuver", "uniqueAbility"].includes(i.type) && !i.system?.villainous
    && /^standard/i.test(String(i.system?.maneuverType ?? "")) && /^\s*1\s*action/i.test(String(i.system?.actionCost ?? ""))
    && !STANDARD_SLUGS.has(viaSlug(i.name)));
  return [...STANDARD_KEYS, ...new Set(items.map(i => `item:${i.name}`))];
}

/** "any!pinned!shaken" → "any (except Pinned, Shaken)"; "shaken" → "Shaken". */
function removeConditionLabel(resource) {
  const [head, ...except] = String(resource ?? "").split("!").map(s => s.trim());
  const name = k => { const key = statusKey("condition", k); return key ? statusLabel("condition", key) : k; };
  const main = ["any", "all"].includes(head.toLowerCase()) ? L(`DBU.Trigger.Condition.${head.toLowerCase()}`) : name(head);
  return except.filter(Boolean).length ? `${main} (${L("DBU.Trigger.Except")} ${except.filter(Boolean).map(name).join(", ")})` : main;
}

/** What a "leave" effect leaves: this Transformation, all, the Enhancements, the Forms, the Grand Awakening or a name. */
function leaveLabel(resource) {
  const k = String(resource ?? "").trim();
  const known = ["", "this", "all", "enhancements", "forms", "grandAwakening"];
  return known.includes(k) ? L(`DBU.Trigger.Leave.${k || "this"}`) : k;
}

function describeEffect(effect, value, resource, duration = "none") {
  const sign = value >= 0 ? `+${value}` : `${value}`;
  const until = (duration && duration !== "none") ? ` (${L(`DBU.Trigger.Duration.${duration}`)})` : "";
  switch ( effect ) {
    case "life": return `${sign} LP`;
    case "ki": return `${sign} KP`;
    case "dkp": return `${sign} DKP`;
    case "capacity": return `${sign} ${L("DBU.Capacity")}`;
    case "counters": return `${sign} Counter`;
    case "holdingBack": return `${sign} Holding Back`;
    case "attackWound": return `${sign} Wound (${L("DBU.Trigger.TheAttack")})`;
    case "resourcePick": return L("DBU.Trigger.PickShort", { what: String(resource ?? "").split("|").map(x => x.trim()).filter(Boolean).join(" / ") });
    case "holdingBackSet": return `Holding Back = ${value}`;
    case "legend": return L("DBU.Legend.Effect", { what: String(resource ?? "").trim() || L("DBU.Legend.CurrentForm") });
    case "provoke": return L("DBU.Exploit.ProvokeEffect");
    case "power": return `${sign} Power`;
    case "maneuver": {
      const keys = maneuverKeys(resource);
      if ( keys.length < 2 ) return `${maneuverLabel(String(resource ?? "").trim())} (Out-of-Sequence)`;
      return `${keys.map(maneuverLabel).join(" / ")} (Out-of-Sequence)`;
    }
    // E3: leave Transformations through an effect
    case "leave": return L("DBU.Trigger.LeaveShort", { what: leaveLabel(resource) });
    case "buff": return `${sign} ${targetLabel(resource)}${until}`;
    case "charges": return `${sign} Energy Charge(s)`;
    case "dot": return `${sign} DOT${until}`;
    // B1 marks, B3 ending effects, C2 Break Value
    case "mark": return L("DBU.Marks.Effect", { mark: String(resource ?? "").trim().replace(/\+$/, "").trim() }) + until;
    case "unmark": return L("DBU.Marks.Unmark", { mark: String(resource ?? "").trim().replace(/\+$/, "").trim() });
    case "removeCondition": return L("DBU.Trigger.RemoveConditionShort", { what: removeConditionLabel(resource), n: value || L("DBU.Trigger.AllStacks") });
    case "leaveState": {
      const key = statusKey("state", resource);
      return L("DBU.Trigger.LeaveStateShort", { what: key ? statusLabel("state", key) : resource });
    }
    case "breakValue": return `${sign} Break Value (${resource})`;
    case "actions": return `${sign} ${L("DBU.Actions")}`;
    case "resource": return `${sign} ${resource}`;
    case "resourceSet": return `${resource} = ${value}`;
    case "state": {
      const key = statusKey("state", resource);
      return `${key ? statusLabel("state", key) : resource}${value > 1 ? ` ${value}` : ""}${until}`;
    }
    case "condition": {
      const key = statusKey("condition", resource);
      return `${key ? statusLabel("condition", key) : resource}${value > 1 ? ` ×${value}` : ""}${until}`;
    }
    default: return "";
  }
}

/**
 * Apply one trigger effect to an actor. Returns a description, or "" when nothing changed.
 * States and Combat Conditions can be timed: they are reverted by {@link expireTimed} when their duration ends.
 */
export async function applyTriggerEffect(actor, effect, value, resource = "", options = {}) {
  const text = await applyEffect(actor, effect, value, resource, options);
  // D1 "fxUsed": a piece of that effect was applied (not the reminders, nor the effects of an fxUsed trigger)
  if ( options.fx && options.fxOwner && (effect !== "message") ) {
    let owner = (options.fxOwner === actor.uuid) ? actor : await Promise.resolve(fromUuid(options.fxOwner)).catch(() => null);
    if ( owner?.documentName === "Token" ) owner = owner.actor;
    if ( owner ) fireEvent(owner, "fxUsed", { other: (owner === actor) ? null : actor, scope: { fxUsed: { [options.fx]: 1 } } });
  }
  return text;
}

async function applyEffect(actor, effect, value, resource = "", { duration = "none", event = "", label = "",
  timedDuration = null, source = null, skip = null, itemId = null, markerUuid = null, inflictor = null, resEvent = false,
  noLeave = false, withMark = null, quietMark = false, with: withSpec = "", fx = "", messageId = null, otherUuid = null } = {}) {
  const sys = actor.system;
  const updates = {};
  // B2: what an effect changes fires the resource events (@viaTrigger), except inside a resource event (no loop)
  const via = { dbuSource: "trigger", ...(resEvent ? { dbuResEvent: true } : {}) };
  switch ( effect ) {
    case "life": {
      // Life Points that cannot be regained (losing them still works)
      if ( (value > 0) && sys.flags?.noLifeRegain ) return L("DBU.Trigger.NoLifeRegain");
      const next = Math.min(sys.life.max, sys.life.value + value);
      if ( next === sys.life.value ) return "";
      updates["system.life.value"] = (sys._effectiveStates?.undying > 0) ? next : Math.max(0, next);
      // V: resource "safe": a loss whose Health Thresholds pass their Steadfast Checks and give no Reduced Momentum
      if ( (value < 0) && /\bsafe\b/i.test(String(resource ?? "")) ) via.dbuSafeLoss = true;
      break;
    }
    // Divine Ki Points: regained or spent, between 0 and the Divine Ki maximum
    case "dkp": {
      const before = sys.dkp?.value ?? 0;
      const next = Math.clamp(before + value, 0, Math.max(before, sys.dkp?.max ?? 0));
      if ( next === before ) return "";
      await actor.update({ "system.dkp.value": next });
      return describeEffect(effect, next - before, resource);
    }
    case "ki": {
      const next = Math.clamp(sys.ki.value + value, 0, sys.ki.max);
      if ( next === sys.ki.value ) return "";
      updates["system.ki.value"] = next;
      break;
    }
    case "capacity": {
      const next = Math.clamp(sys.capacity.value + value, 0, sys.capacity.max);
      if ( next === sys.capacity.value ) return "";
      updates["system.capacity.value"] = next;
      break;
    }
    case "counters": updates["system.combat.counters"] = Math.clamp((sys.combat.counters ?? 0) + value, 0, 6); break;
    // M2: a Wound bonus to the attack of the event (before its Wound Roll)
    case "attackWound": {
      if ( !messageId ) return "";
      const A = await import("./attack.mjs");
      return (await A.addAttackWound(messageId, label, value)) ? describeEffect("attackWound", value, resource) : "";
    }
    // M: pick one of several sheet resources (a Stance, a Mode): it becomes 1, the other ones 0 (the player picks: a button)
    case "resourcePick": {
      const names = pickOptions(actor, resource);
      if ( !names.length ) return "";
      const slugs = new Map((sys.resources ?? []).map(r => [resourceSlug(r.name), r]));
      const current = names.find(n => (slugs.get(resourceSlug(n))?.value ?? 0) > 0) ?? "";
      const choice = await askPick(label || L("DBU.Trigger.PickAsk"), names, current);
      if ( choice === null ) return "";
      for ( const n of names ) {
        const have = slugs.get(resourceSlug(n))?.value ?? 0;
        const want = (n === choice) ? 1 : 0;
        if ( have !== want ) await setStacks(actor, n, want, { label, via: "trigger", resEvent });
      }
      return choice || L("DBU.Trigger.PickNone");
    }
    // G4 Holding Back stacks: gained or lost (holdingBack), or set (holdingBackSet), between 0 and your base Tier of Power
    case "holdingBack":
    case "holdingBackSet": {
      const before = sys.combat.holdingBack ?? 0;
      const max = Math.max(before, sys.top?.base ?? 0);
      const next = Math.clamp((effect === "holdingBack") ? before + value : value, 0, max);
      if ( next === before ) return "";
      // (a Holding Back trigger's own change fires no Holding Back event again)
      const quiet = ["holdingBackGain", "holdingBackLoss"].includes(event) ? { dbuNoHoldingBackEvent: true } : {};
      await actor.update({ "system.combat.holdingBack": next }, { ...via, ...quiet });
      return describeEffect("holdingBack", next - before, resource);
    }
    // Power stacks last until the end of your next turn, like the ones of a Power Up
    // No more than the maximum Power stacks (2, or more with "power.max"), though stacks already above it stay
    case "power": {
      const before = sys.combat.power ?? 0;
      const max = Math.max(before, sys.combat.powerMax ?? 2);
      const next = Math.max(0, (value > 0) ? Math.min(max, before + value) : before + value);
      if ( next === before ) {
        if ( value > 0 ) await resourceEvent(actor, "gain", { slug: "power", n: 0, wanted: value, via: "trigger", resEvent });
        return "";
      }
      await actor.update({ "system.combat.power": next });
      if ( next > before ) await addTimedPower(actor, next - before);
      await resourceEvent(actor, (next > before) ? "gain" : "spend", { slug: "power", n: Math.abs(next - before),
        wanted: (value > 0) ? value : 0, via: "trigger", resEvent });
      return describeEffect(effect, next - before, resource);
    }
    case "charges": updates["system.combat.energyCharges"] = Math.max(0, (sys.combat.energyCharges ?? 0) + value); break;
    // An Out-of-Sequence Maneuver (Power Up, Energy Charge, Combat Recovery, a Surge, an attack, the Transformation
    // Maneuver): it posts its own card and spends no Action. A list ("powerUp|energyCharge|empower") asks which one.
    // Y: this effect provokes the Exploit of the Opponents at that range ("adjacent" by default, "melee", "notLong")
    case "provoke": {
      const X = await import("../rules/exploit.mjs");
      const range = ["adjacent", "melee", "notLong"].includes(String(resource ?? "").trim()) ? String(resource).trim() : "adjacent";
      const list = await X.provokeExploit(actor, "effect", { opponents: X.exploitersAt(actor, range), name: label || "" });
      return list.length ? L("DBU.Exploit.ProvokedShort", { n: list.length }) : L("DBU.Exploit.NoneProvoked");
    }
    // X: the Legend Realized of your current Form (or of the Form named), outside of the Transformation Maneuver
    case "legend": {
      const name = String(resource ?? "").trim();
      const form = name ? itemNamed(actor, name) : (sys.transformation?.forms?.[0] ?? null);
      if ( !form || (form.type !== "transformation") ) return L("DBU.Legend.NoForm");
      if ( !form.system.active ) return L("DBU.Legend.NotIn", { name: form.name });
      const lines = await actor.legendRealized(form, { outside: true });
      return lines.join(" · ") || L("DBU.Legend.NoneNow", { name: form.name });
    }
    case "maneuver": {
      const keys = maneuverKeys(resource);
      // P: an attack of an event's button (the Exploit an Opponent's movement provokes...) targets that other Character
      if ( otherUuid && keys.some(k => ATTACK_KEYS.test(k)) ) await targetOther(otherUuid);
      // B5 "with": one-shot buckets for that use ("surge.healMult=2; actions=3")
      const use = key => actor.useOutOfSequence(key, { ...(blank(withSpec) ? {} : { with: withSpec }), ...(fx ? { viaFx: fx } : {}) });
      if ( keys.length < 2 ) await use(String(resource || ""));
      else {
        const key = await pickManeuver(keys, label);
        if ( key ) await use(key);
      }
      return "";
    }
    case "dot": {
      const before = sys.combat.dot ?? 0;
      updates["system.combat.dot"] = Math.max(0, before + value);
      // B3: timed stacks of Damage Over Time ("until the start of your next turn")
      if ( duration && (duration !== "none") && (value > 0) && encounterOf(actor) ) {
        await actor.update(updates, via);
        await addTimed(actor, { kind: "dot", key: `${label || "DOT"}|${source ?? ""}|${timedDuration ?? duration}`, prev: 0, level: value,
          duration: timedDuration ?? duration, event, label: label || "DOT", source, skip, item: itemId, stack: true });
        return describeEffect(effect, value, resource, duration);
      }
      break;
    }
    // A bonus for a while ("+2(T) Strike until the end of your next turn", "until you leave this Transformation"): a
    // modifier on the sheet, taken out when the duration ends
    case "buff": {
      const target = String(resource ?? "").trim();
      const known = (target in DBU.modifierTargets) || (DBU.MODIFIER_TARGET_PREFIXES ?? []).some(p => target.startsWith(p));
      if ( !known || !value ) return value ? `${target}?` : "";
      const until = (duration && (duration !== "none")) ? duration : "endOfRound";
      // Turns and rounds only pass in a Combat Encounter: outside of one such a bonus would never end
      if ( (until !== "untilRevert") && !encounterOf(actor) ) return L("DBU.Trigger.BuffNoCombat", { what: describeEffect(effect, value, target) });
      const key = `${label || "Buff"} (${target})`;
      const list = foundry.utils.deepClone(sys._source.customModifiers ?? []).filter(m => m.label !== key);
      list.push({ target, value: String(value), condition: "", label: key, active: true });
      await actor.update({ "system.customModifiers": list });
      await addTimed(actor, { kind: "modifier", key, prev: 0, level: 0, duration: timedDuration ?? until, event, label: key, source,
        skip, item: itemId, mark: withMark });
      return describeEffect(effect, value, target, until);
    }
    case "actions": updates["system.combat.actions"] = Math.max(0, (sys.combat.actions ?? 0) + value); break;
    // Stacks: split resources (Battle Born...) ask the owner which Combat Roll gets each new stack;
    // "Battle Born:wound" applies them to that Combat Roll directly
    case "resource": {
      const [name, roll = ""] = String(resource || "Resource").split(":").map(s => s.trim());
      return changeStacks(actor, name, value, { force: DBU.splitRolls.includes(roll) ? roll : "", label, via: "trigger", resEvent });
    }
    case "resourceSet": return setStacks(actor, String(resource || "Resource").split(":")[0].trim(), value, { label, via: "trigger", resEvent });
    case "state":
    case "condition": {
      const key = statusKey(effect, resource);
      if ( !key ) return `${resource}?`;
      const field = effect === "state" ? "states" : "conditions";
      const prev = sys._source[field]?.[key] ?? 0;
      const level = Math.max(prev, Math.max(1, Math.round(value) || 1));
      if ( level !== prev ) {
        if ( effect === "state" ) await actor.setState(key, level, fx ? { viaFx: fx } : {});
        else await actor.setCondition(key, level);
      }
      // U: Compelled toward the Character who inflicted it (@vs.compelledByMe / @vs.compelledToThem, the attack's warning)
      if ( (effect === "condition") && (key === "compelled") && inflictor && (inflictor !== actor.uuid) ) {
        await actor.setFlag("dbu-rpg", "compelledBy", inflictor).catch(() => null);
      }
      // D1: an effect that would put you in a State you are already in ("stateEnter" with @already = 1)
      else if ( (effect === "state") && (prev > 0) ) {
        fireEvent(actor, "stateEnter", { scope: { [`state_${key}`]: 1, level: prev, already: 1, ...(fx ? { viaFx: { [fx]: 1 } } : {}) } });
      }
      if ( duration && (duration !== "none") ) {
        await addTimed(actor, { kind: effect, key, prev, level, duration: timedDuration ?? duration, event, label, source, skip, item: itemId,
          mark: withMark });
      }
      let text = describeEffect(effect, level, key, duration);
      // B4: entering Undying while Defeated ends the Defeat (the Forms it ended stay left); E1: "defeatEnd" with @byUndying
      if ( (effect === "state") && (key === "undying") && (level > prev) && isDefeated(actor) ) {
        actor._dbuDefeatEndBy = "undying";
        await Promise.resolve(actor.toggleStatusEffect?.(CONFIG.specialStatusEffects?.DEFEATED ?? "dead", { active: false })).catch(() => null);
        delete actor._dbuDefeatEndBy;
        text = `${text} · ${L("DBU.Trigger.UndyingDefeated")}`;
      }
      // B3 "inflict": one of your trigger effects gave someone else a Combat Condition
      if ( (effect === "condition") && inflictor && (inflictor !== actor.uuid) && (level > prev) ) {
        const by = await Promise.resolve(fromUuid(inflictor)).catch(() => null);
        const giver = (by?.documentName === "Token") ? by.actor : by;
        if ( giver ) fireEvent(giver, "inflict", { other: actor, scope: { [`cond_${key}`]: 1, level } });
      }
      return text;
    }
    // B1: a mark on another Character (kept on the marker, options.markerUuid); "unmark" on yourself removes every mark of
    // that name you placed
    case "mark":
    case "unmark": {
      let marker = (markerUuid && (markerUuid !== actor.uuid)) ? await Promise.resolve(fromUuid(markerUuid)).catch(() => null) : actor;
      if ( marker?.documentName === "Token" ) marker = marker.actor;
      if ( !marker || blank(resource) ) return "";
      const M = await import("./marks.mjs");
      const self = (marker === actor) || (marker.uuid === actor.uuid);
      if ( effect === "unmark" ) return M.removeMark(marker, resource, self ? null : actor);
      if ( self ) return L("DBU.TraitUse.NoTarget");
      return (await M.placeMark(marker, actor, resource, { duration, label, event, quiet: quietMark })).text;
    }
    // B3: remove a Combat Condition (a key, "any" the player picks, "all"; "!key" never), value stacks (blank: all)
    case "removeCondition": return removeConditions(actor, resource, value, { label });
    // B3: leave a State, even one another effect gave (its timed entries go with it)
    case "leaveState": {
      const key = statusKey("state", resource);
      if ( !key ) return `${resource}?`;
      const before = sys._source.states?.[key] ?? 0;
      await dropTimedEntries(actor, e => (e.kind === "state") && (e.key === key));
      if ( !before ) return "";
      await actor.setState(key, 0, noLeave ? { noLeave: true } : {});
      return describeEffect(effect, value, key);
    }
    // E3: leave Transformations through an effect ("" / this, all, enhancements, forms, grandAwakening, a slug); value 2:
    // without the Stress Exhaustion of the Exhausting Aspect
    case "leave": {
      const { leaveTransformations } = await import("../rules/transform-rules.mjs");
      return leaveTransformations(actor, resource, { itemId, quiet: value === 2, why: label });
    }
    // C2: the Break Value of an Apparel piece (rules/apparel.mjs, Package C)
    case "breakValue": {
      try {
        const A = await import("../rules/apparel.mjs");
        if ( typeof A.changeBreakValue === "function" ) return (await A.changeBreakValue(actor, String(resource ?? "").trim(), value)) ?? "";
      } catch(err) { /* not there yet */ }
      return `${describeEffect(effect, value, resource)}?`;
    }
    default: return "";
  }
  await actor.update(updates, via);
  return describeEffect(effect, value, resource);
}

/** Is the actor Defeated (its Defeated status, or no Life Points while not Undying)? */
function isDefeated(actor) {
  const id = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  if ( actor.statuses?.has?.(id) ) return true;
  return ((actor.system?.life?.value ?? 1) <= 0) && !((actor.system?._effectiveStates?.undying ?? 0) > 0);
}

/**
 * B3 "removeCondition": `resource` = a Condition key, "any" (the player picks one) or "all", with exclusions
 * ("any!pinned!suffocating"); `value` = stacks to remove (0 / blank: all of them). A Condition held by something else (a
 * token icon, an Injury, a Grapple) cannot be removed: the line says by what.
 */
async function removeConditions(actor, resource, value, { label = "" } = {}) {
  const c = conditionChoices(actor, resource);
  if ( c.unknown ) return `${c.unknown}?`;
  const { level, held, heldLine } = c;
  let keys = c.keys;
  if ( c.mode === "any" ) {
    if ( !c.free.length ) return keys.map(heldLine).join(" · ");
    const pick = await pickCondition(c.free, label);
    if ( !pick ) return "";
    keys = [pick];
  }
  const out = [];
  for ( const k of keys ) {
    if ( held(k) || !(level(k) > 0) ) {
      out.push(heldLine(k));
      continue;
    }
    const before = level(k);
    const n = Math.round(Number(value) || 0);
    const next = (n > 0) ? Math.max(0, before - n) : 0;
    await actor.setCondition(k, next);
    if ( next === 0 ) await dropTimedEntries(actor, e => (e.kind === "condition") && (e.key === k));
    out.push(L("DBU.Trigger.ConditionRemoved", { what: statusLabel("condition", k), n: before - next }));
  }
  return out.join(" · ");
}

/**
 * What a removeCondition `resource` may take from the actor: `keys` (the Conditions it names that the actor suffers),
 * `free` (the ones "any" may pick: not held by something else), `unknown` (a key that is no Condition).
 */
function conditionChoices(actor, resource) {
  const sys = actor.system;
  const [head = "", ...rest] = String(resource ?? "").split("!").map(s => s.trim());
  const except = new Set(rest.map(k => statusKey("condition", k)).filter(Boolean));
  const mode = head.toLowerCase();
  const level = k => sys._source?.conditions?.[k] ?? 0;
  const held = k => (sys.conditionHolds?.[k]?.length ? sys.conditionHolds[k] : null);
  const has = k => (level(k) > 0) || ((sys.effectiveConditions?.[k] ?? 0) > 0);
  const heldLine = k => L("DBU.Trigger.ConditionHeld", { what: statusLabel("condition", k),
    by: (held(k) ?? [L("DBU.Condition.HeldByIcon")]).join(", ") });
  let keys;
  if ( ["any", "all"].includes(mode) ) keys = Object.keys(DBU.conditions).filter(k => !except.has(k) && has(k));
  else {
    const key = statusKey("condition", head);
    if ( !key ) return { mode, keys: [], free: [], unknown: head, level, held, heldLine };
    keys = (has(key) && !except.has(key)) ? [key] : [];
  }
  return { mode, keys, free: keys.filter(k => !held(k) && (level(k) > 0)), unknown: null, level, held, heldLine };
}

/**
 * A chat button of a removeCondition "any": the clicking user picks the Condition BEFORE the use is counted and paid
 * (and before the effect may go through the GM, who would otherwise be asked).
 * @returns {Promise<{resource: string}|null>}  the resource to apply (the key picked), null when cancelled
 */
export async function pickRemovedCondition(actor, resource, label = "") {
  if ( !actor?.system ) return { resource };
  const c = conditionChoices(actor, resource);
  if ( (c.mode !== "any") || !c.free.length ) return { resource };
  const key = await pickCondition(c.free, label);
  return key ? { resource: key } : null;
}

/** Which Combat Condition to remove (null when cancelled). */
export async function pickCondition(keys, label = "") {
  const key = await DialogV2.wait({
    window: { title: label || L("DBU.Trigger.Effect.removeCondition"), icon: "fa-solid fa-eraser" },
    content: `<p>${L("DBU.Trigger.ConditionPick")}</p>`,
    buttons: [...keys.map(k => ({ action: k, label: statusLabel("condition", k) })),
      { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }],
    rejectClose: false
  });
  return (key && (key !== "cancel") && keys.includes(key)) ? key : null;
}



/* -------------------------------------------- */
/*  Timed States, Combat Conditions and Power   */
/* -------------------------------------------- */

/** The combat event at which each duration is checked. */
const EXPIRES_AT = { endOfTurn: "endOfTurn", endOfNextTurn: "endOfTurn", startOfNextTurn: "startOfTurn", endOfRound: "endOfRound",
  endOfNextRound: "endOfRound" };

/** Is it this actor's turn in the running combat? */
function isActorsTurn(actor) {
  // The encounter the actor takes part in (the tracker may show another one)
  const combat = encounterOf(actor);
  return !!combat && (combat.combatant?.actor?.uuid === actor.uuid);
}

/** Is this actor taking part in a running combat? */
export function inCombat(actor) {
  return !!encounterOf(actor);
}

/** The started Combat Encounter the actor takes part in (not only the one the tracker shows), or null. */
export function encounterOf(actor) {
  return game.combats?.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor?.uuid)) ?? null;
}

/**
 * Remember an effect that ends with a duration (flags.dbu-rpg.timed). Package B extras: `mark` (the mark
 * "<marker uuid>|<slug>" it ends with), `target` (a mark's Character, for the chat line), `stack` (timed DOT: the stacks of
 * one source add up in one entry).
 */
export async function addTimed(actor, { kind, key, prev, level, duration, event, label, rounds = 0, source = null, skip: forced = null,
  item = null, mark = null, target = null, stack = false }) {
  const list = foundry.utils.deepClone(actor.getFlag("dbu-rpg", "timed") ?? []);
  const existing = list.find(e => (e.kind === kind) && (e.key === key));
  // "Until the end of your next turn" started during your own turn skips the end of the current turn
  const turnEvents = ["startOfTurn", "endOfTurn", "startOfRound", "endOfRound", "startOfEncounter"];
  // (the start of SOMEONE ELSE's turn, when the effect goes to another Character, is not this one's turn)
  const ownTurn = turnEvents.includes(event) ? ((event === "startOfTurn") && isActorsTurn(actor)) : isActorsTurn(actor);
  let skip = ((duration === "endOfNextTurn") && ownTurn) ? 1 : 0;
  // "For N Combat Rounds": the current round counts as the first one
  if ( (duration === "endOfRound") && (rounds > 1) ) skip = rounds - 1;
  // "Until the end of the next Combat Round": the end of this one does not count
  if ( duration === "endOfNextRound" ) skip = 1;
  if ( forced !== null ) skip = forced;
  // "endOfSourceTurn": ends with the turn of another character (the one whose effect caused it)
  // "untilRevert": ends when the character leaves the Transformation `item` (or with the Combat Encounter)
  const entry = { level, duration, skip, label, ...(source ? { source } : {}), ...((duration === "untilRevert") && item ? { item } : {}),
    ...(mark ? { mark } : {}), ...(target ? { target } : {}) };
  if ( existing && stack ) entry.level = (existing.level ?? 0) + level;
  if ( existing ) Object.assign(existing, entry);
  else list.push({ kind, key, prev, ...entry });
  await actor.setFlag("dbu-rpg", "timed", list);
}

/** A State that lasts a while (contract for Package A's attack.state): see addTimed. */
export async function addTimedState(actor, key, prev = 0, level = 1, duration = "endOfTurn", label = "") {
  await addTimed(actor, { kind: "state", key, prev, level, duration, event: "", label });
}

/** Forget the timed entries `fn` picks, without ending them (their effect already ended some other way). */
export async function dropTimedEntries(actor, fn) {
  const list = actor?.getFlag?.("dbu-rpg", "timed") ?? [];
  if ( !list.some(fn) ) return 0;
  const keep = list.filter(e => !fn(e));
  await actor.setFlag("dbu-rpg", "timed", foundry.utils.deepClone(keep));
  return list.length - keep.length;
}

/**
 * A mark ("<marker uuid>|<slug>") left a Character: what the marker's "markPlaced" triggers gave it with the mark (a buff,
 * a State...) ends too. Through the GM when this user does not own that Character.
 */
export async function endMarkEffects(target, key) {
  let actor = (typeof target === "string") ? await Promise.resolve(fromUuid(target)).catch(() => null) : target;
  if ( actor?.documentName === "Token" ) actor = actor.actor;
  if ( !actor ) return;
  const list = foundry.utils.deepClone(actor.getFlag("dbu-rpg", "timed") ?? []);
  const ending = list.filter(e => e.mark === key);
  if ( !ending.length ) return;
  if ( !actor.isOwner ) {
    emitGM("endMarkEffects", { uuid: actor.uuid, key });
    return;
  }
  const lines = [];
  for ( const entry of ending ) {
    if ( entry.kind === "modifier" ) {
      if ( await removeTimedModifier(actor, entry.key) ) lines.push(L("DBU.Trigger.ExpiredModifier", { label: entry.label }));
    }
    else if ( await revert(actor, entry) ) lines.push(L("DBU.Trigger.Expired", { label: entry.label || "", what: timedLabel(entry) }));
  }
  await actor.setFlag("dbu-rpg", "timed", list.filter(e => e.mark !== key));
  if ( lines.length ) await postInfoCard({ actor, title: L("DBU.Trigger.ExpiredTitle", { name: actor.name }), lines });
}

/** What a timed entry was (for the "ended" line). */
function timedLabel(entry) {
  if ( entry.kind === "mark" ) return L("DBU.Marks.Expired", { mark: entry.label || "", target: entry.target || "" });
  if ( entry.kind === "dot" ) return `${entry.level ?? 1} DOT`;
  return statusLabel(entry.kind, entry.key);
}

/**
 * A Combat Condition that lasts for a while (Stress Exhaustion: until the end of your next turn).
 * Outside of combat nothing ends it automatically. duration "endOfSourceTurn" ends it at the end of the turn of the
 * character with the uuid `source` (skip: how many of those turn ends it outlasts first).
 */
export async function addTimedCondition(actor, key, prev = 0, level = 1, duration = "endOfNextTurn", label = "",
  { rounds = 0, source = null, skip = null } = {}) {
  if ( !inCombat(actor) && !encounterOf(actor) ) return;
  await addTimed(actor, { kind: "condition", key, prev, level, duration, event: "", label, rounds, source, skip });
}

/**
 * A modifier that lasts a while (Stretch: +1(T) Combat Rolls for the first 3 Combat Rounds; Soar: until the start of
 * your next turn): it goes into the sheet's custom modifiers under its label and is taken out when it ends.
 */
export async function addTimedModifier(actor, modifier, { rounds = 1, duration = "endOfRound" } = {}) {
  const list = foundry.utils.deepClone(actor.system._source.customModifiers ?? []).filter(m => m.label !== modifier.label);
  list.push(modifier);
  await actor.update({ "system.customModifiers": list });
  await addTimed(actor, { kind: "modifier", key: modifier.label, prev: 0, level: 0, duration, event: "",
    label: modifier.label, rounds });
}

/** A system flag of the actor (dbu-rpg.<key> = true) that ends with a duration, like a timed Condition. */
export async function addTimedFlag(actor, key, { duration = "startOfNextTurn", label = "" } = {}) {
  await actor.setFlag("dbu-rpg", key, true);
  await addTimed(actor, { kind: "flag", key, prev: 0, level: 1, duration, event: "", label });
}

async function removeTimedModifier(actor, label) {
  const list = actor.system._source.customModifiers ?? [];
  if ( !list.some(m => m.label === label) ) return false;
  await actor.update({ "system.customModifiers": list.filter(m => m.label !== label) });
  return true;
}

/** Power Up: each stack of Power lasts until the end of your next turn. */
function powerEntry(actor) {
  return { kind: "power", key: "power", count: 1, duration: "endOfNextTurn", skip: isActorsTurn(actor) ? 1 : 0,
    label: "Power", round: encounterOf(actor)?.round ?? 0 };
}

export async function addTimedPower(actor, n = 1) {
  const list = foundry.utils.deepClone(actor.getFlag("dbu-rpg", "timed") ?? []);
  for ( let i = 0; i < n; i++ ) list.push(powerEntry(actor));
  await actor.setFlag("dbu-rpg", "timed", list);
}

/** Power Up at the limit: a stack of Power is removed and gained again, so the oldest one gets a new duration. */
export async function renewTimedPower(actor) {
  const list = foundry.utils.deepClone(actor.getFlag("dbu-rpg", "timed") ?? []);
  const i = list.findIndex(e => e.kind === "power");
  if ( i >= 0 ) list.splice(i, 1);
  list.push(powerEntry(actor));
  await actor.setFlag("dbu-rpg", "timed", list);
}

/** Stacks of Power removed by hand: forget the newest timers. */
export async function dropTimedPower(actor, n = 1) {
  const list = foundry.utils.deepClone(actor.getFlag("dbu-rpg", "timed") ?? []);
  for ( let k = 0; k < n; k++ ) {
    const i = list.findLastIndex(e => e.kind === "power");
    if ( i < 0 ) break;
    list.splice(i, 1);
  }
  await actor.setFlag("dbu-rpg", "timed", list);
}

/** Timers of the Power stacks, oldest first (for the sheet). */
export function powerTimers(actor) {
  return (actor.getFlag("dbu-rpg", "timed") ?? []).filter(e => e.kind === "power");
}

async function revert(actor, entry, { quiet = false } = {}) {
  // A system flag that lasts a while (Arrogant and Unstoppable: treated as Healthy)
  if ( entry.kind === "flag" ) {
    if ( actor.getFlag("dbu-rpg", entry.key) === undefined ) return false;
    await actor.unsetFlag("dbu-rpg", entry.key);
    return true;
  }
  // B1: a mark the actor placed (key "<slug>|<uuid>")
  if ( entry.kind === "mark" ) return (await import("./marks.mjs")).expireMark(actor, entry);
  // B3: timed stacks of Damage Over Time go (the ones lost meanwhile are not taken twice)
  if ( entry.kind === "dot" ) {
    const cur = actor.system.combat?.dot ?? 0;
    const next = Math.max(0, cur - (entry.level ?? 1));
    if ( next === cur ) return false;
    await actor.update({ "system.combat.dot": next });
    return true;
  }
  const field = entry.kind === "state" ? "states" : "conditions";
  const current = actor.system._source[field]?.[entry.key] ?? 0;
  // Something else changed it in the meantime: leave it alone
  if ( current !== entry.level ) return false;
  // The end of the Combat Encounter (quiet) leaves a State without its "stateLeave" triggers
  if ( entry.kind === "state" ) await (quiet ? actor.setState(entry.key, entry.prev, { noLeave: true }) : actor.setState(entry.key, entry.prev));
  else await actor.setCondition(entry.key, entry.prev);
  return true;
}

/**
 * End the timed States/Conditions and Power stacks of an actor whose duration is over at this combat event.
 * Runs before the triggers of the same event, so an effect renewed by them is not ended by mistake.
 * With `source`, only the effects that end with that character's turn ("endOfSourceTurn").
 */
export async function expireTimed(actor, event, { source = null } = {}) {
  const list = foundry.utils.deepClone(actor?.getFlag("dbu-rpg", "timed") ?? []);
  if ( !list.length ) return;
  const keep = [];
  const lines = [];
  let powerLost = 0;
  let due = 0;
  for ( const entry of list ) {
    // With `source`: what that Character's effects caused "until the end of / the start of your next turn" on others
    const ends = source ? ((entry.source === source) && (((event === "endOfTurn") && (entry.duration === "endOfSourceTurn"))
      || ((event === "startOfTurn") && (entry.duration === "startOfSourceTurn"))))
      : (EXPIRES_AT[entry.duration] === event);
    if ( !ends ) { keep.push(entry); continue; }
    due += 1;
    if ( entry.skip > 0 ) { entry.skip -= 1; keep.push(entry); continue; }
    if ( entry.kind === "power" ) { powerLost += entry.count ?? 1; continue; }
    if ( entry.kind === "modifier" ) {
      if ( await removeTimedModifier(actor, entry.key) ) lines.push(L("DBU.Trigger.ExpiredModifier", { label: entry.label }));
      continue;
    }
    if ( await revert(actor, entry) ) lines.push(L("DBU.Trigger.Expired", { label: entry.label || "", what: timedLabel(entry) }));
  }
  if ( !due ) return;
  await actor.setFlag("dbu-rpg", "timed", keep);
  if ( powerLost > 0 ) {
    const before = actor.system.combat.power ?? 0;
    const after = Math.max(0, before - powerLost);
    if ( after !== before ) {
      await actor.update({ "system.combat.power": after });
      // A lower Max Capacity also lowers the current Capacity
      if ( actor.system.capacity.value > actor.system.capacity.max ) await actor.update({ "system.capacity.value": actor.system.capacity.max });
      lines.push(L("DBU.Power.Expired", { n: before - after, left: after }));
      // B2: Power lost when its duration ends
      await resourceEvent(actor, "spend", { slug: "power", n: before - after, via: "expire" });
    }
  }
  if ( lines.length ) await postInfoCard({ actor, title: L("DBU.Trigger.ExpiredTitle", { name: actor.name }), lines });
}

/** The character left a Transformation: its effects "until you leave this Transformation" end. */
export async function expireRevert(actor, itemId) {
  const list = foundry.utils.deepClone(actor?.getFlag("dbu-rpg", "timed") ?? []);
  const ending = list.filter(e => (e.duration === "untilRevert") && (e.item === itemId));
  if ( !ending.length ) return;
  const lines = [];
  for ( const entry of ending ) {
    if ( entry.kind === "modifier" ) {
      if ( await removeTimedModifier(actor, entry.key) ) lines.push(L("DBU.Trigger.ExpiredModifier", { label: entry.label }));
    }
    else if ( await revert(actor, entry) ) lines.push(L("DBU.Trigger.Expired", { label: entry.label || "", what: timedLabel(entry) }));
  }
  await actor.setFlag("dbu-rpg", "timed", list.filter(e => !ending.includes(e)));
  if ( lines.length ) await postInfoCard({ actor, title: L("DBU.Trigger.ExpiredTitle", { name: actor.name }), lines });
}

/** Name of a modifier target ("strike" → "Strike"). */
function targetLabel(target) {
  const label = DBU.modifierTargets[target];
  return label ? game.i18n.localize(label) : String(target ?? "");
}

/** End every timed effect (end of the Combat Encounter; Power is reset with the encounter). */
export async function clearTimed(actor) {
  const list = actor?.getFlag("dbu-rpg", "timed") ?? [];
  if ( !list.length ) return;
  for ( const entry of list ) {
    if ( entry.kind === "modifier" ) await removeTimedModifier(actor, entry.key);
    else if ( entry.kind !== "power" ) await revert(actor, entry, { quiet: true });
  }
  await actor.unsetFlag("dbu-rpg", "timed");
}
