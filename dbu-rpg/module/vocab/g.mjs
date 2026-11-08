/**
 * Package G (round 4): Allies and the encounter (rules/allies.mjs), Counter Actions and Holding Back as moments, the
 * resources the encounter does not reset. Only Package G edits this file; vocab/index.mjs merges it after a..f. Every
 * export must stay (empty is fine): targets, prefixes, events, effects, durations, maneuvers, triggerTargets,
 * registerTargets(DBU). Every new target, event, effect and trigger target needs a pt-BR and an en label in
 * build/lang/g.json. The States of Transformations are in config.mjs (DBU.states, origin "transformation").
 */
/** H: the Holding Back stacks do nothing while it holds (they stay; @holdingBack still counts them). */
export const targets = { "holdingBack.ignore": "DBU.Target.holdingBackIgnore" };
/**
 * ally.<target>: that target for each of your Allies (within the piece's `range` Squares when set), worked out with your
 * data and @to.* (rules/allies.mjs); resKeep.<resource slug>: that sheet resource keeps its stacks when the Combat
 * Encounter ends.
 */
// (J: "foe.<target>": the same for each of your Opponents, within `range` when set)
export const prefixes = ["ally.", "resKeep.", "foe."];
export const events = [
  // G2: an Ally made an Attacking Maneuver against one of your Opponents, used the Power Up Maneuver, used a Surge
  "allyAttack", "allyPowerUp", "allySurge",
  // H: an attack targets one of your Allies (other = the attacker)
  "allyTargeted",
  // G3: you spent Counter Actions (@n) in a Combat Encounter; you gained / lost Holding Back stacks (@n, @holdingBackLeft,
  // @allLost)
  "counterSpent", "holdingBackGain", "holdingBackLoss"
];
/** G4: gain or lose Holding Back stacks (value), or set them (value). */
export const effects = ["holdingBack", "holdingBackSet"];
/** H: endOfTurn / endOfNextTurn / startOfNextTurn with the turns of whoever gets the effect (an Ally's own turn). */
export const durations = ["endOfTheirTurn", "endOfTheirNextTurn", "startOfTheirNextTurn"];
export const maneuvers = [];
/** G2: every Ally ("allies", within `range` when set), you and them ("team"), the Ally of an ally event ("ally": allyHit,
 * allyDamaged, allyAttack, allyPowerUp, allySurge, allyTargeted). */
// (J: "opponents": every Opponent of your encounter, within `range` when set)
export const triggerTargets = ["ally", "allies", "team", "opponents"];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
