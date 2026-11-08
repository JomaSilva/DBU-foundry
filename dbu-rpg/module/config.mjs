/**
 * Rule constants for the Dragon Ball Universe RPG (rules 0.9.3, dbu-rpg.com).
 * Every table here mirrors docs/REGRAS.md; keep both in sync.
 */
import * as VOCAB from "./vocab/index.mjs";

export const DBU = {};

DBU.ATTRIBUTES = ["ag", "fo", "te", "sc", "in", "ma", "pe"];

DBU.attributes = {
  ag: "DBU.Attr.ag",
  fo: "DBU.Attr.fo",
  te: "DBU.Attr.te",
  sc: "DBU.Attr.sc",
  in: "DBU.Attr.in",
  ma: "DBU.Attr.ma",
  pe: "DBU.Attr.pe"
};

DBU.attributeAbbr = {
  ag: "AG", fo: "FO", te: "TE", sc: "SC", in: "IN", ma: "MA", pe: "PE"
};

/** Saving Throws use the Attribute *Score*. */
DBU.saves = {
  impulsive: { attr: "ag", label: "DBU.Save.impulsive" },
  corporeal: { attr: "te", label: "DBU.Save.corporeal" },
  cognitive: { attr: "in", label: "DBU.Save.cognitive" },
  morale: { attr: "pe", label: "DBU.Save.morale" }
};

/**
 * Skills. Encompassing Skills are split into one entry per Specialty, each with its own rank cap.
 * required = (R): automatic failure without at least 1 rank.
 */
DBU.skills = {
  acrobatics: { attr: "ag", label: "DBU.Skill.acrobatics", maneuver: "Flip" },
  flight: { attr: "ag", label: "DBU.Skill.flight", required: true, maneuver: "Soar" },
  thievery: { attr: "ag", label: "DBU.Skill.thievery", maneuver: "Snatch / Hijack" },
  stealth: { attr: "ag", label: "DBU.Skill.stealth", maneuver: "Hide" },
  craftBasic: { attr: "sc", label: "DBU.Skill.craftBasic", required: true, group: "craft", maneuver: "Repair" },
  craftApparel: { attr: "sc", label: "DBU.Skill.craftApparel", required: true, group: "craft", maneuver: "Repair" },
  craftWeapons: { attr: "sc", label: "DBU.Skill.craftWeapons", required: true, group: "craft", maneuver: "Repair" },
  craftVehicles: { attr: "sc", label: "DBU.Skill.craftVehicles", required: true, group: "craft", maneuver: "Repair" },
  knowledgeScience: { attr: "sc", label: "DBU.Skill.knowledgeScience", group: "knowledge" },
  knowledgeProfession: { attr: "sc", label: "DBU.Skill.knowledgeProfession", group: "knowledge" },
  knowledgeHistory: { attr: "sc", label: "DBU.Skill.knowledgeHistory", group: "knowledge" },
  knowledgeOther: { attr: "sc", label: "DBU.Skill.knowledgeOther", group: "knowledge", custom: true },
  investigation: { attr: "sc", label: "DBU.Skill.investigation", maneuver: "Analysis" },
  medicine: { attr: "sc", label: "DBU.Skill.medicine", required: true, maneuver: "Treatment" },
  clairvoyance: { attr: "in", label: "DBU.Skill.clairvoyance", required: true, maneuver: "Sense" },
  concealment: { attr: "in", label: "DBU.Skill.concealment", required: true, maneuver: "Holding Back" },
  creatureHandling: { attr: "in", label: "DBU.Skill.creatureHandling" },
  intuition: { attr: "in", label: "DBU.Skill.intuition", maneuver: "Intuit" },
  perception: { attr: "in", label: "DBU.Skill.perception", maneuver: "Search" },
  pilot: { attr: "in", label: "DBU.Skill.pilot", required: true, maneuver: "Eject" },
  survival: { attr: "in", label: "DBU.Skill.survival", maneuver: "Brace" },
  useMagic: { attr: "ma", label: "DBU.Skill.useMagic", required: true, maneuver: "Magic Trick" },
  bluff: { attr: "pe", label: "DBU.Skill.bluff", maneuver: "Feint" },
  cooking: { attr: "pe", label: "DBU.Skill.cooking" },
  intimidation: { attr: "pe", label: "DBU.Skill.intimidation", maneuver: "Terrify" },
  persuasion: { attr: "pe", label: "DBU.Skill.persuasion", maneuver: "Talk" },
  performance: { attr: "pe", label: "DBU.Skill.performance", maneuver: "Hype" }
};

/** Skill Check Difficulty Categories (Target Numbers). */
DBU.difficulties = {
  novice: { tn: 6, label: "DBU.Difficulty.novice" },
  apprentice: { tn: 10, label: "DBU.Difficulty.apprentice" },
  qualified: { tn: 14, label: "DBU.Difficulty.qualified" },
  expert: { tn: 18, label: "DBU.Difficulty.expert" },
  master: { tn: 22, label: "DBU.Difficulty.master" },
  grandmaster: { tn: 26, label: "DBU.Difficulty.grandmaster" }
};

/**
 * Size Categories. dv/soak are multiplied by the current ToP; speed is flat.
 * reach = extra squares added to "Adjacent".
 */
DBU.sizes = {
  nano: { index: 0, label: "DBU.Size.nano", reach: 0, speed: -6, dv: 3, soak: -3, squares: 1 },
  tiny: { index: 1, label: "DBU.Size.tiny", reach: 0, speed: -3, dv: 2, soak: -2, squares: 1 },
  small: { index: 2, label: "DBU.Size.small", reach: 0, speed: 0, dv: 1, soak: -1, squares: 1 },
  medium: { index: 3, label: "DBU.Size.medium", reach: 0, speed: 0, dv: 0, soak: 0, squares: 1 },
  large: { index: 4, label: "DBU.Size.large", reach: 0, speed: 0, dv: -1, soak: 1, squares: 1 },
  enormous: { index: 5, label: "DBU.Size.enormous", reach: 1, speed: 3, dv: -2, soak: 2, squares: 2 },
  gigantic: { index: 6, label: "DBU.Size.gigantic", reach: 3, speed: 6, dv: -3, soak: 3, squares: 4 },
  colossal: { index: 7, label: "DBU.Size.colossal", reach: 6, speed: 10, dv: -5, soak: 5, squares: 7 }
};
DBU.SIZE_ORDER = ["nano", "tiny", "small", "medium", "large", "enormous", "gigantic", "colossal"];
/** Sizes a player may pick at Character Creation. */
DBU.CREATION_SIZES = ["small", "medium", "large"];

