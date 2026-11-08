import { postInfoCard } from "../dice/roller.mjs";
import { addTimed, dropTimedEntries, endMarkEffects, fireEvent } from "./triggers.mjs";

/*
 * Marks on other Characters (B1): "pick an Opponent as your Inferior", "the Studied Character", "a Shard Carrier".
 * The marks a Character placed live on that Character (the marker), never on the marked one:
 *   flags.dbu-rpg.marks = { <slug>: [{ uuid, name, target, duration }] }
 * slug = the mark's name in lowercase letters/digits ("Shard Carrier+" → "shardcarrier"); uuid = the marked actor (a
 * token actor for an unlinked token). A name is exclusive per marker (a new mark of that name moves it), unless it ends
 * with "+": then several Characters may carry it. A mark with a duration ends through the marker's timed entries
 * (kind "mark", key "<slug>|<uuid>"); the end of the Combat Encounter clears those.
 */

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const FLAG = "dbu-rpg";

/** "Shard Carrier+" → "shardcarrier". */
export const markSlug = name => String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** A mark several Characters may carry at once ("Shard Carrier+"). */
export const markMulti = name => String(name ?? "").trim().endsWith("+");
/** Its name without the "+". */
const markName = name => String(name ?? "").trim().replace(/\+$/, "").trim();
const uuidOf = x => (typeof x === "string") ? x : (x?.uuid ?? "");

/** The marks a Character placed: { <slug>: [{ uuid, name, target, duration }] } (a copy). */
export function marksOf(marker) {
  return foundry.utils.deepClone(marker?.getFlag?.(FLAG, "marks") ?? {});
}

/** Does `marker` have its mark `slug` (a slug or a mark name) on `target` (an actor or its uuid)? */
export function hasMark(marker, target, slug) {
  const list = marksOf(marker)[markSlug(slug)] ?? [];
  const uuid = uuidOf(target);
  return !!uuid && list.some(e => e.uuid === uuid);
}

/** How many Characters carry each of your marks: { <slug>: n } (formula data @marks.<slug>). */
export function markCounts(marker) {
  return Object.fromEntries(Object.entries(marksOf(marker)).map(([k, list]) => [k, (list ?? []).length]));
}

async function saveMarks(marker, marks) {
  const clean = Object.fromEntries(Object.entries(marks).filter(([, list]) => list?.length));
  // Replaced as a whole (a removed slug must go)
  if ( marker.getFlag(FLAG, "marks") !== undefined ) await marker.unsetFlag(FLAG, "marks");
  if ( Object.keys(clean).length ) await marker.setFlag(FLAG, "marks", clean);
}

/**
 * Place a mark: `marker` marks `target` with `name`. An exclusive name leaves the Character that carried it.
 * @returns {Promise<{text: string, slug: string, moved: string[]}>}
 */
export async function placeMark(marker, target, name, { duration = "none", label = "", event = "", quiet = false } = {}) {
  const slug = markSlug(name);
  const uuid = uuidOf(target);
  if ( !marker || !slug || !uuid ) return { text: "", slug, moved: [] };
  const marks = marksOf(marker);
  const list = marks[slug] ?? [];
  const moved = [];
  // An exclusive mark leaves the other Characters (and so do its timer and what it gave them)
  const leaving = markMulti(name) ? [] : list.filter(e => e.uuid !== uuid);
  for ( const e of leaving ) moved.push(e.target);
  const kept = list.filter(e => !leaving.includes(e) && (e.uuid !== uuid));
  const entry = { uuid, name: markName(name), target: target?.name ?? "", duration: duration || "none" };
  marks[slug] = [...kept, entry];
  await saveMarks(marker, marks);
  await dropTimedEntries(marker, e => (e.kind === "mark") && leaving.some(l => e.key === `${slug}|${l.uuid}`));
  for ( const e of leaving ) await endMarkEffects(e.uuid, `${marker.uuid}|${slug}`);
  if ( duration && (duration !== "none") ) {
    await addTimed(marker, { kind: "mark", key: `${slug}|${uuid}`, prev: 0, level: 1, duration, event,
      label: entry.name, target: entry.target });
  }
  else await dropTimedEntries(marker, e => (e.kind === "mark") && (e.key === `${slug}|${uuid}`));
  const text = [L("DBU.Marks.Placed", { marker: marker.name, target: entry.target, mark: entry.name }),
    moved.length ? L("DBU.Marks.Moved", { from: moved.join(", ") }) : ""].filter(Boolean).join(" ");
  // "When you place a mark" (Studied Allies...): other = the marked Character (not for a mark a markPlaced trigger placed)
  if ( !quiet ) fireEvent(marker, "markPlaced", { other: typeof target === "string" ? null : target,
    scope: { [`mark_${slug}`]: 1, markKey: `${marker.uuid}|${slug}` } });
  return { text, slug, moved };
}

