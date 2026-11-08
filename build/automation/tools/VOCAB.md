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

## More vocabulary (6Z): the Pressure Check as a check, an extra Legend Realized

- **`check: "pressure"`** (or `"pressure:+1"`): a Pressure Check — 1d10 + `@pressureBonus` (the `pressure` pieces), 4+ a
  success, a success by itself with `pressure.auto`. It REPLACES the 6W way (`roll: "1d10"` with `@roll + @pressureBonus`): a trigger "make a Pressure Check; on a success X, on a failure Y" → the X triggers
  with `check: "pressure"`, `onCheck: "success"` and the Y ones with `onCheck: "fail"`, sharing a `rollKey` so one
  check decides both (mode as the text says). Being a roll of the system (kind `pressure`), it gets the **roll
  reactions** (5C: event `roll` with `@kind_pressure == 1`: `reroll`, `rollBonus`, `succeed`, `natural`...): "reroll a
  failed Pressure Check" / "you may treat a failed Pressure Check as a success (spend X)" / "+1 to a Pressure Check
  by paying LP" are `roll` reactions now.
- **Event `pressureCheck`** (after any Pressure Check): `@success`, `@failed`, `@total`, `@natural`, `@auto`. "After a
  successful Pressure Check, ..." → `pressureCheck` with `@success == 1`; counting the successes of a Round → a
  resource the trigger raises.
- **`legend` with `+extra`** (resource `"+extra"` for your current Form, or `"<Form> +extra"`): a Legend Realized on
  top of the once-per-encounter one (neither the per-Form nor the same-Type limit), when the text gives an additional
  application. `legendRealized` has `@legendExtra`.
- **A shared `limitKey` counts once per firing:** the automatic pieces of one event that share a `limitKey` now spend
  ONE use together (the first one counts it, the others of that firing follow), so "1/Round: on a success X and Y" can be
  automatic pieces with one `limitKey`. Turn and round triggers (`startOfTurn`...) too, and their `message` with a
  `check` / `roll` in mode ask is a button there as well.

## More vocabulary (6AA): after the Wound Roll, the Stress Test per Grade

