/**
 * Package Q (round 11): Mastery requirements, grants that wait for Masteries, the Transformations of a Defeat, halved
 * Collision Damage and Draining. Only Package Q edits this file. Texts in build/lang/q.json.
 */
/** collision.halve (1: the Collision Damage you take is halved), collision.ignore (1: you take none), draining.halve (1: Draining takes half),
 * draining.life (1: Draining takes Life Points instead of Ki Points). */
export const targets = {
  "collision.halve": "DBU.Target.collisionHalve",
  "collision.ignore": "DBU.Target.collisionIgnore",
  "draining.halve": "DBU.Target.drainingHalve",
  "draining.life": "DBU.Target.drainingLife"
};
/** masteryCap.<slug of a Transformation's name>: the most Masteries it may reach now (the lowest piece wins; 0 allowed). */
export const prefixes = ["masteryCap."];
export const events = [];
export const effects = [];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
// eslint-disable-next-line no-unused-vars
export function registerTargets(DBU) {}
