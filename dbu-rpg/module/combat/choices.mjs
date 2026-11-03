import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";

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

/** Short description of what an option does, from its compiled modifiers and triggers. */
function optionSummary(item, trait, option) {
  const label = optionLabel(trait, option);
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
    const result = await askChoice(item, choice, { required });
    if ( !result ) return false;
    await applyChoice(actor, choice, result.selected, result.detail);
  }
  return !(actor.items.get(item.id)?.system.pendingChoices?.length);
}

async function askChoice(item, choice, { required }) {
  const multiple = choice.pick > 1;
  const rows = choice.options.map(o => `
    <label class="dbu-choice-option">
      <input type="${multiple ? "checkbox" : "radio"}" name="option" value="${foundry.utils.escapeHTML(o)}">
      <span><strong>${o}</strong><small>${optionSummary(item, choice.trait, o)}</small></span>
    </label>`).join("");
  const foundations = choice.subs?.length ? `<div class="form-group dbu-choice-sub" hidden>
    <label>${L("DBU.Choice.Foundation")}</label>
    <select name="detail">${["physical", "energy", "magic"].map(f => `<option value="${f}">${L(DBU.foundations[f])}</option>`).join("")}</select>
  </div>` : "";
  const content = `<div class="dbu-dialog dbu-choice">
    <p>${L(multiple ? "DBU.Choice.PickN" : "DBU.Choice.Pick1", { trait: choice.trait, name: item.name, n: choice.pick })}</p>
    ${rows}${foundations}
    <p class="hint">${L(required ? "DBU.Choice.HintRequired" : "DBU.Choice.Hint")}</p>
  </div>`;
  for ( let attempt = 0; attempt < 5; attempt++ ) {
    const data = await DialogV2.wait({
      window: { title: L("DBU.Choice.Title", { name: item.name }), icon: "fa-solid fa-list-check" },
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
    if ( data.selected.length === choice.pick ) return data;
    ui.notifications.warn(L("DBU.Choice.WrongCount", { n: choice.pick }));
  }
  return null;
}

/**
 * Switch on the modifiers/triggers of the chosen option(s) of a Trait only (a Foundation detail fills "{foundation}").
 * @returns {object[]}  The list, changed in place
 */
export function toggleOptions(list, trait, selected, detail = "") {
  const prefix = optionLabel(trait, "");
  return list.map(x => {
    if ( !String(x.label ?? "").startsWith(prefix) ) return x;
    const option = x.label.slice(prefix.length);
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
      "system.modifiers": toggleOptions(foundry.utils.deepClone(src.modifiers ?? []), choice.trait, selected, detail),
      "system.triggers": toggleOptions(foundry.utils.deepClone(src.triggers ?? []), choice.trait, selected, detail)
    });
  }
  if ( !updates.length ) return;
  await actor.updateEmbeddedDocuments("Item", updates);
  const detailText = detail ? ` (${L(DBU.foundations[detail] ?? detail)})` : "";
  await postInfoCard({ actor, title: L("DBU.Choice.Chosen", { name: actor.name }),
    lines: [`${choice.trait}: ${selected.join(", ")}${detailText}`] });
}
