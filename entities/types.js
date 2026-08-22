// Registre des types d'entités. Donnée neutre : aucun import, ni du core ni
// de la vue. blocksMovement/enterable sont PRÉVUS pour être lus par le core
// (collision, entrée en porte) mais ne sont pas encore câblés : le
// déplacement (core/reduce.js) ignore aujourd'hui les entités du niveau. La
// vue lit sound/label pour le rendu audio et les annonces. Ni l'un ni
// l'autre ne dépend de l'autre, seulement de ce registre.
//
// label est une CLÉ i18n (jamais une chaîne affichable directement).
// sound est le chemin réel de l'asset audio, sous /sounds.
//
// Un type peut optionnellement porter des défauts de réglage (ex.
// audibleRange, panSaturation, interactRange — voir config/tuning.js) : ils
// interviennent dans la cascade de resolveTuning entre l'instance et le
// défaut global. Aucun type n'en définit pour l'instant.

export default {
  door: {
    label: "entity.door",
    sound: "sounds/door_1.mp3",
    blocksMovement: false,
    enterable: true,
  },
  npc: {
    label: "entity.npc",
    sound: "sounds/tictoc_1.mp3",
    blocksMovement: true,
    enterable: false,
  },
  object: {
    label: "entity.object",
    sound: "sounds/box_of_nails_1.mp3",
    blocksMovement: true,
    enterable: false,
  },
};
