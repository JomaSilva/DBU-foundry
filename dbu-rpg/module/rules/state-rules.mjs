/**
 * Package BB (round 20): what the States and Special States forbid (dbu-rpg.com/states, /special-states):
 * - Liquid (5): no Attacking Maneuver, no Unique Ability;
 * - Feral, Wild (1): no Signature Technique, no Unique Ability;
 * - Spectator (4): no Power Up, Transformation or Energy Charge Maneuver, no Attacking Maneuver (and no Special Maneuver
 *   or Unique Ability that targets another Character: a warning only, the player knows its target);
 * - Surging (3): an attack that does not include your Focus (the "Focus" mark) unless it is an AoE that does: a note.
 * "ignoreState.<state>.<n>" lifts that rule.
 */
import { stateEffectIgnoredNow } from "../combat/triggers.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const level = (actor, key) => Number(actor?.system?._effectiveStates?.[key] ?? actor?.system?.states?.[key] ?? 0) || 0;
const RULES = [
  { state: "liquid", n: 5, what: ["attack", "signature", "uniqueAbility"] },
  { state: "feral", n: 1, what: ["signature", "uniqueAbility"] },
  { state: "spectator", n: 4, what: ["powerUp", "transformation", "energyCharge", "attack", "signature"] }
];

/** The reason a State forbids that action ("attack", "signature", "uniqueAbility", "powerUp", "transformation",
 * "energyCharge"), or "". */
export function stateBlock(actor, what) {
  for ( const r of RULES ) {
    if ( !r.what.includes(what) || !(level(actor, r.state) > 0) || stateEffectIgnoredNow(actor, r.state, r.n) ) continue;
    return L("DBU.StateRule.Forbids", { state: L(`DBU.State.${r.state}`), what: L(`DBU.StateRule.What.${what}`) });
  }
  // RE "block.<what>" (attack, signature, uniqueAbility, powerUp, energyCharge, transformation; CS1 armed, grapple;
  // T3 combatRecovery, empower; T25 energyAttack, magicAttack): an
  // effect forbids it
  const b = actor?.system?.buckets?.[`block.${what}`];
  if ( (Number(b?.total) || 0) > 0 ) {
    const by = [...new Set((b.parts ?? []).map(p => p.label).filter(Boolean))].join(", ");
    return L("DBU.Block.Refused", { what: L(`DBU.StateRule.What.${what}`), by });
  }
  return "";
}

/** Spectator (4): a Special Maneuver or Unique Ability that targets another Character (the player's call): a warning. */
export function stateWarn(actor, item) {
  if ( !(level(actor, "spectator") > 0) || stateEffectIgnoredNow(actor, "spectator", 4) ) return "";
  if ( !["maneuver", "uniqueAbility"].includes(item?.type) ) return "";
  return L("DBU.StateRule.SpectatorTarget", { name: item.name });
}