/** Power Level table: what each PL grants. */
DBU.PL_TABLE = {
  1: { perk: 1, talent: 4, attribute: 5, skill: 1 },
  2: { perk: 1 }, 3: { attribute: 1 }, 4: { perk: 1 },
  5: { talent: 1, attribute: 1, skill: 1 }, 6: { perk: 1 }, 7: { attribute: 1 }, 8: { perk: 1 }, 9: { talent: 1 },
  10: { talent: 1, attribute: 1, skill: 1 }, 11: { perk: 1 }, 12: { attribute: 1 }, 13: { perk: 1 }, 14: { talent: 1 },
  15: { talent: 1, attribute: 1, skill: 1 }, 16: { perk: 1 }, 17: { attribute: 1 }, 18: { perk: 1 }, 19: { talent: 1 },
  20: { talent: 1, attribute: 1, skill: 1 }, 21: { perk: 1 }, 22: { attribute: 1 }, 23: { perk: 1 }, 24: { talent: 1 },
  25: { talent: 1, attribute: 1, skill: 1 }, 26: { perk: 1 }, 27: { attribute: 1 }, 28: { perk: 1 }, 29: { talent: 1 },
  30: { perk: 5 }
};

/** Diminishing Defense stacks gained per Attacking Maneuver, by base ToP. */
DBU.DIM_DEFENSE = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4 };

/** Awakening limits by base ToP. */
DBU.AWAKENING_LIMITS = {
  1: { lesser: 2, greater: 1 }, 2: { lesser: 3, greater: 1 }, 3: { lesser: 4, greater: 2 },
  4: { lesser: 5, greater: 2 }, 5: { lesser: 6, greater: 3 }, 6: { lesser: 7, greater: 3 }, 7: { lesser: 7, greater: 4 }
};

/** Maximum TP that can be spent on one Signature Technique, by base ToP. */
DBU.SIGNATURE_TP_CAP = { 1: 25, 2: 30, 3: 40, 4: 50, 5: 50, 6: 50, 7: 50 };

DBU.foundations = {
  physical: "DBU.Foundation.physical",
  energy: "DBU.Foundation.energy",
  magic: "DBU.Foundation.magic"
};

DBU.damageCategories = {
  1: "DBU.DamageCat.standard",
  2: "DBU.DamageCat.direct",
  3: "DBU.DamageCat.lethal"
};

/**
 * Attack Profiles. kp = KP cost multiplier of (T). cat = base Damage Category.
 * foundations: which Foundations the Profile belongs to (Multi-Foundation lists all).
 * Automated behaviour keys are read by the attack workflow.
 */
DBU.profiles = {
  simple: { label: "Simple", foundations: ["physical", "energy", "magic"], cat: 1, kp: 0, sigStart: 4 },
  combination: { label: "Combination", foundations: ["physical", "energy", "magic"], cat: 1, kp: 3, extraStrikes: 3 },
  launching: { label: "Launching", foundations: ["physical", "energy", "magic"], cat: 1, kp: 3, freeAdvantages: ["knockback"] },
  megaFlare: { label: "Mega Flare", foundations: ["physical", "energy", "magic"], cat: 1, kp: 4, maxCharges: 10, chargeWound: 1 },
  blitz: { label: "Blitz", foundations: ["physical"], cat: 1, kp: 4, freeAdvantages: ["chargingAssault"], sigKpReduction: 2 },
  crushing: { label: "Crushing", foundations: ["physical"], cat: 3, kp: 6, halfHaste: true },
  pinpoint: { label: "Pinpoint", foundations: ["physical"], cat: 1, kp: 4, ignoreSoakInsight: true },
  powered: { label: "Powered", foundations: ["physical"], cat: 1, kp: 8, extraDamageAttribute: 1, freeCharges: 1 },
  soaring: { label: "Soaring", foundations: ["physical"], cat: 2, kp: 5, aoe: "line" },
  sweeping: { label: "Sweeping", foundations: ["physical"], cat: 1, kp: 4, aoe: "sphere0" },
  beam: { label: "Beam", foundations: ["energy"], cat: 2, kp: 8, bonusCharges: 1 },
  blast: { label: "Blast", foundations: ["energy"], cat: 2, kp: 5, aoe: "cone" },
  clearing: { label: "Clearing", foundations: ["energy"], cat: 1, kp: 6, aoe: "sphere", minNatural: 5 },
  concentrated: { label: "Concentrated", foundations: ["energy"], cat: 3, kp: 10, aoe: "line", ignoreHalfDR: true },
  cutting: { label: "Cutting", foundations: ["energy"], cat: 2, kp: 6, cutting: true },
  wave: { label: "Wave", foundations: ["energy"], cat: 2, kp: 6, aoe: "line" },
  elementalDark: { label: "Elemental (Dark)", foundations: ["magic"], cat: 1, kp: 2, elemental: true },
  elementalEarth: { label: "Elemental (Earth)", foundations: ["magic"], cat: 2, kp: 4, elemental: true },
  elementalFire: { label: "Elemental (Fire)", foundations: ["magic"], cat: 2, kp: 8, elemental: true },
  elementalIce: { label: "Elemental (Ice)", foundations: ["magic"], cat: 2, kp: 8, elemental: true },
  elementalLight: { label: "Elemental (Light)", foundations: ["magic"], cat: 1, kp: 2, elemental: true, freeAdvantages: ["fullWager"] },
  elementalLightning: { label: "Elemental (Lightning)", foundations: ["magic"], cat: 2, kp: 8, elemental: true },
  elementalMetal: { label: "Elemental (Metal)", foundations: ["magic"], cat: 3, kp: 8, elemental: true },
  elementalPlantlife: { label: "Elemental (Plantlife)", foundations: ["magic"], cat: 1, kp: 3, elemental: true, freeAdvantages: ["staggeringAttack"] },
  elementalPoison: { label: "Elemental (Poison)", foundations: ["magic"], cat: 2, kp: 8, elemental: true },
  elementalWater: { label: "Elemental (Water)", foundations: ["magic"], cat: 2, kp: 8, elemental: true },
  elementalWind: { label: "Elemental (Wind)", foundations: ["magic"], cat: 2, kp: 4, elemental: true },
  // Profiles some Transformations and Races give access to (PROFILE_ACCESS in module/rules/profiles.mjs)
  barrierBlow: { label: "Barrier Blow", foundations: ["physical", "energy", "magic"], cat: 1, kp: 4, barrierBlow: true },
  gravityCage: { label: "Gravity Cage", foundations: ["physical", "energy", "magic"], cat: 2, kp: 8, gravityCage: true },
  glass: { label: "Glass", foundations: ["physical", "energy", "magic"], cat: 1, kp: 2, glass: true },
  time: { label: "Time", foundations: ["physical", "energy", "magic"], cat: 1, kp: 10, time: true },
  destruction: { label: "Destruction", foundations: ["physical", "energy", "magic"], cat: 3, kp: 10, destruction: true, freeCharges: 1 }
};

