/**
 * Dragon Ball Universe RPG — Foundry VTT system (rules 0.9.3, dbu-rpg.com).
 */
import { DBU } from "./module/config.mjs";
import { CharacterData, NpcData } from "./module/data/actor.mjs";
import {
  ApparelData, GearItemData, ManeuverData, RaceData, RacialTraitData, SignatureData, TalentData, TransformationData,
  UniqueAbilityData, WeaponData
} from "./module/data/items.mjs";
import { DBUActor } from "./module/documents/actor.mjs";
import { DBUItem } from "./module/documents/item.mjs";
import { DBUCombat, onCombatDeleted, onCombatStart } from "./module/documents/combat.mjs";
import { DBUActorSheet } from "./module/sheets/actor-sheet.mjs";
import { DBUItemSheet } from "./module/sheets/item-sheet.mjs";
import { onRenderChatMessage } from "./module/chat.mjs";
import { registerSocket } from "./module/socket.mjs";
import { SIGNATURE_SUMMARIES } from "./module/rules/signature.mjs";
import { OPTIONAL_RULES, OptionalRulesConfig } from "./module/optional-rules.mjs";
import * as formula from "./module/rules/formula.mjs";
import { openAttackDialog } from "./module/combat/attack.mjs";

const TEMPLATES = [
  "systems/dbu-rpg/templates/parts/triggers.hbs",
  "systems/dbu-rpg/templates/item/parts/prereq.hbs",
  "systems/dbu-rpg/templates/item/parts/qualities.hbs",
  "systems/dbu-rpg/templates/chat/roll-card.hbs",
  "systems/dbu-rpg/templates/chat/info-card.hbs",
  "systems/dbu-rpg/templates/chat/attack-card.hbs"
];

Hooks.once("init", () => {
  console.log("DBU | Initializing Dragon Ball Universe RPG system");
  CONFIG.DBU = DBU;
  DBU.signatureSummaries = SIGNATURE_SUMMARIES;

  game.dbu = {
    config: DBU,
    formula,
    attack: openAttackDialog,
    optionalRules: () => game.settings.get("dbu-rpg", "optionalRules")
  };

  CONFIG.Actor.documentClass = DBUActor;
  CONFIG.Item.documentClass = DBUItem;
  CONFIG.Combat.documentClass = DBUCombat;

  CONFIG.Actor.dataModels = { character: CharacterData, npc: NpcData };
  CONFIG.Item.dataModels = {
    race: RaceData, racialTrait: RacialTraitData, talent: TalentData, transformation: TransformationData,
    signature: SignatureData, uniqueAbility: UniqueAbilityData, maneuver: ManeuverData, weapon: WeaponData,
    apparel: ApparelData, item: GearItemData
  };
  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["life", "ki", "capacity"], value: ["karma.value"] },
    npc: { bar: ["life", "ki", "capacity"], value: ["karma.value"] }
  };

  // Initiative: 1d10 + 1/2 Agility Score; ties broken by Agility Score (decimals)
  CONFIG.Combat.initiative = { formula: "1d10 + @aptitudes.initiative + @aptitudes.initiativeTie", decimals: 2 };

  // Conditions and States as token status effects
  const statuses = [];
  for ( const [id, c] of Object.entries(DBU.conditions) ) {
    statuses.push({ id, name: `DBU.Condition.${id}`, img: c.img });
  }
  for ( const [id, s] of Object.entries(DBU.states) ) {
    statuses.push({ id: `state-${id}`, name: `DBU.State.${id}`, img: s.img });
  }
  const defeated = CONFIG.statusEffects.find(s => s.id === "dead");
  statuses.unshift(defeated ?? { id: "dead", name: "EFFECT.StatusDead", img: "icons/svg/skull.svg" });
  CONFIG.statusEffects = statuses;
  CONFIG.specialStatusEffects.DEFEATED = "dead";

  const DSC = foundry.applications.apps.DocumentSheetConfig;
  DSC.registerSheet(Actor, "dbu-rpg", DBUActorSheet, { types: ["character", "npc"], makeDefault: true, label: "DBU.Sheet.Actor" });
  DSC.registerSheet(Item, "dbu-rpg", DBUItemSheet, { makeDefault: true, label: "DBU.Sheet.Item" });

  registerSettings();
  registerHelpers();
  foundry.applications.handlebars.loadTemplates(TEMPLATES);
});

