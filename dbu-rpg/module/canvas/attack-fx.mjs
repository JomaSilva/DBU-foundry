/**
 * Attack effects on the canvas: when an attack card is posted, every client draws the effect of its Profile from the
 * attacker's token to its targets (a punch, an orb, a beam, a cone, a spinning disk, lightning...). Basic Attacks use
 * the Profile's simple effect in the colours of their Foundation or Element; a Signature Technique sets its own colours,
 * shape and size on its sheet, and may add lightning, a spiral, sparks, a shockwave, a charge-up and a tremor.
 */

/* -------------------------------------------- */
/*  What each attack looks like                 */
/* -------------------------------------------- */

/** Colours [main, core] by Foundation, and by Element for the Elemental Profiles. */
const FOUNDATION_COLORS = {
  physical: ["#ffa630", "#fff6d8"],
  energy: ["#4fc3ff", "#ffffff"],
  magic: ["#b45cff", "#ffe0ff"]
};
const ELEMENT_COLORS = {
  elementalDark: ["#7a2bd6", "#e9c2ff"], elementalEarth: ["#b07a43", "#f0d9a8"], elementalFire: ["#ff6a1a", "#ffe066"],
  elementalIce: ["#7fe8ff", "#ffffff"], elementalLight: ["#fff3a0", "#ffffff"], elementalLightning: ["#ffe14d", "#ffffff"],
  elementalMetal: ["#aab8c2", "#ffffff"], elementalPlantlife: ["#3fbf4f", "#c8ff9e"], elementalPoison: ["#9bd94f", "#d68cff"],
  elementalWater: ["#2f8dff", "#c4e8ff"], elementalWind: ["#bff5e4", "#ffffff"]
};
/** Colours of the Profiles that come from Transformations and Races. */
const PROFILE_COLORS = {
  barrierBlow: ["#5fd3ff", "#eafcff"], gravityCage: ["#4b1f7a", "#c79bff"], glass: ["#9fe6ff", "#ffffff"],
  time: ["#d8b44a", "#fff4c2"], destruction: ["#8f2bd9", "#ff8cff"]
};

/** The simple effect of each Profile (Simple depends on the Foundation). */
const PROFILE_SHAPES = {
  simple: { physical: "punch", energy: "orb", magic: "orb" },
  combination: "combo", launching: "launch", megaFlare: "bigOrb", blitz: "dash", crushing: "heavy", pinpoint: "pinpoint",
  powered: "powered", soaring: "crescent", sweeping: "sweep", beam: "beam", blast: "cone", clearing: "explosion",
  concentrated: "thinBeam", cutting: "disk", wave: "wave",
  elementalDark: "orb", elementalEarth: "shards", elementalFire: "explosion", elementalIce: "shards", elementalLight: "orb",
  elementalLightning: "bolt", elementalMetal: "shards", elementalPlantlife: "vines", elementalPoison: "orb",
  elementalWater: "wave", elementalWind: "swirl",
  barrierBlow: { physical: "heavy", energy: "explosion", magic: "explosion" }, gravityCage: "swirl", glass: "shards",
  time: "wave", destruction: "bigOrb"
};

/** Shapes a Signature Technique may pick ("auto": its Profile's). */
export const FX_SHAPES = ["auto", "orb", "bigOrb", "beam", "thinBeam", "cone", "explosion", "disk", "wave", "bolt", "shards",
  "barrage", "punch", "combo", "dash", "sweep", "vines", "swirl"];
export const FX_SIZES = { small: 0.75, normal: 1, big: 1.4, huge: 1.9 };
const EXTRAS = ["lightning", "spiral", "sparks", "shockwave", "charge", "shake"];
export const FX_EXTRAS = EXTRAS;

/** The Profile's own shape and colours (what "auto" stands for). */
export function profileLook(profiles = [], foundation = "energy") {
  const main = profiles[0];
  const element = profiles.find(k => ELEMENT_COLORS[k]);
  const special = profiles.find(k => PROFILE_COLORS[k]);
  const def = PROFILE_SHAPES[main];
  const shape = ((typeof def === "object") ? def[foundation] : def) ?? "orb";
  const [color, color2] = ELEMENT_COLORS[element] ?? PROFILE_COLORS[special] ?? FOUNDATION_COLORS[foundation] ?? FOUNDATION_COLORS.energy;
  return { shape, color, color2 };
}

/**
 * What an attack card carries for every client to draw.
 * @param {object} o
 * @param {string|null} o.from       The attacker's token UUID
 * @param {string[]} o.profiles      The attack's Profiles
 * @param {string} o.foundation
 * @param {object} [o.vfx]           A Signature Technique's choices (system.vfx); none for Basic Attacks
 */
export function attackFxData({ from = null, profiles = [], foundation = "energy", vfx = null, aoe = "", category = 1,
  charges = 0, crit = false, botch = false }) {
  const look = profileLook(profiles, foundation);
  const custom = !!vfx;
  const shape = (custom && FX_SHAPES.includes(vfx.shape) && (vfx.shape !== "auto")) ? vfx.shape : look.shape;
  const scale = (FX_SIZES[vfx?.size] ?? 1) * (1 + (0.15 * (Math.clamp(category || 1, 1, 3) - 1)))
    * (1 + Math.min(0.5, 0.06 * (charges || 0)));
  const extras = {};
  if ( custom ) for ( const k of EXTRAS ) extras[k] = !!vfx[k];
  return {
    from, shape, aoe: aoe || "", crit: !!crit, botch: !!botch, scale: Math.round(scale * 100) / 100, custom,
    color: (custom && vfx.color) || look.color, color2: (custom && vfx.color2) || look.color2, extras
  };
}

/* -------------------------------------------- */
/*  Engine                                      */
/* -------------------------------------------- */

let layer = null;
const EFFECTS = new Set();
let ticking = false;
let quake = null;

