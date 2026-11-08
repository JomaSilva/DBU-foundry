// Package N (round 8: use costs): what it teaches the automation validator. Only Package N edits this file.
export const EVENT_VARS = {};
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
export function checkModifier(m, i, ctx) {
  if ( /^kpCost\.useFree\./.test(String(m.target ?? "")) && (String(m.value ?? "").trim() !== "1") ) return [`modifier ${i}: ${m.target}: the value is 1`];
  return [];
}
// eslint-disable-next-line no-unused-vars
export function checkTrigger(t, i, ctx) { return []; }
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
