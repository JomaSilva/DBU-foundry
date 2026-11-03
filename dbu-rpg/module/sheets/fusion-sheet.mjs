import { DBU } from "../config.mjs";
import { DBUActorSheet } from "./actor-sheet.mjs";
import {
  FUSION_METHODS, FUSION_MODIFIERS, FUSION_TRAIT_LIMITS, activeModifiers, analyzeFusion, balancedPicks, defaultAwakeningPicks,
  defaultTraitPicks, fusionPowerLevel, fusionTechniquePoints
} from "../fusion/fusion-rules.mjs";
import { createFusedTechnique, defuse, fuse, rollFusionDance, syncFusion } from "../fusion/fusion.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

/** Sheet of a Fusion: the character sheet with a Fusion tab where the Fused Characters and the choices are made. */
export class DBUFusionSheet extends DBUActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["dbu-fusion"],
    actions: {
      fusionAdd: DBUFusionSheet.#onAdd,
      fusionRemove: DBUFusionSheet.#onRemove,
      fusionOpen: DBUFusionSheet.#onOpen,
      fusionPick: DBUFusionSheet.#onPick,
      fusionSync: function() { return syncFusion(this.actor); },
      fusionFuse: function() { return fuse(this.actor); },
      fusionDefuse: function() { return defuse(this.actor, { reason: "voluntary" }); },
      fusionFree: function() { return defuse(this.actor, { reason: "free" }); },
      fusionDance: function() { return rollFusionDance(this.actor); },
      fusionTechnique: function() { return createFusedTechnique(this.actor); }
    }
  };

  static PARTS = (() => {
    const { header, alerts, tabs, ...rest } = DBUActorSheet.PARTS;
    return { header, alerts, tabs, fusion: { template: "systems/dbu-rpg/templates/actor/tab-fusion.hbs", scrollable: [""] }, ...rest };
  })();

  static TABS = {
    primary: {
      ...DBUActorSheet.TABS.primary,
      tabs: [{ id: "fusion", icon: "fa-solid fa-yin-yang" }, ...DBUActorSheet.TABS.primary.tabs],
      initial: "fusion"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.fusion = fusionContext(this.actor);
    return context;
  }

  /** Drop a character on the sheet: it becomes a Fused Character. */
  async _onDropActor(event, actor) {
    if ( !this.actor.isOwner ) return null;
    return addComponent(this.actor, actor);
  }

  static async #onAdd() {
    const uuid = this.element.querySelector("select[name='dbuFusionAdd']")?.value;
    const actor = uuid ? fromUuidSync(uuid) : null;
    if ( actor ) return addComponent(this.actor, actor);
  }

  static async #onRemove(event, target) {
    const list = this.actor.system.fusion.components.filter(u => u !== target.dataset.uuid);
    return this.actor.update({ "system.fusion.components": list });
  }

  static #onOpen(event, target) {
    return fromUuidSync(target.dataset.uuid)?.sheet?.render(true);
  }

  /** Toggle a Fusion Modifier, a Balanced Attribute, a Racial Trait or an Awakening. */
  static async #onPick(event, target) {
    const { list, key } = target.dataset;
    const fs = this.actor.system.fusion;
    const A = analyzeFusion(this.actor);
    // Balanced Attributes: exactly 2; a third choice replaces the oldest one
    if ( list === "balanced" ) {
      const chosen = balancedPicks(fs, A);
      if ( !A.balancedAttrs.includes(key) || chosen.includes(key) ) return null;
      return this.actor.update({ "system.fusion.balanced": [...chosen, key].slice(-2) });
    }
    let current = [...(fs[list] ?? [])];
    if ( (list === "traits") && !fs.picked ) current = defaultTraitPicks(A);
    if ( (list === "awakenings") && !fs.picked ) current = defaultAwakeningPicks(A);
    current = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
    const update = { [`system.fusion.${list}`]: current };
    if ( ["traits", "awakenings"].includes(list) ) {
      update["system.fusion.picked"] = true;
      // Keep the other list as it is shown when the first choice is made
      const other = list === "traits" ? "awakenings" : "traits";
      if ( !fs.picked ) update[`system.fusion.${other}`] = other === "traits" ? defaultTraitPicks(A) : defaultAwakeningPicks(A);
    }
    return this.actor.update(update);
  }
}

/** Add a Fused Character (not itself, not another Fusion, within the method's limit). */
async function addComponent(fusion, actor) {
  const fs = fusion.system.fusion;
  const method = FUSION_METHODS[fs.method];
  if ( actor.uuid === fusion.uuid ) return null;
  if ( actor.type === "fusion" ) return ui.notifications.error(L("DBU.Fusion.ErrFusionLimit", { name: actor.name }));
  if ( fs.components.includes(actor.uuid) ) return null;
  if ( fs.components.length >= method.max ) return ui.notifications.warn(L("DBU.Fusion.ErrMany", { n: method.max, method: method.label }));
  const update = { "system.fusion.components": [...fs.components, actor.uuid] };
  // A new Fusion takes the portrait of its first Fused Character
  if ( !fs.components.length && (fusion.img === "icons/svg/mystery-man.svg") ) {
    update.img = actor.img;
    update["prototypeToken.texture.src"] = actor.prototypeToken?.texture?.src ?? actor.img;
  }
  return fusion.update(update);
}

