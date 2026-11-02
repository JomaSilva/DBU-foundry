import json, sys, random
src = sys.argv[1]
names = sys.argv[2].split("|") if len(sys.argv) > 2 else []
for pack in ["races", "racial-traits", "talents", "transformations", "unique-abilities"]:
    docs = [d for d in json.load(open(f"{src}/{pack}.json", encoding="utf-8")) if d["_type"] == "Item"]
    for d in docs:
        if names and d["name"] not in names:
            continue
        s = d["system"]
        print(f"[{pack}] {d['name']} :: {s.get('summary','')[:110]}")
        for m in s.get("modifiers", []):
            print(f"    MOD {m['target']} = {m['value']}  if[{m['condition']}]{' ALWAYS' if m.get('always') else ''}")
        for t in s.get("triggers", []):
            print(f"    TRG {t['event']} {t['effect']} {t['value']} {t['resource']} if[{t['condition']}] mode={t['mode']}")
        if pack == "transformations":
            print("    bonuses", s["bonuses"], "aspects", [(a["key"], a["level"], a["param"]) for a in s["aspects"]])
        if pack == "talents":
            print("    prereq", s["prereq"])
