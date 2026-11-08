/**
 * Minions an effect creates (Poko Priest): an NPC of type "minion" whose Leader / Owner is its creator (system.minionOf),
 * with the Racial Traits named from the compendium, owned by the creator's players, its token on a free Square next to
 * the creator's. The GM makes it (the socket "createMinion" brings a player's request); its sheet is finished by hand
 * (Attribute Points, the rest of its Race).
 */
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** A free Square next to a token (top-left corner), or null. */
function freeSquareNear(tokenDoc) {
  const scene = tokenDoc.parent;
  const size = scene.grid?.size ?? 100;
  const s = tokenDoc._source;
  const taken = (x, y) => scene.tokens.some(t => {
    const q = t._source;
    return (x + (size / 2) >= q.x) && (x + (size / 2) < q.x + ((q.width ?? 1) * size)) && (y + (size / 2) >= q.y) && (y + (size / 2) < q.y + ((q.height ?? 1) * size));
  });
  for ( let dx = -1; dx <= (s.width ?? 1); dx++ ) {
    for ( let dy = -1; dy <= (s.height ?? 1); dy++ ) {
      const x = s.x + (dx * size);
      const y = s.y + (dy * size);
      const inside = (dx >= 0) && (dx < (s.width ?? 1)) && (dy >= 0) && (dy < (s.height ?? 1));
      if ( !inside && !taken(x, y) ) return { x, y };
    }
  }
  return null;
}

/**
 * Create a Minion of `owner`. @returns a text for the card.
 * @param {Actor} owner
 * @param {object} [o]
 * @param {string[]} [o.traits]  Racial Traits (compendium names) it starts with
 * @param {string} [o.label]     its name (with the owner's)
 * @param {string} [o.hint]      what is left to do on its sheet (shown on the card)
 */
export async function createMinion(owner, { traits = [], label = "", hint = "" } = {}) {
  if ( !owner ) return "";
  if ( !game.user.isGM ) {
    const { emitGM } = await import("../socket.mjs");
    return emitGM("createMinion", { ownerUuid: owner.uuid, traits, label, hint }) ? L("DBU.Minion.Asked") : L("DBU.Notify.NoGM");
  }
  const items = [];
  const pack = game.packs.get("dbu-rpg.racial-traits");
  if ( pack && traits.length ) {
    const index = await pack.getIndex();
    for ( const n of traits ) {
      const e = index.find(i => i.name === n);
      if ( e ) items.push((await pack.getDocument(e._id)).toObject());
    }
  }
  const ownership = { default: 0 };
  for ( const u of game.users ) if ( !u.isGM && owner.testUserPermission?.(u, "OWNER") ) ownership[u.id] = 3;
  const actor = await Actor.create({ name: `${label || "Minion"} (${owner.name})`, type: "npc", items, ownership,
    system: { npcType: "minion", minionOf: owner.uuid } });
  const me = owner.getActiveTokens?.()?.[0]?.document;
  const spot = me ? freeSquareNear(me) : null;
  if ( actor && me && spot ) {
    const proto = (await actor.getTokenDocument()).toObject();
    await me.parent.createEmbeddedDocuments("Token", [{ ...proto, x: spot.x, y: spot.y, disposition: me.disposition, actorLink: true }]);
  }
  return [L("DBU.Minion.Created", { name: actor?.name ?? "" }), hint].filter(Boolean).join(" ");
}

/* -------------------------------------------- */
/*  Goops (From Goop)                           */
/* -------------------------------------------- */

/** The Goops of an owner (flags.dbu-rpg.goop.owner). */
export function goopsOf(owner) {
  return (game.actors ?? []).filter(a => a.flags?.["dbu-rpg"]?.goop?.owner === owner?.uuid);
}

/**
 * Create a Goop: a Duplicate Minion of the owner without its Apparel, Accessories and Weapons (its sheet copied, an NPC
 * of type minion whose Leader / Owner is the owner), on a free Square next to the owner. GM (socket "createGoop").
 */
export async function createGoop(owner) {
  if ( !owner ) return "";
  if ( !game.user.isGM ) {
    const { emitGM } = await import("../socket.mjs");
    return emitGM("createGoop", { ownerUuid: owner.uuid }) ? L("DBU.Minion.Asked") : L("DBU.Notify.NoGM");
  }
  const data = owner.toObject();
  delete data._id;
  data.type = "npc";
  data.name = `Goop (${owner.name})`;
  data.items = (data.items ?? []).filter(i => !["apparel", "weapon"].includes(i.type) && !((i.type === "item") && (i.system?.itemType === "accessory")));
  data.system = { ...(data.system ?? {}), npcType: "minion", minionOf: owner.uuid };
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === owner.uuid));
  data.flags = { ...(data.flags ?? {}), "dbu-rpg": { ...(data.flags?.["dbu-rpg"] ?? {}), goop: { owner: owner.uuid,
    created: combat ? { combat: combat.id, round: combat.round, turn: combat.turn } : null } } };
  const ownership = { default: 0 };
  for ( const u of game.users ) if ( !u.isGM && owner.testUserPermission?.(u, "OWNER") ) ownership[u.id] = 3;
  data.ownership = ownership;
  delete data.prototypeToken?.actorId;
  const actor = await Actor.create(data);
  const me = owner.getActiveTokens?.()?.[0]?.document;
  const spot = me ? freeSquareNear(me) : null;
  if ( actor && me && spot ) {
    const proto = (await actor.getTokenDocument()).toObject();
    await me.parent.createEmbeddedDocuments("Token", [{ ...proto, x: spot.x, y: spot.y, disposition: me.disposition, actorLink: true }]);
  }
  return L("DBU.Goop.Created", { name: actor?.name ?? "" });
}

