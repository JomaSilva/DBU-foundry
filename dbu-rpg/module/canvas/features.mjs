/**
 * Features on the map made by effects: the Glass Soldiers of the Glass Tribe (Warriors of Glass). A Glass Soldier is an
 * unlinked token of its owner's "Glass Soldier" actor (the owner may move it), flagged
 * flags.dbu-rpg.feature = { kind: "glassSoldier", owner, rank, lp, lpMax, hv }: Hardness Rank 2 + 1 (Glass), its Life
 * Points the Rank doubled (Resilient), its Hardness Value 2 x Rank (bT). It stands on a Square that was Glass: that Square
 * loses the Glass Environmental Quality (a hole in the Glass area, flags.dbu-rpg.area.holes).
 */
import { hardnessValue } from "../rules/height.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const RANK = 3;

/** The Glass Soldier tokens on a scene. */
export function glassSoldiers(scene) {
  return (scene?.tokens ?? []).filter(t => t.flags?.["dbu-rpg"]?.feature?.kind === "glassSoldier");
}

/** Is the Square (its top-left corner, in pixels) in a Glass area (not one of its holes)? */
export function squareGlass(scene, sx, sy) {
  const size = scene.grid?.size ?? 100;
  const px = sx + (size / 2);
  const py = sy + (size / 2);
  return (scene.regions ?? []).some(r => {
    const a = r.flags?.["dbu-rpg"]?.area;
    if ( !a || (a.kind !== "glass") ) return false;
    if ( !((px >= a.x0) && (px < a.x1) && (py >= a.y0) && (py < a.y1)) ) return false;
    return !(a.holes ?? []).some(h => (h.x === sx) && (h.y === sy));
  });
}

/** The owner's "Glass Soldier" actor (made once, owned by the owner's players). */
async function soldierActor(owner) {
  const found = game.actors.find(a => a.getFlag("dbu-rpg", "soldierOf") === owner.uuid);
  if ( found ) return found;
  const ownership = { default: 0 };
  for ( const u of game.users ) if ( owner.testUserPermission?.(u, "OWNER") ) ownership[u.id] = 3;
  return Actor.create({ name: `Glass Soldier (${owner.name})`, type: "npc", img: "icons/svg/ice-aura.svg", ownership,
    system: { npcType: "other" }, flags: { "dbu-rpg": { soldierOf: owner.uuid } } });
}

/**
 * Create up to n Glass Soldiers on the Glass Squares nearest to the owner (unoccupied ones); the owner moves them where
 * it wants afterwards. GM only (the socket "glassSoldiers" brings a player's request). @returns the number created.
 */
export async function createGlassSoldiers(owner, n) {
  if ( !game.user.isGM ) {
    const { emitGM } = await import("../socket.mjs");
    return emitGM("glassSoldiers", { ownerUuid: owner.uuid, n }) ? n : 0;
  }
  const me = owner.getActiveTokens?.()?.[0]?.document;
  const scene = me?.parent;
  if ( !scene || !(n > 0) ) return 0;
  const size = scene.grid?.size ?? 100;
  const taken = new Set(Array.from(scene.tokens).flatMap(t => {
    const s = t._source; const out = [];
    for ( let i = 0; i < (s.width ?? 1); i++ ) for ( let j = 0; j < (s.height ?? 1); j++ ) out.push(`${s.x + (i * size)},${s.y + (j * size)}`);
    return out;
  }));
  // the Glass Squares of the scene's Glass areas
  const squares = [];
  for ( const r of scene.regions ?? [] ) {
    const a = r.flags?.["dbu-rpg"]?.area;
    if ( !a || (a.kind !== "glass") ) continue;
    for ( let x = a.x0; x < a.x1; x += size ) for ( let y = a.y0; y < a.y1; y += size ) {
      if ( squareGlass(scene, x, y) && !taken.has(`${x},${y}`) && !squares.some(q => (q.x === x) && (q.y === y)) ) squares.push({ x, y });
    }
  }
  const cx = me._source.x;
  const cy = me._source.y;
  squares.sort((p, q) => (Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy)) - Math.max(Math.abs(q.x - cx), Math.abs(q.y - cy))));
  const picked = squares.slice(0, n);
  if ( !picked.length ) return 0;
  const actor = await soldierActor(owner);
  const bT = owner.system?.top?.base ?? 1;
  const feature = { kind: "glassSoldier", owner: owner.uuid, rank: RANK, lp: 2 * RANK, lpMax: 2 * RANK, hv: hardnessValue(RANK, bT) };
  const proto = (await actor.getTokenDocument()).toObject();
  await scene.createEmbeddedDocuments("Token", picked.map(p => ({ ...proto, x: p.x, y: p.y, actorLink: false, name: "Glass Soldier",
    disposition: me.disposition, flags: { ...(proto.flags ?? {}), "dbu-rpg": { feature } } })));
  // those Squares lose the Glass Environmental Quality (holes in the Glass area that holds them)
  for ( const r of scene.regions ?? [] ) {
    const a = r.flags?.["dbu-rpg"]?.area;
    if ( !a || (a.kind !== "glass") ) continue;
    const inside = picked.filter(p => (p.x >= a.x0) && (p.x < a.x1) && (p.y >= a.y0) && (p.y < a.y1));
    if ( !inside.length ) continue;
    const holes = [...(a.holes ?? []), ...inside];
    const shapes = [...r.shapes.map(s => s.toObject?.() ?? s), ...inside.map(p => ({ type: "rectangle", x: p.x, y: p.y, width: size, height: size, rotation: 0, hole: true }))];
    await r.update({ shapes, "flags.dbu-rpg.area.holes": holes });
  }
  return picked.length;
}

