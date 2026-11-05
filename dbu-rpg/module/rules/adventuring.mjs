/**
 * Adventuring Maneuvers (dbu-rpg.com/adventure): used only outside of Combat Encounters, each with a Time Cost and a
 * Session Limit. A character has the Universal ones, the Skilled ones of every Skill with 2+ Skill Ranks, and those
 * an item, Unique Ability, Awakening or Talent gives. Pure data and checks, so they can be verified outside Foundry.
 */

const CRAFT = ["craftBasic", "craftApparel", "craftWeapons", "craftVehicles"];
const KNOWLEDGE = ["knowledgeScience", "knowledgeProfession", "knowledgeHistory", "knowledgeOther"];

/**
 * key: i18n key of its effect (DBU.Adv.Effect.<key>); skills: 2+ Skill Ranks in any of them; sources: items that give
 * it ({ type, names, pattern, equipped }); limit: Session Limit (Infinity = unlimited, null = not published); time:
 * Time Cost; use: what the Use button does (info | breather | rest | care | stretch | holdingBack | check | clash |
 * might | scan);
 * check: the Skills of its Skill Check; clash: { skills, vs, multi, secret, oncePerTarget, penaltyPerTarget };
 * page / section: where its official text is.
 */
export const ADVENTURING_MANEUVERS = [
  // Universal Adventuring Maneuvers: every Character has them
  { key: "takeBreather", name: "Take a Breather", universal: true, limit: 1, time: "1 Hour", use: "breather" },
  { key: "rest", name: "Rest", universal: true, limit: 1, time: "8 Hours", use: "rest" },
  // Skilled Adventuring Maneuvers: 2+ Skill Ranks in the Skill
  { key: "stretch", name: "Stretch", skills: ["acrobatics"], limit: 1, time: "2 Minutes", use: "stretch" },
  { key: "pickpocket", name: "Pickpocket", skills: ["thievery"], limit: Infinity, time: "1 Minute", use: "clash",
    clash: { skills: ["thievery"], vs: ["perception", "thievery"], penaltyPerTarget: 3 } },
  { key: "obscure", name: "Obscure", skills: ["stealth"], limit: Infinity, time: "N/A", use: "clash",
    clash: { skills: ["stealth"], vs: ["perception"], multi: true } },
  { key: "tuneUp", name: "Tune Up", skills: ["craftVehicles"], limit: 1, time: "4 Hours", use: "info" },
  { key: "fullRepair", name: "Full Repair", skills: CRAFT, limit: 1, time: "2~10 Hours", use: "info" },
  { key: "create", name: "Create", skills: [...CRAFT, "medicine", "cooking"], limit: 1, time: "Varies", use: "check",
    check: [...CRAFT, "medicine", "cooking"], page: "crafting",
    sources: [{ type: "uniqueAbility", names: ["Magical Materialization"], check: ["useMagic"] }] },
  { key: "recall", name: "Recall", skills: KNOWLEDGE, limit: 1, time: "1 Minute", use: "info" },
  { key: "research", name: "Research", skills: KNOWLEDGE, limit: 1, time: "2 Hours", use: "check", check: KNOWLEDGE },
  { key: "care", name: "Care", skills: ["medicine"], limit: 1, time: "2 Hours", use: "care" },
  { key: "gauge", name: "Gauge", skills: ["clairvoyance"], limit: Infinity, time: "1 Minute", use: "clash",
    clash: { skills: ["clairvoyance"], vs: ["concealment"], oncePerTarget: true, reveal: true } },
  { key: "tame", name: "Tame", skills: ["creatureHandling"], limit: 1, time: "1 Day", use: "info" },
  { key: "powerRegulation", name: "Power Regulation", skills: ["concealment"], limit: Infinity, time: "N/A", use: "holdingBack" },
  { key: "profiling", name: "Profiling", skills: ["intuition"], limit: Infinity, time: "1 Minute", use: "clash",
    clash: { skills: ["intuition"], vs: ["bluff", "intuition"], oncePerTarget: true, secret: true } },
  { key: "scavenge", name: "Scavenge", skills: ["survival"], limit: 1, time: "2 Hours", use: "check", check: ["survival"] },
  { key: "scam", name: "Scam", skills: ["bluff"], limit: 1, time: "2 Hours", use: "info" },
  { key: "fraud", name: "Fraud", skills: ["bluff"], limit: 1, time: "4 Hours", use: "check", check: ["bluff"] },
  { key: "frighten", name: "Frighten", skills: ["intimidation"], limit: Infinity, time: "Instant", use: "clash",
    clash: { skills: ["intimidation"], vs: ["intuition", "intimidation"], oncePerTarget: true } },
  { key: "befriend", name: "Befriend", skills: ["persuasion"], limit: Infinity, time: "Instant", use: "clash",
    clash: { skills: ["persuasion"], vs: ["intuition", "persuasion"], oncePerTarget: true } },
  { key: "mingle", name: "Mingle", skills: ["persuasion"], limit: 1, time: "2 Hours", use: "info" },
  // Commander's Minion Collector gives it too, at half the Time Cost
  { key: "recruit", name: "Recruit", skills: ["persuasion"], limit: 1, time: "1 Day", use: "info",
    sources: [{ type: "transformation", names: ["Commander"], time: "12 Hours" }] },
  { key: "cook", name: "Cook", skills: ["cooking"], limit: Infinity, time: "1 Hour", use: "check", check: ["cooking"],
    page: "cooking", section: "Cook Maneuver" },
  // Given by items, Unique Abilities, Awakenings and Talents
  // Scan: a Scouter (equipped, or Integrated by Onboard Computer / 3D Scan Mode) or a Scout Scope (combat/scan.mjs)
  { key: "scan", name: "Scan", limit: null, time: null, use: "scan", page: "basic-items-accessories",
    sources: [{ type: "item", names: ["Scouter [Tech]", "Scouter"], pattern: /\bscouter\b/i, equipped: true, section: "Scouter [Tech]" },
      { type: "item", names: ["Scout Scope"], section: "Scout Scope" },
      { type: "racialTrait", names: ["Onboard Computer"] }, { type: "talent", names: ["3D Scan Mode"] }] },
  { key: "itemSearch", name: "Item Search", limit: null, time: null, use: "info", page: "basic-items-accessories",
    sources: [{ type: "item", names: ["Dragon Radar"], section: "Dragon Radar" }] },
  { key: "riceCooker", name: "Rice Cooker", limit: 1, time: "1 Hour", use: "info", page: "basic-items-accessories",
    sources: [{ type: "item", names: ["Rice Cooker"], section: "Rice Cooker" }] },
  { key: "teleport", name: "Teleport", limit: null, time: null, use: "info", page: "spirit-control",
    sources: [{ type: "uniqueAbility", names: ["Instant Transmission"], section: "Instant Transmission" }] },
  { key: "instantUnderstanding", name: "Instant Understanding", limit: null, time: null, use: "info", page: "unique-abilities",
    sources: [{ type: "uniqueAbility", names: ["Mind Reading"], section: "Mind Reading" }] },
  { key: "longDistancePortal", name: "Long Distance Portal", limit: null, time: null, use: "info", page: "unique-abilities",
    sources: [{ type: "uniqueAbility", names: ["Portal Creation"], section: "Portal Creation" }] },
  { key: "foresight", name: "Foresight", limit: null, time: null, use: "info", page: "unique-abilities",
    sources: [{ type: "uniqueAbility", names: ["Precognition"], section: "Precognition" }] },
  { key: "magicalSight", name: "Magical Sight", limit: null, time: null, use: "info", page: "unique-abilities",
    sources: [{ type: "uniqueAbility", names: ["Second Sight"], section: "Second Sight" }] },
  { key: "morph", name: "Morph", limit: null, time: null, use: "info", page: "unique-abilities",
    sources: [{ type: "uniqueAbility", names: ["Shapeshift"], section: "Shapeshift" }] },
  { key: "destroy", name: "Destroy", limit: null, time: null, use: "info", page: "power-of-destruction",
    sources: [{ type: "uniqueAbility", names: ["Hakai"], section: "Hakai" }] },
  { key: "starConsume", name: "Star Consume", limit: 1, time: "2 Days", use: "info", page: "big-gete-star-integration",
    sources: [{ type: "transformation", names: ["Big Gete Star Integration"] }] },
  { key: "replicateSelf", name: "Replicate Self", limit: Infinity, time: "1 Hour", use: "info", page: "big-gete-star-integration",
    sources: [{ type: "transformation", names: ["Big Gete Star Integration"] }] },
  { key: "robotFactory", name: "Robot Factory", limit: Infinity, time: "15 Minutes", use: "info", page: "big-gete-star-integration",
    sources: [{ type: "transformation", names: ["Big Gete Star Integration"] }] },
  // Roomy Biology: an Absorbed Character is removed through a Might Clash
  { key: "releaseAbsorbed", name: "Roomy Biology", limit: 2, time: "1 Minute", use: "might", page: "talents",
    sources: [{ type: "talent", names: ["Roomy Biology"], section: "Roomy Biology" }] }
];

