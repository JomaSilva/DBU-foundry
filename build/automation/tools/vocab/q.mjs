// Package Q (round 11): what it teaches the automation validator.
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
  const out = [];
  const t = String(m?.target ?? "");
  if ( t.startsWith("masteryCap.") && !/^masteryCap\.[a-z0-9]+$/.test(t) ) out.push(`modifier ${i}: ${t}: masteryCap.<slug> (lowercase letters and digits of the Transformation's name)`);
  return out;
}
// eslint-disable-next-line no-unused-vars
export function checkTrigger(t, i, ctx) { return []; }
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) {
  const out = [];
  const code = e?.code;
  if ( code?.category !== "grant" ) return out;
  for ( const m of String(code.spec ?? "").matchAll(/\+mastery\s*:\s*([^\s;+]*)/gi) ) {
    if ( !/^[1-9]\d*$/.test(m[1]) ) out.push(`grant: "+mastery:${m[1]}" (a number of Masteries: +mastery:1)`);
  }
  return out;
}
