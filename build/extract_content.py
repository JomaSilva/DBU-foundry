"""
Build the compendium sources of the DBU system from the text dump of dbu-rpg.com.

Only mechanical data is kept (names, numbers, requirements, aspects, costs, keyword structure) plus a link to the
official page; the rules prose is not copied (users can load it into their own world with "Carregar texto oficial").
Passive effects and turn/round effects written in recognisable patterns are compiled into modifiers and triggers.

usage: python extract_content.py <site_text_dir> <out_dir>
"""
import hashlib, json, os, re, sys, unicodedata

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


def racial_lines(slug):
    """A race/factor page, with its non-breaking spaces as plain ones ("Secondary Racial\xa0Traits" hid a Trait)."""
    return [l.replace("\xa0", " ") for l in read(slug)]


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
    TARGETS[f"{name} saves"] = [f"save.{key}"]
for word, key in ATTRS.items():
    TARGETS[f"{word} modifier"] = [f"mod.{key}"]
    TARGETS[f"{word} score"] = [f"score.{key}"]
for ab, key in ABBR.items():
    TARGETS[f"attribute modifier ({ab.lower()})"] = [f"mod.{key}"]

VALUE_RE = r"(-?\d+(?:\.\d+)?(?:\((?:b?T)\))?|[GZMLS]\((?:b?T)\)|\d+[GZMLS]\((?:b?T)\)|\d+/\d+(?:\((?:b?T)\))?)"


LEGACY = {"on": False}


def phrase_targets(phrase):
    """Targets of a phrase, also a list of them ("Wound Rolls, Surgency, and Soak Value"); None when one is unknown."""
    if phrase in TARGETS or LEGACY["on"]:
        return TARGETS.get(phrase)
    parts = [x.strip() for x in re.split(r",\s*(?:and\s+)?|\s+and\s+", phrase) if x.strip()]
    if len(parts) < 2:
        return None
    out = []
    for x in parts:
        t = TARGETS.get(re.sub(r"^your ", "", x))
        if not t:
            return None
        out += t
    return out
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
    m = None if LEGACY["on"] else re.match(r"^While you (?:have|possess) (\d+)\+ stacks? of Battle Born, (.*)$", t, re.I)
    if m:
        return (f"@res.battleborn >= {m.group(1)}", None, m.group(2))
    m = None if LEGACY["on"] else re.match(r"^While you are below the (Bruised|Injured|Critical) Health Threshold and "
                                           r"(?:have|possess) (\d+)\+ stacks? of Battle Born, (.*)$", t, re.I)
    if m:
        n = {"bruised": 1, "injured": 2, "critical": 3}[m.group(1).lower()]
        return (f"@below >= {n} && @res.battleborn >= {m.group(2)}", None, m.group(3))
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
    # "2Z(T)": twice the Stacks
    m = re.fullmatch(r"(\d+)([GZMLS])\((b?T)\)", v)
    if m:
        return f"({m.group(1)}*{m.group(2)})({m.group(3)})"
    return v


def sentences(text):
    """Split an effect into sentences, keeping "Additionally," follow-ups as separate clauses."""
    t = clean(text)
    t = re.split(r"\s+- ", t)[0]  # drop option bullets glued to the text
    # "(max. Z)" is not the end of a sentence
    parts = [p.strip() for p in re.split(r"(?<=[a-z0-9)\]])(?<!max)\.\s+(?=[A-Z])", t) if p.strip()]
    return [re.sub(r"^Additionally, (\w)", lambda m: m.group(1).upper(), p) for p in parts]


def compile_passive(text, label):
    """Compile every sentence of a [Passive] effect; stops at the first sentence that is not understood."""
    out = []
    for i, s in enumerate(sentences(text)):
        if re.fullmatch(r"You are Unnatural\.?", s):
            out.append({"target": "flag.unnatural", "value": "1", "condition": "", "label": label, "active": True, "always": False})
            continue
        # "Double this bonus if you possess 3 Super Stacks" (Hefty Muscle): the sentence before counts twice then
        dm = None if LEGACY["on"] else re.fullmatch(r"Double this bonus (?:if|while) you (?:possess|have) (\d+)\+? Super Stacks\.?", s)
        if dm and out:
            for m in out:
                m["value"] = f"({m['value']})*(@superStacks >= {dm.group(1)} ? 2 : 1)"
            continue
        mods = compile_passive_one(s, label)
        if not mods:
            break
        out += mods
    return out


AWAKENING_NAMES = {}  # slug of the name → name, for "for every stack of Absorption you possess" (filled before the Transformations)


def awakening_slug(name):
    return re.sub(r"[^a-z0-9]", "", clean(name).lower())


def per_level_amount(v):
    """'Z', '2', '1/2 (rounded up) of Z', '1/2 of Z (rounded up)' → a formula, or None."""
    v = clean(v)
    if re.fullmatch(r"\d+|[ZG]", v):
        return v
    m = re.fullmatch(r"1/2(?: \(rounded (up|down)\))? of ([ZG])(?: \(rounded (up|down)\))?", v)
    if m:
        return f"{'ceil' if 'up' in (m.group(1) or m.group(3) or '') else 'floor'}({m.group(2)}/2)"
    return None


def stack_gain_mods(text, label):
    """'Upon gaining a stack of this Awakening, gain a Character Perk ...': what every Stack gives, as modifiers."""
    t = clean(text).rstrip(".")
    m = re.match(r"^(?:Upon gaining|Each time you gain|When you gain) a stack of this Awakening, gain (a|an|\d+) Character Perks?"
                 r"(?: to spend immediately)?$", t, re.I)
    if m:
        n = "1" if not m.group(1).isdigit() else m.group(1)
        return [{"target": "perks", "value": "Z" if n == "1" else f"{n}*Z", "condition": "", "label": label, "active": True,
                 "always": False}]
    m = re.match(r"^(?:Upon gaining|Each time you gain|When you gain) a stack of this Awakening, gain (\d+) Attribute Points?"
                 r"(?: to (?:be )?spen[dt] immediately)? and (\d+) Technique Points$", t, re.I)
    if m:
        return [{"target": "attributePoints", "value": f"{m.group(1)}*Z" if m.group(1) != "1" else "Z", "condition": "",
                 "label": label, "active": True, "always": False},
                {"target": "tp", "value": f"{m.group(2)}*Z", "condition": "", "label": label, "active": True, "always": False}]
    return []


def compile_passive_one(text, label):
    """Compile one sentence of a [Passive] effect into modifiers, or [] when the wording is not recognised."""
    text = clean(text).rstrip(".")
    gained = [] if LEGACY["on"] else stack_gain_mods(text, label)
    if gained:
        return gained
    pre = condition_prefix(text)
    if not pre:
        return []
    cond, mult, rest = pre
    rest = rest.strip().rstrip(".")
    if LEGACY["on"]:
        return compile_passive_rest(cond, mult, re.sub(r"\s*\(rounded (up|down)\)", "", rest), label)
    # "... by Z for each Power Level reached": per Power Level (Life Points) or times the Power Level (Ki Points)
    m = re.match(r"^Increase your (Maximum Life Points and Maximum Ki Points|Maximum Life and Ki Points|Maximum Life Points|"
                 r"Life Points|Maximum Ki Points) by (.+?) for (?:each|every) Power Level (?:reached|you possess|you have)$", rest, re.I)
    if m and per_level_amount(m.group(2)):
        amount = per_level_amount(m.group(2))
        what = m.group(1).lower()
        out = []
        if "life" in what:
            out.append({"target": "life.perLevel", "value": amount, "condition": cond, "label": label, "active": True, "always": False})
        if "ki" in what:
            out.append({"target": "ki.max", "value": f"({amount})*@PL", "condition": cond, "label": label, "active": True,
                        "always": False})
        return out
    rest = re.sub(r"\s*\(rounded (up|down)\)", "", rest)
    # "... for every 2 stacks of Absorption you possess": times the Stacks of that Awakening
    m = re.match(r"^(.*?) for (?:every|each) (?:(\d+) )?stacks? of (?:the )?([A-Z][\w' -]+?)(?: Awakening)? you possess$", rest)
    if m and awakening_slug(m.group(3)) in AWAKENING_NAMES:
        k = f"@awk.{awakening_slug(m.group(3))}"
        per = f"floor({k}/{m.group(2)})" if m.group(2) and m.group(2) != "1" else k
        mult = f"({mult})*{per}" if mult else per
        rest = m.group(1)
    # "Increase the Dice Score of your Steadfast Checks by 1 for each Health Threshold you are below (max. Z)"
    m = re.match(r"^Increase the Dice Score of your Steadfast Checks by (\d+) for each Health Threshold you are below "
                 r"\(max\.? ?([ZG]|\d+)\)$", rest, re.I)
    if m:
        return [{"target": "steadfast", "value": f"min(@below*{m.group(1)}, {m.group(2)})", "condition": cond, "label": label,
                 "active": True, "always": False}]
    # "Increase the Wound Rolls of your Energy Attacks by 2(T)": the Combat Rolls of one Foundation
    m = re.match(rf"^Increase the (Strike|Wound|Strike and Wound) Rolls (?:of|for) your (Physical|Energy|Magic|Physical and Energy|"
                 rf"Energy and Magic|Physical and Magic) Attacks by {VALUE_RE}$", rest, re.I)
    if m:
        rolls = ["strike", "wound"] if " and " in m.group(1).lower() else [m.group(1).lower()]
        val = to_value(m.group(3))
        if mult:
            val = f"({val})*{mult}"
        return [{"target": f"{r}.{f.strip().lower()}", "value": val, "condition": cond, "label": label, "active": True,
                 "always": False} for r in rolls for f in re.split(r"\s+and\s+", m.group(2))]
    m = re.match(rf"^Increase the (Strike|Wound) Rolls of your Signature Techniques by {VALUE_RE}$", rest, re.I)
    if m:
        val = to_value(m.group(2))
        if mult:
            val = f"({val})*{mult}"
        return [{"target": f"{m.group(1).lower()}.signature", "value": val, "condition": cond, "label": label, "active": True,
                 "always": False}]
    return compile_passive_rest(cond, mult, rest, label)


def compile_passive_rest(cond, mult, rest, label):
    """The part of compile_passive_one after its leading condition (and the Awakening Stack patterns)."""
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
            raw = val.strip().rstrip(".,").replace(" ", "")
            if not re.fullmatch(VALUE_RE, raw) or (LEGACY["on"] and re.fullmatch(r"\d+[GZMLS]\((?:b?T)\)", raw)):
                return False
            val = to_value(raw)
            expr = val if sign > 0 else f"-{val}"
            if mult:
                expr = f"({expr})*{mult}"
            mods.append({"target": tgt, "value": expr, "condition": cond, "label": label, "active": True, "always": False})
        return True

    m = re.match(rf"^(Increase|Reduce) (?:all of )?(?:the Dice Score of )?your (.+?) by {VALUE_RE}(?: and {VALUE_RE})?(?: respectively)?$", rest, re.I)
    if m:
        phrase = m.group(2).lower().replace("the dice score of your ", "").strip()
        phrase = re.sub(r"^your ", "", phrase)
        targets = phrase_targets(phrase)
        vals = [m.group(3)] + ([m.group(4)] if m.group(4) else [])
        if targets and emit(targets, vals, 1 if m.group(1).lower() == "increase" else -1):
            return mods
        return []
    m = re.match(rf"^Reduce the Ki Point Cost of (?:all )?{'' if LEGACY['on'] else '(?:of )?'}(?:your )?Attacking Maneuvers by {VALUE_RE}$",
                 rest, re.I)
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
OPTION_RE = re.compile(r"- ((?:(?!\)\.)[^\[:])+?)\s*(?:\[([^\]]+)\])?:\s*(.*?)(?=\s+- [A-Z](?:(?!\)\.)[^:]){1,60}:|$)")


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


