import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { clearTimed, expireTimed, runTriggers } from "../combat/triggers.mjs";
import { clearRegeneratorInjuries } from "../combat/injuries.mjs";
import { fusionSkipTurn, fusionStartRound } from "../fusion/fusion.mjs";
import { fillDkp, noEnergy } from "../combat/divine.mjs";
import { heightEndOfTurn, heightStartOfRound, heightStartOfTurn } from "../combat/movement.mjs";
import { endGrapple, grappleOf } from "../combat/grapple.mjs";
import { defeatedLosesStacks, endEncounterStacks } from "../combat/awakening.mjs";
import { adversaryEncounterStart, adversaryRoundEnd, adversaryRoundStart } from "../combat/adversary.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

/**
 * Combat automation (runs only on the active GM's client):
 * - start of round: Capacity, Actions and Counter Actions reset, Diminishing Defense/Offense cleared, Power Advantage,
 *   Falling out of the High Environments
 * - start of turn: Damage Over Time, Draining aspect, Straining reminder, Ki at 0 ends Transformations, Verticality lost
 *   (Flight Optional Rule)
 * - end of turn: Poisoned and Suffocating, Heightened Gravity brings fliers down
 * - end of the encounter: Instant Recovery, Temporary Awakening Stacks (Level 2 removed, Level 1 decided by the GM)
 */
export class DBUCombat extends Combat {

  get automation() {
    return game.settings.get("dbu-rpg", "combatAutomation");
  }

  /** Unique actors taking part, with their token disposition. */
  _participants() {
    const seen = new Map();
    for ( const c of this.combatants ) {
      if ( !c.actor || seen.has(c.actor.uuid) ) continue;
      seen.set(c.actor.uuid, { actor: c.actor, disposition: c.token?.disposition ?? 0, combatant: c });
    }
    return Array.from(seen.values());
  }

  /** @override */
  async _onStartRound(context) {
    await super._onStartRound(context);
    if ( !this.automation ) return;
    if ( this.getFlag("dbu-rpg", "actAgainResume") ) await this.unsetFlag("dbu-rpg", "actAgainResume");
    const parts = this._participants();
    const lines = [];
    for ( const p of parts ) {
      // Adversaries: the PCC of this moment (Adversary Actions, Narrative Stamina)
      if ( p.actor.type === "adversary" ) p.actor.prepareData();
      const sys = p.actor.system;
      if ( !sys?.top ) continue;
      // Power Advantage: base ToP higher than every Opponent's base ToP → +1 Action
      const opponents = parts.filter(o => (o !== p) && (o.disposition !== 0) && (o.disposition !== p.disposition)
        && (p.disposition !== 0));
      // New Level of Power: the base Tier of Power counts as 1 higher for Power Advantage
      const paBase = a => (a.system.top?.base ?? 1) + (a.system.transformation?.newLevel ? 1 : 0);
      const advantage = opponents.length && opponents.every(o => paBase(o.actor) < paBase(p.actor));
      let actions = sys.actionsPerRound + (advantage ? 1 : 0) - (sys.combat.reducedMomentum ? 1 : 0);
      actions = Math.max(0, actions);
      const roundKi = sys.roundKi ?? 0;
      if ( roundKi > 0 ) lines.push(L("DBU.Combat.RoundKi", { name: p.actor.name, n: roundKi }));
      await p.actor.update({
        "system.ki.value": Math.min(sys.ki.cap ?? sys.ki.max, sys.ki.value + roundKi),
        "system.capacity.value": sys.capacity.max,
        "system.combat.actions": actions,
        "system.combat.counters": sys.countersPerRound,
        "system.combat.dimDefense": 0,
        "system.combat.attacksThisRound": 0,
        "system.combat.powerUps": 0,
        "system.combat.momentumUsed": false,
        "system.combat.reducedMomentum": false,
        "system.combat.absoluteAttacks": 0,
        // B5 @chargesRound / @surgesRound
        "system.combat.chargesRound": 0,
        "system.combat.surgesRound": 0,
        "system.combat.healingSurgesRound": 0
      }, { dbuSource: "regen" });
      if ( advantage ) lines.push(L("DBU.Combat.PowerAdvantage", { name: p.actor.name }));
      // Adversaries: Narrative Stamina for the round, Life and Ki Points following a new PCC
      const adv = adversaryRoundStart(p.actor);
      // "flag.noLifeRegain": a higher PCC raises the Maximum Life Points but not the current ones
      if ( p.actor.system.flags?.noLifeRegain && (adv.updates["system.life.value"] > p.actor.system.life.value) ) {
        delete adv.updates["system.life.value"];
      }
      if ( Object.keys(adv.updates).length ) await p.actor.update(adv.updates);
      lines.push(...adv.lines);
    }
    lines.unshift(L("DBU.Combat.RoundReset"));
    await postInfoCard({ title: L("DBU.Combat.Round", { n: context.round }), lines, img: "icons/svg/combat.svg",
      whisper: game.users.filter(u => u.isGM).map(u => u.id) });
    // Fusions: Round Limiter and their rolled Initiative after the first turn
    await fusionStartRound(this);
    // High Environments: characters who cannot fly go down a rank
    await heightStartOfRound(this);
    // Start of Combat Round triggers (Namekian regeneration, Infinite Energy, Battle Born on even rounds...)
    for ( const p of parts ) await runTriggers(p.actor, "startOfRound", { round: context.round });
  }

