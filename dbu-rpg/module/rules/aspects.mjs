import { DBU } from "../config.mjs";

/** The parts of an Aspect parameter: "Feral/Raging" → ["Feral", "Raging"]. */
export function aspectParams(param) {
  return String(param || "").split(/[\/,]/).map(p => p.trim()).filter(Boolean);
}

/** The name shown for an Aspect: "Innate State (Raging)", "Rampaging (LV1)", "Growth (LV1)". */
export function aspectLabel(a) {
  const inner = [a.param, a.level ? `LV${a.level}` : ""].filter(Boolean).join(", ");
  const label = DBU.aspects[a.key]?.label ?? a.key;
  return inner ? `${label} (${inner})` : label;
}

/** How many levels a Mastery Trait gains or loses at a number of Masteries ("M levels ... (max. 2)"). */
export function masteryAmount(c, mastery) {
  return c.perMastery ? Math.min(mastery, c.max || Infinity) : (c.level ?? 0);
}

/**
 * The Aspects a Transformation has right now:
 * - an "(LVG)" level follows the current Grade (Wrathful's Rampaging (LVG) has 2 levels in the 2nd Grade);
 * - each Grade applies the Aspects listed for it on the Grades table, including those listed by lower Grades;
 * - Mastery Traits change them from their Mastery level on ("Wrathful loses the Innate State (Feral) Aspect" keeps the
 *   Raging one; "Reduce the Rampaging Aspect for this Transformation by 1 level"; "gains M levels of the Scaling
 *   Aspect", M being the number of Masteries).
 * @param {object} system   The Transformation's system data (aspects, grade, mastery, gradeAspects, masteryAspects)
 * @returns {object[]}      A new list, or the original one when nothing changes it
 */
export function currentAspects({ aspects = [], grade = 1, mastery = 0, gradeAspects = [], masteryAspects = [] } = {}) {
  let list = aspects.map(a => ({ ...a }));
  let changed = false;
  const rename = a => {
    a.name = aspectLabel(a);
    changed = true;
  };
  const cap = (key, level) => Math.min(level, DBU.aspects[key]?.levels ?? Infinity);
  for ( const a of list ) {
    if ( !/^LV\s*G$/i.test(a.param ?? "") ) continue;
    a.level = cap(a.key, Math.max(1, grade));
    a.param = "";
    rename(a);
  }
  const add = c => {
    const existing = list.find(a => a.key === c.key);
    if ( !existing ) {
      const a = { key: c.key, name: "", level: cap(c.key, c.level ?? 0), param: c.param ?? "" };
      rename(a);
      list.push(a);
      return;
    }
    existing.level = cap(c.key, Math.max(existing.level ?? 0, c.level ?? 0));
    existing.param = [...new Set([...aspectParams(existing.param), ...aspectParams(c.param)])].join("/");
    rename(existing);
  };
  for ( const g of gradeAspects ) {
    if ( g.key && (g.grade <= grade) ) add(g);
  }
  for ( const c of masteryAspects ) {
    if ( !c.key || (mastery < c.mastery) ) continue;
    if ( c.op === "add" ) {
      add(c);
      continue;
    }
    if ( c.op === "raise" ) {
      // Levels on top of the ones it has ("gains 1 level of the Natural Aspect")
      const n = masteryAmount(c, mastery);
      if ( !(n > 0) ) continue;
      const existing = list.find(a => a.key === c.key);
      if ( !existing ) add({ key: c.key, level: n, param: "" });
      else {
        existing.level = cap(c.key, (existing.level || 1) + n);
        rename(existing);
      }
      continue;
    }
    const targets = list.filter(a => a.key === c.key);
    if ( !targets.length ) continue;
    changed = true;
    if ( (c.op === "remove") && c.param ) {
      // Only that part of the Aspect; it goes when nothing is left
      const drop = new Set(aspectParams(c.param).map(p => p.toLowerCase()));
      for ( const a of targets ) {
        a.param = aspectParams(a.param).filter(p => !drop.has(p.toLowerCase())).join("/");
        rename(a);
      }
      list = list.filter(a => (a.key !== c.key) || a.param);
    }
    else if ( c.op === "remove" ) list = list.filter(a => a.key !== c.key);
    else if ( c.op === "reduce" ) {
      for ( const a of targets ) {
        a.level = Math.max(0, (a.level || 1) - masteryAmount(c, mastery));
        rename(a);
      }
      list = list.filter(a => (a.key !== c.key) || (a.level > 0));
    }
  }
  return changed ? list : aspects;
}
