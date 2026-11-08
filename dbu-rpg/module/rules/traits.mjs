/**
 * The Traits a character can use right now (Combat tab): those of its active Transformations, including the ones gained
 * from lower Stages or from a Variant's listed Transformation, its Legendary Traits (possessed at all times), its active
 * Racial Traits and its Talents. Pure functions over item data, so they can be checked outside Foundry.
 */

import { unchosenTraits } from "./awakening.mjs";

/** Order of the Trait kinds inside a Transformation. */
const KIND_ORDER = ["trait", "burst limit", "mastery trait", "transcendent trait", "grand awakening", "legendary trait"];

/** "Ascended Past a Super Saiyan (1) [mastery trait]" → { name, kind: "mastery trait", level: 1 } */
export function parseTrait(text) {
  const m = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(String(text ?? ""));
  const name = (m ? m[1] : String(text ?? "")).trim();
  return { name, kind: m ? m[2].trim().toLowerCase() : "trait", level: Number(/\((\d)\)\s*$/.exec(name)?.[1] ?? 0) };
}

/** The effects of each Trait ("(1) [Passive] — auto; ...") from the "Efeitos (estrutura)" list of a description. */
export function traitStructure(html) {
  const out = {};
  for ( const m of String(html ?? "").matchAll(/<li><strong>([^<]+)<\/strong>(?:\s*\([^)]*\))?:\s*(.*?)<\/li>/g) ) {
    out[m[1].trim()] = m[2].replace(/<[^>]+>/g, "").trim();
  }
  return out;
}

/**
 * Can a Trait of this active Transformation be used now?
 * Mastery Traits from their Mastery level (inherited ones by this Transformation's own Mastery: a higher Stage only
 * benefits from a lower Stage's Mastery Trait once it is also Mastered); an Awakening's "Name (n)" Trait from n Stacks,
 * and a Trait one of its Stacks picks (a Technical Trait of Ki Technician) once picked; a Transcendent Trait with one
 * Mastery beyond Fully Mastered while Transcended; a Grand Awakening once activated.
 */
export function traitUsable(s, t) {
  const mastery = s.mastery ?? 0;
  if ( unchosenTraits(s).has(t.name) ) return false;
  switch ( t.kind ) {
    case "mastery trait": return mastery >= Math.max(1, t.level);
    case "transcendent trait": return !!s.transcended && (mastery > (s.masteryNeeded ?? 1));
    case "grand awakening": return !!s.grandAwakening;
    case "legendary trait": return false; // listed apart: possessed at all times
    default: return (s.transType !== "awakening") || !t.level || ((s.stacks ?? 0) >= t.level);
  }
}

/** Is this Transformation in use? (an Awakening while it has Stacks) */
const inUse = s => (s.transType === "awakening") ? ((s.stacks ?? 0) > 0) : !!s.active;

/**
 * The Traits in use, grouped by source.
 * @param {object[]} items          The actor's items ({ id, type, name, img, system })
 * @param {object} [options]
 * @param {boolean} [options.burstUsed]  A Burst Limit was already triggered this Combat Encounter
 * @returns {{transformations: object[], legendary: object[], racial: object[], talents: object[]}}
 */
export function activeTraits(items, { burstUsed = false } = {}) {
  const list = Array.from(items ?? []);
  const transformations = [];
  const legendary = new Map();
  for ( const item of list.filter(i => i.type === "transformation") ) {
    const s = item.system;
    const own = traitStructure(s.description);
    const traits = [
      ...(s.inherited ?? []).map(t => ({ ...parseTrait(t.trait), from: t.from ?? "", slug: t.slug ?? "" })),
      ...(s.traits ?? []).map(t => ({ ...parseTrait(t), from: "", slug: s.source?.slug ?? "", info: "" }))
    ];
    for ( const t of traits ) {
      if ( !t.from ) t.info = own[t.name] ?? "";
      t.itemId = item.id;
      t.section = t.from || s.source?.section || item.name;
      const choice = (s.choices ?? []).find(c => (c.trait === t.name) && c.selected?.length);
      if ( choice ) t.choice = choice.selected.join(", ");
    }
    // Legendary Traits: possessed at all times once the character has access to that Legendary Form
    for ( const t of traits ) {
      if ( (t.kind === "legendary trait") && !legendary.has(t.name) ) legendary.set(t.name, { ...t, source: item.name });
    }
    if ( !inUse(s) ) continue;
    const usable = traits.filter(t => traitUsable(s, t))
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    for ( const t of usable ) {
      // Burst Limit [1/Encounter]: a New Level of Power in this Enhancement allows another one
      if ( t.kind === "burst limit" ) t.burst = { used: burstUsed && !s.newLevel };
    }
    const grand = (s.traits ?? []).map(parseTrait).find(t => t.kind === "grand awakening");
    transformations.push({ item, traits: usable, fullAwakening: !!grand && !s.grandAwakening, grand: grand?.name ?? "" });
  }
  // A Form above the others in its Line first, then Enhancements, then Awakenings
  const rank = g => ({ form: 0, evolved: 0, enhancement: 1, awakening: 2 }[g.item.system.transType] ?? 3);
  transformations.sort((a, b) => (rank(a) - rank(b)) || ((b.item.system.stage ?? 0) - (a.item.system.stage ?? 0)));
  const racial = list.filter(i => (i.type === "racialTrait") && (i.system.active !== false));
  const talents = list.filter(i => i.type === "talent");
  return { transformations, legendary: Array.from(legendary.values()), racial, talents };
}
