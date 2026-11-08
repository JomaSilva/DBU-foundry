import { DBU } from "../config.mjs";
import { dbuRoll, postInfoCard } from "../dice/roller.mjs";
import { categoryToDice, greaterDiceCategory } from "../rules/dice.mjs";
import { emitGM, safeUpdate } from "../socket.mjs";
import { INJURY_TYPES, limitedPower, rules } from "../optional-rules.mjs";
import { injuryCheck, requestInjury } from "./injuries.mjs";
import { actorTokens, outOfAoeHeight, spaceLevel, targetDistances } from "../canvas/height.mjs";
import { attackFxData } from "../canvas/attack-fx.mjs";
import { LONG_RANGE, aoeMagnitude } from "../rules/height.mjs";
import { forcedMove, runOps } from "./movement.mjs";
import { throughGrapple } from "./grapple.mjs";
import { resolveClash } from "./clash.mjs";
import { mobileActive } from "../mobile.mjs";
import { pickTargets } from "../targets.mjs";
import { attackProfileEffects, elementalKey, favoredElements, profileAccess, profileAccessNames, profileEffects,
  profileKeys } from "../rules/profiles.mjs";
import { SIGNATURE_OPTIONS, grantedSignature } from "../rules/signature.mjs";
import { awakeningSlug } from "../rules/awakening.mjs";
import { hyperElementalField, multiProfileField, resolveHyperElemental, resolveMultiProfile, spendHyperElemental,
  spendMultiProfile } from "./multi-profile.mjs";
import { ignoresCapacity, staminaAbsorb, staminaPayment } from "./adversary.mjs";
import { collectModifiers } from "../rules/modifiers.mjs";
import { evaluate, test } from "../rules/formula.mjs";
import { OPTION_FRACTION, OPTION_TEXT, autoChosen, choseVars, chosenPieces, countOptionLimits, optionCostPlan, optionDialog,
  optionPieces, payOptions, pieceUseKey, spentVars, withOptionFields } from "../rules/options.mjs";
import { VS_ATTACK_DAMAGE, VS_ATTACK_STRIKE, VS_DEFERRED, VS_HIT, VS_PRE, aggregates, areAllies, attackerSidePiece, punchOf,
  punchSizes, punchVars, versusData, versusMods, versusPieces } from "../rules/versus.mjs";
import { triggerUsesLeft as triggerUsesLeftNow } from "./triggers.mjs";

/** Is the actor in a started Combat Encounter (its own: the tracker may show another one)? */
const inEncounter = actor => !!game.combats?.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor?.uuid));

const { DialogV2 } = foundry.applications.api;
const FDE = () => foundry.applications.ux.FormDataExtended;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const FLAG = "dbu-rpg";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** How an attack may be made ("Made through" in the dialog): Exploit, Defend (a Counter) or Feint (@via_<key>). */
const VIA = ["exploit", "defend", "feint"];
/** The attack option whose value is text: the Damage Attribute allowed ("pe", "fo|ma", "surgency", "any"). */
const DAMAGE_ATTRIBUTE = "attack.damageAttribute";
/** Attack options whose value keeps its fraction (1/2 of the Damage Reduction ignored, x1.5 Diminishing Defense...). */
const FRACTION_OPTIONS = OPTION_FRACTION;
/** Attack options chosen with a select of the dialog instead of a box (the Damage Attribute, the AoE shape). */
const SELECT_OPTIONS = new Set([DAMAGE_ATTRIBUTE, "attack.aoe", "attack.advantagePick", "attack.advantagePick.copied",
  "attack.removeAdvantage", "attack.removeDisadvantage"]);
/** AO: Advantages (or Disadvantages of 6 TP or less) of the Signature taken off this attack (Employed for Skill). */
const REMOVE_TARGETS = { adv: "attack.removeAdvantage", dis: "attack.removeDisadvantage" };
const REMOVE_TARGET_SET = new Set(Object.values(REMOVE_TARGETS));
/** What the technique may lose: [{ value: "adv:<key>" | "dis:<key>", label }] (one entry per rank). */
function removableOptions(sig, kinds) {
  const out = [];
  for ( const [kind, list] of [["adv", sig?.advantages], ["dis", sig?.disadvantages]] ) {
    if ( !kinds.includes(kind) ) continue;
    for ( const o of Array.from(list ?? []) ) {
      const def = SIGNATURE_OPTIONS[o?.key];
      if ( !def ) continue;
      const rank = Math.max(1, Math.floor(Number(o.rank) || 1));
      if ( (kind === "dis") && !(Math.abs(Number(def.costs?.[rank - 1] ?? def.costs?.[0] ?? 99)) <= 6) ) continue;
      for ( let r = 0; r < Math.min(rank, 2); r++ ) out.push({ value: `${kind}:${o.key}`, label: `${def.name}${rank > 1 ? ` (${rank - r})` : ""}` });
    }
  }
  return out;
}
/**
 * AO: the one-shot pieces of the removals picked (two selects): each removes a rank (attack.advantage.<key> -1) and gives
 * +2(T) Wound (an Advantage) or +1(T) Ki Point Cost (a Disadvantage); only one kind, up to the piece's value.
 */
function removePickPieces(mods, picks, sig) {
  const chosen = picks.map(v => String(v ?? "")).filter(v => /^(adv|dis):/.test(v));
  if ( !chosen.length || !sig ) return [];
  const kind = chosen[0].slice(0, 3);
  const piece = mods.find(m => m.target === REMOVE_TARGETS[kind]);
  if ( !piece ) return [];
  const list = chosen.filter(v => v.startsWith(`${kind}:`)).slice(0, Math.max(0, Math.floor(Number(piece.value) || 0)));
  if ( !list.length ) return [];
  // (fromRemove, not fromPick: every removal counts, not only the first pick)
  const base = { ...piece, mode: "", group: "", amount: "", fromRemove: true, limitKey: String(piece.limitKey ?? "").trim() || pieceUseKey(piece) };
  return [...list.map(v => ({ ...base, target: `attack.advantage.${v.slice(4)}`, value: "-1" })),
    (kind === "adv") ? { ...base, target: "attack.wound", value: `${2 * list.length}(T)` } : { ...base, target: "attack.kp", value: `${list.length}(T)` }];
}
/** R: "attack.advantagePick" (value = the most TP): an Advantage of the player's choice for this attack, picked in the dialog. */
const ADV_PICK = "attack.advantagePick";
/** AP: "attack.advantagePick.copied": the same, among the Advantages of your Copied Techniques only. */
const ADV_PICK_COPIED = "attack.advantagePick.copied";
const isPick = t => (t === ADV_PICK) || (t === ADV_PICK_COPIED);
/** The Advantages whose first rank costs at most `tp` TP. */
export function pickableAdvantages(tp) {
  return Object.values(SIGNATURE_OPTIONS).filter(d => (d.kind === "advantage") && Number.isFinite(d.costs?.[0]) && (d.costs[0] <= tp))
    .sort((a, b) => a.name.localeCompare(b.name));
}
/** The one-shot Advantage pieces of an "attack.advantagePick" pick: each pick piece that allows it gives that Advantage
 * (rank 1) with its condition, limit and cost; the dialog's select was the choice. */
export function advantagePickPieces(mods, key) {
  const def = key ? SIGNATURE_OPTIONS[key] : null;
  if ( !def || (def.kind !== "advantage") || !Number.isFinite(def.costs?.[0]) ) return [];
  return mods.filter(m => isPick(m.target)).map(m => ({ ...m, target: `attack.advantage.${key}`, value: "1", mode: "", group: "", amount: "",
    fromPick: true, limitKey: String(m.limitKey ?? "").trim() || pieceUseKey(m),
    condition: [String(m.condition ?? "").trim(), `(${String(m.value || 0)}) >= ${def.costs[0]}`].filter(Boolean).map(c => `(${c})`).join(" && ") }));
}
/** The AoE shapes an "attack.aoe" option may give an attack that has none ("any": every one). */
const AOE_SHAPES = ["sphere", "cone", "line"];
/** The attack options an `at: "wound"` piece may have: the ones the Wound Roll and the Damage still read (Package F:
 * Energy Charges, their Dice Category and the Damage Attribute again, added when it hits). */
export const WOUND_TARGETS = ["attack.wound", "attack.greaterDice", "attack.crit.wound", "attack.natural.wound",
  "attack.critSet.wound", "attack.category", "attack.ignoreSoak", "attack.ignoreDR", "attack.charges", "attack.chargeCategory",
  "attack.damageAttrTimes"];
/** F2: options that add an Advantage / Disadvantage (attack.advantage.<key>: + ranks, negative removes) or a Super Profile
 * (attack.superProfile.<key>) to this attack. */
const GRANT_TARGET = /^attack\.(advantage|superProfile)\.(.+)$/;
const isGrant = o => GRANT_TARGET.test(String(o?.target ?? ""));
/** Lowercase letters and digits of a name, accents dropped (@weapon_<slug>, @sig_<slug>). */
const slugOf = s => awakeningSlug(s);
/** The label of the Punching Down Extra Dice on the Wound Roll (its total is kept apart: wound.punchDown). */
const PUNCH_DICE = "Punching Down";
/** A rule switch of the actor ("flag.<key>" modifiers), also when the sheet's flags do not list it. */
const flagOn = (sys, key) => !!sys.flags?.[key] || ((sys.buckets?.[`flag.${key}`]?.total ?? 0) > 0);
const blank = v => !String(v ?? "").trim();
/** "Tail Attack Maneuver" → tailattack (@via_tailattack). */
const maneuverSlug = name => String(name ?? "").toLowerCase().replace(/maneuver/g, "").replace(/[^a-z0-9]/g, "");
/** The tags of a Signature ("copied, fullPower" → ["copied", "fullPower"]). */
const sigTags = sig => String(sig?.tags ?? "").split(/[,;]/).map(s => s.trim()).filter(Boolean);
/** The Defend options and the variables of a defense (@dodge, @parry..., @counter: a Defend option, @defenseCrit). */
const DEFEND_MODES = ["dodge", "parry", "guard", "directHit", "crossCounter", "powerFlare", "divineFlex", "none"];
const COUNTER_MODES = ["parry", "guard", "directHit", "crossCounter", "powerFlare", "divineFlex"];
function defendVars(def) {
  const mode = def?.mode;
  const out = {};
  if ( DEFEND_MODES.includes(mode) ) out[mode] = 1;
  out.counter = COUNTER_MODES.includes(mode) ? 1 : 0;
  // RB: the hit taken through Intervene (Defense Wall, a lost Deflect): @intervene
  out.intervene = (mode === "intervene") ? 1 : 0;
  // DC: the defender's option groups chosen for this defense (@defChose.<group>: its n) and the effect that waived its
  // Counter Action (@waivedFx.<ref>)
  out.defChose = { ...(def?.defChose ?? {}) };
  out.waivedFx = def?.waivedFx ? { [String(def.waivedFx).toLowerCase()]: 1 } : {};
  // RD: that Intervene spent no Counter Action (@interveneFree) and through which effect (@interveneFreeFx.<ref>)
  out.interveneFree = ((mode === "intervene") && def?.free) ? 1 : 0;
  if ( (mode === "intervene") && def?.freeFx ) out.interveneFreeFx = { [String(def.freeFx).toLowerCase()]: 1 };
  out.defenseCrit = def?.crit ? 1 : 0;
  return out;
}
/** The uses key of an attack option: its limitKey, or "opt:<key>". */
const optKey = o => pieceUseKey(o);
/** @punchDown / @punchUp (1/0) of one attacker/target pair, also as @punchDownAll / @punchUpAll ({} without targets). */
function pairPunch(attack, target) {
  if ( !attack?.punch || !target?.system ) return {};
  const p = punchOf(attack.punch, target);
  return { punchDown: p.down, punchUp: p.up ? 1 : 0, punchDownAll: p.down, punchUpAll: p.up ? 1 : 0 };
}

/* -------------------------------------------- */
/*  F1: the "with" of an Out-of-Sequence attack  */
/* -------------------------------------------- */

/**
 * The `with` text of an attack made by an effect's button (the "maneuver" trigger effect: basicAttack, signature, exploit,
 * feint), ";"-separated parts:
 *  - "<attack.* target>=<formula>": applied to that attack like an automatic option piece ("attack.category=1");
 *  - "only=<filter>[|<filter>]": the attack must be one of them (several "only" parts must all hold): physical, energy,
 *    magic, armed, unarmed, signature, basic, ultimate, aoe, noaoe, copied, tag:<tag>, profile:<key>, element:<name>;
 *  - "via=<slug>": "Made through" preselected (exploit, defend, feint or the slug of a Maneuver item);
 *  - "attr=<attr>": its Damage Attribute (ag, fo... or surgency).
 * @returns {{pieces: {target: string, value: string}[], only: string[][], via: string, attr: string}}
 */
export function parseAttackWith(text) {
  const out = { pieces: [], only: [], via: "", attr: "" };
  for ( const raw of String(text ?? "").split(";") ) {
    const part = raw.trim();
    const eq = part.indexOf("=");
    if ( eq < 1 ) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if ( !value ) continue;
    if ( key === "only" ) out.only.push(value.split("|").map(s => s.trim()).filter(Boolean));
    else if ( key === "via" ) out.via = value;
    else if ( key === "attr" ) out.attr = value.toLowerCase();
    else if ( key.startsWith("attack.") ) out.pieces.push({ target: key, value });
  }
  return out;
}

/** The one-shot option pieces of a parsed `with` (automatic, no limit), as the item modifiers are. */
function withPieces(parsed, label) {
  const piece = (target, value, id) => ({ target, value, condition: "", mode: "", limit: "", cost: "", amount: "", group: "",
    limitKey: "", at: "", label, own: "", itemId: id, ctx: {}, oneShot: true });
  const out = (parsed?.pieces ?? []).map((p, i) => piece(p.target, p.value, `with${i}`));
  if ( parsed?.attr ) out.push(piece(DAMAGE_ATTRIBUTE, parsed.attr, "withAttr"));
  return out;
}

/**
 * Does one "only" filter hold for these facts of the attack? A fact not given (undefined) holds: the dialog tests what it
 * knows (a Foundation, a Profile), executeAttack every fact.
 */
function onlyFilter(filter, f) {
  const [kind, ...rest] = String(filter).split(":");
  const arg = rest.join(":").trim();
  const k = kind.trim().toLowerCase();
  const is = (v, want) => ((v === undefined) ? true : (!!v === want));
  switch ( k ) {
    case "physical": case "energy": case "magic": return (f.foundation === undefined) || (f.foundation === k);
    case "armed": return is(f.armed, true);
    case "unarmed": return is(f.armed, false);
    case "signature": return is(f.signature, true);
    case "basic": return is(f.basic, true);
    case "ultimate": return is(f.ultimate, true);
    case "aoe": return is(f.aoe, true);
    case "noaoe": return is(f.aoe, false);
    case "copied": return (f.tags === undefined) || f.tags.includes("copied");
    case "tag": return (f.tags === undefined) || f.tags.some(t => t.toLowerCase() === arg.toLowerCase());
    case "profile": return (f.profiles === undefined) || f.profiles.some(p => p.toLowerCase() === arg.toLowerCase());
    case "element": {
      const key = elementalKey(arg);
      return (f.profiles === undefined) || (!!key && f.profiles.includes(key));
    }
    default: return false;
  }
}
/** Do the "only" filters hold (every part; in a part, one of its filters)? */
const onlyPass = (only, facts) => (only ?? []).every(group => group.some(filter => onlyFilter(filter, facts)));

/**
 * May this Signature Technique be the attack of an effect's `with` (its "only" filters: what the technique itself says;
 * the Weapon is picked later)? For a picker of Signatures (documents/actor.mjs useOutOfSequence "signature").
 * @param {Item} signature
 * @param {string} withText
 */
export function signatureAllowed(signature, withText) {
  const only = parseAttackWith(withText).only;
  if ( !only.length ) return true;
  const s = signature?.system;
  if ( !s ) return false;
  const keys = profileKeys(s.profile, s);
  return onlyPass(only, { foundation: s.foundation, signature: true, basic: sigTags(s).includes("fullPower"), ultimate: !!s.computed?.ultimate,
    aoe: !!s.computed?.aoe, tags: sigTags(s), profiles: keys });
}

/**
 * "Made through" from a raw value: an option of the dialog ("exploit", "item:<id>") or a slug (exploit, defend, feint, or
 * the slug of one of the actor's Maneuver items: tailattack). Returns the dialog's value ("" when none matches).
 */
function viaValue(actor, raw) {
  const v = String(raw ?? "").trim();
  if ( !v ) return "";
  if ( VIA.includes(v) ) return v;
  if ( v.startsWith("item:") ) return actor.items.get(v.slice(5)) ? v : "";
  const item = actor.items.find(i => (i.type === "maneuver") && (maneuverSlug(i.name) === maneuverSlug(v)));
  return item ? `item:${item.id}` : "";
}

/** The slugs a Weapon answers to (@weapon_<slug>): its name, its Category and its Qualities. */
function weaponSlugs(weapon) {
  if ( !weapon ) return [];
  const s = weapon.system ?? {};
  return [...new Set([weapon.name, s.category, ...(s.qualities ?? []).map(q => q?.name)].map(slugOf).filter(Boolean))];
}

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
 * @param {string} [options.with]           F1: the one-shot pieces, filters, "via" and "attr" of an effect's attack
 * @param {string} [options.viaFx]          F1: the reference of the effect whose button made the attack (@viaFx.<ref>)
 * @param {string} [options.via]            "Made through" preselected (exploit, feint...)
 */