function enabled() {
  try { return game.settings.get("dbu-rpg", "attackFx") !== false; } catch(err) { return true; }
}

function getLayer() {
  if ( !canvas?.ready || !canvas.interface ) return null;
  if ( !layer || layer.destroyed || (layer.parent !== canvas.interface) ) {
    layer = new PIXI.Container();
    layer.eventMode = "none";
    layer.zIndex = 1000;
    canvas.interface.addChild(layer);
  }
  return layer;
}

/**
 * Draw draw(g, p, elapsed) for `duration` ms after `delay` ms (p goes from 0 to 1). Normal blending keeps the colours
 * visible on light maps too (additive glows vanish on them).
 */
function spawn(draw, { delay = 0, duration = 600, blend = "normal" } = {}) {
  const parent = getLayer();
  if ( !parent ) return;
  const g = new PIXI.Graphics();
  g.blendMode = (blend === "add") ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL;
  g.eventMode = "none";
  g.visible = false;
  parent.addChild(g);
  const entry = { g, draw, delay, duration, t: 0 };
  EFFECTS.add(entry);
  startTicker();
  return entry;
}

/** End a drawing that has no end of its own (duration Infinity). */
function stop(entry) {
  if ( entry ) entry.duration = 0;
}

function startTicker() {
  if ( ticking || !canvas?.app ) return;
  canvas.app.ticker.add(tick);
  ticking = true;
}

function stopTicker() {
  if ( !ticking ) return;
  canvas?.app?.ticker.remove(tick);
  ticking = false;
}

function tick() {
  const dt = canvas.app.ticker.deltaMS;
  for ( const e of EFFECTS ) {
    if ( e.g.destroyed ) {
      EFFECTS.delete(e);
      continue;
    }
    e.t += dt;
    if ( e.t < e.delay ) continue;
    const elapsed = e.t - e.delay;
    const p = Math.min(1, elapsed / e.duration);
    e.g.visible = true;
    e.g.clear();
    try { e.draw(e.g, p, elapsed); }
    catch(err) { console.error(err); e.duration = 0; }
    if ( elapsed >= e.duration ) {
      e.g.destroy();
      EFFECTS.delete(e);
    }
  }
  if ( quake ) {
    const left = quake.until - performance.now();
    if ( left <= 0 ) {
      canvas.stage.position.set(quake.base.x, quake.base.y);
      quake = null;
    }
    else {
      const a = quake.amp * Math.min(1, left / 320);
      canvas.stage.position.set(quake.base.x + ((Math.random() - 0.5) * 2 * a), quake.base.y + ((Math.random() - 0.5) * 2 * a));
    }
  }
  if ( !EFFECTS.size && !quake ) stopTicker();
}

function clearAll() {
  for ( const e of EFFECTS ) if ( !e.g.destroyed ) e.g.destroy();
  EFFECTS.clear();
  if ( quake && canvas?.stage ) canvas.stage.position.set(quake.base.x, quake.base.y);
  quake = null;
  stopTicker();
  layer = null;
}

/* -------------------------------------------- */
/*  Drawing helpers                             */
/* -------------------------------------------- */

const U = () => canvas.grid?.size ?? 100;
const num = hex => Number(foundry.utils.Color.from(hex || "#ffffff"));
const WHITE = 0xffffff;
const lerp = (a, b, t) => a + ((b - a) * t);
const ease = t => 1 - ((1 - t) ** 2);
const along = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const jitter = (p, r) => ({ x: p.x + ((Math.random() - 0.5) * 2 * r), y: p.y + ((Math.random() - 0.5) * 2 * r) });
/** Travel time at `speed` Squares per second, between 180 ms and 900 ms. */
const travel = (a, b, speed) => Math.clamp((dist(a, b) / (speed * U())) * 1000, 180, 900);

function glowCircle(g, x, y, r, color, core, alpha = 1) {
  g.beginFill(color, 0.16 * alpha); g.drawCircle(x, y, r * 1.9); g.endFill();
  g.beginFill(color, 0.5 * alpha); g.drawCircle(x, y, r * 1.25); g.endFill();
  g.beginFill(core, 0.95 * alpha); g.drawCircle(x, y, r * 0.7); g.endFill();
}

