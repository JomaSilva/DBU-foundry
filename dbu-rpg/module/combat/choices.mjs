import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { blockedOptions, stackGroups } from "../rules/awakening.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const { DialogV2 } = foundry.applications.api;

/** Label the compendium gives the modifiers/triggers of an option: "S-Cells — opção: Super Surger". */
const optionLabel = (trait, option) => `${trait} — opção: ${option}`;

/** A modifier condition in words ("@power >= 2" → "com 2+ Power"). */
function conditionText(condition) {
  return String(condition ?? "").split("&&").map(c => c.trim()).filter(Boolean).map(c => {
    let m = /^@power\s*>=\s*(\d+)$/.exec(c);
    if ( m ) return L("DBU.Choice.Cond.power", { n: m[1] });
    m = /^@res\.battleborn_(strike|dodge|wound)\s*>=\s*(\d+)$/.exec(c);
    if ( m ) return L("DBU.Choice.Cond.battleBorn", { n: m[2], roll: L(`DBU.Split.${m[1]}`) });
    m = /^@below\s*>=\s*(\d)$/.exec(c);
    if ( m ) return L(`DBU.Choice.Cond.below${m[1]}`);
    return c;
  }).join(", ");
}

/** Short description of what an option does, from its compiled modifiers and triggers (an option that is a Trait of the
 * Transformation itself, a Technical Trait of Ki Technician: that Trait's own). */
function optionSummary(item, trait, option) {
  let label = optionLabel(trait, option);
  const all = [...(item.system.modifiers ?? []), ...(item.system.triggers ?? [])];
  if ( !all.some(x => x.label === label) && all.some(x => x.label === option) ) label = option;
  const parts = [];
  for ( const m of item.system.modifiers ?? [] ) {
    if ( m.label !== label ) continue;
    const placeholder = /\{foundation\}/.test(m.target);
    const target = String(m.target).replace(".{foundation}", "");
    const name = (DBU.modifierTargets[target] ? L(DBU.modifierTargets[target]) : target)
      + (placeholder ? ` (${L("DBU.Choice.ChosenFoundation")})` : "");
    const when = conditionText(m.condition);
    parts.push(`${name} ${String(m.value).startsWith("-") ? "" : "+"}${m.value}${when ? ` ${when}` : ""}`);
  }
  for ( const t of item.system.triggers ?? [] ) {
    if ( t.label === label ) parts.push(`${L(`DBU.Trigger.EventLabel.${t.event}`)}: ${L(`DBU.Trigger.Effect.${t.effect}`)} ${t.value} ${t.resource}`.trim());
  }
  return parts.length ? parts.join(" · ") : L("DBU.Choice.SeeText");
}

/**
 * Ask for every choice this Transformation still needs. Returns true when nothing is left pending.
 * @param {Actor} actor
 * @param {Item} item
 * @param {{required?: boolean, all?: boolean}} [options]  required: the player cannot skip (entering the Transformation);
 *                                                     all: ask again even for the choices already made
 */
export async function chooseTransformationOptions(actor, item, { required = true, all = false } = {}) {
  const list = all ? (item.system.choices ?? []) : (item.system.pendingChoices ?? []);
  for ( const choice of foundry.utils.deepClone(list) ) {
    if ( choice.perStack ) {
      if ( !(await chooseStackPicks(actor, item, choice, { required, again: all })) ) return false;
      continue;
    }
    const result = await askChoice(item, choice, { required, pick: item.system.picksOf?.(choice) ?? choice.pick });
    if ( !result ) return false;
    await applyChoice(actor, choice, result.selected, result.detail);
  }
  return !(actor.items.get(item.id)?.system.pendingChoices?.length);
}

/**
 * The picks of a per-Stack choice for every Stack that still lacks them ("Each time you gain a stack of Warlock, gain
 * access to a Wizarding Trait of your choice"). `again` starts over from the first Stack.
 */
async function chooseStackPicks(actor, item, choice, { required, again = false }) {
  let current = foundry.utils.deepClone(choice);
  if ( again && current.selected?.length ) {
    await setStackPicks(actor, item, current, [], []);
    current.selected = [];
  }
  const pick = Math.max(1, current.pick ?? 1);
  for ( let guard = 0; guard < 20; guard++ ) {
    const owned = actor.items.get(item.id);
    const stacks = owned?.system.stacks ?? 0;
    if ( (current.selected?.length ?? 0) >= pick * stacks ) return true;
    const groups = stackGroups(current);
    const last = groups.at(-1) ?? [];
    const partial = (last.length && (last.length < pick)) ? last : [];
    const stack = partial.length ? groups.length : groups.length + 1;
    const blocked = blockedOptions(current, partial);
    const result = await askChoice(owned, current, { required, pick: pick - partial.length, blocked, stack,
      defaults: suggestedPicks(owned, current, stack, pick - partial.length, blocked) });
    if ( !result ) return false;
    const selected = [...(current.selected ?? []), ...result.selected];
    await setStackPicks(actor, owned, current, selected, result.selected);
    current = { ...current, selected };
  }
  return true;
}

