// Registre des types d'entités. Donnée neutre : aucun import, ni du core ni
// de la vue. Le core lit blocksMovement/enterable pour la logique de
// collision/interaction ; la vue lit sound/label pour le rendu audio et les
// annonces. Ni l'un ni l'autre ne dépend de l'autre, seulement de ce
// registre.
//
// label est une CLÉ i18n (jamais une chaîne affichable directement).
// sound est un chemin placeholder, résolu plus tard par la couche audio.

export default {
  door: {
    label: "entity.door",
    sound: "sounds/door.mp3",
    blocksMovement: false,
    enterable: true,
  },
  npc: {
    label: "entity.npc",
    sound: "sounds/npc.mp3",
    blocksMovement: true,
    enterable: false,
  },
  object: {
    label: "entity.object",
    sound: "sounds/object.mp3",
    blocksMovement: true,
    enterable: false,
  },
};
