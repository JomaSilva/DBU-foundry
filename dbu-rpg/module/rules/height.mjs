/**
 * Height on the Battlefield (pure rules, no canvas).
 *  - Flight Optional Rule: stacks of Verticality, one per Square of height. More than 8 is the Sky Environment, 16+ is
 *    Space (on Earth). Melee Range and Long Range count the difference in Verticality as extra Squares.
 *  - Otherwise (Battle Environments) the ranks of High Environment: Ground (0), Low Sky (1), High Sky (2), Local Space
 *    (3) and Deep Space (4); each rank of difference counts as 8 Squares of distance.
 * Tokens keep their height in their elevation: Verticality × the grid distance, or rank × 8 × the grid distance.
 */

export const HIGH_ENVIRONMENTS = ["ground", "lowSky", "highSky", "localSpace", "deepSpace"];
export const DEEP_SPACE = 4;
/** Height and Range: every rank of High Environment of difference is 8 Squares further away. */
export const RANK_SQUARES = 8;
/** Vertical Launch: a movement of 8+ Squares may be halved to change the rank of High Environment by 1. */
export const VERTICAL_LAUNCH = 8;
export const FLIGHT_SKY = 8;
export const FLIGHT_SPACE = 16;
/** Soar under the Flight Optional Rule: up to 8 Verticality (Frequent Flyer: 8 more). */
export const SOAR_VERTICALITY = 8;
/** Verticality a Size Category occupies (the Flight page stops at Gigantic; Colossal follows the doubling). */
export const SIZE_VERTICALITY = { large: 2, enormous: 4, gigantic: 8, colossal: 16 };
export const LONG_RANGE = 9;

/** Hardness Ranks (Battlefields): the Hardness Value is 1(bT) for Rank 0, otherwise twice the Rank (bT). */
export const HARDNESS_RANKS = [0, 1, 2, 3, 4, 5];

/** "sky", "space" or "" for a Verticality (Flight Optional Rule). */
export function flightEnvironment(v) {
  if ( v >= FLIGHT_SPACE ) return "space";
  return v > FLIGHT_SKY ? "sky" : "";
}

/** Collision Damage of a Hardness Rank against a character of base Tier of Power bT. */
export function hardnessValue(rank, bT) {
  return (rank <= 0 ? 1 : 2 * rank) * Math.max(1, bT);
}

/** Hitting the Floor (and Prone in the air): 1(bT) for every 2 Verticality lost, up to 4(bT). */
export function fallBonus(lost, bT) {
  return Math.min(4, Math.floor(Math.max(0, lost) / 2)) * Math.max(1, bT);
}

/** Verticality a character of that Size Category occupies. */
export function occupiedVerticality(sizeKey) {
  return SIZE_VERTICALITY[sizeKey] ?? 1;
}

/** Squares between two vertical bands { v, occupied }: 0 when they overlap. */
export function verticalGap(a, b) {
  const aTop = a.v + Math.max(1, a.occupied ?? 1) - 1;
  const bTop = b.v + Math.max(1, b.occupied ?? 1) - 1;
  return Math.max(0, Math.max(a.v, b.v) - Math.min(aTop, bTop));
}

/**
 * Magnitude of an AoE: Minor 0, Standard 1, Large 2, Huge 3, Destructive 4. A Minor Sphere ("sphere0") stays Minor
 * unless Hurricane Assault makes it Standard; Terrain Destruction adds 1 per rank.
 */
export function aoeMagnitude(aoe, rank = () => 0) {
  if ( !aoe ) return null;
  const base = (aoe === "sphere0") && !rank("hurricaneAssault") ? 0 : 1;
  return Math.min(4, base + rank("terrainDestruction"));
}

/**
 * How far up or down an AoE reaches from where it is used. Flight: Verticality up to the Magnitude's number.
 * High Environments: Minor and Standard only the same rank, higher Magnitudes 1 rank, Destructive 2 ranks.
 */
export function aoeVerticalReach(mode, magnitude) {
  if ( mode === "flight" ) return magnitude;
  if ( magnitude >= 4 ) return 2;
  return magnitude >= 2 ? 1 : 0;
}
