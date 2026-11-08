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
import { possessedAwakenings } from "./awakening.mjs";

export const MAX_RANGE = 12;
const NONE = 99;

/** The empty data (outside of combat). */
export function emptyProximity() {
  const within = () => Object.fromEntries(Array.from({ length: MAX_RANGE }, (_, k) => [String(k + 1), 0]));
  return { alliesWithin: within(), opponentsWithin: within(), alliesAdjacent: 0, opponentsAdjacent: 0, nearestAlly: NONE,
    nearestOpponent: NONE, onGlass: 0, glassSurrounded: 0, glassReach: 0, areaOfRule: 3, alliesInRule: 0, alliesInRuleNM: 0,
    nextToGlassFeature: 0, glassFeatureHV: 0, allyMarkAdjacent: {}, allyBelowMax: 0, markNearest: {}, opponentsAdjacentAwk: {}, onArea: {} };
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
    // OA: the Oni's Area of Rule (a Standard Sphere: 3 Squares; "areaOfRule" pieces of working items: + Squares)
    out.areaOfRule = 3 + Array.from(actor.items ?? []).filter(i => i.system?.isActive ?? true)
      .flatMap(i => Array.from(i.system?.modifiers ?? [])).filter(m => (m.active !== false) && (m.target === "areaOfRule"))
      .reduce((t, m) => t + (Number(m.value) || 0), 0);
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
      // (T10 opponentsAdjacentAwk: the Awakenings of your adjacent Opponents, read by their @vs.allyAdjAwk)
      if ( opponent && (d <= 1) ) {
        for ( const s of Object.keys(possessedAwakenings(other)) ) out.opponentsAdjacentAwk[s] = (out.opponentsAdjacentAwk[s] ?? 0) + 1;
      }
      // (T4 @markNearest.<slug>: the nearest Character carrying that mark of yours, in Squares)
      for ( const [slug, list] of Object.entries(actor.flags?.["dbu-rpg"]?.marks ?? {}) ) {
        if ( (list ?? []).some(e => e?.uuid === other.uuid) ) out.markNearest[slug] = Math.min(out.markNearest[slug] ?? 99, d);
      }
      for ( let n = d; n <= MAX_RANGE; n++ ) out[key][String(n)] += 1;
      if ( ally ) out.nearestAlly = Math.min(out.nearestAlly, d);
      // (F8: the most Health Thresholds an Ally is below)
      if ( ally ) out.allyBelowMax = Math.max(out.allyBelowMax, Number(other.system?.health?.count ?? 0) || 0);
      // (F2: the marks you placed on an adjacent Ally)
      if ( ally && (d <= 1) ) {
        for ( const [slug, list] of Object.entries(actor.flags?.["dbu-rpg"]?.marks ?? {}) ) {
          if ( (list ?? []).some(e => e?.uuid === other.uuid) ) out.allyMarkAdjacent[slug] = (out.allyMarkAdjacent[slug] ?? 0) + 1;
        }
      }
      else out.nearestOpponent = Math.min(out.nearestOpponent, d);
      // (OA: the Allies within your Area of Rule, and those that are not Minions)
      if ( ally && (d <= out.areaOfRule) ) {
        out.alliesInRule += 1;
        if ( !((other.type === "npc") && (other.system?.npcType === "minion")) ) out.alliesInRuleNM += 1;
      }
    }
    out.alliesAdjacent = out.alliesWithin["1"];
    out.opponentsAdjacent = out.opponentsWithin["1"];
    // (T17 @onArea.<kind>: the center of your token is in an area of that kind on the map)
    {
      const c0 = cells(token, size, unit);
      const px = (c0.x0 + c0.x1) * size / 2, py = (c0.y0 + c0.y1) * size / 2;
      for ( const a of (scene.regions ?? []).map(r => r.flags?.["dbu-rpg"]?.area).filter(a => a?.kind) ) {
        const holed = (a.holes ?? []).some(h => (px >= h.x) && (px < h.x + size) && (py >= h.y) && (py < h.y + size));
        if ( (px >= a.x0) && (px < a.x1) && (py >= a.y0) && (py < a.y1) && !holed ) out.onArea[String(a.kind).toLowerCase()] = 1;
      }
    }
    // GL: your Square is in a Glass area on the map (@onGlass), and so is every Square around you (@glassSurrounded)
    const glass = (scene.regions ?? []).map(r => r.flags?.["dbu-rpg"]?.area).filter(a => a && (a.kind === "glass"));
    // GS: the Glass Soldiers (Features with the Glass Feature Quality): next to one (@nextToGlassFeature, its Hardness Value
    // @glassFeatureHV); their Squares count with the Glass ones for "Glass or a Glass Feature"
    const soldiers = (scene.tokens ?? []).filter(t => t.flags?.["dbu-rpg"]?.feature?.kind === "glassSoldier");
    for ( const s of soldiers ) {
      if ( tokenDistance(token, s, { size, unit }) <= 1 ) {
        out.nextToGlassFeature += 1;
        out.glassFeatureHV = Math.max(out.glassFeatureHV, Number(s.flags["dbu-rpg"].feature.hv) || 0);
      }
    }
    if ( glass.length || soldiers.length ) {
      const holed = (a, px, py) => (a.holes ?? []).some(h => (px >= h.x) && (px < h.x + size) && (py >= h.y) && (py < h.y + size));
      const inArea = (px, py) => glass.some(a => (px >= a.x0) && (px < a.x1) && (py >= a.y0) && (py < a.y1) && !holed(a, px, py));
      const onSoldier = (px, py) => soldiers.some(s => (px >= s._source.x) && (px < s._source.x + size) && (py >= s._source.y) && (py < s._source.y + size));
      const inGlass = (px, py) => inArea(px, py) || onSoldier(px, py);
      const c = cells(token, size, unit);
      out.onGlass = inArea((c.x0 + c.x1) * size / 2, (c.y0 + c.y1) * size / 2) ? 1 : 0;
      let all = true;
      for ( let gx = Math.floor(c.x0) - 1; gx <= Math.ceil(c.x1); gx++ ) {
        for ( let gy = Math.floor(c.y0) - 1; gy <= Math.ceil(c.y1); gy++ ) {
          const inside = (gx >= c.x0) && (gx < c.x1) && (gy >= c.y0) && (gy < c.y1);
          if ( !inside && !inGlass((gx + 0.5) * size, (gy + 0.5) * size) ) all = false;
        }
      }
      out.glassSurrounded = (out.onGlass && all) ? 1 : 0;
      // (GL @glassReach: every Square within that many Squares of you is Glass, up to 6: a Large Sphere is 4)
      if ( out.onGlass ) {
        let reach = 0;
        for ( let n = 1; n <= 6; n++ ) {
          let ok = true;
          for ( let gx = Math.floor(c.x0) - n; ok && (gx < Math.ceil(c.x1) + n); gx++ ) {
            for ( let gy = Math.floor(c.y0) - n; gy < Math.ceil(c.y1) + n; gy++ ) {
              if ( !inGlass((gx + 0.5) * size, (gy + 0.5) * size) ) { ok = false; break; }
            }
          }
          if ( !ok ) break;
          reach = n;
        }
        out.glassReach = reach;
      }
    }
  } catch(err) { /* the world is still loading */ }
  return out;
}

