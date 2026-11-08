import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { emitGM } from "../socket.mjs";
import {
  DEEP_SPACE, HARDNESS_RANKS, SOAR_VERTICALITY, VERTICAL_LAUNCH, fallBonus, hardnessValue, verticalGap
} from "../rules/height.mjs";
import {
  actorTokens, elevationFor, footprint, heightMode, heightText, positionOf, rankLabel, setTokenHeight, tokenHeight, verticalBand
} from "../canvas/height.mjs";
import { addTimedCondition, addTimedModifier, encounterOf } from "./triggers.mjs";

const { DialogV2 } = foundry.applications.api;
const FDE = () => foundry.applications.ux.FormDataExtended;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const docOf = t => t?.document ?? t;

/* -------------------------------------------- */
/*  Who can fly                                 */
/* -------------------------------------------- */

const FLIGHT_ITEM = /^(dragon )?flight\b|jetpack|flight system/i;
const SOAR_ITEM = /^soar\b/i;

/** The Flight Unique Ability (also through a Jetpack or a Battle Jacket's Flight System): Verticality is kept. */
export function hasFlightAbility(actor) {
  return actor?.items?.some(i => FLIGHT_ITEM.test(i.name)) ?? false;
}

/** Access to the Soar Maneuver: 2+ Skill Ranks in Flight, the Soar Maneuver on the sheet, or the Flight ability. */
export function hasSoar(actor) {
  return ((actor?.system?.skills?.flight?.totalRanks ?? 0) >= 2) || hasFlightAbility(actor)
    || (actor?.items?.some(i => SOAR_ITEM.test(i.name)) ?? false);
}

/** Falling (High Environments): 1+ Skill Rank in Flight or access to the Soar Maneuver keeps you up. */
export function staysAloft(actor) {
  return ((actor?.system?.skills?.flight?.totalRanks ?? 0) >= 1) || hasSoar(actor);
}

const frequentFlyer = actor => actor?.items?.some(i => /^frequent flyer$/i.test(i.name)) ?? false;

/** Heightened Gravity adds x(bT) to the falls of the Flight Optional Rule (x: the Gravity Intensity suffered). */
function gravityExtra(actor) {
  return (actor?.system?.gravityIntensity ?? 0) * (actor?.system?.top?.base ?? 1);
}

/* -------------------------------------------- */
/*  Effects applied by the GM when needed       */
/* -------------------------------------------- */

/**
 * Run a list of effects on documents the user may not own (an enemy token, another character's Life Points):
 * here when the user owns all of them, otherwise on the active GM's client (socket "ops").
 * op: update {data} · life {amount} · condition {key, value|add} · timed {key, add, duration, label, source, skip}
 *     · dot {add} · counter · flag {key, value (null removes it)}
 */
export async function runOps(ops) {
  ops = ops.filter(Boolean);
  if ( !ops.length ) return;
  const docs = await Promise.all(ops.map(o => fromUuid(o.uuid)));
  if ( game.user.isGM || docs.every(d => d?.isOwner) ) return applyOps(ops);
  emitGM("ops", { ops });
}

export async function applyOps(ops) {
  for ( const o of ops ) {
    const doc = await fromUuid(o.uuid);
    if ( !doc ) continue;
    try {
      switch ( o.op ) {
        case "update": await doc.update(o.data, o.options ?? {}); break;
        case "life": {
          const sys = doc.system;
          const next = sys.life.value - o.amount;
          await doc.update({ "system.life.value": (sys._effectiveStates?.undying > 0) ? next : Math.max(0, next) }, { dbuEnvDamage: true });
          break;
        }
        case "condition": {
          const cur = doc.system.conditions?.[o.key] ?? 0;
          await doc.setCondition(o.key, o.add ? cur + o.add : o.value);
          // (T29 o.by: the Character who inflicted it, "inflict" as for a trigger effect)
          const now = doc.system.conditions?.[o.key] ?? 0;
          if ( o.by && (o.by !== doc.uuid) && (now > cur) ) {
            const by = await fromUuid(o.by).catch(() => null);
            const giver = (by?.documentName === "Token") ? by.actor : by;
            if ( giver ) {
              await doc.setFlag("dbu-rpg", `condBy.${o.key}`, giver.uuid).catch(() => null);
              (await import("./triggers.mjs")).fireEvent(giver, "inflict", { other: doc, scope: { [`cond_${o.key}`]: 1, level: now } });
            }
          }
          break;
        }
        case "timed": {
          const cur = doc.system.conditions?.[o.key] ?? 0;
          const level = Math.min(DBU.conditions[o.key]?.max ?? 1, cur + (o.add ?? 1));
          await doc.setCondition(o.key, level);
          await addTimedCondition(doc, o.key, cur, level, o.duration, o.label ?? "", { source: o.source, skip: o.skip });
          break;
        }
        case "dot": await doc.update({ "system.combat.dot": (doc.system.combat.dot ?? 0) + o.add }); break;
        // F12: an item taken from another Character (Slimy Consistency's Stored Weapon)
        case "delete": await doc.delete(); break;
        case "counter": await doc.update({ "system.combat.counters": Math.max(0, (doc.system.combat.counters ?? 0) - 1) }); break;
        case "flag":
          if ( o.value === null ) await doc.unsetFlag("dbu-rpg", o.key);
          else await doc.setFlag("dbu-rpg", o.key, o.value);
          break;
        default: break;
      }
    } catch(err) {
      console.error("DBU | effect failed", o, err);
    }
  }
}

