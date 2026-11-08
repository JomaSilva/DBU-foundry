import { DBU } from "../config.mjs";
import { evaluate, hasDice, rollExpression, test } from "./formula.mjs";
import { limitedPower, pushOptionalModifiers, rule } from "../optional-rules.mjs";
import { stackChoiceCount } from "./awakening.mjs";
import { fxForcedOn, fxPiece, isPassTarget } from "./fx.mjs";
import { allyPieces, isAllyTarget } from "./allies.mjs";

/**
 * A rule modifier gathered from any source.
 * @typedef {object} DBUModifier
 * @property {string} target     A key of DBU.modifierTargets
 * @property {string} value      Formula in DBU notation
 * @property {string} condition  Optional condition formula
 * @property {string} label      Human readable source
 * @property {object} ctx        Extra formula variables for this source (@L, @N, @G, @S, @Z, @M, @B)
 * @property {string} [itemId]
 */

/** Targets resolved before Attribute Modifiers exist (they may only use PL/ToP/state data). */
const EARLY_TARGETS = new Set(["top", "ki.max", "ki.mult", "capacity.max", "capacity.mult", "topDice.extra", "fatiguedMin",
  "dotMin", "life.mult", "superStacks", "skillImprovements"]);
const ATTRIBUTE_TARGETS = /^(score|mod)\./;
/**
 * Targets resolved before every other one (stage -1): the Power maximum and "Power Spiked" (stage-0 bonuses may depend
 * on @powerSpiked) and the State effects ignored (they suppress built-in State modifiers of any stage).
 */
// (H: "holdingBack.ignore" too: the Holding Back stacks are read for the Tier of Power, before stage 0)
const PRE_TARGETS = new Set(["power.max", "flag.powerSpiked", "holdingBack.ignore"]);
const PRE_PREFIX = /^ignoreState\./;
/**
 * Targets resolved between the Attribute Modifiers and the rest, with the same formula data as stage 2: first the Racial
 * Life Modifier and the Size (stage 1.5: @rlm, @sizeNow), then the Size Categories used for the DV / Soak bonus and the
 * Apparel Bonus of each piece (stage 1.75: they may read @rlm and @sizeNow; @sizeDv, @sizeSoak, @apparel.<slug>.bonus).
 * Stage 2 may read all of them.
 */
const MID_TARGETS = new Set(["rlm", "size", "size.min"]);
const MID_PREFIX = /^(apparelBonus|sizeAs)\./;
/**
 * Late variables, known only after the Aptitudes (@soakNow, @surgencyNow, @dvNow) or the Technique Points (@tp): a
 * modifier naming one of them is evaluated in a late pass (stage "late"; "lateTp" for a Max LP one that only names @tp).
 */
const LATE_VARS = /@(soakNow|surgencyNow|dvNow|tp)(?![\w.])/;
const LATE_NOT_TP = /@(soakNow|surgencyNow|dvNow)(?![\w.])/;
const formulasOf = m => `${m.value ?? ""} ${m.condition ?? ""}`;
/** Does a modifier name a late variable (in its value or its condition)? */
export function isLateModifier(m) {
  return !!m && LATE_VARS.test(formulasOf(m));
}
/**
 * Multipliers whose value may be 0 (a multiplier of 0 is ignored for the other ".mult" targets, as before); the ones
 * without ".mult" in their name multiply too.
 */
const ZERO_MULT = new Set(["dimDefense.mult", "surgency.mult", "soak.mult", "legend.mult", "dkp.mult", "recovery.kiMult",
  "surge.kiMult", "surge.healSurgency", "charge.kpMult", "dimOffense.mult", "dimDefense.penaltyMult"]);
/** Targets whose value is text, read where they are used (never summed). */
const TEXT_TARGETS = new Set(["favoredElement", "attack.damageAttribute", "attack.aoe", "attack.state"]);
/** Targets that may hold dice ("1d6(bT)"): read with {@link modifierTerms} where they are used. */
const DICE_TARGETS = new Set(["recovery.bonus", "legend.bonus", "surge.healBonus"]);