export const ADVENTURING_BY_KEY = Object.fromEntries(ADVENTURING_MANEUVERS.map(m => [m.key, m]));

const norm = s => String(s ?? "").trim().toLowerCase();

/**
 * Does the character have this item (by name, a name pattern or the compendium section it came from), in use when it
 * must be?
 */
function hasSource(items, source) {
  const names = source.names.map(norm);
  return items.find(i => {
    if ( i.type !== source.type ) return false;
    if ( !names.includes(norm(i.name)) && !names.includes(norm(i.system?.source?.section))
      && !source.pattern?.test(i.name ?? "") ) return false;
    // An Awakening gives its Traits while it has Stacks; an Accessory only while equipped
    if ( (i.type === "transformation") && (i.system?.transType === "awakening") ) return (i.system?.stacks ?? 0) > 0;
    if ( (i.type === "item") && ((i.system?.quantity ?? 1) <= 0) ) return false;
    if ( source.equipped && (i.system?.itemType === "accessory") ) return !!i.system?.equipped;
    return true;
  }) ?? null;
}

/**
 * The Adventuring Maneuvers a character has, each with what gives it.
 * @param {{system: {skills: object}, items: Iterable<object>}} actor
 * @returns {Array<{def: object, via: string[], skills: string[], time: string|null}>}
 *   via: the Skills ("acrobatics") or item names that give it; skills: the Skills it can be rolled with
 */