/** Super Profiles: kp is added to the Profile cost (and to its minimum). */
DBU.superProfiles = {
  allOut: { label: "All Out", kp: 2, requirement: "DBU.SuperProfileReq.allOut" },
  cataclysmic: { label: "Cataclysmic Attack", kp: 4, requirement: "DBU.SuperProfileReq.aoe" },
  combo: { label: "Combo Attack", kp: 2, requirement: "DBU.SuperProfileReq.noAoe", strike: 2 },
  annihilation: { label: "Complete Annihilation", kp: 2, requirement: "DBU.SuperProfileReq.charges3", extraDamageAttribute: 1 },
  genki: { label: "Genki", kp: 0, requirement: "Energy Gathering" },
  gigaFlare: { label: "Giga Flare", kp: 2, requirement: "Mega Flare" },
  karmic: { label: "Karmic", kp: 2, requirement: "DBU.SuperProfileReq.karmic" },
  multiProfile: { label: "Multi-Profile", kp: 0, requirement: "—" },
  superBeam: { label: "Super Beam", kp: 2, requirement: "Beam", chargeCategory: 1 },
  superCombination: { label: "Super Combination", kp: 2, requirement: "Combination" },
  superLaunch: { label: "Super Launch", kp: 2, requirement: "Launching" },
  weatherMaximizer: { label: "Weather Maximizer", kp: 4, requirement: "Weather Calling" }
};

/**
 * Combat Conditions. max = Max Stacks (1 means no stacks).
 * Effects that change numbers are handled in the actor data preparation (see module/rules/derived.mjs).
 */
DBU.conditions = {
  blinded: { max: 1, img: "icons/svg/blind.svg" },
  broken: { max: 3, img: "icons/svg/bones.svg" },
  compelled: { max: 1, img: "icons/svg/target.svg" },
  drained: { max: 1, img: "icons/svg/degen.svg" },
  fatigued: { max: 2, img: "icons/svg/down.svg" },
  guardDown: { max: 1, img: "icons/svg/downgrade.svg" },
  impaired: { max: 3, img: "icons/svg/hazard.svg" },
  impediment: { max: 1, img: "icons/svg/daze.svg" },
  pinned: { max: 1, img: "icons/svg/net.svg" },
  poisoned: { max: 1, img: "icons/svg/poison.svg" },
  prone: { max: 1, img: "icons/svg/falling.svg" },
  shaken: { max: 1, img: "icons/svg/terror.svg" },
  sleeping: { max: 1, img: "icons/svg/sleep.svg" },
  slowed: { max: 3, img: "icons/svg/anchor.svg" },
  staggered: { max: 1, img: "icons/svg/paralysis.svg" },
  stressExhaustion: { max: 1, img: "icons/svg/unconscious.svg" },
  suffocating: { max: 1, img: "icons/svg/silenced.svg" },
  transfigured: { max: 1, img: "icons/svg/statue.svg" },
  // T (round 14): the Combat Condition the Demon God Transformations inflict (−1(bT) Combat Rolls and Soak); shown on the
  // sheet only when an item names it or it is on
  branded: { max: 1, img: "icons/svg/skull.svg", origin: "transformation" }
};

/** States (and Special States). levels = number of Levels (1 = no levels). */
DBU.states = {
  raging: { levels: 3, img: "icons/svg/fire.svg" },
  mindful: { levels: 3, img: "icons/svg/aura.svg" },
  superior: { levels: 1, img: "icons/svg/upgrade.svg" },
  undying: { levels: 1, img: "icons/svg/regen.svg" },
  surging: { levels: 1, img: "icons/svg/lightning.svg" },
  determined: { levels: 1, img: "icons/svg/sword.svg" },
  entrusted: { levels: 1, img: "icons/svg/angel.svg", special: true },
  godKi: { levels: 1, img: "icons/svg/sun.svg", special: true },
  deadState: { levels: 1, img: "icons/svg/holy-shield.svg", special: true },
  liquid: { levels: 1, img: "icons/svg/acid.svg", special: true },
  multipleArms: { levels: 1, img: "icons/svg/clockwork.svg", special: true },
  invisible: { levels: 1, img: "icons/svg/invisible.svg", special: true },
  spectator: { levels: 1, img: "icons/svg/eye.svg", special: true },
  drunk: { levels: 2, img: "icons/svg/tankard.svg", special: true },
  feral: { levels: 2, img: "icons/svg/pawprint.svg", special: true },
  fusionOfKi: { levels: 1, img: "icons/svg/portal.svg", special: true },
  // G: States named by Transformations and Racial Traits (their pages say what they do; the Traits that read
  // @states.<key> do it). The sheet shows them only when an item of the character names them or they are on.
  radiantGod: { levels: 1, img: "icons/svg/sun.svg", origin: "transformation" },
  blazingGod: { levels: 1, img: "icons/svg/fire.svg", origin: "transformation" },
  flow: { levels: 1, img: "icons/svg/wing.svg", origin: "transformation" },
  unitedPower: { levels: 1, img: "icons/svg/circle.svg", origin: "transformation" },
  berserk: { levels: 1, img: "icons/svg/blood.svg", origin: "transformation" },
  unleashed: { levels: 1, img: "icons/svg/explosion.svg", origin: "transformation" },
  unlimited: { levels: 1, img: "icons/svg/upgrade.svg", origin: "transformation" },
  exceed: { levels: 1, img: "icons/svg/lightning.svg", origin: "transformation" },
  overwhelmingFocus: { levels: 1, img: "icons/svg/target.svg", origin: "transformation" },
  combatRealization: { levels: 1, img: "icons/svg/light.svg", origin: "transformation" },
  desperateHero: { levels: 1, img: "icons/svg/shield.svg", origin: "transformation" },
  heroicMindset: { levels: 1, img: "icons/svg/angel.svg", origin: "transformation" },
  powerStressed: { levels: 1, img: "icons/svg/daze.svg", origin: "transformation" },
  exposed: { levels: 1, img: "icons/svg/eye.svg", origin: "transformation" },
  incorporeal: { levels: 1, img: "icons/svg/mystery-man.svg", origin: "transformation" },
  egotistical: { levels: 2, img: "icons/svg/ice-aura.svg", origin: "transformation" },
  instinctual: { levels: 2, img: "icons/svg/pawprint.svg", origin: "transformation" },
  clockUp: { levels: 1, img: "icons/svg/clockwork.svg", origin: "transformation" },
  fullPower: { levels: 1, img: "icons/svg/aura.svg", origin: "transformation" },
  soulSynergy: { levels: 1, img: "icons/svg/heal.svg", origin: "transformation" },
  hollowfied: { levels: 1, img: "icons/svg/skull.svg", origin: "transformation" },
  clad: { levels: 1, img: "icons/svg/statue.svg", origin: "transformation" },
  farewell: { levels: 1, img: "icons/svg/door-exit.svg", origin: "transformation" }
};

