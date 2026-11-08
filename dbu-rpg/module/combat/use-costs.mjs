/**
 * Package N (round 8): the cost of using a Special Maneuver or a Unique Ability from its Use button, by the world setting
 * "useCosts": "off" (nothing, the default: the players pay by hand), "show" (the card says the cost, with the
 * modifiers) or "pay" (the system pays it, and refuses the use when it cannot).
 *
 * The cost: the item's KP Cost when it is a number formula ("6(bT)", "2(T)", "10"; "Varies" / "N/A" cost nothing here),
 * ± "kpCost.ua" (and "kpCost.ua.<abilityType>") for a Unique Ability, ± "kpCost.maneuver" for a Maneuver,
 * ± "kpCost.use.<slug of its name>", and nothing at all with "kpCost.useFree.<slug>" (never below 0); its Action Cost
 * ("1 Action", "2 Actions", "1 Counter") in a Combat Encounter.
 */
import { evaluate } from "../rules/formula.mjs";
import { awakeningSlug } from "../rules/awakening.mjs";

const blank = v => (v === undefined) || (v === null) || (String(v).trim() === "");
/** Maneuvers whose own flow pays their cost (the sheet's buttons, the attack dialog): their Use button never charges. */
const OWN_FLOW = /^(energy charge|feint|evasive feint|bite attack|basic attack|signature technique|power up|healing surge|ki surge|surge|combat recovery|transformation|movement|empower|exploit|defend|guard|duel|grapple|stance|hype|analysis)$/i;
const total = (sys, key) => Number(sys.buckets?.[key]?.total ?? 0) || 0;

/** The number formula at the start of a KP Cost ("6(bT) per Round" → "6(bT)"), or "". */
export function kpFormula(text) {
  const m = /^\s*(\d+(?:\.\d+)?\s*(?:\(\s*b?T\s*\))?)/i.exec(String(text ?? ""));
  return m ? m[1].replace(/\s+/g, "") : "";
}

/** { actions, counters } of an Action Cost ("1 Action", "2 Actions", "1 Counter", "N/A"). */
export function actionCostOf(text) {
  const s = String(text ?? "");
  const a = /^\s*(\d+)\s*Actions?\b/i.exec(s);
  const c = /^\s*(\d+)\s*Counter/i.exec(s);
  return { actions: a ? Number(a[1]) : 0, counters: c ? Number(c[1]) : 0 };
}

/**
 * What using the item costs: { kp, actions, counters, cost (the trigger cost text: "ki:6; actions:1"), free } or null
 * when it costs nothing the system knows.
 */
export function useCostOf(actor, item) {
  const sys = actor?.system;
  const s = item?.system ?? {};
  if ( !sys || !["maneuver", "uniqueAbility"].includes(item?.type) || s.god || s.villainous ) return null;
  const bare = String(item.name ?? "").replace(/\bmaneuver\b/gi, "").trim();
  if ( (item.type === "maneuver") && OWN_FLOW.test(bare) ) return null;
  const slug = awakeningSlug(bare);
  const formula = kpFormula(s.kpCost);
  let kp = formula ? evaluate(formula, sys.rollData ?? {}) : 0;
  if ( formula ) {
    if ( item.type === "uniqueAbility" ) {
      kp += sys.costs?.ua ?? total(sys, "kpCost.ua");
      const type = awakeningSlug(s.abilityType);
      if ( type ) kp += total(sys, `kpCost.ua.${type}`);
    }
    else kp += total(sys, "kpCost.maneuver");
    kp += total(sys, `kpCost.use.${slug}`);
  }
  const free = total(sys, `kpCost.useFree.${slug}`) > 0;
  if ( free ) kp = 0;
  kp = Math.max(0, Math.floor(kp));
  // (an Out-of-Sequence use spends no Action nor Counter Action: the effect that offered it pays what it says)
  const oos = !!actor._dbuOutOfSequence;
  const { actions, counters } = oos ? { actions: 0, counters: 0 } : actionCostOf(s.actionCost);
  const parts = [kp ? `ki:${kp}` : "", actions ? `actions:${actions}` : "", counters ? `counters:${counters}` : ""].filter(Boolean);
  if ( !parts.length && !free ) return null;
  return { kp, actions, counters, free, cost: parts.join("; ") };
}

/**
 * Before the item is used: the lines its card adds, or null when the use is refused (the cost cannot be paid in "pay").
 */
export async function payUseCost(actor, item) {
  let mode = "off";
  try { mode = globalThis.game?.settings?.get?.("dbu-rpg", "useCosts") ?? "off"; } catch(err) { mode = "off"; }
  // (only "show" and "pay" do anything: an unknown value is "off")
  if ( (mode !== "show") && (mode !== "pay") ) return [];
  const c = useCostOf(actor, item);
  if ( !c ) return [];
  const L = (k, d) => game.i18n.format(k, d ?? {});
  if ( !c.cost ) return [L("DBU.Use.Free")];
  const T = await import("./triggers.mjs");
  const plan = T.triggerCostPlan(actor, c.cost, {});
  if ( mode === "show" ) return [L("DBU.Use.Cost", { cost: plan.text || c.cost })];
  if ( plan.problems.length ) {
    ui.notifications.warn(L("DBU.Use.CantPay", { name: item.name, why: plan.problems.join(" ") }));
    return null;
  }
  const paid = await T.payTriggerCost(actor, plan);
  return paid ? [L("DBU.Use.Paid", { cost: paid })] : [];
}
