import { DBU } from "../config.mjs";
import { dbuRoll, postInfoCard } from "../dice/roller.mjs";
import { categoryToDice } from "../rules/dice.mjs";
import { emitGM, safeUpdate } from "../socket.mjs";
import { INJURY_TYPES, limitedPower, rules } from "../optional-rules.mjs";
import { injuryCheck, requestInjury } from "./injuries.mjs";
import { actorTokens, outOfAoeHeight, spaceLevel, targetDistances } from "../canvas/height.mjs";
import { attackFxData } from "../canvas/attack-fx.mjs";
import { LONG_RANGE, aoeMagnitude } from "../rules/height.mjs";
import { forcedMove, runOps } from "./movement.mjs";
import { throughGrapple } from "./grapple.mjs";
import { mobileActive } from "../mobile.mjs";
import { pickTargets } from "../targets.mjs";
import { attackProfileEffects, favoredElements, profileAccess, profileAccessNames, profileEffects, profileKeys } from "../rules/profiles.mjs";
import { hyperElementalField, multiProfileField, resolveHyperElemental, resolveMultiProfile, spendHyperElemental,
  spendMultiProfile } from "./multi-profile.mjs";
import { ignoresCapacity, staminaAbsorb, staminaPayment } from "./adversary.mjs";

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
 * @param {object} [options.divine]         A God Maneuver attack: {name, forceDkp, category, costFactor, profile}
 * @param {boolean} [options.outOfSequence] An Out-of-Sequence attack (no Action spent by default)
 */
