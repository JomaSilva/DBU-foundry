import { postInfoCard } from "../dice/roller.mjs";
import { ADVERSARY_CATEGORIES, adversaryPcc, encounterOfActor } from "../rules/adversary.mjs";

/**
 * Adversaries in combat (dbu-rpg.com/adversaries): Narrative Stamina each Combat Round, Villainous Karma each Combat
 * Encounter, Life and Ki Points that follow the PCC, Narrative Stamina spent before Ki Points and against Damage, and
 * the Adversary Actions of One-Man Army.
 */
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const isAdversary = actor => actor?.type === "adversary";
const gmWhisper = () => game.users.filter(u => u.isGM).map(u => u.id);

/**
 * The PCC changed (a Combat Encounter began, a Player Character joined or left): the Maximum Life and Ki Points change
 * with it, and the current ones by the same amount, so an Adversary at full stays at full.
 * @returns {{updates: object, line: string|null}}
 */
export function rescaleForPcc(actor) {
  const sys = actor.system;
  const a = sys.adversary;
  const cat = ADVERSARY_CATEGORIES[a.category] ?? ADVERSARY_CATEGORIES.villain;
  const { pcc } = adversaryPcc(actor);
  const before = (a.pccApplied > 0) ? a.pccApplied : Math.max(1, a.pcc);
  if ( pcc === before ) return { updates: (a.pccApplied > 0) ? {} : { "system.adversary.pccApplied": pcc }, line: null };
  const pl = sys.pl ?? 1;
  const lifeDelta = (cat.lifePerPL(pcc) - cat.lifePerPL(before)) * pl;
  const kiDelta = (cat.kiPerPL(pcc) - cat.kiPerPL(before)) * pl * (sys.transformation?.kiMultiplier ? 2 : 1);
  return {
    updates: {
      "system.adversary.pccApplied": pcc,
      "system.life.value": Math.max(0, sys.life.value + lifeDelta),
      "system.ki.value": Math.max(0, sys.ki.value + kiDelta)
    },
    line: L("DBU.Adversary.PccChanged", { name: actor.name, from: before, to: pcc, life: signed(lifeDelta), ki: signed(kiDelta) })
  };
}

const signed = n => (n >= 0 ? `+${n}` : `${n}`);

/** Start of a Combat Round: Narrative Stamina for the round, and the PCC checked again. Fields for the round update. */
export function adversaryRoundStart(actor) {
  if ( !isAdversary(actor) ) return { updates: {}, lines: [] };
  const { updates, line } = rescaleForPcc(actor);
  const info = actor.system.adversaryInfo;
  const stamina = info?.staminaMax ?? 0;
  updates["system.adversary.stamina"] = stamina;
  const lines = line ? [line] : [];
  if ( stamina > 0 ) lines.push(L("DBU.Adversary.StaminaGained", { name: actor.name, n: stamina }));
  if ( info?.oneManArmy ) lines.push(L("DBU.Adversary.ActionsGained", { name: actor.name, n: actor.system.countersPerRound }));
  return { updates, lines };
}

/** End of a Combat Round: the Narrative Stamina left is lost. */
export async function adversaryRoundEnd(actor) {
  if ( !isAdversary(actor) || !(actor.system.adversary.stamina > 0) ) return;
  await actor.update({ "system.adversary.stamina": 0 });
}

/**
 * Start of a Combat Encounter: Villainous Karma (Villain: PCC; Elite: 1/2 PCC, at least 1), for the PCC of that
 * encounter (it may not count as started yet). The Life and Ki Points follow the PCC at the start of the 1st Round.
 */
export async function adversaryEncounterStart(actor, combat = null) {
  if ( !isAdversary(actor) ) return;
  const cat = ADVERSARY_CATEGORIES[actor.system.adversary.category] ?? ADVERSARY_CATEGORIES.villain;
  const { pcc, from } = adversaryPcc(actor, combat);
  const karma = cat.karma(pcc);
  const updates = { "system.adversary.karmaOut": "" };
  const lines = [L("DBU.Adversary.PccInfo", { pcc, from: L(`DBU.Adversary.From.${from}`) })];
  if ( karma > 0 ) {
    updates["system.karma.value"] = (actor.system.karma.value ?? 0) + karma;
    lines.push(L("DBU.Adversary.KarmaGained", { name: actor.name, n: karma }));
  }
  await actor.update(updates);
  await postInfoCard({ actor, title: L("DBU.Adversary.EncounterTitle", { name: actor.name }), lines, whisper: gmWhisper() });
}