def add_item(pack, name, type_, system, slug, section="", structure=None, fold=None, img=None, key=None, grants=None):
    system = dict(system)
    system.setdefault("summary", "")
    system["source"] = {"slug": slug, "section": section or name, "url": f"{SITE}{slug}/"}
    system["description"] = description(slug, section or name, structure or [])
    system.setdefault("modifiers", [])
    system.setdefault("triggers", [])
    # I1 / M: a Special Maneuver that runs its own effect (Hype, Analysis, Stance)
    if pack in ("maneuvers", "unique-abilities") and name in MANEUVER_PIECES and not system["modifiers"] and not system["triggers"]:
        system["modifiers"] = [dict(m) for m in MANEUVER_PIECES[name]["modifiers"]]
        system["triggers"] = [dict(t) for t in MANEUVER_PIECES[name]["triggers"]]
    doc = {"_type": "Item", "_id": fid(f"{pack}:{key or (slug + ':' + name)}"), "name": name, "type": type_,
           "img": img or ICONS[type_], "system": system, "effects": [], "folder": fold, "sort": 0,
           "flags": {"dbu-rpg": {"slug": slug, **({"grants": grants} if grants else {})}}}
    # D1: the rules effects of the item ({ref: condition of its Trait}) and the Permanent ones (module/rules/fx.mjs)
    if pack in ("racial-traits", "transformations") and LAST_FX:
        doc["flags"]["dbu-rpg"]["fx"] = dict(LAST_FX)
        if LAST_FX_PERMANENT:
            doc["flags"]["dbu-rpg"]["fxPermanent"] = sorted(LAST_FX_PERMANENT)
    LAST_FX.clear()
    LAST_FX_PERMANENT.clear()
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
# Groups of Traits gained through another Trait, listed under a title ("Evolution Traits", "Pseudo-Bestial Traits") or
# on the first heading ("## **VocationsWarrior**:"), and the lists of their own pages ("# **Bestial TraitsAlternate
# Sight**:", Custom Species Traits, Flaws). Inside a group a Trait is "**Name**:" (with or without its Body/Mind).
GROUP_TITLE_RE = re.compile(r"^(?:#+ )?(?:\*\*)?([A-Z][\w' -]*? Traits)(?:\*\*)?\s*$")
GROUP_PREFIX_RE = re.compile(r"^#+ \*\*((?:[A-Z][\w' -]*?)?(?:Traits|Vocations|Flaws))(?=[A-Z])([^*]+?)(?: \((Body|Mind)\))?"
                             r"(?: \[([^\]]+)\])?\*\*:")
GROUP_TRAIT_RE = re.compile(r"^\*\*([^*]+?)(?: \((Body|Mind)\))?(?: \[([^\]]+)\])?\*\*:")
# The tier of a group's Traits: Custom Species Racial Traits and Flaws; the others are gained through another Trait
GROUP_TIERS = {"Custom Species Traits": "custom", "Flaws": "flaw"}
# Effects compiled by hand: (page slug, Trait, effect) → modifiers that replace what the text patterns made of it
RACIAL_OVERRIDES = {
    # Dauntless (2): +1/4 Maximum Life Points
    ("adversaries", "Dauntless", 2): [("life.mult", "1.25", "")],
    # Desperate Adversary (1): +1(T) Combat Rolls and −1(T) Soak per Health Threshold below
    ("adversaries", "Desperate Adversary", 1): [("combat", "(1(T))*@below", ""), ("soak", "-(1(T))*@below", "")],
    # Wild Swings (1): −2(bT) Strike Rolls, +3(T) Wound Rolls
    ("adversaries", "Wild Swings", 1): [("strike", "-2(bT)", ""), ("wound", "3(T)", "")],
}
TWINNED = " (Twinned)"


def number_effects(effects):
    """A repeated effect number on the site ('(1) Prerequisite', '(1) Passive') gets the key '1b'."""
    seen = {}
    for e in effects:
        seen[e["n"]] = seen.get(e["n"], 0) + 1
        e["kn"] = str(e["n"]) if seen[e["n"]] == 1 else f"{e['n']}{'abcdefgh'[seen[e['n']] - 1]}"


def compile_racial(slug, name, effects, label, tier, group="", race=""):
    """A Racial Trait, one effect at a time: the text patterns, then its hand-written automation (build/automation/
    racial.json, keyed "slug|Trait|n"). A Twinned effect of a Custom Species Trait only works when the Trait is Twinned
    (its pieces are labelled "<Trait> (Twinned)")."""
    number_effects(effects)
    mods, trigs, structure = [], [], []
    LAST_GRANTS.clear()
    LAST_FX.clear()
    LAST_FX_PERMANENT.clear()
    for e in effects:
        em, et, es = compile_effects([e], name)
        over = RACIAL_OVERRIDES.get((slug, name, e["n"]))
        if over:
            em = [{"target": t, "value": v, "condition": c, "label": name, "active": True, "always": False} for t, v, c in over]
            es = [x.rsplit("— ", 1)[0] + "— auto" for x in es]
        compiled = {"modifiers": [dict(m) for m in em], "triggers": [dict(t) for t in et], "status": es[0].rsplit("— ", 1)[-1] if es else ""}
        RACIAL_BUILD[0] = True
        try:
            em, et, es = apply_automation(slug, name, e, em, et, es, "")
        finally:
            RACIAL_BUILD[0] = False
        if re.search(r"\bTwinned\b", e["keywords"]):
            for x in em + et:
                x["label"] = name + TWINNED
        if DUMP is not None:
            DUMP.append({"key": f"{slug}|{name}|{e.get('kn', e['n'])}", "item": label, "slug": slug, "trait": name, "kind": tier,
                         "transType": "racial", "subtype": tier, "group": group, "race": race, "n": e["n"],
                         "keywords": e["keywords"], "text": clean(e["text"]), "condition": "", "maxStacks": 1, **compiled})
        mods += em
        trigs += et
        structure += es
    return mods, trigs, structure


def group_trait_item(slug, name, cat, group, race, effects, fold, label_race, key=None):
    tier = GROUP_TIERS.get(group, "granted")
    mods, trigs, structure = compile_racial(slug, name, effects, f"{label_race} › {name}", tier, group, race)
    n_auto = sum(1 for x in structure if x.endswith("auto"))
    system = {"race": race, "category": (cat or "none").lower(), "tier": tier, "group": group, "active": True,
              "modifiers": mods, "triggers": trigs,
              "summary": f"{race or label_race} · {group} · {len(effects)} efeito(s), {n_auto} automatizado(s)"}
    add_item("racial-traits", name, "racialTrait", system, slug, name, structure, fold, key=key, grants=list(LAST_GRANTS))


def race_traits(slug, race_name, fold):
    """The Racial Traits of a race page (the race's own ones are returned: a group's Traits are picked through another
    Trait)."""
    lines = racial_lines(slug)
    names = []
    tier = None
    group = None
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # A section title on its own line ("# **Secondary Racial Traits**", Majins) changes the tier of what follows
        lone = re.match(r"^#+ \*\*(Primary|Secondary) Racial Traits\*\*\s*$", line)
        if lone:
            tier, group = lone.group(1).lower(), None
            i += 1
            continue
        m = SECTION_RE.match(line)
        name = cat = None
        if m:
            sec = m.group(1)
            tier = "primary" if sec.startswith("Primary") else ("secondary" if sec.startswith("Secondary") else "subrace")
            group = None
            sub = m.group(2) if tier == "subrace" else ""
            name, cat = m.group(3).strip(), m.group(4)
            if tier == "subrace":
                name_sub = sub
        else:
            gp = GROUP_PREFIX_RE.match(line)
            gt = GROUP_TITLE_RE.match(line) if not gp else None
            if gt and not re.search(r"Racial|Factor", gt.group(1)):
                group = gt.group(1).strip()
                i += 1
                continue
            if gp:
                group = gp.group(1).strip()
                name, cat = gp.group(2).strip(), gp.group(3)
            elif group:
                g2 = GROUP_TRAIT_RE.match(line)
                if g2:
                    name, cat = g2.group(1).strip(), g2.group(2)
            else:
                m2 = TRAIT_RE.match(line)
                if m2 and tier:
                    name, cat = m2.group(1).strip(), m2.group(2)
        if name and group:
            effects, j = parse_effects(lines, i + 1)
            if effects:
                parent = f"racial-traits//{race_name}"
                gfold = fold if GROUP_TIERS.get(group) == "custom" else folder("racial-traits", group, parent)
                group_trait_item(slug, name, cat, group, race_name, effects, gfold, race_name)
            i = max(j, i + 1)
            continue
        if name:
            effects, j = parse_effects(lines, i + 1)
            mods, trigs, structure = compile_racial(slug, name, effects, f"{race_name} › {name}", tier, "", race_name)
            n_auto = sum(1 for s in structure if s.endswith("auto"))
            system = {"race": race_name, "category": cat.lower(), "tier": tier, "active": True,
                      "modifiers": mods, "triggers": trigs,
                      "summary": f"{race_name} · {tier} · {cat} · {len(effects)} efeito(s), {n_auto} automatizado(s)"}
            if tier == "subrace":
                system["factor"] = name_sub
            if name == "Saiyan Heritage":
                mods.append({"target": "flag.autoPassBruised", "value": "1", "condition": "", "label": name, "active": True, "always": False})
            add_item("racial-traits", name, "racialTrait", system, slug, name, structure, fold, grants=list(LAST_GRANTS))
            names.append(name)
            i = max(j, i + 1)
            continue
        i += 1
    return names


def group_pages():
    """Pages that are a list of Traits gained through other Traits: Bestial Traits (Animals, Beast-Man...) and Monstrous
    Traits (Monster Factor, Creatures...)."""
    for slug, title in [("bestial-traits", "Bestial Traits"), ("monstrous-traits", "Monstrous Traits")]:
        lines = racial_lines(slug)
        fold = folder("racial-traits", title)
        group = None
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            gp = GROUP_PREFIX_RE.match(line)
            g2 = GROUP_TRAIT_RE.match(line) if (group and not gp) else None
            if gp:
                group = gp.group(1).strip()
                name, cat = gp.group(2).strip(), gp.group(3)
            elif g2:
                name, cat = g2.group(1).strip(), g2.group(2)
            else:
                i += 1
                continue
            effects, j = parse_effects(lines, i + 1)
            if effects:
                group_trait_item(slug, name, cat, title, "", effects, fold, title)
            i = max(j, i + 1)


def default_increases(plus2, plus1):
    inc = {k: 0 for k in ABBR.values()}
    for slot in [s for s in plus2.split(";") if s]:
        if "|" not in slot and slot != "*":
            inc[slot] += 2
    for slot in [s for s in plus1.split(";") if s]:
        if "|" not in slot and slot != "*":
            inc[slot] += 1
    return inc


