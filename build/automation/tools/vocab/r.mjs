// Package R (round 12): what it teaches the automation validator.
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
  if ( (m?.target === "attack.advantagePick") && !/^\d+$/.test(String(m.value ?? "").trim()) ) out.push(`modifier ${i}: attack.advantagePick: the value is the most TP (a number: "10")`);
  return out;
}
// eslint-disable-next-line no-unused-vars
export function checkTrigger(t, i, ctx) { return []; }
/** An entry's own choice: { "options": [names], "pick": n }; its pieces' "option" must be one of them. */
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) {
  const out = [];
  const pieces = [...(e?.modifiers ?? []), ...(e?.triggers ?? [])];
  if ( e?.choice === undefined ) return out;
  const c = e.choice;
  const options = Array.isArray(c?.options) ? c.options.map(o => String(o ?? "").trim()) : [];
  if ( (options.length < 2) || options.some(o => !o) ) out.push(`choice: "options" must list 2+ names`);
  if ( new Set(options).size !== options.length ) out.push(`choice: an option is listed twice`);
  if ( (c?.pick !== undefined) && !(Number.isInteger(c.pick) && (c.pick >= 1) && (c.pick < options.length)) ) out.push(`choice: "pick" must be a number from 1 to ${Math.max(1, options.length - 1)}`);
  for ( const k of Object.keys(c ?? {}) ) if ( !["options", "pick"].includes(k) ) out.push(`choice: unknown field "${k}"`);
  for ( const p of pieces ) if ( p.option && !options.includes(String(p.option)) ) out.push(`choice: the piece option "${p.option}" is not one of its options`);
  if ( !pieces.some(p => p.option) ) out.push(`choice: no piece has an "option" of it`);
  if ( /^[a-z0-9-]+\|/.test(key) && ctx?.racialKeys?.has?.(key) ) out.push(`choice: Racial Traits cannot have a choice (Transformations only)`);
  return out;
}