  /** @override */
  async _onEndRound(context) {
    await super._onEndRound(context);
    // E2 actAfter: the initiative moved for this Round only comes back
    if ( game.user.isActiveGM ) {
      // (CS2: the items an effect gave for this Combat Round go: Magical Mastery's Unique Ability)
      for ( const c of this.combatants ) {
        const a = c.actor;
        const ids = (a?.items ?? []).filter(i => i.flags?.["dbu-rpg"]?.roundTemp?.combat === this.id).map(i => i.id);
        if ( ids.length ) await a.deleteEmbeddedDocuments("Item", ids).catch(console.error);
      }
      for ( const c of this.combatants.filter(x => x.flags?.["dbu-rpg"]?.initRestore !== undefined) ) {
        await c.update({ initiative: c.flags["dbu-rpg"].initRestore, "flags.dbu-rpg.-=initRestore": null }).catch(console.error);
      }
    }
    if ( !this.automation ) return;
    for ( const p of this._participants() ) {
      await expireTimed(p.actor, "endOfRound");
      await runTriggers(p.actor, "endOfRound", { round: context.round });
      // Adversaries lose the Narrative Stamina left at the end of each Combat Round
      await adversaryRoundEnd(p.actor);
    }
  }

  /** @override */
  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant, context);
    if ( !this.automation ) return;
    const actor = combatant.actor;
    if ( !actor?.system?.top ) return;
    // Act Again (Villainous Maneuver): an extra turn whose Actions are the Adversary Actions
    if ( combatant.getFlag("dbu-rpg", "actAgain") ) {
      const { actAgainTurnStart } = await import("../combat/villainous.mjs");
      return actAgainTurnStart(combatant);
    }
    // ...and the turn it interrupted goes on after it, without starting again
    if ( this.getFlag("dbu-rpg", "actAgainResume") === combatant.id ) return this.unsetFlag("dbu-rpg", "actAgainResume");
    // A Fused Character that just split off skips its turn this Combat Round
    if ( await fusionSkipTurn(this, combatant) ) return;
    // Timed States/Conditions "until the start of your next turn" end before anything else happens
    await expireTimed(actor, "startOfTurn");
    // ...and so does what this character's effects caused on others "until the start of your next turn" (B3)
    for ( const p of this._participants() ) await expireTimed(p.actor, "startOfTurn", { source: actor.uuid });
    const lines = [];
    // Divine Ki Points come full when the access to them comes during the Combat Encounter
    if ( await fillDkp(actor, this) ) lines.push(L("DBU.Dkp.Filled", { n: actor.system.dkp.max }));
    const sys = actor.system;
    const updates = {};
    let life = sys.life.value;
    let ki = sys.ki.value;
    // Damage Over Time: 1(bT) per stack (Internal Major Injury keeps at least 4 stacks)
    const dot = Math.max(sys.combat.dot ?? 0, sys.dotMin ?? 0);
    if ( dot > 0 ) {
      const dmg = dot * sys.top.base;
      life -= dmg;
      lines.push(L("DBU.Turn.Dot", { n: dot, dmg }));
    }
    // Draining [LV]: 3(T) Ki per level, T = highest ToP Requirement among active Transformations
    if ( sys.costs.draining > 0 ) {
      const T = Math.max(1, sys.transformation.highestTopReq);
      // Q "draining.halve": half of it; "draining.life": Life Points instead of Ki Points (and no Divine Ki)
      const bk = k => (sys.buckets?.[k]?.total ?? 0) > 0;
      const cost = Math.floor(3 * T * sys.costs.draining / (bk("draining.halve") ? 2 : 1));
      const toLife = bk("draining.life");
      if ( toLife ) life -= cost;
      else ki -= cost;
      lines.push(L(toLife ? "DBU.Turn.DrainingLife" : "DBU.Turn.Draining", { cost }));
      // In the God Ki State it also takes Divine Ki Points: 1/2 of the Ki Points lost
      const divine = (sys.dkp?.usable && !toLife) ? Math.floor(cost / 2) : 0;
      if ( divine > 0 ) {
        updates["system.dkp.value"] = Math.max(0, sys.dkp.value - divine);
        lines.push(L("DBU.Turn.DrainingDkp", { n: divine }));
      }
    }
    if ( life !== sys.life.value ) updates["system.life.value"] = (sys._effectiveStates?.undying > 0) ? life : Math.max(0, life);
    if ( ki !== sys.ki.value ) updates["system.ki.value"] = Math.max(0, ki);
    // (FD: a DOT loss is Damage for the resource events)
    if ( Object.keys(updates).length ) await actor.update(updates, { dbuSelfInflicted: true, dbuSource: "dot", ...((dot > 0) ? { dbuEnvDamage: true } : {}) });
    // No Energy: Ki at 0 ends every Form/Enhancement with Stress Exhaustion (Divine Ki at 0, for God Ki ones)
    const empty = noEnergy(actor.system);
    if ( empty ) {
      await actor.applyStressExhaustion();
      lines.push(L(empty === "dkp" ? "DBU.Turn.NoEnergyDkp" : "DBU.Turn.NoEnergy"));
    }
    const buttons = [];
    if ( sys.flags.straining && sys.transformation.active.length ) {
      lines.push(L("DBU.Turn.Straining"));
      buttons.push({ action: "stressTest", label: L("DBU.Roll.Stress"), icon: "fa-solid fa-bolt", actorUuid: actor.uuid });
    }
    if ( sys.effectiveConditions.compelled ) {
      // (T8: no Ki Wager / no Life Point loss through Compelled)
      const noW = (sys.buckets?.["flag.compelledNoWager"]?.total ?? 0) > 0;
      const noL = (sys.buckets?.["flag.compelledNoLife"]?.total ?? 0) > 0;
      lines.push(L((noW && noL) ? "DBU.T8.CompelledNone" : (noW ? "DBU.T8.CompelledNoWager" : (noL ? "DBU.T8.CompelledNoLife" : "DBU.Turn.Compelled"))));
    }
    if ( sys.combat.power > 0 ) lines.push(L("DBU.Turn.Power", { n: sys.combat.power }));
    // Flight Optional Rule: the Verticality is lost at the start of the turn
    lines.push(...await heightStartOfTurn(combatant));
    if ( lines.length ) await postInfoCard({ actor, title: L("DBU.Turn.Start", { name: actor.name }), lines, buttons });
    // Absorption: a Defeated character loses every stack of it (6th effect of Assimilated Power)
    await defeatedLosesStacks(actor);
    await runTriggers(actor, "startOfTurn", { round: context.round, turn: context.turn });
    // F3 "otherTurnStart": the start of another Character's turn, for the other participants (other = whose turn it is)
    {
      const { fireEvent } = await import("../combat/triggers.mjs");
      for ( const p of this._participants() ) if ( p.actor && (p.actor !== actor) ) fireEvent(p.actor, "otherTurnStart", { other: actor });
    }
    // B5 @damagedSinceTurn counts again from the start of this turn (its Start of Turn triggers saw the old count)
    if ( actor.system.combat?.damagedSinceTurn ) await actor.update({ "system.combat.damagedSinceTurn": 0 });
  }

  /** @override */
  async _onEndTurn(combatant, context) {
    await super._onEndTurn(combatant, context);
    // (CS4: the one-use Signatures spent this turn go)
    if ( game.user.isActiveGM ) {
      const a = combatant.actor;
      const spent = (a?.items ?? []).filter(i => i.flags?.["dbu-rpg"]?.oneUseSpent).map(i => i.id);
      if ( spent.length ) await a.deleteEmbeddedDocuments("Item", spent).catch(console.error);
    }
    if ( !this.automation ) return;
    const actor = combatant.actor;
    const sys = actor?.system;
    if ( !sys?.top ) return;
    const V = await import("../combat/villainous.mjs");
    // Get Up!: the Adversary may attack that Character again; Act Again: the extra turn ends
    await V.getUpTurnEnded(this, actor);
    if ( combatant.getFlag("dbu-rpg", "actAgain") ) return V.actAgainTurnEnd(combatant);
    const lines = [];
    let life = sys.life.value;
    if ( sys.effectiveConditions.poisoned ) {
      const dmg = Math.floor(sys.life.max / 10);
      life -= dmg;
      lines.push(L("DBU.Turn.Poisoned", { dmg }));
    }
    if ( sys.effectiveConditions.suffocating ) {
      const dmg = Math.floor(sys.life.max / 5);
      life -= dmg;
      lines.push(L("DBU.Turn.Suffocating", { dmg }));
    }
    // Gravity: GI 3+ knocks you Prone at the end of your turn; GI 4+ also costs 1/4 of the Maximum Life Points
    const gi = sys.gravityIntensity ?? 0;
    const updates = {};
    if ( (gi >= 3) && !sys.effectiveConditions.prone ) {
      updates["system.conditions.prone"] = 1;
      lines.push(L("DBU.Turn.GravityProne", { gi }));
      if ( gi >= 4 ) {
        const dmg = Math.ceil(sys.life.max / 4);
        life -= dmg;
        lines.push(L("DBU.Turn.GravityDamage", { dmg }));
      }
    }
    if ( life !== sys.life.value ) updates["system.life.value"] = (sys._effectiveStates?.undying > 0) ? life : Math.max(0, life);
    if ( Object.keys(updates).length ) {
      // (FD: Suffocating and Gravity losses are Damage for the resource events)
      await actor.update(updates, (updates["system.life.value"] !== undefined) ? { dbuEnvDamage: true } : {});
      if ( updates["system.conditions.prone"] ) await actor.toggleStatusEffect("prone", { active: true }).catch(() => null);
    }
    lines.push(...await heightEndOfTurn(combatant));
    if ( lines.length ) await postInfoCard({ actor, title: L("DBU.Turn.End", { name: actor.name }), lines });
    await expireTimed(actor, "endOfTurn");
    // GS: the attacks from a Glass Soldier's Square (Warriors of Glass) end with the turn
    if ( actor.getFlag?.("dbu-rpg", "originFrom") ) await actor.unsetFlag("dbu-rpg", "originFrom").catch(() => null);
    // FC: a Final Chance still waiting for its attack ends with the turn
    if ( actor.getFlag?.("dbu-rpg", "finalChance") ) {
      const { finalChanceOver } = await import("../combat/attack.mjs");
      await finalChanceOver(actor).catch(console.error);
    }
    // What this character's effects caused "until the end of your turn" on others (Thrust, Collisions)
    for ( const p of this._participants() ) await expireTimed(p.actor, "endOfTurn", { source: actor.uuid });
    await runTriggers(actor, "endOfTurn", { round: context.round, turn: context.turn });
  }
}

