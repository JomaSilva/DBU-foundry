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
 * @param {object} [config.scope]           Formula variables of the roll for its reactions (an attack's: @armed, @via_*...;
 *                                          thresholdCheck: 1 for the Steadfast Check of a Health Threshold)
 * @param {Actor} [config.other]            The other Character of the roll (the "rolled" event's other)
 * @param {boolean} [config.reactions=true] false: no roll reactions (combat/reactions.mjs)
 * @returns {Promise<object>} result {total, natural, crit, botch, rolls, message}; after a "succeed" reaction also
 *   forceSuccess: true (a check with a Target Number counts as a success), after any reaction reactionNotes / reactionParts
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
    stateOf(result).twinIndex = pick ? 1 : 0;
  }
  // KR "foeGuard.critToBotch" (an Opponent's piece: Karmic Reflection): this Combat Roll's Critical Result is a Botch
  if ( result.crit && ["strike", "dodge", "wound"].includes(config.kind) && config.actor && globalThis.game?.combats?.some?.(c => c.started) ) {
    try { const { opponentCritToBotch } = await import("../combat/reactions.mjs"); await opponentCritToBotch(config, result); }
    catch(err) { console.error("DBU | Critical to Botch", err); }
  }
  // Roll reactions: the "roll" triggers of the rolling actor (after the dice, before the result is used or posted) and
  // its "rolled" event. Only on the client that owns the actor, and nothing at all without such triggers
  if ( (config.reactions !== false) && config.actor?.isOwner && hasRollTriggers(config.actor) ) {
    // (a broken reaction never breaks the roll: the result stands as it is)
    try {
      const { rollReactions } = await import("../combat/reactions.mjs");
      await rollReactions(config, result);
    } catch(err) { console.error("DBU | Roll reactions", err); }
  }
  // F13 the others' reactions to this roll ("allyRoll" / "opponentRoll"), before the result is used
  if ( (config.reactions !== false) && config.actor?.isOwner && game.combats?.some?.(c => c.started) ) {
    try {
      const { foreignRollReactions } = await import("../combat/reactions.mjs");
      await foreignRollReactions(config, result);
    } catch(err) { console.error("DBU | Foreign roll reactions", err); }
  }
  // L: the others of the encounter that react to this Character's rolls ("opponentRolled" / "allyRolled")
  if ( (config.reactions !== false) && config.actor?.isOwner && game.combats?.some?.(c => c.started) ) {
    try {
      const { fireRollWatchers } = await import("../combat/reactions.mjs");
      fireRollWatchers(config, result);
    } catch(err) { console.error("DBU | Roll watchers", err); }
  }
  // RA "nextRoll": the bonuses that lasted until this Character's next roll of that kind end now
  if ( config.actor?.isOwner && config.kind ) {
    try { const { expireNextRoll } = await import("../combat/triggers.mjs"); await expireNextRoll(config.actor, config.kind); }
    catch(err) { console.error("DBU | nextRoll", err); }
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

  // Barrier Blow: the Base Die rolled an additional time (no Botch from it; a Critical on it counts, and a Critical
  // on both Base Dice applies the Critical dice twice)
  let natural2 = null;
  if ( config.extraBaseDie ) {
    const r2 = await new Roll("1d10").evaluate();
    rolls.push(r2);
    natural2 = Math.clamp(r2.total + naturalMod, 1, 10);
  }
  const crit2 = !noCrit && (natural2 !== null) && (natural2 >= critTarget);
  const critMain = !noCrit && (natural >= critTarget);
  let crit = critMain || crit2;
  let botch = !noBotch && !crit && (natural <= botchRange);
  if ( cutting && !crit ) botch = true;

  // Extra Dice (ToP, Greater, Energy Charges ...)
  const extra = [];
  if ( natural2 !== null ) extra.push({ label: config.extraBaseDieLabel ?? "Base Die", formula: "1d10", total: natural2, roll: rolls.at(-1) });
  for ( const g of diceGroups ) {
    const formula = diceToFormula(g.dice);
    if ( !formula ) continue;
    const r = await new Roll(formula).evaluate();
    rolls.push(r);
    extra.push({ label: g.label, formula, total: r.total, roll: r });
  }

  let critRoll = null;
  let critFormula = "";
  if ( crit && critDice.length ) {
    // A Critical on both Base Dice (Barrier Blow): the Critical dice twice
    critFormula = diceToFormula((critMain && crit2) ? critDice.map(d => ({ ...d, number: d.number * 2 })) : critDice);
    critRoll = await new Roll(critFormula).evaluate();
    rolls.push(critRoll);
  }

  const flat = parts.reduce((t, p) => t + (Number(p.value) || 0), 0);
  const extraTotal = extra.reduce((t, e) => t + e.total, 0);
  let total = natural + extraTotal + flat + (critRoll?.total ?? 0) - (botch ? botchPenalty : 0);
  total = Math.max(0, total);
  const result = { total, natural, rawNatural, naturalMod, crit, botch, extra, critRoll, flat, parts, rolls };
  STATE.set(result, { natural2, critFormula, naturalDelta: 0, forcedCrit: false, twinIndex: 0 });
  return result;
}

