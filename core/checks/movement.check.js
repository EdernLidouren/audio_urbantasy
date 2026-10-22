// Vérifications du core — domaine « movement ». Déplacement du joueur :
// ticks, bords, vitesse, collision, pipeline physique, chevauchements.
// Lancées par core/checks/index.js/runChecks (voir ce fichier). Pur : aucun
// DOM, aucun fetch ; chaque scène est construite en dur via un objet littéral
// passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, MOVE_STEP, BODY_RADIUS } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { resolvePlayerMove } from "../physics/collision.js";
import { throws } from "../../lib/check.js";
import { TICK_MS } from "../../lib/loop.js";
import { RAW_SCENE, EMPTY_REGISTRY } from "./helpers.js";

export default function checkMovement(run) {
  const scene = parseScene(RAW_SCENE, EMPTY_REGISTRY);

  // Quelques ticks à droite depuis le centre : x avance de MOVE_STEP par tick.
  let state = createInitialState(scene);
  state = reduce(state, tick(1));
  state = reduce(state, tick(1));
  state = reduce(state, tick(1));
  run("3 ticks à droite depuis x=5", 5 + 3 * MOVE_STEP, state.player.x);

  // Clamp à gauche : depuis le bord 0, un tick à gauche reste à 0.
  const leftScene = parseScene({ ...RAW_SCENE, playerStart: 0 }, EMPTY_REGISTRY);
  const leftState = reduce(createInitialState(leftScene), tick(-1));
  run("clamp à gauche depuis x=0", 0, leftState.player.x);

  // Clamp à droite : depuis le bord length, un tick à droite reste à length.
  const rightScene = parseScene({ ...RAW_SCENE, playerStart: RAW_SCENE.length }, EMPTY_REGISTRY);
  const rightState = reduce(createInitialState(rightScene), tick(1));
  run("clamp à droite depuis x=length", RAW_SCENE.length, rightState.player.x);

  // Action inconnue -> état inchangé, MÊME référence (pas de nouvel objet).
  const before = createInitialState(scene);
  const after = reduce(before, { type: "UNKNOWN" });
  run("action inconnue renvoie la même référence", before, after);

  // --- Vitesse (speed) : consommée par la PHYSIQUE de résolution, jamais
  // par le comportement (voir core/physics/collision.js/resolveBlockedMove,
  // core/reduce.js/resolveIntents) — wander/follow/goto continuent de ne
  // produire qu'une intention de direction, ignorant tout de la vitesse.
  // Cascade instance -> archétype -> défaut (1), même patron que
  // blocksMovement/isFlying (core/entity-parse.js/parseEntity).

  const SPEED_REGISTRY = {
    dog: { nameKey: "entity.dog.name" },
    slowDog: { nameKey: "entity.dog.name", speed: 0.5 },
  };

  const speedDefaultScene = parseScene(
    { id: "movement-check-speed-default", titleKey: "scene.demo.name", length: 10, playerStart: 5, entities: [{ id: "e1", type: "dog", x: 5 }] },
    SPEED_REGISTRY
  );
  run("speed : défaut (ni instance ni type) -> 1", 1, speedDefaultScene.entities[0].speed);

  const speedTypeScene = parseScene(
    { id: "movement-check-speed-type", titleKey: "scene.demo.name", length: 10, playerStart: 5, entities: [{ id: "e1", type: "slowDog", x: 5 }] },
    SPEED_REGISTRY
  );
  run("speed : hérité de l'archétype si l'instance ne surcharge pas", 0.5, speedTypeScene.entities[0].speed);

  const speedOverrideScene = parseScene(
    { id: "movement-check-speed-override", titleKey: "scene.demo.name", length: 10, playerStart: 5, entities: [{ id: "e1", type: "slowDog", x: 5, speed: 2 }] },
    SPEED_REGISTRY
  );
  run("speed : surcharge d'instance prioritaire sur l'archétype", 2, speedOverrideScene.entities[0].speed);

  function expectSpeedRejected(speed) {
    return throws(() => {
      parseScene(
        { id: "movement-check-speed-invalid", titleKey: "scene.demo.name", length: 10, playerStart: 5, entities: [{ id: "e1", type: "dog", x: 5, speed }] },
        SPEED_REGISTRY
      );
    });
  }
  run("speed : 0 rejeté au chargement", true, expectSpeedRejected(0));
  run("speed : négatif rejeté au chargement", true, expectSpeedRejected(-1));
  run("speed : non numérique rejeté au chargement", true, expectSpeedRejected("lent"));

  // Conséquence physique : un mobile deux fois plus lent parcourt EXACTEMENT
  // la moitié de la distance sur le même nombre de ticks, à comportement
  // IDENTIQUE (même seed, marche forcée sans pause ni rebond — walkMinMs=
  // walkMaxMs élevé, corridor large pour ne jamais toucher un bord).
  function makeSpeedWanderScene(speed) {
    return parseScene(
      {
        id: `movement-check-speed-wander-${speed}`,
        titleKey: "scene.demo.name",
        length: 100,
        playerStart: 50,
        entities: [{ id: "e1", type: "dog", x: 50, speed, behavior: { kind: "wander", walkMinMs: 1000 * TICK_MS, walkMaxMs: 1000 * TICK_MS } }],
      },
      SPEED_REGISTRY
    );
  }
  let fastSpeedState = createInitialState(makeSpeedWanderScene(1), 3);
  let slowSpeedState = createInitialState(makeSpeedWanderScene(0.5), 3);
  for (let i = 0; i < 50; i++) {
    fastSpeedState = reduce(fastSpeedState, tick(0));
    slowSpeedState = reduce(slowSpeedState, tick(0));
  }
  const fastSpeedEntity = getActiveWorld(fastSpeedState).entities[0];
  const slowSpeedEntity = getActiveWorld(slowSpeedState).entities[0];
  const fastSpeedDelta = fastSpeedEntity.x - 50;
  const slowSpeedDelta = slowSpeedEntity.x - 50;
  run(
    "speed : un mobile deux fois plus lent (0.5) parcourt deux fois moins de distance",
    true,
    Math.abs(slowSpeedDelta - fastSpeedDelta / 2) < 1e-9
  );
  run("speed : même direction (même seed, seule la distance diffère)", Math.sign(fastSpeedDelta), Math.sign(slowSpeedDelta));

  // Frontière comportement/physique préservée : speed ne change RIEN à
  // l'état interne du comportement (phase/ticksLeft/dir), seulement à x —
  // preuve que la vitesse est appliquée APRÈS le comportement (résolution),
  // jamais lue par lui (wander.js n'a pas été touché par ce branchement).
  // behavior.speed : PRIME sur entity.speed, même résolution physique.
  function makeBehaviorSpeedScene(entitySpeed, behaviorSpeed) {
    const behavior = { kind: "wander", walkMinMs: 1000 * TICK_MS, walkMaxMs: 1000 * TICK_MS };
    if (behaviorSpeed !== undefined) behavior.speed = behaviorSpeed;
    const entity = { id: "e1", type: "dog", x: 50, speed: entitySpeed, behavior };
    return parseScene({ id: "movement-check-behavior-speed", titleKey: "scene.demo.name", length: 100, playerStart: 50, entities: [entity] }, SPEED_REGISTRY);
  }
  function distanceAfter50Ticks(scene) {
    let state = createInitialState(scene, 3);
    for (let i = 0; i < 50; i++) state = reduce(state, tick(0));
    return Math.abs(getActiveWorld(state).entities[0].x - 50);
  }
  const entitySpeedOnly = distanceAfter50Ticks(makeBehaviorSpeedScene(1, undefined));
  const behaviorSpeedWins = distanceAfter50Ticks(makeBehaviorSpeedScene(1, 0.5));
  const behaviorOverEntity = distanceAfter50Ticks(makeBehaviorSpeedScene(0.5, 2));
  run("behavior.speed : 0.5 sur une entité à 1 -> moitié de la distance", true, Math.abs(behaviorSpeedWins - entitySpeedOnly / 2) < 1e-9);
  run("behavior.speed : 2 sur une entité à 0.5 -> double de la distance à 1", true, Math.abs(behaviorOverEntity - entitySpeedOnly * 2) < 1e-9);
  run("behavior.speed : absent -> entity.speed s'applique", true, entitySpeedOnly > 0);

  // continueBias : 0 -> demi-tour à CHAQUE nouvelle marche ; 1 -> jamais.
  function walkDirections(continueBias) {
    const scene = parseScene(
      {
        id: `movement-check-continue-bias-${continueBias}`,
        titleKey: "scene.demo.name",
        length: 1000,
        playerStart: 500,
        entities: [{ id: "e1", type: "dog", x: 500, behavior: { kind: "wander", walkMinMs: 5 * TICK_MS, walkMaxMs: 5 * TICK_MS, pauseMinMs: 3 * TICK_MS, pauseMaxMs: 3 * TICK_MS, continueBias } }],
      },
      SPEED_REGISTRY
    );
    let state = createInitialState(scene, 7);
    const dirs = [];
    let previousPhase = null;
    for (let i = 0; i < 200; i++) {
      state = reduce(state, tick(0));
      const w = getActiveWorld(state).entities[0].wander;
      // Direction retenue à CHAQUE entrée en marche (transition pause -> marche).
      if (w.phase === "walk" && previousPhase === "pause") dirs.push(w.dir);
      previousPhase = w.phase;
    }
    return dirs;
  }
  const alwaysTurn = walkDirections(0);
  const neverTurn = walkDirections(1);
  run("continueBias : 0 -> plusieurs marches observées", true, alwaysTurn.length >= 10);
  run("continueBias : 0 -> demi-tour à chaque marche", true, alwaysTurn.every((dir, i) => i === 0 || dir === -alwaysTurn[i - 1]));
  run("continueBias : 1 -> toujours la même direction", true, neverTurn.length >= 10 && neverTurn.every((dir) => dir === neverTurn[0]));
  function expectBehaviorRejected(behavior) {
    return throws(() => parseScene({ id: "movement-check-bad-bias", titleKey: "scene.demo.name", length: 10, playerStart: 5, entities: [{ id: "e1", type: "dog", x: 5, behavior }] }, SPEED_REGISTRY));
  }
  run("continueBias : > 1 rejeté au chargement", true, expectBehaviorRejected({ kind: "wander", continueBias: 1.5 }));
  run("continueBias : négatif rejeté au chargement", true, expectBehaviorRejected({ kind: "wander", continueBias: -0.1 }));
  run("continueBias : non numérique rejeté au chargement", true, expectBehaviorRejected({ kind: "wander", continueBias: "souvent" }));

  run.same(
    "speed : état interne du comportement identique quelle que soit la vitesse (wander ignore speed)",
    { phase: fastSpeedEntity.wander.phase, ticksLeft: fastSpeedEntity.wander.ticksLeft, dir: fastSpeedEntity.wander.dir },
    { phase: slowSpeedEntity.wander.phase, ticksLeft: slowSpeedEntity.wander.ticksLeft, dir: slowSpeedEntity.wander.dir }
  );

  // Non-régression du JOUEUR : resolvePlayerMove SANS speed fourni avance
  // d'EXACTEMENT MOVE_STEP — le joueur ne fournit jamais de speed (voir
  // core/reduce.js), donc rien ne change pour lui.
  const playerMoveNoSpeed = resolvePlayerMove(5, 1, [], 10, { time: 0 });
  run("speed : resolvePlayerMove sans speed avance de MOVE_STEP (joueur rigoureusement inchangé)", 5 + MOVE_STEP, playerMoveNoSpeed.x);

  // follow ET goto respectent aussi speed (pas seulement wander) — un
  // compagnon pourrait avoir sa propre vitesse.
  const speedFollowScene = parseScene(
    {
      id: "movement-check-speed-follow",
      titleKey: "scene.demo.name",
      length: 100,
      playerStart: 50,
      entities: [
        { id: "follower", type: "dog", x: 40, speed: 0.5, behavior: { kind: "follow", targetId: "player", minDistance: 1, maxDistance: 3 } },
      ],
    },
    SPEED_REGISTRY
  );
  let speedFollowState = createInitialState(speedFollowScene, 1);
  speedFollowState = reduce(speedFollowState, tick(0)); // joueur immobile, follower loin -> avance vers lui
  const speedFollowDelta = getActiveWorld(speedFollowState).entities[0].x - 40;
  run("speed : follow avance de MOVE_STEP × speed (0.5)", true, Math.abs(speedFollowDelta - MOVE_STEP * 0.5) < 1e-9);

  const speedGotoScene = parseScene(
    {
      id: "movement-check-speed-goto",
      titleKey: "scene.demo.name",
      length: 100,
      playerStart: 50,
      entities: [
        { id: "walker", type: "dog", x: 10, speed: 0.5, behavior: { kind: "goto", targetId: "landmark" } },
        { id: "landmark", type: "dog", x: 90 },
      ],
    },
    SPEED_REGISTRY
  );
  let speedGotoState = createInitialState(speedGotoScene, 1);
  speedGotoState = reduce(speedGotoState, tick(0));
  const speedGotoDelta = getActiveWorld(speedGotoState).entities.find((e) => e.id === "walker").x - 10;
  run("speed : goto avance de MOVE_STEP × speed (0.5)", true, Math.abs(speedGotoDelta - MOVE_STEP * 0.5) < 1e-9);

  // --- Collision joueur/entité bloquante : signal de blocage (blockedBy) ---

  const BLOCKING_REGISTRY = { wall: { nameKey: "entity.wall.name", blocksMovement: true } };
  const blockingScene = parseScene(
    { id: "movement-check-blocking", titleKey: "scene.demo.name", length: 10, playerStart: 4, entities: [{ id: "wall-1", type: "wall", x: 5 }] },
    BLOCKING_REGISTRY
  );
  const wallEntity = blockingScene.entities[0];
  const expectedEdge = wallEntity.x - BODY_RADIUS; // bord du corps côté approche (dir=1)

  let blockState = createInitialState(blockingScene);
  for (let i = 0; i < 20; i++) {
    blockState = reduce(blockState, tick(1));
  }
  run("collision : joueur arrêté au bord du corps bloquant", expectedEdge, blockState.player.x);
  run("collision : blockedBy nomme l'entité bloquante", wallEntity.id, blockState.player.blockedBy);

  // Relâche (dir=0) : le signal retombe à null, position inchangée.
  blockState = reduce(blockState, tick(0));
  run("collision : blockedBy retombe à null au relâchement", null, blockState.player.blockedBy);
  run("collision : position inchangée au relâchement", expectedEdge, blockState.player.x);

  // Entité non bloquante (blocksMovement absent -> false) : ne freine jamais
  // le joueur, ne signale jamais de blocage. Comparé à une simulation SANS
  // entité (mêmes ticks, même arithmétique) plutôt qu'à une valeur
  // attendue en dur : seule façon d'obtenir une égalité exacte en flottant
  // sans dépendre du nombre de ticks nécessaires pour atteindre un bord.
  const NONBLOCKING_REGISTRY = { deco: { nameKey: "entity.deco.name" } };
  const passThroughScene = parseScene(
    { id: "movement-check-passthrough", titleKey: "scene.demo.name", length: 10, playerStart: 4, entities: [{ id: "deco-1", type: "deco", x: 5 }] },
    NONBLOCKING_REGISTRY
  );
  const emptyScene = parseScene(
    { id: "movement-check-passthrough-empty", titleKey: "scene.demo.name", length: 10, playerStart: 4, entities: [] },
    NONBLOCKING_REGISTRY
  );
  let passState = createInitialState(passThroughScene);
  let unobstructedState = createInitialState(emptyScene);
  for (let i = 0; i < 20; i++) {
    passState = reduce(passState, tick(1));
    unobstructedState = reduce(unobstructedState, tick(1));
  }
  run("collision : entité non bloquante ne freine jamais le joueur", unobstructedState.player.x, passState.player.x);
  run("collision : entité non bloquante ne signale jamais de blocage", null, passState.player.blockedBy);

  // Surcharge d'instance blocksMovement (JSON de scène), lue AVANT le défaut du
  // type — cascade identique à labelKey/descriptionKey.
  const overrideBlockScene = parseScene(
    { id: "movement-check-override-block", titleKey: "scene.demo.name", length: 10, playerStart: 4, entities: [{ id: "wall-2", type: "deco", x: 5, blocksMovement: true }] },
    NONBLOCKING_REGISTRY // type "deco" a blocksMovement absent (-> false par défaut)
  );
  run("collision : surcharge d'instance blocksMovement:true respectée", true, overrideBlockScene.entities[0].blocksMovement);
  let overrideBlockState = createInitialState(overrideBlockScene);
  for (let i = 0; i < 20; i++) {
    overrideBlockState = reduce(overrideBlockState, tick(1));
  }
  run("collision : entité surchargée bloquante freine bien le joueur", "wall-2", overrideBlockState.player.blockedBy);

  const overrideUnblockScene = parseScene(
    { id: "movement-check-override-unblock", titleKey: "scene.demo.name", length: 10, playerStart: 4, entities: [{ id: "wall-3", type: "wall", x: 5, blocksMovement: false }] },
    BLOCKING_REGISTRY // type "wall" a blocksMovement:true par défaut
  );
  run("collision : surcharge d'instance blocksMovement:false respectée", false, overrideUnblockScene.entities[0].blocksMovement);

  // blocksMovement présent mais invalide (pas un booléen) -> rejeté.
  const invalidBlockRejected = throws(() => {
    parseScene(
      { id: "movement-check-invalid-block", titleKey: "scene.demo.name", length: 10, playerStart: 4, entities: [{ id: "wall-4", type: "wall", x: 5, blocksMovement: "oui" }] },
      BLOCKING_REGISTRY
    );
  });
  run("collision : blocksMovement non booléen rejeté", true, invalidBlockRejected);

  // --- Robustesse : chevauchement de corps (curatif, au tick) ---

  const OVERLAP_REGISTRY = { wall: { nameKey: "entity.wall.name", blocksMovement: true } };

  // Deux entités impassables placées en chevauchement à leur spawn -> une
  // passe suffit à les séparer, et l'état est stable au tick suivant (si
  // rien d'autre ne bouge, rejouer la résolution ne change plus rien).
  const overlapScene = parseScene(
    {
      id: "movement-check-overlap",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 0,
      entities: [
        { id: "wall-a", type: "wall", x: 5 },
        { id: "wall-b", type: "wall", x: 5.1 },
      ],
    },
    OVERLAP_REGISTRY
  );
  let overlapState = createInitialState(overlapScene);
  overlapState = reduce(overlapState, tick(0));
  const [entA, entB] = getActiveWorld(overlapState).entities;
  run("chevauchement : deux entités impassables séparées en une passe", true, Math.abs(entB.x - entA.x) >= 2 * BODY_RADIUS);

  const overlapStateNextTick = reduce(overlapState, tick(0));
  run.same(
    "chevauchement : état stable au tick suivant (pas de jitter)",
    getActiveWorld(overlapState).entities.map((e) => e.x),
    getActiveWorld(overlapStateNextTick).entities.map((e) => e.x)
  );

  // Joueur placé dans le corps d'une entité impassable, avec de la marge :
  // priorité au joueur -> c'est l'ENTITÉ qui s'écarte, le joueur ne bouge
  // pas (position EXACTEMENT inchangée : le poids du joueur dans la
  // séparation est 0, donc son déplacement calculé est exactement 0, sans
  // aucun risque d'arrondi flottant).
  const playerInsideScene = parseScene(
    { id: "movement-check-overlap-player", titleKey: "scene.demo.name", length: 10, playerStart: 5, entities: [{ id: "wall-p", type: "wall", x: 5.1 }] },
    OVERLAP_REGISTRY
  );
  let playerInsideState = createInitialState(playerInsideScene);
  playerInsideState = reduce(playerInsideState, tick(0));
  run("chevauchement : joueur inchangé quand l'entité a la marge pour s'écarter", 5, playerInsideState.player.x);
  run("chevauchement : entité écartée, plus de recouvrement avec le joueur", true, Math.abs(getActiveWorld(playerInsideState).entities[0].x - 5) >= BODY_RADIUS);
  run("chevauchement : pas de signal pushedBy quand seule l'entité a bougé", null, playerInsideState.player.pushedBy);

  // Joueur ET entité près du même bord (x=0) : l'entité n'a plus de marge
  // pour s'écarter (clampée à 0, valeur EXACTE, aucun risque d'arrondi) ;
  // en dernier recours, c'est le joueur qui cède, du minimum, avec un
  // signal (jamais une téléportation silencieuse).
  const forcedRoomScene = parseScene(
    { id: "movement-check-overlap-forced", titleKey: "scene.demo.name", length: 10, playerStart: 0.05, entities: [{ id: "wall-forced", type: "wall", x: 0.02 }] },
    OVERLAP_REGISTRY
  );
  let forcedState = createInitialState(forcedRoomScene);
  forcedState = reduce(forcedState, tick(0));
  run("chevauchement : entité pinée au bord quand il n'y a plus de marge", 0, getActiveWorld(forcedState).entities[0].x);
  run("chevauchement : joueur forcé de bouger signale l'entité responsable", "wall-forced", forcedState.player.pushedBy);
  run("chevauchement : joueur déplacé (jamais téléporté en silence)", true, forcedState.player.x !== 0.05);
  run(
    "chevauchement : écart rétabli après déplacement forcé du joueur",
    true,
    Math.abs(getActiveWorld(forcedState).entities[0].x - forcedState.player.x) >= BODY_RADIUS - 1e-9
  );

  // Cas normal (pas de chevauchement) : la résolution ne bouge rien.
  const noOverlapScene = parseScene(
    { id: "movement-check-no-overlap", titleKey: "scene.demo.name", length: 10, playerStart: 2, entities: [{ id: "wall-far", type: "wall", x: 8 }] },
    OVERLAP_REGISTRY
  );
  let noOverlapState = createInitialState(noOverlapScene);
  noOverlapState = reduce(noOverlapState, tick(0));
  run("chevauchement : cas normal, aucun déplacement parasite (joueur)", 2, noOverlapState.player.x);
  run("chevauchement : cas normal, aucun déplacement parasite (entité)", 8, getActiveWorld(noOverlapState).entities[0].x);
  run("chevauchement : cas normal, pas de signal pushedBy", null, noOverlapState.player.pushedBy);

  // Validation au chargement : NON bloquant (parseScene ne lève jamais pour
  // un chevauchement), mais averti clairement (console.warn).
  let overlapWarned = false;
  const originalWarn = console.warn;
  console.warn = (...args) => {
    overlapWarned = true;
    originalWarn(...args);
  };
  const overlapLoadThrew = throws(() => {
    parseScene(
      {
        id: "movement-check-overlap-load",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 5,
        entities: [
          { id: "wall-load-a", type: "wall", x: 5 },
          { id: "wall-load-b", type: "wall", x: 5.05 },
        ],
      },
      OVERLAP_REGISTRY
    );
  });
  console.warn = originalWarn;
  run("chevauchement : parseScene reste non bloquant au chargement", false, overlapLoadThrew);
  run("chevauchement : parseScene avertit clairement au chargement", true, overlapWarned);

  // --- Pipeline core/physics/ : intentions (phase 1, comportement) +
  // physique (phase 2) combinées dans le même tick, sur une scène mêlant une
  // entité wander ET une entité bloquante — résultat déterministe.
  const PIPELINE_REGISTRY = { dog: { nameKey: "entity.dog.name" }, wall: { nameKey: "entity.wall.name", blocksMovement: true } };
  const pipelineScene = parseScene(
    {
      id: "movement-check-pipeline",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "pipeline-dog", type: "dog", x: 10, behavior: { kind: "wander" } },
        { id: "pipeline-wall", type: "wall", x: 2 },
      ],
    },
    PIPELINE_REGISTRY
  );
  function runPipeline() {
    let s = createInitialState(pipelineScene, 123);
    for (let i = 0; i < 60; i++) s = reduce(s, tick(1));
    return { playerX: s.player.x, blockedBy: s.player.blockedBy, dogX: getActiveWorld(s).entities[0].x };
  }
  run.same("pipeline : intentions + physique combinées, résultat déterministe", runPipeline(), runPipeline());
}
