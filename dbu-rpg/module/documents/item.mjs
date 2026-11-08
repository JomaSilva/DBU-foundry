import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

export class DBUItem extends Item {

  /** @override */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;
    if ( !data.img || data.img === "icons/svg/item-bag.svg" ) {
      const img = DBU.itemIcons[this.type];
      if ( img ) this.updateSource({ img });
    }
    // Rule checks that block an illegal addition when the world uses strict validation
    const actor = this.parent;
    if ( !actor || !game.settings.get("dbu-rpg", "strictValidation") ) return;
    const problem = this._creationProblem(actor);
    if ( problem ) {
      ui.notifications.error(problem);
      return false;
    }
  }

  /** @override */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( (userId !== game.user.id) || !this.parent ) return;
    const problem = this._creationProblem(this.parent, { afterCreate: true });
    if ( problem ) ui.notifications.warn(problem);
    // Talents remember the PL they were taken at (Character Creation category rule)
    if ( (this.type === "talent") && !data.system?.takenAt ) this.update({ "system.takenAt": this.parent.system.pl });
  }

  /** @override E4: an Apparel piece worn before the change ("apparelDoff"). */
  async _preUpdate(changed, options, user) {
    if ( (await super._preUpdate(changed, options, user)) === false ) return false;
    // (CS1 "block.armed": no Weapon may be equipped: Awkward Anatomy)
    if ( (this.type === "weapon") && (foundry.utils.getProperty(changed, "system.equipped") === true) && !this.system.integrated
      && ((this.parent?.system?.buckets?.["block.armed"]?.total ?? 0) > 0) ) {
      ui.notifications.warn(game.i18n.format("DBU.CS1.NoWeapons", { name: this.parent.name }));
      return false;
    }
    if ( this.type === "apparel" ) options.dbuWorn = !!this.system.equipped && ((this.system.breakValue ?? 1) > 0);
    if ( this.type === "apparel" ) options.dbuBV = Number(this.system.breakValue ?? 3);
  }

  /**
   * @override E3: a change of an item (an Awakening's Stacks, an Apparel doffed...) may end a Transformation
   * ("leaveWhen"). E4: an Apparel piece that was worn and no longer is (unequipped, or its Break Value at 0) fires
   * "apparelDoff" (@via_<slug>, @weights, @armor, @natural, @craftsmanship, @broken).
   */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( (userId !== game.user.id) || options?.dbuEncounterEnd ) return;
    const actor = this.parent;
    if ( options?.dbuWorn && actor && !(this.system.equipped && ((this.system.breakValue ?? 1) > 0)) ) {
      import("../combat/triggers.mjs").then(({ fireEvent, viaSlug }) => fireEvent(actor, "apparelDoff", { scope: {
        [`via_${viaSlug(this.name)}`]: 1, weights: (this.system.category === "weights") ? 1 : 0, armor: (this.system.category === "armor") ? 1 : 0,
        natural: this.system.natural ? 1 : 0, craftsmanship: this.system.craftsmanship ?? 1, broken: this.system.equipped ? 1 : 0
      } })).catch(console.error);
    }
    // F13 "breakValueLost": an Apparel piece of yours had its Break Value reduced (@via_<slug>, @natural, @n: by how much)
    const bvNow = Number(this.system.breakValue ?? 3);
    if ( actor && (this.type === "apparel") && Number.isFinite(options?.dbuBV) && (bvNow < options.dbuBV) ) {
      import("../combat/triggers.mjs").then(({ fireEvent, viaSlug }) => fireEvent(actor, "breakValueLost", { scope: {
        [`via_${viaSlug(this.name)}`]: 1, natural: this.system.natural ? 1 : 0, n: options.dbuBV - bvNow } })).catch(console.error);
    }
    actor?._scheduleRuleCheck?.();
  }

  /** A blocking reason for adding this item to an actor, or null. */
  _creationProblem(actor, { afterCreate = false } = {}) {
    const same = actor.items.filter(i => (i.type === this.type) && (i.name.trim().toLowerCase() === this.name.trim().toLowerCase())
      && (i.id !== this.id));
    if ( ["talent", "uniqueAbility", "racialTrait"].includes(this.type) && same.length ) {
      return L("DBU.Val.Duplicate", { name: this.name });
    }
    if ( (this.type === "race") && actor.items.some(i => (i.type === "race") && (i.id !== this.id)) ) {
      return L("DBU.Val.MultipleRaces");
    }
    return null;
  }

  /** Is this item's Racial Requirement met by the owner? */
  get raceRequirement() {
    return this.system.race ?? "";
  }

  /** E1: an item whose use the system counts ("maneuverUsed" / "itemUsed"): a Maneuver, a Unique Ability, an item. */
  get usable() {
    return ["maneuver", "uniqueAbility", "item"].includes(this.type);
  }

  /**
   * Send the item to chat (name, summary, link to the official page). E1: an owned Maneuver, Unique Ability or item gets
   * a "Use" button (item.use); `used`: the card of a use (no button, "Used" in the subtitle); `extraLines`: more lines.
   */
  async toChat({ used = false, extraLines = [] } = {}) {
    const lines = [];
    if ( this.system.summary ) lines.push(this.system.summary);
    if ( this.type === "signature" ) {
      const c = this.system.computed;
      lines.push(`${c.tp} TP · ${c.kpUnits + c.kpAdjust}(T) KP · ${L(DBU.damageCategories[c.damageCategory])}`);
    }
    if ( this.type === "uniqueAbility" ) lines.push(`${this.system.tpCost} TP · KP ${this.system.kpCost || "—"} · ${this.system.maneuverType} (${this.system.actionCost})`);
    if ( this.type === "maneuver" ) {
      lines.push(`${this.system.maneuverType} · ${this.system.actionCost} · ${this.system.god ? `DKP ${this.system.dkpCost || "—"}` : `KP ${this.system.kpCost || "—"}`}`);
    }
    const desc = this.system.description ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.system.description) : "";
    const link = this.system.source?.url ? `<a href="${this.system.source.url}" target="_blank" rel="noopener">${L("DBU.Item.OpenSite")}</a>` : "";
    // A Maneuver or Unique Ability that makes a Clash: a Clash button (combat/clash.mjs, made through this item)
    let clash = "";
    if ( this.actor && ["maneuver", "uniqueAbility"].includes(this.type) && /\bclash/i.test(`${this.system.summary ?? ""} ${this.system.description ?? ""}`) ) {
      const { clashButtonHtml } = await import("../combat/clash.mjs");
      clash = clashButtonHtml(this);
    }
    lines.push(...extraLines);
    const buttons = (!used && this.actor && this.usable) ? [{ action: "useItem", label: L("DBU.ItemUse.Button"), icon: "fa-solid fa-play",
      actorUuid: this.actor.uuid, payload: JSON.stringify({ itemId: this.id }) }] : [];
    const subtitle = used ? L("DBU.ItemUse.Subtitle", { type: L(`TYPES.Item.${this.type}`) }) : L(`TYPES.Item.${this.type}`);
    return postInfoCard({ actor: this.actor, title: this.name, subtitle, lines, buttons,
      img: this.img, extraHTML: `${desc}${link}${clash}` });
  }

  /**
   * E1: a Maneuver or Unique Ability the system has no flow for: its card, then the use is counted and fires
   * "maneuverUsed" (combat/triggers.mjs noteItemUse).
   */
  async _useManeuver() {
    // N: its KP / Action Cost, as the world setting "useCosts" says (nothing, shown on the card, or paid)
    const { payUseCost } = await import("../combat/use-costs.mjs");
    const costLines = this.actor ? await payUseCost(this.actor, this) : [];
    if ( costLines === null ) return null;
    const card = await this.toChat({ used: true, extraLines: costLines });
    const { noteItemUse } = await import("../combat/triggers.mjs");
    await noteItemUse(this.actor, this);
    return card;
  }

  /** E1: an item (a Basic Item, an Accessory): a Consumable one is spent (1 of its Quantity), then "itemUsed". */
  async _useGear() {
    const s = this.system;
    const consumable = /consumable/i.test(String(s.details ?? ""));
    const quantity = Number(s.quantity ?? 1);
    if ( consumable && !(quantity > 0) ) return ui.notifications.warn(L("DBU.ItemUse.NoneLeft", { name: this.name }));
    if ( consumable ) await this.update({ "system.quantity": quantity - 1 });
    const card = await this.toChat({ used: true, extraLines: consumable ? [L("DBU.ItemUse.Consumed", { n: quantity - 1 })] : [] });
    const { noteItemUse } = await import("../combat/triggers.mjs");
    await noteItemUse(this.actor, this);
    return card;
  }

  /**
   * Use the item from the sheet. E1: a Maneuver, a Unique Ability or an item used is counted and fires "maneuverUsed" /
   * "itemUsed" (God and Villainous Maneuvers and Empower when they are paid, in their own flows).
   */
  async use() {
    const actor = this.actor;
    if ( !actor ) return this.toChat();
    // A Plump or Frail Fusion cannot use Signature Techniques, Unique Abilities or the Transformation Maneuver
    const dance = (actor.type === "fusion") ? actor.system.fusion.dance : "success";
    if ( (dance !== "success") && ["signature", "uniqueAbility", "transformation"].includes(this.type) ) {
      return ui.notifications.warn(game.i18n.localize(`DBU.Fusion.Dance.${dance}`));
    }
    // Statstick (Villainous Trait): no Unique Abilities nor Special Maneuvers (except Soar)
    const V = await import("../combat/villainous.mjs");
    if ( V.statstickBlocks(actor, this) ) return ui.notifications.warn(game.i18n.localize("DBU.Villain.StatstickBlock"));
    // BB: a State that forbids it (Liquid / Feral: Unique Abilities; Spectator: a warning for what targets another Character)
    {
      const SR = await import("../rules/state-rules.mjs");
      const why = (this.type === "uniqueAbility") ? SR.stateBlock(actor, "uniqueAbility") : "";
      if ( why ) return ui.notifications.warn(why);
      const warn = SR.stateWarn(actor, this);
      if ( warn ) ui.notifications.warn(warn);
    }
    // Q: a Maneuver / Unique Ability granted "+mastery:N" waits for those Masteries of the item that grants it
    if ( ["maneuver", "uniqueAbility", "signature"].includes(this.type) ) {
      const { grantMasteryMissing } = await import("../data/items.mjs");
      const gm = grantMasteryMissing(this);
      if ( gm ) return ui.notifications.warn(game.i18n.format("DBU.Grants.NeedsMastery", { name: this.name, by: gm.by.name, n: gm.n }));
    }
    switch ( this.type ) {
      case "signature": return actor.attack({ signature: this });
      case "transformation":
        if ( this.system.transType === "awakening" ) return this.toChat();
        return this.system.active ? actor.revert(this) : actor.transform(this);
      case "racialTrait":
        if ( this.system.tier === "villainous" ) return V.useVillainousTrait(actor, this);
        return this.toChat();
      case "maneuver":
        // Villainous Maneuvers (Adversaries)
        if ( this.system.villainous ) return V.useVillainousManeuver(actor, this);
        // God Maneuvers spend Divine Ki Points; Empower sends Ki to an Ally
        if ( this.system.god ) {
          const { useGodManeuver } = await import("../combat/divine.mjs");
          return useGodManeuver(actor, this);
        }
        if ( /^empower$/i.test(this.name.trim()) ) return actor.empower();
        // O: the Movement Maneuver asks Normal / Boosted Speed and Rapid Movement, and pays them
        if ( /^movement( maneuver)?$/i.test(this.name.trim()) ) {
          const { useMovement } = await import("../combat/movement-maneuver.mjs");
          return useMovement(actor, { item: this });
        }
        return this._useManeuver();
      case "uniqueAbility": return this._useManeuver();
      case "item": return this._useGear();
      default: return this.toChat();
    }
  }
}
