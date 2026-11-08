/**
 * The Clash resolver (feature C4): every Clash of the system (Grapple Checks, Launch, Pin, Escape, Thrust, the Collision
 * Might Clash, the Adventuring Skill Clashes, the Clash button) is rolled here.
 *
 *   resolveClash(initiator, defender, { mine = "might", theirs = mine, via = "", label = "", extra = [], defenderExtra = [],
 *     grapple = false, subtitle, defenderSubtitle, rollOptions = {}, defenderRollOptions = {}, mineResult = null,
 *     card = true, events = true })  →  { won, mine, theirs, margin, autoWin, tie, mineKey, theirsKey, mineRoll, theirsRoll }
 *
 * 1. Each side rolls its spec: might | strike | dodge | a Saving Throw (impulsive, corporeal, cognitive, morale) | a Skill
 *    key | an Attribute key (an Attribute Modifier Clash); "a|b" = the better of the two for that Character (the first
 *    one on a tie).
 * 2. Each side's clash.* pieces add to its roll: clash.all (every Clash), clash.might / clash.save / clash.skill (when that
 *    side rolls Might / a Save / a Skill), clash.grapple (Grapple Checks), clash.natural (+ Natural Result). Their
 *    condition and value see the side's formula data, @initiated (1 for the one who started the Clash), @clash_<kind>
 *    (might, save, skill, strike, dodge, grapple), @clash_<save / skill / attribute key>, @via_<slug> (what it is made
 *    through) and @vs.* (the other side, rules/versus.mjs). The initiator's "ask" pieces are a dialog (rules/options.mjs:
 *    cost, amount, group, limit); the defender's pieces are automatic.
 * 3. clash.autoWin (value 1): that side wins without anyone rolling (both: the Defender); the other pieces of both sides
 *    are then neither paid nor counted, and a Defender that wins that way leaves the initiator nothing to ask. Ties go to
 *    the Defender.
 * 4. One card (card: true; the Maneuvers that post their own card pass false), then clashWon / clashLost on both sides
 *    (other = the other side; @margin, @mine, @theirs and the clash variables).
 * With no clash.* piece and no clash trigger, the rolls are exactly the ones the callers made before.
 */
import { DBU } from "../config.mjs";
import { evaluate, test } from "../rules/formula.mjs";
import { collectModifiers } from "../rules/modifiers.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { fireEvent, triggerUsesLeft } from "./triggers.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const blank = v => !String(v ?? "").trim();
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** The modifier targets of a Clash (clash.duel belongs to the Duel Maneuver). */
export const CLASH_TARGETS = ["clash.all", "clash.might", "clash.save", "clash.skill", "clash.grapple", "clash.natural", "clash.autoWin"];

/** "Terrify Maneuver" → terrify: lowercase letters and digits, without the word "maneuver". */
export const viaSlug = name => String(name ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\bmaneuver\b/g, "").replace(/[^a-z0-9]/g, "");

/** What a spec key rolls: might | strike | dodge | save | skill | attr; null when it is none of them. */
export function clashKind(key) {
  if ( key === "might" ) return "might";
  if ( (key === "strike") || (key === "dodge") ) return key;
  if ( key in (DBU.saves ?? {}) ) return "save";
  if ( key in (DBU.skills ?? {}) ) return "skill";
  if ( (DBU.ATTRIBUTES ?? []).includes(key) ) return "attr";
  return null;
}

/** The bonus a spec key is compared with for "a|b". */
function specValue(actor, key) {
  const s = actor?.system ?? {};
  switch ( clashKind(key) ) {
    case "might": return s.aptitudes?.might ?? 0;
    case "strike": return (s.rolls?.strike?.bonus ?? 0) + (s.rolls?.strike_physical ?? 0);
    case "dodge": return s.rolls?.dodge?.bonus ?? 0;
    case "save": return s.saves?.[key]?.value ?? 0;
    case "skill": return s.skills?.[key]?.total ?? -99;
    case "attr": return s.attributes?.[key]?.mod ?? 0;
    default: return -Infinity;
  }
}

/** The key a spec ("impulsive|corporeal") rolls for this actor: the better one, the first on a tie. */
export function pickSpec(actor, spec) {
  const keys = String(spec || "might").split("|").map(s => s.trim()).filter(k => clashKind(k));
  if ( !keys.length ) return "might";
  return keys.reduce((best, k) => ((specValue(actor, k) > specValue(actor, best)) ? k : best), keys[0]);
}

