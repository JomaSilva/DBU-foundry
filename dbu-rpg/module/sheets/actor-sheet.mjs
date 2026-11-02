import { DBU } from "../config.mjs";
import { categoryLabel } from "../rules/dice.mjs";
import { checkPrerequisites, raceMatches } from "../rules/validation.mjs";
import { AGE_CATEGORIES, INJURY_TYPES, OPTIONAL_RULES, OptionalRulesConfig, STANCES, rules } from "../optional-rules.mjs";
import { triggerOptions } from "./item-sheet.mjs";
import { powerTimers } from "../combat/triggers.mjs";
import { changeStacks, openAllocationDialog } from "../combat/stacks.mjs";
import { newResource } from "../rules/resources.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

export class DBUActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["dbu", "sheet", "actor"],
    position: { width: 960, height: 860 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      roll: DBUActorSheet.#onRoll,
      attack: DBUActorSheet.#onAttack,
      itemCreate: DBUActorSheet.#onItemCreate,
      itemEdit: DBUActorSheet.#onItemEdit,
      itemDelete: DBUActorSheet.#onItemDelete,
      itemUse: DBUActorSheet.#onItemUse,
      itemChat: DBUActorSheet.#onItemChat,
      itemToggle: DBUActorSheet.#onItemToggle,
      itemStack: DBUActorSheet.#onItemStack,
      condition: DBUActorSheet.#onCondition,
      state: DBUActorSheet.#onState,
      pool: DBUActorSheet.#onPool,
      maneuver: DBUActorSheet.#onManeuver,
      threshold: DBUActorSheet.#onThreshold,
      addModifier: DBUActorSheet.#onAddModifier,
      removeModifier: DBUActorSheet.#onRemoveModifier,
      addResource: DBUActorSheet.#onAddResource,
      removeResource: DBUActorSheet.#onRemoveResource,
      manualDamage: DBUActorSheet.#onManualDamage,
      openCompendium: DBUActorSheet.#onOpenCompendium,
      gotoTab: DBUActorSheet.#onGotoTab,
      openOptionalRules: () => new OptionalRulesConfig().render({ force: true }),
      addInjury: DBUActorSheet.#onAddInjury,
      removeInjury: DBUActorSheet.#onRemoveInjury,
      altLife: function() { return this.actor.rollAltLife(); },
      gag: function() { return this.actor.gag(); },
      alert: function(event, target) { return this.actor.resolveAlert(target.dataset.alert); },
      dismissPending: function(event, target) { return this.actor.removePending(target.dataset.key); },
      addTrigger: DBUActorSheet.#onAddTrigger,
      removeTrigger: DBUActorSheet.#onRemoveTrigger,
      powerBox: DBUActorSheet.#onPowerBox,
      resourceStack: DBUActorSheet.#onResourceStack,
      allocate: DBUActorSheet.#onAllocate
    }
  };

  static PARTS = {
    header: { template: "systems/dbu-rpg/templates/actor/header.hbs" },
    alerts: { template: "systems/dbu-rpg/templates/actor/alerts.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: "systems/dbu-rpg/templates/actor/tab-main.hbs", scrollable: [""] },
    skills: { template: "systems/dbu-rpg/templates/actor/tab-skills.hbs", scrollable: [""] },
    combat: { template: "systems/dbu-rpg/templates/actor/tab-combat.hbs", scrollable: [""] },
    techniques: { template: "systems/dbu-rpg/templates/actor/tab-techniques.hbs", scrollable: [""] },
    transformations: { template: "systems/dbu-rpg/templates/actor/tab-transformations.hbs", scrollable: [""] },
    traits: { template: "systems/dbu-rpg/templates/actor/tab-traits.hbs", scrollable: [""] },
    gear: { template: "systems/dbu-rpg/templates/actor/tab-gear.hbs", scrollable: [""] },
    progression: { template: "systems/dbu-rpg/templates/actor/tab-progression.hbs", scrollable: [""] },
    optional: { template: "systems/dbu-rpg/templates/actor/tab-optional.hbs", scrollable: [""] },
    bio: { template: "systems/dbu-rpg/templates/actor/tab-bio.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-user" },
        { id: "skills", icon: "fa-solid fa-list-check" },
        { id: "combat", icon: "fa-solid fa-hand-fist" },
        { id: "techniques", icon: "fa-solid fa-burst" },
        { id: "transformations", icon: "fa-solid fa-fire-flame-curved" },
        { id: "traits", icon: "fa-solid fa-dna" },
        { id: "gear", icon: "fa-solid fa-suitcase" },
        { id: "progression", icon: "fa-solid fa-scale-balanced" },
        { id: "optional", icon: "fa-solid fa-list-check" },
        { id: "bio", icon: "fa-solid fa-book-open" }
      ],
      initial: "main",
      labelPrefix: "DBU.Tab"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const sys = actor.system;
    const TE = foundry.applications.ux.TextEditor.implementation;
    const items = Array.from(actor.items).sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const byType = type => items.filter(i => i.type === type);

    // Attributes
    const attributes = DBU.ATTRIBUTES.map(key => {
      const A = sys.attributes[key];
      return {
        key, label: L(DBU.attributes[key]), abbr: DBU.attributeAbbr[key],
        points: A.points, bonus: A.bonus, racial: A.racial, score: A.score, mod: A.mod, limit: A.limit,
        over: A.score > A.limit, modChanged: A.mod !== A.score,
        modTip: [`Score ${A.score}`, ...A.modParts.map(p => `${p.label}: ${p.value >= 0 ? "+" : ""}${p.value}`)].join("<br>")
      };
    });

    const saves = Object.entries(DBU.saves).map(([key, def]) => ({
      key, label: L(def.label), attr: DBU.attributeAbbr[def.attr], ...sys.saves[key],
      tip: sys.saves[key].parts.map(p => `${p.label}: ${p.value >= 0 ? "+" : ""}${p.value}`).join("<br>")
    }));

    const skills = Object.entries(DBU.skills).map(([key, def]) => {
      const S = sys.skills[key];
      return {
        key, ...S, attr: DBU.attributeAbbr[def.attr], maneuver: def.maneuver ?? "",
        custom: !!def.custom, group: def.group ?? "", overCap: S.totalRanks > sys.skillRankCap,
        unlocked: S.totalRanks >= 2
      };
    });

    const rollInfo = (r) => ({
      bonus: r.bonus, signed: (r.bonus >= 0 ? "+" : "") + r.bonus,
      dice: r.dice.map(g => g.dice.map(d => `${d.number}d${d.faces}`).join("+")).filter(Boolean).join(" + "),
      crit: r.crit, botch: r.botch,
      tip: r.parts.filter(p => p.value).map(p => `${p.label}: ${p.value >= 0 ? "+" : ""}${p.value}`).join("<br>")
    });
    const combatRolls = {
      strike: rollInfo(sys.rolls.strike),
      dodge: rollInfo(sys.rolls.dodge),
      wound: Object.fromEntries(Object.keys(DBU.foundations).map(f => [f, rollInfo(sys.rolls.wound[f])]))
    };

    const conditions = Object.entries(DBU.conditions).map(([key, def]) => ({
      key, label: L(`DBU.Condition.${key}`), hint: L(`DBU.ConditionHint.${key}`), img: def.img, max: def.max,
      value: sys.effectiveConditions[key], active: sys.effectiveConditions[key] > 0,
      pips: def.max > 1 ? Array.from({ length: def.max }, (_, i) => ({ n: i + 1, on: i < sys.effectiveConditions[key] })) : null
    }));
    const states = Object.entries(DBU.states).map(([key, def]) => ({
      key, label: L(`DBU.State.${key}`), hint: L(`DBU.StateHint.${key}`), img: def.img, max: def.levels,
      value: sys.states[key], effective: sys._effectiveStates?.[key] ?? sys.states[key],
      active: (sys._effectiveStates?.[key] ?? sys.states[key]) > 0, special: !!def.special,
      pips: def.levels > 1 ? Array.from({ length: def.levels }, (_, i) => ({ n: i + 1, on: i < sys.states[key] })) : null
    }));

    // Items
    const race = byType("race")[0] ?? null;
    const signatures = byType("signature").map(i => ({
      item: i, c: i.system.computed, profile: DBU.profiles[i.system.profile]?.label ?? "?",
      kp: Math.max(0, Math.ceil(((i.system.computed?.kpUnits ?? 0) + (i.system.computed?.kpAdjust ?? 0)) * sys.top.kp) + sys.costs.attack),
      level: L(`DBU.Sig.Level.${i.system.level}`), problems: (i.system.computed?.errors?.length ?? 0)
    }));
    const transformations = byType("transformation").map(i => {
      const s = i.system;
      const bonuses = DBU.ATTRIBUTES.filter(a => s.bonuses[a] && !["–", "-", ""].includes(s.bonuses[a].trim()))
        .map(a => `${DBU.attributeAbbr[a]} ${s.bonuses[a]}`).join(", ");
      return {
        item: i, s, bonuses,
        aspects: s.aspects.map(a => a.name || DBU.aspects[a.key]?.label || a.key).join(", "),
        stress: s.transType === "awakening" ? null : actor.stressRequirement(i),
        canEnter: (s.transType !== "awakening") && (sys.top.current >= (s.topReq - (s.prelude ? 1 : 0))),
        raceOk: raceMatches(s.race, race),
        typeLabel: L(DBU.transformationTypes[s.transType] ?? s.transType),
        mastered: s.mastery >= s.masteryNeeded ? "full" : (s.mastery > 0 ? "partial" : "none")
      };
    });
    const groupTrans = type => transformations.filter(t => t.s.transType === type);

    const talents = byType("talent").map(i => ({ item: i, problems: checkPrerequisites(i, sys, actor) }));
    const uas = byType("uniqueAbility").map(i => ({ item: i, tp: i.system.tpSpent, problems: checkPrerequisites(i, sys, actor) }));

    const validation = sys.validation ?? [];
    const valBy = level => validation.filter(v => v.level === level);

    const modifierTargets = Object.entries(DBU.modifierTargets).map(([k, v]) => ({ value: k, label: `${L(v)} [${k}]` }));

    const prog = sys.progression;
    const R = rules();
    const ki = sys.ki.value;
    const kiBase = sys.rollData?.kiMaxBase ?? sys.ki.max;
    const stamina = ki < kiBase / 20 ? "Dire" : ki < kiBase / 10 ? "Exhausted" : ki < kiBase / 4 ? "Tired" : ki < kiBase / 2 ? "Worn" : "Energetic";
    const lifeFrac = sys.life.value / Math.max(1, sys.life.max);
    const horde = lifeFrac < 0.1 ? "Empty Horde (1×1)" : lifeFrac < 0.25 ? "Decimated Horde (2×2)" : lifeFrac < 0.5 ? "Weakened Horde (3×3)"
      : lifeFrac < 0.75 ? "Trimmed Horde (4×4)" : "Full Horde (5×5)";
    // Combat this actor takes part in (round / turn shown on the sheet)
    const combat = game.combats?.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid)) ?? null;
    const combatInfo = combat ? {
      round: combat.round,
      isTurn: combat.combatant?.actor?.uuid === actor.uuid,
      current: combat.combatant?.name ?? ""
    } : null;
    // Power: one checkbox per stack (2, or more when an effect lets you exceed it); each stack shows when it ends
    const power = sys.combat.power ?? 0;
    const timers = powerTimers(actor);
    const powerBoxes = Array.fromRange(Math.max(2, power), 1).map(n => ({
      n, on: n <= power,
      tip: (n <= power) ? (timers[n - 1] ? L("DBU.Power.Lasts", { round: timers[n - 1].round }) : L("DBU.Power.Stack")) : L("DBU.Power.Add")
    }));
    // Resources: split ones (Battle Born...) show their stacks on each Combat Roll with its limit
    const resourceRows = (sys.resources ?? []).map((r, i) => ({
      i, r: sys._source.resources[i], split: r.split, total: r.value, unassigned: r.unassigned,
      rolls: r.split ? DBU.splitRolls.map(k => {
        const cap = r.caps?.[k] ?? Infinity;
        return { k, label: L(`DBU.Split.${k}`), n: r.alloc[k], name: `system.resources.${i}.alloc.${k}`,
          cap: Number.isFinite(cap) ? cap : "∞", over: r.alloc[k] > cap, forced: r.forceEff === k };
      }) : []
    }));
    Object.assign(context, {
      ...triggerOptions(),
      combatInfo,
      powerBoxes, powerNext: power + 1, powerCanExceed: power >= 2,
      resourceRows,
      rules: R,
      optionalEnabled: Object.entries(OPTIONAL_RULES).filter(([k]) => R[k])
        .map(([k, d]) => ({ key: k, label: L(`DBU.Opt.${k}`), url: `${DBU.SITE}${d.slug}/` })),
      ageOptions: AGE_CATEGORIES.map(a => ({ value: a, label: L(`DBU.Age.${a}`) })),
      injuryOptions: INJURY_TYPES.map(t => ({ value: t, label: L(`DBU.Injury.${t}`) })),
      stanceOptions: STANCES.map(s => ({ value: s, label: L(`DBU.Stance.${s}`) })),
      buyoutOptions: Object.entries(DBU.profiles).filter(([, p]) => p.foundations.length === 1).map(([k, p]) => ({ value: k, label: p.label })),
      worldGravity: game.settings.get("dbu-rpg", "gravityIntensity"),
      epTotal: 2 * sys.top.base,
      staminaLabel: `${stamina} (${ki}/${kiBase})`,
      hordeLabel: horde,
      actor, system: sys, source: sys._source, config: DBU, editable: this.isEditable, owner: actor.isOwner,
      isGM: game.user.isGM, isNPC: actor.type === "npc",
      attributes, saves, skills, combatRolls, conditions, states,
      race, racialTraits: byType("racialTrait"), talents, uas, signatures,
      maneuvers: byType("maneuver"),
      awakenings: groupTrans("awakening"), enhancements: groupTrans("enhancement"), forms: groupTrans("form"),
      evolved: groupTrans("evolved"),
      weapons: byType("weapon"), apparel: byType("apparel"), gear: byType("item"),
      validation, errors: valBy("error"), warnings: valBy("warning"), infos: valBy("info"),
      progression: prog,
      sizeOptions: DBU.SIZE_ORDER.map(k => ({ value: k, label: L(DBU.sizes[k].label) })),
      alignmentOptions: Object.entries(DBU.alignments).map(([v, l]) => ({ value: Number(v), label: L(l) })).sort((a, b) => b.value - a.value),
      difficultyOptions: Object.entries(DBU.difficulties).map(([k, d]) => ({ value: k, label: `${L(d.label)} (${d.tn})` })),
      profileOptions: Object.entries(DBU.profiles).map(([k, p]) => ({ value: k, label: `${p.label} (${p.kp}(T))` })),
      modifierTargets,
      lifePct: Math.clamp(Math.round((sys.life.value / Math.max(1, sys.life.max)) * 100), 0, 100),
      kiPct: Math.clamp(Math.round((sys.ki.value / Math.max(1, sys.ki.max)) * 100), 0, 100),
      capPct: Math.clamp(Math.round((sys.capacity.value / Math.max(1, sys.capacity.max)) * 100), 0, 100),
      healthLabel: L(`DBU.Threshold.${sys.health.current}`),
      thresholds: DBU.thresholds.map(k => ({
        key: k, label: L(`DBU.Threshold.${k}`), below: sys.health.below[k], mark: sys.thresholds[k],
        value: Math.floor(sys.life.max * DBU.THRESHOLD_FRACTIONS[k])
      })),
      topDice: categoryLabel(Math.max(0, sys.top.current - 1)),
      chargeDice: categoryLabel(sys.chargeCategory, sys.top.current),
      sigChargeDice: categoryLabel(sys.chargeCategory + 1, sys.top.current),
      inCombat: !!game.combat?.started,
      enrichedBio: await TE.enrichHTML(sys.details.biography, { relativeTo: actor, secrets: actor.isOwner }),
      enrichedNotes: await TE.enrichHTML(sys.details.notes, { relativeTo: actor, secrets: actor.isOwner }),
      enrichedZsoul: await TE.enrichHTML(sys.zsoul.description, { relativeTo: actor, secrets: actor.isOwner })
    });
    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( context.tabs?.[partId] ) context.tab = context.tabs[partId];
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Errors badge on the progression tab
    const nav = this.element.querySelector('nav.sheet-tabs a[data-tab="progression"]');
    if ( nav && (this.actor.system.validationCounts?.error ?? 0) > 0 ) nav.classList.add("dbu-has-errors");
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @override */
  async _onDropItem(event, item) {
    if ( !this.actor.isOwner ) return null;
    // Replace the race instead of stacking two
    if ( (item.type === "race") && (item.parent !== this.actor) ) {
      const old = this.actor.items.filter(i => i.type === "race");
      if ( old.length ) {
        const ok = await foundry.applications.api.DialogV2.confirm({
          window: { title: L("DBU.Race.ReplaceTitle") }, content: `<p>${L("DBU.Race.ReplaceText", { old: old[0].name, new: item.name })}</p>`
        });
        if ( !ok ) return null;
        await this.actor.deleteEmbeddedDocuments("Item", old.map(i => i.id));
      }
    }
    return super._onDropItem(event, item);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #item(target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return id ? this.actor.items.get(id) : null;
  }

  static async #onRoll(event, target) {
    const { type, key, foundation } = target.dataset;
    const actor = this.actor;
    switch ( type ) {
      case "skill": {
        const sel = this.element.querySelector("select[name='dbuDifficulty']");
        return actor.rollSkill(key, { difficulty: sel?.value || undefined });
      }
      case "save": return actor.rollSave(key);
      case "strike":
      case "dodge":
      case "wound": return actor.rollCombat(type, { foundation });
      case "clash": return actor.rollClash(key);
      case "steadfast": return actor.rollSteadfast();
      case "stress": return actor.rollStressTest();
      case "initiative": return actor.rollInitiative({ createCombatants: true });
      default: return null;
    }
  }

  static async #onAttack(event, target) {
    const sel = this.element.querySelector("select[name='dbuProfile']");
    return this.actor.attack({ profile: target.dataset.profile ?? sel?.value ?? "simple" });
  }

  static async #onItemCreate(event, target) {
    const type = target.dataset.type;
    const data = { name: L(`TYPES.Item.${type}`), type, system: {} };
    if ( type === "transformation" && target.dataset.transType ) data.system.transType = target.dataset.transType;
    if ( type === "talent" ) data.system.takenAt = this.actor.system.pl;
    const [item] = await this.actor.createEmbeddedDocuments("Item", [data]);
    item?.sheet.render({ force: true });
  }

  static #onItemEdit(event, target) {
    DBUActorSheet.#item.call(this, target)?.sheet.render({ force: true });
  }

  static async #onItemDelete(event, target) {
    const item = DBUActorSheet.#item.call(this, target);
    if ( !item ) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("DBU.Item.DeleteTitle") }, content: `<p>${L("DBU.Item.DeleteText", { name: item.name })}</p>`
    });
    if ( ok ) await item.delete();
  }

  static #onItemUse(event, target) {
    return DBUActorSheet.#item.call(this, target)?.use();
  }

  static #onItemChat(event, target) {
    return DBUActorSheet.#item.call(this, target)?.toChat();
  }

  static async #onItemToggle(event, target) {
    const item = DBUActorSheet.#item.call(this, target);
    if ( !item ) return;
    const field = target.dataset.field;
    const value = !foundry.utils.getProperty(item, field);
    // Turning a Transformation on through the toggle skips the Stress Test (GM convenience) — warn about stacking
    await item.update({ [field]: value });
  }

  static async #onItemStack(event, target) {
    const item = DBUActorSheet.#item.call(this, target);
    if ( !item ) return;
    const field = target.dataset.field;
    const delta = Number(target.dataset.delta) || 0;
    const cur = Number(foundry.utils.getProperty(item, field)) || 0;
    await item.update({ [field]: Math.max(0, cur + delta) });
  }

  static async #onCondition(event, target) {
    const key = target.dataset.key;
    const def = DBU.conditions[key];
    const current = this.actor.system.conditions[key] ?? 0;
    let next;
    if ( target.dataset.n ) {
      const n = Number(target.dataset.n);
      next = (n === current) ? n - 1 : n;
    }
    else next = current > 0 ? 0 : 1;
    if ( event.button === 2 ) next = 0;
    return this.actor.setCondition(key, Math.clamp(next, 0, def.max));
  }

  static async #onState(event, target) {
    const key = target.dataset.key;
    const def = DBU.states[key];
    const current = this.actor.system.states[key] ?? 0;
    let next;
    if ( target.dataset.n ) {
      const n = Number(target.dataset.n);
      next = (n === current) ? n - 1 : n;
    }
    else next = current > 0 ? 0 : 1;
    return this.actor.setState(key, Math.clamp(next, 0, def.levels));
  }

  static async #onPool(event, target) {
    const { pool, delta, field } = target.dataset;
    const path = field ?? `system.${pool}.value`;
    const cur = Number(foundry.utils.getProperty(this.actor, path)) || 0;
    let value = cur + Number(delta);
    if ( pool && this.actor.system[pool]?.max !== undefined && (pool !== "life") ) value = Math.clamp(value, 0, this.actor.system[pool].max);
    if ( pool === "life" ) value = Math.min(value, this.actor.system.life.max);
    if ( field === "system.combat.power" ) value = Math.clamp(value, 0, 2);
    if ( field === "system.karma.value" ) value = Math.clamp(value, 0, 4);
    return this.actor.update({ [path]: Math.max(pool === "life" ? -9999 : 0, value) });
  }

  static async #onManeuver(event, target) {
    const actor = this.actor;
    switch ( target.dataset.maneuver ) {
      case "powerUp": return actor.powerUp();
      case "energyCharge": return actor.energyCharge();
      case "healingSurge": return actor.surge("healing");
      case "kiSurge": return actor.surge("ki");
      case "combatRecovery": return actor.combatRecovery();
      case "revertAll": return actor.revert();
      case "resetRound": {
        const sys = actor.system;
        return actor.update({
          "system.capacity.value": sys.capacity.max, "system.combat.actions": sys.actionsPerRound,
          "system.combat.counters": sys.countersPerRound, "system.combat.dimDefense": 0, "system.combat.attacksThisRound": 0,
          "system.combat.momentumUsed": false, "system.combat.powerUps": 0
        });
      }
      case "resetEncounter": return actor.resetEncounter({ instantRecovery: false });
      case "instantRecovery": return actor.resetEncounter({ instantRecovery: true });
      case "fullRest": return actor.update({
        "system.life.value": actor.system.life.max, "system.ki.value": actor.system.ki.max,
        "system.capacity.value": actor.system.capacity.max
      });
      default: return null;
    }
  }

  static async #onThreshold(event, target) {
    const key = target.dataset.key;
    const cur = this.actor.system.thresholds[key];
    const next = cur === "" ? "pass" : (cur === "pass" ? "fail" : "");
    return this.actor.update({ [`system.thresholds.${key}`]: next });
  }

  static async #onAddModifier() {
    const list = foundry.utils.deepClone(this.actor.system._source.customModifiers ?? []);
    list.push({ target: "strike", value: "1(T)", condition: "", label: L("DBU.Custom"), active: true });
    return this.actor.update({ "system.customModifiers": list });
  }

  static async #onRemoveModifier(event, target) {
    const list = foundry.utils.deepClone(this.actor.system._source.customModifiers ?? []);
    list.splice(Number(target.dataset.index), 1);
    return this.actor.update({ "system.customModifiers": list });
  }

  static async #onAddResource() {
    const list = foundry.utils.deepClone(this.actor.system._source.resources ?? []);
    const used = new Set(list.map(r => r.name));
    list.push(newResource(used.has("Battle Born") ? L("DBU.Split.NewName") : "Battle Born"));
    return this.actor.update({ "system.resources": list });
  }

  static async #onRemoveResource(event, target) {
    const list = foundry.utils.deepClone(this.actor.system._source.resources ?? []);
    list.splice(Number(target.dataset.index), 1);
    return this.actor.update({ "system.resources": list });
  }

  static async #onManualDamage() {
    const root = this.element;
    const wound = Number(root.querySelector("[name='dbuDmgWound']")?.value) || 0;
    const category = Number(root.querySelector("[name='dbuDmgCat']")?.value) || 1;
    const raw = !!root.querySelector("[name='dbuDmgRaw']")?.checked;
    return this.actor.applyManualDamage({ wound, category, raw });
  }

  static #onOpenCompendium(event, target) {
    const pack = game.packs.get(`dbu-rpg.${target.dataset.pack}`);
    pack?.render(true);
  }

  static #onGotoTab(event, target) {
    this.changeTab(target.dataset.tab, "primary");
  }

  /** Power checkboxes: ticking box n gives n stacks, unticking it leaves n - 1. */
  static async #onPowerBox(event, target) {
    const n = Number(target.dataset.n);
    const cur = this.actor.system.combat.power ?? 0;
    return this.actor.setPower(n <= cur ? n - 1 : n);
  }

  /** +1 / -1 stack of a resource (a new stack of Battle Born asks where it goes). */
  static async #onResourceStack(event, target) {
    const r = this.actor.system.resources[Number(target.dataset.index)];
    if ( !r?.name ) return null;
    const text = await changeStacks(this.actor, r.name, Number(target.dataset.delta) || 0, { label: L("DBU.Split.Manual") });
    if ( text ) ui.notifications.info(`${this.actor.name}: ${text}`);
    return text;
  }

  static async #onAllocate(event, target) {
    const r = this.actor.system.resources[Number(target.dataset.index)];
    if ( r?.name ) return openAllocationDialog(this.actor, r.name);
    return null;
  }

  /** Resource rows only send the fields they show: keep the other fields of each resource from the stored data. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const rows = foundry.utils.getProperty(data, "system.resources");
    if ( rows && (typeof rows === "object") && !Array.isArray(rows) ) {
      const src = this.actor.system._source.resources ?? [];
      foundry.utils.setProperty(data, "system.resources", src.map((r, i) =>
        rows[i] ? foundry.utils.mergeObject(foundry.utils.deepClone(r), rows[i], { inplace: false }) : r));
    }
    return data;
  }

  static async #onAddTrigger() {
    const list = foundry.utils.deepClone(this.actor.system._source.customTriggers ?? []);
    list.push({ event: "startOfRound", effect: "life", value: "3(bT)", resource: "", condition: "", mode: "auto", duration: "none", label: L("DBU.Custom"), active: true });
    return this.actor.update({ "system.customTriggers": list });
  }

  static async #onRemoveTrigger(event, target) {
    const list = foundry.utils.deepClone(this.actor.system._source.customTriggers ?? []);
    list.splice(Number(target.dataset.index), 1);
    return this.actor.update({ "system.customTriggers": list });
  }

  static async #onAddInjury() {
    const list = foundry.utils.deepClone(this.actor.system._source.optional.injuries ?? []);
    list.push({ type: "internal", severity: "minor", ignored: false });
    return this.actor.update({ "system.optional.injuries": list });
  }

  static async #onRemoveInjury(event, target) {
    const list = foundry.utils.deepClone(this.actor.system._source.optional.injuries ?? []);
    list.splice(Number(target.dataset.index), 1);
    return this.actor.update({ "system.optional.injuries": list });
  }
}
