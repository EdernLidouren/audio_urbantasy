// Vérifications du core — domaine « spawn ». Collecte : distribution,
// conteneurs, plages, cycle, issue « rien », tables multiples, conteneur non
// régénérant. Lancées par core/checks/index.js/runChecks (voir ce fichier).
// Pur : aucun DOM, aucun fetch ; chaque scène est construite en dur via un
// objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, travelToWorld, BODY_RADIUS } from "../state.js";
import { serializeGame, deserializeGame } from "../save.js";
import { pickupItemEntity } from "../bag.js";
import { ITEM_REGISTRY } from "../items.js";
import { createSeed } from "../rng.js";
import { TUNING_DEFAULTS } from "../../config/tuning-values.js";
import { INITIAL_TIME, advanceTime } from "../time.js";
import { TIME_CONFIG } from "../../config/time-values.js";
import { validateSpawnTables, validateDistribution, resolveDistribution, drawItem, NOTHING } from "../distribution.js";
import { spawnCycleAt, refillDueSpawns, searchContainer, isSearchable, containerStatus, ephemeralArchetypeSpec, ephemeralItemSpec } from "../spawn.js";
import {
  SPAWN_TABLES,
  SPAWN_RANGE_DEFAULT_COUNT,
  SPAWN_CONTAINER_DEFAULT_COUNT,
  RARITY_LEVELS,
} from "../../config/spawn-values.js";
import { auditNonSerializable, diffStructure, throws, fail } from "../../lib/check.js";

