import { DBU } from "../config.mjs";
import { intField, modifiersField, triggersField } from "./fields.mjs";
import { prepareActorData } from "../rules/derived.mjs";
import { validateActor } from "../rules/validation.mjs";
import { computeAlerts } from "../rules/alerts.mjs";
import { AGE_CATEGORIES, INJURY_TYPES, STANCES } from "../optional-rules.mjs";
import { FUSION_METHODS } from "../fusion/fusion-rules.mjs";

const { ArrayField, BooleanField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const attr = () => new SchemaField({
      points: intField(0, { min: 0 }),
      bonus: intField(0)
    });
    const skills = {};
    for ( const key of Object.keys(DBU.skills) ) {
      skills[key] = new SchemaField({
        racial: intField(0, { min: 0, max: 1 }),
        ranks: intField(0, { min: 0 }),
        bonusRanks: intField(0, { min: 0 }),
        bonus: intField(0),
        label: new StringField({ blank: true, initial: "" })
      });
    }
    const conditions = {};
    for ( const [key, c] of Object.entries(DBU.conditions) ) conditions[key] = intField(0, { min: 0, max: c.max });
    const states = {};
    for ( const [key, s] of Object.entries(DBU.states) ) states[key] = intField(0, { min: 0, max: s.levels });
    const threshold = () => new StringField({ blank: true, initial: "", choices: ["", "pass", "fail"] });

    return {
      pl: intField(1, { min: 1, max: 30 }),
      details: new SchemaField({
        player: new StringField({ blank: true, initial: "" }),
        concept: new StringField({ blank: true, initial: "" }),
        age: new StringField({ blank: true, initial: "" }),
        gender: new StringField({ blank: true, initial: "" }),
        height: new StringField({ blank: true, initial: "" }),
        weight: new StringField({ blank: true, initial: "" }),
        hair: new StringField({ blank: true, initial: "" }),
        eyes: new StringField({ blank: true, initial: "" }),
        skin: new StringField({ blank: true, initial: "" }),
        size: new StringField({ initial: "medium", choices: DBU.SIZE_ORDER }),
        biography: new HTMLField({ blank: true, initial: "" }),
        notes: new HTMLField({ blank: true, initial: "" })
      }),
      attributes: new SchemaField({
        ag: attr(), fo: attr(), te: attr(), sc: attr(), in: attr(), ma: attr(), pe: attr()
      }),
      skills: new SchemaField(skills),
      perks: new SchemaField({
        attribute: intField(0, { min: 0 }),
        talent: intField(0, { min: 0 }),
        skill: intField(0, { min: 0 })
      }),
      life: new SchemaField({ value: intField(62) }),
      ki: new SchemaField({ value: intField(50) }),
      capacity: new SchemaField({ value: intField(20) }),
      // Divine Ki Points (God Ki): the maximum is derived; combat = the Combat Encounter they were filled for;
      // prefer = pay Ki Point costs with them while in the God Ki State
      dkp: new SchemaField({
        value: intField(0, { min: 0 }),
        combat: new StringField({ blank: true, initial: "" }),
        prefer: new BooleanField({ initial: false })
      }),
      karma: new SchemaField({ value: intField(2, { min: 0 }) }),
      // Adventuring Maneuvers: uses this Adventuring Session (per maneuver, and per target for those that count it)
      // and the world time a Stretch was done (it helps if a Combat Encounter starts within the hour)
      adventure: new SchemaField({
        uses: new ArrayField(new SchemaField({
          key: new StringField({ blank: true, initial: "" }),
          n: intField(0, { min: 0 })
        })),
        stretchAt: new NumberField({ nullable: true, initial: null })
      }),
      tp: new SchemaField({
        bonus: intField(0),
        spentOther: intField(0)
      }),
      equipmentPoints: new SchemaField({ spent: intField(0, { min: 0 }) }),
      zsoul: new SchemaField({
        alignment: intField(0, { min: -2, max: 2 }),
        quote: new StringField({ blank: true, initial: "" }),
        description: new HTMLField({ blank: true, initial: "" })
      }),
      thresholds: new SchemaField({ bruised: threshold(), injured: threshold(), critical: threshold() }),
      combat: new SchemaField({
        power: intField(0, { min: 0 }),
        powerUps: intField(0, { min: 0 }),
        superStacks: intField(0, { min: 0 }),
        actions: intField(3, { min: 0 }),
        counters: intField(1, { min: 0 }),
        dimDefense: intField(0, { min: 0 }),
        attacksThisRound: intField(0, { min: 0 }),
        energyCharges: intField(0, { min: 0 }),
        holdingBack: intField(0, { min: 0 }),
        dot: intField(0, { min: 0 }),
        topBoost: intField(0),
        stressBonus: intField(0),
        hidden: new BooleanField({ initial: false }),
        momentumUsed: new BooleanField({ initial: false }),
        reducedMomentum: new BooleanField({ initial: false }),
        surgeUsed: new BooleanField({ initial: false }),
        willToSurviveUsed: new BooleanField({ initial: false }),
        ultimatesUsed: intField(0, { min: 0 }),
        absoluteAttacks: intField(0, { min: 0 }),
        // A Burst Limit was triggered this Combat Encounter (1/Encounter)
        burstUsed: new BooleanField({ initial: false }),
        legendRealized: new ArrayField(new StringField()),
        // Energy Charges and Surges used this Combat Round; times an attack damaged you since the start of your last turn
        // (@chargesRound, @surgesRound, @damagedSinceTurn)
        chargesRound: intField(0, { min: 0 }),
        surgesRound: intField(0, { min: 0 }),
        // F11 Healing Surges used this Combat Round (@healingSurgesRound)
        healingSurgesRound: intField(0, { min: 0 }),
        damagedSinceTurn: intField(0, { min: 0 })
      }),
      resources: new ArrayField(new SchemaField({
        name: new StringField({ blank: true, initial: "" }),
        value: intField(0, { min: 0 }),
        max: intField(0, { min: 0 }),
        target: new StringField({ blank: true, initial: "" }),
        perStack: new StringField({ blank: true, initial: "1(T)" }),
        // Split resources (Battle Born...): each stack sits on one Combat Roll
        split: new BooleanField({ initial: false }),
        alloc: new SchemaField({ strike: intField(0, { min: 0 }), dodge: intField(0, { min: 0 }), wound: intField(0, { min: 0 }) }),
        unassigned: intField(0, { min: 0 }),
        cap: intField(2, { min: 0 }),
        lowest: new BooleanField({ initial: false }),
        force: new StringField({ blank: true, initial: "", choices: ["", "strike", "dodge", "wound"] })
      })),
      conditions: new SchemaField(conditions),
      states: new SchemaField(states),
      customModifiers: modifiersField(),
      customTriggers: triggersField(),
      settings: new SchemaField({
        validate: new BooleanField({ initial: true }),
        creation: new BooleanField({ initial: false })
      }),
      /** Situational tests the rules still demand (e.g. "stressTest" after a failed Steadfast while transformed). */
      pending: new ArrayField(new StringField()),
      /** Data used only by the Optional Rules enabled in the world settings. */
      optional: new SchemaField({
        physicalAge: new StringField({ initial: "peak", choices: AGE_CATEGORIES }),
        mentalAge: new StringField({ initial: "peak", choices: AGE_CATEGORIES }),
        mini: intField(0, { min: 0 }),
        gravityAcclimatization: intField(0, { min: 0, max: 6 }),
        gravityOverride: intField(-1, { min: -1, max: 6 }),
        injuries: new ArrayField(new SchemaField({
          type: new StringField({ initial: "internal", choices: INJURY_TYPES }),
          severity: new StringField({ initial: "minor", choices: ["minor", "major"] }),
          ignored: new BooleanField({ initial: false })
        })),
        stance: new StringField({ blank: true, initial: "", choices: ["", ...STANCES] }),
        styleTalents: intField(0, { min: 0, max: 2 }),
        martialLevel: intField(0, { min: 0, max: 5 }),
        godLevel: intField(0, { min: 0, max: 10 }),
        legendPerks: new SchemaField({
          self: intField(0, { min: 0 }), technique: intField(0, { min: 0 }),
          talent: intField(0, { min: 0 }), exceed: intField(0, { min: 0 })
        }),
        verticality: intField(0, { min: 0 }),
        ngCharacter: new BooleanField({ initial: false }),
        boughtProfiles: new ArrayField(new StringField()),
        rolledLife: intField(0, { min: 0 }),
        burstOfPower: new BooleanField({ initial: false }),
        desperationUsed: new BooleanField({ initial: false }),
        role: new StringField({ blank: true, initial: "" }),
        horde: new BooleanField({ initial: false })
      })
    };
  }

  /** @override */
  static migrateData(source) {
    if ( source.karma && (source.karma.value > 4) ) source.karma.value = 4;
    return super.migrateData(source);
  }

  /** @override */
  prepareDerivedData() {
    prepareActorData(this, this.parent);
    this.validation = this.settings.validate ? validateActor(this, this.parent) : [];
    this.validationCounts = {
      error: this.validation.filter(v => v.level === "error").length,
      warning: this.validation.filter(v => v.level === "warning").length
    };
    this.alerts = computeAlerts(this, this.parent);
  }

  /** Data exposed to Roll formulas and modifier formulas (@T, @bT, @fo, ...). */
  getRollData() {
    return this.rollData ?? {};
  }
}

