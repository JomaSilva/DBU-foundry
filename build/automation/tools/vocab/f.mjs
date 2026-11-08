// Package F (round 3: attack-time vocabulary, F1-F4): what it teaches the automation validator (../validate.mjs merges
// a..f after its base lists). Only Package F edits this file. Every export must stay (empty is fine); see
// tools/vocab/c.mjs for what each one means.
//
// A variable list may hold a family: an entry ending in "." or "_" allows every variable that starts with it.
import { DBU } from "../../../../dbu-rpg/module/config.mjs";
import { SIGNATURE_OPTIONS } from "../../../../dbu-rpg/module/data/signature-options.mjs";

// F3: the Weapon used (@weapon_<slug>: its name, Category or a Quality), the Signature used (@sig_<slug>), the effect
// whose button made the attack (@viaFx.<ref>, checked by tools/vocab/d.mjs)
const ATTACK_F3 = ["weapon_", "sig_", "viaFx."];
// F4 Punching Down / Up: how many of the attack's targets (of the pair, in vs pieces and hit events: 1/0) it applies to,
// and 1 when it applies to every one. Known once the attack is declared (not in the declaration's attack.* pieces)
const PUNCH = ["punchDown", "punchUp", "punchDownAll", "punchUpAll"];

/** { "<event>": ["var", ...] }: added to that event's variables. */
export const EVENT_VARS = {};
export const BASE_VARS = [];
export const PREFIX_VARS = [];
/** Attack variables: every attack event, defense.* and vs.* pieces. */
export const ATTACK_VARS = [...ATTACK_F3, ...PUNCH];
export const DEFENSE_VARS = [];
/** attack.* pieces made at declaration (also the start of WOUND_OPTION_VARS). */
export const ATTACK_OPTION_VARS = [...ATTACK_F3];
/** defense.* pieces: now with @vs (the attacker) and @defending (always 1 there). */
export const DEFENSE_OPTION_VARS = ["vs.", "defending"];
/** attack.* pieces with at: "wound". */
export const WOUND_OPTION_VARS = [...PUNCH];
/** vs.* pieces: @defending (1: the owner of the piece defends against the other Character, 0: it attacks it). */
export const VS_VARS = ["defending"];
export const CLASH_VARS = [];
export const TARGET_VARS = {};
export const FIELD_VARS = {};
export const WITH_OTHER = [];
export const OPTION_PREFIXES = [];
export const TEXT_TARGETS = [];
export const DICE_TARGETS = [];
export const PREFIX_RE = [];

/** The defender's pieces counted only when they change the Damage: automatic (rules/versus.mjs VS_DEFERRED). */
const DEFERRED = new Set(["vs.ignoreDamageBelow", "vs.damageMax"]);
/** Size index targets (0 nano ... 7 colossal) when the value is a plain number. */
const SIZE_SETS = new Set(["attack.punchDown.sizeSet", "attack.punchUp.sizeSet", "punchedDown.sizeSet", "punchedUp.sizeSet"]);
/** The Maneuver keys whose `with` is an attack's (combat/attack.mjs parseAttackWith). */
const ATTACK_MANEUVERS = new Set(["basicAttack", "signature", "exploit", "feint"]);
/** The filters of "only=" (the ones with ":" take a key). */
const ONLY = new Set(["physical", "energy", "magic", "armed", "unarmed", "signature", "basic", "ultimate", "aoe", "noaoe", "copied"]);
const DAMAGE_ATTR = /^(any|surgency|ag|fo|te|sc|in|ma|pe)([|,/](surgency|ag|fo|te|sc|in|ma|pe))*$/i;
/** attack.* text targets a `with` part may set (their value is text). */
const WITH_TEXT = { "attack.damageAttribute": v => DAMAGE_ATTR.test(v), "attack.aoe": v => /^(sphere|cone|line|any)([|](sphere|cone|line))*$/.test(v),
  "attack.state": null };

/** An "only=" filter: a plain one, tag:<tag>, profile:<Profile key>, element:<element>. */
function onlyProblem(filter) {
  const [kind, ...rest] = String(filter).split(":");
  const arg = rest.join(":").trim();
  if ( ONLY.has(kind) && !rest.length ) return null;
  if ( kind === "tag" ) return /^[A-Za-z0-9]+$/.test(arg) ? null : `only "${filter}" (tag:<tag>)`;
  if ( kind === "profile" ) return (arg in DBU.profiles) ? null : `only "${filter}": unknown Profile key`;
  if ( kind === "element" ) {
    const s = arg.toLowerCase().replace(/elemental|[^a-z]/g, "");
    const ok = Object.entries(DBU.profiles).some(([, p]) => p.elemental && (String(p.label).toLowerCase().replace(/elemental|[^a-z]/g, "") === s));
    return ok ? null : `only "${filter}": unknown element`;
  }
  return `only "${filter}" (${[...ONLY].join(", ")}, tag:<tag>, profile:<key>, element:<name>)`;
}

