import { DBU } from "../config.mjs";
import { evaluate, test } from "../rules/formula.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { changeStacks, setStacks } from "./stacks.mjs";
import { stackChoiceCount } from "../rules/awakening.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

/** Gather the active turn/round triggers of an actor for one event. */
export function collectTriggers(actor, event) {
  const list = [];
  // A Trait possessed at all times (Legendary) runs once, even outside its Transformation or carried by two of them
  const possessed = new Set();
  for ( const item of actor.items ) {
    const s = item.system;
    if ( !s?.triggers?.length ) continue;
    const active = s.isActive ?? true;
    const ctx = (item.type === "transformation") ? s.formulaContext : {};
    for ( const t of s.triggers ) {
      // Per-Stack choices of an Awakening: an option runs once per Stack that picked it, an unpicked Trait not at all
      const count = (item.type === "transformation") ? stackChoiceCount(s, t.label) : null;
      if ( ((count === null) ? !t.active : (count === 0)) || (t.event !== event) || !(active || t.always) ) continue;
      if ( t.always ) {
        const key = [t.label, t.event, t.effect, t.value, t.condition].join("|");
        if ( possessed.has(key) ) continue;
        possessed.add(key);
      }
      // A reminder shows once however many Stacks picked it
      const times = ((t.effect === "message") || (t.mode === "remind")) ? Math.min(1, count ?? 1) : (count ?? 1);
      for ( let k = 0; k < times; k++ ) list.push({ ...t, active: true, source: item.name, ctx });
    }
  }
  for ( const t of actor.system.customTriggers ?? [] ) {
    if ( t.active && (t.event === event) ) list.push({ ...t, source: t.label || L("DBU.Custom"), ctx: {} });
  }
  return list;
}

/**
 * Run the triggers of an actor for a combat event and report them in chat.
 * @param {Actor} actor
 * @param {string} event
 * @param {{round?: number, turn?: number}} context
 */
export async function runTriggers(actor, event, { round = 0, turn = 0 } = {}) {
  if ( !actor?.system?.top ) return;
  const triggers = collectTriggers(actor, event);
  if ( !triggers.length ) return;
  const data = { ...(actor.system.rollData ?? {}), round, turn, even: (round % 2 === 0) ? 1 : 0 };
  const lines = [];
  const buttons = [];
  const pendingEffects = [];
  for ( const t of triggers ) {
    const scope = { ...data, ...t.ctx };
    if ( !test(t.condition, scope) ) continue;
    const label = t.label || t.source;
    if ( (t.effect === "message") || (t.mode === "remind") ) {
      lines.push(`${label}${t.value && (t.effect === "message") ? `: ${t.value}` : ""}`);
      continue;
    }
    const value = ["state", "condition"].includes(t.effect) && !t.value ? 1 : evaluate(t.value, scope);
    const options = { duration: t.duration ?? "none", event, label };
    if ( t.mode === "ask" ) {
      buttons.push({
        action: "applyTrigger", icon: "fa-solid fa-check", actorUuid: actor.uuid,
        label: `${label}: ${describeEffect(t.effect, value, t.resource, options.duration)}`,
        payload: JSON.stringify({ effect: t.effect, value, resource: t.resource, ...options })
      });
      continue;
    }
    pendingEffects.push({ effect: t.effect, value, resource: t.resource, label, options });
  }
  for ( const e of pendingEffects ) {
    const text = await applyTriggerEffect(actor, e.effect, e.value, e.resource, e.options);
    if ( text ) lines.push(`${e.label}: ${text}`);
  }
  if ( lines.length || buttons.length ) {
    await postInfoCard({ actor, title: L(`DBU.Trigger.Event.${event}`, { name: actor.name, round }), lines, buttons });
  }
}

/** Resolve a State or Combat Condition key from a key or an English/Portuguese name ("Surging", "God Ki", "Guard Down"). */
function statusKey(kind, name) {
  const table = kind === "state" ? DBU.states : DBU.conditions;
  const raw = String(name ?? "").trim();
  if ( raw in table ) return raw;
  const norm = s => String(s).toLowerCase().replace(/(special )?(state|combat condition)$/i, "").replace(/[^a-z0-9]/g, "");
  const wanted = norm(raw);
  for ( const key of Object.keys(table) ) {
    if ( (norm(key) === wanted) || (norm(statusLabel(kind, key)) === wanted) ) return key;
  }
  return null;
}

