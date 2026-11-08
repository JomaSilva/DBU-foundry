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

async function onMoved(doc, old) {
  const actor = doc.actor;
  if ( !actor?.system ) return;
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.tokenId === doc.id));
  if ( !combat ) return;
  const f = movementFacts(doc, old, combat);
  if ( !(f.squares >= 1) && !f.leftMelee && !f.enteredMelee ) return;
  const { fireEvent } = await import("../combat/triggers.mjs");
  const X = await import("./exploit.mjs");
  const provokes = X.noProvoke(actor, "movement") ? 0 : 1;
  const firstAdjacent = f.adjacent.find(a => a.opponent)?.actor ?? null;
  fireEvent(actor, "moved", { other: firstAdjacent, scope: { squares: f.squares, leftMelee: f.leftMelee, enteredMelee: f.enteredMelee,
    endOpponentsAdjacent: f.endOpponentsAdjacent, endAlliesAdjacent: f.endAlliesAdjacent } });
  for ( const o of f.entered ) fireEvent(o, "opponentEnteredMelee", { other: actor, scope: { squares: f.squares, provokes } });
  for ( const a of f.adjacent ) {
    fireEvent(a.actor, "endedAdjacent", { other: actor, scope: { squares: f.squares, isOpponent: a.opponent ? 1 : 0, isAlly: a.opponent ? 0 : 1, provokes } });
  }
  for ( const o of f.left ) fireEvent(o, "opponentLeftMelee", { other: actor, scope: { squares: f.squares, provokes } });
  // Leaving a Melee Range provokes that Opponent's Exploit ("exploitTriggered", its card with the button)
  if ( f.left.length ) await X.provokeExploit(actor, "movement", { opponents: f.left, token: doc, name: L("DBU.Exploit.By.movement") });
}

/** The hooks: the position before the update (preUpdateToken), the facts after it (updateToken, the mover's client). */
export function registerMovementWatch() {
  Hooks.on("preUpdateToken", (doc, changes, options) => {
    if ( !moving(changes) ) return;
    const s = doc._source ?? doc;
    options.dbuOldPos = { x: s.x, y: s.y, elevation: s.elevation ?? 0, width: s.width, height: s.height };
  });
  Hooks.on("updateToken", (doc, changes, options, userId) => {
    if ( (userId !== game.user.id) || !options?.dbuOldPos || !moving(changes) ) return;
    onMoved(doc, options.dbuOldPos).catch(err => console.error("DBU | movement watch", err));
  });
}