/** The label of a spec key ("Might", "Moral", "Percepção"). */
export function specLabel(key) {
  switch ( clashKind(key) ) {
    case "might": return "Might";
    case "strike": return L("DBU.Roll.Strike");
    case "dodge": return L("DBU.Roll.Dodge");
    case "save": return L(DBU.saves[key].label);
    case "skill": return L(DBU.skills[key].label);
    case "attr": return L(DBU.attributes[key]);
    default: return String(key ?? "");
  }
}

/** The clash variables of one side: @initiated, @clash_<kind>, @clash_<key>, @clash_grapple, @via_<slug>. */
export function clashVariables(key, { initiated = false, via = [], grapple = false } = {}) {
  const kind = clashKind(key);
  const out = { initiated: initiated ? 1 : 0, clash_grapple: grapple ? 1 : 0 };
  if ( kind && (kind !== "attr") ) out[`clash_${kind}`] = 1;
  if ( ["save", "skill", "attr"].includes(kind) ) out[`clash_${key}`] = 1;
  for ( const v of [via].flat() ) {
    const slug = viaSlug(v);
    if ( slug ) out[`via_${slug}`] = 1;
  }
  return out;
}

/** Does a clash.* target count for a roll of this kind? */
function counts(target, kind, grapple) {
  switch ( target ) {
    case "clash.all": case "clash.natural": case "clash.autoWin": return true;
    case "clash.might": return kind === "might";
    case "clash.save": return kind === "save";
    case "clash.skill": return kind === "skill";
    case "clash.grapple": return !!grapple;
    default: return false;
  }
}

/** The @vs data of `self` about `other` (rules/versus.mjs; empty when it is not there). */
async function versusOf(self, other) {
  try {
    const V = await import("../rules/versus.mjs");
    return (typeof V.versusData === "function") ? V.versusData(self, other) : {};
  } catch(err) { return {}; }
}

/** rules/options.mjs, when it is there. */
async function optionsApi() {
  try {
    const O = await import("../rules/options.mjs");
    return (typeof O.optionPieces === "function") ? O : null;
  } catch(err) { return null; }
}

/** The clash.* modifiers of an actor, with their option fields; [] when they cannot be gathered. */
function clashMods(actor) {
  try { return collectModifiers(actor, actor.system).filter(m => CLASH_TARGETS.includes(m.target)); }
  catch(err) { return []; }
}

/** The limits of a Character the user may not own are counted through the GM. */
function limitWriter(actor) {
  if ( actor.isOwner ) return actor;
  return {
    uuid: actor.uuid, system: actor.system, items: actor.items, flags: actor.flags,
    getFlag: (...a) => actor.getFlag(...a),
    update: async data => {
      const { safeUpdate } = await import("../socket.mjs");
      return safeUpdate(actor, data);
    }
  };
}

/** A side with no clash piece. */
const NO_PIECES = () => ({ pieces: [], lines: [], chosen: null, O: null, actor: null, asker: false, found: [], scope: {} });
/** Is one of these pieces a clash.autoWin that applies? */
const autoOf = list => list.some(p => (p.target === "clash.autoWin") && (Number(p.value) > 0));
/** The pieces of the chosen boxes, as { target, value, label }. */
const piecesOf = (O, chosen) => O.chosenPieces(chosen).map(p => ({ target: p.target, value: Number(p.value) || 0, label: O.pieceLabel(p) }))
  .filter(p => p.value);

/**
 * The pieces of one side that would apply, as { pieces: [{ target, value, label }], lines, chosen... }: the initiator may
 * tick its "ask" ones (a dialog); the defender's apply by themselves (none with a cost or an amount). Nothing is paid or
 * counted yet: commitSide does it once it is known which pieces matter (an automatic win makes the others moot).
 */
