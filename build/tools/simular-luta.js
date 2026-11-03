/**
 * Simulador das lutas de teste (Goku × Freeza, Gohan × Cell, Goku × Kid Buu).
 *
 * ATENÇÃO: use só num mundo de teste. A luta apaga todos os combates e todos os tokens da cena ativa,
 * e zera o estado de encontro dos dois atores (condições, recursos, Power, limiares, timers).
 *
 * Como usar: entre como GM, crie uma Macro do tipo Script com este arquivo (ou cole no console, F12) e
 * rode uma vez. Depois, no console:
 *   await DBUF.fight({ hero: "Gohan (Cell Games)", heroForm: "Super Saiyan 2",
 *     villain: "Cell Perfeito", villainForm: null, maxRounds: 10, title: "Gohan SSJ2 × Cell" });
 *   DBUF.log.join("\n");   // relato da luta (o chat tem as rolagens completas)
 *   DBUF_RUNS;             // lutas anteriores (também salvas no localStorage "dbuFightRuns")
 *
 * - heroForm: transformação que o herói usa no primeiro turno (Transformation Maneuver de verdade:
 *   Stress Test, New Level of Power, Legend Realized).
 * - villainForm: transformação em que o vilão já começa; com villainManeuver: true, ele entra nela no
 *   primeiro turno, como o herói.
 * - heroStart / villainStart: transformações já ativas antes da luta (nomes ou { name, grade }).
 * - A IA é simples: Ki Surge/Healing Surge abaixo de 35%, Power Up uma vez, a técnica de maior dano
 *   que cabe no Ki (com as Energy Charges obrigatórias, guardando 25% do KP) e Ataque Básico físico
 *   com o resto das ações. Sempre desvia (Dodge). Battle Born vai para Wound > Strike > Dodge.
 */
const A = await import("/systems/dbu-rpg/module/combat/attack.mjs");
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  window.DBUF_RUNS ??= JSON.parse(localStorage.getItem("dbuFightRuns") ?? "[]");
} catch(err) {
  window.DBUF_RUNS ??= [];
}

