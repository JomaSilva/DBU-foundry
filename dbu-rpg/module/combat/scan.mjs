import { DBU } from "../config.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { targetCandidates } from "../adventure.mjs";
import { actorTokens, tokenDistance } from "../canvas/height.mjs";
import { addUses } from "../rules/adventuring.mjs";
import {
  SCOUTER_BREAK_SQUARES, SCOUTER_DCS, breakableScouters, craftDCText, craftDifficulty, destroyedUpdate, scanDevices,
  scanProtected, scanReading, scouterBreakTop
} from "../rules/scan.mjs";
import { emitGM, safeUpdate } from "../socket.mjs";
import { runOps } from "./movement.mjs";
import { encounterOf } from "./triggers.mjs";

/**
 * Scan with a Scouter, a Scout Scope or an Integrated Scouter (rules in rules/scan.mjs). The scanner chooses the
 * device and the Character; the card lets that Character's owner try the Concealment Skill Check or let the reading
 * through. The reading (current ToP, Power Level when it is the base ToP, and the Battle Power) is whispered to the
 * scanner and the GM. The Power Up of a strong Character destroys the weaker Scouters near them.
 */

const FLAG = "dbu-rpg";
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** "1 Ação" / "3 Ações". */
const actionsLabel = n => (n === 1) ? L("DBU.Scan.OneAction") : L("DBU.Scan.Actions", { n });

const kindLabel = kind => L(kind === "scope" ? "DBU.Scan.KindScope" : "DBU.Scan.KindScouter");

const dcLabel = dc => L(DBU.difficulties[dc]?.label ?? "DBU.Difficulty.qualified");

const tnOf = dc => DBU.difficulties[dc]?.tn ?? DBU.difficulties.qualified.tn;

/** Name of the device on the cards: "Scouter [Tech]", "3D Scan Mode (Scouter integrado)". */
const deviceName = d => d.integrated ? L("DBU.Scan.Integrated", { name: d.name }) : d.name;

/** The Scan button of the Combat tab (null without a device). */
export function scanButton(actor) {
  const devices = scanDevices(actor);
  if ( !devices.length ) return null;
  return {
    cost: actionsLabel(Math.min(...devices.map(d => d.actions))),
    tip: L("DBU.Scan.Tip", { devices: devices.map(deviceName).join(", ") })
  };
}

/**
 * Scan a Character. In a Combat Encounter it costs 1 Action (Scouter) or 3 (Scout Scope); outside of one it is the
 * Scan Adventuring Maneuver. Posts the card the scanned Character's owner answers.
 */
