import { DBU } from "../config.mjs";
import { dbuRoll, postInfoCard } from "../dice/roller.mjs";
import { categoryToDice } from "../rules/dice.mjs";
import { emitGM, safeUpdate } from "../socket.mjs";
import { limitedPower, rules } from "../optional-rules.mjs";

const { DialogV2 } = foundry.applications.api;
const FDE = () => foundry.applications.ux.FormDataExtended;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const FLAG = "dbu-rpg";

/* -------------------------------------------- */
/*  Attack declaration                          */
/* -------------------------------------------- */

/**
 * Open the attack dialog for a Basic Attack (Profile) or a Signature Technique and resolve the Strike Roll.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {Item} [options.signature]
 * @param {string} [options.profile]
 */
export async function openAttackDialog(actor, { signature = null, profile = null } = {}) {
  const sys = actor.system;
  const sig = signature?.system ?? null;
  const comp = sig?.computed ?? null;
  const profileKey = sig ? sig.profile : (profile ?? "simple");
  const prof = DBU.profiles[profileKey];
  const T = sys.top.current;
  const kpT = sys.top.kp;
  const weapons = sys.weapons.wielded;
  const maxWager = Math.floor(sys.capacity.max / 2);
  const targets = Array.from(game.user.targets ?? []);

  // Profile Buyout: Basic Attacks only with Multi-Foundation Profiles plus the Profiles bought with TP
  const bought = new Set(sys.optional?.boughtProfiles ?? []);
  const allowed = ([k, p]) => !rules().profileBuyout || (p.foundations.length > 1) || bought.has(k);
  const profileOptions = Object.entries(DBU.profiles).filter(allowed).map(([k, p]) =>
    `<option value="${k}" ${k === profileKey ? "selected" : ""}>${p.label} — ${p.kp}(T) KP</option>`).join("");
  const foundationOptions = (prof?.foundations ?? ["physical"]).map(f =>
    `<option value="${f}" ${f === (sig?.foundation ?? prof.foundations[0]) ? "selected" : ""}>${L(DBU.foundations[f])}</option>`).join("");
  const weaponOptions = [`<option value="">${L("DBU.Attack.Unarmed")}</option>`,
    ...weapons.map(w => `<option value="${w.id}">${w.name} (${L(DBU.foundations[w.system.weaponType])})</option>`)].join("");
  const pending = sys.combat.energyCharges ?? 0;

  const content = `
  <div class="dbu-dialog">
    ${sig ? `<p class="dbu-dialog-sig"><strong>${signature.name}</strong> — ${L(`DBU.Sig.Level.${sig.level}`)} · ${prof?.label ?? ""} ·
      ${comp.kpUnits + comp.kpAdjust}(T) KP · ${comp.tp} TP</p>`
      : `<div class="form-group"><label>${L("DBU.Attack.Profile")}</label><select name="profile">${profileOptions}</select></div>`}
    <div class="form-group"><label>${L("DBU.Attack.Foundation")}</label><select name="foundation">${foundationOptions}</select></div>
    <div class="form-group"><label>${L("DBU.Attack.Weapon")}</label><select name="weaponId">${weaponOptions}</select></div>
    <div class="form-group"><label>${L("DBU.Attack.Wager")} (${L("DBU.Attack.WagerMax", { max: maxWager })})</label>
      <input type="number" name="wager" value="0" min="0" step="1"></div>
    ${(rules().desperation && !sys.optional.desperationUsed) ? `<div class="form-group"><label>${L("DBU.Attack.LifeWager", { max: Math.floor(sys.capacity.max / 2) })}</label>
      <input type="number" name="lifeWager" value="0" min="0" step="1"></div>` : ""}
    <div class="form-group"><label>${L("DBU.Attack.Charges")} (${L("DBU.Attack.Pending", { n: pending })})</label>
      <input type="number" name="extraCharges" value="0" min="0" step="1"></div>
    <div class="form-group"><label>${L("DBU.Attack.StrikeBonus")}</label><input type="number" name="strikeBonus" value="0" step="1"></div>
    <div class="form-group"><label>${L("DBU.Attack.WoundBonus")}</label><input type="number" name="woundBonus" value="0" step="1"></div>
    <div class="dbu-checks">
      <label><input type="checkbox" name="calledShot"> ${L("DBU.Attack.CalledShot")}</label>
      <label><input type="checkbox" name="longRange"> ${L("DBU.Attack.LongRange")}</label>
      <label><input type="checkbox" name="oblivious" ${sys.combat.hidden ? "checked" : ""}> ${L("DBU.Attack.Oblivious")}</label>
      <label><input type="checkbox" name="rapid"> ${L("DBU.Attack.Rapid")}</label>
      <label><input type="checkbox" name="spendAction" checked> ${L("DBU.Attack.SpendAction")}</label>
      <label><input type="checkbox" name="ignoreLimits"> ${L("DBU.Attack.IgnoreLimits")}</label>
    </div>
    <p class="hint">${targets.length ? L("DBU.Attack.Targets", { names: targets.map(t => t.name).join(", ") }) : L("DBU.Attack.NoTargets")}</p>
  </div>`;

  const data = await DialogV2.wait({
    window: { title: sig ? signature.name : L("DBU.Attack.Basic"), icon: "fa-solid fa-hand-fist" },
    position: { width: 460 },
    content,
    buttons: [
      { action: "attack", label: L("DBU.Attack.Roll"), icon: "fa-solid fa-dice-d10", default: true,
        callback: (event, button) => new (FDE())(button.form).object },
      { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }
    ],
    // The Foundation list follows the chosen Profile
    render: (event, dialog) => {
      const profileSelect = dialog.element.querySelector("select[name=profile]");
      const foundationSelect = dialog.element.querySelector("select[name=foundation]");
      if ( !profileSelect || !foundationSelect ) return;
      profileSelect.addEventListener("change", () => {
        const list = DBU.profiles[profileSelect.value]?.foundations ?? ["physical"];
        const current = foundationSelect.value;
        foundationSelect.innerHTML = list.map(f =>
          `<option value="${f}" ${f === current ? "selected" : ""}>${L(DBU.foundations[f])}</option>`).join("");
      });
    },
    rejectClose: false
  });
  if ( !data || (data === "cancel") ) return null;
  return executeAttack(actor, { ...data, signatureId: signature?.id ?? null, profile: sig ? profileKey : data.profile, targets });
}

