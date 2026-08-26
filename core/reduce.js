// Le réducteur : seule source de vérité pour l'évolution de l'état. Pure,
// ne mute jamais state, renvoie toujours un nouvel objet (sauf action
// inconnue, qui renvoie la référence inchangée).
//
// Pipeline du TICK, en deux phases explicites (voir core/physics/ pour le
// détail de la frontière) :
//   1. INTENTIONS — qui veut bouger, et dans quel sens : action.dir pour le
//      joueur (déjà une intention, câblée depuis view/input.js -> tick(),
//      voir actions.js) ; core/behaviors/ pour chaque entité dotée d'un
//      comportement — les entités du LIEU actif ET les COMPAGNONS de la
//      partie en ont chacun un jeu (voir plus bas). Deux familles de
//      comportement, deux contrats de retour : wander (voir wander.js) se
//      déplace ET se borne LUI-MÊME, ne renvoie aucun `intent` — rien de
//      plus à faire en phase 2. follow (voir follow.js) ne renvoie QU'une
//      intention de direction (`intent` : -1/0/+1), sans toucher à sa
//      position : c'est la phase 2, ci-dessous, qui la résout.
//   2. PHYSIQUE — applique et contraint ces intentions, sans rien savoir de
//      qui les a formées : core/physics/collision.js résout le déplacement,
//      même pas fixe et mêmes bornes pour tout mobile, mais avec DEUX
//      dégagements distincts (voir le header de ce module) —
//      resolvePlayerMove pour le joueur (point), resolveBodyMove pour tout
//      mobile à intention à corps plein (ex. un compagnon en follow) —
//      jamais de traversée, jamais de poussée résiduelle d'un bloqueur.
//      core/physics/overlap.js referme, en une passe finale universelle,
//      tout chevauchement de corps résiduel.
//
// Partie multi-mondes (voir core/state.js) : SEUL le monde actif avance.
// Les autres, rangés dans session.worlds, sont inertes — reduce ne les lit
// ni ne les écrit, ils traversent le tick sans changer (même référence).
//
// COMPAGNONS (voir core/state.js pour le modèle complet) : lus/écrits ICI
// directement sur `state.worlds[...]`/`state.companions` BRUTS, jamais via
// getActiveWorld() (qui les mélangerait pour la LECTURE externe, voir sa
// doc) — ce réducteur a besoin de les garder SÉPARÉS pour les persister
// chacun à leur place (worlds[x].entities pour le lieu, state.companions
// pour la partie). Ils participent PLEINEMENT au pipeline (comportement ET
// physique, combinés le temps du calcul avec les entités du lieu), mais
// avec leur PROPRE flux de PRNG (companionsRngState, jamais gelé par une
// transition, contrairement à world.rngState) et ressortent dans un
// tableau SÉPARÉ en fin de tick.
import BEHAVIORS from "./behaviors/index.js";
import { resolvePlayerMove, resolveBodyMove } from "./physics/collision.js";
import { resolveOverlaps } from "./physics/overlap.js";

// Résout la position d'une CIBLE par id — "player" (convention reconnue
// ici, voir follow.js/DEFAULTS.targetId) pour le joueur, sinon une entité
// du lieu actif ou un compagnon. Fourni aux comportements à intention (ex.
// follow) via context.getTargetPosition, pour qu'AUCUN module de
// comportement n'ait à connaître cette structure (joueur hors entities,
// compagnons dans un cercle séparé du lieu...). Positions PRÉ-tick (world/
// state.companions AVANT toute étape de ce tour) : cohérent avec le reste
// de la phase 1, qui lit aussi world.rngState/companionsRngState avant
// qu'ils n'avancent — une cible réagit à l'état de DÉBUT de tick, jamais à
// une position déjà avancée plus tôt dans le même tick selon l'ordre de la
// liste. Introuvable (id inconnu) -> undefined, jamais d'exception : voir
// follow.js, qui s'arrête proprement dans ce cas.
function resolveTargetPosition(state, world, targetId) {
  if (targetId === "player") return state.player.x;
  const inWorld = world.entities.find((entity) => entity.id === targetId);
  if (inWorld) return inWorld.x;
  const inCompanions = state.companions.find((entity) => entity.id === targetId);
  if (inCompanions) return inCompanions.x;
  return undefined;
}

// Fait avancer une liste d'entités d'un tick (phase 1, comportement) contre
// UN contexte donné (length/rngState/getTargetPosition — voir
// resolveTargetPosition) : les entités du lieu et les compagnons de la
// partie suivent exactement la même logique, seuls le flux de PRNG et la
// liste diffèrent (voir l'appel des deux dans le TICK ci-dessous). Renvoie
// les résultats PAIRÉS {entity, intent} (intent : undefined si le module
// n'en produit pas, voir wander.js/follow.js) ET l'état du flux après tous
// les tirages, pour que l'appelant le reporte au tick suivant.
function stepEntities(entities, context) {
  let rngState = context.rngState;
  const results = entities.map((entity) => {
    const module = entity.behavior && BEHAVIORS[entity.behavior.kind];
    if (!module) return { entity, intent: undefined };
    const stepped = module.step(entity, { ...context, rngState });
    rngState = stepped.rngState;
    return { entity: stepped.entity, intent: stepped.intent };
  });
  return { results, rngState };
}

