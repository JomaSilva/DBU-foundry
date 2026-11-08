import { DBU } from "../config.mjs";
import { dbuRoll, postInfoCard } from "../dice/roller.mjs";
import { openAttackDialog, applyDamageToActor, signatureAllowed } from "../combat/attack.mjs";
import { categoryToDice } from "../rules/dice.mjs";
import { addTimedCondition, addTimedPower, dropTimedPower, encounterOf, inCombat, renewTimedPower } from "../combat/triggers.mjs";
import { fireEvent, resourceEvent, triggerData, triggerUsesLeft, useTriggerLimit } from "../combat/triggers.mjs";
import { footLegProne, offerRegeneratorRemoval } from "../combat/injuries.mjs";
import { joinTerms, modifierTerms } from "../rules/modifiers.mjs";
import { collectModifiers } from "../rules/modifiers.mjs";
import { evaluate, rollExpression, test } from "../rules/formula.mjs";
import { resourceSlug } from "../rules/resources.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const { DialogV2 } = foundry.applications.api;

export class DBUActor extends Actor {

  /** Boss villains (and Adversaries set so) may enter Transformations whose Tier of Power Requirement is above their own. */
  get isBoss() {
    return ((this.type === "npc") && (this.system.npcType === "boss"))
      || ((this.type === "adversary") && !!this.system.adversary?.aboveTop);
  }

  /** @override */
  getRollData() {
    return this.system.getRollData?.() ?? super.getRollData();
  }

  /** @override */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    const updates = {};
    // Characters and Fusions are always linked: a Fusion's Round Limiter lives on the actor
    const linked = ["character", "fusion"].includes(this.type);
    if ( !data.prototypeToken?.actorLink && linked ) updates["prototypeToken.actorLink"] = true;
    if ( linked ) updates["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
    updates["prototypeToken.bar1"] = { attribute: "life" };
    updates["prototypeToken.bar2"] = { attribute: "ki" };
    // A new character starts with full Life Points, Ki Points and Capacity
    for ( const pool of ["life", "ki", "capacity"] ) {
      const max = this.system[pool]?.max ?? 0;
      if ( !foundry.utils.hasProperty(data, `system.${pool}.value`) && (max > 0) ) updates[`system.${pool}.value`] = max;
    }
    this.updateSource(updates);
  }

