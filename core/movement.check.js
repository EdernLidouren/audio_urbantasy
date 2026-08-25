// Vérifications du déplacement du core, exécutables depuis la console du
// navigateur (Node n'est pas disponible sur cette machine). Pur : aucun DOM,
// aucun fetch. Le niveau est construit en dur via un objet littéral, passé à
// parseLevel — aucune dépendance hors des modules du core.

import { parseLevel } from "./level.js";
import { createInitialState, getActiveWorld, travelToWorld, MOVE_STEP, BODY_RADIUS } from "./state.js";
import { tick } from "./actions.js";
import { reduce } from "./reduce.js";
import { moveAndBounce } from "./physics/movement.js";
import { SAVE_VERSION, serializeGame, deserializeGame } from "./save.js";

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
      positions.push(getActiveWorld(current).entities[0].x);
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
  run("errance : position bornée à length après dépassement", tightLevel.length, getActiveWorld(boundaryState).entities[0].x);
  boundaryState = reduce(boundaryState, tick(0)); // direction -1 désormais : 1 - 0.5 = 0.5, repart vers l'intérieur
  run("errance : demi-tour effectif (repart vers l'intérieur)", 0.5, getActiveWorld(boundaryState).entities[0].x);

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

  // --- Robustesse : chevauchement de corps (curatif, au tick) ---

  const OVERLAP_REGISTRY = { wall: { label: "entity.wall", blocksMovement: true } };

  // Deux entités impassables placées en chevauchement à leur spawn -> une
  // passe suffit à les séparer, et l'état est stable au tick suivant (si
  // rien d'autre ne bouge, rejouer la résolution ne change plus rien).
  const overlapLevel = parseLevel(
    {
      id: "movement-check-overlap",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      entities: [
        { id: "wall-a", type: "wall", x: 5 },
        { id: "wall-b", type: "wall", x: 5.1 },
      ],
    },
    OVERLAP_REGISTRY
  );
  let overlapState = createInitialState(overlapLevel);
  overlapState = reduce(overlapState, tick(0));
  const [entA, entB] = getActiveWorld(overlapState).entities;
  run("chevauchement : deux entités impassables séparées en une passe", true, Math.abs(entB.x - entA.x) >= 2 * BODY_RADIUS);

  const overlapStateNextTick = reduce(overlapState, tick(0));
  run(
    "chevauchement : état stable au tick suivant (pas de jitter)",
    JSON.stringify(getActiveWorld(overlapState).entities.map((e) => e.x)),
    JSON.stringify(getActiveWorld(overlapStateNextTick).entities.map((e) => e.x))
  );

  // Joueur placé dans le corps d'une entité impassable, avec de la marge :
  // priorité au joueur -> c'est l'ENTITÉ qui s'écarte, le joueur ne bouge
  // pas (position EXACTEMENT inchangée : le poids du joueur dans la
  // séparation est 0, donc son déplacement calculé est exactement 0, sans
  // aucun risque d'arrondi flottant).
  const playerInsideLevel = parseLevel(
    { id: "movement-check-overlap-player", titleKey: "level.demo.title", length: 10, playerStart: 5, entities: [{ id: "wall-p", type: "wall", x: 5.1 }] },
    OVERLAP_REGISTRY
  );
  let playerInsideState = createInitialState(playerInsideLevel);
  playerInsideState = reduce(playerInsideState, tick(0));
  run("chevauchement : joueur inchangé quand l'entité a la marge pour s'écarter", 5, playerInsideState.player.x);
  run("chevauchement : entité écartée, plus de recouvrement avec le joueur", true, Math.abs(getActiveWorld(playerInsideState).entities[0].x - 5) >= BODY_RADIUS);
  run("chevauchement : pas de signal pushedBy quand seule l'entité a bougé", null, playerInsideState.player.pushedBy);

  // Joueur ET entité près du même bord (x=0) : l'entité n'a plus de marge
  // pour s'écarter (clampée à 0, valeur EXACTE, aucun risque d'arrondi) ;
  // en dernier recours, c'est le joueur qui cède, du minimum, avec un
  // signal (jamais une téléportation silencieuse).
  const forcedRoomLevel = parseLevel(
    { id: "movement-check-overlap-forced", titleKey: "level.demo.title", length: 10, playerStart: 0.05, entities: [{ id: "wall-forced", type: "wall", x: 0.02 }] },
    OVERLAP_REGISTRY
  );
  let forcedState = createInitialState(forcedRoomLevel);
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
  const noOverlapLevel = parseLevel(
    { id: "movement-check-no-overlap", titleKey: "level.demo.title", length: 10, playerStart: 2, entities: [{ id: "wall-far", type: "wall", x: 8 }] },
    OVERLAP_REGISTRY
  );
  let noOverlapState = createInitialState(noOverlapLevel);
  noOverlapState = reduce(noOverlapState, tick(0));
  run("chevauchement : cas normal, aucun déplacement parasite (joueur)", 2, noOverlapState.player.x);
  run("chevauchement : cas normal, aucun déplacement parasite (entité)", 8, getActiveWorld(noOverlapState).entities[0].x);
  run("chevauchement : cas normal, pas de signal pushedBy", null, noOverlapState.player.pushedBy);

  // Validation au chargement : NON bloquant (parseLevel ne lève jamais pour
  // un chevauchement), mais averti clairement (console.warn).
  let overlapWarned = false;
  const originalWarn = console.warn;
  console.warn = (...args) => {
    overlapWarned = true;
    originalWarn(...args);
  };
  let overlapLoadThrew = false;
  try {
    parseLevel(
      {
        id: "movement-check-overlap-load",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 5,
        entities: [
          { id: "wall-load-a", type: "wall", x: 5 },
          { id: "wall-load-b", type: "wall", x: 5.05 },
        ],
      },
      OVERLAP_REGISTRY
    );
  } catch {
    overlapLoadThrew = true;
  }
  console.warn = originalWarn;
  run("chevauchement : parseLevel reste non bloquant au chargement", false, overlapLoadThrew);
  run("chevauchement : parseLevel avertit clairement au chargement", true, overlapWarned);

  // --- Pipeline core/physics/ (refacto structurel) : intentions (phase 1,
  // comportement) + physique (phase 2) combinées dans le même tick, sur un
  // niveau mêlant une entité wander ET une entité bloquante — le
  // déménagement en modules ne change aucun résultat, toujours déterministe.
  const PIPELINE_REGISTRY = { dog: { label: "entity.dog" }, wall: { label: "entity.wall", blocksMovement: true } };
  const pipelineLevel = parseLevel(
    {
      id: "movement-check-pipeline",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "pipeline-dog", type: "dog", x: 10, behavior: { kind: "wander", speed: 0.5, turnChance: 0.2 } },
        { id: "pipeline-wall", type: "wall", x: 2 },
      ],
    },
    PIPELINE_REGISTRY
  );
  function runPipeline() {
    let s = createInitialState(pipelineLevel, 123);
    for (let i = 0; i < 60; i++) s = reduce(s, tick(1));
    return { playerX: s.player.x, blockedBy: s.player.blockedBy, dogX: getActiveWorld(s).entities[0].x };
  }
  run("pipeline : intentions + physique combinées, résultat déterministe", JSON.stringify(runPipeline()), JSON.stringify(runPipeline()));

  // --- Rebond aux bornes porté par la physique (plus par wander) ---
  // Verrouille le contrat directement sur moveAndBounce (core/physics/
  // movement.js), hors de tout comportement : wander ne contient plus
  // aucun test de borne (voir behaviors/wander.js).
  const bounceLow = moveAndBounce(0.01, -1, 0.5, 10); // dépasse le bord bas
  run("physique : moveAndBounce borne la position au bord bas", 0, bounceLow.x);
  run("physique : moveAndBounce inverse la direction au bord bas", 1, bounceLow.dir);
  const bounceHigh = moveAndBounce(9.99, 1, 0.5, 10); // dépasse le bord haut
  run("physique : moveAndBounce borne la position au bord haut", 10, bounceHigh.x);
  run("physique : moveAndBounce inverse la direction au bord haut", -1, bounceHigh.dir);
  const noBounce = moveAndBounce(5, 1, 0.5, 10); // pas de bord franchi
  run("physique : moveAndBounce ne modifie pas la direction sans franchissement", 1, noBounce.dir);

  // --- Partie multi-mondes (modèle "Animal Crossing") ---

  const WORLD_A_REGISTRY = { dog: { label: "entity.dog" } };
  const worldA = parseLevel(
    {
      id: "movement-check-world-a",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 2,
      entities: [{ id: "npc-a", type: "dog", x: 10, behavior: { kind: "wander", speed: 0.5, turnChance: 0.3 } }],
    },
    WORLD_A_REGISTRY
  );
  const worldB = parseLevel(
    { id: "movement-check-world-b", titleKey: "level.demo.title", length: 15, playerStart: 3, entities: [] },
    WORLD_A_REGISTRY
  );

  // Un seul monde reçoit les ticks : à la création, c'est le premier.
  let partie = createInitialState(worldA, 55);
  run("partie : un seul monde actif à la création", worldA.id, partie.activeWorldId);

  // Fait errer le PNJ de A loin de son spawn avant de partir.
  for (let i = 0; i < 30; i++) partie = reduce(partie, tick(0));
  const npcXBeforeLeaving = getActiveWorld(partie).entities[0].x;
  run("partie : le PNJ a bien bougé avant le départ (sanity check)", true, npcXBeforeLeaving !== 10);

  // Marqueur synthétique sur le joueur : doit traverser la transition intact
  // (rien n'existe encore à faire persister en vrai — inventaire etc. —
  // mais le CONTRAT de persistance doit déjà tenir).
  partie = { ...partie, player: { ...partie.player, testMarker: "conserve-moi" } };

  // Transition A -> B : B jamais visité, fourni via freshLevel.
  partie = travelToWorld(partie, worldB.id, worldB);
  run("partie : transition active bien la cible", worldB.id, partie.activeWorldId);
  run("partie : joueur replacé à playerStart du lieu cible", worldB.playerStart, partie.player.x);
  run("partie : état du joueur conservé à travers la transition", "conserve-moi", partie.player.testMarker);
  run("partie : blockedBy réinitialisé à l'arrivée", null, partie.player.blockedBy);
  run("partie : le monde quitté (A) reste dans worlds, rangé", true, Boolean(partie.worlds[worldA.id]));
  run("partie : lastVisited écrit au rangement de A", 1, partie.worlds[worldA.id].lastVisited);

  // Le monde A est gelé : plusieurs ticks dans B ne le font pas bouger.
  const npcXParked = partie.worlds[worldA.id].entities[0].x;
  for (let i = 0; i < 30; i++) partie = reduce(partie, tick(1));
  run("partie : un monde rangé ne bouge pas pendant qu'il est inactif", npcXParked, partie.worlds[worldA.id].entities[0].x);

  // Retour A -> re-visite : B est déjà connu (pas de freshLevel nécessaire),
  // A ressort tel quel (PNJ où il avait été laissé, PAS réinitialisé à x=10).
  partie = travelToWorld(partie, worldA.id);
  run("partie : re-visite ressort l'état sauvegardé (PNJ non réinitialisé)", npcXParked, getActiveWorld(partie).entities[0].x);
  run("partie : joueur replacé à playerStart du lieu re-visité", worldA.playerStart, partie.player.x);
  run("partie : état du joueur toujours conservé après un aller-retour", "conserve-moi", partie.player.testMarker);

  // Cible ni visitée ni fournie -> échec clair, pas d'état à moitié construit.
  let travelToUnknownRejected = false;
  try {
    travelToWorld(partie, "movement-check-world-unknown");
  } catch {
    travelToUnknownRejected = true;
  }
  run("partie : transition vers un monde inconnu sans niveau fourni est rejetée", true, travelToUnknownRejected);

  // --- Audit de sérialisabilité (avant tout système de sauvegarde) ---
  // Objectif : confirmer que l'état de partie survit à un aller-retour JSON
  // en restant structurellement identique ET fonctionnel — pas un système
  // de sauvegarde, juste la garantie que rien de non-sérialisable ne s'est
  // glissé dans l'état. C'est l'invariant "l'état est le save", tenu depuis
  // le début du projet (voir CLAUDE.md), qui doit rester vrai avant qu'un
  // vrai système de save s'appuie dessus.

  // Décrit une valeur pour un message de diagnostic : JSON.stringify
  // renvoie undefined (la valeur, pas une chaîne) pour une fonction, peu
  // lisible tel quel dans un message.
  function describeValue(value) {
    return typeof value === "function" ? `[Function ${value.name || "anonyme"}]` : JSON.stringify(value);
  }

  // Type "logique" d'une valeur pour la comparaison de structure : NaN/
  // Infinity/-Infinity partagent un type distinct des nombres finis — JSON
  // les convertit TOUS en null, contrairement à un nombre fini qui survit
  // tel quel.
  function logicalType(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (typeof value === "number" && !Number.isFinite(value)) return "non-finite-number";
    return typeof value;
  }

  // Parcourt `value` et signale toute donnée qui ne survivrait pas à
  // JSON.stringify : fonction, nombre non fini, référence circulaire, objet
  // non "plain" (Map/Set/Date/instance de classe — JSON les sérialise de
  // façon inattendue, parfois vide). Fonctionne même si JSON.stringify
  // planterait (cycle) : ne dépend d'aucune tentative de sérialisation
  // réelle. `seen` ne piste que la branche COURANTE de la récursion (ajout
  // à l'entrée, retrait à la sortie) : partager la même référence depuis
  // deux branches distinctes n'est pas un cycle, seul un ancêtre qui se
  // retrouve dans son propre sous-arbre en est un.
  function auditNonSerializable(value, path, seen, findings) {
    if (value === null || value === undefined) return;
    const type = typeof value;

    if (type === "function") {
      findings.push(`${path} : fonction (${value.name || "anonyme"}) — disparaîtrait silencieusement`);
      return;
    }
    if (type === "number" && !Number.isFinite(value)) {
      findings.push(`${path} : nombre non fini (${value}) — deviendrait null`);
      return;
    }
    if (type !== "object") return;

    if (seen.has(value)) {
      findings.push(`${path} : référence circulaire`);
      return;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, i) => auditNonSerializable(item, `${path}[${i}]`, seen, findings));
    } else {
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        findings.push(`${path} : objet non "plain" (${proto?.constructor?.name ?? "?"})`);
      }
      for (const key of Object.keys(value)) {
        auditNonSerializable(value[key], `${path}.${key}`, seen, findings);
      }
    }

    seen.delete(value);
  }

  // Diffère deux structures déjà décodées (avant/après aller-retour JSON) et
  // liste précisément chaque divergence (clé apparue/disparue, changement
  // de type, changement de valeur) plutôt qu'un simple pass/fail.
  function diffStructure(a, b, path, diffs) {
    if (Object.is(a, b)) return;

    const typeA = logicalType(a);
    const typeB = logicalType(b);
    if (typeA !== typeB) {
      diffs.push(`${path} : ${typeA} -> ${typeB} (${describeValue(a)} -> ${describeValue(b)})`);
      return;
    }
    if (typeA === "array") {
      const len = Math.max(a.length, b.length);
      for (let i = 0; i < len; i++) diffStructure(a[i], b[i], `${path}[${i}]`, diffs);
      return;
    }
    if (typeA === "object") {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) {
        const inA = Object.prototype.hasOwnProperty.call(a, key);
        const inB = Object.prototype.hasOwnProperty.call(b, key);
        if (inA && !inB) diffs.push(`${path}.${key} : présent avant, absent après (${describeValue(a[key])})`);
        else if (!inA && inB) diffs.push(`${path}.${key} : absent avant, apparu après (${describeValue(b[key])})`);
        else diffStructure(a[key], b[key], `${path}.${key}`, diffs);
      }
      return;
    }
    diffs.push(`${path} : ${describeValue(a)} -> ${describeValue(b)}`);
  }

  // Auto-test du détecteur lui-même, sur une fuite SYNTHÉTIQUE (fonction,
  // NaN, Infinity, cycle) : doit être repérée, sinon un "aucune fuite"
  // trouvé plus bas sur la vraie partie ne prouverait rien.
  const syntheticLeaky = { a: 1, b: () => {}, c: NaN, d: Infinity };
  syntheticLeaky.self = syntheticLeaky; // référence circulaire
  const syntheticFindings = [];
  auditNonSerializable(syntheticLeaky, "synthetic", new Set(), syntheticFindings);
  run("sérialisation : le détecteur repère une fonction synthétique", true, syntheticFindings.some((f) => f.includes("fonction")));
  run("sérialisation : le détecteur repère un nombre non fini synthétique", true, syntheticFindings.some((f) => f.includes("non fini")));
  run("sérialisation : le détecteur repère une référence circulaire synthétique", true, syntheticFindings.some((f) => f.includes("circulaire")));

  // Partie avec activité réelle (joueur qui avance, chien qui erre) ET une
  // transition (pour peupler worlds avec 2 mondes, un actif et un rangé) —
  // le cas le plus représentatif d'un vrai save.
  const AUDIT_REGISTRY = { dog: { label: "entity.dog" }, door: { label: "entity.door" } };
  const auditWorldA = parseLevel(
    {
      id: "movement-check-audit-a",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 2,
      music: "assets/musics/a_warm_night_in_harlem.mp3",
      entities: [
        { id: "audit-dog", type: "dog", x: 10, behavior: { kind: "wander", speed: 0.5, turnChance: 0.3 } },
        { id: "audit-door", type: "door", x: 15, target: "movement-check-audit-b" },
      ],
    },
    AUDIT_REGISTRY
  );
  const auditWorldB = parseLevel(
    { id: "movement-check-audit-b", titleKey: "level.demo.title", length: 15, playerStart: 3, entities: [] },
    AUDIT_REGISTRY
  );

  let auditSession = createInitialState(auditWorldA, 77);
  for (let i = 0; i < 25; i++) auditSession = reduce(auditSession, tick(1));
  auditSession = travelToWorld(auditSession, auditWorldB.id, auditWorldB);
  for (let i = 0; i < 10; i++) auditSession = reduce(auditSession, tick(-1));
  const auditDogXParked = auditSession.worlds[auditWorldA.id].entities[0].x;

  // 1) Détection de fuite AVANT toute tentative de sérialisation réelle.
  const leakFindings = [];
  auditNonSerializable(auditSession, "session", new Set(), leakFindings);
  if (leakFindings.length > 0) {
    console.warn("Audit sérialisabilité : fuites détectées —", leakFindings);
  }
  run("sérialisation : aucune fuite de non-sérialisable dans la partie", 0, leakFindings.length);

  // 2) Aller-retour JSON réel, capturé pour détecter un throw (ex. cycle)
  // au lieu de laisser l'exception interrompre toute la suite de checks.
  let auditRoundTripped = null;
  let auditRoundTripThrew = false;
  try {
    auditRoundTripped = JSON.parse(JSON.stringify(auditSession));
  } catch {
    auditRoundTripThrew = true;
  }
  run("sérialisation : JSON.stringify/parse ne lève pas", false, auditRoundTripThrew);

  // 3) Divergence structurelle précise entre avant/après.
  const structureDiffs = [];
  if (auditRoundTripped) {
    diffStructure(auditSession, auditRoundTripped, "session", structureDiffs);
  }
  if (structureDiffs.length > 0) {
    console.warn("Audit sérialisabilité : divergences structurelles —", structureDiffs);
  }
  run("sérialisation : structure identique après aller-retour JSON", 0, structureDiffs.length);

  // 4) Fonctionnel : la partie reparse doit rester simulable sans erreur —
  // quelques ticks dans le monde actif (B), retour vers A (déjà connu, pas
  // de fetch). Le PNJ de A doit avoir survécu au voyage EXACTEMENT, vérifié
  // IMMÉDIATEMENT au retour, AVANT tout nouveau tick sur A (A était rangé
  // pendant tout l'aller-retour, sa position ne devait pas bouger d'un
  // iota) — puis, séparément, on retick A pour confirmer qu'il redevient
  // normalement simulable (sa position DOIT alors recommencer à évoluer,
  // ce n'est plus la même assertion).
  if (auditRoundTripped) {
    let revived = auditRoundTripped;
    let revivalThrew = false;
    let dogXOnReturn = null;
    try {
      for (let i = 0; i < 10; i++) revived = reduce(revived, tick(1));
      revived = travelToWorld(revived, auditWorldA.id);
      dogXOnReturn = getActiveWorld(revived).entities[0].x;
      for (let i = 0; i < 10; i++) revived = reduce(revived, tick(-1));
    } catch {
      revivalThrew = true;
    }
    run("sérialisation : la partie reparse reste jouable (aucune erreur)", false, revivalThrew);
    if (!revivalThrew) {
      run("sérialisation : le PNJ du monde reparse a survécu au voyage", auditDogXParked, dogXOnReturn);
      run("sérialisation : le monde reparse redevient normalement simulable", true, getActiveWorld(revived).entities[0].x !== dogXOnReturn);
    }
  }

  // --- core/save.js : enveloppe de sauvegarde (forme, pas le disque) ---

  const saveEnvelope = serializeGame(auditSession);
  run("save : serializeGame enveloppe avec la version courante", SAVE_VERSION, saveEnvelope.version);

  const saveResult = deserializeGame(saveEnvelope);
  run("save : deserializeGame réussit sur une enveloppe valide", true, saveResult.success);
  if (saveResult.success) {
    run("save : la partie désérialisée est identique à l'originale", JSON.stringify(auditSession), JSON.stringify(saveResult.session));
  }

  run("save : format non exploitable rejeté", false, deserializeGame({ notASave: true }).success);
  run("save : version inconnue rejetée", false, deserializeGame({ version: SAVE_VERSION + 1, data: auditSession }).success);
  run("save : structure implausible rejetée", false, deserializeGame({ version: SAVE_VERSION, data: { player: {} } }).success);

  console.log(`Récapitulatif : ${passed} réussis / ${total} total`);
  return { passed, total };
}
