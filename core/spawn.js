// Moteur de COLLECTE (spawn de collectibles) — pur, headless. Voir
// doc/entity-model.md/"Collecte" pour le modèle complet. Quatre couches :
//   - DISTRIBUTION (quoi) : core/distribution.js.
//   - SOURCES (où) : un CONTENEUR est une entité qui porte `container:
//     { distribution }` (cascade instance -> type, voir core/level.js/
//     parseEntity) ; une PLAGE est une entrée de `face.spawnRanges`
//     ({ from, to, count?, distribution }, voir core/level.js/parseFace).
//     Même logique de garnissage dessous, seule la MATÉRIALISATION diffère :
//     un conteneur mémorise un objet caché (`stock`), une plage pose des
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
//     côté vue) ; ramassage au sol via l'action "pickup" EXISTANTE portée par
//     chaque entité posée.
// Déterministe : tous les tirages consomment le PRNG de la FACE
// (face.rngState, comme spawnScatteredEphemerals) — même seed + même cycle
// -> même contenu. Persistant : stock/stockCycle/spawned/spawnCycle sont
// des champs plats sérialisés avec la partie (voir core/save.js).
//
// `registry` est INJECTÉ (comme pour core/level.js/parseLevel), jamais
// importé : le core ne connaît aucun registre de contenu.

import { SPAWN_CYCLE_HOUR, SPAWN_RANGE_DEFAULT_COUNT } from "../config/spawn-values.js";
import { TIME_CONFIG } from "../config/time-values.js";
import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { ITEM_REGISTRY } from "./items.js";
import { drawItem } from "./distribution.js";
import { isTwoSided, resolveFace, withFace, drawScatteredPosition } from "./state.js";
import { parseSpawnedEntity } from "./level.js";
import { addItem } from "./bag.js";

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

function faceHasSources(face) {
  return (face.spawnRanges !== undefined && face.spawnRanges.length > 0) || face.entities.some((e) => e.container);
}

// Entité ramassable pour un objet du sac : passe par le MÊME parseur qu'une
// instance de niveau (cascade sounds/capacités/action de l'archétype), puis
// marquée `spawned` — le champ RUNTIME qui la distingue d'une entité
// déclarée (retirée au prochain garnissage, jamais purgée au départ
// contrairement à un éphémère).
function buildCollectibleEntity(item, id, x, registry, length, sceneVariables) {
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
  return { ...parseSpawnedEntity(raw, registry, length, sceneVariables), spawned: true };
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
    if (!entity.container) {
      entities.push(entity);
      continue;
    }
    const draw = drawItem(entity.container.distribution, rngState);
    rngState = draw.rngState;
    entities.push({ ...entity, stock: draw.item, stockCycle: cycle });
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
      entities.push(
        buildCollectibleEntity(draw.item, `spawn-${cycle}-${rangeIndex}-${i}`, position.x, registry, world.length, world.variables)
      );
    }
  });

  return { ...face, entities, rngState };
}

// Garnit le monde ACTIF si un cycle est dû (world.spawnCycle absent ou
// différent du cycle courant) — appelé à CHAQUE chargement du monde actif
// (voir view/city-screen.js), idempotent : rien à faire -> RÉFÉRENCE
// INCHANGÉE (cycle déjà matérialisé, ou monde sans aucune source). Scène à
// deux faces : LES DEUX faces sont garnies (on charge le lieu entier),
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
// conteneur de la FACE ACTIVE : rend `{ session, item }` — `item` (clé
// ITEM_REGISTRY) ajouté au sac si le conteneur était garni, `null` s'il est
// vide (ou si l'id n'est pas un conteneur, dégradation silencieuse). Le
// stock est tiré PARESSEUSEMENT si le cycle courant diffère de stockCycle
// (un jour passé sur place suffit — voir header), avec le PRNG de la face.
// Un conteneur fouillé note stock:null pour le cycle courant : refouillé le
// même jour -> vide, jusqu'au cycle suivant.
export function searchContainer(session, entityId) {
  const world = session.worlds[session.activeWorldId];
  const side = session.player.side;
  const face = resolveFace(world, side);
  const index = face.entities.findIndex((e) => e.id === entityId);
  const entity = face.entities[index];
  if (!entity || !entity.container) return { session, item: null };

  const cycle = spawnCycleAt(session.time);
  let rngState = face.rngState;
  let stock = entity.stock;
  if (entity.stockCycle !== cycle) {
    const draw = drawItem(entity.container.distribution, rngState);
    rngState = draw.rngState;
    stock = draw.item;
  }

  const searched = { ...entity, stock: null, stockCycle: cycle };
  const entities = face.entities.map((e, i) => (i === index ? searched : e));
  const nextWorld = withFace(world, side, { entities, rngState });
  const nextSession = { ...session, worlds: { ...session.worlds, [session.activeWorldId]: nextWorld } };
  if (!stock) return { session: nextSession, item: null };
  return { session: addItem(nextSession, stock, 1), item: stock };
}
