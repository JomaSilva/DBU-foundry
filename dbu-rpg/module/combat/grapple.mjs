import { postInfoCard } from "../dice/roller.mjs";
import { actorTokens, tokenDistance } from "../canvas/height.mjs";
import { forcedMove, roundUse, runOps } from "./movement.mjs";
import { encounterOf } from "./triggers.mjs";
import { resolveClash } from "./clash.mjs";

const { DialogV2 } = foundry.applications.api;
const FDE = () => foundry.applications.ux.FormDataExtended;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

/**
 * Grapple Maneuvers (Actions & Maneuvers): Grapple, Launch, Pin, escaping and ending the Grapple, and Thrust.
 * A Grapple lives in a flag on both characters: { role: "grappler" | "grappled", with: other actor's uuid,
 * token: other token's uuid, name, pinned }. While it lasts both suffer Guard Down (and the Grappled is Pinned after a
 * Pin Maneuver): the data preparation keeps those Conditions on.
 */
export function grappleOf(actor) {
  return actor?.getFlag?.("dbu-rpg", "grapple") ?? null;
}

const targetOf = () => Array.from(game.user.targets ?? [])[0] ?? null;

/** Melee Range: the adjacent Squares, more for larger Size Categories. */
const meleeRange = actor => 1 + (actor.system.size?.reach ?? 0);

/** The first targeted token, after checking it is a character other than the user's within Melee Range. */
async function meleeTarget(actor, name) {
  const target = targetOf();
  if ( !target?.actor || (target.actor === actor) ) {
    ui.notifications.warn(L("DBU.Grapple.NeedTarget", { name }));
    return null;
  }
  const mine = actorTokens(actor)[0];
  if ( mine ) {
    const d = tokenDistance(mine, target).total;
    if ( d > meleeRange(actor) ) {
      const ok = await DialogV2.confirm({ window: { title: name },
        content: `<p>${L("DBU.Grapple.OutOfReach", { name: foundry.utils.escapeHTML(target.name), d, r: meleeRange(actor) })}</p>`, rejectClose: false });
      if ( !ok ) return null;
    }
  }
  return target;
}

/**
 * Clash (Strike vs Strike/Dodge, the Defender's higher one: Dodge on a tie), through combat/clash.mjs. Ties go to the
 * Defender. The Grappler stays the Initiator of every Grapple Check of its Grapple, whoever makes it. grapple: a Grapple
 * Check (clash.grapple); via: the Maneuver (@via_grapple, @via_launch...).
 */
async function strikeClash(initiator, defender, { label, extra = [], defenderExtra = [], via = "", grapple = false } = {}) {
  const r = await resolveClash(initiator, defender, { mine: "strike", theirs: "dodge|strike", via, grapple, label, extra, defenderExtra,
    subtitle: label, defenderSubtitle: label, card: false });
  return { win: !!r?.won, mine: r?.mine ?? 0, theirs: r?.theirs ?? 0, defense: r?.theirsKey ?? "dodge" };
}

async function mightClash(initiator, defender, { via = "" } = {}) {
  const r = await resolveClash(initiator, defender, { mine: "might", via, card: false });
  return { win: !!r?.won, mine: r?.mine ?? 0, theirs: r?.theirs ?? 0 };
}

function clashLine(win, r, who, other) {
  return L(win ? "DBU.Grapple.ClashWin" : "DBU.Grapple.ClashLose", { name: who, other, mine: r.mine, theirs: r.theirs });
}

async function spend(actor, n) {
  if ( encounterOf(actor) ) await actor.update(actor._spendAction(n));
}

/** End a Grapple on both characters. */
export async function endGrapple(actor) {
  const g = grappleOf(actor);
  if ( !g ) return;
  await runOps([{ op: "flag", uuid: actor.uuid, key: "grapple", value: null }, { op: "flag", uuid: g.with, key: "grapple", value: null }]);
}

async function partnerOf(actor) {
  const g = grappleOf(actor);
  if ( !g ) return {};
  const other = await fromUuid(g.with);
  const token = g.token ? await fromUuid(g.token) : (other ? actorTokens(other)[0]?.document : null);
  return { g, other, token };
}

/**
 * A character outside of a Grapple that moves a character in it makes a Might Clash against the Grappler first: on a
 * win the Grappled escapes, on a loss the effect cannot be used. Returns true when the movement may go on.
 */
export async function throughGrapple(actor, targetActor, label) {
  const g = grappleOf(targetActor);
  if ( !g || (g.with === actor.uuid) ) return true;
  const grappler = (g.role === "grappler") ? targetActor : await fromUuid(g.with);
  if ( !grappler || (grappler.uuid === actor.uuid) ) return true;
  const r = await mightClash(actor, grappler, { via: "grapple" });
  const lines = [clashLine(r.win, r, actor.name, grappler.name)];
  if ( r.win ) {
    await endGrapple(targetActor);
    lines.push(L("DBU.Grapple.Escapes", { name: g.role === "grappled" ? targetActor.name : g.name }));
  }
  else lines.push(L("DBU.Grapple.MoveBlocked", { name: targetActor.name }));
  await postInfoCard({ actor, title: label, subtitle: L("DBU.Grapple.Moving"), lines });
  return r.win;
}

