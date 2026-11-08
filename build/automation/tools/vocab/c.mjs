// Package C (sheet data, rolls, Clashes: C1-C4): what it teaches the automation validator (../validate.mjs merges a, b, c after
// its base lists). Only Package C edits this file. Every export must stay (empty is fine).
//
// A variable list may hold a family: an entry ending in "." or "_" allows every variable that starts with it ("vs."
// allows @vs.below, @vs.cond.shaken; "mark_" allows @mark_inferior).
import { DBU } from "../../../../dbu-rpg/module/config.mjs";
import * as A from "./a.mjs";

const SAVES = Object.keys(DBU.saves);
const SKILLS = Object.keys(DBU.skills);
const ATTRS = DBU.ATTRIBUTES;

/** The roll reaction effects (dbu-rpg/module/combat/reactions.mjs): only on the "roll" event. */
const REACTION_EFFECTS = ["reroll", "natural", "naturalSet", "rollBonus", "critical", "succeed"];
/** Variables of a Clash side (combat/clash.mjs clashVariables), of its pieces and of its events. */
const CLASH_SIDE = ["initiated", "clash_might", "clash_save", "clash_skill", "clash_grapple", "clash_strike", "clash_dodge",
  ...SAVES.map(k => `clash_${k}`), ...SKILLS.map(k => `clash_${k}`), ...ATTRS.map(k => `clash_${k}`), "via_", "vs."];
/** The attack variables a Strike / Dodge / Wound Roll of an attack carries (validate.mjs base list + Package A's). */
const ATTACK_BASE = ["physical", "energy", "magic", "signature", "basic", "ultimate", "aoe", "charges", "wager", "category", "crit",
  "targets", "elemental", "dkpCost", "dkpWager", "kp", "dmgAttr", "favored", "calledShot", "oos", "armed", "unarmed"];
/** Variables of the "roll" / "rolled" events (combat/reactions.mjs rollVariables). */
const ROLL_VARS = ["kind_strike", "kind_dodge", "kind_wound", "kind_save", "kind_skill", "kind_clash", "kind_steadfast", "kind_stress",
  "combatRoll", "natural", "rawNatural", "crit", "botch", "critTarget", "botchPenalty", "total", "tn", "success", "thresholdCheck",
  "inClash", "critStrike", ...ATTACK_BASE, ...(A.ATTACK_VARS ?? []), ...CLASH_SIDE];
/** Late variables (rules/derived.mjs late pass) and the targets they may be used on. */
const LATE = ["soakNow", "surgencyNow", "dvNow", "tp"];
const LATE_TARGETS = ["dr", "wound", "wound.physical", "wound.energy", "wound.magic", "strike", "dodge", "combat"];
/** Stage 1.5 targets (rlm, size, size.min) and stage 1.75 ones (sizeAs.*, apparelBonus.*): what they cannot read yet
 * (the Apparel variables are known before them, with the bonuses before the apparelBonus pieces). */
const STAGE_15 = ["rlm", "size", "size.min"];
const STAGE_175 = /^(sizeAs|apparelBonus)\./;
const AFTER_175 = ["sizeDv", "sizeSoak", "sizeTop"];

/** { "<event>": ["var", ...] }: added to that event's variables (a new event gets its list here). */
export const EVENT_VARS = {
  roll: ROLL_VARS,
  rolled: ROLL_VARS,
  clashWon: [...CLASH_SIDE, "margin", "mine", "theirs", "autoWin"],
  clashLost: [...CLASH_SIDE, "margin", "mine", "theirs", "autoWin"]
};
/** Variables (or families) allowed in every formula. */
export const BASE_VARS = [
  // C1
  "skillImprovements",
  // C2: stage 1.5, state, encounter, other packages' counters, Size, Apparel
  "rlm", "sizeNow", "wielding", "inCombat", "dimDefense", "initiative", "initiativeTop", "sizeTop", "turnAlly", "alliesDefeated",
  "chargesRound", "surgesRound", "damagedSinceTurn", "sizeDv", "sizeSoak", "apparelWorn"
];
/** Roots of the @<root>.<key> variables allowed in every formula (the key is required). */
export const PREFIX_VARS = ["ranks", "resGained", "resSpent", "marks", "apparel"];
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
export const CLASH_VARS = [...CLASH_SIDE];
/** { "<target>" or "<prefix ending in .>": ["var", ...] }: more variables for the modifiers on those targets. */
export const TARGET_VARS = {
  ...Object.fromEntries(LATE_TARGETS.map(t => [t, LATE])),
  "life.final": ["tp"]
};
/** { "<field>": ["var", ...] }: variables a modifier or trigger may use when it has that field (base: amount and group
 * give @n). */
