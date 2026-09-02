// Vérifications du déplacement du core, exécutables depuis la console du
// navigateur (Node n'est pas disponible sur cette machine). Pur : aucun DOM,
// aucun fetch. Le niveau est construit en dur via un objet littéral, passé à
// parseLevel — aucune dépendance hors des modules du core.

import { parseLevel } from "./level.js";
import {
  createInitialState,
  getActiveWorld,
  travelToWorld,
  switchSide,
  addCompanion,
  removeEntity,
  markConsumed,
  spawnEphemeral,
  spawnScatteredEphemerals,
  drawScatteredPosition,
  togglePerception,
  applyEntityActionEffects,
  MOVE_STEP,
  BODY_RADIUS,
} from "./state.js";
import { tick } from "./actions.js";
import { reduce } from "./reduce.js";
import { moveAndBounce } from "./physics/movement.js";
import { resolvePlayerMove } from "./physics/collision.js";
import { SAVE_VERSION, serializeGame, deserializeGame } from "./save.js";
import { addMoney, pickupEntity, lootEntity, lootEntitySpawn } from "./money.js";
import { addItem, pickupItemEntity, removeItem, dropItem } from "./bag.js";
import { ITEM_REGISTRY, itemProps, validateItemTags } from "./items.js";
import { EQUIPMENT_SLOTS, createEmptyEquipment, gaitOf, equipItem, unequipItem, equippedTags } from "./equipment.js";
import { TAG_REGISTRY, tagProps } from "./tags.js";
import { createSeed } from "./rng.js";
import { MAX_COMPANIONS } from "../config/companions.js";
import { MAX_EPHEMERALS } from "../config/ephemerals.js";
import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { SURFACE_REGISTRY, DEFAULT_SURFACE, surfaceAt, surfaceProps, surfacePropsAt } from "./surfaces.js";
import {
  INITIAL_TIME,
  SEASON_KEYS,
  MONTH_KEYS,
  WEEKDAY_KEYS,
  advanceTime,
  minuteOfHour,
  hourOfDay,
  dayOfMonth,
  monthOfYear,
  seasonOfYear,
  yearNumber,
  weekdayOf,
  phaseAt,
} from "./time.js";
import { TIME_CONFIG } from "../config/time-values.js";
import { evaluateCondition, isPresent, isBlocking, resolveEntityRules, selectMatchingAction } from "./presence.js";
import { DEFAULTS as WANDER_DEFAULTS } from "./behaviors/wander.js";
import { validateWeatherStates, createInitialWeather, advanceWeather, pickTransition, setWeather, triggerNextWeatherTransition } from "./weather.js";
import { WEATHER_STATES, DEFAULT_WEATHER_STATE } from "../config/weather-values.js";
import { parseVariables, getVariable, setVariable, applyActionEffects } from "./variables.js";

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

  // --- Vitesse (speed) : consommée par la PHYSIQUE de résolution, jamais
  // par le comportement (voir core/physics/collision.js/resolveBlockedMove,
  // core/reduce.js/resolveIntents) — wander/follow/goto continuent de ne
  // produire qu'une intention de direction, ignorant tout de la vitesse.
  // Cascade instance -> archétype -> défaut (1), même patron que
  // blocksMovement/isFlying (core/level.js/parseEntity).

  const SPEED_REGISTRY = {
    dog: { label: "entity.dog" },
    slowDog: { label: "entity.dog", speed: 0.5 },
  };

  const speedDefaultLevel = parseLevel(
    { id: "movement-check-speed-default", titleKey: "level.demo.title", length: 10, playerStart: 5, entities: [{ id: "e1", type: "dog", x: 5 }] },
    SPEED_REGISTRY
  );
  run("speed : défaut (ni instance ni type) -> 1", 1, speedDefaultLevel.entities[0].speed);

  const speedTypeLevel = parseLevel(
    { id: "movement-check-speed-type", titleKey: "level.demo.title", length: 10, playerStart: 5, entities: [{ id: "e1", type: "slowDog", x: 5 }] },
    SPEED_REGISTRY
  );
  run("speed : hérité de l'archétype si l'instance ne surcharge pas", 0.5, speedTypeLevel.entities[0].speed);

  const speedOverrideLevel = parseLevel(
    { id: "movement-check-speed-override", titleKey: "level.demo.title", length: 10, playerStart: 5, entities: [{ id: "e1", type: "slowDog", x: 5, speed: 2 }] },
    SPEED_REGISTRY
  );
  run("speed : surcharge d'instance prioritaire sur l'archétype", 2, speedOverrideLevel.entities[0].speed);

  function expectSpeedRejected(speed) {
    let rejected = false;
    try {
      parseLevel(
        { id: "movement-check-speed-invalid", titleKey: "level.demo.title", length: 10, playerStart: 5, entities: [{ id: "e1", type: "dog", x: 5, speed }] },
        SPEED_REGISTRY
      );
    } catch {
      rejected = true;
    }
    return rejected;
  }
  run("speed : 0 rejeté au chargement", true, expectSpeedRejected(0));
  run("speed : négatif rejeté au chargement", true, expectSpeedRejected(-1));
  run("speed : non numérique rejeté au chargement", true, expectSpeedRejected("lent"));

  // Conséquence physique : un mobile deux fois plus lent parcourt EXACTEMENT
  // la moitié de la distance sur le même nombre de ticks, à comportement
  // IDENTIQUE (même seed, marche forcée sans pause ni rebond — walkMin=
  // walkMax élevé, corridor large pour ne jamais toucher un bord).
  function makeSpeedWanderLevel(speed) {
    return parseLevel(
      {
        id: `movement-check-speed-wander-${speed}`,
        titleKey: "level.demo.title",
        length: 100,
        playerStart: 50,
        entities: [{ id: "e1", type: "dog", x: 50, speed, behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 } }],
      },
      SPEED_REGISTRY
    );
  }
  let fastSpeedState = createInitialState(makeSpeedWanderLevel(1), 3, NO_COMPANIONS);
  let slowSpeedState = createInitialState(makeSpeedWanderLevel(0.5), 3, NO_COMPANIONS);
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
  run(
    "speed : état interne du comportement identique quelle que soit la vitesse (wander ignore speed)",
    JSON.stringify({ phase: fastSpeedEntity.wander.phase, ticksLeft: fastSpeedEntity.wander.ticksLeft, dir: fastSpeedEntity.wander.dir }),
    JSON.stringify({ phase: slowSpeedEntity.wander.phase, ticksLeft: slowSpeedEntity.wander.ticksLeft, dir: slowSpeedEntity.wander.dir })
  );

  // Non-régression du JOUEUR : resolvePlayerMove SANS speed fourni avance
  // d'EXACTEMENT MOVE_STEP — le joueur ne fournit jamais de speed (voir
  // core/reduce.js), donc rien ne change pour lui.
  const playerMoveNoSpeed = resolvePlayerMove(5, 1, [], 10, { time: 0 });
  run("speed : resolvePlayerMove sans speed avance de MOVE_STEP (joueur rigoureusement inchangé)", 5 + MOVE_STEP, playerMoveNoSpeed.x);

  // follow ET goto respectent aussi speed (pas seulement wander) — un
  // compagnon pourrait avoir sa propre vitesse.
  const speedFollowLevel = parseLevel(
    {
      id: "movement-check-speed-follow",
      titleKey: "level.demo.title",
      length: 100,
      playerStart: 50,
      entities: [
        { id: "follower", type: "dog", x: 40, speed: 0.5, behavior: { kind: "follow", targetId: "player", minDistance: 1, maxDistance: 3 } },
      ],
    },
    SPEED_REGISTRY
  );
  let speedFollowState = createInitialState(speedFollowLevel, 1, NO_COMPANIONS);
  speedFollowState = reduce(speedFollowState, tick(0)); // joueur immobile, follower loin -> avance vers lui
  const speedFollowDelta = getActiveWorld(speedFollowState).entities[0].x - 40;
  run("speed : follow avance de MOVE_STEP × speed (0.5)", true, Math.abs(speedFollowDelta - MOVE_STEP * 0.5) < 1e-9);

  const speedGotoLevel = parseLevel(
    {
      id: "movement-check-speed-goto",
      titleKey: "level.demo.title",
      length: 100,
      playerStart: 50,
      entities: [
        { id: "walker", type: "dog", x: 10, speed: 0.5, behavior: { kind: "goto", targetId: "landmark" } },
        { id: "landmark", type: "dog", x: 90 },
      ],
    },
    SPEED_REGISTRY
  );
  let speedGotoState = createInitialState(speedGotoLevel, 1, NO_COMPANIONS);
  speedGotoState = reduce(speedGotoState, tick(0));
  const speedGotoDelta = getActiveWorld(speedGotoState).entities.find((e) => e.id === "walker").x - 10;
  run("speed : goto avance de MOVE_STEP × speed (0.5)", true, Math.abs(speedGotoDelta - MOVE_STEP * 0.5) < 1e-9);

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

  // --- isFlying : marqueur PUR (voir entities/model.md), même cascade
  // EXACTE que observable/interactable ci-dessus (instance -> type -> défaut
  // false) — le core ne connaît rien du SENS de ce champ (chaîne de filtres
  // audio, entièrement côté vue, hors de portée d'un check terminal), il ne
  // fait que le résoudre et le transporter, comme les deux autres.

  const FLYING_REGISTRY = {
    winged: { label: "entity.bird", isFlying: true },
    grounded: { label: "entity.dog" }, // non déclaré -> défaut false
  };
  const flyingLevel = parseLevel(
    {
      id: "movement-check-flying",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "e-winged", type: "winged", x: 5 },
        { id: "e-grounded", type: "grounded", x: 6 },
        { id: "e-override-true", type: "grounded", x: 7, isFlying: true }, // surcharge d'instance
        { id: "e-override-false", type: "winged", x: 8, isFlying: false }, // idem, désactive le défaut du type
      ],
    },
    FLYING_REGISTRY
  );
  function flyingEntity(id) {
    return flyingLevel.entities.find((e) => e.id === id);
  }
  run("isFlying : défaut du type — hérité (true)", true, flyingEntity("e-winged").isFlying);
  run("isFlying : non déclaré -> false par défaut", false, flyingEntity("e-grounded").isFlying);
  run("isFlying : surcharge d'instance (true sur un type qui ne le déclare pas)", true, flyingEntity("e-override-true").isFlying);
  run("isFlying : surcharge d'instance (désactive le défaut du type)", false, flyingEntity("e-override-false").isFlying);

  let invalidFlyingRejected = false;
  try {
    parseLevel(
      { id: "movement-check-flying-invalid", titleKey: "level.demo.title", length: 10, playerStart: 0, entities: [{ id: "bad", type: "grounded", x: 5, isFlying: "oui" }] },
      FLYING_REGISTRY
    );
  } catch {
    invalidFlyingRejected = true;
  }
  run("isFlying : non booléen rejeté", true, invalidFlyingRejected);

  // action : TRANSPORT générique, cascade instance -> type (comme
  // behavior/presence) — le core valide la FORME (objet, kind non vide),
  // jamais le kind lui-même contre un registre (ça reste entièrement côté
  // vue, voir view/interaction.js/ACTION_HANDLERS) : un kind qu'AUCUN
  // gestionnaire ne reconnaît encore charge sans erreur, se dégradera
  // proprement à l'INTERACTION, pas au chargement.
  const ACTION_REGISTRY = {
    withDefault: { label: "entity.dog", interactable: true, action: { kind: "pickup", amount: 5 } },
    plain: { label: "entity.dog" },
  };
  const actionLevel = parseLevel(
    {
      id: "movement-check-action",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "e-default", type: "withDefault", x: 5 },
        { id: "e-override", type: "withDefault", x: 6, action: { kind: "pickup", amount: 99 } },
        { id: "e-no-action", type: "plain", x: 7 },
        { id: "e-unknown-kind", type: "plain", x: 8, action: { kind: "fly-away" } },
      ],
    },
    ACTION_REGISTRY
  );
  function actionEntity(id) {
    return actionLevel.entities.find((e) => e.id === id);
  }
  run("action : défaut du type hérité", JSON.stringify({ kind: "pickup", amount: 5 }), JSON.stringify(actionEntity("e-default").action));
  run(
    "action : surcharge d'instance REMPLACE (pas de fusion), amount du type ignoré",
    JSON.stringify({ kind: "pickup", amount: 99 }),
    JSON.stringify(actionEntity("e-override").action)
  );
  run("action : absente si ni l'instance ni le type n'en fournissent", undefined, actionEntity("e-no-action").action);
  run(
    "action : un kind INCONNU du registre de vue charge sans erreur (transport pur, voir header)",
    "fly-away",
    actionEntity("e-unknown-kind").action.kind
  );

  run("action : non-objet rejeté au chargement", true, expectInteractionRejected("action", "pickup"));
  run("action : kind manquant rejeté au chargement", true, expectInteractionRejected("action", {}));
  run("action : kind vide rejeté au chargement", true, expectInteractionRejected("action", { kind: "" }));

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

  // --- Scène à deux faces (recto/verso), étape 1/2 (voir CLAUDE.md/
  // "RECTO/VERSO", level/schema.md, core/state.js/isTwoSided) ---

  // Validation au chargement : recto/verso requis ENSEMBLE, jamais un seul
  // champ de face à la racine en même temps.
  const twoFacedRawLevel = {
    id: "movement-check-twoface",
    titleKey: "level.demo.title",
    length: 10,
    playerStart: 1,
    recto: { entities: [{ id: "recto-dog", type: "dog", x: 3, behavior: { kind: "wander" } }] },
    verso: { entities: [{ id: "verso-dog", type: "dog", x: 7, behavior: { kind: "wander" } }] },
  };

  let missingVersoRejected = false;
  try {
    parseLevel({ ...twoFacedRawLevel, verso: undefined }, WORLD_A_REGISTRY);
  } catch {
    missingVersoRejected = true;
  }
  run("deux faces : recto déclaré sans verso est rejeté", true, missingVersoRejected);

  let leakedFaceFieldRejected = false;
  try {
    parseLevel({ ...twoFacedRawLevel, entities: [] }, WORLD_A_REGISTRY);
  } catch {
    leakedFaceFieldRejected = true;
  }
  run("deux faces : un champ de face (entities) à la racine est rejeté", true, leakedFaceFieldRejected);

  const twoFacedLevel = parseLevel(twoFacedRawLevel, WORLD_A_REGISTRY);
  run("deux faces : parseLevel construit recto ET verso", true, Boolean(twoFacedLevel.recto) && Boolean(twoFacedLevel.verso));
  run("deux faces : aucun `entities` à la racine du niveau parsé", undefined, twoFacedLevel.entities);
  run("deux faces : recto porte ses propres entités", "recto-dog", twoFacedLevel.recto.entities[0].id);
  run("deux faces : verso porte ses propres entités", "verso-dog", twoFacedLevel.verso.entities[0].id);

  // Rétrocompat stricte : une scène simple (déjà parsée plus haut, `level`)
  // ne porte jamais recto/verso.
  run("scène simple : jamais de recto/verso (rétrocompat)", undefined, level.recto);

  // Construction : recto/verso ont chacun leur PROPRE rngState (graines
  // distinctes, voir core/state.js/createFaceState) — jamais la même suite
  // de tirages pour les deux faces d'un même monde.
  let twoFaceSession = createInitialState(twoFacedLevel, 99, NO_COMPANIONS);
  run("deux faces : player.side par défaut 'recto'", "recto", twoFaceSession.player.side);
  const twoFaceWorldId = twoFacedLevel.id;
  const twoFaceWorldAtStart = twoFaceSession.worlds[twoFaceWorldId];
  run(
    "deux faces : le monde créé porte recto ET verso",
    true,
    Boolean(twoFaceWorldAtStart.recto) && Boolean(twoFaceWorldAtStart.verso)
  );
  run(
    "deux faces : recto et verso ont des rngState distincts",
    true,
    twoFaceWorldAtStart.recto.rngState !== twoFaceWorldAtStart.verso.rngState
  );
  run("deux faces : lastVisited vit au niveau du monde (partagé, pas par face)", 0, twoFaceWorldAtStart.lastVisited);
  run("deux faces : aucun `entities` au niveau du monde (seulement par face)", undefined, twoFaceWorldAtStart.entities);

  // getActiveWorld : aplatit la face COURANTE, ne fuit jamais recto/verso.
  const twoFaceActiveFlat = getActiveWorld(twoFaceSession);
  run("deux faces : getActiveWorld renvoie la face recto par défaut", "recto-dog", twoFaceActiveFlat.entities[0].id);
  run("deux faces : getActiveWorld ne fuit jamais recto/verso", undefined, twoFaceActiveFlat.recto);

  // TICK, étape 2/2 — COEXISTENCE (voir CLAUDE.md/"RECTO/VERSO",
  // core/reduce.js) : fin du gel de l'étape 1, LES DEUX faces avancent à
  // chaque tick, chacune dans sa PROPRE suite de tirages (isolation de
  // déterminisme, voir plus haut).
  for (let i = 0; i < 30; i++) twoFaceSession = reduce(twoFaceSession, tick(0));
  const rectoDogXAfterTicks = twoFaceSession.worlds[twoFaceWorldId].recto.entities[0].x;
  const versoDogXAfterTicks = twoFaceSession.worlds[twoFaceWorldId].verso.entities[0].x;
  run("deux faces : le PNJ de la face courante (recto) a bougé", true, rectoDogXAfterTicks !== 3);
  run("deux faces : le PNJ de l'AUTRE face (verso) bouge AUSSI (coexistence)", true, versoDogXAfterTicks !== 7);

  // switchSide : bascule DANS le même monde (pas un travelToWorld) — un
  // changement de player.side/x INSTANTANÉ, zéro tick écoulé : les DEUX
  // faces gardent donc exactement leur position d'avant la bascule.
  twoFaceSession = switchSide(twoFaceSession, 6);
  run("switchSide : bascule player.side vers verso", "verso", twoFaceSession.player.side);
  run("switchSide : place le joueur à arrivalX", 6, twoFaceSession.player.x);
  run("switchSide : ne change PAS activeWorldId (même monde)", twoFaceWorldId, twoFaceSession.activeWorldId);
  run(
    "switchSide : bascule instantanée — la face quittée (recto) garde EXACTEMENT sa position",
    rectoDogXAfterTicks,
    twoFaceSession.worlds[twoFaceWorldId].recto.entities[0].x
  );

  for (let i = 0; i < 30; i++) twoFaceSession = reduce(twoFaceSession, tick(0));
  run(
    "switchSide : le PNJ de la NOUVELLE face courante (verso) continue de bouger",
    true,
    twoFaceSession.worlds[twoFaceWorldId].verso.entities[0].x !== versoDogXAfterTicks
  );
  run(
    "switchSide : le PNJ de l'AUTRE face (recto, quittée) continue AUSSI de bouger (coexistence, pas un gel)",
    true,
    twoFaceSession.worlds[twoFaceWorldId].recto.entities[0].x !== rectoDogXAfterTicks
  );

  twoFaceSession = switchSide(twoFaceSession, 2);
  run("switchSide : rebascule player.side vers recto", "recto", twoFaceSession.player.side);

  // --- Isolation stricte (voir entities/model.md/"Recto/verso") : collision
  // ET ciblage de comportement restent bornés à la face de l'entité, jamais
  // croisés entre recto et verso.

  const ISOLATION_REGISTRY = { npc: { label: "entity.npc" }, blocker: { label: "entity.blocker", blocksMovement: true } };

  // Collision : un bloqueur de l'AUTRE face ne doit JAMAIS arrêter le
  // joueur — deux espaces disjoints qui partagent seulement l'axe x.
  const isolationBlockOnRecto = parseLevel(
    {
      id: "movement-check-isolation-block-recto",
      titleKey: "level.demo.title",
      length: 12,
      playerStart: 1,
      recto: { entities: [{ id: "recto-blocker", type: "blocker", x: 6 }] },
      verso: { entities: [] },
    },
    ISOLATION_REGISTRY
  );
  let isolationSessionA = switchSide(createInitialState(isolationBlockOnRecto, 1, NO_COMPANIONS), 4);
  for (let i = 0; i < 80; i++) isolationSessionA = reduce(isolationSessionA, tick(1));
  run("isolation : un bloqueur de l'AUTRE face ne bloque JAMAIS le joueur", null, isolationSessionA.player.blockedBy);
  run("isolation : le joueur traverse librement le x d'un bloqueur de l'autre face", true, isolationSessionA.player.x > 6);

  // CONTRÔLE : le MÊME bloqueur, sur la face du joueur cette fois — DOIT
  // bloquer normalement (prouve que l'absence de blocage ci-dessus relève
  // bien de l'isolation, pas d'une collision cassée en général).
  const isolationBlockOnVerso = parseLevel(
    {
      id: "movement-check-isolation-block-verso",
      titleKey: "level.demo.title",
      length: 12,
      playerStart: 1,
      recto: { entities: [] },
      verso: { entities: [{ id: "verso-blocker", type: "blocker", x: 6 }] },
    },
    ISOLATION_REGISTRY
  );
  let isolationSessionB = switchSide(createInitialState(isolationBlockOnVerso, 1, NO_COMPANIONS), 4);
  for (let i = 0; i < 80; i++) isolationSessionB = reduce(isolationSessionB, tick(1));
  run("isolation (contrôle) : un bloqueur de la MÊME face bloque normalement", "verso-blocker", isolationSessionB.player.blockedBy);
  run("isolation (contrôle) : le joueur est arrêté avant le bloqueur", true, isolationSessionB.player.x < 6);

  // Ciblage de comportement (goto) : ne résout JAMAIS une cible de l'AUTRE
  // face, y compris "player" quand le joueur n'y est pas — voir
  // core/reduce.js, getTargetPosition scopé par face.
  const targetingLevel = parseLevel(
    {
      id: "movement-check-isolation-targeting",
      titleKey: "level.demo.title",
      length: 12,
      playerStart: 6,
      recto: { entities: [{ id: "recto-seeker", type: "npc", x: 2, behavior: { kind: "goto", targetId: "verso-target" } }] },
      verso: {
        entities: [
          { id: "verso-target", type: "npc", x: 10 },
          { id: "verso-seeker", type: "npc", x: 2, behavior: { kind: "goto", targetId: "player" } },
        ],
      },
    },
    ISOLATION_REGISTRY
  );
  let targetingSession = createInitialState(targetingLevel, 1, NO_COMPANIONS);
  for (let i = 0; i < 40; i++) targetingSession = reduce(targetingSession, tick(0));
  run(
    "isolation : un goto de la face courante ne peut jamais cibler une entité de l'autre face",
    2,
    targetingSession.worlds[targetingLevel.id].recto.entities[0].x
  );
  run(
    "isolation : un goto de l'autre face ne peut jamais cibler le joueur (absent de cette face)",
    2,
    targetingSession.worlds[targetingLevel.id].verso.entities.find((e) => e.id === "verso-seeker").x
  );

  // arrivalX est une donnée de CONTENU, jamais validée en bornes au
  // chargement (voir core/level.js/parseEntity, action) — clampée à
  // l'exécution par switchSide, jamais un joueur hors carte.
  const clampedSwitch = switchSide(createInitialState(twoFacedLevel, 1, NO_COMPANIONS), 9999);
  run("switchSide : arrivalX hors bornes est clampé au bord droit", twoFacedLevel.length, clampedSwitch.player.x);

  // Éphémères : spawnEphemeral/removeEntity/markConsumed sont scopés à la
  // face COURANTE (session.player.side), jamais l'autre.
  let twoFaceEphemeralSession = createInitialState(twoFacedLevel, 3, NO_COMPANIONS);
  const TWO_FACE_EPHEMERAL_SPEC = { type: "dog", labelKey: "entity.dog" };
  twoFaceEphemeralSession = spawnEphemeral(twoFaceEphemeralSession, TWO_FACE_EPHEMERAL_SPEC, 4);
  run(
    "deux faces : spawnEphemeral crée sur la face COURANTE (recto)",
    true,
    twoFaceEphemeralSession.worlds[twoFaceWorldId].recto.entities.some((e) => e.ephemeral)
  );
  run(
    "deux faces : spawnEphemeral ne touche jamais l'autre face (verso)",
    false,
    twoFaceEphemeralSession.worlds[twoFaceWorldId].verso.entities.some((e) => e.ephemeral)
  );

  // travelToWorld QUITTE le lieu (pas juste la face) : purge les éphémères
  // des DEUX faces, remet player.side à "recto" (comme playerStart).
  twoFaceEphemeralSession = switchSide(twoFaceEphemeralSession, 5);
  twoFaceEphemeralSession = spawnEphemeral(twoFaceEphemeralSession, TWO_FACE_EPHEMERAL_SPEC, 5);
  run(
    "deux faces : contrôle — un éphémère sur CHAQUE face avant le départ",
    true,
    twoFaceEphemeralSession.worlds[twoFaceWorldId].recto.entities.some((e) => e.ephemeral) &&
      twoFaceEphemeralSession.worlds[twoFaceWorldId].verso.entities.some((e) => e.ephemeral)
  );
  const twoFaceOtherWorld = parseLevel(
    { id: "movement-check-twoface-elsewhere", titleKey: "level.demo.title", length: 5, playerStart: 0, entities: [] },
    WORLD_A_REGISTRY
  );
  const afterLeavingTwoFace = travelToWorld(twoFaceEphemeralSession, twoFaceOtherWorld.id, twoFaceOtherWorld);
  run("deux faces : travelToWorld remet player.side à 'recto' à l'arrivée", "recto", afterLeavingTwoFace.player.side);
  const parkedTwoFaceWorld = afterLeavingTwoFace.worlds[twoFaceWorldId];
  run(
    "deux faces : travelToWorld purge les éphémères des DEUX faces (recto)",
    false,
    parkedTwoFaceWorld.recto.entities.some((e) => e.ephemeral)
  );
  run(
    "deux faces : travelToWorld purge les éphémères des DEUX faces (verso)",
    false,
    parkedTwoFaceWorld.verso.entities.some((e) => e.ephemeral)
  );
  run(
    "deux faces : travelToWorld laisse les entités déclarées intactes (recto)",
    true,
    parkedTwoFaceWorld.recto.entities.some((e) => e.id === "recto-dog")
  );
  run(
    "deux faces : travelToWorld laisse les entités déclarées intactes (verso)",
    true,
    parkedTwoFaceWorld.verso.entities.some((e) => e.id === "verso-dog")
  );

  // Sérialisabilité : aller-retour JSON fidèle sur une session à deux
  // faces — même exigence que le reste du core (voir "Audit de
  // sérialisabilité" plus bas), vérifiée ICI dédiée à ce modèle.
  const twoFaceRoundTripped = JSON.parse(JSON.stringify(afterLeavingTwoFace));
  run(
    "deux faces : structure identique après aller-retour JSON",
    JSON.stringify(afterLeavingTwoFace),
    JSON.stringify(twoFaceRoundTripped)
  );

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

  // Jour de semaine (weekdayOf) : dérivation PURE, jours écoulés modulo 7,
  // décalée par weekdayOrigin (config/time-values.js). MONTH_KEYS/
  // WEEKDAY_KEYS : couverture de taille, comme SEASON_KEYS ci-dessus.
  run("horloge : MONTH_KEYS couvre les 12 mois", 12, MONTH_KEYS.length);
  run("horloge : WEEKDAY_KEYS couvre les 7 jours", 7, WEEKDAY_KEYS.length);
  run("horloge : jour de semaine de départ = weekdayOrigin (jour 1)", TIME_CONFIG.weekdayOrigin, weekdayOf(timeState.time));

  const oneDayMinutes = TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour;
  // Rester dans le MÊME jour (avant minuit) ne fait jamais avancer le jour
  // de semaine — seul le FRANCHISSEMENT de minuit le fait (voir plus bas).
  const sameDayLater = advanceTime(timeState, oneDayMinutes - INITIAL_TIME - 1); // 23:59 du jour 1
  run("horloge : jour de semaine inchangé tant qu'on reste dans le même jour", weekdayOf(timeState.time), weekdayOf(sameDayLater.time));
  const nextDayState = advanceTime(sameDayLater, 1); // minuit, jour 2
  run(
    "horloge : le jour de semaine avance de 1 (modulo 7) au passage de minuit",
    (weekdayOf(timeState.time) + 1) % 7,
    weekdayOf(nextDayState.time)
  );

  // Cycle complet de 7 jours : lundi -> ... -> dimanche -> lundi, jamais un
  // découpage en semaines calées sur le mois/l'année (voir le commentaire de
  // weekdayOf) — vérifié en avançant 7 jours pleins depuis l'origine.
  const sevenDaysLater = advanceTime(timeState, 7 * oneDayMinutes);
  run("horloge : après 7 jours pleins, le jour de semaine boucle exactement", weekdayOf(timeState.time), weekdayOf(sevenDaysLater.time));
  const weekdaysOverTenDays = [];
  for (let d = 0; d < 10; d++) weekdaysOverTenDays.push(weekdayOf(advanceTime(timeState, d * oneDayMinutes).time));
  run(
    "horloge : séquence de jours de semaine sur 10 jours, cycle de 7 respecté",
    JSON.stringify([0, 1, 2, 3, 4, 5, 6, 0, 1, 2].map((offset) => (offset + TIME_CONFIG.weekdayOrigin) % 7)),
    JSON.stringify(weekdaysOverTenDays)
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
  run(
    "presence : type de condition inconnu -> false (jamais un throw)",
    false,
    evaluateCondition({ type: "doesNotExist" }, { time: 0 })
  );

  // evaluateCondition/timeRange — VARIATION DE SEUIL PAR INSTANCE (cond.spread,
  // core/temporal-spread.js) : chaque entité obtient un seuil légèrement
  // décalé, de façon DÉTERMINISTE (même id + mêmes bornes -> même décalage,
  // toujours) et STABLE (jamais stocké, recalculé à chaque évaluation).

  // Sans context.entity (comme les tests ci-dessus) : spread ignoré, seuil
  // pile sur from/to — même résultat qu'un appel sans spread du tout.
  run(
    "presence : timeRange spread ignoré sans context.entity (rétrocompat)",
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 6 * 60 }),
    evaluateCondition({ type: "timeRange", from: 6, to: 20, spread: 15 }, { time: 6 * 60 })
  );

  // Sans spread déclaré, MÊME avec une entité fournie : comportement
  // rigoureusement inchangé (seuil exact, aucun décalage).
  run(
    "presence : timeRange sans spread déclaré -> seuil exact (rétrocompat)",
    true,
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 6 * 60, entity: { id: "npc-x" } })
  );

  // Deux entités DIFFÉRENTES, même règle à spread -> décalages différents
  // (déterministe par id) : au moins l'une des deux ne bascule pas exactement
  // à la même minute que l'autre sur une fenêtre resserrée autour du seuil.
  function spreadOffsetMinutesFor(entityId, from, to, spread) {
    // Sonde indirecte : cherche, minute par minute autour de `from`, le
    // premier instant où la condition devient vraie pour CETTE entité —
    // reflète fidèlement ce qu'observerait un joueur (déclenchement réel),
    // plutôt que d'importer temporalThresholdOffset directement ici (ce
    // check vérifie le COMPORTEMENT de l'évaluateur, pas l'implémentation).
    for (let deltaMin = -spread - 1; deltaMin <= spread + 1; deltaMin++) {
      const timeAtCandidate = (from * 60 + deltaMin + MINUTES_PER_DAY_CHECK) % MINUTES_PER_DAY_CHECK;
      const active = evaluateCondition(
        { type: "timeRange", from, to, spread },
        { time: timeAtCandidate, entity: { id: entityId } }
      );
      if (active) return deltaMin;
    }
    return null;
  }
  const MINUTES_PER_DAY_CHECK = TIME_CONFIG.minutesPerHour * TIME_CONFIG.hoursPerDay;
  const npcADeparture = spreadOffsetMinutesFor("npc-bar-a", 6, 20, 5);
  const npcBDeparture = spreadOffsetMinutesFor("npc-bar-b", 6, 20, 5);
  const npcCDeparture = spreadOffsetMinutesFor("npc-bar-c", 6, 20, 5);
  run("presence : spread — décalage trouvé dans la fourchette déclarée (±5 min)", true, [npcADeparture, npcBDeparture, npcCDeparture].every((d) => d !== null && Math.abs(d) <= 5));
  run(
    "presence : spread — trois entités de la même règle NE partent PAS toutes à la même minute décalée",
    true,
    new Set([npcADeparture, npcBDeparture, npcCDeparture]).size >= 2
  );

  // Stabilité : rejouer la même sonde pour la même entité renvoie EXACTEMENT
  // le même décalage — reproduit un "rechargement" (aucun état à recharger,
  // le décalage est recalculé, pas relu).
  run(
    "presence : spread — décalage stable pour une même entité (rejoué deux fois)",
    npcADeparture,
    spreadOffsetMinutesFor("npc-bar-a", 6, 20, 5)
  );

  // Décalage indépendant par RÈGLE : la même entité, sur deux règles à bornes
  // différentes, n'obtient pas nécessairement le même décalage relatif.
  const npcADepartureOther = spreadOffsetMinutesFor("npc-bar-a", 12, 18, 5);
  run("presence : spread — bornes fournies (sanity check, valeur dans la fourchette)", true, npcADepartureOther !== null && Math.abs(npcADepartureOther) <= 5);

  // Wrap minuit : seuil déclaré tout près de minuit (from proche de 0),
  // spread suffisant pour pousser le décalage de l'autre côté de 0h — la
  // condition doit rester évaluable sans jamais planter ni se figer à faux
  // pour toute heure, prouvé en balayant les 24h.
  const midnightWrapActive = [];
  for (let h = 0; h < 24; h++) {
    midnightWrapActive.push(
      evaluateCondition({ type: "timeRange", from: 0.05, to: 6, spread: 10 }, { time: h * 60, entity: { id: "npc-midnight" } })
    );
  }
  run("presence : spread — passage minuit du décalage n'empêche jamais une plage active", true, midnightWrapActive.some(Boolean));
  // Contiguïté CIRCULAIRE (l'heure 23 touche l'heure 0) : exactement deux
  // transitions faux<->vrai sur le cercle des 24h -> UN SEUL bloc actif,
  // qu'il traverse minuit ou non — un simple "chaque heure = précédente+1"
  // se tromperait sur un bloc qui traverse minuit (ex. actif à 23h ET 0h,
  // mais 23 !== 0-1 en arithmétique linéaire).
  let midnightTransitions = 0;
  for (let h = 0; h < 24; h++) {
    if (midnightWrapActive[h] !== midnightWrapActive[(h + 1) % 24]) midnightTransitions++;
  }
  run("presence : spread — plage active reste UN SEUL bloc contigu malgré le passage minuit (pas de trou parasite)", 2, midnightTransitions);

  // spread <= 0 ou non fini -> aucun décalage (même filet que "absent").
  run(
    "presence : spread <= 0 -> comportement inchangé",
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 6 * 60, entity: { id: "npc-x" } }),
    evaluateCondition({ type: "timeRange", from: 6, to: 20, spread: 0 }, { time: 6 * 60, entity: { id: "npc-x" } })
  );

  // evaluateCondition/consumed (voir core/state.js/markConsumed, "Collectible
  // persistant" dans entities/model.md) : vrai SEULEMENT si l'entité porte
  // consumed:true — contrairement à timeRange/arrived, ne dépend pas de
  // context.time, seulement de context.entity (posé par resolveEntityRules,
  // voir plus bas).
  run(
    "presence : consumed — entité consumed:true -> vrai",
    true,
    evaluateCondition({ type: "consumed" }, { entity: { consumed: true } })
  );
  run(
    "presence : consumed — entité consumed:false -> faux",
    false,
    evaluateCondition({ type: "consumed" }, { entity: { consumed: false } })
  );
  run(
    "presence : consumed — entité sans champ consumed -> faux",
    false,
    evaluateCondition({ type: "consumed" }, { entity: {} })
  );

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

  // "Collectible persistant" (voir entities/model.md) : effet post-activation
  // "devient dormant" — une règle { when: { type: "consumed" }, present:
  // false } sur l'INSTANCE (voir level/demo2.json, "crate-warehouse").
  // ATTENTION (même "asymétrie documentée" que ci-dessus) : CETTE SEULE
  // règle ne suffit PAS à rester présente avant consommation — sans règle
  // couvrant explicitement ce cas, isPresent retombe sur dormante par
  // défaut. Il faut donc une SECONDE règle, "présente par défaut" (ici un
  // timeRange 0..24 — couvre TOUTE heure, jamais une vraie contrainte
  // temporelle, juste le catch-all "présente sinon" — même idiome que la
  // règle 8..24 de l'habitant, voir entities/model.md/"Exemple de
  // référence — l'habitant"), placée APRÈS pour ne jamais l'emporter sur
  // la règle "consumed" (priorité au premier rule actif, voir
  // resolveEntityRules). isPresent lit context.entity (ajouté par
  // resolveEntityRules lui-même) — jamais besoin de le passer ici.
  const dormantOnConsumed = {
    id: "crate-test",
    consumed: false,
    presence: [
      { when: { type: "consumed" }, present: false },
      { when: { type: "timeRange", from: 0, to: 24 }, present: true },
    ],
  };
  run("presence : caisse NON consumed — présente (catch-all)", true, isPresent(dormantOnConsumed, { time: 0 }));
  const consumedCrate = { ...dormantOnConsumed, consumed: true };
  run("presence : caisse consumed:true — dormante (priorité à la 1ère règle)", false, isPresent(consumedCrate, { time: 0 }));

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
  // AUCUN état partagé) — RÉEL, voir level/demo.json/"npc-resident" et
  // level/demo2.json/"npc-resident-home" (mêmes horaires EXACTS ici) :
  // away (demo1) présente 8h-20h (wander) + 20h-23h (goto vers "door-exit",
  // filet à 23h) ; home (demo2) présente 20h-8h (immobile, AUCUN
  // comportement de repos) + 8h-11h (goto vers "door-back", filet à 11h).
  // Avec CES horaires précis (fenêtres de transit PARTAGÉES, 20h-23h et
  // 8h-11h), "jamais présent aux deux" NE TIENT PLUS — voir
  // `entities/model.md`/"Chevauchement ASSUMÉ" : le test vérifie donc
  // l'invariant qui RESTE vrai ("jamais absent aux deux") et affirme
  // EXPLICITEMENT le chevauchement aux heures concernées, plutôt que de le
  // laisser accidentellement passer inaperçu.

  function demo1RoutineRules(doorId) {
    return [
      { when: { type: "arrived" }, effects: [{ type: "presence", present: false }] },
      { when: { type: "timeRange", from: 23, to: 8 }, effects: [{ type: "presence", present: false }] },
      {
        when: { type: "timeRange", from: 8, to: 20 },
        effects: [
          { type: "presence", present: true },
          { type: "behavior", behavior: { kind: "wander" } },
        ],
      },
      {
        when: { type: "timeRange", from: 20, to: 23 },
        effects: [
          { type: "presence", present: true },
          { type: "behavior", behavior: { kind: "goto", targetId: doorId } },
        ],
      },
    ];
  }

  function homeRoutineRules(doorId) {
    return [
      { when: { type: "arrived" }, effects: [{ type: "presence", present: false }] },
      { when: { type: "timeRange", from: 11, to: 20 }, effects: [{ type: "presence", present: false }] },
      {
        when: { type: "timeRange", from: 20, to: 8 },
        effects: [
          { type: "presence", present: true },
          { type: "behavior", behavior: null },
        ],
      },
      {
        when: { type: "timeRange", from: 8, to: 11 },
        effects: [
          { type: "presence", present: true },
          { type: "behavior", behavior: { kind: "goto", targetId: doorId } },
        ],
      },
    ];
  }

  // Instantanés RÉALISTES : behavior/gotoArrived hors "arrived" à chaque
  // checkpoint reflètent un état PLAUSIBLE à cette heure (comportement déjà
  // remis à jour par le cycle précédent), comme le faisait l'ancienne
  // version de ce test.
  const mirrorCheckpoints = [
    { hour: 12, awayBehavior: { kind: "wander" }, awayArrived: undefined, homeBehavior: null, homeArrived: true, awayExpected: true, homeExpected: false, label: "12h (jour : away erre, home dormante depuis 11h)" },
    { hour: 21, awayBehavior: { kind: "goto" }, awayArrived: undefined, homeBehavior: null, homeArrived: true, awayExpected: true, homeExpected: true, label: "21h — CHEVAUCHEMENT ASSUMÉ (away en chemin, home déjà réveillée)" },
    { hour: 23, awayBehavior: { kind: "goto" }, awayArrived: undefined, homeBehavior: null, homeArrived: true, awayExpected: false, homeExpected: true, label: "23h (filet away déclenché, MÊME sans arrivée réelle)" },
    { hour: 9, awayBehavior: { kind: "wander" }, awayArrived: true, homeBehavior: { kind: "goto" }, homeArrived: undefined, awayExpected: true, homeExpected: true, label: "9h — CHEVAUCHEMENT ASSUMÉ (away réveillée, home en chemin)" },
    { hour: 11, awayBehavior: { kind: "wander" }, awayArrived: true, homeBehavior: { kind: "goto" }, homeArrived: undefined, awayExpected: true, homeExpected: false, label: "11h (filet home déclenché, MÊME sans arrivée réelle)" },
  ];
  mirrorCheckpoints.forEach(({ hour, awayBehavior, awayArrived, homeBehavior, homeArrived, awayExpected, homeExpected, label }) => {
    const awayInstance = { id: "npc-resident", behavior: awayBehavior, gotoArrived: awayArrived, presence: demo1RoutineRules("door-exit") };
    const homeInstance = { id: "npc-resident-home", behavior: homeBehavior, gotoArrived: homeArrived, presence: homeRoutineRules("door-back") };
    const context = { time: hour * 60 };
    const awayPresent = isPresent(awayInstance, context);
    const homePresent = isPresent(homeInstance, context);
    run(`miroir demo1/demo2 : ${label} — away`, awayExpected, awayPresent);
    run(`miroir demo1/demo2 : ${label} — home`, homeExpected, homePresent);
    run(`miroir demo1/demo2 : ${label} — jamais absent aux deux à la fois`, true, awayPresent || homePresent);
  });

  // --- behavior: null — retrait EXPLICITE d'un comportement (voir
  // core/level.js/parseEffect, core/scripting.md/"Effets") : nécessaire pour
  // une entité SANS comportement de repos (ex. "npc-resident-home" ci-dessus)
  // — sans lui, entity.gotoArrived (jamais remis à faux) et behavior.kind
  // resté "goto" laisseraient "arrived" bloquée à vrai pour toujours après
  // la PREMIÈRE arrivée, l'entité ne redeviendrait plus jamais présente. ---

  let nullBehaviorEffectAccepted = false;
  let parsedNullBehavior;
  try {
    const nullEffectLevel = parseLevel(
      {
        id: "movement-check-null-behavior-valid",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "reset-ok",
            type: "dog",
            x: 5,
            presence: [{ when: { type: "timeRange", from: 0, to: 24 }, effects: [{ type: "behavior", behavior: null }] }],
          },
        ],
      },
      ROUTINE_REGISTRY
    );
    nullBehaviorEffectAccepted = true;
    parsedNullBehavior = nullEffectLevel.entities[0].presence[0].effects[0].behavior;
  } catch {
    nullBehaviorEffectAccepted = false;
  }
  run("behavior:null — accepté au chargement, aucune erreur", true, nullBehaviorEffectAccepted);
  run("behavior:null — transporté TEL QUEL dans l'entité parsée", null, parsedNullBehavior);

  // Application : resolveEntityRules distingue `undefined` (aucun effet ce
  // tick) de `null` (retrait explicite) — Object.is les sépare, contrairement
  // à un simple test de vérité.
  const nullResetEntity = {
    id: "reset-runtime",
    behavior: { kind: "goto", targetId: "x" },
    gotoArrived: true,
    presence: [{ when: { type: "timeRange", from: 0, to: 24 }, effects: [{ type: "presence", present: true }, { type: "behavior", behavior: null }] }],
  };
  const nullResetResolved = resolveEntityRules(nullResetEntity, { time: 0 });
  run("behavior:null — resolveEntityRules renvoie behaviorEffect === null (jamais confondu avec undefined)", null, nullResetResolved.behaviorEffect);

  // Cycle complet SANS comportement de repos, DEUX jours consécutifs — LE
  // test qui aurait échoué en permanence dès le second réveil sans
  // behavior:null (voir header ci-dessus). Mêmes horaires et gabarit que
  // "npc-resident-home" (level/demo2.json).
  function homeResident(state) {
    return getActiveWorld(state).entities.find((e) => e.id === "home-1");
  }
  const homeRoutineLevel = parseLevel(
    {
      id: "movement-check-home-routine",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "door-h", type: "dog", x: 2 },
        { id: "home-1", type: "dog", x: 15, presence: homeRoutineRules("door-h") },
      ],
    },
    ROUTINE_REGISTRY
  );

  // INITIAL_TIME = 8h : la fenêtre de transit (8h-11h) est donc DÉJÀ active
  // dès la création — comportement "goto" posé au tout premier calcul (voir
  // resolveEntityRules, "premier calcul compte comme une bascule"),
  // convergence vers la porte dès le premier tick, AUCUN comportement de
  // repos déclaré au départ (contrairement à resident-1 plus haut).
  let homeState = createInitialState(homeRoutineLevel, 7, NO_COMPANIONS);
  for (let i = 0; i < 1000; i++) homeState = reduce(homeState, tick(0));
  run("routine sans repos (jour 1) : arrivée à la porte -> gotoArrived posé", true, homeResident(homeState).gotoArrived);
  run("routine sans repos (jour 1) : arrivée -> dormante", false, homeResident(homeState).present);

  // 20h (même jour) : SANS behavior:null, cette bascule échouerait pour
  // toujours (behavior.kind resté "goto" + gotoArrived resté vrai depuis
  // l'arrivée du matin ferait gagner "arrived" indéfiniment). Décalage d'UN
  // TICK attendu (~16 ms, imperceptible), même artefact que le réveil de
  // "resident-1" plus haut : l'effet "behavior" s'applique DÈS ce tick
  // (indépendamment de la présence), mais la présence de CE MÊME tick est
  // encore calculée contre l'ancien `.behavior`.
  homeState = advanceTime(homeState, 12 * 60); // 8h -> 20h
  const homeEveningTick1 = reduce(homeState, tick(0));
  run(
    "routine sans repos : 20h, 1er tick — comportement déjà vidé (l'effet s'applique même dormante)",
    null,
    homeResident(homeEveningTick1).behavior
  );
  const homeEveningTick2 = reduce(homeEveningTick1, tick(0));
  run("routine sans repos : 20h, tick suivant — présente à nouveau, JAMAIS bloquée", true, homeResident(homeEveningTick2).present);

  // Jour 2 : le cycle se répète intégralement — nouvelle arrivée, nouvelle
  // dormance, nouveau réveil à 20h. C'est CE second cycle qui aurait échoué
  // silencieusement sans behavior:null (le premier cycle, lui, n'a jamais
  // besoin du retrait : gotoArrived n'est pas encore posé).
  let homeDay2 = advanceTime(homeEveningTick2, 12 * 60); // 20h -> 8h (jour 2)
  for (let i = 0; i < 1000; i++) homeDay2 = reduce(homeDay2, tick(0));
  run("routine sans repos (jour 2) : nouvelle arrivée -> gotoArrived toujours posé", true, homeResident(homeDay2).gotoArrived);
  run("routine sans repos (jour 2) : nouvelle arrivée -> dormante", false, homeResident(homeDay2).present);
  homeDay2 = advanceTime(homeDay2, 12 * 60); // 8h -> 20h (jour 2, soir)
  const homeDay2Tick2 = reduce(reduce(homeDay2, tick(0)), tick(0));
  run("routine sans repos (jour 2) : 20h — présente à nouveau, DEUXIÈME cycle réussi", true, homeResident(homeDay2Tick2).present);

  // Sérialisabilité : ruleActive (mémoire de bascule des effets "behavior")
  // survit à un aller-retour JSON, comme tout autre champ d'entité.
  const serializedResident = JSON.parse(JSON.stringify(resident(eveningRoutineState)));
  run(
    "routine : ruleActive survit à un aller-retour JSON",
    JSON.stringify(resident(eveningRoutineState).ruleActive),
    JSON.stringify(serializedResident.ruleActive)
  );

  // --- "Le bar" : trois PNJ, MÊME règle de départ "vers 6h" à spread,
  // partent de façon ÉCHELONNÉE (voir core/temporal-spread.js,
  // core/presence.js/evaluateTimeRange) — test D'INTÉGRATION (via
  // reduce()/resolveEntityRules(), pas l'évaluateur isolé comme plus haut)
  // qui prouve que le mécanisme fonctionne de bout en bout sur une scène
  // réelle à plusieurs entités partageant un contenu identique.

  const BAR_REGISTRY = { dog: { label: "entity.dog" } };

  // Même règle LITTÉRALEMENT partagée (même objet presence[]) par les trois
  // patrons — spread ±5 min autour de 6h, bascule wander -> goto (vers la
  // sortie) à l'entrée de la fenêtre.
  function barPatronPresence() {
    return [
      {
        when: { type: "timeRange", from: 6, to: 6.5, spread: 5 },
        effects: [{ type: "behavior", behavior: { kind: "goto", targetId: "door-bar-exit" } }],
      },
    ];
  }

  const barLevel = parseLevel(
    {
      id: "movement-check-bar",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "door-bar-exit", type: "dog", x: 18 },
        { id: "npc-bar-a", type: "dog", x: 5, behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 }, presence: barPatronPresence() },
        { id: "npc-bar-b", type: "dog", x: 6, behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 }, presence: barPatronPresence() },
        { id: "npc-bar-c", type: "dog", x: 7, behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 }, presence: barPatronPresence() },
      ],
    },
    BAR_REGISTRY
  );
  const BAR_PATRON_IDS = ["npc-bar-a", "npc-bar-b", "npc-bar-c"];

  function barPatron(state, id) {
    return getActiveWorld(state).entities.find((e) => e.id === id);
  }

  // Avance JUSQU'À une minute-du-jour donnée (toujours vers l'AVANT, jamais
  // en arrière — comme partout ailleurs dans ce fichier), sans dépendre de
  // l'heure de départ exacte d'une partie neuve (INITIAL_TIME).
  function advanceToMinuteOfDay(state, targetMinuteOfDay) {
    const minutesPerDay = TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour;
    const currentMinuteOfDay = hourOfDay(state.time) * TIME_CONFIG.minutesPerHour + minuteOfHour(state.time);
    const delta = ((targetMinuteOfDay - currentMinuteOfDay) % minutesPerDay + minutesPerDay) % minutesPerDay;
    return advanceTime(state, delta);
  }

  // Depuis 5h50 (avant toute fenêtre possible, spread <= 5 min), tique
  // minute par minute et note, pour chaque patron, la minute ÉCOULÉE où son
  // comportement bascule vers "goto" — 20 minutes suffisent à couvrir toute
  // la fourchette possible (5h55 à 6h05) avec marge.
  function runBarDepartures(seed) {
    let state = createInitialState(barLevel, seed, NO_COMPANIONS);
    state = advanceToMinuteOfDay(state, 5 * 60 + 50);
    const departureMinute = Object.fromEntries(BAR_PATRON_IDS.map((id) => [id, null]));
    for (let elapsed = 0; elapsed < 20; elapsed++) {
      state = advanceTime(state, 1);
      state = reduce(state, tick(0));
      for (const id of BAR_PATRON_IDS) {
        if (departureMinute[id] === null && barPatron(state, id).behavior.kind === "goto") {
          departureMinute[id] = elapsed;
        }
      }
    }
    return departureMinute;
  }

  const barRun1 = runBarDepartures(2024);
  run("bar : les trois patrons finissent tous par partir (fenêtre observée)", true, Object.values(barRun1).every((minute) => minute !== null));
  run(
    "bar : départs ÉCHELONNÉS — les trois patrons ne partent PAS tous à la même minute",
    true,
    new Set(Object.values(barRun1)).size >= 2
  );

  // Rejeu (même seed, même suite d'actions) -> mêmes minutes de départ pour
  // CHAQUE patron : le décalage ne dépend d'AUCUN état accumulé pendant la
  // simulation (il n'y en a pas à rejouer), seulement de l'id + des bornes
  // de la règle — donc STABLE, y compris à travers un rechargement/une
  // re-visite de scène (mêmes entrées -> même décalage recalculé, jamais
  // relu depuis un état stocké).
  const barRun2 = runBarDepartures(2024);
  run("bar : rejeu identique -> mêmes minutes de départ (stable, rien de nouveau sérialisé)", JSON.stringify(barRun1), JSON.stringify(barRun2));

  // Sans spread déclaré : rétrocompat stricte, les trois partiraient TOUS à
  // la même minute (comportement d'avant ce mécanisme).
  const barLevelNoSpread = parseLevel(
    {
      id: "movement-check-bar-no-spread",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "door-bar-exit", type: "dog", x: 18 },
        {
          id: "npc-bar-a",
          type: "dog",
          x: 5,
          behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 },
          presence: [{ when: { type: "timeRange", from: 6, to: 6.5 }, effects: [{ type: "behavior", behavior: { kind: "goto", targetId: "door-bar-exit" } }] }],
        },
        {
          id: "npc-bar-b",
          type: "dog",
          x: 6,
          behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 },
          presence: [{ when: { type: "timeRange", from: 6, to: 6.5 }, effects: [{ type: "behavior", behavior: { kind: "goto", targetId: "door-bar-exit" } }] }],
        },
      ],
    },
    BAR_REGISTRY
  );
  let noSpreadState = createInitialState(barLevelNoSpread, 2024, NO_COMPANIONS);
  noSpreadState = advanceToMinuteOfDay(noSpreadState, 5 * 60 + 59);
  noSpreadState = advanceTime(noSpreadState, 1);
  noSpreadState = reduce(noSpreadState, tick(0));
  run(
    "bar : sans spread déclaré — tous les patrons partent PILE à la même minute (rétrocompat)",
    "goto",
    barPatron(noSpreadState, "npc-bar-a").behavior.kind
  );
  run(
    "bar : sans spread déclaré — les deux patrons basculent ENSEMBLE",
    barPatron(noSpreadState, "npc-bar-a").behavior.kind,
    barPatron(noSpreadState, "npc-bar-b").behavior.kind
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

  // defaultSurface : FILET silencieux si absent — toute scène existante qui
  // n'en déclare pas continue de charger, résolue au défaut du registre.
  const noSurfaceLevel = parseLevel(
    { id: "movement-check-surfaces-default", titleKey: "level.demo.title", length: 10, playerStart: 0, entities: [] },
    EMPTY_REGISTRY
  );
  run("surfaces : defaultSurface absent -> repli sur DEFAULT_SURFACE", DEFAULT_SURFACE, noSurfaceLevel.defaultSurface);
  run("surfaces : segments absent -> tableau vide (jamais undefined)", 0, noSurfaceLevel.segments.length);

  // indoor (core/level.js/parseFace, "nature de lieu") : même filet que
  // defaultSurface — absent -> false (extérieur), TOUJOURS résolu en
  // booléen sur une face parsée, jamais undefined.
  run("indoor : absent -> false (extérieur) par défaut", false, noSurfaceLevel.indoor);
  const indoorLevel = parseLevel(
    { id: "movement-check-indoor-true", titleKey: "level.demo.title", length: 10, playerStart: 0, indoor: true, entities: [] },
    EMPTY_REGISTRY
  );
  run("indoor : true déclaré -> transporté tel quel", true, indoorLevel.indoor);
  const outdoorLevel = parseLevel(
    { id: "movement-check-indoor-false", titleKey: "level.demo.title", length: 10, playerStart: 0, indoor: false, entities: [] },
    EMPTY_REGISTRY
  );
  run("indoor : false déclaré explicitement -> transporté tel quel", false, outdoorLevel.indoor);
  let invalidIndoorThrew = false;
  try {
    parseLevel(
      { id: "movement-check-indoor-bad", titleKey: "level.demo.title", length: 10, playerStart: 0, indoor: "yes", entities: [] },
      EMPTY_REGISTRY
    );
  } catch {
    invalidIndoorThrew = true;
  }
  run("indoor : type invalide (non booléen) -> échec clair au chargement", true, invalidIndoorThrew);

  // indoor est un champ de FACE (voir core/level.js/FACE_FIELDS) : une scène
  // à deux faces le déclare INDÉPENDAMMENT par face — ex. une ruelle
  // extérieure (recto) menant à une arrière-boutique intérieure (verso).
  const indoorTwoFacedLevel = parseLevel(
    {
      id: "movement-check-indoor-two-faced",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      recto: { entities: [] },
      verso: { entities: [], indoor: true },
    },
    EMPTY_REGISTRY
  );
  run("indoor : scène à deux faces — recto sans déclaration -> false", false, indoorTwoFacedLevel.recto.indoor);
  run("indoor : scène à deux faces — verso déclaré true -> transporté sur SA face uniquement", true, indoorTwoFacedLevel.verso.indoor);

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
  auditSession = addMoney(auditSession, 12); // argent NON nul dans l'audit — voir plus bas, doit survivre au même titre que le reste
  auditSession = addItem(auditSession, "apple", 3); // sac NON vide dans l'audit — même raison
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
  // Argent : présent et NOMBRE (jamais undefined) dans la partie AVANT tout
  // aller-retour — confirme session.money comme n'importe quel autre champ
  // du cercle partie (voir core/state.js).
  run("sérialisation : session.money est un nombre (jamais undefined)", true, typeof auditSession.money === "number");
  // Sac : présent et TABLEAU (jamais undefined), même précédent que money.
  run("sérialisation : session.bag est un tableau (jamais undefined)", true, Array.isArray(auditSession.bag));
  // Équipement : présent et OBJET (jamais undefined), même précédent — déjà
  // NON vide par défaut (baskets de départ, voir core/state.js), aucun
  // ajout explicite nécessaire ici contrairement à money.
  run(
    "sérialisation : session.equipment est un objet (jamais undefined)",
    true,
    typeof auditSession.equipment === "object" && auditSession.equipment !== null
  );

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
  if (!auditRoundTripThrew) {
    run("sérialisation : money survit à l'aller-retour JSON", auditSession.money, auditRoundTripped.money);
    run("sérialisation : bag survit à l'aller-retour JSON", JSON.stringify(auditSession.bag), JSON.stringify(auditRoundTripped.bag));
    run(
      "sérialisation : equipment survit à l'aller-retour JSON",
      JSON.stringify(auditSession.equipment),
      JSON.stringify(auditRoundTripped.equipment)
    );
  }

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

  // --- Argent (core/money.js) : scalaire de partie + effet pickup ---

  const MONEY_REGISTRY = { dog: { label: "entity.dog" } };
  const moneyLevel = parseLevel(
    {
      id: "movement-check-money",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      entities: [
        { id: "coin-1", type: "dog", x: 5, interactable: true, action: { kind: "pickup", amount: 7 } },
        { id: "other-1", type: "dog", x: 6 },
      ],
    },
    MONEY_REGISTRY
  );
  const moneyState = createInitialState(moneyLevel, undefined, NO_COMPANIONS);

  run("argent : une partie neuve démarre à 0", 0, moneyState.money);

  const afterAdd = addMoney(moneyState, 7);
  run("argent : addMoney incrémente du montant donné", 7, afterAdd.money);
  run("argent : addMoney cumule (pas un remplacement)", 10, addMoney(afterAdd, 3).money);
  run("argent : addMoney ne mute jamais l'original", 0, moneyState.money);

  run("argent : removeEntity retire l'entité ciblée", false, getActiveWorld(removeEntity(moneyState, "coin-1")).entities.some((e) => e.id === "coin-1"));
  run(
    "argent : removeEntity laisse les autres entités intactes",
    true,
    getActiveWorld(removeEntity(moneyState, "coin-1")).entities.some((e) => e.id === "other-1")
  );
  run("argent : removeEntity — id absent -> référence INCHANGÉE (no-op sûr)", moneyState, removeEntity(moneyState, "does-not-exist"));

  const afterPickup = pickupEntity(moneyState, "coin-1", 7);
  run("argent : pickupEntity ajoute le montant", 7, afterPickup.money);
  run("argent : pickupEntity retire l'entité ramassée", false, getActiveWorld(afterPickup).entities.some((e) => e.id === "coin-1"));
  run("argent : pickupEntity laisse les autres entités intactes", true, getActiveWorld(afterPickup).entities.some((e) => e.id === "other-1"));

  // Double appel (id déjà retiré, ex. tentative périmée) : effet ATOMIQUE,
  // jamais un second gain sans entité à retirer — voir le commentaire du
  // module.
  run("argent : pickupEntity sur une entité déjà retirée -> aucun second gain", 7, pickupEntity(afterPickup, "coin-1", 7).money);
  run("argent : pickupEntity sur une entité déjà retirée -> référence INCHANGÉE", afterPickup, pickupEntity(afterPickup, "coin-1", 7));

  // --- Sac d'objets (core/bag.js/addItem + pickupItemEntity, core/items.js/ITEM_REGISTRY) ---
  // Deuxième tiers de l'inventaire, même statut que l'argent ci-dessus.

  run("sac : ITEM_REGISTRY.apple est empilable", true, itemProps("apple").stackable);
  run("sac : ITEM_REGISTRY.key_bronze n'est PAS empilable", false, itemProps("key_bronze").stackable);
  run("sac : itemProps sur un type inconnu -> undefined", undefined, itemProps("does-not-exist"));

  // Sac VIDÉ explicitement pour ces tests de MÉCANISME (addItem/removeItem/
  // pickupItemEntity/dropItem en isolation) : une partie neuve démarre
  // en réalité avec des rangers dans le sac (voir "Équipement" plus bas,
  // core/state.js/createInitialState) — hors-sujet ici, ces tests
  // vérifient le MÉCANISME du sac, pas le contenu de départ d'une partie.
  const bagState = { ...createInitialState(moneyLevel, undefined, NO_COMPANIONS), bag: [] };
  run("sac : sac VIDÉ pour ces tests de mécanisme (contenu de départ testé plus bas)", 0, bagState.bag.length);

  // Empilable : le PREMIER ajout crée l'entrée, les SUIVANTS incrémentent
  // quantity — jamais une seconde entrée pour le même type.
  const afterOneApple = addItem(bagState, "apple", 1);
  run("sac : addItem (empilable) — une entrée créée", 1, afterOneApple.bag.length);
  run("sac : addItem (empilable) — quantity posée à count", 1, afterOneApple.bag[0].quantity);
  const afterTwoApples = addItem(afterOneApple, "apple", 1);
  run("sac : addItem (empilable) — EMPILE, toujours une seule entrée", 1, afterTwoApples.bag.length);
  run("sac : addItem (empilable) — quantity incrémentée (2)", 2, afterTwoApples.bag[0].quantity);
  const afterFiveMoreApples = addItem(bagState, "apple", 5);
  run("sac : addItem(count=5) en un seul appel — quantity posée directement à 5", 5, afterFiveMoreApples.bag[0].quantity);

  // Non empilable : CHAQUE ajout crée une entrée DISTINCTE, jamais de
  // quantity (toujours 1 par construction, voir le header du module).
  const afterOneKey = addItem(bagState, "key_bronze", 1);
  const afterTwoKeys = addItem(afterOneKey, "key_bronze", 1);
  run("sac : addItem (non empilable) — DEUX entrées distinctes, jamais fusionnées", 2, afterTwoKeys.bag.length);
  run("sac : addItem (non empilable) — aucune entrée ne porte de quantity", true, afterTwoKeys.bag.every((e) => e.quantity === undefined));
  const afterThreeKeysAtOnce = addItem(bagState, "key_bronze", 3);
  run("sac : addItem(count=3) sur non empilable — 3 entrées distinctes en un appel", 3, afterThreeKeysAtOnce.bag.length);

  // Type INCONNU du registre : dégrade en non empilable (jamais un crash —
  // voir le commentaire de addItem).
  const afterUnknownType = addItem(bagState, "does-not-exist", 2);
  run("sac : addItem sur un type inconnu — dégrade en non empilable (2 entrées), jamais un crash", 2, afterUnknownType.bag.length);

  run("sac : addItem NE MUTE JAMAIS l'original", 0, bagState.bag.length);

  // pickupItemEntity : effet atomique (objet + retrait), même patron que
  // pickupEntity (argent) ci-dessus.
  const ITEM_TEST_REGISTRY = { item: { label: "entity.item" } };
  const itemLevel = parseLevel(
    {
      id: "movement-check-item",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      entities: [
        { id: "apple-1", type: "item", x: 5, interactable: true, action: { kind: "pickup", item: "apple", count: 1 } },
        { id: "other-1", type: "item", x: 6, interactable: true, action: { kind: "pickup", item: "key_bronze", count: 1 } },
      ],
    },
    ITEM_TEST_REGISTRY
  );
  // Sac VIDÉ ici aussi — même raison que bagState plus haut (une partie
  // neuve démarre en réalité avec des rangers dedans, hors-sujet pour ce
  // test de mécanisme).
  const itemState = { ...createInitialState(itemLevel, undefined, NO_COMPANIONS), bag: [] };

  const afterApplePickup = pickupItemEntity(itemState, "apple-1", "apple", 1);
  run("sac : pickupItemEntity ajoute l'objet au sac", 1, afterApplePickup.bag.length);
  run("sac : pickupItemEntity — quantity 1 pour une pomme", 1, afterApplePickup.bag[0].quantity);
  run(
    "sac : pickupItemEntity retire l'entité ramassée",
    false,
    getActiveWorld(afterApplePickup).entities.some((e) => e.id === "apple-1")
  );
  run(
    "sac : pickupItemEntity laisse les autres entités intactes",
    true,
    getActiveWorld(afterApplePickup).entities.some((e) => e.id === "other-1")
  );

  // Double appel (id déjà retiré, ex. tentative périmée) : effet ATOMIQUE,
  // jamais un second gain sans entité à retirer — même garantie que
  // pickupEntity.
  run(
    "sac : pickupItemEntity sur une entité déjà retirée -> aucun second ajout",
    1,
    pickupItemEntity(afterApplePickup, "apple-1", "apple", 1).bag[0].quantity
  );
  run(
    "sac : pickupItemEntity sur une entité déjà retirée -> référence INCHANGÉE",
    afterApplePickup,
    pickupItemEntity(afterApplePickup, "apple-1", "apple", 1)
  );

  // removeItem : inverse d'addItem — voir le commentaire du module pour la
  // sémantique exacte (décrémente/retire pour un empilable, retire une
  // entrée exacte pour un non empilable).
  const afterRemoveOneApple = removeItem(afterTwoApples, "apple", 1);
  run("sac : removeItem (empilable) — décrémente sans retirer l'entrée", 1, afterRemoveOneApple.bag.length);
  run("sac : removeItem (empilable) — quantity décrémentée (2 -> 1)", 1, afterRemoveOneApple.bag[0].quantity);
  const afterRemoveAllApples = removeItem(afterTwoApples, "apple", 2);
  run("sac : removeItem (empilable) — count == quantity -> entrée retirée entièrement", 0, afterRemoveAllApples.bag.length);
  // count > quantity disponible : CLAMPÉ, jamais un stock négatif.
  const afterRemoveTooManyApples = removeItem(afterTwoApples, "apple", 99);
  run("sac : removeItem (empilable) — count > disponible, clampé (entrée retirée, jamais négatif)", 0, afterRemoveTooManyApples.bag.length);

  const afterRemoveOneKey = removeItem(afterTwoKeys, "key_bronze", 1);
  run("sac : removeItem (non empilable) — retire UNE entrée exacte", 1, afterRemoveOneKey.bag.length);

  run("sac : removeItem sur un type absent du sac -> référence INCHANGÉE", bagState, removeItem(bagState, "apple", 1));
  run("sac : removeItem NE MUTE JAMAIS l'original", 2, afterTwoApples.bag[0].quantity);

  // dropItem : effet "Poser" — removeItem + spawnEphemeral, ATOMIQUEMENT
  // (voir view/menus/inventory-menu.js/setDropItemHandler). Un objet posé
  // en pile (count > 1) donne UNE SEULE entité éphémère portant toute la
  // quantité, jamais N éparpillées — voir core/bag.js/dropItem.
  const DROP_SPEC = {
    type: "item",
    labelKey: "item.apple",
    descriptionKey: "item.apple.description",
    blocksMovement: false,
    observable: true,
    interactable: true,
    action: { kind: "pickup", item: "apple", count: 1 },
  };
  const afterDrop = dropItem(afterApplePickup, "apple", 1, DROP_SPEC, 3);
  run("sac : dropItem retire l'objet du sac", 0, afterDrop.bag.length);
  const droppedEntity = getActiveWorld(afterDrop).entities.find((e) => e.ephemeral);
  run("sac : dropItem fait apparaître UNE entité éphémère", true, Boolean(droppedEntity));
  run("sac : dropItem pose l'entité à la position x demandée", 3, droppedEntity && droppedEntity.x);
  run("sac : dropItem reporte l'action pickup (count) telle quelle", 1, droppedEntity && droppedEntity.action.count);
  run("sac : dropItem NE MUTE JAMAIS l'original", 1, afterApplePickup.bag[0].quantity);

  // --- Équipement (core/equipment.js) — troisième tiers de l'inventaire ---
  // Slots nommés, gait DÉRIVÉ (jamais stocké), equipItem/unequipItem.

  run("équipement : EQUIPMENT_SLOTS ne couvre que 'feet' aujourd'hui", JSON.stringify(["feet"]), JSON.stringify(EQUIPMENT_SLOTS));
  run("équipement : createEmptyEquipment — slot feet à null", null, createEmptyEquipment().feet);

  // gaitOf : dérivation pure, jamais stockée sur le joueur (entities/player.js).
  run("gaitOf : slot vide -> barefoot", "barefoot", gaitOf({ feet: null }));
  run("gaitOf : baskets équipées -> shoes", "shoes", gaitOf({ feet: { type: "sneakers" } }));
  run("gaitOf : bottes en cuir équipées -> boots", "boots", gaitOf({ feet: { type: "leather_boots" } }));
  run("gaitOf : rangers équipées -> boots (même pool que les bottes en cuir)", "boots", gaitOf({ feet: { type: "combat_boots" } }));
  run("gaitOf : type retiré du registre entre-temps -> repli barefoot", "barefoot", gaitOf({ feet: { type: "does-not-exist" } }));

  const equipmentLevel = parseLevel(RAW_LEVEL, EMPTY_REGISTRY);
  const freshEquipState = createInitialState(equipmentLevel, undefined, NO_COMPANIONS);
  run("équipement : une partie neuve démarre avec des baskets ÉQUIPÉES", "sneakers", freshEquipState.equipment.feet.type);
  run("équipement : une partie neuve démarre avec rangers ET escarpins DANS LE SAC (pas équipés)", 2, freshEquipState.bag.length);
  run("équipement : les rangers de départ ne sont pas équipés", "combat_boots", freshEquipState.bag[0].type);
  run("équipement : les escarpins de départ ne sont pas équipés", "high_heels", freshEquipState.bag[1].type);
  run("équipement : gait de départ d'une partie neuve -> shoes", "shoes", gaitOf(freshEquipState.equipment));

  // equipItem : ÉCHANGE — équiper des bottes (sac) alors que des baskets
  // sont déjà au slot -> les bottes prennent le slot, les baskets
  // retournent au sac. Jamais dans les deux à la fois (voir plus bas).
  const withBootsInBag = addItem(freshEquipState, "leather_boots", 1);
  const afterEquipBoots = equipItem(withBootsInBag, "leather_boots");
  run("equipItem : le slot feet porte maintenant les bottes", "leather_boots", afterEquipBoots.equipment.feet.type);
  run(
    "equipItem : les bottes ne sont PLUS dans le sac (retirées)",
    false,
    afterEquipBoots.bag.some((entry) => entry.type === "leather_boots")
  );
  run(
    "equipItem : l'ancien occupant (baskets) est REVENU dans le sac (échange)",
    true,
    afterEquipBoots.bag.some((entry) => entry.type === "sneakers")
  );
  run("equipItem : gait suit l'équipement -> boots", "boots", gaitOf(afterEquipBoots.equipment));
  run("equipItem : NE MUTE JAMAIS l'original", "sneakers", withBootsInBag.equipment.feet.type);

  // equipItem : cas dégradés, RÉFÉRENCE INCHANGÉE, jamais une exception.
  const withApple = addItem(withBootsInBag, "apple", 1);
  run("equipItem : type NON equippable (apple, dans le sac) -> référence inchangée", withApple, equipItem(withApple, "apple"));
  run("equipItem : type absent du sac -> référence inchangée", freshEquipState, equipItem(freshEquipState, "leather_boots"));
  run("equipItem : type inconnu du registre -> référence inchangée", withBootsInBag, equipItem(withBootsInBag, "does-not-exist"));

  // unequipItem : inverse d'equipItem — retire du slot, remet au sac.
  const afterUnequip = unequipItem(afterEquipBoots, "feet");
  run("unequipItem : le slot feet est vidé", null, afterUnequip.equipment.feet);
  run(
    "unequipItem : les bottes sont revenues dans le sac",
    true,
    afterUnequip.bag.some((entry) => entry.type === "leather_boots")
  );
  run("unequipItem : gait retombe à barefoot, slot vide", "barefoot", gaitOf(afterUnequip.equipment));
  run("unequipItem : slot déjà vide -> référence inchangée", afterUnequip, unequipItem(afterUnequip, "feet"));
  run("unequipItem : NE MUTE JAMAIS l'original", "leather_boots", afterEquipBoots.equipment.feet.type);

  // Invariant : un objet donné n'est JAMAIS à la fois dans le sac ET équipé.
  run(
    "équipement : invariant — un objet équipé n'est jamais AUSSI dans le sac",
    false,
    afterEquipBoots.bag.some((entry) => entry.type === afterEquipBoots.equipment.feet.type)
  );

  // --- Tags d'objets (core/tags.js, core/items.js/ITEM_REGISTRY.tags,
  // core/equipment.js/equippedTags, condition "hasEquipmentTag") ---

  run("tags : registre — military a la bonne clé i18n", "tag.military", tagProps("military").labelKey);
  run("tags : registre — clé inconnue -> undefined", undefined, tagProps("does-not-exist"));
  run("tags : registre — tagProps délègue à TAG_REGISTRY", TAG_REGISTRY.military, tagProps("military"));
  run("tags : ITEM_REGISTRY — les rangers portent le tag military", true, ITEM_REGISTRY.combat_boots.tags.includes("military"));
  run("tags : ITEM_REGISTRY — les escarpins portent le tag chic", true, ITEM_REGISTRY.high_heels.tags.includes("chic"));
  run("tags : ITEM_REGISTRY — les escarpins imposent le gait high_heels", "high_heels", ITEM_REGISTRY.high_heels.gait);
  run("gaitOf : escarpins équipés -> high_heels", "high_heels", gaitOf({ feet: { type: "high_heels" } }));

  // validateItemTags : même filet que la validation des surfaces contre
  // SURFACE_REGISTRY — un tag inconnu échoue clairement, jamais un mismatch
  // silencieux. ITEM_REGISTRY lui-même a déjà passé ce filet au chargement
  // de core/items.js (sinon ce fichier n'aurait jamais fini de s'importer) ;
  // testé ICI contre un registre de test pour prouver l'échec SANS corrompre
  // le vrai registre.
  let unknownItemTagThrew = false;
  try {
    validateItemTags({ fake_item: { stackable: false, tags: ["does-not-exist"] } });
  } catch {
    unknownItemTagThrew = true;
  }
  run("tags : validateItemTags — tag inconnu sur un objet -> échec clair", true, unknownItemTagThrew);
  run(
    "tags : validateItemTags — tags valides ou absents -> aucune erreur",
    true,
    (() => {
      try {
        validateItemTags({ a: { stackable: false, tags: ["military"] }, b: { stackable: false } });
        return true;
      } catch {
        return false;
      }
    })()
  );

  // equippedTags : UNIFIÉ — même fonction pour le joueur (session.equipment)
  // qu'un compagnon/PNJ hypothétique (n'importe quel objet de même forme),
  // aucun cas spécial par type de porteur.
  run("tags : equippedTags — slot vide -> aucun tag", 0, equippedTags({ feet: null }).size);
  run("tags : equippedTags — objet sans tags (baskets) -> aucun tag", 0, equippedTags({ feet: { type: "sneakers" } }).size);
  run("tags : equippedTags — objet tagué (rangers) -> tag présent", true, equippedTags({ feet: { type: "combat_boots" } }).has("military"));
  run("tags : equippedTags — escarpins équipés -> tag chic présent", true, equippedTags({ feet: { type: "high_heels" } }).has("chic"));
  const fakeNpcEquipment = { feet: { type: "combat_boots" } };
  run(
    "tags : equippedTags — même résultat pour un porteur quelconque (compagnon/PNJ simulé)",
    true,
    equippedTags(fakeNpcEquipment).has("military")
  );

  // Dérivé, jamais stocké : équiper/déséquiper fait apparaître/disparaître
  // le tag IMMÉDIATEMENT, sans code de synchro (même vérification que
  // gaitOf plus haut). freshEquipState.bag[0] est déjà les rangers de départ
  // (voir le test "rangers DANS LE SAC" plus haut).
  const afterEquipRangers = equipItem(freshEquipState, "combat_boots");
  run("tags : equippedTags — absent avant d'équiper les rangers", false, equippedTags(freshEquipState.equipment).has("military"));
  run("tags : equippedTags — présent dès l'équipement des rangers", true, equippedTags(afterEquipRangers.equipment).has("military"));
  const afterUnequipRangers = unequipItem(afterEquipRangers, "feet");
  run("tags : equippedTags — de nouveau absent après déséquipement", false, equippedTags(afterUnequipRangers.equipment).has("military"));

  // Même vérification pour les escarpins (tag "chic") — freshEquipState.bag[1]
  // est déjà les escarpins de départ (voir test "escarpins de départ" plus
  // haut).
  const afterEquipHeels = equipItem(freshEquipState, "high_heels");
  run("tags : equippedTags — absent avant d'équiper les escarpins", false, equippedTags(freshEquipState.equipment).has("chic"));
  run("tags : equippedTags — présent dès l'équipement des escarpins", true, equippedTags(afterEquipHeels.equipment).has("chic"));
  const afterUnequipHeels = unequipItem(afterEquipHeels, "feet");
  run("tags : equippedTags — de nouveau absent après déséquipement des escarpins", false, equippedTags(afterUnequipHeels.equipment).has("chic"));

  // Condition "hasEquipmentTag" — branchée dans l'aiguillage existant
  // (evaluateCondition), lit context.playerEquipment via equippedTags —
  // PAS context.entity (voir core/presence.js/evaluateHasEquipmentTag,
  // "CLÉ DE CONTEXTE DÉDIÉE, PAS context.entity" : context.entity désigne
  // désormais TOUJOURS l'entité qui PORTE la condition, jamais le joueur,
  // depuis l'introduction de la condition "variable" — voir plus bas).
  run(
    "tags : hasEquipmentTag — joueur équipé du tag -> vraie",
    true,
    evaluateCondition({ type: "hasEquipmentTag", tag: "military" }, { playerEquipment: { feet: { type: "combat_boots" } } })
  );
  run(
    "tags : hasEquipmentTag — joueur équipé d'un autre objet (sans le tag) -> fausse",
    false,
    evaluateCondition({ type: "hasEquipmentTag", tag: "military" }, { playerEquipment: { feet: { type: "sneakers" } } })
  );
  run(
    "tags : hasEquipmentTag — playerEquipment absent -> fausse (jamais une exception)",
    false,
    evaluateCondition({ type: "hasEquipmentTag", tag: "military" }, {})
  );
  run(
    "tags : hasEquipmentTag — context.entity présent mais playerEquipment absent -> fausse (les deux clés sont INDÉPENDANTES)",
    false,
    evaluateCondition({ type: "hasEquipmentTag", tag: "military" }, { entity: { equipment: { feet: { type: "combat_boots" } } } })
  );
  run(
    "tags : hasEquipmentTag — tag chic (escarpins équipés) -> vraie",
    true,
    evaluateCondition({ type: "hasEquipmentTag", tag: "chic" }, { playerEquipment: { feet: { type: "high_heels" } } })
  );

  // Validation au chargement (core/level.js/parsePresenceRule) : un tag de
  // condition inconnu échoue clairement, même principe que la surface d'un
  // segment (voir plus bas, "surfaces").
  const TAG_TRIGGER_REGISTRY = { dog: { label: "entity.dog" } };
  let validTagConditionAccepted = false;
  try {
    parseLevel(
      {
        id: "movement-check-tags-valid",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "tag-rule-ok",
            type: "dog",
            x: 5,
            presence: [{ when: { type: "hasEquipmentTag", tag: "military" }, present: true }],
          },
        ],
      },
      TAG_TRIGGER_REGISTRY
    );
    validTagConditionAccepted = true;
  } catch {
    validTagConditionAccepted = false;
  }
  run("tags : hasEquipmentTag avec un tag valide -> chargé sans erreur", true, validTagConditionAccepted);

  let unknownTagConditionThrew = false;
  try {
    parseLevel(
      {
        id: "movement-check-tags-invalid",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "tag-rule-bad",
            type: "dog",
            x: 5,
            presence: [{ when: { type: "hasEquipmentTag", tag: "does-not-exist" }, present: true }],
          },
        ],
      },
      TAG_TRIGGER_REGISTRY
    );
  } catch {
    unknownTagConditionThrew = true;
  }
  run("tags : hasEquipmentTag avec un tag inconnu -> échec clair au chargement", true, unknownTagConditionThrew);

  // --- Actions CONDITIONNELLES (core/level.js, action.condition/
  // refusalKey ; voir view/interaction.js) — GÉNÉRIQUE à TOUT kind, testé
  // ICI en FORME/VALIDATION seulement (au chargement) ; le blocage +
  // l'annonce de refus à l'interaction sont côté vue, hors de portée d'un
  // test terminal — voir "Vérifie (oreille)" pour ce volet.

  const ACTION_CONDITION_REGISTRY = { dog: { label: "entity.dog" } };

  let validActionConditionAccepted = false;
  let parsedActionConditionEntity = null;
  try {
    const conditionalActionLevel = parseLevel(
      {
        id: "movement-check-action-condition-valid",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "conditional-action-ok",
            type: "dog",
            x: 5,
            action: { kind: "transit", condition: { type: "hasEquipmentTag", tag: "chic" }, refusalKey: "door.dresscode_refused" },
          },
        ],
      },
      ACTION_CONDITION_REGISTRY
    );
    validActionConditionAccepted = true;
    parsedActionConditionEntity = conditionalActionLevel.entities[0];
  } catch {
    validActionConditionAccepted = false;
  }
  run("actions conditionnelles : condition + refusalKey valides -> chargé sans erreur", true, validActionConditionAccepted);
  run(
    "actions conditionnelles : condition/refusalKey transportées telles quelles sur l'entité",
    "door.dresscode_refused",
    parsedActionConditionEntity && parsedActionConditionEntity.action.refusalKey
  );

  let unknownActionConditionTagThrew = false;
  try {
    parseLevel(
      {
        id: "movement-check-action-condition-bad-tag",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "conditional-action-bad-tag",
            type: "dog",
            x: 5,
            action: { kind: "transit", condition: { type: "hasEquipmentTag", tag: "does-not-exist" }, refusalKey: "door.dresscode_refused" },
          },
        ],
      },
      ACTION_CONDITION_REGISTRY
    );
  } catch {
    unknownActionConditionTagThrew = true;
  }
  run("actions conditionnelles : tag inconnu dans action.condition -> échec clair", true, unknownActionConditionTagThrew);

  // Une condition SANS refusalKey laisserait l'action échouer en silence à
  // l'interaction (voir header de parseEntity/action) : refusée dès le
  // chargement, même sévérité qu'un tag inconnu.
  let missingRefusalKeyThrew = false;
  try {
    parseLevel(
      {
        id: "movement-check-action-condition-no-refusal",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 0,
        entities: [
          { id: "conditional-action-no-refusal", type: "dog", x: 5, action: { kind: "transit", condition: { type: "hasEquipmentTag", tag: "chic" } } },
        ],
      },
      ACTION_CONDITION_REGISTRY
    );
  } catch {
    missingRefusalKeyThrew = true;
  }
  run("actions conditionnelles : condition sans refusalKey -> échec clair", true, missingRefusalKeyThrew);

  // Rétrocompat : une action SANS condition (tout contenu existant) reste
  // inchangée, jamais bloquée implicitement par cette nouvelle validation.
  const unconditionalActionLevel = parseLevel(
    {
      id: "movement-check-action-no-condition",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      entities: [{ id: "plain-action", type: "dog", x: 5, action: { kind: "transit" } }],
    },
    ACTION_CONDITION_REGISTRY
  );
  run(
    "actions conditionnelles : action SANS condition -> inchangée (rétrocompat)",
    undefined,
    unconditionalActionLevel.entities[0].action.condition
  );

  // --- Perception surnaturelle (core/state.js/togglePerception,
  // core/presence.js/"perceptionActive") : état + condition, CORE pur.
  // La bascule sonore (crossfade musique/ambiance, filtre d'étouffement des
  // entités mondaines) reste ENTIÈREMENT côté vue (view/audio/city-scene.js,
  // view/city-screen.js) — hors de portée d'un check terminal.

  run("perception : createInitialState — perceptionActive false par défaut", false, createInitialState(level, undefined, NO_COMPANIONS).perceptionActive);

  const perceptionSession = createInitialState(level, undefined, NO_COMPANIONS);
  const perceptionToggled = togglePerception(perceptionSession);
  run("perception : togglePerception active (false -> true)", true, perceptionToggled.perceptionActive);
  run("perception : togglePerception NE MUTE JAMAIS l'original", false, perceptionSession.perceptionActive);
  run("perception : togglePerception re-bascule (true -> false)", false, togglePerception(perceptionToggled).perceptionActive);

  // evaluateCondition/perceptionActive : lit UNIQUEMENT context.perceptionActive
  // (ni context.entity ni context.playerEquipment) — même repli défensif que
  // le reste (contexte sans le champ -> fausse, jamais un throw).
  run("perception : evaluateCondition — perceptionActive true -> vraie", true, evaluateCondition({ type: "perceptionActive" }, { perceptionActive: true }));
  run("perception : evaluateCondition — perceptionActive false -> fausse", false, evaluateCondition({ type: "perceptionActive" }, { perceptionActive: false }));
  run("perception : evaluateCondition — champ absent du contexte -> fausse", false, evaluateCondition({ type: "perceptionActive" }, {}));

  // Intégration : une entité surnaturelle (presence conditionnée par
  // perceptionActive, voir entities/types/ghost.js) est DORMANTE tant que
  // la perception est inactive (jamais tickée, jamais présente), PRÉSENTE
  // dès la bascule — via LE MÊME presenceContext que time (voir
  // core/reduce.js/TICK), aucun mécanisme séparé.
  const SPIRIT_REGISTRY = {
    dog: { label: "entity.dog" },
    spirit: { label: "entity.ghost", presence: [{ when: { type: "perceptionActive" }, present: true }] },
  };
  const spiritLevel = parseLevel(
    {
      id: "movement-check-perception",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      entities: [{ id: "spirit-1", type: "spirit", x: 10, behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 } }],
    },
    SPIRIT_REGISTRY
  );
  function spirit(state) {
    return getActiveWorld(state).entities.find((e) => e.id === "spirit-1");
  }

  let perceptionOffState = createInitialState(spiritLevel, 5, NO_COMPANIONS);
  for (let i = 0; i < 30; i++) perceptionOffState = reduce(perceptionOffState, tick(0));
  run("perception : entité surnaturelle — dormante tant que la perception est inactive", false, spirit(perceptionOffState).present);
  run(
    "perception : entité surnaturelle dormante — jamais tickée (position inchangée, x=10)",
    10,
    spirit(perceptionOffState).x
  );

  let perceptionOnState = { ...perceptionOffState, perceptionActive: true };
  perceptionOnState = reduce(perceptionOnState, tick(0));
  run("perception : entité surnaturelle — présente dès la bascule (même tick)", true, spirit(perceptionOnState).present);
  for (let i = 0; i < 30; i++) perceptionOnState = reduce(perceptionOnState, tick(0));
  run("perception : entité surnaturelle PRÉSENTE — tickée normalement (errance active)", true, spirit(perceptionOnState).x !== 10);

  // Désactivation : l'entité REGÈLE là où elle était (état conservé),
  // jamais réinitialisée — même politique que le néon (voir plus haut,
  // "présence conditionnelle").
  const spiritXWhilePresent = spirit(perceptionOnState).x;
  let perceptionOffAgainState = { ...perceptionOnState, perceptionActive: false };
  perceptionOffAgainState = reduce(perceptionOffAgainState, tick(0));
  run("perception : redevient dormante à la désactivation", false, spirit(perceptionOffAgainState).present);
  for (let i = 0; i < 30; i++) perceptionOffAgainState = reduce(perceptionOffAgainState, tick(0));
  run(
    "perception : redevenue dormante — position gelée là où elle était (jamais réinitialisée)",
    spiritXWhilePresent,
    spirit(perceptionOffAgainState).x
  );

  // Save/load : perceptionActive survit à un aller-retour complet.
  const perceptionSaveEnvelope = serializeGame(perceptionOnState);
  const perceptionSaveResult = deserializeGame(perceptionSaveEnvelope);
  run("perception : sauvegarde — round-trip réussi", true, perceptionSaveResult.success);
  if (perceptionSaveResult.success) {
    run("perception : sauvegarde — perceptionActive (true) survit au round-trip", true, perceptionSaveResult.session.perceptionActive);
  }

  // Sauvegarde ANTÉRIEURE à ce mécanisme : jamais eu de clé
  // `perceptionActive` — sans rebouchage (core/save.js/migrateSave), une
  // partie ainsi rechargée porterait `undefined` au lieu d'un booléen.
  const { perceptionActive: _droppedPerception, ...auditSessionWithoutPerception } = auditSession;
  const oldPerceptionSave = { version: SAVE_VERSION, data: auditSessionWithoutPerception };
  const oldPerceptionSaveResult = deserializeGame(oldPerceptionSave);
  run("perception : sauvegarde antérieure acceptée (perceptionActive rebouché)", true, oldPerceptionSaveResult.success);
  if (oldPerceptionSaveResult.success) {
    run("perception : partie rebouchée — perceptionActive par défaut false", false, oldPerceptionSaveResult.session.perceptionActive);
  }

  // --- Moteur météo (core/weather.js, config/weather-values.js) : machine
  // à états GLOBALE pilotée par le temps de jeu, PRNG seedé ->
  // déterministe. AUCUN effet à ce stade (voir CLAUDE.md/prompt d'origine
  // "MOTEUR MÉTÉO") : seul le moteur (état + transitions) est vérifié ici.

  function expectWeatherValidationThrows(states) {
    let threw = false;
    try {
      validateWeatherStates(states);
    } catch {
      threw = true;
    }
    return threw;
  }
  run("weather : table vide rejetée", true, expectWeatherValidationThrows({}));
  run(
    "weather : état sans transition de poids positif rejeté (état sans issue)",
    true,
    expectWeatherValidationThrows({ sunny: { duration: { min: 10, max: 20 }, transitions: { sunny: 0 } } })
  );
  run(
    "weather : transition vers une cible inconnue rejetée",
    true,
    expectWeatherValidationThrows({ sunny: { duration: { min: 10, max: 20 }, transitions: { doesNotExist: 1 } } })
  );
  run(
    "weather : poids négatif rejeté",
    true,
    expectWeatherValidationThrows({ sunny: { duration: { min: 10, max: 20 }, transitions: { sunny: -1 } } })
  );
  run(
    "weather : duration incohérente (min > max) rejetée",
    true,
    expectWeatherValidationThrows({ sunny: { duration: { min: 20, max: 10 }, transitions: { sunny: 1 } } })
  );
  run(
    "weather : durée non entière rejetée",
    true,
    expectWeatherValidationThrows({ sunny: { duration: { min: 1.5, max: 10 }, transitions: { sunny: 1 } } })
  );
  run(
    "weather : état inatteignable depuis DEFAULT_WEATHER_STATE rejeté",
    true,
    expectWeatherValidationThrows({
      [DEFAULT_WEATHER_STATE]: { duration: { min: 10, max: 20 }, transitions: { [DEFAULT_WEATHER_STATE]: 1 } },
      orphanState: { duration: { min: 10, max: 20 }, transitions: { orphanState: 1 } },
    })
  );
  run(
    "weather : table valide (deux états, tous atteignables) acceptée",
    false,
    expectWeatherValidationThrows({
      [DEFAULT_WEATHER_STATE]: { duration: { min: 10, max: 20 }, transitions: { [DEFAULT_WEATHER_STATE]: 1, other: 1 } },
      other: { duration: { min: 5, max: 15 }, transitions: { [DEFAULT_WEATHER_STATE]: 1 } },
    })
  );
  run("weather : la VRAIE table (config/weather-values.js) est valide", false, expectWeatherValidationThrows(WEATHER_STATES));

  // Tirage pondéré (pickTransition) — ÉQUITÉ : sur un grand nombre de
  // tirages avec des poids CONNUS (40/40/10/10, indépendants de la vraie
  // table), les fréquences observées doivent rester dans une tolérance
  // large mais significative des proportions attendues (40%/40%/10%/10%
  // sur 4000 tirages, marge ±7 points — assez pour absorber le bruit
  // statistique sans jamais valider un tirage biaisé).
  const FAIRNESS_TRANSITIONS = { a: 40, b: 40, c: 10, d: 10 };
  const fairnessTally = { a: 0, b: 0, c: 0, d: 0 };
  let fairnessRngState = createSeed("weather-fairness-check");
  const FAIRNESS_SAMPLES = 4000;
  for (let i = 0; i < FAIRNESS_SAMPLES; i++) {
    const picked = pickTransition(FAIRNESS_TRANSITIONS, fairnessRngState);
    fairnessTally[picked.target] += 1;
    fairnessRngState = picked.rngState;
  }
  function withinTolerance(observedCount, expectedWeight) {
    const observedPct = (observedCount / FAIRNESS_SAMPLES) * 100;
    return Math.abs(observedPct - expectedWeight) <= 7;
  }
  run(
    "weather : tirage pondéré — fréquences observées proches des poids déclarés (40/40/10/10 ± 7 points)",
    true,
    withinTolerance(fairnessTally.a, 40) &&
      withinTolerance(fairnessTally.b, 40) &&
      withinTolerance(fairnessTally.c, 10) &&
      withinTolerance(fairnessTally.d, 10)
  );
  run(
    "weather : tirage pondéré — poids nul JAMAIS tiré (filet, indépendamment de la tolérance ci-dessus)",
    0,
    (() => {
      let s = createSeed("weather-zero-weight-check");
      let zeroPicked = 0;
      for (let i = 0; i < 500; i++) {
        const picked = pickTransition({ never: 0, always: 1 }, s);
        s = picked.rngState;
        if (picked.target === "never") zeroPicked += 1;
      }
      return zeroPicked;
    })()
  );

  // État initial d'une partie (createInitialState -> createInitialWeather).
  const weatherLevel = parseLevel(RAW_LEVEL, EMPTY_REGISTRY);
  const freshWeatherState = createInitialState(weatherLevel, 1, NO_COMPANIONS);
  run("weather : état initial = DEFAULT_WEATHER_STATE", DEFAULT_WEATHER_STATE, freshWeatherState.weather.state);
  run(
    "weather : première transition programmée DANS la fourchette de durée de l'état par défaut",
    true,
    freshWeatherState.weather.nextTransitionAt - INITIAL_TIME >= WEATHER_STATES[DEFAULT_WEATHER_STATE].duration.min &&
      freshWeatherState.weather.nextTransitionAt - INITIAL_TIME <= WEATHER_STATES[DEFAULT_WEATHER_STATE].duration.max
  );

  // Gel : sans avancée de temps, advanceWeather ne fait RIEN — même
  // référence renvoyée (comme le reste du core, voir "action inconnue
  // renvoie la même référence" plus haut). C'est CE mécanisme, appelé
  // uniquement depuis view/city-screen.js/onFrame (jamais si un menu est
  // au sommet de la pile), qui donne le gel en pause — rien de spécial à
  // tester côté pause elle-même, purement une conséquence de ce test.
  const frozen = advanceWeather(freshWeatherState);
  run("weather : sans avancée de temps -> référence INCHANGÉE (gel)", freshWeatherState, frozen);

  // Transition simple : franchir le rendez-vous programmé déclenche UNE
  // transition, le nouveau rendez-vous est dans le futur.
  const justPastThreshold = {
    ...freshWeatherState,
    time: freshWeatherState.weather.nextTransitionAt + 1,
  };
  const afterOneTransition = advanceWeather(justPastThreshold);
  run("weather : franchir le rendez-vous déclenche une transition (nouvel objet)", true, afterOneTransition.weather !== freshWeatherState.weather);
  run(
    "weather : après transition, le nouveau rendez-vous est dans le futur",
    true,
    afterOneTransition.weather.nextTransitionAt > afterOneTransition.time
  );

  // Grand saut vs accumulation pas à pas : DOIVENT produire EXACTEMENT le
  // même résultat (même seed, même temps total écoulé) — preuve à la fois
  // du déterminisme ET que le grand saut franchit correctement PLUSIEURS
  // transitions d'affilée (si la boucle n'en traitait qu'UNE à la fois, le
  // grand saut resterait bloqué sur un rendez-vous largement dépassé, très
  // différent du résultat pas à pas).
  const BIG_JUMP_MINUTES = 3000; // largement de quoi franchir plusieurs transitions
  let bigJumpState = createInitialState(weatherLevel, 42, NO_COMPANIONS);
  bigJumpState = advanceWeather({ ...bigJumpState, time: bigJumpState.time + BIG_JUMP_MINUTES });

  let smallStepsState = createInitialState(weatherLevel, 42, NO_COMPANIONS);
  for (let i = 0; i < BIG_JUMP_MINUTES; i++) {
    smallStepsState = advanceWeather({ ...smallStepsState, time: smallStepsState.time + 1 });
  }
  run(
    "weather : un grand saut de temps == une accumulation pas à pas (multi-transitions franchies, déterminisme)",
    JSON.stringify(smallStepsState.weather),
    JSON.stringify(bigJumpState.weather)
  );

  // Déterminisme direct : même seed + même déroulé -> même succession
  // météo, rejouée deux fois indépendamment.
  function weatherSequence(seed, totalMinutes) {
    let s = createInitialState(weatherLevel, seed, NO_COMPANIONS);
    const sequence = [];
    for (let i = 0; i < totalMinutes; i++) {
      const before = s.weather.state;
      s = advanceWeather({ ...s, time: s.time + 1 });
      if (s.weather.state !== before) sequence.push(s.weather.state);
    }
    return sequence;
  }
  const weatherSeq1 = weatherSequence(7, 2000);
  const weatherSeq2 = weatherSequence(7, 2000);
  run("weather : même seed + même déroulé -> même succession météo (déterminisme)", JSON.stringify(weatherSeq1), JSON.stringify(weatherSeq2));
  run("weather : la météo change réellement au fil du temps (au moins une transition observée)", true, weatherSeq1.length > 0);

  // Save/load : session.weather (état + rendez-vous + rngState) survit à
  // un aller-retour complet.
  const weatherSaveEnvelope = serializeGame(afterOneTransition);
  const weatherSaveResult = deserializeGame(weatherSaveEnvelope);
  run("weather : sauvegarde — round-trip réussi", true, weatherSaveResult.success);
  if (weatherSaveResult.success) {
    run(
      "weather : sauvegarde — weather identique après round-trip",
      JSON.stringify(afterOneTransition.weather),
      JSON.stringify(weatherSaveResult.session.weather)
    );
  }

  // Sauvegarde ANTÉRIEURE à ce mécanisme : jamais eu de clé `weather` —
  // sans rebouchage (core/save.js/migrateSave), une partie ainsi rechargée
  // porterait `undefined`. Reboutchée depuis la minute de jeu COURANTE de
  // CETTE sauvegarde (auditSession.time), jamais depuis zéro.
  const { weather: _droppedWeather, ...auditSessionWithoutWeather } = auditSession;
  const oldWeatherSave = { version: SAVE_VERSION, data: auditSessionWithoutWeather };
  const oldWeatherSaveResult = deserializeGame(oldWeatherSave);
  run("weather : sauvegarde antérieure acceptée (weather rebouché)", true, oldWeatherSaveResult.success);
  if (oldWeatherSaveResult.success) {
    run("weather : partie rebouchée — état par défaut", DEFAULT_WEATHER_STATE, oldWeatherSaveResult.session.weather.state);
    run(
      "weather : partie rebouchée — rendez-vous programmé depuis la minute de jeu COURANTE (jamais depuis zéro)",
      true,
      oldWeatherSaveResult.session.weather.nextTransitionAt > auditSession.time
    );
  }

  // Forçage debug (core/weather.js/setWeather, triggerNextWeatherTransition
  // — voir view/menus/debug-weather-menu.js, Shift+W) : entrée PROPRE dans
  // un état choisi à la main, sans passer par un tirage de CIBLE, mais avec
  // une durée TIRÉE (PRNG toujours sain après coup, voir header du module).
  const forcedBase = createInitialState(weatherLevel, "force-check", NO_COMPANIONS);
  const forcedRain = setWeather(forcedBase, "rain");
  run("setWeather : entre bien dans l'état demandé", "rain", forcedRain.weather.state);
  run(
    "setWeather : nouvelle durée dans la fourchette DÉCLARÉE de l'état forcé",
    true,
    forcedRain.weather.nextTransitionAt - forcedBase.time >= WEATHER_STATES.rain.duration.min &&
      forcedRain.weather.nextTransitionAt - forcedBase.time <= WEATHER_STATES.rain.duration.max
  );
  run(
    "setWeather : rngState avance (PRNG non figé après un forçage)",
    true,
    JSON.stringify(forcedRain.weather.rngState) !== JSON.stringify(forcedBase.weather.rngState)
  );
  // Entrée propre : le rendez-vous forcé n'est jamais déjà expiré au
  // moment même du forçage -> advanceWeather juste après reste un no-op
  // (même référence, comme le gel testé plus haut).
  run("setWeather : entrée propre, rendez-vous jamais déjà expiré (advanceWeather juste après = no-op)", forcedRain, advanceWeather(forcedRain));
  // Le moteur reprend son cours normal APRÈS un forçage : dépasser le
  // nouveau rendez-vous transite selon les règles NORMALES de l'état forcé
  // (rain), vers une cible qui lui appartient réellement.
  const afterForcedRun = advanceWeather({ ...forcedRain, time: forcedRain.weather.nextTransitionAt + 1 });
  run(
    "setWeather : après forçage, la transition suivante reste une cible VALIDE de l'état forcé (moteur sain)",
    true,
    WEATHER_STATES.rain.transitions[afterForcedRun.weather.state] > 0
  );

  // triggerNextWeatherTransition : force le moteur à transiter MAINTENANT
  // selon les poids NORMAUX de l'état courant (pas un état choisi à la
  // main, contrairement à setWeather) — chaque cible tirée doit toujours
  // appartenir aux transitions de poids positif de l'état QUITTÉ, sur une
  // longue chaîne d'appels enchaînés (chacun repart de l'état/rngState
  // produit par le précédent), et produire une variété de résultats
  // (preuve qu'il ne renvoie jamais bêtement la même cible).
  let triggerState = createInitialState(weatherLevel, "trigger-check", NO_COMPANIONS);
  const triggerTargetsSeen = new Set();
  let allTriggerTargetsValid = true;
  const TRIGGER_SAMPLES = 300;
  for (let i = 0; i < TRIGGER_SAMPLES; i++) {
    const before = triggerState.weather.state;
    triggerState = triggerNextWeatherTransition(triggerState);
    triggerTargetsSeen.add(triggerState.weather.state);
    if (!(WEATHER_STATES[before].transitions[triggerState.weather.state] > 0)) allTriggerTargetsValid = false;
  }
  run(`triggerNextWeatherTransition : chaque cible (${TRIGGER_SAMPLES} tirages enchaînés) appartient aux transitions de l'état quitté`, true, allTriggerTargetsValid);
  run("triggerNextWeatherTransition : produit une variété de cibles (pas toujours la même)", true, triggerTargetsSeen.size > 1);

  // --- Condition "weather" (core/presence.js/evaluateWeather, effet des
  // EFFETS météo — prompt 2/2) : réutilise l'évaluateur de conditions
  // existant, un cas de plus à côté de timeRange/perceptionActive.
  run("weather (condition) : evaluateCondition — état courant == état demandé -> vraie", true, evaluateCondition({ type: "weather", state: "fog" }, { weather: "fog" }));
  run("weather (condition) : evaluateCondition — état courant != état demandé -> fausse", false, evaluateCondition({ type: "weather", state: "fog" }, { weather: "sunny" }));
  run("weather (condition) : evaluateCondition — champ absent du contexte -> fausse", false, evaluateCondition({ type: "weather", state: "fog" }, {}));
  run(
    "weather (condition) : evaluateCondition — ni state déclaré ni weather au contexte -> fausse (jamais undefined==undefined)",
    false,
    evaluateCondition({ type: "weather" }, {})
  );

  // Validation au chargement (core/level.js/validateCondition) : un état
  // référencé par la condition doit exister dans la VRAIE table météo —
  // même politique que hasEquipmentTag.tag contre TAG_REGISTRY.
  function expectLevelParseThrows(rawLevel, registry) {
    let threw = false;
    try {
      parseLevel(rawLevel, registry);
    } catch {
      threw = true;
    }
    return threw;
  }
  const WEATHER_COND_REGISTRY = {
    wolf: { label: "entity.cumulo_lupus", presence: [{ when: { type: "weather", state: "fog" }, present: true }] },
  };
  const weatherCondLevelRaw = () => ({
    id: "movement-check-weather-condition",
    titleKey: "level.demo.title",
    length: 20,
    playerStart: 0,
    entities: [{ id: "wolf-1", type: "wolf", x: 10, behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 } }],
  });
  run(
    "weather (condition) : état inexistant dans la table météo -> erreur claire au chargement",
    true,
    expectLevelParseThrows(
      {
        id: "movement-check-weather-condition-bad",
        titleKey: "level.demo.title",
        length: 20,
        playerStart: 0,
        entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when: { type: "weather", state: "doesNotExist" }, present: true }] }],
      },
      { wolf: { label: "entity.cumulo_lupus" } }
    )
  );
  run("weather (condition) : état valide -> chargement accepté", false, expectLevelParseThrows(weatherCondLevelRaw(), WEATHER_COND_REGISTRY));

  // Intégration : une entité (même patron que entities/types/cumulo-lupus.js)
  // dont la présence est conditionnée par weather=="fog" est DORMANTE tant
  // que la météo n'est pas la brume, PRÉSENTE dès que session.weather.state
  // devient "fog" — via LE MÊME presenceContext que time/perceptionActive
  // (core/reduce.js/TICK), forcée par core/weather.js/setWeather (comme le
  // menu debug le ferait), aucun mécanisme séparé.
  const weatherCondLevel = parseLevel(weatherCondLevelRaw(), WEATHER_COND_REGISTRY);
  function wolf(state) {
    return getActiveWorld(state).entities.find((e) => e.id === "wolf-1");
  }
  let notFoggyState = createInitialState(weatherCondLevel, "weather-cond-check", NO_COMPANIONS);
  notFoggyState = setWeather(notFoggyState, "sunny");
  notFoggyState = reduce(notFoggyState, tick(0));
  run("weather (condition) : entité conditionnée — dormante hors de l'état déclaré", false, wolf(notFoggyState).present);

  let foggyState = setWeather(notFoggyState, "fog");
  foggyState = reduce(foggyState, tick(0));
  run("weather (condition) : entité conditionnée — présente dès que l'état météo correspond", true, wolf(foggyState).present);

  let notFoggyAgainState = setWeather(foggyState, "cloudy");
  notFoggyAgainState = reduce(notFoggyAgainState, tick(0));
  run("weather (condition) : redevient dormante quand la météo change à nouveau", false, wolf(notFoggyAgainState).present);

  // --- Condition "allOf" (core/presence.js/evaluateAllOf) : composite, ET
  // logique entre plusieurs conditions — délègue à evaluateCondition pour
  // chaque sous-condition, jamais un second mécanisme.
  run(
    "allOf : les deux sous-conditions vraies -> vraie",
    true,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, { perceptionActive: true, weather: "fog" })
  );
  run(
    "allOf : une seule sous-condition vraie (perception) -> fausse",
    false,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, { perceptionActive: true, weather: "sunny" })
  );
  run(
    "allOf : une seule sous-condition vraie (météo) -> fausse",
    false,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, { perceptionActive: false, weather: "fog" })
  );
  run(
    "allOf : aucune sous-condition vraie -> fausse",
    false,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, { perceptionActive: false, weather: "sunny" })
  );
  // Cas limite : "conditions" à un SEUL élément — redondant (revient à la
  // sous-condition seule) mais légal, voir core/level.js/validateCondition
  // (rejette seulement un tableau VIDE, pas un tableau à un élément).
  run(
    "allOf : une seule sous-condition, vraie -> vraie",
    true,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }] }, { perceptionActive: true })
  );
  run(
    "allOf : une seule sous-condition, fausse -> fausse",
    false,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }] }, { perceptionActive: false })
  );
  run(
    "allOf : imbriqué (allOf dans allOf) — toutes vraies -> vraie",
    true,
    evaluateCondition(
      { type: "allOf", conditions: [{ type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, { type: "consumed" }] },
      { perceptionActive: true, weather: "fog", entity: { consumed: true } }
    )
  );

  // Validation au chargement (core/level.js/validateCondition) :
  // "conditions" doit être un tableau NON VIDE, chaque élément revalidé
  // RÉCURSIVEMENT — une sous-condition mal formée échoue exactement comme
  // au premier niveau.
  run(
    "allOf : conditions vide -> erreur claire au chargement",
    true,
    expectLevelParseThrows(
      { id: "movement-check-allof-empty", titleKey: "level.demo.title", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when: { type: "allOf", conditions: [] }, present: true }] }] },
      { wolf: { label: "entity.cumulo_lupus" } }
    )
  );
  run(
    "allOf : conditions absent (pas un tableau) -> erreur claire au chargement",
    true,
    expectLevelParseThrows(
      { id: "movement-check-allof-missing", titleKey: "level.demo.title", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when: { type: "allOf" }, present: true }] }] },
      { wolf: { label: "entity.cumulo_lupus" } }
    )
  );
  run(
    "allOf : conditions à un seul élément -> légal au chargement (pas d'erreur)",
    false,
    expectLevelParseThrows(
      { id: "movement-check-allof-single", titleKey: "level.demo.title", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when: { type: "allOf", conditions: [{ type: "perceptionActive" }] }, present: true }] }] },
      { wolf: { label: "entity.cumulo_lupus" } }
    )
  );
  run(
    "allOf : sous-condition mal formée (état météo inconnu) -> erreur claire au chargement, RÉCURSIVE",
    true,
    expectLevelParseThrows(
      {
        id: "movement-check-allof-bad-sub",
        titleKey: "level.demo.title",
        length: 20,
        playerStart: 0,
        entities: [
          {
            id: "wolf-1",
            type: "wolf",
            x: 10,
            presence: [{ when: { type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "doesNotExist" }] }, present: true }],
          },
        ],
      },
      { wolf: { label: "entity.cumulo_lupus" } }
    )
  );

  // Intégration : même patron que cumulo-lupus (entities/types/
  // cumulo-lupus.js) — présent SEULEMENT perception ACTIVE ET météo
  // BRUMEUSE, les QUATRE combinaisons vérifiées via reduce(), aucun
  // mécanisme séparé du reste de la présence conditionnelle.
  const ALLOF_REGISTRY = {
    wolf: {
      label: "entity.cumulo_lupus",
      presence: [{ when: { type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, present: true }],
    },
  };
  const allOfLevel = parseLevel(
    { id: "movement-check-allof-integration", titleKey: "level.demo.title", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, behavior: { kind: "wander", walkMin: 1000, walkMax: 1000 } }] },
    ALLOF_REGISTRY
  );
  function allOfWolf(state) {
    return getActiveWorld(state).entities.find((e) => e.id === "wolf-1");
  }
  let neitherState = createInitialState(allOfLevel, "allof-cond-check", NO_COMPANIONS);
  neitherState = setWeather(neitherState, "sunny");
  neitherState = reduce(neitherState, tick(0));
  run("allOf (intégration) : ni perception ni brume -> dormante", false, allOfWolf(neitherState).present);

  let perceptionOnlyState = togglePerception(neitherState);
  perceptionOnlyState = reduce(perceptionOnlyState, tick(0));
  run("allOf (intégration) : perception SEULE (pas de brume) -> dormante", false, allOfWolf(perceptionOnlyState).present);

  let fogOnlyState = setWeather(neitherState, "fog");
  fogOnlyState = reduce(fogOnlyState, tick(0));
  run("allOf (intégration) : brume SEULE (perception inactive) -> dormante", false, allOfWolf(fogOnlyState).present);

  let bothState = togglePerception(fogOnlyState);
  bothState = reduce(bothState, tick(0));
  run("allOf (intégration) : perception ACTIVE ET brume -> présente", true, allOfWolf(bothState).present);

  let bothThenOffState = togglePerception(bothState);
  bothThenOffState = reduce(bothThenOffState, tick(0));
  run("allOf (intégration) : perception redevient inactive -> redevient dormante", false, allOfWolf(bothThenOffState).present);

  // --- Collectible persistant (core/state.js/markConsumed, core/money.js/lootEntity) ---
  // Contrairement à removeEntity/pickupEntity ci-dessus, l'entité looté
  // N'EST JAMAIS retirée — voir entities/model.md/"Collectible persistant".

  const CRATE_REGISTRY = { dog: { label: "entity.dog" } };
  const crateLevel = parseLevel(
    {
      id: "movement-check-crate",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      entities: [
        { id: "crate-1", type: "dog", x: 5, interactable: true, action: { kind: "loot", amount: 100 } },
        { id: "other-1", type: "dog", x: 6 },
      ],
    },
    CRATE_REGISTRY
  );
  const crateState = createInitialState(crateLevel, undefined, NO_COMPANIONS);

  run("caisse : markConsumed pose consumed:true sur l'entité ciblée", true, getActiveWorld(markConsumed(crateState, "crate-1")).entities.find((e) => e.id === "crate-1").consumed);
  run(
    "caisse : markConsumed laisse les autres entités intactes (pas de consumed)",
    undefined,
    getActiveWorld(markConsumed(crateState, "crate-1")).entities.find((e) => e.id === "other-1").consumed
  );
  run(
    "caisse : markConsumed NE RETIRE JAMAIS l'entité (contrairement à removeEntity)",
    true,
    getActiveWorld(markConsumed(crateState, "crate-1")).entities.some((e) => e.id === "crate-1")
  );
  run("caisse : markConsumed — id absent -> référence INCHANGÉE (no-op sûr)", crateState, markConsumed(crateState, "does-not-exist"));

  const afterLoot = lootEntity(crateState, "crate-1", 100);
  run("caisse : lootEntity ajoute le montant", 100, afterLoot.money);
  run("caisse : lootEntity pose consumed:true", true, getActiveWorld(afterLoot).entities.find((e) => e.id === "crate-1").consumed);
  run("caisse : lootEntity NE RETIRE JAMAIS l'entité", true, getActiveWorld(afterLoot).entities.some((e) => e.id === "crate-1"));

  // IDEMPOTENCE : réactiver une caisse déjà consumed ne redonne RIEN — le
  // piège explicitement visé par ce système (voir entities/model.md).
  run("caisse : lootEntity sur une entité déjà consumed -> aucun second gain", 100, lootEntity(afterLoot, "crate-1", 100).money);
  run("caisse : lootEntity sur une entité déjà consumed -> référence INCHANGÉE", afterLoot, lootEntity(afterLoot, "crate-1", 100));

  // consumedDescriptionKey (core/level.js/parseEntity) : même cascade
  // instance -> type que descriptionKey.
  const CONSUMED_DESC_REGISTRY = {
    dog: { label: "entity.dog", descriptionKey: "entity.dog.description", consumedDescriptionKey: "entity.dog.consumed_description" },
  };
  const consumedDescLevel = parseLevel(
    {
      id: "movement-check-consumed-desc",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      entities: [
        { id: "type-default", type: "dog", x: 1 },
        { id: "instance-override", type: "dog", x: 2, consumedDescriptionKey: "custom.consumed_description" },
      ],
    },
    CONSUMED_DESC_REGISTRY
  );
  run(
    "caisse : consumedDescriptionKey — retombe sur le défaut du type",
    "entity.dog.consumed_description",
    consumedDescLevel.entities.find((e) => e.id === "type-default").consumedDescriptionKey
  );
  run(
    "caisse : consumedDescriptionKey — surcharge d'instance prioritaire",
    "custom.consumed_description",
    consumedDescLevel.entities.find((e) => e.id === "instance-override").consumedDescriptionKey
  );

  // Sérialisabilité : consumed (true, pas juste sa valeur par défaut absente)
  // survit à un aller-retour JSON, comme n'importe quel autre champ d'entité
  // (money, ruleActive...) — voir l'audit générique plus bas pour le
  // mécanisme complet.
  const roundTrippedLoot = JSON.parse(JSON.stringify(afterLoot));
  run(
    "caisse : consumed survit à un aller-retour JSON",
    true,
    getActiveWorld(roundTrippedLoot).entities.find((e) => e.id === "crate-1").consumed
  );

  // --- Entités éphémères (core/state.js/spawnEphemeral + purge, core/save.js) ---
  // Voir entities/model.md/"Entités éphémères". Contrairement au collectible
  // persistant ci-dessus, une entité éphémère ne survit JAMAIS — ni à une
  // sauvegarde, ni à une sortie de scène.

  const EPHEMERAL_REGISTRY = { dog: { label: "entity.dog" }, door: { label: "entity.door" } };
  const ephemeralWorldA = parseLevel(
    {
      id: "movement-check-ephemeral-a",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      entities: [
        { id: "declared-1", type: "dog", x: 3 },
        { id: "door-to-b", type: "door", x: 9, target: "movement-check-ephemeral-b" },
      ],
    },
    EPHEMERAL_REGISTRY
  );
  const ephemeralWorldB = parseLevel(
    { id: "movement-check-ephemeral-b", titleKey: "level.demo.title", length: 10, playerStart: 0, entities: [] },
    EPHEMERAL_REGISTRY
  );
  // spec : descripteur DÉJÀ RÉSOLU, comme le construirait la vue (voir
  // view/city-screen.js/EPHEMERAL_COIN_SPEC) — spawnEphemeral ne l'interprète
  // jamais, il ne fait qu'y ajouter id/x/ephemeral.
  const EPHEMERAL_SPEC = { type: "dog", labelKey: "entity.dog", interactable: true, action: { kind: "pickup", amount: 5 } };

  const ephemeralState = createInitialState(ephemeralWorldA, undefined, NO_COMPANIONS);
  run("éphémère : monde neuf démarre à nextEphemeralId 0", 0, getActiveWorld(ephemeralState).nextEphemeralId);

  const afterSpawn1 = spawnEphemeral(ephemeralState, EPHEMERAL_SPEC, 4);
  const spawned1 = getActiveWorld(afterSpawn1).entities.find((e) => e.id === "ephemeral-0");
  run("éphémère : spawnEphemeral ajoute une entité marquée ephemeral:true", true, Boolean(spawned1 && spawned1.ephemeral));
  run("éphémère : spawnEphemeral pose x tel que demandé", 4, spawned1 && spawned1.x);
  run("éphémère : spawnEphemeral reporte les champs de spec tels quels", "entity.dog", spawned1 && spawned1.labelKey);
  run("éphémère : spawnEphemeral NE MUTE JAMAIS l'original", false, getActiveWorld(ephemeralState).entities.some((e) => e.ephemeral));
  run(
    "éphémère : une entité déclarée n'est jamais affectée par un spawn",
    true,
    getActiveWorld(afterSpawn1).entities.some((e) => e.id === "declared-1")
  );

  const afterSpawn2 = spawnEphemeral(afterSpawn1, EPHEMERAL_SPEC, 5);
  run(
    "éphémère : deux spawns successifs -> ids distincts (compteur incrémental)",
    true,
    getActiveWorld(afterSpawn2).entities.some((e) => e.id === "ephemeral-0") &&
      getActiveWorld(afterSpawn2).entities.some((e) => e.id === "ephemeral-1")
  );

  // Ramassage : réutilise pickupEntity TEL QUEL (voir la section "Argent"
  // plus haut) — aucun traitement spécial à une entité éphémère.
  const afterEphemeralPickup = pickupEntity(afterSpawn2, "ephemeral-0", 5);
  run("éphémère : ramassée via pickupEntity — argent ajouté", 5, afterEphemeralPickup.money);
  run(
    "éphémère : ramassée via pickupEntity — retirée du monde, sans résidu",
    false,
    getActiveWorld(afterEphemeralPickup).entities.some((e) => e.id === "ephemeral-0")
  );

  // Purge au départ (travelToWorld) : un éphémère NON ramassé ne doit JAMAIS
  // survivre à une sortie de scène — voir entities/model.md.
  const beforeDeparture = spawnEphemeral(ephemeralState, EPHEMERAL_SPEC, 6);
  run(
    "éphémère : présente avant la transition (contrôle)",
    true,
    getActiveWorld(beforeDeparture).entities.some((e) => e.ephemeral)
  );
  const afterDeparture = travelToWorld(beforeDeparture, "movement-check-ephemeral-b", ephemeralWorldB);
  run(
    "éphémère : purgée du monde QUITTÉ par travelToWorld (non ramassée)",
    false,
    afterDeparture.worlds["movement-check-ephemeral-a"].entities.some((e) => e.ephemeral)
  );
  run(
    "éphémère : travelToWorld laisse les entités déclarées du monde quitté intactes",
    true,
    afterDeparture.worlds["movement-check-ephemeral-a"].entities.some((e) => e.id === "declared-1")
  );
  // Revenir dans le monde quitté : toujours aucun éphémère (la purge a eu
  // lieu à la sortie, pas à l'entrée — rien à refaire ici, juste vérifier
  // qu'il n'y a rien à trouver).
  const backInA = travelToWorld(afterDeparture, "movement-check-ephemeral-a");
  run(
    "éphémère : revenir dans le monde quitté — toujours aucun éphémère",
    false,
    getActiveWorld(backInA).entities.some((e) => e.ephemeral)
  );

  // Exclusion de la sérialisation (core/save.js) : garantie INDÉPENDANTE de
  // la purge ci-dessus — testée ici en construisant directement une session
  // avec un éphémère encore présent (comme si sauvegardée SANS quitter la
  // scène), pour vérifier que serializeGame ne compte sur AUCUN autre
  // mécanisme pour tenir sa propre garantie.
  const sessionWithEphemeral = spawnEphemeral(ephemeralState, EPHEMERAL_SPEC, 7);
  run(
    "éphémère : présente avant sérialisation (contrôle)",
    true,
    getActiveWorld(sessionWithEphemeral).entities.some((e) => e.ephemeral)
  );
  const ephemeralSaveEnvelope = serializeGame(sessionWithEphemeral);
  run(
    "éphémère : serializeGame l'exclut du monde actif",
    false,
    ephemeralSaveEnvelope.data.worlds["movement-check-ephemeral-a"].entities.some((e) => e.ephemeral)
  );
  run(
    "éphémère : serializeGame laisse les entités déclarées intactes",
    true,
    ephemeralSaveEnvelope.data.worlds["movement-check-ephemeral-a"].entities.some((e) => e.id === "declared-1")
  );
  run(
    "éphémère : serializeGame ne mute jamais la session d'origine",
    true,
    getActiveWorld(sessionWithEphemeral).entities.some((e) => e.ephemeral)
  );
  const ephemeralReload = deserializeGame(ephemeralSaveEnvelope);
  run("éphémère : la sauvegarde reste chargeable", true, ephemeralReload.success);
  if (ephemeralReload.success) {
    run(
      "éphémère : recharger ne la fait PAS réapparaître",
      false,
      ephemeralReload.session.worlds["movement-check-ephemeral-a"].entities.some((e) => e.ephemeral)
    );
  }

  // Rebouchage nextEphemeralId (core/save.js/backfillWorld) : une sauvegarde
  // antérieure aux entités éphémères n'a jamais eu cette clé — sans
  // rebouchage, spawnEphemeral calculerait undefined + 1 = NaN, et TOUT
  // éphémère suivant recevrait le même id ("ephemeral-NaN"), collision
  // garantie dès le second spawn.
  // ephemeralWorldA sort de parseLevel : porte déjà defaultSurface/segments
  // (voir core/level.js) mais PAS rngState/lastVisited/
  // nextEphemeralId (ajoutés seulement par createWorldState, core/state.js)
  // — on simule ICI un monde ANTÉRIEUR au compteur en ajoutant les deux
  // premiers à la main SANS le troisième, exactement le manque à combler.
  const worldWithoutCounter = { ...ephemeralWorldA, rngState: 1, lastVisited: 0 };
  const oldEphemeralSave = {
    version: SAVE_VERSION,
    data: {
      ...ephemeralState,
      worlds: { [ephemeralWorldA.id]: worldWithoutCounter },
    },
  };
  const oldEphemeralResult = deserializeGame(oldEphemeralSave);
  run("éphémère : sauvegarde antérieure au compteur acceptée (rebouchée)", true, oldEphemeralResult.success);
  if (oldEphemeralResult.success) {
    run("éphémère : monde rebouché — nextEphemeralId par défaut (0)", 0, getActiveWorld(oldEphemeralResult.session).nextEphemeralId);
    const spawnedAfterBackfill = spawnEphemeral(oldEphemeralResult.session, EPHEMERAL_SPEC, 1);
    run(
      "éphémère : spawn après rebouchage — id sain (pas 'ephemeral-NaN')",
      true,
      getActiveWorld(spawnedAfterBackfill).entities.some((e) => e.id === "ephemeral-0")
    );
  }

  // Limite anti-prolifération (MAX_EPHEMERALS, config/ephemerals.js) :
  // dépasser la limite ÉVINCE LE PLUS ANCIEN éphémère vivant, jamais les
  // entités déclarées (dont le nombre n'est pas concerné par cette limite).
  let evictionState = ephemeralState;
  for (let i = 0; i < MAX_EPHEMERALS + 1; i++) {
    evictionState = spawnEphemeral(evictionState, EPHEMERAL_SPEC, 1);
  }
  const ephemeralsAfterEviction = getActiveWorld(evictionState).entities.filter((e) => e.ephemeral);
  run("éphémère : MAX_EPHEMERALS dépassé — le compte reste plafonné", MAX_EPHEMERALS, ephemeralsAfterEviction.length);
  run(
    "éphémère : le PLUS ANCIEN (ephemeral-0) a été évincé",
    false,
    ephemeralsAfterEviction.some((e) => e.id === "ephemeral-0")
  );
  run(
    "éphémère : le PLUS RÉCENT est bien présent",
    true,
    ephemeralsAfterEviction.some((e) => e.id === `ephemeral-${MAX_EPHEMERALS}`)
  );
  run(
    "éphémère : l'entité déclarée n'est jamais comptée dans la limite",
    true,
    getActiveWorld(evictionState).entities.some((e) => e.id === "declared-1")
  );

  // --- Spawn d'éphémères ÉPARPILLÉS (core/state.js/spawnScatteredEphemerals
  // + drawScatteredPosition, core/money.js/lootEntitySpawn) ---
  // Voir entities/model.md/"Spawn déclenché par une action".

  const SCATTER_SPEC = { type: "dog", labelKey: "entity.dog", interactable: true, action: { kind: "pickup", amount: 1 } };

  // drawScatteredPosition en ISOLATION (exportée pour ça, voir son
  // commentaire) : bornes de carte ET obstacle, vérifiées directement,
  // sans dépendre du hasard d'un tirage complet.
  {
    let state = createSeed(7);
    let allWithinBounds = true;
    for (let i = 0; i < 30; i++) {
      const draw = drawScatteredPosition(0.5, 5, 10, [], { time: 0 }, state);
      state = draw.rngState;
      if (draw.x < 0 || draw.x > 10) allWithinBounds = false;
    }
    run("scatter : bornes de carte — jamais hors [0, length], même près d'un bord", true, allWithinBounds);
  }
  {
    const obstacle = [{ id: "wall", x: 5, blocksMovement: true }];
    let state = createSeed(11);
    let neverInWall = true;
    for (let i = 0; i < 30; i++) {
      const draw = drawScatteredPosition(4, 3, 10, obstacle, { time: 0 }, state);
      state = draw.rngState;
      if (Math.abs(draw.x - 5) < BODY_RADIUS) neverInWall = false;
    }
    run("scatter : obstacle bloquant — aucune position tirée dans son corps", true, neverInWall);
  }
  // Une entité DORMANTE (règle de présence non couvrante à cet instant) ne
  // compte JAMAIS comme obstacle, même blocksMovement:true — cohérent avec
  // isBlocking partout ailleurs (core/presence.js). spread:0 isole la
  // vérification de tout aléa : le seul candidat possible est sourceX lui-même.
  {
    const dormantObstacle = [
      { id: "dormant-wall", x: 5, blocksMovement: true, presence: [{ when: { type: "timeRange", from: 0, to: 1 }, present: true }] },
    ];
    const draw = drawScatteredPosition(5, 0, 10, dormantObstacle, { time: 12 * 60 }, createSeed(3));
    run("scatter : obstacle DORMANT -> jamais compté (isBlocking, comme partout ailleurs)", 5, draw.x);
  }

  const SCATTER_REGISTRY = { dog: { label: "entity.dog" } };
  const scatterLevel = parseLevel(
    {
      id: "movement-check-scatter",
      titleKey: "level.demo.title",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "crate-1", type: "dog", x: 10, interactable: true, action: { kind: "loot", spawn: { spec: { type: "money" }, count: 4, spread: 3 } } },
        { id: "other-1", type: "dog", x: 2 },
      ],
    },
    SCATTER_REGISTRY
  );
  const scatterState = createInitialState(scatterLevel, 99, NO_COMPANIONS);

  const scatterResult = spawnScatteredEphemerals(scatterState, SCATTER_SPEC, 10, 4, 3);
  const scatteredEntities = getActiveWorld(scatterResult).entities.filter((e) => e.ephemeral);
  run("scatter : spawnScatteredEphemerals crée exactement count entités", 4, scatteredEntities.length);
  run("scatter : toutes marquées ephemeral", true, scatteredEntities.every((e) => e.ephemeral));
  run("scatter : positions ÉPARPILLÉES, pas empilées au même point", true, new Set(scatteredEntities.map((e) => e.x)).size > 1);
  run("scatter : spawnScatteredEphemerals NE MUTE JAMAIS l'original", false, getActiveWorld(scatterState).entities.some((e) => e.ephemeral));
  run(
    "scatter : entité déclarée jamais affectée",
    true,
    getActiveWorld(scatterResult).entities.some((e) => e.id === "other-1")
  );

  // Déterminisme : même seed + mêmes paramètres -> mêmes positions, toujours.
  const scatterStateAgain = createInitialState(scatterLevel, 99, NO_COMPANIONS);
  const scatterResultAgain = spawnScatteredEphemerals(scatterStateAgain, SCATTER_SPEC, 10, 4, 3);
  const scatteredAgain = getActiveWorld(scatterResultAgain)
    .entities.filter((e) => e.ephemeral)
    .map((e) => e.x);
  run(
    "scatter : déterminisme — même seed + mêmes paramètres -> mêmes positions",
    JSON.stringify(scatteredEntities.map((e) => e.x)),
    JSON.stringify(scatteredAgain)
  );

  // spread omis -> repli sur config/tuning-values.js/ephemeralScatterSpread.
  const scatterDefaultSpread = getActiveWorld(spawnScatteredEphemerals(scatterState, SCATTER_SPEC, 10, 1)).entities.filter(
    (e) => e.ephemeral
  );
  run(
    "scatter : spread omis -> repli sur ephemeralScatterSpread",
    true,
    scatterDefaultSpread.every((e) => Math.abs(e.x - 10) <= TUNING_DEFAULTS.ephemeralScatterSpread)
  );

  // Une pièce éparpillée se ramasse comme n'importe quel autre éphémère —
  // réutilise pickupEntity TEL QUEL (robustesse au retrait déjà en place).
  const oneScatteredId = scatteredEntities[0].id;
  const afterScatterPickup = pickupEntity(scatterResult, oneScatteredId, 5);
  run(
    "scatter : une pièce éparpillée se ramasse via pickupEntity, sans résidu",
    false,
    getActiveWorld(afterScatterPickup).entities.some((e) => e.id === oneScatteredId)
  );

  // Dépassement de MAX_EPHEMERALS EN UN SEUL effet -> plafonné proprement,
  // aucun crash.
  const bigScatter = spawnScatteredEphemerals(scatterState, SCATTER_SPEC, 10, MAX_EPHEMERALS + 5, 3);
  run(
    "scatter : count > MAX_EPHEMERALS en un seul effet -> plafonné proprement",
    MAX_EPHEMERALS,
    getActiveWorld(bigScatter).entities.filter((e) => e.ephemeral).length
  );

  // lootEntitySpawn : même idempotence que lootEntity, marque consumed,
  // spawn à la position DE LA SOURCE (entity.x), jamais ailleurs.
  const afterLootSpawn = lootEntitySpawn(scatterState, "crate-1", SCATTER_SPEC, 4, 3);
  run("scatter : lootEntitySpawn marque consumed", true, getActiveWorld(afterLootSpawn).entities.find((e) => e.id === "crate-1").consumed);
  run(
    "scatter : lootEntitySpawn crée count entités éphémères",
    4,
    getActiveWorld(afterLootSpawn).entities.filter((e) => e.ephemeral).length
  );
  run(
    "scatter : lootEntitySpawn — positions centrées sur la source (x=10)",
    true,
    getActiveWorld(afterLootSpawn)
      .entities.filter((e) => e.ephemeral)
      .every((e) => Math.abs(e.x - 10) <= 3)
  );
  run(
    "scatter : lootEntitySpawn sur une entité déjà consumed -> référence INCHANGÉE",
    afterLootSpawn,
    lootEntitySpawn(afterLootSpawn, "crate-1", SCATTER_SPEC, 4, 3)
  );
  run(
    "scatter : lootEntitySpawn sur une entité absente -> référence INCHANGÉE",
    scatterState,
    lootEntitySpawn(scatterState, "does-not-exist", SCATTER_SPEC, 4, 3)
  );

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

  // Sauvegarde ANTÉRIEURE à defaultSurface/segments (voir
  // core/level.js/parseLevel) : ses mondes n'ont jamais eu ces clés, et une
  // relecture de sauvegarde ne repasse jamais par parseLevel — sans
  // rebouchage (core/save.js/backfillWorld), surfaceAt(world, x) plante sur
  // world.segments.find(...) dès qu'un tel monde redevient actif (bug réel,
  // trouvé en jeu).
  const oldWorlds = {};
  for (const [id, world] of Object.entries(auditSession.worlds)) {
    const { defaultSurface, segments, ...oldWorld } = world;
    oldWorlds[id] = oldWorld;
  }
  const oldSave = { version: SAVE_VERSION, data: { ...auditSession, worlds: oldWorlds } };
  const oldSaveResult = deserializeGame(oldSave);
  run("save : sauvegarde antérieure aux surfaces acceptée (reboutchée)", true, oldSaveResult.success);
  if (oldSaveResult.success) {
    const revivedWorld = oldSaveResult.session.worlds[oldSaveResult.session.activeWorldId];
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

  // Sauvegarde ANTÉRIEURE à `indoor` (voir core/level.js/parseFace, "nature
  // de lieu") : ses mondes n'ont jamais eu cette clé — sans rebouchage
  // (core/save.js/backfillFace), le rendu d'ambiance météo lirait
  // `undefined` (ni indoor ni outdoor) au lieu d'un booléen.
  const oldIndoorWorlds = {};
  for (const [id, world] of Object.entries(auditSession.worlds)) {
    const { indoor, ...oldWorld } = world;
    oldIndoorWorlds[id] = oldWorld;
  }
  const oldIndoorSave = { version: SAVE_VERSION, data: { ...auditSession, worlds: oldIndoorWorlds } };
  const oldIndoorSaveResult = deserializeGame(oldIndoorSave);
  run("save : sauvegarde antérieure à indoor acceptée (rebouchée)", true, oldIndoorSaveResult.success);
  if (oldIndoorSaveResult.success) {
    const revivedIndoorWorld = oldIndoorSaveResult.session.worlds[oldIndoorSaveResult.session.activeWorldId];
    run("save : monde rebouché — indoor par défaut (false, extérieur)", false, revivedIndoorWorld.indoor);
  }

  // Sauvegarde encore plus ancienne, avec un champ de niveau depuis RETIRÉ
  // du format (ex. un ancien jalon de contenu jamais devenu actif) : ni
  // rejeté ni traité spécialement — simplement transporté tel quel, comme
  // n'importe quel champ que plus aucun code ne lit.
  const worldsWithLegacyField = {};
  for (const [id, world] of Object.entries(auditSession.worlds)) {
    worldsWithLegacyField[id] = { ...world, legacyField: 3 };
  }
  const legacyFieldSave = { version: SAVE_VERSION, data: { ...auditSession, worlds: worldsWithLegacyField } };
  const legacyFieldResult = deserializeGame(legacyFieldSave);
  run("save : sauvegarde avec un champ de niveau retiré du format — se charge sans erreur", true, legacyFieldResult.success);
  if (legacyFieldResult.success) {
    const revivedLegacyWorld = legacyFieldResult.session.worlds[legacyFieldResult.session.activeWorldId];
    run("save : champ retiré du format — transporté tel quel, jamais nettoyé", 3, revivedLegacyWorld.legacyField);
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

  // Sauvegarde ANTÉRIEURE à l'argent (voir core/money.js) : même précédent
  // exact que time/surfaces ci-dessus — jamais eu de clé .money.
  const { money: _droppedMoney, ...auditSessionWithoutMoney } = auditSession;
  const oldMoneySave = { version: SAVE_VERSION, data: auditSessionWithoutMoney };
  const oldMoneySaveResult = deserializeGame(oldMoneySave);
  run("save : sauvegarde antérieure à l'argent acceptée (rebouchée)", true, oldMoneySaveResult.success);
  if (oldMoneySaveResult.success) {
    run("save : partie rebouchée — money par défaut (0)", 0, oldMoneySaveResult.session.money);
  }

  // Sauvegarde ANTÉRIEURE au sac (voir core/bag.js) : même précédent exact
  // — jamais eu de clé .bag.
  const { bag: _droppedBag, ...auditSessionWithoutBag } = auditSession;
  const oldBagSave = { version: SAVE_VERSION, data: auditSessionWithoutBag };
  const oldBagSaveResult = deserializeGame(oldBagSave);
  run("save : sauvegarde antérieure au sac acceptée (rebouchée)", true, oldBagSaveResult.success);
  if (oldBagSaveResult.success) {
    run("save : partie rebouchée — bag par défaut (tableau vide)", 0, oldBagSaveResult.session.bag.length);
  }
  // Un bag manifestement CORROMPU (pas un tableau) suit le MÊME chemin que
  // "absent" — migrateSave le rebouche AVANT toute validation de forme,
  // exactement comme companions (voir migrateSave) : jamais rejeté, jamais
  // un crash, juste ramené à un sac vide sûr.
  const corruptedBagResult = deserializeGame({ version: SAVE_VERSION, data: { ...auditSession, bag: "not-an-array" } });
  run("save : bag corrompu (pas un tableau) accepté (rebouché, comme companions)", true, corruptedBagResult.success);
  if (corruptedBagResult.success) {
    run("save : bag corrompu rebouché — tableau vide", 0, corruptedBagResult.session.bag.length);
  }

  // Sauvegarde ANTÉRIEURE à l'équipement (voir core/equipment.js) : même
  // précédent exact que time/money/bag ci-dessus — jamais eu de clé
  // .equipment. REBOUCHÉ VIDE (jamais avec des baskets par défaut, voir le
  // commentaire de migrateSave) : une vieille partie ne doit pas se
  // retrouver rétroactivement chaussée.
  const { equipment: _droppedEquipment, ...auditSessionWithoutEquipment } = auditSession;
  const oldEquipmentSave = { version: SAVE_VERSION, data: auditSessionWithoutEquipment };
  const oldEquipmentSaveResult = deserializeGame(oldEquipmentSave);
  run("save : sauvegarde antérieure à l'équipement acceptée (rebouchée)", true, oldEquipmentSaveResult.success);
  if (oldEquipmentSaveResult.success) {
    run("save : partie rebouchée — équipement par défaut (slot feet vide)", null, oldEquipmentSaveResult.session.equipment.feet);
  }

  // Sauvegarde ANTÉRIEURE au modèle recto/verso (voir CLAUDE.md/
  // "RECTO/VERSO") : jamais eu de clé `player.side` — sans rebouchage
  // (core/save.js/migrateSave), une scène à deux faces qu'on visiterait
  // plus tard n'aurait aucune face "courante" définie.
  const { side: _droppedSide, ...auditPlayerWithoutSide } = auditSession.player;
  const oldSideSave = {
    version: SAVE_VERSION,
    data: { ...auditSession, player: auditPlayerWithoutSide },
  };
  const oldSideSaveResult = deserializeGame(oldSideSave);
  run("save : sauvegarde antérieure à recto/verso acceptée (player.side rebouché)", true, oldSideSaveResult.success);
  if (oldSideSaveResult.success) {
    run("save : partie rebouchée — player.side par défaut 'recto'", "recto", oldSideSaveResult.session.player.side);
  }

  // Sauvegarde d'une scène à DEUX FACES, ANTÉRIEURE à defaultSurface/
  // segments/nextEphemeralId/indoor — même précédent que le monde simple
  // ci-dessus (core/save.js/backfillFace), mais chaque face doit être
  // rebouchée INDÉPENDAMMENT (voir core/save.js/backfillWorld).
  const freshTwoFaceSession = createInitialState(twoFacedLevel, 42, NO_COMPANIONS);
  const freshTwoFaceWorld = freshTwoFaceSession.worlds[twoFaceWorldId];
  const {
    defaultSurface: _droppedRectoSurface,
    segments: _droppedRectoSegments,
    nextEphemeralId: _droppedRectoNextId,
    indoor: _droppedRectoIndoor,
    ...oldRectoFace
  } = freshTwoFaceWorld.recto;
  const {
    defaultSurface: _droppedVersoSurface,
    segments: _droppedVersoSegments,
    nextEphemeralId: _droppedVersoNextId,
    indoor: _droppedVersoIndoor,
    ...oldVersoFace
  } = freshTwoFaceWorld.verso;
  const oldTwoFaceWorldSave = {
    version: SAVE_VERSION,
    data: {
      ...freshTwoFaceSession,
      worlds: { ...freshTwoFaceSession.worlds, [twoFaceWorldId]: { ...freshTwoFaceWorld, recto: oldRectoFace, verso: oldVersoFace } },
    },
  };
  const oldTwoFaceWorldResult = deserializeGame(oldTwoFaceWorldSave);
  run("save : scène à deux faces antérieure aux surfaces acceptée (chaque face rebouchée)", true, oldTwoFaceWorldResult.success);
  if (oldTwoFaceWorldResult.success) {
    const revivedTwoFaceWorld = oldTwoFaceWorldResult.session.worlds[twoFaceWorldId];
    run("save : deux faces rebouchées — defaultSurface par défaut (recto)", DEFAULT_SURFACE, revivedTwoFaceWorld.recto.defaultSurface);
    run("save : deux faces rebouchées — defaultSurface par défaut (verso)", DEFAULT_SURFACE, revivedTwoFaceWorld.verso.defaultSurface);
    run("save : deux faces rebouchées — segments par défaut (recto)", 0, revivedTwoFaceWorld.recto.segments.length);
    run("save : deux faces rebouchées — segments par défaut (verso)", 0, revivedTwoFaceWorld.verso.segments.length);
    run("save : deux faces rebouchées — indoor par défaut (recto)", false, revivedTwoFaceWorld.recto.indoor);
    run("save : deux faces rebouchées — indoor par défaut (verso)", false, revivedTwoFaceWorld.verso.indoor);
  }

  // Round-trip complet d'une session à deux faces via le vrai système de
  // save (pas juste JSON.stringify/parse) : les deux faces ET player.side
  // survivent, identiques.
  const twoFaceSaveEnvelope = serializeGame(freshTwoFaceSession);
  const twoFaceSaveResult = deserializeGame(twoFaceSaveEnvelope);
  run("save : session à deux faces se recharge sans erreur", true, twoFaceSaveResult.success);
  if (twoFaceSaveResult.success) {
    run(
      "save : session à deux faces identique après un aller-retour save/load complet",
      JSON.stringify(freshTwoFaceSession),
      JSON.stringify(twoFaceSaveResult.session)
    );
  }

  // --- Parsing TOTAL de niveau (core/level.js/parseLevel) : l'ABSENCE de
  // tout champ de scène retombe sur un défaut sensé, {} est un niveau
  // valide et jouable — voir level/schema.md/"Parsing TOTAL". Seule la
  // PRÉSENCE malformée d'un champ échoue encore (inchangé).
  {
    const emptyLevel = parseLevel({}, EMPTY_REGISTRY);
    run("parseLevel({}) : id -> défaut générique", "level", emptyLevel.id);
    run("parseLevel({}) : titleKey -> défaut générique", "level.default.title", emptyLevel.titleKey);
    run("parseLevel({}) : length -> défaut minimal traversable (10)", 10, emptyLevel.length);
    run("parseLevel({}) : playerStart -> 0 (filet existant)", 0, emptyLevel.playerStart);
    run("parseLevel({}) : entities -> [] (tableau vide)", 0, emptyLevel.entities.length);
    run("parseLevel({}) : defaultSurface -> DEFAULT_SURFACE", DEFAULT_SURFACE, emptyLevel.defaultSurface);
    run("parseLevel({}) : segments -> [] (tableau vide)", 0, emptyLevel.segments.length);
    run("parseLevel({}) : indoor -> false (extérieur)", false, emptyLevel.indoor);
    run("parseLevel({}) : aucune musique déclarée (silence valide)", undefined, emptyLevel.music);

    // Jouable de bout en bout : spawn, déplacement, surface — jamais de
    // lecture sur du undefined, jamais d'exception.
    let emptyState = createInitialState(emptyLevel, undefined, NO_COMPANIONS);
    run("parseLevel({}) : le joueur apparaît à playerStart (0)", 0, emptyState.player.x);
    emptyState = reduce(emptyState, tick(1));
    emptyState = reduce(emptyState, tick(1));
    run("parseLevel({}) : le joueur s'y déplace (2 ticks à droite)", 2 * MOVE_STEP, emptyState.player.x);
    const emptyWorld = getActiveWorld(emptyState);
    run(
      "parseLevel({}) : surfaceAt ne plante jamais sur la scène vide",
      DEFAULT_SURFACE,
      surfaceAt(emptyWorld, emptyState.player.x)
    );

    // Clamp à droite : la longueur minimale reste bornée normalement.
    // Largement assez de ticks (MOVE_STEP par tick) pour dépasser length=10.
    let clampState = createInitialState(emptyLevel, undefined, NO_COMPANIONS);
    for (let i = 0; i < 500; i++) clampState = reduce(clampState, tick(1));
    run("parseLevel({}) : clamp à droite sur la longueur minimale (10)", 10, clampState.player.x);

    // Save/load : aucune exception, aller-retour fidèle.
    const emptySaveEnvelope = serializeGame(emptyState);
    const emptySaveResult = deserializeGame(emptySaveEnvelope);
    run("parseLevel({}) : save/load réussit sans exception", true, emptySaveResult.success);
    if (emptySaveResult.success) {
      run(
        "parseLevel({}) : session rechargée identique après aller-retour",
        JSON.stringify(emptyState),
        JSON.stringify(emptySaveResult.session)
      );
    }
  }

  // Face recto/verso vide : même filet, partagé via parseFace.
  {
    const emptyTwoFacedLevel = parseLevel({ recto: {}, verso: {} }, EMPTY_REGISTRY);
    run("parseLevel : face recto vide -> entities []", 0, emptyTwoFacedLevel.recto.entities.length);
    run("parseLevel : face verso vide -> entities []", 0, emptyTwoFacedLevel.verso.entities.length);
    run("parseLevel : scène à deux faces vides -> length par défaut (10)", 10, emptyTwoFacedLevel.length);
  }

  // Chaque champ omis INDIVIDUELLEMENT -> son propre défaut (les autres
  // champs restant fournis, pour isoler l'effet du filet testé).
  run(
    "parseLevel : sans defaultSurface -> DEFAULT_SURFACE (filet préexistant)",
    DEFAULT_SURFACE,
    parseLevel({ id: "x", titleKey: "level.demo.title", length: 5, entities: [] }, EMPTY_REGISTRY).defaultSurface
  );
  run(
    "parseLevel : sans length -> 10 (filet nouveau)",
    10,
    parseLevel({ id: "x", titleKey: "level.demo.title", entities: [] }, EMPTY_REGISTRY).length
  );
  run(
    "parseLevel : sans titleKey -> level.default.title (filet nouveau)",
    "level.default.title",
    parseLevel({ id: "x", length: 5, entities: [] }, EMPTY_REGISTRY).titleKey
  );
  run(
    "parseLevel : sans id -> level (filet nouveau)",
    "level",
    parseLevel({ titleKey: "level.demo.title", length: 5, entities: [] }, EMPTY_REGISTRY).id
  );

  // PRÉSENT mais MALFORMÉ -> erreur claire, INCHANGÉ (le défaut ne couvre
  // que l'omission, jamais une valeur fournie invalide).
  run(
    "parseLevel : id présent mais vide -> erreur",
    true,
    expectLevelParseThrows({ id: "", titleKey: "level.demo.title", length: 5, entities: [] }, EMPTY_REGISTRY)
  );
  run(
    "parseLevel : titleKey présent mais vide -> erreur",
    true,
    expectLevelParseThrows({ id: "x", titleKey: "", length: 5, entities: [] }, EMPTY_REGISTRY)
  );
  run(
    "parseLevel : length présent mais <= 0 -> erreur",
    true,
    expectLevelParseThrows({ id: "x", titleKey: "level.demo.title", length: 0, entities: [] }, EMPTY_REGISTRY)
  );
  run(
    "parseLevel : length présent mais mauvais type -> erreur",
    true,
    expectLevelParseThrows({ id: "x", titleKey: "level.demo.title", length: "10", entities: [] }, EMPTY_REGISTRY)
  );
  run(
    "parseLevel : entities présent mais pas un tableau -> erreur",
    true,
    expectLevelParseThrows({ id: "x", titleKey: "level.demo.title", length: 5, entities: "oops" }, EMPTY_REGISTRY)
  );

  // --- STOCKAGE de variables (core/variables.js) : trois portées (entity/
  // scene/game), même mécanisme — voir CLAUDE.md/core/scripting.md. Ce bloc
  // vérifie le STOCKAGE seul (déclaration, valeur initiale, persistance,
  // sérialisation sélective, accès get/set) — AUCUNE condition/action n'est
  // branchée dessus ici (prompt suivant).
  {
    function expectThrows(fn) {
      try {
        fn();
        return false;
      } catch {
        return true;
      }
    }
    const noopFail = (message) => {
      throw new Error(message);
    };

    // Une scène (portée "scene") et une entité (portée "entity") déclarant
    // chacune une variable PERSISTANTE (défaut) et une variable VOLATILE
    // (persistent: false explicite) — le couple minimal requis par la
    // vérification "modifier les deux, sauvegarder, recharger".
    const VARIABLES_REGISTRY = { npc: { label: "entity.npc" } };
    const variablesRawLevel = {
      id: "movement-check-variables",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      variables: [
        { name: "visits", type: "int", initial: 0 },
        { name: "doorUnlocked", type: "flag", initial: false, persistent: false },
      ],
      entities: [
        {
          id: "npc-1",
          type: "npc",
          x: 5,
          variables: [
            { name: "metOnce", type: "flag", initial: false },
            { name: "affinity", type: "int", initial: 0, persistent: false },
          ],
        },
      ],
    };
    const variablesLevel = parseLevel(variablesRawLevel, VARIABLES_REGISTRY);
    const npc1Decl = variablesLevel.entities.find((e) => e.id === "npc-1");

    // 1) Déclarées aux trois portées -> stockées, valeurs initiales
    // correctes, persistance résolue (défaut TRUE, explicite FALSE).
    run("variables : scène — visits (int) initial 0", 0, variablesLevel.variables.visits.value);
    run("variables : scène — visits persistent PAR DÉFAUT true", true, variablesLevel.variables.visits.persistent);
    run("variables : scène — doorUnlocked (flag) initial false", false, variablesLevel.variables.doorUnlocked.value);
    run("variables : scène — doorUnlocked persistent EXPLICITE false", false, variablesLevel.variables.doorUnlocked.persistent);
    run("variables : entité — metOnce (flag) initial false", false, npc1Decl.variables.metOnce.value);
    run("variables : entité — metOnce persistent PAR DÉFAUT true", true, npc1Decl.variables.metOnce.persistent);
    run("variables : entité — affinity (int) initial 0", 0, npc1Decl.variables.affinity.value);
    run("variables : entité — affinity persistent EXPLICITE false", false, npc1Decl.variables.affinity.persistent);

    let variablesSession = createInitialState(variablesLevel, undefined, {
      companions: [],
      partyVariables: [{ name: "score", type: "int", initial: 0 }],
    });
    run("variables : partie — score (int) initial 0", 0, variablesSession.variables.score.value);
    run("variables : partie — score persistent PAR DÉFAUT true", true, variablesSession.variables.score.persistent);

    // Aucune valeur initiale ne doit jamais être undefined (obligatoire à
    // la déclaration, voir core/variables.js/parseVariables).
    run(
      "variables : aucune valeur undefined (scène)",
      true,
      Object.values(variablesLevel.variables).every((v) => v.value !== undefined)
    );
    run(
      "variables : aucune valeur undefined (entité)",
      true,
      Object.values(npc1Decl.variables).every((v) => v.value !== undefined)
    );
    run(
      "variables : aucune valeur undefined (partie)",
      true,
      Object.values(variablesSession.variables).every((v) => v.value !== undefined)
    );

    // 2) Accès getVariable/setVariable, POINT D'ENTRÉE UNIQUE (voir
    // core/variables.js) — context { entity, world, session } générique,
    // scope ∈ "entity" | "scene" | "party".
    function variablesContext(session) {
      const world = session.worlds[session.activeWorldId];
      const entity = world.entities.find((e) => e.id === "npc-1");
      return { entity, world, session };
    }
    const ctx = variablesContext(variablesSession);
    run("getVariable : entity/metOnce", false, getVariable(ctx, "entity", "metOnce"));
    run("getVariable : scene/visits", 0, getVariable(ctx, "scene", "visits"));
    run("getVariable : party/score", 0, getVariable(ctx, "party", "score"));
    run("getVariable : nom inconnu -> undefined", undefined, getVariable(ctx, "entity", "doesNotExist"));
    run("getVariable : portée inconnue -> undefined", undefined, getVariable(ctx, "bogus", "metOnce"));

    const afterSetEntity = setVariable(ctx, "entity", "metOnce", true);
    run("setVariable : entity/metOnce -> true", true, afterSetEntity.variables.metOnce.value);
    run("setVariable : renvoie le PORTEUR (référence neuve), pas le contexte", true, afterSetEntity !== ctx.entity);
    run("setVariable : nom inconnu -> porteur INCHANGÉ (même référence)", ctx.entity, setVariable(ctx, "entity", "doesNotExist", true));
    run(
      "setVariable : valeur incohérente avec le type -> porteur INCHANGÉ",
      ctx.entity,
      setVariable(ctx, "entity", "affinity", "not a number")
    );

    // 3) Persistance sélective : modifie une PERSISTANTE et une VOLATILE à
    // CHAQUE portée, sauvegarde, recharge -> la persistante reprend sa
    // valeur modifiée, la volatile repart de sa valeur initiale déclarée.
    // setVariable renvoie le PORTEUR seul (voir core/variables.js/header) :
    // le splice dans la session ci-dessous reproduit ce qu'un futur
    // gestionnaire d'action fera, prompt suivant.
    let rtSession = variablesSession;

    let rtWorld = rtSession.worlds[rtSession.activeWorldId];
    rtWorld = setVariable({ world: rtWorld }, "scene", "visits", 7);
    rtWorld = setVariable({ world: rtWorld }, "scene", "doorUnlocked", true);
    rtSession = { ...rtSession, worlds: { ...rtSession.worlds, [rtSession.activeWorldId]: rtWorld } };

    let rtEntity = rtWorld.entities.find((e) => e.id === "npc-1");
    rtEntity = setVariable({ entity: rtEntity }, "entity", "metOnce", true);
    rtEntity = setVariable({ entity: rtEntity }, "entity", "affinity", 99);
    rtWorld = { ...rtWorld, entities: rtWorld.entities.map((e) => (e.id === "npc-1" ? rtEntity : e)) };
    rtSession = { ...rtSession, worlds: { ...rtSession.worlds, [rtSession.activeWorldId]: rtWorld } };

    // "party" : le porteur EST la session elle-même (voir
    // core/variables.js/carrierForScope) — setVariable renvoie donc déjà
    // une session complète, aucun splice à faire.
    rtSession = setVariable({ session: rtSession }, "party", "score", 42);

    const rtEnvelope = serializeGame(rtSession);
    const savedWorld = rtEnvelope.data.worlds[variablesLevel.id];
    const savedEntity = savedWorld.entities.find((e) => e.id === "npc-1");
    run("save : scène — visits (persistante) survit dans l'enveloppe", 7, savedWorld.variables.visits.value);
    run(
      "save : scène — doorUnlocked (volatile) déjà remise à son initial (false) dans l'enveloppe",
      false,
      savedWorld.variables.doorUnlocked.value
    );
    run("save : entité — metOnce (persistante) survit dans l'enveloppe", true, savedEntity.variables.metOnce.value);
    run(
      "save : entité — affinity (volatile) déjà remise à son initial (0) dans l'enveloppe",
      0,
      savedEntity.variables.affinity.value
    );
    run("save : partie — score (persistante) survit dans l'enveloppe", 42, rtEnvelope.data.variables.score.value);

    const rtReload = deserializeGame(rtEnvelope);
    run("save/load : variables — recharge sans erreur", true, rtReload.success);
    if (rtReload.success) {
      const reloadedWorld = rtReload.session.worlds[variablesLevel.id];
      const reloadedEntity = reloadedWorld.entities.find((e) => e.id === "npc-1");
      run("save/load : scène — visits (persistante) reprend sa valeur modifiée (7)", 7, reloadedWorld.variables.visits.value);
      run("save/load : scène — doorUnlocked (volatile) repart de son initial (false)", false, reloadedWorld.variables.doorUnlocked.value);
      run("save/load : entité — metOnce (persistante) reprend sa valeur modifiée (true)", true, reloadedEntity.variables.metOnce.value);
      run("save/load : entité — affinity (volatile) repart de son initial (0)", 0, reloadedEntity.variables.affinity.value);
      run("save/load : partie — score (persistante) reprend sa valeur modifiée (42)", 42, rtReload.session.variables.score.value);
    }

    // Audit de sérialisabilité générique (voir plus haut, auditNonSerializable)
    // appliqué à une session qui exerce RÉELLEMENT les trois portées : aucune
    // fonction/NaN/référence circulaire ne doit s'y être glissée.
    const variablesLeakFindings = [];
    auditNonSerializable(rtSession, "variablesSession", new Set(), variablesLeakFindings);
    run("variables : sérialisation — aucune fuite de non-sérialisable", 0, variablesLeakFindings.length);

    // 4) PRÉSENT mais MALFORMÉ -> erreur claire (le défaut ne couvre QUE
    // l'omission). Directement via parseVariables...
    run("variables : type inconnu -> erreur", true, expectThrows(() => parseVariables([{ name: "x", type: "float", initial: 1 }], "test", noopFail)));
    run(
      "variables : flag avec initial non booléen -> erreur",
      true,
      expectThrows(() => parseVariables([{ name: "x", type: "flag", initial: 1 }], "test", noopFail))
    );
    run(
      "variables : int avec initial non entier (flottant) -> erreur",
      true,
      expectThrows(() => parseVariables([{ name: "x", type: "int", initial: 1.5 }], "test", noopFail))
    );
    run(
      "variables : int avec initial non numérique (chaîne) -> erreur",
      true,
      expectThrows(() => parseVariables([{ name: "x", type: "int", initial: "1" }], "test", noopFail))
    );
    run("variables : initial absent -> erreur", true, expectThrows(() => parseVariables([{ name: "x", type: "int" }], "test", noopFail)));
    run("variables : name absent -> erreur", true, expectThrows(() => parseVariables([{ type: "int", initial: 0 }], "test", noopFail)));
    run(
      "variables : name dupliqué -> erreur",
      true,
      expectThrows(() =>
        parseVariables(
          [
            { name: "x", type: "int", initial: 0 },
            { name: "x", type: "flag", initial: true },
          ],
          "test",
          noopFail
        )
      )
    );
    run(
      "variables : persistent non booléen -> erreur",
      true,
      expectThrows(() => parseVariables([{ name: "x", type: "int", initial: 0, persistent: "yes" }], "test", noopFail))
    );
    run("variables : pas un tableau -> erreur", true, expectThrows(() => parseVariables({ name: "x" }, "test", noopFail)));
    run("variables : élément qui n'est pas un objet -> erreur", true, expectThrows(() => parseVariables(["oops"], "test", noopFail)));
    run("variables : absent -> sac vide, PAS une erreur", false, expectThrows(() => parseVariables(undefined, "test", noopFail)));

    // ... puis via les VRAIS points d'entrée (core/level.js/core/state.js),
    // pour confirmer que le branchement, pas seulement la fonction pure,
    // rejette bien un contenu malformé.
    run(
      "variables : scène malformée -> erreur au chargement (parseLevel)",
      true,
      expectThrows(() =>
        parseLevel({ ...variablesRawLevel, variables: [{ name: "bad", type: "unknown", initial: 0 }] }, VARIABLES_REGISTRY)
      )
    );
    run(
      "variables : entité malformée -> erreur au chargement (parseLevel)",
      true,
      expectThrows(() =>
        parseLevel(
          {
            ...variablesRawLevel,
            entities: [{ id: "npc-bad", type: "npc", x: 1, variables: [{ name: "bad", type: "int", initial: "nope" }] }],
          },
          VARIABLES_REGISTRY
        )
      )
    );
    run(
      "variables : partie malformée -> erreur au chargement (createInitialState)",
      true,
      expectThrows(() =>
        createInitialState(variablesLevel, undefined, {
          companions: [],
          partyVariables: [{ name: "bad", type: "flag", initial: "nope" }],
        })
      )
    );
  }

  // --- VARIABLES BRANCHÉES (étape 2/2, voir core/scripting.md/"Variables"
  // et "Actions multiples filtrées par condition") : condition "variable"
  // (LECTURE, core/presence.js/evaluateVariable), effets setVariable/
  // toggleVariable/addVariable (ÉCRITURE, core/level.js/parseActionEffect,
  // core/variables.js/applyActionEffects), sélection d'action multiple par
  // condition (core/presence.js/selectMatchingAction). Cas de référence :
  // la FENÊTRE (deux candidates aux conditions opposées).
  {
    function expectThrows(fn) {
      try {
        fn();
        return false;
      } catch {
        return true;
      }
    }

    // 1) Condition "variable" — direct via evaluateCondition, contexte
    // { entity, world, session } construit à la main (voir
    // core/variables.js/carrierForScope : "entity"->entity, "scene"->world,
    // "party"->session).
    const flagCarrier = { variables: { isOpen: { type: "flag", initial: false, persistent: false, value: false } } };
    const intCarrier = { variables: { friendship: { type: "int", initial: 0, persistent: true, value: 42 } } };
    const varCtx = { entity: flagCarrier, world: intCarrier, session: intCarrier };

    run(
      "variable (condition) : flag equals false -> vraie",
      true,
      evaluateCondition({ type: "variable", scope: "entity", name: "isOpen", equals: false }, varCtx)
    );
    run(
      "variable (condition) : flag equals true -> fausse",
      false,
      evaluateCondition({ type: "variable", scope: "entity", name: "isOpen", equals: true }, varCtx)
    );
    run(
      "variable (condition) : int greaterThan -> vraie",
      true,
      evaluateCondition({ type: "variable", scope: "scene", name: "friendship", greaterThan: 10 }, varCtx)
    );
    run(
      "variable (condition) : int lessThan -> fausse",
      false,
      evaluateCondition({ type: "variable", scope: "scene", name: "friendship", lessThan: 10 }, varCtx)
    );
    run(
      "variable (condition) : int greaterOrEqual (égal) -> vraie",
      true,
      evaluateCondition({ type: "variable", scope: "party", name: "friendship", greaterOrEqual: 42 }, varCtx)
    );
    run(
      "variable (condition) : int lessOrEqual (égal) -> vraie",
      true,
      evaluateCondition({ type: "variable", scope: "party", name: "friendship", lessOrEqual: 42 }, varCtx)
    );
    run(
      "variable (condition) : int equals -> vraie",
      true,
      evaluateCondition({ type: "variable", scope: "party", name: "friendship", equals: 42 }, varCtx)
    );
    run(
      "variable (condition) : nom inconnu -> fausse (jamais une exception)",
      false,
      evaluateCondition({ type: "variable", scope: "entity", name: "doesNotExist", equals: false }, varCtx)
    );
    run(
      "variable (condition) : portée sans porteur dans le contexte -> fausse",
      false,
      evaluateCondition({ type: "variable", scope: "entity", name: "isOpen", equals: false }, {})
    );
    run(
      "variable (condition) : composable dans allOf — toutes vraies -> vraie",
      true,
      evaluateCondition(
        {
          type: "allOf",
          conditions: [
            { type: "variable", scope: "entity", name: "isOpen", equals: false },
            { type: "weather", state: "fog" },
          ],
        },
        { ...varCtx, weather: "fog" }
      )
    );
    run(
      "variable (condition) : composable dans allOf — une fausse -> fausse",
      false,
      evaluateCondition(
        {
          type: "allOf",
          conditions: [
            { type: "variable", scope: "entity", name: "isOpen", equals: false },
            { type: "weather", state: "fog" },
          ],
        },
        { ...varCtx, weather: "sunny" }
      )
    );

    // 2) selectMatchingAction — sélection SILENCIEUSE (pas de menu, voir
    // core/presence.js) parmi des candidates, PREMIÈRE dont la condition
    // est vraie.
    const candidateOpen = { kind: "applyEffects", condition: { type: "variable", scope: "entity", name: "isOpen", equals: false } };
    const candidateClose = { kind: "applyEffects", condition: { type: "variable", scope: "entity", name: "isOpen", equals: true } };
    const noConditionCandidate = { kind: "applyEffects" };

    run(
      "selectMatchingAction : choisit la candidate dont la condition est vraie (fermée -> ouvrir)",
      candidateOpen,
      selectMatchingAction([candidateOpen, candidateClose], varCtx)
    );
    const openedCtx = {
      ...varCtx,
      entity: { variables: { isOpen: { type: "flag", initial: false, persistent: false, value: true } } },
    };
    run(
      "selectMatchingAction : choisit l'AUTRE candidate une fois l'état basculé (ouverte -> fermer)",
      candidateClose,
      selectMatchingAction([candidateOpen, candidateClose], openedCtx)
    );
    run("selectMatchingAction : aucune candidate ne matche -> undefined", undefined, selectMatchingAction([candidateOpen], openedCtx));
    run(
      "selectMatchingAction : PRIORITÉ — première déclarée qui matche, même si une autre matche aussi",
      noConditionCandidate,
      selectMatchingAction([noConditionCandidate, candidateOpen], varCtx)
    );
    run(
      "selectMatchingAction : candidate SANS condition matche toujours",
      noConditionCandidate,
      selectMatchingAction([noConditionCandidate], {})
    );

    // 3) applyActionEffects — enchaîne set/toggle/add, renvoie le CONTEXTE
    // avec SEULES les portées touchées mises à jour.
    const effectsCtx = {
      entity: {
        variables: {
          isOpen: { type: "flag", initial: false, persistent: false, value: false },
          affinity: { type: "int", initial: 0, persistent: true, value: 5 },
        },
      },
      world: { variables: { visits: { type: "int", initial: 0, persistent: true, value: 1 } } },
      session: { variables: { score: { type: "int", initial: 0, persistent: true, value: 100 } } },
    };
    const afterSet = applyActionEffects([{ type: "setVariable", scope: "entity", name: "isOpen", value: true }], effectsCtx);
    run("applyActionEffects : setVariable — écrit la valeur", true, afterSet.entity.variables.isOpen.value);
    run("applyActionEffects : setVariable — porteurs NON touchés inchangés (world, référence)", effectsCtx.world, afterSet.world);

    const afterToggle = applyActionEffects([{ type: "toggleVariable", scope: "entity", name: "isOpen" }], effectsCtx);
    run("applyActionEffects : toggleVariable — inverse (false -> true)", true, afterToggle.entity.variables.isOpen.value);
    const afterDoubleToggle = applyActionEffects(
      [
        { type: "toggleVariable", scope: "entity", name: "isOpen" },
        { type: "toggleVariable", scope: "entity", name: "isOpen" },
      ],
      effectsCtx
    );
    run("applyActionEffects : deux toggleVariable enchaînés -> revient à l'initial", false, afterDoubleToggle.entity.variables.isOpen.value);

    const afterAdd = applyActionEffects([{ type: "addVariable", scope: "entity", name: "affinity", amount: 3 }], effectsCtx);
    run("applyActionEffects : addVariable — ajoute (5 + 3 = 8)", 8, afterAdd.entity.variables.affinity.value);
    const afterAddNegative = applyActionEffects([{ type: "addVariable", scope: "entity", name: "affinity", amount: -2 }], effectsCtx);
    run("applyActionEffects : addVariable — amount négatif accepté (5 - 2 = 3)", 3, afterAddNegative.entity.variables.affinity.value);

    const afterMixed = applyActionEffects(
      [
        { type: "setVariable", scope: "entity", name: "isOpen", value: true },
        { type: "addVariable", scope: "scene", name: "visits", amount: 1 },
        { type: "addVariable", scope: "party", name: "score", amount: 10 },
      ],
      effectsCtx
    );
    run("applyActionEffects : liste mixte (3 portées) — entity touchée", true, afterMixed.entity.variables.isOpen.value);
    run("applyActionEffects : liste mixte (3 portées) — scene touchée", 2, afterMixed.world.variables.visits.value);
    run("applyActionEffects : liste mixte (3 portées) — party touchée", 110, afterMixed.session.variables.score.value);
    run(
      "applyActionEffects : nom inconnu -> porteur inchangé (silencieux, même référence)",
      effectsCtx.entity,
      applyActionEffects([{ type: "setVariable", scope: "entity", name: "doesNotExist", value: true }], effectsCtx).entity
    );

    // 4) Validation au CHARGEMENT (core/level.js) — PRÉSENT mais MALFORMÉ ->
    // erreur claire ; ABSENT -> défaut, jamais testé ici (déjà couvert par
    // le stockage seul, prompt précédent).
    const VAR_ACTION_REGISTRY = { npc: { label: "entity.npc" } };
    function levelWithCondition(cond, entityVariables = [{ name: "isOpen", type: "flag", initial: false }]) {
      return {
        id: "movement-check-var-cond",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 0,
        variables: [{ name: "sceneCounter", type: "int", initial: 0 }],
        entities: [{ id: "e1", type: "npc", x: 5, variables: entityVariables, presence: [{ when: cond, present: true }] }],
      };
    }
    function levelWithActionEffect(effect, entityVariables = [{ name: "isOpen", type: "flag", initial: false }]) {
      return {
        id: "movement-check-var-effect",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 0,
        variables: [{ name: "sceneCounter", type: "int", initial: 0 }],
        entities: [{ id: "e1", type: "npc", x: 5, variables: entityVariables, action: { kind: "applyEffects", effects: [effect] } }],
      };
    }

    run(
      "variable : scope inconnu -> erreur au chargement",
      true,
      expectThrows(() => parseLevel(levelWithCondition({ type: "variable", scope: "bogus", name: "isOpen", equals: true }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : nom jamais déclaré sur l'entité (scope entity) -> erreur au chargement",
      true,
      expectThrows(() => parseLevel(levelWithCondition({ type: "variable", scope: "entity", name: "doesNotExist", equals: true }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : nom jamais déclaré sur la scène (scope scene) -> erreur au chargement",
      true,
      expectThrows(() => parseLevel(levelWithCondition({ type: "variable", scope: "scene", name: "doesNotExist", equals: true }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : nom de PARTIE jamais déclaré NULLE PART -> PAS d'erreur (non vérifiable au chargement d'un niveau, voir core/level.js/validateVariableReference)",
      false,
      expectThrows(() => parseLevel(levelWithCondition({ type: "variable", scope: "party", name: "totallyMadeUp", equals: true }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : aucun comparateur -> erreur au chargement",
      true,
      expectThrows(() => parseLevel(levelWithCondition({ type: "variable", scope: "entity", name: "isOpen" }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : DEUX comparateurs -> erreur au chargement",
      true,
      expectThrows(() =>
        parseLevel(levelWithCondition({ type: "variable", scope: "entity", name: "isOpen", equals: true, greaterThan: 0 }), VAR_ACTION_REGISTRY)
      )
    );
    run(
      "variable : greaterThan sur un flag -> erreur au chargement",
      true,
      expectThrows(() => parseLevel(levelWithCondition({ type: "variable", scope: "entity", name: "isOpen", greaterThan: 0 }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : equals incohérent avec le type (nombre sur un flag) -> erreur au chargement",
      true,
      expectThrows(() => parseLevel(levelWithCondition({ type: "variable", scope: "entity", name: "isOpen", equals: 1 }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : equals sur un int avec greaterThan valide ailleurs -> chargé sans erreur (cas sain, non-régression)",
      false,
      expectThrows(() =>
        parseLevel(
          levelWithCondition({ type: "variable", scope: "scene", name: "sceneCounter", greaterThan: 0 }, [{ name: "isOpen", type: "flag", initial: false }]),
          VAR_ACTION_REGISTRY
        )
      )
    );

    run(
      "setVariable (effet) : valeur incohérente avec le type -> erreur au chargement",
      true,
      expectThrows(() => parseLevel(levelWithActionEffect({ type: "setVariable", scope: "entity", name: "isOpen", value: "nope" }), VAR_ACTION_REGISTRY))
    );
    run(
      "toggleVariable (effet) : sur un int -> erreur au chargement",
      true,
      expectThrows(() =>
        parseLevel(
          levelWithActionEffect({ type: "toggleVariable", scope: "entity", name: "counter" }, [{ name: "counter", type: "int", initial: 0 }]),
          VAR_ACTION_REGISTRY
        )
      )
    );
    run(
      "addVariable (effet) : sur un flag -> erreur au chargement",
      true,
      expectThrows(() => parseLevel(levelWithActionEffect({ type: "addVariable", scope: "entity", name: "isOpen", amount: 1 }), VAR_ACTION_REGISTRY))
    );
    run(
      "addVariable (effet) : amount non entier -> erreur au chargement",
      true,
      expectThrows(() =>
        parseLevel(
          levelWithActionEffect({ type: "addVariable", scope: "entity", name: "counter", amount: 1.5 }, [{ name: "counter", type: "int", initial: 0 }]),
          VAR_ACTION_REGISTRY
        )
      )
    );
    run(
      "setVariable (effet) : nom jamais déclaré -> erreur au chargement",
      true,
      expectThrows(() => parseLevel(levelWithActionEffect({ type: "setVariable", scope: "entity", name: "doesNotExist", value: true }), VAR_ACTION_REGISTRY))
    );
    run(
      "effet : type inconnu -> erreur au chargement",
      true,
      expectThrows(() => parseLevel(levelWithActionEffect({ type: "bogusEffect", scope: "entity", name: "isOpen" }), VAR_ACTION_REGISTRY))
    );

    run(
      "action : tableau vide -> erreur au chargement",
      true,
      expectThrows(() =>
        parseLevel(
          { id: "movement-check-empty-action", titleKey: "level.demo.title", length: 10, playerStart: 0, entities: [{ id: "e1", type: "npc", x: 5, action: [] }] },
          VAR_ACTION_REGISTRY
        )
      )
    );
    run(
      "action : candidate sans refusalKey malgré une condition -> erreur au chargement (RÉUTILISE la règle existante, par candidate)",
      true,
      expectThrows(() =>
        parseLevel(
          {
            id: "movement-check-candidate-no-refusal",
            titleKey: "level.demo.title",
            length: 10,
            playerStart: 0,
            entities: [
              {
                id: "e1",
                type: "npc",
                x: 5,
                variables: [{ name: "isOpen", type: "flag", initial: false }],
                action: [{ kind: "applyEffects", condition: { type: "variable", scope: "entity", name: "isOpen", equals: false } }],
              },
            ],
          },
          VAR_ACTION_REGISTRY
        )
      )
    );

    // 5) RÉTROCOMPAT — une entité à action UNIQUE (objet, pas tableau) reste
    // structurellement INCHANGÉE.
    const retrocompatLevel = parseLevel(
      {
        id: "movement-check-single-action",
        titleKey: "level.demo.title",
        length: 10,
        playerStart: 0,
        entities: [{ id: "e1", type: "npc", x: 5, action: { kind: "transit", target: "elsewhere" } }],
      },
      VAR_ACTION_REGISTRY
    );
    run("action unique : PAS un tableau (rétrocompat)", false, Array.isArray(retrocompatLevel.entities[0].action));
    run("action unique : kind transporté tel quel", "transit", retrocompatLevel.entities[0].action.kind);

    // 6) LA FENÊTRE — cas de test bout en bout (voir entities/types/
    // window.js pour l'archétype réel, dupliqué ici en dur — ce fichier ne
    // dépend jamais de entities/, voir header).
    const WINDOW_REGISTRY = { window: { label: "entity.window" } };
    const windowRawLevel = {
      id: "movement-check-window",
      titleKey: "level.demo.title",
      length: 10,
      playerStart: 0,
      entities: [
        {
          id: "window-1",
          type: "window",
          x: 5,
          variables: [{ name: "isOpen", type: "flag", initial: false, persistent: false }],
          action: [
            {
              kind: "applyEffects",
              condition: { type: "variable", scope: "entity", name: "isOpen", equals: false },
              refusalKey: "entity.window.refusal",
              sound: "assets/sounds/doors/metal_gate",
              announceKey: "entity.window.opened",
              effects: [{ type: "setVariable", scope: "entity", name: "isOpen", value: true }],
            },
            {
              kind: "applyEffects",
              condition: { type: "variable", scope: "entity", name: "isOpen", equals: true },
              refusalKey: "entity.window.refusal",
              sound: "assets/sounds/doors/metal_gate",
              announceKey: "entity.window.closed",
              effects: [{ type: "setVariable", scope: "entity", name: "isOpen", value: false }],
            },
          ],
        },
      ],
    };
    const windowLevel = parseLevel(windowRawLevel, WINDOW_REGISTRY);
    run("fenêtre : action est un TABLEAU de deux candidates", true, Array.isArray(windowLevel.entities[0].action));
    run("fenêtre : isOpen initial false", false, windowLevel.entities[0].variables.isOpen.value);

    let windowSession = createInitialState(windowLevel, undefined, { companions: [] });

    // Simule "activer l'entité" : sélectionne la candidate qui matche PUIS
    // applique ses effets — exactement le pipeline de
    // view/interaction.js/interact() ("activate"), sans la vue.
    function activateWindow(session) {
      const world = session.worlds[session.activeWorldId];
      const entity = world.entities.find((e) => e.id === "window-1");
      const chosen = selectMatchingAction(entity.action, { entity, world, session });
      if (!chosen) return { session, chosen };
      return { session: applyEntityActionEffects(session, entity.id, chosen.effects), chosen };
    }

    const activation1 = activateWindow(windowSession);
    run("fenêtre : 1ère activation — choisit la candidate OUVRIR", "entity.window.opened", activation1.chosen.announceKey);
    run(
      "fenêtre : 1ère activation — isOpen devient true",
      true,
      activation1.session.worlds[windowLevel.id].entities[0].variables.isOpen.value
    );
    windowSession = activation1.session;

    const activation2 = activateWindow(windowSession);
    run("fenêtre : 2ème activation — choisit la candidate FERMER", "entity.window.closed", activation2.chosen.announceKey);
    run(
      "fenêtre : 2ème activation — isOpen redevient false",
      false,
      activation2.session.worlds[windowLevel.id].entities[0].variables.isOpen.value
    );
    windowSession = activation2.session;

    const activation3 = activateWindow(windowSession);
    run("fenêtre : 3ème activation — alterne de nouveau vers OUVRIR", "entity.window.opened", activation3.chosen.announceKey);
    windowSession = activation3.session;

    // Persistance : isOpen VOLATILE ne survit pas au save/reload — repart
    // FERMÉE même si la fenêtre était ouverte au moment de la sauvegarde
    // (voir core/save.js/resetVolatileInBag).
    run("fenêtre : isOpen ouverte juste avant la sauvegarde (préalable du test)", true, windowSession.worlds[windowLevel.id].entities[0].variables.isOpen.value);
    const windowEnvelope = serializeGame(windowSession);
    const windowReload = deserializeGame(windowEnvelope);
    run("fenêtre : save/load réussit", true, windowReload.success);
    if (windowReload.success) {
      run(
        "fenêtre : isOpen (volatile) repart FERMÉE après rechargement",
        false,
        windowReload.session.worlds[windowLevel.id].entities[0].variables.isOpen.value
      );
    }

    // 7) BONUS — compteur de PARTIE incrémenté par addVariable, lu par une
    // condition greaterThan (chemin entier, portée "party").
    let bonusSession = createInitialState(windowLevel, undefined, {
      companions: [],
      partyVariables: [{ name: "friendship_test", type: "int", initial: 0 }],
    });
    run(
      "bonus : friendship_test greaterThan 3 -> fausse avant incrément",
      false,
      evaluateCondition({ type: "variable", scope: "party", name: "friendship_test", greaterThan: 3 }, { session: bonusSession })
    );
    for (let i = 0; i < 5; i++) {
      bonusSession = applyActionEffects([{ type: "addVariable", scope: "party", name: "friendship_test", amount: 1 }], { session: bonusSession }).session;
    }
    run("bonus : friendship_test vaut 5 après 5 addVariable(+1)", 5, bonusSession.variables.friendship_test.value);
    run(
      "bonus : friendship_test greaterThan 3 -> vraie après incrément (chemin entier condition <- effet)",
      true,
      evaluateCondition({ type: "variable", scope: "party", name: "friendship_test", greaterThan: 3 }, { session: bonusSession })
    );
    const bonusEnvelope = serializeGame(bonusSession);
    const bonusReload = deserializeGame(bonusEnvelope);
    run(
      "bonus : friendship_test (persistante par défaut) survit au save/load",
      5,
      bonusReload.success ? bonusReload.session.variables.friendship_test.value : null
    );

    // 8) Sérialisabilité générique (voir plus haut, auditNonSerializable)
    // sur une session qui exerce RÉELLEMENT les actions multiples + les
    // trois portées de variables.
    const windowLeakFindings = [];
    auditNonSerializable(windowSession, "windowSession", new Set(), windowLeakFindings);
    run("fenêtre : sérialisation — aucune fuite de non-sérialisable", 0, windowLeakFindings.length);
  }

  console.log(`Récapitulatif : ${passed} réussis / ${total} total`);
  return { passed, total };
}
