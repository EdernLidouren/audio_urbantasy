// Vérifications du core — domaine « behaviors ». Comportements d'entités :
// errance (wander), follow, goto, triggers de comportement. Lancées par
// core/checks/index.js/runChecks (voir ce fichier). Pur : aucun DOM, aucun
// fetch ; chaque scène est construite en dur via un objet littéral passé à
// parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, BODY_RADIUS } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { evaluateCondition, isPresent, resolveEntityRules } from "../presence.js";
import { DEFAULTS as WANDER_DEFAULTS } from "../behaviors/wander.js";
import { throws } from "../../lib/check.js";
import { NO_COMPANIONS, WANDER_REGISTRY, makeWanderScene, runTicks } from "./helpers.js";

export default function checkBehaviors(run) {
  // --- Errance (behavior wander) : machine à deux états (marche/pause),
  // PRNG seedé, déterminisme ---
  // wander ne se borne pas lui-même (voir behaviors/wander.js) : il produit
  // une intention (-1/0/+1, 0 en pause), résolue comme tout autre mobile à
  // intention par resolveBodyMove (core/physics/collision.js) — bornes ET
  // obstacles gérés par la MÊME physique, aucun test de borne propre à
  // wander ici (voir movement.check.js, section moveAndBounce).

  const wanderScene = parseScene(makeWanderScene(), WANDER_REGISTRY);

  // Même seed, même suite de ticks -> trajectoire ET séquence de phases
  // identiques, pas seulement la position finale (le tirage de durée/
  // direction doit, lui aussi, rester déterministe).
  const run1 = runTicks(createInitialState(wanderScene, 42, NO_COMPANIONS), 400);
  const run2 = runTicks(createInitialState(wanderScene, 42, NO_COMPANIONS), 400);
  run.same("errance : trajectoire reproductible (même seed)", run1.positions, run2.positions);
  run.same("errance : séquence de phases reproductible (même seed)", run1.phases, run2.phases);

  // Toujours dans les bornes de la scène, à chaque tick de la trajectoire.
  run("errance : position toujours dans [0, length]", true, run1.positions.every((x) => x >= 0 && x <= wanderScene.length));

  // Les deux états sont bien atteints avec les défauts (400 ticks >
  // walkMax : au moins une pause est nécessairement amorcée), et la phase
  // est lisible sur l'entité — crochet exploitable pour un son par état,
  // pas câblé ici.
  run("errance : la phase MARCHE est atteinte", true, run1.phases.includes("walk"));
  run("errance : la phase PAUSE est atteinte", true, run1.phases.includes("pause"));
  run(
    "errance : phase exposée sur l'entité (walk/pause), jamais une autre valeur",
    true,
    run1.phases.every((p) => p === "walk" || p === "pause")
  );

  // Défauts CALMES (item 1) : marches courtes, pauses nettement plus
  // longues — vérifié directement sur les constantes du module (jamais un
  // nombre dupliqué en dur ici, qui dériverait silencieusement si les
  // défauts changent).
  run("errance : défauts — marches plus courtes que les pauses", true, WANDER_DEFAULTS.walkMax <= WANDER_DEFAULTS.pauseMin);

  // Découpe une séquence de phases en plages contiguës {phase, length} —
  // sert à vérifier que chaque plage COMPLÈTE (bornée des deux côtés par le
  // test, contrairement à la toute première ou toute dernière qui peuvent
  // être tronquées par les limites du run) reste dans sa fourchette
  // déclarée.
  function phaseRuns(phases) {
    const runs = [];
    for (const phase of phases) {
      const last = runs[runs.length - 1];
      if (last && last.phase === phase) last.length += 1;
      else runs.push({ phase, length: 1 });
    }
    return runs;
  }

  // Fourchettes SERRÉES dédiées : sur un budget de ticks raisonnable, fait
  // apparaître PLUSIEURS plages complètes des deux états (contrairement aux
  // défauts calmes ci-dessus, où une seule pause tient à peine dans 400
  // ticks) — isole la mécanique de bascule/tirage de la question du rythme.
  const machineScene = parseScene(
    makeWanderScene({
      entities: [{ id: "wander-1", type: "dog", x: 5, behavior: { kind: "wander", walkMin: 3, walkMax: 6, pauseMin: 4, pauseMax: 8 } }],
    }),
    WANDER_REGISTRY
  );
  const machineRun = runTicks(createInitialState(machineScene, 99, NO_COMPANIONS), 300);
  const machineRuns = phaseRuns(machineRun.phases);
  const completeMachineRuns = machineRuns.slice(1, -1); // écarte la 1ère (déjà en cours) et la dernière (pas finie)
  run("errance : plusieurs plages complètes observées (fourchettes serrées)", true, completeMachineRuns.length >= 10);
  run(
    "errance : chaque plage de marche reste dans [walkMin, walkMax]",
    true,
    completeMachineRuns.filter((r) => r.phase === "walk").every((r) => r.length >= 3 && r.length <= 6)
  );
  run(
    "errance : chaque plage de pause reste dans [pauseMin, pauseMax]",
    true,
    completeMachineRuns.filter((r) => r.phase === "pause").every((r) => r.length >= 4 && r.length <= 8)
  );

  // Préférence de continuité (item 2) : sur les mêmes fourchettes serrées,
  // la direction n'est PAS un pur pile-ou-face à chaque nouvelle marche —
  // au moins une reprise (même direction que la marche précédente) ET au
  // moins un vrai demi-tour doivent apparaître (sans quoi le biais serait
  // absolu dans un sens ou dans l'autre, jamais l'intention).
  const machineDirs = [];
  {
    let s = createInitialState(machineScene, 99, NO_COMPANIONS);
    let previousPhase = null;
    for (let i = 0; i < 300; i++) {
      s = reduce(s, tick(0));
      const w = getActiveWorld(s).entities[0].wander;
      if (w.phase === "walk" && previousPhase !== "walk") machineDirs.push(w.dir);
      previousPhase = w.phase;
    }
  }
  const continuations = machineDirs.slice(1).filter((d, i) => d === machineDirs[i]).length;
  const reversals = machineDirs.length - 1 - continuations;
  run("errance : au moins une reprise de direction observée (pas de ping-pong systématique)", true, continuations >= 1);
  run("errance : au moins un vrai demi-tour observé (pas figée dans un seul sens)", true, reversals >= 1);

  // Rebond au bord de la scène (item 3) : phase de marche FORCÉE assez longue
  // pour ne jamais expirer seule (walkMin=walkMax élevé) — isole le rebond
  // de toute bascule naturelle. Scène étroite : quelle que soit la
  // direction tirée au départ, un bord est atteint vite.
  const boundaryScene = parseScene(
    makeWanderScene({
      length: 1,
      entities: [{ id: "wander-1", type: "dog", x: 0.5, behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 } }],
    }),
    WANDER_REGISTRY
  );
  let boundaryState = createInitialState(boundaryScene, 7, NO_COMPANIONS);
  const boundaryXs = [];
  const boundaryDirs = new Set();
  for (let i = 0; i < 40; i++) {
    boundaryState = reduce(boundaryState, tick(0));
    const w = getActiveWorld(boundaryState).entities[0].wander;
    boundaryXs.push(getActiveWorld(boundaryState).entities[0].x);
    boundaryDirs.add(w.dir);
  }
  run("errance : jamais hors bornes malgré une marche forcée continue", true, boundaryXs.every((x) => x >= 0 && x <= 1));
  run("errance : rebondit au bord (les deux directions observées)", true, boundaryDirs.has(1) && boundaryDirs.has(-1));

  // Rebond sur un obstacle impassable (item 3) : même principe que le bord,
  // mais contre une entité bloquante — corridor étroit entre deux murs,
  // entité centrée : quelle que soit la direction tirée, elle atteint vite
  // un mur, jamais ne le traverse, jamais ne reste collée à pousser dedans.
  const obstacleScene = parseScene(
    makeWanderScene({
      length: 20,
      entities: [
        { id: "wall-left", type: "wall", x: 5 },
        { id: "wander-1", type: "dog", x: 6, behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 } },
        { id: "wall-right", type: "wall", x: 7 },
      ],
    }),
    WANDER_REGISTRY
  );
  let obstacleState = createInitialState(obstacleScene, 7, NO_COMPANIONS);
  const obstacleXs = [];
  const obstacleDirs = new Set();
  for (let i = 0; i < 60; i++) {
    obstacleState = reduce(obstacleState, tick(0));
    const entity = getActiveWorld(obstacleState).entities.find((e) => e.id === "wander-1");
    obstacleXs.push(entity.x);
    obstacleDirs.add(entity.wander.dir);
  }
  // Corridor : [5 + 2*BODY_RADIUS, 7 - 2*BODY_RADIUS] = [5.5, 6.5].
  run(
    "errance : jamais de traversée d'un obstacle bloquant (corridor respecté)",
    true,
    obstacleXs.every((x) => x >= 5.5 - 1e-9 && x <= 6.5 + 1e-9)
  );
  run("errance : rebondit sur un obstacle (les deux directions observées)", true, obstacleDirs.has(1) && obstacleDirs.has(-1));

  // Validation au chargement : fourchettes cohérentes (min <= max) et
  // entières (>= 1 tick) — même politique que minDistance/maxDistance
  // (follow.js) ou targetId (goto.js) : une donnée de contenu incohérente
  // échoue clairement, jamais une dégradation silencieuse.
  function expectWanderRejected(behaviorOverride) {
    return throws(() => parseScene(makeWanderScene({ entities: [{ id: "wander-1", type: "dog", x: 5, behavior: { kind: "wander", ...behaviorOverride } }] }), WANDER_REGISTRY));
  }
  run("errance : walkMin > walkMax rejeté au chargement", true, expectWanderRejected({ walkMin: 10, walkMax: 5 }));
  run("errance : pauseMin > pauseMax rejeté au chargement", true, expectWanderRejected({ pauseMin: 10, pauseMax: 5 }));
  run("errance : walkMin non entier rejeté au chargement", true, expectWanderRejected({ walkMin: 1.5 }));
  run("errance : walkMin < 1 rejeté au chargement", true, expectWanderRejected({ walkMin: 0 }));

  // Sérialisabilité : l'état wander (phase/ticksLeft/dir/prevX) survit à un
  // aller-retour JSON, comme tout autre champ d'entité.
  const serializedWanderEntity = JSON.parse(JSON.stringify(getActiveWorld(run1.state).entities[0]));
  run.same(
    "errance : état wander survit à un aller-retour JSON",
    getActiveWorld(run1.state).entities[0].wander,
    serializedWanderEntity.wander
  );

  // behavior.kind absent du registre (core/behaviors/index.js) -> parseScene
  // échoue clairement, plutôt que d'ignorer silencieusement le comportement.
  const unknownKindRejected = throws(() => {
    parseScene(
      makeWanderScene({ entities: [{ id: "wander-1", type: "dog", x: 5, behavior: { kind: "fly" } }] }),
      WANDER_REGISTRY
    );
  });
  run("errance : behavior.kind inconnu rejeté par le registre", true, unknownKindRejected);

  // --- Comportement "follow" (voir core/behaviors/follow.js) ---
  // Testé sur des entités du MONDE dédiées (pas les compagnons ci-dessus) :
  // follow est un comportement générique, réutilisable par toute entité —
  // ce découpage isole la logique du comportement de celle du cercle
  // partie, couverte par companions.check.js.

  const FOLLOW_REGISTRY = { dog: { nameKey: "entity.dog.name" }, wall: { nameKey: "entity.wall.name", blocksMovement: true } };

  // Cible statique (sans behavior) : cadre de test simple, aucun mouvement
  // parasite à modéliser.
  function makeFollowScene(overrides = {}) {
    return {
      id: "movement-check-follow",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "anchor-1", type: "dog", x: 15 },
        { id: "follower-1", type: "dog", x: 0, behavior: { kind: "follow", targetId: "anchor-1", minDistance: 1, maxDistance: 3 } },
      ],
      ...overrides,
    };
  }

  function followerX(followState, id = "follower-1") {
    return getActiveWorld(followState).entities.find((e) => e.id === id).x;
  }

  const followScene = parseScene(makeFollowScene(), FOLLOW_REGISTRY);

  // Cible hors de portée (distance 15 > maxDistance 3) : le suiveur se
  // rapproche, jusqu'à entrer dans la zone morte — puis s'arrête, sans
  // jamais coller à la cible (distance >= minDistance en permanence).
  let followState = createInitialState(followScene, 1, NO_COMPANIONS);
  for (let i = 0; i < 500; i++) followState = reduce(followState, tick(0));
  const followerSettled = followerX(followState);
  run("follow : se rapproche d'une cible hors de portée", true, followerSettled > 0);
  run("follow : s'arrête dans la zone morte (distance <= maxDistance)", true, 15 - followerSettled <= 3);
  run("follow : ne colle jamais à la cible (distance >= minDistance)", true, 15 - followerSettled >= 1);

  // Une fois dans la zone morte, il y reste : aucun autre tick ne le fait
  // plus bouger (pas d'oscillation, pas de dérive).
  for (let i = 0; i < 50; i++) followState = reduce(followState, tick(0));
  run("follow : reste immobile une fois dans la zone morte", followerSettled, followerX(followState));

  // Cible qui s'approche trop (< minDistance) : le suiveur NE RECULE PAS —
  // il reste exactement où il est, ni en avant ni en arrière.
  const closeScene = parseScene(
    makeFollowScene({
      entities: [
        { id: "anchor-1", type: "dog", x: 10 },
        { id: "follower-1", type: "dog", x: 9.7, behavior: { kind: "follow", targetId: "anchor-1", minDistance: 1, maxDistance: 3 } },
      ],
    }),
    FOLLOW_REGISTRY
  );
  let closeState = createInitialState(closeScene, 1, NO_COMPANIONS);
  for (let i = 0; i < 100; i++) closeState = reduce(closeState, tick(0));
  run("follow : ne recule jamais quand la cible est trop proche", 9.7, followerX(closeState));

  // Déterminisme : même point de départ, même suite de ticks -> même
  // trajectoire, à chaque tick (pas seulement au résultat final) — aucun
  // PRNG consommé (voir follow.js).
  function runFollowTicks(startState, count) {
    const positions = [];
    let current = startState;
    for (let i = 0; i < count; i++) {
      current = reduce(current, tick(0));
      positions.push(followerX(current));
    }
    return positions;
  }
  const followRun1 = runFollowTicks(createInitialState(followScene, 1, NO_COMPANIONS), 100);
  const followRun2 = runFollowTicks(createInitialState(followScene, 1, NO_COMPANIONS), 100);
  run.same("follow : trajectoire reproductible (déterministe, sans PRNG)", followRun1, followRun2);

  // minDistance >= maxDistance : incohérent (zone morte nulle ou inversée),
  // rejeté au chargement.
  const followMinMaxRejected = throws(() => {
    parseScene(
      makeFollowScene({
        entities: [
          { id: "anchor-1", type: "dog", x: 15 },
          { id: "follower-1", type: "dog", x: 0, behavior: { kind: "follow", minDistance: 3, maxDistance: 2 } },
        ],
      }),
      FOLLOW_REGISTRY
    );
  });
  run("follow : minDistance >= maxDistance rejeté (incohérent)", true, followMinMaxRejected);

  // Le joueur dépasse le suiveur (passe de l'autre côté) : le suivi
  // s'inverse SANS code spécial — direction recalculée à chaque tick depuis
  // la position courante, jamais mémorisée (voir follow.js). Cible par
  // défaut (targetId omis) : le joueur.
  const passScene = parseScene(
    {
      id: "movement-check-follow-pass",
      titleKey: "scene.demo.name",
      length: 30,
      playerStart: 20,
      entities: [{ id: "follower-2", type: "dog", x: 15, behavior: { kind: "follow", minDistance: 1, maxDistance: 3 } }],
    },
    FOLLOW_REGISTRY
  );
  let followPassState = createInitialState(passScene, 1, NO_COMPANIONS);
  // Le joueur reste immobile : le suiveur (distance 5 > 3) se rapproche et
  // se stabilise derrière lui, à gauche.
  for (let i = 0; i < 300; i++) followPassState = reduce(followPassState, tick(0));
  const followerBeforePass = followerX(followPassState, "follower-2");
  run("follow : avant d'être dépassé, suit depuis la gauche", true, followerBeforePass < followPassState.player.x);

  // Le joueur traverse toute la scène vers la gauche, passe le suiveur, et
  // continue jusqu'à l'autre bord.
  for (let i = 0; i < 800; i++) followPassState = reduce(followPassState, tick(-1));
  const followerAfterPass = followerX(followPassState, "follower-2");
  run("follow : après avoir été dépassé, suit depuis la droite (suivi inversé)", true, followerAfterPass > followPassState.player.x);
  run(
    "follow : reste dans la zone morte après l'inversion",
    true,
    Math.abs(followerAfterPass - followPassState.player.x) <= 3 && Math.abs(followerAfterPass - followPassState.player.x) >= 1
  );

  // Obstacle bloquant entre la cible et le suiveur : celui-ci intentionne
  // d'avancer, la PHYSIQUE (resolveBodyMove, voir core/physics/collision.js)
  // l'arrête pile au contact — jamais de traversée, et le bloqueur lui-même
  // ne bouge jamais (voir les deux assertions ci-dessous).
  const blockedFollowScene = parseScene(
    {
      id: "movement-check-follow-blocked",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "anchor-1", type: "dog", x: 15 },
        { id: "wall-follow", type: "wall", x: 8 },
        { id: "follower-3", type: "dog", x: 0, behavior: { kind: "follow", targetId: "anchor-1", minDistance: 1, maxDistance: 3 } },
      ],
    },
    FOLLOW_REGISTRY
  );
  let blockedFollowState = createInitialState(blockedFollowScene, 1, NO_COMPANIONS);
  for (let i = 0; i < 500; i++) blockedFollowState = reduce(blockedFollowState, tick(0));
  run(
    "follow : un obstacle bloquant l'arrête au contact (pas de traversée)",
    8 - 2 * BODY_RADIUS,
    followerX(blockedFollowState, "follower-3")
  );
  // Stabilité : le mur ne doit JAMAIS avoir bougé (voir reduce.js/
  // resolveIntents pour pourquoi un décalage y est nécessaire).
  run(
    "follow : l'obstacle bloquant lui-même ne bouge jamais",
    8,
    getActiveWorld(blockedFollowState).entities.find((e) => e.id === "wall-follow").x
  );

  // Cible introuvable (cas limite : un targetId qui ne correspond à AUCUNE
  // entité connue) : follow.js dégrade proprement (intent: 0),
  // jamais de crash. Le joueur, cible par défaut, existe toujours : ce cas
  // ne peut survenir qu'avec un targetId explicite et erroné.
  const missingTargetScene = parseScene(
    makeFollowScene({
      entities: [{ id: "follower-1", type: "dog", x: 5, behavior: { kind: "follow", targetId: "does-not-exist" } }],
    }),
    FOLLOW_REGISTRY
  );
  let missingTargetState = createInitialState(missingTargetScene, 1, NO_COMPANIONS);
  const missingTargetThrew = throws(() => {
    for (let i = 0; i < 100; i++) missingTargetState = reduce(missingTargetState, tick(0));
  });
  run("follow : cible introuvable ne fait jamais planter le tick", false, missingTargetThrew);
  run("follow : cible introuvable -> reste immobile (dégradation propre)", 5, followerX(missingTargetState));

  // --- Comportement "goto" (voir core/behaviors/goto.js) ---
  // Variante de follow SANS zone morte élastique, avec arrêt + signal
  // d'arrivée (gotoArrived) — cible fixe donnée en dur ici ; les triggers
  // qui posent un goto sont testés plus bas ("Triggers de comportement").

  const GOTO_REGISTRY = { dog: { nameKey: "entity.dog.name" }, wall: { nameKey: "entity.wall.name", blocksMovement: true } };

  function makeGotoScene(overrides = {}) {
    return {
      id: "movement-check-goto",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "anchor-1", type: "dog", x: 15 },
        { id: "goer-1", type: "dog", x: 0, behavior: { kind: "goto", targetId: "anchor-1" } },
      ],
      ...overrides,
    };
  }

  function goerX(gotoState, id = "goer-1") {
    return getActiveWorld(gotoState).entities.find((e) => e.id === id).x;
  }

  const gotoScene = parseScene(makeGotoScene(), GOTO_REGISTRY);

  // Convergence + arrêt : avance vers la cible jusqu'à atteindre
  // arriveDistance (2×BODY_RADIUS par défaut, voir goto.js), puis
  // s'arrête, sans jamais dépasser la cible.
  let gotoState = createInitialState(gotoScene, 1, NO_COMPANIONS);
  for (let i = 0; i < 500; i++) gotoState = reduce(gotoState, tick(0));
  const settledDistance = 15 - goerX(gotoState);
  run("goto : converge vers la cible et s'arrête à arriveDistance", true, settledDistance <= 2 * BODY_RADIUS + 1e-9);
  run("goto : ne dépasse jamais la cible", true, goerX(gotoState) <= 15);
  run(
    "goto : signale son arrivée (gotoArrived)",
    true,
    getActiveWorld(gotoState).entities.find((e) => e.id === "goer-1").gotoArrived
  );

  // Une fois arrivé, reste immobile — rejoué à un tick suivant, aucun
  // changement (pas d'oscillation, pas de dérive).
  const settledX = goerX(gotoState);
  gotoState = reduce(gotoState, tick(0));
  run("goto : reste immobile une fois arrivé", settledX, goerX(gotoState));

  // Déterminisme : même point de départ, même trajectoire à CHAQUE tick
  // (pas seulement au résultat final) — aucun PRNG consommé (voir goto.js).
  function runGotoTicks(startState, count) {
    const positions = [];
    let current = startState;
    for (let i = 0; i < count; i++) {
      current = reduce(current, tick(0));
      positions.push(goerX(current));
    }
    return positions;
  }
  const gotoRun1 = runGotoTicks(createInitialState(gotoScene, 1, NO_COMPANIONS), 200);
  const gotoRun2 = runGotoTicks(createInitialState(gotoScene, 1, NO_COMPANIONS), 200);
  run.same("goto : trajectoire reproductible (déterministe, sans PRNG)", gotoRun1, gotoRun2);

  // Cible introuvable : dégrade proprement (intent: 0, jamais de crash) —
  // gotoArrived jamais posé, une impossibilité de progresser n'est pas une
  // arrivée (la dégradation en présence pour ce cas reste à la charge de
  // l'appelant).
  const missingGotoTargetScene = parseScene(
    makeGotoScene({
      entities: [{ id: "goer-1", type: "dog", x: 5, behavior: { kind: "goto", targetId: "does-not-exist" } }],
    }),
    GOTO_REGISTRY
  );
  let missingGotoTargetState = createInitialState(missingGotoTargetScene, 1, NO_COMPANIONS);
  const missingGotoTargetThrew = throws(() => {
    for (let i = 0; i < 100; i++) missingGotoTargetState = reduce(missingGotoTargetState, tick(0));
  });
  run("goto : cible introuvable ne fait jamais planter le tick", false, missingGotoTargetThrew);
  run("goto : cible introuvable -> reste immobile (dégradation propre)", 5, goerX(missingGotoTargetState));
  run(
    "goto : cible introuvable -> jamais de gotoArrived",
    undefined,
    getActiveWorld(missingGotoTargetState).entities.find((e) => e.id === "goer-1").gotoArrived
  );

  // Obstacle bloquant entre le mobile et sa cible : la PHYSIQUE
  // (resolveBodyMove) l'arrête pile au contact — jamais de traversée,
  // jamais d'arrivée (le mobile n'atteint jamais arriveDistance de la
  // cible, coincé contre l'obstacle) — même principe que follow.js.
  const blockedGotoScene = parseScene(
    makeGotoScene({
      entities: [
        { id: "anchor-1", type: "dog", x: 15 },
        { id: "wall-goto", type: "wall", x: 8 },
        { id: "goer-1", type: "dog", x: 0, behavior: { kind: "goto", targetId: "anchor-1" } },
      ],
    }),
    GOTO_REGISTRY
  );
  let blockedGotoState = createInitialState(blockedGotoScene, 1, NO_COMPANIONS);
  for (let i = 0; i < 500; i++) blockedGotoState = reduce(blockedGotoState, tick(0));
  run("goto : un obstacle bloquant l'arrête au contact (pas de traversée)", 8 - 2 * BODY_RADIUS, goerX(blockedGotoState));
  run(
    "goto : bloqué par un obstacle -> jamais arrivé (gotoArrived non posé)",
    undefined,
    getActiveWorld(blockedGotoState).entities.find((e) => e.id === "goer-1").gotoArrived
  );
  run(
    "goto : l'obstacle bloquant lui-même ne bouge jamais",
    8,
    getActiveWorld(blockedGotoState).entities.find((e) => e.id === "wall-goto").x
  );

  // Validation au chargement : targetId REQUIS (contrairement à follow, qui
  // retombe sur "player") — absent -> échec clair, jamais un repli
  // silencieux (une cible manquante par erreur d'auteur doit se voir tout
  // de suite, pas se dégrader en immobilité muette).
  const missingTargetIdRejected = throws(() => parseScene(makeGotoScene({ entities: [{ id: "goer-1", type: "dog", x: 0, behavior: { kind: "goto" } }] }), GOTO_REGISTRY));
  run("goto : targetId manquant rejeté au chargement (requis, pas de repli)", true, missingTargetIdRejected);

  const invalidArriveDistanceRejected = throws(() => {
    parseScene(
      makeGotoScene({
        entities: [{ id: "goer-1", type: "dog", x: 0, behavior: { kind: "goto", targetId: "anchor-1", arriveDistance: -1 } }],
      }),
      GOTO_REGISTRY
    );
  });
  run("goto : arriveDistance invalide (<=0) rejeté au chargement", true, invalidArriveDistanceRejected);

  // --- Triggers de comportement (voir core/presence.js) ---
  // L'évaluateur de conditions ÉLARGI : une règle porte { when, effects }.
  // "arrived" (nouvelle condition, événementielle) et l'effet "behavior"
  // (nouveau, pose un comportement sur la BASCULE de sa condition, jamais
  // en continu) — voir resolveEntityRules pour le détail.

  // Rétrocompat : le raccourci { when, present } (sans effects) reste
  // compris DIRECTEMENT par resolveEntityRules/isPresent, sans passer par
  // parseScene — même résultat que sa forme canonique équivalente.
  const shorthandEntity = { id: "shorthand-test", presence: [{ when: { type: "timeRange", from: 20, to: 6 }, present: true }] };
  const canonicalEntity = {
    id: "canonical-test",
    presence: [{ when: { type: "timeRange", from: 20, to: 6 }, effects: [{ type: "presence", present: true }] }],
  };
  run("triggers : raccourci {when,present} — nuit -> présente", true, isPresent(shorthandEntity, { time: 23 * 60 }));
  run(
    "triggers : forme canonique {when,effects} équivalente au raccourci",
    isPresent(shorthandEntity, { time: 23 * 60 }),
    isPresent(canonicalEntity, { time: 23 * 60 })
  );

  // Une règle peut porter PLUSIEURS effets à la fois (ex. présent + un
  // comportement) — les deux s'appliquent ensemble sur la même bascule.
  const multiEffectEntity = {
    id: "multi-effect-test",
    presence: [
      {
        when: { type: "timeRange", from: 8, to: 20 },
        effects: [
          { type: "presence", present: true },
          { type: "behavior", behavior: { kind: "wander"} },
        ],
      },
    ],
  };
  const multiEffectResolved = resolveEntityRules(multiEffectEntity, { time: 10 * 60 });
  run("triggers : plusieurs effets sur une même règle — présence appliquée", true, multiEffectResolved.present);
  run(
    "triggers : plusieurs effets sur une même règle — comportement AUSSI posé (1er calcul)",
    "wander",
    multiEffectResolved.behaviorEffect && multiEffectResolved.behaviorEffect.kind
  );

  // Condition "arrived" : vraie seulement si le comportement ACTIF est
  // ENCORE "goto" ET qu'il a atteint sa cible — jamais vraie sans
  // comportement, avec un autre comportement, ou avec gotoArrived non posé.
  run("triggers : arrived — sans comportement -> jamais vraie", false, evaluateCondition({ type: "arrived" }, { entity: {} }));
  run(
    "triggers : arrived — comportement 'wander' (pas goto) -> jamais vraie même si gotoArrived traîne",
    false,
    evaluateCondition({ type: "arrived" }, { entity: { behavior: { kind: "wander" }, gotoArrived: true } })
  );
  run(
    "triggers : arrived — goto actif mais gotoArrived non posé -> pas encore arrivée",
    false,
    evaluateCondition({ type: "arrived" }, { entity: { behavior: { kind: "goto" } } })
  );
  run(
    "triggers : arrived — goto actif ET gotoArrived posé -> arrivée",
    true,
    evaluateCondition({ type: "arrived" }, { entity: { behavior: { kind: "goto" }, gotoArrived: true } })
  );
  // Non-régression du filet anti-péremption (voir header de evaluateArrived
  // dans core/presence.js) : gotoArrived reste posé pour toujours par
  // goto.js, mais une fois le comportement REMPLACÉ par autre chose que
  // "goto", "arrived" redevient FAUSSE — sans ce garde-fou, une entité
  // resterait bloquée dormante pour toujours après sa toute première
  // arrivée, même après un nouveau cycle "goto" reposé plus tard.
  run(
    "triggers : arrived — gotoArrived périmé (comportement déjà changé) -> plus vraie",
    false,
    evaluateCondition({ type: "arrived" }, { entity: { behavior: { kind: "wander" }, gotoArrived: true } })
  );

  // Effet "behavior" appliqué SEULEMENT sur la bascule (faux -> vrai) —
  // JAMAIS réappliqué tant que la condition reste vraie. Vérifié via une
  // entité SANS historique (ruleActive absent) au premier calcul, PUIS avec
  // un historique déjà "actif" au second.
  const alwaysTrueRule = {
    when: { type: "timeRange", from: 0, to: 24 },
    effects: [{ type: "behavior", behavior: { kind: "wander"} }],
  };
  const freshTrigger = resolveEntityRules({ id: "fresh", presence: [alwaysTrueRule] }, { time: 10 * 60 });
  run(
    "triggers : comportement posé dès le 1er calcul si la condition est DÉJÀ vraie (pas de bascule fantôme requise ici)",
    "wander",
    freshTrigger.behaviorEffect && freshTrigger.behaviorEffect.kind
  );
  const alreadyActiveEntity = { id: "already-active", presence: [alwaysTrueRule], ruleActive: [true] };
  const repeatedTrigger = resolveEntityRules(alreadyActiveEntity, { time: 11 * 60 });
  run(
    "triggers : comportement PAS réappliqué tant que la condition reste vraie (pas réarmé en boucle)",
    undefined,
    repeatedTrigger.behaviorEffect
  );
  const justFlippedEntity = { id: "just-flipped", presence: [alwaysTrueRule], ruleActive: [false] };
  const reflippedTrigger = resolveEntityRules(justFlippedEntity, { time: 11 * 60 });
  run(
    "triggers : comportement réappliqué à la bascule SUIVANTE (faux -> vrai à nouveau)",
    "wander",
    reflippedTrigger.behaviorEffect && reflippedTrigger.behaviorEffect.kind
  );

  // Validation au chargement : un effet "behavior" réutilise EXACTEMENT la
  // même validation que le champ `behavior` d'une entité (voir
  // core/scene.js/parseBehavior) — un kind inconnu est rejeté clairement,
  // jamais un crash silencieux plus tard.
  const TRIGGER_REGISTRY = { dog: { nameKey: "entity.dog.name" } };
  const unknownEffectBehaviorRejected = throws(() => {
    parseScene(
      {
        id: "movement-check-trigger-invalid",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "bad-trigger",
            type: "dog",
            x: 5,
            presence: [{ when: { type: "timeRange", from: 0, to: 24 }, effects: [{ type: "behavior", behavior: { kind: "does-not-exist" } }] }],
          },
        ],
      },
      TRIGGER_REGISTRY
    );
  });
  run("triggers : kind de comportement inconnu dans un effet -> rejeté au chargement", true, unknownEffectBehaviorRejected);
}
