import { rule } from "../optional-rules.mjs";
import { safeUpdate } from "../socket.mjs";
import {
  DEEP_SPACE, HIGH_ENVIRONMENTS, RANK_SQUARES, aoeVerticalReach, flightEnvironment, occupiedVerticality, verticalGap
} from "../rules/height.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

/**
 * Height of tokens (see rules/height.mjs): kept in the token's elevation, above the floor of its Level. The Flight
 * Optional Rule counts Verticality (1 per Square); otherwise the rank of High Environment (8 Squares per rank).
 */
export function heightMode() {
  return rule("flight") ? "flight" : "levels";
}

const docOf = t => t?.document ?? t;
const gridDistance = doc => doc?.parent?.grid?.distance || 1;
const floorOf = doc => doc?.parent?.levels?.get?.(doc.level)?.elevation?.base ?? 0;
const finite = n => (Number.isFinite(n) ? n : 0);
/**
 * Where the token is (or is going): v14 moves x, y and elevation along with the movement animation, the source data
 * holds the position the rules work with.
 */
export const positionOf = doc => ({ x: doc._source?.x ?? doc.x, y: doc._source?.y ?? doc.y, elevation: doc._source?.elevation ?? doc.elevation });

/** { mode, value, squares }: value is the Verticality (Flight) or the rank of High Environment. */
export function tokenHeight(token) {
  const doc = docOf(token);
  const mode = heightMode();
  const elevation = doc ? positionOf(doc).elevation : 0;
  const squares = Math.max(0, Math.round(finite((elevation ?? 0) - floorOf(doc)) / gridDistance(doc)));
  if ( mode === "flight" ) return { mode, value: squares, squares };
  const rank = Math.clamp(Math.round(squares / RANK_SQUARES), 0, DEEP_SPACE);
  return { mode, value: rank, squares: rank * RANK_SQUARES };
}

/** The elevation for a height value in the current mode. */
export function elevationFor(token, value, mode = heightMode()) {
  const doc = docOf(token);
  const squares = mode === "flight" ? Math.max(0, value) : Math.clamp(value, 0, DEEP_SPACE) * RANK_SQUARES;
  return floorOf(doc) + (squares * gridDistance(doc));
}

/** Set a token's height (through the GM when the user does not own it). */
export async function setTokenHeight(token, value, options = {}) {
  const doc = docOf(token);
  if ( !doc ) return null;
  return safeUpdate(doc, { elevation: elevationFor(doc, value) }, options);
}

/** Name of a rank of High Environment. */
export function rankLabel(rank) {
  return L(`DBU.Altitude.Env.${HIGH_ENVIRONMENTS[Math.clamp(rank, 0, DEEP_SPACE)]}`);
}

/** Short text of a height: "3", "12 · Sky" (Flight) or "Low Sky". Empty on the ground. */
export function heightLabel(h) {
  if ( !h?.value ) return "";
  if ( h.mode === "levels" ) return rankLabel(h.value);
  const env = flightEnvironment(h.value);
  return env ? `${h.value} · ${L(`DBU.Altitude.Flight.${env}`)}` : String(h.value);
}

/** Longer text for the sheet and chat cards: "Verticality 3" or "Low Sky (rank 1)", "on the ground" at 0. */
export function heightText(h) {
  if ( !h?.value ) return L("DBU.Altitude.Ground");
  if ( h.mode === "levels" ) return L("DBU.Altitude.RankText", { env: rankLabel(h.value), n: h.value });
  const env = flightEnvironment(h.value);
  return L("DBU.Altitude.VerticalityText", { n: h.value }) + (env ? ` (${L(`DBU.Altitude.Flight.${env}`)})` : "");
}

/** Vertical band of a token for the Flight Optional Rule (Size Categories above Medium occupy more Verticality). */
export function verticalBand(token) {
  const doc = docOf(token);
  return { v: tokenHeight(doc).value, occupied: occupiedVerticality(doc?.actor?.system?.size?.key) };
}

/** Grid rectangle of a token at a position (square grids): rows i0..i1, columns j0..j1. */
export function footprint(doc, { x = positionOf(doc).x, y = positionOf(doc).y } = {}) {
  const grid = canvas.grid;
  const { i, j } = grid.getOffset({ x: x + 1, y: y + 1 });
  return { i0: i, j0: j, i1: i + Math.max(1, Math.ceil(doc.height)) - 1, j1: j + Math.max(1, Math.ceil(doc.width)) - 1 };
}