export async function scan(actor) {
  const devices = scanDevices(actor);
  if ( !devices.length ) {
    ui.notifications.warn(L("DBU.Scan.NoDevice"));
    return null;
  }
  const options = targetCandidates(actor);
  if ( !options.length ) {
    ui.notifications.warn(L("DBU.Adv.NoTargets"));
    return null;
  }
  const combat = encounterOf(actor);
  const have = actor.system.combat?.actions ?? 0;
  const option = (d, i) => {
    const dc = d.dc ? `Concealment ${dcLabel(d.dc)} (TN ${tnOf(d.dc)})` : L("DBU.Scan.DcVariable");
    return `<option value="${i}">${esc([deviceName(d), dc, combat ? actionsLabel(d.actions) : ""].filter(Boolean).join(" · "))}</option>`;
  };
  const variable = devices.some(d => !d.dc);
  const form = await DialogV2.wait({
    window: { title: L("DBU.Scan.Title") }, position: { width: 460 },
    content: `<div class="dbu-dialog"><p>${L("DBU.Scan.Intro")}</p>
      <div class="form-group"><label>${L("DBU.Scan.Device")}</label><select name="device">${devices.map(option).join("")}</select></div>
      ${variable ? `<div class="form-group"><label>${L("DBU.Scan.Dc")}</label><select name="dc">
        ${SCOUTER_DCS.map(k => `<option value="${k}">${esc(dcLabel(k))} (TN ${tnOf(k)})</option>`).join("")}
        </select></div><p class="dbu-hint">${L("DBU.Scan.DcHint")}</p>` : ""}
      <div class="form-group"><label>${L("DBU.Adv.Target")}</label><select name="target">
        ${options.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join("")}</select></div>
      <p class="dbu-hint">${combat ? L("DBU.Scan.CostLine", { have }) : L("DBU.Scan.Adventuring")}</p></div>`,
    buttons: [{ action: "ok", label: L("DBU.Scan.Go"), icon: "fa-solid fa-crosshairs", default: true,
      callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    { action: "cancel", label: L("Cancel") }],
    rejectClose: false
  });
  if ( !form || (form === "cancel") ) return null;
  const device = devices[Number(form.device) || 0];
  const chosen = options[Number(form.target) || 0];
  const target = chosen?.actor;
  if ( !device || !target ) return null;
  if ( combat ) {
    if ( have < device.actions ) {
      ui.notifications.error(L("DBU.Attack.ErrActions", { need: device.actions, have }));
      return null;
    }
    await actor.update({ "system.combat.actions": have - device.actions });
  }
  else await actor.update({ "system.adventure.uses": addUses(actor.system._source.adventure?.uses ?? [], "scan") });
  const dc = device.dc ?? (SCOUTER_DCS.includes(form.dc) ? form.dc : "qualified");
  // The Craft DC told for a variable Scouter stays on the item (the Scan and the Power Up do not ask it again)
  if ( !device.dc && !device.integrated ) await actor.items.get(device.itemId)?.update({ "system.craftDC": craftDCText(dc) });

  const s = {
    scannerUuid: actor.uuid, scannerName: actor.name, userId: game.user.id,
    targetUuid: target.uuid, targetName: chosen.label, img: target.img,
    kind: device.kind, device: deviceName(device), dc,
    combatId: combat?.id ?? null, cost: combat ? device.actions : 0, state: null, total: null
  };
  // A Concealment success against this kind of device earlier in this Combat Encounter
  if ( scanProtected(target.getFlag(FLAG, "scanHidden"), s.kind, s.combatId, target.system.combat?.holdingBack ?? 0) ) {
    s.state = "protected";
  }
  return ChatMessage.create({
    author: game.user.id, speaker: ChatMessage.getSpeaker({ actor }),
    content: await renderScanCard(s), flags: { [FLAG]: { scan: s } }
  });
}

/** The Scan card: who scans whom, the answer buttons until it is resolved, then what happened. */
async function renderScanCard(s) {
  const tn = tnOf(s.dc);
  const lines = [L("DBU.Scan.Line", { scanner: s.scannerName, target: s.targetName, device: s.device })];
  switch ( s.state ) {
    case "protected": lines.push(L("DBU.Scan.Protected", { target: s.targetName, kind: kindLabel(s.kind) })); break;
    case "hidden":
      lines.push(L(s.combatId ? "DBU.Scan.Hidden" : "DBU.Scan.HiddenOut", { target: s.targetName, total: s.total, tn, kind: kindLabel(s.kind) }));
      break;
    case "read":
      lines.push((s.total === null)
        ? L("DBU.Scan.Read", { target: s.targetName, scanner: s.scannerName })
        : L("DBU.Scan.ReadFail", { target: s.targetName, scanner: s.scannerName, total: s.total, tn }));
      break;
    default:
      lines.push(L("DBU.Scan.Waiting", { target: s.targetName, dc: dcLabel(s.dc), tn }));
      if ( s.kind === "scope" ) lines.push(L("DBU.Scan.ScopeWho"));
  }
  const buttons = s.state ? [] : [
    { action: "scanResist", icon: "fa-solid fa-eye-slash", label: L("DBU.Scan.Resist", { tn }) },
    { action: "scanAccept", icon: "fa-solid fa-eye", label: L("DBU.Scan.Accept") }
  ];
  return foundry.applications.handlebars.renderTemplate("systems/dbu-rpg/templates/chat/info-card.hbs", {
    title: L("DBU.Scan.CardTitle", { target: s.targetName }),
    subtitle: [s.device, s.cost ? actionsLabel(s.cost) : L("DBU.Adv.Maneuver")].join(" · "),
    lines, buttons, img: s.img
  });
}

/**
 * The scanned Character's owner answers the card: the Concealment Skill Check (resist), or let the reading through.
 * Failing it, or not trying, the reading goes to the scanner and the GM.
 */
export async function resolveScan(message, resist) {
  const s = foundry.utils.deepClone(message.getFlag(FLAG, "scan"));
  if ( !s ) return null;
  if ( s.state ) return ui.notifications.info(L("DBU.Scan.Already"));
  const target = await fromUuid(s.targetUuid);
  if ( !target ) return ui.notifications.warn(L("DBU.Notify.NoActor"));
  if ( !target.isOwner ) return ui.notifications.warn(L("DBU.Notify.NotOwner"));
  let hidden = false;
  if ( resist ) {
    const r = await target.rollSkill("concealment", { difficulty: s.dc,
      subtitle: L("DBU.Scan.RollSub", { scanner: s.scannerName, device: s.device, tn: tnOf(s.dc) }) });
    if ( !r ) return null;
    s.total = r.total ?? 0;
    hidden = !r.autoFail && (s.total >= tnOf(s.dc));
  }
  s.state = hidden ? "hidden" : "read";
  // Nothing happens, and the next Concealment Skill Checks against this kind of device succeed in this encounter
  if ( hidden && s.combatId ) {
    await target.setFlag(FLAG, "scanHidden", { ...(target.getFlag(FLAG, "scanHidden") ?? {}),
      [s.kind]: { combat: s.combatId, holdingBack: target.system.combat?.holdingBack ?? 0 } });
  }
  if ( !hidden ) await postReading(s, target);
  if ( message.isOwner ) return storeScanOnMessage(message.id, s);
  emitGM("scanResult", { messageId: message.id, scan: s });
  return null;
}

/** What the scanner reads, whispered to them and the GM: current ToP, Power Level (base ToP only), Battle Power. */
async function postReading(s, target) {
  const r = scanReading(target.system);
  const whisper = [...new Set([s.userId, ...game.users.filter(u => u.isGM).map(u => u.id)])].filter(id => game.users.has(id));
  return postInfoCard({
    actor: (await fromUuid(s.scannerUuid)) ?? undefined, img: s.img, whisper,
    title: L("DBU.Scan.ReadingTitle", { target: s.targetName }),
    subtitle: L("DBU.Scan.ReadingSub", { device: s.device }),
    lines: [L("DBU.Scan.Top", { t: r.top }), (r.pl === null) ? L("DBU.Scan.PlHidden") : L("DBU.Scan.Pl", { pl: r.pl })],
    extraHTML: `<div class="dbu-scan-readout"><span>${esc(L("DBU.BP.Label"))}</span>
      <strong>${new Intl.NumberFormat(game.i18n.lang).format(r.bp)}</strong></div>`
  });
}

/** Store the answer on the Scan card (directly, or by the GM for a card the player does not own). */
export async function storeScanOnMessage(messageId, s) {
  const message = game.messages.get(messageId);
  if ( !message || message.getFlag(FLAG, "scan")?.state ) return null;
  return message.update({ content: await renderScanCard(s), [`flags.${FLAG}.scan`]: s });
}

/* -------------------------------------------- */
/*  Scouters destroyed by a Power Up            */
/* -------------------------------------------- */

const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);

