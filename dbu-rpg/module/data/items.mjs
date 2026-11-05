import { baseItemSchema, intField, usesField } from "./fields.mjs";
import { computeSignature } from "../rules/signature.mjs";
import { currentAspects } from "../rules/aspects.mjs";

const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

class BaseItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return baseItemSchema();
  }

  /** Is this item currently contributing its modifiers to its owner? */
  get isActive() {
    return true;
  }
}

/* -------------------------------------------- */

export class RaceData extends BaseItemData {
  static defineSchema() {
    const attr = () => intField(0, { min: 0, max: 4 });
    return {
      ...super.defineSchema(),
      increases: new SchemaField({
        ag: attr(), fo: attr(), te: attr(), sc: attr(), in: attr(), ma: attr(), pe: attr()
      }),
      increaseRule: new StringField({ blank: true, initial: "" }),
      allowed: new SchemaField({
        plus2: new StringField({ blank: true, initial: "" }),
        plus1: new StringField({ blank: true, initial: "" })
      }),
      rlm: intField(0, { min: -10, max: 20 }),
      saves: new ArrayField(new StringField({ choices: ["impulsive", "corporeal", "cognitive", "morale"] })),
      saveChoice: new BooleanField({ initial: false }),
      skillRanks: intField(0, { min: 0, max: 10 }),
      sizes: new ArrayField(new StringField()),
      minion: new BooleanField({ initial: false }),
      unnatural: new BooleanField({ initial: false }),
      traits: new ArrayField(new StringField())
    };
  }
}

/* -------------------------------------------- */

export class RacialTraitData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      race: new StringField({ blank: true, initial: "" }),
      category: new StringField({ initial: "body", choices: ["body", "mind", "villainous"] }),
      // "fusion": Method Traits and Fusion Modifiers generated for a Fusion; "villainous": an Adversary's Villainous Trait
      tier: new StringField({ initial: "primary", choices: ["primary", "secondary", "subrace", "factor", "benefit", "drawback", "role", "fusion",
        "villainous"] }),
      // What the Trait made the Character pick (Narrative Transformation: a Form or Transformation Line)
      choice: new StringField({ blank: true, initial: "" }),
      factor: new StringField({ blank: true, initial: "" }),
      replaces: new StringField({ blank: true, initial: "" }),
      maxFactor: intField(1, { min: 0 }),
      active: new BooleanField({ initial: true }),
      uses: usesField()
    };
  }

  get isActive() {
    return this.active;
  }
}

/* -------------------------------------------- */

export class TalentData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      category: new StringField({ blank: true, initial: "Miscellaneous" }),
      prerequisites: new StringField({ blank: true, initial: "" }),
      prereq: new SchemaField({
        scores: new ArrayField(new SchemaField({
          attrs: new ArrayField(new StringField()),
          min: intField(0)
        })),
        talents: new ArrayField(new StringField()),
        anyTalents: new ArrayField(new StringField()),
        top: intField(0),
        skills: new ArrayField(new SchemaField({ key: new StringField(), ranks: intField(0) })),
        race: new StringField({ blank: true, initial: "" })
      }),
      /** Talent gained for free from a Trait (does not use a Talent Addition). */
      granted: new BooleanField({ initial: false }),
      /** PL at which the Talent was taken (used for the Character Creation category rule). */
      takenAt: intField(1, { min: 1, max: 30 }),
      uses: usesField()
    };
  }
}

/* -------------------------------------------- */

