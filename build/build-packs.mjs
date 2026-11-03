/**
 * Build the LevelDB compendium packs of the DBU system.
 *
 * - Item packs come from build/packs-src/<pack>.json (made by extract_content.py).
 * - The "guide" JournalEntry pack is made from docs/COMO-USAR.md and docs/REGRAS.md (one page per "## " section).
 *
 * Foundry must not be running with the system loaded while the packs are written (LevelDB locks).
 *
 * usage: node build-packs.mjs [classic-level module path]
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC = path.join(HERE, "packs-src");
const OUT = path.join(ROOT, "dbu-rpg", "packs");
const LEVEL = process.argv[2] ?? "E:/Foundry/Foundry Virtual Tabletop/resources/app/node_modules/classic-level";
const { ClassicLevel } = require(LEVEL);

const SYSTEM = JSON.parse(fs.readFileSync(path.join(ROOT, "dbu-rpg", "system.json"), "utf8"));
const STATS = { systemId: SYSTEM.id, systemVersion: SYSTEM.version, coreVersion: "14.369", createdTime: Date.now(),
  modifiedTime: Date.now(), lastModifiedBy: null, compendiumSource: null, duplicateSource: null, exportSource: null };

/** Deterministic 16-character Foundry id. */
function fid(key) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let n = BigInt(`0x${createHash("sha1").update(key).digest("hex")}`);
  let out = "";
  for ( let i = 0; i < 16; i++ ) {
    out += alphabet[Number(n % 62n)];
    n /= 62n;
  }
  return out;
}

/** Foundry keeps the packs of a running world locked: stop before deleting anything if one is in use. */
async function assertUnlocked() {
  if ( !fs.existsSync(OUT) ) return;
  for ( const name of fs.readdirSync(OUT) ) {
    const dir = path.join(OUT, name);
    if ( !fs.existsSync(path.join(dir, "CURRENT")) ) continue;
    const db = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
    try {
      await db.open();
    } catch(err) {
      console.error(`Pack "${name}" is in use (close Foundry first); nothing was changed. ${err.cause?.message ?? err.message}`);
      process.exit(1);
    }
    await db.close();
  }
}

async function writePack(name, entries) {
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const db = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  const batch = db.batch();
  for ( const [key, value] of entries ) batch.put(key, value);
  await batch.write();
  await db.compactRange("\x00", "\xff");
  await db.close();
  return entries.length;
}

/* -------------------------------------------- */
/*  Item packs                                  */
/* -------------------------------------------- */

async function buildItemPack(name) {
  const docs = JSON.parse(fs.readFileSync(path.join(SRC, `${name}.json`), "utf8"));
  const entries = [];
  for ( const doc of docs ) {
    const { _type, ...data } = doc;
    if ( _type === "Folder" ) {
      entries.push([`!folders!${data._id}`, { ...data, _stats: STATS }]);
      continue;
    }
    const item = { ownership: { default: 0 }, effects: [], flags: {}, sort: 0, ...data, _stats: STATS };
    entries.push([`!items!${item._id}`, item]);
  }
  const n = await writePack(name, entries);
  console.log(`${name}: ${n} documents`);
}

/* -------------------------------------------- */
/*  Guide (Journal) pack                        */
/* -------------------------------------------- */

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s) {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>");
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return t;
}

