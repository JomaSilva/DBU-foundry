import { DBU } from "../config.mjs";
import { encounterOthers } from "./allies.mjs";

/**
 * The Profiles of an Attacking Maneuver: its own, plus the one the Multi-Profile Super Profile applies to it (that
 * Profile's effects apply, but not its Ki Point Cost, and the Attacking Maneuver is also considered to be of it).
 * @param {string} profileKey
 * @param {object} [sig]       The Signature Technique's system data
 * @param {string[]} [extra]   Profiles applied by an effect when the attack is made (Multi-Profile of a Trait or Weapon)
 * @returns {string[]}
 */
export function profileKeys(profileKey, sig = null, extra = []) {
  const keys = DBU.profiles[profileKey] ? [profileKey] : [];
  const multi = (sig?.superProfile === "multiProfile") ? sig.multiProfile : "";
  for ( const k of [multi, ...extra] ) if ( DBU.profiles[k] && !keys.includes(k) ) keys.push(k);
  return keys;
}

/**
 * What the Profiles of an Attacking Maneuver do together. With different Damage Categories the highest one applies.
 * @param {string[]} keys
 */
export function profileEffects(keys) {
  keys = (keys ?? []).filter(k => DBU.profiles[k]);
  const list = keys.map(k => DBU.profiles[k]);
  const sum = field => list.reduce((t, p) => t + (p[field] ?? 0), 0);
  const any = field => list.some(p => !!p[field]);
  return {
    keys, list,
    has: key => keys.includes(key),
    label: list.map(p => p.label).join(" + "),
    cat: Math.max(1, ...list.map(p => p.cat ?? 1)),
    minNatural: Math.max(0, ...list.map(p => p.minNatural ?? 0)) || undefined,
    maxCharges: Math.max(7, ...list.map(p => p.maxCharges ?? 7)),
    freeCharges: sum("freeCharges"),
    bonusCharges: sum("bonusCharges"),
    sigKpReduction: sum("sigKpReduction"),
    sigStart: Math.min(8, ...list.map(p => p.sigStart ?? 8)),
    freeAdvantages: [...new Set(list.flatMap(p => p.freeAdvantages ?? []))],
    cutting: any("cutting"),
    ignoreHalfDR: any("ignoreHalfDR"),
    elemental: keys.filter(k => DBU.profiles[k].elemental),
    // Profiles of Transformations and Races: Barrier Blow, Gravity Cage, Glass, Time, Destruction
    barrierBlow: any("barrierBlow"), gravityCage: any("gravityCage"), glass: any("glass"), time: any("time"),
    destruction: any("destruction")
  };
}

/**
 * Who may use the Profiles that only some effects give access to: an item with that name, in use (a Transformation
 * while in it) unless "always" (a Permanent effect).
 */
export const PROFILE_ACCESS = {
  barrierBlow: [{ name: "Barrier Focus" }],
  gravityCage: [{ name: "Gravity Controller" }],
  glass: [{ name: "Glass Tribe" }, { name: "Genetic Splicing" }],
  time: [{ name: "Time Power", always: true }],
  destruction: [{ name: "Power of Destruction" }]
};

/** Can this actor use that Profile? (the usual ones: always) */
export function profileAccess(actor, key) {
  const access = PROFILE_ACCESS[key];
  if ( !access || !actor?.items ) return true;
  return actor.items.some(i => access.some(a => (i.name.trim().toLowerCase() === a.name.toLowerCase())
    && (a.always || (i.system?.isActive ?? true))));
}

/** The items that give access to a Profile, for messages ("Barrier Focus"). */
export const profileAccessNames = key => (PROFILE_ACCESS[key] ?? []).map(a => a.name).join(" / ");

/** The Profiles of an attack from its chat card (cards made before Multi-Profile counted only list the first one). */
export function attackProfileEffects(attack) {
  return profileEffects(attack?.profiles?.length ? attack.profiles : [attack?.profile]);
}

/** Ki Point Cost of the Multi-Profile Super Profile, in (T): ≤4(T) Profiles 1(T), 5(T)~7(T) 2(T), ≥8(T) 3(T). */
export function multiProfileCost(key) {
  const kp = DBU.profiles[key]?.kp ?? 0;
  return kp <= 4 ? 1 : (kp <= 7 ? 2 : 3);
}

/** "Elemental (Fire)", "Fire" or "elementalFire" → "elementalFire". The element must match whole: Light is not Lightning. */
export function elementalKey(text) {
  const raw = String(text ?? "").trim();
  if ( DBU.profiles[raw]?.elemental ) return raw;
  const element = s => String(s).toLowerCase().replace(/elemental/g, "").replace(/[^a-z]/g, "");
  const wanted = element(raw);
  if ( !wanted ) return null;
  return Object.keys(DBU.profiles).find(k => DBU.profiles[k].elemental && (element(DBU.profiles[k].label) === wanted)) ?? null;
}

