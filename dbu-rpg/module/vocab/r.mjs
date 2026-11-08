/**
 * Package R (round 12): an Advantage of the player's choice for one attack, and choices declared by an automation entry
 * (build/extract_content.py). Only Package R edits this file. Texts in build/lang/r.json.
 */
/** attack.advantagePick (value = the most TP its first rank may cost): the attack dialog offers a select of those
 * Advantages; the one picked joins that attack (as attack.advantage.<key> = 1, with this piece's condition, limit, cost). */
export const targets = { "attack.advantagePick": "DBU.Target.attackAdvantagePick" };
export const prefixes = [];
export const events = [];
export const effects = [];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
