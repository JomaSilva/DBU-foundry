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
        const text = await applyTriggerEffect(actor, p.effect, Number(p.value) || 0, p.resource,
          { duration: p.duration, event: p.event, label: p.label });
        if ( text ) ui.notifications.info(`${actor.name}: ${text}`);
        button.remove();
        return;
      }
      default: break;
    }
  } finally {
    button.disabled = false;
  }
}
