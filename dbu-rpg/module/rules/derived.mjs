import { DBU } from "../config.mjs";
import { collectModifiers, evaluateModifiers } from "./modifiers.mjs";
import {
  categoryLabel, categoryToDice, critDiceCategory, diceToFormula, greaterDiceCategory, topDiceCategory
} from "./dice.mjs";
import { evaluate, roundDown, test } from "./formula.mjs";
import { battlePower } from "./battle-power.mjs";
import { AWAKENING_POINTS, godHoned, gravityFor, limitedPower, martialDieCategory, rules } from "../optional-rules.mjs";
import { allocTotal, resourceSlug, splitLimits } from "./resources.mjs";
import { danceHalved } from "../fusion/fusion-rules.mjs";
import { awakeningSlug, awakeningStacks, stackChoiceCount } from "./awakening.mjs";
import { adversaryInfo } from "./adversary.mjs";
import { apparelPieces, apparelVariables, baseApparelBonus } from "./apparel.mjs";
import { computeSignature } from "./signature.mjs";
import { isLateModifier, modifierStage } from "./modifiers.mjs";
import { aspectPass, fxPass } from "./fx.mjs";
import { proximityData } from "./proximity.mjs";
import { encounterCounts } from "./allies.mjs";

/** Base Tier of Power from Power Level: 1-4 → 1, 5-9 → 2 ... 30 → 7. */
export function baseTopFromPL(pl) {
  return Math.min(7, Math.floor(Math.clamp(pl, 1, 30) / 5) + 1);
}

/** Attribute Score Limit for a base ToP. */
export function scoreLimit(baseTop) {
  return 8 + (3 * (baseTop - 1));
}

/** Skill Rank cap for a base ToP. */
export function skillRankCap(baseTop) {
  return Math.min(5, baseTop + 1);
}

/** Perks granted by Power Level (cumulative). */
export function perksForPL(pl) {
  const totals = { perk: 0, talent: 0, attribute: 0, skill: 0 };
  for ( let l = 1; l <= pl; l++ ) {
    const row = DBU.PL_TABLE[l] ?? {};
    for ( const k of Object.keys(totals) ) totals[k] += row[k] ?? 0;
  }
  return totals;
}

/** Health Threshold info for a Life Point value. */
export function thresholdState(life, max) {
  const below = {
    bruised: life <= max / 2,
    injured: life <= max / 4,
    critical: life <= max / 10
  };
  const count = Object.values(below).filter(Boolean).length;
  const current = below.critical ? "critical" : below.injured ? "injured" : below.bruised ? "bruised" : "healthy";
  return { below, count, current };
}

const sum = (buckets, ...keys) => keys.reduce((t, k) => t + (buckets[k]?.total ?? 0), 0);
const parts = (buckets, ...keys) => keys.flatMap(k => buckets[k]?.parts ?? []);
/** Product of a multiplier bucket (1 without one). */
const mult = (buckets, key) => buckets[key]?.total ?? 1;

/**
 * "immune.<condition>" modifiers that apply: of what is active (Permanent ones always) and of the sheet, with the
 * per-Stack/Trait choices of an Awakening counting like in collectModifiers (an option picked by no Stack does nothing).
 * @returns {{key: string, condition: string, ctx: object}[]}
 */
function immunityModifiers(actor, sys) {
  const out = [];
  const add = (m, ctx = {}) => {
    const target = String(m.target ?? "");
    if ( target.startsWith("immune.") ) out.push({ key: target.slice(7), condition: String(m.condition ?? "").trim(), ctx });
  };
  for ( const i of actor.items ) {
    const s = i.system;
    if ( !s?.modifiers?.length ) continue;
    const active = s.isActive ?? true;
    const ctx = (i.type === "transformation") ? (s.formulaContext ?? {}) : {};
    for ( const m of s.modifiers ) {
      if ( !(m.always || active) ) continue;
      const count = (i.type === "transformation") ? stackChoiceCount(s, m.label) : null;
      if ( (count === null) ? (m.active !== false) : (count > 0) ) add(m, ctx);
    }
  }
  for ( const m of sys.customModifiers ?? [] ) if ( m.active !== false ) add(m);
  // D1: the Surging State's 4th effect (you cannot gain the Compelled Combat Condition)
  out.push({ key: "compelled", condition: "@states.surging >= 1 && !@ignoreSurging4", ctx: {} });
  return out;
}

/**
 * Effective maximum of the resources: max(sheet maximum, "resMaxSet.<slug>") + "resMax.<slug>". A resource without a
 * maximum (0) keeps none unless a "resMaxSet" gives it one; a maximum never drops below 1. Resources named by a modifier
 * but not on the sheet yet get one too (from their known definition), for when they are gained.
 */
function resourceMaximums(resources, buckets) {
  const adds = {};
  const sets = {};
  for ( const [key, b] of Object.entries(buckets) ) {
    if ( key.startsWith("resMaxSet.") ) {
      const slug = resourceSlug(key.slice(10));
      sets[slug] = Math.max(sets[slug] ?? 0, b.total);
    }
    else if ( key.startsWith("resMax.") ) {
      const slug = resourceSlug(key.slice(7));
      adds[slug] = (adds[slug] ?? 0) + b.total;
    }
  }
  const effective = (slug, stored) => {
    const base = Math.max(Number(stored) || 0, sets[slug] ?? 0);
    return (base > 0) ? Math.max(1, base + (adds[slug] ?? 0)) : 0;
  };
  const out = {};
  for ( const r of resources ) {
    if ( !r.name ) continue;
    const slug = resourceSlug(r.name);
    out[slug] = effective(slug, r.max);
  }
  for ( const slug of new Set([...Object.keys(adds), ...Object.keys(sets)]) ) {
    if ( !(slug in out) ) out[slug] = effective(slug, DBU.splitResources[slug]?.max ?? 0);
  }
  return out;
}

/** Formula variables about the Transformations: Aspect levels, Lines, Masteries, Transcended ones. */
function transformationData(transformations, active) {
  const out = { aspects: {}, inLine: {}, mastery: {}, fm: {}, transcended: {} };
  // Summed levels of each Aspect over the Transformations in use (an Aspect without levels counts 1)
  for ( const t of transformations.filter(x => x.system.isActive) ) {
    for ( const a of t.system.aspects ?? [] ) if ( a.key ) out.aspects[a.key] = (out.aspects[a.key] ?? 0) + Math.max(1, a.level || 0);
  }
  for ( const t of active ) {
    const line = awakeningSlug(t.system.line);
    if ( line ) out.inLine[line] = 1;
  }
  for ( const t of transformations ) {
    const slug = awakeningSlug(t.name);
    if ( !slug ) continue;
    const s = t.system;
    out.mastery[slug] = Math.max(out.mastery[slug] ?? 0, s.mastery ?? 0);
    if ( (s.mastery ?? 0) >= (s.masteryNeeded ?? 1) ) out.fm[slug] = 1;
    if ( s.transcended ) out.transcended[slug] = 1;
  }
  return out;
}

/**
 * Compute every derived value of a DBU character.
 * Writes directly onto the TypeDataModel instance (system).
 */
/**
 * Allies and Opponents of the actor's running Combat Encounter, by token disposition (not Defeated): how many, how
 * many Allies possess each Awakening, and the highest base Tier of Power among the Opponents (opponentTop). Zero outside
 * of combat.
 */
export function partyData(actor) {
  const out = { allies: 0, opponents: 0, allyAwk: {}, opponentTop: 0 };
  try {
    const combat = globalThis.game?.combats?.find?.(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid));
    if ( !combat ) return out;
    const mine = combat.combatants.find(cb => cb.actor?.uuid === actor.uuid);
    const side = mine?.token?.disposition ?? 0;
    const seen = new Set([actor.uuid]);
    for ( const cb of combat.combatants ) {
      const other = cb.actor;
      if ( !other || seen.has(other.uuid) ) continue;
      seen.add(other.uuid);
      if ( cb.isDefeated || ((other.system?.life?.value ?? 1) <= 0) ) continue;
      const disp = cb.token?.disposition ?? 0;
      if ( (disp === side) && (side !== 0) ) {
        out.allies += 1;
        for ( const [slug, n] of Object.entries(awakeningStacks(other.items)) ) if ( n > 0 ) out.allyAwk[slug] = (out.allyAwk[slug] ?? 0) + 1;
      }
      else if ( (disp !== 0) && (side !== 0) && (disp !== side) ) {
        out.opponents += 1;
        // (that actor may not be prepared yet: its base ToP from its Power Level then)
        const top = other.system?.top?.base ?? baseTopFromPL(other.system?.pl ?? 1);
        out.opponentTop = Math.max(out.opponentTop, Number(top) || 0);
      }
    }
  } catch(err) { /* the world is still loading */ }
  return out;
}

