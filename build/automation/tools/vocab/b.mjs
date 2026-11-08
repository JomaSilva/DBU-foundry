// Package B (triggers, moments, Maneuvers: B1-B5): what it teaches the automation validator (../validate.mjs merges a, b, c after
// its base lists). Only Package B edits this file. Every export must stay (empty is fine).
//
// A variable list may hold a family: an entry ending in "." or "_" allows every variable that starts with it ("vs."
// allows @vs.below, @vs.cond.shaken; "mark_" allows @mark_inferior).

/** { "<event>": ["var", ...] }: added to that event's variables (a new event gets its list here). The events with another
 * Character also see @vs.* (5A: the pair you / the other Character; triggers.mjs adds it when a trigger reads it). */
export const EVENT_VARS = {
  // B1 you placed a mark (@mark_<slug> = 1)
  markPlaced: ["mark_", "vs."],
  // B2 resources (@res_<slug> = 1: a sheet resource's slug, life, ki, power)
  resourceGain: ["gained", "wanted", "overflow", "res_", "viaSurge", "viaRecovery", "viaTrigger"],
  resourceSpend: ["spent", "res_", "viaCost", "viaAttack", "viaDamage"],
  // B3 moments
  stateLeave: ["state_", "level"],
  allyDefeated: ["allyMinion", "byAttack", "byOpponent", "vs."],
  inflict: ["cond_", "level", "vs."],
  // B5 Legend Realized and Empower
  legendRealized: ["legendLife", "legendKi"],
  empower: ["actionsSpent", "kpGiven", "dkpGiven", "oos", "vs."],
  empowered: ["kpGained", "dkpGained", "vs."]
};
/** Variables (or families) allowed in every formula. */
export const BASE_VARS = ["chargesRound", "surgesRound", "damagedSinceTurn"];
/** Roots of the @<root>.<key> variables allowed in every formula (the key is required). */
export const PREFIX_VARS = ["resGained", "resSpent", "marks"];
/** Attack variables: every attack event (attackMade, attackHit, damaged, attackMissed, dodged, targeted), defense.* and
 * vs.* pieces. */
export const ATTACK_VARS = [];
/** Defend options (dodge, parry, guard...): attackMissed / dodged, defense.* and vs.* pieces. */
export const DEFENSE_VARS = [];
/** attack.* pieces made at declaration (also the start of WOUND_OPTION_VARS). */
export const ATTACK_OPTION_VARS = [];
/** defense.* pieces (they start with DEFENSE_VARS + ATTACK_VARS). */
export const DEFENSE_OPTION_VARS = [];
/** attack.* pieces with at: "wound" (they start with ATTACK_OPTION_VARS). */
export const WOUND_OPTION_VARS = [];
/** vs.* pieces (they start with ATTACK_VARS + DEFENSE_VARS). */
export const VS_VARS = [];
/** clash.* pieces. */
export const CLASH_VARS = [];
/** { "<target>" or "<prefix ending in .>": ["var", ...] }: more variables for the modifiers on those targets. */
export const TARGET_VARS = {
  // Combat Recovery's option boxes may read the Actions chosen
  "recovery.": ["actions"]
};
/** { "<field>": ["var", ...] }: variables a modifier or trigger may use when it has that field (base: amount and group
 * give @n). */
export const FIELD_VARS = {
  roll: ["roll", "rollNatural"],
  check: ["checkTotal", "checkSuccess", "margin"]
};
/** Events that have another Character (target: "other" allowed). */
export const WITH_OTHER = ["markPlaced", "allyDefeated", "inflict", "empower", "empowered"];
/** Option target families ("vs."): mode and limit are allowed on them. */
export const OPTION_PREFIXES = ["surge.", "recovery.", "charge."];
/** Targets whose value is text, not a formula (check the text in checkModifier). */
export const TEXT_TARGETS = [];
/** Targets whose value may hold dice ("1d10 + 2"). */
export const DICE_TARGETS = ["surge.healBonus"];
/** RegExps of variable names allowed wherever the attack variables are, like the base /^(da|via|superProfile|opt|profile)_/. */
export const PREFIX_RE = [];

// ---- B4 / B5 syntax -------------------------------------------------------------------------------------------------
const SAVES = ["impulsive", "corporeal", "cognitive", "morale"];
/** The surge.* / recovery.* / charge.* targets the Maneuvers read per use (documents/actor.mjs MANEUVER_TARGETS): the only
 * ones of those families that take mode, limit, cost, amount, group and limitKey. */
const OPTION_TARGETS = ["charge.kp", "surge.healBonus", "surge.healMult", "surge.toKi", "recovery.lifeMult", "recovery.minActions",
  "recovery.actions"];