// Résout, pour chaque entité qui a produit une INTENTION en phase 1 (voir
// stepEntities), sa position via resolveBodyMove (core/physics/collision.js)
// — un mobile à intention (ex. follow) est un corps PLEIN, jamais le point
// que le joueur seul est traité comme (voir le header de collision.js pour
// les deux conventions de dégagement et pourquoi les confondre poussait un
// bloqueur au contact au lieu de s'y arrêter). `blockerPool` (POST-phase 1,
// toutes listes confondues) exclut l'entité elle-même à chaque résolution,
// jamais de collision contre son propre corps. Une entité SANS intention
// (wander, déjà résolue) traverse inchangée.
function resolveIntents(results, blockerPool, length) {
  return results.map(({ entity, intent }) => {
    if (intent === undefined) return entity;
    const blockers = blockerPool.filter((other) => other.id !== entity.id);
    const { x: resolvedX } = resolveBodyMove(entity.x, intent, blockers, length);
    return { ...entity, x: resolvedX };
  });
}

export function reduce(state, action) {
  switch (action.type) {
    case "TICK": {
      const world = state.worlds[state.activeWorldId];

      // --- Phase 1 : intentions ---

      // Chaque entité dotée d'un comportement tire son(ses) coup(s) à la
      // queue leu leu dans SA suite de PRNG (rngState avance à chaque
      // tirage) : ordre stable (celui de la liste) -> déterminisme préservé
      // même avec plusieurs entités mobiles. Le kind est résolu via le
      // registre (voir core/behaviors/index.js) — reduce ne connaît aucun
      // kind par son nom. getTargetPosition PARTAGÉ entre les deux appels :
      // il ne dépend que de l'état PRÉ-tick (voir resolveTargetPosition),
      // jamais de la liste en cours de traitement.
      const getTargetPosition = (targetId) => resolveTargetPosition(state, world, targetId);
      const worldStep = stepEntities(world.entities, { length: world.length, rngState: world.rngState, getTargetPosition });
      const companionsStep = stepEntities(state.companions, {
        length: world.length,
        rngState: state.companionsRngState,
        getTargetPosition,
      });

      // --- Phase 2 : physique ---

      // Combinées ICI, à cette seule fin (collision/chevauchement doivent
      // voir TOUS les corps présents dans le lieu actif, compagnons
      // compris) — jamais persistées fusionnées, voir le découpage juste
      // après. "Avant" (entities du lieu ET compagnons, PRE-comportement)
      // pour le joueur, exactement comme avant l'introduction des
      // compagnons (comportement inchangé).
      const combinedBefore = [...world.entities, ...state.companions];
      const { x: nextX, blockedBy } = resolvePlayerMove(state.player.x, action.dir, combinedBefore, world.length);

      // Intentions (ex. follow) résolues contre les corps POST-phase 1,
      // toutes listes confondues (voir resolveIntents) — avant la passe de
      // chevauchement, qui referme ensuite tout résidu comme toujours.
      const stepped = [...worldStep.results.map((r) => r.entity), ...companionsStep.results.map((r) => r.entity)];
      const resolvedWorldEntities = resolveIntents(worldStep.results, stepped, world.length);
      const resolvedCompanions = resolveIntents(companionsStep.results, stepped, world.length);

      // Passe curative finale : sépare tout chevauchement de corps résiduel
      // (impossible en théorie vu ce qui précède, mais le level design peut
      // en produire un au chargement, ou un mobile peut finir exactement
      // sur le joueur/une autre entité) — voir resolveOverlaps.
      const combinedAfter = [...resolvedWorldEntities, ...resolvedCompanions];
      const overlapFix = resolveOverlaps(nextX, combinedAfter, world.length);

      // Découpage : resolveOverlaps préserve l'ordre et la longueur de son
      // entrée (map/slice, jamais un ajout/retrait) — le premier bloc de
      // longueur resolvedWorldEntities.length est donc TOUJOURS les
      // entités du lieu, le reste TOUJOURS les compagnons, quel que soit ce
      // que la résolution a changé.
      const worldEntityCount = resolvedWorldEntities.length;
      const finalWorldEntities = overlapFix.entities.slice(0, worldEntityCount);
      const finalCompanions = overlapFix.entities.slice(worldEntityCount);

      const nextWorld = { ...world, entities: finalWorldEntities, rngState: worldStep.rngState };

      return {
        ...state,
        player: { ...state.player, x: overlapFix.playerX, blockedBy, pushedBy: overlapFix.pushedBy },
        worlds: { ...state.worlds, [state.activeWorldId]: nextWorld },
        companions: finalCompanions,
        companionsRngState: companionsStep.rngState,
      };
    }
    default:
      return state;
  }
}
