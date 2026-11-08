/**
 * Package E (round 3), E3: entering and leaving Transformations by the rules of their effects. The modifier targets
 * below are read here, when the Transformation Maneuver is used or a Transformation is left (the sheet never sums them):
 * - enterBlock (on the Transformation itself): you cannot enter THIS Transformation. Its own pieces are worked out with
 *   its own variables (@M, @G...) even while you are not in it ("cannot enter without an Absorption stack" → value 1,
 *   condition "@awk.absorption < 1").
 * - enterBlockOf.<slug> / enterBlockAspect.<Aspect key> / enterBlockType.<form|enhancement|evolved> (from any item that
 *   works): you cannot enter a Transformation whose name (lowercase letters and digits) contains <slug> / that has that
 *   Aspect / of that type. A Transformation that the one entered replaces does not block it.
 * - combineBlock: this Transformation is used alone: while in it you cannot enter one that would be used together with
 *   it, and you cannot enter it while another one would stay.
 * - leaveBlock: you cannot leave this Transformation by choice (Revert, or entering one that replaces it), except into
 *   another Stage of its Transformation Line. Effects still make you leave it.
 * - leaveWhen (value 1, or 2: without the Stress Exhaustion and Impediment of the Exhausting Aspect): you leave this
 *   Transformation as soon as the condition holds (checked after every change of the character); on an Awakening its
 *   Grand Awakening ends instead.
 * - grandTrigger (on an Awakening): its Grand Trigger is met. Worked out as if the Grand Awakening were active (so that
 *   the "@GA >= 1" the importer appends to the Trait holds); when it holds in a Combat Encounter, the Full Awakening
 *   Maneuver is offered in chat (once per encounter).
 * The trigger effect "leave" goes through leaveTransformations.
 */
import { evaluate, test } from "./formula.mjs";
import { collectModifiers, twinnedOff } from "./modifiers.mjs";
import { fxPiece } from "./fx.mjs";
import { awakeningSlug, stackChoiceCount } from "./awakening.mjs";
import { encounterOf, triggerData } from "../combat/triggers.mjs";
import { postInfoCard } from "../dice/roller.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

/** The targets of this file (exact ones, and the families). */
export const RULE_TARGETS = ["enterBlock", "combineBlock", "leaveBlock", "leaveWhen", "grandTrigger"];
export const RULE_PREFIXES = ["enterBlockOf.", "enterBlockAspect.", "enterBlockType."];
const isRuleTarget = t => RULE_TARGETS.includes(t) || RULE_PREFIXES.some(p => String(t ?? "").startsWith(p));

/** The formula data the rules are worked out with. */
function ruleData(actor) {
  const combat = encounterOf(actor);
  return { ...(actor.system?.rollData ?? {}), ...triggerData(actor), round: combat?.round ?? 0 };
}

/** A piece applies: its condition holds and its value is above 0. */
function holds(m, data) {
  const sc = { ...data, ...(m.ctx ?? {}) };
  return test(m.condition, sc) && (evaluate(m.value, sc) > 0);
}

/** Its value (0 when its condition does not hold). */
function valueOf(m, data) {
  const sc = { ...data, ...(m.ctx ?? {}) };
  return test(m.condition, sc) ? evaluate(m.value, sc) : 0;
}

/** The Trait a piece comes from, for the messages. */
const traitOf = m => String(m.own || m.label || m.itemName || "").trim();

/**
 * The pieces of one item's own modifiers on a target (or a family ending in "."), whether the item works or not: switched
 * off, Twinned, unpicked options and the fx* pieces of the other effects are taken into account, like collectModifiers.
 * `ctx`: the variables of the item (a Transformation's formulaContext), with `extra` over them.
 */
export function ownPieces(actor, item, target, extra = {}) {
  const s = item?.system;
  if ( !s ) return [];
  const fx = actor?.system?._fx ?? null;
  const ctx = { ...((item.type === "transformation") ? (s.formulaContext ?? {}) : {}), ...extra };
  const out = [];
  for ( let m of s.modifiers ?? [] ) {
    const t = String(m?.target ?? "");
    if ( !(target.endsWith(".") ? t.startsWith(target) : (t === target)) ) continue;
    if ( twinnedOff(item, m) ) continue;
    const count = (item.type === "transformation") ? stackChoiceCount(s, m.label) : null;
    if ( (count === null) ? (m.active === false) : (count === 0) ) continue;
    if ( m.fx && fx ) {
      m = fxPiece(m, fx);
      if ( !m ) continue;
    }
    out.push({ target: t, value: m.value ?? "", condition: m.condition ?? "", own: m.label ?? "", label: item.name, itemId: item.id, ctx });
  }
  return out;
}

/** Does an item carry pieces of this file (so that the checks after a change are worth doing)? */
const carries = (item, targets) => (item?.system?.modifiers ?? []).some(m => targets.some(t => (t.endsWith(".")
  ? String(m?.target ?? "").startsWith(t) : (m?.target === t))));

/** The pieces of the items that work, on the targets of this file. */
function workingPieces(actor) {
  try {
    return collectModifiers(actor, actor.system).filter(m => isRuleTarget(m.target));
  } catch(err) {
    console.warn("DBU | transformation rules", err);
    return [];
  }
}

