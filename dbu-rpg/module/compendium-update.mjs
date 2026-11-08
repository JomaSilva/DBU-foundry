import { postInfoCard } from "./dice/roller.mjs";
import { toggleOptions } from "./combat/choices.mjs";
import { addGrants } from "./rules/grants.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
// The compendiums whose items the sheets keep up to date, by item type
// (I1: the Special Maneuvers too, which carry the automation of their own effect: Hype, Analysis)
const PACKS = { transformation: "dbu-rpg.transformations", racialTrait: "dbu-rpg.racial-traits", maneuver: "dbu-rpg.maneuvers" };

/*
 * The Transformations already on the sheets keep the automation they were dragged with. When the compendium changes it
 * (a rules fix: the Traits a Stage inherits, a Variant's...), the GM is offered to bring them up to date: the Traits'
 * modifiers, triggers and choices come from the compendium again, while what belongs to the character stays (choices
 * made, Mastery, Grade, state, and the modifiers someone added by hand).
 */

/** The compendium entries, how each sheet Transformation / Racial Trait finds its own, and every label they use. */
async function compendiumData() {
  const packs = Object.entries(PACKS).map(([type, id]) => [type, game.packs.get(id)]).filter(([, p]) => p);
  if ( !packs.length ) return null;
  const byType = {};
  let docs = [];
  for ( const [type, pack] of packs ) {
    const list = await pack.getDocuments();
    docs = docs.concat(list);
    byType[type] = {
      prefix: `Compendium.${pack.collection}.`,
      byId: new Map(list.map(d => [d.id, d])),
      bySlug: new Map(list.map(d => [`${d.flags?.["dbu-rpg"]?.slug}:${d.name}`, d]))
    };
  }
  const labels = new Set(docs.flatMap(d => [...(d.system.modifiers ?? []), ...(d.system.triggers ?? [])].map(m => m.label)));
  const stamp = Math.max(0, ...docs.map(d => d._stats?.modifiedTime ?? 0));
  const entryOf = item => {
    const t = byType[item.type];
    if ( !t ) return null;
    const source = item._stats?.compendiumSource ?? "";
    return (source.startsWith(t.prefix) ? t.byId.get(source.split(".").pop()) : null)
      ?? t.bySlug.get(`${item.flags?.["dbu-rpg"]?.slug}:${item.name}`) ?? null;
  };
  return { entryOf, labels, stamp };
}

const plain = list => JSON.stringify((list ?? []).map(x => {
  const { _id, ...rest } = x;
  return rest;
}));

