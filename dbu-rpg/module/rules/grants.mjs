/*
 * Items a Trait gives: "Gain access to the Analysis Maneuver", "the Goof and the Hocus Pocus Special Maneuvers", "the
 * Telekinesis Unique Ability". The compendium lists them on the Trait (flags.dbu-rpg.grants = [{ type, name, uuid }]).
 * When the Trait is added to a Character, each one the Character does not have yet is added from its compendium, marked
 * with the Trait that gave it (flags.dbu-rpg.grantedBy); when the Trait is removed, what it added goes with it.
 */

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const norm = s => String(s ?? "").trim().toLowerCase();

/** The grants of an item. */
export function grantsOf(item) {
  return item?.flags?.["dbu-rpg"]?.grants ?? [];
}

/** Add to the actor what this item grants and it does not have yet. Returns the items created. */
export async function addGrants(actor, item, { notify = true } = {}) {
  const grants = grantsOf(item);
  if ( !actor || !grants.length ) return [];
  const create = [];
  for ( const g of grants ) {
    const has = actor.items.some(i => (i.type === g.type) && (norm(i.name) === norm(g.name)))
      || create.some(c => (c.type === g.type) && (norm(c.name) === norm(g.name)));
    if ( has ) continue;
    const src = g.uuid ? await fromUuid(g.uuid).catch(() => null) : null;
    if ( !src ) continue;
    const data = src.toObject();
    delete data._id;
    // B5: a Transformation granted with an Aspect patch ("+aspect:prelude", "+aspect:natural:1")
    if ( (data.type === "transformation") && g.aspects?.length ) patchAspects(data, g.aspects);
    foundry.utils.setProperty(data, "flags.dbu-rpg.grantedBy", item.id);
    // D3 "+active": it works only while the item that grants it does ("while in this Transformation")
    if ( g.active ) foundry.utils.setProperty(data, "flags.dbu-rpg.grantActive", true);
    // Q "+mastery:N": it works only once the item that grants it has N Masteries
    if ( g.mastery ) foundry.utils.setProperty(data, "flags.dbu-rpg.grantMastery", Number(g.mastery) || 0);
    foundry.utils.setProperty(data, "_stats.compendiumSource", g.uuid);
    create.push(data);
  }
  if ( !create.length ) return [];
  const made = await actor.createEmbeddedDocuments("Item", create, { dbuGrant: true });
  if ( notify ) ui.notifications.info(L("DBU.Grants.Added", { trait: item.name, items: made.map(i => i.name).join(", ") }));
  return made;
}

/**
 * B5: the Aspect patch of a granted Transformation: [{ key, level }] (a key of DBU.aspects). An Aspect it has gets that
 * level; one it does not have is added. "prelude" also marks it as a Prelude (both are read by the rules).
 */
export function patchAspects(data, aspects) {
  const sys = data.system ??= {};
  const list = sys.aspects = Array.isArray(sys.aspects) ? sys.aspects : [];
  for ( const a of aspects ?? [] ) {
    const key = String(a?.key ?? "").trim();
    if ( !key ) continue;
    const level = Math.max(0, Number(a.level) || 0);
    const have = list.find(x => x.key === key);
    if ( have ) have.level = level || have.level;
    else list.push({ key, name: globalThis.CONFIG?.DBU?.aspects?.[key]?.label ?? key, level, param: "" });
    if ( key === "prelude" ) sys.prelude = true;
  }
  return data;
}

/** A Transformation the Character progressed in (Mastery, a Grade above the first) stays when its grant goes. */
const progressed = i => (i.type === "transformation") && (((i.system?.mastery ?? 0) > 0) || (!!i.system?.graded && ((i.system?.grade ?? 1) > 1)));

/** Remove what this item (by id) added to the actor; what another of its items also grants stays, given by that one. */
export async function removeGrants(actor, itemId) {
  if ( !actor ) return 0;
  const ids = [], keep = [], kept = [];
  // D3: the picks of its choices with compendium items go with it too
  const picks = actor.items.filter(x => x.flags?.["dbu-rpg"]?.grantedBy?.item === itemId).map(x => x.id);
  if ( picks.length ) await actor.deleteEmbeddedDocuments("Item", picks, { dbuGrant: true });
  for ( const i of actor.items.filter(x => x.flags?.["dbu-rpg"]?.grantedBy === itemId) ) {
    const other = actor.items.find(o => (o.id !== itemId) && grantsOf(o).some(g => (g.type === i.type) && (norm(g.name) === norm(i.name))));
    if ( other ) keep.push({ _id: i.id, "flags.dbu-rpg.grantedBy": other.id });
    // B5: kept (no longer granted) when it has Mastery or Grade progress
    else if ( progressed(i) ) {
      keep.push({ _id: i.id, "flags.dbu-rpg.grantedBy": null });
      kept.push(i.name);
    }
    else ids.push(i.id);
  }
  if ( keep.length ) await actor.updateEmbeddedDocuments("Item", keep, { dbuGrant: true });
  if ( ids.length ) await actor.deleteEmbeddedDocuments("Item", ids, { dbuGrant: true });
  if ( kept.length ) globalThis.ui?.notifications?.info(L("DBU.Grants.KeptTransformation", { items: kept.join(", ") }));
  return ids.length;
}

/** Hooks: a Trait added to (removed from) a Character brings (takes away) what it grants. */
export function registerGrantHooks() {
  Hooks.on("createItem", (item, options, userId) => {
    if ( (userId !== game.user.id) || options.dbuFusionSync || options.dbuGrant ) return;
    const actor = item.parent;
    if ( !(actor instanceof Actor) || (actor.type === "fusion") || !grantsOf(item).length ) return;
    addGrants(actor, item).catch(console.error);
  });
  Hooks.on("deleteItem", (item, options, userId) => {
    if ( (userId !== game.user.id) || options.dbuFusionSync || options.dbuGrant ) return;
    const actor = item.parent;
    const picks = (actor instanceof Actor) && actor.items.some(x => x.flags?.["dbu-rpg"]?.grantedBy?.item === item.id);
    if ( !(actor instanceof Actor) || (actor.type === "fusion") || !(grantsOf(item).length || picks) ) return;
    removeGrants(actor, item.id).catch(console.error);
  });
}
