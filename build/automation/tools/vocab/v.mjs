// Package V (round 15): safe Life Point losses — what it teaches the automation validator.
export const EVENT_VARS = { threshold: ["safeLoss"] };
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
export function checkTrigger(t, i, ctx) {
  // (T29 "noMomentum": the loss gives no Reduced Momentum)
  if ( (t?.effect === "life") && String(t.resource ?? "").trim() && !/^(safe|silent|noMomentum)(\s+(safe|silent|noMomentum))*$/i.test(String(t.resource).trim()) ) return [`trigger ${i}: life resource "${t.resource}" (only "safe" / "silent" / "noMomentum")`];
  return [];
}
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