def factor_pages(parent_fold):
    """Racial Factor pages (menu children of race pages / Racial Factors)."""
    for r in MENU:
        if r["slug"] in HOMEBREW or not r["slug"] or r["slug"].startswith("http"):
            continue
        lines = racial_lines(r["slug"])
        text = "\n".join(lines)
        if "**Maximum Factor" not in text:
            continue
        req = re.search(r"Racial Requirement: \*\*(.+)", text)
        maxf = re.search(r"Maximum Factor: \*\*(\d+)", text)
        prereq = re.search(r"Prerequisite\(s\): \*\*(.+)", text)
        fold = folder("racial-traits", f"Fator: {r['title']}", None)
        group = None
        for i, line in enumerate(lines):
            t = line.strip()
            # "Pseudo-Bestial Traits": the Traits a Factor Trait lets the character pick
            gt = GROUP_TITLE_RE.match(t)
            if gt and (i > 5) and not re.search(r"Racial|Factor", gt.group(1)):
                group = gt.group(1).strip()
                continue
            # A Factor Trait heading (with its Body/Mind) after the group ends it
            if group and re.match(r"^\*\*([^*]+?) \((Body|Mind)\)", t):
                group = None
            if group:
                g2 = GROUP_TRAIT_RE.match(t)
                if g2:
                    effects, _ = parse_effects(lines, i + 1)
                    if effects:
                        gfold = folder("racial-traits", group, f"racial-traits//Fator: {r['title']}")
                        group_trait_item(r["slug"], g2.group(1).strip(), g2.group(2), group,
                                         clean(req.group(1)) if req else "", effects, gfold, f"Fator: {r['title']}",
                                         key=f"{r['slug']}:{group}:{g2.group(1).strip()}")
                continue
            # "Factor Trait<Name> (Body)", and race-specific ones such as "Arcosian Factor TraitEmperor (Body)"
            m = re.match(r"^#+ \*\*(?:([A-Z][\w-]+) )?Factor Traits?(.+?) \((Body|Mind)\)(?: \[([^\]]+)\])?\*\*:", t)
            if m:
                race_only, name, cat, replaces = m.groups()
            else:
                m = re.match(r"^\*\*([^*]+?) \((Body|Mind)\)(?: \[([^\]]+)\])?\*\*:", t) if i > 5 else None
                if not m:
                    continue
                race_only = None
                name, cat, replaces = m.groups()
            name = name.strip()
            effects, _ = parse_effects(lines, i + 1)
            race = race_only or (clean(req.group(1)) if req else "")
            mods, trigs, structure = compile_racial(r["slug"], name, effects, f"Fator: {r['title']} › {name}", "factor", "", race)
            system = {"race": race, "category": cat.lower(), "tier": "factor",
                      "factor": r["title"], "replaces": replaces or "", "maxFactor": int(maxf.group(1)) if maxf else 1,
                      "active": True, "modifiers": mods, "triggers": trigs,
                      "summary": f"Fator {r['title']}{' (' + race_only + ')' if race_only else ''} · substitui {replaces or 'um traço Secundário'}"
                                 + (f" · pré-req.: {clean(prereq.group(1))}" if prereq and 'N/A' not in prereq.group(1) else "")}
            add_item("racial-traits", name, "racialTrait", system, r["slug"], name, structure, fold, key=f"{r['slug']}:{name}",
                     grants=list(LAST_GRANTS))


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
    group_pages()


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
        # T24 Enhanced Search 5: at the start of your turn (1/Round), a Perception/Clairvoyance vs Stealth/Concealment Clash
        # button against the targeted Character; a win marks it 'Marked' until the start of your next turn (+1(T) Strike and
        # Dodge against it)
        if name == "Enhanced Search":
            trigs = [t for t in trigs if not ((t.get("event") == "startOfTurn") and (t.get("mode") == "remind"))]
            trigs.append({"event": "startOfTurn", "effect": "mark", "value": "1", "resource": "Marked", "condition": "", "label": "Enhanced Search (5)",
                          "target": "targeted", "duration": "startOfNextTurn", "mode": "ask", "limit": "1/Round", "active": True, "always": False,
                          "check": "clash:perception|clairvoyance vs stealth|concealment"})
            for t in ("vs.strike", "vs.dodge"):
                mods.append({"target": t, "value": "1(T)", "condition": "@vs.mark.marked >= 1", "label": "Enhanced Search (5)", "active": True, "always": False})
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
    # Grades 4-5 come with Mastery and the 6th with the Entrusted State (Mastered Kaioken Grades table)
    "Kaioken": {"bonuses": {a: "(@G>=6?4:(@G>=5?3:(@G>=3?2:1)))(T)" for a in ("ag", "fo", "ma")}, "maxGrade": 3,
                # (the Kaioken Dice and the Wound are Exponential Power 3 and 2's automation entries: only the LP Cost here)
                "mods": [("attackLifeCost", "(@G+1)(bT)", "Kaioken: custo de LP")]},
    "Super Kaioken": {"bonuses": {a: "(@G>=3?3:(@G>=2?2:1))(T)" for a in ("ag", "fo", "ma")}, "maxGrade": 3,
                      "mods": [("topDice.category", "(@G>=3?2:(@G>=2?1:0))", "S-Kaioken Grade"),
                               ("attackLifeCost", "(2*@G)(bT)", "Super Kaioken: custo de LP")]},
    "Evil Aura": {"bonuses": {"fo": "(@G>=2?3:1)(T)", "ma": "(@G>=2?3:1)(T)"}, "gradeStress": "13,18", "maxGrade": 2},
    "Lightspeed Mode": {"bonuses": {"ag": "(@G>=4?6:(@G>=3?4:(@G>=2?3:1)))(T)"}, "gradeStress": "6,10,14,22", "maxGrade": 2},
    "Powerhouse": {"bonuses": {"fo": "@G(T)"}, "maxGrade": 3, "mods": [("superStacks", "@G", "Powerhouse Grade")]},
    # Variant (Powerhouse): its Grades table (Muscular Proportions) has no copy on the Mighty Namekian page
    "Mighty Namekian": {"bonuses": {"fo": "@G(T)"}, "maxGrade": 3, "mods": [("superStacks", "@G", "Powerhouse Grade")],
                        "gradeAspects": [{"grade": 2, "key": "growth", "level": 1, "param": ""},
                                         {"grade": 3, "key": "armored", "level": 0, "param": ""}]},
    "Ascended Super Saiyan": {"maxGrade": 2, "mods": [("superStacks", "(@G>=2?3:1)", "Ascended Super Saiyan Grade")]},
    "Wrathful": {"bonuses": {a: "(@G>=2?3:2)(T)" for a in ("ag", "fo", "te")}, "gradeStress": "14,18", "maxGrade": 2},
    "Beyond Divine Saiyan": {"gradeStress": "+2,+5,+8", "maxGrade": 3},
    # Variant (Giant Form): its 3 Grades are written on the Giant Form page (Dragon-Sized gives the 4th)
    "Great Namekian": {"maxGrade": 3},
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
# The same kinds written as a plain bold line ('**Legendary TraitPerfection of Saiyan Power**: ...', Super Perfect Form)
TRAIT_PLAIN_HEAD_RE = re.compile(r"^\*\*(Legendary Trait|Grand Awakening|Transcendent Trait)\s*(?=[A-Z])(.*)$")
# An effect written on the same line as its trait's heading ('...your fury.(**1**)-[**Triggered/Transform**]: ...')
INLINE_EFFECT_RE = re.compile(r"\((?:\*\*)?\d+(?:\*\*)?\)-\[|(?<![\w*])-\[\*\*")
GLUED_EFFECT_RE = re.compile(r"(?<=\S)(?=\((?:\*\*)?\d+(?:\*\*)?\)-\[)")


# '# **Wizarding TraitsBaneful Black Magic**: ...' opens a group of Traits (Technical Traits, Perfect Traits...)
GROUP_HEAD_RE = re.compile(r"^#{1,4} \*\*([A-Z][A-Za-z' -]+?) (?:Traits|Classes)([A-Z][^*]*?)\*\*\s*:\s*(.*)$")


def trait_group(line):
    """The group a heading opens ('Wizarding' for '# **Wizarding TraitsBaneful Black Magic**:'), or ''."""
    m = GROUP_HEAD_RE.match(line)
    if not m or re.search(r"Racial|Species|Factor|Mastery|Legendary|Transcendent", m.group(1)):
        return ""
    return m.group(1).strip()


# The box of a State a Transformation page defines ('#### **Radiant God**', '#### **Flow State**' followed by its numbered
# effects): the State's key in the system (dbu-rpg/module/config.mjs DBU.states, the States of Transformations)
STATE_BOX_RE = re.compile(r"^#{3,4} \*\*([A-Z][A-Za-z' -]+?)\*\*\s*$")
STATE_BOXES = {"radiant god": "radiantGod", "blazing god": "blazingGod", "flow": "flow", "unlimited": "unlimited",
               "exposed": "exposed", "incorporeal": "incorporeal"}


def state_box(line):
    """(name without 'State', State key) of a State box heading, or None."""
    m = STATE_BOX_RE.match(line)
    if not m:
        return None
    base = re.sub(r"\s+State$", "", m.group(1).strip())
    key = STATE_BOXES.get(base.lower())
    return (base, key) if key else None


def trait_heading(line):
    """(kind, name, effect written on the heading line or '') of a Transformation Trait heading, or None."""
    sb = state_box(line)
    if sb:
        return "state", f"{sb[0]} State", ""
    m = TRAIT_HEAD_RE.match(line) or TRAIT_PLAIN_HEAD_RE.match(line)
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
    elif trait_group(line):
        g = GROUP_HEAD_RE.match(line)
        kind, name, tail = "trait", g.group(2).strip(), g.group(3)
    else:
        # "**Name**: ..." and "**Name:** ..." are both used on the site
        m = re.match(r"^\*\*([^*]+?)\*\*:\s*(.*)$", line) or re.match(r"^\*\*([^*:]+?):\*\*\s*(.*)$", line)
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
        plain = re.match(r"^([A-Z][\w'’ ()-]{2,60}?):\s+(\S.*)$", s)
        if plain and nxt.startswith("(**1**)") and not trait_heading(s):
            s = f"**{plain.group(1).strip()}**: {plain.group(2)}"
        head = trait_heading(s)
        if head and head[2]:
            out.append(s[:len(s) - len(head[2])].rstrip())
            s = head[2]
        if INLINE_EFFECT_RE.match(s):
            out += [p for p in GLUED_EFFECT_RE.split(s) if p]
        else:
            out.append(line if s == line.strip() else s)
    return out


# "Each time you gain a stack of Warlock, gain access to a Wizarding Trait of your choice"
# 'Upon gaining (access to) this Awakening, select and gain access to a Greater Class / a Team Role Trait': one Trait of
# the group, picked once (these Awakenings have a single Stack, so it is the per-Stack choice of that Stack)
ONCE_GROUP_RE = re.compile(r"(?:select and )?gain access to an? [‘'’]?([A-Z][\w' -]+?) (?:Trait|Class)\b(?![\w' -]*\bof (?:an?|the) )")
STACK_GROUP_RE = re.compile(r"(?:(?:Each time|When) you gain|Upon gaining) (?:access to )?a stack of (?:this Awakening|[A-Z][\w' -]+?), "
                            r"gain access to an? ([A-Z][\w' -]+?) Trait\b")
def stack_gain_effect(text, own):
    """'Upon gaining a stack of this Awakening, ...' (or of the Awakening by its name): an effect of every new Stack."""
    name = re.escape(clean(own))
    return bool(re.match(rf"^(?:(?:Each time|When|Whenever) you gain|Upon gaining) (?:access to )?a stack of (?:this Awakening|"
                         rf"(?:the )?{name}(?: Awakening)?)(?: during a Combat Encounter)?, ", clean(text), re.I))
ATTRIBUTE_WORDS = ["Agility", "Force", "Tenacity", "Scholarship", "Insight", "Magic", "Personality"]
ELEMENTS = ["Dark", "Earth", "Fire", "Ice", "Light", "Lightning", "Metal", "Plantlife", "Poison", "Water", "Wind"]
# What each Stack holds (asked when it is gained)
STACK_NOTES = {"Absorption": "Absorbed Character", "Unified": "Merged Character"}


def page_trait_names(slug, after=None):
    """Trait names on a page ('**Name**:' and the first one of a group heading), from the line `after` on."""
    out, on = [], after is None
    for line in read(slug):
        t = line.strip()
        if not on:
            on = t == after
            continue
        g = GROUP_HEAD_RE.match(t)
        m = re.match(r"^\*\*([^*]+?)\*\*:", t)
        name = g.group(2).strip() if (g and trait_group(t)) else (m.group(1).strip() if m else "")
        if name and name not in out:
            out.append(name)
    return out


def factor_trait_names(factor):
    return [d["name"] for d in PACKS.get("racial-traits", []) if d.get("_type") == "Item"
            and (d["system"].get("factor") or "").lower() == factor.lower()]


def stack_choice(trait, n, options, pick=1, repeat=False, no_repeat_last=False, pack="", cid=None):
    return {"id": cid or f"{trait}#{n}", "trait": trait, "options": options, "pick": pick, "selected": [], "detail": "", "subs": [],
            "perStack": True, "repeat": repeat, "noRepeatLast": no_repeat_last, "pack": pack}


def option_mods(trait, table):
    """Modifiers of per-Stack options, compiled switched off: each Stack that picks the option applies them once."""
    out = []
    for option, mods in table.items():
        for tgt, val in mods:
            out.append({"target": tgt, "value": val, "condition": "", "label": f"{trait} — opção: {option}", "active": False,
                        "always": False})
    return out


