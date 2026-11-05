/**
 * Awakening Stacks in play: gaining and losing Stacks (with what each Stack picks, and the items those picks add),
 * Temporary Stacks at the end of the Combat Encounter, and the effects that give or take Stacks on their own
 * (Born for Battle gives Zenkai; a Defeated character loses every stack of Absorption).
 */
import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { FUSION_AWAKENING_LIMITS } from "../fusion/fusion-rules.mjs";
import { rules } from "../optional-rules.mjs";
import {
  awakeningCounts, awakeningSlug, stackChoiceCount, stackGroups, stackTopReq, traitsBetween, trimToStacks, zEffects
} from "../rules/awakening.mjs";
import { evaluate, test } from "../rules/formula.mjs";
import { parseTrait } from "../rules/traits.mjs";
import { safeUpdate } from "../socket.mjs";
import { applyTriggerEffect, encounterOf } from "./triggers.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const INFO_CARD = "systems/dbu-rpg/templates/chat/info-card.hbs";
const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);

const isAwakening = item => (item?.type === "transformation") && (item.system.transType === "awakening");

/** The Awakening of this name on the actor (several items of the same name: the first one). */
export function awakeningNamed(actor, name) {
  const key = awakeningSlug(name);
  return actor?.items.find(i => isAwakening(i) && (awakeningSlug(i.name) === key)) ?? null;
}

/* -------------------------------------------- */
/*  Gaining and losing Stacks                   */
/* -------------------------------------------- */

/**
 * Gain a Stack of an Awakening, up to its Maximum No of Stacks.
 * @param {Actor} actor
 * @param {Item} item                     The Awakening, on the actor
 * @param {object} [options]
 * @param {number} [options.temp=0]       1 / 2: the Stack is a Level 1 / Level 2 Temporary Awakening
 * @param {boolean} [options.free=false]  It neither counts towards the Awakening Limit nor gives the Attribute Modifier Bonus
 * @param {string} [options.note=""]      What the Stack holds (the Absorbed Character of a stack of Absorption)
 * @param {string} [options.source=""]    What gave it, for the chat card
 * @param {boolean} [options.ask=true]    Ask now for what this Stack picks (otherwise the sheet keeps it pending)
 * @returns {Promise<boolean>}
 */
export async function gainStack(actor, item, { temp = 0, free = false, note = "", source = "", ask = true } = {}) {
  if ( !isAwakening(item) ) return false;
  const s = item.system;
  if ( s.stacks >= s.maxStacks ) {
    ui.notifications.warn(L("DBU.Stack.AtMax", { name: item.name, max: s.maxStacks }));
    return false;
  }
  // What the Stack holds (the Absorbed Character of a stack of Absorption), asked when the Awakening says so
  if ( !note && ask && s.stackNote ) note = await askStackNote(actor, item);
  const src = item._source.system;
  const before = s.stacks;
  const tempsBefore = Math.min(before, src.tempStacks?.length ?? 0);
  const update = { "system.stacks": before + 1 };
  if ( temp ) update["system.tempStacks"] = [...(src.tempStacks ?? []), { level: temp, combat: encounterOf(actor)?.id ?? "" }];
  if ( free ) update["system.freeStacks"] = (src.freeStacks ?? 0) + 1;
  if ( note || src.stackNotes?.length ) {
    const notes = [...(src.stackNotes ?? [])];
    while ( notes.length < before ) notes.push("");
    notes[before] = note;
    update["system.stackNotes"] = notes;
  }
  await item.update(update);
  const fresh = actor.items.get(item.id) ?? item;
  await stackCard(actor, fresh, before, before + 1, { temp, free, source, note });
  if ( ask && fresh.system.pendingChoices?.length ) {
    const { chooseTransformationOptions } = await import("./choices.mjs");
    await chooseTransformationOptions(actor, fresh, { required: false });
  }
  // A permanent Stack goes below the Temporary ones: those are the newest, the ones the end of the encounter takes away
  if ( !temp && tempsBefore ) await sinkNewStack(actor, item.id, tempsBefore);
  return true;
}

