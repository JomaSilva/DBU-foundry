"""
Build the compendium sources of the DBU system from the text dump of dbu-rpg.com.

Only mechanical data is kept (names, numbers, requirements, aspects, costs, keyword structure) plus a link to the
official page; the rules prose is not copied (users can load it into their own world with "Carregar texto oficial").
Passive effects and turn/round effects written in recognisable patterns are compiled into modifiers and triggers.

usage: python extract_content.py <site_text_dir> <out_dir>
"""
import hashlib, json, os, re, sys

TEXT, OUT = sys.argv[1], sys.argv[2]
SITE = "https://dbu-rpg.com/"
MENU = json.load(open(os.path.join(TEXT, "_menu.json"), encoding="utf-8"))
HOMEBREW = {r["slug"] for r in MENU if "Homebrew" in r["path"] or r["title"] == "Homebrew"}
ATTRS = {"agility": "ag", "force": "fo", "tenacity": "te", "scholarship": "sc", "insight": "in", "magic": "ma", "personality": "pe"}
ABBR = {"AG": "ag", "FO": "fo", "TE": "te", "SC": "sc", "IN": "in", "MA": "ma", "PE": "pe"}
SKILLS = {
    "acrobatics": "acrobatics", "flight": "flight", "thievery": "thievery", "stealth": "stealth", "craft": "craftBasic",
    "knowledge": "knowledgeScience", "investigation": "investigation", "medicine": "medicine", "clairvoyance": "clairvoyance",
    "concealment": "concealment", "creature handling": "creatureHandling", "intuition": "intuition", "perception": "perception",
    "pilot": "pilot", "survival": "survival", "use magic": "useMagic", "bluff": "bluff", "cooking": "cooking",
    "intimidation": "intimidation", "persuasion": "persuasion", "performance": "performance"
}
STATS = {"modifiers": 0, "triggers": 0, "items": 0, "remind": 0}
REMIND_LOG = []


def read(slug):
    p = os.path.join(TEXT, slug + ".md")
    return open(p, encoding="utf-8").read().splitlines() if os.path.exists(p) else []


def fid(key):
    """Deterministic 16-character Foundry id."""
    h = hashlib.sha1(key.encode("utf-8")).digest()
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    n = int.from_bytes(h, "big")
    out = ""
    for _ in range(16):
        n, r = divmod(n, 62)
        out += alphabet[r]
    return out


def clean(s):
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("–", "-").replace("—", "-")
    s = s.replace("**", "")
    return re.sub(r"\s+", " ", s).strip()


def strip_md(s):
    return clean(re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s))


# ---------------------------------------------------------------------------
# Effect compiler
# ---------------------------------------------------------------------------
TARGETS = {
    "combat rolls": ["combat"], "strike rolls": ["strike"], "dodge rolls": ["dodge"], "wound rolls": ["wound"],
    "strike and wound rolls": ["strike", "wound"], "strike and dodge rolls": ["strike", "dodge"],
    "wound rolls and soak value": ["wound", "soak"], "soak value and wound rolls": ["soak", "wound"],
    "soak value": ["soak"], "soak": ["soak"], "damage reduction": ["dr"], "defense value": ["defenseValue"],
    "defense value and soak value": ["defenseValue", "soak"], "surgency": ["surgency"], "stress bonus": ["stress"],
    "speeds": ["speed"], "speed": ["speed"], "normal speed": ["speed.normal"], "boosted speed": ["speed.boosted"],
    "speeds and defense value": ["speed", "defenseValue"], "initiative": ["initiative"], "might": ["might"],
    "haste": ["haste"], "awareness": ["awareness"], "maximum life points": ["life.max"], "max capacity": ["capacity.max"],
    "maximum ki points": ["ki.max"], "saving throws": ["save.all"], "racial life modifier": ["rlm"],
    "steadfast checks": ["steadfast"], "dice score of your steadfast checks": ["steadfast"],
    "skill checks": ["skill.all"], "combat rolls and surgency": ["combat", "surgency"],
    "wound rolls, soak value and surgency": ["wound", "soak", "surgency"], "wound rolls, soak value, and surgency": ["wound", "soak", "surgency"],
    "strike rolls and dodge rolls": ["strike", "dodge"], "dodge rolls and defense value": ["dodge", "defenseValue"],
    "soak value and damage reduction": ["soak", "dr"], "wound rolls and surgency": ["wound", "surgency"],
}
for name, key in [("impulsive", "impulsive"), ("corporeal", "corporeal"), ("cognitive", "cognitive"), ("morale", "morale")]:
    TARGETS[f"{name} saving throw"] = [f"save.{key}"]
    TARGETS[f"{name} saving throws"] = [f"save.{key}"]
    TARGETS[f"{name} save"] = [f"save.{key}"]
for word, key in ATTRS.items():
    TARGETS[f"{word} modifier"] = [f"mod.{key}"]
    TARGETS[f"{word} score"] = [f"score.{key}"]
for ab, key in ABBR.items():
    TARGETS[f"attribute modifier ({ab.lower()})"] = [f"mod.{key}"]

VALUE_RE = r"(-?\d+(?:\.\d+)?(?:\((?:b?T)\))?|[GZMLS]\((?:b?T)\)|\d+/\d+(?:\((?:b?T)\))?)"
STATE_WORDS = {"raging": "raging", "mindful": "mindful", "superior": "superior", "undying": "undying", "surging": "surging",
               "determined": "determined", "entrusted": "entrusted", "god ki": "godKi"}


def condition_prefix(text):
    """Split a leading condition clause. Returns (condition, multiplier, rest) or None when unknown."""
    t = re.sub(r"^While (in|below|above) ", r"While you are \1 ", text, flags=re.I)
    m = re.match(r"^While you are in the (\w[\w ]*?) State(?: \(Level (\d)\))?, (.*)$", t, re.I)
    if m:
        st = STATE_WORDS.get(m.group(1).lower())
        if not st:
            return None
        lvl = m.group(2) or "1"
        return (f"@states.{st} >= {lvl}", None, m.group(3))
    m = re.match(r"^While you are below the (Bruised|Injured|Critical) Health Threshold, (.*)$", t, re.I)
    if m:
        n = {"bruised": 1, "injured": 2, "critical": 3}[m.group(1).lower()]
        return (f"@below >= {n}", None, m.group(2))
    m = re.match(r"^While you are (?:above the Bruised Health Threshold|in the Healthy Health Threshold), (.*)$", t, re.I)
    if m:
        return ("@below == 0", None, m.group(1))
    m = re.match(r"^While you (?:possess|have) (\d)\+ stacks? of Power, (.*)$", t, re.I)
    if m:
        return (f"@power >= {m.group(1)}", None, m.group(2))
    m = re.match(r"^While you (?:are|have) (?:in )?(?:a Form and/or Enhancement|in a Transformation|transformed|a Form or Enhancement|an active Transformation), (.*)$", t, re.I)
    if m:
        return ("@transformed", None, m.group(1))
    m = re.match(r"^While you (?:have|possess) (\d+)\+ stacks? of Battle Born applied to your (Strike|Dodge|Wound) Rolls?, (.*)$", t, re.I)
    if m:
        return (f"@res.battleborn_{m.group(2).lower()} >= {m.group(1)}", None, m.group(3))
    m = re.match(r"^For each Health Threshold you are below, (.*)$", t, re.I)
    if m:
        return ("", "@below", m.group(1))
    m = re.match(r"^For each Health Threshold you are above, (.*)$", t, re.I)
    if m:
        return ("", "(3-@below)", m.group(1))
    m = re.match(r"^For each stack of Power(?: you possess)?, (.*)$", t, re.I)
    if m:
        return ("", "@power", m.group(1))
    if re.match(r"^(While|If|When|Whenever|Once|Upon|After|Before|During|At|Each|Until|Instead|You may|Your)\b", t):
        return None
    return ("", None, t)


def to_value(v):
    v = v.strip().rstrip(".,").replace(" ", "")
    m = re.fullmatch(r"(\d+)/(\d+)\((b?T)\)", v)
    if m:
        return f"{m.group(1)}/{m.group(2)}({m.group(3)})"
    return v


def sentences(text):
    """Split an effect into sentences, keeping "Additionally," follow-ups as separate clauses."""
    t = clean(text)
    t = re.split(r"\s+- ", t)[0]  # drop option bullets glued to the text
    parts = [p.strip() for p in re.split(r"(?<=[a-z0-9)\]])\.\s+(?=[A-Z])", t) if p.strip()]
    return [re.sub(r"^Additionally, (\w)", lambda m: m.group(1).upper(), p) for p in parts]


def compile_passive(text, label):
    """Compile every sentence of a [Passive] effect; stops at the first sentence that is not understood."""
    out = []
    for i, s in enumerate(sentences(text)):
        if re.fullmatch(r"You are Unnatural\.?", s):
            out.append({"target": "flag.unnatural", "value": "1", "condition": "", "label": label, "active": True, "always": False})
            continue
        mods = compile_passive_one(s, label)
        if not mods:
            break
        out += mods
    return out


def compile_passive_one(text, label):
    """Compile one sentence of a [Passive] effect into modifiers, or [] when the wording is not recognised."""
    text = clean(text).rstrip(".")
    pre = condition_prefix(text)
    if not pre:
        return []
    cond, mult, rest = pre
    rest = rest.strip().rstrip(".")
    rest = re.sub(r"\s*\(rounded (up|down)\)", "", rest)
    # Trailing condition: "... by 1(T) while in a Form and/or Enhancement"
    tm = re.match(r"^(.*?) (while .+)$", rest, re.I)
    if tm:
        tail = condition_prefix(tm.group(2)[0].upper() + tm.group(2)[1:] + ", X")
        if not tail or not tail[0]:
            return []
        cond = " && ".join(c for c in [cond, tail[0]] if c)
        rest = tm.group(1)
    mods = []

    def emit(targets, values, sign):
        if len(values) == 1:
            values = values * len(targets)
        if len(values) != len(targets):
            return False
        for tgt, val in zip(targets, values):
            val = to_value(val)
            if not re.fullmatch(VALUE_RE, val):
                return False
            expr = val if sign > 0 else f"-{val}"
            if mult:
                expr = f"({expr})*{mult}"
            mods.append({"target": tgt, "value": expr, "condition": cond, "label": label, "active": True, "always": False})
        return True

    m = re.match(rf"^(Increase|Reduce) (?:all of )?(?:the Dice Score of )?your (.+?) by {VALUE_RE}(?: and {VALUE_RE})?(?: respectively)?$", rest, re.I)
    if m:
        phrase = m.group(2).lower().replace("the dice score of your ", "").strip()
        phrase = re.sub(r"^your ", "", phrase)
        targets = TARGETS.get(phrase)
        vals = [m.group(3)] + ([m.group(4)] if m.group(4) else [])
        if targets and emit(targets, vals, 1 if m.group(1).lower() == "increase" else -1):
            return mods
        return []
    m = re.match(rf"^Reduce the Ki Point Cost of (?:all )?(?:your )?Attacking Maneuvers by {VALUE_RE}$", rest, re.I)
    if m and emit(["kpCost.attack"], [m.group(1)], -1):
        return mods
    m = re.match(rf"^Increase the Ki Point Cost of (?:all )?(?:your )?Attacking Maneuvers by {VALUE_RE}$", rest, re.I)
    if m and emit(["kpCost.attack"], [m.group(1)], 1):
        return mods
    m = re.match(r"^Reduce the Critical Target of your (Strike Rolls|Dodge Rolls|Wound Rolls|Combat Rolls|Saving Throws|Skill Checks) by (\d)$", rest, re.I)
    if m:
        tgt = {"strike rolls": "crit.strike", "dodge rolls": "crit.dodge", "wound rolls": "crit.wound",
               "combat rolls": "crit.combat", "saving throws": "crit.save", "skill checks": "crit.skill"}[m.group(1).lower()]
        emit([tgt], [m.group(2)], -1)
        return mods
    m = re.match(r"^Increase the Dice Category of your Tier of Power Extra Dice(?: for your Combat Rolls)? by (\d) (?:Dice )?Categor(?:y|ies)$", rest, re.I)
    if m:
        emit(["topDice.category"], [m.group(1)], 1)
        return mods
    m = re.match(r"^Gain (\d|a) Super Stacks?$", rest, re.I)
    if m:
        emit(["superStacks"], ["1" if m.group(1).lower() == "a" else m.group(1)], 1)
        return mods
    if re.match(r"^Treat the Superior State as the Raging State for the effects of the Raging Aspect$", rest, re.I):
        mods.append({"target": "wound", "value": "2(T)", "condition": " && ".join(c for c in [cond, "@states.superior >= 1 && @states.raging == 0"] if c),
                     "label": label, "active": True, "always": False})
        return mods
    # Battle Born limits per Combat Roll
    m = re.match(r"^Increase (?:the|your) maximum number of Battle Born stacks (?:you may apply to|for) (?:each of |each )?(?:your )?(.+?) by (\d+)$", rest, re.I)
    if m:
        what = m.group(1).lower()
        rolls = ["strike", "dodge", "wound"] if "combat roll" in what else [k for k in ("strike", "dodge", "wound") if k in what]
        if rolls:
            emit([f"battleBorn.cap.{k}" for k in rolls], [m.group(2)], 1)
            return mods
        return []
    if re.match(r"^You may apply an unlimited number of Battle Born stacks to your Wound Rolls$", rest, re.I):
        mods.append({"target": "flag.bbWoundUnlimited", "value": "1", "condition": cond, "label": label, "active": True, "always": False})
        return mods
    m = re.match(r"^Increase your Soak Value by 1/4 of your Force Modifier$", rest, re.I)
    if m:
        mods.append({"target": "soak", "value": "ceil(@fo/4)", "condition": cond, "label": label, "active": True, "always": False})
        return mods
    return []


