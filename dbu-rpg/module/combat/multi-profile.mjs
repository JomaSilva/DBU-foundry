import { DBU } from "../config.mjs";
import { encounterOf } from "./triggers.mjs";
import { changeStacks } from "./stacks.mjs";
import { favoredElements, multiProfileCost, multiProfileSources, profileKeys } from "../rules/profiles.mjs";
import { resourceSlug } from "../rules/resources.mjs";

/**
 * Multi-Profile applied by an effect when an attack is made (Flash of the Elements, Elemental Aura, Elemental
 * Infusion, Plant Monster, Neko Mimicry, Elemental Blade): the choice in the attack dialog, its checks, the Ki Point
 * Cost of the Super Profile and the uses per Combat Round or Encounter.
 */
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const FLAG = "multiProfileUses";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Uses of a source in the actor's current Combat Encounter (null outside one: no limits there). */
function usesOf(actor, id) {
  const combat = encounterOf(actor);
  if ( !combat ) return null;
  const flag = actor.getFlag("dbu-rpg", FLAG);
  if ( flag?.combat !== combat.id ) return { combat, round: 0, encounter: 0 };
  const e = flag.uses?.[id] ?? {};
  return { combat, round: (e.round === combat.round) ? (e.roundCount ?? 0) : 0, encounter: e.total ?? 0 };
}

/** How many more times a source can be used now (Infinity without a limit or outside a Combat Encounter). */
export function usesLeft(actor, source) {
  if ( !source.limit ) return Infinity;
  const used = usesOf(actor, source.def.id);
  if ( !used ) return Infinity;
  return Math.max(0, source.limit.max - ((source.limit.per === "round") ? used.round : used.encounter));
}

const sourceName = s => `${s.def.name}${(s.def.name === s.item.name) ? "" : ` (${s.item.name})`}`;
const foundationsOf = def => (def.attacks === "physicalEnergy") ? ["physical", "energy"] : ["physical", "energy", "magic"];

function limitText(actor, s) {
  if ( !s.limit ) return "";
  const left = usesLeft(actor, s);
  const per = L(s.limit.per === "round" ? "DBU.MultiProfile.PerRound" : "DBU.MultiProfile.PerEncounter");
  return Number.isFinite(left) ? L("DBU.MultiProfile.Left", { n: left, max: s.limit.max, per }) : `${s.limit.max}/${per}`;
}

/**
 * What the attack dialog offers.
 * @returns {{html: string}} the dialog part: a fixed line (Elemental Blade), a select, or hints
 */
/** What a source costs: the Multi-Profile's Ki Point Cost in (T), or a fixed amount (Glass Tribe: 2(bT) KP). */
const costText = (actor, s, k) => (s.def.kpFlat ? `+${s.def.kpFlat(actor)} KP` : `+${multiProfileCost(k)}(T) KP`);

export function multiProfileField(actor, { profileKey, sig = null } = {}) {
  const { blocked, sources } = multiProfileSources(actor, profileKey, sig);
  if ( !sources.length ) return "";
  if ( blocked ) return `<p class="hint">${L("DBU.MultiProfile.HasSuper")}</p>`;
  const hints = [];
  const usable = sources.filter(s => {
    if ( s.blocked || ((s.def.attacks === "signature") && !sig) ) return false;
    if ( !s.keys.length ) {
      if ( !s.def.mandatory ) hints.push(L(s.def.favored ? "DBU.MultiProfile.NoFavored" : "DBU.MultiProfile.NoProfile", { source: sourceName(s) }));
      return false;
    }
    return true;
  });
  const fixed = usable.find(s => s.def.mandatory);
  if ( fixed ) {
    const key = fixed.keys[0];
    return `<p class="hint dbu-multi-fixed">${L("DBU.MultiProfile.Fixed", { profile: DBU.profiles[key].label,
      source: sourceName(fixed), n: multiProfileCost(key) })}</p><input type="hidden" name="multi" value="${fixed.def.id}|${key}">`;
  }
  if ( !usable.length ) return hints.length ? `<p class="hint">${hints.join("<br>")}</p>` : "";
  const groups = usable.map(s => {
    const left = usesLeft(actor, s);
    const extra = [limitText(actor, s), s.def.copied ? L("DBU.MultiProfile.CopiedOnly") : "", s.def.note ? L(s.def.note) : "",
      s.def.resource ? L("DBU.MultiProfile.Resource", { name: s.def.resource }) : ""].filter(Boolean).join(" · ");
    const options = s.keys.map(k => `<option value="${s.def.id}|${k}" data-key="${k}" data-foundations="${foundationsOf(s.def).join(",")}"
      ${left > 0 ? "" : "disabled data-used"}>${esc(DBU.profiles[k].label)} — ${costText(actor, s, k)}</option>`).join("");
    return `<optgroup label="${esc(sourceName(s))}${extra ? ` · ${esc(extra)}` : ""}">${options}</optgroup>`;
  }).join("");
  return `<div class="form-group"><label>Multi-Profile</label><select name="multi"><option value="">—</option>${groups}</select></div>
    ${hints.length ? `<p class="hint">${hints.join("<br>")}</p>` : ""}`;
}

