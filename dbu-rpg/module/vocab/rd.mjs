/**
 * Racial package RD (round 23): small engine pieces the main races' Racial Traits asked for. Only Package RD edits this
 * file. Texts in build/lang/rd.json.
 */
/** clash.autoLose: the other side of the Clash wins without rolling; apparel.maxLayers: at most N layers of Apparel;
 * flag.lifeOneAtFloor: below 0 LP an effect that would leave 1 LP leaves 1 above −lifeFloor. */
export const targets = { "clash.autoLose": "DBU.Target.clashAutoLose", "apparel.maxLayers": "DBU.Target.apparelMaxLayers",
  "flag.lifeOneAtFloor": "DBU.Target.flagLifeOneAtFloor",
  // T25: x the Damage you deal to that Character; the Ki Point Cost of your attacks lowers no Capacity; Cross Counter keeps
  // your Defense Value; no Energy / Magic attack
  "vs.damageDealtMult": "DBU.Target.vsDamageDealtMult", "flag.costNoCapacity": "DBU.Target.costNoCapacity",
  "flag.crossCounterFullDv": "DBU.Target.crossCounterFullDv", "block.energyAttack": "DBU.Target.blockEnergyAttack",
  "block.magicAttack": "DBU.Target.blockMagicAttack",
  // T26: you count as possessing at most that many Super Stacks (the lowest wins)
  "superStacks.countAs": "DBU.Target.superStacksCountAs",
  // T27 (a "maneuver" effect's `with`): that Surge does not count toward the Surge Maneuver's own uses
  "surge.uncounted": "DBU.Target.surgeUncounted",
  // T28 (a `with`): this Ki Surge ignores surge.kiMult (Power Battery)
  "surge.ignoreKiMult": "DBU.Target.surgeIgnoreKiMult",
  // T29: paying only an attack's Life Point Cost gives no Reduced Momentum (Kaioken)
  "flag.attackLifeNoMomentum": "DBU.Target.attackLifeNoMomentum",
  // AH: your effects also see you as Healthy (as well as your real Health Threshold)
  alsoHealthy: "DBU.Target.alsoHealthy",
  // OA: + Squares of your Area of Rule (the Oni's Standard Sphere of 3 Squares)
  areaOfRule: "DBU.Target.areaOfRule",
  // AG: an Opponent's Damage that would Defeat this Ally of yours is reduced by the value (@to.mark.<slug>...)
  "allyGuard.defeat": "DBU.Target.allyGuardDefeat",
  // CS2: an Opponent's Cognitive Clash against this Ally of yours may be taken by you (asked)
  "allyGuard.cognitiveShift": "DBU.Target.allyGuardCognitiveShift",
  // KR: an Opponent's Critical Result on a Combat Roll becomes a Botch Result (limit counted on you)
  "foeGuard.critToBotch": "DBU.Target.foeGuardCritToBotch",
  // WJ: an Ally of yours knocks this Opponent through a Health Threshold: −value to its Steadfast Check (Wrath of the Dragon)
  "foeGuard.steadfast": "DBU.Target.foeGuardSteadfast",
  // WJ: this Ally of yours uses your Skill Bonus in a Skill Clash when it is higher (Skilled Ogre; value 1)
  "allyGuard.skillBonus": "DBU.Target.allyGuardSkillBonus",
  // F11: no other Healing Surge this Round; no Guard Down from your Grapple at that many Squares; ± Combat Rolls of the
  // Character you Grapple; Squares less for every movement of yours by any means (forced ones too)
  "flag.noHealingSurge": "DBU.Target.noHealingSurge", "grapple.freeRange": "DBU.Target.grappleFreeRange",
  "grapple.foeCombat": "DBU.Target.grappleFoeCombat", "move.reduce": "DBU.Target.moveReduce",
  // F12: a Wound Roll lower than the value deals no Damage; you pass through Characters and Features; + uses per Round
  // and up to that many more Size Categories smaller for Brood Parent's Duplicates
  "vs.ignoreWoundBelow": "DBU.Target.ignoreWoundBelow", "flag.passThrough": "DBU.Target.passThrough",
  "duplicate.uses": "DBU.Target.duplicateUses", "duplicate.shrinkMax": "DBU.Target.duplicateShrinkMax",
  // F13: no Counter Maneuver (Counter Actions are not spent)
  "flag.noCounterManeuver": "DBU.Target.noCounterManeuver",
  // F14: your Forms with the Arcosian Racial Requirement are part of the Metamorphosis Line (Emperor); switching to your
  // Avatar in a Transformation lets it use the Transformation Maneuver Out-of-Sequence (Switch to a Hero 3)
  "flag.arcosianMetamorphosis": "DBU.Target.arcosianMetamorphosis", "flag.avatarTransform": "DBU.Target.avatarTransform",
  // F15: the Adaptation Points pieces count twice on a Tail Attack's Wound Roll; + Attribute Points per Skill Improvement
  // converted from a Character Perk
  "flag.tailAPDouble": "DBU.Target.tailAPDouble", "attributePoints.perConvertedSI": "DBU.Target.attrPerConvertedSI",
  // CS1: an adjacent Ally takes the Defeating Damage down to 1 LP above it; no Weapons / Armed attacks; no Grapple; Sudden Stop
  "allyGuard.defeatKeep": "DBU.Target.allyGuardDefeatKeep", "block.armed": "DBU.Target.blockArmed", "block.grapple": "DBU.Target.blockGrapple",
  "suddenStop.extra": "DBU.Target.suddenStopExtra", "suddenStop.free": "DBU.Target.suddenStopFree",
  // CS2: the first Collision Damage of each Combat Round is 0
  "collision.ignoreRound": "DBU.Target.collisionIgnoreRound",
  // CS4: your Spontaneous Technique Points; a Technique Crafter Signature starts at 0 TP
  stp: "DBU.Target.stp", "flag.tcBaseZero": "DBU.Target.tcBaseZero",
  // T1: a Unique Ability of 1 Action is an Instant Maneuver for you
  "useInstant.ua1": "DBU.Target.useInstantUa1",
  // F13: at least that Size Category (its index: 6 = Gigantic), read at stage 1.5
  "size.min": "DBU.Target.sizeMin",
  // F10: the Movement Maneuver and your own placings are refused (Rooted)
  "flag.noMovement": "DBU.Target.noMovement",
  // BC: Light Levels moved toward Normal by n (Alternate Sight), or ignored
  lightShift: "DBU.Target.lightShift", "flag.ignoreLight": "DBU.Target.ignoreLight",
  // F7: × the Surgency of a Ki Surge, rounded up (Genie 4's 1/4)
  "surge.kiSurgency": "DBU.Target.surgeKiSurgency",
  // F1: no Life Points from the effects of your own Traits (Undead Survival while Undying)
  "flag.noTraitLifeRegain": "DBU.Target.noTraitLifeRegain",
  // AO: up to N Advantages (+2(T) Wound each) / Disadvantages of 6 TP or less (+1(T) KP each) taken off a Signature
  "attack.removeAdvantage": "DBU.Target.removeAdvantage", "attack.removeDisadvantage": "DBU.Target.removeDisadvantage",
  // Z: a Ki Wager that costs no Ki Points nor Capacity (Way of the Warrior's Life Points); more Basic Attack uses of a
  // Profile per Round; more Signature Technique Maneuvers per Round; no limit at all on them
  "attack.wagerFree": "DBU.Target.wagerFree", sigUses: "DBU.Target.sigUses", "flag.sigUnlimited": "DBU.Target.sigUnlimited",
  // OG: a piece that does nothing, so a Racial option that only grants items can be switched on
  optionSwitch: "DBU.Target.optionSwitch",
  // RG: + Squares of Melee Range for a Grapple made through an effect (its `with`); Empower: give the most you can; the
  // Ki Points an Empower gives you become Life Points
  "grapple.reach": "DBU.Target.grappleReach", "flag.empowerForceMax": "DBU.Target.flagEmpowerForceMax",
  "empowered.toLife": "DBU.Target.empoweredToLife",
  // RT: each Health Threshold's penalty multiplied (0 = none) and its own Steadfast Check
  "threshold.bruisedPenaltyMult": "DBU.Target.thrBruisedMult", "threshold.injuredPenaltyMult": "DBU.Target.thrInjuredMult",
  "threshold.criticalPenaltyMult": "DBU.Target.thrCriticalMult", "steadfast.bruised": "DBU.Target.steadfastBruised",
  "steadfast.injured": "DBU.Target.steadfastInjured", "steadfast.critical": "DBU.Target.steadfastCritical",
  // RE: forbid an action (refused with the effect's name); other Characters' effects cannot reduce your Ki Points
  "block.attack": "DBU.Target.blockAttack", "block.signature": "DBU.Target.blockSignature", "block.uniqueAbility": "DBU.Target.blockUA",
  "block.powerUp": "DBU.Target.blockPowerUp", "block.energyCharge": "DBU.Target.blockCharge", "block.transformation": "DBU.Target.blockTransformation",
  // T3: forbid the Combat Recovery / the Empower Maneuver
  "block.combatRecovery": "DBU.Target.blockCombatRecovery", "block.empower": "DBU.Target.blockEmpower",
  // T4: the Vengeful Surge (any Surge may be one; its Dice Score, AoE Squares, the Inferiors' extra loss)
  "flag.vengefulSurge": "DBU.Target.flagVengefulSurge", "surge.vengefulDice": "DBU.Target.surgeVengefulDice",
  "surge.vengefulRange": "DBU.Target.surgeVengefulRange", "surge.vengefulInferiorHalf": "DBU.Target.surgeVengefulInferiorHalf",
  "flag.primalSurge": "DBU.Target.flagPrimalSurge",
  // T6: Ki Points may go this much over the maximum
  kiOverMax: "DBU.Target.kiOverMax",
  // T7: the Health Thresholds you count as below for your effects; your Guard Down hidden from the others' effects
  belowAtLeast: "DBU.Target.belowAtLeast", belowShift: "DBU.Target.belowShift", belowAtMost: "DBU.Target.belowAtMost",
  "flag.guardDownHidden": "DBU.Target.guardDownHidden",
  // T8: no Ki Wager / no Life Point loss through Compelled
  "flag.compelledNoWager": "DBU.Target.compelledNoWager", "flag.compelledNoLife": "DBU.Target.compelledNoLife",
  // T9: a Ki Surge may be a Legendary Surge / a Healing Surge (through an effect); your effects read @counters as 0
  "flag.legendarySurge": "DBU.Target.flagLegendarySurge", "flag.kiSurgeAsHealing": "DBU.Target.kiSurgeAsHealing",
  "flag.countersZero": "DBU.Target.countersZero",
  // T12: the cap of Charging Assault's Wound bonus, in (T)
  "chargingAssault.capT": "DBU.Target.chargingAssaultCapT",
  // T14: an effect that would put you in God Ki puts you in the Superior State instead
  "flag.godKiAsSuperior": "DBU.Target.godKiAsSuperior",
  "flag.noKiLossFromOthers": "DBU.Target.flagNoKiLossFromOthers",
  // AP: an Advantage of your choice among your Copied Techniques' (value = the most TP)
  "attack.advantagePick.copied": "DBU.Target.attackAdvantagePickCopied",
  // MW: the Ki Wager limit of this attack (lowest wins)
  "attack.wagerMax": "DBU.Target.attackWagerMax",
  // EN: the Capacity reset to its maximum before the attack; the Entrusted State's 4th effect on a Signature Technique too
  "attack.capacityFull": "DBU.Target.attackCapacityFull", "entrusted4.signature": "DBU.Target.entrusted4Signature" };
