/**
 * Transformation auras around tokens: an animated outline/flame glow or a nebula drawn by a filter on the token art
 * (so it sits behind the art and follows its shape), plus crackling lightning drawn over the token (Super Saiyan 2/3).
 * Every client draws the auras of the tokens on its own canvas.
 */

/** Visual presets. */
export const AURA_PRESETS = {
  ssj: { style: "glow", color: "#ffd23f" },
  ssj2: { style: "lightning", color: "#ffd23f", color2: "#2f8dff", bolts: 3 },
  ssj3: { style: "lightning", color: "#ffc21a", color2: "#2f8dff", bolts: 6 },
  god: { style: "glow", color: "#ff3b2a" },
  blue: { style: "glow", color: "#35b6ff" },
  rose: { style: "glow", color: "#ff4fb0" },
  ui: { style: "nebula", color: "#f2f6ff", color2: "#6d8bff" },
  ue: { style: "nebula", color: "#a64dff", color2: "#ff4fd8" }
};

/** Transformations with an automatic aura, by name. */
const NAME_RULES = [
  [/^ultra ego\b/, "ue"],
  [/ultra instinct/, "ui"],
  [/super saiyan rose\b/, "rose"],
  [/super saiyan blue\b/, "blue"],
  [/super saiyan god$/, "god"],
  [/^super saiyan 3$/, "ssj3"],
  [/^super saiyan 2$/, "ssj2"],
  [/^super saiyan( 1)?$/, "ssj"]
];

