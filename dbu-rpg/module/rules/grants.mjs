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

/**
 * OG: is that option of a Racial Trait switched on (one of its pieces labelled "<Trait> — opção: <Name>[...]" active)?
 */
export function optionOn(item, name) {
  const want = norm(name);
  const head = label => norm(String(label ?? "").split(/opção:/i)[1]?.split(/\s[—:-]\s|:/)[0] ?? "");
  const full = label => norm(String(label ?? "").split(/opção:/i)[1] ?? "");
  return [...(item?.system?.modifiers ?? []), ...(item?.system?.triggers ?? [])]
    .some(p => (p.active !== false) && /opção:/i.test(String(p.label ?? "")) && ((head(p.label) === want) || (full(p.label) === want)));
}

/** Add to the actor what this item grants and it does not have yet. Returns the items created. */
export async function addGrants(actor, item, { notify = true } = {}) {
  const grants = grantsOf(item);
  if ( !actor || !grants.length ) return [];
  const create = [];
  for ( const g of grants ) {
    // OG: a grant of an option comes only once that option is switched on
    if ( g.option && !optionOn(item, g.option) ) continue;
    const has = actor.items.some(i => (i.type === g.type) && (norm(i.name) === norm(g.name)))
      || create.some(c => (c.type === g.type) && (norm(c.name) === norm(g.name)));
    if ( has ) {
      // F14 "+free": an Awakening already on the sheet gets the free Stack once (Spirit Control of a Yardrat upbringing)
      const ex = g.free ? actor.items.find(i => (i.type === g.type) && (norm(i.name) === norm(g.name))) : null;
      if ( ex && (ex.system?.freeStacks !== undefined) && !ex.flags?.["dbu-rpg"]?.freeBy?.[item.id] ) {
        const AW = await import("../combat/awakening.mjs");
        if ( await AW.gainStack(actor, ex, { free: true, ask: false, source: item.name }) ) await ex.setFlag("dbu-rpg", `freeBy.${item.id}`, true);
      }
      continue;
    }
    const src = g.uuid ? await fromUuid(g.uuid).catch(() => null) : null;
    // IG: a grant with its own item data (gear the Trait makes: its Natural Armor, an Integrated Weapon)
    if ( !src && !g.data ) continue;
    const data = g.data ? foundry.utils.deepClone(g.data) : src.toObject();
    delete data._id;
    // (IG: a Natural Armor's Craftsmanship Grade is the base Tier of Power, max. 5, when it is made)
    if ( g.data && (data.type === "apparel") && data.system?.natural ) data.system.craftsmanship = Math.clamp(Math.floor(actor.system?.top?.base ?? 1) || 1, 1, 5);
    // B5: a Transformation granted with an Aspect patch ("+aspect:prelude", "+aspect:natural:1")
    if ( (data.type === "transformation") && g.aspects?.length ) patchAspects(data, g.aspects);
    // F14 "+free": the Awakening comes with one Stack that neither counts towards the Awakening Limit nor gives the
    // Attribute Modifier Bonus
    if ( g.free && data.system && ("freeStacks" in data.system || "stacks" in data.system) ) {
      data.system.stacks = Math.max(1, Number(data.system.stacks) || 0);
      data.system.freeStacks = Math.max(1, Number(data.system.freeStacks) || 0);
    }
    foundry.utils.setProperty(data, "flags.dbu-rpg.grantedBy", item.id);
    // D3 "+active": it works only while the item that grants it does ("while in this Transformation")
    if ( g.active ) foundry.utils.setProperty(data, "flags.dbu-rpg.grantActive", true);
    // Q "+mastery:N": it works only once the item that grants it has N Masteries
    if ( g.mastery ) foundry.utils.setProperty(data, "flags.dbu-rpg.grantMastery", Number(g.mastery) || 0);
    // OG "+option": it goes when that option is switched off; "+res": it works only while that sheet resource is 1+
    if ( g.option ) foundry.utils.setProperty(data, "flags.dbu-rpg.grantOption", String(g.option));
    if ( g.res ) foundry.utils.setProperty(data, "flags.dbu-rpg.grantRes", String(g.res));
    // (T21 "+res:<slug>:<n>": that resource n+)
    if ( g.res && g.resMin ) foundry.utils.setProperty(data, "flags.dbu-rpg.grantResMin", Number(g.resMin) || 1);
    // (T22 "+picked:<Option>": that option of the granting item's choices picked)
    if ( g.picked ) foundry.utils.setProperty(data, "flags.dbu-rpg.grantPicked", String(g.picked));
    if ( g.state ) foundry.utils.setProperty(data, "flags.dbu-rpg.grantState", String(g.state));
    if ( g.uuid ) foundry.utils.setProperty(data, "_stats.compendiumSource", g.uuid);
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

/** F7 Neko Majin-Raised (4): a Copied Technique gained regains KP equal to its KP Cost (1/Round). */
async function copiedTechnique(item) {
  const actor = item?.parent;
  if ( !actor || (item.type !== "signature") || !/\bcopied\b/i.test(String(item.system?.tags ?? "")) ) return;
  const T = await import("../combat/triggers.mjs");
  // CS1 "techniqueCopied": you gained a Copied Technique (@kpCost: its Ki Point Cost)
  {
    const c = item.system?.computed ?? {};
    T.fireEvent(actor, "techniqueCopied", { scope: { kpCost: Math.max(0, ((c.kpUnits ?? 0) + (c.kpAdjust ?? 0)) * (actor.system?.top?.current ?? 1)) } });
  }
  if ( !actor.items.some(i => (i.type === "racialTrait") && /^neko majin-raised$/i.test(i.name)) ) return;
  const t = { limit: "1/Round" };
  if ( !T.triggerUsesLeft(actor, t, "nekomajinraised4") ) return;
  const comp = item.system?.computed ?? {};
  const kp = Math.max(0, ((comp.kpUnits ?? 0) + (comp.kpAdjust ?? 0)) * (actor.system?.top?.current ?? 1));
  if ( !kp ) return;
  await T.useTriggerLimit(actor, t, "nekomajinraised4");
  const text = await T.applyTriggerEffect(actor, "ki", kp, "", { label: "Neko Majin-Raised (4)" });
  const { postInfoCard } = await import("../dice/roller.mjs");
  await postInfoCard({ actor, title: "Neko Majin-Raised (4)", lines: [`${item.name}: ${text}`] });
}

/** Hooks: a Trait added to (removed from) a Character brings (takes away) what it grants. */
export function registerGrantHooks() {
  Hooks.on("createItem", (item, options, userId) => {
    if ( userId !== game.user.id ) return;
    copiedTechnique(item).catch(err => console.error("DBU | copied technique", err));
    legendaryStages(item).catch(err => console.error("DBU | Legendary Saiyan", err));
    rampageStages(item).catch(err => console.error("DBU | Inner Nature", err));
  });
  Hooks.on("createItem", (item, options, userId) => {
    if ( (userId !== game.user.id) || options.dbuFusionSync || options.dbuGrant ) return;
    const actor = item.parent;
    if ( !(actor instanceof Actor) || (actor.type === "fusion") || !grantsOf(item).length ) return;
    addGrants(actor, item).catch(console.error);
  });
  // OG: switching a Racial Trait's option on / off brings / takes away what that option grants
  Hooks.on("updateItem", (item, changes, options, userId) => {
    if ( (userId !== game.user.id) || options.dbuGrant ) return;
    const actor = item.parent;
    if ( !(actor instanceof Actor) || (actor.type === "fusion") || !grantsOf(item).some(g => g.option) ) return;
    if ( !(foundry.utils.hasProperty(changes, "system.modifiers") || foundry.utils.hasProperty(changes, "system.triggers")) ) return;
    syncOptionGrants(actor, item).catch(console.error);
  });
  Hooks.on("deleteItem", (item, options, userId) => {
    if ( (userId !== game.user.id) || options.dbuFusionSync || options.dbuGrant ) return;
    const actor = item.parent;
    const picks = (actor instanceof Actor) && actor.items.some(x => x.flags?.["dbu-rpg"]?.grantedBy?.item === item.id);
    if ( !(actor instanceof Actor) || (actor.type === "fusion") || !(grantsOf(item).length || picks) ) return;
    removeGrants(actor, item.id).catch(console.error);
  });
}

/** OG: the items of an item's "+option" grants follow its options (added when switched on, removed when off). */
export async function syncOptionGrants(actor, item) {
  const off = actor.items.filter(i => (i.flags?.["dbu-rpg"]?.grantedBy === item.id) && i.flags?.["dbu-rpg"]?.grantOption
    && !optionOn(item, i.flags["dbu-rpg"].grantOption)).map(i => i.id);
  if ( off.length ) await actor.deleteEmbeddedDocuments("Item", off, { dbuGrant: true });
  await addGrants(actor, item);
}

/**
 * F14 Legendary Saiyan (1): a Form (or an Evolved Stage without the Pinnacle Aspect) with the Super Saiyan Form Aspect
 * the character gains brings the Legendary Evolved Stage for that Transformation (system.original = its Form); the
 * Legendary Saiyan Factor Trait added brings it for the Forms already there.
 */
async function legendaryStages(item) {
  const actor = item?.parent;
  if ( !(actor instanceof Actor) || (actor.type === "fusion") ) return;
  const legendary = i => (i.type === "racialTrait") && /^legendary saiyan$/i.test(String(i.name ?? "").trim()) && (i.system?.isActive ?? true);
  if ( !actor.items.some(legendary) ) return;
  const ss = i => (i.type === "transformation") && !/^legendary$/i.test(i.name) && (i.system?.aspects ?? []).some(a => a.key === "superSaiyanForm")
    && !(i.system?.aspects ?? []).some(a => a.key === "pinnacle");
  const forms = legendary(item) ? actor.items.filter(ss) : (ss(item) ? [item] : []);
  if ( !forms.length ) return;
  const pack = game.packs.get("dbu-rpg.transformations");
  const doc = (await pack?.getDocuments() ?? []).find(d => /^legendary$/i.test(d.name));
  if ( !doc ) return;
  const slug = v => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const create = [];
  for ( const f of forms ) {
    const original = String(f.system?.original || f.name);
    const have = actor.items.some(i => (i.type === "transformation") && /^legendary$/i.test(i.name) && (slug(i.system?.original) === slug(original)))
      || create.some(c => slug(c.system.original) === slug(original));
    if ( have ) continue;
    const data = doc.toObject();
    delete data._id;
    data.system.original = original;
    foundry.utils.setProperty(data, "flags.dbu-rpg.legendaryFor", original);
    create.push(data);
  }
  if ( !create.length ) return;
  await actor.createEmbeddedDocuments("Item", create);
  ui.notifications.info(game.i18n.format("DBU.F14.Legendary", { names: create.map(c => c.system.original).join(", ") }));
}

/** CS2 Inner Nature (2): each Form of the character (not an Evolved Stage) has the Rampage Form Evolved Stage for it. */
async function rampageStages(item) {
  const actor = item?.parent;
  if ( !(actor instanceof Actor) || (actor.type === "fusion") ) return;
  const inner = i => (i.type === "racialTrait") && /^inner nature$/i.test(String(i.name ?? "").trim()) && (i.system?.isActive ?? true);
  if ( !actor.items.some(inner) ) return;
  const isForm = i => (i.type === "transformation") && (i.system?.transType === "form") && !String(i.system?.original ?? "").trim()
    && !/^rampage form$/i.test(i.name);
  const forms = inner(item) ? actor.items.filter(isForm) : (isForm(item) ? [item] : []);
  if ( !forms.length ) return;
  const doc = (await (game.packs.get("dbu-rpg.transformations")?.getDocuments() ?? [])).find(d => /^rampage form$/i.test(d.name));
  if ( !doc ) return;
  const slug = v => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const create = [];
  for ( const f of forms ) {
    if ( actor.items.some(i => /^rampage form$/i.test(i.name) && (slug(i.system?.original) === slug(f.name))) ) continue;
    const data = doc.toObject();
    delete data._id;
    data.system.original = f.name;
    foundry.utils.setProperty(data, "flags.dbu-rpg.rampageFor", f.name);
    create.push(data);
  }
  if ( create.length ) await actor.createEmbeddedDocuments("Item", create);
}