/** SZ: scoreSet.<attr> (that Score, 0 included; lowest wins), innateState.<state> (always in it), conditionLock.<condition>
 * (it cannot be removed). */
/** Z: sigAdvFree.<advantage> (it costs no TP on your techniques), profileUses.<profile> (+ Basic Attack uses per Round). */
/** BJ: jacket.<target> (your Battle Jackets get <target>: Way of the Pilot's TP). */
/** F11: kpCost.tag.<tag> (± KP of the item an effect tagged: Unique Monstrosity). */
export const prefixes = ["copies.max.", "aspectMax.", "markAll.", "markAllChars.", "markCompelled.", "thresholdPct.", "clashAlt.", "clashAltDef.", "scoreSet.", "innateState.", "conditionLock.", "sigAdvFree.", "profileUses.", "jacket.", "kpCost.tag.",
  // F12: stateBlock.<state> (that State cannot be entered), duplicateGrant.<maneuver slug> (your Duplicates get it)
  "stateBlock.", "duplicateGrant.",
  // T28: resAdd.<resource slug | power> (+ to what your effects read of it)
  "resAdd.",
  // F15: tagOffNormal.<tag> (the item tagged so does not work in your Normal State)
  "tagOffNormal.",
  // CS2: stressReq.tag.<tag> (± the Stress Test Requirement of the Transformation tagged so)
  "stressReq.tag.",
  // CS3: kpCost.tagFree.<tag> (the item carrying that tag costs no KP)
  "kpCost.tagFree.",
  // T2: godFreq.<slug> (that God Maneuver is <n>/Round, no per-Encounter limit)
  "godFreq.",
  // T1: useInstant.<slug> (that Maneuver is an Instant Maneuver for you: no Action)
  "useInstant."];
