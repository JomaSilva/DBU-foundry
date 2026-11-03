import { DBU } from "../config.mjs";
import { limitedPower, rules } from "../optional-rules.mjs";
import { FUSION_AWAKENING_LIMITS, FUSION_METHODS, FUSION_TRAIT_LIMITS } from "../fusion/fusion-rules.mjs";

/**
 * Rule checks for a DBU character sheet. Returns a list of problems:
 * { level: "error"|"warning"|"info", category, message }
 * error   = the sheet breaks a rule
 * warning = something is incomplete or needs the ARC's attention
 * info    = reminders (unspent points, etc.)
 */
export function validateActor(sys, actor) {
  const out = [];
  const L = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);
  const add = (level, category, key, data) => out.push({ level, category, message: L(key, data) });
  const bT = sys.top.base;
  const prog = sys.progression;
  const items = actor.items;
  const R = rules();
  const noLimit = !!R.withoutLimit;
  const byType = type => items.filter(i => i.type === type);
  const attrName = a => game.i18n.localize(DBU.attributes[a]);

  // A Fusion is not made through Character Creation: it follows the Character Combination rules instead
  const isFusion = actor.type === "fusion";
  if ( isFusion ) validateFusion(sys, actor, add);

  /* ----- Race ----- */
  const races = byType("race");
  if ( !races.length ) add("warning", "race", "DBU.Val.NoRace");
  if ( (races.length > 1) && !isFusion ) add("error", "race", "DBU.Val.MultipleRaces");
  const race = races[0];
  if ( race && !isFusion ) validateRaceIncreases(race, add);

  /* ----- Size ----- */
  const allowedSizes = race?.system.sizes?.length ? race.system.sizes : DBU.CREATION_SIZES;
  if ( !allowedSizes.includes(sys.details.size) && !isFusion ) {
    add("warning", "race", "DBU.Val.CreationSize", { size: game.i18n.localize(DBU.sizes[sys.details.size]?.label ?? "") });
  }
  // Age and Size: children cannot be larger than Small, adolescents than Medium
  if ( R.age ) {
    const age = sys.optional.physicalAge;
    const maxSize = ["youngChild", "child"].includes(age) ? "small" : (age === "adolescent" ? "medium" : null);
    if ( maxSize && (DBU.sizes[sys.details.size].index > DBU.sizes[maxSize].index) ) {
      add("error", "race", "DBU.Val.AgeSize", { size: game.i18n.localize(DBU.sizes[maxSize].label) });
    }
  }

  /* ----- Perks ----- */
  if ( isFusion ) { /* no Character Creation budgets */ }
  else if ( prog.perksUsed > prog.perksAvailable ) {
    add("error", "progression", "DBU.Val.PerksOver", { used: prog.perksUsed, max: prog.perksAvailable });
  }
  else if ( prog.perksUsed < prog.perksAvailable ) {
    add("info", "progression", "DBU.Val.PerksLeft", { n: prog.perksAvailable - prog.perksUsed });
  }

  /* ----- Attributes ----- */
  if ( isFusion ) { /* Attribute Scores come from the Fused Characters */ }
  else if ( prog.attributePointsSpent > prog.attributePoints ) {
    add("error", "attributes", "DBU.Val.AttrPointsOver", { spent: prog.attributePointsSpent, max: prog.attributePoints });
  }
  else if ( prog.attributePointsSpent < prog.attributePoints ) {
    add("info", "attributes", "DBU.Val.AttrPointsLeft", { n: prog.attributePoints - prog.attributePointsSpent });
  }
  for ( const a of DBU.ATTRIBUTES ) {
    const A = sys.attributes[a];
    if ( !noLimit && (A.score > A.limit) ) add("error", "attributes", "DBU.Val.ScoreLimit", { attr: attrName(a), score: A.score, limit: A.limit, top: bT });
  }

  /* ----- Skills ----- */
  const cap = sys.skillRankCap;
  for ( const [key, S] of Object.entries(sys.skills) ) {
    if ( S.totalRanks > cap ) add("error", "skills", "DBU.Val.SkillCap", { skill: S.label, ranks: S.totalRanks, cap, top: bT });
    if ( !isFusion && ((S.ranks ?? 0) > (prog.skillImprovements + 2)) ) {
      add("error", "skills", "DBU.Val.SkillSIRepeat", { skill: S.label, n: prog.skillImprovements });
    }
  }
  // A Fusion's Skill Ranks are the highest of its Fused Characters
  if ( isFusion ) { /* no Skill Improvement budget */ }
  else if ( prog.racialRanksSpent > prog.racialRanks ) {
    add("error", "skills", "DBU.Val.RacialRanksOver", { spent: prog.racialRanksSpent, max: prog.racialRanks });
  }
  else if ( race && (prog.racialRanksSpent < prog.racialRanks) ) {
    add("info", "skills", "DBU.Val.RacialRanksLeft", { n: prog.racialRanks - prog.racialRanksSpent });
  }
  if ( isFusion ) { /* idem */ }
  else if ( prog.skillRanksSpent > prog.skillRanksFromSI ) {
    add("error", "skills", "DBU.Val.SkillRanksOver", { spent: prog.skillRanksSpent, max: prog.skillRanksFromSI });
  }
  else if ( prog.skillRanksSpent < prog.skillRanksFromSI ) {
    add("info", "skills", "DBU.Val.SkillRanksLeft", { n: prog.skillRanksFromSI - prog.skillRanksSpent });
  }

  /* ----- Talents ----- */
  const talents = byType("talent");
  // A Fusion has every Talent of its Fused Characters
  const paidTalents = isFusion ? [] : talents.filter(t => !t.system.granted);
  if ( isFusion ) { /* no Talent Additions */ }
  else if ( paidTalents.length > prog.talentAdditions ) {
    add("error", "talents", "DBU.Val.TalentsOver", { n: paidTalents.length, max: prog.talentAdditions });
  }
  else if ( paidTalents.length < prog.talentAdditions ) {
    add("info", "talents", "DBU.Val.TalentsLeft", { n: prog.talentAdditions - paidTalents.length });
  }
  duplicates(talents).forEach(name => add("error", "talents", "DBU.Val.Duplicate", { name }));
  // Character Creation: the 4 initial Talents must come from different Categories (except Miscellaneous and Skill)
  const initial = paidTalents.filter(t => (t.system.takenAt ?? 1) === 1);
  const catCount = {};
  for ( const t of initial ) {
    const c = t.system.category || "Miscellaneous";
    if ( DBU.TALENT_FREE_CATEGORIES.includes(c) ) continue;
    catCount[c] = (catCount[c] ?? 0) + 1;
  }
  const repeats = Object.values(catCount).reduce((t, n) => t + Math.max(0, n - 1), 0);
  const allowedRepeats = Math.max(0, initial.length - 4);
  if ( repeats > allowedRepeats ) {
    const cats = Object.entries(catCount).filter(([, n]) => n > 1).map(([c]) => c).join(", ");
    add("error", "talents", "DBU.Val.TalentCategories", { cats });
  }
  for ( const t of talents ) {
    for ( const problem of checkPrerequisites(t, sys, actor) ) add("error", "talents", "DBU.Val.Prereq", { name: t.name, problem });
  }

  /* ----- Technique Points ----- */
  const signatures = byType("signature");
  const uas = byType("uniqueAbility");
  const freeSigs = signatures.filter(s => s.system.free);
  const limited = limitedPower(sys);
  let sigCap = noLimit ? Infinity : (DBU.SIGNATURE_TP_CAP[bT] ?? 50);
  if ( limited ) sigCap = 15;
  let tpSpent = (sys.tp.spentOther ?? 0) + (prog.profileBuyoutCost ?? 0);
  if ( freeSigs.length && !prog.freeSignatureAllowed ) add("error", "signatures", "DBU.Val.NoFreeSignature");
  if ( limited && signatures.some(s => s.system.level !== "super") ) add("error", "signatures", "DBU.Val.PathToPowerSuper");
  for ( const s of signatures ) {
    const c = s.system.computed;
    if ( !c ) continue;
    if ( !s.system.free && !s.system.granted ) tpSpent += c.tp;
    for ( const e of c.errors ) add("error", "signatures", "DBU.Val.SigProblem", { name: s.name, problem: e });
    for ( const w of c.warnings ) add("warning", "signatures", "DBU.Val.SigProblem", { name: s.name, problem: w });
    if ( !s.system.granted && !s.system.free && (c.tp > sigCap) ) add("error", "signatures", "DBU.Val.SigCap", { name: s.name, tp: c.tp, cap: sigCap, top: bT });
    if ( s.system.free && (c.tp > 20) ) add("error", "signatures", "DBU.Val.SigFree20", { name: s.name, tp: c.tp });
    if ( (s.system.foundation === "energy") && (sys.attributes.fo.score < 3) && !sys.flags.energyWithoutFO ) {
      add("error", "signatures", "DBU.Val.EnergyFO", { name: s.name });
    }
    const favored = isFavoredElement(s.system.profile, actor);
    if ( (s.system.foundation === "magic") && (sys.attributes.ma.score < 3) && !sys.flags.magicWithoutMA && !favored ) {
      add("error", "signatures", "DBU.Val.MagicMA", { name: s.name });
    }
  }
  if ( freeSigs.length > 1 ) add("error", "signatures", "DBU.Val.MultipleFree");
  const counted = signatures.filter(s => !s.system.granted);
  const ultimates = counted.filter(s => ["ultimate", "finisher"].includes(s.system.level)).length;
  const supers = counted.filter(s => s.system.level === "super").length;
  if ( ultimates > Math.max(1, supers) ) add("error", "signatures", "DBU.Val.UltimateLimit", { u: ultimates, s: supers });
  const finishers = counted.filter(s => s.system.level === "finisher");
  if ( finishers.length > 1 ) add("error", "signatures", "DBU.Val.FinisherLimit");
  if ( finishers.some(f => f.system.free) ) add("error", "signatures", "DBU.Val.FinisherCreation");
  duplicates(signatures).forEach(name => add("warning", "signatures", "DBU.Val.Duplicate", { name }));

  for ( const u of uas ) {
    // Unique Abilities a Fusion got from its Fused Characters are already paid for
    if ( !(isFusion && u.flags?.["dbu-rpg"]?.fusion?.from) ) tpSpent += u.system.tpSpent;
    for ( const problem of checkPrerequisites(u, sys, actor) ) add("error", "abilities", "DBU.Val.Prereq", { name: u.name, problem });
    const restr = u.system.restrictions.filter(r => r.applied).reduce((t, r) => t + r.tp, 0);
    if ( !u.system.granted && ((u.system.tpCost - restr) < Math.ceil(u.system.tpCost / 2)) ) {
      add("warning", "abilities", "DBU.Val.UAHalf", { name: u.name });
    }
  }
  duplicates(uas).forEach(name => add("error", "abilities", "DBU.Val.Duplicate", { name }));
  sys.progression.tpSpent = tpSpent;
  sys.progression.tpLeft = prog.tpTotal - tpSpent;
  if ( tpSpent > prog.tpTotal ) add("error", "progression", "DBU.Val.TPOver", { spent: tpSpent, max: prog.tpTotal });
  else if ( tpSpent < prog.tpTotal ) add("info", "progression", "DBU.Val.TPLeft", { n: prog.tpTotal - tpSpent });

  /* ----- Transformations ----- */
  const trans = byType("transformation");
  const raceName = (race?.name ?? "").toLowerCase();
  const activeForms = sys.transformation.forms;
  const activeEnh = sys.transformation.enhancements;
  if ( activeForms.length > 1 ) add("error", "transformations", "DBU.Val.TwoForms", { names: activeForms.map(t => t.name).join(", ") });
  if ( activeEnh.length > 1 ) add("error", "transformations", "DBU.Val.TwoEnhancements", { names: activeEnh.map(t => t.name).join(", ") });
  for ( const t of trans ) {
    const s = t.system;
    if ( raceName && !raceMatches(s.race, sys.races?.length ? sys.races : race) ) {
      add("warning", "transformations", "DBU.Val.TransRace", { name: t.name, race: s.race });
    }
    if ( (s.transType !== "awakening") && s.active && (s.topReq > sys.top.current) && !s.prelude && !actor.isBoss ) {
      add("error", "transformations", "DBU.Val.TransTop", { name: t.name, req: s.topReq, top: sys.top.current });
    }
    if ( s.prelude && s.active && ((s.topReq - 1) > sys.top.current) && !actor.isBoss ) {
      add("error", "transformations", "DBU.Val.TransTop", { name: t.name, req: s.topReq - 1, top: sys.top.current });
    }
    if ( (s.transType === "awakening") && (s.stacks > s.maxStacks) ) {
      add("error", "transformations", "DBU.Val.AwakeningStacks", { name: t.name, max: s.maxStacks });
    }
    if ( (s.transType === "form") && (s.stage > 1) && s.line ) {
      const lower = trans.filter(o => (o.system.line === s.line) && (o.system.stage < s.stage) && (o.system.stage > 0));
      const stages = new Set(lower.map(o => o.system.stage));
      for ( let st = 1; st < s.stage; st++ ) {
        if ( !stages.has(st) ) { add("warning", "transformations", "DBU.Val.TransStage", { name: t.name, stage: st, line: s.line }); break; }
      }
    }
    if ( (s.subtype === "special") && s.initialEnhancement ) {
      const initialItem = trans.find(o => o.name.toLowerCase() === s.initialEnhancement.toLowerCase());
      if ( !initialItem?.system.isMastered ) add("warning", "transformations", "DBU.Val.SpecialEnh", { name: t.name, initial: s.initialEnhancement });
    }
  }
  const awak = trans.filter(t => (t.system.transType === "awakening") && !t.system.temporary
    && !(R.limitBreaking && t.system.ignoreLimit));
  // A Fusion has its own Awakening Limit
  const limitTable = isFusion ? FUSION_AWAKENING_LIMITS : DBU.AWAKENING_LIMITS;
  const limits = limitTable[bT] ?? limitTable[7];
  const lesser = awak.filter(t => t.system.subtype === "lesser").length;
  const greater = awak.filter(t => t.system.subtype === "greater").length;
  const superA = awak.filter(t => t.system.subtype === "super").length;
  if ( R.awakeningPoints && (prog.awakeningPoints !== null) ) {
    const spent = lesser + (2 * greater);
    if ( !noLimit && (spent > prog.awakeningPoints) ) add("error", "transformations", "DBU.Val.AwakPoints", { spent, max: prog.awakeningPoints });
  }
  else if ( !noLimit ) {
    if ( lesser > limits.lesser ) add("error", "transformations", "DBU.Val.AwakLesser", { n: lesser, max: limits.lesser, top: bT });
    if ( greater > limits.greater ) add("error", "transformations", "DBU.Val.AwakGreater", { n: greater, max: limits.greater, top: bT });
  }
  if ( superA > 1 ) add("error", "transformations", "DBU.Val.AwakSuper");

  /* ----- Characteristics (Optional Rule) ----- */
  if ( R.characteristics ) {
    const traits = byType("racialTrait");
    const benefits = traits.filter(t => t.system.tier === "benefit").length;
    const drawbacks = traits.filter(t => t.system.tier === "drawback").length;
    if ( benefits > 3 ) add("error", "traits", "DBU.Val.Benefits3", { n: benefits });
    if ( drawbacks < benefits ) add("warning", "traits", "DBU.Val.Drawbacks", { b: benefits, d: drawbacks });
  }
  // Variants of the same Transformation cannot be used together
  const variants = {};
  for ( const t of sys.transformation.active ) {
    const base = t.system.aspects.find(a => a.key === "variant")?.param;
    if ( !base ) continue;
    (variants[base.toLowerCase()] ??= []).push(t.name);
  }
  for ( const t of sys.transformation.active ) {
    const list = variants[t.name.toLowerCase()];
    if ( list?.length ) add("error", "transformations", "DBU.Val.Variant", { names: [t.name, ...list].join(", ") });
  }
  duplicates(trans).forEach(name => add("warning", "transformations", "DBU.Val.Duplicate", { name }));
  if ( sys.top.current > (bT + 2) ) add("error", "combat", "DBU.Val.TopLimit", { top: sys.top.current, base: bT });

  /* ----- Equipment ----- */
  const apparel = sys.apparel.equipped.filter(a => !a.system.integrated && !a.system.natural);
  if ( apparel.length > 3 ) add("error", "equipment", "DBU.Val.ApparelLayers");
  const layers = {};
  for ( const a of apparel ) (layers[a.system.layer] ??= []).push(a.name);
  for ( const [layer, names] of Object.entries(layers) ) {
    if ( names.length > 1 ) add("error", "equipment", "DBU.Val.ApparelSameLayer", { layer, names: names.join(", ") });
  }
  for ( const a of apparel.filter(x => x.system.category === "armor") ) {
    if ( a.system.layer !== "top" ) add("error", "equipment", "DBU.Val.ArmorTop", { name: a.name });
  }
  const natural = sys.apparel.equipped.some(a => a.system.natural);
  if ( natural && (apparel.length > 1) ) add("error", "equipment", "DBU.Val.NaturalArmor");
  const categories = {};
  for ( const a of sys.apparel.equipped ) {
    if ( a.system.integrated ) continue;
    categories[a.system.category] = (categories[a.system.category] ?? 0) + 1;
  }
  for ( const [cat, n] of Object.entries(categories) ) {
    if ( (n > 1) && (cat !== "weights") ) add("warning", "equipment", "DBU.Val.ApparelDoubleDip", { cat: game.i18n.localize(DBU.apparelCategories[cat]) });
  }
  const maxWeapons = sys.maxWeapons ?? 2;
  const wielded = sys.weapons.wielded.filter(w => !w.system.integrated);
  if ( wielded.length > maxWeapons ) add("error", "equipment", "DBU.Val.Weapons", { max: maxWeapons });
  for ( const w of byType("weapon") ) {
    const cat = DBU.weaponCategories[w.system.category];
    if ( cat && (cat.type !== w.system.weaponType) ) add("error", "equipment", "DBU.Val.WeaponCategory", { name: w.name });
    const used = w.system.qualities.reduce((t, q) => t + (q.slots ?? 1), 0);
    const slots = DBU.craftsmanship[w.system.craftsmanship]?.slots ?? 0;
    if ( used > slots ) add("error", "equipment", "DBU.Val.QualitySlots", { name: w.name, used, slots });
  }
  for ( const a of byType("apparel") ) {
    const used = a.system.qualities.reduce((t, q) => t + (q.slots ?? 1), 0);
    const slots = DBU.craftsmanship[a.system.craftsmanship]?.slots ?? 0;
    if ( used > slots ) add("error", "equipment", "DBU.Val.QualitySlots", { name: a.name, used, slots });
  }

  /* ----- Resources and status ----- */
  if ( sys.life.value > sys.life.max ) add("warning", "status", "DBU.Val.LifeOver", { v: sys.life.value, max: sys.life.max });
  if ( sys.ki.value > sys.ki.max ) add("warning", "status", "DBU.Val.KiOver", { v: sys.ki.value, max: sys.ki.max });
  if ( sys.capacity.value > sys.capacity.max ) add("warning", "status", "DBU.Val.CapacityOver", { v: sys.capacity.value, max: sys.capacity.max });
  // A Fusion may use the Karma Points of all of its Fused Characters
  if ( (sys.karma.value > 4) && !isFusion ) add("error", "status", "DBU.Val.Karma");
  if ( (sys.combat.power ?? 0) > 2 ) add("warning", "combat", "DBU.Val.Power");
  for ( const r of sys.resources ?? [] ) {
    if ( !r.split ) continue;
    for ( const k of DBU.splitRolls ) {
      if ( r.alloc[k] > (r.caps?.[k] ?? Infinity) ) {
        add("warning", "combat", "DBU.Val.SplitOver", { name: r.name, roll: game.i18n.localize(`DBU.Split.${k}`), n: r.alloc[k], cap: r.caps[k] });
      }
    }
    // Only a resource that always goes to one Combat Roll (Divine Battle Born) is checked; Oozaru only forces new stacks
    if ( r.force && DBU.splitRolls.some(k => (k !== r.force) && (r.alloc[k] > 0)) ) {
      add("warning", "combat", "DBU.Val.SplitForced", { name: r.name, roll: game.i18n.localize(`DBU.Split.${r.force}`) });
    }
  }
  if ( (sys.combat.superStacks ?? 0) > 3 ) add("error", "combat", "DBU.Val.SuperStacks");
  if ( (sys.combat.counters ?? 0) > 6 ) add("error", "combat", "DBU.Val.Counters");
  if ( (sys.combat.holdingBack ?? 0) > bT ) add("error", "combat", "DBU.Val.HoldingBack", { max: bT });
  if ( (sys.combat.energyCharges ?? 0) > 10 ) add("error", "combat", "DBU.Val.Charges");

  return out;
}