/**
 * The actor's running Combat Encounter and the counters other packages keep, as formula data: @inCombat, @initiative (its
 * Initiative), @initiativeTop (the highest among the combatants), @turnAlly (an Ally's turn, not yours), @alliesDefeated
 * (Allies of the encounter that are Defeated), sizeTop (the largest current Size index among the OTHER combatants; the
 * preparation adds its own), @resGained.<slug> / @resSpent.<slug> (this Combat Round: flag roundRes), @marks.<slug> (how
 * many Characters carry your mark: flag marks), @chargesRound, @surgesRound, @damagedSinceTurn (system.combat). Zeros
 * outside of combat.
 */
export function encounterData(actor) {
  const c = actor?.system?.combat ?? {};
  const out = { inCombat: 0, initiative: 0, initiativeTop: 0, sizeTop: 0, turnAlly: 0, alliesDefeated: 0,
    chargesRound: Number(c.chargesRound) || 0, surgesRound: Number(c.surgesRound) || 0,
    damagedSinceTurn: Number(c.damagedSinceTurn) || 0, resGained: {}, resSpent: {}, marks: {} };
  const flags = actor?.flags?.["dbu-rpg"] ?? {};
  for ( const [slug, list] of Object.entries(flags.marks ?? {}) ) if ( Array.isArray(list) ) out.marks[slug] = list.length;
  try {
    const combat = globalThis.game?.combats?.find?.(cb => cb.started && cb.combatants.some(x => x.actor?.uuid === actor.uuid));
    if ( !combat ) return out;
    out.inCombat = 1;
    const mine = combat.combatants.find(x => x.actor?.uuid === actor.uuid);
    const side = mine?.token?.disposition ?? 0;
    out.initiative = Number(mine?.initiative) || 0;
    let top = null;
    for ( const cb of combat.combatants ) {
      if ( (cb.initiative !== null) && (cb.initiative !== undefined) && Number.isFinite(Number(cb.initiative)) ) {
        top = (top === null) ? Number(cb.initiative) : Math.max(top, Number(cb.initiative));
      }
      const other = cb.actor;
      if ( !other || (other.uuid === actor.uuid) ) continue;
      const s = other.system;
      out.sizeTop = Math.max(out.sizeTop, Number(s?.size?.index ?? DBU.sizes[s?.details?.size]?.index ?? 0) || 0);
      const ally = (side !== 0) && ((cb.token?.disposition ?? 0) === side);
      if ( ally && (cb.isDefeated || ((s?.life?.value ?? 1) <= 0)) ) out.alliesDefeated += 1;
    }
    out.initiativeTop = top ?? 0;
    const current = combat.combatant;
    out.turnAlly = (current?.actor && (current.actor.uuid !== actor.uuid) && (side !== 0)
      && ((current.token?.disposition ?? 0) === side)) ? 1 : 0;
    // Resources gained / spent this Combat Round (B2's flag: { combat, round, gained, spent })
    const rr = flags.roundRes;
    if ( rr && (rr.combat === combat.id) && (rr.round === combat.round) ) {
      out.resGained = { ...(rr.gained ?? {}) };
      out.resSpent = { ...(rr.spent ?? {}) };
    }
  } catch(err) { /* the world is still loading */ }
  return out;
}

