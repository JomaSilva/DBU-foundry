/**
 * Formula evaluation for modifiers written in DBU notation.
 *
 * Accepted notation (case-sensitive):
 *   "2(T)"      → 2 × current Tier of Power
 *   "1(bT)"     → 1 × base Tier of Power
 *   "@L(T)"     → state Level × ToP;   "-@L(T)" works too
 *   "G(T)"      → Grade × ToP (bare G, S, Z, M, L, N become @G, @S ...)
 *   "1/2"       → 0.5 (results are rounded down at the end, Round Down rule)
 *   any Math function: floor(), ceil(), min(), max(), abs(), round()
 *   any @path from the evaluation data, e.g. @power, @below, @fo, @scores.ag
 */

/** Convert DBU notation into an expression understood by Roll.replaceFormulaData + Roll.safeEval. */
export function toExpression(input) {
  let s = String(input ?? "").trim();
  if ( !s ) return "0";
  s = s.replace(/[–−]/g, "-").replace(/×/g, "*");
  // Bare single-letter variables (not already prefixed by @ and not part of a word)
  s = s.replace(/(^|[^@\w.])([GSZMLN])(?!\w)/g, (m, pre, v) => `${pre}@${v}`);
  // X(bT) / X(T) where X is a number, a fraction, an @var or a (nested) parenthesised group
  s = applyScale(s, "bT", "@bT");
  s = applyScale(s, "T", "@T");
  // A bare "T" left over (e.g. "T*2") means current ToP
  s = s.replace(/(^|[^@\w.])T(?!\w)/g, "$1@T");
  return s;
}

/** Replace every "X(T)" with "(X*@T)", finding X by walking back over balanced parentheses; a lone "(T)" is 1(T). */
function applyScale(s, token, variable) {
  const re = new RegExp(`\\(\\s*${token}\\s*\\)`);
  let m;
  let guard = 0;
  while ( (m = re.exec(s)) && (guard++ < 100) ) {
    const start = m.index;
    const end = start + m[0].length;
    let j = start - 1;
    while ( (j >= 0) && (s[j] === " ") ) j--;
    let from = null;
    if ( (j >= 0) && (s[j] === ")") ) {
      let depth = 0;
      for ( let k = j; k >= 0; k-- ) {
        if ( s[k] === ")" ) depth++;
        else if ( (s[k] === "(") && (--depth === 0) ) { from = k; break; }
      }
      // Keep a function name with its arguments: floor(@x/2)(T)
      if ( from !== null ) {
        let k = from - 1;
        while ( (k >= 0) && /\w/.test(s[k]) ) k--;
        from = k + 1;
      }
    }
    else if ( (j >= 0) && /[\w.@]/.test(s[j]) ) {
      let k = j;
      while ( (k >= 0) && /[\w.@]/.test(s[k]) ) k--;
      from = k + 1;
      // A plain fraction such as 1/4(T) scales as a whole
      const frac = /(\d+(?:\.\d+)?)\/$/.exec(s.slice(0, from));
      if ( frac && /^\d/.test(s.slice(from)) && !/[\w.@)]$/.test(s.slice(0, from - frac[0].length)) ) from -= frac[0].length;
    }
    s = (from === null) ? `${s.slice(0, start)}(${variable})${s.slice(end)}`
      : `${s.slice(0, from)}(${s.slice(from, j + 1)}*${variable})${s.slice(end)}`;
  }
  return s;
}

/**
 * Evaluate a DBU formula into a number.
 * @param {string|number} input
 * @param {object} data   Roll-data style object
 * @param {object} [options]
 * @param {boolean} [options.floor=true]  Apply the Round Down rule
 * @returns {number}
 */
export function evaluate(input, data = {}, { floor = true } = {}) {
  if ( typeof input === "number" ) return floor ? Math.floor(input) : input;
  if ( (input === undefined) || (input === null) || (String(input).trim() === "") ) return 0;
  const expr = toExpression(input);
  try {
    const replaced = Roll.replaceFormulaData(expr, data, { missing: "0", warn: false });
    const value = Roll.safeEval(replaced);
    if ( !Number.isFinite(value) ) return 0;
    return floor ? roundDown(value) : value;
  } catch(err) {
    console.warn(`DBU | Could not evaluate formula "${input}"`, err);
    return 0;
  }
}

/** Evaluate a condition formula: empty → true, otherwise truthy number. */
export function test(condition, data = {}) {
  if ( (condition === undefined) || (condition === null) || (String(condition).trim() === "") ) return true;
  const expr = toExpression(condition);
  try {
    const replaced = Roll.replaceFormulaData(expr, data, { missing: "0", warn: false });
    return !!Roll.safeEval(replaced);
  } catch(err) {
    console.warn(`DBU | Could not evaluate condition "${condition}"`, err);
    return false;
  }
}

/** Round toward negative infinity for positives, toward zero for negatives (penalties never grow by rounding). */
export function roundDown(value) {
  return value >= 0 ? Math.floor(value + 1e-9) : -Math.floor(-value + 1e-9);
}

/**
 * Evaluate a dice expression such as "1d6(T)" or "2d4" into a concrete Roll formula fragment ("3d6").
 * Returns "" when the expression has no dice.
 */
export function diceFormula(input, data = {}) {
  const s = String(input ?? "").trim();
  if ( !/\d*d\d+/i.test(s) ) return "";
  return s.replace(/(\d*)d(\d+)\s*(\(\s*b?T\s*\))?/gi, (m, n, faces, scale) => {
    let count = Number(n || 1);
    if ( scale ) count *= /b/i.test(scale) ? (data.bT ?? 1) : (data.T ?? 1);
    return `${count}d${faces}`;
  });
}

/** Render a modifier value for display (e.g. "+2" or "-1"). */
export function signed(value) {
  const n = Number(value) || 0;
  return n >= 0 ? `+${n}` : `${n}`;
}
