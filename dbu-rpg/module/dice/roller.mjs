import { diceToFormula } from "../rules/dice.mjs";

/**
 * Core DBU roll: Base Die (1d10) + Extra Dice + flat bonuses, with Critical/Botch handling.
 *
 * @param {object} config
 * @param {Actor} config.actor
 * @param {string} config.title             Card title
 * @param {string} [config.subtitle]
 * @param {string} [config.kind]            strike | dodge | wound | save | skill | clash | steadfast | stress | initiative | other
 * @param {string} [config.baseDie="1d10"]  Use "2d10kh"/"2d10kl" for advantage/disadvantage effects
 * @param {number} [config.naturalMod=0]    Changes to the Natural Result (clamped to 1–10)
 * @param {number} [config.minNatural]      Minimum Natural Result (Clearing Profile)
 * @param {number} [config.critTarget=10]
 * @param {number} [config.botchRange=1]
 * @param {Array}  [config.diceGroups]      [{dice:[{number,faces}], label}]
 * @param {Array}  [config.parts]           [{label, value}] flat bonuses
 * @param {Array}  [config.critDice]        [{number, faces}] dice added on a Critical Result
 * @param {number} [config.botchPenalty=0]  Dice Score reduction on a Botch Result
 * @param {boolean} [config.cutting=false]  Cutting Profile: no Critical = Botch
 * @param {string} [config.twin]            "high"|"low": roll everything twice (Twin-Linked / Dead-Link)
 * @param {number} [config.target]          Target Number to beat (shown on the card)
 * @param {boolean} [config.noCrit=false]
 * @param {object} [config.flags]           Extra message flags (flags.dbu)
 * @param {Array}  [config.buttons]         [{action, label, icon, data}] buttons on the card
 * @param {Array}  [config.notes]           Extra lines of text
 * @param {boolean} [config.toMessage=true]
 * @returns {Promise<object>} result {total, natural, crit, botch, rolls, message}
 */
export async function dbuRoll(config) {
  const once = await rollOnce(config);
  let result = once;
  if ( config.twin ) {
    const second = await rollOnce(config);
    const pick = config.twin === "high" ? (second.total > once.total) : (second.total < once.total);
    result = pick ? second : once;
    result.rolls = [...once.rolls, ...second.rolls];
    result.twin = { mode: config.twin, totals: [once.total, second.total] };
  }
  if ( config.toMessage === false ) return result;
  result.message = await postRollCard(config, result);
  return result;
}

async function rollOnce(config) {
  const {
    baseDie = "1d10", naturalMod = 0, minNatural, critTarget = 10, botchRange = 1, diceGroups = [], parts = [],
    critDice = [], botchPenalty = 0, cutting = false, noCrit = false, noBotch = false
  } = config;
  const rolls = [];

  const base = await new Roll(baseDie).evaluate();
  rolls.push(base);
  const rawNatural = base.total;
  let natural = Math.clamp(rawNatural + naturalMod, 1, 10);
  if ( minNatural ) natural = Math.max(natural, minNatural);

  let crit = !noCrit && (natural >= critTarget);
  let botch = !noBotch && !crit && (natural <= botchRange);
  if ( cutting && !crit ) botch = true;

  // Extra Dice (ToP, Greater, Energy Charges ...)
  const extra = [];
  for ( const g of diceGroups ) {
    const formula = diceToFormula(g.dice);
    if ( !formula ) continue;
    const r = await new Roll(formula).evaluate();
    rolls.push(r);
    extra.push({ label: g.label, formula, total: r.total, roll: r });
  }

  let critRoll = null;
  if ( crit && critDice.length ) {
    critRoll = await new Roll(diceToFormula(critDice)).evaluate();
    rolls.push(critRoll);
  }

  const flat = parts.reduce((t, p) => t + (Number(p.value) || 0), 0);
  const extraTotal = extra.reduce((t, e) => t + e.total, 0);
  let total = natural + extraTotal + flat + (critRoll?.total ?? 0) - (botch ? botchPenalty : 0);
  total = Math.max(0, total);
  return { total, natural, rawNatural, naturalMod, crit, botch, extra, critRoll, flat, parts, rolls };
}

/** Render and post the roll card. */
async function postRollCard(config, result) {
  const actor = config.actor;
  const shownParts = (config.parts ?? []).filter(p => Number(p.value));
  const context = {
    title: config.title,
    subtitle: config.subtitle ?? "",
    kind: config.kind ?? "other",
    img: config.img ?? actor?.img,
    total: result.total,
    natural: result.natural,
    rawNatural: result.rawNatural,
    naturalChanged: result.natural !== result.rawNatural,
    crit: result.crit,
    botch: result.botch,
    critTarget: config.critTarget ?? 10,
    botchRange: config.botchRange ?? 1,
    critTotal: result.critRoll?.total ?? 0,
    critFormula: result.critRoll?.formula ?? "",
    botchPenalty: result.botch ? (config.botchPenalty ?? 0) : 0,
    extra: result.extra.map(e => ({ label: e.label, formula: e.formula, total: e.total })),
    parts: shownParts.map(p => ({ label: p.label, value: p.value >= 0 ? `+${p.value}` : `${p.value}` })),
    target: config.target,
    success: (config.target !== undefined) ? result.total >= config.target : null,
    twin: result.twin,
    notes: config.notes ?? [],
    buttons: config.buttons ?? [],
    extraHTML: config.extraHTML ?? ""
  };
  const content = await foundry.applications.handlebars.renderTemplate("systems/dbu-rpg/templates/chat/roll-card.hbs", context);
  const messageData = {
    author: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor, token: config.token }),
    content,
    rolls: result.rolls,
    sound: CONFIG.sounds.dice,
    flags: { "dbu-rpg": { kind: config.kind, total: result.total, natural: result.natural, crit: result.crit,
      botch: result.botch, ...(config.flags ?? {}) } }
  };
  const mode = config.messageMode ?? game.settings.get("core", "messageMode");
  ChatMessage.applyMode(messageData, mode);
  return ChatMessage.create(messageData);
}

/** Post a plain informational card (no dice). */
export async function postInfoCard({ actor, title, subtitle = "", lines = [], buttons = [], flags = {}, img, whisper, extraHTML = "" } = {}) {
  const content = await foundry.applications.handlebars.renderTemplate("systems/dbu-rpg/templates/chat/info-card.hbs",
    { title, subtitle, lines, buttons, img: img ?? actor?.img, extraHTML });
  const data = {
    author: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { "dbu-rpg": flags }
  };
  if ( whisper ) data.whisper = whisper;
  return ChatMessage.create(data);
}