/**
 * The actor's Favored Elements (Profile keys): the Elemental Tool wielded, "Favored Element" modifiers of the items in
 * use (a Transformation's while in it), and the Elements picked in an item's choice of Elemental Profiles (each Stack of
 * Elemental Force).
 */
export function favoredElements(actor) {
  const keys = new Set();
  const add = text => { const k = elementalKey(text); if ( k ) keys.add(k); };
  for ( const item of actor?.items ?? [] ) {
    const s = item.system;
    if ( !s ) continue;
    const inUse = s.isActive ?? true;
    if ( (item.type === "weapon") && inUse && (s.category === "elementalTool") ) add(s.favoredElement);
    for ( const m of s.modifiers ?? [] ) {
      if ( (m.target === "favoredElement") && (m.active !== false) && (inUse || ((item.type === "transformation") && m.always)) ) add(m.value);
    }
    if ( !inUse ) continue;
    for ( const c of s.choices ?? [] ) {
      if ( !c.entry && c.options?.length && c.options.every(o => elementalKey(o)) ) for ( const o of c.selected ?? [] ) add(o);
    }
  }
  return [...keys];
}

/**
 * Effects that apply the Multi-Profile Super Profile to an Attacking Maneuver when it is made (Profiles in this system
 * only: Glass, Gravity Cage, Time, Destruction or Barrier Blow are not). Each one:
 *  - item(item): the item that has the effect, in use;
 *  - attacks: "any", "physicalEnergy" (Physical or Energy Attacks) or "signature" (Copied Techniques of Neko Mimicry);
 *  - profiles(actor, item): the Profiles it may apply;
 *  - limit(item): {per: "round"|"encounter", max} or null; mandatory: always applied (Elemental Blade);
 *  - resource: a resource spent for it (Sunlight).
 */
export const MULTI_PROFILE_SOURCES = [
  {
    id: "elementalForce", name: "Flash of the Elements",
    item: i => (i.type === "transformation") && /^elemental force$/i.test(i.name) && ((i.system.stacks ?? 0) >= 1),
    attacks: "physicalEnergy", favored: true, profiles: actor => favoredElements(actor),
    limit: i => ({ per: "round", max: Math.max(1, i.system.stacks ?? 1) })
  },
  {
    // Elemental Aura (an Aura Trait): 1/Round until Sparking Aura is Mastered
    id: "elementalAura", name: "Elemental Aura",
    item: i => (i.type === "transformation") && /^sparking aura$/i.test(i.name) && !!i.system.isActive,
    attacks: "any", favored: true, profiles: actor => favoredElements(actor),
    limit: i => (((i.system.mastery ?? 0) >= 1) ? null : { per: "round", max: 1 })
  },
  {
    // Elemental Assault's Elemental Infusion option (Monstrous Traits): an item with that name
    id: "elementalInfusion", name: "Elemental Infusion",
    // (F12: or the Racial Trait Elemental Assault with its "Elemental Infusion" option switched on)
    item: i => /elemental infusion/i.test(i.name) || ((i.type === "racialTrait") && /^elemental assault/i.test(i.name)
      && (i.system.modifiers ?? []).some(m => /elemental infusion/i.test(m.label ?? "") && (m.active !== false))),
    attacks: "physicalEnergy", favored: true, profiles: actor => favoredElements(actor), limit: () => null
  },
  {
    // F13 Genetic Focus: Glass (4): a Signature Technique may take the Glass Profile (1/Round)
    id: "geneticFocusGlass", name: "Genetic Focus: Glass",
    item: i => (i.type === "racialTrait") && /^genetic focus: glass/i.test(i.name),
    attacks: "signature", profiles: () => ["glass"], limit: () => ({ per: "round", max: 1 })
  },
  {
    id: "plantMonster", name: "Plant Monster",
    item: i => (i.type === "racialTrait") && /^plant monster/i.test(i.name),
    attacks: "any", profiles: () => ["elementalPlantlife"], limit: () => null, resource: "Sunlight"
  },
  {
    // A Profile used by at least 1 of your Signature Techniques
    id: "nekoMimicry", name: "Neko Mimicry",
    item: i => (i.type === "racialTrait") && /^neko mimicry/i.test(i.name),
    attacks: "signature", copied: true,
    profiles: actor => [...new Set(actor.items.filter(i => i.type === "signature")
      .flatMap(i => profileKeys(i.system.profile, i.system)))],
    limit: () => ({ per: "encounter", max: 1 })
  },
  {
    // Weapon Quality: the Elemental Profile chosen for the Weapon (its Favored Element field) on every attack
    id: "elementalBlade", name: "Elemental Blade",
    item: i => (i.type === "weapon") && !!i.system.isActive && (i.system.qualities ?? []).some(q => /^elemental blade$/i.test(q.name)),
    attacks: "any", mandatory: true, profiles: (actor, i) => [elementalKey(i.system.favoredElement)].filter(Boolean),
    limit: () => null
  },
  // Signature Techniques with the Profile a Transformation gives access to
  {
    id: "barrierFocus", name: "Barrier Focus",
    item: i => (i.type === "transformation") && /^barrier focus$/i.test(i.name) && !!i.system.isActive,
    attacks: "signature", profiles: () => ["barrierBlow"], limit: () => ({ per: "encounter", max: 1 })
  },
  {
    id: "gravityController", name: "Gravity Controller",
    item: i => (i.type === "transformation") && /^gravity controller$/i.test(i.name) && !!i.system.isActive,
    attacks: "signature", profiles: () => ["gravityCage"], limit: () => ({ per: "round", max: 1 })
  },
  {
    id: "timePower", name: "Time Power",
    item: i => (i.type === "transformation") && /^time power$/i.test(i.name) && !!i.system.isActive,
    attacks: "signature", profiles: () => ["time"], limit: () => ({ per: "encounter", max: 1 })
  },
  {
    id: "ultraEgo", name: "Ultra Ego",
    item: i => (i.type === "transformation") && /^ultra ego$/i.test(i.name) && !!i.system.isActive,
    attacks: "signature", profiles: () => ["destruction"], limit: () => ({ per: "round", max: 1 })
  },
  {
    id: "bioFocus", name: "Bio-Focus", note: "DBU.MultiProfile.GlassGenes",
    item: i => /^bio-?focus$/i.test(i.name) && (i.system?.isActive ?? true),
    attacks: "signature", profiles: () => ["glass"], limit: () => ({ per: "round", max: 1 })
  },
  {
    // Every Signature Technique not of the Glass Profile, while in Glass Dragon
    id: "glassDragon", name: "Glass Dragon",
    item: i => (i.type === "transformation") && /^glass dragon$/i.test(i.name) && !!i.system.isActive,
    attacks: "signature", mandatory: true, profiles: () => ["glass"], limit: () => null
  },
  {
    // Unique Technique: the Unique Profile picked with the Talent, on the Favored Technique
    id: "uniqueTechnique", name: "Unique Technique", note: "DBU.MultiProfile.FavoredOnly",
    item: i => (i.type === "talent") && /^unique technique$/i.test(i.name),
    attacks: "signature", profiles: actor => Object.keys(DBU.profiles).filter(k => !PROFILE_ACCESS[k] || profileAccess(actor, k)),
    limit: () => ({ per: "round", max: 1 })
  },
  {
    // Glass Tribe: the Glass Profile's effects for 2(bT) Ki Points, without being a Super Profile
    id: "glassTribe", name: "Glass Tribe",
    item: i => (i.type === "race") && /^glass tribe$/i.test(i.name),
    attacks: "any", notSuper: true, kpFlat: actor => 2 * (actor.system.top?.base ?? 1), profiles: () => ["glass"],
    limit: () => ({ per: "round", max: 1 })
  }
];

