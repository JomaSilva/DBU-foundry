// Package M (round 7: resourcePick): what it teaches the automation validator. Only Package M edits this file. Every
// export must stay (empty is fine); see tools/vocab/c.mjs for what each one means.
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
export function checkModifier(m, i, ctx) { return []; }
const ATTACK_EVENTS = ["attackMade", "allyAttack", "targeted", "allyTargeted"];
export function checkTrigger(t, i, ctx) {
  if ( (t.effect === "attackWound") && !ATTACK_EVENTS.includes(t.event) ) return [`trigger ${i}: attackWound needs the attack of the event (${ATTACK_EVENTS.join(", ")})`];
  if ( t.effect !== "resourcePick" ) return [];
  const out = [];
  const parts = String(t.resource ?? "").split("|").map(p => p.trim()).filter(Boolean);
  if ( parts.length < 1 ) out.push(`trigger ${i}: resourcePick needs its resources in resource ("A|B|* Stance")`);
  if ( t.mode !== "ask" ) out.push(`trigger ${i}: resourcePick asks the player: mode "ask"`);
  if ( (t.target ?? "self") !== "self" ) out.push(`trigger ${i}: resourcePick is for your own resources (target self)`);
  return out;
}
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
