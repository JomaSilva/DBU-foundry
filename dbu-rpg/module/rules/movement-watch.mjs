/**
 * Package P (round 10): a token that moves during a started Combat Encounter is a moment. The client of the user who
 * moved it compares where it was and where it is now (rules/proximity.mjs distances, Melee Range = 1 + Size reach):
 * - "moved" for the Character that moved: @squares (Squares between the two positions), @leftMelee (Opponents whose
 *   Melee Range it left), @enteredMelee (whose Melee Range it entered), @endOpponentsAdjacent (Opponents adjacent at the
 *   end), @endAlliesAdjacent;
 * - "opponentEnteredMelee" for each Opponent whose Melee Range it entered, "endedAdjacent" for each Character (Ally or
 *   Opponent: @isOpponent / @isAlly) it ends adjacent to (other = the one that moved, for both);
 * - "opponentLeftMelee" for each Opponent whose Melee Range it left (other = the one that moved): the moment it provokes
 *   their Exploit Maneuver (rules/exploit.mjs: "exploitTriggered" with @by_movement and the Exploit card), unless the
 *   one that moved has "flag.noProvokeExploit" / "noProvoke.movement".
 * The Opponents' events carry @provokes (1, or 0 when the mover's movement provokes no Exploit); "moved" has as its
 * other Character the first Opponent adjacent at the end (for an attack button "after you end your movement adjacent").
 * Only for movement of 1 Square or more on one scene (not a teleport between scenes); nothing outside of combat.
 */
import { tokenDistance } from "./proximity.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const moving = changes => ("x" in changes) || ("y" in changes) || ("elevation" in changes);

/** The position fields of a token as tokenDistance reads them. */
const posOf = src => ({ _source: { x: src.x ?? 0, y: src.y ?? 0, elevation: src.elevation ?? 0, width: src.width ?? 1, height: src.height ?? 1 } });

/** What a move from `old` to the token's position now did (see the header). */
export function movementFacts(doc, old, combat) {
  const scene = doc.parent;
  const size = scene?.grid?.size ?? 100;
  const unit = scene?.grid?.distance ?? 1;
  const before = posOf(old);
  const now = posOf(doc._source ?? doc);
  const squares = Math.max(Math.round(Math.abs(now._source.x - before._source.x) / size),
    Math.round(Math.abs(now._source.y - before._source.y) / size));
  const side = doc.disposition ?? 0;
  const out = { squares, leftMelee: 0, enteredMelee: 0, endOpponentsAdjacent: 0, endAlliesAdjacent: 0, left: [], entered: [], adjacent: [] };
  for ( const cb of combat?.combatants ?? [] ) {
    const t = cb.token;
    const o = cb.actor;
    if ( !t || !o || (t.id === doc.id) || (t.parent !== scene) || cb.isDefeated || ((o.system?.life?.value ?? 1) <= 0) ) continue;
    const disp = t.disposition ?? 0;
    const dNow = tokenDistance(now, t, { size, unit });
    if ( side && (disp === side) ) {
      if ( dNow <= 1 ) { out.endAlliesAdjacent += 1; out.adjacent.push({ actor: o, opponent: false }); }
      continue;
    }
    if ( !side || !disp ) continue;
    const reach = 1 + (o.system?.size?.reach ?? 0);
    const dBefore = tokenDistance(before, t, { size, unit });
    if ( (dBefore <= reach) && (dNow > reach) ) { out.leftMelee += 1; out.left.push(o); }
    if ( (dBefore > reach) && (dNow <= reach) ) { out.enteredMelee += 1; out.entered.push(o); }
    if ( dNow <= 1 ) { out.endOpponentsAdjacent += 1; out.adjacent.push({ actor: o, opponent: true }); }
  }
  return out;
}

