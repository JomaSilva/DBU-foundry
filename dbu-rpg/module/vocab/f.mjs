/**
 * Package F (round 3): attack-time vocabulary (F1-F4). Only Package F edits this file; vocab/index.mjs merges it after
 * a, b, c, d, e. Every export must stay (empty is fine): targets, prefixes, events, effects, durations, maneuvers,
 * triggerTargets, registerTargets(DBU).
 * Every new target, event, effect and duration needs a pt-BR and an en label in build/lang/f.json.
 *
 * F1 (combat/attack.mjs parseAttackWith): the `with` of an attack made by a "maneuver" button (basicAttack, signature,
 *    exploit, feint) — no new target, its parts use the attack.* ones.
 * F2 (rules/signature.mjs grantedSignature): attack.advantage.<key> / attack.superProfile.<key> (prefixes below).
 * F4 (combat/attack.mjs, rules/versus.mjs): the targets below.
 */
export const targets = {
  // F4 attack options: the Damage Attribute again (at declaration or as it hits)
  "attack.damageAttrTimes": "DBU.Target.attackDamageAttrTimes",
  // F4 Punching Down / Punching Up, the attacker's side (attack options: may be asked, limited, paid)
  "attack.punchDown.size": "DBU.Target.attackPunchDownSize", "attack.punchDown.sizeSet": "DBU.Target.attackPunchDownSizeSet",
  "attack.punchDown.reach": "DBU.Target.attackPunchDownReach", "attack.punchDown.category": "DBU.Target.attackPunchDownCategory",
  "attack.punchDown.times": "DBU.Target.attackPunchDownTimes",
  "attack.punchUp.size": "DBU.Target.attackPunchUpSize", "attack.punchUp.sizeSet": "DBU.Target.attackPunchUpSizeSet",
  // F4 Punching Down / Punching Up, the target's side (always on: how other Characters count your Size)
  "punchedDown.size": "DBU.Target.punchedDownSize", "punchedDown.sizeSet": "DBU.Target.punchedDownSizeSet",
  "punchedUp.size": "DBU.Target.punchedUpSize", "punchedUp.sizeSet": "DBU.Target.punchedUpSizeSet",
  // F4 vs pieces of the defender
  "vs.autoDodge": "DBU.Target.vsAutoDodge", "vs.noDimDefense": "DBU.Target.vsNoDimDefense",
  "vs.ignoreDamageBelow": "DBU.Target.vsIgnoreDamageBelow", "vs.damageMax": "DBU.Target.vsDamageMax"
};
/** F2: attack.advantage.<Advantage or Disadvantage key> (+ ranks for this attack; negative removes), attack.superProfile.<key>. */
export const prefixes = ["attack.advantage.", "attack.superProfile."];
export const events = [];
export const effects = [];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
