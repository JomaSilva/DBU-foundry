import { DBU } from "../config.mjs";

/** Key of a resource in formulas: "Battle Born" → @res.battleborn (per Combat Roll: @res.battleborn_wound). */
export function resourceSlug(name) {
  return String(name ?? "").slugify({ strict: true }).replace(/-/g, "");
}

/** Definition of a known split resource (Battle Born, Progress...), or null. */
export function splitDef(name) {
  return DBU.splitResources[resourceSlug(name)] ?? null;
}

/** A new resource entry; known split resources start applied per Combat Roll with their own limits. */
export function newResource(name) {
  const def = splitDef(name);
  return {
    name: def?.name ?? name, value: 0, max: def?.max ?? 0, target: "", perStack: "1(T)",
    split: !!def, alloc: { strike: 0, dodge: 0, wound: 0 }, unassigned: 0,
    cap: def?.cap ?? 2, lowest: !!def?.lowest, force: def?.force ?? ""
  };
}

export function allocTotal(r) {
  return DBU.splitRolls.reduce((t, k) => t + (r.alloc?.[k] ?? 0), 0);
}

/**
 * Limits of a split resource for each Combat Roll (Infinity = no limit) and the Combat Roll its stacks must go to.
 * Battle Born limits grow with "battleBorn.cap.<roll>" modifiers; Oozaru-like effects lift or force the Wound Roll.
 */
export function splitLimits(r, buckets = {}) {
  const def = splitDef(r.name);
  const total = key => Number(buckets[key]?.total ?? 0);
  const caps = {};
  for ( const k of DBU.splitRolls ) {
    let cap = (r.cap > 0) ? r.cap : Infinity;
    if ( def?.capTarget && Number.isFinite(cap) ) cap += total(`${def.capTarget}.cap.${k}`);
    caps[k] = cap;
  }
  let force = r.force || "";
  if ( def?.capTarget ) {
    if ( total("flag.bbWoundUnlimited") > 0 ) caps.wound = Infinity;
    if ( !force && (total("flag.bbForceWound") > 0) ) force = "wound";
  }
  return { caps, force };
}

/** Combat Rolls a new stack may be applied to right now. */
export function allowedRolls(r, { override = false } = {}) {
  const caps = r.caps ?? splitLimits(r).caps;
  const force = r.forceEff ?? r.force;
  let rolls = force ? [force] : [...DBU.splitRolls];
  if ( !override ) rolls = rolls.filter(k => (r.alloc[k] ?? 0) < caps[k]);
  if ( r.lowest && rolls.length ) {
    const min = Math.min(...rolls.map(k => r.alloc[k] ?? 0));
    rolls = rolls.filter(k => (r.alloc[k] ?? 0) === min);
  }
  return rolls;
}