/* -------------------------------------------- */

/** Grapple Maneuver [1/Round, 1 Action]: Clash (Strike vs Strike/Dodge) against a character in Melee Range. */
export async function grapple(actor) {
  if ( grappleOf(actor) ) return ui.notifications.warn(L("DBU.Grapple.Already"));
  const target = await meleeTarget(actor, "Grapple");
  if ( !target ) return null;
  const other = target.actor;
  // Grabbing the Tail of a Saiyan (or of a character with the Tail Attack Maneuver): −2(T) to the Grapple Check
  const tail = other.items.some(i => /\btail\b/i.test(i.name));
  let tailGrab = false;
  if ( tail ) {
    const data = await DialogV2.wait({
      window: { title: "Grapple" },
      content: `<div class="dbu-dialog"><label class="check"><input type="checkbox" name="tail"> ${L("DBU.Grapple.Tail", { name: foundry.utils.escapeHTML(other.name) })}</label></div>`,
      buttons: [{ action: "ok", label: "Grapple", icon: "fa-solid fa-hands", default: true, callback: (e, b) => new (FDE())(b.form).object },
        { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }],
      rejectClose: false
    });
    if ( !data || (data === "cancel") ) return null;
    tailGrab = !!data.tail;
  }
  if ( !(await roundUse(actor, "grapple", "Grapple")) ) return null;
  const lines = [];
  // Grappling a Grapple: a Might Clash against its Grappler first, and the Grappled escapes it
  const theirs = grappleOf(other);
  if ( theirs ) {
    const grappler = theirs.role === "grappler" ? other : await fromUuid(theirs.with);
    const r = await mightClash(actor, grappler, { via: "grapple" });
    lines.push(clashLine(r.win, r, actor.name, grappler?.name ?? ""));
    if ( !r.win ) {
      await spend(actor, 1);
      lines.push(L("DBU.Grapple.CannotGrab", { name: other.name }));
      return postInfoCard({ actor, title: "Grapple", lines });
    }
    await endGrapple(other);
    lines.push(L("DBU.Grapple.Escapes", { name: theirs.role === "grappled" ? other.name : theirs.name }));
  }
  await spend(actor, 1);
  const T = actor.system.top.current;
  const r = await strikeClash(actor, other, { label: "Grapple Check", via: "grapple", grapple: true,
    extra: tailGrab ? [{ label: "Tail Restraint", value: -2 * T }] : [] });
  lines.push(clashLine(r.win, r, actor.name, other.name));
  if ( !r.win ) {
    lines.push(L("DBU.Grapple.Exploit", { name: other.name }));
    await postInfoCard({ actor, title: "Grapple", lines });
    // S: a lost Grapple Check provokes the Exploit of its target
    await (await import("../rules/exploit.mjs")).provokeExploit(actor, "grapple", { opponents: [other], name: "Grapple" });
    return;
  }
  const mine = actorTokens(actor)[0]?.document;
  await runOps([
    { op: "flag", uuid: actor.uuid, key: "grapple", value: { role: "grappler", with: other.uuid, token: target.document.uuid, name: other.name, pinned: false, tail: tailGrab } },
    { op: "flag", uuid: other.uuid, key: "grapple", value: { role: "grappled", with: actor.uuid, token: mine?.uuid ?? null, name: actor.name, pinned: false, tail: tailGrab } }
  ]);
  lines.push(L("DBU.Grapple.Grabbed", { name: actor.name, other: other.name }));
  if ( tailGrab ) lines.push(L("DBU.Grapple.TailHeld", { name: other.name }));
  return postInfoCard({ actor, title: "Grapple", lines });
}

/** Launch Maneuver [1/Round, 1 Action]: Grapple Check; on a win the Grapple ends and the Grappled is thrown up to Might Squares. */
export async function launch(actor) {
  const { g, other, token } = await partnerOf(actor);
  if ( g?.role !== "grappler" || !other ) return ui.notifications.warn(L("DBU.Grapple.NotGrappler"));
  if ( !(await roundUse(actor, "launch", "Launch")) ) return null;
  await spend(actor, 1);
  const r = await strikeClash(actor, other, { label: "Grapple Check (Launch)", via: "launch", grapple: true });
  const lines = [clashLine(r.win, r, actor.name, other.name)];
  await endGrapple(actor);
  if ( !r.win ) {
    lines.push(L("DBU.Grapple.Escapes", { name: other.name }));
    return postInfoCard({ actor, title: "Launch", lines });
  }
  await postInfoCard({ actor, title: "Launch", lines: [...lines, L("DBU.Grapple.Thrown", { name: other.name, n: actor.system.aptitudes.might })] });
  if ( !token ) return ui.notifications.warn(L("DBU.Move.NoTargetToken", { name: other.name }));
  return forcedMove({ source: actor, target: token, squares: actor.system.aptitudes.might, label: "Launch" });
}

