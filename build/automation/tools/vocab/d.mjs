// Package D (round 3: effect references, Aspects by modifier, built-in State effects): what it teaches the automation
// validator (../validate.mjs merges a, b, c, d after its base lists). Only Package D edits this file. Every export must
// stay (empty is fine).
//
// An effect reference is "<item slug>_<Trait>_<n>" in lowercase letters and digits (dbu-rpg/module/rules/fx.mjs fxRef):
// "super-saiyan|Golden Power|3" → supersaiyan_goldenpower_3. The references are checked against the effects dump given
// to validate.mjs (--dump).
import fs from "node:fs";
import { DBU } from "../../../../dbu-rpg/module/config.mjs";

const fxSlug = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
export const fxRef = (slug, trait, n) => `${fxSlug(slug)}_${fxSlug(trait)}_${String(n ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;

/** Every effect reference of the dump (validate.mjs --dump <file>); empty when it cannot be read. */
const REFS = new Set();
const TRANSFORMATION_SLUGS = new Set();
{
  const at = process.argv.indexOf("--dump");
  try {
    if ( at > 0 ) {
      for ( const d of JSON.parse(fs.readFileSync(process.argv[at + 1], "utf8")) ) {
        const kn = String(d.key ?? "").split("|")[2] ?? d.n;
        REFS.add(fxRef(d.slug, d.trait, kn));
        if ( d.transType !== "racial" ) TRANSFORMATION_SLUGS.add(fxSlug(d.item));
      }
    }
  } catch(err) { /* no dump: references are not checked */ }
}
const knownRef = ref => !REFS.size || REFS.has(String(ref).toLowerCase());

/** Moments that may come from a "maneuver" button or a State entered through an effect: @viaFx.<ref>. */
const VIA_EVENTS = ["stateEnter", "powerUp", "surge", "energyCharge", "transform", "attackMade", "attackHit", "attackMissed", "empower",
  "legendRealized"];
export const EVENT_VARS = {
  fxUsed: ["fxUsed."],
  ...Object.fromEntries(VIA_EVENTS.map(e => [e, ["viaFx.", ...((e === "stateEnter") ? ["already"] : [])]]))
};
/** rules/proximity.mjs: Allies / Opponents within 1 Square, Squares to the nearest one. */
export const BASE_VARS = ["alliesAdjacent", "opponentsAdjacent", "nearestAlly", "nearestOpponent"];
/** @fx.<ref> (1 while that effect is in force), @stateFx.<state>.<ref> (1: that State was entered through that effect). */
/** @item.<slug> (items that work, by name), @used.<slug> / @usedEnc.<slug> (Maneuvers / Unique Abilities / items used this
 * Combat Round / Encounter). */
export const PREFIX_VARS = ["fx", "stateFx", "item", "used", "usedEnc", "alliesWithin", "opponentsWithin"];
export const ATTACK_VARS = [];
export const DEFENSE_VARS = [];
export const ATTACK_OPTION_VARS = [];
export const DEFENSE_OPTION_VARS = [];
export const WOUND_OPTION_VARS = [];
export const VS_VARS = [];
export const CLASH_VARS = [];
export const TARGET_VARS = {};
export const FIELD_VARS = {};
export const WITH_OTHER = ["fxUsed"];
export const OPTION_PREFIXES = [];
/** fxLimit.<ref>: the value is a use limit ("1/Round", "@mastery.glasspower/Encounter"). */
export const TEXT_TARGETS = ["fxLimit."];
export const DICE_TARGETS = [];
export const PREFIX_RE = [];

const ASPECTS = Object.keys(DBU.aspects);
const aspectKey = s => ASPECTS.find(k => k.toLowerCase() === fxSlug(s)) ?? null;

/** Problems of the references a formula reads: @fx.<ref>, @stateFx.<state>.<ref>, @viaFx.<ref>, @fxUsed.<ref>. */
function refProblems(formulas, what, ctx) {
  const out = [];
  for ( const f of formulas.filter(Boolean) ) {
    for ( const v of ctx.variables(String(f)) ) {
      const parts = v.split(".");
      const root = parts[0];
      let ref = null;
      if ( ["fx", "viaFx", "fxUsed"].includes(root) ) ref = parts.slice(1).join(".");
      else if ( root === "stateFx" ) {
        if ( !ctx.STATES.includes(parts[1]) ) out.push(`${what}: @${v}: "${parts[1]}" is not a State key`);
        ref = parts.slice(2).join(".");
      }
      if ( ["alliesWithin", "opponentsWithin"].includes(root) ) {
        if ( !/^([1-9]|1[0-2])$/.test(parts[1] ?? "") || (parts.length > 2) ) out.push(`${what}: @${v}: the key is a number of Squares, 1 to 12`);
        continue;
      }
      if ( ref === null ) continue;
      if ( !ref ) out.push(`${what}: @${v} needs an effect reference`);
      else if ( !knownRef(ref) ) out.push(`${what}: @${v}: no effect "${ref}" (reference = <item slug>_<Trait>_<n>, lowercase letters/digits)`);
    }
  }
  return out;
}

export function checkModifier(m, i, ctx) {
  const out = [];
  const t = String(m.target ?? "");
  const what = `modifier ${i}`;
  const fx = /^fx(Off|On|Mult|Add|Limit)\.(.+)$/.exec(t);
  if ( fx ) {
    if ( !knownRef(fx[2]) ) out.push(`${what}: ${t}: no effect "${fx[2]}" (reference = <item slug>_<Trait>_<n>)`);
    if ( fx[1] === "fxLimit" ) out.push(...ctx.checkLimit(String(m.value ?? ""), what));
    if ( m.mode || m.limit || m.cost || m.amount || m.group ) out.push(`${what}: ${t} takes no mode, limit, cost, amount or group`);
  }
  if ( /^aspect(Set|All|Of)?\./.test(t) ) {
    const parts = t.split(".");
    const head = parts.shift();
    if ( head === "aspectOf" ) {
      const slug = parts.shift();
      if ( !slug || (TRANSFORMATION_SLUGS.size && !TRANSFORMATION_SLUGS.has(fxSlug(slug))) ) {
        out.push(`${what}: ${t}: "${slug}" is not the slug of a Transformation (its name in lowercase letters/digits)`);
      }
    }
    const key = parts.shift();
    if ( !aspectKey(key) ) out.push(`${what}: ${t}: unknown Aspect "${key}" (${ASPECTS.join(", ")})`);
    else if ( parts.length && !DBU.aspects[aspectKey(key)].param ) out.push(`${what}: ${t}: the ${aspectKey(key)} Aspect has no parameter`);
    if ( ctx.racial && (head === "aspect" || head === "aspectSet") ) {
      out.push(`${what}: a Racial Trait has no Aspects of its own: aspectAll.<key> or aspectOf.<slug>.<key>`);
    }
    if ( m.mode || m.limit || m.cost || m.amount || m.group ) out.push(`${what}: ${t} takes no mode, limit, cost, amount or group`);
  }
  out.push(...refProblems([m.value && !/^fxLimit\./.test(t) ? m.value : "", m.condition], what, ctx));
  return out;
}

export function checkTrigger(t, i, ctx) {
  return refProblems([t.value, t.condition, t.cost, t.amount], `trigger ${i}`, ctx);
}

// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
