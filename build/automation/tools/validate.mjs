// Checks the automation entries written for Transformation effects (by hand or by the dbu-automation-mapper agent) and
// merges the valid ones. The vocabulary comes from the system itself (module/config.mjs for the modifier targets and
// tables, module/vocab/index.mjs for the trigger events, effects, modes, targets, durations and Maneuver keys); the
// variables and extra checks of the feature packages come from tools/vocab/a.mjs, b.mjs and c.mjs.
//
// usage: node validate.mjs --dump <effects.json> --out <merged.json> [--only <batch.json>] [--type racial] <entries>...
//   effects.json  the extractor's dump (DBU_DUMP_EFFECTS=<file> py -I build/extract_content.py ...)
//   entries       JSON objects keyed "slug|Trait|n" (a dir: every *.json in it, sorted); a later source replaces an
//                 earlier one's entry for the same key
//   --only        report only the problems and missing keys of the effects of that batch file
//   --type        count the effects without an entry among these types only (awakening, form, enhancement, evolved,
//                 racial)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); if ( i < 0 ) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const DUMP = opt("--dump"), OUT = opt("--out"), ONLY = opt("--only"), TYPES = opt("--type");
if ( !DUMP || !OUT || !args.length ) {
  console.error("usage: node validate.mjs --dump <effects.json> --out <merged.json> [--only <batch.json>] <entries>...");
  process.exit(1);
}

// ---- Vocabulary from the system ------------------------------------------------------------------------------------
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM = path.resolve(TOOLS, "../../../dbu-rpg/module");
const { DBU } = await import(pathToFileURL(path.join(SYSTEM, "config.mjs")).href);
const VOCAB = await import(pathToFileURL(path.join(SYSTEM, "vocab/index.mjs")).href);
// What the feature packages teach the validator (tools/vocab/a.mjs, b.mjs, c.mjs; see the comments there)
const PKGS = [];
for ( const name of ["a", "b", "c", "d", "e", "f", "g", "i", "l", "m", "n", "o", "p", "q", "r", "s", "v", "w", "x", "y"] ) PKGS.push({ name, ...(await import(pathToFileURL(path.join(TOOLS, "vocab", `${name}.mjs`)).href)) });
const fromPkgs = field => PKGS.flatMap(p => [...(p[field] ?? [])]);
const TARGETS = new Set(Object.keys(DBU.modifierTargets));
// Dynamic families (resMax.<slug>, resMaxSet.<slug>, ignoreState.<state>[.<level>].<n>)
const PREFIXES = DBU.MODIFIER_TARGET_PREFIXES ?? [];
const isTarget = t => TARGETS.has(t) || PREFIXES.some(p => String(t).startsWith(p) && (String(t).length > p.length));
// Targets whose value is text or dice, not a plain formula
const TEXT_TARGETS = new Set(["favoredElement", "attack.damageAttribute", ...fromPkgs("TEXT_TARGETS")]);
// (an entry ending in "." is a family: "fxLimit." holds every fxLimit.<ref>)
const isTextTarget = t => TEXT_TARGETS.has(t) || [...TEXT_TARGETS].some(p => p.endsWith(".") && String(t).startsWith(p));
const DICE_TARGETS = new Set(["recovery.bonus", "legend.bonus", ...fromPkgs("DICE_TARGETS")]);
// Option targets: mode ("ask") and limit are allowed on them
const OPTION_PREFIXES = ["attack.", "defense.", ...fromPkgs("OPTION_PREFIXES")];
const isOption = t => OPTION_PREFIXES.some(p => String(t).startsWith(p));
const STATES = Object.keys(DBU.states);
const CONDS = Object.keys(DBU.conditions);
const EVENTS = VOCAB.TRIGGER_EVENTS;
const EFFECTS = VOCAB.TRIGGER_EFFECTS;
const MODES = VOCAB.TRIGGER_MODES;
const DURATIONS = VOCAB.TRIGGER_DURATIONS;
const TRIGGER_TARGETS = VOCAB.TRIGGER_TARGETS;
const WITH_OTHER = new Set(["attackMade", "attackHit", "damaged", "attackMissed", "dodged", "threshold", "targeted", "use",
  ...fromPkgs("WITH_OTHER")]);