/** Small Markdown → HTML converter for the docs (headings, paragraphs, nested lists, tables, quotes, code). */
function markdownToHtml(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const out = [];
  let para = [];
  const lists = [];
  const flushPara = () => {
    if ( para.length ) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const closeLists = (depth = 0) => {
    while ( lists.length > depth ) out.push(`</li></${lists.pop()}>`);
  };
  for ( let i = 0; i < lines.length; i++ ) {
    const line = lines[i];
    if ( /^```/.test(line) ) {
      flushPara(); closeLists();
      const code = [];
      while ( (++i < lines.length) && !/^```/.test(lines[i]) ) code.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if ( h ) {
      flushPara(); closeLists();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      continue;
    }
    if ( /^\s*\|/.test(line) ) {
      flushPara(); closeLists();
      const rows = [];
      while ( (i < lines.length) && /^\s*\|/.test(lines[i]) ) rows.push(lines[i++]);
      i--;
      const cells = r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const body = rows.filter(r => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      const [head, ...rest] = body;
      out.push(`<table><thead><tr>${cells(head).map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`
        + rest.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") + "</tbody></table>");
      continue;
    }
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if ( li ) {
      flushPara();
      const depth = Math.floor(li[1].length / 2) + 1;
      const tag = /\d/.test(li[2]) ? "ol" : "ul";
      if ( depth > lists.length ) {
        while ( depth > lists.length ) {
          out.push(`<${tag}><li>`);
          lists.push(tag);
        }
      }
      else {
        closeLists(depth);
        out.push("</li><li>");
      }
      out.push(inline(li[3]));
      continue;
    }
    if ( /^>\s?/.test(line) ) {
      flushPara(); closeLists();
      out.push(`<blockquote><p>${inline(line.replace(/^>\s?/, ""))}</p></blockquote>`);
      continue;
    }
    if ( !line.trim() ) {
      flushPara();
      // A blank line ends a list only when the next line is not a list item
      if ( lists.length && !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i + 1] ?? "") ) closeLists();
      continue;
    }
    if ( lists.length && /^\s{2,}\S/.test(line) ) {
      out.push(` ${inline(line.trim())}`);
      continue;
    }
    closeLists();
    para.push(line.trim());
  }
  flushPara(); closeLists();
  return out.join("\n");
}

/** Split a Markdown document into pages at each "## " heading (the text before the first one becomes an intro page). */
function pagesFrom(md, introName) {
  const pages = [];
  let current = { name: introName, lines: [] };
  for ( const line of md.replace(/\r/g, "").split("\n") ) {
    const h = /^##\s+(.*)$/.exec(line);
    if ( h ) {
      if ( current.lines.some(l => l.trim()) ) pages.push(current);
      current = { name: h[1].replace(/\*\*/g, "").trim(), lines: [] };
      continue;
    }
    if ( /^#\s+/.test(line) && !pages.length && !current.lines.length ) continue; // document title
    current.lines.push(line);
  }
  if ( current.lines.some(l => l.trim()) ) pages.push(current);
  return pages;
}

function journal(key, name, file, introName, sort) {
  const md = fs.readFileSync(path.join(ROOT, "docs", file), "utf8");
  const _id = fid(`journal:${key}`);
  const pages = pagesFrom(md, introName).map((p, i) => ({
    _id: fid(`journal:${key}:${i}:${p.name}`), name: p.name, type: "text", sort: (i + 1) * 100000,
    title: { show: true, level: 1 }, text: { format: 1, content: markdownToHtml(p.lines.join("\n")), markdown: "" },
    image: {}, video: { controls: true, volume: 0.5 }, src: null, system: {}, ownership: { default: -1 }, flags: {},
    category: null, _stats: STATS
  }));
  const entry = { _id, name, pages: pages.map(p => p._id), folder: null, sort, categories: [], ownership: { default: 0 },
    flags: {}, _stats: STATS };
  return [[`!journal!${_id}`, entry], ...pages.map(p => [`!journal.pages!${_id}.${p._id}`, p])];
}

async function buildGuide() {
  const entries = [
    ...journal("como-usar", "Como usar o sistema DBU", "COMO-USAR.md", "Visão geral", 100000),
    ...journal("regras", "Regras e Relações (resumo)", "REGRAS.md", "Introdução", 200000)
  ];
  const n = await writePack("guide", entries);
  console.log(`guide: ${n} documents`);
}

/* -------------------------------------------- */

await assertUnlocked();
for ( const pack of SYSTEM.packs ) {
  if ( pack.type === "Item" ) await buildItemPack(pack.name);
}
await buildGuide();
