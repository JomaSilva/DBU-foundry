import { DBU } from "../config.mjs";

/** Base Tier of Power of a Power Level (same table as the character sheet; kept here to avoid an import cycle). */
const baseTopFromPL = pl => Math.min(7, Math.floor(Math.clamp(pl, 1, 30) / 5) + 1);

/**
 * Fusion rules (dbu-rpg.com/fusion and /fusion-methods-modifiers): Fusion Methods with their Method Traits,
 * Fusion Modifiers with their prerequisites, and the Fusion Awakening Limit.
 * Effects use the same modifier/trigger format as the compendium items.
 */

/** Fusion Awakening Limit by base Tier of Power (replaces the usual Awakening Limit). */
export const FUSION_AWAKENING_LIMITS = {
  1: { lesser: 3, greater: 1 }, 2: { lesser: 4, greater: 2 }, 3: { lesser: 5, greater: 3 }, 4: { lesser: 6, greater: 3 },
  5: { lesser: 7, greater: 4 }, 6: { lesser: 8, greater: 5 }, 7: { lesser: 10, greater: 6 }
};

/** A Fusion cannot have more than 7 Racial Traits: 2~4 Primary, the rest Secondary/Subrace (Factors replace Secondaries). */
export const FUSION_TRAIT_LIMITS = { total: 7, primaryMin: 2, primaryMax: 4 };

export const mod = (target, value, label, condition = "") => ({ target, value, condition, label, active: true, always: false });

/**
 * Fusion Methods. type: temporary (Round Limit) or lasting; min/max = Fused Character Limit.
 * apparel: "metamoran" (Metamoran Clothing replaces the Apparel), "metamoranDivine" (with Divine Apparel),
 * "combined" (one piece per layer, qualities merged by hand) or "" (the Fused Characters' Apparel).
 */
export const FUSION_METHODS = {
  metamorese: {
    label: "Metamorese Fusion", trait: "Metamoran Style", type: "temporary", rounds: 10, min: 2, max: 2,
    obtain: "Metamoran Fusion Dance", apparel: "metamoran", karma: 2, dance: true,
    modifiers: [mod("stress", "2", "Metamoran Style (2)")]
  },
  potara: {
    label: "Potara Fusion", trait: "Divine Fusion Method", type: "temporary", rounds: 20, min: 2, max: 2,
    obtain: "Potara Earring", apparel: "combined", stressSave: true,
    modifiers: [
      mod("flag.noApparelPenalty", "1", "Divine Fusion Method (2)"),
      mod("wound", "2(bT)", "Divine Fusion Method (3)", "@states.godKi >= 1"),
      mod("dr", "2(bT)", "Divine Fusion Method (3)", "@states.godKi >= 1"),
      mod("life.max", "2 * @PL", "Divine Fusion Method (4)")
    ]
  },
  maxi: {
    label: "Maxi Fusion", trait: "Maximum Metamorese", type: "temporary", rounds: 1, min: 5, max: 5,
    obtain: "Metamoran Fusion Dance — Five-Way Fusion", apparel: "metamoranDivine", actions: 2,
    modifiers: [mod("flag.autoStress", "1", "Maximum Metamorese (3)")]
  },
  merge: {
    label: "Merge Fusion", trait: "Bio-Fusion", type: "lasting", min: 2, max: 4,
    obtain: "ARC / Custom Species", apparel: "", sizeUp: true, modifiers: []
  },
  ex: {
    label: "EX Fusion", trait: "Fusion of Fusion Methods", type: "lasting", min: 2, max: 2,
    obtain: "Metamoran Fusion Dance + Metamo-Ring", apparel: "combined",
    modifiers: [mod("flag.noApparelPenalty", "1", "Fusion of Fusion Methods (2)"), mod("stress", "1", "Fusion of Fusion Methods (3)")]
  },
  parasitic: {
    label: "Parasitic Fusion", trait: "Merged Tuffle", type: "lasting", min: 2, max: 2,
    obtain: "Tuffle Fusion", apparel: "", forgo: true, modifiers: []
  }
};

/** Fusion Modifiers: Temporary Fusions select up to 2, Lasting ones 1 (none for a Plump/Frail Fusion). */
export const FUSION_MODIFIERS = {
  balanced: { label: "Balanced Fusion" },
  dominant: { label: "Dominant Personality" },
  enhanced: { label: "Enhanced Fusion" },
  fusedTransformation: { label: "Fused Transformation" },
  powerOfFriendship: { label: "Power of Friendship" },
  sharedHeritage: { label: "Shared Heritage" },
  synergistic: { label: "Synergistic Fusion" },
  mightiest: { label: "The Mightiest Fusion" }
};

const ATTRS = ["ag", "fo", "te", "sc", "in", "ma", "pe"];
const PHYSICAL = ["ag", "fo", "te", "ma"];
const nameKey = s => String(s ?? "").trim().toLowerCase();