- **Event `woundRolled`** (your Wound Roll was made and stored; other = its first target): **`@crit`** (a Critical
  Result), **`@superCrit`** (a Super Critical: Natural Result 10), `@natural`, `@total`, `@critStrike` and the attack's
  variables (`@signature`, `@physical`...). Its effects change THAT Wound Roll before its Damage is applied (refused
  once any of it is applied):
  - **`woundAdd`**: + value to it; with resource **`"charge"`**, the dice of value more Energy Charges (rolled now, the
    attack's Charge Dice Category) — "If you score a Super Critical on the Wound Roll, apply an additional Energy Charge
    to that Attacking Maneuver" → `woundRolled`, condition `@superCrit == 1`, effect `woundAdd`, resource `charge`,
    value `1` (mode ask for "you may").
  - **`woundCategory`**: + value Damage Category (to 3 at most); resource **`"lethal"`**: Lethal (Category 3, not
    reducible) — "you may set the Damage Category to Lethal" → `woundCategory` resource `lethal`.
  - "Apply your Critical Result Extra Dice an additional time" → `woundAdd` with resource **`"crit"`** (value: how many
    more times, 1 by default): the attacker's Critical Extra Dice of that Wound Roll rolled again and added.
- **`stressGradeStep.<slug>`** (a Graded Transformation): ± the Stress Test Requirement per Grade above the first
  (2 by default): "+3 per Grade instead of +2" → `{ "target": "stressGradeStep.crusherform", "value": "1" }` (only when
  the Transformation has no Grade table of its own; a table entry wins).

## More vocabulary (6BB): the States and Special States do more by themselves

The system now applies these State effects (dbu-rpg.com/states, /special-states) — an effect that only restates them is
`covered`; "ignoreState.<state>.<n>" still switches each off:
- Raging, Apoplectic (1): a Basic Attack button (Out-of-Sequence, 1/Round) when you enter it and at the start of your turn.
- Mindful, Zen (1): Ki Points 2L(bT) when you spend a Counter Action; Tranquil (1): a Counter Action when you enter it.
- Undying (1): leaving it with 0 or negative Life Points Defeats you; (2): entering it when you would be Defeated sets
  your Life Points to 1.
- Surging (3): an attack that does not include your Focus gets a note on its card.
- Determined (3): at the start of your turn you leave it (and a reminder to skip that turn).
- Entrusted (3): 1 Action when you enter it. (Its 4th effect — Full Wager / All-or-Nothing Basic Attack — stays with
  the GM.)
- Liquid (2) cannot be Pinned, (4) its movement provokes no Exploit (`noProvoke.movement`), (5) no Attacking Maneuver
  nor Unique Ability (refused).
- Multiple Arms (2) one more Counter Action each Combat Round and when you enter it, (4) a reroll button for the Strike
  of a Combination attack (1/Round), (6) Diminishing Offense from your 5th attack.
- Spectator (1) a +1(bT) Combat Rolls button for your targeted Ally (entering it and at the start of your turn), (2) a
  button to leave it, (3) a button that rolls 2d10(bT) Life and Ki Points and spends your Actions, (4) Power Up,
  Transformation, Energy Charge and attacks refused (a warning for Maneuvers / Unique Abilities that target another
  Character), (5) no other start-of-turn / start-of-round effect runs.
- Drunk, Plastered (1): every Combat Condition but Pinned, Suffocating, Stress Exhaustion and Transfigured is ignored.
- Feral, Wild (1): no Signature Technique nor Unique Ability (refused); Unhinged (1): a Critical Result on the Strike or
  the Wound Roll raises the attack's Damage Category by 1.

## More vocabulary (6RA): racial package — Allies' events, until defended / next roll, exclusive options, technique uses

- Events `allyExploitTriggered` (an Ally's Exploit was provoked; other = the provoker; `@by_<maneuver>`) and `allyInflict`
  (an Ally gave an Opponent a Combat Condition through an effect or a Signature Condition; other = that Opponent;
  `@cond_<key>`, `@level`). Both see `@allyMinion`, `@allyDistance`, `@allyBelow`, `@allyMark.<mark>` and `@vs.`.
- Durations `untilDefended` (ends after the holder's next defense roll against an attack — "Guard Down against that
  attack") and `nextRoll` (buff only: ends after the holder's next roll of that kind — strike/dodge/wound/save/skill;
  "+2 to your next Strike Roll").
- Option piece field `exclusive: "<set>"` (attack.* pieces with mode ask): the boxes of one set cannot be ticked
  together in the attack dialog ("either +2 Strike or +2 Wound, not both").
- Technique uses this encounter before this attack: `@sigUsedEnc`, `@sigUsedRound` (this Signature), `@sigsUsedRound`
  (Signatures used this Round), `@profileUsedRound.<profile>`, `@profileUsedEnc.<profile>` — in attack options, wound
  options, attackMade / attackHit triggers. ("The second time you use the same Signature in a Round" =
  `@sigUsedRound >= 1`.)
- Target `lifeOverMax`: Life Points can be regained up to the maximum + this (every regain clamps at `life.cap`).
- `@opponentsCondByMe`: Opponents in the encounter suffering a Combat Condition you inflicted; `@vs.condByMe`: how many
  of the other Character's Conditions you inflicted; `@vs.markOthers.<mark>`: how many OTHER encounter Characters placed
  that mark on it.

## More vocabulary (6LT): Legendary Traits at all times, the Forms a Defeat left

- A Legendary Trait is possessed at all times once the character has its Legendary Form (the rule): its pieces are
  `always` and apply / fire whether or not that Form is active. Never condition them on being in that Form
  (`@this`, `@active.<self>`, `@inForm`) unless the text itself says "while in this Transformation".
- `@legendaryForm` / `@alternateForm`: how many active Forms are Legendary / Alternate Forms.
- Event `transform`: `@enteredAlternate`, `@enteredLegendary` (what was entered), `@enteredAspects.<key>` (the Aspects of
  the Transformation just entered — "upon entering a Transformation with the Super Saiyan Form Aspect" =
  `@enteredAspects.superSaiyanForm >= 1`; `@aspects.` reads every active one).
- Roll reactions of a Stress Test (`@kind_stress`): `@stressAspects.<key>` (the Aspects of the Transformations tested) and
  `@entering` (1: the Stress Test to enter one; 0: to remain).
- `legend.bonus` pieces: `@legendAspects.<key>` (the Aspects of the Form whose Legend Realized it is).
- A Defeat's own `threshold` triggers run for the Forms it left (`@defeated == 1`), and so do the `fxUsed` triggers of
  their effects. A [Triggered/Defeated] effect happens when you would have been Defeated: when the Defeat's triggers (a
  button of theirs too) bring your Life Points above 0, the Forms and Enhancements that Defeat ended become active again.
- Effect `steadfastPass` (value: how many; 0 = all): your failed Steadfast Checks of the Health Thresholds become
  successes.

## More vocabulary (6RB): United Attack, Intervene and Reflect run from the attack card

The attack card now runs these rules Maneuvers (combat/team-maneuvers.mjs), so an effect that only restates them is
`covered`:
- United Attack (card button): an Ally adjacent to the attacker pays 1 Action and the KP of the same Profile (+ its Ki
  Wager, up to 1/4 Max Capacity): the attack's Wound gets 1/2 Force (Magic for a Magic Attack) + the Wager; 1/Round each.
- Intervene (a hit target's row): an Ally of it, not targeted by the attack and not at Long Range from it, pays 1
  Counter Action + 0 / 2(bT) / 8(bT) KP: Defense Wall (takes its place; the Damage beyond their LP goes to the Ally,
  reduced by its Soak / DR), Deflect (Might Clash −1(T) per Energy Charge / Power Shot rank: won = every target missed,
  lost = takes its place at +1 Damage Category), Distant Deflect (the same Clash; lost = nothing).
- Reflect (card button): who parried an Energy / Magic attack without AoE, or deflected it, pays 5(T) KP: Strike against
  the Opponent they target, a new card whose Wound Roll the original attacker makes.
- Each fires `maneuverUsed` with `@via_unitedattack` / `@via_intervene` / `@via_reflect`; costs: `kpCost.use.<slug>` /
  `kpCost.useFree.<slug>` (slugs unitedattack, intervene, reflect).

Pieces that change them (modifiers, value 1 unless said; `limit` / `limitKey` / `condition` allowed, no `at`):
- `intervene.noCounter` — you Intervene without a Counter Action. Scope: `@vs.` = the Ally you protect, `@wall` /
  `@deflect` / `@distant` (the option), the attack's variables (`@physical`, `@energy`, `@signature`...).
- `intervene.noCounterFor` — on the protected Character: who Intervenes for you spends no Counter Action (`@vs.` = that
  Character). ("Your Bonded Ally may Intervene without a Counter Action" = this piece with `@vs.mark.<bond> >= 1`.)
- `united.noAction` — you join a United Attack without an Action (`@vs.` = the attacker, `@unitedCount` = who joined
  before you, the attack's variables); `unitedBy.noAction` — on the attacker: who joins your attack spends no Action.
- `united.wound` (value: Wound) — + Wound to the attack you join; `unitedBy.charges` (value: Energy Charges) — on the
  attacker: + Energy Charges when someone joins your attack (cap with `@unitedCount`).
- `reflect.strike` (value: Strike) — + Strike Roll of your Reflect (`@vs.` = its new target).

## More vocabulary (6RC): pieces read with the Max LP, Life Points below 0, @isMinion

- `lifeOverMax` and the new `lifeFloor` are worked out after the Max LP, so their value may read `@lifeMax`
  ("half of your Maximum Life Points above the maximum" = `lifeOverMax` `floor(@lifeMax/2)`).
- `lifeFloor` (value N): Damage may take your Life Points down to −N and the Defeat comes on reaching −N instead of 0
  (`@lifeFloor` reads it).
- `@isMinion`: 1 when the character itself is a Minion ("As a Minion, instead ...").

## More vocabulary (6RD): small pieces for the main races

- `@kiMultiplier` (a Form gives the Ki Multiplier now), `@greaterDiceOn` (the Greater Dice apply to your rolls now),
  `@vs.dimDefense` (the other Character's Diminishing Defense penalty now).
- A `power` trigger with a `duration` keeps the Power it gives that long (instead of to the end of your next turn).
- Duration `untilDefendedRound`: the holder's next defense or the end of the Round, whichever comes first.
- Target `clash.autoLose` (value 1; condition with `@initiated`, `@via_<x>`): the other side wins the Clash without rolling.
- Target `apparel.maxLayers` (value N): the sheet shows an error when more Apparel layers are worn.
- `flag.lifeOneAtFloor`: below 0 LP, an effect that would leave 1 LP leaves 1 above −`lifeFloor`.
- Effects `equip` / `unequip` (resource: the item's name): equip / unequip that Equipment, Apparel or Weapon.
- On an Intervene's hit: `@interveneFree` (it spent no Counter Action) and `@interveneFreeFx.<ref>` (the effect that waived
  it); the Deflect's Might Clash has `@via_deflect`.
- Racial option pieces are switched on one by one, so a sub-choice can be one piece per value (one `favoredElement` piece per
  Element, one `saveProf.<save>` per Save...): the player switches on the option and the value picked.

## More vocabulary (6OG / 6RG / 6RT): option grants, Grapple Out-of-Sequence, Empower, each Threshold's penalty

- Grant suffixes: `+option:<Name>` (the granted item comes when that Racial option is switched on and goes when it is
  switched off) and `+res:<slug>` (it works only while that sheet resource is 1+). An entry's own field
  `"grant": "maneuver: X +option:Y; talent: Z"` grants while the entry stays partial (its code spec still listed for the GM);
  a code category `grant` makes the entry fully automatic. Target `optionSwitch` (value 1, no effect) gives an option that
  only grants items a piece the player switches on.
- Maneuver keys `grapple`, `launch`, `pin` (the Grapple flows Out-of-Sequence, no Action; the target is the event's other /
  the user's target); `with: "grapple.reach=<n>"` adds Squares of Melee Range to that Grapple.
- Empower: `flag.empowerForceMax` (the giver always gives the most it can); `empowered.toLife` (the recipient: the Ki
  Points it gets become Life Points, up to its missing LP; `empowered` has `@lpGained`).
- `threshold.bruisedPenaltyMult` / `threshold.injuredPenaltyMult` / `threshold.criticalPenaltyMult` (that failed
  Threshold's penalty multiplied: 0 = none, 2 = doubled), `steadfast.bruised` / `.injured` / `.critical` (± only that
  Threshold's Steadfast Check), `@failedThr.<threshold>` (1 when its Steadfast Check failed).

## More vocabulary (6RE / 6AP): blocks, silent Defeat, an Opponent Defeated, Ki ward, the Advantage pick in a set

- `block.attack` / `block.signature` / `block.uniqueAbility` / `block.powerUp` / `block.energyCharge` /
  `block.transformation` (value 1): that action is refused (the warning names the effect).
- Event `opponentDefeated` (an Opponent of yours was Defeated; other = it; `@byMe`, `@byAttack`, `@opponentMinion`, `@vs.`).
- `life` effect resource `silent`: nothing of yours triggers in response to that loss (its own `threshold` event does not
  fire; the Allies' `allyDefeated` and the Opponents' `opponentDefeated` still do). `safe silent` combines both.
- `flag.noKiLossFromOthers`: another Character's trigger effect cannot reduce your Ki Points.
- `@vs.alliesAdjacent` / `@vs.opponentsAdjacent`: how many of the other Character's Allies / Opponents are adjacent to it.
- `attack.advantagePick` pieces may carry `exclusive`: the select joins that set when every pick piece that applies is in
  it (a pick piece without one makes the select free). `attack.advantagePick.copied` (value = TP): only the Advantages one
  of your Copied Techniques has.

## More vocabulary (6RX / 6CC): what reacted to a roll, costs checked now and paid later

- `pressureCheck`: `@reacted.<fx ref>` (that effect reacted to the Pressure Check's roll) and `@rollSpent.<resource>`;
  `clashWon` / `clashLost`: `@reacted.<fx ref>` (to your roll of the Clash) and `@chose.<group>` (your Clash boxes).
- Attacks: `@rollSpent.strike.<resource>` / `@rollSpent.wound.<resource>` — what roll reactions spent on this attack's
  Strike / Wound Roll (for "if you spent 2+ X on the Strike Roll of that attack").
- Option field `checkCost` (attack.* pieces): a cost only checked when the attack is declared, summed with the other ticked
  boxes' costs, and paid later by the effect's own triggers ("you do not lose them until the attack is over").
- `attackMissed`: `@missedAll` (every target of the attack has now missed).

## More vocabulary (6MW / 6EN): marks on the marked one's turns, the Ki Wager limit, environment Damage, Entrusted (4)

- A `mark` effect may last `endOfTheirTurn` / `endOfTheirNextTurn` / `startOfTheirNextTurn`: counted on the marked
  Character's turns.
- Option / `with` target `attack.wagerMax` (value N, lowest wins): the Ki Wager limit of this attack
  (`with: "attack.wagerMax=0"` = no Ki Wager).
- Collision, Suffocating, Heightened Gravity and Damage Over Time losses count as Damage for `resourceSpend` (`@viaDamage`).
- The Entrusted State's 4th effect is now a box of the attack dialog (group `entrusted4`, 1/Encounter): Full Wager +
  All-or-Nothing + `attack.capacityFull` (the Capacity reset to its maximum first) on a Basic Attack — on a Signature
  Technique too with `entrusted4.signature` (`@entrusted4Sig`). An effect that adds to that use joins the box with
  `group: "entrusted4"`; `@chose.entrusted4` tells it was used.

## More vocabulary (6DC): what the defender chose, seen after its defense

- `@defChose.<group>` (the n of each of the defender's option groups chosen for that defense, before the roll or once hit):
  in its vs.* pieces once hit, in the Damage, in `damaged` / `dodged`. ("+1(T) Soak per step paid in that box" =
  `vs.soak` `(@defChose.<group>)(T)`; "that Opponent stops being Studied after you use it" = an unmark on `damaged` /
  `dodged` with `@defChose.<group> >= 1`.)
- `@waivedFx.<ref>` (the effect whose `defense.freeCounter` waived the Counter Action of that defense): in its pieces
  (a `vs.guardKp` of that use) and the events after it.

## More vocabulary (6SZ): a Score of 0, always in a State, a Condition that cannot be removed, the tail held

- `scoreSet.<attr>` (value N, 0 included; the lowest wins): that Attribute Score is N ("your Scholarship Score is 0").
- `innateState.<state>` (value 1, no condition): you are always in that State (Feral...), like the Innate State Aspect.
- `conditionLock.<condition>` (value 1, condition allowed): that Combat Condition cannot be removed while it holds.
- `@tailHeld`: your tail is held in the Grapple you are in (Tail Restraint); the Grapple Check's `clashWon` /
  `clashLost` have `@tailGrab` (that Grapple grabbed the tail).

## More vocabulary (6CB / 6FK / 6NF): a Critical becomes a Botch, Born for Battle, a Natural Result set flat

- effect `critToBotch` ("targeted": the attack on you): the Strike Roll's Critical Result of that attack becomes a Botch
  Result before any target defended (its Critical dice go, the attacker's Botch penalty applies, Cutting's +1 Category
  goes back). Through the GM when the card is not yours.
- Born for Battle (Saiyan Racial Trait 4) is covered: an effect of a "threshold" trigger on `@defeated` (a
  [Triggered/Defeated] effect of yours, its button too) gives the Temporary Zenkai stack, once per encounter, as crossing
  the Critical Threshold does.
- reaction `naturalSet` with resource `flat`: that roll has no Critical nor Botch Result, and +1 Dice Score per effect of
  yours raising its Natural Result or lowering its Critical Target (`natural.combat` / `natural.<kind>` above 0,
  `crit.combat` / `crit.<kind>` below 0).

## More vocabulary (6HM): the Homing Advantage

- `attack.advantage.homing` (or a Signature Technique's own Homing) on an attack without an AoE now works: when a
  target's Dodge / Parry / Cross Counter roll makes the attack miss, the system rolls the attacker's Strike Roll again
  (as it was made, no roll reactions), up to the Homing ranks, +1(T) per miss so far, against the same defense; the card
  shows the rolls. Still one attack: no more Diminishing Defense. The 2+ ranks "target left the range" part is the GM's.

## More vocabulary (6AH): also Healthy; a fixed Score refuses Attribute Points

- `alsoHealthy` (value 1, condition allowed, e.g. `@states.superior >= 1`): your effects also count you as in the Healthy
  Health Threshold, as well as the real one: a condition reading `@below` that fails is tried again with `@below` 0
  (formula.mjs `test`). The Threshold penalties stay. `@alsoHealthy` is 1 while it holds.
- `scoreSet.<attr>`: the sheet now reports an error when Attribute Points are spent on that Attribute.

## More vocabulary (6PA): a limit counted once per attack

- A `limitKey` that starts with `attack:` (e.g. `attack:telepathicwarning2`) counts once per attack: the first use for an
  attack (a box of the defense dialog, or a button of an event of that attack: targeted / allyTargeted, which carry its
  card) counts one use of the limit and pays the cost; the other uses for that same attack are free. Pieces and triggers
  that share the key share that use.

## More vocabulary (6FC / 6SW): Final Chance; an Empower that goes to the effect's owner

- The Final Chance Advantage works (a Signature's, or `attack.advantage.finalChance` from an effect, which needs no
  Ultimate Signature Technique): below the Injured Health Threshold the attack dialog has a box; ticked, your Life
  Points go to 0 at Attack Declaration and join the Ki Wager, and your Health Thresholds / Defeat wait until every
  target of that attack is resolved (a miss, its Damage applied) or your turn ends.
- A `maneuver` effect with `empower` that another Character uses through your effect (target `targeted`, `ally`...)
  targets you for that Empower (Spiritual Warrior: your Bonded Ally's Empower goes to you).

## More vocabulary (6AG / 6KR / 6DD / 6CS / 6GC / 6AO / 6MO / 6SW3): Allies' guards, attack events, team clashes

- Event `wasHit`: your defense ended in a hit, before the Damage (other = the attacker; the card and row go with it:
  `attackSoak`, `redefend`); `allyWasHit`: the same for an Ally of yours (`@allyMark.<slug>`, `@allyMinion`,
  `@allyMyMinion`). Event `attackCountered`: an Opponent answered your attack with a Defend option that spends a Counter
  Action (other = it, `@hit`).
- Effects: `attackSoak` (+value Soak on that row before its Damage, wasHit / allyWasHit), `redefend` (the attack goes back
  to your Defense Declaration: defend again, no second Diminishing Defense), `cancelAttack` (cancel your attack: KP,
  Capacity, Action Cost and held Energy Charges back, then the attack dialog against the one who countered),
  `attackMissTeam` ("targeted": the attack misses you and every Ally of yours it targets).
- `allyGuard.defeat` (an Ally's piece, `@to.*`, limit): an Opponent's Damage that would Defeat this Ally is reduced by the
  value before it is applied. `allyGuard.cognitiveShift`: an Opponent's Clash that makes this Ally use its Cognitive Save
  asks whether you take it instead (you roll it, its effect goes to you). `foeGuard.critToBotch` (an Opponent's piece):
  your first Critical Result on a Combat Roll (Strike, Dodge, Wound) becomes a Botch Result (its limit counted on them).
- "targeted" knows `@alliesTargeted`, `@alliesTargetedMight` and `@powerShot`; a trigger's Clash check sees `@aoe`,
  `@charges`, `@powerShot`, `@alliesTargeted`, `@alliesTargetedMight` (clash.* pieces).
- Duration `endOfThisTurn`: until the end of the turn going on now (whoever's it is).
- Per-attack keys may end in `+after:<key>`: a button is refused until that other per-attack key was used for this attack.
- `attack.removeAdvantage` / `attack.removeDisadvantage` (value = how many): the attack dialog of a Signature Technique has
  two selects; each Advantage taken off gives +2(T) Wound, each Disadvantage (6 TP or less) +1(T) KP (one kind only).
- An adjacent Glass Tribe Ally with Glass Combat offers its Glass Profile in your attack dialog (Multi-Profile), paying its
  2(bT) KP and its 1/Round use.
- NPC field `minionOf` (Bio tab, a Minion's Leader): `@to.myMinion` in Ally pieces, `@allyMyMinion` in Ally events.
- `@kiMultOther`: an effect other than a Form gives you the Ki Multiplier (a working "ki.mult" piece above 1 that is not
  Power Battery's own). A `steadfastPass` that turns every failed Health Threshold also takes back a Stress Test only that
  failure forced; with no Threshold failed, it makes a failed Condition Recovery succeed. A Signature's "Copied from" field
  (`copiedFrom`, a name or uuid) gives `@copySource` to the `unitedBy.*` pieces of its United Attack.

## More vocabulary (6Z): free Advantages, a free Ki Wager, the per-Round limits, sheet checks

- `sigAdvFree.<advantage>` (value 1): that Advantage costs no TP on your Signature Techniques (Weapon Style, Demon
  Warrior, Way of the Weaponmaster: `weaponAssisted`).
- `attack.wagerFree` (an attack option, usually with an amount and a `life:@n` cost): + that much Ki Wager that costs no
  Ki Points nor Capacity (Way of the Warrior).
- The card warns when a Basic Attack uses a Profile (not Simple) again this Combat Round (`profileUses.<profile>`: more
  uses; Glass Combat) and on a second Signature Technique Maneuver in a Round (`sigUses` more, `flag.sigUnlimited` none:
  Nice Shooting); Out-of-Sequence attacks are not counted.
- A per-attack box with `+after:<key>` in the defense dialog needs that other box ticked with it (or used for the attack).
- Your own Compelled from a button against another Character is toward that Character (Noble Dragon).
- The sheet warns for Enhanced Organism without an Alternate Upbringing Trait, Weapon Ports without 2 Integrated Weapons,
  a racial Rank on Perception with Functional Purpose, Neko Majin-Dama without an Integrated Majin-Dama, and the Plating /
  Insect Shell missing the Quality its option gives.

## More vocabulary (6AR / 6MD): areas on the map, Karma costs, a new item

- module/canvas/areas.mjs: a Sphere AoE as a scene Region around a token's Square (Minor 1, Standard 3, Large 4, Huge 5,
  Destructive 6 Squares, the data's reach). An attack with Self-Explosion places its Sphere on the attacker's own Square.
  Effect `placeArea` (value = Magnitude, resource = its kind, "Bog"): a Sphere centered on you. A sheet resource named
  "Bog Environment" follows the token: 1 inside a Bog area, 0 outside.
- Cost kind `karma:N` (Karma Points). Effect `createItem` (resource = name): an equipped accessory of that name (a new
  Integrated Majin-Dama).

## More vocabulary (6GL / 6PD): Glass on the map, Power Drain, Attack Absorption

- Glassification's card has two buttons: a Glass Sphere centered on you (Magnitude = the times that Square was
  targeted; move the Region onto the targeted Square if it is another one) and the Corporeal Clash against the targeted
  Character (Slowed x the times targeted until the start of your next turn). `@onGlass`: your Square is in a Glass area;
  `@glassSurrounded`: so is every Square around you (actors refresh when tokens move or areas change). A sheet resource
  "<Kind> Environment" follows the token for any area kind (Bog, Glass...).
- Effect `powerDrain` (Power Drain Maneuver's button, as the Grappler; value = Actions): the target's LP and KP lose 1/2
  (rounded up) of your Might per Action, you regain the KP it lost (none from a Character whose KP others cannot reduce).
- Effect `absorbAttack` (Attack Absorption Maneuver, on "dodged" after a Parry of an Energy / Magic attack): the attack's
  Urgent Wound Roll, 1/2 of its Dice Score back as KP; at 1/5 of your Max KP a Power Up is offered.
- NPC type `battleJacket` (Bio tab, its owner in the same "Leader / Owner" select): the owner's `jacket.<target>` pieces
  apply to that sheet, worked out with the Jacket's own data ((bT) = its Jacket Tier). Way of the Pilot: `jacket.tp` 5(bT).

## More vocabulary (6OA): Area of Rule, Glass reach, Grapple reach, Collision

- `@areaOfRule` (Squares: 3, + "areaOfRule" pieces), `@alliesInRule` / `@alliesInRuleNM` (Allies within it, the second
  without Minions); Ally pieces read `@to.distance <= @areaOfRule`. `@glassReach`: every Square within that many of you
  is Glass (a Large Sphere is 4). A `grapple.reach` piece adds its Squares to every Grapple. Event `collided`: you take
  Collision Damage (@damage).

## More vocabulary (6E2): initiative, swapping the target, copying a Maneuver, timed areas

- Effect `actAfter` (target the Ally): your Initiative goes right below that Ally's for this Round (it comes back at the end
  of the Round). Effect `swapTarget` ("targeted", target the adjacent willing Ally): the two tokens swap places and the
  Ally becomes the attack's target on its row. Effect `copyManeuver` ("opponentManeuver"; `@actionCost` there now): the
  Maneuver the Opponent used, Out-of-Sequence (a Special Maneuver only if you own it).
- `placeArea` with a `duration`: the area is removed when it ends (timed entry kind "area"). The GM is warned when more
  than 10 Minions of a Ruler are in one encounter. Attack option pieces of different items that share a `group` share
  its box and its @n (Way of the Warrior with Eye of the Dragon).

## More vocabulary (6GS): Glass Soldiers (Glass Features on the map)

- A Glass Soldier is an unlinked token of its owner's "Glass Soldier (<name>)" NPC (made once, owned by the owner's
  players), flagged `flags.dbu-rpg.feature` {kind "glassSoldier", owner, rank 3, lp/lpMax 6, hv}. Its Square leaves the
  Glass area (a hole: `area.holes` plus a hole shape on the Region). Module: canvas/features.mjs.
- Effect `glassSoldiers` (value = how many; Warriors of Glass 1: amount 4, cost `actions:1; ki:@n*2*@bT`): Soldiers on
  the free Glass Squares nearest to you. Effect `soldierTurn` (startOfTurn): your Soldiers on Glass regain all LP, the
  others spread a Minor Glass Sphere. Effect `destroyFeature`: the Glass Soldier next to you (or next to the Ally of an
  `allyWasHit`) is removed. Effect `originFromFeature` (Warriors of Glass 4): this turn your distances count from the
  Glass Soldier you control on the map (`flags.dbu-rpg.originFrom`, cleared at the end of your turn).
- `@nextToGlassFeature` (Soldiers adjacent to you), `@glassFeatureHV` (the highest Hardness Value among them); in
  `allyWasHit`: `@allyNextToGlassFeature`, `@allyGlassFeatureHV`. The Soldiers' Squares count as Glass for
  `@glassSurrounded` / `@glassReach` (not for `@onGlass`).
- `attackSoak` takes `resource`: "soak" (default), "dr" (vs.dr) or "damage" (vs.damageTaken, negative).
- Movement: an Opponent leaving a Glass Soldier's side provokes its owner's Exploit (Warriors of Glass 2); a sheet
  resource "Glass Combat 3" at 1 checks that the next move ends on Glass (the card warns otherwise).

## More vocabulary (6PL): moving another Character, placing on a Square, forced movement

- Effect `moveOther` (value = Squares; the event's other Character, or your target on a use): the forced movement dialog
  (direction, Sudden Stop, Collisions) moves it up to that many Squares (Rubbery Body 8, Namekian Biology 5:
  `1 + @aptitudes.meleeReach`).
- Effect `teleport`: a Square picked on the map (canvas/place.mjs: left click picks, right click / Esc cancels; three
  tries; never onto a token). `resource` "" = you, "other" = the event's other Character / your target, "target" = your
  target at the press (a willing Ally); `value` = at most that many Squares from you (0 or empty: anywhere). A Grappled
  Character first makes a Cognitive Clash against its Grappler (a win ends the Grapple, a loss cancels it). The token
  moves with `dbuPlaced` (no Movement Maneuver: nothing provoked).
- Event `placed` (on the Character placed): `@placedNextToOpponent`, `@placedNextToAlly` (adjacent ones there).
- Forced movement (Knockback, Launch, Thrust, `moveOther`) moves the token with `dbuForced`: the "moved" events still
  fire (`@forced` 1) but no Exploit is provoked by leaving a Melee Range. An Ally moving an Opponent offers the Exploit
  of a Character with Patient Sniper; Collision Damage ends the movement of a Character with Bouncy Physique.
- `mod.<attr>` pieces may read `@apparel.<slug>.bonus` (the base Apparel Bonus, before "apparelBonus" pieces).

## More vocabulary (6WJ): Battle Jacket Life Points, Exploit on purpose, guarding Allies' Clashes and knocks

- Cost kind `jacket:<n>` (also `jacketlp`): Life Points of the Battle Jacket you pilot (an NPC "battleJacket" whose
  Leader / Owner is you; paid through the GM when you do not own its sheet). Way of the Pilot: an `attack.wound` box,
  `amount: "10(bT)"`, `cost: "jacket:@n"`. Way of the Warrior's Energy Charge is `attack.overCharges` (past the maximum).
- Burrowed Strike: an `attackMade` button on a Physical attack with the existing effect `provoke` (resource
  `adjacent`): the Opponents adjacent to you may use the Exploit Maneuver against you.
- `foeGuard.steadfast` (value: how much lower; reads `@to`, the knocked Opponent): an Ally of yours knocks it through a
  Health Threshold with an attack: its Steadfast Check is lower by the value (your own attacks use `vs.steadfast`).
- `allyGuard.skillBonus` (value 1; reads `@to`, the Ally): that Ally's Skill Clash adds the difference when your Skill
  Bonus for that Skill is higher (Skilled Ogre: `@to.distance <= @areaOfRule`, 1/Round).

## More vocabulary (6LN): the start of your turn, Max LP for the encounter, Minions an effect creates

- `@actionsPerRound` (the Actions of a turn): `@myTurn == 1 && @actions >= @actionsPerRound` = no Action spent yet this
  turn ("at the start of your turn": Negative Ki 2, with `@vs.distance < @aptitudes.longRange` for "not at Long Range").
- Effect `maxLifeLoss` (value): Maximum Life Points lost until the end of the Combat Encounter (flag maxLifeLoss; Life
  Burn pays the LP with a `life:` cost and keeps a "Life Burn" resource for its +2(T), cleared on `threshold` with
  `@failedNow == 1`).
- Effect `createMinion` (resource: its Racial Traits from the compendium, "|" between them): an NPC Minion of yours
  (minionOf = you) on a free Square next to you, made by the GM; its sheet is finished by hand.
- Option pieces are relabelled "<Trait> — option: <Option>" by the extractor: two `use` triggers of one option are ONE
  button unless their `limitKey` differs.
- Glassification's Character button reads `@res.glasscombat6 == 0` (Glass Combat 6: 1 armed / free, 2 used, 0 at the end
  of the turn).

## More vocabulary (6UA): Unique Abilities and the Magic Trick Maneuver with their own effects

- The extractor's MANEUVER_PIECES now also fills Unique Abilities (pack unique-abilities) by name. Their triggers fire on
  `maneuverUsed` with `@via_<slug>` (`@via_healinghands`, `@via_timefreeze`, `@via_magictrick`) and read the
  Advancements owned / Restrictions applied of that Unique Ability: `@adv.<slug>`, `@restr.<slug>` (combat/triggers.mjs
  uaContext).
- Magic Trick Maneuver: three buttons (Impaired after a Use Magic vs Intuition / Use Magic Clash; move the target that many
  Squares after that Clash; place yourself within them, no Exploit), the Use Magic ranks doubled with Whimsical Magic
  (`@item.whimsicalmagic`); a lost Clash offers the target's Exploit (`provoke` with resource `other`).
- Healing Hands: your target regains 1d10(bT) + @ma LP (+1d10(bT) with Healing Expertise); +1 Medicine.
- Time Freeze: the sheet resource "Frozen Turn" (1 while it lasts; a use button or the end of the turn ends it);
  meanwhile the other Characters have −2(bT) Defense Value and −2 Perception (`ally.` / `foe.` pieces). Racial pieces read
  `@res.frozenturn >= 1` (God of Time: +2(T) Wound, +2(T) KP Cost of Maneuvers, a warning past one attack).

## More vocabulary (6F1): Factor Traits, first batch

- `flag.noTraitLifeRegain` (1): the effects of your own Racial Traits / Transformations regain you no Life Points (other
  sources still do: Undead Survival while Undying).
- A Field of Aggression is a Large Sphere (4 Squares): `@opponentsWithin.4`; an Opponent moving into it offers the
  Bio-Berserker's Exploit (rules/movement-watch.mjs fieldExploit; not forced movement or a placing).
- "An Opponent with one of your Allies adjacent": `@vs.opponentsAdjacent - min(1, max(0, 2 - @vs.distance)) >= 1` (its
  adjacent Opponents, you taken out when you are adjacent too).
- "+3 Squares of Melee Range for a Physical attack or Grapple": `grapple.reach` 3 (the system checks reach only for the
  Grapple Maneuvers).

## More vocabulary (6F2): Factor Traits, second batch

- `@allyMarkAdjacent.<slug>`: how many adjacent Allies carry that mark of yours (Tall Yardrat Genes: your Bio-Bonded Ally).
- A mark only one Character may place on someone: `@vs.markOthers.<slug> == 0` in the mark trigger's condition.
- Buttons of one `group` with an `amount`: their conditions are tested when the card is posted (with @n = 1), so a piece
  that depends on the amount picked puts it in the value: `min(1, floor(@n / (4 * @bT)))` (1 from 4(bT) on). A
  "1/Encounter" inside such a group: a sheet resource kept with it (resources reset at the end of the encounter).
- The sheet check `DBU.Val.NoShortRange` (Cerealian Genes): no Signature Technique with the Short Range Disadvantage.

## More vocabulary (6F3): another Character's turn, exclusive choices, switching another effect off

- Event `otherTurnStart`: another Character's turn starts (fired on every other participant at its start; other = whose
  turn it is; `@vs.*` of that one). Speedster 3: a Movement Maneuver button.
- Option fields `exclusive` (a set name): the attack dialog's boxes and the Advantage select of one set exclude each
  other (Earthling-Raised 3: an Energy Charge or an Advantage).
- `fxOff.<ref>` (1): the pieces of that rules effect do nothing (Traces of Majin 5 switches off `majins_rubberybody_7`).
- removeCondition `any!a!b...`: the player picks one Condition but those listed (Phantom Genes: only four allowed).

## More vocabulary (6GP): Goops

- Effect `createGoop`: a Goop of yours on a free Square next to you: a copy of your sheet as an NPC Minion (minionOf =
  you) without Apparel, Weapons or Accessories (flags.dbu-rpg.goop {owner, created}); made by the GM.
- Effect `reabsorbGoops` (value: how many, 0 = any number; resource "all" = every one without the dialog, "notThisTurn" =
  not those created this turn): the Goops picked are Defeated (removed) and you regain 1/2 of their remaining LP.
- A Character with From Goop: at the end of the encounter its Goops die and it regains 1/2 of their LP (combat.mjs).

## More vocabulary (6IG): gear a Trait makes

- `grant: "gear: <Name>"`: an item the Trait adds (and takes away with it) that is not in a compendium; its data is in
  build/extract_content.py GEAR_GRANTS (`Plating`, `Metal Exoskeleton`: Natural Armor, made with Craftsmanship Grade =
  base Tier of Power, max. 5; `Integrated Weapon`: Grade 4 with Regenerating in no slot; `Onboard Scouter`: the
  equipment's Scouter [Tech] with Craft DC Master). "from" copies an equipment item by name (the equipment is now built
  before the Racial Traits).

## More vocabulary (6F5): Integrated items, random Compelled, no Damage

- Effects `integrateItem` (a dialog picks an Apparel / Weapon / item to Integrate; items keep it in
  flags.dbu-rpg.integrated) and `destroyIntegrated` (a dialog picks one of your Integrated items to delete)
  (rules/integrate.mjs).
- Effect `compelRandom` (value: Squares): Compelled toward a random Opponent within that many Squares.
- `provoke` with a number of Squares (`"resource": "3"`) or `other` (the event's other Character only).
- `attackSoak` resource `none`: that attack deals you no Damage (vs.damageMax 0). Less Damage never goes below 0 now.
- `@bestialTraits`: the Racial Traits of the Bestial Traits group on the sheet (Dragon-like 1).

## More vocabulary (6TS): switching Racial Traits for a while

- Effect `traitSwitch` (value 1 on / 0 off; resource: a Racial Trait's name, `pick:<group>` one of that group picked in a
  dialog, `all:<group>` all of it, group `*` any Racial Trait): the Trait's `active` changes for the `duration` and
  comes back when it ends (timed kind "traitSwitch"). Wild Child 4/5 (Pseudo-Bestial Traits), Were-Beast 4.

## More vocabulary (6F6): guard costs, Tension stand-in, dice in roll bonuses

- `allyGuard.<kind>` pieces may have a `cost` (paid by the Ally who gives it when the piece is used; `res:<name>:all`
  empties that resource): Dragon of Light 6 (`allyGuard.defeat` = 2(bT) per Positive Energy, all of it spent).
- Konatsian-Raised 2: a `res:Tension:<n>` cost with no Tension left is paid with Inherited Tension.
- A `rollBonus` value may be dice (`1d8(T)`: an Energy Charge on a Signature's Wound Roll); the validator reads the dice
  as 1.

## More vocabulary (6F7): limits used this Round, Ki Surge Surgency, Copied Techniques

- `@usedLimit.<limitKey>`: the uses of that limit counted this Combat Round (Technician 5 when Technician 4 was used).
- `surge.kiSurgency` (×, a `with` piece): the Surgency of a Ki Surge (Genie 4: 0.25). A fraction of the Surgency
  (`surge.healSurgency` / `surge.kiSurgency`) is now rounded up.
- A Signature tagged `copied` added to the sheet of a Neko Majin-Raised regains its KP Cost (1/Round, rules/grants.mjs).
- Options without any piece need an `optionSwitch` piece so the sheet can switch them on (their grants follow it).

## More vocabulary (6F8): what an attack's rolls spent, Positive Energy, grants in a State

- `@rollSpent.strike.<resource>` / `@rollSpent.wound.<resource>`: what the roll reactions of the attack's Strike / Wound
  Rolls spent (in the attack events and in the `roll` event of its Wound Roll): Genetic Focus: Arcosian 4, Neo-Tuffle
  Genes 3.
- Dragon of Light 1: a Negative Energy gain turns into Positive Energy, and Positive Energy counts as (and pays for)
  Negative Energy (`@res.negativeenergy` includes it).
- `@allyBelowMax`: the most Health Thresholds an Ally of your encounter is below.
- Grants `+state:<key>`: the granted item works only while its owner is in that State (Possess while Liquid).

## More vocabulary (6BC): battle conditions of the scene

- The scene configuration has "DBU: battle conditions" (flags.dbu-rpg.battle {environment, weather, light}), read by
  rules/battle.mjs: `@env.<key>` (standard, bog, soft, lava, magma, underwater; a token's height gives lowSky, highSky,
  localSpace, deepSpace), `@weather.<key>` (hot, cold, tornado, storm, earthquake, vile) and `@weather.any`,
  `@lightLevel` (-2 ... 2) and `@lightLevelEff` (after `lightShift` / `flag.ignoreLight`).
- The Light Level penalties are applied (Pitch Black / Blinding halve Awareness, Defense Value and the Perception Skill
  Bonus; Dark / Bright: -2(bT) Awareness and Defense Value, -2 Perception). `lightShift` (n): the Light Level counts n
  steps closer to Normal; `flag.ignoreLight`: no penalty. Battle Weather and Battle Environment effects themselves are
  not applied (the GM's).
- A choice of Battle Weather: one option per weather on the Trait (`"option": "Hot Weather"` with `@weather.hot == 1`).

## More vocabulary (6F10): permanent States, refusing movement, Duplicate Minions

- `innateState.<state>` (1, no condition): always in that State while the item works (Extra Limbs: Multiple Arms).
- `flag.noMovement` (1): the Movement Maneuver and your own placings are refused (Arboreal: Rooted). A Character moved
  while its sheet resource "Rooted" is 1 stops being Rooted (Arboreal 5).
- Effect `createDuplicate` (value: Size Categories, negative smaller; resource: its name): a Duplicate Minion of yours
  (a copy without Apparel, Weapons, Accessories) next to you (Brood Parent 1).
- Burrowing Beast: the sheet resources "Underground" (Cover) and "Cover" drive its effects.

## More vocabulary (6F11): placing next to a target or a Feature, Launch without a Grapple, tagged items

- Effect `teleport` resource `nextToTarget` (value: how far your target may be, e.g. `@aptitudes.speedBoosted`): you
  go to a Square adjacent to your target (Land-Based Beast 3); resource `nearPicked` (value: the Sphere's Squares, 4 a
  Large one): the Feature's Square is clicked first, you must be within it, then you land within it (Silk Production 3).
- The `placed` event also has `@placedVia_<slug>` = 1 for the effect that placed you ("Dissipating Dodge (1)" →
  `@placedVia_dissipatingdodge`), so a follow-up (a Clash against the Opponents next to the new Square) belongs to it.
- Effect `launchOther`: the Launch Maneuver Out-of-Sequence against the event's other Character, as if you were
  Grappling it (Super Elastic Body 3/4). Check `clash:grapple`: a Grapple Check (Strike vs Strike/Dodge with the
  `clash.grapple` pieces).
- Effect `tagItem` (resource `<item type>:<tag>`): a picked item of yours carries the tag; `kpCost.tag.<tag>` changes
  its KP Cost (Unique Monstrosity 1/2).
- Effect `absorbAttack` with a resource name: any Foundation, no Power Up, and 1(bT) of that resource per 1/5 of your
  Max KP regained (Light Consumption 2's Light). `@vs.topNow`, `@vs.power`.
- `@healingSurgesRound`; `flag.noHealingSurge` (a Healing Surge is refused). `grapple.freeRange` (n): no Guard Down
  from your Grapple while the Grappled is n+ Squares away; `grapple.foeCombat`: ± Combat Rolls of the Character you
  Grapple; `move.reduce`: Squares less on every forced movement of yours.
- A trait use's Out-of-Sequence Maneuver now carries its effect, so that Maneuver's events see `@viaFx.<ref>`.

## More vocabulary (6F12): the Incorporeal State, Stored items, Brood Parent's Duplicates, many targets

- The Incorporeal State (Monster) has its effects: `vs.ignoreWoundBelow` (a Wound Roll lower than the value deals no
  Damage; ceil(1/4 Max LP)), +2(T) `clash.grapple` while Grappled, `block.attack`, `flag.passThrough` (forced movements
  pass through Characters and walls; your Square counts as empty), `collision.ignore`. Damage from an attack makes you
  leave it and sets `stateBlock.incorporeal` until the end of your next turn: `stateBlock.<state>` refuses entering it
  (`@stateBlock.<state>`).
- Effects `storeItems` / `takeStored` / `storeWeaponOf` (rules/store.mjs): flags.dbu-rpg.stored, unequipped, the sheet
  tag "Stored"; `storeWeaponOf` takes the other Character's equipped Weapon (op `delete` through the GM).
- Duplicates (`createDuplicate`): `duplicateGrant.<maneuver slug>` (the Duplicate gets that Maneuver from the pack),
  `duplicate.shrinkMax` (asked: that many more Size Categories smaller, -1(T) Soak / +1(T) DV each), `duplicate.uses`
  (`@duplicateUses`, for a limit "(1 + @duplicateUses)/Round"). Effect `consumeMinions` (resource: the Duplicates'
  name): Defeat ticked ones not made this Round for 1/4 of their KP. `@vs.myMinion`.
- Trigger target `targets`: every Character the clicking user targets (each with its own check: a Cone).
- `@targetsMe` on `opponentManeuver` / `allyManeuver`. Effect `consumeLight` (on the target; resource: the source's
  resource): Light Dependent Transformations left without Stress Exhaustion, Power lost, the source gains them.
  Effect `weaponQualities` (resource "A, B"; value 1 add to a wielded Weapon, 0 remove: no slot).
- Option use buttons get the option's label: give each its own `limitKey` when one option has several buttons.

## More vocabulary (6F13): reacting to the others' rolls, Break Value lost, temporary items

- Events `allyRoll` / `opponentRoll`: an Ally's / Opponent's roll after its dice and before its result is used
  (dice/roller.mjs → combat/reactions.mjs foreignRollReactions). Only `rollBonus` (no dice) and `natural`; the roll's
  variables plus `@rollerDistance`, `@againstMe` and `@vs.*` (the roller). The reacting Character's owner is asked (on
  this client, or by socket "rollAsk"/"rollAnswer", 60 s at most), pays the cost and counts the limit; the roll changes
  on the roller's side (Heart of Evil 2, Yardrat Genes 2, Dragon of Light 3).
- Event `breakValueLost` (`@via_<slug>`, `@natural`, `@n`): an Apparel piece of yours lost Break Value (Arcosian Genes 4).
- `flag.noCounterManeuver`: no Counter Action may be spent (trigger costs, attacks, Defend warns). Maneuver key `ua1`:
  a Unique Ability of 1 Action Out-of-Sequence. Effect `tempItem` (resource: item type; label: its name): a blank item
  removed when the Combat Encounter ends. `size.min` is a target (the Size index, 6 = Gigantic).
- A shared trigger roll (`rollKey`) is rolled only by automatic triggers: a button trigger (a Maneuver) rolls again on
  its click. To act on a shared roll with a button, set a resource with the automatic one and read it in a "use".

## More vocabulary (6F14): free Awakening Stacks, Legendary, copies, Avatars

- Grant qualifier `+free` ("transformation: Spirit Control +free"): the Awakening comes with one free Stack (no Awakening
  Limit, no Attribute Modifier Bonus); one already on the sheet gains a free Stack once per granting item.
- `flag.arcosianMetamorphosis`: your Forms with the Arcosian Racial Requirement and no Line count as the Metamorphosis
  Line (their prepared line). Legendary Saiyan (rules/grants.mjs legendaryStages): a Form / Evolved Stage with the Super
  Saiyan Form Aspect and no Pinnacle brings the "Legendary" Evolved Stage with `original` = that Form.
- Copies: effect `recordCopy` (resource "<List>:<max>", the event's `@copyName`: the Absorbed Character of
  `awakeningGain`, the Grappled of the new event `grappleStart`) keeps names in flags.dbu-rpg.copies.<slug> (a full list
  asks which to replace); effect `copyStack` (resource "<List>|<Awakening>|<level>"): a Temporary Stack holding a picked
  copy, or the same Stack changing copy again in the encounter.
- Effect `switchAvatar` (combat/avatar.mjs; socket "switchAvatar"): the Avatar (another sheet, picked once:
  flags.dbu-rpg.avatar) takes the token's place, the combatant and the Combat Conditions; the Character comes back at the
  end of the Combat Encounter. `flag.avatarTransform`: offer the Avatar the Transformation Maneuver when switching in one.

## More vocabulary (6F15): rerolling a shared trigger roll, team pieces against a Studied attacker, tags off

- Event `triggerRoll` (`@rollKey_<key>`, `@roll`, `@rollNatural`): a shared trigger roll (sharedRoll with a rollKey) may
  be rolled again once by a `reroll` piece, asked through the owner (cost, limit); the new result stands for every
  trigger of that rollKey (Genetic Focus: Demon 4).
- `intervene.*` pieces see `@attackerVs.*` (the attacker, as the one who steps in sees it). Thrust's Prone / Guard Down
  fire `inflict`. Effect `lifeLostAs` (value): those KP count as Life Points lost (resourceSpend of "life").
- `flag.tailAPDouble`: the Adaptation Points pieces (group aw2) count twice on a Tail Attack's Wound Roll.
  `attributePoints.perConvertedSI`: + Attribute Points per Skill Improvement converted from a Character Perk.
- `tagOffNormal.<tag>` (rules on data/items.mjs grantWorks): the item an effect tagged <tag> (tagItem) does not work while
  its owner is in its Normal State.

## More vocabulary (6F16): the Terrify Maneuver, inflict via an item, borrowed Apparel

- The Terrify Maneuver has its effect (extract_content.py MANEUVER_PIECES): a Skill Clash (Intimidation vs
  Intuition/Intimidation, -2 against a higher Tier of Power) against your target within 4 Squares: Shaken until the end
  of your next turn, Prone if it already was.
- `inflict` now has `@via_<slug>` for the giver's item whose effect inflicted the Condition (Ominous Dragon: Terrify).
- Effect `borrowApparel` (rules/store.mjs; `awakeningGain` with `@copyName`): the Absorbed Character's equipped Top Layer
  is copied on, yours unequipped, until that Absorption Stack is lost (registerBorrowHooks).

## More vocabulary (6F17): the Absorb Maneuver

- The Absorb Maneuver has its effect (MANEUVER_PIECES; combat/absorb.mjs): effect `absorbManeuver` against your target
  in Melee Range: Strike vs Strike/Dodge (a loss provokes its Exploit), then Corporeal: a loss leaves it Shaken until the
  end of its next turn, a win takes it out of the Combat Encounter (combatant removed, token hidden) and gives you a
  Temporary Level 2 Absorption Stack holding it. Resource `goop`: a Goop of yours makes it from its Square with your
  rolls, and is Defeated on a success (Assimilation 3).

## More vocabulary (6CS1): Custom Species, first batch

- `@piloting` (1: you pilot a Battle Jacket). The `rolled` event has `@reacted.<fx ref>` (the effects that reacted to that
  roll). `maneuverUsed` has `@tag_<tag>` for the item's tags (tagItem: a Racial Technique Unique Ability).
- `allyGuard.defeatKeep` (with `@to.*`): an Ally's Defeating Damage stops 1 LP above Defeat, and the giver loses those
  LP. `block.armed` (no Armed attacks, no Weapon equipped) and `block.grapple`. `suddenStop.extra` (more Squares off) and
  `suddenStop.free` (no Counter Action when an Opponent moves you, once per Round).
- Events `allyDodged` (an attack missed an Ally: `@allyDistance`, `@vs.*` the attacker) and `techniqueCopied` (`@kpCost`).
- Effects `initiativeShift` (value ±, resource "set"; back at the end of the Round) and `tempGrant` (resource
  "<type>:<Name>": that compendium item for this Combat Encounter).
- A Custom Species effect labelled "(Twinned)" works only while that Trait is Twinned (system.twinned).

## More vocabulary (6CS2): Custom Species, second batch

- Events `opponentMoved` (an Opponent of yours moved, however far: `@squares`, `@provokes`, `@leftMine`) and
  `endOfEncounter` (the Combat Encounter ended: onCombatDeleted).
- `collision.ignoreRound`: the first Collision Damage of each Combat Round is 0. Effect `extendTimed` (resource: the
  kind, "dot"; value n): those timed entries last n more of their moments (skip). `tempGrant` resource
  "pick:<type>:<max TP>": one compendium item picked, until the end of the Combat Round (flags.dbu-rpg.roundTemp).
- `jacket.*` pieces see `@ownerPL` (the pilot's Power Level) and skip "(Twinned)" pieces of a Trait that is not Twinned.
  `stressReq.tag.<tag>`: ± the Stress Test Requirement of the Transformation tagged so. Inner Nature: every Form brings
  its Rampage Form Evolved Stage (rules/grants.mjs rampageStages).

## More vocabulary (6CS3): limits shared across effects, free tagged items

- A limit part may carry its own key: "1/Encounter, 1/Round@killerinstinct2" — that part counts under
  `killerinstinct2`, shared by every effect that names it (one of Killer Instinct 2's four per Round).
- `kpCost.tagFree.<tag>`: the item carrying that tag costs no KP. `maneuverUsed` has `@kpBase` (its KP Cost before a
  tag made it free).

## More vocabulary (6CS4): late Skill Ranks, one-use Signatures

- `@ranksNow.<skill>` (a late variable, on the late-pass targets): the Skill Ranks with the ones effects give
  (`skillRank.<skill>`).
- `stp` (Spontaneous Technique Points) and `flag.tcBaseZero`. Effect `tempItem` resource "signature!oneUse": a Signature
  for this encounter, spent when used (refused again) and removed at the end of that turn; with `flag.tcBaseZero` it
  starts at 0 TP with no 8 TP floor; above your `stp` its sheet warns.

## More vocabulary (6T1): Transformations and Awakenings, first batch

- `useInstant.<slug>` (that Maneuver's Use button charges no Action: an Instant Maneuver for you) and `useInstant.ua1`
  (a Unique Ability of 1 Action). The Use button of a Maneuver in use-costs.mjs OWN_FLOW (Stance, Hype, Analysis...) charges
  nothing anyway, and the system does not count Special Maneuvers' uses per Round.

## More vocabulary (6T2): God Maneuver frequency, Initiative order, Awakening Stacks

- `godFreq.<slug>` (n): that God Maneuver is n/Round with no per-Encounter limit (combat/divine.mjs frequencyProblem).
- `initiativeShift` resource "first" / "last": before / after every other combatant this Round (ties by the Initiative
  before). Effects `rerollInitiative` and `awakeningLose` (resource: the Awakening; value n, 0 = every Stack).
- `copyStack` resource "<List>|<Awakening>|<level>|all": a Temporary Stack for each copy not held, up to 3 such Stacks.
  `@dnaStacks`: the Absorption Stacks holding one of your DNA Copies.

## More vocabulary (6T3): Conditions gained, Bonus Momentum, forbidding Combat Recovery / Empower

- Event `conditionGained`: you gain a Combat Condition, or more stacks of it (actor.setCondition). `@cond_<key>` = 1,
  `@level` (the stacks now), `@added`. A Transformation effect that works while you are not in it ("enter this
  Transformation when you gain Sleeping") needs `"always": true` on its trigger.
- Event `bonusMomentum`: you gained Bonus Momentum (other = the Opponent you knocked through a Health Threshold).
- `block.combatRecovery` / `block.empower` (value 1): that Maneuver is refused (with the effect's name), as the other
  `block.*` targets. "Using it forbids the Combat Recovery this Round" → a `resourceSet` in the same ask group and a
  `block.combatRecovery` piece conditioned on that resource, reset at `endOfRound`.
- "<God Maneuver> loses the [1/Round] Keyword" → `godFreq.<slug>` `99`.

## More vocabulary (6T4): Vengeful / Primal Surges, marks by distance, Teammates

- `flag.vengefulSurge` / `flag.primalSurge`: every Surge asks which kind it is. A Vengeful Surge regains 1d10(T)
  (+ `surge.vengefulDice`, dice allowed) + Surgency LP and KP, then every Opponent within 4 (+ `surge.vengefulRange`)
  Squares loses the Dice Score in LP (+ half your Surgency for those carrying your Inferior mark with
  `surge.vengefulInferiorHalf`). A Primal Surge regains 2d10(T) + Surgency LP and KP. Both count as a Healing and a Ki
  Surge (`surge` event: `@healingSurge` 1, `@kiSurge` 1, plus `@vengefulSurge` / `@vengefulScore` or `@primalSurge`);
  `surge.healMult` / `surge.kiMult` (a `with`) multiply their LP / KP. Maneuver keys `vengefulSurge` / `primalSurge`.
- `@markNearest.<slug>`: Squares to the nearest Character carrying that mark of yours (0 when none is in the encounter):
  "an Inferior within a Large Sphere" → `@markNearest.inferior >= 1 && @markNearest.inferior <= 4`.
- `@allyHasAwk.<slug>` on the ally events (allyHit, allyDamaged, allyDefeated, allyRoll...): the Ally of the event has
  that Awakening ("a Teammate" = `@allyHasAwk.teamdynamic == 1`). `@vs.awk.<slug>`: the other Character has it
  (`intervene.noCounter` with `@vs.awk.teamdynamic == 1`).

## More vocabulary (6T5): the defender's Clash boxes, other Clash keys, Intuit

- A Clash's defender now gets its asked / paid / amount boxes too (`mode: "ask"`, `cost`, `amount` on `clash.*` pieces
  with `@initiated == 0`): a dialog on the client of its answering user (an active player owning it, else the GM), by
  socket when that is another client (60 s, then only its automatic pieces). It pays and counts there. "When an Opponent
  starts a Clash against your Cognitive Save, spend 5(bT) KP to win it" → `{ "target": "clash.autoWin", "value": "1",
  "condition": "@initiated == 0 && @clash_cognitive == 1", "mode": "ask", "cost": "ki:5(bT)", "limit": "1/Round" }`.
- `clashAlt.<key>` / `clashAltDef.<key>` (text: another Clash key): that key may be rolled in its place, the better one
  rolled (`clashAltDef`: only in a Clash the other Character started). "Roll Clairvoyance in place of Use Magic" →
  `clashAlt.useMagic` `clairvoyance`; "an Opponent's Clash against your Cognitive Save may use your Impulsive Save" →
  `clashAltDef.cognitive` `impulsive`.
- The Intuit Maneuver marks its target `Seen` until the end of your next turn (`@vs.mark.seen`), with +2 Skill / +1(T)
  Save in your Clashes against a Seen Opponent.

## More vocabulary (6T6): Ki Points over the maximum, Opponents below Thresholds, Allies next to the target

- `kiOverMax` (n): Ki Points may be regained up to the maximum + n (`sys.ki.cap`; every KP regain and the update clamp
  use it). "Your Ki Points may exceed your Maximum" → `99999` (with `lifeOverMax` `99999` for Life Points too).
- `@opponentBelowMax` / `@opponentBelowMin`: the most / fewest Health Thresholds an Opponent of your encounter is below
  (0 without Opponents). "While an Opponent is below Injured" → `@opponentBelowMax >= 2`; "while every Opponent is below
  Bruised" → `@opponents >= 1 && @opponentBelowMin >= 1`.
- "An Opponent with one of your Allies adjacent to it" (you not counted) →
  `@vs.opponentsAdjacent - min(1, max(0, 2 - @vs.distance)) >= 1`.

## More vocabulary (6T7): Thresholds for your own effects, hidden Guard Down, marks by side, your top Form

- `belowAtLeast` (n, highest wins), `belowShift` (+n) and `belowAtMost` (n, lowest wins) change the `@below` your own
  effects read (0..3); their conditions read the real one, and the others' effects (`@vs.below`) still see the real one
  (`@belowForOthers`). "Always under the Critical Threshold for your effects" → `belowAtLeast` `3`; "treat yourself as
  Healthy" → `belowAtMost` `0`; "also in the Threshold below" → `belowShift` `1`.
- `flag.guardDownHidden`: your Guard Down is not a Combat Condition for the others' effects (`@vs.cond.guardDown`,
  `@vs.anyCond`, `@opponentsCond.guardDown`).
- `@markedOpponents.<slug>` / `@markedAllies.<slug>`: how many Opponents / Allies of your encounter carry that mark of yours.
- `@activeFormTopReq` (highest ToP Requirement of the Forms you are in) and `@formTopReqMax` (of every Form you have):
  "in your Form with the highest ToP Requirement" → `@activeFormTopReq >= 1 && @activeFormTopReq >= @formTopReqMax`.

## More vocabulary (6T8): where your Health Thresholds are, Compelled without its costs

- `thresholdPct.bruised` / `.injured` / `.critical` (percent of Max LP; the lowest piece wins): your Health Thresholds
  there (`sys.thresholdFractions`: the sheet, @below, the Steadfast marks, Damage crossings and Bonus Momentum read it).
  "Bruised at 3/4, Injured at 1/2, Critical at 1/4" → `75`, `50`, `25`; "halve your Health Thresholds" → `25`, `12.5`, `5`.
- `flag.compelledNoWager` / `flag.compelledNoLife`: the start-of-turn Compelled reminder drops the minimum Ki Wager / the
  Life Point loss.

## More vocabulary (6T9): Legendary Surge, Ki Surge as Healing, no Counter Actions for your effects

- `flag.legendarySurge`: a Ki Surge asks whether to be a Legendary Surge (2d10(T) + Surgency KP, then Surging until the
  end of your turn; a Ki Surge for Traits: `surge` event with `@kiSurge` 1, `@healingSurge` 0, `@legendarySurge` 1).
  Maneuver key `legendarySurge`.
- `flag.kiSurgeAsHealing`: a Ki Surge used through an effect's button may be a Healing Surge instead (the button asks).
- `flag.countersZero`: your effects read `@counters` as 0.
- "Roll 1d10 at the start of your turn; on a 10 skip <another effect>" → a `roll` trigger at `endOfTurn` (and
  `startOfEncounter`) setting a resource to `min(1, max(0, @rollNatural - 9))`, plus `fxOff.<ref>` conditioned on it.

## More vocabulary (6T10): marks everyone carries, Teammates next to the target

- `markAll.<slug>` (every Opponent counts as carrying that mark of yours: "every Opponent counts as your Focus" →
  `markAll.focus`), `markAllChars.<slug>` (every other Character) and `markCompelled.<slug>` (the Character you are
  Compelled toward). They show in `@vs.mark.<slug>` (not in `@marks.*` / `@markNearest.*`).
- `@vs.allyAdjAwk.<slug>`: how many Characters of your side, you aside, adjacent to the other Character possess that
  Awakening ("an Opponent adjacent to a Teammate" → `@vsAny.allyAdjAwk.teamdynamic >= 1` on attack pieces).

## More vocabulary (6T11): Giga Flare, Super Combination, Genki in the attack flow

- The attack dialog shows "Actions through the Super Profile" when the Signature (or an `attack.superProfile.*` piece of
  yours) may be Giga Flare / Super Combination. Giga Flare: up to 2 Actions, each +2 Energy Charges (after the maximum)
  and +2(T) KP; Super Combination: any number, each +1 Energy Charge and a rank of Alotta Lotta Attacks / Peppering Blows
  (noted on the card). Genki: every Lifeforce stack (`@res.lifeforce`) is lost at declaration, +2(bT) Wound each
  (`attack.genkiWound`). Cataclysmic Attack's AoE is the whole Battlefield: the player targets every Character in it.

## More vocabulary (6T12): Charging Assault and Splitting in the attack flow

- Charging Assault (a Signature's Advantage, or added by `attack.advantage.chargingAssault`): the dialog asks the Squares
  moved in a straight line (the token is moved on the map): +1 Wound per Square after the 3rd, at most 2(T);
  `chargingAssault.capT` (n) raises that cap to n(T) (the highest wins).
- Splitting: -1(T) Wound per target after the first (2 targets at rank 1, 4 at rank 2).

## More vocabulary (6T13): the marked Opponent's Maneuvers, its Boosted Speed

- "The <marked> Opponent's other Maneuvers offer the Exploit" → an `opponentManeuver` trigger (Power Up, Energy Charge,
  Surges, the Transformation Maneuver, Combat Recovery and the Maneuver items it uses: `@by_<slug>`, `@distance`, `@oos`,
  `@vs.*`) with `effect` `maneuver`, `resource` `exploit`, `cost` `counters:1`; "moving away from you" → `opponentLeftMelee`.
- `@vs.speedBoosted`: the other Character's Boosted Speed ("your Boosted Speed exceeds every target's" →
  `@aptitudes.speedBoosted > @vsMax.speedBoosted`).

## More vocabulary (6T14): Aspect maximums, God Ki as Superior, top Legendary / Transcended

- `aspectMax.<key>` (on a Transformation; its condition sees `@M` / `@G`): that Aspect may reach this level (the Grade's
  "LV G" and the summed Aspects): "the Growth Aspect may reach 4 levels" → `aspectMax.growth` `4`.
- `flag.godKiAsSuperior`: a trigger effect that would put you in God Ki puts you in the Superior State instead (same duration).
- `@legendTransTopReq`: the highest ToP Requirement of your active Legendary Forms and Transcended Enhancements.
- `flag.countersZero` conditions may read `@lifeMax` ("at full Life Points": `@life >= @lifeMax`).

## More vocabulary (6T15): the Class Special Maneuvers

- Roar keeps the `Pumped` resource (`@res.pumped`, until the end of your next turn: +1(T) Combat Rolls and Speeds,
  -1(T) Soak); Draconic Infusion keeps `Infused` (`@res.infused`: +1(T) Surgency, Wound, DR, -1(T) Defense Value and
  Speeds); Dark Beam's Clash (Cognitive vs Impulsive/Corporeal, not in your Melee Range) marks the target `Doomed`
  (`@vs.mark.doomed`, `@marks.doomed`) until the start of your next turn; Mighty Breeze marks your Allies within 4 Squares
  `Mighty` (`@to.mark.mighty` on `ally.*` pieces: +1(T) Soak and DR) until the start of your next turn; Divine Blessing
  heals the Allies within 3 Squares by your Surgency and, through a Clash each, takes it from the Opponents there.
  The Curse Modifier Maneuver is not in the compendium. The Doomed +2(T) Damage taken is the GM's.

## More vocabulary (6T16): your Minions, Doomed's Damage

- "Your Minions get +1(T) Combat Rolls" → `{ "target": "ally.combat", "value": "1(T)", "condition": "@to.myMinion == 1" }`
  (a Minion whose `minionOf` is you, in the encounter). `@myMinions`: how many of them are in the encounter.
- Dark Beam's Doomed now also gives the Doomed Opponent `vs.damageTaken` 2(T) (a `foe.vs.damageTaken` piece): every
  attack's Damage against it +2(T).

## More vocabulary (6T17): areas on the map, the receiver's Power Level

- `@onArea.<kind>` (your token's center is in an area of that kind: the `placeArea` kinds, lowercase: `metallic`,
  `obscured`, `glass`, `bog`...), `@vs.onArea.<kind>` (the other Character's) and `@to.onArea.<kind>` (the Character an
  `ally.*` / `foe.*` piece goes to; worked out at once). "On a Metallic Square: +1(T) Soak" → `@onArea.metallic >= 1`;
  "Opponents on Metallic Squares -1(T) Combat Rolls" → `foe.combat` with `@to.onArea.metallic >= 1`.
- `@to.pl`: the Power Level of the Character an `ally.*` / `foe.*` piece goes to ("your Minions +2 Max LP per Power Level"
  → `ally.life.final` `2 * @to.pl` with `@to.myMinion == 1`). `jacket.life.final` / `jacket.ki.max` read the Jacket's `@PL`.

## More vocabulary (6T19): DNA Copies, whose turn it is

- `@dnaCopies` (how many DNA Copies you hold) next to `@dnaStacks`; both are worked out before the modifiers, so passive
  pieces may read them. `copies.max.<slug>` (n): that copy list holds up to n ("4 DNA Copies" → `copies.max.dnacopy` `4`).
- `@vs.isTurn`: it is the other Character's turn in its encounter ("during that Opponent's own turn").

## More vocabulary (6T20): making another effect optional

- `fxAsk.<ref>` (1): that effect's automatic pieces are asked instead (a trigger becomes a button, a modifier a box):
  "the 3rd effect of Bio-Berserker becomes optional" → `fxAsk.unstableclone_bioberserker_3`.
- "An AoE attack may leave out the Allies in it": the AoE's targets are the ones the player targets, so it is covered (a
  use limit is the player's).

## More vocabulary (6T21): the Frozen Turn, grants with a resource minimum

- The Time Freeze Unique Ability keeps the `Frozen Turn` resource (`@res.frozenturn`) during your Frozen Turn: "during a
  Frozen Turn, +1(T) Combat Rolls" → `combat` with `@res.frozenturn >= 1`.
- Grant qualifier `+res:<slug>:<n>`: the granted item works only while that sheet resource is n+ (a split resource such
  as Divine Battle Born counts what is placed on each roll too): "Divine Flame while you have 1+ Divine Battle Born" →
  `grant maneuver: Divine Flame +active +res:divinebattleborn:1`.

## More vocabulary (6T22): grants that follow a pick

- Grant qualifier `+picked:<Option>`: the granted item works only while that option of the granting item's choices is
  picked ("Draconic Infusion when the Warrior Class is picked" → `grant maneuver: Draconic Infusion +picked:Warrior`).

## More vocabulary (6T23): Charging Assault's bonus as a variable

- `@chargeWound` (attack pieces, `at: "wound"` too): the Wound bonus the attack's Charging Assault gives ("apply its
  Wound bonus once more" → an `attack.wound` box with value `@chargeWound`). `@category` is readable at `at: "wound"`.
- Unique Abilities' uses per Round are not counted by the system: "use X one more time per Round" is covered.

## More vocabulary (6T24): the Enhanced Search mark, dice counts from a formula

- The Enhanced Search Talent (5) now makes its own start-of-turn Clash (Perception/Clairvoyance vs Stealth/Concealment,
  a box against the target, 1/Round) through the item, so the Clash carries `@via_enhancedsearch`. A win marks the
  target `Marked` until the start of your next turn, and you get +1(T) Strike and Dodge against it. Effects that ask
  for the "Marked" Opponent read `@vs.mark.marked`.
- A trigger `roll` may take its number of dice from a formula: `"(@T)d6"` (Td6). Write `"value": "@roll"`, not
  `"@roll * @T"`.
- An Opponent's Movement Maneuver: `opponentManeuver` with `@by_movement == 1` (`@vs.*` is the one who moved).

## More vocabulary (6T25): keep the higher roll, Damage dealt, marks next to a Character, attack flags

- `reroll` with `resource: "high"`: the Base Die is rolled again and the higher result stands, Critical dice included
  ("roll it twice and apply the higher"). Clashes on the "roll" event: `@inClash`, `@initiated`, `@clash_<save/skill>`.
- `vs.damageDealtMult` (attacker side, automatic): multiplies the Damage you deal to that Character
  (`@vs.minion == 1` → "double the Damage Minions take from you").
- `@vs.markAdj.<slug>`: how many Characters carrying that mark of yours are adjacent to it (it and you aside).
  `@markNearest.<slug>` is the distance to the nearest one. It is 0 when nobody carries the mark, so write `== 1` for
  "adjacent", never `<= 1`.
- `flag.costNoCapacity`: your attacks' Ki Point Cost lowers no Capacity (the Ki Wager still does).
  `flag.crossCounterFullDv`: Cross Counter does not halve your Defense Value.
  `block.energyAttack` / `block.magicAttack`: those attacks are refused.
- A trigger Clash of a Transformation item is made through it (`@via_<transformation slug>`): `clash.might` with
  `@via_beatdownspecialist == 1 && @initiated == 1` only counts in those Clashes.

## More vocabulary (6T26): Super Stacks counted as, Weights worn, Racial Requirements in use, Light Level, Alignment

- `superStacks.countAs` (lowest wins): you count as possessing at most that many Super Stacks, for the Muscle
  Penalty and for `@superStacks`.
- `@weightsWorn`: pieces of Weights Apparel worn ("cannot enter while wearing Weights" → `enterBlock` with
  `@weightsWorn >= 1`).
- `@activeRace.<race>`: the Forms and Enhancements you are in that have that Racial Requirement (slug: "saiyan",
  "namekian"...). It counts the item itself, so "another Saiyan Transformation" is `>= 2` on a Saiyan item.
- `@vs.lightLevel`: the Light Level where that Character is, with its own shifts.
- `@opponentsOppositeAlign`: Opponents of the encounter with the opposite Z-Soul Alignment (Good against Evil; 0 while
  you are Neutral).
- New variables a piece's condition reads must sit in the early `data` object of rules/derived.mjs (before the modifier
  stages). The final `sys.rollData` is only seen by triggers, rules and later reads.

## More vocabulary (6T27): Surges that do not count, Unique Ability picks, SKI / STR worked out

- `with: "surge.uncounted=1"` on a "maneuver" effect of a Surge: that Surge does not count toward the Surge
  Maneuver's own uses. No warning, and the sheet's "Surge used" box stays as it was.
- Maneuver keys `uaStd` / `uaTechnical` / `uaMagical`: one of your Unique Abilities that is a 1-Action Standard
  Maneuver (any, Technical, Magical; "Technical/Magical" counts for both), Out-of-Sequence. Use them instead of
  `standard` when the effect only allows Unique Abilities.
- `@res.ski` / `@res.str` are worked out by the system: the Power Level Character Perks exchanged into Skill
  Improvements / Attribute Additions. `@res.stilllearning` / `@res.onthepath` are 1 when every one of them was.
  These replace the sheet resources the player used to set by hand.

## More vocabulary (6T28): stacks treated as other stacks, Ranks with effects, Power Battery ignored

- `resAdd.<resource slug>` (stage -1): adds to `@res.<slug>` for every effect ("Tension stacks count as 1 higher",
  "the 9th Crusher Point counts as 2", "Divine Warrior Blood is treated as Warrior Blood"). `resAdd.power` adds to
  `@power` ("All-Out Power stacks are treated as Power"). The sheet's values stay in `@resBase.<slug>` /
  `@powerBase`. An effect excluded from the rule ("except this Trait") reads those.
- `@ranksNow.<skill>` is also in the trigger data (Ranks with the `skillRank.<skill>` pieces). `resMax.*` /
  `resMaxSet.*` may read it and the other late variables, since the resource maximums come after the late pass.
- `with: "surge.ignoreKiMult=1"` on a Ki Surge: that Surge ignores the sheet's `surge.kiMult` (Power Battery's 0).
- Bucket keys of prefix targets are stored in lowercase (`resadd.tension`): code reading them matches case-insensitively.

## More vocabulary (6T29): losses without Reduced Momentum, who inflicted a Condition

- `nmlife:<n>` cost (or `nmlp:`): Life Points paid whose Health Thresholds give no Reduced Momentum. Their Steadfast
  Checks are still rolled. `safelife:` also passes the Checks.
- A "life" effect with `resource: "noMomentum"`: the same for that loss. It combines with "safe" / "silent".
- `flag.attackLifeNoMomentum`: paying only an attack's Life Point Cost (`attackLifeCost`, Kaioken) gives no Reduced
  Momentum.
- "inflict" (on the giver) fires for the Conditions of trigger effects, Unique Ability / Maneuver buttons, Condition
  Advantages, Grapples, and every `runOps` condition op with `by: <uuid>` (Gravity Cage's Prone). It also records
  `condBy`. Only a Condition set by hand on the sheet fires nothing.

## More vocabulary (6T30): what Allies picked, ranges

- `@allyPicked.<option slug>`: how many Allies of your encounter picked that option in a Transformation's choices
  ("if any of your Allies possess this Trait, lose the 4th and 5th effects" → `fxOff.<ref>` with
  `@allyPicked.teamcaptain >= 1`).
- Ranges: Melee Range is `1 + @aptitudes.meleeReach`; Long Range starts at `@aptitudes.longRange` (9 + modifiers).
  "Not at Long Range" is `@vs.distance < @aptitudes.longRange`.
- `otherTurnStart` (another Character's turn starts, `@vs.*` of that Character) covers "at the start of an Opponent's
  turn".
- The system does not limit an attack's or a Unique Ability's targets by range: "may target outside your Melee Range"
  needs nothing.
- Copy Being and the Advantages of a United Attack's Signatures are not run by the system (Mimicry Program 3 and
  Technician 6 stay with the GM).
