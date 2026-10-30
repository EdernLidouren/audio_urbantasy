// Moteur de COLLECTE (spawn de collectibles) — pur, headless. Voir
// doc/entity-model.md/"Collecte" pour le modèle complet. Quatre couches :
//   - DISTRIBUTION (quoi) : core/distribution.js.
//   - SOURCES (où) : un CONTENEUR est une entité qui porte `container:
//     { distribution, count? }` (cascade instance -> type, voir core/entity-parse.js/
//     parseEntity) ; une PLAGE est une entrée de `face.spawnRanges`
//     ({ from, to, count?, distribution }, voir core/scene.js/parseFace).
//     Même logique de garnissage dessous, seule la MATÉRIALISATION diffère :
//     un conteneur mémorise des objets cachés (`stock`), une plage pose des
//     entités ramassables au sol (`spawned: true`).
//   - CYCLE (quand) : quotidien, index de cycle dérivé de session.time
//     (spawnCycleAt). Rien ne se matérialise JAMAIS pendant que le joueur
//     est dans la scène : refillDueSpawns ne s'exécute qu'au CHARGEMENT du
//     monde actif (view/world-travel.js), et `world.spawnCycle` (dernier
//     cycle matérialisé) tient lieu de FILE — un seul marqueur, écrasé,
//     jamais une accumulation : après N cycles d'absence, UN garnissage, tiré
//     avec la distribution DU MOMENT. Un garnissage REMPLACE toujours (les
//     collectibles posés du cycle précédent, ramassés ou non, sont retirés ;
//     un stock est retiré à neuf) — jamais un cumul. Exception assumée : un
//     conteneur se re-garnit aussi PARESSEUSEMENT à la fouille si un cycle
//     est passé depuis son dernier stock — son contenu est CACHÉ (aucune
//     balise, rien de perceptible avant la fouille), alors qu'un collectible
//     de plage est VISIBLE dès qu'il existe : le poser sous les pieds du
//     joueur ferait "popper" une balise sans cause audible — d'où l'attente
//     du chargement pour les plages seulement, voir searchContainer.
//   Le même garnissage recharge les POINTS DE VENTE (core/catalog.js) et
//   tire l'article du jour de chaque PRÉSENTOIR (core/display.js, sans
//   remise sur tout le monde, voir refillDueSpawns).
//   - MATÉRIALISATION (comment) : fouille (searchContainer, action "search"
//     côté vue) -> le stock TOMBE AU SOL, éparpillé autour du conteneur
//     (spawnScatteredEphemerals, MÊME geste que la caisse qui lâche des
//     pièces) ; ramassage ensuite via l'action "pickup" EXISTANTE portée par
//     chaque entité posée (plage ou fouille).
// FOUILLABILITÉ (containerStatus / isSearchable) : un conteneur est
// "searchable" (garni, ou un garnissage paresseux est dû), "searchedToday"
// (vidé, se regarnira au prochain cycle) ou "depleted" (vidé pour de bon :
// `container.regenerates: false`, stock tiré UNE SEULE fois, jamais
// regarni). Vidé, il reste présent, audible, observable (l'arbre reste un
// arbre) ; la vue ne le propose plus à Entrée que s'il est le SEUL candidat,
// pour annoncer son état (voir view/occupancy.js/
// getInteractionCandidates).
// Un tirage peut ne RIEN donner (clé `nothing` d'une table, voir
// core/distribution.js) : un stock peut donc être vide, une plage poser
// moins de `count` objets.
// Déterministe : tous les tirages consomment le PRNG de la FACE
// (face.rngState, comme spawnScatteredEphemerals) — même seed + même cycle
// -> même contenu. Persistant : stock/stockCycle/spawned/spawnCycle sont
// des champs plats sérialisés avec la partie (voir core/save.js).
//
// `registry` est INJECTÉ (comme pour core/scene.js/parseScene), jamais
// importé : le core ne connaît aucun registre de contenu.

import { SPAWN_CYCLE_HOUR, SPAWN_RANGE_DEFAULT_COUNT, SPAWN_CONTAINER_DEFAULT_COUNT } from "../config/spawn-values.js";
import { TIME_CONFIG } from "../config/time-values.js";
import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { drawItem } from "./distribution.js";
import { restockShopEntity } from "./catalog.js";
import { drawOffer, unavailableArticles } from "./display.js";
import {
  isTwoSided,
  resolveFace,
  withFace,
  withActiveWorld,
  updateActiveFace,
  drawScatteredPosition,
  spawnScatteredEphemerals,
} from "./state.js";
import { parseSpawnedEntity, GENERIC_ITEM_TYPE } from "./entity-parse.js";
import { MINUTES_PER_DAY } from "./time.js";
import { presenceContextOf } from "./presence.js";