/** The stage of a target (-1, 0, 1, 1.5, 1.75, 2); given the modifier, "late" / "lateTp" when it names a late variable. */
export function modifierStage(target, mod = null) {
  if ( mod && isLateModifier(mod) ) return ((target === "life.final") && !LATE_NOT_TP.test(formulasOf(mod))) ? "lateTp" : "late";
  if ( PRE_TARGETS.has(target) || PRE_PREFIX.test(target) ) return -1;
  if ( EARLY_TARGETS.has(target) ) return 0;
  if ( ATTRIBUTE_TARGETS.test(target) ) return 1;
  if ( MID_TARGETS.has(target) ) return 1.5;
  if ( MID_PREFIX.test(target) ) return 1.75;
  return 2;
}

/** Is this target a multiplier (bucket total = product of its values)? */
export function isMultTarget(target) {
  // "x.mult", "x.mult.<key>" (tpStart.mult.physical, apparelBonus.mult.<slug>) and "x.<thing>Mult" (dimDefense.penaltyMult)
  return /\.mult(\.|$)/.test(target) || /\.\w+Mult$/.test(target) || ZERO_MULT.has(target);
}

/** A Twinned effect of a Custom Species Racial Trait (label "<Trait> (Twinned)") only works when the Trait is Twinned. */
export function twinnedOff(item, piece) {
  return (item.type === "racialTrait") && !item.system.twinned && String(piece?.label ?? "").endsWith(" (Twinned)");
}

/**
 * Gather every modifier that applies to an actor right now.
 * Aspects are merged across active Transformations (shared Aspects do not double up, levels add).
 */