EVENTS = [("Start of Combat Encounter", "startOfEncounter"), ("Start of Combat Round", "startOfRound"),
          ("Start of Turn", "startOfTurn"), ("End of Turn", "endOfTurn"), ("End of Combat Round", "endOfRound")]


def trigger_event(keywords, text):
    for k, ev in EVENTS:
        if k.lower() in keywords.lower():
            return ev, ""
    if re.search(r"at the start of every even-numbered Combat Round", text, re.I):
        return "startOfRound", "@round % 2 == 0"
    if re.search(r"at the end of each of your turns", text, re.I):
        return "endOfTurn", ""
    if re.search(r"at the start of each of your turns", text, re.I):
        return "startOfTurn", ""
    if re.search(r"at the start of each Combat Round", text, re.I):
        return "startOfRound", ""
    return None, ""


def pool_value(v):
    v = clean(v)
    m = re.fullmatch(r"1/(\d+) of your Maximum (Life|Ki) Points", v, re.I)
    if m:
        return f"floor(@{'lifeMax' if m.group(2).lower() == 'life' else 'kiMax'}/{m.group(1)})"
    v = to_value(v)
    return v if re.fullmatch(VALUE_RE, v) else None


COND_WORDS = {"guard down": "guardDown", "compelled": "compelled", "fatigued": "fatigued", "impaired": "impaired",
              "impediment": "impediment", "drained": "drained", "shaken": "shaken", "staggered": "staggered",
              "prone": "prone", "slowed": "slowed", "broken": "broken", "blinded": "blinded", "sleeping": "sleeping"}
STATE_KEYS = {**STATE_WORDS, "spectator": "spectator", "invisible": "invisible", "feral": "feral", "drunk": "drunk",
              "liquid": "liquid", "god ki special": "godKi"}
DURATIONS = {"the end of your turn": "endOfTurn", "the start of your next turn": "startOfNextTurn",
             "the start of your turn": "startOfNextTurn", "the end of your next turn": "endOfNextTurn",
             "the end of the combat round": "endOfRound", "the end of this combat round": "endOfRound",
             "the end of the combat encounter": "encounter"}
VERBS = r"(Gain|Regain|Enter|Use|Make|Spend|Reduce|Increase|Roll|Target|Select|Lose|Apply|Ignore|Choose|Create|Remove|Declare|Trigger|Transfer|Set|Take)"