def stack_overrides(name):
    """Per-Stack choices whose wording is too free-form for the compiler: (choices, modifiers, (trait, n) handled)."""
    if name == "Results of Training":
        t = "Steady Progress"
        return ([stack_choice(t, 1, ["Agility", "Tenacity"], repeat=True),
                 stack_choice(t, 4, ["Strike", "Dodge", "Wound"], repeat=True, no_repeat_last=True)],
                option_mods(t, {"Agility": [("mod.ag", "1")], "Tenacity": [("mod.te", "1")],
                                "Strike": [("strike", "1(T)")], "Dodge": [("dodge", "1(T)")], "Wound": [("wound", "1(T)")]}),
                {(t, 1), (t, 4)})
    if name == "Vocation Gain":
        t = "Additional Vocation"
        amb = {"Warrior": ["fo", "te", "ma"], "Mage": ["in", "ma"], "Martial Artist": ["ag", "fo"], "Priest": ["in", "ma"],
               "Thief": ["ag", "in"], "Ranger": ["ag", "ag"], "Dancer": ["pe", "pe"]}
        table = {k: [(f"mod.{a}", str(v.count(a))) for a in dict.fromkeys(v)] for k, v in amb.items()}
        return ([stack_choice(t, 1, list(amb) + ["Gadabout"])], option_mods(t, table), {(t, 1)})
    if name == "Absorption":
        t = "Assimilated Power"
        table = {w: [(f"mod.{ATTRS[w.lower()]}", "1")] for w in ATTRIBUTE_WORDS}
        return ([stack_choice(t, 0, ATTRIBUTE_WORDS, pick=3, repeat=True, cid=f"{t}#amb")], option_mods(t, table), {(t, 1)})
    if name == "Unified":
        # The Merged Character of each Stack is asked when it is gained (STACK_NOTES)
        return [], [], {("Entrusted Everything", 1)}
    if name == "Elemental Force":
        t = "Flash of the Elements (1)"
        return ([stack_choice(t, 1, [f"Elemental ({e})" for e in ELEMENTS])], [], {(t, 1)})
    if name == "Bestial Transfiguration":
        t = "Reawakened Beast"
        return ([stack_choice(t, 1, page_trait_names("bestial-traits"), pack="dbu-rpg.racial-traits")], [], {(t, 1)})
    if name == "Diverse Leader":
        t = "Leadership Training"
        return ([stack_choice(t, 3, page_trait_names("commander", after="Leadership Traits"))], [], {(t, 3)})
    if name == "Spirit Control":
        t = "Spiritual Apprentice"
        uas = [re.match(r"^## \*\*(.+?)\*\*$", l.strip()).group(1) for l in read("spirit-control")
               if re.match(r"^## \*\*(.+?)\*\*$", l.strip())]
        return ([stack_choice(t, 2, uas, pack="dbu-rpg.unique-abilities")], [], {(t, 2)})
    if name == "Bio-Diversity":
        t = "Genetic Smoothie"
        return ([stack_choice(t, 1, factor_trait_names("Genetic Splicing"), pack="dbu-rpg.racial-traits")], [], {(t, 1)})
    if name == "Cybernetic Upgrade":
        t = "Installed Cybernetics"
        return ([stack_choice(t, 1, factor_trait_names("Cybernetic Enhancement") + ["Regain a Secondary Racial Trait"],
                              pack="dbu-rpg.racial-traits")], [], {(t, 1)})
    return [], [], set()


# Effects compiled by hand: (page slug, trait, effect) → modifiers (the trait's "(n)" condition is added)
EFFECT_OVERRIDES = {
    # Saiyan Spirit (3): in the Undying State entered through Saiyan Heritage, Soak and Wound +Z(bT)
    ("zenkai", "Saiyan Spirit", 3): [("soak", "Z(bT)", "@states.undying >= 1"), ("wound", "Z(bT)", "@states.undying >= 1")],
    # Planetary Diet (2): only a Stack that is not a Temporary Awakening (the second one) gives the Ki Points
    ("fruits-might", "Planetary Diet (2)", 2): [("ki.max", "(2)*@PL", "@ZP >= 2")],
}


# Hand-written automation of single effects (build/automation/*.json, mechanical data only), keyed "slug|Trait|n":
#   {"replace": bool, "modifiers": [{target, value, condition}], "triggers": [{event, effect, value, resource, condition,
#    mode, duration}], "code": "<key of an effect run by the system's code>", "status": "auto|lembrete|manual"}
# "replace" drops what the text patterns compiled for that effect. "code" effects are listed in the item's
# flags.dbu-rpg.code ("slug|Trait|n" → key) for module/combat/awakening-effects.mjs.
AUTOMATION = {}
AUTOMATION_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "automation")
if os.path.isdir(AUTOMATION_DIR):
    for _f in sorted(os.listdir(AUTOMATION_DIR)):
        if _f.endswith(".json"):
            AUTOMATION.update(json.load(open(os.path.join(AUTOMATION_DIR, _f), encoding="utf-8")))
AUTOMATION_USED = set()
# Labels switched off for good on a Transformation (slug → Trait names): the Minion Class Traits of Commander
LOCKED_OFF = {}
CODE_EFFECTS = {}
# Code effects the system implements (module/combat/awakening-effects.mjs); the others stay with the GM
IMPLEMENTED_CODE = set()
# DBU_DUMP_EFFECTS=<file>: write every Transformation and Racial Trait effect (text + what was compiled) for the
# automation work
DUMP = [] if os.environ.get("DBU_DUMP_EFFECTS") else None
DUMP_GROUPS = []


# Items a Trait gives ("Gain access to the Analysis Maneuver"): the automation entry's code {category "grant", spec
# "grant maneuver: Analysis; talent: Snack Fiend"} names them; the importer finds them in the compendiums and the system
# adds them with the Trait (module/rules/grants.mjs). LAST_GRANTS collects them for the Trait being built.
GRANT_PACKS = {"maneuver": "maneuvers", "talent": "talents", "uniqueAbility": "unique-abilities", "racialTrait": "racial-traits",
               "signature": "signature-examples", "transformation": "transformations"}
GRANT_RE = re.compile(r"\b(maneuver|talent|uniqueAbility|racialTrait|signature|transformationLine|transformation|gear)\s*:\s*([^;]+)")
# IG "grant gear: Plating": an item the Trait makes, not from a compendium (GEAR_GRANTS: its data; "from" copies an
# equipment item by name and changes it)
_NATURAL = lambda name: {"type": "apparel", "name": name, "img": "icons/svg/shield.svg",
                         "system": {"category": "armor", "craftsmanship": 1, "layer": "top", "natural": True, "integrated": True,
                                    "equipped": True, "breakValue": 3, "qualities": []}}
GEAR_GRANTS = {
    "Plating": _NATURAL("Plating"),
    "Metal Exoskeleton": _NATURAL("Metal Exoskeleton"),
    "Integrated Weapon": {"type": "weapon", "name": "Integrated Weapon", "img": "icons/svg/sword.svg",
                          "system": {"craftsmanship": 4, "integrated": True, "equipped": True, "qualities": [{"name": "Regenerating", "slots": 0}]}},
    "Onboard Scouter": {"from": "Scouter [Tech]", "name": "Onboard Scouter", "system": {"craftDC": "Master", "equipped": True}},
    # Weapon Ports: two Installed Weapons of Grade 2 with different Weapon Types and the Artisan Quality (1 slot)
    # F12 Extension Attack 3 (Extending Weapon): an Integrated Physical Weapon of Grade 5, Extending and Hidden
    "Prehensile Weapon": {"type": "weapon", "name": "Prehensile Weapon", "img": "icons/svg/sword.svg",
                          "system": {"weaponType": "physical", "craftsmanship": 5, "integrated": True, "equipped": True,
                                     "qualities": [{"name": "Extending", "slots": 1}, {"name": "Hidden", "slots": 1}]}},
    "Installed Weapon (Physical)": {"type": "weapon", "name": "Installed Weapon (Physical)", "img": "icons/svg/sword.svg",
                                    "system": {"weaponType": "physical", "craftsmanship": 2, "integrated": True, "equipped": True, "qualities": [{"name": "Artisan", "slots": 1}]}},
    "Installed Weapon (Energy)": {"type": "weapon", "name": "Installed Weapon (Energy)", "img": "icons/svg/lightning.svg",
                                  "system": {"weaponType": "energy", "craftsmanship": 2, "integrated": True, "equipped": True, "qualities": [{"name": "Artisan", "slots": 1}]}},
}
# B5 "grant transformation: Pure Form +aspect:prelude" / "transformationLine: Super Saiyan +aspect:natural:1": an Aspect
# patch applied when the Transformation is added (module/rules/grants.mjs patchAspects)
ASPECT_PATCH_RE = re.compile(r"\s*\+aspect:\s*([A-Za-z0-9]+)(?::\s*(\d+))?")


# D3 "grant maneuver: Divine Flame +active": the granted item works only while the granting item does
ACTIVE_RE = re.compile(r"\s*\+active\b", re.I)
# OG "+option:<Name>": the granted item comes with that option of the Racial Trait (switched on) and goes with it;
# "+res:<slug>": it works only while that sheet resource is 1+
OPTION_G_RE = re.compile(r"\s*\+option\s*:\s*([^+;]+?)\s*(?=\+|$)", re.I)
RES_G_RE = re.compile(r"\s*\+res\s*:\s*([A-Za-z0-9]+)(?:\s*:\s*(\d+))?", re.I)
# F8 "+state:<key>": it works only while the owner is in that State
STATE_G_RE = re.compile(r"\s*\+state\s*:\s*([A-Za-z0-9]+)", re.I)
# T22 "+picked:<Option>": it works only while that option of the granting item's choices is picked (a Class)
PICKED_G_RE = re.compile(r"\s*\+picked\s*:\s*([^+;]+?)\s*(?=\+|;|$)", re.I)
# F14 "+free": a granted Awakening comes with a free Stack (no Awakening Limit, no Attribute Modifier Bonus)
FREE_G_RE = re.compile(r"\s*\+free\b", re.I)
# Q "grant maneuver: Divine Flame +mastery:1": the granted item works only once the granting item has that many Masteries
MASTERY_RE = re.compile(r"\s*\+mastery\s*:\s*(\d+)", re.I)
# D3 "grant pick: 2 maneuver from God Maneuvers +active": a choice of the Transformation (its picks bring their items)
PICK_RE = re.compile(r"\bpick\s*:\s*(\d+)\s+(maneuver|talent|uniqueAbility|racialTrait)s?\s+from\s+([^;+]+?)\s*(\+active)?\s*(\+mastery\s*:\s*\d+)?\s*(?:;|$)", re.I)
# The choices those picks make, collected for the Transformation being built
LAST_PICKS = []


def pick_options(kind, where):
    """Names of the compendium items of a pick: the items of that folder (by name), or the Racial Traits of that group,
    Factor or Race ("God Maneuvers", "Bestial Traits", "Super Genetic")."""
    pack = GRANT_PACKS[kind]
    docs = PACKS.get(pack, [])
    w = re.sub(r"[^a-z0-9]", "", where.lower())
    folders = {d["_id"] for d in docs if d.get("_type") == "Folder" and re.sub(r"[^a-z0-9]", "", d["name"].lower()) in (w, w + "s", w.rstrip("s"))}
    out = []
    for d in docs:
        if d.get("_type") != "Item":
            continue
        sysd = d["system"]
        keys = [sysd.get("group", ""), sysd.get("factor", ""), sysd.get("race", "")] if kind == "racialTrait" else []
        if d.get("folder") in folders or any(re.sub(r"[^a-z0-9]", "", str(k).lower()) in (w, w + "s", w.rstrip("s")) for k in keys if k):
            out.append(d["name"])
    return sorted(dict.fromkeys(out))


def split_aspects(name):
    """("Pure Form", [{"key": "prelude", "level": 0}]) from "Pure Form +aspect:prelude"."""
    aspects = [{"key": k, "level": int(n or 0)} for k, n in ASPECT_PATCH_RE.findall(name)]
    return ASPECT_PATCH_RE.sub("", name).strip(), aspects
LAST_GRANTS = []
UNRESOLVED_GRANTS = []


def find_grant(kind, name):
    """The compendium item a grant names ("Analysis", "Boom Maneuver", "the Terrify Maneuver"), or None."""
    pack = GRANT_PACKS.get(kind)
    # Both names without "the", the type word ("Tail Attack" = "Tail Attack Maneuver") and punctuation
    def norm(x):
        x = re.sub(r"^(the|a|an)\s+", "", x.strip().strip("."), flags=re.I)
        x = re.sub(r"\s+(Special\s+)?(Maneuver|Talent|Unique Ability|Racial Trait|Trait)s?$", "", x, flags=re.I)
        return re.sub(r"[^a-z0-9]", "", x.lower())
    for d in PACKS.get(pack, []):
        if d.get("_type") == "Item" and (norm(d["name"]) == norm(name)):
            return d
    return None


