// Le réducteur : seule source de vérité pour l'évolution de l'état. Pure,
// ne mute jamais state, renvoie toujours un nouvel objet (sauf action
// inconnue, qui renvoie la référence inchangée).
//
// Pipeline du TICK, en deux phases explicites (voir core/physics/ pour le
// détail de la frontière) :
//   1. INTENTIONS — qui veut bouger, et dans quel sens : action.dir pour le
//      joueur (déjà une intention, câblée depuis view/input.js -> tick(),
//      voir actions.js) ; core/behaviors/ pour chaque entité dotée d'un
//      comportement — les entités du MONDE actif ET les COMPAGNONS de la
//      partie en ont chacun un jeu (voir plus bas). Un seul contrat de
//      retour pour tous les comportements (wander, follow, goto) : une
//      intention de direction (`intent` : -1/0/+1), sans jamais toucher à
//      la position — c'est la phase 2, ci-dessous, qui la résout.
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
// RECTO/VERSO — COEXISTENCE (voir core/state.js/resolveFace/isTwoSided) :
// au sein du monde actif, LES DEUX faces d'une scène à deux faces tiquent
// à chaque tour, mais ISOLÉES l'une de l'autre — chacune sa propre passe de comportement et de
// résolution de corps, jamais combinées. Seule la face COURANTE
// (state.player.side) reçoit le joueur et les compagnons ; l'autre tique
// seule, dans son propre espace (voir le bloc dédié dans TICK ci-dessous).
//
// COMPAGNONS (voir core/state.js pour le modèle complet) : lus/écrits ICI
// directement sur `state.worlds[...]`/`state.companions` BRUTS, jamais via
// getActiveWorld() (qui les mélangerait pour la LECTURE externe, voir sa
// doc) — ce réducteur a besoin de les garder SÉPARÉS pour les persister
// chacun à leur place (worlds[x].entities pour le monde, state.companions
// pour la partie). Ils participent PLEINEMENT au pipeline (comportement ET
// physique, combinés le temps du calcul avec les entités du monde), mais
// avec leur PROPRE flux de PRNG (companionsRngState, jamais gelé par une
// transition, contrairement à world.rngState) et ressortent dans un
// tableau SÉPARÉ en fin de tick.
import BEHAVIORS from "./behaviors/index.js";
import { resolvePlayerMove, resolveBodyMove } from "./physics/collision.js";
import { resolveOverlaps, resolveEntityOverlaps } from "./physics/overlap.js";
import { resolveEntityRules, presenceContextOf } from "./presence.js";
import { resolveFace, withFace, isTwoSided } from "./state.js";

// Résout la position d'une CIBLE par id — "player" (convention reconnue
// ici, voir follow.js/DEFAULTS.targetId) pour le joueur, sinon une entité
// de la FACE ACTIVE (voir core/state.js/resolveFace — l'autre face d'une
// scène à deux faces n'est jamais consultée ici : elle tique avec son
// propre résolveur, isolé, voir le bloc dédié dans TICK) ou un compagnon. Fourni aux comportements à intention (ex.
// follow) via context.getTargetPosition, pour qu'AUCUN module de
// comportement n'ait à connaître cette structure (joueur hors entities,
// compagnons dans un cercle séparé du monde...). Positions PRÉ-tick (face/
// state.companions AVANT toute étape de ce tour) : cohérent avec le reste
// de la phase 1, qui lit aussi face.rngState/companionsRngState avant
// qu'ils n'avancent — une cible réagit à l'état de DÉBUT de tick, jamais à
// une position déjà avancée plus tôt dans le même tick selon l'ordre de la
// liste. Introuvable (id inconnu) -> undefined, jamais d'exception : voir
// follow.js, qui s'arrête proprement dans ce cas.
function resolveTargetPosition(state, face, targetId) {
  if (targetId === "player") return state.player.x;
  const inFace = face.entities.find((entity) => entity.id === targetId);
  if (inFace) return inFace.x;
  const inCompanions = state.companions.find((entity) => entity.id === targetId);
  if (inCompanions) return inCompanions.x;
  return undefined;
}

