// Parsing et validation d'un niveau. Fonction pure : aucun accès réseau ou
// DOM, aucune chaîne affichable produite (labelKey reste une clé i18n).
// Testable en Node/console sans navigateur : voir le bas du fichier pour un
// exemple d'invocation manuelle.
//
// AMBIENCE_CHANNEL_LIMIT vient d'une donnée neutre (zéro import), jamais de
// lib/audio.js : le core ne doit jamais importer la couche Web Audio/vue.

import { AMBIENCE_CHANNEL_LIMIT } from "../config/audio-channels.js";

function fail(message) {
  throw new Error(`parseLevel: ${message}`);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseEntity(rawEntity, index, registry, length, seenIds) {
  if (typeof rawEntity !== "object" || rawEntity === null) {
    fail(`entities[${index}] n'est pas un objet.`);
  }

  const { id, type, x, target, nameKey, descriptionKey } = rawEntity;

  if (!isNonEmptyString(id)) {
    fail(`entities[${index}].id manquant ou invalide.`);
  }
  if (seenIds.has(id)) {
    fail(`entities[${index}].id "${id}" est dupliqué.`);
  }
  seenIds.add(id);

  if (!isNonEmptyString(type) || !registry[type]) {
    fail(`entities[${index}] ("${id}") : type "${type}" absent du registre.`);
  }

  if (!isFiniteNumber(x) || x < 0 || x > length) {
    fail(`entities[${index}] ("${id}") : x (${x}) hors des bornes [0, ${length}].`);
  }

  const labelKey = isNonEmptyString(nameKey) ? nameKey : registry[type].label;
  // Même cascade instance -> type que labelKey, pour la description utilisée
  // par l'interaction "describe" (voir view/interaction.js). Peut rester
  // undefined si ni l'instance ni le type n'en fournissent une (ex. decor).
  const resolvedDescriptionKey = isNonEmptyString(descriptionKey) ? descriptionKey : registry[type].descriptionKey;
  const entity = { id, type, x, labelKey, descriptionKey: resolvedDescriptionKey };

  if (type === "door") {
    if (!isNonEmptyString(target)) {
      fail(`entities[${index}] ("${id}") : entité "door" sans target.`);
    }
    entity.target = target;
  }

  return entity;
}

export function parseLevel(raw, registry) {
  if (typeof raw !== "object" || raw === null) {
    fail("le niveau n'est pas un objet.");
  }
  if (typeof registry !== "object" || registry === null) {
    fail("le registre de types est manquant ou invalide.");
  }

  const { id, titleKey, length, playerStart, entities, music, ambiences } = raw;

  if (!isNonEmptyString(id)) {
    fail(`id manquant ou invalide (reçu : ${JSON.stringify(id)}).`);
  }
  if (!isNonEmptyString(titleKey)) {
    fail(`titleKey manquant ou invalide (reçu : ${JSON.stringify(titleKey)}).`);
  }
  if (!isFiniteNumber(length) || length <= 0) {
    fail(`length doit être un nombre > 0 (reçu : ${JSON.stringify(length)}).`);
  }
  if (!isFiniteNumber(playerStart) || playerStart < 0 || playerStart > length) {
    fail(`playerStart (${JSON.stringify(playerStart)}) hors des bornes [0, ${length}].`);
  }
  if (!Array.isArray(entities)) {
    fail(`entities doit être un tableau (reçu : ${JSON.stringify(entities)}).`);
  }
  // music : optionnel, chemin vers la musique du lieu (voir
  // view/audio/city-scene.js). Simple passage : parseLevel ne connaît ni
  // Howler ni la lecture audio, juste la présence d'une chaîne.
  if (music !== undefined && !isNonEmptyString(music)) {
    fail(`music doit être une chaîne non vide si présent (reçu : ${JSON.stringify(music)}).`);
  }
  // ambiences : optionnel, tableau de 0 à AMBIENCE_CHANNEL_LIMIT chemins
  // (voir view/audio/city-scene.js, lib/audio.js playAmbiences). Même
  // passage simple, juste la forme est vérifiée ici — la limite elle-même
  // vient de la source unique partagée avec lib/audio.js.
  if (ambiences !== undefined) {
    if (!Array.isArray(ambiences) || ambiences.length > AMBIENCE_CHANNEL_LIMIT || !ambiences.every(isNonEmptyString)) {
      fail(
        `ambiences doit être un tableau d'au plus ${AMBIENCE_CHANNEL_LIMIT} chaînes non vides si présent (reçu : ${JSON.stringify(ambiences)}).`
      );
    }
  }

  const seenIds = new Set();
  const parsedEntities = entities.map((rawEntity, index) =>
    parseEntity(rawEntity, index, registry, length, seenIds)
  );

  return { id, titleKey, length, playerStart, entities: parsedEntities, music, ambiences };
}
