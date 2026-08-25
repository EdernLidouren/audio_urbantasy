// Parsing et validation d'un niveau. Fonction pure : aucun accès réseau ou
// DOM, aucune chaîne affichable produite (labelKey reste une clé i18n).
// Testable en Node/console sans navigateur : voir le bas du fichier pour un
// exemple d'invocation manuelle.
//
// AMBIENCE_CHANNEL_LIMIT vient d'une donnée neutre (zéro import), jamais de
// lib/audio.js : le core ne doit jamais importer la couche Web Audio/vue.

import { AMBIENCE_CHANNEL_LIMIT } from "../config/audio-channels.js";
import { BODY_RADIUS } from "./state.js";
import BEHAVIORS from "./behaviors/index.js";

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

  const { id, type, x, target, nameKey, descriptionKey, behavior, blocksMovement } = rawEntity;

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
  // blocksMovement : même cascade instance -> type que labelKey/
  // descriptionKey ci-dessus. Bakée ici, pas lue directement par
  // core/reduce.js dans le registre : le core ne connaît le registre qu'à
  // travers ce que parseLevel en extrait, jamais en l'important lui-même.
  if (blocksMovement !== undefined && typeof blocksMovement !== "boolean") {
    fail(`entities[${index}] ("${id}") : blocksMovement doit être un booléen si présent.`);
  }
  const resolvedBlocksMovement = blocksMovement !== undefined ? blocksMovement : Boolean(registry[type].blocksMovement);
  const entity = {
    id,
    type,
    x,
    labelKey,
    blocksMovement: resolvedBlocksMovement,
  };
  // Clé ajoutée SEULEMENT si résolue (jamais explicitement undefined) :
  // l'état doit rester de la donnée pure, un aller-retour JSON ne doit rien
  // changer à sa forme (voir movement.check.js, audit de sérialisabilité).
  // Même principe que target/behavior plus bas.
  if (resolvedDescriptionKey !== undefined) {
    entity.descriptionKey = resolvedDescriptionKey;
  }

  if (type === "door") {
    if (!isNonEmptyString(target)) {
      fail(`entities[${index}] ("${id}") : entité "door" sans target.`);
    }
    entity.target = target;
  }

  // behavior : optionnel, donnée (pas une classe) décrivant un comportement
  // de mouvement au tick (voir core/reduce.js). Sans behavior, une entité
  // reste immobile — comportement inchangé pour tout le contenu existant.
  if (behavior !== undefined) {
    entity.behavior = parseBehavior(behavior, index, id);
  }

  return entity;
}

// Générique : ne connaît aucun kind par son nom. Cherche kind dans le
// registre (comme registry[type] pour les types d'entité juste au-dessus),
// puis délègue la validation propre au comportement à son module (voir
// core/behaviors/wander.js) — parseParams ne renvoie que les champs fournis,
// les défauts se résolvent ailleurs (voir le contrat documenté dans le
// module), jamais ici.
function parseBehavior(behavior, index, id) {
  if (typeof behavior !== "object" || behavior === null) {
    fail(`entities[${index}] ("${id}") : behavior doit être un objet si présent.`);
  }

  const { kind } = behavior;
  const module = BEHAVIORS[kind];
  if (!module) {
    fail(`entities[${index}] ("${id}") : behavior.kind "${kind}" inconnu.`);
  }

  const params = module.parseParams(behavior, (message) => fail(`entities[${index}] ("${id}") : ${message}`));
  return { kind, ...params };
}

