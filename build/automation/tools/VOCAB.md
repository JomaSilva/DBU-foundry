# Automating Transformation effects for the DBU RPG Foundry system — reference

You turn the rules text of Transformation effects into **mechanical automation data** for a Foundry VTT
system. Every effect has a key `slug|Trait|n`. For each effect of your batch decide what the system can do with it and
write an entry. Only mechanical data goes into the output (never copy rules prose into it — a short `note` in your own
words is fine).

## Contents

Read the whole file: a later section adds to an earlier one, and where the two disagree the later one is right.
- **Basics:** Where things are, Output, Modifiers, Formulas, Triggers, Code categories, Judgement.
- **More vocabulary (1) to (4):** what the earlier rounds added (attack options, Defend options, State switches...).
- **Per item type:** FORMS, ENHANCEMENTS AND EVOLVED FORMS; RACIAL TRAITS.
- **More vocabulary (5A): attack and defense.** `@vs.*` and the `vs.*` targets (effects against ONE other Character:
  its Conditions, Size, Initiative, marks...), `@vsMax` / `@vsMin` / `@vsAny` / `@vsCount` over an attack's targets,
  the Defend variables on `attackHit` / `damaged`, the `targeted` event; the option fields `cost`, `amount`, `group`,
  `limitKey`, `at: "wound"`; new `attack.*` targets, `@via_<maneuver>`, Signature tags.
- **More vocabulary (5B): triggers, moments, Maneuvers.** Marks (`mark`, `unmark`, `markPlaced`), `resourceGain` /
  `resourceSpend`, `stateLeave`, `allyDefeated`, `inflict`, `removeCondition`, `leaveState`, trigger target `targeted`,
  the trigger fields `roll`, `rollKey`, `check`, `onCheck`; Maneuver targets (`charge.*`, `surge.*`, `recovery.*`,
  `legend.*`, `empower.*`), `with`, `legendRealized`, `empower`, `empowered`, `grant transformation:`.
- **More vocabulary (5C): sheet data, rolls, Clashes.** Save and Skill targets (`saveProf.*`, `skillRank.*`,
  `natural.*`...), creation budgets and TP/KP costs, derived variables (`@rlm`, `@wielding`, `@apparel.*`, the late
  `@soakNow` / `@surgencyNow` / `@dvNow` / `@tp`...), Size and Apparel targets, the `breakValue` effect, roll reactions
  (events `roll` / `rolled`, effects `reroll`, `natural`, `naturalSet`, `rollBonus`, `critical`, `succeed`), the Clash
  resolver (`clash.*`, `clashWon` / `clashLost`).
- **More vocabulary (6D): other effects, Aspects, States, grants.** Effect references (`@fx.<ref>`, `fxOff` / `fxOn` /
  `fxMult` / `fxAdd` / `fxLimit`, event `fxUsed`, `@viaFx`, `@stateFx`, `@already`), Aspects by modifier (`aspect.*`,
  `aspectSet.*`, `aspectAll.*`, `aspectOf.*`), the Surging State automated, grants of Transformation-page Maneuvers,
  `+active` and `pick:` grants, `@item` / `@used` / `@usedEnc`.
- **More vocabulary (6E): Maneuver events and Transformation rules.** Events `maneuverUsed`, `itemUsed`, `defeatEnd`,
  `allyHit`, `allyDamaged`, `awakeningGain`, `apparelDoff` (and `stackGain` running for real), the `leave` effect, the
  Maneuver keys `item:<Name>`, `standard`, `exploit`, `feint`, the targets `enterBlock*`, `combineBlock`, `leaveBlock`,
  `leaveWhen`, `grandTrigger`.
- **More vocabulary (6F): attack-time additions.** The `with` of an effect's attack (`attack.*=`, `only=`, `via=`,
  `attr=`), `attack.advantage.*` / `attack.superProfile.*`, `@weapon_*`, `@sig_*`, `@viaFx` on attacks,
  `attack.damageAttrTimes`, Wound-time Energy Charges, Punching Down / Up (automatic now), `vs.autoDodge`,
  `vs.noDimDefense`, `vs.ignoreDamageBelow`, `vs.damageMax`, `@defending`, `@vs.distance`.
- **More vocabulary (6G): Allies, the encounter, Counter Actions and Holding Back.** `ally.<target>` pieces (with
  `range`, `group`, `@to.*`), trigger targets `allies` / `team` / `ally`, events `allyAttack`, `allyPowerUp`,
  `allySurge`, `counterSpent`, `holdingBackGain` / `holdingBackLoss`, effects `holdingBack` / `holdingBackSet`,
  `@opponentsCond.*` / `@alliesCond.*` / `@opponentsState.*` / `@alliesState.*`, `resKeep.<slug>`, and the States of
  Transformations (`radiantGod`, `berserk`, `flow`, `unitedPower`...).
- **More vocabulary (6I): Hyped and Analyzed, the Original Form, Grades unlocked.** The Hype and Analysis Maneuvers run
  their own effect (`@res.hyped`, `@vs.mark.analyzed`), `@OM` / `@OFM` / `@OA` / `@OG` / `@OT` of an Evolved Stage's
  Original Form, `maxGrade` and `gradeMax.<slug>`.
- **More vocabulary (6L): the rolls of the others, Adversary Actions.** Events `opponentRolled` / `allyRolled`
  (`@againstMe`, `@rollerDistance`), the cost `aa:<n>`, Modes kept in a resource.
- **More vocabulary (6M): Stances, picks, the Order Maneuver.** The Stance Maneuver sets "<Name> Stance" resources,
  the effect `resourcePick`, the Order Maneuver in the compendium.

The 5A, 5B and 5C vocabulary works together: a `vs.*` piece may read a 5B mark (`@vs.mark.<slug>`), a 5B `check:
"clash:..."` goes through the 5C resolver and its `clash.*` pieces, the cost of a 5A option fires 5B's `resourceSpend`,
a 5C roll reaction sees the attack variables of 5A. Before giving an effect the verdict `code` with the category
`versusTarget`, `attackOption`, `defenseOption`, `clash`, `maneuverChange`, `resourceRule` or `outOfSequence`, check
5A to 5C: much of what those categories held is data now. Entries written before 5A to 5C may say `code` for things
that are data now; when you revisit one, write the data.

## Where things are

- Batches come from `build/automation/tools/batches.mjs` (an array of effects: key, item, transType, trait, kind, n,
  keywords, text, traitCondition, status, compiled, and `current` = the entry it already has, when revisiting).
- Check your entries with `node build/automation/tools/validate.mjs --dump <effects.json> --out <merged.json> --only
  <batch.json> <your output dir>` (Node is `"/e/node javascript/node.exe"` on this machine). It reads the vocabulary
  from the system code, so a target/event/effect it rejects really does not exist.
- The importer (`build/extract_content.py` `apply_automation`) applies the merged entries from `build/automation/*.json`.

## Output

Write JSON files (paths given in your task) holding an object keyed by effect key:

```json
{
  "raid-boss|Foe of the People|1": {
    "verdict": "modifiers",
    "modifiers": [{ "target": "soak", "value": "2(T)", "condition": "" }],
    "note": "the doubled Adversary LP needs code",
    "code": { "category": "other", "spec": "double the Adversary Category LP per PL" }
  },
  "raid-boss|Foe of the People|2": {
    "verdict": "modifiers",
    "modifiers": [{ "target": "might", "value": "1(T)", "condition": "@below >= 2" },
                  { "target": "wound", "value": "2(T)", "condition": "@below >= 2" }]
  },
  "some-slug|Some Trait|3": {
    "verdict": "triggers",
    "triggers": [{ "event": "attackHit", "effect": "condition", "resource": "shaken", "target": "other",
                   "mode": "ask", "duration": "endOfNextTurn", "limit": "1/Round", "condition": "@crit == 1" }]
  }
}
```

Fields:
- `verdict`: `modifiers`, `triggers`, `both`, `code`, `covered`, `narrative`.
  - `covered`: what was already compiled (`compiled` in the batch) does all the mechanics of the text. No other field.
  - `narrative`: nothing mechanical to automate (roleplay, out-of-combat/Adventuring, a Ruling the GM applies, a
    "Prerequisite" line, picking options that the sheet already asks for, purely descriptive text). Add a `note`.
  - `code`: needs program logic the data vocabulary below cannot express. Give `code` (below). You may still add the
    `modifiers`/`triggers` for the parts that ARE expressible (then the verdict is still `code`).
- `replace` (optional, default false): true when the `compiled` automation of this effect is WRONG (wrong number,
  target or condition) — your `modifiers`/`triggers` then replace it. When compiled is right but incomplete, leave
  `replace` false and only add what is missing (never repeat a compiled modifier).
- `modifiers`: always-on bonuses (see below).
- `triggers`: event effects (see below).
- `code`: `{ "category": <one of the list>, "spec": "<one precise sentence of what the code must do>" }`.
- `note`: optional, short.

Do NOT add the trait's own condition (`traitCondition` in the batch, e.g. `@Z >= 2` for a "(2)" stack trait, `@GA >= 1`
for a Grand Awakening, `@M >= 1` for Mastery): the importer appends it. Effects marked Permanent stay on outside the
Transformation by themselves.

## Modifiers (always-on bonuses, recalculated all the time)

`{ "target": <key>, "value": <formula>, "condition": <formula or ""> }` — the value is ADDED to that target while the
condition is true. Use a negative value for a reduction ("-1(T)").

Targets (exact keys):
- Rolls: `combat` (= every Combat Roll: Strike, Dodge and Wound Rolls), `strike`, `strike.physical|energy|magic|signature|armed|unarmed`,
  `dodge`, `wound`, `wound.physical|energy|magic|signature|armed|unarmed`, `initiative`, `steadfast`, `stress` (Stress Bonus),
  `save.all`, `save.impulsive`, `save.corporeal`, `save.cognitive`, `save.morale`, `skill.all`, `skill.<skill>` with skill in
  acrobatics flight thievery stealth craftBasic craftApparel craftWeapons craftVehicles knowledgeScience knowledgeProfession
  knowledgeHistory knowledgeOther investigation medicine clairvoyance concealment creatureHandling intuition perception pilot
  survival useMagic bluff cooking intimidation persuasion performance.
- Crit/botch/natural/dice: `crit.combat|strike|dodge|wound|save|skill` (lowers the Critical Target: value "-1" = crit on 9+),
  `botch.combat|strike|dodge|wound|save|skill`, `natural.combat|strike|dodge|wound` (+ to the natural die),
  `critDice.combat|strike|dodge|wound` (+Categories of crit dice), `dice.combat|strike|dodge|wound` (extra ToP dice),
  `topDice.category`, `topDice.extra`.
- Aptitudes: `haste`, `awareness`, `defenseValue`, `soak`, `dr` (Damage Reduction), `might`, `surgency`,
  `speed`, `speed.normal`, `speed.boosted`, `speed.mult`, `size`, `longRange`.
- Pools: `life.max`, `life.perLevel`, `life.mult` (multiplier, "1.25" = +1/4), `rlm` (Racial Life Modifier), `ki.max`, `ki.mult`,
  `capacity.max`, `capacity.mult`.
- Attributes: `score.ag|fo|te|sc|in|ma|pe`, `mod.ag|fo|te|sc|in|ma|pe`.
- Other: `top` (Tier of Power), `superStacks`, `muscle`, `actions` (Actions per round), `counters` (Counter Actions per
  round), `kpCost.attack`, `kpCost.ua`, `kpCost.physical|energy|magic` (Ki Point Cost, negative = cheaper),
  `charge.category` (Energy Charge dice Category), `damageTaken` (flat damage taken, negative = less),
  `damageCategoryTaken`, `attackLifeCost`, `tp`, `perks`, `attributePoints`, `favoredElement` (value = an element name).
- Flags (value "1"): `flag.ignoreThresholds`, `flag.autoHit`, `flag.greaterDice`, `flag.noWeaponPenalty`,
  `flag.energyWithoutFO`, `flag.magicWithoutMA`, `flag.unnatural`, `flag.autoPassBruised`, `flag.autoStress`,
  `flag.noApparelPenalty`, `flag.bbForceWound`, `flag.bbWoundUnlimited`; Battle Born caps `battleBorn.cap.strike|dodge|wound`.

Plain modifiers cannot see the opponent or the attack being made. "+2(T) Wound against an Opponent below Bruised" is
a `vs.*` piece (5A: `{ "target": "vs.wound", "value": "2(T)", "condition": "@vs.below >= 1" }`), "+1(T) Strike with
Signature Techniques that have an AoE" an `attack.*` option (More vocabulary (2) and 5A); only what neither can express
is `code` (`versusTarget` / `attackOption`).

## Formulas

DBU notation: `2(T)` = 2 × current Tier of Power, `1(bT)` = base ToP, `1/2(T)`, `(2*@Z)(T)` (2(T) per stack), `@Z(bT)`,
`floor(@fo/2)`, `min(...)`, `max(...)`. Results round down. Conditions are expressions: `==, !=, >=, <=, >, <, &&, ||, !`.

Variables:
- This Awakening: `@Z` stacks, `@ZP` stacks that are not Temporary, `@M` Mastery, `@G` Grade, `@GA` Grand Awakening active.
- Health: `@below` = Health Thresholds you are below (0 Healthy, 1 below Bruised (≤1/2 LP), 2 below Injured (≤1/4), 3 below
  Critical (≤1/10)). "below the Bruised Threshold" → `@below >= 1`; "in the Healthy Threshold" → `@below == 0`.
  `@failed` (failed Steadfast Checks), `@life`, `@lifeMax`, `@ki`, `@kiMax`, `@capacity`, `@kiLow` (Ki below 1/4).
- States/Conditions: `@states.<key>` level (raging mindful superior undying surging determined entrusted godKi deadState
  liquid multipleArms invisible spectator drunk feral fusionOfKi), `@cond.<key>` level (blinded broken compelled drained
  fatigued guardDown impaired impediment pinned poisoned prone shaken sleeping slowed staggered stressExhaustion
  suffocating transfigured).
- Stacks: `@power` (Power), `@superStacks`, `@res.<slug>` (a sheet resource, slug = lowercase letters/digits only:
  `@res.battleborn`), `@awk.<slug>` (stacks of another Awakening by its slug), `@holdingBack`.
- Transformations: `@transformed`, `@inForm`, `@inEnhancement`, `@enhancementCount`.
- Attributes: `@ag @fo @te @sc @in @ma @pe` (Modifiers), `@scores.fo` (Scores), `@PL`, `@T`, `@bT`.
- In triggers only: `@round`, `@even` (even round) and the event variables below.

## Triggers (something happens → an effect)

`{ "event", "effect", "value", "resource", "condition", "target", "mode", "duration", "limit" }`

- `event`:
  - `startOfTurn`, `endOfTurn` (your turn), `startOfRound`, `endOfRound`, `startOfEncounter`, `stackGain` (this
    Awakening gains a Stack).
  - `attackMade` — you make an Attacking Maneuver. Variables: `@physical @energy @magic` (1/0), `@signature`, `@basic`,
    `@ultimate`, `@aoe`, `@charges`, `@wager`, `@category`, `@crit` (Critical Strike), `@targets`, `@elemental`,
    `@profile_<key>` (e.g. `@profile_beam`).
  - `attackHit` — your attack damaged a target (the other Character = that target). Attack variables + `@damage` (LP it
    lost), `@knocked` (Health Thresholds it was knocked through), `@defeated`, `@targetBelow`, `@critWound`, `@guard`.
  - `damaged` — an attack damaged you (other = the attacker). Same variables (`@damage` = what you lost, `@knocked` =
    thresholds you were knocked through).
  - `attackMissed` — your attack missed a target (other = that target): attack variables + `@dodge`/`@parry`/... = 1.
  - `dodged` — an attack against you missed (other = the attacker): same variables.
  - `threshold` — you crossed Health Thresholds (other = the attacker, if any): `@crossed` (how many), `@bruised`,
    `@injured`, `@critical` (1 if crossed now), `@defeated`, `@failedNow` (failed the Steadfast Check), `@selfInflicted`.
  - `transform` — you entered a Transformation: `@form`, `@enhancement`, `@topReq`, `@stage`.
- `effect`: `life` (+ regain / − lose LP), `ki`, `capacity`, `counters` (Counter Actions), `actions`, `power` (Power stacks),
  `charges` (Energy Charges), `dot` (Damage Over Time stacks), `resource` (+ stacks of a sheet resource named in
  `resource`, e.g. "Battle Born"; "Battle Born:wound" puts them on the Wound Roll), `resourceSet`, `state` (enter the
  State in `resource`, value = level), `condition` (suffer the Combat Condition in `resource`, value = stacks/level),
  `message` (only a reminder in chat; value = short text in your own words).
- `value`: formula (e.g. `2(bT)`, `-1(T)`, `floor(@damage/2)`, `@Z(bT)`).
- `target`: `self` (default) or `other` (the other Character of the event).
- `mode`: `auto` (applied), `ask` ("you may" / optional / costs something to choose → a chat button), `remind`.
- `duration` (for state/condition): `none`, `endOfTurn`, `startOfNextTurn`, `endOfNextTurn`, `endOfRound`, `encounter`.
  On the other Character "until the end of your (next) turn" is counted on YOUR turns automatically.
- `limit`: `"1/Round"`, `"2/Encounter"`, `"1/Turn"` (from the effect's keywords like `[Triggered, 1/Round]`).
- Costs ("spend 2(bT) KP to ...") → an `ask` trigger with the cost as a second trigger is NOT possible; instead put the
  gain in an `ask` trigger and a second `ask` trigger for the cost only if both are simple, otherwise `code`.

## Code categories

`attackOption` (an option or change on your Attacking Maneuvers: extra AoE, Profile, Energy Charges, cost, Strike/Wound
bonus only on some attacks), `versusTarget` (depends on the opponent or who attacked), `defenseOption` (Dodge/Parry/Guard/
Defend changes, reactions to being attacked beyond simple triggers), `maneuverChange` (cost/effect of a Maneuver: Power
Up, Energy Charge, Movement, Combat Recovery, Transformation Maneuver...), `outOfSequence` (use a Maneuver Out-of-Sequence
at some moment), `areaEffect` (affects everyone in an AoE around you), `clash` (make a Clash and apply a result),
`resourceRule` (special stacks/resources), `transformationRule` (Stress Tests, requirements, Aspects, Mastery),
`summon` (Minions, Features, Duplicates), `other`.

## Judgement

- Prefer `modifiers`/`triggers` whenever the data can do it faithfully; only use `code` for real gaps.
- "you may" → `mode: "ask"`. Automatic/Passive gains → `auto`.
- Per-stack wording ("for every stack of this Awakening") → multiply by `@Z`.
- Keep numbers exact. If unsure between two readings, pick the literal one and say so in `note`.
- Every effect of your batch must get an entry (including `covered`/`narrative`).

## More vocabulary (1)

- Event `grandAwakening`: the Full Awakening Maneuver activated this Awakening's Grand Awakening ("[Grand Trigger]" /
  "when this Grand Awakening is activated" effects).
