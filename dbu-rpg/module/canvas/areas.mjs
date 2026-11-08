/**
 * Areas placed on the scene by effects (an AoE an effect makes on the map): a Sphere AoE as a Region whose square covers
 * every Square within its Magnitude's reach of a Target Square (the system's Chebyshev distance: adjacent = 1).
 *
 * - placeSphere(actor, magnitude, { name, kind, color }): the Sphere centered on the actor's token Square (Self-Explosion,
 *   Hazy Dragon's Bog); created by the GM (socket "placeArea") when the user cannot.
 * - inArea(tokenDoc, kind): is the token's centre inside an area of that kind (flags.dbu-rpg.area.kind)?
 *
 * The reach of each Magnitude follows the automation data (Minor 1, Standard 3, Large 4, Huge 5, Destructive 6 Squares).
 */
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** Squares of reach of a Sphere AoE by Magnitude (0 Minor ... 4 Destructive). */
export const SPHERE_SQUARES = [1, 3, 4, 5, 6];

/** The Sphere's Region data around a token (its centre Square), or null. */
export function sphereData(tokenDoc, magnitude, { name = "", kind = "", color = "#6b4f2a", owner = "" } = {}) {
  const scene = tokenDoc?.parent;
  if ( !scene ) return null;
  const size = scene.grid?.size ?? 100;
  const m = Math.clamp(Math.floor(Number(magnitude) || 0), 0, 4);
  const n = SPHERE_SQUARES[m];
  const s = tokenDoc._source ?? tokenDoc;
  const cx = Math.floor((s.x + ((s.width ?? 1) * size) / 2) / size);
  const cy = Math.floor((s.y + ((s.height ?? 1) * size) / 2) / size);
  const x0 = (cx - n) * size;
  const y0 = (cy - n) * size;
  const w = ((2 * n) + 1) * size;
  return {
    name: name || "Sphere", color,
    shapes: [{ type: "rectangle", x: x0, y: y0, width: w, height: w, rotation: 0, hole: false }],
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    flags: { "dbu-rpg": { area: { kind, magnitude: m, squares: n, x0, y0, x1: x0 + w, y1: y0 + w, owner } } }
  };
}

/** Place a Sphere AoE centered on the actor's token. @returns a text for the card, or "". */
export async function placeSphere(actor, magnitude, { name = "", kind = "", color = "#6b4f2a", out = null } = {}) {
  const token = actor?.getActiveTokens?.()?.[0]?.document ?? null;
  const scene = token?.parent;
  const data = sphereData(token, magnitude, { name, kind, color, owner: actor?.uuid ?? "" });
  if ( !data || !scene ) return "";
  // (a fixed id: an area that lasts a while is removed by its timed entry: out.uuid)
  data._id = foundry.utils.randomID();
  if ( out ) out.uuid = `${scene.uuid}.Region.${data._id}`;
  if ( game.user.isGM ) await scene.createEmbeddedDocuments("Region", [data], { keepId: true });
  else {
    const { emitGM } = await import("../socket.mjs");
    if ( !emitGM("placeArea", { sceneId: scene.id, data }) ) return "";
  }
  return L("DBU.Area.Placed", { name: data.name, n: data.flags["dbu-rpg"].area.squares });
}

/** Remove an area (a Region uuid): through the GM when the user cannot. */
export async function removeArea(uuid) {
  const r = await fromUuid(uuid).catch(() => null);
  if ( !r ) return false;
  if ( game.user.isGM ) { await r.delete(); return true; }
  const { emitGM } = await import("../socket.mjs");
  return emitGM("removeArea", { uuid });
}

/** Is the token's centre inside an area of that kind on its scene? */
export function inArea(tokenDoc, kind) {
  const scene = tokenDoc?.parent;
  if ( !scene?.regions ) return false;
  const size = scene.grid?.size ?? 100;
  const s = tokenDoc._source ?? tokenDoc;
  const px = s.x + ((s.width ?? 1) * size) / 2;
  const py = s.y + ((s.height ?? 1) * size) / 2;
  return scene.regions.some(r => {
    const a = r.flags?.["dbu-rpg"]?.area;
    return a && (a.kind === kind) && (px >= a.x0) && (px < a.x1) && (py >= a.y0) && (py < a.y1);
  });
}