/** Pin Maneuver [1/Round, 2 Actions]: Grapple Check −1(bT), then a Might Clash; the Grappled is Pinned in this Grapple. */
export async function pin(actor) {
  const { g, other } = await partnerOf(actor);
  if ( g?.role !== "grappler" || !other ) return ui.notifications.warn(L("DBU.Grapple.NotGrappler"));
  if ( !(await roundUse(actor, "pin", "Pin")) ) return null;
  await spend(actor, 2);
  const r = await strikeClash(actor, other, { label: "Grapple Check (Pin)", via: "pin", grapple: true,
    extra: [{ label: "Pin", value: -actor.system.top.base }] });
  const lines = [clashLine(r.win, r, actor.name, other.name)];
  let pinned = false;
  if ( r.win ) {
    const m = await mightClash(actor, other, { via: "pin" });
    lines.push(clashLine(m.win, m, actor.name, other.name));
    pinned = m.win;
  }
  if ( !pinned ) {
    await endGrapple(actor);
    lines.push(L("DBU.Grapple.Escapes", { name: other.name }));
    return postInfoCard({ actor, title: "Pin", lines });
  }
  await runOps([
    { op: "flag", uuid: actor.uuid, key: "grapple", value: { ...g, pinned: true } },
    { op: "flag", uuid: other.uuid, key: "grapple", value: { ...grappleOf(other), pinned: true } }
  ]);
  lines.push(L("DBU.Grapple.Pinned", { name: other.name }));
  return postInfoCard({ actor, title: "Pin", lines });
}

/** Escaping a Grapple: the Grappled spends 1+ Actions on a Grapple Check (+1(T) per Action after the first). */
export async function escape(actor) {
  const { g, other } = await partnerOf(actor);
  if ( g?.role !== "grappled" || !other ) return ui.notifications.warn(L("DBU.Grapple.NotGrappled"));
  const data = await DialogV2.wait({
    window: { title: L("DBU.Grapple.Escape") },
    content: `<div class="dbu-dialog"><div class="form-group"><label>${L("DBU.Grapple.EscapeActions")}</label>
      <input type="number" name="actions" value="1" min="1" max="3" step="1"></div><p class="hint">${L("DBU.Grapple.EscapeHint")}</p></div>`,
    buttons: [{ action: "ok", label: L("DBU.Grapple.Escape"), icon: "fa-solid fa-person-running", default: true,
      callback: (e, b) => new (FDE())(b.form).object }, { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }],
    rejectClose: false
  });
  if ( !data || (data === "cancel") ) return null;
  const actions = Math.clamp(Math.floor(Number(data.actions) || 1), 1, 3);
  await spend(actor, actions);
  const bonus = (actions - 1) * actor.system.top.current;
  // The Grappler is the Initiator: the Grappled wins ties
  const r = await strikeClash(other, actor, { label: L("DBU.Grapple.Escape"), via: "escape", grapple: true,
    defenderExtra: bonus ? [{ label: L("DBU.Grapple.ExtraActions"), value: bonus }] : [] });
  const lines = [clashLine(!r.win, { mine: r.theirs, theirs: r.mine }, actor.name, other.name)];
  if ( !r.win ) {
    await endGrapple(actor);
    lines.push(L("DBU.Grapple.Escapes", { name: actor.name }));
  }
  else lines.push(L("DBU.Grapple.StillHeld", { name: actor.name }));
  return postInfoCard({ actor, title: L("DBU.Grapple.Escape"), lines });
}

/** The Grappler ends the Grapple (Instant, on its turn). */
export async function release(actor) {
  const g = grappleOf(actor);
  if ( !g ) return ui.notifications.warn(L("DBU.Grapple.None"));
  if ( (g.role !== "grappler") && !game.user.isGM ) return ui.notifications.warn(L("DBU.Grapple.NotGrappler"));
  await endGrapple(actor);
  return postInfoCard({ actor, title: L("DBU.Grapple.Release"), lines: [L("DBU.Grapple.Released", { name: actor.name, other: g.name })] });
}

/**
 * Thrust Maneuver [1/Round, 1 Action]: Clash (Strike vs Strike/Dodge); on a win, Push Back (1/2 Might Squares in a
 * straight line away, double Collision Damage) or Knock Prone (Clash Impulsive/Corporeal: Prone, or Guard Down until the
 * end of your turn).
 */
