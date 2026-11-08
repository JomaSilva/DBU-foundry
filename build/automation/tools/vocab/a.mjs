// Package A (attack and defense: A1, A2): what it teaches the automation validator (../validate.mjs merges a, b, c after
// its base lists). Only Package A edits this file. Every export must stay (empty is fine).
//
// A variable list may hold a family: an entry ending in "." or "_" allows every variable that starts with it ("vs."
// allows @vs.below, @vs.cond.shaken; "mark_" allows @mark_inferior).

// The aggregates over an attack's targets (@vsMax.below, @vsCount.cond.impaired, @vsAny.mark.inferior)
const AGGREGATES = ["vsMax.", "vsMin.", "vsAny.", "vsCount."];
// What the options of an attack leave for later: @kpFinal, @magnitude, @weaponIntegrated, @chose.<group>, @spent.<x>
const ATTACK_LATE = ["kpFinal", "magnitude", "weaponIntegrated", "chose.", "spent."];
// The Defend variables an attack's hit events now see too, besides @dodge, @parry, @guard...
const DEFEND_MORE = ["counter", "defenseCrit"];
// The base Defend variables (validate.mjs DEFENSE_VARS without the packages')
const DEFEND = ["dodge", "parry", "guard", "crossCounter", "directHit", "powerFlare", "none", "divineFlex"];

/** { "<event>": ["var", ...] }: added to that event's variables (a new event gets its list here). */
export const EVENT_VARS = {
  attackMade: ["vs."],
  targeted: ["vs."],
  attackHit: [...DEFEND.filter(v => v !== "guard"), ...DEFEND_MORE, "vs."],
  damaged: [...DEFEND.filter(v => v !== "guard"), ...DEFEND_MORE, "vs."],
  attackMissed: [...DEFEND_MORE, "vs."],
  dodged: [...DEFEND_MORE, "vs."],
  // Package B puts @vs in these scopes (other = the attacker / your Foundry target): see VOCAB.md 5A
  threshold: ["vs."],
  use: ["vs."]
};
/** Variables (or families) allowed in every formula. */
export const BASE_VARS = [];
/** Roots of the @<root>.<key> variables allowed in every formula (the key is required). */
export const PREFIX_VARS = [];
/** Attack variables: every attack event (attackMade, attackHit, damaged, attackMissed, dodged, targeted), defense.* and
 * vs.* pieces. */
export const ATTACK_VARS = ["oblivious", "allyTargets", ...ATTACK_LATE, ...AGGREGATES];
/** Defend options (dodge, parry, guard...): attackMissed / dodged, defense.* and vs.* pieces. */
export const DEFENSE_VARS = [];
/** attack.* pieces made at declaration (also the start of WOUND_OPTION_VARS). */
export const ATTACK_OPTION_VARS = ["oblivious", "allyTargets", "weaponIntegrated", ...AGGREGATES];
/** defense.* pieces (they start with DEFENSE_VARS + ATTACK_VARS). */
export const DEFENSE_OPTION_VARS = [];
/** attack.* pieces with at: "wound" (they start with ATTACK_OPTION_VARS). */
export const WOUND_OPTION_VARS = ["hits", "missed", "critStrike", "kpFinal", "magnitude", "chose.", "spent."];
/** vs.* pieces (they start with ATTACK_VARS + DEFENSE_VARS). */
export const VS_VARS = ["vs.", ...DEFEND_MORE, "hit", "critStrike", "n"];
/** clash.* pieces. */
export const CLASH_VARS = [];
/** { "<target>" or "<prefix ending in .>": ["var", ...] }: more variables for the modifiers on those targets. */
export const TARGET_VARS = {};
/** { "<field>": ["var", ...] }: variables a modifier or trigger may use when it has that field (base: amount and group
 * give @n). */
export const FIELD_VARS = {};
/** Events that have another Character (target: "other" allowed). */
export const WITH_OTHER = [];
/** Option target families ("vs."): mode and limit are allowed on them. */
export const OPTION_PREFIXES = ["vs."];
/** Targets whose value is text, not a formula (check the text in checkModifier). */
export const TEXT_TARGETS = ["attack.aoe", "attack.state"];
/** Targets whose value may hold dice ("1d10 + 2"). */
export const DICE_TARGETS = [];
/** RegExps of variable names allowed wherever the attack variables are, like the base /^(da|via|superProfile|opt|profile)_/. */
export const PREFIX_RE = [/^tag_/];

