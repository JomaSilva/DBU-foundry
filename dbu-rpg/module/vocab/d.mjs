/**
 * Package D (round 3): effect references, Aspects by modifier, the built-in effects of the States (rules/fx.mjs,
 * DBU.stateTriggers). Only Package D edits this file; vocab/index.mjs merges it after a, b, c. Every export must stay
 * (empty is fine): targets, prefixes, events, effects, durations, maneuvers, triggerTargets, registerTargets(DBU).
 * Every new target, event, effect and duration needs a pt-BR and an en label in build/lang/d.json.
 */
export const targets = {};
/**
 * fxOff.<ref> / fxOn.<ref> / fxMult.<ref> / fxAdd.<ref> / fxLimit.<ref>: what this piece does to another effect;
 * aspect.<key>[.<param>] / aspectSet.<key>[.<param>] / aspectAll.<key>[.<param>] / aspectOf.<slug>.<key>[.<param>]:
 * the Aspects of a Transformation.
 */
export const prefixes = ["fxOff.", "fxOn.", "fxMult.", "fxAdd.", "fxLimit.", "fxAsk.", "aspect.", "aspectSet.", "aspectAll.", "aspectOf."];
/** fxUsed: a piece of an effect was applied (@fxUsed.<ref> = 1). */
export const events = ["fxUsed"];
export const effects = [];
export const durations = [];
export const maneuvers = [];
export const triggerTargets = [];
export function registerTargets(DBU) {}
