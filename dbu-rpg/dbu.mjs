/**
 * Dragon Ball Universe RPG — Foundry VTT system (rules 0.9.3, dbu-rpg.com).
 */
import { DBU } from "./module/config.mjs";
import { CharacterData, FusionData, NpcData } from "./module/data/actor.mjs";
import {
  ApparelData, GearItemData, ManeuverData, RaceData, RacialTraitData, SignatureData, TalentData, TransformationData,
  UniqueAbilityData, WeaponData
} from "./module/data/items.mjs";
import { DBUActor } from "./module/documents/actor.mjs";
import { DBUItem } from "./module/documents/item.mjs";
import { DBUCombat, onCombatDeleted, onCombatStart } from "./module/documents/combat.mjs";
import { DBUActorSheet } from "./module/sheets/actor-sheet.mjs";
import { DBUFusionSheet } from "./module/sheets/fusion-sheet.mjs";
import { fusionsOf, scheduleSync } from "./module/fusion/fusion.mjs";
import { DBUItemSheet } from "./module/sheets/item-sheet.mjs";
import { onRenderChatMessage } from "./module/chat.mjs";
import { registerSocket } from "./module/socket.mjs";
import { refreshAllAuras, registerTokenAuras } from "./module/canvas/token-auras.mjs";
import { SIGNATURE_SUMMARIES } from "./module/rules/signature.mjs";
import { OPTIONAL_RULES, OptionalRulesConfig } from "./module/optional-rules.mjs";
import * as formula from "./module/rules/formula.mjs";
import { openAttackDialog } from "./module/combat/attack.mjs";
import { inCombat } from "./module/combat/triggers.mjs";
import { autoOfficialText } from "./module/rules/official-text.mjs";

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

  CONFIG.Actor.dataModels = { character: CharacterData, npc: NpcData, fusion: FusionData };
  CONFIG.Item.dataModels = {
    race: RaceData, racialTrait: RacialTraitData, talent: TalentData, transformation: TransformationData,
    signature: SignatureData, uniqueAbility: UniqueAbilityData, maneuver: ManeuverData, weapon: WeaponData,
    apparel: ApparelData, item: GearItemData
  };
  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["life", "ki", "capacity"], value: ["karma.value"] },
    npc: { bar: ["life", "ki", "capacity"], value: ["karma.value"] },
    fusion: { bar: ["life", "ki", "capacity"], value: ["karma.value", "fusion.roundsLeft"] }
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
  // v14 keeps statusEffects as a list that is also keyed by id (Actor#toggleStatusEffect looks them up by id):
  // refill the core list instead of replacing it
  CONFIG.statusEffects.length = 0;
  for ( const s of statuses ) CONFIG.statusEffects.push(s);
  CONFIG.specialStatusEffects.DEFEATED = "dead";

  const DSC = foundry.applications.apps.DocumentSheetConfig;
  DSC.registerSheet(Actor, "dbu-rpg", DBUActorSheet, { types: ["character", "npc"], makeDefault: true, label: "DBU.Sheet.Actor" });
  DSC.registerSheet(Actor, "dbu-rpg", DBUFusionSheet, { types: ["fusion"], makeDefault: true, label: "DBU.Sheet.Fusion" });
  DSC.registerSheet(Item, "dbu-rpg", DBUItemSheet, { makeDefault: true, label: "DBU.Sheet.Item" });

  registerSettings();
  registerHelpers();
  registerTokenAuras();
  foundry.applications.handlebars.loadTemplates(TEMPLATES);
});

/**
 * What each Mastery level and each Grade does to the Aspects is set only by the compendium (no sheet edits it): when a
 * rules fix changes it there, the Transformations already on the sheets follow.
 */
async function refreshTransformationData() {
  const pack = game.packs.get("dbu-rpg.transformations");
  if ( !pack ) return;
  const index = await pack.getIndex({ fields: ["system.masteryAspects", "system.gradeAspects", "flags.dbu-rpg.slug"] });
  const byId = new Map(index.map(e => [e._id, e]));
  const bySlug = new Map(index.map(e => [`${e.flags?.["dbu-rpg"]?.slug}:${e.name}`, e]));
  const prefix = `Compendium.${pack.collection}.`;
  const norm = list => JSON.stringify((list ?? []).map(c => [c.mastery ?? c.grade, c.op ?? "", c.key, c.level ?? 0, c.param ?? "",
    !!c.perMastery, c.max ?? 0]));
  const same = (a, b) => norm(a) === norm(b);
  const updatesOf = items => items.filter(i => i.type === "transformation").flatMap(i => {
    const source = i._stats?.compendiumSource ?? "";
    const entry = (source.startsWith(prefix) ? byId.get(source.split(".").pop()) : null)
      ?? bySlug.get(`${i.flags?.["dbu-rpg"]?.slug}:${i.name}`);
    if ( !entry ) return [];
    const { masteryAspects = [], gradeAspects = [] } = entry.system ?? {};
    const s = i.system._source;
    if ( same(s.masteryAspects, masteryAspects) && same(s.gradeAspects, gradeAspects) ) return [];
    return [{ _id: i.id, "system.masteryAspects": masteryAspects, "system.gradeAspects": gradeAspects }];
  });
  for ( const actor of game.actors ) {
    const updates = updatesOf(actor.items);
    // A Fusion's copies are fixed in place; its Fused Characters' changes synchronize it again anyway
    if ( updates.length ) await actor.updateEmbeddedDocuments("Item", updates, { dbuFusionSync: actor.type === "fusion" });
  }
  const loose = updatesOf(game.items);
  if ( loose.length ) await Item.updateDocuments(loose);
}

