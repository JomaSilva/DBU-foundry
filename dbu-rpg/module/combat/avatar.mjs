/**
 * F14 Switching to an Avatar (Dragon Ball Hero, Switch to a Hero): the Avatar is another Character sheet of the same
 * player, picked once (flags.dbu-rpg.avatar). Switching, the Avatar's token takes the Character's place on the map and
 * its combatant takes the Character's place in the Initiative Order; it gets the Character's Combat Conditions (and their
 * remaining durations). The Character's token leaves the map until the end of the Combat Encounter, when it comes back
 * where the Avatar stands (onCombatDeleted). The map and combatant changes are the GM's (socket "switchAvatar").
 */
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** The actor's Avatar: the one recorded, or one picked now among the other Characters its owner owns. */
export async function avatarOf(actor, { pick = true } = {}) {
  const uuid = actor?.getFlag?.("dbu-rpg", "avatar");
  const known = uuid ? await fromUuid(uuid).catch(() => null) : null;
  if ( known ) return known;
  if ( !pick ) return null;
  const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
  const list = game.actors.filter(a => (a !== actor) && (a.type === "character")
    && (owners.length ? owners.some(u => a.testUserPermission(u, "OWNER")) : a.isOwner));
  if ( !list.length ) {
    ui.notifications.warn(L("DBU.Avatar.None"));
    return null;
  }
  const id = await foundry.applications.api.DialogV2.wait({
    window: { title: L("DBU.Avatar.Pick") },
    content: `<div class="dbu-dialog"><p>${L("DBU.Avatar.PickHint")}</p><select name="id">${list.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></div>`,
    buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), default: true, callback: (e, b) => b.form.elements.id.value },
      { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  const avatar = (id && (id !== "cancel")) ? game.actors.get(id) : null;
  if ( avatar ) await actor.setFlag("dbu-rpg", "avatar", avatar.uuid);
  return avatar;
}

/** Switch `actor` to its Avatar (the GM does the map and the combatant). @returns a text for the card. */
export async function switchToAvatar(actor, { label = "" } = {}) {
  const avatar = await avatarOf(actor);
  if ( !avatar ) return "";
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid));
  if ( !combat ) return L("DBU.Avatar.NoCombat");
  if ( game.user.isGM ) await doSwitch(actor.uuid, avatar.uuid);
  else {
    const { emitGM } = await import("../socket.mjs");
    if ( !emitGM("switchAvatar", { actorUuid: actor.uuid, avatarUuid: avatar.uuid }) ) return L("DBU.Notify.NoGM");
    for ( let i = 0; i < 25 && !combat.combatants.some(cb => cb.actor?.uuid === avatar.uuid); i++ ) await new Promise(r => setTimeout(r, 200));
  }
  const lines = [L("DBU.Avatar.Switched", { name: actor.name, avatar: avatar.name })];
  // Switch to a Hero (3): in a Transformation when switching, the Avatar may use the Transformation Maneuver Out-of-Sequence
  const inForm = (actor.system?.transformation?.active?.length ?? 0) > 0;
  if ( inForm && ((actor.system?.buckets?.["flag.avatarTransform"]?.total ?? 0) > 0) && avatar.isOwner ) {
    lines.push(L("DBU.Avatar.Transform", { avatar: avatar.name }));
    setTimeout(() => avatar.useOutOfSequence?.("transformation")?.catch?.(console.error), 300);
  }
  return lines.join(" ");
}

/** GM: the Avatar's token and combatant take the Character's place; the Conditions go with it. */
export async function doSwitch(actorUuid, avatarUuid) {
  const actor = await fromUuid(actorUuid).catch(() => null);
  const avatar = await fromUuid(avatarUuid).catch(() => null);
  if ( !actor || !avatar ) return;
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid));
  const cb = combat?.combatants.find(c => c.actor?.uuid === actor.uuid);
  const tdoc = cb?.token ?? actor.getActiveTokens?.()?.[0]?.document ?? null;
  const scene = tdoc?.parent;
  if ( !combat || !cb || !tdoc || !scene ) return;
  const proto = (await avatar.getTokenDocument({ x: tdoc.x, y: tdoc.y, elevation: tdoc.elevation ?? 0 })).toObject();
  const [made] = await scene.createEmbeddedDocuments("Token", [{ ...proto, x: tdoc.x, y: tdoc.y, disposition: tdoc.disposition, actorLink: true }]);
  if ( !made ) return;
  await cb.update({ actorId: avatar.id, tokenId: made.id, sceneId: scene.id });
  // The Combat Conditions (and their timed entries) go to the Avatar
  const conds = foundry.utils.deepClone(actor.system._source?.conditions ?? {});
  const timed = (actor.getFlag("dbu-rpg", "timed") ?? []).filter(e => e.kind === "condition");
  await avatar.update({ "system.conditions": conds });
  if ( timed.length ) await avatar.setFlag("dbu-rpg", "timed", [...(avatar.getFlag("dbu-rpg", "timed") ?? []), ...foundry.utils.deepClone(timed)]);
  for ( const [k, v] of Object.entries(conds) ) if ( v > 0 ) await avatar.toggleStatusEffect?.(k, { active: true }).catch(() => null);
  await avatar.setFlag("dbu-rpg", "avatarOf", { actorUuid: actor.uuid, combat: combat.id, token: tdoc.toObject() });
  await tdoc.delete();
}

/** GM, at the end of a Combat Encounter: the Characters that switched come back where their Avatars stand. */
export async function endAvatars(combat) {
  for ( const avatar of game.actors.filter(a => a.getFlag("dbu-rpg", "avatarOf")?.combat === combat.id) ) {
    const info = avatar.getFlag("dbu-rpg", "avatarOf");
    const actor = await fromUuid(info.actorUuid).catch(() => null);
    const atok = avatar.getActiveTokens?.()?.[0]?.document ?? null;
    const scene = atok?.parent ?? game.scenes.get(info.token?.parent) ?? canvas.scene;
    if ( actor && scene && info.token ) {
      const data = { ...info.token, x: atok?.x ?? info.token.x, y: atok?.y ?? info.token.y };
      delete data._id;
      await scene.createEmbeddedDocuments("Token", [data]);
    }
    if ( atok ) await atok.delete();
    await avatar.unsetFlag("dbu-rpg", "avatarOf");
  }
}