/* -------------------------------------------- */
/*  Roll reactions: changing a rolled result    */
/* -------------------------------------------- */

/** What a result needs for the reactions (a WeakMap: the result keeps its shape). */
const STATE = new WeakMap();
const stateOf = result => {
  let st = STATE.get(result);
  if ( !st ) STATE.set(result, st = { natural2: null, critFormula: result.critRoll?.formula ?? "", naturalDelta: 0, forcedCrit: false, twinIndex: 0 });
  return st;
};

/** Does the actor have triggers on the "roll" / "rolled" events (active or not)? The fast path of every roll. */
export function hasRollTriggers(actor) {
  const has = list => Array.isArray(list) && list.some(t => (t?.event === "roll") || (t?.event === "rolled"));
  try {
    for ( const item of actor?.items ?? [] ) if ( has(item?.system?.triggers) ) return true;
    return has(actor?.system?.customTriggers);
  } catch(err) { return false; }
}

/** The Natural Result a raw Base Die gives with the roll's own changes (naturalMod, minNatural). */
function baseNatural(config, raw) {
  let natural = Math.clamp(raw + (config.naturalMod ?? 0), 1, 10);
  if ( config.minNatural ) natural = Math.max(natural, config.minNatural);
  return natural;
}

/**
 * Work out a result again after a reaction changed it: Critical / Botch from its Natural Result (a forced Critical
 * stays one), the Critical dice rolled when it became a Critical (dropped when it is none any more) and the total.
 */
export async function settleRoll(config, result) {
  const st = stateOf(result);
  const { critTarget = 10, botchRange = 1, critDice = [], botchPenalty = 0, cutting = false, noCrit = false, noBotch = false } = config;
  const crit2 = !noCrit && (st.natural2 !== null) && (st.natural2 >= critTarget);
  const critMain = !noCrit && ((result.natural >= critTarget) || st.forcedCrit);
  result.crit = critMain || crit2;
  result.botch = !result.crit && (!!config.forceBotch || (!noBotch && (result.natural <= botchRange)));
  if ( cutting && !result.crit ) result.botch = true;
  const want = (result.crit && critDice.length)
    ? diceToFormula((critMain && crit2) ? critDice.map(d => ({ ...d, number: d.number * 2 })) : critDice) : "";
  if ( !want ) {
    result.critRoll = null;
    st.critFormula = "";
  }
  else if ( !result.critRoll || (st.critFormula !== want) ) {
    result.critRoll = await new Roll(want).evaluate();
    result.rolls.push(result.critRoll);
    st.critFormula = want;
  }
  const flat = (result.parts ?? []).reduce((t, p) => t + (Number(p.value) || 0), 0)
    + (result.reactionParts ?? []).reduce((t, p) => t + (Number(p.value) || 0), 0);
  result.flat = flat;
  const extraTotal = (result.extra ?? []).reduce((t, e) => t + (Number(e.total) || 0), 0);
  result.total = Math.max(0, result.natural + extraTotal + flat + (result.critRoll?.total ?? 0) - (result.botch ? botchPenalty : 0));
  if ( result.twin ) result.twin.totals[st.twinIndex] = result.total;
  return result;
}

