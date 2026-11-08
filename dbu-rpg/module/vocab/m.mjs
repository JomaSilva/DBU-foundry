/**
 * Package M (round 7): pick one of several sheet resources (a Stance of the Stance Maneuver, a Mode...). Only Package M
 * edits this file; vocab/index.mjs merges it after a..l. Every export must stay (empty is fine). Texts in build/lang/m.json.
 */
export const targets = {};
export const prefixes = [];
export const events = [];
/** resourcePick: resource = "A|B|* Suffix"; the picked one becomes 1, the others 0 (combat/triggers.mjs pickOptions). */
/** M2 attackWound: value = a Wound bonus for the attack of the event (attackMade, allyAttack, targeted, allyTargeted). */
export const effects = ["resourcePick", "attackWound"];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
