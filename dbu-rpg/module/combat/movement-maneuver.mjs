/**
 * Package O (round 9): the Movement Maneuver. Its Use button (or an Out-of-Sequence "movement") asks how to move: up to
 * the Normal Speed, or up to the Boosted Speed for 3(T) KP; and whether to add Rapid Movement for 2(T) KP (+1(T) Strike
 * Rolls until the end of the turn). It spends its Action (none Out-of-Sequence) and the KP, then fires "maneuverUsed"
 * (@via_movement, @boosted, @rapid). The token is still moved by hand on the map.
 *
 * Modifiers: "kpCost.boost" (± KP of moving at Boosted Speed), "kpCost.boostFree" (1: no KP for it), "kpCost.rapid"
 * (± KP of Rapid Movement), "kpCost.rapidFree" (1: no KP for it).
 */
import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const { DialogV2 } = foundry.applications.api;
const total = (sys, key) => Number(sys.buckets?.[key]?.total ?? 0) || 0;

/** The KP of the Boosted Speed and of Rapid Movement for this actor now. */
export function movementCosts(actor) {
  const sys = actor.system;
  const T = sys.top?.kp ?? sys.top?.current ?? 1;
  const boost = (total(sys, "kpCost.boostFree") > 0) ? 0 : Math.max(0, (3 * T) + total(sys, "kpCost.boost"));
  const rapid = (total(sys, "kpCost.rapidFree") > 0) ? 0 : Math.max(0, (2 * T) + total(sys, "kpCost.rapid"));
  return { boost, rapid, T };
}

/** Use the Movement Maneuver (item: the actor's Movement Maneuver item, if any). */
export async function useMovement(actor, { item = null } = {}) {
  const sys = actor.system;
  // (F10 "flag.noMovement": you cannot move by yourself now: Rooted)
  if ( (sys.buckets?.["flag.noMovement"]?.total ?? 0) > 0 ) return ui.notifications.warn(L("DBU.MoveManeuver.NoMovement", { name: actor.name }));
  const { boost, rapid, T } = movementCosts(actor);
  const normal = sys.aptitudes?.speedNormal ?? 0;
  const boosted = sys.aptitudes?.speedBoosted ?? 0;
  const pick = await DialogV2.wait({
    window: { title: item?.name ?? L("DBU.MoveManeuver.Title"), icon: "fa-solid fa-person-running" },
    content: `<div class="dbu-dialog">
      <div class="form-group"><label><input type="radio" name="speed" value="normal" checked> ${L("DBU.MoveManeuver.Normal", { n: normal })}</label></div>
      <div class="form-group"><label><input type="radio" name="speed" value="boosted"> ${L("DBU.MoveManeuver.Boosted", { n: boosted, kp: boost })}</label></div>
      <div class="form-group"><label><input type="checkbox" name="rapid"> ${L("DBU.MoveManeuver.Rapid", { kp: rapid })}</label></div></div>`,
    buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), icon: "fa-solid fa-check", default: true,
      callback: (event, button) => ({ boosted: button.form.elements.speed.value === "boosted", rapid: !!button.form.elements.rapid.checked }) },
    { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }],
    rejectClose: false
  });
  if ( !pick || (typeof pick !== "object") ) return null;
  const kp = (pick.boosted ? boost : 0) + (pick.rapid ? rapid : 0);
  const actions = actor._dbuOutOfSequence ? 0 : 1;
  const cost = [kp ? `ki:${kp}` : "", actions ? `actions:${actions}` : ""].filter(Boolean).join("; ");
  const Tr = await import("./triggers.mjs");
  let paid = "";
  if ( cost ) {
    const plan = Tr.triggerCostPlan(actor, cost, {});
    if ( plan.problems.length ) {
      ui.notifications.warn(`${item?.name ?? L("DBU.MoveManeuver.Title")}: ${plan.problems.join(" ")}`);
      return null;
    }
    paid = await Tr.payTriggerCost(actor, plan);
  }
  const lines = [L(pick.boosted ? "DBU.MoveManeuver.LineBoosted" : "DBU.MoveManeuver.LineNormal", { n: pick.boosted ? boosted : normal })];
  if ( pick.rapid ) {
    // Rapid Movement: +1(T) to the Strike Rolls until the end of the turn (its Dodge bonus against the Exploit it provokes
    // stays with the table)
    const text = await Tr.applyTriggerEffect(actor, "buff", T, "strike", { duration: "endOfTurn", label: "Rapid Movement" });
    lines.push(`Rapid Movement: ${text || `+${T} Strike`}`);
  }
  if ( paid ) lines.push(L("DBU.Use.Paid", { cost: paid }));
  await postInfoCard({ actor, title: item?.name ?? L("DBU.MoveManeuver.Title"), lines });
  // The Maneuver used: its uses counted, "maneuverUsed" with @via_movement, @boosted, @rapid
  const used = item ?? { name: "Movement Maneuver", type: "maneuver", system: { maneuverType: "Standard", actionCost: "1 Action" } };
  await Tr.noteItemUse(actor, used, { boosted: pick.boosted ? 1 : 0, rapid: pick.rapid ? 1 : 0 });
  return { ...pick, kp };
}

// (kept for the vocabulary docs: the base costs)
export const BASE_COSTS = { boost: "3(T)", rapid: "2(T)" };
void DBU;