/** Move the newest Stack's picks and note below the `temps` Temporary Stacks (once it has made all its picks). */
async function sinkNewStack(actor, itemId, temps) {
  const item = actor.items.get(itemId);
  if ( !item ) return;
  const src = foundry.utils.deepClone(item._source.system);
  const n = src.stacks ?? 0;
  const at = n - 1 - temps;
  if ( at < 0 ) return;
  let changed = false;
  const choices = (src.choices ?? []).map(c => {
    if ( !c.perStack ) return c;
    const groups = stackGroups(c);
    if ( (groups.length !== n) || ((groups.at(-1)?.length ?? 0) < Math.max(1, c.pick ?? 1)) ) return c;
    groups.splice(at, 0, groups.pop());
    changed = true;
    return { ...c, selected: groups.flat() };
  });
  const notes = [...(src.stackNotes ?? [])];
  if ( notes.length === n ) {
    notes.splice(at, 0, notes.pop());
    changed = true;
  }
  if ( changed ) await item.update({ "system.choices": choices, "system.stackNotes": notes });
}

/** The name of what a new Stack holds ("Absorbed Character"), with the world's characters to pick from. */
export async function askStackNote(actor, item) {
  const names = [...new Set(game.actors.filter(a => (a.id !== actor.id) && a.system?.top).map(a => a.name))].sort();
  const list = names.map(n => `<option value="${foundry.utils.escapeHTML(n)}"></option>`).join("");
  const content = `<div class="dbu-dialog">
    <p>${L("DBU.Stack.NoteQuestion", { what: item.system.stackNote, name: item.name })}</p>
    <input type="text" name="note" list="dbu-stack-note-list" autocomplete="off">
    <datalist id="dbu-stack-note-list">${list}</datalist>
  </div>`;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${item.name}: ${item.system.stackNote}`, icon: "fa-solid fa-user-plus" },
    content,
    buttons: [
      { action: "ok", label: L("DBU.Choice.Confirm"), icon: "fa-solid fa-check", default: true,
        callback: (event, button) => ({ note: String(button.form.elements.note?.value ?? "").trim() }) },
      { action: "skip", label: L("DBU.Stack.NoteSkip"), icon: "fa-solid fa-forward" }
    ],
    rejectClose: false
  });
  return result?.note ?? "";
}

/** Which Temporary Awakening level a Stack gained by hand is (Shift+click on the sheet): 1, 2, or null (cancelled). */
export async function askTempLevel(item) {
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: L("DBU.Stack.TempTitle", { name: item.name }), icon: "fa-solid fa-hourglass-half" },
    content: `<p>${L("DBU.Stack.TempQuestion")}</p>`,
    buttons: [
      { action: "1", label: L("DBU.Stack.TempLevel1"), icon: "fa-solid fa-hourglass-half", default: true },
      { action: "2", label: L("DBU.Stack.TempLevel2"), icon: "fa-solid fa-hourglass-end" }
    ],
    rejectClose: false
  });
  return ["1", "2"].includes(choice) ? Number(choice) : null;
}

/**
 * Lose Stacks of an Awakening: the newest ones (Temporary Stacks first), with what they picked and the items they added.
 * @param {Actor} actor
 * @param {Item} item
 * @param {object} [options]
 * @param {number} [options.n=1]             How many
 * @param {number[]} [options.positions]     Exactly which Stacks (0 = the oldest) instead of the newest ones
 * @param {string} [options.reason=""]       Why, for the chat card
 * @param {boolean} [options.removeEmpty=false]  Delete the Awakening when no Stack is left
 * @param {boolean} [options.silent=false]   No chat card
 * @returns {Promise<boolean>}
 */
export async function loseStack(actor, item, { n = 1, positions = null, reason = "", removeEmpty = false, silent = false } = {}) {
  if ( !isAwakening(item) ) return false;
  const src = foundry.utils.deepClone(item._source.system);
  const before = src.stacks ?? 0;
  const lost = positions ? positions.filter(p => (p >= 0) && (p < before)) : null;
  const count = lost ? new Set(lost).size : Math.min(n, before);
  if ( count <= 0 ) return false;
  const trimmed = lost ? removeStacksAt(src, lost) : trimToStacks(src, before - count);
  const after = before - count;
  // The items the lost picks added go with them
  const granted = [];
  for ( const d of trimmed.dropped ) {
    if ( !d.choice.pack ) continue;
    for ( const option of d.options ) {
      const doc = actor.items.find(i => (i.flags?.["dbu-rpg"]?.grantedBy?.item === item.id)
        && (i.flags["dbu-rpg"].grantedBy.choice === d.choice.id) && (i.flags["dbu-rpg"].grantedBy.option === option)
        && !granted.includes(i.id));
      if ( doc ) granted.push(doc.id);
    }
  }
  if ( (after === 0) && removeEmpty ) {
    const others = actor.items.filter(i => i.flags?.["dbu-rpg"]?.grantedBy?.item === item.id).map(i => i.id);
    await actor.deleteEmbeddedDocuments("Item", [...new Set([...granted, ...others, item.id])]);
  }
  else {
    await item.update({
      "system.stacks": after, "system.choices": trimmed.choices, "system.stackNotes": trimmed.stackNotes,
      "system.tempStacks": trimmed.tempStacks, "system.freeStacks": trimmed.freeStacks
    });
    if ( granted.length ) await actor.deleteEmbeddedDocuments("Item", granted);
  }
  if ( !silent ) {
    const notes = (lost ?? Array.from({ length: count }, (_, k) => before - 1 - k)).map(p => src.stackNotes?.[p]).filter(Boolean);
    await stackCard(actor, actor.items.get(item.id) ?? item, before, after, { reason, freed: notes, removed: (after === 0) && removeEmpty });
  }
  return true;
}

/**
 * Remove exactly these Stacks (0 = the oldest): their picks of every per-Stack choice, their notes, and their place
 * among the Temporary Stacks (the newest Stacks).
 */
export function removeStacksAt(s, positions) {
  const drop = new Set(positions);
  const stacks = s.stacks ?? 0;
  const dropped = [];
  const choices = (s.choices ?? []).map(c => {
    if ( !c.perStack ) return c;
    const groups = stackGroups(c);
    const gone = groups.filter((g, k) => drop.has(k)).flat();
    if ( !gone.length ) return c;
    dropped.push({ choice: c, options: gone });
    return { ...c, selected: groups.filter((g, k) => !drop.has(k)).flat() };
  });
  const temp = s.tempStacks ?? [];
  const first = stacks - temp.length;
  const tempStacks = temp.filter((t, k) => !drop.has(first + k));
  const stackNotes = (s.stackNotes ?? []).filter((t, k) => !drop.has(k));
  const left = stacks - [...drop].filter(p => p < stacks).length;
  return { choices, stackNotes, tempStacks, freeStacks: Math.min(s.freeStacks ?? 0, left), dropped };
}

/** Chat card of a Stack change: Attribute Modifier Bonus, Traits that start or stop working, effects that grow with Z. */
async function stackCard(actor, item, before, after, { temp = 0, free = false, source = "", note = "", reason = "", freed = [],
  removed = false } = {}) {
  const s = item.system;
  const lines = [];
  const gained = after > before;
  if ( source ) lines.push(L("DBU.Stack.Source", { source }));
  if ( reason ) lines.push(reason);
  if ( note ) lines.push(L("DBU.Stack.Note", { note }));
  if ( temp ) lines.push(L(`DBU.Stack.Temp${temp}`));
  if ( free ) lines.push(L("DBU.Stack.Free"));
  if ( freed.length ) lines.push(L("DBU.Stack.Freed", { names: freed.join(", ") }));
  if ( removed ) lines.push(L("DBU.Stack.Removed", { name: item.name }));
  else {
    // Attribute Modifier Bonus of this Awakening now (every Stack, with what the Stacks picked)
    const amb = DBU.ATTRIBUTES.map(a => {
      const v = (actor.system.attributes?.[a]?.modParts ?? []).filter(p => p.label === item.name).reduce((t, p) => t + (p.value ?? 0), 0);
      return v ? `${DBU.attributeAbbr[a]} ${v > 0 ? "+" : ""}${v}` : "";
    }).filter(Boolean);
    if ( amb.length ) lines.push(L("DBU.Stack.Bonus", { list: amb.join(" · ") }));
    const changed = traitsBetween(s, before, after);
    if ( changed.length ) lines.push(L(gained ? "DBU.Stack.TraitsOn" : "DBU.Stack.TraitsOff", { list: changed.join(", ") }));
    const z = zEffects(s);
    if ( z.length && after ) lines.push(L("DBU.Stack.ZEffects", { z: after, list: z.join(", ") }));
    // Points every Stack gives (Character Perks, Attribute Points, Technique Points), already on the Progression tab
    const points = progressionDelta(actor, s, before, after);
    if ( points.length ) lines.push(L(gained ? "DBU.Stack.PointsGained" : "DBU.Stack.PointsLost", { list: points.join(" · ") }));
    // "Upon gaining a stack of this Awakening..." reminders
    if ( gained ) {
      const reminders = (s.triggers ?? []).filter(t => (t.event === "stackGain") && t.active !== false
        && (stackChoiceCount(s, t.label) !== 0)).map(t => t.value ? `${t.label}: ${t.value}` : t.label);
      for ( const r of new Set(reminders) ) lines.push(L("DBU.Stack.Reminder", { text: r }));
    }
    // Rules the ARC watches: the Awakening Limit (permanent Stacks) and a Stack's own Tier of Power Requirement
    if ( gained && !temp && !free && !actor.isBoss ) {
      const req = stackTopReq(s, after);
      if ( req > (actor.system.top?.base ?? 1) ) lines.push(L("DBU.Stack.TopWarn", { n: after, req }));
      const over = limitProblem(actor, s.subtype);
      if ( over ) lines.push(over);
    }
  }
  return postInfoCard({
    actor, img: item.img, title: L("DBU.Stack.Title", { name: item.name, n: after, max: s.maxStacks }),
    subtitle: L(gained ? "DBU.Stack.Gained" : "DBU.Stack.Lost"), lines
  });
}

const POINT_TARGETS = { perks: "DBU.Target.perks", attributePoints: "DBU.Target.attributePoints", tp: "DBU.Target.tp" };

/** What the Stacks between `before` and `after` change in the points of the Progression tab ("+1 Character Perks"). */
function progressionDelta(actor, s, before, after) {
  const out = [];
  const base = { ...(actor.system.rollData ?? {}), ...s.formulaContext };
  for ( const [target, label] of Object.entries(POINT_TARGETS) ) {
    let delta = 0;
    for ( const m of s.modifiers ?? [] ) {
      if ( (m.target !== target) || (m.active === false) || (stackChoiceCount(s, m.label) === 0) ) continue;
      const at = n => (test(m.condition, { ...base, Z: n }) ? evaluate(m.value, { ...base, Z: n }) : 0);
      delta += at(after) - at(before);
    }
    if ( delta ) out.push(`${delta > 0 ? "+" : ""}${delta} ${L(label)}`);
  }
  return out;
}

/** "Passes the Lesser Awakening Limit (4/3)" for the type of the Awakening that just gained a Stack, or "". */
function limitProblem(actor, subtype) {
  const R = rules();
  // Awakening Points (Variant Rule) and Without Limits have their own checks on the sheet
  if ( !["lesser", "greater"].includes(subtype) || R.awakeningPoints || R.withoutLimit ) return "";
  const counts = awakeningCounts(actor.items.filter(i => i.type === "transformation"),
    { skip: t => R.limitBreaking && t.system.ignoreLimit });
  const bT = actor.system.top?.base ?? 1;
  const table = (actor.type === "fusion") ? FUSION_AWAKENING_LIMITS : DBU.AWAKENING_LIMITS;
  const limits = table[bT] ?? table[7];
  return counts[subtype] > limits[subtype]
    ? L("DBU.Stack.LimitWarn", { type: L(DBU.awakeningTypes[subtype]), n: counts[subtype], max: limits[subtype] }) : "";
}

/* -------------------------------------------- */
/*  Temporary Stacks at the end of the encounter */
/* -------------------------------------------- */

/**
 * End of a Combat Encounter: Level 2 Temporary Stacks are removed; for Level 1 ones (and Temporary Awakenings marked on
 * the whole item) the GM decides with the card's buttons whether the character keeps them.
 */
export async function endEncounterStacks(actor) {
  for ( const item of actor.items.filter(isAwakening) ) {
    const s = item.system;
    const temp = s.tempStacks ?? [];
    if ( temp.length ) {
      const first = s.stacks - temp.length;
      const level2 = temp.map((t, k) => (t.level === 2 ? first + k : -1)).filter(p => p >= 0);
      if ( level2.length ) {
        await loseStack(actor, item, { positions: level2, removeEmpty: s.stacks === level2.length,
          reason: L("DBU.Stack.EndLevel2", { n: level2.length }) });
      }
      const current = actor.items.get(item.id);
      const level1 = current?.system.tempStacks?.length ?? 0;
      if ( level1 ) await askKeep(actor, current, level1);
    }
    else if ( s.temporary ) await askKeep(actor, item, s.stacks, { whole: true });
  }
}

async function askKeep(actor, item, n, { whole = false } = {}) {
  const data = { actorUuid: actor.uuid, itemUuid: item.uuid, item: item.name, img: item.img, actor: actor.name, n, whole, state: null };
  return ChatMessage.create({
    author: game.user.id, speaker: ChatMessage.getSpeaker({ actor }), whisper: gmIds(),
    content: await renderKeepCard(data), flags: { "dbu-rpg": { awakTemp: data } }
  });
}

function renderKeepCard(d) {
  const lines = [L(d.whole ? "DBU.Stack.KeepWhole" : "DBU.Stack.KeepAsk", { actor: d.actor, item: d.item, n: d.n })];
  if ( d.state ) lines.push(L(`DBU.Stack.Keep.${d.state}`, { item: d.item }));
  const buttons = d.state ? [] : [
    { action: "awakKeep", label: L("DBU.Stack.KeepButton"), icon: "fa-solid fa-check" },
    { action: "awakDrop", label: L("DBU.Stack.DropButton"), icon: "fa-solid fa-xmark" }
  ];
  return foundry.applications.handlebars.renderTemplate(INFO_CARD, {
    title: L("DBU.Stack.KeepTitle", { item: d.item }), subtitle: L("DBU.Stack.TempSub"), img: d.img, lines, buttons
  });
}

/** GM's answer on the end-of-encounter card: the Level 1 Temporary Stacks become permanent, or go. */
export async function resolveKeep(message, keep) {
  if ( !game.user.isGM ) return false;
  const d = foundry.utils.deepClone(message.getFlag("dbu-rpg", "awakTemp") ?? {});
  if ( d.state ) return false;
  const actor = await fromUuid(d.actorUuid);
  const item = await fromUuid(d.itemUuid);
  if ( !actor || !item ) d.state = "gone";
  else if ( keep ) {
    if ( d.whole ) await item.update({ "system.temporary": false });
    else await item.update({ "system.tempStacks": [] });
    d.state = "kept";
    const over = limitProblem(actor, item.system.subtype);
    if ( over ) await postInfoCard({ actor, img: item.img, title: item.name, lines: [over] });
  }
  else {
    const s = item.system;
    if ( d.whole ) await loseStack(actor, item, { n: s.stacks, removeEmpty: true, reason: L("DBU.Stack.EndLevel1") });
    else {
      const first = s.stacks - (s.tempStacks?.length ?? 0);
      const positions = (s.tempStacks ?? []).map((t, k) => first + k);
      await loseStack(actor, item, { positions, removeEmpty: positions.length === s.stacks, reason: L("DBU.Stack.EndLevel1") });
    }
    d.state = "dropped";
  }
  await safeUpdate(message, { content: await renderKeepCard(d), "flags.dbu-rpg.awakTemp": d });
  return true;
}

/* -------------------------------------------- */
/*  Effects that give or take Stacks            */
/* -------------------------------------------- */

/** An Awakening from the compendium, by name (the first match). */
async function compendiumAwakening(name) {
  const pack = game.packs.get("dbu-rpg.transformations");
  if ( !pack ) return null;
  const index = await pack.getIndex({ fields: ["system.transType"] });
  const key = awakeningSlug(name);
  const entry = index.find(e => (awakeningSlug(e.name) === key) && (e.system?.transType === "awakening"));
  return entry ? pack.getDocument(entry._id) : null;
}

/**
 * Gain a Stack of an Awakening by name: a Stack more of the one the character has, or the Awakening itself from the
 * compendium (with that one Stack).
 * @returns {Promise<Item|null>}  The Awakening, or null when nothing was gained
 */
export async function gainAwakening(actor, name, options = {}) {
  const have = awakeningNamed(actor, name);
  if ( have ) return (await gainStack(actor, have, options)) ? actor.items.get(have.id) : null;
  const doc = await compendiumAwakening(name);
  if ( !doc ) {
    ui.notifications.warn(L("DBU.Stack.NotFound", { name }));
    return null;
  }
  const data = doc.toObject();
  delete data._id;
  data.system.stacks = 1;
  data.system.tempStacks = options.temp ? [{ level: options.temp, combat: encounterOf(actor)?.id ?? "" }] : [];
  data.system.freeStacks = options.free ? 1 : 0;
  data.system.stackNotes = options.note ? [options.note] : [];
  // Temporary Awakenings never give a New Level of Power
  if ( options.temp ) data.system.everEntered = true;
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  if ( item ) await stackCard(actor, item, 0, 1, options);
  return item ?? null;
}

/**
 * Born for Battle (Saiyan, 4th effect) [Triggered, 1/Encounter]: knocked through the Critical Health Threshold → a stack
 * of Zenkai as a Level 1 Temporary Awakening. With On the Brink (Zenkai, 3 Stacks) the Saiyan enters the Surging State
 * until the end of their next turn instead.
 * @returns {Promise<boolean>} true when it triggered
 */
export async function bornForBattle(actor) {
  const combat = encounterOf(actor);
  if ( !combat ) return false;
  const trait = actor.items.find(i => (i.type === "racialTrait") && (i.system.active !== false) && /^born for battle\b/i.test(i.name));
  if ( !trait || (actor.getFlag("dbu-rpg", "bornForBattle") === combat.id) ) return false;
  await actor.setFlag("dbu-rpg", "bornForBattle", combat.id);
  const zenkai = awakeningNamed(actor, "Zenkai");
  const brink = zenkai && (zenkai.system.stacks >= 3)
    && (zenkai.system.traits ?? []).map(parseTrait).some(t => /^on the brink/i.test(t.name) && (zenkai.system.stacks >= (t.level || 1)));
  if ( brink ) {
    const text = await applyTriggerEffect(actor, "state", 1, "surging", { duration: "endOfNextTurn", label: "On the Brink" });
    await postInfoCard({ actor, img: zenkai.img, title: "Born for Battle — On the Brink", lines: [L("DBU.Stack.Brink"), text].filter(Boolean) });
    return true;
  }
  if ( zenkai && (zenkai.system.stacks >= zenkai.system.maxStacks) ) return false;
  const item = await gainAwakening(actor, "Zenkai", { temp: 1, source: "Born for Battle", ask: false });
  return !!item;
}

/** Absorption (6th effect of Assimilated Power) [Automatic/Start of Turn]: a Defeated character loses every stack. */
export async function defeatedLosesStacks(actor) {
  const sys = actor.system;
  const defeated = (sys.life.value <= 0) && !((sys._effectiveStates?.undying ?? 0) > 0);
  if ( !defeated ) return;
  const absorption = awakeningNamed(actor, "Absorption");
  if ( !absorption || !(absorption.system.stacks > 0) ) return;
  await loseStack(actor, absorption, { n: absorption.system.stacks, reason: L("DBU.Stack.AbsorptionDefeated") });
}