window.DBUF = {
  log: [],
  status: "idle",
  result: null,
  abort: false,
  _timer: null,

  say(line) { this.log.push(line); },

  /** Answer the Battle Born allocation dialogs as they open. */
  watchDialogs() {
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      for ( const app of foundry.applications.instances.values() ) {
        if ( !app.rendered || !app.element?.querySelector(".dbu-allocate") ) continue;
        const pick = ["wound", "strike", "dodge"].map(k => app.element.querySelector(`button[data-action="${k}"]`)).find(b => b && !b.disabled);
        (pick ?? app.element.querySelector('button[data-action="discard"]:not([hidden])'))?.click();
      }
    }, 300);
  },

  lp(a) { return `${a.system.life.value}/${a.system.life.max}`; },

  defeated(a) { return !!a.system.health?.defeated || (a.system.life.value <= 0 && !(a.system._effectiveStates?.undying > 0)); },

  async reset(actor, keepForm) {
    await actor.resetEncounter({ instantRecovery: false });
    const off = actor.items.filter(i => i.type === "transformation" && i.system.transType !== "awakening" && i.name !== keepForm && i.system.active).map(i => ({ _id: i.id, "system.active": false }));
    if ( off.length ) await actor.updateEmbeddedDocuments("Item", off);
    const conds = Object.fromEntries(Object.keys(actor.system._source.conditions).map(k => [`system.conditions.${k}`, 0]));
    const states = Object.fromEntries(Object.keys(actor.system._source.states).map(k => [`system.states.${k}`, 0]));
    await actor.update({ ...conds, ...states, "system.pending": [], "system.combat.power": 0, "system.combat.energyCharges": 0, "system.resources": [],
      "system.thresholds.bruised": "", "system.thresholds.injured": "", "system.thresholds.critical": "", "system.combat.surgeUsed": false });
    for ( const s of actor.items.filter(i => i.type === "signature") ) if ( s.system.usedThisEncounter ) await s.update({ "system.usedThisEncounter": false });
    await actor.unsetFlag("dbu-rpg", "timed");
    for ( const st of Array.from(actor.statuses) ) await actor.toggleStatusEffect(st, { active: false }).catch(() => null);
    await actor.update({ "system.life.value": actor.system.life.max, "system.ki.value": actor.system.ki.max, "system.capacity.value": actor.system.capacity.max });
  },

  /** Put an actor in Transformations before the fight starts (names, or { name, grade }). */
  async activate(actor, list) {
    for ( const entry of list ) {
      const { name, grade } = (typeof entry === "string") ? { name: entry } : entry;
      const t = actor.items.getName(name);
      if ( t && !t.system.active ) await t.update({ "system.active": true, "system.viaManeuver": true, ...(grade ? { "system.grade": grade } : {}) });
    }
  },

  /** The strongest Signature Technique the actor can afford now (with its mandatory Energy Charges). */
  plan(actor) {
    const sys = actor.system;
    const reserve = Math.ceil(sys.ki.max * 0.25);
    const options = [];
    for ( const s of actor.items.filter(i => i.type === "signature") ) {
      const c = s.system.computed;
      if ( c.errors?.length ) continue;
      if ( c.ultimate && s.system.usedThisEncounter ) continue;
      if ( c.climax && (sys.health.count < c.climax) ) continue;
      if ( (s.system.level === "finisher") && (sys.health.count < 2) ) continue;
      const kp = Math.ceil((c.kpUnits + c.kpAdjust) * sys.top.kp) + sys.costs.attack;
      const need = Math.max(0, 2 * (c.mandatoryCharge ?? 0) - (sys.combat.energyCharges ?? 0));
      const total = kp + (need * 2 * sys.top.base);
      const budget = (c.ultimate || s.system.level === "finisher") ? Math.min(sys.ki.value, sys.capacity.value) : Math.min(sys.ki.value - reserve, sys.capacity.value);
      if ( total > budget ) continue;
      if ( need > (sys.combat.actions - 1) ) continue;
      options.push({ s, kp, need, power: c.woundT + (c.ultimate ? 6 : 0) + (s.system.level === "finisher" ? 10 : 0) + 4 - need });
    }
    options.sort((a, b) => b.power - a.power);
    return options[0] ?? null;
  },

  wagerFor(actor, cost) {
    const sys = actor.system;
    const spare = Math.min(sys.ki.value - cost - Math.ceil(sys.ki.max * 0.35), sys.capacity.value - cost);
    return Math.max(0, Math.min(Math.floor(sys.capacity.max / 6), spare));
  },

  async attack(actor, target, opts, label) {
    const before = target.actor.system.life.value;
    const msg = await A.executeAttack(actor, { spendAction: true, targets: [target], ...opts });
    if ( !msg ) { this.say(`   ✗ ${label}: bloqueado pelas regras`); return false; }
    await wait(400);
    await A.rollDefense(game.messages.get(msg.id), 0, "dodge");
    await wait(500);
    let atk = game.messages.get(msg.id).getFlag("dbu-rpg", "attack");
    const t = atk.targets[0];
    let line = `   ${label}: Acerto ${atk.strike.total}${atk.strike.crit ? " (CRÍTICO)" : ""} vs Desvio ${t.defense?.total ?? "—"}`;
    if ( t.result === "hit" ) {
      await A.rollWound(game.messages.get(msg.id));
      await wait(500);
      await A.applyAttackDamage(game.messages.get(msg.id), 0);
      await wait(900);
      atk = game.messages.get(msg.id).getFlag("dbu-rpg", "attack");
      line += ` → ACERTOU · Wound ${atk.wound?.total} → ${atk.targets[0].damage} de dano (${target.actor.name}: ${before} → ${target.actor.system.life.value} LP)`;
    }
    else line += " → errou";
    this.say(line);
    return true;
  },

  async turn(actor, enemyToken, form) {
    const sys = () => actor.system;
    const inForm = actor.items.filter(i => i.type === "transformation" && i.system.active && i.system.transType !== "awakening").map(i => i.name).join(" + ") || "base";
    this.say(` • ${actor.name} [${inForm} · ToP ${sys().top.current}] (LP ${this.lp(actor)}, KP ${sys().ki.value}/${sys().ki.max}, Ações ${sys().combat.actions})`);
    if ( sys().pending?.includes("stressTest") ) {
      const r = await actor.resolveAlert("stressTest");
      this.say(`   Stress Test obrigatório: ${r?.success ? "passou" : "falhou → sai da transformação (Stress Exhaustion)"}`);
    }
    const formItem = form ? actor.items.getName(form) : null;
    if ( formItem && !formItem.system.active && !sys().effectiveConditions.stressExhaustion && (sys().combat.actions > 0) && (sys().ki.value > 0) ) {
      const lpB = sys().life.value;
      const r = await actor.transform(formItem);
      await actor.update({ "system.combat.actions": Math.max(0, sys().combat.actions - 1) });
      await wait(600);
      let extra = "";
      if ( formItem.system.active ) {
        if ( formItem.system.newLevel ) extra += " · NEW LEVEL OF POWER (+1 ToP, Stress Test automático, Legend Realized dobrado)";
        const dl = sys().life.value - lpB;
        if ( dl > 0 ) extra += ` · Legend Realized +${dl} LP e KP`;
      }
      this.say(`   Transformation Maneuver → ${form}: ${formItem.system.active ? "TRANSFORMOU" : "falhou"}${r?.total !== undefined ? ` (Stress Test ${r.total} vs ${r.requirement})` : " (sem Stress Test)"}${extra}`);
    }
    if ( this.defeated(enemyToken.actor) ) return;
    if ( !sys().combat.surgeUsed && (sys().life.value < sys().life.max * 0.35) ) {
      const b = sys().life.value; await actor.surge("healing"); await wait(400);
      this.say(`   Healing Surge: ${b} → ${sys().life.value} LP`);
    }
    else if ( !sys().combat.surgeUsed && (sys().ki.value < sys().ki.max * 0.35) ) {
      const b = sys().ki.value; await actor.surge("ki"); await wait(400);
      this.say(`   Ki Surge: ${b} → ${sys().ki.value} KP`);
    }
    if ( ((sys().combat.power ?? 0) < 1) && (sys().combat.actions >= 3) ) {
      await actor.powerUp(); await wait(300);
      this.say(`   Power Up (Power ${sys().combat.power})`);
    }
    let guard = 0;
    while ( (sys().combat.actions > 0) && !this.defeated(enemyToken.actor) && !this.defeated(actor) && (guard++ < 8) ) {
      const p = this.plan(actor);
      if ( p && p.need > 0 ) {
        await actor.energyCharge(); await wait(300);
        this.say(`   Energy Charge (${sys().combat.energyCharges}) para ${p.s.name}`);
        continue;
      }
      if ( p ) {
        const wager = this.wagerFor(actor, p.kp);
        if ( await this.attack(actor, enemyToken, { signatureId: p.s.id, wager }, `${p.s.name}${wager ? ` (Wager ${wager})` : ""}`) ) continue;
      }
      const wager = this.wagerFor(actor, 2 * sys().top.kp);
      if ( !(await this.attack(actor, enemyToken, { profile: "simple", foundation: "physical", wager }, `Ataque Básico${wager ? ` (Wager ${wager})` : ""}`)) ) break;
    }
  },

  async fight({ hero, heroForm, heroStart = [], villain, villainForm, villainStart = [], villainManeuver = false, maxRounds = 10, title }) {
    this.log = []; this.status = "running"; this.result = null; this.abort = false;
    try {
      this.watchDialogs();
      for ( const c of game.combats.contents ) await c.delete();
      await wait(800);
      const h = game.actors.getName(hero), v = game.actors.getName(villain);
      const scene = game.scenes.active ?? game.scenes.contents[0];
      await scene.deleteEmbeddedDocuments("Token", scene.tokens.map(t => t.id));
      await this.reset(h, null); await this.reset(v, villainManeuver ? null : villainForm);
      await this.activate(h, heroStart);
      await this.activate(v, [...villainStart, ...((villainForm && !villainManeuver) ? [villainForm] : [])]);
      for ( const a of [h, v] ) await a.update({ "system.life.value": a.system.life.max, "system.ki.value": a.system.ki.max, "system.capacity.value": a.system.capacity.max });
      const [th] = await scene.createEmbeddedDocuments("Token", [(await h.getTokenDocument({ x: 800, y: 700 })).toObject()]);
      const [tv] = await scene.createEmbeddedDocuments("Token", [(await v.getTokenDocument({ x: 1100, y: 700 })).toObject()]);
      await wait(800);
      const tokH = canvas.tokens.get(th.id), tokV = canvas.tokens.get(tv.id);
      const combat = await Combat.create({ scene: scene.id, active: true });
      await combat.createEmbeddedDocuments("Combatant", [{ tokenId: th.id, sceneId: scene.id, actorId: h.id }, { tokenId: tv.id, sceneId: scene.id, actorId: v.id }]);
      await combat.rollAll();
      await wait(800);
      this.say(`=== ${title} ===`);
      this.say(`Iniciativa: ${combat.combatants.contents.map(c => `${c.name} ${c.initiative}`).join(" · ")}`);
      await combat.startCombat();
      await wait(1500);
      let lastRound = 0;
      for ( let step = 0; step < maxRounds * 2 + 2; step++ ) {
        if ( this.abort || !game.combats.get(combat.id) || (combat.round > maxRounds) ) break;
        if ( combat.round !== lastRound ) { lastRound = combat.round; this.say(`— Rodada ${combat.round} —`); }
        const c = combat.combatant;
        const me = c.actor;
        const form = (me.id === h.id) ? heroForm : (villainManeuver ? villainForm : null);
        await this.turn(me, (c.tokenId === th.id) ? tokV : tokH, form);
        await wait(500);
        if ( this.defeated(h) || this.defeated(v) ) break;
        await combat.nextTurn();
        await wait(1500);
        if ( this.defeated(h) || this.defeated(v) ) break;
      }
      const winner = this.defeated(v) ? h.name : (this.defeated(h) ? v.name : null);
      this.result = { winner, rounds: combat.round, hero: `${h.name} ${this.lp(h)} LP`, villain: `${v.name} ${this.lp(v)} LP` };
      this.say(winner ? `VENCEDOR: ${winner} (rodada ${combat.round})` : `Sem vencedor após ${maxRounds} rodadas — ${this.result.hero} · ${this.result.villain}`);
      this.status = "done";
      window.DBUF_RUNS.push({ title, log: [...this.log], result: this.result });
      localStorage.setItem("dbuFightRuns", JSON.stringify(window.DBUF_RUNS));
    } catch(err) {
      console.error(err);
      this.status = `error: ${err.message}`;
    }
  }
};
