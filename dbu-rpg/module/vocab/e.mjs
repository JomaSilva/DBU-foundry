/**
 * Package E (round 3): Maneuver events and Transformation rules (features E1-E4). Only Package E edits this file;
 * vocab/index.mjs merges it after a, b, c, d. Every export must stay (empty is fine): targets, prefixes, events, effects,
 * durations, maneuvers, triggerTargets, registerTargets(DBU).
 * Every new target, event, effect and duration needs a pt-BR and an en label in build/lang/e.json.
 */
export const targets = {
  // E3 Transformation rules, read by rules/transform-rules.mjs when the Transformation Maneuver is used or a
  // Transformation is left (never summed on the sheet)
  "enterBlock": "DBU.Target.enterBlock",
  "combineBlock": "DBU.Target.combineBlock",
  "leaveBlock": "DBU.Target.leaveBlock",
  "leaveWhen": "DBU.Target.leaveWhen",
  "grandTrigger": "DBU.Target.grandTrigger"
};
/**
 * enterBlockOf.<slug> (you cannot enter a Transformation whose name slug contains it), enterBlockAspect.<Aspect key> (one
 * that has that Aspect), enterBlockType.<form|enhancement|evolved> (one of that type).
 */
export const prefixes = ["enterBlockOf.", "enterBlockAspect.", "enterBlockType."];
export const events = [
  // E1 a Maneuver / Unique Ability (God, Villainous, Empower too) or an item (Basic Item, Accessory) was used
  "maneuverUsed", "itemUsed",
  // E1 you stop being Defeated; an Ally's attack damaged an Opponent; an attack damaged an Ally
  "defeatEnd", "allyHit", "allyDamaged",
  // E4 one of your Awakenings gained a Stack (@awk_<slug> = 1); an Apparel piece you wore was doffed or broke
  "awakeningGain", "apparelDoff"
];
/** E3 leave Transformations through an effect. */
export const effects = ["leave"];
export const durations = [];
/**
 * E2 standard: any 1-Action Standard Maneuver (picked); exploit / feint: an attack made through that Maneuver (the
 * attack dialog's side is Package F's). The form "item:<Name>" (that item of the actor) is in maneuverPrefixes.
 */
export const maneuvers = ["standard", "exploit", "feint"];
/** Maneuver keys accepted by prefix ("item:Hype Maneuver"): not merged by vocab/index.mjs yet (see the report). */
export const maneuverPrefixes = ["item:"];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