Hooks.once("ready", async () => {
  registerSocket();
  // Once per world: Forms and Enhancements already on the sheets that were never entered get the pending
  // New Level of Power that newly added ones come with (not Fusions: their items follow the Fused Characters)
  if ( game.user.isActiveGM && !game.settings.get("dbu-rpg", "nlopPendingMigrated") ) {
    for ( const actor of game.actors ) {
      if ( actor.type === "fusion" ) continue;
      const updates = actor.items.filter(i => (i.type === "transformation") && ["form", "enhancement"].includes(i.system.transType)
        && !i.system.everEntered && !i.system.newLevelPending && !i.system.newLevel).map(i => ({ _id: i.id, "system.newLevelPending": true }));
      if ( updates.length ) await actor.updateEmbeddedDocuments("Item", updates);
    }
    await game.settings.set("dbu-rpg", "nlopPendingMigrated", true);
  }
  if ( game.user.isActiveGM ) await refreshTransformationData().catch(err => console.error("DBU | Transformation data refresh", err));
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

/*
 * New Level of Power: a Form or Enhancement new to the character comes with it pending (its first time in a Combat
 * Encounter); uncheck it for forms the character already used. An Awakening gained mid-combat gets it at once.
 */
Hooks.on("createItem", (item, options, userId) => {
  if ( (userId !== game.user.id) || (item.type !== "transformation") || !(item.parent instanceof Actor) ) return;
  if ( options.dbuFusionSync || item.system.everEntered || item.system.newLevelPending ) return;
  if ( item.system.transType === "awakening" ) {
    if ( (item.system.stacks > 0) && inCombat(item.parent) ) item.parent._newLevelOfPower?.(item, { force: true });
  }
  else if ( ["form", "enhancement"].includes(item.system.transType) ) item.update({ "system.newLevelPending": true });
});
Hooks.on("preUpdateItem", (item, changes, options) => {
  if ( item.type === "transformation" ) options.dbuOldStacks = item.system.stacks;
});
Hooks.on("updateItem", (item, changes, options, userId) => {
  if ( (userId !== game.user.id) || (item.type !== "transformation") || (item.system.transType !== "awakening") ) return;
  const stacks = foundry.utils.getProperty(changes, "system.stacks");
  if ( (stacks > 0) && (options.dbuOldStacks === 0) && (item.parent instanceof Actor) ) item.parent._newLevelOfPower?.(item, { force: true });
});
// Awakenings are always on: their Option effects are chosen as soon as the character gains them
Hooks.on("createItem", async (item, options, userId) => {
  if ( (userId !== game.user.id) || (item.type !== "transformation") || !(item.parent instanceof Actor) ) return;
  if ( (item.system.transType !== "awakening") || !item.system.pendingChoices?.length ) return;
  const { chooseTransformationOptions } = await import("./module/combat/choices.mjs");
  chooseTransformationOptions(item.parent, item, { required: false });
});
/*
 * Fusions follow their Fused Characters: a change to a Fused Character (or to the Fusion's own choices)
 * synchronizes the Fusion again while it is not in play. Runs on the active GM, or on the user who made the change.
 */
const runsSync = userId => (game.users.activeGM ? game.user.isActiveGM : (userId === game.user.id));
const FUSION_CHOICES = ["method", "components", "dance", "modifiers", "balanced", "fusedTechnique", "forgoApparel", "sizeUp",
  "size", "traits", "awakenings", "autoSync"];
const COMPONENT_FIELDS = ["pl", "attributes", "skills", "details.size", "zsoul", "karma"];
Hooks.on("updateActor", (actor, changes, options, userId) => {
  if ( options.dbuFusionSync || !runsSync(userId) ) return;
  if ( actor.type === "fusion" ) {
    if ( FUSION_CHOICES.some(k => foundry.utils.hasProperty(changes, `system.fusion.${k}`)) ) scheduleSync(actor);
    return;
  }
  if ( COMPONENT_FIELDS.some(k => foundry.utils.hasProperty(changes, `system.${k}`)) ) fusionsOf(actor).forEach(scheduleSync);
});
for ( const hook of ["createItem", "updateItem", "deleteItem"] ) {
  Hooks.on(hook, (item, ...args) => {
    const userId = args.at(-1);
    const options = args.at(-2) ?? {};
    const actor = item.parent;
    if ( !(actor instanceof Actor) || (actor.type === "fusion") || options.dbuFusionSync || !runsSync(userId) ) return;
    fusionsOf(actor).forEach(scheduleSync);
  });
}

// Items dragged onto a sheet (or into the world) come with the official text from dbu-rpg.com
Hooks.on("createItem", (item, options, userId) => {
  if ( (userId === game.user.id) && !options.dbuFusionSync ) autoOfficialText(item);
});

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
  S("tokenAuras", {
    name: "DBU.Settings.Auras.Name", hint: "DBU.Settings.Auras.Hint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => refreshAllAuras()
  });
  S("autoOfficialText", {
    name: "DBU.Settings.AutoText.Name", hint: "DBU.Settings.AutoText.Hint",
    scope: "client", config: true, type: Boolean, default: true
  });
  S("welcomeShown", { scope: "world", config: false, type: Boolean, default: false });
  S("nlopPendingMigrated", { scope: "world", config: false, type: Boolean, default: false });
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
