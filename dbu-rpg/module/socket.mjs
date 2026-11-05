/**
 * GM relay: players cannot update documents they do not own (enemy actors, other users' chat cards),
 * so those updates are forwarded to the active GM through the system socket.
 */
const CHANNEL = "system.dbu-rpg";

export function registerSocket() {
  game.socket.on(CHANNEL, async (payload) => {
    // A GM asks the owner of an actor where new stacks (Battle Born...) go
    if ( payload?.action === "allocate" ) {
      if ( payload.userId !== game.user.id ) return;
      const { onAllocateRequest } = await import("./combat/stacks.mjs");
      return onAllocateRequest(payload.data);
    }
    // The attacker (or the GM) chooses the Injury a hit inflicts
    if ( payload?.action === "injury" ) {
      if ( payload.userId !== game.user.id ) return;
      const { onInjuryRequest } = await import("./combat/injuries.mjs");
      return onInjuryRequest(payload.data);
    }
    if ( !game.user.isActiveGM ) return;
    try {
      await handle(payload);
    } catch(err) {
      console.error("DBU | socket handler failed", payload, err);
    }
  });
}

async function handle({ action, uuid, data, options }) {
  switch ( action ) {
    case "update": {
      const doc = await fromUuid(uuid);
      if ( doc ) await doc.update(data, options ?? {});
      break;
    }
    case "attackResult": {
      const { resolveDefenseOnMessage } = await import("./combat/attack.mjs");
      await resolveDefenseOnMessage(data.messageId, data.targetIndex, data.result);
      break;
    }
    case "attackWound": {
      const { storeWoundOnMessage } = await import("./combat/attack.mjs");
      await storeWoundOnMessage(data.messageId, data.wound);
      break;
    }
    case "attackDamage": {
      const { storeDamageOnMessage } = await import("./combat/attack.mjs");
      await storeDamageOnMessage(data.messageId, data.targetIndex, data.damage);
      break;
    }
    case "attackKnockback": {
      const { storeKnockbackOnMessage } = await import("./combat/attack.mjs");
      await storeKnockbackOnMessage(data.messageId, data.targetIndex, data.knockback);
      break;
    }
    // Duel Maneuver: a side's Ki Wager for the next Duel Clash (the GM rolls once both are in)
    case "duelWager": {
      const { applyDuelWager } = await import("./combat/duel.mjs");
      await applyDuelWager(data.messageId, data.side, data.wager, data.helper ?? "");
      break;
    }
    case "duelEscape": {
      const { applyDuelEscape } = await import("./combat/duel.mjs");
      await applyDuelEscape(data.messageId);
      break;
    }
    case "duelJoin": {
      const { applyDuelJoin } = await import("./combat/duel.mjs");
      await applyDuelJoin(data.messageId, data.side, data.helper);
      break;
    }
    // The scanned Character's owner answered a Scan card someone else posted
    case "scanResult": {
      const { storeScanOnMessage } = await import("./combat/scan.mjs");
      await storeScanOnMessage(data.messageId, data.scan);
      break;
    }
    // A player's Power Up destroys Scouters of tokens hidden from the players: the GM posts those cards
    case "scouterBreak": {
      const { breakScouters } = await import("./combat/scan.mjs");
      await breakScouters(data.actorUuid, data.power, data.entries, { hidden: true });
      break;
    }
    // Effects of a player's Maneuver on documents the player does not own (forced movement, Collisions, Grapple)
    case "ops": {
      const { applyOps } = await import("./combat/movement.mjs");
      await applyOps(data.ops ?? []);
      break;
    }
    // A player fuses or defuses: the GM moves the tokens and the combatants
    case "fusion": {
      const fusion = await fromUuid(data.uuid);
      if ( fusion?.type !== "fusion" ) break;
      const F = await import("./fusion/fusion.mjs");
      if ( data.op === "fuse" ) await F.fuse(fusion);
      else if ( data.op === "defuse" ) await F.defuse(fusion, { reason: data.reason });
      break;
    }
    default: break;
  }
}

/** Update a document directly when possible, otherwise ask the GM. */
export async function safeUpdate(doc, data, options = {}) {
  if ( !doc ) return null;
  if ( doc.isOwner ) return doc.update(data, options);
  if ( !game.users.activeGM ) {
    ui.notifications.warn(game.i18n.localize("DBU.Notify.NoGM"));
    return null;
  }
  game.socket.emit(CHANNEL, { action: "update", uuid: doc.uuid, data, options });
  return null;
}

/** Ask the GM to run a named action. */
export function emitGM(action, data) {
  if ( !game.users.activeGM ) {
    ui.notifications.warn(game.i18n.localize("DBU.Notify.NoGM"));
    return false;
  }
  game.socket.emit(CHANNEL, { action, data });
  return true;
}