- Effect `maneuver` (always a chat button): `resource` = the Maneuver used as an Out-of-Sequence Maneuver, spending no
  Action — `powerUp`, `energyCharge`, `combatRecovery`, `healingSurge`, `kiSurge`, `basicAttack`, `signature` (pick a
  Signature Technique), `transformation` (pick a Form/Enhancement), `movement` (a reminder: move on the map). Use it for
  "you may use the X Maneuver as an Out-of-Sequence Maneuver" at the moment of an event (attackHit, damaged, dodged,
  threshold, startOfTurn...). Extra costs beside it ("spend 2(bT) KP") can be a second `ask` trigger only if simple.
- Variables (modifiers and triggers): `@allies` (non-Defeated Allies in your Combat Encounter), `@opponents`,
  `@allyAwk.<slug>` (how many of those Allies possess that Awakening, slug like `team-dynamic` → `teamdynamic`:
  lowercase letters and digits only).

## More vocabulary (2)

**Attack options** — modifiers whose target starts with `attack.` are applied when an Attacking Maneuver is made, and
their `condition` may use the attack's variables: `@physical @energy @magic` (1/0), `@signature`, `@basic`, `@ultimate`,
`@aoe`, `@charges` (Energy Charges going into it), `@elemental`, `@profile_<key>` (e.g. `@profile_beam`).
- Targets: `attack.charges` (+Energy Charges to this attack), `attack.strike`, `attack.wound`, `attack.kp` (Ki Point
  Cost, negative = cheaper), `attack.category` (+Damage Category).
- Extra fields on these modifiers: `"mode": "ask"` (a box the player ticks in the attack dialog — "you may", or a
  limited use) and `"limit": "1/Round" | "1/Encounter" | "1/Turn"`. Without mode they apply by themselves.
- Example — "1/Round, a Signature Technique gains 1 Energy Charge":
  `{ "target": "attack.charges", "value": "1", "condition": "@signature == 1", "mode": "ask", "limit": "1/Round" }`.
- Also plain targets `kpCost.signature` / `kpCost.basic` (always-on Ki Point Cost of Signatures / Basic Attacks), and
  the existing `strike.signature`, `wound.signature`, `wound.physical`... for always-on roll bonuses.
- Still code: anything that depends on the TARGET of the attack (its conditions, being Studied/Analyzed...), costs that
  spend something else (an Adversary Action, a resource), changing the Damage Attribute, adding Advantages/Super Profiles.

**Maneuver events** (triggers): `powerUp` (you use the Power Up Maneuver = "[Triggered/Power]"; `@powerNow`), `surge`
(you use a Surge; `@healingSurge`, `@kiSurge`, `@healed`), `energyCharge` (you use the Energy Charge Maneuver;
`@heldCharges`), `stateEnter` (you enter a State; `@state_<key>` = 1 for that State, e.g. `@state_superior`, `@level`).

**More variables** (anywhere): `@myTurn` (1 during your turn), `@counters` (Counter Actions held), `@actions`,
`@heldCharges` (Energy Charges held), `@grappled`, `@grappling`, `@active.<slug>` (1 while in that Transformation; slug
= its name in lowercase letters/digits only, e.g. `@active.supersaiyan`).


## FORMS, ENHANCEMENTS AND EVOLVED FORMS

Effects of Forms, Enhancements and Evolved Forms (`transType` in the batch: form, enhancement, evolved) differ from
the Awakenings ones:

- **Only while in the Transformation.** Their modifiers and triggers apply ONLY while the character is in that
  Transformation — the system does that by itself. So "while in this Transformation" / "while you are in X" needs no
  condition at all. Permanent effects and Legendary Traits (`kind` "legendary trait") apply at all times by
  themselves too. Never write a condition for that.
- **traitCondition** (appended by the importer, never repeat it): `@M >= n` for Mastery Traits (n Masteries),
  `@MX >= 1` for a Transcendent Trait (the importer also adds "Transcended"), blank otherwise. `kind` "burst limit"
  = a Burst Limit Trait (see the event below).
- **Variables of the Transformation itself:** `@M` Masteries it has (Mastered = `@M >= 1`), `@FM` 1 when Fully
  Mastered, `@MX` Masteries beyond Fully Mastered, `@TR` 1 when Transcended, `@G` its Grade (Graded Transformations:
  "for each Grade" → multiply by `@G`, "at Grade 3" → `@G >= 3`), `@S` its Stage. `@Z` (stacks) is for Awakenings
  only. Other Transformations: `@active.<slug>` (1 while in it), `@transformed`, `@inForm`, `@inEnhancement`,
  `@enhancementCount`.
- **"Attribute Modifier Bonuses of this Transformation"** are the item's bonus table (already applied). Doubling or
  changing them for a while is `code` (transformationRule). A flat "+1(T) to your FO Attribute Modifier" while in the
  Transformation is a modifier `mod.fo`.
- **Aspects** (Draining, Exhausting, Rampaging, Straining, Fading, Bursting, Graded, Natural, Difficult...): changing an
  Aspect's level by Mastery is ALREADY done by the importer (verdict `covered` when `compiled` is empty but the text is
  only "reduce the level of the X Aspect of this Transformation by 1" on a Mastery Trait). Other Aspect changes →
  `code` transformationRule. "If the Original Form is Mastered" ([Acclimated] effects of an Evolved Form or a Variant)
  depends on another item → `code` transformationRule.
- **Stress Tests, Tier of Power Requirements, entering/leaving rules, Grades, Mastery rules** → `code`
  transformationRule unless a modifier says it plainly (`stress` = Stress Bonus).

### Vocabulary for Transformations

- Event `transform` now has `@this` (1 when the Transformation entered is the one this effect belongs to). A
  `[Triggered/Transform]` / "[Automatic/Transform]" effect — "when you use the Transformation Maneuver to enter this
  Transformation" — is a trigger on `transform` with condition `@this == 1`.