export function collectModifiers(actor, system) {
  const list = [];
  // extra: tags read by the rules engine (state/n/lv: a built-in State effect; amb: a Transformation's Attribute Modifier
  // Bonus for that Attribute)
  // D1: what the other effects do to a piece (fxOff / fxMult / fxAdd / fxLimit, rules/fx.mjs); worked out by derived.mjs
  const fx = system?._fx ?? null;
  const push = (mod, label, ctx = {}, itemId, extra = null) => {
    if ( !mod?.target || (mod.active === false) ) return;
    if ( mod.fx && fx ) {
      mod = fxPiece(mod, fx);
      if ( !mod ) return;
    }
    list.push({ target: mod.target, value: mod.value ?? "", condition: mod.condition ?? "", label, ctx, itemId,
      mode: mod.mode ?? "", limit: mod.limit ?? "", own: mod.label ?? "",
      // The other fields of an option piece (rules/options.mjs): blank when unused
      cost: String(mod.cost ?? "").trim(), amount: String(mod.amount ?? "").trim(), group: String(mod.group ?? "").trim(),
      limitKey: String(mod.limitKey ?? "").trim(), at: String(mod.at ?? "").trim(), fx: mod.fx ?? "", ...(extra ?? {}) });
  };
  // A Trait possessed at all times (a Legendary Trait, S-Cells...) counts once, even when several Transformations carry
  // it (a lower Stage and the higher one that inherits it, a Variant and its listed Transformation)
  const possessed = new Set();
  const pushItemModifier = (m, label, ctx, itemId) => {
    if ( m.always && (m.active !== false) ) {
      const key = [m.label, m.target, m.value, m.condition].join("|");
      if ( possessed.has(key) ) return;
      possessed.add(key);
    }
    push(m, label, ctx, itemId);
  };

  const aspects = new Map();
  const highSpeed = [];
  for ( const item of actor.items ) {
    const s = item.system;
    if ( !s ) continue;
    if ( !(s.isActive ?? true) ) {
      // Permanent/Legendary Traits of a Transformation apply even outside of it
      const ctxI = (item.type === "transformation") ? s.formulaContext : {};
      for ( const m of s.modifiers ?? [] ) {
        if ( (m.always && (item.type === "transformation")) ) pushItemModifier(m, item.name, ctxI, item.id);
        // D1 fxOn: an effect switched on while its item does not work
        else if ( (m.active !== false) && fxForcedOn(m, fx) && !twinnedOff(item, m) ) pushItemModifier(m, item.name, ctxI, item.id);
      }
      continue;
    }
    const ctx = {};
    if ( item.type === "transformation" ) {
      Object.assign(ctx, s.formulaContext);
      pushTransformationBonuses(item, system, push, ctx);
      // Divine Pulse: +1(T) Attribute Modifier Bonus (FO/MA) per Action spent on it, until leaving this Transformation
      const pulse = item.flags?.["dbu-rpg"]?.divinePulse ?? 0;
      if ( pulse > 0 ) {
        for ( const attr of ["fo", "ma"] ) {
          push({ target: `mod.${attr}`, value: `${pulse}(T)` }, `${item.name} (Divine Pulse)`, ctx, item.id, { amb: attr });
        }
      }
      for ( const a of s.aspects ) {
        if ( !a.key ) continue;
        const def = DBU.aspects[a.key] ?? {};
        const prev = aspects.get(a.key);
        const lvl = Math.max(1, a.level || 0);
        const params = new Set([...(prev?.params ?? []), ...String(a.param || "").split(/[\/,]/).map(p => p.trim()).filter(Boolean)]);
        const level = prev ? (def.solo ? Math.max(prev.level, lvl) : prev.level + lvl) : lvl;
        aspects.set(a.key, { level: def.levels ? Math.min(level, def.levels) : level, params, item });
        if ( a.key === "highSpeed" ) highSpeed.push({ item, ctx });
      }
    }
    for ( const m of s.modifiers ?? [] ) {
      if ( twinnedOff(item, m) ) continue;
      // Per-Stack choices of an Awakening: an option applies once per Stack that picked it, an unpicked Trait not at all
      const count = (item.type === "transformation") ? stackChoiceCount(s, m.label) : null;
      if ( count === null ) pushItemModifier(m, item.name, ctx, item.id);
      else for ( let k = 0; k < count; k++ ) pushItemModifier({ ...m, active: true }, item.name, ctx, item.id);
    }
    if ( (item.type === "transformation") && rule("greaterEnhancement") && s.greaterEnhancement && s.transcended ) {
      push({ target: "surgency", value: "1(T)" }, `${item.name} (Dedicated Power)`, ctx, item.id);
      push({ target: "capacity.mult", value: "1.25" }, `${item.name} (Dedicated Power)`, ctx, item.id);
    }
  }

  // Aspects of active Transformations
  for ( const [key, info] of aspects ) pushAspect(key, info, system, push);
  if ( highSpeed.length ) {
    // High Speed: increase Speeds by the highest AG Attribute Modifier Bonus among those Transformations
    const formulas = highSpeed.map(h => `(${transformationBonusFormula(h.item, "ag", system) || 0})`);
    push({ target: "speed", value: formulas.length > 1 ? `max(${formulas.join(",")})` : formulas[0] }, "High Speed",
      highSpeed[0].ctx);
  }

  // States (including those forced by Innate State / God Ki aspects)
  const states = { ...system.states };
  for ( const [key, info] of aspects ) {
    if ( key === "godKi" ) states.godKi = Math.max(states.godKi ?? 0, 1);
    if ( key === "innateState" ) {
      for ( const p of info.params ) {
        const k = stateKeyFromName(p);
        if ( k ) states[k] = Math.max(states[k] ?? 0, 1);
      }
    }
  }
  for ( const [key, level] of Object.entries(states) ) {
    if ( !(level > 0) ) continue;
    for ( const m of DBU.stateModifiers[key] ?? [] ) {
      // Tagged with the State effect it is, for the "ignoreState.<state>..." modifiers (evaluateModifiers)
      push(m, game.i18n.localize(`DBU.State.${key}`), { L: level }, undefined, (m.n ? { state: key, n: m.n, lv: m.lv ?? 0 } : null));
    }
  }

  // Resources: split ones (Battle Born...) add to the Combat Roll each stack sits on; the others to their target
  for ( const r of system.resources ?? [] ) {
    if ( r.split ) {
      for ( const k of DBU.splitRolls ) {
        const n = r.alloc?.[k] ?? 0;
        if ( n > 0 ) push({ target: k, value: `(${r.perStack || "1(T)"})*${n}` }, `${r.name} (${game.i18n.localize(`DBU.Split.${k}`)})`);
      }
      continue;
    }
    if ( !r.target || !(r.value > 0) ) continue;
    push({ target: r.target, value: `(${r.perStack || "1"})*${r.value}` }, r.name || "Resource");
  }

  // Custom buffs written on the sheet
  for ( const m of system.customModifiers ?? [] ) push(m, m.label || game.i18n.localize("DBU.Custom"));

  // G1: what the items of your Allies give their Allies ("ally.<target>" pieces, rules/allies.mjs), already worked out
  for ( const p of allyPieces(actor, { fxPiece }) ) push({ target: p.target, value: p.value }, p.label);

  // Optional Rules enabled in the world
  pushOptionalModifiers(actor, system, push);

  system._activeAspects = aspects;
  system._effectiveStates = states;
  return list;
}

