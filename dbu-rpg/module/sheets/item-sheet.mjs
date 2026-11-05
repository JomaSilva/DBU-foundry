import { DBU } from "../config.mjs";
import { SIGNATURE_OPTIONS, signatureOptionGroups } from "../rules/signature.mjs";
import { autoOfficialText, fetchOfficialText, isStubDescription, officialTextOf, withOfficialText } from "../rules/official-text.mjs";
import { defaultAuraKey } from "../canvas/token-auras.mjs";
import { aspectLabel } from "../rules/aspects.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

/** Token aura choices of a Transformation ("auto" names the preset its name gets, if any). */
function auraContext(item) {
  if ( item.type !== "transformation" ) return {};
  const key = defaultAuraKey(item.name);
  const auto = key ? L(`DBU.Aura.Preset.${key}`) : L("DBU.Aura.NoPreset");
  return {
    auraOptions: [
      { value: "auto", label: L("DBU.Aura.Auto", { preset: auto }) },
      ...["none", "glow", "lightning", "nebula"].map(v => ({ value: v, label: L(`DBU.Aura.Style.${v}`) }))
    ],
    auraHint: key ? L("DBU.Aura.HintPreset", { preset: auto }) : L("DBU.Aura.HintChoose"),
    // Choices made (or still to make) and what each Mastery level changes on the Aspects
    choiceRows: (item.system.choices ?? []).map(c => ({
      trait: c.trait,
      text: c.selected?.length ? `${c.selected.join(", ")}${c.detail ? ` (${L(DBU.foundations[c.detail] ?? c.detail)})` : ""}` : "",
      pick: c.pick
    })),
    canChoose: !!item.parent,
    masteryRows: Array.from(new Set((item.system.masteryAspects ?? []).map(c => c.mastery))).sort().map(level => {
      const at = (item.system.masteryAspects ?? []).filter(c => c.mastery === level);
      // "M levels" grow with each Mastery (up to their maximum)
      const levels = c => `${c.perMastery ? "M" : c.level} LV ${aspectLabel({ key: c.key })}${c.max ? ` (${L("DBU.Mastery.Max", { n: c.max })})` : ""}`;
      const parts = [
        ...at.filter(c => c.op === "remove").map(c => `−${aspectLabel({ key: c.key, param: c.param })}`),
        ...at.filter(c => c.op === "reduce").map(c => `−${levels(c)}`),
        ...at.filter(c => c.op === "add").map(c => `+${aspectLabel(c)}`),
        ...at.filter(c => c.op === "raise").map(c => `+${levels(c)}`)
      ];
      return { level, text: parts.join(", "), reached: (item.system.mastery ?? 0) >= level };
    }),
    // Aspects each Grade applies (with those of the lower Grades)
    gradeRows: Array.from(new Set((item.system.gradeAspects ?? []).map(g => g.grade))).sort().map(grade => ({
      grade,
      text: (item.system.gradeAspects ?? []).filter(g => g.grade === grade).map(g => aspectLabel(g)).join(", "),
      reached: (item.system.grade ?? 1) >= grade
    }))
  };
}

/** Select options for turn/round triggers (shared with the actor sheet; an item's may also run when an Awakening gains a
 * Stack). */
export function triggerOptions({ stackGain = false } = {}) {
  const map = (keys, prefix) => keys.map(k => ({ value: k, label: L(`${prefix}.${k}`) }));
  const events = ["startOfRound", "endOfRound", "startOfTurn", "endOfTurn", "startOfEncounter", ...(stackGain ? ["stackGain"] : [])];
  return {
    triggerEvents: map(events, "DBU.Trigger.EventLabel"),
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
      use: DBUItemSheet.#onUse,
      chooseOptions: DBUItemSheet.#onChooseOptions
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
      // A compendium entry shows the official text from the site without saving it
      enrichedDescription: (isStubDescription(sys.description) && this._officialText) ? this._officialText
        : await TE.enrichHTML(sys.description, { relativeTo: item, secrets: item.isOwner }),
      officialPreview: isStubDescription(sys.description) && !!this._officialText,
      officialLoading: isStubDescription(sys.description) && this._officialLoading,
      attributes: DBU.ATTRIBUTES.map(a => ({ key: a, abbr: DBU.attributeAbbr[a], label: L(DBU.attributes[a]) })),
      saveOptions: opt(DBU.saves, v => L(v.label)),
      foundationOptions: opt(DBU.foundations, v => L(v)),
      profileOptions: opt(DBU.profiles, (v) => `${v.label} — ${v.kp}(T) · ${L(DBU.damageCategories[v.cat])} · ${v.foundations.map(f => L(DBU.foundations[f])).join("/")}`),
      superProfileOptions: [{ value: "", label: "—" }, ...opt(DBU.superProfiles, v => `${v.label} (${v.kp}(T))`)],
      transTypeOptions: opt(DBU.transformationTypes, v => L(v)),
      ...auraContext(this.item),
      apparelOptions: opt(DBU.apparelCategories, v => L(v)),
      weaponSizeOptions: opt(DBU.weaponSizes, v => L(v.label)),
      weaponCategoryOptions: opt(DBU.weaponCategories, v => `${v.label} (${L(DBU.foundations[v.type])})`),
      aspectOptions: [{ value: "", label: "—" }, ...opt(DBU.aspects, v => v.label)],
      modifierTargets: Object.entries(DBU.modifierTargets).map(([k, v]) => ({ value: k, label: `${L(v)} [${k}]` })),
      talentCategories: DBU.talentCategories.map(c => ({ value: c, label: c })),
      ...triggerOptions({ stackGain: item.type === "transformation" }),
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

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    // No description yet: bring the official text from dbu-rpg.com (saved on world/sheet items, only shown for compendium entries)
    const item = this.item;
    const desc = item.system.description;
    if ( !isStubDescription(desc) || !item.system.source?.slug || !game.settings.get("dbu-rpg", "autoOfficialText") ) return;
    if ( !item.pack && item.isOwner ) return autoOfficialText(item);
    // Reading an entry straight from the compendium: open on its text
    if ( item.pack ) this.changeTab("description", "primary");
    this._officialLoading = true;
    this.render({ parts: ["description"] });
    const html = await officialTextOf(item);
    this._officialLoading = false;
    this._officialText = html ? withOfficialText(desc, html) : null;
    if ( this.rendered ) this.render({ parts: ["description"] });
  }

  /** Make (or redo) the Option choices of a Transformation owned by an actor. */
  static async #onChooseOptions() {
    const actor = this.item.parent;
    if ( !actor ) return;
    const { chooseTransformationOptions } = await import("../combat/choices.mjs");
    return chooseTransformationOptions(actor, this.item, { required: false, all: true });
  }

  static async #onFetchText() {
    const src = this.item.system.source;
    if ( !src?.slug ) return ui.notifications.warn(L("DBU.Item.NoSource"));
    const html = await fetchOfficialText(src.slug, src.section || this.item.name);
    if ( !html ) return ui.notifications.error(L("DBU.Item.FetchFailed"));
    const desc = this.item.system.description;
    await this.item.update({ "system.description": isStubDescription(desc) ? withOfficialText(desc, html) : html });
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
