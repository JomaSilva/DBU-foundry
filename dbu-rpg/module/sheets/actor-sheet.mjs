import { DBU } from "../config.mjs";
import { categoryLabel } from "../rules/dice.mjs";
import { checkPrerequisites, raceMatches, uaTpCost } from "../rules/validation.mjs";
import { AGE_CATEGORIES, INJURY_TYPES, OPTIONAL_RULES, OptionalRulesConfig, STANCES, rules } from "../optional-rules.mjs";
import { triggerOptions } from "./item-sheet.mjs";
import { encounterOf, powerTimers, traitUseRows, useTrait } from "../combat/triggers.mjs";
import { changeStacks, openAllocationDialog, resourceMaxOf } from "../combat/stacks.mjs";
import { newResource } from "../rules/resources.mjs";
import { activeTraits, traitStructure } from "../rules/traits.mjs";
import { stackGroups } from "../rules/awakening.mjs";
import { aspectLabel } from "../rules/aspects.mjs";
import { traitKindLabel } from "../combat/trait-actions.mjs";
import { availableAdventuringManeuvers, sessionUses } from "../rules/adventuring.mjs";
import { DEFAULT_BATTLE_POWER_FORMULA, battlePowerWeight } from "../rules/battle-power.mjs";
import { actorTokens, heightMode, heightText, stepHeight, tokenHeight } from "../canvas/height.mjs";
import { hasFlightAbility, hasSoar, soar } from "../combat/movement.mjs";
import { escape, grapple, grappleOf, launch, moveTarget, pin, release, thrust } from "../combat/grapple.mjs";
import { scan, scanButton } from "../combat/scan.mjs";
import { clashDialog } from "../combat/clash.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

/** Tooltip of the Mastery control: the Mastery Traits and what each level changes. */
/** The Adversary panel: Category, PCC and what they give (null for other actors). */
function adversaryContext(sys) {
  const info = sys.adversaryInfo;
  if ( !info ) return null;
  return {
    info,
    categoryOptions: ["standard", "elite", "villain"].map(k => ({ value: k, label: L(`DBU.Adversary.Cat.${k}`) })),
    pccModeOptions: ["auto", "manual"].map(k => ({ value: k, label: L(`DBU.Adversary.Mode.${k}`) })),
    fromLabel: L(`DBU.Adversary.From.${info.from}`),
    staminaPct: Math.clamp(Math.round(((sys.adversary.stamina ?? 0) / Math.max(1, info.staminaMax)) * 100), 0, 100)
  };
}

function masteryTooltip(s) {
  const traits = (s.allTraits ?? s.traits ?? []).filter(t => /\[mastery trait\]/.test(t)).map(t => t.replace(/\s*\[mastery trait\]/, ""));
  const lines = [L("DBU.Mastery.Tip", { n: s.mastery, max: s.masteryNeeded })];
  if ( traits.length ) lines.push(traits.join(" · "));
  if ( s.masteryMax > s.masteryNeeded ) lines.push(L("DBU.Mastery.TranscendentTip"));
  return lines.join(" — ");
}

/** An Awakening's row: its Temporary and free Stacks, and what each Stack picked or holds. */
function stackInfo(s) {
  if ( s.transType !== "awakening" ) return {};
  const picks = (s.choices ?? []).filter(c => c.perStack && c.selected?.length)
    .map(c => `${c.trait}: ${stackGroups(c).map((g, k) => `${k + 1}) ${g.join(" + ")}`).join(" · ")}`);
  const notes = (s.stackNotes ?? []).map((n, k) => (n ? `${k + 1}) ${n}` : "")).filter(Boolean);
  const tip = [L("DBU.Stack.Tip")];
  if ( s.tempCount ) tip.push(L("DBU.Stack.TipTemp", { n: s.tempCount }));
  if ( s.freeStacks ) tip.push(L("DBU.Stack.TipFree", { n: s.freeStacks }));
  return { tempStacks: s.tempCount ?? 0, freeStacks: s.freeStacks ?? 0, stackPicks: picks, stackNotes: notes.join(" · "),
    stackTip: tip.join("<br>") };
}

const KIND_CSS = { "mastery trait": "mastery", "burst limit": "burst", "legendary trait": "legendary",
  "transcendent trait": "transcendent", "grand awakening": "grand" };

