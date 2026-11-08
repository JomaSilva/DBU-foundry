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
    // F13 another Character's owner is asked about a roll (combat/reactions.mjs), and answers
    // (T5: a Clash defender's owner is asked its boxes, and answers)
    if ( (payload?.action === "clashAsk") || (payload?.action === "clashAnswer") ) {
      if ( payload.userId !== game.user.id ) return;
      const C = await import("./combat/clash.mjs");
      return (payload.action === "clashAsk") ? C.onClashAsk(payload.data) : C.onClashAnswer(payload.data);
    }
    if ( (payload?.action === "rollAsk") || (payload?.action === "rollAnswer") ) {
      if ( payload.userId !== game.user.id ) return;
      const R = await import("./combat/reactions.mjs");
      return (payload.action === "rollAsk") ? R.onRollAsk(payload.data) : R.onRollAnswer(payload.data);
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
    // M2: a Wound bonus added to an attack by another Character's effect ("attackWound" stores the rolled Wound itself)
    case "attackWoundAdd": {
      const A = await import("./combat/attack.mjs");
      await A.addAttackWound(data.messageId, data.label, data.value);
      break;
    }
    // AA: a Wound Roll already made, changed by an effect ("woundAdd" / "woundCategory")
    case "attackWoundBump": {
      const A = await import("./combat/attack.mjs");
      await A.bumpStoredWound(data.messageId, data);
      break;
    }
    // AG: + Soak for one row of an attack (an Ally's effect), and a limit counted on another actor
    case "attackTargetSoak": {
      const A = await import("./combat/attack.mjs");
      await A.addTargetSoak(data.messageId, data.index, data.value, data.label, data.kind);
      break;
    }
    // DD2: the attack goes back to Defense Declaration for one target
    case "attackReopen": {
      const A = await import("./combat/attack.mjs");
      await A.reopenDefense(data.messageId, data.index, data.label);
      break;
    }
    // CS4: an attack misses a team
    case "attackMissTeam": {
      const A = await import("./combat/attack.mjs");
      await A.missTeam(data.messageId, data.ownerUuid, data.label);
      break;
    }
    // AR: an area an effect places on the map (a Region)
    case "placeArea": {
      const scene = game.scenes.get(data.sceneId);
      if ( scene && data.data ) await scene.createEmbeddedDocuments("Region", [data.data], { keepId: true });
      break;
    }
    case "createGoop": {
      const doc = await fromUuid(data.ownerUuid).catch(() => null);
      const owner = (doc?.documentName === "Token") ? doc.actor : doc;
      if ( owner ) { const N = await import("./combat/minions.mjs"); await N.createGoop(owner); }
      break;
    }
    // F14 the Avatar takes the Character's place (combat/avatar.mjs)
    case "switchAvatar": {
      const AV = await import("./combat/avatar.mjs");
      await AV.doSwitch(data.actorUuid, data.avatarUuid);
      break;
    }
    case "createDuplicate": {
      const doc = await fromUuid(data.ownerUuid).catch(() => null);
      const owner = (doc?.documentName === "Token") ? doc.actor : doc;
      if ( owner ) { const N = await import("./combat/minions.mjs"); await N.createDuplicate(owner, data); }
      break;
    }
    case "removeMinions": {
      const N = await import("./combat/minions.mjs");
      await N.removeMinions(data.uuids ?? []);
      break;
    }
    case "createMinion": {
      const doc = await fromUuid(data.ownerUuid).catch(() => null);
      const owner = (doc?.documentName === "Token") ? doc.actor : doc;
      if ( owner ) { const N = await import("./combat/minions.mjs"); await N.createMinion(owner, data); }
      break;
    }
    case "glassSoldiers": {
      const doc = await fromUuid(data.ownerUuid).catch(() => null);
      const owner = (doc?.documentName === "Token") ? doc.actor : doc;
      if ( owner ) { const F = await import("./canvas/features.mjs"); await F.createGlassSoldiers(owner, data.n); }
      break;
    }
    case "removeFeature": {
      const t = await fromUuid(data.uuid).catch(() => null);
      if ( t ) await t.delete();
      break;
    }
    case "removeArea": {
      const r = await fromUuid(data.uuid).catch(() => null);
      if ( r ) await r.delete();
      break;
    }
    // E2: a document the user cannot change (a Combatant's initiative, another token)
    case "swapAttackTarget": {
      const A = await import("./combat/attack.mjs");
      await A.swapAttackTarget(data.messageId, data.fromUuid, data.toUuid);
      break;
    }
    case "useLimit": {
      const doc = await fromUuid(data.actorUuid).catch(() => null);
      const a = (doc?.documentName === "Token") ? doc.actor : doc;
      if ( a ) { const T = await import("./combat/triggers.mjs"); await T.useTriggerLimit(a, { limit: data.limit }, data.key); }
      break;
    }
    // CB: an Opponent's effect turns the Strike Roll's Critical Result into a Botch Result
    case "attackCritToBotch": {
      const A = await import("./combat/attack.mjs");
      await A.critToBotchOnMessage(data.messageId, data);
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
    // A trigger button used on a Character the player does not own
    case "applyTrigger": {
      const doc = await fromUuid(data.uuid);
      const actor = doc?.actor ?? doc;
      if ( !actor ) break;
      const { applyTriggerEffect } = await import("./combat/triggers.mjs");
      const text = await applyTriggerEffect(actor, data.effect, data.value, data.resource, data.options ?? {});
      if ( text ) {
        const { postInfoCard } = await import("./dice/roller.mjs");
        await postInfoCard({ actor, title: data.options?.label ?? "", lines: [text] });
      }
      break;
    }
    // B1: a mark left a Character the player does not own: what the mark gave it ends
    case "endMarkEffects": {
      const { endMarkEffects } = await import("./combat/triggers.mjs");
      await endMarkEffects(data.uuid, data.key);
      break;
    }
    // A player's Character hit, was hit, crossed a Health Threshold...: its event triggers run here
    case "triggerEvent": {
      const { runEventTriggers } = await import("./combat/triggers.mjs");
      await runEventTriggers(data.actorUuid, data.event, { other: data.otherUuid, scope: data.scope ?? {} });
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
