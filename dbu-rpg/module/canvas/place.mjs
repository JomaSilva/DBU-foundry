/**
 * Placing a Character on a Square the user picks on the map: the teleports and relocations of effects ("removed from your
 * current place on the Battlefield and placed on that Square").
 *
 * - pickSquare({ hint }): waits for a left click on the canvas (a right click, Escape or a minute cancels) and gives the
 *   top-left corner of that grid Square.
 * - placeCharacter(user, who, { range, center, label }): `who` goes to the Square `user` picks, anywhere on the scene or
 *   within `range` Squares of the token `center`, never onto another token. A Grappled Character first makes a Cognitive
 *   Clash against its Grappler (a win ends the Grapple, a loss cancels the placing); a Grappler's Grapple ends. The move
 *   goes through the GM when the user does not own the token (movement.mjs runOps), flagged dbuPlaced (no Movement
 *   Maneuver: nothing it provokes), and then "placed" fires on `who` (@placedNextToOpponent / @placedNextToAlly;
 *   F11 @placedVia_<slug>: the effect that placed it, "Dissipating Dodge (1)" → @placedVia_dissipatingdodge).
 * - placeNextTo(user, target, { maxFrom }): `user` onto a Square adjacent to `target`, at most `maxFrom` Squares away.
 * - placeNearPicked(user, { range }): the Square of a Feature picked first; `user` must be within `range` Squares of it
 *   and lands on a Square within them.
 */
import { tokenDistance } from "../rules/proximity.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** Wait for a Square picked on the canvas. @returns {Promise<{x:number, y:number}|null>} */
export function pickSquare({ hint = "" } = {}) {
  const cv = globalThis.canvas;
  if ( !cv?.ready || !cv.stage ) return Promise.resolve(null);
  if ( hint ) ui.notifications.info(hint);
  return new Promise(resolve => {
    let done = false;
    const finish = v => {
      if ( done ) return;
      done = true;
      cv.stage.off("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      clearTimeout(timer);
      resolve(v);
    };
    const onDown = ev => {
      if ( ev.button === 2 ) return finish(null);
      if ( ev.button !== 0 ) return;
      const p = ev.getLocalPosition(cv.stage);
      const tl = cv.grid.getTopLeftPoint(p);
      finish({ x: tl.x, y: tl.y });
    };
    const onKey = ev => { if ( ev.key === "Escape" ) finish(null); };
    const timer = setTimeout(() => finish(null), 60000);
    cv.stage.on("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
  });
}

/** Does another token of the scene cover that Square? */
function occupied(scene, x, y, except) {
  const size = scene.grid?.size ?? 100;
  const px = x + (size / 2);
  const py = y + (size / 2);
  return scene.tokens.some(t => {
    if ( t.id === except?.id ) return false;
    const s = t._source;
    return (px >= s.x) && (px < s.x + ((s.width ?? 1) * size)) && (py >= s.y) && (py < s.y + ((s.height ?? 1) * size));
  });
}

/** The Allies and Opponents of `who` adjacent to that position (its encounter's tokens on the scene). */
function neighbours(who, tdoc, pos) {
  const scene = tdoc.parent;
  const size = scene.grid?.size ?? 100;
  const unit = scene.grid?.distance ?? 1;
  const here = { _source: { ...tdoc._source, x: pos.x, y: pos.y } };
  const side = tdoc.disposition ?? 0;
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === who.uuid));
  let allies = 0;
  let opponents = 0;
  for ( const cb of combat?.combatants ?? [] ) {
    const t = cb.token;
    if ( !t || (t.id === tdoc.id) || (t.parent !== scene) || cb.isDefeated ) continue;
    if ( tokenDistance(here, t, { size, unit }) > 1 ) continue;
    const d = t.disposition ?? 0;
    if ( side && (d === side) ) allies += 1;
    else if ( side && d && (d !== side) ) opponents += 1;
  }
  return { allies, opponents };
}

/**
 * Place `who` on a Square `user` picks. @returns a text for the card.
 * @param {Actor} user      whose effect it is (it picks the Square)
 * @param {Actor} who       the Character placed
 * @param {object} [o]
 * @param {number|null} [o.range]   at most that many Squares from `center` (null: anywhere on the scene)
 * @param {TokenDocument|null} [o.center]
 */
