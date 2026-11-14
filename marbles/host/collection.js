// JEU DES BILLES, HÔTE — le FOURNISSEUR DE COLLECTION : ce que le minijeu sait des
// billes que le joueur a débloquées, et rien d'autre. La collection appartient à
// Templeton ; le minijeu ne la lit jamais directement, il interroge un fournisseur :
//
//   { unlockedMarbles: () => string[] }   les ids des billes débloquées.
//
// Une bille débloquée s'utilise librement dans un sac, dans les limites des règles de
// construction (marbles/core/bags.js) : aucune notion d'exemplaires possédés.
//
// PROVISOIRE : la collection de billes de Templeton n'existe pas encore. Le
// fournisseur branché par main.js est catalogCollection : toutes les billes du catalogue sont
// débloquées. Il se remplacera par un adaptateur de la vraie collection, sans rien
// changer au minijeu (doc/marbles.md, « Sacs »).

// Un fournisseur où toutes les billes du catalogue `types` sont débloquées.
export function catalogCollection(types) {
  const ids = Object.freeze(Object.keys(types));
  return Object.freeze({ unlockedMarbles: () => ids });
}

// Un fournisseur d'après une liste fixe d'ids : les vérifications et les outils.
export function listCollection(ids) {
  const unlocked = Object.freeze([...ids]);
  return Object.freeze({ unlockedMarbles: () => unlocked });
}