def grant_list(a, key):
    """[{type, name, uuid}] of an entry's grants (all resolved), or None when one of them is not in the compendiums."""
    code = a.get("code") or {}
    # (OG: an entry's own "grant" field grants too, whatever its code category: an entry still partly the GM's)
    if code.get("category") != "grant" and not a.get("grant"):
        return []
    out = []
    spec = ";".join(x for x in [code.get("spec", "") if code.get("category") == "grant" else "", a.get("grant", "")] if x)
    # D3: "pick: <n> <kind> from <folder or group>" makes a choice of the Transformation (resolved now: the packs it
    # names are built before the Transformations)
    for n, kind, where, active, mastery in PICK_RE.findall(spec):
        kind = {"uniqueability": "uniqueAbility", "racialtrait": "racialTrait"}.get(kind.lower(), kind.lower())
        options = pick_options(kind, where.strip())
        if not options:
            UNRESOLVED_GRANTS.append(f"{key}: pick {n} {kind} from {where.strip()} (no such folder or group)")
            return None
        trait = key.split("|")[1]
        LAST_PICKS.append({"id": f"{trait}#pick{len(LAST_PICKS) + 1}", "trait": trait, "options": options, "pick": int(n),
                           "selected": [], "detail": "", "subs": [], "perStack": False, "repeat": False, "noRepeatLast": False,
                           "pack": f"dbu-rpg.{GRANT_PACKS[kind]}", "pickFormula": "", "grantActive": bool(active),
                           "grantMastery": int(MASTERY_RE.search(mastery).group(1)) if mastery else 0})
    spec = PICK_RE.sub(";", spec)
    for kind, name in GRANT_RE.findall(spec):
        active = bool(ACTIVE_RE.search(name))
        name = ACTIVE_RE.sub("", name)
        om = OPTION_G_RE.search(name)
        rm = RES_G_RE.search(name)
        sm = STATE_G_RE.search(name)
        fm = FREE_G_RE.search(name)
        pm = PICKED_G_RE.search(name)
        name = PICKED_G_RE.sub("", name)
        name = FREE_G_RE.sub("", STATE_G_RE.sub("", RES_G_RE.sub("", OPTION_G_RE.sub("", name))))
        og = {**({"option": om.group(1).strip()} if om else {}), **({"res": rm.group(1).lower()} if rm else {}),
              **({"resMin": int(rm.group(2))} if (rm and rm.group(2)) else {}), **({"state": sm.group(1)} if sm else {}),
              **({"free": True} if fm else {}), **({"picked": pm.group(1).strip()} if pm else {})}
        mm = MASTERY_RE.search(name)
        mastery = {"mastery": int(mm.group(1))} if mm else {}
        name = MASTERY_RE.sub("", name)
        # Transformations are built after the Racial Traits: found at the end (a Line: every Stage of it)
        if kind in ("transformation", "transformationLine"):
            name, aspects = split_aspects(name)
            out.append({"type": kind, "name": name, "uuid": "", "pending": key, **({"aspects": aspects} if aspects else {}),
                        **({"active": True} if active else {}), **mastery, **og})
            continue
        if kind == "gear":
            g = GEAR_GRANTS.get(name.strip())
            if g and g.get("from"):
                base = next((x for x in PACKS.get("equipment", []) if x.get("_type") == "Item" and x["name"] == g["from"]), None)
                g = ({"type": base["type"], "name": g["name"], "img": base.get("img"), "system": {**base["system"], **g["system"]}} if base else None)
            if not g:
                UNRESOLVED_GRANTS.append(f"{key}: gear {name.strip()}")
                return None
            data = json.loads(json.dumps(g))
            data.setdefault("flags", {}).setdefault("dbu-rpg", {})["integrated"] = True
            out.append({"type": g["type"], "name": g["name"], "uuid": "", "data": data, **og})
            continue
        d = find_grant(kind, name)
        if not d and kind == "racialTrait":
            # A Racial Trait built later (a Monstrous Trait, a Custom Species Trait further down the page): found at the end
            out.append({"type": "racialTrait", "name": name.strip(), "uuid": "", "pending": key, **({"active": True} if active else {}), **mastery, **og})
            continue
        if not d:
            UNRESOLVED_GRANTS.append(f"{key}: {kind} {name.strip()}")
            return None
        out.append({"type": d["type"], "name": d["name"], "uuid": f"Compendium.dbu-rpg.{GRANT_PACKS[kind]}.Item.{d['_id']}",
                    **({"active": True} if active else {}), **mastery, **og})
    return out or None


def fx_slug(x):
    """Lowercase letters and digits, accents dropped (module/rules/awakening.mjs awakeningSlug)."""
    x = unicodedata.normalize("NFD", str(x or "").lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in x if not unicodedata.combining(c)))


def fx_ref(slug, trait, n):
    """The reference of an effect: fx_ref("super-saiyan", "Golden Power", 3) = "supersaiyan_goldenpower_3"."""
    return f"{fx_slug(slug)}_{fx_slug(trait)}_{re.sub(r'[^a-z0-9]', '', str(n).lower())}"


# R: True while a Racial Trait's effects are applied (an entry's own choice is for Transformations only)
RACIAL_BUILD = [False]
# D1: the effects of the item being built ({ref: condition of its Trait}), read by add_item
LAST_FX = {}
LAST_FX_PERMANENT = set()


def apply_automation(slug, trait, e, mods, trigs, structure, cond):
    key = f"{slug}|{trait}|{e.get('kn', e['n'])}"
    ref = fx_ref(slug, trait, e.get("kn", e["n"]))
    LAST_FX[ref] = cond or ""
    if "Permanent" in e["keywords"]:
        LAST_FX_PERMANENT.add(ref)
    mods, trigs, structure = apply_automation_entry(slug, trait, e, key, mods, trigs, structure, cond)
    for x in mods + trigs:
        x.setdefault("fx", ref)
    return mods, trigs, structure


def apply_automation_entry(slug, trait, e, key, mods, trigs, structure, cond):
    a = AUTOMATION.get(key)
    if not a:
        return mods, trigs, structure
    AUTOMATION_USED.add(key)
    picks_before = len(LAST_PICKS)
    # R: the entry's own choice ({"options": [...], "pick": n}): a choice of the Transformation; its "option" pieces are
    # switched on when picked (Racial Traits have no choices: reported)
    if a.get("choice"):
        if RACIAL_BUILD[0]:
            UNRESOLVED_GRANTS.append(f"{key}: a choice on a Racial Trait (Transformations only)")
        else:
            LAST_PICKS.append({"id": f"{trait}#{e.get('kn', e['n'])}c", "trait": trait, "options": list(a["choice"]["options"]),
                               "pick": int(a["choice"].get("pick", 1)), "selected": [], "detail": "", "subs": [], "perStack": False,
                               "repeat": False, "noRepeatLast": False, "pack": "", "pickFormula": "", "grantActive": False, "grantMastery": 0,
                               "entry": True})
    grants = grant_list(a, key)
    if grants:
        LAST_GRANTS.extend(grants)
    # D3: a "pick:" grant made a choice of the Transformation
    picked = len(LAST_PICKS) > picks_before
    permanent = "Permanent" in e["keywords"]
    if a.get("replace"):
        mods, trigs = [], []
    opt = lambda x: f"{trait} — opção: {x['option']}" if x.get("option") else ""
    for m in a.get("modifiers", []):
        mods.append({"target": m["target"], "value": str(m.get("value", "")),
                     "condition": " && ".join(x for x in [m.get("condition", ""), cond] if x),
                     "label": opt(m) or trait, "active": False if m.get("option") else m.get("active", True),
                     "always": bool(m.get("always", permanent)),
                     "mode": m.get("mode", ""), "limit": m.get("limit", ""),
                     # Option pieces (attack.*, vs.*, defense.*, clash.*...): only written when set
                     **{k: str(m[k]) for k in ("cost", "amount", "group", "limitKey", "at", "range", "exclusive", "checkCost") if m.get(k)}})
    for t in a.get("triggers", []):
        trigs.append({"event": t["event"], "effect": t["effect"], "value": str(t.get("value", "")), "resource": t.get("resource", ""),
                      "condition": " && ".join(x for x in [t.get("condition", ""), cond] if x), "mode": t.get("mode", "auto"),
                      "duration": t.get("duration", "none"), "label": opt(t) or t.get("label") or trait,
                      "active": False if t.get("option") else t.get("active", True),
                      "target": t.get("target", "self"), "limit": t.get("limit", ""),
                      **{k: str(t[k]) for k in ("cost", "amount", "limitKey", "group", "roll", "rollKey", "check", "onCheck", "with", "range")
                         if t.get(k)},
                      "always": bool(t.get("always", permanent))})
    code = a.get("code") or {}
    implemented = (code.get("category") and code.get("key") in IMPLEMENTED_CODE) or (bool(grants) and code.get("category") == "grant") or picked
    if implemented and code.get("key"):
        CODE_EFFECTS.setdefault(slug, {})[key] = code["key"]
    data = bool(a.get("modifiers")) or any(t["effect"] != "message" for t in a.get("triggers", []))
    if a.get("status"):
        status = a["status"]
    elif a.get("verdict") == "covered" and not code:
        # Already done by what the system does anyway (the Aspects a Mastery Trait gives or takes, another effect's pieces)
        status = "auto"
    elif code and not implemented:
        # Part of it still needs the GM (what the data cannot do)
        status = "parcial" if (data or mods or any(t["effect"] != "message" for t in trigs)) else ("lembrete" if trigs else None)
    else:
        status = "auto" if (data or implemented) else ("lembrete" if a.get("triggers") else None)
    if status:
        structure = [s.rsplit("— ", 1)[0] + "— " + status for s in structure]
    return mods, trigs, structure


# Traits picked once out of a group ("Upon gaining access to this Transformation, select and gain access to an 'Aura
# Trait'"): Transformation → [(Trait that asks, group name or list of Trait names, how many, pickFormula)]. Only the
# picked Traits work (module/rules/awakening.mjs); before this, every Trait of the group applied at once.
GROUP_CHOICES = {
    "Divinity Unleashed": [("Ascended Divine Magic", "Domain", 1, "")],
    "Brilliant Evolution": [("Brilliant Plating", "Brilliant Evolution", 1, "")],
    "Elemental Supremacy": [("Elemental Aptitude", "Elemental", 1, "")],
    "Full Power Super Saiyan": [("Style of Super Saiyan", "Super Saiyan Style", 1, "")],
    # One more Genetic Trait for each base Tier of Power gained after the 2nd (max. +2)
    "Genetic Power": [("Genetic Transformation", "Genetic", 1, "1 + min(2, max(0, @bT - 2))")],
    # Strong Aura and Powerful Aura each give one
    "Sparking Aura": [("Strong Aura", "Aura", 2, "")],
    "Super Demon": [("Fiendish Power", "Demonic", 1, "")],
    "Super Form": [("Your Transformation", "Form", 2, "")],
    # One more with the Far Beyond Perfection Mastery Trait
    "Super Perfect Form": [("Super Genetic Transformation", "Super Genetic", 1, "1 + min(1, @M)")],
    "Formation": [("Power of Love", ["Powerful Love", "Wild Love", "Striking Love"], 1, "")],
    "Initial Class": [("Starting Class", ["Spiritualist", "Warrior", "Cleric", "Mighty", "Wonder"], 1, "")],
    "Advanced Vocation": [("Vocation Training II", ["Gladiator", "Paladin", "Sage", "Pirate", "Monster Master", "Luminary"], 1, "")],
}
# Groups whose n-th Trait comes with the n-th Grade ("Each Grade gives you access to a Godly Super Saiyan Trait")
GRADE_GROUPS = {"Beyond Divine Saiyan": "Godly Super Saiyan"}


# Published Transformation pages the site menu does not list yet (2026-11-04 update: new Adversary Transformations,
# Black Janemba, Heart Reader, Strong Closer). Other Transformation pages missing from the menu are only reported.
EXTRA_TRANSFORMATION_PAGES = ["archetypal-speedster", "archetypal-trickster", "raid-boss", "sadistic-villain", "tireless",
                              "black-janemba", "heart-reader", "strong-closer"]


