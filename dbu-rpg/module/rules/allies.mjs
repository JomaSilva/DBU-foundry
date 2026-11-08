/**
 * Package G (round 4): what your effects do to your Allies, and what the Characters of your Combat Encounter carry.
 *
 * - Ally pieces: a modifier whose target is "ally.<target>" (an item of YOURS) gives "<target>" to each of your Allies in
 *   your Combat Encounter (the non-Defeated Characters of your token's disposition), or only to those within `range`
 *   Squares of you (the piece's `range` field, 1 to 12, rules/proximity.mjs distances). The condition and the value are
 *   worked out with YOUR formula data (your @T, your States...), plus the Ally's: @to.mark.<slug> (you placed that mark on
 *   that Ally), @to.minion, @to.distance (Squares between you), @to.below (the Health Thresholds that Ally is below).
 *   Pieces sharing a `group` do not stack: among the Allies' pieces of one group and target, only the highest applies.
 * - Trigger targets (combat/triggers.mjs): "allies" (every Ally, or those within `range`), "team" (you and them), "ally"
 *   (the Ally of an ally event: allyHit, allyDamaged, allyAttack, allyPowerUp, allySurge).
 * - Encounter counts (formula data): @opponentsCond.<condition> / @alliesCond.<condition> (how many Opponents / Allies of
 *   your encounter suffer it), @opponentsState.<state> / @alliesState.<state> (how many are in that State).
 *
 * Plain functions with no Foundry global at load, so that Node tests can import them.
 */
import { tokenDistance, MAX_RANGE, proximityData } from "./proximity.mjs";
import { evaluate, test } from "./formula.mjs";

/** "ally.<target>": a piece for your Allies; J "foe.<target>": for your Opponents (an aura that weakens them). */
export const ALLY_TARGET = /^ally\.(.+)$/;
export const FOE_TARGET = /^foe\.(.+)$/;
export const isAllyTarget = target => ALLY_TARGET.test(String(target ?? "")) || FOE_TARGET.test(String(target ?? ""));

const blank = v => (v === undefined) || (v === null) || (String(v).trim() === "");

/** The started Combat Encounter an actor is in, its combatant and its token. */
function encounterInfo(actor) {
  const combat = globalThis.game?.combats?.find?.(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor?.uuid));
  if ( !combat ) return null;
  const mine = combat.combatants.find(cb => cb.actor?.uuid === actor.uuid);
  return { combat, mine, token: mine?.token ?? null, side: mine?.token?.disposition ?? 0 };
}

const defeated = (cb, a) => !!cb?.isDefeated || ((a?.system?.life?.value ?? 1) <= 0);

/**
 * The other Characters of the actor's encounter, with their side and distance: [{ actor, ally, opponent, distance }]
 * (distance 99 when the tokens are not on one scene). Defeated ones are left out.
 */
export function encounterOthers(actor) {
  const info = encounterInfo(actor);
  if ( !info ) return [];
  const { combat, token, side } = info;
  const scene = token?.parent;
  const size = scene?.grid?.size ?? globalThis.canvas?.grid?.size ?? 100;
  const unit = scene?.grid?.distance ?? 1;
  const out = [];
  const seen = new Set([actor.uuid]);
  for ( const cb of combat.combatants ) {
    const other = cb.actor;
    if ( !other || seen.has(other.uuid) ) continue;
    seen.add(other.uuid);
    if ( defeated(cb, other) ) continue;
    const disp = cb.token?.disposition ?? 0;
    const ally = (side !== 0) && (disp === side);
    const opponent = (side !== 0) && (disp !== 0) && (disp !== side);
    let distance = 99;
    if ( token && cb.token && scene && (cb.token.parent === scene) ) distance = tokenDistance(token, cb.token, { size, unit });
    out.push({ actor: other, ally, opponent, distance });
  }
  return out;
}

/** Your Allies (within `range` Squares when it is set: 1 to 12). */
export function alliesInRange(actor, range = "") {
  const r = blank(range) ? null : Math.min(MAX_RANGE, Math.max(0, Number(range) || 0));
  return encounterOthers(actor).filter(o => o.ally && ((r === null) || (o.distance <= r))).map(o => o.actor);
}

/** J: your Opponents (within `range` Squares when it is set: 1 to 12). */
export function opponentsInRange(actor, range = "") {
  const r = blank(range) ? null : Math.min(MAX_RANGE, Math.max(0, Number(range) || 0));
  return encounterOthers(actor).filter(o => o.opponent && ((r === null) || (o.distance <= r))).map(o => o.actor);
}

