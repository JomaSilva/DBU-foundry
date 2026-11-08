import { DBU } from "./config.mjs";
import { postInfoCard } from "./dice/roller.mjs";
import { ADVENTURING_BY_KEY, addUses, availableAdventuringManeuvers, sessionUses } from "./rules/adventuring.mjs";
import { fetchOfficialText } from "./rules/official-text.mjs";
import { encounterOf } from "./combat/triggers.mjs";
import { safeUpdate } from "./socket.mjs";
import { resolveClash } from "./combat/clash.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** "∞", "—" (not published) or the number. */
export function limitLabel(limit) {
  if ( limit === null || limit === undefined ) return "—";
  return Number.isFinite(limit) ? String(limit) : "∞";
}

/** Skill label ("Acrobacia"). */
const skillLabel = key => L(DBU.skills[key]?.label ?? key);

/** Characters that can be the target: the targeted tokens first, then the tokens of the scene, then the actors. */
export function targetCandidates(actor) {
  const seen = new Set([actor.uuid]);
  const out = [];
  const add = (a, label) => {
    if ( !a?.system?.skills || seen.has(a.uuid) ) return;
    seen.add(a.uuid);
    out.push({ actor: a, label: label ?? a.name });
  };
  for ( const t of game.user.targets ) add(t.actor, t.name);
  for ( const t of game.scenes.viewed?.tokens ?? [] ) add(t.actor, t.name);
  for ( const a of game.actors ) if ( ["character", "npc", "adversary", "fusion"].includes(a.type) ) add(a);
  return out;
}

/** The Skill (of a "Perception/Thievery" choice) the defender is best at. */
function bestSkill(actor, keys) {
  return keys.slice().sort((a, b) => (actor.system.skills[b]?.total ?? -99) - (actor.system.skills[a]?.total ?? -99))[0];
}