/** The Adversary ran out of Karma Points in a Combat Encounter: it regains 1/4 of its Maximum Life and Ki Points (once). */
export async function villainousKarmaOut(actor) {
  const combat = encounterOfActor(actor);
  if ( !combat || (actor.system.adversary.karmaOut === combat.id) ) return;
  const sys = actor.system;
  const life = Math.floor(sys.life.max / 4);
  const ki = Math.floor(sys.ki.max / 4);
  await actor.update({
    ...(sys.flags?.noLifeRegain ? {} : { "system.life.value": Math.min(sys.life.cap ?? sys.life.max, sys.life.value + life) }),
    "system.ki.value": Math.min(sys.ki.cap ?? sys.ki.max, sys.ki.value + ki),
    "system.adversary.karmaOut": combat.id
  });
  await postInfoCard({ actor, title: L("DBU.Adversary.KarmaOutTitle"), lines: [L("DBU.Adversary.KarmaOut", { name: actor.name, life, ki })] });
}

/**
 * Pay Ki Points with Narrative Stamina first (when the sheet says so).
 * @returns {{fromStamina: number, fromKi: number}}
 */
export function staminaPayment(actor, kp, use = true) {
  const a = actor?.system?.adversary;
  if ( !isAdversary(actor) || !use || !a?.staminaPays || !(a.stamina > 0) || !(kp > 0) ) return { fromStamina: 0, fromKi: kp };
  const fromStamina = Math.min(a.stamina, kp);
  return { fromStamina, fromKi: kp - fromStamina };
}

/**
 * Narrative Stamina reduces the Life Points lost to Damage by the same amount (when the sheet says so).
 * @returns {{damage: number, absorbed: number, stamina: number|null}}
 */
export function staminaAbsorb(actor, damage) {
  const a = actor?.system?.adversary;
  if ( !isAdversary(actor) || !a?.staminaAbsorbs || !(a.stamina > 0) || !(damage > 0) ) return { damage, absorbed: 0, stamina: null };
  const absorbed = Math.min(a.stamina, damage);
  return { damage: damage - absorbed, absorbed, stamina: a.stamina - absorbed };
}

/** Without Capacity: the Adversary neither spends nor checks Capacity. */
export function ignoresCapacity(actor) {
  return isAdversary(actor) && !!actor.system.adversary?.ignoreCapacity;
}

/** One-Man Army: 2 Adversary Actions to use a 1-Action Standard Maneuver as an Instant Maneuver (an Action now). */
export async function adversaryInstant(actor) {
  const sys = actor.system;
  if ( !sys.adversaryInfo?.oneManArmy ) return ui.notifications.warn(L("DBU.Adversary.NoOneManArmy"));
  if ( (sys.combat.counters ?? 0) < 2 ) return ui.notifications.warn(L("DBU.Adversary.NoActions"));
  await actor.update({ "system.combat.counters": sys.combat.counters - 2, "system.combat.actions": (sys.combat.actions ?? 0) + 1 });
  return postInfoCard({ actor, title: L("DBU.Adversary.InstantTitle"), lines: [L("DBU.Adversary.Instant", { name: actor.name })] });
}

/** Sheets of the Adversaries of a combat show the PCC of that moment. */
export function refreshAdversaries(combat, extra = []) {
  const actors = new Map();
  for ( const c of combat?.combatants ?? [] ) if ( isAdversary(c.actor) ) actors.set(c.actor.uuid, c.actor);
  for ( const a of extra ) if ( isAdversary(a) ) actors.set(a.uuid, a);
  for ( const actor of actors.values() ) {
    actor.prepareData();
    if ( actor.sheet?.rendered ) actor.sheet.render();
  }
}