const ATTRIBUTE_NAMES = { Agility: "ag", Force: "fo", Tenacity: "te", Scholarship: "sc", Insight: "in", Magic: "ma", Personality: "pe" };

/**
 * Picks to suggest for a Stack: when the options are Attributes and the Stack holds a character of the world (the
 * Absorbed Character of a stack of Absorption), that character's highest Attribute Scores.
 */
function suggestedPicks(item, choice, stack, n, blocked) {
  if ( !choice.options.every(o => o in ATTRIBUTE_NAMES) ) return [];
  const name = item.system.stackNotes?.[stack - 1];
  const other = name ? game.actors.getName(name) : null;
  const scores = other?.system?.attributes;
  if ( !scores ) return [];
  const score = o => scores[ATTRIBUTE_NAMES[o]]?.score ?? 0;
  return choice.options.filter(o => !blocked.has(o)).sort((a, b) => score(b) - score(a)).slice(0, n);
}

/**
 * Store the picks of a per-Stack choice. When its options are compendium items, picks add those items (and picks
 * taken away remove them); its effects follow the picks on their own (rules/awakening.mjs).
 * @param {string[]|null} [added]  The picks just made, for the chat card (null: the new ones at the end)
 */
export async function setStackPicks(actor, item, choice, selected, added = null) {
  const src = item._source?.system ?? item.system;
  const choices = foundry.utils.deepClone(src.choices ?? []);
  const index = choices.findIndex(c => c.id === choice.id);
  if ( index < 0 ) return;
  const before = choices[index].selected ?? [];
  choices[index].selected = selected;
  await item.update({ "system.choices": choices });
  if ( choice.pack ) {
    // Items of picks no longer there go; new picks bring theirs
    const left = [...selected];
    const drop = [];
    for ( const doc of actor.items.filter(i => (i.flags?.["dbu-rpg"]?.grantedBy?.item === item.id)
      && (i.flags["dbu-rpg"].grantedBy.choice === choice.id)) ) {
      const k = left.indexOf(doc.flags["dbu-rpg"].grantedBy.option);
      if ( k >= 0 ) left.splice(k, 1);
      else drop.push(doc.id);
    }
    if ( drop.length ) await actor.deleteEmbeddedDocuments("Item", drop);
    if ( left.length ) await grantItems(actor, item, choice, left);
  }
  const shown = added ?? selected.slice(before.length);
  if ( shown.length ) {
    const stack = Math.ceil(selected.length / Math.max(1, choice.pick ?? 1));
    await postInfoCard({ actor, img: item.img, title: L("DBU.Choice.Chosen", { name: actor.name }),
      lines: [L("DBU.Stack.Picked", { trait: choice.trait, n: stack, list: shown.join(", ") })] });
  }
}

/** Add the compendium items of these picks (a Factor Trait of the Genetic Splicing Factor...), marked as theirs. */
async function grantItems(actor, item, choice, options) {
  const pack = game.packs.get(choice.pack);
  if ( !pack ) return;
  const index = await pack.getIndex();
  const data = [];
  for ( const option of options ) {
    const entry = index.find(e => e.name === option);
    if ( !entry ) continue;
    const doc = (await pack.getDocument(entry._id))?.toObject();
    if ( !doc ) continue;
    delete doc._id;
    foundry.utils.setProperty(doc, "flags.dbu-rpg.grantedBy", { item: item.id, choice: choice.id, option });
    // D3: "while in this Transformation": it works only while the Transformation does (data/items.mjs grantWorks)
    if ( choice.grantActive ) foundry.utils.setProperty(doc, "flags.dbu-rpg.grantActive", true);
    // Q: "after you gain N Masteries": it works only from then on
    if ( choice.grantMastery ) foundry.utils.setProperty(doc, "flags.dbu-rpg.grantMastery", choice.grantMastery);
    data.push(doc);
  }
  if ( data.length ) await actor.createEmbeddedDocuments("Item", data);
}

