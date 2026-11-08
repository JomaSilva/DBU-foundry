/**
 * The automation vocabulary of the rules engine: the trigger events, effects, modes, targets and durations, the
 * Maneuver keys of the "maneuver" effect, and the modifier targets the feature packages add. Plain ESM with no Foundry
 * global, so that Node can import it too:
 * - data/fields.mjs builds the trigger schema's `choices` from these lists;
 * - config.mjs adds MODIFIER_TARGETS / MODIFIER_TARGET_PREFIXES to DBU.modifierTargets / DBU.MODIFIER_TARGET_PREFIXES
 *   and runs registerTargets(DBU) after its own skill/condition/Attribute loops;
 * - build/automation/tools/validate.mjs checks the automation entries against it.
 *
 * The base lists below are the vocabulary that existed before the packages. Each package adds its own in its file
 * (vocab/a.mjs: attack and defense; vocab/b.mjs: triggers, moments, Maneuvers; vocab/c.mjs: sheet data, rolls,
 * Clashes); a package never edits this file or another package's file. Additions keep the base order and go after it,
 * in the order a, b, c; a key already listed is not added twice (see CONFLICTS).
 */
import * as A from "./a.mjs";
import * as B from "./b.mjs";
import * as C from "./c.mjs";
import * as D from "./d.mjs";
import * as E from "./e.mjs";
import * as F from "./f.mjs";
import * as G from "./g.mjs";
import * as I from "./i.mjs";
import * as Lp from "./l.mjs";
import * as M from "./m.mjs";
import * as N from "./n.mjs";
import * as O from "./o.mjs";
import * as P from "./p.mjs";
import * as Q from "./q.mjs";
import * as Rv from "./r.mjs";
import * as S from "./s.mjs";
import * as Vv from "./v.mjs";
import * as W from "./w.mjs";
import * as X from "./x.mjs";
import * as Y from "./y.mjs";
import * as Z from "./z.mjs";
import * as AA from "./aa.mjs";
import * as RA from "./ra.mjs";
import * as RB from "./rb.mjs";
import * as RD from "./rd.mjs";

/** The feature packages, in merge order. */
export const PACKAGES = { a: A, b: B, c: C, d: D, e: E, f: F, g: G, i: I, l: Lp, m: M, n: N, o: O, p: P, q: Q, r: Rv, s: S, v: Vv, w: W, x: X, y: Y, z: Z, aa: AA, ra: RA, rb: RB, rd: RD };
const LIST = Object.values(PACKAGES);

/** When a trigger runs (data/fields.mjs triggersField `event`; the first one is the schema's initial value). */
export const BASE_EVENTS = ["startOfRound", "endOfRound", "startOfTurn", "endOfTurn", "startOfEncounter", "stackGain", "attackMade",
  "attackHit", "damaged", "attackMissed", "dodged", "threshold", "transform", "revert", "burstLimit", "grandAwakening", "powerUp",
  "surge", "energyCharge", "stateEnter", "targeted", "use"];
/** What a trigger does (`effect`). */
export const BASE_EFFECTS = ["life", "ki", "capacity", "counters", "actions", "power", "charges", "dot", "dkp", "resource",
  "resourceSet", "state", "condition", "buff", "maneuver", "message"];
/** How a trigger runs (`mode`): auto (apply) | ask (chat button) | remind (message only). */
export const BASE_MODES = ["auto", "ask", "remind"];
/** Whom a trigger's effect goes to (`target`): self | other (the other Character of the event). */
export const BASE_TRIGGER_TARGETS = ["self", "other"];
/** How long a buff/state/condition effect lasts (`duration`). */
export const BASE_DURATIONS = ["none", "endOfTurn", "startOfNextTurn", "endOfNextTurn", "endOfRound", "encounter", "untilRevert"];
/** Maneuvers the "maneuver" effect can use Out-of-Sequence (its `resource`; a list "powerUp|energyCharge" asks). */
export const BASE_MANEUVERS = ["powerUp", "energyCharge", "combatRecovery", "healingSurge", "kiSurge", "basicAttack", "signature",
  "transformation", "movement", "empower", "surge"];
/** How a modifier on an option target (attack.*, defense.*...) is offered: "" by itself | "ask" a box in the dialog. */
export const MODIFIER_MODES = ["", "ask"];

/** Problems found while merging (a key two packages add, or one a package adds that the base already has). */
export const CONFLICTS = [];

function mergeList(base, field, what) {
  const out = [...base];
  const from = new Map(base.map(k => [k, "base"]));
  for ( const [name, pkg] of Object.entries(PACKAGES) ) {
    for ( const k of pkg[field] ?? [] ) {
      if ( from.has(k) ) { CONFLICTS.push(`vocab/${name}.mjs: ${what} "${k}" is already in ${from.get(k)}`); continue; }
      from.set(k, `vocab/${name}.mjs`);
      out.push(k);
    }
  }
  return out;
}

export const TRIGGER_EVENTS = mergeList(BASE_EVENTS, "events", "event");
export const TRIGGER_EFFECTS = mergeList(BASE_EFFECTS, "effects", "effect");
export const TRIGGER_MODES = [...BASE_MODES];
export const TRIGGER_TARGETS = mergeList(BASE_TRIGGER_TARGETS, "triggerTargets", "trigger target");
export const TRIGGER_DURATIONS = mergeList(BASE_DURATIONS, "durations", "duration");
export const MANEUVER_KEYS = mergeList(BASE_MANEUVERS, "maneuvers", "maneuver");
/** Maneuver key families of the "maneuver" effect ("item:<Name>": that item of the actor, Package E). */
export const MANEUVER_PREFIXES = mergeList([], "maneuverPrefixes", "maneuver prefix");

/** Modifier targets the packages list ({ "<target>": "<label or lang key>" }); config.mjs adds them to DBU.modifierTargets. */
export const MODIFIER_TARGETS = {};
{
  const from = new Map();
  for ( const [name, pkg] of Object.entries(PACKAGES) ) {
    for ( const [k, label] of Object.entries(pkg.targets ?? {}) ) {
      if ( from.has(k) ) { CONFLICTS.push(`vocab/${name}.mjs: target "${k}" is already in ${from.get(k)}`); continue; }
      from.set(k, `vocab/${name}.mjs`);
      MODIFIER_TARGETS[k] = label;
    }
  }
}
/** Target families accepted by prefix ("vs." ...); config.mjs adds them to DBU.MODIFIER_TARGET_PREFIXES. */
export const MODIFIER_TARGET_PREFIXES = mergeList([], "prefixes", "target prefix");

/** Generated targets (loops over DBU.saves, DBU.skills, DBU.ATTRIBUTES...): each package's registerTargets(DBU). */
export function registerTargets(DBU) {
  for ( const pkg of LIST ) pkg.registerTargets?.(DBU);
}
