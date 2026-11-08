// Package S (round 13): what provokes the Exploit Maneuver — what it teaches the automation validator.
const KEYS = ["combatrecovery", "energycharge", "empower", "arrogantdeclaration", "terrainlift", "ride", "movement", "grapple", "disarm"];
// (Y: "effect": the Exploit a "provoke" effect provokes)
const BY_KEYS = [...KEYS, "effect"];
export const EVENT_VARS = {
  exploitTriggered: ["by_", "vs."],
  provokedExploit: ["n", "by_"]
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
export const WITH_OTHER = ["exploitTriggered"];
export const OPTION_PREFIXES = [];
export const TEXT_TARGETS = [];
export const DICE_TARGETS = [];
export const PREFIX_RE = [];
// eslint-disable-next-line no-unused-vars
export function checkModifier(m, i, ctx) {
  const t = String(m?.target ?? "");
  if ( t.startsWith("noProvoke.") && !KEYS.includes(t.slice(10)) ) return [`modifier ${i}: ${t}: noProvoke.<${KEYS.join(" | ")}>`];
  return [];
}
// eslint-disable-next-line no-unused-vars
export function checkTrigger(t, i, ctx) {
  const out = [];
  // (only the Exploit events: opponentManeuver / allyManeuver have a @by_ of every Maneuver)
  if ( !["exploitTriggered", "provokedExploit"].includes(t?.event) ) return out;
  for ( const m of String(t?.condition ?? "").matchAll(/@by_([a-z0-9]+)/g) ) if ( !BY_KEYS.includes(m[1]) ) out.push(`trigger ${i}: @by_${m[1]}: not one of ${BY_KEYS.join(", ")}`);
  return out;
}
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
