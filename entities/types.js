// Registre des types d'entités. Donnée neutre : aucun import, ni du core ni
// de la vue. blocksMovement est lu par core/level.js (baké dans l'entité
// parsée) puis exploité par core/reduce.js pour arrêter le joueur au bord
// du corps d'une entité bloquante (voir BODY_RADIUS, uniforme pour
// l'instant). enterable reste PRÉVU (entrée en porte) mais pas encore
// câblé. La vue lit sounds/label/collisionSound pour le rendu audio et les
// annonces. Ni l'un ni l'autre ne dépend de l'autre, seulement de ce
// registre.
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
      beacon: { path: "assets/sounds/entities/door_beacon_1.mp3", loop: true },
    },
    blocksMovement: false,
    enterable: true,
  },
  npc: {
    label: "entity.npc",
    descriptionKey: "entity.npc.description",
    sounds: {
      beacon: { path: "assets/sounds/entities/npc_beacon_1.mp3", loop: true },
    },
    blocksMovement: false,
    enterable: false,
  },
  object: {
    label: "entity.object",
    descriptionKey: "entity.object.description",
    sounds: {
      beacon: { path: "assets/sounds/entities/box_of_nails_beacon_1.mp3", loop: true },
    },
    blocksMovement: false,
    enterable: false,
  },
  // blocksMovement est maintenant exploité par core/reduce.js (résolution
  // de collision joueur/entité) : voir core/level.js pour le bakage dans
  // l'entité parsée, et view/audio/city-scene.js pour le son de butée.
  // collisionSound (optionnel, ailleurs que dans sounds : ce n'est pas un
  // rôle du modèle d'entité, juste une clé d'asset jouée par la vue quand le
  // CORE signale player.blockedBy === cette entité) — dormant si l'entité
  // n'est pas blocksMovement.
  rock: {
    label: "entity.rock",
    descriptionKey: "entity.rock.description",
    sounds: {
      beacon: { path: "assets/sounds/entities/big_rock_beacon_1.mp3", loop: true },
    },
    collisionSound: "assets/sounds/entities/big_rock_collision_1.mp3",
    blocksMovement: true,
    enterable: false,
  },
  // Premier type doté d'un `behavior` en jeu (voir level/demo.json) : une
  // entité "dog" avec behavior:{kind:"wander"} se déplace au fil des ticks
  // (core/reduce.js). Son provisoire, sans rapport avec le comportement —
  // le son propre au chien n'est pas le sujet de cette étape.
  dog: {
    label: "entity.dog",
    descriptionKey: "entity.dog.description",
    sounds: {
      beacon: { path: "assets/sounds/entities/box_of_nails_beacon_1.mp3", loop: true },
    },
    blocksMovement: false,
    enterable: false,
  },
  // Preset d'exemple, non utilisé dans demo.json : positionné et purement
  // décoratif. Aucune interaction (enterable:false, pas de descriptionKey) —
  // seuls les types ci-dessus sont concernés par l'interaction "describe".
  decor: {
    label: "entity.decor",
    sounds: {
      beacon: { path: "assets/sounds/entities/box_of_nails_beacon_1.mp3", loop: true },
    },
    blocksMovement: true,
    enterable: false,
  },
};