  /** Remember the Life Points before an update so thresholds can be processed. */
  async _preUpdate(changed, options, user) {
    if ( (await super._preUpdate(changed, options, user)) === false ) return false;
    if ( foundry.utils.hasProperty(changed, "system.life.value") ) {
      options.dbuOldLife = this.system.life.value;
      options.dbuLifeMax = this.system.life.max;
      // B5 @damagedSinceTurn: an attack's damage took Life Points during a Combat Encounter
      if ( options.dbuDamage && (Number(foundry.utils.getProperty(changed, "system.life.value")) < this.system.life.value) && inCombat(this) ) {
        foundry.utils.setProperty(changed, "system.combat.damagedSinceTurn", (this.system.combat?.damagedSinceTurn ?? 0) + 1);
      }
    }
    // B2: the Ki Points before the update (resource events); B3: the State levels before it ("stateLeave")
    if ( foundry.utils.hasProperty(changed, "system.ki.value") ) options.dbuOldKi = this.system.ki.value;
    const states = foundry.utils.getProperty(changed, "system.states");
    if ( states && (typeof states === "object") ) {
      options.dbuOldStates = Object.fromEntries(Object.keys(states).map(k => [k, this.system._source?.states?.[k] ?? 0]));
    }
    // Clamp current pools to their maximums (Capacity Rate is handled by the actions themselves)
    for ( const pool of ["ki", "capacity"] ) {
      const path = `system.${pool}.value`;
      if ( foundry.utils.hasProperty(changed, path) ) {
        const v = foundry.utils.getProperty(changed, path);
        // (T6: Ki Points up to sys.ki.cap, "kiOverMax")
        const max = ((pool === "ki") ? (this.system.ki?.cap ?? this.system.ki?.max) : this.system[pool]?.max) ?? v;
        if ( v > max && !options.dbuAllowOver ) foundry.utils.setProperty(changed, path, max);
        if ( v < 0 ) foundry.utils.setProperty(changed, path, 0);
      }
    }
    // Scout Scope: a Concealment success stops protecting once the Holding Back stacks go below the number they were
    const scopeHidden = this.getFlag("dbu-rpg", "scanHidden")?.scope;
    if ( scopeHidden && foundry.utils.hasProperty(changed, "system.combat.holdingBack")
      && (Number(foundry.utils.getProperty(changed, "system.combat.holdingBack")) < (scopeHidden.holdingBack ?? 0)) ) {
      foundry.utils.setProperty(changed, "flags.dbu-rpg.scanHidden.scope", null);
    }
    // G3: the Counter Actions and the Holding Back stacks before the update ("counterSpent", "holdingBackGain/Loss")
    if ( foundry.utils.hasProperty(changed, "system.combat.counters") ) options.dbuOldCounters = this.system.combat?.counters ?? 0;
    if ( foundry.utils.hasProperty(changed, "system.combat.holdingBack") ) options.dbuOldHoldingBack = this.system._source?.combat?.holdingBack ?? 0;
    // Villainous Karma: when an Adversary runs out of Karma Points it regains Life and Ki Points (_onUpdate)
    if ( foundry.utils.hasProperty(changed, "system.karma.value") ) options.dbuOldKarma = this.system.karma.value;
    // A Fusion may use the Karma Points of all of its Fused Characters; an Adversary has no limit
    if ( foundry.utils.hasProperty(changed, "system.karma.value") && !["fusion", "adversary"].includes(this.type) ) {
      const v = foundry.utils.getProperty(changed, "system.karma.value");
      if ( v > 4 ) {
        foundry.utils.setProperty(changed, "system.karma.value", 4);
        ui.notifications.warn(L("DBU.Val.Karma"));
      }
    }
  }

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( userId !== game.user.id ) return;
    if ( options.dbuOldLife !== undefined ) {
      const now = this.system.life.value;
      // (FC: a Final Chance keeps its Health Thresholds and its Defeat until its attack is over)
      if ( options.dbuFinalChance ) this.setFlag("dbu-rpg", "finalChance", { oldLife: options.dbuOldLife }).catch(console.error);
      else if ( now !== options.dbuOldLife ) this._processThresholds(options.dbuOldLife, now, options).catch(console.error);
    }
    if ( (this.type === "adversary") && (options.dbuOldKarma > 0) && (this.system.karma.value === 0) && !options.dbuEncounterEnd ) {
      import("../combat/adversary.mjs").then(m => m.villainousKarmaOut(this)).catch(console.error);
    }
    // B2: Life / Ki Points the system changed (a trigger, a cost, a Maneuver, an attack's damage...); never the sheet's own
    // edits, the encounter reset or the effects of a resource event's own triggers
    if ( (options.dbuSource || options.dbuDamage) && !options.dbuResEvent && !options.dbuEncounterEnd ) {
      this._poolEvents(options).catch(console.error);
    }
    // G3: Counter Actions spent during a Combat Encounter (not the new round's, the encounter reset or a swap of Actions)
    if ( (options.dbuOldCounters !== undefined) && !options.dbuEncounterEnd && !options.dbuNoSpend && inCombat(this) ) {
      const n = options.dbuOldCounters - (this.system.combat?.counters ?? 0);
      if ( n > 0 ) fireEvent(this, "counterSpent", { scope: { n, countersLeft: this.system.combat?.counters ?? 0 } });
    }
    // G3: Holding Back stacks gained or lost (on the sheet too; not the encounter reset)
    if ( (options.dbuOldHoldingBack !== undefined) && !options.dbuEncounterEnd && !options.dbuNoHoldingBackEvent ) {
      const now = this.system._source?.combat?.holdingBack ?? 0;
      const d = now - options.dbuOldHoldingBack;
      if ( d > 0 ) fireEvent(this, "holdingBackGain", { scope: { n: d, holdingBackLeft: now } });
      else if ( d < 0 ) fireEvent(this, "holdingBackLoss", { scope: { n: -d, holdingBackLeft: now, allLost: now === 0 ? 1 : 0 } });
    }
    // B3: a State went down to 0 (not the encounter reset, nor a stateLeave trigger's own effect)
    if ( options.dbuOldStates && !options.dbuNoLeave && !options.dbuEncounterEnd ) this._stateLeave(options.dbuOldStates);
    // E3: "leaveWhen" and the Grand Trigger are checked after every change (not the encounter reset)
    if ( !options.dbuEncounterEnd ) this._scheduleRuleCheck();
    this._notifyNewProblems();
  }

  /**
   * E3: check the Transformation rules that wait for a change of the character ("leaveWhen", the Grand Trigger of an
   * Awakening: rules/transform-rules.mjs checkTransformRules) once the current change is over. Never while the
   * Transformation Maneuver runs (it checks at its end), never twice at once.
   */
  _scheduleRuleCheck() {
    if ( this._dbuTransforming || this._dbuRuleCheck || !this.isOwner ) return;
    if ( !(this.items ?? []).some(i => (i.type === "transformation") && (i.system?.modifiers ?? [])
      .some(m => ["leaveWhen", "grandTrigger"].includes(m?.target))) ) return;
    this._dbuRuleCheck = true;
    setTimeout(async () => {
      try {
        const { checkTransformRules } = await import("../rules/transform-rules.mjs");
        await checkTransformRules(this);
      } catch(err) {
        console.error("DBU | Transformation rules", err);
      } finally {
        this._dbuRuleCheck = false;
      }
    }, 0);
  }

  /**
   * E1: the Defeated status went away (removed by hand or by an effect, by Undying, or by Life Points above 0):
   * "defeatEnd" (@byLife, @byUndying, @byStatus).
   * @override
   */
  async toggleStatusEffect(statusId, options = {}) {
    const id = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
    const was = (statusId === id) && !!this.statuses?.has?.(id);
    const result = await super.toggleStatusEffect(statusId, options);
    if ( was && !this.statuses?.has?.(id) ) {
      const by = this._dbuDefeatEndBy || "status";
      delete this._dbuDefeatEndBy;
      this._defeatEnd(by);
    }
    return result;
  }

  /** E1 "defeatEnd": `by` = "life" (Life Points above 0), "undying" (entering Undying ended it) or "status". */
  _defeatEnd(by = "status") {
    fireEvent(this, "defeatEnd", { scope: { byLife: (by === "life") ? 1 : 0, byUndying: (by === "undying") ? 1 : 0,
      byStatus: (by === "status") ? 1 : 0 } });
  }

  /**
   * E1: Life Points back above 0 while Defeated: the Defeated status goes (which fires "defeatEnd"); without the status
   * (0 Life Points, not Undying) the event fires by itself.
   */
  async _endDefeatByLife() {
    const id = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
    if ( this.statuses?.has?.(id) ) {
      this._dbuDefeatEndBy = "life";
      await Promise.resolve(this.toggleStatusEffect(id, { active: false })).catch(() => null);
      // A toggle that did not go through DBUActor.toggleStatusEffect: the event still fires once
      if ( this._dbuDefeatEndBy ) {
        delete this._dbuDefeatEndBy;
        this._defeatEnd("life");
      }
    }
    else if ( !((this.system._effectiveStates?.undying ?? 0) > 0) ) this._defeatEnd("life");
  }

  /** B2: the resource events of the Life and Ki Points an update changed (options.dbuWanted: what was wanted before caps). */
  async _poolEvents(options) {
    const via = options.dbuSource ?? (options.dbuDamage ? "damage" : "");
    for ( const [pool, old] of [["life", options.dbuOldLife], ["ki", options.dbuOldKi]] ) {
      if ( old === undefined ) continue;
      const d = (this.system[pool]?.value ?? 0) - old;
      const wanted = Number(options.dbuWanted?.[pool] ?? 0);
      if ( (d > 0) || ((d === 0) && (wanted > 0)) ) await resourceEvent(this, "gain", { slug: pool, n: d, wanted: Math.max(d, wanted), via });
      else if ( d < 0 ) await resourceEvent(this, "spend", { slug: pool, n: -d, via, damage: !!options.dbuDamage || !!options.dbuEnvDamage });
    }
  }

  /** B3: "stateLeave" for each State that went from a level to 0 (@state_<key> = 1, @level = the level it had). */
  _stateLeave(old) {
    for ( const [key, before] of Object.entries(old) ) {
      if ( (before > 0) && !((this.system._source?.states?.[key] ?? 0) > 0) ) {
        fireEvent(this, "stateLeave", { scope: { [`state_${key}`]: 1, level: before } });
      }
    }
  }

  /** Show a toast with rule problems introduced by the user's last edit. */
  _notifyNewProblems() {
    if ( !game.settings.get("dbu-rpg", "validationToasts") ) return;
    const errors = (this.system.validation ?? []).filter(v => v.level === "error").map(v => v.message);
    const key = errors.join("|");
    if ( key === this._lastErrorKey ) return;
    const previous = new Set((this._lastErrorKey ?? "").split("|"));
    this._lastErrorKey = key;
    const fresh = errors.filter(e => !previous.has(e));
    if ( fresh.length ) ui.notifications.warn(`${this.name}: ${fresh.slice(0, 3).join(" · ")}${fresh.length > 3 ? " …" : ""}`);
  }

  /* -------------------------------------------- */
  /*  Health Thresholds                           */
  /* -------------------------------------------- */

  async _processThresholds(oldLife, newLife, options = {}) {
    const max = options.dbuLifeMax ?? this.system.life.max;
    const updates = {};
    const fractions = this.system.thresholdFractions ?? DBU.THRESHOLD_FRACTIONS;
    // Rising above a Health Threshold removes its Steadfast mark
    if ( newLife > oldLife ) {
      for ( const k of DBU.thresholds ) {
        if ( (newLife > max * fractions[k]) && this.system.thresholds[k] ) updates[`system.thresholds.${k}`] = "";
      }
      if ( Object.keys(updates).length ) await this.update(updates);
      // B3: back above 0 Life Points, a new Defeat fires "allyDefeated" again
      if ( (newLife > 0) && this.getFlag("dbu-rpg", "defeatFired") ) await this.unsetFlag("dbu-rpg", "defeatFired");
      // E1: back above 0 Life Points, the Defeat ends ("defeatEnd"); not with the Instant Recovery of the encounter's end
      // (RC "lifeFloor": the Defeat came at −lifeFloor)
      const floorNow = this.system.lifeFloor ?? 0;
      if ( (oldLife <= -floorNow) && (newLife > 0) && !options.dbuEncounterEnd && !options.dbuUndyingSet ) await this._endDefeatByLife();
      return;
    }
    const crossed = DBU.thresholds.filter(k => (oldLife > max * fractions[k]) && (newLife <= max * fractions[k]));
    // RC "lifeFloor": below 0 Life Points, the Defeat comes on reaching −lifeFloor (no Threshold is crossed then)
    const floor = this.system.lifeFloor ?? 0;
    const floorReached = (floor > 0) && (oldLife > -floor) && (newLife <= -floor);
    if ( !crossed.length && !floorReached ) return;
    const self = !!options.dbuDamage?.selfInflicted || !!options.dbuSelfInflicted;
    const lines = [];
    const defeated = (newLife <= -floor) && !((this.system._effectiveStates?.undying ?? 0) > 0);
    const flags = this.system.flags ?? {};
    const autoPassBruised = flags.autoPassBruised;
    // "flag.autoPassSteadfast": every Health Threshold Steadfast Check succeeds (it wins over "flag.autoFailSteadfast");
    // V: a safe loss (dbuSafeLoss: "safelife" costs, a "life" effect with resource "safe") passes them too
    const safe = !!options.dbuSafeLoss;
    const autoPass = k => safe || ((k === "bruised") && autoPassBruised) || !!flags.autoPassSteadfast;
    let anyFail = false;
    let lowestResult = null;

    if ( defeated ) {
      for ( const k of crossed ) {
        const pass = autoPass(k);
        updates[`system.thresholds.${k}`] = pass ? "pass" : "fail";
        anyFail ||= !pass;
      }
      lines.push(L("DBU.Threshold.DefeatedAll"));
    }
    else {
      // Massive Damage: every Threshold except the lowest is an automatic failure
      const lowest = crossed[crossed.length - 1];
      for ( const k of crossed.slice(0, -1) ) {
        const pass = autoPass(k);
        updates[`system.thresholds.${k}`] = pass ? "pass" : "fail";
        anyFail ||= !pass;
        lines.push(L(pass ? "DBU.Threshold.AutoPass" : "DBU.Threshold.AutoFail", { t: L(`DBU.Threshold.${k}`) }));
      }
      if ( autoPass(lowest) ) {
        updates[`system.thresholds.${lowest}`] = "pass";
        lines.push(L("DBU.Threshold.AutoPass", { t: L(`DBU.Threshold.${lowest}`) }));
      }
      // "flag.autoFailSteadfast": the Steadfast Check fails without a roll
      else if ( flags.autoFailSteadfast ) {
        updates[`system.thresholds.${lowest}`] = "fail";
        anyFail = true;
        lines.push(L("DBU.Threshold.AutoFailEffect", { t: L(`DBU.Threshold.${lowest}`) }));
      }
      else {
        // A1/B: the attacker's "vs.steadfast" pieces (rules/versus.mjs) change the Steadfast Check of the Character it knocked;
        // C3: the attacker is the Check's other Character (roll reactions)
        let by = options.dbuDamage?.attackerUuid ? await Promise.resolve(fromUuid(options.dbuDamage.attackerUuid)).catch(() => null) : null;
        if ( by?.documentName === "Token" ) by = by.actor;
        const penalty = (by ? await versusSteadfast(by, this, options.dbuDamage?.scope ?? {}) : 0) - (by ? await foeGuardSteadfast(this, by) : 0);
        lowestResult = await this.rollSteadfast({ threshold: lowest, silent: false, ...(penalty ? { penalty } : {}), ...(by ? { other: by } : {}) });
        updates[`system.thresholds.${lowest}`] = lowestResult.success ? "pass" : "fail";
        anyFail ||= !lowestResult.success;
      }
    }
    await this.update(updates);
    // Dauntless (Villainous Trait) and "flag.noReducedMomentum": no Reduced Momentum
    const V = await import("../combat/villainous.mjs");
    // (T29 dbuNoMomentum: this one loss gives no Reduced Momentum, its Steadfast Checks are still rolled)
    if ( self && !safe && !options.dbuNoMomentum && game.combat?.started && !V.traitOf(this, "Dauntless") && !flags.noReducedMomentum ) {
      await this.update({ "system.combat.reducedMomentum": true });
    }
    // Injury System, Foot/Leg Major Injury: failing a Steadfast Check knocks you Prone
    if ( anyFail && !defeated && (await footLegProne(this)) ) lines.push(L("DBU.Injury.FootLegProne"));

    const transformed = this.system.transformation.active.length > 0;
    const buttons = [];
    if ( transformed && (anyFail || crossed.length > 1) && !defeated ) {
      buttons.push({ action: "stressTest", label: L("DBU.Threshold.ForcedStress"), icon: "fa-solid fa-bolt", actorUuid: this.uuid });
      lines.push(L("DBU.Threshold.ForcedStressText"));
      await this.addPending("stressTest");
      // (DR4: forced only by a failed Steadfast Check: a steadfastPass that turns it takes the Stress Test back)
      await this.setFlag("dbu-rpg", "stressByFail", crossed.length > 1 ? false : true);
    }
    if ( defeated ) lines.push(L("DBU.Threshold.Defeated", { name: this.name }));
    if ( lines.length || buttons.length ) {
      await postInfoCard({ actor: this, title: L("DBU.Threshold.Title", { name: this.name }), lines, buttons });
    }
    // B3: "allyDefeated" for the Allies of the Combat Encounter (once per Defeat)
    if ( defeated ) await this._allyDefeated(options).catch(console.error);
    // Forceful Defusion: a Fusion that fails the Steadfast Check of the Injured or Critical Threshold, or is Defeated
    const forced = (this.type === "fusion") && this.system.fusion.active
      && (defeated || ["injured", "critical"].some(k => updates[`system.thresholds.${k}`] === "fail"));
    if ( forced ) {
      const { defuse } = await import("../fusion/fusion.mjs");
      await defuse(this, { reason: "forced" });
      return;
    }
    // Q: the Transformations left by the Defeat still run their "threshold" triggers of this Defeat
    const defeatForms = defeated ? this.system.transformation.active.map(t => t.id) : [];
    if ( defeated ) await this._onDefeated();
    // Born for Battle (Saiyan): knocked through the Critical Health Threshold → a Temporary stack of Zenkai
    if ( crossed.includes("critical") ) {
      const { bornForBattle } = await import("../combat/awakening.mjs");
      await bornForBattle(this);
    }
    // Villainous Traits: Desperate Adversary, Dauntless, Second Phase
    await V.villainousThresholds(this, crossed, defeated);
    // Triggers "when you cross a Health Threshold"
    const { fireEvent } = await import("../combat/triggers.mjs");
    const by = options.dbuDamage?.attackerUuid ? await fromUuid(options.dbuDamage.attackerUuid) : null;
    // (RE: a "silent" Life Point loss: nothing of yours may trigger in response to it)
    if ( !options.dbuSilentDefeat ) fireEvent(this, "threshold", { other: by, scope: { crossed: crossed.length, defeated: defeated ? 1 : 0,
      ...Object.fromEntries(crossed.map(k => [k, 1])), failedNow: anyFail ? 1 : 0, selfInflicted: self ? 1 : 0, safeLoss: safe ? 1 : 0,
      ...(defeatForms.length ? { defeatForms } : {}) } });
  }

  async _onDefeated() {
    // Defeat: leave every Form and Enhancement
    const updates = this.system.transformation.active.map(t => ({ _id: t.id, "system.active": false }));
    if ( updates.length ) await this.updateEmbeddedDocuments("Item", updates);
    await this.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: true, overlay: true }).catch(() => null);
  }

  /**
   * B3: this Character was Defeated: "allyDefeated" for every other combatant of its disposition (other = this one;
   * @allyMinion, @byAttack: an attack's damage did it, @byOpponent: whoever did it is an Opponent of theirs). A flag keeps
   * a Defeat from firing twice (it goes when the Life Points rise above 0 again).
   */
  async _allyDefeated(options = {}) {
    const combat = encounterOf(this);
    if ( !combat || this.getFlag("dbu-rpg", "defeatFired") ) return;
    const dispositionOf = uuid => combat.combatants.find(c => c.actor?.uuid === uuid)?.token?.disposition ?? 0;
    const mine = dispositionOf(this.uuid);
    if ( !mine ) return;
    await this.setFlag("dbu-rpg", "defeatFired", combat.id);
    const byUuid = options.dbuDamage?.attackerUuid ?? null;
    const by = byUuid ? dispositionOf(byUuid) : 0;
    const minion = ((this.type === "npc") && (this.system.npcType === "minion")) ? 1 : 0;
    // (T4 @allyHasAwk.<slug>: the Defeated Ally's Awakenings)
    const allyHasAwk = (await import("../rules/awakening.mjs")).possessedAwakenings(this);
    const seen = new Set([this.uuid]);
    for ( const c of combat.combatants ) {
      const ally = c.actor;
      if ( !ally || seen.has(ally.uuid) ) continue;
      const disp = c.token?.disposition ?? 0;
      // RE "opponentDefeated": for the Characters of the other side (other = the Defeated one; @byMe: they did it)
      if ( disp && (disp !== mine) ) {
        seen.add(ally.uuid);
        const me = [ally.uuid, ally.token?.uuid, c.token?.uuid].filter(Boolean);
        fireEvent(ally, "opponentDefeated", { other: this, scope: { opponentMinion: minion, byAttack: options.dbuDamage ? 1 : 0,
          byMe: (byUuid && me.includes(byUuid)) ? 1 : 0 } });
        continue;
      }
      if ( disp !== mine ) continue;
      seen.add(ally.uuid);
      fireEvent(ally, "allyDefeated", { other: this, scope: { allyMinion: minion, allyHasAwk, byAttack: options.dbuDamage ? 1 : 0,
        byOpponent: (by && (by !== mine)) ? 1 : 0 } });
    }
  }

  /* -------------------------------------------- */
  /*  Rolls                                       */
  /* -------------------------------------------- */

  /**
   * Strike/Dodge/Wound without an attack (free rolls from the sheet, and the Clashes of Maneuvers: extra parts such
   * as a penalty, and the Maneuver as subtitle). naturalMod: + Natural Result (clash.natural); scope / other: for the
   * roll reactions (combat/reactions.mjs).
   */
  async rollCombat(type, { foundation = "physical", extra = [], subtitle, naturalMod = 0, scope = null, other = null } = {}) {
    const sys = this.system;
    const r = type === "wound" ? sys.rolls.wound[foundation] : sys.rolls[type];
    const parts = [...r.parts];
    if ( type === "strike" ) parts.push({ label: L(DBU.foundations[foundation]), value: sys.rolls[`strike_${foundation}`] ?? 0 });
    parts.push(...extra.filter(p => p?.value));
    return dbuRoll({
      actor: this, kind: type, title: L(`DBU.Roll.${type.capitalize()}`),
      subtitle: subtitle ?? (type !== "dodge" ? L(DBU.foundations[foundation]) : ""),
      naturalMod: r.natural + (Number(naturalMod) || 0), critTarget: r.crit, botchRange: r.botch, diceGroups: r.dice, parts,
      critDice: r.critDice, botchPenalty: r.botchPenalty, ...(scope ? { scope } : {}), ...(other ? { other } : {})
    });
  }

  /**
   * Skill Check. penalty: lowers the Dice Score (Pickpocket against the same Character again); subtitle replaces the
   * usual one; messageMode: "gmroll" / "blindroll" for a roll the player should not see. tn: a Target Number (instead of
   * a difficulty); extra: more parts; naturalMod: + Natural Result; scope / other: for the roll reactions. With a Target
   * Number the result has `success` (a "succeed" reaction makes it one).
   */
  async rollSkill(key, { difficulty, penalty = 0, penaltyLabel = "", subtitle, messageMode, tn: targetNumber, extra = [],
    naturalMod = 0, scope = null, other = null } = {}) {
    const S = this.system.skills[key];
    if ( !S ) return null;
    if ( S.autoFail ) {
      await postInfoCard({ actor: this, title: `${S.label}`, lines: [L("DBU.Skill.AutoFail", { skill: S.label })] });
      return { total: 0, autoFail: true, success: false };
    }
    const def = DBU.skills[key];
    const parts = [
      { label: L(DBU.attributes[def.attr]) + " (½)", value: S.attrBonus },
      { label: L("DBU.Skill.Ranks", { n: S.effectiveRanks }), value: S.rankBonus },
      { label: "Gifted Student", value: this.system.giftedStudent },
      { label: L("DBU.Bonus"), value: S.total - S.attrBonus - S.rankBonus - this.system.giftedStudent }
    ];
    if ( penalty ) parts.push({ label: penaltyLabel || L("DBU.Penalty"), value: -penalty });
    parts.push(...extra.filter(p => p?.value));
    const dtn = difficulty ? DBU.difficulties[difficulty]?.tn : undefined;
    const tn = targetNumber ?? dtn;
    // "natural.skill" / "natural.skill.<skill>" and the caller's (clash.natural)
    const natural = (S.natural ?? 0) + (Number(naturalMod) || 0);
    const r = await dbuRoll({
      actor: this, kind: "skill", title: S.label,
      subtitle: subtitle ?? (dtn ? `${L(DBU.difficulties[difficulty].label)} (TN ${dtn})` : ((tn !== undefined) ? `TN ${tn}` : L("DBU.Roll.SkillCheck"))),
      ...(natural ? { naturalMod: natural } : {}),
      critTarget: S.crit, botchRange: S.botch, parts,
      critDice: [{ number: 1, faces: 4 }], botchPenalty: 2, target: tn, messageMode,
      ...(scope ? { scope } : {}), ...(other ? { other } : {})
    });
    if ( r && (tn !== undefined) ) r.success = !!r.forceSuccess || (r.total >= tn);
    return r;
  }

  /**
   * Saving Throw. tn: a Target Number (the result then has `success`); extra: more parts; naturalMod: + Natural Result
   * (with "natural.save"); subtitle; scope / other: for the roll reactions.
   */
  async rollSave(key, { tn, extra = [], naturalMod = 0, subtitle, scope = null, other = null } = {}) {
    const s = this.system.saves[key];
    const r = this.system.rolls.strike; // ToP dice and crit dice are shared by every Clash roll
    const natural = (s.natural ?? 0) + (Number(naturalMod) || 0);
    const more = extra.filter(p => p?.value);
    const result = await dbuRoll({
      actor: this, kind: "save", title: L("DBU.Roll.Save", { save: L(DBU.saves[key].label) }),
      ...(subtitle ? { subtitle } : {}), ...(natural ? { naturalMod: natural } : {}),
      critTarget: s.crit, botchRange: s.botch, diceGroups: r.dice, parts: more.length ? [...s.parts, ...more] : s.parts,
      critDice: r.critDice, botchPenalty: 2 * this.system.top.base,
      ...((tn !== undefined) ? { target: tn } : {}), ...(scope ? { scope } : {}), ...(other ? { other } : {})
    });
    if ( result && (tn !== undefined) ) result.success = !!result.forceSuccess || (result.total >= tn);
    return result;
  }

  /**
   * Might Clash or an Attribute Modifier Clash (extra: bonuses to its Dice Score, such as Forceful Launch; naturalMod: +
   * Natural Result; scope / other: for the roll reactions).
   */
  async rollClash(what = "might", { extra = [], subtitle = "", naturalMod = 0, scope = null, other = null } = {}) {
    const sys = this.system;
    const value = what === "might" ? sys.aptitudes.might : sys.attributes[what].mod;
    const label = what === "might" ? "Might" : L(DBU.attributes[what]);
    const r = sys.rolls.strike;
    const natural = Number(naturalMod) || 0;
    return dbuRoll({
      actor: this, kind: "clash", title: L("DBU.Roll.Clash", { what: label }), subtitle, ...(natural ? { naturalMod: natural } : {}),
      critTarget: 10, botchRange: 1, diceGroups: r.dice, parts: [{ label, value }, ...extra.filter(p => p?.value)],
      critDice: r.critDice, botchPenalty: 2 * sys.top.base, ...(scope ? { scope } : {}), ...(other ? { other } : {})
    });
  }

  /**
   * Steadfast Check: 1d10, success on 6+. The one of a Health Threshold succeeds ("flag.autoPassSteadfast") or fails
   * ("flag.autoFailSteadfast") without a roll. other: the Character who caused it (for the roll reactions, whose
   * @thresholdCheck is 1 for the Check of a Health Threshold); a "succeed" reaction makes it a success.
   */
  /**
   * Z: a Pressure Check (the Demons' 1d10, 4+ a success): + "pressure" (@pressureBonus) and the bonus given; succeeds by
   * itself with "pressure.auto". A roll of the system (kind "pressure": its roll reactions apply, @kind_pressure), then
   * the "pressureCheck" event (@success, @failed, @total, @natural, @auto).
   */
  async rollPressure({ label = "", bonus = 0, other = null } = {}) {
    const rd = this.system.rollData ?? {};
    const auto = (Number(rd.pressureAuto) || 0) > 0;
    let r;
    if ( auto ) {
      await postInfoCard({ actor: this, title: L("DBU.Roll.Pressure"), subtitle: label, lines: [L("DBU.Pressure.Auto")] });
      r = { total: 10, natural: 10, success: true, automatic: true };
    }
    else {
      const b = (Number(rd.pressureBonus) || 0) + (Number(bonus) || 0);
      const roll = await dbuRoll({ actor: this, kind: "pressure", title: L("DBU.Roll.Pressure"), subtitle: label, noCrit: true, noBotch: true,
        parts: b ? [{ label: L("DBU.Bonus"), value: b }] : [], target: 4, ...(other ? { other } : {}) });
      r = { ...roll, success: !!roll.forceSuccess || (roll.total >= 4) };
    }
    fireEvent(this, "pressureCheck", { other, scope: { success: r.success ? 1 : 0, failed: r.success ? 0 : 1, total: Number(r.total) || 0,
      natural: Number(r.natural ?? 0) || 0, auto: auto ? 1 : 0, reacted: r.reacted ?? {}, rollSpent: r.rollSpent ?? {} } });
    return r;
  }

  async rollSteadfast({ threshold = null, penalty = 0, other = null } = {}) {
    const flags = this.system.flags ?? {};
    if ( threshold && (flags.autoPassSteadfast || flags.autoFailSteadfast) ) {
      const success = !!flags.autoPassSteadfast;
      const t = L(`DBU.Threshold.${threshold}`);
      await postInfoCard({ actor: this, title: L("DBU.Roll.Steadfast"), subtitle: t,
        lines: [L(success ? "DBU.Threshold.AutoPass" : "DBU.Threshold.AutoFailEffect", { t })] });
      return { total: success ? 6 : 0, success, automatic: true };
    }
    // RT "steadfast.<threshold>": ± the Steadfast Check of that Health Threshold only
    const own = threshold ? (Number(this.system.buckets?.[`steadfast.${threshold}`]?.total) || 0) : 0;
    const bonus = (this.system.stress?.steadfast ?? 0) + penalty + own;
    const r = await dbuRoll({
      actor: this, kind: "steadfast", title: L("DBU.Roll.Steadfast"),
      subtitle: threshold ? L(`DBU.Threshold.${threshold}`) : "",
      noCrit: true, noBotch: true, parts: bonus ? [{ label: L("DBU.Bonus"), value: bonus }] : [], target: 6,
      scope: { thresholdCheck: threshold ? 1 : 0 }, ...(other ? { other } : {})
    });
    return { ...r, success: !!r.forceSuccess || (r.total >= 6) };
  }

  /**
   * Stress Test: 1d10 + 1 + Stress Bonus against the (combined) Stress Test Requirement.
   * @param {Item} [transformation]  Transformation being entered (otherwise: those currently active)
   */
  async rollStressTest(transformation = null, { grade, penalty = 0 } = {}) {
    const sys = this.system;
    const req = this.stressRequirement(transformation, { grade });
    // New Level of Power: automatic success at any Stress Test for that Transformation, unless used in conjunction
    const alone = sys.transformation.active;
    // Maxi Fusion (Maximum Metamorese): automatic success on every Stress Test
    const automatic = (!transformation && (alone.length === 1) && alone[0].system.newLevel) || sys.flags.autoStress;
    if ( automatic ) {
      if ( !transformation ) await this.removePending("stressTest");
      const name = transformation?.name ?? alone[0]?.name ?? "";
      await postInfoCard({ actor: this, title: L("DBU.Roll.Stress"), subtitle: name, img: (transformation ?? alone[0])?.img,
        lines: [L(sys.flags.autoStress ? "DBU.Fusion.AutoStress" : "DBU.Trans.NewLevelStress", { name })] });
      return { success: true, requirement: req, automatic: true };
    }
    const parts = [{ label: "+1", value: 1 }, { label: "Stress Bonus", value: sys.stress.bonus }];
    // Divine Pulse: −1 Stress Bonus per Action spent on it, for that Maneuver
    if ( penalty ) parts.push({ label: "Divine Pulse", value: -penalty });
    // Fused Transformation: no Health Threshold penalty to the Stress Bonus for a Fused Form
    const fusedForms = (this.type === "fusion") ? (sys.fusion.fusedForms ?? []) : [];
    const tested = transformation ? [transformation] : alone;
    if ( fusedForms.length && tested.length && tested.every(t => fusedForms.includes(t.name)) && sys.health.stressPenalty ) {
      parts.push({ label: "Fused Transformation", value: sys.health.stressPenalty });
    }
    // LT: the Aspects of the Transformations tested (@stressAspects.<key>, for the roll reactions of this Stress Test)
    const stressAspects = {};
    for ( const t of tested ) for ( const a of t.system?.aspects ?? [] ) if ( a?.key ) stressAspects[a.key] = Math.max(stressAspects[a.key] ?? 0, Math.max(1, Number(a.level) || 0));
    const r = await dbuRoll({
      actor: this, kind: "stress", title: L("DBU.Roll.Stress"),
      subtitle: transformation ? transformation.name : sys.transformation.active.map(t => t.name).join(" + "),
      noCrit: true, noBotch: true, parts, target: req, scope: { stressAspects, entering: transformation ? 1 : 0 }
    });
    // (a "succeed" roll reaction makes it a success)
    let success = !!r.forceSuccess || (r.total >= req);
    // Potara Fusion (Divine Fusion Method, 1/Encounter): a failed Stress Test may count as a success
    if ( !success && (this.type === "fusion") && sys.fusion.active && (sys.fusion.method === "potara") && !sys.fusion.stressSaveUsed ) {
      const use = await DialogV2.confirm({
        window: { title: "Divine Fusion Method" }, content: `<p>${L("DBU.Fusion.PotaraSave")}</p>`, rejectClose: false
      });
      if ( use ) {
        success = true;
        await this.update({ "system.fusion.stressSaveUsed": true });
        await postInfoCard({ actor: this, title: "Divine Fusion Method", lines: [L("DBU.Fusion.PotaraSaved")], img: this.img });
      }
    }
    if ( !transformation ) await this.removePending("stressTest");
    if ( !success ) await this.applyStressExhaustion();
    return { ...r, success, requirement: req };
  }

  /** Remember a situational test the rules demand (shown in the sheet's alert panel). */
  async addPending(key) {
    const list = new Set(this.system._source.pending ?? []);
    if ( list.has(key) ) return;
    list.add(key);
    return this.update({ "system.pending": Array.from(list) });
  }

  async removePending(key) {
    const list = new Set(this.system._source.pending ?? []);
    if ( !list.delete(key) ) return;
    return this.update({ "system.pending": Array.from(list) });
  }

  /** Resolve an alert button from the sheet. */
  async resolveAlert(key) {
    if ( key === "stressTest" ) return this.rollStressTest();
    if ( key.startsWith("steadfast:") ) {
      const t = key.split(":")[1];
      const r = await this.rollSteadfast({ threshold: t });
      await this.update({ [`system.thresholds.${t}`]: r.success ? "pass" : "fail" });
      if ( !r.success && (await footLegProne(this)) ) ui.notifications.info(`${this.name}: ${L("DBU.Injury.FootLegProne")}`);
      if ( !r.success && this.system.transformation.active.length ) await this.addPending("stressTest");
      return r;
    }
    if ( key === "standUp" ) {
      await this.update({ "system.conditions.prone": 0, ...this._spendAction(1) });
      return this.toggleStatusEffect("prone", { active: false }).catch(() => null);
    }
    if ( key === "mightClash" ) return this.rollClash("might");
    if ( key.startsWith("choice:") ) {
      const item = this.items.get(key.slice(7));
      const { chooseTransformationOptions } = await import("../combat/choices.mjs");
      return item ? chooseTransformationOptions(this, item, { required: false }) : null;
    }
    if ( key.startsWith("allocate:") ) {
      const { openAllocationDialog } = await import("../combat/stacks.mjs");
      return openAllocationDialog(this, key.slice(9));
    }
    if ( key === "noKi" ) return this.applyStressExhaustion();
    return null;
  }

  /** Combined Stress Test Requirement (highest + 1/2 of the others), with Step-by-Step and Prelude. */
  stressRequirement(transformation = null, { grade } = {}) {
    const sys = this.system;
    let list = [...sys.transformation.active];
    let entering = null;
    if ( transformation ) {
      entering = transformation;
      const ts = transformation.system;
      // Entering a Form replaces the current Form; an Enhancement replaces the current Enhancement when stacking is full
      list = list.filter(t => t.id !== transformation.id);
      if ( ts.countsAsForm ) list = list.filter(t => !t.system.countsAsForm);
      else list = list.filter(t => t.system.countsAsForm);
      list.push(transformation);
    }
    const reqOf = t => {
      let r = t.system.stressReq;
      if ( t.system.graded ) {
        const g = Math.max(1, (t === entering && grade) ? grade : t.system.grade);
        const table = String(t.system.gradeStress ?? "").split(",").map(s => s.trim()).filter(Boolean);
        const entry = table[g - 1];
        // (AA "stressGradeStep.<slug>": ± the step per Grade above the first, 2 by default)
        const step = 2 + (sys.buckets?.[`stressGradeStep.${String(t.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`]?.total ?? 0);
        if ( entry === undefined ) r += step * (g - 1);
        else if ( entry.startsWith("+") ) r += Number(entry.slice(1)) || 0;
        else r = Number(entry) || r;
      }
      if ( t.system.prelude && t.system.aspects.some(a => a.key === "prelude") ) r -= 3;
      const scaling = t.system.aspects.find(a => a.key === "scaling");
      if ( scaling ) r += 2 * Math.max(0, Math.min(Math.max(1, scaling.level), sys.top.current - t.system.topReq));
      // B5 "stressReq.<slug of its name>": ± this Transformation's Stress Test Requirement
      r += sys.buckets?.[`stressReq.${String(t.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`]?.total ?? 0;
      // (CS2 "stressReq.tag.<tag>": the Transformation an effect tagged: Inherent Transformation)
      for ( const tag of Object.keys(t.flags?.["dbu-rpg"]?.tags ?? {}) ) r += sys.buckets?.[`stressReq.tag.${tag}`]?.total ?? 0;
      if ( t.system.aspects.some(a => a.key === "natural") && (sys.transformation.active.length <= 1) ) r = 0;
      return Math.max(0, r);
    };
    const reqs = list.map(reqOf).sort((a, b) => b - a);
    if ( !reqs.length ) return 0;
    let total = reqs[0] + reqs.slice(1).reduce((t, r) => t + Math.floor(r / 2), 0);
    // Step-by-Step Transformation: moving to a Form with a higher ToP Requirement
    if ( entering?.system.countsAsForm ) {
      const current = sys.transformation.forms[0];
      if ( current && (entering.system.topReq > current.system.topReq) ) {
        total -= (current.system.line && (current.system.line === entering.system.line)) ? 2 : 1;
      }
    }
    return Math.max(0, total);
  }

  async applyStressExhaustion() {
    const sys = this.system;
    const prev = sys._source.conditions.stressExhaustion ?? 0;
    const updates = { "system.conditions.stressExhaustion": 1 };
    if ( sys.transformation.kiMultiplier ) updates["system.ki.value"] = Math.floor(sys.ki.value / 2);
    await this.update(updates);
    const leave = sys.transformation.active.filter(t => !t.system.aspects.some(a => a.key === "natural"))
      .map(t => ({ _id: t.id, "system.active": false }));
    if ( leave.length ) await this.updateEmbeddedDocuments("Item", leave);
    await this.toggleStatusEffect("stressExhaustion", { active: true }).catch(() => null);
    // Stress Exhaustion lasts until the end of your next turn
    await addTimedCondition(this, "stressExhaustion", prev, 1, "endOfNextTurn", "Stress Exhaustion");
  }

  /* -------------------------------------------- */
  /*  Transformations                             */
  /* -------------------------------------------- */

  /**
   * Transformation Maneuver: check requirements, roll the Stress Test, apply Legend Realized.
   * free: no Stress Test to enter it (Holy Transformation); stressPenalty: Stress Bonus lowered for it (Divine Pulse).
   */
  async transform(item, options = {}) {
    // E3: the checks after a change ("leaveWhen", the Grand Trigger) wait until the Maneuver is over
    this._dbuTransforming = (this._dbuTransforming ?? 0) + 1;
    try {
      return await this._transform(item, options);
    } finally {
      this._dbuTransforming -= 1;
      if ( !this._dbuTransforming ) this._scheduleRuleCheck();
    }
  }

  /**
   * Legend Realized of a Form: once per Combat Encounter in each Form, not again for a Form of the same Form Type and
   * Tier of Power Requirement as one used this encounter. Returns the card lines. X: also through an effect ("legend"),
   * outside of the Transformation Maneuver (outside: true, a note on the card).
   */
  async legendRealized(item, { newLevel = false, outside = false, extra = false } = {}) {
    const lines = [];
    const sys = this.system;
    const ts = item?.system;
    if ( !ts || !((ts.transType === "form") && (ts.stage !== 0) && game.combat?.started) ) return lines;
    const V = await import("../combat/villainous.mjs");
    const used = new Set(sys.combat.legendRealized ?? []);
    // Not again from a Form of the same Form Type and Tier of Power Requirement as one used this encounter
    const twin = Array.from(used).map(id => this.items.get(id)).find(t => t && (t.id !== item.id)
      && (t.system.subtype === ts.subtype) && (t.system.topReq === ts.topReq));
    // (Z "extra": an effect's Legend Realized on top of the once-per-encounter one: neither of those limits)
    if ( twin && !extra ) lines.push(L("DBU.Trans.LegendSameType", { name: twin.name }));
    if ( used.has(item.id) && outside && !extra ) lines.push(L("DBU.Legend.AlreadyUsed", { name: item.name }));
    if ( extra || (!used.has(item.id) && !twin) ) {
      const r = await new Roll(this.legendRealizedFormula(item)).evaluate();
      // Narrative Transformation (Villainous Trait) [1/Encounter]: twice the Life and Ki Points
      let amount = Math.floor(r.total * (newLevel ? 2 : 1) * ((await V.narrativeDouble(this)) ? 2 : 1) * this.legendRealizedMult());
      await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor: `Legend Realized — ${item.name}` });
      used.add(item.id);
      const noLife = !!this.system.flags?.noLifeRegain;
      // B5 "legend.lifeMult": × its Life Points only
      const lifeMult = maneuverValue(this, "legend.lifeMult", maneuverCtx(this));
      const life = Number.isFinite(lifeMult) ? Math.max(0, Math.floor(amount * lifeMult)) : amount;
      await this.update({
        ...(noLife ? {} : { "system.life.value": Math.min(this.system.life.cap ?? this.system.life.max, this.system.life.value + life) }),
        "system.ki.value": Math.min(this.system.ki.cap ?? this.system.ki.max, this.system.ki.value + amount),
        "system.combat.legendRealized": Array.from(used)
      }, { dbuSource: "legend", dbuWanted: { life, ki: amount } });
      lines.push(L("DBU.Trans.LegendRealized", { n: amount }));
      if ( (life !== amount) && !noLife ) lines.push(L("DBU.Legend.LifeOnly", { n: life }));
      if ( noLife ) lines.push(L("DBU.Life.NoRegain"));
      // B5 "legendRealized" triggers (@legendLife, @legendKi; X: @legendOutside)
      fireEvent(this, "legendRealized", { scope: { itemId: item.id, legendLife: noLife ? 0 : life, legendKi: amount, legendOutside: outside ? 1 : 0,
        legendExtra: extra ? 1 : 0 } });
    }
    return lines;
  }

  async _transform(item, { grade, free = false, stressPenalty = 0 } = {}) {
    const sys = this.system;
    const ts = item.system;
    const problems = [];
    if ( ts.transType === "awakening" ) return ui.notifications.info(L("DBU.Trans.AwakeningAlways"));
    // BB: a State that forbids it (Spectator)
    { const { stateBlock } = await import("../rules/state-rules.mjs"); const why = stateBlock(this, "transformation"); if ( why ) return ui.notifications.warn(why); }
    if ( sys.effectiveConditions.stressExhaustion && !ts.aspects.some(a => a.key === "natural") ) problems.push(L("DBU.Trans.ErrExhausted"));
    if ( sys.ki.value <= 0 ) problems.push(L("DBU.Trans.ErrNoKi"));
    const topReq = ts.topReq - (ts.prelude ? 1 : 0);
    if ( (sys.top.current < topReq) && !this.isBoss && !ts.ignoreTop ) problems.push(L("DBU.Val.TransTop", { name: item.name, req: topReq, top: sys.top.current }));
    const { raceMatches } = await import("../rules/validation.mjs");
    if ( sys.race && !raceMatches(ts.race, sys.races?.length ? sys.races : sys.race) ) problems.push(L("DBU.Val.TransRace", { name: item.name, race: ts.race }));
    // A Plump or Frail Fusion stays in its Normal State
    if ( (this.type === "fusion") && (sys.fusion.dance !== "success") ) problems.push(L(`DBU.Fusion.Dance.${sys.fusion.dance}`));
    // Second Phase (Villainous Trait): the strongest Transformation waits for the 2nd effect
    const V = await import("../combat/villainous.mjs");
    if ( V.secondPhaseLocked(this, item) ) problems.push(L("DBU.Villain.SecondPhaseLocked", { name: item.name }));
    // E3: the rules of its effects and of the others (enterBlock, enterBlockOf / Aspect / Type, combineBlock, the
    // leaveBlock of what it replaces)
    const { enterProblems } = await import("../rules/transform-rules.mjs");
    problems.push(...enterProblems(this, item));
    // Q: a Transformation granted "+mastery:N" waits for those Masteries of the item that grants it
    const { grantMasteryMissing } = await import("../data/items.mjs");
    const gm = grantMasteryMissing(item);
    if ( gm ) problems.push(L("DBU.Grants.NeedsMastery", { name: item.name, by: gm.by.name, n: gm.n }));
    if ( problems.length ) {
      ui.notifications.error(problems.join(" "));
      return null;
    }
    // First time in this Transformation: its Option effects (e.g. S-Cells) must be chosen before entering it
    if ( ts.pendingChoices?.length ) {
      const { chooseTransformationOptions } = await import("../combat/choices.mjs");
      if ( !(await chooseTransformationOptions(this, item, { required: true })) ) {
        ui.notifications.warn(L("DBU.Choice.Required", { name: item.name }));
        return null;
      }
    }
    const natural = ts.aspects.some(a => a.key === "natural") && !sys.transformation.active.length;
    // New Level of Power: the first time ever this character enters this Transformation during a Combat Encounter
    const firstEver = await this._newLevelOfPower(item);
    const newLevel = item.system.newLevel;
    // Its automatic success does not cover a Stress Test for Transformations used in conjunction
    const staying = sys.transformation.active.filter(t => (t.id !== item.id) && (ts.countsAsForm ? !t.system.countsAsForm : t.system.countsAsForm));
    let success = true;
    let roll = null;
    // Narrative Transformation (Villainous Trait): no Stress Test for the chosen Form or Line used alone
    const narrative = V.narrativeFree(this, item);
    if ( !free && !natural && !narrative && !(newLevel && !staying.length) ) {
      roll = await this.rollStressTest(item, { grade, penalty: stressPenalty });
      success = roll.success;
    }
    if ( !success ) return roll;

    // Leave what this Transformation replaces
    const leave = [];
    for ( const t of sys.transformation.active ) {
      if ( t.id === item.id ) continue;
      if ( ts.countsAsForm && t.system.countsAsForm ) leave.push(t);
      if ( !ts.countsAsForm && !t.system.countsAsForm ) leave.push(t);
    }
    const updates = leave.map(t => ({ _id: t.id, "system.active": false }));
    // Entering an Enhancement (or changing its Grade) through the maneuver is when its Burst Limit may be triggered
    const { burstTraits, burstWindow } = await import("../combat/trait-actions.mjs");
    const bursts = (ts.transType === "enhancement") ? burstTraits(item) : [];
    updates.push({ _id: item.id, "system.active": true, "system.viaManeuver": true, "system.everEntered": true,
      ...(grade ? { "system.grade": grade } : {}), ...(bursts.length ? { "flags.dbu-rpg.burstWindow": burstWindow(this) } : {}) });
    await this.updateEmbeddedDocuments("Item", updates);
    if ( leave.length ) await this._leftTransformations(leave);

    // Legend Realized: first time per Combat Encounter in each Form
    const lines = [L("DBU.Trans.Entered", { name: item.name })];
    if ( firstEver ) lines.push(L(ts.transType === "form" ? "DBU.Trans.NewLevelForm" : "DBU.Trans.NewLevelEnhancement"));
    // Still pending: it only happens in a Combat Encounter
    else if ( item.system.newLevelPending ) lines.push(L("DBU.Trans.NewLevelWaiting"));
    lines.push(...(await this.legendRealized(item, { newLevel })));
    // Burst Limit [1/Encounter] (a New Level of Power in this Enhancement allows another one)
    const buttons = [];
    if ( bursts.length ) {
      const again = !!item.system.newLevel;
      const fighting = !!encounterOf(this);
      if ( fighting && this.system.combat.burstUsed && !again ) lines.push(L("DBU.Burst.UsedLine"));
      else {
        lines.push(L(again && fighting && this.system.combat.burstUsed ? "DBU.Burst.OfferAgain" : "DBU.Burst.Offer"));
        for ( const trait of bursts ) {
          buttons.push({ action: "burstLimit", icon: "fa-solid fa-explosion", label: `Burst Limit: ${trait}`, actorUuid: this.uuid,
            payload: JSON.stringify({ itemId: item.id, trait }) });
        }
      }
    }
    else if ( ts.transType === "enhancement" ) lines.push(L("DBU.Trans.BurstLimit"));
    // Round Limiter of a Temporary Fusion: the first Transformation with a ToP Requirement of 4+ shortens it
    if ( this.type === "fusion" ) {
      const { fusionTransformed } = await import("../fusion/fusion.mjs");
      const cut = await fusionTransformed(this, item);
      if ( cut ) lines.push(cut);
    }
    // Aspects of the Grade entered (and of the Grades below it)
    if ( ts.graded ) {
      const { aspectLabel } = await import("../rules/aspects.mjs");
      const fromGrade = (ts.gradeAspects ?? []).filter(g => g.key && (g.grade <= ts.grade)).map(g => aspectLabel(g));
      if ( fromGrade.length ) lines.push(L("DBU.Trans.GradeAspects", { n: ts.grade, list: fromGrade.join(", ") }));
    }
    const rampaging = ts.aspects.find(a => a.key === "rampaging");
    if ( rampaging ) lines.push(L(rampaging.level >= 2 ? "DBU.Trans.Rampaging2" : "DBU.Trans.Rampaging"));
    if ( ts.aspects.some(a => a.key === "bursting") ) lines.push(L("DBU.Trans.Bursting"));
    await postInfoCard({ actor: this, title: item.name, subtitle: L("DBU.Trans.Maneuver"), lines, img: item.img, buttons });
    // Triggers "when you enter a Transformation"
    const { fireEvent } = await import("../combat/triggers.mjs");
    fireEvent(this, "transform", { scope: { itemId: item.id, form: (ts.transType === "form") ? 1 : 0, enhancement: (ts.transType === "enhancement") ? 1 : 0,
      topReq: ts.topReq ?? 0, stage: ts.stage ?? 0, [`line_${String(ts.line ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`]: 1,
      // LT: what was entered: an Alternate / Legendary Form (@enteredAlternate, @enteredLegendary), its Aspects
      // (@enteredAspects.<key>: "upon entering a Transformation with the Super Saiyan Form Aspect")
      enteredAlternate: ((ts.transType === "form") && (ts.subtype === "alternate")) ? 1 : 0,
      enteredLegendary: ((ts.transType === "form") && (ts.subtype === "legendary")) ? 1 : 0,
      enteredAspects: Object.fromEntries((ts.aspects ?? []).filter(a => a?.key).map(a => [a.key, Math.max(1, Number(a.level) || 0)])) } });
    return roll ?? { success: true };
  }

  /**
   * New Level of Power: the first time ever a character gains access to a Transformation during a Combat Encounter.
   * While in it until the end of the encounter: +1 ToP, +1(bT) Stress Bonus, +1 base ToP for Power Advantage
   * (data preparation). Awakening: regain 1/2 of the Life and Ki Points. Only one at a time.
   * A Form or Enhancement only gets it when marked as pending (added mid-combat, or by the ARC for a planned first time);
   * an Awakening gets it when it is gained during the encounter (force).
   * @returns {Promise<boolean>} true when it triggered now
   */
  async _newLevelOfPower(item, { force = false } = {}) {
    const ts = item.system;
    // In the Combat Encounter, also right before it starts (transforming before "Begin Combat")
    const combat = game.combat;
    const inEncounter = !!combat && combat.combatants.some(c => c.actor?.uuid === this.uuid);
    // A Temporary Awakening (or one whose every Stack is Temporary) cannot grant New Level of Power
    if ( !inEncounter || ts.newLevel || ts.temporary || ((ts.transType === "awakening") && (ts.tempCount >= ts.stacks)) ) return false;
    if ( !ts.newLevelPending && !(force && !ts.everEntered) ) return false;
    const others = this.items.filter(i => (i.type === "transformation") && (i.id !== item.id) && i.system.newLevel)
      .map(i => ({ _id: i.id, "system.newLevel": false }));
    await this.updateEmbeddedDocuments("Item", [...others, {
      _id: item.id, "system.newLevel": true, "system.newLevelPending": false, "system.everEntered": true,
      "flags.dbu-rpg.newLevelCombat": combat.id
    }]);
    if ( ts.transType === "awakening" ) {
      const sys = this.system;
      // "flag.noLifeRegain": no Life Points
      const noLife = !!sys.flags?.noLifeRegain;
      await this.update({
        ...(noLife ? {} : { "system.life.value": Math.min(sys.life.cap ?? sys.life.max, sys.life.value + Math.floor(sys.life.max / 2)) }),
        "system.ki.value": Math.min(sys.ki.cap ?? sys.ki.max, sys.ki.value + Math.floor(sys.ki.max / 2))
      });
      await postInfoCard({ actor: this, title: item.name, img: item.img,
        lines: [L("DBU.Trans.NewLevelAwakening"), ...(noLife ? [L("DBU.Life.NoRegain")] : [])] });
    }
    return true;
  }

  /**
   * Roll formula of Legend Realized: 2(T)d10 + Power Level, plus the "legend.bonus" modifiers (dice allowed).
   * Used by the Transformation Maneuver and the Villainous Maneuvers (combat/villainous.mjs).
   */
  legendRealizedFormula(item = null) {
    const T = this.system.top.current;
    // LT: the "legend.bonus" pieces see the Aspects of the Form whose Legend Realized it is (@legendAspects.<key>)
    const legendAspects = Object.fromEntries((item?.system?.aspects ?? []).filter(a => a?.key).map(a => [a.key, Math.max(1, Number(a.level) || 0)]));
    const data = { ...(this.system.rollData ?? {}), legendAspects };
    return joinTerms(`${2 * T}d10 + ${this.system.pl}`, [...modifierTerms(this, "legend.bonus", data), ...withTerms(this, "legend.bonus")]);
  }

  /** "legend.mult": multiplier of the Life and Ki Points of Legend Realized (1 without one). */
  legendRealizedMult() {
    const m = this._bucket("legend.mult", { mult: true });
    return Number.isFinite(m) ? Math.max(0, m) : 1;
  }

  /**
   * B5: the total of a bucket worked out with the actor's data, and the one-shot value of a "maneuver" effect's `with` for
   * this use (multiplied in with `mult`, added otherwise). undefined when neither exists.
   */
  _bucket(target, { mult = false } = {}) {
    const b = this.system.buckets?.[target]?.total;
    const w = this._dbuWith?.[target];
    if ( (w === undefined) || (typeof w !== "number") ) return b;
    if ( mult ) return (Number.isFinite(b) ? b : 1) * w;
    return (Number.isFinite(b) ? b : 0) + w;
  }

  /** Effects "until you leave this Transformation" end, and its "when you leave it" triggers run. */
  async _leftTransformations(list) {
    const T = await import("../combat/triggers.mjs");
    for ( const t of list ) {
      await T.expireRevert(this, t.id);
      T.fireEvent(this, "revert", { scope: { itemId: t.id, form: (t.system.transType === "form") ? 1 : 0,
        enhancement: (t.system.transType === "enhancement") ? 1 : 0 } });
    }
  }

  /**
   * Leave Transformations (one, a list, or every one). E3: by choice (the default) a Transformation whose "leaveBlock"
   * holds stays; `forced` (an effect: "leave", "leaveWhen") leaves it anyway; `quiet` leaves without the Stress Exhaustion
   * and Impediment of the Exhausting Aspect; `why` goes on the card.
   */
  async revert(item = null, { forced = false, quiet = false, why = "" } = {}) {
    const sys = this.system;
    let list = Array.isArray(item) ? item.filter(Boolean) : (item ? [item] : [...sys.transformation.active]);
    if ( !forced && list.length ) {
      const { leaveProblems } = await import("../rules/transform-rules.mjs");
      const kept = list.map(t => [t, leaveProblems(this, t)]).filter(([, p]) => p.length);
      if ( kept.length ) {
        ui.notifications.warn(kept.flatMap(([, p]) => p).join(" "));
        list = list.filter(t => !kept.some(([k]) => k === t));
      }
    }
    const updates = list.map(t => ({ _id: t.id, "system.active": false }));
    if ( !updates.length ) return;
    await this.updateEmbeddedDocuments("Item", updates);
    await this._leftTransformations(list);
    const exhausting = !quiet && list.some(t => t.system.aspects.some(a => a.key === "exhausting"));
    if ( exhausting ) {
      const prevSE = this.system._source.conditions.stressExhaustion ?? 0;
      const prevIm = this.system._source.conditions.impediment ?? 0;
      await this.update({ "system.conditions.stressExhaustion": 1, "system.conditions.impediment": 1 });
      await addTimedCondition(this, "stressExhaustion", prevSE, 1, "endOfNextTurn", "Exhausting");
      await addTimedCondition(this, "impediment", prevIm, 1, "endOfNextTurn", "Exhausting");
    }
    // Clamp pools to the new maximums (Ki Multiplier ends)
    const upd = {};
    if ( this.system.ki.value > this.system.ki.max ) upd["system.ki.value"] = this.system.ki.max;
    if ( this.system.capacity.value > this.system.capacity.max ) upd["system.capacity.value"] = this.system.capacity.max;
    if ( Object.keys(upd).length ) await this.update(upd);
    const because = why ? [L("DBU.TransRule.Because", { why })] : [];
    await postInfoCard({ actor: this, title: L("DBU.Trans.Revert"), lines: [...list.map(t => t.name), ...because] });
  }

  /* -------------------------------------------- */
  /*  Maneuvers                                   */
  /* -------------------------------------------- */

  /**
   * Power Up Maneuver [2/Round]: +1 stack of Power until the end of your next turn (max 2, or system.combat.powerMax
   * with "power.max" modifiers). At the limit a stack is removed and gained again, which renews its duration. Capacity
   * Rate applies to the new Max Capacity. With Tier of Power 2+, the weaker Scouters near the character are destroyed
   * (combat/scan.mjs).
   */
  async powerUp() {
    const sys = this.system;
    // BB: a State that forbids it (Spectator)
    { const { stateBlock } = await import("../rules/state-rules.mjs"); const why = stateBlock(this, "powerUp"); if ( why ) return ui.notifications.warn(why); }
    const fighting = inCombat(this);
    if ( fighting && ((sys.combat.powerUps ?? 0) >= 2) ) return ui.notifications.warn(L("DBU.Power.RoundLimit"));
    const used = fighting ? { "system.combat.powerUps": (sys.combat.powerUps ?? 0) + 1 } : {};
    let card;
    if ( (sys.combat.power ?? 0) >= (sys.combat.powerMax ?? 2) ) {
      await this.update({ ...this._spendAction(1), ...used });
      if ( fighting ) await renewTimedPower(this);
      card = await postInfoCard({ actor: this, title: "Power Up", lines: [L("DBU.Power.Renewed", { n: sys.combat.power })] });
    }
    else {
      const gain = await this.gainPower(1, { updates: { ...this._spendAction(1), ...used }, cap: true, via: "maneuver" });
      card = await postInfoCard({ actor: this, title: "Power Up", lines: [L("DBU.Power.Gained", { n: this.system.combat.power, cap: gain,
        max: this.system.combat.powerMax ?? 2 })] });
    }
    try {
      const { scoutersNearPowerUp } = await import("../combat/scan.mjs");
      await scoutersNearPowerUp(this);
    } catch(err) {
      console.error("DBU | Scouters near the Power Up", err);
    }
    // Triggers "when you use the Power Up Maneuver" ([Triggered/Power])
    (await import("../combat/triggers.mjs")).fireEvent(this, "powerUp", { scope: { powerNow: this.system.combat.power ?? 0 } });
    return card;
  }

  /**
   * Gain stacks of Power (each lasts until the end of your next turn during combat). Returns the Capacity gained.
   * cap: no more than the maximum stacks of Power (system.combat.powerMax, 2 by default); otherwise effects may exceed it.
   */
  async gainPower(n = 1, { updates = {}, cap = false, via = "", resEvent = false } = {}) {
    const sys = this.system;
    const oldMax = sys.capacity.max;
    const before = sys.combat.power ?? 0;
    const wanted = n;
    if ( cap ) {
      n = Math.max(0, Math.min(n, (sys.combat.powerMax ?? 2) - before));
      if ( !(n > 0) ) {
        if ( Object.keys(updates).length ) await this.update(updates);
        if ( via ) await resourceEvent(this, "gain", { slug: "power", n: 0, wanted, via, resEvent });
        return 0;
      }
    }
    await this.update({ "system.combat.power": before + n, ...updates });
    const gain = this.system.capacity.max - oldMax;
    if ( gain > 0 ) await this.update({ "system.capacity.value": Math.min(this.system.capacity.max, this.system.capacity.value + gain) });
    if ( inCombat(this) ) await addTimedPower(this, n);
    // B2 "resourceGain" (res_power): only the system's gains (`via`), not the sheet's checkboxes
    if ( via ) await resourceEvent(this, "gain", { slug: "power", n, wanted, via, resEvent });
    return gain;
  }

  /** Set the stacks of Power from the sheet checkboxes (`via`: a system change, which fires the resource events). */
  async setPower(n, { via = "", resEvent = false } = {}) {
    const cur = this.system.combat.power ?? 0;
    n = Math.max(0, n);
    if ( n > cur ) return via ? this.gainPower(n - cur, { via, resEvent }) : this.gainPower(n - cur);
    if ( n === cur ) return 0;
    await this.update({ "system.combat.power": n });
    if ( this.system.capacity.value > this.system.capacity.max ) await this.update({ "system.capacity.value": this.system.capacity.max });
    await dropTimedPower(this, cur - n);
    if ( via ) await resourceEvent(this, "spend", { slug: "power", n: cur - n, via, resEvent });
    return 0;
  }

  /**
   * Energy Charge Maneuver: 2(bT) KP (or Divine Ki Points, if preferred in the God Ki State), +1 Energy Charge, Guard
   * Down until the attack. "charge.kpMult" multiplies the Ki Point Cost; "flag.chargeNoGuardDown": no Guard Down.
   */
  async energyCharge() {
    const sys = this.system;
    // BB: a State that forbids it (Spectator)
    { const { stateBlock } = await import("../rules/state-rules.mjs"); const why = stateBlock(this, "energyCharge"); if ( why ) return ui.notifications.warn(why); }
    const kpMult = this._bucket("charge.kpMult", { mult: true });
    // B5: the option boxes of "charge.*" pieces (only when one applies), "charge.kp" and "kpCost.maneuver" (flat KP)
    const opts = await maneuverOptions(this, "charge.", L("DBU.Charge.Options"));
    if ( !opts ) return null;
    const ctx = maneuverCtx(this, opts);
    const flat = (maneuverValue(this, "charge.kp", ctx) ?? 0) + (maneuverValue(this, "kpCost.maneuver", ctx) ?? 0);
    const cost = Math.max(0, Math.floor(2 * sys.top.base * (Number.isFinite(kpMult) ? kpMult : 1)) + flat);
    const { kiPayment } = await import("../combat/divine.mjs");
    const pay = kiPayment(sys, cost, { divine: !!(sys.dkp?.usable && sys.dkp.prefer) });
    if ( pay.problems.length ) return ui.notifications.error(pay.problems.join(" "));
    if ( opts.problems?.length ) return ui.notifications.error(opts.problems.join(" "));
    // The KP of the option boxes are paid after the Energy Charge's: both must fit
    const optionKi = opts.plan?.need?.kiPaid ?? 0;
    if ( optionKi && ((cost + optionKi) > (sys.ki?.value ?? 0)) ) {
      return ui.notifications.error(L("DBU.Attack.ErrKi", { need: cost + optionKi, have: sys.ki?.value ?? 0 }));
    }
    const guardDown = !sys.flags?.chargeNoGuardDown;
    await this.update({
      ...pay.updates,
      "system.combat.energyCharges": (sys.combat.energyCharges ?? 0) + 1, ...(guardDown ? { "system.conditions.guardDown": 1 } : {}),
      ...this._spendAction(1),
      // B5 @chargesRound: Energy Charges made this Combat Round
      ...(inCombat(this) ? { "system.combat.chargesRound": (sys.combat.chargesRound ?? 0) + 1 } : {})
    }, { dbuSource: "maneuver" });
    await finishManeuver(this, ctx, opts);
    if ( guardDown ) await this.toggleStatusEffect("guardDown", { active: true }).catch(() => null);
    (await import("../combat/triggers.mjs")).fireEvent(this, "energyCharge", { scope: { heldCharges: this.system.combat.energyCharges } });
    // S: Energy Charge provokes the Exploit of the adjacent Opponents
    await (await import("../rules/exploit.mjs")).provokeExploit(this, "energycharge", { name: "Energy Charge" });
    return postInfoCard({ actor: this, title: "Energy Charge", lines: [L("DBU.Charge.Gained", { n: this.system.combat.energyCharges, kp: cost })] });
  }

  /**
   * Surge Maneuver [1/Encounter, +"uses.surge"]: Healing Surge (2d10(T) LP) or Ki Surge (1/4 KP and Capacity), plus
   * Surgency. "surge.healSurgency" multiplies the Surgency of a Healing Surge, "surge.kiMult" the Ki Points of a Ki Surge.
   */
  async surge(type = "healing") {
    const sys = this.system;
    // (with a "maneuver" effect's one-shot `with` buckets for this use)
    const bucket = k => this._bucket(k, { mult: ["surge.kiMult", "surge.healSurgency", "surge.kiSurgency"].includes(k) });
    // (T4 "flag.vengefulSurge" / "flag.primalSurge": any Surge may be a Vengeful Surge (Endless Vengeance 2) or a Primal
    // Surge (Primal Saiyan Legacy 2) instead)
    // (T9 "flag.legendarySurge": a Ki Surge may be a Legendary Surge: Legend to Divinity 3)
    const kinds = [["vengeful", "flag.vengefulSurge"], ["primal", "flag.primalSurge"], ["legendary", "flag.legendarySurge"]]
      .filter(([k, f]) => ((sys.buckets?.[f]?.total ?? 0) > 0) && ((k !== "legendary") || (type === "ki"))).map(([k]) => k);
    if ( !["vengeful", "primal", "legendary"].includes(type) && kinds.length ) {
      const pick = await DialogV2.wait({ window: { title: "Surge" }, content: `<div class="dbu-dialog"><p>${L("DBU.T4.SurgeKind")}</p></div>`,
        buttons: [{ action: type, label: L(`DBU.Trigger.Maneuver.${type}Surge`), default: true },
          ...kinds.map(k => ({ action: k, label: L(`DBU.Trigger.Maneuver.${k}Surge`), icon: "fa-solid fa-fire-flame-curved" })),
          { action: "cancel", label: L("Cancel") }], rejectClose: false });
      if ( !pick || (pick === "cancel") ) return null;
      type = pick;
    }
    // F11 "flag.noHealingSurge": no other Healing Surge this Combat Round (Regenerating Beast; a Vengeful Surge is one)
    if ( ["healing", "vengeful", "primal"].includes(type) && ((sys.buckets?.["flag.noHealingSurge"]?.total ?? 0) > 0) ) {
      return ui.notifications.warn(L("DBU.F11.NoHealingSurge", { name: this.name }));
    }
    // Surges used this Combat Encounter (the sheet's "surge used" box counts as one)
    const combat = encounterOf(this);
    const record = this.getFlag("dbu-rpg", "surgeUses");
    const usedNow = sys.combat.surgeUsed ? Math.max(1, (combat && (record?.combat === combat.id)) ? (record.n ?? 0) : 0) : 0;
    const allowed = 1 + Math.max(0, bucket("uses.surge") ?? 0);
    // (T27 "surge.uncounted": a Surge an effect gives that does not count toward the Surge Maneuver's own uses; spread
    // after "surgeUsed: true" below, it keeps the sheet's box as it was)
    const uncounted = (Number(bucket("surge.uncounted")) || 0) > 0;
    if ( (usedNow >= allowed) && game.combat?.started && !uncounted ) ui.notifications.warn(L("DBU.Surge.Used"));
    const uses = uncounted ? { "system.combat.surgeUsed": !!sys.combat.surgeUsed }
      : (combat ? { "flags.dbu-rpg.surgeUses": { combat: combat.id, n: usedNow + 1 } } : {});
    // B5 @surgesRound: Surges used this Combat Round
    const surges = combat ? { "system.combat.surgesRound": (sys.combat.surgesRound ?? 0) + 1,
      ...(["healing", "vengeful", "primal"].includes(type) ? { "system.combat.healingSurgesRound": (sys.combat.healingSurgesRound ?? 0) + 1 } : {}) } : {};
    let surgency = sys.aptitudes.surgency;
    const lines = [];
    if ( ["vengeful", "primal", "legendary"].includes(type) ) {
      return this._vengefulSurge({ surgency, uses, surges, primal: type === "primal", legendary: type === "legendary" });
    }
    if ( type === "healing" ) {
      // B5: the option boxes of "surge.*" pieces (only when one applies)
      const opts = await maneuverOptions(this, "surge.", L("DBU.Surge.Options"));
      if ( !opts ) return null;
      const ctx = maneuverCtx(this, opts);
      // "surge.toKi": its Life Points come as Ki Points and Capacity instead (Capacity may go over its maximum)
      const toKi = (maneuverValue(this, "surge.toKi", ctx) ?? 0) > 0;
      // "flag.noLifeRegain": a Healing Surge would regain nothing
      if ( sys.flags?.noLifeRegain && !toKi ) return ui.notifications.warn(`Healing Surge: ${L("DBU.Life.NoRegain")}`);
      if ( opts.problems?.length ) return ui.notifications.error(opts.problems.join(" "));
      const healMult = bucket("surge.healSurgency");
      if ( Number.isFinite(healMult) ) surgency = Math.ceil(surgency * healMult);
      // "surge.healMult" multiplies the dice (before Surgency); "surge.healBonus" adds Life Points (dice allowed)
      const diceMult = maneuverValue(this, "surge.healMult", ctx);
      let dice = `${2 * sys.top.current}d10`;
      if ( Number.isFinite(diceMult) && (diceMult !== 1) ) dice = Number.isInteger(diceMult) ? `(${dice} * ${diceMult})` : `floor(${dice} * ${diceMult})`;
      const r = await new Roll(joinTerms(`${dice} + ${surgency}`, maneuverValue(this, "surge.healBonus", ctx) ?? [])).evaluate();
      await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor: `Healing Surge (Surgency ${surgency})` });
      if ( toKi ) {
        await this.update({ "system.ki.value": Math.min(sys.ki.cap ?? sys.ki.max, sys.ki.value + r.total), "system.capacity.value": sys.capacity.value + r.total,
          "system.combat.surgeUsed": true, ...uses, ...surges }, { dbuAllowOver: true, dbuSource: "surge", dbuWanted: { ki: r.total } });
        await postInfoCard({ actor: this, title: "Healing Surge", lines: [L("DBU.Surge.ToKi", { n: r.total })] });
      }
      else {
        await this.update({ "system.life.value": Math.min(sys.life.cap ?? sys.life.max, sys.life.value + r.total), "system.combat.surgeUsed": true, ...uses,
          ...surges }, { dbuSource: "surge", dbuWanted: { life: r.total } });
      }
      await finishManeuver(this, ctx, opts);
      // Injury System, Regenerator: a Healing Surge may end one Injury
      await offerRegeneratorRemoval(this);
      (await import("../combat/triggers.mjs")).fireEvent(this, "surge", { scope: { healingSurge: 1, kiSurge: 0, healed: r.total } });
      return r;
    }
    // (T28 "surge.ignoreKiMult" of a "maneuver" effect's `with`: the sheet's surge.kiMult (Power Battery's 0) is ignored)
    const kiMult = ((Number(this._dbuWith?.["surge.ignoreKiMult"]) || 0) > 0) ? this._dbuWith?.["surge.kiMult"] : bucket("surge.kiMult");
    // (F7 "surge.kiSurgency": × the Surgency of this Ki Surge, rounded up)
    const kiSurg = bucket("surge.kiSurgency");
    if ( Number.isFinite(kiSurg) ) surgency = Math.ceil(surgency * kiSurg);
    const kiBase = Math.floor(sys.ki.max / 4) + surgency;
    const ki = Number.isFinite(kiMult) ? Math.floor(kiBase * kiMult) : kiBase;
    const cap = Math.floor(sys.capacity.max / 4);
    await this.update({
      "system.ki.value": Math.min(sys.ki.cap ?? sys.ki.max, sys.ki.value + ki),
      "system.capacity.value": Math.min(sys.capacity.max, sys.capacity.value + cap),
      "system.combat.surgeUsed": true, ...uses, ...surges
    }, { dbuSource: "surge", dbuWanted: { ki } });
    lines.push(L("DBU.Surge.Ki", { ki, cap }));
    (await import("../combat/triggers.mjs")).fireEvent(this, "surge", { scope: { healingSurge: 0, kiSurge: 1 } });
    return postInfoCard({ actor: this, title: "Ki Surge", lines });
  }

  /**
   * T4 Vengeful Surge (Endless Vengeance 2): 1d10(T) (+ "surge.vengefulDice") + Surgency Life and Ki Points ("surge.healMult"
   * / "surge.kiMult" multiply them); then every Opponent within 4 (+ "surge.vengefulRange") Squares loses the Dice Score in
   * Life Points (+ half your Surgency for the ones carrying your Inferior mark, "surge.vengefulInferiorHalf"). It counts as
   * a Healing Surge and a Ki Surge ("surge" event with @healingSurge, @kiSurge, @vengefulSurge, @vengefulScore).
   */
  async _vengefulSurge({ surgency, uses, surges, primal = false, legendary = false }) {
    const sys = this.system;
    const opts = await maneuverOptions(this, "surge.", L("DBU.Surge.Options"));
    if ( !opts ) return null;
    if ( opts.problems?.length ) return ui.notifications.error(opts.problems.join(" "));
    const ctx = maneuverCtx(this, opts);
    // (a Primal Surge: 2d10(T) + Surgency LP and KP, and nothing for the Opponents)
    // (a Legendary Surge: 2d10(T) + Surgency KP only, then Surging until the end of your turn; a Ki Surge for Traits)
    const name = primal ? "Primal Surge" : (legendary ? "Legendary Surge" : "Vengeful Surge");
    const r = await new Roll((primal || legendary) ? `${2 * sys.top.current}d10`
      : joinTerms(`${sys.top.current}d10`, maneuverValue(this, "surge.vengefulDice", ctx) ?? [])).evaluate();
    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor: `${name} (Surgency ${surgency})` });
    const score = r.total;
    const times = (v, m) => (Number.isFinite(m) && (m !== 1)) ? Math.floor(v * m) : v;
    const life = (sys.flags?.noLifeRegain || legendary) ? 0 : times(score + surgency, maneuverValue(this, "surge.healMult", ctx));
    const ki = times(score + surgency, this._bucket("surge.kiMult", { mult: true }));
    await this.update({ "system.life.value": Math.min(sys.life.cap ?? sys.life.max, sys.life.value + life),
      "system.ki.value": Math.min(sys.ki.cap ?? sys.ki.max, sys.ki.value + ki), "system.combat.surgeUsed": true, ...uses, ...surges },
      { dbuSource: "surge", dbuWanted: { life, ki } });
    await finishManeuver(this, ctx, opts);
    const T = await import("../combat/triggers.mjs");
    if ( legendary ) {
      await T.applyTriggerEffect(this, "state", 1, "surging", { duration: "endOfTurn", label: name });
      await postInfoCard({ actor: this, title: name, lines: [L("DBU.T9.Legendary", { ki })] });
      T.fireEvent(this, "surge", { scope: { healingSurge: 0, kiSurge: 1, legendarySurge: 1, healed: 0 } });
      return r;
    }
    if ( primal ) {
      await postInfoCard({ actor: this, title: name, lines: [L("DBU.T4.Primal", { life, ki })] });
      T.fireEvent(this, "surge", { scope: { healingSurge: 1, kiSurge: 1, primalSurge: 1, healed: life } });
      return r;
    }
    const range = 4 + Math.max(0, Math.floor(Number(maneuverValue(this, "surge.vengefulRange", ctx) ?? 0)) || 0);
    const half = ((maneuverValue(this, "surge.vengefulInferiorHalf", ctx) ?? 0) > 0) ? Math.floor(surgency / 2) : 0;
    const { opponentsInRange } = await import("../rules/allies.mjs");
    const inferior = this.flags?.["dbu-rpg"]?.marks?.inferior ?? [];
    const lost = [];
    for ( const o of opponentsInRange(this, String(range)) ) {
      const n = score + (inferior.some(e => e?.uuid === o.uuid) ? half : 0);
      if ( n > 0 ) { await T.applyOn(this, o, { effect: "life" }, -n, { label: "Vengeful Surge" }); lost.push(`${o.name}: −${n} LP`); }
    }
    await postInfoCard({ actor: this, title: "Vengeful Surge", lines: [L("DBU.T4.Vengeful", { life, ki, score, range }), ...lost] });
    T.fireEvent(this, "surge", { scope: { healingSurge: 1, kiSurge: 1, vengefulSurge: 1, vengefulScore: score, healed: life } });
    return r;
  }

  /** Combat Recovery [1/Round]: 2–3 Actions, regain 1d10(bT) Life and Ki per Action. */
  async combatRecovery() {
    const sys = this.system;
    { const { stateBlock } = await import("../rules/state-rules.mjs"); const why = stateBlock(this, "combatRecovery"); if ( why ) return ui.notifications.warn(why); }
    // B5: the Actions it may use: from "recovery.minActions" (2 by default, at least 1) to 3, or the `with` "actions=<n>"
    const forced = Math.floor(Number(this._dbuWith?.actions));
    const min = Math.clamp(Math.floor(maneuverValue(this, "recovery.minActions", maneuverCtx(this)) ?? 2), 1, 3);
    const counts = (forced > 0) ? [forced] : Array.from({ length: 4 - min }, (_, i) => min + i);
    const choice = await DialogV2.wait({
      window: { title: "Combat Recovery" },
      content: `<div class="dbu-dialog"><p>${L("DBU.Recovery.Text")}</p>
        <div class="form-group"><label>${L("DBU.Recovery.Actions")}</label>
          <select name="actions">${counts.map(k => `<option value="${k}">${k}</option>`).join("")}</select></div>
        <label><input type="checkbox" name="condition"> ${L("DBU.Recovery.Condition")}</label></div>`,
      buttons: [{ action: "ok", label: L("DBU.Roll.Roll"), default: true,
        callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
      { action: "cancel", label: L("Cancel") }],
      rejectClose: false
    });
    if ( !choice || choice === "cancel" ) return;
    const n = Number(choice.actions) || counts[0];
    const bT = sys.top.base;
    // S: Combat Recovery provokes the Exploit of every Opponent not at Long Range
    await (await import("../rules/exploit.mjs")).provokeExploit(this, "combatrecovery", { name: "Combat Recovery" });
    // Y: "combatRecovery" (@actions; @condition when it is a Condition Recovery), and the Opponents' / Allies' watch
    fireEvent(this, "combatRecovery", { scope: { actions: n, condition: choice.condition ? 1 : 0 } });
    if ( choice.condition ) {
      const st = await this.rollSteadfast();
      // (DR4: a failed Condition Recovery Steadfast Check that a steadfastPass may still turn: flags.dbu-rpg.recoveryFailed)
      if ( !st.success ) await this.setFlag("dbu-rpg", "recoveryFailed", { n });
      else if ( this.getFlag("dbu-rpg", "recoveryFailed") ) await this.unsetFlag("dbu-rpg", "recoveryFailed");
      return postInfoCard({ actor: this, title: "Condition Recovery",
        lines: [st.success ? L("DBU.Recovery.ConditionOk", { n }) : L("DBU.Recovery.ConditionFail")] });
    }
    // B5: the option boxes of "recovery.*" pieces (only when one applies); "recovery.actions" ± the Actions it costs,
    // "recovery.lifeMult" × its Life Points, "flag.recoveryNoDvPenalty" no Defense Value penalty
    const opts = await maneuverOptions(this, "recovery.", L("DBU.Recovery.Options"), { actions: n });
    if ( !opts ) return null;
    if ( opts.problems?.length ) return ui.notifications.error(opts.problems.join(" "));
    const ctx = maneuverCtx(this, opts, { actions: n });
    const spent = Math.max(0, n + (maneuverValue(this, "recovery.actions", ctx) ?? 0));
    const lifeMult = maneuverValue(this, "recovery.lifeMult", ctx);
    const noDv = (maneuverValue(this, "flag.recoveryNoDvPenalty", ctx) ?? 0) > 0;
    // "recovery.bonus": Life and Ki Points added (dice allowed); "recovery.kiMult" multiplies the Ki Points regained;
    // "flag.noLifeRegain": no Life Points
    const r = await new Roll(joinTerms(`${n * bT}d10`, [...modifierTerms(this, "recovery.bonus"), ...withTerms(this, "recovery.bonus")])).evaluate();
    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor: `Combat Recovery (${n} ${L("DBU.Actions")})` });
    const kiMult = this._bucket("recovery.kiMult", { mult: true });
    const ki = Number.isFinite(kiMult) ? Math.max(0, Math.floor(r.total * kiMult)) : r.total;
    const life = Number.isFinite(lifeMult) ? Math.max(0, Math.floor(r.total * lifeMult)) : r.total;
    const noLife = !!sys.flags?.noLifeRegain;
    await this.update({
      ...(noLife ? {} : { "system.life.value": Math.min(sys.life.cap ?? sys.life.max, sys.life.value + life) }),
      "system.ki.value": Math.min(sys.ki.cap ?? sys.ki.max, sys.ki.value + ki),
      ...this._spendAction(spent)
    }, { dbuSource: "recovery", dbuWanted: { life: noLife ? 0 : life, ki } });
    await finishManeuver(this, ctx, opts);
    const lines = [noDv ? L("DBU.Recovery.ResultNoDv", { n: r.total }) : L("DBU.Recovery.Result", { n: r.total, dv: n * sys.top.current })];
    if ( (life !== r.total) && !noLife ) lines.push(L("DBU.Recovery.LifeResult", { n: life }));
    if ( ki !== r.total ) lines.push(L("DBU.Recovery.KiResult", { n: ki }));
    if ( spent !== n ) lines.push(L("DBU.Recovery.ActionsSpent", { n: spent }));
    if ( noLife ) lines.push(L("DBU.Life.NoRegain"));
    return postInfoCard({ actor: this, title: "Combat Recovery", lines });
  }

  /** Apply damage from outside an attack card (manual damage calculator). */
  async applyManualDamage({ wound = 0, category = 1, ignoreSoak = false, ignoreDR = false, raw = false } = {}) {
    const sys = this.system;
    let damage = wound;
    const lines = [];
    const cat = Math.clamp(category + (sys.damageCategoryTaken ?? 0), 1, 3);
    if ( !raw ) {
      const dr = ignoreDR ? 0 : sys.aptitudes.dr;
      const soak = ignoreSoak ? 0 : (cat === 1 ? sys.aptitudes.soak : (cat === 2 ? Math.floor(sys.aptitudes.soak / 2) : 0));
      damage = Math.max(0, wound - dr - soak);
      if ( damage > 0 ) damage += (sys.aptitudes.brokenOverflow ?? 0) + (sys.damageTaken ?? 0);
      lines.push(L("DBU.Damage.Breakdown", { wound, dr, soak, cat: L(DBU.damageCategories[cat]), damage }));
    }
    // Damage typed in the calculator counts as a hit from an Attacking Maneuver (Injury System, Overkill)
    const attack = { name: L("DBU.DamageCalc"), category: cat, calledShot: false, manual: true };
    return applyDamageToActor(this, damage, { lines, attack, category: cat });
  }

  /** Gag Maneuver (Gag Rules): Clash (Morale); on a win the target loses 1/2 (Trick + Dirty Trick: 3/4) of the PE Modifier. */
  async gag() {
    const sys = this.system;
    const choice = await DialogV2.wait({
      window: { title: "Gag Maneuver" },
      content: `<div class="dbu-dialog"><div class="form-group"><label>Gag</label><select name="type">
        <option value="dumb">Dumb Gag</option><option value="trick">Trick Gag</option><option value="flirty">Flirty Gag</option></select></div>
        <label><input type="checkbox" name="dirtyTrick"> Dirty Trick</label></div>`,
      buttons: [{ action: "ok", label: L("DBU.Roll.Roll"), default: true,
        callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object }, { action: "cancel", label: L("Cancel") }],
      rejectClose: false
    });
    if ( !choice || choice === "cancel" ) return;
    if ( (choice.type === "trick") && ((sys.skills.bluff.totalRanks < 2) || (sys.skills.intuition.totalRanks < 2)) ) {
      ui.notifications.warn(L("DBU.Gag.TrickReq"));
    }
    if ( (choice.type === "flirty") && !this.items.some(i => /attractive/i.test(i.name)) ) ui.notifications.warn(L("DBU.Gag.FlirtyReq"));
    const pe = sys.attributes.pe.mod;
    const lp = (choice.type === "trick" && choice.dirtyTrick) ? Math.ceil(pe * 3 / 4) : Math.ceil(pe / 2);
    await this.rollSave("morale");
    return postInfoCard({ actor: this, title: `Gag Maneuver: ${choice.type}`, lines: [L(`DBU.Gag.${choice.type}`, { lp })] });
  }

  /** Alternate Life Point Generation: roll 2d10 for a new Power Level. */
  async rollAltLife() {
    const r = await new Roll("2d10").evaluate();
    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor: L("DBU.Opt.altLifePoints") });
    return this.update({ "system.optional.rolledLife": (this.system.optional.rolledLife ?? 0) + r.total });
  }

  /**
   * Use a Maneuver as an Out-of-Sequence Maneuver (an effect's chat button): it spends no Action.
   * key: powerUp | energyCharge | combatRecovery | healingSurge | kiSurge | surge (Healing or Ki Surge, picked) |
   * empower | basicAttack | signature | transformation | movement (a reminder only) | exploit | feint (an attack made
   * through that Maneuver) | E2: standard (any 1-Action Standard Maneuver, picked) | item:<Name> (that item of the actor)
   * B5 `with`: one-shot buckets for this use ("surge.healMult=2; actions=3"), read by the Maneuvers through _bucket and
   * maneuverValue; only the targets of the Maneuvers (surge.*, recovery.*, charge.*, legend.*, empower.*, kpCost.maneuver,
   * flag.recoveryNoDvPenalty, flag.empowerMelee, flag.empowerMax) and actions are taken.
   */
  async useOutOfSequence(key, { with: withSpec = "", viaFx = "" } = {}) {
    this._dbuOutOfSequence = true;
    // D1 @viaFx.<ref>: the events of this use say which effect gave it (combat/triggers.mjs fireEvent)
    if ( viaFx ) this._dbuViaFx = viaFx;
    // An attack made this way gets the raw "with" text (one-shot attack pieces, read by combat/attack.mjs) and the effect
    const attackOpts = { outOfSequence: true, ...(String(withSpec ?? "").trim() ? { with: String(withSpec) } : {}), ...(viaFx ? { viaFx } : {}) };
    if ( String(withSpec ?? "").trim() ) this._dbuWith = parseWith(withSpec, { ...(this.system.rollData ?? {}), ...triggerData(this) });
    try {
      // E2 "item:<Name>": that item of the actor, Out-of-Sequence (no Action)
      if ( String(key ?? "").startsWith("item:") ) return await this._useItemOutOfSequence(String(key).slice(5).trim(), attackOpts);
      switch ( key ) {
        case "powerUp": return await this.powerUp();
        case "energyCharge": return await this.energyCharge();
        case "combatRecovery": return await this.combatRecovery();
        case "healingSurge": return await this.surge("healing");
        case "kiSurge": {
          // (T9 "flag.kiSurgeAsHealing": a Ki Surge through an effect may be a Healing Surge: Red Flame of Life 4)
          if ( (this.system.buckets?.["flag.kiSurgeAsHealing"]?.total ?? 0) > 0 ) {
            const t = await DialogV2.wait({ window: { title: L("DBU.Trigger.Maneuver.surge") },
              content: `<div class="dbu-dialog"><p>${L("DBU.Surge.Pick")}</p></div>`,
              buttons: [{ action: "ki", label: L("DBU.Trigger.Maneuver.kiSurge"), icon: "fa-solid fa-bolt", default: true },
                { action: "healing", label: L("DBU.Trigger.Maneuver.healingSurge"), icon: "fa-solid fa-heart" },
                { action: "cancel", label: L("Cancel") }], rejectClose: false });
            return ["healing", "ki"].includes(t) ? await this.surge(t) : null;
          }
          return await this.surge("ki");
        }
        case "legendarySurge": return await this.surge("legendary");
        // (T4: a Vengeful Surge, Endless Vengeance 2)
        case "vengefulSurge": return await this.surge("vengeful");
        case "primalSurge": return await this.surge("primal");
        // The Surge Maneuver: Healing Surge or Ki Surge
        case "surge": {
          const type = await DialogV2.wait({ window: { title: L("DBU.Trigger.Maneuver.surge") },
            content: `<div class="dbu-dialog"><p>${L("DBU.Surge.Pick")}</p></div>`,
            buttons: [{ action: "healing", label: L("DBU.Trigger.Maneuver.healingSurge"), icon: "fa-solid fa-heart", default: true },
              { action: "ki", label: L("DBU.Trigger.Maneuver.kiSurge"), icon: "fa-solid fa-bolt" },
              { action: "cancel", label: L("Cancel") }], rejectClose: false });
          return ["healing", "ki"].includes(type) ? await this.surge(type) : null;
        }
        // The Empower Maneuver (a Standard Maneuver every character has): to the targeted Ally
        case "empower": return await this.empower();
        // O: the Movement Maneuver (its Action not spent Out-of-Sequence)
        case "movement": {
          const { useMovement } = await import("../combat/movement-maneuver.mjs");
          const { itemNamed } = await import("../combat/triggers.mjs");
          return await useMovement(this, { item: itemNamed(this, "Movement Maneuver") });
        }
        case "basicAttack": return await this.attack(attackOpts);
        // RG: the Grapple / Launch / Pin Maneuvers Out-of-Sequence (no Action); `with: grapple.reach=<n>` adds Squares to
        // the Melee Range of that Grapple
        case "grapple":
        case "launch":
        case "pin": {
          const G = await import("../combat/grapple.mjs");
          return await G[key](this);
        }
        // An attack made through the Exploit or Feint Maneuver ("Feito através de" picked in the attack dialog)
        case "exploit":
        case "feint": return await this.attack({ ...attackOpts, via: key });
        case "signature": {
          // 6F: only the Signatures the effect allows ("with" only=...)
          const sigs = this.items.filter(i => (i.type === "signature") && signatureAllowed(i, withSpec));
          if ( !sigs.length ) return await this.attack(attackOpts);
          const { DialogV2 } = foundry.applications.api;
          const id = await DialogV2.wait({ window: { title: L("DBU.Trigger.Maneuver.signature") },
            content: `<div class="dbu-dialog"><select name="id">${sigs.map(s => `<option value="${s.id}">${foundry.utils.escapeHTML(s.name)}</option>`).join("")}</select></div>`,
            buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), default: true, callback: (e, b) => b.form.elements.id.value },
              { action: "cancel", label: L("Cancel") }], rejectClose: false });
          const sig = (id && (id !== "cancel")) ? this.items.get(id) : null;
          return sig ? await this.attack({ ...attackOpts, signature: sig }) : null;
        }
        case "transformation": {
          const { transformOutOfSequence } = await import("../combat/villainous.mjs");
          return await transformOutOfSequence(this, L("DBU.Trigger.Maneuver.transformation"));
        }
        // E2: any Standard Maneuver with an Action Cost of 1 Action: a reminder, then a pick among the ones the system uses
        // T27 uaStd / uaTechnical / uaMagical: one of your Unique Abilities that is a 1-Action Standard Maneuver (of that
        // type: Technical/Magical ones count for both)
        case "uaStd": case "uaTechnical": case "uaMagical": {
          const type = { uaTechnical: "technical", uaMagical: "magical" }[key] ?? "";
          const uas = this.items.filter(i => (i.type === "uniqueAbility") && /^standard/i.test(String(i.system?.maneuverType ?? ""))
            && /^\s*1\s*action/i.test(String(i.system?.actionCost ?? ""))
            && (!type || String(i.system?.abilityType ?? "").toLowerCase().includes(type)));
          if ( !uas.length ) return ui.notifications.info(L("DBU.F13.NoUa1"));
          const T = await import("../combat/triggers.mjs");
          const picked = (uas.length === 1) ? `item:${uas[0].name}` : await T.pickManeuverKey(uas.map(i => `item:${i.name}`), L(`DBU.Trigger.Maneuver.${key}`));
          return picked ? await this.useOutOfSequence(picked, { with: withSpec, viaFx }) : null;
        }
        // F13 ua1: one of your Unique Abilities with an Action Cost of 1 Action (picked)
        case "ua1": {
          const uas = this.items.filter(i => (i.type === "uniqueAbility") && /^\s*1\s*action/i.test(String(i.system?.actionCost ?? "")));
          if ( !uas.length ) return ui.notifications.info(L("DBU.F13.NoUa1"));
          const T = await import("../combat/triggers.mjs");
          const picked = (uas.length === 1) ? `item:${uas[0].name}` : await T.pickManeuverKey(uas.map(i => `item:${i.name}`), L("DBU.Trigger.Maneuver.ua1"));
          return picked ? await this.useOutOfSequence(picked, { with: withSpec, viaFx }) : null;
        }
        case "standard": {
          await postInfoCard({ actor: this, title: L("DBU.Trigger.Maneuver.standard"), lines: [L("DBU.Trigger.Maneuver.standardReminder")] });
          const T = await import("../combat/triggers.mjs");
          const picked = await T.pickManeuverKey(T.standardManeuverKeys(this), L("DBU.Trigger.Maneuver.standard"));
          return picked ? await this.useOutOfSequence(picked, { with: withSpec, viaFx }) : null;
        }
        default: return ui.notifications.info(L("DBU.Trigger.Maneuver.manual", { name: L(`DBU.Trigger.Maneuver.${key}`) }));
      }
    } finally {
      this._dbuOutOfSequence = false;
      delete this._dbuWith;
      delete this._dbuViaFx;
    }
  }

  /**
   * E2 "item:<Name>": the actor's item of that name used Out-of-Sequence, spending no Action: a Maneuver, a Unique
   * Ability or an item its normal use (item.use), a Signature Technique an attack (with the options of the "signature"
   * key), a Form or Enhancement the Transformation Maneuver into it.
   */
  async _useItemOutOfSequence(name, attackOpts = {}) {
    const { itemNamed } = await import("../combat/triggers.mjs");
    const item = itemNamed(this, name);
    if ( !item ) return ui.notifications.warn(L("DBU.Trigger.Maneuver.itemMissing", { name, actor: this.name }));
    if ( item.type === "signature" ) return this.attack({ ...attackOpts, signature: item });
    if ( item.type === "transformation" ) {
      if ( item.system.transType === "awakening" ) return item.toChat();
      if ( item.system.active ) return ui.notifications.info(L("DBU.TransRule.AlreadyIn", { name: item.name }));
      return this.transform(item);
    }
    return item.use();
  }

  /** Spend Actions only while a Combat is running (not for an Out-of-Sequence Maneuver). */
  _spendAction(n) {
    if ( !game.combat?.started || this._dbuOutOfSequence ) return {};
    return { "system.combat.actions": Math.max(0, (this.system.combat.actions ?? 0) - n) };
  }

  /** Open the attack dialog. */
  async attack(options = {}) {
    return openAttackDialog(this, options);
  }

  /** Empower Maneuver: send Ki Points (or Divine Ki Points, between characters in God Ki) to the targeted Ally. */
  async empower() {
    const { empower } = await import("../combat/divine.mjs");
    return empower(this);
  }

  /* -------------------------------------------- */
  /*  Conditions and States                       */
  /* -------------------------------------------- */

  /** Set a Combat Condition's stacks and keep the token status icon in sync. */
  async setCondition(key, stacks) {
    const def = DBU.conditions[key];
    if ( !def ) return;
    const value = Math.clamp(stacks, 0, def.max);
    // SZ "conditionLock.<condition>": it cannot be removed (lowered) while the lock holds
    if ( (value < (this.system.conditions?.[key] ?? 0)) && ((this.system.buckets?.[`conditionLock.${key}`]?.total ?? 0) > 0) ) {
      ui.notifications?.info(game.i18n.format("DBU.Block.ConditionLocked", { name: this.name, what: game.i18n.localize(def.label ?? `DBU.Condition.${key}`) }));
      return;
    }
    const beforeCond = this.system.conditions?.[key] ?? 0;
    await this.update({ [`system.conditions.${key}`]: value });
    await this.toggleStatusEffect(key, { active: value > 0 }).catch(() => null);
    // (T3 "conditionGained": you gain a Combat Condition, or more stacks of it)
    if ( value > beforeCond ) (await import("../combat/triggers.mjs")).fireEvent(this, "conditionGained",
      { scope: { [`cond_${key}`]: 1, level: value, added: value - beforeCond } });
    // U: no longer Compelled, no Compelled target
    if ( (key === "compelled") && !(value > 0) && this.getFlag("dbu-rpg", "compelledBy") ) await this.unsetFlag("dbu-rpg", "compelledBy");
    // RA: no longer suffering it, nobody inflicted it
    if ( !(value > 0) && this.getFlag("dbu-rpg", `condBy.${key}`) ) await this.unsetFlag("dbu-rpg", `condBy.${key}`);
  }

  /** noLeave: a State left without its "stateLeave" triggers (the end of the encounter, a stateLeave trigger's own effect). */
  async setState(key, level, { noLeave = false, viaFx = "" } = {}) {
    const def = DBU.states[key];
    if ( !def ) return;
    const value = Math.clamp(level, 0, def.levels);
    const before = this.system.states?.[key] ?? 0;
    // F12 "stateBlock.<state>": that State cannot be entered now (Incorporeal after its Damage)
    if ( (value > 0) && !(before > 0) && ((this.system.buckets?.[`stateBlock.${key}`]?.total ?? 0) > 0) ) {
      ui.notifications.warn(L("DBU.F12.StateBlocked", { name: this.name, state: L(`DBU.State.${key}`) }));
      return;
    }
    // D1 @stateFx.<state>.<ref>: the effect a State was entered through (kept until it is entered again)
    const enterVia = viaFx || this._dbuViaFx || "";
    const enterFx = ((value > 0) && (before === 0) && (enterVia || this.flags?.["dbu-rpg"]?.stateFx?.[key]))
      ? { [`flags.dbu-rpg.stateFx.${key}`]: enterVia } : {};
    await this.update({ [`system.states.${key}`]: value, ...enterFx }, noLeave ? { dbuNoLeave: true } : {});
    await this.toggleStatusEffect(`state-${key}`, { active: value > 0 }).catch(() => null);
    // Triggers "when you enter a State"
    const via = viaFx || this._dbuViaFx;
    if ( value > before ) (await import("../combat/triggers.mjs")).fireEvent(this, "stateEnter",
      { scope: { [`state_${key}`]: 1, level: value, already: 0, ...(via ? { viaFx: { [via]: 1 } } : {}) } });
    // BB Undying (1): leaving it with 0 or negative Life Points, you are Defeated (nothing prevents it)
    if ( (key === "undying") && (before > 0) && !(value > 0) && ((this.system.life?.value ?? 1) <= 0) ) {
      if ( this.system.life.value < 0 ) await this.update({ "system.life.value": 0 }, { dbuSource: "undying" });
      await this._onDefeated();
      await postInfoCard({ actor: this, title: L("DBU.State.undying"), lines: [L("DBU.StateRule.UndyingDefeat", { name: this.name })] });
    }
  }

  /** Reset per-encounter trackers (Instant Recovery is applied by the combat end hook). */
  async resetEncounter({ instantRecovery = true } = {}) {
    // An Adversary out of its Combat Encounter goes back to the PCC of its sheet
    if ( this.type === "adversary" ) this.prepareData();
    const sys = this.system;
    const updates = {
      "system.combat.power": 0, "system.combat.powerUps": 0, "system.combat.energyCharges": 0, "system.combat.dimDefense": 0,
      "system.combat.attacksThisRound": 0, "system.combat.momentumUsed": false, "system.combat.reducedMomentum": false,
      "system.combat.surgeUsed": false, "system.combat.willToSurviveUsed": false, "system.combat.ultimatesUsed": 0,
      "system.combat.absoluteAttacks": 0, "system.combat.legendRealized": [], "system.combat.topBoost": 0,
      "system.combat.burstUsed": false,
      "system.combat.stressBonus": 0, "system.combat.actions": 3, "system.combat.counters": 1,
      "system.thresholds.bruised": "", "system.thresholds.injured": "", "system.thresholds.critical": "",
      // B5 counters of the round / turn
      "system.combat.chargesRound": 0, "system.combat.surgesRound": 0, "system.combat.damagedSinceTurn": 0,
      "system.combat.healingSurgesRound": 0
    };
    if ( instantRecovery ) {
      // "flag.noLifeRegain": no Life Points
      if ( !sys.flags?.noLifeRegain ) updates["system.life.value"] = Math.min(sys.life.cap ?? sys.life.max, sys.life.value + Math.floor(sys.life.max / 10));
      updates["system.ki.value"] = Math.min(sys.ki.cap ?? sys.ki.max, sys.ki.value + Math.floor(sys.ki.max / 10));
    }
    // G5 "resKeep.<slug>": that resource keeps its stacks after the encounter (a value the rules keep: Skill, Strength...)
    const keep = r => (sys.buckets?.[`resKeep.${resourceSlug(r.name)}`]?.total ?? 0) > 0;
    updates["system.resources"] = (sys.resources ?? []).map(r => (keep(r) ? { ...r } : { ...r, value: 0 }));
    if ( this.type === "fusion" ) updates["system.fusion.stressSaveUsed"] = false;
    // Adversaries lose their remaining Karma Points and Narrative Stamina at the end of each Combat Encounter
    if ( this.type === "adversary" ) {
      Object.assign(updates, { "system.karma.value": 0, "system.adversary.stamina": 0, "system.adversary.karmaOut": "",
        "system.adversary.pccApplied": sys.adversaryInfo?.pcc ?? sys.adversary.pcc,
        "system.life.value": Math.min(sys.life.cap ?? sys.life.max, updates["system.life.value"] ?? sys.life.value),
        "system.ki.value": Math.min(sys.ki.cap ?? sys.ki.max, updates["system.ki.value"] ?? sys.ki.value) });
    }
    await this.update(updates, { dbuEncounterEnd: true });
    // The Maximum Life Points lost for the encounter come back (Destruction, Dauntless)
    if ( this.getFlag("dbu-rpg", "maxLifeLoss") ) await this.unsetFlag("dbu-rpg", "maxLifeLoss");
    // ...and Arrogant and Unstoppable's "treated as Healthy" ends with it
    if ( this.getFlag("dbu-rpg", "asHealthy") ) await this.unsetFlag("dbu-rpg", "asHealthy");
    // B2 / B3: the round's resource counts and the Defeat already reported go with the encounter
    if ( this.getFlag("dbu-rpg", "roundRes") ) await this.unsetFlag("dbu-rpg", "roundRes");
    if ( this.getFlag("dbu-rpg", "defeatFired") ) await this.unsetFlag("dbu-rpg", "defeatFired");
    // E1 / E3: the Maneuvers and items used, and the Full Awakenings offered, go with the encounter
    for ( const f of ["maneuverUses", "grandOffered"] ) if ( this.getFlag("dbu-rpg", f) ) await this.unsetFlag("dbu-rpg", f);
    const itemUpdates = [];
    for ( const i of this.items ) {
      if ( (i.type === "signature") && i.system.usedThisEncounter ) itemUpdates.push({ _id: i.id, "system.usedThisEncounter": false });
      if ( (i.type === "transformation") && (i.system.newLevel || i.system.legendRealized || i.system.grandAwakening) ) {
        // A Grand Awakening lasts until the end of the Combat Encounter
        itemUpdates.push({ _id: i.id, "system.newLevel": false, "system.legendRealized": false, "system.grandAwakening": false });
      }
    }
    if ( itemUpdates.length ) await this.updateEmbeddedDocuments("Item", itemUpdates);
  }
}

