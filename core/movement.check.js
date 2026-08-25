// Vérifications du déplacement du core, exécutables depuis la console du
// navigateur (Node n'est pas disponible sur cette machine). Pur : aucun DOM,
// aucun fetch. Le niveau est construit en dur via un objet littéral, passé à
// parseLevel — aucune dépendance hors des modules du core.

import { parseLevel } from "./level.js";
import { createInitialState, MOVE_STEP } from "./state.js";
import { tick } from "./actions.js";
import { reduce, BODY_RADIUS } from "./reduce.js";

const RAW_LEVEL = {
  id: "movement-check",
  titleKey: "level.demo.title",
  length: 10,
  playerStart: 5,
  entities: [],
};

// Pas d'entité dans le niveau de test : le registre peut rester vide.
const EMPTY_REGISTRY = {};

function check(label, expected, actual) {
  const pass = Object.is(expected, actual);
  console.log(pass ? `OK: ${label}` : `ECHEC: ${label} — attendu ${expected}, obtenu ${actual}`);
  return pass;
}

export function runMovementChecks() {
  let passed = 0;
  let total = 0;

  function run(label, expected, actual) {
    total += 1;
    if (check(label, expected, actual)) passed += 1;
  }

  const level = parseLevel(RAW_LEVEL, EMPTY_REGISTRY);

  // Quelques ticks à droite depuis le centre : x avance de MOVE_STEP par tick.
  let state = createInitialState(level);
  state = reduce(state, tick(1));
  state = reduce(state, tick(1));
  state = reduce(state, tick(1));
  run("3 ticks à droite depuis x=5", 5 + 3 * MOVE_STEP, state.player.x);

  // Clamp à gauche : depuis le bord 0, un tick à gauche reste à 0.
  const leftLevel = parseLevel({ ...RAW_LEVEL, playerStart: 0 }, EMPTY_REGISTRY);
  const leftState = reduce(createInitialState(leftLevel), tick(-1));
  run("clamp à gauche depuis x=0", 0, leftState.player.x);

  // Clamp à droite : depuis le bord length, un tick à droite reste à length.
  const rightLevel = parseLevel({ ...RAW_LEVEL, playerStart: RAW_LEVEL.length }, EMPTY_REGISTRY);
  const rightState = reduce(createInitialState(rightLevel), tick(1));
  run("clamp à droite depuis x=length", RAW_LEVEL.length, rightState.player.x);

  // Action inconnue -> état inchangé, MÊME référence (pas de nouvel objet).
  const before = createInitialState(level);
  const after = reduce(before, { type: "UNKNOWN" });
  run("action inconnue renvoie la même référence", before, after);

  // --- Errance (behavior wander) : PRNG seedé, déterminisme ---

  const WANDER_REGISTRY = { dog: { label: "entity.dog" } };

  function makeWanderLevel(overrides = {}) {
    return {
      id: "movement-check-wander",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 5,
      entities: [
        { id: "wander-1", type: "dog", x: 5, behavior: { kind: "wander", speed: 0.5, turnChance: 0.3 } },
      ],
      ...overrides,
    };
  }

  function runTicks(startState, count) {
    const positions = [];
    let current = startState;
    for (let i = 0; i < count; i++) {
      current = reduce(current, tick(0));
      positions.push(current.level.entities[0].x);
    }
    return { state: current, positions };
  }

  const wanderLevel = parseLevel(makeWanderLevel(), WANDER_REGISTRY);

  // Même seed, même suite de ticks -> trajectoire identique à chaque tick,
  // pas seulement au final.
  const run1 = runTicks(createInitialState(wanderLevel, 42), 50);
  const run2 = runTicks(createInitialState(wanderLevel, 42), 50);
  run(
    "errance : trajectoire reproductible (même seed)",
    JSON.stringify(run1.positions),
    JSON.stringify(run2.positions)
  );

  // Toujours dans les bornes du niveau, à chaque tick de la trajectoire.
  const allInBounds = run1.positions.every((x) => x >= 0 && x <= wanderLevel.length);
  run("errance : position toujours dans [0, length]", true, allInBounds);

  // Demi-tour à la borne : niveau très court, turnChance à 0 pour une
  // trajectoire prévisible (seul le rebond de bord entre en jeu).
  const tightLevel = parseLevel(
    makeWanderLevel({
      length: 1,
      playerStart: 0,
      entities: [{ id: "wander-1", type: "dog", x: 0.9, behavior: { kind: "wander", speed: 0.5, turnChance: 0 } }],
    }),
    WANDER_REGISTRY
  );
  let boundaryState = createInitialState(tightLevel, 7);
  boundaryState = reduce(boundaryState, tick(0)); // 0.9 + 0.5 = 1.4 -> bornée à length, direction inversée
  run("errance : position bornée à length après dépassement", tightLevel.length, boundaryState.level.entities[0].x);
  boundaryState = reduce(boundaryState, tick(0)); // direction -1 désormais : 1 - 0.5 = 0.5, repart vers l'intérieur
  run("errance : demi-tour effectif (repart vers l'intérieur)", 0.5, boundaryState.level.entities[0].x);

  // behavior.kind absent du registre (core/behaviors/index.js) -> parseLevel
  // échoue clairement, plutôt que d'ignorer silencieusement le comportement.
  let unknownKindRejected = false;
  try {
    parseLevel(
      makeWanderLevel({ entities: [{ id: "wander-1", type: "dog", x: 5, behavior: { kind: "fly" } }] }),
      WANDER_REGISTRY
    );
  } catch {
    unknownKindRejected = true;
  }
  run("errance : behavior.kind inconnu rejeté par le registre", true, unknownKindRejected);

  // --- Collision joueur/entité bloquante : signal de blocage (blockedBy) ---

  const BLOCKING_REGISTRY = { wall: { label: "entity.wall", blocksMovement: true } };
  const blockingLevel = parseLevel(
    { id: "movement-check-blocking", titleKey: "level.demo.title", length: 10, playerStart: 4, entities: [{ id: "wall-1", type: "wall", x: 5 }] },
    BLOCKING_REGISTRY
  );
  const wallEntity = blockingLevel.entities[0];
  const expectedEdge = wallEntity.x - BODY_RADIUS; // bord du corps côté approche (dir=1)

  let blockState = createInitialState(blockingLevel);
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
  const NONBLOCKING_REGISTRY = { deco: { label: "entity.deco" } };
  const passThroughLevel = parseLevel(
    { id: "movement-check-passthrough", titleKey: "level.demo.title", length: 10, playerStart: 4, entities: [{ id: "deco-1", type: "deco", x: 5 }] },
    NONBLOCKING_REGISTRY
  );
  const emptyLevel = parseLevel(
    { id: "movement-check-passthrough-empty", titleKey: "level.demo.title", length: 10, playerStart: 4, entities: [] },
    NONBLOCKING_REGISTRY
  );
  let passState = createInitialState(passThroughLevel);
  let unobstructedState = createInitialState(emptyLevel);
  for (let i = 0; i < 20; i++) {
    passState = reduce(passState, tick(1));
    unobstructedState = reduce(unobstructedState, tick(1));
  }
  run("collision : entité non bloquante ne freine jamais le joueur", unobstructedState.player.x, passState.player.x);
  run("collision : entité non bloquante ne signale jamais de blocage", null, passState.player.blockedBy);

  // Surcharge d'instance blocksMovement (level JSON), lue AVANT le défaut du
  // type — cascade identique à labelKey/descriptionKey.
  const overrideBlockLevel = parseLevel(
    { id: "movement-check-override-block", titleKey: "level.demo.title", length: 10, playerStart: 4, entities: [{ id: "wall-2", type: "deco", x: 5, blocksMovement: true }] },
    NONBLOCKING_REGISTRY // type "deco" a blocksMovement absent (-> false par défaut)
  );
  run("collision : surcharge d'instance blocksMovement:true respectée", true, overrideBlockLevel.entities[0].blocksMovement);
  let overrideBlockState = createInitialState(overrideBlockLevel);
  for (let i = 0; i < 20; i++) {
    overrideBlockState = reduce(overrideBlockState, tick(1));
  }
  run("collision : entité surchargée bloquante freine bien le joueur", "wall-2", overrideBlockState.player.blockedBy);

  const overrideUnblockLevel = parseLevel(
    { id: "movement-check-override-unblock", titleKey: "level.demo.title", length: 10, playerStart: 4, entities: [{ id: "wall-3", type: "wall", x: 5, blocksMovement: false }] },
    BLOCKING_REGISTRY // type "wall" a blocksMovement:true par défaut
  );
  run("collision : surcharge d'instance blocksMovement:false respectée", false, overrideUnblockLevel.entities[0].blocksMovement);

  // blocksMovement présent mais invalide (pas un booléen) -> rejeté.
  let invalidBlockRejected = false;
  try {
    parseLevel(
      { id: "movement-check-invalid-block", titleKey: "level.demo.title", length: 10, playerStart: 4, entities: [{ id: "wall-4", type: "wall", x: 5, blocksMovement: "oui" }] },
      BLOCKING_REGISTRY
    );
  } catch {
    invalidBlockRejected = true;
  }
  run("collision : blocksMovement non booléen rejeté", true, invalidBlockRejected);

  console.log(`Récapitulatif : ${passed} réussis / ${total} total`);
  return { passed, total };
}