/** The option fields A2 adds to modifiers, allowed only on option targets. */
const FIELDS = ["cost", "amount", "group", "limitKey", "at"];
/** vs targets only the attacker has: never asked, nothing pays them nor picks their @n (no cost, no amount). */
const ATTACKER_ONLY = new Set(["vs.wound", "vs.category", "vs.ignoreSoak", "vs.steadfast", "vs.damageDealtMult"]);
/** The attack.* targets an `at: "wound"` piece may have (combat/attack.mjs WOUND_TARGETS: what the Wound Roll and the
 * Damage still read). */
const WOUND_TARGETS = new Set(["attack.wound", "attack.greaterDice", "attack.crit.wound", "attack.natural.wound",
  "attack.critSet.wound", "attack.category", "attack.ignoreSoak", "attack.ignoreDR",
  // 6F: Energy Charges, their Category and the Damage Attribute again, added on the hit
  "attack.charges", "attack.chargeCategory", "attack.damageAttrTimes"]);
/** The keys of @vs (rules/versus.mjs versusData) and the ones that need a sub-key. */
const VS_KEYS = new Set(["myMinion", "topNow", "power", "below", "anyCond", "dot", "size", "sizeDiff", "initiative", "initiativeDiff", "ally", "minion", "top", "capacityMax",
  // 6F: Squares between you and the other Character (rules/proximity.mjs)
  "distance",
  // 6U: Compelled toward whom (rules/versus.mjs versusData)
  "compelledByMe", "compelledToThem",
  // 6Y: the other Character provokes no Exploit (its flag.noProvokeExploit)
  "noProvoke",
  // RA: how many of its Combat Conditions you inflicted
  "condByMe",
  // RD: its Diminishing Defense penalty now
  "dimDefense",
  // RE: its adjacent Allies / Opponents
  "alliesAdjacent", "opponentsAdjacent",
  // T13: its Boosted Speed; T19: it is its turn now
  "speedBoosted", "isTurn",
  // T26: the Light Level where it is
  "lightLevel"]);
const VS_SUBKEYS = new Set(["cond", "states", "mark", "markOthers", "awk", "allyAdjAwk", "onArea", "markAdj"]);
const VS_ROOTS = new Set(["vs", "vsMax", "vsMin", "vsAny", "vsCount"]);

/** The @vs / @vsMax... variables of a formula checked against versusData's keys and the tables. */
function checkVersusVars(formula, what, ctx) {
  const out = [];
  for ( const v of ctx.variables(formula) ) {
    const [root, key, sub, ...rest] = v.split(".");
    if ( !VS_ROOTS.has(root) ) continue;
    if ( !key ) { out.push(`${what}: @${v} needs a key`); continue; }
    if ( VS_KEYS.has(key) ) {
      if ( sub ) out.push(`${what}: @${v} (@${root}.${key} has no sub-key)`);
      continue;
    }
    if ( !VS_SUBKEYS.has(key) ) { out.push(`${what}: unknown @${root} key "${key}" (@${v})`); continue; }
    if ( !sub || rest.length ) { out.push(`${what}: @${v} needs one ${key} key`); continue; }
    if ( (key === "cond") && !ctx.CONDS.includes(sub) ) out.push(`${what}: unknown condition @${v}`);
    if ( (key === "states") && !ctx.STATES.includes(sub) ) out.push(`${what}: unknown state @${v}`);
    if ( (key === "mark") && !/^[a-z0-9]+$/.test(sub) ) out.push(`${what}: a mark is lowercase letters and digits (@${v})`);
  }
  return out;
}