/* -------------------------------------------- */
/*  Maneuver tuning (Package B, B5)             */
/* -------------------------------------------- */

/**
 * How the pieces of the Maneuver targets read here combine: "mult" (their product, fractions kept), "min" (the lowest
 * wins), "dice" (roll terms), "flag" (1 when any is above 0), "sum" (the default).
 */
const MANEUVER_TARGETS = {
  "charge.kp": "sum", "kpCost.maneuver": "sum", "surge.healBonus": "dice", "surge.healMult": "mult", "surge.toKi": "flag",
  "surge.vengefulDice": "dice", "surge.vengefulRange": "sum", "surge.vengefulInferiorHalf": "flag",
  "recovery.lifeMult": "mult", "recovery.minActions": "min", "recovery.actions": "sum", "flag.recoveryNoDvPenalty": "flag",
  "legend.lifeMult": "mult", "empower.actions": "sum", "flag.empowerMelee": "flag", "flag.empowerMax": "flag"
};
/** Targets a `with` may give (with "actions"), and the ones whose value is a roll formula. */
const WITH_TARGET = /^(surge|recovery|charge|legend|empower|grapple)\.|^(kpCost\.maneuver|flag\.recoveryNoDvPenalty|flag\.empowerMelee|flag\.empowerMax|actions)$/;
const DICE_WITH = new Set(["surge.healBonus", "recovery.bonus", "legend.bonus", "surge.vengefulDice"]);