/**
 * Formula string of a Transformation Attribute Modifier Bonus after Prelude/Scaling adjustments.
 * @param {object} [options]
 * @param {boolean} [options.stacks]  An Awakening's bonus for all its Stacks: the bonus once per Stack that gives it
 *   (@ZB), plus its own per-Stack choice "amb.<attr>" pieces, which already count once per Stack that picked them
 *   (without it, the bonus of one Stack, the per-Stack choice pieces inside)
 */
export function transformationBonusFormula(item, attr, system, { stacks = false } = {}) {
  const s = item.system;
  const awakening = stacks && (s.transType === "awakening");
  let f = String(s.bonuses?.[attr] ?? "").trim();
  if ( !f || f === "*" || f === "–" || f === "-" ) f = "";
  const parts = [];
  if ( f ) parts.push(`(${f})`);
  // Scaling [LV]: +x(T), x = current ToP above the original requirement (max = level), except SC/IN/PE
  const scaling = s.aspects.find(a => a.key === "scaling");
  if ( scaling && !["sc", "in", "pe"].includes(attr) && f ) {
    let cap = Math.max(1, scaling.level);
    if ( rule("earnedScaling") ) cap = Math.min(cap, s.scalingEarned ?? 0);
    const x = Math.max(0, Math.min(cap, (system.top?.current ?? 1) - s.topReq));
    if ( x > 0 ) parts.push(`(${x})(T)`);
  }
  // Greater Enhancement (Optional Rule): Dedicated Power +1(T) to AG/FO/TE/IN/MA while Transcended
  if ( rule("greaterEnhancement") && s.greaterEnhancement && s.transcended && ["ag", "fo", "te", "in", "ma"].includes(attr) ) {
    parts.push("1(T)");
  }
  // Its own "amb.<attr>" modifiers: increase this Transformation's Attribute Modifier Bonus
  const own = ownAmbModifiers(s, attr);
  parts.push(...own.add);
  if ( !awakening ) parts.push(...own.addStacked);
  if ( !parts.length && !(awakening && own.addStacked.length) ) return "";
  let formula = parts.join(" + ");
  // Prelude: reduce the bonuses by 1(T), never below 1(T)
  if ( formula && s.prelude && s.aspects.some(a => a.key === "prelude") ) formula = `max(1(T), ${formula} - 1(T))`;
  // Awakenings grant their Attribute Modifier Bonus once per Stack (not for a Stack that gives none: a Yardrat's
  // Spirit Control); the per-Stack choice pieces are added once per Stack that picked them, not multiplied again
  if ( awakening ) formula = [...(formula ? [`(${formula})*@ZB`] : []), ...own.addStacked].join(" + ");
  // Its own "amb.mult" / "amb.<attr>.mult" modifiers multiply it
  if ( own.mult.length ) formula = `(${formula})*${own.mult.join("*")}`;
  return formula;
}

/**
 * The modifiers of a Transformation that change its own Attribute Modifier Bonus for one Attribute, as formula pieces:
 * add = "amb.<attr>" values, addStacked = the "amb.<attr>" values that per-Stack/Trait choices repeat (once per Stack
 * that picked the option, like in collectModifiers), mult = "amb.mult" and "amb.<attr>.mult" values. A condition is
 * kept inside the piece ("(cond) ? value : 0").
 */
function ownAmbModifiers(s, attr) {
  const out = { add: [], addStacked: [], mult: [] };
  for ( const m of s.modifiers ?? [] ) {
    const target = String(m.target ?? "");
    const add = target === `amb.${attr}`;
    const mult = (target === "amb.mult") || (target === `amb.${attr}.mult`);
    if ( !(add || mult) || !String(m.value ?? "").trim() ) continue;
    const count = stackChoiceCount(s, m.label);
    const times = (count === null) ? ((m.active !== false) ? 1 : 0) : count;
    const cond = String(m.condition ?? "").trim();
    const piece = cond ? `((${cond}) ? (${m.value}) : ${add ? 0 : 1})` : `(${m.value})`;
    const list = mult ? out.mult : ((count === null) ? out.add : out.addStacked);
    for ( let k = 0; k < times; k++ ) list.push(piece);
  }
  return out;
}