/**
 * The Traits in use, for the Combat tab: one card per active Transformation (its Traits, the inherited ones and the
 * Mastery Traits reached), then the Legendary Traits (possessed at all times), the active Racial Traits and the Talents.
 */
function traitGroups(actor, items) {
  const sys = actor.system;
  const now = activeTraits(items, { burstUsed: !!sys.combat?.burstUsed && !!encounterOf(actor) });
  const trans = new Map(items.filter(i => i.type === "transformation").map(i => [i.name, i]));
  const row = t => {
    // The effects list of an inherited Trait is in its Transformation's description, when the sheet has it
    const info = t.info || (t.from ? traitStructure(trans.get(t.from)?.system.description)[t.name] : "") || "";
    const tip = [traitKindLabel(t.kind), t.from ? L("DBU.Traits.From", { name: t.from }) : "", ...(info ? info.split("; ") : []),
      `<em>${L("DBU.Traits.ClickTip")}</em>`];
    return { ...t, css: KIND_CSS[t.kind] ?? "trait", kindLabel: traitKindLabel(t.kind), tip: tip.filter(Boolean).join("<br>") };
  };
  const groups = now.transformations.map(g => {
    const s = g.item.system;
    const type = { form: "Form", enhancement: "Enhancement", awakening: "Awakening", evolved: "Evolved Stage" }[s.transType] ?? s.transType;
    const sub = [s.subtype ? `${type} ${s.subtype.capitalize()}` : type];
    if ( s.line && s.stage ) sub.push(`${s.line} S${s.stage}`);
    if ( s.graded ) sub.push(`Grade ${s.grade}`);
    if ( s.transType === "awakening" ) sub.push(`${s.stacks}/${s.maxStacks} Stacks${s.tempCount ? ` (${L("DBU.Stack.TempShort", { n: s.tempCount })})` : ""}`);
    else if ( s.mastery ) sub.push(`Mastery ${Math.min(s.mastery, s.masteryNeeded)}/${s.masteryNeeded}${s.mastery > s.masteryNeeded ? "+" : ""}`);
    if ( s.transcended ) sub.push("Transcended");
    if ( s.newLevel ) sub.push("New Level of Power");
    if ( s.grandAwakening ) sub.push("Grand Awakening");
    return {
      itemId: g.item.id, img: g.item.img, title: g.item.name, subtitle: sub.join(" · "),
      aspects: s.aspects.filter(a => a.key).map(a => aspectLabel(a)).join(", "),
      fullAwakening: g.fullAwakening, grand: g.grand, traits: g.traits.map(row)
    };
  });
  if ( now.legendary.length ) {
    groups.push({ icon: "fa-solid fa-crown", title: L("DBU.Traits.Legendary"), subtitle: L("DBU.Traits.LegendaryHint"),
      traits: now.legendary.map(t => ({ ...row(t), from: t.from || t.source, kindLabel: "" })) });
  }
  const uses = u => (u?.max ? `${u.value ?? 0}/${u.max}${u.per ? ` ${L(`DBU.Per.${u.per}`)}` : ""}` : "");
  const plain = (i, kindLabel) => ({ name: i.name, itemId: i.id, css: i.type, kindLabel, uses: uses(i.system.uses),
    tip: [kindLabel, i.system.summary, `<em>${L("DBU.Traits.ClickTip")}</em>`].filter(Boolean).join("<br>") });
  if ( now.racial.length ) {
    groups.push({ icon: "fa-solid fa-dna", title: L("DBU.RacialTraits"), chips: true,
      traits: now.racial.map(i => plain(i, L(`DBU.TraitTier.${i.system.tier}`))) });
  }
  if ( now.talents.length ) {
    groups.push({ icon: "fa-solid fa-star", title: L("DBU.Talents"), chips: true,
      traits: now.talents.map(i => plain(i, i.system.category)) });
  }
  return groups;
}

