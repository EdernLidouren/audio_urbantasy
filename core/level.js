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
import { SURFACE_REGISTRY, DEFAULT_SURFACE } from "./surfaces.js";
import { CONDITION_TYPES } from "./presence.js";
import { TAG_REGISTRY } from "./tags.js";

function fail(message) {
  throw new Error(`parseLevel: ${message}`);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Un effet porté par une règle de presence[] : { type: "presence", present:
// boolean } ou { type: "behavior", behavior: <objet behavior, même forme
// que entities[].behavior — voir parseBehavior plus bas, réutilisé TEL
// QUEL, aucune duplication>. Aiguillage EXPLICITE par type, PAS un registre
// comme CONDITION_TYPES (voir core/presence.js, header) : un effet a une
// validation propre à son type — une simple chaîne booléenne pour
// "presence", une sous-validation complète de comportement pour
// "behavior" — qu'un registre de noms ne suffirait pas à couvrir. Ajouter
// un effet demain = ajouter un cas ici, même esprit que les conditions,
// juste pas la même mécanique.
function parseEffect(rawEffect, effectIndex, ruleIndex, index, id) {
  if (typeof rawEffect !== "object" || rawEffect === null) {
    fail(`entities[${index}] ("${id}") : presence[${ruleIndex}].effects[${effectIndex}] n'est pas un objet.`);
  }
  const { type } = rawEffect;
  if (type === "presence") {
    if (typeof rawEffect.present !== "boolean") {
      fail(`entities[${index}] ("${id}") : presence[${ruleIndex}].effects[${effectIndex}].present doit être un booléen.`);
    }
    return { type: "presence", present: rawEffect.present };
  }
  if (type === "behavior") {
    return { type: "behavior", behavior: parseBehavior(rawEffect.behavior, index, id) };
  }
  fail(`entities[${index}] ("${id}") : presence[${ruleIndex}].effects[${effectIndex}].type "${type}" inconnu.`);
}

// Une règle de presence[] : { when: { type, ... }, effects: [<effet>...] }.
// `when` est reporté TEL QUEL (transport générique, comme `tuning` plus
// bas) — son évaluateur (core/presence.js) gère seul ses propres champs, y
// compris leur absence/malformation (repli défensif -> false). RACCOURCI
// rétrocompatible avec la présence seule (avant ce système généralisé) :
// `{ when, present: boolean }` sans `effects`, normalisé ICI en forme
// canonique `{ when, effects: [{ type: "presence", present }] }` — tout
// consommateur d'une entité PARSÉE (vue, sauvegarde...) ne voit plus qu'une
// seule forme, jamais les deux. Une règle sans AUCUN effet ne sert à rien
// (échec clair plutôt qu'une règle muette qu'on croirait active) : l'un des
// deux (`effects` ou `present`) est requis.
function parsePresenceRule(rawRule, ruleIndex, index, id) {
  if (typeof rawRule !== "object" || rawRule === null) {
    fail(`entities[${index}] ("${id}") : presence[${ruleIndex}] n'est pas un objet.`);
  }
  const { when, present, effects } = rawRule;
  if (typeof when !== "object" || when === null || !isNonEmptyString(when.type)) {
    fail(`entities[${index}] ("${id}") : presence[${ruleIndex}].when doit être un objet avec un type.`);
  }
  if (!CONDITION_TYPES.includes(when.type)) {
    fail(`entities[${index}] ("${id}") : presence[${ruleIndex}].when.type "${when.type}" absent du registre de conditions.`);
  }
  // "hasEquipmentTag" : EN PLUS de son type (déjà validé ci-dessus), son
  // champ `tag` référence un tag de contenu (core/tags.js/TAG_REGISTRY) —
  // même traitement qu'une surface de segment (voir parseSegment plus bas) :
  // une faute de frappe ici échouerait SILENCIEUSEMENT à l'évaluation
  // (core/presence.js/evaluateHasEquipmentTag replie sur false pour un tag
  // absent), donc elle est refusée ICI, au chargement, plutôt que de laisser
  // une règle de contenu ne jamais se déclencher sans qu'on sache pourquoi.
  if (when.type === "hasEquipmentTag" && (!isNonEmptyString(when.tag) || !TAG_REGISTRY[when.tag])) {
    fail(`entities[${index}] ("${id}") : presence[${ruleIndex}].when.tag "${when.tag}" absent du registre de tags.`);
  }

  if (effects !== undefined) {
    if (!Array.isArray(effects) || effects.length === 0) {
      fail(`entities[${index}] ("${id}") : presence[${ruleIndex}].effects doit être un tableau non vide si présent.`);
    }
    return { when, effects: effects.map((effect, i) => parseEffect(effect, i, ruleIndex, index, id)) };
  }
  if (typeof present !== "boolean") {
    fail(`entities[${index}] ("${id}") : presence[${ruleIndex}] doit fournir "effects" ou "present" (booléen).`);
  }
  return { when, effects: [{ type: "presence", present }] };
}

function parseEntity(rawEntity, index, registry, length, seenIds) {
  if (typeof rawEntity !== "object" || rawEntity === null) {
    fail(`entities[${index}] n'est pas un objet.`);
  }

  const {
    id,
    type,
    x,
    target,
    nameKey,
    descriptionKey,
    consumedDescriptionKey,
    behavior,
    blocksMovement,
    observable,
    interactable,
    action,
    tuning,
    presence,
  } = rawEntity;

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
  // consumedDescriptionKey : même cascade instance -> type que
  // descriptionKey ci-dessus — description ALTERNATIVE une fois l'entité
  // "consumed" (voir core/state.js/markConsumed, entities/model.md/
  // "Collectible persistant"). TRANSPORT pur, comme descriptionKey : le
  // core ignore tout du sens de "consumed" en dehors de sa propre condition
  // de présence (core/presence.js) — c'est view/interaction.js qui choisit
  // laquelle des deux clés annoncer, jamais ici.
  const resolvedConsumedDescriptionKey = isNonEmptyString(consumedDescriptionKey)
    ? consumedDescriptionKey
    : registry[type].consumedDescriptionKey;
  // blocksMovement : même cascade instance -> type que labelKey/
  // descriptionKey ci-dessus. Bakée ici, pas lue directement par
  // core/reduce.js dans le registre : le core ne connaît le registre qu'à
  // travers ce que parseLevel en extrait, jamais en l'important lui-même.
  if (blocksMovement !== undefined && typeof blocksMovement !== "boolean") {
    fail(`entities[${index}] ("${id}") : blocksMovement doit être un booléen si présent.`);
  }
  const resolvedBlocksMovement = blocksMovement !== undefined ? blocksMovement : Boolean(registry[type].blocksMovement);
  // observable/interactable : DEUX capacités indépendantes (système
  // d'interaction niveau 0, voir view/interaction.js) — même cascade que
  // blocksMovement, même défaut global (false, silence par défaut plutôt
  // qu'une capacité surprise). Volontairement des booléens PLATS ici (pas
  // de sous-objet "capabilities") : la richesse du TYPE d'action (voir
  // `action` plus bas) s'ajoute EN PLUS via un champ séparé, jamais en
  // remplaçant celui-ci — le filtrage par verbe
  // (view/audio/city-scene.js/getInteractionCandidates) ne lit jamais plus
  // que ces deux booléens.
  if (observable !== undefined && typeof observable !== "boolean") {
    fail(`entities[${index}] ("${id}") : observable doit être un booléen si présent.`);
  }
  const resolvedObservable = observable !== undefined ? observable : Boolean(registry[type].observable);
  if (interactable !== undefined && typeof interactable !== "boolean") {
    fail(`entities[${index}] ("${id}") : interactable doit être un booléen si présent.`);
  }
  const resolvedInteractable = interactable !== undefined ? interactable : Boolean(registry[type].interactable);
  const entity = {
    id,
    type,
    x,
    labelKey,
    blocksMovement: resolvedBlocksMovement,
    observable: resolvedObservable,
    interactable: resolvedInteractable,
  };
  // Clé ajoutée SEULEMENT si résolue (jamais explicitement undefined) :
  // l'état doit rester de la donnée pure, un aller-retour JSON ne doit rien
  // changer à sa forme (voir movement.check.js, audit de sérialisabilité).
  // Même principe que target/behavior plus bas.
  if (resolvedDescriptionKey !== undefined) {
    entity.descriptionKey = resolvedDescriptionKey;
  }
  if (resolvedConsumedDescriptionKey !== undefined) {
    entity.consumedDescriptionKey = resolvedConsumedDescriptionKey;
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

  // action : optionnel, TYPE D'ACTION porté par une entité interactable
  // (voir view/interaction.js) — { kind: <string>, ...paramètres }. Cascade
  // instance -> type, comme behavior. TRANSPORT générique comme tuning
  // plus bas : validé en FORME seulement (objet avec un kind non vide),
  // JAMAIS le kind lui-même contre un registre de types connus — cet
  // aiguillage reste entièrement côté vue (ACTION_HANDLERS,
  // view/interaction.js), le core ignore tout du SENS d'un kind, comme il
  // ignore déjà le sens d'une clé de tuning. Un kind inconnu à
  // l'INTERACTION (pas au chargement) se dégrade proprement, voir
  // view/interaction.js.
  const resolvedAction = action !== undefined ? action : registry[type].action;
  if (resolvedAction !== undefined) {
    if (typeof resolvedAction !== "object" || resolvedAction === null || Array.isArray(resolvedAction)) {
      fail(`entities[${index}] ("${id}") : action doit être un objet si présent.`);
    }
    if (!isNonEmptyString(resolvedAction.kind)) {
      fail(`entities[${index}] ("${id}") : action.kind doit être une chaîne non vide.`);
    }
    entity.action = resolvedAction;
  }

  // tuning : surcharges d'INSTANCE pour la cascade de réglages
  // (lib/tuning.js/resolveTuning, config/tuning.js) — TRANSPORT générique,
  // jamais interprété ici. Le core ignore tout du SENS de ces clés (sonore
  // ou non) : il se contente de les porter jusqu'à l'entité parsée, palier
  // le plus spécifique après le descripteur de son lui-même (voir
  // entities/model.md). Aucune clé nommée en dur — ajouter demain un
  // nouveau paramètre résolu en cascade (config/tuning-values.js) le rend
  // automatiquement surchargeable ici, sans jamais rouvrir ce fichier.
  // Même statut que music/ambiences/reverbDurationSec/reverbDecay plus bas
  // dans parseLevel (niveau LIEU, pas entité) : simple passage validé en
  // FORME (un objet), jamais en contenu.
  if (tuning !== undefined) {
    if (typeof tuning !== "object" || tuning === null || Array.isArray(tuning)) {
      fail(`entities[${index}] ("${id}") : tuning doit être un objet si présent.`);
    }
    entity.tuning = tuning;
  }

  // presence : optionnel, RÈGLES DÉCLARATIVES de présence conditionnelle
  // (voir core/presence.js) — cascade INSTANCE -> TYPE, même principe que
  // blocksMovement (ex. "neon" est TOUJOURS nocturne par archétype, voir
  // entities/types/neon.js ; une instance pourrait surcharger son propre
  // calendrier si besoin un jour). Ni l'un ni l'autre -> toujours présente,
  // comportement STRICTEMENT inchangé pour tout contenu existant (voir
  // core/presence.js/isPresent).
  const resolvedPresence = presence !== undefined ? presence : registry[type].presence;
  if (resolvedPresence !== undefined) {
    if (!Array.isArray(resolvedPresence)) {
      fail(`entities[${index}] ("${id}") : presence doit être un tableau si présent.`);
    }
    entity.presence = resolvedPresence.map((rule, i) => parsePresenceRule(rule, i, index, id));
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

// Un segment PATCHE defaultSurface sur [from, to] (bornes incluses, voir
// surfaceAt/core/surfaces.js) : from < to, les deux dans [0, length].
// TOUJOURS explicite si présent (pas de filet ici, contrairement à
// defaultSurface) : déclarer un segment est un choix délibéré, une surface
// inconnue est une vraie erreur de contenu -> échec clair, comme un type
// d'entité inconnu (voir parseEntity).
function parseSegment(rawSegment, index, length) {
  if (typeof rawSegment !== "object" || rawSegment === null) {
    fail(`segments[${index}] n'est pas un objet.`);
  }

  const { from, to, surface } = rawSegment;
  if (!isFiniteNumber(from) || !isFiniteNumber(to) || from < 0 || to > length || from >= to) {
    fail(
      `segments[${index}] : bornes [from, to] invalides (reçu from=${JSON.stringify(from)}, to=${JSON.stringify(to)}, longueur ${length}).`
    );
  }
  if (!isNonEmptyString(surface) || !SURFACE_REGISTRY[surface]) {
    fail(`segments[${index}] : surface "${surface}" absente du registre de surfaces.`);
  }

  return { from, to, surface };
}

export function parseLevel(raw, registry) {
  if (typeof raw !== "object" || raw === null) {
    fail("le niveau n'est pas un objet.");
  }
  if (typeof registry !== "object" || registry === null) {
    fail("le registre de types est manquant ou invalide.");
  }

  const {
    id,
    titleKey,
    length,
    playerStart,
    entities,
    music,
    musicDay,
    musicNight,
    musicLoop,
    ambiences,
    ambiencesDay,
    ambiencesNight,
    reverbDurationSec,
    reverbDecay,
    floors,
    defaultSurface,
    segments,
  } = raw;

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
  // floors : nombre d'ÉTAGES du lieu — fondation RÉSERVÉE de la verticalité
  // future (voir level/schema.md), totalement INERTE ici : aucune mécanique
  // n'en dépend (pas de position Y, pas de palier actif, pas d'audio
  // d'étage). FILET comme playerStart : entier >= 1 attendu, absent ou
  // invalide -> repli sur 1, JAMAIS d'exception. Absent reste SILENCIEUX
  // (c'est le cas normal — aucune scène actuelle n'en déclare, toutes
  // valent donc 1 implicitement, comportement inchangé) ; une valeur
  // FOURNIE mais invalide avertit clairement, même politique que
  // playerStart hors bornes.
  const resolvedFloors = Number.isInteger(floors) && floors >= 1 ? floors : 1;
  if (floors !== undefined && resolvedFloors !== floors) {
    console.warn(`parseLevel: floors (${JSON.stringify(floors)}) invalide (entier >= 1 attendu), repli sur 1.`);
  }
  // defaultSurface : couvre tout le X non-segmenté (voir surfaceAt,
  // core/surfaces.js) — toute la scène est TOUJOURS couverte, sans trou.
  // FILET SILENCIEUX si absent (repli sur DEFAULT_SURFACE, comportement
  // audible inchangé pour toute scène existante qui n'en déclare pas encore
  // — même politique d'omission que floors), mais une valeur FOURNIE doit
  // exister dans le registre -> échec clair sinon (comme un type d'entité
  // inconnu, voir parseEntity) : une référence de surface erronée est un
  // vrai bug de contenu, jamais dégradée en silence.
  if (defaultSurface !== undefined && (!isNonEmptyString(defaultSurface) || !SURFACE_REGISTRY[defaultSurface])) {
    fail(`defaultSurface "${JSON.stringify(defaultSurface)}" absente du registre de surfaces.`);
  }
  const resolvedDefaultSurface = defaultSurface !== undefined ? defaultSurface : DEFAULT_SURFACE;
  // segments : optionnel, PATCHE defaultSurface sur des zones précises (voir
  // parseSegment) — absent -> tableau vide, toujours resolvedDefaultSurface
  // partout (comportement inchangé). Chaque segment est TOUJOURS explicite
  // (pas de filet par segment, voir parseSegment) : en déclarer un est un
  // choix délibéré.
  if (segments !== undefined && !Array.isArray(segments)) {
    fail(`segments doit être un tableau si présent (reçu : ${JSON.stringify(segments)}).`);
  }
  const parsedSegments = (segments ?? []).map((rawSegment, index) => parseSegment(rawSegment, index, length));
  // music : optionnel, chemin vers la musique du lieu (voir
  // view/audio/city-scene.js). Simple passage : parseLevel ne connaît ni
  // Howler ni la lecture audio, juste la présence d'une chaîne.
  if (music !== undefined && !isNonEmptyString(music)) {
    fail(`music doit être une chaîne non vide si présent (reçu : ${JSON.stringify(music)}).`);
  }
  // musicDay/musicNight : optionnels, musique PAR PHASE (voir
  // core/time.js/phaseAt, view/audio/city-scene.js) — un lieu qui n'en
  // déclare qu'une (musicDay SEULE, ou aucune des deux) retombe sur `music`
  // pour la phase manquante, jamais de régression pour le contenu existant.
  // Même validation de forme que music, rien de plus ici.
  if (musicDay !== undefined && !isNonEmptyString(musicDay)) {
    fail(`musicDay doit être une chaîne non vide si présent (reçu : ${JSON.stringify(musicDay)}).`);
  }
  if (musicNight !== undefined && !isNonEmptyString(musicNight)) {
    fail(`musicNight doit être une chaîne non vide si présent (reçu : ${JSON.stringify(musicNight)}).`);
  }
  // musicLoop : optionnel, booléen — voir view/audio/city-scene.js. Bascule
  // TOUT le lieu (les deux phases) en boucle continue plutôt que
  // l'enchaînement-avec-respiration par défaut. Simple passage validé en
  // FORME, comme music/ambiences ci-dessus : le core ignore tout du SENS de
  // ce drapeau (boucle vs respiration), pure donnée de contenu.
  if (musicLoop !== undefined && typeof musicLoop !== "boolean") {
    fail(`musicLoop doit être un booléen si présent (reçu : ${JSON.stringify(musicLoop)}).`);
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
  // ambiencesDay/ambiencesNight : STRUCTURE RÉSERVÉE, même principe que
  // musicDay/musicNight ci-dessus, mais AUCUN consommateur ne les lit encore
  // (voir view/audio/city-scene.js — seule la musique réagit à la phase
  // pour l'instant, voir core/time.md). Validées en FORME dès maintenant
  // pour qu'un niveau qui les déclare échoue clairement en cas d'erreur,
  // plutôt que de découvrir une faute de frappe le jour où l'ambiance de
  // phase sera câblée.
  if (ambiencesDay !== undefined) {
    if (
      !Array.isArray(ambiencesDay) ||
      ambiencesDay.length > AMBIENCE_CHANNEL_LIMIT ||
      !ambiencesDay.every(isNonEmptyString)
    ) {
      fail(
        `ambiencesDay doit être un tableau d'au plus ${AMBIENCE_CHANNEL_LIMIT} chaînes non vides si présent (reçu : ${JSON.stringify(ambiencesDay)}).`
      );
    }
  }
  if (ambiencesNight !== undefined) {
    if (
      !Array.isArray(ambiencesNight) ||
      ambiencesNight.length > AMBIENCE_CHANNEL_LIMIT ||
      !ambiencesNight.every(isNonEmptyString)
    ) {
      fail(
        `ambiencesNight doit être un tableau d'au plus ${AMBIENCE_CHANNEL_LIMIT} chaînes non vides si présent (reçu : ${JSON.stringify(ambiencesNight)}).`
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
    floors: resolvedFloors,
    defaultSurface: resolvedDefaultSurface,
    segments: parsedSegments,
    entities: parsedEntities,
  };
  // Clés ajoutées SEULEMENT si présentes (jamais explicitement undefined) :
  // l'état doit rester de la donnée pure, un aller-retour JSON ne doit rien
  // changer à sa forme (voir movement.check.js, audit de sérialisabilité).
  if (music !== undefined) level.music = music;
  if (musicDay !== undefined) level.musicDay = musicDay;
  if (musicNight !== undefined) level.musicNight = musicNight;
  if (musicLoop !== undefined) level.musicLoop = musicLoop;
  if (ambiences !== undefined) level.ambiences = ambiences;
  if (ambiencesDay !== undefined) level.ambiencesDay = ambiencesDay;
  if (ambiencesNight !== undefined) level.ambiencesNight = ambiencesNight;
  if (reverbDurationSec !== undefined) level.reverbDurationSec = reverbDurationSec;
  if (reverbDecay !== undefined) level.reverbDecay = reverbDecay;

  return level;
}