/** Minion Fusions do not get the Fusion Power Level increase. */
export function isMinion(actor) {
  return ((actor.type === "npc") && (actor.system.npcType === "minion"))
    || actor.items.some(i => (i.type === "race") && i.system.minion);
}

/** The Fused Characters of a Fusion actor (missing ones are skipped). */
export function getComponents(fusion) {
  return (fusion.system.fusion?.components ?? []).map(uuid => fromUuidSync(uuid)).filter(a => a instanceof Actor);
}

/**
 * Everything the Character Combination steps derive from the Fused Characters, before any choice is applied.
 * Used by the sheet (preview) and by the synchronization.
 */
export function analyzeFusion(fusion) {
  const fs = fusion.system.fusion;
  const method = FUSION_METHODS[fs.method] ?? FUSION_METHODS.metamorese;
  const comps = getComponents(fusion);
  const out = {
    method, comps, problems: [], ok: comps.length >= 2,
    traits: [], awakenings: [], races: [], scoreRows: [], prereq: {}, balancedAttrs: [], sharedForms: [], commonTalents: [],
    awakeningLimits: FUSION_AWAKENING_LIMITS[1], karma: 0
  };
  if ( !comps.length ) return out;

  // Fusion Power Level: 1(bT) above the highest Power Level when all are within 5 of it (not with Minions)
  const pls = comps.map(c => c.system.pl);
  const highest = Math.max(...pls);
  const leader = comps[pls.indexOf(highest)];
  const bT = baseTopFromPL(highest);
  const within = pls.every(p => (highest - p) <= 5);
  const minion = comps.some(isMinion);
  out.highestPL = highest;
  out.leader = leader;
  out.bT = bT;
  out.within = within;
  out.minion = minion;
  out.plBonus = (within && !minion) ? bT : 0;

  // Attribute Scores: the highest Score of each Attribute
  out.scores = {};
  out.scoreRows = ATTRS.map(a => {
    const values = comps.map(c => c.system.attributes[a].score);
    out.scores[a] = Math.max(...values);
    return { key: a, values, value: out.scores[a] };
  });

  // Skill Ranks: the highest number of Ranks in each Skill
  out.skills = {};
  for ( const key of Object.keys(fusion.system._source.skills ?? {}) ) {
    out.skills[key] = Math.max(...comps.map(c => {
      const S = c.system._source.skills?.[key] ?? {};
      return (S.racial ?? 0) + (S.ranks ?? 0) + (S.bonusRanks ?? 0);
    }));
  }

  // Z-Soul Alignment range, Karma, base Size range
  const al = comps.map(c => c.system.zsoul.alignment);
  out.alignment = { min: Math.min(...al), max: Math.max(...al) };
  out.karma = comps.reduce((t, c) => t + (c.system.karma.value ?? 0), 0);
  const sizes = DBU.SIZE_ORDER;
  const idx = comps.map(c => sizes.indexOf(c.system.details.size));
  out.size = { min: Math.min(...idx), max: Math.max(...idx), leader: sizes.indexOf(leader.system.details.size) };

  // Races (all of them) and Racial Trait candidates
  out.races = [];
  for ( const c of comps ) for ( const r of c.items.filter(i => i.type === "race") ) {
    if ( !out.races.some(x => nameKey(x.name) === nameKey(r.name)) ) out.races.push(r);
  }
  out.traits = [];
  for ( const c of comps ) for ( const t of c.items.filter(i => i.type === "racialTrait") ) {
    const tier = t.system.tier;
    if ( !["primary", "secondary", "subrace", "factor"].includes(tier) ) continue;
    if ( out.traits.some(x => nameKey(x.item.name) === nameKey(t.name)) ) continue;
    // Choices are kept by name: they survive the Fused Characters' items being recreated
    out.traits.push({ key: t.name, item: t, comp: c, primary: tier === "primary" });
  }

  // Awakenings (chosen within the Fusion Awakening Limit)
  out.awakeningLimits = FUSION_AWAKENING_LIMITS[bT] ?? FUSION_AWAKENING_LIMITS[7];
  out.awakenings = [];
  for ( const c of comps ) for ( const t of c.items.filter(i => (i.type === "transformation") && (i.system.transType === "awakening")) ) {
    if ( out.awakenings.some(x => nameKey(x.item.name) === nameKey(t.name)) ) continue;
    out.awakenings.push({ key: t.name, item: t, comp: c, kind: t.system.subtype || "lesser" });
  }

  // Fusion Modifier prerequisites
  const talentSets = comps.map(c => new Set(c.items.filter(i => i.type === "talent").map(i => nameKey(i.name))));
  const common = [...talentSets[0]].filter(n => talentSets.every(s => s.has(n)));
  const formSets = comps.map(c => c.items.filter(i => (i.type === "transformation") && (i.system.transType === "form")));
  const sharedForms = formSets[0].filter(f => formSets.every(list => list.some(o => nameKey(o.name) === nameKey(f.name))));
  const balancedAttrs = ATTRS.filter(a => {
    const v = comps.map(c => c.system.attributes[a].score);
    return (Math.max(...v) - Math.min(...v)) <= 1;
  });
  const nonMinions = comps.filter(c => !isMinion(c)).length;
  const topPLs = pls.filter(p => p === highest).length;
  const raceNames = comps.map(c => c.items.filter(i => i.type === "race").map(i => nameKey(i.name)).join("+"));
  const both = name => (comps.length === 2) && comps.every(c => c.items.some(i => (i.type === "talent") && nameKey(i.name).startsWith(name)));
  out.commonTalents = common;
  out.sharedForms = sharedForms;
  out.balancedAttrs = balancedAttrs;
  out.prereq = {
    balanced: balancedAttrs.length >= 2,
    dominant: (nonMinions === 1) || (topPLs === 1),
    enhanced: formSets.every(list => !list.length),
    fusedTransformation: sharedForms.length > 0,
    powerOfFriendship: both("synchronized combatant"),
    sharedHeritage: raceNames.every(r => r && (r === raceNames[0])),
    synergistic: common.length >= (2 + bT),
    mightiest: both("chosen rival")
  };

  // Problems that stop the Fusion
  if ( comps.length < method.min ) out.problems.push(game.i18n.format("DBU.Fusion.ErrFew", { n: method.min, method: method.label }));
  if ( comps.length > method.max ) out.problems.push(game.i18n.format("DBU.Fusion.ErrMany", { n: method.max, method: method.label }));
  for ( const c of comps ) if ( c.type === "fusion" ) out.problems.push(game.i18n.format("DBU.Fusion.ErrFusionLimit", { name: c.name }));
  out.ok = !out.problems.length && comps.length >= 2;
  return out;
}