/**
 * The Glass Soldier an owner's attack originates from (Warriors of Glass): the one of its Soldiers the user controls on
 * the map, else the one nearest to the user's first target, else the first.
 */
export function chooseSoldier(owner) {
  const scene = owner?.getActiveTokens?.()?.[0]?.document?.parent;
  if ( !scene ) return null;
  const mine = glassSoldiers(scene).filter(t => t.flags["dbu-rpg"].feature.owner === owner.uuid);
  if ( !mine.length ) return null;
  const ctl = (globalThis.canvas?.tokens?.controlled ?? []).map(t => t.document).find(d => mine.includes(d));
  if ( ctl ) return ctl;
  const tgt = [...(game.user?.targets ?? [])][0]?.document;
  if ( tgt ) {
    const d = t => Math.max(Math.abs(t._source.x - tgt._source.x), Math.abs(t._source.y - tgt._source.y));
    return [...mine].sort((a, b) => d(a) - d(b))[0];
  }
  return mine[0];
}

/** Remove a Glass Feature token (destroyed). */
export async function destroyFeature(token) {
  if ( !token ) return false;
  if ( game.user.isGM ) { await token.delete(); return true; }
  const { emitGM } = await import("../socket.mjs");
  return emitGM("removeFeature", { uuid: token.uuid });
}

/** The Glass Soldier adjacent to a token (the first one), or null. */
export function adjacentGlassFeature(tokenDoc) {
  const scene = tokenDoc?.parent;
  if ( !scene ) return null;
  const size = scene.grid?.size ?? 100;
  const s = tokenDoc._source;
  const x0 = s.x - size, x1 = s.x + ((s.width ?? 1) * size), y0 = s.y - size, y1 = s.y + ((s.height ?? 1) * size);
  return glassSoldiers(scene).find(t => (t.id !== tokenDoc.id) && (t._source.x >= x0) && (t._source.x <= x1) && (t._source.y >= y0) && (t._source.y <= y1)) ?? null;
}

/**
 * Warriors of Glass (5), the start of the owner's turn: a Glass Soldier on a Glass Square regains all of its Life Points;
 * one on another Square gives it and the adjacent Squares the Glass Environmental Quality (a Minor Glass Sphere).
 */
export async function soldiersTurn(owner) {
  const scene = owner.getActiveTokens?.()?.[0]?.document?.parent;
  if ( !scene ) return "";
  const mine = glassSoldiers(scene).filter(t => t.flags["dbu-rpg"].feature.owner === owner.uuid);
  if ( !mine.length ) return "";
  const { sphereData } = await import("./areas.mjs");
  let healed = 0;
  let spread = 0;
  for ( const t of mine ) {
    const f = t.flags["dbu-rpg"].feature;
    if ( squareGlass(scene, t._source.x, t._source.y) ) {
      if ( f.lp < f.lpMax ) { await t.update({ "flags.dbu-rpg.feature.lp": f.lpMax }); healed++; }
      continue;
    }
    const data = sphereData(t, 0, { name: "Glass", kind: "glass", color: "#8fd3ff", owner: owner.uuid });
    if ( data ) { await scene.createEmbeddedDocuments("Region", [data]); spread++; }
  }
  return L("DBU.Feature.SoldiersTurn", { healed, spread });
}