/**
 * Check the Multi-Profile chosen for an attack ("source|profile"), or the one a Weapon always applies.
 * @returns {{source: object, key: string, cost: number, problems: string[], note: string}|null}
 */
export function resolveMultiProfile(actor, { value = "", profileKey, sig = null, foundation }) {
  const { sources } = multiProfileSources(actor, profileKey, sig);
  let [id, key] = String(value || "").split("|");
  // Elemental Blade (every attack) and Glass Dragon (every Signature Technique) always apply
  const fixed = sources.find(s => s.def.mandatory && s.keys.length && !s.blocked && ((s.def.attacks !== "signature") || sig));
  if ( !id && fixed ) [id, key] = [fixed.def.id, fixed.keys[0]];
  if ( !id ) return null;
  const source = sources.find(s => s.def.id === id);
  const problems = [];
  if ( !source || !DBU.profiles[key] ) return { source: null, key: null, cost: 0, problems: [L("DBU.MultiProfile.ErrSource")], note: "" };
  // The Weapon's Element on an attack already of that Profile adds nothing
  if ( source.def.mandatory && profileKeys(profileKey, sig).includes(key) ) return null;
  const name = sourceName(source);
  if ( source.blocked ) problems.push(L("DBU.MultiProfile.ErrSuper"));
  if ( !source.keys.includes(key) ) problems.push(L("DBU.MultiProfile.ErrProfile", { source: name, profile: DBU.profiles[key].label }));
  if ( !foundationsOf(source.def).includes(foundation) ) problems.push(L("DBU.MultiProfile.ErrFoundation", { source: name }));
  if ( (source.def.attacks === "signature") && !sig ) problems.push(L("DBU.MultiProfile.ErrSignature", { source: name }));
  if ( usesLeft(actor, source) < 1 ) {
    problems.push(L("DBU.MultiProfile.ErrUsed", { source: name, max: source.limit.max,
      per: L(source.limit.per === "round" ? "DBU.MultiProfile.PerRound" : "DBU.MultiProfile.PerEncounter") }));
  }
  // A resource with that name on the sheet must have a stack to spend (without one, the card only reminds it)
  const resource = source.def.resource
    ? (actor.system.resources ?? []).find(r => resourceSlug(r.name) === resourceSlug(source.def.resource)) : null;
  if ( resource && ((resource.value ?? 0) < 1) ) problems.push(L("DBU.MultiProfile.ErrResource", { source: name, name: resource.name }));
  // The Glass Tribe's Glass costs a fixed amount of Ki Points instead of the Multi-Profile's (T)
  const flatKp = source.def.kpFlat ? source.def.kpFlat(actor) : 0;
  const cost = flatKp ? 0 : multiProfileCost(key);
  return { source, key, cost, flatKp, problems, resource: resource?.name ?? null,
    note: flatKp ? L("DBU.MultiProfile.NoteFlat", { source: name, profile: DBU.profiles[key].label, n: flatKp })
      : L("DBU.MultiProfile.Note", { source: name, profile: DBU.profiles[key].label, n: cost }) };
}

/** One more use of an effect in this Combat Round and Encounter (nothing is counted outside a Combat Encounter). */
async function recordUse(actor, id) {
  const used = usesOf(actor, id);
  if ( !used ) return;
  const flag = foundry.utils.deepClone(actor.getFlag("dbu-rpg", FLAG) ?? {});
  const uses = (flag.combat === used.combat.id) ? (flag.uses ?? {}) : {};
  const e = uses[id] ?? {};
  uses[id] = { round: used.combat.round, roundCount: used.round + 1, total: (e.total ?? 0) + 1 };
  await actor.setFlag("dbu-rpg", FLAG, { combat: used.combat.id, uses });
}

/** Count the use (per Combat Round / Encounter) and spend the resource, once the attack is paid. Returns notes. */
export async function spendMultiProfile(actor, mp) {
  if ( !mp?.source ) return [];
  const notes = [];
  await recordUse(actor, mp.source.def.id);
  if ( mp.source.def.resource ) {
    if ( mp.resource ) {
      await changeStacks(actor, mp.resource, -1, { label: mp.source.def.name });
      const left = (actor.system.resources ?? []).find(r => resourceSlug(r.name) === resourceSlug(mp.resource))?.value ?? 0;
      notes.push(L("DBU.MultiProfile.ResourceSpent", { name: mp.resource, n: left }));
    }
    else notes.push(L("DBU.MultiProfile.ResourceRemind", { name: mp.source.def.resource }));
  }
  if ( mp.source.def.id === "elementalBlade" ) notes.push(L("DBU.MultiProfile.Compressed"));
  return notes;
}