export function availableAdventuringManeuvers(actor) {
  const skills = actor?.system?.skills ?? {};
  const items = Array.from(actor?.items ?? []);
  const out = [];
  for ( const def of ADVENTURING_MANEUVERS ) {
    const via = [];
    // The Skills its Skill Check can use: those that give it (the Craft Specialty with 2+ Ranks...) and the ones an
    // item allows (Magical Materialization: Use Magic)
    const rollWith = [];
    let time = def.time;
    if ( def.universal ) via.push("universal");
    for ( const key of def.skills ?? [] ) {
      if ( (skills[key]?.totalRanks ?? 0) < 2 ) continue;
      via.push(`skill:${key}`);
      if ( def.check?.includes(key) ) rollWith.push(key);
    }
    for ( const source of def.sources ?? [] ) {
      const item = hasSource(items, source);
      if ( !item ) continue;
      via.push(`item:${item.name}`);
      rollWith.push(...(source.check ?? []));
      // Commander's Minion Collector halves the Time Cost of Recruit
      if ( source.time ) time = source.time;
    }
    if ( !via.length ) continue;
    out.push({ def, via, skills: [...new Set(rollWith)], time });
  }
  return out;
}

/** Uses of an Adventuring Maneuver this Adventuring Session ([{key, n}] on the sheet). */
export function sessionUses(uses, key) {
  return (uses ?? []).find(u => u.key === key)?.n ?? 0;
}

/** The uses list with one more use of each key. */
export function addUses(uses, ...keys) {
  const list = (uses ?? []).map(u => ({ key: u.key, n: u.n }));
  for ( const key of keys ) {
    const u = list.find(x => x.key === key);
    if ( u ) u.n += 1;
    else list.push({ key, n: 1 });
  }
  return list;
}
