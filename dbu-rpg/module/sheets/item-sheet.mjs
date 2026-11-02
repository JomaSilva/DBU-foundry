import { DBU } from "../config.mjs";
import { SIGNATURE_OPTIONS, signatureOptionGroups } from "../rules/signature.mjs";
import { fetchOfficialText } from "../rules/official-text.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

/** Select options for turn/round triggers (shared with the actor sheet). */
export function triggerOptions() {
  const map = (keys, prefix) => keys.map(k => ({ value: k, label: L(`${prefix}.${k}`) }));
  return {
    triggerEvents: map(["startOfRound", "endOfRound", "startOfTurn", "endOfTurn", "startOfEncounter"], "DBU.Trigger.EventLabel"),
    triggerEffects: map(["life", "ki", "capacity", "counters", "actions", "resource", "resourceSet", "state", "condition", "message"], "DBU.Trigger.Effect"),
    triggerModes: map(["auto", "ask", "remind"], "DBU.Trigger.Mode"),
    triggerDurations: map(["none", "endOfTurn", "startOfNextTurn", "endOfNextTurn", "endOfRound", "encounter"], "DBU.Trigger.Duration")
  };
}

export class DBUItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["dbu", "sheet", "item"],
    position: { width: 640, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      addRow: DBUItemSheet.#onAddRow,
      removeRow: DBUItemSheet.#onRemoveRow,
      fetchText: DBUItemSheet.#onFetchText,
      openSource: DBUItemSheet.#onOpenSource,
      use: DBUItemSheet.#onUse
    }
  };

  static PARTS = {
    header: { template: "systems/dbu-rpg/templates/item/header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    details: { template: "systems/dbu-rpg/templates/item/tab-details.hbs", scrollable: [""] },
    description: { template: "systems/dbu-rpg/templates/item/tab-description.hbs", scrollable: [""] },
    modifiers: { template: "systems/dbu-rpg/templates/item/tab-modifiers.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "details", icon: "fa-solid fa-sliders" },
        { id: "description", icon: "fa-solid fa-book-open" },
        { id: "modifiers", icon: "fa-solid fa-calculator" }
      ],
      initial: "details",
      labelPrefix: "DBU.ItemTab"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    const sys = item.system;
    const TE = foundry.applications.ux.TextEditor.implementation;
    const opt = (obj, labelFn = v => v) => Object.entries(obj).map(([value, v]) => ({ value, label: labelFn(v, value) }));
    Object.assign(context, {
      item, system: sys, source: sys._source, config: DBU, editable: this.isEditable, isGM: game.user.isGM,
      type: item.type, typeLabel: L(`TYPES.Item.${item.type}`),
      isType: Object.fromEntries(["race", "racialTrait", "talent", "transformation", "signature", "uniqueAbility",
        "maneuver", "weapon", "apparel", "item"].map(t => [t, item.type === t])),
      enrichedDescription: await TE.enrichHTML(sys.description, { relativeTo: item, secrets: item.isOwner }),
      attributes: DBU.ATTRIBUTES.map(a => ({ key: a, abbr: DBU.attributeAbbr[a], label: L(DBU.attributes[a]) })),
      saveOptions: opt(DBU.saves, v => L(v.label)),
      foundationOptions: opt(DBU.foundations, v => L(v)),
      profileOptions: opt(DBU.profiles, (v) => `${v.label} — ${v.kp}(T) · ${L(DBU.damageCategories[v.cat])} · ${v.foundations.map(f => L(DBU.foundations[f])).join("/")}`),
      superProfileOptions: [{ value: "", label: "—" }, ...opt(DBU.superProfiles, v => `${v.label} (${v.kp}(T))`)],
      transTypeOptions: opt(DBU.transformationTypes, v => L(v)),
      apparelOptions: opt(DBU.apparelCategories, v => L(v)),
      weaponSizeOptions: opt(DBU.weaponSizes, v => L(v.label)),
      weaponCategoryOptions: opt(DBU.weaponCategories, v => `${v.label} (${L(DBU.foundations[v.type])})`),
      aspectOptions: [{ value: "", label: "—" }, ...opt(DBU.aspects, v => v.label)],
      modifierTargets: Object.entries(DBU.modifierTargets).map(([k, v]) => ({ value: k, label: `${L(v)} [${k}]` })),
      talentCategories: DBU.talentCategories.map(c => ({ value: c, label: c })),
      ...triggerOptions(),
      sizeOptions: DBU.SIZE_ORDER.map(k => ({ value: k, label: L(DBU.sizes[k].label) }))
    });
    if ( item.type === "signature" ) this.#prepareSignature(context);
    if ( item.type === "apparel" ) {
      const c = DBU.craftsmanship[sys.craftsmanship];
      const bT = item.actor?.system.top?.base ?? 1;
      context.apparelInfo = { bonus: (c?.apparelBonus ?? 1) * bT, slots: c?.slots ?? 0, dc: c?.dc ?? "", grade: (c?.apparelBonus ?? 1) };
    }
    if ( item.type === "weapon" ) {
      const c = DBU.craftsmanship[sys.craftsmanship];
      const pl = item.actor?.system.pl ?? 1;
      context.weaponInfo = { slots: c?.slots ?? 0, dc: c?.dc ?? "", life: 32 + (8 * pl), dr: 6 * (item.actor?.system.top?.base ?? 1) };
    }
    return context;
  }

  #prepareSignature(context) {
    const sys = this.item.system;
    const comp = sys.computed;
    const actor = this.item.actor;
    const T = actor?.system.top?.kp ?? 1;
    const groupsFor = (kind) => [{ value: "", label: "—" }, ...Object.entries(signatureOptionGroups(kind)).flatMap(([group, list]) =>
      list.map(o => ({ value: o.key, label: `${o.name} (${o.costs.join("/")} TP)`, group })))];
    const rows = (list, kind) => list.map((o, i) => {
      const def = SIGNATURE_OPTIONS[o.key];
      return {
        index: i, key: o.key, rank: o.rank, choice: o.choice, def, maxRank: def?.costs.length ?? 1,
        cost: def ? def.costs.slice(0, o.rank).reduce((t, c) => t + c, 0) : 0,
        summary: (o.key && def) ? (CONFIG.DBU.signatureSummaries?.[o.key] ?? "") : "",
        requirement: def?.requirement ?? "", kind
      };
    });
    context.sig = {
      comp,
      advantageGroups: groupsFor("advantage"),
      disadvantageGroups: groupsFor("disadvantage"),
      advantages: rows(sys.advantages, "advantages"),
      disadvantages: rows(sys.disadvantages, "disadvantages"),
      levelOptions: ["super", "ultimate", "finisher"].map(v => ({ value: v, label: L(`DBU.Sig.Level.${v}`) })),
      kpNow: actor ? Math.ceil((comp.kpUnits + comp.kpAdjust) * T) + (actor.system.costs?.attack ?? 0) : null,
      cap: actor ? (DBU.SIGNATURE_TP_CAP[actor.system.top.base] ?? 50) : null,
      chargeDice: `d${[0, 4, 6, 8, 10][Math.min(4, 1 + comp.chargeCategory)] ?? 10}`
    };
  }

  /** Text inputs that edit string arrays ("ag, fo" → ["ag", "fo"]). @override */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const split = v => (typeof v === "string") ? v.split(/[,;/]/).map(s => s.trim()).filter(Boolean) : v;
    const prereq = data.system?.prereq;
    if ( prereq ) {
      if ( "talents" in prereq ) prereq.talents = split(prereq.talents);
      if ( "anyTalents" in prereq ) prereq.anyTalents = split(prereq.anyTalents);
      for ( const s of Object.values(prereq.scores ?? {}) ) {
        if ( s && ("attrs" in s) ) s.attrs = split(s.attrs).map(a => a.toLowerCase());
      }
    }
    return data;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( context.tabs?.[partId] ) context.tab = context.tabs[partId];
    return context;
  }

  /* -------------------------------------------- */

  /** Add a row to an array field (data-path = "system.advantages"). */
  static async #onAddRow(event, target) {
    const path = target.dataset.path;
    const list = foundry.utils.deepClone(foundry.utils.getProperty(this.item._source, path) ?? []);
    const templates = {
      "system.advantages": { key: "", rank: 1, choice: "" },
      "system.disadvantages": { key: "", rank: 1, choice: "" },
      "system.modifiers": { target: "strike", value: "1(T)", condition: "", label: "", active: true },
      "system.aspects": { key: "", name: "", level: 0, param: "" },
      "system.advancements": { name: "", tp: 0, prerequisite: "", owned: false },
      "system.restrictions": { name: "", tp: 0, applied: false },
      "system.qualities": { name: "", slots: 1 },
      "system.prereq.scores": { attrs: ["ag"], min: 4 },
      "system.prereq.skills": { key: "acrobatics", ranks: 2 },
      "system.triggers": { event: "startOfRound", effect: "life", value: "3(bT)", resource: "", condition: "", mode: "auto", duration: "none", label: "", active: true }
    };
    list.push(foundry.utils.deepClone(templates[path] ?? {}));
    await this.item.update({ [path]: list });
  }

  static async #onRemoveRow(event, target) {
    const path = target.dataset.path;
    const list = foundry.utils.deepClone(foundry.utils.getProperty(this.item._source, path) ?? []);
    list.splice(Number(target.dataset.index), 1);
    await this.item.update({ [path]: list });
  }

  /** Load the official text of this entry from dbu-rpg.com into the description (user's own copy). */
  static async #onFetchText() {
    const src = this.item.system.source;
    if ( !src?.slug ) return ui.notifications.warn(L("DBU.Item.NoSource"));
    const html = await fetchOfficialText(src.slug, src.section || this.item.name);
    if ( !html ) return ui.notifications.error(L("DBU.Item.FetchFailed"));
    await this.item.update({ "system.description": html });
    ui.notifications.info(L("DBU.Item.FetchOk"));
  }

  static #onOpenSource() {
    const url = this.item.system.source?.url || (this.item.system.source?.slug ? `${DBU.SITE}${this.item.system.source.slug}/` : "");
    if ( url ) window.open(url, "_blank", "noopener");
  }

  static #onUse() {
    return this.item.use();
  }
}
