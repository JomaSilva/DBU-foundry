// Racial package RB (round 22): what it teaches the automation validator (the team Maneuvers' pieces).
const ATTACK = ["physical", "energy", "magic", "signature", "basic", "ultimate", "aoe", "charges", "wager", "category", "targets", "elemental",
  "kp", "dmgAttr", "favored", "calledShot", "oos", "armed", "unarmed", "via_", "opt_", "sig_", "weapon_", "profile_", "superProfile_", "tag_", "chose.", "vs."];
// @intervene: the hit taken through Intervene (vs.* pieces of the Damage, the "damaged" / "attackHit" triggers)
export const EVENT_VARS = { damaged: ["intervene"], attackHit: ["intervene"] };
// RC: @isMinion (the character itself is a Minion), @lifeFloor
export const BASE_VARS = ["isMinion", "lifeFloor"];
export const PREFIX_VARS = [];
export const ATTACK_VARS = [];
export const DEFENSE_VARS = [];
export const ATTACK_OPTION_VARS = [];
export const DEFENSE_OPTION_VARS = [];
export const WOUND_OPTION_VARS = [];
export const VS_VARS = ["intervene"];
export const CLASH_VARS = [];
export const TARGET_VARS = {
  "intervene.": [...ATTACK, "wall", "deflect", "distant", "attackerVs."],
  "united.": [...ATTACK, "unitedCount"],
  "unitedBy.": [...ATTACK, "unitedCount"],
  "reflect.": ATTACK
};
export const FIELD_VARS = {};
export const WITH_OTHER = [];
export const OPTION_PREFIXES = ["intervene.", "united.", "unitedBy.", "reflect."];
export const TEXT_TARGETS = [];
export const DICE_TARGETS = [];
export const PREFIX_RE = [];
const TEAM = /^(intervene|united|unitedBy|reflect)\./;
// eslint-disable-next-line no-unused-vars
export function checkModifier(m, i, ctx) {
  if ( TEAM.test(String(m?.target ?? "")) && m.at ) return [`modifier ${i}: "at" is not used by the team Maneuvers' pieces`];
  return [];
}
// eslint-disable-next-line no-unused-vars
export function checkTrigger(t, i, ctx) { return []; }
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
