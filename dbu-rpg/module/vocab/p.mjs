/**
 * Package P (round 10): token movement in combat as moments (rules/movement-watch.mjs). Only Package P edits this file.
 * Texts in build/lang/p.json.
 */
/** flag.noProvokeExploit: your movement provokes no Exploit Maneuver. */
export const targets = { "flag.noProvokeExploit": "DBU.Target.flagNoProvokeExploit" };
export const prefixes = [];
/** moved: you moved (@squares, @leftMelee, @enteredMelee, @endOpponentsAdjacent, @endAlliesAdjacent);
 * opponentLeftMelee: an Opponent left your Melee Range (other = it; the Exploit it provokes); opponentEnteredMelee: an
 * Opponent entered it; endedAdjacent: a Character ended its movement adjacent to you (@isOpponent / @isAlly). */
export const events = ["moved", "opponentLeftMelee", "opponentEnteredMelee", "endedAdjacent"];
export const effects = [];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
