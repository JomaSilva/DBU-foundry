/**
 * Package N (round 8): the cost of using a Special Maneuver / Unique Ability (combat/use-costs.mjs, world setting
 * "useCosts"). Only Package N edits this file; vocab/index.mjs merges it after a..m. Texts in build/lang/n.json.
 */
export const targets = {};
/** kpCost.use.<slug>: ± KP to use that item (its name without "Maneuver"); kpCost.useFree.<slug>: 1 = no KP;
 * kpCost.ua.<abilityType>: ± KP of the Unique Abilities of that type (technical, spiritual, magical...). */
export const prefixes = ["kpCost.use.", "kpCost.useFree.", "kpCost.ua."];
export const events = [];
export const effects = [];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
