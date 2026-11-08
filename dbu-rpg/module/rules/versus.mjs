/**
 * The Versus layer: what an actor's effects do against ONE other Character of an attacker/target pair.
 *
 * Variables `@vs.<x>` (versusData(self, other)) describe the other Character: below, cond.<condition> (its effective
 * level), anyCond (how many Combat Conditions it suffers), dot, states.<state>, size (its current Size index), sizeDiff
 * (yours − its), initiative, initiativeDiff (yours − its; 0 outside combat), ally (1: it has your non-neutral
 * disposition), minion, top (its base ToP), capacityMax, mark.<slug> (1: you placed that mark on it), distance (F: the
 * Squares between your tokens on the same scene, rules/proximity.mjs tokenDistance; 99 when unknown).
 * aggregates(actor, others) gives @vsMax.<x>, @vsMin.<x>, @vsAny.<x> (1 if some has x > 0) and @vsCount.<x> over a list.
 * Package F adds @defending to the scope of every vs piece (1: its owner is the defender of the pair, 0: the attacker)
 * and the Punching Down / Punching Up rules of the Size table (punchSizes, punchOf).
 *
 * Targets "vs.*" are modifiers evaluated per pair, never in buckets (see VS_TARGETS): the attacker's ones are automatic
 * (vs.strike / vs.combat while attacking, vs.wound, vs.category, vs.ignoreSoak, vs.steadfast; one with a cost or an
 * amount is left out there: attackerSidePiece), the defender's may be asked, limited, paid, grouped (rules/options.mjs).
 * The limit key of a vs piece is `vs|<itemId>|<label>|<target>` (or its limitKey).
 *
 * The contract for the other packages:
 *   versusData(self, other)                              → the @vs object
 *   versusPieces(actor, other, scope, { targets, side, mods, limits }) → option pieces (rules/options.mjs) of `targets`
 *                                                          that apply, with @vs about `other` in their scope
 *   versusSum(actor, other, target, scope)               → the total of the automatic pieces of one target (uses left)
 *   versusApplied(actor, other, target, scope)           → { total, pieces } (the pieces, to count their limits)
 *   useVersusLimits(actor, pieces)                       → counts one use of each limited piece
 *  B: `penalty = versusSum(by, this, "vs.steadfast", {})` for the Steadfast Check of a Threshold, then
 *     useVersusLimits(by, versusApplied(...).pieces); `vs: versusData(actor, other)` in the threshold / use scopes.
 *  C4: `vs: versusData(...)` in the clash scopes.
 * Marks (B1) are read from the marker's flag `flags.dbu-rpg.marks = { <slug>: [{ uuid, name, duration }] }`.
 */
import { DBU } from "../config.mjs";
import { isMinion } from "../fusion/fusion-rules.mjs";
import { autoChosen, chosenPieces, countOptionLimits, optionMods, optionPieces } from "./options.mjs";
import { tokenDistance } from "./proximity.mjs";
import { possessedAwakenings } from "./awakening.mjs";

/** Every vs.* target, by side: what you get against that Character when you attack it / when it attacks you. */
export const VS_TARGETS = {
  attacker: ["vs.strike", "vs.wound", "vs.combat", "vs.category", "vs.ignoreSoak", "vs.steadfast", "vs.damageDealtMult"],
  defender: ["vs.dodge", "vs.defenseValue", "vs.strike", "vs.combat", "vs.soak", "vs.dr", "vs.categoryTaken", "vs.categorySet",
    "vs.damageTaken", "vs.damageMult", "vs.guardKp", "vs.guardNoCharges", "vs.redodge",
    // Package F: the hit becomes a miss; no Diminishing Defense; Damage below a value is 0; the most Damage you take
    "vs.autoDodge", "vs.noDimDefense", "vs.ignoreDamageBelow", "vs.damageMax"]
};
/** Targets only the attacker has (mode "ask" is refused on them). */
export const VS_ATTACKER_ONLY = new Set(["vs.wound", "vs.category", "vs.ignoreSoak", "vs.steadfast", "vs.damageDealtMult"]);
/** The defender's pieces asked before the defense roll, by Defend option (their roll or their cost); vs.noDimDefense
 * where a defense gives Diminishing Defense (a Dodge, no defense). */