/**
 * What entering a Transformation replaces, as the Transformation Maneuver does: a Form (or a Transcended Enhancement) the
 * current Form, anything else the current Enhancements.
 */
export function replacedBy(actor, item) {
  const ts = item.system;
  return (actor.system.transformation?.active ?? []).filter(t => (t.id !== item.id)
    && (ts.countsAsForm ? !!t.system.countsAsForm : !t.system.countsAsForm));
}

/** A Transformation's type for enterBlockType: form, enhancement or evolved. */
const typeOf = item => String(item?.system?.transType ?? "");

/** Has the Transformation that Aspect (a key of DBU.aspects, any case)? */
const hasAspect = (item, key) => (item?.system?.aspects ?? []).some(a => String(a.key ?? "").toLowerCase() === String(key).toLowerCase());

/** Leaving `t` to enter `item` is a move into another Stage of its Transformation Line (allowed by leaveBlock). */
const sameLine = (t, item) => !!t?.system?.line && (t.system.line === item?.system?.line);

/**
 * Why the Transformation Maneuver cannot enter `item` now (the messages; empty when it can): its enterBlock pieces, the
 * enterBlockOf / enterBlockAspect / enterBlockType pieces of the items that work (not those of what it replaces),
 * combineBlock both ways, and the leaveBlock of what it replaces.
 */
export function enterProblems(actor, item) {
  if ( !actor?.system || (item?.type !== "transformation") || (item.system.transType === "awakening") ) return [];
  const data = ruleData(actor);
  const out = [];
  // Its own rule: "you cannot enter this Transformation ..."
  for ( const m of ownPieces(actor, item, "enterBlock") ) {
    if ( holds(m, data) ) out.push(L("DBU.TransRule.EnterBlocked", { name: item.name, why: traitOf(m) || item.name }));
  }
  const replaced = replacedBy(actor, item);
  const gone = new Set([item.id, ...replaced.map(t => t.id)]);
  const staying = (actor.system.transformation?.active ?? []).filter(t => !gone.has(t.id));
  const slug = awakeningSlug(item.name);
  for ( const m of workingPieces(actor) ) {
    // A piece of a Transformation the Maneuver leaves (or of this one) does not block it
    if ( m.itemId && gone.has(m.itemId) ) continue;
    const by = traitOf(m) || m.label;
    if ( m.target.startsWith("enterBlockOf.") ) {
      const part = awakeningSlug(m.target.slice(13));
      if ( part && slug.includes(part) && holds(m, data) ) out.push(L("DBU.TransRule.EnterBlockedOf", { name: item.name, by, what: m.target.slice(13) }));
    }
    else if ( m.target.startsWith("enterBlockAspect.") ) {
      const key = m.target.slice(17);
      if ( hasAspect(item, key) && holds(m, data) ) out.push(L("DBU.TransRule.EnterBlockedAspect", { name: item.name, by, what: key }));
    }
    else if ( m.target.startsWith("enterBlockType.") ) {
      const type = m.target.slice(15).toLowerCase();
      if ( (typeOf(item) === type) && holds(m, data) ) out.push(L("DBU.TransRule.EnterBlockedType", { name: item.name, by, what: type }));
    }
    else if ( (m.target === "combineBlock") && staying.some(t => t.id === m.itemId) && holds(m, data) ) {
      out.push(L("DBU.TransRule.CombineBlocked", { name: item.name, by: m.label }));
    }
  }
  // This one is used alone: nothing may stay with it
  if ( staying.length && ownPieces(actor, item, "combineBlock").some(m => holds(m, data)) ) {
    out.push(L("DBU.TransRule.CombineBlocked", { name: item.name, by: staying.map(t => t.name).join(", ") }));
  }
  // What it replaces may not be left by choice (except into another Stage of its Line)
  for ( const t of replaced ) {
    if ( sameLine(t, item) ) continue;
    out.push(...leaveProblems(actor, t, data));
  }
  return [...new Set(out)];
}

/** Why `item` cannot be left by choice (its leaveBlock pieces; empty when it can). */
export function leaveProblems(actor, item, data = null) {
  if ( !item?.system?.isActive ) return [];
  data ??= ruleData(actor);
  return ownPieces(actor, item, "leaveBlock").filter(m => holds(m, data))
    .map(m => L("DBU.TransRule.LeaveBlocked", { name: item.name, why: traitOf(m) || item.name }));
}

/**
 * The Grand Trigger of an Awakening: { pieces: how many grandTrigger pieces it has, met: one holds, why: its Trait }.
 * Worked out as if its Grand Awakening were active (@GA = 1).
 */
export function grandTriggerState(actor, item) {
  if ( (item?.type !== "transformation") || (item.system.transType !== "awakening") ) return { pieces: 0, met: false, why: "" };
  const pieces = ownPieces(actor, item, "grandTrigger", { GA: 1 });
  const data = ruleData(actor);
  const hit = pieces.find(m => holds(m, data));
  return { pieces: pieces.length, met: !!hit, why: hit ? traitOf(hit) : "" };
}

