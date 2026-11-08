// Package AA (round 19): what it teaches the automation validator.
const ATTACK = ["physical", "energy", "magic", "signature", "basic", "ultimate", "aoe", "charges", "wager", "category", "targets", "elemental",
  "kp", "dmgAttr", "favored", "calledShot", "oos", "armed", "unarmed", "via_", "opt_", "sig_", "weapon_", "profile_", "superProfile_", "viaFx.", "chose.", "vs."];
export const EVENT_VARS = { woundRolled: ["crit", "superCrit", "natural", "total", "critStrike", "spent.", ...ATTACK] };
export const BASE_VARS = [];
export const PREFIX_VARS = [];
export const ATTACK_VARS = [];
export const DEFENSE_VARS = [];
export const ATTACK_OPTION_VARS = [];
export const DEFENSE_OPTION_VARS = [];
export const WOUND_OPTION_VARS = [];
export const VS_VARS = [];
export const CLASH_VARS = [];
export const TARGET_VARS = {};
export const FIELD_VARS = {};
export const WITH_OTHER = ["woundRolled"];
export const OPTION_PREFIXES = [];
export const TEXT_TARGETS = [];
export const DICE_TARGETS = [];
export const PREFIX_RE = [];
// eslint-disable-next-line no-unused-vars
export function checkModifier(m, i, ctx) { return []; }
// eslint-disable-next-line no-unused-vars
export function checkTrigger(t, i, ctx) {
  if ( ["woundAdd", "woundCategory"].includes(t?.effect) && (t.event !== "woundRolled") ) return [`trigger ${i}: ${t.effect} only on the woundRolled event`];
  return [];
}
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
