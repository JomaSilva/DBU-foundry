/**
 * Package D (round 3): effect references and Aspects changed by modifiers.
 *
 * Effect references. Every piece of a compendium item (modifier or trigger) carries `fx`, the reference of the rules
 * effect it comes from: "<item slug>_<Trait>_<n>", lowercase letters and digits ("super-saiyan|Golden Power|3" →
 * "supersaiyan_goldenpower_3"; a repeated number keeps its letter: "_3b"). The item's flag `fx` lists every effect it
 * has with the condition of its Trait ({ ref: condition }), `fxPermanent` the Permanent ones (they work outside it).
 * - @fx.<ref>: 1 while that effect is in force (its item works — a Transformation you are in, a Racial Trait switched
 *   on, an Awakening with Stacks — or the effect is Permanent, and its Trait's condition holds: a Mastery Trait's @M >= 1).
 * - Modifier targets on another effect: fxOff.<ref> (1: its pieces do nothing), fxOn.<ref> (1: its pieces work while
 *   its item does not, e.g. a Transformation Trait outside the Transformation; the item must be on the sheet),
 *   fxMult.<ref> (× the value of each of its pieces; product), fxAdd.<ref> (+ to the value of each of its pieces; sum),
 *   fxLimit.<ref> (text: the use limit its pieces get instead of their own, "1/Round", "@mastery.glasspower/Encounter").
 *   They are worked out before every other modifier, with the formula data known then (no Aptitudes, no @powerSpiked)
 *   plus @fx.
 *
 * Aspects by modifier (worked out after the Power maximum, then every modifier is gathered again with the new Aspects):
 * - aspect.<key> (± levels of this Transformation's Aspect; it gains the Aspect when it lacks it, a negative total
 *   down to 0 removes it), aspect.<key>.<param> (the Aspect with that parameter: aspect.enhancedSave.impulsive,
 *   aspect.innateState.raging, aspect.linked.sparkingaura), aspectSet.<key> (sets the level; 0 removes),
 *   aspectAll.<key>[.<param>] (every Transformation you are in), aspectOf.<slug>.<key>[.<param>] (the Transformation of
 *   that slug: lowercase letters and digits of its name). An Aspect without levels counts as level 1 (value 1 adds it,
 *   -1 removes it). Conditions see the formula data of the moment, the piece's own variables (@M, @G, @TR...) and
 *   @powerSpiked.
 */
import { DBU } from "../config.mjs";
import { evaluate, test } from "./formula.mjs";
import { awakeningSlug, stackChoiceCount } from "./awakening.mjs";
import { aspectLabel } from "./aspects.mjs";