def build_transformations():
    pages = set()
    for r in MENU:
        if r["slug"] and not r["slug"].startswith("http") and r["slug"] not in HOMEBREW:
            pages.add(r["slug"])
    for slug in EXTRA_TRANSFORMATION_PAGES:
        if read(slug):
            pages.add(slug)
    listed = {r["slug"] for r in MENU}
    for f in sorted(os.listdir(TEXT)):
        slug = f[:-3]
        if f.endswith(".md") and slug not in pages and slug not in listed and any(TT_RE.search(l) for l in read(slug)):
            print(f"note: Transformation page not in the site menu, skipped: {slug}")
    for slug in pages:
        lines = read(slug)
        if lines and any("Awakening Type" in l for l in lines):
            title = lines[0].lstrip("# ").strip()
            AWAKENING_NAMES[awakening_slug(title)] = title
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
            # What this Transformation's effects grant ("Gain access to the X Unique Ability"): collected by apply_automation
            LAST_GRANTS.clear()
            LAST_PICKS.clear()
            LAST_FX.clear()
            LAST_FX_PERMANENT.clear()
            ignore_top = False
            in_mastery = False
            # Groups of Traits (Technical Traits...) and the effects that pick one of them for every Stack
            groups, group, group_picks, stack_gains = {}, "", [], []
            i = bonus_start + 2 if bonus_start else 0
            while i < len(seg):
                head = trait_heading(seg[i].strip())
                if not head:
                    # "Minion Class Traits" on a line of its own opens a group too
                    label = re.fullmatch(r"([A-Z][A-Za-z' -]+) Traits", seg[i].strip())
                    if label:
                        group = label.group(1).strip()
                    i += 1
                    continue
                kind, name, _ = head
                effects, j = parse_effects(seg, i + 1)
                seen_n = {}
                for e in effects:
                    seen_n[e["n"]] = seen_n.get(e["n"], 0) + 1
                    e["kn"] = str(e["n"]) if seen_n[e["n"]] == 1 else f"{e['n']}{'abcdefgh'[seen_n[e['n']] - 1]}"
                if not effects:
                    i += 1
                    continue
                opened = trait_group(seg[i].strip())
                if opened:
                    group = opened
                elif kind != "trait":
                    group = ""
                if group and kind == "trait":
                    groups.setdefault(group, []).append(name)
                if trans_type == "awakening":
                    for e in effects:
                        gm = STACK_GROUP_RE.search(clean(e["text"]))
                        om = None if gm else ONCE_GROUP_RE.search(clean(e["text"]))
                        if gm:
                            group_picks.append((name, e["n"], gm.group(1).strip()))
                        elif om and (int(max_stacks.group(1)) if max_stacks else 1) == 1 and re.search(r"\b(select|choose|gain access)\b", clean(e["text"]), re.I):
                            group_picks.append((name, e["n"], om.group(1).strip()))
                        elif stack_gain_effect(e["text"], b["name"]) and not stack_gain_mods(e["text"], name):
                            stack_gains.append((name, e["n"]))
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
                # A State box: its effects work while in that State
                if kind == "state":
                    cond = f"@states.{STATE_BOXES[name[:-len(' State')].lower()]} >= 1"
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
                # A Trait of a group picked once (Aura Traits, Domain Traits, Minion Class Traits...) is compiled as before
                # the Awakening Stack patterns: those groups are not choices yet, so their Traits all stay switched on, and
                # the new patterns would only add bonuses the character may not have picked. A group picked for every Stack
                # (Technical Traits...) is a per-Stack choice, which switches its Traits on as they are picked.
                stack_group = trans_type == "awakening" and any(g == group for (_, _, g) in group_picks)
                LEGACY["on"] = bool(group and kind == "trait" and not stack_group)
                # One effect at a time, so that the hand-written automation of an effect can add to (or replace) what the
                # patterns compiled for it
                mods, trigs, st = [], [], []
                for e in effects:
                    em, et, es = compile_effects([e], name, cond)
                    for tgt, val, c in EFFECT_OVERRIDES.get((slug, name, e["n"]), []):
                        em.append({"target": tgt, "value": val, "condition": " && ".join(x for x in [c, cond] if x), "label": name,
                                   "active": True, "always": False})
                        es = [s.replace("— manual", "— auto").replace("— lembrete", "— auto") for s in es]
                    compiled = {"modifiers": [dict(m) for m in em], "triggers": [dict(t) for t in et], "status": es[0].rsplit("— ", 1)[-1] if es else ""}
                    em, et, es = apply_automation(slug, name, e, em, et, es, cond)
                    if DUMP is not None:
                        DUMP.append({"key": f"{slug}|{name}|{e.get('kn', e['n'])}", "item": b["name"], "slug": slug, "trait": name, "kind": kind,
                                     "transType": trans_type, "subtype": subtype, "group": group if kind == "trait" else "",
                                     "n": e["n"], "keywords": e["keywords"], "text": clean(e["text"]), "condition": cond,
                                     "maxStacks": int(max_stacks.group(1)) if max_stacks else 1,
                                     # J: an Evolved Stage typed as a Form ("Evolved Stage Type: Unique (...)") may read @O*
                                     "evolvedStage": bool(fields.get("evolved stage type")), **compiled})
                    mods += em
                    trigs += et
                    st += es
                LEGACY["on"] = False
                # Minion Class Traits (Commander) are given to the Minions, not to whoever has the Awakening
                if group == "Minion Class":
                    LOCKED_OFF.setdefault(slug, set()).add(name)
                    for mm in mods + trigs:
                        mm["active"] = False
                    st = [x.rsplit("— ", 1)[0] + "— minion" for x in st]
                if kind == "transcendent trait":
                    for mm in mods + trigs:
                        if not mm.get("always"):
                            mm["condition"] += " && @TR >= 1"
                if "legendary" in kind:
                    legendary.add(name)
                    for mm in mods + trigs:
                        mm["always"] = True
                # ...even when the Transformation that defines it is not the one you are in (Blue Saiyan enters Radiant God)
                if kind == "state":
                    for mm in mods + trigs:
                        mm["always"] = True
                own_mods += mods
                own_trigs += trigs
                traits.append(f"{name}{' [' + kind + ']' if kind != 'trait' else ''}")
                structure.append(f"<strong>{name}</strong>{' (' + kind + ')' if kind != 'trait' else ''}: " + "; ".join(st))
                i = j
            if DUMP is not None and groups:
                DUMP_GROUPS.append({"item": b["name"], "slug": slug, "transType": trans_type, "groups": groups,
                                    "picks": [list(x) for x in group_picks]})
            own_names = {re.sub(r"\s*\[[^\]]*\]$", "", t) for t in traits}
            for tname, opts, pick, formula in GROUP_CHOICES.get(b["name"], []):
                options = groups.get(opts, []) if isinstance(opts, str) else [o for o in opts if o in own_names]
                if tname not in own_names or not options:
                    continue
                if trans_type == "awakening":
                    own_choices.append(stack_choice(tname, "group", options, pick=pick))
                else:
                    own_choices.append({"id": f"{tname}#group", "trait": tname, "options": options, "pick": pick, "selected": [],
                                        "detail": "", "subs": [], "perStack": False, "repeat": False, "noRepeatLast": False,
                                        "pack": "", "pickFormula": formula})
            gg = GRADE_GROUPS.get(b["name"])
            for k, gname in enumerate(groups.get(gg, []) if gg else []):
                for mm in own_mods + own_trigs:
                    if mm.get("label") == gname:
                        mm["condition"] = " && ".join(x for x in [mm.get("condition", ""), f"@G >= {k + 1}"] if x)
            # Awakening Stacks: a choice for every Stack (a Trait of a group, or one of the hand-written ones), and a
            # reminder for the other "upon gaining a stack" effects
            stack_top, stack_note = "", ""
            if trans_type == "awakening":
                handled = set()
                for tname, n, gname in group_picks:
                    if gname in groups:
                        own_choices.append(stack_choice(tname, n, groups[gname]))
                        handled.add((tname, n))
                extra_choices, extra_mods, done = stack_overrides(b["name"])
                own_choices += extra_choices
                own_mods += extra_mods
                handled |= done
                for tname, n in stack_gains:
                    if (tname, n) in handled:
                        continue
                    req_n = re.search(r"\((\d)\)\s*$", tname)
                    own_trigs.append({"event": "stackGain", "effect": "message", "value": f"efeito ({n})", "resource": "",
                                      "condition": f"@Z >= {req_n.group(1)}" if req_n else "", "mode": "remind",
                                      "duration": "none", "label": tname, "active": True})
                # "Tier of Power Requirement. 2+ (3+ for second stack)"
                sm = re.search(r"\((\d)\+ for (?:the )?(second|third|fourth|2nd|3rd|4th) stack\)",
                               fields.get("tier of power requirement", "") or "", re.I)
                if sm and top:
                    pos = {"second": 2, "2nd": 2, "third": 3, "3rd": 3, "fourth": 4, "4th": 4}[sm.group(2).lower()]
                    stack_top = ",".join([top.group(1)] * (pos - 1) + [sm.group(1)])
                stack_note = STACK_NOTES.get(b["name"], "")
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
                "stacks": 1, "maxStacks": int(max_stacks.group(1)) if max_stacks else 1, "stackTop": stack_top,
                "stackNote": stack_note,
                # I2: a Unique Evolved Stage names its Original Form ("Evolved Stage Type: Unique (Super Saiyan 4)"); a
                # Generic one gets it from the item sheet
                "original": ORIGINAL_ALIASES.get(_orig := (re.match(r"^Unique\s*\((.+)\)\s*$", fields.get("evolved stage type", "")) or [None, ""])[1].strip(), _orig),
                "modifiers": own_mods, "triggers": own_trigs, "choices": own_choices + [dict(p) for p in LAST_PICKS],
                "masteryAspects": mastery_aspects,
                "gradeAspects": grade_aspects(seg), "ignoreTop": ignore_top, "inherited": [],
                "homebrew": False,
                "summary": " · ".join(x for x in [
                    f"{trans_type.capitalize()} {subtype}".strip(), f"ToP {int(top.group(1)) if top else 1}+",
                    f"Stress {stress.group(1)}" if stress else "", race,
                    "bônus por Grade (ver tabela)" if any(v == "*" for v in bonuses.values()) else ""] if x)
            }
            # How much of it the system does by itself ("narrativo": nothing mechanical to automate)
            counts = {k: sum(s.count(f"— {k}") for s in structure) for k in ("auto", "parcial", "manual", "lembrete", "narrativo")}
            mech = sum(counts.values()) - counts["narrativo"]
            if mech:
                system["summary"] += f" · {counts['auto']}/{mech} efeitos automáticos" + (f", {counts['parcial']} em parte" if counts["parcial"] else "")
            # I3: the Grades a Graded Transformation has to begin with ("Kaioken has 3 Grades"); Traits that give access to
            # more add "gradeMax.<slug>" pieces (the sheet stops at maxGrade + those)
            base_grades = re.search(r"\bhas (\d+) Grades\b", " ".join(seg))
            if base_grades and not system.get("maxGrade"):
                system["maxGrade"] = int(base_grades.group(1))
            ov = GRADED.get(b["name"]) or GRADED.get(title)
            if ov:
                system["bonuses"].update(ov.get("bonuses", {}))
                system["gradeStress"] = ov.get("gradeStress", "")
                system["maxGrade"] = ov.get("maxGrade", system.get("maxGrade", 0))
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
                           key=f"{slug}:{b['name']}", grants=list(LAST_GRANTS))
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
        flags = t["doc"]["flags"]["dbu-rpg"]
        own = {"mods": list(s["modifiers"]), "trigs": list(s["triggers"]), "choices": list(s["choices"]),
               "mastery": list(s["masteryAspects"]), "ignoreTop": s.get("ignoreTop", False), "from": [], "traits": [],
               "fx": dict(flags.get("fx", {})), "fxPermanent": set(flags.get("fxPermanent", []))}
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
            # D1: the effects of the Traits inherited (their pieces keep the reference of the lower Stage's effect)
            kept = {fx_slug(x["trait"]) for x in own["traits"]} | {fx_slug(base_trait(x["trait"])) for x in own["traits"]}
            kept |= {x.get("fx") for x in own["mods"] + own["trigs"] if x.get("fx")}
            for ref, c in got["fx"].items():
                parts = ref.split("_")
                if (len(parts) == 3 and parts[1] in kept) or ref in kept:
                    own["fx"].setdefault(ref, c)
                    if ref in got["fxPermanent"]:
                        own["fxPermanent"].add(ref)
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
        if e["fx"]:
            t["doc"]["flags"]["dbu-rpg"]["fx"] = e["fx"]
        if e["fxPermanent"]:
            t["doc"]["flags"]["dbu-rpg"]["fxPermanent"] = sorted(e["fxPermanent"])
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


# Transformation pages with Unique Abilities of their own (the "## **Name**" blocks with an Ability Type); a block ends
# at the page's end ("Previous") or at a Trait heading after it (Grand Awakening, Burst Limit, Mastery Trait...)
UA_EXTRA_PAGES = ["spirit-control", "gravity-controller", "manifested-willpower", "energy-consumption", "time-power",
                  "appointed-god", "warlock", "time-skipper", "shinigami-factor", "ruler-of-time"]
UA_BLOCK_END = re.compile(r"^(Previous|Return to Top)$|^#### \*\*(Grand Awakening|Burst Limit|Mastery Trait|Legendary Trait|Factor Trait)")


def ua_blocks(slug, extra=False):
    lines = read(slug)
    heads = [i for i, l in enumerate(lines) if re.match(r"^## \*\*[^*]+\*\*\s*$", l.strip())]
    heads.append(len(lines))
    for a, b in zip(heads, heads[1:]):
        name = re.match(r"^## \*\*([^*]+)\*\*", lines[a].strip()).group(1).strip()
        seg = lines[a:b]
        if extra:
            if not field_after(seg[:20], "Ability Type"):
                continue
            cut = next((k for k, l in enumerate(seg) if k and UA_BLOCK_END.match(l.strip())), None)
            if cut is not None:
                seg = seg[:cut]
        yield name, seg