/**
 * "surge.healMult=2; actions=3" → { "surge.healMult": 2, actions: 3 }: the one-shot buckets of a "maneuver" effect, worked
 * out with `data` (the targets that hold dice keep their formula). Unknown targets are left out.
 */
export function parseWith(spec, data = {}) {
  const out = {};
  for ( const part of String(spec ?? "").split(";") ) {
    const i = part.indexOf("=");
    if ( i < 1 ) continue;
    const key = part.slice(0, i).trim();
    const formula = part.slice(i + 1).trim();
    if ( !WITH_TARGET.test(key) || !formula ) continue;
    out[key] = DICE_WITH.has(key) ? String(rollExpression(formula, data)).trim() : evaluate(formula, data, { floor: false });
  }
  return out;
}

/** The roll terms a `with` adds to a target that holds dice (recovery.bonus, legend.bonus). */
function withTerms(actor, target) {
  const w = actor._dbuWith?.[target];
  return ((typeof w === "string") && w && (w !== "0")) ? [w] : [];
}

/**
 * What one use of a Maneuver reads: the formula data (with Package B's @chargesRound, @surgesRound...), the values of the
 * option boxes chosen ({ <target>: [values] }), and the limited automatic pieces that applied (counted when it is done).
 */
function maneuverCtx(actor, opts = null, extra = {}) {
  return { data: { ...(actor.system.rollData ?? {}), ...triggerData(actor), ...extra }, chosen: opts?.values ?? {}, uses: [],
    handled: opts?.handled ?? null };
}

