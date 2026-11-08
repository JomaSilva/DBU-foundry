/**
 * Awakening Stacks. Some Awakenings can be gained several times, up to their Maximum No of Stacks: every Stack applies
 * the Attribute Modifier Bonus again (not the Traits), a Trait "Name (n)" works from n Stacks on, "Z" in a Trait is the
 * number of Stacks, and each Stack counts towards the Awakening Limit. Some Traits make a choice for every Stack (a
 * Technical Trait of Ki Technician, the Vocation of Vocation Gain...). A Temporary Stack lasts until the end of the
 * Combat Encounter (Level 1: the ARC may let the character keep it; Level 2: removed).
 * Pure functions over item data, so they can be checked outside Foundry.
 */
import { parseTrait } from "./traits.mjs";

/** Label the compendium gives the modifiers/triggers of an option: "Steady Progress — opção: Agility". */
export const OPTION_SEP = " — opção: ";

/** Picks a choice needs with this many Stacks (a per-Stack choice: `pick` for every Stack). */
export function picksNeeded(choice, stacks) {
  const pick = Math.max(1, choice?.pick ?? 1);
  return choice?.perStack ? pick * Math.max(0, stacks ?? 0) : pick;
}

/** Trait names of a Transformation (its own and the inherited ones), without kind but with a "(n)" level. */
export function traitNames(s) {
  return [...(s?.traits ?? []), ...(s?.inherited ?? []).map(t => t.trait)].map(t => parseTrait(t).name);
}

/** Are the options of this choice Traits of the Transformation itself (Technical Traits, Wizarding Traits...)? */
export function isTraitChoice(s, choice) {
  const names = new Set(traitNames(s));
  return !!choice?.options?.length && choice.options.every(o => names.has(o));
}

/** The picks of each Stack: [[stack 1 picks], [stack 2 picks], ...]. */
export function stackGroups(choice) {
  const pick = Math.max(1, choice?.pick ?? 1);
  const sel = choice?.selected ?? [];
  const out = [];
  for ( let i = 0; i < sel.length; i += pick ) out.push(sel.slice(i, i + pick));
  return out;
}

/**
 * Options that cannot be picked for the next Stack: one already picked by another Stack (unless options repeat), or by
 * the Stack right before it ("noRepeatLast": Results of Training's Combat Roll).
 * @param {object} choice
 * @param {string[]} [current]  Options already picked for this Stack (several per Stack: Absorption's Attributes)
 */
export function blockedOptions(choice, current = []) {
  const blocked = new Set(current);
  const groups = stackGroups(choice);
  // An incomplete last group is the Stack being chosen now
  const pick = Math.max(1, choice?.pick ?? 1);
  const done = (groups.at(-1)?.length ?? pick) < pick ? groups.slice(0, -1) : groups;
  if ( !choice?.repeat ) for ( const g of done ) for ( const o of g ) blocked.add(o);
  if ( choice?.noRepeatLast && done.length ) for ( const o of done.at(-1) ) blocked.add(o);
  return blocked;
}

/**
 * How many times a modifier or trigger of this Transformation applies because of its per-Stack choices, or null when
 * no per-Stack choice concerns it (then its own "active" switch decides).
 * - An option effect ("Steady Progress — opção: Agility") applies once for every Stack that picked that option.
 * - A Trait that is an option (the Technical Trait "Focused Blaster") applies once it was picked, otherwise not.
 */
export function stackChoiceCount(s, label) {
  const choices = (s?.choices ?? []).filter(c => c.perStack || isTraitChoice(s, c));
  if ( !choices.length ) return null;
  const text = String(label ?? "");
  for ( const c of choices ) {
    const prefix = `${c.trait}${OPTION_SEP}`;
    if ( text.startsWith(prefix) ) {
      const option = text.slice(prefix.length);
      if ( c.options.includes(option) ) return (c.selected ?? []).filter(o => o === option).length;
    }
    if ( !isTraitChoice(s, c) ) continue;
    // "Focused Blaster", or one of its own options ("Focused Blaster — opção: ...")
    const own = c.options.find(o => (text === o) || text.startsWith(`${o} — `));
    if ( own ) {
      if ( !(c.selected ?? []).includes(own) ) return 0;
      // R: an option piece of the picked Trait ("<Trait> — opção: X") that one of its own choices lists: its "active"
      // (switched by that choice) decides
      const opt = text.startsWith(`${own}${OPTION_SEP}`) ? text.slice(own.length + OPTION_SEP.length) : null;
      if ( (opt !== null) && (s?.choices ?? []).some(x => (x.trait === own) && (x.options ?? []).includes(opt)) ) return null;
      return 1;
    }
  }
  return null;
}

/** Traits of this Transformation that are options (per Stack, or picked once out of a group) nobody picked: they do not
 * work. */
export function unchosenTraits(s) {
  const out = new Set();
  for ( const c of s?.choices ?? [] ) {
    if ( !isTraitChoice(s, c) ) continue;
    for ( const o of c.options ) if ( !(c.selected ?? []).includes(o) ) out.add(o);
  }
  return out;
}