/** Which Fusion Modifiers are in effect (prerequisites met, within the limit, none for a Plump/Frail Fusion). */
export function activeModifiers(fusion, analysis) {
  const fs = fusion.system.fusion;
  if ( fs.dance !== "success" ) return [];
  const limit = (analysis.method.type === "temporary") ? 2 : 1;
  return (fs.modifiers ?? []).filter(k => FUSION_MODIFIERS[k] && analysis.prereq?.[k]).slice(0, limit);
}

/** The Fusion's Power Level (Synergistic Fusion adds 3). */
export function fusionPowerLevel(fusion, analysis) {
  if ( !analysis.highestPL ) return fusion.system.pl;
  const synergistic = activeModifiers(fusion, analysis).includes("synergistic");
  return analysis.highestPL + analysis.plBonus + (synergistic ? 3 : 0);
}

/** Technique Points from Character Combination: 10(bT), or 15(bT) without a Fused Technique; Dominant Personality doubles them. */
export function fusionTechniquePoints(fusion, analysis) {
  const fs = fusion.system.fusion;
  const base = (fs.fusedTechnique ? 10 : 15) * (analysis.bT ?? 1);
  return base * (activeModifiers(fusion, analysis).includes("dominant") ? 2 : 1);
}

/** Default Racial Trait picks: the Primary Traits (up to 4), then the others until 7. */
export function defaultTraitPicks(analysis) {
  const primaries = analysis.traits.filter(t => t.primary).slice(0, FUSION_TRAIT_LIMITS.primaryMax);
  const others = analysis.traits.filter(t => !t.primary);
  return [...primaries, ...others].slice(0, FUSION_TRAIT_LIMITS.total).map(t => t.key);
}

/** Default Awakening picks: in order, as long as they fit the Fusion Awakening Limit. */
export function defaultAwakeningPicks(analysis) {
  const used = { lesser: 0, greater: 0, super: 0 };
  const max = { ...analysis.awakeningLimits, super: 1 };
  const picks = [];
  for ( const a of analysis.awakenings ) {
    const kind = (a.kind in used) ? a.kind : "lesser";
    if ( used[kind] >= max[kind] ) continue;
    used[kind] += 1;
    picks.push(a.key);
  }
  return picks;
}

/** The 2 Balanced Attributes of Balanced Fusion: the chosen ones, completed with the first eligible ones. */
export function balancedPicks(fs, analysis) {
  const eligible = analysis.balancedAttrs ?? [];
  const picks = (fs.balanced ?? []).filter(a => eligible.includes(a));
  return [...picks, ...eligible.filter(a => !picks.includes(a))].slice(0, 2);
}

/** The Attribute Modifiers halved by a failed Fusion Dance. */
export function danceHalved(dance) {
  if ( dance === "plump" ) return ["ag"];
  if ( dance === "frail" ) return [...PHYSICAL];
  return [];
}