function statusLabel(kind, key) {
  if ( kind === "flag" ) return game.i18n.localize(`DBU.Timed.${key}`);
  return game.i18n.localize(`DBU.${kind === "state" ? "State" : "Condition"}.${key}`);
}

function describeEffect(effect, value, resource, duration = "none") {
  const sign = value >= 0 ? `+${value}` : `${value}`;
  const until = (duration && duration !== "none") ? ` (${L(`DBU.Trigger.Duration.${duration}`)})` : "";
  switch ( effect ) {
    case "life": return `${sign} LP`;
    case "ki": return `${sign} KP`;
    case "capacity": return `${sign} ${L("DBU.Capacity")}`;
    case "counters": return `${sign} Counter`;
    case "actions": return `${sign} ${L("DBU.Actions")}`;
    case "resource": return `${sign} ${resource}`;
    case "resourceSet": return `${resource} = ${value}`;
    case "state": {
      const key = statusKey("state", resource);
      return `${key ? statusLabel("state", key) : resource}${value > 1 ? ` ${value}` : ""}${until}`;
    }
    case "condition": {
      const key = statusKey("condition", resource);
      return `${key ? statusLabel("condition", key) : resource}${value > 1 ? ` ×${value}` : ""}${until}`;
    }
    default: return "";
  }
}

/**
 * Apply one trigger effect to an actor. Returns a description, or "" when nothing changed.
 * States and Combat Conditions can be timed: they are reverted by {@link expireTimed} when their duration ends.
 */
export async function applyTriggerEffect(actor, effect, value, resource = "", { duration = "none", event = "", label = "" } = {}) {
  const sys = actor.system;
  const updates = {};
  switch ( effect ) {
    case "life": {
      const next = Math.min(sys.life.max, sys.life.value + value);
      if ( next === sys.life.value ) return "";
      updates["system.life.value"] = (sys._effectiveStates?.undying > 0) ? next : Math.max(0, next);
      break;
    }
    case "ki": {
      const next = Math.clamp(sys.ki.value + value, 0, sys.ki.max);
      if ( next === sys.ki.value ) return "";
      updates["system.ki.value"] = next;
      break;
    }
    case "capacity": {
      const next = Math.clamp(sys.capacity.value + value, 0, sys.capacity.max);
      if ( next === sys.capacity.value ) return "";
      updates["system.capacity.value"] = next;
      break;
    }
    case "counters": updates["system.combat.counters"] = Math.clamp((sys.combat.counters ?? 0) + value, 0, 6); break;
    case "actions": updates["system.combat.actions"] = Math.max(0, (sys.combat.actions ?? 0) + value); break;
    // Stacks: split resources (Battle Born...) ask the owner which Combat Roll gets each new stack;
    // "Battle Born:wound" applies them to that Combat Roll directly
    case "resource": {
      const [name, roll = ""] = String(resource || "Resource").split(":").map(s => s.trim());
      return changeStacks(actor, name, value, { force: DBU.splitRolls.includes(roll) ? roll : "", label });
    }
    case "resourceSet": return setStacks(actor, String(resource || "Resource").split(":")[0].trim(), value, { label });
    case "state":
    case "condition": {
      const key = statusKey(effect, resource);
      if ( !key ) return `${resource}?`;
      const field = effect === "state" ? "states" : "conditions";
      const prev = sys._source[field]?.[key] ?? 0;
      const level = Math.max(prev, Math.max(1, Math.round(value) || 1));
      if ( level !== prev ) {
        if ( effect === "state" ) await actor.setState(key, level);
        else await actor.setCondition(key, level);
      }
      if ( duration && (duration !== "none") ) await addTimed(actor, { kind: effect, key, prev, level, duration, event, label });
      return describeEffect(effect, level, key, duration);
    }
    default: return "";
  }
  await actor.update(updates);
  return describeEffect(effect, value, resource);
}

/* -------------------------------------------- */
/*  Timed States, Combat Conditions and Power   */
/* -------------------------------------------- */

/** The combat event at which each duration is checked. */
const EXPIRES_AT = { endOfTurn: "endOfTurn", endOfNextTurn: "endOfTurn", startOfNextTurn: "startOfTurn", endOfRound: "endOfRound" };

/** Is it this actor's turn in the running combat? */
function isActorsTurn(actor) {
  return !!game.combat?.started && (game.combat.combatant?.actor?.uuid === actor.uuid);
}