/** Height of the character's token (Combat tab) and its Grapple, if any. */
function heightInfo(actor) {
  const mode = heightMode();
  const token = actorTokens(actor)[0];
  const h = token ? tokenHeight(token.document) : null;
  const g = grappleOf(actor);
  const fly = [hasSoar(actor) ? "Soar" : "", hasFlightAbility(actor) ? "Flight" : ""].filter(Boolean).join(" · ");
  return {
    height: {
      hasToken: !!token, text: h ? heightText(h) : "", aloft: !!h?.value,
      mode: L(mode === "flight" ? "DBU.Altitude.ModeFlight" : "DBU.Altitude.ModeLevels"),
      tip: L(mode === "flight" ? "DBU.Altitude.TipFlight" : "DBU.Altitude.TipLevels"), fly: fly || L("DBU.Altitude.NoFlight")
    },
    grapple: g ? {
      grappler: g.role === "grappler", grappled: g.role === "grappled",
      text: L(g.role === "grappler" ? "DBU.Grapple.YouHold" : "DBU.Grapple.YouAreHeld", { name: g.name ?? "" })
        + (g.pinned ? ` · ${L("DBU.Grapple.PinnedShort")}` : "")
    } : null
  };
}

/** Battle Power line of the header: the number, and how it was reached in the tooltip. */
function battlePowerInfo(sys) {
  const bp = sys.battlePower ?? { value: 0, data: {} };
  const d = bp.data ?? {};
  const lang = game.i18n.lang;
  const nf = new Intl.NumberFormat(lang);
  const formula = game.settings.get("dbu-rpg", "battlePowerFormula");
  const custom = formula && (formula !== DEFAULT_BATTLE_POWER_FORMULA);
  const w = battlePowerWeight(d);
  const lines = [
    `<strong>${L("DBU.BP.Label")}: ${nf.format(bp.value)}</strong> (${new Intl.NumberFormat(lang, { notation: "compact" }).format(bp.value)})`,
    custom ? L("DBU.BP.Custom", { formula: foundry.utils.escapeHTML(formula) }) : L("DBU.BP.Formula"),
    L("DBU.BP.Values", { pl: d.PL, t: d.T, fo: d.fo, ag: d.ag, te: d.te, w: new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(w) }),
    L("DBU.BP.Ki", { ki: d.ki, natural: d.kiNatural, pct: Math.round((d.kiRatio ?? 0) * 100) })
  ];
  return { bpText: nf.format(bp.value), bpTip: lines.join("<br>") };
}

/**
 * The Adventuring Maneuvers the character has (Adventure tab), grouped: Universal, from Skills with 2+ Skill Ranks,
 * and from items, Unique Abilities, Awakenings and Talents. Only the ones the character qualifies for are listed.
 */