export const FIELD_VARS = {};
/** Events that have another Character (target: "other" allowed). */
export const WITH_OTHER = ["clashWon", "clashLost"];
/** Option target families ("vs."): mode and limit are allowed on them. */
export const OPTION_PREFIXES = ["clash."];
/** Targets whose value is text, not a formula (check the text in checkModifier). */
export const TEXT_TARGETS = [];
/** Targets whose value may hold dice ("1d10 + 2"). */
export const DICE_TARGETS = [];
/** RegExps of variable names allowed wherever the attack variables are, like the base /^(da|via|superProfile|opt|profile)_/. */
export const PREFIX_RE = [];

/** Problems of the variables C reads by key: @ranks.<skill>, @apparel.<slug>.bonus|break, @apparel.top.bonus|armor. */
function variableProblems(formulas, what, ctx) {
  const out = [];
  for ( const f of formulas.filter(Boolean) ) {
    for ( const v of ctx.variables(String(f)) ) {
      const [root, a, b] = v.split(".");
      if ( (root === "ranks") && a && !SKILLS.includes(a) ) out.push(`${what}: unknown skill @${v}`);
      if ( root === "apparel" ) {
        const fields = (a === "top") ? ["bonus", "armor"] : ["bonus", "break"];
        if ( !a || !b || !fields.includes(b) ) out.push(`${what}: @${v} must be @apparel.<slug|natural>.bonus|break or @apparel.top.bonus|armor`);
      }
    }
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
  if ( t.startsWith("apparelBonus.") && !/^apparelBonus\.(mult\.)?[a-z0-9]+$/.test(t) ) {
    out.push(`${what}: "${t}" must be apparelBonus.<slug> or apparelBonus.mult.<slug> (slug: lowercase letters/digits, or natural)`);
  }
  if ( /^sizeAs\.(dv|soak)\.(max|min)$/.test(t) && /^\s*\d+\s*$/.test(String(m.value ?? ""))
    && ((Number(m.value) < 0) || (Number(m.value) >= DBU.SIZE_ORDER.length)) ) {
    out.push(`${what}: ${t} value is a Size index 0-${DBU.SIZE_ORDER.length - 1} (${DBU.SIZE_ORDER.join(", ")})`);
  }
  // Late variables: only where the late pass reads them
  const late = ctx.variables(`${m.value ?? ""} ${m.condition ?? ""}`).filter(v => LATE.includes(v));
  const allowed = TARGET_VARS[t] ?? [];
  for ( const v of late ) {
    if ( !allowed.includes(v) ) out.push(`${what}: @${v} is a late variable (only on ${v === "tp" ? "life.final and " : ""}${LATE_TARGETS.join(", ")})`);
  }
  // A stage 1.5 / 1.75 piece is worked out before these variables exist (they would read 0)
  if ( STAGE_15.includes(t) || STAGE_175.test(t) ) {
    const early = ctx.variables(`${m.value ?? ""} ${m.condition ?? ""}`).filter(v => AFTER_175.includes(v)
      || (STAGE_15.includes(t) && ["rlm", "sizeNow"].includes(v)));
    for ( const v of new Set(early) ) out.push(`${what}: ${t} is worked out before @${v} exists`);
  }
  if ( (t === "clash.autoWin") && !/@initiated\b/.test(String(m.condition ?? "")) ) {
    out.push(`${what}: clash.autoWin needs @initiated in its condition (who started the Clash)`);
  }
  out.push(...variableProblems([m.value, m.condition, m.cost, m.amount], what, ctx));
  return out;
}

export function checkTrigger(t, i, ctx) {
  const out = [];
  const what = `trigger ${i}`;
  if ( REACTION_EFFECTS.includes(t.effect) && (t.event !== "roll") ) out.push(`${what}: effect ${t.effect} only on the "roll" event`);
  if ( (t.event === "roll") && !REACTION_EFFECTS.includes(t.effect) && (t.effect !== "message") ) {
    out.push(`${what}: on "roll" only ${REACTION_EFFECTS.join(", ")} or message (other effects: event "rolled")`);
  }
  // A roll reaction has no trigger roll / check of its own; a check made by a "rolled" trigger would be rolled again
  if ( ["roll", "rolled"].includes(t.event) ) {
    const fields = (t.event === "roll") ? ["roll", "rollKey", "check", "onCheck"] : ["check", "onCheck"];
    for ( const f of fields ) if ( String(t[f] ?? "").trim() ) out.push(`${what}: no "${f}" on the "${t.event}" event`);
  }
  if ( (t.effect === "reroll") && !["", "base", "all"].includes(String(t.resource ?? "").trim()) ) {
    out.push(`${what}: reroll resource "${t.resource}" (base or all)`);
  }
  if ( (t.effect === "breakValue") && !String(t.resource ?? "").trim() ) out.push(`${what}: breakValue needs the Apparel name (or natural) in resource`);
  out.push(...variableProblems([t.value, t.condition, t.cost, t.amount], what, ctx));
  return out;
}

// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
