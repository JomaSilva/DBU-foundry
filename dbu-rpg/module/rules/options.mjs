/**
 * Option pieces: the modifiers of an actor on the option targets (attack.*, vs.*, defense.*, clash.*, surge.*,
 * recovery.*, charge.*). A piece is offered by itself (mode "") or as a box the player ticks (mode "ask"), and may carry:
 *  - cost:     paid when the piece is used (trigger cost syntax: "ki:2(bT); res:Greed:@n"), @n allowed;
 *  - amount:   a formula, the most @n the player may pick (the box shows a number input);
 *  - group:    pieces with the same group, from any item, form ONE box. Its amount is the first piece's that has one;
 *              all costs are summed and paid once; each piece keeps its own condition (tested with @n) and limit; a piece
 *              with no use left drops out, and the box drops out when none is left;
 *  - limit / limitKey: "1/Round"... counted per piece (key "opt:<piece key>", or the shared limitKey);
 *  - at:       "" (declaration) or "wound" (offered when the Wound Roll is made; attack.* only).
 *
 * The contract the other packages code against (B5: the Surge / Combat Recovery / Energy Charge boxes, C4: clash.*):
 *   optionPieces(actor, prefix, scope, { at, side, mods, keyOf, limits }) → pieces that apply with that scope
 *   optionDialog(pieces, { title, hint, actor, scope })  → chosen [{ box, group, n, pieces }] (null when cancelled);
 *                                                         automatic boxes are in it too; no dialog without an ask box
 *   autoChosen(actor, pieces, scope)                      → the automatic boxes only (no dialog)
 *   optionCostPlan(actor, chosen, scope)                  → triggers.mjs costPlan of every chosen piece's cost
 *   payOptions(actor, chosen, { scope, plan })            → { text, spent, problems } (pays nothing on a problem)
 *   countOptionLimits(actor, chosen, { keyOf })           → counts one use of every limited piece (once per key)
 *   choseVars(chosen)  → { <group>: n } (@chose.<group>); spentVars(plan) → { ki, life, <resource slug>... } (@spent.*)
 * Each chosen piece carries its `n`, its `value` (a number, fractions kept on multipliers; the text of a text target; the
 * formula itself when it holds dice) and its `formula` (the piece's own value, to work it out another way).
 */
import { DBU } from "../config.mjs";
import { evaluate, hasDice, test } from "./formula.mjs";
import { collectModifiers, isMultTarget } from "./modifiers.mjs";
import { resourceSlug } from "./resources.mjs";
import { costPlan, payTriggerCost, triggerUsesLeft, useTriggerLimit } from "../combat/triggers.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const blank = v => !String(v ?? "").trim();
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** The fields an option piece may carry besides target / value / condition / mode / limit. */
export const OPTION_FIELDS = ["cost", "amount", "group", "limitKey", "at"];
/** Option targets whose value is text (read where it is used, never evaluated). Other packages may add theirs. */
export const OPTION_TEXT = new Set(["attack.damageAttribute", "attack.aoe", "attack.state"]);
/** Option targets whose value keeps its fraction (1/2, 1.5). Other packages may add theirs. */
export const OPTION_FRACTION = new Set(["attack.ignoreDR", "attack.ignoreSoak", "attack.dimDefense.mult", "vs.ignoreSoak",
  "vs.damageMult"]);

/**
 * The option fields of collected modifiers. collectModifiers copies target, value, condition, mode and limit; the other
 * fields are read from the piece the modifier comes from (the item's, or the sheet's custom ones), matched by item, target,
 * value, condition and label. A modifier that already carries the fields keeps them.
 * @param {Actor} actor
 * @param {object[]} mods
 * @returns {object[]}
 */