/**
 * Pay the costs, roll the Strike and post the attack card.
 */
export async function executeAttack(actor, opts) {
  const sys = actor.system;
  const signature = opts.signatureId ? actor.items.get(opts.signatureId) : null;
  const sig = signature?.system ?? null;
  const comp = sig?.computed ?? null;
  const profileKey = opts.profile ?? sig?.profile ?? "simple";
  const prof = DBU.profiles[profileKey];
  if ( !prof ) return ui.notifications.error(L("DBU.Sig.ErrNoProfile"));
  const foundation = opts.foundation ?? prof.foundations[0];
  const weapon = opts.weaponId ? actor.items.get(opts.weaponId) : null;
  const T = sys.top.current;
  const bT = sys.top.base;
  const kpT = sys.top.kp;
  const ignore = !!opts.ignoreLimits;
  const problems = [];

  // Foundation requirements
  if ( (foundation === "energy") && (sys.attributes.fo.score < 3) && !sys.flags.energyWithoutFO ) problems.push(L("DBU.Attack.ErrEnergyFO"));
  if ( (foundation === "magic") && (sys.attributes.ma.score < 3) && !sys.flags.magicWithoutMA ) problems.push(L("DBU.Attack.ErrMagicMA"));
  if ( weapon && (weapon.system.weaponType !== foundation) ) problems.push(L("DBU.Attack.ErrWeaponFoundation"));
  if ( weapon && sig && !comp.weaponAssisted ) problems.push(L("DBU.Attack.ErrWeaponAssisted"));
  if ( sig && (comp.errors?.length) ) problems.push(L("DBU.Attack.ErrSignatureInvalid"));
  if ( sig && comp.ultimate && sig.usedThisEncounter ) problems.push(L("DBU.Attack.ErrUltimateUsed"));
  if ( sig && comp.ultimate && ((sys.combat.ultimatesUsed ?? 0) >= 3) ) problems.push(L("DBU.Attack.ErrUltimate3"));
  if ( sig && comp.climax && (sys.health.count < comp.climax) ) problems.push(L("DBU.Attack.ErrClimax"));
  if ( sig && comp.mandatoryCharge && ((sys.combat.energyCharges ?? 0) < 2 * comp.mandatoryCharge) ) {
    problems.push(L("DBU.Attack.ErrMandatoryCharge", { n: 2 * comp.mandatoryCharge }));
  }
  if ( sys.effectiveConditions.transfigured && (foundation !== "physical" || sig) ) problems.push(L("DBU.Attack.ErrTransfigured"));
  if ( sys.effectiveConditions.pinned ) problems.push(L("DBU.Attack.ErrPinned"));

  /* ----- Ki Point Cost ----- */
  let units = sig ? (comp.kpUnits + comp.kpAdjust) : prof.kp;
  let minUnits = sig ? comp.kpMinUnits : (prof.kp / 2);
  const weaponCat = weapon ? DBU.weaponCategories[weapon.system.category] : null;
  if ( weaponCat?.kp && ((weaponCat.type !== "magic") || (foundation === "magic")) ) units += weaponCat.kp;
  const R = rules();
  const ballistic = R.ballistics && weapon?.system.ballistic;
  let kp = Math.ceil(units * kpT) + sys.costs.attack + (sys.kpCostByFoundation?.[foundation] ?? 0);
  let minKp = Math.ceil(minUnits * kpT);
  if ( sys.costs.perfectKiControl ) minKp = Math.min(minKp, 2 * kpT);
  kp = Math.max(minKp, kp);
  // Ballistics: Basic Attacks with a Ballistic Weapon cost no Ki; Signatures cost half
  if ( ballistic ) kp = sig ? Math.ceil(kp / 2) : 0;
  if ( opts.calledShot ) kp += 2 * T;
  if ( opts.rapid ) kp += 2 * T;
  let ammoCost = 0;
  if ( ballistic ) {
    ammoCost = Math.max(1, Math.ceil(prof.kp / 2));
    if ( (weapon.system.ammo.value ?? 0) < ammoCost ) problems.push(L("DBU.Attack.ErrAmmo", { need: ammoCost, have: weapon.system.ammo.value }));
  }

  /* ----- Ki Wager ----- */
  let wager = Math.max(0, Number(opts.wager) || 0);
  const capacityLeft = sys.capacity.value - kp;
  let wagerLimit = Math.floor(sys.capacity.max / 2);
  if ( comp?.fullWager ) wagerLimit = Math.max(0, capacityLeft);
  const wired = weapon?.system.qualities?.some(q => /wired/i.test(q.name));
  if ( ballistic ) wagerLimit = wired ? Math.floor(sys.capacity.max / 4) : 0;
  // Desperation Rules: Life Points may join the Ki Wager (up to 1/2 of the Capacity)
  const lifeWager = (R.desperation && !sys.optional.desperationUsed) ? Math.max(0, Number(opts.lifeWager) || 0) : 0;
  if ( lifeWager > Math.floor(sys.capacity.value / 2) ) problems.push(L("DBU.Attack.ErrLifeWager", { max: Math.floor(sys.capacity.value / 2) }));
  if ( lifeWager >= sys.life.value ) problems.push(L("DBU.Attack.ErrLifeWagerLP"));
  if ( sig?.superProfile === "allOut" ) wager = Math.min(sys.ki.value - kp, sys.capacity.max);
  if ( comp?.allOrNothing ) wager = Math.max(0, Math.min(wagerLimit, capacityLeft));
  if ( wager > wagerLimit ) problems.push(L("DBU.Attack.ErrWagerMax", { max: wagerLimit }));
  const totalKi = kp + wager;
  if ( totalKi > sys.ki.value ) problems.push(L("DBU.Attack.ErrKi", { need: totalKi, have: sys.ki.value }));
  if ( (sig?.superProfile !== "allOut") && (totalKi > sys.capacity.value) ) {
    problems.push(L("DBU.Attack.ErrCapacity", { need: totalKi, have: sys.capacity.value }));
  }

  /* ----- Actions ----- */
  const actionCost = (opts.spendAction ? 1 : 0) + (opts.calledShot ? 1 : 0);
  if ( opts.spendAction && (sys.combat.actions < actionCost) && game.combat?.started ) {
    problems.push(L("DBU.Attack.ErrActions", { need: actionCost, have: sys.combat.actions }));
  }

  if ( problems.length && !ignore ) {
    ui.notifications.error(problems.join(" "), { permanent: false });
    await postInfoCard({ actor, title: L("DBU.Attack.Blocked"), lines: problems, whisper: [game.user.id] });
    return null;
  }

  /* ----- Energy Charges ----- */
  const pending = sys.combat.energyCharges ?? 0;
  let charges = (ballistic && !wired ? 0 : pending) + (Number(opts.extraCharges) || 0) + (prof.freeCharges ?? 0);
  if ( sig && comp.ultimate ) charges += sys.health.count;
  if ( sig && comp.transformationBoost && sys.transformation.forms.length ) charges += 1;
  let maxCharges = sig ? comp.maxCharges : (prof.maxCharges ?? 7);
  if ( ballistic ) maxCharges = Math.ceil(sys.attributes.sc.mod / 4);
  if ( limitedPower(sys) ) maxCharges = Math.min(maxCharges, 3);
  charges = Math.min(charges, maxCharges);
  const bonusCharges = prof.bonusCharges ?? 0; // Beam: does not count toward the maximum
  const totalCharges = charges + bonusCharges;
  const chargeCategory = sys.chargeCategory + (sig ? comp.chargeCategory : 0);

  /* ----- Damage Category ----- */
  let category = prof.cat;
  if ( (sig?.superProfile === "multiProfile") && DBU.profiles[sig.multiProfile] ) category = Math.max(category, DBU.profiles[sig.multiProfile].cat);
  if ( opts.calledShot ) category += 1;
  if ( (profileKey === "megaFlare") && (charges >= 7) ) category += 1;

  /* ----- Pay ----- */
  const update = {
    "system.ki.value": Math.max(0, sys.ki.value - totalKi),
    "system.combat.attacksThisRound": (sys.combat.attacksThisRound ?? 0) + 1,
    "system.combat.energyCharges": 0
  };
  if ( sig?.superProfile !== "allOut" ) update["system.capacity.value"] = Math.max(0, sys.capacity.value - totalKi);
  if ( (sig?.superProfile === "allOut") || comp?.allOrNothing ) update["system.capacity.value"] = 0;
  if ( game.combat?.started && opts.spendAction ) update["system.combat.actions"] = Math.max(0, sys.combat.actions - actionCost);
  if ( pending && sys.conditions.guardDown ) update["system.conditions.guardDown"] = 0;
  if ( sig && comp.ultimate ) update["system.combat.ultimatesUsed"] = (sys.combat.ultimatesUsed ?? 0) + 1;
  // Life Point Cost to attack (Kaioken, Super Kaioken...)
  const lifeCost = Math.max(0, sys.buckets?.attackLifeCost?.total ?? 0);
  if ( lifeWager > 0 || lifeCost > 0 ) {
    update["system.life.value"] = sys.life.value - lifeWager - lifeCost;
    if ( lifeWager > 0 ) update["system.optional.desperationUsed"] = true;
  }
  await actor.update(update, (lifeWager > 0 || lifeCost > 0) ? { dbuSelfInflicted: true } : {});
  if ( ballistic ) await weapon.update({ "system.ammo.value": Math.max(0, weapon.system.ammo.value - ammoCost) });
  if ( pending && sys.conditions.guardDown ) await actor.toggleStatusEffect("guardDown", { active: false }).catch(() => null);
  if ( sig && comp.ultimate ) await signature.update({ "system.usedThisEncounter": true });

  /* ----- Strike Roll ----- */
  const fresh = actor.system; // re-prepared after the update (Diminishing Offense applied)
  const strikeData = fresh.rolls.strike;
  const parts = [...strikeData.parts];
  const add = (label, value) => { if ( value ) parts.push({ label, value }); };
  add(L(DBU.foundations[foundation]), fresh.rolls[`strike_${foundation}`] ?? 0);
  if ( profileKey === "crushing" ) add("Crushing (½ Haste)", -Math.ceil(fresh.aptitudes.haste / 2));
  if ( sig ) {
    add(L("DBU.Sig.Accurate"), comp.strikeT * T);
    add(signature.name, fresh.buckets["strike.signature"]?.total ?? 0);
    if ( opts.longRange ) add("Long Shot", comp.longShotT * T);
    if ( comp.lastLegs ) {
      add("Last Legs", fresh.health.count * T);
      add(L("DBU.ThresholdPenalty"), fresh.health.combatPenalty);
    }
    if ( sig.superProfile === "combo" ) add("Combo Attack", 2 * T);
    if ( comp.shortRange === 1 && opts.longRange ) add("Short Range", -2 * bT);
  }
  if ( weapon ) {
    add(L("DBU.WeaponSize.label"), (DBU.weaponSizes[weapon.system.size]?.strike ?? 0) * T);
    add(L("DBU.Attack.Armed"), fresh.buckets["strike.armed"]?.total ?? 0);
    if ( opts.calledShot && weaponCat?.calledStrike ) add(weaponCat.label, weaponCat.calledStrike * T);
  }
  else add(L("DBU.Attack.Unarmed"), fresh.buckets["strike.unarmed"]?.total ?? 0);
  if ( prof.elemental && isFavored(actor, profileKey) ) add(L("DBU.Attack.Favored"), 1 * T);
  if ( opts.calledShot ) add("Called Shot", -2 * T);
  if ( opts.longRange && !(sig && comp.shortRange === 1) ) add("Long Range", -2 * bT);
  if ( opts.oblivious ) add("Hidden", 2 * bT);
  if ( opts.rapid ) add("Rapid Movement", 1 * T);
  add(L("DBU.Attack.Situational"), Number(opts.strikeBonus) || 0);

  const targets = (opts.targets ?? []).map(t => ({
    tokenUuid: t.document?.uuid ?? null, actorUuid: t.actor?.uuid ?? null, name: t.name, img: t.document?.texture?.src ?? t.actor?.img,
    result: null, defense: null, damage: null, dimApplied: false
  }));

  // Age: Mini stacks may make the attack miss automatically
  const notesExtra = [];
  if ( R.age && (fresh.optional.mini > 0) ) {
    const mini = await new Roll("1d10").evaluate();
    if ( mini.total <= 1 + fresh.optional.mini ) notesExtra.push(L("DBU.Attack.MiniMiss", { roll: mini.total }));
    else notesExtra.push(L("DBU.Attack.MiniOk", { roll: mini.total }));
  }
  if ( ballistic ) notesExtra.push(L("DBU.Attack.Ballistic", { ammo: ammoCost, left: weapon.system.ammo.value }));
  if ( lifeCost > 0 ) notesExtra.push(L("DBU.Attack.LifeCost", { n: lifeCost }));

  const attack = {
    attackerUuid: actor.uuid, name: signature?.name ?? `${L("DBU.Attack.Basic")}: ${prof.label}`,
    signatureId: signature?.id ?? null, profile: profileKey, foundation, weaponId: weapon?.id ?? null,
    kp, wager: wager + lifeWager, charges: totalCharges, chargeCategory, category, ballistic: !!ballistic,
    caliber: ballistic ? (weapon.system.caliber ?? 0) : 0,
    calledShot: !!opts.calledShot, longRange: !!opts.longRange, oblivious: !!opts.oblivious,
    woundBonus: Number(opts.woundBonus) || 0, ultimate: !!comp?.ultimate,
    sig: comp ? { woundT: comp.woundT, longShotT: comp.longShotT, lastLegs: comp.lastLegs, lowPowerCrush: comp.lowPowerCrush,
      armorPiercing: comp.armorPiercing, shatteringBlow: comp.shatteringBlow, penetration: comp.penetration,
      sustained: comp.sustained, backlash: comp.backlash, twinLinked: comp.twinLinked, deadLink: comp.deadLink,
      shortRange: comp.shortRange, powerBurst: comp.powerBurst, superProfile: sig.superProfile } : null,
    autoHit: fresh.flags.autoHit,
    targets, wound: null
  };

  const result = await dbuRoll({
    actor, kind: "strike",
    title: `${L("DBU.Roll.Strike")} — ${attack.name}`,
    subtitle: `${prof.label} · ${L(DBU.foundations[foundation])} · ${L(DBU.damageCategories[Math.clamp(category, 1, 3)])}`,
    naturalMod: strikeData.natural, minNatural: prof.minNatural,
    critTarget: strikeData.crit, botchRange: strikeData.botch,
    diceGroups: strikeData.dice, parts, critDice: strikeData.critDice, botchPenalty: strikeData.botchPenalty,
    cutting: !!prof.cutting,
    twin: (attack.sig?.twinLinked === "strike") ? "high" : ((attack.sig?.deadLink === "strike") ? "low" : null),
    notes: [
      L("DBU.Attack.Paid", { kp, wager: wager + lifeWager, charges: totalCharges }),
      ...notesExtra,
      ...(problems.length ? [`⚠ ${problems.join(" ")}`] : [])
    ],
    toMessage: false
  });
  attack.strike = { total: result.total, natural: result.natural, crit: result.crit, botch: result.botch };

  const message = await postAttackCard(actor, attack, result);

  // Post-attack Signature drawbacks
  if ( attack.sig?.backlash ) await actor.update({ "system.life.value": Math.max(0, actor.system.life.value - (2 * bT * attack.sig.backlash)) },
    { dbuSelfInflicted: true });
  return message;
}

