// Package E (round 3: Maneuver events and Transformation rules, E1-E4): what it teaches the automation validator
// (../validate.mjs merges a..f after its base lists). Only Package E edits this file. Every export must stay (empty is
// fine); see tools/vocab/c.mjs for what each one means.
//
// The Ally events (allyHit / allyDamaged) keep the variables of the attack events they come from: their lists are made
// from validate.mjs's base lists (copied here, as tools/vocab/c.mjs does) and the other packages' additions.
import fs from "node:fs";
import { DBU } from "../../../../dbu-rpg/module/config.mjs";
import * as A from "./a.mjs";
import * as B from "./b.mjs";
import * as C from "./c.mjs";
import * as D from "./d.mjs";
import * as F from "./f.mjs";

const OTHERS = [A, B, C, D, F];
const fromOthers = field => OTHERS.flatMap(p => [...(p[field] ?? [])]);
const eventOf = event => OTHERS.flatMap(p => [...(p.EVENT_VARS?.[event] ?? [])]);

/** validate.mjs: the attack variables and the variables of a hit (attackHit / damaged). */
const ATTACK_BASE = ["physical", "energy", "magic", "signature", "basic", "ultimate", "aoe", "charges", "wager", "category", "crit",
  "targets", "elemental", "dkpCost", "dkpWager", "kp", "dmgAttr", "favored", "calledShot", "oos", "armed", "unarmed"];
const HIT_BASE = ["damage", "knocked", "defeated", "targetBelow", "critWound", "guard"];
const DEFEND_BASE = ["dodge", "parry", "guard", "crossCounter", "directHit", "powerFlare", "none", "divineFlex"];
/** What an Ally event adds: the Ally of the event is a Minion, carries your mark (@allyMark.<slug>). */
const ALLY = ["allyMinion", "allyMark."];
/** The Ally events never carry the attacker's @viaFx. */
const noVia = list => [...new Set(list.filter(v => v !== "viaFx."))];
const HIT = [...ATTACK_BASE, ...fromOthers("ATTACK_VARS"), ...HIT_BASE, ...DEFEND_BASE, ...fromOthers("DEFENSE_VARS")];

/** Variables of "maneuverUsed" (combat/triggers.mjs itemUseScope); other = your target (@vs). */
const MANEUVER_USED = ["via_", "oos", "ua", "special", "god", "villainous", "standard", "instant", "counterManeuver", "modifierManeuver",
  "actionCost", "uaType_", "vs.", "viaFx."];
/** Variables of "itemUsed". */
const ITEM_USED = ["via_", "oos", "consumable", "food", "basic", "accessory", "viaFx."];
/** Variables of an Awakening's new Stack (@awk_<slug> is allowed everywhere). */
const STACK_VARS = ["temp", "tempLevel", "free", "stacksNow"];

export const EVENT_VARS = {
  maneuverUsed: MANEUVER_USED,
  itemUsed: ITEM_USED,
  defeatEnd: ["byLife", "byUndying", "byStatus"],
  allyHit: noVia([...HIT, ...eventOf("attackHit"), ...ALLY]),
  allyDamaged: noVia([...HIT, ...eventOf("damaged"), ...ALLY, "allyBelow"]),
  awakeningGain: STACK_VARS,
  stackGain: STACK_VARS,
  // An Apparel piece you wore was unequipped (or broke: @broken = 1)
  apparelDoff: ["via_", "weights", "armor", "natural", "craftsmanship", "broken"]
};
export const BASE_VARS = [];
export const PREFIX_VARS = [];
export const ATTACK_VARS = [];
export const DEFENSE_VARS = [];
export const ATTACK_OPTION_VARS = [];
export const DEFENSE_OPTION_VARS = [];
export const WOUND_OPTION_VARS = [];
export const VS_VARS = [];
export const CLASH_VARS = [];
export const TARGET_VARS = {};
export const FIELD_VARS = {};
export const WITH_OTHER = ["maneuverUsed", "allyHit", "allyDamaged"];
export const OPTION_PREFIXES = [];
export const TEXT_TARGETS = [];
export const DICE_TARGETS = [];
export const PREFIX_RE = [];