function pushTransformationBonuses(item, system, push, ctx) {
  const s = item.system;
  for ( const attr of DBU.ATTRIBUTES ) {
    // (an Awakening's: for all its Stacks, see transformationBonusFormula)
    let formula = transformationBonusFormula(item, attr, system, { stacks: true });
    if ( !formula ) continue;
    // Path to Power (Limited Power): Awakening bonuses −1 per Attribute, never negative
    if ( (s.transType === "awakening") && limitedPower(system) ) formula = `max(0, ${formula} - 1)`;
    // Weakening: halve the bonuses while below 1/4 of the Maximum Ki Points
    if ( s.aspects.some(a => a.key === "weakening") ) formula = `(${formula})*(@kiLow ? 0.5 : 1)`;
    push({ target: `mod.${attr}`, value: formula }, item.name, ctx, item.id, { amb: attr });
  }
}

function pushAspect(key, info, system, push) {
  const label = DBU.aspects[key]?.label ?? key;
  const lv = info.level;
  switch ( key ) {
    case "armored":
      push({ target: "damageCategoryTaken", value: "-1" }, label); break;
    case "bulky":
      if ( !(info.item.system.ignoreBulky && info.item.system.isMastered) ) push({ target: "superStacks", value: "1" }, label);
      break;
    case "enhancedSave":
      for ( const p of info.params ) {
        // "All": every Save
        const saves = (p.toLowerCase() === "all") ? Object.keys(DBU.saves) : [Object.keys(DBU.saves).find(k => k === p.toLowerCase())];
        for ( const save of saves.filter(Boolean) ) push({ target: `save.${save}`, value: "1(T)" }, `${label} (${p})`);
      }
      break;
    case "growth":
      push({ target: "size.min", value: String(DBU.sizes.large.index + lv - 1) }, label); break;
    case "mindful":
      push({ target: "dodge", value: "1(T)", condition: "@states.mindful > 0" }, label); break;
    case "raging":
      push({ target: "wound", value: "2(T)", condition: "@states.raging > 0" }, label); break;
    case "perfectKiControl":
      push({ target: "kpCost.attack", value: "-1(T)" }, label);
      push({ target: "flag.perfectKiControl", value: "1" }, label);
      break;
    case "superSaiyanForm":
      push({ target: "topDice.extra", value: "1" }, label);
      push({ target: "ki.mult", value: "1.25" }, label);
      push({ target: "capacity.mult", value: "1.25" }, label);
      break;
    case "powerHigh":
      push({ target: "guardCost", value: `${lv}(T)` }, label); break;
    case "draining":
      push({ target: "draining", value: String(lv) }, label); break;
    case "straining":
      push({ target: "flag.straining", value: "1" }, label); break;
    case "exhausting":
      push({ target: "flag.exhausting", value: "1" }, label); break;
    default: break;
  }
}

/** Map a State written in text ("Raging", "Mindful State") to its key. */
export function stateKeyFromName(name) {
  const n = String(name).toLowerCase().replace(/state/g, "").trim();
  const table = {
    raging: "raging", mindful: "mindful", superior: "superior", undying: "undying", surging: "surging",
    determined: "determined", entrusted: "entrusted", "god ki": "godKi", dead: "deadState", liquid: "liquid",
    "multiple arms": "multipleArms", invisible: "invisible", spectator: "spectator", drunk: "drunk",
    feral: "feral", "fusion of ki": "fusionOfKi"
  };
  if ( table[n] ) return table[n];
  // G: any other State key, written with spaces ("Radiant God" → radiantGod, "Overwhelming Focus Special" → overwhelmingFocus)
  const flat = n.replace(/\bspecial\b/g, "").replace(/[^a-z0-9]/g, "");
  return Object.keys(DBU.states).find(k => k.toLowerCase() === flat) ?? null;
}

/**
 * Evaluate gathered modifiers of a given stage into a bucket map: target → { total, parts[] }.
 * Values are evaluated with the source's own context merged on top of the shared data.
 */