/** Is this actor taking part in a running combat? */
export function inCombat(actor) {
  return !!game.combat?.started && game.combat.combatants.some(c => c.actor?.uuid === actor.uuid);
}

/** The started Combat Encounter the actor takes part in (not only the one the tracker shows), or null. */
export function encounterOf(actor) {
  return game.combats?.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor?.uuid)) ?? null;
}

async function addTimed(actor, { kind, key, prev, level, duration, event, label, rounds = 0, source = null, skip: forced = null }) {
  const list = foundry.utils.deepClone(actor.getFlag("dbu-rpg", "timed") ?? []);
  const existing = list.find(e => (e.kind === kind) && (e.key === key));
  // "Until the end of your next turn" started during your own turn skips the end of the current turn
  const ownTurn = event ? (event === "startOfTurn") : isActorsTurn(actor);
  let skip = ((duration === "endOfNextTurn") && ownTurn) ? 1 : 0;
  // "For N Combat Rounds": the current round counts as the first one
  if ( (duration === "endOfRound") && (rounds > 1) ) skip = rounds - 1;
  if ( forced !== null ) skip = forced;
  // "endOfSourceTurn": ends with the turn of another character (the one whose effect caused it)
  const entry = { level, duration, skip, label, ...(source ? { source } : {}) };
  if ( existing ) Object.assign(existing, entry);
  else list.push({ kind, key, prev, ...entry });
  await actor.setFlag("dbu-rpg", "timed", list);
}

/**
 * A Combat Condition that lasts for a while (Stress Exhaustion: until the end of your next turn).
 * Outside of combat nothing ends it automatically. duration "endOfSourceTurn" ends it at the end of the turn of the
 * character with the uuid `source` (skip: how many of those turn ends it outlasts first).
 */
export async function addTimedCondition(actor, key, prev = 0, level = 1, duration = "endOfNextTurn", label = "",
  { rounds = 0, source = null, skip = null } = {}) {
  if ( !inCombat(actor) && !encounterOf(actor) ) return;
  await addTimed(actor, { kind: "condition", key, prev, level, duration, event: "", label, rounds, source, skip });
}

/**
 * A modifier that lasts a while (Stretch: +1(T) Combat Rolls for the first 3 Combat Rounds; Soar: until the start of
 * your next turn): it goes into the sheet's custom modifiers under its label and is taken out when it ends.
 */
export async function addTimedModifier(actor, modifier, { rounds = 1, duration = "endOfRound" } = {}) {
  const list = foundry.utils.deepClone(actor.system._source.customModifiers ?? []).filter(m => m.label !== modifier.label);
  list.push(modifier);
  await actor.update({ "system.customModifiers": list });
  await addTimed(actor, { kind: "modifier", key: modifier.label, prev: 0, level: 0, duration, event: "",
    label: modifier.label, rounds });
}

/** A system flag of the actor (dbu-rpg.<key> = true) that ends with a duration, like a timed Condition. */
export async function addTimedFlag(actor, key, { duration = "startOfNextTurn", label = "" } = {}) {
  await actor.setFlag("dbu-rpg", key, true);
  await addTimed(actor, { kind: "flag", key, prev: 0, level: 1, duration, event: "", label });
}

async function removeTimedModifier(actor, label) {
  const list = actor.system._source.customModifiers ?? [];
  if ( !list.some(m => m.label === label) ) return false;
  await actor.update({ "system.customModifiers": list.filter(m => m.label !== label) });
  return true;
}

/** Power Up: each stack of Power lasts until the end of your next turn. */
function powerEntry(actor) {
  return { kind: "power", key: "power", count: 1, duration: "endOfNextTurn", skip: isActorsTurn(actor) ? 1 : 0,
    label: "Power", round: game.combat?.round ?? 0 };
}

export async function addTimedPower(actor, n = 1) {
  const list = foundry.utils.deepClone(actor.getFlag("dbu-rpg", "timed") ?? []);
  for ( let i = 0; i < n; i++ ) list.push(powerEntry(actor));
  await actor.setFlag("dbu-rpg", "timed", list);
}

