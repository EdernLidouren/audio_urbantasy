// Registre des types d'entités. Donnée neutre : aucun import, ni du core ni
// de la vue. blocksMovement/enterable sont PRÉVUS pour être lus par le core
// (collision, entrée en porte) mais ne sont pas encore câblés : le
// déplacement (core/reduce.js) ignore aujourd'hui les entités du niveau. La
// vue lit sounds/label pour le rendu audio et les annonces. Ni l'un ni
// l'autre ne dépend de l'autre, seulement de ce registre.
//
// label est une CLÉ i18n (jamais une chaîne affichable directement).
//
// descriptionKey (optionnel) : CLÉ i18n de la description utilisée par
// l'interaction "describe" (touche Espace, voir view/interaction.js).
// Défaut par type ici, surchargeable par instance via le champ
// `descriptionKey` du niveau (level/*.json) — cascade instance -> type
// identique à celle de nameKey/label (résolue dans core/level.js).
//
// sounds regroupe les descripteurs de son du type PAR RÔLE (voir
// entities/model.md pour le vocabulaire complet). `beacon` est la boucle
// positionnée qui signale l'entité dans l'espace (loop:true) — le seul rôle
// utilisé aujourd'hui. D'autres rôles pourront s'ajouter au besoin (ex. un
// son d'interaction ponctuel) sans toucher à ce qui existe.
//
// Un type peut optionnellement porter des défauts de réglage (ex.
// audibleRange, panSaturation, interactRange, reverbSend — voir
// config/tuning.js) : ils interviennent dans la cascade de resolveTuning
// entre le son/l'instance et le défaut global. Aucun type n'en définit pour
// l'instant : le reverbSend des balises retombe donc sur le défaut global,
// comportement identique à avant l'introduction du modèle de son.
//
// Les sous-types (door/npc/object/decor) sont des PRESETS de propriétés —
// des objets plats indépendants, jamais une hiérarchie ni de l'héritage :
// voir entities/model.md.

export default {
  door: {
    label: "entity.door",
    descriptionKey: "entity.door.description",
    sounds: {
      beacon: { path: "sounds/door_1.mp3", loop: true },
    },
    blocksMovement: false,
    enterable: true,
  },
  npc: {
    label: "entity.npc",
    descriptionKey: "entity.npc.description",
    sounds: {
      beacon: { path: "sounds/tictoc_1.mp3", loop: true },
    },
    blocksMovement: true,
    enterable: false,
  },
  object: {
    label: "entity.object",
    descriptionKey: "entity.object.description",
    sounds: {
      beacon: { path: "sounds/box_of_nails_1.mp3", loop: true },
    },
    blocksMovement: true,
    enterable: false,
  },
  // Preset d'exemple, non utilisé dans demo.json : positionné et purement
  // décoratif. Aucune interaction (enterable:false, pas de descriptionKey) —
  // seuls les types ci-dessus sont concernés par l'interaction "describe".
  decor: {
    label: "entity.decor",
    sounds: {
      beacon: { path: "sounds/box_of_nails_1.mp3", loop: true },
    },
    blocksMovement: true,
    enterable: false,
  },
};
