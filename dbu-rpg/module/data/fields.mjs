import { TRIGGER_DURATIONS, TRIGGER_EFFECTS, TRIGGER_EVENTS, TRIGGER_MODES, TRIGGER_TARGETS } from "../vocab/index.mjs";

const { ArrayField, BooleanField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

/** A list of rule modifiers carried by an Item (or by the Actor as "custom buffs"). */
export function modifiersField() {
  return new ArrayField(new SchemaField({
    target: new StringField({ required: true, blank: true, initial: "" }),
    value: new StringField({ required: true, blank: true, initial: "" }),
    condition: new StringField({ required: true, blank: true, initial: "" }),
    label: new StringField({ required: true, blank: true, initial: "" }),
    active: new BooleanField({ initial: true }),
    /** Applies even while the Transformation is not active (Permanent / Legendary Traits). */
    always: new BooleanField({ initial: false }),
    /** Attack options (targets "attack.*"): "" applied by itself, "ask" a box in the attack dialog; limit "1/Round"... */
    mode: new StringField({ required: true, blank: true, initial: "" }),
    limit: new StringField({ required: true, blank: true, initial: "" }),
    /** Option pieces (attack.*, vs.*, defense.*, clash.*, surge.*, recovery.*, charge.*): cost paid when picked (trigger
     * cost syntax, @n allowed), amount (the most @n the player may pick), group (pieces of one group form one box),
     * limitKey (a shared count of uses), at ("" at declaration, "wound" when the Wound Roll is made). Blank = unused. */
    cost: new StringField({ required: true, blank: true, initial: "" }),
    amount: new StringField({ required: true, blank: true, initial: "" }),
    group: new StringField({ required: true, blank: true, initial: "" }),
    limitKey: new StringField({ required: true, blank: true, initial: "" }),
    at: new StringField({ required: true, blank: true, initial: "" }),
    // RA: the boxes of one "exclusive" set: only one of them may be ticked in the attack dialog ("X or Y, not both")
    exclusive: new StringField({ required: true, blank: true, initial: "" }),
    // CC: a cost only checked when the attack is declared (summed with the other boxes'), paid later by the effect's triggers
    checkCost: new StringField({ required: true, blank: true, initial: "" }),
    // D1: the rules effect the piece comes from ("<item slug>_<Trait>_<n>", rules/fx.mjs)
    fx: new StringField({ required: true, blank: true, initial: "" }),
    // G1: an "ally.<target>" piece reaches only the Allies within this many Squares (blank: every Ally)
    range: new StringField({ required: true, blank: true, initial: "" })
  }));
}

/**
 * Turn/round triggers carried by an Item (or the Actor): applied by the combat automation.
 * event: startOfRound | endOfRound | startOfTurn | endOfTurn | startOfEncounter | stackGain (an Awakening gains a Stack)
 *   and the events of the attack flow, run by the GM: attackMade (you make an Attacking Maneuver), attackHit (your attack
 *   damages someone), damaged (an attack damages you), attackMissed / dodged (an attack misses), threshold (you cross a
 *   Health Threshold), transform (you enter a Transformation), grandAwakening (the Full Awakening Maneuver activates it),
 *   powerUp / surge / energyCharge (you use that Maneuver), stateEnter (you enter a State), targeted (an attack targets you)
 *   | use (an Activated Trait: a button of the actor sheet's Combat tab)
 * effect: life | ki | capacity | counters | actions | power (Power stacks) | charges (Energy Charges) | dot (Damage Over
 *   Time stacks) | dkp (Divine Ki Points) | resource | resourceSet | state | condition | maneuver (a button that uses that
 *   Maneuver Out-of-Sequence: powerUp, energyCharge, combatRecovery, healingSurge, kiSurge, empower, surge, basicAttack,
 *   signature, transformation; a list "powerUp|energyCharge|empower" asks which one) | message
 * mode: auto (apply) | ask (chat button) | remind (message only)
 * target: self | other (the other Character of the event: whom you hit, who hit you...; for "use", your target)
 * limit: "1/Round", "2/Encounter", "M/Encounter", "1/Round, 3/Encounter"... (counted in combat only)
 * limitKey: triggers with the same key share one count of uses
 * cost: paid when the trigger is used ("ki:2(bT); counters:1; res:Battle Born:all"); amount: the most `n` the player
 *   may pick (then @n in value and cost)
 * group: triggers of one group form one choice; roll: a dice formula rolled when it runs (@roll), rollKey: triggers with
 *   the same key share that roll; check: a check made before the effect, onCheck: "" / success | fail; with: one-shot
 *   buckets for the "maneuver" effect. Blank = unused.
 * The lists of events, effects, modes, targets and durations are in module/vocab/index.mjs.
 */
export function triggersField() {
  return new ArrayField(new SchemaField({
    event: new StringField({ initial: "startOfRound", choices: TRIGGER_EVENTS }),
    effect: new StringField({ initial: "life", choices: TRIGGER_EFFECTS }),
    value: new StringField({ required: true, blank: true, initial: "" }),
    resource: new StringField({ required: true, blank: true, initial: "" }),
    condition: new StringField({ required: true, blank: true, initial: "" }),
    mode: new StringField({ initial: "auto", choices: TRIGGER_MODES }),
    duration: new StringField({ initial: "none", choices: TRIGGER_DURATIONS }),
    label: new StringField({ required: true, blank: true, initial: "" }),
    target: new StringField({ initial: "self", choices: TRIGGER_TARGETS }),
    limit: new StringField({ required: true, blank: true, initial: "" }),
    limitKey: new StringField({ required: true, blank: true, initial: "" }),
    cost: new StringField({ required: true, blank: true, initial: "" }),
    amount: new StringField({ required: true, blank: true, initial: "" }),
    group: new StringField({ required: true, blank: true, initial: "" }),
    roll: new StringField({ required: true, blank: true, initial: "" }),
    rollKey: new StringField({ required: true, blank: true, initial: "" }),
    check: new StringField({ required: true, blank: true, initial: "" }),
    onCheck: new StringField({ required: true, blank: true, initial: "" }),
    with: new StringField({ required: true, blank: true, initial: "" }),
    // D1: the rules effect the piece comes from ("<item slug>_<Trait>_<n>", rules/fx.mjs)
    fx: new StringField({ required: true, blank: true, initial: "" }),
    // G2: target "allies" / "team": only the Allies within this many Squares (blank: every Ally)
    range: new StringField({ required: true, blank: true, initial: "" }),
    active: new BooleanField({ initial: true }),
    /** Runs even while the Transformation is not active (a Legendary Trait is possessed at all times). */
    always: new BooleanField({ initial: false })
  }));
}

/** Limited uses (x/Round, x/Encounter, x/Character). */
export function usesField() {
  return new SchemaField({
    value: new NumberField({ integer: true, min: 0, initial: 0 }),
    max: new StringField({ blank: true, initial: "" }),
    per: new StringField({ blank: true, initial: "", choices: ["", "round", "encounter", "character"] })
  });
}

/** Fields shared by every Item type. */
export function baseItemSchema() {
  return {
    description: new HTMLField({ required: true, blank: true, initial: "" }),
    summary: new StringField({ blank: true, initial: "" }),
    source: new SchemaField({
      slug: new StringField({ blank: true, initial: "" }),
      section: new StringField({ blank: true, initial: "" }),
      url: new StringField({ blank: true, initial: "" })
    }),
    modifiers: modifiersField(),
    triggers: triggersField()
  };
}

export function intField(initial = 0, options = {}) {
  return new NumberField({ required: true, nullable: false, integer: true, initial, ...options });
}
