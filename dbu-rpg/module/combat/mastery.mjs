import { postInfoCard } from "../dice/roller.mjs";
import { aspectLabel, masteryAmount } from "../rules/aspects.mjs";

const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);

const aspectName = (key, level, param) => aspectLabel({ key, level, param });

/** Mastery Traits of a Transformation reached at each Mastery level ("Name (2)" needs 2 Masteries); its Transcendent
 * Trait needs one more Mastery once Fully Mastered. */
function traitsByLevel(item) {
  const out = {};
  const s = item.system;
  for ( const t of s.allTraits ?? s.traits ?? [] ) {
    if ( /\[transcendent trait\]/.test(t) ) {
      (out[s.masteryNeeded + 1] ??= []).push(`${t.replace(/\s*\[transcendent trait\]/, "")} (Transcendent Trait)`);
      continue;
    }
    if ( !/\[mastery trait\]/.test(t) ) continue;
    const name = t.replace(/\s*\[mastery trait\]/, "");
    const level = Number(/\((\d)\)\s*$/.exec(name)?.[1] ?? 1);
    (out[level] ??= []).push(name);
  }
  return out;
}

/** What one Mastery level changes on the Aspects (the "M levels" effects of earlier levels grow with it). */
function aspectLines(item, level, up = true) {
  const step = c => masteryAmount(c, level) - ((c.mastery === level) ? 0 : masteryAmount(c, level - 1));
  const changes = (item.system.masteryAspects ?? []).filter(c => (c.mastery === level)
    || (c.perMastery && (c.mastery < level) && (step(c) > 0)));
  const levels = c => L("DBU.Mastery.Reduced", { aspect: aspectName(c.key), n: step(c) });
  const lost = changes.filter(c => c.op === "remove").map(c => aspectName(c.key, 0, c.param));
  const reduced = changes.filter(c => c.op === "reduce").map(levels);
  const gained = [...changes.filter(c => c.op === "add").map(c => aspectName(c.key, c.level, c.param)),
    ...changes.filter(c => c.op === "raise").map(levels)];
  const lines = [];
  // Going down a level undoes its changes
  const [lose, gain] = up ? ["DBU.Mastery.Loses", "DBU.Mastery.Gains"] : ["DBU.Mastery.Regains", "DBU.Mastery.Drops"];
  if ( lost.length || reduced.length ) lines.push(L(lose, { list: [...lost, ...reduced].join(", ") }));
  if ( gained.length ) lines.push(L(gain, { list: gained.join(", ") }));
  return lines;
}

/** Mastery-gated modifiers and triggers that switch on at a level ("@M >= n", the Transcendent Trait's "@MX >= 1"). */
function automatedCount(item, level) {
  const extra = level - item.system.masteryNeeded;
  const re = new RegExp(extra > 0 ? `@MX\\s*>=\\s*${extra}\\b` : `@M\\s*>=\\s*${level}\\b`);
  const at = list => (list ?? []).filter(x => re.test(x.condition ?? "")).length;
  return at(item.system.modifiers) + at(item.system.triggers);
}

/** Chat card describing the Mastery levels gained (or lost) and what they changed. */
export async function announceMastery(actor, item, before, after) {
  const up = after > before;
  const levels = up ? Array.fromRange(after - before, before + 1) : Array.fromRange(before - after, after + 1).reverse();
  const traits = traitsByLevel(item);
  const lines = [];
  for ( const level of levels ) {
    const names = traits[level] ?? [];
    lines.push(`${L("DBU.Mastery.Level", { n: level })}${names.length ? ` — ${names.join(", ")}` : ""}`);
    lines.push(...aspectLines(item, level, up));
    const n = automatedCount(item, level);
    if ( n ) lines.push(L(up ? "DBU.Mastery.AutoOn" : "DBU.Mastery.AutoOff", { n }));
  }
  if ( up && (after >= item.system.masteryNeeded) ) lines.push(L("DBU.Mastery.Full"));
  if ( up && (after > item.system.masteryNeeded) ) lines.push(L("DBU.Mastery.Transcendent"));
  if ( up ) lines.push(L("DBU.Mastery.Manual"));
  return postInfoCard({
    actor, img: item.img,
    title: L(up ? "DBU.Mastery.TitleUp" : "DBU.Mastery.TitleDown", { name: item.name, n: after, max: item.system.masteryMax }),
    lines
  });
}
