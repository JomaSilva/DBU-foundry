/**
 * F12 Stored items (Slimy Consistency): items kept inside the body, flagged flags.dbu-rpg.stored and unequipped (they
 * cannot be Snatched; the sheet shows them as Stored).
 * - storeItems(actor): the player ticks Basic Items, Accessories, Apparel and Weapons of the actor to Store;
 * - takeStored(actor): for each Stored item, keep it, take it out, or take it out and equip it;
 * - storeWeaponOf(actor, other): one of the other Character's equipped Weapons goes Stored on the actor (it leaves the
 *   other's sheet; through the GM when the player does not own it).
 */
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Is the item Stored? */
export function isStored(item) {
  return !!item?.flags?.["dbu-rpg"]?.stored;
}

/** The items that may be Stored: Basic Items, Accessories, Apparel and Weapons (not Integrated, not Natural). */
const storable = i => ["item", "apparel", "weapon"].includes(i.type) && !isStored(i) && !i.system?.integrated
  && !i.flags?.["dbu-rpg"]?.integrated && !i.system?.natural;

/** Store the items the player ticks. @returns a text for the card. */
export async function storeItems(actor, { title = "" } = {}) {
  const items = (actor?.items ?? []).filter(storable);
  if ( !items.length ) return L("DBU.Store.None");
  const rows = items.map(i => `<label class="check"><input type="checkbox" name="${i.id}"> ${esc(i.name)}</label>`).join("<br>");
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: title || L("DBU.Store.Title") },
    content: `<div class="dbu-dialog"><p>${L("DBU.Store.Pick")}</p>${rows}</div>`,
    buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), default: true,
      callback: (e, b) => items.filter(i => b.form.elements[i.id]?.checked).map(i => i.id) },
    { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  if ( !Array.isArray(picked) || !picked.length ) return "";
  await actor.updateEmbeddedDocuments("Item", picked.map(id => ({ _id: id, "flags.dbu-rpg.stored": true, "system.equipped": false })));
  return L("DBU.Store.Done", { names: picked.map(id => actor.items.get(id)?.name).filter(Boolean).join(", ") });
}

/** Take Stored items out (or out and equipped). @returns a text for the card. */
export async function takeStored(actor, { title = "" } = {}) {
  const items = (actor?.items ?? []).filter(isStored);
  if ( !items.length ) return L("DBU.Store.NoneStored");
  const equippable = i => ["apparel", "weapon"].includes(i.type) || ((i.type === "item") && (i.system?.itemType === "accessory"));
  const rows = items.map(i => `<div class="form-group"><label>${esc(i.name)}</label><select name="${i.id}">
      <option value="keep">${L("DBU.Store.Keep")}</option><option value="out">${L("DBU.Store.Out")}</option>
      ${equippable(i) ? `<option value="equip">${L("DBU.Store.Equip")}</option>` : ""}</select></div>`).join("");
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: title || L("DBU.Store.TakeTitle") },
    content: `<div class="dbu-dialog">${rows}</div>`,
    buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), default: true,
      callback: (e, b) => Object.fromEntries(items.map(i => [i.id, b.form.elements[i.id]?.value ?? "keep"])) },
    { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  if ( !picked || (typeof picked !== "object") ) return "";
  const updates = [];
  for ( const [id, what] of Object.entries(picked) ) {
    if ( what === "out" ) updates.push({ _id: id, "flags.dbu-rpg.-=stored": null });
    else if ( what === "equip" ) updates.push({ _id: id, "flags.dbu-rpg.-=stored": null, "system.equipped": true });
  }
  if ( !updates.length ) return "";
  await actor.updateEmbeddedDocuments("Item", updates);
  return L("DBU.Store.Taken", { names: updates.map(u => actor.items.get(u._id)?.name).filter(Boolean).join(", ") });
}

