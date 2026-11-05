import { DBU } from "../config.mjs";
import { SIGNATURE_OPTIONS } from "../data/signature-options.mjs";

/**
 * Short Portuguese summaries of every Advantage/Disadvantage (written for this system).
 * Numeric effects listed in EFFECTS below are applied automatically by the attack workflow.
 */
export const SIGNATURE_SUMMARIES = {
  controlledBlast: "O Cone pode sair de qualquer quadrado que não esteja em Long Range.",
  hurricaneAssault: "A AoE do Sweeping vira magnitude Standard.",
  intenseBlast: "Vira Absolute Attack (quem desviar ainda leva metade do Wound contra Soak/RD).",
  pinpointPrecision: "Com alvo único pode usar Called Shot; ao acertar aplica 1 stack de Broken.",
  splitting: "Mira 2 (rank 1) ou 4 (rank 2) oponentes; −1(T) de Wound por alvo extra.",
  terrainDestruction: "+1 magnitude de AoE por rank.",
  widespreadAssault: "Ganha uma AoE (Sphere/Line/Cone) Standard.",
  encompassingAttack: "+2(bT) no custo do Defend por rank; 2 ranks proíbem Parry e UAs de Counter (exceto Barrier).",
  concentratedStrike: "+1 Energy Charge se a AoE atingir um único alvo.",
  maximumCharge: "+1 Categoria nos dados das Energy Charges.",
  reinforcedPlantlife: "+1 Hardness por rank nas Features do Plantlife.",
  weatherCalling: "Ao acertar, cria o Clima de Batalha do elemento ao redor do alvo.",
  backFlip: "Hit and Run acontece antes do ataque; com Charging Assault −1(T) de KP.",
  chargingAssault: "Move até a Boosted Speed em linha reta antes do ataque; +1 Wound por quadrado após o 3º (máx 2(T)).",
  expressTicket: "Ao acertar, Might Clash para arrastar o alvo; sem colisão o alvo perde 1/2 Might de LP.",
  highSpeedDash: "Hit and Run usa a Boosted Speed e não provoca Exploit.",
  hitAndRun: "Depois do ataque move até a Normal Speed em linha reta.",
  knockback: "Ao causar dano, Might Clash para empurrar o alvo até Might quadrados.",
  twoStepStrike: "Antes do ataque pode usar Thrust (Push Back) como Out-of-Sequence.",
  accurate: "+1(T) no Acerto por rank.",
  armorPiercing: "Ignora RD igual a 1/2 do Mod. de Insight.",
  brutalBlitz: "Movendo toda a Boosted Speed, pode usar Agilidade como Atributo de Dano.",
  finalChance: "Abaixo de Injured: reduz LP a 0 para somar o valor ao Ki Wager.",
  fullWager: "O Ki Wager só é limitado pela Capacidade restante.",
  lastLegs: "Ignora penalidades de limiar; +1(T) Acerto e Wound por limiar abaixo.",
  longShot: "+1(T) Acerto e Wound por rank contra alvos a 9+ quadrados.",
  minionDestroyer: "Minions recebem dano extra igual ao Atributo de Dano.",
  overwhelmingTerror: "+1 Energy Charge se todos os alvos estiverem Shaken.",
  pepperingBlows: "Conta como +1 ataque por rank para Diminishing Defense.",
  powerBurst: "+1 Super Stack por rank durante o ataque (sem penalidade de Acerto).",
  powerShot: "+2(T) no Wound por rank.",
  shatteringBlow: "Ao causar dano, +1/4 do Soak do alvo por rank.",
  skyAssault: "Ignora Long Range por alvo em High Environment superior.",
  superAdvantage: "Dobra o bônus de Long Shot, Power Shot (até 3 ranks) ou Accurate.",
  transformationBoost: "Em Form/Transcended: +1 Energy Charge.",
  counter: "Pode ser usada no Cross Counter (sem reduzir o Defense Value).",
  delayed: "Guarda o Wound e aplica depois (stack de Imminent).",
  exploitingTechnique: "Pode ser usada no Exploit no lugar do Basic Attack.",
  fakeOut: "Clash Bluff vs Intuition: o alvo só pode Guard ou Desviar; se desviar, ataque extra.",
  instantAssault: "Ninguém pode reagir com Instant Maneuvers.",
  lowStakesAttack: "Não conta para o limite da Signature Technique Maneuver.",
  personalBomb: "Delayed que explode na AoE ao redor do alvo.",
  trickAttack: "Clash (Bluff/Acrobatics vs Intuition/Perception): vencendo, +2(bT) no Acerto.",
  condition: "Ao causar dano aplica Guard Down, Drained, Shaken ou Poisoned; já afetado: +3(T) Wound.",
  deadlyDrop: "Agarrando em High Environment: derruba o alvo para colidir com o chão.",
  heftyStagger: "+1(T) por rank no Might Clash do Staggering Attack.",
  homing: "Ao errar, rerrola o Acerto (1 vez por rank) com +1(T) por erro.",
  penetration: "Ao acertar aplica 1 stack de Broken por rank.",
  perfectStrike: "Metade do custo de KP sai da Capacidade.",
  powerbomb: "Encerrando o Grapple: +1/2 Might no Wound por rank.",
  rebound: "Homing pode trocar de alvo.",
  staggeringAttack: "Ao causar dano, Might Clash: o alvo fica Staggered.",
  suddenBlast: "Não pode ser defletida (Deflect/Distant Deflect).",
  sustained: "Ao causar dano aplica 1 DOT por rank por 3 rodadas.",
  terrainSlam: "Might Clash: o alvo colide com Feature/quadrado adjacente.",
  alottaLottaAttacks: "Combination: +1 rolagem de Acerto extra por rank.",
  ascendedSignature: "Pode virar Ultimate na declaração (depois fica indisponível no encontro).",
  efficiency: "−4(T) no custo de KP por rank.",
  forcefulLaunch: "+1(T) quadrados e Might Clash do Knockback por rank.",
  preciseStrike: "Crítico no Acerto: Knockback +1/2.",
  throwingTechnique: "Pode ser usada pela Throw Maneuver.",
  transformationFlare: "Ao acertar, pode se transformar antes do Wound.",
  twinLinked: "Rola Acerto ou Wound (escolha) duas vezes e usa o maior.",
  weaponAssisted: "Pode ser usada com arma (Armed Attack).",
  dropDown: "Precisa estar em High Environment acima do alvo.",
  recoil: "O Hit and Run é obrigatório para trás.",
  allOrNothing: "Wager obrigatório máximo; depois Capacidade = 0.",
  backlash: "Perde 2(bT) LP por rank depois do ataque.",
  inefficiency: "+4(T) no custo de KP por rank.",
  concentration: "Não pode usar dentro do alcance corpo a corpo de um oponente.",
  grappling: "Só agarrando o alvo.",
  restrictedEnvironment: "Só no Battle Environment escolhido.",
  restrictedStance: "Só na Stance escolhida.",
  restrictedState: "Só no State escolhido.",
  restrictedTransformation: "Só em Enhancement/Form (rank 1) ou numa transformação/linha (rank 2).",
  restrictedUntransformed: "Só no Normal State.",
  restrictedWeapon: "Só com a categoria (rank 1) ou arma (rank 2) escolhida.",
  restrictedWeather: "Só no Clima escolhido.",
  requiredCounter: "Só pelo efeito do Counter.",
  timeSkipped: "Só pelo Time-Skip.",
  vehicleAttack: "Só pilotando veículo.",
  consolidatedStrike: "Exige Called Shot.",
  leadUp: "Exige acertar antes com o Perfil escolhido.",
  mandatoryCharge: "Exige 2 Energy Charge Maneuvers por rank antes de usar.",
  sneakAttack: "Só Hidden e contra alvos Oblivious.",
  specialSetUp: "Exige usar a Special Maneuver escolhida antes.",
  distantExplosion: "A Sphere precisa partir de um oponente.",
  hostileChase: "Botch no Acerto (ou crítico no Desvio do alvo) acerta você.",
  limitedLine: "Line termina em 8 (rank 1) ou 4 (rank 2) quadrados.",
  selfExplosion: "A Sphere parte de você.",
  skywardStrike: "Alvo precisa estar em High Environment acima.",
  smallScaleBlast: "A Sphere vira Minor.",
  volatileExplosion: "Você é alvo se estiver na AoE (acerto automático).",
  compressedElement: "Ignora o 2º efeito do Perfil Elemental.",
  exhaustive: "Depois do uso ganha stacks de Fatigued (1 por rank).",
  inaccurate: "−1(T) no Acerto por rank.",
  lowPenetration: "−1(T) no Wound por rank.",
  lowPowerCrush: "Atributo de Dano pela metade.",
  shortRange: "Rank 1: −2(bT) Acerto/Wound fora do corpo a corpo; rank 2: só corpo a corpo.",
  statDrain: "−1(bT) Combate e Soak por rank até o fim do próximo turno.",
  climaxAttack: "Só abaixo de Bruised/Injured/Critical (rank 1/2/3).",
  deadLink: "Rola Acerto ou Wound (escolha) duas vezes e usa o menor.",
  shootAndPray: "Conta como +1 ataque por rank para Diminishing Offense.",
  shortDelay: "O Imminent explode sozinho após 2 rodadas.",
  unitedAttack: "Exige um aliado com a mesma técnica (United Attack)."
};

