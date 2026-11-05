import { evaluate } from "./formula.mjs";

/**
 * Battle Power: the number a scouter reads. Not a rule of the game, a reading of the sheet calibrated on the anime:
 * a starting PL 1 fighter (early Z Goku / Piccolo) about 400, PL 4 Goku about 8,000, PL 5 Vegeta (Saiyan saga) about
 * 18,000, PL 10 Freeza in his first form about 530,000.
 *  - each PL multiplies it by 1.7 and each Tier of Power by 1.55 (the current ToP: Holding Back lowers it);
 *  - Force counts the most (raw power), then Agility (half) and Tenacity (a quarter), cubed: at PL 5, +1 FO is about
 *    +24%, +1 AG +12% and +1 TE +6%; the other Attributes do not measure as ki;
 *  - the Ki Points left against the natural maximum (without Ki Multiplier or a Form's multiplier) scale it: spent ki
 *    lowers it, a Form full of ki raises it.
 * The world setting "Battle Power formula" may replace it (same variables).
 */
export const DEFAULT_BATTLE_POWER_FORMULA =
  "0.56 * pow(1.7, @PL - 1) * pow(1.55, @T - 1) * pow(@fo + @ag / 2 + @te / 4, 3) * max(0.1, @kiRatio)";

/** Earlier defaults: the settings form saves every field, so a world may hold one; it moves to the current default. */
export const LEGACY_BATTLE_POWER_FORMULAS = [
  "0.78 * pow(1.75, @PL - 1) * pow(1.4, @T - 1) * pow(@fo + (@ag + @te) / 4, 3) * max(0.1, @kiRatio)"
];

/** The Attribute part of the default formula (before the cube). */
export function battlePowerWeight(d) {
  return (d.fo ?? 0) + ((d.ag ?? 0) / 2) + ((d.te ?? 0) / 4);
}

/** The variables of the formula. */
export function battlePowerData(sys) {
  const mod = k => sys.attributes?.[k]?.mod ?? 0;
  const kiNatural = Math.max(1, sys.ki?.natural ?? sys.ki?.max ?? 1);
  const ki = Math.max(0, sys.ki?.value ?? 0);
  return {
    PL: sys.pl ?? 1, T: sys.top?.current ?? 1, bT: sys.top?.base ?? 1,
    fo: mod("fo"), ag: mod("ag"), te: mod("te"), sc: mod("sc"), in: mod("in"), ma: mod("ma"), pe: mod("pe"),
    ki, kiMax: sys.ki?.max ?? 0, kiNatural, kiRatio: ki / kiNatural,
    life: sys.life?.value ?? 0, lifeMax: sys.life?.max ?? 0
  };
}

/** Battle Power of a prepared actor system ({ value, data }); 0 when the formula does not evaluate. */
export function battlePower(sys, formula = DEFAULT_BATTLE_POWER_FORMULA) {
  const data = battlePowerData(sys);
  const value = evaluate(formula || DEFAULT_BATTLE_POWER_FORMULA, data, { floor: true });
  return { value: Number.isFinite(value) ? Math.max(0, value) : 0, data };
}
