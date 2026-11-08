/**
 * Package C: sheet data, rolls, Clashes (features C1-C4).
 * The vocabulary it adds to the rules engine. Only Package C edits this file; vocab/index.mjs merges it after the
 * base lists (order a, b, c). Every export must stay (empty is fine):
 * - targets: { "<modifier target>": "<lang key or label>" }, added to DBU.modifierTargets
 * - prefixes: target families accepted by prefix (["stressReq."]), added to DBU.MODIFIER_TARGET_PREFIXES
 * - events / effects / durations: trigger choices appended to the base lists (data/fields.mjs schema)
 * - maneuvers: keys of the "maneuver" effect (its resource)
 * - triggerTargets: values of a trigger's target besides self / other
 * - registerTargets(DBU): generated targets (loops over DBU.saves, DBU.skills...), run by config.mjs after its own loops
 * Every new target, event, effect and duration needs a pt-BR and an en label in build/lang/c.json.
 */
export const targets = {
  // C1: Saves, Skills, creation budgets (the per-Save / per-Skill / per-Attribute ones are in registerTargets)
  "saveProf.all": "DBU.Target.saveProf.all",
  "natural.save": "DBU.Target.naturalSave",
  "natural.skill": "DBU.Target.naturalSkill",
  "skillRanks.racial": "DBU.Target.skillRanksRacial",
  "talents": "DBU.Target.talents",
  "skillImprovements": "DBU.Target.skillImprovements",
  // C1: Technique Point and Ki Point costs
  "tpCost.ua": "DBU.Target.tpCostUA",
  "tpCost.ua.magical": "DBU.Target.tpCostUAMagical",
  "kpCost.ua.magical": "DBU.Target.kpCostUAMagical",
  "tpCost.signature": "DBU.Target.tpCostSignature",
  "tpStart.mult.physical": "DBU.Target.tpStartMultPhysical",
  "tpStart.mult.energy": "DBU.Target.tpStartMultEnergy",
  "tpStart.mult.magic": "DBU.Target.tpStartMultMagic",
  // C2: derived state
  "life.final": "DBU.Target.lifeFinal",
  "guardCost": "DBU.Target.guardCost",
  "sizeAs.dv": "DBU.Target.sizeAsDv",
  "sizeAs.soak": "DBU.Target.sizeAsSoak",
  "sizeAs.dv.max": "DBU.Target.sizeAsDvMax",
  "sizeAs.dv.min": "DBU.Target.sizeAsDvMin",
  "sizeAs.soak.max": "DBU.Target.sizeAsSoakMax",
  "sizeAs.soak.min": "DBU.Target.sizeAsSoakMin",
  "dimOffense.mult": "DBU.Target.dimOffenseMult",
  "dimDefense.penaltyMult": "DBU.Target.dimDefensePenaltyMult",
  // C4: Clashes (evaluated per Clash by combat/clash.mjs)
  "clash.all": "DBU.Target.clashAll",
  "clash.might": "DBU.Target.clashMight",
  "clash.save": "DBU.Target.clashSave",
  "clash.skill": "DBU.Target.clashSkill",
  "clash.grapple": "DBU.Target.clashGrapple",
  "clash.natural": "DBU.Target.clashNatural",
  "clash.autoWin": "DBU.Target.clashAutoWin"
};
/** apparelBonus.<slug | natural> (+ Apparel Bonus of that piece), apparelBonus.mult.<slug | natural> (×). */
export const prefixes = ["apparelBonus."];
/** roll: the reaction window of every roll (dbuRoll); rolled: its final result; clashWon / clashLost: resolveClash. */
export const events = ["roll", "rolled", "clashWon", "clashLost"];
/** Roll reactions (only on "roll") and the Break Value of an Apparel piece (combat/triggers.mjs applies it through
 * rules/apparel.mjs changeBreakValue). */
export const effects = ["reroll", "natural", "naturalSet", "rollBonus", "critical", "succeed", "breakValue"];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];

/** Targets generated from the tables: one per Saving Throw, Skill and Attribute. */
export function registerTargets(DBU) {
  const T = DBU.modifierTargets;
  for ( const k of Object.keys(DBU.saves ?? {}) ) {
    // The Racial Saving Throw Bonus (+T, Critical Target −1) on that Save; its Critical Target
    T[`saveProf.${k}`] = `DBU.Target.saveProf.${k}`;
    T[`crit.save.${k}`] = `DBU.Target.critSaveOf.${k}`;
  }
  for ( const k of Object.keys(DBU.skills ?? {}) ) {
    T[`skillRank.${k}`] = `DBU.Target.skillRank.${k}`;
    T[`crit.skill.${k}`] = `DBU.Target.critSkillOf.${k}`;
    T[`natural.skill.${k}`] = `DBU.Target.naturalSkillOf.${k}`;
  }
  // + to every Skill of that Attribute
  for ( const a of DBU.ATTRIBUTES ?? [] ) T[`skill.attr.${a}`] = `DBU.Target.skillAttr.${a}`;
}