function isFavored(actor, profileKey) {
  const label = (DBU.profiles[profileKey]?.label ?? "").toLowerCase();
  return actor.items.some(i => (i.type === "weapon") && i.system.isActive && (i.system.category === "elementalTool")
    && i.system.favoredElement && label.includes(i.system.favoredElement.toLowerCase()))
    || actor.items.some(i => (i.system.modifiers ?? []).some(m => (m.target === "favoredElement")
      && label.includes(String(m.value).toLowerCase())));
}

/* -------------------------------------------- */
/*  Attack card                                 */
/* -------------------------------------------- */

async function renderAttackContent(attack, rollResult) {
  return foundry.applications.handlebars.renderTemplate("systems/dbu-rpg/templates/chat/attack-card.hbs", {
    attack,
    roll: rollResult ?? attack.strikeView,
    category: L(DBU.damageCategories[Math.clamp(attack.category, 1, 3)]),
    hasTargets: attack.targets.length > 0
  });
}

async function postAttackCard(actor, attack, result) {
  attack.strikeView = {
    total: result.total, natural: result.natural, rawNatural: result.rawNatural, crit: result.crit, botch: result.botch,
    extra: result.extra.map(e => ({ label: e.label, formula: e.formula, total: e.total })),
    parts: result.parts.filter(p => Number(p.value)).map(p => ({ label: p.label, value: p.value >= 0 ? `+${p.value}` : `${p.value}` })),
    critTotal: result.critRoll?.total ?? 0, twin: result.twin ?? null
  };
  const content = await renderAttackContent(attack);
  const data = {
    author: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: result.rolls,
    sound: CONFIG.sounds.dice,
    flags: { [FLAG]: { kind: "attack", attack } }
  };
  ChatMessage.applyMode(data, game.settings.get("core", "messageMode"));
  return ChatMessage.create(data);
}

