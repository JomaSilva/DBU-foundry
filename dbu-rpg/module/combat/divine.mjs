import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { safeUpdate } from "../socket.mjs";
import { openAttackDialog } from "./attack.mjs";
import { encounterOf } from "./triggers.mjs";

const { DialogV2 } = foundry.applications.api;
const FDE = () => foundry.applications.ux.FormDataExtended;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const FLAG = "dbu-rpg";

/*
 * Divine Ki Points (God Ki): a second pool of Ki Points, 1/2 of the Maximum Ki Points without the Ki Multiplier, for
 * whoever has a Transformation with the God Ki Aspect (or is in the God Ki State). It is full at the start of each Combat
 * Encounter and can only be used in the God Ki State: one payment comes from a single pool, and Divine Ki Points use
 * 1/2 (rounded up) of the Capacity Rate.
 */

/** Does this Transformation have the God Ki Aspect? */
export const isGodKi = t => !!t.system.aspects?.some(a => a.key === "godKi");

/**
 * No Energy: Ki Points at 0 end the Forms and Enhancements (and give Stress Exhaustion); for the ones with the God Ki
 * Aspect it is the Divine Ki Points that count.
 * @returns {string|null}   "ki", "dkp" or null
 */
export function noEnergy(sys) {
  const active = sys.transformation?.active ?? [];
  if ( active.some(t => !isGodKi(t)) && (sys.ki.value <= 0) ) return "ki";
  if ( active.some(isGodKi) && ((sys.dkp?.value ?? 0) <= 0) ) return "dkp";
  return null;
}

/** Fill the Divine Ki Points once per Combat Encounter (at its start, or when the access comes during it). */
export async function fillDkp(actor, combat) {
  const dkp = actor?.system?.dkp;
  if ( !dkp?.access || !combat || (dkp.combat === combat.id) ) return false;
  await actor.update({ "system.dkp.value": dkp.max, "system.dkp.combat": combat.id });
  return true;
}

/** The Capacity a payment uses: Divine Ki Points only 1/2 (rounded up) of the Capacity Rate. */
export const capacityFor = (amount, divine) => (divine ? Math.ceil(amount / 2) : amount);

/**
 * One payment of Ki Points, from a single pool.
 * @returns {{updates: object, problems: string[]}}
 */
export function kiPayment(sys, amount, { divine = false } = {}) {
  const problems = [];
  const pool = divine ? "dkp" : "ki";
  const have = sys[pool]?.value ?? 0;
  const capacity = capacityFor(amount, divine);
  if ( divine && !sys.dkp?.usable ) problems.push(L("DBU.Dkp.ErrState"));
  if ( amount > have ) problems.push(L(divine ? "DBU.Dkp.ErrNotEnough" : "DBU.Attack.ErrKi", { need: amount, have }));
  if ( capacity > sys.capacity.value ) problems.push(L("DBU.Attack.ErrCapacity", { need: capacity, have: sys.capacity.value }));
  return {
    problems,
    updates: { [`system.${pool}.value`]: Math.max(0, have - amount), "system.capacity.value": Math.max(0, sys.capacity.value - capacity) }
  };
}

/* -------------------------------------------- */
/*  Empower Maneuver                            */
/* -------------------------------------------- */

/**
 * Empower [1/Round]: for each Action spent, transfer up to twice your Might in Ki Points to the targeted Ally (double
 * within your Melee Range), without reducing your Capacity. Divine Ki Points can be sent to an Ally also in God Ki.
 */