/** Everything the Fusion tab shows. */
function fusionContext(actor) {
  const fs = actor.system.fusion;
  const A = analyzeFusion(actor);
  const method = A.method;
  const mods = activeModifiers(actor, A);
  const limit = (fs.dance !== "success") ? 0 : (method.type === "temporary" ? 2 : 1);
  const traitPicks = fs.picked ? fs.traits : defaultTraitPicks(A);
  const awakPicks = fs.picked ? fs.awakenings : defaultAwakeningPicks(A);
  const inList = new Set(fs.components);
  const sizes = DBU.SIZE_ORDER;
  const sizeMax = (method.sizeUp && fs.sizeUp) ? Math.min(sizes.length - 1, (A.size?.max ?? 3) + (A.comps.length >= 3 ? 2 : 1)) : A.size?.max;
  const pickedTraits = A.traits.filter(t => traitPicks.includes(t.key));
  const pickedAwak = A.awakenings.filter(a => awakPicks.includes(a.key));
  const count = kind => pickedAwak.filter(a => (a.kind || "lesser") === kind).length;
  const pl = A.comps.length ? fusionPowerLevel(actor, A) : actor.system.pl;
  return {
    fs,
    ok: A.ok,
    problems: A.problems,
    comps: A.comps.map(c => ({
      uuid: c.uuid, name: c.name, img: c.img, pl: c.system.pl, top: c.system.top?.base,
      race: c.items.filter(i => i.type === "race").map(i => i.name).join(" / ") || "—",
      lp: `${c.system.life.value}/${c.system.life.max}`, kp: `${c.system.ki.value}/${c.system.ki.max}`
    })),
    slots: Array.from({ length: Math.max(0, method.min - A.comps.length) }),
    canAdd: !fs.active && (fs.components.length < method.max),
    actorOptions: game.actors.filter(a => ["character", "npc"].includes(a.type) && !inList.has(a.uuid))
      .map(a => ({ value: a.uuid, label: `${a.name} (PL ${a.system.pl})` })),
    methodOptions: Object.entries(FUSION_METHODS).map(([k, m]) => ({ value: k, label: `${m.label} (${L(`DBU.Fusion.Type.${m.type}`)})` })),
    method: {
      ...method,
      info: L("DBU.Fusion.MethodInfo", {
        type: L(`DBU.Fusion.Type.${method.type}`), rounds: method.rounds ?? "—",
        n: method.min === method.max ? method.min : `${method.min}~${method.max}`, obtain: method.obtain
      }),
      summary: L(`DBU.Fusion.MethodSummary.${fs.method}`)
    },
    danceOptions: ["success", "plump", "frail"].map(v => ({ value: v, label: L(`DBU.Fusion.DanceOpt.${v}`) })),
    modifiers: Object.entries(FUSION_MODIFIERS).map(([k, m]) => ({
      key: k, label: m.label, on: fs.modifiers.includes(k), active: mods.includes(k), prereq: !!A.prereq?.[k],
      req: L(`DBU.Fusion.ModReq.${k}`), hint: L(`DBU.Fusion.ModSummary.${k}`)
    })),
    modLimit: limit,
    modCount: mods.length,
    // Every Attribute; only the ones within 1 between the Fused Characters can be chosen
    balanced: {
      options: A.comps.length ? DBU.ATTRIBUTES.map(a => ({
        key: a, label: DBU.attributeAbbr[a], eligible: (A.balancedAttrs ?? []).includes(a), on: balancedPicks(fs, A).includes(a),
        tip: A.comps.map(c => `${c.name}: ${c.system.attributes[a].score}`).join(" · ")
      })) : []
    },
    result: {
      pl, bT: Math.min(7, Math.floor(Math.min(pl, 30) / 5) + 1),
      plText: A.comps.length ? L(A.plBonus ? "DBU.Fusion.PLText" : (A.minion ? "DBU.Fusion.PLMinion" : "DBU.Fusion.PLFar"), {
        pl: A.highestPL, bonus: A.plBonus
      }) : "",
      tp: A.comps.length ? fusionTechniquePoints(actor, A) : 0,
      karma: (A.karma ?? 0) + (method.karma ?? 0),
      rows: (A.scoreRows ?? []).map(r => ({ ...r, label: DBU.attributeAbbr[r.key] }))
    },
    sizeOptions: A.comps.length ? sizes.slice(A.size.min, sizeMax + 1).map(k => ({ value: k, label: L(DBU.sizes[k].label) })) : [],
    sizeValue: actor.system.details.size,
    // The Alignment is chosen in the Biography tab (one field per form); here only the allowed range is shown
    alignmentLabel: L(DBU.alignments[actor.system.zsoul.alignment] ?? ""),
    alignmentRange: A.comps.length ? `${L(DBU.alignments[A.alignment.min] ?? "")} → ${L(DBU.alignments[A.alignment.max] ?? "")}` : "",
    traits: A.traits.map(t => ({
      key: t.key, name: t.item.name, tier: L(`DBU.Fusion.Tier.${t.item.system.tier}`), from: t.comp.name, on: traitPicks.includes(t.key)
    })),
    traitCount: pickedTraits.length,
    traitMax: FUSION_TRAIT_LIMITS.total,
    primaryCount: pickedTraits.filter(t => t.primary).length,
    awakenings: A.awakenings.map(a => ({ key: a.key, name: a.item.name, kind: a.kind, from: a.comp.name, on: awakPicks.includes(a.key) })),
    awak: {
      lesser: count("lesser"), greater: count("greater"),
      maxLesser: A.awakeningLimits?.lesser ?? 0, maxGreater: A.awakeningLimits?.greater ?? 0
    },
    fusedTech: actor.items.find(i => i.flags?.["dbu-rpg"]?.fusion?.fusedTechnique) ?? null,
    play: {
      active: fs.active, roundsLeft: fs.roundsLeft, temporary: method.type === "temporary", lasting: method.type === "lasting",
      inCombat: !!game.combat?.started
    },
    synced: !!fs.syncedAt
  };
}