export class TransformationData extends BaseItemData {
  static defineSchema() {
    const bonus = () => new StringField({ blank: true, initial: "" });
    return {
      ...super.defineSchema(),
      transType: new StringField({ initial: "form", choices: ["awakening", "enhancement", "form", "evolved"] }),
      subtype: new StringField({ blank: true, initial: "" }),
      origin: new StringField({ blank: true, initial: "" }),
      race: new StringField({ blank: true, initial: "Any" }),
      prerequisites: new StringField({ blank: true, initial: "" }),
      line: new StringField({ blank: true, initial: "" }),
      stage: intField(0, { min: 0 }),
      initialEnhancement: new StringField({ blank: true, initial: "" }),
      stressReq: intField(0, { min: 0 }),
      topReq: intField(1, { min: 0, max: 7 }),
      bonuses: new SchemaField({ ag: bonus(), fo: bonus(), te: bonus(), sc: bonus(), in: bonus(), ma: bonus(), pe: bonus() }),
      aspects: new ArrayField(new SchemaField({
        key: new StringField({ blank: true, initial: "" }),
        name: new StringField({ blank: true, initial: "" }),
        level: intField(0, { min: 0 }),
        param: new StringField({ blank: true, initial: "" })
      })),
      traits: new ArrayField(new StringField()),
      // Traits gained from the lower Stages of its Line or from its listed Transformation (Variant), less the replaced ones
      inherited: new ArrayField(new SchemaField({
        trait: new StringField({ blank: true, initial: "" }),
        from: new StringField({ blank: true, initial: "" }),
        slug: new StringField({ blank: true, initial: "" })
      })),
      // Token image while in this Transformation (empty: the token keeps its own)
      tokenImg: new StringField({ blank: true, initial: "" }),
      // Grand Awakening of a Super Awakening, activated by the Full Awakening Maneuver until the end of the encounter
      grandAwakening: new BooleanField({ initial: false }),
      stacks: intField(1, { min: 0 }),
      maxStacks: intField(1, { min: 1 }),
      // Temporary Awakening Stacks (the newest Stacks): Level 1 (the ARC may let the character keep it at the end of the
      // Combat Encounter) or Level 2 (removed then), and the encounter it was gained in
      tempStacks: new ArrayField(new SchemaField({
        level: intField(1, { min: 1, max: 2 }),
        combat: new StringField({ blank: true, initial: "" })
      })),
      // Stacks that neither count towards the Awakening Limit nor give the Attribute Modifier Bonus (the Spirit Control
      // Stack of a Yardrat)
      freeStacks: intField(0, { min: 0 }),
      // What each Stack holds, oldest Stack first: the Absorbed Character of a stack of Absorption, the Merged Character of
      // a stack of Unified
      stackNotes: new ArrayField(new StringField({ blank: true, initial: "" })),
      // What a Stack holds, asked when one is gained ("Absorbed Character"); empty: nothing to ask
      stackNote: new StringField({ blank: true, initial: "" }),
      // Tier of Power Requirement of each Stack when they differ ("2,3": the second Stack needs ToP 3+)
      stackTop: new StringField({ blank: true, initial: "" }),
      grade: intField(1, { min: 0 }),
      maxGrade: intField(0, { min: 0 }),
      graded: new BooleanField({ initial: false }),
      /** Stress Test Requirement per Grade: "13,18" (absolute) or "+2,+5,+8" (added). Empty = +2 per Grade after the first. */
      gradeStress: new StringField({ blank: true, initial: "" }),
      mastery: intField(0, { min: 0 }),
      active: new BooleanField({ initial: false }),
      transcended: new BooleanField({ initial: false }),
      prelude: new BooleanField({ initial: false }),
      ignoreBulky: new BooleanField({ initial: false }),
      // Its Tier of Power Requirement is ignored for entering and remaining in it (Metamorphosis: Suppression of Power,
      // which the higher Stages inherit)
      ignoreTop: new BooleanField({ initial: false }),
      /** Entered through the Transformation Maneuver (Forms only get the Ki Multiplier this way). */
      viaManeuver: new BooleanField({ initial: true }),
      legendRealized: new BooleanField({ initial: false }),
      newLevel: new BooleanField({ initial: false }),
      // The character has been in this Transformation before
      everEntered: new BooleanField({ initial: false }),
      // New Level of Power when it is next entered in a Combat Encounter: the character gains access to it during the
      // encounter (set when it is added mid-combat) or the ARC marks a first time planned for the next fight
      newLevelPending: new BooleanField({ initial: false }),
      temporary: new BooleanField({ initial: false }),
      homebrew: new BooleanField({ initial: false }),
      // Optional Rules
      ignoreLimit: new BooleanField({ initial: false }),
      greaterEnhancement: new BooleanField({ initial: false }),
      scalingEarned: intField(0, { min: 0, max: 4 }),
      // Mastery Traits that change Aspects ("loses the Draining Aspect"), applied from that Mastery level on.
      // add: gains the Aspect at that level; raise / reduce: gains / loses that many levels
      masteryAspects: new ArrayField(new SchemaField({
        mastery: intField(1, { min: 1 }),
        op: new StringField({ initial: "remove", choices: ["remove", "add", "reduce", "raise"] }),
        key: new StringField({ blank: true, initial: "" }),
        level: intField(0, { min: 0 }),
        // Only that part of an Aspect with several ("loses the Innate State (Feral) Aspect")
        param: new StringField({ blank: true, initial: "" }),
        // "M levels": as many levels as Masteries, up to max (0 = no limit): "M levels of the Scaling Aspect (max. 2)"
        perMastery: new BooleanField({ initial: false }),
        max: intField(0, { min: 0 })
      })),
      // Aspects a Grade applies (Grades table), also in the Grades above it: Wrathful's 2nd → Armored, Bulky, Growth (LV1)
      gradeAspects: new ArrayField(new SchemaField({
        grade: intField(2, { min: 1 }),
        key: new StringField({ blank: true, initial: "" }),
        level: intField(0, { min: 0 }),
        param: new StringField({ blank: true, initial: "" })
      })),
      // Option effects chosen once ("Upon gaining access to this Transformation, select one of the following")
      choices: new ArrayField(new SchemaField({
        id: new StringField({ blank: true, initial: "" }),
        trait: new StringField({ blank: true, initial: "" }),
        options: new ArrayField(new StringField()),
        pick: intField(1, { min: 1 }),
        selected: new ArrayField(new StringField()),
        detail: new StringField({ blank: true, initial: "" }),
        subs: new ArrayField(new StringField()),
        // Chosen again for every Stack of an Awakening: `pick` options per Stack, `selected` oldest Stack first
        // ("Each time you gain a stack of Ki Technician, gain access to a Technical Trait of your choice")
        perStack: new BooleanField({ initial: false }),
        // The same option may be chosen for several Stacks; noRepeatLast: but not for two Stacks in a row
        repeat: new BooleanField({ initial: false }),
        noRepeatLast: new BooleanField({ initial: false }),
        // The options are items of this compendium: choosing one adds that item while the Stack lasts
        pack: new StringField({ blank: true, initial: "" })
      })),
      // Aura drawn around the token while the Transformation is active ("auto": by name, e.g. Super Saiyan → gold)
      aura: new SchemaField({
        style: new StringField({ initial: "auto", choices: ["auto", "none", "glow", "lightning", "nebula"] }),
        color: new StringField({ blank: true, initial: "" }),
        color2: new StringField({ blank: true, initial: "" })
      })
    };
  }

