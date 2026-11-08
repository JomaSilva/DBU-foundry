/**
 * Package Y (round 17): the Maneuvers the others use, Combat Recovery, an effect that provokes the Exploit. Only Package Y
 * edits this file. Texts in build/lang/y.json.
 */
export const targets = {};
export const prefixes = [];
/** opponentManeuver / allyManeuver: an Opponent / an Ally of yours used a Maneuver (other = it; @by_<slug>, @distance,
 * @oos, @ua, @special, @god, @standard...); combatRecovery: you used Combat Recovery (@actions, @condition). */
export const events = ["opponentManeuver", "allyManeuver", "combatRecovery"];
/** provoke (resource: adjacent | melee | notLong): the Exploit of the Opponents at that range. */
export const effects = ["provoke"];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