// Tentatives pour trouver une position respectant l'espacement minimal
// (voir drawRangePosition) — plafond, jamais une boucle sans fin.
const SPACING_MAX_ATTEMPTS = 8;


// Index du cycle de collecte courant : nombre de re-garnissages quotidiens
// (à SPAWN_CYCLE_HOUR) écoulés depuis l'origine du temps. Peut être négatif
// si l'heure de départ précède SPAWN_CYCLE_HOUR le jour 1 — sans importance,
// seule l'ÉGALITÉ avec un cycle mémorisé compte.
export function spawnCycleAt(time) {
  return Math.floor((Math.floor(time) - SPAWN_CYCLE_HOUR * TIME_CONFIG.minutesPerHour) / MINUTES_PER_DAY);
}

// Vrai si le conteneur doit (re)tirer son stock au cycle `cycle` : jamais
// garni (stockCycle absent), ou garni à un cycle passé ET régénérant. Un
// conteneur `regenerates: false` ne tire qu'une fois.
function isRestockDue(entity, cycle) {
  if (entity.stockCycle === undefined) return true;
  return entity.container.regenerates !== false && entity.stockCycle !== cycle;
}

// État d'un conteneur de collecte au temps donné (null pour une entité sans
// `container`) :
//   - "searchable" : garni, OU un garnissage paresseux est dû (voir
//     searchContainer) ;
//   - "searchedToday" : vidé, se regarnira au prochain cycle ;
//   - "depleted" : vidé, ne se regarnira jamais (regenerates: false).
// Lu par la vue : candidats à "activate" (view/occupancy.js/
// getInteractionCandidates) et annonce de la fouille (view/action-execution.js/
// handleSearch).
export function containerStatus(entity, time) {
  if (!entity.container) return null;
  if (isRestockDue(entity, spawnCycleAt(time))) return "searchable";
  // Un stock, même VIDE (tous les tirages tombés sur "nothing"), n'a pas
  // encore été fouillé : la fouille annoncera qu'elle ne trouve rien. Seule
  // la fouille note stock:null.
  if (Array.isArray(entity.stock)) return "searchable";
  return entity.container.regenerates === false ? "depleted" : "searchedToday";
}

// Raccourci : le conteneur a-t-il quelque chose à fouiller ? Faux pour
// toute entité sans `container`.
export function isSearchable(entity, time) {
  return containerStatus(entity, time) === "searchable";
}

// Sources garnies au cycle : plages, conteneurs, points de vente (leur
// rayon se recharge au même point temporel, voir core/catalog.js) ET
// présentoirs (core/display.js).
function faceHasSources(face) {
  return (face.spawnRanges !== undefined && face.spawnRanges.length > 0) || face.entities.some((e) => e.container || e.shop || e.display);
}

// Tire `count` objets dans une distribution, en enchaînant le PRNG. Les
// tirages "rien" (item null) sont écartés : `items` peut compter moins de
// `count` objets, voire aucun — `count` tirages sont consommés quoi qu'il
// arrive. Distribution `null` (neutralisée à la relecture d'une
// sauvegarde, voir core/save.js/repairContentReferences) : rien.
function drawItems(distribution, count, rngState) {
  if (distribution === null) return { items: [], rngState };
  const items = [];
  let state = rngState;
  for (let i = 0; i < count; i++) {
    const draw = drawItem(distribution, state);
    if (draw.item !== null) items.push(draw.item);
    state = draw.rngState;
  }
  return { items, rngState: state };
}

// Entité brute (avant parsing) d'un objet du sac posé au sol, sans id ni x.
// Avec un archétype du même nom : cet archétype, `count` remplaçant celui de
// son action s'il est donné. Sinon : le type générique "item", dont le nom,
// la description et les sons sont repris de l'objet par parseEntity
// (core/entity-parse.js/genericItemDefaults).
function collectibleRaw(item, registry, count) {
  if (registry[item]) {
    return count === undefined ? { type: item } : { type: item, action: { ...registry[item].action, count } };
  }
  return { type: GENERIC_ITEM_TYPE, action: { kind: "pickup", item, count: count ?? 1 } };
}

// Descripteur d'entité ramassable pour un objet du sac : passe par le MÊME
// parseur qu'une instance de scène (cascade sounds/capacités/action de
// l'archétype). Sert aux deux matérialisations : posé PERSISTANT par une
// plage (marqué `spawned` par l'appelant), ou ÉPHÉMÈRE lâché par une fouille
// (spawnEphemeral repose id/x/ephemeral lui-même).
function buildCollectibleSpec(item, id, x, registry, length, sceneVariables) {
  return parseSpawnedEntity({ id, x, ...collectibleRaw(item, registry) }, registry, length, sceneVariables);
}

