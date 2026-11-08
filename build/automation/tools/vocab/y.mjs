// Package Y (round 17): what it teaches the automation validator.
const WATCH = ["by_", "distance", "oos", "ua", "god", "villainous", "special", "standard", "instant", "counterManeuver", "modifierManeuver", "vs."];
export const EVENT_VARS = { opponentManeuver: WATCH, allyManeuver: WATCH, combatRecovery: ["actions", "condition"] };
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
export const WITH_OTHER = ["opponentManeuver", "allyManeuver"];
export const OPTION_PREFIXES = [];
export const TEXT_TARGETS = [];
export const DICE_TARGETS = [];
export const PREFIX_RE = [];
// eslint-disable-next-line no-unused-vars
export function checkModifier(m, i, ctx) { return []; }
// eslint-disable-next-line no-unused-vars
export function checkTrigger(t, i, ctx) {
  if ( (t?.effect === "provoke") && String(t.resource ?? "").trim() && !["adjacent", "melee", "notLong", "other"].includes(String(t.resource).trim()) && !/^\d+$/.test(String(t.resource).trim()) ) {
    return [`trigger ${i}: provoke resource "${t.resource}" (adjacent | melee | notLong)`];
  }
  return [];
}
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
