// Racial package RD (round 23): what it teaches the automation validator.
// AG: the attack and defense variables of wasHit / allyWasHit (validate.mjs base lists)
const AG_ATTACK = ["physical", "energy", "magic", "signature", "basic", "ultimate", "aoe", "charges", "wager", "category", "crit",
  "targets", "elemental", "dkpCost", "dkpWager", "kp", "dmgAttr", "favored", "calledShot", "oos", "armed", "unarmed"];
const AG_DEFEND = ["dodge", "parry", "guard", "crossCounter", "directHit", "powerFlare", "none", "divineFlex", "counter", "defending"];
export const EVENT_VARS = { allyRoll: ["allyHasAwk."], allyDefeated: ["allyHasAwk."], surge: ["vengefulSurge", "vengefulScore", "primalSurge", "legendarySurge"], conditionGained: ["cond_", "level", "added"], bonusMomentum: [], opponentMoved: ["squares", "provokes", "leftMine", "vs."], endOfEncounter: [], maneuverUsed: ["tag_", "kpBase"], allyDodged: ["allyDistance", "vs.", "dodge", "parry", "guard", "crossCounter", "directHit", "powerFlare", "physical", "energy", "magic", "signature"], techniqueCopied: ["kpCost"], rolled: ["reacted."], grappleStart: ["vs."], breakValueLost: ["via_", "natural", "n"], roll: ["rollSpent."], otherTurnStart: ["vs."], placed: ["placedNextToOpponent", "placedNextToAlly", "placedVia_"], moved: ["forced"], damaged: ["interveneFree", "interveneFreeFx."], attackHit: ["interveneFree", "interveneFreeFx."], empowered: ["lpGained"],
  opponentDefeated: ["byMe", "byAttack", "opponentMinion", "vs."],
  // RX: the reactions of a Pressure Check / a Clash's roll, what an attack's roll reactions spent
  pressureCheck: ["reacted.", "rollSpent."], clashWon: ["reacted.", "chose."], clashLost: ["reacted.", "chose."],
  woundRolled: ["rollSpent."], attackHit: ["interveneFree", "interveneFreeFx.", "rollSpent."], attackMade: ["rollSpent."], attackMissed: ["missedAll", "rollSpent."],
  // DC: the defender's choices after its defense
  damaged: ["interveneFree", "interveneFreeFx.", "defChose.", "waivedFx."], dodged: ["defChose.", "waivedFx."],
  // SZ: the Grapple Check that holds the tail
  clashWon: ["reacted.", "chose.", "tailGrab"], clashLost: ["reacted.", "chose.", "tailGrab"],
  // AG: a hit before its Damage (yours / an Ally's)
  wasHit: [...AG_ATTACK, ...AG_DEFEND, "defChose.", "waivedFx.", "vs."],
  allyWasHit: ["allyHasAwk.", ...AG_ATTACK, ...AG_DEFEND, "allyMinion", "allyMark.", "vs.", "allyMyMinion", "allyNextToGlassFeature", "allyGlassFeatureHV"],
  // CS4: who else that attack targets
  targeted: ["alliesTargeted", "alliesTargetedMight", "powerShot"],
  collided: ["damage"],
  // E2: what the watchers see of a Maneuver
  opponentManeuver: ["actionCost", "targetsMe"], allyManeuver: ["actionCost", "targetsMe"],
  // DD3: a Counter answered your attack
  attackCountered: [...AG_ATTACK, ...AG_DEFEND, "hit", "vs."],
  // MO: the Ally of the event is a Minion of yours
  allyHit: ["allyHasAwk.", "allyMyMinion"], allyDamaged: ["allyHasAwk.", "allyMyMinion"], allyAttack: ["allyHasAwk.", "allyMyMinion"], allyPowerUp: ["allyHasAwk.", "allyMyMinion"],
  allySurge: ["allyHasAwk.", "allyMyMinion"], allyTargeted: ["allyHasAwk.", "allyMyMinion"], allyExploitTriggered: ["allyHasAwk.", "allyMyMinion"], allyInflict: ["allyHasAwk.", "allyMyMinion"] };
export const BASE_VARS = ["powerBase", "weightsWorn", "opponentsOppositeAlign", "dnaCopies", "myMinions", "legendTransTopReq", "activeFormTopReq", "formTopReqMax", "belowForOthers", "opponentBelowMax", "opponentBelowMin", "actionsPerRound", "dnaStacks", "ownerPL", "piloting", "duplicateUses", "healingSurgesRound", "lightLevel", "lightLevelEff", "allyBelowMax", "bestialTraits", "greaterDiceOn", "kiMultiplier", "failedThr.", "entrusted4Sig", "tailHeld", "alsoHealthy", "kiMultOther", "onGlass", "glassSurrounded", "glassReach", "areaOfRule", "alliesInRule", "alliesInRuleNM", "nextToGlassFeature", "glassFeatureHV"];
export const PREFIX_VARS = ["allyPicked", "resBase", "activeRace", "allyMarkAdjacent", "onArea", "markedOpponents", "markedAllies", "markNearest", "ranksNow", "stateBlock", "env", "weather", "usedLimit", ];
export const ATTACK_VARS = ["chargeWound"];
export const DEFENSE_VARS = [];
export const ATTACK_OPTION_VARS = [];
export const ATTACK_EXTRA = ["rollSpent."];
export const DEFENSE_OPTION_VARS = [];
export const WOUND_OPTION_VARS = ["rollSpent.", "category", "chargeWound"];
export const VS_VARS = ["interveneFree", "interveneFreeFx.", "defChose.", "waivedFx."];
// CS4: a trigger's Clash knows the event's attack facts
export const CLASH_VARS = ["alliesTargeted", "alliesTargetedMight", "powerShot", "charges", "aoe"];
export const TARGET_VARS = { "allyGuard.defeat": ["to."], "allyGuard.defeatKeep": ["to."], "foeGuard.critToBotch": ["to."], "allyGuard.cognitiveShift": ["to."],
  "foeGuard.steadfast": ["to."], "allyGuard.skillBonus": ["to."],
  // NM5: the joiner is the one whose technique you copied
  "unitedBy.": ["copySource"] };
export const FIELD_VARS = {};
export const WITH_OTHER = ["otherTurnStart", "opponentMoved", "opponentDefeated", "wasHit", "allyWasHit", "attackCountered"];
// AG: an Ally guard takes a limit (limitKey) like the option pieces
export const OPTION_PREFIXES = ["allyGuard.", "foeGuard."];
export const TEXT_TARGETS = ["clashAlt.", "clashAltDef.", ];
export const DICE_TARGETS = [];
export const PREFIX_RE = [];
// eslint-disable-next-line no-unused-vars
export function checkModifier(m, i, ctx) {
  if ( m?.checkCost && !String(m.target ?? "").startsWith("attack.") ) return [`modifier ${i}: "checkCost" only on attack.* option pieces`];
  return [];
}
// eslint-disable-next-line no-unused-vars
export function checkTrigger(t, i, ctx) {
  if ( ["equip", "unequip"].includes(t?.effect) && !String(t.resource ?? "").trim() ) return [`trigger ${i}: ${t.effect} needs the item's name as resource`];
  return [];
}
// eslint-disable-next-line no-unused-vars
export function checkEntry(e, key, ctx) { return []; }