export async function openAttackDialog(actor, { signature = null, profile = null, divine = null, outOfSequence = false } = {}) {
  const sys = actor.system;
  const sig = signature?.system ?? null;
  const comp = sig?.computed ?? null;
  const profileKey = sig ? sig.profile : (profile ?? "simple");
  const prof = DBU.profiles[profileKey];
  const T = sys.top.current;
  const kpT = sys.top.kp;
  const weapons = sys.weapons.wielded;
  const maxWager = Math.floor(sys.capacity.max / 2);
  // A phone has no T key: with no target yet, the list of the scene's tokens comes first
  if ( !game.user.targets?.size && mobileActive() && canvas.tokens?.placeables?.length ) await pickTargets(actor);
  const targets = Array.from(game.user.targets ?? []);
  // Distance to each target, height included (Verticality, or 8 Squares per rank of High Environment)
  const distances = targetDistances(actor, targets);
  const atLongRange = !!distances.length && distances.every(d => d.total >= LONG_RANGE);
  const targetNames = targets.map(t => {
    const d = distances.find(e => e.token === t);
    if ( !d ) return t.name;
    return `${t.name} (${L(d.vertical ? "DBU.Attack.DistanceHeight" : "DBU.Attack.Distance", { n: d.total, v: d.vertical })})`;
  }).join(", ");

  // Profile Buyout: Basic Attacks only with Multi-Foundation Profiles plus the Profiles bought with TP
  const bought = new Set(sys.optional?.boughtProfiles ?? []);
  // Profiles of Transformations and Races (Barrier Blow, Glass...) only for who has access to them
  const allowed = ([k, p]) => profileAccess(actor, k) && (!rules().profileBuyout || (p.foundations.length > 1) || bought.has(k));
  const profileOptions = Object.entries(DBU.profiles).filter(allowed).map(([k, p]) =>
    `<option value="${k}" ${k === profileKey ? "selected" : ""}>${p.label} — ${p.kp}(T) KP</option>`).join("");
  const foundationOptions = (prof?.foundations ?? ["physical"]).map(f =>
    `<option value="${f}" ${f === (sig?.foundation ?? prof.foundations[0]) ? "selected" : ""}>${L(DBU.foundations[f])}</option>`).join("");
  const weaponOptions = [`<option value="">${L("DBU.Attack.Unarmed")}</option>`,
    ...weapons.map(w => `<option value="${w.id}">${w.name} (${L(DBU.foundations[w.system.weaponType])})</option>`)].join("");
  const pending = sys.combat.energyCharges ?? 0;
  // Divine Ki Points (God Ki State): the cost and the Ki Wager are paid separately, each from one pool
  const dkp = sys.dkp?.usable ? `<div class="dbu-checks dbu-dkp-checks">
      ${divine?.forceDkp ? `<span><i class="fa-solid fa-sun"></i> ${L("DBU.Dkp.CostForced")}</span>`
        : `<label><input type="checkbox" name="dkpCost" ${sys.dkp.prefer ? "checked" : ""}> ${L("DBU.Dkp.Cost")}</label>`}
      <label><input type="checkbox" name="dkpWager" ${sys.dkp.prefer ? "checked" : ""}> ${L("DBU.Dkp.Wager")}</label>
      <small>DKP ${sys.dkp.value}/${sys.dkp.max} · ${L("DBU.Dkp.HalfCapacity")}</small>
    </div>` : "";
  // Wild Swings (Villainous Trait): an Absolute Attack, twice per Combat Round
  const { wildSwingsLeft } = await import("./villainous.mjs");
  const swings = wildSwingsLeft(actor);
  const swingsBox = (swings !== null) ? `<div class="dbu-checks"><label><input type="checkbox" name="absolute" ${swings > 0 ? "" : "disabled"}>
    ${L("DBU.Villain.WildSwingsBox", { n: swings })}</label></div>` : "";
  // Adversaries: Narrative Stamina in the place of Ki Points
  const staminaBox =((actor.type === "adversary") && (sys.adversary?.stamina > 0)) ? `<div class="dbu-checks">
      <label><input type="checkbox" name="staminaPay" ${sys.adversary.staminaPays ? "checked" : ""}>
        ${L("DBU.Adversary.PayWithStamina", { n: sys.adversary.stamina })}</label></div>` : "";

  const content = `
  <div class="dbu-dialog">
    ${divine ? `<p class="dbu-dialog-sig"><strong><i class="fa-solid fa-sun"></i> ${divine.name}</strong> — ${L(divine.costFactor < 1
      ? "DBU.God.StrikeNote" : "DBU.God.AttackNote")}</p>` : ""}
    ${sig ? `<p class="dbu-dialog-sig"><strong>${signature.name}</strong> — ${L(`DBU.Sig.Level.${sig.level}`)} · ${profileEffects(profileKeys(profileKey, sig)).label} ·
      ${comp.kpUnits + comp.kpAdjust}(T) KP · ${comp.tp} TP</p>`
      : `<div class="form-group"><label>${L("DBU.Attack.Profile")}</label><select name="profile" ${divine?.profile ? "disabled" : ""}>${profileOptions}</select></div>`}
    <div class="form-group"><label>${L("DBU.Attack.Foundation")}</label><select name="foundation">${foundationOptions}</select></div>
    ${multiProfileField(actor, { profileKey: sig ? profileKey : "", sig })}
    ${hyperElementalField(actor, { sig })}
    <div class="form-group"><label>${L("DBU.Attack.Weapon")}</label><select name="weaponId">${weaponOptions}</select></div>
    <div class="form-group"><label>${L("DBU.Attack.Wager")} (${L("DBU.Attack.WagerMax", { max: maxWager })})</label>
      <input type="number" name="wager" value="0" min="0" step="1"></div>
    ${(rules().desperation && !sys.optional.desperationUsed) ? `<div class="form-group"><label>${L("DBU.Attack.LifeWager", { max: Math.floor(sys.capacity.max / 2) })}</label>
      <input type="number" name="lifeWager" value="0" min="0" step="1"></div>` : ""}
    ${dkp}
    ${staminaBox}
    ${swingsBox}
    <div class="form-group"><label>${L("DBU.Attack.Charges")} (${L("DBU.Attack.Pending", { n: pending })})</label>
      <input type="number" name="extraCharges" value="0" min="0" step="1"></div>
    <div class="form-group"><label>${L("DBU.Attack.StrikeBonus")}</label><input type="number" name="strikeBonus" value="0" step="1"></div>
    <div class="form-group"><label>${L("DBU.Attack.WoundBonus")}</label><input type="number" name="woundBonus" value="0" step="1"></div>
    <div class="dbu-checks">
      <label><input type="checkbox" name="calledShot"> ${L("DBU.Attack.CalledShot")}</label>
      <label><input type="checkbox" name="longRange" ${atLongRange ? "checked" : ""}> ${L("DBU.Attack.LongRange")}</label>
      <label><input type="checkbox" name="oblivious" ${sys.combat.hidden ? "checked" : ""}> ${L("DBU.Attack.Oblivious")}</label>
      <label><input type="checkbox" name="rapid"> ${L("DBU.Attack.Rapid")}</label>
      <label><input type="checkbox" name="spendAction" ${outOfSequence ? "" : "checked"}> ${L("DBU.Attack.SpendAction")}</label>
      <label><input type="checkbox" name="ignoreLimits"> ${L("DBU.Attack.IgnoreLimits")}</label>
    </div>
    ${rules().injurySystem ? `<div class="form-group"><label>${L("DBU.Injury.Intended")}</label><select name="injuryType">
      <option value="">—</option>${INJURY_TYPES.map(t => `<option value="${t}">${L(`DBU.Injury.${t}`)}</option>`).join("")}</select></div>` : ""}
    <p class="hint">${targets.length ? L("DBU.Attack.Targets", { names: targetNames }) : L("DBU.Attack.NoTargets")}
      ${atLongRange ? `<br>${L("DBU.Attack.LongRangeAuto")}` : ""}</p>
  </div>`;

  const data = await DialogV2.wait({
    window: { title: divine?.name ?? (sig ? signature.name : L("DBU.Attack.Basic")), icon: "fa-solid fa-hand-fist" },
    position: { width: 460 },
    content,
    buttons: [
      { action: "attack", label: L("DBU.Attack.Roll"), icon: "fa-solid fa-dice-d10", default: true,
        callback: (event, button) => new (FDE())(button.form).object },
      { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }
    ],
    // The Foundation list follows the chosen Profile; Multi-Profile options that do not fit the Foundation, repeat the
    // Profile or are used up are disabled
    render: (event, dialog) => {
      const profileSelect = dialog.element.querySelector("select[name=profile]");
      const foundationSelect = dialog.element.querySelector("select[name=foundation]");
      const multiSelect = dialog.element.querySelector("select[name=multi]");
      const hyper = dialog.element.querySelector("[data-hyper]");
      const filterMulti = () => {
        if ( !multiSelect ) return;
        const profile = profileSelect?.value ?? profileKey;
        for ( const o of multiSelect.querySelectorAll("option[data-key]") ) {
          o.disabled = o.hasAttribute("data-used") || (o.dataset.key === profile)
            || !o.dataset.foundations.split(",").includes(foundationSelect?.value);
          if ( o.disabled && o.selected ) multiSelect.value = "";
        }
        // Hyper Elemental only goes with Flash of the Elements
        if ( hyper ) {
          const on = multiSelect.value.startsWith("elementalForce|");
          hyper.classList.toggle("dbu-off", !on);
          for ( const s of hyper.querySelectorAll("select") ) {
            if ( !on ) s.value = "";
            s.toggleAttribute("data-inactive", !on);
          }
        }
      };
      foundationSelect?.addEventListener("change", filterMulti);
      multiSelect?.addEventListener("change", filterMulti);
      profileSelect?.addEventListener("change", () => {
        const list = DBU.profiles[profileSelect.value]?.foundations ?? ["physical"];
        const current = foundationSelect.value;
        foundationSelect.innerHTML = list.map(f =>
          `<option value="${f}" ${f === current ? "selected" : ""}>${L(DBU.foundations[f])}</option>`).join("");
        filterMulti();
      });
      filterMulti();
    },
    rejectClose: false
  });
  if ( !data || (data === "cancel") ) return null;
  return executeAttack(actor, { ...data, signatureId: signature?.id ?? null, targets, divine,
    profile: sig ? profileKey : (divine?.profile ?? data.profile) });
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
  // The winner of a Duel Maneuver (module/combat/duel.mjs): its Initiating Attack, already paid, hits the other side
  // with every Ki Wager of the Duel and no Strike Roll ({charges, wager, targets, extraProfiles, extraWoundT, name}).
  // An attack a Maneuver makes (Planet Burst): already paid, no Strike Roll ({charges, powerShot, name, duelOnly, note}).
  const duel = opts.duel ?? null;
  const forced = opts.forced ?? null;
  const preset = duel ?? forced;
  // Multi-Profile applied by an effect as the attack is made (Flash of the Elements, Elemental Blade...)
  const mp = preset ? null : resolveMultiProfile(actor, { value: opts.multi, profileKey, sig, foundation });
  // Hyper Elemental: a Line or Cone AoE, and one more Favored Element (no Ki Point Cost)
  const hyper = preset ? null : resolveHyperElemental(actor, { sig, mp, aoe: opts.hyperAoe, element: opts.hyperElement });
  // Multi-Profile: the effects of both Profiles apply
  const fx = profileEffects(profileKeys(profileKey, sig, preset?.extraProfiles
    ?? [mp?.key, hyper?.extraKey].filter(Boolean)));
  const weapon = opts.weaponId ? actor.items.get(opts.weaponId) : null;
  const T = sys.top.current;
  const bT = sys.top.base;
  const kpT = sys.top.kp;
  const ignore = !!opts.ignoreLimits;
  const problems = [...(mp?.problems ?? []), ...(hyper?.problems ?? [])];

  // Foundation requirements
  if ( (foundation === "energy") && (sys.attributes.fo.score < 3) && !sys.flags.energyWithoutFO ) problems.push(L("DBU.Attack.ErrEnergyFO"));
  if ( (foundation === "magic") && (sys.attributes.ma.score < 3) && !sys.flags.magicWithoutMA ) problems.push(L("DBU.Attack.ErrMagicMA"));
  if ( weapon && (weapon.system.weaponType !== foundation) ) problems.push(L("DBU.Attack.ErrWeaponFoundation"));
  if ( weapon && sig && !comp.weaponAssisted ) problems.push(L("DBU.Attack.ErrWeaponAssisted"));
  if ( sig && (comp.errors?.length) ) problems.push(L("DBU.Attack.ErrSignatureInvalid"));
  // A Basic Attack of a Profile only some effects give access to (Barrier Blow, Glass...)
  if ( !sig && !preset && !profileAccess(actor, profileKey) ) {
    problems.push(L("DBU.Sig.ErrProfileAccess", { profile: DBU.profiles[profileKey]?.label ?? profileKey, from: profileAccessNames(profileKey) }));
  }
  if ( sig && comp.ultimate && sig.usedThisEncounter ) problems.push(L("DBU.Attack.ErrUltimateUsed"));
  if ( sig && comp.ultimate && ((sys.combat.ultimatesUsed ?? 0) >= 3) ) problems.push(L("DBU.Attack.ErrUltimate3"));
  if ( sig && comp.climax && (sys.health.count < comp.climax) ) problems.push(L("DBU.Attack.ErrClimax"));
  if ( sig && comp.mandatoryCharge && ((sys.combat.energyCharges ?? 0) < 2 * comp.mandatoryCharge) ) {
    problems.push(L("DBU.Attack.ErrMandatoryCharge", { n: 2 * comp.mandatoryCharge }));
  }
  if ( sys.effectiveConditions.transfigured && (foundation !== "physical" || sig) ) problems.push(L("DBU.Attack.ErrTransfigured"));
  if ( sys.effectiveConditions.pinned ) problems.push(L("DBU.Attack.ErrPinned"));
  // A Plump or Frail Fusion cannot use Signature Techniques
  if ( sig && (actor.type === "fusion") && (sys.fusion.dance !== "success") ) problems.push(L(`DBU.Fusion.Dance.${sys.fusion.dance}`));

  /* ----- Ki Point Cost ----- */
  let units = sig ? (comp.kpUnits + comp.kpAdjust) : prof.kp;
  let minUnits = sig ? comp.kpMinUnits : (prof.kp / 2);
  // A Super Profile's Ki Point Cost adds to the cost and to the minimum one (Blitz on a Signature: −2(T))
  if ( mp?.key ) {
    units += mp.cost - (sig ? (DBU.profiles[mp.key].sigKpReduction ?? 0) : 0);
    minUnits += mp.cost / 2;
  }
  const weaponCat = weapon ? DBU.weaponCategories[weapon.system.category] : null;
  if ( weaponCat?.kp && ((weaponCat.type !== "magic") || (foundation === "magic")) ) units += weaponCat.kp;
  const R = rules();
  const ballistic = R.ballistics && weapon?.system.ballistic;
  let kp = Math.ceil(units * kpT) + sys.costs.attack + (sys.kpCostByFoundation?.[foundation] ?? 0);
  let minKp = Math.ceil(minUnits * kpT);
  if ( sys.costs.perfectKiControl ) minKp = Math.min(minKp, 2 * kpT);
  kp = Math.max(minKp, kp);
  // The Glass Tribe's Glass: a fixed Ki Point Cost
  if ( mp?.flatKp ) kp += mp.flatKp;
  // God Strike: 1/4 (rounded up) of the Profile's Ki Point Cost
  const divine = opts.divine ?? null;
  if ( divine?.costFactor && (divine.costFactor !== 1) ) kp = Math.ceil(kp * divine.costFactor);
  // Ballistics: Basic Attacks with a Ballistic Weapon cost no Ki; Signatures cost half
  if ( ballistic ) kp = sig ? Math.ceil(kp / 2) : 0;
  if ( opts.calledShot ) kp += 2 * T;
  if ( opts.rapid ) kp += 2 * T;
  let ammoCost = 0;
  if ( ballistic ) {
    ammoCost = Math.max(1, Math.ceil(prof.kp / 2));
    if ( (weapon.system.ammo.value ?? 0) < ammoCost ) problems.push(L("DBU.Attack.ErrAmmo", { need: ammoCost, have: weapon.system.ammo.value }));
  }

  /* ----- Divine Ki Points (God Ki State) ----- */
  // The Ki Point Cost and the Ki Wager are two payments, each from a single pool; DKP use 1/2 (rounded up) of the
  // Capacity Rate
  const divineOk = !!sys.dkp?.usable;
  if ( divine?.forceDkp && !divineOk ) problems.push(L("DBU.Dkp.ErrState"));
  const costDkp = divineOk && (!!opts.dkpCost || !!divine?.forceDkp);
  const wagerDkp = divineOk && !!opts.dkpWager && (sig?.superProfile !== "allOut");
  const capacityOf = (n, fromDkp) => (fromDkp ? Math.ceil(n / 2) : n);

  /* ----- Ki Wager ----- */
  let wager = preset ? (preset.wager ?? 0) : Math.max(0, Number(opts.wager) || 0);
  // Without Capacity (Adversaries): no Capacity spent nor checked, and the Ki Wager stays within the Max Capacity
  const noCapacity = ignoresCapacity(actor);
  const capacityLeft = noCapacity ? sys.capacity.max : sys.capacity.value - capacityOf(kp, costDkp);
  // How much can still be wagered with the Capacity left (DKP only use half of it)
  const wagerRoom = Math.max(0, wagerDkp ? 2 * capacityLeft : capacityLeft);
  let wagerLimit = noCapacity ? sys.capacity.max : Math.floor(sys.capacity.max / 2);
  // Full Wager: the Advantage, or free with a Profile (Elemental (Light)), Basic Attacks included
  if ( comp?.fullWager || fx.freeAdvantages.includes("fullWager") ) wagerLimit = wagerRoom;
  const wired = weapon?.system.qualities?.some(q => /wired/i.test(q.name));
  if ( ballistic ) wagerLimit = wired ? Math.floor(sys.capacity.max / 4) : 0;
  // Desperation Rules: Life Points may join the Ki Wager (up to 1/2 of the Capacity)
  const lifeWager = (R.desperation && !sys.optional.desperationUsed) ? Math.max(0, Number(opts.lifeWager) || 0) : 0;
  if ( lifeWager > Math.floor(sys.capacity.value / 2) ) problems.push(L("DBU.Attack.ErrLifeWager", { max: Math.floor(sys.capacity.value / 2) }));
  if ( lifeWager >= sys.life.value ) problems.push(L("DBU.Attack.ErrLifeWagerLP"));
  if ( sig?.superProfile === "allOut" ) wager = Math.min(sys.ki.value - (costDkp ? 0 : kp), sys.capacity.max);
  if ( comp?.allOrNothing ) wager = Math.max(0, Math.min(wagerLimit, wagerRoom));
  if ( wager > wagerLimit ) problems.push(L("DBU.Attack.ErrWagerMax", { max: wagerLimit }));
  const kiPaid = (costDkp ? 0 : kp) + (wagerDkp ? 0 : wager);
  const dkpPaid = (costDkp ? kp : 0) + (wagerDkp ? wager : 0);
  const capacityUsed = capacityOf(kp, costDkp) + capacityOf(wager, wagerDkp);
  // Narrative Stamina (Elite and Villain Adversaries) is spent in the place of Ki Points
  const stamina = staminaPayment(actor, kiPaid, opts.staminaPay !== false);
  if ( stamina.fromKi > sys.ki.value ) problems.push(L("DBU.Attack.ErrKi", { need: stamina.fromKi, have: sys.ki.value }));
  if ( dkpPaid > (sys.dkp?.value ?? 0) ) problems.push(L("DBU.Dkp.ErrNotEnough", { need: dkpPaid, have: sys.dkp?.value ?? 0 }));
  if ( (sig?.superProfile !== "allOut") && !noCapacity && (capacityUsed > sys.capacity.value) ) {
    problems.push(L("DBU.Attack.ErrCapacity", { need: capacityUsed, have: sys.capacity.value }));
  }

  /* ----- Villainous: Get Up! and the 1-on-1 Duel ----- */
  const V = await import("./villainous.mjs");
  const targetActors = (opts.targets ?? []).map(t => t.actor).filter(Boolean);
  const getUp = preset ? null : V.getUpProblem(actor, targetActors);
  if ( getUp ) problems.push(getUp);

  /* ----- Actions ----- */
  const actionCost = (opts.spendAction ? 1 : 0) + (opts.calledShot ? 1 : 0);
  if ( opts.spendAction && (sys.combat.actions < actionCost) && game.combat?.started ) {
    problems.push(L("DBU.Attack.ErrActions", { need: actionCost, have: sys.combat.actions }));
  }

  if ( problems.length && !ignore && !preset ) {
    ui.notifications.error(problems.join(" "), { permanent: false });
    await postInfoCard({ actor, title: L("DBU.Attack.Blocked"), lines: problems, whisper: [game.user.id] });
    return null;
  }

  /* ----- Energy Charges ----- */
  const pending = sys.combat.energyCharges ?? 0;
  let charges = (ballistic && !wired ? 0 : pending) + (Number(opts.extraCharges) || 0) + fx.freeCharges;
  if ( sig && comp.ultimate ) charges += sys.health.count;
  if ( sig && comp.transformationBoost && sys.transformation.forms.length ) charges += 1;
  // Mega Flare applied through an effect raises a Signature's maximum too
  let maxCharges = sig ? Math.max(comp.maxCharges, fx.maxCharges + (comp.ultimate ? 1 : 0)) : fx.maxCharges;
  if ( ballistic ) maxCharges = Math.ceil(sys.attributes.sc.mod / 4);
  if ( limitedPower(sys) ) maxCharges = Math.min(maxCharges, 3);
  charges = Math.min(charges, maxCharges);
  const bonusCharges = fx.bonusCharges; // Beam: does not count toward the maximum
  if ( preset ) charges = Math.max(0, (preset.charges ?? 0) - bonusCharges);
  const totalCharges = charges + bonusCharges;
  const chargeCategory = sys.chargeCategory + (sig ? comp.chargeCategory : 0);

  /* ----- Damage Category ----- */
  // Multi-Profile: the highest Damage Category of the two Profiles
  let category = fx.cat;
  if ( opts.calledShot ) category += 1;
  if ( fx.has("megaFlare") && (charges >= 7) ) category += 1;
  // Glass: +1 Damage Category for every 2 Energy Charges (max. +2)
  if ( fx.glass ) category += Math.min(2, Math.floor((charges + bonusCharges) / 2));
  // Divine Attack: +1 Damage Category
  if ( divine?.category ) category += divine.category;

  /* ----- Pay ----- */
  // Life Point Cost to attack (Kaioken, Super Kaioken...)
  const lifeCost = preset ? 0 : Math.max(0, sys.buckets?.attackLifeCost?.total ?? 0);
  // A Duel's Initiating Attack was paid when the Duel began (a Maneuver's attack, by the Maneuver)
  if ( !preset ) {
  const update = {
    "system.ki.value": Math.max(0, sys.ki.value - stamina.fromKi),
    "system.combat.attacksThisRound": (sys.combat.attacksThisRound ?? 0) + 1,
    "system.combat.energyCharges": 0
  };
  if ( stamina.fromStamina ) update["system.adversary.stamina"] = sys.adversary.stamina - stamina.fromStamina;
  if ( dkpPaid ) update["system.dkp.value"] = Math.max(0, sys.dkp.value - dkpPaid);
  if ( !noCapacity && (sig?.superProfile !== "allOut") ) update["system.capacity.value"] = Math.max(0, sys.capacity.value - capacityUsed);
  if ( !noCapacity && ((sig?.superProfile === "allOut") || comp?.allOrNothing) ) update["system.capacity.value"] = 0;
  if ( game.combat?.started && opts.spendAction ) update["system.combat.actions"] = Math.max(0, sys.combat.actions - actionCost);
  if ( pending && sys.conditions.guardDown ) update["system.conditions.guardDown"] = 0;
  if ( sig && comp.ultimate ) update["system.combat.ultimatesUsed"] = (sys.combat.ultimatesUsed ?? 0) + 1;
  if ( lifeWager > 0 || lifeCost > 0 ) {
    update["system.life.value"] = sys.life.value - lifeWager - lifeCost;
    if ( lifeWager > 0 ) update["system.optional.desperationUsed"] = true;
  }
  await actor.update(update, (lifeWager > 0 || lifeCost > 0) ? { dbuSelfInflicted: true } : {});
  if ( ballistic ) await weapon.update({ "system.ammo.value": Math.max(0, weapon.system.ammo.value - ammoCost) });
  if ( pending && sys.conditions.guardDown ) await actor.toggleStatusEffect("guardDown", { active: false }).catch(() => null);
  if ( sig && comp.ultimate ) await signature.update({ "system.usedThisEncounter": true });
  }
  // Multi-Profile from an effect: one more use this Round/Encounter, and its resource (Sunlight) spent
  const multiNotes = (mp?.key && !preset) ? [mp.note, ...(await spendMultiProfile(actor, mp))] : [];
  // Someone else targeting the two of a 1-on-1 Duel ends it
  if ( !preset ) await V.oneOnOneTargeted(actor, targetActors);
  // Absolute Attack (Wild Swings, Intense Blast): a missed target still takes 1/2 of the Wound against Soak and DR.
  // No more than 2 Absolute Attacks in a Combat Round
  const intense = !!sig?.advantages?.some(a => (a.key === "intenseBlast") && (a.rank ?? 1) > 0);
  const swing = !!opts.absolute && ((V.wildSwingsLeft(actor) ?? 0) > 0);
  let absolute = false;
  if ( (swing || intense) && !preset ) {
    if ( (actor.system.combat.absoluteAttacks ?? 0) < 2 ) {
      absolute = true;
      await actor.update({ "system.combat.absoluteAttacks": (actor.system.combat.absoluteAttacks ?? 0) + 1 });
      multiNotes.push(L(swing ? "DBU.Villain.WildSwings" : "DBU.Attack.AbsoluteIntense"));
    }
    else multiNotes.push(L("DBU.Attack.AbsoluteLimit"));
  }
  if ( hyper?.uses.length ) {
    await spendHyperElemental(actor, hyper);
    multiNotes.push(...hyper.notes);
  }

  /* ----- Strike Roll ----- */
  const fresh = actor.system; // re-prepared after the update (Diminishing Offense applied)
  const strikeData = fresh.rolls.strike;
  const parts = [...strikeData.parts];
  const add = (label, value) => { if ( value ) parts.push({ label, value }); };
  add(L(DBU.foundations[foundation]), fresh.rolls[`strike_${foundation}`] ?? 0);
  if ( fx.has("crushing") ) add("Crushing (½ Haste)", -Math.ceil(fresh.aptitudes.haste / 2));
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
  if ( favoredElement(actor, fx) ) add(L("DBU.Attack.Favored"), 1 * T);
  // Elemental (Light) with the Elemental (Dark) Profile applied to it (Multi-Profile)
  if ( fx.has("elementalLight") && fx.has("elementalDark") ) add("Elemental (Light + Dark)", 1 * T);
  if ( opts.calledShot ) add("Called Shot", -2 * T);
  if ( opts.longRange && !(sig && comp.shortRange === 1) ) add("Long Range", -2 * bT);
  if ( opts.oblivious ) add("Hidden", 2 * bT);
  if ( opts.rapid ) add("Rapid Movement", 1 * T);
  add(L("DBU.Attack.Situational"), Number(opts.strikeBonus) || 0);

  const targets = duel
    ? (duel.targets ?? []).map(t => ({ ...t, result: "hit", defense: { mode: "Duel" }, damage: null, dimApplied: true }))
    : (opts.targets ?? []).map(t => ({
      tokenUuid: t.document?.uuid ?? null, actorUuid: t.actor?.uuid ?? null, name: t.name, img: t.document?.texture?.src ?? t.actor?.img,
      result: null, defense: null, damage: null, dimApplied: false
    }));

  // Age: Mini stacks may make the attack miss automatically
  const notesExtra = [...multiNotes];
  if ( duel ) notesExtra.push(L("DBU.Duel.CounterNote", { wager: duel.wager }));
  if ( forced?.note ) notesExtra.push(forced.note);
  if ( stamina.fromStamina && !preset ) notesExtra.push(L("DBU.Adversary.StaminaPaid", { n: stamina.fromStamina, ki: stamina.fromKi }));
  if ( R.age && (fresh.optional.mini > 0) ) {
    const mini = await new Roll("1d10").evaluate();
    if ( mini.total <= 1 + fresh.optional.mini ) notesExtra.push(L("DBU.Attack.MiniMiss", { roll: mini.total }));
    else notesExtra.push(L("DBU.Attack.MiniOk", { roll: mini.total }));
  }
  if ( ballistic ) notesExtra.push(L("DBU.Attack.Ballistic", { ammo: ammoCost, left: weapon.system.ammo.value }));
  if ( lifeCost > 0 ) notesExtra.push(L("DBU.Attack.LifeCost", { n: lifeCost }));
  if ( dkpPaid ) notesExtra.push(L("DBU.Dkp.Paid", { cost: costDkp ? kp : 0, wager: wagerDkp ? wager : 0, cap: capacityUsed }));
  // AoEs only reach so far up and down (Flight: the Magnitude's number in Verticality; High Environments: ranks)
  let aoe = sig ? comp.aoe : prof.aoe;
  // A Profile applied through an effect brings its AoE when the attack has none
  if ( !aoe && mp?.key ) aoe = DBU.profiles[mp.key].aoe ?? aoe;
  // Hyper Elemental: a Line or Cone AoE, 1 Magnitude larger for every 2 Energy Charges
  if ( hyper?.aoe ) {
    aoe = hyper.aoe;
    const more = Math.floor(totalCharges / 2);
    if ( more ) notesExtra.push(L("DBU.MultiProfile.HyperMagnitude", { n: more }));
  }
  if ( aoe ) {
    const options = sig ? [...sig.advantages, ...sig.disadvantages] : [];
    const magnitude = aoeMagnitude(aoe, k => options.find(o => o.key === k)?.rank ?? 0);
    const out = outOfAoeHeight(actor, opts.targets ?? [], magnitude);
    if ( out.length ) notesExtra.push(L("DBU.Altitude.AoeOut", { names: out.map(t => t.name).join(", "), mag: L(`DBU.Altitude.Mag.${magnitude}`) }));
  }

  const attack = {
    attackerUuid: actor.uuid,
    name: preset?.name ?? signature?.name ?? (divine ? `${divine.name}: ${prof.label}` : `${L("DBU.Attack.Basic")}: ${prof.label}`),
    signatureId: signature?.id ?? null, profile: profileKey, profiles: fx.keys, foundation, weaponId: weapon?.id ?? null,
    // A Maneuver's attack shows what it really cost (Planet Burst: the Narrative Stamina)
    kp: forced?.kp ?? kp, wager: wager + lifeWager, charges: totalCharges, chargeCategory, category, ballistic: !!ballistic,
    dkp: { cost: costDkp, wager: wagerDkp, paid: dkpPaid },
    caliber: ballistic ? (weapon.system.caliber ?? 0) : 0,
    calledShot: !!opts.calledShot, injuryType: opts.calledShot ? (opts.injuryType || "") : "",
    longRange: !!opts.longRange, oblivious: !!opts.oblivious,
    woundBonus: Number(opts.woundBonus) || 0, ultimate: !!comp?.ultimate,
    sig: comp ? { woundT: comp.woundT, longShotT: comp.longShotT, lastLegs: comp.lastLegs, lowPowerCrush: comp.lowPowerCrush,
      armorPiercing: comp.armorPiercing, shatteringBlow: comp.shatteringBlow, penetration: comp.penetration,
      sustained: comp.sustained, backlash: comp.backlash, twinLinked: comp.twinLinked, deadLink: comp.deadLink,
      shortRange: comp.shortRange, powerBurst: comp.powerBurst, superProfile: sig.superProfile } : null,
    autoHit: fresh.flags.autoHit,
    knockback: knockbackOf(actor, { comp, sig, fx, aoe }),
    notes: notesExtra,
    // The attacker's base ToP (a Ki Wager of 10(bT)+ can be answered with a Duel Maneuver); the winner's attack of a Duel
    bT, fromDuel: !!duel, fromToken: actorTokens(actor)[0]?.document?.uuid ?? null,
    // What the Duel Escape Maneuver gives back; Power Shot stacks of a Maneuver's attack; answered only with a Duel
    actionCost: (opts.spendAction && game.combat?.started) ? actionCost : 0, powerShot: forced?.powerShot ?? 0,
    extraWoundT: duel?.extraWoundT ?? (2 * (forced?.powerShot ?? 0)), duelOnly: !!forced?.duelOnly, noStrike: !!preset, absolute,
    targets, wound: null
  };

  // The winner of a Duel (or a Maneuver's attack) makes no Strike Roll
  const result = preset ?{ total: 0, natural: 0, rawNatural: 0, crit: false, botch: false, extra: [], parts: [], critRoll: null, rolls: [] }
    : await dbuRoll({
    actor, kind: "strike",
    title: `${L("DBU.Roll.Strike")} — ${attack.name}`,
    subtitle: `${fx.label} · ${L(DBU.foundations[foundation])} · ${L(DBU.damageCategories[Math.clamp(category, 1, 3)])}`,
    naturalMod: strikeData.natural, minNatural: fx.minNatural,
    critTarget: strikeData.crit, botchRange: strikeData.botch,
    diceGroups: strikeData.dice, parts, critDice: strikeData.critDice, botchPenalty: strikeData.botchPenalty,
    cutting: fx.cutting,
    twin: (attack.sig?.twinLinked === "strike") ? "high" : ((attack.sig?.deadLink === "strike") ? "low" : null),
    notes: [
      L("DBU.Attack.Paid", { kp, wager: wager + lifeWager, charges: totalCharges }),
      ...notesExtra,
      ...(problems.length ? [`⚠ ${problems.join(" ")}`] : [])
    ],
    toMessage: false
  });
  attack.strike = { total: result.total, natural: result.natural, crit: result.crit, botch: result.botch };
  // Cutting: a Critical Result on the Strike Roll increases the Damage Category by 1 Category
  if ( fx.cutting && result.crit ) {
    attack.category += 1;
    attack.notes.push(L("DBU.Attack.CuttingCrit", { cat: L(DBU.damageCategories[Math.clamp(attack.category, 1, 3)]) }));
  }
  // How every client draws the attack on the canvas (the Signature's own look, or the Profile's simple effect); a Duel
  // draws its own ending
  attack.fx = duel ? null : attackFxData({
    from: actorTokens(actor)[0]?.document?.uuid ?? null, profiles: fx.keys, foundation, vfx: sig?.vfx ?? null, aoe,
    category: attack.category, charges: totalCharges, crit: result.crit, botch: result.botch
  });

  const message = await postAttackCard(actor, attack, result);

  // Post-attack Signature drawbacks
  if ( attack.sig?.backlash ) await actor.update({ "system.life.value": Math.max(0, actor.system.life.value - (2 * bT * attack.sig.backlash)) },
    { dbuSelfInflicted: true });
  return message;
}