export function withOptionFields(actor, mods) {
  if ( !mods.length ) return mods;
  let index = null;
  const id = (itemId, p, label) => [itemId ?? "", p.target ?? "", p.value ?? "", p.condition ?? "", label ?? ""].join("\u0001");
  const build = () => {
    index = new Map();
    const add = (itemId, list) => {
      for ( const p of list ?? [] ) {
        const k = id(itemId, p, p.label);
        if ( !index.has(k) ) index.set(k, p);
      }
    };
    for ( const item of actor?.items ?? [] ) add(item.id, item.system?.modifiers);
    add("", actor?.system?.customModifiers);
  };
  return mods.map(m => {
    if ( OPTION_FIELDS.every(f => m[f] !== undefined) ) return m;
    if ( !index ) build();
    const src = index.get(id(m.itemId, m, m.own)) ?? {};
    const out = { ...m };
    for ( const f of OPTION_FIELDS ) out[f] = String(m[f] ?? src[f] ?? "").trim();
    return out;
  });
}

/** The modifiers of an actor on targets matching `prefix`, with their option fields; [] when they cannot be gathered. */
export function optionMods(actor, prefix) {
  const match = matcher(prefix);
  try { return withOptionFields(actor, collectModifiers(actor, actor.system).filter(m => match(String(m.target)))); }
  catch(err) { return []; }
}

/** A target filter: a string or a list; an entry ending in "." is a family ("attack."), any other one an exact target. */
function matcher(prefix) {
  const list = (Array.isArray(prefix) ? prefix : [prefix]).filter(Boolean).map(String);
  return t => list.some(p => (p.endsWith(".") ? t.startsWith(p) : (t === p)));
}

/** The identity of a piece, as the attack options always had it (their limit key is "opt:<key>"). */
export const pieceKey = m => [m.itemId, m.label, m.target, m.value, m.condition].join("|");
/** The key a piece's uses are counted under: its limitKey, or `keyOf(piece)` ("opt:<key>" by default). */
export const pieceUseKey = (p, keyOf = null) => (blank(p.limitKey) ? (keyOf ? keyOf(p) : `opt:${p.key ?? pieceKey(p)}`) : String(p.limitKey).trim());
/** The box of a piece: its group, or the piece by itself. */
export const boxOf = p => (blank(p.group) ? p.key : `group:${String(p.group).trim()}`);

/** The formula data of a piece: the actor's, the source's variables, the scope it was found with, the scope and @n. */
export function pieceScope(actor, p, scope = {}, n = null) {
  const sc = { ...(actor?.system?.rollData ?? {}), ...(p.ctx ?? {}), ...(p.scope ?? {}), ...(scope ?? {}) };
  if ( n !== null ) sc.n = n;
  return sc;
}

/**
 * The value of a piece with @n: a number (fractions kept on OPTION_FRACTION targets and multipliers: surge.healMult,
 * vs.damageMult...), the text of a text target, the formula itself when it holds dice (surge.healBonus "1d6(bT)": the
 * caller rolls it; every chosen piece also keeps its formula as `formula`).
 */
export function pieceValue(actor, p, scope = {}, n = 1) {
  if ( OPTION_TEXT.has(p.target) || hasDice(p.value) ) return String(p.value ?? "").trim();
  const usesN = !blank(p.amount) || !blank(p.group);
  const floor = !OPTION_FRACTION.has(p.target) && !isMultTarget(String(p.target ?? ""));
  return evaluate(p.value, pieceScope(actor, p, scope, usesN ? n : null), { floor });
}

/** The @n a piece's condition is tested with in a dialog: 1, or every n up to its amount (at most 50). */
const nsUpTo = top => ((top > 1) ? Array.from({ length: Math.min(Math.floor(top), 50) }, (_, k) => k + 1) : [1]);

/**
 * The option pieces of an actor that apply with this scope.
 * @param {Actor} actor
 * @param {string|string[]} prefix   "attack." or a list of targets / families (["vs.dodge", "vs.combat"])
 * @param {object} [scope]           formula variables of the moment (the attack's, @vs...)
 * @param {object} [options]
 * @param {string} [options.at]      only the pieces with this `at` ("" at declaration, "wound"); undefined: any
 * @param {string} [options.side]    "attacker": mode "ask" is ignored (the piece is automatic)
 * @param {object[]} [options.mods]  the modifiers already gathered (optionMods), to gather them once per step
 * @param {Function} [options.keyOf] the use key of a piece without limitKey (default "opt:<key>")
 * @param {boolean} [options.limits=true]  drop the pieces with no use left
 * @returns {object[]} pieces: the modifier with its fields, plus key, box, useKey, ask (mode "ask"), max (the amount
 *   worked out, 0 without one), scope (the scope given; later steps work the piece out with it, then with theirs)
 */