export const VS_PRE = {
  dodge: ["vs.dodge", "vs.defenseValue", "vs.combat", "vs.noDimDefense"], crossCounter: ["vs.dodge", "vs.defenseValue", "vs.combat"],
  parry: ["vs.strike", "vs.combat"], guard: ["vs.guardKp", "vs.guardNoCharges"], none: ["vs.noDimDefense"]
};
/** The defender's pieces once the attack hits (vs.redodge only after a Dodge or no defense). */
export const VS_HIT = ["vs.soak", "vs.dr", "vs.categoryTaken", "vs.categorySet", "vs.damageTaken", "vs.damageMult", "vs.redodge",
  "vs.autoDodge", "vs.ignoreDamageBelow", "vs.damageMax",
  // F12: a Wound Roll lower than the value deals no Damage (the Incorporeal State)
  "vs.ignoreWoundBelow"];
/**
 * Defender pieces whose use is counted only when they change the Damage (computeDamage): automatic ones (no ask, cost,
 * amount), kept with the defense and counted when the Damage is applied.
 */
export const VS_DEFERRED = new Set(["vs.ignoreDamageBelow", "vs.damageMax", "vs.ignoreWoundBelow"]);
/** The attacker's pieces for the Damage of one target, and for the comparison with its defense roll. */
export const VS_ATTACK_DAMAGE = ["vs.wound", "vs.combat", "vs.category", "vs.ignoreSoak", "vs.damageDealtMult"];
export const VS_ATTACK_STRIKE = ["vs.strike", "vs.combat"];

/** The limit key of a vs piece. */
export const versusKey = p => `vs|${p.itemId ?? ""}|${p.label ?? ""}|${p.target}`;
/** A mark name as the variable key: lowercase letters and digits ("Shard Carrier+" → shardcarrier). */
export const markSlug = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** The running Combat Encounter of an actor (its own: the tracker may show another one). */
function encounterOf(actor) {
  return globalThis.game?.combats?.find?.(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor?.uuid)) ?? null;
}
const combatantOf = (combat, actor) => combat?.combatants?.find?.(cb => cb.actor?.uuid === actor?.uuid) ?? null;

/** A Character's token disposition (its combatant's token, its synthetic token, an active token, its prototype). */
export function dispositionOf(actor) {
  const cb = combatantOf(encounterOf(actor), actor);
  const d = cb?.token?.disposition ?? actor?.token?.disposition ?? actor?.getActiveTokens?.()?.[0]?.document?.disposition
    ?? actor?.prototypeToken?.disposition;
  return Number(d ?? 0) || 0;
}
/** Are two Characters Allies (the same non-neutral disposition)? */
export const areAllies = (a, b) => { const d = dispositionOf(a); return (d !== 0) && (d === dispositionOf(b)); };

/** The current Size index of a Character. */
export function sizeIndex(actor) {
  const sys = actor?.system;
  if ( Number.isFinite(sys?.size?.index) ) return sys.size.index;
  return DBU.sizes?.[sys?.details?.size]?.index ?? DBU.sizes?.medium?.index ?? 3;
}

/** Squares between "unknown" Characters (no tokens on one scene). */
export const NO_DISTANCE = 99;
/** A Character's token document: its combatant's, its synthetic token, an active one. */
function tokenOf(actor) {
  // GS Warriors of Glass (4): this turn your attacks originate from a Glass Soldier's Square (flags.dbu-rpg.originFrom)
  const from = actor?.flags?.["dbu-rpg"]?.originFrom;
  if ( from ) {
    try { const d = fromUuidSync(from); if ( d?.parent ) return d; } catch(err) { /* no such token */ }
  }
  const cb = combatantOf(encounterOf(actor), actor);
  return cb?.token ?? actor?.token ?? actor?.getActiveTokens?.()?.[0]?.document ?? null;
}
/** Squares between the tokens of two Characters on the same scene (rules/proximity.mjs), 99 when unknown. */
export function distanceBetween(a, b) {
  const ta = tokenOf(a);
  const tb = tokenOf(b);
  if ( !ta || !tb || (ta === tb) ) return NO_DISTANCE;
  const scene = ta.parent ?? null;
  if ( !scene || (scene !== (tb.parent ?? null)) ) return NO_DISTANCE;
  const size = scene.grid?.size ?? globalThis.canvas?.grid?.size ?? 100;
  const unit = scene.grid?.distance ?? 1;
  return tokenDistance(ta, tb, { size, unit });
}

/**
 * The @vs variables: the other Character of a pair, seen by `self`.
 * @param {Actor} self
 * @param {Actor|null} other
 * @returns {object}
 */