export async function placeCharacter(user, who, { range = null, center = null, label = "", via = "" } = {}) {
  const tdoc = who?.getActiveTokens?.()?.[0]?.document ?? null;
  const scene = tdoc?.parent;
  if ( !tdoc || !scene || (scene !== globalThis.canvas?.scene) ) return L("DBU.Place.NoToken", { name: who?.name ?? "" });
  // (F10: your own move refused while "flag.noMovement" holds: Rooted)
  if ( (user === who) && ((who.system?.buckets?.["flag.noMovement"]?.total ?? 0) > 0) ) return L("DBU.MoveManeuver.NoMovement", { name: who.name });
  const lines = [];
  // The Grapple: the Grappled one breaks free with a Cognitive Clash first
  const G = await import("../combat/grapple.mjs");
  const g = G.grappleOf(who);
  if ( g?.role === "grappled" ) {
    let grappler = await fromUuid(g.with).catch(() => null);
    if ( grappler?.documentName === "Token" ) grappler = grappler.actor;
    if ( grappler ) {
      const { resolveClash } = await import("../combat/clash.mjs");
      const r = await resolveClash(who, grappler, { mine: "cognitive", theirs: "cognitive", label: label || "Clash", subtitle: label, defenderSubtitle: label });
      if ( !r?.won ) return L("DBU.Place.ClashLost", { name: who.name, other: grappler.name });
      lines.push(L("DBU.Place.ClashWon", { name: who.name, other: grappler.name }));
    }
  }
  const size = scene.grid?.size ?? 100;
  const unit = scene.grid?.distance ?? 1;
  const rect = scene.dimensions?.sceneRect ?? globalThis.canvas?.dimensions?.sceneRect;
  for ( let tries = 0; tries < 3; tries++ ) {
    const hint = (range !== null) ? L("DBU.Place.PickRange", { name: who.name, n: range }) : L("DBU.Place.PickAny", { name: who.name });
    const sq = await pickSquare({ hint });
    if ( !sq ) return [...lines, L("DBU.Place.Cancelled")].join(" ");
    if ( rect && !rect.contains(sq.x + 1, sq.y + 1) ) { ui.notifications.warn(L("DBU.Place.Outside")); continue; }
    if ( (range !== null) && center ) {
      const d = tokenDistance({ _source: { ...tdoc._source, x: sq.x, y: sq.y } }, center, { size, unit });
      if ( d > range ) { ui.notifications.warn(L("DBU.Place.Far", { n: range, d })); continue; }
    }
    if ( occupied(scene, sq.x, sq.y, tdoc) ) { ui.notifications.warn(L("DBU.Place.Occupied")); continue; }
    if ( g ) await G.endGrapple(who);
    const { runOps } = await import("../combat/movement.mjs");
    await runOps([{ op: "update", uuid: tdoc.uuid, data: { x: sq.x, y: sq.y }, options: { dbuPlaced: true } }]);
    const n = neighbours(who, tdoc, sq);
    const { fireEvent, viaSlug } = await import("../combat/triggers.mjs");
    const viaKey = via ? viaSlug(String(via).replace(/\(\s*\d+\s*\)\s*$/, "")) : "";
    fireEvent(who, "placed", { other: user !== who ? user : null, scope: { placedNextToOpponent: n.opponents, placedNextToAlly: n.allies,
      ...(viaKey ? { [`placedVia_${viaKey}`]: 1 } : {}) } });
    lines.push(L("DBU.Place.Placed", { name: who.name }));
    return lines.join(" ");
  }
  return [...lines, L("DBU.Place.Cancelled")].join(" ");
}

/** F11: `user` onto a Square adjacent to `target` (a token), when it is at most `maxFrom` Squares away. */
export async function placeNextTo(user, target, { maxFrom = null, label = "" } = {}) {
  const mine = user?.getActiveTokens?.()?.[0]?.document ?? null;
  const t = target?.document ?? target ?? null;
  if ( !mine || !t?.actor || (t.actor === user) ) return L("DBU.TraitUse.NoTarget");
  const scene = mine.parent;
  if ( t.parent !== scene ) return L("DBU.Place.NoToken", { name: t.name });
  if ( maxFrom !== null ) {
    const d = tokenDistance(mine, t, { size: scene.grid?.size ?? 100, unit: scene.grid?.distance ?? 1 });
    if ( d > maxFrom ) return L("DBU.Place.TargetFar", { name: t.name, d, n: maxFrom });
  }
  return placeCharacter(user, user, { range: 1, center: t, label, via: label });
}

/** F11: the Square of a Feature picked on the map, `user` within `range` Squares of it, then a Square within them. */
export async function placeNearPicked(user, { range = 4, label = "" } = {}) {
  const tdoc = user?.getActiveTokens?.()?.[0]?.document ?? null;
  const scene = tdoc?.parent;
  if ( !tdoc || !scene || (scene !== globalThis.canvas?.scene) ) return L("DBU.Place.NoToken", { name: user?.name ?? "" });
  const sq = await pickSquare({ hint: L("DBU.Place.PickFeature", { n: range }) });
  if ( !sq ) return L("DBU.Place.Cancelled");
  const center = { _source: { x: sq.x, y: sq.y, width: 1, height: 1, elevation: tdoc._source?.elevation ?? 0 } };
  const d = tokenDistance(tdoc, center, { size: scene.grid?.size ?? 100, unit: scene.grid?.distance ?? 1 });
  if ( d > range ) return L("DBU.Place.NotInSphere", { name: user.name, d, n: range });
  return placeCharacter(user, user, { range, center, label, via: label });
}