/** The automatic pieces (no "ask", no cost) of a Maneuver target that apply now, with their value. */
function maneuverPieces(actor, target, data, how) {
  let mods = [];
  try {
    mods = collectModifiers(actor, actor.system).filter(m => (m.target === target) && (m.mode !== "ask") && !String(m.cost ?? "").trim());
  } catch(err) {
    return [];
  }
  const out = [];
  for ( const m of mods ) {
    const sc = { ...data, ...(m.ctx ?? {}) };
    if ( !test(m.condition, sc) ) continue;
    const key = `opt:${[m.itemId, m.label, m.target, m.value, m.condition].join("|")}`;
    if ( m.limit && !triggerUsesLeft(actor, { limit: m.limit, ctx: m.ctx }, key) ) continue;
    const value = (how === "dice") ? String(rollExpression(m.value, sc)).trim() : evaluate(m.value, sc, { floor: how !== "mult" });
    if ( (how === "dice") ? (!value || (value === "0")) : (!value && (how !== "mult")) ) continue;
    out.push({ value, limit: m.limit, ctx: m.ctx, key });
  }
  return out;
}

/**
 * The value of a Maneuver target for this use: its automatic pieces, the option boxes chosen and the `with` of a
 * "maneuver" effect, combined as MANEUVER_TARGETS says. undefined when nothing applies (dice: a list of roll terms).
 */
