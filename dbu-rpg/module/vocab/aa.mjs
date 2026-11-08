/**
 * Package AA (round 19): a Wound Roll already made, changed by effects ("woundRolled", woundAdd, woundCategory), and the
 * Stress Test step per Grade. Only Package AA edits this file. Texts in build/lang/aa.json.
 */
export const targets = {};
/** stressGradeStep.<slug of a Graded Transformation>: ± the Stress Test Requirement per Grade above the first (2). */
export const prefixes = ["stressGradeStep."];
/** woundRolled: your Wound Roll was made (@crit, @superCrit, @natural, @total, the attack's variables; other = its target). */
export const events = ["woundRolled"];
/** woundAdd (value; resource "charge": that many more Energy Charges' dice), woundCategory (value; resource "lethal"). */
export const effects = ["woundAdd", "woundCategory"];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
