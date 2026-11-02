/**
 * Additional / Optional Rules of dbu-rpg.com as world toggles.
 * auto: "full" = automated by the system, "partial" = some parts automated, "info" = reference only.
 */
const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export const OPTIONAL_RULES = {
  // Minor Optional Rules
  profileBuyout: { group: "minor", slug: "minor-optional-rules", auto: "full" },
  styleChange: { group: "minor", slug: "minor-optional-rules", auto: "info" },
  offGuard: { group: "minor", slug: "minor-optional-rules", auto: "partial" },
  pingPong: { group: "minor", slug: "minor-optional-rules", auto: "info" },
  stamina: { group: "minor", slug: "minor-optional-rules", auto: "full" },
  desperation: { group: "minor", slug: "minor-optional-rules", auto: "full" },
  unitedTransformation: { group: "minor", slug: "minor-optional-rules", auto: "info" },
  overkill: { group: "minor", slug: "minor-optional-rules", auto: "full" },
  limitBreaking: { group: "minor", slug: "minor-optional-rules", auto: "full" },
  greaterEnhancement: { group: "minor", slug: "minor-optional-rules", auto: "full" },
  factorRestoration: { group: "minor", slug: "minor-optional-rules", auto: "info" },
  earnedScaling: { group: "minor", slug: "minor-optional-rules", auto: "full" },
  fullPowerMastery: { group: "minor", slug: "minor-optional-rules", auto: "info" },
  // Variant Rules
  awakeningPoints: { group: "variant", slug: "variant-rules", auto: "full" },
  withoutLimit: { group: "variant", slug: "variant-rules", auto: "full" },
  altLifePoints: { group: "variant", slug: "variant-rules", auto: "full" },
  // Additional Rules pages
  age: { group: "additional", slug: "age", auto: "full" },
  ballistics: { group: "additional", slug: "ballistics", auto: "full" },
  characteristics: { group: "additional", slug: "characteristics", auto: "partial" },
  dragonBalls: { group: "additional", slug: "dragon-balls", auto: "info" },
  fightingStyles: { group: "additional", slug: "fighting-styles", auto: "full" },
  flight: { group: "additional", slug: "flight", auto: "partial" },
  gagRules: { group: "additional", slug: "gag-rules", auto: "full" },
  generations: { group: "additional", slug: "generations", auto: "partial" },
  gravity: { group: "additional", slug: "gravity", auto: "full" },
  hordeBattles: { group: "additional", slug: "horde-battles", auto: "partial" },
  injurySystem: { group: "additional", slug: "injury-system", auto: "full" },
  pathToGodhood: { group: "additional", slug: "path-to-godhood", auto: "full" },
  pathToPower: { group: "additional", slug: "path-to-power", auto: "full" },
  roles: { group: "additional", slug: "roles", auto: "info" }
};

export const AGE_CATEGORIES = ["youngChild", "child", "adolescent", "peak", "matured", "elderly", "decrepit"];
export const INJURY_TYPES = ["eyes", "ears", "handArm", "footLeg", "internal", "tail"];
export const STANCES = ["balanced", "critical", "powered", "evasive", "castle", "efficient", "dragon", "proud", "assassin", "mystical", "grapple"];

/** God Level table: Stress Bonus, ToP Extra Dice Category, automatic feature. */
export const GOD_LEVELS = {
  1: { stress: 1, cat: 1, feature: "legend" }, 2: { stress: 1, cat: 1, feature: "technique" },
  3: { stress: 2, cat: 1, feature: "self" }, 4: { stress: 2, cat: 2, feature: "technique" },
  5: { stress: 3, cat: 2, feature: "legend" }, 6: { stress: 3, cat: 2, feature: "technique" },
  7: { stress: 4, cat: 3, feature: "self" }, 8: { stress: 4, cat: 3, feature: "technique" },
  9: { stress: 5, cat: 3, feature: "talent" }, 10: { stress: 7, cat: 4, feature: "exceed" }
};

/** Awakening Points gained per base ToP (Variant Rule). */
export const AWAKENING_POINTS = { 1: 4, 2: 1, 3: 3, 4: 1, 5: 3, 6: 1, 7: 2 };

/** Current toggles (safe to call during data preparation). */
export function rules() {
  try { return game.settings.get("dbu-rpg", "optionalRules") ?? {}; } catch(err) { return {}; }
}