/* -------------------------------------------- */

function duplicates(items) {
  const seen = new Map();
  for ( const i of items ) {
    const k = i.name.trim().toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return items.filter((i, idx) => (seen.get(i.name.trim().toLowerCase()) > 1)
    && (items.findIndex(o => o.name.trim().toLowerCase() === i.name.trim().toLowerCase()) === idx)).map(i => i.name);
}

/**
 * Character Combination checks of a Fusion (dbu-rpg.com/fusion): Fused Characters, Racial Traits,
 * Fusion Modifiers. Reads only the Fusion's own data (the Fused Characters may not be prepared yet).
 */
function validateFusion(sys, actor, add) {
  const fs = sys.fusion;
  const method = FUSION_METHODS[fs.method];
  const comps = fs.components ?? [];
  if ( comps.length < (method?.min ?? 2) ) add("warning", "fusion", "DBU.Fusion.ErrFew", { n: method?.min ?? 2, method: method?.label ?? "" });
  if ( comps.length > (method?.max ?? 2) ) add("error", "fusion", "DBU.Fusion.ErrMany", { n: method?.max ?? 2, method: method?.label ?? "" });
  // While the world loads, the Fused Characters may not exist yet
  for ( const uuid of (game.ready ? comps : []) ) {
    const c = fromUuidSync(uuid);
    if ( !c ) add("error", "fusion", "DBU.Fusion.ErrMissing", { uuid });
    else if ( c.type === "fusion" ) add("error", "fusion", "DBU.Fusion.ErrFusionLimit", { name: c.name });
  }
  if ( !fs.syncedAt && comps.length ) add("warning", "fusion", "DBU.Fusion.NotSynced");
  // At most 7 Racial Traits: 2~4 Primary, the rest Secondary or Subrace (Method Traits and Modifiers do not count)
  const traits = actor.items.filter(i => (i.type === "racialTrait") && ["primary", "secondary", "subrace", "factor"].includes(i.system.tier));
  const primaries = traits.filter(t => t.system.tier === "primary").length;
  if ( traits.length > FUSION_TRAIT_LIMITS.total ) add("error", "fusion", "DBU.Fusion.ErrTraits", { n: traits.length, max: FUSION_TRAIT_LIMITS.total });
  if ( traits.length && ((primaries < FUSION_TRAIT_LIMITS.primaryMin) || (primaries > FUSION_TRAIT_LIMITS.primaryMax)) ) {
    add("error", "fusion", "DBU.Fusion.ErrPrimaries", { n: primaries });
  }
  // Fusion Modifiers: 2 for a Temporary Fusion, 1 for a Lasting one, none for a Plump or Frail one
  const mods = actor.items.filter(i => String(i.flags?.["dbu-rpg"]?.fusion?.generated ?? "").startsWith("modifier:")).length;
  const limit = (fs.dance !== "success") ? 0 : (method?.type === "temporary" ? 2 : 1);
  if ( mods > limit ) add("error", "fusion", "DBU.Fusion.ErrModifiers", { n: mods, max: limit });
}

/** Does a Racial Requirement text ("Saiyan", "Any", "Earthling, Saiyan") include this race (or one of these races)? */
export function raceMatches(requirement, race) {
  const req = String(requirement ?? "").trim().toLowerCase();
  if ( !req || ["any", "n/a", "same as the 1st stage of this transformation line"].includes(req) ) return true;
  if ( req.startsWith("same as") || req.startsWith("any ") ) return true;
  // A Fusion has several Races: any of them will do
  if ( Array.isArray(race) ) return !race.length || race.some(r => raceMatches(requirement, r));
  if ( !race ) return true;
  // "Bio-Android" and "Bio Androids", "Neo-Tuffle" and "Neo-Tuffles" are the same race
  const simplify = s => s.toLowerCase().replace(/[-\s]+/g, " ").trim().replace(/s$/, "");
  const name = simplify(race.name);
  const parts = req.split(/,|\bor\b|\/|\band\b/).map(p => simplify(p)).filter(Boolean);
  return parts.some(p => name.includes(p) || p.includes(name));
}

/** An Elemental Profile is a Favored Element if a weapon/trait names it. */
function isFavoredElement(profile, actor) {
  if ( !String(profile).startsWith("elemental") ) return false;
  const label = (DBU.profiles[profile]?.label ?? "").toLowerCase();
  return actor.items.some(i => (i.type === "weapon") && i.system.isActive
    && (i.system.category === "elementalTool") && label.includes(String(i.system.favoredElement).toLowerCase()) && i.system.favoredElement);
}

/**
 * Check structured prerequisites of a Talent or Unique Ability.
 * Returns a list of human readable unmet requirements.
 */
export function checkPrerequisites(item, sys, actor) {
  const problems = [];
  const p = item.system.prereq;
  if ( !p ) return problems;
  const score = a => sys.attributes[a]?.score ?? 0;
  for ( const s of p.scores ?? [] ) {
    if ( !s.attrs?.length || !s.min ) continue;
    const ok = s.attrs.some(a => score(a) >= s.min);
    if ( !ok ) {
      const names = s.attrs.map(a => DBU.attributeAbbr[a] ?? a).join("/");
      problems.push(game.i18n.format("DBU.Val.ReqScore", { attrs: names, min: s.min }));
    }
  }
  const owned = new Set(actor.items.map(i => i.name.trim().toLowerCase()));
  for ( const t of p.talents ?? [] ) {
    if ( t && !owned.has(t.trim().toLowerCase()) ) problems.push(game.i18n.format("DBU.Val.ReqTalent", { name: t }));
  }
  if ( p.anyTalents?.length && !p.anyTalents.some(t => owned.has(t.trim().toLowerCase())) ) {
    problems.push(game.i18n.format("DBU.Val.ReqAnyTalent", { names: p.anyTalents.join(" / ") }));
  }
  if ( p.top && (sys.top.base < p.top) ) problems.push(game.i18n.format("DBU.Val.ReqTop", { top: p.top }));
  for ( const s of p.skills ?? [] ) {
    const sk = sys.skills[s.key];
    if ( sk && (sk.totalRanks < s.ranks) ) problems.push(game.i18n.format("DBU.Val.ReqSkill", { skill: sk.label, ranks: s.ranks }));
  }
  if ( p.race && sys.race && !raceMatches(p.race, sys.races?.length ? sys.races : sys.race) ) {
    problems.push(game.i18n.format("DBU.Val.ReqRace", { race: p.race }));
  }
  return problems;
}

/**
 * Check the racial Attribute Score Increases against the race's allowed options.
 * allowed.plus2 / allowed.plus1 use ";" between slots and "|" between alternatives, "*" = any.
 */
function validateRaceIncreases(race, add) {
  const inc = race.system.increases;
  const values = DBU.ATTRIBUTES.map(a => inc[a] ?? 0);
  const total = values.reduce((t, v) => t + v, 0);
  const plus2 = String(race.system.allowed?.plus2 ?? "").split(";").map(s => s.trim()).filter(Boolean);
  const plus1 = String(race.system.allowed?.plus1 ?? "").split(";").map(s => s.trim()).filter(Boolean);
  const expected = (plus2.length * 2) + plus1.length;
  if ( !expected ) return;
  if ( total !== expected ) {
    add("error", "race", "DBU.Val.RaceIncreaseTotal", { total, expected });
    return;
  }
  // Every slot needs a distinct attribute with the matching amount
  const slots = [...plus2.map(s => ({ amount: 2, options: s })), ...plus1.map(s => ({ amount: 1, options: s }))];
  const assigned = {};
  for ( const a of DBU.ATTRIBUTES ) if ( inc[a] ) assigned[a] = inc[a];
  const fits = (slot, a) => (slot.options === "*") || slot.options.split("|").map(o => o.trim()).includes(a);
  const attrs = Object.keys(assigned);
  const used = new Set();
  const solve = idx => {
    if ( idx >= slots.length ) return true;
    const slot = slots[idx];
    for ( const a of attrs ) {
      if ( used.has(a) || (assigned[a] !== slot.amount) || !fits(slot, a) ) continue;
      used.add(a);
      if ( solve(idx + 1) ) return true;
      used.delete(a);
    }
    return false;
  };
  if ( !solve(0) || (used.size !== attrs.length) ) {
    add("error", "race", "DBU.Val.RaceIncreaseInvalid", { rule: race.system.increaseRule || "" });
  }
  if ( race.system.increaseRule?.includes("!fo+ma") && inc.fo && inc.ma ) add("error", "race", "DBU.Val.RaceFoMa");
}