async function onMoved(doc, old, { forced = false } = {}) {
  const actor = doc.actor;
  if ( !actor?.system ) return;
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.tokenId === doc.id));
  if ( !combat ) return;
  const f = movementFacts(doc, old, combat);
  if ( !(f.squares >= 1) && !f.leftMelee && !f.enteredMelee ) return;
  const { fireEvent } = await import("../combat/triggers.mjs");
  const X = await import("./exploit.mjs");
  // (PL: a forced movement is not the Movement Maneuver: it provokes no Exploit)
  const provokes = (forced || X.noProvoke(actor, "movement")) ? 0 : 1;
  const firstAdjacent = f.adjacent.find(a => a.opponent)?.actor ?? null;
  fireEvent(actor, "moved", { other: firstAdjacent, scope: { squares: f.squares, leftMelee: f.leftMelee, enteredMelee: f.enteredMelee,
    endOpponentsAdjacent: f.endOpponentsAdjacent, endAlliesAdjacent: f.endAlliesAdjacent, forced: forced ? 1 : 0 } });
  for ( const o of f.entered ) fireEvent(o, "opponentEnteredMelee", { other: actor, scope: { squares: f.squares, provokes } });
  for ( const a of f.adjacent ) {
    fireEvent(a.actor, "endedAdjacent", { other: actor, scope: { squares: f.squares, isOpponent: a.opponent ? 1 : 0, isAlly: a.opponent ? 0 : 1, provokes } });
  }
  for ( const o of f.left ) fireEvent(o, "opponentLeftMelee", { other: actor, scope: { squares: f.squares, provokes } });
  // CS2 "opponentMoved": every movement of an Opponent of yours, however far (@leftMine: it left your Melee Range)
  try {
    const { encounterOthers } = await import("./allies.mjs");
    const { collectTriggers } = await import("../combat/triggers.mjs");
    for ( const o of encounterOthers(actor) ) {
      if ( !o.opponent || !collectTriggers(o.actor, "opponentMoved").length ) continue;
      fireEvent(o.actor, "opponentMoved", { other: actor, scope: { squares: f.squares, provokes, leftMine: f.left.includes(o.actor) ? 1 : 0 } });
    }
  } catch(err) { console.warn("DBU | opponentMoved", err); }
  // Leaving a Melee Range provokes that Opponent's Exploit ("exploitTriggered", its card with the button)
  if ( f.left.length && !forced ) await X.provokeExploit(actor, "movement", { opponents: f.left, token: doc, name: L("DBU.Exploit.By.movement") });
}

/** The hooks: the position before the update (preUpdateToken), the facts after it (updateToken, the mover's client). */
async function unroot(doc) {
  const actor = doc?.actor;
  const r = (actor?.system?.resources ?? []).find(x => /^rooted$/i.test(String(x.name ?? "").trim()));
  if ( !actor?.isOwner || !(r?.value > 0) ) return;
  const { setStacks } = await import("../combat/stacks.mjs");
  await setStacks(actor, r.name, 0, { label: "Arboreal (5)" });
}

async function glassMoveEnd(doc) {
  const actor = doc?.actor;
  const r = (actor?.system?.resources ?? []).find(x => /^glass combat 3$/i.test(String(x.name ?? "").trim()));
  if ( !actor?.isOwner || !(r?.value > 0) ) return;
  const { setStacks } = await import("../combat/stacks.mjs");
  await setStacks(actor, r.name, 0, { label: "Glass Combat (3)" });
  const { squareGlass } = await import("../canvas/features.mjs");
  if ( squareGlass(doc.parent, doc._source.x, doc._source.y) ) return;
  const { postInfoCard } = await import("../dice/roller.mjs");
  await postInfoCard({ actor, title: "Glass Combat (3)", lines: [game.i18n.format("DBU.Feature.GlassMoveOff", { name: actor.name })] });
}

const FIELD = 4;
async function fieldExploit(doc, old) {
  const scene = doc?.parent;
  const mover = doc?.actor;
  if ( !scene || !mover ) return;
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.tokenId === doc.id));
  if ( !combat ) return;
  const size = scene.grid?.size ?? 100;
  const unit = scene.grid?.distance ?? 1;
  const was = { _source: { ...doc._source, x: old.x, y: old.y, elevation: old.elevation ?? doc._source.elevation } };
  const side = doc.disposition ?? 0;
  const owners = [];
  for ( const cb of combat.combatants ) {
    const t = cb.token;
    const a = cb.actor;
    if ( !t || !a || (t.id === doc.id) || (t.parent !== scene) || cb.isDefeated ) continue;
    if ( !side || !t.disposition || (t.disposition === side) ) continue;
    if ( !a.items?.some(i => (i.type === "racialTrait") && /^bio-berserker$/i.test(i.name)) ) continue;
    const before = tokenDistance(was, t, { size, unit });
    const now = tokenDistance(doc, t, { size, unit });
    if ( (before > FIELD) && (now <= FIELD) ) owners.push(a);
  }
  if ( !owners.length ) return;
  const { provokeExploit } = await import("./exploit.mjs");
  await provokeExploit(mover, "fieldofaggression", { opponents: owners, token: doc, name: "Field of Aggression" });
}