/* -------------------------------------------- */

/**
 * A Fusion (dbu-rpg.com/fusion): built from its Fused Characters by the synchronization (module/fusion/fusion.mjs).
 * Its Power Level may exceed 30 (only for Life/Ki Points and Capacity; the base ToP stops at 7).
 */
export class FusionData extends CharacterData {
  static defineSchema() {
    const schema = super.defineSchema();
    schema.pl = intField(1, { min: 1, max: 60 });
    schema.karma = new SchemaField({ value: intField(0, { min: 0 }) });
    const score = () => intField(1, { min: 1 });
    schema.fusion = new SchemaField({
      method: new StringField({ initial: "metamorese", choices: Object.keys(FUSION_METHODS) }),
      components: new ArrayField(new StringField()),
      dance: new StringField({ initial: "success", choices: ["success", "plump", "frail"] }),
      modifiers: new ArrayField(new StringField()),
      balanced: new ArrayField(new StringField()),
      fusedTechnique: new BooleanField({ initial: true }),
      forgoApparel: new BooleanField({ initial: false }),
      sizeUp: new BooleanField({ initial: false }),
      size: new StringField({ blank: true, initial: "" }),
      autoSync: new BooleanField({ initial: true }),
      // Kept between synchronizations (Repeating Fusions)
      picked: new BooleanField({ initial: false }),
      traits: new ArrayField(new StringField()),
      awakenings: new ArrayField(new StringField()),
      fusedForms: new ArrayField(new StringField()),
      scores: new SchemaField({ ag: score(), fo: score(), te: score(), sc: score(), in: score(), ma: score(), pe: score() }),
      tp: intField(0, { min: 0 }),
      syncedAt: intField(0, { min: 0 }),
      // In play
      active: new BooleanField({ initial: false }),
      roundsLeft: intField(0, { min: 0 }),
      topReduced: new BooleanField({ initial: false }),
      karmaStart: intField(0, { min: 0 }),
      stressSaveUsed: new BooleanField({ initial: false })
    });
    return schema;
  }