/**
 * F10 A Duplicate Minion of the owner (Brood Parent): its sheet copied as an NPC Minion (minionOf = owner) without its
 * Apparel, Weapons and Accessories, `sizeShift` Size Categories bigger (negative: smaller), next to the owner.
 */
export async function createDuplicate(owner, { label = "Duplicate", sizeShift = 0, extraShrink = 0 } = {}) {
  if ( !owner ) return "";
  if ( !game.user.isGM ) {
    const { emitGM } = await import("../socket.mjs");
    return emitGM("createDuplicate", { ownerUuid: owner.uuid, label, sizeShift, extraShrink }) ? L("DBU.Minion.Asked") : L("DBU.Notify.NoGM");
  }
  // F12 Brood Parent 2: "duplicateGrant.<slug>" (the Duplicate gets that Maneuver: Draining Minions' Power Drain) and
  // extraShrink (Mini Minions: that many Size Categories smaller, -1(T) Soak and +1(T) Defense Value each)
  const shrink = Math.max(0, Math.floor(Number(extraShrink) || 0));
  sizeShift = (Number(sizeShift) || 0) - shrink;
  const grantSlugs = Object.entries(owner.system?.buckets ?? {}).filter(([k, b]) => k.startsWith("duplicateGrant.") && ((b?.total ?? 0) > 0))
    .map(([k]) => k.slice(15));
  const extraItems = [];
  if ( grantSlugs.length ) {
    const { awakeningSlug } = await import("../rules/awakening.mjs");
    const docs = await (game.packs.get("dbu-rpg.maneuvers")?.getDocuments() ?? []);
    for ( const slug of grantSlugs ) {
      const d = docs.find(x => awakeningSlug(String(x.name).replace(/\bmaneuver\b/gi, "")) === slug);
      if ( d && !owner.items.some(i => i.name === d.name) ) extraItems.push(d.toObject());
    }
  }
  const { DBU } = await import("../config.mjs");
  const data = owner.toObject();
  delete data._id;
  data.type = "npc";
  data.name = `${label} (${owner.name})`;
  // (F12: not the owner's temporary bonuses: the buffs of its timed effects, the timed effects and the uses counted)
  const timedKeys = new Set((owner.flags?.["dbu-rpg"]?.timed ?? []).map(t => t?.key).filter(Boolean));
  if ( Array.isArray(data.system?.customModifiers) ) data.system.customModifiers = data.system.customModifiers.filter(m => !timedKeys.has(m.label));
  if ( data.flags?.["dbu-rpg"] ) { delete data.flags["dbu-rpg"].timed; delete data.flags["dbu-rpg"].triggerUses; }
  data.items = (data.items ?? []).filter(i => !["apparel", "weapon"].includes(i.type) && !((i.type === "item") && (i.system?.itemType === "accessory")));
  data.items.push(...extraItems);
  const order = DBU.SIZE_ORDER ?? [];
  const at = order.indexOf(data.system?.details?.size ?? "medium");
  const size = (at >= 0) ? order[Math.clamp(at + (Number(sizeShift) || 0), 0, order.length - 1)] : (data.system?.details?.size ?? "medium");
  data.system = { ...(data.system ?? {}), npcType: "minion", minionOf: owner.uuid, details: { ...(data.system?.details ?? {}), size } };
  if ( shrink ) {
    data.system.customModifiers = [...(data.system.customModifiers ?? []),
      { target: "soak", value: `-${shrink}(T)`, condition: "", label: `${label}: Mini Minions`, active: true },
      { target: "defenseValue", value: `${shrink}(T)`, condition: "", label: `${label}: Mini Minions`, active: true }];
  }
  // (F12: which effect made it, and when: Consumable Minions does not take one made this Combat Round)
  const combatNow = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === owner.uuid));
  foundry.utils.setProperty(data, "flags.dbu-rpg.duplicate", { label, combat: combatNow?.id ?? null, round: combatNow?.round ?? null });
  const ownership = { default: 0 };
  for ( const u of game.users ) if ( !u.isGM && owner.testUserPermission?.(u, "OWNER") ) ownership[u.id] = 3;
  data.ownership = ownership;
  const actor = await Actor.create(data);
  const me = owner.getActiveTokens?.()?.[0]?.document;
  const spot = me ? freeSquareNear(me) : null;
  if ( actor && me && spot ) {
    const proto = (await actor.getTokenDocument()).toObject();
    await me.parent.createEmbeddedDocuments("Token", [{ ...proto, x: spot.x, y: spot.y, disposition: me.disposition, actorLink: true }]);
  }
  return L("DBU.Minion.Created", { name: actor?.name ?? "" });
}

