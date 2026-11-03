import { applyAttackDamage, retargetAttack, rollDefense, rollWound } from "./combat/attack.mjs";
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
      root.querySelectorAll("[data-dbu-action='wound'], [data-dbu-action='retarget']").forEach(b => b.remove());
    }
    root.querySelectorAll("[data-dbu-action='defense']").forEach(b => {
      const t = attack.targets?.[Number(b.dataset.index)];
      const doc = t?.tokenUuid ? fromUuidSync(t.tokenUuid) : (t?.actorUuid ? fromUuidSync(t.actorUuid) : null);
      const actor = doc?.actor ?? doc;
      if ( actor && !actor.isOwner ) b.remove();
      // Divine Flex: only for a defender in the God Ki State who has that God Maneuver
      else if ( (b.dataset.mode === "divineFlex") && !(actor?.system?.dkp?.usable
        && actor.items.some(i => (i.type === "maneuver") && i.system.god && /flex/i.test(i.name))) ) b.remove();
    });
  }
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
      case "retarget": await retargetAttack(message); break;
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