  /** @override A Fusion may hold the Karma Points of all of its Fused Characters (more than 4). */
  static migrateData(source) {
    return foundry.abstract.TypeDataModel.migrateData.call(this, source);
  }
}

/* -------------------------------------------- */

export class NpcData extends CharacterData {
  static defineSchema() {
    const schema = super.defineSchema();
    // Boss: a villain who may enter Forms above its Tier of Power (Final Form Frieza, Perfect Cell...)
    schema.npcType = new StringField({ initial: "adversary", choices: ["adversary", "boss", "minion", "battleJacket", "other"] });
    // MO: whose Minion it is (the Leader's actor uuid): "your Minions" effects (@to.myMinion, @allyMyMinion); BJ: whose Battle
    // Jacket it is (its owner's "jacket.<target>" pieces apply to it)
    schema.minionOf = new StringField({ initial: "" });
    schema.settings = new SchemaField({
      validate: new BooleanField({ initial: false }),
      creation: new BooleanField({ initial: false })
    });
    return schema;
  }
}

/* -------------------------------------------- */

/**
 * An Adversary (dbu-rpg.com/adversaries): a Standard, Elite or Villain enemy whose benefits scale with the PCC, counted
 * from the Player Characters of its Combat Encounter or set by hand (module/rules/adversary.mjs).
 */
export class AdversaryData extends CharacterData {
  static defineSchema() {
    const schema = super.defineSchema();
    // Villainous Karma: none at Character Creation and no limit (it comes at the start of each Combat Encounter)
    schema.karma = new SchemaField({ value: intField(0, { min: 0 }) });
    schema.settings = new SchemaField({
      validate: new BooleanField({ initial: false }),
      creation: new BooleanField({ initial: false })
    });
    schema.adversary = new SchemaField({
      category: new StringField({ initial: "villain", choices: ["standard", "elite", "villain"] }),
      pccMode: new StringField({ initial: "auto", choices: ["auto", "manual"] }),
      pcc: intField(1, { min: 1, max: 20 }),
      // May enter Transformations above its Tier of Power (as the NPC "Boss")
      aboveTop: new BooleanField({ initial: true }),
      // Narrative Stamina left this Combat Round, spent before Ki Points and against Damage
      stamina: intField(0, { min: 0 }),
      staminaPays: new BooleanField({ initial: true }),
      staminaAbsorbs: new BooleanField({ initial: true }),
      // Without Capacity: Capacity is not spent nor checked (the Ki Wager stays within the Max Capacity)
      ignoreCapacity: new BooleanField({ initial: true }),
      // The PCC its current Life and Ki Points were last scaled for, and the encounter its Karma ran out in
      pccApplied: intField(0, { min: 0 }),
      karmaOut: new StringField({ blank: true, initial: "" })
    });
    return schema;
  }

  /** @override An Adversary has no limit on Karma Points. */
  static migrateData(source) {
    return foundry.abstract.TypeDataModel.migrateData.call(this, source);
  }
}
