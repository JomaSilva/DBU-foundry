import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { safeUpdate } from "../socket.mjs";
import { encounterOf } from "./triggers.mjs";
import { adversaryPcc, playerCharacterCount } from "../rules/adversary.mjs";
import { isMinion } from "../fusion/fusion-rules.mjs";

/**
 * Villainous Maneuvers and Villainous Traits (dbu-rpg.com/adversaries). The Maneuvers are items of the maneuvers
 * compendium (system.villainous); the Traits are Racial Trait items named after the examples of the page, whose
 * modifiers come from the compendium and whose other effects are applied here, found by name.
 */
const { DialogV2 } = foundry.applications.api;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const FLAG = "dbu-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** The actor's item with that name, in use. */
export function traitOf(actor, name) {
  const wanted = name.toLowerCase();
  return actor?.items?.find(i => (i.name.trim().toLowerCase() === wanted) && (i.system?.isActive ?? true)) ?? null;
}

/* -------------------------------------------- */
/*  Frequency and cost of a Villainous Maneuver */
/* -------------------------------------------- */

function usesOf(item) {
  const combat = encounterOf(item.actor);
  const used = item.getFlag(FLAG, "uses") ?? {};
  const same = !!combat && (used.combat === combat.id);
  return { combat, inRound: (same && (used.round === combat.round)) ? (used.inRound ?? 0) : 0, inEncounter: same ? (used.inEncounter ?? 0) : 0 };
}

function frequencyProblem(item) {
  const { combat, inRound, inEncounter } = usesOf(item);
  if ( !combat ) return null;
  const f = item.system.frequency ?? "";
  const perRound = Number(/(\d+)\s*\/\s*Round/i.exec(f)?.[1] ?? 0);
  const perEncounter = Number(/(\d+)\s*\/\s*Encounter/i.exec(f)?.[1] ?? 0);
  if ( perRound && (inRound >= perRound) ) return L("DBU.God.RoundLimit", { name: item.name, n: perRound });
  if ( perEncounter && (inEncounter >= perEncounter) ) return L("DBU.God.EncounterLimit", { name: item.name, n: perEncounter });
  return null;
}

async function recordUse(item, delta = 1) {
  // E1: a use (not the refund of one) is counted and fires "maneuverUsed" (@villainous = 1)
  if ( delta > 0 ) {
    const { noteItemUse } = await import("./triggers.mjs");
    await noteItemUse(item.actor, item);
  }
  const { combat, inRound, inEncounter } = usesOf(item);
  if ( !combat ) return;
  await item.setFlag(FLAG, "uses", { combat: combat.id, round: combat.round, inRound: Math.max(0, inRound + delta),
    inEncounter: Math.max(0, inEncounter + delta) });
}

/**
 * Pay the Action Cost: Actions first, then Adversary Actions as if they were Actions. False when it cannot be paid.
 */
async function payActions(actor, n) {
  if ( !(n > 0) || !game.combat?.started ) return true;
  const c = actor.system.combat;
  const actions = c.actions ?? 0;
  const aa = actor.system.adversaryInfo?.oneManArmy ? (c.counters ?? 0) : 0;
  if ( (actions + aa) < n ) {
    ui.notifications.warn(L("DBU.Attack.ErrActions", { need: n, have: actions + aa }));
    return false;
  }
  const fromActions = Math.min(actions, n);
  await actor.update({ "system.combat.actions": actions - fromActions, "system.combat.counters": (c.counters ?? 0) - (n - fromActions) });
  return true;
}

/** Tokens of the viewed scene other than the actor's. */
const otherTokens = actor => (canvas?.ready ? canvas.tokens.placeables : []).filter(t => t.actor && (t.actor.uuid !== actor.uuid));