function maneuverValue(actor, target, ctx) {
  const how = MANEUVER_TARGETS[target] ?? "sum";
  const vals = [];
  // The pieces of a family rules/options.mjs went through (its automatic boxes too) come from the boxes chosen only
  if ( !(ctx.handled && target.startsWith(ctx.handled)) ) {
    for ( const p of maneuverPieces(actor, target, ctx.data, how) ) {
      vals.push(p.value);
      if ( p.limit ) ctx.uses.push(p);
    }
  }
  for ( const v of ctx.chosen?.[target] ?? [] ) vals.push(v);
  const w = actor._dbuWith?.[target];
  if ( (w !== undefined) && (w !== "") ) vals.push(w);
  if ( !vals.length ) return undefined;
  switch ( how ) {
    case "mult": return vals.reduce((a, b) => a * (Number(b) || 0), 1);
    case "min": return Math.min(...vals.map(Number).filter(Number.isFinite));
    case "flag": return vals.some(v => Number(v) > 0) ? 1 : 0;
    case "dice": return vals.map(String).filter(t => t && (t !== "0"));
    default: return vals.reduce((a, b) => a + (Number(b) || 0), 0);
  }
}

/** rules/options.mjs (Package A), loaded once; null while it does not exist. */
let OPTIONS = undefined;
async function optionsModule() {
  if ( OPTIONS !== undefined ) return OPTIONS;
  try {
    OPTIONS = await import("../rules/options.mjs");
    // Its pieces keep the fractions of the multipliers read here, and the roll formula of a target that holds dice
    for ( const [t, how] of Object.entries(MANEUVER_TARGETS) ) {
      if ( how === "mult" ) OPTIONS.OPTION_FRACTION?.add?.(t);
      if ( how === "dice" ) OPTIONS.OPTION_TEXT?.add?.(t);
    }
  } catch(err) { OPTIONS = null; }
  return OPTIONS;
}

