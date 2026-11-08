import { applyAttackDamage, knockbackTarget, retargetAttack, rollDefense, rollWound } from "./combat/attack.mjs";
import { applyTriggerEffect } from "./combat/triggers.mjs";

/** Wire the buttons of DBU chat cards. */
export function onRenderChatMessage(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if ( !root ) return;
  for ( const button of root.querySelectorAll("[data-dbu-action]") ) {
    button.addEventListener("click", event => onCardButton(event, message));
  }
  // Hide defense buttons from users who do not own the target, wound/retarget from non-attackers
  const attack = message.getFlag("dbu-rpg", "attack");
  if ( attack ) {
    const attacker = fromUuidSync(attack.attackerUuid);
    if ( attacker && !attacker.isOwner ) {
      root.querySelectorAll("[data-dbu-action='wound'], [data-dbu-action='retarget'], [data-dbu-action='knockback']").forEach(b => b.remove());
    }
    root.querySelectorAll("[data-dbu-action='defense'], [data-dbu-action='duel']").forEach(b => {
      const t = attack.targets?.[Number(b.dataset.index)];
      const doc = t?.tokenUuid ? fromUuidSync(t.tokenUuid) : (t?.actorUuid ? fromUuidSync(t.actorUuid) : null);
      const actor = doc?.actor ?? doc;
      if ( actor && !actor.isOwner ) b.remove();
      // Divine Flex: only for a defender in the God Ki State who has that God Maneuver
      else if ( (b.dataset.mode === "divineFlex") && !(actor?.system?.dkp?.usable
        && actor.items.some(i => (i.type === "maneuver") && i.system.god && /flex/i.test(i.name))) ) b.remove();
    });
  }
  // Duel Maneuver: each side's owner sets its own Ki Wager
  if ( message.getFlag("dbu-rpg", "duel") ) {
    root.querySelectorAll("[data-dbu-action='duelWager'], [data-dbu-action='duelEscape']").forEach(b => {
      if ( !game.user.isGM && !fromUuidSync(b.dataset.actorUuid)?.isOwner ) b.remove();
    });
  }
  // Scan: only the scanned Character's owner answers (Concealment or let the reading through)
  const scan = message.getFlag("dbu-rpg", "scan");
  if ( scan && !fromUuidSync(scan.targetUuid)?.isOwner ) {
    root.querySelectorAll("[data-dbu-action='scanResist'], [data-dbu-action='scanAccept']").forEach(b => b.remove());
  }
  // A Scouter's Craft DC is told by its owner (or the GM); only the GM undoes the Scouters a Power Up destroyed
  const ask = message.getFlag("dbu-rpg", "scouterAsk");
  if ( ask && !game.user.isGM && !fromUuidSync(ask.itemUuid)?.isOwner ) {
    root.querySelectorAll("[data-dbu-action='scouterDc']").forEach(b => b.remove());
  }
  if ( !game.user.isGM ) root.querySelectorAll("[data-dbu-action='scouterUndo']").forEach(b => b.remove());
  // Only the GM decides whether a Level 1 Temporary Awakening stays
  if ( !game.user.isGM ) root.querySelectorAll("[data-dbu-action='awakKeep'], [data-dbu-action='awakDrop']").forEach(b => b.remove());
}