async function refreshAttackMessage(message, attack) {
  const content = await renderAttackContent(attack);
  return message.update({ content, [`flags.${FLAG}.attack`]: attack });
}

/* -------------------------------------------- */
/*  Defense                                     */
/* -------------------------------------------- */

/**
 * The defender reacts to an attack card.
 * @param {ChatMessage} message
 * @param {number} index        Target index in the attack
 * @param {string} mode         dodge | parry | guard | directHit | crossCounter | powerFlare | none
 */
export async function rollDefense(message, index, mode = "dodge") {
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  const target = attack?.targets?.[index];
  if ( !target ) return;
  const actor = await resolveActor(target);
  if ( !actor ) return ui.notifications.warn(L("DBU.Notify.NoActor"));
  if ( !actor.isOwner ) return ui.notifications.warn(L("DBU.Notify.NotOwner"));
  if ( target.result ) return ui.notifications.info(L("DBU.Defense.AlreadyResolved"));
  const sys = actor.system;
  const T = sys.top.current;
  const bT = sys.top.base;
  const strike = attack.strike.total;
  const usesCounter = ["parry", "guard", "directHit", "crossCounter", "powerFlare"].includes(mode);
  const rec = { mode, total: 0, natural: null, crit: false };
  const update = {};

  if ( usesCounter ) {
    if ( (sys.combat.counters ?? 0) < 1 ) ui.notifications.warn(L("DBU.Defense.NoCounter"));
    update["system.combat.counters"] = Math.max(0, (sys.combat.counters ?? 0) - 1);
  }

  let hit = true;
  const auto = attack.autoHit || sys.effectiveConditions.sleeping;
  if ( mode === "dodge" || mode === "crossCounter" ) {
    const d = sys.rolls.dodge;
    const parts = [...d.parts];
    if ( mode === "crossCounter" ) parts.push({ label: "Cross Counter (½ DV)", value: -Math.ceil(sys.aptitudes.defenseValue / 2) });
    const r = await dbuRoll({
      actor, kind: "dodge", title: `${L("DBU.Roll.Dodge")} — ${actor.name}`, subtitle: L("DBU.Defense.Against", { name: attack.name, total: strike }),
      naturalMod: d.natural, critTarget: d.crit, botchRange: d.botch, diceGroups: d.dice, parts,
      critDice: d.critDice, botchPenalty: d.botchPenalty
    });
    rec.total = r.total; rec.natural = r.natural; rec.crit = r.crit;
    hit = auto || (strike > r.total);
  }
  else if ( mode === "parry" ) {
    const s = sys.rolls.strike;
    const parts = [...s.parts, { label: L("DBU.Foundation.physical"), value: sys.rolls.strike_physical ?? 0 }];
    if ( attack.charges ) parts.push({ label: L("DBU.Attack.Charges"), value: -attack.charges * bT });
    if ( sys.effectiveConditions.guardDown ) parts.push({ label: L("DBU.Condition.guardDown"), value: -2 * T });
    const r = await dbuRoll({
      actor, kind: "strike", title: `Parry — ${actor.name}`, subtitle: L("DBU.Defense.Against", { name: attack.name, total: strike }),
      naturalMod: s.natural, critTarget: s.crit, botchRange: s.botch, diceGroups: s.dice, parts,
      critDice: s.critDice, botchPenalty: s.botchPenalty
    });
    rec.total = r.total; rec.natural = r.natural; rec.crit = r.crit;
    hit = auto || (strike > r.total);
  }
  else if ( mode === "guard" ) {
    const extra = Math.min(attack.charges, 4) * bT;
    const cost = Math.ceil((sys.costs.guard + extra) * sys.costs.guardMultiplier);
    if ( cost > sys.ki.value ) ui.notifications.warn(L("DBU.Attack.ErrKi", { need: cost, have: sys.ki.value }));
    update["system.ki.value"] = Math.max(0, sys.ki.value - cost);
    update["system.capacity.value"] = Math.max(0, sys.capacity.value - cost);
    rec.cost = cost;
    hit = true;
  }
  else {
    hit = true; // Direct Hit / Power Flare / no defense
  }

  // Diminishing Defense: only when no Defend Maneuver was used
  if ( !usesCounter ) {
    let stacks = sys.dimDefensePerAttack;
    update["system.combat.dimDefense"] = (sys.combat.dimDefense ?? 0) + stacks;
    rec.dim = stacks;
  }
  if ( Object.keys(update).length ) await actor.update(update);

  const result = { hit, defense: rec };
  if ( message.isOwner ) await resolveDefenseOnMessage(message.id, index, result);
  else if ( !emitGM("attackResult", { messageId: message.id, targetIndex: index, result }) ) {
    await postInfoCard({ actor, title: hit ? L("DBU.Defense.Hit") : L("DBU.Defense.Miss"), lines: [attack.name] });
  }
  return result;
}

