/**
 * Package B: triggers, moments, Maneuvers (features B1-B5).
 * The vocabulary it adds to the rules engine. Only Package B edits this file; vocab/index.mjs merges it after the
 * base lists (order a, b, c). Every export must stay (empty is fine):
 * - targets: { "<modifier target>": "<lang key or label>" }, added to DBU.modifierTargets
 * - prefixes: target families accepted by prefix (["stressReq."]), added to DBU.MODIFIER_TARGET_PREFIXES
 * - events / effects / durations: trigger choices appended to the base lists (data/fields.mjs schema)
 * - maneuvers: keys of the "maneuver" effect (its resource)
 * - triggerTargets: values of a trigger's target besides self / other
 * - registerTargets(DBU): generated targets (loops over DBU.saves, DBU.skills...), run by config.mjs after its own loops
 * Every new target, event, effect and duration needs a pt-BR and an en label in build/lang/b.json.
 */
export const targets = {
  // B5 Maneuver tuning. Energy Charge: flat KP after charge.kpMult; the Maneuvers the system charges KP for
  "charge.kp": "DBU.Target.chargeKp",
  "kpCost.maneuver": "DBU.Target.kpCostManeuver",
  // Healing Surge: + LP (dice allowed), × the dice LP (before Surgency), the LP given as KP and Capacity instead
  "surge.healBonus": "DBU.Target.surgeHealBonus",
  "surge.healMult": "DBU.Target.surgeHealMult",
  "surge.toKi": "DBU.Target.surgeToKi",
  // Combat Recovery: × LP, the fewest Actions it may use (2 by default), ± Actions it costs, no Defense Value penalty
  "recovery.lifeMult": "DBU.Target.recoveryLifeMult",
  "recovery.minActions": "DBU.Target.recoveryMinActions",
  "recovery.actions": "DBU.Target.recoveryActions",
  "flag.recoveryNoDvPenalty": "DBU.Target.flagRecoveryNoDvPenalty",
  // Legend Realized: × its Life Points only
  "legend.lifeMult": "DBU.Target.legendLifeMult",
  // Empower: + Actions counted, always within Melee Range (double), no limit per Action
  "empower.actions": "DBU.Target.empowerActions",
  "flag.empowerMelee": "DBU.Target.flagEmpowerMelee",
  "flag.empowerMax": "DBU.Target.flagEmpowerMax"
};
/** stressReq.<slug of a Transformation's name>: ± its Stress Test Requirement. */
export const prefixes = ["stressReq."];
export const events = [
  // B1 you placed a mark on another Character
  "markPlaced",
  // B2 stacks of a sheet resource, Power, LP or KP gained / spent or lost
  "resourceGain", "resourceSpend",
  // B3 a State ends, an Ally is Defeated, one of your trigger effects gave someone a Combat Condition
  "stateLeave", "allyDefeated", "inflict",
  // B5 Legend Realized, you Empower an Ally, an Ally Empowers you
  "legendRealized", "empower", "empowered"
];
export const effects = ["mark", "unmark", "removeCondition", "leaveState"];
export const durations = ["endOfNextRound"];
export const maneuvers = [];
/** "targeted": the Character the clicking user targets (the effect becomes a button resolved when it is clicked). */
export const triggerTargets = ["targeted"];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
