"""Merge extra translation keys (given as a JSON file of dotted keys) into pt-BR.json and mirror it to en.json."""
import json, sys
lang_dir, extra_file = sys.argv[1], sys.argv[2]
pt_path = f"{lang_dir}/pt-BR.json"
data = json.load(open(pt_path, encoding="utf-8-sig"))
extra = json.load(open(extra_file, encoding="utf-8-sig"))
for dotted, value in extra.items():
    parts = dotted.split(".")
    node = data
    for p in parts[:-1]:
        if not isinstance(node.get(p), dict):
            if p in node:
                raise SystemExit(f"Conflict: {dotted} — '{p}' is already a string")
            node[p] = {}
        node = node[p]
    if isinstance(node.get(parts[-1]), dict):
        raise SystemExit(f"Conflict: {dotted} is an object")
    node[parts[-1]] = value
text = json.dumps(data, ensure_ascii=False, indent=2)
open(pt_path, "w", encoding="utf-8").write(text + "\n")
open(f"{lang_dir}/en.json", "w", encoding="utf-8").write(text + "\n")
print("merged", len(extra), "keys")