  get isActive() {
    if ( this.transType === "awakening" ) return this.stacks > 0;
    return this.active;
  }

  /** Number of Masteries needed to be Fully Mastered (Difficult aspect adds levels). */
  get masteryNeeded() {
    const difficult = (this.baseAspects ?? this.aspects).find(a => a.key === "difficult");
    return 1 + (difficult?.level ?? 0);
  }

  /** Every Trait name it has, its own and the inherited ones ("Name [kind]"). */
  get allTraits() {
    return [...(this.traits ?? []), ...(this.inherited ?? []).map(t => t.trait)];
  }

  /** A Transcendent Trait needs one more Mastery once Fully Mastered. */
  get masteryMax() {
    return this.masteryNeeded + (this.allTraits.some(t => /\[transcendent trait\]/.test(t)) ? 1 : 0);
  }

  /** Formula variables of its Traits: Grade, Stage, Stacks (Z), Stacks that give the Attribute Modifier Bonus (ZB),
   * Stacks that are not Temporary Awakenings (ZP), Mastery, Masteries beyond Fully Mastered (MX), Transcended (TR) and
   * Grand Awakening active (GA). */
  get formulaContext() {
    return {
      G: this.grade, S: this.stage, Z: this.stacks, ZB: this.bonusStacks, ZP: this.stacks - this.tempCount,
      M: this.mastery, MX: Math.max(0, this.mastery - this.masteryNeeded),
      TR: this.transcended ? 1 : 0, GA: this.grandAwakening ? 1 : 0
    };
  }

  /** Stacks that are Temporary Awakenings (the newest ones). */
  get tempCount() {
    return Math.min(this.stacks, this.tempStacks?.length ?? 0);
  }