/** Advantages granted for free by a Profile. */
const PROFILE_FREE = {
  blitz: ["chargingAssault"], launching: ["knockback"], elementalLight: ["fullWager"], elementalPlantlife: ["staggeringAttack"]
};

/** Build a lookup of the technique's options: key → rank (and choice). */
function optionMap(sig) {
  const map = new Map();
  for ( const o of [...sig.advantages, ...sig.disadvantages] ) {
    if ( !o.key ) continue;
    map.set(o.key, { rank: o.rank || 1, choice: o.choice || "" });
  }
  return map;
}

/** AoE of the technique: "sphere", "sphere0", "line", "cone" or "". */
export function signatureAoe(sig, has) {
  const profile = DBU.profiles[sig.profile];
  if ( profile?.aoe ) return profile.aoe;
  const multi = DBU.profiles[sig.multiProfile];
  if ( (sig.superProfile === "multiProfile") && multi?.aoe ) return multi.aoe;
  if ( sig.superProfile === "superBeam" ) return "line";
  if ( has("widespreadAssault") ) {
    const c = String(has("widespreadAssault").choice || "sphere").toLowerCase();
    return ["line", "cone"].includes(c) ? c : "sphere";
  }
  return "";
}

/**
 * Requirement checks. Each returns true when the requirement is met.
 * ctx: { sig, profileKey, profile, foundation, has(key), rank(key), aoe, ultimate, actor }
 */
