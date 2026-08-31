// Parsing et validation d'un niveau. Fonction pure : aucun accès réseau ou
// DOM, aucune chaîne affichable produite (labelKey reste une clé i18n).
// Testable en Node/console sans navigateur : voir le bas du fichier pour un
// exemple d'invocation manuelle.
//
// AMBIENCE_CHANNEL_LIMIT vient d'une donnée neutre (zéro import), jamais de
// lib/audio.js : le core ne doit jamais importer la couche Web Audio/vue.
//
// RECTO/VERSO (modèle B, voir CLAUDE.md, core/state.js) : une scène est
// SIMPLE (comme avant ce modèle) ou À DEUX FACES (recto + verso, jamais un
// seul) — voir parseFace/parseLevel plus bas. Une face porte exactement ce
// qu'une scène simple portait déjà (entités + habillage sonore/surface),
// jamais dupliqué entre les deux cas.

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
    // behavior: null -> RETRAIT explicite du comportement actif (voir
    // core/scripting.md, "Effets"/"behavior") : l'entité redevient immobile,
    // comme si elle n'en avait jamais eu — SEULE valeur acceptée en dehors
    // d'un objet behavior valide (jamais `undefined`, qui signifierait
    // "aucun effet à ce champ", pas "retire-le" ; core/presence.js/
    // resolveEntityRules distingue les deux). Nécessaire pour qu'un cycle de
    // routine "goto" reste réenclenchable : sans repasser par un `kind`
    // différent de "goto" (ou par ce retrait), `entity.gotoArrived` — jamais
    // remis à faux ailleurs — laisserait la condition "arrived" bloquée à
    // vrai pour toujours après la première arrivée.
    if (rawEffect.behavior === null) {
      return { type: "behavior", behavior: null };
    }
    return { type: "behavior", behavior: parseBehavior(rawEffect.behavior, index, id) };
  }
  fail(`entities[${index}] ("${id}") : presence[${ruleIndex}].effects[${effectIndex}].type "${type}" inconnu.`);
}

