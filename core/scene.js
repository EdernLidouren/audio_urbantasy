// Parsing et validation d'une scène. Fonction pure : aucun accès réseau ou
// DOM, aucune chaîne affichable produite (labelKey reste une clé i18n).
// Ce fichier porte la scène et ses faces ; une entité est parsée par
// core/entity-parse.js, le format déclaratif par core/script-parse.js.
//
// AMBIENCE_CHANNEL_LIMIT vient d'une donnée neutre (zéro import), jamais de
// lib/audio.js : le core ne doit jamais importer la couche Web Audio/vue.
//
// RECTO/VERSO (voir doc/scene-format.md/"Scène à deux faces",
// core/state.js) : une scène est SIMPLE ou À DEUX FACES (recto + verso,
// jamais un seul) — voir parseFace/parseScene plus bas. Une face porte
// exactement ce que porte une scène simple (entités + habillage
// sonore/surface), jamais dupliqué entre les deux cas.

import { AMBIENCE_CHANNEL_LIMIT } from "../config/audio-channels.js";
import { BODY_RADIUS } from "./state.js";
import { SURFACE_REGISTRY, DEFAULT_SURFACE } from "./surfaces.js";
import { parseVariables } from "./variables.js";
import { validateDistribution } from "./distribution.js";
import { fail, isNonEmptyString, isFiniteNumber } from "./parse-common.js";
import { parseEntity } from "./entity-parse.js";

// Parsing TOTAL (voir header) : l'ABSENCE d'un champ de scène retombe
// toujours sur un défaut sensé, jamais une erreur — seule sa PRÉSENCE
// malformée échoue. Ces trois défauts couvrent id/titleKey/length ; les
// autres champs de scène (entities, defaultSurface, segments, indoor,
// playerStart) ont le leur plus bas. `{}` doit rester une scène
// valide et jouable : id/titre génériques, longueur minimale mais non
// nulle (traversable).
const DEFAULT_SCENE_ID = "scene";
const DEFAULT_SCENE_TITLE_KEY = "scene.default.name";
const DEFAULT_SCENE_LENGTH = 10;

// Détection de chevauchement au chargement (préventif, NON bloquant) : la
// conception des scènes évite ce cas, mais une scène mal formée doit se
// dénoncer au chargement plutôt qu'en cours de jeu — même principe de filet que
// playerStart plus bas, un console.warn clair, jamais un fail(). Une
// entité passable n'a pas de zone d'exclusion propre (voir
// core/physics/overlap.js/resolveOverlaps) : seules les paires impliquant au moins
// une entité impassable sont vérifiées.
function warnOnOverlaps(entities, playerStart) {
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    if (a.blocksMovement && Math.abs(playerStart - a.x) < BODY_RADIUS) {
      console.warn(
        `parseScene: playerStart (${playerStart}) démarre dans le corps de l'entité impassable "${a.id}" (x=${a.x}).`
      );
    }
    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      if (a.blocksMovement && b.blocksMovement && Math.abs(a.x - b.x) < 2 * BODY_RADIUS) {
        console.warn(
          `parseScene: entités impassables "${a.id}" (x=${a.x}) et "${b.id}" (x=${b.x}) se chevauchent au chargement.`
        );
      }
    }
  }
}

// Bornes [from, to] d'une portion de scène (segment, plage de collecte) :
// from < to, les deux dans [0, length].
function checkSceneSpan(from, to, length, describe) {
  if (!isFiniteNumber(from) || !isFiniteNumber(to) || from < 0 || to > length || from >= to) {
    fail(`${describe} : bornes [from, to] invalides (reçu from=${JSON.stringify(from)}, to=${JSON.stringify(to)}, longueur ${length}).`);
  }
}

