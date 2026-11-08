// Package G (round 4: Allies and the encounter, Counter Actions and Holding Back as moments, kept resources): what it
// teaches the automation validator (../validate.mjs merges a..g after its base lists). Only Package G edits this file.
// Every export must stay (empty is fine); see tools/vocab/c.mjs for what each one means.
import { DBU } from "../../../../dbu-rpg/module/config.mjs";
import * as E from "./e.mjs";

const ALLY_EVENTS = ["allyHit", "allyDamaged", "allyAttack", "allyPowerUp", "allySurge", "allyTargeted"];
/** What every Ally event carries (combat/triggers.mjs fireAllyEvents). */
const ALLY = ["allyMinion", "allyMark.", "allyDistance"];

export const EVENT_VARS = {
  // An Ally's attack keeps the attack's variables (like allyHit, without the hit's)
  allyAttack: [...new Set([...(E.EVENT_VARS?.allyHit ?? []).filter(v => !["damage", "knocked", "defeated", "targetBelow", "critWound"].includes(v)), ...ALLY])],
  // H: an attack targets your Ally (the attack's variables, no hit yet)
  allyTargeted: [...new Set([...(E.EVENT_VARS?.allyHit ?? []).filter(v => !["damage", "knocked", "defeated", "targetBelow", "critWound"].includes(v)), ...ALLY])],
  allyPowerUp: [...ALLY, "powerNow"],
  allySurge: [...ALLY, "healingSurge", "kiSurge", "healed"],
  allyHit: ["allyDistance"],
  allyDamaged: ["allyDistance"],
  counterSpent: ["n", "countersLeft"],
  holdingBackGain: ["n", "holdingBackLeft"],
  holdingBackLoss: ["n", "holdingBackLeft", "allLost"]
};
/** H: 1 while "holdingBack.ignore" holds. */
export const BASE_VARS = ["holdingBackIgnored"];
/** @opponentsCond.<condition>, @alliesCond.<condition>, @opponentsState.<state>, @alliesState.<state>. */
export const PREFIX_VARS = ["opponentsCond", "alliesCond", "opponentsState", "alliesState"];
export const ATTACK_VARS = [];
export const DEFENSE_VARS = [];
export const ATTACK_OPTION_VARS = [];
export const DEFENSE_OPTION_VARS = [];
export const WOUND_OPTION_VARS = [];
export const VS_VARS = [];
export const CLASH_VARS = [];
/** An "ally.<target>" piece also reads the Ally it goes to: @to.mark.<slug>, @to.minion, @to.distance, @to.below. */
export const TARGET_VARS = { "ally.": ["to."], "foe.": ["to."] };
export const FIELD_VARS = {};
export const WITH_OTHER = ["allyAttack", "allyTargeted"];
export const OPTION_PREFIXES = [];
export const TEXT_TARGETS = [];
export const DICE_TARGETS = [];
export const PREFIX_RE = [];

const CONDS = Object.keys(DBU.conditions);
const STATES = Object.keys(DBU.states);
const RANGE = /^([1-9]|1[0-2])$/;
// Targets an Ally piece cannot carry: option and rule families (read by their own flows, not summed on the sheet)
const NOT_FOR_ALLIES = /^(attack|defense|vs|clash|ally|foe|fx(Off|On|Mult|Add|Limit)|aspect(Set|All|Of)?|enterBlock\w*|resMax|resMaxSet|resKeep|ignoreState|immune|flag)\.|^(enterBlock|combineBlock|leaveBlock|leaveWhen|grandTrigger)$/;
const TO_VARS = ["mark", "minion", "distance", "below", "cond", "states"];

/** Problems of the encounter counts and @to.* a formula reads. */
function countProblems(formulas, what, ctx, { to = false } = {}) {
  const out = [];
  for ( const f of formulas.filter(Boolean) ) {
    for ( const v of ctx.variables(String(f)) ) {
      const [root, key, more] = v.split(".");
      if ( ["opponentsCond", "alliesCond"].includes(root) && (!CONDS.includes(key) || more) ) out.push(`${what}: @${v}: "${key}" is not a Condition key`);
      if ( ["opponentsState", "alliesState"].includes(root) && (!STATES.includes(key) || more) ) out.push(`${what}: @${v}: "${key}" is not a State key`);
      if ( root === "to" ) {
        if ( !to ) out.push(`${what}: @${v}: @to.* is only for "ally.<target>" pieces`);
        else if ( !TO_VARS.includes(key) || (["mark", "cond", "states"].includes(key) !== !!more) ) out.push(`${what}: @${v}: @to.mark.<slug>, @to.cond.<condition>, @to.states.<state>, @to.minion, @to.distance, @to.below`);
        else if ( (key === "cond") && !CONDS.includes(more) ) out.push(`${what}: @${v}: "${more}" is not a Condition key`);
        else if ( (key === "states") && !STATES.includes(more) ) out.push(`${what}: @${v}: "${more}" is not a State key`);
      }
    }
  }
  return out;
}

export function checkModifier(m, i, ctx) {
  const out = [];
  const t = String(m.target ?? "");
  const what = `modifier ${i}`;
  // (J: "foe.<target>" pieces go to your Opponents, with the same rules)
  const ally = /^(?:ally|foe)\.(.+)$/.exec(t);
  if ( ally ) {
    const inner = ally[1];
    if ( !ctx.isTarget(inner) ) out.push(`${what}: ${t}: "${inner}" is not a modifier target`);
    else if ( NOT_FOR_ALLIES.test(inner) ) out.push(`${what}: ${t}: an Ally piece gives a plain target (no option, vs, clash, rule or fx target)`);
    if ( m.mode || m.limit || m.cost || m.amount || m.at || m.limitKey ) out.push(`${what}: ${t} takes no mode, limit, cost, amount, at or limitKey`);
  }
  if ( m.range !== undefined && String(m.range).trim() !== "" ) {
    if ( !ally ) out.push(`${what}: range is only for "ally.<target>" / "foe.<target>" pieces`);
    else if ( !RANGE.test(String(m.range).trim()) ) out.push(`${what}: range is a number of Squares, 1 to 12`);
  }
  if ( /^resKeep\./.test(t) && (String(m.value ?? "").trim() !== "1") ) out.push(`${what}: ${t}: the value is 1`);
  out.push(...countProblems([m.value, m.condition], what, ctx, { to: !!ally }));
  return out;
}

export function checkTrigger(t, i, ctx) {
  const out = [];
  const what = `trigger ${i}`;
  const range = String(t.range ?? "").trim();
  if ( range ) {
    if ( !["allies", "team", "opponents"].includes(t.target) ) out.push(`${what}: range is only for the targets "allies", "team" and "opponents"`);
    else if ( !RANGE.test(range) ) out.push(`${what}: range is a number of Squares, 1 to 12`);
  }
  if ( (t.target === "ally") && !ALLY_EVENTS.includes(t.event) ) out.push(`${what}: target "ally" (the Ally of the event) only on ${ALLY_EVENTS.join(", ")}`);
  if ( ["holdingBack", "holdingBackSet"].includes(t.effect) && String(t.resource ?? "").trim() ) out.push(`${what}: ${t.effect} takes no resource`);
  out.push(...countProblems([t.value, t.condition, t.cost, t.amount], what, ctx));
  return out;
}

// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
