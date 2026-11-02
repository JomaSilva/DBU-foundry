import { INJURY_TYPES, rules } from "../optional-rules.mjs";
import { postInfoCard } from "../dice/roller.mjs";
import { safeUpdate } from "../socket.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const { DialogV2 } = foundry.applications.api;
const CHANNEL = "system.dbu-rpg";

/** Traits that make a Character a "Regenerator" for the Injury System. */
const REGENERATOR = /namekian biology|namekian cells|rubbery body|nanomachine repair|karyon core|regenerative anatomy/i;

export function isRegenerator(actor) {
  return !!actor?.items.some(i => REGENERATOR.test(i.name));
}

/** Tail Injuries need a tail: the Tail Attack Maneuver, or an option such as Saiyan Heritage "Tailed" switched on. */
export function hasTail(actor) {
  if ( actor.items.some(i => /tail attack/i.test(i.name)) ) return true;
  return actor.items.some(i => (i.system.modifiers ?? []).some(m => m.active && /\btailed\b/i.test(m.label ?? "")));
}

/**
 * Injury System: can this hit inflict an Injury, and up to which Injury Threshold?
 * Damage must exceed 1/3 of the target's Maximum Life Points (1/4 with Lethal Damage, half of that against a
 * Regenerator); a Called Shot counts its Damage +1/4 but only inflicts the Injury Type stated at declaration.
 * The Injury Threshold comes from the Health Threshold after the hit: below Bruised → Minor, below Critical or
 * Defeated → Major.
 * @returns {{max: "minor"|"major", forcedType: string}|{noType: true}|null}
 */
export function injuryCheck(target, { damage, lifeAfter, lifeMax, category = 1, attack = null }) {
  if ( !rules().injurySystem || !attack || !(damage > 0) ) return null;
  let need = lifeMax / ((category >= 3) ? 4 : 3);
  if ( isRegenerator(target) ) need /= 2;
  let counted = damage;
  if ( attack.calledShot ) counted += Math.ceil(damage / 4);
  if ( !(counted > need) ) return null;
  let max = null;
  if ( (lifeAfter <= 0) || (lifeAfter <= lifeMax / 10) ) max = "major";
  else if ( lifeAfter <= lifeMax / 2 ) max = "minor";
  if ( !max ) return null;
  if ( attack.calledShot && !attack.injuryType ) return { noType: true };
  return { max, forcedType: attack.calledShot ? attack.injuryType : "" };
}

/**
 * Ask the attacker which Injury to inflict: the player who owns the attacking actor when online, otherwise the GM.
 * @param {{targetUuid: string, attackerUuid: string|null, max: string, forcedType: string, attackName: string}} data
 */
export function requestInjury(data) {
  const attacker = data.attackerUuid ? fromUuidSync(data.attackerUuid) : null;
  const players = attacker ? game.users.filter(u => u.active && !u.isGM && attacker.testUserPermission(u, "OWNER")) : [];
  if ( players.length ) {
    if ( players.some(u => u.id === game.user.id) ) return openInjuryDialog(data);
    game.socket.emit(CHANNEL, { action: "injury", userId: players[0].id, data });
    return null;
  }
  if ( game.user.isGM ) return openInjuryDialog(data);
  // Damage without an attacker (the sheet's damage calculator) or an attacker the GM runs: the GM chooses;
  // with no GM online, whoever applied the damage does
  const gm = game.users.activeGM;
  if ( !gm ) return openInjuryDialog(data);
  game.socket.emit(CHANNEL, { action: "injury", userId: gm.id, data });
  return null;
}

/** Socket: this user was asked to choose an Injury. */
export function onInjuryRequest(data) {
  return openInjuryDialog(data);
}

