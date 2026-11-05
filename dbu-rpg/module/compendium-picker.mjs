/**
 * Adding from a compendium without dragging (phones and tablets): a list of the pack's entries with a search box; tapping
 * one adds it to the sheet the way a drop would (a new race replaces the old one, an Awakening the character has gains a
 * Stack, Talents and Traits keep their checks).
 */
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Lower-case text without accents, for the search. */
const fold = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Open the list of one of the system's Item compendiums for an actor sheet.
 * @param {ActorSheetV2} sheet
 * @param {string} name   The pack name ("transformations", "talents"...)
 */
export async function openCompendiumPicker(sheet, name) {
  const pack = game.packs.get(`dbu-rpg.${name}`);
  if ( !pack ) return null;
  if ( pack.documentName !== "Item" ) return pack.render(true);
  const index = await pack.getIndex({ fields: ["system.summary", "folder", "type", "img"] });
  const folders = new Map((pack.folders ?? []).map(f => [f.id, f.name]));
  const entries = Array.from(index).filter(e => !String(e.name).startsWith("#"))
    .map(e => ({ id: e._id, name: e.name, img: e.img, folder: folders.get(e.folder) ?? "", summary: e.system?.summary ?? "" }))
    .sort((a, b) => (a.folder.localeCompare(b.folder)) || a.name.localeCompare(b.name));
  const rows = entries.map(e => `
    <li data-search="${esc(fold(`${e.name} ${e.folder} ${e.summary}`))}">
      <button type="button" class="dbu-picker-entry" data-pick="${e.id}">
        <img src="${esc(e.img)}" alt="">
        <span><strong>${esc(e.name)}</strong>${(e.folder || e.summary) ? `<small>${esc([e.folder, e.summary].filter(Boolean).join(" · "))}</small>` : ""}</span>
        <i class="fa-solid fa-plus"></i>
      </button>
    </li>`).join("");
  const content = `<div class="dbu-picker">
    <input type="search" name="q" placeholder="${esc(L("DBU.Picker.Search"))}" autocomplete="off">
    <p class="hint">${L("DBU.Picker.Hint", { name: esc(sheet.actor.name) })}</p>
    <ul class="dbu-picker-list">${rows}</ul>
    <p class="dbu-picker-none hint" hidden>${L("DBU.Picker.None")}</p>
  </div>`;
  return foundry.applications.api.DialogV2.wait({
    window: { title: pack.title, icon: "fa-solid fa-book" },
    classes: ["dbu", "dbu-picker-dialog"],
    position: { width: 480, height: 640 },
    content,
    buttons: [
      { action: "full", label: L("DBU.Picker.Full"), icon: "fa-solid fa-book-open", callback: () => pack.render(true) },
      { action: "close", label: L("DBU.Picker.Close"), icon: "fa-solid fa-check", default: true }
    ],
    render: (event, dialog) => {
      const root = dialog.element;
      const search = root.querySelector("input[name=q]");
      const items = Array.from(root.querySelectorAll(".dbu-picker-list li"));
      const none = root.querySelector(".dbu-picker-none");
      search?.addEventListener("input", () => {
        const words = fold(search.value).split(/\s+/).filter(Boolean);
        let shown = 0;
        for ( const li of items ) {
          const hit = words.every(w => li.dataset.search.includes(w));
          li.hidden = !hit;
          if ( hit ) shown++;
        }
        none.hidden = shown > 0;
      });
      root.querySelectorAll("[data-pick]").forEach(button => button.addEventListener("click", async ev => {
        ev.preventDefault();
        button.disabled = true;
        try {
          const doc = await pack.getDocument(button.dataset.pick);
          if ( !doc ) return;
          const before = sheet.actor.items.size;
          const result = await sheet._onDropItem({ shiftKey: false, preventDefault: () => null, stopPropagation: () => null,
            target: sheet.element, currentTarget: sheet.element }, doc);
          if ( result || (sheet.actor.items.size !== before) ) {
            button.closest("li")?.classList.add("added");
            ui.notifications.info(L("DBU.Picker.Added", { item: doc.name, name: sheet.actor.name }));
          }
        } finally {
          button.disabled = false;
        }
      }));
    },
    rejectClose: false
  });
}
