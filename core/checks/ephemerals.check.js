// Vérifications du core — domaine « ephemerals ». Collectible persistant,
// entités éphémères, éparpillement. Lancées par
// core/checks/index.js/runChecks (voir ce fichier). Pur : aucun DOM, aucun
// fetch ; chaque scène est construite en dur via un objet littéral passé à
// parseScene.

import { parseScene } from "../scene.js";
import {
  createInitialState,
  getActiveWorld,
  travelToWorld,
  markConsumed,
  spawnEphemeral,
  spawnScatteredEphemerals,
  drawScatteredPosition,
  BODY_RADIUS,
  applyEntityActionEffects,
} from "../state.js";
import { advanceTick } from "../advance.js";

// Un tick complet, la session seule (voir core/advance.js).
const stepOnce = (session) => advanceTick(session, 0).session;
import { SAVE_VERSION, serializeGame, deserializeGame } from "../save.js";
import { pickupEntity, lootEntity, lootUniqueEntity, lootEntitySpawn } from "../money.js";
import { createSeed } from "../rng.js";
import { MAX_EPHEMERALS } from "../../config/ephemerals.js";
import { TUNING_DEFAULTS } from "../../config/tuning-values.js";

export default function checkEphemerals(run) {
  // --- Collectible persistant (core/state.js/markConsumed, core/money.js/lootEntity) ---
  // Contrairement à removeEntity/pickupEntity ci-dessus, l'entité looté
  // N'EST JAMAIS retirée — voir doc/entity-model.md/"Collectible persistant".

  const CRATE_REGISTRY = { dog: { nameKey: "entity.dog.name" } };
  const crateScene = parseScene(
    {
      id: "movement-check-crate",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 0,
      entities: [
        { id: "crate-1", type: "dog", x: 5, interactable: true, action: { kind: "loot", amount: 100 } },
        { id: "other-1", type: "dog", x: 6 },
      ],
    },
    CRATE_REGISTRY
  );
  const crateState = createInitialState(crateScene);

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
  // piège explicitement visé par ce système (voir doc/entity-model.md).
  run("caisse : lootEntity sur une entité déjà consumed -> aucun second gain", 100, lootEntity(afterLoot, "crate-1", 100).money);
  run("caisse : lootEntity sur une entité déjà consumed -> référence INCHANGÉE", afterLoot, lootEntity(afterLoot, "crate-1", 100));

  // OBJET UNIQUE (troisième forme de "loot", ex. le vieux cadastre) :
  // consumed seul, sans argent ; idempotent comme lootEntity.
  const afterUnique = lootUniqueEntity(crateState, "crate-1");
  run("objet unique : lootUniqueEntity pose consumed:true", true, getActiveWorld(afterUnique).entities.find((e) => e.id === "crate-1").consumed);
  run("objet unique : lootUniqueEntity ne crédite rien", crateState.money, afterUnique.money);
  run("objet unique : déjà consumed -> référence INCHANGÉE", afterUnique, lootUniqueEntity(afterUnique, "crate-1"));
  run("objet unique : id absent -> référence INCHANGÉE", crateState, lootUniqueEntity(crateState, "does-not-exist"));

  // consumedDescriptionKey (core/entity-parse.js/parseEntity) : même cascade
  // instance -> type que descriptionKey.
  const CONSUMED_DESC_REGISTRY = {
    dog: { nameKey: "entity.dog.name", descriptionKey: "entity.dog.description", consumedDescriptionKey: "entity.dog.consumed_description" },
  };
  const consumedDescScene = parseScene(
    {
      id: "movement-check-consumed-desc",
      titleKey: "scene.demo.name",
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
    consumedDescScene.entities.find((e) => e.id === "type-default").consumedDescriptionKey
  );
  run(
    "caisse : consumedDescriptionKey — surcharge d'instance prioritaire",
    "custom.consumed_description",
    consumedDescScene.entities.find((e) => e.id === "instance-override").consumedDescriptionKey
  );

  // Sérialisabilité : consumed (true, pas juste sa valeur par défaut absente)
  // survit à un aller-retour JSON, comme n'importe quel autre champ d'entité
  // (money, ruleActive...) — voir l'audit générique (save.check.js) pour
  // le mécanisme complet.
  const roundTrippedLoot = JSON.parse(JSON.stringify(afterLoot));
  run(
    "caisse : consumed survit à un aller-retour JSON",
    true,
    getActiveWorld(roundTrippedLoot).entities.find((e) => e.id === "crate-1").consumed
  );

  // --- Entités éphémères (core/state.js/spawnEphemeral + purge, core/save.js) ---
  // Voir doc/entity-model.md/"Entités éphémères". Contrairement au collectible
  // persistant ci-dessus, une entité éphémère ne survit JAMAIS — ni à une
  // sauvegarde, ni à une sortie de scène.

  const EPHEMERAL_REGISTRY = { dog: { nameKey: "entity.dog.name" }, door: { nameKey: "entity.door.name" } };
  const ephemeralWorldA = parseScene(
    {
      id: "movement-check-ephemeral-a",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 0,
      entities: [
        { id: "declared-1", type: "dog", x: 3 },
        { id: "door-to-b", type: "door", x: 9 },
      ],
    },
    EPHEMERAL_REGISTRY
  );
  const ephemeralWorldB = parseScene(
    { id: "movement-check-ephemeral-b", titleKey: "scene.demo.name", length: 10, playerStart: 0, entities: [] },
    EPHEMERAL_REGISTRY
  );
  // spec : descripteur DÉJÀ RÉSOLU (voir core/spawn.js/
  // ephemeralArchetypeSpec) — spawnEphemeral ne l'interprète
  // jamais, il ne fait qu'y ajouter id/x/ephemeral.
  const EPHEMERAL_SPEC = { type: "dog", labelKey: "entity.dog.name", interactable: true, action: { kind: "pickup", amount: 5 } };

  const ephemeralState = createInitialState(ephemeralWorldA);
  run("éphémère : monde neuf démarre à nextEphemeralId 0", 0, getActiveWorld(ephemeralState).nextEphemeralId);

  const afterSpawn1 = spawnEphemeral(ephemeralState, EPHEMERAL_SPEC, 4);
  const spawned1 = getActiveWorld(afterSpawn1).entities.find((e) => e.id === "ephemeral-0");
  run("éphémère : spawnEphemeral ajoute une entité marquée ephemeral:true", true, Boolean(spawned1 && spawned1.ephemeral));
  run("éphémère : spawnEphemeral pose x tel que demandé", 4, spawned1 && spawned1.x);
  run("éphémère : spawnEphemeral reporte les champs de spec tels quels", "entity.dog.name", spawned1 && spawned1.labelKey);
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

  // Ramassage : réutilise pickupEntity TEL QUEL (voir inventory.check.js,
  // section "Argent") — aucun traitement spécial à une entité éphémère.
  const afterEphemeralPickup = pickupEntity(afterSpawn2, "ephemeral-0", 5);
  run("éphémère : ramassée via pickupEntity — argent ajouté", 5, afterEphemeralPickup.money);
  run(
    "éphémère : ramassée via pickupEntity — retirée du monde, sans résidu",
    false,
    getActiveWorld(afterEphemeralPickup).entities.some((e) => e.id === "ephemeral-0")
  );

  // Purge au départ (travelToWorld) : un éphémère NON ramassé ne doit JAMAIS
  // survivre à une sortie de scène — voir doc/entity-model.md.
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
  // ephemeralWorldA sort de parseScene : porte déjà defaultSurface/segments
  // (voir core/scene.js) mais PAS rngState/lastVisited/
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
  // Voir doc/entity-model.md/"Spawn déclenché par une action".

  const SCATTER_SPEC = { type: "dog", labelKey: "entity.dog.name", interactable: true, action: { kind: "pickup", amount: 1 } };

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

  const SCATTER_REGISTRY = { dog: { nameKey: "entity.dog.name" }, money: { nameKey: "entity.money.name" } };
  const scatterScene = parseScene(
    {
      id: "movement-check-scatter",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "crate-1", type: "dog", x: 10, interactable: true, action: { kind: "loot", spawn: { spec: { type: "money" }, count: 4, spread: 3 } } },
        { id: "other-1", type: "dog", x: 2 },
      ],
    },
    SCATTER_REGISTRY
  );
  const scatterState = createInitialState(scatterScene, 99);

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
  const scatterStateAgain = createInitialState(scatterScene, 99);
  const scatterResultAgain = spawnScatteredEphemerals(scatterStateAgain, SCATTER_SPEC, 10, 4, 3);
  const scatteredAgain = getActiveWorld(scatterResultAgain)
    .entities.filter((e) => e.ephemeral)
    .map((e) => e.x);
  run.same(
    "scatter : déterminisme — même seed + mêmes paramètres -> mêmes positions",
    scatteredEntities.map((e) => e.x),
    scatteredAgain
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

  checkSpawnEffect(run);
}