/** U: is this uuid (an actor's or its token's) that Character? */
export function isCharacter(uuid, actor) {
  if ( !uuid || !actor ) return false;
  return [actor.uuid, actor.token?.uuid, actor.token?.actor?.uuid, actor.parent?.uuid].filter(Boolean).includes(uuid);
}

/** U: the Character this actor is Compelled toward (or null): the one who inflicted it, while it lasts. */
export function compelledTarget(actor) {
  const on = actor?.system?.effectiveConditions?.compelled ?? actor?.system?.conditions?.compelled ?? 0;
  const uuid = actor?.flags?.["dbu-rpg"]?.compelledBy;
  if ( !(on > 0) || !uuid ) return null;
  try { const d = fromUuidSync(uuid); return (d?.documentName === "Token") ? d.actor : d; } catch(err) { return null; }
}

export function versusData(self, other) {
  const out = { below: 0, cond: {}, anyCond: 0, dot: 0, states: {}, size: 0, sizeDiff: 0, initiative: 0, initiativeDiff: 0,
    ally: 0, minion: 0, top: 0, capacityMax: 0, mark: {}, distance: NO_DISTANCE, compelledByMe: 0, compelledToThem: 0, noProvoke: 0,
    condByMe: 0, markOthers: {}, dimDefense: 0, alliesAdjacent: 0, opponentsAdjacent: 0, awk: {}, allyAdjAwk: {}, speedBoosted: 0, onArea: {}, isTurn: 0, markAdj: {}, lightLevel: 0 };
  const o = other?.system;
  if ( !o ) return out;
  // (T4 @vs.awk.<slug>: the Awakenings the other Character possesses: a Teammate has Team Dynamic)
  try { out.awk = possessedAwakenings(other); } catch(err) { out.awk = {}; }
  try { out.distance = distanceBetween(self, other); } catch(err) { out.distance = NO_DISTANCE; }
  try {
    out.below = Number(o.rollData?.belowForOthers ?? o.rollData?.below ?? o.health?.count ?? 0) || 0;
    // (T7 "flag.guardDownHidden": its Guard Down does not count as a Combat Condition for the others' effects)
    const hideGd = (o.buckets?.["flag.guardDownHidden"]?.total ?? 0) > 0;
    for ( const [k, v] of Object.entries(o.effectiveConditions ?? o.conditions ?? {}) ) {
      if ( hideGd && (k === "guardDown") ) continue;
      out.cond[k] = Number(v) || 0;
      if ( out.cond[k] > 0 ) out.anyCond += 1;
    }
    out.dot = Number(o.combat?.dot ?? 0) || 0;
    for ( const [k, v] of Object.entries(o._effectiveStates ?? o.states ?? {}) ) out.states[k] = Number(v) || 0;
    out.size = sizeIndex(other);
    out.sizeDiff = self?.system ? sizeIndex(self) - out.size : 0;
    const combat = encounterOf(self) ?? encounterOf(other);
    if ( combat ) {
      out.initiative = Number(combatantOf(combat, other)?.initiative ?? 0) || 0;
      const mine = combatantOf(combat, self);
      out.initiativeDiff = mine ? (Number(mine.initiative ?? 0) || 0) - out.initiative : 0;
    }
    out.ally = (self && areAllies(self, other)) ? 1 : 0;
    // (an NPC of the Minion type, or a Character whose Race is a Minion race)
    out.minion = isMinion(other) ? 1 : 0;
    out.top = Number(o.top?.base ?? 0) || 0;
    // F11: its Tier of Power now and its stacks of Power (@vs.topNow, @vs.power)
    out.topNow = Number(o.top?.current ?? o.top?.base ?? 0) || 0;
    out.power = Number(o.combat?.power ?? 0) || 0;
    // F12: it is a Minion of yours (@vs.myMinion)
    out.myMinion = (self && (o.minionOf === self.uuid)) ? 1 : 0;
    out.capacityMax = Number(o.capacity?.max ?? 0) || 0;
    // RA: Combat Conditions it suffers that you inflicted (@vs.condByMe: how many)
    const by = other?.flags?.["dbu-rpg"]?.condBy ?? {};
    out.condByMe = Object.entries(by).filter(([k, u]) => ((out.cond[k] ?? 0) > 0) && isCharacter(u, self)).length;
    // RD: its Diminishing Defense penalty now (@vs.dimDefense)
    out.dimDefense = Number(other?.system?.dimDefensePenalty ?? 0) || 0;
    // (T19 @vs.isTurn: it is the other Character's turn now)
    try {
      const enc = globalThis.game?.combats?.find?.(c => c.started && c.combatants.some(cb => cb.actor?.uuid === other.uuid));
      out.isTurn = (enc?.combatant?.actor?.uuid === other.uuid) ? 1 : 0;
    } catch(err) { out.isTurn = 0; }
    // (T17 @vs.onArea.<kind>: the area kinds its Square is in)
    out.onArea = { ...(o.rollData?.onArea ?? {}) };
    // (T13 @vs.speedBoosted: its Boosted Speed)
    out.speedBoosted = Number(o.aptitudes?.speedBoosted ?? 0) || 0;
    // RE: how many of its Allies / Opponents are adjacent to it (@vs.alliesAdjacent / @vs.opponentsAdjacent)
    out.alliesAdjacent = Number(other?.system?.rollData?.alliesAdjacent ?? 0) || 0;
    out.opponentsAdjacent = Number(other?.system?.rollData?.opponentsAdjacent ?? 0) || 0;
    // RA: the marks the OTHER Characters of the encounter placed on it (@vs.markOthers.<mark>: how many of them)
    const enc = encounterOf(self) ?? encounterOf(other);
    for ( const cb of enc?.combatants ?? [] ) {
      const a = cb.actor;
      if ( !a || (a.uuid === self?.uuid) || (a.uuid === other?.uuid) ) continue;
      for ( const [slug, list] of Object.entries(a.flags?.["dbu-rpg"]?.marks ?? {}) ) {
        if ( (Array.isArray(list) ? list : []).some(m => m?.uuid && ((m.uuid === other.uuid) || (m.uuid === other.token?.uuid))) ) {
          const k = markSlug(slug);
          out.markOthers[k] = (out.markOthers[k] ?? 0) + 1;
        }
      }
    }
    // Y: the other Character provokes no Exploit ("flag.noProvokeExploit")
    out.noProvoke = ((o.buckets?.["flag.noProvokeExploit"]?.total ?? 0) > 0) ? 1 : 0;
    // U: Compelled toward whom (the Character who inflicted it: flags.dbu-rpg.compelledBy)
    if ( (out.cond.compelled ?? 0) > 0 ) out.compelledByMe = isCharacter(other?.flags?.["dbu-rpg"]?.compelledBy, self) ? 1 : 0;
    const mine = self?.system?.effectiveConditions?.compelled ?? self?.system?.conditions?.compelled ?? 0;
    if ( mine > 0 ) out.compelledToThem = isCharacter(self?.flags?.["dbu-rpg"]?.compelledBy, other) ? 1 : 0;
    // Marks the actor placed on it (B1's flag on the marker)
    const marks = self?.getFlag?.("dbu-rpg", "marks") ?? self?.flags?.["dbu-rpg"]?.marks ?? {};
    for ( const [slug, list] of Object.entries(marks ?? {}) ) {
      const on = (Array.isArray(list) ? list : []).some(m => m?.uuid && ((m.uuid === other.uuid) || (m.uuid === other.token?.uuid)));
      if ( on ) out.mark[markSlug(slug)] = 1;
    }
    // (T10 "markAll.<slug>": every Opponent counts as carrying that mark of yours; "markAllChars.<slug>": every other
    // Character; "markCompelled.<slug>": the Character you are Compelled toward)
    for ( const [k, b] of Object.entries(self?.system?.buckets ?? {}) ) {
      const m = /^(markAll|markAllChars|markCompelled)\.(.+)$/.exec(k);
      if ( !m || !((Number(b?.total) || 0) > 0) ) continue;
      if ( (m[1] === "markAll") && out.ally ) continue;
      if ( (m[1] === "markCompelled") && !out.compelledToThem ) continue;
      out.mark[markSlug(m[2])] = 1;
    }
    // (T26 @vs.lightLevel: the Light Level where it is, its own shifts included)
    out.lightLevel = Number(other?.system?.rollData?.lightLevelEff ?? other?.system?.rollData?.lightLevel ?? 0) || 0;
    // (T25 @vs.markAdj.<slug>: the Characters carrying that mark of yours adjacent to it, it and you aside)
    for ( const [slug, list] of Object.entries(marks ?? {}) ) {
      let n = 0;
      for ( const m of (Array.isArray(list) ? list : []) ) {
        if ( !m?.uuid || (m.uuid === other.uuid) || (m.uuid === other.token?.uuid) ) continue;
        let doc = null;
        try { doc = fromUuidSync(m.uuid); } catch(err) { doc = null; }
        const a = (doc?.documentName === "Token") ? doc.actor : doc;
        if ( a && (a !== self) && (a !== other) && (distanceBetween(a, other) <= 1) ) n += 1;
      }
      if ( n ) out.markAdj[markSlug(slug)] = n;
    }
    // (T10 @vs.allyAdjAwk.<slug>: the Characters of your side adjacent to it, you aside, that possess that Awakening)
    const adjAwk = other?.system?.rollData?.opponentsAdjacentAwk ?? {};
    const mineAwk = (out.distance <= 1) ? possessedAwakenings(self) : {};
    out.allyAdjAwk = Object.fromEntries(Object.entries(adjAwk).map(([s, n]) => [s, Math.max(0, (Number(n) || 0) - (mineAwk[s] ? 1 : 0))]));
  } catch(err) { console.warn("DBU | versusData", err); }
  return out;
}