/** Targets a "maneuver" effect's `with` may set, per Maneuver key (and "actions" where the Maneuver counts Actions). */
const WITH_TARGETS = {
  energyCharge: t => /^charge\./.test(t) || (t === "kpCost.maneuver"),
  healingSurge: t => /^surge\./.test(t),
  kiSurge: t => /^surge\./.test(t),
  surge: t => /^surge\./.test(t),
  combatRecovery: t => /^recovery\./.test(t) || (t === "flag.recoveryNoDvPenalty") || (t === "actions"),
  transformation: t => /^legend\./.test(t),
  empower: t => /^empower\./.test(t) || ["flag.empowerMelee", "flag.empowerMax", "actions"].includes(t)
};
/** One side of a Clash check: might, a Save, a Skill key, strike, dodge; "a|b" = the better one. */
// (an Attribute too: combat/clash.mjs rolls its Modifier, the Karmic Clash)
const clashSide = (s, ctx) => String(s).split("|").every(k => ["might", "strike", "dodge", ...SAVES, ...(ctx.DBU.ATTRIBUTES ?? [])].includes(k) || (k in (ctx.DBU.skills ?? {})));

// Extra checks, run after the base checks. Each returns a list of problems, written like the base ones
// (`modifier ${i}: ...`, `trigger ${i}: ...`). ctx holds the entry (key, entry, effect, racial), the tables (DBU, VOCAB,
// STATES, CONDS, EVENTS, EFFECTS, DURATIONS, MANEUVERS, TRIGGER_TARGETS, COST_KINDS and every merged list above) and the
// helpers: check(formula, vars, what, inTrigger), variables(formula), toExpression, splitTop, checkLimit(limit, what),
// checkCost(cost, vars, what), isTarget, isOption, modifierVars(m), triggerVars(t), fieldVars(x), norm.
export function checkModifier(m, i, ctx) {
  const out = [];
  const t = String(m.target ?? "");
  // B5 stressReq.<slug of a Transformation's name>
  if ( t.startsWith("stressReq.") && !/^stressReq\.[a-z0-9]+$/.test(t) ) {
    out.push(`modifier ${i}: "${t}" needs the Transformation's slug (lowercase letters and digits: stressReq.seethingfury)`);
  }
  if ( (t === "recovery.minActions") && m.mode ) out.push(`modifier ${i}: recovery.minActions cannot be an option box`);
  // The option fields work on the B5 targets only: the older surge.* / recovery.* / charge.* targets (surge.kiMult,
  // recovery.bonus, charge.kpMult...) are summed in the sheet's buckets, where a box or a limit means nothing
  if ( /^(surge|recovery|charge)\./.test(t) && !OPTION_TARGETS.includes(t) ) {
    const set = ["mode", "limit", "cost", "amount", "group", "limitKey"].filter(f => String(m[f] ?? "").trim());
    if ( set.length ) out.push(`modifier ${i}: ${set.join("/")} not on ${t} (only on ${OPTION_TARGETS.join(", ")})`);
  }
  return out;
}