/** Pick one token (the targeted one first). */
async function pickToken(actor, title, filter = () => true) {
  const list = otherTokens(actor).filter(t => filter(t.actor));
  if ( !list.length ) {
    ui.notifications.warn(L("DBU.Villain.NoTarget"));
    return null;
  }
  const targeted = Array.from(game.user.targets ?? []).find(t => list.includes(t));
  if ( targeted && (list.length === 1 || targeted) ) return targeted;
  const uuid = await DialogV2.wait({
    window: { title },
    content: `<div class="dbu-dialog"><div class="form-group"><label>${L("DBU.Villain.Target")}</label><select name="t">
      ${list.map(t => `<option value="${t.document.uuid}">${esc(t.name)}</option>`).join("")}</select></div></div>`,
    buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), default: true, callback: (e, b) => b.form.elements.t.value },
      { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  return (uuid && (uuid !== "cancel")) ? list.find(t => t.document.uuid === uuid) : null;
}

/** Player Characters of the scene: non-Minion Characters controlled by a player. */
const playerTokens = actor => otherTokens(actor).filter(t => t.actor.hasPlayerOwner && !isMinion(t.actor) && (t.actor.type !== "adversary"));

/**
 * Legend Realized: 2(T)d10 + Power Level back in Life and Ki Points (twice with Narrative Transformation), with the
 * "legend.bonus" / "legend.mult" modifiers; no Life Points with "flag.noLifeRegain".
 */
export async function applyLegendRealized(actor, label) {
  const T = actor.system.top.current;
  const formula = actor.legendRealizedFormula?.() ?? `${2 * T}d10 + ${actor.system.pl}`;
  const r = await new Roll(formula).evaluate();
  let amount = r.total;
  const doubled = await narrativeDouble(actor);
  if ( doubled ) amount *= 2;
  amount = Math.floor(amount * (actor.legendRealizedMult?.() ?? 1));
  await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Legend Realized — ${label}` });
  const sys = actor.system;
  const noLife = !!sys.flags?.noLifeRegain;
  await actor.update({ ...(noLife ? {} : { "system.life.value": Math.min(sys.life.max, sys.life.value + amount) }),
    "system.ki.value": Math.min(sys.ki.max, sys.ki.value + amount) });
  const text = L(doubled ? "DBU.Villain.LegendDouble" : "DBU.Trans.LegendRealized", { n: amount });
  return noLife ? `${text} ${L("DBU.Life.NoRegain")}` : text;
}

/** Remove every Combat Condition except some. */
async function clearConditions(actor, keep = []) {
  const upd = {};
  const keys = Object.keys(DBU.conditions).filter(k => !keep.includes(k) && (actor.system.conditions[k] > 0));
  for ( const k of keys ) upd[`system.conditions.${k}`] = 0;
  // (update() adds an _id to the object it is given)
  if ( keys.length ) await actor.update(upd);
  for ( const k of keys ) await actor.toggleStatusEffect(k, { active: false }).catch(() => null);
  return keys.length;
}

/** Enter one of the actor's Forms or Enhancements as an Out-of-Sequence Maneuver (E3: not one its rules keep you out of). */
export async function transformOutOfSequence(actor, title) {
  const { enterProblems } = await import("../rules/transform-rules.mjs");
  const list = actor.items.filter(i => (i.type === "transformation") && ["form", "enhancement"].includes(i.system.transType) && !i.system.active
    && !enterProblems(actor, i).length);
  if ( !list.length ) return null;
  const id = await DialogV2.wait({
    window: { title },
    content: `<div class="dbu-dialog"><div class="form-group"><label>${L("DBU.God.Form")}</label><select name="id">
      <option value="">—</option>${list.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select></div></div>`,
    buttons: [{ action: "ok", label: L("DBU.Trans.Enter"), default: true, callback: (e, b) => b.form.elements.id.value },
      { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  const item = (id && (id !== "cancel")) ? actor.items.get(id) : null;
  return item ? actor.transform(item) : null;
}

/* -------------------------------------------- */
/*  Villainous Maneuvers                        */
/* -------------------------------------------- */

/** Use a Villainous Maneuver from the sheet. */
export async function useVillainousManeuver(actor, item) {
  if ( actor.type !== "adversary" ) {
    const ok = await DialogV2.confirm({ window: { title: item.name }, content: `<p>${L("DBU.Villain.NotAdversary")}</p>`, rejectClose: false });
    if ( !ok ) return null;
  }
  const limit = frequencyProblem(item);
  if ( limit ) return ui.notifications.warn(limit);
  const key = item.name.replace(/[“”"]/g, "").trim().toLowerCase();
  const actions = Number(/^(\d+)/.exec(item.system.actionCost ?? "")?.[1] ?? 0);
  const card = (lines, extra = {}) => postInfoCard({ actor, title: item.name, subtitle: L("DBU.Villain.Maneuver"), img: item.img, lines, ...extra });
  switch ( key ) {
    case "1-on-1 duel": {
      const token = await pickToken(actor, item.name, a => a.hasPlayerOwner);
      if ( !token ) return null;
      await recordUse(item);
      await actor.setFlag(FLAG, "oneOnOne", { target: token.actor.uuid, name: token.name, combat: encounterOf(actor)?.id ?? null, itemId: item.id, asked: true });
      return card([L("DBU.Villain.DuelAsk", { name: actor.name, other: token.name })], {
        buttons: [
          { action: "villainOneOnOne", label: L("DBU.Villain.DuelAccept"), icon: "fa-solid fa-handshake", actorUuid: actor.uuid, payload: JSON.stringify({ accept: true }) },
          { action: "villainOneOnOne", label: L("DBU.Villain.DuelRefuse"), icon: "fa-solid fa-xmark", actorUuid: actor.uuid, payload: JSON.stringify({ accept: false }) }
        ] });
    }
    case "insta-kill": {
      const token = await pickToken(actor, item.name, a => isMinion(a) || /buddy/i.test(a.name));
      if ( !token ) return null;
      if ( !(await payActions(actor, actions || 2)) ) return null;
      await recordUse(item);
      await safeUpdate(token.actor, { "system.life.value": 0 });
      await token.actor.toggleStatusEffect?.(CONFIG.specialStatusEffects.DEFEATED, { active: true, overlay: true }).catch(() => null);
      return card([L("DBU.Villain.InstaKill", { name: token.name }), L("DBU.Villain.Exploitable")]);
    }
    case "area wipe": {
      if ( !(await payActions(actor, actions || 2)) ) return null;
      await recordUse(item);
      // Every other Character of the Battlefield, Hidden or far away
      const all = otherTokens(actor);
      canvas.tokens.setTargets(all.map(t => t.id), { mode: "replace" });
      await card([L("DBU.Villain.AreaWipe"), L("DBU.Villain.Exploitable")]);
      const { openAttackDialog } = await import("./attack.mjs");
      return openAttackDialog(actor, { profile: "simple", outOfSequence: true });
    }
    case "planet burst": {
      if ( !(await payActions(actor, actions || 3)) ) return null;
      const sys = actor.system;
      // Its Ki Point Cost is the Narrative Stamina (spent from it)
      const stamina = sys.adversary?.stamina ?? 0;
      await recordUse(item);
      if ( stamina ) await actor.update({ "system.adversary.stamina": 0 });
      const pcc = adversaryPcc(actor).pcc;
      const targets = playerTokens(actor);
      const { executeAttack } = await import("./attack.mjs");
      const foundation = (sys.attributes.ma.mod > sys.attributes.fo.mod) ? "magic" : "energy";
      return executeAttack(actor, { profile: "megaFlare", foundation, targets, forced: {
        charges: pcc, powerShot: Math.floor(pcc / 2), name: item.name, duelOnly: true, kp: stamina,
        note: L("DBU.Villain.PlanetBurst", { kp: stamina, pcc, ps: Math.floor(pcc / 2) })
      } });
    }
    case "time to get serious": {
      if ( (actor.system.karma.value ?? 0) < 1 ) return ui.notifications.warn(L("DBU.Villain.NoKarma"));
      await recordUse(item);
      await actor.update({ "system.karma.value": actor.system.karma.value - 1 });
      const n = await clearConditions(actor, ["suffocating"]);
      const lines = [L("DBU.Villain.Serious", { n })];
      const { endGrapple, grappleOf } = await import("./grapple.mjs");
      if ( grappleOf(actor)?.role === "grappled" ) {
        await endGrapple(actor);
        lines.push(L("DBU.Villain.GrappleEnded"));
      }
      lines.push(await applyLegendRealized(actor, item.name));
      return card(lines);
    }
    case "act again": {
      const combat = encounterOf(actor);
      if ( !combat ) return ui.notifications.warn(L("DBU.Villain.NoCombat"));
      await recordUse(item);
      return actAgain(actor, combat, item);
    }
    case "get up!":
    case "get up": {
      const token = await pickToken(actor, item.name, a => (a.system?.life?.value ?? 1) <= 0
        || a.statuses?.has(CONFIG.specialStatusEffects.DEFEATED));
      if ( !token ) return null;
      if ( !(await payActions(actor, actions || 1)) ) return null;
      await recordUse(item);
      const t = token.actor;
      await safeUpdate(t, { "system.life.value": Math.floor(t.system.life.max / 10), "system.combat.willToSurviveUsed": true });
      await t.toggleStatusEffect?.(CONFIG.specialStatusEffects.DEFEATED, { active: false }).catch(() => null);
      await actor.setFlag(FLAG, "getUp", { target: t.uuid, name: token.name });
      return card([L("DBU.Villain.GetUp", { name: token.name, n: Math.floor(t.system.life.max / 10) })]);
    }
    case "face me at full power": {
      await recordUse(item);
      const n = await clearConditions(actor, ["pinned", "suffocating"]);
      await card([L("DBU.Villain.FullPower", { n })]);
      return transformOutOfSequence(actor, item.name);
    }
    case "stop wasting my time": {
      const token = await pickToken(actor, item.name);
      if ( !token ) return null;
      await recordUse(item);
      return card([L("DBU.Villain.StopWasting", { name: token.name })], { buttons: [
        { action: "villainLegend", label: L("DBU.Villain.ApplyLegend"), icon: "fa-solid fa-star", actorUuid: actor.uuid, payload: JSON.stringify({ name: item.name }) }
      ] });
    }
    default: {
      // A Villainous Maneuver the system has no flow for: its card, and the use counted
      const done = await item.toChat({ used: true });
      await recordUse(item);
      return done;
    }
  }
}

/** Button of the 1-on-1 Duel card: the Player Character agrees (or not). */
export async function answerOneOnOne(actor, accept) {
  const duel = actor?.getFlag(FLAG, "oneOnOne");
  if ( !duel?.asked ) return;
  if ( !accept ) {
    await safeUpdate(actor, { [`flags.${FLAG}.-=oneOnOne`]: null });
    return postInfoCard({ actor, title: "1-on-1 Duel", lines: [L("DBU.Villain.DuelRefused", { name: duel.name })] });
  }
  await safeUpdate(actor, { [`flags.${FLAG}.oneOnOne`]: { ...duel, asked: false, active: true } });
  return postInfoCard({ actor, title: "1-on-1 Duel", lines: [L("DBU.Villain.DuelOn", { name: actor.name, other: duel.name })] });
}

/** The 1-on-1 Duel ends when someone else targets one of the two with a Maneuver. */
export async function oneOnOneTargeted(attacker, targetActors) {
  for ( const adv of [attacker, ...targetActors] ) {
    const d = adv?.getFlag?.(FLAG, "oneOnOne");
    if ( !d?.active ) continue;
    const pair = new Set([adv.uuid, d.target]);
    const intruder = !pair.has(attacker.uuid) || targetActors.some(t => !pair.has(t.uuid));
    if ( intruder && targetActors.some(t => pair.has(t.uuid)) ) {
      await safeUpdate(adv, { [`flags.${FLAG}.-=oneOnOne`]: null });
      await postInfoCard({ actor: adv, title: "1-on-1 Duel", lines: [L("DBU.Villain.DuelBroken", { name: adv.name })] });
    }
  }
}

/** Defeating the Player Character of a 1-on-1 Duel: 1/4 of their maximums back, and the Maneuver again. */
export async function oneOnOneDefeated(attacker, target) {
  const d = attacker?.getFlag?.(FLAG, "oneOnOne");
  if ( !d?.active || (d.target !== target.uuid) ) {
    // Whoever else defeats that Player Character ends the 1-on-1 Duel too
    return;
  }
  const t = target.system;
  const sys = attacker.system;
  // "flag.noLifeRegain": only the Ki Points
  const noLife = !!sys.flags?.noLifeRegain;
  await attacker.update({ ...(noLife ? {} : { "system.life.value": Math.min(sys.life.max, sys.life.value + Math.ceil(t.life.max / 4)) }),
    "system.ki.value": Math.min(sys.ki.max, sys.ki.value + Math.ceil(t.ki.max / 4)) });
  await attacker.unsetFlag(FLAG, "oneOnOne");
  const item = attacker.items.get(d.itemId);
  if ( item ) await recordUse(item, -1);
  await postInfoCard({ actor: attacker, title: "1-on-1 Duel", lines: [L("DBU.Villain.DuelWon", { name: attacker.name, other: target.name,
    life: Math.ceil(t.life.max / 4), ki: Math.ceil(t.ki.max / 4) }), ...(noLife ? [L("DBU.Life.NoRegain")] : [])] });
}

/** Get Up!: that Opponent cannot be targeted by the Adversary's attacks until the end of their next turn. */
export function getUpProblem(attacker, targetActors) {
  const g = attacker?.getFlag?.(FLAG, "getUp");
  if ( !g ) return null;
  const hit = targetActors.find(t => t.uuid === g.target);
  return hit ? L("DBU.Villain.GetUpBlock", { name: g.name }) : null;
}

/** End of a turn: the Get Up! restriction of that Character ends. */
export async function getUpTurnEnded(combat, actor) {
  for ( const c of combat?.combatants ?? [] ) {
    const g = c.actor?.getFlag?.(FLAG, "getUp");
    if ( g && (g.target === actor?.uuid) ) await c.actor.unsetFlag(FLAG, "getUp");
  }
}

/* -------------------------------------------- */
/*  Act Again: an extra turn                    */
/* -------------------------------------------- */

/**
 * Act Again: an extra turn right after the Character who just ended theirs (an extra combatant placed before the
 * current one). In it, no normal Actions: the Adversary Actions are spent as Actions.
 */
async function actAgain(actor, combat, item) {
  const current = combat.combatant;
  const token = actor.getActiveTokens()[0]?.document ?? null;
  const init = (current?.initiative ?? 0) + 0.001;
  const [extra] = await combat.createEmbeddedDocuments("Combatant", [{
    actorId: actor.id, tokenId: token?.id ?? null, sceneId: token?.parent?.id ?? null, initiative: init,
    flags: { [FLAG]: { actAgain: true } }
  }]);
  // The Character whose turn it was already had the start of it: it is not repeated when the extra turn ends
  if ( current ) await combat.setFlag(FLAG, "actAgainResume", current.id);
  const index = combat.turns.findIndex(c => c.id === extra.id);
  // Going back one turn starts no turn in Foundry: the extra turn is started here
  if ( index >= 0 ) {
    await combat.update({ turn: index });
    await actAgainTurnStart(combat.combatants.get(extra.id));
  }
  return postInfoCard({ actor, title: item.name, subtitle: L("DBU.Villain.Maneuver"), lines: [L("DBU.Villain.ActAgain", { name: actor.name })] });
}

/** Start of an Act Again turn: Adversary Actions become the Actions of this turn. */
export async function actAgainTurnStart(combatant) {
  if ( !combatant?.getFlag(FLAG, "actAgain") || combatant.getFlag(FLAG, "saved") ) return;
  const actor = combatant.actor;
  if ( !actor ) return;
  const c = actor.system.combat;
  await combatant.setFlag(FLAG, "saved", { actions: c.actions ?? 0 });
  // (Act Again: the Adversary Actions become this turn's Actions; no Counter Action is spent)
  await actor.update({ "system.combat.actions": c.counters ?? 0, "system.combat.counters": 0 }, { dbuNoSpend: true });
}

/** End of an Act Again turn: the Adversary Actions left go back, and the extra combatant leaves. */
export async function actAgainTurnEnd(combatant) {
  if ( !combatant?.getFlag(FLAG, "actAgain") ) return;
  const actor = combatant.actor;
  const saved = combatant.getFlag(FLAG, "saved");
  if ( actor && saved ) {
    await actor.update({ "system.combat.counters": actor.system.combat.actions ?? 0, "system.combat.actions": saved.actions });
  }
  // Removed after the turn change settles
  setTimeout(() => combatant.delete().catch(() => null), 50);
}

/* -------------------------------------------- */
/*  Villainous Traits                           */
/* -------------------------------------------- */

/** Narrative Transformation (2) [1/Encounter]: Legend Realized gives twice the Life and Ki Points. */
export async function narrativeDouble(actor) {
  const t = traitOf(actor, "Narrative Transformation");
  const combat = encounterOf(actor);
  if ( !t || !combat || (t.getFlag(FLAG, "doubled") === combat.id) ) return false;
  await t.setFlag(FLAG, "doubled", combat.id);
  return true;
}

/** Narrative Transformation (1): the Form or Transformation Line chosen needs no Stress Test (when used alone). */
export function narrativeFree(actor, item) {
  const t = traitOf(actor, "Narrative Transformation");
  const choice = String(t?.system.choice ?? "").trim().toLowerCase();
  if ( !choice ) return false;
  const others = actor.system.transformation.active.filter(i => i.id !== item.id);
  const matches = (item.name.toLowerCase() === choice) || (String(item.system.line ?? "").toLowerCase() === choice);
  return matches && !others.length;
}

/** Second Phase (1): the Transformation with the highest Tier of Power Requirement waits for its 2nd effect. */
export function secondPhaseLocked(actor, item) {
  const t = traitOf(actor, "Second Phase");
  if ( !t || t.getFlag(FLAG, "triggered") ) return false;
  const all = actor.items.filter(i => (i.type === "transformation") && (i.system.transType !== "awakening"));
  const top = Math.max(0, ...all.map(i => i.system.topReq ?? 0));
  return (item.system.topReq ?? 0) >= top;
}

/** Statstick (3): no Unique Abilities nor Special Maneuvers (except Soar). */
export function statstickBlocks(actor, item) {
  if ( !traitOf(actor, "Statstick") ) return false;
  if ( item.type === "uniqueAbility" ) return true;
  if ( item.type !== "maneuver" ) return false;
  // Special Maneuvers are the ones of that page of the rules (the basic, God and Villainous ones are still allowed)
  const slug = item.system.source?.slug ?? item.getFlag?.(FLAG, "slug") ?? "";
  return (slug === "special-maneuvers") && !/^soar( maneuver)?$/i.test(item.name.trim());
}

/** Health Thresholds crossed: Desperate Adversary (2), Dauntless (3), Second Phase (2). */
export async function villainousThresholds(actor, crossed, defeated) {
  const lines = [];
  if ( traitOf(actor, "Desperate Adversary") && crossed.length ) {
    await actor.update({ "system.combat.counters": (actor.system.combat.counters ?? 0) + crossed.length });
    lines.push(L("DBU.Villain.Desperate", { n: crossed.length }));
  }
  if ( traitOf(actor, "Dauntless") && crossed.length ) {
    const loss = (actor.getFlag(FLAG, "maxLifeLoss") ?? 0) + (crossed.length * Math.ceil((actor.system.life.max + (actor.system.maxLifeLoss ?? 0)) / 4));
    await actor.setFlag(FLAG, "maxLifeLoss", loss);
    lines.push(L("DBU.Villain.Dauntless", { n: loss }));
  }
  const second = traitOf(actor, "Second Phase");
  if ( defeated && second && !second.getFlag(FLAG, "triggered") ) {
    await second.setFlag(FLAG, "triggered", true);
    const half = Math.max(1, Math.floor(actor.system.life.max / 2));
    await actor.update({ "system.life.value": half });
    await actor.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: false }).catch(() => null);
    lines.push(L("DBU.Villain.SecondPhase", { name: actor.name, n: half }));
    await postInfoCard({ actor, title: "Second Phase", lines });
    return transformOutOfSequence(actor, "Second Phase");
  }
  if ( lines.length ) await postInfoCard({ actor, title: L("DBU.Villain.Traits"), lines });
  return null;
}

/** Uses of a Villainous Trait from the sheet: Arrogant and Unstoppable (2), Narrative Transformation (1), Wild Swings. */
export async function useVillainousTrait(actor, item) {
  const key = item.name.trim().toLowerCase();
  if ( key === "arrogant and unstoppable" ) {
    // [Triggered/Power, 1/Encounter]: treated as Healthy until the start of the next turn
    // In the Healthy Health Threshold for all of its effects (its 1st effect, Desperate Adversary...) until its next turn
    const combat = encounterOf(actor);
    if ( !combat ) return ui.notifications.warn(L("DBU.Villain.NoCombat"));
    if ( item.getFlag(FLAG, "used") === combat.id ) return ui.notifications.warn(L("DBU.God.EncounterLimit", { name: item.name, n: 1 }));
    await item.setFlag(FLAG, "used", combat.id);
    const { addTimedFlag } = await import("./triggers.mjs");
    await addTimedFlag(actor, "asHealthy", { duration: "startOfNextTurn", label: item.name });
    return postInfoCard({ actor, title: item.name, lines: [L("DBU.Villain.Arrogant")] });
  }
  if ( key === "narrative transformation" ) {
    const list = actor.items.filter(i => (i.type === "transformation") && ["form", "enhancement"].includes(i.system.transType));
    const names = [...new Set([...list.map(i => i.name), ...list.map(i => i.system.line).filter(Boolean)])];
    const choice = await DialogV2.wait({
      window: { title: item.name },
      content: `<div class="dbu-dialog"><p>${L("DBU.Villain.NarrativeHint")}</p><div class="form-group"><select name="c">
        ${names.map(n => `<option value="${esc(n)}" ${n === item.system.choice ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div></div>`,
      buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), default: true, callback: (e, b) => b.form.elements.c.value },
        { action: "cancel", label: L("Cancel") }],
      rejectClose: false
    });
    if ( choice && (choice !== "cancel") ) await item.update({ "system.choice": choice });
    return null;
  }
  return item.toChat();
}

/** Wild Swings (2) [2/Round]: Absolute Attacks left this Combat Round (null without the Trait). */
export function wildSwingsLeft(actor) {
  if ( !traitOf(actor, "Wild Swings") ) return null;
  return Math.max(0, 2 - (actor.system.combat.absoluteAttacks ?? 0));
}

export { playerCharacterCount };