/** Names of the Levels of the States with Levels (lower case, Level 1 first): "ignoreState.raging.angry.2". */
DBU.STATE_LEVEL_NAMES = {
  raging: ["angry", "furious", "apoplectic"],
  mindful: ["calm", "zen", "tranquil"],
  drunk: ["tipsy", "plastered"],
  feral: ["wild", "unhinged"]
};

/**
 * Built-in modifiers granted by States. Formulas use the DBU notation understood by
 * module/rules/formula.mjs: X(T), X(bT), @L (state level), etc.
 * n = number of the State effect it automates (as numbered on dbu-rpg.com/states and /special-states), lv = the Level
 * whose Trait it is (States with Levels): "ignoreState.<state>.<n>" or "ignoreState.<state>.<level name|lv>.<n>"
 * modifiers (value 1) suppress it.
 */
DBU.stateModifiers = {
  // F12 Incorporeal (Monster): (1) an attack whose Wound Roll is below 1/4 of your Max LP deals no Damage; (3) +2(T) to
  // your Grapple Checks as the Grappled; (4) no Attacking Maneuvers; (5) you pass through Characters and Features
  // (forced movements) and your Square counts as empty; (6) no Collision Damage
  incorporeal: [
    { target: "vs.ignoreWoundBelow", value: "ceil(@lifeMax/4)", n: 1 },
    { target: "clash.grapple", value: "2(T)", condition: "@grappled == 1", n: 3 },
    { target: "block.attack", value: "1", n: 4 },
    { target: "flag.passThrough", value: "1", n: 5 },
    { target: "collision.ignore", value: "1", n: 6 }
  ],
  // D1 Surging (1): an Energy Charge on every Attacking Maneuver that includes your Focus (the "Focus" mark) as a target
  surging: [
    { target: "attack.charges", value: "1", condition: "@vsAny.mark.focus >= 1", n: 1 }
  ],
  raging: [
    // Angry (1): +L(T) Wound; (2): +L Botch Range
    { target: "wound", value: "@L(T)", n: 1, lv: 1 },
    { target: "botch.strike", value: "@L", n: 2, lv: 1 }, { target: "botch.dodge", value: "@L", n: 2, lv: 1 },
    { target: "botch.save", value: "@L", n: 2, lv: 1 }, { target: "botch.skill", value: "@L", n: 2, lv: 1 },
    // Furious (1): +L(T) Soak
    { target: "soak", value: "@L(T)", condition: "@L >= 2", n: 1, lv: 2 },
    // Apoplectic (2): ignore Health Threshold Penalties
    { target: "flag.ignoreThresholds", value: "1", condition: "@L >= 3", n: 2, lv: 3 }
  ],
  mindful: [
    // Calm (1): −L Critical Target; (2): −L(T) Wound
    { target: "crit.strike", value: "-@L", n: 1, lv: 1 }, { target: "crit.dodge", value: "-@L", n: 1, lv: 1 },
    { target: "crit.wound", value: "-@L", n: 1, lv: 1 },
    { target: "crit.save", value: "-@L", n: 1, lv: 1 }, { target: "crit.skill", value: "-@L", n: 1, lv: 1 },
    { target: "wound", value: "-@L(T)", n: 2, lv: 1 },
    // Tranquil (1): 1 Counter Action; (2): ignore Health Threshold Penalties
    { target: "counters", value: "1", condition: "@L >= 3", n: 1, lv: 3 },
    { target: "flag.ignoreThresholds", value: "1", condition: "@L >= 3", n: 2, lv: 3 }
  ],
  superior: [
    { target: "flag.greaterDice", value: "1", n: 1 },
    { target: "damageTaken", value: "2(T)", n: 2 }
  ],
  undying: [{ target: "combat", value: "-1(T)", n: 3 }],
  determined: [{ target: "flag.ignoreThresholds", value: "1", n: 2 }, { target: "flag.autoHit", value: "1", n: 1 }],
  entrusted: [{ target: "flag.greaterDice", value: "1", n: 1 }, { target: "stress", value: "1", n: 2 },
    // EN (4) [1/Encounter]: a Basic Attack (a Signature with "entrusted4.signature") may take Full Wager and All-or-Nothing,
    // with the Capacity reset to its maximum first: one box of the attack dialog (group entrusted4)
    { target: "attack.advantage.fullWager", value: "1", condition: "(@basic == 1 || (@signature == 1 && @entrusted4Sig >= 1))", mode: "ask", group: "entrusted4", limit: "1/Encounter", n: 4 },
    { target: "attack.advantage.allOrNothing", value: "1", condition: "(@basic == 1 || (@signature == 1 && @entrusted4Sig >= 1))", mode: "ask", group: "entrusted4", n: 4 },
    { target: "attack.capacityFull", value: "1", condition: "(@basic == 1 || (@signature == 1 && @entrusted4Sig >= 1))", mode: "ask", group: "entrusted4", n: 4 }],
  godKi: [{ target: "wound", value: "3(T)", n: 3 }, { target: "soak", value: "3(T)", n: 3 }],
  deadState: [
    { target: "stress", value: "2", n: 1 }, { target: "steadfast", value: "1", n: 1 },
    { target: "combat", value: "-1(bT)", n: 4 }, { target: "soak", value: "-1(bT)", n: 4 }
  ],
  liquid: [{ target: "size", value: "-1", n: 1 }, { target: "skill.stealth", value: "2", n: 3 },
    // BB (4): your movement provokes no Exploit
    { target: "noProvoke.movement", value: "1", n: 4 }],
  // BB Multiple Arms: (2) one more Counter Action each Combat Round; (6) Diminishing Offense starts after the 4th attack
  multipleArms: [{ target: "counters", value: "1", n: 2 }, { target: "dimOffenseStart", value: "1", n: 6 }],
  drunk: [
    // Tipsy (1): −L(T) Saving Throws and Combat Rolls; (2): +L Natural Result of Strike and Dodge
    { target: "save.all", value: "-@L(T)", n: 1, lv: 1 }, { target: "combat", value: "-@L(T)", n: 1, lv: 1 },
    { target: "natural.strike", value: "@L", n: 2, lv: 1 }, { target: "natural.dodge", value: "@L", n: 2, lv: 1 }
  ],
  feral: [
    // Wild (2): −L(T) Ki Point Cost; (3): +L Natural Result of Strike, Wound, Intimidation and Survival
    { target: "kpCost.attack", value: "-@L(T)", n: 2, lv: 1 },
    { target: "natural.strike", value: "@L", n: 3, lv: 1 }, { target: "natural.wound", value: "@L", n: 3, lv: 1 },
    { target: "skill.intimidation", value: "@L", n: 3, lv: 1 }, { target: "skill.survival", value: "@L", n: 3, lv: 1 }
  ]
};

