// Registre des ÉMOTES — gestes SONORES du joueur (siffler, claquer des
// mains...), joués sur sa position (touche "e", voir view/emotes.js).
// Structuré comme core/improvements.js/IMPROVEMENT_REGISTRY : SOURCE DE
// VÉRITÉ des émotes existantes, valide la condition knowsEmote et les effets
// learnEmote/forgetEmote (voir core/script-parse.js). Ajouter une émote =
// une entrée ici, jamais une chaîne en dur ailleurs.
//
// Une émote se CONNAÎT ou non, comme une amélioration se possède : le joueur
// les apprend au fil de la partie (effet learnEmote, ou départ d'une partie
// neuve, config/new-game.js). Le monde y RÉAGIT par les triggers
// `on: "emote"` de ses entités (voir core/triggers.js/applyEmoteTriggers),
// jusqu'à la portée de l'émote.
//
// RACCOURCI : une émote choisie par le joueur (Maj+E) que la touche "e"
// refait d'un coup, sans menu — session.emoteShortcut, voir
// setEmoteShortcut plus bas.

import { rejectUnknownFields, isNonEmptyString, isFiniteNumber } from "../lib/validate.js";

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

function failEmotes(message) {
  throw new Error(`EMOTE_REGISTRY : ${message}`);
}

// Champs connus, ordres entiers >= 1 et uniques, textes, son et portée
// présents — sinon une erreur claire à l'import. Exportée pour les checks terminal
// (core/checks/emotes.check.js).
export function validateEmoteRegistry(registry) {
  const seen = new Map();
  for (const [id, props] of Object.entries(registry)) {
    rejectUnknownFields(props, ["order", "nameKey", "descriptionKey", "soundPath", "range"], `"${id}"`, failEmotes);
    if (!Number.isInteger(props.order) || props.order < 1) {
      failEmotes(`"${id}".order doit être un entier >= 1 (reçu : ${JSON.stringify(props.order)}).`);
    }
    if (seen.has(props.order)) failEmotes(`order ${props.order} partagé par "${seen.get(props.order)}" et "${id}".`);
    seen.set(props.order, id);
    for (const field of ["nameKey", "descriptionKey", "soundPath"]) {
      if (!isNonEmptyString(props[field])) failEmotes(`"${id}".${field} doit être une chaîne non vide.`);
    }
    if (!isFiniteNumber(props.range) || props.range <= 0) {
      failEmotes(`"${id}".range doit être un nombre > 0 (reçu : ${JSON.stringify(props.range)}).`);
    }
  }
}
validateEmoteRegistry(EMOTE_REGISTRY);

// Ids du registre triés par `order` — l'ordre du menu des émotes.
export function orderedEmoteIds(registry = EMOTE_REGISTRY) {
  return Object.keys(registry).sort((a, b) => registry[a].order - registry[b].order);
}

export function emoteProps(id) {
  return EMOTE_REGISTRY[id];
}

// STOCKAGE — session.emotes : { [id]: true }, SPARSE (une émote inconnue n'a
// PAS de clé), cercle PARTIE et PERSISTANT, exactement comme
// session.improvements (voir core/state.js/createInitialState,
// core/save.js/migrateSave). Trois primitives PURES sur ce sac, même patron
// que core/improvements.js : un id inconnu du registre n'est jamais vérifié
// ICI, la validation vit au CHARGEMENT (core/script-parse.js,
// core/new-game.js).
export function knowsEmote(emotes, id) {
  return Boolean(emotes && emotes[id]);
}

export function learnEmote(emotes, id) {
  if (knowsEmote(emotes, id)) return emotes;
  return { ...emotes, [id]: true };
}

export function forgetEmote(emotes, id) {
  if (!knowsEmote(emotes, id)) return emotes;
  const next = { ...emotes };
  delete next[id];
  return next;
}

// RACCOURCI — session.emoteShortcut : l'id de l'émote que "e" refait, ou
// null (aucune). Cercle PARTIE, sauvegardé avec la partie : c'est un choix
// du joueur sur SES émotes, pas une préférence de l'application. Un id
// inconnu du registre est une erreur de programmation (le menu ne propose
// que des émotes du registre) : exception immédiate.
//
// Le raccourci peut viser une émote que le joueur ne connaît plus (oubliée
// par forgetEmote, ou choisie en mode debug, où toutes se lisent connues) :
// la vue le relit alors comme VIDE (voir view/emotes.js), sans jamais
// l'effacer — réapprise, l'émote retrouve sa place.
export function setEmoteShortcut(session, id) {
  if (!Object.hasOwn(EMOTE_REGISTRY, id)) throw new Error(`setEmoteShortcut : émote "${id}" absente du registre.`);
  if (session.emoteShortcut === id) return session;
  return { ...session, emoteShortcut: id };
}