export async function thrust(actor) {
  const target = await meleeTarget(actor, "Thrust");
  if ( !target ) return null;
  const other = target.actor;
  if ( !(await roundUse(actor, "thrust", "Thrust")) ) return null;
  await spend(actor, 1);
  const r = await strikeClash(actor, other, { label: "Thrust", via: "thrust" });
  const lines = [clashLine(r.win, r, actor.name, other.name)];
  if ( !r.win ) return postInfoCard({ actor, title: "Thrust", lines });
  const half = Math.floor(actor.system.aptitudes.might / 2);
  const choice = await DialogV2.wait({
    window: { title: "Thrust", icon: "fa-solid fa-hand-back-fist" },
    content: `<p>${L("DBU.Grapple.ThrustChoice", { name: foundry.utils.escapeHTML(other.name) })}</p>`,
    buttons: [
      { action: "push", label: L("DBU.Grapple.PushBack", { n: half }), icon: "fa-solid fa-person-walking-arrow-right", default: true },
      { action: "prone", label: L("DBU.Grapple.KnockProne"), icon: "fa-solid fa-person-falling" }
    ],
    rejectClose: false
  });
  if ( choice === "prone" ) {
    // A Clash of the better of Impulsive / Corporeal on each side (the first one on a tie)
    const c = await resolveClash(actor, other, { mine: "impulsive|corporeal", via: "thrust", card: false });
    const s = { mine: c?.mine ?? 0, theirs: c?.theirs ?? 0 };
    const win = !!c?.won;
    lines.push(clashLine(win, s, actor.name, other.name));
    if ( win ) {
      await runOps([{ op: "condition", uuid: other.uuid, key: "prone", value: 1 }]);
      lines.push(L("DBU.Grapple.Prone", { name: other.name }));
    }
    else {
      const op = encounterOf(actor)
        ? { op: "timed", uuid: other.uuid, key: "guardDown", add: 1, duration: "endOfSourceTurn", label: "Thrust", source: actor.uuid, skip: 0 }
        : { op: "condition", uuid: other.uuid, key: "guardDown", value: 1 };
      await runOps([op]);
      lines.push(L("DBU.Grapple.GuardDown", { name: other.name }));
    }
    return postInfoCard({ actor, title: "Thrust", lines });
  }
  if ( choice !== "push" ) return postInfoCard({ actor, title: "Thrust", lines });
  await postInfoCard({ actor, title: "Thrust", lines });
  if ( !(await throughGrapple(actor, other, "Thrust")) ) return null;
  return forcedMove({ source: actor, target, squares: half, exact: true, away: true, double: true, label: "Thrust (Push Back)" });
}

/**
 * Move the targeted character by an effect of yours (Knockback Advantage, Express Ticket, Terrain Slam...): how many
 * Squares and how, then the usual forced movement.
 */
export async function moveTarget(actor) {
  const target = targetOf();
  if ( !target?.actor || (target.actor === actor) ) return ui.notifications.warn(L("DBU.Grapple.NeedTarget", { name: L("DBU.Move.Title") }));
  const might = actor.system.aptitudes.might;
  const data = await DialogV2.wait({
    window: { title: L("DBU.Move.Title"), icon: "fa-solid fa-person-falling-burst" }, position: { width: 420 },
    content: `<div class="dbu-dialog"><p>${L("DBU.Move.GenericText", { name: foundry.utils.escapeHTML(target.name) })}</p>
      <div class="form-group"><label>${L("DBU.Move.Squares")}</label><input type="number" name="squares" value="${might}" min="0" step="1"></div>
      <label class="check"><input type="checkbox" name="exact"> ${L("DBU.Move.Exact")}</label>
      <label class="check"><input type="checkbox" name="away"> ${L("DBU.Move.Away")}</label>
      <label class="check"><input type="checkbox" name="double"> ${L("DBU.Move.Double")}</label>
      <div class="form-group"><label>${L("DBU.Move.Effect")}</label><input type="text" name="label" value="Knockback"></div>
      <p class="hint">${L("DBU.Move.MightHint", { might, half: Math.floor(might / 2) })}</p></div>`,
    buttons: [{ action: "ok", label: L("DBU.Move.Go"), icon: "fa-solid fa-arrow-right", default: true,
      callback: (e, b) => new (FDE())(b.form).object }, { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }],
    rejectClose: false
  });
  if ( !data || (data === "cancel") ) return null;
  const label = String(data.label || "").trim() || L("DBU.Move.Title");
  if ( !(await throughGrapple(actor, target.actor, label)) ) return null;
  return forcedMove({ source: actor, target, squares: Math.max(0, Math.floor(Number(data.squares) || 0)),
    exact: !!data.exact, away: !!data.away, double: !!data.double, label });
}