/** Start of a Combat Encounter: "Triggered/Start of Combat Encounter" effects. */
export async function onCombatStart(combat) {
  if ( !game.user.isActiveGM || !game.settings.get("dbu-rpg", "combatAutomation") ) return;
  const done = new Set();
  for ( const c of combat.combatants ) {
    if ( !c.actor || done.has(c.actor.uuid) ) continue;
    done.add(c.actor.uuid);
    // A New Level of Power only lasts for the encounter it happened in (one gained before "Begin Combat" stays)
    const stale = c.actor.items.filter(i => (i.type === "transformation") && i.system.newLevel
      && (i.flags?.["dbu-rpg"]?.newLevelCombat !== combat.id))
      .map(i => ({ _id: i.id, "system.newLevel": false }));
    // So does a Grand Awakening, and the Burst Limit used (both may happen right before "Begin Combat")
    for ( const i of c.actor.items ) {
      if ( (i.type === "transformation") && i.system.grandAwakening && (i.flags?.["dbu-rpg"]?.grandCombat !== combat.id) ) {
        stale.push({ _id: i.id, "system.grandAwakening": false });
      }
    }
    if ( stale.length ) await c.actor.updateEmbeddedDocuments("Item", stale);
    if ( c.actor.system.combat?.burstUsed && (c.actor.flags?.["dbu-rpg"]?.burstCombat !== combat.id) ) {
      await c.actor.update({ "system.combat.burstUsed": false });
    }
    // Divine Ki Points: every Combat Encounter starts with the maximum
    await fillDkp(c.actor, combat);
    // Stretch (Adventuring Maneuver) done within the hour: +1(T) Combat Rolls for the first 3 Combat Rounds
    const { applyStretch } = await import("../adventure.mjs");
    const stretched = await applyStretch(c.actor);
    if ( stretched ) await postInfoCard({ actor: c.actor, title: "Stretch", lines: [stretched] });
    // Adversaries: Life and Ki Points for the PCC of this encounter, Villainous Karma
    await adversaryEncounterStart(c.actor, combat);
    await runTriggers(c.actor, "startOfEncounter", { round: 0 });
  }
}