export function evaluateModifiers(mods, data, { stage, buckets = {} } = {}) {
  for ( const m of mods ) {
    if ( (stage !== undefined) && (modifierStage(m.target, m) !== stage) ) continue;
    if ( TEXT_TARGETS.has(m.target) || (DICE_TARGETS.has(m.target) && hasDice(m.value)) ) continue;
    // fx* and aspect* pieces: read by their own passes (rules/fx.mjs)
    if ( isPassTarget(m.target) ) continue;
    // G1 "ally.<target>": given to your Allies (rules/allies.mjs), not to you
    if ( isAllyTarget(m.target) ) continue;
    // A built-in State effect that something makes you ignore
    if ( m.state && stateEffectIgnored(m, buckets) ) continue;
    const scope = m.ctx && Object.keys(m.ctx).length ? { ...data, ...m.ctx } : data;
    if ( !test(m.condition, scope) ) continue;
    const isMult = isMultTarget(m.target);
    const zeroOk = ZERO_MULT.has(m.target);
    const value = evaluate(m.value, scope, { floor: !isMult, strict: zeroOk });
    if ( zeroOk && (!String(m.value ?? "").trim() || !Number.isFinite(value)) ) continue;
    // Q "masteryCap.<slug>": a cap of 0 Masteries counts too
    const capKey = m.target.startsWith("masteryCap.");
    if ( capKey && (!String(m.value ?? "").trim() || !Number.isFinite(value)) ) continue;
    if ( !value && !isMult && !capKey ) continue;
    // "ignoreState.<...>" keys are kept in lower case (ignoreState.raging.Angry.2 = ignoreState.raging.angry.2)
    const key = PRE_PREFIX.test(m.target) ? m.target.toLowerCase() : m.target;
    // "resMaxSet.<resource>": the highest value sets the base maximum (not the sum)
    const highest = key.startsWith("resMaxSet.");
    const bucket = buckets[key] ??= { total: isMult ? 1 : 0, parts: [] };
    if ( isMult ) bucket.total *= zeroOk ? value : (value || 1);
    else if ( highest ) bucket.total = bucket.parts.length ? Math.max(bucket.total, value) : value;
    // Q "masteryCap.<slug>": the lowest cap wins
    else if ( capKey ) bucket.total = bucket.parts.length ? Math.min(bucket.total, Math.max(0, value)) : Math.max(0, value);
    else bucket.total += value;
    bucket.parts.push({ label: m.label, value });
  }
  return buckets;
}

/**
 * Is this built-in State modifier suppressed? "ignoreState.<state>.<n>" (that effect, on every Level), or
 * "ignoreState.<state>.<level name>.<n>" / "ignoreState.<state>.<level number>.<n>" (that Level's effect). Several
 * sources are still one suppression.
 */
function stateEffectIgnored(m, buckets) {
  if ( !m.n ) return false;
  const on = k => (buckets[k.toLowerCase()]?.total ?? 0) > 0;
  const base = `ignoreState.${m.state}`;
  if ( on(`${base}.${m.n}`) ) return true;
  if ( !m.lv ) return false;
  const name = DBU.STATE_LEVEL_NAMES?.[m.state]?.[m.lv - 1];
  return on(`${base}.${m.lv}.${m.n}`) || (!!name && on(`${base}.${name}.${m.n}`));
}

/**
 * Roll formula terms of the modifiers of one target that may hold dice (Combat Recovery, Legend Realized), each one
 * tested and evaluated with the actor's formula data and its source's variables: ["3d6", "4"]. Empty without any.
 */
export function modifierTerms(actor, target, data = actor?.system?.rollData ?? {}) {
  let mods = [];
  try {
    mods = collectModifiers(actor, actor.system).filter(m => m.target === target);
  } catch(err) {
    console.warn(`DBU | Could not gather the "${target}" modifiers`, err);
    return [];
  }
  const out = [];
  for ( const m of mods ) {
    const scope = { ...data, ...(m.ctx ?? {}) };
    if ( !test(m.condition, scope) ) continue;
    const term = String(rollExpression(m.value, scope)).trim();
    if ( term && (term !== "0") ) out.push(term);
  }
  return out;
}

/** "3d10" + ["1d6", "-2"] → "3d10 + 1d6 - 2". */
export function joinTerms(base, terms = []) {
  return [String(base), ...terms.map(t => (t.startsWith("-") ? `- ${t.slice(1).trim()}` : `+ ${t}`))].join(" ");
}
