// Vérifications du déplacement du core, exécutables depuis la console du
// navigateur (Node n'est pas disponible sur cette machine). Pur : aucun DOM,
// aucun fetch. Le niveau est construit en dur via un objet littéral, passé à
// parseLevel — aucune dépendance hors des modules du core.

import { parseLevel } from "./level.js";
import { createInitialState, getActiveWorld, travelToWorld, addCompanion, MOVE_STEP, BODY_RADIUS } from "./state.js";
import { tick } from "./actions.js";
import { reduce } from "./reduce.js";
import { moveAndBounce } from "./physics/movement.js";
import { SAVE_VERSION, serializeGame, deserializeGame } from "./save.js";
import { MAX_COMPANIONS } from "../config/companions.js";
import { SURFACE_REGISTRY, DEFAULT_SURFACE, surfaceAt, surfaceProps, surfacePropsAt } from "./surfaces.js";
import {
  INITIAL_TIME,
  SEASON_KEYS,
  advanceTime,
  minuteOfHour,
  hourOfDay,
  dayOfMonth,
  monthOfYear,
  seasonOfYear,
  yearNumber,
  phaseAt,
} from "./time.js";
import { TIME_CONFIG } from "../config/time-values.js";
import { evaluateCondition, isPresent, isBlocking, resolveEntityRules } from "./presence.js";
import { DEFAULTS as WANDER_DEFAULTS } from "./behaviors/wander.js";