- Event `revert` — you leave a Transformation (other = none). `@this` = 1 when it is this one ("when you leave this
  Transformation" → condition `@this == 1`), `@form`, `@enhancement`.
- Event `burstLimit` — this Burst Limit Trait was triggered (the system runs only the triggers of the Burst Limit
  Trait that was triggered, so no condition is needed for that). Put the Burst Limit's effects here.
- Effect `buff` — a temporary bonus: `resource` = a modifier target key (same list as modifiers: `strike`, `wound`,
  `soak`, `mod.fo`, `speed`, `dr`, `kpCost.attack`...), `value` = formula (evaluated when it happens; negative
  = penalty), `duration` REQUIRED: `endOfTurn`, `startOfNextTurn`, `endOfNextTurn`, `endOfRound`, `encounter`
  or the new `untilRevert` (until you leave this Transformation). Works with `target: "other"` too (a penalty on whom
  you hit: "the target suffers -1(T) to Dodge Rolls until the end of your next turn" → attackHit, target other).
  Example — "[Triggered/Transform] gain +2(T) to Strike Rolls until the end of your next turn":
  `{ "event": "transform", "condition": "@this == 1", "effect": "buff", "resource": "strike", "value": "2(T)",
  "duration": "endOfNextTurn" }`. Several bonuses = several buff triggers. Only for plain modifier targets: attack.*
  options cannot be buffs.
- Duration `untilRevert` also works for `state`/`condition` effects ("enter the Surging State until you leave this
  Transformation").

Prefer buff triggers over `code` for "gain X until the end of your next turn"-style effects. A "[Triggered/Power]"
effect is the `powerUp` event; "[Start of Turn]" is `startOfTurn` (`compiled` may already have it — check).

## More vocabulary (3) and lessons from the review

- **Immunity:** modifier target `immune.<condition>` (value `1`, NO condition): the Combat Condition has no effect while
  the item applies ("You are immune to the Shaken Combat Condition", "cannot be Impaired"). Conditions are worked out
  before formulas, so an immunity that only holds under a condition stays `code`.
- **Options of a choice:** when the effect is one option of the Trait's own choice ("select one of the following
  effects: - X [Passive]: ...", a choice listed on the item), put `"option": "<option name exactly as the choice lists
  it>"` on each modifier/trigger of that option: it is switched off until the player picks it.
- **Choices made elsewhere:** `@picked.<option slug>` is 1 when any Transformation of the character has that option picked
  in one of its choices ("Depending on your choice for the 3rd effect of Divine Magic: God of Peace ..." →
  condition `@picked.godofpeace == 1`; slug = lowercase letters/digits of the option name).
- **Groups picked once** (Aura Traits of Sparking Aura, Form Traits of Super Form, Domain Traits, Genetic Traits, Classes
  of Initial Class, High Vocations, Super Saiyan Style Traits, Forms of Love, Evolution Traits...): the system now has a
  choice for them and only the picked Traits work. Write their effects normally (active, no extra condition).
- **Damage:** `attackHit` / `damaged` fire on every hit, also when no Life Points were lost. "If you deal/receive Damage"
  → add `@damage >= 1`.
- **Permanent effects that raise "this Transformation's Attribute Modifier Bonus"** only matter while in it: put
  `"always": false` on those `mod.*` modifiers (the importer otherwise keeps Permanent effects on at all times).
- **Resource caps:** a sheet resource created by a trigger has no maximum by itself. "Your maximum number of X stacks is
  3" → a modifier `{ "target": "resMaxSet.x", "value": "3" }` (see More vocabulary (4)); gains are then clamped.
- **Shared limits:** two buttons for "use X or Y once per Encounter" each get their own limit; when that matters, the
  effect stays `code` (keep the buttons).
- Never repeat what `compiled` already has without `replace: true` (it doubles the bonus).

## More vocabulary (4): what the engine learned after the gap analysis

**Activated Trait uses (sheet buttons).** Event `use` = a button in the Combat tab ("Usos de traços"). For "As an
Instant Maneuver, ...", "1/Round, you may spend X to ...", "you may use the X Maneuver as an Instant Maneuver": a `use`
trigger (Instant → `condition: "@myTurn == 1"`; the `maneuver` effect spends no Action). Variables of a use: `@myTurn`,
`@inCombat`, `@round`, `@turn`, `@n`. Triggers with the same label and `limitKey` are ONE button that applies them all.
- **Costs** — trigger field `cost`, a `;` list: `ki:2(bT)`, `life:4(bT)`, `dkp:2(bT)`, `capacity:1(T)`, `counters:1`,
  `actions:1`, `power:1`, `charges:1`, `res:<Resource name>:<n|all|formula>`. Paid when the trigger runs (auto), when its
  chat button or sheet button is clicked; refused when it cannot be paid. Works on every event, not only `use`.
  Example — "1/Round, spend 2 stacks of Overwhelm to gain a Counter Action":
  `{ "event": "use", "effect": "counters", "value": "1", "cost": "res:Overwhelm:2", "limit": "1/Round" }`.
- **Amounts** — field `amount` (formula, the most the player may pick): a dialog asks n = 1..amount; `@n` in `value`
  and `cost` ("spend any number of Love stacks: +1(T) Soak per stack until the end of your turn" →
  `{ "event": "use", "effect": "buff", "resource": "soak", "value": "@n(T)", "duration": "endOfTurn",
  "amount": "@res.love", "cost": "res:Love:@n" }`).
- **Shared limits** — field `limitKey`: triggers with the same key share one count ("use X or Y, once per Encounter":
  two triggers, same limitKey). `limit` accepts formulas (`M/Encounter`, `@Z/Round`) and pairs (`1/Round, 3/Encounter`).
- **Maneuver lists** — `maneuver` resource `"powerUp|energyCharge|empower"` = one pick among them; new maneuver keys
  `empower` and `surge` (Healing or Ki Surge, picked).

**Divine Ki.** Trigger effect `dkp` (+ regain / − spend). Targets `dkp.max`, `dkp.mult`, `flag.dkpUsable`. `@dkpMax`.

**Resources and Power.** Targets `resMax.<slug>` (+ maximum of that sheet resource), `resMaxSet.<slug>` (sets its maximum;
highest wins — "Your maximum number of Evil Points is 20(bT)"), `@resMax.<slug>`. Gains are clamped to it, so a
resource with a maximum needs no cap in the condition any more. `power.max` (+ maximum Power stacks, base 2),
`flag.powerSpiked`, `@powerMax`, `@powerSpiked` (Power at its maximum: "while Power Spiked").

**Attack options — variables** (attack.* conditions and attack triggers): `@wager`, `@dkpCost`, `@dkpWager` (paid with
Divine Ki), `@kp` (Ki Point Cost before options), `@dmgAttr`, `@da_<attr>` (Damage Attribute used: fo ma pe ag te sc in
surgency), `@favored` (a Favored Element), `@calledShot`, `@oos` (Out-of-Sequence), `@armed`, `@unarmed`,
`@superProfile_<key>`, `@opt_<advantageKey>` (rank of that Advantage on the Signature), `@via_exploit`, `@via_defend`,
`@via_feint` (the attack is made through that Maneuver — the player picks it in the attack dialog).
**Attack options — targets**: `attack.crit.strike`, `attack.crit.wound` (-1 = Critical Target one lower),
`attack.natural.strike`, `attack.natural.wound`, `attack.chargeCategory` (+ Dice Category of its Energy Charges),
`attack.lethal` (1: Damage Category 3 that cannot be reduced), `attack.ignoreDR` (1 all / 0.5 half),
`attack.kpFree` (1: costs 0 KP), `attack.damageAttribute` (TEXT value: `pe`, `fo|ma`, `surgency`, `any` — the dialog
offers it). Always-on: `flag.fullWager`, `flag.weaponAssisted`, `charges.max`.
**Defend**: `defense.freeCounter` (1: the Defend option spends no Counter Action) and `defense.freeKp` (Guard costs no
KP), with `mode: "ask"` and `limit` like attack options; their condition sees `@parry @guard @directHit @crossCounter
@powerFlare @dodge` and the attack variables. **Clash**: `clash.duel` (+ Dice Score of your Duel Clashes).

**State switches**: `ignoreState.<state>.<n>` (value 1) suppresses the n-th built-in effect of a State ("ignore the 2nd
effect of the Superior State" → `ignoreState.superior.2`); States with Levels: `ignoreState.raging.angry.2`. Numbering:
raging angry 1 Wound, 2 Botch; furious 1 Soak; apoplectic 2 ignore thresholds | mindful calm 1 Crit, 2 −Wound; tranquil 1
Counter, 2 ignore thresholds | superior 1 Greater Dice, 2 damage taken | undying 3 −1(T) Combat | determined 1 autoHit,
2 ignore thresholds | entrusted 1 Greater Dice, 2 Stress | godKi 3 Wound+Soak | deadState 1 Stress+Steadfast, 4 −1(bT)
Combat+Soak | liquid 1 Size, 3 Stealth | drunk tipsy 1 Saves+Combat, 2 Natural | feral wild 2 KP cost, 3 Natural/
Intimidation/Survival. Prefer this over a negative modifier (it does not double up).

**Rule switches** (value 1, any condition): `flag.noReducedMomentum`, `flag.autoPassSteadfast`, `flag.autoFailSteadfast`,
`flag.noLifeRegain`, `flag.noDimDefense`. Multipliers: `dimDefense.mult`, `surgency.mult`, `soak.mult`. Buckets:
`greaterDice.category`, `topDice.category.strike|dodge|wound`, `dimOffenseStart`.

**Maneuver tuning**: `recovery.bonus` (LP and KP added to Combat Recovery, dice allowed: `1d6(bT)`), `recovery.kiMult`,
`surge.kiMult`, `surge.healSurgency` (multiplies Surgency in a Healing Surge), `uses.surge` (+ Surge uses per encounter),
`legend.bonus` (dice allowed) and `legend.mult` (Legend Realized), `charge.kpMult` (Energy Charge KP cost ×),
`flag.chargeNoGuardDown`.

**This Transformation's Attribute Modifier Bonus**: `amb.<attr>` (+), `amb.mult`, `amb.<attr>.mult` (×) — from this
item's own modifiers ("double the Attribute Modifier Bonuses of this Transformation while ..." → `amb.mult` `2` with the
condition). `@amb.<attr>`.

**Immunity with a condition**: `immune.<condition>` may now have a condition (tested with all the formula data).

**More variables**: `@aspects.<key>` (Aspect levels over the active Transformations: `@aspects.superSaiyanForm`,
`@aspects.perfectKiControl`...), `@inLine.<line slug>`, `@mastery.<slug>`, `@fm.<slug>` (that Transformation Fully
Mastered — "If the Original Form is Mastered" → `@mastery.<original form slug> >= 1`), `@transcended.<slug>`,
`@highestTopReq`, `@activeCount`, `@powerUps` (Power Ups used this round), `@opponentTop` (highest base ToP among
Opponents).

## RACIAL TRAITS (`transType` "racial")

Racial Traits (`build/automation/racial.json`) are items that apply **at all times** while they are on the sheet (the
player can switch one off). They are not Transformations:

- **No Transformation variables or events.** Never `@Z @ZP @ZB @M @MX @FM @G @GA @TR @S @this`, events `stackGain`,
  `grandAwakening`, `burstLimit`, duration `untilRevert` (the validator rejects them). `transform` / `revert` are ANY
  Transformation the character enters / leaves ("[Triggered/Transform]" → `transform`, no condition); `@transformed`,
  `@inForm`, `@inEnhancement`, `@active.<slug>`, `@inLine.<slug>`, `@aspects.<key>` work.
- **Batch fields:** `kind` / `subtype` = the tier (`primary`, `secondary`, `subrace`, `factor`, `villainous`; `granted` =
  a Trait of a group gained through another Trait — Bestial Traits, Monstrous Traits, Evolution Traits (Arcosians),
  Vocations (Konatsians), Pseudo-Bestial Traits; `custom` = a Custom Species Racial Trait; `flaw` = a Custom Species
  Flaw), `race` (the race or Racial Requirement) and `group`. Effects of one race come together: they often name each
  other ("the 1st effect of Earthling Resolve").
- **Keyword moments:** "[Triggered/Defeated]" → `threshold` with `@defeated == 1`; "[Triggered/Injured]" → `threshold`
  with `@injured == 1`; "[Triggered/Threshold]" → `threshold`; "[Triggered/Power]" → `powerUp`; "Start of Combat Round"
  → `startOfRound`; "Start of Combat Encounter" → `startOfEncounter`; "[Triggered/Raging]" → `stateEnter` with
  `@state_raging == 1`; "Start of Turn" → `startOfTurn`.
- **Twinned (Custom Species).** An effect with "Twinned" in its keywords only works when the player marks the Trait as
  Twinned (a checkbox on the item): the importer labels its pieces "<Trait> (Twinned)" and the system switches them
  off otherwise. Write those effects normally, with no extra condition.
- **Options.** "Option" / "Choice" / "Multi-Option" effects: put `"option": "<option name exactly as the bullet names
  it>"` on each piece of that option; Racial Traits have no choice dialog, so the player switches on the option(s) they
  picked on the item. Never leave all options on.
- **Narrative:** "Prerequisite" lines, "At Character Creation, select ...", Rulings, roleplay and Adventuring text.
  "Select and gain an Evolution Trait / a Vocation / 2 Bestial Traits / 2 Pseudo-Bestial Traits / a Monstrous Trait" →
  `narrative` with the note "the Traits are items of the compendium (folder of their group)" — the player adds them.
- **Granted things.** "Gain access to the <named> Maneuver / Special Maneuver / Talent / Unique Ability / Signature /
  Trait" → `code` with category `grant` and the spec `grant <maneuver|talent|uniqueAbility|racialTrait|signature>:
  <exact name>` (several: `;`). A bonus "if you already had access to it" is part of the same spec.
- **Racial basics:** "Racial Life Modifier" → `rlm`; Saving Throws → `save.*`; Skill Checks → `skill.<skill>` (Dice
  Score); Skill Ranks → `skillRank.<skill>`, "a Skill Rank in a Skill you pick" → `skillRanks.racial` (5C). Size
  Category → `size`. Clashes → 5C (`clash.*` pieces, `clashWon` / `clashLost`) and 5B (a trigger's `check:
  "clash:..."`); an Opponent → 5A (`vs.*`, `@vs.*`). Natural weapons, tails, Minions, Allies → the usual rules above
  (most stay `code`).
- **Resources of the race** (Overwhelm, Tension, Adaptation Points...): `resource` / `resourceSet` effects with the
  resource name, `@res.<slug>`, `resMaxSet.<slug>` for "max. N" (write the cap where the text gives it).

---

The three sections below belong to the three engine packages of round 2; each package writes only under its own
heading, and a vocabulary its section does not list yet does not exist. New vocabulary goes into the package's
`dbu-rpg/module/vocab/<a|b|c>.mjs` (targets, events, effects, durations, Maneuver keys), its
`build/automation/tools/vocab/<a|b|c>.mjs` (variables and extra checks of validate.mjs) and its `build/lang/<a|b|c>.json`
(pt-BR and en labels, merged into dbu-rpg/lang by `node build/merge-lang.mjs`). Already accepted before them: a `use`
trigger with `target: "other"` (the Character the user targets), and a `limit` on option modifiers written like a
trigger's (`1/Round, 3/Encounter`, `M/Encounter`). Files each package owns (module paths under `dbu-rpg/module/`):
- **5A, attack and defense (A1, A2):** `combat/attack.mjs`, `rules/versus.mjs`, `rules/options.mjs`,
  `templates/chat/attack-card.hbs`, `data/items.mjs` (only `SignatureData.tags`), `templates/item/tab-details.hbs` (only
  the Signature block), `vocab/a.mjs`, `tools/vocab/a.mjs`, `build/lang/a.json`, section 5A.
- **5B, triggers, moments, Maneuvers (B1–B5):** `combat/triggers.mjs`, `combat/stacks.mjs`, `combat/marks.mjs`,
  `combat/divine.mjs`, `chat.mjs`, `socket.mjs`, `documents/actor.mjs` (all but the Rolls section), `documents/combat.mjs`,
  `data/actor.mjs`, `data/fields.mjs`, `templates/parts/triggers.hbs`, `sheets/item-sheet.mjs`, `rules/grants.mjs`,
  `build/extract_content.py` (grant resolution), `vocab/b.mjs`, `tools/vocab/b.mjs`, `build/lang/b.json`, section 5B.
- **5C, sheet data, rolls, Clashes (C1–C4):** `rules/derived.mjs`, `rules/modifiers.mjs`, `rules/validation.mjs`,
  `rules/signature.mjs`, `rules/apparel.mjs`, `dice/roller.mjs`, `combat/reactions.mjs`, `combat/clash.mjs`,
  `combat/grapple.mjs`, `combat/movement.mjs`, `adventure.mjs`, `documents/actor.mjs` (only the Rolls section: rollCombat,
  rollSkill, rollSave, rollClash, rollSteadfast, rollStressTest), `documents/item.mjs`, `sheets/actor-sheet.mjs`,
  `templates/actor/*`, `vocab/c.mjs`, `tools/vocab/c.mjs`, `build/lang/c.json`, section 5C.
- **No package:** `vocab/index.mjs`, `config.mjs`, `build/automation/tools/validate.mjs`, `build/merge-lang.mjs` and the
  lang files themselves (only merge-lang writes them).

## More vocabulary (5A): attack and defense

### Versus layer (A1): effects against ONE other Character

`@vs.<x>` is the other Character of an attacker/target pair, seen by the owner of the piece or trigger:

| Variable | Meaning |
|---|---|
| `@vs.below` | its Health Thresholds crossed (its `@below`) |
| `@vs.cond.<condition>` / `@vs.anyCond` | its effective level of that Combat Condition / how many Combat Conditions it suffers |
| `@vs.dot`, `@vs.states.<state>` | its DOT stacks, its State level |
| `@vs.size`, `@vs.sizeDiff` | its current Size index; yours − its |
| `@vs.initiative`, `@vs.initiativeDiff` | its Initiative; yours − its (0 outside combat) |
| `@vs.ally`, `@vs.minion` | 1: it has your non-neutral token disposition / it is a Minion |
| `@vs.top`, `@vs.capacityMax` | its base ToP, its Max Capacity |
| `@vs.mark.<slug>` | 1: you placed that mark on it (5B marks; slug = lowercase letters and digits: `inferior`) |

`@vs` works in `vs.*` pieces, `clash.*` pieces (5C), and in the triggers of `attackHit`, `damaged`, `attackMissed`,
`dodged`, `targeted` (other = the attacker), `attackMade` (the first target), `threshold` (the attacker) and `use` (your
Foundry target). In `attack.*` pieces (and the attack events) use the aggregates over the attack's targets instead
(at declaration: all of them; `at: "wound"`: the targets hit): `@vsMax.<x>`, `@vsMin.<x>`, `@vsAny.<x>` (1 if one has
x > 0), `@vsCount.<x>` (how many), x being any `@vs` key: `@vsMax.below`, `@vsCount.cond.impaired`, `@vsAny.mark.inferior`.

More attack variables: `@oblivious` (the dialog's Hidden box), `@allyTargets` (targets with your disposition). The hit
events now see the Defend option too: `attackHit` / `damaged` get `@dodge @parry @guard @directHit @crossCounter
@powerFlare @divineFlex @none` (before: only `attackMissed` / `dodged`), and all four get `@counter` (the defense was a
Defend option, Counter Action spent or waived) and `@defenseCrit` (the Dodge / Parry Roll was a Critical Result).
`targeted` (an attack targets you; other = the attacker) is an event like the others.

`vs.*` targets are worked out per pair, never on the sheet:

| Your attack against that target (automatic: never `mode: "ask"`, no `cost`, no `amount`; `limit` is fine) | Its attack against you (may be ask / limit / cost / amount / group) |
|---|---|
| `vs.strike` (also your Parry Strike against its attack), `vs.combat` (Strike and Wound; when defending: Dodge and Parry) | `vs.dodge`, `vs.defenseValue` (added to the Dodge), `vs.strike` / `vs.combat` (your Parry / Dodge) |
| `vs.wound`, `vs.category` (+Damage Category) | `vs.soak` (before Direct Hit ×1.5 and the Category halving), `vs.dr` |
| `vs.ignoreSoak` (fraction of its Soak ignored; highest wins, with `attack.ignoreSoak`) | `vs.categoryTaken` (−1 = one Category lower), `vs.categorySet` (1/2/3; 3 is never reduced after) |
| `vs.steadfast` (± to the Steadfast Check of a Character your attack knocked through a Threshold; its condition sees the attack's variables: `@tag_*`, `@weapon_*`, `@signature`...) | `vs.damageTaken` (flat, when Damage > 0), `vs.damageMult` (× your Damage, product, rounded down) |
| | `vs.guardKp` (± KP of your Guard), `vs.guardNoCharges` (1: no KP for the Energy Charges), `vs.redodge` (after a Dodge or no defense that was hit: Dodge again with +value; beating the Strike makes it a miss) |

The defender's pieces are asked on its client: before the roll (Dodge/Parry/Guard pieces), and once hit (the Damage
pieces and `vs.redodge`), one dialog each, only when an asked piece applies; costs paid and limits counted there.
Without a defense, only its automatic pieces with no limit and no cost apply. The attacker's limited pieces count once
per attack (when a defense against it is resolved, hit or miss, or its Damage is applied). `vs.strike` / `vs.combat`
serve both sides: a piece of them with a `cost` or an `amount` only works when you defend (on your attack nothing pays
it, so it is left out). Conditions and values see the attack's variables, the Defend variables,
`@vs.*`, `@hit` (1 once the defense result is a hit), `@critStrike` and `@n`. A1 replaces the code category
`versusTarget` for these patterns.

- "+1(T) Wound against a target that suffers a Combat Condition" (Demon-Raised 1):
  `{ "target": "vs.wound", "value": "1(T)", "condition": "@vs.anyCond >= 1" }` (an AoE: only that target's Damage).
- "1/Round, when you Direct Hit, take Damage one Category lower" (Damage Inhibitor 2): `{ "target": "vs.categoryTaken",
  "value": "-1", "condition": "@directHit == 1", "mode": "ask", "limit": "1/Round" }`.
- "spend any Greed: +2(T) DR each" (Greed of the Hera 6): `{ "target": "vs.dr", "value": "(2*@n)(T)", "amount":
  "@res.greed", "cost": "res:Greed:@n", "mode": "ask", "group": "greed6" }` (that attack only; Guard still halves first).

### Option pieces (A2): cost, amount, group, Wound-time options

Fields of the pieces on option targets (`attack.*`, `vs.*`, `defense.*`, and 5B/5C's `surge.*`, `recovery.*`,
`charge.*`, `clash.*`); the validator refuses them anywhere else:

| Field | Meaning |
|---|---|
| `cost` | paid when the piece is used, trigger cost syntax (`ki:2(bT); res:Critical Eye:2`), `@n` allowed; a box is disabled while it cannot be paid, an attack whose options cannot be paid is refused (the KP check covers attack + options) |
| `amount` | a formula, the most `@n` the player may pick (a number input) |
| `group` | lowercase slug: pieces with that group, from any item, are ONE box; its amount is the first piece's; all costs summed and paid once; each piece keeps its own condition (tested with `@n`) and limit |
| `limitKey` | a shared count of uses, as on triggers |
| `at` | `""` (declaration) or `"wound"`: offered when the Wound Roll is made (a miss spends nothing), only on what is still read then: `attack.wound`, `attack.greaterDice`, `attack.crit.wound`, `attack.natural.wound`, `attack.critSet.wound`, `attack.category`, `attack.ignoreSoak`, `attack.ignoreDR` |

`defense.freeCounter` / `defense.freeKp` take `cost` and `limitKey` (paid when the waiver is used), not `amount` nor
`group`.

Variables: `@n`; `@chose.<group>` (n picked, 1 without amount or for an automatic group, 0 not used); `@spent.<x>`
(`ki`, `life`, `counters`, or a resource slug: what this attack's options cost); `@kpFinal` (the Ki Point Cost paid);
`@magnitude` (0 none, 1 Standard … 4 Destructive); `@weaponIntegrated`; `@tag_<tag>`; `@via_<slug>`. All of them in the
attack events, `vs.*` pieces and `at: "wound"` pieces (which also get `@hits`, `@missed`, `@critStrike`); the
declaration's `attack.*` pieces only get `@n`, `@weaponIntegrated`, `@tag_<tag>` and `@via_<slug>` (the others are not
known yet). `@aoe` now works in attack triggers too.

New `attack.*` targets: `attack.calledShot` (1: a Called Shot without its extra Action), `attack.noCalledShotPenalty`
(1: no −2(T) Strike), `attack.overCharges` (+Energy Charges beyond the maximum), `attack.kpBaseFree` (1: Profile/Signature
cost 0; attack.kp, Called Shot and Rapid still paid), `attack.freeCounter` (1: Made through Exploit/Defend without a
Counter Action), `attack.aoe` (text `cone`, `line`, `cone|line`: an attack without an AoE gets that shape at Standard
Magnitude; the dialog offers the shapes), `attack.magnitude` (+n, at most 4), `attack.greaterDice` (+n times the Greater
Dice of your ToP on the Wound Roll), `attack.ignoreSoak` (fraction), `attack.critSet.strike` / `attack.critSet.wound`
(sets that Critical Target, lowest wins, ignores the 7 floor), `attack.dimDefense.mult` (× the Diminishing Defense it
inflicts, highest wins), `attack.dimOnDeclare` (1: that Diminishing Defense applies at declaration), `attack.state` (text,
a State key: entered before the Strike, left when the card is resolved or at the end of your turn, if its Level did not
change), `attack.ignoreFoundationReq` (1: no FO/MA requirement). Always on: `flag.noLongRangePenalty`, `wager.maxSet`
(the Ki Wager limit, lowest wins), `flag.dimDefenseFirstFree` (the first Diminishing Defense stack from each attacker
per Combat Round is ignored).

Signatures have a `tags` field (comma list: `copied`, `crafted`, `racial`, `fullPower`, `quickLearner`; `@tag_<tag>`).
A `fullPower` Signature has `@basic = 1` and is listed among the Basic Attack's Profiles ("Name (Full Power)").
"Made through" also lists the actor's Maneuver items: `@via_<slug>` = lowercase letters and digits of its name without
"maneuver" (`@via_tailattack`, `@via_biteattack`). **Rules fix:** an attack Made through Exploit or Defend with "spend
Action" ticked now spends 1 Counter Action instead of the Action (none with `attack.freeCounter`).

- "1/Round, spend 2 Critical Eye: the attack is a Called Shot without the extra Action" (Pinpoint Combat 2):
  `{ "target": "attack.calledShot", "value": "1", "mode": "ask", "limit": "1/Round", "cost": "res:Critical Eye:2" }`.
- "spend up to 2(bT) KP per Magnitude" (Greed of the Hera 4): `{ "target": "attack.magnitude", "value": "@n",
  "amount": "2", "cost": "ki:(2*@n)(bT)", "mode": "ask", "limit": "1/Round", "condition": "@aoe == 1" }`.
- "when you hit, spend 2(bT) KP for one more Greater Dice" (Synthetic Muscle 3): `{ "target": "attack.greaterDice",
  "value": "1", "at": "wound", "mode": "ask", "cost": "ki:2(bT)", "limit": "1/Round", "condition": "@hits >= 1" }`.
- "Combat Mode: +2(T) Strike; after the attack, lose 1 Battery": the box `{ "target": "attack.strike", "value": "2(T)",
  "mode": "ask", "group": "combatmode2" }` plus the trigger `{ "event": "attackMade", "condition":
  "@chose.combatmode2 >= 1", "effect": "resource", "resource": "Battery", "value": "-1" }`.

## More vocabulary (5B): triggers, moments, Maneuvers

**Marks (B1).** Effect `mark`: `resource` = the mark's name ("Inferior", "Studied", "Foreseen"...), `target: "other"`
(or `"targeted"`) = whom you mark. A name is exclusive: marking someone else moves it. A name ending in `+` ("Shard
Carrier+") allows several Characters at once. Durations: `none` (until moved or removed), `endOfTurn`, `startOfNextTurn`,
`endOfNextTurn`, `endOfRound`, `endOfNextRound`, `encounter` (counted on YOUR turns: the mark lives on you). Effect
`unmark`: `target: "other"` removes that Character's mark, `target: "self"` removes every mark of that name you placed.
Event `markPlaced` (other = the marked Character, `@mark_<slug>` = 1). Variables: `@vs.mark.<slug>` (5A: 1 when the
other Character of the pair carries your mark), `@marks.<slug>` (how many Characters carry it). Slug = lowercase letters
and digits ("Shard Carrier+" → `shardcarrier`).
- "At the start of the round, pick an Opponent as your Inferior; +1(T) Combat Rolls against it" → a `use` trigger
  `{ "event": "use", "effect": "mark", "resource": "Inferior", "target": "other", "duration": "endOfRound", "limit": "1/Round" }`
  + `{ "target": "vs.combat", "value": "1(T)", "condition": "@vs.mark.inferior == 1" }`.
- "Allies you Study gain +1(T) Combat Rolls" → `{ "event": "markPlaced", "condition": "@mark_studied == 1 && @vs.ally == 1",
  "effect": "buff", "target": "other", "resource": "combat", "value": "1(T)", "duration": "endOfNextRound" }` (the buff also
  ends when the mark leaves that Ally).

**Resource events (B2).** `resourceGain`: stacks of a sheet resource, Power, LP or KP were gained by the system
(triggers, costs, Maneuvers, Surges, Recovery, damage; never the sheet's own +/−). Variables `@gained` (after the caps),
`@wanted` (before them), `@overflow` (wanted − gained), `@res_<slug>` = 1 (`@res_life`, `@res_ki`, `@res_power` or a
resource slug), `@viaSurge`, `@viaRecovery`, `@viaTrigger`. `resourceSpend`: spent or lost; `@spent`, `@res_<slug>`,
`@viaCost` (a trigger or option cost, a Maneuver, an attack's own KP/LP), `@viaAttack` (what an attack itself spent), `@viaDamage`. This Combat Round: `@resGained.<slug>`, `@resSpent.<slug>`. The effects of these triggers
never fire them again.
- "Whenever you gain stacks of Overwhelm, regain 2(bT) KP per stack" → `{ "event": "resourceGain", "condition":
  "@res_overwhelm == 1", "effect": "ki", "value": "(2*@gained)(bT)" }`.
- "If you would gain Battle Creation while at its maximum, ..." → condition `@res_battlecreation == 1 && @overflow >= 1`.

**New moments and ending effects (B3).** Events: `stateLeave` (a State drops to 0 — it ended, expired or was switched
off; not at the end of the encounter; `@state_<key>` = 1, `@level` = the level it had), `allyDefeated` (an Ally of your
encounter is Defeated; other = it; `@allyMinion`, `@byAttack`, `@byOpponent`), `inflict` (one of your trigger effects
gave another Character a Combat Condition; other = it; `@cond_<key>` = 1, `@level`). Effects: `removeCondition`
(`resource` = a Condition key, `any` = the player picks (outside `use` it is always a chat button, so that the owner
picks), `all`; exclusions `any!pinned!suffocating`; `value` = stacks, blank = all; a Condition held by a token icon, an
Injury or a Grapple stays and the chat says why), `leaveState`
(`resource` = a State key; it leaves even a State another effect gave). `dot` now accepts a duration (timed DOT
stacks). Trigger target `targeted`: the Character the clicking user targets (the effect becomes a button; on `use` it
is your target). Duration `endOfNextRound` for buff/state/condition/mark. Change: `startOfNextTurn` on the other
Character now ends at the start of YOUR next turn (as the rules say), like the end-of-turn durations already did.
- Field `group` on button triggers (ask, maneuver, amount, targeted): the ones of one event with the same group are ONE
  chat button that applies them all (its limit and cost are the first one's). "When Surging ends: you may use a Healing
  Surge and remove Fatigued, 1/Encounter" → `stateLeave`, `@state_surging == 1`, a `maneuver` trigger `healingSurge` and
  a `removeCondition` `fatigued` with `"mode": "ask"`, both `"group": "glass5"`, `"limit": "1/Encounter"`.
- "Remove one Combat Condition (not Pinned, Suffocating...)" → `removeCondition`, resource
  `any!pinned!suffocating!stressExhaustion!transfigured`, value `1`.

**Rolls and checks inside triggers (B4).** Fields: `roll` (a dice formula: `1d10`, `2d10kh`, and scaled ones such as `1d8(T)` = T eight-sided dice or `1d10(bT)`; `@roll` = total,
`@rollNatural` = first die, in the condition and value), `rollKey` (triggers of the same event with the same key share
ONE roll and one check), `check` (`steadfast`, `steadfast:-2` (Dice Score −2), `save.<save>:<tn>`, `skill.<skill>:<tn>`,
`clash:<mine>` or `clash:<mine> vs <theirs>` with might, impulsive, corporeal, cognitive, morale, a skill key, strike,
dodge; `a|b` = the better one; against the event's other Character or the `targeted` one), `onCheck` (`success`, the
default, or `fail`). After the check: `@checkTotal`, `@checkSuccess`, `@margin`. A Clash check is always a button (its
owner rolls).
- "Roll 1d10: on 4+ gain a Demonic Power stack, otherwise a Demonic Fatigue stack" → two `attackMade` triggers with
  `"roll": "1d10", "rollKey": "pressure"`, conditions `@roll >= 4` (resource Demonic Power) and `@roll <= 3` (Demonic Fatigue).
- "When Defeated, make a Steadfast Check at −2; on a success enter Undying until the end of your next turn" →
  `{ "event": "threshold", "condition": "@defeated == 1", "check": "steadfast:-2", "effect": "state", "resource": "undying",
  "duration": "endOfNextTurn" }` (entering Undying this way ends the Defeated status).
- "1/Round, when you knock an Opponent through a Threshold, make a Might Clash; if you win it is Prone" →
  `{ "event": "attackHit", "condition": "@knocked >= 1", "check": "clash:might", "effect": "condition", "resource": "prone",
  "target": "other", "mode": "ask", "limit": "1/Round" }`.

**Maneuver tuning, Legend Realized, Empower, Transformation access (B5).** Targets: `charge.kp` (± flat KP of the
Energy Charge, after `charge.kpMult`), `kpCost.maneuver` (± KP of the Maneuvers the system charges), `surge.healBonus`
(+ LP, dice allowed), `surge.healMult` (× the dice LP, before Surgency), `surge.toKi` (1: the Healing Surge gives its LP
as KP and Capacity instead), `recovery.lifeMult`, `recovery.minActions` (the fewest Actions, 2 by default; lowest wins),
`recovery.actions` (± Actions it costs), `flag.recoveryNoDvPenalty`, `legend.lifeMult` (× its LP only),
`empower.actions` (+ Actions counted), `flag.empowerMelee` (always the doubled Melee Range amount), `flag.empowerMax`
(no limit per Action), `stressReq.<slug>` (± that Transformation's Stress Test Requirement; slug of its name:
`stressReq.seethingfury`). `mode: "ask"`, `limit`, `cost`, `amount`, `group`, `limitKey` work on `charge.kp`,
`surge.healBonus`, `surge.healMult`, `surge.toKi`, `recovery.lifeMult`, `recovery.actions` (and `limit` on
`recovery.minActions`): an option box when the Maneuver is used. Not on the older `surge.kiMult`, `surge.healSurgency`,
`recovery.kiMult`, `recovery.bonus`, `charge.kpMult`, `charge.category` (always on). Variables `@chargesRound`, `@surgesRound` (this Combat Round),
`@damagedSinceTurn` (times an attack damaged you since your last turn started).
- Field `with` on the `maneuver` effect: one-shot buckets for that use, `<target>=<formula>` separated by `;`, only that
  Maneuver's targets (`surge.*` for healingSurge/kiSurge/surge, `recovery.*` + `flag.recoveryNoDvPenalty` + `actions` for
  combatRecovery, `charge.*` + `kpCost.maneuver` for energyCharge, `legend.*` for transformation, `empower.*` + the two
  Empower flags + `actions` for empower). "When Defeated, use a Healing Surge that doubles its dice" →
  `{ "event": "threshold", "condition": "@defeated == 1", "effect": "maneuver", "resource": "healingSurge", "with": "surge.healMult=2" }`.
  "Empower with all your KP" → `"resource": "empower", "with": "actions=9001"`.
- Events `legendRealized` (`@legendLife`, `@legendKi`), `empower` (other = the Ally; `@actionsSpent`, `@kpGiven`,
  `@dkpGiven`, `@oos`), `empowered` (other = the giver; `@kpGained`).
- "The first Energy Charge each round costs 1(T) less" → `{ "target": "charge.kp", "value": "-1(T)", "condition": "@chargesRound == 0" }`.
- Grants also work on **Transformation** effects (Awakenings, Forms, Enhancements, Evolved Forms): "Gain access to the X
  Unique Ability / Maneuver / Talent" → `code` category `grant` with the same spec; the Transformation item carries them and
  brings the item to the sheet with it.
- Grants (`code` category `grant`): `grant transformation: <name>` and `grant transformationLine: <line>` (every Stage
  of it), with an optional Aspect patch: `grant transformation: Pure Form +aspect:prelude`,
  `grant transformation: Great Namekian +aspect:natural:1` (keys of DBU.aspects). Removing the Trait keeps a
  Transformation that has Mastery or Grade progress.

## More vocabulary (5C): sheet data, rolls, Clashes

This replaces "Skill RANKS are not a target" above, and the code category `clash` for the patterns below.

**Saves, Skills, budgets, TP/KP costs (C1).**
- `saveProf.<save>` / `saveProf.all` (value `1`): the Racial Saving Throw Bonus (+T, Critical Target −1) on that Save / on
  every Save. "Racial Saving Throw Bonus on Morale" → `saveProf.morale`.
- `crit.save.<save>`, `crit.skill.<skill>` (Critical Target of one Save / Skill: `-2` = crit on 8+), `natural.save`,
  `natural.skill`, `natural.skill.<skill>` (+ Natural Result), `skill.attr.<attr>` (+ to every Skill of that Attribute).
- `skillRank.<skill>` (+ Ranks, still capped by the Skill Rank cap): "gain a Skill Rank in Perception" →
  `{ "target": "skillRank.perception", "value": "1" }`. "A Skill Rank in a Skill of your choice" → `skillRanks.racial`
  `1` (one more Racial Skill Rank the player places in the racial column).
- `talents` (+ Talent Additions), `skillImprovements` (+ Skill Improvements, with their Ranks and TP; worked out early,
  so its condition may only use PL / ToP / state data).
- `tpCost.ua` (± TP of every Unique Ability, never below half its listed cost), `tpCost.ua.magical` (only those whose
  type is Magical: "−2 TP Cost of Magical Unique Abilities" → `{ "target": "tpCost.ua.magical", "value": "-2" }`),
  `kpCost.ua.magical` (shown on the sheet only, like `kpCost.ua`), `tpCost.signature` (± TP of each Signature after
  every other calculation, minimum 0, KP Cost unchanged), `tpStart.mult.physical|energy|magic` (× the starting TP Cost,
  before the 8 TP floor: "halve the starting TP Cost of Energy Signatures" → `tpStart.mult.energy` `0.5`).
- Variables: `@ranks.<skill>` (the Ranks written on the sheet: racial + ranks + bonus, never the effects, so a
  `skillRank` piece may test it), `@skillImprovements`.

**Derived state (C2).**
- Variables: `@rlm`, `@sizeNow` (current Size index: 0 nano, 1 tiny, 2 small, 3 medium, 4 large, 5 enormous, 6 gigantic,
  7 colossal; `@size` stays the base one), `@sizeDv` / `@sizeSoak` (the Size bonus per T in use), `@wielding` (Weapons
  wielded), `@inCombat`, `@dimDefense` (Diminishing Defense stacks), `@initiative` (your Initiative), `@initiativeTop`
  (the highest), `@sizeTop` (the largest current Size in the encounter), `@turnAlly` (an Ally's turn, not yours),
  `@alliesDefeated`, `@resGained.<slug>` / `@resSpent.<slug>` (this Combat Round), `@marks.<slug>` (Characters carrying
  your mark), `@chargesRound`, `@surgesRound`, `@damagedSinceTurn`.
- `rlm`, `size` and `size.min` pieces are worked out first (after the Attributes), then `sizeAs.*` and `apparelBonus.*`
  ones, then every other target. So `sizeAs.*` / `apparelBonus.*` may use `@rlm` and `@sizeNow` ("on a Large character":
  `@sizeNow >= 4`), but `rlm` / `size` pieces may not; neither may use `@sizeDv`, `@sizeSoak` or `@sizeTop` (the
  validator says so). All of them may use the Apparel variables, which there hold the bonuses before any
  `apparelBonus` piece ("+1(T) to your Natural Apparel while you wear no other Apparel" → `apparelBonus.natural`,
  condition `@apparelWorn == 0`). Every other target may use all of them.
- Apparel (equipped pieces; slug = lowercase letters/digits of the item name, Natural Apparel also `natural`):
  `@apparel.<slug>.bonus`, `@apparel.<slug>.break` (Break Value, 0 = broken), `@apparel.natural.bonus|break`,
  `@apparel.top.bonus`, `@apparel.top.armor` (1: the top layer is Armor or Weights), `@apparelWorn` (pieces in use that are
  neither Natural nor Integrated: "while wearing no Apparel" → `@apparelWorn == 0`).
- Late variables `@soakNow`, `@surgencyNow`, `@dvNow` (after the Aptitudes, Broken included) and `@tp` (Technique Points
  total): only on `dr`, `wound`, `wound.physical|energy|magic`, `strike`, `dodge`, `combat`; `@tp` also on `life.final`.
- Targets: `life.final` (+ Max LP after `life.mult`), `guardCost` (± KP of the Guard), `sizeAs.dv` / `sizeAs.soak` (± Size
  Categories used for that bonus), `sizeAs.dv.max|min`, `sizeAs.soak.max|min` (clamp that index: "use the Large bonus at
  most" → `sizeAs.dv.max` `4`), `dimOffense.mult`, `dimDefense.penaltyMult` (× those penalties), `apparelBonus.<slug>`
  (+ that piece's Apparel Bonus), `apparelBonus.mult.<slug>` (×).
- Effect `breakValue`: `resource` = the Apparel name (or `natural`), `value` ±; the Break Value stays 0–3 and raising a
  broken piece mends it (it works again at once).
- Examples: "while wielding a Weapon" → `@wielding >= 1`; "DR equal to half your Soak" →
  `{ "target": "dr", "value": "floor(@soakNow/2)" }`; "+1(T) Apparel Bonus of your Plating" →
  `{ "target": "apparelBonus.plating", "value": "1(T)" }`; "a Healing Surge restores 1 Break Value of your Quillset" →
  `{ "event": "surge", "condition": "@healingSurge == 1", "effect": "breakValue", "resource": "Quillset", "value": "1" }`;
  "Max LP + half your Technique Points" → `{ "target": "life.final", "value": "floor(@tp/2)" }`.

**Roll reactions (C3).**
- Event `roll`: the reaction window of every roll you make (Strike, Dodge, Wound, Save, Skill, Clash, Steadfast, Stress),
  after the dice and before the result is used. Event `rolled`: the final result (normal effects: `resource`, `power`...).
- Variables of both: `@kind_strike|dodge|wound|save|skill|clash|steadfast|stress`, `@combatRoll` (Strike, Dodge or Wound),
  `@natural`, `@rawNatural`, `@crit`, `@botch`, `@critTarget`, `@botchPenalty`, `@total`, `@tn`, `@success`,
  `@thresholdCheck` (the Steadfast Check of a Health Threshold), `@inClash`; on an attack's rolls the attack variables
  (`@armed`, `@signature`, `@via_*`...) and `@critStrike` on its Wound Roll; in a Clash the clash variables below.
- Effects (only on `roll`): `reroll` (resource `base` = the Base Die again, the default; `all` = every die; the new
  result stands), `natural` (± Natural Result, 1–10, Critical/Botch worked out again), `naturalSet`, `rollBonus` (+ Dice
  Score, dice allowed), `critical` (a Critical Result, not a Botch), `succeed` (a check with a TN counts as a success);
  `message`.
- `mode: "ask"` or an `amount` → a button of the reaction dialog; `cost`, `limit`, `limitKey`, `group` work as on option
  pieces (one group = ONE button: the first amount, the costs summed and paid once, each piece's condition tested with
  `@n`). Automatic reactions apply once per roll, in item order; `mode: "remind"` only puts its label on the roll card.
  A `critical` on a roll that already is a Critical, or a `succeed` on a roll without a TN or already a success, is not
  offered (nothing paid or counted). The B4 fields (`roll`, `rollKey`, `check`, `onCheck`) do not exist on `roll`
  triggers, and `check` is refused on `rolled` (its own roll would be a new roll).
- Examples: "1/Round, a Botch on a Combat Roll gives +2(T) instead of its penalty" → `{ "event": "roll", "condition":
  "@botch == 1 && @combatRoll == 1", "effect": "rollBonus", "value": "2(T) + @botchPenalty", "limit": "1/Round" }`.
  "Spend any number of AP on a Combat Roll for +1(T) each" → `{ "event": "roll", "condition": "@combatRoll == 1",
  "effect": "rollBonus", "value": "@n(T)", "mode": "ask", "group": "aw2", "amount": "@res.adaptationpoints", "cost":
  "res:Adaptation Points:@n" }`; its follow-up "2+ AP spent on a Wound Roll: + @below(T)" is a piece of the same group:
  `{ "event": "roll", "group": "aw2", "condition": "@n >= 2 && @kind_wound == 1", "effect": "rollBonus", "value":
  "@below(T)" }`. "+2 to your Natural Result, up to 2" → `{ "event": "roll", "effect": "natural", "value": "@n",
  "amount": "2", "mode": "ask" }`.

**Clashes (C4).**
- Every Clash of the system goes through one resolver: Grapple Checks, Launch, Pin, Escape, Thrust, Collisions, the
  Might Clashes of Knockback and Gravity Cage (`@via_knockback`, `@via_gravitycage`), the Adventuring Skill Clashes,
  the Clash check of a trigger (5B `check: "clash:..."`), the Clash button of the Combat tab and of the chat card of a
  Maneuver / Unique Ability that mentions a Clash. Ties go to the Defender (the one who did not start it).
- Targets: `clash.all`, `clash.might`, `clash.save`, `clash.skill` (when that side rolls Might / a Save / a Skill),
  `clash.grapple` (Grapple Checks), `clash.natural` (+ Natural Result), `clash.autoWin` (value 1: win without anyone
  rolling; its condition must use `@initiated`; the other pieces of both sides then do nothing, so nothing of them is
  paid or counted, and the initiator is asked nothing when the Defender wins that way). The initiator's pieces may be `mode: "ask"` with `cost`, `amount`,
  `limit`, `group`; the Defender's apply by themselves.
- Variables: `@initiated` (1: you started it), `@clash_might|save|skill|strike|dodge|grapple`, `@clash_<save>`,
  `@clash_<skill>`, `@clash_<attr>` (what YOU roll), `@via_<slug>` (`grapple`, `pin`, `launch`, `escape`, `thrust`,
  `collision`, `knockback`, `gravitycage`, or the item / Adventuring Maneuver used: `terrify`, `insult`, `search`...),
  `@vs.*` (the other side).
- Events `clashWon`, `clashLost` (other = the other side, `target: "other"` allowed): the same variables plus `@margin`
  (your total − theirs), `@mine`, `@theirs`, `@autoWin`.
- Examples: "+1(T) to Clashes an Opponent starts against your Might" → `{ "target": "clash.might", "value": "1(T)",
  "condition": "@initiated == 0" }`; "automatically win Concealment Clashes started by another Character" →
  `{ "target": "clash.autoWin", "value": "1", "condition": "@clash_concealment == 1 && @initiated == 0" }`; "when you win
  the Clash of your Terrify Maneuver, gain 1 Overwhelm (1/Round)" → `{ "event": "clashWon", "condition":
  "@via_terrify == 1", "effect": "resource", "resource": "Overwhelm", "value": "1", "limit": "1/Round" }`.

## More vocabulary (6D): other effects, Aspects, States, grants

Round 3 adds three packages: 6D (this section: effect references, Aspects by modifier, the Surging State, grants),
6E (Maneuver events and Transformation rules) and 6F (attack-time additions). Their vocabulary works with all of 5A-5C.

### Effect references

Every effect has a **reference**: `<item slug>_<Trait>_<n>` in lowercase letters and digits, accents dropped. The item
slug and the Trait are the first two parts of the effect key, the number its third part: `super-saiyan|Golden Power|3`
→ `supersaiyan_goldenpower_3`; `glass-power|Reflective Power (Overflowing Power)|5` →
`glasspower_reflectivepoweroverflowingpower_5`; a repeated number keeps its letter (`..._3b`). Each batch effect has its
own `ref`, and `related` lists the effects its text names (with their `ref`, text and current entry). The validator
refuses a reference that names no effect.

| Piece | Meaning |
|---|---|
| `@fx.<ref>` | 1 while that effect is in force: its item works (a Transformation you are in, a Racial Trait switched on, an Awakening with Stacks) or it is Permanent, and its Trait's condition holds (a Mastery Trait's `@M >= 1`). |
| `fxOff.<ref>` (value 1) | its pieces (modifiers and triggers) do nothing: "ignore the 3rd effect of Overwhelming Focus", "Highly Diluted forbids the 7th effect of Rubbery Body", "switch off the 1st effect of Power of the Weak". |
| `fxOn.<ref>` (value 1) | its pieces work while its item does not (the item must be on the sheet): "keep Erratic Majin's 7th effect active outside Pure Form". |
| `fxMult.<ref>` | × the value of each of its pieces (product of every fxMult): "double the bonuses of the Teamwork Talent's 2nd effect" → `fxMult.<ref>` `2`; "triple the Dice Category increase of the 4th effect of Mixed S-Cells" → `3`. |
| `fxAdd.<ref>` | + to the value of each of its pieces (formula, worked out with this piece's own variables): "+2(bT) KP regained through the 3rd effect of Power Core" → `fxAdd.<ref>` `2(bT)`; "+G(bT) to the LP of Namekian Biology effect 6" → `G(bT)`. |
| `fxLimit.<ref>` (text) | the use limit its pieces get instead of their own: "Worldly Power 4 becomes 1/Round" → `fxLimit.<ref>` `1/Round`. The limit is read with the variables of the OTHER effect's item: `M/Encounter` is that item's Mastery (right when both effects are on the same Transformation); for another item write `@mastery.<its slug>/Encounter`. |
| event `fxUsed` | a piece of an effect was applied (an automatic trigger ran, a button was clicked; not its reminders): `@fxUsed.<ref>` = 1. "When the 3rd effect of Steaming Fury triggers, you may ..." → a trigger on `fxUsed` with condition `@fxUsed.<ref of Steaming Fury 3> == 1`. The other Character is the one the piece went to, when it was not you. The effects of an `fxUsed` trigger never fire it again. |
| `@viaFx.<ref>` | 1 on the events of what a piece of that effect started: the `stateEnter` of a State it gave, the `powerUp` / `surge` / `energyCharge` / `transform` / attack events of a Maneuver used through its `maneuver` button (and in the attack's pieces, see 6F). |
| `@stateFx.<state>.<ref>` | 1 while that State was entered through a piece of that effect (until the State is entered again some other way). "Ignore the 2nd effect of the Surging State when it was entered through this effect" → `{ "target": "ignoreState.surging.2", "value": "1", "condition": "@stateFx.surging.<own ref> == 1" }`. |
| `@already` (stateEnter) | 1 when an effect would put you in a State you are already in (the event fires anyway, with the level you have): "when an effect would put you in the Surging State while already Surging" → `stateEnter`, `@state_surging == 1 && @already == 1`. |

These pieces are worked out before every other modifier: their conditions see the formula data of the moment and
`@fx`, not the Aptitudes nor `@powerSpiked`. Prefer them to rewriting another effect's entry: they keep each effect's
data in its own entry. They change what the system does with the other effect's pieces; when the other effect is
`code` (nothing to switch off or multiply), so is the part of yours that depends on it.

Examples:
- "Mortal Power's High Mortal Power (2): Worldly Power 4 becomes 1/Round" (a Mastery Trait: the importer adds `@M >= 2`)
  → `{ "target": "fxLimit.mortalpower_worldlypoweroverflowingpower_4", "value": "1/Round" }`.
- "When you use the 3rd effect of Golden Power you may enter the Superior State instead of Raging, until the start of
  your next turn" → `{ "event": "fxUsed", "condition": "@fxUsed.<golden power 3> == 1", "effect": "state", "resource":
  "superior", "duration": "startOfNextTurn", "mode": "ask" }` plus, when the swap is one choice, a second ask trigger in
  the same `group` with `"effect": "leaveState", "resource": "raging"`.
- "Divine Warrior Blood counts as Warrior Blood for your effects" is not a reference: it stays `code` (resourceRule).

### Aspects by modifier

| Target | Meaning |
|---|---|
| `aspect.<key>` | ± levels of THIS Transformation's Aspect (it gains it when it lacks it; a total of 0 or less removes it): "gains the Armored Aspect while Raging level 2+" → `{ "target": "aspect.armored", "value": "1", "condition": "@states.raging >= 2" }`; "Draining Aspect −1 level" → `"-1"`; "loses the Growth Aspect" → `"-9"`. An Aspect without levels is 1 (value 1 adds it, −1 removes it). |
| `aspect.<key>.<param>` | the Aspect with that parameter: `aspect.enhancedSave.impulsive` (`aspect.enhancedSave.all` = every Save), `aspect.innateState.raging`, `aspect.linked.sparkingaura`, `aspect.innateState.godki`. A negative value removes only that parameter. |
| `aspectSet.<key>` | sets the level (0 removes): "The Draining Aspect level equals your Power stacks" → `{ "target": "aspectSet.draining", "value": "@power" }`. |
| `aspectAll.<key>[.<param>]` | every Transformation you are in: "while Superior, every Transformation you are in gains the Armored Aspect". |
| `aspectOf.<slug>.<key>[.<param>]` | the Transformation of that slug (lowercase letters/digits of its name): "Wrathful gains 2 levels of the Scaling Aspect while you have this Trait" (Racial Trait or another Transformation) → `{ "target": "aspectOf.wrathful.scaling", "value": "2" }`; "ignore the Rampaging Aspect of Wrathful" → `aspectOf.wrathful.rampaging` `-9`. |

Keys are those of the Aspects table (`armored`, `bulky`, `enhancedSave`, `glowing`, `godKi`, `growth`, `heartbeat`,
`highSpeed`, `innateState`, `linked`, `mindful`, `natural`, `perfectKiControl`, `pinnacle`, `prelude`, `raging`,
`scaling`, `superSaiyanForm`, `transcendent`, `blutzWave`, `bursting`, `difficult`, `draining`, `exhausting`,
`fading`, `lightDependent`, `limited`, `longTransformation`, `peaked`, `powerHigh`, `rampaging`, `straining`,
`weakening`...). They are worked out after the Power maximum (so `@powerSpiked` works), then every modifier is gathered
again with the new Aspects: everything the system does with an Aspect (Armored, Enhanced Save, Perfect Ki Control,
Innate State, God Ki, Draining, Natural, Scaling, High Speed...) follows. A Racial Trait has no Aspects of its own: it
uses `aspectAll` / `aspectOf`. Mastery Traits that only reduce or remove an Aspect are still done by the importer
(`covered`); use these targets for the other cases (a condition, a State, another item, Grades, Transcended `@TR`).

### The Surging State is automated

Its effects are built-in (numbered as on the States page): (1) entering it you get a chat button to mark your Focus
(the "Focus" mark on the targeted Opponent: `@vs.mark.focus`, `@vsAny.mark.focus`), every Attacking Maneuver that
includes your Focus gets 1 Energy Charge, and the mark goes when you leave the State; (2) leaving it, Fatigued until the
end of your next turn; (4) no Compelled while Surging (removed on entering); (5) a reminder when you Defeat your
Focus. `ignoreState.surging.<n>` switches one off ("ignore the 2nd effect of the Surging State"), with
`@stateFx.surging.<ref>` for "when it was entered through this effect". "Every Opponent counts as your Focus" stays
`code`.

### Grants

- New items: the Special / Modifier / God Maneuvers written on Transformation pages ("Coral Rain Special Maneuver",
  "Stance Maneuver", "War Cry", "Divine Blessing Maneuver"...) are compendium items now, so "Gain access to the X
  Maneuver" on a Transformation is `code` category `grant` with `grant maneuver: X` (Transformations carry grants, see 5B).
- `+active` after a name: the granted item works only while the item that grants it works ("gain access to the Divine
  Flame God Maneuver while in this Transformation" → `grant maneuver: Divine Flame +active`; "grant the Grippy
  Grabbers Bestial Trait while in Super Form" → `grant racialTrait: Grippy Grabbers +active`). Without it the item stays
  on the sheet and works at all times.
- `pick: <n> <kind> from <folder or group> [+active]` (Transformations only): a choice asked when the Transformation is
  gained; each pick brings its item ("grant 2 God Maneuvers of your choice while in Super Saiyan Blue" →
  `grant pick: 2 maneuver from God Maneuvers +active`; "one Bestial Trait of your choice while in this Transformation" →
  `grant pick: 1 racialTrait from Bestial Traits +active`). kind = maneuver, talent, uniqueAbility, racialTrait; the
  folder is a compendium folder name, or for Racial Traits their group / Factor / Race. Several grants: `;`.
- Still `code`: a grant that depends on a condition other than "while in this Transformation" ("while holding 2+ Divine
  Battle Born"), a pick restricted by another choice ("whose Race matches your Genetic Traits"), Signatures and
  Legendary Traits (not items).

### Items you have and Maneuvers you used

- `@item.<slug>`: how many items of that name work for you (Racial Traits switched on, Transformations you are in,
  Awakenings with Stacks, Talents, Maneuvers, Unique Abilities, Signatures, equipped Weapons / Apparel / Equipment; the
  quantity of a stack of items). Slug = lowercase letters/digits of the name; "X Maneuver" also counts as `@item.x`.
  "+1(T) Wound and Soak while you have an Integrated Majin-Dama" → condition `@item.majindama >= 1` (when the item's
  name says what matters); "while you wield the Ki Weapon" → `@item.kiweapon >= 1`.
- `@used.<slug>` / `@usedEnc.<slug>`: times you used that Maneuver / Unique Ability / item this Combat Round / this
  Combat Encounter (counted by the 6E events `maneuverUsed` / `itemUsed`): "+1(T) Combat Rolls during a Combat Round in
  which you used a Snack" → `@used.snack >= 1`; "after the Hype Maneuver was used 3+ times this encounter" →
  `@usedEnc.hype >= 3`.

### Distances on the map

While you are in a Combat Encounter, the tokens of the encounter on your token's scene give these variables (anywhere;
a token that moves refreshes the actors that read them). Distances are in Squares between the edges of the tokens:
touching tokens (also diagonally) are 1 Square apart, so "within 1 Square" = adjacent = your Melee Range (the system
takes the Melee Range as the adjacent Squares); one empty Square between them is 2; height (token elevation) counts too.

| Variable | Meaning |
|---|---|
| `@alliesWithin.<n>` / `@opponentsWithin.<n>` | non-Defeated Allies / Opponents (by token disposition) within n Squares of you, n = 1 to 12 |
| `@alliesAdjacent` / `@opponentsAdjacent` | the same within 1 Square (in your Melee Range) |
| `@nearestAlly` / `@nearestOpponent` | Squares to the nearest one (99 when there is none) |

- "While no Opponents are within your Melee Range, +1(T) Strike Rolls" → `{ "target": "strike", "value": "1(T)",
  "condition": "@opponentsAdjacent == 0 && @inCombat == 1" }` (outside of combat every count is 0: add `@inCombat` when
  "no Opponent" must not hold there).
- "While an Ally is adjacent to you, +1(T) Soak" → condition `@alliesAdjacent >= 1`.
- Still `code` / GM: what depends on a particular Character's distance (the target of an attack, "an Opponent who ends
  its turn next to you"), areas centred elsewhere (AoE, Zones), moving tokens, Squares and their qualities.

## More vocabulary (6E): Maneuver events and Transformation rules

Files of package E (module paths under `dbu-rpg/module/`): `combat/triggers.mjs` (events, the `leave` effect, the Ally
events), `documents/actor.mjs` (`transform` / `revert`, `useOutOfSequence`, `defeatEnd`), `documents/item.mjs` (`use`,
the "Use" button, `apparelDoff`), `rules/transform-rules.mjs` (the Transformation rules), `combat/awakening.mjs`,
`combat/divine.mjs`, `combat/villainous.mjs`, `chat.mjs`, `vocab/e.mjs`, `tools/vocab/e.mjs`, `build/lang/e.json`.
Before giving an effect the verdict `code` with the category `outOfSequence`, `maneuverChange` or `transformationRule`
(or `other` / `resourceRule` for a moment of a Maneuver, an item or a Transformation), check this section.

**Maneuvers and items used (E1).** Event `maneuverUsed`: a Maneuver or a Unique Ability was used (a Special Maneuver's
or Unique Ability's card, its "Use" button, a God Maneuver once paid, a Villainous Maneuver, Empower, and every Maneuver
used through `item:` below). Other = your Foundry target (`target: "other"`, `@vs.*`). Variables:

| Variable | Meaning |
|---|---|
| `@via_<slug>` | 1 for that item: lowercase letters/digits of its name without "Maneuver" (Hype Maneuver → `@via_hype`, Bite Attack → `@via_biteattack`, Barrier → `@via_barrier`) |
| `@ua`, `@special`, `@god`, `@villainous` | a Unique Ability / a Special Maneuver (not one of the Actions & Maneuvers page, not God, not Villainous; the Racial and Transformation ones count) / a God Maneuver / a Villainous Maneuver |
| `@standard`, `@instant`, `@counterManeuver`, `@modifierManeuver`, `@actionCost` | its Maneuver type; its Actions (0 for none or a variable cost): "a 1-Action Standard Maneuver" → `@standard == 1 && @actionCost == 1` |
| `@uaType_<type>` | a Unique Ability's type (`@uaType_magical`, `@uaType_technical`, `@uaType_spiritual`) |
| `@oos` | used Out-of-Sequence (through a `maneuver` button) |

Event `itemUsed`: an item (Basic Item, Accessory) was used; a Consumable one spends 1 of its Quantity (none left: refused).
Variables `@via_<slug>` (Snack → `@via_snack`, Sake Bottle → `@via_sakebottle`), `@consumable`, `@food`, `@basic`,
`@accessory`, `@oos`. Both events count the use in the encounter: `@used.<slug>` (this Combat Round) and
`@usedEnc.<slug>` (this Combat Encounter) work in every formula, with the slug with or without "maneuver"
(`@usedEnc.hype`, `@usedEnc.hypemaneuver`); `@item.<slug>` = the items that work (by name).
- "When you use the Hype Maneuver, +1(T) Combat Rolls until the end of your turn (1/Round)" →
  `{ "event": "maneuverUsed", "condition": "@via_hype == 1", "effect": "buff", "resource": "combat", "value": "1(T)",
  "duration": "endOfTurn", "limit": "1/Round" }`.
- "Only in a Combat Round in which you used a Snack" → condition `@used.snack >= 1`.

**Moments (E1).** `defeatEnd`: you stop being Defeated (the Defeated status removed, Life Points back above 0, or
Undying ending the Defeat); `@byLife`, `@byUndying`, `@byStatus`. `allyHit`: an attack of an Ally of yours (same token
disposition, same Combat Encounter, not Defeated) damaged one of your Opponents; other = that Opponent (`@vs.*` is about
it); the variables of `attackHit` (`@damage`, `@knocked`, `@defeated`, `@crit`, `@signature`...) plus `@allyMinion`
(the Ally is a Minion) and `@allyMark.<slug>` (1: the Ally carries your mark, e.g. your Bonded Ally:
`@allyMark.bonded == 1`). `allyDamaged`: an attack damaged an Ally of yours; other = the attacker; the variables of
`damaged` plus `@allyBelow` (the Health Thresholds that Ally is below), `@allyMinion`, `@allyMark.<slug>`. Both fire on
every hit, like `attackHit`: "if it deals Damage" → `@damage >= 1`.

**Maneuver keys (E2)** of the `maneuver` effect: `item:<Name>` (the actor's item of that name, any case, "Maneuver"
optional: a Special Maneuver / Unique Ability / item its normal use, no Action spent; a Signature Technique an
Out-of-Sequence attack; a Form or Enhancement the Transformation Maneuver into it), `standard` (a 1-Action Standard
Maneuver: a reminder card, then a pick among Power Up, Energy Charge, Basic Attack, Signature, Transformation, Movement
and the actor's 1-Action Standard Special Maneuvers / Unique Abilities), `exploit` / `feint` (an attack made through that
Maneuver). They mix in a list: `"item:Hype Maneuver|powerUp"`. "Use X as an Instant Maneuver" stays a `use` trigger
with `@myTurn == 1` and the `maneuver` effect (no Action spent).
- "1/Encounter, when you stop being Defeated, use a Surge as an Out-of-Sequence Maneuver" → `{ "event": "defeatEnd",
  "effect": "maneuver", "resource": "surge", "limit": "1/Encounter" }`.
- "At the start of your turn, 1/Encounter, offer the Roar Special Maneuver Out-of-Sequence" → `{ "event": "startOfTurn",
  "effect": "maneuver", "resource": "item:Roar", "limit": "1/Encounter" }`.

**Transformation rules (E3).** Modifier targets read when the Transformation Maneuver is used or a Transformation is
left (never summed on the sheet; no mode, limit, cost, amount or group):

| Target | Meaning |
|---|---|
| `enterBlock` | value 1 + condition: you cannot enter THIS Transformation. Worked out with its own variables (`@M`, `@G`...) while you are not in it yet |
| `enterBlockOf.<slug>` | from any item that works: you cannot enter a Transformation whose name slug contains `<slug>` ("another Transformation with Kaioken in its name" → `enterBlockOf.kaioken`) |
| `enterBlockAspect.<key>` | ... one that has that Aspect (`enterBlockAspect.blutzWave`, `enterBlockAspect.godKi`, `enterBlockAspect.superSaiyanForm`) |
| `enterBlockType.<type>` | ... one of that type: `form`, `enhancement`, `evolved` ("No Enhancement can be used with this Form" → `enterBlockType.enhancement`) |
| `combineBlock` | this Transformation is used alone: while in it you cannot enter one that would stay with it, and you cannot enter it while one would stay |
| `leaveBlock` | you cannot leave this Transformation by choice (Revert, or entering one that replaces it), except into another Stage of its Line; effects still make you leave |
| `leaveWhen` | value 1 + condition: you leave this Transformation as soon as the condition holds (checked after every change of the character); value 2: without the Stress Exhaustion and Impediment of Exhausting; on an Awakening its Grand Awakening ends |
| `grandTrigger` | on an Awakening: its Grand Trigger is met (worked out as if the Grand Awakening were active; in a Combat Encounter the Full Awakening Maneuver is offered in chat once) |

A block from a Transformation that the one entered replaces does not count (an Enhancement does not block the
Enhancement that replaces it); a Racial Trait has no `enterBlock`, `combineBlock`, `leaveBlock`, `leaveWhen` or
`grandTrigger` of its own (the families work on it). The refusal names the Trait in the notification.
Trigger effect `leave`: leave Transformations through an effect (no Revert Maneuver, `leaveBlock` ignored); `resource`
= blank / `this` (the Transformation of the piece; on an Awakening: its Grand Awakening), `all`, `enhancements`, `forms`
(Forms and Evolved Forms), `grandAwakening`, or a Transformation's slug (`supersaiyan`); `value` 2: without the Stress
Exhaustion of Exhausting.
- "Cannot enter without at least 1 stack of Holding Back; leave it when you lose all of them, without Stress Exhaustion" →
  `{ "target": "enterBlock", "value": "1", "condition": "@holdingBack < 1" }` +
  `{ "target": "leaveWhen", "value": "2", "condition": "@holdingBack == 0" }`.
- "Grand Trigger: after using the Hype Maneuver 3+ times this encounter" → on the Awakening
  `{ "target": "grandTrigger", "value": "1", "condition": "@usedEnc.hype >= 3" }`. A moment ("when you gain an Absorption
  stack") becomes a state through a resource: a trigger `resourceSet` "Grand Trigger" 1 at that moment and
  `grandTrigger` with `@res.grandtrigger >= 1` (resources reset with the encounter).
- "When you leave this Transformation, also leave every Enhancement" → `{ "event": "revert", "condition": "@this == 1",
  "effect": "leave", "resource": "enhancements" }`; "leaving the Transformation combined with this one also leaves this
  one" → `{ "event": "revert", "condition": "@this == 0", "effect": "leave", "resource": "this" }`.

**More moments (E4).** `awakeningGain`: one of your Awakenings gained a Stack (any item of yours sees it):
`@awk_<slug>` = 1 for that Awakening (lowercase letters/digits of its name: `@awk_absorption`), `@temp` (a Temporary
Stack), `@tempLevel`, `@free`, `@stacksNow`. `stackGain` now runs the effects of the Awakening that gained the Stack
(its reminders stay on the Stack's card), with the same variables. `apparelDoff`: an Apparel piece you wore was
unequipped (or broke: `@broken` = 1): `@via_<slug>`, `@weights`, `@armor`, `@natural`, `@craftsmanship`.
- "Leave Pure Form whenever you gain a stack of Absorption" → `{ "event": "awakeningGain", "condition":
  "@awk_absorption == 1", "effect": "leave", "resource": "this" }`.
- "When you doff Weights, you may use the Transformation Maneuver Out-of-Sequence to enter Unburdened" →
  `{ "event": "apparelDoff", "condition": "@weights == 1 && @broken == 0", "effect": "maneuver", "resource":
  "item:Unburdened" }`; "while wielding your Ki Weapon" / "leave it when it is destroyed" → `leaveWhen` with
  `@item.kiweapon == 0`.

## More vocabulary (6F): attack-time additions

This replaces the code categories `attackOption`, `defenseOption` and `versusTarget` (and the `outOfSequence` effects that
make an attack) for the patterns below. It builds on 5A (the `vs.*` layer, the option fields `mode`, `limit`, `cost`,
`amount`, `group`, `limitKey`, `at`) and on package D's effect references (`fx`).

### The attack of an effect's button (F1)

A `maneuver` trigger with `resource` `basicAttack`, `signature`, `exploit` or `feint` makes an attack. Its `with` (`;`
separated) says what that attack is:

| Part | Meaning |
|---|---|
| `<attack.* target>=<formula>` | applied to that attack like an automatic option piece (no box, no limit): `attack.category=1`, `attack.strike=1(T)`, `attack.kpFree=1`, `attack.charges=1`, `attack.state=determined`, `attack.aoe=cone`, `attack.advantage.homing=2`... (declaration targets; the formula sees the declaration's attack variables) |
| `only=<filter>[\|<filter>]` | the attack must be one of them; several `only` parts must all hold. Filters: `physical`, `energy`, `magic`, `armed`, `unarmed`, `signature`, `basic`, `ultimate`, `aoe`, `noaoe`, `copied` (the Signature tag), `tag:<tag>`, `profile:<Profile key>`, `element:<name>` (`element:fire`). The dialog only offers the Profiles, Foundations and Weapon choices that fit; any other attack is refused |
| `via=<slug>` | "Made through" picked in the dialog: `exploit`, `defend`, `feint` or the slug of a Maneuver item (`tailattack`). The keys `exploit` / `feint` pick it by themselves |
| `attr=<attr>` | the Damage Attribute of that attack (`ag`, `fo`, `te`, `sc`, `in`, `ma`, `pe`, `surgency`) |

The attack carries `@viaFx.<ref>` = 1 (the reference of the effect whose button made it, package D) in its options, its
`vs.*` pieces and every attack event, also the later ones (`attackHit`, `attackMissed`): "attacks made through this
effect" are pieces and triggers with `@viaFx.<ref> == 1`. `@oos` is 1.

- "Use the Basic Attack Maneuver as an Out-of-Sequence Maneuver; it costs no Ki Points" (Angelic Technique 4) →
  `{ "event": "...", "effect": "maneuver", "resource": "basicAttack", "mode": "ask", "with": "attack.kpFree=1" }`.
- "...a Basic Attack of the Simple Profile with 1 Energy Charge and 2 ranks of Homing and Splitting" (Godslayer 8) →
  `"with": "only=profile:simple; attack.charges=1; attack.advantage.homing=2; attack.advantage.splitting=2"`.
- "The attack made through this use has Agility as its Damage Attribute" (Chosen by the Speed 2) → `"with": "attr=ag"`.
- "The Out-of-Sequence Signature Technique must be a Copied Technique" (Feline Build 4) → `"resource": "signature",
  "with": "only=copied"`.
- "Attacks made through Raging Form's 4th effect gain an Energy Charge" (Raging Form 7) →
  `{ "target": "attack.charges", "value": "1", "condition": "@viaFx.superform_ragingform_4 == 1" }`.

### Advantages, Disadvantages and Super Profiles added to one attack (F2)

| Target (option piece: may be `mode: "ask"`, limited, paid) | Meaning |
|---|---|
| `attack.advantage.<key>` | + ranks of that Advantage or Disadvantage (keys of the Signature builder: `powerShot`, `accurate`, `ascendedSignature`...) for this attack; a negative value removes ranks ("ignore its Inaccurate": `attack.advantage.inaccurate` `-9`) |
| `attack.superProfile.<key>` | the attack has that Super Profile (`allOut`, `annihilation`, `combo`...); refused (a note) when the technique already has another one or a Multi-Profile is picked from an effect |

The technique is worked out again with them, for free: its Ki Point Cost and TP Cost stay (only Efficiency /
Inefficiency added change the Ki Point Cost), the Advantage's requirements and rank limits are the effect's business
("beyond the maximum" works), and the technique is never made invalid. A Basic Attack gets them too (through a stand-in
technique of its Profile; the Signature bonuses `strike.signature` / `wound.signature` stay Signature-only). `@opt_<key>`
and `@superProfile_<key>` see them in the attack events and the later pieces. Ascended Signature makes a Super Signature
an Ultimate for that attack (and it is then used up for the encounter, as an Ultimate is).

What the attack flow does with them:

| Works mechanically | Only the variable (`@opt_<key>` / `@superProfile_<key>`) |
|---|---|
| Advantages: `accurate`, `powerShot`, `longShot`, `lastLegs`, `powerBurst`, `maximumCharge`, `transformationBoost`, `fullWager`, `weaponAssisted`, `armorPiercing`, `shatteringBlow`, `penetration`, `sustained`, `knockback`, `forcefulLaunch`, `preciseStrike`, `intenseBlast`, `terrainDestruction`, `hurricaneAssault`, `widespreadAssault` (a Sphere), `efficiency`, `ascendedSignature`. Disadvantages: `inaccurate`, `lowPenetration`, `lowPowerCrush`, `shortRange`, `backlash`, `allOrNothing`, `inefficiency` | `condition`, `homing`, `splitting`, `chargingAssault`, `hitAndRun`, `staggeringAttack`, `delayed`, `fakeOut`, `trickAttack`, `pepperingBlows`, `shootAndPray`... and `twinLinked` / `deadLink` / `superAdvantage` (they need a choice) |
| Super Profiles: `allOut`, `combo`, `annihilation`, `superBeam`, `superLaunch` | `cataclysmic`, `gigaFlare`, `karmic`, `genki`, `superCombination`, `weatherMaximizer` (and `multiProfile`: use the Multi-Profile sources) |

- "Ultimate Signatures of the Physical or Energy Foundation gain a rank of Power Shot" (Signature Amplifier 2) →
  `{ "target": "attack.advantage.powerShot", "value": "1", "condition": "@ultimate == 1 && @magic == 0" }`.
- "1/Encounter, on an Ultimate Signature, spend 1 Tension to apply Complete Annihilation" (Hero Vocation 5) →
  `{ "target": "attack.superProfile.annihilation", "value": "1", "condition": "@ultimate == 1", "mode": "ask", "limit":
  "1/Encounter", "cost": "res:Tension:1" }`.
- "1/Round, a Super Signature may get the Ascended Signature Advantage" (Oozaru Power 5) →
  `{ "target": "attack.advantage.ascendedSignature", "value": "1", "condition": "@signature == 1 && @ultimate == 0",
  "mode": "ask", "limit": "1/Round" }`.
- A rank of an Advantage "of up to 10 TP" the player picks stays `code` (no choice of key); a named one is data.

### Attack variables (F3)

Everywhere the attack variables are (declaration pieces, `at: "wound"` pieces, `vs.*` pieces, `defense.*` pieces, attack
events): `@weapon_<slug>` (1: the Weapon used has that name, Category or Quality; slug = lowercase letters/digits:
`@weapon_kiweapon`, `@weapon_slashing`, `@weapon_poisoned`), `@sig_<slug>` (the Signature used, by name:
`@sig_kamehameha`), `@viaFx.<ref>` (F1). A role the player gives a Signature ("your Favored Technique", "the Multiplicative
Technique", "the Vile Technique") is a Signature tag: `@tag_favored`, `@tag_multiplicative`, `@tag_vile`.

- "+1(T) Strike and Wound Rolls on attacks made with the Ki Weapon" (Energy Weapon 4) → `attack.strike` and
  `attack.wound` `1(T)`, condition `@weapon_kiweapon == 1`.
- "1/Encounter, Dodonpa used in the Crane Stance gets +1 Damage Category" → `{ "target": "attack.category", "value": "1",
  "condition": "@sig_dodonpa == 1 && ...", "mode": "ask", "limit": "1/Encounter" }`.

### New option and vs targets (F4)

**The Damage Attribute again.** `attack.damageAttrTimes` (+n: the Damage Attribute is added n more times to the Wound
Roll). "1/Round, the Divine Weapon attack applies your Damage Attribute one more time" →
`{ "target": "attack.damageAttrTimes", "value": "1", "condition": "@weapon_divineweapon == 1", "mode": "ask", "limit": "1/Round" }`.

**Added as it hits.** `at: "wound"` now also takes `attack.charges` (+Energy Charges: their dice join this Wound Roll,
beyond the maximum), `attack.chargeCategory` and `attack.damageAttrTimes`. "1/Round, a Critical Result on the Strike Roll
applies an Energy Charge to that attack" (Devastating Sniper 5) → `{ "target": "attack.charges", "value": "1", "at":
"wound", "condition": "@critStrike == 1", "limit": "1/Round" }`. "On hitting with a Ki Wager of 1/4 of your Max Capacity,
+1 Energy Charge" → condition `@hits >= 1 && @wager >= floor(@capacityMax/4)`.

**Punching Down / Punching Up (the Size rules, now automatic).** Punching Down: against a target 2+ Size Categories
smaller, the Punching Down Extra Dice (1d6(T)) join the Wound Roll; a target it does not apply to (an AoE) has them taken
out of its Damage. Punching Up: against a target 2+ Categories larger, +1(T) Wound per Category it is larger, and a Called
Shot at targets that all qualify has no −2(T) Strike penalty.

| Attacker (option pieces: automatic, or asked / limited / paid) | Target (always-on modifiers: how the others count you) |
|---|---|
| `attack.punchDown.size` (+n Size Categories for your Punching Down), `attack.punchDown.sizeSet` (your Size counts as that index: 6 Gigantic, 7 Colossal; the highest wins) | `punchedDown.size` (+n: the others' Punching Down counts you larger), `punchedDown.sizeSet` (they count you as that index; the highest wins) |
| `attack.punchDown.reach` (it applies against targets n Categories closer: 1 = 1 smaller, 2 = your Size or smaller, 9 = any) | `punchedUp.size` (±), `punchedUp.sizeSet` (the others' Punching Up counts you as that index; the lowest wins) |
| `attack.punchDown.category` (+ Dice Category of its Extra Dice), `attack.punchDown.times` (+n: the Extra Dice n more times) | |
| `attack.punchUp.size` (±; −1 = 1 smaller), `attack.punchUp.sizeSet` (the lowest wins: "count as Large for Punching Up" → 4) | |

Variables (not in the declaration's `attack.*` pieces: they are known once it is declared): `@punchDown` / `@punchUp`
(how many targets it applies to: in `vs.*` pieces and `attackHit` / `damaged` / `attackMissed` / `dodged` the target of the
pair, 1 or 0), `@punchDownAll` / `@punchUpAll` (1: every target; `at: "wound"` pieces count the targets hit).
- "Treat your Size as Gigantic for Punching Down" → `{ "target": "attack.punchDown.sizeSet", "value": "6" }`;
  "+1 Dice Category to your Punching Down Extra Dice" → `attack.punchDown.category` `1`; "a target only has to be your
  Size or lower" → `attack.punchDown.reach` `2`; "1/Round, apply the Punching Down Extra Dice an additional time" →
  `{ "target": "attack.punchDown.times", "value": "1", "mode": "ask", "limit": "1/Round" }`.
- "Opponents treat your Size as Gigantic for Punching Down" → `{ "target": "punchedDown.sizeSet", "value": "6" }`;
  "your Size is 1 larger for your Opponents' Punching Down" → `punchedDown.size` `1`; "if larger than Large, you count as
  Large for your Opponent's Punching Up" → `{ "target": "punchedUp.sizeSet", "value": "4", "condition": "@sizeNow > 4" }`.
- "+2(bT) Wound on an attack that has Punching Down applied, 1/Round" → `{ "target": "vs.wound", "value": "2(bT)",
  "condition": "@punchDown == 1", "limit": "1/Round" }`.

**The defender's new pieces** (`vs.*`, its attack against you; ask / limit / cost / amount / group as in 5A unless said):

| Target | Meaning |
|---|---|
| `vs.autoDodge` | once hit: the hit becomes a miss (value 1); value 2: an Absolute Attack's half Wound does not apply either. Only that piece is paid and counted then |
| `vs.noDimDefense` | asked before a Dodge (or with no defense): this attack gives you no Diminishing Defense |
| `vs.ignoreDamageBelow` | Damage lower than the value (after every other step) is 0. Automatic only (no ask, cost, amount, group); a limited one is counted only when it zeroes the Damage |
| `vs.damageMax` | at most this Damage (the lowest wins). Automatic only; counted only when it lowers the Damage |

`vs.*` pieces also get `@defending` (1: the owner of the piece defends against the other Character, 0: it attacks it),
so a bonus to YOUR Parry Strike no longer also boosts your attacks against a parrying target. `defense.freeCounter` /
`defense.freeKp` now see `@vs` (the attacker) and `@defending` (1). `attack.aoe` also takes `sphere` and `any`
(sphere, cone or line).

- "1/Encounter, when targeted below Injured by an attacker not in the Determined State, you may auto-succeed the Dodge Roll"
  (Serene Heart 5) → `{ "target": "vs.autoDodge", "value": "1", "condition": "@below >= 2 && @vs.states.determined == 0",
  "mode": "ask", "limit": "1/Encounter" }`. "1/Round, turn a hit into a miss, ignoring the usual Absolute Attack effects"
  (Law-Defying Battle 4) → value `2`, `"mode": "ask"`, `"limit": "1/Round"`.
- "+1(T) Strike Roll when using the Parry option of the Defend Maneuver" (Robotic Limb 1) → `{ "target": "vs.strike",
  "value": "1(T)", "condition": "@parry == 1 && @defending == 1" }`.
- "1/Round, when targeted by an Opponent suffering from Slowed, Defend without a Counter Action" (Temporal Ascension 5) →
  `{ "target": "defense.freeCounter", "value": "1", "condition": "@vs.cond.slowed >= 1", "limit": "1/Round" }`.
- "No Diminishing Defense from the Foreseen Character's attacks" (Battle Beyond Time 3) → `{ "target": "vs.noDimDefense",
  "value": "1", "condition": "@vs.mark.foreseen == 1" }`.
- "1/Encounter an attack dealing less than 1/4 of your Max LP deals 0 instead" (Immovable Object 3) →
  `{ "target": "vs.ignoreDamageBelow", "value": "ceil(@lifeMax/4)", "limit": "1/Encounter" }`; "Damage lower than Might
  becomes 0" → value `@might`; "no Damage when it is less than 1/2 of your Soak, 2/Round" → value
  `floor(@aptitudes.soak/2)`, `"limit": "2/Round"`.
- "1/Encounter, Damage from an Attacking Maneuver that would drop your LP to 0 leaves you at 1" (Cutting-Edge
  Survivability 5) → `{ "target": "vs.damageMax", "value": "max(0, @life - 1)", "limit": "1/Encounter" }` (its value is
  worked out when you defend, or when the Damage is applied without a defense).
- "On any attack, offer an AoE of your choice" (Foe of the People 3) → `{ "target": "attack.aoe", "value": "any", "mode": "ask" }`.

**Distance.** `@vs.distance` = Squares between your token and the other Character's on the same scene (1 = adjacent; 99
when unknown), with the aggregates `@vsMax.distance` / `@vsMin.distance` (`@vsAny.distance` is always 1). "+1(T) Wound
against an Opponent within your Melee Range" → `{ "target": "vs.wound", "value": "1(T)", "condition": "@vs.distance <= 1" }`;
"Signature Techniques that only target Opponents within your Melee Range" → condition `@signature == 1 &&
@vsMax.distance <= 1` on an `attack.*` piece.

**Rules fix.** The All Out Super Profile wagers every Ki Point up to the Max Capacity: the Ki Wager limit no longer refuses it.

Still `code`: the ToP Extra Dice / Critical Extra Dice "one more time", "+1 Tier of Power (Breakthrough) for that attack",
"does not count toward Diminishing Offense", "paying its Ki Point Cost does not lower Capacity" / "pay it with LP",
"the first use of each Signature Technique" (too few effects each for an engine feature), an Advantage "of up to 10 TP"
the player picks, and everything about Allies' attacks (`allyHit` / `allyDamaged` are package E's events).

## More vocabulary (6G): Allies, the encounter, Counter Actions and Holding Back

The engine now reaches your Allies and reads the other Characters of your Combat Encounter (`rules/allies.mjs`). An
**Ally** is a non-Defeated Character of your token's disposition in your Combat Encounter; an **Opponent** has the other
disposition. Distances are the ones of "Distances on the map" (Squares edge to edge, 1 = adjacent).

### Pieces for your Allies (G1)

- A modifier with target **`ally.<target>`** on YOUR item gives `<target>` to each of your Allies. `<target>` is a
  plain target (`strike`, `dodge`, `combat`, `wound`, `soak`, `dr`, `save.<save>`, `kpCost.attack`, `speed`...): no
  option, `vs.*`, `clash.*`, rule or fx target. No `mode`, `limit`, `cost`, `amount`, `at` or `limitKey`.
- Field **`range`**: only the Allies within that many Squares of you (1 to 12; `"1"` = adjacent Allies). Blank: every
  Ally of the encounter.
- The condition and the value use **your** formula data (your `@T`, your States, your resources...), plus the Ally's:
  `@to.mark.<slug>` (1: you placed that mark on that Ally), `@to.minion`, `@to.distance`, `@to.below` (the Health
  Thresholds that Ally is below). The value is worked out once, with your data, and added to the Ally's sheet.
- Field **`group`**: pieces of one group (and one target) do not stack: an Ally gets only the highest of them, whoever
  gives them ("only the highest such bonus applies" / "does not stack with other Auras").
- Examples: "adjacent Allies gain +1(T) to Combat Rolls" → `{ "target": "ally.combat", "value": "1(T)", "range": "1" }`;
  "while you have 4+ Power, your Studied Allies get +1(T) Combat Rolls" → `{ "target": "ally.combat", "value": "1(T)",
  "condition": "@power >= 4 && @to.mark.studied >= 1" }`; "Allies within 8 Squares +2(T) DR, not stacking" →
  `{ "target": "ally.dr", "value": "2(T)", "range": "8", "group": "guardianaura" }`.
- Not covered: pieces that change an Ally's attack options, its rolls already made, its Maneuvers. A piece for "you AND
  your Allies" is two pieces: `<target>` and `ally.<target>`.

### Trigger targets for Allies (G2)

- **`"target": "allies"`**: the effect goes to every Ally (field `range`: only those within that many Squares).
- **`"target": "team"`**: to you and every Ally (within `range`).
- **`"target": "ally"`**: to the Ally of an ally event (`allyHit`, `allyDamaged`, `allyAttack`, `allyPowerUp`,
  `allySurge`): the Ally who hit, was damaged, attacked, Powered Up or Surged. Only on those events.
- Works with every effect (`buff`, `life`, `ki`, `condition`, `state`, `resource`, `removeCondition`...), automatic or
  as a button (`mode: "ask"`: ONE button that applies it to all of them). A cost or a limit is paid / counted once.
  Durations follow your turn ("until the end of your next turn").
- Example: "1/Round, when an Ally adjacent to you is hit... that Ally gains +2(T) Soak until the end of its next turn"
  → event `allyDamaged`, `target: "ally"`, `condition: "@allyDistance <= 1"`, effect `buff`, resource `soak`.

### More moments (G3)

- **`allyAttack`**: an Ally made an Attacking Maneuver against one of your Opponents (after its Strike Roll, like
  `attackMade`). `other` = the Opponent it targets. Variables: the attack's (`@physical`, `@signature`, `@aoe`...),
  `@allyMinion`, `@allyMark.<slug>`, `@allyDistance`.
- **`allyPowerUp`** / **`allySurge`**: an Ally used the Power Up Maneuver / a Surge (`@powerNow`; `@healingSurge`,
  `@kiSurge`, `@healed`), plus `@allyMinion`, `@allyMark.<slug>`, `@allyDistance`.
- `allyHit` and `allyDamaged` also have `@allyDistance` now (Squares between you and that Ally; 99 when unknown).
- **`counterSpent`**: you spent Counter Actions during a Combat Encounter, by any means (a Defend, an Exploit, an
  Intervene, a cost, an effect...): `@n` (how many), `@countersLeft`. Not the new round's reset.
- **`holdingBackGain`** / **`holdingBackLoss`**: your Holding Back stacks went up / down, on the sheet too: `@n`,
  `@holdingBackLeft`, `@allLost` (1: none are left).

### Holding Back effects (G4)

- Effect **`holdingBack`** (value ±: gain or lose that many stacks) and **`holdingBackSet`** (value: set them), between
  0 and your base Tier of Power. "On entering this Transformation, lose all Holding Back stacks" → event `transform`,
  condition `@this == 1`, effect `holdingBackSet`, value `0`.

### The encounter (G5)

- **`@opponentsCond.<condition>`** / **`@alliesCond.<condition>`**: how many Opponents / Allies of your encounter
  suffer that Combat Condition (any level). **`@opponentsState.<state>`** / **`@alliesState.<state>`**: how many are in
  that State. "+2(T) Wound while any Opponent is Impaired" → condition `@opponentsCond.impaired >= 1`.
- **`resKeep.<resource slug>`** (value `1`): that sheet resource keeps its stacks when the Combat Encounter ends
  (every other resource goes back to 0). For values the rules keep between encounters: a "Skill" or "Strength" track,
  a Karmic Attribute, Weights Doffed...

### States of Transformations (G6)

The system now knows these States (no effect of their own: what they do comes from the Traits that read
`@states.<key>`, so write those pieces from the text that defines the State): `radiantGod`, `blazingGod`, `flow`,
`unitedPower`, `berserk`, `unleashed`, `unlimited`, `exceed`, `overwhelmingFocus`, `combatRealization`,
`desperateHero`, `heroicMindset`, `powerStressed`, `exposed`, `incorporeal`, `egotistical`, `instinctual`, `clockUp`,
`fullPower`, `soulSynergy`, `hollowfied`, `clad`, `farewell`. They work with the `state` / `leaveState` effects (resource
= the State's name: "Radiant God"), `@states.<key>`, `stateEnter` / `stateLeave`, `@stateFx.<key>.<ref>` and the
Innate State Aspect (`aspect.innateState.radiantgod`). The sheet shows them only for the characters whose items name
them. A State's own effects ("while in the Berserk State, +2(T) Wound") are pieces on the item
that defines it, with condition `@states.berserk >= 1`.

### Added after the round-4 review (6H)

- **`@n` of an event** is the event's count (`counterSpent`, `holdingBackGain`, `holdingBackLoss`): `"value": "(2*@n)(bT)"`
  gives 2(bT) per Counter Action spent at once. (A button's `amount` still replaces it with what the player picks.)
- **`holdingBack.ignore`** (value 1): your Holding Back stacks do nothing while the piece holds (Tier of Power,
  penalties, Concealment), but they stay: `@holdingBack` still counts them and `@holdingBackIgnored` is 1. "Ignore your
  Holding Back stacks until you leave this Transformation" → `{ "target": "holdingBack.ignore", "value": "1" }` on the
  Transformation (or with a resource / State condition for "until ...").
- **Durations of whoever gets the effect:** `endOfTheirTurn`, `endOfTheirNextTurn`, `startOfTheirNextTurn` end with the
  turns of the Character the effect goes to ("that Ally gains +2(T) Dodge until the end of its next turn"). The plain
  `endOfTurn` / `endOfNextTurn` / `startOfNextTurn` on someone else end with YOUR turns. A `buff` with no duration
  lasts until the end of the round.
- **Event `allyTargeted`**: an attack targets one of your Allies (`other` = the attacker; the attack's variables,
  `@allyMinion`, `@allyMark.<slug>`, `@allyDistance`). Its effects run when the attack is declared, before the Ally
  defends: a `buff` on `target: "ally"` (dodge, soak, dr...) counts for that attack's defense and Damage.
- **The new States in Innate State:** `aspect.innateState.radiantgod` (and the Transformation Aspect "Innate State
  (Radiant God)") puts you in that State. `egotistical` and `instinctual` have 2 Levels.
- **State boxes are Traits now:** the State boxes of five Transformation pages (Radiant God on Super Saiyan God, Blazing
  God on Spark of Divinity, Flow on Pure Progress, Unlimited on Cultivation of the Self, Exposed on Greatest Warrior? in
  the Universe) are Traits named "<Name> State" (keys `divine-saiyan|Radiant God State|1`...); their pieces work while
  in that State (`@states.<key> >= 1`, `always: true`, added by the importer). Effect references to them:
  `divinesaiyan_radiantgodstate_1`...

## More vocabulary (6I): Hyped and Analyzed, the Original Form, Grades unlocked

- **The Hype Maneuver works by itself now:** using it (the Use button: `maneuverUsed`, `@via_hype`) sets the sheet
  resource **Hyped** (2 in your turn, 1 outside it; it goes down by 1 at the end of each of your turns), so "Hyped until
  the end of your next turn" is `@res.hyped >= 1`, and the Maneuver itself gives its +1(T) + 1/4 Personality Modifier to
  the Combat Rolls while Hyped. A Trait that reads Hyped (`@res.hyped >= 1`) needs nothing more; a Trait that makes you
  Hyped some other way uses `resourceSet` Hyped 2 (in your turn) / 1, or "stop being Hyped" → `resourceSet` Hyped 0.
- **The Analysis Maneuver works by itself now:** using it offers the button that marks the clicking user's target
  `Analyzed+` until the end of your next turn (read with `@vs.mark.analyzed`), and its +1(T) + 1/4 Scholarship Modifier
  `vs.combat` against Analyzed Opponents applies by itself.
- **The Original Form of an Evolved Stage:** an Evolved Stage item has a field `original` (the name of the
  Transformation it evolves; a Unique Evolved Stage has it filled from its page, a Generic one is picked on the item
  sheet). Its Traits read `@OM` (the Original Form's Mastery), `@OFM` (1 when it is Fully Mastered), `@OA` (1 while it is
  active), `@OG` (its Grade), `@OT` (its Tier of Power Requirement); all 0 without one. "While the Original Form is Fully
  Mastered" → `@OFM >= 1`; "for M, use your number of Masteries for the Original Form" → `@OM`. Only on Evolved Stages
  (the validator refuses them elsewhere). For a Unique one you may also keep `@fm.<slug>` of the named form.
- **Grades:** a Graded Transformation now has its starting number of Grades (`maxGrade`, read from "X has N Grades";
  Kaioken 3, Lightspeed Mode 2), and the sheet's Grade stops there. **`gradeMax.<slug of its name>`** (± its highest
  Grade) is how a Trait unlocks more: "You gain access to the 4th and 5th Grades of Kaioken" (a Mastery Trait) →
  `{ "target": "gradeMax.kaioken", "value": "2" }`; "Grade 6 while in the Entrusted State" →
  `{ "target": "gradeMax.kaioken", "value": "1", "condition": "@states.entrusted >= 1" }`. Use `always: true` when the
  piece must count while you are not in that Transformation (the Grade is picked before entering it).

### Added after the round-5 review (6J)

- **`foe.<target>`**: like `ally.<target>` (same fields `range`, `group`, `@to.*`), but given to each of your
  **Opponents** in your encounter: "Opponents within 3 Squares of you reduce their Strike Rolls by 1(T)" →
  `{ "target": "foe.strike", "value": "-1(T)", "range": "3" }`; "your Branded Opponents −2(T) Soak" →
  `{ "target": "foe.soak", "value": "-2(T)", "condition": "@to.mark.branded >= 1" }`. Worked out with YOUR data.
- **Trigger target `"opponents"`**: every Opponent of your encounter (field `range`: within that many Squares), like
  `"allies"`: "all Opponents within 4 Squares must make a Clash / become Shaken / are Analyzed" (one button for all of
  them in `mode: "ask"`). `mark` / `unmark` now accept `allies`, `team`, `opponents` and `ally` too.
- **@O* on Evolved Stages typed as Forms**: a Unique Evolved Stage whose page says "Transformation Type: Form" (Perfected
  Super Saiyan, Power of a God, Ultra Instinct's...) has its Original Form filled too, and the validator lets its Traits
  read `@OM` / `@OFM` / `@OA` / `@OG` / `@OT` (the effect's `evolvedStage` in the dump). Entering such a Stage usually
  replaces its Original Form, so `@OA` is 0 inside it; `@OM` / `@OFM` still work.
- **Graded by a Trait**: a Transformation that gains the Graded Aspect through a Trait (an `aspect.graded` piece, or a
  Permanent "X gains the Graded Aspect") is Graded for the sheet and the Stress Test, so its `gradeMax.<slug>` pieces work.

### Added after the 6J review (6K)

- **One roll / check per Character:** a trigger with `roll` or `check` whose target is `allies`, `team` or `opponents`
  makes it once per Character: a **Clash** (`check: "clash:might vs might"`, an Attribute too: `clash:pe vs pe`) is
  made against EACH of them (you are skipped with `team`: never your own Opponent); a Save / Skill / Steadfast `check`
  is YOUR check, made once per Character. Automatic, the effect goes only to those it holds for (`onCheck: "fail"` →
  the ones who lost); as a button (`mode: "ask"`), one click makes every Clash. Triggers sharing a `rollKey` share one
  Clash per Character. This works on every event, the start / end of turn and round too. "All Opponents within a Large Sphere (4 Squares) make a
  Clash (Morale) against you; those who lose become Shaken" → `{ "event": "...", "target": "opponents", "range": "4",
  "check": "clash:morale vs morale", "effect": "condition", "resource": "shaken", ... }`. `@vs.*` is the one rolled
  against. (The validator now accepts a Clash on these targets on any event.)
- **Use buttons reach several Characters:** a `use` trigger (the sheet's trait buttons) with target `allies`, `team` or
  `opponents` applies to all of them (with its own roll / check each).
- **`@to.cond.<condition>` / `@to.states.<state>`** in `ally.*` / `foe.*` pieces: the Conditions and States of the
  Character the piece goes to (as its sheet holds them): "Impaired Opponents in your Shadow Zone −1(T) Dodge" →
  `{ "target": "foe.dodge", "value": "-1(T)", "range": "5", "condition": "@to.cond.impaired >= 1" }`.

## More vocabulary (6L): the rolls of the others, Adversary Actions

- **Events `opponentRolled` / `allyRolled`:** an Opponent / an Ally of your Combat Encounter made a roll (any roll the
  system makes for it: Combat Rolls, Saves, Skill Checks, Steadfast, Clashes...). `other` = who rolled. Variables: the
  roll's (as on `rolled`: `@natural`, `@botch`, `@crit`, `@success`, `@total`, `@kind_<kind>`, `@combatRoll`...), plus
  `@againstMe` (1: the roll was made against you — you are its other Character, e.g. the Strike of an attack on you or
  your Clash's other side) and `@rollerDistance` (Squares between you; 99 when unknown). They react AFTER the roll (they
  cannot change it): "If an Opponent Botches a Combat Roll against you, gain 1 Power" → `{ "event": "opponentRolled",
  "condition": "@botch == 1 && @combatRoll == 1 && @againstMe == 1", "effect": "power", "value": "1" }`; "when an
  adjacent Ally fails a Steadfast Check, ..." → `allyRolled`, `@kind_steadfast == 1 && @success == 0 && @rollerDistance <= 1`.
  `target: "other"` is who rolled.
- **Cost `aa:<n>` (Adversary Actions):** only an Adversary with One-Man Army has them (paid from its Counter Actions);
  anyone else cannot pay it. "an Adversary with One-Man Army may spend 2 Adversary Actions to..." → `cost: "aa:2"`.
- **Modes (Mode Change) and similar "you are in one of these" picks** need no new vocabulary: keep the current one in a
  sheet resource set by `use` buttons (`resourceSet` "Battle Mode" 1 and the others 0, in a `group`), and gate the
  pieces with `@res.battlemode >= 1`.

## More vocabulary (6M): Stances, picks, the Order Maneuver

- **The Stance Maneuver works by itself now:** using it offers a button that asks which Stance to be in (or none). The
  Stance is a sheet resource named "<Name> Stance" (Flame Stance, Wind Stance, Wave Stance, Stone Stance, and every
  other "... Stance" the character's Traits read: Counter Stance, Crane Stance, Dragon Stance, Void Stance, Focused
  Stance...): the picked one becomes 1, every other one 0 (one Stance at a time). The four Stances of the Maneuver give
  their own bonuses. So a Trait that works "while in the Dragon Stance" reads `@res.dragonstance >= 1` and needs nothing
  more; "add the Void Stance to your Stance Maneuver options" is covered as soon as some piece reads `@res.voidstance`.
  "Leaving a Stance" fires `resourceSpend` of that resource.
- **Effect `resourcePick`** (mode `ask`, target self): `resource` = "A|B|C" (names) and / or "* <suffix>" (every
  resource with that suffix the sheet has or the Traits read); the player picks one (or none): it becomes 1, the others
  0. For any "you are in one of these" choice (Modes, Forms of a Style...).
- **The Order Maneuver (Tactician) is in the compendium now:** `grant maneuver: Order Maneuver` works, and its use fires
  `maneuverUsed` with `@via_order`. Its own effect (the Ally agreeing to the declared Maneuver at the start of its turn)
  stays with the players; an Order can mark the Ally it targets (`mark` "Ordered+", target `targeted`, duration
  `startOfNextTurn`), so "an Ally targeted by your Order" → `@allyMark.ordered` on the ally events.
- **Effect `attackWound`** (value: a Wound bonus): added to the Wound Roll of the attack of the event, if its Wound Roll
  is not made yet: your own attack on `attackMade`, an Ally's on `allyAttack` (United Attack: "you may spend 1 Action and
  the KP to add 1/2 of your Force Modifier to their Wound Roll" → `{ "event": "allyAttack", "condition":
  "@allyDistance <= 1 && @physical + @energy >= 1", "effect": "attackWound", "value": "floor(@fo/2)", "mode": "ask",
  "cost": "actions:1; ki:@kp" }` — note `@kp` there is the Ally's attack KP from the event), the attack against you on
  `targeted`, the one against your Ally on `allyTargeted` (a negative value lowers it). Only those four events.

## More vocabulary (6N): the cost of using Maneuvers and Unique Abilities

The world setting "Custo ao usar manobras e Unique Abilities" (`useCosts`) decides what the Use button of a Special
Maneuver / Unique Ability does with its KP Cost and Action Cost: nothing (the default), show it on the card, or pay it
(refusing the use when it cannot be paid). God and Villainous Maneuvers keep their own payment. The cost the system works
out: the item's KP Cost when it is a number formula ("6(bT)", "2(T)"; "Varies" costs nothing here) ± `kpCost.ua` (every
Unique Ability) and `kpCost.ua.<abilityType>` (technical, spiritual, magical...) or ± `kpCost.maneuver` (Maneuvers),
± **`kpCost.use.<slug>`** (that item, by its name without "Maneuver": `kpCost.use.telekinesis`, `kpCost.use.movement`),
and no KP at all with **`kpCost.useFree.<slug>`** (value 1); never below 0. So "Telekinesis costs 1(T) KP less" →
`{ "target": "kpCost.use.telekinesis", "value": "-1(T)" }`; "Unique Abilities with Time in their name cost 1(T) fewer
KP" → one piece per such Unique Ability, or `kpCost.ua.time` when they are of that type. A rule that changes the cost of
a Maneuver the system pays elsewhere (an attack, a Surge, Energy Charge) keeps its own targets (`kpCost.attack`,
`charge.kp`...). Whether the setting is on is the GM's choice: the pieces are right either way (shown or paid).

## More vocabulary (6O): the Movement Maneuver, the Divine Ki of God Maneuvers

- **The Movement Maneuver works by itself now:** its Use button (or a `maneuver` effect with resource `movement`) asks
  Normal Speed or Boosted Speed (3(T) KP) and Rapid Movement (+2(T) KP: +1(T) Strike Rolls until the end of the turn),
  spends its Action (none Out-of-Sequence) and the KP, and fires `maneuverUsed` with `@via_movement`, **`@boosted`** and
  **`@rapid`**. The token is moved by hand. Targets: **`kpCost.boost`** (± KP of the Boosted Speed: "Boosted Speed
  through the Movement Maneuver costs 2(T) fewer KP" → `{ "target": "kpCost.boost", "value": "-2(T)" }`),
  **`kpCost.boostFree`** (1: none), **`kpCost.rapid`** / **`kpCost.rapidFree`** (the same for Rapid Movement). "When you
  move at Boosted Speed, ..." → `maneuverUsed` with `@via_movement == 1 && @boosted == 1`.
- **God Maneuvers' Divine Ki:** **`dkpCost.god`** (± DKP of every God Maneuver the system pays), **`dkpCost.use.<slug>`**
  (± that one; slug = its name without "Maneuver"), and `kpCost.useFree.<slug>` makes it free. (God Maneuvers that are
  attacks pay through the attack dialog: their cost follows `kpCost.attack` and the attack's options.)

## More vocabulary (6P): token movement in combat

- **`moved`** (event, on the Character whose token moved on the map during a started Combat Encounter, by whoever moved
  it): **`@squares`** (Squares between the old and the new position), **`@leftMelee`** (Opponents whose Melee Range it
  left), **`@enteredMelee`** (whose Melee Range it entered), **`@endOpponentsAdjacent`** / **`@endAlliesAdjacent`**
  (adjacent at the end). Melee Range = 1 + the Size's reach. "When you move into the Melee Range of an Opponent, ..."
  → `moved` with `@enteredMelee >= 1`; "If you end your movement adjacent to an Opponent, ..." → `moved` with
  `@endOpponentsAdjacent >= 1`; "When you move 4 or more Squares, ..." → `moved` with `@squares >= 4`. (It is a token
  move, not the Movement Maneuver: use `maneuverUsed` with `@via_movement` for the Maneuver itself.)
- **`opponentLeftMelee`** (event, on each Opponent whose Melee Range was left; `other` = the one that moved, so
  `target: "other"` works): the moment that provokes the Exploit Maneuver. "When an Opponent leaves your Melee Range,
  you may ..." → `opponentLeftMelee`. Unless the mover has **`flag.noProvokeExploit`** (1: "your movement doesn't
  provoke the Exploit Maneuver"), that Opponent also gets a card with an **Exploit** button (world setting "Exploit
  reminder on movement"), which targets the mover and opens the attack dialog made through Exploit.
- **`opponentEnteredMelee`** (on each Opponent whose Melee Range the mover entered) and **`endedAdjacent`** (on each
  Character, Ally or Opponent, the mover ends adjacent to; **`@isOpponent`** / **`@isAlly`**): `other` = the one that
  moved. "If an Opponent enters your Melee Range, this triggers your Exploit Maneuver" → `opponentEnteredMelee`, effect
  `maneuver` resource `exploit`, mode `ask`, cost `counters:1`; "If a Character ends their movement adjacent to you" →
  `endedAdjacent` (with `@isOpponent == 1` for an Opponent only).
- **An attack Maneuver of an event's button targets the event's other Character:** `maneuver` effects with `exploit`,
  `feint`, `basicAttack`, `signature` or `item:<Name>` target that token before the attack dialog opens. "This triggers
  your Exploit Maneuver" = such a button with cost `counters:1` (the Exploit spends a Counter Action; an Out-of-Sequence
  attack of the button spends none by itself).

## More vocabulary (6Q): Mastery requirements, grants that wait for Masteries, the Forms of a Defeat, halvings

- **`masteryCap.<slug>`** (slug = the Transformation's name in lowercase letters and digits): the most Masteries that
  Transformation may reach now; the lowest piece wins and **0 counts** (no Mastery at all). The sheet's Mastery button
  stops there (a Mastery already gained stays). "You can't gain the 3rd Mastery of Pure Form unless your base Tier of
  Power is 4+" → on that Form `{ "target": "masteryCap.pureform", "value": "2", "condition": "@bT < 4" }` (with
  `always: true` when the piece must work while you are not in it — Mastery is gained outside of it); "you can only
  gain Mastery of this Form after Fully Mastering X" → `masteryCap.<this>` = 0 with a condition on `@fm.<x>`.
- **Grants that wait for Masteries:** `+mastery:<n>` after a granted name (or a `pick:`) — the granted item works only
  once the granting item has n Masteries: a granted Transformation cannot be entered before, a granted Maneuver / Unique
  Ability / Signature cannot be used (and its pieces do not work). "Once you Master this Form, gain access to the X
  Evolved Stage" → `grant transformation: X +mastery:1`; "after 2 Masteries, choose a God Maneuver" →
  `grant pick: 1 maneuver from God Maneuvers +mastery:2`. It combines with `+active`.
- **The Forms of a Defeat run their Defeat triggers now:** the `threshold` event with `@defeated == 1` collects the
  triggers of the Transformations the Defeat just left (and `@active.<slug>` is still 1 for them in their conditions).
  "[Triggered/Defeated] while in this Form, ..." → on that Form, event `threshold`, condition `@defeated == 1`.
  (The Form is still left: an effect that keeps you in it, or puts you back in, stays `code`.)
- **`collision.ignore`** (1: you take no Collision Damage at all), **`collision.halve`** (1: the Collision Damage you take is halved — once, however many pieces; other halvings, like
  Bouncy terrain, still stack), **`draining.halve`** (1: the Draining Aspect takes half the Ki Points),
  **`draining.life`** (1: Draining takes Life Points instead of Ki Points, and no Divine Ki).

## More vocabulary (6R): an Advantage of your choice, choices an entry declares

- **`attack.advantagePick`** (an attack option; value = the most TP the Advantage's first rank may cost, a number): the
  attack dialog shows a select "Advantage of your choice (up to N TP)"; the one picked joins that attack as if
  `attack.advantage.<key>` = 1 (F2: refused when the technique cannot take it), with this piece's condition, `limit`
  and `cost` (paid only when one is picked). "Once per Round, you may add an Advantage of up to 10 TP to a Physical
  Attack" → `{ "target": "attack.advantagePick", "value": "10", "condition": "@physical == 1", "limit":
  "1/Round" }` (no `mode: "ask"` needed: the select is the choice; a "you may" with an amount or a group still works
  as usual for the other pieces).
- **An entry's own choice** (Transformations only — Awakenings, Forms, Enhancements; not Racial Traits): when the text asks
  the player to choose something once ("increase an Attribute of your choice by 1", "choose an Element: Fire, Ice...",
  "choose Armored or Perfect Ki Control") and the item has no choice for it yet, add to the entry
  `"choice": { "options": ["Agility", "Force", "Tenacity"], "pick": 1 }` and put `"option": "<one of them>"` on each
  piece of that option (as in More vocabulary (3)): the item gets the choice (asked when it is added, changeable on the
  sheet) and only the picked option's pieces work. One piece per option: "+1 to the bonus of the Attribute you chose" →
  seven pieces `mod.ag` ... `mod.pe` with `option` "Agility" ... "Personality". `@picked.<option slug>` sees it too
  (other effects that read the choice). The validator checks that every `option` is listed.
- **The Condition Advantage works by itself now:** a technique with it (its choice typed on the sheet: Guard Down,
  Drained, Shaken or Poisoned) puts that Combat Condition on an Opponent it damages (Guard Down / Drained until the start
  of the attacker's next turn, Shaken / Poisoned until the end of the target's next turn), or, when the target already
  suffers from it, adds +3(T) to the Wound against it. An effect that gives the Condition Advantage to an attack →
  `attack.advantage.condition` works only when the technique has its choice; for "apply the Condition Advantage with
  the <X> Combat Condition" use the condition effect on `attackHit` (with `@damage >= 1`) instead.

## More vocabulary (6S): what provokes the Exploit Maneuver

- **The system now provokes the Exploit by itself** (rules/exploit.mjs), as the Standard Maneuvers' "Exploitable" says:
  Combat Recovery → every Opponent not at Long Range; Energy Charge, Empower, Arrogant Declaration, Terrain Lift → the
  adjacent Opponents; Ride → the Opponents whose Melee Range you are in; leaving an Opponent's Melee Range on the map →
  that Opponent; a lost Grapple Check → its target. Each of them gets the event **`exploitTriggered`** (other = the one
  that provoked it; **`@by_<slug>`**: `@by_combatrecovery`, `@by_energycharge`, `@by_empower`, `@by_movement`,
  `@by_grapple`, `@by_ride`, `@by_arrogantdeclaration`, `@by_terrainlift`; `@vs.*` works), and the one who provoked it
  gets **`provokedExploit`** (`@n` Opponents, `@by_<slug>`). The ones with a Counter Action get a card with an Exploit
  button each (it targets the provoker and opens the attack dialog made through Exploit).
- **Not provoking it:** **`flag.noProvokeExploit`** (1: none of your Maneuvers nor your movement provoke it) and
  **`noProvoke.<slug>`** (1: that one provokes none: "Your use of Combat Recovery does not trigger the Exploit Maneuver"
  → `{ "target": "noProvoke.combatrecovery", "value": "1" }`; with a condition when the text has one; "this use of
  Combat Recovery does not trigger..." on an Out-of-Sequence Combat Recovery an effect gives → `with` cannot carry it:
  a resource the button sets and the piece reads, or keep it `code`). Then no `exploitTriggered` fires at all.
- **"When an Opponent triggers your Exploit, you may instead ..."** → `exploitTriggered` (mode ask; cost `counters:1`
  when it replaces the Exploit). "Opponents' Combat Recovery triggers your Exploit regardless of range" stays `code`
  (the range is the rule's). The Opponents' movement events (`opponentLeftMelee`, `opponentEnteredMelee`,
  `endedAdjacent`) now carry **`@provokes`** (0 when the mover provokes no Exploit) and `@vs.*`: an Exploit button
  they give gets the condition `@provokes == 1`. `moved` has as its other Character the first Opponent adjacent at the
  end (an attack button "after you end your movement adjacent to an Opponent" targets it).
- **Buttons now target the event's other Character:** a `maneuver` effect (exploit, basicAttack, signature, feint,
  item:) of any event with an other Character (allyDamaged, targeted, exploitTriggered, opponentEnteredMelee...) targets
  that Character's token before the attack dialog opens.

## More vocabulary (6T): the Branded Combat Condition

- **`branded`** is a Combat Condition of the system now (key `branded`, 1 level): −1(bT) to the Branded character's
  Combat Rolls and Soak, done by the system. Every Condition vocabulary works with it: the `condition` effect (resource
  `branded`, with the duration the text gives), `removeCondition`, `immune.branded`, `@cond.branded`,
  `@vs.cond.branded`, `@opponentsCond.branded`, `@to.cond.branded`. Effects that used a mark "Branded+" to stand for it
  (the Demon God Transformations and the ones that read it) should use the Condition instead: inflict it with the
  `condition` effect on the other Character and read it with `@vs.cond.branded` / `@cond.branded`. It counts as a
  Combat Condition for everything that counts them (`@vs.anyCond`...). The sheet shows it only when an item names it or
  it is on.

## More vocabulary (6U): Compelled toward whom

- The Character who inflicts **Compelled** with a trigger effect (`condition` resource `compelled` on the other
  Character) becomes the Compelled one's target. Pair variables: **`@vs.compelledByMe`** (1: the other Character is
  Compelled toward you) and **`@vs.compelledToThem`** (1: you are Compelled toward the other Character). "+2(T) Strike
  against an Opponent Compelled toward you" → `vs.strike` with `@vs.compelledByMe == 1`; "while you are Compelled, ...
  against your Compelled target" → `@vs.compelledToThem == 1`. A Compelled actor's attack that does not include its
  target gets a note on its card. Compelled put on by hand has no target (the GM's).

## More vocabulary (6V): safe Life Point losses

- **Cost `safelife:<n>`** (also `safelp:`): Life Points paid like `life:` but "safely": the Health Thresholds this loss
  crosses pass their Steadfast Checks automatically and give no Reduced Momentum. "Spend 2(bT) LP (this loss does not
  cause Reduced Momentum and you automatically pass the Steadfast Checks)" → `"cost": "safelife:2(bT)"`. Use plain `life:`
  when the text says nothing of the sort.
- **The `life` effect with resource `"safe"`** (a negative value): the same for a loss the effect causes ("lose 1/4 of your
  LP; this does not cause Reduced Momentum and you pass the Steadfast Checks" → effect `life`, value `-floor(@lifeMax/4)`,
  resource `safe`). A `life` effect's loss is not self-inflicted by itself (no Reduced Momentum, the Steadfast is
  rolled); `safe` makes its Steadfast pass.
- **`threshold` event:** `@safeLoss` (1 when the loss that crossed the Thresholds was a safe one).
- Only "no Reduced Momentum" without the Steadfast part → `flag.noReducedMomentum` while it applies; only "pass the
  Steadfast" for all losses → `flag.autoPassSteadfast`.

## More vocabulary (6W): Clashes through a Unique Ability, Pressure Checks

- **A Clash made through an item** (the Clash button of its card, or a `check: "clash:..."` of a trigger of that item)
  has `@via_<item slug>` and, by the item's kind, **`@via_uniqueability`** (a Unique Ability) or
  **`@via_specialmaneuver`** (a Special Maneuver). "+1(T) to Clashes made through the effects of a Unique Ability" →
  `{ "target": "clash.all", "value": "1(T)", "condition": "@via_uniqueability == 1" }`; on `clashWon` / `clashLost`
  the same variables.
- **Pressure Checks** (the Demons' 1d10 checks: a trigger `roll: "1d10"` with a `rollKey` and a condition on `@roll`):
  modifier targets **`pressure`** (± the Dice Score of your Pressure Checks) and **`pressure.auto`** (1: they succeed),
  read as **`@pressureBonus`** and **`@pressureAuto`**. Every Pressure Check trigger must read them: success
  `(@roll + @pressureBonus >= 4) || @pressureAuto == 1`, failure `(@roll + @pressureBonus <= 3) && @pressureAuto == 0`
  (with the check's own threshold). "+1 to the Dice Score of your Pressure Checks while ..." → `pressure` with that
  condition; "your Pressure Checks automatically succeed while you have 2+ Demonic Fatigue" → `pressure.auto` with
  `@res.demonicfatigue >= 2`. Rolling twice and keeping the higher, or turning a failure into a success after the roll,
  stay `code`.

## More vocabulary (6X): the Legend Realized through an effect

- **Effect `legend`** (target self; resource = a Form's name, or empty for your current Form): that Form's Legend
  Realized now, outside of the Transformation Maneuver (only in a started Combat Encounter, once per encounter per
  Form, not again for a Form of the same Form Type and ToP Requirement — the usual rule; its Life/Ki, `legend.*`
  pieces and the `legendRealized` event as usual, with **`@legendOutside`** = 1). "You may apply this Form's Legend
  Realized when you ... (outside the Transformation Maneuver)" → a button (`mode: "ask"`) with effect `legend` on that
  event. A Legend Realized that ignores the once-per-encounter rule, or one that heals differently, stays `code`.

### Fixed after the 6R review

- `attack.advantagePick`: the limit counts once whatever Advantage is picked (no `limitKey` needed), and when several pick
  pieces apply only the first one gives the Advantage (rank 1, its limit and cost). An Advantage (or Disadvantage) an
  effect adds is now **refused when the technique cannot take it** (its requirement, its ranks): the attack card says so.
- Two choices on one Trait no longer switch each other's pieces off (each choice switches only its own options).
- A Trait picked out of a group choice: its own option pieces follow their own choice (they no longer all work once the
  Trait is picked).
- An entry's own choice (`choice`) does not make its picks Favored Elements by itself (add `favoredElement` pieces per
  option when the text says the chosen Element is a Favored one).

## More vocabulary (6Y): the Maneuvers the others use, Combat Recovery, provoking the Exploit, rolled reminders

- **`opponentManeuver`** / **`allyManeuver`** (events): an Opponent / an Ally of your encounter used a Maneuver
  (other = it): **`@by_<slug>`** (`@by_powerup`, `@by_energycharge`, `@by_healingsurge`, `@by_kisurge`,
  `@by_transformation`, `@by_combatrecovery`, and every Maneuver / Unique Ability used through its Use button:
  `@by_<its name slug>`, e.g. `@by_movement`, `@by_empower`, `@by_hype`), **`@distance`** (Squares to it, 99 unknown),
  `@oos`, `@ua`, `@special`, `@god`, `@villainous`, `@standard`, `@instant`, `@counterManeuver`, `@modifierManeuver`, and
  `@vs.*`. "If a Locked Opponent within your Melee Range uses any Maneuver (except an Out-of-Sequence one), this triggers
  your Exploit" → `opponentManeuver`, condition `@vs.mark.locked == 1 && @distance <= 1 && @oos == 0`, effect `maneuver`
  `exploit`, mode ask, cost `counters:1`. (Attacks are `targeted` / `allyAttack`; this event is for the other
  Maneuvers.)
- **`combatRecovery`** (event): you used Combat Recovery (`@actions`, `@condition` 1 for a Condition Recovery).
- **Effect `provoke`** (resource `adjacent` (default) | `melee` | `notLong`): the Exploit of the Opponents at that range
  (`exploitTriggered` with `@by_effect`, the card). "This triggers the Exploit Maneuver of adjacent Opponents" → effect
  `provoke`.
- **A `message` trigger with a `check` or a `roll` and `mode: "ask"`** is now a button: it rolls / makes the check when
  clicked and shows its text when the trigger's condition / `onCheck` lets it through ("you may make a Clash; if you
  win, ..." with a part the system cannot apply).
- **`@vs.noProvoke`** (1 when the other Character has `flag.noProvokeExploit`): an Exploit button an Opponent's Trait
  gives on `targeted` / `allyTargeted` / `opponentManeuver`... adds `@vs.noProvoke == 0` to its condition.
- **`@vs.*` on a `targeted` button of any event** (powerUp, startOfTurn...): allowed when the trigger has a `roll` or a
  `check` (mode ask) — its condition is then tested when the button is clicked, against the clicking user's target. A
  `targeted` button with neither keeps testing its condition when the event happens (no `@vs` there).
