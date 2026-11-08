/**
 * Package D: how far the other Characters of your Combat Encounter are on the map (the tokens of the encounter on the
 * scene of your token). Distances are in Squares between the edges of the tokens: touching tokens (also diagonally)
 * are 1 Square apart — "within 1 Square" = adjacent —, one empty Square between them is 2, and so on; a difference of
 * height (token elevation, in the scene's grid units) counts like a horizontal one.
 * Formula data (rules/derived.mjs): @alliesWithin.<n> / @opponentsWithin.<n> (n = 1..12: non-Defeated Allies /
 * Opponents, by token disposition, within n Squares of you), @alliesAdjacent / @opponentsAdjacent (within 1 Square),
 * @nearestOpponent / @nearestAlly (Squares to the nearest one; 99 when there is none). Zeros outside of a Combat
 * Encounter or without tokens on the same scene. A token that moves refreshes the actors of its encounter that read them
 * (registerProximityHooks).
 */
export const MAX_RANGE = 12;
const NONE = 99;

/** The empty data (outside of combat). */
export function emptyProximity() {
  const within = () => Object.fromEntries(Array.from({ length: MAX_RANGE }, (_, k) => [String(k + 1), 0]));
  return { alliesWithin: within(), opponentsWithin: within(), alliesAdjacent: 0, opponentsAdjacent: 0, nearestAlly: NONE,
    nearestOpponent: NONE };
}

/** Position of a token in grid cells: { x0, x1, y0, y1, z } (its stored position, not the animated one). */
function cells(token, size, unit) {
  const src = token?._source ?? token ?? {};
  const x = Number(src.x ?? token.x ?? 0) / size;
  const y = Number(src.y ?? token.y ?? 0) / size;
  const w = Number(src.width ?? token.width ?? 1) || 1;
  const h = Number(src.height ?? token.height ?? 1) || 1;
  const z = Number(src.elevation ?? token.elevation ?? 0) / (unit || 1);
  return { x0: x, x1: x + w, y0: y, y1: y + h, z };
}

/** Squares between two tokens (1 = adjacent or overlapping). */
export function tokenDistance(a, b, { size = 100, unit = 1 } = {}) {
  const A = cells(a, size, unit);
  const B = cells(b, size, unit);
  const gap = (a0, a1, b0, b1) => Math.max(0, Math.max(b0 - a1, a0 - b1));
  const eps = 1e-6;
  const dx = Math.ceil(gap(A.x0, A.x1, B.x0, B.x1) - eps);
  const dy = Math.ceil(gap(A.y0, A.y1, B.y0, B.y1) - eps);
  const dz = Math.ceil(Math.max(0, Math.abs(A.z - B.z) - 1) - eps);
  return Math.max(0, dx, dy, dz) + 1;
}

/** The proximity data of an actor (see the header). */
export function proximityData(actor) {
  const out = emptyProximity();
  try {
    const combat = globalThis.game?.combats?.find?.(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid));
    if ( !combat ) return out;
    const mine = combat.combatants.find(cb => cb.actor?.uuid === actor.uuid);
    const token = mine?.token;
    const scene = token?.parent;
    if ( !token || !scene ) return out;
    const side = token.disposition ?? 0;
    const size = scene.grid?.size ?? globalThis.canvas?.grid?.size ?? 100;
    const unit = scene.grid?.distance ?? 1;
    const seen = new Set([actor.uuid]);
    for ( const cb of combat.combatants ) {
      const other = cb.actor;
      const t = cb.token;
      if ( !other || !t || seen.has(other.uuid) || (t.parent !== scene) ) continue;
      seen.add(other.uuid);
      if ( cb.isDefeated || ((other.system?.life?.value ?? 1) <= 0) ) continue;
      const disp = t.disposition ?? 0;
      const ally = (disp === side) && (side !== 0);
      const opponent = (disp !== 0) && (side !== 0) && (disp !== side);
      if ( !ally && !opponent ) continue;
      const d = tokenDistance(token, t, { size, unit });
      const key = ally ? "alliesWithin" : "opponentsWithin";
      for ( let n = d; n <= MAX_RANGE; n++ ) out[key][String(n)] += 1;
      if ( ally ) out.nearestAlly = Math.min(out.nearestAlly, d);
      else out.nearestOpponent = Math.min(out.nearestOpponent, d);
    }
    out.alliesAdjacent = out.alliesWithin["1"];
    out.opponentsAdjacent = out.opponentsWithin["1"];
  } catch(err) { /* the world is still loading */ }
  return out;
}

/** Does an actor have a piece that reads the proximity data? */
const READS = /@(alliesWithin|opponentsWithin|alliesAdjacent|opponentsAdjacent|nearestAlly|nearestOpponent)\b/;
export function readsProximity(actor) {
  for ( const i of actor?.items ?? [] ) {
    for ( const p of [...(i.system?.modifiers ?? []), ...(i.system?.triggers ?? [])] ) {
      if ( READS.test(`${p.condition ?? ""} ${p.value ?? ""}`) ) return true;
    }
  }
  return false;
}

/** A token moved (or changed height): the actors of its encounter that read the distances are worked out again. */
export function registerProximityHooks() {
  Hooks.on("updateToken", (doc, changes) => {
    if ( !(("x" in changes) || ("y" in changes) || ("elevation" in changes)) ) return;
    for ( const combat of globalThis.game?.combats ?? [] ) {
      if ( !combat.started || !combat.combatants.some(cb => cb.tokenId === doc.id) ) continue;
      for ( const cb of combat.combatants ) {
        const a = cb.actor;
        if ( !a || !readsProximity(a) ) continue;
        a.reset();
        if ( a.sheet?.rendered ) a.sheet.render();
      }
    }
  });
}