const INFO_CARD = "systems/dbu-rpg/templates/chat/info-card.hbs";

/** ", a 5 quadrados" in a Combat Encounter (nothing for the character's own Scouter, or while Adventuring). */
function whereText(q) {
  if ( q.self || (q.squares === null) ) return "";
  return (q.squares === 1) ? L("DBU.Scan.Break.Square") : L("DBU.Scan.Break.Squares", { n: q.squares });
}

/** "Qualified" or "Qualified ou Expert": the Craft DCs a Power Up of that Tier of Power destroys. */
const breakingDcs = top => SCOUTER_DCS.filter(k => (scouterBreakTop(k) ?? Infinity) <= top);

/**
 * After the Power Up Maneuver of a Character of Tier of Power 2+: the Scouters of Craft DC Expert or lower (see
 * rules/scan.mjs) within 15 Squares in a Combat Encounter, or on the whole scene while Adventuring, are destroyed.
 * The owner of a Scouter without a Craft DC (variable) is asked for it, and it is saved on the item. The GM can undo
 * the destruction from the card; tokens hidden from the players only get cards for the GM.
 */
export async function scoutersNearPowerUp(actor) {
  const top = actor?.system?.top?.current ?? 1;
  const source = actorTokens(actor)[0];
  if ( (top < 2) || !source ) return;
  const fighting = !!encounterOf(actor);
  // The Scouters each character in range has (the nearest token of a character with several)
  const near = new Map();
  for ( const token of canvas.tokens.placeables ) {
    const a = token.actor;
    const scouters = a ? breakableScouters(a, top) : [];
    if ( !scouters.length ) continue;
    const squares = tokenDistance(source, token).total;
    if ( fighting && (squares > SCOUTER_BREAK_SQUARES) ) continue;
    const seen = near.get(a.uuid);
    if ( !seen || (squares < seen.squares) ) near.set(a.uuid, { actor: a, token, squares, scouters });
  }
  const power = { name: source.document.name ?? actor.name, top };
  const shown = [], hidden = [];
  for ( const { actor: a, token, squares, scouters } of near.values() ) {
    const where = { owner: token.document.name ?? a.name, squares: fighting ? squares : null, self: a.uuid === actor.uuid };
    for ( const d of scouters ) {
      const item = a.items.get(d.itemId);
      if ( item ) (token.document.hidden ? hidden : shown).push({ ...where, uuid: item.uuid, dc: d.dc });
    }
  }
  await breakScouters(actor.uuid, power, shown);
  if ( !hidden.length ) return;
  // The author of a whisper sees it too: the GM posts the cards of the tokens hidden from the players
  if ( game.user.isGM ) await breakScouters(actor.uuid, power, hidden, { hidden: true });
  else emitGM("scouterBreak", { actorUuid: actor.uuid, power, entries: hidden });
}