/* -------------------------------------------- */
/*  Hyper Elemental (Elemental Force, 2 Stacks) */
/* -------------------------------------------- */

const HYPER_AOE = { def: { id: "hyperAoe" }, limit: { per: "round", max: 1 } };
const HYPER_ELEMENT = { def: { id: "hyperElement" }, limit: { per: "encounter", max: 1 } };

function hyperElementalItem(actor) {
  return actor?.items?.find(i => (i.type === "transformation") && /^elemental force$/i.test(i.name) && ((i.system.stacks ?? 0) >= 2)) ?? null;
}

/**
 * The Hyper Elemental part of the attack dialog: on a Signature Technique that gets a Favored Element through Flash of
 * the Elements, a Line or Cone AoE [1/Round] and, with 3+ Energy Charges from the Energy Charge Maneuver, one more
 * Favored Element [1/Encounter]. Enabled only while Flash of the Elements is chosen.
 */
export function hyperElementalField(actor, { sig = null } = {}) {
  if ( !sig || !hyperElementalItem(actor) ) return "";
  const aoeLeft = usesLeft(actor, HYPER_AOE);
  const elementLeft = usesLeft(actor, HYPER_ELEMENT);
  const charged = (actor.system.combat.energyCharges ?? 0) >= 3;
  const elements = favoredElements(actor);
  return `<div class="dbu-hyper" data-hyper>
    <div class="form-group"><label data-tooltip="${esc(L("DBU.MultiProfile.HyperAoeTip"))}">Hyper Elemental: AoE</label>
      <select name="hyperAoe" ${aoeLeft > 0 ? "" : "disabled"}><option value="">—</option>
        <option value="line">Line</option><option value="cone">Cone</option></select></div>
    ${(charged && elements.length > 1) ? `<div class="form-group"><label data-tooltip="${esc(L("DBU.MultiProfile.HyperElementTip"))}">Hyper Elemental: +</label>
      <select name="hyperElement" ${elementLeft > 0 ? "" : "disabled"}><option value="">—</option>
        ${elements.map(k => `<option value="${k}" data-key="${k}">${esc(DBU.profiles[k].label)}</option>`).join("")}</select></div>` : ""}
  </div>`;
}

/**
 * Check the Hyper Elemental choices of an attack.
 * @returns {{aoe: string, extraKey: string|null, problems: string[], notes: string[], uses: string[]}}
 */
export function resolveHyperElemental(actor, { sig = null, mp = null, aoe = "", element = "" } = {}) {
  const out = { aoe: "", extraKey: null, problems: [], notes: [], uses: [] };
  if ( !aoe && !element ) return out;
  const usingFlash = mp?.source?.def?.id === "elementalForce";
  if ( !sig || !hyperElementalItem(actor) || !usingFlash ) {
    out.problems.push(L("DBU.MultiProfile.HyperNeeds"));
    return out;
  }
  if ( aoe ) {
    if ( usesLeft(actor, HYPER_AOE) < 1 ) out.problems.push(L("DBU.MultiProfile.HyperUsed", { what: "AoE", per: L("DBU.MultiProfile.PerRound") }));
    out.aoe = ["line", "cone"].includes(aoe) ? aoe : "";
    if ( out.aoe ) {
      out.uses.push(HYPER_AOE.def.id);
      out.notes.push(L("DBU.MultiProfile.HyperAoe", { aoe: out.aoe === "line" ? "Line" : "Cone" }));
    }
  }
  if ( element && DBU.profiles[element] ) {
    if ( usesLeft(actor, HYPER_ELEMENT) < 1 ) out.problems.push(L("DBU.MultiProfile.HyperUsed", { what: "Favored Element", per: L("DBU.MultiProfile.PerEncounter") }));
    if ( (actor.system.combat.energyCharges ?? 0) < 3 ) out.problems.push(L("DBU.MultiProfile.HyperCharges"));
    if ( !favoredElements(actor).includes(element) || (element === mp.key) ) out.problems.push(L("DBU.MultiProfile.ErrProfile", { source: "Hyper Elemental", profile: DBU.profiles[element].label }));
    out.extraKey = element;
    out.uses.push(HYPER_ELEMENT.def.id);
    out.notes.push(L("DBU.MultiProfile.HyperElement", { profile: DBU.profiles[element].label }));
  }
  return out;
}

/** Count the Hyper Elemental uses once the attack is paid. */
export async function spendHyperElemental(actor, hyper) {
  for ( const id of hyper?.uses ?? [] ) await recordUse(actor, id);
}
