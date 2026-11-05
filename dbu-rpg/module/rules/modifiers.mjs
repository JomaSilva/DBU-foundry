import { DBU } from "../config.mjs";
import { evaluate, test } from "./formula.mjs";
import { limitedPower, pushOptionalModifiers, rule } from "../optional-rules.mjs";
import { stackChoiceCount } from "./awakening.mjs";

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
  "dotMin", "life.mult", "superStacks"]);
const ATTRIBUTE_TARGETS = /^(score|mod)\./;

export function modifierStage(target) {
  if ( EARLY_TARGETS.has(target) ) return 0;
  if ( ATTRIBUTE_TARGETS.test(target) ) return 1;
  return 2;
}

/**
 * Gather every modifier that applies to an actor right now.
 * Aspects are merged across active Transformations (shared Aspects do not double up, levels add).
 */
export function collectModifiers(actor, system) {
  const list = [];
  const push = (mod, label, ctx = {}, itemId) => {
    if ( !mod?.target || (mod.active === false) ) return;
    list.push({ target: mod.target, value: mod.value ?? "", condition: mod.condition ?? "", label, ctx, itemId });
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
      if ( item.type === "transformation" ) {
        const ctxI = s.formulaContext;
        for ( const m of s.modifiers ?? [] ) if ( m.always ) pushItemModifier(m, item.name, ctxI, item.id);
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
        for ( const attr of ["fo", "ma"] ) push({ target: `mod.${attr}`, value: `${pulse}(T)` }, `${item.name} (Divine Pulse)`, ctx, item.id);
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
      push(m, game.i18n.localize(`DBU.State.${key}`), { L: level });
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

  // Optional Rules enabled in the world
  pushOptionalModifiers(actor, system, push);

  system._activeAspects = aspects;
  system._effectiveStates = states;
  return list;
}

/** Formula string of a Transformation Attribute Modifier Bonus after Prelude/Scaling adjustments. */
export function transformationBonusFormula(item, attr, system) {
  const s = item.system;
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
  if ( !parts.length ) return "";
  let formula = parts.join(" + ");
  // Prelude: reduce the bonuses by 1(T), never below 1(T)
  if ( s.prelude && s.aspects.some(a => a.key === "prelude") ) formula = `max(1(T), ${formula} - 1(T))`;
  return formula;
}

function pushTransformationBonuses(item, system, push, ctx) {
  const s = item.system;
  for ( const attr of DBU.ATTRIBUTES ) {
    let formula = transformationBonusFormula(item, attr, system);
    if ( !formula ) continue;
    // Awakenings grant their Attribute Modifier Bonus once per Stack (not for a Stack that gives none: a Yardrat's
    // Spirit Control)
    if ( s.transType === "awakening" ) {
      formula = `(${formula})*@ZB`;
      // Path to Power (Limited Power): Awakening bonuses −1 per Attribute, never negative
      if ( limitedPower(system) ) formula = `max(0, ${formula} - 1)`;
    }
    // Weakening: halve the bonuses while below 1/4 of the Maximum Ki Points
    if ( s.aspects.some(a => a.key === "weakening") ) formula = `(${formula})*(@kiLow ? 0.5 : 1)`;
    push({ target: `mod.${attr}`, value: formula }, item.name, ctx, item.id);
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
        const save = Object.keys(DBU.saves).find(k => k === p.toLowerCase());
        if ( save ) push({ target: `save.${save}`, value: "1(T)" }, `${label} (${p})`);
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
  return table[n] ?? null;
}

/**
 * Evaluate gathered modifiers of a given stage into a bucket map: target → { total, parts[] }.
 * Values are evaluated with the source's own context merged on top of the shared data.
 */
export function evaluateModifiers(mods, data, { stage, buckets = {} } = {}) {
  for ( const m of mods ) {
    if ( (stage !== undefined) && (modifierStage(m.target) !== stage) ) continue;
    const scope = m.ctx && Object.keys(m.ctx).length ? { ...data, ...m.ctx } : data;
    if ( !test(m.condition, scope) ) continue;
    const isMult = /\.mult$/.test(m.target);
    const value = evaluate(m.value, scope, { floor: !isMult });
    if ( !value && !isMult ) continue;
    const bucket = buckets[m.target] ??= { total: isMult ? 1 : 0, parts: [] };
    if ( isMult ) bucket.total *= (value || 1);
    else bucket.total += value;
    bucket.parts.push({ label: m.label, value });
  }
  return buckets;
}