async function gatherSide(actor, kind, scope, { initiator, grapple, title }) {
  const mods = clashMods(actor).filter(m => counts(m.target, kind, grapple));
  if ( !mods.length ) return NO_PIECES();
  const O = await optionsApi();
  // Without rules/options.mjs: the automatic pieces without cost / amount / group, their limits checked (not counted)
  if ( !O ) {
    const pieces = [];
    for ( const m of mods ) {
      if ( (m.mode === "ask") || !blank(m.cost) || !blank(m.amount) || !blank(m.group) ) continue;
      const data = { ...(actor.system.rollData ?? {}), ...(m.ctx ?? {}), ...scope };
      if ( !test(m.condition, data) ) continue;
      if ( !blank(m.limit) && !triggerUsesLeft(actor, { limit: m.limit, ctx: m.ctx }, `opt:clash|${m.itemId}|${m.label}|${m.target}`) ) continue;
      const value = evaluate(m.value, data);
      if ( value ) pieces.push({ target: m.target, value, label: (m.own && (m.own !== m.label)) ? `${m.label} — ${m.own}` : m.label });
    }
    return { ...NO_PIECES(), pieces };
  }
  const asker = initiator && actor.isOwner;
  let found = O.optionPieces(actor, CLASH_TARGETS, scope, { mods, side: asker ? "" : "attacker" });
  // The defender (or an initiator this user does not own) cannot pay or pick an amount
  if ( !asker ) found = found.filter(p => blank(p.cost) && blank(p.amount));
  if ( !found.length ) return NO_PIECES();
  let chosen = asker ? await O.optionDialog(found, { title, hint: L("DBU.Clash.OptionsHint"), actor, scope }) : O.autoChosen(actor, found, scope);
  chosen ??= O.autoChosen(actor, found, scope);
  return { pieces: piecesOf(O, chosen), lines: [], chosen, O, actor, asker, found, scope };
}

/**
 * Pay the costs of a side's chosen pieces (the initiator) and count their limits. When a chosen box holds an automatic
 * win, only those boxes are kept (the side wins without rolling: its other pieces would do nothing, so they cost and
 * count nothing). `none`: nothing applies (the other side won without rolling).
 */
async function commitSide(side, { none = false } = {}) {
  if ( none ) return { ...side, pieces: [], lines: [] };
  const { O, actor, scope } = side;
  if ( !O || !side.chosen ) return side;
  const narrow = list => (list.some(c => autoOf(c.pieces)) ? list.filter(c => autoOf(c.pieces)) : list);
  let chosen = narrow(side.chosen);
  const lines = [];
  if ( side.asker ) {
    const paid = await O.payOptions(actor, chosen, { scope });
    if ( paid.problems.length ) {
      ui.notifications.warn(L("DBU.Trigger.CantPay", { why: paid.problems.join(" ") }));
      chosen = narrow(O.autoChosen(actor, side.found.filter(p => blank(p.cost)), scope));
    }
    else if ( paid.text ) lines.push(L("DBU.Trigger.Paid", { cost: paid.text }));
  }
  await O.countOptionLimits(limitWriter(actor), chosen);
  return { ...side, chosen, pieces: piecesOf(O, chosen), lines };
}

/** Roll one side's spec with its parts and Natural Result change. */
async function rollSide(actor, key, { extra = [], naturalMod = 0, subtitle, rollOptions = {}, other = null, scope = {} }) {
  const opts = { ...rollOptions, extra, naturalMod, scope: { inClash: 1, ...scope }, other };
  if ( subtitle !== undefined ) opts.subtitle = subtitle;
  switch ( clashKind(key) ) {
    case "might": case "attr": return actor.rollClash(key, opts);
    case "strike": case "dodge": return actor.rollCombat(key, opts);
    case "save": return actor.rollSave(key, opts);
    case "skill": return actor.rollSkill(key, opts);
    default: return null;
  }
}

/**
 * Resolve a Clash between two Characters (see the top of this file).
 * @returns {Promise<object|null>}  null when the initiator's roll could not be made (no such Skill)
 */
