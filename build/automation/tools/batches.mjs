// Finds the Transformation effects that need automation work and splits them into batches for the
// dbu-automation-mapper agent (a whole Transformation always stays in one batch).
//
// usage: node batches.mjs --dump <effects.json> --outdir <dir> [--type form,enhancement] [--new] [--code] [--n 6 | --size 400]
//   --type   only these types (awakening, form, enhancement, evolved; racial = Racial Traits)
//   --new    only effects without an entry in build/automation/*.json (a site update added or renumbered them)
//   --code   only effects whose entry is still "code" (to revisit after the system learned new vocabulary); the entry is
//            given as "current"
//   --n      number of batches (default 1), or --size effects per batch
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if ( i < 0 ) return false; args.splice(i, 1); return true; };
const opt = name => { const i = args.indexOf(name); if ( i < 0 ) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const DUMP = opt("--dump"), OUTDIR = opt("--outdir"), TYPES = opt("--type"), N = Number(opt("--n") || 0), SIZE = Number(opt("--size") || 0);
const NEW = flag("--new"), CODE = flag("--code");
if ( !DUMP || !OUTDIR ) {
  console.error("usage: node batches.mjs --dump <effects.json> --outdir <dir> [--type ...] [--new] [--code] [--n N | --size S]");
  process.exit(1);
}

const AUTOMATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const automation = {};
for ( const f of fs.readdirSync(AUTOMATION).filter(f => f.endsWith(".json")).sort() ) {
  Object.assign(automation, JSON.parse(fs.readFileSync(path.join(AUTOMATION, f), "utf8")));
}

const types = TYPES ? new Set(TYPES.split(",").map(s => s.trim())) : null;
let effects = JSON.parse(fs.readFileSync(DUMP, "utf8")).filter(e => !types || types.has(e.transType ?? "awakening"));
// --new and --code together: either one
if ( NEW || CODE ) effects = effects.filter(e => (NEW && !automation[e.key]) || (CODE && (automation[e.key]?.verdict === "code")));

// One Transformation per batch at most, in name order (Racial Traits: a whole race, factor or group stays together)
const byItem = new Map();
for ( const e of effects ) {
  const group = (e.transType === "racial") ? String(e.item).split(" › ")[0] : e.item;
  if ( !byItem.has(group) ) byItem.set(group, []);
  byItem.get(group).push(e);
}
const items = [...byItem.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const per = SIZE || Math.ceil(effects.length / Math.max(1, N || 1));
const batches = [[]];
let size = 0;
for ( const [, list] of items ) {
  if ( (size >= per) && (!N || (batches.length < N)) ) { batches.push([]); size = 0; }
  batches.at(-1).push(...list);
  size += list.length;
}

fs.mkdirSync(OUTDIR, { recursive: true });
const strip = ({ label, active, always, ...rest }) => rest;
batches.filter(b => b.length).forEach((b, i) => {
  const out = b.map(e => ({
    key: e.key, item: e.item, transType: e.transType ?? "awakening", subtype: e.subtype ?? "", trait: e.trait, kind: e.kind,
    ...(e.transType === "racial" ? { race: e.race ?? "", group: e.group ?? "" } : {}),
    n: e.n, keywords: e.keywords, text: e.text, traitCondition: e.condition, maxStacks: e.maxStacks, status: e.status,
    compiled: { modifiers: (e.modifiers ?? []).map(strip), triggers: (e.triggers ?? []).map(strip) },
    ...(automation[e.key] ? { current: automation[e.key] } : {})
  }));
  const file = path.join(OUTDIR, `batch-${i + 1}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`${file}: ${out.length} effects (${b[0].item} .. ${b.at(-1).item})`);
});
console.log(`${effects.length} effects in ${batches.filter(b => b.length).length} batch(es)`);
