// Merges validated automation entries (validate.mjs --out) into a file of build/automation, and adds a chat reminder, at
// the moment the text names, to the Triggered effects that stay "code" (the GM still applies them, but is told when).
//
// usage: node merge.mjs <merged.json> <build/automation/target.json> --dump <effects.json> [--no-reminders]
import fs from "node:fs";

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); if ( i < 0 ) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = name => { const i = args.indexOf(name); if ( i < 0 ) return false; args.splice(i, 1); return true; };
const DUMP = opt("--dump"), NO_REMINDERS = flag("--no-reminders");
const [MERGED, TARGET] = args;
if ( !MERGED || !TARGET || !DUMP ) {
  console.error("usage: node merge.mjs <merged.json> <target.json> --dump <effects.json> [--no-reminders]");
  process.exit(1);
}
const merged = JSON.parse(fs.readFileSync(MERGED, "utf8"));
const dump = new Map(JSON.parse(fs.readFileSync(DUMP, "utf8")).map(d => [d.key, d]));

// "If/When you ..." → the event of that moment (only what YOU do or what happens to YOU)
const W = "(?:^|[.;:]\\s*|\\s)(?:If|When|Whenever|After|Each time|Once)\\s+";
const R = body => new RegExp(W + body, "i");
const RULES = [
  ["grandAwakening", /Full Awakening Maneuver|Grand Awakening (is|was|becomes) activ|activat\w* (this|the|your) Grand Awakening/i],
  ["powerUp", R("you (use|perform) (the |a )?Power Up")],
  ["surge", R("you (use|perform) (a |an |the |your )?(Healing |Ki )?Surge")],
  ["energyCharge", R("you (use|perform) the Energy Charge Maneuver")],
  ["targeted", R(String.raw`you are (the )?target(ed)?\b`)],
  ["dodged", R("(an Attacking Maneuver|an attack|it) misses you")],
  ["attackMissed", R("(your|an Attacking Maneuver you use)[^.]{0,40}miss")],
  ["damaged", R("you (take|suffer|receive) (any )?Damage")],
  ["attackHit", R("you (hit|damage|deal Damage to|deal Damage with)")],
  ["attackMade", R("you (use|make|perform) (an?|the|your) (Attacking Maneuver|Signature Technique|Basic Attack|Ultimate|Signature)")],
  ["attackMade", R("you target (an?|the|your) (Opponent|Character|Target)[^.]{0,40} with (an? |the |your )?(Attacking Maneuver|Signature|Basic Attack|Ultimate|Physical|Energy|Magic)")],
  ["threshold", R("you (are knocked|cross|fall|drop|go|would be knocked)[^.]{0,30}Health Threshold")],
  ["threshold", R("you (are|become|would become|would be) Defeated")],
  ["revert", R("you (leave|exit|revert from) this Transformation")],
  ["transform", R("you (enter|use the Transformation Maneuver)[^.]{0,30}(Transformation|Form|Enhancement|Transformation Maneuver)")],
  ["stateEnter", R(String.raw`you enter (the|a) [\w\s-]{1,25} State`)]
];
const TIMED = /Start of (Turn|Combat Round|Combat Encounter)|End of (Turn|Combat Round)/i;
let reminders = 0;
if ( !NO_REMINDERS ) {
  for ( const [key, e] of Object.entries(merged) ) {
    const d = dump.get(key);
    if ( (e.verdict !== "code") || !d ) continue;
    // [Triggered/Transform]: entering this Transformation
    const racial = d.transType === "racial";
    let event = /\bTransform\b/.test(d.keywords) && /Triggered|Automatic/.test(d.keywords) ? "transform" : null;
    // A Racial Trait's "[Triggered/Transform]" is any Transformation the character enters
    let condition = (event && !racial) ? "@this == 1" : "";
    if ( !event ) {
      if ( !/Triggered|Grand Trigger|Automatic/i.test(d.keywords) || TIMED.test(d.keywords) ) continue;
      event = RULES.find(([, re]) => re.test(d.text))?.[0];
      if ( !event ) continue;
      if ( ["transform", "revert"].includes(event) && /this Transformation/i.test(d.text) && !racial ) condition = "@this == 1";
      if ( racial && (event === "grandAwakening") ) continue;
    }
    if ( (e.triggers ?? []).some(t => t.event === event) ) continue;
    const limit = (/(\d+)\s*\/\s*(Round|Encounter|Turn)/i.exec(d.keywords) ?? [])[0] ?? "";
    e.triggers = [...(e.triggers ?? []), { event, effect: "message", value: "", mode: "remind", label: `${d.trait} (${d.n})`,
      condition, limit: limit.replace(/\s+/g, "") }];
    reminders++;
  }
}

const target = fs.existsSync(TARGET) ? JSON.parse(fs.readFileSync(TARGET, "utf8")) : {};
let added = 0, replaced = 0;
for ( const [key, e] of Object.entries(merged) ) {
  if ( key in target ) replaced++; else added++;
  target[key] = e;
}
const sorted = Object.fromEntries(Object.entries(target).sort((a, b) => a[0].localeCompare(b[0])));
fs.writeFileSync(TARGET, JSON.stringify(sorted, null, 1) + "\n");
console.log(`${TARGET}: ${added} added, ${replaced} replaced, ${reminders} reminders, ${Object.keys(sorted).length} entries`);