/* -------------------------------------------- */
/*  Hardness and Collision Damage               */
/* -------------------------------------------- */

const QUALITIES = {
  ground: ["glass", "metallic", "bouncy", "dangerous", "soft"],
  feature: ["glass", "metallic", "resilient", "rubbery", "fragile", "burning", "shocking", "sharp", "splintering"]
};

/**
 * Ask what the character collides with: the Hardness Rank of the Square (ground) or of the Feature, and its
 * Qualities. Returns the choice, { pass: true } when there is nothing to collide with (the movement goes on), or null.
 */
export async function askHardness({ actor, what = "ground", title, passLabel = null } = {}) {
  const scene = canvas.scene;
  const def = (what === "ground") ? (scene?.getFlag("dbu-rpg", "groundHardness") ?? 2) : 2;
  const bT = actor?.system?.top?.base ?? 1;
  const options = HARDNESS_RANKS.map(r => `<option value="${r}" ${r === def ? "selected" : ""}>${L(`DBU.Hard.Rank${r}`)} · ${hardnessValue(r, bT)} LP</option>`).join("");
  const quals = QUALITIES[what].map(q => `<label class="check" data-tooltip="${L(`DBU.Hard.Q.${q}Tip`)}"><input type="checkbox" name="${q}"> ${L(`DBU.Hard.Q.${q}`)}</label>`).join("");
  const content = `<div class="dbu-dialog dbu-hardness">
    <p>${L(what === "ground" ? "DBU.Hard.GroundText" : "DBU.Hard.FeatureText", { name: foundry.utils.escapeHTML(actor?.name ?? "") })}</p>
    <div class="form-group"><label>${L("DBU.Hard.Rank")}</label><select name="rank">${options}</select></div>
    <div class="dbu-checks">${quals}</div>
    ${((what === "ground") && game.user.isGM && scene) ? `<label class="check"><input type="checkbox" name="remember"> ${L("DBU.Hard.Remember")}</label>` : ""}
  </div>`;
  const buttons = [{ action: "ok", label: L("DBU.Hard.Apply"), icon: "fa-solid fa-burst", default: true,
    callback: (event, button) => new (FDE())(button.form).object }];
  buttons.push({ action: "pass", label: passLabel ?? L(what === "ground" ? "DBU.Hard.NoDamage" : "DBU.Hard.PassThrough"), icon: "fa-solid fa-feather" });
  const data = await DialogV2.wait({
    window: { title: title ?? L("DBU.Hard.Title"), icon: "fa-solid fa-mountain" }, position: { width: 470 },
    content, buttons, rejectClose: false
  });
  if ( !data ) return null;
  if ( data === "pass" ) return { pass: true };
  const choice = { ...data, rank: Number(data.rank) || 0 };
  if ( choice.remember && scene ) await scene.setFlag("dbu-rpg", "groundHardness", choice.rank);
  return choice;
}

/**
 * Collision Damage against an actor: the Hardness Value of the choice (Glass +1 Rank, Metallic at least Rank 3) plus
 * a bonus, doubled by Dangerous (and by Push Back), halved by Bouncy, Rubbery or Fragile and by each other halving.
 */
export function collisionDamage(actor, h, { bonus = 0, double = false, halve = 0 } = {}) {
  const bT = actor?.system?.top?.base ?? 1;
  let rank = (h?.rank ?? 0) + (h?.glass ? 1 : 0);
  if ( h?.metallic ) rank = Math.max(3, rank);
  let damage = hardnessValue(rank, bT) + bonus;
  if ( h?.dangerous ) damage *= 2;
  if ( double ) damage *= 2;
  // Q "collision.ignore": no Collision Damage at all
  if ( (actor?.system?.buckets?.["collision.ignore"]?.total ?? 0) > 0 ) return { damage: 0, rank };
  // CS2 "collision.ignoreRound": the first Collision Damage of each Combat Round is 0 (Dense Body 7)
  if ( (damage > 0) && ((actor?.system?.buckets?.["collision.ignoreRound"]?.total ?? 0) > 0) ) {
    const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid));
    const f = actor.flags?.["dbu-rpg"]?.collisionFree;
    if ( combat && !(f && (f.combat === combat.id) && (f.round === combat.round)) ) {
      runOps([{ op: "flag", uuid: actor.uuid, key: "collisionFree", value: { combat: combat.id, round: combat.round } }]).catch(() => null);
      return { damage: 0, rank };
    }
  }
  // Q "collision.halve": the Collision Damage this actor takes is halved (once, however many pieces)
  const own = ((actor?.system?.buckets?.["collision.halve"]?.total ?? 0) > 0) ? 1 : 0;
  const halves = halve + own + ((h?.bouncy || h?.rubbery || h?.fragile) ? 1 : 0);
  for ( let i = 0; i < halves; i++ ) damage = Math.floor(damage / 2);
  return { damage, rank };
}

