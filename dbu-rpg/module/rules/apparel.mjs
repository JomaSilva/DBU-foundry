/**
 * Apparel pieces for the rules engine: each equipped piece's Apparel Bonus after its modifiers, the formula variables
 * about them, and changing a piece's Break Value (the trigger effect "breakValue").
 *
 * A piece is named in modifiers and variables by the slug of its name (lowercase letters and digits: "Quillset" →
 * quillset); a Natural Apparel piece also answers to "natural".
 *  - modifiers (stage 1.5): apparelBonus.<slug> (+ its Apparel Bonus), apparelBonus.mult.<slug> (× it)
 *  - variables: @apparel.<slug>.bonus, @apparel.<slug>.break (its Break Value, 0 = broken), the same with "natural",
 *    @apparel.top.bonus and @apparel.top.armor (1: the top layer is Armor or Weights), @apparelWorn (pieces in use that
 *    are neither Natural nor Integrated)
 */
import { DBU } from "../config.mjs";
import { roundDown } from "./formula.mjs";

/** The slug of a piece's name ("Bio-Suit" → biosuit). */
export const apparelSlug = name => String(name ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]/g, "");

/** The Apparel Bonus of a piece without effects: its Craftsmanship's bonus × the base Tier of Power. */
export const baseApparelBonus = (item, bT) => (DBU.craftsmanship[item.system.craftsmanship]?.apparelBonus ?? 1) * bT;

/**
 * Every equipped Apparel piece (in item order), with its Apparel Bonus after the "apparelBonus.<slug>" (+) and
 * "apparelBonus.mult.<slug>" (×) modifiers, its Break Value and whether it is in use (equipped and not broken).
 * Without such modifiers the bonus is the base one.
 * @returns {{item: Item, slug: string, natural: boolean, bonus: number, breakValue: number, active: boolean}[]}
 */
export function apparelPieces(actor, bT, buckets = {}) {
  const out = [];
  for ( const item of actor.items ?? [] ) {
    if ( (item.type !== "apparel") || !item.system?.equipped ) continue;
    const slug = apparelSlug(item.name);
    const natural = !!item.system.natural;
    const keys = [...new Set([slug, ...(natural ? ["natural"] : [])])].filter(Boolean);
    let bonus = baseApparelBonus(item, bT);
    const add = keys.reduce((t, k) => t + (buckets[`apparelBonus.${k}`]?.total ?? 0), 0);
    const mults = keys.filter(k => buckets[`apparelBonus.mult.${k}`]);
    if ( add || mults.length ) {
      bonus += add;
      for ( const k of mults ) bonus *= buckets[`apparelBonus.mult.${k}`].total;
      bonus = Math.max(0, roundDown(bonus));
    }
    out.push({ item, slug, natural, bonus, breakValue: Number(item.system.breakValue ?? 3), active: !!item.system.isActive });
  }
  return out;
}

/** The formula variables of the pieces: { apparel: { <slug>: { bonus, break }, natural, top }, apparelWorn }. */
export function apparelVariables(pieces) {
  const apparel = {};
  const put = (key, v) => {
    const prev = apparel[key];
    // Two pieces with one name (or two Natural pieces): the larger bonus, the higher Break Value
    apparel[key] = prev ? { bonus: Math.max(prev.bonus, v.bonus), break: Math.max(prev.break, v.break) } : { ...v };
  };
  for ( const p of pieces ) {
    const v = { bonus: p.active ? p.bonus : 0, break: p.breakValue };
    if ( p.slug ) put(p.slug, v);
    if ( p.natural ) put("natural", v);
  }
  const top = pieces.find(p => p.active && (p.item.system.layer === "top"));
  apparel.top = { bonus: top?.bonus ?? 0, armor: (top && ["armor", "weights"].includes(top.item.system.category)) ? 1 : 0 };
  const apparelWorn = pieces.filter(p => p.active && !p.natural && !p.item.system.integrated).length;
  return { apparel, apparelWorn };
}

/** The Apparel pieces a trigger's resource names: "natural" (the Natural ones) or a name / slug (the equipped first). */
export function findApparel(actor, nameOrNatural) {
  const want = apparelSlug(nameOrNatural);
  const all = (actor?.items ?? []).filter?.(i => i.type === "apparel") ?? [];
  const match = (want === "natural") ? all.filter(i => i.system.natural) : all.filter(i => apparelSlug(i.name) === want);
  return match.sort((a, b) => Number(!!b.system.equipped) - Number(!!a.system.equipped));
}

/**
 * Change the Break Value of an Apparel piece (0–3): a piece at 0 is broken and inactive; raising it mends it. The
 * trigger effect "breakValue" (resource = the piece's name or "natural", value = ±). Through the GM when the user does
 * not own the actor.
 * @returns {Promise<string>}  the chat line ("Quillset: Break Value 0 → 1 (mended)"), "" when nothing changed
 */
export async function changeBreakValue(actor, nameOrNatural, delta) {
  const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
  const item = findApparel(actor, nameOrNatural)[0];
  if ( !item ) return L("DBU.Apparel.NoPiece", { name: String(nameOrNatural ?? "") });
  const before = Number(item.system.breakValue ?? 3);
  const after = Math.clamp(before + (Number(delta) || 0), 0, 3);
  if ( after === before ) return "";
  if ( item.isOwner ?? actor.isOwner ) await item.update({ "system.breakValue": after });
  else {
    const { safeUpdate } = await import("../socket.mjs");
    await safeUpdate(item, { "system.breakValue": after });
  }
  const note = (before === 0) && (after > 0) ? L("DBU.Apparel.Mended") : ((after === 0) ? L("DBU.Apparel.Broken") : "");
  return L("DBU.Apparel.BreakLine", { name: item.name, before, after }) + (note ? ` (${note})` : "");
}