export function optionPieces(actor, prefix, scope = {}, { at, side = "", mods = null, keyOf = null, limits = true } = {}) {
  const match = matcher(prefix);
  const list = (mods ?? optionMods(actor, prefix)).filter(m => match(String(m.target)))
    .filter(m => (at === undefined) || (String(m.at ?? "") === at));
  // The amount of each group: its first piece's that has one (a piece of the group without one is tested with it)
  const groupMax = new Map();
  for ( const m of list ) {
    const g = String(m.group ?? "").trim();
    if ( !g || blank(m.amount) || groupMax.has(g) ) continue;
    // (a piece with no use left gives its group no amount)
    if ( limits && !blank(m.limit) && !triggerUsesLeft(actor, { limit: m.limit, ctx: m.ctx }, pieceUseKey({ ...m, key: pieceKey(m) }, keyOf)) ) continue;
    groupMax.set(g, Math.max(0, Math.floor(evaluate(m.amount, pieceScope(actor, m, scope, 1)))));
  }
  const out = [];
  for ( const m of list ) {
    const p = { ...m, key: pieceKey(m) };
    // The scope it was found with (its value and cost are worked out with it later), and its actor (not copied)
    p.scope = scope;
    Object.defineProperty(p, "actor", { value: actor, enumerable: false, configurable: true });
    p.box = boxOf(p);
    p.useKey = pieceUseKey(p, keyOf);
    p.ask = (m.mode === "ask") && (side !== "attacker");
    p.max = blank(m.amount) ? 0 : Math.max(0, Math.floor(evaluate(m.amount, pieceScope(actor, p, scope, 1))));
    if ( !blank(m.amount) && (p.max < 1) ) continue;
    // Its condition holds with some @n it may be used with (1, or up to its amount / its group's)
    const top = p.max || groupMax.get(String(m.group ?? "").trim()) || 0;
    const ns = nsUpTo(top);
    const usesN = !blank(m.amount) || !blank(m.group);
    if ( !ns.some(n => test(m.condition, pieceScope(actor, p, scope, usesN ? n : null))) ) continue;
    if ( limits && !blank(m.limit) && !triggerUsesLeft(actor, { limit: m.limit, ctx: m.ctx }, p.useKey) ) continue;
    out.push(p);
  }
  return out;
}

/**
 * The boxes of a list of pieces, in the order of their first piece: { box, group, label, pieces, ask, max }. A box is
 * asked when one of its pieces is ("ask") or it has an amount to pick.
 */
export function optionBoxes(pieces) {
  const boxes = new Map();
  for ( const p of pieces ) {
    let b = boxes.get(p.box);
    if ( !b ) boxes.set(p.box, b = { box: p.box, group: blank(p.group) ? "" : String(p.group).trim(), pieces: [], ask: false, max: 0 });
    b.pieces.push(p);
    if ( p.ask ) b.ask = true;
    if ( !b.max && p.max ) b.max = p.max;
  }
  for ( const b of boxes.values() ) {
    // An amount to pick needs the player
    if ( b.max ) b.ask = true;
    b.label = [...new Set(b.pieces.map(pieceLabel))].join(" + ");
    b.limit = [...new Set(b.pieces.map(p => p.limit).filter(Boolean))].join(", ");
  }
  return [...boxes.values()];
}

/** "Trait — piece label" (the item's name, then the piece's own label when it has one). */
export const pieceLabel = p => ((p.own && (p.own !== p.label)) ? `${p.label} — ${p.own}` : (p.label ?? ""));

/**
 * The chosen boxes: `picks` maps a box to the n picked (the asked boxes not in it are left out); the automatic boxes
 * are always in (n = 1). Each piece is tested again with its n and gets its value; a box with no piece left drops out.
 * @param {Actor} actor
 * @param {object[]} pieces
 * @param {Map<string, number>|object} picks
 * @param {object} [scope]
 * @returns {{box: string, group: string, n: number, pieces: object[]}[]}
 */
