/**
 * Package S (round 13): what provokes the Exploit Maneuver (rules/exploit.mjs). Only Package S edits this file. Texts in
 * build/lang/s.json.
 */
export const targets = {};
/** noProvoke.<slug> (1: that Maneuver of yours provokes no Exploit: combatrecovery, energycharge, empower, movement,
 * grapple, disarm, ride, arrogantdeclaration, terrainlift). */
export const prefixes = ["noProvoke."];
/** exploitTriggered: an Opponent provoked your Exploit (other = it; @by_<maneuver slug>); provokedExploit: you provoked
 * the Exploit of @n Opponents (@by_<slug>). */
export const events = ["exploitTriggered", "provokedExploit"];
export const effects = [];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