/** The @vs keys of an object as "a.b" paths with their numbers. */
function flatten(obj, at = "", out = {}) {
  for ( const [k, v] of Object.entries(obj ?? {}) ) {
    const key = at ? `${at}.${k}` : k;
    if ( v && (typeof v === "object") ) flatten(v, key, out);
    else out[key] = Number(v) || 0;
  }
  return out;
}
function setPath(obj, path, value) {
  const parts = path.split(".");
  let o = obj;
  for ( const p of parts.slice(0, -1) ) o = (o[p] ??= {});
  o[parts.at(-1)] = value;
}

/**
 * @vsMax / @vsMin / @vsAny / @vsCount over a list of other Characters (an attack's targets): every @vs key, a key only
 * some of them have counting 0 for the others. All empty without others.
 * @returns {{vsMax: object, vsMin: object, vsAny: object, vsCount: object}}
 */
export function aggregates(actor, others = []) {
  const out = { vsMax: {}, vsMin: {}, vsAny: {}, vsCount: {} };
  const list = (others ?? []).filter(Boolean).map(o => flatten(versusData(actor, o)));
  if ( !list.length ) return out;
  const keys = new Set(list.flatMap(f => Object.keys(f)));
  for ( const k of keys ) {
    const values = list.map(f => f[k] ?? 0);
    setPath(out.vsMax, k, Math.max(...values));
    setPath(out.vsMin, k, Math.min(...values));
    setPath(out.vsAny, k, values.some(v => v > 0) ? 1 : 0);
    setPath(out.vsCount, k, values.filter(v => v > 0).length);
  }
  return out;
}

