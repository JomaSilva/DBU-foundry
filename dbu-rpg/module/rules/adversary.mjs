import { isMinion } from "../fusion/fusion-rules.mjs";

/**
 * Adversaries (dbu-rpg.com/adversaries): the Adversary Table, by Adversary Category. p = PCC (Player Character Count),
 * bT = base Tier of Power.
 *  - lifePerPL / kiPerPL: Maximum Life / Ki Points gained for each Power Level reached;
 *  - apPerTop: Attribute Points at Character Creation for each base Tier of Power;
 *  - stamina: Narrative Stamina gained at the start of each Combat Round (lost at its end);
 *  - traits: Villainous Traits; karma: Villainous Karma at the start of each Combat Encounter;
 *  - oneManArmy: PCC Adversary Actions each Combat Round instead of 1 Counter Action.
 */
export const ADVERSARY_CATEGORIES = {
  standard: { lifePerPL: () => 1, kiPerPL: () => 1, apPerTop: () => 0, stamina: () => 0, traits: 0, karma: () => 0, oneManArmy: false },
  elite: {
    lifePerPL: p => p, kiPerPL: p => 2 * p, apPerTop: p => p, stamina: (p, bT) => p * 6 * bT, traits: 1,
    karma: p => Math.max(1, Math.floor(p / 2)), oneManArmy: true
  },
  villain: {
    lifePerPL: p => 2 * p, kiPerPL: p => 4 * p, apPerTop: p => 2 * p, stamina: (p, bT) => p * 12 * bT, traits: 2,
    karma: p => p, oneManArmy: true
  }
};

/** The started Combat Encounter an actor takes part in. */
export function encounterOfActor(actor) {
  return game.combats?.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor?.uuid)) ?? null;
}

/** Player Characters of a Combat Encounter: non-Minion Characters controlled by a player, each counted once. */
export function playerCharacterCount(combat) {
  const seen = new Set();
  for ( const c of combat?.combatants ?? [] ) {
    const a = c.actor;
    if ( !a || seen.has(a.uuid) || (a.type === "adversary") || !a.hasPlayerOwner || isMinion(a) ) continue;
    seen.add(a.uuid);
  }
  return seen.size;
}

/**
 * The PCC of an Adversary: the number on its sheet ("Fixo"), or the Player Characters of its Combat Encounter
 * ("Automático"; outside one, or with no Player Character in it, the number on the sheet).
 * @returns {{pcc: number, from: "manual"|"combat"|"sheet"}}
 */
export function adversaryPcc(actor, combat = null) {
  const a = actor.system?.adversary ?? {};
  const fixed = Math.max(1, a.pcc ?? 1);
  if ( a.pccMode === "manual" ) return { pcc: fixed, from: "manual" };
  // The Combat Encounter that is starting may not count as started yet
  const n = playerCharacterCount(combat ?? encounterOfActor(actor));
  return n ? { pcc: n, from: "combat" } : { pcc: fixed, from: "sheet" };
}

/** What an Adversary gets from its Category and PCC (derived data; null for other actors). */
export function adversaryInfo(actor, bT) {
  if ( actor.type !== "adversary" ) return null;
  const key = actor.system.adversary?.category ?? "villain";
  const cat = ADVERSARY_CATEGORIES[key] ?? ADVERSARY_CATEGORIES.villain;
  const { pcc, from } = adversaryPcc(actor);
  // Statstick (Villainous Trait): twice the Maximum Life and Ki Points of the Adversary Category
  const statstick = actor.items?.some(i => /^statstick$/i.test(i.name.trim()) && (i.system?.isActive ?? true)) ? 2 : 1;
  // 1-on-1 Duel (Villainous Maneuver): no Narrative Stamina nor One-Man Army while it lasts
  const oneOnOne = !!actor.flags?.["dbu-rpg"]?.oneOnOne?.active;
  return {
    category: key, pcc, from, oneOnOne,
    lifePerPL: cat.lifePerPL(pcc) * statstick, kiPerPL: cat.kiPerPL(pcc) * statstick, apPerTop: cat.apPerTop(pcc),
    staminaMax: oneOnOne ? 0 : cat.stamina(pcc, bT), traits: cat.traits, karma: cat.karma(pcc),
    oneManArmy: cat.oneManArmy && !oneOnOne
  };
}