/**
 * D1: the built-in effects of the States that happen at a moment (combat/triggers.mjs collectTriggers adds them to the
 * event's triggers), numbered like DBU.stateModifiers: "ignoreState.<state>.<n>" switches them off too.
 * Surging: (1) entering it, target an Opponent who becomes your Focus (the "Focus" mark, removed when you leave it);
 * (2) leaving it, Fatigued until the end of your next turn; (4) entering it removes Compelled; (5) a reminder when you
 * Defeat your Focus (you may leave the State then, ignoring its 2nd effect).
 */
DBU.stateTriggers = [
  // F12 Incorporeal (2): Damage from an attack makes you leave it, and you cannot enter it again until the end of your
  // next turn ("stateBlock.incorporeal")
  { state: "incorporeal", n: 2, event: "damaged", condition: "@states.incorporeal >= 1 && @damage > 0", effect: "buff",
    resource: "stateBlock.incorporeal", value: "1", duration: "endOfNextTurn" },
  { state: "incorporeal", n: 2, event: "damaged", condition: "@states.incorporeal >= 1 && @damage > 0", effect: "leaveState",
    resource: "incorporeal" },
  { state: "surging", n: 1, event: "stateEnter", condition: "@state_surging == 1 && @already == 0", effect: "mark", resource: "Focus",
    target: "targeted", duration: "none", mode: "ask" },
  { state: "surging", n: 1, event: "stateLeave", condition: "@state_surging == 1", effect: "unmark", resource: "Focus", target: "self" },
  { state: "surging", n: 2, event: "stateLeave", condition: "@state_surging == 1", effect: "condition", resource: "fatigued", value: "1",
    duration: "endOfNextTurn" },
  { state: "surging", n: 4, event: "stateEnter", condition: "@state_surging == 1 && @cond.compelled >= 1", effect: "removeCondition",
    resource: "compelled", value: "" },
  { state: "surging", n: 5, event: "attackHit", condition: "@states.surging >= 1 && @defeated == 1 && @vs.mark.focus == 1",
    effect: "message", value: "Focus Defeated: you may leave the Surging State, ignoring its 2nd effect", mode: "remind" },
  // BB Raging, Apoplectic (1): entering it and at the start of your turn, a Basic Attack Out-of-Sequence (1/Round)
  { state: "raging", n: 1, lv: 3, event: "stateEnter", condition: "@state_raging == 1 && @level >= 3", effect: "maneuver",
    resource: "basicAttack", mode: "ask", limit: "1/Round", limitKey: "state-apoplectic-1" },
  { state: "raging", n: 1, lv: 3, event: "startOfTurn", condition: "@states.raging >= 3", effect: "maneuver",
    resource: "basicAttack", mode: "ask", limit: "1/Round", limitKey: "state-apoplectic-1" },
  // BB Mindful, Zen (1): a Counter Maneuver used (a Counter Action spent) regains 2L(bT) Ki Points
  { state: "mindful", n: 1, lv: 2, event: "counterSpent", condition: "@states.mindful >= 2", effect: "ki", value: "2*@states.mindful*@bT" },
  // BB Mindful, Tranquil (1): entering it gives a Counter Action (each Combat Round: its built-in modifier)
  { state: "mindful", n: 1, lv: 3, event: "stateEnter", condition: "@state_mindful == 1 && @level >= 3 && @already == 0", effect: "counters", value: "1" },
  // BB Determined (3): at the start of your turn you leave it and skip that turn
  { state: "determined", n: 3, event: "startOfTurn", condition: "@states.determined >= 1", effect: "leaveState", resource: "determined" },
  { state: "determined", n: 3, event: "startOfTurn", condition: "@states.determined >= 1", effect: "message",
    value: "Determined: skip this turn", mode: "remind" },
  // BB Entrusted (3): entering it gives 1 Action
  { state: "entrusted", n: 3, event: "stateEnter", condition: "@state_entrusted == 1 && @already == 0", effect: "actions", value: "1" },
  // BB Multiple Arms (2): entering it gives a Counter Action for this Combat Round; (4) the Strike Roll of a Combination
  // attack rolled again (1/Round)
  { state: "multipleArms", n: 2, event: "stateEnter", condition: "@state_multipleArms == 1 && @already == 0", effect: "counters", value: "1" },
  { state: "multipleArms", n: 4, event: "roll", condition: "@states.multipleArms >= 1 && @kind_strike == 1 && @profile_combination == 1",
    effect: "reroll", value: "1", mode: "ask", limit: "1/Round" },
  // BB Spectator: (1) entering it and at the start of your turn, +1(bT) Combat Rolls to an Ally (your target) until the start
  // of your next turn; (2) at the start of your turn you may leave it; (3) if you stay: lose your Actions, regain 2d10(bT)
  // Life and Ki Points (and end your turn)
  { state: "spectator", n: 1, event: "stateEnter", condition: "@state_spectator == 1 && @already == 0", effect: "buff", resource: "combat",
    value: "1*@bT", target: "targeted", duration: "startOfNextTurn", mode: "ask" },
  { state: "spectator", n: 1, event: "startOfTurn", condition: "@states.spectator >= 1", effect: "buff", resource: "combat",
    value: "1*@bT", target: "targeted", duration: "startOfNextTurn", mode: "ask" },
  { state: "spectator", n: 2, event: "startOfTurn", condition: "@states.spectator >= 1", effect: "leaveState", resource: "spectator", mode: "ask" },
  { state: "spectator", n: 3, event: "startOfTurn", condition: "@states.spectator >= 1", effect: "life", value: "@roll", roll: "2d10(bT)",
    rollKey: "spectator3", mode: "ask" },
  { state: "spectator", n: 3, event: "startOfTurn", condition: "@states.spectator >= 1", effect: "ki", value: "@roll", roll: "2d10(bT)",
    rollKey: "spectator3", mode: "ask" },
  { state: "spectator", n: 3, event: "startOfTurn", condition: "@states.spectator >= 1", effect: "actions", value: "-99", roll: "2d10(bT)",
    rollKey: "spectator3", mode: "ask" },
  // BB Feral, Unhinged (1): a Critical Result on the Strike or the Wound Roll of an attack raises its Damage Category by 1 (once)
  { state: "feral", n: 1, lv: 2, event: "woundRolled", condition: "@states.feral >= 2 && (@crit == 1 || @critStrike == 1)",
    effect: "woundCategory", value: "1" }
];

