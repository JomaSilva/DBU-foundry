/**
 * Racial package RA (round 21): Allies' events of an Exploit provoked / a Condition inflicted, the durations
 * "untilDefended" / "nextRoll", the "exclusive" option field, technique use counts, Life Points above the maximum, who
 * inflicted a Condition. Only Package RA edits this file. Texts in build/lang/ra.json.
 */
/** lifeOverMax: Life Points may be regained up to the maximum + this. */
export const targets = { lifeOverMax: "DBU.Target.lifeOverMax" };
export const prefixes = [];
/** allyExploitTriggered (an Ally's Exploit was provoked; other = the provoker), allyInflict (an Ally gave an Opponent a
 * Combat Condition; other = that Opponent). */
export const events = ["allyExploitTriggered", "allyInflict"];
/** LT steadfastPass: failed Health Threshold Steadfast Checks become successes. */
export const effects = ["steadfastPass"];
/** untilDefended: until the holder's next defense against an attack; nextRoll: until the holder's next roll of the bonus's
 * kind (a buff). */
export const durations = ["untilDefended", "nextRoll"];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