// Un segment PATCHE defaultSurface sur [from, to] (bornes incluses, voir
// surfaceAt/core/surfaces.js) : from < to, les deux dans [0, length].
// TOUJOURS explicite si présent (pas de filet ici, contrairement à
// defaultSurface) : déclarer un segment est un choix délibéré, une surface
// inconnue est une vraie erreur de contenu -> échec clair, comme un type
// d'entité inconnu (voir core/entity-parse.js/parseEntity).
function parseSegment(rawSegment, index, length) {
  if (typeof rawSegment !== "object" || rawSegment === null) {
    fail(`segments[${index}] n'est pas un objet.`);
  }

  const { from, to, surface } = rawSegment;
  checkSceneSpan(from, to, length, `segments[${index}]`);
  if (!isNonEmptyString(surface) || !SURFACE_REGISTRY[surface]) {
    fail(`segments[${index}] : surface "${surface}" absente du registre de surfaces.`);
  }

  return { from, to, surface };
}

// Liste d'ambiances (ambiences, ambiencesDay, ambiencesNight) : optionnelle,
// tableau d'au plus AMBIENCE_CHANNEL_LIMIT chemins non vides — la limite
// vient de la source unique partagée avec le canal d'ambiance audio.
function checkAmbienceList(list, describe) {
  if (list === undefined) return;
  if (!Array.isArray(list) || list.length > AMBIENCE_CHANNEL_LIMIT || !list.every(isNonEmptyString)) {
    fail(`${describe} doit être un tableau d'au plus ${AMBIENCE_CHANNEL_LIMIT} chaînes non vides si présent (reçu : ${JSON.stringify(list)}).`);
  }
}

// Champs qu'une FACE porte en propre (recto/verso d'une scène à deux
// faces, OU la scène entière si elle est simple — voir parseScene) :
// entités + habillage sonore/surface de la scène. Liste PARTAGÉE entre le mode
// simple et le mode deux-faces pour détecter un mélange des deux modèles
// (voir parseScene) — jamais recopiée en dur ailleurs.
const FACE_FIELDS = [
  "entities",
  "music",
  "musicDay",
  "musicNight",
  "musicLoop",
  "ambiences",
  "ambiencesDay",
  "ambiencesNight",
  "reverbDurationSec",
  "reverbDecay",
  "defaultSurface",
  "segments",
  "indoor",
  "spawnRanges",
];

// Une PLAGE de collecte (voir core/spawn.js, doc/entity-model.md/"Collecte")
// : { from, to, count?, distribution } — bornes comme un segment (from < to,
// dans [0, length]), count entier >= 1 optionnel (défaut :
// config/spawn-values.js/SPAWN_RANGE_DEFAULT_COUNT, résolu par le moteur),
// distribution validée comme celle d'un conteneur.
function parseSpawnRange(rawRange, index, length, prefix) {
  const describe = `${prefix}spawnRanges[${index}]`;
  if (typeof rawRange !== "object" || rawRange === null) {
    fail(`${describe} n'est pas un objet.`);
  }
  const { from, to, count, distribution } = rawRange;
  checkSceneSpan(from, to, length, describe);
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
    fail(`${describe} : count doit être un entier >= 1 si présent (reçu : ${JSON.stringify(count)}).`);
  }
  validateDistribution(distribution, `${describe}.distribution`, fail);
  const range = { from, to, distribution };
  if (count !== undefined) range.count = count;
  return range;
}