/** Squares between two tokens on the grid, without height (0 when they overlap, 1 when adjacent). */
export function horizontalSquares(a, b) {
  const da = docOf(a), db = docOf(b);
  const grid = canvas.grid;
  if ( !grid.isSquare ) {
    const ca = da.getCenterPoint(positionOf(da)), cb = db.getCenterPoint(positionOf(db));
    const reach = ((da.width + db.width) / 2) * grid.size;
    return Math.max(0, Math.round((Math.hypot(cb.x - ca.x, cb.y - ca.y) - reach) / grid.size) + 1);
  }
  const ra = footprint(da), rb = footprint(db);
  const di = Math.max(0, rb.i0 - ra.i1, ra.i0 - rb.i1);
  const dj = Math.max(0, rb.j0 - ra.j1, ra.j0 - rb.j1);
  if ( !di && !dj ) return 0;
  const from = grid.getCenterPoint({ i: 0, j: 0 });
  const to = grid.getCenterPoint({ i: di, j: dj });
  return Math.round(grid.measurePath([from, to]).distance / grid.distance);
}

/** Squares the height adds between two tokens: the Verticality between them, or 8 per rank of difference. */
export function verticalSquares(a, b) {
  if ( heightMode() === "flight" ) return verticalGap(verticalBand(a), verticalBand(b));
  return RANK_SQUARES * Math.abs(tokenHeight(a).value - tokenHeight(b).value);
}

/** Distance between two tokens for Melee Range and Long Range: { horizontal, vertical, total }. */
export function tokenDistance(a, b) {
  const horizontal = horizontalSquares(a, b);
  const vertical = verticalSquares(a, b);
  return { horizontal, vertical, total: horizontal + vertical };
}

/** Distance from an attacker's token to each targeted token: [{ token, horizontal, vertical, total }]. */
export function targetDistances(actor, targets) {
  const mine = actorTokens(actor)[0];
  if ( !mine ) return [];
  return targets.filter(t => t?.document?.parent === mine.document.parent).map(t => ({ token: t, ...tokenDistance(mine, t) }));
}

/**
 * Targets an AoE of that Magnitude cannot reach from the attacker's height: Flight, Verticality further than the
 * Magnitude's number; High Environments, ranks beyond the AoE's reach (Deep Space only from Deep Space).
 */
export function outOfAoeHeight(actor, targets, magnitude) {
  const mine = actorTokens(actor)[0];
  if ( !mine || (magnitude === null) || (magnitude === undefined) ) return [];
  const mode = heightMode();
  const reach = aoeVerticalReach(mode, magnitude);
  return targets.filter(t => {
    if ( !t?.document ) return false;
    if ( mode === "flight" ) return verticalGap(verticalBand(mine), verticalBand(t)) > reach;
    const a = tokenHeight(mine).value, b = tokenHeight(t).value;
    if ( (a !== b) && ((a === DEEP_SPACE) || (b === DEEP_SPACE)) ) return true;
    return Math.abs(a - b) > reach;
  });
}

/**
 * Where in space the actor's token is, for the effects of those Battle Environments: 1 for Local Space (rank 3; with
 * the Flight Optional Rule, the Space Environment of 16+ Verticality), 2 for Deep Space (rank 4), otherwise 0.
 */
export function spaceLevel(actor) {
  const token = actorTokens(actor)[0];
  if ( !token ) return 0;
  const h = tokenHeight(token.document);
  if ( h.mode === "flight" ) return flightEnvironment(h.value) === "space" ? 1 : 0;
  if ( h.value === DEEP_SPACE ) return 2;
  return h.value === DEEP_SPACE - 1 ? 1 : 0;
}

/** The tokens of an actor on the viewed scene (the controlled one first). */
export function actorTokens(actor) {
  if ( !canvas?.ready || !actor ) return [];
  const tokens = actor.getActiveTokens();
  return tokens.sort((a, b) => Number(b.controlled) - Number(a.controlled));
}

/** Change a token's height by a step: Verticality (Flight) or a rank of High Environment. */
export async function stepHeight(token, delta) {
  const doc = docOf(token);
  const h = tokenHeight(doc);
  const max = h.mode === "flight" ? Infinity : DEEP_SPACE;
  const next = Math.clamp(h.value + delta, 0, max);
  if ( next === h.value ) return null;
  // Deep Space cannot be entered or left without the ARC's permission
  if ( (h.mode === "levels") && ((next === DEEP_SPACE) || (h.value === DEEP_SPACE)) && !game.user.isGM ) {
    ui.notifications.warn(L("DBU.Altitude.DeepSpaceGM"));
    return null;
  }
  return setTokenHeight(doc, next);
}

/* -------------------------------------------- */
/*  Token marker                                */
/* -------------------------------------------- */

const MARKER_COLORS = {
  flight: 0x2f6fbf, sky: 0x29a3d6, space: 0x5b2a9e,
  lowSky: 0x29a3d6, highSky: 0x1f63c4, localSpace: 0x5b2a9e, deepSpace: 0x1d1530
};