/** Store the defense outcome on the attack card (author or GM only). */
export async function resolveDefenseOnMessage(messageId, index, result) {
  const message = game.messages.get(messageId);
  if ( !message ) return;
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  const t = attack.targets[index];
  if ( !t ) return;
  t.result = result.hit ? "hit" : "miss";
  t.defense = result.defense;
  t.dimApplied = !!result.defense?.dim;
  await refreshAttackMessage(message, attack);
}

/* -------------------------------------------- */
/*  Wound                                       */
/* -------------------------------------------- */

export async function rollWound(message) {
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  if ( !attack ) return;
  const actor = await fromUuid(attack.attackerUuid);
  if ( !actor?.isOwner ) return ui.notifications.warn(L("DBU.Notify.NotOwner"));
  if ( attack.wound ) return ui.notifications.info(L("DBU.Wound.Already"));
  const sys = actor.system;
  const T = sys.top.current;
  const bT = sys.top.base;
  const f = attack.foundation;
  const w = sys.rolls.wound[f];
  const prof = DBU.profiles[attack.profile];
  const weapon = attack.weaponId ? actor.items.get(attack.weaponId) : null;
  const weaponCat = weapon ? DBU.weaponCategories[weapon.system.category] : null;
  const parts = [...w.parts];
  const add = (label, value) => { if ( value ) parts.push({ label, value }); };
  const dmgAttr = w.damageAttribute;

  add("Ki Wager", attack.wager);
  if ( attack.ballistic ) {
    add(L("DBU.Attack.BallisticNoAttr"), -dmgAttr);
    add("Caliber", attack.caliber);
  }
  if ( prof.extraDamageAttribute ) add(`${prof.label} (+${L("DBU.Attack.DamageAttribute")})`, dmgAttr * prof.extraDamageAttribute);
  if ( attack.sig?.superProfile === "annihilation" ) add("Complete Annihilation", dmgAttr);
  if ( attack.sig?.lowPowerCrush ) add("Low-Power Crush", -Math.ceil(dmgAttr / 2));
  if ( attack.sig ) {
    add(L("DBU.Sig.PowerShot"), attack.sig.woundT * T);
    add(attack.name, sys.buckets["wound.signature"]?.total ?? 0);
    if ( attack.longRange ) add("Long Shot", attack.sig.longShotT * T);
    if ( attack.sig.lastLegs ) {
      add("Last Legs", sys.health.count * T);
      add(L("DBU.ThresholdPenalty"), sys.health.combatPenalty);
    }
    if ( (attack.sig.shortRange === 1) && attack.longRange ) add("Short Range", -2 * bT);
    if ( attack.sig.powerBurst ) {
      const extraStacks = Math.max(0, Math.min(3, sys.superStacks + attack.sig.powerBurst) - sys.superStacks);
      if ( f !== "magic" ) add("Power Burst (Massive Power)", extraStacks * Math.floor(sys.attributes.fo.mod / 4));
    }
  }
  if ( attack.profile === "megaFlare" ) add("Mega Flare", attack.charges * T);
  if ( weapon ) {
    add(L("DBU.WeaponSize.label"), (DBU.weaponSizes[weapon.system.size]?.wound ?? 0) * T);
    if ( weaponCat?.wound ) add(weaponCat.label, weaponCat.wound * T);
    if ( weaponCat?.simpleWound && (attack.profile === "simple") ) add(weaponCat.label, weaponCat.simpleWound * T);
    if ( attack.calledShot && weaponCat?.calledWound ) add(weaponCat.label, weaponCat.calledWound * T);
    add(L("DBU.Attack.Armed"), sys.buckets["wound.armed"]?.total ?? 0);
  }
  else add(L("DBU.Attack.Unarmed"), sys.buckets["wound.unarmed"]?.total ?? 0);
  if ( prof.elemental && isFavored(actor, attack.profile) ) add(L("DBU.Attack.Favored"), 2 * T);
  add(L("DBU.Attack.Situational"), attack.woundBonus);

  // Energy Charges: 1d6(T) each, d8 for Signatures (Charged Up), plus any category increases
  const diceGroups = [...w.dice];
  if ( attack.charges > 0 ) {
    const perCharge = categoryToDice(attack.chargeCategory, T);
    const dice = perCharge.map(g => ({ number: g.number * attack.charges, faces: g.faces }));
    diceGroups.push({ dice, label: L("DBU.Attack.Charges") });
  }

  const critTarget = (prof.cutting) ? 5 : w.crit;
  const result = await dbuRoll({
    actor, kind: "wound", title: `${L("DBU.Roll.Wound")} — ${attack.name}`,
    subtitle: `${L(DBU.damageCategories[Math.clamp(attack.category, 1, 3)])} · ${attack.charges} ${L("DBU.Attack.ChargesShort")}`,
    naturalMod: w.natural, critTarget, botchRange: w.botch, diceGroups, parts,
    critDice: w.critDice, botchPenalty: w.botchPenalty,
    twin: (attack.sig?.twinLinked === "wound") ? "high" : ((attack.sig?.deadLink === "wound") ? "low" : null),
    toMessage: true,
    flags: { attackMessageId: message.id }
  });
  const wound = {
    total: result.total, natural: result.natural, crit: result.crit, botch: result.botch,
    messageId: result.message?.id ?? null
  };
  if ( message.isOwner ) await storeWoundOnMessage(message.id, wound);
  else emitGM("attackWound", { messageId: message.id, wound });
  return wound;
}