async function onCardButton(event, message) {
  event.preventDefault();
  const button = event.currentTarget;
  const { dbuAction, index, mode, actorUuid } = button.dataset;
  button.disabled = true;
  try {
    switch ( dbuAction ) {
      case "defense": await rollDefense(message, Number(index), mode); break;
      case "wound": await rollWound(message); break;
      case "damage": await applyAttackDamage(message, Number(index)); break;
      case "knockback": await knockbackTarget(message, Number(index)); break;
      case "retarget": await retargetAttack(message); break;
      case "duel": {
        const { startDuel } = await import("./combat/duel.mjs");
        await startDuel(message, Number(index));
        break;
      }
      case "duelWager": {
        const { commitDuelWager } = await import("./combat/duel.mjs");
        await commitDuelWager(message, button.dataset.side, button.dataset.helper ?? "");
        break;
      }
      case "villainOneOnOne":
      case "villainLegend": {
        const actor = await fromUuid(actorUuid);
        const p = JSON.parse(button.dataset.payload || "{}");
        const V = await import("./combat/villainous.mjs");
        if ( dbuAction === "villainOneOnOne" ) {
          // The challenged Player Character's owner (or the GM) answers
          const asked = actor?.getFlag("dbu-rpg", "oneOnOne");
          if ( !game.user.isGM && !fromUuidSync(asked?.target ?? "")?.isOwner ) {
            ui.notifications.warn(game.i18n.localize("DBU.Villain.GmAnswers"));
            break;
          }
          await V.answerOneOnOne(actor, !!p.accept);
          button.closest(".dbu-card-buttons")?.remove();
          return;
        }
        if ( !actor?.isOwner ) { ui.notifications.warn(game.i18n.localize("DBU.Notify.NotOwner")); break; }
        const text = await V.applyLegendRealized(actor, p.name ?? "Legend Realized");
        await (await import("./dice/roller.mjs")).postInfoCard({ actor, title: p.name ?? "Legend Realized", lines: [text] });
        button.remove();
        return;
      }
      case "duelEscape": {
        const { escapeDuel } = await import("./combat/duel.mjs");
        await escapeDuel(message);
        break;
      }
      case "duelJoin": {
        const { joinDuel } = await import("./combat/duel.mjs");
        await joinDuel(message);
        break;
      }
      case "scanResist":
      case "scanAccept": {
        const { resolveScan } = await import("./combat/scan.mjs");
        await resolveScan(message, dbuAction === "scanResist");
        break;
      }
      case "scouterDc":
      case "scouterUndo": {
        const S = await import("./combat/scan.mjs");
        const done = (dbuAction === "scouterDc")
          ? await S.answerScouterDc(message, JSON.parse(button.dataset.payload || "{}").dc)
          : await S.undoScouterBreak(message);
        // Until the new card arrives (through the GM for a player), the question cannot be answered twice
        if ( done ) button.closest(".dbu-card-buttons")?.remove();
        return;
      }
      case "awakKeep":
      case "awakDrop": {
        const { resolveKeep } = await import("./combat/awakening.mjs");
        if ( await resolveKeep(message, dbuAction === "awakKeep") ) button.closest(".dbu-card-buttons")?.remove();
        return;
      }
      case "updateTransformations":
      case "skipTransformationUpdate": {
        const update = await import("./compendium-update.mjs");
        if ( dbuAction === "updateTransformations" ) await update.applyTransformationUpdates();
        else await update.skipTransformationUpdate();
        button.closest(".dbu-card-buttons")?.remove();
        return;
      }
      case "stressTest": {
        const actor = await fromUuid(actorUuid);
        if ( actor?.isOwner ) await actor.rollStressTest();
        else ui.notifications.warn(game.i18n.localize("DBU.Notify.NotOwner"));
        break;
      }
      // P: an Opponent left your Melee Range: an attack made through the Exploit Maneuver, that one targeted
      case "exploitMove": {
        const actor = await fromUuid(actorUuid);
        if ( !actor?.isOwner ) { ui.notifications.warn(game.i18n.localize("DBU.Notify.NotOwner")); break; }
        const doc = await fromUuid(JSON.parse(button.dataset.payload || "{}").tokenUuid ?? "").catch(() => null);
        if ( doc?.object ) doc.object.setTarget(true, { releaseOthers: true, groupSelection: false });
        await actor.attack({ via: "exploit" });
        break;
      }
      // E1: the "Use" button of a Maneuver / Unique Ability / item card
      case "useItem": {
        const actor = await fromUuid(actorUuid);
        if ( !actor?.isOwner ) { ui.notifications.warn(game.i18n.localize("DBU.Notify.NotOwner")); break; }
        const item = actor.items.get(JSON.parse(button.dataset.payload || "{}").itemId);
        if ( item ) await item.use();
        break;
      }
      // E3: an Awakening's Grand Trigger is met: its Full Awakening Maneuver
      case "fullAwakening": {
        const actor = await fromUuid(actorUuid);
        if ( !actor?.isOwner ) { ui.notifications.warn(game.i18n.localize("DBU.Notify.NotOwner")); break; }
        const item = actor.items.get(JSON.parse(button.dataset.payload || "{}").itemId);
        if ( !item ) break;
        const { fullAwakening } = await import("./combat/trait-actions.mjs");
        if ( await fullAwakening(actor, item) ) button.remove();
        break;
      }
      case "burstLimit": {
        const actor = await fromUuid(actorUuid);
        if ( !actor?.isOwner ) { ui.notifications.warn(game.i18n.localize("DBU.Notify.NotOwner")); break; }
        const p = JSON.parse(button.dataset.payload || "{}");
        const item = actor.items.get(p.itemId);
        if ( !item ) break;
        const { triggerBurstLimit } = await import("./combat/trait-actions.mjs");
        await triggerBurstLimit(actor, item, p.trait);
        break;
      }
      case "applyTrigger": {
        const actor = await fromUuid(actorUuid);
        if ( !actor?.isOwner ) { ui.notifications.warn(game.i18n.localize("DBU.Notify.NotOwner")); break; }
        const p = JSON.parse(button.dataset.payload || "{}");
        const T = await import("./combat/triggers.mjs");
        // On the other Character of the event (whom you hit...): through the GM when it is not yours. Checked before the
        // use is counted and its cost paid. "targeted" (B3): the clicking user's target. A mark (B1) lives on the button's
        // actor (the marker), so it never needs the marked Character's owner
        let who = p.targeted ? T.currentTarget(actor) : (p.targetUuid ? await fromUuid(p.targetUuid) : actor);
        if ( who?.documentName === "Token" ) who = who.actor;
        // A mark without the event's other Character goes to the clicking user's target
        if ( (p.effect === "mark") && (who === actor) ) who = T.currentTarget(actor);
        const local = ["mark", "unmark"].includes(p.effect) || !!p.rolled;
        if ( !who ) { ui.notifications.warn(`${p.label}: ${game.i18n.localize("DBU.TraitUse.NoTarget")}`); return; }
        if ( !local && !who.isOwner && !game.users.activeGM ) { ui.notifications.warn(game.i18n.localize("DBU.Notify.NoGM")); return; }
        // A limited trigger ("1/Round") counts when it is used (a limit that is a formula: with the Transformation's
        // variables)
        const limited = { limit: p.limit, ctx: p.ctx ?? {} };
        const usedUp = () => {
          ui.notifications.warn(game.i18n.format("DBU.Trigger.LimitUsed", { label: p.label, limit: p.limit }));
          button.remove();
        };
        // B4: the other Character of a rolled button's Clash check (your target for "targeted", else the event's other one,
        // else your target), known before the use is counted and paid
        let other = null;
        if ( p.rolled ) {
          other = p.targeted ? who : null;
          if ( !other && p.otherUuid ) other = await fromUuid(p.otherUuid).catch(() => null);
          if ( other?.documentName === "Token" ) other = other.actor;
          other ??= (who !== actor) ? who : T.currentTarget(actor);
          const clash = [p.rolled.check, ...(p.rolled.items ?? []).map(i => i.check)].some(c => /^\s*clash:/i.test(String(c ?? "")));
          if ( clash && !other ) { ui.notifications.warn(`${p.label}: ${game.i18n.localize("DBU.TraitUse.NoTarget")}`); return; }
        }
        // Y: a grouped button none of whose effects applies now spends nothing (no limit, no cost)
        if ( p.rolled && !(await T.rolledItemsHold(actor, p, other)) ) {
          ui.notifications.warn(`${p.label}: ${game.i18n.localize("DBU.Trigger.NothingApplies")}`);
          return;
        }
        // A cost ("ki:2(bT)") is paid now and an amount ("up to M stacks") asked now: refused when it cannot be paid
        // M2: a Wound bonus for an attack whose Wound Roll is already made does nothing: nothing is paid for it
        if ( (p.effect === "attackWound") && p.messageId && game.messages.get(p.messageId)?.getFlag("dbu-rpg", "attack")?.wound ) {
          return ui.notifications.warn(game.i18n.localize("DBU.Wound.Already"));
        }
        let value = Number(p.value) || 0;
        let plan = null;
        let n = Number(p.scope?.n ?? 1) || 1;
        if ( p.cost || p.amount ) {
          if ( p.limitKey && !T.triggerUsesLeft(actor, limited, p.limitKey) ) return usedUp();
          const use = await T.prepareTriggerUse(actor, p);
          if ( !use ) return;
          if ( use.plan?.problems?.length ) {
            ui.notifications.warn(`${p.label}: ${game.i18n.format("DBU.Trigger.CantPay", { why: use.plan.problems.join(" ") })}`);
            return;
          }
          value = use.value;
          plan = use.plan;
          n = use.n ?? 1;
        }
        // B3 removeCondition "any": the clicking user picks the Condition now, before the use is counted and paid (a
        // cancel costs nothing, and the GM is not asked when the effect goes through the GM)
        let resource = p.resource;
        if ( (p.effect === "removeCondition") && !p.rolled ) {
          if ( p.limitKey && !T.triggerUsesLeft(actor, limited, p.limitKey) ) return usedUp();
          const pick = await T.pickRemovedCondition(who, p.resource, p.label);
          if ( !pick ) return;
          resource = pick.resource;
        }
        if ( p.limitKey && !(await T.useTriggerLimit(actor, limited, p.limitKey)) ) return usedUp();
        const paid = plan ? await T.payTriggerCost(actor, plan, p.resEvent ? { resEvent: true } : {}) : "";
        // B4: a roll or a check made now, then only the triggers it lets apply
        if ( p.rolled ) {
          const lines = await T.applyRolledTrigger(actor, p, { other, n });
          if ( paid ) lines.unshift(game.i18n.format("DBU.Trigger.Paid", { cost: paid }));
          const { postInfoCard } = await import("./dice/roller.mjs");
          if ( lines.length ) await postInfoCard({ actor, title: p.label, lines });
          button.remove();
          return;
        }
        const opts = { duration: p.duration, event: p.event, label: p.label, timedDuration: p.timedDuration, source: p.source, skip: p.skip,
          itemId: p.itemId ?? null };
        // Options only some effects carry (B1 marker, B3 inflictor / State loop guard, B5 `with`, B2 resource loop guard, the
        // mark a markPlaced effect ends with)
        // (D1: the effect the piece comes from, for @viaFx and "fxUsed")
        for ( const k of ["markerUuid", "inflictor", "with", "resEvent", "noLeave", "withMark", "quietMark", "fx", "fxOwner", "messageId"] ) if ( p[k] ) opts[k] = p[k];
        if ( ["mark", "unmark"].includes(p.effect) ) opts.markerUuid = actor.uuid;
        // P: an attack Maneuver of the button targets the event's other Character
        if ( (p.effect === "maneuver") && p.otherUuid ) opts.otherUuid = p.otherUuid;
        if ( (p.effect === "condition") && (who !== actor) && (p.event !== "inflict") ) opts.inflictor = actor.uuid;
        // "targeted": the durations "until your (next) turn" count on your turns
        if ( p.targeted ) Object.assign(opts, T.timedOptionsFor(actor, who, p.rawDuration ?? p.duration));
        let text = "";
        if ( who.isOwner || local ) text = await applyTriggerEffect(who, p.effect, value, resource, opts);
        else {
          const { emitGM } = await import("./socket.mjs");
          if ( emitGM("applyTrigger", { uuid: who.uuid, effect: p.effect, value, resource, options: opts }) ) text = p.label;
        }
        if ( paid ) text = [text, game.i18n.format("DBU.Trigger.Paid", { cost: paid })].filter(Boolean).join(" · ");
        if ( text ) ui.notifications.info(`${who.name}: ${text}`);
        button.remove();
        return;
      }
      default: break;
    }
  } finally {
    button.disabled = false;
  }
}
