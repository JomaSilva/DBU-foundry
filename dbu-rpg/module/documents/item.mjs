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

  /** Send the item to chat (name, summary, link to the official page). */
  async toChat() {
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
    return postInfoCard({ actor: this.actor, title: this.name, subtitle: L(`TYPES.Item.${this.type}`), lines,
      img: this.img, extraHTML: `${desc}${link}` });
  }

  /** Use the item from the sheet. */
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
        return this.toChat();
      default: return this.toChat();
    }
  }
}
