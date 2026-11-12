// ÉMOTES — donnée pure (aucun import), le registre des émotes du joueur. Lu par
// le core (core/emotes.js : validation au chargement, connaissance, raccourci ;
// core/triggers.js : portée) et par la vue (menu, son). Ajouter une émote : une
// entrée ici.
//
// `order` (entier >= 1, UNIQUE) : position dans le menu des émotes, déclarée
// comme pour les améliorations (réarranger le registre ne renumérote rien).
// `soundPath` : la clé d'asset jouée sur le joueur (un pool, voir
// lib/assets.js), vérifiée par l'audit du contenu comme tout son cité.
// `range` (nombre > 0, unités de scène) : jusqu'où l'émote PORTE — au-delà,
// aucune entité ne l'entend, aucun trigger n'est même examiné. Un trigger
// peut la raccourcir (sa propre sensibilité), jamais l'allonger.
export const EMOTE_REGISTRY = {
  whistle: {
    order: 1,
    nameKey: "emote.whistle.name",
    descriptionKey: "emote.whistle.description",
    soundPath: "assets/sounds/emotes/calling_whistle",
    range: 25,
  },
  clap: {
    order: 2,
    nameKey: "emote.clap.name",
    descriptionKey: "emote.clap.description",
    soundPath: "assets/sounds/emotes/hand_clap",
    range: 12,
  },
};