export async function storeWoundOnMessage(messageId, wound) {
  const message = game.messages.get(messageId);
  if ( !message ) return;
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  attack.wound = wound;
  await refreshAttackMessage(message, attack);
}

/* -------------------------------------------- */
/*  Damage                                      */
/* -------------------------------------------- */

/**
 * Compute the Damage a target receives from an attack.
 * Order: Wound → (Guard halves) → Damage Reduction → Soak by Damage Category → extra damage effects.
 */
export function computeDamage(targetActor, attack, attacker = null, def = null) {
  const tsys = targetActor.system;
  let wound = attack.wound?.total ?? 0;
  const lines = [];
  let category = attack.category + (tsys.damageCategoryTaken ?? 0);
  if ( def?.mode === "guard" ) {
    wound = Math.floor(wound / 2);
    category -= 1;
    lines.push(L("DBU.Damage.Guard"));
  }
  category = Math.clamp(category, 1, 3);

  // Damage Reduction
  let dr = tsys.aptitudes.dr;
  const weaponCat = attack.weaponId && attacker ? DBU.weaponCategories[attacker.items.get(attack.weaponId)?.system.category] : null;
  if ( weaponCat?.ignoreHalfDR || DBU.profiles[attack.profile]?.ignoreHalfDR ) dr = Math.ceil(dr / 2);
  if ( attack.sig?.armorPiercing && attacker ) dr = Math.max(0, dr - Math.floor(attacker.system.attributes.in.mod / 2));

  // Soak
  let soak = tsys.aptitudes.soak;
  if ( def?.mode === "directHit" ) soak = soak + Math.floor(soak / 2);
  if ( (attack.profile === "pinpoint") && attacker ) {
    const ins = attacker.system.attributes.in.mod * (attack.strike?.crit ? 2 : 1);
    soak = Math.max(0, soak - ins);
  }
  if ( weaponCat?.ignoreQuarterSoak ) soak = Math.max(0, soak - Math.ceil(tsys.aptitudes.soakBeforeBroken / 4));
  const soakApplied = category === 1 ? soak : (category === 2 ? Math.floor(soak / 2) : 0);

  let damage = Math.max(0, wound - dr - soakApplied);
  if ( damage > 0 ) {
    damage += tsys.aptitudes.brokenOverflow ?? 0;
    damage += tsys.damageTaken ?? 0;
    if ( attack.sig?.shatteringBlow ) damage += attack.sig.shatteringBlow * Math.floor(tsys.aptitudes.soak / 4);
  }
  lines.push(L("DBU.Damage.Breakdown", {
    wound, dr, soak: soakApplied, cat: L(DBU.damageCategories[category]), damage
  }));
  return { damage, category, dr, soakApplied, wound, lines };
}