/** Does an actor have a piece that reads the proximity data? */
const READS = /@(alliesWithin|opponentsWithin|alliesAdjacent|opponentsAdjacent|nearestAlly|nearestOpponent|onGlass|glassSurrounded|glassReach|alliesInRule|alliesInRuleNM|areaOfRule|nextToGlassFeature|glassFeatureHV|allyMarkAdjacent|allyBelowMax|markNearest|onArea)\b|@to\.distance/;
export function readsProximity(actor) {
  for ( const i of actor?.items ?? [] ) {
    for ( const p of [...(i.system?.modifiers ?? []), ...(i.system?.triggers ?? [])] ) {
      if ( READS.test(`${p.condition ?? ""} ${p.value ?? ""}`) ) return true;
    }
  }
  return false;
}

/** A token moved (or changed height): the actors of its encounter that read the distances are worked out again. */
/** GL: an area placed, moved or removed on a scene: the actors of that scene's encounters that read the data, again. */
function refreshScene(scene) {
  for ( const combat of globalThis.game?.combats ?? [] ) {
    if ( !combat.started ) continue;
    for ( const cb of combat.combatants ) {
      const a = cb.actor;
      if ( !a || (cb.token?.parent !== scene) || !readsProximity(a) ) continue;
      a.reset();
      if ( a.sheet?.rendered ) a.sheet.render();
    }
  }
}

export function registerProximityHooks() {
  for ( const hook of ["createRegion", "updateRegion", "deleteRegion"] ) Hooks.on(hook, doc => refreshScene(doc.parent));
  Hooks.on("updateToken", (doc, changes) => {
    if ( !(("x" in changes) || ("y" in changes) || ("elevation" in changes)) ) return;
    // (GS: a Glass Soldier moved: the scene's Characters that read the Glass data)
    if ( doc.flags?.["dbu-rpg"]?.feature ) return refreshScene(doc.parent);
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