/** The slugs of the Transformations of the dump (validate.mjs --dump), for the "leave" effect; empty without a dump. */
const fxSlug = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const TRANSFORMATION_SLUGS = new Set();
{
  const at = process.argv.indexOf("--dump");
  try {
    if ( at > 0 ) {
      for ( const d of JSON.parse(fs.readFileSync(process.argv[at + 1], "utf8")) ) {
        if ( d.transType !== "racial" ) TRANSFORMATION_SLUGS.add(fxSlug(d.item));
      }
    }
  } catch(err) { /* no dump: the names are not checked */ }
}

/** Targets about "this Transformation" (not on a Racial Trait), and the families that name another one. */
const OWN_TARGETS = ["enterBlock", "combineBlock", "leaveBlock", "leaveWhen", "grandTrigger"];
const FAMILIES = ["enterBlockOf.", "enterBlockAspect.", "enterBlockType."];
const TYPES = ["form", "enhancement", "evolved"];
const ASPECTS = Object.keys(DBU.aspects);
const LEAVE_KEYS = ["", "this", "all", "enhancements", "forms", "grandAwakening"];

export function checkModifier(m, i, ctx) {
  const out = [];
  const t = String(m.target ?? "");
  const what = `modifier ${i}`;
  const own = OWN_TARGETS.includes(t);
  const family = FAMILIES.find(p => t.startsWith(p));
  if ( !own && !family ) return out;
  if ( own && ctx.racial ) out.push(`${what}: ${t} is about this Transformation (a Racial Trait: enterBlockOf.<slug>, enterBlockAspect.<key> or enterBlockType.<type>)`);
  if ( (t === "grandTrigger") && ((ctx.effect?.transType ?? "awakening") !== "awakening") ) out.push(`${what}: grandTrigger only on an Awakening`);
  if ( family === "enterBlockOf." && !/^[a-z0-9]+$/.test(t.slice(family.length)) ) {
    out.push(`${what}: ${t}: the part of the name is lowercase letters/digits (enterBlockOf.kaioken)`);
  }
  if ( family === "enterBlockAspect." && !ASPECTS.includes(t.slice(family.length)) ) {
    out.push(`${what}: ${t}: unknown Aspect "${t.slice(family.length)}" (${ASPECTS.join(", ")})`);
  }
  if ( family === "enterBlockType." && !TYPES.includes(t.slice(family.length)) ) out.push(`${what}: ${t}: type ${TYPES.join(", ")}`);
  for ( const f of ["mode", "limit", "cost", "amount", "group", "at"] ) {
    if ( String(m[f] ?? "").trim() ) out.push(`${what}: ${t} takes no ${f}`);
  }
  return out;
}

export function checkTrigger(t, i, ctx) {
  const out = [];
  const what = `trigger ${i}`;
  if ( t.effect === "maneuver" ) {
    for ( const part of String(t.resource ?? "").split("|").map(s => s.trim()) ) {
      if ( part.startsWith("item:") && !part.slice(5).trim() ) out.push(`${what}: "item:" needs the item's name (item:Hype Maneuver)`);
    }
  }
  if ( t.effect === "leave" ) {
    const r = String(t.resource ?? "").trim();
    if ( !LEAVE_KEYS.includes(r) && !(/^[a-z0-9]+$/.test(r) && (!TRANSFORMATION_SLUGS.size || TRANSFORMATION_SLUGS.has(r))) ) {
      out.push(`${what}: leave resource "${r}" (blank / this, all, enhancements, forms, grandAwakening, or a Transformation's slug)`);
    }
    if ( ctx.racial && ["", "this", "grandAwakening"].includes(r) ) out.push(`${what}: a Racial Trait has no Transformation of its own to leave`);
    if ( !["", "0", "1", "2"].includes(String(t.value ?? "").trim()) ) out.push(`${what}: leave value is blank or 2 (2: without the Stress Exhaustion of Exhausting)`);
  }
  return out;
}

// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
