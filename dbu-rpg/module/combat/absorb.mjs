/**
 * F17 The Absorb Maneuver (Special Maneuvers) against the user's target: a Clash (Strike vs Strike/Dodge; a loss provokes
 * the target's Exploit), then a Corporeal Clash: a loss leaves the target Shaken until the end of its next turn; a win
 * removes it from the Combat Encounter (its combatant goes, its token is hidden) and gives the absorber a stack of
 * Absorption as a Level 2 Temporary Awakening holding it. Assimilation (3): a Goop of the absorber makes it, with the
 * absorber's rolls, measured from the Goop; on a success the Goop is Defeated (removed).
 */
import { resolveClash } from "./clash.mjs";
import { runOps } from "./movement.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { tokenDistance } from "../rules/proximity.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Absorb the user's target. @returns a text for the card. */
export async function absorbTarget(actor, { byGoop = false, label = "" } = {}) {
  const target = [...(game.user?.targets ?? [])][0] ?? null;
  const other = target?.actor ?? null;
  if ( !other || (other === actor) ) return L("DBU.TraitUse.NoTarget");
  let from = actor.getActiveTokens?.()?.[0]?.document ?? null;
  let goop = null;
  if ( byGoop ) {
    const { goopsOf } = await import("./minions.mjs");
    const goops = goopsOf(actor);
    if ( !goops.length ) return L("DBU.Absorb2.NoGoop");
    goop = goops[0];
    if ( goops.length > 1 ) {
      const id = await foundry.applications.api.DialogV2.wait({ window: { title: label || "Absorb" },
        content: `<div class="dbu-dialog"><select name="id">${goops.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></div>`,
        buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), default: true, callback: (e, b) => b.form.elements.id.value },
          { action: "cancel", label: L("Cancel") }], rejectClose: false });
      goop = goops.find(g => g.id === id) ?? null;
      if ( !goop ) return "";
    }
    from = goop.getActiveTokens?.()?.[0]?.document ?? null;
  }
  // (Melee Range: the adjacent Squares, more for larger Size Categories)
  const who = goop ?? actor;
  const reach = 1 + (Number(who.system?.size?.reach ?? 0) || 0);
  if ( from && target.document && (from.parent === target.document.parent) ) {
    const scene = from.parent;
    const d = tokenDistance(from, target.document, { size: scene.grid?.size ?? 100, unit: scene.grid?.distance ?? 1 });
    if ( d > reach ) return L("DBU.Absorb2.Far", { name: other.name, d, n: reach });
  }
  const title = label || "Absorb";
  const lines = [];
  const first = await resolveClash(actor, other, { mine: "strike", theirs: "dodge|strike", label: `${title} (1)`, subtitle: title, defenderSubtitle: title, card: false });
  if ( !first?.won ) {
    lines.push(L("DBU.Absorb2.FirstLost", { name: actor.name, other: other.name }));
    await postInfoCard({ actor, title, lines });
    await (await import("../rules/exploit.mjs")).provokeExploit(actor, "absorb", { opponents: [other], name: title }).catch(() => null);
    return "";
  }
  const second = await resolveClash(actor, other, { mine: "corporeal", theirs: "corporeal", label: `${title} (2)`, subtitle: title, defenderSubtitle: title, card: false });
  if ( !second?.won ) {
    const { encounterOf } = await import("./triggers.mjs");
    const op = encounterOf(actor)
      ? { op: "timed", uuid: other.uuid, key: "shaken", add: 1, duration: "endOfNextTurn", label: title, source: actor.uuid, skip: 0 }
      : { op: "condition", uuid: other.uuid, key: "shaken", value: 1 };
    await runOps([op]);
    lines.push(L("DBU.Absorb2.SecondLost", { other: other.name }));
    return postInfoCard({ actor, title, lines }).then(() => "");
  }
  // Absorbed: out of the Combat Encounter, and a Temporary Level 2 stack of Absorption holding it
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === other.uuid));
  const cb = combat?.combatants.find(c => c.actor?.uuid === other.uuid);
  const ops = [{ op: "update", uuid: target.document.uuid, data: { hidden: true } }];
  if ( cb ) ops.push({ op: "delete", uuid: cb.uuid });
  await runOps(ops);
  const AW = await import("./awakening.mjs");
  await AW.gainAwakening(actor, "Absorption", { temp: 2, note: other.name, source: title, ask: false });
  lines.push(L("DBU.Absorb2.Absorbed", { name: actor.name, other: other.name }));
  if ( goop ) {
    const { removeMinions } = await import("./minions.mjs");
    await removeMinions([goop.uuid]);
    lines.push(L("DBU.Absorb2.GoopGone", { name: goop.name }));
  }
  await postInfoCard({ actor, title, lines });
  return "";
}