/* -------------------------------------------- */
/*  Punching Down / Punching Up (Size rules)     */
/* -------------------------------------------- */

/**
 * The Size a Character counts as when another Character's Punching Down ("down") or Punching Up ("up") is worked out
 * against it: the punchedDown.sizeSet pieces (the highest replaces its Size) / punchedUp.sizeSet (the lowest), then
 * + punchedDown.size / punchedUp.size (its sheet modifiers).
 */
export function punchedSize(actor, kind = "down") {
  const b = actor?.system?.buckets ?? {};
  const key = (kind === "up") ? "punchedUp" : "punchedDown";
  const sets = (b[`${key}.sizeSet`]?.parts ?? []).map(p => Number(p.value)).filter(Number.isFinite);
  const base = sets.length ? ((kind === "up") ? Math.min(...sets) : Math.max(...sets)) : sizeIndex(actor);
  return base + (Number(b[`${key}.size`]?.total ?? 0) || 0);
}

/**
 * The attacker's side of Punching Down / Up for one attack, from its Size and the attack options applied
 * ({ target, value }): attack.punchDown.sizeSet (the highest replaces the Size) + attack.punchDown.size, the reach
 * (attack.punchDown.reach: it applies against targets that many Size Categories closer), the Dice Category and the
 * times of its Extra Dice; attack.punchUp.sizeSet (the lowest) + attack.punchUp.size.
 * @returns {{down: number, reach: number, category: number, times: number, up: number}}
 */
export function punchSizes(actor, options = []) {
  const of = t => options.filter(o => o.target === t).map(o => Number(o.value)).filter(Number.isFinite);
  const sum = t => of(t).reduce((a, v) => a + v, 0);
  const own = sizeIndex(actor);
  const downSets = of("attack.punchDown.sizeSet");
  const upSets = of("attack.punchUp.sizeSet");
  return {
    down: (downSets.length ? Math.max(...downSets) : own) + sum("attack.punchDown.size"),
    reach: sum("attack.punchDown.reach"), category: sum("attack.punchDown.category"), times: Math.max(0, sum("attack.punchDown.times")),
    up: (upSets.length ? Math.min(...upSets) : own) + sum("attack.punchUp.size")
  };
}