// Valide un objet CONDITION ({ type, ... }) — RÉUTILISÉ par presence[].when
// (voir parsePresenceRule) ET action.condition (voir parseEntity, actions
// CONDITIONNELLES) : MÊME forme déclarative, MÊME registre (CONDITION_TYPES),
// MÊME validation — une condition ne sait pas d'où elle est appelée, jamais
// dupliquée entre les deux. `describe` : préfixe du message d'erreur (ex.
// `presence[0].when` ou `action.condition`), pour situer l'échec sans
// dupliquer cette fonction par appelant.
function validateCondition(cond, describe) {
  if (typeof cond !== "object" || cond === null || !isNonEmptyString(cond.type)) {
    fail(`${describe} doit être un objet avec un type.`);
  }
  if (!CONDITION_TYPES.includes(cond.type)) {
    fail(`${describe}.type "${cond.type}" absent du registre de conditions.`);
  }
  // "hasEquipmentTag" : EN PLUS de son type (déjà validé ci-dessus), son
  // champ `tag` référence un tag de contenu (core/tags.js/TAG_REGISTRY) —
  // même traitement qu'une surface de segment (voir parseSegment plus bas) :
  // une faute de frappe ici échouerait SILENCIEUSEMENT à l'évaluation
  // (core/presence.js/evaluateHasEquipmentTag replie sur false pour un tag
  // absent), donc elle est refusée ICI, au chargement, plutôt que de laisser
  // une règle de contenu ne jamais se déclencher sans qu'on sache pourquoi.
  if (cond.type === "hasEquipmentTag" && (!isNonEmptyString(cond.tag) || !TAG_REGISTRY[cond.tag])) {
    fail(`${describe}.tag "${cond.tag}" absent du registre de tags.`);
  }
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
  validateCondition(when, `entities[${index}] ("${id}") : presence[${ruleIndex}].when`);

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
    isFlying,
    speed,
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
  // isFlying : même cascade/même défaut (false) que observable/interactable
  // ci-dessus — marqueur PUR, aucune logique ici ni ailleurs dans le core
  // (pas d'axe Y, pas de position verticale). Lu UNIQUEMENT par la vue
  // (view/audio/city-scene.js) pour déclencher une chaîne de filtres qui
  // SUGGÈRE la hauteur — voir config/tuning-values.js/flyingHighpassHz et
  // consorts, entities/model.md.
  if (isFlying !== undefined && typeof isFlying !== "boolean") {
    fail(`entities[${index}] ("${id}") : isFlying doit être un booléen si présent.`);
  }
  const resolvedIsFlying = isFlying !== undefined ? isFlying : Boolean(registry[type].isFlying);
  // speed : même cascade instance -> type que isFlying ci-dessus, défaut `1`
  // (jamais `false`/`0` — une vitesse nulle immobiliserait un mobile à
  // intention sans le distinguer d'une entité VRAIMENT sans comportement).
  // Facteur MULTIPLICATIF de MOVE_STEP, consommé par la PHYSIQUE de
  // résolution (core/physics/collision.js/resolveBodyMove), JAMAIS par un
  // comportement (wander/follow/goto) : ceux-ci ne produisent toujours
  // qu'une intention de direction, ignorant tout de la vitesse — c'est
  // core/reduce.js qui lit CE champ pour résoudre le déplacement voulu de
  // chaque mobile à intention. Baké ici (pas relu dans le registre par
  // core/reduce.js) pour la même raison que blocksMovement/isFlying : le
  // core ne connaît le registre qu'à travers ce que parseLevel en extrait.
  // Cadence de pas INCHANGÉE par ailleurs (view/audio/city-scene.js/
  // stepWalker) : elle dérive déjà de la distance parcourue, donc un mobile
  // deux fois plus lent voit SES PAS s'espacer deux fois plus, sans le
  // moindre réglage de cadence séparé à toucher.
  if (speed !== undefined && (!isFiniteNumber(speed) || speed <= 0)) {
    fail(`entities[${index}] ("${id}") : speed doit être un nombre > 0 si présent.`);
  }
  const resolvedSpeed = speed !== undefined ? speed : registry[type].speed !== undefined ? registry[type].speed : 1;
  const entity = {
    id,
    type,
    x,
    labelKey,
    blocksMovement: resolvedBlocksMovement,
    observable: resolvedObservable,
    interactable: resolvedInteractable,
    isFlying: resolvedIsFlying,
    speed: resolvedSpeed,
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
  //
  // action.condition (optionnel, ACTIONS CONDITIONNELLES) : MÊME objet
  // déclaratif que presence[].when, MÊME registre (CONDITION_TYPES),
  // GÉNÉRIQUE à TOUT kind (transit, pickup, loot...) — validé ICI via
  // validateCondition, exactement comme une condition de présence. Contexte
  // d'évaluation et EFFET (bloquer l'action, annoncer refusalKey) restent
  // entièrement côté vue (voir view/interaction.js) : le core ne fait que
  // transporter et valider la FORME, comme pour `kind`. refusalKey (clé
  // i18n du message de refus) est REQUISE quand condition est présente —
  // une condition sans refus laisserait l'action échouer en silence, ce que
  // ce système est justement censé éviter (voir entities/model.md).
  const resolvedAction = action !== undefined ? action : registry[type].action;
  if (resolvedAction !== undefined) {
    if (typeof resolvedAction !== "object" || resolvedAction === null || Array.isArray(resolvedAction)) {
      fail(`entities[${index}] ("${id}") : action doit être un objet si présent.`);
    }
    if (!isNonEmptyString(resolvedAction.kind)) {
      fail(`entities[${index}] ("${id}") : action.kind doit être une chaîne non vide.`);
    }
    if (resolvedAction.condition !== undefined) {
      validateCondition(resolvedAction.condition, `entities[${index}] ("${id}") : action.condition`);
      if (!isNonEmptyString(resolvedAction.refusalKey)) {
        fail(`entities[${index}] ("${id}") : action.refusalKey doit être une chaîne non vide quand action.condition est présente.`);
      }
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

// Champs qu'une FACE porte en propre (recto/verso d'une scène à deux
// faces, OU la scène entière si elle est simple — voir parseLevel) :
// entités + habillage sonore/surface du lieu. Liste PARTAGÉE entre le mode
// simple et le mode deux-faces pour détecter un mélange des deux modèles
// (voir parseLevel) — jamais recopiée en dur ailleurs.
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
];

// Valide et construit UNE FACE (voir header ci-dessus) : entités +
// habillage sonore/surface, exactement ce qu'une scène SIMPLE portait déjà
// avant l'introduction du modèle à deux faces (voir CLAUDE.md/
// "RECTO/VERSO") — factorisé pour être appelé UNE fois (scène simple, sur
// `raw` directement) ou DEUX (scène à deux faces, une fois par
// recto/verso, voir parseLevel). `describe` préfixe les messages d'erreur
// (ex. "recto" ou "verso"), comme validateCondition le fait déjà pour ses
// propres appelants — jamais dupliqué pour rien de plus qu'un préfixe.
function parseFace(raw, length, registry, describe) {
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
  } = raw;

  if (!Array.isArray(entities)) {
    fail(`${prefix}entities doit être un tableau (reçu : ${JSON.stringify(entities)}).`);
  }
  // defaultSurface : couvre tout le X non-segmenté (voir surfaceAt,
  // core/surfaces.js) — toute la face est TOUJOURS couverte, sans trou.
  // FILET SILENCIEUX si absent (repli sur DEFAULT_SURFACE, comportement
  // audible inchangé pour toute scène existante qui n'en déclare pas
  // encore), mais une valeur FOURNIE doit exister dans le registre -> échec
  // clair sinon (comme un type d'entité inconnu, voir parseEntity) : une
  // référence de surface erronée est un vrai bug de contenu, jamais
  // dégradée en silence.
  if (defaultSurface !== undefined && (!isNonEmptyString(defaultSurface) || !SURFACE_REGISTRY[defaultSurface])) {
    fail(`${prefix}defaultSurface "${JSON.stringify(defaultSurface)}" absente du registre de surfaces.`);
  }
  const resolvedDefaultSurface = defaultSurface !== undefined ? defaultSurface : DEFAULT_SURFACE;
  // segments : optionnel, PATCHE defaultSurface sur des zones précises (voir
  // parseSegment) — absent -> tableau vide, toujours resolvedDefaultSurface
  // partout (comportement inchangé). Chaque segment est TOUJOURS explicite
  // (pas de filet par segment, voir parseSegment) : en déclarer un est un
  // choix délibéré.
  if (segments !== undefined && !Array.isArray(segments)) {
    fail(`${prefix}segments doit être un tableau si présent (reçu : ${JSON.stringify(segments)}).`);
  }
  const parsedSegments = (segments ?? []).map((rawSegment, index) => parseSegment(rawSegment, index, length));
  // music : optionnel, chemin vers la musique du lieu (voir
  // view/audio/city-scene.js). Simple passage : parseLevel ne connaît ni
  // Howler ni la lecture audio, juste la présence d'une chaîne.
  if (music !== undefined && !isNonEmptyString(music)) {
    fail(`${prefix}music doit être une chaîne non vide si présent (reçu : ${JSON.stringify(music)}).`);
  }
  // musicDay/musicNight : optionnels, musique PAR PHASE (voir
  // core/time.js/phaseAt, view/audio/city-scene.js) — un lieu qui n'en
  // déclare qu'une (musicDay SEULE, ou aucune des deux) retombe sur `music`
  // pour la phase manquante, jamais de régression pour le contenu existant.
  // Même validation de forme que music, rien de plus ici.
  if (musicDay !== undefined && !isNonEmptyString(musicDay)) {
    fail(`${prefix}musicDay doit être une chaîne non vide si présent (reçu : ${JSON.stringify(musicDay)}).`);
  }
  if (musicNight !== undefined && !isNonEmptyString(musicNight)) {
    fail(`${prefix}musicNight doit être une chaîne non vide si présent (reçu : ${JSON.stringify(musicNight)}).`);
  }
  // musicLoop : optionnel, booléen — voir view/audio/city-scene.js. Bascule
  // TOUTE la face (les deux phases) en boucle continue plutôt que
  // l'enchaînement-avec-respiration par défaut. Simple passage validé en
  // FORME, comme music/ambiences ci-dessus : le core ignore tout du SENS de
  // ce drapeau (boucle vs respiration), pure donnée de contenu.
  if (musicLoop !== undefined && typeof musicLoop !== "boolean") {
    fail(`${prefix}musicLoop doit être un booléen si présent (reçu : ${JSON.stringify(musicLoop)}).`);
  }
  // ambiences : optionnel, tableau de 0 à AMBIENCE_CHANNEL_LIMIT chemins
  // (voir view/audio/city-scene.js, lib/audio.js playAmbiences). Même
  // passage simple, juste la forme est vérifiée ici — la limite elle-même
  // vient de la source unique partagée avec lib/audio.js.
  if (ambiences !== undefined) {
    if (!Array.isArray(ambiences) || ambiences.length > AMBIENCE_CHANNEL_LIMIT || !ambiences.every(isNonEmptyString)) {
      fail(
        `${prefix}ambiences doit être un tableau d'au plus ${AMBIENCE_CHANNEL_LIMIT} chaînes non vides si présent (reçu : ${JSON.stringify(ambiences)}).`
      );
    }
  }
  // ambiencesDay/ambiencesNight : STRUCTURE RÉSERVÉE, même principe que
  // musicDay/musicNight ci-dessus, mais AUCUN consommateur ne les lit encore
  // (voir view/audio/city-scene.js — seule la musique réagit à la phase
  // pour l'instant, voir core/time.md). Validées en FORME dès maintenant
  // pour qu'une face qui les déclare échoue clairement en cas d'erreur,
  // plutôt que de découvrir une faute de frappe le jour où l'ambiance de
  // phase sera câblée.
  if (ambiencesDay !== undefined) {
    if (
      !Array.isArray(ambiencesDay) ||
      ambiencesDay.length > AMBIENCE_CHANNEL_LIMIT ||
      !ambiencesDay.every(isNonEmptyString)
    ) {
      fail(
        `${prefix}ambiencesDay doit être un tableau d'au plus ${AMBIENCE_CHANNEL_LIMIT} chaînes non vides si présent (reçu : ${JSON.stringify(ambiencesDay)}).`
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
        `${prefix}ambiencesNight doit être un tableau d'au plus ${AMBIENCE_CHANNEL_LIMIT} chaînes non vides si présent (reçu : ${JSON.stringify(ambiencesNight)}).`
      );
    }
  }
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
  const parsedEntities = entities.map((rawEntity, index) =>
    parseEntity(rawEntity, index, registry, length, seenIds)
  );

  const face = {
    defaultSurface: resolvedDefaultSurface,
    segments: parsedSegments,
    entities: parsedEntities,
  };
  // Clés ajoutées SEULEMENT si présentes (jamais explicitement undefined) :
  // l'état doit rester de la donnée pure, un aller-retour JSON ne doit rien
  // changer à sa forme (voir movement.check.js, audit de sérialisabilité).
  if (music !== undefined) face.music = music;
  if (musicDay !== undefined) face.musicDay = musicDay;
  if (musicNight !== undefined) face.musicNight = musicNight;
  if (musicLoop !== undefined) face.musicLoop = musicLoop;
  if (ambiences !== undefined) face.ambiences = ambiences;
  if (ambiencesDay !== undefined) face.ambiencesDay = ambiencesDay;
  if (ambiencesNight !== undefined) face.ambiencesNight = ambiencesNight;
  if (reverbDurationSec !== undefined) face.reverbDurationSec = reverbDurationSec;
  if (reverbDecay !== undefined) face.reverbDecay = reverbDecay;

  return face;
}

export function parseLevel(raw, registry) {
  if (typeof raw !== "object" || raw === null) {
    fail("le niveau n'est pas un objet.");
  }
  if (typeof registry !== "object" || registry === null) {
    fail("le registre de types est manquant ou invalide.");
  }

  const { id, titleKey, length, playerStart, recto, verso } = raw;

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

  // SCÈNE À DEUX FACES (modèle B, voir CLAUDE.md/"RECTO/VERSO",
  // core/state.js) : recto ET verso requis ENSEMBLE (jamais un seul), et
  // AUCUN des champs de face (FACE_FIELDS) au niveau racine — un niveau ne
  // mélange jamais les deux modèles, échec clair plutôt qu'une scène à
  // moitié construite. RÉTROCOMPAT STRICTE sinon : ni recto ni verso ->
  // exactement le comportement d'avant ce modèle, `raw` EST la face unique.
  const isTwoFaced = recto !== undefined || verso !== undefined;
  if (isTwoFaced) {
    if (recto === undefined || verso === undefined) {
      fail("une scène à deux faces doit déclarer recto ET verso, jamais un seul.");
    }
    const leakedField = FACE_FIELDS.find((field) => raw[field] !== undefined);
    if (leakedField) {
      fail(`"${leakedField}" est un champ de FACE : une scène à deux faces le déclare dans recto/verso, jamais à la racine.`);
    }
    const parsedRecto = parseFace(recto, length, registry, "recto");
    const parsedVerso = parseFace(verso, length, registry, "verso");
    warnOnOverlaps(parsedRecto.entities, resolvedPlayerStart);
    warnOnOverlaps(parsedVerso.entities, resolvedPlayerStart);
    return {
      id,
      titleKey,
      length,
      playerStart: resolvedPlayerStart,
      recto: parsedRecto,
      verso: parsedVerso,
    };
  }

  const face = parseFace(raw, length, registry, null);
  warnOnOverlaps(face.entities, resolvedPlayerStart);

  return {
    id,
    titleKey,
    length,
    playerStart: resolvedPlayerStart,
    ...face,
  };
}