/** Transformation Aspects. auto = automated by the system; levels = has [LV]. */
DBU.aspects = {
  absorbedApparel: { label: "Absorbed Apparel", auto: true },
  armored: { label: "Armored", auto: true },
  battleUniform: { label: "Battle Uniform" },
  beyond: { label: "Beyond" },
  bulky: { label: "Bulky", auto: true },
  enhancedSave: { label: "Enhanced Save", auto: true, param: true },
  glowing: { label: "Glowing" },
  godKi: { label: "God Ki", auto: true },
  graded: { label: "Graded" },
  growth: { label: "Growth", levels: 3, auto: true },
  heartbeat: { label: "Heartbeat", levels: 3, solo: true },
  highSpeed: { label: "High Speed", auto: true },
  innateState: { label: "Innate State", auto: true, param: true },
  linked: { label: "Linked", param: true },
  mindful: { label: "Mindful", auto: true },
  natural: { label: "Natural", levels: 2, solo: true, auto: true },
  perfectKiControl: { label: "Perfect Ki Control", auto: true },
  pinnacle: { label: "Pinnacle", levels: 2, solo: true },
  prelude: { label: "Prelude", auto: true },
  raging: { label: "Raging", auto: true },
  realization: { label: "Realization" },
  scaling: { label: "Scaling", levels: 4, solo: true, auto: true },
  superSaiyanForm: { label: "Super Saiyan Form", auto: true },
  transcendent: { label: "Transcendent" },
  variant: { label: "Variant", param: true },
  blutzWave: { label: "Blutz Wave", negative: true },
  bursting: { label: "Bursting", negative: true },
  difficult: { label: "Difficult", levels: 3, solo: true, negative: true },
  draining: { label: "Draining", levels: 99, negative: true, auto: true },
  exhausting: { label: "Exhausting", negative: true, auto: true },
  fading: { label: "Fading", levels: 2, solo: true, negative: true },
  lightDependent: { label: "Light Dependent", negative: true },
  limited: { label: "Limited", levels: 5, solo: true, negative: true },
  longTransformation: { label: "Long Transformation", levels: 2, negative: true },
  peaked: { label: "Peaked", negative: true },
  powerHigh: { label: "Power High", levels: 3, negative: true, auto: true },
  rampaging: { label: "Rampaging", levels: 2, negative: true },
  straining: { label: "Straining", negative: true, auto: true },
  weakening: { label: "Weakening", negative: true, auto: true }
};

DBU.transformationTypes = {
  awakening: "DBU.TransType.awakening",
  enhancement: "DBU.TransType.enhancement",
  form: "DBU.TransType.form",
  evolved: "DBU.TransType.evolved"
};

DBU.awakeningTypes = { lesser: "DBU.AwakType.lesser", greater: "DBU.AwakType.greater", super: "DBU.AwakType.super" };

DBU.apparelCategories = {
  armor: "DBU.Apparel.armor",
  weights: "DBU.Apparel.weights",
  combat: "DBU.Apparel.combat",
  standard: "DBU.Apparel.standard"
};

/** Craftsmanship Grade → Apparel Grade multiplier of (bT), Quality Slots and Craft DC. */
DBU.craftsmanship = {
  1: { apparelBonus: 1, slots: 0, dc: "apprentice" },
  2: { apparelBonus: 1, slots: 1, dc: "qualified" },
  3: { apparelBonus: 2, slots: 2, dc: "expert" },
  4: { apparelBonus: 2, slots: 3, dc: "master" },
  5: { apparelBonus: 3, slots: 4, dc: "grandmaster" }
};

DBU.weaponSizes = {
  small: { label: "DBU.WeaponSize.small", strike: 1, wound: -2 },
  standard: { label: "DBU.WeaponSize.standard", strike: 0, wound: 0 },
  big: { label: "DBU.WeaponSize.big", strike: -1, wound: 2 }
};

DBU.weaponCategories = {
  bludgeoning: { type: "physical", label: "Bludgeoning", ignoreHalfDR: true },
  slashing: { type: "physical", label: "Slashing", wound: 2 },
  piercing: { type: "physical", label: "Piercing", ignoreQuarterSoak: true },
  shield: { type: "physical", label: "Shield" },
  efficient: { type: "energy", label: "Efficient", kp: -2, simpleWound: 2 },
  precision: { type: "energy", label: "Precision", calledStrike: 1, calledWound: 2 },
  highPower: { type: "energy", label: "High Power" },
  magicStaff: { type: "magic", label: "Magic Staff", kp: -2 },
  elementalTool: { type: "magic", label: "Elemental Tool" },
  magicOrb: { type: "magic", label: "Magic Orb", wound: 2 }
};

DBU.talentCategories = [
  "Attacking", "Balance", "Buddy", "Condition", "Counter", "Damaging", "Dodging", "Durability",
  "Energy Attack", "Grappling", "Initiative", "Insightful", "Magic Attack", "Mindful", "Minion",
  "Mobility", "Multi-Type", "Physical Attack", "Racial", "Raging", "Size", "Skill", "Specialization",
  "Starter", "Super Stack", "Surge", "Taunt", "Teamwork", "Technique", "Threshold", "Transformation",
  "Weapon", "Miscellaneous"
];
/** Talent Categories that may repeat among the 4 Talents of Character Creation. */
DBU.TALENT_FREE_CATEGORIES = ["Miscellaneous", "Skill"];

DBU.alignments = {
  "2": "DBU.Alignment.pureGood",
  "1": "DBU.Alignment.good",
  "0": "DBU.Alignment.neutral",
  "-1": "DBU.Alignment.evil",
  "-2": "DBU.Alignment.pureEvil"
};

DBU.thresholds = ["bruised", "injured", "critical"];
/** Fraction of Maximum Life Points at or below which each Health Threshold is reached. */
DBU.THRESHOLD_FRACTIONS = { bruised: 1 / 2, injured: 1 / 4, critical: 1 / 10 };

/**
 * Modifier targets understood by the rules engine. Items, Conditions, States and Aspects all
 * feed modifiers into these buckets. The value of a bucket is the sum of its modifiers.
 */