export async function resolveClash(initiator, defender, {
  mine = "might", theirs = mine, via = "", label = "", extra = [], defenderExtra = [], grapple = false, subtitle,
  defenderSubtitle, rollOptions = {}, defenderRollOptions = {}, mineResult = null, card = true, events = true
} = {}) {
  const mineKey = pickSpec(initiator, mine);
  const theirsKey = defender ? pickSpec(defender, theirs) : mineKey;
  const vias = [via].flat().filter(Boolean);
  const mineVars = clashVariables(mineKey, { initiated: true, via: vias, grapple });
  const theirsVars = clashVariables(theirsKey, { initiated: false, via: vias, grapple });
  const mineScope = { ...mineVars, vs: await versusOf(initiator, defender) };
  const theirsScope = { ...theirsVars, vs: await versusOf(defender, initiator) };
  const title = label || L("DBU.Clash.Title");
  // The defender's pieces apply by themselves; when one of them wins the Clash without a roll, the initiator is asked
  // nothing. The initiator's pieces are asked before anything is rolled (a shared roll against several defenders: only
  // once). Costs are paid and limits counted only for the pieces that matter: with an automatic win, the winner's
  // automatic win only, and nothing of the other side.
  const theirsSide = defender ? await gatherSide(defender, clashKind(theirsKey), theirsScope, { initiator: false, grapple, title })
    : NO_PIECES();
  const theirsAuto = autoOf(theirsSide.pieces);
  const minePieces = (mineResult || theirsAuto) ? NO_PIECES()
    : await commitSide(await gatherSide(initiator, clashKind(mineKey), mineScope, { initiator: true, grapple, title }));
  const mineAuto = autoOf(minePieces.pieces);
  const theirsPieces = await commitSide(theirsSide, { none: mineAuto && !theirsAuto });
  const bonusParts = list => list.filter(p => !["clash.natural", "clash.autoWin"].includes(p.target)).map(p => ({ label: p.label, value: p.value }));
  const natural = list => list.filter(p => p.target === "clash.natural").reduce((t, p) => t + p.value, 0);

  let mineRoll = mineResult;
  let theirsRoll = null;
  let won;
  let a = 0;
  let b = 0;
  const autoWin = mineAuto || theirsAuto;
  if ( autoWin ) won = mineAuto && !theirsAuto;
  else {
    mineRoll ??= await rollSide(initiator, mineKey, { extra: [...extra, ...bonusParts(minePieces.pieces)], naturalMod: natural(minePieces.pieces),
      subtitle, rollOptions, other: defender, scope: mineVars });
    if ( !mineRoll ) return null;
    if ( defender ) {
      theirsRoll = await rollSide(defender, theirsKey, { extra: [...defenderExtra, ...bonusParts(theirsPieces.pieces)],
        naturalMod: natural(theirsPieces.pieces), subtitle: defenderSubtitle, rollOptions: defenderRollOptions, other: initiator, scope: theirsVars });
    }
    a = mineRoll?.total ?? 0;
    b = theirsRoll?.total ?? 0;
    // Ties go to the Defender
    won = a > b;
  }
  const out = { won, mine: a, theirs: b, margin: a - b, autoWin, tie: !autoWin && (a === b), mineKey, theirsKey, mineRoll, theirsRoll };

  if ( card ) {
    // (an automatic win rolls nothing: no totals)
    const lines = [
      ...(autoWin ? [] : [L("DBU.Clash.Mine", { name: initiator.name, what: specLabel(mineKey), total: a })]),
      ...((defender && !autoWin) ? [L("DBU.Clash.Theirs", { name: defender.name, what: specLabel(theirsKey), total: b })] : []),
      ...[...minePieces.pieces.map(p => [initiator, p]), ...theirsPieces.pieces.map(p => [defender, p])]
        .filter(([, p]) => p.target !== "clash.autoWin")
        .map(([who, p]) => `${who.name} — ${p.label}: ${p.value > 0 ? "+" : ""}${p.value} ${L(DBU.modifierTargets[p.target] ?? p.target)}`),
      ...minePieces.lines,
      autoWin ? L("DBU.Clash.AutoWin", { name: (won ? initiator : defender)?.name ?? "" }) : "",
      (!autoWin && out.tie) ? L("DBU.Clash.Tie", { name: defender?.name ?? "" }) : "",
      L(won ? "DBU.Clash.Won" : "DBU.Clash.Lost", { name: initiator.name, other: defender?.name ?? "" })
    ].filter(Boolean);
    const vline = vias.length ? L("DBU.Clash.Via", { via: vias.map(v => String(v)).join(", ") }) : "";
    await postInfoCard({ actor: initiator, title, subtitle: vline, lines });
  }
  if ( events && defender ) {
    fireEvent(initiator, won ? "clashWon" : "clashLost", { other: defender,
      scope: { ...mineScope, margin: a - b, mine: a, theirs: b, autoWin: autoWin ? 1 : 0 } });
    fireEvent(defender, won ? "clashLost" : "clashWon", { other: initiator,
      scope: { ...theirsScope, margin: b - a, mine: b, theirs: a, autoWin: autoWin ? 1 : 0 } });
  }
  return out;
}

/* -------------------------------------------- */
/*  The Clash button                            */
/* -------------------------------------------- */

/** The rolls a side may make in a Clash, for the dialog's selects. */
function specOptions(selected) {
  const opt = (k, text) => `<option value="${k}" ${k === selected ? "selected" : ""}>${esc(text)}</option>`;
  return [
    opt("might", "Might"), opt("strike", L("DBU.Roll.Strike")), opt("dodge", L("DBU.Roll.Dodge")),
    opt("dodge|strike", `${L("DBU.Roll.Dodge")} / ${L("DBU.Roll.Strike")}`),
    `<optgroup label="${esc(L("DBU.Saves"))}">${Object.keys(DBU.saves).map(k => opt(k, specLabel(k))).join("")}
      ${opt("impulsive|corporeal", `${specLabel("impulsive")} / ${specLabel("corporeal")}`)}</optgroup>`,
    `<optgroup label="${esc(L("DBU.Skill.label"))}">${Object.keys(DBU.skills).map(k => opt(k, specLabel(k))).join("")}</optgroup>`,
    `<optgroup label="${esc(L("DBU.Attributes"))}">${DBU.ATTRIBUTES.map(k => opt(k, specLabel(k))).join("")}</optgroup>`
  ].join("");
}

