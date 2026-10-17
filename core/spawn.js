// Moteur de COLLECTE (spawn de collectibles) — pur, headless. Voir
// doc/entity-model.md/"Collecte" pour le modèle complet. Quatre couches :
//   - DISTRIBUTION (quoi) : core/distribution.js.
//   - SOURCES (où) : un CONTENEUR est une entité qui porte `container:
//     { distribution, count? }` (cascade instance -> type, voir core/scene.js/
//     parseEntity) ; une PLAGE est une entrée de `face.spawnRanges`
//     ({ from, to, count?, distribution }, voir core/scene.js/parseFace).
//     Même logique de garnissage dessous, seule la MATÉRIALISATION diffère :
//     un conteneur mémorise des objets cachés (`stock`), une plage pose des
//     entités ramassables au sol (`spawned: true`).
//   - CYCLE (quand) : quotidien, index de cycle dérivé de session.time
//     (spawnCycleAt). Rien ne se matérialise JAMAIS pendant que le joueur
//     est dans la scène : refillDueSpawns ne s'exécute qu'au CHARGEMENT du
//     monde actif (view/city-screen.js), et `world.spawnCycle` (dernier
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
//   - MATÉRIALISATION (comment) : fouille (searchContainer, action "search"
//     côté vue) -> le stock TOMBE AU SOL, éparpillé autour du conteneur
//     (spawnScatteredEphemerals, MÊME geste que la caisse qui lâche des
//     pièces) ; ramassage ensuite via l'action "pickup" EXISTANTE portée par
//     chaque entité posée (plage ou fouille).
// FOUILLABILITÉ (isSearchable) : un conteneur n'est candidat à "search"
// (Entrée) QUE garni ; vidé, l'action s'éteint SEULE — présence,
// beacon, observabilité restent intactes (l'arbre reste un arbre).
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
import { ITEM_REGISTRY } from "./items.js";
import { drawItem } from "./distribution.js";
import { restockShopEntity } from "./catalog.js";
import { isTwoSided, resolveFace, withFace, drawScatteredPosition, spawnScatteredEphemerals } from "./state.js";
import { parseSpawnedEntity } from "./scene.js";

const MINUTES_PER_DAY = TIME_CONFIG.minutesPerHour * TIME_CONFIG.hoursPerDay;

// Tentatives pour trouver une position respectant l'espacement minimal
// (voir drawRangePosition) — plafond, jamais une boucle sans fin.
const SPACING_MAX_ATTEMPTS = 8;

// Archétype GÉNÉRIQUE d'objet au sol (entities/types/item.js), utilisé pour
// tout objet du sac SANS archétype dédié — même convention que
// view/city-screen.js/resolveDroppedItemSpec : un archétype du MÊME NOM que
// l'objet (ex. "apple") est préféré s'il existe dans le registre injecté.
const GENERIC_ITEM_TYPE = "item";

// Index du cycle de collecte courant : nombre de re-garnissages quotidiens
// (à SPAWN_CYCLE_HOUR) écoulés depuis l'origine du temps. Peut être négatif
// si l'heure de départ précède SPAWN_CYCLE_HOUR le jour 1 — sans importance,
// seule l'ÉGALITÉ avec un cycle mémorisé compte.
export function spawnCycleAt(time) {
  return Math.floor((Math.floor(time) - SPAWN_CYCLE_HOUR * TIME_CONFIG.minutesPerHour) / MINUTES_PER_DAY);
}

// Un conteneur est FOUILLABLE s'il a un stock, OU si un cycle est passé
// depuis son dernier stock (il se garnira paresseusement à la fouille, voir
// searchContainer). Faux pour toute entité sans `container`. Lu par la vue
// pour filtrer les candidats à "activate" (view/audio/city-scene.js/
// getInteractionCandidates) — la seule chose qui s'éteint quand un conteneur
// est vidé.
export function isSearchable(entity, time) {
  if (!entity.container) return false;
  if (entity.stockCycle !== spawnCycleAt(time)) return true;
  return Array.isArray(entity.stock) && entity.stock.length > 0;
}

// Sources garnies au cycle : plages, conteneurs ET points de vente (leur
// rayon se recharge au même point temporel, voir core/catalog.js).
function faceHasSources(face) {
  return (face.spawnRanges !== undefined && face.spawnRanges.length > 0) || face.entities.some((e) => e.container || e.shop);
}

// Tire `count` objets dans une distribution, en enchaînant le PRNG.
function drawItems(distribution, count, rngState) {
  const items = [];
  let state = rngState;
  for (let i = 0; i < count; i++) {
    const draw = drawItem(distribution, state);
    items.push(draw.item);
    state = draw.rngState;
  }
  return { items, rngState: state };
}