// --- Descripteurs d'entités ÉPHÉMÈRES demandées par la vue ---
// (voir core/state.js/spawnEphemeral, doc/entity-model.md/"Entités
// éphémères"). Même parseur que tout le reste, validé contre le monde actif.
// L'id et le x donnés ici sont provisoires : spawnEphemeral les remplace.
const EPHEMERAL_SPEC_ID = "ephemeral-spec";

function parseEphemeralSpec(session, raw, registry) {
  const world = session.worlds[session.activeWorldId];
  return parseSpawnedEntity({ id: EPHEMERAL_SPEC_ID, x: 0, ...raw }, registry, world.length, world.variables);
}

// Un archétype tel quel, ex. une pièce. `amount` / `count` remplacent ce
// seul champ de son action (jamais de fusion profonde), ex. une pièce de 20
// au lieu des 5 par défaut (loot éparpillé, voir doc/scripting.md).
export function ephemeralArchetypeSpec(session, type, registry, { amount, count } = {}) {
  let action = registry[type] && registry[type].action;
  if (amount !== undefined) action = { ...action, amount };
  if (count !== undefined) action = { ...action, count };
  return parseEphemeralSpec(session, action === undefined ? { type } : { type, action }, registry);
}

// Un objet du SAC posé au sol ("Poser", voir view/menus/inventory-menu.js) :
// même résolution qu'un objet de plage ou de fouille (voir collectibleRaw).
export function ephemeralItemSpec(session, item, count, registry) {
  return parseEphemeralSpec(session, collectibleRaw(item, registry, count), registry);
}

// Position dans [from, to] : drawScatteredPosition (bornes carte + corps
// bloquants) autour du centre de la plage, RE-TIRÉE si trop proche d'un
// collectible déjà posé dans ce garnissage (spawnMinSpacing) — filet : le
// dernier candidat, jamais un refus.
function drawRangePosition(range, obstacles, placed, length, presenceContext, rngState) {
  const center = (range.from + range.to) / 2;
  const spread = (range.to - range.from) / 2;
  const minSpacing = TUNING_DEFAULTS.spawnMinSpacing;
  let state = rngState;
  let candidate = center;
  for (let attempt = 0; attempt < SPACING_MAX_ATTEMPTS; attempt++) {
    const draw = drawScatteredPosition(center, spread, length, obstacles, presenceContext, state);
    state = draw.rngState;
    candidate = draw.x;
    if (placed.every((x) => Math.abs(x - candidate) >= minSpacing)) break;
  }
  return { x: candidate, rngState: state };
}

// Garnit UNE face pour le cycle donné : conteneurs re-stockés (sauf un
// conteneur non régénérant déjà garni une fois, laissé tel quel), article du
// jour tiré pour chaque présentoir, anciens collectibles posés retirés puis
// remplacés. Tirages enchaînés sur face.rngState, dans l'ordre des entités
// puis des plages — ordre stable, déterminisme préservé. `offered` : Set
// LOCAL au garnissage du monde (voir refillDueSpawns), complété ici par
// chaque article exposé, pour qu'aucun présentoir suivant ne le retire.
function refillFace(face, world, cycle, registry, companions, presenceContext, offered) {
  let rngState = face.rngState;
  const entities = [];
  for (const entity of face.entities) {
    if (entity.spawned) continue;
    if (entity.shop) {
      entities.push(restockShopEntity(entity, cycle));
      continue;
    }
    // Présentoir : toujours re-tiré (l'invendu de la veille ne reste pas),
    // emplacement vidé par un achat compris.
    if (entity.display) {
      const drawn = drawOffer(entity.display.distribution, offered, rngState);
      rngState = drawn.rngState;
      if (drawn.offer !== null) offered.add(drawn.offer);
      entities.push({ ...entity, offer: drawn.offer });
      continue;
    }
    if (!entity.container || !isRestockDue(entity, cycle)) {
      entities.push(entity);
      continue;
    }
    const drawn = drawItems(entity.container.distribution, entity.container.count ?? SPAWN_CONTAINER_DEFAULT_COUNT, rngState);
    rngState = drawn.rngState;
    entities.push({ ...entity, stock: drawn.items, stockCycle: cycle });
  }

  (face.spawnRanges ?? []).forEach((range, rangeIndex) => {
    // Distribution neutralisée (voir drawItems) : la plage ne pose rien.
    if (range.distribution === null) return;
    const count = range.count ?? SPAWN_RANGE_DEFAULT_COUNT;
    const placed = [];
    for (let i = 0; i < count; i++) {
      const draw = drawItem(range.distribution, rngState);
      // Tirage "rien" : aucun objet posé à cette place, le tirage reste
      // consommé (les ids suivants gardent leur index).
      if (draw.item === null) {
        rngState = draw.rngState;
        continue;
      }
      const obstacles = [...entities, ...companions];
      const position = drawRangePosition(range, obstacles, placed, world.length, presenceContext, draw.rngState);
      rngState = position.rngState;
      placed.push(position.x);
      const spec = buildCollectibleSpec(draw.item, `spawn-${cycle}-${rangeIndex}-${i}`, position.x, registry, world.length, world.variables);
      entities.push({ ...spec, spawned: true });
    }
  });

  return { ...face, entities, rngState };
}