/**
 * The Clash button (Combat tab, or a Maneuver / Unique Ability chat card with `via` = that item): my roll, the targeted
 * Character, its roll and what it is made through, then resolveClash.
 */
export async function clashDialog(actor, { via = null } = {}) {
  const target = Array.from(game.user.targets ?? [])[0]?.actor ?? null;
  if ( !target || (target === actor) ) return ui.notifications.warn(L("DBU.Clash.NeedTarget"));
  const items = actor.items.filter(i => ["maneuver", "uniqueAbility"].includes(i.type));
  const viaId = via?.id ?? "";
  const data = await foundry.applications.api.DialogV2.wait({
    window: { title: L("DBU.Clash.Title"), icon: "fa-solid fa-people-pulling" }, position: { width: 440 },
    content: `<div class="dbu-dialog">
      <p>${esc(L("DBU.Clash.Against", { name: target.name }))}</p>
      <div class="form-group"><label>${esc(L("DBU.Clash.MineLabel"))}</label><select name="mine">${specOptions("might")}</select></div>
      <div class="form-group"><label>${esc(L("DBU.Clash.TheirsLabel"))}</label><select name="theirs">
        <option value="">${esc(L("DBU.Clash.Same"))}</option>${specOptions("")}</select></div>
      <div class="form-group"><label>${esc(L("DBU.Clash.ViaLabel"))}</label><select name="via"><option value="">—</option>
        ${items.map(i => `<option value="${i.id}" ${i.id === viaId ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select></div>
      <p class="hint">${esc(L("DBU.Clash.Hint"))}</p></div>`,
    buttons: [
      { action: "ok", label: L("DBU.Clash.Button"), icon: "fa-solid fa-people-pulling", default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
      { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if ( !data || (data === "cancel") || (typeof data !== "object") ) return null;
  const item = data.via ? actor.items.get(data.via) : null;
  return resolveClash(actor, target, { mine: data.mine || "might", theirs: data.theirs || data.mine || "might",
    via: viaOfItem(item), label: item ? `${L("DBU.Clash.Title")}: ${item.name}` : L("DBU.Clash.Title") });
}

/** W: the "via" names of a Clash made through an item: its name, and "uniqueAbility" / "specialManeuver" by its kind. */
export function viaOfItem(item) {
  if ( !item ) return "";
  const s = item.system ?? {};
  const special = (item.type === "maneuver") && !s.god && !s.villainous && (s.source?.slug !== "actions-maneuvers");
  return [item.name, ...(item.type === "uniqueAbility" ? ["uniqueAbility"] : []), ...(special ? ["specialManeuver"] : [])];
}

/** The Clash button of a Maneuver / Unique Ability chat card (documents/item.mjs toChat). */
export function clashButtonHtml(item) {
  return `<div class="dbu-card-buttons"><button type="button" data-dbu-clash="1" data-actor-uuid="${esc(item.actor?.uuid ?? "")}"
    data-item-id="${esc(item.id)}"><i class="fa-solid fa-people-pulling"></i> ${esc(L("DBU.Clash.Button"))}</button></div>`;
}

/** Wire the Clash buttons of the chat cards (kept out of chat.mjs: data-dbu-clash, not data-dbu-action). */
export function onRenderClashButtons(message, html) {
  const root = (html instanceof HTMLElement) ? html : html?.[0];
  for ( const button of root?.querySelectorAll?.("[data-dbu-clash]") ?? [] ) {
    let owner = null;
    try { owner = button.dataset.actorUuid ? fromUuidSync(button.dataset.actorUuid) : null; } catch(err) { owner = null; }
    if ( owner && !owner.isOwner ) { button.remove(); continue; }
    button.addEventListener("click", async event => {
      event.preventDefault();
      const actor = await fromUuid(button.dataset.actorUuid);
      if ( !actor?.isOwner ) return ui.notifications.warn(L("DBU.Notify.NotOwner"));
      const item = actor.items.get(button.dataset.itemId) ?? null;
      return clashDialog(actor, { via: item });
    });
  }
}
globalThis.Hooks?.on?.("renderChatMessageHTML", onRenderClashButtons);