/** RE opponentDefeated: an Opponent of yours was Defeated (other = it; @byMe, @byAttack, @opponentMinion). */
/** AG wasHit: your defense ended in a hit, before the Damage (other = the attacker; the card and row go with it); allyWasHit:
 * the same for an Ally of yours (@allyMark.<slug>, @allyMinion). */
/** DD3 attackCountered: an Opponent answered your attack with a Defend option that spends a Counter Action (other = it). */
/** OA collided: you take Collision Damage (@damage). */
export const events = ["conditionGained", "bonusMomentum", "opponentDefeated", "wasHit", "allyWasHit", "attackCountered", "collided",
  // PL placed: an effect placed you on a Square (a teleport): @placedNextToOpponent / @placedNextToAlly there
  "placed",
  // F3 otherTurnStart: another Character's turn starts (other = that Character)
  "otherTurnStart",
  // F13 allyRoll / opponentRoll: an Ally's / Opponent's roll before its result is used (your reactions change it);
  // breakValueLost: an Apparel piece of yours lost Break Value
  "allyRoll", "opponentRoll", "breakValueLost",
  // F14 grappleStart: you entered a Grapple as the Grappler (other = the Grappled)
  "grappleStart",
  // F15 triggerRoll: a shared trigger roll of yours (@rollKey_<key>), before its result is used
  "triggerRoll",
  // CS1 allyDodged: an attack missed an Ally of yours; techniqueCopied: you gained a Copied Technique
  "allyDodged", "techniqueCopied",
  // CS2 opponentMoved: an Opponent of yours moved (@leftMine); endOfEncounter: the Combat Encounter ended
  "opponentMoved", "endOfEncounter"];
