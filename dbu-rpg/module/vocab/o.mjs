/**
 * Package O (round 9): the Movement Maneuver's costs (combat/movement-maneuver.mjs) and the Divine Ki of God Maneuvers
 * (combat/divine.mjs payGodManeuver). Only Package O edits this file. Texts in build/lang/o.json.
 */
export const targets = {
  "kpCost.boost": "DBU.Target.kpCostBoost", "kpCost.boostFree": "DBU.Target.kpCostBoostFree",
  "kpCost.rapid": "DBU.Target.kpCostRapid", "kpCost.rapidFree": "DBU.Target.kpCostRapidFree",
  "dkpCost.god": "DBU.Target.dkpCostGod"
};
/** dkpCost.use.<slug>: ± Divine Ki Points of that God Maneuver. */
export const prefixes = ["dkpCost.use."];
export const events = [];
export const effects = [];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