function markerColor(h) {
  if ( h.mode === "levels" ) return MARKER_COLORS[HIGH_ENVIRONMENTS[h.value]] ?? MARKER_COLORS.flight;
  return MARKER_COLORS[flightEnvironment(h.value)] ?? MARKER_COLORS.flight;
}

/** Draw, update or remove the height marker above a token (it takes the place of the elevation tooltip). */
export function refreshHeightMarker(token) {
  if ( !token || token.destroyed || !token.document ) return;
  const h = tokenHeight(token.document);
  const label = heightLabel(h);
  let marker = token.dbuHeightMarker;
  if ( !label || token.document.isSecret ) {
    if ( marker && !marker.destroyed ) marker.visible = false;
    return;
  }
  const s = canvas.dimensions.uiScale;
  const key = `${label}|${s}|${token.document.width}`;
  if ( !marker || marker.destroyed ) {
    marker = token.dbuHeightMarker = token.addChild(new PIXI.Container());
    marker.eventMode = "none";
    marker.zIndex = 10;
    marker.bg = marker.addChild(new PIXI.Graphics());
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = 20;
    style.fontWeight = "bold";
    marker.text = marker.addChild(new foundry.canvas.containers.PreciseText("", style));
    marker.text.anchor.set(0, 0.5);
  }
  if ( marker.dbuKey !== key ) {
    marker.dbuKey = key;
    marker.text.text = label;
    marker.text.scale.set(s);
    const pad = 6 * s, arrow = 12 * s, gap = 4 * s;
    const w = pad + arrow + gap + marker.text.width + pad;
    const hgt = Math.max(marker.text.height, 22 * s) + (4 * s);
    const g = marker.bg.clear();
    g.lineStyle({ width: 2 * s, color: 0x000000, alpha: 0.85 });
    g.beginFill(markerColor(h), 0.92).drawRoundedRect(-w / 2, -hgt, w, hgt, hgt / 2).endFill();
    // An upward arrow before the text
    const ax = (-w / 2) + pad, ay = -hgt / 2;
    g.lineStyle({ width: 0 });
    g.beginFill(0xffffff, 1).drawPolygon([ax, ay + (arrow * 0.45), ax + (arrow / 2), ay - (arrow * 0.5), ax + arrow, ay + (arrow * 0.45)]).endFill();
    marker.text.position.set(ax + arrow + gap, ay);
  }
  const { width } = token.document.getSize();
  marker.position.set(width / 2, -(CONFIG.Canvas.objectBorderThickness * 0.75 * s));
  marker.visible = true;
  // The elevation in grid units would say the same thing in other words
  if ( token.tooltip ) token.tooltip.visible = false;
}

/** Refresh the markers of every token on the canvas (the Flight Optional Rule was switched on or off). */
export function refreshAllHeightMarkers() {
  if ( !canvas?.ready ) return;
  for ( const token of canvas.tokens.placeables ) {
    if ( token.dbuHeightMarker ) token.dbuHeightMarker.dbuKey = null;
    refreshHeightMarker(token);
    if ( !tokenHeight(token.document).value && token.tooltip ) token.tooltip.visible = !token.document.isSecret;
  }
}

/* -------------------------------------------- */
/*  Token HUD                                   */
/* -------------------------------------------- */

function onRenderTokenHUD(hud, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const token = hud.object;
  const left = root?.querySelector(".col.left");
  if ( !left || !token?.document?.isOwner ) return;
  const h = tokenHeight(token.document);
  const now = heightText(h);
  const unit = L(h.mode === "flight" ? "DBU.Altitude.HUDFlight" : "DBU.Altitude.HUDLevels");
  const make = (dir, icon) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `control-icon dbu-height-${dir}`;
    b.dataset.tooltip = `${L(`DBU.Altitude.HUD.${dir}`, { unit })}<br>${now}`;
    b.innerHTML = `<i class="fa-solid ${icon}" inert></i>`;
    b.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const step = (event.shiftKey && (h.mode === "flight")) ? 5 : 1;
      await stepHeight(token, dir === "up" ? step : -step);
      hud.render();
    });
    return b;
  };
  const anchor = left.querySelector(".attribute.elevation");
  const up = make("up", "fa-angles-up");
  const down = make("down", "fa-angles-down");
  if ( anchor ) anchor.after(up, down);
  else left.prepend(up, down);
}

/** Wire the canvas and HUD hooks. */
export function registerHeight() {
  Hooks.on("drawToken", token => refreshHeightMarker(token));
  Hooks.on("refreshToken", token => refreshHeightMarker(token));
  // The marker shows where the token is going, without waiting for the movement animation
  Hooks.on("updateToken", (doc, changes) => {
    if ( ("elevation" in changes) && doc.object ) refreshHeightMarker(doc.object);
  });
  Hooks.on("canvasReady", () => refreshAllHeightMarkers());
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
}
