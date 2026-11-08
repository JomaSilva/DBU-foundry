// Package I (round 5: Grades unlocked, the Original Form of Evolved Stages): what it teaches the automation validator.
// Only Package I edits this file. Every export must stay (empty is fine); see tools/vocab/c.mjs for what each one means.
//
// @OM / @OFM / @OA / @OG / @OT: the Original Form of an Evolved Stage (its Mastery, Fully Mastered, active, Grade, Tier
// of Power Requirement), from the item's `original` field (data/items.mjs originalContext); Evolved Stages only.
export const EVENT_VARS = {};
export const BASE_VARS = ["OM", "OFM", "OA", "OG", "OT"];
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

const ORIGINAL = /@(OM|OFM|OA|OG|OT)(?![\w.])/;
function originalProblem(formulas, what, ctx) {
  if ( !formulas.some(f => ORIGINAL.test(String(f ?? ""))) ) return [];
  if ( ctx.racial || (ctx.effect && (ctx.effect.transType !== "evolved") && !ctx.effect.evolvedStage) ) return [`${what}: @OM/@OFM/@OA/@OG/@OT are the Original Form of an Evolved Stage (only on Evolved Stages)`];
  return [];
}

export function checkModifier(m, i, ctx) {
  const out = [...originalProblem([m.value, m.condition], `modifier ${i}`, ctx)];
  if ( /^gradeMax\./.test(String(m.target ?? "")) && (m.mode || m.limit || m.cost || m.amount || m.group) ) out.push(`modifier ${i}: gradeMax.* takes no mode, limit, cost, amount or group`);
  return out;
}
export function checkTrigger(t, i, ctx) {
  return originalProblem([t.value, t.condition, t.cost], `trigger ${i}`, ctx);
}
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