export async function openAttackDialog(actor, { signature = null, profile = null, divine = null, outOfSequence = false,
  with: withText = "", viaFx = "", via = "" } = {}) {
  const sys = actor.system;
  const sig = signature?.system ?? null;
  const comp = sig?.computed ?? null;
  // F1: what the effect's button says of this attack (one-shot pieces, the attacks it may be, how it is made)
  const withSpec = parseAttackWith(withText);
  const oneShot = withPieces(withSpec, L("DBU.Attack.WithLabel"));
  const only = withSpec.only;
  const profileFacts = (k, f) => ({ foundation: f, profiles: [k], aoe: !!DBU.profiles[k]?.aoe, signature: false, basic: true });
  const profileOk = k => (DBU.profiles[k]?.foundations ?? []).some(f => onlyPass(only, profileFacts(k, f)));
  const profileKey = sig ? sig.profile : ((!profile && only.length) ? (Object.keys(DBU.profiles).find(k => profileAccess(actor, k)
    && profileOk(k)) ?? "simple") : (profile ?? "simple"));
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
  // F1 "only": the Profiles, Foundations and Weapon choices the attack may have (executeAttack refuses the others)
  const profileList = Object.entries(DBU.profiles).filter(allowed);
  const onlyProfiles = profileList.filter(([k]) => profileOk(k));
  const profileOptions = ((only.length && onlyProfiles.length) ? onlyProfiles : profileList).map(([k, p]) =>
    `<option value="${k}" ${k === profileKey ? "selected" : ""}>${p.label} — ${p.kp}(T) KP</option>`).join("");
  const foundationsOf = k => {
    const list = DBU.profiles[k]?.foundations ?? ["physical"];
    const ok = list.filter(f => onlyPass(only, { foundation: f }));
    return ok.length ? ok : list;
  };
  const firstFoundation = sig?.foundation ?? foundationsOf(profileKey)[0];
  const foundationOptions = (sig ? (prof?.foundations ?? ["physical"]) : foundationsOf(profileKey)).map(f =>
    `<option value="${f}" ${f === firstFoundation ? "selected" : ""}>${L(DBU.foundations[f])}</option>`).join("");
  const unarmedOk = onlyPass(only, { armed: false });
  const armedOk = onlyPass(only, { armed: true });
  const weaponOptions = [...((unarmedOk || !weapons.length) ? [`<option value="">${L("DBU.Attack.Unarmed")}</option>`] : []),
    ...(armedOk ? weapons : []).map(w => `<option value="${w.id}">${w.name} (${L(DBU.foundations[w.system.weaponType])})</option>`)].join("");
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
  // (T11: the Actions spent through Giga Flare / Super Combination, when this Signature or an effect may have one)
  const superActsOn = ["gigaFlare", "superCombination"].includes(sig?.superProfile ?? "")
    || Array.from(actor.items ?? []).some(i => Array.from(i.system?.modifiers ?? []).some(m => /^attack\.superProfile\.(gigaFlare|superCombination)$/.test(String(m?.target ?? ""))));
  const superActBox = superActsOn ? `<div class="form-group"><label>${L("DBU.T11.SuperActions")}</label>
      <input type="number" name="superActions" value="0" min="0" step="1"></div>` : "";
  // (T12: the Squares moved in a straight line through Charging Assault, when this Signature or an effect may have it)
  const chargeOn = (sig?.advantages ?? []).some(a => a?.key === "chargingAssault")
    || Array.from(actor.items ?? []).some(i => Array.from(i.system?.modifiers ?? []).some(m => String(m?.target ?? "") === "attack.advantage.chargingAssault"));
  const chargeBox = chargeOn ? `<div class="form-group"><label>${L("DBU.T12.ChargeSquares")}</label>
      <input type="number" name="chargeSquares" value="0" min="0" step="1"></div>` : "";
  // Adversaries: Narrative Stamina in the place of Ki Points
  const staminaBox =((actor.type === "adversary") && (sys.adversary?.stamina > 0)) ? `<div class="dbu-checks">
      <label><input type="checkbox" name="staminaPay" ${sys.adversary.staminaPays ? "checked" : ""}>
        ${L("DBU.Adversary.PayWithStamina", { n: sys.adversary.stamina })}</label></div>` : "";

  // Attack options of the items that are a choice ("you may"): a box each (checked again when the attack is made). The
  // boxes come before the Ki Wager, the Weapon, the Damage Attribute... are chosen: an option gets one when it applies
  // with any of those choices (the largest Ki Wager, Divine Ki for both payments)
  const { triggerUsesLeft, costPlan } = await import("./triggers.mjs");
  // FC: Final Chance (the technique's Advantage, or an option that adds it) while below the Injured Health Threshold
  const fcLife = Math.max(0, sys.life.value ?? 0);
  const fcHas = (sig?.advantages ?? []).some(a => a?.key === "finalChance");
  let finalChanceBox = "";
  const offered = attackOptionsAny(actor, dialogScopes(actor, { sig, comp, prof, profileKey,
    foundation: sig?.foundation ?? prof?.foundations?.[0], divine, outOfSequence, targets, sigName: signature?.name ?? "", viaFx }),
  oneShot);
  const usable = o => !o.limit || triggerUsesLeft(actor, { limit: o.limit, ctx: o.ctx }, optKey(o));
  // The boxes: one per option, one per group of options (group); a box with an amount gets a number input, one with a
  // cost says it and is disabled while it cannot be paid (with n = 1). A group is asked when one of its pieces is, even
  // one that does not apply now (as executeAttack sees it)
  const askBoxes = attackBoxes(offered.filter(o => !SELECT_OPTIONS.has(o.target)), askedBoxes(optionMods(actor)))
    .filter(b => b.ask);
  const boxLine = (b, i) => {
    const o = b.pieces[0];
    const plain = (b.pieces.length === 1) && !b.group && !b.max && blank(o.cost);
    const costed = b.pieces.filter(p => !blank(p.cost));
    const plan = costed.length ? costPlan(actor, costed.map(p => ({ cost: p.cost,
      data: { ...(actor.system.rollData ?? {}), ...(p.ctx ?? {}), ...(p.scope ?? {}), n: 1 } }))) : null;
    const off = !b.pieces.some(usable) || !!plan?.problems.length;
    const text = plain ? optionText(o) : b.pieces.map(p => optionText(p)).join(" + ");
    const cost = (plan && !plan.empty) ? ` <small>(${esc(L("DBU.Attack.OptionCost", { cost: plan.text }))})</small>` : "";
    const amount = b.max ? ` <input type="number" name="optn_${i}" value="1" min="1" max="${Math.floor(b.max)}" step="1"
      data-tooltip="${esc(L("DBU.Attack.OptionAmount", { max: Math.floor(b.max) }))}">` : "";
    const ex = b.pieces.map(p => String(p.exclusive ?? "").trim()).find(Boolean) ?? "";
    return `<label><input type="checkbox" name="opt_${i}" ${off ? "disabled" : ""} ${ex ? `data-exclusive="${esc(ex)}"` : ""}>
      ${foundry.utils.escapeHTML(text)}${cost}</label>${amount}`;
  };
  const optionsBox = askBoxes.length ? `<div class="dbu-checks dbu-attack-options"><strong>${L("DBU.Attack.Options")}</strong>
    ${askBoxes.map(boxLine).join("")}</div>` : "";
  // An AoE shape for an attack without an AoE (attack.aoe options): Cone, Line
  if ( ((sys.rollData?.below ?? 0) >= 2) && (fcLife > 0) && (fcHas || offered.some(o => o.target === "attack.advantage.finalChance")) ) {
    finalChanceBox = `<label><input type="checkbox" name="finalChance"> ${L("DBU.Attack.FinalChanceBox", { n: fcLife })}</label>`;
  }
  const aoeKeys = [...new Set(offered.filter(o => (o.target === "attack.aoe") && usable(o)).flatMap(o => aoeShapes(o.value)))];
  const aoeAuto = offered.some(o => (o.target === "attack.aoe") && (o.mode !== "ask") && usable(o));
  const aoeBox = aoeKeys.length ? `<div class="form-group"><label>${L("DBU.Attack.AoeShape")}</label>
    <select name="aoeShape">${aoeAuto ? "" : `<option value="">—</option>`}
      ${aoeKeys.map(k => `<option value="${k}">${esc(L(`DBU.Attack.AoeShapes.${k}`))}</option>`).join("")}</select></div>` : "";
  // Damage Attribute options: the Wound Roll may use another Attribute (by default FO, MA for Magic Attacks)
  const damageKeys = [...new Set(offered.filter(o => (o.target === DAMAGE_ATTRIBUTE) && usable(o))
    .flatMap(o => damageAttributeKeys(o.value)))];
  // (F1 "attr": the effect's Damage Attribute, picked)
  const attrPick = damageAttributeKeys(withSpec.attr)[0] ?? "";
  // R: an Advantage of the player's choice up to N TP (attack.advantagePick): the highest N of the pieces that apply
  const pickPieces = offered.filter(o => isPick(o.target) && usable(o));
  const pickTp = Math.max(0, ...pickPieces.map(o => Number(o.value) || 0));
  // AP: the select joins an "exclusive" set when every pick piece that applies is in that set; ".copied" pieces only offer
  // the Advantages one of your Copied Techniques has
  const pickExs = [...new Set(pickPieces.map(p => String(p.exclusive ?? "").trim()))];
  const pickEx = ((pickExs.length === 1) && pickExs[0]) ? pickExs[0] : "";
  const copiedOnly = pickPieces.length && pickPieces.every(p => p.target === ADV_PICK_COPIED);
  const copiedKeys = copiedOnly ? new Set(actor.items.filter(i => (i.type === "signature") && sigTags(i.system).includes("copied"))
    .flatMap(i => Array.from(i.system.advantages ?? []).map(a => a?.key).filter(Boolean))) : null;
  const pickList = pickableAdvantages(pickTp).filter(d => !copiedKeys || copiedKeys.has(d.key));
  // AO: Employed for Skill: up to N Advantages (or Disadvantages of 6 TP or less) of the Signature taken off it
  const removeKinds = Object.entries(REMOVE_TARGETS).filter(([, t]) => offered.some(o => (o.target === t) && usable(o))).map(([k]) => k);
  const removeList = (sig && removeKinds.length) ? removableOptions(sig, removeKinds) : [];
  const removeSelect = n => `<select name="removeOpt${n}"><option value="">—</option>${removeList.map(o =>
    `<option value="${o.value}">${esc(L(o.value.startsWith("adv") ? "DBU.Attack.RemoveAdv" : "DBU.Attack.RemoveDis", { name: o.label }))}</option>`).join("")}</select>`;
  const removeBox = removeList.length ? `<div class="form-group"><label>${L("DBU.Attack.RemovePick")}</label>${removeSelect(1)}${removeSelect(2)}</div>` : "";
  const advPickBox = ((pickTp > 0) && pickList.length) ? `<div class="form-group"><label>${L("DBU.Attack.AdvantagePick", { n: pickTp })}</label>
    <select name="advantagePick" ${pickEx ? `data-exclusive="${esc(pickEx)}"` : ""}><option value="">—</option>
      ${pickList.map(d => `<option value="${d.key}">${esc(d.name)} (${d.costs[0]} TP)</option>`).join("")}</select></div>` : "";
  const damageBox = damageKeys.length ? `<div class="form-group"><label>${L("DBU.Attack.DamageAttribute")}</label>
    <select name="damageAttribute"><option value="">${L("DBU.Attack.DamageAttributeDefault")}</option>
      ${damageKeys.map(k => `<option value="${k}" ${(k === attrPick) ? "selected" : ""}>${esc(damageAttributeLabel(k))}</option>`).join("")}</select></div>` : "";
  // How the attack is made: through the Exploit, Defend (a Counter) or Feint Maneuvers (@via_exploit...)
  // ...and through the actor's Maneuver items (@via_<slug>: "Tail Attack Maneuver" → @via_tailattack); an effect's attack
  // may come with it picked (F1: its via, or "via=" in its with)
  const maneuverItems = actor.items.filter(i => (i.type === "maneuver") && maneuverSlug(i.name));
  const viaPick = viaValue(actor, via || withSpec.via);
  const viaSel = v => ((v === viaPick) ? "selected" : "");
  const viaBox = `<div class="form-group"><label>${L("DBU.Attack.Via")}</label><select name="via"><option value="">—</option>
    ${VIA.map(v => `<option value="${v}" ${viaSel(v)}>${L(`DBU.Attack.ViaOpt.${v}`)}</option>`).join("")}${maneuverItems.map(i =>
      `<option value="item:${i.id}" ${viaSel(`item:${i.id}`)}>${esc(i.name)}</option>`).join("")}</select></div>`;
  // Signatures with the "fullPower" tag are Basic Attacks too (@basic = 1): a Profile choice "Name (Full Power)"
  const fullPower = sig ? [] : actor.items.filter(i => (i.type === "signature") && sigTags(i.system).includes("fullPower"));
  const fullPowerOptions = fullPower.map(i => `<option value="fullPower:${i.id}" data-profile="${esc(i.system.profile)}">${esc(L("DBU.Attack.FullPower", { name: i.name }))}</option>`).join("");

  const content = `
  <div class="dbu-dialog">
    ${divine ? `<p class="dbu-dialog-sig"><strong><i class="fa-solid fa-sun"></i> ${divine.name}</strong> — ${L(divine.costFactor < 1
      ? "DBU.God.StrikeNote" : "DBU.God.AttackNote")}</p>` : ""}
    ${sig ? `<p class="dbu-dialog-sig"><strong>${signature.name}</strong> — ${L(`DBU.Sig.Level.${sig.level}`)} · ${profileEffects(profileKeys(profileKey, sig)).label} ·
      ${comp.kpUnits + comp.kpAdjust}(T) KP · ${comp.tp} TP</p>`
      : `<div class="form-group"><label>${L("DBU.Attack.Profile")}</label><select name="profile" ${divine?.profile ? "disabled" : ""}>${profileOptions}${divine ? "" : fullPowerOptions}</select></div>`}
    <div class="form-group"><label>${L("DBU.Attack.Foundation")}</label><select name="foundation">${foundationOptions}</select></div>
    ${multiProfileField(actor, { profileKey: sig ? profileKey : "", sig })}
    ${hyperElementalField(actor, { sig })}
    <div class="form-group"><label>${L("DBU.Attack.Weapon")}</label><select name="weaponId">${weaponOptions}</select></div>
    ${damageBox}
    ${aoeBox}
    ${advPickBox}
    ${removeBox}
    ${viaBox}
    <div class="form-group"><label>${L("DBU.Attack.Wager")} (${L("DBU.Attack.WagerMax", { max: maxWager })})</label>
      <input type="number" name="wager" value="0" min="0" step="1"></div>
    ${(rules().desperation && !sys.optional.desperationUsed) ? `<div class="form-group"><label>${L("DBU.Attack.LifeWager", { max: Math.floor(sys.capacity.max / 2) })}</label>
      <input type="number" name="lifeWager" value="0" min="0" step="1"></div>` : ""}
    ${finalChanceBox}
    ${dkp}
    ${staminaBox}
    ${swingsBox}
    ${optionsBox}
    <div class="form-group"><label>${L("DBU.Attack.Charges")} (${L("DBU.Attack.Pending", { n: pending })})</label>
      <input type="number" name="extraCharges" value="0" min="0" step="1"></div>
    ${superActBox}
    ${chargeBox}
    <div class="form-group"><label>${L("DBU.Attack.StrikeBonus")}</label><input type="number" name="strikeBonus" value="0" step="1"></div>
    <div class="form-group"><label>${L("DBU.Attack.WoundBonus")}</label><input type="number" name="woundBonus" value="0" step="1"></div>
    <div class="dbu-checks">
      <label><input type="checkbox" name="calledShot"> ${L("DBU.Attack.CalledShot")}</label>
      <label><input type="checkbox" name="longRange" ${atLongRange ? "checked" : ""}> ${L("DBU.Attack.LongRange")}</label>
      <label><input type="checkbox" name="oblivious" ${sys.combat.hidden ? "checked" : ""}> ${L("DBU.Attack.Oblivious")}</label>
      <label><input type="checkbox" name="rapid"> ${L("DBU.Attack.Rapid")}</label>
      <label><input type="checkbox" name="spendAction" ${outOfSequence ? "" : "checked"}> ${L("DBU.Attack.SpendCounter")}</label>
      <label><input type="checkbox" name="ignoreLimits"> ${L("DBU.Attack.IgnoreLimits")}</label>
    </div>
    ${rules().injurySystem ? `<div class="form-group"><label>${L("DBU.Injury.Intended")}</label><select name="injuryType">
      <option value="">—</option>${INJURY_TYPES.map(t => `<option value="${t}">${L(`DBU.Injury.${t}`)}</option>`).join("")}</select></div>` : ""}
    <p class="hint">${targets.length ? L("DBU.Attack.Targets", { names: targetNames }) : L("DBU.Attack.NoTargets")}
      ${atLongRange ? `<br>${L("DBU.Attack.LongRangeAuto")}` : ""}
      ${only.length ? `<br>${esc(L("DBU.Attack.WithOnly", { only: only.map(g => g.join(" | ")).join(" · ") }))}` : ""}</p>
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
        // A Full Power Signature: its own Profile's Foundations
        const picked = profileSelect.selectedOptions?.[0]?.dataset?.profile ?? profileSelect.value;
        const list = foundationsOf(picked);
        const current = foundationSelect.value;
        foundationSelect.innerHTML = list.map(f =>
          `<option value="${f}" ${f === current ? "selected" : ""}>${L(DBU.foundations[f])}</option>`).join("");
        filterMulti();
      });
      filterMulti();
      // RA: the boxes of one "exclusive" set: ticking one unticks the others
      const root = dialog.element;
      for ( const box of root.querySelectorAll("input[data-exclusive]") ) {
        box.addEventListener("change", () => {
          if ( !box.checked ) return;
          for ( const other of root.querySelectorAll(`input[data-exclusive="${CSS.escape(box.dataset.exclusive)}"]`) ) if ( other !== box ) other.checked = false;
          // (AP: the Advantage select of that set is cleared)
          for ( const sel of root.querySelectorAll(`select[data-exclusive="${CSS.escape(box.dataset.exclusive)}"]`) ) sel.value = "";
        });
      }
      // AP: picking an Advantage of an "exclusive" set unticks the boxes of that set
      for ( const sel of root.querySelectorAll("select[data-exclusive]") ) {
        sel.addEventListener("change", () => {
          if ( !sel.value ) return;
          for ( const box of root.querySelectorAll(`input[data-exclusive="${CSS.escape(sel.dataset.exclusive)}"]`) ) box.checked = false;
        });
      }
    },
    rejectClose: false
  });
  if ( !data || (data === "cancel") ) return null;
  // RA: one box per "exclusive" set (the first one ticked)
  const exSeen = new Set();
  data.attackOptions = askBoxes.filter((b, i) => data[`opt_${i}`]).filter(b => {
    const ex = b.pieces.map(p => String(p.exclusive ?? "").trim()).find(Boolean) ?? "";
    if ( !ex ) return true;
    if ( exSeen.has(ex) ) return false;
    exSeen.add(ex);
    return true;
  }).map(b => b.box);
  // AP: an Advantage picked in a set whose box was ticked is dropped
  if ( pickEx && exSeen.has(pickEx) ) data.advantagePick = "";
  // The n picked for the boxes with an amount
  const amounts = {};
  askBoxes.forEach((b, i) => { if ( b.max && data[`opt_${i}`] ) amounts[b.box] = Math.max(1, Math.floor(Number(data[`optn_${i}`]) || 1)); });
  if ( Object.keys(amounts).length ) data.optionAmounts = amounts;
  // A Full Power Signature picked as a Basic Attack's Profile
  const fp = (!sig && String(data.profile ?? "").startsWith("fullPower:")) ? actor.items.get(String(data.profile).slice(10)) : null;
  // (F1: the effect's with and reference go along)
  const effect = { ...(String(withText ?? "").trim() ? { with: String(withText) } : {}), ...(viaFx ? { viaFx } : {}) };
  if ( fp ) return executeAttack(actor, { ...data, ...effect, signatureId: fp.id, targets, divine, outOfSequence, profile: fp.system.profile });
  return executeAttack(actor, { ...data, ...effect, signatureId: signature?.id ?? null, targets, divine, outOfSequence,
    profile: sig ? profileKey : (divine?.profile ?? data.profile) });
}

/**
 * The boxes of the attack dialog: each option by itself, or every option of one group in one box (pieces). A box is
 * asked (ask) when one of its options is ("ask") or it has an amount to pick (max: the first amount), or its group is
 * one of `asked` (askedBoxes of every option modifier).
 */
function attackBoxes(options, asked = new Set()) {
  const boxes = new Map();
  for ( const o of options ) {
    let b = boxes.get(o.box);
    if ( !b ) boxes.set(o.box, b = { box: o.box, group: blank(o.group) ? "" : String(o.group).trim(), pieces: [], ask: false, max: 0 });
    b.pieces.push(o);
    if ( o.mode === "ask" ) b.ask = true;
    if ( !b.max && o.max ) b.max = o.max;
  }
  for ( const b of boxes.values() ) if ( b.max || asked.has(b.box) ) b.ask = true;
  return [...boxes.values()];
}

/** The shapes an attack.aoe value allows ("cone|line"). */
const aoeShapes = value => [...new Set(String(value ?? "").toLowerCase().split(/[|,/;]/).map(s => s.trim())
  .flatMap(s => ((s === "any") ? AOE_SHAPES : [s])).filter(s => AOE_SHAPES.includes(s)))];

/**
 * Pay the costs, roll the Strike and post the attack card.
 */
export async function executeAttack(actor, opts) {
  const sys = actor.system;
  const signature = opts.signatureId ? actor.items.get(opts.signatureId) : null;
  // The technique and what it works out to (effects may add Advantages or a Super Profile to it for this attack: F2 below)
  let sig = signature?.system ?? null;
  let comp = sig?.computed ?? null;
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
  const ignore = !!opts.ignoreLimits;
  const problems = [...(mp?.problems ?? []), ...(hyper?.problems ?? [])];
  const { triggerUsesLeft, useTriggerLimit, costPlan, payTriggerCost } = await import("./triggers.mjs");
  const optionNotes = [];
  // The boxes ticked in the dialog (an option's key, or "group:<slug>") and the n picked for the ones with an amount
  const chosen = new Set(opts.attackOptions ?? []);
  const amounts = opts.optionAmounts ?? {};
  const nOf = box => Math.max(1, Math.floor(Number(amounts[box]) || 1));
  // F1: what an effect's button says of this attack (one-shot option pieces, the attacks it may be, via, attr)
  const withSpec = parseAttackWith(opts.with);
  const oneShot = preset ? [] : withPieces(withSpec, L("DBU.Attack.WithLabel"));
  // How the attack is made (Exploit, Defend, Feint, or one of the actor's Maneuver items: "item:<id>", or a slug given by
  // an effect) and whether it is an Out-of-Sequence Maneuver
  const viaRaw = viaValue(actor, opts.via || withSpec.via);
  const viaItem = viaRaw.startsWith("item:") ? (actor.items.get(viaRaw.slice(5)) ?? null) : null;
  const via = VIA.includes(viaRaw) ? viaRaw : (viaItem ? maneuverSlug(viaItem.name) : "");
  const oos = !!opts.outOfSequence;
  // The targets' actors (@allyTargets, @vsMax.*...)
  const targetActors = (opts.targets ?? []).map(t => t.actor).filter(Boolean);
  const agg = preset ? null : aggregates(actor, targetActors);
  // The option pieces of the items (and the one-shot ones), the uses left, the ones the player must tick
  const baseOptionMods = preset ? [] : [...optionMods(actor), ...oneShot];
  // R: the Advantage picked for an "attack.advantagePick" piece: a one-shot attack.advantage.<key> piece (F2 below)
  const optionModifiers = [...baseOptionMods, ...advantagePickPieces(baseOptionMods, String(opts.advantagePick ?? "")),
    ...removePickPieces(baseOptionMods, [opts.removeOpt1, opts.removeOpt2], sig)];
  const usesLeft = o => !o.limit || triggerUsesLeft(actor, { limit: o.limit, ctx: o.ctx }, optKey(o));
  const askedGroups = askedBoxes(optionModifiers);
  const isAsked = o => (o.mode === "ask") || !!o.max || askedGroups.has(o.box);

  /* ----- F2: Advantages, Disadvantages and a Super Profile added by attack options ----- */
  // Worked out first (with the variables known before the Ki Wager, the Weapon... are applied), then the attack uses
  // the technique with them; a Basic Attack gets them through a stand-in technique of its Profile (adv below)
  const grant = preset ? null : grantedFor(actor, { sig, comp, profileKey, foundation, mods: optionModifiers, chosen, nOf, isAsked,
    usesLeft, noSuper: !!mp?.key, vars: attackVars({ sig, wager: Math.max(0, Number(opts.wager) || 0), dkpCost: !!opts.dkpCost,
      dkpWager: !!opts.dkpWager, kp: attackKp(actor, { sig, comp, prof, foundation, mp, weapon, divine: opts.divine ?? null,
        calledShot: !!opts.calledShot, rapid: !!opts.rapid }), favored: favoredElement(actor, fx), calledShot: !!opts.calledShot,
      oos, armed: !!weapon, via, oblivious: !!opts.oblivious, allyTargets: allyCount(actor, targetActors),
      integrated: !!weapon?.system?.integrated, tags: sigTags(sig), agg, weapon, sigName: signature?.name ?? "", viaFx: opts.viaFx }),
    charges: (sys.combat.energyCharges ?? 0) + (Number(opts.extraCharges) || 0) });
  if ( grant && !grant.basic ) ({ sig, comp } = grant);
  if ( grant?.refused?.length ) optionNotes.push(L("DBU.Attack.GrantRefused", { keys: grant.refused.join(", ") }));
  for ( const o of grant?.exhausted ?? [] ) optionNotes.push(L("DBU.Attack.OptionUsed", { label: o.label, limit: o.limit }));
  // The technique whose options apply to this attack (a Basic Attack's stand-in when effects add some), what they work out
  // to (adv: the Signature's computed data, or the stand-in's), its Super Profile and its Advantages / Disadvantages
  const eff = sig ?? (grant?.basic ? grant.sig : null);
  const adv = sig ? comp : (grant?.basic ? grant.comp : null);
  const superProfile = eff?.superProfile ?? "";
  // (T11 Giga Flare: up to 2 more Actions, each +2 Energy Charges and +2(T) KP; Super Combination: any number of Actions,
  // each +1 Energy Charge and a rank of Alotta Lotta Attacks and Peppering Blows, noted on the card)
  const superActsAsked = Math.max(0, Math.floor(Number(opts.superActions) || 0));
  const superActs = (superProfile === "gigaFlare") ? Math.min(2, superActsAsked) : ((superProfile === "superCombination") ? superActsAsked : 0);
  const superCharges = (superProfile === "gigaFlare") ? 2 * superActs : superActs;
  if ( superActs && (superProfile === "superCombination") ) optionNotes.push(L("DBU.T11.SuperCombo", { n: superActs }));
  // (T11 Genki: every Lifeforce stack is lost, +2(bT) Wound each)
  const genkiStacks = (superProfile === "genki") ? Math.max(0, Number(sys.rollData?.res?.lifeforce ?? 0) || 0) : 0;
  const genkiWound = 2 * (sys.top?.base ?? 1) * genkiStacks;
  // (T12 Charging Assault: +1 Wound per Square moved after the 3rd, at most 2(T) ("chargingAssault.capT": that many (T),
  // the highest wins); Splitting: -1(T) Wound per target after the first, 2 targets at rank 1, 4 at rank 2)
  const chargeHas = (eff?.advantages ?? []).some(a => a?.key === "chargingAssault");
  const chargeSquares = chargeHas ? Math.max(0, Math.floor(Number(opts.chargeSquares) || 0)) : 0;
  const chargeCapT = Math.max(2, Number(sys.buckets?.["chargingAssault.capT"]?.total ?? 0) || 0);
  const chargeWound = Math.min(chargeCapT * T, Math.max(0, chargeSquares - 3));
  const splitRank = Number((eff?.advantages ?? []).find(a => a?.key === "splitting")?.rank ?? 0) || 0;
  const splitTargets = splitRank ? Math.min(targetActors.length, (splitRank >= 2) ? 4 : 2) : 0;
  const splitWound = (splitTargets > 1) ? -T * (splitTargets - 1) : 0;
  const optionList = eff ? [...(eff.advantages ?? []), ...(eff.disadvantages ?? [])] : [];
  // (Efficiency / Inefficiency added to a Basic Attack: its Ki Point Cost units)
  const kpAdjust = grant?.basic ? (grant.comp.kpAdjust - grant.base.kpAdjust) : 0;

  // Foundation requirements (an attack option may waive them: attack.ignoreFoundationReq)
  const foundationReq = [];
  if ( (foundation === "energy") && (sys.attributes.fo.score < 3) && !sys.flags.energyWithoutFO ) foundationReq.push(L("DBU.Attack.ErrEnergyFO"));
  if ( (foundation === "magic") && (sys.attributes.ma.score < 3) && !sys.flags.magicWithoutMA ) foundationReq.push(L("DBU.Attack.ErrMagicMA"));
  problems.push(...foundationReq);
  if ( weapon && (weapon.system.weaponType !== foundation) ) problems.push(L("DBU.Attack.ErrWeaponFoundation"));
  // Weapon Assisted: the Advantage (also one an effect adds), or every Physical Signature with an effect that says so
  // (flag.weaponAssisted)
  const weaponAssisted = !!comp?.weaponAssisted || ((foundation === "physical") && flagOn(sys, "weaponAssisted"));
  if ( weapon && sig && !weaponAssisted ) problems.push(L("DBU.Attack.ErrWeaponAssisted"));
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
  // BB: a State that forbids it (Liquid, Spectator; Feral for a Signature Technique)
  {
    const { stateBlock } = await import("../rules/state-rules.mjs");
    const why = stateBlock(actor, "attack") || (sig ? stateBlock(actor, "signature") : "") || (weapon ? stateBlock(actor, "armed") : "")
      // (T25 "block.energyAttack" / "block.magicAttack")
      || ((foundation === "energy") ? stateBlock(actor, "energyAttack") : "") || ((foundation === "magic") ? stateBlock(actor, "magicAttack") : "")
      || (opts.signature?.flags?.["dbu-rpg"]?.oneUseSpent ? L("DBU.CS4.OneUseSpent", { name: opts.signature.name }) : "");
    if ( why ) problems.push(why);
    // Surging (3): the attack must include the Focus
    const focusOn = (actor.system?._effectiveStates?.surging ?? 0) > 0;
    if ( focusOn && (opts.targets ?? []).length ) {
      const { versusData } = await import("../rules/versus.mjs");
      if ( !(opts.targets ?? []).some(t => t.actor && versusData(actor, t.actor).mark?.focus) ) optionNotes.push(L("DBU.StateRule.SurgingFocus"));
    }
  }
  // U: Compelled: the attack must include the Compelled target (a note on the card when it does not)
  {
    const { compelledTarget, isCharacter } = await import("../rules/versus.mjs");
    const ct = compelledTarget(actor);
    if ( ct && (opts.targets ?? []).length && !(opts.targets ?? []).some(t => isCharacter(ct.uuid, t.actor) || isCharacter(t.actor?.uuid, ct)) ) {
      optionNotes.push(L("DBU.Attack.CompelledMiss", { name: ct.name }));
    }
  }
  // A Plump or Frail Fusion cannot use Signature Techniques
  if ( sig && (actor.type === "fusion") && (sys.fusion.dance !== "success") ) problems.push(L(`DBU.Fusion.Dance.${sys.fusion.dance}`));

  /* ----- Ki Point Cost ----- */
  const weaponCat = weapon ? DBU.weaponCategories[weapon.system.category] : null;
  const R = rules();
  const ballistic = R.ballistics && weapon?.system.ballistic;
  const divine = opts.divine ?? null;
  const kpArgs = { sig, comp, prof, foundation, mp, weapon, divine, calledShot: !!opts.calledShot, rapid: !!opts.rapid, adjust: kpAdjust };
  // The Ki Point Cost before the attack options (@kp)
  const kpBefore = attackKp(actor, kpArgs);

  /* ----- Divine Ki Points (God Ki State) ----- */
  // The Ki Point Cost and the Ki Wager are two payments, each from a single pool; DKP use 1/2 (rounded up) of the
  // Capacity Rate
  const divineOk = !!sys.dkp?.usable;
  const costDkp = divineOk && (!!opts.dkpCost || !!divine?.forceDkp);
  const wagerDkp = divineOk && !!opts.dkpWager && (superProfile !== "allOut");
  const capacityOf = (n, fromDkp) => (fromDkp ? Math.ceil(n / 2) : n);
  // (T25 "flag.costNoCapacity": the Ki Point Cost lowers no Capacity, Unleash it All 4)
  const costCapacity = n => (flagOn(sys, "costNoCapacity") ? 0 : capacityOf(n, costDkp));

  /* ----- Ki Wager (its limits) ----- */
  // Without Capacity (Adversaries): no Capacity spent nor checked, and the Ki Wager stays within the Max Capacity
  const noCapacity = ignoresCapacity(actor);
  const wired = weapon?.system.qualities?.some(q => /wired/i.test(q.name));
  // Desperation Rules: Life Points may join the Ki Wager (up to 1/2 of the Capacity)
  const lifeWager = (R.desperation && !sys.optional.desperationUsed) ? Math.max(0, Number(opts.lifeWager) || 0) : 0;
  // FC: Final Chance (the attack has the Advantage, below the Injured Health Threshold): your Life Points go to 0 at Attack
  // Declaration and join the Ki Wager; you are Defeated only once this attack is over (finalChanceOver)
  const finalChance = (opts.finalChance && !preset && optionList.some(o => o?.key === "finalChance")
    && ((sys.rollData?.below ?? 0) >= 2)) ? Math.max(0, sys.life.value) : 0;
  // The Ki Wager limit set by effects (wager.maxSet: the lowest wins)
  const wagerMaxSet = preset ? null : lowestSet(actor, "wager.maxSet");
  // The Ki Wager and its maximum for a Ki Point Cost (All Out and All or Nothing depend on it)
  // MW "attack.wagerMax": the Ki Wager limit of this attack (an option or a `with` piece; the lowest wins)
  let wagerMaxOpt = null;
  const wagerFor = cost => {
    let w = preset ? (preset.wager ?? 0) : Math.max(0, Number(opts.wager) || 0);
    const capacityLeft = noCapacity ? sys.capacity.max : sys.capacity.value - costCapacity(cost);
    // How much can still be wagered with the Capacity left (DKP only use half of it)
    const wagerRoom = Math.max(0, wagerDkp ? 2 * capacityLeft : capacityLeft);
    let limit = noCapacity ? sys.capacity.max : Math.floor(sys.capacity.max / 2);
    // Full Wager: the Advantage, free with a Profile (Elemental (Light)) or for every attack (flag.fullWager)
    if ( adv?.fullWager || fx.freeAdvantages.includes("fullWager") || flagOn(sys, "fullWager") ) limit = wagerRoom;
    if ( ballistic ) limit = wired ? Math.floor(sys.capacity.max / 4) : 0;
    if ( wagerMaxSet !== null ) limit = Math.max(0, Math.min(limit, wagerMaxSet));
    if ( wagerMaxOpt !== null ) limit = Math.max(0, Math.min(limit, wagerMaxOpt));
    // All Out: every Ki Point is wagered, up to the Max Capacity (the Ki Wager limit does not apply to it)
    if ( superProfile === "allOut" ) {
      w = Math.min(sys.ki.value - (costDkp ? 0 : cost), sys.capacity.max);
      limit = Math.max(limit, w);
    }
    if ( adv?.allOrNothing ) w = Math.max(0, Math.min(limit, wagerRoom));
    return { wager: w, wagerLimit: limit };
  };

  /* ----- Attack options ----- */
  // Attack options of the items (+Energy Charges, Strike, Wound, Ki Point Cost, Damage Category, Critical Target...):
  // the automatic ones, and the chosen ones still available (1/Round...). Their conditions see the attack's variables
  const extraProfiles = [mp?.key, hyper?.extraKey].filter(Boolean);
  // (@opt_<key> / @superProfile_<key> see what effects added: eff; @weapon_<slug>, @sig_<slug>, @viaFx.<ref>: F3)
  const baseVars = { sig: eff, wager: wagerFor(kpBefore).wager + lifeWager + finalChance, dkpCost: costDkp, dkpWager: wagerDkp, kp: kpBefore,
    favored: favoredElement(actor, fx), calledShot: !!opts.calledShot, oos, armed: !!weapon, via,
    oblivious: !!opts.oblivious, allyTargets: allyCount(actor, targetActors), integrated: !!weapon?.system?.integrated,
    tags: sigTags(sig), agg, weapon, sigName: signature?.name ?? "", viaFx: opts.viaFx,
    techUse: techUseVars(actor, signature?.id ?? null, extraProfiles.length ? [profileKey, ...extraProfiles] : [profileKey]) };
  const scopeOf = damage => preAttackScope({ sig, comp, profileKey, foundation, extraProfiles,
    charges: (sys.combat.energyCharges ?? 0) + (Number(opts.extraCharges) || 0), vars: attackVars({ ...baseVars, damage }) });
  // The Damage Attribute of the Wound Roll: FO (MA for Magic Attacks), or one an attack option allows (the dialog's pick,
  // or the one the effect's attack gives: F1 attr)
  const defaultDamage = defaultDamageAttribute(foundation);
  let damage = { key: defaultDamage, value: damageAttributeValue(actor, defaultDamage) };
  let damageOption = null;
  const wantedDamage = preset ? "" : String(opts.damageAttribute || damageAttributeKeys(withSpec.attr)[0] || "");
  if ( wantedDamage && (wantedDamage !== defaultDamage) ) {
    damageOption = attackOptionsFor(actor, scopeOf(damage), optionModifiers, { nOf }).find(o => (o.target === DAMAGE_ATTRIBUTE)
      && damageAttributeKeys(o.value).includes(wantedDamage) && usesLeft(o)) ?? null;
    if ( damageOption ) damage = { key: wantedDamage, value: damageAttributeValue(actor, wantedDamage) };
    else optionNotes.push(L("DBU.Attack.DamageAttributeRefused", { attr: damageAttributeLabel(wantedDamage) }));
  }
  const vars = attackVars({ ...baseVars, damage });
  const applying = preset ? [] : attackOptionsFor(actor, scopeOf(damage), optionModifiers, { nOf }).filter(o => o.target !== DAMAGE_ATTRIBUTE);
  // A chosen option whose condition no longer holds (the Ki Wager, the Weapon... picked after its box was drawn)
  for ( const key of chosen ) {
    if ( !applying.some(o => o.box === key) && !grant?.pieces.some(o => o.box === key) ) {
      optionNotes.push(L("DBU.Attack.OptionNotMet", { label: String(key).split("|")[1] ?? key }));
    }
  }
  // The AoE shape option (attack.aoe) only for an attack without an AoE: the shape picked in the dialog
  const ownAoe = hyper?.aoe || (adv ? adv.aoe : prof.aoe) || (mp?.key ? DBU.profiles[mp.key].aoe : "") || "";
  const wantShape = String(opts.aoeShape ?? "").toLowerCase();
  const aoeOption = ownAoe ? null : (applying.filter(o => (o.target === "attack.aoe") && usesLeft(o))
    .find(o => (wantShape ? aoeShapes(o.value).includes(wantShape) : ((o.mode !== "ask") && aoeShapes(o.value).length))) ?? null);
  const aoeShape = aoeOption ? (wantShape || aoeShapes(aoeOption.value)[0]) : "";
  // (the Advantages / Super Profile pieces: the ones F2 applied above, so that their uses and costs are those)
  const attackOpts = [...applying
    .filter(o => (o.target !== "attack.aoe") && !isPick(o.target) && !isGrant(o) && !REMOVE_TARGET_SET.has(o.target))
    .filter(o => !isAsked(o) || chosen.has(o.box))
    .filter(o => {
      if ( usesLeft(o) ) return true;
      optionNotes.push(L("DBU.Attack.OptionUsed", { label: o.label, limit: o.limit }));
      return false;
    }), ...(grant?.pieces ?? [])];
  const optSum = target => attackOpts.filter(o => o.target === target).reduce((t, o) => t + o.value, 0);
  const optAny = target => attackOpts.some(o => o.target === target);
  // EN "attack.capacityFull": the Capacity is reset to its maximum before this attack (the Entrusted State's 4th effect)
  if ( optAny("attack.capacityFull") && !preset && ((sys.capacity?.value ?? 0) < (sys.capacity?.max ?? 0)) ) {
    await actor.update({ "system.capacity.value": sys.capacity.max });
    // (the actor data read below was taken before this update)
    if ( sys.capacity ) sys.capacity.value = sys.capacity.max;
    optionNotes.push(L("DBU.Attack.CapacityFull", { n: sys.capacity.max }));
  }
  // F1 "only": what the effect's attack must be (refused otherwise)
  if ( withSpec.only.length && !preset ) {
    const facts = { foundation, armed: !!weapon, signature: !!signature, basic: !signature || sigTags(sig).includes("fullPower"),
      ultimate: !!comp?.ultimate, aoe: !!(ownAoe || aoeShape), tags: sigTags(sig), profiles: fx.keys };
    if ( !onlyPass(withSpec.only, facts) ) {
      problems.push(L("DBU.Attack.WithRefused", { only: withSpec.only.map(g => g.join(" | ")).join(" · ") }));
    }
  }
  // Punching Down / Punching Up (the Size rules): the attacker's side, with its attack.punchDown.* / attack.punchUp.*
  // options; each target's side is worked out against it (rules/versus.mjs punchOf)
  const punch = { ...punchSizes(actor, attackOpts), T };
  const punchTargets = duel ? [] : targetActors;

  // attack.calledShot: the attack becomes a Called Shot (its Ki Point Cost too) without its extra Action
  const calledShotOpt = optAny("attack.calledShot");
  const calledShot = !!opts.calledShot || calledShotOpt;
  // The Ki Point Cost with the attack options; an option may make the attack free (attack.kpFree), or its Profile /
  // Signature cost (attack.kpBaseFree: the attack.kp options, Called Shot and Rapid are still paid)
  let kp = attackKp(actor, { ...kpArgs, calledShot, baseFree: optAny("attack.kpBaseFree"), extra: optSum("attack.kp") });
  if ( optAny("attack.kpFree") ) kp = 0;
  if ( superActs && (superProfile === "gigaFlare") ) kp += 2 * T * superActs;
  // The costs of the options used (cost), summed: they block the attack when they cannot be paid
  const paidOpts = [...attackOpts, ...(damageOption ? [damageOption] : []), ...(aoeOption ? [aoeOption] : [])].filter(o => !blank(o.cost));
  const optPlan = paidOpts.length ? costPlan(actor, paidOpts.map(o => ({ cost: o.cost,
    data: { ...(sys.rollData ?? {}), ...(o.ctx ?? {}), ...scopeOf(damage), n: o.n ?? 1 } }))) : null;
  if ( optPlan?.problems.length ) problems.push(L("DBU.Attack.OptionCantPay", { why: optPlan.problems.join(" ") }));
  // CC "checkCost": a cost the options' effects pay later (once the attack is over): only checked now, summed with the others
  {
    const checkOpts = attackOpts.filter(o => !blank(o.checkCost));
    if ( checkOpts.length && !optPlan?.problems.length ) {
      const all = [...paidOpts.map(o => ({ cost: o.cost, data: { ...(sys.rollData ?? {}), ...(o.ctx ?? {}), ...scopeOf(damage), n: o.n ?? 1 } })),
        ...checkOpts.map(o => ({ cost: o.checkCost, data: { ...(sys.rollData ?? {}), ...(o.ctx ?? {}), ...scopeOf(damage), n: o.n ?? 1 } }))];
      const check = costPlan(actor, all);
      if ( check.problems.length ) problems.push(L("DBU.Attack.OptionCantPay", { why: check.problems.join(" ") }));
    }
  }
  const optKi = (optPlan?.need?.kiPool === "ki") ? (optPlan.need.kiPaid ?? 0) : 0;
  // (Divine Ki Points: a "dkp" cost, and the KP of a cost paid from them in the God Ki State when preferred)
  const optDkp = (optPlan?.need?.dkp ?? 0) + ((optPlan?.need?.kiPool === "dkp") ? (optPlan.need.kiPaid ?? 0) : 0);
  const optCapacity = optPlan?.need?.capacityTotal ?? 0;
  let ammoCost = 0;
  if ( ballistic ) {
    ammoCost = Math.max(1, Math.ceil(prof.kp / 2));
    if ( (weapon.system.ammo.value ?? 0) < ammoCost ) problems.push(L("DBU.Attack.ErrAmmo", { need: ammoCost, have: weapon.system.ammo.value }));
  }
  if ( divine?.forceDkp && !divineOk ) problems.push(L("DBU.Dkp.ErrState"));

  /* ----- Ki Wager ----- */
  if ( lifeWager > Math.floor(sys.capacity.value / 2) ) problems.push(L("DBU.Attack.ErrLifeWager", { max: Math.floor(sys.capacity.value / 2) }));
  if ( lifeWager >= sys.life.value ) problems.push(L("DBU.Attack.ErrLifeWagerLP"));
  {
    const wm = attackOpts.filter(o => o.target === "attack.wagerMax").map(o => Number(o.value)).filter(Number.isFinite);
    if ( wm.length ) wagerMaxOpt = Math.max(0, Math.min(...wm));
  }
  const { wager, wagerLimit } = wagerFor(kp);
  if ( wager > wagerLimit ) problems.push(L("DBU.Attack.ErrWagerMax", { max: wagerLimit }));
  const kiPaid = (costDkp ? 0 : kp) + (wagerDkp ? 0 : wager);
  const dkpPaid = (costDkp ? kp : 0) + (wagerDkp ? wager : 0);
  const capacityUsed = costCapacity(kp) + capacityOf(wager, wagerDkp);
  // Narrative Stamina (Elite and Villain Adversaries) is spent in the place of Ki Points
  const stamina = staminaPayment(actor, kiPaid, opts.staminaPay !== false);
  if ( stamina.fromKi + optKi > sys.ki.value ) problems.push(L("DBU.Attack.ErrKi", { need: stamina.fromKi + optKi, have: sys.ki.value }));
  if ( dkpPaid + optDkp > (sys.dkp?.value ?? 0) ) problems.push(L("DBU.Dkp.ErrNotEnough", { need: dkpPaid + optDkp, have: sys.dkp?.value ?? 0 }));
  if ( (superProfile !== "allOut") && !noCapacity && (capacityUsed + optCapacity > sys.capacity.value) ) {
    problems.push(L("DBU.Attack.ErrCapacity", { need: capacityUsed + optCapacity, have: sys.capacity.value }));
  }

  /* ----- Villainous: Get Up! and the 1-on-1 Duel ----- */
  const V = await import("./villainous.mjs");
  const getUp = preset ? null : V.getUpProblem(actor, targetActors);
  if ( getUp ) problems.push(getUp);

  /* ----- Actions ----- */
  // Made through Exploit or Defend: a Counter Action instead of the Action (none with attack.freeCounter). A Called
  // Shot's extra Action is still an Action (none when an attack option makes the attack one: attack.calledShot)
  const counterVia = ["exploit", "defend"].includes(via) && !!opts.spendAction;
  const counterCost = (counterVia && !optAny("attack.freeCounter")) ? 1 : 0;
  const actionCost = ((opts.spendAction && !counterVia) ? 1 : 0) + ((opts.calledShot && !calledShotOpt) ? 1 : 0) + superActs;
  if ( opts.spendAction && (sys.combat.actions < actionCost) && inEncounter(actor) ) {
    problems.push(L("DBU.Attack.ErrActions", { need: actionCost, have: sys.combat.actions }));
  }
  if ( counterCost && ((sys.combat.counters ?? 0) < counterCost) && inEncounter(actor) ) problems.push(L("DBU.Attack.ErrCounter"));
  // (F13 "flag.noCounterManeuver": no Counter Maneuver now: Inherited Freedom)
  if ( counterCost && ((sys.buckets?.["flag.noCounterManeuver"]?.total ?? 0) > 0) ) problems.push(L("DBU.F13.NoCounterManeuver", { name: actor.name }));
  // The options' Actions / Counter Actions come on top of the attack's own (costPlan checked each alone)
  const optActions = optPlan?.need?.actions ?? 0;
  const optCounters = optPlan?.need?.counters ?? 0;
  const ownActions = (opts.spendAction && inEncounter(actor)) ? actionCost : 0;
  if ( optActions && ownActions && (ownActions + optActions > (sys.combat.actions ?? 0)) ) {
    problems.push(L("DBU.Attack.ErrActions", { need: ownActions + optActions, have: sys.combat.actions }));
  }
  if ( optCounters && counterCost && inEncounter(actor) && (counterCost + optCounters > (sys.combat.counters ?? 0)) ) {
    problems.push(L("DBU.Attack.ErrCounter"));
  }
  // attack.ignoreFoundationReq: no FO / MA Score requirement
  if ( foundationReq.length && optAny("attack.ignoreFoundationReq") ) {
    for ( const p of foundationReq ) { const i = problems.indexOf(p); if ( i >= 0 ) problems.splice(i, 1); }
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
  if ( adv?.transformationBoost && sys.transformation.forms.length ) charges += 1;
  charges += optSum("attack.charges");
  // Mega Flare applied through an effect raises a Signature's maximum too
  let maxCharges = sig ? Math.max(comp.maxCharges, fx.maxCharges + (comp.ultimate ? 1 : 0)) : fx.maxCharges;
  if ( ballistic ) maxCharges = Math.ceil(sys.attributes.sc.mod / 4);
  // Effects that raise the maximum Energy Charges of every attack (charges.max)
  maxCharges += sys.buckets?.["charges.max"]?.total ?? 0;
  if ( limitedPower(sys) ) maxCharges = Math.min(maxCharges, 3);
  // attack.overCharges: Energy Charges beyond the maximum
  charges = Math.min(charges, maxCharges) + optSum("attack.overCharges") + superCharges;
  const bonusCharges = fx.bonusCharges; // Beam: does not count toward the maximum
  if ( preset ) charges = Math.max(0, (preset.charges ?? 0) - bonusCharges);
  const totalCharges = charges + bonusCharges;
  // (a Signature adds its own Category; a Basic Attack only what Maximum Charge or a Super Profile an effect added gives)
  const chargeCategory = sys.chargeCategory + (sig ? comp.chargeCategory : (adv ? adv.chargeCategory - 1 : 0)) + optSum("attack.chargeCategory");

  /* ----- Damage Category ----- */
  // Multi-Profile: the highest Damage Category of the two Profiles
  let category = fx.cat;
  if ( calledShot ) category += 1;
  if ( fx.has("megaFlare") && (charges >= 7) ) category += 1;
  // Glass: +1 Damage Category for every 2 Energy Charges (max. +2)
  if ( fx.glass ) category += Math.min(2, Math.floor((charges + bonusCharges) / 2));
  // Divine Attack: +1 Damage Category
  if ( divine?.category ) category += divine.category;
  category += optSum("attack.category");
  // Lethal Damage (attack.lethal): Damage Category 3, which cannot be reduced
  const lethal = optAny("attack.lethal");
  if ( lethal ) category = Math.max(category, 3);
  // Ignore the target's Damage Reduction (attack.ignoreDR: 1 all of it, 0.5 half); the options do not add up
  const ignoreDR = Math.min(1, Math.max(0, ...attackOpts.filter(o => o.target === "attack.ignoreDR").map(o => o.value)));

  /* ----- Pay ----- */
  // Life Point Cost to attack (Kaioken, Super Kaioken...)
  const lifeCost = preset ? 0 : Math.max(0, sys.buckets?.attackLifeCost?.total ?? 0);
  let optionPaid = "";
  // A Duel's Initiating Attack was paid when the Duel began (a Maneuver's attack, by the Maneuver)
  if ( !preset ) {
  const update = {
    "system.ki.value": Math.max(0, sys.ki.value - stamina.fromKi),
    "system.combat.attacksThisRound": (sys.combat.attacksThisRound ?? 0) + 1,
    "system.combat.energyCharges": 0
  };
  if ( stamina.fromStamina ) update["system.adversary.stamina"] = sys.adversary.stamina - stamina.fromStamina;
  if ( dkpPaid ) update["system.dkp.value"] = Math.max(0, sys.dkp.value - dkpPaid);
  if ( !noCapacity && (superProfile !== "allOut") ) update["system.capacity.value"] = Math.max(0, sys.capacity.value - capacityUsed);
  if ( !noCapacity && ((superProfile === "allOut") || adv?.allOrNothing) ) update["system.capacity.value"] = 0;
  if ( inEncounter(actor) && opts.spendAction && actionCost ) update["system.combat.actions"] = Math.max(0, sys.combat.actions - actionCost);
  if ( inEncounter(actor) && counterCost ) update["system.combat.counters"] = Math.max(0, (sys.combat.counters ?? 0) - counterCost);
  if ( pending && sys.conditions.guardDown ) update["system.conditions.guardDown"] = 0;
  if ( sig && comp.ultimate ) update["system.combat.ultimatesUsed"] = (sys.combat.ultimatesUsed ?? 0) + 1;
  if ( lifeWager > 0 || lifeCost > 0 || finalChance > 0 ) {
    update["system.life.value"] = (finalChance > 0) ? 0 : sys.life.value - lifeWager - lifeCost;
    if ( lifeWager > 0 ) update["system.optional.desperationUsed"] = true;
  }
  // (FC: the Health Thresholds of a Final Chance wait until the attack is over: flags.dbu-rpg.finalChance)
  // (T29 "flag.attackLifeNoMomentum": paying only the attack's Life Point Cost gives no Reduced Momentum: Kaioken)
  const lifeCostOnly = (lifeCost > 0) && !(lifeWager > 0) && !(finalChance > 0) && flagOn(sys, "attackLifeNoMomentum");
  await actor.update(update, { dbuSource: "attack", ...((lifeWager > 0 || lifeCost > 0 || finalChance > 0) ? { dbuSelfInflicted: true } : {}),
    ...(lifeCostOnly ? { dbuNoMomentum: true } : {}),
    ...((finalChance > 0) ? { dbuFinalChance: true } : {}) });
  if ( genkiStacks ) await (await import("./triggers.mjs")).applyTriggerEffect(actor, "resourceSet", 0, "Lifeforce", { label: "Genki" });
  // The options' costs, once the attack passed every check and paid its own
  if ( optPlan && !optPlan.empty && !optPlan.problems.length ) optionPaid = await payTriggerCost(actor, optPlan);
  if ( ballistic ) await weapon.update({ "system.ammo.value": Math.max(0, weapon.system.ammo.value - ammoCost) });
  if ( pending && sys.conditions.guardDown ) await actor.toggleStatusEffect("guardDown", { active: false }).catch(() => null);
  if ( sig && comp.ultimate ) await signature.update({ "system.usedThisEncounter": true });
  // RA: this technique's and its Profiles' uses this encounter / Round
  await recordTechUse(actor, signature?.id ?? null, [profileKey, ...extraProfiles]);
  }
  // Multi-Profile from an effect: one more use this Round/Encounter, and its resource (Sunlight) spent
  const multiNotes = (mp?.key && !preset) ? [mp.note, ...(await spendMultiProfile(actor, mp))] : [];
  // Someone else targeting the two of a 1-on-1 Duel ends it
  if ( !preset ) await V.oneOnOneTargeted(actor, targetActors);
  // Absolute Attack (Wild Swings, Intense Blast): a missed target still takes 1/2 of the Wound against Soak and DR.
  // No more than 2 Absolute Attacks in a Combat Round
  const intense = optionList.some(a => (a.key === "intenseBlast") && (a.rank ?? 1) > 0);
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
  // attack.state: a State entered before the Strike is worked out (left when every target of the card is resolved, or
  // at the end of the turn, if its Level did not change meanwhile)
  const enteredStates = preset ? [] : await enterAttackStates(actor, attackOpts.filter(o => o.target === "attack.state"));

  /* ----- Strike Roll ----- */
  const fresh = actor.system; // re-prepared after the update (Diminishing Offense applied)
  const strikeData = fresh.rolls.strike;
  const parts = [...strikeData.parts];
  const add = (label, value) => { if ( value ) parts.push({ label, value }); };
  add(L(DBU.foundations[foundation]), fresh.rolls[`strike_${foundation}`] ?? 0);
  if ( fx.has("crushing") ) add("Crushing (½ Haste)", -Math.ceil(fresh.aptitudes.haste / 2));
  // The technique's Advantages (a Basic Attack: only what effects added to it) and the Signature bucket
  if ( adv ) {
    add(L("DBU.Sig.Accurate"), adv.strikeT * T);
    if ( sig ) add(signature.name, fresh.buckets["strike.signature"]?.total ?? 0);
    if ( opts.longRange ) add("Long Shot", adv.longShotT * T);
    if ( adv.lastLegs ) {
      add("Last Legs", fresh.health.count * T);
      add(L("DBU.ThresholdPenalty"), fresh.health.combatPenalty);
    }
    if ( superProfile === "combo" ) add("Combo Attack", 2 * T);
    if ( adv.shortRange === 1 && opts.longRange ) add("Short Range", -2 * bT);
  }
  if ( weapon ) {
    add(L("DBU.WeaponSize.label"), (DBU.weaponSizes[weapon.system.size]?.strike ?? 0) * T);
    add(L("DBU.Attack.Armed"), fresh.buckets["strike.armed"]?.total ?? 0);
    if ( calledShot && weaponCat?.calledStrike ) add(weaponCat.label, weaponCat.calledStrike * T);
  }
  else add(L("DBU.Attack.Unarmed"), fresh.buckets["strike.unarmed"]?.total ?? 0);
  if ( favoredElement(actor, fx) ) add(L("DBU.Attack.Favored"), 1 * T);
  // Elemental (Light) with the Elemental (Dark) Profile applied to it (Multi-Profile)
  if ( fx.has("elementalLight") && fx.has("elementalDark") ) add("Elemental (Light + Dark)", 1 * T);
  // (Punching Up against every target: a Called Shot without its penalty)
  const punchUpAll = !!punchTargets.length && punchTargets.every(t => punchOf(punch, t).up > 0);
  if ( calledShot && !optAny("attack.noCalledShotPenalty") && !punchUpAll ) add("Called Shot", -2 * T);
  if ( opts.longRange && !(adv?.shortRange === 1) && !flagOn(sys, "noLongRangePenalty") ) add("Long Range", -2 * bT);
  if ( opts.oblivious ) add("Hidden", 2 * bT);
  if ( opts.rapid ) add("Rapid Movement", 1 * T);
  add(L("DBU.Attack.Situational"), Number(opts.strikeBonus) || 0);
  for ( const o of attackOpts.filter(x => x.target === "attack.strike") ) add(o.own || o.label, o.value);

  const targets = duel
    ? (duel.targets ?? []).map(t => ({ ...t, result: "hit", defense: { mode: "Duel" }, damage: null, dimApplied: true }))
    : (opts.targets ?? []).map(t => ({
      tokenUuid: t.document?.uuid ?? null, actorUuid: t.actor?.uuid ?? null, name: t.name, img: t.document?.texture?.src ?? t.actor?.img,
      result: null, defense: null, damage: null, dimApplied: false
    }));
  // attack.dimOnDeclare: the Diminishing Defense this attack inflicts is applied now (before the defense rolls)
  const dimMult = Math.max(0, ...attackOpts.filter(o => o.target === "attack.dimDefense.mult").map(o => o.value));
  if ( !preset && optAny("attack.dimOnDeclare") ) {
    for ( const [i, t] of targets.entries() ) {
      const ta = opts.targets?.[i]?.actor ?? null;
      if ( !ta ) continue;
      const { stacks, update: dimUpdate } = dimDefenseGain(ta, actor, ta.system.dimDefensePerAttack ?? 1, dimMult || 1);
      if ( Object.keys(dimUpdate).length ) await safeUpdate(ta, dimUpdate);
      t.dimApplied = true;
      t.dimDeclared = stacks;
    }
  }

  // Age: Mini stacks may make the attack miss automatically
  const notesExtra = [...multiNotes, ...optionNotes];
  // The uses of the limited options (a shared limitKey counts once)
  const counted = new Set();
  const countLimit = async o => {
    const k = optKey(o);
    if ( !o.limit || counted.has(k) ) return;
    counted.add(k);
    await useTriggerLimit(actor, { limit: o.limit, ctx: o.ctx }, k);
  };
  for ( const o of attackOpts ) {
    notesExtra.push(optionText(o));
    await countLimit(o);
  }
  if ( damageOption ) {
    notesExtra.push(L("DBU.Attack.DamageAttributeUsed", { label: damageOption.own || damageOption.label, attr: damageAttributeLabel(damage.key) }));
    await countLimit(damageOption);
  }
  if ( aoeOption ) {
    notesExtra.push(L("DBU.Attack.AoeGiven", { label: aoeOption.own || aoeOption.label, shape: L(`DBU.Attack.AoeShapes.${aoeShape}`) }));
    await countLimit(aoeOption);
  }
  if ( optionPaid ) notesExtra.push(L("DBU.Trigger.Paid", { cost: optionPaid }));
  if ( grant?.added?.length ) notesExtra.push(L("DBU.Attack.Granted", { list: grant.added.join(", ") }));
  if ( via ) notesExtra.push(L("DBU.Attack.ViaNote", { via: viaItem ? viaItem.name : L(`DBU.Attack.ViaOpt.${via}`) }));
  if ( counterCost && inEncounter(actor) ) notesExtra.push(L("DBU.Attack.CounterSpent"));
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
  let aoe = adv ? adv.aoe : prof.aoe;
  // A Profile applied through an effect brings its AoE when the attack has none
  if ( !aoe && mp?.key ) aoe = DBU.profiles[mp.key].aoe ?? aoe;
  // Hyper Elemental: a Line or Cone AoE, 1 Magnitude larger for every 2 Energy Charges
  if ( hyper?.aoe ) {
    aoe = hyper.aoe;
    const more = Math.floor(totalCharges / 2);
    if ( more ) notesExtra.push(L("DBU.MultiProfile.HyperMagnitude", { n: more }));
  }
  // attack.aoe: an attack without an AoE gets the shape picked, at Standard Magnitude
  if ( !aoe && aoeShape ) aoe = aoeShape;
  // @magnitude: 0 without an AoE, 1 Standard ... 4 Destructive (attack.magnitude: +n, at most 4)
  let magnitude = 0;
  if ( aoe ) {
    magnitude = Math.min(4, aoeMagnitude(aoe, k => optionList.find(o => o.key === k)?.rank ?? 0) + optSum("attack.magnitude"));
    const out = outOfAoeHeight(actor, opts.targets ?? [], magnitude);
    if ( out.length ) notesExtra.push(L("DBU.Altitude.AoeOut", { names: out.map(t => t.name).join(", "), mag: L(`DBU.Altitude.Mag.${magnitude}`) }));
  }

  const attack = {
    attackerUuid: actor.uuid,
    name: preset?.name ?? signature?.name ?? (divine ? `${divine.name}: ${prof.label}` : `${L("DBU.Attack.Basic")}: ${prof.label}`),
    signatureId: signature?.id ?? null, profile: profileKey, profiles: fx.keys, foundation, weaponId: weapon?.id ?? null,
    // A Maneuver's attack shows what it really cost (Planet Burst: the Narrative Stamina)
    kp: forced?.kp ?? kp, wager: wager + lifeWager + finalChance + Math.max(0, optSum("attack.wagerFree")), charges: totalCharges, chargeCategory, category, ballistic: !!ballistic,
    dkp: { cost: costDkp, wager: wagerDkp, paid: dkpPaid },
    caliber: ballistic ? (weapon.system.caliber ?? 0) : 0,
    calledShot, injuryType: calledShot ? (opts.injuryType || "") : "",
    longRange: !!opts.longRange, oblivious: !!opts.oblivious,
    woundBonus: Number(opts.woundBonus) || 0, ultimate: !!comp?.ultimate,
    optionWound: attackOpts.filter(o => o.target === "attack.wound").map(o => ({ label: o.own || o.label, value: o.value })),
    // (what the technique's Advantages do for the Wound Roll and the Damage; a Basic Attack has it only when effects added
    // some: attack.signatureId tells a Signature)
    sig: adv ? { woundT: adv.woundT, longShotT: adv.longShotT, lastLegs: adv.lastLegs, lowPowerCrush: adv.lowPowerCrush,
      armorPiercing: adv.armorPiercing, shatteringBlow: adv.shatteringBlow, penetration: adv.penetration,
      sustained: adv.sustained, backlash: adv.backlash, twinLinked: adv.twinLinked, deadLink: adv.deadLink,
      shortRange: adv.shortRange, powerBurst: adv.powerBurst, superProfile, condition: adv.condition ?? "", conditionT: T } : null,
    autoHit: fresh.flags.autoHit,
    knockback: knockbackOf(actor, { comp: adv, sig: eff, fx, aoe }),
    notes: notesExtra,
    // The attacker's base ToP (a Ki Wager of 10(bT)+ can be answered with a Duel Maneuver); the winner's attack of a Duel
    bT, fromDuel: !!duel, fromToken: actorTokens(actor)[0]?.document?.uuid ?? null, ...(genkiWound ? { genkiWound } : {}),
    ...(chargeWound ? { chargeWound } : {}), ...(splitWound ? { splitWound } : {}),
    // What the Duel Escape Maneuver gives back; Power Shot stacks of a Maneuver's attack; answered only with a Duel
    actionCost: (opts.spendAction && inEncounter(actor)) ? actionCost : 0, powerShot: forced?.powerShot ?? 0,
    extraWoundT: duel?.extraWoundT ?? (2 * (forced?.powerShot ?? 0)), duelOnly: !!forced?.duelOnly, noStrike: !!preset, absolute,
    // How it was made; the Damage Attribute of its Wound Roll ("" = FO, MA for Magic); the attack options for the Wound
    // Roll (Critical Target, Natural Result) and the Damage (Lethal, Damage Reduction ignored)
    via, oos, damageAttribute: (damage.key !== defaultDamage) ? damage.key : "",
    woundCrit: optSum("attack.crit.wound"), woundNatural: optSum("attack.natural.wound"), lethal, ignoreDR,
    // The attack's variables for the triggers (@kp, @dmgAttr, @favored, @via_exploit...: attackScope)
    vars,
    targets, wound: null
  };
  // The attack's variables known now: @aoe (the attack stores whether it has an AoE), @magnitude, @kpFinal, @calledShot,
  // @chose.<group> (the n of each option group used), @spent.<x> (what its options cost)
  vars.aoe = aoe ? 1 : 0;
  vars.magnitude = magnitude;
  vars.kpFinal = kp;
  vars.calledShot = calledShot ? 1 : 0;
  vars.chose = choseOf(attackOpts);
  // (L: the Damage Attribute and the AoE picked through an option count for @chose.<its group> too)
  for ( const o of [damageOption, aoeOption] ) if ( o && !blank(o.group) ) vars.chose[String(o.group).trim()] = 1;
  vars.spent = (optionPaid && optPlan) ? spentVars(optPlan) : {};
  // What the option pieces changed, kept for the Wound Roll and the Damage (absent when nothing did)
  const ext = {};
  if ( aoeShape && (aoe === aoeShape) ) ext.aoe = aoeShape;
  if ( optSum("attack.greaterDice") ) ext.greaterDice = optSum("attack.greaterDice");
  const ignoreSoak = Math.min(1, Math.max(0, ...attackOpts.filter(o => o.target === "attack.ignoreSoak").map(o => o.value)));
  if ( ignoreSoak > 0 ) ext.ignoreSoak = ignoreSoak;
  const critSetWound = attackOpts.filter(o => o.target === "attack.critSet.wound").map(o => o.value);
  if ( critSetWound.length ) ext.critSetWound = Math.min(...critSetWound);
  if ( dimMult > 0 ) ext.dimMult = dimMult;
  if ( enteredStates.length ) ext.enteredStates = enteredStates;
  // attack.damageAttrTimes: the Damage Attribute applied that many more times to the Wound Roll
  if ( optSum("attack.damageAttrTimes") ) ext.damageAttrTimes = optSum("attack.damageAttrTimes");
  // F2: what effects added to the technique (shown on the card)
  if ( grant?.added?.length ) ext.granted = grant.added;
  if ( Object.keys(ext).length ) attack.ext = ext;
  // Punching Down / Up: the attacker's side (each target's is worked out against it), @punchDown / @punchUp...
  if ( punchTargets.length ) {
    attack.punch = punch;
    Object.assign(vars, punchVars(punch, punchTargets));
    for ( const [i, t] of targets.entries() ) {
      const ta = opts.targets?.[i]?.actor ?? null;
      const p = ta ? punchOf(punch, ta) : null;
      if ( p?.down ) t.punchDown = 1;
      if ( p?.up ) t.punchUp = p.up;
    }
  }
  if ( counterCost && inEncounter(actor) ) attack.counterCost = counterCost;

  // The winner of a Duel (or a Maneuver's attack) makes no Strike Roll
  const result = preset ?{ total: 0, natural: 0, rawNatural: 0, crit: false, botch: false, extra: [], parts: [], critRoll: null, rolls: [] }
    : await dbuRoll({
    actor, kind: "strike", other: targetActors[0] ?? null, others: targetActors,
    title: `${L("DBU.Roll.Strike")} — ${attack.name}`,
    subtitle: `${fx.label} · ${L(DBU.foundations[foundation])} · ${L(DBU.damageCategories[Math.clamp(category, 1, 3)])}`,
    // Attack options: + Natural Result, Critical Target lower (−1) or higher (never below 7)
    naturalMod: strikeData.natural + optSum("attack.natural.strike"), minNatural: fx.minNatural,
    critTarget: critSetOf(critWith(strikeData.crit, optSum("attack.crit.strike")), attackOpts, "attack.critSet.strike"),
    botchRange: strikeData.botch, scope: attackScope(attack),
    diceGroups: strikeData.dice, parts, critDice: strikeData.critDice, botchPenalty: strikeData.botchPenalty,
    cutting: fx.cutting,
    twin: (attack.sig?.twinLinked === "strike") ? "high" : ((attack.sig?.deadLink === "strike") ? "low" : null),
    notes: [
      L("DBU.Attack.Paid", { kp, wager: wager + lifeWager + finalChance + Math.max(0, optSum("attack.wagerFree")), charges: totalCharges }),
      ...notesExtra,
      ...(problems.length ? [`⚠ ${problems.join(" ")}`] : [])
    ],
    toMessage: false
  });
  attack.strike = { total: result.total, natural: result.natural, crit: result.crit, botch: result.botch };
  // HM: the Homing Advantage (an attack without an AoE): what a missed Opponent's defense needs to roll this Strike Roll
  // again (its ranks times, +1(T) per miss so far)
  {
    const homing = optionList.find(o => o?.key === "homing");
    // (CS4: the Power Shot ranks of the attack, for @powerShot of "targeted")
    const ps = Number(optionList.find(o => o?.key === "powerShot")?.rank ?? 0) || 0;
    if ( ps > 0 ) attack.powerShotRanks = ps;
    if ( homing && !aoe && !preset ) attack.homing = { ranks: Math.max(1, Math.floor(Number(homing.rank) || 1)), T: sys.top.current,
      cfg: { naturalMod: strikeData.natural + optSum("attack.natural.strike"), minNatural: fx.minNatural ?? 0,
        critTarget: critSetOf(critWith(strikeData.crit, optSum("attack.crit.strike")), attackOpts, "attack.critSet.strike"),
        botchRange: strikeData.botch, diceGroups: strikeData.dice, critDice: strikeData.critDice, botchPenalty: strikeData.botchPenalty,
        cutting: !!fx.cutting, parts: parts.map(p => ({ label: p.label, value: Number(p.value) || 0 })) } };
  }
  // RX: what the roll reactions of the Strike Roll spent (@rollSpent.strike.<resource>)
  attack.rollSpent = { strike: result.rollSpent ?? {} };
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

  // Z: the Basic Attack uses each Profile (but Simple) once per Combat Round ("profileUses.<key>": more), the Signature
  // Technique Maneuver is 1/Round ("flag.sigUnlimited": no limit); a warning on the card (an Out-of-Sequence use is not counted)
  if ( !preset && !oos && inEncounter(actor) ) {
    const tu = techUseVars(actor, signature?.id ?? null, [profileKey]);
    const bk = sys.buckets ?? {};
    if ( !sig && (profileKey !== "simple") && ((tu.profileUsedRound?.[profileKey] ?? 0) > (1 + (bk[`profileUses.${profileKey}`]?.total ?? 0))) ) {
      attack.notes.push(L("DBU.Attack.ProfileRoundUsed", { profile: DBU.profiles[profileKey]?.label ?? profileKey }));
    }
    if ( sig && !flagOn(sys, "sigUnlimited") && ((tu.sigsUsedRound ?? 0) > (1 + (bk["sigUses"]?.total ?? 0))) ) attack.notes.push(L("DBU.Attack.SigRoundUsed"));
  }
  // (NM5: whose technique a Copied Technique is)
  if ( sig?.copiedFrom ) attack.copiedFrom = sig.copiedFrom;
  // (DD3: what a cancelled attack gives back: the Energy Charges held, the Ki Wager's Life Points)
  if ( pending > 0 ) attack.heldCharges = pending;
  if ( lifeWager > 0 ) attack.lifeWager = lifeWager;
  if ( finalChance > 0 ) {
    attack.finalChance = finalChance;
    attack.notes.push(L("DBU.Attack.FinalChanceNote", { n: finalChance }));
  }
  // AR Self-Explosion: the Sphere's Target Square is the attacker's own (placed on the map)
  if ( !preset && optionList.some(o => o?.key === "selfExplosion") && String(aoe ?? "").startsWith("sphere") ) {
    try {
      const { placeSphere } = await import("../canvas/areas.mjs");
      const placed = await placeSphere(actor, magnitude, { name: `${attack.name}: Self-Explosion`, kind: "selfExplosion", color: "#ff7a2a" });
      if ( placed ) attack.notes.push(placed);
    } catch(err) { console.error("DBU | Self-Explosion area", err); }
  }
  const message = await postAttackCard(actor, attack, result);
  if ( finalChance > 0 ) await actor.setFlag("dbu-rpg", "finalChance", { ...(actor.getFlag("dbu-rpg", "finalChance") ?? {}), messageId: message?.id ?? null });
  // Triggers "when you make an Attacking Maneuver" (not the attack of a won Duel, which was made already)
  if ( !duel ) {
    const { fireEvent } = await import("./triggers.mjs");
    // (messageId: the attack's card, for the effects that add to it: "attackWound")
    fireEvent(actor, "attackMade", { other: targetActors[0] ?? null,
      scope: { ...attackScope(attack), vs: versusData(actor, targetActors[0] ?? null), messageId: message.id } });
    // (CS4: a one-use Signature is spent: gone at the end of the turn)
    if ( signature?.flags?.["dbu-rpg"]?.oneUse ) await signature.setFlag("dbu-rpg", "oneUseSpent", true).catch(() => null);
    // ...and "when you are targeted by an Attacking Maneuver" for each target (@vs: the attacker)
    // (CS4: the other targets that are Allies of that one, their Might, and the attack's Power Shot)
    for ( const t of targetActors ) {
      const mates = targetActors.filter(o => (o !== t) && versusData(t, o).ally);
      fireEvent(t, "targeted", { other: actor, scope: { ...attackScope(attack), vs: versusData(t, actor), messageId: message.id,
        targetIndex: targetActors.indexOf(t),
        alliesTargeted: mates.length, alliesTargetedMight: mates.reduce((n, o) => n + (Number(o.system?.aptitudes?.might) || 0), 0),
        powerShot: (attack.powerShotRanks ?? 0) + (attack.powerShot ?? 0) } });
    }
  }

  // Post-attack Signature drawbacks
  if ( attack.sig?.backlash ) await actor.update({ "system.life.value": Math.max(0, actor.system.life.value - (2 * bT * attack.sig.backlash)) },
    { dbuSelfInflicted: true });
  return message;
}

/**
 * Attack options of the actor's items: modifiers on the "attack.*" targets (+Energy Charges, Strike, Wound, Ki Point
 * Cost, Damage Category), whose condition is tested with the attack's variables. mode "ask" = a box in the dialog.
 */
export function attackOptionsFor(actor, scope, mods = optionMods(actor), { nOf = null } = {}) {
  const out = [];
  // The amount of each option group (its first piece's that has one): the others of the group are tested with it
  const groupMax = new Map();
  for ( const m of mods ) {
    const g = String(m.group ?? "").trim();
    if ( !g || blank(m.amount) || groupMax.has(g) ) continue;
    groupMax.set(g, Math.floor(evaluate(m.amount, { ...(actor.system.rollData ?? {}), ...(m.ctx ?? {}), ...scope, n: 1 })));
  }
  for ( const m of mods ) {
    const sc = { ...(actor.system.rollData ?? {}), ...(m.ctx ?? {}), ...scope };
    const key = [m.itemId, m.label, m.target, m.value, m.condition].join("|");
    const box = blank(m.group) ? key : `group:${String(m.group).trim()}`;
    // An option with an amount or a group sees @n: the n picked (in the dialog: 1, or its amount when 1 does not do)
    const usesN = !blank(m.amount) || !blank(m.group);
    let max = 0;
    if ( !blank(m.amount) ) {
      max = Math.floor(evaluate(m.amount, { ...sc, n: 1 }));
      if ( max < 1 ) continue;
    }
    const top = max || groupMax.get(String(m.group ?? "").trim()) || 0;
    // (in the dialog: every n up to the amount, at most 50, so "@n == 2" still gets its box)
    const ns = nOf ? [top ? Math.min(nOf(box), top) : nOf(box)]
      : ((top > 1) ? Array.from({ length: Math.min(top, 50) }, (_, k) => k + 1) : [1]);
    const n = ns.find(k => test(m.condition, usesN ? { ...sc, n: k } : sc));
    if ( n === undefined ) continue;
    const scN = usesN ? { ...sc, n } : sc;
    // The Damage Attribute option's value is the Attributes it allows ("pe", "fo|ma", "surgency", "any"); the other text
    // options keep theirs (attack.aoe "cone|line", attack.state "raging")
    const value = (m.target === DAMAGE_ATTRIBUTE) ? (damageAttributeKeys(m.value).length ? String(m.value).trim() : "")
      : OPTION_TEXT.has(m.target) ? String(m.value ?? "").trim()
      : evaluate(m.value, scN, { floor: !FRACTION_OPTIONS.has(m.target) });
    // (MW: a Ki Wager limit of 0 is a value)
    if ( !value && (m.target !== "attack.wagerMax") ) continue;
    const o = { ...m, value, key };
    if ( usesN || !blank(m.cost) ) Object.assign(o, { box, max, n, scope });
    else o.box = box;
    out.push(o);
  }
  return out;
}

/**
 * The modifiers of the actor's items on the "attack.*" targets, with their option fields (cost, amount, group,
 * limitKey, at): those of the declaration (at ""), or of the Wound Roll (at "wound").
 */
function optionMods(actor, at = "") {
  try {
    return withOptionFields(actor, collectModifiers(actor, actor.system).filter(m => String(m.target).startsWith("attack.")))
      .filter(m => String(m.at ?? "") === at);
  }
  catch(err) { return []; }
}

/** The boxes of option groups that are asked: a piece of the group is "ask" or has an amount. */
function askedBoxes(mods) {
  const out = new Set();
  for ( const m of mods ) if ( !blank(m.group) && ((m.mode === "ask") || !blank(m.amount)) ) out.add(`group:${String(m.group).trim()}`);
  return out;
}

/**
 * @chose.<group>: the n of each option group used (1 when its box has no amount), an automatic group too (as
 * rules/options.mjs choseVars).
 */
function choseOf(options) {
  const out = {};
  for ( const o of options ) if ( !blank(o.group) ) out[String(o.group).trim()] = o.n ?? 1;
  return out;
}

/** How many of these Characters are Allies of the actor (the same non-neutral disposition). */
const allyCount = (actor, others) => others.filter(o => (o !== actor) && areAllies(actor, o)).length;

/** The lowest value of the actor's modifiers on a "...Set" target (wager.maxSet), null without any. */
function lowestSet(actor, target, scope = {}) {
  let mods = [];
  try { mods = collectModifiers(actor, actor.system).filter(m => m.target === target); }
  catch(err) { return null; }
  let low = null;
  for ( const m of mods ) {
    const sc = { ...(actor.system.rollData ?? {}), ...(m.ctx ?? {}), ...scope };
    if ( blank(m.value) || !test(m.condition, sc) ) continue;
    const v = evaluate(m.value, sc);
    low = (low === null) ? v : Math.min(low, v);
  }
  return low;
}

/** A Critical Target set by options (attack.critSet.*: the lowest wins, the 7 floor does not apply). */
function critSetOf(crit, options, target) {
  const sets = options.filter(o => o.target === target).map(o => Number(o.value)).filter(Number.isFinite);
  return sets.length ? Math.min(crit, ...sets) : crit;
}

/** A State key written in an option ("raging", "Raging", "Raging State"). */
function stateKeyOf(value) {
  const n = s => String(s ?? "").toLowerCase().replace(/state$/i, "").replace(/[^a-z0-9]/g, "");
  return Object.keys(DBU.states).find(k => (k === value) || (n(k) === n(value))) ?? null;
}

/**
 * attack.state: enter each State (Level 1) the actor is not in yet, and time it to the end of its turn when the
 * timed States exist (triggers.mjs addTimedState). @returns [{ key, prev, level }]
 */
async function enterAttackStates(actor, options) {
  const out = [];
  if ( !options.length || (typeof actor.setState !== "function") ) return out;
  const T = await import("./triggers.mjs");
  for ( const o of options ) {
    const key = stateKeyOf(o.value);
    if ( !key || out.some(e => e.key === key) ) continue;
    const prev = actor.system.states?.[key] ?? 0;
    if ( prev >= 1 ) continue;
    await actor.setState(key, 1);
    if ( typeof T.addTimedState === "function" ) await T.addTimedState(actor, key, prev, 1, "endOfTurn", o.own || o.label);
    out.push({ key, prev, level: 1 });
  }
  return out;
}

/** Leave the States an attack entered (attack.state), when their Level did not change since. */
async function leaveAttackStates(attack) {
  const list = attack.ext?.enteredStates ?? [];
  if ( !list.length || attack.ext.statesLeft ) return false;
  const actor = await fromUuid(attack.attackerUuid);
  if ( typeof actor?.setState !== "function" ) return false;
  for ( const e of list ) if ( (actor.system.states?.[e.key] ?? 0) === e.level ) await actor.setState(e.key, e.prev);
  // Its end-of-turn timer goes too: left behind, it would end a later, unrelated entry into the same State
  const T = await import("./triggers.mjs");
  if ( typeof T.dropTimedEntries === "function" ) {
    await T.dropTimedEntries(actor, x => (x.kind === "state") && (x.duration === "endOfTurn")
      && list.some(e => (e.key === x.key) && (e.prev === x.prev) && (e.level === x.level)));
  }
  attack.ext.statesLeft = true;
  return true;
}

/** Is every target of the card resolved (its Damage applied, missed, or settled by a Duel)? */
const allResolved = attack => !!attack.targets?.length && attack.targets.every(t => ((t.damage !== null) && (t.damage !== undefined))
  || ((t.result === "miss") && (!attack.absolute || t.defense?.noAbsolute)) || (t.result === "duel"));

/**
 * The Diminishing Defense stacks a defender gains from an attack: × the attack's attack.dimDefense.mult; with
 * flag.dimDefenseFirstFree, the first stack from each attacker per Combat Round is ignored (flag dimFirstFree).
 * @returns {{stacks: number, update: object}}
 */
function dimDefenseGain(defender, attacker, perAttack, mult = 1) {
  const sys = defender.system;
  let stacks = (mult && (mult !== 1)) ? Math.floor(perAttack * mult) : perAttack;
  const update = {};
  if ( (stacks > 0) && attacker && flagOn(sys, "dimDefenseFirstFree") ) {
    const combat = game.combats?.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === defender.uuid));
    if ( combat ) {
      const prev = defender.getFlag?.(FLAG, "dimFirstFree");
      const same = prev && (prev.combat === combat.id) && (prev.round === combat.round);
      const from = same ? [...(prev.from ?? [])] : [];
      if ( !from.includes(attacker.uuid) ) {
        stacks -= 1;
        from.push(attacker.uuid);
        update[`flags.${FLAG}.dimFirstFree`] = { combat: combat.id, round: combat.round, from };
      }
    }
  }
  update["system.combat.dimDefense"] = (sys.combat.dimDefense ?? 0) + Math.max(0, stacks);
  return { stacks: Math.max(0, stacks), update };
}

/**
 * F2: the attack.advantage.<key> / attack.superProfile.<key> pieces that apply (automatic, or ticked; with uses left),
 * and the technique worked out with them (rules/signature.mjs grantedSignature). null when none applies.
 * @returns {{sig, comp, base, added, refused, basic, pieces}|null}
 */
function grantedFor(actor, { sig, comp, profileKey, foundation, mods, chosen, nOf, isAsked, usesLeft, noSuper = false, vars = {},
  charges = 0 }) {
  const grantMods = mods.filter(isGrant);
  if ( !grantMods.length ) return null;
  const scope = preAttackScope({ sig, comp, profileKey, foundation, charges, vars });
  const candidates = attackOptionsFor(actor, scope, grantMods, { nOf }).filter(o => !isAsked(o) || chosen.has(o.box));
  // (R: the Advantage picked comes once, from the first pick piece that applies: its limit and cost only)
  const usable = candidates.filter(usesLeft);
  const firstPick = usable.find(o => o.fromPick);
  const pieces = usable.filter(o => !o.fromPick || (o === firstPick));
  // (the ones with no use left: a note on the card)
  const exhausted = candidates.filter(o => !usesLeft(o));
  if ( !pieces.length ) return exhausted.length ? { sig, comp, base: comp, added: [], refused: [], basic: false, pieces: [], exhausted } : null;
  const grants = { options: {}, superProfile: "" };
  const refusedSuper = [];
  for ( const o of pieces ) {
    const [, kind, key] = GRANT_TARGET.exec(o.target);
    const n = Number(o.value) || 0;
    if ( kind === "advantage" ) grants.options[key] = (grants.options[key] ?? 0) + n;
    // (one Super Profile: the first one; none with a Multi-Profile picked from an effect, which is one already)
    else if ( (n > 0) && !grants.superProfile ) {
      if ( noSuper ) refusedSuper.push(key);
      else grants.superProfile = key;
    }
  }
  const g = grantedSignature(sig, grants, actor, { buckets: actor.system?.buckets ?? null, profileKey, foundation });
  if ( !g && !refusedSuper.length ) return null;
  const out = g ?? { sig, comp, base: comp, added: [], refused: [], basic: !sig };
  out.refused = [...(out.refused ?? []), ...refusedSuper];
  // (a refused piece does nothing: neither its use nor its cost counts)
  out.pieces = pieces.filter(o => !out.refused.includes(GRANT_TARGET.exec(o.target)[2]));
  // (nothing added: the attack keeps its own technique, a Basic Attack none)
  if ( !out.added.length ) Object.assign(out, { sig, comp, basic: false });
  out.exhausted = exhausted;
  return out;
}

/** The attack options that apply with any of these scopes (the first scope that allows one gives its value); `extra`: the
 * one-shot pieces of an effect's attack (F1). */
function attackOptionsAny(actor, scopes, extra = []) {
  const mods = [...optionMods(actor), ...extra];
  const found = new Map();
  for ( const scope of scopes ) {
    for ( const o of attackOptionsFor(actor, scope, mods) ) if ( !found.has(o.key) ) found.set(o.key, o);
  }
  return [...found.values()];
}

/**
 * The attack's variables as its dialog opens, before the Ki Wager, the Weapon, the Damage Attribute, "Made through",
 * Called Shot or the Divine Ki payments are chosen: the largest Ki Wager and Divine Ki for both payments (when the
 * actor can use them), then every choice made / none of them / armed, and last no Ki Wager nor Divine Ki at all.
 */
function dialogScopes(actor, { sig, comp, prof, profileKey, foundation, divine = null, outOfSequence = false, targets = [],
  sigName = "", viaFx = "" }) {
  const sys = actor.system;
  const dkp = !!sys.dkp?.usable;
  const wielded = sys.weapons?.wielded ?? [];
  const armed = !!wielded.length;
  // The targets (@allyTargets, @vsMax.*), Hidden (@oblivious), the Maneuver items an attack may be made through
  const targetActors = (targets ?? []).map(t => t.actor).filter(Boolean);
  const viaItems = [...new Set(actor.items.filter(i => i.type === "maneuver").map(i => maneuverSlug(i.name)).filter(Boolean))];
  const integrated = !!sys.weapons?.wielded?.some(w => w.system?.integrated);
  const kpArgs = { sig, comp, prof, foundation, divine };
  const kpOf = extra => ((sig ? comp : prof) ? attackKp(actor, { ...kpArgs, ...extra }) : 0);
  const fx = profileEffects(profileKeys(profileKey, sig));
  const full = !!comp?.fullWager || flagOn(sys, "fullWager") || fx.freeAdvantages.includes("fullWager");
  const maxWager = ignoresCapacity(actor) ? sys.capacity.max : (full ? sys.capacity.value : Math.floor(sys.capacity.max / 2));
  const def = defaultDamageAttribute(foundation);
  const damage = { key: def, value: damageAttributeValue(actor, def) };
  const base = { sig, wager: maxWager, dkpCost: dkp, dkpWager: dkp, kp: kpOf({}), favored: favoredElement(actor, fx),
    oos: outOfSequence, damage, oblivious: !!sys.combat?.hidden, allyTargets: allyCount(actor, targetActors), tags: sigTags(sig),
    agg: aggregates(actor, targetActors), sigName, viaFx };
  // Every choice made: any Damage Attribute (the highest one's value), each way of making it, armed (any Weapon) and unarmed
  const keys = [...DBU.ATTRIBUTES, "surgency"];
  const every = {
    ...attackVars({ ...base, kp: kpOf({ calledShot: true, rapid: true }), calledShot: true, armed,
      favored: base.favored || (favoredElements(actor).length > 0),
      damage: { key: def, value: Math.max(...keys.map(k => damageAttributeValue(actor, k))) } }),
    unarmed: 1, ...Object.fromEntries(VIA.map(v => [`via_${v}`, 1])), ...Object.fromEntries(keys.map(k => [`da_${k}`, 1])),
    ...Object.fromEntries(viaItems.map(v => [`via_${v}`, 1])), oblivious: 1, ...(integrated ? { weaponIntegrated: 1 } : {}),
    ...Object.fromEntries(wielded.flatMap(w => weaponSlugs(w)).map(s => [`weapon_${s}`, 1]))
  };
  const scope = vars => preAttackScope({ sig, comp, profileKey, foundation, charges: sys.combat.energyCharges ?? 0, vars });
  return [
    scope(attackVars(base)), scope(every),
    // (each Weapon wielded: @weapon_<slug>)
    ...wielded.map(w => scope(attackVars({ ...base, armed: true, weapon: w, integrated: !!w.system?.integrated }))),
    scope(attackVars({ ...base, wager: 0, dkpCost: false, dkpWager: false })),
    // One choice at a time, so an option that needs one choice and not another still gets its box
    ...VIA.map(v => scope(attackVars({ ...base, via: v }))),
    ...viaItems.map(v => scope(attackVars({ ...base, via: v }))),
    ...keys.map(k => scope(attackVars({ ...base, damage: { key: k, value: damageAttributeValue(actor, k) } }))),
    scope(attackVars({ ...base, calledShot: true, kp: kpOf({ calledShot: true }) })),
    ...(dkp ? [scope(attackVars({ ...base, dkpCost: true, dkpWager: false })), scope(attackVars({ ...base, dkpCost: false, dkpWager: true }))] : [])
  ];
}

/**
 * The variables of an attack the attack options and the attack triggers see: @wager (Ki Wager), @dkpCost / @dkpWager
 * (paid with Divine Ki), @kp (Ki Point Cost before the options), @dmgAttr and @da_<key> (the Damage Attribute used),
 * @favored (a Favored Element), @calledShot, @oos (Out-of-Sequence), @armed / @unarmed, @superProfile_<key>,
 * @opt_<key> (the rank of that Advantage or Disadvantage of the Signature) and @via_exploit / @via_defend / @via_feint.
 * Package F: @weapon_<slug> (the Weapon used: its name, Category or a Quality), @sig_<slug> (the Signature used, by
 * name), @viaFx.<ref> (the effect whose button made the attack).
 */
/**
 * RA: this encounter's uses of the actor's techniques before this attack: flags.dbu-rpg.techUses = { combat, round,
 * sig: { <id>: { e, r } }, sigsRound, profile: { <key>: { e, r } } } (counts of another encounter / Round read as 0).
 */
export function techUseVars(actor, sigId = null, profiles = []) {
  const f = actor?.flags?.["dbu-rpg"]?.techUses ?? {};
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor?.uuid)) ?? null;
  const same = combat && (f.combat === combat.id);
  const round = same && (f.round === combat.round);
  const out = { sigUsedEnc: 0, sigUsedRound: 0, sigsUsedRound: round ? (f.sigsRound ?? 0) : 0, profileUsedRound: {}, profileUsedEnc: {} };
  if ( sigId && same ) { out.sigUsedEnc = f.sig?.[sigId]?.e ?? 0; out.sigUsedRound = round ? (f.sig?.[sigId]?.r ?? 0) : 0; }
  for ( const k of profiles ) {
    out.profileUsedEnc[k] = same ? (f.profile?.[k]?.e ?? 0) : 0;
    out.profileUsedRound[k] = round ? (f.profile?.[k]?.r ?? 0) : 0;
  }
  return out;
}

/** RA: count this attack's technique and Profiles (techUseVars). */
async function recordTechUse(actor, sigId, profiles = []) {
  const combat = (game.combats ?? []).find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor?.uuid));
  if ( !combat || !actor?.isOwner ) return;
  const f = foundry.utils.deepClone(actor.flags?.["dbu-rpg"]?.techUses ?? {});
  const same = f.combat === combat.id;
  const round = same && (f.round === combat.round);
  const next = { combat: combat.id, round: combat.round, sig: same ? (f.sig ?? {}) : {}, sigsRound: round ? (f.sigsRound ?? 0) : 0,
    profile: same ? (f.profile ?? {}) : {} };
  const bump = (o, k) => { const cur = o[k] ?? { e: 0, r: 0 }; o[k] = { e: cur.e + 1, r: (round ? cur.r : 0) + 1 }; };
  if ( !round ) { for ( const o of [next.sig, next.profile] ) for ( const v of Object.values(o) ) v.r = 0; }
  if ( sigId ) { bump(next.sig, sigId); next.sigsRound += 1; }
  for ( const k of profiles ) bump(next.profile, k);
  await actor.setFlag("dbu-rpg", "techUses", next).catch(() => null);
}

function attackVars({ sig = null, wager = 0, dkpCost = false, dkpWager = false, kp = 0, damage = null, favored = false,
  calledShot = false, oos = false, armed = false, via = "", oblivious = false, allyTargets = 0, integrated = false, tags = [],
  agg = null, weapon = null, sigName = "", viaFx = "", techUse = null } = {}) {
  const vars = {
    wager, dkpCost: dkpCost ? 1 : 0, dkpWager: dkpWager ? 1 : 0, kp, dmgAttr: damage?.value ?? 0, favored: favored ? 1 : 0,
    calledShot: calledShot ? 1 : 0, oos: oos ? 1 : 0, armed: armed ? 1 : 0, unarmed: armed ? 0 : 1,
    ...Object.fromEntries(VIA.map(v => [`via_${v}`, (via === v) ? 1 : 0]))
  };
  // Made through a Maneuver item (@via_tailattack); Hidden (@oblivious); targets with your disposition (@allyTargets);
  // an Integrated Weapon (@weaponIntegrated); the Signature's tags (@tag_fullPower...); @vsMax / @vsMin / @vsAny /
  // @vsCount over the targets
  if ( via && !VIA.includes(via) ) vars[`via_${via}`] = 1;
  vars.oblivious = oblivious ? 1 : 0;
  vars.allyTargets = allyTargets;
  vars.weaponIntegrated = integrated ? 1 : 0;
  for ( const t of tags ) vars[`tag_${t}`] = 1;
  if ( agg ) Object.assign(vars, agg);
  if ( damage?.key ) vars[`da_${damage.key}`] = 1;
  if ( sig?.superProfile ) vars[`superProfile_${sig.superProfile}`] = 1;
  for ( const o of [...(sig?.advantages ?? []), ...(sig?.disadvantages ?? [])] ) {
    const rank = Number(o.rank ?? 1) || 0;
    if ( o.key && rank ) vars[`opt_${o.key}`] = Math.max(vars[`opt_${o.key}`] ?? 0, rank);
  }
  for ( const s of weaponSlugs(weapon) ) vars[`weapon_${s}`] = 1;
  if ( slugOf(sigName) ) vars[`sig_${slugOf(sigName)}`] = 1;
  if ( String(viaFx ?? "").trim() ) vars.viaFx = { [String(viaFx).trim().toLowerCase()]: 1 };
  if ( techUse ) Object.assign(vars, techUse);
  return vars;
}

/**
 * The Ki Point Cost of an attack: its Profile or Signature, a Super Profile applied by an effect, the Weapon, the
 * cost changes of the actor's effects, `extra` (the attack options), the minimum, Glass, God Strike, Ballistics, Called
 * Shot and Rapid Movement.
 */
function attackKp(actor, { sig = null, comp = null, prof = null, foundation, mp = null, weapon = null, divine = null,
  calledShot = false, rapid = false, extra = 0, baseFree = false, adjust = 0 }) {
  const sys = actor.system;
  const T = sys.top.current;
  const kpT = sys.top.kp;
  // attack.kpBaseFree: the Profile / Signature costs nothing (the rest is still paid); `adjust`: the units Efficiency /
  // Inefficiency added to a Basic Attack by an effect change (F2)
  let units = baseFree ? 0 : ((sig ? (comp.kpUnits + comp.kpAdjust) : prof.kp) + adjust);
  let minUnits = baseFree ? 0 : (sig ? comp.kpMinUnits : (prof.kp / 2));
  // A Super Profile's Ki Point Cost adds to the cost and to the minimum one (Blitz on a Signature: −2(T))
  if ( mp?.key ) {
    units += mp.cost - (sig ? (DBU.profiles[mp.key].sigKpReduction ?? 0) : 0);
    minUnits += mp.cost / 2;
  }
  const weaponCat = weapon ? DBU.weaponCategories[weapon.system.category] : null;
  if ( weaponCat?.kp && ((weaponCat.type !== "magic") || (foundation === "magic")) ) units += weaponCat.kp;
  const ballistic = rules().ballistics && weapon?.system.ballistic;
  let kp = Math.ceil(units * kpT) + sys.costs.attack + (sys.kpCostByFoundation?.[foundation] ?? 0)
    + (sys.buckets?.[sig ? "kpCost.signature" : "kpCost.basic"]?.total ?? 0) + extra;
  let minKp = Math.ceil(minUnits * kpT);
  if ( sys.costs.perfectKiControl ) minKp = Math.min(minKp, 2 * kpT);
  kp = Math.max(minKp, kp);
  // The Glass Tribe's Glass: a fixed Ki Point Cost
  if ( mp?.flatKp ) kp += mp.flatKp;
  // God Strike: 1/4 (rounded up) of the Profile's Ki Point Cost
  if ( divine?.costFactor && (divine.costFactor !== 1) ) kp = Math.ceil(kp * divine.costFactor);
  // Ballistics: Basic Attacks with a Ballistic Weapon cost no Ki; Signatures cost half
  if ( ballistic ) kp = sig ? Math.ceil(kp / 2) : 0;
  if ( calledShot ) kp += 2 * T;
  // (O: the same Rapid Movement cost as the Movement Maneuver's: "kpCost.rapid" ±, "kpCost.rapidFree")
  if ( rapid && !((sys.buckets?.["kpCost.rapidFree"]?.total ?? 0) > 0) ) kp += Math.max(0, (2 * T) + (sys.buckets?.["kpCost.rapid"]?.total ?? 0));
  return kp;
}

/** RB: the Ki Point Cost of a plain attack of that Profile for this actor (United Attack: "the same Profile"). */
export function profileKpFor(actor, profileKey, foundation) {
  const prof = DBU.profiles[profileKey] ?? DBU.profiles.simple ?? { kp: 2 };
  try { return attackKp(actor, { prof, foundation: foundation ?? prof.foundations?.[0] ?? "physical" }); }
  catch(err) { console.error("DBU | profile KP", err); return 0; }
}

/** A Critical Target changed by the attack options (−1 = one lower), never below 7. */
const critWith = (crit, change) => (change ? Math.max(7, crit + change) : crit);

/** The Damage Attribute of a Foundation: Force, Magic for Magic Attacks. */
const defaultDamageAttribute = foundation => ((foundation === "magic") ? "ma" : "fo");

/** The Damage Attributes a value allows: Attribute keys or abbreviations ("pe", "FO|MA"), "surgency" or "any". */
export function damageAttributeKeys(value) {
  const keys = [];
  for ( const raw of String(value ?? "").split(/[|,/;]/) ) {
    const s = raw.trim().replace(/^@/, "").toLowerCase();
    if ( !s ) continue;
    if ( s === "any" ) keys.push(...DBU.ATTRIBUTES);
    else if ( s === "surgency" ) keys.push("surgency");
    else {
      const key = DBU.ATTRIBUTES.find(k => (k === s) || (String(DBU.attributeAbbr?.[k] ?? "").toLowerCase() === s));
      if ( key ) keys.push(key);
    }
  }
  return [...new Set(keys)];
}

/** The value a Damage Attribute adds to the Wound Roll: its Attribute Modifier, or the Surgency. */
function damageAttributeValue(actor, key) {
  const sys = actor?.system;
  if ( key === "surgency" ) return sys?.aptitudes?.surgency ?? 0;
  return sys?.attributes?.[key]?.mod ?? 0;
}

const damageAttributeLabel = key => ((key === "surgency") ? "Surgency" : L(DBU.attributes[key] ?? key));

/** The variables of an attack before it is made (for the attack options). */
function preAttackScope({ sig, comp, profileKey, foundation, charges = 0, extraProfiles = [], vars = {} }) {
  const keys = profileKeys(profileKey, sig, extraProfiles);
  return {
    ...vars,
    physical: foundation === "physical" ? 1 : 0, energy: foundation === "energy" ? 1 : 0, magic: foundation === "magic" ? 1 : 0,
    signature: sig ? 1 : 0, basic: (sig && !sigTags(sig).includes("fullPower")) ? 0 : 1, ultimate: comp?.ultimate ? 1 : 0,
    aoe: (sig ? comp?.aoe : DBU.profiles[profileKey]?.aoe) ? 1 : 0, charges,
    elemental: keys.some(k => DBU.profiles[k]?.elemental) ? 1 : 0, ...Object.fromEntries(keys.map(k => [`profile_${k}`, 1]))
  };
}

/** The name of an option target (F2: "Advantage: Power Shot", "Super Profile: All Out"). */
function optionTargetLabel(target) {
  const m = GRANT_TARGET.exec(String(target ?? ""));
  if ( m?.[1] === "advantage" ) return L("DBU.Attack.GrantAdvantage", { name: SIGNATURE_OPTIONS[m[2]]?.name ?? m[2] });
  if ( m?.[1] === "superProfile" ) return L("DBU.Attack.GrantSuperProfile", { name: DBU.superProfiles[m[2]]?.label ?? m[2] });
  return game.i18n.localize(DBU.modifierTargets[target] ?? target);
}
const optionText = o => `${(o.own && (o.own !== o.label)) ? `${o.label} — ${o.own}` : o.label}: ${o.value > 0 ? "+" : ""}${o.value} ${optionTargetLabel(o.target)}${o.limit ? ` [${o.limit}]` : ""}`;

/**
 * Formula variables of an attack for the event triggers (@physical, @signature, @charges, @crit..., and the ones kept
 * when it was made: @kp, @dmgAttr, @favored, @calledShot, @oos, @armed, @via_exploit... see attackVars).
 */
export function attackScope(attack) {
  const fx = attackProfileEffects(attack);
  return {
    ...(attack.vars ?? {}),
    // RX: what the roll reactions of its Strike / Wound Rolls spent (@rollSpent.strike.<resource>, @rollSpent.wound.<resource>)
    rollSpent: { strike: attack.rollSpent?.strike ?? {}, wound: attack.wound?.rollSpent ?? attack.rollSpent?.wound ?? {} },
    physical: attack.foundation === "physical" ? 1 : 0, energy: attack.foundation === "energy" ? 1 : 0,
    magic: attack.foundation === "magic" ? 1 : 0, signature: attack.signatureId ? 1 : 0,
    basic: (attack.signatureId && !attack.vars?.tag_fullPower) ? 0 : 1,
    ultimate: attack.ultimate ? 1 : 0, aoe: (attack.aoe || attack.vars?.aoe) ? 1 : 0, charges: attack.charges ?? 0, wager: attack.wager ?? 0,
    category: attack.category ?? 1, crit: attack.strike?.crit ? 1 : 0, critWound: attack.wound?.crit ? 1 : 0,
    // (T23 @chargeWound: the Wound bonus its Charging Assault gives)
    chargeWound: attack.chargeWound ?? 0,
    targets: attack.targets?.length ?? 0, elemental: fx.keys.some(k => DBU.profiles[k]?.elemental) ? 1 : 0,
    ...Object.fromEntries(fx.keys.map(k => [`profile_${k}`, 1]))
  };
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
  // RB: United Attack still open, the target rows that can be Intervened for, who may Reflect it
  const TM = await import("./team-maneuvers.mjs");
  return foundry.applications.handlebars.renderTemplate("systems/dbu-rpg/templates/chat/attack-card.hbs", {
    attack,
    unitedOk: TM.unitedOpen(attack),
    interveneOk: (attack.targets ?? []).map(t => TM.interveneOpen(attack, t)),
    reflectable: TM.reflectors(attack),
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

/** RB: post an attack card made outside of the attack dialog (a Reflect). */
export function postAttackMessage(actor, attack, result) { return postAttackCard(actor, attack, result); }

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

/**
 * M2: add a Wound bonus to an attack whose Wound Roll is not made yet (the attack's card `messageId`); through the GM when
 * this user does not own the card. True when it was added (or sent).
 */
export async function addAttackWound(messageId, label, value) {
  const message = game.messages.get(messageId);
  const attack = message ? foundry.utils.deepClone(message.getFlag(FLAG, "attack")) : null;
  if ( !attack || attack.wound || !(Number(value) || 0) ) return false;
  if ( !message.isOwner ) {
    const { emitGM } = await import("../socket.mjs");
    return !!emitGM("attackWoundAdd", { messageId, label, value });
  }
  attack.extraWound = [...(attack.extraWound ?? []), { label: String(label ?? ""), value: Number(value) || 0 }];
  await refreshAttackMessage(message, attack);
  return true;
}

/**
 * AA: change the Wound Roll an attack already made, before any of its Damage is applied: + add (a number), + the dice of
 * `charges` more Energy Charges (rolled now, the attack's Charge Dice Category), + category (Damage Category; "lethal":
 * Lethal, which cannot be reduced). Through the GM for an attack message the user does not own. @returns a text, or "".
 */
export async function bumpStoredWound(messageId, { add = 0, charges = 0, crits = 0, category = 0, lethal = false, label = "" } = {}) {
  const message = game.messages.get(messageId);
  const attack = message ? foundry.utils.deepClone(message.getFlag(FLAG, "attack")) : null;
  if ( !attack?.wound ) return "";
  if ( (attack.targets ?? []).some(t => (t.damage !== null) && (t.damage !== undefined)) ) {
    ui.notifications?.warn(L("DBU.Wound.DamageApplied"));
    return "";
  }
  if ( !message.isOwner ) {
    const { emitGM } = await import("../socket.mjs");
    return emitGM("attackWoundBump", { messageId, add, charges, crits, category, lethal, label }) ? L("DBU.Wound.Bumped", { label }) : "";
  }
  const notes = [];
  let plus = Math.floor(Number(add) || 0);
  if ( (Number(charges) || 0) > 0 ) {
    const attacker = await fromUuid(attack.attackerUuid).catch(() => null);
    const T = Number(attack.sig?.conditionT) || Number(attack.punch?.T) || attacker?.system?.top?.current || 1;
    const per = categoryToDice(attack.chargeCategory ?? 1, T);
    const formula = per.map(g => `${g.number * Math.floor(charges)}d${g.faces}`).join(" + ");
    const r = await new Roll(formula).evaluate();
    await r.toMessage({ speaker: message.speaker, flavor: `${label || L("DBU.Attack.Charges")} (+${Math.floor(charges)} ${L("DBU.Attack.ChargesShort")})` });
    plus += r.total;
    attack.charges = (attack.charges ?? 0) + Math.floor(charges);
  }
  // (crits: the attacker's Critical Result Extra Dice of that Wound Roll, rolled once more per crit)
  if ( (Number(crits) || 0) > 0 ) {
    const attacker = await fromUuid(attack.attackerUuid).catch(() => null);
    const f = attack.foundation ?? "physical";
    const groups = attacker?.system?.rolls?.wound?.[f]?.critDice ?? [];
    const formula = groups.filter(g => g?.number && g?.faces).map(g => `${g.number * Math.floor(crits)}d${g.faces}`).join(" + ");
    if ( formula ) {
      const r = await new Roll(formula).evaluate();
      await r.toMessage({ speaker: message.speaker, flavor: `${label || "Critical"} (Critical Extra Dice)` });
      plus += r.total;
    }
  }
  if ( plus ) {
    attack.wound = { ...attack.wound, total: (attack.wound.total ?? 0) + plus };
    notes.push(L("DBU.Wound.Added", { label, n: plus }));
  }
  if ( lethal ) {
    attack.lethal = true;
    attack.category = Math.max(attack.category ?? 1, 3);
    notes.push(L("DBU.Wound.Lethal", { label }));
  }
  else if ( Number(category) ) {
    attack.category = Math.clamp((attack.category ?? 1) + Math.round(Number(category)), 1, 3);
    notes.push(L("DBU.Wound.Category", { label, n: Math.round(Number(category)) }));
  }
  if ( !notes.length ) return "";
  attack.notes = [...(attack.notes ?? []), ...notes];
  await refreshAttackMessage(message, attack);
  return notes.join(" · ");
}

/**
 * CB: an attack's Strike Roll Critical Result becomes a Botch Result (an Opponent's effect: Karmic Reflection) before any
 * target defended: its Critical Extra Dice go, the attacker's Botch penalty applies, Cutting's +1 Category goes back.
 * Through the GM for a card the user does not own. @returns a text, or "".
 */
export async function critToBotchOnMessage(messageId, { label = "" } = {}) {
  const message = game.messages.get(messageId);
  const attack = message ? foundry.utils.deepClone(message.getFlag(FLAG, "attack")) : null;
  if ( !attack?.strike?.crit ) return "";
  if ( (attack.targets ?? []).some(t => t.result) ) {
    ui.notifications?.warn(L("DBU.Attack.CritBotchLate"));
    return "";
  }
  if ( !message.isOwner ) {
    return emitGM("attackCritToBotch", { messageId, label }) ? L("DBU.Attack.CritBotched", { label }) : "";
  }
  const attacker = await fromUuid(attack.attackerUuid).catch(() => null);
  const penalty = Number(attacker?.system?.rolls?.strike?.botchPenalty ?? 0) || 0;
  const critTotal = Number(attack.strikeView?.critTotal ?? 0) || 0;
  const total = Math.max(0, (attack.strike.total ?? 0) - critTotal - penalty);
  attack.strike = { ...attack.strike, total, crit: false, botch: true };
  if ( attack.strikeView ) attack.strikeView = { ...attack.strikeView, total, crit: false, botch: true, critTotal: 0 };
  if ( attackProfileEffects(attack).cutting ) attack.category = Math.max(1, (attack.category ?? 1) - 1);
  attack.notes = [...(attack.notes ?? []), L("DBU.Attack.CritBotched", { label })];
  await refreshAttackMessage(message, attack);
  return L("DBU.Attack.CritBotched", { label });
}

/**
 * FC: the end of a Final Chance: its attacker's Health Thresholds (and the Defeat) once every target of the attack is
 * resolved (a miss, its Damage applied, a Duel settled) — the active GM, on the card's updates — or at the end of its turn.
 */
export async function finalChanceOver(actor) {
  const fc = actor?.getFlag?.("dbu-rpg", "finalChance");
  if ( !fc ) return false;
  await actor.unsetFlag("dbu-rpg", "finalChance");
  await actor._processThresholds(Number(fc.oldLife) || 0, actor.system.life.value, { dbuSelfInflicted: true });
  return true;
}

export function registerFinalChanceHook() {
  Hooks.on("updateChatMessage", message => {
    if ( !game.user.isActiveGM ) return;
    const attack = message.getFlag(FLAG, "attack");
    if ( !attack?.finalChance ) return;
    const done = (attack.targets ?? []).every(t => (t.result === "miss") || (t.result === "duel")
      || ((t.result === "hit") && (t.damage !== undefined) && (t.damage !== null)));
    if ( !done ) return;
    fromUuid(attack.attackerUuid).then(a => {
      const actor = (a?.documentName === "Token") ? a.actor : a;
      if ( actor?.getFlag("dbu-rpg", "finalChance")?.messageId === message.id ) return finalChanceOver(actor);
    }).catch(console.error);
  });
}

/**
 * AG: + Soak for one row of an attack, before its Damage (Power of the Weak: an Ally pays it). Through the GM for a card
 * the user does not own. @returns a text, or "".
 */
/** F6: the cost of an allyGuard piece, paid by its giver (through the GM when this client does not own it). */
async function payGuardCost(giver, cost) {
  const T = await import("./triggers.mjs");
  for ( const c of T.parseCost(cost) ) {
    if ( c.kind !== "res" ) continue;
    const all = /^all$/i.test(String(c.amount));
    const effect = all ? "resourceSet" : "resource";
    const value = all ? 0 : -Math.max(0, Number(c.amount) || 0);
    if ( giver.isOwner ) await T.applyTriggerEffect(giver, effect, value, c.name, { label: "" });
    else emitGM("applyTrigger", { uuid: giver.uuid, effect, value, resource: c.name, options: {} });
  }
}

export async function addTargetSoak(messageId, index, value, label = "", kind = "soak") {
  const message = game.messages.get(messageId);
  const attack = message ? foundry.utils.deepClone(message.getFlag(FLAG, "attack")) : null;
  const t = attack?.targets?.[Number(index)];
  const n = Math.floor(Number(value) || 0);
  // (F5 kind "none": no Damage at all from this attack, vs.damageMax 0)
  if ( !t || (!(n > 0) && (kind !== "none")) ) return "";
  if ( (t.damage !== null) && (t.damage !== undefined) ) {
    ui.notifications?.warn(L("DBU.Damage.Already"));
    return "";
  }
  const k = ["dr", "damage", "none"].includes(kind) ? kind : "soak";
  const text = L({ soak: "DBU.Attack.TargetSoak", dr: "DBU.Attack.TargetDr", damage: "DBU.Attack.TargetLess", none: "DBU.Attack.TargetNone" }[k], { label, n, name: t.name ?? "" });
  if ( !message.isOwner ) return emitGM("attackTargetSoak", { messageId, index, value: n, label, kind: k }) ? text : "";
  t.defense = t.defense ?? { mode: "none" };
  const piece = { soak: { target: "vs.soak", value: n }, dr: { target: "vs.dr", value: n }, damage: { target: "vs.damageTaken", value: -n },
    none: { target: "vs.damageMax", value: 0 } }[k];
  t.defense.extraVs = [...(t.defense.extraVs ?? []), { ...piece, label }];
  await refreshAttackMessage(message, attack);
  return text;
}

/**
 * DD2: the attack goes back to Defense Declaration for one target (its Damage not applied yet): it may defend again
 * (no second Diminishing Defense). Through the GM for a card the user does not own. @returns a text, or "".
 */
export async function reopenDefense(messageId, index, label = "") {
  const message = game.messages.get(messageId);
  const attack = message ? foundry.utils.deepClone(message.getFlag(FLAG, "attack")) : null;
  const t = attack?.targets?.[Number(index)];
  if ( !t || !t.result ) return "";
  if ( (t.damage !== null) && (t.damage !== undefined) ) {
    ui.notifications?.warn(L("DBU.Damage.Already"));
    return "";
  }
  const text = L("DBU.Attack.Reopened", { label, name: t.name ?? "" });
  if ( !message.isOwner ) return emitGM("attackReopen", { messageId, index, label }) ? text : "";
  t.result = null;
  t.reopened = (t.reopened ?? 0) + 1;
  t.defense = null;
  attack.notes = [...(attack.notes ?? []), text];
  await refreshAttackMessage(message, attack);
  return text;
}

/**
 * DD3: cancel your own attack (an Opponent answered it with a Counter): every row without Damage misses, its Ki Points
 * (and Capacity), Action Cost and held Energy Charges come back, then the attack dialog opens against that Opponent.
 */
export async function cancelOwnAttack(messageId, { otherUuid = null, label = "" } = {}) {
  const message = game.messages.get(messageId);
  const attack = message ? foundry.utils.deepClone(message.getFlag(FLAG, "attack")) : null;
  if ( !attack || attack.nullified ) return "";
  if ( (attack.targets ?? []).some(t => (t.damage !== null) && (t.damage !== undefined)) ) {
    ui.notifications?.warn(L("DBU.Damage.Already"));
    return "";
  }
  const doc = await fromUuid(attack.attackerUuid).catch(() => null);
  const actor = (doc?.documentName === "Token") ? doc.actor : doc;
  if ( !actor?.isOwner ) return "";
  const sys = actor.system;
  const kp = (attack.dkp?.cost ? 0 : (attack.kp ?? 0)) + (attack.dkp?.wager ? 0 : Math.max(0, (attack.wager ?? 0) - (attack.lifeWager ?? 0) - (attack.finalChance ?? 0)));
  const { ignoresCapacity } = await import("./adversary.mjs");
  const update = { "system.ki.value": Math.min(sys.ki.cap ?? sys.ki.max ?? Infinity, (sys.ki.value ?? 0) + kp),
    "system.combat.actions": (sys.combat.actions ?? 0) + (attack.actionCost ?? 0),
    "system.combat.energyCharges": (sys.combat.energyCharges ?? 0) + (attack.heldCharges ?? 0) };
  if ( !ignoresCapacity(actor) ) update["system.capacity.value"] = Math.min(sys.capacity.max ?? Infinity, (sys.capacity.value ?? 0) + kp);
  await actor.update(update);
  attack.nullified = true;
  for ( const t of attack.targets ?? [] ) if ( (t.damage === null) || (t.damage === undefined) ) { t.result = "miss"; t.defense = { mode: L("DBU.Attack.Cancelled") }; }
  const text = L("DBU.Attack.CancelledText", { label, kp, charges: attack.heldCharges ?? 0 });
  attack.notes = [...(attack.notes ?? []), text];
  if ( message.isOwner ) await refreshAttackMessage(message, attack);
  else emitGM("update", { uuid: message.uuid, data: { [`flags.${FLAG}.attack`]: attack } });
  // The new attack: against the Character who countered
  if ( otherUuid ) {
    try {
      const o = await fromUuid(otherUuid);
      const oa = (o?.documentName === "Token") ? o.actor : o;
      const token = oa?.getActiveTokens?.()?.[0];
      token?.setTarget?.(true, { releaseOthers: true, groupSelection: false });
    } catch(err) { /* no target */ }
  }
  openAttackDialog(actor).catch(err => console.error("DBU | Attack dialog", err));
  return text;
}

/**
 * CS4: that attack misses you and every Ally of yours it targets (the rows without Damage). Through the GM for a card the
 * user does not own. @returns a text, or "".
 */
export async function missTeam(messageId, ownerUuid, label = "") {
  const message = game.messages.get(messageId);
  const attack = message ? foundry.utils.deepClone(message.getFlag(FLAG, "attack")) : null;
  if ( !attack ) return "";
  const text = L("DBU.Attack.MissTeam", { label });
  if ( !message.isOwner ) return emitGM("attackMissTeam", { messageId, ownerUuid, label }) ? text : "";
  const doc = await fromUuid(ownerUuid).catch(() => null);
  const owner = (doc?.documentName === "Token") ? doc.actor : doc;
  if ( !owner ) return "";
  for ( const t of attack.targets ?? [] ) {
    if ( (t.damage !== null) && (t.damage !== undefined) ) continue;
    const a = await resolveActor(t);
    if ( !a || ((a.uuid !== owner.uuid) && !versusData(owner, a).ally) ) continue;
    t.result = "miss";
    t.defense = { mode: label || "—" };
  }
  attack.notes = [...(attack.notes ?? []), text];
  await refreshAttackMessage(message, attack);
  return text;
}

/**
 * PD Attack Absorption: the absorber Parried this Energy / Magic attack away: the attacker's Urgent Wound Roll for it (its
 * Wound dice and Energy Charges, rolled here) and the absorber regains 1/2 of its Dice Score in Ki Points; with 1/5 of its
 * Max KP or more, a Power Up as an Out-of-Sequence Maneuver is offered. @returns a text, or "".
 */
export async function absorbAttackOn(messageId, absorber, { label = "", any = false, noPowerUp = false, out = {} } = {}) {
  const message = game.messages.get(messageId);
  const attack = message?.getFlag(FLAG, "attack");
  if ( !attack || !absorber?.system ) return "";
  // (F11 any: an attack of any Foundation, its own Wound Roll: Light Consumption)
  if ( !any && !["energy", "magic"].includes(attack.foundation) ) return "";
  const doc = await fromUuid(attack.attackerUuid).catch(() => null);
  const attacker = (doc?.documentName === "Token") ? doc.actor : doc;
  const w = attacker?.system?.rolls?.wound?.[attack.foundation];
  if ( !w ) return "";
  const T = attacker.system.top?.current ?? 1;
  const diceGroups = [...(w.dice ?? [])];
  const charges = Number(attack.charges) || 0;
  if ( charges > 0 ) {
    const per = categoryToDice(attack.chargeCategory ?? 1, T);
    diceGroups.push({ dice: per.map(g => ({ number: g.number * charges, faces: g.faces })), label: L("DBU.Attack.Charges") });
  }
  const parts = [...(w.parts ?? []), ...(attack.extraWound ?? []).map(x => ({ label: x.label, value: Number(x.value) || 0 }))];
  const r = await dbuRoll({ actor: attacker, kind: "wound", reactions: false, title: `${label || "Attack Absorption"} — ${attack.name}`,
    subtitle: L("DBU.Absorb.Urgent"), naturalMod: w.natural, critTarget: w.crit, botchRange: w.botch, diceGroups, parts,
    critDice: w.critDice, botchPenalty: w.botchPenalty });
  const sys = absorber.system;
  const gain = Math.max(0, Math.floor((Number(r?.total) || 0) / 2));
  const before = sys.ki.value ?? 0;
  const after = Math.min(sys.ki.cap ?? sys.ki.max ?? Infinity, before + gain);
  await absorber.update({ "system.ki.value": after }, { dbuSource: "trigger" });
  const text = L("DBU.Absorb.Gained", { n: after - before, total: r?.total ?? 0 });
  out.gained = after - before;
  if ( !noPowerUp && ((after - before) >= Math.ceil((sys.ki.max ?? 0) / 5)) ) {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: label || "Attack Absorption" },
      content: `<p>${foundry.utils.escapeHTML(L("DBU.Absorb.PowerUp"))}</p>` }).catch(() => false);
    if ( ok ) await absorber.useOutOfSequence?.("powerUp");
  }
  return text;
}

/**
 * E2 Petite Genius: the target of the attack (fromUuid) swaps places with an adjacent willing Ally (toUuid), who becomes
 * the attack's target on its row (no defense rolled yet). Through the GM for what the user cannot change.
 */
export async function swapAttackTarget(messageId, fromActorUuid, toActorUuid) {
  const message = game.messages.get(messageId);
  const attack = message ? foundry.utils.deepClone(message.getFlag(FLAG, "attack")) : null;
  if ( !attack ) return "";
  const asActor = d => (d?.documentName === "Token") ? d.actor : d;
  const from = asActor(await fromUuid(fromActorUuid).catch(() => null));
  const to = asActor(await fromUuid(toActorUuid).catch(() => null));
  if ( !from || !to ) return "";
  const row = (attack.targets ?? []).find(t => !t.result && ((t.actorUuid === from.uuid) || (t.tokenUuid && from.getActiveTokens?.().some(k => k.document.uuid === t.tokenUuid))));
  if ( !row ) return "";
  if ( !message.isOwner && !game.user.isGM ) {
    return emitGM("swapAttackTarget", { messageId, fromUuid: fromActorUuid, toUuid: toActorUuid }) ? L("DBU.Attack.Swapped", { name: from.name, ally: to.name }) : "";
  }
  const ft = from.getActiveTokens?.()?.[0]?.document;
  const tt = to.getActiveTokens?.()?.[0]?.document;
  if ( ft && tt && (ft.parent === tt.parent) ) {
    const a = { x: ft._source.x, y: ft._source.y };
    const b = { x: tt._source.x, y: tt._source.y };
    await ft.parent.updateEmbeddedDocuments("Token", [{ _id: ft.id, ...b }, { _id: tt.id, ...a }]);
  }
  Object.assign(row, { tokenUuid: tt?.uuid ?? null, actorUuid: to.uuid, name: to.name, img: tt?.texture?.src ?? to.img });
  attack.notes = [...(attack.notes ?? []), L("DBU.Attack.Swapped", { name: from.name, ally: to.name })];
  await refreshAttackMessage(message, attack);
  return L("DBU.Attack.Swapped", { name: from.name, ally: to.name });
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
  // The Versus layer (rules/versus.mjs): the defender's vs pieces against this attacker, the attacker's against it
  const attacker = await fromUuid(attack.attackerUuid);
  const defMods = versusMods(actor);
  const atkMods = attacker ? versusMods(attacker) : [];
  const critStrike = attack.strike?.crit ? 1 : 0;
  // (@punchDown / @punchUp: this pair's Punching Down / Up)
  // (PA attackId: this attack's card, for the per-attack limits)
  const vsScope = (hit, def = { mode }) => ({ ...attackScope(attack), ...defendVars(def), hit: hit ? 1 : 0, critStrike, attackId: message.id,
    ...pairPunch(attack, actor) });
  const rollScope = { ...attackScope(attack), critStrike };
  // The attacker's vs.strike / vs.combat against this defender: added to its Strike for this pair only
  const atkStrike = attacker && atkMods.length ? versusPieces(attacker, actor, vsScope(false), { targets: VS_ATTACK_STRIKE, side: "attacker",
    mods: atkMods, limits: false }).filter(p => usableOnAttack(attacker, attack, p)) : [];
  const atkResolved = atkStrike.length ? chosenPieces(autoChosen(attacker, atkStrike, atkStrike[0].scope)) : [];
  const strikeVs = atkResolved.reduce((t, p) => t + (Number(p.value) || 0), 0);
  // Divine Flex (God Maneuver): 2(bT) Divine Ki Points, only in the God Ki State
  if ( (mode === "divineFlex") && !sys.dkp?.usable ) return ui.notifications.warn(L("DBU.Dkp.ErrState"));
  const rec = { mode, total: 0, natural: null, crit: false };
  if ( strikeVs ) Object.assign(rec, { strikeVs, strikeVsTotal: strike + strikeVs });
  if ( atkResolved.some(p => p.limit) ) rec.vsAtk = atkResolved.filter(p => p.limit).map(p => ({ key: p.useKey, limit: p.limit, ctx: p.ctx ?? {} }));
  const update = {};
  // Effects that Defend without a Counter Action, or Guard without its Ki Point Cost (defense.freeCounter / freeKp)
  // (their conditions see @vs: the attacker)
  const freeCounter = usesCounter ? await freeDefense(actor, attack, mode, "defense.freeCounter", null, attacker) : null;
  const freeKp = (mode === "guard") ? await freeDefense(actor, attack, mode, "defense.freeKp", freeCounter?.key, attacker) : null;
  const freeLines = [];
  for ( const free of [freeCounter, freeKp].filter(Boolean) ) {
    freeLines.push(L((free === freeCounter) ? "DBU.Defense.FreeCounter" : "DBU.Defense.FreeKp", { label: free.label }));
  }
  if ( freeCounter ) rec.freeCounter = freeCounter.label;
  if ( freeKp ) rec.freeKp = freeKp.label;
  // (DC: the effect that waived the Counter Action, for @waivedFx.<ref>)
  if ( freeCounter?.fx ) rec.waivedFx = freeCounter.fx;
  // Before the roll: the defender's pieces for its roll or its cost (vs.dodge, vs.defenseValue, vs.strike, vs.combat,
  // vs.guardKp, vs.guardNoCharges); one dialog only when one of them is asked (none for a Guard without its KP cost)
  const preTargets = ((mode === "guard") && freeKp) ? [] : (VS_PRE[mode] ?? []);
  const pre = await versusChoose(actor, attacker, preTargets, vsScope(false, rec), defMods, attack.name, L("DBU.Versus.AskPre"));
  // DC: the groups chosen before the roll, seen by the pieces once hit and by the events after it (@defChose.<group>)
  { const dc = choseVars(pre.chosen); if ( Object.keys(dc).length ) rec.defChose = dc; }
  const preSum = target => pre.applied.filter(p => p.target === target).reduce((t, p) => t + (Number(p.value) || 0), 0);
  const preParts = targets => pre.applied.filter(p => targets.includes(p.target)).map(p => ({ label: versusLabel(p), value: Number(p.value) || 0 }));

  if ( usesCounter && !freeCounter ) {
    if ( (sys.combat.counters ?? 0) < 1 ) ui.notifications.warn(L("DBU.Defense.NoCounter"));
    if ( (sys.buckets?.["flag.noCounterManeuver"]?.total ?? 0) > 0 ) ui.notifications.warn(L("DBU.F13.NoCounterManeuver", { name: actor.name }));
    update["system.combat.counters"] = Math.max(0, (sys.combat.counters ?? 0) - 1);
  }

  let hit = true;
  const auto = attack.autoHit || sys.effectiveConditions.sleeping;
  if ( mode === "dodge" || mode === "crossCounter" ) {
    const d = sys.rolls.dodge;
    const parts = [...d.parts];
    // (T25 "flag.crossCounterFullDv": no Defense Value lost, Unpredictable Combat 1)
    if ( (mode === "crossCounter") && !flagOn(sys, "crossCounterFullDv") ) {
      parts.push({ label: "Cross Counter (½ DV)", value: -Math.ceil(sys.aptitudes.defenseValue / 2) });
    }
    parts.push(...preParts(["vs.dodge", "vs.defenseValue", "vs.combat"]));
    const r = await dbuRoll({
      actor, kind: "dodge", other: attacker ?? null, title: `${L("DBU.Roll.Dodge")} — ${actor.name}`, subtitle: L("DBU.Defense.Against", { name: attack.name, total: strike + strikeVs }),
      naturalMod: d.natural, critTarget: d.crit, botchRange: d.botch, diceGroups: d.dice, parts,
      critDice: d.critDice, botchPenalty: d.botchPenalty, scope: rollScope
    });
    rec.total = r.total; rec.natural = r.natural; rec.crit = r.crit;
    hit = auto || (strike + strikeVs > r.total);
  }
  else if ( mode === "parry" ) {
    const s = sys.rolls.strike;
    const parts = [...s.parts, { label: L("DBU.Foundation.physical"), value: sys.rolls.strike_physical ?? 0 }];
    if ( attack.charges ) parts.push({ label: L("DBU.Attack.Charges"), value: -attack.charges * bT });
    if ( sys.effectiveConditions.guardDown ) parts.push({ label: L("DBU.Condition.guardDown"), value: -2 * T });
    parts.push(...preParts(["vs.strike", "vs.combat"]));
    const r = await dbuRoll({
      actor, kind: "strike", other: attacker ?? null, title: `Parry — ${actor.name}`, subtitle: L("DBU.Defense.Against", { name: attack.name, total: strike + strikeVs }),
      naturalMod: s.natural, critTarget: s.crit, botchRange: s.botch, diceGroups: s.dice, parts,
      critDice: s.critDice, botchPenalty: s.botchPenalty, scope: rollScope
    });
    rec.total = r.total; rec.natural = r.natural; rec.crit = r.crit;
    hit = auto || (strike + strikeVs > r.total);
  }
  else if ( (mode === "guard") && freeKp ) {
    rec.cost = 0;
    hit = true;
  }
  else if ( mode === "guard" ) {
    // vs.guardNoCharges: the Energy Charges add no Ki Points; vs.guardKp: ± Ki Points of this Guard
    const extra = pre.applied.some(p => (p.target === "vs.guardNoCharges") && p.value) ? 0 : Math.min(attack.charges, 4) * bT;
    const cost = Math.max(0, Math.ceil((sys.costs.guard + extra + preSum("vs.guardKp")) * sys.costs.guardMultiplier));
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

  // HM: Homing: a missed Opponent (after its Dodge / Parry roll): the attacker's Strike Roll again, up to the Advantage's
  // ranks, +1(T) per miss so far, against the same defense (still one attack: no more Diminishing Defense)
  let strikeEff = strike;
  if ( !hit && attack.homing && attacker && ["dodge", "parry", "crossCounter"].includes(mode) ) {
    const H = attack.homing;
    const tries = [];
    for ( let i = 1; i <= H.ranks; i++ ) {
      const r = await dbuRoll({ ...H.cfg, actor: attacker, kind: "strike", other: actor, reactions: false,
        title: `${L("DBU.Attack.Homing")} — ${attack.name}`, subtitle: L("DBU.Defense.Against", { name: actor.name, total: rec.total }),
        parts: [...(H.cfg.parts ?? []), { label: L("DBU.Attack.HomingBonus", { n: i }), value: i * (H.T || 1) }], scope: rollScope });
      tries.push(r.total);
      if ( r.total + strikeVs > rec.total ) {
        hit = true;
        strikeEff = r.total;
        break;
      }
    }
    rec.homing = tries.join(" → ");
  }

  // Once hit: the defender's pieces for the Damage (vs.soak, vs.dr, vs.categoryTaken, vs.categorySet, vs.damageTaken,
  // vs.damageMult, vs.ignoreDamageBelow, vs.damageMax), vs.autoDodge (the hit becomes a miss) and vs.redodge (after a
  // Dodge or no defense: the Dodge again, with the bonus)
  let post = { applied: [], chosen: [], plan: null };
  if ( hit && defMods.length ) {
    const targets = VS_HIT.filter(k => (k !== "vs.redodge") || ["dodge", "none"].includes(mode));
    post = await versusChoose(actor, attacker, targets, vsScope(true, rec), defMods, attack.name, L("DBU.Versus.AskHit"));
    const redodge = post.applied.filter(p => p.target === "vs.redodge").reduce((t, p) => t + (Number(p.value) || 0), 0);
    // vs.autoDodge: a miss (2+: an Absolute Attack's half Wound does not apply either); only that piece is paid and counted
    const autoDodge = post.applied.filter(p => (p.target === "vs.autoDodge") && ((Number(p.value) || 0) > 0));
    if ( autoDodge.length ) {
      hit = false;
      rec.autoDodge = autoDodge.map(p => versusLabel(p)).join(", ");
      if ( autoDodge.some(p => Number(p.value) >= 2) ) rec.noAbsolute = true;
      post.chosen = post.chosen.map(c => ({ ...c, pieces: c.pieces.filter(p => p.target === "vs.autoDodge") })).filter(c => c.pieces.length);
      post.plan = optionCostPlan(actor, post.chosen);
    }
    else if ( redodge && !auto ) {
      const d = sys.rolls.dodge;
      const parts = [...d.parts, ...((mode === "dodge") ? preParts(["vs.dodge", "vs.defenseValue", "vs.combat"]) : []),
        { label: L("DBU.Versus.Redodge"), value: redodge }];
      const r = await dbuRoll({
        actor, kind: "dodge", other: attacker ?? null, title: `${L("DBU.Versus.Redodge")} — ${actor.name}`, subtitle: L("DBU.Defense.Against", { name: attack.name, total: strikeEff + strikeVs }),
        naturalMod: d.natural, critTarget: d.crit, botchRange: d.botch, diceGroups: d.dice, parts,
        critDice: d.critDice, botchPenalty: d.botchPenalty, scope: rollScope
      });
      rec.redodge = r.total;
      if ( !(strikeEff + strikeVs > r.total) ) {
        hit = false;
        rec.total = r.total; rec.natural = r.natural; rec.crit = r.crit;
        // A miss now: the Damage pieces picked with it never apply, so only vs.redodge is paid and counted
        post.chosen = post.chosen.map(c => ({ ...c, pieces: c.pieces.filter(p => p.target === "vs.redodge") }))
          .filter(c => c.pieces.length);
        post.plan = optionCostPlan(actor, post.chosen);
      }
    }
    // (the pieces counted only when they change the Damage keep their limit: computeDamage says when they did)
    { const dc = { ...(rec.defChose ?? {}), ...choseVars(post.chosen) }; if ( Object.keys(dc).length ) rec.defChose = dc; }
    if ( hit ) rec.vs = post.applied.filter(p => p.target !== "vs.redodge").map(p => ({ target: p.target, value: p.value, label: versusLabel(p),
      ...((VS_DEFERRED.has(p.target) && !blank(p.limit)) ? { limit: p.limit, key: p.useKey, ctx: p.ctx ?? {} } : {}) }));
  }

  // Diminishing Defense: only when no Defend Maneuver was used (none again when the attack applied it as it was made);
  // x the attack's attack.dimDefense.mult; flag.dimDefenseFirstFree ignores the first stack from each attacker per Round
  // vs.noDimDefense (asked before the roll): none from this attack
  const noDim = pre.applied.filter(p => (p.target === "vs.noDimDefense") && ((Number(p.value) || 0) > 0));
  if ( noDim.length ) rec.noDim = noDim.map(p => versusLabel(p)).join(", ");
  if ( !usesCounter && ((target.dimDeclared ?? null) === null) && !noDim.length && !target.reopened ) {
    const mult = attack.ext?.dimMult ?? 1;
    if ( (mult === 1) && !flagOn(sys, "dimDefenseFirstFree") ) {
      let stacks = sys.dimDefensePerAttack;
      update["system.combat.dimDefense"] = (sys.combat.dimDefense ?? 0) + stacks;
      rec.dim = stacks;
    }
    else {
      const gain = dimDefenseGain(actor, attacker, sys.dimDefensePerAttack, mult);
      Object.assign(update, gain.update);
      rec.dim = gain.stacks;
    }
  }
  if ( Object.keys(update).length ) await actor.update(update);
  // The vs pieces' costs and uses (after the defense's own); the pieces show on the rolls and in the Damage breakdown
  const vsLines = [];
  // (a limitKey shared by a piece before the roll and one once hit counts once for this defense)
  const countedKeys = [];
  for ( const step of [pre, post] ) {
    if ( !step.chosen.length ) continue;
    if ( step.plan && !step.plan.empty ) {
      const paid = await payOptions(actor, step.chosen, { plan: step.plan });
      if ( paid.text ) vsLines.push(L("DBU.Trigger.Paid", { cost: paid.text }));
    }
    // (not the ones counted when they change the Damage: VS_DEFERRED)
    const counting = step.chosen.map(c => ({ ...c, pieces: c.pieces.filter(p => !VS_DEFERRED.has(p.target)) }));
    await countOptionLimits(actor, counting, { skip: countedKeys, attackId: message.id });
    countedKeys.push(...chosenPieces(counting).filter(p => !blank(p.limit)).map(p => p.useKey));
  }
  if ( vsLines.length ) await postInfoCard({ actor, title: attack.name, subtitle: L("DBU.Versus.Title"), lines: vsLines });
  // The uses of the limited ones (one per trait, even when it waived both)
  if ( freeCounter || freeKp ) {
    const { useTriggerLimit } = await import("./triggers.mjs");
    const used = new Map([freeCounter, freeKp].filter(f => f?.limit).map(f => [f.key, f]));
    for ( const f of used.values() ) await useTriggerLimit(actor, { limit: f.limit, ctx: f.ctx }, f.key);
    // Their costs (cost), now that the defense's own update is done (it would overwrite a payment made before it)
    const { payTriggerCost } = await import("./triggers.mjs");
    for ( const f of [freeCounter, freeKp] ) {
      if ( !f?.plan || f.plan.empty ) continue;
      const paid = await payTriggerCost(actor, f.plan);
      if ( paid ) freeLines.push(L("DBU.Trigger.Paid", { cost: paid }));
    }
    await postInfoCard({ actor, title: attack.name, subtitle: `Defend: ${DEFEND_LABELS[mode] ?? mode}`, lines: freeLines });
  }

  const result = { hit, defense: rec };
  // RA "untilDefended": what lasted until this Character's next defense ends now (a Guard Down only against that attack)
  if ( actor.isOwner ) { const { expireTimed } = await import("./triggers.mjs"); await expireTimed(actor, "defended").catch(() => null); }
  if ( !hit ) {
    const { fireEvent } = await import("./triggers.mjs");
    // The Defend variables (@dodge..., @counter, @defenseCrit) and @vs (the other Character of the pair)
    const scope = { ...attackScope(attack), ...defendVars(rec), [mode]: 1, ...pairPunch(attack, actor),
      // CC: every target of the attack has now missed (@missedAll)
      missedAll: (attack.targets ?? []).every((x, i) => (i === index) || (x.result === "miss")) ? 1 : 0, messageId: message.id };
    if ( attacker ) fireEvent(attacker, "attackMissed", { other: actor, scope: { ...scope, vs: versusData(attacker, actor) } });
    fireEvent(actor, "dodged", { other: attacker, scope: { ...scope, vs: versusData(actor, attacker) } });
    // CS1 "allyDodged": an attack missed an Ally of yours (other = the attacker; @allyDistance)
    try {
      const { encounterOthers } = await import("../rules/allies.mjs");
      const { collectTriggers } = await import("./triggers.mjs");
      for ( const o of encounterOthers(actor) ) {
        if ( !o.ally || !collectTriggers(o.actor, "allyDodged").length ) continue;
        fireEvent(o.actor, "allyDodged", { other: attacker, scope: { ...scope, allyDistance: o.distance ?? 99, vs: versusData(o.actor, attacker) } });
      }
    } catch(err) { console.warn("DBU | allyDodged", err); }
  }
  if ( message.isOwner ) await resolveDefenseOnMessage(message.id, index, result);
  else if ( !emitGM("attackResult", { messageId: message.id, targetIndex: index, result }) ) {
    await postInfoCard({ actor, title: hit ? L("DBU.Defense.Hit") : L("DBU.Defense.Miss"), lines: [attack.name] });
  }
  // DD3 "attackCountered": a Defend option with a Counter Action (Parry, Guard, Cross Counter...) answered the attack
  if ( usesCounter && attacker ) {
    const { fireEvent } = await import("./triggers.mjs");
    fireEvent(attacker, "attackCountered", { other: actor, scope: { ...attackScope(attack), [mode]: 1, hit: hit ? 1 : 0,
      messageId: message.id, targetIndex: index, vs: versusData(attacker, actor) } });
  }
  // AG "wasHit": the defense ended in a hit, before the Damage (its Allies: "allyWasHit"); the card and the row go with it
  if ( hit ) {
    const { fireEvent } = await import("./triggers.mjs");
    fireEvent(actor, "wasHit", { other: attacker, scope: { ...attackScope(attack), ...defendVars(rec), [mode]: 1, ...pairPunch(attack, actor),
      messageId: message.id, targetIndex: index, vs: versusData(actor, attacker) } });
  }
  return result;
}

const DEFEND_LABELS = { parry: "Parry", guard: "Guard", directHit: "Direct Hit", crossCounter: "Cross Counter",
  powerFlare: "Power Flare", divineFlex: "Divine Flex" };

/** The label of a vs piece ("Trait — piece"). */
const versusLabel = p => ((p.own && (p.own !== p.label)) ? `${p.label} — ${p.own}` : (p.label ?? ""));
const signedText = v => ((typeof v === "number") && (v > 0) ? `+${v}` : `${v}`);
const targetLabel = t => L(DBU.modifierTargets[t] ?? t);

/**
 * The defender's vs pieces of one step of its defense: the automatic ones, and the asked ones it picks in one dialog
 * (none when nothing is asked). Their costs are checked now (a box whose cost cannot be paid is left out) and paid by
 * the caller (payOptions) with their uses (countOptionLimits).
 * @returns {Promise<{applied: object[], chosen: object[], plan: object|null}>}
 */
async function versusChoose(actor, other, targets, scope, mods, title, hint) {
  const none = { applied: [], chosen: [], plan: null };
  if ( !targets.length || !mods.length ) return none;
  const pieces = versusPieces(actor, other, scope, { targets, mods });
  if ( !pieces.length ) return none;
  const sc = pieces[0].scope;
  let chosen = await optionDialog(pieces, { title, hint, actor, scope: sc });
  if ( chosen === null ) chosen = autoChosen(actor, pieces, sc);
  // (PA "+after:<key>": a box that needs that other piece, ticked with it or already used for this attack)
  {
    const { afterKeyOf, sameAttackUse } = await import("./triggers.mjs");
    const ticked = new Set(chosenPieces(chosen).map(p => p.useKey));
    const lacks = p => { const a = afterKeyOf(p.useKey); return a && !ticked.has(a) && !sameAttackUse(actor, a, scope.attackId); };
    const bad = chosenPieces(chosen).filter(lacks);
    if ( bad.length ) {
      ui.notifications.warn(L("DBU.Trigger.NeedsFirst", { label: bad.map(p => p.label).join(", ") }));
      chosen = chosen.map(c => ({ ...c, pieces: c.pieces.filter(p => !lacks(p)) })).filter(c => c.pieces.length);
    }
  }
  let plan = optionCostPlan(actor, chosen, sc);
  if ( plan.problems.length ) {
    ui.notifications.warn(L("DBU.Attack.OptionCantPay", { why: plan.problems.join(" ") }));
    chosen = chosen.filter(c => !c.pieces.some(p => !blank(p.cost)));
    plan = optionCostPlan(actor, chosen, sc);
  }
  return { applied: chosenPieces(chosen), chosen, plan };
}

/**
 * Can an attacker's vs piece apply to this attack? Not one with a cost or an amount (nothing pays it on the attacker's
 * side); a limited one with uses left, or already counted for this attack.
 */
function usableOnAttack(attacker, attack, p) {
  if ( !attackerSidePiece(p) ) return false;
  if ( blank(p.limit) || (attack.vsUsed ?? []).includes(p.useKey) ) return true;
  return triggerUsesLeftNow(attacker, { limit: p.limit, ctx: p.ctx }, p.useKey);
}

/**
 * An effect of the defender that waives a cost of its Defend option: `target` "defense.freeCounter" (no Counter Action)
 * or "defense.freeKp" (a Guard with no Ki Point Cost). Its condition sees the Defend option chosen (@parry, @guard,
 * @directHit, @crossCounter, @powerFlare, @dodge) and the attack's variables; mode "ask" asks first; a limit (1/Round...)
 * counts per trait (key "def|<item>|<label>", shared by both targets of one trait).
 * @param {string} [prefer]  The key of the trait that already waived the Counter Action (it covers the Ki too, unasked)
 * @param {Actor} [attacker]  Package F: @vs in their conditions (the attacker: "against a Studied Opponent's attack")
 * @returns {Promise<{key, label, limit, ctx}|null>}
 */
async function freeDefense(actor, attack, mode, target, prefer = null, attacker = null) {
  let mods = [];
  try { mods = withOptionFields(actor, collectModifiers(actor, actor.system).filter(m => m.target === target)); }
  catch(err) { return null; }
  if ( !mods.length ) return null;
  const { triggerUsesLeft, costPlan } = await import("./triggers.mjs");
  const data = { ...(actor.system.rollData ?? {}) };
  const scope = { ...attackScope(attack), [mode]: 1, vs: versusData(actor, attacker), defending: 1, ...pairPunch(attack, actor) };
  const found = [];
  for ( const m of mods ) {
    const sc = { ...data, ...(m.ctx ?? {}), ...scope };
    if ( !test(m.condition, sc) || !evaluate(m.value, sc) ) continue;
    const label = (m.own && (m.own !== m.label)) ? `${m.label} — ${m.own}` : m.label;
    const key = blank(m.limitKey) ? `def|${m.label}|${m.own || ""}` : String(m.limitKey).trim();
    if ( m.limit && !triggerUsesLeft(actor, { limit: m.limit, ctx: m.ctx }, key) ) continue;
    // A cost (rules/options.mjs): paid when the waiver is used; one that cannot be paid is left out
    const plan = blank(m.cost) ? null : costPlan(actor, [{ cost: m.cost, data: { ...sc, n: 1 } }]);
    if ( plan?.problems.length ) continue;
    found.push({ key, label, limit: m.limit, ctx: m.ctx, ask: m.mode === "ask", plan, fx: String(m.fx ?? "").toLowerCase() });
  }
  const same = prefer ? found.find(f => f.key === prefer) : null;
  // (the same trait waiving both: its cost is the Counter's, paid once)
  if ( same ) return { ...same, plan: null };
  // The automatic ones first; a declined trait is not asked again. The cost (plan) is paid by rollDefense once the
  // defense's own update is done
  const declined = new Set();
  for ( const f of [...found.filter(x => !x.ask), ...found.filter(x => x.ask)] ) {
    if ( !f.ask ) return f;
    if ( declined.has(f.key) ) continue;
    declined.add(f.key);
    const cost = (f.plan && !f.plan.empty) ? ` (${L("DBU.Attack.OptionCost", { cost: f.plan.text })})` : "";
    const ok = await DialogV2.confirm({ window: { title: f.label }, rejectClose: false,
      content: `<p>${esc(L((target === "defense.freeKp") ? "DBU.Defense.FreeKpAsk" : "DBU.Defense.FreeCounterAsk", { label: f.label }) + cost)}</p>` });
    if ( ok ) return f;
  }
  return null;
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
  t.dimApplied = !!t.dimDeclared || !!result.defense?.dim;
  // The attacker's limited vs.strike / vs.combat pieces that applied to this defense, hit or miss: one use per attack
  // (counted here, by the card's author or the GM; the Damage skips the keys already counted)
  if ( result.defense?.vsAtk?.length ) {
    const attacker = await fromUuid(attack.attackerUuid);
    const used = await countAttackVersus(attacker, attack, result.defense.vsAtk);
    if ( used.length ) attack.vsUsed = [...new Set([...(attack.vsUsed ?? []), ...used])];
  }
  // attack.state: left once every target of the card is resolved
  if ( attack.ext?.enteredStates?.length && allResolved(attack) ) await leaveAttackStates(attack);
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
  // M2: what other effects added to this attack's Wound Roll before it was rolled ("attackWound": United Attack...)
  for ( const x of attack.extraWound ?? [] ) add(x.label, Number(x.value) || 0);
  // The attack options offered now (at: "wound"): they see @hits / @missed (the targets hit or missed so far),
  // @critStrike, @punchDown... and @vsMax / @vsMin / @vsAny / @vsCount over the targets hit; a dialog only for the asked
  // ones, their costs paid and their uses counted now (a miss spends nothing)
  const critStrike = attack.strike?.crit ? 1 : 0;
  const woundOpts = await woundOptions(actor, attack, critStrike);
  const wsum = target => woundOpts.filter(p => p.target === target).reduce((t, p) => t + (Number(p.value) || 0), 0);
  // Energy Charges and their Dice Category, with the ones added as it hits (attack.charges / attack.chargeCategory at wound)
  const charges = (attack.charges ?? 0) + wsum("attack.charges");
  const chargeCategory = (attack.chargeCategory ?? 1) + wsum("attack.chargeCategory");
  let dmgAttr = w.damageAttribute;
  // Another Damage Attribute (an attack option picked in the dialog) takes the place of FO / MA
  const dmgKey = attack.damageAttribute;
  if ( dmgKey && (dmgKey !== defaultDamageAttribute(f)) ) {
    const value = damageAttributeValue(actor, dmgKey);
    const label = `${damageAttributeLabel(dmgKey)} (${L("DBU.Attack.DamageAttribute")})`;
    const i = parts.findIndex(p => (p.label === L(DBU.attributes[defaultDamageAttribute(f)])) && (p.value === dmgAttr));
    if ( i >= 0 ) parts.splice(i, 1, { label, value });
    else add(label, value - dmgAttr);
    dmgAttr = value;
  }

  add("Ki Wager", attack.wager);
  if ( attack.ballistic ) {
    add(L("DBU.Attack.BallisticNoAttr"), -dmgAttr);
    add("Caliber", attack.caliber);
  }
  for ( const p of fx.list ) {
    if ( p.extraDamageAttribute ) add(`${p.label} (+${L("DBU.Attack.DamageAttribute")})`, dmgAttr * p.extraDamageAttribute);
  }
  if ( attack.sig?.superProfile === "annihilation" ) add("Complete Annihilation", dmgAttr);
  if ( attack.genkiWound ) add("Genki", attack.genkiWound);
  if ( attack.chargeWound ) add("Charging Assault", attack.chargeWound);
  if ( attack.splitWound ) add("Splitting", attack.splitWound);
  // attack.damageAttrTimes: the Damage Attribute that many more times (at declaration and as it hits)
  const attrTimes = (attack.ext?.damageAttrTimes ?? 0) + wsum("attack.damageAttrTimes");
  if ( attrTimes && !attack.ballistic ) add(L("DBU.Attack.DamageAttrTimes", { n: attrTimes }), dmgAttr * attrTimes);
  if ( attack.sig?.lowPowerCrush ) add("Low-Power Crush", -Math.ceil(dmgAttr / 2));
  if ( attack.sig ) {
    add(L("DBU.Sig.PowerShot"), attack.sig.woundT * T);
    // (a Basic Attack has attack.sig only for the Advantages effects added to it: F2)
    if ( attack.signatureId ) add(attack.name, sys.buckets["wound.signature"]?.total ?? 0);
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
  if ( fx.has("megaFlare") ) add("Mega Flare", charges * T);
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
  for ( const o of attack.optionWound ?? [] ) add(o.label, o.value);

  // Energy Charges: 1d6(T) each, d8 for Signatures (Charged Up), plus any category increases
  const diceGroups = [...w.dice];
  if ( charges > 0 ) {
    const perCharge = categoryToDice(chargeCategory, T);
    const dice = perCharge.map(g => ({ number: g.number * charges, faces: g.faces }));
    diceGroups.push({ dice, label: L("DBU.Attack.Charges") });
  }

  // Glass: +1(T) Wound for every 2 Energy Charges; Barrier Blow: 1/4 of the Might and the Base Die once more
  if ( fx.glass ) add("Glass", Math.floor(charges / 2) * T);
  if ( fx.barrierBlow ) add("Barrier Blow (¼ Might)", Math.ceil(sys.aptitudes.might / 4));

  // Punching Down: its Extra Dice (1d6(T), + its Dice Categories, n more times) when it applies to a target not missed;
  // computeDamage leaves them out of the Damage of a target it does not apply to (their total: wound.punchDown)
  if ( attack.punch ) {
    const live = (await Promise.all(attack.targets.filter(t => t.result !== "miss").map(t => resolveActor(t).catch(() => null)))).filter(Boolean);
    if ( live.some(a => punchOf(attack.punch, a).down) ) {
      for ( let k = 0; k <= (attack.punch.times ?? 0); k++ ) diceGroups.push({ dice: categoryToDice(2 + (attack.punch.category ?? 0), T), label: PUNCH_DICE });
    }
  }
  for ( const p of woundOpts.filter(o => o.target === "attack.wound") ) add(pieceLabelOf(p), Number(p.value) || 0);
  // attack.greaterDice: +n times the Greater Dice of your ToP, even without flag.greaterDice
  const greater = (attack.ext?.greaterDice ?? 0) + wsum("attack.greaterDice");
  for ( let k = 0; k < greater; k++ ) {
    const cat = greaterDiceCategory(T) + (sys.buckets?.["greaterDice.category"]?.total ?? 0);
    if ( cat > 0 ) diceGroups.push({ dice: categoryToDice(cat), label: "Greater" });
  }
  // Attack options: the Critical Target (Cutting keeps its 5; attack.critSet.wound sets it, the lowest wins) and the
  // Natural Result of this Wound Roll
  let critTarget = fx.cutting ? 5 : critWith(w.crit, (attack.woundCrit ?? 0) + wsum("attack.crit.wound"));
  const setWound = [attack.ext?.critSetWound, ...woundOpts.filter(o => o.target === "attack.critSet.wound").map(o => Number(o.value))]
    .filter(Number.isFinite);
  if ( setWound.length ) critTarget = Math.min(critTarget, ...setWound);
  // (the Characters it may hit: the other Character of the roll)
  const woundTargets = (await Promise.all((attack.targets ?? []).filter(t => t.result !== "miss").map(t => resolveActor(t).catch(() => null)))).filter(Boolean);
  const result = await dbuRoll({
    actor, kind: "wound", other: woundTargets[0] ?? null, others: woundTargets, title: `${L("DBU.Roll.Wound")} — ${attack.name}`,
    subtitle: `${L(DBU.damageCategories[Math.clamp(attack.category, 1, 3)])} · ${charges} ${L("DBU.Attack.ChargesShort")}`,
    naturalMod: w.natural + (attack.woundNatural ?? 0) + wsum("attack.natural.wound"), critTarget, botchRange: w.botch, diceGroups, parts,
    critDice: w.critDice, botchPenalty: w.botchPenalty,
    extraBaseDie: fx.barrierBlow, extraBaseDieLabel: "Barrier Blow (Base Die)",
    twin: (attack.sig?.twinLinked === "wound") ? "high" : ((attack.sig?.deadLink === "wound") ? "low" : null),
    toMessage: true,
    flags: { attackMessageId: message.id },
    scope: { ...attackScope(attack), critStrike }
  });
  const wound = {
    total: result.total, natural: result.natural, crit: result.crit, botch: result.botch,
    messageId: result.message?.id ?? null
  };
  const punchDice = (result.extra ?? []).filter(e => e.label === PUNCH_DICE).reduce((t, e) => t + (Number(e.total) || 0), 0);
  if ( punchDice ) wound.punchDown = punchDice;
  // What the Wound-time options change on the card: the Damage Category, Soak and Damage Reduction ignored
  if ( woundOpts.length ) {
    const patch = {};
    const cat = wsum("attack.category");
    if ( cat ) patch.category = attack.category + cat;
    const soak = Math.max(0, ...woundOpts.filter(o => o.target === "attack.ignoreSoak").map(o => Number(o.value) || 0));
    if ( soak > (attack.ext?.ignoreSoak ?? 0) ) patch.ignoreSoak = Math.min(1, soak);
    const dr = Math.max(0, ...woundOpts.filter(o => o.target === "attack.ignoreDR").map(o => Number(o.value) || 0));
    if ( dr > (attack.ignoreDR ?? 0) ) patch.ignoreDR = Math.min(1, dr);
    if ( charges !== (attack.charges ?? 0) ) patch.charges = charges;
    if ( chargeCategory !== (attack.chargeCategory ?? 1) ) patch.chargeCategory = chargeCategory;
    patch.notes = [...woundOpts.map(p => optionText(p)), ...(woundOpts.paidText ? [L("DBU.Trigger.Paid", { cost: woundOpts.paidText })] : [])];
    wound.patch = patch;
  }
  // RX: the reactions of the Wound Roll and what they spent
  if ( result.rollSpent ) wound.rollSpent = result.rollSpent;
  if ( message.isOwner ) await storeWoundOnMessage(message.id, wound);
  else emitGM("attackWound", { messageId: message.id, wound });
  // AA "woundRolled": its result for the effects that change it afterwards (woundAdd / woundCategory, @messageId);
  // a Super Critical is a Natural Result of 10
  {
    const { fireEvent } = await import("./triggers.mjs");
    fireEvent(actor, "woundRolled", { other: woundTargets[0] ?? null, scope: { ...attackScope(attack), critStrike,
      rollSpent: { strike: attack.rollSpent?.strike ?? {}, wound: result.rollSpent ?? {} },
      crit: result.crit ? 1 : 0, superCrit: (Number(result.natural) >= 10) ? 1 : 0, natural: Number(result.natural) || 0,
      total: Number(result.total) || 0, messageId: message.id } });
  }
  return wound;
}

/**
 * The attack.* options with at: "wound" that apply as the Wound Roll is made: asked in one dialog when one is "ask",
 * paid, and their uses counted. @returns the chosen pieces, each with its n and value.
 */
async function woundOptions(actor, attack, critStrike) {
  const mods = optionMods(actor, "wound");
  if ( !mods.length ) return [];
  const hit = attack.targets.filter(t => t.result === "hit");
  const missed = attack.targets.filter(t => t.result === "miss");
  const hitActors = (await Promise.all(hit.map(t => resolveActor(t).catch(() => null)))).filter(Boolean);
  const scope = { ...attackScope(attack), hits: hit.length, missed: missed.length, critStrike, ...aggregates(actor, hitActors),
    ...(attack.punch ? punchVars(attack.punch, hitActors) : {}) };
  // (only the targets the Wound Roll and the Damage still read: another one would be paid for nothing)
  const pieces = optionPieces(actor, WOUND_TARGETS, scope, { at: "wound", mods });
  if ( !pieces.length ) return [];
  let chosen = await optionDialog(pieces, { title: L("DBU.Attack.WoundOptions"), actor, scope });
  if ( chosen === null ) chosen = autoChosen(actor, pieces, scope);
  let plan = optionCostPlan(actor, chosen, scope);
  if ( plan.problems.length ) {
    ui.notifications.warn(L("DBU.Attack.OptionCantPay", { why: plan.problems.join(" ") }));
    chosen = chosen.filter(c => !c.pieces.some(p => !blank(p.cost)));
    plan = optionCostPlan(actor, chosen, scope);
  }
  if ( !chosen.length ) return [];
  const paid = await payOptions(actor, chosen, { plan });
  await countOptionLimits(actor, chosen);
  const out = chosenPieces(chosen);
  if ( paid.text ) out.paidText = paid.text;
  return out;
}
const pieceLabelOf = p => p.own || p.label;

export async function storeWoundOnMessage(messageId, wound) {
  const message = game.messages.get(messageId);
  if ( !message ) return;
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  // What the Wound-time options changed (rollWound: wound.patch)
  const patch = wound?.patch;
  if ( patch ) {
    wound = { ...wound };
    delete wound.patch;
    if ( Number.isFinite(patch.category) ) attack.category = patch.category;
    if ( patch.ignoreDR ) attack.ignoreDR = patch.ignoreDR;
    if ( patch.ignoreSoak ) attack.ext = { ...(attack.ext ?? {}), ignoreSoak: patch.ignoreSoak };
    if ( Number.isFinite(patch.charges) ) attack.charges = patch.charges;
    if ( Number.isFinite(patch.chargeCategory) ) attack.chargeCategory = patch.chargeCategory;
    if ( patch.notes?.length ) attack.notes = [...(attack.notes ?? []), ...patch.notes];
  }
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
  // The Versus layer: the attacker's pieces against this target (automatic) and the target's against the attacker
  // (chosen when it defended; without a defense, its automatic ones with no limit nor cost)
  const vs = damageVersus(targetActor, attack, attacker, def);
  const vline = p => lines.push(L("DBU.Versus.Line", { label: p.label, value: signedText(p.value), what: targetLabel(p.target) }));
  // 1. Wound + the attacker's vs.wound / vs.combat, then Guard halves it
  for ( const p of vs.atk.filter(x => ["vs.wound", "vs.combat"].includes(x.target)) ) { wound += Number(p.value) || 0; vline(p); }
  // Punching Down: its Extra Dice only against a target it applies to; Punching Up: +1(T) Wound per Size Category the
  // target is larger (the Size rules; rules/versus.mjs punchOf)
  const punch = attack.punch ? punchOf(attack.punch, targetActor) : { down: 0, up: 0 };
  const punchDice = Number(attack.wound?.punchDown) || 0;
  if ( punchDice && !punch.down ) {
    wound -= punchDice;
    lines.push(L("DBU.Punch.DownOff", { n: punchDice }));
  }
  else if ( punchDice ) lines.push(L("DBU.Punch.Down", { n: punchDice }));
  if ( punch.up ) {
    const n = punch.up * (Number(attack.punch.T) || 1);
    wound += n;
    lines.push(L("DBU.Punch.Up", { n, size: punch.up }));
  }
  // R: the Condition Advantage: +3(T) Wound against a target already suffering from its Combat Condition
  const sigCond = attack.sig?.condition;
  if ( sigCond && ((tsys.effectiveConditions?.[sigCond] ?? tsys.conditions?.[sigCond] ?? 0) > 0) ) {
    const n = 3 * (Number(attack.sig.conditionT) || Number(attack.punch?.T) || 1);
    wound += n;
    lines.push(L("DBU.Attack.ConditionWound", { n, condition: L(`DBU.Condition.${sigCond}`) }));
  }
  // 2. Damage Category: vs.categorySet (3 wins, else the lowest), Guard / Divine Flex −1, vs.categoryTaken and the
  //    attacker's vs.category, then Lethal; a Category set to 3 is never reduced
  let category = attack.category + (tsys.damageCategoryTaken ?? 0);
  const sets = vs.def.filter(p => p.target === "vs.categorySet").map(p => Math.clamp(Math.round(Number(p.value) || 0), 1, 3));
  const locked = sets.includes(3);
  if ( sets.length ) {
    category = locked ? 3 : Math.min(...sets);
    for ( const p of vs.def.filter(x => x.target === "vs.categorySet") ) vline(p);
  }
  if ( def?.mode === "guard" ) {
    wound = Math.floor(wound / 2);
    if ( !locked ) category -= 1;
    lines.push(L("DBU.Damage.Guard"));
  }
  // Divine Flex: −1 Damage Category, and it counts as the Direct Hit option
  if ( def?.mode === "divineFlex" ) {
    if ( !locked ) category -= 1;
    lines.push(L("DBU.Damage.DivineFlex"));
  }
  for ( const p of [...vs.def.filter(x => x.target === "vs.categoryTaken"), ...vs.atk.filter(x => x.target === "vs.category")] ) {
    if ( !locked ) category += Math.round(Number(p.value) || 0);
    vline(p);
  }
  // Lethal Damage (an attack option): Damage Category 3, which nothing reduces
  if ( attack.lethal ) {
    category = 3;
    lines.push(L("DBU.Damage.Lethal"));
  }
  category = Math.clamp(category, 1, 3);

  // 3. Damage Reduction (+ vs.dr), then the ½-DR rules, attack.ignoreDR and Armor Piercing
  const vsDr = sumOf(vs.def, "vs.dr");
  const drBase = vsDr ? Math.max(0, tsys.aptitudes.dr + vsDr) : tsys.aptitudes.dr;
  for ( const p of vs.def.filter(x => x.target === "vs.dr") ) vline(p);
  let dr = drBase;
  const weaponCat = attack.weaponId && attacker ? DBU.weaponCategories[attacker.items.get(attack.weaponId)?.system.category] : null;
  if ( weaponCat?.ignoreHalfDR || fx.ignoreHalfDR ) dr = Math.ceil(dr / 2);
  // An attack option ignores all of it (1) or a part (0.5: half; it does not add to the halves above)
  const ignoreDR = Math.min(1, attack.ignoreDR ?? 0);
  if ( ignoreDR > 0 ) dr = Math.min(dr, Math.ceil(drBase * (1 - ignoreDR)));
  if ( attack.sig?.armorPiercing && attacker ) dr = Math.max(0, dr - Math.floor(attacker.system.attributes.in.mod / 2));

  // 4. Soak (+ vs.soak), then Direct Hit x1.5, Pinpoint, the Weapon's 1/4, the Soak ignored (the highest of
  //    attack.ignoreSoak and vs.ignoreSoak), then the Category halving
  const vsSoak = sumOf(vs.def, "vs.soak");
  let soak = vsSoak ? Math.max(0, tsys.aptitudes.soak + vsSoak) : tsys.aptitudes.soak;
  for ( const p of vs.def.filter(x => x.target === "vs.soak") ) vline(p);
  if ( ["directHit", "divineFlex"].includes(def?.mode) ) soak = soak + Math.floor(soak / 2);
  if ( fx.has("pinpoint") && attacker ) {
    const ins = attacker.system.attributes.in.mod * (attack.strike?.crit ? 2 : 1);
    soak = Math.max(0, soak - ins);
  }
  if ( weaponCat?.ignoreQuarterSoak ) soak = Math.max(0, soak - Math.ceil(tsys.aptitudes.soakBeforeBroken / 4));
  const ignoreSoak = Math.min(1, Math.max(attack.ext?.ignoreSoak ?? 0, ...vs.atk.filter(x => x.target === "vs.ignoreSoak").map(p => Number(p.value) || 0)));
  if ( ignoreSoak > 0 ) {
    soak = Math.max(0, soak - Math.ceil(soak * ignoreSoak));
    for ( const p of vs.atk.filter(x => x.target === "vs.ignoreSoak") ) vline(p);
  }
  const soakApplied = category === 1 ? soak : (category === 2 ? Math.floor(soak / 2) : 0);

  // 5. Damage > 0: + broken Soak overflow, Damage taken (+ vs.damageTaken), Shattering Blow, then x vs.damageMult
  let damage = Math.max(0, wound - dr - soakApplied);
  if ( damage > 0 ) {
    damage += tsys.aptitudes.brokenOverflow ?? 0;
    damage += tsys.damageTaken ?? 0;
    for ( const p of vs.def.filter(x => x.target === "vs.damageTaken") ) { damage += Math.round(Number(p.value) || 0); vline(p); }
    if ( attack.sig?.shatteringBlow ) damage += attack.sig.shatteringBlow * Math.floor(tsys.aptitudes.soak / 4);
    // (F5: less Damage never heals)
    damage = Math.max(0, damage);
    // (T25 vs.damageDealtMult: the attacker's own x against that Character, Superior Being)
    const mults = [...vs.def.filter(x => x.target === "vs.damageMult"), ...vs.atk.filter(x => x.target === "vs.damageDealtMult")];
    if ( mults.length ) {
      damage = Math.max(0, Math.floor(mults.reduce((t, p) => t * (Number(p.value) || 0), damage)));
      for ( const p of mults ) lines.push(L("DBU.Versus.Line", { label: p.label, value: `x${p.value}`, what: targetLabel(p.target) }));
    }
  }
  // 6. vs.ignoreDamageBelow (Damage lower than the highest value is 0) and vs.damageMax (at most the lowest value); a
  //    limited one counts only when it changed the Damage (defUsed: applyAttackDamage counts it)
  const defUsed = [];
  const usedOf = list => defUsed.push(...list.filter(p => !blank(p.limit) && p.key).map(p => ({ key: p.key, limit: p.limit, ctx: p.ctx ?? {} })));
  const below = vs.def.filter(p => p.target === "vs.ignoreDamageBelow");
  if ( (damage > 0) && below.length ) {
    const applies = below.filter(p => damage < (Number(p.value) || 0));
    if ( applies.length ) {
      damage = 0;
      for ( const p of applies ) vline(p);
      usedOf(applies);
    }
  }
  // F12 vs.ignoreWoundBelow: a Wound Roll lower than the highest value deals no Damage (the Incorporeal State)
  const woundBelow = vs.def.filter(p => (p.target === "vs.ignoreWoundBelow") && (wound < (Number(p.value) || 0)));
  if ( (damage > 0) && woundBelow.length ) {
    damage = 0;
    for ( const p of woundBelow ) vline(p);
    usedOf(woundBelow);
  }
  const caps = vs.def.filter(p => (p.target === "vs.damageMax") && (damage > Math.max(0, Number(p.value) || 0)));
  if ( caps.length ) {
    damage = Math.max(0, Math.min(...caps.map(p => Number(p.value) || 0)));
    for ( const p of caps ) lines.push(L("DBU.Versus.Line", { label: p.label, value: `≤${Math.max(0, Number(p.value) || 0)}`, what: targetLabel(p.target) }));
    usedOf(caps);
  }
  lines.push(L("DBU.Damage.Breakdown", {
    wound, dr, soak: soakApplied, cat: L(DBU.damageCategories[category]), damage
  }));
  // Divine Flex with no Damage taken: the Opponent loses Life Points equal to your Soak Value
  if ( (def?.mode === "divineFlex") && (damage === 0) ) lines.push(L("DBU.Damage.DivineFlexReflect", { n: tsys.aptitudes.soak }));
  const out = { damage, category, dr, soakApplied, wound, lines };
  // The attacker's limited pieces that applied (counted once per attack by applyAttackDamage)
  if ( vs.used.length ) out.vsUsed = vs.used;
  if ( defUsed.length ) out.defUsed = defUsed;
  return out;
}

const sumOf = (list, target) => list.filter(p => p.target === target).reduce((t, p) => t + (Number(p.value) || 0), 0);

/**
 * The vs pieces of one attacker/target pair for the Damage (computeDamage, synchronous):
 *  - atk: the attacker's vs.wound, vs.combat, vs.category, vs.ignoreSoak (automatic; a limited one only with a use
 *    left, or already counted for this attack);
 *  - def: the target's pieces stored by its defense (def.vs), or without them its automatic pieces with no limit nor cost;
 *  - used: the attacker's limited pieces that applied [{ key, limit, ctx }].
 */
function damageVersus(target, attack, attacker, def) {
  const out = { atk: [], def: [], used: [] };
  try {
    const scope = { ...attackScope(attack), ...defendVars(def), hit: 1, critStrike: attack.strike?.crit ? 1 : 0, ...pairPunch(attack, target) };
    if ( attacker?.system ) {
      const mods = versusMods(attacker);
      if ( mods.length ) {
        const pieces = versusPieces(attacker, target, scope, { targets: VS_ATTACK_DAMAGE, side: "attacker", mods, limits: false })
          .filter(p => usableOnAttack(attacker, attack, p));
        if ( pieces.length ) {
          out.atk = chosenPieces(autoChosen(attacker, pieces, pieces[0].scope)).map(p => ({ ...p, label: versusLabel(p) }));
          out.used = out.atk.filter(p => p.limit).map(p => ({ key: p.useKey, limit: p.limit, ctx: p.ctx ?? {} }));
        }
      }
    }
    // (AG: what others added to this row before its Damage: attackSoak)
    const extra = Array.isArray(def?.extraVs) ? def.extraVs.map(p => ({ ...p })) : [];
    if ( Array.isArray(def?.vs) ) out.def = [...def.vs.map(p => ({ ...p })), ...extra];
    else if ( target?.system ) {
      const mods = versusMods(target);
      if ( mods.length ) {
        // (vs.autoDodge needs a defense; the VS_DEFERRED ones may be limited: counted when they change the Damage)
        const pieces = versusPieces(target, attacker, scope, { targets: VS_HIT.filter(k => !["vs.redodge", "vs.autoDodge"].includes(k)), mods })
          .filter(p => !p.ask && !p.max && (blank(p.limit) || VS_DEFERRED.has(p.target)) && blank(p.cost));
        if ( pieces.length ) {
          out.def = chosenPieces(autoChosen(target, pieces, pieces[0].scope)).map(p => ({ target: p.target, value: p.value, label: versusLabel(p),
            ...((VS_DEFERRED.has(p.target) && !blank(p.limit)) ? { limit: p.limit, key: p.useKey, ctx: p.ctx ?? {} } : {}) }));
        }
      }
      out.def = [...(out.def ?? []), ...extra];
    }
    else out.def = extra;
  } catch(err) { console.warn("DBU | Versus pieces", err); }
  return out;
}

/** Button on the attack card: apply damage to one target. */
export async function applyAttackDamage(message, index) {
  const attack = foundry.utils.deepClone(message.getFlag(FLAG, "attack"));
  const t = attack?.targets?.[index];
  if ( !t || !attack.wound ) return;
  // An Absolute Attack that missed (not one cancelled by a Duel Escape) still deals 1/2 of its Wound against Soak and DR
  // (not after a vs.autoDodge of 2+: noAbsolute)
  const absolute = (t.result === "miss") && attack.absolute && !attack.nullified && !t.defense?.noAbsolute;
  if ( (t.result === "miss") && !absolute ) return ui.notifications.info(L("DBU.Damage.Missed"));
  if ( t.damage !== null && t.damage !== undefined ) return ui.notifications.info(L("DBU.Damage.Already"));
  const target = await resolveActor(t);
  const attacker = await fromUuid(attack.attackerUuid);
  if ( !target ) return;
  const half = absolute ? { ...attack, wound: { ...attack.wound, total: Math.floor((attack.wound.total ?? 0) / 2),
    ...(attack.wound.punchDown ? { punchDown: Math.floor(attack.wound.punchDown / 2) } : {}) } } : attack;
  // RB: a lost Deflect (Intervene) raises the Damage Category for the one who stepped in
  const rowAttack = t.categoryBonus ? { ...half, category: Math.clamp((half.category ?? 1) + t.categoryBonus, 1, 3) } : half;
  const res = computeDamage(target, rowAttack, attacker, t.defense);
  if ( t.categoryBonus ) res.lines.unshift(L("DBU.Team.CategoryUp"));
  if ( absolute ) res.lines.unshift(L("DBU.Damage.Absolute", { n: half.wound.total }));
  const lifeBefore = target.system.life?.value ?? 0;
  // AG "allyGuard.defeat" (an Ally's piece: Intelligent Fighter): an Opponent's Damage that would Defeat this target is
  // reduced by that piece's value (its limit counted on the Ally)
  if ( (res.damage > 0) && attacker && !versusData(target, attacker).ally && (res.damage >= lifeBefore + (target.system.lifeFloor ?? 0)) ) {
    const { allyGuards } = await import("../rules/allies.mjs");
    const { triggerUsesLeft, useTriggerLimit } = await import("./triggers.mjs");
    for ( const g of allyGuards(target, "defeat") ) {
      if ( !(res.damage >= lifeBefore + (target.system.lifeFloor ?? 0)) ) break;
      if ( g.limit && !triggerUsesLeft(g.giver, { limit: g.limit }, g.key) ) continue;
      const cut = Math.min(res.damage, g.value);
      if ( !(cut > 0) ) continue;
      res.damage -= cut;
      res.lines.push(L("DBU.Damage.AllyGuard", { label: g.label, n: cut }));
      // (F6: its cost, paid by the Ally who gives it: "res:<name>:all" empties that resource)
      if ( g.cost ) await payGuardCost(g.giver, g.cost);
      if ( g.limit ) {
        if ( g.giver.isOwner ) await useTriggerLimit(g.giver, { limit: g.limit }, g.key);
        else emitGM("useLimit", { actorUuid: g.giver.uuid, limit: g.limit, key: g.key });
      }
    }
  }
  // CS1 "allyGuard.defeatKeep" (Squadron Species 6): an adjacent Ally takes the Damage that would Defeat this target down
  // to 1 LP above that, and loses those LP itself
  if ( (res.damage > 0) && attacker && !versusData(target, attacker).ally && (res.damage >= lifeBefore + (target.system.lifeFloor ?? 0)) ) {
    const { allyGuards } = await import("../rules/allies.mjs");
    const { triggerUsesLeft, useTriggerLimit } = await import("./triggers.mjs");
    for ( const g of allyGuards(target, "defeatKeep") ) {
      if ( g.limit && !triggerUsesLeft(g.giver, { limit: g.limit }, g.key) ) continue;
      const cut = res.damage - (lifeBefore + (target.system.lifeFloor ?? 0)) + 1;
      if ( !(cut > 0) ) break;
      res.damage -= cut;
      res.lines.push(L("DBU.Damage.AllyGuard", { label: g.label, n: cut }));
      await safeUpdate(g.giver, { "system.life.value": (g.giver.system.life?.value ?? 0) - cut });
      if ( g.limit ) {
        if ( g.giver.isOwner ) await useTriggerLimit(g.giver, { limit: g.limit }, g.key);
        else emitGM("useLimit", { actorUuid: g.giver.uuid, limit: g.limit, key: g.key });
      }
      break;
    }
  }
  // R: did the target already suffer from the Condition Advantage's Combat Condition (then it got +3(T) Wound instead)
  const condKey = attack.sig?.condition ?? "";
  const condHad = !!condKey && ((target.system.effectiveConditions?.[condKey] ?? target.system.conditions?.[condKey] ?? 0) > 0);
  await applyDamageToActor(target, res.damage, { attacker, attack, lines: res.lines, category: res.category });
  // RB Intervene (Defense Wall, a lost Deflect): the Damage beyond the Life Points of the one who stepped in goes to the
  // Ally, reduced by its Soak and Damage Reduction as usual for that attack and Damage Category
  if ( t.intervened?.forUuid && ["wall", "deflect"].includes(t.intervened.option) && (res.damage > Math.max(0, lifeBefore)) ) {
    const excess = res.damage - Math.max(0, lifeBefore);
    const allyDoc = await fromUuid(t.intervened.forUuid).catch(() => null);
    const ally = (allyDoc?.documentName === "Token") ? allyDoc.actor : allyDoc;
    if ( ally ) {
      const er = computeDamage(ally, { ...rowAttack, wound: { ...rowAttack.wound, total: excess, punchDown: 0 } }, attacker, null);
      er.lines.unshift(L("DBU.Team.Excess", { n: excess, name: target.name }));
      await applyDamageToActor(ally, er.damage, { attacker, attack, lines: er.lines, category: er.category });
    }
  }
  // The target's limited pieces that changed this Damage (vs.ignoreDamageBelow, vs.damageMax)
  if ( res.defUsed?.length ) await countDefenderLimits(target, res.defUsed);
  // Not a hit nor damage of the Attacking Maneuver for the attacker's effects
  if ( absolute ) {
    const damage = { amount: res.damage, category: res.category };
    // (the attacker's limited vs pieces in that Damage still count, once per attack)
    const vsUsed = await countAttackVersus(attacker, attack, res.vsUsed ?? []);
    if ( vsUsed.length ) damage.vsUsed = vsUsed;
    if ( message.isOwner ) await storeDamageOnMessage(message.id, index, damage);
    else emitGM("attackDamage", { messageId: message.id, targetIndex: index, damage });
    return;
  }
  // Diminishing Defense when the target never rolled a defense (x attack.dimDefense.mult; flag.dimDefenseFirstFree)
  // (none when an automatic vs.noDimDefense of the target applies: a limited one counts then)
  const noDim = (!t.dimApplied && !t.defense) ? await passiveNoDim(target, attacker, attack) : false;
  if ( !t.dimApplied && !t.defense && !noDim ) {
    const stacks = target.system.dimDefensePerAttack * ((attackProfileEffects(attack).has("sweeping") && res.damage > 0) ? 2 : 1);
    const mult = attack.ext?.dimMult ?? 1;
    if ( (mult === 1) && !flagOn(target.system, "dimDefenseFirstFree") ) {
      await safeUpdate(target, { "system.combat.dimDefense": (target.system.combat.dimDefense ?? 0) + stacks });
    }
    else await safeUpdate(target, dimDefenseGain(target, attacker, stacks, mult).update);
  }
  // On-damage Signature effects
  if ( res.damage > 0 && attack.sig ) {
    const upd = {};
    if ( attack.sig.penetration ) upd["system.conditions.broken"] = Math.min(3, target.system.conditions.broken + attack.sig.penetration);
    if ( attack.sig.sustained ) upd["system.combat.dot"] = (target.system.combat.dot ?? 0) + attack.sig.sustained;
    if ( Object.keys(upd).length ) await safeUpdate(target, upd);
    // R: the Condition Advantage: its Combat Condition on an Opponent it damaged (Guard Down / Drained until the start of
    // the attacker's next turn, Shaken / Poisoned until the end of the target's next turn)
    if ( condKey && !condHad && attacker && !areAllies(attacker, target) ) await applySigCondition(attacker, target, condKey, attack.name);
  }
  // On-damage effects of the Profiles of Transformations (Gravity Cage, Time, Destruction)
  if ( (res.damage > 0) && attacker ) await profileDamageEffects(attacker, target, attack, res.damage);
  // Triggers "when you hit / damage" (the attacker) and "when you take damage" (the target)
  {
    const { fireEvent } = await import("./triggers.mjs");
    const max = target.system.life.max;
    const after = target.system.life.value;
    const before = after + res.damage;
    const knocked = DBU.thresholds.filter(k => (before > max * (target.system.thresholdFractions ?? DBU.THRESHOLD_FRACTIONS)[k]) && (after <= max * (target.system.thresholdFractions ?? DBU.THRESHOLD_FRACTIONS)[k])).length;
    // The Defend variables (@dodge, @parry..., @counter, @defenseCrit) and @vs (the other Character of the pair)
    const scope = { ...attackScope(attack), damage: res.damage, knocked, defeated: (after <= 0) ? 1 : 0,
      targetBelow: target.system.health?.count ?? 0, ...defendVars(t.defense), guard: (t.defense?.mode === "guard") ? 1 : 0,
      ...pairPunch(attack, target) };
    // (RB: a Reflected attack is not the original attacker's hit; the one who reflected it is the other Character)
    const byDoc = attack.reflected?.byUuid ? await fromUuid(attack.reflected.byUuid).catch(() => null) : null;
    const by = ((byDoc?.documentName === "Token") ? byDoc.actor : byDoc) ?? attacker;
    if ( attacker && !attack.reflected ) fireEvent(attacker, "attackHit", { other: target, scope: { ...scope, vs: versusData(attacker, target) } });
    fireEvent(target, "damaged", { other: by, scope: { ...scope, vs: versusData(target, by) } });
  }
  const damage = { amount: res.damage, category: res.category };
  // The attacker's limited vs pieces that applied to this target (its Strike, its Damage): one use per attack
  const vsUsed = await countAttackVersus(attacker, attack, [...(t.defense?.vsAtk ?? []), ...(res.vsUsed ?? [])]);
  if ( vsUsed.length ) damage.vsUsed = vsUsed;
  if ( message.isOwner ) await storeDamageOnMessage(message.id, index, damage);
  else emitGM("attackDamage", { messageId: message.id, targetIndex: index, damage });
}

/** R: the Combat Condition of a Condition Advantage, timed as the Advantage says (through the GM for a target not owned). */
async function applySigCondition(attacker, target, key, label) {
  const T = await import("./triggers.mjs");
  const byAttacker = ["guardDown", "drained"].includes(key);
  const options = { duration: byAttacker ? "startOfNextTurn" : "endOfNextTurn", event: "attackHit", label: `${label} (Condition)`,
    inflictor: attacker.uuid, ...(byAttacker ? T.timedOptionsFor(attacker, target, "startOfNextTurn") : {}) };
  try {
    if ( target.isOwner ) await T.applyTriggerEffect(target, "condition", 1, key, options);
    else emitGM("applyTrigger", { uuid: target.uuid, effect: "condition", value: 1, resource: key, options });
  } catch(err) { console.error("DBU | Condition Advantage", err); }
}

/**
 * Count one use of the attacker's limited vs pieces that applied (once per attack: the keys already counted for this
 * attack are skipped). A user who does not own the attacker counts them through the GM; with no GM connected, a chat
 * line asks for it.
 * @returns {Promise<string[]>} the keys counted
 */
async function countAttackVersus(attacker, attack, list) {
  const done = new Set(attack.vsUsed ?? []);
  const todo = list.filter(e => e?.key && !done.has(e.key) && (done.add(e.key) || true));
  if ( !todo.length || !attacker ) return [];
  if ( !attacker.isOwner && !game.users?.activeGM ) {
    await postInfoCard({ actor: attacker, title: attack.name, lines: [L("DBU.Versus.CountLimit", { n: todo.length })] });
    return todo.map(e => e.key);
  }
  const { useTriggerLimit } = await import("./triggers.mjs");
  const writer = limitWriter(attacker);
  for ( const e of todo ) await useTriggerLimit(writer, { limit: e.limit, ctx: e.ctx }, e.key);
  return todo.map(e => e.key);
}

/** Count one use of each limited piece of the target that changed the Damage ({ key, limit, ctx }; once per key). */
async function countDefenderLimits(target, list) {
  const seen = new Set();
  const todo = (list ?? []).filter(e => e?.key && !seen.has(e.key) && (seen.add(e.key) || true));
  if ( !todo.length || !target ) return;
  const { useTriggerLimit } = await import("./triggers.mjs");
  const writer = limitWriter(target);
  for ( const e of todo ) await useTriggerLimit(writer, { limit: e.limit, ctx: e.ctx }, e.key);
}

/**
 * A target that made no defense: does an automatic vs.noDimDefense piece of it (no ask, cost nor amount) keep this
 * attack's Diminishing Defense away? A limited one is counted when it does.
 */
async function passiveNoDim(target, attacker, attack) {
  try {
    const mods = versusMods(target).filter(m => m.target === "vs.noDimDefense");
    if ( !mods.length ) return false;
    const scope = { ...attackScope(attack), ...defendVars(null), hit: 1, critStrike: attack.strike?.crit ? 1 : 0, ...pairPunch(attack, target) };
    const pieces = versusPieces(target, attacker, scope, { targets: ["vs.noDimDefense"], mods })
      .filter(p => !p.ask && !p.max && blank(p.cost));
    const applied = pieces.length ? chosenPieces(autoChosen(target, pieces, pieces[0].scope)).filter(p => (Number(p.value) || 0) > 0) : [];
    if ( !applied.length ) return false;
    await countDefenderLimits(target, applied.filter(p => !blank(p.limit)).map(p => ({ key: p.useKey, limit: p.limit, ctx: p.ctx ?? {} })));
    return true;
  } catch(err) {
    console.warn("DBU | vs.noDimDefense", err);
    return false;
  }
}

/** An actor whose uses (flags.dbu-rpg.triggerUses) this user may not write: its update goes through the GM. */
function limitWriter(actor) {
  if ( actor.isOwner ) return actor;
  return {
    uuid: actor.uuid, system: actor.system, items: actor.items, flags: actor.flags,
    getFlag: (...a) => actor.getFlag(...a),
    update: data => safeUpdate(actor, data)
  };
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
    // The Might Clash goes through combat/clash.mjs (clash.* pieces, @via_gravitycage, clashWon / clashLost); ties go to
    // the target
    const clash = await resolveClash(attacker, target, { mine: "might", via: "gravitycage", label: "Gravity Cage",
      subtitle: "Gravity Cage", defenderSubtitle: "Gravity Cage", card: false });
    const mine = { total: clash?.mine ?? 0 };
    const theirs = { total: clash?.theirs ?? 0 };
    if ( clash?.autoWin ) lines.push(L("DBU.Clash.AutoWin", { name: (clash.won ? attacker : target).name }));
    if ( clash?.won ) {
      ops.push({ op: "condition", uuid: target.uuid, key: "prone", value: 1, by: attacker.uuid });
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
  // The attacker's limited vs pieces already counted for this attack
  if ( damage.vsUsed?.length ) attack.vsUsed = [...new Set([...(attack.vsUsed ?? []), ...damage.vsUsed])];
  // attack.state: left once every target of the card is resolved
  if ( attack.ext?.enteredStates?.length && allResolved(attack) ) await leaveAttackStates(attack);
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
    // The attacker makes the Clash (combat/clash.mjs: clash.* pieces, @via_knockback, clashWon / clashLost): the target
    // wins ties
    const clash = await resolveClash(attacker, target, { mine: "might", via: "knockback", label: "Knockback", extra,
      subtitle: "Knockback", defenderSubtitle: "Knockback", card: false });
    won = !!clash?.won;
    if ( clash?.autoWin ) lines.push(L("DBU.Clash.AutoWin", { name: (won ? attacker : target).name }));
    lines.push(L(won ? "DBU.Grapple.ClashWin" : "DBU.Grapple.ClashLose",
      { name: attacker.name, other: target.name, mine: clash?.mine ?? 0, theirs: clash?.theirs ?? 0 }));
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
  // (RC "lifeFloor": Life Points may go down to −lifeFloor before the Defeat)
  const value = undying ? after : Math.max(-(tsys.lifeFloor ?? 0), after);
  const lifeUpdate = { "system.life.value": value };
  if ( stamina.absorbed ) lifeUpdate["system.adversary.stamina"] = stamina.stamina;
  // (the attack's variables go along, so the attacker's "vs.steadfast" pieces can read its tags and weapon)
  let dmgScope = null;
  try { dmgScope = attack ? attackScope(attack) : null; } catch(err) { dmgScope = null; }
  await safeUpdate(target, lifeUpdate, { dbuDamage: { attackerUuid: attacker?.uuid ?? null, selfInflicted, ...(dmgScope ? { scope: dmgScope } : {}) } });
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
  if ( attacker && inEncounter(attacker) && !selfInflicted && !V.traitOf(target, "Dauntless") ) {
    const max = tsys.life.max;
    const crossed = DBU.thresholds.some(k => (before > max * (tsys.thresholdFractions ?? DBU.THRESHOLD_FRACTIONS)[k]) && (value <= max * (tsys.thresholdFractions ?? DBU.THRESHOLD_FRACTIONS)[k]));
    const minionDefeated = (target.type === "npc") && (target.system.npcType === "minion") && (value <= 0);
    if ( (crossed || minionDefeated) && !attacker.system.combat.momentumUsed ) {
      await safeUpdate(attacker, {
        "system.combat.actions": (attacker.system.combat.actions ?? 0) + 1,
        "system.combat.momentumUsed": true
      });
      await postInfoCard({ actor: attacker, title: L("DBU.Momentum.Title"), lines: [L("DBU.Momentum.Text", { name: attacker.name })] });
      // (T3 "bonusMomentum": Style of the Crane School 7)
      (await import("./triggers.mjs")).fireEvent(attacker, "bonusMomentum", { other: target, scope: {} });
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