// Descripteur d'entité ramassable pour un objet du sac : passe par le MÊME
// parseur qu'une instance de scène (cascade sounds/capacités/action de
// l'archétype). Sert aux deux matérialisations : posé PERSISTANT par une
// plage (marqué `spawned` par l'appelant), ou ÉPHÉMÈRE lâché par une fouille
// (spawnEphemeral repose id/x/ephemeral lui-même).
function buildCollectibleSpec(item, id, x, registry, length, sceneVariables) {
  const raw = registry[item]
    ? { id, type: item, x }
    : {
        id,
        type: GENERIC_ITEM_TYPE,
        x,
        nameKey: ITEM_REGISTRY[item].label,
        descriptionKey: ITEM_REGISTRY[item].descriptionKey,
        action: { kind: "pickup", item, count: 1 },
      };
  return parseSpawnedEntity(raw, registry, length, sceneVariables);
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

// Garnit UNE face pour le cycle donné : conteneurs re-stockés, anciens
// collectibles posés retirés puis remplacés. Tirages enchaînés sur
// face.rngState, dans l'ordre des entités puis des plages — ordre stable,
// déterminisme préservé.
function refillFace(face, world, cycle, registry, companions, presenceContext) {
  let rngState = face.rngState;
  const entities = [];
  for (const entity of face.entities) {
    if (entity.spawned) continue;
    if (entity.shop) {
      entities.push(restockShopEntity(entity, cycle));
      continue;
    }
    if (!entity.container) {
      entities.push(entity);
      continue;
    }
    const drawn = drawItems(entity.container.distribution, entity.container.count ?? SPAWN_CONTAINER_DEFAULT_COUNT, rngState);
    rngState = drawn.rngState;
    entities.push({ ...entity, stock: drawn.items, stockCycle: cycle });
  }

  (face.spawnRanges ?? []).forEach((range, rangeIndex) => {
    const count = range.count ?? SPAWN_RANGE_DEFAULT_COUNT;
    const placed = [];
    for (let i = 0; i < count; i++) {
      const draw = drawItem(range.distribution, rngState);
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
// (voir view/city-screen.js), idempotent : rien à faire -> RÉFÉRENCE
// INCHANGÉE (cycle déjà matérialisé, ou monde sans aucune source). Scène à
// deux faces : LES DEUX faces sont garnies (on charge le monde entier),
// chacune sur son propre flux PRNG ; le marqueur reste au niveau du monde.
export function refillDueSpawns(session, registry) {
  const world = session.worlds[session.activeWorldId];
  const cycle = spawnCycleAt(session.time);
  if (world.spawnCycle === cycle) return session;

  const faces = isTwoSided(world) ? ["recto", "verso"] : [null];
  if (!faces.some((side) => faceHasSources(resolveFace(world, side)))) return session;

  const presenceContext = { time: session.time };
  let nextWorld = world;
  for (const side of faces) {
    const face = resolveFace(world, side);
    const companions = side === null || side === session.player.side ? session.companions : [];
    const refilled = refillFace(face, world, cycle, registry, companions, presenceContext);
    nextWorld = withFace(nextWorld, side, { entities: refilled.entities, rngState: refilled.rngState });
  }
  nextWorld = { ...nextWorld, spawnCycle: cycle };
  return { ...session, worlds: { ...session.worlds, [session.activeWorldId]: nextWorld } };
}

// Effet "fouiller" (action "search", voir view/interaction.js) sur un
// conteneur de la FACE ACTIVE : son stock TOMBE AU SOL — une entité
// ÉPHÉMÈRE par objet, éparpillée autour du conteneur
// (core/state.js/spawnScatteredEphemerals, une par objet pour que chacune
// porte SON spec), à ramasser ensuite ou à laisser. Rend `{ session, items }`
// — `items` : les objets tombés (vide si le conteneur n'était pas garni, ou
// si l'id n'est pas un conteneur ; dégradation silencieuse, la vue filtre
// déjà les candidats via isSearchable). Stock tiré PARESSEUSEMENT si le
// cycle courant diffère de stockCycle (voir header). Le conteneur note
// stock:null pour le cycle courant : plus fouillable jusqu'au cycle suivant.
export function searchContainer(session, entityId, registry) {
  const world = session.worlds[session.activeWorldId];
  const side = session.player.side;
  const face = resolveFace(world, side);
  const index = face.entities.findIndex((e) => e.id === entityId);
  const entity = face.entities[index];
  if (!entity || !isSearchable(entity, session.time)) return { session, items: [] };

  const cycle = spawnCycleAt(session.time);
  let rngState = face.rngState;
  let stock = entity.stock;
  if (entity.stockCycle !== cycle) {
    const drawn = drawItems(entity.container.distribution, entity.container.count ?? SPAWN_CONTAINER_DEFAULT_COUNT, rngState);
    rngState = drawn.rngState;
    stock = drawn.items;
  }

  const searched = { ...entity, stock: null, stockCycle: cycle };
  const entities = face.entities.map((e, i) => (i === index ? searched : e));
  let nextSession = {
    ...session,
    worlds: { ...session.worlds, [session.activeWorldId]: withFace(world, side, { entities, rngState }) },
  };
  for (const item of stock) {
    const spec = buildCollectibleSpec(item, `${entityId}-drop`, entity.x, registry, world.length, world.variables);
    nextSession = spawnScatteredEphemerals(nextSession, spec, entity.x, 1);
  }
  return { session: nextSession, items: stock };
}
