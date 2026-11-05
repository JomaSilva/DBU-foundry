/**
 * Targets without a keyboard (phones and tablets have no T key): a list of the scene's tokens to target by tapping. The
 * targets set here are the user's own Foundry targets, so every target-based action (attacks, Scan, Grapple...) uses them.
 */
import { tokenDistance } from "./canvas/height.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Tokens of the viewed scene that can be targeted: the ones the user sees, except the actor's own. */
function candidates(actor) {
  const own = new Set((actor?.getActiveTokens?.() ?? []).map(t => t.id));
  return (canvas.tokens?.placeables ?? []).filter(t => t.actor && !own.has(t.id) && (t.visible || game.user.isGM))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Ask which tokens to target and target them.
 * @param {Actor} [actor]  Who is acting (its own tokens are left out; the list shows the distance to each target)
 * @returns {Promise<Token[]|null>}  The targets, or null when cancelled
 */
export async function pickTargets(actor = null) {
  const tokens = candidates(actor);
  if ( !tokens.length ) {
    ui.notifications.warn(L("DBU.Targets.None"));
    return null;
  }
  const source = actor?.getActiveTokens?.()[0] ?? null;
  const rows = tokens.map(t => {
    let distance = "";
    if ( source ) {
      try { distance = L("DBU.Targets.Distance", { n: tokenDistance(source, t).total }); } catch(err) { distance = ""; }
    }
    return `<label class="dbu-target-option">
      <input type="checkbox" name="target" value="${t.id}" ${t.isTargeted ? "checked" : ""}>
      <img src="${esc(t.document.texture.src)}" alt="">
      <span><strong>${esc(t.name)}</strong>${distance ? `<small>${esc(distance)}</small>` : ""}</span>
    </label>`;
  }).join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: L("DBU.Targets.Title"), icon: "fa-solid fa-bullseye" },
    classes: ["dbu", "dbu-targets-dialog"],
    position: { width: 420 },
    content: `<div class="dbu-dialog dbu-targets"><p class="hint">${L("DBU.Targets.Hint")}</p>${rows}</div>`,
    buttons: [
      { action: "ok", label: L("DBU.Targets.Confirm"), icon: "fa-solid fa-bullseye", default: true,
        callback: (event, button) => Array.from(button.form.querySelectorAll("input[name=target]:checked")).map(i => i.value) },
      { action: "clear", label: L("DBU.Targets.Clear"), icon: "fa-solid fa-eraser", callback: () => [] }
    ],
    rejectClose: false
  });
  if ( !Array.isArray(result) ) return null;
  canvas.tokens.setTargets(result, { mode: "replace" });
  return tokens.filter(t => result.includes(t.id));
}