/** Lowercase letters and digits, accents dropped ("Golden Power" → "goldenpower"); the same rule as the importer's. */
export const fxSlug = s => awakeningSlug(s);
/** The reference of an effect: fxRef("super-saiyan", "Golden Power", 3) → "supersaiyan_goldenpower_3". */
export const fxRef = (slug, trait, n) => `${fxSlug(slug)}_${fxSlug(trait)}_${String(n ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;

/** Targets on other effects (worked out by fxPass, never summed in the buckets). */
export const FX_TARGET = /^fx(Off|On|Mult|Add|Limit|Ask)\./;
/** Aspect targets (worked out by aspectPass). */
export const ASPECT_TARGET = /^aspect(Set|All|Of)?\./;
/** Targets that neither the stages nor the sheet sum: the passes of this file read them. */
/** Package E rule targets (rules/transform-rules.mjs reads them when a Transformation is entered or left). */
const RULE_TARGET = /^(enterBlock|combineBlock|leaveBlock|leaveWhen|grandTrigger)$|^enterBlock(Of|Aspect|Type)./;
export const isPassTarget = target => FX_TARGET.test(String(target ?? "")) || ASPECT_TARGET.test(String(target ?? ""))
  || RULE_TARGET.test(String(target ?? ""));

const EMPTY = Object.freeze({ inForce: {}, off: new Set(), on: new Set(), mult: {}, add: {}, limit: {}, ask: new Set() });
export const emptyFx = () => ({ inForce: {}, off: new Set(), on: new Set(), mult: {}, add: {}, limit: {}, ask: new Set() });

/** Does the item work now (its pieces apply)? */
const itemWorks = item => !!(item.system?.isActive ?? true);
/** Per-Stack choices of an Awakening: how many times a piece counts (null: not a per-Stack choice). */
const pieceCount = (item, p) => ((item.type === "transformation") ? stackChoiceCount(item.system, p.label) : null);
const pieceOn = (item, p) => {
  const count = pieceCount(item, p);
  return (count === null) ? (p.active !== false) : (count > 0);
};

/**
 * Which effects are in force and what the fx* pieces do to the other effects.
 * @param {Actor} actor
 * @param {object} data   The formula data known before the modifiers (rules/derived.mjs)
 * @returns {{ inForce: object, off: Set<string>, on: Set<string>, mult: object, add: object, limit: object }}
 */
export function fxPass(actor, data = {}) {
  const out = emptyFx();
  const pieces = [];
  for ( const item of actor?.items ?? [] ) {
    const s = item.system;
    if ( !s ) continue;
    const works = itemWorks(item);
    const ctx = (item.type === "transformation") ? (s.formulaContext ?? {}) : {};
    const flags = item.flags?.["dbu-rpg"] ?? {};
    const permanent = new Set(flags.fxPermanent ?? []);
    for ( const [ref, cond] of Object.entries(flags.fx ?? {}) ) {
      if ( !(works || permanent.has(ref)) ) continue;
      if ( String(cond ?? "").trim() && !test(cond, { ...data, ...ctx }) ) continue;
      out.inForce[ref] = 1;
    }
    for ( const m of s.modifiers ?? [] ) {
      if ( !FX_TARGET.test(String(m.target ?? "")) || !(works || m.always) || !pieceOn(item, m) ) continue;
      if ( (item.type === "racialTrait") && !s.twinned && String(m.label ?? "").endsWith(" (Twinned)") ) continue;
      pieces.push({ m, ctx });
    }
  }
  const base = { ...data, fx: out.inForce };
  for ( const { m, ctx } of pieces ) {
    const scope = { ...base, ...ctx };
    if ( !test(m.condition, scope) ) continue;
    const dot = m.target.indexOf(".");
    const kind = m.target.slice(0, dot);
    const ref = m.target.slice(dot + 1).toLowerCase();
    if ( !ref ) continue;
    if ( kind === "fxLimit" ) {
      const text = String(m.value ?? "").trim();
      if ( text ) out.limit[ref] = text;
      continue;
    }
    const v = evaluate(m.value, scope, { floor: kind !== "fxMult" });
    if ( kind === "fxOff" ) { if ( v > 0 ) out.off.add(ref); }
    else if ( kind === "fxOn" ) { if ( v > 0 ) out.on.add(ref); }
    else if ( kind === "fxMult" ) { if ( Number.isFinite(v) ) out.mult[ref] = (out.mult[ref] ?? 1) * v; }
    else if ( kind === "fxAdd" ) { if ( v ) out.add[ref] = (out.add[ref] ?? 0) + v; }
    // (T20 fxAsk: its pieces are asked instead of applied by themselves)
    else if ( kind === "fxAsk" ) { if ( v > 0 ) (out.ask ??= new Set()).add(ref); }
  }
  return out;
}

/** Text values are not numbers: an fxMult / fxAdd leaves them as they are. */
const TEXT_VALUE = /^(attack\.(damageAttribute|aoe|state)|favoredElement)$/;

/**
 * A piece as the other effects leave it: null when switched off (fxOff), else the piece itself or a copy with its value
 * multiplied / increased (fxMult / fxAdd: "((value)*m + a)") and its limit replaced (fxLimit).
 */
export function fxPiece(p, fx = EMPTY) {
  const ref = p?.fx;
  if ( !ref || !fx ) return p;
  if ( fx.off?.has(ref) ) return null;
  const mult = fx.mult?.[ref];
  const add = fx.add?.[ref];
  const limit = fx.limit?.[ref];
  const ask = !!fx.ask?.has?.(ref);
  if ( (mult === undefined) && !add && (limit === undefined) && !ask ) return p;
  const out = { ...p };
  const v = String(p.value ?? "").trim();
  if ( v && !TEXT_VALUE.test(String(p.target ?? "")) && (((mult !== undefined) && (mult !== 1)) || add) ) {
    out.value = `((${v})*${mult ?? 1} + ${add ?? 0})`;
  }
  if ( limit !== undefined ) out.limit = limit;
  if ( ask ) out.mode = "ask";
  return out;
}

/** Is the piece of an item that does not work switched on by an fxOn piece? */
export const fxForcedOn = (p, fx = EMPTY) => !!(p?.fx && fx?.on?.has(p.fx) && !fx.off?.has(p.fx));

/* -------------------------------------------- */
/*  Aspects changed by modifiers                */
/* -------------------------------------------- */

/** An Aspect key from its slug in a target ("enhancedsave" → "enhancedSave"), or null. */
function aspectKey(slug) {
  const s = fxSlug(slug);
  return Object.keys(DBU.aspects ?? {}).find(k => k.toLowerCase() === s) ?? null;
}

/** The text of an Aspect parameter from its slug: a Save, a State or the slug itself ("impulsive" → "Impulsive"). */
function aspectParam(key, slug) {
  const s = fxSlug(slug);
  if ( !s ) return "";
  if ( key === "enhancedSave" ) {
    const save = Object.keys(DBU.saves ?? {}).find(k => k === s);
    if ( save ) return save.charAt(0).toUpperCase() + save.slice(1);
    if ( s === "all" ) return "All";
  }
  if ( key === "innateState" ) {
    const state = Object.keys(DBU.states ?? {}).find(k => k.toLowerCase() === s);
    if ( state ) return { godki: "God Ki", deadstate: "Dead", multiplearms: "Multiple Arms", fusionofki: "Fusion of Ki" }[s]
      ?? (state.charAt(0).toUpperCase() + state.slice(1));
  }
  return slug;
}

/**
 * Parse an aspect.* target: { scope: "own" | "all" | "of", slug, key, param, set }; null when it names no Aspect.
 * aspect.<key>[.<param>], aspectSet.<key>[.<param>], aspectAll.<key>[.<param>], aspectOf.<slug>.<key>[.<param>]
 */
export function parseAspectTarget(target) {
  const parts = String(target ?? "").split(".");
  const head = parts.shift();
  let scope = "own";
  let slug = "";
  if ( head === "aspectAll" ) scope = "all";
  else if ( head === "aspectOf" ) { scope = "of"; slug = fxSlug(parts.shift()); }
  else if ( !["aspect", "aspectSet"].includes(head) ) return null;
  const key = aspectKey(parts.shift());
  if ( !key ) return null;
  const param = parts.length ? aspectParam(key, parts.join(".")) : "";
  return { scope, slug, key, param, set: head === "aspectSet" };
}

/**
 * The aspect.* pieces among the gathered modifiers, tested and evaluated: { itemId: [{ key, param, set, value }] }.
 * Empty when there is none.
 */
export function aspectChanges(actor, mods, data) {
  const out = new Map();
  const transformations = (actor?.items ?? []).filter(i => i.type === "transformation");
  for ( const m of mods ) {
    if ( !ASPECT_TARGET.test(String(m.target ?? "")) ) continue;
    const t = parseAspectTarget(m.target);
    if ( !t ) continue;
    const scope = (m.ctx && Object.keys(m.ctx).length) ? { ...data, ...m.ctx } : data;
    if ( !test(m.condition, scope) ) continue;
    const value = evaluate(m.value, scope);
    if ( !value && !t.set ) continue;
    let items = [];
    if ( t.scope === "own" ) items = transformations.filter(i => i.id === m.itemId);
    else if ( t.scope === "all" ) items = transformations.filter(i => i.system.isActive);
    else items = transformations.filter(i => awakeningSlug(i.name) === t.slug);
    for ( const i of items ) {
      if ( !out.has(i.id) ) out.set(i.id, []);
      out.get(i.id).push({ key: t.key, param: t.param, set: t.set, value });
    }
  }
  return out;
}

/**
 * A Transformation's Aspects with the changes applied (a new list): levels added (an Aspect without levels is 0/1),
 * "set" values replace the level, a parameter is added to the Aspect's list ("Enhanced Save (Impulsive/Corporeal)").
 */
export function applyAspectChanges(aspects, changes) {
  const list = (aspects ?? []).map(a => ({ ...a }));
  const def = k => DBU.aspects?.[k] ?? {};
  const levelOf = a => (def(a.key).levels ? Math.max(1, a.level || 0) : 1);
  const sets = changes.filter(c => c.set);
  const adds = changes.filter(c => !c.set);
  const find = key => list.find(a => a.key === key);
  const ensure = (key, param) => {
    let a = find(key);
    if ( !a ) {
      a = { key, name: "", level: 0, param: "" };
      list.push(a);
    }
    if ( param ) {
      const params = String(a.param || "").split(/[\/,]/).map(p => p.trim()).filter(Boolean);
      if ( !params.some(p => p.toLowerCase() === param.toLowerCase()) ) params.push(param);
      a.param = params.join("/");
    }
    return a;
  };
  const remove = (key, param) => {
    if ( !param ) {
      for ( let k = list.length - 1; k >= 0; k-- ) if ( list[k].key === key ) list.splice(k, 1);
      return;
    }
    const a = find(key);
    if ( !a ) return;
    a.param = String(a.param || "").split(/[\/,]/).map(p => p.trim()).filter(p => p && (p.toLowerCase() !== param.toLowerCase())).join("/");
    if ( !a.param ) remove(key, "");
  };
  // The summed change of each Aspect (and parameter)
  const totals = new Map();
  for ( const c of adds ) {
    const k = `${c.key}|${c.param}`;
    totals.set(k, (totals.get(k) ?? 0) + c.value);
  }
  for ( const [k, n] of totals ) {
    const [key, param] = k.split("|");
    const a = find(key);
    if ( n > 0 ) {
      const was = a ? levelOf(a) : 0;
      const b = ensure(key, param);
      if ( def(key).levels ) b.level = Math.min(def(key).levels, (a ? was : 0) + n);
      else b.level = 0;
    }
    else if ( n < 0 ) {
      if ( !a ) continue;
      if ( param ) { remove(key, param); continue; }
      const left = levelOf(a) + n;
      if ( (left <= 0) || !def(key).levels ) remove(key, "");
      else a.level = left;
    }
  }
  for ( const c of sets ) {
    if ( c.value <= 0 ) { remove(c.key, c.param); continue; }
    const b = ensure(c.key, c.param);
    b.level = def(c.key).levels ? Math.min(def(c.key).levels, c.value) : 0;
  }
  for ( const a of list ) a.name = aspectLabel(a);
  return list;
}

/**
 * Apply the aspect.* pieces: each Transformation they change gets its new Aspect list (from the one its item worked
 * out, `itemAspects`). Returns true when a list changed (the modifiers are then gathered again).
 */
export function aspectPass(actor, mods, data) {
  const changes = aspectChanges(actor, mods, data);
  let changed = false;
  for ( const item of actor?.items ?? [] ) {
    if ( item.type !== "transformation" ) continue;
    const s = item.system;
    const base = s.itemAspects ?? s.aspects;
    const c = changes.get(item.id);
    const next = c?.length ? applyAspectChanges(base, c) : base;
    if ( JSON.stringify(next) !== JSON.stringify(s.aspects) ) changed = true;
    s.aspects = next;
    // J: a Transformation that gains the Graded Aspect through a Trait ("Dark Ki gains the Graded Aspect") is Graded
    if ( next.some(a => a.key === "graded") ) s.graded = true;
  }
  return changed;
}
