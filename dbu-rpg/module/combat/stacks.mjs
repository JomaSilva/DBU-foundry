import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { allocTotal, allowedRolls, newResource, resourceSlug } from "../rules/resources.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const { DialogV2 } = foundry.applications.api;
const CHANNEL = "system.dbu-rpg";

/** Find a resource by name in a copy of the stored list, creating it when asked. */
function findResource(list, name, create) {
  const wanted = resourceSlug(name);
  let r = list.find(x => resourceSlug(x.name) === wanted);
  if ( !r && create ) {
    r = newResource(name);
    list.push(r);
  }
  return r ?? null;
}

const rollLabel = k => L(`DBU.Split.${k}`);

/** Effective maximum of a resource (modifiers "resMax.<slug>" may change the one stored on the sheet), 0 = none. */
export function resourceMaxOf(actor, r) {
  return actor.system.resourceMax?.[resourceSlug(r.name)] ?? r.max;
}

/**
 * B2: the system gained / spent stacks (`via`: what did it, "trigger", "cost"...): the resource events fire. Changes by
 * hand on the sheet pass no `via` and fire nothing; neither do the effects of a resource event's own triggers (`resEvent`).
 */
async function stacksEvent(actor, r, { before, after, wanted, via, resEvent }) {
  if ( !via || resEvent ) return;
  const slug = resourceSlug(r.name);
  const { resourceEvent } = await import("./triggers.mjs");
  if ( wanted > 0 ) await resourceEvent(actor, "gain", { slug, n: Math.max(0, after - before), wanted, via });
  else if ( after < before ) await resourceEvent(actor, "spend", { slug, n: before - after, via });
}

/** Stacks a stored resource holds (split: on every Combat Roll and still to be placed). */
const heldStacks = r => (r.split ? allocTotal(r) + (r.unassigned ?? 0) : (r.value ?? 0));

/**
 * Gain or lose stacks of a resource. New stacks of a split resource (Battle Born, Progress...) wait "to be placed" and
 * the owner of the actor is asked which Combat Roll gets each one; a forced roll ("Battle Born:wound") skips the choice.
 * `via` / `resEvent`: see stacksEvent (a gain at the maximum still fires "resourceGain", with @gained 0 and @overflow).
 * @returns {Promise<string>}  Description for the chat card
 */
export async function changeStacks(actor, name, delta, { force = "", label = "", via = "", resEvent = false } = {}) {
  if ( !delta ) return "";
  const list = foundry.utils.deepClone(actor.system._source.resources ?? []);
  const r = findResource(list, name, delta > 0);
  if ( !r ) return "";
  const max = resourceMaxOf(actor, r);
  const before = heldStacks(r);
  const event = { before, wanted: Math.max(0, delta), via, resEvent };
  if ( !r.split ) {
    const raw = r.value + delta;
    r.value = Math.max(0, max > 0 ? Math.min(max, raw) : raw);
    await actor.update({ "system.resources": list });
    await stacksEvent(actor, r, { ...event, after: r.value });
    return `${delta > 0 ? "+" : ""}${delta} ${r.name}`;
  }
  if ( delta > 0 ) {
    const owned = allocTotal(r) + r.unassigned;
    const n = (max > 0) ? Math.min(delta, Math.max(0, max - owned)) : delta;
    if ( n <= 0 ) {
      await stacksEvent(actor, r, { ...event, after: before });
      return L("DBU.Split.AtMax", { name: r.name });
    }
    const roll = force || r.force;
    if ( roll ) r.alloc[roll] += n;
    else r.unassigned += n;
    await actor.update({ "system.resources": list });
    await stacksEvent(actor, r, { ...event, after: before + n });
    if ( roll ) return `+${n} ${r.name} (${rollLabel(roll)})`;
    requestAllocation(actor, r.name, { label });
    return L("DBU.Split.Gained", { n, name: r.name });
  }
  // Losing stacks: the ones not placed yet go first, then the Combat Roll with the most stacks
  let n = -delta;
  const lost = Math.min(n, r.unassigned);
  r.unassigned -= lost;
  n -= lost;
  while ( n > 0 ) {
    const k = DBU.splitRolls.reduce((a, b) => (r.alloc[b] > r.alloc[a] ? b : a));
    if ( !(r.alloc[k] > 0) ) break;
    r.alloc[k] -= 1;
    n -= 1;
  }
  await actor.update({ "system.resources": list });
  await stacksEvent(actor, r, { ...event, after: heldStacks(r) });
  return `${delta} ${r.name}`;
}

/** Set the stacks of a resource (split resources: 0 clears every Combat Roll). */
export async function setStacks(actor, name, value, options = {}) {
  const list = foundry.utils.deepClone(actor.system._source.resources ?? []);
  const r = findResource(list, name, value > 0);
  if ( !r ) return "";
  const event = { before: heldStacks(r), via: options.via ?? "", resEvent: !!options.resEvent };
  if ( !r.split ) {
    const max = resourceMaxOf(actor, r);
    r.value = Math.max(0, max > 0 ? Math.min(max, value) : value);
    await actor.update({ "system.resources": list });
    await stacksEvent(actor, r, { ...event, after: r.value, wanted: Math.max(0, value - event.before) });
    return `${r.name} = ${r.value}`;
  }
  if ( value <= 0 ) {
    r.alloc = { strike: 0, dodge: 0, wound: 0 };
    r.unassigned = 0;
    await actor.update({ "system.resources": list });
    await stacksEvent(actor, r, { ...event, after: 0, wanted: 0 });
    return `${r.name} = 0`;
  }
  const text = await changeStacks(actor, name, value - (allocTotal(r) + r.unassigned), options);
  return text || `${r.name} = ${value}`;
}

