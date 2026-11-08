// Package P (round 10: token movement in combat): what it teaches the automation validator.
export const EVENT_VARS = {
  moved: ["squares", "leftMelee", "enteredMelee", "endOpponentsAdjacent", "endAlliesAdjacent", "vs."],
  opponentLeftMelee: ["squares", "provokes", "vs."],
  opponentEnteredMelee: ["squares", "provokes", "vs."],
  endedAdjacent: ["squares", "isOpponent", "isAlly", "provokes", "vs."]
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
export const WITH_OTHER = ["moved", "opponentLeftMelee", "opponentEnteredMelee", "endedAdjacent"];
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