/** One of `other`'s equipped Weapons Stored on `actor` (picked when there are several). @returns a text for the card. */
export async function storeWeaponOf(actor, other, { title = "" } = {}) {
  const weapons = (other?.items ?? []).filter(i => (i.type === "weapon") && i.system?.equipped && !i.system?.integrated);
  if ( !weapons.length ) return L("DBU.Store.NoWeapon", { name: other?.name ?? "" });
  let w = weapons[0];
  if ( weapons.length > 1 ) {
    const id = await foundry.applications.api.DialogV2.wait({
      window: { title: title || L("DBU.Store.Title") },
      content: `<div class="dbu-dialog"><select name="id">${weapons.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select></div>`,
      buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), default: true, callback: (e, b) => b.form.elements.id.value },
        { action: "cancel", label: L("Cancel") }],
      rejectClose: false
    });
    w = weapons.find(i => i.id === id) ?? null;
    if ( !w ) return "";
  }
  const data = w.toObject();
  delete data._id;
  data.system.equipped = false;
  foundry.utils.setProperty(data, "flags.dbu-rpg.stored", true);
  await actor.createEmbeddedDocuments("Item", [data]);
  const { runOps } = await import("../combat/movement.mjs");
  await runOps([{ op: "delete", uuid: w.uuid }]);
  return L("DBU.Store.TookWeapon", { name: actor.name, weapon: w.name, other: other.name });
}

/**
 * F16 Assimilation (4): the equipped Top Layer of Apparel of the Absorbed Character (a world actor of that name) is copied
 * onto the actor, equipped, while the Absorption Stack lasts (flags.dbu-rpg.borrowed); the actor's own Top Layer is
 * unequipped (flags.dbu-rpg.stashedBy) and comes back when that Stack is lost (registerBorrowHooks).
 */
export async function borrowApparel(actor, name, { awakeningId = null } = {}) {
  const other = name ? game.actors.find(a => (a !== actor) && (a.name === name)) : null;
  if ( !other ) return L("DBU.Store.NoAbsorbed", { name: name || "?" });
  const top = other.items.find(i => (i.type === "apparel") && i.system?.equipped && (i.system?.layer === "top"));
  if ( !top ) return L("DBU.Store.NoTop", { name: other.name });
  const aw = awakeningId ? actor.items.get(awakeningId) : null;
  const mine = actor.items.filter(i => (i.type === "apparel") && i.system?.equipped && (i.system?.layer === "top"));
  if ( mine.length ) await actor.updateEmbeddedDocuments("Item", mine.map(i => ({ _id: i.id, "system.equipped": false, "flags.dbu-rpg.stashedBy": aw?.id ?? "any" })));
  const data = top.toObject();
  delete data._id;
  data.system.equipped = true;
  data.system.integrated = false;
  foundry.utils.setProperty(data, "flags.dbu-rpg.borrowed", { awakening: aw?.id ?? null, stacks: Number(aw?.system?.stacks ?? 1) || 1, from: other.name });
  await actor.createEmbeddedDocuments("Item", [data]);
  return L("DBU.Store.Borrowed", { name: actor.name, item: top.name, other: other.name });
}

/** F16: an Absorption Stack lost (or the Awakening removed) gives back the Apparel its Absorbed Character's piece replaced. */
export function registerBorrowHooks() {
  const settle = async (actor, awId, stacksNow) => {
    const gone = actor.items.filter(i => (i.flags?.["dbu-rpg"]?.borrowed?.awakening === awId) && (stacksNow < (i.flags["dbu-rpg"].borrowed.stacks ?? 1)));
    if ( !gone.length ) return;
    await actor.deleteEmbeddedDocuments("Item", gone.map(i => i.id));
    const back = actor.items.filter(i => i.flags?.["dbu-rpg"]?.stashedBy === awId);
    if ( back.length ) await actor.updateEmbeddedDocuments("Item", back.map(i => ({ _id: i.id, "system.equipped": true, "flags.dbu-rpg.-=stashedBy": null })));
  };
  Hooks.on("updateItem", (item, changes, options, userId) => {
    if ( (userId !== game.user.id) || !(item.parent instanceof Actor) ) return;
    const n = foundry.utils.getProperty(changes, "system.stacks");
    if ( n === undefined ) return;
    settle(item.parent, item.id, Number(n) || 0).catch(console.error);
  });
  Hooks.on("deleteItem", (item, options, userId) => {
    if ( (userId !== game.user.id) || !(item.parent instanceof Actor) ) return;
    if ( item.parent.items.some(i => i.flags?.["dbu-rpg"]?.borrowed?.awakening === item.id) ) settle(item.parent, item.id, 0).catch(console.error);
  });
}