/** The active Transformations a leaveWhen piece makes you leave now: [{ item, quiet, why, grand }]. */
export function leaveWhenDue(actor) {
  const data = ruleData(actor);
  const out = [];
  for ( const item of actor.items ?? [] ) {
    if ( (item.type !== "transformation") || !item.system?.isActive ) continue;
    const awakening = item.system.transType === "awakening";
    if ( awakening && !item.system.grandAwakening ) continue;
    let best = 0;
    let why = "";
    for ( const m of ownPieces(actor, item, "leaveWhen") ) {
      const v = valueOf(m, data);
      if ( v > best ) { best = v; why = traitOf(m); }
    }
    if ( best > 0 ) out.push({ item, quiet: best >= 2, why: why || item.name, grand: awakening });
  }
  return out;
}

/** Does the actor carry pieces that the checks after a change read (leaveWhen, grandTrigger)? */
export const watchesChanges = actor => (actor?.items ?? []).some(i => (i.type === "transformation") && carries(i, ["leaveWhen", "grandTrigger"]));

/**
 * After a change of the character: leave what a leaveWhen piece says, and offer the Full Awakening Maneuver of an
 * Awakening whose Grand Trigger is met (once per Combat Encounter). Run by the client that made the change.
 */
export async function checkTransformRules(actor) {
  if ( !actor?.system?.transformation || !actor.isOwner || !watchesChanges(actor) ) return;
  for ( const due of leaveWhenDue(actor) ) {
    if ( due.grand ) {
      await due.item.update({ "system.grandAwakening": false });
      await postInfoCard({ actor, title: due.item.name, img: due.item.img, lines: [L("DBU.TransRule.GrandEnded", { name: due.item.name }),
        L("DBU.TransRule.Because", { why: due.why })] });
      continue;
    }
    await actor.revert(due.item, { forced: true, quiet: due.quiet, why: due.why });
  }
  await offerGrandAwakenings(actor);
}

/** The Full Awakening Maneuver offered for the Awakenings whose Grand Trigger is met (flag grandOffered: itemId → combat). */
async function offerGrandAwakenings(actor) {
  const combat = encounterOf(actor);
  if ( !combat ) return;
  const offered = actor.getFlag?.("dbu-rpg", "grandOffered") ?? {};
  for ( const item of actor.items ?? [] ) {
    const s = item.system;
    if ( (item.type !== "transformation") || (s?.transType !== "awakening") || s.grandAwakening || !((s.stacks ?? 0) > 0) ) continue;
    if ( offered[item.id] === combat.id ) continue;
    const state = grandTriggerState(actor, item);
    if ( !state.met ) continue;
    await actor.setFlag("dbu-rpg", "grandOffered", { ...offered, [item.id]: combat.id });
    offered[item.id] = combat.id;
    await postInfoCard({ actor, title: L("DBU.TransRule.GrandTitle", { name: item.name }), img: item.img,
      lines: [L("DBU.TransRule.GrandMet", { name: item.name, why: state.why })],
      buttons: [{ action: "fullAwakening", label: L("DBU.TransRule.GrandButton"), icon: "fa-solid fa-sun", actorUuid: actor.uuid,
        payload: JSON.stringify({ itemId: item.id }) }] });
  }
}

/**
 * The trigger effect "leave": leave Transformations through an effect (no Revert Maneuver, leaveBlock ignored).
 * resource: "" / "this" (the Transformation of the piece, `itemId`; an Awakening: its Grand Awakening ends), "all",
 * "enhancements", "forms" (Forms and Evolved Forms), "grandAwakening" (the Grand Awakening of the piece's Awakening), or
 * the slug of a Transformation's name. quiet: without the Stress Exhaustion of the Exhausting Aspect (value 2).
 * @returns {Promise<string>} what happened ("" when nothing changed)
 */
export async function leaveTransformations(actor, resource = "", { itemId = null, quiet = false, why = "" } = {}) {
  const key = String(resource ?? "").trim();
  const k = key.toLowerCase();
  const active = actor.system?.transformation?.active ?? [];
  const own = itemId ? actor.items?.get?.(itemId) : null;
  if ( (k === "grandawakening") || ((!k || (k === "this")) && (own?.system?.transType === "awakening")) ) {
    if ( !own?.system?.grandAwakening ) return "";
    await own.update({ "system.grandAwakening": false });
    return L("DBU.TransRule.GrandEnded", { name: own.name });
  }
  let list;
  if ( !k || (k === "this") ) list = (own && own.system?.active) ? [own] : [];
  else if ( k === "all" ) list = [...active];
  else if ( k === "enhancements" ) list = active.filter(t => t.system.transType === "enhancement");
  else if ( k === "forms" ) list = active.filter(t => ["form", "evolved"].includes(t.system.transType));
  else list = active.filter(t => awakeningSlug(t.name) === awakeningSlug(key));
  if ( !list.length ) return "";
  await actor.revert(list, { forced: true, quiet, why });
  return L("DBU.TransRule.Left", { list: list.map(t => t.name).join(", ") });
}