Hooks.once("ready", () => {
  registerSocket();
  if ( game.user.isGM && !game.settings.get("dbu-rpg", "welcomeShown") ) {
    game.settings.set("dbu-rpg", "welcomeShown", true);
    ChatMessage.create({
      content: `<div class="dbu-card dbu-info"><h3>Dragon Ball Universe RPG</h3><p>${game.i18n.localize("DBU.Welcome")}</p></div>`,
      whisper: [game.user.id]
    });
  }
});

Hooks.on("renderChatMessageHTML", onRenderChatMessage);
Hooks.on("deleteCombat", onCombatDeleted);
Hooks.on("combatStart", onCombatStart);

/* Sheets show the current round/turn: refresh them when the combat advances */
const refreshCombatSheets = (combat) => {
  for ( const c of combat?.combatants ?? [] ) {
    const sheet = c.actor?.sheet;
    if ( sheet?.rendered ) sheet.render();
  }
};
Hooks.on("combatTurnChange", refreshCombatSheets);
Hooks.on("deleteCombat", refreshCombatSheets);

/* Keep stacked Conditions in sync with token status icons toggled from the Token HUD */
Hooks.on("createActiveEffect", (effect, options, userId) => syncStatus(effect, true, userId));
Hooks.on("deleteActiveEffect", (effect, options, userId) => syncStatus(effect, false, userId));

function syncStatus(effect, active, userId) {
  if ( userId !== game.user.id ) return;
  const actor = effect.parent;
  if ( !(actor instanceof Actor) || !actor.system?.conditions ) return;
  for ( const status of effect.statuses ?? [] ) {
    if ( status in DBU.conditions ) {
      const cur = actor.system.conditions[status] ?? 0;
      if ( active && cur === 0 ) actor.update({ [`system.conditions.${status}`]: 1 });
      if ( !active && cur > 0 ) actor.update({ [`system.conditions.${status}`]: 0 });
    }
    else if ( status.startsWith("state-") ) {
      const key = status.slice(6);
      if ( !(key in DBU.states) ) continue;
      const cur = actor.system.states[key] ?? 0;
      if ( active && cur === 0 ) actor.update({ [`system.states.${key}`]: 1 });
      if ( !active && cur > 0 ) actor.update({ [`system.states.${key}`]: 0 });
    }
  }
}

/* -------------------------------------------- */

function registerSettings() {
  const S = (key, data) => game.settings.register("dbu-rpg", key, data);
  S("optionalRules", {
    scope: "world", config: false, type: Object,
    default: Object.fromEntries(Object.keys(OPTIONAL_RULES).map(k => [k, false])),
    onChange: () => {
      for ( const actor of game.actors ) actor.reset();
      for ( const app of foundry.applications.instances.values() ) if ( app.rendered ) app.render();
    }
  });
  S("gravityIntensity", {
    scope: "world", config: false, type: Number, default: 0,
    onChange: () => game.actors.forEach(a => { a.reset(); a.sheet?.rendered && a.sheet.render(); })
  });
  game.settings.registerMenu("dbu-rpg", "optionalRulesMenu", {
    name: "DBU.Settings.OptionalRules.Name",
    label: "DBU.Settings.OptionalRules.Label",
    hint: "DBU.Settings.OptionalRules.Hint",
    icon: "fa-solid fa-list-check",
    type: OptionalRulesConfig,
    restricted: true
  });
  S("combatAutomation", {
    name: "DBU.Settings.CombatAutomation.Name", hint: "DBU.Settings.CombatAutomation.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  S("strictValidation", {
    name: "DBU.Settings.Strict.Name", hint: "DBU.Settings.Strict.Hint",
    scope: "world", config: true, type: Boolean, default: false
  });
  S("validationToasts", {
    name: "DBU.Settings.Toasts.Name", hint: "DBU.Settings.Toasts.Hint",
    scope: "client", config: true, type: Boolean, default: true
  });
  S("welcomeShown", { scope: "world", config: false, type: Boolean, default: false });
}

function registerHelpers() {
  Handlebars.registerHelper("dbuSigned", v => {
    const n = Number(v) || 0;
    return n >= 0 ? `+${n}` : `${n}`;
  });
  Handlebars.registerHelper("dbuRule", key => {
    try { return !!game.settings.get("dbu-rpg", "optionalRules")?.[key]; } catch(err) { return false; }
  });
}