const MANEUVERS = VOCAB.MANEUVER_KEYS;
// (aa: Adversary Actions, only an Adversary with One-Man Army pays them, from its Counter Actions)
const COST_KINDS = ["ki", "kp", "life", "lp", "safelife", "safelp", "dkp", "capacity", "counters", "actions", "power", "charges", "res", "aa"];
const VERDICTS = ["modifiers", "triggers", "both", "code", "covered", "narrative"];
const CODE_CATS = ["attackOption", "versusTarget", "defenseOption", "maneuverChange", "outOfSequence", "areaEffect", "clash",
  "resourceRule", "transformationRule", "summon", "grant", "other"];
// Racial Traits are not Transformations: no Stacks, Mastery, Grade, Stage or "this Transformation"
const RACIAL_FORBIDDEN = /@(Z|ZP|ZB|M|MX|FM|G|GA|TR|S|this)(?![\w.])/;
const RACIAL_EVENTS_OFF = new Set(["stackGain", "grandAwakening", "burstLimit"]);

// Formula variables (module/rules/derived.mjs rollData, items formulaContext, the event scopes of combat/triggers.mjs)
// A list entry ending in "." or "_" is a family: "vs." allows @vs.<anything>, "mark_" allows @mark_<anything>.
const ATTACK_VARS = ["physical", "energy", "magic", "signature", "basic", "ultimate", "aoe", "charges", "wager", "category", "crit",
  "targets", "elemental", "dkpCost", "dkpWager", "kp", "dmgAttr", "favored", "calledShot", "oos", "armed", "unarmed",
  ...fromPkgs("ATTACK_VARS")];
// Variable families of an attack: @da_<attr>, @via_exploit..., @superProfile_<key>, @opt_<advantage>, @profile_<key>
const ATTACK_PREFIX_RE = [/^(da|via|superProfile|opt|profile)_/, ...fromPkgs("PREFIX_RE")];
const DEFENSE_VARS = ["dodge", "parry", "guard", "crossCounter", "directHit", "powerFlare", "none", "divineFlex", ...fromPkgs("DEFENSE_VARS")];
const EVENT_VARS = {
  attackMade: ATTACK_VARS,
  attackHit: [...ATTACK_VARS, "damage", "knocked", "defeated", "targetBelow", "critWound", "guard"],
  damaged: [...ATTACK_VARS, "damage", "knocked", "defeated", "targetBelow", "critWound", "guard"],
  attackMissed: [...ATTACK_VARS, ...DEFENSE_VARS],
  dodged: [...ATTACK_VARS, ...DEFENSE_VARS],
  threshold: ["crossed", "bruised", "injured", "critical", "defeated", "failedNow", "selfInflicted"],
  transform: ["form", "enhancement", "topReq", "stage", "this"],
  revert: ["form", "enhancement", "this"],
  burstLimit: ["this"],
  powerUp: ["powerNow"], surge: ["healingSurge", "kiSurge", "healed"], energyCharge: ["heldCharges"], stateEnter: ["level"],
  grandAwakening: [],
  targeted: ATTACK_VARS,
  // A Trait use (sheet button): the amount picked and the moment
  use: ["n", "inCombat", "round", "turn"]
};
for ( const p of PKGS ) {
  for ( const [event, vars] of Object.entries(p.EVENT_VARS ?? {}) ) EVENT_VARS[event] = [...(EVENT_VARS[event] ?? []), ...vars];
}
const ATTACK_OPTION_VARS = ["physical", "energy", "magic", "signature", "basic", "ultimate", "aoe", "charges", "elemental", "wager",
  "dkpCost", "dkpWager", "kp", "dmgAttr", "favored", "calledShot", "oos", "armed", "unarmed", ...fromPkgs("ATTACK_OPTION_VARS")];