/**
 * Ask the right person where new stacks go: a player who owns the actor and is online, otherwise whoever runs this
 * (the GM during combat automation).
 */
export function requestAllocation(actor, name, { label = "" } = {}) {
  const players = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
  if ( players.length ) {
    if ( players.some(u => u.id === game.user.id) ) return openAllocationDialog(actor, name, { label });
    game.socket.emit(CHANNEL, { action: "allocate", userId: players[0].id, data: { uuid: actor.uuid, name, label } });
    return null;
  }
  if ( actor.isOwner ) return openAllocationDialog(actor, name, { label });
  return null;
}

/** Socket: a GM asked this user to place stacks. */
export async function onAllocateRequest({ uuid, name, label }) {
  const actor = await fromUuid(uuid);
  if ( actor?.isOwner ) openAllocationDialog(actor, name, { label });
}

const OPEN = new Set();

/** One question per stack waiting to be placed, until none is left or the player chooses "later". */
export async function openAllocationDialog(actor, name, { label = "" } = {}) {
  const key = `${actor.uuid}|${resourceSlug(name)}`;
  if ( OPEN.has(key) ) return;
  OPEN.add(key);
  try {
    for ( let guard = 0; guard < 50; guard++ ) {
      const r = actor.system.resources.find(x => resourceSlug(x.name) === resourceSlug(name));
      if ( !r?.split || !(r.unassigned > 0) ) break;
      const choice = await askRoll(actor, r, label);
      if ( !choice || (choice === "later") ) break;
      if ( choice.discard ) await discardStack(actor, r.name);
      else await placeStack(actor, r.name, choice.roll, { override: choice.override });
    }
  } finally {
    OPEN.delete(key);
  }
}

function askRoll(actor, r, label) {
  const caps = r.caps;
  const fmt = k => `${r.alloc[k]}/${Number.isFinite(caps[k]) ? caps[k] : "∞"}`;
  const rows = DBU.splitRolls.map(k => `<li><strong>${rollLabel(k)}</strong>: ${fmt(k)} → +${r.perStack || "1(T)"} ${L("DBU.PerStack").toLowerCase()}</li>`).join("");
  const rules = [r.forceEff ? L("DBU.Split.Forced", { roll: rollLabel(r.forceEff) }) : "", r.lowest ? L("DBU.Split.Lowest") : ""]
    .filter(Boolean).map(t => `<p class="hint">${t}</p>`).join("");
  const content = `<div class="dbu-allocate">
    <p>${L("DBU.Split.Question", { n: r.unassigned, name: r.name })}${label ? ` <em>(${label})</em>` : ""}</p>
    <ul>${rows}</ul>${rules}
    <label class="check"><input type="checkbox" name="override"> ${L("DBU.Split.Override")}</label>
  </div>`;
  const button = k => ({
    action: k, label: `${rollLabel(k)} (${fmt(k)})`, icon: { strike: "fa-solid fa-hand-fist", dodge: "fa-solid fa-person-running", wound: "fa-solid fa-burst" }[k],
    callback: (event, btn) => ({ roll: k, override: !!btn.form?.elements.override?.checked })
  });
  return DialogV2.wait({
    window: { title: `${r.name} — ${actor.name}`, icon: "fa-solid fa-layer-group" },
    position: { width: 520 },
    content,
    buttons: [
      ...DBU.splitRolls.map(button),
      { action: "discard", label: L("DBU.Split.Discard"), icon: "fa-solid fa-trash", callback: () => ({ discard: true }) },
      { action: "later", label: L("DBU.Split.Later"), icon: "fa-solid fa-clock" }
    ],
    // Combat Rolls at their limit (or not allowed by a "lowest"/forced rule) stay disabled unless the limit is ignored
    render: (event, dialog) => {
      const input = dialog.element.querySelector("input[name=override]");
      const sync = () => {
        const override = !!input?.checked;
        const allowed = allowedRolls(r, { override });
        for ( const k of DBU.splitRolls ) {
          const b = dialog.element.querySelector(`button[data-action="${k}"]`);
          if ( b ) b.disabled = !allowed.includes(k);
        }
        const d = dialog.element.querySelector('button[data-action="discard"]');
        if ( d ) d.hidden = allowed.length > 0;
      };
      input?.addEventListener("change", sync);
      sync();
    },
    rejectClose: false
  });
}

/** Move one waiting stack onto a Combat Roll. */
export async function placeStack(actor, name, roll, { override = false } = {}) {
  const prepared = actor.system.resources.find(x => resourceSlug(x.name) === resourceSlug(name));
  if ( !prepared || !allowedRolls(prepared, { override }).includes(roll) ) {
    ui.notifications.warn(L("DBU.Split.Full", { name, roll: rollLabel(roll) }));
    return false;
  }
  const list = foundry.utils.deepClone(actor.system._source.resources ?? []);
  const r = findResource(list, name, false);
  if ( !r || !(r.unassigned > 0) ) return false;
  r.unassigned -= 1;
  r.alloc[roll] += 1;
  await actor.update({ "system.resources": list });
  await postInfoCard({ actor, title: r.name, lines: [L("DBU.Split.Placed", { name: r.name, roll: rollLabel(roll), n: r.alloc[roll] })] });
  return true;
}

async function discardStack(actor, name) {
  const list = foundry.utils.deepClone(actor.system._source.resources ?? []);
  const r = findResource(list, name, false);
  if ( !r || !(r.unassigned > 0) ) return;
  r.unassigned -= 1;
  await actor.update({ "system.resources": list });
}
