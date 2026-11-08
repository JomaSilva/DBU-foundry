// Racial package RA (round 21): what it teaches the automation validator.
const ALLY = ["allyMinion", "allyDistance", "allyBelow", "allyMark.", "vs."];
export const EVENT_VARS = {
  allyExploitTriggered: ["by_", ...ALLY],
  allyInflict: ["cond_", "level", ...ALLY],
  attackMade: ["sigUsedEnc", "sigUsedRound", "sigsUsedRound", "profileUsedRound.", "profileUsedEnc."],
  attackHit: ["sigUsedEnc", "sigUsedRound", "sigsUsedRound", "profileUsedRound.", "profileUsedEnc."],
  // LT: what a Transformation Maneuver entered; the Aspects a Stress Test is made for
  transform: ["enteredAlternate", "enteredLegendary", "enteredAspects."],
  roll: ["stressAspects.", "entering"]
};
export const BASE_VARS = ["opponentsCondByMe", "legendaryForm", "alternateForm"];
export const PREFIX_VARS = [];
export const ATTACK_VARS = ["sigUsedEnc", "sigUsedRound", "sigsUsedRound", "profileUsedRound.", "profileUsedEnc."];
export const DEFENSE_VARS = [];
export const ATTACK_OPTION_VARS = ["sigUsedEnc", "sigUsedRound", "sigsUsedRound", "profileUsedRound.", "profileUsedEnc."];
export const DEFENSE_OPTION_VARS = [];
export const WOUND_OPTION_VARS = ["sigUsedEnc", "sigUsedRound", "sigsUsedRound", "profileUsedRound.", "profileUsedEnc."];
export const VS_VARS = [];
export const CLASH_VARS = [];
export const TARGET_VARS = { "legend.bonus": ["legendAspects."] };
export const FIELD_VARS = {};
export const WITH_OTHER = ["allyExploitTriggered", "allyInflict"];
export const OPTION_PREFIXES = [];
export const TEXT_TARGETS = [];
export const DICE_TARGETS = [];
export const PREFIX_RE = [];
// eslint-disable-next-line no-unused-vars
export function checkModifier(m, i, ctx) {
  if ( m?.exclusive && !String(m.target ?? "").startsWith("attack.") ) return [`modifier ${i}: "exclusive" only on attack.* option pieces`];
  return [];
}
// eslint-disable-next-line no-unused-vars
export function checkTrigger(t, i, ctx) {
  if ( (t?.duration === "nextRoll") && (t.effect !== "buff") ) return [`trigger ${i}: duration nextRoll only on a buff`];
  return [];
}
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