// Garnit le monde ACTIF si un cycle est dû (world.spawnCycle absent ou
// différent du cycle courant) — appelé à CHAQUE chargement du monde actif
// (voir view/world-travel.js), idempotent : rien à faire -> RÉFÉRENCE
// INCHANGÉE (cycle déjà matérialisé, ou monde sans aucune source). Scène à
// deux faces : LES DEUX faces sont garnies (on charge le monde entier),
// chacune sur son propre flux PRNG ; le marqueur reste au niveau du monde.
// Les présentoirs du monde entier (deux faces comprises) tirent SANS REMISE
// : jamais deux fois le même article dans un magasin, jamais un article
// indisponible — amélioration déjà possédée, condition d'apparition fausse
// (core/display.js).
export function refillDueSpawns(session, registry) {
  const world = session.worlds[session.activeWorldId];
  const cycle = spawnCycleAt(session.time);
  if (world.spawnCycle === cycle) return session;

  const faces = isTwoSided(world) ? ["recto", "verso"] : [null];
  if (!faces.some((side) => faceHasSources(resolveFace(world, side)))) return session;

  const presenceContext = presenceContextOf(session);
  const offered = unavailableArticles(session);
  let nextWorld = world;
  for (const side of faces) {
    const face = resolveFace(world, side);
    const companions = side === null || side === session.player.side ? session.companions : [];
    const refilled = refillFace(face, world, cycle, registry, companions, presenceContext, offered);
    nextWorld = withFace(nextWorld, side, { entities: refilled.entities, rngState: refilled.rngState });
  }
  return withActiveWorld(session, { ...nextWorld, spawnCycle: cycle });
}

// Effet "fouiller" (action "search", voir view/interaction.js) sur un
// conteneur de la FACE ACTIVE : son stock TOMBE AU SOL — une entité
// ÉPHÉMÈRE par objet, éparpillée autour du conteneur
// (core/state.js/spawnScatteredEphemerals, une par objet pour que chacune
// porte SON spec), à ramasser ensuite ou à laisser. Rend
// `{ session, items, status }` :
//   - `status` : l'état du conteneur AVANT la fouille (containerStatus) —
//     "searchable" si la fouille a eu lieu ; "searchedToday" / "depleted"
//     si le conteneur était déjà vidé (session inchangée) ; null si l'id
//     n'est pas un conteneur de la face active (session inchangée) ;
//   - `items` : les objets tombés — vide si rien n'a été fouillé, ou si la
//     fouille n'a rien donné (tirages "nothing").
// Stock tiré PARESSEUSEMENT si un garnissage est dû (voir header et
// isRestockDue). Le conteneur note stock:null pour le cycle courant : plus
// fouillable jusqu'au cycle suivant (ou plus jamais, s'il ne se régénère
// pas).
export function searchContainer(session, entityId, registry) {
  const world = session.worlds[session.activeWorldId];
  const side = session.player.side;
  const face = resolveFace(world, side);
  const index = face.entities.findIndex((e) => e.id === entityId);
  const entity = face.entities[index];
  const status = entity ? containerStatus(entity, session.time) : null;
  if (status !== "searchable") return { session, items: [], status };

  const cycle = spawnCycleAt(session.time);
  let rngState = face.rngState;
  let stock = entity.stock;
  if (isRestockDue(entity, cycle)) {
    const drawn = drawItems(entity.container.distribution, entity.container.count ?? SPAWN_CONTAINER_DEFAULT_COUNT, rngState);
    rngState = drawn.rngState;
    stock = drawn.items;
  }

  const searched = { ...entity, stock: null, stockCycle: cycle };
  const entities = face.entities.map((e, i) => (i === index ? searched : e));
  let nextSession = updateActiveFace(session, { entities, rngState }, side);
  for (const item of stock) {
    const spec = buildCollectibleSpec(item, `${entityId}-drop`, entity.x, registry, world.length, world.variables);
    nextSession = spawnScatteredEphemerals(nextSession, spec, entity.x, 1, TUNING_DEFAULTS.searchScatterSpread);
  }
  return { session: nextSession, items: stock, status };
}