DBU.modifierTargets = {
  "score.ag": "Score AG", "score.fo": "Score FO", "score.te": "Score TE", "score.sc": "Score SC",
  "score.in": "Score IN", "score.ma": "Score MA", "score.pe": "Score PE",
  "mod.ag": "Mod AG", "mod.fo": "Mod FO", "mod.te": "Mod TE", "mod.sc": "Mod SC",
  "mod.in": "Mod IN", "mod.ma": "Mod MA", "mod.pe": "Mod PE",
  "top": "DBU.Target.top",
  "topDice.category": "DBU.Target.topDiceCategory",
  "topDice.extra": "DBU.Target.topDiceExtra",
  "combat": "DBU.Target.combat",
  "strike": "DBU.Target.strike", "strike.physical": "DBU.Target.strikePhysical",
  "strike.energy": "DBU.Target.strikeEnergy", "strike.magic": "DBU.Target.strikeMagic",
  "strike.signature": "DBU.Target.strikeSignature", "strike.armed": "DBU.Target.strikeArmed",
  "strike.unarmed": "DBU.Target.strikeUnarmed",
  "dodge": "DBU.Target.dodge",
  "wound": "DBU.Target.wound", "wound.physical": "DBU.Target.woundPhysical",
  "wound.energy": "DBU.Target.woundEnergy", "wound.magic": "DBU.Target.woundMagic",
  "wound.signature": "DBU.Target.woundSignature", "wound.armed": "DBU.Target.woundArmed",
  "wound.unarmed": "DBU.Target.woundUnarmed",
  "crit.strike": "DBU.Target.critStrike", "crit.dodge": "DBU.Target.critDodge", "crit.wound": "DBU.Target.critWound",
  "crit.save": "DBU.Target.critSave", "crit.skill": "DBU.Target.critSkill",
  "critDice.strike": "DBU.Target.critDiceStrike", "critDice.dodge": "DBU.Target.critDiceDodge",
  "critDice.wound": "DBU.Target.critDiceWound",
  "botch.strike": "DBU.Target.botchStrike", "botch.dodge": "DBU.Target.botchDodge", "botch.wound": "DBU.Target.botchWound",
  "botch.save": "DBU.Target.botchSave", "botch.skill": "DBU.Target.botchSkill",
  "natural.strike": "DBU.Target.naturalStrike", "natural.dodge": "DBU.Target.naturalDodge",
  "natural.wound": "DBU.Target.naturalWound",
  "haste": "Haste", "awareness": "Awareness", "defenseValue": "Defense Value",
  "soak": "Soak", "dr": "DBU.Target.dr", "might": "Might", "surgency": "Surgency",
  "speed": "DBU.Target.speed", "speed.normal": "DBU.Target.speedNormal", "speed.boosted": "DBU.Target.speedBoosted",
  "initiative": "DBU.Target.initiative", "stress": "Stress Bonus", "steadfast": "Steadfast",
  "save.all": "DBU.Target.saveAll", "save.impulsive": "DBU.Save.impulsive", "save.corporeal": "DBU.Save.corporeal",
  "save.cognitive": "DBU.Save.cognitive", "save.morale": "DBU.Save.morale",
  "skill.all": "DBU.Target.skillAll",
  "life.max": "DBU.Target.lifeMax", "life.perLevel": "DBU.Target.lifePerLevel", "rlm": "RLM",
  "ki.max": "DBU.Target.kiMax", "capacity.max": "DBU.Target.capacityMax",
  "tp": "DBU.Target.tp", "tp.perSI": "DBU.Target.tpPerSI",
  "perks": "DBU.Target.perks", "attributePoints": "DBU.Target.attributePoints",
  "superStacks": "Super Stacks", "muscle": "DBU.Target.muscle",
  "kpCost.attack": "DBU.Target.kpCostAttack", "kpCost.ua": "DBU.Target.kpCostUA",
  "charge.category": "DBU.Target.chargeCategory",
  "damageTaken": "DBU.Target.damageTaken", "damageCategoryTaken": "DBU.Target.damageCategoryTaken",
  "actions": "DBU.Target.actions", "counters": "DBU.Target.counters",
  "size": "DBU.Target.size", "longRange": "DBU.Target.longRange",
  "flag.greaterDice": "DBU.Target.flagGreaterDice", "flag.ignoreThresholds": "DBU.Target.flagIgnoreThresholds",
  "flag.autoHit": "DBU.Target.flagAutoHit", "flag.noWeaponPenalty": "DBU.Target.flagNoWeaponPenalty",
  "flag.energyWithoutFO": "DBU.Target.flagEnergyWithoutFO", "flag.magicWithoutMA": "DBU.Target.flagMagicWithoutMA",
  "flag.unnatural": "Unnatural", "flag.autoPassBruised": "DBU.Target.flagAutoPassBruised",
  "crit.combat": "DBU.Target.critCombat", "botch.combat": "DBU.Target.botchCombat", "natural.combat": "DBU.Target.naturalCombat",
  "critDice.combat": "DBU.Target.critDiceCombat",
  "dice.combat": "DBU.Target.diceCombat", "dice.strike": "DBU.Target.diceStrike", "dice.dodge": "DBU.Target.diceDodge",
  "dice.wound": "DBU.Target.diceWound", "attackLifeCost": "DBU.Target.attackLifeCost",
  "kpCost.physical": "DBU.Target.kpCostPhysical", "kpCost.energy": "DBU.Target.kpCostEnergy", "kpCost.magic": "DBU.Target.kpCostMagic",
  "ki.mult": "DBU.Target.kiMult", "capacity.mult": "DBU.Target.capacityMult", "life.mult": "DBU.Target.lifeMult",
  "speed.mult": "DBU.Target.speedMult", "favoredElement": "DBU.Target.favoredElement",
  "battleBorn.cap.strike": "DBU.Target.bbCapStrike", "battleBorn.cap.dodge": "DBU.Target.bbCapDodge",
  "battleBorn.cap.wound": "DBU.Target.bbCapWound", "flag.bbWoundUnlimited": "DBU.Target.flagBbWoundUnlimited",
  "flag.bbForceWound": "DBU.Target.flagBbForceWound",
  "flag.noApparelPenalty": "DBU.Target.flagNoApparelPenalty", "flag.autoStress": "DBU.Target.flagAutoStress",
  // Attack options: evaluated when an attack is made, with its variables (@signature, @ultimate, @charges...)
  "attack.charges": "DBU.Target.attackCharges", "attack.strike": "DBU.Target.attackStrike",
  "attack.wound": "DBU.Target.attackWound", "attack.kp": "DBU.Target.attackKp", "attack.category": "DBU.Target.attackCategory",
  "kpCost.signature": "DBU.Target.kpCostSignature", "kpCost.basic": "DBU.Target.kpCostBasic",
  "attack.crit.strike": "DBU.Target.attackCritStrike", "attack.crit.wound": "DBU.Target.attackCritWound",
  "attack.natural.strike": "DBU.Target.attackNaturalStrike", "attack.natural.wound": "DBU.Target.attackNaturalWound",
  "attack.chargeCategory": "DBU.Target.attackChargeCategory", "attack.lethal": "DBU.Target.attackLethal",
  "attack.ignoreDR": "DBU.Target.attackIgnoreDR", "attack.kpFree": "DBU.Target.attackKpFree",
  // Its value is text: an Attribute key ("pe"), a list ("fo|ma"), "surgency" or "any"
  "attack.damageAttribute": "DBU.Target.attackDamageAttribute",
  "flag.fullWager": "DBU.Target.flagFullWager", "flag.weaponAssisted": "DBU.Target.flagWeaponAssisted",
  "charges.max": "DBU.Target.chargesMax", "clash.duel": "DBU.Target.clashDuel",
  // Defend without a Counter Action / without paying the Guard's KP (attack-option mode and limit)
  "defense.freeCounter": "DBU.Target.defenseFreeCounter", "defense.freeKp": "DBU.Target.defenseFreeKp",
  // Power stacks: maximum (base 2), "Power Spiked" (counts as at the maximum)
  "power.max": "DBU.Target.powerMax", "flag.powerSpiked": "DBU.Target.flagPowerSpiked",
  "greaterDice.category": "DBU.Target.greaterDiceCategory",
  "topDice.category.strike": "DBU.Target.topDiceCategoryStrike", "topDice.category.dodge": "DBU.Target.topDiceCategoryDodge",
  "topDice.category.wound": "DBU.Target.topDiceCategoryWound", "dimOffenseStart": "DBU.Target.dimOffenseStart",
  "flag.noDimDefense": "DBU.Target.flagNoDimDefense", "dimDefense.mult": "DBU.Target.dimDefenseMult",
  "surgency.mult": "DBU.Target.surgencyMult", "soak.mult": "DBU.Target.soakMult",
  "flag.noReducedMomentum": "DBU.Target.flagNoReducedMomentum", "flag.autoPassSteadfast": "DBU.Target.flagAutoPassSteadfast",
  "flag.autoFailSteadfast": "DBU.Target.flagAutoFailSteadfast", "flag.noLifeRegain": "DBU.Target.flagNoLifeRegain",
  // Maneuvers: Combat Recovery, Surge, Legend Realized, Energy Charge
  "recovery.bonus": "DBU.Target.recoveryBonus", "recovery.kiMult": "DBU.Target.recoveryKiMult",
  "surge.kiMult": "DBU.Target.surgeKiMult", "surge.healSurgency": "DBU.Target.surgeHealSurgency",
  "uses.surge": "DBU.Target.usesSurge", "legend.bonus": "DBU.Target.legendBonus", "legend.mult": "DBU.Target.legendMult",
  "charge.kpMult": "DBU.Target.chargeKpMult", "flag.chargeNoGuardDown": "DBU.Target.flagChargeNoGuardDown",
  // Divine Ki Points
  "dkp.max": "DBU.Target.dkpMax", "dkp.mult": "DBU.Target.dkpMult", "flag.dkpUsable": "DBU.Target.flagDkpUsable",
  // Attribute Modifier Bonus of the Transformation that has the modifier (its own modifiers only)
  "amb.mult": "DBU.Target.ambMult"
};
/**
 * Families of targets that cannot be listed (accepted by the rules engine by prefix):
 * resMax.<resource slug> (+ maximum), resMaxSet.<resource slug> (sets the base maximum, highest wins),
 * ignoreState.<state>.<n> / ignoreState.<state>.<level name or number>.<n> (suppresses that built-in State effect).
 */
