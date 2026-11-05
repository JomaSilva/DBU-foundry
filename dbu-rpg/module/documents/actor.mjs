import { DBU } from "../config.mjs";
import { dbuRoll, postInfoCard } from "../dice/roller.mjs";
import { openAttackDialog, applyDamageToActor } from "../combat/attack.mjs";
import { categoryToDice } from "../rules/dice.mjs";
import { addTimedCondition, addTimedPower, dropTimedPower, encounterOf, inCombat, renewTimedPower } from "../combat/triggers.mjs";
import { footLegProne, offerRegeneratorRemoval } from "../combat/injuries.mjs";

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
    }
    // Clamp current pools to their maximums (Capacity Rate is handled by the actions themselves)
    for ( const pool of ["ki", "capacity"] ) {
      const path = `system.${pool}.value`;
      if ( foundry.utils.hasProperty(changed, path) ) {
        const v = foundry.utils.getProperty(changed, path);
        const max = this.system[pool]?.max ?? v;
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
      if ( now !== options.dbuOldLife ) this._processThresholds(options.dbuOldLife, now, options).catch(console.error);
    }
    if ( (this.type === "adversary") && (options.dbuOldKarma > 0) && (this.system.karma.value === 0) && !options.dbuEncounterEnd ) {
      import("../combat/adversary.mjs").then(m => m.villainousKarmaOut(this)).catch(console.error);
    }
    this._notifyNewProblems();
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
    const fractions = DBU.THRESHOLD_FRACTIONS;
    // Rising above a Health Threshold removes its Steadfast mark
    if ( newLife > oldLife ) {
      for ( const k of DBU.thresholds ) {
        if ( (newLife > max * fractions[k]) && this.system.thresholds[k] ) updates[`system.thresholds.${k}`] = "";
      }
      if ( Object.keys(updates).length ) await this.update(updates);
      return;
    }
    const crossed = DBU.thresholds.filter(k => (oldLife > max * fractions[k]) && (newLife <= max * fractions[k]));
    if ( !crossed.length ) return;
    const self = !!options.dbuDamage?.selfInflicted || !!options.dbuSelfInflicted;
    const lines = [];
    const defeated = (newLife <= 0) && !((this.system._effectiveStates?.undying ?? 0) > 0);
    const autoPassBruised = this.system.flags.autoPassBruised;
    let anyFail = false;
    let lowestResult = null;

    if ( defeated ) {
      for ( const k of crossed ) {
        const pass = (k === "bruised") && autoPassBruised;
        updates[`system.thresholds.${k}`] = pass ? "pass" : "fail";
        anyFail ||= !pass;
      }
      lines.push(L("DBU.Threshold.DefeatedAll"));
    }
    else {
      // Massive Damage: every Threshold except the lowest is an automatic failure
      const lowest = crossed[crossed.length - 1];
      for ( const k of crossed.slice(0, -1) ) {
        const pass = (k === "bruised") && autoPassBruised;
        updates[`system.thresholds.${k}`] = pass ? "pass" : "fail";
        anyFail ||= !pass;
        lines.push(L(pass ? "DBU.Threshold.AutoPass" : "DBU.Threshold.AutoFail", { t: L(`DBU.Threshold.${k}`) }));
      }
      if ( (lowest === "bruised") && autoPassBruised ) {
        updates["system.thresholds.bruised"] = "pass";
        lines.push(L("DBU.Threshold.AutoPass", { t: L("DBU.Threshold.bruised") }));
      }
      else {
        lowestResult = await this.rollSteadfast({ threshold: lowest, silent: false });
        updates[`system.thresholds.${lowest}`] = lowestResult.success ? "pass" : "fail";
        anyFail ||= !lowestResult.success;
      }
    }
    await this.update(updates);
    // Dauntless (Villainous Trait): no Reduced Momentum
    const V = await import("../combat/villainous.mjs");
    if ( self && game.combat?.started && !V.traitOf(this, "Dauntless") ) await this.update({ "system.combat.reducedMomentum": true });
    // Injury System, Foot/Leg Major Injury: failing a Steadfast Check knocks you Prone
    if ( anyFail && !defeated && (await footLegProne(this)) ) lines.push(L("DBU.Injury.FootLegProne"));

    const transformed = this.system.transformation.active.length > 0;
    const buttons = [];
    if ( transformed && (anyFail || crossed.length > 1) && !defeated ) {
      buttons.push({ action: "stressTest", label: L("DBU.Threshold.ForcedStress"), icon: "fa-solid fa-bolt", actorUuid: this.uuid });
      lines.push(L("DBU.Threshold.ForcedStressText"));
      await this.addPending("stressTest");
    }
    if ( defeated ) lines.push(L("DBU.Threshold.Defeated", { name: this.name }));
    if ( lines.length || buttons.length ) {
      await postInfoCard({ actor: this, title: L("DBU.Threshold.Title", { name: this.name }), lines, buttons });
    }
    // Forceful Defusion: a Fusion that fails the Steadfast Check of the Injured or Critical Threshold, or is Defeated
    const forced = (this.type === "fusion") && this.system.fusion.active
      && (defeated || ["injured", "critical"].some(k => updates[`system.thresholds.${k}`] === "fail"));
    if ( forced ) {
      const { defuse } = await import("../fusion/fusion.mjs");
      await defuse(this, { reason: "forced" });
      return;
    }
    if ( defeated ) await this._onDefeated();
    // Born for Battle (Saiyan): knocked through the Critical Health Threshold → a Temporary stack of Zenkai
    if ( crossed.includes("critical") ) {
      const { bornForBattle } = await import("../combat/awakening.mjs");
      await bornForBattle(this);
    }
    // Villainous Traits: Desperate Adversary, Dauntless, Second Phase
    await V.villainousThresholds(this, crossed, defeated);
  }

  async _onDefeated() {
    // Defeat: leave every Form and Enhancement
    const updates = this.system.transformation.active.map(t => ({ _id: t.id, "system.active": false }));
    if ( updates.length ) await this.updateEmbeddedDocuments("Item", updates);
    await this.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: true, overlay: true }).catch(() => null);
  }

  /* -------------------------------------------- */
  /*  Rolls                                       */
  /* -------------------------------------------- */

  /**
   * Strike/Dodge/Wound without an attack (free rolls from the sheet, and the Clashes of Maneuvers: extra parts such
   * as a penalty, and the Maneuver as subtitle).
   */
  async rollCombat(type, { foundation = "physical", extra = [], subtitle } = {}) {
    const sys = this.system;
    const r = type === "wound" ? sys.rolls.wound[foundation] : sys.rolls[type];
    const parts = [...r.parts];
    if ( type === "strike" ) parts.push({ label: L(DBU.foundations[foundation]), value: sys.rolls[`strike_${foundation}`] ?? 0 });
    parts.push(...extra.filter(p => p?.value));
    return dbuRoll({
      actor: this, kind: type, title: L(`DBU.Roll.${type.capitalize()}`),
      subtitle: subtitle ?? (type !== "dodge" ? L(DBU.foundations[foundation]) : ""),
      naturalMod: r.natural, critTarget: r.crit, botchRange: r.botch, diceGroups: r.dice, parts,
      critDice: r.critDice, botchPenalty: r.botchPenalty
    });
  }

  /**
   * Skill Check. penalty: lowers the Dice Score (Pickpocket against the same Character again); subtitle replaces the
   * usual one; messageMode: "gmroll" / "blindroll" for a roll the player should not see.
   */
  async rollSkill(key, { difficulty, penalty = 0, penaltyLabel = "", subtitle, messageMode } = {}) {
    const S = this.system.skills[key];
    if ( !S ) return null;
    if ( S.autoFail ) {
      await postInfoCard({ actor: this, title: `${S.label}`, lines: [L("DBU.Skill.AutoFail", { skill: S.label })] });
      return { total: 0, autoFail: true };
    }
    const def = DBU.skills[key];
    const parts = [
      { label: L(DBU.attributes[def.attr]) + " (½)", value: S.attrBonus },
      { label: L("DBU.Skill.Ranks", { n: S.effectiveRanks }), value: S.rankBonus },
      { label: "Gifted Student", value: this.system.giftedStudent },
      { label: L("DBU.Bonus"), value: S.total - S.attrBonus - S.rankBonus - this.system.giftedStudent }
    ];
    if ( penalty ) parts.push({ label: penaltyLabel || L("DBU.Penalty"), value: -penalty });
    const tn = difficulty ? DBU.difficulties[difficulty]?.tn : undefined;
    return dbuRoll({
      actor: this, kind: "skill", title: S.label,
      subtitle: subtitle ?? (tn ? `${L(DBU.difficulties[difficulty].label)} (TN ${tn})` : L("DBU.Roll.SkillCheck")),
      critTarget: S.crit, botchRange: S.botch, parts,
      critDice: [{ number: 1, faces: 4 }], botchPenalty: 2, target: tn, messageMode
    });
  }

  async rollSave(key) {
    const s = this.system.saves[key];
    const r = this.system.rolls.strike; // ToP dice and crit dice are shared by every Clash roll
    return dbuRoll({
      actor: this, kind: "save", title: L("DBU.Roll.Save", { save: L(DBU.saves[key].label) }),
      critTarget: s.crit, botchRange: s.botch, diceGroups: r.dice, parts: s.parts,
      critDice: r.critDice, botchPenalty: 2 * this.system.top.base
    });
  }

  /** Might Clash or an Attribute Modifier Clash (extra: bonuses to its Dice Score, such as Forceful Launch). */
  async rollClash(what = "might", { extra = [], subtitle = "" } = {}) {
    const sys = this.system;
    const value = what === "might" ? sys.aptitudes.might : sys.attributes[what].mod;
    const label = what === "might" ? "Might" : L(DBU.attributes[what]);
    const r = sys.rolls.strike;
    return dbuRoll({
      actor: this, kind: "clash", title: L("DBU.Roll.Clash", { what: label }), subtitle,
      critTarget: 10, botchRange: 1, diceGroups: r.dice, parts: [{ label, value }, ...extra.filter(p => p?.value)],
      critDice: r.critDice, botchPenalty: 2 * sys.top.base
    });
  }

  /** Steadfast Check: 1d10, success on 6+. */
  async rollSteadfast({ threshold = null, penalty = 0 } = {}) {
    const bonus = (this.system.stress?.steadfast ?? 0) + penalty;
    const r = await dbuRoll({
      actor: this, kind: "steadfast", title: L("DBU.Roll.Steadfast"),
      subtitle: threshold ? L(`DBU.Threshold.${threshold}`) : "",
      noCrit: true, noBotch: true, parts: bonus ? [{ label: L("DBU.Bonus"), value: bonus }] : [], target: 6
    });
    return { ...r, success: r.total >= 6 };
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
    const r = await dbuRoll({
      actor: this, kind: "stress", title: L("DBU.Roll.Stress"),
      subtitle: transformation ? transformation.name : sys.transformation.active.map(t => t.name).join(" + "),
      noCrit: true, noBotch: true, parts, target: req
    });
    let success = r.total >= req;
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
        if ( entry === undefined ) r += 2 * (g - 1);
        else if ( entry.startsWith("+") ) r += Number(entry.slice(1)) || 0;
        else r = Number(entry) || r;
      }
      if ( t.system.prelude && t.system.aspects.some(a => a.key === "prelude") ) r -= 3;
      const scaling = t.system.aspects.find(a => a.key === "scaling");
      if ( scaling ) r += 2 * Math.max(0, Math.min(Math.max(1, scaling.level), sys.top.current - t.system.topReq));
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
  async transform(item, { grade, free = false, stressPenalty = 0 } = {}) {
    const sys = this.system;
    const ts = item.system;
    const problems = [];
    if ( ts.transType === "awakening" ) return ui.notifications.info(L("DBU.Trans.AwakeningAlways"));
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

    // Legend Realized: first time per Combat Encounter in each Form
    const lines = [L("DBU.Trans.Entered", { name: item.name })];
    if ( firstEver ) lines.push(L(ts.transType === "form" ? "DBU.Trans.NewLevelForm" : "DBU.Trans.NewLevelEnhancement"));
    // Still pending: it only happens in a Combat Encounter
    else if ( item.system.newLevelPending ) lines.push(L("DBU.Trans.NewLevelWaiting"));
    if ( (ts.transType === "form") && (ts.stage !== 0) && game.combat?.started ) {
      const used = new Set(sys.combat.legendRealized ?? []);
      // Not again from a Form of the same Form Type and Tier of Power Requirement as one used this encounter
      const twin = Array.from(used).map(id => this.items.get(id)).find(t => t && (t.id !== item.id)
        && (t.system.subtype === ts.subtype) && (t.system.topReq === ts.topReq));
      if ( twin ) lines.push(L("DBU.Trans.LegendSameType", { name: twin.name }));
      if ( !used.has(item.id) && !twin ) {
        const T = this.system.top.current;
        const r = await new Roll(`${2 * T}d10 + ${this.system.pl}`).evaluate();
        // Narrative Transformation (Villainous Trait) [1/Encounter]: twice the Life and Ki Points
        let amount = r.total * (newLevel ? 2 : 1) * ((await V.narrativeDouble(this)) ? 2 : 1);
        await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor: `Legend Realized — ${item.name}` });
        used.add(item.id);
        await this.update({
          "system.life.value": Math.min(this.system.life.max, this.system.life.value + amount),
          "system.ki.value": Math.min(this.system.ki.max, this.system.ki.value + amount),
          "system.combat.legendRealized": Array.from(used)
        });
        lines.push(L("DBU.Trans.LegendRealized", { n: amount }));
      }
    }
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
      await this.update({
        "system.life.value": Math.min(sys.life.max, sys.life.value + Math.floor(sys.life.max / 2)),
        "system.ki.value": Math.min(sys.ki.max, sys.ki.value + Math.floor(sys.ki.max / 2))
      });
      await postInfoCard({ actor: this, title: item.name, img: item.img, lines: [L("DBU.Trans.NewLevelAwakening")] });
    }
    return true;
  }

  async revert(item = null) {
    const sys = this.system;
    const list = item ? [item] : sys.transformation.active;
    const updates = list.map(t => ({ _id: t.id, "system.active": false }));
    if ( !updates.length ) return;
    await this.updateEmbeddedDocuments("Item", updates);
    const exhausting = list.some(t => t.system.aspects.some(a => a.key === "exhausting"));
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
    await postInfoCard({ actor: this, title: L("DBU.Trans.Revert"), lines: list.map(t => t.name) });
  }

  /* -------------------------------------------- */
  /*  Maneuvers                                   */
  /* -------------------------------------------- */

  /**
   * Power Up Maneuver [2/Round]: +1 stack of Power until the end of your next turn (max 2). At the limit a stack is
   * removed and gained again, which renews its duration. Capacity Rate applies to the new Max Capacity. With Tier of
   * Power 2+, the weaker Scouters near the character are destroyed (combat/scan.mjs).
   */
  async powerUp() {
    const sys = this.system;
    const fighting = inCombat(this);
    if ( fighting && ((sys.combat.powerUps ?? 0) >= 2) ) return ui.notifications.warn(L("DBU.Power.RoundLimit"));
    const used = fighting ? { "system.combat.powerUps": (sys.combat.powerUps ?? 0) + 1 } : {};
    let card;
    if ( (sys.combat.power ?? 0) >= 2 ) {
      await this.update({ ...this._spendAction(1), ...used });
      if ( fighting ) await renewTimedPower(this);
      card = await postInfoCard({ actor: this, title: "Power Up", lines: [L("DBU.Power.Renewed", { n: sys.combat.power })] });
    }
    else {
      const gain = await this.gainPower(1, { updates: { ...this._spendAction(1), ...used } });
      card = await postInfoCard({ actor: this, title: "Power Up", lines: [L("DBU.Power.Gained", { n: this.system.combat.power, cap: gain })] });
    }
    try {
      const { scoutersNearPowerUp } = await import("../combat/scan.mjs");
      await scoutersNearPowerUp(this);
    } catch(err) {
      console.error("DBU | Scouters near the Power Up", err);
    }
    return card;
  }

  /** Gain stacks of Power (each lasts until the end of your next turn during combat). Returns the Capacity gained. */
  async gainPower(n = 1, { updates = {} } = {}) {
    const sys = this.system;
    const oldMax = sys.capacity.max;
    await this.update({ "system.combat.power": (sys.combat.power ?? 0) + n, ...updates });
    const gain = this.system.capacity.max - oldMax;
    if ( gain > 0 ) await this.update({ "system.capacity.value": Math.min(this.system.capacity.max, this.system.capacity.value + gain) });
    if ( inCombat(this) ) await addTimedPower(this, n);
    return gain;
  }

  /** Set the stacks of Power from the sheet checkboxes. */
  async setPower(n) {
    const cur = this.system.combat.power ?? 0;
    n = Math.max(0, n);
    if ( n > cur ) return this.gainPower(n - cur);
    if ( n === cur ) return 0;
    await this.update({ "system.combat.power": n });
    if ( this.system.capacity.value > this.system.capacity.max ) await this.update({ "system.capacity.value": this.system.capacity.max });
    await dropTimedPower(this, cur - n);
    return 0;
  }

  /** Energy Charge Maneuver: 2(bT) KP (or Divine Ki Points, if preferred in the God Ki State), +1 Energy Charge, Guard Down until the attack. */
  async energyCharge() {
    const sys = this.system;
    const cost = 2 * sys.top.base;
    const { kiPayment } = await import("../combat/divine.mjs");
    const pay = kiPayment(sys, cost, { divine: !!(sys.dkp?.usable && sys.dkp.prefer) });
    if ( pay.problems.length ) return ui.notifications.error(pay.problems.join(" "));
    await this.update({
      ...pay.updates,
      "system.combat.energyCharges": (sys.combat.energyCharges ?? 0) + 1, "system.conditions.guardDown": 1,
      ...this._spendAction(1)
    });
    await this.toggleStatusEffect("guardDown", { active: true }).catch(() => null);
    return postInfoCard({ actor: this, title: "Energy Charge", lines: [L("DBU.Charge.Gained", { n: this.system.combat.energyCharges, kp: cost })] });
  }

  /** Surge Maneuver [1/Encounter]: Healing Surge (2d10(T) LP) or Ki Surge (1/4 KP and Capacity), plus Surgency. */
  async surge(type = "healing") {
    const sys = this.system;
    if ( sys.combat.surgeUsed && game.combat?.started ) ui.notifications.warn(L("DBU.Surge.Used"));
    const surgency = sys.aptitudes.surgency;
    const lines = [];
    if ( type === "healing" ) {
      const r = await new Roll(`${2 * sys.top.current}d10 + ${surgency}`).evaluate();
      await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor: `Healing Surge (Surgency ${surgency})` });
      await this.update({ "system.life.value": Math.min(sys.life.max, sys.life.value + r.total), "system.combat.surgeUsed": true });
      // Injury System, Regenerator: a Healing Surge may end one Injury
      await offerRegeneratorRemoval(this);
      return r;
    }
    const ki = Math.floor(sys.ki.max / 4) + surgency;
    const cap = Math.floor(sys.capacity.max / 4);
    await this.update({
      "system.ki.value": Math.min(sys.ki.max, sys.ki.value + ki),
      "system.capacity.value": Math.min(sys.capacity.max, sys.capacity.value + cap),
      "system.combat.surgeUsed": true
    });
    lines.push(L("DBU.Surge.Ki", { ki, cap }));
    return postInfoCard({ actor: this, title: "Ki Surge", lines });
  }

  /** Combat Recovery [1/Round]: 2–3 Actions, regain 1d10(bT) Life and Ki per Action. */
  async combatRecovery() {
    const sys = this.system;
    const choice = await DialogV2.wait({
      window: { title: "Combat Recovery" },
      content: `<div class="dbu-dialog"><p>${L("DBU.Recovery.Text")}</p>
        <div class="form-group"><label>${L("DBU.Recovery.Actions")}</label>
          <select name="actions"><option value="2">2</option><option value="3">3</option></select></div>
        <label><input type="checkbox" name="condition"> ${L("DBU.Recovery.Condition")}</label></div>`,
      buttons: [{ action: "ok", label: L("DBU.Roll.Roll"), default: true,
        callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
      { action: "cancel", label: L("Cancel") }],
      rejectClose: false
    });
    if ( !choice || choice === "cancel" ) return;
    const n = Number(choice.actions) || 2;
    const bT = sys.top.base;
    if ( choice.condition ) {
      const st = await this.rollSteadfast();
      return postInfoCard({ actor: this, title: "Condition Recovery",
        lines: [st.success ? L("DBU.Recovery.ConditionOk", { n }) : L("DBU.Recovery.ConditionFail")] });
    }
    const r = await new Roll(`${n * bT}d10`).evaluate();
    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor: `Combat Recovery (${n} ${L("DBU.Actions")})` });
    await this.update({
      "system.life.value": Math.min(sys.life.max, sys.life.value + r.total),
      "system.ki.value": Math.min(sys.ki.max, sys.ki.value + r.total),
      ...this._spendAction(n)
    });
    return postInfoCard({ actor: this, title: "Combat Recovery", lines: [L("DBU.Recovery.Result", { n: r.total, dv: n * sys.top.current })] });
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

  /** Spend Actions only while a Combat is running. */
  _spendAction(n) {
    if ( !game.combat?.started ) return {};
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
    await this.update({ [`system.conditions.${key}`]: value });
    await this.toggleStatusEffect(key, { active: value > 0 }).catch(() => null);
  }

  async setState(key, level) {
    const def = DBU.states[key];
    if ( !def ) return;
    const value = Math.clamp(level, 0, def.levels);
    await this.update({ [`system.states.${key}`]: value });
    await this.toggleStatusEffect(`state-${key}`, { active: value > 0 }).catch(() => null);
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
      "system.thresholds.bruised": "", "system.thresholds.injured": "", "system.thresholds.critical": ""
    };
    if ( instantRecovery ) {
      updates["system.life.value"] = Math.min(sys.life.max, sys.life.value + Math.floor(sys.life.max / 10));
      updates["system.ki.value"] = Math.min(sys.ki.max, sys.ki.value + Math.floor(sys.ki.max / 10));
    }
    updates["system.resources"] = (sys.resources ?? []).map(r => ({ ...r, value: 0 }));
    if ( this.type === "fusion" ) updates["system.fusion.stressSaveUsed"] = false;
    // Adversaries lose their remaining Karma Points and Narrative Stamina at the end of each Combat Encounter
    if ( this.type === "adversary" ) {
      Object.assign(updates, { "system.karma.value": 0, "system.adversary.stamina": 0, "system.adversary.karmaOut": "",
        "system.adversary.pccApplied": sys.adversaryInfo?.pcc ?? sys.adversary.pcc,
        "system.life.value": Math.min(sys.life.max, updates["system.life.value"] ?? sys.life.value),
        "system.ki.value": Math.min(sys.ki.max, updates["system.ki.value"] ?? sys.ki.value) });
    }
    await this.update(updates, { dbuEncounterEnd: true });
    // The Maximum Life Points lost for the encounter come back (Destruction, Dauntless)
    if ( this.getFlag("dbu-rpg", "maxLifeLoss") ) await this.unsetFlag("dbu-rpg", "maxLifeLoss");
    // ...and Arrogant and Unstoppable's "treated as Healthy" ends with it
    if ( this.getFlag("dbu-rpg", "asHealthy") ) await this.unsetFlag("dbu-rpg", "asHealthy");
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