// Valide et construit UNE FACE (voir header ci-dessus) : entités +
// habillage sonore/surface, exactement ce que porte une scène SIMPLE —
// factorisé pour être appelé UNE fois (scène simple, sur `raw`
// directement) ou DEUX (scène à deux faces, une fois par recto/verso, voir
// parseScene). `describe` préfixe les messages d'erreur (ex. "recto" ou
// "verso"), comme core/script-parse.js/validateCondition le fait pour ses
// propres appelants — jamais dupliqué pour rien de plus qu'un préfixe.
// `sceneVariables` : le sac de variables de portée "scene" DÉJÀ RÉSOLU par
// parseScene (racine, PARTAGÉ entre les deux faces — voir son commentaire) —
// simplement RELAYÉ jusqu'à chaque entité (voir parseEntity), jamais relu
// ici : une face ne PORTE pas son propre sac de scène.
function parseFace(raw, length, registry, describe, sceneVariables) {
  const prefix = describe ? `${describe}.` : "";
  const {
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
    defaultSurface,
    segments,
    indoor,
    spawnRanges,
  } = raw;

  // entities : ABSENT -> [] (face vide, toujours jouable) ; PRÉSENT mais pas
  // un tableau -> erreur claire.
  if (entities !== undefined && !Array.isArray(entities)) {
    fail(`${prefix}entities doit être un tableau si présent (reçu : ${JSON.stringify(entities)}).`);
  }
  const resolvedEntities = entities !== undefined ? entities : [];
  // defaultSurface : couvre tout le X non-segmenté (voir surfaceAt,
  // core/surfaces.js) — toute la face est TOUJOURS couverte, sans trou.
  // FILET SILENCIEUX si absent (repli sur DEFAULT_SURFACE, la surface
  // neutre), mais une valeur FOURNIE doit exister dans le registre -> échec
  // clair sinon (comme un type d'entité inconnu, voir parseEntity) : une
  // référence de surface erronée est un vrai bug de contenu, jamais
  // dégradée en silence.
  if (defaultSurface !== undefined && (!isNonEmptyString(defaultSurface) || !SURFACE_REGISTRY[defaultSurface])) {
    fail(`${prefix}defaultSurface ${JSON.stringify(defaultSurface)} absente du registre de surfaces.`);
  }
  const resolvedDefaultSurface = defaultSurface !== undefined ? defaultSurface : DEFAULT_SURFACE;
  // indoor : PROPRIÉTÉ DE NATURE DE SCÈNE (comme defaultSurface juste
  // au-dessus), pas un "flag ambiance météo" — aujourd'hui seul le RENDU de
  // l'ambiance météo la consulte (voir view/audio/layers.js, choix du
  // pool outdoor/indoor par état, config/weather-values.js), mais rien
  // n'empêche un futur consommateur (réverb, sons ambiants...) de la lire
  // aussi. TOUJOURS résolue en booléen (comme defaultSurface, jamais
  // `undefined` sur une face parsée) : défaut `false` (extérieur, le cas
  // courant en ville) pour toute scène qui ne la déclare pas.
  if (indoor !== undefined && typeof indoor !== "boolean") {
    fail(`${prefix}indoor doit être un booléen si présent (reçu : ${JSON.stringify(indoor)}).`);
  }
  const resolvedIndoor = indoor !== undefined ? indoor : false;
  // segments : optionnel, PATCHE defaultSurface sur des zones précises (voir
  // parseSegment) — absent -> tableau vide, toujours resolvedDefaultSurface
  // partout. Chaque segment est TOUJOURS explicite
  // (pas de filet par segment, voir parseSegment) : en déclarer un est un
  // choix délibéré.
  if (segments !== undefined && !Array.isArray(segments)) {
    fail(`${prefix}segments doit être un tableau si présent (reçu : ${JSON.stringify(segments)}).`);
  }
  const parsedSegments = (segments ?? []).map((rawSegment, index) => parseSegment(rawSegment, index, length));
  // spawnRanges : optionnel, PLAGES de collecte au sol (voir parseSpawnRange,
  // core/spawn.js) — SPARSE : absent -> aucune clé (une face sans plage
  // n'en porte pas un tableau vide), même politique que music/ambiences.
  if (spawnRanges !== undefined && !Array.isArray(spawnRanges)) {
    fail(`${prefix}spawnRanges doit être un tableau si présent (reçu : ${JSON.stringify(spawnRanges)}).`);
  }
  const parsedSpawnRanges =
    spawnRanges !== undefined ? spawnRanges.map((rawRange, index) => parseSpawnRange(rawRange, index, length, prefix)) : undefined;
  // music : optionnel, chemin vers la musique de la scène (voir
  // view/audio/layers.js). Simple passage : parseScene ne connaît ni
  // Howler ni la lecture audio, juste la présence d'une chaîne.
  if (music !== undefined && !isNonEmptyString(music)) {
    fail(`${prefix}music doit être une chaîne non vide si présent (reçu : ${JSON.stringify(music)}).`);
  }
  // musicDay/musicNight : optionnels, musique PAR PHASE (voir
  // core/time.js/phaseAt, view/audio/layers.js) — une scène qui n'en
  // déclare qu'une (musicDay SEULE, ou aucune des deux) retombe sur `music`
  // pour la phase manquante.
  // Même validation de forme que music, rien de plus ici.
  if (musicDay !== undefined && !isNonEmptyString(musicDay)) {
    fail(`${prefix}musicDay doit être une chaîne non vide si présent (reçu : ${JSON.stringify(musicDay)}).`);
  }
  if (musicNight !== undefined && !isNonEmptyString(musicNight)) {
    fail(`${prefix}musicNight doit être une chaîne non vide si présent (reçu : ${JSON.stringify(musicNight)}).`);
  }
  // musicLoop : optionnel, booléen — voir view/audio/layers.js. Bascule
  // TOUTE la face (les deux phases) en boucle continue plutôt que
  // l'enchaînement-avec-respiration par défaut. Simple passage validé en
  // FORME, comme music/ambiences ci-dessus : le core ignore tout du SENS de
  // ce drapeau (boucle vs respiration), pure donnée de contenu.
  if (musicLoop !== undefined && typeof musicLoop !== "boolean") {
    fail(`${prefix}musicLoop doit être un booléen si présent (reçu : ${JSON.stringify(musicLoop)}).`);
  }
  // ambiences : optionnel, tableau de 0 à AMBIENCE_CHANNEL_LIMIT chemins
  // (voir view/audio/layers.js, la couche "base" de lib/audio). Même
  // passage simple, juste la forme est vérifiée ici — la limite elle-même
  // vient de la source unique que view/audio/layers.js fournit à lib/audio
  // (setAmbienceLimit).
  checkAmbienceList(ambiences, `${prefix}ambiences`);
  // ambiencesDay/ambiencesNight : STRUCTURE RÉSERVÉE, même principe que
  // musicDay/musicNight ci-dessus, mais AUCUN consommateur ne les lit encore
  // (voir view/audio/layers.js — seule la musique réagit à la phase
  // pour l'instant, voir doc/time.md). Validées en FORME dès maintenant
  // pour qu'une face qui les déclare échoue clairement en cas d'erreur,
  // plutôt que de découvrir une faute de frappe le jour où l'ambiance de
  // phase sera câblée.
  checkAmbienceList(ambiencesDay, `${prefix}ambiencesDay`);
  checkAmbienceList(ambiencesNight, `${prefix}ambiencesNight`);
  // reverbDurationSec/reverbDecay : optionnels, surchargent par FACE les
  // défauts globaux du bus de réverb (config/tuning-values.js) — voir
  // view/audio/city-scene.js. Simple passage validé, comme music/ambiences ;
  // aucune logique de résolution ici (ça reste dans la vue).
  if (reverbDurationSec !== undefined && (!isFiniteNumber(reverbDurationSec) || reverbDurationSec <= 0)) {
    fail(`${prefix}reverbDurationSec doit être un nombre > 0 si présent (reçu : ${JSON.stringify(reverbDurationSec)}).`);
  }
  if (reverbDecay !== undefined && (!isFiniteNumber(reverbDecay) || reverbDecay <= 0)) {
    fail(`${prefix}reverbDecay doit être un nombre > 0 si présent (reçu : ${JSON.stringify(reverbDecay)}).`);
  }

  const seenIds = new Set();
  const parsedEntities = resolvedEntities.map((rawEntity, index) =>
    parseEntity(rawEntity, index, registry, length, seenIds, sceneVariables)
  );

  const face = {
    defaultSurface: resolvedDefaultSurface,
    segments: parsedSegments,
    entities: parsedEntities,
    indoor: resolvedIndoor,
  };
  // Clés ajoutées SEULEMENT si présentes (jamais explicitement undefined) :
  // l'état doit rester de la donnée pure, un aller-retour JSON ne doit rien
  // changer à sa forme (voir core/checks/save.check.js, audit de sérialisabilité).
  if (music !== undefined) face.music = music;
  if (musicDay !== undefined) face.musicDay = musicDay;
  if (musicNight !== undefined) face.musicNight = musicNight;
  if (musicLoop !== undefined) face.musicLoop = musicLoop;
  if (ambiences !== undefined) face.ambiences = ambiences;
  if (ambiencesDay !== undefined) face.ambiencesDay = ambiencesDay;
  if (ambiencesNight !== undefined) face.ambiencesNight = ambiencesNight;
  if (reverbDurationSec !== undefined) face.reverbDurationSec = reverbDurationSec;
  if (reverbDecay !== undefined) face.reverbDecay = reverbDecay;
  if (parsedSpawnRanges !== undefined) face.spawnRanges = parsedSpawnRanges;

  return face;
}