export function resolveChosen(actor, pieces, picks = new Map(), scope = {}) {
  const get = k => ((picks instanceof Map) ? picks.get(k) : picks?.[k]);
  const out = [];
  for ( const b of optionBoxes(pieces) ) {
    let n = 1;
    if ( b.ask ) {
      const want = Number(get(b.box));
      if ( !(want >= 1) ) continue;
      n = b.max ? Math.clamp(Math.floor(want), 1, Math.max(1, Math.floor(b.max))) : 1;
    }
    const applied = [];
    for ( const p of b.pieces ) {
      const usesN = !blank(p.amount) || !blank(p.group);
      if ( !test(p.condition, pieceScope(actor, p, scope, usesN ? n : null)) ) continue;
      const value = pieceValue(actor, p, scope, n);
      if ( !value ) continue;
      // (formula: the piece's own value, for a caller that works it out its own way: dice, multipliers)
      applied.push({ ...p, n, value, formula: String(p.value ?? "") });
    }
    if ( applied.length ) out.push({ box: b.box, group: b.group, n, pieces: applied });
  }
  return out;
}

/** The automatic boxes of a list of pieces (no dialog). */
export function autoChosen(actor, pieces, scope = {}) {
  const asked = new Set(optionBoxes(pieces).filter(b => b.ask).map(b => b.box));
  return resolveChosen(actor, pieces.filter(p => !asked.has(p.box)), new Map(), scope);
}

/** Every piece of the chosen boxes. */
export const chosenPieces = chosen => (chosen ?? []).flatMap(c => c.pieces);

/** The cost of every chosen piece (worked out with its n), summed (triggers.mjs costPlan). */
export function optionCostPlan(actor, chosen, scope = {}) {
  const entries = [];
  for ( const c of chosen ?? [] ) {
    for ( const p of c.pieces ) if ( !blank(p.cost) ) entries.push({ cost: p.cost, data: pieceScope(actor, p, scope, c.n) });
  }
  return costPlan(actor, entries);
}

/** What a paid cost plan spent, for @spent.<x>: ki, life, dkp, capacity, counters, actions, power, charges, <slug>. */
export function spentVars(plan) {
  const out = {};
  if ( !plan || plan.empty ) return out;
  for ( const k of ["ki", "life", "dkp", "capacity", "counters", "actions", "power", "charges"] ) {
    if ( plan.need?.[k] ) out[k] = plan.need[k];
  }
  for ( const r of plan.res ?? [] ) if ( r.n ) out[resourceSlug(r.name)] = (out[resourceSlug(r.name)] ?? 0) + r.n;
  return out;
}

/** @chose.<group>: the n picked for each chosen box with a group (1 when it has no amount). */
export function choseVars(chosen) {
  const out = {};
  for ( const c of chosen ?? [] ) if ( c.group ) out[c.group] = c.n;
  return out;
}

/**
 * Pay the costs of the chosen pieces. Nothing is paid when they cannot all be paid.
 * @returns {Promise<{text: string, spent: object, problems: string[], plan: object}>}
 */
export async function payOptions(actor, chosen, { scope = {}, plan = null } = {}) {
  plan ??= optionCostPlan(actor, chosen, scope);
  if ( plan.problems.length ) return { text: "", spent: {}, problems: plan.problems, plan };
  const text = plan.empty ? "" : await payTriggerCost(actor, plan);
  return { text, spent: spentVars(plan), problems: [], plan };
}

/**
 * Count one use of every limited chosen piece (a key counts once, however many pieces share it).
 * @returns {Promise<string[]>}  the labels of the pieces that had no use left any more
 */
export async function countOptionLimits(actor, chosen, { keyOf = null, skip = [] } = {}) {
  const seen = new Set(skip);
  const refused = [];
  for ( const p of chosenPieces(chosen) ) {
    if ( blank(p.limit) ) continue;
    const key = p.useKey ?? pieceUseKey(p, keyOf);
    if ( seen.has(key) ) continue;
    seen.add(key);
    if ( !(await useTriggerLimit(actor, { limit: p.limit, ctx: p.ctx }, key)) ) refused.push(pieceLabel(p));
  }
  return refused;
}