/** The update that brings one sheet Transformation's Traits in line with its compendium entry, or null. */
function updateFor(item, entry, labels) {
  // Traits the compendium switches off for good, whatever the sheet had
  const locked = new Set(entry.flags?.["dbu-rpg"]?.lockedOff ?? []);
  const src = item.system._source;
  const fresh = foundry.utils.deepClone(entry._source.system);
  const racial = item.type === "racialTrait";
  fresh.choices ??= [];
  // Choices already made stay made, with their options switched on
  const choices = fresh.choices.map(c => {
    const old = (src.choices ?? []).find(o => (o.id === c.id) || (o.trait === c.trait));
    return old ? { ...c, selected: old.selected ?? [], detail: old.detail ?? "" } : c;
  });
  // A modifier or trigger the sheet already had keeps being on or off (an option switched on by hand, too), also when
  // the compendium now gates it (a Grand Awakening's "@GA", a Transcendent Trait's "@MX" / "@TR")
  const gate = v => String(v ?? "").replace(/\s*(?:&&\s*)?@(?:GA|MX|TR)\s*>=\s*1/g, "").replace(/^\s*&&\s*/, "").trim();
  const same = (a, b, keys) => keys.every(k => (a[k] === b[k]) || ((k === "condition") && (gate(a[k]) === gate(b[k])))
    || String(a[k] ?? "").includes("{foundation}"));
  const keepState = (list, old, keys) => list.map(x => {
    const o = (old ?? []).find(y => (y.label === x.label) && same(x, y, keys));
    // What the sheet switched on or off stays (an option, or a Trait the player switched on by hand), except what the
    // compendium switches off for good (the Minion Class Traits of Commander are for the Minions)
    const forcedOff = (x.active === false) && locked.has(String(x.label ?? ""));
    return o ? { ...x, active: forcedOff ? false : o.active, ...(String(x.target ?? "").includes("{foundation}") ? { target: o.target } : {}) } : x;
  });
  let modifiers = keepState(fresh.modifiers, src.modifiers, ["target", "condition"]);
  let triggers = keepState(fresh.triggers, src.triggers, ["event", "effect"]);
  for ( const c of choices ) {
    if ( !c.selected?.length ) continue;
    modifiers = toggleOptions(modifiers, c.trait, c.selected, c.detail, c.options);
    triggers = toggleOptions(triggers, c.trait, c.selected, c.detail, c.options);
  }
  // Modifiers and triggers someone added by hand (a label the compendium never uses) stay
  const custom = list => (list ?? []).filter(m => !labels.has(m.label));
  modifiers = [...modifiers, ...custom(src.modifiers)];
  triggers = [...triggers, ...custom(src.triggers)];
  // What an Awakening's Stacks ask (the Absorbed Character) and their own Tier of Power Requirements
  const stackFields = { stackNote: fresh.stackNote ?? "", stackTop: fresh.stackTop ?? "" };
  // The rules of the Transformation itself (a site update turned some Forms into Awakenings, changed bonuses and Aspects)
  const RULE_FIELDS = racial ? ["race", "category", "tier", "group", "factor", "replaces", "maxFactor"]
    : ["transType", "subtype", "origin", "race", "prerequisites", "line", "stage", "stressReq", "topReq", "bonuses",
      "aspects", "maxStacks", "ignoreTop", "graded", "maxGrade"];
  const rules = Object.fromEntries(RULE_FIELDS.filter(k => (k in fresh) && (JSON.stringify(fresh[k]) !== JSON.stringify(src[k])))
    .map(k => [`system.${k}`, fresh[k]]));
  // I2: the Original Form a Unique Evolved Stage names (a Generic one keeps what the sheet picked)
  if ( !racial && fresh.original && !src.original ) rules["system.original"] = fresh.original;
  // What a Racial Trait grants (Maneuvers, Unique Abilities...)
  const grants = entry.flags?.["dbu-rpg"]?.grants ?? [];
  const grantsChanged = JSON.stringify(grants) !== JSON.stringify(item.flags?.["dbu-rpg"]?.grants ?? []);
  // D1: the rules effects of the item and the Permanent ones (rules/fx.mjs @fx.<ref>)
  const fxFlags = {};
  for ( const k of ["fx", "fxPermanent"] ) {
    const v = entry.flags?.["dbu-rpg"]?.[k];
    if ( (v !== undefined) && (JSON.stringify(v) !== JSON.stringify(item.flags?.["dbu-rpg"]?.[k])) ) fxFlags[`flags.dbu-rpg.${k}`] = v;
  }
  const fxChanged = Object.keys(fxFlags).length > 0;
  // I1: a Maneuver only takes its modifiers and triggers
  if ( item.type === "maneuver" ) {
    if ( (plain(modifiers) === plain(src.modifiers)) && (plain(triggers) === plain(src.triggers)) ) return null;
    return { _id: item.id, "system.modifiers": modifiers, "system.triggers": triggers };
  }
  if ( racial ) {
    const changed = (plain(modifiers) !== plain(src.modifiers)) || (plain(triggers) !== plain(src.triggers)) || grantsChanged
      || Object.keys(rules).length || fxChanged;
    if ( !changed ) return null;
    return { _id: item.id, "system.modifiers": modifiers, "system.triggers": triggers, ...rules, "flags.dbu-rpg.grants": grants,
      ...fxFlags, "system.summary": fresh.summary ?? src.summary };
  }
  const changed = (plain(modifiers) !== plain(src.modifiers)) || (plain(triggers) !== plain(src.triggers))
    || (plain(choices) !== plain(src.choices)) || (JSON.stringify(fresh.traits) !== JSON.stringify(src.traits))
    || Object.entries(stackFields).some(([k, v]) => (src[k] ?? "") !== v) || Object.keys(rules).length;
  if ( !changed && !grantsChanged && !fxChanged ) return null;
  return { _id: item.id, "system.modifiers": modifiers, "system.triggers": triggers, "system.choices": choices, "system.traits": fresh.traits,
    // What a Transformation grants (a Unique Ability, a Maneuver...)
    ...(grantsChanged ? { "flags.dbu-rpg.grants": grants } : {}), ...fxFlags,
    "system.stackNote": stackFields.stackNote, "system.stackTop": stackFields.stackTop, ...rules,
    // the summary says how much is automated now
    "system.summary": fresh.summary ?? src.summary };
}