async function soldierExploit(doc, old) {
  const scene = doc?.parent;
  const mover = doc?.actor;
  if ( !scene || !mover || doc.flags?.["dbu-rpg"]?.feature ) return;
  const size = scene.grid?.size ?? 100;
  const near = (pos, t) => tokenDistance({ _source: { ...doc._source, x: pos.x, y: pos.y } }, t, { size, unit: scene.grid?.distance ?? 1 }) <= 1;
  const owners = new Set();
  for ( const t of scene.tokens ) {
    const f = t.flags?.["dbu-rpg"]?.feature;
    if ( (f?.kind !== "glassSoldier") || !near(old, t) || near(doc._source, t) ) continue;
    owners.add(f.owner);
  }
  for ( const uuid of owners ) {
    let owner = null;
    try { owner = fromUuidSync(uuid); } catch(err) { owner = null; }
    if ( owner?.documentName === "Token" ) owner = owner.actor;
    if ( !owner?.items?.some(i => (i.type === "racialTrait") && /^warriors of glass$/i.test(i.name)) ) continue;
    const ot = owner.getActiveTokens?.()?.[0]?.document;
    if ( !ot || (ot.disposition === doc.disposition) ) continue;
    const { provokeExploit } = await import("./exploit.mjs");
    await provokeExploit(mover, "glasssoldier", { opponents: [owner], token: doc, name: "Glass Soldier" });
  }
}

async function bogFollow(doc) {
  const actor = doc?.actor;
  if ( !actor?.isOwner ) return;
  const { inArea } = await import("../canvas/areas.mjs");
  const { setStacks } = await import("../combat/stacks.mjs");
  // (a sheet resource "<Kind> Environment": Bog Environment, Glass Environment...)
  for ( const r of actor.system?.resources ?? [] ) {
    const m = /^(\w+) environment$/i.exec(String(r.name ?? "").trim());
    if ( !m ) continue;
    const want = inArea(doc, m[1].toLowerCase()) ? Math.max(1, r.value ?? 0) : 0;
    if ( want !== (r.value ?? 0) ) await setStacks(actor, r.name, want, { label: m[1] });
  }
}

export function registerMovementWatch() {
  Hooks.on("preUpdateToken", (doc, changes, options) => {
    if ( !moving(changes) ) return;
    const s = doc._source ?? doc;
    options.dbuOldPos = { x: s.x, y: s.y, elevation: s.elevation ?? 0, width: s.width, height: s.height };
  });
  Hooks.on("updateToken", (doc, changes, options, userId) => {
    if ( (userId !== game.user.id) || !options?.dbuOldPos || !moving(changes) ) return;
    // (F10 Arboreal 5: a Character moved while Rooted stops being Rooted)
    unroot(doc).catch(err => console.error("DBU | rooted", err));
    // (PL: a Character placed on a Square by an effect did not use the Movement Maneuver)
    if ( options.dbuPlaced ) return bogFollow(doc).catch(err => console.error("DBU | bog area", err));
    onMoved(doc, options.dbuOldPos, { forced: !!options.dbuForced }).catch(err => console.error("DBU | movement watch", err));
    // AR: a sheet resource "Bog Environment" is 1 while the token stands in a Bog area, 0 once it leaves it
    bogFollow(doc).catch(err => console.error("DBU | bog area", err));
    // GS Warriors of Glass (2): an Opponent moving away from a Glass Soldier triggers its owner's Exploit
    if ( !options.dbuForced ) soldierExploit(doc, options.dbuOldPos).catch(err => console.error("DBU | glass soldier", err));
    // F1 Bio-Berserker (6): an Opponent entering a Field of Aggression (a Large Sphere: 4 Squares) triggers its Exploit
    if ( !options.dbuForced ) fieldExploit(doc, options.dbuOldPos).catch(err => console.error("DBU | field of aggression", err));
    // GS Glass Combat (3): the Instant Movement it gave must end on a Glass Square
    glassMoveEnd(doc).catch(err => console.error("DBU | glass move", err));
  });
}