const REQUIREMENTS = {
  controlledBlast: c => c.aoe === "cone",
  hurricaneAssault: c => c.profileKey === "sweeping",
  intenseBlast: c => !!c.aoe,
  pinpointPrecision: c => !!c.aoe && !c.has("concentratedStrike"),
  splitting: c => ["energy", "magic"].includes(c.foundation) && !c.aoe,
  terrainDestruction: c => !!c.aoe,
  widespreadAssault: c => !DBU.profiles[c.profileKey]?.aoe,
  encompassingAttack: c => !!c.aoe,
  concentratedStrike: c => !!c.aoe && !c.has("pinpointPrecision"),
  maximumCharge: c => c.ultimate,
  reinforcedPlantlife: c => c.profileKey === "elementalPlantlife",
  weatherCalling: c => !!c.profile?.elemental,
  backFlip: c => (c.has("hitAndRun") || ["energy", "magic"].includes(c.foundation) || (c.profileKey === "soaring")
    || ((c.foundation === "physical") && c.has("chargingAssault"))) && (!c.aoe || (c.aoe === "line")),
  expressTicket: c => c.has("chargingAssault"),
  highSpeedDash: c => c.has("hitAndRun"),
  twoStepStrike: c => (["energy", "magic"].includes(c.foundation) || (c.profileKey === "soaring")
    || ((c.foundation === "physical") && c.has("chargingAssault"))) && !c.has("concentration"),
  accurate: c => !c.has("inaccurate"),
  armorPiercing: c => c.profileKey === "pinpoint",
  brutalBlitz: c => c.profileKey === "blitz",
  finalChance: c => c.ultimate,
  lastLegs: c => c.ultimate,
  overwhelmingTerror: c => !c.actor || ((c.actor.system.skills?.intimidation?.totalRanks ?? 0) >= 2)
    || c.actor.items.some(i => (i.type === "maneuver") && /terrify/i.test(i.name)),
  pepperingBlows: c => c.profileKey === "combination",
  powerBurst: c => c.ultimate,
  powerShot: c => !c.has("lowPenetration"),
  shatteringBlow: c => c.profileKey === "crushing",
  skyAssault: c => ["energy", "magic"].includes(c.foundation),
  superAdvantage: c => c.ultimate,
  transformationBoost: c => c.ultimate,
  exploitingTechnique: c => !c.aoe && !["mandatoryCharge", "specialSetUp", "grappling", "timeSkipped", "leadUp"].some(k => c.has(k)),
  fakeOut: c => !c.ultimate && (!c.actor || ((c.actor.system.skills?.bluff?.totalRanks ?? 0) >= 2)),
  lowStakesAttack: c => c.has("fakeOut"),
  personalBomb: c => c.has("delayed") && String(c.aoe).startsWith("sphere"),
  trickAttack: c => !c.actor || ((c.actor.system.skills?.bluff?.totalRanks ?? 0) >= 2)
    || ((c.actor.system.skills?.acrobatics?.totalRanks ?? 0) >= 2),
  condition: c => !["elementalFire", "elementalIce", "elementalWater", "elementalLightning", "elementalPoison"].includes(c.profileKey),
  deadlyDrop: c => (c.foundation === "physical") && c.has("grappling") && c.has("restrictedEnvironment"),
  heftyStagger: c => c.has("staggeringAttack"),
  homing: c => !c.aoe,
  penetration: c => !["sphere", "sphere0", "cone"].includes(c.aoe) && !c.has("lowPenetration"),
  perfectStrike: c => (c.profileKey === "simple") && c.ultimate,
  powerbomb: c => (c.foundation === "physical") && c.has("grappling"),
  rebound: c => c.has("homing"),
  suddenBlast: c => c.profileKey === "clearing",
  terrainSlam: c => c.has("powerbomb"),
  alottaLottaAttacks: c => c.profileKey === "combination",
  ascendedSignature: c => !c.ultimate,
  efficiency: c => !c.has("inefficiency"),
  forcefulLaunch: c => c.profileKey === "launching",
  preciseStrike: c => c.profileKey === "launching",
  throwingTechnique: c => ["simple", "combination"].includes(c.profileKey) && (c.foundation === "physical"),
  transformationFlare: c => c.has("restrictedUntransformed"),
  twinLinked: c => !c.has("deadLink") || (c.has("deadLink").choice !== c.has("twinLinked").choice),
  dropDown: c => c.has("chargingAssault") && c.has("restrictedEnvironment"),
  recoil: c => c.has("hitAndRun"),
  inefficiency: c => !c.has("efficiency"),
  concentration: c => ["energy", "magic"].includes(c.foundation) || (c.profileKey === "soaring")
    || ((c.foundation === "physical") && (c.has("widespreadAssault") || c.has("chargingAssault"))),
  restrictedStance: c => !c.actor || c.actor.items.some(i => /martial skill/i.test(i.name)),
  restrictedTransformation: c => !c.has("restrictedUntransformed"),
  restrictedUntransformed: c => !c.has("restrictedTransformation")
    && (!c.actor || c.actor.items.some(i => (i.type === "transformation") && (i.system.transType === "form"))),
  restrictedWeapon: c => c.has("weaponAssisted"),
  requiredCounter: c => c.has("counter"),
  vehicleAttack: c => (c.profileKey === "blitz") || c.has("restrictedWeapon"),
  consolidatedStrike: c => !c.aoe,
  leadUp: c => !c.has("mandatoryCharge"),
  specialSetUp: c => !c.has("mandatoryCharge") && !c.has("leadUp"),
  distantExplosion: c => String(c.aoe).startsWith("sphere") && !c.has("selfExplosion"),
  hostileChase: c => (c.rank("homing") >= 2) && ["energy", "magic"].includes(c.foundation),
  limitedLine: c => c.aoe === "line",
  selfExplosion: c => String(c.aoe).startsWith("sphere") && !c.has("distantExplosion"),
  skywardStrike: c => !c.aoe && (["energy", "magic"].includes(c.foundation)
    || ((c.foundation === "physical") && c.has("chargingAssault"))),
  smallScaleBlast: c => String(c.aoe).startsWith("sphere") && !c.has("terrainDestruction"),
  volatileExplosion: c => String(c.aoe).startsWith("sphere"),
  compressedElement: c => ["elementalFire", "elementalIce", "elementalLightning", "elementalPoison", "elementalWater",
    "elementalDark", "elementalLight", "elementalPlantlife"].includes(c.profileKey),
  inaccurate: c => !c.has("accurate"),
  lowPenetration: c => !c.has("powerShot") && !c.has("penetration"),
  lowPowerCrush: c => c.profileKey === "crushing",
  shortRange: c => ["energy", "magic"].includes(c.foundation) && !c.aoe,
  deadLink: c => !c.has("twinLinked") || (c.has("deadLink").choice !== c.has("twinLinked").choice),
  shootAndPray: c => c.profileKey === "combination",
  shortDelay: c => c.has("delayed")
};

