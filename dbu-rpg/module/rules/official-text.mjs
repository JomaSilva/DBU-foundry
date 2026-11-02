/**
 * Fetch the official text of an entry from dbu-rpg.com on demand (the compendiums ship only the mechanical data
 * and a link; the full text belongs to the DBU team and is loaded into the user's own world when they ask for it).
 */
const API = "https://public-api.wordpress.com/wp/v2/sites/dbu-rpg.com/pages";

export async function fetchOfficialText(slug, section = "") {
  let html;
  try {
    const res = await fetch(`${API}?slug=${encodeURIComponent(slug)}&_fields=content,link,title`);
    if ( !res.ok ) return null;
    const data = await res.json();
    html = data?.[0]?.content?.rendered;
    if ( !html ) return null;
  } catch(err) {
    console.error("DBU | fetchOfficialText", err);
    return null;
  }
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root");
  root.querySelectorAll("script, style, iframe, form, button").forEach(e => e.remove());
  const blocks = flattenBlocks(root);
  let out = blocks;
  if ( section ) {
    const name = normalize(section);
    const start = blocks.findIndex(b => startsWithEntry(b, name));
    if ( start >= 0 ) {
      out = [blocks[start]];
      for ( let i = start + 1; i < blocks.length; i++ ) {
        const b = blocks[i];
        if ( isHeading(b) || isEntryStart(b) ) break;
        out.push(b);
      }
    }
  }
  const link = `<p><a href="https://dbu-rpg.com/${slug}/" target="_blank" rel="noopener">dbu-rpg.com/${slug}</a></p>`;
  return out.map(b => b.outerHTML).join("\n") + link;
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

const normalize = s => String(s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const isHeading = b => /^h[1-4]$/i.test(b.tagName);

function firstStrong(b) {
  const s = b.querySelector("strong, b");
  return s ? normalize(s.textContent) : "";
}

function startsWithEntry(b, name) {
  const text = normalize(b.textContent);
  const strong = firstStrong(b);
  return (strong.startsWith(name) || text.startsWith(name)) && (isHeading(b) || strong.length > 0);
}

/** A block that starts a new "**Name**:" entry or a new heading. */
function isEntryStart(b) {
  const first = b.firstElementChild;
  if ( !first || !["STRONG", "B"].includes(first.tagName) ) return false;
  const lead = (b.textContent || "").trim();
  return /^[^:–—]{2,80}:/.test(lead) && !/^(–|-)/.test(lead) && !/^\(\d+\)/.test(lead);
}
