// Vérifications du core — domaine « mining ». Minage : forme du champ
// `mineable`, résistance tirée au premier coup, destruction et objets
// tombés, déterminisme, persistance. Lancées par core/checks/index.js/
// runChecks (voir ce fichier). Pur : aucun DOM, aucun fetch ; la scène est
// construite en dur via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState } from "../state.js";
import { serializeGame, deserializeGame } from "../save.js";
import { mineEntity } from "../mining.js";
import { resolveDistribution } from "../distribution.js";
import { ACTION_KINDS } from "../action-kinds.js";
import { TUNING_DEFAULTS } from "../../config/tuning-values.js";
import { SPAWN_TABLES } from "../../config/spawn-values.js";
import { ITEM_REGISTRY } from "../items.js";
import { auditNonSerializable, throws } from "../../lib/check.js";

export default function checkMining(run) {
  const MINING_REGISTRY = {
    boulder: {
      nameKey: "entity.boulder.name",
      sounds: { beacon: { path: "assets/sounds/decor/boulder_1_beacon", loop: true } },
      mineable: { distribution: { items: { granite: 1 } }, hits: { min: 2, max: 4 }, count: { min: 1, max: 3 } },
      observable: true,
      interactable: true,
      action: { kind: "mine" },
    },
    item: { nameKey: "entity.item.name", sounds: { beacon: { path: "assets/sounds/items/box_of_nails_beacon", loop: true } }, interactable: true },
    dog: { nameKey: "entity.dog.name" },
  };
  const miningRaw = {
    id: "mining-check",
    titleKey: "scene.demo.name",
    length: 40,
    playerStart: 2,
    entities: [
      { id: "boulder-1", type: "boulder", x: 10 },
      // Une seule frappe suffit, et (sauf tirage d'un sur un million,
      // déterministe ici) rien ne tombe : la destruction sans butin. Une
      // table qui ne donne JAMAIS rien est refusée au chargement.
      { id: "boulder-2", type: "boulder", x: 20, mineable: { distribution: { items: { nothing: 1000000, granite: 1 } }, hits: 1 } },
      { id: "dog-1", type: "dog", x: 30 },
    ],
  };
  const parse = (entities) => parseScene({ ...miningRaw, entities }, MINING_REGISTRY);
  const miningScene = parseScene(miningRaw, MINING_REGISTRY);
  const worldOf = (s) => s.worlds[miningScene.id];
  const entityOf = (s, id) => worldOf(s).entities.find((e) => e.id === id);

  // Forme : fourchettes normalisées, cascade, refus.
  run.same("minage : parseScene — mineable cascadé depuis l'archétype", { min: 2, max: 4 }, miningScene.entities[0].mineable.hits);
  run.same("minage : un entier seul vaut une fourchette min = max", { min: 1, max: 1 }, miningScene.entities[1].mineable.hits);
  run.same("minage : count absent -> un seul tirage", { min: 1, max: 1 }, miningScene.entities[1].mineable.count);
  run("minage : mineable sans hits -> rejeté", true, throws(() => parse([{ id: "b", type: "dog", x: 1, mineable: { distribution: { items: { granite: 1 } } } }])));
  run("minage : hits.min > hits.max -> rejeté", true, throws(() => parse([{ id: "b", type: "boulder", x: 1, mineable: { distribution: { items: { granite: 1 } }, hits: { min: 3, max: 2 } } }])));
  run("minage : hits à 0 -> rejeté", true, throws(() => parse([{ id: "b", type: "boulder", x: 1, mineable: { distribution: { items: { granite: 1 } }, hits: 0 } }])));
  run("minage : distribution inconnue -> rejetée", true, throws(() => parse([{ id: "b", type: "boulder", x: 1, mineable: { distribution: { table: "nope" }, hits: 1 } }])));
  run("minage : champ inconnu -> rejeté", true, throws(() => parse([{ id: "b", type: "boulder", x: 1, mineable: { distribution: { items: { granite: 1 } }, hits: 1, hp: 2 } }])));
  run("minage : action mine sans mineable -> rejetée", true, throws(() => parse([{ id: "b", type: "dog", x: 1, interactable: true, action: { kind: "mine" } }])));
  run("minage : le kind mine exige mineable", "mineable", ACTION_KINDS.mine.requires);

  // Coups : la résistance est tirée au PREMIER coup, puis décomptée.
  const fresh = createInitialState(miningScene);
  run("minage : entité jamais frappée -> aucune résistance notée", undefined, entityOf(fresh, "boulder-1").hitsLeft);
  const first = mineEntity(fresh, "boulder-1", MINING_REGISTRY);
  run("minage : premier coup sur une résistance >= 2 -> hit", "hit", first.status);
  run("minage : premier coup -> résistance tirée dans la fourchette, moins un", true, (() => {
    const left = entityOf(first.session, "boulder-1").hitsLeft;
    return Number.isInteger(left) && left >= 1 && left <= 3;
  })());
  run("minage : un coup consomme le PRNG de la face", true, worldOf(first.session).rngState !== worldOf(fresh).rngState);
  run("minage : déterministe — même état, même coup -> même résistance", entityOf(first.session, "boulder-1").hitsLeft, entityOf(mineEntity(fresh, "boulder-1", MINING_REGISTRY).session, "boulder-1").hitsLeft);

  // Jusqu'à la destruction : exactement `hitsLeft` coups de plus.
  let session = first.session;
  let result = first;
  const expected = entityOf(first.session, "boulder-1").hitsLeft;
  let strikes = 0;
  while (result.status === "hit" && strikes < 10) {
    result = mineEntity(session, "boulder-1", MINING_REGISTRY);
    session = result.session;
    strikes += 1;
  }
  run("minage : détruite au bout de la résistance tirée", expected, strikes);
  run("minage : dernier coup -> broken", "broken", result.status);
  run("minage : entité détruite -> retirée du monde", undefined, entityOf(session, "boulder-1"));
  const dropped = worldOf(session).entities.filter((e) => e.ephemeral);
  run("minage : objets tombés dans la fourchette count", true, result.items.length >= 1 && result.items.length <= 3);
  run("minage : une entité ÉPHÉMÈRE par objet tombé", result.items.length, dropped.length);
  run("minage : objets tombés ramassables (pickup vers le sac)", true, dropped.every((e) => e.action.kind === "pickup" && e.action.item === "granite"));
  run("minage : objets éparpillés autour de l'entité détruite", true, dropped.every((e) => Math.abs(e.x - 10) <= TUNING_DEFAULTS.mineScatterSpread));
  run("minage : rien au sac directement", 0, session.bag.length);

  // Une issue "nothing" : brisée, rien ne tombe.
  const empty = mineEntity(fresh, "boulder-2", MINING_REGISTRY);
  run("minage : résistance 1 -> brisée au premier coup", "broken", empty.status);
  run("minage : tirage nothing -> rien ne tombe", 0, empty.items.length);
  run("minage : brisée sans butin -> retirée quand même", undefined, entityOf(empty.session, "boulder-2"));

  // Hors de propos : session inchangée.
  run("minage : entité non minable -> status null", null, mineEntity(fresh, "dog-1", MINING_REGISTRY).status);
  run("minage : entité non minable -> session INCHANGÉE", fresh, mineEntity(fresh, "dog-1", MINING_REGISTRY).session);
  run("minage : id absent -> session INCHANGÉE", fresh, mineEntity(fresh, "nope", MINING_REGISTRY).session);

  // Persistance : la résistance entamée survit à la sauvegarde.
  const leaks = [];
  auditNonSerializable(first.session, "miningSession", new Set(), leaks);
  run("minage : aucune fuite de non-sérialisable", 0, leaks.length);
  const reload = deserializeGame(serializeGame(first.session));
  run("minage : save/load réussit", true, reload.success);
  if (reload.success) {
    run("minage : save/load — résistance entamée conservée", entityOf(first.session, "boulder-1").hitsLeft, entityOf(reload.session, "boulder-1").hitsLeft);
  }
  const reloadBroken = deserializeGame(serializeGame(session));
  run("minage : save/load — entité détruite reste détruite", undefined, reloadBroken.success ? entityOf(reloadBroken.session, "boulder-1") : null);

  // Tables de minage (config/spawn-values.js) : chaque minéral pèse selon
  // SA rareté de collection, et le fond commun ne recoupe aucune table.
  const rarityName = ["common", "uncommon", "rare", "epic", "legendary"];
  for (const table of ["mining_common", "boulder", "ore_vein", "geode"]) {
    run(
      `minage : table ${table} — chaque minéral pondéré par sa rareté`,
      "",
      Object.entries(SPAWN_TABLES[table])
        .filter(([item, weight]) => ITEM_REGISTRY[item]?.rarity === undefined || rarityName[ITEM_REGISTRY[item].rarity - 1] !== weight)
        .map(([item]) => item)
        .join(",")
    );
    if (table !== "mining_common") {
      run(`minage : table ${table} — aucun recoupement avec le fond commun`, "", Object.keys(resolveDistribution({ table })).filter((item) => item in SPAWN_TABLES.mining_common).join(","));
    }
  }
}