export default function checkSpawn(run) {
  // --- Collecte (core/distribution.js + core/spawn.js) ---
  // Distribution, sources (conteneur/plage), cycle quotidien + file,
  // matérialisation (fouille/pickup), persistance, déterminisme.

  const SPAWN_DAY = TIME_CONFIG.minutesPerHour * TIME_CONFIG.hoursPerDay;

  // Tables et distributions : validation.
  run("collecte : la table standard SPAWN_TABLES est valide", false, throws(() => validateSpawnTables(SPAWN_TABLES)));
  run("collecte : table sans aucun poids positif -> rejetée", true, throws(() => validateSpawnTables({ t: { apple: 0 } })));
  run("collecte : table référençant un objet inconnu -> rejetée", true, throws(() => validateSpawnTables({ t: { nope: 1 } })));
  run("collecte : distribution { table } connue -> acceptée", false, throws(() => validateDistribution({ table: "default" }, "d", fail)));
  run("collecte : distribution { table } inconnue -> rejetée", true, throws(() => validateDistribution({ table: "nope" }, "d", fail)));
  run("collecte : distribution { items } inline -> acceptée", false, throws(() => validateDistribution({ items: { apple: 1 } }, "d", fail)));
  run("collecte : distribution table ET items -> rejetée", true, throws(() => validateDistribution({ table: "default", items: { apple: 1 } }, "d", fail)));
  run.same("collecte : resolveDistribution { table } -> la table standard", SPAWN_TABLES.default, resolveDistribution({ table: "default" }));

  // Rareté : une entrée de table vaut un poids chiffré OU le nom d'un
  // niveau ; une table { fromTag } est déduite de l'étiquette, chaque objet
  // pesant selon sa propre rareté (ITEM_REGISTRY.rarity).
  const rarityWeight = (name) => RARITY_LEVELS.find((level) => level.name === name).weight;
  run(
    "rareté : nom de niveau dans une table -> poids du niveau",
    `${rarityWeight("rare")},7`,
    (({ apple, coin }) => `${apple},${coin}`)(resolveDistribution({ items: { apple: "rare", coin: 7 } }))
  );
  run("rareté : niveau inconnu -> table rejetée", true, throws(() => validateSpawnTables({ t: { apple: "mythic" } })));
  const electronicsWeights = resolveDistribution({ table: "electronics" });
  run(
    "rareté : table fromTag = tous les objets de l'étiquette",
    Object.entries(ITEM_REGISTRY).filter(([, props]) => (props.tags || []).includes("electronic")).length,
    Object.keys(electronicsWeights).length
  );
  run("rareté : table fromTag -> poids selon la rareté de l'objet (resistor, 1)", rarityWeight("common"), electronicsWeights.resistor);
  run("rareté : table fromTag -> poids selon la rareté de l'objet (magic_eye, 5)", rarityWeight("legendary"), electronicsWeights.magic_eye);
  run("rareté : étiquette inconnue -> table rejetée", true, throws(() => validateSpawnTables({ t: { fromTag: "nope" } })));
  run("rareté : objets de l'étiquette sans rareté -> table rejetée", true, throws(() => validateSpawnTables({ t: { fromTag: "chic" } })));
  run("rareté : fromTag mêlé à des entrées -> table rejetée", true, throws(() => validateSpawnTables({ t: { fromTag: "electronic", apple: 1 } })));

  // Tirage pondéré : core/rng.js/pickWeighted (le même que la météo) — équité vérifiée sur
  // une table inline à deux objets 3:1.
  {
    const counts = { apple: 0, key_bronze: 0 };
    let rng = createSeed("spawn-draw");
    for (let i = 0; i < 4000; i++) {
      const d = drawItem({ items: { apple: 3, key_bronze: 1 } }, rng);
      counts[d.item] += 1;
      rng = d.rngState;
    }
    run("collecte : drawItem ne tire que des objets de la table", 4000, counts.apple + counts.key_bronze);
    run("collecte : drawItem respecte les poids (3:1, ±10 %)", true, Math.abs(counts.apple / 4000 - 0.75) < 0.1);
  }

  // Cycle quotidien : index de jour depuis l'origine (SPAWN_CYCLE_HOUR = minuit).
  run("collecte : cycle 0 au départ d'une partie", 0, spawnCycleAt(INITIAL_TIME));
  run("collecte : cycle inchangé juste avant minuit", 0, spawnCycleAt(SPAWN_DAY - 1));
  run("collecte : cycle 1 à minuit", 1, spawnCycleAt(SPAWN_DAY));
  run("collecte : cycle 3 après trois jours", 3, spawnCycleAt(INITIAL_TIME + 3 * SPAWN_DAY));

  // Registre de test : un conteneur (bush) + les archétypes que le moteur
  // instancie au sol (apple dédié, item générique) + un bloqueur.
  const SPAWN_REGISTRY = {
    bush: {
      nameKey: "entity.bush.name",
      sounds: { beacon: { path: "assets/sounds/decor/tree_beacon", loop: true } },
      container: { distribution: { table: "default" } },
      observable: true,
      interactable: true,
      action: { kind: "search" },
    },
    apple: {
      nameKey: "item.apple.name",
      sounds: { beacon: { path: "assets/sounds/items/fruit_beacon", loop: true } },
      interactable: true,
      action: { kind: "pickup", item: "apple", count: 1 },
    },
    item: { nameKey: "entity.item.name", sounds: { beacon: { path: "assets/sounds/items/box_of_nails_beacon", loop: true } }, interactable: true },
    rock: { nameKey: "entity.rock.name", blocksMovement: true },
    dog: { nameKey: "entity.dog.name" },
  };
  const spawnRaw = {
    id: "movement-check-spawn",
    titleKey: "scene.demo.name",
    length: 40,
    playerStart: 2,
    // Distribution INLINE (pas la table standard, dont le contenu peut
    // changer) : exerce à coup sûr les DEUX voies de matérialisation —
    // archétype dédié (apple) et générique item (key_bronze, sans archétype).
    spawnRanges: [{ from: 20, to: 30, count: 4, distribution: { items: { apple: 1, key_bronze: 1 } } }],
    entities: [
      { id: "bush-1", type: "bush", x: 5 },
      { id: "bush-2", type: "bush", x: 8, container: { distribution: { items: { key_bronze: 1 } } } },
      { id: "rock-1", type: "rock", x: 25 },
    ],
  };
  const spawnScene = parseScene(spawnRaw, SPAWN_REGISTRY);
  const spawnSceneB = parseScene({ id: "movement-check-spawn-b", titleKey: "scene.demo.name", length: 10, playerStart: 1, entities: [] }, SPAWN_REGISTRY);

  run("collecte : parseScene porte spawnRanges (count explicite conservé)", 4, spawnScene.spawnRanges[0].count);
  run("collecte : parseScene — container cascadé depuis l'archétype", "default", spawnScene.entities[0].container.distribution.table);
  run("collecte : parseScene — container surchargé à l'instance (inline)", 1, spawnScene.entities[1].container.distribution.items.key_bronze);
  run("collecte : parseScene — une face sans plage ne porte pas spawnRanges", undefined, spawnSceneB.spawnRanges);
  run(
    "collecte : parseScene rejette une plage hors bornes",
    true,
    throws(() => parseScene({ ...spawnRaw, spawnRanges: [{ from: 35, to: 45, distribution: { table: "default" } }] }, SPAWN_REGISTRY))
  );
  run(
    "collecte : parseScene rejette une plage à distribution inconnue",
    true,
    throws(() => parseScene({ ...spawnRaw, spawnRanges: [{ from: 1, to: 2, distribution: { table: "nope" } }] }, SPAWN_REGISTRY))
  );
  run(
    "collecte : parseScene rejette un container sans distribution valide",
    true,
    throws(() => parseScene({ ...spawnRaw, entities: [{ id: "b", type: "bush", x: 1, container: {} }] }, SPAWN_REGISTRY))
  );
  run(
    "collecte : parseScene rejette un container.count non entier >= 1",
    true,
    throws(() => parseScene({ ...spawnRaw, entities: [{ id: "b", type: "bush", x: 1, container: { distribution: { table: "default" }, count: 0 } }] }, SPAWN_REGISTRY))
  );
  run(
    "collecte : parseScene conserve container.count explicite",
    3,
    parseScene({ ...spawnRaw, entities: [{ id: "b", type: "bush", x: 1, container: { distribution: { table: "default" }, count: 3 } }] }, SPAWN_REGISTRY).entities[0].container.count
  );

  // Premier chargement : garnissage (conteneurs stockés, plage posée).
  const spawnFresh = { ...createInitialState(spawnScene), bag: [] };
  const spawnFilled = refillDueSpawns(spawnFresh, SPAWN_REGISTRY);
  const spawnWorld = (s) => s.worlds[spawnScene.id];
  const spawnedOf = (s) => spawnWorld(s).entities.filter((e) => e.spawned);
  run("collecte : refillDueSpawns marque le cycle matérialisé", 0, spawnWorld(spawnFilled).spawnCycle);
  run(
    "collecte : refillDueSpawns stocke chaque conteneur (count par défaut)",
    true,
    spawnWorld(spawnFilled).entities.slice(0, 2).every((e) => Array.isArray(e.stock) && e.stock.length === SPAWN_CONTAINER_DEFAULT_COUNT)
  );
  run("collecte : conteneur à distribution inline -> tire dans SA table", true, spawnWorld(spawnFilled).entities[1].stock.every((i) => i === "key_bronze"));
  run("collecte : conteneur garni -> fouillable (isSearchable)", true, isSearchable(spawnWorld(spawnFilled).entities[0], spawnFilled.time));
  run("collecte : entité sans container -> jamais fouillable", false, isSearchable(spawnWorld(spawnFilled).entities[2], spawnFilled.time));
  run("collecte : conteneur jamais garni (monde neuf) -> fouillable (garnissage paresseux dû)", true, isSearchable(spawnWorld(spawnFresh).entities[0], spawnFresh.time));
  run("collecte : plage -> count collectibles posés", 4, spawnedOf(spawnFilled).length);
  run("collecte : collectibles posés DANS la plage", true, spawnedOf(spawnFilled).every((e) => e.x >= 20 && e.x <= 30));
  run("collecte : collectibles posés hors du corps du bloqueur", true, spawnedOf(spawnFilled).every((e) => Math.abs(e.x - 25) >= BODY_RADIUS));
  run(
    "collecte : collectibles espacés (positions variées, jamais superposées)",
    true,
    spawnedOf(spawnFilled).every((a, i) => spawnedOf(spawnFilled).every((b, j) => i === j || Math.abs(a.x - b.x) >= TUNING_DEFAULTS.spawnMinSpacing))
  );
  run("collecte : collectibles posés portent une action pickup vers le sac", true, spawnedOf(spawnFilled).every((e) => e.action.kind === "pickup" && typeof e.action.item === "string"));
  run("collecte : un objet à archétype dédié (apple) naît sous SON type", true, spawnedOf(spawnFilled).filter((e) => e.action.item === "apple").every((e) => e.type === "apple"));
  run("collecte : un objet sans archétype dédié naît sous le type générique item", true, spawnedOf(spawnFilled).filter((e) => e.action.item === "key_bronze").every((e) => e.type === "item"));
  run("collecte : refillDueSpawns idempotent dans le même cycle (référence INCHANGÉE)", spawnFilled, refillDueSpawns(spawnFilled, SPAWN_REGISTRY));
  run("collecte : refillDueSpawns sur un monde sans source -> référence INCHANGÉE", true, (() => {
    const s = createInitialState(spawnSceneB);
    return refillDueSpawns(s, SPAWN_REGISTRY) === s;
  })());

  // Ramassage au sol : pickupItemEntity existant, l'entité disparaît.
  const spawnFirstGround = spawnedOf(spawnFilled)[0];
  const spawnPicked = pickupItemEntity(spawnFilled, spawnFirstGround.id, spawnFirstGround.action.item, 1);
  run("collecte : ramasser un collectible posé -> objet au sac", spawnFirstGround.action.item, spawnPicked.bag[0].type);
  run("collecte : ramasser un collectible posé -> entité retirée", 3, spawnedOf(spawnPicked).length);

  // Fouille : garni -> le stock TOMBE au sol (éphémères éparpillés autour
  // du conteneur), rien au sac ; le conteneur est noté vidé et n'est PLUS
  // fouillable le même jour (aucun effet, session inchangée).
  const spawnSearch1 = searchContainer(spawnFilled, "bush-1", SPAWN_REGISTRY);
  const spawnDropped = (s) => spawnWorld(s).entities.filter((e) => e.ephemeral);
  run.same("collecte : fouiller un conteneur garni -> les objets du stock tombent", spawnWorld(spawnFilled).entities[0].stock, spawnSearch1.items);
  run("collecte : fouiller -> une entité ÉPHÉMÈRE par objet tombé", spawnSearch1.items.length, spawnDropped(spawnSearch1.session).length);
  run("collecte : fouiller -> objets tombés éparpillés AUTOUR du conteneur", true, spawnDropped(spawnSearch1.session).every((e) => Math.abs(e.x - 5) <= TUNING_DEFAULTS.searchScatterSpread));
  run("collecte : la fouille éparpille moins large que le défaut des éphémères", true, TUNING_DEFAULTS.searchScatterSpread < TUNING_DEFAULTS.ephemeralScatterSpread);
  run("collecte : fouiller -> objets tombés ramassables (action pickup vers le sac)", true, spawnDropped(spawnSearch1.session).every((e) => e.action.kind === "pickup" && spawnSearch1.items.includes(e.action.item)));
  run("collecte : fouiller -> objets tombés jamais marqués spawned (pas un lot de plage)", true, spawnDropped(spawnSearch1.session).every((e) => !e.spawned));
  run("collecte : fouiller -> RIEN au sac directement", 0, spawnSearch1.session.bag.length);
  run("collecte : fouiller -> conteneur noté vidé", null, spawnWorld(spawnSearch1.session).entities[0].stock);
  run("collecte : conteneur vidé -> plus fouillable (isSearchable)", false, isSearchable(spawnWorld(spawnSearch1.session).entities[0], spawnSearch1.session.time));
  run("collecte : conteneur vidé -> toujours observable/interactable (seule la fouille s'éteint)", true, (() => {
    const e = spawnWorld(spawnSearch1.session).entities[0];
    return e.observable === true && e.interactable === true && e.sounds.beacon !== undefined;
  })());
  const spawnSearch2 = searchContainer(spawnSearch1.session, "bush-1", SPAWN_REGISTRY);
  run("collecte : refouiller le même jour -> rien ne tombe", 0, spawnSearch2.items.length);
  run("collecte : refouiller le même jour -> session INCHANGÉE", spawnSearch1.session, spawnSearch2.session);
  run("collecte : ramasser un objet tombé -> au sac, entité retirée", true, (() => {
    const dropped = spawnDropped(spawnSearch1.session)[0];
    const picked = pickupItemEntity(spawnSearch1.session, dropped.id, dropped.action.item, 1);
    return picked.bag[0].type === dropped.action.item && spawnDropped(picked).length === spawnSearch1.items.length - 1;
  })());
  run("collecte : fouiller une entité qui n'est pas un conteneur -> rien, session inchangée", true, (() => {
    const r = searchContainer(spawnSearch2.session, "rock-1", SPAWN_REGISTRY);
    return r.items.length === 0 && r.session === spawnSearch2.session;
  })());

  // Jour suivant SUR PLACE : le conteneur se re-garnit paresseusement à la
  // fouille ; la plage, elle, n'a PAS changé (rien ne se matérialise sous
  // le joueur).
  const spawnNextDayInPlace = advanceTime(spawnSearch2.session, SPAWN_DAY);
  run.same(
    "collecte : joueur présent au passage du cycle -> plage INCHANGÉE (aucun tick ne matérialise)",
    spawnedOf(spawnSearch2.session).map((e) => e.id),
    spawnedOf(spawnNextDayInPlace).map((e) => e.id)
  );
  run("collecte : joueur présent au passage du cycle -> marqueur INCHANGÉ (dû, pas exécuté)", 0, spawnWorld(spawnNextDayInPlace).spawnCycle);
  run("collecte : un jour plus tard sur place -> conteneur vidé redevient fouillable", true, isSearchable(spawnWorld(spawnNextDayInPlace).entities[0], spawnNextDayInPlace.time));
  const spawnSearch3 = searchContainer(spawnNextDayInPlace, "bush-1", SPAWN_REGISTRY);
  run("collecte : un jour plus tard sur place -> la fouille fait tomber un stock neuf", SPAWN_CONTAINER_DEFAULT_COUNT, spawnSearch3.items.length);
  run("collecte : conteneur re-garni note le nouveau cycle", 1, spawnWorld(spawnSearch3.session).entities[0].stockCycle);

  // Quitter puis revenir : la scène est re-garnie (marqueur exécuté au
  // chargement) — anciens collectibles retirés, nouveaux posés, stocks neufs.
  const spawnAway = refillDueSpawns(travelToWorld(spawnNextDayInPlace, spawnSceneB.id, spawnSceneB), SPAWN_REGISTRY);
  const spawnBack = refillDueSpawns(travelToWorld(spawnAway, spawnScene.id), SPAWN_REGISTRY);
  run("collecte : retour dans la scène -> marqueur exécuté (cycle 1)", 1, spawnWorld(spawnBack).spawnCycle);
  run("collecte : retour -> anciens collectibles posés retirés (ids du cycle 0 absents)", false, spawnedOf(spawnBack).some((e) => e.id.startsWith("spawn-0-")));
  run("collecte : retour -> nouveaux collectibles posés (cycle 1)", 4, spawnedOf(spawnBack).filter((e) => e.id.startsWith("spawn-1-")).length);
  run("collecte : retour -> conteneur vidé la veille est re-stocké", true, Array.isArray(spawnWorld(spawnBack).entities[0].stock) && spawnWorld(spawnBack).entities[0].stock.length > 0);
  run("collecte : retour -> les objets tombés (éphémères) n'ont pas survécu au départ", 0, spawnDropped(spawnBack).length);
  run("collecte : retour -> entités déclarées conservées", true, spawnWorld(spawnBack).entities.some((e) => e.id === "rock-1"));

  // Absence longue : plusieurs cycles sans revenir -> UN seul garnissage
  // (écrasement du marqueur, jamais d'accumulation).
  const spawnLongAway = advanceTime(spawnAway, 5 * SPAWN_DAY);
  const spawnLongBack = refillDueSpawns(travelToWorld(spawnLongAway, spawnScene.id), SPAWN_REGISTRY);
  run("collecte : absence de 5 cycles -> marqueur au cycle COURANT (6)", 6, spawnWorld(spawnLongBack).spawnCycle);
  run("collecte : absence de 5 cycles -> UN seul lot de collectibles (pas d'accumulation)", 4, spawnedOf(spawnLongBack).length);
  run("collecte : absence de 5 cycles -> tous du cycle courant", true, spawnedOf(spawnLongBack).every((e) => e.id.startsWith("spawn-6-")));

  // Déterminisme : même seed + même cycle -> même contenu (stocks, objets,
  // positions).
  const spawnDet1 = refillDueSpawns(createInitialState(spawnScene, 5), SPAWN_REGISTRY);
  const spawnDet2 = refillDueSpawns(createInitialState(spawnScene, 5), SPAWN_REGISTRY);
  const spawnSignature = (s) => JSON.stringify(spawnWorld(s).entities.map((e) => [e.id, e.x, e.stock, e.action && e.action.item]));
  run("collecte : déterminisme — même seed + même cycle -> même garnissage", spawnSignature(spawnDet1), spawnSignature(spawnDet2));
  run("collecte : déterminisme — le PRNG de la face a bien avancé (tirages consommés)", true, spawnWorld(spawnFilled).rngState !== spawnWorld(spawnFresh).rngState);

  // Scène à deux faces : LES DEUX faces garnies, marqueur au niveau du monde.
  const spawnTwoSided = parseScene(
    {
      id: "movement-check-spawn-2f",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 1,
      recto: { entities: [{ id: "bush-r", type: "bush", x: 5 }] },
      verso: { spawnRanges: [{ from: 10, to: 18, distribution: { items: { apple: 1 } } }], entities: [] },
    },
    SPAWN_REGISTRY
  );
  const spawnTwoFilled = refillDueSpawns(createInitialState(spawnTwoSided), SPAWN_REGISTRY);
  run("collecte : deux faces — recto (conteneur) garni", true, Array.isArray(spawnTwoFilled.worlds[spawnTwoSided.id].recto.entities[0].stock));
  run("collecte : deux faces — verso (plage) garni avec le count par défaut", SPAWN_RANGE_DEFAULT_COUNT, spawnTwoFilled.worlds[spawnTwoSided.id].verso.entities.filter((e) => e.spawned).length);
  run("collecte : deux faces — marqueur au niveau du monde", 0, spawnTwoFilled.worlds[spawnTwoSided.id].spawnCycle);

  // Persistance : save après fouille + reload -> conteneur toujours vidé,
  // collectibles posés toujours là, marqueur conservé ; audit de
  // sérialisabilité sur l'état de collecte.
  const spawnLeaks = [];
  auditNonSerializable(spawnSearch1.session, "spawnSession", new Set(), spawnLeaks);
  run("collecte : aucune fuite de non-sérialisable (stock/spawned/spawnCycle)", 0, spawnLeaks.length);
  const spawnDiffs = [];
  diffStructure(spawnSearch1.session, JSON.parse(JSON.stringify(spawnSearch1.session)), "spawnSession", spawnDiffs);
  run("collecte : structure identique après round-trip JSON", 0, spawnDiffs.length);
  const spawnReload = deserializeGame(serializeGame(spawnSearch1.session));
  run("collecte : save/load réussit", true, spawnReload.success);
  if (spawnReload.success) {
    const revived = spawnReload.session;
    run("collecte : save/load — conteneur fouillé reste vidé", null, spawnWorld(revived).entities[0].stock);
    run("collecte : save/load — conteneur fouillé reste non fouillable le même jour", false, isSearchable(spawnWorld(revived).entities[0], revived.time));
    run("collecte : save/load — refouiller après reload le même jour -> rien", 0, searchContainer(revived, "bush-1", SPAWN_REGISTRY).items.length);
    run("collecte : save/load — collectibles posés par la plage survivent (pas des éphémères)", 4, spawnedOf(revived).length);
    run("collecte : save/load — objets tombés d'une fouille exclus (éphémères)", 0, spawnDropped(revived).length);
    run("collecte : save/load — marqueur de cycle survit", 0, spawnWorld(revived).spawnCycle);
    run("collecte : save/load — aucun re-garnissage au rechargement dans le même cycle", revived, refillDueSpawns(revived, SPAWN_REGISTRY));
  }

  // --- Collecte : issue "rien" (clé réservée `nothing`), tables multiples,
  // conteneur non régénérant, états d'un conteneur vidé. ---

  // Validation : `nothing` est une entrée pondérée comme une autre, mais
  // une distribution doit pouvoir donner au moins un vrai objet.
  run("rien : table standard avec nothing -> acceptée", false, throws(() => validateSpawnTables({ t: { apple: 1, nothing: 3 } })));
  run("rien : poids de nothing en niveau de rareté -> accepté", false, throws(() => validateDistribution({ items: { apple: 1, nothing: "rare" } }, "d", fail)));
  run("rien : distribution de RIEN seul -> rejetée", true, throws(() => validateDistribution({ items: { nothing: 1 } }, "d", fail)));
  run("rien : nothing à poids nul ne compte pas comme un objet -> rejetée", true, throws(() => validateDistribution({ items: { apple: 0, nothing: 1 } }, "d", fail)));
  run("rien : clé réservée exportée", "nothing", NOTHING);
  run("rien : ITEM_REGISTRY ne déclare jamais la clé réservée", false, Object.hasOwn(ITEM_REGISTRY, NOTHING));

  // Validation des tables multiples.
  const multiOk = { tables: [{ table: "default" }, { items: { nothing: 1 }, weight: 2 }] };
  run("tables : référence + inline (dont une table de rien) -> acceptée", false, throws(() => validateDistribution(multiOk, "d", fail)));
  run("tables : poids de table en niveau de rareté -> accepté", false, throws(() => validateDistribution({ tables: [{ table: "default", weight: "rare" }] }, "d", fail)));
  run("tables : liste vide -> rejetée", true, throws(() => validateDistribution({ tables: [] }, "d", fail)));
  run("tables : pas un tableau -> rejetée", true, throws(() => validateDistribution({ tables: { table: "default" } }, "d", fail)));
  run("tables : mêlée à table/items -> rejetée", true, throws(() => validateDistribution({ tables: [{ table: "default" }], table: "default" }, "d", fail)));
  run("tables : membre table ET items -> rejeté", true, throws(() => validateDistribution({ tables: [{ table: "default", items: { apple: 1 } }] }, "d", fail)));
  run("tables : membre à clé inconnue -> rejeté", true, throws(() => validateDistribution({ tables: [{ table: "default", wieght: 2 }] }, "d", fail)));
  run("tables : membre à table inconnue -> rejeté", true, throws(() => validateDistribution({ tables: [{ table: "nope" }] }, "d", fail)));
  run("tables : poids de membre négatif -> rejeté", true, throws(() => validateDistribution({ tables: [{ table: "default", weight: -1 }] }, "d", fail)));
  run("tables : tous les poids de table nuls -> rejetée", true, throws(() => validateDistribution({ tables: [{ table: "default", weight: 0 }] }, "d", fail)));
  run("tables : que des tables de rien -> rejetée", true, throws(() => validateDistribution({ tables: [{ items: { nothing: 1 } }, { items: { nothing: 5 } }] }, "d", fail)));
  run("tables : table simple à clé inconnue -> rejetée", true, throws(() => validateDistribution({ table: "default", count: 2 }, "d", fail)));

  // Table équivalente : chaque table pèse son poids, réparti selon SES
  // propres poids ; un objet présent dans deux tables cumule ses parts.
  {
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const merged = resolveDistribution({ tables: [{ items: { apple: 3, coin: 1 } }, { items: { apple: 1, nothing: 1 } }] });
    run("tables : doublon cumulé (pomme : 1/2 × 3/4 + 1/2 × 1/2)", true, near(merged.apple, 0.625));
    run("tables : objet d'une seule table (pièce : 1/2 × 1/4)", true, near(merged.coin, 0.125));
    run("tables : rien (1/2 × 1/2)", true, near(merged.nothing, 0.25));
    const scales = resolveDistribution({ tables: [{ items: { apple: 1000 } }, { items: { coin: 1 } }] });
    run("tables : échelles indépendantes (poids 1000 vs 1 -> moitié/moitié)", true, near(scales.apple, 0.5) && near(scales.coin, 0.5));
    const weighted = resolveDistribution({ tables: [{ items: { apple: 1 }, weight: 3 }, { items: { coin: 1 } }] });
    run("tables : poids de table (3 contre 1 par défaut)", true, near(weighted.apple, 0.75) && near(weighted.coin, 0.25));
    run.same("tables : forme simple inchangée (poids bruts)", { apple: 80, coin: 20 }, resolveDistribution({ items: { apple: 80, coin: 20 } }));
  }

  // Tirage : `nothing` donne null, et consomme quand même son pas de PRNG.
  {
    let rng = createSeed("spawn-nothing");
    let nothingCount = 0;
    let advancedEveryTime = true;
    for (let i = 0; i < 4000; i++) {
      const d = drawItem({ items: { apple: 1, nothing: 3 } }, rng);
      if (d.item === null) nothingCount += 1;
      else if (d.item !== "apple") advancedEveryTime = false;
      if (d.rngState === rng) advancedEveryTime = false;
      rng = d.rngState;
    }
    run("rien : drawItem -> null pour nothing (3:1, ±10 %)", true, Math.abs(nothingCount / 4000 - 0.75) < 0.1);
    run("rien : chaque tirage avance le PRNG, même sur nothing", true, advancedEveryTime);
    rng = createSeed("spawn-multi");
    let apples = 0;
    for (let i = 0; i < 4000; i++) {
      const d = drawItem({ tables: [{ items: { apple: 3, coin: 1 } }, { items: { apple: 1, nothing: 1 } }] }, rng);
      if (d.item === "apple") apples += 1;
      rng = d.rngState;
    }
    run("tables : drawItem respecte la table équivalente (pomme 62,5 %, ±5 %)", true, Math.abs(apples / 4000 - 0.625) < 0.05);
  }

  // Conteneurs : "rien" possible, non régénérant, états d'un conteneur vidé.
  const ALMOST_ONLY_NOTHING = { items: { apple: 1, nothing: 1e9 } };
  const nothingRaw = {
    id: "movement-check-nothing",
    titleKey: "scene.demo.name",
    length: 40,
    playerStart: 2,
    spawnRanges: [{ from: 20, to: 30, count: 5, distribution: ALMOST_ONLY_NOTHING }],
    entities: [
      { id: "box", type: "bush", x: 5, container: { distribution: ALMOST_ONLY_NOTHING, count: 3 } },
      { id: "pc", type: "bush", x: 10, container: { distribution: { items: { key_bronze: 1 } }, count: 2, regenerates: false } },
      { id: "bush", type: "bush", x: 15 },
    ],
  };
  const nothingScene = parseScene(nothingRaw, SPAWN_REGISTRY);
  const nothingWorld = (s) => s.worlds[nothingScene.id];
  const nothingEntity = (s, id) => nothingWorld(s).entities.find((e) => e.id === id);
  run("non régénérant : parseScene conserve regenerates: false", false, nothingEntity({ worlds: { [nothingScene.id]: nothingScene } }, "pc").container.regenerates);
  run("non régénérant : regenerates: true n'est pas stocké (sparse)", undefined, parseScene({ ...nothingRaw, entities: [{ id: "b", type: "bush", x: 1, container: { distribution: { table: "default" }, regenerates: true } }] }, SPAWN_REGISTRY).entities[0].container.regenerates);
  run("non régénérant : regenerates non booléen -> rejeté", true, throws(() => parseScene({ ...nothingRaw, entities: [{ id: "b", type: "bush", x: 1, container: { distribution: { table: "default" }, regenerates: "no" } }] }, SPAWN_REGISTRY)));
  run("conteneur : clé inconnue -> rejetée", true, throws(() => parseScene({ ...nothingRaw, entities: [{ id: "b", type: "bush", x: 1, container: { distribution: { table: "default" }, regen: false } }] }, SPAWN_REGISTRY)));
  run("tables : parseScene accepte un container { tables }", false, throws(() => parseScene({ ...nothingRaw, entities: [{ id: "b", type: "bush", x: 1, container: { distribution: multiOk } }] }, SPAWN_REGISTRY)));

  const nothingFilled = refillDueSpawns({ ...createInitialState(nothingScene), bag: [] }, SPAWN_REGISTRY);
  run("rien : plage dont tous les tirages tombent sur rien -> aucun collectible posé", 0, nothingWorld(nothingFilled).entities.filter((e) => e.spawned).length);
  run("rien : conteneur dont tous les tirages tombent sur rien -> stock vide", 0, nothingEntity(nothingFilled, "box").stock.length);
  run("rien : stock vide du cycle -> état searchable (il reste à fouiller)", "searchable", containerStatus(nothingEntity(nothingFilled, "box"), nothingFilled.time));
  const nothingSearch = searchContainer(nothingFilled, "box", SPAWN_REGISTRY);
  run("rien : fouille d'un stock vide -> fouille faite (status searchable), rien ne tombe", "searchable/0", `${nothingSearch.status}/${nothingSearch.items.length}`);
  run("rien : après la fouille -> searchedToday", "searchedToday", containerStatus(nothingEntity(nothingSearch.session, "box"), nothingSearch.session.time));

  // Conteneur régénérant vidé : status searchedToday, session inchangée.
  const bushSearch = searchContainer(nothingSearch.session, "bush", SPAWN_REGISTRY);
  const bushAgain = searchContainer(bushSearch.session, "bush", SPAWN_REGISTRY);
  run("régénérant : refouiller le même jour -> status searchedToday", "searchedToday", bushAgain.status);
  run("régénérant : refouiller le même jour -> session inchangée", bushSearch.session, bushAgain.session);
  run("conteneur : searchContainer sur un id absent -> status null", null, searchContainer(bushSearch.session, "nope", SPAWN_REGISTRY).status);
  run("conteneur : containerStatus d'une entité sans container -> null", null, containerStatus({ id: "x" }, 0));

  // Non régénérant : garni une fois, vidé pour de bon.
  run("non régénérant : garni au premier chargement", 2, nothingEntity(nothingFilled, "pc").stock.length);
  const pcSearch = searchContainer(bushSearch.session, "pc", SPAWN_REGISTRY);
  run("non régénérant : la fouille fait tomber son stock", 2, pcSearch.items.length);
  run("non régénérant : vidé -> depleted", "depleted", containerStatus(nothingEntity(pcSearch.session, "pc"), pcSearch.session.time));
  const pcAgain = searchContainer(pcSearch.session, "pc", SPAWN_REGISTRY);
  run("non régénérant : refouiller -> status depleted, session inchangée", true, pcAgain.status === "depleted" && pcAgain.session === pcSearch.session);
  const pcNextDay = advanceTime(pcSearch.session, SPAWN_DAY);
  run("non régénérant : un jour plus tard sur place -> toujours depleted", "depleted", containerStatus(nothingEntity(pcNextDay, "pc"), pcNextDay.time));
  run("non régénérant : un jour plus tard sur place -> la fouille ne tire rien", 0, searchContainer(pcNextDay, "pc", SPAWN_REGISTRY).items.length);
  run("régénérant : un jour plus tard sur place -> de nouveau searchable", "searchable", containerStatus(nothingEntity(pcNextDay, "bush"), pcNextDay.time));
  const pcAway = refillDueSpawns(travelToWorld(pcNextDay, spawnSceneB.id, spawnSceneB), SPAWN_REGISTRY);
  const pcBack = refillDueSpawns(travelToWorld(advanceTime(pcAway, SPAWN_DAY), nothingScene.id), SPAWN_REGISTRY);
  run("non régénérant : regarnissage de la scène -> reste vidé (stock null, cycle d'origine)", "null/0", `${nothingEntity(pcBack, "pc").stock}/${nothingEntity(pcBack, "pc").stockCycle}`);
  run("régénérant : regarnissage de la scène -> restocké au cycle courant", 2, nothingEntity(pcBack, "bush").stockCycle);

  // Non régénérant jamais fouillé : son stock d'origine est GARDÉ (jamais
  // retiré), même plusieurs cycles plus tard.
  const pcUntouchedAway = refillDueSpawns(travelToWorld(nothingFilled, spawnSceneB.id, spawnSceneB), SPAWN_REGISTRY);
  const pcUntouchedBack = refillDueSpawns(travelToWorld(advanceTime(pcUntouchedAway, 3 * SPAWN_DAY), nothingScene.id), SPAWN_REGISTRY);
  run.same("non régénérant : jamais fouillé -> même stock plusieurs cycles plus tard", nothingEntity(nothingFilled, "pc").stock, nothingEntity(pcUntouchedBack, "pc").stock);
  run("non régénérant : jamais fouillé -> toujours searchable", "searchable", containerStatus(nothingEntity(pcUntouchedBack, "pc"), pcUntouchedBack.time));

  // Persistance : un conteneur vidé pour de bon le reste après save/load.
  const pcReload = deserializeGame(serializeGame(pcSearch.session));
  run("non régénérant : save/load -> toujours depleted", "depleted", pcReload.success && containerStatus(nothingEntity(pcReload.session, "pc"), pcReload.session.time));

  // --- Descripteurs d'éphémères demandés par la vue (ephemeralArchetypeSpec,
  // ephemeralItemSpec) : même parseur et même résolution que la collecte. ---
  const specSession = createInitialState(spawnScene);
  const SPEC_REGISTRY = { ...SPAWN_REGISTRY, money: { nameKey: "entity.money.name", interactable: true, action: { kind: "pickup", amount: 5 } } };

  const coinSpec = ephemeralArchetypeSpec(specSession, "money", SPEC_REGISTRY);
  run("spec éphémère : archétype sans surcharge -> action de l'archétype", 5, coinSpec.action.amount);
  run("spec éphémère : passe par le parseur (capacités résolues)", "true/false", `${coinSpec.interactable}/${coinSpec.blocksMovement}`);
  run("spec éphémère : amount remplace ce seul champ", "pickup/20", (({ kind, amount }) => `${kind}/${amount}`)(ephemeralArchetypeSpec(specSession, "money", SPEC_REGISTRY, { amount: 20 }).action));
  run("spec éphémère : archétype sans action -> aucune action", false, "action" in ephemeralArchetypeSpec(specSession, "dog", SPEC_REGISTRY));

  const droppedApple = ephemeralItemSpec(specSession, "apple", 3, SPEC_REGISTRY);
  run("objet posé : archétype dédié -> son type, count remplacé", "apple/apple/3", `${droppedApple.type}/${droppedApple.action.item}/${droppedApple.action.count}`);
  const droppedResistor = ephemeralItemSpec(specSession, "resistor", 4, SPEC_REGISTRY);
  run("objet posé : sans archétype -> type générique item", "item", droppedResistor.type);
  run("objet posé : générique -> nom et description de l'objet", `${ITEM_REGISTRY.resistor.label}|${ITEM_REGISTRY.resistor.descriptionKey}`, `${droppedResistor.labelKey}|${droppedResistor.descriptionKey}`);
  run("objet posé : générique -> son de l'objet en balise", ITEM_REGISTRY.resistor.sound, droppedResistor.sounds.beacon.path);
  run("objet posé : générique -> action pickup de l'objet avec la quantité", "pickup/resistor/4", (({ kind, item, count }) => `${kind}/${item}/${count}`)(droppedResistor.action));

  // Un objet posé et un objet tombé d'une fouille sont le même descripteur
  // (hors id/x/count) : une seule résolution.
  const searchedResistor = searchContainer(
    {
      ...specSession,
      worlds: {
        ...specSession.worlds,
        [specSession.activeWorldId]: {
          ...specSession.worlds[specSession.activeWorldId],
          entities: specSession.worlds[specSession.activeWorldId].entities.map((e) => (e.id === "bush-2" ? { ...e, stock: ["resistor"], stockCycle: spawnCycleAt(specSession.time) } : e)),
        },
      },
    },
    "bush-2",
    SPEC_REGISTRY
  );
  const fallenResistor = searchedResistor.session.worlds[specSession.activeWorldId].entities.find((e) => e.ephemeral);
  const withoutPlacement = ({ id, x, ephemeral, action, ...rest }) => ({ ...rest, action: { ...action, count: 0 } });
  run.same("objet posé = objet tombé d'une fouille (hors id/x/quantité)", withoutPlacement(droppedResistor), fallenResistor && withoutPlacement(fallenResistor));
}