// { companions: [] } : passé explicitement à CHAQUE createInitialState()
// ci-dessous qui ne concerne pas les compagnons — sans lui, le défaut (UN
// compagnon de test, voir core/state.js) s'ajouterait à des scénarios
// conçus et vérifiés AVANT son existence, avec des positions attendues
// calculées à la main. Les vérifications dédiées aux compagnons (voir plus
// bas, section "Compagnons") l'omettent volontairement pour exercer le
// défaut réel.
const NO_COMPANIONS = { companions: [] };

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
  let state = createInitialState(level, undefined, NO_COMPANIONS);
  state = reduce(state, tick(1));
  state = reduce(state, tick(1));
  state = reduce(state, tick(1));
  run("3 ticks à droite depuis x=5", 5 + 3 * MOVE_STEP, state.player.x);

  // Clamp à gauche : depuis le bord 0, un tick à gauche reste à 0.
  const leftLevel = parseLevel({ ...RAW_LEVEL, playerStart: 0 }, EMPTY_REGISTRY);
  const leftState = reduce(createInitialState(leftLevel, undefined, NO_COMPANIONS), tick(-1));
  run("clamp à gauche depuis x=0", 0, leftState.player.x);

  // Clamp à droite : depuis le bord length, un tick à droite reste à length.
  const rightLevel = parseLevel({ ...RAW_LEVEL, playerStart: RAW_LEVEL.length }, EMPTY_REGISTRY);
  const rightState = reduce(createInitialState(rightLevel, undefined, NO_COMPANIONS), tick(1));
  run("clamp à droite depuis x=length", RAW_LEVEL.length, rightState.player.x);

  // Action inconnue -> état inchangé, MÊME référence (pas de nouvel objet).
  const before = createInitialState(level, undefined, NO_COMPANIONS);
  const after = reduce(before, { type: "UNKNOWN" });
  run("action inconnue renvoie la même référence", before, after);

  // --- Errance (behavior wander) : machine à deux états (marche/pause),
  // PRNG seedé, déterminisme ---
  // Depuis ce refacto, wander ne se borne plus lui-même (voir behaviors/
  // wander.js) : il produit une intention (-1/0/+1, 0 en pause), résolue
  // comme tout autre mobile à intention par resolveBodyMove
  // (core/physics/collision.js) — bornes ET obstacles gérés par la MÊME
  // physique inchangée, plus aucun test de borne propre à wander ici (voir
  // toujours la section "Rebond aux bornes" plus bas pour moveAndBounce,
  // désormais un utilitaire générique sans appelant en production).

  const WANDER_REGISTRY = { dog: { label: "entity.dog" }, wall: { label: "entity.wall", blocksMovement: true } };

  function makeWanderLevel(overrides = {}) {
    return {
      id: "movement-check-wander",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 5,
      entities: [{ id: "wander-1", type: "dog", x: 5, behavior: { kind: "wander" } }],
      ...overrides,
    };
  }

  function runTicks(startState, count) {
    const positions = [];
    const phases = [];
    let current = startState;
    for (let i = 0; i < count; i++) {
      current = reduce(current, tick(0));
      const entity = getActiveWorld(current).entities[0];
      positions.push(entity.x);
      phases.push(entity.wander.phase);
    }
    return { state: current, positions, phases };
  }

  const wanderLevel = parseLevel(makeWanderLevel(), WANDER_REGISTRY);

  // Même seed, même suite de ticks -> trajectoire ET séquence de phases
  // identiques, pas seulement la position finale (le tirage de durée/
  // direction doit, lui aussi, rester déterministe).
  const run1 = runTicks(createInitialState(wanderLevel, 42, NO_COMPANIONS), 400);
  const run2 = runTicks(createInitialState(wanderLevel, 42, NO_COMPANIONS), 400);
  run("errance : trajectoire reproductible (même seed)", JSON.stringify(run1.positions), JSON.stringify(run2.positions));
  run("errance : séquence de phases reproductible (même seed)", JSON.stringify(run1.phases), JSON.stringify(run2.phases));

  // Toujours dans les bornes du niveau, à chaque tick de la trajectoire.
  run("errance : position toujours dans [0, length]", true, run1.positions.every((x) => x >= 0 && x <= wanderLevel.length));

  // Les deux états sont bien atteints avec les défauts (400 ticks >
  // walkMax : au moins une pause est nécessairement amorcée), et la phase
  // est lisible sur l'entité — crochet exploitable plus tard pour un son
  // par état (item 4 du prompt), pas câblé ici.
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
  const machineLevel = parseLevel(
    makeWanderLevel({
      entities: [{ id: "wander-1", type: "dog", x: 5, behavior: { kind: "wander", walkMin: 3, walkMax: 6, pauseMin: 4, pauseMax: 8 } }],
    }),
    WANDER_REGISTRY
  );
  const machineRun = runTicks(createInitialState(machineLevel, 99, NO_COMPANIONS), 300);
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
    let s = createInitialState(machineLevel, 99, NO_COMPANIONS);
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

  // Rebond au bord du niveau (item 3) : phase de marche FORCÉE assez longue
  // pour ne jamais expirer seule (walkMin=walkMax élevé) — isole le rebond
  // de toute bascule naturelle. Niveau étroit : quelle que soit la
  // direction tirée au départ, un bord est atteint vite.
  const boundaryLevel = parseLevel(
    makeWanderLevel({
      length: 1,
      entities: [{ id: "wander-1", type: "dog", x: 0.5, behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 } }],
    }),
    WANDER_REGISTRY
  );
  let boundaryState = createInitialState(boundaryLevel, 7, NO_COMPANIONS);
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
  const obstacleLevel = parseLevel(
    makeWanderLevel({
      length: 20,
      entities: [
        { id: "wall-left", type: "wall", x: 5 },
        { id: "wander-1", type: "dog", x: 6, behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 } },
        { id: "wall-right", type: "wall", x: 7 },
      ],
    }),
    WANDER_REGISTRY
  );
  let obstacleState = createInitialState(obstacleLevel, 7, NO_COMPANIONS);
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
    let rejected = false;
    try {
      parseLevel(makeWanderLevel({ entities: [{ id: "wander-1", type: "dog", x: 5, behavior: { kind: "wander", ...behaviorOverride } }] }), WANDER_REGISTRY);
    } catch {
      rejected = true;
    }
    return rejected;
  }
  run("errance : walkMin > walkMax rejeté au chargement", true, expectWanderRejected({ walkMin: 10, walkMax: 5 }));
  run("errance : pauseMin > pauseMax rejeté au chargement", true, expectWanderRejected({ pauseMin: 10, pauseMax: 5 }));
  run("errance : walkMin non entier rejeté au chargement", true, expectWanderRejected({ walkMin: 1.5 }));
  run("errance : walkMin < 1 rejeté au chargement", true, expectWanderRejected({ walkMin: 0 }));

  // Sérialisabilité : l'état wander (phase/ticksLeft/dir/prevX) survit à un
  // aller-retour JSON, comme tout autre champ d'entité.
  const serializedWanderEntity = JSON.parse(JSON.stringify(getActiveWorld(run1.state).entities[0]));
  run(
    "errance : état wander survit à un aller-retour JSON",
    JSON.stringify(getActiveWorld(run1.state).entities[0].wander),
    JSON.stringify(serializedWanderEntity.wander)
  );

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

  let blockState = createInitialState(blockingLevel, undefined, NO_COMPANIONS);
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
  let passState = createInitialState(passThroughLevel, undefined, NO_COMPANIONS);
  let unobstructedState = createInitialState(emptyLevel, undefined, NO_COMPANIONS);
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
  let overrideBlockState = createInitialState(overrideBlockLevel, undefined, NO_COMPANIONS);
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

  // --- Interaction niveau 0 : capacités observable/interactable ---
  // Cascade IDENTIQUE à blocksMovement (instance -> type -> défaut false),
  // voir core/level.js. Le filtrage par verbe et la désambiguïsation restent
  // côté vue (view/audio/city-scene.js, view/interaction.js), hors de portée
  // d'un check terminal — seule la RÉSOLUTION de ces deux champs est
  // vérifiable ici.

  const INTERACTION_REGISTRY = {
    describable: { label: "entity.dog", observable: true, interactable: false },
    actionable: { label: "entity.dog", observable: false, interactable: true },
    plain: { label: "entity.dog" }, // ni l'un ni l'autre déclaré -> défaut false/false
  };

  const interactionLevel = parseLevel(
    {
      id: "movement-check-interaction",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "e-describable", type: "describable", x: 5 },
        { id: "e-actionable", type: "actionable", x: 6 },
        { id: "e-plain", type: "plain", x: 7 },
        { id: "e-both", type: "describable", x: 8, interactable: true }, // surcharge d'instance
        { id: "e-neither", type: "actionable", x: 9, interactable: false }, // idem, désactive le défaut du type
      ],
    },
    INTERACTION_REGISTRY
  );
  function interactionEntity(id) {
    return interactionLevel.entities.find((e) => e.id === id);
  }

  run("interaction : défaut du type — observable hérité", true, interactionEntity("e-describable").observable);
  run("interaction : défaut du type — interactable hérité (false)", false, interactionEntity("e-describable").interactable);
  run("interaction : défaut du type — interactable hérité (true)", true, interactionEntity("e-actionable").interactable);
  run("interaction : aucun des deux déclaré -> observable false par défaut", false, interactionEntity("e-plain").observable);
  run("interaction : aucun des deux déclaré -> interactable false par défaut", false, interactionEntity("e-plain").interactable);

  // Les QUATRE combinaisons sont valides — surcharge d'instance testée dans
  // les deux sens (active un défaut à false, désactive un défaut à true).
  run("interaction : les deux capacités (surcharge d'instance)", true, interactionEntity("e-both").observable && interactionEntity("e-both").interactable);
  run(
    "interaction : ni l'une ni l'autre (surcharge d'instance désactive le défaut du type)",
    true,
    !interactionEntity("e-neither").observable && !interactionEntity("e-neither").interactable
  );

  // Validation au chargement : type invalide -> échec clair, même politique
  // que blocksMovement.
  function expectInteractionRejected(field, value) {
    let rejected = false;
    try {
      parseLevel(
        { id: "movement-check-interaction-invalid", titleKey: "level.demo.title", length: 10, playerStart: 0, entities: [{ id: "bad", type: "plain", x: 5, [field]: value }] },
        INTERACTION_REGISTRY
      );
    } catch {
      rejected = true;
    }
    return rejected;
  }
  run("interaction : observable non booléen rejeté", true, expectInteractionRejected("observable", "oui"));
  run("interaction : interactable non booléen rejeté", true, expectInteractionRejected("interactable", "oui"));

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
  let overlapState = createInitialState(overlapLevel, undefined, NO_COMPANIONS);
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
  let playerInsideState = createInitialState(playerInsideLevel, undefined, NO_COMPANIONS);
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
  let forcedState = createInitialState(forcedRoomLevel, undefined, NO_COMPANIONS);
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
  let noOverlapState = createInitialState(noOverlapLevel, undefined, NO_COMPANIONS);
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
        { id: "pipeline-dog", type: "dog", x: 10, behavior: { kind: "wander" } },
        { id: "pipeline-wall", type: "wall", x: 2 },
      ],
    },
    PIPELINE_REGISTRY
  );
  function runPipeline() {
    let s = createInitialState(pipelineLevel, 123, NO_COMPANIONS);
    for (let i = 0; i < 60; i++) s = reduce(s, tick(1));
    return { playerX: s.player.x, blockedBy: s.player.blockedBy, dogX: getActiveWorld(s).entities[0].x };
  }
  run("pipeline : intentions + physique combinées, résultat déterministe", JSON.stringify(runPipeline()), JSON.stringify(runPipeline()));

  // --- moveAndBounce (core/physics/movement.js) : utilitaire générique,
  // SANS appelant en production depuis que wander (voir behaviors/
  // wander.js) est passé en intention pure — gardé et testé tel quel
  // (fonction pure, potentiel appelant futur), verrouille son propre
  // contrat indépendamment de tout comportement.
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
      entities: [{ id: "npc-a", type: "dog", x: 10, behavior: { kind: "wander"} }],
    },
    WORLD_A_REGISTRY
  );
  const worldB = parseLevel(
    { id: "movement-check-world-b", titleKey: "level.demo.title", length: 15, playerStart: 3, entities: [] },
    WORLD_A_REGISTRY
  );

  // Un seul monde reçoit les ticks : à la création, c'est le premier.
  let partie = createInitialState(worldA, 55, NO_COMPANIONS);
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
  // lastVisited horodaté à la minute de jeu COURANTE (session.time, voir
  // core/time.js) — aucun advanceTime() appelé avant cette transition dans
  // ce scénario, donc encore à INITIAL_TIME.
  run("partie : lastVisited écrit au rangement de A (minute de jeu courante)", INITIAL_TIME, partie.worlds[worldA.id].lastVisited);

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

  // --- Horloge de partie (core/time.js) ---
  // Compteur unique + dérivations pures. RIEN d'autre ne consomme le temps
  // ici (pas de jour/nuit, pas d'événements) — ce sont de futurs chantiers,
  // voir core/time.md. advanceTime ne lit jamais l'horloge réelle : chaque
  // scénario ci-dessous injecte un delta EXPLICITE, jamais mesuré.

  const timeLevel = parseLevel(
    { id: "movement-check-time", titleKey: "level.demo.title", length: 10, playerStart: 0, entities: [] },
    EMPTY_REGISTRY
  );

  // Origine : jour 1, mois 1 (saison 0), année 1, à l'heure de départ
  // configurée (config/time-values.js/startHour) — jamais minuit.
  let timeState = createInitialState(timeLevel, undefined, NO_COMPANIONS);
  run("horloge : session.time démarre à INITIAL_TIME", INITIAL_TIME, timeState.time);
  run("horloge : heure de départ = startHour configuré", TIME_CONFIG.startHour, hourOfDay(timeState.time));
  run("horloge : minute de départ = 0", 0, minuteOfHour(timeState.time));
  run("horloge : jour de départ = 1", 1, dayOfMonth(timeState.time));
  run("horloge : mois de départ = 1", 1, monthOfYear(timeState.time));
  run("horloge : saison de départ = 0 (printemps)", 0, seasonOfYear(timeState.time));
  run("horloge : année de départ = 1", 1, yearNumber(timeState.time));
  run("horloge : SEASON_KEYS couvre les 4 saisons", 4, SEASON_KEYS.length);

  // Pureté : n'affecte QUE .time, jamais mutée sur place (référence
  // d'entrée intacte), et déterministe (même delta -> même résultat).
  const beforeAdvance = timeState;
  const afterAdvance = advanceTime(timeState, 30);
  run("horloge : advanceTime ne mute jamais l'état d'entrée", INITIAL_TIME, beforeAdvance.time);
  run("horloge : advanceTime avance le compteur du delta exact", INITIAL_TIME + 30, afterAdvance.time);
  run(
    "horloge : advanceTime déterministe (même delta -> même résultat)",
    advanceTime(timeState, 30).time,
    advanceTime(timeState, 30).time
  );
  run(
    "horloge : advanceTime ne touche à rien d'autre que .time",
    JSON.stringify({ ...beforeAdvance, time: null }),
    JSON.stringify({ ...afterAdvance, time: null })
  );

  // Aucune horloge implicite dans le core : de nombreux TICK ne font JAMAIS
  // avancer .time — seul advanceTime() le fait (voir CLAUDE.md, "le core
  // n'a ni horloge ni clavier").
  let noClockState = createInitialState(timeLevel, undefined, NO_COMPANIONS);
  for (let i = 0; i < 500; i++) noClockState = reduce(noClockState, tick(1));
  run("horloge : reduce()/TICK ne fait jamais avancer le temps", INITIAL_TIME, noClockState.time);

  // Roulement minute -> heure (23 -> 0 avant 60).
  const oneHour = TIME_CONFIG.minutesPerHour;
  const beforeMinuteRoll = advanceTime(timeState, oneHour - minuteOfHour(timeState.time) - 1); // xx:59
  const afterMinuteRoll = advanceTime(beforeMinuteRoll, 1); // xx+1:00
  run("horloge : juste avant le roulement, minute = 59", 59, minuteOfHour(beforeMinuteRoll.time));
  run("horloge : après le roulement, minute retombe à 0", 0, minuteOfHour(afterMinuteRoll.time));
  run(
    "horloge : après le roulement, l'heure a avancé de 1",
    (hourOfDay(beforeMinuteRoll.time) + 1) % TIME_CONFIG.hoursPerDay,
    hourOfDay(afterMinuteRoll.time)
  );

  // Roulement jour -> mois -> minuit : depuis l'origine, avancer jusqu'à
  // 23:59 du dernier jour du mois puis +1 minute doit faire rouler jour ET
  // mois ensemble (jour 1 du mois suivant, minuit).
  const minutesToMonthEnd =
    TIME_CONFIG.daysPerMonth * TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour - INITIAL_TIME - 1;
  const monthEndState = advanceTime(timeState, minutesToMonthEnd); // dernier jour du mois, 23:59
  run("horloge : dernier jour du mois avant minuit", TIME_CONFIG.daysPerMonth, dayOfMonth(monthEndState.time));
  run("horloge : heure juste avant minuit", TIME_CONFIG.hoursPerDay - 1, hourOfDay(monthEndState.time));
  const nextMonthState = advanceTime(monthEndState, 1); // minuit, mois suivant
  run("horloge : après minuit, jour retombe à 1", 1, dayOfMonth(nextMonthState.time));
  run("horloge : après minuit du dernier jour, mois avance", 2, monthOfYear(nextMonthState.time));
  run("horloge : après minuit, heure retombe à 0", 0, hourOfDay(nextMonthState.time));

  // Roulement mois -> année -> saison : mois 12 -> mois 1, année +1, saison
  // retombe à 0 (printemps).
  const minutesToYearEnd =
    TIME_CONFIG.monthsPerYear * TIME_CONFIG.daysPerMonth * TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour -
    INITIAL_TIME -
    1;
  const yearEndState = advanceTime(timeState, minutesToYearEnd); // dernier jour du dernier mois, 23:59
  run("horloge : dernier mois de l'année avant le roulement", TIME_CONFIG.monthsPerYear, monthOfYear(yearEndState.time));
  run("horloge : année avant le roulement = 1", 1, yearNumber(yearEndState.time));
  const nextYearState = advanceTime(yearEndState, 1);
  run("horloge : après le roulement, mois retombe à 1", 1, monthOfYear(nextYearState.time));
  run("horloge : après le roulement, année avance", 2, yearNumber(nextYearState.time));
  run("horloge : après le roulement, saison retombe à 0 (printemps)", 0, seasonOfYear(nextYearState.time));

  // Saisons : chaque bloc de monthsPerSeason mois partage la même saison,
  // la suivante commence au mois suivant — vérifié sur les 12 mois de
  // l'année, pas seulement aux bornes déjà couvertes ci-dessus.
  const seasonsByMonth = [];
  for (let m = 1; m <= TIME_CONFIG.monthsPerYear; m++) {
    const minutesToMonth = (m - 1) * TIME_CONFIG.daysPerMonth * TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour - INITIAL_TIME;
    seasonsByMonth.push(seasonOfYear(advanceTime(timeState, minutesToMonth).time));
  }
  run(
    "horloge : les 12 mois se répartissent en 4 saisons de 3 mois consécutifs",
    JSON.stringify([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]),
    JSON.stringify(seasonsByMonth)
  );

  // Granularité minute : un delta fractionnaire (< 1 minute) s'accumule
  // dans .time (jamais arrondi par advanceTime lui-même, voir son
  // commentaire) mais reste invisible tant qu'il ne franchit pas la minute
  // entière — les dérivations ne montrent jamais de fraction.
  const fractionalState = advanceTime(timeState, 0.4);
  run("horloge : un delta fractionnaire est conservé dans .time", INITIAL_TIME + 0.4, fractionalState.time);
  run(
    "horloge : mais reste invisible dans les dérivations (granularité = la minute)",
    minuteOfHour(timeState.time),
    minuteOfHour(fractionalState.time)
  );
  const fractionalCrossing = advanceTime(fractionalState, 0.7); // 0.4 + 0.7 = 1.1 -> franchit la minute
  run("horloge : la somme de fractions franchit bien la minute au bon moment", minuteOfHour(timeState.time) + 1, minuteOfHour(fractionalCrossing.time));

  // Persistance : session.time survit à un aller-retour JSON avec sa valeur
  // EXACTE (déjà couvert génériquement par l'audit de sérialisabilité plus
  // bas, vérifié ici explicitement et lisiblement pour ce champ précis).
  const timeRoundTrip = JSON.parse(JSON.stringify(afterAdvance));
  run("horloge : session.time survit à un aller-retour JSON", afterAdvance.time, timeRoundTrip.time);

  // Phase jour/nuit (voir core/time.js/phaseAt) : dérivée de l'heure, un
  // seul palier de chaque côté — vérifié aux bornes précises (dayStartHour/
  // nightStartHour, config/time-values.js), pas seulement à l'origine.
  const { dayStartHour, nightStartHour } = TIME_CONFIG;
  run("horloge : phase à l'origine (INITIAL_TIME, 8h) = jour", "day", phaseAt(INITIAL_TIME));
  run("horloge : phase juste avant dayStartHour = nuit", "night", phaseAt(dayStartHour * TIME_CONFIG.minutesPerHour - 1));
  run("horloge : phase à dayStartHour pile = jour", "day", phaseAt(dayStartHour * TIME_CONFIG.minutesPerHour));
  run(
    "horloge : phase juste avant nightStartHour = jour",
    "day",
    phaseAt(nightStartHour * TIME_CONFIG.minutesPerHour - 1)
  );
  run("horloge : phase à nightStartHour pile = nuit", "night", phaseAt(nightStartHour * TIME_CONFIG.minutesPerHour));
  run("horloge : phase à minuit = nuit", "night", phaseAt(0));

  // Lien réservé (pas exploité) avec lastVisited : voir travelToWorld
  // ci-dessus ("lastVisited écrit au rangement de A") et core/time.md.

  // --- Présence conditionnelle (core/presence.js) ---
  // Évaluateur générique (un seul type aujourd'hui : "timeRange"), résolution
  // de présence, et intégration dans reduce() — voir entities/types/neon.js
  // pour le cas d'usage réel (présent la nuit).

  // evaluateCondition/timeRange : dans la plage, hors plage, bornes,
  // passage par minuit, intervalle dégénéré, type inconnu.
  run(
    "presence : timeRange dans la plage normale",
    true,
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 10 * 60 })
  );
  run(
    "presence : timeRange hors plage normale",
    false,
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 22 * 60 })
  );
  run(
    "presence : timeRange borne from incluse",
    true,
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 6 * 60 })
  );
  run(
    "presence : timeRange borne to exclue",
    false,
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 20 * 60 })
  );
  run(
    "presence : timeRange passage minuit — 23h dans [20,6[",
    true,
    evaluateCondition({ type: "timeRange", from: 20, to: 6 }, { time: 23 * 60 })
  );
  run(
    "presence : timeRange passage minuit — 2h dans [20,6[",
    true,
    evaluateCondition({ type: "timeRange", from: 20, to: 6 }, { time: 2 * 60 })
  );
  run(
    "presence : timeRange passage minuit — 10h hors [20,6[",
    false,
    evaluateCondition({ type: "timeRange", from: 20, to: 6 }, { time: 10 * 60 })
  );
  run(
    "presence : timeRange from === to -> jamais vraie (intervalle vide)",
    false,
    evaluateCondition({ type: "timeRange", from: 8, to: 8 }, { time: 8 * 60 })
  );
  run("presence : type de condition inconnu -> false (jamais un throw)", false, evaluateCondition({ type: "weather" }, { time: 0 }));

  // isPresent : sans champ presence -> toujours présente (comportement
  // d'avant ce système, inchangé). Avec règles : la première dont `when`
  // est vraie décide ; aucune ne correspond -> DORMANTE par défaut.
  run("presence : isPresent sans presence -> toujours vrai", true, isPresent({ id: "x" }, { time: 0 }));
  const neonLikeEntity = {
    id: "neon-test",
    presence: [{ when: { type: "timeRange", from: 20, to: 6 }, present: true }],
  };
  run("presence : une règle 'présent la nuit' — la nuit -> présente", true, isPresent(neonLikeEntity, { time: 23 * 60 }));
  run(
    "presence : une règle 'présent la nuit' — le jour -> dormante (aucune règle ne matche)",
    false,
    isPresent(neonLikeEntity, { time: 10 * 60 })
  );
  // Asymétrie documentée : UNE règle present:false ne suffit pas à exprimer
  // "présente en dehors" — sans couverture par une règle qui matche,
  // isPresent retombe TOUJOURS sur false (dormante), qu'un rule ait
  // matché avec present:false OU qu'aucun rule n'ait matché du tout.
  const absentByDay = { id: "absent-day-test", presence: [{ when: { type: "timeRange", from: 6, to: 20 }, present: false }] };
  run("presence : règle present:false matchée -> dormante", false, isPresent(absentByDay, { time: 10 * 60 }));
  run(
    "presence : règle present:false NON matchée -> dormante aussi (aucune couverture, pas 'présente par défaut')",
    false,
    isPresent(absentByDay, { time: 23 * 60 })
  );
  // Deux règles complémentaires : couvre les deux cas explicitement.
  const complementaryRules = {
    id: "complementary-test",
    presence: [
      { when: { type: "timeRange", from: 6, to: 20 }, present: false },
      { when: { type: "timeRange", from: 20, to: 6 }, present: true },
    ],
  };
  run("presence : deux règles complémentaires — jour -> dormante", false, isPresent(complementaryRules, { time: 10 * 60 }));
  run("presence : deux règles complémentaires — nuit -> présente", true, isPresent(complementaryRules, { time: 23 * 60 }));

  // isBlocking : blocksMovement ET présente -> bloque ; l'un des deux
  // manquant -> jamais.
  run("presence : isBlocking — blocksMovement + présente -> bloque", true, isBlocking({ blocksMovement: true }, { time: 0 }));
  run("presence : isBlocking — blocksMovement absent -> jamais", false, isBlocking({ blocksMovement: false }, { time: 0 }));
  run(
    "presence : isBlocking — blocksMovement + dormante -> ne bloque pas",
    false,
    isBlocking({ blocksMovement: true, ...neonLikeEntity }, { time: 10 * 60 })
  );
  run(
    "presence : isBlocking — blocksMovement + présente (règle matchée) -> bloque",
    true,
    isBlocking({ blocksMovement: true, ...neonLikeEntity }, { time: 23 * 60 })
  );

  // --- Intégration dans reduce() : présence + blocage + comportement ---

  const PRESENCE_REGISTRY = { wall: { label: "entity.wall", blocksMovement: true }, dog: { label: "entity.dog" } };
  const NIGHT_ONLY = [{ when: { type: "timeRange", from: 20, to: 6 }, present: true }];

  // Entité BLOQUANTE mais dormante le jour (règle "présente la nuit") : le
  // jour, elle ne doit RIEN bloquer ("comme si absente").
  const presenceBlockLevel = parseLevel(
    {
      id: "movement-check-presence-block",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      entities: [{ id: "ghost-wall", type: "wall", x: 5, presence: NIGHT_ONLY }],
    },
    PRESENCE_REGISTRY
  );
  let dayBlockState = createInitialState(presenceBlockLevel, undefined, NO_COMPANIONS);
  for (let i = 0; i < 300; i++) dayBlockState = reduce(dayBlockState, tick(1));
  run("presence : entité bloquante mais dormante (jour) laisse le joueur passer", true, dayBlockState.player.x > 5 + BODY_RADIUS);
  run("presence : entité bloquante dormante ne signale jamais de blocage", null, dayBlockState.player.blockedBy);

  // La MÊME entité, la nuit (advanceTime jusqu'à 22h) : redevient bloquante.
  let nightBlockState = createInitialState(presenceBlockLevel, undefined, NO_COMPANIONS);
  nightBlockState = advanceTime(nightBlockState, 14 * 60); // 8h (INITIAL_TIME) -> 22h
  for (let i = 0; i < 300; i++) nightBlockState = reduce(nightBlockState, tick(1));
  run("presence : entité bloquante présente (nuit) bloque bien le joueur", "ghost-wall", nightBlockState.player.blockedBy);
  run("presence : joueur arrêté au bord du corps bloquant (nuit)", 5 - BODY_RADIUS, nightBlockState.player.x);

  // Entité DORMANTE (jour) avec comportement wander : pas tickée du tout —
  // ni mouvement, ni tirage PRNG.
  const dormantWanderLevel = parseLevel(
    {
      id: "movement-check-presence-wander",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "ghost-dog", type: "dog", x: 10, behavior: { kind: "wander"}, presence: NIGHT_ONLY },
      ],
    },
    PRESENCE_REGISTRY
  );
  let dormantWanderState = createInitialState(dormantWanderLevel, 42, NO_COMPANIONS);
  const dormantStartX = getActiveWorld(dormantWanderState).entities[0].x;
  for (let i = 0; i < 100; i++) dormantWanderState = reduce(dormantWanderState, tick(0));
  run(
    "presence : entité dormante (jour) ne bouge jamais (comportement jamais tické)",
    dormantStartX,
    getActiveWorld(dormantWanderState).entities[0].x
  );
  run(
    "presence : entité dormante porte le drapeau present:false dans l'état",
    false,
    getActiveWorld(dormantWanderState).entities[0].present
  );

  // PRNG non consommé pour une entité dormante : rngState après N ticks
  // avec UNE SEULE entité dormante doit être IDENTIQUE à celui d'un monde
  // SANS AUCUNE entité — comparaison exacte, sans dépendre de la mécanique
  // interne du PRNG.
  const emptyPresenceLevel = parseLevel(
    { id: "movement-check-presence-empty", titleKey: "level.demo.title", length: 20, playerStart: 0, entities: [] },
    PRESENCE_REGISTRY
  );
  let emptyPresenceState = createInitialState(emptyPresenceLevel, 42, NO_COMPANIONS);
  for (let i = 0; i < 100; i++) emptyPresenceState = reduce(emptyPresenceState, tick(0));
  run(
    "presence : entité dormante ne consomme aucun tirage PRNG (rngState = monde vide)",
    emptyPresenceState.worlds[emptyPresenceLevel.id].rngState,
    dormantWanderState.worlds[dormantWanderLevel.id].rngState
  );

  // La MÊME entité, la nuit : présente ET réellement tickée (comportement
  // actif, position qui évolue).
  let awakeWanderState = createInitialState(dormantWanderLevel, 42, NO_COMPANIONS);
  awakeWanderState = advanceTime(awakeWanderState, 14 * 60); // -> nuit
  for (let i = 0; i < 100; i++) awakeWanderState = reduce(awakeWanderState, tick(0));
  run("presence : entité présente (nuit) porte present:true", true, getActiveWorld(awakeWanderState).entities[0].present);
  run(
    "presence : entité présente (nuit) bouge réellement (comportement tické)",
    true,
    getActiveWorld(awakeWanderState).entities[0].x !== dormantStartX
  );

  // Entité SANS règle de présence : jamais de champ .present ajouté à son
  // état — comportement d'avant ce système STRICTEMENT inchangé (réutilise
  // wanderLevel, déjà défini plus haut, sans presence).
  const noPresenceState = reduce(createInitialState(wanderLevel, 42, NO_COMPANIONS), tick(0));
  run(
    "presence : entité SANS règle ne porte jamais de champ .present",
    undefined,
    getActiveWorld(noPresenceState).entities[0].present
  );

  // --- Bascule de présence OBSERVÉE (presenceChanged) ---
  // Formulation générique (liée à la CONDITION, pas au rouage de dormance —
  // voir core/reduce.js/stepEntities) : "entered"/"exited"/null, jamais de
  // bascule fantôme au tout premier calcul pour une entité.

  const transitionLevel = parseLevel(
    {
      id: "movement-check-presence-transition",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      entities: [{ id: "flicker", type: "dog", x: 5, presence: NIGHT_ONLY }],
    },
    PRESENCE_REGISTRY
  );

  // Jour (état de départ) : premier calcul JAMAIS fait pour cette entité ->
  // AUCUNE bascule, quelle que soit la valeur de présence de départ —
  // même dormante dès ce premier calcul, ce n'est pas "une sortie".
  let transitionState = createInitialState(transitionLevel, undefined, NO_COMPANIONS);
  transitionState = reduce(transitionState, tick(0));
  run(
    "presence : aucune bascule au tout premier calcul (montage), même dormante",
    null,
    getActiveWorld(transitionState).entities[0].presenceChanged
  );
  run("presence : présence de départ (jour) correctement dormante", false, getActiveWorld(transitionState).entities[0].present);

  // Un tick de plus, TOUJOURS jour : rien ne change -> pas de bascule.
  transitionState = reduce(transitionState, tick(0));
  run(
    "presence : aucune bascule tant que la présence ne change pas (jour -> jour)",
    null,
    getActiveWorld(transitionState).entities[0].presenceChanged
  );

  // Bascule vers la nuit : le tick qui suit le changement d'heure observe
  // dormante -> présente -> "entered".
  transitionState = advanceTime(transitionState, 14 * 60); // 8h -> 22h (nuit)
  transitionState = reduce(transitionState, tick(0));
  run(
    'presence : bascule dormante -> présente détectée ("entered")',
    "entered",
    getActiveWorld(transitionState).entities[0].presenceChanged
  );
  run("presence : présente après la bascule", true, getActiveWorld(transitionState).entities[0].present);

  // Tick de plus, toujours nuit : plus de bascule (déjà présente).
  transitionState = reduce(transitionState, tick(0));
  run(
    "presence : aucune bascule tant que la présence ne change pas (nuit -> nuit)",
    null,
    getActiveWorld(transitionState).entities[0].presenceChanged
  );

  // Retour au jour : présente -> dormante -> "exited".
  transitionState = advanceTime(transitionState, 12 * 60); // 22h -> 10h le lendemain (jour)
  transitionState = reduce(transitionState, tick(0));
  run(
    'presence : bascule présente -> dormante détectée ("exited")',
    "exited",
    getActiveWorld(transitionState).entities[0].presenceChanged
  );
  run("presence : dormante après la bascule", false, getActiveWorld(transitionState).entities[0].present);

  // Une valeur de bascule NON NULLE (pas seulement null) survit elle aussi
  // à un aller-retour JSON — transitionState porte "exited" à cet instant.
  const transitionRoundTrip = JSON.parse(JSON.stringify(transitionState));
  run(
    "presence : presenceChanged non nul survit à un aller-retour JSON",
    JSON.stringify(transitionState),
    JSON.stringify(transitionRoundTrip)
  );

  // Entité SANS règle de présence : jamais de champ .presenceChanged non plus.
  run(
    "presence : entité SANS règle ne porte jamais de champ .presenceChanged",
    undefined,
    getActiveWorld(noPresenceState).entities[0].presenceChanged
  );

  // Sérialisation : une session avec des règles de présence actives
  // survit à un aller-retour JSON, sans fuite de non-sérialisable
  // (auditNonSerializable défini plus bas dans ce fichier — hoisting de
  // function declaration, valide depuis ici).
  const presenceRoundTrip = JSON.parse(JSON.stringify(dormantWanderState));
  run(
    "presence : session avec règles de présence survit à un aller-retour JSON",
    JSON.stringify(dormantWanderState),
    JSON.stringify(presenceRoundTrip)
  );
  const presenceLeaks = [];
  auditNonSerializable(dormantWanderState, "presenceSession", new Set(), presenceLeaks);
  run("presence : aucune fuite de non-sérialisable avec des règles de présence actives", 0, presenceLeaks.length);

  // --- Compagnons (brique 1/3 : infrastructure — persistance/injection/
  // traversée, PAS de suivi du joueur à ce stade, voir CLAUDE.md) ---

  const COMPANION_REGISTRY = { dog: { label: "entity.dog" }, npc: { label: "entity.npc" } };
  const companionLevel = parseLevel(
    {
      id: "movement-check-companion-a",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 5,
      entities: [{ id: "npc-a", type: "npc", x: 15 }],
    },
    COMPANION_REGISTRY
  );

  // Défaut (aucune surcharge de companions, contrairement à NO_COMPANIONS
  // utilisé partout ailleurs dans ce fichier) : UN compagnon de test
  // prédéfini, comme au vrai lancement d'une partie (voir core/state.js).
  let companionState = createInitialState(companionLevel, 1);
  run("compagnons : un compagnon prédéfini par défaut", 1, companionState.companions.length);
  run("compagnons : type du compagnon de test", "buddy", companionState.companions[0].type);
  run("compagnons : positionné près du joueur à la création", companionLevel.playerStart, companionState.companions[0].x);

  // Injection à la LECTURE (voir core/state.js/getActiveWorld) : présent
  // dans le flux d'entités du lieu actif (compagnon + npc-a, l'entité
  // native) — mais ABSENT du monde BRUT stocké (session.worlds[...]
  // .entities), qui ne contient QUE npc-a. C'est tout le mécanisme :
  // stocké dans le cercle partie, injecté pour être rendu/tické.
  run("compagnons : injecté dans le flux d'entités du lieu actif (native + compagnon)", 2, getActiveWorld(companionState).entities.length);
  run("compagnons : ABSENT du monde brut stocké (pas persisté avec le lieu)", 1, companionState.worlds[companionLevel.id].entities.length);

  // Comportement "follow" (brique 2/3, voir core/behaviors/follow.js) :
  // co-localisé avec le joueur à la création (distance 0 < minDistance) ->
  // reste immobile tant que le joueur ne s'éloigne pas — contrairement à
  // wander (brique 1), rien de spontané.
  for (let i = 0; i < 10; i++) companionState = reduce(companionState, tick(0));
  run(
    "compagnons : ne bouge pas tant que le joueur reste proche (zone morte)",
    companionLevel.playerStart,
    companionState.companions[0].x
  );

  // Le joueur s'éloigne (tick(1)) : une fois hors de maxDistance, le
  // compagnon suit.
  for (let i = 0; i < 200; i++) companionState = reduce(companionState, tick(1));
  run(
    "compagnons : suit le joueur une fois hors de la zone morte (comportement follow)",
    true,
    companionState.companions[0].x !== companionLevel.playerStart
  );

  // PRNG séparé (companionsRngState) : la présence d'un compagnon ne change
  // RIEN à la trajectoire d'une entité DU LIEU (comparaison directe,
  // réutilise wanderLevel/runTicks déjà définis plus haut) — sinon, deux
  // suites de tirages partageant le même flux se marcheraient dessus, et le
  // comportement d'une entité existante dépendrait silencieusement de la
  // présence ou non d'un compagnon.
  run(
    "compagnons : n'affecte pas la trajectoire d'une entité du lieu (PRNG séparés)",
    JSON.stringify(runTicks(createInitialState(wanderLevel, 42, NO_COMPANIONS), 50).positions),
    JSON.stringify(runTicks(createInitialState(wanderLevel, 42), 50).positions)
  );

  // MAX_COMPANIONS : la liste ne dépasse jamais cette limite, même fournie
  // en surnombre explicitement (ex. futur système de recrutement).
  const tooManyCompanions = Array.from({ length: MAX_COMPANIONS + 3 }, (_, i) => ({
    id: `extra-companion-${i}`,
    type: "dog",
    labelKey: "entity.dog",
    blocksMovement: false,
    x: 0,
    dir: 1,
  }));
  const cappedState = createInitialState(companionLevel, 1, { companions: tooManyCompanions });
  run("compagnons : la liste ne dépasse jamais MAX_COMPANIONS", MAX_COMPANIONS, cappedState.companions.length);

  // --- Compagnons : traversée d'un lieu à l'autre avec la partie ---

  const companionWorldB = parseLevel(
    { id: "movement-check-companion-b", titleKey: "level.demo.title", length: 12, playerStart: 3, entities: [] },
    COMPANION_REGISTRY
  );

  let companionPartie = createInitialState(companionLevel, 1);
  // Le joueur avance, le compagnon (follow) le suit : garantit qu'il ne se
  // retrouve pas "par coïncidence" déjà à la position attendue après la
  // transition (contrairement à wander en brique 1, il ne bouge jamais
  // spontanément — il faut faire bouger sa cible pour l'entraîner).
  for (let i = 0; i < 200; i++) companionPartie = reduce(companionPartie, tick(1));
  const companionXBeforeLeaving = companionPartie.companions[0].x;

  companionPartie = travelToWorld(companionPartie, companionWorldB.id, companionWorldB);

  run(
    "compagnons : réapparaît dans le nouveau lieu, repositionné près du joueur",
    companionWorldB.playerStart,
    companionPartie.companions[0].x
  );
  run(
    "compagnons : a RÉELLEMENT traversé (position différente d'avant le départ)",
    true,
    companionPartie.companions[0].x !== companionXBeforeLeaving
  );
  run(
    "compagnons : flux d'entités du nouveau lieu = natives (0) + compagnons (1), rien de plus",
    1,
    getActiveWorld(companionPartie).entities.length
  );
  run(
    "compagnons : jamais en double (un seul compagnon dans le nouveau lieu)",
    1,
    getActiveWorld(companionPartie).entities.filter((e) => e.id === "companion-test-dog").length
  );
  run(
    "compagnons : PAS de résidu dans l'ancien lieu (monde brut A, toujours sa seule entité native)",
    1,
    companionPartie.worlds[companionLevel.id].entities.length
  );

  // Retour au lieu de départ : de nouveau repositionné près du joueur — pas
  // laissé où il avait fini de suivre avant le premier départ (il n'a pas
  // d'état "de lieu" à restaurer, contrairement à un PNJ rangé dans un monde).
  companionPartie = travelToWorld(companionPartie, companionLevel.id);
  run(
    "compagnons : re-visite -> repositionné près du joueur, pas resté où il suivait",
    companionLevel.playerStart,
    companionPartie.companions[0].x
  );
  run("compagnons : toujours pas de résidu dans le lieu B quitté", 0, companionPartie.worlds[companionWorldB.id].entities.length);

  // --- Comportement "follow" (brique 2/3, voir core/behaviors/follow.js) ---
  // Testé sur des entités du LIEU dédiées (pas les compagnons ci-dessus) :
  // follow est un comportement générique, réutilisable par toute entité —
  // ce découpage isole la logique du comportement de celle du cercle
  // partie, déjà couverte plus haut.

  const FOLLOW_REGISTRY = { dog: { label: "entity.dog" }, wall: { label: "entity.wall", blocksMovement: true } };

  // Cible statique (sans behavior) : cadre de test simple, aucun mouvement
  // parasite à modéliser.
  function makeFollowLevel(overrides = {}) {
    return {
      id: "movement-check-follow",
      titleKey: "level.demo.title",
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

  const followLevel = parseLevel(makeFollowLevel(), FOLLOW_REGISTRY);

  // Cible hors de portée (distance 15 > maxDistance 3) : le suiveur se
  // rapproche, jusqu'à entrer dans la zone morte — puis s'arrête, sans
  // jamais coller à la cible (distance >= minDistance en permanence).
  let followState = createInitialState(followLevel, 1, NO_COMPANIONS);
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
  const closeLevel = parseLevel(
    makeFollowLevel({
      entities: [
        { id: "anchor-1", type: "dog", x: 10 },
        { id: "follower-1", type: "dog", x: 9.7, behavior: { kind: "follow", targetId: "anchor-1", minDistance: 1, maxDistance: 3 } },
      ],
    }),
    FOLLOW_REGISTRY
  );
  let closeState = createInitialState(closeLevel, 1, NO_COMPANIONS);
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
  const followRun1 = runFollowTicks(createInitialState(followLevel, 1, NO_COMPANIONS), 100);
  const followRun2 = runFollowTicks(createInitialState(followLevel, 1, NO_COMPANIONS), 100);
  run("follow : trajectoire reproductible (déterministe, sans PRNG)", JSON.stringify(followRun1), JSON.stringify(followRun2));

  // minDistance >= maxDistance : incohérent (zone morte nulle ou inversée),
  // rejeté au chargement.
  let followMinMaxRejected = false;
  try {
    parseLevel(
      makeFollowLevel({
        entities: [
          { id: "anchor-1", type: "dog", x: 15 },
          { id: "follower-1", type: "dog", x: 0, behavior: { kind: "follow", minDistance: 3, maxDistance: 2 } },
        ],
      }),
      FOLLOW_REGISTRY
    );
  } catch {
    followMinMaxRejected = true;
  }
  run("follow : minDistance >= maxDistance rejeté (incohérent)", true, followMinMaxRejected);

  // Le joueur dépasse le suiveur (passe de l'autre côté) : le suivi
  // s'inverse SANS code spécial — direction recalculée à chaque tick depuis
  // la position courante, jamais mémorisée (voir follow.js). Cible par
  // défaut (targetId omis) : le joueur.
  const passLevel = parseLevel(
    {
      id: "movement-check-follow-pass",
      titleKey: "level.demo.title",
      length: 30,
      playerStart: 20,
      entities: [{ id: "follower-2", type: "dog", x: 15, behavior: { kind: "follow", minDistance: 1, maxDistance: 3 } }],
    },
    FOLLOW_REGISTRY
  );
  let followPassState = createInitialState(passLevel, 1, NO_COMPANIONS);
  // Le joueur reste immobile : le suiveur (distance 5 > 3) se rapproche et
  // se stabilise derrière lui, à gauche.
  for (let i = 0; i < 300; i++) followPassState = reduce(followPassState, tick(0));
  const followerBeforePass = followerX(followPassState, "follower-2");
  run("follow : avant d'être dépassé, suit depuis la gauche", true, followerBeforePass < followPassState.player.x);

  // Le joueur traverse tout le niveau vers la gauche, passe le suiveur, et
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
  const blockedFollowLevel = parseLevel(
    {
      id: "movement-check-follow-blocked",
      titleKey: "level.demo.title",
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
  let blockedFollowState = createInitialState(blockedFollowLevel, 1, NO_COMPANIONS);
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

  // Cible introuvable (cas limite, brique 3/3 : un targetId qui ne
  // correspond à AUCUNE entité connue — futur, dès qu'une cible autre que
  // le joueur sera possible) : follow.js dégrade proprement (intent: 0),
  // jamais de crash. Le joueur, cible par défaut, existe toujours : ce cas
  // ne peut survenir qu'avec un targetId explicite et erroné.
  const missingTargetLevel = parseLevel(
    makeFollowLevel({
      entities: [{ id: "follower-1", type: "dog", x: 5, behavior: { kind: "follow", targetId: "does-not-exist" } }],
    }),
    FOLLOW_REGISTRY
  );
  let missingTargetState = createInitialState(missingTargetLevel, 1, NO_COMPANIONS);
  let missingTargetThrew = false;
  try {
    for (let i = 0; i < 100; i++) missingTargetState = reduce(missingTargetState, tick(0));
  } catch {
    missingTargetThrew = true;
  }
  run("follow : cible introuvable ne fait jamais planter le tick", false, missingTargetThrew);
  run("follow : cible introuvable -> reste immobile (dégradation propre)", 5, followerX(missingTargetState));

  // --- Comportement "goto" (brique 1/2, voir core/behaviors/goto.js) ---
  // Variante de follow SANS zone morte élastique, avec arrêt + signal
  // d'arrivée (gotoArrived) — pas de temporel/trigger ici, cible fixe
  // donnée en dur (brique 2/2, pas encore construite).

  const GOTO_REGISTRY = { dog: { label: "entity.dog" }, wall: { label: "entity.wall", blocksMovement: true } };

  function makeGotoLevel(overrides = {}) {
    return {
      id: "movement-check-goto",
      titleKey: "level.demo.title",
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

  const gotoLevel = parseLevel(makeGotoLevel(), GOTO_REGISTRY);

  // Convergence + arrêt : avance vers la cible jusqu'à atteindre
  // arriveDistance (2×BODY_RADIUS par défaut, voir goto.js), puis
  // s'arrête, sans jamais dépasser la cible.
  let gotoState = createInitialState(gotoLevel, 1, NO_COMPANIONS);
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
  const gotoRun1 = runGotoTicks(createInitialState(gotoLevel, 1, NO_COMPANIONS), 200);
  const gotoRun2 = runGotoTicks(createInitialState(gotoLevel, 1, NO_COMPANIONS), 200);
  run("goto : trajectoire reproductible (déterministe, sans PRNG)", JSON.stringify(gotoRun1), JSON.stringify(gotoRun2));

  // Cible introuvable : dégrade proprement (intent: 0, jamais de crash) —
  // gotoArrived jamais posé, une impossibilité de progresser n'est pas une
  // arrivée (la dégradation en présence pour ce cas reste à la charge d'un
  // futur appelant, brique 2/2).
  const missingGotoTargetLevel = parseLevel(
    makeGotoLevel({
      entities: [{ id: "goer-1", type: "dog", x: 5, behavior: { kind: "goto", targetId: "does-not-exist" } }],
    }),
    GOTO_REGISTRY
  );
  let missingGotoTargetState = createInitialState(missingGotoTargetLevel, 1, NO_COMPANIONS);
  let missingGotoTargetThrew = false;
  try {
    for (let i = 0; i < 100; i++) missingGotoTargetState = reduce(missingGotoTargetState, tick(0));
  } catch {
    missingGotoTargetThrew = true;
  }
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
  const blockedGotoLevel = parseLevel(
    makeGotoLevel({
      entities: [
        { id: "anchor-1", type: "dog", x: 15 },
        { id: "wall-goto", type: "wall", x: 8 },
        { id: "goer-1", type: "dog", x: 0, behavior: { kind: "goto", targetId: "anchor-1" } },
      ],
    }),
    GOTO_REGISTRY
  );
  let blockedGotoState = createInitialState(blockedGotoLevel, 1, NO_COMPANIONS);
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
  let missingTargetIdRejected = false;
  try {
    parseLevel(makeGotoLevel({ entities: [{ id: "goer-1", type: "dog", x: 0, behavior: { kind: "goto" } }] }), GOTO_REGISTRY);
  } catch {
    missingTargetIdRejected = true;
  }
  run("goto : targetId manquant rejeté au chargement (requis, pas de repli)", true, missingTargetIdRejected);

  let invalidArriveDistanceRejected = false;
  try {
    parseLevel(
      makeGotoLevel({
        entities: [{ id: "goer-1", type: "dog", x: 0, behavior: { kind: "goto", targetId: "anchor-1", arriveDistance: -1 } }],
      }),
      GOTO_REGISTRY
    );
  } catch {
    invalidArriveDistanceRejected = true;
  }
  run("goto : arriveDistance invalide (<=0) rejeté au chargement", true, invalidArriveDistanceRejected);

  // --- Triggers de comportement (brique 2/2, voir core/presence.js) ---
  // L'évaluateur de conditions ÉLARGI : une règle porte { when, effects }.
  // "arrived" (nouvelle condition, événementielle) et l'effet "behavior"
  // (nouveau, pose un comportement sur la BASCULE de sa condition, jamais
  // en continu) — voir resolveEntityRules pour le détail.

  // Rétrocompat : le raccourci { when, present } (sans effects) reste
  // compris DIRECTEMENT par resolveEntityRules/isPresent, sans passer par
  // parseLevel — même résultat que sa forme canonique équivalente.
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
  // core/level.js/parseBehavior) — un kind inconnu est rejeté clairement,
  // jamais un crash silencieux plus tard.
  const TRIGGER_REGISTRY = { dog: { label: "entity.dog" } };
  let unknownEffectBehaviorRejected = false;
  try {
    parseLevel(
      {
        id: "movement-check-trigger-invalid",
        titleKey: "level.demo.title",
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
  } catch {
    unknownEffectBehaviorRejected = true;
  }
  run("triggers : kind de comportement inconnu dans un effet -> rejeté au chargement", true, unknownEffectBehaviorRejected);

  // --- Routine complète (habitant, brique 2/2) : jour -> départ -> arrivée
  // -> dormant -> filet de minuit -> réveil ---

  const ROUTINE_REGISTRY = { dog: { label: "entity.dog" }, wall: { label: "entity.wall", blocksMovement: true } };

  function residentRules(doorId) {
    return [
      { when: { type: "arrived" }, effects: [{ type: "presence", present: false }] },
      { when: { type: "timeRange", from: 0, to: 8 }, effects: [{ type: "presence", present: false }] },
      {
        when: { type: "timeRange", from: 8, to: 24 },
        effects: [
          { type: "presence", present: true },
          { type: "behavior", behavior: { kind: "wander"} },
        ],
      },
      {
        when: { type: "timeRange", from: 20, to: 24 },
        effects: [{ type: "behavior", behavior: { kind: "goto", targetId: doorId } }],
      },
    ];
  }

  function makeRoutineLevel(overrides = {}) {
    return {
      id: "movement-check-routine",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "door-1", type: "dog", x: 2 },
        {
          id: "resident-1",
          type: "dog",
          x: 15,
          behavior: { kind: "wander"},
          presence: residentRules("door-1"),
        },
      ],
      ...overrides,
    };
  }

  function resident(routineState, id = "resident-1") {
    return getActiveWorld(routineState).entities.find((e) => e.id === id);
  }

  const routineLevel = parseLevel(makeRoutineLevel(), ROUTINE_REGISTRY);

  // Jour (INITIAL_TIME = 8h) : présente, comportement "wander" — jamais
  // "goto" avant 20h.
  let dayRoutineState = createInitialState(routineLevel, 7, NO_COMPANIONS);
  for (let i = 0; i < 50; i++) dayRoutineState = reduce(dayRoutineState, tick(0));
  run("routine : le jour — présente", true, resident(dayRoutineState).present);
  run("routine : le jour — comportement 'wander'", "wander", resident(dayRoutineState).behavior.kind);

  // Comportement STABLE tant que rien ne bascule : la référence de
  // `.behavior` ne change PAS d'un tick à l'autre une fois la journée
  // installée (preuve directe de "pas réarmé en boucle" — si l'effet
  // réappliquait `.behavior` à chaque tick, wander.js renverrait la
  // référence PASSÉE en argument, mais l'appel { ...entity, behavior:
  // resolved.behaviorEffect } produirait un OBJET NEUF à chaque fois).
  const behaviorRefBefore = resident(dayRoutineState).behavior;
  const dayRoutineStateNext = reduce(dayRoutineState, tick(0));
  run(
    "routine : le jour — comportement JAMAIS réécrit en boucle (référence stable)",
    true,
    resident(dayRoutineStateNext).behavior === behaviorRefBefore
  );

  // 20h : bascule vers "goto" — se dirige vers la porte, reste présente
  // (elle n'a pas encore atteint la porte).
  let eveningRoutineState = createInitialState(routineLevel, 7, NO_COMPANIONS);
  eveningRoutineState = advanceTime(eveningRoutineState, 12 * 60); // 8h -> 20h
  eveningRoutineState = reduce(eveningRoutineState, tick(0));
  run("routine : à 20h — comportement bascule vers 'goto'", "goto", resident(eveningRoutineState).behavior.kind);
  run("routine : à 20h — cible bien 'door-1'", "door-1", resident(eveningRoutineState).behavior.targetId);
  run("routine : à 20h — encore présente (pas encore arrivée)", true, resident(eveningRoutineState).present);

  // Convergence jusqu'à l'arrivée -> dormante.
  for (let i = 0; i < 1000; i++) eveningRoutineState = reduce(eveningRoutineState, tick(0));
  run("routine : arrivée à la porte -> gotoArrived posé", true, resident(eveningRoutineState).gotoArrived);
  run("routine : arrivée à la porte -> dormante (present:false)", false, resident(eveningRoutineState).present);

  // Filet de minuit : un obstacle empêche TOUTE arrivée — reste présente
  // (en route) toute la soirée, jusqu'à ce que minuit force la dormance
  // MALGRÉ l'absence d'arrivée (jamais visiblement "coincée" après minuit).
  const blockedRoutineLevel = parseLevel(
    makeRoutineLevel({
      entities: [
        { id: "door-1", type: "dog", x: 2 },
        { id: "wall-routine", type: "wall", x: 10 },
        {
          id: "resident-1",
          type: "dog",
          x: 15,
          behavior: { kind: "wander"},
          presence: residentRules("door-1"),
        },
      ],
    }),
    ROUTINE_REGISTRY
  );
  let blockedRoutineState = createInitialState(blockedRoutineLevel, 7, NO_COMPANIONS);
  blockedRoutineState = advanceTime(blockedRoutineState, 12 * 60); // -> 20h
  for (let i = 0; i < 500; i++) blockedRoutineState = reduce(blockedRoutineState, tick(0));
  run("routine : bloquée par un obstacle — jamais arrivée", undefined, resident(blockedRoutineState).gotoArrived);
  run("routine : bloquée par un obstacle — reste présente avant minuit", true, resident(blockedRoutineState).present);
  blockedRoutineState = advanceTime(blockedRoutineState, 4 * 60 - 1); // -> juste avant minuit
  blockedRoutineState = reduce(blockedRoutineState, tick(0));
  run("routine : juste avant minuit — encore présente (filet pas encore déclenché)", true, resident(blockedRoutineState).present);
  blockedRoutineState = advanceTime(blockedRoutineState, 2); // -> minuit passé
  blockedRoutineState = reduce(blockedRoutineState, tick(0));
  run("routine : minuit — filet force la dormance MALGRÉ le blocage", false, resident(blockedRoutineState).present);
  run("routine : minuit — toujours jamais 'arrivée' (juste dormante de force)", undefined, resident(blockedRoutineState).gotoArrived);

  // Cible manquante (porte absente) : même filet, l'INTENTION ("elle rentre
  // chez elle") reste honorée même sans marche réelle possible — vérifié en
  // passant RÉELLEMENT par 20h (bascule vers "goto" avec une cible
  // introuvable, dégradation immobile propre — voir goto.js) puis minuit.
  const missingDoorRoutineLevel = parseLevel(
    makeRoutineLevel({
      entities: [
        { id: "resident-1", type: "dog", x: 15, behavior: { kind: "wander"}, presence: residentRules("no-such-door") },
      ],
    }),
    ROUTINE_REGISTRY
  );
  let missingDoorRoutineState = createInitialState(missingDoorRoutineLevel, 7, NO_COMPANIONS);
  missingDoorRoutineState = advanceTime(missingDoorRoutineState, 12 * 60); // -> 20h
  let missingDoorThrew = false;
  try {
    for (let i = 0; i < 100; i++) missingDoorRoutineState = reduce(missingDoorRoutineState, tick(0));
  } catch {
    missingDoorThrew = true;
  }
  run("routine : cible de porte manquante — ne plante jamais", false, missingDoorThrew);
  run("routine : cible de porte manquante — bascule quand même vers 'goto'", "goto", resident(missingDoorRoutineState).behavior.kind);
  run("routine : cible de porte manquante — reste immobile (dégradation propre)", 15, resident(missingDoorRoutineState).x);
  missingDoorRoutineState = advanceTime(missingDoorRoutineState, 4 * 60 + 1); // -> minuit passé
  missingDoorRoutineState = reduce(missingDoorRoutineState, tick(0));
  run(
    "routine : cible de porte manquante — le filet de minuit force quand même la dormance",
    false,
    resident(missingDoorRoutineState).present
  );

  // Réveil (8h le lendemain) : présente à nouveau, comportement 'wander' —
  // repart pour un nouveau cycle. Note de décalage d'UN TICK (~16 ms,
  // imperceptible) : "arrived" reste vraie tant que `.behavior.kind` n'a
  // pas ENCORE été corrigé vers "wander" — au tick où la fenêtre "8h..24h"
  // bascule, l'effet "behavior" s'applique QUAND MÊME (indépendamment de la
  // présence, voir resolveEntityRules) et corrige `.behavior`, mais la
  // PRÉSENCE de CE MÊME tick a déjà été calculée contre l'ancien
  // `.behavior` (encore "goto") -> encore dormante PENDANT UN TICK, puis
  // spontanément corrigée au suivant (voir core/presence.js/
  // evaluateArrived). Documenté ici plutôt que masqué par une boucle large.
  // Détour par la nuit profonde (1h) AVEC un tick réel avant de sauter à
  // 8h : nécessaire pour que `ruleActive` enregistre RÉELLEMENT la fenêtre
  // "8h..24h" comme retombée à faux entre-temps (un saut direct 20h->8h,
  // sans jamais tic ker entre les deux, ne verrait jamais cette bascule —
  // artefact du SAUT de advanceTime, pas du jeu réel, qui tique en continu).
  let morningRoutineState = eveningRoutineState; // déjà arrivée + dormante (soir précédent)
  morningRoutineState = advanceTime(morningRoutineState, 5 * 60); // 20h -> 1h
  morningRoutineState = reduce(morningRoutineState, tick(0));
  morningRoutineState = advanceTime(morningRoutineState, 7 * 60); // 1h -> 8h
  const morningTick1 = reduce(morningRoutineState, tick(0));
  run(
    "routine : réveil (8h), 1er tick — comportement déjà corrigé vers 'wander' (l'effet s'applique même dormante)",
    "wander",
    resident(morningTick1).behavior.kind
  );
  const morningTick2 = reduce(morningTick1, tick(0));
  run("routine : réveil (8h), tick suivant — présente à nouveau", true, resident(morningTick2).present);
  run("routine : réveil (8h), tick suivant — comportement 'wander'", "wander", resident(morningTick2).behavior.kind);

  // --- Miroir demo1/demo2 (même personnage, deux déclarations séparées,
  // AUCUN état partagé) : jamais présent aux deux, jamais absent aux deux.
  // Instantanés RÉALISTES (voir entities/model.md) : demo.json place la
  // porte à ~11 unités de l'habitant (quelques minutes de jeu de marche,
  // largement sous l'heure de battement avant l'ouverture de la fenêtre
  // "maison" à 21h) — les instantanés à 21h/23h supposent donc une arrivée
  // déjà faite, comme en jeu réel.

  const homeRule = { when: { type: "timeRange", from: 21, to: 8 }, effects: [{ type: "presence", present: true }] };
  const homeInstance = { id: "npc-resident-home", presence: [homeRule] };

  const checkpoints = [
    { hour: 12, awayBehavior: { kind: "wander" }, awayArrived: undefined, label: "12h (jour)" },
    { hour: 20, awayBehavior: { kind: "goto" }, awayArrived: undefined, label: "20h (départ tout juste amorcé)" },
    { hour: 21, awayBehavior: { kind: "goto" }, awayArrived: true, label: "21h (arrivée supposée faite)" },
    { hour: 23, awayBehavior: { kind: "goto" }, awayArrived: true, label: "23h (nuit avancée)" },
    { hour: 8, awayBehavior: { kind: "wander" }, awayArrived: true, label: "8h (réveil, comportement déjà repassé à wander)" },
  ];
  checkpoints.forEach(({ hour, awayBehavior, awayArrived, label }) => {
    const awayInstance = { id: "npc-resident", behavior: awayBehavior, gotoArrived: awayArrived, presence: residentRules("door-1") };
    const context = { time: hour * 60 };
    const awayPresent = isPresent(awayInstance, context);
    const homePresent = isPresent(homeInstance, context);
    run(`miroir demo1/demo2 : ${label} — jamais présent aux deux à la fois`, false, awayPresent && homePresent);
    run(`miroir demo1/demo2 : ${label} — jamais absent aux deux à la fois`, true, awayPresent || homePresent);
  });

  // Sérialisabilité : ruleActive (mémoire de bascule des effets "behavior")
  // survit à un aller-retour JSON, comme tout autre champ d'entité.
  const serializedResident = JSON.parse(JSON.stringify(resident(eveningRoutineState)));
  run(
    "routine : ruleActive survit à un aller-retour JSON",
    JSON.stringify(resident(eveningRoutineState).ruleActive),
    JSON.stringify(serializedResident.ruleActive)
  );

  // --- Compagnons : robustesse (brique 3/3) ---
  // addCompanion (core/state.js) : SEUL point d'ajout. Refuse + signale à la
  // limite, jamais d'éviction silencieuse — voir son commentaire pour la
  // politique complète.
  const fullCompanions = [
    { id: "c1", type: "dog", x: 0 },
    { id: "c2", type: "dog", x: 1 },
  ];
  run("compagnons : addCompanion accepte sous la limite", true, addCompanion([], { id: "c1", type: "dog", x: 0 }).added);
  const acceptedResult = addCompanion([fullCompanions[0]], fullCompanions[1]);
  run("compagnons : addCompanion accepté -> liste allongée de un", 2, acceptedResult.companions.length);
  const refusedResult = addCompanion(fullCompanions, { id: "c3", type: "dog", x: 2 });
  run("compagnons : addCompanion refuse au-delà de MAX_COMPANIONS", false, refusedResult.added);
  run(
    "compagnons : addCompanion refusé -> liste renvoyée INCHANGÉE (pas d'éviction)",
    fullCompanions,
    refusedResult.companions
  );

  // --- Surfaces de sol (core/surfaces.js + level.js) ---
  // registre + carte + surfaceAt/surfaceProps = CORE pur, testable ici sans
  // navigateur (la dérivation du SON reste à la vue, voir
  // view/audio/city-scene.js — hors de portée d'un test terminal).

  run("surfaces : registre — concrete est neutre", true, surfaceProps("concrete").neutral);
  run("surfaces : registre — sand est spécial", false, surfaceProps("sand").neutral);
  run("surfaces : registre — nom inconnu -> undefined", undefined, surfaceProps("does-not-exist"));

  const surfaceLevel = parseLevel(
    {
      id: "movement-check-surfaces",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      defaultSurface: "concrete",
      segments: [{ from: 5, to: 10, surface: "sand" }],
      entities: [],
    },
    EMPTY_REGISTRY
  );
  run("surfaces : surfaceAt — defaultSurface hors segment", "concrete", surfaceAt(surfaceLevel, 2));
  run("surfaces : surfaceAt — segment couvrant (borne from incluse)", "sand", surfaceAt(surfaceLevel, 5));
  run("surfaces : surfaceAt — segment couvrant (milieu)", "sand", surfaceAt(surfaceLevel, 7));
  run("surfaces : surfaceAt — segment couvrant (borne to incluse)", "sand", surfaceAt(surfaceLevel, 10));
  run("surfaces : surfaceAt — juste après le segment, retombe sur defaultSurface", "concrete", surfaceAt(surfaceLevel, 10.5));
  run("surfaces : surfacePropsAt — délègue à surfaceProps(surfaceAt(...))", SURFACE_REGISTRY.sand, surfacePropsAt(surfaceLevel, 7));

  // defaultSurface : FILET silencieux si absent (comme floors) — toute
  // scène existante qui n'en déclare pas continue de charger, résolue au
  // défaut du registre.
  const noSurfaceLevel = parseLevel(
    { id: "movement-check-surfaces-default", titleKey: "level.demo.title", length: 10, playerStart: 0, entities: [] },
    EMPTY_REGISTRY
  );
  run("surfaces : defaultSurface absent -> repli sur DEFAULT_SURFACE", DEFAULT_SURFACE, noSurfaceLevel.defaultSurface);
  run("surfaces : segments absent -> tableau vide (jamais undefined)", 0, noSurfaceLevel.segments.length);

  // defaultSurface/segment FOURNI mais invalide -> échec clair (jamais un
  // filet, contrairement à l'omission ci-dessus) : une référence de contenu
  // erronée ne doit jamais se dégrader en silence.
  let unknownDefaultSurfaceThrew = false;
  try {
    parseLevel(
      { id: "x", titleKey: "level.demo.title", length: 10, playerStart: 0, defaultSurface: "lava", entities: [] },
      EMPTY_REGISTRY
    );
  } catch {
    unknownDefaultSurfaceThrew = true;
  }
  run("surfaces : defaultSurface inconnue du registre -> échec clair", true, unknownDefaultSurfaceThrew);

  let unknownSegmentSurfaceThrew = false;
  try {
    parseLevel(
      {
        id: "x",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 0,
        segments: [{ from: 0, to: 5, surface: "lava" }],
        entities: [],
      },
      EMPTY_REGISTRY
    );
  } catch {
    unknownSegmentSurfaceThrew = true;
  }
  run("surfaces : segment de surface inconnue -> échec clair", true, unknownSegmentSurfaceThrew);

  let malformedSegmentThrew = false;
  try {
    parseLevel(
      {
        id: "x",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 0,
        segments: [{ from: 6, to: 3, surface: "sand" }], // from >= to
        entities: [],
      },
      EMPTY_REGISTRY
    );
  } catch {
    malformedSegmentThrew = true;
  }
  run("surfaces : segment mal formé (from >= to) -> échec clair", true, malformedSegmentThrew);

  // Sérialisabilité : aller-retour JSON fidèle, aucune clé undefined injectée.
  const surfaceRoundTrip = JSON.parse(JSON.stringify(surfaceLevel));
  run(
    "surfaces : structure identique après aller-retour JSON",
    JSON.stringify(surfaceLevel),
    JSON.stringify(surfaceRoundTrip)
  );
  run(
    "surfaces : surfaceAt fonctionne sur la carte reparse",
    "sand",
    surfaceAt(surfaceRoundTrip, 7)
  );

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
        { id: "audit-dog", type: "dog", x: 10, behavior: { kind: "wander"} },
        { id: "audit-door", type: "door", x: 15, target: "movement-check-audit-b" },
      ],
    },
    AUDIT_REGISTRY
  );
  const auditWorldB = parseLevel(
    { id: "movement-check-audit-b", titleKey: "level.demo.title", length: 15, playerStart: 3, entities: [] },
    AUDIT_REGISTRY
  );

  // Compagnon EXPLICITE (pas le défaut de createTestCompanion) : targetId
  // écrit en dur plutôt que laissé au défaut interne de follow.js, pour que
  // l'aller-retour JSON exerce réellement cette clé (brique 3/3 — l'audit
  // datait d'avant les compagnons, jamais vérifié avec l'un d'eux avant).
  const auditCompanion = {
    id: "audit-companion",
    type: "dog",
    x: 2,
    behavior: { kind: "follow", targetId: "player", minDistance: 1, maxDistance: 3 },
  };
  let auditSession = createInitialState(auditWorldA, 77, { companions: [auditCompanion] });
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

      // Compagnon (brique 3/3) : même garanties que le PNJ ci-dessus, PLUS
      // la garantie propre aux compagnons (jamais rangés avec un monde
      // quitté, voir core/state.js/getActiveWorld) — vérifiées ICI, sur la
      // partie RECONSTRUITE depuis JSON, pas sur l'originale (qui n'a
      // jamais transité par une désérialisation).
      run(
        "sérialisation : le compagnon garde son comportement et sa cible après rechargement",
        JSON.stringify(auditCompanion.behavior),
        JSON.stringify(revived.companions.find((c) => c.id === "audit-companion").behavior)
      );
      run(
        "sérialisation : aucun résidu du compagnon dans le monde quitté (B) après rechargement",
        false,
        revived.worlds[auditWorldB.id].entities.some((e) => e.id === "audit-companion")
      );
      run(
        "sérialisation : le compagnon reparu est injecté une seule fois dans le lieu actif",
        1,
        getActiveWorld(revived).entities.filter((e) => e.id === "audit-companion").length
      );

      // Suivi toujours actif : le joueur s'éloigne largement (vers la
      // droite, où le lieu A laisse de la marge, playerStart=2/length=20) —
      // le compagnon reconstruit depuis JSON doit encore réagir (targetId
      // "player" toujours résolu, comportement follow intact).
      const companionXAfterReturn = revived.companions.find((c) => c.id === "audit-companion").x;
      for (let i = 0; i < 300; i++) revived = reduce(revived, tick(1));
      const companionXAfterChase = revived.companions.find((c) => c.id === "audit-companion").x;
      run(
        "sérialisation : le compagnon suit toujours après un aller-retour JSON",
        true,
        companionXAfterChase !== companionXAfterReturn
      );
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

  // Sauvegarde ANTÉRIEURE à floors/defaultSurface/segments (voir
  // core/level.js/parseLevel) : ses mondes n'ont jamais eu ces clés, et une
  // relecture de sauvegarde ne repasse jamais par parseLevel — sans
  // rebouchage (core/save.js/backfillWorld), surfaceAt(world, x) plante sur
  // world.segments.find(...) dès qu'un tel monde redevient actif (bug réel,
  // trouvé en jeu).
  const oldWorlds = {};
  for (const [id, world] of Object.entries(auditSession.worlds)) {
    const { floors, defaultSurface, segments, ...oldWorld } = world;
    oldWorlds[id] = oldWorld;
  }
  const oldSave = { version: SAVE_VERSION, data: { ...auditSession, worlds: oldWorlds } };
  const oldSaveResult = deserializeGame(oldSave);
  run("save : sauvegarde antérieure aux surfaces acceptée (reboutchée)", true, oldSaveResult.success);
  if (oldSaveResult.success) {
    const revivedWorld = oldSaveResult.session.worlds[oldSaveResult.session.activeWorldId];
    run("save : monde rebouché — floors par défaut", 1, revivedWorld.floors);
    run("save : monde rebouché — defaultSurface par défaut", DEFAULT_SURFACE, revivedWorld.defaultSurface);
    run("save : monde rebouché — segments par défaut (tableau vide)", 0, revivedWorld.segments.length);
    let surfaceAtThrew = false;
    try {
      surfaceAt(revivedWorld, 0);
    } catch {
      surfaceAtThrew = true;
    }
    run("save : surfaceAt ne plante jamais sur un monde rebouché", false, surfaceAtThrew);
  }

  // Sauvegarde ANTÉRIEURE à l'horloge de partie (voir core/time.js) : jamais
  // eu de clé .time — sans rebouchage (core/save.js/migrateSave), toute
  // dérivation (minuteOfHour, etc.) recevrait undefined au lieu d'un nombre.
  const { time: _droppedTime, ...auditSessionWithoutTime } = auditSession;
  const oldTimeSave = { version: SAVE_VERSION, data: auditSessionWithoutTime };
  const oldTimeSaveResult = deserializeGame(oldTimeSave);
  run("save : sauvegarde antérieure à l'horloge acceptée (rebouchée)", true, oldTimeSaveResult.success);
  if (oldTimeSaveResult.success) {
    run("save : partie rebouchée — time par défaut (INITIAL_TIME)", INITIAL_TIME, oldTimeSaveResult.session.time);
  }

  console.log(`Récapitulatif : ${passed} réussis / ${total} total`);
  return { passed, total };
}