/** Power Up at the limit: a stack of Power is removed and gained again, so the oldest one gets a new duration. */
export async function renewTimedPower(actor) {
  const list = foundry.utils.deepClone(actor.getFlag("dbu-rpg", "timed") ?? []);
  const i = list.findIndex(e => e.kind === "power");
  if ( i >= 0 ) list.splice(i, 1);
  list.push(powerEntry(actor));
  await actor.setFlag("dbu-rpg", "timed", list);
}

/** Stacks of Power removed by hand: forget the newest timers. */
export async function dropTimedPower(actor, n = 1) {
  const list = foundry.utils.deepClone(actor.getFlag("dbu-rpg", "timed") ?? []);
  for ( let k = 0; k < n; k++ ) {
    const i = list.findLastIndex(e => e.kind === "power");
    if ( i < 0 ) break;
    list.splice(i, 1);
  }
  await actor.setFlag("dbu-rpg", "timed", list);
}

/** Timers of the Power stacks, oldest first (for the sheet). */
export function powerTimers(actor) {
  return (actor.getFlag("dbu-rpg", "timed") ?? []).filter(e => e.kind === "power");
}

async function revert(actor, entry) {
  // A system flag that lasts a while (Arrogant and Unstoppable: treated as Healthy)
  if ( entry.kind === "flag" ) {
    if ( actor.getFlag("dbu-rpg", entry.key) === undefined ) return false;
    await actor.unsetFlag("dbu-rpg", entry.key);
    return true;
  }
  const field = entry.kind === "state" ? "states" : "conditions";
  const current = actor.system._source[field]?.[entry.key] ?? 0;
  // Something else changed it in the meantime: leave it alone
  if ( current !== entry.level ) return false;
  if ( entry.kind === "state" ) await actor.setState(entry.key, entry.prev);
  else await actor.setCondition(entry.key, entry.prev);
  return true;
}

/**
 * End the timed States/Conditions and Power stacks of an actor whose duration is over at this combat event.
 * Runs before the triggers of the same event, so an effect renewed by them is not ended by mistake.
 * With `source`, only the effects that end with that character's turn ("endOfSourceTurn").
 */
export async function expireTimed(actor, event, { source = null } = {}) {
  const list = foundry.utils.deepClone(actor?.getFlag("dbu-rpg", "timed") ?? []);
  if ( !list.length ) return;
  const keep = [];
  const lines = [];
  let powerLost = 0;
  let due = 0;
  for ( const entry of list ) {
    const ends = source ? ((event === "endOfTurn") && (entry.duration === "endOfSourceTurn") && (entry.source === source))
      : (EXPIRES_AT[entry.duration] === event);
    if ( !ends ) { keep.push(entry); continue; }
    due += 1;
    if ( entry.skip > 0 ) { entry.skip -= 1; keep.push(entry); continue; }
    if ( entry.kind === "power" ) { powerLost += entry.count ?? 1; continue; }
    if ( entry.kind === "modifier" ) {
      if ( await removeTimedModifier(actor, entry.key) ) lines.push(L("DBU.Trigger.ExpiredModifier", { label: entry.label }));
      continue;
    }
    if ( await revert(actor, entry) ) lines.push(L("DBU.Trigger.Expired", { label: entry.label || "", what: statusLabel(entry.kind, entry.key) }));
  }
  if ( !due ) return;
  await actor.setFlag("dbu-rpg", "timed", keep);
  if ( powerLost > 0 ) {
    const before = actor.system.combat.power ?? 0;
    const after = Math.max(0, before - powerLost);
    if ( after !== before ) {
      await actor.update({ "system.combat.power": after });
      // A lower Max Capacity also lowers the current Capacity
      if ( actor.system.capacity.value > actor.system.capacity.max ) await actor.update({ "system.capacity.value": actor.system.capacity.max });
      lines.push(L("DBU.Power.Expired", { n: before - after, left: after }));
    }
  }
  if ( lines.length ) await postInfoCard({ actor, title: L("DBU.Trigger.ExpiredTitle", { name: actor.name }), lines });
}

/** End every timed effect (end of the Combat Encounter; Power is reset with the encounter). */
export async function clearTimed(actor) {
  const list = actor?.getFlag("dbu-rpg", "timed") ?? [];
  if ( !list.length ) return;
  for ( const entry of list ) {
    if ( entry.kind === "modifier" ) await removeTimedModifier(actor, entry.key);
    else if ( entry.kind !== "power" ) await revert(actor, entry);
  }
  await actor.unsetFlag("dbu-rpg", "timed");
}