/**
 * Knockback of an attack: the Signature Advantage, free with the Launching Profile (which doubles the Collision
 * Damage of that movement), and every Attacking Maneuver in Local Space or Deep Space, where an attack that already has
 * it adds 1(bT) or 2(bT) to the Might of its Might Clash and Squares. null when the attack has none.
 */
function knockbackOf(actor, { comp, sig, fx, aoe }) {
  const own = !!comp?.knockback || fx.has("launching");
  const space = spaceLevel(actor);
  if ( !own && !space ) return null;
  return {
    space: own ? space : 0, forceful: comp?.forcefulLaunch ?? 0, precise: !!comp?.preciseStrike,
    superLaunch: sig?.superProfile === "superLaunch", double: fx.has("launching"), aoe: !!aoe
  };
}

/** Is one of the attack's Elemental Profiles a Favored Element? (its bonus counts once) */
function favoredElement(actor, fx) {
  if ( !fx.elemental.length ) return false;
  const favored = favoredElements(actor);
  return fx.elemental.some(k => favored.includes(k));
}

/* -------------------------------------------- */
/*  Attack card                                 */
/* -------------------------------------------- */

async function renderAttackContent(attack, rollResult) {
  return foundry.applications.handlebars.renderTemplate("systems/dbu-rpg/templates/chat/attack-card.hbs", {
    attack,
    roll: rollResult ?? attack.strikeView,
    category: L(DBU.damageCategories[Math.clamp(attack.category, 1, 3)]),
    hasTargets: attack.targets.length > 0,
    // Duel Maneuver: 2+ Energy Charges or a Ki Wager of 10(bT)+
    duelable: !attack.fromDuel && !attack.nullified && (attack.duelOnly || ((attack.charges ?? 0) >= 2)
      || ((attack.wager ?? 0) >= (10 * (attack.bT ?? 1))))
  });
}