/** Button on the attack card: apply damage to one target. */
export async function applyAttackDamage(message, index) {
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  const t = attack?.targets?.[index];
  if ( !t || !attack.wound ) return;
  if ( t.result === "miss" ) return ui.notifications.info(L("DBU.Damage.Missed"));
  if ( t.damage !== null && t.damage !== undefined ) return ui.notifications.info(L("DBU.Damage.Already"));
  const target = await resolveActor(t);
  const attacker = await fromUuid(attack.attackerUuid);
  if ( !target ) return;
  const res = computeDamage(target, attack, attacker, t.defense);
  await applyDamageToActor(target, res.damage, { attacker, attack, lines: res.lines });
  // Diminishing Defense when the target never rolled a defense
  if ( !t.dimApplied && !t.defense ) {
    const stacks = target.system.dimDefensePerAttack * ((attack.profile === "sweeping" && res.damage > 0) ? 2 : 1);
    await safeUpdate(target, { "system.combat.dimDefense": (target.system.combat.dimDefense ?? 0) + stacks });
  }
  // On-damage Signature effects
  if ( res.damage > 0 && attack.sig ) {
    const upd = {};
    if ( attack.sig.penetration ) upd["system.conditions.broken"] = Math.min(3, target.system.conditions.broken + attack.sig.penetration);
    if ( attack.sig.sustained ) upd["system.combat.dot"] = (target.system.combat.dot ?? 0) + attack.sig.sustained;
    if ( Object.keys(upd).length ) await safeUpdate(target, upd);
  }
  const damage = { amount: res.damage, category: res.category };
  if ( message.isOwner ) await storeDamageOnMessage(message.id, index, damage);
  else emitGM("attackDamage", { messageId: message.id, targetIndex: index, damage });
}