/**
 * The pieces of a Maneuver's family ("surge.", "recovery.", "charge.") through rules/options.mjs (Package A): its
 * automatic boxes and, in one dialog, its option boxes (mode "ask", an amount; a cost, a group, a limit). The dialog opens
 * only when such a box applies; without the module, the automatic pieces are read by maneuverValue and nothing is asked.
 * Only the targets of MANEUVER_TARGETS: the ones that existed before (surge.kiMult, recovery.bonus, charge.kpMult...) are
 * summed in the sheet's buckets and read from there, so a box of theirs would change nothing (the validator refuses
 * the option fields on them).
 * @returns {Promise<{values: object, chosen: object[], plan: object|null, problems: string[], handled: string|null}|null>}
 *   null when cancelled
 */
async function maneuverOptions(actor, prefix, title, scope = {}) {
  const none = { values: {}, chosen: [], plan: null, problems: [], handled: null };
  const O = await optionsModule();
  if ( (typeof O?.optionPieces !== "function") || (typeof O?.optionDialog !== "function") ) return none;
  const sc = { ...triggerData(actor), ...scope };
  let pieces = [];
  try { pieces = (O.optionPieces(actor, prefix, sc, {}) ?? []).filter(p => p.target in MANEUVER_TARGETS); }
  catch(err) { console.warn(`DBU | ${prefix} options`, err); return none; }
  if ( !pieces.length ) return none;
  const chosen = await O.optionDialog(pieces, { title, actor, scope: sc });
  if ( !chosen ) return null;
  const data = { ...(actor.system.rollData ?? {}), ...sc };
  const values = {};
  for ( const box of chosen ) {
    const n = Number(box?.n) || 1;
    for ( const p of box?.pieces ?? [] ) {
      if ( !p?.target ) continue;
      const how = MANEUVER_TARGETS[p.target] ?? "sum";
      const v = (how === "dice") ? String(rollExpression(String(p.value ?? ""), { ...data, ...(p.ctx ?? {}), ...(p.scope ?? {}), n })).trim()
        : Number(p.value);
      if ( (how === "dice") ? (!v || (v === "0")) : !Number.isFinite(v) ) continue;
      (values[p.target] ??= []).push(v);
    }
  }
  let plan = null;
  try { plan = O.optionCostPlan?.(actor, chosen, sc) ?? null; } catch(err) { plan = null; }
  return { values, chosen, plan, problems: plan?.problems ?? [], handled: prefix, scope: sc };
}

