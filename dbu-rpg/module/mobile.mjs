/**
 * Mobile mode: on phones and small tablets (a window smaller than the 1024 × 600 Foundry needs) the interface makes room
 * for the canvas and the chat, DBU windows fill the screen and the sheets stack into one column (styles/mobile.css),
 * and the compendium buttons of the sheets open a list to tap instead of a window to drag from (compendium-picker.mjs).
 * A client setting turns it on or off by hand.
 */
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

/** Windows narrower or shorter than Foundry's usable minimum (kept, so its change listener is not thrown away). */
const SMALL_SCREEN = "(max-width: 1023px), (max-height: 599px)";
let smallScreen = null;
const isSmallScreen = () => (smallScreen ??= window.matchMedia(SMALL_SCREEN)).matches;

/** Is the mobile mode on for this client? */
export function mobileActive() {
  const mode = game.settings?.settings?.has("dbu-rpg.mobileMode") ? game.settings.get("dbu-rpg", "mobileMode") : "auto";
  if ( mode === "on" ) return true;
  if ( mode === "off" ) return false;
  return isSmallScreen();
}

/** Switch the mobile layout on or off to match the setting and the window size. */
export function applyMobileMode() {
  const on = mobileActive();
  document.body.classList.toggle("dbu-mobile", on);
  for ( const app of foundry.applications.instances.values() ) {
    if ( !app.hasFrame || !app.rendered || app.minimized ) continue;
    if ( on ) {
      // An open window re-reads its size: in the mobile layout a sheet fills the screen
      MOBILE_SIZED.add(app);
      app.setPosition?.();
    }
    else restoreSize(app);
  }
}

/** Windows that were sized for the small screen: back on a big one they get their usual size again. */
const MOBILE_SIZED = new WeakSet();

function restoreSize(app) {
  if ( !MOBILE_SIZED.has(app) ) return;
  MOBILE_SIZED.delete(app);
  const { width, height } = app.options?.position ?? {};
  const size = {};
  if ( Number.isFinite(width) ) size.width = width;
  if ( Number.isFinite(height) ) size.height = height;
  if ( Object.keys(size).length ) app.setPosition?.(size);
}

let warned = false;

/**
 * Settings and hooks (from the init hook). Foundry warns, on screen and for good, that the window is smaller than it
 * needs; in the mobile mode that is the point, so a short note replaces that warning.
 */
export function registerMobile() {
  game.settings.register("dbu-rpg", "mobileMode", {
    name: "DBU.Mobile.Setting", hint: "DBU.Mobile.SettingHint", scope: "client", config: true, type: String,
    choices: { auto: "DBU.Mobile.Auto", on: "DBU.Mobile.On", off: "DBU.Mobile.Off" }, default: "auto",
    onChange: () => applyMobileMode()
  });
  const Notifications = foundry.applications.ui.Notifications;
  const notify = Notifications.prototype.notify;
  Notifications.prototype.notify = function(message, type, options) {
    if ( /^ERROR\.RESOLUTION\./.test(String(message)) && mobileActive() ) {
      if ( !warned ) {
        warned = true;
        notify.call(this, L("DBU.Mobile.Notice"), "info");
      }
      // A positive id no notification has: Foundry removes it again when the window changes size
      return { id: Number.MAX_SAFE_INTEGER, remove: () => null, update: () => null };
    }
    return notify.call(this, message, type, options);
  };
  isSmallScreen();
  smallScreen.addEventListener("change", () => applyMobileMode());
  // Some browsers only report the new size through the resize event (a phone turned sideways)
  window.addEventListener("resize", foundry.utils.debounce(() => {
    if ( document.body.classList.contains("dbu-mobile") !== mobileActive() ) applyMobileMode();
  }, 200), { passive: true });
  // The tables of the DBU windows sit in a box that scrolls sideways when the screen is too narrow for them; a window
  // opened on the small screen gets its usual size back on a big one
  Hooks.on("renderApplicationV2", (app, element) => {
    wrapTables(element);
    if ( !app.hasFrame ) return;
    if ( document.body.classList.contains("dbu-mobile") ) MOBILE_SIZED.add(app);
    else restoreSize(app);
  });
  applyMobileMode();
}

/** Put each DBU table in a box that can scroll sideways (styles/mobile.css). */
export function wrapTables(element) {
  const root = element instanceof HTMLElement ? element : element?.[0];
  if ( !root?.classList?.contains("dbu") && !root?.querySelector?.(".dbu-table") ) return;
  for ( const table of root.querySelectorAll("table.dbu-table") ) {
    if ( table.parentElement?.classList.contains("dbu-table-wrap") ) continue;
    const box = document.createElement("div");
    box.className = "dbu-table-wrap";
    table.before(box);
    box.append(table);
  }
}
