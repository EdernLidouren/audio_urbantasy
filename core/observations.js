// OBSERVATIONS — un fait NEUTRE de partie : les types d'entité que le
// joueur a observés au moins une fois (touche Espace, interaction
// "describe", voir view/interaction.js). `session.observedEntityTypes =
// { [type]: true }`, SPARSE, cercle PARTIE, DÉFINITIF et sauvegardé, comme
// session.acquiredItems (core/bag.js). Lu par les collections
// (core/collections.js) : une entrée `{ entity }` est découverte dès que
// son type figure ici — le bestiaire surnaturel. Le fait ne sait rien des
// collections : toute entité observée y entre. Pur.

// Note `type` comme observé. Déjà noté -> MÊME session (rien de neuf à
// signaler à un observateur, voir view/collection-discoveries.js).
export function markObserved(session, type) {
  const observed = session.observedEntityTypes || {};
  if (observed[type]) return session;
  return { ...session, observedEntityTypes: { ...observed, [type]: true } };
}
