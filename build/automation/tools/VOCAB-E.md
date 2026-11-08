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