/** Every Transformation on the sheets (and in the Items directory) that the compendium would change. */
async function pendingUpdates() {
  const data = await compendiumData();
  if ( !data ) return { data: null, groups: [] };
  const groups = [];
  const collect = (owner, items) => {
    const updates = items.filter(i => i.type in PACKS).flatMap(i => {
      const entry = data.entryOf(i);
      const u = entry ? updateFor(i, entry, data.labels) : null;
      return u ? [{ update: u, name: i.name }] : [];
    });
    if ( updates.length ) groups.push({ owner, updates });
  };
  for ( const actor of game.actors ) collect(actor, actor.items);
  collect(null, game.items);
  return { data, groups };
}

/** GM, at load: offer the update on a chat card when there is something to update (once per compendium build). */
export async function offerTransformationUpdate() {
  const { data, groups } = await pendingUpdates();
  if ( !data || !groups.length ) return;
  if ( game.settings.get("dbu-rpg", "transformationUpdateSkipped") === data.stamp ) return;
  const names = groups.map(g => `${g.owner?.name ?? L("DBU.Update.Directory")}: ${g.updates.map(u => u.name).join(", ")}`);
  await postInfoCard({
    title: L("DBU.Update.Title"), img: "icons/svg/upgrade.svg", whisper: game.users.filter(u => u.isGM).map(u => u.id),
    lines: [L("DBU.Update.Text", { n: groups.reduce((n, g) => n + g.updates.length, 0) }), ...names.slice(0, 12),
      ...(names.length > 12 ? [L("DBU.Update.More", { n: names.length - 12 })] : []), L("DBU.Update.Keeps")],
    buttons: [
      { action: "updateTransformations", label: L("DBU.Update.Apply"), icon: "fa-solid fa-rotate" },
      { action: "skipTransformationUpdate", label: L("DBU.Update.Skip"), icon: "fa-solid fa-xmark" }
    ]
  });
}

/** Button on the card: apply the update everywhere. */
export async function applyTransformationUpdates() {
  if ( !game.user.isGM ) return ui.notifications.warn(L("DBU.Notify.NotOwner"));
  const { groups } = await pendingUpdates();
  let n = 0;
  for ( const g of groups ) {
    const updates = g.updates.map(u => u.update);
    if ( g.owner ) await g.owner.updateEmbeddedDocuments("Item", updates, { dbuFusionSync: g.owner.type === "fusion" });
    else await Item.updateDocuments(updates);
    n += updates.length;
    // A Racial Trait that now grants something brings it to the Character
    if ( g.owner && (g.owner.type !== "fusion") ) {
      for ( const u of updates.filter(x => x["flags.dbu-rpg.grants"]?.length) ) {
        const item = g.owner.items.get(u._id);
        if ( item ) await addGrants(g.owner, item, { notify: false });
      }
    }
  }
  ui.notifications.info(L("DBU.Update.Done", { n }));
  return n;
}

/** Button on the card: not now (until the compendium changes again). */
export async function skipTransformationUpdate() {
  const data = await compendiumData();
  if ( data ) await game.settings.set("dbu-rpg", "transformationUpdateSkipped", data.stamp);
}
