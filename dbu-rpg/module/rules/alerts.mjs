import { DBU } from "../config.mjs";

/**
 * Situational reminders shown at the top of the sheet: tests the rules demand only in some situations
 * (Stress Test after a failed Steadfast while transformed, Steadfast on reaching a Health Threshold...).
 * Each alert: { level: "urgent"|"warning"|"info", key, message, action?, actionLabel?, icon? }
 */
export function computeAlerts(sys, actor) {
  const out = [];
  const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
  const add = (level, key, message, action = null, actionLabel = null, icon = null) =>
    out.push({ level, key, message, action, actionLabel, icon });
  const cond = sys.effectiveConditions;
  const states = sys._effectiveStates ?? sys.states;
  const transformed = sys.transformation.active.length > 0;
  const pending = new Set(sys.pending ?? []);
  const inCombat = !!game.combat?.started && game.combat.combatants.some(c => c.actor?.uuid === actor.uuid);

  /* ----- Mandatory tests ----- */
  if ( pending.has("stressTest") ) {
    add("urgent", "stressTest", L("DBU.Alert.StressPending"), "stressTest", L("DBU.Roll.Stress"), "fa-solid fa-bolt");
  }
  for ( const k of DBU.thresholds ) {
    if ( inCombat && sys.health.below[k] && !sys.thresholds[k] && !sys.health.defeated ) {
      add("urgent", `steadfast:${k}`, L("DBU.Alert.SteadfastPending", { t: L(`DBU.Threshold.${k}`) }),
        `steadfast:${k}`, L("DBU.Roll.Steadfast"), "fa-solid fa-dice-d10");
    }
  }
  if ( transformed && (sys.ki.value <= 0) ) add("urgent", "noKi", L("DBU.Alert.NoKi"), "noKi", L("DBU.Alert.ApplyNoKi"), "fa-solid fa-power-off");
  if ( transformed && sys.flags.straining && inCombat ) add("warning", "straining", L("DBU.Alert.Straining"), "stressTest", L("DBU.Roll.Stress"), "fa-solid fa-bolt");
  if ( transformed && (sys.health.failed > 0) && !pending.has("stressTest") && sys.thresholds.critical === "fail" ) {
    add("info", "stressInfo", L("DBU.Alert.StressInfo"));
  }

  /* ----- Defeat and survival ----- */
  if ( sys.health.defeated ) {
    add("urgent", "defeated", L("DBU.Alert.Defeated", { karma: sys.karma.value }));
  }
  if ( (states.undying > 0) && (sys.life.value < 0) ) add("urgent", "undying", L("DBU.Alert.UndyingNegative"));

  /* ----- Conditions that ask for an action ----- */
  if ( cond.prone ) add("warning", "prone", L("DBU.Alert.Prone"), "standUp", L("DBU.Alert.StandUp"), "fa-solid fa-person-arrow-up-from-line");
  if ( cond.pinned ) add("warning", "pinned", L("DBU.Alert.Pinned"), "mightClash", "Might Clash", "fa-solid fa-dumbbell");
  if ( cond.compelled ) add("warning", "compelled", L("DBU.Alert.Compelled"));
  if ( cond.sleeping ) add("warning", "sleeping", L("DBU.Alert.Sleeping"));
  if ( cond.slowed >= 3 ) add("urgent", "slowed3", L("DBU.Alert.Slowed3"));
  if ( cond.stressExhaustion ) add("warning", "stressExhaustion", L("DBU.Alert.StressExhaustion"));
  if ( cond.poisoned ) add("warning", "poisoned", L("DBU.Alert.Poisoned", { n: Math.floor(sys.life.max / 10) }));
  if ( cond.suffocating ) add("warning", "suffocating", L("DBU.Alert.Suffocating", { n: Math.floor(sys.life.max / 5) }));
  if ( cond.fatigued ) add("info", "fatigued", L("DBU.Alert.Fatigued", { n: cond.fatigued }));
  if ( cond.staggered ) add("info", "staggered", L("DBU.Alert.Staggered"));
  if ( cond.blinded ) add("info", "blinded", L("DBU.Alert.Blinded"));

  /* ----- Stacks waiting for a Combat Roll (Battle Born, Progress...) ----- */
  for ( const r of sys.resources ?? [] ) {
    if ( r.split && (r.unassigned > 0) ) {
      add("urgent", `allocate:${r.name}`, L("DBU.Alert.Allocate", { n: r.unassigned, name: r.name }), `allocate:${r.name}`,
        L("DBU.Alert.AllocateButton"), "fa-solid fa-hand-pointer");
    }
  }

  /* ----- Ongoing effects ----- */
  if ( (sys.combat.energyCharges ?? 0) > 0 ) add("warning", "charging", L("DBU.Alert.Charging", { n: sys.combat.energyCharges }));
  if ( (sys.combat.power ?? 0) > 0 ) add("info", "power", L("DBU.Alert.Power", { n: sys.combat.power }));
  if ( (sys.combat.dot ?? 0) > 0 || (sys.dotMin ?? 0) > 0 ) add("warning", "dot", L("DBU.Alert.Dot", { n: Math.max(sys.combat.dot, sys.dotMin ?? 0) * sys.top.base }));
  if ( sys.costs.draining > 0 ) add("warning", "draining", L("DBU.Alert.Draining", { n: 3 * Math.max(1, sys.transformation.highestTopReq) * sys.costs.draining }));
  if ( sys.transformation.active.some(t => t.system.aspects.some(a => a.key === "rampaging")) ) add("warning", "rampaging", L("DBU.Alert.Rampaging"));
  if ( sys.transformation.active.some(t => t.system.aspects.some(a => a.key === "limited")) ) add("info", "limited", L("DBU.Alert.Limited"));
  if ( sys.health.combatPenalty ) add("info", "thresholdPenalty", L("DBU.ThresholdPenaltyLine", { combat: sys.health.combatPenalty, stress: sys.health.stressPenalty }));
  if ( (sys.combat.holdingBack ?? 0) >= sys.top.base ) add("info", "holdingBack", L("DBU.Alert.HoldingBackMax"));
  if ( (sys.gravityIntensity ?? 0) >= 2 ) add("warning", "gravity", L(sys.gravityIntensity >= 3 ? "DBU.Alert.Gravity3" : "DBU.Alert.Gravity2", { gi: sys.gravityIntensity }));
  if ( (states.surging > 0) ) add("info", "surging", L("DBU.Alert.Surging"));
  if ( (states.determined > 0) ) add("warning", "determined", L("DBU.Alert.Determined"));

  /* ----- Opportunities ----- */
  if ( inCombat ) {
    if ( !sys.combat.surgeUsed ) add("info", "surge", L("DBU.Alert.SurgeAvailable"));
    const ult = actor.items.filter(i => (i.type === "signature") && ["ultimate", "finisher"].includes(i.system.level) && !i.system.usedThisEncounter);
    if ( ult.length && (sys.health.count > 0) ) add("info", "ultimate", L("DBU.Alert.Ultimate", { n: sys.health.count }));
    if ( (sys.combat.dimDefense ?? 0) > 0 ) add("info", "dimDefense", L("DBU.Alert.DimDefense", { n: sys.combat.dimDefense }));
  }
  return out;
}
