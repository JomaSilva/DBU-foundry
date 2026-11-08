// Package Z (round 18): what it teaches the automation validator.
export const EVENT_VARS = {
  pressureCheck: ["success", "failed", "total", "natural", "auto", "vs."],
  roll: ["kind_pressure"],
  rolled: ["kind_pressure"],
  legendRealized: ["legendExtra"]
};
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
export const WITH_OTHER = [];
export const OPTION_PREFIXES = [];
export const TEXT_TARGETS = [];
export const DICE_TARGETS = [];
export const PREFIX_RE = [];
// eslint-disable-next-line no-unused-vars
export function checkModifier(m, i, ctx) { return []; }
// eslint-disable-next-line no-unused-vars
export function checkTrigger(t, i, ctx) { return []; }
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
