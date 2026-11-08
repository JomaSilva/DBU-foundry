import { postInfoCard } from "../dice/roller.mjs";
import { officialTraitText } from "../rules/official-text.mjs";
import { parseTrait, traitStructure } from "../rules/traits.mjs";
import { encounterOf } from "./triggers.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const { DialogV2 } = foundry.applications.api;

/** Label of a Trait kind ("burst limit" → "Burst Limit"). */
export function traitKindLabel(kind) {
  return {
    "mastery trait": "Mastery Trait", "burst limit": "Burst Limit", "legendary trait": "Legendary Trait",
    "transcendent trait": "Transcendent Trait", "grand awakening": "Grand Awakening"
  }[kind] ?? "";
}

/** A Trait of a Transformation, its own or one it inherits ({ name, kind, from, slug }), or null. */
function findTrait(item, name) {
  const s = item.system;
  const own = (s.traits ?? []).map(t => ({ ...parseTrait(t), from: "", slug: s.source?.slug ?? "" }));
  const inh = (s.inherited ?? []).map(t => ({ ...parseTrait(t.trait), from: t.from, slug: t.slug }));
  return [...own, ...inh].find(t => t.name === name) ?? null;
}

/** The official text of a Trait: from the loaded text of the item that has it, else from the site. */
async function traitHTML(actor, item, trait) {
  const source = trait.from ? actor?.items.find(i => (i.type === "transformation") && (i.name === trait.from)) : item;
  const html = await officialTraitText({
    name: trait.name, slug: trait.slug || source?.system.source?.slug || "",
    section: trait.from || item.system.source?.section || item.name, html: source?.system.description ?? ""
  }).catch(() => null);
  if ( html ) return html;
  // Offline, or the page changed: what the compendium knows about its effects, and the link
  const info = traitStructure(source?.system.description ?? "")[trait.name];
  const slug = trait.slug || source?.system.source?.slug;
  const link = slug ? `<p><a href="https://dbu-rpg.com/${slug}/" target="_blank" rel="noopener">dbu-rpg.com/${slug}</a></p>` : "";
  return `${info ? `<p>${info.split("; ").join("<br>")}</p>` : ""}${link}`;
}

/** Post a Transformation Trait to chat with its official text. */
export async function postTraitCard(actor, item, name) {
  const trait = findTrait(item, name);
  if ( !trait ) return item.toChat();
  const sub = [traitKindLabel(trait.kind), item.name, trait.from ? L("DBU.Traits.From", { name: trait.from }) : ""];
  return postInfoCard({ actor, img: item.img, title: trait.name, subtitle: sub.filter(Boolean).join(" · "),
    extraHTML: await traitHTML(actor, item, trait) });
}

/** The Transformation was entered, or its Grade changed, through the Transformation Maneuver now: its Burst Limit may follow. */
export function burstWindow(actor) {
  const c = encounterOf(actor);
  return { combat: c?.id ?? null, round: c?.round ?? 0, turn: c?.turn ?? 0 };
}

/** Burst Limit Traits of an Enhancement (its own and inherited ones). */
export function burstTraits(item) {
  return (item.system.allTraits ?? []).map(parseTrait).filter(t => t.kind === "burst limit").map(t => t.name);
}

/**
 * Trigger a Burst Limit [1/Encounter]: upon entering an Enhancement through the Transformation Maneuver or changing its
 * Grade through it. A New Level of Power in that Enhancement allows one more; in (or entering) a Transcended Enhancement,
 * regain 1/2 of the Maximum Ki Points (Burst Recovery).
 */