/** Tier of Power Requirement of Stack n (1 = the first Stack): "2,3" → the second one needs ToP 3+. */
export function stackTopReq(s, n) {
  const list = String(s?.stackTop ?? "").split(",").map(x => parseInt(x, 10)).filter(Number.isFinite);
  if ( !list.length ) return s?.topReq ?? 1;
  return list[Math.max(0, n - 1)] ?? list.at(-1);
}

/**
 * Traits that start working (more Stacks) or stop working (fewer) between two numbers of Stacks: "Name (n)" ones, and
 * every Trait when the Awakening goes from or to 0 Stacks. Kinds that wait for something else (Grand Awakening,
 * Legendary...) are left out.
 */
export function traitsBetween(s, from, to) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  if ( lo === hi ) return [];
  const skip = unchosenTraits(s);
  return (s?.traits ?? []).map(parseTrait)
    .filter(t => ["trait", "burst limit"].includes(t.kind) && !skip.has(t.name))
    .filter(t => t.level ? ((t.level > lo) && (t.level <= hi)) : (lo === 0))
    .map(t => t.name);
}

const Z_RE = /(^|[^@\w.])Z(?![\w])|@Z(?![\w])/;

/** Labels of the effects whose value grows with the Stacks ("Increase your Surgency by Z(bT)"). */
export function zEffects(s) {
  const skip = unchosenTraits(s);
  const labels = new Set();
  for ( const x of [...(s?.modifiers ?? []), ...(s?.triggers ?? [])] ) {
    if ( !Z_RE.test(String(x.value ?? "")) ) continue;
    const name = String(x.label ?? "").split(OPTION_SEP)[0];
    if ( skip.has(name) ) continue;
    const count = stackChoiceCount(s, x.label);
    if ( (count === 0) || ((count === null) && (x.active === false)) ) continue;
    labels.add(x.label);
  }
  return Array.from(labels);
}

/**
 * Awakenings counted for the Awakening Limit: every Stack that is not Temporary (nor free) is an Awakening of its type.
 * @param {object[]} items  The actor's Transformation items
 * @param {object} [options]
 * @param {(item: object) => boolean} [options.skip]  Awakenings left out (Limit Breaking)
 */
export function awakeningCounts(items, { skip = () => false } = {}) {
  const out = { lesser: 0, greater: 0, super: 0 };
  for ( const t of items ?? [] ) {
    const s = t.system;
    if ( (s?.transType !== "awakening") || skip(t) ) continue;
    const n = limitStacksOf(s);
    if ( !n ) continue;
    if ( s.subtype === "greater" ) out.greater += n;
    else if ( s.subtype === "super" ) out.super += 1;
    else if ( s.subtype === "lesser" ) out.lesser += n;
  }
  return out;
}

/** Stacks of an Awakening that count towards the Awakening Limit (also for plain objects, outside the data model). */
export function limitStacksOf(s) {
  if ( !s || s.temporary ) return 0;
  const temp = Math.min(s.stacks ?? 0, s.tempStacks?.length ?? 0);
  return Math.max(0, (s.stacks ?? 0) - temp - (s.freeStacks ?? 0));
}

/** "Sacred Water" → "sacredwater": the key of an Awakening in the formula data (@awk.absorption). */
export function awakeningSlug(name) {
  return String(name ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

/** Stacks of every Awakening of an actor, by slug (for "for every stack of Absorption you possess"). */
export function awakeningStacks(items) {
  const out = {};
  for ( const t of items ?? [] ) {
    if ( (t.type !== "transformation") || (t.system?.transType !== "awakening") ) continue;
    const k = awakeningSlug(t.name);
    out[k] = (out[k] ?? 0) + Math.max(0, t.system.stacks ?? 0);
  }
  return out;
}

/**
 * The per-Stack data to drop when an Awakening goes down to `stacks` Stacks: the picks of the lost Stacks (for every
 * per-Stack choice), and the Stack notes and Temporary Stacks beyond that number.
 * @returns {{choices: object[], stackNotes: string[], tempStacks: object[], dropped: {choice: object, options: string[]}[]}}
 */
export function trimToStacks(s, stacks) {
  const n = Math.max(0, stacks);
  const dropped = [];
  const choices = (s?.choices ?? []).map(c => {
    if ( !c.perStack ) return c;
    const keep = picksNeeded(c, n);
    const sel = c.selected ?? [];
    if ( sel.length <= keep ) return c;
    dropped.push({ choice: c, options: sel.slice(keep) });
    return { ...c, selected: sel.slice(0, keep) };
  });
  const temp = s?.tempStacks ?? [];
  // The Temporary Stacks are the newest: losing Stacks loses them first
  const lost = Math.max(0, (s?.stacks ?? 0) - n);
  const tempStacks = temp.slice(0, Math.max(0, temp.length - lost));
  return { choices, stackNotes: (s?.stackNotes ?? []).slice(0, n), tempStacks, freeStacks: Math.min(s?.freeStacks ?? 0, n),
    dropped };
}
