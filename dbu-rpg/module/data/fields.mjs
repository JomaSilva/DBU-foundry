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
    always: new BooleanField({ initial: false })
  }));
}

/**
 * Turn/round triggers carried by an Item (or the Actor): applied by the combat automation.
 * event: startOfRound | endOfRound | startOfTurn | endOfTurn | startOfEncounter
 * effect: life | ki | capacity | counters | actions | resource | resourceSet | message
 * mode: auto (apply) | ask (chat button) | remind (message only)
 */
export function triggersField() {
  return new ArrayField(new SchemaField({
    event: new StringField({ initial: "startOfRound", choices: ["startOfRound", "endOfRound", "startOfTurn", "endOfTurn", "startOfEncounter"] }),
    effect: new StringField({ initial: "life", choices: ["life", "ki", "capacity", "counters", "actions", "resource", "resourceSet", "state", "condition", "message"] }),
    value: new StringField({ required: true, blank: true, initial: "" }),
    resource: new StringField({ required: true, blank: true, initial: "" }),
    condition: new StringField({ required: true, blank: true, initial: "" }),
    mode: new StringField({ initial: "auto", choices: ["auto", "ask", "remind"] }),
    duration: new StringField({ initial: "none", choices: ["none", "endOfTurn", "startOfNextTurn", "endOfNextTurn", "endOfRound", "encounter"] }),
    label: new StringField({ required: true, blank: true, initial: "" }),
    active: new BooleanField({ initial: true })
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