/** equip / unequip: the actor's item named by the resource. */
/** CB critToBotch: the Strike Roll's Critical Result of the event's attack (its card) becomes a Botch Result. */
/** AG attackSoak: + value Soak for that row of the attack (wasHit / allyWasHit), before its Damage. */
/** DD2 redefend (wasHit): the attack goes back to your Defense Declaration; DD3 cancelAttack (attackCountered): cancel your attack,
 * refunded, and attack again. */
/** CS4 attackMissTeam ("targeted"): that attack misses you and every Ally of yours it targets. */
/** MD createItem: an equipped (Integrated) accessory named `resource` on your sheet. */
/** AR placeArea: a Sphere AoE (value = its Magnitude) of the resource's kind ("Bog") centered on you, on the map. */
/** PD powerDrain (target the Grappled; value = Actions): its LP and KP lose 1/2 your Might each, you regain those KP;
 * absorbAttack ("dodged" after a Parry of an Energy / Magic attack): its Urgent Wound Roll, 1/2 back as KP. */
export const effects = ["equip", "unequip", "critToBotch", "attackSoak", "redefend", "cancelAttack", "attackMissTeam", "createItem", "placeArea",
  "powerDrain", "absorbAttack",
  // E2 actAfter (target the Ally: your turn right after its own this Round), swapTarget ("targeted", target the adjacent
  // Ally: swap places, it becomes the target), copyManeuver ("opponentManeuver": that Maneuver Out-of-Sequence)
  "actAfter", "swapTarget", "copyManeuver",
  // GS glassSoldiers (value: how many, on the Glass Squares nearest to you), soldierTurn (start of turn: your Soldiers heal on
  // Glass or spread it), destroyFeature (the Glass Feature next to you / the Ally of the event)
  "glassSoldiers", "soldierTurn", "destroyFeature",
  // GS originFromFeature: this turn your attacks originate from one of your Glass Soldiers (the one you control on the map)
  "originFromFeature",
  // PL moveOther (value: Squares; the event's other Character / your target, a direction you pick), teleport (resource ""
  // you, "other" / "target"; value: at most that many Squares from you, 0 anywhere): a Square you pick on the map
  "moveOther", "teleport",
  // LN maxLifeLoss (value: Max LP lost until the end of the encounter), createMinion (resource: its Racial Traits)
  "maxLifeLoss", "createMinion",
  // GP createGoop (a Duplicate Minion without gear), reabsorbGoops (value: how many, 0 any; resource "all" / "notThisTurn")
  "createGoop", "reabsorbGoops",
  // F5 integrateItem / destroyIntegrated (a dialog picks the item), compelRandom (value: Squares)
  "integrateItem", "destroyIntegrated", "compelRandom",
  // TS traitSwitch (value 1 / 0; resource a Racial Trait's name, "pick:<group>", "all:<group>", group "*" any)
  "traitSwitch",
  // F10 createDuplicate (value: Size Categories; resource: its name)
  "createDuplicate",
  "launchOther", "tagItem",
  "consumeMinions", "storeItems", "takeStored", "storeWeaponOf", "consumeLight", "weaponQualities",
  "tempItem",
  "recordCopy", "copyStack", "switchAvatar",
  "lifeLostAs",
  "borrowApparel", "absorbManeuver",
  "initiativeShift", "tempGrant", "extendTimed", "rerollInitiative", "awakeningLose"];
/** untilDefendedRound: the holder's next defense or the end of the Round, whichever comes first. */
/** SW3 endOfThisTurn: until the end of the turn going on now (whoever's it is). */
export const durations = ["untilDefendedRound", "endOfThisTurn"];
/** RG: the Grapple, Launch and Pin Maneuvers (combat/grapple.mjs) Out-of-Sequence. */
export const maneuvers = ["grapple", "launch", "pin", "ua1", "vengefulSurge", "primalSurge", "legendarySurge",
  // T27: a 1-Action Standard Unique Ability of yours (any / Technical / Magical)
  "uaStd", "uaTechnical", "uaMagical"];
/** F12 targets: every Character the clicking user targets. */
export const triggerTargets = ["targets"];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