  /** Stacks that give the Attribute Modifier Bonus. */
  get bonusStacks() {
    return Math.max(0, this.stacks - (this.freeStacks ?? 0));
  }

  /** Stacks that count towards the Awakening Limit: each one is an Awakening of its type (not a Temporary one). */
  get limitStacks() {
    if ( this.temporary ) return 0;
    return Math.max(0, this.stacks - this.tempCount - (this.freeStacks ?? 0));
  }

  /** Choices that still have to be made (a per-Stack choice needs `pick` options for every Stack). */
  get pendingChoices() {
    return (this.choices ?? []).filter(c => (c.selected?.length ?? 0) < (c.perStack ? c.pick * this.stacks : c.pick));
  }

  /** The Grade (its Aspects and "(LVG)" levels) and the Mastery Traits reached change the Aspects. */
  prepareDerivedData() {
    super.prepareDerivedData?.();
    this.baseAspects = this.aspects;
    this.aspects = currentAspects(this);
  }

  get isMastered() {
    return this.aspects.some(a => a.key === "peaked") || (this.mastery > 0);
  }

  /** Counts as a Form for Transformation Stacking (Transcended Enhancements do). */
  get countsAsForm() {
    return (this.transType === "form") || ((this.transType === "enhancement") && this.transcended);
  }

  hasAspect(key) {
    return this.aspects.some(a => a.key === key);
  }

  aspectLevel(key) {
    return this.aspects.filter(a => a.key === key).reduce((n, a) => n + Math.max(1, a.level), 0);
  }
}

/* -------------------------------------------- */

export class SignatureData extends BaseItemData {
  static defineSchema() {
    const rankList = () => new ArrayField(new SchemaField({
      key: new StringField({ blank: true, initial: "" }),
      rank: intField(1, { min: 1 }),
      choice: new StringField({ blank: true, initial: "" })
    }));
    return {
      ...super.defineSchema(),
      level: new StringField({ initial: "super", choices: ["super", "ultimate", "finisher"] }),
      foundation: new StringField({ initial: "energy", choices: ["physical", "energy", "magic"] }),
      profile: new StringField({ initial: "beam" }),
      superProfile: new StringField({ blank: true, initial: "" }),
      multiProfile: new StringField({ blank: true, initial: "" }),
      advantages: rankList(),
      disadvantages: rankList(),
      free: new BooleanField({ initial: false }),
      granted: new BooleanField({ initial: false }),
      tpAdjust: intField(0),
      usedThisEncounter: new BooleanField({ initial: false }),
      // Fused Technique of a Fusion: an Ultimate with a Super Profile that costs 4(T) Ki Points less
      fused: new BooleanField({ initial: false }),
      fusedWoundT: intField(0, { min: 0 }),
      // How the attack looks on the canvas (module/canvas/attack-fx.mjs): shape "auto" and blank colours follow the Profile
      vfx: new SchemaField({
        shape: new StringField({ initial: "auto" }),
        color: new StringField({ blank: true, initial: "" }),
        color2: new StringField({ blank: true, initial: "" }),
        size: new StringField({ initial: "normal", choices: ["small", "normal", "big", "huge"] }),
        lightning: new BooleanField({ initial: false }),
        spiral: new BooleanField({ initial: false }),
        sparks: new BooleanField({ initial: true }),
        shockwave: new BooleanField({ initial: false }),
        charge: new BooleanField({ initial: false }),
        shake: new BooleanField({ initial: false })
      })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData?.();
    this.computed = computeSignature(this, this.parent?.actor ?? null);
  }
}

/* -------------------------------------------- */

export class UniqueAbilityData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      abilityType: new StringField({ blank: true, initial: "Technical" }),
      prerequisites: new StringField({ blank: true, initial: "" }),
      prereq: new SchemaField({
        scores: new ArrayField(new SchemaField({
          attrs: new ArrayField(new StringField()),
          min: intField(0)
        }))
      }),
      tpCost: intField(0, { min: 0 }),
      kpCost: new StringField({ blank: true, initial: "" }),
      maneuverType: new StringField({ blank: true, initial: "" }),
      actionCost: new StringField({ blank: true, initial: "" }),
      advancements: new ArrayField(new SchemaField({
        name: new StringField({ blank: true, initial: "" }),
        tp: intField(0, { min: 0 }),
        prerequisite: new StringField({ blank: true, initial: "" }),
        owned: new BooleanField({ initial: false })
      })),
      restrictions: new ArrayField(new SchemaField({
        name: new StringField({ blank: true, initial: "" }),
        tp: intField(0, { min: 0 }),
        applied: new BooleanField({ initial: false })
      })),
      granted: new BooleanField({ initial: false }),
      uses: usesField()
    };
  }

  /** TP actually paid: listed cost minus restrictions (never below half of the listed cost) plus advancements. */
  get tpSpent() {
    if ( this.granted ) return this.advancements.filter(a => a.owned).reduce((t, a) => t + a.tp, 0);
    const reduction = this.restrictions.filter(r => r.applied).reduce((t, r) => t + r.tp, 0);
    const base = Math.max(Math.ceil(this.tpCost / 2), this.tpCost - reduction);
    const adv = this.advancements.filter(a => a.owned).reduce((t, a) => t + a.tp, 0);
    return base + adv;
  }
}