def res_slug(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def trigger_condition(t):
    """Leading "If ..." clause of a triggered effect. Returns (condition, rest), ("", t) when there is none, None when unknown."""
    t = re.sub(r"^If your Life Points are ", "If you are ", t)
    m = re.match(r"^If (.+?), (.*)$", t)
    if not m:
        return ("", t)
    c, rest = m.group(1), m.group(2)
    simple = [
        (r"you are below the (Bruised|Injured|Critical) Health Threshold",
         lambda g: f"@below >= {({'bruised': 1, 'injured': 2, 'critical': 3})[g[0].lower()]}"),
        (r"you are (?:above the Bruised Health Threshold|in the Healthy Health Threshold)", lambda g: "@below == 0"),
        (r"you (?:have|possess) no stacks of Power", lambda g: "@power == 0"),
        (r"you (?:have|possess) (?:any|a) stacks? of Holding Back|you are Holding Back", lambda g: "@holdingBack >= 1"),
        (r"you are not in a Form", lambda g: "@inForm == 0"),
        (r"you are in a Form", lambda g: "@inForm == 1"),
        (r"you are not in a Transformation", lambda g: "@transformed == 0"),
        (r"you are not in the ([\w ]+?) (?:Special )?State",
         lambda g: f"@states.{STATE_KEYS[g[0].lower()]} == 0" if g[0].lower() in STATE_KEYS else None),
        (r"you are in the ([\w ]+?) (?:Special )?State",
         lambda g: f"@states.{STATE_KEYS[g[0].lower()]} >= 1" if g[0].lower() in STATE_KEYS else None),
        (r"you (?:have|possess) (\d+)\+? stacks of Power", lambda g: f"@power >= {g[0]}"),
        (r"you (?:have|possess) (\d+)\+? stacks of ([A-Z][\w' ]+?)", lambda g: f"@res.{res_slug(g[1])} >= {g[0]}"),
        (r"you (?:have|possess) (\d+)\+ ([A-Z][\w' ]+?)", lambda g: f"@res.{res_slug(g[1])} >= {g[0]}"),
        (r"Z is (\d+) or higher", lambda g: f"@Z >= {g[0]}"),
    ]
    for rx, fn in simple:
        mm = re.fullmatch(rx, c, re.I)
        if mm:
            cond = fn(mm.groups())
            return (cond, rest) if cond else None
    return None


def compile_trigger_sentence(s, ev, cond, mode, auto, label, base_cond=None):
    """One sentence of a triggered effect. Returns a list of triggers, or None when the wording is not recognised."""
    out = []
    s = re.sub(r"^you ", "", s.strip().rstrip("."))
    s = s[:1].upper() + s[1:]
    own = base_cond if base_cond is not None else cond
    pre = condition_prefix(s)
    mult = None
    if pre is not None and (pre[0] or pre[1]):
        c2, mult, s = pre
        if c2:
            cond = " && ".join(c for c in [own, c2] if c)
    tc = trigger_condition(s)
    if tc is None:
        return None
    if tc[0]:
        cond = " && ".join(c for c in [own, tc[0]] if c)
        s = tc[1]
    if re.match(r"^You may\b", s, re.I):
        mode = "ask"
        s = re.sub(r"^You may ", "", s, flags=re.I)
    s = re.sub(r"^you ", "", s)
    s = s[:1].upper() + s[1:]

    def add(effect, value, resource="", duration="none"):
        if mult and value not in (None, ""):
            value = f"({value})*{mult}"
        out.append({"event": ev, "effect": effect, "value": value or "", "resource": resource, "condition": cond,
                    "mode": mode if not auto else "auto", "duration": duration, "label": label, "active": True})

    def dur(text):
        return DURATIONS.get((text or "").lower().strip())

    def pools(word):
        return ["life", "ki"] if word == "Life and Ki" else [word.lower()]

    m = re.match(r"^Regain (.+?) Life and Ki Points$", s)
    if m and pool_value(m.group(1)):
        add("life", pool_value(m.group(1)))
        add("ki", pool_value(m.group(1)))
        return out
    m = re.match(r"^Regain (.+?) (Life|Ki) Points(?: and Capacity)?$", s)
    if m and pool_value(m.group(1)):
        add("life" if m.group(2) == "Life" else "ki", pool_value(m.group(1)))
        return out
    m = re.match(r"^Regain (Life and Ki|Life|Ki) Points equal to (1/2|1/4|1/3) (?:\(rounded (up|down)\) )?of your (Surgency|Might|Insight Modifier)$", s)
    if m:
        src = {"surgency": "@aptitudes.surgency", "might": "@aptitudes.might", "insight modifier": "@attributes.in.mod"}[m.group(4).lower()]
        fn = "ceil" if m.group(3) == "up" else "floor"
        for pool in pools(m.group(1)):
            add(pool, f"{fn}({src}*{m.group(2)})")
        return out
    m = re.match(rf"^Regain {VALUE_RE} (Life and Ki|Life|Ki) Points? for (?:every|each) (Health Threshold you are below|stack of Holding Back you possess)$", s)
    if m:
        per = "@below" if "Threshold" in m.group(3) else "@holdingBack"
        for pool in pools(m.group(2)):
            add(pool, f"({to_value(m.group(1))})*{per}")
        return out
    m = re.match(rf"^Regain {VALUE_RE} (Life|Ki) Points and (a|an|\d+) ([A-Z][\w' ]+?) Points?$", s)
    if m:
        add(m.group(2).lower(), to_value(m.group(1)))
        add("resource", "1" if not m.group(3).isdigit() else m.group(3), m.group(4).strip() + " Points")
        return out
    m = re.match(rf"^(?:Re)?[Gg]ain {VALUE_RE} ([A-Z][\w' ]+?) Points?$", s)
    if m and m.group(2) not in ("Life", "Ki", "Karma", "Life and Ki"):
        add("resource", to_value(m.group(1)), m.group(2).strip() + " Points")
        return out
    m = re.match(r"^Gain (a|an|1) ([A-Z][\w' ]+?) Point$", s)
    if m and m.group(2) not in ("Life", "Ki", "Karma"):
        add("resource", "1", m.group(2).strip() + " Points")
        return out
    m = re.match(r"^Reduce your (Life and Ki|Life|Ki) Points(?: and (Capacity))? by (.+?)$", s)
    if m and not m.group(3).startswith("up to"):
        v = pool_value(m.group(3)) or {"your might": "@aptitudes.might"}.get(m.group(3).lower())
        if v:
            for pool in pools(m.group(1)) + (["capacity"] if m.group(2) else []):
                add(pool, f"-({v})")
            return out
    m = re.match(r"^Gain (an additional|a|an|\d) (?:additional )?Counter Actions?(?: to use during this Combat Round)?$", s)
    if m:
        add("counters", "1" if not m.group(1).isdigit() else m.group(1))
        return out
    m = re.match(r"^Gain (an additional|a|an|\d) (?:additional )?(?:Standard )?Actions?(?: to spend during your turn this Combat Round)?$", s)
    if m:
        add("actions", "1" if not m.group(1).isdigit() else m.group(1))
        return out
    if re.match(r"^Gain an additional Standard Action and Counter Action$", s):
        add("actions", "1")
        add("counters", "1")
        return out
    m = re.match(r"^Gain (a|an|1|\d) (?:additional )?stacks? of ([A-Z][\w' ]+?) \((?:max\.?|up to) (\d+)\)$", s)
    if m and "Combat Condition" not in s:
        n = "1" if not m.group(1).isdigit() else m.group(1)
        add("resourceSet", f"min({m.group(3)}, @res.{res_slug(m.group(2))} + {n})", m.group(2).strip())
        return out
    m = re.match(r"^Gain (a|an|1|\d) (?:additional )?stacks? of ([A-Z][\w' ]+?)$", s)
    if m and "Combat Condition" not in s:
        add("resource", "1" if not m.group(1).isdigit() else m.group(1), m.group(2).strip())
        return out
    m = re.match(r"^(?:You )?[Ll]ose all stacks of ([A-Z][\w' ]+?)(?: you possess)?(?: at the end of each of your turns)?$", s)
    if m and m.group(1).strip() != "Power":
        for name in re.split(r",\s*(?:and\s+)?|\s+and\s+", m.group(1).strip()):
            name = re.sub(r"^(?:all )?stacks of ", "", name.strip())
            if name:
                add("resourceSet", "0", name)
        return out
    m = re.match(r"^Enter the (?:first level of the )?([\w ]+?) (?:Special )?State until (.+)$", s)
    if m and m.group(1).lower() in STATE_KEYS and dur(m.group(2)):
        add("state", "1", STATE_KEYS[m.group(1).lower()], dur(m.group(2)))
        return out
    m = re.match(r"^(?:Gain|Suffer from) the ([\w ]+?) Combat Condition until (.+)$", s)
    if m and m.group(1).lower() in COND_WORDS and dur(m.group(2)):
        add("condition", "1", COND_WORDS[m.group(1).lower()], dur(m.group(2)))
        return out
    m = re.match(r"^(?:Gain|Suffer from) the ([\w ]+?) Combat Condition$", s)
    if m and m.group(1).lower() in COND_WORDS:
        add("condition", "1", COND_WORDS[m.group(1).lower()])
        return out
    return None


def compile_trigger(keywords, text, label):
    ev, base_cond = trigger_event(keywords, text)
    if not ev:
        return []
    t = clean(text).rstrip(".")
    t = re.sub(r"^At the start of every even-numbered Combat Round, ", "", t, flags=re.I)
    t = re.sub(r"^At the (start|end) of each (?:of your turns|Combat Round), ", "", t, flags=re.I)
    auto = "automatic" in keywords.lower()
    out = []
    unknown = []
    shared = base_cond
    for i, s in enumerate(sentences(t) or [t]):
        res = compile_trigger_sentence(s, ev, shared, "auto", auto, label, base_cond)
        if res is None:
            if i == 0 or re.match(rf"^(?:If .+?, |While .+?, )?(?:you (?:may )?)?{VERBS}\b", s, re.I):
                unknown.append(s)
            continue
        if i == 0 and res:
            # Follow-up sentences ("Additionally, ...") share the condition of the first one
            shared = res[0]["condition"]
        out += res
    forced = re.search(r"must (?:be )?appl(?:y|ied) (?:this|these|that|it|them)?\s*(?:stacks? of Battle Born )?to your (Strike|Dodge|Wound) Rolls", t, re.I)
    if forced:
        for x in out:
            if x["effect"] == "resource" and x["resource"] == "Battle Born":
                x["resource"] = f"Battle Born:{forced.group(1).lower()}"
    if unknown:
        # Not a simple number: remind the player at the right moment
        STATS["remind"] += 1
        REMIND_LOG.append(f"{label} | {ev} | {keywords} | {unknown[0][:160]}")
        out.append({"event": ev, "effect": "message", "value": "", "resource": "", "condition": base_cond, "mode": "remind",
                    "duration": "none", "label": label, "active": True})
    return out


EFF_RE = re.compile(r"^\((?:\*\*)?(\d+)(?:\*\*)?\)-\[(.+?)\]\s*:\s*(.*)$")
EFF_RE2 = re.compile(r"^-\[(.+?)\]\s*:\s*(.*)$")


def parse_effects(lines, start):
    """Collect consecutive effect lines starting at index start. Returns (effects, next_index)."""
    effects = []
    i = start
    while i < len(lines):
        raw = lines[i].strip()
        if not raw:
            i += 1
            continue
        m = EFF_RE.match(raw) or EFF_RE2.match(raw)
        if m:
            if len(m.groups()) == 3:
                n, kw, txt = m.group(1), m.group(2), m.group(3)
            else:
                n, kw, txt = str(len(effects) + 1), m.group(1), m.group(2)
            effects.append({"n": int(n), "keywords": clean(kw).replace("*", ""), "text": txt})
            i += 1
            continue
        if raw.startswith("- ") and effects:  # option bullets belong to the previous effect
            effects[-1]["text"] += " " + raw
            i += 1
            continue
        # A loose sentence between option bullets and the next effect ("You are Unnatural.") still belongs to the trait
        if effects and len(raw) < 200 and not raw.startswith(("#", "*", "|")) and not TRAIT_RE.match(raw):
            nxt = next((l.strip() for l in lines[i + 1:i + 4] if l.strip()), "")
            if EFF_RE.match(nxt) or EFF_RE2.match(nxt):
                effects[-1]["text"] += " " + raw
                i += 1
                continue
        break
    return effects, i


# Option effects whose wording is too free-form for the compiler
OPTION_OVERRIDES = {
    "Tailed": [{"target": "stress", "value": "(@bT>=5?2:1)", "condition": ""}],
    # "{foundation}" is replaced by the Foundation the player picks with this option
    "Super Specialist": [{"target": "strike.{foundation}", "value": "1(T)", "condition": "@res.battleborn_strike >= 1"},
                         {"target": "wound.{foundation}", "value": "2(T)", "condition": "@res.battleborn_wound >= 1"}],
}
# Options that ask for something more when chosen
OPTION_SUBS = {"Super Specialist": "foundation"}
OPTION_RE = re.compile(r"- ([^\[:]+?)\s*(?:\[([^\]]+)\])?:\s*(.*?)(?=\s+- [A-Z][^:]{1,60}:|$)")


def compile_options(text, label):
    """Option / Multi-Option bullets: compiled but inactive — the player switches on the option they chose."""
    mods, trigs = [], []
    for m in OPTION_RE.finditer(clean(text)):
        name, kw, body = m.group(1).strip(), (m.group(2) or "Passive"), m.group(3)
        olabel = f"{label} — opção: {name}"
        om = compile_passive(body, olabel) if re.search(r"Passive", kw) else []
        if name in OPTION_OVERRIDES:
            om = [{**o, "label": olabel, "active": True, "always": False} for o in OPTION_OVERRIDES[name]]
        ot = compile_trigger(kw, body, olabel)
        for x in om + ot:
            x["active"] = False
        mods += om
        trigs += [t for t in ot if t["effect"] != "message"]
    return mods, trigs


def compile_effects(effects, label, extra_cond=""):
    mods, trigs, structure = [], [], []
    for e in effects:
        kw = e["keywords"]
        auto_mods = []
        auto_trigs = []
        if re.search(r"\bPassive\b", kw) and not re.search(r"Option|Choice|Multi-Option|Ruling", kw):
            auto_mods = compile_passive(e["text"], label)
        auto_trigs = compile_trigger(kw, e["text"], label)
        if re.search(r"If you would gain a stack of Battle Born, you must apply it to your Wound Rolls", clean(e["text"]), re.I):
            auto_mods.append({"target": "flag.bbForceWound", "value": "1", "condition": "", "label": label, "active": True, "always": False})
        # Option bullets, and Choice bullets that depend on another trait's option (both compiled switched off)
        if re.search(r"Option|Choice", kw):
            om, ot = compile_options(e["text"], label)
            auto_mods += om
            auto_trigs += ot
        for m in auto_mods:
            if extra_cond:
                m["condition"] = " && ".join(c for c in [m["condition"], extra_cond] if c)
            if "Permanent" in kw:
                m["always"] = True
        for t in auto_trigs:
            if extra_cond:
                t["condition"] = " && ".join(c for c in [t["condition"], extra_cond] if c)
        mods += auto_mods
        trigs += auto_trigs
        status = "auto" if auto_mods or any(t["effect"] != "message" for t in auto_trigs) else ("lembrete" if auto_trigs else "manual")
        structure.append(f"({e['n']}) [{kw}] — {status}")
    STATS["modifiers"] += len(mods)
    STATS["triggers"] += len(trigs)
    return mods, trigs, structure


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------
ICONS = {
    "race": "icons/svg/mystery-man.svg", "racialTrait": "icons/svg/pawprint.svg", "talent": "icons/svg/book.svg",
    "transformation": "icons/svg/aura.svg", "uniqueAbility": "icons/svg/mage-shield.svg", "maneuver": "icons/svg/thrust.svg",
    "item": "icons/svg/item-bag.svg", "weapon": "icons/svg/sword.svg", "apparel": "icons/svg/shield.svg", "signature": "icons/svg/explosion.svg"
}
PACKS = {}
FOLDERS = {}


def folder(pack, name, parent=None, color=None):
    key = f"{pack}/{parent or ''}/{name}"
    if key not in FOLDERS:
        fid_ = fid("folder:" + key)
        FOLDERS[key] = fid_
        PACKS.setdefault(pack, []).append({"_type": "Folder", "_id": fid_, "name": name, "type": "Item",
                                           "folder": FOLDERS.get(parent) if parent else None, "sorting": "a",
                                           "color": color, "sort": 0, "description": "", "flags": {}})
    return FOLDERS[key]


def description(slug, section, structure):
    url = f"{SITE}{slug}/"
    lines = "".join(f"<li>{s}</li>" for s in structure)
    struct = f"<p><strong>Efeitos (estrutura):</strong></p><ul>{lines}</ul>" if structure else ""
    return (f"<p><a href=\"{url}\" target=\"_blank\" rel=\"noopener\">dbu-rpg.com/{slug}</a></p>"
            f"<p><em>Texto completo da regra: aba Descrição › “Carregar texto oficial”.</em></p>{struct}")


def add_item(pack, name, type_, system, slug, section="", structure=None, fold=None, img=None, key=None):
    system = dict(system)
    system.setdefault("summary", "")
    system["source"] = {"slug": slug, "section": section or name, "url": f"{SITE}{slug}/"}
    system["description"] = description(slug, section or name, structure or [])
    system.setdefault("modifiers", [])
    system.setdefault("triggers", [])
    doc = {"_type": "Item", "_id": fid(f"{pack}:{key or (slug + ':' + name)}"), "name": name, "type": type_,
           "img": img or ICONS[type_], "system": system, "effects": [], "folder": fold, "sort": 0,
           "flags": {"dbu-rpg": {"slug": slug}}}
    PACKS.setdefault(pack, []).append(doc)
    STATS["items"] += 1
    return doc


# ---------------------------------------------------------------------------
# Races, racial traits and factors
# ---------------------------------------------------------------------------
RACES = [
    # slug, name, plus2 slots, plus1 slots, rlm, saves, skill ranks, minion, sizes, rule text
    ("androids", "Androids", "fo;te", "in", 4, ["cognitive"], 3, False, None, ""),
    ("angels", "Angels", "in;ag", "te", 4, ["impulsive"], 6, False, None, ""),
    ("arcosians", "Arcosians", "te;ag", "fo", 5, ["corporeal"], 2, False, None, ""),
    ("bio-android", "Bio Androids", "*;*", "*", 3, ["corporeal"], 3, False, None, "!fo+ma"),
    ("cerealians", "Cerealians", "in;ag", "fo|ma", 3, ["impulsive"], 3, False, None, ""),
    ("demons", "Demons", "fo|ma;in", "pe", 4, ["cognitive"], 3, False, None, ""),
    ("earthlings", "Earthlings", "in;ag|te", "sc|pe", 4, ["morale"], 4, False, None, ""),
    ("glass-tribe", "Glass Tribe", "in;te", "fo|ma", 2, ["corporeal"], 4, False, None, ""),
    ("herans", "Herans", "te;fo|ma", "in", 2, ["corporeal"], 3, False, None, ""),
    ("konatsians", "Konatsians", "in;pe", "ag", 3, ["morale"], 3, False, None, ""),
    ("majins", "Majins", "pe;fo|ma", "te", 3, ["morale"], 2, False, None, ""),
    ("namekians", "Namekians", "te;in", "fo|ma", 5, ["corporeal"], 3, False, None, ""),
    ("neko-majins", "Neko Majins", "pe;fo|ma", "te|in", 4, ["cognitive", "morale"], 3, False, None, ""),
    ("neo-tuffles", "Neo-Tuffles", "te;in", "sc|pe", 4, ["cognitive"], 3, False, None, ""),
    ("saiyans", "Saiyans", "fo;te", "ag", 3, ["corporeal"], 2, False, None, ""),
    ("shadow-dragons", "Shadow Dragons", "te;fo|ma", "pe", 7, ["morale"], 2, False, None, ""),
    ("shinjin", "Shinjin", "in;fo|ma", "*", 4, ["cognitive"], 2, False, None, ""),
    ("yardrats", "Yardrats", "in;ag", "sc|pe", 1, ["cognitive", "impulsive"], 3, False, None, ""),
    ("custom-species", "Custom Species", "*;*", "*", 3, [], 2, False, None, "save: escolha"),
    ("aliens", "Aliens", "", "*;*;*", 1, [], 2, True, ["small", "medium", "large"], "save: escolha"),
    ("animals", "Animals", "", "fo;in;te|ag", 2, ["impulsive"], 0, True, ["nano", "tiny", "small", "medium", "large", "enormous", "gigantic", "colossal"], ""),
    ("arlians", "Arlians", "", "te;fo;pe", 2, ["corporeal"], 2, True, ["small", "medium", "large"], ""),
    ("creatures", "Creatures", "te", "in", 3, ["corporeal"], 0, True, ["nano", "tiny", "small", "medium", "large", "enormous", "gigantic", "colossal"], ""),
    ("oni", "Oni", "", "ag;te;fo|ma", 2, ["corporeal"], 3, True, ["small", "medium", "large", "enormous"], ""),
    ("robots", "Robots", "", "fo;in;te", 3, ["corporeal"], 1, True, ["tiny", "small", "medium", "large", "enormous"], ""),
    ("saibamen", "Saibamen", "", "ag;fo;in", 1, ["impulsive"], 0, True, ["small"], ""),
    ("tuffles", "Tuffles", "sc|in", "ag", -2, ["cognitive"], 3, True, ["small"], ""),
    ("zooners", "Zooners", "", "ag;fo;in", 0, ["impulsive"], 2, True, ["small", "medium", "large"], ""),
]
SECTION_RE = re.compile(r"^#+ \*\*(Primary Racial Traits|Secondary Racial Traits|(.+?) Subrace)(.+?) \((Body|Mind)\)\*\*:")
TRAIT_RE = re.compile(r"^\*\*([^*]+?) \((Body|Mind)\)(?: \[([^\]]+)\])?\*\*:")


def default_increases(plus2, plus1):
    inc = {k: 0 for k in ABBR.values()}
    for slot in [s for s in plus2.split(";") if s]:
        if "|" not in slot and slot != "*":
            inc[slot] += 2
    for slot in [s for s in plus1.split(";") if s]:
        if "|" not in slot and slot != "*":
            inc[slot] += 1
    return inc


def race_traits(slug, race_name, fold):
    lines = read(slug)
    names = []
    tier = None
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # A section title on its own line ("# **Secondary Racial Traits**", Majins) changes the tier of what follows
        lone = re.match(r"^#+ \*\*(Primary|Secondary) Racial Traits\*\*\s*$", line)
        if lone:
            tier = lone.group(1).lower()
            i += 1
            continue
        m = SECTION_RE.match(line)
        name = cat = None
        if m:
            sec = m.group(1)
            tier = "primary" if sec.startswith("Primary") else ("secondary" if sec.startswith("Secondary") else "subrace")
            sub = m.group(2) if tier == "subrace" else ""
            name, cat = m.group(3).strip(), m.group(4)
            if tier == "subrace":
                name_sub = sub
        else:
            m2 = TRAIT_RE.match(line)
            if m2 and tier:
                name, cat = m2.group(1).strip(), m2.group(2)
        if name:
            effects, j = parse_effects(lines, i + 1)
            mods, trigs, structure = compile_effects(effects, name)
            n_auto = sum(1 for s in structure if s.endswith("auto"))
            system = {"race": race_name, "category": cat.lower(), "tier": tier, "active": True,
                      "modifiers": mods, "triggers": trigs,
                      "summary": f"{race_name} · {tier} · {cat} · {len(effects)} efeito(s), {n_auto} automatizado(s)"}
            if tier == "subrace":
                system["factor"] = name_sub
            if name == "Saiyan Heritage":
                mods.append({"target": "flag.autoPassBruised", "value": "1", "condition": "", "label": name, "active": True, "always": False})
            add_item("racial-traits", name, "racialTrait", system, slug, name, structure, fold)
            names.append(name)
            i = max(j, i + 1)
            continue
        i += 1
    return names


def factor_pages(parent_fold):
    """Racial Factor pages (menu children of race pages / Racial Factors)."""
    for r in MENU:
        if r["slug"] in HOMEBREW or not r["slug"] or r["slug"].startswith("http"):
            continue
        lines = read(r["slug"])
        text = "\n".join(lines)
        if "**Maximum Factor" not in text:
            continue
        req = re.search(r"Racial Requirement: \*\*(.+)", text)
        maxf = re.search(r"Maximum Factor: \*\*(\d+)", text)
        prereq = re.search(r"Prerequisite\(s\): \*\*(.+)", text)
        fold = folder("racial-traits", f"Fator: {r['title']}", None)
        for i, line in enumerate(lines):
            # "Factor Trait<Name> (Body)", and race-specific ones such as "Arcosian Factor TraitEmperor (Body)"
            m = re.match(r"^#+ \*\*(?:([A-Z][\w-]+) )?Factor Traits?(.+?) \((Body|Mind)\)(?: \[([^\]]+)\])?\*\*:", line.strip())
            if m:
                race_only, name, cat, replaces = m.groups()
            else:
                m = re.match(r"^\*\*([^*]+?) \((Body|Mind)\)(?: \[([^\]]+)\])?\*\*:", line.strip()) if i > 5 else None
                if not m:
                    continue
                race_only = None
                name, cat, replaces = m.groups()
            name = name.strip()
            effects, _ = parse_effects(lines, i + 1)
            mods, trigs, structure = compile_effects(effects, name)
            system = {"race": race_only or (clean(req.group(1)) if req else ""), "category": cat.lower(), "tier": "factor",
                      "factor": r["title"], "replaces": replaces or "", "maxFactor": int(maxf.group(1)) if maxf else 1,
                      "active": True, "modifiers": mods, "triggers": trigs,
                      "summary": f"Fator {r['title']}{' (' + race_only + ')' if race_only else ''} · substitui {replaces or 'um traço Secundário'}"
                                 + (f" · pré-req.: {clean(prereq.group(1))}" if prereq and 'N/A' not in prereq.group(1) else "")}
            add_item("racial-traits", name, "racialTrait", system, r["slug"], name, structure, fold, key=f"{r['slug']}:{name}")


def build_races():
    rf = folder("races", "Raças jogáveis")
    mf = folder("races", "Raças de Minion")
    for slug, name, p2, p1, rlm, saves, ranks, minion, sizes, rule in RACES:
        tf = folder("racial-traits", name)
        traits = race_traits(slug, name, tf)
        system = {
            "increases": default_increases(p2, p1), "allowed": {"plus2": p2, "plus1": p1},
            "increaseRule": rule, "rlm": rlm, "saves": saves, "saveChoice": not saves, "skillRanks": ranks,
            "sizes": sizes or [], "minion": minion, "unnatural": slug in ("androids", "majins", "bio-android"),
            "traits": traits,
            "summary": f"RLM {rlm:+d} · {', '.join(saves) or 'teste à escolha'} · {ranks} ranks · +2 {p2.replace(';', ' / ') or '—'} · +1 {p1.replace(';', ' / ')}"
        }
        add_item("races", name, "race", system, slug, name, [f"Traço: {t}" for t in traits], mf if minion else rf)
    factor_pages(None)


# ---------------------------------------------------------------------------
# Talents
# ---------------------------------------------------------------------------
TALENT_NAMES = set()


def parse_prereq(text, known_talents):
    out = {"scores": [], "talents": [], "anyTalents": [], "top": 0, "skills": [], "race": ""}
    if not text or text.strip().upper() in ("N/A", "NONE"):
        return out
    t = clean(text)
    # Skill ranks: "2+ Skill Ranks in Performance and Investigation"
    for m in re.finditer(r"(\d)\+ Skill Ranks? in ([A-Za-z ,]+?)(?=,|;|$| or )", t):
        for sk in re.split(r",| and ", m.group(2)):
            key = SKILLS.get(sk.strip().lower())
            if key:
                out["skills"].append({"key": key, "ranks": int(m.group(1))})
    t2 = re.sub(r"\d\+ Skill Ranks? in [A-Za-z ,]+?(?=,|;|$| or )", "", t)
    m = re.search(r"Tier of Power (\d)\+", t2)
    if m:
        out["top"] = int(m.group(1))
        t2 = t2.replace(m.group(0), "")
    # Scores: "Insight Score of 4+", "Force and Magic Scores of 4+", "Force or Magic Score of 6+", "Agility Score 4+"
    for m in re.finditer(r"((?:(?:Agility|Force|Tenacity|Scholarship|Insight|Magic|Personality)(?:,? (?:and |or )?)?)+) Scores? (?:of )?(\d+)\+", t2):
        group, n = m.group(1), int(m.group(2))
        parts = re.split(r",\s*(?:and\s+)?|\s+and\s+", group)
        for p in parts:
            attrs = [ATTRS[a.strip().lower()] for a in re.split(r"\s+or\s+", p) if a.strip().lower() in ATTRS]
            if attrs:
                out["scores"].append({"attrs": attrs, "min": n})
    t3 = re.sub(r"((?:(?:Agility|Force|Tenacity|Scholarship|Insight|Magic|Personality)(?:,? (?:and |or )?)?)+) Scores? (?:of )?(\d+)\+", "", t2)
    for chunk in re.split(r",", t3):
        c = chunk.strip().strip(".")
        if not c:
            continue
        alts = [a.strip() for a in re.split(r"\s+or\s+", c) if a.strip()]
        found = [a for a in alts if a in known_talents]
        if found and len(found) == len(alts):
            if len(found) > 1:
                out["anyTalents"] += found
            else:
                out["talents"].append(found[0])
        elif c.rstrip("s") in [r[1].rstrip("s") for r in RACES] or c in ("Saiyan", "Namekian", "Earthling", "Majin", "Android", "Arcosian"):
            out["race"] = c
    return out


def build_talents():
    lines = read("talents")
    entries = []
    category = None
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = re.match(r"^([A-Z][A-Za-z\-' ]+) Talents$", line)
        if m:
            category = m.group(1)
            i += 1
            continue
        m = re.match(r"^\*\*([^*]+?)\*\*:", line)
        if m and category and i + 1 < len(lines) and "Prerequisites" in lines[i + 1]:
            name = m.group(1).strip()
            pre = re.sub(r"^–\*\*Prerequisites\*\*:\s*", "", lines[i + 1].strip())
            effects, j = parse_effects(lines, i + 2)
            entries.append((category, name, pre, effects))
            i = j
            continue
        i += 1
    names = {e[1] for e in entries}
    TALENT_NAMES.update(names)
    for category, name, pre, effects in entries:
        mods, trigs, structure = compile_effects(effects, name)
        if name == "Weapon Specialist":
            mods.append({"target": "flag.noWeaponPenalty", "value": "1", "condition": "", "label": name, "active": True, "always": False})
        fold = folder("talents", f"{category} Talents")
        system = {"category": category, "prerequisites": clean(pre), "prereq": parse_prereq(pre, names),
                  "modifiers": mods, "triggers": trigs, "summary": f"{category} · {clean(pre)}"}
        add_item("talents", name, "talent", system, "talents", name, structure, fold)


# ---------------------------------------------------------------------------
# Transformations
# ---------------------------------------------------------------------------
ASPECT_KEYS = {
    "absorbed apparel": "absorbedApparel", "armored": "armored", "battle uniform": "battleUniform", "beyond": "beyond",
    "bulky": "bulky", "enhanced save": "enhancedSave", "glowing": "glowing", "god ki": "godKi", "graded": "graded",
    "growth": "growth", "heartbeat": "heartbeat", "high speed": "highSpeed", "innate state": "innateState",
    "linked": "linked", "mindful": "mindful", "natural": "natural", "perfect ki control": "perfectKiControl",
    "pinnacle": "pinnacle", "prelude": "prelude", "raging": "raging", "realization": "realization", "scaling": "scaling",
    "super saiyan form": "superSaiyanForm", "transcendent": "transcendent", "variant": "variant",
    "blutz wave": "blutzWave", "bursting": "bursting", "difficult": "difficult", "draining": "draining",
    "exhausting": "exhausting", "fading": "fading", "light dependent": "lightDependent", "limited": "limited",
    "long transformation": "longTransformation", "peaked": "peaked", "power high": "powerHigh", "rampaging": "rampaging",
    "straining": "straining", "weakening": "weakening"
}


def parse_aspects(text):
    out = []
    text = clean(text)
    # split on commas not inside parentheses
    parts, depth, cur = [], 0, ""
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    for p in parts:
        p = p.strip().rstrip(".")
        if not p or p.upper() == "N/A":
            continue
        m = re.match(r"^(.+?)(?:\s*\((.+)\))?$", p)
        base, inner = m.group(1).strip(), (m.group(2) or "").strip()
        level, param = 0, ""
        lv = re.match(r"^LV\s*(\d+)$", inner, re.I)
        if lv:
            level = int(lv.group(1))
        elif inner:
            lv2 = re.search(r"LV\s*(\d+)", inner, re.I)
            if lv2:
                level = int(lv2.group(1))
                param = re.sub(r",?\s*LV\s*\d+", "", inner).strip()
            else:
                param = inner
        out.append({"key": ASPECT_KEYS.get(base.lower(), ""), "name": p, "level": level, "param": param})
    return out


def parse_bonus_table(lines, start):
    for k in range(start, min(start + 6, len(lines))):
        if lines[k].strip().startswith("| AG | FO"):
            row = lines[k + 1].strip().strip("|").split("|")
            vals = [c.strip() for c in row]
            out = {}
            for key, v in zip(["ag", "fo", "te", "sc", "in", "ma", "pe"], vals):
                v = clean(v)
                if v in ("-", "–", "", "N/A"):
                    out[key] = ""
                elif v == "*":
                    out[key] = "*"
                else:
                    out[key] = v.lstrip("+")
            return out
    return {k: "" for k in ["ag", "fo", "te", "sc", "in", "ma", "pe"]}


FIELD_RE = re.compile(r"^- \*\*(.+?)[:.]\s*\*\*\s*(.*)$")

# Transformations whose Attribute Modifier Bonuses or extras are set by their Grade table ("*" on the site)
GRADED = {
    "Kaioken": {"bonuses": {a: "(@G>=5?3:(@G>=3?2:1))(T)" for a in ("ag", "fo", "ma")}, "maxGrade": 5,
                "mods": [("dice.combat", "(@G>=5?3:(@G>=4?2:(@G>=2?1:0)))", "Kaioken Dice"),
                         ("wound", "(ceil(@G/2))*@T", "Exponential Power"), ("attackLifeCost", "(@G+1)(bT)", "Kaioken: custo de LP")]},
    "Super Kaioken": {"bonuses": {a: "(@G>=3?3:(@G>=2?2:1))(T)" for a in ("ag", "fo", "ma")}, "maxGrade": 3,
                      "mods": [("topDice.category", "(@G>=3?2:(@G>=2?1:0))", "S-Kaioken Grade"),
                               ("attackLifeCost", "(2*@G)(bT)", "Super Kaioken: custo de LP")]},
    "Evil Aura": {"bonuses": {"fo": "(@G>=2?3:1)(T)", "ma": "(@G>=2?3:1)(T)"}, "gradeStress": "13,18", "maxGrade": 2},
    "Lightspeed Mode": {"bonuses": {"ag": "(@G>=4?6:(@G>=3?4:(@G>=2?3:1)))(T)"}, "gradeStress": "6,10,14,22", "maxGrade": 4},
    "Powerhouse": {"bonuses": {"fo": "@G(T)"}, "maxGrade": 3, "mods": [("superStacks", "@G", "Powerhouse Grade")]},
    # Variant (Powerhouse): its Grades table (Muscular Proportions) has no copy on the Mighty Namekian page
    "Mighty Namekian": {"bonuses": {"fo": "@G(T)"}, "maxGrade": 3, "mods": [("superStacks", "@G", "Powerhouse Grade")],
                        "gradeAspects": [{"grade": 2, "key": "growth", "level": 1, "param": ""},
                                         {"grade": 3, "key": "armored", "level": 0, "param": ""}]},
    "Ascended Super Saiyan": {"maxGrade": 2, "mods": [("superStacks", "(@G>=2?3:1)", "Ascended Super Saiyan Grade")]},
    "Wrathful": {"bonuses": {a: "(@G>=2?3:2)(T)" for a in ("ag", "fo", "te")}, "gradeStress": "14,18", "maxGrade": 2},
    "Beyond Divine Saiyan": {"gradeStress": "+2,+5,+8", "maxGrade": 3},
}


def aspect_part(name):
    """'the Innate State (Feral) Aspect' → ('innateState', 0, 'Feral'); 'Natural (LV1)' → ('natural', 1, '')."""
    n = re.sub(r"^(?:both |the )+", "", clean(name).strip(), flags=re.I)
    n = re.sub(r"\s*aspects?$", "", n, flags=re.I).strip()
    m = re.match(r"^(.+?)\s*\((.+)\)$", n)
    base, inner = (m.group(1).strip(), m.group(2).strip()) if m else (n, "")
    lv = re.match(r"^LV\s*(\d+)$", inner, re.I)
    return ASPECT_KEYS.get(base.lower(), ""), (int(lv.group(1)) if lv else 0), ("" if lv else inner)


LEVELS_RE = re.compile(r"^(?:an?\s+additional\s+)?(?P<q>\d+|M|an?)(?:\s*\(max\.?\s*(?P<mx>\d+)\))?\s+(?:additional\s+)?"
                       r"levels?\s+of\s+(?P<rest>.+)$", re.I)


def level_amount(q):
    """'M' (one level per Mastery), 'a'/'an' (1) or a number."""
    return "M" if q.upper() == "M" else (1 if q.lower() in ("a", "an") else int(q))


def level_part(part):
    """'M (max. 2) levels of the Scaling Aspect' → ('M', 2, 'the Scaling Aspect'); 'an additional level of X' → (1, 0, 'X')."""
    m = LEVELS_RE.match(part.strip())
    if not m:
        return None
    rest, mx = m.group("rest"), m.group("mx")
    cap = re.search(r"\s*\(max\.?\s*(\d+)\)", rest)
    if cap:
        mx = mx or cap.group(1)
        rest = (rest[:cap.start()] + rest[cap.end():]).strip()
    return level_amount(m.group("q")), int(mx) if mx else 0, rest


def aspect_change(level, op, key, amount=0, param="", mx=0):
    per = amount == "M"
    return {"mastery": level, "op": op, "key": key, "level": 0 if per else int(amount), "param": param,
            "perMastery": per, "max": mx}


def mastery_aspect_changes(text, level):
    """Aspect changes of a Mastery Trait's Permanent effects:
    'X loses both the Draining and Power High Aspects and gains the Natural (LV1) Aspect';
    'gains M levels of the Scaling Aspect (max. 2)' (M = number of Masteries) and 'loses 1 level of the Draining Aspect';
    'gains the Perfect Ki Control Aspect and loses the Draining Aspect' (either order, also ', but gains');
    'loses the Innate State (Feral) Aspect' takes only that State away;
    'Reduce the Rampaging Aspect for this Transformation by 1 level'; 'Increase the level of the Natural Aspect for X by 1';
    'the Limited Aspect gains M Levels, and the Draining Aspect loses M levels'.
    (Monster Form's 'Your level for the Rampaging Aspect is set to 2' stays manual: the same Mastery Trait ignores the
    effects of that Aspect.)"""
    out = []
    for sentence in sentences(text):
        s = sentence.rstrip(".")
        red = re.search(r"\b[Rr]educe (?:the level of )?(?:the )?(.+?) Aspect(?: (?:for|of) this Transformation)? by (\d+) [Ll]evels?\b", s)
        inc = re.search(r"\b[Ii]ncrease the level of (?:the )?(.+?) Aspect(?: for .+?)? by (\d+)\b", s)
        if red or inc:
            m = red or inc
            key = aspect_part(m.group(1))[0]
            if key:
                out.append(aspect_change(level, "reduce" if red else "raise", key, int(m.group(2))))
            continue
        subject = list(re.finditer(r"\bthe ([A-Z][\w ]+?) Aspect (gains|loses) (M|\d+|an?) [Ll]evels?\b", s))
        if subject:
            for m in subject:
                key = aspect_part(m.group(1))[0]
                if key:
                    out.append(aspect_change(level, "raise" if m.group(2) == "gains" else "reduce", key, level_amount(m.group(3))))
            continue
        for verb, body in re.findall(r"\b(loses|gains)\s+(.+?)(?=,?\s+(?:and|but)\s+(?:loses|gains)\b|,\s*(?:loses|gains)\b|$)", s):
            amount = None
            for part in re.split(r",\s*(?:and\s+|but\s+)?|\s+and\s+", body):
                part = part.strip()
                if not part:
                    continue
                lv = level_part(part)
                if lv:
                    amount, part = lv[:2], lv[2]
                # 'M levels of the Natural and Scaling Aspects': a bare name keeps the amount before it
                elif re.match(r"^(?:the|an?|both)\b", part, re.I):
                    amount = None
                key, lvl, param = aspect_part(part)
                if not key:
                    continue
                if amount:
                    out.append(aspect_change(level, "raise" if verb == "gains" else "reduce", key, amount[0], mx=amount[1]))
                elif verb == "loses":
                    out.append(aspect_change(level, "remove", key, param=param))
                else:
                    out.append(aspect_change(level, "add", key, lvl, param=param))
    return out


def grade_aspects(seg):
    """Aspects column of the Grades table: [{'grade': 2, 'key': 'armored', 'level': 0, 'param': ''}, ...]."""
    out = []
    for k, line in enumerate(seg):
        head = [c.strip().lower() for c in line.strip().strip("|").split("|")]
        if not (line.strip().startswith("| Grade") and "aspects" in head):
            continue
        col = head.index("aspects")
        for row in seg[k + 1:]:
            if not row.strip().startswith("|"):
                break
            cells = [c.strip() for c in row.strip().strip("|").split("|")]
            g = re.match(r"\d+", cells[0]) if cells else None
            if not g or col >= len(cells):
                continue
            for a in parse_aspects(cells[col]):
                if a["key"]:
                    out.append({"grade": int(g.group(0)), "key": a["key"], "level": a["level"], "param": a["param"]})
        break
    return out


def effect_choices(effects, trait):
    """Option / Multi-Option effects a character must choose (once, permanently)."""
    out = []
    for e in effects:
        kw = e["keywords"]
        if not re.search(r"\b(Multi-Option|Option)\b", kw):
            continue
        names = [m.group(1).strip() for m in OPTION_RE.finditer(clean(e["text"]))]
        if len(names) < 2:
            continue
        pick = re.search(r"Multi-Option/(\d+)", kw)
        out.append({"id": f"{trait}#{e['n']}", "trait": trait, "options": names, "pick": int(pick.group(1)) if pick else 1,
                    "selected": [], "detail": "", "subs": [n for n in names if n in OPTION_SUBS]})
    return out


# "Transformation Type: **Form" and "**Transformation Type:** Form" are both used on the site
TT_RE = re.compile(r"Transformation Type:\s*\*\*")

# '#### **Burst LimitScarlet Multiplier**:', '#### **Mastery TraitsSharpened Instinct (1)**:', '#### **MasteryControlled
# Darkness**:', '#### **Legendary Trait**Undying Namekian:', '#### **Mastery TraitCold as Ice:**' are all used on the site
TRAIT_HEAD_RE = re.compile(r"^#{2,4} \*\*(Mastery Traits?|Mastery|Burst Limit|Legendary Trait|Grand Awakening|Transcendent Trait)(.*)$")
# An effect written on the same line as its trait's heading ('...your fury.(**1**)-[**Triggered/Transform**]: ...')
INLINE_EFFECT_RE = re.compile(r"\((?:\*\*)?\d+(?:\*\*)?\)-\[|(?<![\w*])-\[\*\*")
GLUED_EFFECT_RE = re.compile(r"(?<=\S)(?=\((?:\*\*)?\d+(?:\*\*)?\)-\[)")


def trait_heading(line):
    """(kind, name, effect written on the heading line or '') of a Transformation Trait heading, or None."""
    m = TRAIT_HEAD_RE.match(line)
    if m:
        kind = m.group(1).lower()
        if kind.startswith("mastery"):
            kind = "mastery trait"
        rest = m.group(2)
        n = (re.match(r"^\*\*\s*([^:*]+?)\s*:\s*(.*)$", rest) if rest.startswith("**")
             else re.match(r"^([^*]+?)\s*(?::\s*\*\*|\*\*\s*:)\s*(.*)$", rest))
        if not n:
            return None
        name, tail = n.group(1).strip(), n.group(2)
    else:
        m = re.match(r"^\*\*([^*]+?)\*\*:\s*(.*)$", line)
        if not m:
            return None
        kind, name, tail = "trait", m.group(1).strip(), m.group(2)
        if name.lower().startswith(("racial requirement", "transformation", "prerequisite", "stress", "tier of power", "aspects")):
            return None
    e = INLINE_EFFECT_RE.search(tail)
    return kind, name, (tail[e.start():] if e else "")


def tidy_trait_lines(seg):
    """One effect per line: a bold opened on one line and closed on the next ('**Spited Divinity:' / '**(**1**)-[...'),
    and several effects glued on one line, are split the way the other pages write them."""
    out = []
    for k, line in enumerate(seg):
        s = line.strip()
        nxt = seg[k + 1].strip() if k + 1 < len(seg) else ""
        m = re.match(r"^\*\*([^*]+?):\s*$", s)
        if m and nxt.startswith("**("):
            out.append(f"**{m.group(1).strip()}**:")
            continue
        if s.startswith("**(") and out and out[-1].endswith("**:"):
            s = s[2:]
        head = trait_heading(s)
        if head and head[2]:
            out.append(s[:len(s) - len(head[2])].rstrip())
            s = head[2]
        if INLINE_EFFECT_RE.match(s):
            out += [p for p in GLUED_EFFECT_RE.split(s) if p]
        else:
            out.append(line if s == line.strip() else s)
    return out


def build_transformations():
    pages = set()
    for r in MENU:
        if r["slug"] and not r["slug"].startswith("http") and r["slug"] not in HOMEBREW:
            pages.add(r["slug"])
    for slug in sorted(pages):
        lines = read(slug)
        text = "\n".join(lines)
        if not TT_RE.search(text):
            continue
        title = lines[0].lstrip("# ").strip() if lines else slug
        # Split into stage blocks: each block starts at a "## **Name**" heading or the page start
        blocks = []
        cur = {"name": title, "start": 0}
        for idx, line in enumerate(lines):
            m = re.match(r"^## \*\*([^*]+)\*\*\s*$", line.strip())
            if m and idx + 2 < len(lines) and any("Racial Requirement" in lines[k] or "Transformation Type" in lines[k] for k in range(idx + 1, min(idx + 4, len(lines)))):
                cur["end"] = idx
                blocks.append(cur)
                cur = {"name": m.group(1).strip(), "start": idx}
        cur["end"] = len(lines)
        blocks.append(cur)
        blocks = [b for b in blocks if any(TT_RE.search(l) for l in lines[b["start"]:b["end"]])]
        prev_race = ""
        for b in blocks:
            seg = tidy_trait_lines(lines[b["start"]:b["end"]])
            fields = {}
            for l in seg:
                m = FIELD_RE.match(l.strip())
                if m:
                    fields[clean(m.group(1)).lower()] = clean(m.group(2))
            ttype = fields.get("transformation type", "").lower()
            trans_type = "awakening" if "awakening" in ttype else ("enhancement" if "enhancement" in ttype else (
                "evolved" if ("evolved" in ttype or "same as original" in ttype) else "form"))
            subtype = (fields.get("awakening type") or fields.get("enhancement type") or fields.get("form type") or "").lower()
            race = fields.get("racial requirement", "Any")
            if race.lower().startswith("same as"):
                race = prev_race or race
            prev_race = race
            stress = re.search(r"(\d+)", fields.get("stress test requirement", "") or "")
            top = re.search(r"(\d+)", fields.get("tier of power requirement", "") or "")
            stage = re.search(r"(\d+)", fields.get("transformation stage", "") or "")
            max_stacks = re.search(r"(\d+)", fields.get("maximum no of stacks", "") or "")
            aspects = parse_aspects(fields.get("aspects", ""))
            bonus_start = next((k for k, l in enumerate(seg) if l.strip().startswith("| AG | FO")), 0)
            bonuses = parse_bonus_table(seg, max(0, bonus_start - 1))
            graded = any(a["key"] == "graded" for a in aspects)
            # Traits
            traits, own_mods, own_trigs, structure = [], [], [], []
            own_choices, mastery_aspects, legendary = [], [], set()
            ignore_top = False
            in_mastery = False
            i = bonus_start + 2 if bonus_start else 0
            while i < len(seg):
                head = trait_heading(seg[i].strip())
                if not head:
                    i += 1
                    continue
                kind, name, _ = head
                effects, j = parse_effects(seg, i + 1)
                if not effects:
                    i += 1
                    continue
                req = re.search(r"\((\d)\)\s*$", name)
                cond = ""
                # A Mastery Trait heading starts the mastery section; the next "Name (2)" traits need more masteries
                if "mastery" in kind:
                    in_mastery = True
                elif kind != "trait" or not req:
                    in_mastery = False
                mastery_level = 0
                if trans_type != "awakening" and ("mastery" in kind or (in_mastery and req)):
                    mastery_level = int(req.group(1)) if req else 1
                    cond = f"@M >= {mastery_level}"
                    if "mastery" not in kind:
                        kind = "mastery trait"
                if trans_type == "awakening" and req:
                    cond = f"@Z >= {req.group(1)}"
                # A Grand Awakening does nothing until the Full Awakening Maneuver activates it (@GA); a Transcendent
                # Trait needs a Mastery beyond Fully Mastered (@MX) and, except its Permanent effects, being Transcended
                if kind == "grand awakening":
                    cond = " && ".join(c for c in [cond, "@GA >= 1"] if c)
                if kind == "transcendent trait":
                    cond = "@MX >= 1"
                if mastery_level:
                    for e in effects:
                        # A Passive effect changes the Aspects too while in the Transformation (Evil Aura's 'Reduce the
                        # level of the Rampaging Aspect by 1 level'), unless only under a condition
                        if "Permanent" in e["keywords"] or (re.search(r"\bPassive\b", e["keywords"])
                                                            and not CONDITIONAL_RE.match(clean(e["text"]))):
                            mastery_aspects += mastery_aspect_changes(e["text"], mastery_level)
                # 'For the sake of entering and remaining in this Transformation, ignore its Tier of Power Requirement'
                elif any("Permanent" in e["keywords"] and IGNORE_TOP_RE.search(clean(e["text"])) for e in effects):
                    ignore_top = True
                own_choices += effect_choices(effects, name)
                mods, trigs, st = compile_effects(effects, name, cond)
                if kind == "transcendent trait":
                    for mm in mods + trigs:
                        if not mm.get("always"):
                            mm["condition"] += " && @TR >= 1"
                if "legendary" in kind:
                    legendary.add(name)
                    for mm in mods + trigs:
                        mm["always"] = True
                own_mods += mods
                own_trigs += trigs
                traits.append(f"{name}{' [' + kind + ']' if kind != 'trait' else ''}")
                structure.append(f"<strong>{name}</strong>{' (' + kind + ')' if kind != 'trait' else ''}: " + "; ".join(st))
                i = j
            # Only its own Traits here: what it gains from lower Stages or its listed Transformation (Variant) is added
            # once every Transformation is known (inherit_traits)
            system = {
                "transType": trans_type, "subtype": subtype, "origin": fields.get("awakening origin", "").lower(),
                "race": race, "prerequisites": fields.get("prerequisite(s)", ""), "line": fields.get("transformation line", ""),
                "stage": int(stage.group(1)) if stage else (1 if trans_type == "form" else 0),
                "initialEnhancement": fields.get("initial enhancement", ""),
                "stressReq": int(stress.group(1)) if stress else 0, "topReq": int(top.group(1)) if top else 1,
                "bonuses": {k: ("" if v == "*" else v) for k, v in bonuses.items()},
                "aspects": aspects, "traits": traits, "graded": graded, "grade": 1,
                "stacks": 1, "maxStacks": int(max_stacks.group(1)) if max_stacks else 1,
                "modifiers": own_mods, "triggers": own_trigs, "choices": own_choices, "masteryAspects": mastery_aspects,
                "gradeAspects": grade_aspects(seg), "ignoreTop": ignore_top, "inherited": [],
                "homebrew": False,
                "summary": " · ".join(x for x in [
                    f"{trans_type.capitalize()} {subtype}".strip(), f"ToP {int(top.group(1)) if top else 1}+",
                    f"Stress {stress.group(1)}" if stress else "", race,
                    "bônus por Grade (ver tabela)" if any(v == "*" for v in bonuses.values()) else ""] if x)
            }
            ov = GRADED.get(b["name"]) or GRADED.get(title)
            if ov:
                system["bonuses"].update(ov.get("bonuses", {}))
                system["gradeStress"] = ov.get("gradeStress", "")
                system["maxGrade"] = ov.get("maxGrade", 0)
                system["graded"] = True
                if ov.get("gradeAspects"):
                    system["gradeAspects"] = ov["gradeAspects"]
                for tgt, val, lab in ov.get("mods", []):
                    system["modifiers"].append({"target": tgt, "value": val, "condition": "", "label": lab, "active": True, "always": False})
                    STATS["modifiers"] += 1
                system["summary"] = system["summary"].replace(" · bônus por Grade (ver tabela)", " · bônus por Grade automatizados")
            group = {"awakening": f"Awakenings ({subtype or '—'})", "enhancement": f"Enhancements ({subtype or '—'})",
                     "form": f"Forms ({subtype or '—'})", "evolved": "Evolved Stages"}[trans_type]
            fold = folder("transformations", group.title() if False else group)
            doc = add_item("transformations", b["name"], "transformation", system, slug, b["name"], structure, fold,
                           key=f"{slug}:{b['name']}")
            variant = next((a["param"] for a in aspects if a["key"] == "variant" and a["param"]), "")
            TRANSFORMATIONS.append({"doc": doc, "name": b["name"], "slug": slug, "type": trans_type,
                                    "line": system["line"], "stage": system["stage"], "variant": variant,
                                    "legendary": legendary, "structure": structure})
    inherit_traits()


IGNORE_TOP_RE = re.compile(r"\bignore (?:its|the) Tier of Power Requirement\b", re.I)
CONDITIONAL_RE = re.compile(r"^\s*(?:While|If|When|Whenever|During|Upon|After|Before|As long|Once|Each time)\b", re.I)
TRANSFORMATIONS = []  # every Transformation built, for the Traits they inherit


def base_trait(name):
    """'Blue Flame of Power (Red Flame of Life) [legendary trait]' → 'Blue Flame of Power (Red Flame of Life)'."""
    return re.sub(r"\s*\[[^\]]*\]\s*$", "", name).strip()


def replaced_traits(traits):
    """Traits a Transformation replaces: the name in brackets after one of its own ('Mixed S-Cells (S-Cells)').
    A number in brackets is a Mastery level ('Tamed Blue Flame (1)'), not a replacement."""
    out = set()
    for t in traits:
        m = re.search(r"\(([^)]+)\)\s*$", base_trait(t))
        if m and not m.group(1).strip().isdigit():
            out.add(m.group(1).strip())
    return out


def inherit_traits():
    """Higher Stages gain the Traits of all lower Stages of their Transformation Line (on any page), and Variants all
    the Traits of their listed Transformation, except the Traits they replace (Evolving Traits / 'Name (Replaced)').
    Not inherited: Evolved Stages (higher Stages never use them), Legendary Traits a lower Stage already gives at all
    times, and a lower Stage's Mastery-gated effects stay gated by the higher Stage's own Mastery ('@M')."""
    by_name = {t["name"]: t for t in TRANSFORMATIONS}
    memo = {}

    def lower_stage(t):
        # The Transformation one Stage below in the same Line: the listed one rather than a Variant, same page first
        below = [o for o in TRANSFORMATIONS if o["type"] == "form" and o["line"] == t["line"] and o["stage"] < t["stage"]]
        if not below:
            return None
        top = max(o["stage"] for o in below)
        options = [o for o in below if o["stage"] == top]
        options.sort(key=lambda o: (bool(o["variant"]), o["slug"] != t["slug"]))
        return options[0]

    def keeps(label, replaced):
        return not any(label == r or label.startswith(f"{r} —") or label.startswith(f"{r} (") for r in replaced)

    def effective(t):
        if t["name"] in memo:
            return memo[t["name"]]
        memo[t["name"]] = None  # a loop in the data gives nothing more
        s = t["doc"]["system"]
        own = {"mods": list(s["modifiers"]), "trigs": list(s["triggers"]), "choices": list(s["choices"]),
               "mastery": list(s["masteryAspects"]), "ignoreTop": s.get("ignoreTop", False), "from": [], "traits": []}
        parent, variant = None, False
        if t["variant"] and t["variant"] in by_name:
            parent, variant = by_name[t["variant"]], True
        elif t["type"] == "form" and t["line"] and t["stage"] > 0:
            parent = lower_stage(t)
        got = effective(parent) if parent else None
        if got:
            replaced = replaced_traits(s["traits"])
            # A lower Stage's Legendary Trait is already possessed at all times through that Stage
            legendary = set() if variant else got["legendary"]
            ok = lambda x: keeps(x.get("label", ""), replaced) and (x.get("label", "") not in legendary)
            own["mods"] = [m for m in got["mods"] if ok(m)] + own["mods"]
            own["trigs"] = [x for x in got["trigs"] if ok(x)] + own["trigs"]
            own["choices"] = [dict(c) for c in got["choices"] if keeps(c.get("trait", ""), replaced)] + own["choices"]
            # A Variant's name counts as its listed Transformation's: its Mastery Traits change the Variant's Aspects too
            if variant:
                own["mastery"] = [c for c in got["mastery"] if c not in own["mastery"]] + own["mastery"]
            own["ignoreTop"] = own["ignoreTop"] or got["ignoreTop"]
            own["from"] = got["from"] + [parent["name"]]
            # The names of the Traits gained this way, for the sheet (the Traits in use)
            gained = got["traits"] + [{"trait": n, "from": parent["name"], "slug": parent["slug"]}
                                      for n in parent["doc"]["system"]["traits"]]
            own["traits"] = [x for x in gained if keeps(base_trait(x["trait"]), replaced)
                             and (base_trait(x["trait"]) not in legendary)]
        own["legendary"] = (got["legendary"] if got else set()) | {base_trait(n) for n in t["legendary"]}
        memo[t["name"]] = own
        return own

    for t in TRANSFORMATIONS:
        e = effective(t)
        if not e or not e["from"]:
            continue
        s = t["doc"]["system"]
        s["modifiers"], s["triggers"], s["choices"] = e["mods"], e["trigs"], e["choices"]
        s["masteryAspects"], s["ignoreTop"], s["inherited"] = e["mastery"], e["ignoreTop"], e["traits"]
        s["description"] = description(t["slug"], t["name"], t["structure"] + [f"Herda os traços de: {', '.join(e['from'])}"])


# ---------------------------------------------------------------------------
# Unique Abilities
# ---------------------------------------------------------------------------
def field_after(seg, label):
    for l in seg:
        m = re.match(rf"^–\*\*{re.escape(label)}:?\s*\*\*:?\s*(.*)$", l.strip())
        if m:
            return clean(m.group(1))
    return ""


def build_unique_abilities():
    lines = read("unique-abilities")
    heads = [i for i, l in enumerate(lines) if re.match(r"^## \*\*[^*]+\*\*\s*$", l.strip())]
    heads.append(len(lines))
    for a, b in zip(heads, heads[1:]):
        name = re.match(r"^## \*\*([^*]+)\*\*", lines[a].strip()).group(1).strip()
        seg = lines[a:b]
        tp = re.search(r"(\d+)", field_after(seg[:20], "TP Cost") or "")
        passive = field_after(seg[:20], "Passive Bonus")
        mods = compile_passive(passive, f"{name} (Passive Bonus)") if passive and passive.upper() != "N/A" else []
        STATS["modifiers"] += len(mods)
        advancements, restrictions = [], []
        mode = "adv"
        for k, l in enumerate(seg):
            s = l.strip()
            if re.match(r"^.+ Restrictions$", s):
                mode = "res"
            elif re.match(r"^.+ Advancements$", s):
                mode = "adv"
            m = re.match(r"^#### \*\*([^*]+)\*\*", s)
            if m:
                sub = seg[k:k + 10]
                tpc = re.search(r"(-?\d+)", field_after(sub, "TP Cost") or "")
                if mode == "res":
                    restrictions.append({"name": m.group(1).strip(), "tp": abs(int(tpc.group(1))) if tpc else 0, "applied": False})
                else:
                    advancements.append({"name": m.group(1).strip(), "tp": int(tpc.group(1)) if tpc else 0,
                                         "prerequisite": field_after(sub, "Prerequisites"), "owned": False})
        pre = field_after(seg[:20], "Prerequisites")
        system = {
            "abilityType": field_after(seg[:20], "Ability Type"), "prerequisites": pre,
            "prereq": {"scores": parse_prereq(pre, TALENT_NAMES)["scores"]},
            "tpCost": int(tp.group(1)) if tp else 0, "kpCost": field_after(seg[:20], "KP Cost"),
            "maneuverType": field_after(seg[:20], "Maneuver Type"), "actionCost": field_after(seg[:20], "Action Cost"),
            "advancements": advancements, "restrictions": restrictions, "modifiers": mods,
            "summary": f"{field_after(seg[:20], 'TP Cost')} TP · KP {field_after(seg[:20], 'KP Cost')} · {field_after(seg[:20], 'Maneuver Type')}"
        }
        structure = [f"Advancements: {', '.join(x['name'] for x in advancements) or '—'}",
                     f"Restrictions: {', '.join(x['name'] for x in restrictions) or '—'}",
                     f"Passive Bonus: {'automatizado' if mods else ('manual' if passive and passive.upper() != 'N/A' else '—')}"]
        add_item("unique-abilities", name, "uniqueAbility", system, "unique-abilities", name, structure)


# ---------------------------------------------------------------------------
# Special Maneuvers, Basic Items
# ---------------------------------------------------------------------------
def entry_blocks(lines):
    """Yield (name, frequency, fields) for **Name [x/Round]**: entries followed by –**Field**: lines."""
    for i, l in enumerate(lines):
        s = l.strip()
        s = re.sub(r"^#+ \*\*[A-Za-z ]+?(?=[A-Z][a-z]+ [A-Z]?)", "**", s) if s.startswith("#") else s
        m = re.match(r"^\*\*([^*\[]+?)(?: \[([^\]]+)\])?\*\*:", s)
        if not m:
            continue
        fields = {}
        k = i + 1
        while k < len(lines) and lines[k].strip().startswith("–"):
            fm = re.match(r"^–\*\*(.+?):?\*\*:?\s*(.*)$", lines[k].strip())
            if fm:
                fields[clean(fm.group(1)).rstrip(":").lower()] = clean(fm.group(2))
            k += 1
        if fields:
            yield m.group(1).strip(), (m.group(2) or ""), fields


def build_maneuvers():
    lines = read("special-maneuvers")
    # the first entry is glued to the heading
    lines = [re.sub(r"^# \*\*Special Maneuvers", "**", l) for l in lines]
    for name, freq, f in entry_blocks(lines):
        if "maneuver type" not in f:
            continue
        system = {"maneuverType": f.get("maneuver type", ""), "actionCost": f.get("action cost", ""),
                  "kpCost": f.get("kp cost", ""), "frequency": freq, "minions": f.get("minions", ""),
                  "summary": f"{f.get('maneuver type', '')} · {f.get('action cost', '')} · KP {f.get('kp cost', '')}"}
        add_item("maneuvers", name, "maneuver", system, "special-maneuvers", name, [])
    # Core maneuvers from Actions & Maneuvers
    lines = read("actions-maneuvers")
    fold = folder("maneuvers", "Manobras básicas")
    for name, freq, f in entry_blocks(lines):
        if "maneuver type" not in f and "action cost" not in f:
            continue
        system = {"maneuverType": f.get("maneuver type", "Modifier"), "actionCost": f.get("action cost", ""),
                  "kpCost": f.get("kp cost", ""), "frequency": freq, "requirement": f.get("base maneuver", ""),
                  "summary": f"{f.get('maneuver type', 'Modifier')} · {f.get('action cost', '')} · KP {f.get('kp cost', '')}"}
        add_item("maneuvers", name, "maneuver", system, "actions-maneuvers", name, [], fold, key=f"core:{name}")
    # God Maneuvers (God Ki page): gained through Traits, paid with Divine Ki Points
    lines = read("god-ki")
    fold = folder("maneuvers", "God Maneuvers")
    for name, freq, f in entry_blocks(lines):
        if "dkp cost" not in f:
            continue
        system = {"maneuverType": f.get("maneuver type", "Standard"), "actionCost": f.get("action cost", ""), "kpCost": "",
                  "dkpCost": f.get("dkp cost", ""), "god": True, "frequency": freq, "requirement": "God Ki",
                  "summary": f"God Maneuver · {f.get('maneuver type', 'Standard')} · {f.get('action cost', '')} · DKP {f.get('dkp cost', '')}"}
        add_item("maneuvers", name, "maneuver", system, "god-ki", name, [], fold, key=f"god:{name}")


def build_items():
    lines = read("basic-items-accessories")
    accessory = False
    fb = folder("equipment", "Itens básicos")
    fa = folder("equipment", "Acessórios")
    for i, l in enumerate(lines):
        if l.strip() == "Accessories":
            accessory = True
    accessory = False
    for idx, l in enumerate(lines):
        if l.strip() in ("Accessories", "Accessory"):
            accessory = True
            continue
        s = l.strip()
        m = re.match(r"^\*\*([^*]+?)\*\*:?\s*", s)
        if not m or idx + 1 >= len(lines) or "Craft DC" not in lines[idx + 1]:
            continue
        name = m.group(1).strip().rstrip(":")
        dc = clean(re.sub(r"^–\*\*Craft DC\*\*:\s*", "", lines[idx + 1].strip()))
        det = ""
        if idx + 2 < len(lines) and "Details" in lines[idx + 2]:
            det = clean(re.sub(r"^–\*\*Details\*\*:\s*", "", lines[idx + 2].strip()))
        system = {"itemType": "accessory" if accessory else "basic", "quantity": 1, "craftDC": dc, "details": det,
                  "summary": f"Craft DC {dc}{' · ' + det if det else ''}"}
        add_item("equipment", name, "item", system, "basic-items-accessories", name, [], fa if accessory else fb)


# ---------------------------------------------------------------------------
# Example Signature Techniques
# ---------------------------------------------------------------------------
SIG_OPTIONS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dbu-rpg", "module", "data", "signature-options.mjs")
SIG_LEVELS = {"super": "super", "ultimate": "ultimate", "limit break": "finisher", "dramatic finisher": "finisher"}
# Profiles of the current rules, by normalised label
SIG_PROFILES = {
    "simple": "simple", "combination": "combination", "launching": "launching", "megaflare": "megaFlare", "blitz": "blitz",
    "crushing": "crushing", "pinpoint": "pinpoint", "powered": "powered", "soaring": "soaring", "sweeping": "sweeping",
    "beam": "beam", "blast": "blast", "clearing": "clearing", "concentrated": "concentrated", "cutting": "cutting", "wave": "wave",
    "elementaldark": "elementalDark", "elementaldarkness": "elementalDark", "elementalearth": "elementalEarth",
    "elementalfire": "elementalFire", "elementalice": "elementalIce", "elementallight": "elementalLight",
    "elementallightning": "elementalLightning", "elementalmetal": "elementalMetal", "elementalplantlife": "elementalPlantlife",
    "elementalpoison": "elementalPoison", "elementalwater": "elementalWater", "elementalwind": "elementalWind"
}
# Profiles the examples still use from an older version of the rules → closest current Profile
SIG_OLD_PROFILES = {"blitzing": "blitz", "basic": "simple", "spell": "simple", "sphere": "clearing", "explosion": "clearing",
                    "rapidfire": "combination", "kiai": "beam"}
SIG_SUPER_PROFILES = {"allout": "allOut", "cataclysmicattack": "cataclysmic", "comboattack": "combo",
                      "completeannihilation": "annihilation", "genki": "genki", "gigaflare": "gigaFlare", "karmic": "karmic",
                      "superbeam": "superBeam", "supercombination": "superCombination", "superlaunch": "superLaunch",
                      "weathermaximizer": "weatherMaximizer"}
SIG_ALIASES = {"grapplingtechnique": "grappling"}


def norm_key(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def build_signatures():
    src = open(SIG_OPTIONS_FILE, encoding="utf-8").read()
    options = json.loads(src[src.index("{"):src.rindex("}") + 1])
    by_name = {}
    for o in options.values():
        n = norm_key(o["name"])
        by_name[n] = o
        by_name[n.replace("restricted", "restriction")] = o
    for alias, key in SIG_ALIASES.items():
        target = next((o for o in options.values() if o["key"] == key), None)
        if target:
            by_name[alias] = target
    lines = read("signature-examples")
    text = "\n".join(lines)
    folders = {}
    for block in re.split(r"^## ", text, flags=re.M)[1:]:
        head = clean(block.splitlines()[0])
        m = re.match(r"(.+?) - (Super|Ultimate|Limit Break|Dramatic Finisher)(?: Signature)?$", head)
        if not m:
            continue
        name, level = m.group(1).strip(), SIG_LEVELS[m.group(2).lower()]
        fields = {}
        for l in block.splitlines():
            # "- **Foundation: **Energy" and "- **Foundation**: Energy" are both used
            fm = re.match(r"^- \*\*(.+?)\*\*\s*:?\s*(.*)$", l.strip())
            if fm:
                fields[clean(fm.group(1)).rstrip(":. ").lower()] = clean(fm.group(2))
        notes = []
        # Foundation (Profile[, Super Profile])
        fm = re.match(r"^(Physical|Energy|Magic)\s*\((.+)\)$", fields.get("foundation", ""))
        if not fm:
            continue
        foundation = fm.group(1).lower()
        parts = [p.strip() for p in fm.group(2).split(",")]
        profile_raw = parts[0]
        pk = norm_key(profile_raw)
        profile = SIG_PROFILES.get(pk)
        if not profile and pk in SIG_OLD_PROFILES:
            profile = SIG_OLD_PROFILES[pk]
            notes.append(f"Perfil “{profile_raw}” é de uma versão antiga das regras: ajustado para “{profile}” — revise na aba Detalhes.")
        if not profile:
            profile = "simple"
            notes.append(f"Perfil “{profile_raw}” não existe nas regras atuais: ajustado para “simple” — revise.")
        super_profile = ""
        for extra in parts[1:]:
            sp = SIG_SUPER_PROFILES.get(norm_key(extra))
            if sp and not super_profile:
                super_profile = sp
            else:
                notes.append(f"Super Profile “{extra}” não existe nas regras atuais (não aplicado).")

        def option_list(raw, kind):
            out = []
            for part in re.split(r",\s*(?![^()]*\))", raw or ""):
                part = part.strip().rstrip(".")
                if not part or part.lower() in ("none", "n/a", "-"):
                    continue
                pm = re.match(r"^(.+?)\s*\(([^)]*)\)\s*$", part)
                nm, arg = (pm.group(1).strip(), pm.group(2).strip()) if pm else (part, "")
                opt = by_name.get(norm_key(nm))
                if not opt and (kind == "advantage") and norm_key(nm) in SIG_SUPER_PROFILES:
                    sp = SIG_SUPER_PROFILES[norm_key(nm)]
                    if not super_profile_holder[0]:
                        super_profile_holder[0] = sp
                        notes.append(f"“{nm}” agora é um Super Profile: aplicado como Super Profile.")
                    else:
                        notes.append(f"“{nm}” agora é um Super Profile (a técnica já tem um; não aplicado).")
                    continue
                if not opt:
                    notes.append(f"{'Vantagem' if kind == 'advantage' else 'Desvantagem'} “{part}” não existe nas regras atuais (não aplicada).")
                    continue
                rank, choice = 1, ""
                am = re.match(r"^(\d+)\s*[,.]?\s*(.*)$", arg)
                if am:
                    rank = int(am.group(1))
                    choice = am.group(2).strip()
                elif arg:
                    choice = arg
                out.append({"key": opt["key"], "rank": rank, "choice": choice})
            return out

        super_profile_holder = [super_profile]
        advantages = option_list(fields.get("advantages"), "advantage")
        disadvantages = option_list(fields.get("disadvantages"), "disadvantage")
        super_profile = super_profile_holder[0]
        if super_profile and level != "finisher":
            notes.append("Super Profile só vale em Dramatic Finisher: confira o nível da técnica.")
        kp, tp = fields.get("ki point cost", ""), fields.get("technique point cost", "")
        level_label = {"super": "Super", "ultimate": "Ultimate", "finisher": "Dramatic Finisher"}[level]
        if level not in folders:
            folders[level] = folder("signature-examples", level_label)
        system = {
            "level": level, "foundation": foundation, "profile": profile, "superProfile": super_profile, "multiProfile": "",
            "advantages": advantages, "disadvantages": disadvantages, "free": False, "granted": False, "tpAdjust": 0,
            "summary": f"{level_label} · {fm.group(1)} ({profile_raw}) · site: {kp} KP, {tp} TP"
        }
        structure = [f"Custo listado no site: {kp} KP · {tp} TP. A página de exemplos usa custos de uma versão anterior das "
                     "regras: a ficha recalcula TP e KP pelas regras atuais e avisa se alguma opção não cumpre os requisitos atuais."] + notes
        doc = add_item("signature-examples", name, "signature", system, "signature-examples", name, structure, folders[level])
        doc["system"]["description"] = doc["system"]["description"].replace("Efeitos (estrutura):", "Notas da importação:")


# ---------------------------------------------------------------------------
build_races()
build_talents()
build_transformations()
build_unique_abilities()
build_maneuvers()
build_items()
build_signatures()

os.makedirs(OUT, exist_ok=True)
for pack, docs in PACKS.items():
    with open(os.path.join(OUT, f"{pack}.json"), "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=1)
    print(f"{pack}: {sum(1 for d in docs if d['_type'] == 'Item')} items, {sum(1 for d in docs if d['_type'] == 'Folder')} folders")
print(STATS)
with open(os.path.join(OUT, "_remind.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(REMIND_LOG))