export async function storeDamageOnMessage(messageId, index, damage) {
  const message = game.messages.get(messageId);
  if ( !message ) return;
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  if ( !attack.targets[index] ) return;
  attack.targets[index].damage = damage.amount;
  attack.targets[index].damageCategory = damage.category;
  if ( !attack.targets[index].result ) attack.targets[index].result = "hit";
  await refreshAttackMessage(message, attack);
}

/**
 * Reduce Life Points (through the GM if needed) and grant Bonus Momentum to the attacker.
 */
export async function applyDamageToActor(target, damage, { attacker = null, attack = null, lines = [], selfInflicted = false } = {}) {
  const tsys = target.system;
  const before = tsys.life.value;
  const after = before - damage;
  const undying = (tsys._effectiveStates?.undying ?? 0) > 0;
  const value = undying ? after : Math.max(0, after);
  await safeUpdate(target, { "system.life.value": value }, { dbuDamage: { attackerUuid: attacker?.uuid ?? null, selfInflicted } });
  const R = rules();
  const notes = [];
  const max = tsys.life.max;
  // Overkill Rules: more than 1/3 (rounded up) of the Maximum Life Points in one attack
  if ( R.overkill && attack && (damage > Math.ceil(max / 3)) ) notes.push(L("DBU.Damage.Overkill"));
  // Injury System: Damage above 1/3 (Lethal: 1/4) of the Maximum Life Points while below Bruised
  if ( R.injurySystem && attack && (damage > 0) ) {
    const lethal = (attack.category ?? 1) >= 3;
    const regen = target.items.some(i => /namekian biology|namekian cells|rubbery body|nanomachine repair|karyon core|regenerative anatomy/i.test(i.name));
    let need = max / (lethal ? 4 : 3);
    if ( regen ) need /= 2;
    if ( (damage > need) && (value <= max / 2) ) {
      const major = (value <= max / 10) || (value <= 0);
      notes.push(L(major ? "DBU.Injury.CanMajor" : "DBU.Injury.CanMinor", { name: target.name }));
    }
  }
  await postInfoCard({
    actor: target, title: L("DBU.Damage.Applied", { name: target.name, damage }),
    subtitle: attack?.name ?? "", lines: [...lines, L("DBU.Damage.LifeChange", { before, after: value }), ...notes],
    img: target.img
  });

  // Bonus Momentum: knocking an Opponent through a Health Threshold (once per Combat Round)
  if ( attacker && game.combat?.started && !selfInflicted ) {
    const max = tsys.life.max;
    const crossed = DBU.thresholds.some(k => (before > max * DBU.THRESHOLD_FRACTIONS[k]) && (value <= max * DBU.THRESHOLD_FRACTIONS[k]));
    const minionDefeated = (target.type === "npc") && (target.system.npcType === "minion") && (value <= 0);
    if ( (crossed || minionDefeated) && !attacker.system.combat.momentumUsed ) {
      await safeUpdate(attacker, {
        "system.combat.actions": (attacker.system.combat.actions ?? 0) + 1,
        "system.combat.momentumUsed": true
      });
      await postInfoCard({ actor: attacker, title: L("DBU.Momentum.Title"), lines: [L("DBU.Momentum.Text", { name: attacker.name })] });
    }
  }
}

async function resolveActor(t) {
  if ( t.tokenUuid ) {
    const token = await fromUuid(t.tokenUuid);
    if ( token?.actor ) return token.actor;
  }
  return t.actorUuid ? fromUuid(t.actorUuid) : null;
}

/** Re-target an attack card at the currently selected targets (when the player forgot to target). */
export async function retargetAttack(message) {
  if ( !message.isOwner ) return ui.notifications.warn(L("DBU.Notify.NotOwner"));
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  const targets = Array.from(game.user.targets ?? []);
  if ( !targets.length ) return ui.notifications.warn(L("DBU.Attack.NoTargets"));
  attack.targets = targets.map(t => ({
    tokenUuid: t.document?.uuid ?? null, actorUuid: t.actor?.uuid ?? null, name: t.name, img: t.document?.texture?.src ?? t.actor?.img,
    result: null, defense: null, damage: null, dimApplied: false
  }));
  await refreshAttackMessage(message, attack);
}