/** Whose turn it is: the end of that turn in the next Combat Round ends "for 1 Combat Round" Collision effects. */
function turnActorUuid(actor) {
  return encounterOf(actor)?.combatant?.actor?.uuid ?? null;
}

/** The effects of a Collision on an actor: Life Points and the Conditions of the Qualities. */
function collisionOps(actor, h, damage, lines) {
  const ops = [];
  if ( damage > 0 ) ops.push({ op: "life", uuid: actor.uuid, amount: damage });
  // (OA "collided": you take Collision Damage: Bouncy Physique)
  if ( damage > 0 ) import("./triggers.mjs").then(T => T.fireEvent(actor, "collided", { scope: { damage } })).catch(() => null);
  if ( !h ) return ops;
  const source = turnActorUuid(actor);
  const timed = (key, label) => source
    ? { op: "timed", uuid: actor.uuid, key, add: 1, duration: "endOfSourceTurn", label, source, skip: 1 }
    : { op: "condition", uuid: actor.uuid, key, add: 1 };
  if ( h.soft ) { ops.push({ op: "condition", uuid: actor.uuid, key: "prone", value: 1 }); lines.push(L("DBU.Hard.Q.softDone")); }
  if ( h.burning ) { ops.push(timed("broken", L("DBU.Hard.Q.burning"))); lines.push(L("DBU.Hard.Q.burningDone")); }
  if ( h.shocking ) { ops.push(timed("impediment", L("DBU.Hard.Q.shocking"))); lines.push(L("DBU.Hard.Q.shockingDone")); }
  if ( h.sharp ) { ops.push({ op: "dot", uuid: actor.uuid, add: 2 }); lines.push(L("DBU.Hard.Q.sharpDone")); }
  if ( h.bouncy ) lines.push(L("DBU.Hard.Q.bouncyDone", { n: h.rank }));
  if ( h.rubbery ) lines.push(L("DBU.Hard.Q.rubberyDone"));
  if ( h.splintering ) lines.push(L("DBU.Hard.Q.splinteringDone"));
  return ops;
}

/* -------------------------------------------- */
/*  Forced movement                             */
/* -------------------------------------------- */

const DIRS = { nw: [-1, -1], n: [0, -1], ne: [1, -1], w: [-1, 0], e: [1, 0], sw: [-1, 1], s: [0, 1], se: [1, 1] };
const COMPASS = ["nw", "n", "ne", "w", "away", "e", "sw", "s", "se"];

function compassHTML(hasSource) {
  const cells = COMPASS.map(d => {
    if ( d === "away" && !hasSource ) return `<span></span>`;
    const icon = d === "away" ? `<i class="fa-solid fa-person-walking-arrow-right"></i>` : L(`DBU.Move.Dir.${d}`);
    return `<label data-tooltip="${L(`DBU.Move.DirTip.${d}`)}"><input type="radio" name="dir" value="${d}" ${d === (hasSource ? "away" : "e") ? "checked" : ""}><span>${icon}</span></label>`;
  }).join("");
  return `<div class="dbu-compass">${cells}</div>`;
}

/** The positions (top-left points) a token goes through in a straight line, one per Square. */
function straightPath(tdoc, dir, squares, sourceCenter) {
  const grid = canvas.grid;
  const p0 = positionOf(tdoc);
  const c0 = tdoc.getCenterPoint(p0);
  let [ux, uy] = DIRS[dir] ?? [1, 0];
  if ( dir === "away" ) {
    let vx = c0.x - (sourceCenter?.x ?? c0.x);
    let vy = c0.y - (sourceCenter?.y ?? c0.y);
    if ( !vx && !vy ) vx = 1;
    // One Square per step along the longer axis, as the grid counts them
    const m = Math.max(Math.abs(vx), Math.abs(vy));
    ux = vx / m;
    uy = vy / m;
  }
  const size = grid.size;
  const out = [];
  if ( !grid.isSquare ) {
    for ( let k = 1; k <= squares; k++ ) out.push({ x: Math.round(p0.x + (ux * k * size)), y: Math.round(p0.y + (uy * k * size)) });
    return out;
  }
  const elevation = p0.elevation;
  const dest = { x: c0.x + (ux * squares * size), y: c0.y + (uy * squares * size), elevation };
  const cells = grid.getDirectPath([{ x: c0.x, y: c0.y, elevation }, dest]);
  const o0 = cells[0];
  for ( const o of cells.slice(1, squares + 1) ) out.push({ x: p0.x + ((o.j - o0.j) * size), y: p0.y + ((o.i - o0.i) * size) });
  return out;
}

function insideScene(tdoc, pos) {
  const r = canvas.dimensions.sceneRect;
  const { width, height } = tdoc.getSize();
  return (pos.x >= r.x - 1) && (pos.y >= r.y - 1) && (pos.x + width <= r.right + 1) && (pos.y + height <= r.bottom + 1);
}

const overlaps = (a, b) => (a.i0 <= b.i1) && (b.i0 <= a.i1) && (a.j0 <= b.j1) && (b.j0 <= a.j1);