// Détection de chevauchement au chargement (préventif, NON bloquant) : le
// level design évite ce cas, mais un niveau mal formé doit se dénoncer au
// chargement plutôt qu'en cours de jeu — même principe de filet que
// playerStart plus bas, un console.warn clair, jamais un fail(). Une
// entité passable n'a pas de zone d'exclusion propre (voir
// core/reduce.js/resolveOverlaps) : seules les paires impliquant au moins
// une entité impassable sont vérifiées.
function warnOnOverlaps(entities, playerStart) {
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    if (a.blocksMovement && Math.abs(playerStart - a.x) < BODY_RADIUS) {
      console.warn(
        `parseLevel: playerStart (${playerStart}) démarre dans le corps de l'entité impassable "${a.id}" (x=${a.x}).`
      );
    }
    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      if (a.blocksMovement && b.blocksMovement && Math.abs(a.x - b.x) < 2 * BODY_RADIUS) {
        console.warn(
          `parseLevel: entités impassables "${a.id}" (x=${a.x}) et "${b.id}" (x=${b.x}) se chevauchent au chargement.`
        );
      }
    }
  }
}

export function parseLevel(raw, registry) {
  if (typeof raw !== "object" || raw === null) {
    fail("le niveau n'est pas un objet.");
  }
  if (typeof registry !== "object" || registry === null) {
    fail("le registre de types est manquant ou invalide.");
  }

  const { id, titleKey, length, playerStart, entities, music, ambiences, reverbDurationSec, reverbDecay } = raw;

  if (!isNonEmptyString(id)) {
    fail(`id manquant ou invalide (reçu : ${JSON.stringify(id)}).`);
  }
  if (!isNonEmptyString(titleKey)) {
    fail(`titleKey manquant ou invalide (reçu : ${JSON.stringify(titleKey)}).`);
  }
  if (!isFiniteNumber(length) || length <= 0) {
    fail(`length doit être un nombre > 0 (reçu : ${JSON.stringify(length)}).`);
  }
  // playerStart : point d'arrivée PAR DÉFAUT du lieu. FILET, pas de rejet :
  // absent ou hors [0, length] -> repli sur 0, jamais d'exception (un lieu
  // mal configuré ne doit pas empêcher d'y entrer). Des points d'arrivée
  // NOMMÉS (ex. arriver à l'entrée précise associée à la porte empruntée)
  // pourront s'ajouter plus tard, sans toucher à ce filet — pas codés ici.
  const resolvedPlayerStart =
    isFiniteNumber(playerStart) && playerStart >= 0 && playerStart <= length ? playerStart : 0;
  if (resolvedPlayerStart !== playerStart) {
    console.warn(
      `parseLevel: playerStart (${JSON.stringify(playerStart)}) absent ou hors bornes, repli sur 0.`
    );
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
  // reverbDurationSec/reverbDecay : optionnels, surchargent par LIEU les
  // défauts globaux du bus de réverb (config/tuning-values.js) — voir
  // view/audio/city-scene.js. Simple passage validé, comme music/ambiences ;
  // aucune logique de résolution ici (ça reste dans la vue).
  if (reverbDurationSec !== undefined && (!isFiniteNumber(reverbDurationSec) || reverbDurationSec <= 0)) {
    fail(`reverbDurationSec doit être un nombre > 0 si présent (reçu : ${JSON.stringify(reverbDurationSec)}).`);
  }
  if (reverbDecay !== undefined && (!isFiniteNumber(reverbDecay) || reverbDecay <= 0)) {
    fail(`reverbDecay doit être un nombre > 0 si présent (reçu : ${JSON.stringify(reverbDecay)}).`);
  }

  const seenIds = new Set();
  const parsedEntities = entities.map((rawEntity, index) =>
    parseEntity(rawEntity, index, registry, length, seenIds)
  );

  warnOnOverlaps(parsedEntities, resolvedPlayerStart);

  const level = {
    id,
    titleKey,
    length,
    playerStart: resolvedPlayerStart,
    entities: parsedEntities,
  };
  // Clés ajoutées SEULEMENT si présentes (jamais explicitement undefined) :
  // l'état doit rester de la donnée pure, un aller-retour JSON ne doit rien
  // changer à sa forme (voir movement.check.js, audit de sérialisabilité).
  if (music !== undefined) level.music = music;
  if (ambiences !== undefined) level.ambiences = ambiences;
  if (reverbDurationSec !== undefined) level.reverbDurationSec = reverbDurationSec;
  if (reverbDecay !== undefined) level.reverbDecay = reverbDecay;

  return level;
}