export function parseScene(raw, registry) {
  if (typeof raw !== "object" || raw === null) {
    fail("la scène n'est pas un objet.");
  }
  if (typeof registry !== "object" || registry === null) {
    fail("le registre de types est manquant ou invalide.");
  }

  const { id, titleKey, length, playerStart, recto, verso, variables, faceMufflingGain, faceMufflingLowpassHz } = raw;

  // id/titleKey/length : ABSENTS -> défauts génériques (DEFAULT_SCENE_*,
  // voir header) ; PRÉSENTS mais malformés -> erreur claire — la
  // distinction absence/malformation vaut ici comme pour tout autre champ
  // de scène.
  if (id !== undefined && !isNonEmptyString(id)) {
    fail(`id invalide si présent (reçu : ${JSON.stringify(id)}).`);
  }
  const resolvedId = id !== undefined ? id : DEFAULT_SCENE_ID;
  if (titleKey !== undefined && !isNonEmptyString(titleKey)) {
    fail(`titleKey invalide si présent (reçu : ${JSON.stringify(titleKey)}).`);
  }
  const resolvedTitleKey = titleKey !== undefined ? titleKey : DEFAULT_SCENE_TITLE_KEY;
  if (length !== undefined && (!isFiniteNumber(length) || length <= 0)) {
    fail(`length doit être un nombre > 0 si présent (reçu : ${JSON.stringify(length)}).`);
  }
  const resolvedLength = length !== undefined ? length : DEFAULT_SCENE_LENGTH;
  // playerStart : point d'arrivée PAR DÉFAUT de la scène. FILET, pas de rejet :
  // absent ou hors [0, length] -> repli sur 0, jamais d'exception (une scène
  // mal configurée ne doit pas empêcher d'y entrer). Des points d'arrivée
  // NOMMÉS (ex. arriver à l'entrée précise associée à la porte empruntée)
  // pourront s'ajouter plus tard, sans toucher à ce filet — pas codés ici.
  const resolvedPlayerStart =
    isFiniteNumber(playerStart) && playerStart >= 0 && playerStart <= resolvedLength ? playerStart : 0;
  if (resolvedPlayerStart !== playerStart) {
    console.warn(
      `parseScene: playerStart (${JSON.stringify(playerStart)}) absent ou hors bornes, repli sur 0.`
    );
  }

  // variables : STOCKAGE de variables de portée "scene" (voir
  // core/variables.js, doc/scripting.md/"Variables") — RACINE PARTAGÉE, comme id/titleKey/
  // length/playerStart ci-dessus, JAMAIS un champ de FACE (une scène à deux
  // faces n'a qu'UN SEUL sac de variables de scène, partagé par recto ET
  // verso — pas dans FACE_FIELDS, jamais cherché dans recto/verso). TOUJOURS
  // résolu (sac vide `{}` si absent, jamais undefined) — même politique
  // EAGER que defaultSurface/indoor plus bas (parseFace), contrairement au
  // sac SPARSE d'une entité (voir core/entity-parse.js/parseEntity) : une
  // scène a TOUJOURS un état de variables, même vide, au même titre que sa
  // surface par défaut.
  const resolvedVariables = parseVariables(variables, "variables", fail);

  // SCÈNE À DEUX FACES (voir doc/scene-format.md/"Scène à deux faces",
  // core/state.js) : recto ET verso requis ENSEMBLE (jamais un seul), et
  // AUCUN des champs de face (FACE_FIELDS) au niveau racine — une scène ne
  // mélange jamais les deux modèles, échec clair plutôt qu'une scène à
  // moitié construite. Ni recto ni verso : scène simple, `raw` EST la face
  // unique.
  const isTwoFaced = recto !== undefined || verso !== undefined;

  // faceMufflingGain / faceMufflingLowpassHz (optionnels, RACINE) :
  // étouffement de ce qui SÉPARE les deux faces (un mur épais, une simple
  // cloison...), appliqué à tout son de l'autre face. Propriété de la scène,
  // jamais d'une entité : le gain par rôle (beaconCrossFaceGain...) dose
  // ensuite chaque entité. Absents -> défauts de config/tuning-values.js
  // (résolus par la vue). Réservés aux scènes à deux faces : une scène
  // simple n'a pas d'autre face à étouffer.
  const muffling = {};
  if (faceMufflingGain !== undefined) {
    if (!isFiniteNumber(faceMufflingGain) || faceMufflingGain < 0 || faceMufflingGain > 1) {
      fail(`faceMufflingGain doit être un nombre entre 0 et 1 (reçu : ${JSON.stringify(faceMufflingGain)}).`);
    }
    muffling.faceMufflingGain = faceMufflingGain;
  }
  if (faceMufflingLowpassHz !== undefined) {
    if (!isFiniteNumber(faceMufflingLowpassHz) || faceMufflingLowpassHz <= 0) {
      fail(`faceMufflingLowpassHz doit être un nombre > 0 (reçu : ${JSON.stringify(faceMufflingLowpassHz)}).`);
    }
    muffling.faceMufflingLowpassHz = faceMufflingLowpassHz;
  }
  if (!isTwoFaced && Object.keys(muffling).length > 0) {
    fail("faceMufflingGain/faceMufflingLowpassHz sont réservés aux scènes à deux faces (recto/verso).");
  }

  if (isTwoFaced) {
    if (recto === undefined || verso === undefined) {
      fail("une scène à deux faces doit déclarer recto ET verso, jamais un seul.");
    }
    const leakedField = FACE_FIELDS.find((field) => raw[field] !== undefined);
    if (leakedField) {
      fail(`"${leakedField}" est un champ de FACE : une scène à deux faces le déclare dans recto/verso, jamais à la racine.`);
    }
    const parsedRecto = parseFace(recto, resolvedLength, registry, "recto", resolvedVariables);
    const parsedVerso = parseFace(verso, resolvedLength, registry, "verso", resolvedVariables);
    warnOnOverlaps(parsedRecto.entities, resolvedPlayerStart);
    warnOnOverlaps(parsedVerso.entities, resolvedPlayerStart);
    return {
      id: resolvedId,
      titleKey: resolvedTitleKey,
      length: resolvedLength,
      playerStart: resolvedPlayerStart,
      variables: resolvedVariables,
      ...muffling,
      recto: parsedRecto,
      verso: parsedVerso,
    };
  }

  const face = parseFace(raw, resolvedLength, registry, null, resolvedVariables);
  warnOnOverlaps(face.entities, resolvedPlayerStart);

  return {
    id: resolvedId,
    titleKey: resolvedTitleKey,
    length: resolvedLength,
    playerStart: resolvedPlayerStart,
    variables: resolvedVariables,
    ...face,
  };
}