export function checkTrigger(t, i, ctx) {
  const out = [];
  const effect = t.effect;
  const what = `trigger ${i}`;
  const has = k => String(t[k] ?? "").trim() !== "";
  // B1 marks
  if ( ["mark", "unmark"].includes(effect) ) {
    if ( !has("resource") ) out.push(`${what}: ${effect} needs the mark's name in resource`);
    else if ( !/[a-z0-9]/i.test(t.resource) ) out.push(`${what}: mark name "${t.resource}"`);
    // (G/J: also on every Ally, every Opponent, the Ally of an ally event)
    if ( (effect === "mark") && !["other", "targeted", "allies", "team", "opponents", "ally"].includes(t.target) ) out.push(`${what}: mark needs target "other" (or "targeted", "allies", "opponents", "ally")`);
    if ( t.duration === "untilRevert" ) out.push(`${what}: a mark cannot last untilRevert`);
  }
  // B3 ending effects
  if ( effect === "removeCondition" ) {
    const parts = String(t.resource ?? "").split("!").map(s => s.trim());
    const ok = parts.length && parts[0] && (["any", "all"].includes(parts[0].toLowerCase()) || ctx.CONDS.includes(parts[0]))
      && parts.slice(1).every(p => ctx.CONDS.includes(p));
    if ( !ok ) out.push(`${what}: removeCondition resource "${t.resource ?? ""}" (a Condition key, any or all, then !<condition> exclusions)`);
  }
  if ( (effect === "leaveState") && !ctx.STATES.some(k => (k === t.resource) || (ctx.norm(k) === ctx.norm(t.resource ?? ""))) ) {
    out.push(`${what}: unknown state "${t.resource ?? ""}"`);
  }
  // B4 rolls and checks
  if ( has("roll") ) {
    const dice = String(t.roll).replace(/\d*d\d+(kh|kl)?\d*/gi, "1");
    if ( !/d\d+/i.test(t.roll) ) out.push(`${what}: roll "${t.roll}" has no dice`);
    out.push(...ctx.check(dice, [], `${what} roll`, true));
  }
  if ( has("rollKey") && !/^[A-Za-z0-9_-]+$/.test(String(t.rollKey).trim()) ) out.push(`${what}: rollKey "${t.rollKey}" (a slug)`);
  if ( has("rollKey") && !has("roll") && !has("check") ) out.push(`${what}: rollKey without roll or check`);
  if ( has("check") ) {
    const c = String(t.check).trim();
    const m = /^(steadfast(:[+-]?\d+)?|save\.(\w+):\d+|skill\.(\w+):\d+|clash:([\w|]+)(?: vs ([\w|]+))?)$/.exec(c);
    if ( !m ) out.push(`${what}: check "${c}" (steadfast[:mod], save.<save>:<tn>, skill.<skill>:<tn>, clash:<mine>[ vs <theirs>])`);
    else if ( m[3] && !SAVES.includes(m[3]) ) out.push(`${what}: check "${c}": unknown save`);
    else if ( m[4] && !(m[4] in (ctx.DBU.skills ?? {})) ) out.push(`${what}: check "${c}": unknown skill`);
    else if ( m[5] && (!clashSide(m[5], ctx) || (m[6] && !clashSide(m[6], ctx))) ) out.push(`${what}: check "${c}": unknown Clash roll`);
    // (K: a trigger for several Characters makes its Clash against each of them)
    else if ( m[5] && !ctx.WITH_OTHER.has(t.event) && !["targeted", "allies", "team", "opponents"].includes(t.target) ) out.push(`${what}: a Clash check needs another Character (${t.event})`);
  }
  if ( has("onCheck") && !["success", "fail"].includes(String(t.onCheck).trim()) ) out.push(`${what}: onCheck "${t.onCheck}" (success or fail)`);
  if ( has("onCheck") && !has("check") ) out.push(`${what}: onCheck without check`);
  // B5 `with` on the maneuver effect
  if ( has("with") ) {
    if ( effect !== "maneuver" ) out.push(`${what}: with only on the maneuver effect`);
    const keys = String(t.resource ?? "").split("|").map(s => s.trim()).filter(Boolean);
    // The attacks (basicAttack, signature, exploit, feint): their "with" (attack.* pieces, only=, via=, attr=) is checked by
    // tools/vocab/f.mjs
    const ATTACKS = ["basicAttack", "signature", "exploit", "feint"];
    const attackWith = keys.length && keys.every(k => ATTACKS.includes(k));
    for ( const part of (attackWith ? [] : String(t.with).split(";").map(s => s.trim()).filter(Boolean)) ) {
      const eq = part.indexOf("=");
      const target = (eq > 0) ? part.slice(0, eq).trim() : "";
      const formula = (eq > 0) ? part.slice(eq + 1).trim() : "";
      if ( !target || !formula ) { out.push(`${what}: with "${part}" (target=formula)`); continue; }
      if ( (target !== "actions") && !ctx.isTarget(target) ) { out.push(`${what}: with: unknown target "${target}"`); continue; }
      if ( !keys.some(k => WITH_TARGETS[k]?.(target)) ) { out.push(`${what}: with: "${target}" is not a target of ${t.resource}`); continue; }
      const f = ["surge.healBonus", "recovery.bonus", "legend.bonus"].includes(target) ? formula.replace(/\d*d\d+/gi, "1") : formula;
      out.push(...ctx.check(f, [], `${what} with`, true));
    }
  }
  // B3 one button for a group of button triggers (C3's roll reactions use the same field)
  if ( has("group") && !/^[a-z0-9]+$/.test(String(t.group).trim()) ) out.push(`${what}: group "${t.group}" (lowercase letters and digits)`);
  // "targeted" makes a button: not for a message or a reminder
  if ( (t.target === "targeted") && ((effect === "message") || (t.mode === "remind")) ) out.push(`${what}: targeted has nothing to target`);
  // A buff given with a mark (markPlaced) on yourself makes no sense with "other" missing: fine either way; durations of
  // marks and timed DOT are the usual ones
  return out;
}

/** "grant transformation: <name> [+aspect:<key>[:<level>]]..." and "grant transformationLine: <line> ..." (B5). */
export function checkEntry(e, key, ctx) {
  const out = [];
  const code = e?.code;
  if ( code?.category !== "grant" ) return out;
  const re = /\b(transformationLine|transformation)\s*:\s*([^;]+)/g;
  let m;
  while ( (m = re.exec(String(code.spec ?? ""))) ) {
    const name = m[2].replace(/\s*\+aspect:\s*[A-Za-z0-9]+(?::\s*\d+)?/g, "").replace(/\s*\+(active\b|mastery\s*:\s*\d*)/gi, "").trim();
    if ( !name ) out.push(`grant ${m[1]}: no name`);
    for ( const a of m[2].matchAll(/\+aspect:\s*([A-Za-z0-9]+)(?::\s*(\d+))?/g) ) {
      if ( !(a[1] in (ctx.DBU.aspects ?? {})) ) out.push(`grant ${m[1]}: unknown aspect "${a[1]}"`);
    }
    if ( /\+(?!aspect:|active\b|mastery\s*:)/.test(m[2]) ) out.push(`grant ${m[1]}: "${m[2].trim()}" (an Aspect patch is +aspect:<key>[:<level>])`);
  }
  return out;
}
