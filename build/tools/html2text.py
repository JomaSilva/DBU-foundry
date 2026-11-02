import json, os, sys, glob, html, re
from html.parser import HTMLParser

src = sys.argv[1]
out = sys.argv[2]
os.makedirs(out, exist_ok=True)

BLOCK = {"p", "div", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote", "figure", "table", "details", "summary"}

class Conv(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.in_table = 0
        self.row = None
        self.cell = None
        self.rows = []
        self.skip = 0
        self.list_depth = 0

    def emit(self, s):
        if self.cell is not None:
            self.cell.append(s)
        else:
            self.parts.append(s)

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
            return
        if tag == "table":
            self.in_table += 1
            self.rows = []
            self.parts.append("\n")
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.cell = []
        elif tag == "br":
            self.emit(" / " if self.cell is not None else "\n")
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.emit("\n\n" + "#" * int(tag[1]) + " ")
        elif tag == "li":
            self.emit("\n" + "  " * max(0, self.list_depth - 1) + "- ")
        elif tag in ("ul", "ol"):
            self.list_depth += 1
            self.emit("\n")
        elif tag in ("strong", "b"):
            self.emit("**")
        elif tag in BLOCK:
            self.emit("\n\n" if self.cell is None else " ")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip -= 1
            return
        if tag in ("td", "th"):
            if self.cell is not None and self.row is not None:
                self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip())
            self.cell = None
        elif tag == "tr":
            if self.row is not None:
                self.rows.append(self.row)
            self.row = None
        elif tag == "table":
            self.in_table -= 1
            for r in self.rows:
                self.parts.append("| " + " | ".join(r) + " |\n")
            self.parts.append("\n")
            self.rows = []
        elif tag in ("ul", "ol"):
            self.list_depth -= 1
            self.emit("\n")
        elif tag in ("strong", "b"):
            self.emit("**")
        elif tag in BLOCK:
            self.emit("\n" if self.cell is None else " ")

    def handle_data(self, data):
        if self.skip:
            return
        self.emit(data)

def convert(h):
    c = Conv()
    c.feed(h)
    t = "".join(c.parts)
    t = re.sub(r"\*\*\s*\*\*", "", t)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip() + "\n"

pages = []
for fn in sorted(glob.glob(os.path.join(src, "pages_*.json"))):
    with open(fn, encoding="utf-8") as f:
        pages.extend(json.load(f))

byid = {p["id"]: p for p in pages}
index = []
for p in pages:
    title = html.unescape(p["title"]["rendered"])
    body = convert(p["content"]["rendered"])
    slug = p["slug"]
    with open(os.path.join(out, slug + ".md"), "w", encoding="utf-8") as f:
        f.write(f"# {title}\n<!-- id={p['id']} parent={p['parent']} modified={p['modified']} link={p['link']} -->\n\n")
        f.write(body)
    parent = byid.get(p["parent"])
    index.append((slug, title, p["parent"], parent["slug"] if parent else "", len(body), p["modified"]))

index.sort(key=lambda x: (x[3], x[0]))
with open(os.path.join(out, "_index.tsv"), "w", encoding="utf-8") as f:
    for row in index:
        f.write("\t".join(str(x) for x in row) + "\n")
print(len(pages), "pages converted")