// --- Effet d'action "spawn" (core/script-parse.js, core/entity-parse.js/
// resolveSpawnSpecs, core/state.js/applySpawns) : le néon défectueux qui
// éclate et laisse naître le ghosten, sur SA face, à SA position. ---
const SPAWN_REGISTRY = {
  neon: { nameKey: "entity.neon.name" },
  // Un spectre, perceptible seulement en perception surnaturelle.
  ghost: { nameKey: "entity.ghost.name", observable: true, presence: [{ when: { type: "perceptionActive" }, present: true }] },
  rock: { nameKey: "entity.rock.name" },
};

function spawnScene(neonFields, side = "verso") {
  const neon = { id: "neon", type: "neon", x: 12, ...neonFields };
  return {
    id: "spawn-effect-check",
    titleKey: "scene.demo.name",
    length: 20,
    playerStart: 1,
    recto: { entities: side === "recto" ? [neon] : [] },
    verso: { entities: side === "verso" ? [neon] : [] },
  };
}

function checkSpawnEffect(run) {
  const withEffects = (effects, side) => spawnScene({ triggers: [{ on: "hour", effects }] }, side);
  const loads = (effects) => {
    try {
      parseScene(withEffects(effects), SPAWN_REGISTRY);
      return true;
    } catch {
      return false;
    }
  };
  run("spawn : forme valide chargée", true, loads([{ type: "spawn", spec: { type: "ghost", behavior: { kind: "wander" } } }]));
  run("spawn : type inconnu rejeté", false, loads([{ type: "spawn", spec: { type: "wraith" } }]));
  run("spawn : spec sans type rejeté", false, loads([{ type: "spawn", spec: { behavior: { kind: "wander" } } }]));
  run("spawn : id dans le spec rejeté", false, loads([{ type: "spawn", spec: { type: "ghost", id: "g" } }]));
  run("spawn : x dans le spec rejeté", false, loads([{ type: "spawn", spec: { type: "ghost", x: 3 } }]));
  run("spawn : champ inconnu dans le spec rejeté", false, loads([{ type: "spawn", spec: { type: "ghost", colour: "blue" } }]));
  run("spawn : comportement malformé dans le spec rejeté", false, loads([{ type: "spawn", spec: { type: "ghost", behavior: { kind: "moonwalk" } } }]));
  run("spawn : champ inconnu sur l'effet rejeté", false, loads([{ type: "spawn", spec: { type: "ghost" }, count: 2 }]));
  run(
    "spawn : une entité née d'un spawn n'en fait pas naître d'autre",
    false,
    loads([{ type: "spawn", spec: { type: "rock", triggers: [{ on: "hour", effects: [{ type: "spawn", spec: { type: "rock" } }] }] } }])
  );

  // Spec résolu au chargement, comme une instance : nom et présence de
  // l'archétype, comportement de l'instance, ni id ni x.
  const GHOST_SPAWN = { type: "spawn", spec: { type: "ghost", behavior: { kind: "wander" } } };
  const parsed = parseScene(withEffects([GHOST_SPAWN]), SPAWN_REGISTRY);
  const resolved = parsed.verso.entities[0].triggers[0].effects[0].spec;
  run("spawn : spec résolu (nom de l'archétype)", "entity.ghost.name", resolved.labelKey);
  run("spawn : spec résolu (présence de l'archétype)", 1, resolved.presence.length);
  run("spawn : spec résolu (comportement de l'instance)", "wander", resolved.behavior.kind);
  run("spawn : spec sans id ni x", "false,false", ["id" in resolved, "x" in resolved].join(","));

  // Application : l'éclatement à 23 h, joueur au RECTO, néon au VERSO. Le
  // spectre naît au verso, à la position du néon, après 300 ms ; le néon
  // est déjà endormi, la séquence va quand même à son terme.
  const burst = [{ type: "dormantUntil", hour: 22 }, { type: "wait", ms: 300 }, GHOST_SPAWN];
  const scene = parseScene(spawnScene({ triggers: [{ on: "hour", effects: burst }] }), SPAWN_REGISTRY);
  const neonOf = (state) => state.worlds[scene.id].verso.entities[0];
  const ghostsOf = (state, side = "verso") => state.worlds[scene.id][side].entities.filter((e) => e.type === "ghost");
  const start = { ...createInitialState(scene, 4), time: 23 * 60 };
  // Les effets PARSÉS (spec résolu), comme en jeu.
  const fired = applyEntityActionEffects(start, "neon", neonOf(start).triggers[0].effects, "verso");
  run("spawn : rien avant le wait", 0, ghostsOf(fired).length);
  let state = fired;
  for (let i = 0; i < 40 && ghostsOf(state).length === 0; i++) state = stepOnce(state);
  run("spawn : né après l'attente, même endormi", 1, ghostsOf(state).length);
  run("spawn : le néon dort", false, neonOf(state).present);
  const ghost = ghostsOf(state)[0];
  run("spawn : né sur la face de l'entité (verso), pas celle du joueur", 0, ghostsOf(state, "recto").length);
  run("spawn : à la position de l'entité", 12, ghost.x);
  run("spawn : éphémère, avec un id de naissance", "true,true", [ghost.ephemeral, ghost.id.startsWith("ephemeral-")].join(","));
  run("spawn : avec des règles de présence -> naît absent", false, ghost.present);

  // Perception inactive : il reste absent ; activée, son entrée est
  // OBSERVÉE (la vue joue son enterSound).
  const unseen = stepOnce(state);
  run("spawn : perception inactive -> toujours absent, sans bascule", "false,null", [ghostsOf(unseen)[0].present, ghostsOf(unseen)[0].presenceChanged].map(String).join(","));
  const seen = stepOnce({ ...unseen, perceptionActive: true });
  run("spawn : perception activée -> entrée observée", "true,entered", [ghostsOf(seen)[0].present, ghostsOf(seen)[0].presenceChanged].join(","));

  // Sans règle de présence : simplement là, sans champ de présence.
  const rockScene = parseScene(spawnScene({ triggers: [{ on: "hour", effects: [{ type: "spawn", spec: { type: "rock" } }] }] }, "recto"), SPAWN_REGISTRY);
  const rocked = applyEntityActionEffects(createInitialState(rockScene, 4), "neon", [{ type: "spawn", spec: rockScene.recto.entities[0].triggers[0].effects[0].spec }]);
  const rock = rocked.worlds[rockScene.id].recto.entities.find((e) => e.type === "rock");
  run("spawn : sans règle -> né présent (aucun champ present)", false, "present" in rock);

  // Déterminisme et sauvegarde : même partie, même naissance ; l'éphémère
  // ne survit pas à la sauvegarde.
  let replay = fired;
  for (let i = 0; i < 40 && ghostsOf(replay).length === 0; i++) replay = stepOnce(replay);
  run.same("spawn : déterministe", ghostsOf(state), ghostsOf(replay));
  const reload = deserializeGame(serializeGame(state));
  run("spawn : exclu de la sauvegarde", 0, reload.success ? ghostsOf(reload.session).length : -1);
}
