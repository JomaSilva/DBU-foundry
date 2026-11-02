import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { clearTimed, expireTimed, runTriggers } from "../combat/triggers.mjs";
import { clearRegeneratorInjuries } from "../combat/injuries.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

/**
 * Combat automation (runs only on the active GM's client):
 * - start of round: Capacity, Actions and Counter Actions reset, Diminishing Defense/Offense cleared, Power Advantage
 * - start of turn: Damage Over Time, Draining aspect, Straining reminder, Ki at 0 ends Transformations
 * - end of turn: Poisoned and Suffocating
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
    const parts = this._participants();
    const lines = [];
    for ( const p of parts ) {
      const sys = p.actor.system;
      if ( !sys?.top ) continue;
      // Power Advantage: base ToP higher than every Opponent's base ToP → +1 Action
      const opponents = parts.filter(o => (o !== p) && (o.disposition !== 0) && (o.disposition !== p.disposition)
        && (p.disposition !== 0));
      const advantage = opponents.length && opponents.every(o => (o.actor.system.top?.base ?? 1) < sys.top.base);
      let actions = sys.actionsPerRound + (advantage ? 1 : 0) - (sys.combat.reducedMomentum ? 1 : 0);
      actions = Math.max(0, actions);
      const roundKi = sys.roundKi ?? 0;
      if ( roundKi > 0 ) lines.push(L("DBU.Combat.RoundKi", { name: p.actor.name, n: roundKi }));
      await p.actor.update({
        "system.ki.value": Math.min(sys.ki.max, sys.ki.value + roundKi),
        "system.capacity.value": sys.capacity.max,
        "system.combat.actions": actions,
        "system.combat.counters": sys.countersPerRound,
        "system.combat.dimDefense": 0,
        "system.combat.attacksThisRound": 0,
        "system.combat.powerUps": 0,
        "system.combat.momentumUsed": false,
        "system.combat.reducedMomentum": false,
        "system.combat.absoluteAttacks": 0
      });
      if ( advantage ) lines.push(L("DBU.Combat.PowerAdvantage", { name: p.actor.name }));
    }
    lines.unshift(L("DBU.Combat.RoundReset"));
    await postInfoCard({ title: L("DBU.Combat.Round", { n: context.round }), lines, img: "icons/svg/combat.svg",
      whisper: game.users.filter(u => u.isGM).map(u => u.id) });
    // Start of Combat Round triggers (Namekian regeneration, Infinite Energy, Battle Born on even rounds...)
    for ( const p of parts ) await runTriggers(p.actor, "startOfRound", { round: context.round });
  }

  /** @override */
  async _onEndRound(context) {
    await super._onEndRound(context);
    if ( !this.automation ) return;
    for ( const p of this._participants() ) {
      await expireTimed(p.actor, "endOfRound");
      await runTriggers(p.actor, "endOfRound", { round: context.round });
    }
  }

  /** @override */
  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant, context);
    if ( !this.automation ) return;
    const actor = combatant.actor;
    if ( !actor?.system?.top ) return;
    // Timed States/Conditions "until the start of your next turn" end before anything else happens
    await expireTimed(actor, "startOfTurn");
    const sys = actor.system;
    const lines = [];
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
      const cost = 3 * T * sys.costs.draining;
      ki -= cost;
      lines.push(L("DBU.Turn.Draining", { cost }));
    }
    if ( life !== sys.life.value ) updates["system.life.value"] = (sys._effectiveStates?.undying > 0) ? life : Math.max(0, life);
    if ( ki !== sys.ki.value ) updates["system.ki.value"] = Math.max(0, ki);
    if ( Object.keys(updates).length ) await actor.update(updates, { dbuSelfInflicted: true });
    // No Energy: Ki at 0 ends every Form/Enhancement with Stress Exhaustion
    if ( (actor.system.ki.value <= 0) && actor.system.transformation.active.length ) {
      await actor.applyStressExhaustion();
      lines.push(L("DBU.Turn.NoEnergy"));
    }
    const buttons = [];
    if ( sys.flags.straining && sys.transformation.active.length ) {
      lines.push(L("DBU.Turn.Straining"));
      buttons.push({ action: "stressTest", label: L("DBU.Roll.Stress"), icon: "fa-solid fa-bolt", actorUuid: actor.uuid });
    }
    if ( sys.effectiveConditions.compelled ) lines.push(L("DBU.Turn.Compelled"));
    if ( sys.combat.power > 0 ) lines.push(L("DBU.Turn.Power", { n: sys.combat.power }));
    if ( lines.length ) await postInfoCard({ actor, title: L("DBU.Turn.Start", { name: actor.name }), lines, buttons });
    await runTriggers(actor, "startOfTurn", { round: context.round, turn: context.turn });
  }

  /** @override */
  async _onEndTurn(combatant, context) {
    await super._onEndTurn(combatant, context);
    if ( !this.automation ) return;
    const actor = combatant.actor;
    const sys = actor?.system;
    if ( !sys?.top ) return;
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
      await actor.update(updates);
      if ( updates["system.conditions.prone"] ) await actor.toggleStatusEffect("prone", { active: true }).catch(() => null);
    }
    if ( lines.length ) await postInfoCard({ actor, title: L("DBU.Turn.End", { name: actor.name }), lines });
    await expireTimed(actor, "endOfTurn");
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
    await runTriggers(c.actor, "startOfEncounter", { round: 0 });
  }
}

/** End of a Combat Encounter: Instant Recovery and reset of encounter trackers. */
export async function onCombatDeleted(combat) {
  if ( !game.user.isActiveGM || !game.settings.get("dbu-rpg", "combatAutomation") ) return;
  if ( !combat.started ) return;
  const done = new Set();
  const lines = [];
  for ( const c of combat.combatants ) {
    const actor = c.actor;
    if ( !actor?.system?.top || done.has(actor.uuid) ) continue;
    done.add(actor.uuid);
    await clearTimed(actor);
    await actor.resetEncounter({ instantRecovery: true });
    lines.push(L("DBU.Combat.InstantRecovery", { name: actor.name }));
    if ( await clearRegeneratorInjuries(actor) ) lines.push(L("DBU.Injury.RegenEncounter", { name: actor.name }));
  }
  if ( lines.length ) await postInfoCard({ title: L("DBU.Combat.End"), lines, img: "icons/svg/combat.svg" });
}