/** The text of a box: its label, its value(s) and target(s), its limit and its cost. */
export function boxText(actor, b, scope = {}) {
  const what = [...new Set(b.pieces.map(p => {
    const target = game.i18n.localize(DBU.modifierTargets?.[p.target] ?? p.target);
    if ( OPTION_TEXT.has(p.target) ) return `${target} ${String(p.value ?? "").trim()}`;
    const v = blank(p.amount) ? pieceValue(actor, p, scope, 1) : String(p.value ?? "");
    return `${(typeof v === "number") && (v > 0) ? "+" : ""}${v} ${target}`;
  }))].join(", ");
  let text = `${b.label}: ${what}`;
  if ( b.limit ) text += ` [${b.limit}]`;
  return text;
}

/**
 * The HTML of the asked boxes (a checkbox each, a number input when it has an amount, disabled when its cost cannot be
 * paid with n = 1 at this scope). Inputs: `<prefix>_<i>` (the box) and `<prefix>n_<i>` (its n).
 * @returns {{html: string, boxes: object[]}}  boxes in the order of their index
 */
export function optionsHtml(actor, boxes, scope = {}, { prefix = "vsopt", text = null } = {}) {
  const asked = boxes.filter(b => b.ask);
  const html = asked.map((b, i) => {
    const plan = optionCostPlan(actor, [{ box: b.box, group: b.group, n: 1, pieces: b.pieces }], scope);
    const off = plan.problems.length ? "disabled" : "";
    const cost = plan.empty ? "" : ` <small>(${esc(L("DBU.Attack.OptionCost", { cost: plan.text }))})</small>`;
    const amount = b.max ? ` <input type="number" name="${prefix}n_${i}" value="1" min="1" max="${Math.floor(b.max)}" step="1" ${off}
      data-tooltip="${esc(L("DBU.Attack.OptionAmount", { max: Math.floor(b.max) }))}">` : "";
    return `<label><input type="checkbox" name="${prefix}_${i}" ${off}> ${esc(text ? text(b) : boxText(actor, b, scope))}${cost}</label>${amount}`;
  }).join("");
  return { html, boxes: asked };
}

/** The boxes ticked in a form (FormDataExtended object): Map box → n. */
export function readOptionsForm(boxes, data, prefix = "vsopt") {
  const picks = new Map();
  boxes.forEach((b, i) => {
    if ( !data?.[`${prefix}_${i}`] ) return;
    const n = b.max ? Math.max(1, Math.floor(Number(data[`${prefix}n_${i}`]) || 1)) : 1;
    picks.set(b.box, n);
  });
  return picks;
}

/**
 * Ask which option boxes to use (one dialog; none when no box is asked) and return the chosen boxes with the automatic
 * ones. null when the player cancels.
 * @param {object[]} pieces       from optionPieces
 * @param {object} options
 * @param {Actor} options.actor
 * @param {object} [options.scope]
 * @param {string} [options.title]
 * @param {string} [options.hint]
 */
export async function optionDialog(pieces, { title = "", hint = "", actor = null, scope = {} } = {}) {
  if ( !pieces?.length ) return [];
  actor ??= pieces.find(p => p.actor)?.actor ?? null;
  const boxes = optionBoxes(pieces);
  if ( !boxes.some(b => b.ask) ) return resolveChosen(actor, pieces, new Map(), scope);
  const { html, boxes: asked } = optionsHtml(actor, boxes, scope);
  const { DialogV2 } = foundry.applications.api;
  const data = await DialogV2.wait({
    window: { title: title || L("DBU.Attack.Options"), icon: "fa-solid fa-list-check" },
    position: { width: 440 },
    content: `<div class="dbu-dialog">${hint ? `<p class="hint">${esc(hint)}</p>` : ""}<div class="dbu-checks dbu-attack-options">${html}</div></div>`,
    buttons: [
      { action: "ok", label: L("DBU.Choice.Confirm"), icon: "fa-solid fa-check", default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
      { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if ( !data || (data === "cancel") || (typeof data !== "object") ) return null;
  return resolveChosen(actor, pieces, readOptionsForm(asked, data), scope);
}
