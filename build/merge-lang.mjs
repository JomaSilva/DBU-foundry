// Merges the translation fragments of the feature packages (build/lang/a.json, b.json, c.json) into
// dbu-rpg/lang/pt-BR.json and dbu-rpg/lang/en.json. No package edits the lang files directly.
//
// usage: node build/merge-lang.mjs [--check] [fragment.json ...]   (default: every build/lang/*.json, sorted)
//   --check  writes nothing; exits 1 when the lang files are not up to date with the fragments
//
// A fragment is { "pt-BR": { ... }, "en": { ... } }, nested like the lang files ({ "DBU": { "Target": { "vsWound": "..." } } }).
// Deep merge: the keys already in the lang files stay where they are (a fragment's value replaces a different one, and
// the run says so); new keys go at the end of their object. A key only in "pt-BR" gets the same text in en.json (the
// lang files mirror pt-BR when there is no English text). Two fragments giving one key different texts, or a text where
// the lang file has an object (or the other way round), is an error and nothing is written. Running it again changes
// nothing. The files keep their format: 2-space JSON, UTF-8, their line endings and the trailing newline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANG_DIR = path.join(ROOT, "dbu-rpg", "lang");
const FRAG_DIR = path.join(ROOT, "build", "lang");
const LANGS = ["pt-BR", "en"];

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const sources = args.filter(a => a !== "--check");
const fragments = sources.length ? sources.map(f => path.resolve(f))
  : (fs.existsSync(FRAG_DIR) ? fs.readdirSync(FRAG_DIR).filter(f => f.endsWith(".json")).sort().map(f => path.join(FRAG_DIR, f)) : []);

const errors = [];
const warnings = [];
const isObject = v => (v !== null) && (typeof v === "object") && !Array.isArray(v);
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));

/** Every leaf of a nested object: [["DBU", "Target", "vsWound"], "text"]. */
function leaves(obj, at = [], out = []) {
  for ( const [k, v] of Object.entries(obj) ) {
    if ( isObject(v) ) leaves(v, [...at, k], out);
    else out.push([[...at, k], v]);
  }
  return out;
}

// ---- Read the fragments: one tree of texts per language, and where each text came from ----------------------------
const wanted = Object.fromEntries(LANGS.map(l => [l, new Map()]));
for ( const file of fragments ) {
  const name = path.relative(ROOT, file).replace(/\\/g, "/");
  let frag;
  try { frag = readJson(file); }
  catch(err) { errors.push(`${name}: invalid JSON (${err.message})`); continue; }
  if ( !isObject(frag) ) { errors.push(`${name}: not an object`); continue; }
  for ( const k of Object.keys(frag) ) if ( !LANGS.includes(k) ) errors.push(`${name}: unknown language "${k}" (use ${LANGS.join(", ")})`);
  for ( const lang of LANGS ) {
    const tree = frag[lang] ?? {};
    if ( !isObject(tree) ) { errors.push(`${name}: "${lang}" is not an object`); continue; }
    for ( const [keys, text] of leaves(tree) ) {
      const key = keys.join(".");
      if ( typeof text !== "string" ) { errors.push(`${name}: ${lang} ${key} is not a text`); continue; }
      const prev = wanted[lang].get(key);
      if ( prev && (prev.text !== text) ) errors.push(`${lang} ${key}: "${prev.text}" in ${prev.from}, "${text}" in ${name}`);
      else if ( !prev ) wanted[lang].set(key, { keys, text, from: name });
    }
  }
}
// en mirrors pt-BR where a fragment gives no English text; pt-BR (what the GM reads) should always have one
for ( const [key, w] of wanted["pt-BR"] ) {
  if ( !wanted.en.has(key) ) wanted.en.set(key, { ...w, mirrored: true });
}
for ( const [key, w] of wanted.en ) {
  if ( w.mirrored || wanted["pt-BR"].has(key) ) continue;
  warnings.push(`${w.from}: ${key} has no pt-BR text (the English one is used)`);
  wanted["pt-BR"].set(key, w);
}
// Same order in both files: pt-BR's
const order = [...wanted["pt-BR"].keys()];

// ---- Merge into the lang files -------------------------------------------------------------------------------------
const results = [];
for ( const lang of LANGS ) {
  const file = path.join(LANG_DIR, `${lang}.json`);
  const raw = fs.readFileSync(file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const bom = raw.startsWith("﻿");
  const data = JSON.parse(raw.replace(/^﻿/, ""));
  const added = [];
  const changed = [];
  for ( const key of order ) {
    const { keys, text, from } = wanted[lang].get(key);
    let node = data;
    let ok = true;
    for ( const [i, k] of keys.slice(0, -1).entries() ) {
      if ( !(k in node) ) node[k] = {};
      else if ( !isObject(node[k]) ) {
        errors.push(`${from}: ${lang} ${key}: ${keys.slice(0, i + 1).join(".")} is a text in ${lang}.json, not an object`);
        ok = false;
        break;
      }
      node = node[k];
    }
    if ( !ok ) continue;
    const leaf = keys.at(-1);
    if ( isObject(node[leaf]) ) { errors.push(`${from}: ${lang} ${key} is an object in ${lang}.json, not a text`); continue; }
    if ( !(leaf in node) ) added.push(key);
    else if ( node[leaf] !== text ) changed.push(`${key}: "${node[leaf]}" → "${text}" (${from})`);
    node[leaf] = text;
  }
  const out = (bom ? "﻿" : "") + JSON.stringify(data, null, 2).replace(/\n/g, eol) + (raw.endsWith("\n") ? eol : "");
  results.push({ lang, file, out, same: out === raw, added, changed });
}

// ---- Report and write ----------------------------------------------------------------------------------------------
console.log(`fragments: ${fragments.length} (${fragments.map(f => path.basename(f)).join(", ") || "none"}), keys: ${order.length}`);
for ( const w of warnings ) console.log(`warning: ${w}`);
if ( errors.length ) {
  console.log(`errors: ${errors.length} (nothing written)`);
  for ( const e of errors ) console.log(`  ${e}`);
  process.exit(1);
}
for ( const r of results ) {
  console.log(`${r.lang}.json: ${r.added.length} added, ${r.changed.length} changed${r.same ? " (up to date)" : ""}`);
  for ( const c of r.changed ) console.log(`  changed ${c}`);
  if ( !r.same && !CHECK ) fs.writeFileSync(r.file, r.out, "utf8");
}
if ( CHECK && results.some(r => !r.same) ) {
  console.log("not up to date: run node build/merge-lang.mjs");
  process.exit(1);
}