export function prepareActorData(sys, actor) {
  // A Fusion's Power Level may exceed 30 (Life/Ki Points and Capacity only; the base ToP stops at 7)
  const fusion = (actor.type === "fusion") ? sys.fusion : null;
  const pl = Math.clamp(sys.pl ?? 1, 1, fusion ? 60 : 30);
  const bT = baseTopFromPL(pl);
  const statuses = actor.statuses ?? new Set();
  // Adversaries: Life and Ki Points per Power Level, Attribute Points, Narrative Stamina... by Category and PCC
  const adv = adversaryInfo(actor, bT);
  sys.adversaryInfo = adv;

  /* ----- Conditions ----- */
  const cond = {};
  for ( const [key, def] of Object.entries(DBU.conditions) ) {
    cond[key] = Math.min(def.max, Math.max(sys.conditions?.[key] ?? 0, statuses.has(key) ? 1 : 0));
  }
  // In a Grapple both characters suffer Guard Down; a Pin Maneuver keeps the Grappled Pinned while it lasts
  const grapple = actor.flags?.["dbu-rpg"]?.grapple;
  if ( grapple ) {
    cond.guardDown = Math.max(cond.guardDown, 1);
    if ( grapple.pinned && (grapple.role === "grappled") ) cond.pinned = 1;
  }
  sys.effectiveConditions = cond;
  // Unnatural: cannot gain the Suffocating or Poisoned Combat Conditions
  const unnatural = actor.items.some(i => ((i.type === "race") && i.system.unnatural)
    || (i.system?.modifiers ?? []).some(m => (m.target === "flag.unnatural") && m.active && (i.system.isActive ?? true)));
  sys.unnatural = unnatural;
  if ( unnatural ) { cond.suffocating = 0; cond.poisoned = 0; }
  // Immune to a Combat Condition ("immune.<key>" modifiers of what is active, Permanent ones always): the unconditional
  // ones now, the ones with a condition once the formula data exists (below)
  const immunities = immunityModifiers(actor, sys).filter(m => m.key in cond);
  for ( const m of immunities ) if ( !m.condition ) cond[m.key] = 0;
  // (what the Conditions are without the conditional ones: the pass after Stage 1 decides those again)
  const condBeforeImmunity = { ...cond };

  /* ----- Race and raw scores ----- */
  const races = actor.items.filter(i => i.type === "race");
  const race = races[0] ?? null;
  sys.race = race;
  // A Fusion has every Race of its Fused Characters
  sys.races = races;
  const racial = fusion ? {} : (race?.system.increases ?? {});
  const rawScores = {};
  for ( const a of DBU.ATTRIBUTES ) {
    // A Fusion's Attribute Scores are the highest of its Fused Characters
    const base = fusion ? (fusion.scores?.[a] ?? 1) : 1 + (racial[a] ?? 0) + (sys.attributes[a]?.points ?? 0);
    rawScores[a] = base + (sys.attributes[a]?.bonus ?? 0);
  }

  /* ----- Transformations ----- */
  const transformations = actor.items.filter(i => i.type === "transformation");
  const active = transformations.filter(t => t.system.isActive && t.system.transType !== "awakening");
  const activeForms = active.filter(t => t.system.countsAsForm);
  const activeEnh = active.filter(t => (t.system.transType === "enhancement") && !t.system.transcended);
  const R = rules();
  const opt = sys.optional ?? {};
  const kiMultiplier = active.some(t => (t.system.transType === "form") && (t.system.stage !== 0) && t.system.viaManeuver)
    && !limitedPower(sys);
  sys.transformation = {
    active, forms: activeForms, enhancements: activeEnh, kiMultiplier,
    transformed: active.some(t => t.system.stage !== 0 || t.system.transType !== "form"),
    highestTopReq: active.reduce((m, t) => Math.max(m, t.system.topReq), 0),
    // Awakenings count too: once gained, the character is always "in" them
    newLevel: transformations.some(t => t.system.newLevel && t.system.isActive)
  };

  /* ----- Preliminary pools for threshold maths ----- */
  // A Fusion uses the highest Racial Life Modifier among its Races
  const rlmBase = races.length ? Math.max(...races.map(r => r.system.rlm ?? 0)) : 0;
  // Path to Power: PL1 split into Martial Levels (40 LP / 30 KP + 5 per Martial Level)
  const ml = (R.pathToPower && (opt.martialLevel > 0)) ? (pl > 1 ? 5 : opt.martialLevel) : 0;
  const lifeStart = ml ? 40 + (5 * (ml - 1)) : 60;
  const kiStart = ml ? 30 + (5 * (ml - 1)) : 50;
  // Alternate Life Point Generation: 2d10 per PL after the first instead of 12
  const lifePerPL = (R.altLifePoints && (opt.rolledLife > 0)) ? opt.rolledLife : 12 * (pl - 1);
  // Injury System: −1/10 per Minor and −1/5 per Major Injury to Maximum Life and Ki Points
  let injuryMult = 1;
  if ( R.injurySystem ) {
    for ( const inj of opt.injuries ?? [] ) if ( !inj.ignored ) injuryMult -= (inj.severity === "major" ? 0.2 : 0.1);
    injuryMult = Math.max(0, injuryMult);
  }
  const prelimLifeMax = Math.floor((lifeStart + lifePerPL + ((rlmBase + (2 * rawScores.te) + (adv?.lifePerPL ?? 0)) * pl)) * injuryMult);
  const prelimThr = thresholdState(sys.life.value, prelimLifeMax);

  /* ----- Shared formula data ----- */
  const resources = {};
  for ( const r of sys.resources ?? [] ) {
    // Split resources (Battle Born...): the stacks are the ones on each Combat Roll plus the ones not placed yet
    if ( r.split ) r.value = allocTotal(r) + r.unassigned;
    if ( !r.name ) continue;
    const slug = resourceSlug(r.name);
    resources[slug] = r.value;
    if ( r.split ) for ( const k of DBU.splitRolls ) resources[`${slug}_${k}`] = r.alloc[k];
  }
  const holdingBack = Math.clamp(sys.combat.holdingBack ?? 0, 0, bT);
  // Arrogant and Unstoppable (Villainous Trait): treated as Healthy for all of its effects until its next turn
  const asHealthy = !!actor.flags?.["dbu-rpg"]?.asHealthy;
  const data = {
    PL: pl, bT, T: bT, below: asHealthy ? 0 : prelimThr.count, power: Math.max(0, sys.combat.power ?? 0),
    superStacks: sys.combat.superStacks ?? 0, holdingBack,
    states: { ...sys.states }, cond, res: resources,
    transformed: sys.transformation.transformed ? 1 : 0,
    inForm: activeForms.length ? 1 : 0, inEnhancement: activeEnh.length ? 1 : 0,
    enhancementCount: active.filter(t => t.system.transType === "enhancement").length,
    life: sys.life.value, ki: sys.ki.value, capacity: sys.capacity.value,
    alignment: sys.zsoul.alignment, kiLow: 0,
    // Stacks of each Awakening ("for every stack of Absorption you possess": @awk.absorption)
    awk: awakeningStacks(actor.items),
    // Allies and Opponents in your Combat Encounter (@allies, @opponents, @allyAwk.<slug>: Allies with that Awakening)
    ...partyData(actor),
    // Your turn, what you hold, Grapple and the Transformations you are in (@active.<slug of its name>)
    // (the encounter the actor takes part in: the tracker may show another one)
    myTurn: (globalThis.game?.combats?.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid))?.combatant?.actor?.uuid
      === actor.uuid) ? 1 : 0,
    counters: sys.combat.counters ?? 0, actions: sys.combat.actions ?? 0, heldCharges: sys.combat.energyCharges ?? 0,
    grappled: (grapple?.role === "grappled") ? 1 : 0, grappling: (grapple && (grapple.role !== "grappled")) ? 1 : 0,
    active: Object.fromEntries(active.map(t => [awakeningSlug(t.name), 1])),
    // Options picked in the choices of any Transformation ("depending on your choice for the 3rd effect of Divine Magic":
    // @picked.godofpeace)
    picked: Object.fromEntries(transformations.flatMap(t => (t.system.choices ?? []).flatMap(ch => ch.selected ?? []))
      .map(o => [awakeningSlug(o), 1])),
    // @aspects.<key> (summed levels), @inLine.<line>, @mastery.<name>, @fm.<name> (Fully Mastered), @transcended.<name>
    ...transformationData(transformations, active),
    highestTopReq: sys.transformation.highestTopReq, activeCount: active.length,
    // Power Ups used this Combat Round
    powerUps: sys.combat.powerUps ?? 0
  };
  // The running encounter and the round counters (@inCombat, @initiative, @turnAlly, @resGained.<slug>, @marks.<slug>...),
  // the Weapons wielded, the Diminishing Defense stacks and the Skill Ranks written on the sheet (@ranks.<skill>: racial +
  // ranks + bonus ranks, before any effect)
  const encounter = encounterData(actor);
  const sizeTopOthers = encounter.sizeTop;
  delete encounter.sizeTop;
  Object.assign(data, encounter, {
    wielding: actor.items.filter(i => (i.type === "weapon") && i.system.isActive).length,
    dimDefense: sys.combat.dimDefense ?? 0,
    ranks: Object.fromEntries(Object.entries(sys.skills ?? {}).map(([k, S]) => [k, (S.racial ?? 0) + (S.ranks ?? 0) + (S.bonusRanks ?? 0)]))
  });

  // D: the items that work, by name (@item.<slug>: active Traits and Transformations, Maneuvers, Unique Abilities,
  // Signatures, equipped Weapons / Apparel / Equipment; "X Maneuver" also counts as "x"), and the Maneuvers / Unique
  // Abilities / items used this Combat Round and Encounter (@used.<slug>, @usedEnc.<slug>: flag maneuverUses
  // { combat, round, r: { slug: n }, e: { slug: n } }, written by the "maneuverUsed" / "itemUsed" events)
  data.item = {};
  for ( const i of actor.items ) {
    if ( !(i.system?.isActive ?? true) ) continue;
    for ( const slug of new Set([awakeningSlug(i.name), awakeningSlug(String(i.name).replace(/\s+maneuver$/i, ""))]) ) {
      const q = Number(i.system?.quantity);
      if ( slug ) data.item[slug] = (data.item[slug] ?? 0) + ((i.system?.quantity !== undefined) && Number.isFinite(q) ? Math.max(0, q) : 1);
    }
  }
  {
    const mu = actor.flags?.["dbu-rpg"]?.maneuverUses;
    const enc = globalThis.game?.combats?.find?.(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid));
    const sameEnc = !!mu && !!enc && (mu.combat === enc.id);
    data.usedEnc = sameEnc ? { ...(mu.e ?? {}) } : {};
    data.used = (sameEnc && (mu.round === enc.round)) ? { ...(mu.r ?? {}) } : {};
  }
  // D: the distances on the map to the Allies and Opponents of your encounter (@alliesWithin.<n>, rules/proximity.mjs)
  Object.assign(data, proximityData(actor));
  // G3: how many Opponents / Allies of your encounter suffer each Condition or are in each State (rules/allies.mjs)
  Object.assign(data, encounterCounts(actor, DBU));
  // D1: the States entered through an effect (@stateFx.<state>.<ref>), the effects in force (@fx.<ref>) and what the
  // fx* pieces do to the other effects (rules/fx.mjs), before any other modifier is gathered
  data.stateFx = Object.fromEntries(Object.entries(actor.flags?.["dbu-rpg"]?.stateFx ?? {})
    .filter(([k, ref]) => ref).map(([k, ref]) => [k, { [ref]: 1 }]));
  sys._fx = fxPass(actor, data);
  data.fx = sys._fx.inForce;

  // ToP must be known before modifiers are collected (Scaling reads it)
  sys.top = { base: bT, current: bT };
  let mods = collectModifiers(actor, sys);
  data.states = { ...sys._effectiveStates };
  let buckets = {};

  /* ----- Stage -1: Power maximum, Power Spiked, State effects ignored ----- */
  const stageMinus1 = () => {
    evaluateModifiers(mods, data, { stage: -1, buckets });
    const powerMax = Math.max(0, 2 + sum(buckets, "power.max"));
    sys.combat.powerMax = powerMax;
    data.powerMax = powerMax;
    // Power at its maximum, or an effect that counts as it
    data.powerSpiked = (((powerMax > 0) && (data.power >= powerMax)) || (sum(buckets, "flag.powerSpiked") > 0)) ? 1 : 0;
  };
  stageMinus1();
  // D2: Aspects changed by modifiers (aspect.*, rules/fx.mjs): with new Aspects every modifier is gathered again
  if ( aspectPass(actor, mods, data) ) {
    mods = collectModifiers(actor, sys);
    data.states = { ...sys._effectiveStates };
    Object.assign(data, transformationData(transformations, active));
    buckets = {};
    stageMinus1();
  }
  const powerMax = data.powerMax;
  // H: "holdingBack.ignore": the Holding Back stacks do nothing for a while (they stay; @holdingBack still counts them)
  const hbIgnored = sum(buckets, "holdingBack.ignore") > 0;
  const hbEff = hbIgnored ? 0 : holdingBack;
  data.holdingBackIgnored = hbIgnored ? 1 : 0;

  // Conditional immunities to Combat Conditions: their condition with the formula data and their source's variables
  data.ignoreSurging4 = (buckets["ignorestate.surging.4"]?.total ?? 0) > 0 ? 1 : 0;
  for ( const m of immunities ) {
    if ( m.condition && test(m.condition, { ...data, ...m.ctx }) ) cond[m.key] = 0;
  }

  /* ----- Stage 0: Tier of Power, Ki Pool, Capacity ----- */
  evaluateModifiers(mods, data, { stage: 0, buckets });
  // Progression budgets (standard, Generations or Path to Power at PL1): the Skill Improvements are known now
  // (@skillImprovements, with the "skillImprovements" modifiers of stage 0)
  const perks = perksForPL(pl);
  let pl1Bonus = { ranks: 2, tp: 10, attributePoints: 0, freeSignature: true };
  const ng = R.generations && opt.ngCharacter;
  if ( ng ) {
    // New Generation: PL1 = 1 Character Perk, 2 Attribute Additions, 4 Talents, 4 Skill Ranks, no Skill Improvement
    perks.attribute -= 3; perks.skill -= 1;
    pl1Bonus = { ranks: 4, tp: 0, attributePoints: 0, freeSignature: false };
  }
  else if ( ml ) {
    // Path to Power: the PL1 bonuses are replaced by the Martial Level table
    perks.attribute -= 2; perks.talent -= 2; perks.perk -= 1;
    pl1Bonus = {
      ranks: (ml >= 2 ? 1 : 0) + (ml >= 4 ? 1 : 0), tp: 0,
      attributePoints: (ml >= 2 ? 1 : 0) + (ml >= 3 ? 2 : 0) + (ml >= 4 ? 1 : 0), freeSignature: ml >= 3
    };
    perks.talent += (ml >= 2 ? 1 : 0) + (ml >= 4 ? 1 : 0);
    perks.perk += (ml >= 5 ? 1 : 0);
  }
  const honed = (R.pathToGodhood && pl >= 30) ? godHoned(opt) : { self: 0, technique: 0, talent: 0, exceed: 0 };
  const conv = sys.perks;
  const skillImprovements = perks.skill + (conv.skill ?? 0) + sum(buckets, "skillImprovements");
  data.skillImprovements = skillImprovements;
  // Super Stacks from Aspects and Grades are known now, for the bonuses that grow with them (Hefty Muscle)
  data.superStacks = Math.clamp((sys.combat.superStacks ?? 0) + sum(buckets, "superStacks"), 0, 3);
  let topCurrent = bT + (sys.combat.topBoost ?? 0) + sum(buckets, "top") + (sys.transformation.newLevel ? 1 : 0);
  topCurrent -= hbEff;
  if ( (hbEff >= bT) && (bT > 0) ) topCurrent = 1;
  topCurrent = Math.clamp(topCurrent, 1, bT + 2);
  sys.top.current = topCurrent;
  sys.top.kp = Math.min(topCurrent, bT); // Breakthrough: temporary ToP increases do not raise Ki Point Costs
  data.T = topCurrent;

  const fatiguedMin = Math.min(2, sum(buckets, "fatiguedMin"));
  const fatigued = Math.max(cond.fatigued, fatiguedMin);
  cond.fatigued = fatigued;
  // What keeps a Condition on besides the sheet (an Internal Injury, a token status icon): shown on the sheet
  sys.conditionMins = { fatigued: fatiguedMin };
  sys.conditionHolds = {};
  if ( fatiguedMin > 0 ) sys.conditionHolds.fatigued = parts(buckets, "fatiguedMin").map(p => p.label);
  for ( const key of Object.keys(DBU.conditions) ) {
    if ( statuses.has(key) && !((sys.conditions?.[key] ?? 0) > 0) ) {
      (sys.conditionHolds[key] ??= []).push(game.i18n.localize("DBU.Condition.HeldByIcon"));
    }
  }
  if ( grapple ) {
    (sys.conditionHolds.guardDown ??= []).push(`Grapple (${grapple.name ?? ""})`);
    if ( grapple.pinned && (grapple.role === "grappled") ) (sys.conditionHolds.pinned ??= []).push("Pin Maneuver");
  }
  const kiBase = Math.floor((kiStart + (12 * (pl - 1)) + ((adv?.kiPerPL ?? 0) * pl)) * injuryMult) + sum(buckets, "ki.max");
  const kiMax = Math.floor(kiBase * (kiMultiplier ? 2 : 1) * (buckets["ki.mult"]?.total ?? 1));
  data.kiMaxBase = Math.floor(kiBase * (buckets["ki.mult"]?.total ?? 1));
  // Power: +1(T) Combat Rolls per stack (effects may exceed 2 stacks); Max Capacity +1/4 for the first 2 stacks only
  const powerStacks = Math.max(0, sys.combat.power ?? 0);
  const capBase = 20 + (4 * (pl - 1)) + sum(buckets, "capacity.max");
  // (Fatigued halves it once per Level)
  const capacityFor = f => Math.floor(capBase * (1 + (0.25 * Math.min(powerStacks, 2))) * (kiMultiplier ? 1.5 : 1)
    * (buckets["capacity.mult"]?.total ?? 1) / (2 ** f));
  const capMax = capacityFor(fatigued);
  sys.ki.max = Math.max(0, kiMax);
  // The natural maximum (no Ki Multiplier, no Form multiplier): the Battle Power compares the Ki Points left to it
  sys.ki.natural = Math.max(0, kiBase);
  sys.capacity.max = Math.max(0, capMax);
  data.kiMax = sys.ki.max;
  data.capacityMax = sys.capacity.max;
  data.kiLow = (sys.ki.value < (sys.ki.max / 4)) ? 1 : 0;
  // Divine Ki Points: 1/2 of the Maximum Ki Points without the Ki Multiplier, for whoever has a Transformation with the
  // God Ki Aspect (or is in the God Ki State); they can only be used in the God Ki State
  const inGodKi = (sys._effectiveStates?.godKi ?? 0) > 0;
  sys.dkp.max = Math.floor(data.kiMaxBase / 2);
  sys.dkp.access = inGodKi || transformations.some(t => t.system.aspects.some(a => a.key === "godKi"));
  sys.dkp.usable = inGodKi;
  data.dkp = sys.dkp.value;
  // (before the "dkp.max" / "dkp.mult" modifiers, applied after stage 2)
  data.dkpMax = sys.dkp.max;

  /* ----- Stage 1: Attribute Scores and Modifiers ----- */
  data.scores = { ...rawScores };
  evaluateModifiers(mods, data, { stage: 1, buckets });
  // @amb.<attr>: Attribute Modifier Bonus of the active Transformations for that Attribute (summed), as just evaluated
  const amb = Object.fromEntries(DBU.ATTRIBUTES.map(a => [a, 0]));
  for ( const m of mods ) {
    if ( !m.amb || !(m.amb in amb) ) continue;
    const scope = m.ctx && Object.keys(m.ctx).length ? { ...data, ...m.ctx } : data;
    if ( test(m.condition, scope) ) amb[m.amb] += evaluate(m.value, scope);
  }
  data.amb = amb;
  const limit = scoreLimit(bT);
  sys.scoreLimit = limit;
  for ( const a of DBU.ATTRIBUTES ) {
    const A = sys.attributes[a];
    A.racial = racial[a] ?? 0;
    A.score = Math.max(1, rawScores[a] + sum(buckets, `score.${a}`));
    A.scoreParts = parts(buckets, `score.${a}`);
    A.limit = limit;
    data.scores[a] = A.score;
  }
  // A Plump Fusion halves its Agility Modifier; a Frail one its Agility, Force, Tenacity and Magic Modifiers
  const halved = fusion ? danceHalved(fusion.dance) : [];
  for ( const a of DBU.ATTRIBUTES ) {
    const A = sys.attributes[a];
    A.mod = Math.max(0, A.score + sum(buckets, `mod.${a}`));
    A.modParts = parts(buckets, `mod.${a}`);
    if ( halved.includes(a) ) {
      const lost = A.mod - Math.floor(A.mod / 2);
      A.mod -= lost;
      A.modParts.push({ label: game.i18n.localize(`DBU.Fusion.Dance.${fusion.dance}Short`), value: -lost });
    }
    data[a] = A.mod;
  }

  // Conditional immunities decided again, now that the Tier of Power, the Ki Pool and the Attribute Modifiers are known
  // (the pass before Stage 0 serves the Max Capacity and the earlier stages): Stage 2 and every later reader of the
  // Combat Conditions see this one. Like the unconditional ones, an immunity to Fatigued does not remove what keeps it
  // on (an Internal Injury).
  for ( const key of new Set(immunities.filter(m => m.condition).map(m => m.key)) ) {
    const immune = immunities.some(m => m.condition && (m.key === key) && test(m.condition, { ...data, ...m.ctx }));
    if ( key === "fatigued" ) cond.fatigued = immune ? fatiguedMin : Math.max(condBeforeImmunity.fatigued, fatiguedMin);
    else cond[key] = immune ? 0 : condBeforeImmunity[key];
  }
  if ( cond.fatigued !== fatigued ) {
    sys.capacity.max = Math.max(0, capacityFor(cond.fatigued));
    data.capacityMax = sys.capacity.max;
  }

  const sizeKey0 = sys.details.size in DBU.sizes ? sys.details.size : "medium";
  data.size = DBU.sizes[sizeKey0].index;
  /* ----- Stage 1.5: Racial Life Modifier, Size; stage 1.75: the Sizes of the DV / Soak bonus, Apparel Bonuses ----- */
  // (the same formula data as stage 2, which may read them: @rlm, @sizeNow, @sizeDv, @sizeSoak, @apparel.<slug>.bonus;
  // the stage 1.75 pieces may read @rlm and @sizeNow: "sizeAs.dv −1 on a Large character"). The Apparel variables are
  // known from the start with the bonuses before any "apparelBonus" piece (Break Values, what is worn, the top layer do
  // not depend on them: "while you wear no Apparel"), and worked out again below with the adjusted bonuses
  Object.assign(data, apparelVariables(apparelPieces(actor, bT, {})));
  evaluateModifiers(mods, data, { stage: 1.5, buckets });
  const rlm = rlmBase + sum(buckets, "rlm");
  let sizeIndex = DBU.sizes[sizeKey0].index + sum(buckets, "size");
  if ( buckets["size.min"] ) sizeIndex = Math.max(sizeIndex, buckets["size.min"].total);
  sizeIndex = Math.clamp(sizeIndex, 0, DBU.SIZE_ORDER.length - 1);
  Object.assign(data, { rlm, sizeNow: sizeIndex });
  evaluateModifiers(mods, data, { stage: 1.75, buckets });
  // "sizeAs.dv" / "sizeAs.soak": ± Size Categories used for that bonus; ".max" / ".min" clamp that index ("use Large")
  const sizeAs = what => {
    let i = sizeIndex + sum(buckets, `sizeAs.${what}`);
    const max = buckets[`sizeAs.${what}.max`]?.parts ?? [];
    const min = buckets[`sizeAs.${what}.min`]?.parts ?? [];
    if ( max.length ) i = Math.min(i, ...max.map(p => p.value));
    if ( min.length ) i = Math.max(i, ...min.map(p => p.value));
    return DBU.sizes[DBU.SIZE_ORDER[Math.clamp(i, 0, DBU.SIZE_ORDER.length - 1)]];
  };
  const dvSize = sizeAs("dv");
  const soakSize = sizeAs("soak");
  const apparelList = apparelPieces(actor, bT, buckets);
  Object.assign(data, { sizeDv: dvSize.dv, sizeSoak: soakSize.soak,
    sizeTop: encounter.inCombat ? Math.max(sizeIndex, sizeTopOthers) : 0, ...apparelVariables(apparelList) });

  /* ----- Stage 2: everything else ----- */
  evaluateModifiers(mods, data, { stage: 2, buckets });
  sys.buckets = buckets;
  // W: Pressure Checks (a trigger roll "1d10" the Demon effects make): @pressureBonus (± its Dice Score), @pressureAuto
  data.pressureBonus = sum(buckets, "pressure");
  data.pressureAuto = (sum(buckets, "pressure.auto") > 0) ? 1 : 0;
  const flag = key => (buckets[`flag.${key}`]?.total ?? 0) > 0;
  sys.flags = {
    greaterDice: flag("greaterDice"), ignoreThresholds: flag("ignoreThresholds"), autoHit: flag("autoHit"),
    noWeaponPenalty: flag("noWeaponPenalty"), perfectKiControl: flag("perfectKiControl"),
    straining: flag("straining"), exhausting: flag("exhausting"), autoPassBruised: flag("autoPassBruised"),
    energyWithoutFO: flag("energyWithoutFO"), magicWithoutMA: flag("magicWithoutMA"),
    noApparelPenalty: flag("noApparelPenalty"), autoStress: flag("autoStress"),
    // Rule switches: no Diminishing Defense, no Reduced Momentum after a self-inflicted Threshold crossing, automatic
    // Steadfast Checks of the Health Thresholds, Life Points cannot be regained, Energy Charge without Guard Down
    powerSpiked: !!data.powerSpiked, noDimDefense: flag("noDimDefense"), noReducedMomentum: flag("noReducedMomentum"),
    autoPassSteadfast: flag("autoPassSteadfast"), autoFailSteadfast: flag("autoFailSteadfast"),
    noLifeRegain: flag("noLifeRegain"), chargeNoGuardDown: flag("chargeNoGuardDown"), dkpUsable: flag("dkpUsable"),
    // Read by the attack workflow
    fullWager: flag("fullWager"), weaponAssisted: flag("weaponAssisted")
  };
  // Divine Ki Points: "dkp.max" adds to the maximum, "dkp.mult" multiplies it; "flag.dkpUsable" lets them be used
  if ( buckets["dkp.max"] || buckets["dkp.mult"] ) {
    sys.dkp.max = Math.max(0, roundDown((sys.dkp.max + sum(buckets, "dkp.max")) * mult(buckets, "dkp.mult")));
  }
  // (what lets them be used gives access to them: the pool is shown and filled at the start of the encounter)
  if ( sys.flags.dkpUsable ) sys.dkp.usable = sys.dkp.access = true;
  data.dkpMax = sys.dkp.max;
  const T = topCurrent;
  const attr = a => sys.attributes[a].mod;
  const score = a => sys.attributes[a].score;

  /* Size (worked out at stage 1.5) */
  const sizeKey = DBU.SIZE_ORDER[sizeIndex];
  const size = DBU.sizes[sizeKey];
  sys.size = { key: sizeKey, base: sizeKey0, index: sizeIndex, ...size };

  /* Technique Points (before the Life Points: a "life.final" modifier may name @tp) */
  const gifted = score("sc") >= 8 ? 2 : (score("sc") >= 4 ? 1 : 0);
  const tpPerSI = 15 + (gifted * 3) + sum(buckets, "tp.perSI");
  // A Fusion only has the Technique Points of Character Combination (its copied techniques are already paid for)
  const tpTotal = fusion ? ((fusion.tp ?? 0) + (sys.tp.bonus ?? 0))
    : (skillImprovements * tpPerSI) + pl1Bonus.tp + (sys.tp.bonus ?? 0) + sum(buckets, "tp");
  // Modifiers naming a late variable: the Max LP ones that only name @tp now, the others after the Aptitudes
  const lateStages = new Set(mods.filter(m => isLateModifier(m)).map(m => modifierStage(m.target, m)));
  if ( lateStages.has("lateTp") ) evaluateModifiers(mods, { ...data, tp: tpTotal }, { stage: "lateTp", buckets });

  /* Life Points */
  const lifePerLevel = rlm + (2 * score("te")) + sum(buckets, "life.perLevel") + (adv?.lifePerPL ?? 0);
  const lifeMax = Math.floor(((Math.floor((lifeStart + lifePerPL + (lifePerLevel * pl)) * injuryMult) + sum(buckets, "life.max")))
    * (buckets["life.mult"]?.total ?? 1));
  // Maximum Life Points lost until the end of the Combat Encounter (Destruction Profile, Dauntless)
  const maxLifeLoss = Math.max(0, actor.flags?.["dbu-rpg"]?.maxLifeLoss ?? 0);
  sys.maxLifeLoss = maxLifeLoss;
  // "life.final": + Max LP after every other change (life.mult included), before what is lost for the encounter
  sys.life.max = Math.max(1, lifeMax + sum(buckets, "life.final") - maxLifeLoss);
  sys.rlm = rlm;
  data.lifeMax = sys.life.max;

  /* Health Thresholds and their penalties */
  const thr = thresholdState(sys.life.value, sys.life.max);
  const failed = DBU.thresholds.filter(k => thr.below[k] && (sys.thresholds[k] === "fail")).length;
  const thresholdPenaltyMult = cond.poisoned ? 2 : 1;
  const ignoreThr = sys.flags.ignoreThresholds;
  sys.health = {
    ...thr, failed,
    combatPenalty: ignoreThr ? 0 : failed * bT * thresholdPenaltyMult,
    stressPenalty: ignoreThr ? 0 : failed * thresholdPenaltyMult,
    defeated: sys.life.value <= 0 && !(sys._effectiveStates?.undying > 0)
  };
  data.below = asHealthy ? 0 : thr.count;
  data.failed = failed;

  /* Super Stacks */
  const superStacks = Math.clamp((sys.combat.superStacks ?? 0) + sum(buckets, "superStacks"), 0, 3);
  sys.superStacks = superStacks;
  const musclePenalty = Math.max(0, ((superStacks + (superStacks >= 3 ? 1 : 0)) * bT) + sum(buckets, "muscle"));
  const massivePower = superStacks * Math.floor(attr("fo") / 4);

  /* Apparel */
  const apparel = actor.items.filter(i => (i.type === "apparel") && i.system.isActive);
  const penaltyPieces = apparel.filter(i => (i.system.category !== "standard") && !i.system.integrated && !i.system.natural);
  const apparelPenalty = (Math.max(0, apparel.length - 1) > 0) && !sys.flags.noApparelPenalty
    ? Math.max(0, Math.min(penaltyPieces.length, apparel.length - 1)) * Math.ceil(bT / 2) : 0;
  // Each piece's Apparel Bonus with its "apparelBonus.<slug>" / "apparelBonus.mult.<slug>" modifiers (stage 1.5)
  const adjustedBonus = new Map(apparelList.map(p => [p.item, p.bonus]));
  const apparelBonus = i => adjustedBonus.get(i) ?? baseApparelBonus(i, bT);
  const weights = apparel.filter(i => i.system.category === "weights").reduce((t, i) => t + apparelBonus(i), 0);
  const armor = apparel.filter(i => i.system.category === "armor");
  const armorDR = armor.length ? Math.max(...armor.map(apparelBonus)) : 0;
  const top = apparel.find(i => i.system.layer === "top");
  const combatClothingDV = (top && top.system.category === "combat") ? Math.ceil(apparelBonus(top) / 2) : 0;
  sys.apparel = { equipped: apparel, penalty: apparelPenalty, weights, armorDR, combatClothingDV };

  /* Weapons */
  const weapons = actor.items.filter(i => (i.type === "weapon") && i.system.isActive);
  const weaponPenalty = (weapons.length && !sys.flags.noWeaponPenalty) ? 2 * T : 0;
  sys.weapons = { wielded: weapons, penalty: weaponPenalty };

  /* Aptitudes */
  const floorTwo = (value, penalty) => (penalty < 0) ? Math.max(value + penalty, Math.min(value, 2)) : value + penalty;
  const prone = cond.prone > 0;
  let haste = Math.floor(attr("ag") / 2) + sum(buckets, "haste");
  if ( prone ) haste = Math.floor(haste / 2);
  const awareness = attr("in") + sum(buckets, "awareness");
  let dv = floorTwo(attr("ag") + sum(buckets, "defenseValue") + combatClothingDV, dvSize.dv * T);
  if ( prone ) dv = Math.floor(dv / 2);
  dv = Math.max(0, dv);
  const slowMult = Math.max(0, 1 - (0.25 * cond.slowed));
  const speedAll = sum(buckets, "speed");
  let speedNormal = floorTwo(2 + Math.floor(attr("ag") / 2) + speedAll + sum(buckets, "speed.normal"), size.speed);
  let speedBoosted = floorTwo(2 + attr("ag") + speedAll + sum(buckets, "speed.boosted"), size.speed);
  const speedMult = buckets["speed.mult"]?.total ?? 1;
  speedNormal = Math.max(0, Math.floor(speedNormal * slowMult * speedMult * (prone ? 0.5 : 1)));
  speedBoosted = Math.max(0, Math.floor(speedBoosted * slowMult * speedMult * (prone ? 0.5 : 1)));

  // Soak: minimum 1(bT), size cannot push it below 2, penalties may
  const soakMods = mods.length ? (buckets.soak?.parts ?? []) : [];
  const soakPos = soakMods.filter(p => p.value > 0).reduce((t, p) => t + p.value, 0)
    + (superStacks * bT);
  const soakNeg = soakMods.filter(p => p.value < 0).reduce((t, p) => t + p.value, 0);
  const soakBase = Math.max(attr("te"), bT);
  let soak = floorTwo(soakBase + soakPos, soakSize.soak * T) + soakNeg;
  soak = Math.max(0, soak);
  // "soak.mult": the Soak Value multiplied (before the Broken Combat Condition)
  if ( buckets["soak.mult"] ) soak = Math.max(0, roundDown(soak * mult(buckets, "soak.mult")));
  const brokenPenalty = cond.broken * 2 * bT;
  // T: Branded, −1(bT) Soak
  const soakFinal = Math.max(0, soak - brokenPenalty - (cond.branded ? bT : 0));
  const brokenOverflow = Math.max(0, brokenPenalty - soak);

  const might = Math.max(attr("fo"), attr("ma")) + sum(buckets, "might");
  let surgency = attr("fo") + sum(buckets, "surgency");
  if ( cond.drained ) surgency = Math.floor(surgency / 2);
  if ( buckets["surgency.mult"] ) surgency = roundDown(surgency * mult(buckets, "surgency.mult"));
  const initiative = Math.floor(score("ag") / 2) + sum(buckets, "initiative");
  const dr = armorDR + sum(buckets, "dr");

  sys.aptitudes = {
    haste, awareness, defenseValue: dv, speedNormal, speedBoosted,
    initiative, initiativeTie: score("ag") / 100,
    might, soak: soakFinal, soakBeforeBroken: soak, brokenOverflow, dr, surgency,
    ingenuity: score("sc"),
    meleeReach: size.reach, squares: size.squares,
    longRange: 9 + sum(buckets, "longRange") + (sizeIndex > 4 ? 2 * (sizeIndex - 4) : 0)
  };
  data.might = might;
  // The late pass: modifiers naming @soakNow, @surgencyNow, @dvNow or @tp ("DR equal to half your Soak"), for the
  // DR (worked out again) and the Combat Roll buckets read below (wound, strike, dodge, combat); Soak itself is untouched
  if ( lateStages.has("late") ) {
    evaluateModifiers(mods, { ...data, aptitudes: sys.aptitudes, soakNow: soakFinal, surgencyNow: surgency, dvNow: dv, tp: tpTotal },
      { stage: "late", buckets });
    sys.aptitudes.dr = armorDR + sum(buckets, "dr");
  }

  /* Stress Bonus and Steadfast */
  const determination = score("pe") >= 8 ? 2 : (score("pe") >= 4 ? 1 : 0);
  // A Fusion's Power Level above 30 only counts for ToP, Life/Ki Points, Capacity and Legend Realized
  const stressPL = fusion ? Math.min(pl, 30) : pl;
  sys.stress = {
    determination,
    bonus: stressPL + determination - sys.health.stressPenalty + sum(buckets, "stress") + (sys.combat.stressBonus ?? 0)
      + (sys.transformation.newLevel ? bT : 0),
    steadfast: sum(buckets, "steadfast")
  };

  /* Saving Throws */
  // A Fusion gains the Racial Saving Throw Bonus of all of its Races
  const raceSaves = new Set(races.flatMap(r => r.system.saves ?? []));
  // "saveProf.all": the Racial Saving Throw Bonus on every Save
  const allSaves = (buckets["saveProf.all"]?.total ?? 0) > 0;
  sys.saves = {};
  for ( const [key, def] of Object.entries(DBU.saves) ) {
    const proficient = raceSaves.has(key) || allSaves || ((buckets[`saveProf.${key}`]?.total ?? 0) > 0);
    const value = score(def.attr) + (proficient ? T : 0) + sum(buckets, "save.all", `save.${key}`);
    sys.saves[key] = {
      value: Math.max(0, value), proficient,
      crit: Math.max(7, 10 - (proficient ? 1 : 0) + sum(buckets, "crit.save", `crit.save.${key}`)),
      botch: Math.min(6, 1 + sum(buckets, "botch.save")),
      parts: [
        { label: game.i18n.localize(DBU.attributes[def.attr]), value: score(def.attr) },
        ...(proficient ? [{ label: game.i18n.localize("DBU.RacialSave"), value: T }] : []),
        ...parts(buckets, "save.all", `save.${key}`)
      ],
      // "natural.save": + Natural Result of the Saving Throws
      ...(buckets["natural.save"] ? { natural: sum(buckets, "natural.save") } : {})
    };
  }

  /* Skills */
  const rankCap = skillRankCap(bT);
  sys.skillRankCap = rankCap;
  sys.giftedStudent = gifted;
  for ( const [key, def] of Object.entries(DBU.skills) ) {
    const S = sys.skills[key];
    // "skillRank.<skill>": Ranks given by effects (still capped below)
    const totalRanks = (S.racial ?? 0) + (S.ranks ?? 0) + (S.bonusRanks ?? 0) + sum(buckets, `skillRank.${key}`);
    S.totalRanks = totalRanks;
    S.effectiveRanks = Math.min(totalRanks, rankCap);
    S.attrBonus = Math.floor(score(def.attr) / 2);
    S.rankBonus = 2 * S.effectiveRanks;
    let sizeAdj = 0;
    if ( key === "stealth" ) sizeAdj = 3 - sizeIndex;
    if ( key === "intimidation" ) sizeAdj = sizeIndex - 3;
    let extra = 0;
    if ( key === "concealment" ) extra += Math.min(3, hbEff);
    if ( cond.sleeping && ["perception", "clairvoyance"].includes(key) ) extra -= 2;
    S.total = Math.max(0, S.attrBonus + S.rankBonus + gifted + sizeAdj + extra + (S.bonus ?? 0)
      + sum(buckets, "skill.all", `skill.${key}`, `skill.attr.${def.attr}`));
    S.required = !!def.required;
    S.autoFail = S.required && (totalRanks < 1);
    S.crit = Math.max(7, 10 + sum(buckets, "crit.skill", `crit.skill.${key}`));
    S.botch = Math.min(6, 1 + sum(buckets, "botch.skill"));
    // "natural.skill" / "natural.skill.<skill>": + Natural Result of the Skill Checks
    const natural = sum(buckets, "natural.skill", `natural.skill.${key}`);
    if ( natural ) S.natural = natural;
    else if ( "natural" in S ) delete S.natural;
    S.label = def.custom && S.label ? S.label : game.i18n.localize(def.label);
  }

  /* Tier of Power dice */
  const extraInstances = Math.min(1, sum(buckets, "topDice.extra"));
  let topInstances = 1 + extraInstances - (cond.impediment ? 1 : 0);
  const impedimentPenalty = (cond.impediment && (topDiceCategory(T) + sum(buckets, "topDice.category") <= 0)) ? 2 * bT : 0;
  if ( cond.impediment && (sys._effectiveStates?.superior > 0) ) topInstances = 1 + extraInstances; // Superior ignores Impediment
  const catInc = Math.min(sum(buckets, "topDice.category"), bT + 1);
  const topCat = (roll) => {
    const inc = Math.min(catInc + sum(buckets, `topDice.category.${roll}`), bT + 1);
    return Math.max(0, topDiceCategory(T) + inc);
  };
  const greater = sys.flags.greaterDice && !(cond.impediment && sys._effectiveStates?.superior > 0)
    ? greaterDiceCategory(T) + sum(buckets, "greaterDice.category") : 0;
  sys.top.extraDiceLabel = categoryLabel(topCat("strike"));
  sys.top.greaterDiceLabel = categoryLabel(greaterDiceCategory(T));
  sys.top.critDiceLabel = categoryLabel(critDiceCategory(T));
  sys.top.instances = Math.max(0, topInstances);

  /* Combat Rolls */
  const powerBonus = powerStacks * T;
  const holdingBackPenalty = (hbEff >= bT) ? bT : 0;
  const generalPenalties = sys.health.combatPenalty + apparelPenalty + weights + impedimentPenalty + holdingBackPenalty;
  const dimOffenseStart = 3 + sum(buckets, "dimOffenseStart");
  let dimOffense = Math.max(0, (sys.combat.attacksThisRound ?? 0) - dimOffenseStart) * bT;
  // "dimOffense.mult": the Diminishing Offense penalty multiplied
  if ( buckets["dimOffense.mult"] ) dimOffense = Math.max(0, roundDown(dimOffense * mult(buckets, "dimOffense.mult")));
  sys.dimOffenseStart = dimOffenseStart;
  const guardDown = cond.guardDown ? 2 * T : 0;
  const shaken = cond.shaken ? 2 * T : 0;
  const transfigured = cond.transfigured ? 2 * bT : 0;
  // T: Branded, −1(bT) to the Combat Rolls
  const branded = cond.branded ? bT : 0;

  const martialCat = martialDieCategory(sys);
  const makeRoll = (type, flat, flatParts, { foundation } = {}) => {
    const groups = [];
    const cat = topCat(type);
    if ( cat > 0 ) for ( let i = 0; i < sys.top.instances; i++ ) groups.push({ dice: categoryToDice(cat), label: "ToP" });
    if ( greater > 0 ) groups.push({ dice: categoryToDice(greater), label: "Greater" });
    if ( martialCat > 0 ) groups.push({ dice: categoryToDice(martialCat), label: "Martial" });
    // Extra Dice granted by effects (Kaioken Dice...): each modifier is its own die of that Dice Category
    for ( const p of parts(buckets, "dice.combat", `dice.${type}`) ) {
      if ( p.value > 0 ) groups.push({ dice: categoryToDice(p.value), label: p.label });
    }
    const critCat = critDiceCategory(T) + Math.min(sum(buckets, "critDice.combat", `critDice.${type}`), bT + 1);
    return {
      type, foundation,
      bonus: flat,
      parts: flatParts,
      dice: groups,
      diceFormula: groups.map(g => diceToFormula(g.dice, g.label)).filter(Boolean).join(" + "),
      crit: Math.max(7, 10 + sum(buckets, "crit.combat", `crit.${type}`)),
      botch: Math.min(6, 1 + sum(buckets, "botch.combat", `botch.${type}`)),
      critDice: categoryToDice(critCat),
      critDiceFormula: diceToFormula(categoryToDice(critCat), "Crit"),
      botchPenalty: 2 * bT,
      natural: sum(buckets, "natural.combat", `natural.${type}`)
    };
  };

  const common = [
    ...(powerBonus ? [{ label: game.i18n.localize("DBU.PowerStacks"), value: powerBonus }] : []),
    ...(sys.health.combatPenalty ? [{ label: game.i18n.localize("DBU.ThresholdPenalty"), value: -sys.health.combatPenalty }] : []),
    ...(apparelPenalty ? [{ label: game.i18n.localize("DBU.ApparelPenalty"), value: -apparelPenalty }] : []),
    ...(weights ? [{ label: game.i18n.localize("DBU.Apparel.weights"), value: -weights }] : []),
    ...(impedimentPenalty ? [{ label: game.i18n.localize("DBU.Condition.impediment"), value: -impedimentPenalty }] : []),
    ...(holdingBackPenalty ? [{ label: "Holding Back", value: -holdingBackPenalty }] : []),
    ...(transfigured ? [{ label: game.i18n.localize("DBU.Condition.transfigured"), value: -transfigured }] : []),
    ...(branded ? [{ label: game.i18n.localize("DBU.Condition.branded"), value: -branded }] : []),
    ...parts(buckets, "combat")
  ];
  const commonTotal = powerBonus - generalPenalties - transfigured - branded + sum(buckets, "combat");

  // Strike (general part; Profile/Foundation/weapon specifics are applied by the attack workflow)
  const strikeParts = [
    { label: "Haste", value: haste }, { label: "Awareness", value: awareness }, ...common,
    ...(musclePenalty ? [{ label: game.i18n.localize("DBU.MusclePenalty"), value: -musclePenalty }] : []),
    ...(weaponPenalty ? [{ label: game.i18n.localize("DBU.WeaponPenalty"), value: -weaponPenalty }] : []),
    ...(dimOffense ? [{ label: "Diminishing Offense", value: -dimOffense }] : []),
    ...(shaken ? [{ label: game.i18n.localize("DBU.Condition.shaken"), value: -shaken }] : []),
    ...parts(buckets, "strike")
  ];
  const strikeFlat = haste + awareness + commonTotal - musclePenalty - weaponPenalty - dimOffense - shaken
    + sum(buckets, "strike");

  // "flag.noDimDefense": Diminishing Defense does not apply
  let dodgeStacks = sys.flags.noDimDefense ? 0 : (sys.combat.dimDefense ?? 0);
  // "dimDefense.penaltyMult": the Diminishing Defense penalty multiplied
  if ( dodgeStacks && buckets["dimDefense.penaltyMult"] ) dodgeStacks = Math.max(0, roundDown(dodgeStacks * mult(buckets, "dimDefense.penaltyMult")));
  const dodgeParts = [
    { label: "Defense Value", value: dv }, ...common,
    ...(musclePenalty ? [{ label: game.i18n.localize("DBU.MusclePenalty"), value: -musclePenalty }] : []),
    ...(guardDown ? [{ label: game.i18n.localize("DBU.Condition.guardDown"), value: -guardDown }] : []),
    ...(dodgeStacks ? [{ label: "Diminishing Defense", value: -dodgeStacks }] : []),
    ...parts(buckets, "dodge")
  ];
  const dodgeFlat = dv + commonTotal - musclePenalty - guardDown - dodgeStacks + sum(buckets, "dodge");

  sys.rolls = {
    strike: makeRoll("strike", strikeFlat, strikeParts),
    dodge: makeRoll("dodge", dodgeFlat, dodgeParts),
    wound: {}
  };
  for ( const f of Object.keys(DBU.foundations) ) {
    const attrKey = f === "magic" ? "ma" : "fo";
    const woundParts = [
      { label: game.i18n.localize(DBU.attributes[attrKey]), value: attr(attrKey) }, ...common,
      ...((massivePower && f !== "magic") ? [{ label: "Massive Power", value: massivePower }] : []),
      ...parts(buckets, "wound", `wound.${f}`)
    ];
    const woundFlat = attr(attrKey) + commonTotal + (f !== "magic" ? massivePower : 0)
      + sum(buckets, "wound", `wound.${f}`);
    sys.rolls.wound[f] = makeRoll("wound", woundFlat, woundParts, { foundation: f });
    sys.rolls.wound[f].damageAttribute = attr(attrKey);
    sys.rolls[`strike_${f}`] = sum(buckets, `strike.${f}`);
  }

  /* Costs and misc combat numbers */
  sys.costs = {
    attack: sum(buckets, "kpCost.attack") + (cond.drained ? 2 * sys.top.kp : 0),
    ua: sum(buckets, "kpCost.ua"),
    // "kpCost.ua.magical": shown with the Magical Unique Abilities (like kpCost.ua, nothing pays it)
    ...(buckets["kpCost.ua.magical"] ? { uaMagical: sum(buckets, "kpCost.ua.magical") } : {}),
    // "guardCost" (Power High...) and "kpCost.maneuver" (± KP of the Maneuvers the system charges)
    guard: (8 * bT) + sum(buckets, "guardCost", "kpCost.maneuver"),
    guardMultiplier: cond.guardDown ? 1.5 : 1,
    perfectKiControl: sys.flags.perfectKiControl,
    draining: sum(buckets, "draining")
  };
  sys.chargeCategory = 2 + sum(buckets, "charge.category"); // d6 base
  sys.damageTaken = sum(buckets, "damageTaken");
  sys.damageCategoryTaken = sum(buckets, "damageCategoryTaken") + (prone ? 1 : 0);
  sys.actionsPerRound = Math.max(0, 3 + sum(buckets, "actions") - cond.slowed);
  if ( cond.pinned ) sys.actionsPerRound = Math.min(1, sys.actionsPerRound);
  // One-Man Army (Elite and Villain Adversaries): PCC Adversary Actions instead of 1 Counter Action, spent the same way
  const counterBase = adv?.oneManArmy ? adv.pcc : 1;
  sys.countersPerRound = Math.clamp(counterBase + sum(buckets, "counters"), 0, Math.max(6, counterBase));
  sys.dimDefensePerAttack = DBU.DIM_DEFENSE[Math.min(7, bT + sum(buckets, "dimDefenseTop"))] ?? 1;
  // "dimDefense.mult": the stacks gained per Attacking Maneuver multiplied; "flag.noDimDefense": none gained
  if ( buckets["dimDefense.mult"] ) sys.dimDefensePerAttack = Math.max(0, roundDown(sys.dimDefensePerAttack * mult(buckets, "dimDefense.mult")));
  if ( sys.flags.noDimDefense ) sys.dimDefensePerAttack = 0;
  sys.maxWeapons = Math.max(0, ((sys._effectiveStates?.multipleArms > 0) ? 4 : 2) + sum(buckets, "weapons"));
  sys.dotMin = sum(buckets, "dotMin");
  sys.roundKi = sum(buckets, "roundKi");
  sys.kpCostByFoundation = {
    physical: sum(buckets, "kpCost.physical"), energy: sum(buckets, "kpCost.energy"), magic: sum(buckets, "kpCost.magic")
  };
  sys.gravityIntensity = gravityFor(sys);

  /* Progression budgets (standard, Generations or Path to Power at PL1: worked out before stage 0) */
  // Character Perks given by effects (Results of Training: one per Stack)
  perks.perk += sum(buckets, "perks");
  const attributeAdditions = perks.attribute + (conv.attribute ?? 0);
  // "talents": + Talent Additions; "skillImprovements" (stage 0) and the Technique Points are above
  const talentAdditions = perks.talent + (conv.talent ?? 0) + honed.talent + sum(buckets, "talents");
  const profileBuyoutCost = R.profileBuyout ? 2 * (opt.boughtProfiles?.length ?? 0) : 0;
  sys.progression = {
    perks, perksAvailable: Math.max(0, perks.perk), perksUsed: (conv.attribute ?? 0) + (conv.talent ?? 0) + (conv.skill ?? 0),
    attributeAdditions, attributePoints: (attributeAdditions * 2) + pl1Bonus.attributePoints + sum(buckets, "attributePoints")
      + ((adv?.apPerTop ?? 0) * bT),
    attributePointsSpent: DBU.ATTRIBUTES.reduce((t, a) => t + (sys.attributes[a].points ?? 0), 0),
    talentAdditions, skillImprovements,
    skillRanksFromSI: (skillImprovements * 4) + pl1Bonus.ranks + (2 * honed.technique),
    skillRanksSpent: Object.values(sys.skills).reduce((t, s) => t + (s.ranks ?? 0), 0),
    // "skillRanks.racial": ± the Racial Skill Ranks the player places in the racial column
    racialRanks: fusion ? 0 : ((race?.system.skillRanks ?? 0) + sum(buckets, "skillRanks.racial")),
    racialRanksSpent: Object.values(sys.skills).reduce((t, s) => t + (s.racial ?? 0), 0),
    tpPerSI, tpTotal, profileBuyoutCost, freeSignatureAllowed: pl1Bonus.freeSignature,
    martialLevel: ml, ng,
    awakeningPoints: R.awakeningPoints
      ? Object.entries(AWAKENING_POINTS).filter(([t]) => Number(t) <= bT).reduce((s, [, v]) => s + v, 0) : null
  };

  /* Roll data */
  // Limits of the split resources per Combat Roll (Battle Born limits grow with some Transformations and traits)
  for ( const r of sys.resources ?? [] ) {
    if ( !r.split ) continue;
    const { caps, force } = splitLimits(r, buckets);
    r.caps = caps;
    r.forceEff = force;
  }
  // Effective maximum of every resource (0 = no maximum): "resMaxSet.<slug>" sets the base one (highest wins over the
  // sheet's), "resMax.<slug>" adds to it; @resMax.<slug>
  sys.resourceMax = resourceMaximums(sys.resources ?? [], buckets);
  data.resMax = sys.resourceMax;

  sys.rollData = {
    ...data,
    T, bT, PL: pl, below: data.below, failed,
    attributes: Object.fromEntries(DBU.ATTRIBUTES.map(a => [a, { score: score(a), mod: attr(a) }])),
    aptitudes: sys.aptitudes,
    life: sys.life.value, lifeMax: sys.life.max, ki: sys.ki.value, kiMax: sys.ki.max,
    capacity: sys.capacity.value, capacityMax: sys.capacity.max,
    superStacks, power: powerStacks, stress: sys.stress.bonus
  };
  // Battle Power (the scouter reading), with the world's formula
  const formula = globalThis.game?.settings?.settings?.has("dbu-rpg.battlePowerFormula")
    ? game.settings.get("dbu-rpg", "battlePowerFormula") : undefined;
  sys.battlePower = battlePower(sys, formula);
  // The Technique Point modifiers of the Signature Techniques ("tpStart.mult.<foundation>", "tpCost.signature"): the
  // items were prepared before these buckets existed, so they are worked out again with them
  if ( Object.keys(buckets).some(k => k.startsWith("tpStart.mult.") || (k === "tpCost.signature")) ) {
    for ( const i of actor.items ) {
      if ( (i.type === "signature") && i.system ) i.system.computed = computeSignature(i.system, actor, { buckets });
    }
  }
}

export { roundDown };