export async function triggerBurstLimit(actor, item, name) {
  const sys = actor.system;
  const s = item.system;
  if ( !s.active ) return ui.notifications.warn(L("DBU.Burst.NotActive", { name: item.name }));
  const c = encounterOf(actor);
  const used = !!c && sys.combat.burstUsed;
  if ( used && !s.newLevel ) return ui.notifications.warn(L("DBU.Burst.Used"));
  const w = item.getFlag("dbu-rpg", "burstWindow");
  const open = !c || (w && (w.combat === c.id) && (w.round === c.round) && (w.turn === c.turn));
  if ( !open ) {
    const ok = await DialogV2.confirm({ window: { title: name }, content: `<p>${L("DBU.Burst.Window", { name: item.name })}</p>`,
      rejectClose: false });
    if ( !ok ) return null;
  }
  const lines = [L("DBU.Burst.Triggered", { name: item.name })];
  if ( used ) lines.push(L("DBU.Burst.Again"));
  const updates = { "system.combat.burstUsed": true, "flags.dbu-rpg.burstCombat": c?.id ?? null };
  if ( sys.transformation.active.some(t => (t.system.transType === "enhancement") && t.system.transcended) ) {
    const gain = Math.floor(sys.ki.max / 2);
    updates["system.ki.value"] = Math.min(sys.ki.max, sys.ki.value + gain);
    lines.push(L("DBU.Burst.Recovery", { n: gain }));
  }
  await actor.update(updates);
  if ( w ) await item.unsetFlag("dbu-rpg", "burstWindow");
  // Triggers of that Burst Limit Trait
  (await import("./triggers.mjs")).fireEvent(actor, "burstLimit", { scope: { itemId: item.id, burst: name } });
  const trait = findTrait(item, name) ?? { name, kind: "burst limit", from: "", slug: s.source?.slug ?? "" };
  return postInfoCard({ actor, img: item.img, title: name, subtitle: `Burst Limit · ${item.name}`, lines,
    extraHTML: await traitHTML(actor, item, trait) });
}

/**
 * Full Awakening Maneuver [1/Encounter, 1 Action]: activate a Super Awakening's Grand Awakening until the end of the
 * Combat Encounter and regain 1/4 (rounded up) of the Maximum Life and Ki Points. Its Grand Trigger has to be met.
 */
export async function fullAwakening(actor, item) {
  const s = item.system;
  const grand = (s.traits ?? []).map(parseTrait).find(t => t.kind === "grand awakening");
  if ( !grand ) return null;
  if ( s.grandAwakening ) return ui.notifications.info(L("DBU.Grand.Active", { name: grand.name }));
  if ( !((s.stacks ?? 0) > 0) ) return ui.notifications.warn(L("DBU.Grand.NoStacks", { name: item.name }));
  const trigger = await traitHTML(actor, item, { ...grand, from: "", slug: s.source?.slug ?? "" });
  // E: a Grand Trigger written as data ("grandTrigger" pieces, rules/transform-rules.mjs): say whether it is met; when it
  // is not, only the GM may go on
  const { grandTriggerState } = await import("../rules/transform-rules.mjs");
  const gt = grandTriggerState(actor, item);
  if ( gt.pieces && !gt.met && !game.user.isGM ) return ui.notifications.warn(L("DBU.Grand.TriggerNotMet", { name: grand.name }));
  const state = !gt.pieces ? "" : `<p class="${gt.met ? "" : "dbu-warn"}">${L(gt.met ? "DBU.Grand.TriggerMet" : "DBU.Grand.TriggerNotMetGM",
    { name: grand.name, why: gt.why })}</p>`;
  const ok = await DialogV2.confirm({
    window: { title: `Full Awakening — ${grand.name}` },
    content: `${state}<p>${L("DBU.Grand.Confirm")}</p><div class="dbu-trait-text">${trigger}</div>`, rejectClose: false
  });
  if ( !ok ) return null;
  const sys = actor.system;
  const life = Math.ceil(sys.life.max / 4);
  const ki = Math.ceil(sys.ki.max / 4);
  await actor.update({
    ...(sys.flags?.noLifeRegain ? {} : { "system.life.value": Math.min(sys.life.max, sys.life.value + life) }),
    "system.ki.value": Math.min(sys.ki.max, sys.ki.value + ki),
    ...actor._spendAction(1)
  });
  await item.update({ "system.grandAwakening": true, "flags.dbu-rpg.grandCombat": encounterOf(actor)?.id ?? null });
  // Triggers of the Grand Awakening "when the Full Awakening Maneuver activates it"
  const { fireEvent } = await import("./triggers.mjs");
  fireEvent(actor, "grandAwakening", { scope: { [`awk_${String(s.source?.slug ?? "").replace(/[^a-z0-9]+/gi, "_")}`]: 1 } });
  return postInfoCard({ actor, img: item.img, title: `Full Awakening — ${grand.name}`, subtitle: item.name,
    lines: [L("DBU.Grand.Activated", { name: grand.name }), L("DBU.Grand.Regain", { life, ki })] });
}
