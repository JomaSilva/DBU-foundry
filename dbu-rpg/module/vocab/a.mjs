/**
 * Package A: attack and defense (features A1, A2).
 * The vocabulary it adds to the rules engine. Only Package A edits this file; vocab/index.mjs merges it after the
 * base lists (order a, b, c). Every export must stay (empty is fine):
 * - targets: { "<modifier target>": "<lang key or label>" }, added to DBU.modifierTargets
 * - prefixes: target families accepted by prefix (["stressReq."]), added to DBU.MODIFIER_TARGET_PREFIXES
 * - events / effects / durations: trigger choices appended to the base lists (data/fields.mjs schema)
 * - maneuvers: keys of the "maneuver" effect (its resource)
 * - triggerTargets: values of a trigger's target besides self / other
 * - registerTargets(DBU): generated targets (loops over DBU.saves, DBU.skills...), run by config.mjs after its own loops
 * Every new target, event, effect and duration needs a pt-BR and an en label in build/lang/a.json.
 *
 * A1 (rules/versus.mjs): the vs.* targets, worked out per attacker/target pair, never in buckets.
 * A2 (rules/options.mjs, combat/attack.mjs): the new attack.* option targets and the always-on ones.
 */
export const targets = {
  // A1: your attack against that target (automatic)
  "vs.strike": "DBU.Target.vsStrike", "vs.wound": "DBU.Target.vsWound", "vs.combat": "DBU.Target.vsCombat",
  "vs.category": "DBU.Target.vsCategory", "vs.ignoreSoak": "DBU.Target.vsIgnoreSoak", "vs.steadfast": "DBU.Target.vsSteadfast",
  // A1: its attack against you (may be asked, limited, paid, grouped)
  "vs.dodge": "DBU.Target.vsDodge", "vs.defenseValue": "DBU.Target.vsDefenseValue", "vs.soak": "DBU.Target.vsSoak",
  "vs.dr": "DBU.Target.vsDr", "vs.categoryTaken": "DBU.Target.vsCategoryTaken", "vs.categorySet": "DBU.Target.vsCategorySet",
  "vs.damageTaken": "DBU.Target.vsDamageTaken", "vs.damageMult": "DBU.Target.vsDamageMult", "vs.guardKp": "DBU.Target.vsGuardKp",
  "vs.guardNoCharges": "DBU.Target.vsGuardNoCharges", "vs.redodge": "DBU.Target.vsRedodge",
  // A2: attack options
  "attack.calledShot": "DBU.Target.attackCalledShot", "attack.noCalledShotPenalty": "DBU.Target.attackNoCalledShotPenalty",
  "attack.overCharges": "DBU.Target.attackOverCharges", "attack.kpBaseFree": "DBU.Target.attackKpBaseFree",
  "attack.freeCounter": "DBU.Target.attackFreeCounter", "attack.aoe": "DBU.Target.attackAoe",
  "attack.magnitude": "DBU.Target.attackMagnitude", "attack.greaterDice": "DBU.Target.attackGreaterDice",
  "attack.ignoreSoak": "DBU.Target.attackIgnoreSoak", "attack.critSet.strike": "DBU.Target.attackCritSetStrike",
  "attack.critSet.wound": "DBU.Target.attackCritSetWound", "attack.dimDefense.mult": "DBU.Target.attackDimDefenseMult",
  "attack.dimOnDeclare": "DBU.Target.attackDimOnDeclare", "attack.state": "DBU.Target.attackState",
  "attack.ignoreFoundationReq": "DBU.Target.attackIgnoreFoundationReq",
  // A2: always on
  "flag.noLongRangePenalty": "DBU.Target.flagNoLongRangePenalty", "wager.maxSet": "DBU.Target.wagerMaxSet",
  "flag.dimDefenseFirstFree": "DBU.Target.flagDimDefenseFirstFree"
};
export const prefixes = [];
export const events = [];
export const effects = [];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