export function checkModifier(m, i, ctx) {
  const out = [];
  const t = String(m.target ?? "");
  const what = `modifier ${i}`;
  const set = f => String(m[f] ?? "").trim() !== "";
  // F2 attack.advantage.<key> / attack.superProfile.<key>
  const grant = /^attack\.(advantage|superProfile)\.(.*)$/.exec(t);
  if ( grant ) {
    if ( (grant[1] === "advantage") && !SIGNATURE_OPTIONS[grant[2]] ) out.push(`${what}: ${t}: "${grant[2]}" is not an Advantage / Disadvantage key (data/signature-options.mjs)`);
    if ( (grant[1] === "superProfile") && !DBU.superProfiles[grant[2]] ) out.push(`${what}: ${t}: "${grant[2]}" is not a Super Profile key (${Object.keys(DBU.superProfiles).join(", ")})`);
    if ( String(m.at ?? "") === "wound" ) out.push(`${what}: ${t} is read at declaration (no at "wound")`);
  }
  // F4 the deferred defender pieces: automatic (their use is counted when they change the Damage)
  if ( DEFERRED.has(t) ) {
    const bad = ["cost", "amount", "group"].filter(set);
    if ( (m.mode === "ask") || bad.length ) out.push(`${what}: ${t} is automatic (counted when it changes the Damage): no mode "ask"${bad.length ? `, no ${bad.join("/")}` : ""}`);
  }
  if ( (t === "vs.autoDodge") && /^\d+$/.test(String(m.value ?? "").trim()) && !["1", "2"].includes(String(m.value).trim()) ) {
    out.push(`${what}: vs.autoDodge value 1 (a miss) or 2 (a miss, and no Absolute Attack half Wound)`);
  }
  if ( SIZE_SETS.has(t) && /^\d+$/.test(String(m.value ?? "").trim()) && (Number(m.value) > 7) ) {
    out.push(`${what}: ${t} is a Size index (0 nano, 1 tiny, 2 small, 3 medium, 4 large, 5 enormous, 6 gigantic, 7 colossal)`);
  }
  return out;
}

/**
 * F1: the `with` of a "maneuver" trigger whose Maneuver is an attack (basicAttack, signature, exploit, feint):
 * "<attack.* target>=<formula>", "only=<filter>[|<filter>]", "via=<slug>", "attr=<attr>".
 * (tools/vocab/b.mjs checks `with` for the other Maneuver keys and must leave these parts to this file.)
 */
export function checkTrigger(t, i, ctx) {
  const out = [];
  if ( (t.effect !== "maneuver") || !String(t.with ?? "").trim() ) return out;
  const keys = String(t.resource ?? "").split("|").map(s => s.trim()).filter(Boolean);
  if ( !keys.some(k => ATTACK_MANEUVERS.has(k)) ) return out;
  const what = `trigger ${i} with`;
  for ( const part of String(t.with).split(";").map(s => s.trim()).filter(Boolean) ) {
    const eq = part.indexOf("=");
    const key = (eq > 0) ? part.slice(0, eq).trim() : "";
    const value = (eq > 0) ? part.slice(eq + 1).trim() : "";
    if ( !key || !value ) { out.push(`${what}: "${part}" (target=formula, only=, via=, attr=)`); continue; }
    if ( key === "only" ) {
      for ( const f of value.split("|").map(s => s.trim()) ) { const p = onlyProblem(f); if ( p ) out.push(`${what}: ${p}`); }
      continue;
    }
    if ( key === "via" ) {
      if ( !/^[a-z0-9]+$/.test(value) ) out.push(`${what}: via "${value}" (exploit, defend, feint or a Maneuver item's slug)`);
      continue;
    }
    if ( key === "attr" ) {
      if ( !DAMAGE_ATTR.test(value) || /[|,/]/.test(value) || (value === "any") ) out.push(`${what}: attr "${value}" (one of ag fo te sc in ma pe surgency)`);
      continue;
    }
    if ( keys.some(k => !ATTACK_MANEUVERS.has(k)) ) { out.push(`${what}: "${key}" with a list mixing attacks and other Maneuvers`); continue; }
    if ( !key.startsWith("attack.") || !ctx.isTarget(key) ) { out.push(`${what}: unknown attack target "${key}"`); continue; }
    if ( key in WITH_TEXT ) {
      const ok = WITH_TEXT[key];
      if ( key === "attack.state" ) { if ( !ctx.STATES.some(k => (k === value) || (ctx.norm(k) === ctx.norm(value))) ) out.push(`${what}: attack.state "${value}" is not a State`); }
      else if ( !ok(value) ) out.push(`${what}: ${key} "${value}"`);
      continue;
    }
    out.push(...ctx.check(value, ctx.ATTACK_OPTION_VARS, `${what} ${key}`, true));
  }
  return out;
}

// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
