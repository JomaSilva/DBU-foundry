import { postInfoCard } from "./dice/roller.mjs";
import { toggleOptions } from "./combat/choices.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const PACK = "dbu-rpg.transformations";

/*
 * The Transformations already on the sheets keep the automation they were dragged with. When the compendium changes it
 * (a rules fix: the Traits a Stage inherits, a Variant's...), the GM is offered to bring them up to date: the Traits'
 * modifiers, triggers and choices come from the compendium again, while what belongs to the character stays (choices
 * made, Mastery, Grade, state, and the modifiers someone added by hand).
 */

/** The compendium entries, how each sheet Transformation finds its own, and every label the compendium uses. */
async function compendiumData() {
  const pack = game.packs.get(PACK);
  if ( !pack ) return null;
  const docs = await pack.getDocuments();
  const byId = new Map(docs.map(d => [d.id, d]));
  const bySlug = new Map(docs.map(d => [`${d.flags?.["dbu-rpg"]?.slug}:${d.name}`, d]));
  const labels = new Set(docs.flatMap(d => [...(d.system.modifiers ?? []), ...(d.system.triggers ?? [])].map(m => m.label)));
  const stamp = Math.max(0, ...docs.map(d => d._stats?.modifiedTime ?? 0));
  const prefix = `Compendium.${pack.collection}.`;
  const entryOf = item => {
    const source = item._stats?.compendiumSource ?? "";
    return (source.startsWith(prefix) ? byId.get(source.split(".").pop()) : null)
      ?? bySlug.get(`${item.flags?.["dbu-rpg"]?.slug}:${item.name}`) ?? null;
  };
  return { entryOf, labels, stamp };
}

const plain = list => JSON.stringify((list ?? []).map(x => {
  const { _id, ...rest } = x;
  return rest;
}));

/** The update that brings one sheet Transformation's Traits in line with its compendium entry, or null. */
function updateFor(item, entry, labels) {
  const src = item.system._source;
  const fresh = foundry.utils.deepClone(entry._source.system);
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
    return o ? { ...x, active: o.active, ...(String(x.target ?? "").includes("{foundation}") ? { target: o.target } : {}) } : x;
  });
  let modifiers = keepState(fresh.modifiers, src.modifiers, ["target", "condition"]);
  let triggers = keepState(fresh.triggers, src.triggers, ["event", "effect"]);
  for ( const c of choices ) {
    if ( !c.selected?.length ) continue;
    modifiers = toggleOptions(modifiers, c.trait, c.selected, c.detail);
    triggers = toggleOptions(triggers, c.trait, c.selected, c.detail);
  }
  // Modifiers and triggers someone added by hand (a label the compendium never uses) stay
  const custom = list => (list ?? []).filter(m => !labels.has(m.label));
  modifiers = [...modifiers, ...custom(src.modifiers)];
  triggers = [...triggers, ...custom(src.triggers)];
  // What an Awakening's Stacks ask (the Absorbed Character) and their own Tier of Power Requirements
  const stackFields = { stackNote: fresh.stackNote ?? "", stackTop: fresh.stackTop ?? "" };
  const changed = (plain(modifiers) !== plain(src.modifiers)) || (plain(triggers) !== plain(src.triggers))
    || (plain(choices) !== plain(src.choices)) || (JSON.stringify(fresh.traits) !== JSON.stringify(src.traits))
    || Object.entries(stackFields).some(([k, v]) => (src[k] ?? "") !== v);
  if ( !changed ) return null;
  return { _id: item.id, "system.modifiers": modifiers, "system.triggers": triggers, "system.choices": choices, "system.traits": fresh.traits,
    "system.stackNote": stackFields.stackNote, "system.stackTop": stackFields.stackTop };
}

/** Every Transformation on the sheets (and in the Items directory) that the compendium would change. */
async function pendingUpdates() {
  const data = await compendiumData();
  if ( !data ) return { data: null, groups: [] };
  const groups = [];
  const collect = (owner, items) => {
    const updates = items.filter(i => i.type === "transformation").flatMap(i => {
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
  }
  ui.notifications.info(L("DBU.Update.Done", { n }));
  return n;
}

/** Button on the card: not now (until the compendium changes again). */
export async function skipTransformationUpdate() {
  const data = await compendiumData();
  if ( data ) await game.settings.set("dbu-rpg", "transformationUpdateSkipped", data.stamp);
}