def build_unique_abilities():
    blocks = [("unique-abilities", n, s) for n, s in ua_blocks("unique-abilities")]
    seen = {n for _, n, _ in blocks}
    for page in UA_EXTRA_PAGES:
        blocks += [(page, n, s) for n, s in ua_blocks(page, extra=True) if n not in seen]
    for slug, name, seg in blocks:
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
        add_item("unique-abilities", name, "uniqueAbility", system, slug, name, structure)


# ---------------------------------------------------------------------------
# Special Maneuvers, Basic Items
# ---------------------------------------------------------------------------
def entry_blocks(lines):
    """Yield (name, frequency, fields) for **Name [x/Round]**: entries followed by –**Field**: lines."""
    for i, l in enumerate(lines):
        s = l.strip()
        s = re.sub(r"^#+ \*\*[A-Za-z ]+?(?=[A-Z][a-z]+ [A-Z]?)", "**", s) if s.startswith("#") else s
        m = re.match(r"^\*\*([^*\[]+?)(?:\s*\[([^\]]+)\])?\*\*:", s)
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
            yield re.sub(r"^(?:[A-Z][a-z]+ )*[A-Z][a-z]+s(?=[A-Z][a-z])", "", m.group(1).strip()), (m.group(2) or ""), fields


# I2: the Original Form an Evolved Stage page names, when the Transformation has another name in the compendium
ORIGINAL_ALIASES = {"Super Janemba": "Janemba"}


# I1: Special Maneuvers whose effect the system runs when they are used (the "Usar" button fires maneuverUsed with
# @via_<name without "Maneuver">). Mechanical data only.
def _m(target, value, condition="", label=""):
    return {"target": target, "value": value, "condition": condition, "label": label, "active": True, "always": False,
            "mode": "", "limit": ""}


def _t(event, effect, value="", resource="", condition="", label="", target="self", duration="none", mode="auto"):
    return {"event": event, "effect": effect, "value": value, "resource": resource, "condition": condition, "label": label,
            "target": target, "duration": duration, "mode": mode, "limit": "", "active": True, "always": False}


MANEUVER_PIECES = {
    # Hyped until the end of your next turn (the resource counts your turn ends: 2 when used in your turn, else 1), with
    # +1(T) + 1/4 (rounded up) of your Personality Modifier to your Combat Rolls while Hyped
    "Hype Maneuver": {
        "modifiers": [_m("combat", "1(T)+ceil(@pe/4)", "@res.hyped >= 1", "Hyped")],
        "triggers": [_t("maneuverUsed", "resourceSet", "2", "Hyped", "@via_hype == 1 && @myTurn == 1", "Hyped"),
                     _t("maneuverUsed", "resourceSet", "1", "Hyped", "@via_hype == 1 && @myTurn == 0", "Hyped"),
                     _t("endOfTurn", "resource", "-1", "Hyped", "@res.hyped >= 1", "Hyped")]},
    # The Opponent you target is Analyzed until the end of your next turn (the mark Analyzed+), and your Combat Rolls
    # against Analyzed Opponents gain +1(T) + 1/4 (rounded up) of your Scholarship Modifier
    "Stance Maneuver": {
        "modifiers": [_m("wound", "1(T)", "@res.flamestance >= 1", "Flame Stance"), _m("might", "1(T)", "@res.flamestance >= 1", "Flame Stance"),
                      _m("awareness", "-1(T)", "@res.flamestance >= 1", "Flame Stance"),
                      _m("defenseValue", "1(T)", "@res.windstance >= 1", "Wind Stance"), _m("speed", "1(T)", "@res.windstance >= 1", "Wind Stance"),
                      _m("soak", "-1(T)", "@res.windstance >= 1", "Wind Stance"),
                      _m("awareness", "1(T)", "@res.wavestance >= 1", "Wave Stance"), _m("save.impulsive", "1(T)", "@res.wavestance >= 1", "Wave Stance"),
                      _m("save.corporeal", "1(T)", "@res.wavestance >= 1", "Wave Stance"), _m("wound", "-2(T)", "@res.wavestance >= 1", "Wave Stance"),
                      _m("soak", "1(T)", "@res.stonestance >= 1", "Stone Stance"), _m("surgency", "1(T)", "@res.stonestance >= 1", "Stone Stance"),
                      _m("defenseValue", "-1(T)", "@res.stonestance >= 1", "Stone Stance")],
        "triggers": [_t("maneuverUsed", "resourcePick", "1", "Flame Stance|Wind Stance|Wave Stance|Stone Stance|* Stance",
                        "@via_stance == 1", "Stance", mode="ask")]},
    # GL: each Action targets a Square (a Glass Sphere on the map: Magnitude = the times it was targeted, Standard at 1)
    # or a Character (a Clash Corporeal vs any Saving Throw: Slowed x the times it was targeted until your next turn)
    "Glassification": {
        "modifiers": [],
        "triggers": [{**_t("maneuverUsed", "placeArea", "@n", "Glass", "@via_glassification == 1", "Glassification: Square", mode="ask"), "amount": "3"},
                     {**_t("maneuverUsed", "condition", "@n", "slowed", "@via_glassification == 1 && @res.glasscombat6 == 0", "Glassification: Character",
                           target="targeted", duration="startOfNextTurn", mode="ask"), "amount": "3",
                      "check": "clash:corporeal vs impulsive|corporeal|cognitive|morale"}]},
    # UA: one of three effects (a button each): an Opponent in Melee Range Impaired after a Use Magic Clash, a Character in
    # Melee Range moved (Use Magic ranks Squares) after that Clash, or yourself placed within your Use Magic ranks (no
    # Exploit); a lost Clash offers the target's Exploit. (Whimsical Magic doubles the Use Magic ranks of these effects)
    # F16 Terrify: a Skill Clash (Intimidation vs Intuition/Intimidation, -2 against a higher Tier of Power) against an
    # Opponent within 4 Squares: Shaken until the end of your next turn, and Prone if it already was Shaken
    # F17 Absorb: the two Clashes against your target, then Shaken or absorbed (combat/absorb.mjs)
    "Absorb Maneuver": {
        "modifiers": [],
        "triggers": [_t("maneuverUsed", "absorbManeuver", "", "", "@via_absorb == 1", "Absorb", mode="ask")]},
    "Terrify Maneuver": {
        "modifiers": [_m("clash.skill", "-2", "@via_terrify == 1 && @vs.top > @bT", "Terrify: higher Tier of Power")],
        "triggers": [{**_t("maneuverUsed", "condition", "1", "prone", "@via_terrify == 1 && @vs.cond.shaken >= 1 && @vs.distance <= 4",
                           "Terrify", target="targeted", mode="ask"), "check": "clash:intimidation vs intuition|intimidation", "rollKey": "terrify"},
                     {**_t("maneuverUsed", "condition", "1", "shaken", "@via_terrify == 1 && @vs.distance <= 4", "Terrify",
                           target="targeted", duration="endOfNextTurn", mode="ask"), "check": "clash:intimidation vs intuition|intimidation", "rollKey": "terrify"}]},
    "Magic Trick Maneuver": {
        "modifiers": [],
        "triggers": [{**_t("maneuverUsed", "condition", "1", "impaired", "@via_magictrick == 1", "Magic Trick: Impaired",
                           target="targeted", duration="startOfNextTurn", mode="ask"), "check": "clash:useMagic vs intuition|useMagic"},
                     {**_t("maneuverUsed", "moveOther", "@ranks.useMagic * (1 + min(1, @item.whimsicalmagic))", "", "@via_magictrick == 1", "Magic Trick: move the target",
                           mode="ask"), "check": "clash:useMagic vs intuition|useMagic"},
                     _t("maneuverUsed", "teleport", "@ranks.useMagic * (1 + min(1, @item.whimsicalmagic))", "", "@via_magictrick == 1", "Magic Trick: move yourself", mode="ask"),
                     _t("clashLost", "provoke", "", "other", "@via_magictrick == 1", "Magic Trick (Exploitable)")]},
    # UA Healing Hands (Unique Ability): your target regains 1d10(bT) + your Magic Modifier LP (+1d10(bT) with Healing
    # Expertise); the passive +1 to Medicine
    "Healing Hands": {
        "modifiers": [_m("skill.medicine", "1", "", "Healing Hands (passive)")],
        "triggers": [{**_t("maneuverUsed", "life", "@roll + @ma", "", "@via_healinghands == 1", "Healing Hands", target="other"), "roll": "1d10(bT)"},
                     {**_t("maneuverUsed", "life", "@roll", "", "@via_healinghands == 1 && @adv.healingexpertise == 1",
                           "Healing Hands: Healing Expertise", target="other"), "roll": "1d10(bT)"}]},
    # UA Time Freeze (Unique Ability): a Frozen Turn (the sheet resource "Frozen Turn" while it lasts: until you end it or
    # the end of the turn); meanwhile the other Characters have -2(bT) Defense Value and -2 Perception
    "Time Freeze": {
        "modifiers": [_m("ally.defenseValue", "-2(bT)", "@res.frozenturn >= 1", "Time Freeze: Frozen Turn"),
                      _m("foe.defenseValue", "-2(bT)", "@res.frozenturn >= 1", "Time Freeze: Frozen Turn"),
                      _m("ally.skill.perception", "-2", "@res.frozenturn >= 1", "Time Freeze: Frozen Turn"),
                      _m("foe.skill.perception", "-2", "@res.frozenturn >= 1", "Time Freeze: Frozen Turn")],
        "triggers": [_t("maneuverUsed", "resourceSet", "1", "Frozen Turn", "@via_timefreeze == 1", "Time Freeze: Frozen Turn"),
                     {**_t("maneuverUsed", "message", "Frozen Turn: 2 Actions, Standard Maneuvers only (no Ki Wager, Instant / Out-of-Sequence Maneuvers, Combat Recovery, Power Up, Energy Charge, Unique Abilities or Special Maneuvers on others); the others use no Counter, Instant or Out-of-Sequence Maneuvers (Surges allowed)",
                           "", "@via_timefreeze == 1", "Time Freeze"), "mode": "remind"},
                     _t("use", "resourceSet", "0", "Frozen Turn", "@res.frozenturn >= 1", "Time Freeze: end the Frozen Turn"),
                     _t("endOfTurn", "resourceSet", "0", "Frozen Turn", "@res.frozenturn >= 1", "Time Freeze: the Frozen Turn ends")]},
    # PD: as the Grappler, target the Grappled: up to 3 Actions, each 1/2 of your Might off its LP and KP (you regain them)
    "Power Drain Maneuver": {
        "modifiers": [],
        "triggers": [{**_t("maneuverUsed", "powerDrain", "@n", "", "@via_powerdrain == 1 && @grappling == 1", "Power Drain",
                           target="targeted", mode="ask"), "amount": "3", "cost": "actions:@n"}]},
    # PD: a Parry that avoids an Energy / Magic attack may absorb it: its Urgent Wound Roll, 1/2 of it back as KP
    "Attack Absorption Maneuver": {
        "modifiers": [],
        "triggers": [_t("dodged", "absorbAttack", "", "", "@parry == 1 && (@energy == 1 || @magic == 1)", "Attack Absorption", mode="ask")]},
    "Analysis Maneuver": {
        "modifiers": [_m("vs.combat", "1(T)+ceil(@sc/4)", "@vs.mark.analyzed >= 1", "Analyzed")],
        "triggers": [_t("maneuverUsed", "mark", "1", "Analyzed+", "@via_analysis == 1", "Analyzed", target="targeted",
                        duration="endOfNextTurn")]},
    # T5 Intuit: the targeted Opponent is 'Seen' until the end of your next turn; +2 to your Skill Checks and +1(T) to your
    # Saving Throws in Clashes against a Seen Opponent
    "Intuit Maneuver": {
        "modifiers": [_m("clash.skill", "2", "@vs.mark.seen >= 1", "Seen"), _m("clash.save", "1(T)", "@vs.mark.seen >= 1", "Seen")],
        "triggers": [_t("maneuverUsed", "mark", "1", "Seen+", "@via_intuit == 1", "Seen", target="targeted", duration="endOfNextTurn")]},
    # T15 the Class Special Maneuvers (Initial Class): Pumped (Roar) / Infused (Draconic Infusion) until the end of your next
    # turn (the resource counts your turn ends: 2 when used in your turn, else 1); Doomed (Dark Beam) and Mighty (Mighty
    # Breeze) marks until the start of your next turn; Divine Blessing heals the Allies and harms the Opponents in a Sphere
    "Roar Maneuver": {
        "modifiers": [_m("combat", "1(T)", "@res.pumped >= 1", "Pumped"), _m("speed", "1(T)", "@res.pumped >= 1", "Pumped"),
                      _m("soak", "-1(T)", "@res.pumped >= 1", "Pumped")],
        "triggers": [_t("maneuverUsed", "resourceSet", "1 + @myTurn", "Pumped", "@via_roar == 1", "Pumped"),
                     _t("endOfTurn", "resource", "-1", "Pumped", "@res.pumped >= 1", "Pumped"),
                     _t("startOfEncounter", "resourceSet", "0", "Pumped", "", "Pumped")]},
    "Draconic Infusion Maneuver": {
        "modifiers": [_m("surgency", "1(T)", "@res.infused >= 1", "Infused"), _m("wound", "1(T)", "@res.infused >= 1", "Infused"),
                      _m("dr", "1(T)", "@res.infused >= 1", "Infused"), _m("defenseValue", "-1(T)", "@res.infused >= 1", "Infused"),
                      _m("speed", "-1(T)", "@res.infused >= 1", "Infused")],
        "triggers": [_t("maneuverUsed", "resourceSet", "1 + @myTurn", "Infused", "@via_draconicinfusion == 1", "Infused"),
                     _t("endOfTurn", "resource", "-1", "Infused", "@res.infused >= 1", "Infused"),
                     _t("startOfEncounter", "resourceSet", "0", "Infused", "", "Infused")]},
    "Dark Beam Maneuver": {
        "modifiers": [_m("foe.vs.damageTaken", "2(T)", "@to.mark.doomed >= 1", "Doomed")],
        "triggers": [{**_t("maneuverUsed", "mark", "1", "Doomed+", "@via_darkbeam == 1 && @vs.distance >= 2", "Dark Beam: Doomed",
                           target="targeted", duration="startOfNextTurn", mode="ask"), "check": "clash:cognitive vs impulsive|corporeal"}]},
    "Mighty Breeze Maneuver": {
        "modifiers": [{**_m("ally.soak", "1(T)", "@to.mark.mighty >= 1", "Mighty")}, {**_m("ally.dr", "1(T)", "@to.mark.mighty >= 1", "Mighty")}],
        "triggers": [{**_t("maneuverUsed", "mark", "1", "Mighty+", "@via_mightybreeze == 1", "Mighty", target="allies", duration="startOfNextTurn"), "range": "4"}]},
    "Divine Blessing Maneuver": {
        "modifiers": [],
        "triggers": [{**_t("maneuverUsed", "life", "@aptitudes.surgency", "", "@via_divineblessing == 1", "Divine Blessing: Allies", target="allies"), "range": "3"},
                     {**_t("maneuverUsed", "life", "-@aptitudes.surgency", "", "@via_divineblessing == 1", "Divine Blessing: Opponents",
                           target="opponents", mode="ask"), "range": "3", "check": "clash:cognitive vs impulsive|corporeal"}]},
}


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
    # Special Maneuvers written on race and Racial Factor pages (Konatsian Vocations, Glass Tribe), gained through Racial
    # Traits ("Gain access to the Goof and the Hocus Pocus Special Maneuvers")
    fold = folder("maneuvers", "Manobras raciais")
    known = {d["name"] for d in PACKS.get("maneuvers", []) if d.get("_type") == "Item"}
    racial_pages = [r[0] for r in RACES] + ["bestial-traits", "monstrous-traits"] + [
        r["slug"] for r in MENU if r["slug"] and not r["slug"].startswith("http") and r["slug"] not in HOMEBREW
        and "**Maximum Factor" in "\n".join(read(r["slug"]))]
    for slug in dict.fromkeys(racial_pages):
        for name, freq, f in entry_blocks(racial_lines(slug)):
            name = name.replace("“", "").replace("”", "").strip()
            if (("maneuver type" not in f) and ("base maneuver" not in f)) or name in known:
                continue
            known.add(name)
            system = {"maneuverType": f.get("maneuver type", "Modifier"), "actionCost": f.get("action cost", ""),
                      "kpCost": f.get("kp cost", ""), "frequency": freq, "minions": f.get("minions", ""),
                      "requirement": f.get("base maneuver", ""),
                      "summary": f"{f.get('maneuver type', '')} · {f.get('action cost', '')} · KP {f.get('kp cost', '')}"}
            add_item("maneuvers", name, "maneuver", system, slug, name, [], fold, key=f"race:{slug}:{name}")
    # D3: Special / Modifier / God Maneuvers written on Transformation pages ("Coral Rain Special Maneuver"), gained through
    # their Traits ("Gain access to the Coral Rain Special Maneuver")
    fold = folder("maneuvers", "Manobras de Transformações")
    skip = {"special-maneuvers", "actions-maneuvers", "god-ki", "adversaries"} | set(racial_pages)
    pages = [r["slug"] for r in MENU if r["slug"] and not r["slug"].startswith("http") and r["slug"] not in HOMEBREW]
    for slug in dict.fromkeys(pages + EXTRA_TRANSFORMATION_PAGES):
        if slug in skip or not read(slug):
            continue
        for name, freq, f in entry_blocks(read(slug)):
            name = name.replace("“", "").replace("”", "").strip()
            # (M: a block with no Maneuver Type whose Action Cost names the kind: "Action Cost: Instant Maneuver")
            if ("maneuver type" not in f) and re.match(r"^(Instant|Standard|Counter|Modifier) Maneuver$", f.get("action cost", "")):
                f = {**f, "maneuver type": f["action cost"], "action cost": ""}
            if ("maneuver type" not in f) or name in known:
                continue
            known.add(name)
            god = "dkp cost" in f
            system = {"maneuverType": f.get("maneuver type", ""), "actionCost": f.get("action cost", ""),
                      "kpCost": f.get("kp cost", ""), "frequency": freq, "minions": f.get("minions", ""),
                      "requirement": f.get("base maneuver", "") or ("God Ki" if god else ""),
                      **({"god": True, "dkpCost": f.get("dkp cost", "")} if god else {}),
                      "summary": f"{f.get('maneuver type', '')} · {f.get('action cost', '')} · "
                                 + (f"DKP {f.get('dkp cost', '')}" if god else f"KP {f.get('kp cost', '')}")}
            add_item("maneuvers", name, "maneuver", system, slug, name, [], fold, key=f"trans:{slug}:{name}")
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
    # Villainous Maneuvers (Adversaries page): every Adversary has them; Adversary Actions may pay their Action Cost
    lines = read("adversaries")
    fold = folder("maneuvers", "Villainous Maneuvers")
    for name, freq, f in entry_blocks(lines):
        if "maneuver type" not in f:
            continue
        name = name.replace("“", "").replace("”", "").strip()
        system = {"maneuverType": f.get("maneuver type", ""), "actionCost": f.get("action cost", ""),
                  "kpCost": f.get("kp cost", ""), "frequency": freq, "villainous": True, "requirement": "Adversary",
                  "summary": f"Villainous Maneuver · {f.get('maneuver type', '')} · {f.get('action cost', '')}"}
        add_item("maneuvers", name, "maneuver", system, "adversaries", name, [], fold, key=f"villain:{name}")


