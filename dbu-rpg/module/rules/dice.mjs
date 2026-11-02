/**
 * Dice Category helpers.
 * Category index: 1 = d4, 2 = d6, 3 = d8, 4 = d10, 5 = d10+d4, 6 = d10+d6, 7 = d10+d8, 8 = 2d10 ...
 */

const REMAINDER_FACES = { 1: 4, 2: 6, 3: 8 };

/**
 * Break a Dice Category into dice groups.
 * @param {number} category  Dice Category index (0 or less = no dice)
 * @param {number} mult      Multiplier applied to every die count, e.g. the ToP for "(T)" dice
 * @returns {{number: number, faces: number}[]}
 */
export function categoryToDice(category, mult = 1) {
  const cat = Math.floor(category);
  if ( (cat <= 0) || (mult <= 0) ) return [];
  const groups = [];
  const d10s = Math.floor(cat / 4);
  const rem = cat % 4;
  if ( d10s > 0 ) groups.push({ number: d10s * mult, faces: 10 });
  if ( rem > 0 ) groups.push({ number: mult, faces: REMAINDER_FACES[rem] });
  return groups;
}

/** Render dice groups as a Roll formula fragment, e.g. "2d10 + 1d4". */
export function diceToFormula(groups, flavor) {
  const tag = flavor ? `[${flavor}]` : "";
  return groups.map(g => `${g.number}d${g.faces}${tag}`).join(" + ");
}

/** Short human label for a Dice Category, e.g. "1d10+1d4". */
export function categoryLabel(category, mult = 1) {
  const groups = categoryToDice(category, mult);
  if ( !groups.length ) return "—";
  return groups.map(g => `${g.number}d${g.faces}`).join("+");
}

/** Base Dice Category of the Tier of Power Extra Dice (none at ToP 1, d4 at ToP 2...). */
export function topDiceCategory(top) {
  return Math.max(0, top - 1);
}

/** Base Dice Category of the Critical Result Extra Dice (d6 at ToP 1, d8 at ToP 2...). */
export function critDiceCategory(top) {
  return top + 1;
}

/** Base Dice Category of Greater Dice (d4 at ToP 1, d6 at ToP 2...). */
export function greaterDiceCategory(top) {
  return top;
}

/**
 * Apply Dice Category increases while honouring the Category Increase Limit
 * (no more than base ToP + 1 increases, except for Energy Charges).
 */
export function increaseCategory(base, increase, baseTop, { limited = true } = {}) {
  let inc = increase;
  if ( limited ) inc = Math.min(inc, baseTop + 1);
  // At ToP 1 the ToP Extra Dice start at nothing: +1 category gives a d4.
  return Math.max(0, base + inc);
}