export async function empower(actor) {
  const sys = actor.system;
  const target = Array.from(game.user.targets ?? []).find(t => t.actor && (t.actor !== actor));
  const ally = target?.actor;
  if ( !ally?.system?.ki ) return ui.notifications.warn(L("DBU.Empower.NoTarget"));
  const fighting = !!game.combat?.started;
  const maxActions = fighting ? Math.max(0, sys.combat.actions ?? 0) : 3;
  if ( maxActions < 1 ) return ui.notifications.warn(L("DBU.Attack.ErrActions", { need: 1, have: 0 }));
  const might = sys.aptitudes?.might ?? 0;
  const divine = !!(sys.dkp?.usable && ally.system.dkp?.usable);
  const actionOptions = Array.fromRange(maxActions, 1).map(n => `<option value="${n}">${n}</option>`).join("");
  const data = await DialogV2.wait({
    window: { title: `Empower → ${ally.name}`, icon: "fa-solid fa-hand-holding-heart" },
    content: `<div class="dbu-dialog">
      <p>${L("DBU.Empower.Text", { might, n: 2 * might })}</p>
      <div class="form-group"><label>${L("DBU.Recovery.Actions")}</label><select name="actions">${actionOptions}</select></div>
      <label><input type="checkbox" name="melee"> ${L("DBU.Empower.Melee")}</label>
      ${divine ? `<div class="form-group"><label>${L("DBU.Empower.Pool")}</label><select name="pool">
        <option value="ki">KP (${sys.ki.value})</option><option value="dkp" ${sys.dkp.prefer ? "selected" : ""}>DKP (${sys.dkp.value})</option></select></div>` : ""}
      <div class="form-group"><label>${L("DBU.Empower.Amount")}</label><input type="number" name="amount" value="0" min="0" step="1"></div>
      <p class="hint">${L("DBU.Empower.Hint")}</p></div>`,
    buttons: [{ action: "ok", label: "Empower", icon: "fa-solid fa-hand-holding-heart", default: true,
      callback: (e, b) => new (FDE())(b.form).object },
    { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  if ( !data || (data === "cancel") ) return null;
  const actions = Math.clamp(Number(data.actions) || 1, 1, maxActions);
  const pool = (divine && (data.pool === "dkp")) ? "dkp" : "ki";
  const limit = 2 * might * (data.melee ? 2 : 1) * actions;
  const have = sys[pool].value;
  const room = Math.max(0, (ally.system[pool].max ?? 0) - (ally.system[pool].value ?? 0));
  const asked = Number(data.amount) > 0 ? Number(data.amount) : limit;
  const amount = Math.max(0, Math.min(asked, limit, have, room));
  await actor.update({ [`system.${pool}.value`]: have - amount, ...actor._spendAction(actions) });
  await safeUpdate(ally, { [`system.${pool}.value`]: (ally.system[pool].value ?? 0) + amount });
  return postInfoCard({ actor, title: "Empower", lines: [
    L("DBU.Empower.Done", { n: amount, pool: pool === "dkp" ? "DKP" : "KP", name: ally.name, limit, actions }),
    ...(asked > amount ? [L("DBU.Empower.Capped")] : []),
    L("DBU.Empower.Exploit")
  ] });
}

/* -------------------------------------------- */
/*  God Maneuvers                               */
/* -------------------------------------------- */

/** "2(T)", "5(bT)": a fixed Divine Ki Point Cost (Ki Point Costs use the ToP that Breakthrough does not raise). */
export function dkpCost(text, sys) {
  const m = /^(\d+)\s*\((b?T)\)/i.exec(String(text ?? "").trim());
  if ( !m ) return null;
  return Number(m[1]) * ((m[2].toLowerCase() === "bt") ? sys.top.base : sys.top.kp);
}

/** The started Combat Encounter the actor takes part in. */
function combatOf(actor) {
  return encounterOf(actor);
}

/** What the frequency still allows this Combat Encounter ("1/Round, 3/Encounter"): a problem text or null. */
function frequencyProblem(item) {
  const combat = combatOf(item.actor);
  if ( !combat ) return null;
  const f = item.system.frequency ?? "";
  const used = item.getFlag(FLAG, "uses") ?? {};
  const same = used.combat === combat.id;
  const inRound = (same && (used.round === combat.round)) ? (used.inRound ?? 0) : 0;
  const inEncounter = same ? (used.inEncounter ?? 0) : 0;
  const perRound = Number(/(\d+)\s*\/\s*Round/i.exec(f)?.[1] ?? 0);
  const perEncounter = Number(/(\d+)\s*\/\s*Encounter/i.exec(f)?.[1] ?? 0);
  if ( perRound && (inRound >= perRound) ) return L("DBU.God.RoundLimit", { name: item.name, n: perRound });
  if ( perEncounter && (inEncounter >= perEncounter) ) return L("DBU.God.EncounterLimit", { name: item.name, n: perEncounter });
  return null;
}

async function recordUse(item) {
  const combat = combatOf(item.actor);
  if ( !combat ) return;
  const used = item.getFlag(FLAG, "uses") ?? {};
  const same = used.combat === combat.id;
  await item.setFlag(FLAG, "uses", {
    combat: combat.id, round: combat.round,
    inRound: ((same && (used.round === combat.round)) ? (used.inRound ?? 0) : 0) + 1,
    inEncounter: (same ? (used.inEncounter ?? 0) : 0) + 1
  });
}

/** Spend a God Maneuver's Divine Ki Points (and Actions / Counter Actions). False when it cannot be paid. */
async function payGodManeuver(actor, item, amount, { actions = 0, counters = 0, extra = {} } = {}) {
  const sys = actor.system;
  const pay = kiPayment(sys, amount, { divine: true });
  if ( game.combat?.started && (actions > (sys.combat.actions ?? 0)) ) {
    pay.problems.push(L("DBU.Attack.ErrActions", { need: actions, have: sys.combat.actions }));
  }
  if ( game.combat?.started && (counters > (sys.combat.counters ?? 0)) ) pay.problems.push(L("DBU.Defense.NoCounter"));
  if ( pay.problems.length ) {
    ui.notifications.error(pay.problems.join(" "));
    return false;
  }
  const updates = { ...pay.updates, ...actor._spendAction(actions), ...extra };
  if ( counters && game.combat?.started ) updates["system.combat.counters"] = Math.max(0, sys.combat.counters - counters);
  await actor.update(updates);
  await recordUse(item);
  return true;
}

/** Pick one of the character's Transformations with the God Ki Aspect they are not in. */
async function chooseGodKiTransformation(actor, title) {
  const list = actor.items.filter(i => (i.type === "transformation") && (i.system.transType !== "awakening")
    && isGodKi(i) && !i.system.active);
  if ( !list.length ) {
    ui.notifications.warn(L("DBU.God.NoGodKiForm"));
    return null;
  }
  const id = await DialogV2.wait({
    window: { title },
    content: `<div class="dbu-dialog"><div class="form-group"><label>${L("DBU.God.Form")}</label><select name="id">
      ${list.map(i => `<option value="${i.id}">${i.name}</option>`).join("")}</select></div></div>`,
    buttons: [{ action: "ok", label: L("DBU.Trans.Enter"), default: true, callback: (e, b) => b.form.elements.id.value },
    { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  return ((id && (id !== "cancel")) ? actor.items.get(id) : null);
}

/** The Profile a God Strike uses (chosen once, upon gaining access to it). */
async function godStrikeProfile(item) {
  const chosen = item.getFlag(FLAG, "profile");
  if ( chosen && DBU.profiles[chosen] ) return chosen;
  const options = Object.entries(DBU.profiles).map(([k, p]) => `<option value="${k}">${p.label} — ${p.kp}(T) KP</option>`).join("");
  const key = await DialogV2.wait({
    window: { title: item.name },
    content: `<div class="dbu-dialog"><p>${L("DBU.God.StrikeProfile")}</p>
      <div class="form-group"><label>${L("DBU.Attack.Profile")}</label><select name="profile">${options}</select></div></div>`,
    buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), default: true, callback: (e, b) => b.form.elements.profile.value },
    { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  if ( !key || (key === "cancel") ) return null;
  await item.setFlag(FLAG, "profile", key);
  return key;
}

/**
 * Use a God Maneuver from the sheet: check the God Ki State and the frequency, pay its Divine Ki Points and apply what
 * the system automates (the rest goes to the chat card as a reminder).
 */
export async function useGodManeuver(actor, item) {
  const sys = actor.system;
  if ( !sys.dkp?.usable ) return ui.notifications.warn(L("DBU.Dkp.ErrState"));
  const limit = frequencyProblem(item);
  if ( limit ) return ui.notifications.warn(limit);
  const key = item.name.trim().toLowerCase();
  const T = sys.top.current;
  const bT = sys.top.base;
  const card = lines => postInfoCard({ actor, title: item.name, subtitle: "God Maneuver", img: item.img, lines });
  const fixed = dkpCost(item.system.dkpCost, sys);
  const actionsOf = Number(/^(\d+)/.exec(item.system.actionCost ?? "")?.[1] ?? 0);
  const counter = /counter/i.test(item.system.actionCost ?? "") || /counter/i.test(item.system.maneuverType ?? "");

  switch ( key ) {
    // Attacks paid in Divine Ki Points: the attack dialog takes care of the payment
    case "divine attack":
    case "god strike": {
      const strike = key === "god strike";
      const profile = strike ? await godStrikeProfile(item) : null;
      if ( strike && !profile ) return null;
      const message = await openAttackDialog(actor, { profile, divine: {
        name: item.name, forceDkp: true, category: strike ? 0 : 1, costFactor: strike ? 0.25 : 1, profile
      } });
      if ( message ) await recordUse(item);
      return message;
    }
    case "divine breathing": {
      if ( !(await payGodManeuver(actor, item, fixed ?? (5 * bT))) ) return null;
      const surgency = sys.aptitudes.surgency;
      const r = await new Roll(`${5 * bT}d10 + ${surgency}`).evaluate();
      await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${item.name} (Healing Surge, Surgency ${surgency})` });
      await actor.update({ "system.life.value": Math.min(actor.system.life.max, actor.system.life.value + r.total) });
      return card([L("DBU.God.Breathing", { n: r.total, dkp: fixed ?? (5 * bT) })]);
    }
    case "divine flame": {
      const cost = fixed ?? (2 * bT);
      if ( !(await payGodManeuver(actor, item, cost, { actions: actionsOf || 1 })) ) return null;
      await actor.gainPower(2);
      await actor.update({ "system.ki.value": Math.min(actor.system.ki.max, actor.system.ki.value + cost) });
      return card([L("DBU.God.Flame", { dkp: cost })]);
    }
    case "divine counter": {
      const cost = fixed ?? (2 * T);
      if ( !(await payGodManeuver(actor, item, cost, { counters: 1 })) ) return null;
      await card([L("DBU.God.Counter", { dkp: cost })]);
      return openAttackDialog(actor, { outOfSequence: true });
    }
    case "divine flex":
      return ui.notifications.info(L("DBU.God.FlexOnCard"));
    case "holy transformation": {
      const form = await chooseGodKiTransformation(actor, item.name);
      if ( !form ) return null;
      const cost = fixed ?? (2 * T);
      if ( !(await payGodManeuver(actor, item, cost, { actions: actionsOf || 1 })) ) return null;
      await card([L("DBU.God.Holy", { name: form.name, dkp: cost })]);
      return actor.transform(form, { free: true });
    }
    case "divine pulse": {
      const fighting = !!game.combat?.started;
      const maxActions = Math.min(2, fighting ? (sys.combat.actions ?? 0) : 2);
      if ( maxActions < 1 ) return ui.notifications.warn(L("DBU.Attack.ErrActions", { need: 1, have: 0 }));
      const n = await DialogV2.wait({
        window: { title: item.name },
        content: `<div class="dbu-dialog"><p>${L("DBU.God.PulseText", { bT })}</p>
          <div class="form-group"><label>${L("DBU.Recovery.Actions")}</label><select name="n">
          ${Array.fromRange(maxActions, 1).map(k => `<option value="${k}">${k}</option>`).join("")}</select></div></div>`,
        buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), default: true, callback: (e, b) => Number(b.form.elements.n.value) },
        { action: "cancel", label: L("Cancel") }],
        rejectClose: false
      });
      if ( !(n > 0) ) return null;
      const form = await chooseGodKiTransformation(actor, item.name);
      if ( !form ) return null;
      if ( !(await payGodManeuver(actor, item, n * bT, { actions: n })) ) return null;
      await card([L("DBU.God.Pulse", { name: form.name, n, dkp: n * bT })]);
      const result = await actor.transform(form, { stressPenalty: n });
      if ( result?.success && actor.items.get(form.id)?.system.active ) await form.setFlag(FLAG, "divinePulse", n);
      return result;
    }
    default: {
      // Divine Movement, Divine Roar, God Bind, God Finisher...: pay and remind what the maneuver does
      const hint = `DBU.God.Hint.${key.replace(/\s+/g, "_")}`;
      const reminder = game.i18n.has(hint) ? [L(hint)] : [];
      if ( fixed === null ) return card([L("DBU.God.Variable", { cost: item.system.dkpCost || "—" }), ...reminder]);
      if ( !(await payGodManeuver(actor, item, fixed, { actions: counter ? 0 : actionsOf, counters: counter ? 1 : 0 })) ) return null;
      return card([L("DBU.God.Paid", { dkp: fixed }), ...reminder]);
    }
  }
}