// Extra checks, run after the base checks. Each returns a list of problems, written like the base ones
// (`modifier ${i}: ...`, `trigger ${i}: ...`). ctx holds the entry (key, entry, effect, racial), the tables (DBU, VOCAB,
// STATES, CONDS, EVENTS, EFFECTS, DURATIONS, MANEUVERS, TRIGGER_TARGETS, COST_KINDS and every merged list above) and the
// helpers: check(formula, vars, what, inTrigger), variables(formula), toExpression, splitTop, checkLimit(limit, what),
// checkCost(cost, vars, what), isTarget, isOption, modifierVars(m), triggerVars(t), fieldVars(x), norm.
export function checkModifier(m, i, ctx) {
  const out = [];
  const t = String(m.target ?? "");
  const what = `modifier ${i}`;
  const option = ctx.isOption(t);
  // The option fields only on option targets
  // (Package G: an "ally.<target>" piece may have a group, its pieces of one group not stacking)
  const set = FIELDS.filter(f => String(m[f] ?? "").trim() && !((f === "group") && (t.startsWith("ally.") || t.startsWith("foe."))));
  if ( set.length && !option ) out.push(`${what}: ${set.join("/")} only on ${ctx.OPTION_PREFIXES.map(p => `${p}*`).join(" / ")} targets`);
  if ( m.at !== undefined && String(m.at) !== "" ) {
    if ( m.at !== "wound" ) out.push(`${what}: at "${m.at}" (only "" or "wound")`);
    else if ( !t.startsWith("attack.") ) out.push(`${what}: at "wound" only on attack.* targets`);
    else if ( !WOUND_TARGETS.has(t) ) out.push(`${what}: at "wound" only on ${[...WOUND_TARGETS].join(", ")} (${t} is read before)`);
  }
  // The attacker's vs pieces are automatic; defense.* pieces take a cost, but no amount nor group
  if ( ATTACKER_ONLY.has(t) ) {
    const bad = ["cost", "amount"].filter(f => String(m[f] ?? "").trim());
    if ( bad.length ) out.push(`${what}: ${t} is the attacker's (automatic): no ${bad.join("/")}`);
  }
  if ( t.startsWith("defense.") ) {
    const bad = ["amount", "group"].filter(f => String(m[f] ?? "").trim());
    if ( bad.length ) out.push(`${what}: defense.* takes a cost, no ${bad.join("/")}`);
  }
  if ( String(m.group ?? "").trim() && !/^[a-z0-9]+$/.test(String(m.group)) ) out.push(`${what}: group "${m.group}" (lowercase letters and digits)`);
  const vars = ctx.modifierVars(m);
  if ( String(m.cost ?? "").trim() ) out.push(...ctx.checkCost(m.cost, [...vars, "n"], what));
  if ( String(m.amount ?? "").trim() ) out.push(...ctx.check(m.amount, vars.filter(v => v !== "n"), `${what} amount`));
  if ( (m.mode === "ask") && ATTACKER_ONLY.has(t) ) out.push(`${what}: ${t} is the attacker's (automatic): no mode "ask"`);
  // Text targets
  if ( t === "attack.aoe" && !/^(any|sphere|cone|line)(\|(sphere|cone|line))*$/.test(String(m.value ?? "").trim()) ) out.push(`${what}: attack.aoe value "${m.value}" (any, sphere, cone, line or a | list)`);
  if ( t === "attack.state" && !ctx.STATES.some(k => (k === m.value) || (ctx.norm(k) === ctx.norm(m.value ?? ""))) ) out.push(`${what}: attack.state "${m.value}" is not a State`);
  // @vs keys and their tables
  for ( const [f, label] of [[m.value, "value"], [m.condition, "condition"], [m.cost, "cost"], [m.amount, "amount"]] ) {
    if ( !String(f ?? "").trim() || ((label === "value") && ctx.TEXT_TARGETS.has(t)) ) continue;
    out.push(...checkVersusVars(String(f).replace(/res:[^:;]+:/g, ""), `${what} ${label}`, ctx));
  }
  return out;
}
export function checkTrigger(t, i, ctx) {
  const out = [];
  for ( const [f, label] of [[t.value, "value"], [t.condition, "condition"], [t.cost, "cost"], [t.amount, "amount"]] ) {
    if ( !String(f ?? "").trim() || ((label === "value") && (t.effect === "message")) ) continue;
    out.push(...checkVersusVars(String(f).replace(/res:[^:;]+:/g, ""), `trigger ${i} ${label}`, ctx));
  }
  return out;
}
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
