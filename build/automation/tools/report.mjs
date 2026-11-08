// What is automated, per Transformation type, and the engine gaps: every effect still marked "code", grouped by
// category with its spec (what the system would need to learn). Input for the dbu-automation-gaps agent.
//
// usage: node report.mjs --dump <effects.json> [--out gaps.md] [--type form,enhancement]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); if ( i < 0 ) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const DUMP = opt("--dump"), OUT = opt("--out"), TYPES = opt("--type");
if ( !DUMP ) { console.error("usage: node report.mjs --dump <effects.json> [--out gaps.md] [--type ...]"); process.exit(1); }

const AUTOMATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const automation = {};
for ( const f of fs.readdirSync(AUTOMATION).filter(f => f.endsWith(".json")).sort() ) {
  Object.assign(automation, JSON.parse(fs.readFileSync(path.join(AUTOMATION, f), "utf8")));
}
const types = TYPES ? new Set(TYPES.split(",")) : null;
const effects = JSON.parse(fs.readFileSync(DUMP, "utf8")).filter(e => !types || types.has(e.transType ?? "awakening"));

const table = {};
const gaps = {};
for ( const e of effects ) {
  const a = automation[e.key];
  const type = e.transType ?? "awakening";
  const verdict = a ? (a.status === "narrativo" ? "narrative" : a.verdict) : (e.status === "auto" ? "patterns" : "none");
  table[type] ??= {};
  table[type][verdict] = (table[type][verdict] ?? 0) + 1;
  if ( a?.verdict === "code" ) {
    const cat = a.code?.category ?? "other";
    (gaps[cat] ??= []).push({ key: e.key, spec: a.code?.spec ?? "", partial: !!(a.modifiers?.length || a.triggers?.some(t => t.effect !== "message")) });
  }
}
const lines = ["# Automation report", "", "Verdicts per type (none = no entry yet; patterns = the text patterns only):", ""];
for ( const [type, counts] of Object.entries(table) ) {
  lines.push(`- **${type}**: ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
}
lines.push("", "## Engine gaps (entries still \"code\")", "");
for ( const [cat, list] of Object.entries(gaps).sort((a, b) => b[1].length - a[1].length) ) {
  lines.push(`### ${cat} (${list.length})`, "");
  for ( const g of list ) lines.push(`- \`${g.key}\`${g.partial ? " (in part)" : ""}: ${g.spec}`);
  lines.push("");
}
const text = lines.join("\n");
if ( OUT ) { fs.writeFileSync(OUT, text); console.log(`${OUT}: ${Object.values(gaps).flat().length} gaps`); }
else console.log(text);