export function rule(key) {
  return !!rules()[key];
}

/** Effective Gravity Intensity for an actor. */
export function gravityFor(sys) {
  if ( !rule("gravity") ) return 0;
  let gi = sys.optional?.gravityOverride >= 0 ? sys.optional.gravityOverride : (game.settings.get("dbu-rpg", "gravityIntensity") ?? 0);
  let ga = sys.optional?.gravityAcclimatization ?? 0;
  const form = (sys.transformation?.forms ?? []).reduce((m, t) => Math.max(m, t.system.topReq), 0);
  if ( form ) ga += Math.ceil(form / 2);
  return Math.clamp(gi - ga, 0, 6);
}

/**
 * Push the modifiers coming from enabled Optional Rules.
 * @param {Actor} actor
 * @param {object} sys
 * @param {Function} push  (mod, label, ctx) => void
 */
export function pushOptionalModifiers(actor, sys, push) {
  const R = rules();
  const L = k => game.i18n.localize(k);
  const o = sys.optional ?? {};

  /* Age */
  if ( R.age ) {
    let phys = o.physicalAge || "peak";
    const mental = o.mentalAge || "peak";
    if ( sys.race?.system.unnatural ) phys = "peak";
    const lab = `${L("DBU.Opt.age")} (${L(`DBU.Age.${phys}`)})`;
    const labM = `${L("DBU.Opt.age")} (${L(`DBU.Age.${mental}`)}, ${L("DBU.Age.mental")})`;
    const P = (target, value) => push({ target, value }, lab);
    const M = (target, value) => push({ target, value }, labM);
    switch ( phys ) {
      case "youngChild": P("combat", "-2(bT)"); P("save.corporeal", "-2(bT)"); P("save.impulsive", "-2(bT)"); break;
      case "child": P("save.corporeal", "-1(bT)"); P("save.impulsive", "-1(bT)"); P("roundKi", "2(bT)"); break;
      case "adolescent": P("stress", "1"); P("roundKi", "2(bT)"); break;
      case "peak": P("combat", "1(T)"); P("stress", "1"); break;
      case "elderly": P("combat", "-1(bT)"); P("soak", "-1(bT)"); P("kpCost.physical", "1(T)"); P("kpCost.energy", "1(T)"); break;
      case "decrepit": P("combat", "-3(bT)"); P("soak", "-3(bT)"); P("kpCost.physical", "2(T)"); P("kpCost.energy", "2(T)"); break;
      default: break;
    }
    const matured = ["matured", "elderly", "decrepit"].includes(mental);
    switch ( mental ) {
      case "youngChild": M("combat", "-1(bT)"); M("initiative", "-1(bT)"); M("save.cognitive", "-2(bT)"); M("save.morale", "-2(bT)"); break;
      case "child": M("combat", "-1(bT)"); M("save.cognitive", "-1(bT)"); M("save.morale", "-1(bT)"); break;
      case "peak": M("tp", "@PL"); break;
      default: break;
    }
    if ( matured ) { M("tp", "2*@PL"); M("skill.all", "1"); }
    if ( ["elderly", "decrepit"].includes(mental) ) M("awareness", "1(bT)");
    if ( mental === "decrepit" ) { M("save.cognitive", "1(bT)"); M("save.morale", "1(bT)"); }
    if ( (o.mini ?? 0) > 0 ) push({ target: "combat", value: "-1(bT)" }, `Mini (${o.mini})`);
  }

  /* Gravity */
  const gi = gravityFor(sys);
  if ( gi > 0 ) {
    const lab = `${L("DBU.Opt.gravity")} GI ${gi}`;
    push({ target: "speed", value: `-${gi}(bT)` }, lab);
    push({ target: "combat", value: `-${gi}(bT)` }, lab);
    push({ target: "skill.all", value: `-${gi}` }, lab);
    push({ target: "stress", value: `-${gi}` }, lab);
  }

  /* Stamina Rules: only the current (lowest) Stamina Threshold applies */
  if ( R.stamina && !o.burstOfPower ) {
    const lab = L("DBU.Opt.stamina");
    push({ target: "wound", value: "-1(bT)", condition: "@ki < @kiMaxBase/2 && @ki >= @kiMaxBase/4" }, `${lab}: Worn`);
    push({ target: "combat", value: "-1(bT)", condition: "@ki < @kiMaxBase/4 && @ki >= @kiMaxBase/10" }, `${lab}: Tired`);
    push({ target: "stress", value: "-1", condition: "@ki < @kiMaxBase/4 && @ki >= @kiMaxBase/10" }, `${lab}: Tired`);
    push({ target: "combat", value: "-2(bT)", condition: "@ki < @kiMaxBase/10 && @ki >= @kiMaxBase/20" }, `${lab}: Exhausted`);
    push({ target: "stress", value: "-1(bT)", condition: "@ki < @kiMaxBase/10 && @ki >= @kiMaxBase/20" }, `${lab}: Exhausted`);
    push({ target: "combat", value: "-3(bT)", condition: "@ki < @kiMaxBase/20" }, `${lab}: Dire`);
    push({ target: "stress", value: "-2(bT)", condition: "@ki < @kiMaxBase/20" }, `${lab}: Dire`);
  }

  /* Injury System */
  if ( R.injurySystem ) {
    for ( const inj of o.injuries ?? [] ) {
      if ( inj.ignored ) continue;
      const major = inj.severity === "major";
      const n = major ? 2 : 1;
      const lab = `${L(`DBU.Injury.${inj.type}`)} (${L(`DBU.Injury.${inj.severity}`)})`;
      switch ( inj.type ) {
        case "ears":
          push({ target: "save.impulsive", value: `-${n}(bT)` }, lab);
          push({ target: "strike", value: `-${n}(bT)` }, lab);
          push({ target: "dodge", value: `-${n}(bT)` }, lab);
          if ( major ) push({ target: "dimDefenseTop", value: "2" }, lab);
          break;
        case "handArm":
          push({ target: "strike", value: `-${n}(bT)` }, lab);
          push({ target: "wound", value: `-${n}(bT)` }, lab);
          push({ target: "weapons", value: "-1" }, lab);
          if ( major ) push({ target: "dimOffenseStart", value: "-1" }, lab);
          break;
        case "footLeg":
          push({ target: "strike", value: `-${n}(bT)` }, lab);
          push({ target: "dodge", value: `-${n}(bT)` }, lab);
          push({ target: "speed.mult", value: major ? "0.5" : "0.75" }, lab);
          break;
        case "internal":
          push({ target: "fatiguedMin", value: "1" }, lab);
          if ( major ) push({ target: "dotMin", value: "4" }, lab);
          break;
        case "tail": {
          const hasTail = actor.items.some(i => /tail attack/i.test(i.name));
          if ( !hasTail ) push({ target: "combat", value: "-1(bT)" }, lab);
          if ( major ) push({ target: "stress", value: "-2" }, lab);
          break;
        }
        default: break;
      }
    }
  }

  /* Fighting Styles: Stance States */
  if ( R.fightingStyles && o.stance ) {
    const lab = `${L(`DBU.Stance.${o.stance}`)} Stance`;
    push({ target: "stress", value: "-1" }, `${lab} (Stance Strain)`);
    if ( (o.styleTalents ?? 0) > 0 ) push({ target: "topDice.category", value: String(o.styleTalents) }, `${lab} (Style Talents)`);
    switch ( o.stance ) {
      case "balanced": push({ target: "natural.combat", value: "1" }, lab); break;
      case "critical":
        push({ target: "crit.combat", value: "-1" }, lab);
        push({ target: "critDice.combat", value: "@T" }, lab);
        break;
      case "powered": push({ target: "wound", value: "2(T)" }, lab); break;
      case "evasive": push({ target: "dodge", value: "1(T)" }, lab); break;
      case "castle": push({ target: "soak", value: "2(T)" }, lab); break;
      case "efficient": push({ target: "kpCost.attack", value: "-1(T)" }, lab); break;
      case "dragon":
        push({ target: "natural.combat", value: "1" }, lab);
        push({ target: "steadfast", value: "1" }, lab);
        push({ target: "stress", value: "1", condition: "@below >= 3" }, lab);
        break;
      case "assassin": push({ target: "skill.stealth", value: "1" }, lab); break;
      case "mystical":
        push({ target: "wound.magic", value: "2(T)" }, lab);
        push({ target: "kpCost.ua", value: "-1(T)" }, lab);
        break;
      default: break;
    }
  }

  /* Path to Godhood */
  if ( R.pathToGodhood && (sys.pl >= 30) && (o.godLevel > 0) ) {
    const row = GOD_LEVELS[Math.clamp(o.godLevel, 1, 10)];
    const lab = `God Level ${o.godLevel}`;
    push({ target: "stress", value: String(row.stress) }, lab);
    push({ target: "topDice.category", value: String(row.cat) }, lab);
    const honed = godHoned(o);
    if ( honed.self ) {
      push({ target: "life.max", value: `${honed.self}*@PL` }, `${lab}: Honed Self`);
      push({ target: "ki.max", value: `${honed.self}*@PL` }, `${lab}: Honed Self`);
    }
    if ( honed.technique ) push({ target: "tp", value: String(20 * honed.technique) }, `${lab}: Honed Technique`);
  }

  /* Path to Power: Stress Limit */
  if ( R.pathToPower && (sys.pl === 1) && (o.martialLevel > 0) && (o.martialLevel < 3) ) {
    push({ target: "stress", value: "-1" }, "Path to Power (Stress Limit)");
  }

  /* Profile Buyout: +10 TP at Character Creation */
  if ( R.profileBuyout ) push({ target: "tp", value: "10" }, L("DBU.Opt.profileBuyout"));
}