/**
 * F12 Consumable Minions: the owner's Duplicates made by `label` (not this Combat Round), ticked in a dialog, are
 * Defeated (removed); the owner regains 1/4 (rounded up) of their Ki Points. @returns a text for the card.
 */
export async function consumeMinions(owner, { label = "Brood", title = "" } = {}) {
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === owner.uuid));
  const mine = game.actors.filter(a => (a.system?.minionOf === owner.uuid) && (a.flags?.["dbu-rpg"]?.duplicate?.label === label)
    && !(combat && (a.flags["dbu-rpg"].duplicate.combat === combat.id) && (a.flags["dbu-rpg"].duplicate.round === combat.round)));
  if ( !mine.length ) return L("DBU.Minion.NoneToConsume");
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
  const rows = mine.map(a => `<label class="check"><input type="checkbox" name="${a.id}" checked> ${esc(a.name)} (${a.system.ki?.value ?? 0} KP)</label>`).join("<br>");
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: title || label },
    content: `<div class="dbu-dialog"><p>${L("DBU.Minion.ConsumePick")}</p>${rows}</div>`,
    buttons: [{ action: "ok", label: L("DBU.Choice.Confirm"), default: true, callback: (e, b) => mine.filter(a => b.form.elements[a.id]?.checked) },
      { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  if ( !Array.isArray(picked) || !picked.length ) return "";
  const kp = picked.reduce((t, a) => t + (Number(a.system.ki?.value) || 0), 0);
  const gain = Math.ceil(kp / 4);
  await removeMinions(picked.map(a => a.uuid));
  const before = owner.system.ki?.value ?? 0;
  const after = Math.min(owner.system.ki?.max ?? Infinity, before + gain);
  await owner.update({ "system.ki.value": after }, { dbuSource: "trigger" });
  return L("DBU.Minion.Consumed", { n: picked.length, kp: after - before });
}

/** Remove Minions (their tokens and sheets): GM (socket "removeMinions"). */
export async function removeMinions(uuids) {
  if ( !game.user.isGM ) {
    const { emitGM } = await import("../socket.mjs");
    return emitGM("removeMinions", { uuids });
  }
  for ( const uuid of uuids ) {
    const a = await fromUuid(uuid).catch(() => null);
    if ( !a ) continue;
    for ( const s of game.scenes ) {
      const ids = s.tokens.filter(t => t.actorId === a.id).map(t => t.id);
      if ( ids.length ) await s.deleteEmbeddedDocuments("Token", ids);
    }
    await a.delete();
  }
  return true;
}

/**
 * Defeat up to `max` Goops of the owner (picked in a dialog unless `pick` is false) and regain 1/2 of the Life Points
 * they had left. `notThisTurn`: not a Goop created this turn. @returns a text for the card.
 */
export async function reabsorbGoops(owner, max = Infinity, { pick = true, notThisTurn = false } = {}) {
  let goops = goopsOf(owner);
  if ( notThisTurn ) {
    const c = (game.combats ?? []).find(x => x.started && x.combatants.some(cb => cb.actor?.uuid === owner.uuid));
    goops = goops.filter(g => {
      const k = g.flags["dbu-rpg"].goop.created;
      return !(c && k && (k.combat === c.id) && (k.round === c.round) && (k.turn === c.turn));
    });
  }
  if ( !goops.length ) return L("DBU.Goop.None");
  let chosen = goops;
  if ( pick ) {
    const esc = s => foundry.utils.escapeHTML(String(s));
    const rows = goops.map((g, i) => `<label class="check"><input type="checkbox" name="g${i}" ${i < max ? "checked" : ""}> ${esc(g.name)} (${g.system?.life?.value ?? 0} LP)</label>`).join("<br>");
    const data = await foundry.applications.api.DialogV2.wait({
      window: { title: "Goops" },
      content: `<div class="dbu-dialog"><p>${esc(L("DBU.Goop.Pick", { n: Number.isFinite(max) ? max : goops.length }))}</p>${rows}</div>`,
      buttons: [{ action: "ok", label: L("DBU.Goop.Absorb"), default: true, callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
        { action: "cancel", label: L("Cancel") }],
      rejectClose: false
    });
    if ( !data || (data === "cancel") ) return "";
    chosen = goops.filter((g, i) => data[`g${i}`]).slice(0, Number.isFinite(max) ? max : goops.length);
    if ( !chosen.length ) return "";
  }
  const lp = chosen.reduce((t, g) => t + Math.max(0, g.system?.life?.value ?? 0), 0);
  const gain = Math.floor(lp / 2);
  await removeMinions(chosen.map(g => g.uuid));
  if ( gain > 0 ) {
    const { applyTriggerEffect } = await import("./triggers.mjs");
    await applyTriggerEffect(owner, "life", gain, "", { label: "Goop" });
  }
  return L("DBU.Goop.Absorbed", { n: chosen.length, lp: gain });
}