function adventuringGroups(actor) {
  const sys = actor.system;
  const uses = sys._source.adventure?.uses ?? [];
  const groups = { universal: [], skill: [], item: [] };
  for ( const e of availableAdventuringManeuvers(actor) ) {
    const def = e.def;
    const used = sessionUses(uses, def.key);
    const finite = Number.isFinite(def.limit);
    const via = e.via.map(v => {
      if ( v === "universal" ) return L("DBU.Adv.Universal");
      if ( v.startsWith("skill:") ) {
        const k = v.slice(6);
        return `${L(DBU.skills[k]?.label ?? k)} ${sys.skills[k]?.totalRanks ?? 0}`;
      }
      return v.slice(5);
    });
    const group = def.universal ? "universal" : (e.via.some(v => v.startsWith("skill:")) ? "skill" : "item");
    groups[group].push({
      key: def.key, name: def.name, time: e.time ?? "—", via: via.join(", "), effect: L(`DBU.Adv.Effect.${def.key}`),
      uses: (def.limit === null) ? String(used) : `${used}/${finite ? def.limit : "∞"}`, spent: finite && (used >= def.limit)
    });
  }
  return [
    { title: L("DBU.Adv.GroupUniversal"), rows: groups.universal },
    { title: L("DBU.Adv.GroupSkill"), rows: groups.skill },
    { title: L("DBU.Adv.GroupItem"), rows: groups.item }
  ].filter(g => g.rows.length);
}

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
      // Phones have no T key: target the scene's tokens from a list
      pickTargets: async function() {
        const { pickTargets } = await import("../targets.mjs");
        return pickTargets(this.actor);
      },
      // One-Man Army: 2 Adversary Actions for a 1-Action Standard Maneuver used as an Instant Maneuver
      adversaryInstant: async function() {
        const { adversaryInstant } = await import("../combat/adversary.mjs");
        return adversaryInstant(this.actor);
      },
      // What the Stacks of an Awakening still have to pick
      chooseStack: async function(event, target) {
        const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
        if ( !item ) return;
        const { chooseTransformationOptions } = await import("../combat/choices.mjs");
        return chooseTransformationOptions(this.actor, item, { required: false });
      },
      itemMastery: DBUActorSheet.#onItemMastery,
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
      // An Activated Trait (a "use" trigger): condition, limit, amount and cost are checked when it is clicked
      traitUse: function(event, target) { return useTrait(this.actor, target.dataset.key); },
      addTrigger: DBUActorSheet.#onAddTrigger,
      removeTrigger: DBUActorSheet.#onRemoveTrigger,
      powerBox: DBUActorSheet.#onPowerBox,
      resourceStack: DBUActorSheet.#onResourceStack,
      allocate: DBUActorSheet.#onAllocate,
      newLevel: DBUActorSheet.#onNewLevel,
      traitInfo: DBUActorSheet.#onTraitInfo,
      burstLimit: DBUActorSheet.#onBurstLimit,
      fullAwakening: DBUActorSheet.#onFullAwakening,
      tokenImg: DBUActorSheet.#onTokenImg,
      advUse: async function(event, target) {
        const { useAdventuringManeuver } = await import("../adventure.mjs");
        return useAdventuringManeuver(this.actor, target.dataset.key);
      },
      advInfo: async function(event, target) {
        const { postAdventuringText } = await import("../adventure.mjs");
        return postAdventuringText(this.actor, target.dataset.key);
      },
      advNewSession: async function() {
        const { newAdventuringSession } = await import("../adventure.mjs");
        return newAdventuringSession([this.actor]);
      },
      advNewSessionAll: async function() {
        const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: L("DBU.Adv.NewSessionAll") },
          content: `<p>${L("DBU.Adv.NewSessionAllText")}</p>`, rejectClose: false });
        if ( !ok ) return null;
        const { newAdventuringSession } = await import("../adventure.mjs");
        return newAdventuringSession(game.actors.filter(a => ["character", "npc", "adversary", "fusion"].includes(a.type)));
      },
      // Which pool pays the Ki Point costs in the God Ki State (attacks, Guard, Energy Charge)
      dkpPrefer: function() { return this.actor.update({ "system.dkp.prefer": !this.actor.system.dkp.prefer }); },
      // Height of the character's token: 1 Verticality (Flight Optional Rule) or 1 rank of High Environment
      height: async function(event, target) {
        const token = actorTokens(this.actor)[0];
        if ( !token ) return ui.notifications.warn(L("DBU.Altitude.NoToken"));
        const step = (event.shiftKey && (heightMode() === "flight")) ? 5 : 1;
        await stepHeight(token, Number(target.dataset.delta) * step);
        return this.render();
      }
    }
  };

  /** Click on the New Level of Power tag: cancel it (a mistaken one, or a pending first time that will not happen). */
  static async #onNewLevel(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if ( !item ) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: item.name }, content: `<p>${L("DBU.Trans.NewLevelCancel", { name: item.name })}</p>`, rejectClose: false
    });
    if ( ok ) await item.update({ "system.newLevel": false, "system.newLevelPending": false });
  }

  /** A Trait of the Combat tab to chat (a Transformation Trait with its official text). */
  static async #onTraitInfo(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if ( !item ) return null;
    if ( item.type !== "transformation" ) return item.toChat();
    const { postTraitCard } = await import("../combat/trait-actions.mjs");
    return postTraitCard(this.actor, item, target.dataset.trait);
  }

  static async #onBurstLimit(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if ( !item ) return null;
    const { triggerBurstLimit } = await import("../combat/trait-actions.mjs");
    return triggerBurstLimit(this.actor, item, target.dataset.trait);
  }

  static async #onFullAwakening(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if ( !item ) return null;
    const { fullAwakening } = await import("../combat/trait-actions.mjs");
    return fullAwakening(this.actor, item);
  }

  /** Token image of a Transformation: the file browser, or the path / URL typed in (players may not browse files). */
  static async #onTokenImg(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if ( !item ) return null;
    if ( target.dataset.clear ) return item.update({ "system.tokenImg": "" });
    // Start from the token's usual image (the prototype shows the current Form's while transformed)
    const current = item.system.tokenImg || this.actor.getFlag("dbu-rpg", "formImg")?.base || this.actor.prototypeToken?.texture?.src || "";
    if ( game.user.can("FILES_BROWSE") ) {
      const FP = foundry.applications.apps.FilePicker.implementation;
      return new FP({ type: "imagevideo", current, callback: path => item.update({ "system.tokenImg": path }) }).browse();
    }
    const path = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("DBU.TokenImg.Title", { name: item.name }) },
      content: `<p>${L("DBU.TokenImg.NoBrowse")}</p><input type="text" name="path" value="${foundry.utils.escapeHTML(item.system.tokenImg)}" placeholder="tokens/goku-ssj.webp">`,
      ok: { callback: (e, button) => button.form.elements.path.value },
      rejectClose: false
    });
    if ( typeof path === "string" ) return item.update({ "system.tokenImg": path.trim() });
    return null;
  }

  static PARTS = {
    header: { template: "systems/dbu-rpg/templates/actor/header.hbs" },
    alerts: { template: "systems/dbu-rpg/templates/actor/alerts.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: "systems/dbu-rpg/templates/actor/tab-main.hbs", scrollable: [""] },
    skills: { template: "systems/dbu-rpg/templates/actor/tab-skills.hbs", scrollable: [""] },
    combat: { template: "systems/dbu-rpg/templates/actor/tab-combat.hbs", scrollable: [""] },
    techniques: { template: "systems/dbu-rpg/templates/actor/tab-techniques.hbs", scrollable: [""] },
    adventure: { template: "systems/dbu-rpg/templates/actor/tab-adventure.hbs", scrollable: [""] },
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
        { id: "adventure", icon: "fa-solid fa-compass" },
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

    // T: a Combat Condition of Transformations (Branded) shows only when an item names it or it is on
    const condNamed = new Set();
    for ( const i of this.actor.items ) {
      for ( const p of [...(i.system?.modifiers ?? []), ...(i.system?.triggers ?? [])] ) {
        for ( const m of `${p.condition ?? ""} ${p.value ?? ""} ${p.target ?? ""}`.matchAll(/(?:@cond\.|immune\.|opponentsCond\.|alliesCond\.|vs\.cond\.|to\.cond\.)(\w+)/g) ) condNamed.add(m[1].toLowerCase());
        if ( ["condition", "removeCondition"].includes(p.effect) ) condNamed.add(String(p.resource ?? "").replace(/\s+/g, "").toLowerCase());
      }
    }
    const condShown = ([key, def]) => (def.origin !== "transformation") || (sys.effectiveConditions[key] > 0) || condNamed.has(key.toLowerCase());
    const conditions = Object.entries(DBU.conditions).filter(condShown).map(([key, def]) => ({
      key, label: L(`DBU.Condition.${key}`), hint: L(`DBU.ConditionHint.${key}`), img: def.img, max: def.max,
      value: sys.effectiveConditions[key], active: sys.effectiveConditions[key] > 0,
      held: (sys.conditionHolds?.[key] ?? []).join(", "),
      pips: def.max > 1 ? Array.from({ length: def.max }, (_, i) => ({ n: i + 1, on: i < sys.effectiveConditions[key] })) : null
    }));
    // G: the States of Transformations show only when an item of the character names them, or when they are on
    const named = new Set();
    for ( const i of this.actor.items ) {
      for ( const p of [...(i.system?.modifiers ?? []), ...(i.system?.triggers ?? [])] ) {
        for ( const m of `${p.condition ?? ""} ${p.value ?? ""}`.matchAll(/@states\.(\w+)/g) ) named.add(m[1]);
        if ( ["state", "leaveState"].includes(p.effect) ) named.add(String(p.resource ?? "").replace(/\s+/g, "").toLowerCase());
      }
      for ( const a of i.system?.aspects ?? [] ) if ( a.key === "innateState" ) named.add(String(a.param ?? "").replace(/\s+/g, "").toLowerCase());
    }
    const shown = ([key, def]) => (def.origin !== "transformation") || ((sys._effectiveStates?.[key] ?? sys.states[key]) > 0)
      || named.has(key) || named.has(key.toLowerCase());
    const states = Object.entries(DBU.states).filter(shown).map(([key, def]) => ({
      key, label: L(`DBU.State.${key}`), hint: L(`DBU.StateHint.${key}`), img: def.img, max: def.levels,
      value: sys.states[key], effective: sys._effectiveStates?.[key] ?? sys.states[key],
      active: (sys._effectiveStates?.[key] ?? sys.states[key]) > 0, special: !!def.special,
      pips: def.levels > 1 ? Array.from({ length: def.levels }, (_, i) => ({ n: i + 1, on: i < sys.states[key] })) : null
    }));

    // Items
    const race = byType("race")[0] ?? null;
    const signatures = byType("signature").map(i => ({
      item: i, c: i.system.computed, profile: i.system.computed?.profileLabel || (DBU.profiles[i.system.profile]?.label ?? "?"),
      kp: Math.max(0, Math.ceil(((i.system.computed?.kpUnits ?? 0) + (i.system.computed?.kpAdjust ?? 0)) * sys.top.kp) + sys.costs.attack),
      level: L(`DBU.Sig.Level.${i.system.level}`), problems: (i.system.computed?.errors?.length ?? 0)
    }));
    const transformations = byType("transformation").map(i => {
      const s = i.system;
      const bonuses = DBU.ATTRIBUTES.filter(a => s.bonuses[a] && !["–", "-", ""].includes(s.bonuses[a].trim()))
        .map(a => `${DBU.attributeAbbr[a]} ${s.bonuses[a]}`).join(", ");
      return {
        item: i, s, bonuses,
        aspects: s.aspects.map(a => a.name || `${DBU.aspects[a.key]?.label ?? a.key}${a.level ? ` (LV${a.level})` : ""}`).join(", "),
        stress: s.transType === "awakening" ? null : actor.stressRequirement(i),
        canEnter: (s.transType !== "awakening") && (actor.isBoss || (sys.top.current >= (s.topReq - (s.prelude ? 1 : 0)))),
        raceOk: raceMatches(s.race, sys.races?.length ? sys.races : race),
        typeLabel: L(DBU.transformationTypes[s.transType] ?? s.transType),
        mastered: s.mastery >= s.masteryNeeded ? "full" : (s.mastery > 0 ? "partial" : "none"),
        // The Mastery beyond Fully Mastered that a Transcendent Trait needs shows as "+"
        masteryText: `${Math.min(s.mastery, s.masteryNeeded)}/${s.masteryNeeded}${s.mastery > s.masteryNeeded ? "+" : ""}`,
        canMaster: (s.transType !== "awakening") && !s.baseAspects?.some(a => a.key === "peaked"),
        masteryTip: masteryTooltip(s),
        tokenVideo: /\.(webm|mp4|m4v|ogv)$/i.test(s.tokenImg ?? ""),
        pending: s.pendingChoices?.length ?? 0,
        ...stackInfo(s)
      };
    });
    const groupTrans = type => transformations.filter(t => t.s.transType === type);

    const talents = byType("talent").map(i => ({ item: i, problems: checkPrerequisites(i, sys, actor) }));
    // The TP each Unique Ability costs on this sheet (tpCost.ua / tpCost.ua.magical) and the KP its effects change
    // (kpCost.ua / kpCost.ua.magical: shown, nothing pays it)
    const uaKp = i => (sys.costs?.ua ?? 0) + (/magic/i.test(String(i.system.abilityType ?? "")) ? (sys.costs?.uaMagical ?? 0) : 0);
    const uas = byType("uniqueAbility").map(i => {
      const kp = uaKp(i);
      return { item: i, tp: uaTpCost(i, sys), problems: checkPrerequisites(i, sys, actor), kpNote: kp ? `${kp > 0 ? "+" : ""}${kp}` : "" };
    });

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
    // Power: one checkbox per stack (the maximum Power stacks, 2 unless an effect raises it, or more when an effect
    // lets you exceed it); each stack shows when it ends
    const power = sys.combat.power ?? 0;
    const powerMax = sys.combat.powerMax ?? 2;
    const timers = powerTimers(actor);
    const powerBoxes = Array.fromRange(Math.max(powerMax, power), 1).map(n => ({
      n, on: n <= power,
      tip: (n <= power) ? (timers[n - 1] ? L("DBU.Power.Lasts", { round: timers[n - 1].round }) : L("DBU.Power.Stack")) : L("DBU.Power.Add")
    }));
    // Resources: split ones (Battle Born...) show their stacks on each Combat Roll with its limit; the maximum shown is
    // the one modifiers give
    const resourceRows = (sys.resources ?? []).map((r, i) => ({
      i, r: sys._source.resources[i], split: r.split, total: r.value, unassigned: r.unassigned, max: resourceMaxOf(actor, r),
      rolls: r.split ? DBU.splitRolls.map(k => {
        const cap = r.caps?.[k] ?? Infinity;
        return { k, label: L(`DBU.Split.${k}`), n: r.alloc[k], name: `system.resources.${i}.alloc.${k}`,
          cap: Number.isFinite(cap) ? cap : "∞", over: r.alloc[k] > cap, forced: r.forceEff === k };
      }) : []
    }));
    Object.assign(context, {
      ...triggerOptions(),
      combatInfo,
      traitGroups: traitGroups(actor, items),
      advGroups: adventuringGroups(actor),
      ...battlePowerInfo(sys),
      ...heightInfo(actor),
      scan: scanButton(actor),
      advInCombat: !!encounterOf(actor),
      advStretch: (sys.adventure?.stretchAt ?? null) !== null,
      powerBoxes, powerNext: power + 1, powerCanExceed: power >= powerMax,
      resourceRows,
      // Activated Traits: the "use" triggers that apply now, one button each
      traitUses: traitUseRows(actor),
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
      // MO: the Leaders a Minion may belong to (the world's Characters and NPCs)
      minionOfOptions: ((actor.type === "npc") && ["minion", "battleJacket"].includes(sys._source?.npcType))
        ? game.actors.filter(a => (a.id !== actor.id) && ["character", "npc", "adversary"].includes(a.type))
          .map(a => ({ uuid: a.uuid, name: a.name, selected: a.uuid === sys._source?.minionOf })) : [],
      isAdversary: actor.type === "adversary", adversary: adversaryContext(sys),
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
      dkpPct: Math.clamp(Math.round(((sys.dkp?.value ?? 0) / Math.max(1, sys.dkp?.max ?? 0)) * 100), 0, 100),
      dkpTip: L(sys.dkp?.usable ? "DBU.Dkp.TipOn" : "DBU.Dkp.TipOff"),
      healthLabel: L(`DBU.Threshold.${sys.health.current}`),
      thresholds: DBU.thresholds.map(k => ({
        key: k, label: L(`DBU.Threshold.${k}`), below: sys.health.below[k], mark: sys.thresholds[k],
        value: Math.floor(sys.life.max * (sys.thresholdFractions ?? DBU.THRESHOLD_FRACTIONS)[k])
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
    // An Awakening the character already has: gaining it again is a Stack more (up to its Maximum No of Stacks)
    if ( (item.type === "transformation") && (item.system.transType === "awakening") && (item.parent !== this.actor) ) {
      const A = await import("../combat/awakening.mjs");
      const have = A.awakeningNamed(this.actor, item.name);
      if ( have && (have.system.maxStacks > 1) ) return A.gainStack(this.actor, have, { temp: event.shiftKey ? 1 : 0 });
    }
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
    // Turning a Transformation on through the toggle skips the Stress Test (GM convenience), not its choices
    if ( value && (field === "system.active") && item.system.pendingChoices?.length ) {
      const { chooseTransformationOptions } = await import("../combat/choices.mjs");
      if ( !(await chooseTransformationOptions(this.actor, item, { required: true })) ) {
        return ui.notifications.warn(L("DBU.Choice.Required", { name: item.name }));
      }
    }
    if ( value && (field === "system.active") && (item.system.transType !== "awakening") ) {
      await this.actor._newLevelOfPower(item);
      if ( item.system.newLevelPending ) ui.notifications.info(L("DBU.Trans.NewLevelWaiting"));
      return item.update({ [field]: value, "system.everEntered": true });
    }
    await item.update({ [field]: value });
  }

  static async #onItemStack(event, target) {
    const item = DBUActorSheet.#item.call(this, target);
    if ( !item ) return;
    const field = target.dataset.field;
    const delta = Number(target.dataset.delta) || 0;
    // An Awakening's Stacks: the chat card says what changed, each new Stack makes its choices; Shift+click gains a
    // Temporary Stack (until the end of the Combat Encounter)
    if ( (field === "system.stacks") && (item.system.transType === "awakening") ) {
      const A = await import("../combat/awakening.mjs");
      if ( delta < 0 ) return A.loseStack(this.actor, item, { n: -delta });
      const temp = event.shiftKey ? await A.askTempLevel(item) : 0;
      if ( temp === null ) return;
      return A.gainStack(this.actor, item, { temp });
    }
    const cur = Number(foundry.utils.getProperty(item, field)) || 0;
    let next = Math.max(0, cur + delta);
    // I3: a Graded Transformation's highest Grade: its maxGrade, ± the "gradeMax.<slug of its name>" modifiers (Grades a
    // Mastery or a State unlocks); no limit without a maxGrade
    if ( (field === "system.grade") && (delta > 0) && ((item.system.maxGrade ?? 0) > 0) ) {
      const slug = String(item.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const max = Math.max(1, item.system.maxGrade + (this.actor.system.buckets?.[`gradeMax.${slug}`]?.total ?? 0));
      if ( next > max ) {
        ui.notifications.warn(game.i18n.format("DBU.Trans.GradeMax", { name: item.name, n: max }));
        next = Math.max(cur, Math.min(next, max));
        if ( next === cur ) return;
      }
    }
    await item.update({ [field]: next });
  }

  /** Mastery level of a Transformation (0 … needed); reaching a level applies its Mastery Traits. */
  static async #onItemMastery(event, target) {
    const item = DBUActorSheet.#item.call(this, target);
    if ( !item ) return;
    const s = item.system;
    // One Mastery more than Fully Mastered unlocks a Transcendent Trait
    let next = Math.clamp((s.mastery ?? 0) + (Number(target.dataset.delta) || 0), 0, s.masteryMax);
    // Q "masteryCap.<slug of its name>": a requirement its effects give (the lowest one; a Mastery it has stays)
    const cap = this.actor.system.buckets?.[`masteryCap.${String(item.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`];
    if ( cap?.parts?.length && (next > (s.mastery ?? 0)) && (next > cap.total) ) {
      ui.notifications.warn(game.i18n.format("DBU.Mastery.Capped", { name: item.name, n: cap.total }));
      next = Math.max(s.mastery ?? 0, cap.total);
    }
    if ( next === s.mastery ) return;
    const { announceMastery } = await import("../combat/mastery.mjs");
    const before = s.mastery ?? 0;
    await item.update({ "system.mastery": next });
    return announceMastery(this.actor, item, before, next);
  }

  static async #onCondition(event, target) {
    const key = target.dataset.key;
    const def = DBU.conditions[key];
    const sys = this.actor.system;
    // Start from what the sheet shows (a status icon or an Internal Injury may hold more than the stored stacks)
    const current = sys.effectiveConditions?.[key] ?? sys.conditions[key] ?? 0;
    let next;
    if ( target.dataset.n ) {
      const n = Number(target.dataset.n);
      next = (n === current) ? n - 1 : n;
    }
    else next = current > 0 ? 0 : 1;
    if ( event.button === 2 ) next = 0;
    const min = sys.conditionMins?.[key] ?? 0;
    if ( next < min ) {
      ui.notifications.warn(L("DBU.Condition.Held", { name: L(`DBU.Condition.${key}`), by: (sys.conditionHolds?.[key] ?? []).join(", ") }));
    }
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
    if ( pool === "life" ) value = Math.min(value, this.actor.system.life.cap ?? this.actor.system.life.max);
    if ( field === "system.combat.power" ) value = Math.clamp(value, 0, this.actor.system.combat.powerMax ?? 2);
    // A Fusion holds the Karma Points of all of its Fused Characters
    if ( field === "system.karma.value" ) value = Math.clamp(value, 0, this.actor.type === "fusion" ? 99 : 4);
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
      case "empower": return actor.empower();
      case "scan": return scan(actor);
      case "revertAll": return actor.revert();
      case "soar": return soar(actor);
      case "grapple": return grapple(actor);
      case "launch": return launch(actor);
      case "pin": return pin(actor);
      case "escape": return escape(actor);
      case "release": return release(actor);
      case "thrust": return thrust(actor);
      case "moveTarget": return moveTarget(actor);
      case "clash": return clashDialog(actor);
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
        "system.capacity.value": actor.system.capacity.max, "system.dkp.value": actor.system.dkp.max
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

  static async #onOpenCompendium(event, target) {
    // On a phone or tablet items cannot be dragged onto the sheet: a list to tap instead
    const { mobileActive } = await import("../mobile.mjs");
    if ( mobileActive() ) {
      const { openCompendiumPicker } = await import("../compendium-picker.mjs");
      return openCompendiumPicker(this, target.dataset.pack);
    }
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
