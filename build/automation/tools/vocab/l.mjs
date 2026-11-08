// Package L (round 6: the rolls of the others of your encounter): what it teaches the automation validator. Only Package
// L edits this file. Every export must stay (empty is fine); see tools/vocab/c.mjs for what each one means.
import * as C from "./c.mjs";

const ROLLED = [...(C.EVENT_VARS?.rolled ?? [])];
/** The roll's variables (as on "rolled"), whether it was against you, how far who rolled is. */
export const EVENT_VARS = {
  opponentRolled: [...ROLLED, "againstMe", "rollerDistance"],
  allyRolled: [...ROLLED, "againstMe", "rollerDistance"]
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
export const WITH_OTHER = ["opponentRolled", "allyRolled"];
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