/** Count Honed perks from the God Level table plus the Legend Perks the player converted. */
export function godHoned(o) {
  const honed = { self: 0, technique: 0, talent: 0, exceed: 0 };
  for ( let gl = 1; gl <= Math.clamp(o.godLevel ?? 0, 0, 10); gl++ ) {
    const f = GOD_LEVELS[gl].feature;
    if ( f !== "legend" ) honed[f] += 1;
  }
  for ( const k of Object.keys(honed) ) honed[k] += o.legendPerks?.[k] ?? 0;
  return honed;
}

/** Martial Die Dice Category (Path to Power). */
export function martialDieCategory(sys) {
  if ( !rule("pathToPower") ) return 0;
  const ml = sys.pl > 1 ? 5 : Math.clamp(sys.optional?.martialLevel ?? 0, 0, 5);
  return ml >= 2 ? ml - 1 : 0;
}

/** Path to Power "Limited Power" applies while Martial Level is 4 or lower (at PL1). */
export function limitedPower(sys) {
  return rule("pathToPower") && (sys.pl === 1) && ((sys.optional?.martialLevel ?? 0) > 0) && (sys.optional.martialLevel <= 4);
}

/* -------------------------------------------- */
/*  Settings application                        */
/* -------------------------------------------- */

export class OptionalRulesConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dbu-optional-rules",
    tag: "form",
    classes: ["dbu", "dbu-optional-rules"],
    window: { title: "DBU.Settings.OptionalRules.Name", icon: "fa-solid fa-list-check", resizable: true },
    position: { width: 720, height: 760 },
    form: { handler: OptionalRulesConfig.#onSubmit, closeOnSubmit: true }
  };

  static PARTS = {
    form: { template: "systems/dbu-rpg/templates/apps/optional-rules.hbs", scrollable: [".dbu-rules-list"] },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  async _prepareContext(options) {
    const current = rules();
    const groups = {};
    for ( const [key, def] of Object.entries(OPTIONAL_RULES) ) {
      (groups[def.group] ??= []).push({
        key, enabled: !!current[key], auto: def.auto,
        label: game.i18n.localize(`DBU.Opt.${key}`),
        hint: game.i18n.localize(`DBU.OptHint.${key}`),
        url: `https://dbu-rpg.com/${def.slug}/`
      });
    }
    return {
      groups: Object.entries(groups).map(([g, list]) => ({ id: g, label: game.i18n.localize(`DBU.OptGroup.${g}`), list })),
      gravity: game.settings.get("dbu-rpg", "gravityIntensity"),
      buttons: [{ type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save" }]
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const value = {};
    for ( const key of Object.keys(OPTIONAL_RULES) ) value[key] = !!data.rules?.[key];
    await game.settings.set("dbu-rpg", "optionalRules", value);
    await game.settings.set("dbu-rpg", "gravityIntensity", Math.clamp(Number(data.gravity) || 0, 0, 6));
    ui.notifications.info(game.i18n.localize("DBU.Settings.OptionalRules.Saved"));
  }
}