/** Another character in the way at that position and height (Character Collision), or null. Square grids only. */
function blockerAt(tdoc, pos, sameHeight, ignore) {
  if ( !canvas.grid.isSquare ) return null;
  // (F12 "flag.passThrough": an Incorporeal Character passes through the others, and its Square counts as empty)
  const through = a => (a?.system?.buckets?.["flag.passThrough"]?.total ?? 0) > 0;
  if ( through(tdoc.actor) ) return null;
  const fp = footprint(tdoc, pos);
  for ( const t of canvas.tokens.placeables ) {
    const d = t.document;
    if ( (d === tdoc) || ignore.has(d.uuid) || d.hidden || !t.actor || through(t.actor) ) continue;
    if ( overlaps(fp, footprint(d)) && sameHeight(d) ) return d;
  }
  return null;
}

/** A character about to be hit may spend a Counter Action: Might Clash against the mover, or get out of the way. */
async function askReaction(other, movedName, mover) {
  const actor = other.actor;
  const fighting = !!encounterOf(actor);
  if ( fighting && ((actor?.system?.combat?.counters ?? 0) < 1) ) return "none";
  const choice = await DialogV2.wait({
    window: { title: L("DBU.Move.CharacterCollision"), icon: "fa-solid fa-people-arrows" },
    content: `<p>${L("DBU.Move.ReactText", { name: foundry.utils.escapeHTML(other.name), moved: foundry.utils.escapeHTML(movedName) })}</p>`,
    buttons: [
      { action: "none", label: L("DBU.Move.ReactNone"), icon: "fa-solid fa-burst", default: true },
      { action: "clash", label: L("DBU.Move.ReactClash"), icon: "fa-solid fa-dumbbell" },
      { action: "dodge", label: L("DBU.Move.ReactDodge"), icon: "fa-solid fa-person-running" }
    ],
    rejectClose: false
  });
  if ( choice !== "clash" ) return choice ?? "none";
  // Against an effect not caused by a character the Might Clash is won automatically
  if ( !mover ) return "stopped";
  // The character responsible for the movement is the Defender of that Clash (combat/clash.mjs; ties go to it)
  const { resolveClash } = await import("./clash.mjs");
  const r = await resolveClash(actor, mover, { mine: "might", via: "collision", card: false });
  return r?.won ? "stopped" : "lost";
}

/**
 * Forced movement of a token by another character's effect (Launch, Push Back, Knockback...). Asks the Squares (up
 * to the maximum, or exactly), the direction and the change of height, then moves the token in a straight line and
 * resolves the Collisions on the way: Features (walls), other Characters and the ground.
 *  - Flight Optional Rule: each Verticality gained or lost takes 1 Square of the movement; reaching 0 Verticality is
 *    Hitting the Floor (+1(bT) Collision Damage for every 2 Verticality lost, up to 4(bT)).
 *  - High Environments: a movement of 8+ Squares may be halved for a Vertical Launch (1 rank up or down); leaving the
 *    Low Sky that way is a Ground Collision.
 * @param {object} cfg
 * @param {Actor} [cfg.source]            Character whose effect moves the target
 * @param {Token|TokenDocument} cfg.target
 * @param {number} cfg.squares            Squares of movement (the maximum, unless exact)
 * @param {boolean} [cfg.exact]           The movement is exactly that many Squares (Push Back)
 * @param {boolean} [cfg.away]            Straight line away from the source (Push Back)
 * @param {boolean} [cfg.double]          Double the Collision Damage (Push Back)
 * @param {string} cfg.label              Name of the effect
 * @returns {Promise<object|null>}        What happened, or null when cancelled
 */
