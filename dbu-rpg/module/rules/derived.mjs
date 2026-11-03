import { DBU } from "../config.mjs";
import { collectModifiers, evaluateModifiers } from "./modifiers.mjs";
import {
  categoryLabel, categoryToDice, critDiceCategory, diceToFormula, greaterDiceCategory, topDiceCategory
} from "./dice.mjs";
import { roundDown } from "./formula.mjs";
import { AWAKENING_POINTS, godHoned, gravityFor, limitedPower, martialDieCategory, rules } from "../optional-rules.mjs";
import { allocTotal, resourceSlug, splitLimits } from "./resources.mjs";
import { danceHalved } from "../fusion/fusion-rules.mjs";

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

/**
 * Compute every derived value of a DBU character.
 * Writes directly onto the TypeDataModel instance (system).
 */
export function prepareActorData(sys, actor) {
  // A Fusion's Power Level may exceed 30 (Life/Ki Points and Capacity only; the base ToP stops at 7)
  const fusion = (actor.type === "fusion") ? sys.fusion : null;
  const pl = Math.clamp(sys.pl ?? 1, 1, fusion ? 60 : 30);
  const bT = baseTopFromPL(pl);
  const statuses = actor.statuses ?? new Set();

  /* ----- Conditions ----- */
  const cond = {};
  for ( const [key, def] of Object.entries(DBU.conditions) ) {
    cond[key] = Math.min(def.max, Math.max(sys.conditions?.[key] ?? 0, statuses.has(key) ? 1 : 0));
  }
  sys.effectiveConditions = cond;
  // Unnatural: cannot gain the Suffocating or Poisoned Combat Conditions
  const unnatural = actor.items.some(i => ((i.type === "race") && i.system.unnatural)
    || (i.system?.modifiers ?? []).some(m => (m.target === "flag.unnatural") && m.active && (i.system.isActive ?? true)));
  sys.unnatural = unnatural;
  if ( unnatural ) { cond.suffocating = 0; cond.poisoned = 0; }

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
  const prelimLifeMax = Math.floor((lifeStart + lifePerPL + ((rlmBase + (2 * rawScores.te)) * pl)) * injuryMult);
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
  const data = {
    PL: pl, bT, T: bT, below: prelimThr.count, power: Math.max(0, sys.combat.power ?? 0),
    superStacks: sys.combat.superStacks ?? 0, holdingBack,
    states: { ...sys.states }, cond, res: resources,
    transformed: sys.transformation.transformed ? 1 : 0,
    inForm: activeForms.length ? 1 : 0, inEnhancement: activeEnh.length ? 1 : 0,
    enhancementCount: active.filter(t => t.system.transType === "enhancement").length,
    life: sys.life.value, ki: sys.ki.value, capacity: sys.capacity.value,
    alignment: sys.zsoul.alignment, kiLow: 0
  };

  // ToP must be known before modifiers are collected (Scaling reads it)
  sys.top = { base: bT, current: bT };
  const mods = collectModifiers(actor, sys);
  data.states = { ...sys._effectiveStates };
  const buckets = {};

  /* ----- Stage 0: Tier of Power, Ki Pool, Capacity ----- */
  evaluateModifiers(mods, data, { stage: 0, buckets });
  let topCurrent = bT + (sys.combat.topBoost ?? 0) + sum(buckets, "top") + (sys.transformation.newLevel ? 1 : 0);
  topCurrent -= holdingBack;
  if ( (holdingBack >= bT) && (bT > 0) ) topCurrent = 1;
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
  const kiBase = Math.floor((kiStart + (12 * (pl - 1))) * injuryMult) + sum(buckets, "ki.max");
  const kiMax = Math.floor(kiBase * (kiMultiplier ? 2 : 1) * (buckets["ki.mult"]?.total ?? 1));
  data.kiMaxBase = Math.floor(kiBase * (buckets["ki.mult"]?.total ?? 1));
  // Power: +1(T) Combat Rolls per stack (effects may exceed 2 stacks); Max Capacity +1/4 for the first 2 stacks only
  const powerStacks = Math.max(0, sys.combat.power ?? 0);
  const capBase = 20 + (4 * (pl - 1)) + sum(buckets, "capacity.max");
  const capMax = Math.floor(capBase * (1 + (0.25 * Math.min(powerStacks, 2))) * (kiMultiplier ? 1.5 : 1)
    * (buckets["capacity.mult"]?.total ?? 1) / (2 ** fatigued));
  sys.ki.max = Math.max(0, kiMax);
  sys.capacity.max = Math.max(0, capMax);
  data.kiMax = sys.ki.max;
  data.capacityMax = sys.capacity.max;
  data.kiLow = (sys.ki.value < (sys.ki.max / 4)) ? 1 : 0;

  /* ----- Stage 1: Attribute Scores and Modifiers ----- */
  data.scores = { ...rawScores };
  evaluateModifiers(mods, data, { stage: 1, buckets });
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

  /* ----- Stage 2: everything else ----- */
  const sizeKey0 = sys.details.size in DBU.sizes ? sys.details.size : "medium";
  data.size = DBU.sizes[sizeKey0].index;
  evaluateModifiers(mods, data, { stage: 2, buckets });
  sys.buckets = buckets;
  const flag = key => (buckets[`flag.${key}`]?.total ?? 0) > 0;
  sys.flags = {
    greaterDice: flag("greaterDice"), ignoreThresholds: flag("ignoreThresholds"), autoHit: flag("autoHit"),
    noWeaponPenalty: flag("noWeaponPenalty"), perfectKiControl: flag("perfectKiControl"),
    straining: flag("straining"), exhausting: flag("exhausting"), autoPassBruised: flag("autoPassBruised"),
    energyWithoutFO: flag("energyWithoutFO"), magicWithoutMA: flag("magicWithoutMA"),
    noApparelPenalty: flag("noApparelPenalty"), autoStress: flag("autoStress")
  };
  const T = topCurrent;
  const attr = a => sys.attributes[a].mod;
  const score = a => sys.attributes[a].score;

  /* Size */
  let sizeIndex = DBU.sizes[sizeKey0].index + sum(buckets, "size");
  if ( buckets["size.min"] ) sizeIndex = Math.max(sizeIndex, buckets["size.min"].total);
  sizeIndex = Math.clamp(sizeIndex, 0, DBU.SIZE_ORDER.length - 1);
  const sizeKey = DBU.SIZE_ORDER[sizeIndex];
  const size = DBU.sizes[sizeKey];
  sys.size = { key: sizeKey, base: sizeKey0, index: sizeIndex, ...size };

  /* Life Points */
  const rlm = rlmBase + sum(buckets, "rlm");
  const lifePerLevel = rlm + (2 * score("te")) + sum(buckets, "life.perLevel");
  const lifeMax = Math.floor(((Math.floor((lifeStart + lifePerPL + (lifePerLevel * pl)) * injuryMult) + sum(buckets, "life.max")))
    * (buckets["life.mult"]?.total ?? 1));
  sys.life.max = Math.max(1, lifeMax);
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
  data.below = thr.count;
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
  const apparelBonus = i => (DBU.craftsmanship[i.system.craftsmanship]?.apparelBonus ?? 1) * bT;
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
  let dv = floorTwo(attr("ag") + sum(buckets, "defenseValue") + combatClothingDV, size.dv * T);
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
  let soak = floorTwo(soakBase + soakPos, size.soak * T) + soakNeg;
  soak = Math.max(0, soak);
  const brokenPenalty = cond.broken * 2 * bT;
  const soakFinal = Math.max(0, soak - brokenPenalty);
  const brokenOverflow = Math.max(0, brokenPenalty - soak);

  const might = Math.max(attr("fo"), attr("ma")) + sum(buckets, "might");
  let surgency = attr("fo") + sum(buckets, "surgency");
  if ( cond.drained ) surgency = Math.floor(surgency / 2);
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
  sys.saves = {};
  for ( const [key, def] of Object.entries(DBU.saves) ) {
    const proficient = raceSaves.has(key) || ((buckets[`saveProf.${key}`]?.total ?? 0) > 0);
    const value = score(def.attr) + (proficient ? T : 0) + sum(buckets, "save.all", `save.${key}`);
    sys.saves[key] = {
      value: Math.max(0, value), proficient,
      crit: Math.max(7, 10 - (proficient ? 1 : 0) + sum(buckets, "crit.save", `crit.save.${key}`)),
      botch: Math.min(6, 1 + sum(buckets, "botch.save")),
      parts: [
        { label: game.i18n.localize(DBU.attributes[def.attr]), value: score(def.attr) },
        ...(proficient ? [{ label: game.i18n.localize("DBU.RacialSave"), value: T }] : []),
        ...parts(buckets, "save.all", `save.${key}`)
      ]
    };
  }

  /* Skills */
  const gifted = score("sc") >= 8 ? 2 : (score("sc") >= 4 ? 1 : 0);
  const rankCap = skillRankCap(bT);
  sys.skillRankCap = rankCap;
  sys.giftedStudent = gifted;
  for ( const [key, def] of Object.entries(DBU.skills) ) {
    const S = sys.skills[key];
    const totalRanks = (S.racial ?? 0) + (S.ranks ?? 0) + (S.bonusRanks ?? 0);
    S.totalRanks = totalRanks;
    S.effectiveRanks = Math.min(totalRanks, rankCap);
    S.attrBonus = Math.floor(score(def.attr) / 2);
    S.rankBonus = 2 * S.effectiveRanks;
    let sizeAdj = 0;
    if ( key === "stealth" ) sizeAdj = 3 - sizeIndex;
    if ( key === "intimidation" ) sizeAdj = sizeIndex - 3;
    let extra = 0;
    if ( key === "concealment" ) extra += Math.min(3, holdingBack);
    if ( cond.sleeping && ["perception", "clairvoyance"].includes(key) ) extra -= 2;
    S.total = Math.max(0, S.attrBonus + S.rankBonus + gifted + sizeAdj + extra + (S.bonus ?? 0)
      + sum(buckets, "skill.all", `skill.${key}`, `skill.attr.${def.attr}`));
    S.required = !!def.required;
    S.autoFail = S.required && (totalRanks < 1);
    S.crit = Math.max(7, 10 + sum(buckets, "crit.skill", `crit.skill.${key}`));
    S.botch = Math.min(6, 1 + sum(buckets, "botch.skill"));
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
  const holdingBackPenalty = (holdingBack >= bT) ? bT : 0;
  const generalPenalties = sys.health.combatPenalty + apparelPenalty + weights + impedimentPenalty + holdingBackPenalty;
  const dimOffenseStart = 3 + sum(buckets, "dimOffenseStart");
  const dimOffense = Math.max(0, (sys.combat.attacksThisRound ?? 0) - dimOffenseStart) * bT;
  sys.dimOffenseStart = dimOffenseStart;
  const guardDown = cond.guardDown ? 2 * T : 0;
  const shaken = cond.shaken ? 2 * T : 0;
  const transfigured = cond.transfigured ? 2 * bT : 0;

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
    ...parts(buckets, "combat")
  ];
  const commonTotal = powerBonus - generalPenalties - transfigured + sum(buckets, "combat");

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

  const dodgeStacks = sys.combat.dimDefense ?? 0;
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
    guard: (8 * bT) + sum(buckets, "guardCost"),
    guardMultiplier: cond.guardDown ? 1.5 : 1,
    perfectKiControl: sys.flags.perfectKiControl,
    draining: sum(buckets, "draining")
  };
  sys.chargeCategory = 2 + sum(buckets, "charge.category"); // d6 base
  sys.damageTaken = sum(buckets, "damageTaken");
  sys.damageCategoryTaken = sum(buckets, "damageCategoryTaken") + (prone ? 1 : 0);
  sys.actionsPerRound = Math.max(0, 3 + sum(buckets, "actions") - cond.slowed);
  if ( cond.pinned ) sys.actionsPerRound = Math.min(1, sys.actionsPerRound);
  sys.countersPerRound = Math.clamp(1 + sum(buckets, "counters"), 0, 6);
  sys.dimDefensePerAttack = DBU.DIM_DEFENSE[Math.min(7, bT + sum(buckets, "dimDefenseTop"))] ?? 1;
  sys.maxWeapons = Math.max(0, ((sys._effectiveStates?.multipleArms > 0) ? 4 : 2) + sum(buckets, "weapons"));
  sys.dotMin = sum(buckets, "dotMin");
  sys.roundKi = sum(buckets, "roundKi");
  sys.kpCostByFoundation = {
    physical: sum(buckets, "kpCost.physical"), energy: sum(buckets, "kpCost.energy"), magic: sum(buckets, "kpCost.magic")
  };
  sys.gravityIntensity = gravityFor(sys);

  /* Progression budgets (standard, Generations or Path to Power at PL1) */
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
  const attributeAdditions = perks.attribute + (conv.attribute ?? 0);
  const talentAdditions = perks.talent + (conv.talent ?? 0) + honed.talent;
  const skillImprovements = perks.skill + (conv.skill ?? 0);
  const tpPerSI = 15 + (gifted * 3) + sum(buckets, "tp.perSI");
  // A Fusion only has the Technique Points of Character Combination (its copied techniques are already paid for)
  const tpTotal = fusion ? ((fusion.tp ?? 0) + (sys.tp.bonus ?? 0))
    : (skillImprovements * tpPerSI) + pl1Bonus.tp + (sys.tp.bonus ?? 0) + sum(buckets, "tp");
  const profileBuyoutCost = R.profileBuyout ? 2 * (opt.boughtProfiles?.length ?? 0) : 0;
  sys.progression = {
    perks, perksAvailable: Math.max(0, perks.perk), perksUsed: (conv.attribute ?? 0) + (conv.talent ?? 0) + (conv.skill ?? 0),
    attributeAdditions, attributePoints: (attributeAdditions * 2) + pl1Bonus.attributePoints,
    attributePointsSpent: DBU.ATTRIBUTES.reduce((t, a) => t + (sys.attributes[a].points ?? 0), 0),
    talentAdditions, skillImprovements,
    skillRanksFromSI: (skillImprovements * 4) + pl1Bonus.ranks + (2 * honed.technique),
    skillRanksSpent: Object.values(sys.skills).reduce((t, s) => t + (s.ranks ?? 0), 0),
    racialRanks: fusion ? 0 : (race?.system.skillRanks ?? 0),
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

  sys.rollData = {
    ...data,
    T, bT, PL: pl, below: thr.count, failed,
    attributes: Object.fromEntries(DBU.ATTRIBUTES.map(a => [a, { score: score(a), mod: attr(a) }])),
    aptitudes: sys.aptitudes,
    life: sys.life.value, lifeMax: sys.life.max, ki: sys.ki.value, kiMax: sys.ki.max,
    capacity: sys.capacity.value, capacityMax: sys.capacity.max,
    superStacks, power: powerStacks, stress: sys.stress.bonus
  };
}

export { roundDown };