/**
 * Punching Down and Punching Up of an attack against one target. Punching Down: the target counts as 2+ Size Categories
 * smaller (fewer with a reach) → the Punching Down Extra Dice (1d6(T), + its Dice Categories) on that target's Wound.
 * Punching Up: it counts as 2+ larger → +1(T) Wound per Size Category it is larger, and no Called Shot Strike penalty.
 * @param {object} punch   punchSizes(...) (attack.punch on the card)
 * @param {Actor} target
 * @returns {{down: number, up: number}}  down 1/0; up: the Size Categories it is larger (0 when it does not apply)
 */
export function punchOf(punch, target) {
  if ( !punch || !target?.system ) return { down: 0, up: 0 };
  const down = ((punch.down - punchedSize(target, "down")) >= (2 - (Number(punch.reach) || 0))) ? 1 : 0;
  const diff = punchedSize(target, "up") - punch.up;
  return { down, up: (!down && (diff >= 2)) ? diff : 0 };
}

/** @punchDown / @punchUp (how many of these targets each applies to) and @punchDownAll / @punchUpAll (1: every one). */
export function punchVars(punch, targets = []) {
  const list = (targets ?? []).filter(Boolean).map(t => punchOf(punch, t));
  const down = list.filter(p => p.down).length;
  const up = list.filter(p => p.up).length;
  return { punchDown: down, punchUp: up, punchDownAll: (list.length && (down === list.length)) ? 1 : 0,
    punchUpAll: (list.length && (up === list.length)) ? 1 : 0 };
}

/** The vs.* modifiers of an actor with their option fields ([] when none or when they cannot be gathered). */
export function versusMods(actor) {
  return optionMods(actor, "vs.");
}

/**
 * The vs pieces of `actor` against `other` that apply (rules/options.mjs optionPieces): @vs about `other` is added to
 * the scope (kept on each piece as `scope`, to work out its value later).
 * @param {object} [options]
 * @param {string[]} [options.targets]  the vs targets wanted (default: every one)
 * @param {string} [options.side]       "attacker": mode "ask" is ignored
 * @param {object[]} [options.mods]     versusMods(actor), gathered once per step
 * @param {boolean} [options.limits=true]
 */
export function versusPieces(actor, other, scope = {}, { targets = null, side = "", mods = null, limits = true } = {}) {
  if ( !actor?.system ) return [];
  mods ??= versusMods(actor);
  if ( !mods.length ) return [];
  // @defending: 1 when the owner of the pieces defends against the other Character, 0 when it attacks it
  const sc = { ...scope, vs: scope.vs ?? versusData(actor, other), defending: scope.defending ?? ((side === "attacker") ? 0 : 1) };
  // (each piece keeps sc as its scope, and its actor for optionDialog)
  return optionPieces(actor, targets ?? ["vs."], sc, { side, mods, keyOf: versusKey, limits });
}

/**
 * Can a vs piece apply on the attacker's side? Its pieces there are automatic: one with a cost or an amount (made for
 * the defense: vs.strike / vs.combat) is left out, since nothing can pay it or pick its @n there.
 */
export const attackerSidePiece = p => !String(p.cost ?? "").trim() && !String(p.amount ?? "").trim();

/** The automatic pieces of one vs target and their total (the asked ones are left out). */
export function versusApplied(actor, other, target, scope = {}, { mods = null } = {}) {
  // (the attacker's own targets are automatic, whatever their mode)
  const side = VS_ATTACKER_ONLY.has(target) ? "attacker" : "";
  let pieces = versusPieces(actor, other, scope, { targets: [target], side, mods });
  if ( side ) pieces = pieces.filter(attackerSidePiece);
  if ( !pieces.length ) return { total: 0, pieces: [] };
  const chosen = autoChosen(actor, pieces, pieces[0].scope);
  const applied = chosenPieces(chosen);
  return { total: applied.reduce((t, p) => t + (Number(p.value) || 0), 0), pieces: applied };
}

/** The total of the automatic pieces of one vs target of `actor` against `other`. */
export function versusSum(actor, other, target, scope = {}) {
  return versusApplied(actor, other, target, scope).total;
}

/** Count one use of each limited vs piece (once per key). */
export async function useVersusLimits(actor, pieces = []) {
  if ( !pieces.length ) return [];
  return countOptionLimits(actor, [{ pieces }], { keyOf: versusKey });
}