export async function forcedMove({ source = null, target, squares, exact = false, away = false, double = false, label }) {
  const tdoc = docOf(target);
  const actor = tdoc?.actor;
  if ( !tdoc || !actor ) return null;
  if ( tdoc.parent !== canvas.scene ) {
    ui.notifications.warn(L("DBU.Move.OtherScene"));
    return null;
  }
  // F11 "move.reduce": the Squares the moved Character goes through by any means are reduced (Petrification Plating)
  squares = Math.max(0, Math.floor(squares) - Math.max(0, Math.floor(Number(actor.system?.buckets?.["move.reduce"]?.total ?? 0) || 0)));
  const mode = heightMode();
  const h0 = tokenHeight(tdoc);
  const sourceToken = source ? actorTokens(source)[0] : null;
  const sourceCenter = sourceToken ? sourceToken.document.getCenterPoint(positionOf(sourceToken.document)) : null;
  const tMight = actor.system.aptitudes?.might ?? 0;
  // (CS1 "suddenStop.extra": more Squares off with the Sudden Stop: Dense Body)
  const stopMax = Math.floor(tMight / 2) + Math.max(0, Math.floor(Number(actor.system?.buckets?.["suddenStop.extra"]?.total ?? 0) || 0));

  let vertical = "";
  if ( mode === "flight" ) {
    vertical = `<div class="form-group"><label>${L("DBU.Move.Height")}</label>
      <select name="vDir"><option value="">${L("DBU.Move.VNone")}</option><option value="up">${L("DBU.Move.VUp")}</option>
      ${h0.value ? `<option value="down">${L("DBU.Move.VDown")}</option>` : ""}</select>
      <input type="number" name="vAmount" value="0" min="0" max="${squares}" step="1"></div>
      <p class="hint">${L("DBU.Move.FlightHint", { now: heightText(h0) })}</p>`;
  }
  else if ( squares >= VERTICAL_LAUNCH ) {
    const up = (h0.value < DEEP_SPACE - 1) || game.user.isGM;
    vertical = `<div class="form-group"><label>Vertical Launch</label>
      <select name="launch"><option value="">${L("DBU.Move.VNone")}</option>
      ${(up && h0.value < DEEP_SPACE) ? `<option value="up">${L("DBU.Move.LaunchUp", { env: rankLabel(h0.value + 1) })}</option>` : ""}
      ${h0.value ? `<option value="down">${L("DBU.Move.LaunchDown", { env: rankLabel(h0.value - 1) })}</option>` : ""}</select></div>
      <p class="hint">${L("DBU.Move.LaunchHint", { now: heightText(h0) })}</p>`;
  }
  const content = `<div class="dbu-dialog dbu-forced-move">
    <p>${L(exact ? "DBU.Move.ExactText" : "DBU.Move.UpToText", { name: foundry.utils.escapeHTML(tdoc.name), n: squares })}</p>
    <div class="form-group"><label>${L("DBU.Move.Squares")}</label>
      <input type="number" name="distance" value="${squares}" min="0" max="${squares}" step="1" ${exact ? "readonly" : ""}></div>
    ${away ? `<p class="hint">${L("DBU.Move.AwayHint")}</p>` : `<div class="form-group"><label>${L("DBU.Move.Direction")}</label>${compassHTML(!!sourceCenter)}</div>`}
    ${vertical}
    <div class="form-group"><label class="check"><input type="checkbox" name="suddenStop"> ${L("DBU.Move.SuddenStop", { n: stopMax })}</label>
      <input type="number" name="stopSquares" value="${stopMax}" min="0" max="${stopMax}" step="1"></div>
  </div>`;
  const data = await DialogV2.wait({
    window: { title: `${label}: ${tdoc.name}`, icon: "fa-solid fa-person-falling-burst" }, position: { width: 470 },
    content,
    buttons: [
      { action: "move", label: L("DBU.Move.Go"), icon: "fa-solid fa-arrow-right", default: true,
        callback: (event, button) => new (FDE())(button.form).object },
      { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if ( !data || (data === "cancel") ) return null;

  /* ----- Squares, direction and height ----- */
  const total = exact ? squares : Math.clamp(Math.floor(Number(data.distance) || 0), 0, squares);
  let horizontal = total;
  let h1 = h0.value;
  const lines = [];
  const ops = [];
  if ( mode === "flight" && data.vDir ) {
    let amount = Math.clamp(Math.floor(Number(data.vAmount) || 0), 0, total);
    if ( data.vDir === "down" ) amount = Math.min(amount, h0.value);
    horizontal = total - amount;
    h1 = h0.value + (data.vDir === "up" ? amount : -amount);
  }
  else if ( (mode === "levels") && data.launch ) {
    if ( total < VERTICAL_LAUNCH ) ui.notifications.warn(L("DBU.Move.LaunchShort"));
    else {
      horizontal = Math.floor(total / 2);
      h1 = Math.clamp(h0.value + (data.launch === "up" ? 1 : -1), 0, DEEP_SPACE);
    }
  }
  // Sudden Stop (the target's Counter Action): fewer Squares, half the Collision Damage
  let halve = 0;
  if ( data.suddenStop ) {
    halve = 1;
    let cut = Math.clamp(Math.floor(Number(data.stopSquares) || 0), 0, stopMax);
    const fromH = Math.min(cut, horizontal);
    horizontal -= fromH;
    cut -= fromH;
    if ( (mode === "flight") && cut && (h1 !== h0.value) ) {
      const dv = h1 - h0.value;
      h1 = h0.value + (Math.sign(dv) * Math.max(0, Math.abs(dv) - cut));
    }
    lines.push(L("DBU.Move.SuddenStopUsed", { name: tdoc.name }));
    // (CS1 "suddenStop.free": moved by an Opponent's effect, no Counter Action, once per Combat Round: Dense Body 4)
    const combat = encounterOf(actor);
    const freeMark = actor.flags?.["dbu-rpg"]?.suddenStopFree;
    const freeNow = combat && source && (source !== actor) && ((actor.system?.buckets?.["suddenStop.free"]?.total ?? 0) > 0)
      && !(freeMark && (freeMark.combat === combat.id) && (freeMark.round === combat.round))
      && ((tdoc.disposition ?? 0) !== (sourceToken?.document?.disposition ?? 0));
    if ( freeNow ) {
      ops.push({ op: "flag", uuid: actor.uuid, key: "suddenStopFree", value: { combat: combat.id, round: combat.round } });
      lines.push(L("DBU.CS1.FreeStop"));
    }
    else if ( combat ) ops.push({ op: "counter", uuid: actor.uuid });
  }

  /* ----- The way: Features, Characters, the edge of the Battlefield ----- */
  const dir = away ? "away" : (data.dir || "e");
  const path = straightPath(tdoc, dir, horizontal, sourceCenter);
  const token = tdoc.object;
  const band = mode === "flight"
    ? { v: Math.min(h0.value, h1), occupied: Math.abs(h1 - h0.value) + verticalBand(tdoc).occupied }
    : null;
  const sameHeight = d => (mode === "flight") ? (verticalGap(band, verticalBand(d)) === 0)
    : [h0.value, h1].includes(tokenHeight(d).value);
  // Characters that already share the Squares of the target (at another height, or overlapping) are not hit
  const startFp = footprint(tdoc);
  const ignore = new Set(canvas.tokens.placeables.filter(t => overlaps(startFp, footprint(t.document))).map(t => t.document.uuid));
  const start = positionOf(tdoc);
  let final = { x: start.x, y: start.y };
  let moved = 0;
  let fragileHit = false;
  const center = pos => tdoc.getCenterPoint({ x: pos.x, y: pos.y });
  for ( const pos of path ) {
    if ( !insideScene(tdoc, pos) ) { lines.push(L("DBU.Move.Edge")); break; }
    const passes = (actor.system?.buckets?.["flag.passThrough"]?.total ?? 0) > 0;
    if ( !passes && token?.checkCollision(center(pos), { origin: center(final), type: "move", mode: "any" }) ) {
      const h = await askHardness({ actor, what: "feature", title: L("DBU.Move.FeatureTitle", { name: tdoc.name }) });
      if ( !h ) break;
      if ( !h.pass ) {
        const fragile = h.fragile && !fragileHit;
        const { damage, rank } = collisionDamage(actor, h, { double, halve });
        lines.push(L("DBU.Move.FeatureHit", { name: tdoc.name, rank, dmg: damage }));
        // The Feature takes 1/2 (rounded up) of the ToP of whoever caused the Collision; its Life Points are its Rank
        const featureDmg = Math.ceil((source?.system?.top?.current ?? actor.system.top.current) / 2);
        const featureLp = h.resilient ? 2 * rank : rank;
        lines.push(L((h.fragile || (featureDmg >= featureLp)) ? "DBU.Move.FeatureBroken" : "DBU.Move.FeatureDamage",
          { n: featureDmg, lp: featureLp }));
        ops.push(...collisionOps(actor, h, damage, lines));
        if ( !fragile ) break;
        // PL Bouncy Physique (3): Collision Damage ends the movement it would go on suffering
        if ( (damage > 0) && hasTrait(actor, "bouncy physique") ) { lines.push(L("DBU.Move.BouncyStop", { name: tdoc.name })); break; }
        fragileHit = true;
      }
    }
    const other = blockerAt(tdoc, pos, sameHeight, ignore);
    if ( other ) {
      const reaction = await askReaction(other, tdoc.name, source);
      if ( reaction !== "none" ) ops.push({ op: "counter", uuid: other.actor.uuid });
      if ( reaction === "dodge" ) {
        ignore.add(other.uuid);
        lines.push(L("DBU.Move.Dodged", { name: other.name }));
      }
      else if ( reaction === "stopped" ) {
        lines.push(L("DBU.Move.ClashStopped", { name: other.name }));
        break;
      }
      else {
        const mine = collisionDamage(actor, { rank: 2 }, { double, halve }).damage;
        const theirs = collisionDamage(other.actor, { rank: 2 }).damage;
        lines.push(L("DBU.Move.CharacterHit", { name: tdoc.name, other: other.name, dmg: mine, dmg2: theirs }));
        ops.push({ op: "life", uuid: actor.uuid, amount: mine }, { op: "condition", uuid: actor.uuid, key: "prone", value: 1 },
          { op: "life", uuid: other.actor.uuid, amount: theirs }, { op: "condition", uuid: other.actor.uuid, key: "prone", value: 1 });
        break;
      }
    }
    final = pos;
    moved += 1;
  }

  /* ----- Height: Hitting the Floor / Ground Collision ----- */
  const hitsGround = (h0.value > 0) && (h1 === 0);
  if ( h1 !== h0.value ) {
    lines.push(L("DBU.Move.HeightChange", { from: heightText(h0), to: heightText({ mode, value: h1 }) }));
  }
  if ( hitsGround ) {
    const bonus = (mode === "flight") ? (fallBonus(h0.value, actor.system.top.base) + gravityExtra(actor)) : 0;
    const h = await askHardness({ actor, what: "ground", title: L("DBU.Move.GroundTitle", { name: tdoc.name }) });
    if ( h && !h.pass ) {
      const { damage, rank } = collisionDamage(actor, h, { bonus, double, halve });
      lines.push(L(bonus ? "DBU.Move.FloorHit" : "DBU.Move.GroundHit", { name: tdoc.name, rank, dmg: damage, bonus }));
      ops.push(...collisionOps(actor, h, damage, lines));
    }
  }
  lines.unshift(L("DBU.Move.Moved", { name: tdoc.name, n: moved, of: total }));

  // The token moves first, then the damage (the Steadfast Checks come after the landing)
  const elevation = elevationFor(tdoc, h1, mode);
  const moveOp = ((final.x !== start.x) || (final.y !== start.y) || (elevation !== start.elevation))
    ? { op: "update", uuid: tdoc.uuid, data: { x: final.x, y: final.y, elevation }, options: { dbuForced: true } } : null;
  await runOps([moveOp, ...ops]);
  await postInfoCard({ actor: source ?? actor, title: label, subtitle: tdoc.name, lines, img: "icons/svg/thrust.svg" });
  if ( moveOp && source ) await sniperExploit(source, tdoc).catch(err => console.error("DBU | patient sniper", err));
  return { moved, total, height: h1, hitGround: hitsGround };
}

/** Has the actor a Racial Trait of that name (lower case)? */
function hasTrait(actor, name) {
  return !!actor?.items?.some(i => (i.type === "racialTrait") && (String(i.name).trim().toLowerCase() === name));
}

/**
 * PL Patient Sniper (1): an Ally moving an Opponent triggers your Exploit Maneuver against it (the Allies of the one who
 * moved it, on its side of the encounter).
 */
async function sniperExploit(source, tdoc) {
  const combat = encounterOf(source);
  const moved = tdoc.actor;
  if ( !combat || !moved ) return;
  const mine = combat.combatants.find(c => c.actor?.uuid === source.uuid)?.token;
  const side = mine?.disposition ?? 0;
  const theirs = tdoc.disposition ?? 0;
  if ( !side || !theirs || (side === theirs) ) return;
  const snipers = combat.combatants.filter(c => c.actor && (c.actor.uuid !== source.uuid) && !c.isDefeated
    && ((c.token?.disposition ?? 0) === side) && hasTrait(c.actor, "patient sniper")).map(c => c.actor);
  if ( !snipers.length ) return;
  const { provokeExploit } = await import("../rules/exploit.mjs");
  await provokeExploit(moved, "patientsniper", { opponents: snipers, token: tdoc, name: "Patient Sniper" });
}

/* -------------------------------------------- */
/*  Soar Maneuver                               */
/* -------------------------------------------- */

/** 1/Round Maneuvers: false when it was already used this Combat Round and the user does not go ahead anyway. */
export async function roundUse(actor, key, name) {
  const combat = encounterOf(actor);
  if ( !combat ) return true;
  const flag = actor.getFlag("dbu-rpg", "roundUses");
  const used = ((flag?.combat === combat.id) && (flag.round === combat.round)) ? (flag.used ?? []) : [];
  if ( used.includes(key) ) {
    const ok = await DialogV2.confirm({ window: { title: name }, content: `<p>${L("DBU.Maneuver.RoundUsed", { name })}</p>`, rejectClose: false });
    if ( !ok ) return false;
  }
  await actor.setFlag("dbu-rpg", "roundUses", { combat: combat.id, round: combat.round, used: [...new Set([...used, key])] });
  return true;
}

/**
 * Soar Maneuver [1/Round, 1 Action]. Flight Optional Rule: gain up to 8 Verticality (Frequent Flyer: 8 more) and
 * +1(T) Dodge (Frequent Flyer: 2(T)) until the start of your next turn; Opponents in a Minor Sphere around you may
 * Exploit. Otherwise: +1(bT) Defense Value until the start of your next turn and 1 rank of High Environment up or down.
 */
export async function soar(actor) {
  const token = actorTokens(actor)[0];
  if ( !token ) return ui.notifications.warn(L("DBU.Altitude.NoToken"));
  const sys = actor.system;
  if ( (sys.gravityIntensity ?? 0) >= 2 ) return ui.notifications.warn(L("DBU.Altitude.SoarGravity", { gi: sys.gravityIntensity }));
  if ( !hasSoar(actor) ) {
    const ok = await DialogV2.confirm({ window: { title: "Soar" }, content: `<p>${L("DBU.Altitude.NoSoar")}</p>`, rejectClose: false });
    if ( !ok ) return null;
  }
  const h = tokenHeight(token.document);
  const frequent = frequentFlyer(actor);
  const fighting = !!encounterOf(actor);
  const flight = h.mode === "flight";
  const max = flight ? SOAR_VERTICALITY * (frequent ? 2 : 1) : 1;
  const choice = flight
    ? `<div class="form-group"><label>${L("DBU.Altitude.SoarGain")}</label><input type="number" name="gain" value="${max}" min="0" max="${max}" step="1"></div>`
    : `<div class="form-group"><label>${L("DBU.Altitude.SoarWay")}</label><select name="way">
        ${h.value < DEEP_SPACE ? `<option value="up">${L("DBU.Move.LaunchUp", { env: rankLabel(h.value + 1) })}</option>` : ""}
        ${h.value ? `<option value="down">${L("DBU.Move.LaunchDown", { env: rankLabel(h.value - 1) })}</option>` : ""}
        <option value="">${L("DBU.Move.VNone")}</option></select></div>`;
  const data = await DialogV2.wait({
    window: { title: "Soar", icon: "fa-solid fa-dove" }, position: { width: 420 },
    content: `<div class="dbu-dialog"><p>${L(flight ? "DBU.Altitude.SoarFlightText" : "DBU.Altitude.SoarLevelsText", { now: heightText(h) })}</p>
      ${choice}
      ${frequent && fighting ? `<label class="check"><input type="checkbox" name="instant"> ${L("DBU.Altitude.SoarInstant")}</label>` : ""}</div>`,
    buttons: [
      { action: "ok", label: "Soar", icon: "fa-solid fa-dove", default: true, callback: (event, button) => new (FDE())(button.form).object },
      { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if ( !data || (data === "cancel") ) return null;
  if ( !(await roundUse(actor, "soar", "Soar")) ) return null;

  let next = h.value;
  if ( flight ) next = h.value + Math.clamp(Math.floor(Number(data.gain) || 0), 0, max);
  else if ( data.way ) next = Math.clamp(h.value + (data.way === "up" ? 1 : -1), 0, DEEP_SPACE);
  if ( (!flight) && ((next === DEEP_SPACE) || (h.value === DEEP_SPACE)) && (next !== h.value) && !game.user.isGM ) {
    ui.notifications.warn(L("DBU.Altitude.DeepSpaceGM"));
    next = h.value;
  }
  if ( next !== h.value ) await setTokenHeight(token, next);
  const lines = [L("DBU.Move.HeightChange", { from: heightText(h), to: heightText({ mode: h.mode, value: next }) })];
  if ( fighting ) {
    const bonus = flight
      ? { target: "dodge", value: frequent ? "2(T)" : "1(T)", condition: "", label: "Soar", active: true }
      : { target: "defenseValue", value: "1(bT)", condition: "", label: "Soar", active: true };
    await addTimedModifier(actor, bonus, { duration: "startOfNextTurn" });
    lines.push(L(flight ? "DBU.Altitude.SoarDodge" : "DBU.Altitude.SoarDV", { v: bonus.value }));
    if ( !data.instant ) await actor.update(actor._spendAction(1));
  }
  if ( flight ) lines.push(L("DBU.Altitude.SoarExploit"));
  return postInfoCard({ actor, title: "Soar", lines, img: "icons/svg/wing.svg" });
}

/* -------------------------------------------- */
/*  Combat turns and rounds (active GM)         */
/* -------------------------------------------- */

async function loseLife(actor, amount) {
  if ( amount > 0 ) await applyOps([{ op: "life", uuid: actor.uuid, amount }]);
}

/**
 * Flight Optional Rule, start of the turn: Verticality is lost (kept with the Flight Unique Ability). Prone: down to 0
 * even with it, losing 1(bT) Life Points for every 2 Verticality lost (up to 4(bT); Heightened Gravity adds to it).
 * @returns {Promise<string[]>} lines for the start of turn card
 */
export async function heightStartOfTurn(combatant) {
  const token = combatant.token;
  const actor = combatant.actor;
  if ( (heightMode() !== "flight") || !token || !actor?.system?.top ) return [];
  const v = tokenHeight(token).value;
  if ( !v ) return [];
  const prone = (actor.system.effectiveConditions?.prone ?? 0) > 0;
  if ( !prone && hasFlightAbility(actor) ) return [];
  await setTokenHeight(token, 0);
  if ( !prone ) return [L("DBU.Altitude.TurnLost", { n: v })];
  const loss = fallBonus(v, actor.system.top.base) + gravityExtra(actor);
  await loseLife(actor, loss);
  return [L("DBU.Altitude.ProneFall", { n: v, lp: loss })];
}

/**
 * High Environments, start of the Combat Round (Falling): without a Skill Rank in Flight or the Soar Maneuver, a
 * character goes down 1 rank; out of the Low Sky an Acrobatics Skill Check (Qualified) avoids the Collision Damage.
 */
export async function heightStartOfRound(combat) {
  if ( heightMode() !== "levels" ) return;
  const lines = [];
  const seen = new Set();
  for ( const c of combat.combatants ) {
    const token = c.token;
    const actor = c.actor;
    if ( !token || !actor?.system?.top || seen.has(token.uuid) ) continue;
    seen.add(token.uuid);
    const rank = tokenHeight(token).value;
    // Deep Space is only left with the ARC's permission
    if ( !rank || (rank === DEEP_SPACE) || staysAloft(actor) ) continue;
    await setTokenHeight(token, rank - 1);
    if ( rank > 1 ) {
      lines.push(L("DBU.Altitude.Falls", { name: token.name, env: rankLabel(rank - 1) }));
      continue;
    }
    const roll = await actor.rollSkill("acrobatics", { difficulty: "qualified", subtitle: L("DBU.Altitude.FallCheck") });
    if ( (roll?.total ?? 0) >= DBU.difficulties.qualified.tn ) {
      lines.push(L("DBU.Altitude.LandedSafe", { name: token.name }));
      continue;
    }
    const h = await askHardness({ actor, what: "ground", title: L("DBU.Move.GroundTitle", { name: token.name }) });
    if ( !h || h.pass ) {
      lines.push(L("DBU.Altitude.Landed", { name: token.name }));
      continue;
    }
    const { damage, rank: hr } = collisionDamage(actor, h);
    lines.push(L("DBU.Move.GroundHit", { name: token.name, rank: hr, dmg: damage }));
    await applyOps(collisionOps(actor, h, damage, lines));
  }
  if ( lines.length ) await postInfoCard({ title: L("DBU.Altitude.FallingTitle"), lines, img: "icons/svg/falling.svg" });
}

/** Gravity Intensity 2+, end of the turn: a character up in the air goes back to the ground. */
export async function heightEndOfTurn(combatant) {
  const token = combatant.token;
  const gi = combatant.actor?.system?.gravityIntensity ?? 0;
  if ( !token || (gi < 2) || !tokenHeight(token).value ) return [];
  await setTokenHeight(token, 0);
  return [L("DBU.Altitude.GravityDown", { gi })];
}