// Defend without a Counter Action (defense.*): the Defend option chosen and the attack
const DEFENSE_OPTION_VARS = [...DEFENSE_VARS, ...ATTACK_VARS, ...fromPkgs("DEFENSE_OPTION_VARS")];
// attack.* pieces offered when the Wound Roll is made (at: "wound")
const WOUND_OPTION_VARS = [...ATTACK_OPTION_VARS, ...fromPkgs("WOUND_OPTION_VARS")];
// vs.* pieces (per attacker/target pair) and clash.* pieces
const VS_VARS = [...ATTACK_VARS, ...DEFENSE_VARS, ...fromPkgs("VS_VARS")];
const CLASH_VARS = [...fromPkgs("CLASH_VARS")];
// More variables for the modifiers on a target ("<target>" or "<prefix.>"), and for a modifier/trigger with a field set
const TARGET_VARS = {};
const FIELD_VARS = { amount: ["n"], group: ["n"] };
for ( const p of PKGS ) {
  for ( const [k, vars] of Object.entries(p.TARGET_VARS ?? {}) ) TARGET_VARS[k] = [...(TARGET_VARS[k] ?? []), ...vars];
  for ( const [k, vars] of Object.entries(p.FIELD_VARS ?? {}) ) FIELD_VARS[k] = [...(FIELD_VARS[k] ?? []), ...vars];
}
const fieldVars = x => Object.entries(FIELD_VARS).flatMap(([field, vars]) => (x?.[field] ? vars : []));
/** The variables a modifier's value and condition may use: its target's family, then TARGET_VARS and FIELD_VARS. */
function modifierVars(m) {
  const t = String(m.target ?? "");
  const base = t.startsWith("defense.") ? DEFENSE_OPTION_VARS
    : t.startsWith("attack.") ? ((m.at === "wound") ? WOUND_OPTION_VARS : ATTACK_OPTION_VARS)
    : t.startsWith("vs.") ? VS_VARS : t.startsWith("clash.") ? CLASH_VARS : [];
  const extra = Object.entries(TARGET_VARS).filter(([k]) => (t === k) || (k.endsWith(".") && t.startsWith(k))).flatMap(([, v]) => v);
  return [...base, ...extra, ...fieldVars(m)];
}
/** The variables a trigger's value, condition and cost may use. */
// (6Y: a "targeted" trigger with a roll or a check is tested when clicked, against the target: @vs.* of that target)
const triggerVars = t => [...(EVENT_VARS[t.event] ?? []), ...fieldVars(t), ...(((t.target === "targeted") && (t.roll || t.check)) ? ["vs."] : [])];
const BASE_VARS = new Set(["Z", "ZP", "ZB", "M", "MX", "FM", "G", "GA", "TR", "S", "L", "N", "B", "below", "failed", "life", "lifeMax", "ki",
  "kiMax", "capacity", "capacityMax", "kiLow", "power", "superStacks", "holdingBack", "transformed", "inForm", "inEnhancement",
  "enhancementCount", "allies", "opponents", "myTurn", "counters", "actions", "heldCharges", "grappled", "grappling", "ag", "fo",
  "te", "sc", "in", "ma", "pe", "PL", "T", "bT", "might", "size", "dkp", "alignment", "kiMaxBase", "stress", "powerMax", "powerSpiked",
  "dkpMax", "highestTopReq", "activeCount", "powerUps", "opponentTop", ...fromPkgs("BASE_VARS")]);
const PREFIX_VARS = ["states", "cond", "res", "awk", "allyAwk", "active", "picked", "scores", "aptitudes", "attributes", "aspects",
  "inLine", "mastery", "fm", "transcended", "resMax", "amb", ...fromPkgs("PREFIX_VARS")];
const isFamily = v => v.endsWith(".") || v.endsWith("_");
const BASE_FAMILIES = [...BASE_VARS].filter(isFamily);
const inFamily = (v, list) => list.some(f => isFamily(f) && v.startsWith(f) && (v.length > f.length));