/** Ask what the maneuver needs (targets, Skill, Difficulty...). Returns the form data or null. */
async function ask(title, content) {
  const data = await DialogV2.wait({
    window: { title }, content: `<div class="dbu-dialog">${content}</div>`,
    buttons: [{ action: "ok", label: L("DBU.Adv.Use"), default: true,
      callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  return (data && (data !== "cancel")) ? data : null;
}

const difficultySelect = () => `<div class="form-group"><label>${L("DBU.Difficulty.label")}</label><select name="difficulty">
  ${Object.entries(DBU.difficulties).map(([k, d]) => `<option value="${k}" ${k === "qualified" ? "selected" : ""}>${L(d.label)} (${d.tn})</option>`).join("")}
  </select></div>`;

const skillSelect = keys => `<div class="form-group"><label>${L("DBU.Adv.Skill")}</label><select name="skill">
  ${keys.map(k => `<option value="${k}">${esc(skillLabel(k))}</option>`).join("")}</select></div>`;

/** Heal an actor (directly or through the GM) and return the line for the card. */
async function heal(target, life, ki = 0) {
  const s = target.system;
  const data = s.flags?.noLifeRegain ? {} : { "system.life.value": Math.min(s.life.max, s.life.value + life) };
  if ( ki ) data["system.ki.value"] = Math.min(s.ki.max, s.ki.value + ki);
  await safeUpdate(target, data);
  return ki ? L("DBU.Adv.Healed", { name: target.name, life, ki }) : L("DBU.Adv.HealedLife", { name: target.name, life });
}

/**
 * The Use button of an Adventuring Maneuver: only outside of a Combat Encounter, within its Session Limit.
 * Rolls what it rolls (Skill Checks, Clashes against the targets), applies what it applies (rest, care, Holding Back,
 * Stretch for the next combat) and posts the result.
 */
export async function useAdventuringManeuver(actor, key) {
  const entry = availableAdventuringManeuvers(actor).find(e => e.def.key === key);
  const def = entry?.def ?? ADVENTURING_BY_KEY[key];
  if ( !entry ) return ui.notifications.warn(L("DBU.Adv.NotAvailable", { name: def?.name ?? key }));
  if ( encounterOf(actor) ) return ui.notifications.error(L("DBU.Adv.InCombat", { name: def.name }));
  const uses = actor.system._source.adventure?.uses ?? [];
  const used = sessionUses(uses, key);
  if ( Number.isFinite(def.limit) && (used >= def.limit) ) {
    return ui.notifications.warn(L("DBU.Adv.Limit", { name: def.name, n: def.limit }));
  }
  // Scan: its own card (the scanned Character may try Concealment) and the use is counted there
  if ( def.use === "scan" ) {
    const { scan } = await import("./combat/scan.mjs");
    return scan(actor);
  }
  const sys = actor.system;
  const lines = [];
  const extraKeys = [];
  let whisper = null;
  switch ( def.use ) {
    case "breather": lines.push(await heal(actor, Math.floor(sys.life.max / 10), Math.floor(sys.ki.max / 10))); break;
    case "rest": lines.push(await heal(actor, Math.floor(sys.life.max / 2), Math.floor(sys.ki.max / 2))); break;
    case "care": {
      const options = [{ actor, label: `${actor.name} (${L("DBU.Adv.Self")})` }, ...targetCandidates(actor)];
      const form = await ask(def.name, `<div class="form-group"><label>${L("DBU.Adv.Target")}</label><select name="target">
        ${options.map((o, i) => `<option value="${i}" ${(i === 1) && game.user.targets.size ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>
        <label class="check"><input type="checkbox" name="rest" checked> ${L("DBU.Adv.CareRest")}</label>`);
      if ( !form ) return null;
      const target = options[Number(form.target)]?.actor;
      if ( !target ) return null;
      const t = target.system;
      const life = Math.floor(t.life.max / 4) + (form.rest ? Math.floor(t.life.max / 2) : 0);
      lines.push(await heal(target, life, form.rest ? Math.floor(t.ki.max / 2) : 0));
      if ( form.rest ) lines.push(L("DBU.Adv.CareRestLine"));
      break;
    }
    case "stretch":
      await actor.update({ "system.adventure.stretchAt": game.time.worldTime });
      lines.push(L("DBU.Adv.StretchReady"));
      break;
    case "holdingBack": {
      const max = sys.top.base;
      const form = await ask(def.name, `<p>${L("DBU.Adv.HoldingBackText", { max })}</p>
        <div class="form-group"><label>Holding Back</label><input type="number" name="n" value="${sys.combat.holdingBack ?? 0}" min="0" max="${max}"></div>`);
      if ( !form ) return null;
      const n = Math.clamp(Number(form.n) || 0, 0, max);
      await actor.update({ "system.combat.holdingBack": n });
      lines.push(L("DBU.Adv.HoldingBackSet", { n }));
      break;
    }
    case "check": {
      const keys = entry.skills.length ? entry.skills : (def.check ?? []);
      const form = await ask(def.name, `${keys.length > 1 ? skillSelect(keys) : ""}${difficultySelect()}`);
      if ( !form ) return null;
      const skill = form.skill || keys[0];
      const r = await actor.rollSkill(skill, { difficulty: form.difficulty, subtitle: `${def.name} — ${L(DBU.difficulties[form.difficulty].label)} (TN ${DBU.difficulties[form.difficulty].tn})` });
      if ( !r ) return null;
      const ok = !r.autoFail && (r.total >= DBU.difficulties[form.difficulty].tn);
      lines.push(L(ok ? "DBU.Adv.CheckOk" : "DBU.Adv.CheckFail", { skill: skillLabel(skill), total: r.total }));
      break;
    }
    case "clash": {
      const c = def.clash;
      const options = targetCandidates(actor);
      if ( !options.length ) return ui.notifications.warn(L("DBU.Adv.NoTargets"));
      const pre = new Set(Array.from(game.user.targets).map(t => t.actor?.uuid));
      const field = c.multi
        ? `<div class="dbu-adv-targets">${options.map((o, i) => `<label class="check"><input type="checkbox" name="t${i}" ${pre.has(o.actor.uuid) ? "checked" : ""}> ${esc(o.label)}</label>`).join("")}</div>`
        : `<div class="form-group"><label>${L("DBU.Adv.Target")}</label><select name="target">${options.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join("")}</select></div>`;
      const form = await ask(def.name, `<p>${L("DBU.Adv.ClashText", { skill: skillLabel(c.skills[0]), vs: c.vs.map(skillLabel).join("/") })}</p>${field}`);
      if ( !form ) return null;
      const chosen = c.multi ? options.filter((o, i) => form[`t${i}`]) : [options[Number(form.target)]].filter(Boolean);
      if ( !chosen.length ) return ui.notifications.warn(L("DBU.Adv.NoTargets"));
      // Once per Character each session (Gauge, Profiling, Frighten, Befriend)
      const targets = chosen.filter(o => !(c.oncePerTarget && sessionUses(uses, `${key}:${o.actor.uuid}`)));
      for ( const o of chosen ) if ( !targets.includes(o) ) ui.notifications.warn(L("DBU.Adv.OncePerTarget", { name: def.name, target: o.label }));
      if ( !targets.length ) return null;
      // Pickpocket: −3 for each earlier attempt against that Character this session
      const penalty = c.penaltyPerTarget ? c.penaltyPerTarget * sessionUses(uses, `${key}:${targets[0].actor.uuid}`) : 0;
      const mode = c.secret ? "blindroll" : undefined;
      // One roll of the user's Skill against every target (combat/clash.mjs: clash.* pieces, clashWon / clashLost)
      let mine = null;
      for ( const o of targets ) {
        const skill = bestSkill(o.actor, c.vs);
        const r = await resolveClash(actor, o.actor, { mine: c.skills[0], theirs: skill, via: def.name, card: false, mineResult: mine,
          rollOptions: { subtitle: `${def.name} (Clash)`, penalty, penaltyLabel: def.name, messageMode: mode },
          defenderRollOptions: { subtitle: `${def.name} — ${actor.name}`,
            messageMode: c.secret ? "blindroll" : (o.actor.isOwner ? undefined : "gmroll") } });
        if ( !r ) return null;
        mine = r.mineRoll;
        const win = r.won; // a tie goes to the defender
        lines.push(L(win ? "DBU.Adv.ClashWin" : "DBU.Adv.ClashLose", { target: o.label, mine: r.mine, theirs: r.theirs, skill: skillLabel(skill) }));
        if ( win && c.reveal ) {
          const a = o.actor.system;
          const alignment = L(DBU.alignments[String(a.zsoul?.alignment ?? 0)] ?? "");
          await postInfoCard({ actor, title: `${def.name}: ${o.label}`, lines: [L("DBU.Adv.GaugeResult", { pl: a.pl, alignment })],
            whisper: [game.user.id, ...game.users.filter(u => u.isGM).map(u => u.id)] });
        }
        extraKeys.push(`${key}:${o.actor.uuid}`);
      }
      if ( c.secret ) whisper = game.users.filter(u => u.isGM).map(u => u.id);
      break;
    }
    case "might": {
      const options = targetCandidates(actor);
      const form = await ask(def.name, `<p>${L("DBU.Adv.MightText")}</p><div class="form-group"><label>${L("DBU.Adv.Target")}</label>
        <select name="target">${options.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join("")}</select></div>`);
      if ( !form ) return null;
      const target = options[Number(form.target)]?.actor;
      if ( !target ) return null;
      const r = await resolveClash(actor, target, { mine: "might", via: def.name, card: false });
      const win = !!r?.won;
      lines.push(L(win ? "DBU.Adv.ClashWin" : "DBU.Adv.ClashLose", { target: target.name, mine: r?.mine ?? 0, theirs: r?.theirs ?? 0, skill: "Might" }));
      break;
    }
    default: break;
  }
  await actor.update({ "system.adventure.uses": addUses(uses, key, ...extraKeys) });
  const n = used + 1;
  return postInfoCard({
    actor, title: def.name, img: actor.img, whisper,
    subtitle: [L("DBU.Adv.Maneuver"), entry.time ? L("DBU.Adv.Time", { time: entry.time }) : ""].filter(Boolean).join(" · "),
    lines: [L(`DBU.Adv.Effect.${key}`), ...lines,
      Number.isFinite(def.limit) ? L("DBU.Adv.UsesLine", { n, max: def.limit }) : L("DBU.Adv.UsesFree", { n })]
  });
}

/** The official text of an Adventuring Maneuver (or of what gives it) to chat. */
export async function postAdventuringText(actor, key) {
  const def = ADVENTURING_BY_KEY[key];
  if ( !def ) return null;
  const page = def.page ?? "adventure";
  const section = def.section ?? def.sources?.find(s => s.section)?.section ?? def.name;
  const html = await fetchOfficialText(page, section).catch(() => null);
  return postInfoCard({ actor, title: def.name, subtitle: L("DBU.Adv.Maneuver"), lines: [L(`DBU.Adv.Effect.${key}`)],
    extraHTML: html ?? `<p><a href="https://dbu-rpg.com/${page}/" target="_blank" rel="noopener">dbu-rpg.com/${page}</a></p>` });
}

/** A new Adventuring Session: the Session Limits start over (one actor, or all of them for the GM). */
export async function newAdventuringSession(actors) {
  for ( const a of actors ) {
    if ( !a?.system?.adventure ) continue;
    await safeUpdate(a, { "system.adventure.uses": [], "system.adventure.stretchAt": null });
  }
  ui.notifications.info(L("DBU.Adv.NewSessionDone", { n: actors.length }));
}

/**
 * Start of a Combat Encounter: a Stretch done within the hour gives +1(T) to the Combat Rolls for the first 3 Combat
 * Rounds (it is used up either way).
 */
export async function applyStretch(actor) {
  const at = actor.system.adventure?.stretchAt;
  if ( (at === null) || (at === undefined) ) return null;
  await actor.update({ "system.adventure.stretchAt": null });
  if ( (game.time.worldTime - at) > 3600 ) return null;
  const { addTimedModifier } = await import("./combat/triggers.mjs");
  await addTimedModifier(actor, { target: "combat", value: "1(T)", condition: "", label: "Stretch", active: true }, { rounds: 3 });
  return L("DBU.Adv.StretchOn", { name: actor.name });
}
