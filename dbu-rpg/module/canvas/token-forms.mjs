/**
 * Token image per Transformation: while a Form or Enhancement with its own token image is active, the character's
 * tokens show it (and its linked prototype token, for tokens placed meanwhile); leaving it brings back the image they had.
 * The image a token had is kept in flags.dbu-rpg.formImg = { base, form }; a token whose image was changed by hand in
 * the meantime keeps the new one.
 */
const FLAG = "formImg";

/** The token image of the actor's current Transformations, or "": a Form beats an Enhancement, a higher Stage a lower. */
export function formImage(actor) {
  const active = (actor?.items ?? []).filter(i => (i.type === "transformation") && (i.system.transType !== "awakening")
    && i.system.active && i.system.tokenImg);
  if ( !active.length ) return "";
  const rank = i => ((i.system.countsAsForm ? 2 : 1) * 100) + (i.system.stage ?? 0);
  active.sort((a, b) => rank(b) - rank(a));
  return active[0].system.tokenImg;
}

/** The changes that give one token (or prototype token) the image wanted now, or null. */
function imageChanges(current, flag, wanted) {
  if ( wanted ) {
    if ( current === wanted ) return null;
    // The image it had before any Transformation (still the stored one unless it was changed by hand meanwhile)
    const base = (flag && (current === flag.form)) ? flag.base : current;
    return { "texture.src": wanted, [`flags.dbu-rpg.${FLAG}`]: { base, form: wanted } };
  }
  if ( !flag ) return null;
  const changes = { [`flags.dbu-rpg.${FLAG}`]: _del };
  if ( current === flag.form ) changes["texture.src"] = flag.base;
  return changes;
}

/** Give the actor's tokens (and its linked prototype token) the image of its current Transformation. */
export async function applyFormImage(actor) {
  if ( !actor?.isOwner ) return;
  for ( const token of actor.getDependentTokens({ concreteOnly: true }) ) {
    const changes = imageChanges(token.texture.src, token.getFlag("dbu-rpg", FLAG), formImage(token.actor ?? actor));
    if ( changes ) await token.update(changes);
  }
  if ( actor.isToken || !actor.prototypeToken?.actorLink ) return;
  const proto = imageChanges(actor.prototypeToken.texture.src, actor.getFlag("dbu-rpg", FLAG), formImage(actor));
  if ( !proto ) return;
  const flag = proto[`flags.dbu-rpg.${FLAG}`];
  const update = { [`flags.dbu-rpg.${FLAG}`]: flag };
  if ( "texture.src" in proto ) update["prototypeToken.texture.src"] = proto["texture.src"];
  await actor.update(update);
}

/** Wire the hooks: Transformations entered or left, their image changed, tokens placed while transformed. */
export function registerTokenForms() {
  const pending = new Set();
  const schedule = actor => {
    pending.add(actor);
    if ( pending.size > 1 ) return;
    // Unlinked tokens copy their base actor's changes right after its hooks run
    setTimeout(() => {
      const list = Array.from(pending);
      pending.clear();
      for ( const a of list ) applyFormImage(a).catch(err => console.error("DBU | Token image", err));
    }, 0);
  };
  const onItem = (item, changes, options, userId) => {
    // createItem / deleteItem pass (item, options, userId)
    if ( typeof options === "string" ) [userId, options] = [options, changes];
    if ( (userId !== game.user.id) || (item.type !== "transformation") || !(item.parent instanceof Actor) ) return;
    schedule(item.parent);
  };
  Hooks.on("createItem", onItem);
  Hooks.on("updateItem", onItem);
  Hooks.on("deleteItem", onItem);
  // A token placed while its character is transformed: the Transformation's image, remembering the usual one
  Hooks.on("preCreateToken", (token, data) => {
    const actor = token.actor;
    const wanted = formImage(actor);
    if ( !wanted ) return;
    const base = actor.getFlag("dbu-rpg", FLAG)?.base ?? actor.prototypeToken?.texture?.src ?? token.texture.src;
    token.updateSource({ "texture.src": wanted, [`flags.dbu-rpg.${FLAG}`]: { base: (base === wanted) ? token.texture.src : base, form: wanted } });
  });
}