/** { <slug>: 1 } for the marks `marker` placed on `target`. */
function marksOn(marker, target) {
  const marks = marker?.flags?.["dbu-rpg"]?.marks ?? {};
  return Object.fromEntries(Object.entries(marks).filter(([, list]) => (list ?? []).some(e => e?.uuid === target?.uuid)).map(([k]) => [k, 1]));
}

const isMinion = a => ((a?.type === "npc") && (a.system?.npcType === "minion")) ? 1 : 0;
/** MO: is `a` a Minion of `leader` (its minionOf names the leader's actor, a token's base actor too)? */
export const isMinionOf = (a, leader) => (isMinion(a) && !!a.system?.minionOf
  && [leader?.uuid, leader?.id ? `Actor.${leader.id}` : null, leader?.baseActor?.uuid].includes(a.system.minionOf)) ? 1 : 0;

/** Does an item work now (an inactive Transformation still has its Permanent pieces)? */
function pieceWorks(item, m) {
  if ( !m || (m.active === false) ) return false;
  if ( item.system?.twinned === false && /\(Twinned\)/.test(m.label ?? "") ) return false;
  const active = item.system?.isActive ?? true;
  return active || (m.always && (item.type === "transformation"));
}

/** Does an actor carry pieces for its Allies? */
export function hasAllyPieces(actor) {
  for ( const i of actor?.items ?? [] ) {
    if ( (i.system?.modifiers ?? []).some(m => isAllyTarget(m?.target)) ) return true;
  }
  return (actor?.system?.customModifiers ?? []).some(m => isAllyTarget(m?.target));
}

/**
 * The pieces your Allies' items give you: [{ target, value, label }] with the value already worked out (a number as
 * text). `fxPiece` (rules/fx.mjs) is passed in by modifiers.mjs so that this file does not import it.
 */
/**
 * AG "allyGuard.<kind>" pieces of your Allies (Intelligent Fighter: "defeat", an Opponent's Damage that would Defeat you):
 * [{ giver, value, label, limit, key }], worked out with the Ally's formula data and @to (you), highest value first.
 */