/** End of a Combat Encounter: Instant Recovery and reset of encounter trackers. */
export async function onCombatDeleted(combat) {
  // (F14: the Characters that switched to their Avatar come back)
  if ( game.user.isActiveGM ) {
    try { const AV = await import("../combat/avatar.mjs"); await AV.endAvatars(combat); } catch(err) { console.error("DBU | Avatars", err); }
  }
  if ( !game.user.isActiveGM || !game.settings.get("dbu-rpg", "combatAutomation") ) return;
  if ( !combat.started ) return;
  const done = new Set();
  const actors = [];
  const lines = [];
  for ( const c of combat.combatants ) {
    const actor = c.actor;
    if ( !actor?.system?.top || done.has(actor.uuid) ) continue;
    done.add(actor.uuid);
    actors.push(actor);
    await clearTimed(actor);
    // (CS2 "endOfEncounter": the Combat Encounter is over: Fluid Physique's Mass)
    try { await runTriggers(actor, "endOfEncounter", {}); } catch(err) { console.error("DBU | endOfEncounter", err); }
    // (F13: the items an effect made for this Combat Encounter: Inherited Creativity's Signature Technique)
    const temp = actor.items.filter(i => i.flags?.["dbu-rpg"]?.encounterTemp === combat.id).map(i => i.id);
    if ( temp.length ) await actor.deleteEmbeddedDocuments("Item", temp).catch(console.error);
    if ( grappleOf(actor) ) await endGrapple(actor);
    await actor.resetEncounter({ instantRecovery: true });
    lines.push(L("DBU.Combat.InstantRecovery", { name: actor.name }));
    if ( await clearRegeneratorInjuries(actor) ) lines.push(L("DBU.Injury.RegenEncounter", { name: actor.name }));
  }
  // GP From Goop (8): the Goops die at the end of the encounter, their owner regains 1/2 of their Life Points
  for ( const actor of actors ) {
    if ( !actor.items?.some(i => (i.type === "racialTrait") && /^from goop$/i.test(i.name)) ) continue;
    const { goopsOf, reabsorbGoops } = await import("../combat/minions.mjs");
    if ( goopsOf(actor).length ) lines.push(`${actor.name}: ${await reabsorbGoops(actor, Infinity, { pick: false })}`);
  }
  if ( lines.length ) await postInfoCard({ title: L("DBU.Combat.End"), lines, img: "icons/svg/combat.svg" });
  // Temporary Awakenings: Level 2 ones go, the GM decides about Level 1 ones
  for ( const actor of actors ) await endEncounterStacks(actor);
}