/** After the Maneuver: pay the option boxes, count their limits and the limited automatic pieces that applied. */
async function finishManeuver(actor, ctx, opts) {
  if ( opts?.chosen?.length ) {
    const O = await optionsModule();
    // (worked out again: the Maneuver's own cost was just paid)
    const paid = await O?.payOptions?.(actor, opts.chosen, { scope: opts.scope ?? {} });
    if ( paid?.problems?.length ) ui.notifications.warn(L("DBU.Trigger.CantPay", { why: paid.problems.join(" ") }));
    else await O?.countOptionLimits?.(actor, opts.chosen);
  }
  const seen = new Set();
  for ( const p of ctx?.uses ?? [] ) {
    if ( seen.has(p.key) ) continue;
    seen.add(p.key);
    await useTriggerLimit(actor, { limit: p.limit, ctx: p.ctx }, p.key);
  }
}

/** rules/versus.mjs (Package A), loaded once; null while it does not exist. */
let VERSUS = undefined;

/**
 * WJ: the "foeGuard.steadfast" pieces of the knocked Character's Opponents that are Allies of the attacker (Wrath of the
 * Dragon: an Ally knocked it through a Health Threshold): the Dice Score of its Steadfast Check is lower by their value.
 * The attacker's own pieces are its vs.steadfast ones. Limited pieces count one use.
 */
async function foeGuardSteadfast(target, by) {
  try {
    const { allyGuards, encounterOthers } = await import("../rules/allies.mjs");
    const allies = new Set(encounterOthers(by).filter(o => o.ally).map(o => o.actor?.uuid));
    let cut = 0;
    for ( const g of allyGuards(target, "steadfast", { foe: true }) ) {
      if ( !allies.has(g.giver.uuid) ) continue;
      if ( g.limit && !triggerUsesLeft(g.giver, { limit: g.limit }, g.key) ) continue;
      cut += g.value;
      if ( g.limit ) {
        if ( g.giver.isOwner ) await useTriggerLimit(g.giver, { limit: g.limit }, g.key);
        else (await import("../socket.mjs")).emitGM("useLimit", { actorUuid: g.giver.uuid, limit: g.limit, key: g.key });
      }
    }
    return cut;
  } catch(err) {
    console.warn("DBU | foeGuard.steadfast", err);
    return 0;
  }
}
/** A1: the attacker's "vs.steadfast" pieces against the Character it knocked through a Health Threshold (0 without). */
async function versusSteadfast(by, target, scope = {}) {
  if ( VERSUS === undefined ) {
    try { VERSUS = await import("../rules/versus.mjs"); } catch(err) { VERSUS = null; }
  }
  if ( (typeof VERSUS?.versusApplied !== "function") && (typeof VERSUS?.versusSum !== "function") ) return 0;
  try {
    if ( !by ) return 0;
    if ( typeof VERSUS.versusApplied !== "function" ) return Number(VERSUS.versusSum(by, target, "vs.steadfast", scope)) || 0;
    const r = VERSUS.versusApplied(by, target, "vs.steadfast", scope);
    // The attacker's limited pieces count one use (when this client may write it)
    if ( r.pieces?.length && by.isOwner ) await VERSUS.useVersusLimits?.(by, r.pieces);
    return Number(r.total) || 0;
  } catch(err) {
    console.warn("DBU | vs.steadfast", err);
    return 0;
  }
}

export { maneuverCtx, maneuverValue };