/** Store a changed attack on its card (through the GM when the card is someone else's). */
export async function updateAttackCard(message, attack) {
  const content = await renderAttackContent(attack);
  return safeUpdate(message, { content, [`flags.${FLAG}.attack`]: attack });
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
  const usesCounter = ["parry", "guard", "directHit", "crossCounter", "powerFlare", "divineFlex"].includes(mode);
  // Divine Flex (God Maneuver): 2(bT) Divine Ki Points, only in the God Ki State
  if ( (mode === "divineFlex") && !sys.dkp?.usable ) return ui.notifications.warn(L("DBU.Dkp.ErrState"));
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
    // Paid with Divine Ki Points when the defender prefers them (God Ki State): half the Capacity
    const divine = !!(sys.dkp?.usable && sys.dkp.prefer);
    // Adversaries: Narrative Stamina in the place of Ki Points, and no Capacity (Without Capacity)
    const stamina = divine ? { fromStamina: 0, fromKi: cost } : staminaPayment(actor, cost);
    const have = divine ? sys.dkp.value : sys.ki.value;
    const need = divine ? cost : stamina.fromKi;
    if ( need > have ) ui.notifications.warn(L(divine ? "DBU.Dkp.ErrNotEnough" : "DBU.Attack.ErrKi", { need, have }));
    update[divine ? "system.dkp.value" : "system.ki.value"] = Math.max(0, have - need);
    if ( stamina.fromStamina ) update["system.adversary.stamina"] = sys.adversary.stamina - stamina.fromStamina;
    if ( !ignoresCapacity(actor) ) update["system.capacity.value"] = Math.max(0, sys.capacity.value - (divine ? Math.ceil(cost / 2) : cost));
    rec.cost = cost;
    rec.dkp = divine;
    hit = true;
  }
  else if ( mode === "divineFlex" ) {
    const cost = 2 * bT;
    if ( cost > sys.dkp.value ) ui.notifications.warn(L("DBU.Dkp.ErrNotEnough", { need: cost, have: sys.dkp.value }));
    update["system.dkp.value"] = Math.max(0, sys.dkp.value - cost);
    update["system.capacity.value"] = Math.max(0, sys.capacity.value - Math.ceil(cost / 2));
    rec.cost = cost;
    rec.dkp = true;
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
  const fx = attackProfileEffects(attack);
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
  for ( const p of fx.list ) {
    if ( p.extraDamageAttribute ) add(`${p.label} (+${L("DBU.Attack.DamageAttribute")})`, dmgAttr * p.extraDamageAttribute);
  }
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
  if ( fx.has("megaFlare") ) add("Mega Flare", attack.charges * T);
  // Power Shot stacks given by a Maneuver (Planet Burst), carried by the winner of its Duel
  if ( attack.extraWoundT ) add("Power Shot", attack.extraWoundT * T);
  if ( weapon ) {
    add(L("DBU.WeaponSize.label"), (DBU.weaponSizes[weapon.system.size]?.wound ?? 0) * T);
    if ( weaponCat?.wound ) add(weaponCat.label, weaponCat.wound * T);
    if ( weaponCat?.simpleWound && fx.has("simple") ) add(weaponCat.label, weaponCat.simpleWound * T);
    if ( attack.calledShot && weaponCat?.calledWound ) add(weaponCat.label, weaponCat.calledWound * T);
    add(L("DBU.Attack.Armed"), sys.buckets["wound.armed"]?.total ?? 0);
  }
  else add(L("DBU.Attack.Unarmed"), sys.buckets["wound.unarmed"]?.total ?? 0);
  if ( favoredElement(actor, fx) ) add(L("DBU.Attack.Favored"), 2 * T);
  // Elemental (Dark) with the Elemental (Light) Profile applied to it (Multi-Profile)
  if ( fx.has("elementalDark") && fx.has("elementalLight") ) add("Elemental (Dark + Light)", 2 * T);
  add(L("DBU.Attack.Situational"), attack.woundBonus);

  // Energy Charges: 1d6(T) each, d8 for Signatures (Charged Up), plus any category increases
  const diceGroups = [...w.dice];
  if ( attack.charges > 0 ) {
    const perCharge = categoryToDice(attack.chargeCategory, T);
    const dice = perCharge.map(g => ({ number: g.number * attack.charges, faces: g.faces }));
    diceGroups.push({ dice, label: L("DBU.Attack.Charges") });
  }

  // Glass: +1(T) Wound for every 2 Energy Charges; Barrier Blow: 1/4 of the Might and the Base Die once more
  if ( fx.glass ) add("Glass", Math.floor(attack.charges / 2) * T);
  if ( fx.barrierBlow ) add("Barrier Blow (¼ Might)", Math.ceil(sys.aptitudes.might / 4));
  const critTarget = fx.cutting ? 5 : w.crit;
  const result = await dbuRoll({
    actor, kind: "wound", title: `${L("DBU.Roll.Wound")} — ${attack.name}`,
    subtitle: `${L(DBU.damageCategories[Math.clamp(attack.category, 1, 3)])} · ${attack.charges} ${L("DBU.Attack.ChargesShort")}`,
    naturalMod: w.natural, critTarget, botchRange: w.botch, diceGroups, parts,
    critDice: w.critDice, botchPenalty: w.botchPenalty,
    extraBaseDie: fx.barrierBlow, extraBaseDieLabel: "Barrier Blow (Base Die)",
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
  const fx = attackProfileEffects(attack);
  let category = attack.category + (tsys.damageCategoryTaken ?? 0);
  if ( def?.mode === "guard" ) {
    wound = Math.floor(wound / 2);
    category -= 1;
    lines.push(L("DBU.Damage.Guard"));
  }
  // Divine Flex: −1 Damage Category, and it counts as the Direct Hit option
  if ( def?.mode === "divineFlex" ) {
    category -= 1;
    lines.push(L("DBU.Damage.DivineFlex"));
  }
  category = Math.clamp(category, 1, 3);

  // Damage Reduction
  let dr = tsys.aptitudes.dr;
  const weaponCat = attack.weaponId && attacker ? DBU.weaponCategories[attacker.items.get(attack.weaponId)?.system.category] : null;
  if ( weaponCat?.ignoreHalfDR || fx.ignoreHalfDR ) dr = Math.ceil(dr / 2);
  if ( attack.sig?.armorPiercing && attacker ) dr = Math.max(0, dr - Math.floor(attacker.system.attributes.in.mod / 2));

  // Soak
  let soak = tsys.aptitudes.soak;
  if ( ["directHit", "divineFlex"].includes(def?.mode) ) soak = soak + Math.floor(soak / 2);
  if ( fx.has("pinpoint") && attacker ) {
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
  // Divine Flex with no Damage taken: the Opponent loses Life Points equal to your Soak Value
  if ( (def?.mode === "divineFlex") && (damage === 0) ) lines.push(L("DBU.Damage.DivineFlexReflect", { n: tsys.aptitudes.soak }));
  return { damage, category, dr, soakApplied, wound, lines };
}

/** Button on the attack card: apply damage to one target. */
export async function applyAttackDamage(message, index) {
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  const t = attack?.targets?.[index];
  if ( !t || !attack.wound ) return;
  // An Absolute Attack that missed (not one cancelled by a Duel Escape) still deals 1/2 of its Wound against Soak and DR
  const absolute = (t.result === "miss") && attack.absolute && !attack.nullified;
  if ( (t.result === "miss") && !absolute ) return ui.notifications.info(L("DBU.Damage.Missed"));
  if ( t.damage !== null && t.damage !== undefined ) return ui.notifications.info(L("DBU.Damage.Already"));
  const target = await resolveActor(t);
  const attacker = await fromUuid(attack.attackerUuid);
  if ( !target ) return;
  const half = absolute ? { ...attack, wound: { ...attack.wound, total: Math.floor((attack.wound.total ?? 0) / 2) } } : attack;
  const res = computeDamage(target, half, attacker, t.defense);
  if ( absolute ) res.lines.unshift(L("DBU.Damage.Absolute", { n: half.wound.total }));
  await applyDamageToActor(target, res.damage, { attacker, attack, lines: res.lines, category: res.category });
  // Not a hit nor damage of the Attacking Maneuver for the attacker's effects
  if ( absolute ) {
    const damage = { amount: res.damage, category: res.category };
    if ( message.isOwner ) await storeDamageOnMessage(message.id, index, damage);
    else emitGM("attackDamage", { messageId: message.id, targetIndex: index, damage });
    return;
  }
  // Diminishing Defense when the target never rolled a defense
  if ( !t.dimApplied && !t.defense ) {
    const stacks = target.system.dimDefensePerAttack * ((attackProfileEffects(attack).has("sweeping") && res.damage > 0) ? 2 : 1);
    await safeUpdate(target, { "system.combat.dimDefense": (target.system.combat.dimDefense ?? 0) + stacks });
  }
  // On-damage Signature effects
  if ( res.damage > 0 && attack.sig ) {
    const upd = {};
    if ( attack.sig.penetration ) upd["system.conditions.broken"] = Math.min(3, target.system.conditions.broken + attack.sig.penetration);
    if ( attack.sig.sustained ) upd["system.combat.dot"] = (target.system.combat.dot ?? 0) + attack.sig.sustained;
    if ( Object.keys(upd).length ) await safeUpdate(target, upd);
  }
  // On-damage effects of the Profiles of Transformations (Gravity Cage, Time, Destruction)
  if ( (res.damage > 0) && attacker ) await profileDamageEffects(attacker, target, attack, res.damage);
  const damage = { amount: res.damage, category: res.category };
  if ( message.isOwner ) await storeDamageOnMessage(message.id, index, damage);
  else emitGM("attackDamage", { messageId: message.id, targetIndex: index, damage });
}

/**
 * What some Profiles do to a Character they damage:
 *  - Gravity Cage: −1/4 (rounded up) of the attacker's Might in Life Points, then a Might Clash: winning knocks Prone
 *    (Gravity Controller: another 1/4 of the Might);
 *  - Time: a stack of Slowed until the end of the attacker's next turn, Guard Down until the end of this turn;
 *  - Destruction: the Damage also lowers the Maximum Life Points until the end of the Combat Encounter.
 */
async function profileDamageEffects(attacker, target, attack, damage) {
  const fx = attackProfileEffects(attack);
  if ( !(fx.gravityCage || fx.time || fx.destruction) ) return;
  const lines = [];
  const quarter = Math.ceil((attacker.system.aptitudes?.might ?? 0) / 4);
  const ops = [];
  if ( fx.gravityCage ) {
    ops.push({ op: "life", uuid: target.uuid, amount: quarter });
    lines.push(L("DBU.Profile.GravityLife", { name: target.name, n: quarter }));
    const mine = await attacker.rollClash("might", { subtitle: "Gravity Cage" });
    const theirs = await target.rollClash("might", { subtitle: "Gravity Cage" });
    if ( (mine?.total ?? 0) > (theirs?.total ?? 0) ) {
      ops.push({ op: "condition", uuid: target.uuid, key: "prone", value: 1 });
      lines.push(L("DBU.Profile.GravityProne", { name: target.name, mine: mine.total, theirs: theirs.total }));
      // Gravity Controller: winning that Might Clash costs another 1/4 of the Might
      const controller = attacker.items.some(i => (i.type === "transformation") && /^gravity controller$/i.test(i.name) && i.system.isActive);
      if ( controller ) {
        ops.push({ op: "life", uuid: target.uuid, amount: quarter });
        lines.push(L("DBU.Profile.GravityController", { name: target.name, n: quarter }));
      }
    }
    else lines.push(L("DBU.Profile.GravityResisted", { name: target.name, mine: mine?.total ?? 0, theirs: theirs?.total ?? 0 }));
  }
  if ( fx.time ) {
    // Until the end of the attacker's next turn (its current one, if it is attacking in it, does not count)
    const { encounterOf } = await import("./triggers.mjs");
    const myTurn = encounterOf(attacker)?.combatant?.actor?.uuid === attacker.uuid;
    ops.push({ op: "timed", uuid: target.uuid, key: "slowed", add: 1, duration: "endOfSourceTurn", label: "Time", source: attacker.uuid, skip: myTurn ? 1 : 0 });
    ops.push({ op: "timed", uuid: target.uuid, key: "guardDown", add: 1, duration: "endOfSourceTurn", label: "Time", source: attacker.uuid, skip: 0 });
    lines.push(L("DBU.Profile.Time", { name: target.name }));
  }
  if ( fx.destruction ) {
    const loss = (target.getFlag("dbu-rpg", "maxLifeLoss") ?? 0) + damage;
    ops.push({ op: "flag", uuid: target.uuid, key: "maxLifeLoss", value: loss });
    lines.push(L("DBU.Profile.Destruction", { name: target.name, n: damage }));
    if ( (target.system.life.max - damage) <= 0 ) lines.push(L("DBU.Profile.Erased", { name: target.name }));
  }
  await runOps(ops);
  if ( lines.length ) await postInfoCard({ actor: attacker, title: DBU.profiles[fx.keys.find(k => ["gravityCage", "time", "destruction"].includes(k))]?.label ?? attack.name, subtitle: attack.name, lines });
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

/* -------------------------------------------- */
/*  Knockback                                   */
/* -------------------------------------------- */

/**
 * Button on the attack card, for a target that took Damage: the Might Clash of the Knockback Advantage, then the
 * target is moved up to the attacker's Might in Squares in a straight line away (any direction for an AoE).
 *  - Forceful Launch: +1(T) Squares and +1(T) to the Might Clash per rank; Perfect Positioning: +1(T) to the Clash;
 *  - Precise Strike: with a Critical Result on the Strike Roll, 1/2 more Squares;
 *  - Super Launch: the Might Clash is won, and the target loses Life Points equal to the Squares it would move;
 *  - Launching: double Collision Damage; Local / Deep Space: +1(bT) / +2(bT) Might for the Clash and the Squares.
 */
export async function knockbackTarget(message, index) {
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  const t = attack?.targets?.[index];
  const k = attack?.knockback;
  if ( !t || !k ) return;
  if ( !(t.damage > 0) ) return ui.notifications.info(L("DBU.Knockback.NoDamage"));
  if ( t.knockback ) return ui.notifications.info(L("DBU.Knockback.Done"));
  const attacker = await fromUuid(attack.attackerUuid);
  if ( !attacker?.isOwner ) return ui.notifications.warn(L("DBU.Notify.NotOwner"));
  const target = await resolveActor(t);
  const token = t.tokenUuid ? await fromUuid(t.tokenUuid) : null;
  if ( !target || !token ) return ui.notifications.warn(L("DBU.Move.NoTargetToken", { name: t.name }));
  const sys = attacker.system;
  const T = sys.top.current;
  const space = (k.space ?? 0) * sys.top.base;
  const forceful = (k.forceful ?? 0) * T;
  const positioning = attacker.items.some(i => (i.type === "transformation") && /^perfect positioning$/i.test(i.name)
    && ((i.system.stacks ?? 0) > 0)) ? T : 0;
  let squares = sys.aptitudes.might + space + forceful;
  if ( k.precise && attack.strike?.crit ) squares += Math.floor(squares / 2);
  const lines = [];
  let won = true;
  if ( k.superLaunch ) lines.push(L("DBU.Knockback.Auto"));
  else {
    const extra = [{ label: "Forceful Launch", value: forceful }, { label: L("DBU.Knockback.Space"), value: space },
      { label: "Perfect Positioning", value: positioning }];
    const mine = await attacker.rollClash("might", { extra, subtitle: "Knockback" });
    const theirs = await target.rollClash("might", { subtitle: "Knockback" });
    // The attacker makes the Clash: the target wins ties
    won = (mine?.total ?? 0) > (theirs?.total ?? 0);
    lines.push(L(won ? "DBU.Grapple.ClashWin" : "DBU.Grapple.ClashLose",
      { name: attacker.name, other: target.name, mine: mine?.total ?? 0, theirs: theirs?.total ?? 0 }));
  }
  if ( won && k.precise && attack.strike?.crit ) lines.push(L("DBU.Knockback.Precise"));
  if ( !won ) lines.push(L("DBU.Knockback.Failed", { name: target.name }));
  await postInfoCard({ actor: attacker, title: "Knockback", subtitle: attack.name, lines });
  let result = null;
  if ( won && (await throughGrapple(attacker, target, "Knockback")) ) {
    result = await forcedMove({ source: attacker, target: token, squares, away: !k.aoe, double: !!k.double,
      label: `Knockback: ${attack.name}` });
    if ( result && k.superLaunch && (result.total > 0) ) {
      await runOps([{ op: "life", uuid: target.uuid, amount: result.total }]);
      await postInfoCard({ actor: attacker, title: "Super Launch", subtitle: target.name,
        lines: [L("DBU.Knockback.SuperLaunch", { name: target.name, n: result.total })] });
    }
  }
  const kb = { won, moved: result?.moved ?? 0 };
  if ( message.isOwner ) await storeKnockbackOnMessage(message.id, index, kb);
  else emitGM("attackKnockback", { messageId: message.id, targetIndex: index, knockback: kb });
  return kb;
}

export async function storeKnockbackOnMessage(messageId, index, knockback) {
  const message = game.messages.get(messageId);
  if ( !message ) return;
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  if ( !attack.targets[index] ) return;
  attack.targets[index].knockback = knockback;
  await refreshAttackMessage(message, attack);
}

/**
 * Reduce Life Points (through the GM if needed) and grant Bonus Momentum to the attacker.
 */
export async function applyDamageToActor(target, damage, { attacker = null, attack = null, lines = [], selfInflicted = false, category = null } = {}) {
  const tsys = target.system;
  // Narrative Stamina (Adversaries): the Life Points lost go down by the Narrative Stamina spent
  const stamina = selfInflicted ? { damage, absorbed: 0, stamina: null } : staminaAbsorb(target, damage);
  damage = stamina.damage;
  if ( stamina.absorbed ) lines = [...lines, L("DBU.Adversary.StaminaAbsorbed", { n: stamina.absorbed, left: stamina.stamina })];
  const before = tsys.life.value;
  const after = before - damage;
  const undying = (tsys._effectiveStates?.undying ?? 0) > 0;
  const value = undying ? after : Math.max(0, after);
  const lifeUpdate = { "system.life.value": value };
  if ( stamina.absorbed ) lifeUpdate["system.adversary.stamina"] = stamina.stamina;
  await safeUpdate(target, lifeUpdate, { dbuDamage: { attackerUuid: attacker?.uuid ?? null, selfInflicted } });
  const R = rules();
  const notes = [];
  const max = tsys.life.max;
  // Overkill Rules: more than 1/3 (rounded up) of the Maximum Life Points in one attack
  if ( R.overkill && attack && (damage > Math.ceil(max / 3)) ) notes.push(L("DBU.Damage.Overkill"));
  // Injury System: the attacker chooses the Injury (Threshold and Type) right away
  const injury = (attack && !selfInflicted)
    ? injuryCheck(target, { damage, lifeAfter: value, lifeMax: max, category: category ?? attack.category ?? 1, attack }) : null;
  if ( injury?.noType ) notes.push(L("DBU.Injury.NoTypeDeclared"));
  else if ( injury ) notes.push(L(injury.max === "major" ? "DBU.Injury.CanMajor" : "DBU.Injury.CanMinor", { name: target.name }));
  await postInfoCard({
    actor: target, title: L("DBU.Damage.Applied", { name: target.name, damage }),
    subtitle: attack?.name ?? "", lines: [...lines, L("DBU.Damage.LifeChange", { before, after: value }), ...notes],
    img: target.img
  });
  if ( injury && !injury.noType ) {
    requestInjury({ targetUuid: target.uuid, attackerUuid: attacker?.uuid ?? null, max: injury.max,
      forcedType: injury.forcedType, attackName: attack?.name ?? "" });
  }

  // Villainous: defeating the Player Character of a 1-on-1 Duel; Dauntless gives no Bonus Momentum
  const V = await import("./villainous.mjs");
  if ( attacker && (value <= 0) && !selfInflicted ) await V.oneOnOneDefeated(attacker, target);
  // Bonus Momentum: knocking an Opponent through a Health Threshold (once per Combat Round)
  if ( attacker && game.combat?.started && !selfInflicted && !V.traitOf(target, "Dauntless") ) {
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
  // On a phone the targets are picked from a list (no T key)
  if ( mobileActive() ) {
    const attacker = attack?.attackerUuid ? await fromUuid(attack.attackerUuid) : null;
    if ( (await pickTargets(attacker?.actor ?? attacker)) === null ) return;
  }
  const targets = Array.from(game.user.targets ?? []);
  if ( !targets.length ) return ui.notifications.warn(L("DBU.Attack.NoTargets"));
  attack.targets = targets.map(t => ({
    tokenUuid: t.document?.uuid ?? null, actorUuid: t.actor?.uuid ?? null, name: t.name, img: t.document?.texture?.src ?? t.actor?.img,
    result: null, defense: null, damage: null, dimApplied: false
  }));
  await refreshAttackMessage(message, attack);
}