/* -------------------------------------------- */

export class ManeuverData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      maneuverType: new StringField({ blank: true, initial: "Standard" }),
      actionCost: new StringField({ blank: true, initial: "1" }),
      kpCost: new StringField({ blank: true, initial: "" }),
      // God Maneuvers (God Ki) are paid with Divine Ki Points
      dkpCost: new StringField({ blank: true, initial: "" }),
      god: new BooleanField({ initial: false }),
      // Villainous Maneuvers (Adversaries): Adversary Actions may pay their Action Cost
      villainous: new BooleanField({ initial: false }),
      frequency: new StringField({ blank: true, initial: "" }),
      requirement: new StringField({ blank: true, initial: "" }),
      minions: new StringField({ blank: true, initial: "" })
    };
  }
}

/* -------------------------------------------- */

export class WeaponData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      weaponType: new StringField({ initial: "physical", choices: ["physical", "energy", "magic"] }),
      size: new StringField({ initial: "standard", choices: ["small", "standard", "big"] }),
      category: new StringField({ initial: "slashing" }),
      craftsmanship: intField(1, { min: 1, max: 5 }),
      qualities: new ArrayField(new SchemaField({
        name: new StringField({ blank: true, initial: "" }),
        slots: intField(1, { min: 0, max: 4 })
      })),
      favoredElement: new StringField({ blank: true, initial: "" }),
      equipped: new BooleanField({ initial: false }),
      integrated: new BooleanField({ initial: false }),
      broken: new BooleanField({ initial: false }),
      life: new SchemaField({ value: intField(40, { min: 0 }) }),
      // Ballistics Optional Rule
      ballistic: new BooleanField({ initial: false }),
      caliber: intField(0, { min: 0 }),
      ammo: new SchemaField({ value: intField(1, { min: 0 }), max: intField(1, { min: 0 }) }),
      dedicatedProfile: new StringField({ blank: true, initial: "beam" })
    };
  }

  get isActive() {
    return this.equipped && !this.broken;
  }
}

/* -------------------------------------------- */

export class ApparelData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      category: new StringField({ initial: "combat", choices: ["armor", "weights", "combat", "standard"] }),
      craftsmanship: intField(1, { min: 1, max: 5 }),
      layer: new StringField({ initial: "top", choices: ["top", "middle", "bottom"] }),
      size: new StringField({ initial: "medium" }),
      qualities: new ArrayField(new SchemaField({
        name: new StringField({ blank: true, initial: "" }),
        slots: intField(1, { min: 0, max: 4 })
      })),
      equipped: new BooleanField({ initial: false }),
      integrated: new BooleanField({ initial: false }),
      natural: new BooleanField({ initial: false }),
      breakValue: intField(3, { min: 0, max: 3 })
    };
  }

  get isActive() {
    return this.equipped && (this.breakValue > 0);
  }
}

/* -------------------------------------------- */

export class GearItemData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      itemType: new StringField({ initial: "basic", choices: ["basic", "accessory"] }),
      quantity: intField(1, { min: 0 }),
      craftDC: new StringField({ blank: true, initial: "" }),
      details: new StringField({ blank: true, initial: "" }),
      equipped: new BooleanField({ initial: false })
    };
  }

  get isActive() {
    return (this.itemType !== "accessory") || this.equipped;
  }
}
