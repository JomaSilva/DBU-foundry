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