/** ± the Natural Result (clamped 1–10); Critical / Botch worked out again. */
export async function shiftNatural(config, result, delta) {
  const st = stateOf(result);
  const before = result.natural;
  result.natural = Math.clamp(result.natural + delta, 1, 10);
  st.naturalDelta += result.natural - before;
  return settleRoll(config, result);
}

/** Set the Natural Result (1–10). */
export async function setNatural(config, result, value) {
  const st = stateOf(result);
  result.natural = Math.clamp(Math.floor(Number(value) || 1), 1, 10);
  st.naturalDelta = result.natural - baseNatural(config, result.rawNatural);
  return settleRoll(config, result);
}

/** A Critical Result whatever the Natural Result (not a Botch). */
export async function forceCritical(config, result) {
  stateOf(result).forcedCrit = true;
  return settleRoll(config, result);
}

/** Roll the Base Die again: the new result stands (with the Natural Result changes already bought); T25 keepHigher:
 * the higher of the two results stands ("roll twice and apply the higher"). */
export async function rerollBase(config, result, { keepHigher = false } = {}) {
  const st = stateOf(result);
  // (the earlier result as it was, its Critical dice too: put back whole, not settled again)
  const prev = { rawNatural: result.rawNatural, natural: result.natural, crit: result.crit, botch: result.botch,
    critRoll: result.critRoll, flat: result.flat, total: result.total, critFormula: st.critFormula };
  const base = await new Roll(config.baseDie ?? "1d10").evaluate();
  result.rolls.push(base);
  result.rawNatural = base.total;
  result.natural = Math.clamp(baseNatural(config, base.total) + st.naturalDelta, 1, 10);
  await settleRoll(config, result);
  if ( keepHigher && (result.total < prev.total) ) {
    const { critFormula, ...back } = prev;
    Object.assign(result, back);
    st.critFormula = critFormula;
    if ( result.twin ) result.twin.totals[st.twinIndex] = result.total;
  }
  return result;
}

/** Roll everything again (the kept roll of a Twin-Linked one): the new dice stand, the bonuses bought stay. */
export async function rerollAll(config, result) {
  const st = stateOf(result);
  const fresh = await rollOnce(config);
  const fst = STATE.get(fresh);
  result.rolls.push(...fresh.rolls);
  result.rawNatural = fresh.rawNatural;
  result.natural = Math.clamp(fresh.natural + st.naturalDelta, 1, 10);
  result.extra = [...fresh.extra, ...(result.extra ?? []).filter(e => e.reaction)];
  result.critRoll = fresh.critRoll;
  st.critFormula = fst?.critFormula ?? "";
  st.natural2 = fst?.natural2 ?? null;
  return settleRoll(config, result);
}

/** + to the Dice Score: a number, or dice rolled now ("1d6"). */
export async function addRollBonus(config, result, label, value, formula = "") {
  if ( formula ) {
    const r = await new Roll(formula).evaluate();
    result.rolls.push(r);
    (result.extra ??= []).push({ label, formula, total: r.total, roll: r, reaction: true });
  }
  else (result.reactionParts ??= []).push({ label, value: Number(value) || 0 });
  return settleRoll(config, result);
}

/** Render and post the roll card. */
async function postRollCard(config, result) {
  const actor = config.actor;
  const shownParts = [...(config.parts ?? []), ...(result.reactionParts ?? [])].filter(p => Number(p.value));
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
    success: (config.target !== undefined) ? (!!result.forceSuccess || (result.total >= config.target)) : null,
    twin: result.twin,
    notes: result.reactionNotes?.length ? [...(config.notes ?? []), ...result.reactionNotes] : (config.notes ?? []),
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
