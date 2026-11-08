/**
 * Battle conditions of a scene (Battle Environments, Battle Weather, Light Levels): the GM sets them in the scene's
 * configuration (flags.dbu-rpg.battle = { environment, weather, light }) and the effects read them:
 * - @env.<key> = 1 for the Battle Environment the Character is in: a High Battle Environment by its token's height
 *   (8 Squares a rank: lowSky, highSky, localSpace, deepSpace), else the scene's (standard, bog, soft, lava, magma,
 *   underwater);
 * - @weather.<key> = 1 for the scene's Battle Weather (hot, cold, tornado, storm, earthquake, vile), @weather.any;
 * - @lightLevel: the scene's Light Level (-2 Pitch Black ... 2 Blinding).
 * The Light Level's penalties (Awareness, Defense Value, Perception) are applied by rules/derived.mjs, moved toward
 * Normal by "lightShift" pieces and ignored with "flag.ignoreLight".
 */
import { DEEP_SPACE, HIGH_ENVIRONMENTS, RANK_SQUARES } from "./height.mjs";

export const BATTLE_ENVIRONMENTS = ["standard", "bog", "soft", "lava", "magma", "underwater"];
export const BATTLE_WEATHERS = ["none", "hot", "cold", "tornado", "storm", "earthquake", "vile"];
export const LIGHT_LEVELS = [-2, -1, 0, 1, 2];

/** The battle conditions where an actor is: { env: { key: 1 }, weather: { key: 1, any }, lightLevel }. */
export function battleVars(actor) {
  const out = { env: {}, weather: {}, lightLevel: 0 };
  let token = null;
  let scene = null;
  try {
    token = actor?.getActiveTokens?.()?.[0]?.document ?? null;
    scene = token?.parent ?? globalThis.canvas?.scene ?? null;
  } catch(err) { scene = null; }
  const b = scene?.flags?.["dbu-rpg"]?.battle ?? {};
  let env = BATTLE_ENVIRONMENTS.includes(b.environment) ? b.environment : "standard";
  // (a token high above: the High Battle Environment of its height)
  try {
    const squares = Math.max(0, Math.round((Number(token?._source?.elevation ?? 0) || 0) / (scene?.grid?.distance || 1)));
    const rank = Math.min(DEEP_SPACE, Math.round(squares / RANK_SQUARES));
    if ( rank > 0 ) env = HIGH_ENVIRONMENTS[rank];
  } catch(err) { /* no token */ }
  out.env[env] = 1;
  const w = BATTLE_WEATHERS.includes(b.weather) ? b.weather : "none";
  if ( w !== "none" ) { out.weather[w] = 1; out.weather.any = 1; }
  out.lightLevel = Math.clamp(Math.round(Number(b.light) || 0), -2, 2);
  return out;
}

/** The Light Level after "lightShift" (toward Normal) and "flag.ignoreLight". */
export function effectiveLight(raw, shift = 0, ignore = false) {
  if ( ignore ) return 0;
  const n = Math.max(0, Math.abs(raw) - Math.max(0, Math.floor(shift)));
  return Math.sign(raw) * n;
}

/** The scene configuration's fields (Battle Environment, Battle Weather, Light Level). */
export function registerBattleConfig() {
  Hooks.on("renderSceneConfig", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const doc = app.document ?? app.object;
    if ( !root || !doc || root.querySelector(".dbu-battle-config") ) return;
    const L = k => game.i18n.localize(k);
    const b = doc.flags?.["dbu-rpg"]?.battle ?? {};
    const opt = (list, cur, pre) => list.map(k => `<option value="${k}" ${String(cur ?? "") === String(k) ? "selected" : ""}>${L(`${pre}.${k}`)}</option>`).join("");
    const box = document.createElement("fieldset");
    box.className = "dbu-battle-config";
    box.innerHTML = `<legend>${L("DBU.Battle.Title")}</legend>
      <div class="form-group"><label>${L("DBU.Battle.Environment")}</label>
        <select name="flags.dbu-rpg.battle.environment">${opt(BATTLE_ENVIRONMENTS, b.environment ?? "standard", "DBU.Battle.Env")}</select></div>
      <div class="form-group"><label>${L("DBU.Battle.Weather")}</label>
        <select name="flags.dbu-rpg.battle.weather">${opt(BATTLE_WEATHERS, b.weather ?? "none", "DBU.Battle.W")}</select></div>
      <div class="form-group"><label>${L("DBU.Battle.Light")}</label>
        <select name="flags.dbu-rpg.battle.light" data-dtype="Number">${opt(LIGHT_LEVELS, b.light ?? 0, "DBU.Battle.L")}</select></div>
      <p class="hint">${L("DBU.Battle.Hint")}</p>`;
    const target = root.querySelector('.tab[data-tab="basics"]') ?? root.querySelector("form") ?? root;
    target.append(box);
  });
  // The Characters on a scene are prepared again when its battle conditions change
  Hooks.on("updateScene", (scene, changes) => {
    if ( !foundry.utils.hasProperty(changes, "flags.dbu-rpg.battle") ) return;
    for ( const t of scene.tokens ) t.actor?.prepareData?.();
    for ( const app of Object.values(ui.windows ?? {}) ) if ( app?.actor && scene.tokens.some(t => t.actor === app.actor) ) app.render?.(false);
  });
}