/**
 * Remove a mark: from `target` only, or (no target) from every Character that carries it.
 * @returns {Promise<string>}  What happened, "" when there was nothing to remove
 */
export async function removeMark(marker, name, target = null) {
  const slug = markSlug(name);
  const marks = marksOf(marker);
  const list = marks[slug] ?? [];
  const uuid = target ? uuidOf(target) : null;
  const gone = list.filter(e => !uuid || (e.uuid === uuid));
  if ( !gone.length ) return "";
  marks[slug] = list.filter(e => !gone.includes(e));
  await saveMarks(marker, marks);
  await dropTimedEntries(marker, e => (e.kind === "mark") && gone.some(g => e.key === `${slug}|${g.uuid}`));
  for ( const e of gone ) await endMarkEffects(e.uuid, `${marker.uuid}|${slug}`);
  return L("DBU.Marks.Removed", { mark: gone[0].name || markName(name), target: gone.map(e => e.target).join(", ") });
}

/**
 * A timed mark ended (expireTimed / clearTimed: entry { kind: "mark", key: "<slug>|<uuid>" }).
 * @returns {Promise<boolean>}  true when it was still there
 */
export async function expireMark(marker, entry) {
  const [slug, ...rest] = String(entry.key ?? "").split("|");
  const uuid = rest.join("|");
  const marks = marksOf(marker);
  const list = marks[slug] ?? [];
  if ( !list.some(e => e.uuid === uuid) ) return false;
  marks[slug] = list.filter(e => e.uuid !== uuid);
  await saveMarks(marker, marks);
  await endMarkEffects(uuid, `${marker.uuid}|${slug}`);
  return true;
}

/** Remove the marks a Character placed (all of them, or only the ones with a duration). Returns how many. */
export async function clearMarks(marker, { timedOnly = false } = {}) {
  const marks = marksOf(marker);
  let n = 0;
  for ( const [slug, list] of Object.entries(marks) ) {
    const gone = (list ?? []).filter(e => !timedOnly || (e.duration && (e.duration !== "none")));
    if ( !gone.length ) continue;
    n += gone.length;
    marks[slug] = list.filter(e => !gone.includes(e));
    for ( const e of gone ) await endMarkEffects(e.uuid, `${marker.uuid}|${slug}`);
  }
  if ( n ) {
    await saveMarks(marker, marks);
    await dropTimedEntries(marker, e => e.kind === "mark");
  }
  return n;
}

/** A chat line of the marks a Character holds ("Inferior → Krillin"), for a card. */
export function markLines(marker) {
  return Object.values(marksOf(marker)).flatMap(list => (list ?? []).map(e => `${e.name} → ${e.target}`));
}

/** Post the marks of a Character (a reminder card). */
export async function postMarks(marker) {
  const lines = markLines(marker);
  if ( lines.length ) await postInfoCard({ actor: marker, title: L("DBU.Marks.Title", { name: marker.name }), lines });
}