const normalizeName = name => String(name ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[“”"'’]/g, "").replace(/\s+/g, " ").trim();

/** Preset key of the automatic aura for a Transformation name, or "". */
export function defaultAuraKey(name) {
  const n = normalizeName(name);
  return NAME_RULES.find(([re]) => re.test(n))?.[1] ?? "";
}

/** The aura a Transformation item shows while active ({style, color, color2, bolts}) or null. */
export function auraOf(item) {
  const a = item.system.aura ?? {};
  const style = a.style || "auto";
  if ( style === "none" ) return null;
  if ( style === "auto" ) {
    const preset = AURA_PRESETS[defaultAuraKey(item.name)];
    if ( !preset ) return null;
    return { bolts: 0, ...preset, color: a.color || preset.color, color2: a.color2 || preset.color2 || preset.color };
  }
  return {
    style, color: a.color || "#ffffff",
    color2: a.color2 || (style === "lightning" ? "#2f8dff" : "#7f6bff"),
    bolts: (style === "lightning") ? 3 : 0
  };
}

/** Auras of the active Transformations of an actor (at most two layers: Form and Enhancement). */
export function actorAuras(actor) {
  if ( !actor?.items ) return [];
  return actor.items.filter(i => (i.type === "transformation") && i.system.isActive)
    .map(auraOf).filter(Boolean).slice(0, 2);
}

/* -------------------------------------------- */
/*  Glow / nebula filter                        */
/* -------------------------------------------- */

const FRAGMENT = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
// Shared with PIXI's filter vertex shader: the precision must match it
uniform highp vec4 inputSize;
uniform highp vec4 outputFrame;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uTime;
uniform float uRadius;
uniform float uMode;
uniform float uStrength;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for ( int i = 0; i < 4; i++ ) {
    v += amp * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec4 base = texture2D(uSampler, vTextureCoord);

  // Distance to the token art, as a fraction of the aura radius (1.0 = nothing within reach)
  float nearest = 1.0;
  for ( int r = 1; r <= 5; r++ ) {
    float d = float(r) / 5.0;
    for ( int k = 0; k < 12; k++ ) {
      float ang = 6.2831853 * (float(k) + 0.5 * float(r)) / 12.0;
      vec2 off = vec2(cos(ang), sin(ang)) * (uRadius * d) * inputSize.zw;
      float a = texture2D(uSampler, vTextureCoord + off).a;
      if ( a > 0.4 ) nearest = min(nearest, d);
    }
  }

  // Position in the filtered area, centred, for the animation
  vec2 area = outputFrame.zw * inputSize.zw;
  vec2 c = vTextureCoord / area - 0.5;
  float ang = atan(c.y, c.x);
  float rad = length(c);
  float t = uTime;
  float g;
  vec3 col;

  if ( uMode < 0.5 ) {
    // Flame-like glow hugging the outline
    float flick = fbm(vec2(ang * 2.5 + 3.0, rad * 9.0 - t * 2.2));
    float halo = smoothstep(1.0, 0.0, nearest);
    float rim = smoothstep(0.35, 0.0, nearest);
    g = clamp(halo * (0.3 + 0.9 * flick) + rim * 0.55, 0.0, 1.0);
    col = mix(uColor, vec3(1.0), rim * 0.4);
  }
  else {
    // Nebula: slow drifting clouds of two colours, with a few sparkles
    float n1 = fbm(c * 5.0 + vec2(t * 0.12, -t * 0.08));
    float n2 = fbm(c * 9.0 - vec2(t * 0.05, t * 0.11) + n1);
    float halo = smoothstep(1.0, 0.05, nearest);
    g = clamp(halo * (0.25 + 2.8 * n1 * n2), 0.0, 1.0);
    col = mix(uColor, uColor2, smoothstep(0.3, 0.7, n2));
    float s = hash(floor(vTextureCoord / inputSize.zw / 3.0) + floor(t * 4.0));
    g = clamp(g + step(0.996, s) * halo, 0.0, 1.0);
  }

  g *= uStrength * (1.0 - base.a);
  gl_FragColor = base + vec4(col * g, g);
}
`;

class TokenAuraFilter extends PIXI.Filter {
  constructor(aura) {
    super(undefined, FRAGMENT, {
      uColor: [1, 1, 1], uColor2: [1, 1, 1], uTime: Math.random() * 100, uRadius: 12, uMode: 0, uStrength: 1
    });
    this.configure(aura);
  }

  configure(aura) {
    this.uniforms.uColor = rgb(aura.color);
    this.uniforms.uColor2 = rgb(aura.color2 ?? aura.color);
    this.uniforms.uMode = (aura.style === "nebula") ? 1 : 0;
    this.radiusFactor = (aura.style === "nebula") ? 0.3 : 0.18;
  }
}

function rgb(hex) {
  const c = foundry.utils.Color.from(hex || "#ffffff");
  return [c.r, c.g, c.b];
}

/* -------------------------------------------- */
/*  Lightning                                   */
/* -------------------------------------------- */

function jagged(x, y, dir, segments, R, spread) {
  const points = [[x, y]];
  for ( let i = 0; i < segments; i++ ) {
    const len = R * (0.1 + (Math.random() * 0.12));
    dir += (Math.random() - 0.5) * spread;
    x += Math.cos(dir) * len;
    y += Math.sin(dir) * len;
    points.push([x, y]);
  }
  return points;
}

function newBolt(token) {
  const w = token.w;
  const h = token.h;
  const R = Math.max(w, h) / 2;
  const theta = Math.random() * Math.PI * 2;
  const r0 = R * (0.6 + (Math.random() * 0.4));
  const x = (w / 2) + (Math.cos(theta) * r0);
  const y = (h / 2) + (Math.sin(theta) * r0);
  // Roughly along the outline, sometimes leaping outwards
  const dir = theta + ((Math.random() < 0.5 ? 1 : -1) * Math.PI / 2) + ((Math.random() - 0.5) * 0.9);
  const main = jagged(x, y, dir, 4 + Math.floor(Math.random() * 4), R, 1.4);
  const paths = [main];
  // A short fork from the middle of some bolts
  if ( Math.random() < 0.45 ) {
    const [fx, fy] = main[Math.floor(main.length / 2)];
    paths.push(jagged(fx, fy, dir + ((Math.random() - 0.5) * 2.2), 2 + Math.floor(Math.random() * 2), R * 0.8, 1.6));
  }
  const life = 90 + (Math.random() * 130);
  return { paths, life, maxLife: life };
}

function drawBolts(state) {
  const g = state.bolts;
  if ( !g || g.destroyed ) return;
  g.clear();
  const k = Math.max(1, state.token.w / 100);
  // Coloured glow, coloured body and a lighter core of the same colour (blue for Super Saiyan 2/3)
  const strokes = [[8 * k, state.boltColor, 0.3], [3.4 * k, state.boltColor, 0.85], [1.3 * k, state.boltCore, 1]];
  for ( const b of state.boltList ) {
    // Flickers while it fades
    const a = Math.max(0, b.life / b.maxLife) * (0.65 + (Math.random() * 0.35));
    for ( const [width, color, alpha] of strokes ) {
      g.lineStyle({ width, color, alpha: alpha * a, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
      for ( const path of b.paths ) {
        g.moveTo(...path[0]);
        for ( const p of path.slice(1) ) g.lineTo(...p);
      }
    }
  }
}

/* -------------------------------------------- */
/*  Manager                                     */
/* -------------------------------------------- */

/** token placeable → { token, mesh, filters, bolts, boltList, boltRate, boltColor, boltCore, signature } */
const STATES = new Map();
let ticking = false;

function enabled() {
  try { return game.settings.get("dbu-rpg", "tokenAuras") !== false; } catch(err) { return true; }
}

function signatureOf(auras) {
  return JSON.stringify(auras);
}

/** Add, update or remove the aura of one token to match its actor's active Transformations. */
export function refreshTokenAura(token) {
  if ( !token || token.destroyed ) return;
  const auras = enabled() ? actorAuras(token.actor) : [];
  const state = STATES.get(token);
  const mesh = token.mesh;
  if ( !auras.length || !mesh || mesh.destroyed ) {
    if ( state ) removeTokenAura(token);
    return;
  }
  const signature = signatureOf(auras);
  // Same look and the filters are still on this mesh: nothing to do
  if ( state && (state.signature === signature) && (state.mesh === mesh)
    && state.filters.every(f => mesh.filters?.includes(f)) ) return;
  if ( state ) removeTokenAura(token);

  const filters = auras.map(a => new TokenAuraFilter(a));
  mesh.filters = [...(mesh.filters ?? []), ...filters];
  const lightning = auras.find(a => a.style === "lightning");
  let bolts = null;
  if ( lightning ) {
    bolts = token.addChild(new PIXI.Graphics());
    bolts.blendMode = PIXI.BLEND_MODES.ADD;
    bolts.eventMode = "none";
  }
  STATES.set(token, {
    token, mesh, filters, bolts, boltList: [], signature,
    boltRate: lightning?.bolts ?? 0,
    boltColor: Number(foundry.utils.Color.from(lightning?.color2 ?? "#2f8dff")),
    boltCore: Number(foundry.utils.Color.from(lightning?.color2 ?? "#2f8dff").mix(foundry.utils.Color.from("#ffffff"), 0.55))
  });
  startTicker();
}

export function removeTokenAura(token) {
  const state = STATES.get(token);
  if ( !state ) return;
  STATES.delete(token);
  const mesh = state.mesh;
  if ( mesh && !mesh.destroyed && mesh.filters ) mesh.filters = mesh.filters.filter(f => !state.filters.includes(f));
  for ( const f of state.filters ) f.destroy();
  if ( state.bolts && !state.bolts.destroyed ) state.bolts.destroy();
}

/** Refresh every token of an actor on the current canvas. */
export function refreshActorAuras(actor) {
  if ( !canvas?.ready || !actor ) return;
  // Linked and unlinked tokens of this actor (a token's own actor only has its token)
  for ( const token of actor.getActiveTokens() ) refreshTokenAura(token);
}

export function refreshAllAuras() {
  if ( !canvas?.ready ) return;
  for ( const token of canvas.tokens.placeables ) refreshTokenAura(token);
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
  if ( !STATES.size ) return stopTicker();
  const dt = canvas.app.ticker.deltaMS;
  const scale = canvas.stage.scale.x;
  const res = canvas.app.renderer.resolution;
  for ( const [token, s] of STATES ) {
    if ( token.destroyed || s.mesh.destroyed ) {
      removeTokenAura(token);
      continue;
    }
    for ( const f of s.filters ) {
      const r = token.w * f.radiusFactor * scale;
      f.resolution = res;
      f.padding = Math.ceil(r * 1.25) + 2;
      f.uniforms.uRadius = r * res;
      f.uniforms.uTime += dt / 1000;
    }
    if ( s.bolts ) {
      for ( const b of s.boltList ) b.life -= dt;
      s.boltList = s.boltList.filter(b => b.life > 0);
      // About boltRate new bolts every 300 ms
      if ( Math.random() < (s.boltRate * dt / 300) ) s.boltList.push(newBolt(token));
      drawBolts(s);
    }
  }
}

/** Wire the canvas hooks. */
export function registerTokenAuras() {
  Hooks.on("drawToken", token => refreshTokenAura(token));
  Hooks.on("refreshToken", token => {
    const s = STATES.get(token);
    // The art was rebuilt (new texture, size change...): put the aura back on the new mesh
    if ( s && (s.mesh !== token.mesh) ) refreshTokenAura(token);
  });
  Hooks.on("destroyToken", token => removeTokenAura(token));
  Hooks.on("canvasReady", () => refreshAllAuras());
  Hooks.on("canvasTearDown", () => {
    for ( const token of Array.from(STATES.keys()) ) removeTokenAura(token);
    stopTicker();
  });
  // Unlinked tokens copy their base actor's changes right after its hooks run: refresh once the update settles
  const pending = new Set();
  const onItem = item => {
    if ( (item.type !== "transformation") || !(item.parent instanceof Actor) ) return;
    pending.add(item.parent);
    if ( pending.size > 1 ) return;
    setTimeout(() => {
      for ( const actor of pending ) refreshActorAuras(actor);
      pending.clear();
    }, 0);
  };
  Hooks.on("createItem", onItem);
  Hooks.on("updateItem", onItem);
  Hooks.on("deleteItem", onItem);
}