/**
 * Compute TP Cost, KP Cost (in multiples of T), Strike/Wound adjustments and rule problems of a Signature Technique.
 * Pure: only depends on the technique, plus the owning actor for skill/item based requirements.
 */
export function computeSignature(sig, actor = null) {
  const errors = [];
  const warnings = [];
  const profileKey = sig.profile;
  const profile = DBU.profiles[profileKey];
  const options = optionMap(sig);
  const has = key => options.get(key) ?? null;
  const rank = key => options.get(key)?.rank ?? 0;
  const ultimate = ["ultimate", "finisher"].includes(sig.level);
  const aoe = signatureAoe(sig, has);
  const L = k => game.i18n.localize(k);

  if ( !profile ) errors.push(L("DBU.Sig.ErrNoProfile"));
  else if ( !profile.foundations.includes(sig.foundation) ) {
    errors.push(game.i18n.format("DBU.Sig.ErrFoundation", { profile: profile.label }));
  }

  // Duplicates (Double Dip) and rank limits
  const seen = new Set();
  let tpAdv = 0;
  let tpDis = 0;
  const breakdown = [];
  const free = new Set(PROFILE_FREE[profileKey] ?? []);
  const ctx = { sig, profileKey, profile, foundation: sig.foundation, has, rank, aoe, ultimate, actor };
  for ( const list of [sig.advantages, sig.disadvantages] ) {
    for ( const o of list ) {
      if ( !o.key ) continue;
      const def = SIGNATURE_OPTIONS[o.key];
      if ( !def ) { warnings.push(game.i18n.format("DBU.Sig.WarnUnknown", { key: o.key })); continue; }
      if ( seen.has(o.key) ) errors.push(game.i18n.format("DBU.Sig.ErrDuplicate", { name: def.name }));
      seen.add(o.key);
      const r = Math.max(1, o.rank || 1);
      if ( r > def.costs.length ) {
        errors.push(game.i18n.format("DBU.Sig.ErrRank", { name: def.name, max: def.costs.length }));
      }
      const cost = def.costs.slice(0, Math.min(r, def.costs.length)).reduce((t, c) => t + c, 0);
      const isFree = free.has(o.key);
      if ( def.kind === "advantage" ) tpAdv += isFree ? 0 : cost;
      else tpDis += cost;
      breakdown.push({ name: def.name, kind: def.kind, rank: r, cost: isFree ? 0 : cost, free: isFree });
      const check = REQUIREMENTS[o.key];
      if ( check && !check(ctx) ) {
        errors.push(game.i18n.format("DBU.Sig.ErrRequirement", { name: def.name, req: def.requirement }));
      }
    }
  }

  // Super Profile
  const sp = DBU.superProfiles[sig.superProfile];
  if ( sig.superProfile && !sp ) warnings.push(L("DBU.Sig.WarnSuperProfile"));
  // A Fusion's Fused Technique is an Ultimate with a Super Profile
  if ( sp && (sig.level !== "finisher") && !sig.fused ) warnings.push(L("DBU.Sig.WarnSuperOnlyFinisher"));
  if ( sp ) {
    const spReq = {
      cataclysmic: () => !!aoe, combo: () => !aoe, gigaFlare: () => profileKey === "megaFlare",
      superBeam: () => profileKey === "beam", superCombination: () => profileKey === "combination",
      superLaunch: () => profileKey === "launching", weatherMaximizer: () => !!has("weatherCalling"),
      karmic: () => !actor || (actor.system.zsoul?.alignment ?? 0) !== 0
    }[sig.superProfile];
    if ( spReq && !spReq() ) errors.push(game.i18n.format("DBU.Sig.ErrSuperReq", { name: sp.label, req: sp.requirement }));
  }

  // TP Cost: starts at 8 (Simple: 4), Ultimate +4 at the end, never below 8
  const start = profile?.sigStart ?? 8;
  let tp = start + tpAdv - tpDis;
  if ( ultimate ) tp += 4;
  tp += sig.tpAdjust ?? 0;
  const tpRaw = tp;
  tp = Math.max(8, tp);

  // KP Cost in units of (T)
  let profileKp = profile?.kp ?? 0;
  if ( (sig.superProfile === "multiProfile") && DBU.profiles[sig.multiProfile] ) {
    const mk = DBU.profiles[sig.multiProfile].kp;
    profileKp += mk <= 4 ? 1 : (mk <= 7 ? 2 : 3);
  }
  const superKp = sp?.kp ?? 0;
  const baseKp = profileKp + superKp;
  let kpUnits = baseKp + Math.ceil(tp / 5);
  kpUnits = Math.max(baseKp, kpUnits);
  const kpAdjust = (rank("inefficiency") * 4) - (rank("efficiency") * 4)
    - (profileKey === "blitz" ? (profile.sigKpReduction ?? 0) : 0)
    - ((has("backFlip") && has("chargingAssault")) ? 1 : 0)
    - (sig.fused ? 4 : 0);
  const kpMinUnits = baseKp / 2;

  // Combat roll adjustments (multiples of T unless noted)
  const superAdv = has("superAdvantage")?.choice ?? "";
  const dbl = key => (superAdv && superAdv.toLowerCase().replace(/\s/g, "") === key.toLowerCase()) ? 2 : 1;
  const strikeT = (rank("accurate") * dbl("accurate")) - rank("inaccurate");
  const woundT = (2 * Math.min(rank("powerShot"), 3) * dbl("powerShot")) + (2 * Math.max(0, rank("powerShot") - 3))
    - rank("lowPenetration") + (sig.fusedWoundT ?? 0);
  const longShotT = rank("longShot") * dbl("longShot");
  const chargeCategory = 1 + (has("maximumCharge") ? 1 : 0) + (sp?.chargeCategory ?? 0);
  const maxCharges = (profile?.maxCharges ?? 7) + (ultimate ? 1 : 0);

  return {
    tp, tpRaw, tpStart: start, tpAdvantages: tpAdv, tpDisadvantages: tpDis, breakdown,
    kpUnits, kpAdjust, kpMinUnits, baseKp,
    strikeT, woundT, longShotT, chargeCategory, maxCharges,
    aoe, ultimate, damageCategory: profile?.cat ?? 1,
    twinLinked: has("twinLinked")?.choice?.toLowerCase() ?? "",
    deadLink: has("deadLink")?.choice?.toLowerCase() ?? "",
    fullWager: !!has("fullWager") || free.has("fullWager"),
    allOrNothing: !!has("allOrNothing"),
    lastLegs: !!has("lastLegs"),
    powerBurst: rank("powerBurst"),
    transformationBoost: !!has("transformationBoost"),
    weaponAssisted: !!has("weaponAssisted"),
    lowPowerCrush: !!has("lowPowerCrush"),
    armorPiercing: !!has("armorPiercing"),
    shatteringBlow: rank("shatteringBlow"),
    penetration: rank("penetration"),
    sustained: rank("sustained"),
    backlash: rank("backlash"),
    statDrain: rank("statDrain"),
    exhaustive: rank("exhaustive"),
    shortRange: rank("shortRange"),
    climax: rank("climaxAttack"),
    mandatoryCharge: rank("mandatoryCharge"),
    // Knockback (free with the Launching Profile) and what pushes it further
    knockback: !!has("knockback") || free.has("knockback"),
    forcefulLaunch: rank("forcefulLaunch"),
    preciseStrike: !!has("preciseStrike"),
    errors, warnings
  };
}

/** Options grouped for the builder UI. */
export function signatureOptionGroups(kind) {
  const groups = {};
  for ( const def of Object.values(SIGNATURE_OPTIONS) ) {
    if ( def.kind !== kind ) continue;
    (groups[def.group] ??= []).push({ ...def, summary: SIGNATURE_SUMMARIES[def.key] ?? "" });
  }
  return groups;
}

export { SIGNATURE_OPTIONS };