function stroke(g, pts, width, color, alpha) {
  if ( pts.length < 2 ) return;
  g.lineStyle({ width, color, alpha, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
  g.moveTo(pts[0].x, pts[0].y);
  for ( const p of pts.slice(1) ) g.lineTo(p.x, p.y);
  g.lineStyle(0);
}

/** Wide faint glow, coloured body, bright core. */
function glowLine(g, pts, width, color, core, alpha = 1) {
  stroke(g, pts, width * 2.6, color, 0.2 * alpha);
  stroke(g, pts, width, color, 0.8 * alpha);
  stroke(g, pts, Math.max(1, width * 0.38), core, alpha);
}

/** A jagged line from a to b (lightning), widest in the middle. */
function jaggedPath(a, b, segments, amp) {
  const pts = [a];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for ( let i = 1; i < segments; i++ ) {
    const t = i / segments;
    const off = (Math.random() - 0.5) * 2 * amp * Math.sin(Math.PI * t);
    pts.push({ x: a.x + (dx * t) + (nx * off), y: a.y + (dy * t) + (ny * off) });
  }
  pts.push(b);
  return pts;
}

function arcPath(g, c, r, a0, a1) {
  g.moveTo(c.x + (Math.cos(a0) * r), c.y + (Math.sin(a0) * r));
  g.arc(c.x, c.y, r, a0, a1);
}

/* -------------------------------------------- */
/*  Pieces                                      */
/* -------------------------------------------- */

/** The hit: a flash and a ring, plus the Signature's sparks, shockwave, lightning and tremor (crits spark too). */
function impact(at, fx, { delay = 0, size = 1 } = {}) {
  const R = U() * 0.42 * fx.scale * size * (fx.crit ? 1.35 : 1) * (fx.botch ? 0.7 : 1);
  const c = num(fx.color);
  const k = num(fx.color2);
  spawn((g, p) => {
    const a = 1 - p;
    g.beginFill(k, 0.9 * a * a); g.drawCircle(at.x, at.y, R * (0.4 + (0.5 * ease(p)))); g.endFill();
    g.beginFill(c, 0.35 * a); g.drawCircle(at.x, at.y, R * (0.7 + (0.6 * ease(p)))); g.endFill();
    g.lineStyle({ width: Math.max(2, R * 0.14 * a), color: c, alpha: 0.85 * a });
    g.drawCircle(at.x, at.y, R * (0.5 + (1.1 * ease(p))));
    g.lineStyle(0);
  }, { delay, duration: 420 });
  if ( fx.extras.sparks || fx.crit ) sparks(at, fx, { delay, count: fx.crit ? 14 : 10, size });
  if ( fx.extras.shockwave ) shockwave(at, fx, { delay, size });
  if ( fx.extras.lightning ) boltsAround(at, fx, { delay, size });
  if ( fx.extras.shake ) shake(fx, delay);
}

function sparks(at, fx, { delay = 0, count = 10, size = 1 } = {}) {
  const R = U() * 0.9 * fx.scale * size;
  const parts = Array.from({ length: count }, () => ({ ang: Math.random() * Math.PI * 2, sp: 0.5 + (Math.random() * 0.7) }));
  const c = num(fx.color2);
  const k = num(fx.color);
  spawn((g, p) => {
    for ( const s of parts ) {
      const r0 = R * s.sp * ease(p);
      const r1 = r0 + (R * 0.2 * (1 - p));
      g.lineStyle({ width: (3 * fx.scale * (1 - p)) + 0.5, color: (p < 0.4) ? c : k, alpha: 1 - p, cap: PIXI.LINE_CAP.ROUND });
      g.moveTo(at.x + (Math.cos(s.ang) * r0), at.y + (Math.sin(s.ang) * r0));
      g.lineTo(at.x + (Math.cos(s.ang) * r1), at.y + (Math.sin(s.ang) * r1));
    }
    g.lineStyle(0);
  }, { delay, duration: 520 });
}

function shockwave(at, fx, { delay = 0, size = 1 } = {}) {
  const R = U() * 1.6 * fx.scale * size;
  const c = num(fx.color);
  const k = num(fx.color2);
  spawn((g, p) => {
    const a = 1 - p;
    g.lineStyle({ width: (U() * 0.12 * a) + 1, color: c, alpha: 0.7 * a });
    g.drawCircle(at.x, at.y, R * ease(p));
    g.lineStyle({ width: (U() * 0.05 * a) + 1, color: k, alpha: 0.6 * a });
    g.drawCircle(at.x, at.y, R * 0.75 * ease(p));
    g.lineStyle(0);
  }, { delay: delay + 40, duration: 650 });
}

/** Lightning crackling around a point. */
function boltsAround(at, fx, { delay = 0, size = 1, duration = 420 } = {}) {
  const R = U() * 0.85 * fx.scale * size;
  const c = num(fx.color2);
  let bolts = [];
  let next = 0;
  spawn((g, p, el) => {
    if ( el >= next ) {
      bolts = Array.from({ length: 3 }, () => {
        const a0 = Math.random() * Math.PI * 2;
        const a1 = a0 + ((Math.random() - 0.5) * 2);
        return jaggedPath({ x: at.x + (Math.cos(a0) * R * 0.25), y: at.y + (Math.sin(a0) * R * 0.25) },
          { x: at.x + (Math.cos(a1) * R), y: at.y + (Math.sin(a1) * R) }, 5, R * 0.25);
      });
      next = el + 70;
    }
    for ( const b of bolts ) glowLine(g, b, 2.2 * fx.scale, c, WHITE, 1 - (p * 0.6));
  }, { delay, duration });
}

function shake(fx, delay) {
  const amp = 3 + (4 * fx.scale);
  setTimeout(() => {
    if ( !canvas?.ready ) return;
    const until = performance.now() + 320;
    if ( quake ) {
      quake.until = Math.max(quake.until, until);
      quake.amp = Math.max(quake.amp, amp);
    }
    else quake = { base: { x: canvas.stage.position.x, y: canvas.stage.position.y }, until, amp };
    startTicker();
  }, delay);
}

/** Energy gathering at the attacker before the attack leaves (Signature "charge"). Returns its length. */
function charge(at, fx) {
  const R = U() * 0.7 * fx.scale;
  const c = num(fx.color);
  const k = num(fx.color2);
  spawn((g, p) => {
    glowCircle(g, at.x, at.y, R * (0.15 + (0.35 * p)), c, k, 0.4 + (0.6 * p));
    for ( let i = 0; i < 10; i++ ) {
      const ang = (i * Math.PI / 5) + (p * 2.5);
      const rr = R * 1.7 * (1 - p);
      g.beginFill(k, 0.3 + (0.7 * p)); g.drawCircle(at.x + (Math.cos(ang) * rr), at.y + (Math.sin(ang) * rr), 1.5 + (2 * fx.scale)); g.endFill();
    }
    if ( fx.extras.lightning && (Math.random() < 0.5) ) {
      const a0 = Math.random() * Math.PI * 2;
      glowLine(g, jaggedPath(at, { x: at.x + (Math.cos(a0) * R * 1.2), y: at.y + (Math.sin(a0) * R * 1.2) }, 4, R * 0.2),
        1.8 * fx.scale, k, WHITE, p);
    }
  }, { duration: 650 });
  return 650;
}

/** A glowing ball that flies from a to b with a trail. Returns its travel time. */
function projectile(from, to, fx, delay, { radius = 0.16, speed = 12, spiral = false } = {}) {
  const dur = travel(from, to, speed);
  const R = U() * radius * fx.scale;
  const c = num(fx.color);
  const k = num(fx.color2);
  const dir = angle(from, to);
  const nx = Math.cos(dir + (Math.PI / 2));
  const ny = Math.sin(dir + (Math.PI / 2));
  spawn((g, p, el) => {
    const q = ease(p);
    const pos = along(from, to, q);
    for ( let i = 1; i <= 5; i++ ) {
      const tp = along(from, to, Math.max(0, q - (i * 0.045)));
      g.beginFill(c, 0.16 * (1 - (i / 6))); g.drawCircle(tp.x, tp.y, R * (1 - (i * 0.12))); g.endFill();
    }
    glowCircle(g, pos.x, pos.y, R * (1 + (0.08 * Math.sin(el / 40))), c, k);
    if ( spiral || fx.extras.spiral ) {
      for ( const phase of [0, Math.PI] ) {
        const off = Math.sin((el / 55) + phase) * R * 1.8;
        g.beginFill(k, 0.9); g.drawCircle(pos.x + (nx * off), pos.y + (ny * off), Math.max(1.5, R * 0.28)); g.endFill();
      }
    }
    if ( fx.extras.lightning && (Math.random() < 0.6) ) {
      const a0 = Math.random() * Math.PI * 2;
      glowLine(g, jaggedPath(pos, { x: pos.x + (Math.cos(a0) * R * 2.4), y: pos.y + (Math.sin(a0) * R * 2.4) }, 4, R * 0.5),
        1.6 * fx.scale, k, WHITE, 0.9);
    }
  }, { delay, duration: dur });
  return dur;
}

/** Two strands twisting around a line (Signature "spiral"). */
function spiralStrands(g, a, b, w, el, color, alpha) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const n = Math.max(8, Math.floor(len / 10));
  for ( const phase of [0, Math.PI] ) {
    const pts = [];
    for ( let i = 0; i <= n; i++ ) {
      const t = i / n;
      const off = Math.sin(((t * len) / (w * 2.2)) - (el / 70) + phase) * w * 1.15;
      pts.push({ x: a.x + (dx * t) + (nx * off), y: a.y + (dy * t) + (ny * off) });
    }
    stroke(g, pts, Math.max(1.5, w * 0.2), color, 0.85 * alpha);
  }
}

/** A beam that reaches the target, holds and fades. Returns when it reaches the target. */
function beam(from, to, fx, delay, { width = 0.3, duration = 900 } = {}) {
  const W = U() * width * fx.scale;
  const c = num(fx.color);
  const k = num(fx.color2);
  const grow = 0.18;
  let bolts = [];
  let next = 0;
  spawn((g, p, el) => {
    const end = along(from, to, ease(Math.min(1, p / grow)));
    const fade = (p > 0.72) ? 1 - ((p - 0.72) / 0.28) : 1;
    const w = W * (0.85 + (0.15 * Math.sin(el / 30))) * fade;
    glowLine(g, [from, end], w, c, k, fade);
    glowCircle(g, from.x, from.y, w * 0.9, c, k, fade);
    glowCircle(g, end.x, end.y, w * 1.1, c, k, fade);
    if ( fx.extras.spiral ) spiralStrands(g, from, end, w, el, k, fade);
    if ( fx.extras.lightning ) {
      if ( el >= next ) {
        bolts = [jaggedPath(from, end, 12, w * 1.7), jaggedPath(from, end, 10, w * 1.3)];
        next = el + 60;
      }
      for ( const b of bolts ) glowLine(g, b, Math.max(1.5, w * 0.14), k, WHITE, fade);
    }
  }, { delay, duration });
  return duration * grow;
}

function wedge(g, o, dir, half, r, color, alpha) {
  g.beginFill(color, alpha);
  g.moveTo(o.x, o.y);
  g.arc(o.x, o.y, r, dir - half, dir + half);
  g.lineTo(o.x, o.y);
  g.endFill();
}

/** A cone of energy opening towards the target. */
function cone(from, to, fx, delay) {
  const dir = angle(from, to);
  const R = Math.max(dist(from, to) + (U() * 0.6), U() * 3) * Math.min(1.5, fx.scale);
  const c = num(fx.color);
  const k = num(fx.color2);
  spawn((g, p) => {
    const r = R * ease(Math.min(1, p / 0.45));
    const a = (p < 0.45) ? 1 : 1 - ((p - 0.45) / 0.55);
    wedge(g, from, dir, Math.PI / 6, r, c, 0.16 * a);
    wedge(g, from, dir, Math.PI / 8, r * 0.95, c, 0.2 * a);
    wedge(g, from, dir, Math.PI / 14, r * 0.85, k, 0.3 * a);
    if ( fx.extras.lightning && (Math.random() < 0.7) ) {
      const d0 = dir + ((Math.random() - 0.5) * (Math.PI / 3));
      glowLine(g, jaggedPath(from, { x: from.x + (Math.cos(d0) * r), y: from.y + (Math.sin(d0) * r) }, 8, U() * 0.2),
        2 * fx.scale, k, WHITE, a);
    }
  }, { delay, duration: 800 });
  return 360;
}

/** A thin spinning disk (Cutting). */
function disk(from, to, fx, delay) {
  const dur = travel(from, to, 10);
  const R = U() * 0.3 * fx.scale;
  const c = num(fx.color);
  const k = num(fx.color2);
  spawn((g, p, el) => {
    const pos = along(from, to, ease(p));
    g.lineStyle({ width: R * 0.3, color: c, alpha: 0.45 }); g.drawEllipse(pos.x, pos.y, R, R * 0.35);
    g.lineStyle({ width: Math.max(1.5, R * 0.1), color: k, alpha: 1 }); g.drawEllipse(pos.x, pos.y, R * 0.92, R * 0.3);
    g.lineStyle(0);
    for ( let i = 0; i < 3; i++ ) {
      const a = (el / 25) + (i * 2.094);
      g.beginFill(k, 0.9); g.drawCircle(pos.x + (Math.cos(a) * R * 0.95), pos.y + (Math.sin(a) * R * 0.33), Math.max(1.5, R * 0.09)); g.endFill();
    }
  }, { delay, duration: dur });
  return dur;
}

/** Two crossing cuts. */
function slash(at, fx, delay) {
  const R = U() * 0.45 * fx.scale;
  const c = num(fx.color);
  const k = num(fx.color2);
  spawn((g, p) => {
    const a = 1 - p;
    const r = R * ease(Math.min(1, p / 0.3));
    for ( const d of [Math.PI / 4, -Math.PI / 4] ) {
      const pts = [{ x: at.x - (Math.cos(d) * r), y: at.y - (Math.sin(d) * r) }, { x: at.x + (Math.cos(d) * r), y: at.y + (Math.sin(d) * r) }];
      glowLine(g, pts, 3 * fx.scale * a + 1, c, k, a);
    }
  }, { delay, duration: 360 });
}

/** A crescent wave flying towards the target (Wave, Soaring, Water). */
function wave(from, to, fx, delay, { width = 1.1 } = {}) {
  const dur = travel(from, to, 11);
  const dir = angle(from, to);
  const span = U() * width * fx.scale;
  const c = num(fx.color);
  const k = num(fx.color2);
  spawn((g, p) => {
    const pos = along(from, to, ease(p));
    const r = span * 0.6;
    const back = { x: pos.x - (Math.cos(dir) * r), y: pos.y - (Math.sin(dir) * r) };
    const a = 1 - (p * 0.3);
    g.lineStyle({ width: span * 0.32, color: c, alpha: 0.35 * a }); arcPath(g, back, r, dir - 1, dir + 1);
    g.lineStyle({ width: Math.max(2, span * 0.1), color: k, alpha: 0.9 * a }); arcPath(g, back, r, dir - 0.9, dir + 0.9);
    g.lineStyle(0);
  }, { delay, duration: dur });
  return dur;
}

/** Lightning from the attacker to the target. */
function bolt(from, to, fx, delay) {
  const c = num(fx.color);
  const k = num(fx.color2);
  let paths = [];
  let next = 0;
  spawn((g, p, el) => {
    if ( el >= next ) {
      paths = [jaggedPath(from, to, 14, U() * 0.45)];
      if ( Math.random() < 0.7 ) {
        const mid = paths[0][Math.floor(paths[0].length / 2)];
        paths.push(jaggedPath(mid, jitter(to, U() * 0.7), 6, U() * 0.25));
      }
      next = el + 55;
    }
    for ( const path of paths ) glowLine(g, path, 5 * fx.scale, c, k, 1 - (p * 0.5));
  }, { delay, duration: 520 });
  return 60;
}

/** Small pointed pieces flying in a row (Earth, Ice, Metal). */
function shard(from, to, fx, delay) {
  const dur = travel(from, to, 13);
  const dir = angle(from, to);
  const R = U() * 0.17 * fx.scale;
  const c = num(fx.color);
  const k = num(fx.color2);
  spawn((g, p) => {
    const pos = along(from, to, ease(p));
    const tip ={ x: pos.x + (Math.cos(dir) * R * 1.6), y: pos.y + (Math.sin(dir) * R * 1.6) };
    const l = { x: pos.x + (Math.cos(dir + 2.5) * R), y: pos.y + (Math.sin(dir + 2.5) * R) };
    const r = { x: pos.x + (Math.cos(dir - 2.5) * R), y: pos.y + (Math.sin(dir - 2.5) * R) };
    g.lineStyle({ width: 1.5, color: k, alpha: 0.9 });
    g.beginFill(c, 0.95); g.drawPolygon([tip.x, tip.y, l.x, l.y, r.x, r.y]); g.endFill();
    g.lineStyle(0);
  }, { delay, duration: dur, blend: "normal" });
  return dur;
}

/** A ring sweeping out from the attacker (Sweeping). */
function sweepRing(at, fx, delay) {
  const R = U() * 1.5 * fx.scale;
  const c = num(fx.color);
  const k = num(fx.color2);
  spawn((g, p) => {
    const a = 1 - p;
    const r = R * ease(p);
    g.lineStyle({ width: (U() * 0.18 * a) + 1, color: c, alpha: 0.55 * a }); g.drawCircle(at.x, at.y, r);
    g.lineStyle({ width: (U() * 0.06 * a) + 1, color: k, alpha: 0.9 * a }); arcPath(g, at, r * 0.95, p * 6, (p * 6) + 2.2);
    g.lineStyle(0);
  }, { delay, duration: 560 });
}

/** Speed lines rushing at the target (punches and kicks). */
function speedLines(from, to, fx, delay, { duration = 160, count = 3 } = {}) {
  const dir = angle(from, to);
  const c = num(fx.color2);
  const lines = Array.from({ length: count }, () => ({ off: (Math.random() - 0.5) * U() * 0.5, len: U() * (0.4 + (Math.random() * 0.4)) }));
  spawn((g, p) => {
    for ( const l of lines ) {
      const base = { x: to.x - (Math.cos(dir) * U() * (1.1 - p)) + (Math.cos(dir + (Math.PI / 2)) * l.off),
        y: to.y - (Math.sin(dir) * U() * (1.1 - p)) + (Math.sin(dir + (Math.PI / 2)) * l.off) };
      const tail = { x: base.x - (Math.cos(dir) * l.len), y: base.y - (Math.sin(dir) * l.len) };
      stroke(g, [tail, base], 2 * fx.scale, c, 0.8 * (1 - (p * 0.5)));
    }
  }, { delay, duration });
}

/** Streaks along the whole path (Blitz charge, Launching). */
function dashLines(from, to, fx, delay, { duration = 260 } = {}) {
  const dir = angle(from, to);
  const c = num(fx.color);
  const k = num(fx.color2);
  const offs = [-0.22, 0, 0.22].map(o => o * U());
  spawn((g, p) => {
    const a = 1 - p;
    for ( const o of offs ) {
      const shift = { x: Math.cos(dir + (Math.PI / 2)) * o, y: Math.sin(dir + (Math.PI / 2)) * o };
      const head = along(from, to, ease(Math.min(1, p / 0.5)));
      stroke(g, [{ x: from.x + shift.x, y: from.y + shift.y }, { x: head.x + shift.x, y: head.y + shift.y }], 3 * fx.scale * a + 1, o ? c : k, 0.7 * a);
    }
  }, { delay, duration });
}

/** A four-point star (Pinpoint). */
function star(at, fx, delay) {
  const R = U() * 0.45 * fx.scale;
  const c = num(fx.color);
  const k = num(fx.color2);
  spawn((g, p) => {
    const a = 1 - p;
    const r = R * (0.5 + (0.5 * ease(p)));
    const w = r * 0.18;
    g.beginFill(k, a);
    g.drawPolygon([at.x, at.y - r, at.x + w, at.y - w, at.x + r, at.y, at.x + w, at.y + w, at.x, at.y + r, at.x - w, at.y + w, at.x - r, at.y, at.x - w, at.y - w]);
    g.endFill();
    g.beginFill(c, 0.4 * a); g.drawCircle(at.x, at.y, r * 0.35); g.endFill();
  }, { delay, duration: 380 });
}

/** Sinuous vines growing to the target (Plantlife). */
function vines(from, to, fx, delay) {
  const c = num(fx.color);
  const k = num(fx.color2);
  const len = dist(from, to);
  const dir = angle(from, to);
  const strands = [0, 1, 2].map(i => ({ phase: i * 2.1, amp: U() * (0.15 + (0.08 * i)) }));
  spawn((g, p, el) => {
    const reach = ease(Math.min(1, p / 0.6));
    const fade = (p > 0.75) ? 1 - ((p - 0.75) / 0.25) : 1;
    for ( const s of strands ) {
      const pts = [];
      const n = 18;
      for ( let i = 0; i <= n; i++ ) {
        const t = (i / n) * reach;
        const off = Math.sin((t * len / U() * 2.2) + s.phase + (el / 200)) * s.amp * Math.sin(Math.PI * Math.min(1, t * 1.2));
        pts.push({ x: from.x + (Math.cos(dir) * len * t) + (Math.cos(dir + (Math.PI / 2)) * off),
          y: from.y + (Math.sin(dir) * len * t) + (Math.sin(dir + (Math.PI / 2)) * off) });
      }
      stroke(g, pts, 4 * fx.scale, c, 0.9 * fade);
      stroke(g, pts, 1.5 * fx.scale, k, 0.8 * fade);
    }
  }, { delay, duration: 800, blend: "normal" });
  return 480;
}

/* -------------------------------------------- */
/*  Shapes                                      */
/* -------------------------------------------- */

/** shape(from, to, fx, delay): one target's effect, its impact included. */
const SHAPES = {
  punch(from, to, fx, d) {
    speedLines(from, to, fx, d);
    impact(to, fx, { delay: d + 110, size: 0.8 });
  },
  combo(from, to, fx, d) {
    speedLines(from, to, fx, d, { duration: 380, count: 5 });
    for ( let i = 0; i < 3; i++ ) impact(jitter(to, U() * 0.25), fx, { delay: d + 80 + (i * 130), size: 0.6 });
  },
  powered(from, to, fx, d) {
    speedLines(from, to, fx, d, { count: 4 });
    impact(to, fx, { delay: d + 110, size: 1.25 });
    shockwave(to, { ...fx, scale: fx.scale * 0.6 }, { delay: d + 110 });
  },
  heavy(from, to, fx, d) {
    speedLines(from, to, fx, d);
    impact(to, fx, { delay: d + 120, size: 1.5 });
    shockwave(to, { ...fx, scale: fx.scale * 0.7 }, { delay: d + 120 });
  },
  pinpoint(from, to, fx, d) {
    speedLines(from, to, fx, d, { count: 1 });
    star(to, fx, d + 100);
  },
  launch(from, to, fx, d) {
    impact(to, fx, { delay: d + 90 });
    const away = { x: to.x + (Math.cos(angle(from, to)) * U() * 2), y: to.y + (Math.sin(angle(from, to)) * U() * 2) };
    dashLines(to, away, fx, d + 140, { duration: 320 });
  },
  dash(from, to, fx, d) {
    dashLines(from, to, fx, d);
    impact(to, fx, { delay: d + 170, size: 0.9 });
  },
  sweep(from, to, fx, d) {
    sweepRing(from, fx, d);
    impact(to, fx, { delay: d + 200, size: 0.6 });
  },
  orb(from, to, fx, d) {
    impact(to, fx, { delay: d + projectile(from, to, fx, d) });
  },
  swirl(from, to, fx, d) {
    impact(to, fx, { delay: d + projectile(from, to, fx, d, { radius: 0.12, spiral: true }), size: 0.8 });
  },
  bigOrb(from, to, fx, d) {
    const t = projectile(from, to, fx, d, { radius: 0.32, speed: 8 });
    impact(to, fx, { delay: d + t, size: 1.8 });
    shockwave(to, fx, { delay: d + t, size: 1.1 });
  },
  explosion(from, to, fx, d) {
    const t = projectile(from, to, fx, d, { radius: 0.18 });
    impact(to, fx, { delay: d + t, size: 1.6 });
    shockwave(to, fx, { delay: d + t, size: 0.8 });
  },
  barrage(from, to, fx, d) {
    for ( let i = 0; i < 6; i++ ) {
      const end = jitter(to, U() * 0.45);
      const t = projectile(from, end, fx, d + (i * 90), { radius: 0.1, speed: 16 });
      impact(end, { ...fx, extras: (i === 5) ? fx.extras : {} }, { delay: d + (i * 90) + t, size: 0.5 });
    }
  },
  beam(from, to, fx, d) {
    impact(to, fx, { delay: d + beam(from, to, fx, d), size: 1.2 });
  },
  thinBeam(from, to, fx, d) {
    impact(to, fx, { delay: d + beam(from, to, fx, d, { width: 0.12, duration: 650 }), size: 0.7 });
  },
  cone(from, to, fx, d) {
    impact(to, fx, { delay: d + cone(from, to, fx, d), size: 0.8 });
  },
  disk(from, to, fx, d) {
    const t = disk(from, to, fx, d);
    slash(to, fx, d + t);
    if ( fx.extras.sparks || fx.extras.shockwave || fx.extras.lightning || fx.extras.shake || fx.crit ) impact(to, fx, { delay: d + t, size: 0.6 });
  },
  wave(from, to, fx, d) {
    impact(to, fx, { delay: d + wave(from, to, fx, d), size: 0.9 });
  },
  crescent(from, to, fx, d) {
    impact(to, fx, { delay: d + wave(from, to, fx, d, { width: 0.7 }), size: 0.7 });
  },
  bolt(from, to, fx, d) {
    impact(to, fx, { delay: d + bolt(from, to, fx, d), size: 0.8 });
  },
  shards(from, to, fx, d) {
    let t = 0;
    for ( let i = 0; i < 4; i++ ) t = shard(from, jitter(to, U() * 0.2), fx, d + (i * 70));
    impact(to, fx, { delay: d + (3 * 70) + t, size: 0.7 });
  },
  vines(from, to, fx, d) {
    impact(to, fx, { delay: d + vines(from, to, fx, d), size: 0.7 });
  }
};

/* -------------------------------------------- */
/*  Playing an attack                           */
/* -------------------------------------------- */

/** Centre of a token of the viewed scene, by UUID. */
function tokenCenter(uuid) {
  if ( !uuid ) return null;
  const doc = fromUuidSync(uuid);
  const token = doc?.object;
  if ( !token || (doc.parent !== canvas.scene) || token.destroyed ) return null;
  return { x: token.center.x, y: token.center.y };
}

/**
 * Draw an attack: a charge-up first if the Signature has it, then its shape towards each target (an AoE reaches at
 * most 8), or a burst at the attacker when nobody is targeted.
 * @param {object} fx           attackFxData()
 * @param {string[]} targets    Token UUIDs
 */
export function playAttackFx(fx, targets = []) {
  if ( !fx || !enabled() || !canvas?.ready ) return false;
  const from = tokenCenter(fx.from);
  if ( !from ) return false;
  const shape = SHAPES[fx.shape] ?? SHAPES.orb;
  const ends = targets.map(tokenCenter).filter(Boolean).slice(0, 8);
  const d = fx.extras?.charge ? charge(from, fx) : 0;
  if ( !ends.length ) {
    impact(from, { ...fx, extras: { ...fx.extras, shake: false } }, { delay: d, size: 0.7 });
    return true;
  }
  ends.forEach((to, i) => shape(from, to, fx, d + (i * 90)));
  return true;
}

/* -------------------------------------------- */
/*  Duel Maneuver: the two attacks clashing     */
/* -------------------------------------------- */

/** Duel card id → what is drawn for it. */
const DUELS = new Map();

/** Where the two attacks meet now (eased towards the Duel's point; 0 = at the attacker, 1 = at the defender). */
function duelPoint(s) {
  const A = tokenCenter(s.a.tokenUuid);
  const B = tokenCenter(s.b.tokenUuid);
  if ( !A || !B ) return null;
  return { A, B, M: along(A, B, s.shown) };
}

function drawDuel(g, s, el) {
  s.shown += (s.point - s.shown) * Math.min(1, (canvas.app.ticker.deltaMS ?? 16) / 180);
  const at = duelPoint(s);
  if ( !at ) return;
  const { A, B, M } = at;
  const fa = s.a.attack.fx;
  const fb = s.b.attack.fx;
  if ( s.physical ) {
    // Two Physical attacks colliding: rushes from both sides and flashes where they meet
    const pulse = (Math.sin(el / 55) + 1) / 2;
    for ( const [from, f] of [[A, fa], [B, fb]] ) {
      const dir = angle(from, M);
      for ( let i = 0; i < 2; i++ ) {
        const off = ((i ? 1 : -1) * U() * 0.15);
        const nx = Math.cos(dir + (Math.PI / 2)) * off;
        const ny = Math.sin(dir + (Math.PI / 2)) * off;
        const tip = { x: M.x - (Math.cos(dir) * U() * 0.2) + nx, y: M.y - (Math.sin(dir) * U() * 0.2) + ny };
        const tail = { x: tip.x - (Math.cos(dir) * U() * (0.5 + (0.3 * pulse))), y: tip.y - (Math.sin(dir) * U() * (0.5 + (0.3 * pulse))) };
        stroke(g, [tail, tip], 3 * f.scale, num(f.color), 0.85);
      }
    }
    glowCircle(g, M.x, M.y, U() * (0.14 + (0.1 * pulse)) * Math.max(fa.scale, fb.scale), num(fa.color), num(fb.color2), 0.9);
    return;
  }
  // Energy and Magic: two beams pushing against each other, a crackling ball where they meet
  const wa = U() * 0.24 * fa.scale * (0.9 + (0.1 * Math.sin(el / 35)));
  const wb = U() * 0.24 * fb.scale * (0.9 + (0.1 * Math.cos(el / 37)));
  glowLine(g, [A, M], wa, num(fa.color), num(fa.color2));
  glowLine(g, [B, M], wb, num(fb.color), num(fb.color2));
  if ( fa.extras?.spiral ) spiralStrands(g, A, M, wa, el, num(fa.color2), 1);
  if ( fb.extras?.spiral ) spiralStrands(g, B, M, wb, el, num(fb.color2), 1);
  glowCircle(g, A.x, A.y, wa * 0.9, num(fa.color), num(fa.color2));
  glowCircle(g, B.x, B.y, wb * 0.9, num(fb.color), num(fb.color2));
  const r = Math.max(wa, wb) * (1.5 + (0.3 * Math.sin(el / 50)));
  g.beginFill(num(fb.color), 0.3); g.drawCircle(M.x, M.y, r * 1.5); g.endFill();
  glowCircle(g, M.x, M.y, r, num(fa.color), WHITE, 0.95);
  if ( Math.random() < 0.6 ) {
    const a0 = Math.random() * Math.PI * 2;
    const col = num((Math.random() < 0.5) ? fa.color2 : fb.color2);
    glowLine(g, jaggedPath(M, { x: M.x + (Math.cos(a0) * r * 2.2), y: M.y + (Math.sin(a0) * r * 2.2) }, 4, r * 0.4), 2 * fa.scale, col, WHITE, 0.9);
  }
}

/** The Duel ends: the winner's beam goes through to the other (or, Physical, the winner's own attack), or a tie blows up. */
function endDuel(s, result) {
  const at = duelPoint(s);
  const finish = ms => setTimeout(() => {
    stop(s.entry);
    DUELS.delete(s.id);
  }, ms);
  if ( !at ) return finish(0);
  // Duel Escape: the attacks fizzle out
  if ( result === "escaped" ) {
    impact(at.M, { ...s.a.attack.fx, extras: {} }, { size: 0.8 });
    return finish(0);
  }
  if ( result === "tie" ) {
    const fx = { ...s.a.attack.fx, color2: s.b.attack.fx.color, extras: { sparks: true, shockwave: true } };
    impact(at.M, fx, { size: 2 });
    return finish(80);
  }
  const win = s[result];
  const lose = s[(result === "a") ? "b" : "a"];
  const from = (result === "a") ? at.A : at.B;
  const to = (result === "a") ? at.B : at.A;
  if ( s.physical ) {
    finish(0);
    (SHAPES[win.attack.fx.shape] ?? SHAPES.punch)(from, to, win.attack.fx, 120);
    return;
  }
  // The winner's beam goes all the way (the point moves to the other side), then hits
  impact(to, { ...win.attack.fx, extras: { ...win.attack.fx.extras, sparks: true, shockwave: true } }, { delay: 420, size: 1.5 });
  void lose;
  finish(560);
}

/** Draw a Duel from its card: started, a Duel Clash won (the meeting point moves), or ended. */
export function duelFx(id, duel) {
  if ( !duel || !enabled() || !canvas?.ready ) return;
  let s = DUELS.get(id);
  if ( !s ) {
    if ( duel.done ) return;
    s = { id, shown: 0.5, point: duel.point ?? 0.5, seen: 0, physical: !!duel.physical, a: duel.a, b: duel.b, ending: false };
    s.entry = spawn((g, p, el) => drawDuel(g, s, el), { duration: Infinity });
    DUELS.set(id, s);
  }
  s.point = duel.point ?? s.point;
  // Each new Duel Clash: a burst where the attacks meet, in the winner's colours
  const fresh = (duel.clashes ?? []).slice(s.seen);
  s.seen = duel.clashes?.length ?? 0;
  const at = duelPoint(s);
  for ( const c of fresh ) {
    if ( !at || (c.winner === "tie") ) continue;
    const fx = s[c.winner].attack.fx;
    impact(at.M, { ...fx, extras: { sparks: true } }, { size: 1.1 });
  }
  if ( duel.done && !s.ending ) {
    s.ending = true;
    endDuel(s, duel.result);
  }
}

/** Show a Signature Technique's effect on this client only, from its owner's token to the targeted tokens. */
export function previewSignatureFx(item) {
  const actor = item?.actor;
  const token = actor?.getActiveTokens?.()[0];
  if ( !token ) return ui.notifications.warn(game.i18n.localize("DBU.Fx.NoToken"));
  const s = item.system;
  const fx = attackFxData({ from: token.document.uuid, profiles: s.computed?.profiles ?? [s.profile], foundation: s.foundation,
    vfx: s.vfx, aoe: s.computed?.aoe, category: s.computed?.damageCategory ?? 1 });
  const targets = Array.from(game.user.targets ?? []).map(t => t.document.uuid);
  if ( !playAttackFx(fx, targets) ) ui.notifications.warn(game.i18n.localize("DBU.Fx.Off"));
}

/** Settings and hooks (from the init hook). */
export function registerAttackFx() {
  game.settings.register("dbu-rpg", "attackFx", {
    name: "DBU.Fx.Setting", hint: "DBU.Fx.SettingHint", scope: "client", config: true, type: Boolean, default: true
  });
  Hooks.on("createChatMessage", message => {
    const flags = message.flags?.["dbu-rpg"];
    try {
      if ( (flags?.kind === "attack") && flags.attack?.fx ) playAttackFx(flags.attack.fx, (flags.attack.targets ?? []).map(t => t.tokenUuid));
      if ( flags?.kind === "duel" ) duelFx(message.id, flags.duel);
    }
    catch(err) { console.error(err); }
  });
  // A Duel Maneuver's card changes with each Duel Clash
  Hooks.on("updateChatMessage", (message, changes) => {
    if ( !foundry.utils.hasProperty(changes, "flags.dbu-rpg.duel") ) return;
    try { duelFx(message.id, message.flags["dbu-rpg"].duel); }
    catch(err) { console.error(err); }
  });
  Hooks.on("deleteChatMessage", message => {
    const s = DUELS.get(message.id);
    if ( s ) { stop(s.entry); DUELS.delete(message.id); }
  });
  Hooks.on("canvasTearDown", () => {
    DUELS.clear();
    clearAll();
  });
}
