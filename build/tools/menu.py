"""Extract the nested navigation menu of dbu-rpg.com into a JSON tree (slug, title, depth, path)."""
import sys, json, re, html
from html.parser import HTMLParser

src, out = sys.argv[1], sys.argv[2]

class M(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_menu = 0
        self.depth = 0
        self.items = []
        self.cur = None
        self.stack = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "ul" and (a.get("id") == "menu-dragon-ball-universe"):
            self.in_menu = 1
            self.depth = 0
            return
        if not self.in_menu:
            return
        if tag == "ul":
            self.depth += 1
        elif tag == "a" and self.cur is None:
            self.cur = {"href": a.get("href", ""), "title": "", "depth": self.depth}

    def handle_endtag(self, tag):
        if not self.in_menu:
            return
        if tag == "a" and self.cur is not None:
            self.cur["title"] = re.sub(r"\s+", " ", self.cur["title"]).strip()
            self.items.append(self.cur)
            self.cur = None
        elif tag == "ul":
            if self.depth == 0:
                self.in_menu = 0
            else:
                self.depth -= 1

    def handle_data(self, data):
        if self.cur is not None:
            self.cur["title"] += data

m = M()
m.feed(open(src, encoding="utf-8").read())
path = []
res = []
for it in m.items:
    d = it["depth"]
    path = path[:d]
    slug = it["href"].rstrip("/").split("/")[-1] if it["href"].startswith("https://dbu-rpg.com/") else it["href"]
    if it["href"] in ("https://dbu-rpg.com/", "https://dbu-rpg.com"):
        slug = ""
    res.append({"slug": slug, "title": it["title"], "depth": d, "path": [p for p in path]})
    path.append(it["title"])
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(res), "menu items")
for r in res[:400]:
    if r["depth"] <= 1:
        print("  " * r["depth"] + r["title"], "|", r["slug"])

