/**
 * Integrated items an effect changes: Integrate an item you possess (Mutant Core 3) or destroy one of your Integrated
 * items (Mutant Core 4). Apparel and Weapons keep it in system.integrated; Basic Items and Accessories in
 * flags.dbu-rpg.integrated. The player picks the item in a dialog.
 */
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** Is the item Integrated? */
export function isIntegrated(item) {
  return !!(item?.system?.integrated || item?.flags?.["dbu-rpg"]?.integrated);
}

/** Pick one of the items in a dialog. @returns {Promise<Item|null>} */
async function pickItem(items, title) {
  if ( !items.length ) return null;
  const esc = s => foundry.utils.escapeHTML(String(s));
  const options = items.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join("");
  const data = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `<div class="dbu-dialog"><div class="form-group"><select name="item">${options}</select></div></div>`,
    buttons: [{ action: "ok", label: L("DBU.Integrate.Pick"), default: true, callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
      { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  if ( !data || (data === "cancel") ) return null;
  return items.find(i => i.id === data.item) ?? null;
}

/** Integrate an Apparel, Weapon or item of the actor (equipped too). @returns a text for the card. */
export async function integrateItem(actor, { title = "" } = {}) {
  const items = (actor?.items ?? []).filter(i => ["apparel", "weapon", "item"].includes(i.type) && !isIntegrated(i));
  if ( !items.length ) return L("DBU.Integrate.None");
  const item = await pickItem(items, title || L("DBU.Integrate.Title"));
  if ( !item ) return "";
  const update = (item.type === "item") ? { "flags.dbu-rpg.integrated": true, "system.equipped": true } : { "system.integrated": true, "system.equipped": true };
  await item.update(update);
  return L("DBU.Integrate.Done", { name: item.name });
}

/** Destroy one of the actor's Integrated items. @returns a text for the card. */
export async function destroyIntegrated(actor, { title = "" } = {}) {
  const items = (actor?.items ?? []).filter(i => isIntegrated(i));
  if ( !items.length ) return L("DBU.Integrate.NoneIntegrated");
  const item = await pickItem(items, title || L("DBU.Integrate.DestroyTitle"));
  if ( !item ) return "";
  await item.delete();
  return L("DBU.Integrate.Destroyed", { name: item.name });
}