/**
 * Destroy the Scouters of a Power Up (or ask the Craft DC of the variable ones) and post the card.
 * @param {string} actorUuid  who used the Power Up
 * @param {object} power      { name, top }
 * @param {object[]} entries  [{ uuid (the item), dc (null: variable), owner, squares, self }]
 * @param {boolean} hidden    tokens hidden from the players: the cards are only for the GM
 */
export async function breakScouters(actorUuid, power, entries, { hidden = false } = {}) {
  if ( !entries?.length ) return;
  const actor = await fromUuid(actorUuid);
  const broken = [];
  for ( const e of entries ) {
    const item = await fromUuid(e.uuid);
    if ( !item || ((item.system.quantity ?? 1) <= 0) ) continue;
    if ( e.dc === null ) await askScouterDc(actor, item, { ...e, ...power, hidden });
    else broken.push({ ...e, item: item.name, equipped: !!item.system.equipped, update: destroyedUpdate(item.system) });
  }
  if ( !broken.length ) return;
  await runOps(broken.map(b => ({ op: "update", uuid: b.uuid, data: b.update })));
  const card = { power, items: broken.map(({ update, ...b }) => b), undone: false };
  await ChatMessage.create({
    author: game.user.id, speaker: ChatMessage.getSpeaker({ actor }), content: await renderBreakCard(card),
    flags: { [FLAG]: { scouterBreak: card } }, ...(hidden ? { whisper: gmIds() } : {})
  });
}

/** The card of the Scouters a Power Up destroyed, with the GM's undo button. */
async function renderBreakCard(c) {
  const lines = [L("DBU.Scan.Break.Rule"),
    ...c.items.map(b => L("DBU.Scan.Break.Line", { item: b.item, dc: dcLabel(b.dc), owner: b.owner, where: whereText(b) }))];
  if ( c.undone ) lines.push(L("DBU.Scan.Break.Undone"));
  return foundry.applications.handlebars.renderTemplate(INFO_CARD, {
    title: L((c.items.length > 1) ? "DBU.Scan.Break.TitleMany" : "DBU.Scan.Break.Title"),
    subtitle: L("DBU.Scan.Break.Sub", { name: c.power.name, top: c.power.top }),
    lines, img: "icons/svg/explosion.svg",
    buttons: c.undone ? [] : [{ action: "scouterUndo", icon: "fa-solid fa-rotate-left", label: L("DBU.Scan.Break.Undo") }]
  });
}

/** The GM gives the destroyed Scouters back (one each, equipped again if they were). */
export async function undoScouterBreak(message) {
  if ( !game.user.isGM ) return false;
  const c = foundry.utils.deepClone(message.getFlag(FLAG, "scouterBreak"));
  if ( !c || c.undone ) return false;
  for ( const b of c.items ) {
    const item = await fromUuid(b.uuid);
    if ( item ) await item.update({ "system.quantity": (item.system.quantity ?? 0) + 1, ...(b.equipped ? { "system.equipped": true } : {}) });
  }
  c.undone = true;
  await message.update({ content: await renderBreakCard(c), [`flags.${FLAG}.scouterBreak`]: c });
  return true;
}

