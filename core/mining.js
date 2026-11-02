// MINAGE — pur, headless. Voir doc/entity-model.md/"Minage".
//
// Une entité MINABLE porte `mineable: { distribution, hits, count }` (forme
// validée par core/entity-parse.js/parseMineable, cascade instance ->
// archétype). Chaque coup (action "mine" côté vue, view/action-execution.js)
// lui retire un point de résistance ; au dernier, elle est DÉTRUITE et ce
// qu'elle renfermait TOMBE AU SOL — une entité éphémère par objet, éparpillée
// autour d'elle, MÊME geste que la fouille d'un conteneur
// (core/spawn.js/searchContainer).
//
// La résistance n'est PAS tirée au chargement : elle l'est au PREMIER coup
// (`hitsLeft`, champ runtime plat sérialisé avec la partie), dans la
// fourchette `hits`. Les coups déjà portés sont comptés à part (`strikes`,
// même nature) : la vue en fait monter le son du geste, note après note
// (voir view/action-execution.js/handleMine). Une entité jamais frappée ne
// porte donc rien de plus que sa scène. Le nombre de tirages à la
// destruction est tiré à ce moment dans la fourchette `count` ; un tirage
// "nothing" ne donne rien (voir core/distribution.js), l'entité peut donc
// se briser sans rien lâcher.
//
// Déterministe : tous les tirages consomment le PRNG de la FACE
// (face.rngState), comme la collecte. Une entité détruite est RETIRÉE du
// monde (core/state.js/removeEntity) : la sauvegarde fige ce retrait.
// La condition d'accès (le kit de minage) n'est PAS ici : elle est portée
// par l'action de l'archétype (`condition` + `refusalEffects`, voir
// doc/scripting.md), comme toute action conditionnelle.
//
// `registry` est INJECTÉ (comme pour core/spawn.js), jamais importé.

import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { nextRandom } from "./rng.js";
import { resolveFace, updateActiveFace, removeEntity, spawnScatteredEphemerals } from "./state.js";
import { drawItems, buildCollectibleSpec } from "./spawn.js";

// Entier uniforme dans [range.min, range.max], en enchaînant le PRNG.
function drawInRange(range, rngState) {
  const { value, state } = nextRandom(rngState);
  return { value: range.min + Math.floor(value * (range.max - range.min + 1)), rngState: state };
}

// Un coup sur l'entité minable `entityId` de la FACE ACTIVE. Rend
// `{ session, status, strike, items }` :
//   - `status` : "hit" (l'entité a encaissé, elle tient encore), "broken"
//     (dernier coup : elle est retirée, ses objets sont au sol), ou null si
//     l'id n'est pas une entité minable de la face active (session
//     inchangée) ;
//   - `strike` : le numéro de CE coup, à partir de 1 (0 si status null) ;
//   - `items` : les objets tombés ("broken" seulement, peut être vide).
export function mineEntity(session, entityId, registry) {
  const world = session.worlds[session.activeWorldId];
  const side = session.player.side;
  const face = resolveFace(world, side);
  const entity = face.entities.find((e) => e.id === entityId);
  if (!entity || !entity.mineable) return { session, status: null, strike: 0, items: [] };

  let rngState = face.rngState;
  let hitsLeft = entity.hitsLeft;
  if (hitsLeft === undefined) {
    const drawn = drawInRange(entity.mineable.hits, rngState);
    hitsLeft = drawn.value;
    rngState = drawn.rngState;
  }
  hitsLeft -= 1;
  // `strikes` absent : entité jamais frappée (ou entamée avant que les coups
  // ne soient comptés, dans une ancienne sauvegarde : on repart de 1).
  const strike = (entity.strikes ?? 0) + 1;

  if (hitsLeft > 0) {
    const entities = face.entities.map((e) => (e.id === entityId ? { ...e, hitsLeft, strikes: strike } : e));
    return { session: updateActiveFace(session, { entities, rngState }, side), status: "hit", strike, items: [] };
  }

  const count = drawInRange(entity.mineable.count, rngState);
  const drawn = drawItems(entity.mineable.distribution, count.value, count.rngState);
  let nextSession = removeEntity(updateActiveFace(session, { rngState: drawn.rngState }, side), entityId);
  for (const item of drawn.items) {
    const spec = buildCollectibleSpec(item, `${entityId}-drop`, entity.x, registry, world.length, world.variables);
    nextSession = spawnScatteredEphemerals(nextSession, spec, entity.x, 1, TUNING_DEFAULTS.mineScatterSpread);
  }
  return { session: nextSession, status: "broken", strike, items: drawn.items };
}