export function allyGuards(actor, kind, { foe = false } = {}) {
  const out = [];
  let others;
  try { others = encounterOthers(actor); } catch(err) { return out; }
  // (KR foe: the "foeGuard.<kind>" pieces of your Opponents: Karmic Reflection's "critToBotch")
  const target = `${foe ? "foeGuard" : "allyGuard"}.${kind}`;
  for ( const o of others ) {
    if ( foe ? !o.opponent : !o.ally ) continue;
    const src = o.actor;
    const data = src.system?.rollData;
    if ( !data ) continue;
    const to = { mark: marksOn(src, actor), minion: isMinion(actor), myMinion: isMinionOf(actor, src), distance: o.distance,
      below: actor.system?.health?.count ?? 0, cond: { ...(actor.system?.conditions ?? {}) }, states: { ...(actor.system?.states ?? {}) },
      pl: Number(actor.system?.pl ?? 1) || 1, // (T17: worked out now, the receiver's own data may be one preparation behind)
      get onArea() { return (this._onArea ??= (proximityData(actor).onArea ?? {})); } };
    for ( const item of src.items ?? [] ) {
      const s = item.system;
      for ( const m of s?.modifiers ?? [] ) {
        if ( (String(m?.target ?? "") !== target) || !pieceWorks(item, m) ) continue;
        if ( !blank(m.range) && !(o.distance <= Number(m.range)) ) continue;
        const scope = { ...data, ...((item.type === "transformation") ? (s.formulaContext ?? {}) : {}), to };
        let value;
        try {
          if ( !test(m.condition, scope) ) continue;
          value = Math.floor(Number(evaluate(m.value, scope)) || 0);
        } catch(err) { continue; }
        if ( !(value > 0) ) continue;
        out.push({ giver: src, value, label: `${m.label || item.name} (${src.name})`, limit: m.limit || "", cost: m.cost || "",
          key: blank(m.limitKey) ? `guard|${item.id}|${m.label || item.name}` : String(m.limitKey).trim() });
      }
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

export function allyPieces(actor, { fxPiece = null } = {}) {
  const out = [];
  let others;
  try { others = encounterOthers(actor); } catch(err) { return out; }
  const best = new Map();
  for ( const o of others ) {
    if ( !o.ally && !o.opponent ) continue;
    // an Ally gives you its "ally.*" pieces, an Opponent its "foe.*" pieces
    const RE = o.ally ? ALLY_TARGET : FOE_TARGET;
    const src = o.actor;
    const data = src.system?.rollData;
    if ( !data ) continue;
    // (K: and the Conditions and States of the Character the piece goes to, as its sheet holds them)
    const to = { mark: marksOn(src, actor), minion: isMinion(actor), myMinion: isMinionOf(actor, src), distance: o.distance,
      below: actor.system?.health?.count ?? 0, cond: { ...(actor.system?.conditions ?? {}) }, states: { ...(actor.system?.states ?? {}) },
      pl: Number(actor.system?.pl ?? 1) || 1, // (T17: worked out now, the receiver's own data may be one preparation behind)
      get onArea() { return (this._onArea ??= (proximityData(actor).onArea ?? {})); } };
    // (the custom buffs of the giver's sheet count as one more item)
    const custom = { name: globalThis.game?.i18n?.localize?.("DBU.Custom") ?? "Custom", type: "custom",
      system: { modifiers: src.system?.customModifiers ?? [], isActive: true } };
    for ( const item of [...(src.items ?? []), custom] ) {
      const s = item.system;
      if ( !s ) continue;
      for ( let m of s.modifiers ?? [] ) {
        const x = RE.exec(String(m?.target ?? ""));
        if ( !x || !pieceWorks(item, m) ) continue;
        if ( m.fx && fxPiece && src.system?._fx ) {
          m = fxPiece(m, src.system._fx);
          if ( !m ) continue;
        }
        if ( !blank(m.range) && !(o.distance <= Number(m.range)) ) continue;
        const ctx = (item.type === "transformation") ? (s.formulaContext ?? {}) : {};
        const scope = { ...data, ...ctx, to };
        let value;
        try {
          if ( !test(m.condition, scope) ) continue;
          value = evaluate(m.value, scope);
        } catch(err) { continue; }
        if ( !value ) continue;
        const piece = { target: x[1], value: String(value), label: `${m.label || item.name} (${src.name})` };
        if ( blank(m.group) ) { out.push(piece); continue; }
        const key = `${o.ally ? "ally" : "foe"}|${m.group}|${x[1]}`;
        const prev = best.get(key);
        if ( !prev || (Math.abs(value) > Math.abs(Number(prev.value))) ) best.set(key, piece);
      }
    }
  }
  return [...out, ...best.values()];
}

/** @opponentsCond / @alliesCond / @opponentsState / @alliesState of an actor (zeros outside of combat). */
export function encounterCounts(actor, DBU) {
  const conds = Object.keys(DBU?.conditions ?? {});
  const states = Object.keys(DBU?.states ?? {});
  const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));
  const out = { opponentsCond: zero(conds), alliesCond: zero(conds), opponentsState: zero(states), alliesState: zero(states),
    opponentsCondByMe: 0, markedOpponents: {}, markedAllies: {} };
  const myMarks = Object.entries(actor?.flags?.["dbu-rpg"]?.marks ?? {});
  let others;
  try { others = encounterOthers(actor); } catch(err) { return out; }
  for ( const o of others ) {
    if ( !o.ally && !o.opponent ) continue;
    const sys = o.actor.system ?? {};
    const c = sys.effectiveConditions ?? sys.conditions ?? {};
    const st = sys._effectiveStates ?? sys.states ?? {};
    const side = o.ally ? "allies" : "opponents";
    // (T7 "flag.guardDownHidden": an Opponent's Guard Down is not a Combat Condition for your effects)
    const hideGd = o.opponent && ((sys.buckets?.["flag.guardDownHidden"]?.total ?? 0) > 0);
    for ( const k of conds ) if ( ((c[k] ?? 0) > 0) && !(hideGd && (k === "guardDown")) ) out[`${side}Cond`][k] += 1;
    // (T7 @markedOpponents.<slug> / @markedAllies.<slug>: how many Opponents / Allies carry that mark of yours)
    const markKey = o.ally ? "markedAllies" : "markedOpponents";
    for ( const [slug, list] of myMarks ) {
      if ( (list ?? []).some(e => e?.uuid === o.actor.uuid) ) out[markKey][slug] = (out[markKey][slug] ?? 0) + 1;
    }
    // RA: Opponents suffering a Combat Condition you inflicted (flags.dbu-rpg.condBy)
    if ( o.opponent && Object.entries(o.actor.flags?.["dbu-rpg"]?.condBy ?? {}).some(([k, u]) => ((c[k] ?? 0) > 0)
      && [actor.uuid, actor.token?.uuid].filter(Boolean).includes(u)) ) out.opponentsCondByMe += 1;
    for ( const k of states ) if ( (st[k] ?? 0) > 0 ) out[`${side}State`][k] += 1;
  }
  return out;
}

/** Does an actor read the encounter counts? */
const READS_COUNTS = /@(opponentsCond|alliesCond|opponentsState|alliesState|markedOpponents|markedAllies)\.|@opponentsCondByMe/;
export function readsEncounter(actor) {
  for ( const i of actor?.items ?? [] ) {
    for ( const p of [...(i.system?.modifiers ?? []), ...(i.system?.triggers ?? [])] ) {
      if ( READS_COUNTS.test(`${p?.condition ?? ""} ${p?.value ?? ""}`) ) return true;
    }
  }
  return false;
}

/**
 * When a Character of an encounter changes (its sheet, its items, its token), the others that read it are worked out again:
 * the Allies of one with ally pieces, and those that read the encounter counts.
 */
/** E2 Ruler: warn the GM when more than 10 non-Defeated Minions of a Ruler (their sheet names it) join one encounter. */
function rulerCheck(combat) {
  if ( !globalThis.game?.user?.isActiveGM ) return;
  const counts = new Map();
  for ( const cb of combat.combatants ?? [] ) {
    const a = cb.actor;
    if ( !a || !isMinion(a) || cb.isDefeated || !a.system?.minionOf ) continue;
    counts.set(a.system.minionOf, (counts.get(a.system.minionOf) ?? 0) + 1);
  }
  for ( const [uuid, n] of counts ) {
    if ( n <= 10 ) continue;
    let leader = null;
    try { leader = globalThis.fromUuidSync?.(uuid) ?? null; } catch(err) { leader = null; }
    if ( leader?.items?.some?.(i => (i.type === "racialTrait") && /^ruler$/i.test(i.name)) ) {
      globalThis.ui?.notifications?.warn(globalThis.game.i18n.format("DBU.Val.RulerMinions", { name: leader.name, n }));
    }
  }
}

export function registerAllyHooks() {
  Hooks.on("createCombatant", c => rulerCheck(c.parent));
  let pending = null;
  const refresh = (changed, moved) => {
    if ( !changed ) return;
    const combats = (globalThis.game?.combats ?? []).filter(c => c.started && c.combatants.some(cb => cb.actor?.uuid === changed.uuid));
    if ( !combats.length ) return;
    const giver = hasAllyPieces(changed);
    for ( const combat of combats ) {
      // A token that moved: the distances to it changed for everyone, itself included, when anyone gives ally pieces
      const anyGiver = moved && combat.combatants.some(cb => cb.actor && hasAllyPieces(cb.actor));
      for ( const cb of combat.combatants ) {
        const a = cb.actor;
        if ( !a ) continue;
        const self = a.uuid === changed.uuid;
        if ( !(anyGiver || (!self && (giver || readsEncounter(a)))) ) continue;
        a.reset();
        if ( a.sheet?.rendered ) a.sheet.render();
      }
    }
  };
  // (several changes of one action are worked out once)
  const later = (actor, moved = false) => {
    if ( !actor ) return;
    pending ??= new Map();
    pending.set(actor, (pending.get(actor) ?? false) || moved);
    setTimeout(() => {
      const list = pending ? [...pending.entries()] : [];
      pending = null;
      for ( const [a, m] of list ) refresh(a, m);
    }, 0);
  };
  Hooks.on("updateActor", (actor) => later(actor));
  for ( const h of ["createItem", "updateItem", "deleteItem"] ) Hooks.on(h, (item) => later(item?.parent));
  Hooks.on("updateToken", (doc, changes) => {
    if ( ("x" in changes) || ("y" in changes) || ("elevation" in changes) || ("disposition" in changes) ) later(doc.actor, true);
  });
  for ( const h of ["createCombatant", "deleteCombatant", "updateCombat"] ) {
    Hooks.on(h, (doc) => {
      const combat = doc?.combatants ? doc : doc?.parent;
      for ( const cb of combat?.combatants ?? [] ) if ( cb.actor && (hasAllyPieces(cb.actor) || readsEncounter(cb.actor)) ) later(cb.actor);
    });
  }
}