/**
 * Ask the owner of a Scouter without a Craft DC which one it has. One question per Scouter: a stronger Power Up before
 * the answer raises the Tier of Power of the question already asked.
 */
async function askScouterDc(actor, item, q) {
  const pending = game.messages.contents.findLast(m => {
    const a = m.getFlag(FLAG, "scouterAsk");
    return a && !a.state && (a.itemUuid === item.uuid);
  });
  if ( pending ) {
    const a = pending.getFlag(FLAG, "scouterAsk");
    if ( a.top >= q.top ) return null;
    const next = { ...a, top: q.top, name: q.name, squares: q.squares, self: q.self };
    return safeUpdate(pending, { content: await renderAskCard(next), [`flags.${FLAG}.scouterAsk`]: next });
  }
  const a = { itemUuid: item.uuid, item: item.name, img: item.img, owner: q.owner, name: q.name, top: q.top,
    squares: q.squares, self: q.self, state: null, dc: null };
  return ChatMessage.create({
    author: game.user.id, speaker: ChatMessage.getSpeaker({ actor }), content: await renderAskCard(a),
    flags: { [FLAG]: { scouterAsk: a } }, ...(q.hidden ? { whisper: gmIds() } : {})
  });
}

const ASK_STATES = { destroyed: "DBU.Scan.Ask.Destroyed", held: "DBU.Scan.Ask.Held", gone: "DBU.Scan.Ask.Gone" };

/** The question card: a button per Craft DC until it is answered, then what happened. */
async function renderAskCard(a) {
  const breaks = breakingDcs(a.top);
  const lines = a.state
    ? [L(ASK_STATES[a.state], { dc: dcLabel(a.dc), item: a.item, owner: a.owner })]
    : [L("DBU.Scan.Ask.Line", { item: a.item, owner: a.owner, top: a.top, where: whereText(a),
      breaks: breaks.map(dcLabel).join(L("DBU.Scan.Ask.Or")) }), L("DBU.Scan.Ask.Save")];
  return foundry.applications.handlebars.renderTemplate(INFO_CARD, {
    title: L("DBU.Scan.Ask.Title", { owner: a.owner }),
    subtitle: L("DBU.Scan.Break.Sub", { name: a.name, top: a.top }),
    lines, img: a.img,
    buttons: a.state ? [] : SCOUTER_DCS.map(k => ({ action: "scouterDc", payload: JSON.stringify({ dc: k }),
      icon: breaks.includes(k) ? "fa-solid fa-burst" : "fa-solid fa-shield-halved", label: dcLabel(k) }))
  });
}

/**
 * The Scouter's owner (or the GM) tells its Craft DC: it is saved on the item, and the Scouter is destroyed when the
 * Power Up was strong enough. Returns true when the question was answered.
 */
export async function answerScouterDc(message, dc) {
  const a = foundry.utils.deepClone(message.getFlag(FLAG, "scouterAsk"));
  if ( !a || !SCOUTER_DCS.includes(dc) ) return false;
  if ( a.state ) { ui.notifications.info(L("DBU.Scan.Ask.Already")); return false; }
  const item = await fromUuid(a.itemUuid);
  if ( !item ) { ui.notifications.warn(L("DBU.Scan.Ask.NoItem")); return false; }
  if ( !item.isOwner ) { ui.notifications.warn(L("DBU.Notify.NotOwner")); return false; }
  // Told on another card, or written on the item, in the meantime
  const known = craftDifficulty(item.system.craftDC);
  a.dc = known ?? dc;
  const update = known ? {} : { "system.craftDC": craftDCText(a.dc) };
  if ( (item.system.quantity ?? 1) <= 0 ) a.state = "gone";
  else if ( (scouterBreakTop(a.dc) ?? Infinity) <= a.top ) {
    a.state = "destroyed";
    Object.assign(update, destroyedUpdate(item.system));
  }
  else a.state = "held";
  if ( Object.keys(update).length ) await item.update(update);
  await safeUpdate(message, { content: await renderAskCard(a), [`flags.${FLAG}.scouterAsk`]: a });
  return true;
}