// ---- DBU notation → JS (same rules as module/rules/formula.mjs) ----------------------------------------------------
function applyScale(s, token, variable) {
  const re = new RegExp(`\\(\\s*${token}\\s*\\)`);
  let m; let guard = 0;
  while ( (m = re.exec(s)) && (guard++ < 100) ) {
    const start = m.index, end = start + m[0].length;
    let j = start - 1;
    while ( (j >= 0) && (s[j] === " ") ) j--;
    let from = null;
    if ( (j >= 0) && (s[j] === ")") ) {
      let depth = 0;
      for ( let k = j; k >= 0; k-- ) { if ( s[k] === ")" ) depth++; else if ( (s[k] === "(") && (--depth === 0) ) { from = k; break; } }
      if ( from !== null ) { let k = from - 1; while ( (k >= 0) && /\w/.test(s[k]) ) k--; from = k + 1; }
    }
    else if ( (j >= 0) && /[\w.@]/.test(s[j]) ) {
      let k = j;
      while ( (k >= 0) && /[\w.@]/.test(s[k]) ) k--;
      from = k + 1;
      const frac = /(\d+(?:\.\d+)?)\/$/.exec(s.slice(0, from));
      if ( frac && /^\d/.test(s.slice(from)) && !/[\w.@)]$/.test(s.slice(0, from - frac[0].length)) ) from -= frac[0].length;
    }
    s = (from === null) ? `${s.slice(0, start)}(${variable})${s.slice(end)}` : `${s.slice(0, from)}(${s.slice(from, j + 1)}*${variable})${s.slice(end)}`;
  }
  return s;
}
function toExpression(input) {
  let s = String(input ?? "").trim();
  if ( !s ) return "0";
  s = s.replace(/[–−]/g, "-").replace(/×/g, "*");
  s = s.replace(/(^|[^@\w.])([GSZMLN])(?!\w)/g, (m, pre, v) => `${pre}@${v}`);
  s = applyScale(s, "bT", "@bT");
  s = applyScale(s, "T", "@T");
  s = s.replace(/(^|[^@\w.])T(?!\w)/g, "$1@T");
  return s;
}
function check(formula, allowed, what, inTrigger = false) {
  const problems = [];
  const expr = toExpression(formula);
  for ( const v of [...expr.matchAll(/@([\w.]+)/g)].map(m => m[1]) ) {
    const root = v.split(".")[0];
    if ( PREFIX_VARS.includes(root) ) {
      const sub = v.split(".")[1];
      if ( !sub ) problems.push(`${what}: @${v} needs a key`);
      else if ( (root === "states") && !STATES.includes(sub) ) problems.push(`${what}: unknown state @${v}`);
      else if ( (root === "cond") && !CONDS.includes(sub) ) problems.push(`${what}: unknown condition @${v}`);
      continue;
    }
    if ( BASE_VARS.has(root) || allowed.includes(root) || /^(profile|line|state|awk)_/.test(root) ) continue;
    if ( inFamily(v, BASE_FAMILIES) || inFamily(v, allowed) ) continue;
    if ( allowed.includes("charges") && ATTACK_PREFIX_RE.some(re => re.test(root)) ) continue;
    if ( inTrigger && ["round", "even", "turn"].includes(root) ) continue;
    problems.push(`${what}: unknown variable @${v}`);
  }
  try {
    // eslint-disable-next-line no-new-func
    const v = Function("M", `with (M) { return (${expr.replace(/@[\w.]+/g, "1")}); }`)(Math);
    if ( (typeof v !== "number") && (typeof v !== "boolean") ) problems.push(`${what}: "${formula}" is not a number`);
  } catch(err) { problems.push(`${what}: "${formula}" does not parse (${err.message})`); }
  return problems;
}
const norm = s => String(s).toLowerCase().replace(/(special )?(state|combat condition)$/i, "").replace(/[^a-z0-9]/g, "");
/** "1/Round, 3/Encounter" → its parts (commas inside a formula's parentheses do not split). */
function splitTop(text) {
  const out = [];
  let depth = 0, cur = "";
  for ( const ch of text ) {
    if ( ch === "(" ) depth++;
    if ( ch === ")" ) depth--;
    if ( ((ch === ",") || (ch === ";")) && (depth === 0) ) { if ( cur.trim() ) out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if ( cur.trim() ) out.push(cur.trim());
  return out;
}
/** The variables a formula names ("vs.cond.shaken", "mark_inferior"...). */
const variables = formula => [...toExpression(formula).matchAll(/@([\w.]+)/g)].map(m => m[1]);
/** A limit: "1/Round", "2/Encounter", "M/Encounter", "1/Round, 3/Encounter" (a count may be a formula). */
function checkLimit(limit, what) {
  const problems = [];
  for ( const part of splitTop(String(limit ?? "")) ) {
    const lm = /^(.+?)\s*\/\s*(round|encounter|turn)$/i.exec(part);
    if ( !lm ) { problems.push(`${what}: limit "${limit}"`); continue; }
    if ( !/^\d+$/.test(lm[1].trim()) ) problems.push(...check(lm[1], [], `${what} limit`, true));
  }
  return problems;
}
/** A cost: "ki:2(bT); counters:1; res:Battle Born:all" (the amounts may use vars). */
function checkCost(cost, vars, what) {
  const problems = [];
  for ( const c of String(cost ?? "").split(";").map(x => x.trim()).filter(Boolean) ) {
    const [kind, ...rest] = c.split(":").map(x => x.trim());
    if ( !COST_KINDS.includes(kind) ) { problems.push(`${what}: cost kind "${kind}"`); continue; }
    const amount = kind === "res" ? rest[1] : rest[0];
    if ( (kind === "res") && !rest[0] ) problems.push(`${what}: cost "${c}" needs a resource name`);
    if ( !amount ) { problems.push(`${what}: cost "${c}" needs an amount`); continue; }
    if ( !((kind === "res") && (amount === "all")) ) problems.push(...check(amount, vars, `${what} cost`, true));
  }
  return problems;
}
// What the packages' checkModifier / checkTrigger / checkEntry receive (key, entry, effect and racial are set per entry)
const ctx = {
  key: "", entry: null, effect: null, racial: false,
  DBU, VOCAB, STATES, CONDS, EVENTS, EFFECTS, MODES, DURATIONS, MANEUVERS, TRIGGER_TARGETS, COST_KINDS,
  EVENT_VARS, BASE_VARS, PREFIX_VARS, ATTACK_VARS, DEFENSE_VARS, ATTACK_OPTION_VARS, DEFENSE_OPTION_VARS, WOUND_OPTION_VARS,
  VS_VARS, CLASH_VARS, TARGET_VARS, FIELD_VARS, WITH_OTHER, OPTION_PREFIXES, TEXT_TARGETS, DICE_TARGETS, ATTACK_PREFIX_RE,
  check, variables, toExpression, splitTop, checkLimit, checkCost, isTarget, isOption, modifierVars, triggerVars, fieldVars, norm
};
/** Runs a package hook; a hook that throws is reported as a problem of the entry. */
function hook(fn, args) {
  const out = [];
  for ( const p of PKGS ) {
    if ( typeof p[fn] !== "function" ) continue;
    try { out.push(...(p[fn](...args, ctx) ?? [])); }
    catch(err) { out.push(`tools/vocab/${p.name}.mjs ${fn}: ${err.message}`); }
  }
  return out;
}

// ---- Read ------------------------------------------------------------------------------------------------------------
const dump = JSON.parse(fs.readFileSync(DUMP, "utf8"));
const byKey = new Map(dump.map(d => [d.key, d]));
const onlyKeys = ONLY ? new Set(JSON.parse(fs.readFileSync(ONLY, "utf8")).map(e => e.key)) : null;
const entries = {};
const problems = [...VOCAB.CONFLICTS];
const files = [];
for ( const src of args ) {
  const list = fs.statSync(src).isDirectory()
    ? fs.readdirSync(src).filter(f => f.endsWith(".json")).sort().map(f => path.join(src, f)) : [src];
  const seen = new Set();
  for ( const f of list ) {
    files.push(f);
    let o;
    try { o = JSON.parse(fs.readFileSync(f, "utf8")); }
    catch(err) { problems.push(`${f}: invalid JSON (${err.message})`); continue; }
    for ( const [key, e] of Object.entries(o) ) {
      if ( seen.has(key) ) problems.push(`${key}: written twice in ${src} (${path.basename(f)})`);
      seen.add(key);
      entries[key] = e;
    }
  }
}

// ---- Check -----------------------------------------------------------------------------------------------------------
const valid = {};
const stats = { verdict: {}, rejected: 0, modifiers: 0, triggers: 0, code: 0, codeCats: {} };
for ( const [key, e] of Object.entries(entries) ) {
  const own = [];
  if ( !byKey.has(key) ) { problems.push(`${key}: no such effect`); stats.rejected++; continue; }
  if ( !VERDICTS.includes(e.verdict) ) own.push(`verdict "${e.verdict}"`);
  Object.assign(ctx, { key, entry: e, effect: byKey.get(key), racial: byKey.get(key).transType === "racial" });
  for ( const [i, m] of (e.modifiers ?? []).entries() ) {
    const option = isOption(m.target);
    const vars = modifierVars(m);
    if ( !isTarget(m.target) ) own.push(`modifier ${i}: unknown target "${m.target}"`);
    if ( m.target === "attack.damageAttribute" ) {
      if ( !/^(any|surgency|ag|fo|te|sc|in|ma|pe)([|,\/;](surgency|ag|fo|te|sc|in|ma|pe))*$/i.test(String(m.value ?? "").trim()) ) {
        own.push(`modifier ${i}: damageAttribute value "${m.value}"`);
      }
    }
    else if ( DICE_TARGETS.has(m.target) ) own.push(...check(String(m.value).replace(/\d*d\d+/gi, "1"), vars, `modifier ${i} value`));
    else if ( !isTextTarget(m.target) ) own.push(...check(m.value, vars, `modifier ${i} value`));
    if ( m.condition ) own.push(...check(m.condition, vars, `modifier ${i} condition`));
    if ( m.mode && !VOCAB.MODIFIER_MODES.includes(m.mode) ) own.push(`modifier ${i}: mode "${m.mode}"`);
    if ( (m.mode || m.limit) && !option ) own.push(`modifier ${i}: mode/limit only on ${OPTION_PREFIXES.map(p => `${p}*`).join(" / ")} targets`);
    if ( m.limit ) own.push(...checkLimit(m.limit, `modifier ${i}`));
    own.push(...hook("checkModifier", [m, i]));
  }
  for ( const [i, t] of (e.triggers ?? []).entries() ) {
    if ( !EVENTS.includes(t.event) ) own.push(`trigger ${i}: unknown event "${t.event}"`);
    if ( !EFFECTS.includes(t.effect) ) own.push(`trigger ${i}: unknown effect "${t.effect}"`);
    if ( t.target && !TRIGGER_TARGETS.includes(t.target) ) own.push(`trigger ${i}: target "${t.target}"`);
    if ( (t.target === "other") && !WITH_OTHER.has(t.event) ) own.push(`trigger ${i}: no other Character on ${t.event}`);
    if ( t.mode && !MODES.includes(t.mode) ) own.push(`trigger ${i}: mode "${t.mode}"`);
    if ( t.duration && !DURATIONS.includes(t.duration) ) own.push(`trigger ${i}: duration "${t.duration}"`);
    own.push(...checkLimit(t.limit, `trigger ${i}`));
    const vars = triggerVars(t);
    if ( t.amount ) own.push(...check(t.amount, EVENT_VARS[t.event] ?? [], `trigger ${i} amount`, true));
    own.push(...checkCost(t.cost, vars, `trigger ${i}`));
    if ( ["state", "condition"].includes(t.effect) ) {
      const table = t.effect === "state" ? STATES : CONDS;
      if ( !table.some(k => (k === t.resource) || (norm(k) === norm(t.resource ?? ""))) ) own.push(`trigger ${i}: unknown ${t.effect} "${t.resource}"`);
    }
    if ( ["resource", "resourceSet"].includes(t.effect) && !String(t.resource ?? "").trim() ) own.push(`trigger ${i}: resource name missing`);
    // a key, or a key family ("item:<Name>")
    const maneuverKey = r => MANEUVERS.includes(r.trim()) || (VOCAB.MANEUVER_PREFIXES ?? []).some(p => r.trim().startsWith(p) && (r.trim().length > p.length));
    if ( (t.effect === "maneuver") && !String(t.resource ?? "").split("|").every(maneuverKey) ) own.push(`trigger ${i}: unknown maneuver "${t.resource}"`);
    if ( t.effect === "buff" ) {
      if ( !isTarget(t.resource) || String(t.resource).startsWith("attack.") || String(t.resource).startsWith("defense.") ) own.push(`trigger ${i}: buff target "${t.resource}"`);
      if ( !t.duration || (t.duration === "none") ) own.push(`trigger ${i}: buff without duration`);
    }
    if ( (t.duration === "untilRevert") && !["buff", "state", "condition"].includes(t.effect) ) own.push(`trigger ${i}: untilRevert only for buff/state/condition`);
    if ( (t.effect !== "message") && (t.value !== undefined) && (t.value !== "") ) own.push(...check(t.value, vars, `trigger ${i} value`, true));
    if ( t.condition ) own.push(...check(t.condition, vars, `trigger ${i} condition`, true));
    own.push(...hook("checkTrigger", [t, i]));
  }
  if ( e.code && !CODE_CATS.includes(e.code.category) ) own.push(`code category "${e.code.category}"`);
  own.push(...hook("checkEntry", [e, key]));
  if ( byKey.get(key).transType === "racial" ) {
    const formulas = [
      ...(e.modifiers ?? []).flatMap(m => [isTextTarget(m.target) ? "" : m.value, m.condition, m.cost, m.amount, m.limit]),
      ...(e.triggers ?? []).flatMap(t => [t.effect === "message" ? "" : t.value, t.condition, t.cost, t.amount, t.limit])
    ].filter(Boolean).map(String);
    for ( const f of formulas ) {
      const bad = RACIAL_FORBIDDEN.exec(toExpression(f.replace(/res:[^:;]+:/g, "")));
      if ( bad ) own.push(`a Racial Trait has no @${bad[1]} ("${f}")`);
    }
    for ( const [i, t] of (e.triggers ?? []).entries() ) {
      if ( RACIAL_EVENTS_OFF.has(t.event) ) own.push(`trigger ${i}: event ${t.event} is for Transformations`);
      if ( t.duration === "untilRevert" ) own.push(`trigger ${i}: untilRevert is for Transformations`);
    }
  }
  if ( own.length ) { problems.push(`${key}: ${own.join("; ")}`); stats.rejected++; continue; }
  stats.verdict[e.verdict] = (stats.verdict[e.verdict] ?? 0) + 1;
  stats.modifiers += e.modifiers?.length ?? 0;
  stats.triggers += e.triggers?.length ?? 0;
  if ( e.code ) { stats.code++; stats.codeCats[e.code.category] = (stats.codeCats[e.code.category] ?? 0) + 1; }
  // "covered" adds nothing (kept so that batches.mjs --new knows it was reviewed); "narrative" is shown as such on the item
  if ( (e.verdict === "covered") && !e.modifiers?.length && !e.triggers?.length ) { valid[key] = { verdict: "covered" }; continue; }
  if ( (e.verdict === "narrative") && !e.modifiers?.length && !e.triggers?.length ) { valid[key] = { verdict: "narrative", status: "narrativo" }; continue; }
  valid[key] = e;
}

// ---- Report ----------------------------------------------------------------------------------------------------------
fs.writeFileSync(OUT, JSON.stringify(valid, null, 1));
const shown = onlyKeys ? problems.filter(p => onlyKeys.has(p.split(": ")[0])) : problems;
const types = TYPES ? new Set(TYPES.split(",").map(s => s.trim())) : null;
const scope = onlyKeys ? [...onlyKeys] : dump.filter(d => !types || types.has(d.transType ?? "awakening")).map(d => d.key);
const missing = scope.filter(k => !entries[k]);
console.log(JSON.stringify({ files: files.length, entries: Object.keys(entries).length, written: Object.keys(valid).length, stats }, null, 1));
console.log(`problems${onlyKeys ? " in this batch" : ""}: ${shown.length}`);
if ( shown.length ) console.log(shown.slice(0, 80).join("\n"));
console.log(`effects${onlyKeys ? " of this batch" : ""} without an entry: ${missing.length}${missing.length ? ` (${missing.slice(0, 30).join(", ")})` : ""}`);
