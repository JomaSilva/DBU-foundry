/**
 * Racial package RB (round 22): the team Maneuvers of the attack card (combat/team-maneuvers.mjs) — United Attack,
 * Intervene, Reflect — and the pieces that change them. Only Package RB edits this file. Texts in build/lang/rb.json.
 */
/**
 * intervene.noCounter: you Intervene without a Counter Action (@vs = the Ally; @wall / @deflect / @distant: the option);
 * intervene.noCounterFor: who Intervenes for you spends no Counter Action (@vs = that Character);
 * united.noAction: you join a United Attack without an Action (@vs = the attacker; the attack's variables, @unitedCount);
 * unitedBy.noAction: who joins your attack spends no Action (@vs = that Character); united.wound: + Wound to the attack you
 * join; unitedBy.charges: + Energy Charges to your attack when someone joins it; reflect.strike: + Strike to your Reflect.
 */
export const targets = {
  "intervene.noCounter": "DBU.Target.interveneNoCounter", "intervene.noCounterFor": "DBU.Target.interveneNoCounterFor",
  "united.noAction": "DBU.Target.unitedNoAction", "unitedBy.noAction": "DBU.Target.unitedByNoAction",
  "united.wound": "DBU.Target.unitedWound", "unitedBy.charges": "DBU.Target.unitedByCharges", "reflect.strike": "DBU.Target.reflectStrike",
  // RC: Life Points may go down to −this before the Defeat (Survivor)
  lifeFloor: "DBU.Target.lifeFloor"
};
export const prefixes = [];
export const events = [];
export const effects = [];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
