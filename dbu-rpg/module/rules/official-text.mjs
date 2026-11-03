/**
 * Fetch the official text of an entry from dbu-rpg.com on demand (the compendiums ship only the mechanical data
 * and a link; the full text belongs to the DBU team and is loaded into the user's own world when they ask for it).
 */
const API = "https://public-api.wordpress.com/wp/v2/sites/dbu-rpg.com/pages";

/** Pages already downloaded in this session (many entries share one page, e.g. every Talent). */
const pages = new Map();

function getPage(slug) {
  if ( !pages.has(slug) ) {
    pages.set(slug, (async () => {
      try {
        const res = await fetch(`${API}?slug=${encodeURIComponent(slug)}&_fields=content,link,title`);
        if ( !res.ok ) return null;
        const data = await res.json();
        return data?.[0]?.content?.rendered ?? null;
      } catch(err) {
        console.error("DBU | fetchOfficialText", err);
        return null;
      }
    })());
  }
  return pages.get(slug).then(html => {
    if ( !html ) pages.delete(slug); // try again next time
    return html;
  });
}

export async function fetchOfficialText(slug, section = "") {
  const html = await getPage(slug);
  if ( !html ) return null;
  const blocks = pageBlocks(html);
  const out = (section && sectionBlocks(blocks, section)) || blocks;
  const link = `<p><a href="https://dbu-rpg.com/${slug}/" target="_blank" rel="noopener">dbu-rpg.com/${slug}</a></p>`;
  return out.map(b => b.outerHTML).join("\n") + link;
}

/** The top-level blocks of a page's HTML. */
function pageBlocks(html) {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root");
  root.querySelectorAll("script, style, iframe, form, button").forEach(e => e.remove());
  return flattenBlocks(root);
}

/** The blocks of one entry or section of a page, or null when it is not there. */
function sectionBlocks(blocks, section) {
  const name = normalize(section);
  const start = blocks.findIndex(b => startsWithEntry(b, name));
  if ( start < 0 ) return null;
  const first = blocks[start];
  // A section that is a heading of its own (a Transformation Stage) keeps its traits and Mastery Traits:
  // it runs until the next heading of the same or a higher level. An entry ("**Name**: ...") ends at the next one.
  const level = (headingLevel(first) && normalize(first.textContent).startsWith(name)) ? headingLevel(first) : 0;
  const out = [first];
  for ( let i = start + 1; i < blocks.length; i++ ) {
    const b = blocks[i];
    if ( level ) {
      const l = headingLevel(b);
      if ( l && (l <= level) ) break;
    }
    else if ( isHeading(b) || isEntryStart(b) ) break;
    out.push(b);
  }
  return out;
}

/** "Burst LimitScarlet Multiplier: ..." — a Transformation Trait's heading starts with its kind. */
const KIND_PREFIX = /^(?:mastery traits?|mastery|burst limit|legendary trait|grand awakening|transcendent trait)\s*/;

/** The blocks of one Transformation Trait (its heading or "**Name**:" entry and its effects), or null. */
function traitBlocks(blocks, trait) {
  const name = normalize(trait);
  const lead = b => normalize(b.textContent).replace(KIND_PREFIX, "");
  const start = blocks.findIndex(b => (isHeading(b) || b.querySelector("strong, b")) && lead(b).startsWith(name)
    && /^\s*(?::|$)/.test(lead(b).slice(name.length)));
  if ( start < 0 ) return null;
  const out = [blocks[start]];
  for ( let i = start + 1; i < blocks.length; i++ ) {
    const b = blocks[i];
    if ( isHeading(b) || isEntryStart(b) ) break;
    out.push(b);
  }
  return out;
}

/**
 * The official text of one Transformation Trait: from an item's own loaded text when it has it, else from its page
 * (within the Transformation's section first: a Trait name may come back in another Stage of the same page).
 * @param {{name: string, slug?: string, section?: string, html?: string}} trait
 * @returns {Promise<string|null>}
 */
export async function officialTraitText({ name, slug = "", section = "", html = "" }) {
  const find = source => {
    const all = pageBlocks(source);
    const part = section ? sectionBlocks(all, section) : null;
    return (part && traitBlocks(part, name)) || traitBlocks(all, name);
  };
  let out = (html && !isStubDescription(html)) ? find(html) : null;
  if ( !out && slug ) {
    const page = await getPage(slug);
    if ( page ) out = find(page);
  }
  return out ? out.map(b => b.outerHTML).join("\n") : null;
}

/** The official text of an item, or null (no source, offline...). */
export function officialTextOf(item) {
  const src = item.system?.source;
  if ( !src?.slug ) return Promise.resolve(null);
  return fetchOfficialText(src.slug, src.section || item.name);
}

/** The compendium entries only carry a link and the list of automated effects until the official text is loaded. */
export function isStubDescription(html) {
  return !html || html.includes("Texto completo da regra");
}

/** The official text with the compendium's list of automated effects kept underneath. */
export function withOfficialText(stub, official) {
  const keep = String(stub ?? "")
    .replace(/<p><a [^>]*>[^<]*<\/a><\/p>/, "")
    .replace(/<p><em>Texto completo da regra[\s\S]*?<\/em><\/p>/, "")
    .trim();
  return keep ? `${official}<hr>${keep}` : official;
}

let queue = Promise.resolve();

/**
 * Items added to the world or to a sheet without the official text get it on their own
 * (one download at a time; compendium entries are only shown, never written).
 */
export function autoOfficialText(item) {
  if ( item.pack || !isStubDescription(item.system?.description) || !item.system?.source?.slug || !item.isOwner ) return;
  if ( !game.settings.get("dbu-rpg", "autoOfficialText") ) return;
  queue = queue.then(async () => {
    const html = await officialTextOf(item);
    const current = item.system.description;
    if ( html && isStubDescription(current) ) await item.update({ "system.description": withOfficialText(current, html) });
  }).catch(err => console.error("DBU | autoOfficialText", err));
}

function flattenBlocks(root) {
  const blocks = [];
  const walk = (el) => {
    for ( const child of el.children ) {
      const tag = child.tagName.toLowerCase();
      if ( ["div", "section", "article", "details", "figure"].includes(tag) && child.children.length ) walk(child);
      else blocks.push(child);
    }
  };
  walk(root);
  return blocks;
}

const normalize = s => String(s).toLowerCase().replace(/[’']/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const isHeading = b => /^h[1-6]$/i.test(b.tagName);
const headingLevel = b => Number(/^h([1-6])$/i.exec(b.tagName)?.[1] ?? 0);

function firstStrong(b) {
  const s = b.querySelector("strong, b");
  return s ? normalize(s.textContent) : "";
}

/**
 * Does this block start the entry? Also matches an entry glued to a section title in the same block
 * ("Primary Racial Traits" + "Born for Battle (Body): ...").
 */
function startsWithEntry(b, name) {
  const text = normalize(b.textContent);
  const strongs = Array.from(b.querySelectorAll("strong, b")).map(s => normalize(s.textContent));
  return (text.startsWith(name) && (isHeading(b) || strongs.length > 0)) || strongs.some(s => s.startsWith(name));
}

/** A block that starts a new "**Name**:" entry or a new heading. */
function isEntryStart(b) {
  const first = b.firstElementChild;
  if ( !first || !["STRONG", "B"].includes(first.tagName) ) return false;
  const lead = (b.textContent || "").trim();
  return /^[^:–—]{2,80}:/.test(lead) && !/^(–|-)/.test(lead) && !/^\(\d+\)/.test(lead);
}
