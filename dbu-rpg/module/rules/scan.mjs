/**
 * Scan (dbu-rpg.com/basic-items-accessories). Pure data and checks, so they can be verified outside Foundry.
 *  - Scouter [Tech]: an equipped Accessory, or Integrated (Onboard Computer: Master; 3D Scan Mode: Grandmaster);
 *    1 Action in a Combat Encounter, and the scanned Character may try a Concealment Skill Check of its Craft DC;
 *  - Scout Scope: a held Basic Item; 3 Actions, and only a Character Holding Back or aware of the scan may try a
 *    Qualified Concealment Skill Check;
 *  - succeeding, nothing happens, and that Character keeps succeeding against that kind of device for the rest of the
 *    Combat Encounter (against the Scout Scope, until their Holding Back stacks go below the number they had);
 *  - otherwise the scanner learns the current Tier of Power, and the Power Level when it is the base Tier of Power.
 *    The system also gives the Battle Power (the scouter reading of the sheet, not a rule of the game);
 *  - a Scouter of Craft DC Expert or lower is destroyed when a Character of Tier of Power 2+ (Qualified) or 3+
 *    (Expert) uses the Power Up Maneuver within 15 Squares of it, or within several hundred miles while Adventuring.
 */

/** Actions a Scan costs in a Combat Encounter. */
export const SCAN_ACTIONS = { scouter: 1, scope: 3 };

const DIFFICULTIES = ["grandmaster", "master", "expert", "qualified", "apprentice", "novice"];

const norm = s => String(s ?? "").trim().toLowerCase();

/** The difficulty of a Craft DC text ("Expert" → "expert"); null when it is variable or unknown. */
export function craftDifficulty(text) {
  const s = norm(text);
  if ( !s || /variable|vari[aá]vel|~/.test(s) ) return null;
  return DIFFICULTIES.find(k => new RegExp(`\\b${k}\\b`).test(s)) ?? null;
}

/**
 * The devices a character can Scan with.
 * @returns {Array<{kind: "scouter"|"scope", name: string, dc: string|null, actions: number, itemId: string,
 *   integrated?: boolean}>}  dc: the difficulty of the Concealment Skill Check (null: the Scouter's is variable)
 */
export function scanDevices(actor) {
  const out = [];
  for ( const i of actor?.items ?? [] ) {
    const s = i.system ?? {};
    const name = norm(i.name);
    const section = norm(s.source?.section);
    const is = n => (name === n) || (section === n);
    if ( i.type === "item" ) {
      if ( (s.quantity ?? 1) <= 0 ) continue;
      if ( is("scouter [tech]") || /\bscouter\b/.test(name) ) {
        // "While you have this Accessory equipped"
        if ( (s.itemType === "accessory") && !s.equipped ) continue;
        out.push({ kind: "scouter", name: i.name, dc: craftDifficulty(s.craftDC), actions: SCAN_ACTIONS.scouter, itemId: i.id });
      }
      else if ( is("scout scope") ) {
        out.push({ kind: "scope", name: i.name, dc: "qualified", actions: SCAN_ACTIONS.scope, itemId: i.id });
      }
    }
    // Integrated Scouters
    else if ( (i.type === "racialTrait") && is("onboard computer") && (s.active !== false) ) {
      out.push({ kind: "scouter", name: i.name, dc: "master", actions: SCAN_ACTIONS.scouter, itemId: i.id, integrated: true });
    }
    else if ( (i.type === "talent") && is("3d scan mode") ) {
      out.push({ kind: "scouter", name: i.name, dc: "grandmaster", actions: SCAN_ACTIONS.scouter, itemId: i.id, integrated: true });
    }
  }
  return out;
}

/**
 * Does an earlier Concealment success still protect the character against this kind of device?
 * @param {object} flag        { scouter: { combat }, scope: { combat, holdingBack } } on the scanned actor
 * @param {string} kind        scouter | scope
 * @param {string} combatId    the current Combat Encounter (none: no protection outside of combat)
 * @param {number} holdingBack the character's Holding Back stacks now
 */
export function scanProtected(flag, kind, combatId, holdingBack = 0) {
  const e = flag?.[kind];
  if ( !e || !combatId || (e.combat !== combatId) ) return false;
  return (kind !== "scope") || (holdingBack >= (e.holdingBack ?? 0));
}

/* -------------------------------------------- */
/*  Scouters destroyed by a Power Up            */
/* -------------------------------------------- */

/** Squares from a Power Up within which Scouters are destroyed during a Combat Encounter. */
export const SCOUTER_BREAK_SQUARES = 15;

/** The Craft DCs a Scouter can have. */
export const SCOUTER_DCS = ["qualified", "expert", "master", "grandmaster"];

const BREAK_TOP = { novice: 2, apprentice: 2, qualified: 2, expert: 3 };

/** The Tier of Power whose Power Up destroys a Scouter of that Craft DC (null: Master and Grandmaster hold). */
export function scouterBreakTop(dc) {
  return BREAK_TOP[dc] ?? null;
}

/**
 * The Scouters of an actor a Power Up of this (current) Tier of Power may destroy: the Scouter Accessories in use with
 * Craft DC Expert or lower (not the Scout Scope or the Integrated Scouters). dc null: the Craft DC is variable or
 * not given, so it has to be told (Tier of Power 2 is the lowest that destroys any).
 * @returns {Array<{itemId: string, name: string, dc: string|null}>}
 */
export function breakableScouters(actor, top) {
  return scanDevices(actor).filter(d => (d.kind === "scouter") && !d.integrated
    && ((d.dc === null) ? (top >= BREAK_TOP.qualified) : ((scouterBreakTop(d.dc) ?? Infinity) <= top)));
}

/** Update of an item that loses one destroyed Scouter (the last one is also taken off). */
export function destroyedUpdate(sys) {
  const quantity = Math.max(0, (sys?.quantity ?? 1) - 1);
  return { "system.quantity": quantity, ...(quantity ? {} : { "system.equipped": false }) };
}

/** Text written in the item's Craft DC field for a difficulty ("expert" → "Expert"). */
export const craftDCText = dc => dc ? dc[0].toUpperCase() + dc.slice(1) : "";

/** What a Scan reveals of a prepared actor system: current ToP, Power Level (or null) and Battle Power. */
export function scanReading(sys) {
  const top = sys?.top?.current ?? 1;
  const base = sys?.top?.base ?? top;
  return {
    top,
    pl: (top === base) ? (sys?.pl ?? null) : null,
    bp: Math.max(0, Math.floor(Number(sys?.battlePower?.value) || 0))
  };
}