# Villainous Traits whose numbers the compiler misses: (target, value, condition), replacing what it found
def build_villainous_traits():
    """The example Villainous Traits of the Adversaries page, as Racial Traits of the 'villainous' tier."""
    lines = racial_lines("adversaries")
    fold = folder("racial-traits", "Villainous Traits")
    start = next((i for i, l in enumerate(lines) if l.strip() == "Villainous Traits"), None)
    end = next((i for i, l in enumerate(lines) if l.strip() == "Villainous Maneuvers"), len(lines))
    if start is None:
        return
    i = start + 1
    while i < end:
        m = re.match(r"^\*\*([^*]+?)\*\*:", lines[i].strip())
        if m:
            name = m.group(1).strip()
            effects, j = parse_effects(lines, i + 1)
            mods, trigs, structure = compile_racial("adversaries", name, effects, f"Villainous › {name}", "villainous", "", "Adversary")
            system = {"race": "Adversary", "category": "villainous", "tier": "villainous", "active": True,
                      "modifiers": mods, "triggers": trigs,
                      "summary": f"Villainous Trait · {len(effects)} efeito(s), {sum(1 for s in structure if s.endswith('auto'))} automatizado(s)"}
            add_item("racial-traits", name, "racialTrait", system, "adversaries", name, structure, fold, key=f"villain:{name}",
                     grants=list(LAST_GRANTS))
            i = max(j, i + 1)
            continue
        i += 1


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
build_talents()
build_unique_abilities()
build_maneuvers()
build_signatures()
# (IG: the equipment before the Racial Traits: a Trait's gear grant may copy an item of it)
build_items()
build_races()
build_transformations()
build_villainous_traits()

# Effects run by the system's code: each Transformation lists its own ("slug|Trait|n" → key)
for doc in PACKS.get("transformations", []):
    if doc["_type"] != "Item":
        continue
    slug = doc["flags"]["dbu-rpg"]["slug"]
    own = {t.split(" [")[0] for t in doc["system"].get("traits", [])}
    code = {k: v for k, v in CODE_EFFECTS.get(slug, {}).items() if k.split("|")[1] in own}
    if code:
        doc["flags"]["dbu-rpg"]["code"] = code
    locked = sorted(LOCKED_OFF.get(slug, set()) & own)
    if locked:
        doc["flags"]["dbu-rpg"]["lockedOff"] = locked

# Grants of Racial Traits and Transformations built after the item that grants them
for doc in PACKS.get("racial-traits", []) + PACKS.get("transformations", []):
    grants = doc.get("flags", {}).get("dbu-rpg", {}).get("grants")
    if not grants:
        continue
    for g in [g for g in grants if g.get("pending")]:
        # B5: a Transformation, or every Stage of a Transformation Line (in Stage order), with its Aspect patch
        if g["type"] in ("transformation", "transformationLine"):
            norm_line = lambda x: re.sub(r"[^a-z0-9]", "", str(x or "").lower())
            if g["type"] == "transformation":
                found = [d for d in [find_grant("transformation", g["name"])] if d]
            else:
                found = sorted([d for d in PACKS.get("transformations", []) if d.get("_type") == "Item"
                                and norm_line(d["system"].get("line")) == norm_line(g["name"])],
                               key=lambda d: d["system"].get("stage", 0))
            at = grants.index(g)
            grants.remove(g)
            if not found:
                UNRESOLVED_GRANTS.append(f"{g['pending']}: {g['type']} {g['name']} (the item lists it, without effect)")
                continue
            for k, d in enumerate(found):
                # (OG: the grant's +active / +mastery / +option / +res go with it)
                grants.insert(at + k, {"type": "transformation", "name": d["name"],
                                       "uuid": f"Compendium.dbu-rpg.transformations.Item.{d['_id']}",
                                       **({"aspects": g["aspects"]} if g.get("aspects") else {}),
                                       **{x: g[x] for x in ("active", "mastery", "option", "res", "resMin", "state", "free", "picked") if g.get(x)}})
            continue
        d = find_grant("racialTrait", g["name"])
        if d:
            g.update({"name": d["name"], "uuid": f"Compendium.dbu-rpg.racial-traits.Item.{d['_id']}"})
            del g["pending"]
        else:
            UNRESOLVED_GRANTS.append(f"{g['pending']}: racialTrait {g['name']} (the item lists it, without effect)")
            grants.remove(g)

os.makedirs(OUT, exist_ok=True)
for pack, docs in PACKS.items():
    with open(os.path.join(OUT, f"{pack}.json"), "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=1)
    print(f"{pack}: {sum(1 for d in docs if d['_type'] == 'Item')} items, {sum(1 for d in docs if d['_type'] == 'Folder')} folders")
print(STATS)
with open(os.path.join(OUT, "_remind.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(REMIND_LOG))
if UNRESOLVED_GRANTS:
    print(f"note: {len(UNRESOLVED_GRANTS)} grant(s) name no compendium item (the effect stays with the GM):")
    for g in UNRESOLVED_GRANTS[:40]:
        print("  " + g)
unused = sorted(set(AUTOMATION) - AUTOMATION_USED)
if unused:
    print(f"automation entries that matched no effect ({len(unused)}):", ", ".join(unused[:20]))
if DUMP is not None:
    with open(os.environ["DBU_DUMP_EFFECTS"], "w", encoding="utf-8") as f:
        json.dump(DUMP, f, ensure_ascii=False, indent=1)
    with open(os.environ["DBU_DUMP_EFFECTS"] + ".groups.json", "w", encoding="utf-8") as f:
        json.dump(DUMP_GROUPS, f, ensure_ascii=False, indent=1)
    print(f"dumped {len(DUMP)} effects ({sum(1 for d in DUMP if d['transType'] == 'racial')} of Racial Traits)")