async function askChoice(item, choice, { required, pick = choice.pick, blocked = new Set(), stack = 0, defaults = [] }) {
  const multiple = pick > 1;
  const rows = choice.options.map(o => `
    <label class="dbu-choice-option${blocked.has(o) ? " dbu-dim" : ""}">
      <input type="${multiple ? "checkbox" : "radio"}" name="option" value="${foundry.utils.escapeHTML(o)}"${blocked.has(o) ? " disabled" : ""}${defaults.includes(o) ? " checked" : ""}>
      <span><strong>${o}</strong><small>${optionSummary(item, choice.trait, o)}</small></span>
    </label>`).join("");
  const foundations = choice.subs?.length ? `<div class="form-group dbu-choice-sub" hidden>
    <label>${L("DBU.Choice.Foundation")}</label>
    <select name="detail">${["physical", "energy", "magic"].map(f => `<option value="${f}">${L(DBU.foundations[f])}</option>`).join("")}</select>
  </div>` : "";
  const content = `<div class="dbu-dialog dbu-choice">
    <p>${stack ? L("DBU.Stack.PickLine", { trait: choice.trait, name: item.name, n: pick })
      : L(multiple ? "DBU.Choice.PickN" : "DBU.Choice.Pick1", { trait: choice.trait, name: item.name, n: pick })}</p>
    ${stack ? `<p class="hint">${L(choice.repeat ? "DBU.Stack.PickHintRepeat" : "DBU.Stack.PickHint", { n: stack })}</p>` : ""}
    ${rows}${foundations}
    <p class="hint">${L(required ? "DBU.Choice.HintRequired" : "DBU.Choice.Hint")}</p>
  </div>`;
  for ( let attempt = 0; attempt < 5; attempt++ ) {
    const data = await DialogV2.wait({
      window: { title: stack ? L("DBU.Stack.PickTitle", { name: item.name, n: stack }) : L("DBU.Choice.Title", { name: item.name }),
        icon: "fa-solid fa-list-check" },
      position: { width: 520 },
      content,
      buttons: [
        { action: "ok", label: L("DBU.Choice.Confirm"), icon: "fa-solid fa-check", default: true,
          callback: (event, button) => {
            const els = button.form.elements;
            const selected = Array.from(button.form.querySelectorAll("input[name=option]:checked")).map(i => i.value);
            return { selected, detail: els.detail?.value ?? "" };
          } },
        ...(required ? [] : [{ action: "later", label: L("DBU.Choice.Later"), icon: "fa-solid fa-clock" }])
      ],
      // The Foundation list only matters for the options that ask for one
      render: (event, dialog) => {
        const sub = dialog.element.querySelector(".dbu-choice-sub");
        if ( !sub ) return;
        const sync = () => {
          const chosen = Array.from(dialog.element.querySelectorAll("input[name=option]:checked")).map(i => i.value);
          sub.hidden = !chosen.some(o => choice.subs.includes(o));
        };
        dialog.element.querySelectorAll("input[name=option]").forEach(i => i.addEventListener("change", sync));
      },
      rejectClose: false
    });
    if ( !data || (data === "later") ) return null;
    if ( data.selected.length === pick ) return data;
    ui.notifications.warn(L("DBU.Choice.WrongCount", { n: pick }));
  }
  return null;
}

/**
 * Switch on the modifiers/triggers of the chosen option(s) of a Trait only (a Foundation detail fills "{foundation}").
 * @returns {object[]}  The list, changed in place
 */
export function toggleOptions(list, trait, selected, detail = "", options = null) {
  const prefix = optionLabel(trait, "");
  return list.map(x => {
    if ( !String(x.label ?? "").startsWith(prefix) ) return x;
    const option = x.label.slice(prefix.length);
    // (R: the pieces of another choice of the same Trait are not this one's)
    if ( Array.isArray(options) && options.length && !options.includes(option) ) return x;
    const on = selected.includes(option);
    const y = { ...x, active: on };
    if ( on && detail && ("target" in y) ) y.target = String(y.target).replace("{foundation}", detail);
    return y;
  });
}

/**
 * Record a choice on every Transformation of the actor that has it (later Stages inherit the trait) and switch
 * on the modifiers/triggers of the chosen option(s) only.
 */
export async function applyChoice(actor, choice, selected, detail = "") {
  const updates = [];
  for ( const item of actor.items ) {
    if ( item.type !== "transformation" ) continue;
    const src = item.system._source ?? item._source.system;
    const index = (src.choices ?? []).findIndex(c => c.id === choice.id);
    if ( index < 0 ) continue;
    const choices = foundry.utils.deepClone(src.choices);
    choices[index].selected = selected;
    choices[index].detail = detail;
    updates.push({
      _id: item.id, "system.choices": choices,
      "system.modifiers": toggleOptions(foundry.utils.deepClone(src.modifiers ?? []), choice.trait, selected, detail, choice.options),
      "system.triggers": toggleOptions(foundry.utils.deepClone(src.triggers ?? []), choice.trait, selected, detail, choice.options)
    });
  }
  if ( !updates.length ) return;
  await actor.updateEmbeddedDocuments("Item", updates);
  // D3: a choice made once whose options are compendium items (God Maneuvers, Bestial Traits...): the picks bring their
  // items, given by the first Transformation that has the choice; picks taken away take theirs
  if ( choice.pack ) {
    const owner = actor.items.get(updates[0]._id);
    const left = [...selected];
    const drop = [];
    for ( const doc of actor.items.filter(i => (i.flags?.["dbu-rpg"]?.grantedBy?.choice === choice.id)
      && updates.some(u => u._id === i.flags["dbu-rpg"].grantedBy.item)) ) {
      const k = left.indexOf(doc.flags["dbu-rpg"].grantedBy.option);
      if ( k >= 0 ) left.splice(k, 1);
      else drop.push(doc.id);
    }
    if ( drop.length ) await actor.deleteEmbeddedDocuments("Item", drop);
    if ( left.length && owner ) await grantItems(actor, owner, choice, left);
  }
  const detailText = detail ? ` (${L(DBU.foundations[detail] ?? detail)})` : "";
  await postInfoCard({ actor, title: L("DBU.Choice.Chosen", { name: actor.name }),
    lines: [`${choice.trait}: ${selected.join(", ")}${detailText}`] });
}