DBU.MODIFIER_TARGET_PREFIXES = ["resMax.", "resMaxSet.", "ignoreState."];

/**
 * Resources whose stacks are each applied to one Combat Roll (you decide which): +perStack to that roll per stack.
 * cap = stacks allowed per Combat Roll (0 = no limit); lowest = only onto the roll with the fewest stacks;
 * force = every stack goes to that roll; max = total stacks; capTarget = prefix of the modifiers that raise the cap.
 */
DBU.splitRolls = ["strike", "dodge", "wound"];
DBU.splitResources = {
  battleborn: { name: "Battle Born", cap: 2, capTarget: "battleBorn" },
  progress: { name: "Progress", cap: 2 },
  bottomlessbattleborn: { name: "Bottomless Battle Born", cap: 0, lowest: true },
  divinebattleborn: { name: "Divine Battle Born", cap: 0, force: "wound", max: 3 }
};
// One skill.<key> target per skill
for ( const k of Object.keys(DBU.skills) ) DBU.modifierTargets[`skill.${k}`] = DBU.skills[k].label;
// "Immune to the X Combat Condition" (value 1): the Condition has no effect on the character
for ( const k of Object.keys(DBU.conditions) ) DBU.modifierTargets[`immune.${k}`] = `DBU.Target.immune.${k}`;
// Attribute Modifier Bonus of this Transformation for one Attribute: added (amb.fo) or multiplied (amb.fo.mult)
for ( const a of DBU.ATTRIBUTES ) {
  const A = a[0].toUpperCase() + a.slice(1);
  DBU.modifierTargets[`amb.${a}`] = `DBU.Target.amb${A}`;
  DBU.modifierTargets[`amb.${a}.mult`] = `DBU.Target.amb${A}Mult`;
}
// The feature packages' targets (module/vocab/a.mjs, b.mjs, c.mjs): listed ones, families accepted by prefix, generated ones
Object.assign(DBU.modifierTargets, VOCAB.MODIFIER_TARGETS);
DBU.MODIFIER_TARGET_PREFIXES.push(...VOCAB.MODIFIER_TARGET_PREFIXES);
VOCAB.registerTargets(DBU);

/** Icons for item types (used by the "create item" buttons and as default images). */
DBU.itemIcons = {
  race: "icons/svg/mystery-man.svg",
  racialTrait: "icons/svg/pawprint.svg",
  talent: "icons/svg/book.svg",
  transformation: "icons/svg/aura.svg",
  signature: "icons/svg/explosion.svg",
  uniqueAbility: "icons/svg/mage-shield.svg",
  maneuver: "icons/svg/thrust.svg",
  weapon: "icons/svg/sword.svg",
  apparel: "icons/svg/shield.svg",
  item: "icons/svg/item-bag.svg"
};

/** Site base URL used to link every compendium entry to its official rules page. */
DBU.SITE = "https://dbu-rpg.com/";