// Fait avancer une liste d'entités d'un tick (phase 1, comportement) contre
// UN contexte donné (length/rngState/getTargetPosition/presenceContext) :
// les entités du monde et les compagnons de la partie suivent exactement la
// même logique, seuls le flux de PRNG et la liste diffèrent (voir l'appel
// des deux dans le TICK ci-dessous). Renvoie les résultats PAIRÉS
// {entity, intent} (intent : undefined pour une entité dormante ou sans
// comportement ; sinon celui de son module, voir wander.js, follow.js,
// goto.js) ET l'état du flux après tous les tirages, pour que l'appelant
// le reporte au tick suivant.
//
// Règles déclaratives (voir core/presence.js/resolveEntityRules) résolues
// ICI, avant tout comportement — présence : premier des trois plans coupés
// par le drapeau DORMANT (voir doc/entity-model.md/doc/time.md pour les
// deux autres, côté vue : rendu audio, occupation/interaction ; le
// troisième plan CORE, le blocage, est traité séparément par isBlocking,
// voir plus bas dans TICK). DORMANTE -> aucun appel au module de
// comportement (ni mouvement, ni tirage PRNG consommé) : rngState traverse
// intact pour cette entité, déterminisme préservé pour les entités
// RESTÉES actives, quel que soit l'état de présence des autres. Les
// champs `present`/`presenceChanged`/`ruleActive` ne sont ajoutés à
// l'entité QUE si elle porte une règle `presence` (jamais sur une entité
// qui n'en a pas : sa forme sérialisée reste celle de sa scène, voir
// core/checks/save.check.js, audit de sérialisabilité).
//
// presenceChanged ("entered" | "exited" | null) : la BASCULE de présence
// OBSERVÉE, exposée pour la vue (sons de transition, voir
// view/audio/entity-audio.js) — voir resolveEntityRules pour le détail
// (jamais de bascule fantôme au montage).
//
// Effet "behavior" (voir resolveEntityRules) : s'il vient de basculer ce
// tick, remplace le comportement ACTIF de l'entité AVANT que son propre
// step() ne s'exécute — la bascule prend effet IMMÉDIATEMENT, pas au tick
// suivant (un goto qui vient d'être posé commence à se diriger vers sa
// cible dès ce même tick). L'effet ne fait QUE poser le comportement ;
// c'est ensuite le pipeline normal ci-dessous (module.step) qui l'exécute
// — jamais l'effet lui-même qui déplace l'entité. `behaviorEffect` DISTINGUE
// `undefined` (aucun effet ce tick — comportement inchangé) de `null`
// (retrait EXPLICITE, voir core/script-parse.js/parseEffect) : `!== undefined`,
// jamais un simple test de vérité, sinon `null` serait confondu avec
// "rien à faire" et le comportement resterait figé sur son ancien `kind`.
function stepEntities(entities, context) {
  let rngState = context.rngState;
  const results = entities.map((entity) => {
    const resolved = resolveEntityRules(entity, context.presenceContext);
    const { present, presenceChanged, ruleActive, behaviorEffect } = resolved;
    const effectiveEntity = behaviorEffect !== undefined ? { ...entity, behavior: behaviorEffect } : entity;
    const withPresence = (e) =>
      entity.presence ? { ...e, present, presenceChanged, ruleActive } : e;

    if (!present) {
      return { entity: withPresence(effectiveEntity), intent: undefined };
    }

    const module = effectiveEntity.behavior && BEHAVIORS[effectiveEntity.behavior.kind];
    if (!module) return { entity: withPresence(effectiveEntity), intent: undefined };
    const stepped = module.step(effectiveEntity, { ...context, rngState });
    rngState = stepped.rngState;
    return { entity: withPresence(stepped.entity), intent: stepped.intent };
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
// (dormante ou sans comportement) traverse inchangée.
//
// Vitesse : facteur consommé ICI, à la RÉSOLUTION — jamais par le
// comportement qui a produit `intent` (wander/follow/goto ignorent tout de
// la vitesse, voir leur frontière avec la physique). `behavior.speed`
// (commun aux trois kinds, validé par chacun) PRIME sur `entity.speed`
// (voir core/entity-parse.js/parseEntity, défaut 1) : une règle qui change de
// comportement (effet "behavior") change donc aussi d'allure. `?? 1` :
// filet pour une entité qui ne passe pas par la cascade (ex. un compagnon,
// core/state.js/createTestCompanion).
function resolveIntents(results, blockerPool, length, presenceContext) {
  return results.map(({ entity, intent }) => {
    if (intent === undefined) return entity;
    const blockers = blockerPool.filter((other) => other.id !== entity.id);
    const speed = entity.behavior?.speed ?? entity.speed ?? 1;
    const { x: resolvedX } = resolveBodyMove(entity.x, intent, blockers, length, presenceContext, speed);
    return { ...entity, x: resolvedX };
  });
}

export function reduce(state, action) {
  switch (action.type) {
    case "TICK": {
      const world = state.worlds[state.activeWorldId];
      // face : la FACE ACTIVE du monde actif (voir core/state.js/
      // resolveFace) — pour un monde simple, c'est le monde lui-même ; pour
      // un monde à deux faces, c'est recto OU verso selon
      // state.player.side : celle qui reçoit le joueur et les compagnons.
      // L'autre face tique elle aussi, mais à part et isolée (voir le bloc
      // RECTO/VERSO plus bas). `length` reste PARTAGÉ au niveau du monde
      // (les deux faces vivent sur le même axe X), jamais dupliqué par face.
      const face = resolveFace(world, state.player.side);

      // --- Phase 1 : intentions ---

      // Chaque entité dotée d'un comportement tire son(ses) coup(s) à la
      // queue leu leu dans SA suite de PRNG (rngState avance à chaque
      // tirage) : ordre stable (celui de la liste) -> déterminisme préservé
      // même avec plusieurs entités mobiles. Le kind est résolu via le
      // registre (voir core/behaviors/index.js) — reduce ne connaît aucun
      // kind par son nom. getTargetPosition PARTAGÉ entre les deux appels :
      // il ne dépend que de l'état PRÉ-tick (voir resolveTargetPosition),
      // jamais de la liste en cours de traitement.
      const getTargetPosition = (targetId) => resolveTargetPosition(state, face, targetId);
      // Présence : dérivée de state.time, state.perceptionActive ET
      // state.weather.state (tous constants pour tout ce tick, voir
      // core/presence.js) — un seul objet construit ici, partagé par la
      // phase 1 (stepEntities) ET la phase 2 (isBlocking, via
      // resolvePlayerMove/resolveBodyMove/resolveOverlaps ci-dessous),
      // jamais recréé par appel. `world`/`session` : PORTEURS des variables
      // de portée "scene"/"party" (voir core/variables.js) pour la condition
      // "variable" — `world` reste le MONDE RACINE (variables de scène
      // PARTAGÉES entre recto/verso, jamais par face, voir
      // core/scene.js/parseScene), IDENTIQUE pour les deux faces tiquées
      // ci-dessous (recto ET verso lisent/écrivent le MÊME sac de scène,
      // jamais un par face) ; `session` reste `state` lui-même, jamais une
      // copie — resolveEntityRules n'en fait rien d'autre qu'une LECTURE
      // (aucun effet d'écriture ne passe par presence[].effects, voir
      // doc/scripting.md/"Effets d'action"). Construit par
      // presenceContextOf, la même fonction que la vue utilise au montage.
      const presenceContext = presenceContextOf(state);
      const worldStep = stepEntities(face.entities, {
        length: world.length,
        rngState: face.rngState,
        getTargetPosition,
        presenceContext,
      });
      const companionsStep = stepEntities(state.companions, {
        length: world.length,
        rngState: state.companionsRngState,
        getTargetPosition,
        presenceContext,
      });

      // --- Phase 2 : physique ---

      // Combinées ICI, à cette seule fin (collision/chevauchement doivent
      // voir TOUS les corps présents dans le monde actif, compagnons
      // compris) — jamais persistées fusionnées, voir le découpage juste
      // après. Le joueur se résout contre les corps "avant" (entities du
      // monde ET compagnons, PRE-comportement) : il réagit, comme les
      // cibles de la phase 1, à l'état de DÉBUT de tick. Une entité DORMANTE ne bloque
      // jamais (voir core/presence.js/isBlocking, lu par
      // resolvePlayerMove/resolveBodyMove/resolveOverlaps à la place d'un
      // simple entity.blocksMovement) — présence recalculée fraîche depuis
      // ces entités PRÉ-tick plutôt que relue sur un éventuel `.present`
      // déjà posé, voir le commentaire d'isBlocking.
      const combinedBefore = [...face.entities, ...state.companions];
      const { x: nextX, blockedBy } = resolvePlayerMove(
        state.player.x,
        action.dir,
        combinedBefore,
        world.length,
        presenceContext
      );

      // Intentions (ex. follow) résolues contre les corps POST-phase 1,
      // toutes listes confondues (voir resolveIntents) — avant la passe de
      // chevauchement, qui referme ensuite tout résidu comme toujours.
      const stepped = [...worldStep.results.map((r) => r.entity), ...companionsStep.results.map((r) => r.entity)];
      const resolvedWorldEntities = resolveIntents(worldStep.results, stepped, world.length, presenceContext);
      const resolvedCompanions = resolveIntents(companionsStep.results, stepped, world.length, presenceContext);

      // Passe curative finale : sépare tout chevauchement de corps résiduel
      // (impossible en théorie vu ce qui précède, mais la conception des
      // scènes peut en produire un au chargement, ou un mobile peut finir
      // exactement sur le joueur/une autre entité) — voir resolveOverlaps.
      const combinedAfter = [...resolvedWorldEntities, ...resolvedCompanions];
      const overlapFix = resolveOverlaps(nextX, combinedAfter, world.length, presenceContext);

      // Découpage : resolveOverlaps préserve l'ordre et la longueur de son
      // entrée (map/slice, jamais un ajout/retrait) — le premier bloc de
      // longueur resolvedWorldEntities.length est donc TOUJOURS les
      // entités du monde, le reste TOUJOURS les compagnons, quel que soit ce
      // que la résolution a changé.
      const worldEntityCount = resolvedWorldEntities.length;
      const finalWorldEntities = overlapFix.entities.slice(0, worldEntityCount);
      const finalCompanions = overlapFix.entities.slice(worldEntityCount);

      // Réécrit la face COURANTE (voir core/state.js/withFace).
      let nextWorld = withFace(world, state.player.side, {
        entities: finalWorldEntities,
        rngState: worldStep.rngState,
      });

      // --- RECTO/VERSO : COEXISTENCE, l'AUTRE face tique aussi, ISOLÉE
      // (voir doc/entity-model.md/"Recto/verso", core/state.js/isTwoSided) ---
      // Une scène à deux faces avance SES DEUX faces à chaque tick, chacune
      // dans son propre espace — ni le joueur, ni les
      // compagnons, ni les entités de la face COURANTE n'y participent
      // (isolation stricte : pas de collision, pas de ciblage de
      // comportement, pas de résolution croisée entre faces). getTargetPosition
      // de CETTE face ne résout QUE ses propres entités — "player" (et tout
      // id de l'autre face ou des compagnons) y reste TOUJOURS introuvable
      // -> undefined, jamais résolu : un goto/follow de l'autre face ne peut
      // donc jamais viser le joueur ni une entité de la face courante. Son
      // PROPRE rngState (un flux par face, voir core/state.js/
      // createFaceState) préserve le déterminisme sans la moindre
      // interférence entre les deux flux.
      if (isTwoSided(world)) {
        const otherSide = state.player.side === "recto" ? "verso" : "recto";
        const otherFace = world[otherSide];
        const otherGetTargetPosition = (targetId) => {
          const found = otherFace.entities.find((entity) => entity.id === targetId);
          return found ? found.x : undefined;
        };
        const otherStep = stepEntities(otherFace.entities, {
          length: world.length,
          rngState: otherFace.rngState,
          getTargetPosition: otherGetTargetPosition,
          presenceContext,
        });
        const otherStepped = otherStep.results.map((r) => r.entity);
        const otherResolved = resolveIntents(otherStep.results, otherStepped, world.length, presenceContext);
        const otherFinal = resolveEntityOverlaps(otherResolved, world.length, presenceContext);
        nextWorld = withFace(nextWorld, otherSide, { entities: otherFinal, rngState: otherStep.rngState });
      }

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