async function openInjuryDialog({ targetUuid, max, forcedType = "", attackName = "" }) {
  const target = await fromUuid(targetUuid);
  if ( !target ) return null;
  const tail = hasTail(target);
  const types = forcedType ? [forcedType] : INJURY_TYPES;
  const typeOptions = types.map(t => {
    const warn = ((t === "tail") && !tail) ? ` (${L("DBU.Injury.NoTail")})` : "";
    return `<option value="${t}">${L(`DBU.Injury.${t}`)}${warn}</option>`;
  }).join("");
  const severities = [["none", L("DBU.Injury.None")], ["minor", L("DBU.Injury.minor")], ...(max === "major" ? [["major", L("DBU.Injury.major")]] : [])];
  const content = `<div class="dbu-dialog dbu-injury">
    <p>${L("DBU.Injury.Question", { name: target.name, attack: attackName, max: L(`DBU.Injury.${max}`) })}</p>
    <div class="form-group"><label>${L("DBU.Injury.Threshold")}</label><div class="form-fields">
      ${severities.map(([v, l]) => `<label class="check"><input type="radio" name="severity" value="${v}" ${v === max ? "checked" : ""}> ${l}</label>`).join("")}
    </div></div>
    <div class="form-group"><label>${L("DBU.Injury.Type")}</label><select name="type">${typeOptions}</select></div>
    ${forcedType ? `<p class="hint">${L("DBU.Injury.CalledShotType")}</p>` : ""}
    <p class="hint">${L("DBU.Injury.Hint")}</p>
  </div>`;
  const choice = await DialogV2.wait({
    window: { title: L("DBU.Injury.Title", { name: target.name }), icon: "fa-solid fa-user-injured" },
    position: { width: 460 },
    content,
    buttons: [
      { action: "inflict", label: L("DBU.Injury.Inflict"), icon: "fa-solid fa-user-injured", default: true,
        callback: (event, button) => ({ severity: button.form.elements.severity.value, type: button.form.elements.type.value }) },
      { action: "skip", label: L("DBU.Injury.Skip"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if ( !choice || (choice === "skip") || (choice.severity === "none") ) return null;
  return inflictInjury(target, choice.type, choice.severity, { source: attackName });
}

/**
 * Give an Injury to an actor. A Minor Injury of a type the actor already has (not recovered) becomes a Major Injury.
 */
export async function inflictInjury(actor, type, severity, { source = "" } = {}) {
  const list = foundry.utils.deepClone(actor.system._source.optional.injuries ?? []);
  let result = severity;
  const same = (severity === "minor") ? list.find(i => (i.type === type) && (i.severity === "minor")) : null;
  if ( same ) {
    same.severity = "major";
    result = "upgraded";
  }
  else list.push({ type, severity, ignored: false });
  await safeUpdate(actor, { "system.optional.injuries": list });
  const lines = [
    L(`DBU.Injury.Effect.${type}.${result === "minor" ? "minor" : "major"}`),
    L("DBU.Injury.PoolLoss", { n: result === "minor" ? "1/10" : "1/5" })
  ];
  if ( result === "upgraded" ) lines.unshift(L("DBU.Injury.Upgraded"));
  if ( isRegenerator(actor) ) lines.push(L("DBU.Injury.RegenNote"));
  await postInfoCard({
    actor, img: actor.img, subtitle: source,
    title: L("DBU.Injury.Inflicted", { name: actor.name, type: L(`DBU.Injury.${type}`), severity: L(`DBU.Injury.${result === "minor" ? "minor" : "major"}`) }),
    lines
  });
  return result;
}

/** Regenerator: a Healing Surge may remove one Injury. */
export async function offerRegeneratorRemoval(actor) {
  const injuries = actor.system._source.optional.injuries ?? [];
  if ( !rules().injurySystem || !isRegenerator(actor) || !injuries.length ) return;
  const options = injuries.map((inj, i) => `<option value="${i}">${L(`DBU.Injury.${inj.type}`)} (${L(`DBU.Injury.${inj.severity}`)})</option>`).join("");
  const choice = await DialogV2.wait({
    window: { title: L("DBU.Injury.RegenTitle"), icon: "fa-solid fa-heart-pulse" },
    content: `<div class="dbu-dialog"><p>${L("DBU.Injury.RegenSurge")}</p><select name="index">${options}</select></div>`,
    buttons: [
      { action: "remove", label: L("DBU.Injury.Remove"), icon: "fa-solid fa-check", default: true,
        callback: (event, button) => Number(button.form.elements.index.value) },
      { action: "keep", label: L("DBU.Injury.Keep"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if ( !Number.isInteger(choice) ) return;
  const list = foundry.utils.deepClone(injuries);
  const [removed] = list.splice(choice, 1);
  await actor.update({ "system.optional.injuries": list });
  await postInfoCard({ actor, title: L("DBU.Injury.Removed", { name: actor.name }), lines: [`${L(`DBU.Injury.${removed.type}`)} (${L(`DBU.Injury.${removed.severity}`)})`] });
}

/** Regenerator: every Injury ends with the Combat Encounter. */
export async function clearRegeneratorInjuries(actor) {
  if ( !rules().injurySystem || !isRegenerator(actor) ) return false;
  if ( !(actor.system._source.optional.injuries ?? []).length ) return false;
  await actor.update({ "system.optional.injuries": [] });
  return true;
}

/** Foot/Leg Major Injury: failing a Steadfast Check knocks you Prone. */
export async function footLegProne(actor) {
  if ( !rules().injurySystem ) return false;
  const major = (actor.system._source.optional.injuries ?? []).some(i => (i.type === "footLeg") && (i.severity === "major") && !i.ignored);
  if ( !major || actor.system.conditions.prone ) return false;
  await actor.setCondition("prone", 1);
  return true;
}