/**
 * The Multi-Profile effects an actor has now, with the Profiles each may apply to an attack of this Profile.
 * @param {Actor} actor
 * @param {string} profileKey   The attack's own Profile (a different one must be chosen)
 * @param {object} [sig]        The Signature Technique's system data
 * @returns {{blocked: boolean, sources: object[]}}  blocked: the technique already has a Super Profile
 */
export function multiProfileSources(actor, profileKey, sig = null) {
  const own = profileKeys(profileKey, sig);
  const sources = [];
  for ( const def of MULTI_PROFILE_SOURCES ) {
    const item = actor?.items?.find(def.item);
    if ( !item ) continue;
    const keys = def.profiles(actor, item).filter(k => DBU.profiles[k] && !own.includes(k));
    // A technique with a Super Profile cannot gain another one (the Glass Tribe's Glass is not a Super Profile)
    sources.push({ def, item, keys, limit: def.limit(item), blocked: !!sig?.superProfile && !def.notSuper });
  }
  // GC4: an adjacent Glass Tribe Ally with Glass Combat: the Glass Profile's effects on your attack, its 2(bT) Ki Points
  // and its 1/Round use on that Ally (def.payer)
  let others = [];
  try { others = encounterOthers(actor); } catch(err) { others = []; }
  for ( const o of others ) {
    if ( !o.ally || !(o.distance <= 1) ) continue;
    const ally = o.actor;
    const trait = ally?.items?.find(i => (i.type === "racialTrait") && /^glass combat\b/i.test(i.name) && (i.system?.active !== false));
    if ( !trait || !ally.items.find(i => (i.type === "race") && /^glass tribe$/i.test(i.name)) ) continue;
    const def = { id: `glassAlly_${ally.id}`, name: `Glass Combat (${ally.name})`, attacks: "any", notSuper: true, payer: ally,
      kpFlat: () => 2 * (ally.system?.top?.base ?? 1), profiles: () => ["glass"], limit: () => ({ per: "round", max: 1 }) };
    sources.push({ def, item: trait, keys: ["glass"].filter(k => DBU.profiles[k] && !own.includes(k)), limit: def.limit(), blocked: false });
  }
  return { blocked: !!sig?.superProfile && !sources.some(s => s.def.notSuper), sources };
}
