// Vérifications du core — domaine « new-game ». Départ d'une partie neuve
// (core/new-game.js/parseNewGame, config/new-game.js) : résolution du sac,
// de l'équipement et des compagnons, rejets au chargement, et ce que
// createInitialState en fait. Lancées par core/checks/index.js/runChecks
// (voir ce fichier). Pur : aucun DOM, aucun fetch ; le registre de types est
// une fixture, comme partout dans les vérifications.

import { parseScene } from "../scene.js";
import { createInitialState } from "../state.js";
import { parseNewGame } from "../new-game.js";
import { NEW_GAME } from "../../config/new-game.js";
import { MAX_COMPANIONS } from "../../config/companions.js";
import { throws } from "../../lib/check.js";
import { RAW_SCENE, EMPTY_REGISTRY } from "./helpers.js";

export default function checkNewGame(run) {
  const REGISTRY = {
    dog: {
      nameKey: "entity.dog.name",
      sounds: { movement: { path: "assets/sounds/footsteps/entities/dog_medium_walk", loop: false } },
      blocksMovement: false,
      observable: false,
    },
  };
  const scene = parseScene(RAW_SCENE, EMPTY_REGISTRY);

  // --- Résolution d'un départ complet ---
  const { startSceneId, start } = parseNewGame(
    {
      startSceneId: "demo",
      money: 12,
      bag: [{ type: "apple", count: 3 }, { type: "key_bronze", count: 2 }],
      equipment: { feet: "sneakers" },
      companions: [{ id: "buddy-1", type: "dog", behavior: { kind: "follow" } }],
      partyVariables: [{ name: "met_mayor", type: "flag", initial: false }],
      emotes: ["whistle"],
    },
    REGISTRY
  );
  run("départ : startSceneId transmis", "demo", startSceneId);
  run.same(
    "départ : sac résolu comme par addItem (empilable regroupé, non empilable un par exemplaire)",
    [{ type: "apple", quantity: 3 }, { type: "key_bronze" }, { type: "key_bronze" }],
    start.bag
  );
  run.same("départ : équipement résolu en slots", { feet: { type: "sneakers" } }, start.equipment);
  run("départ : compagnon hérite des sons de son archétype", "assets/sounds/footsteps/entities/dog_medium_walk", start.companions[0].sounds.movement.path);
  run("départ : compagnon hérite des capacités de son archétype", false, start.companions[0].observable);
  run.same("départ : comportement du compagnon validé", { kind: "follow" }, start.companions[0].behavior);

  const session = createInitialState(scene, 1, start);
  run("départ : argent posé", 12, session.money);
  run("départ : compagnon placé près du joueur", scene.playerStart, session.companions[0].x);
  run("départ : variables de partie déclarées", false, session.variables.met_mayor.value);
  run.same("départ : émotes connues posées", { whistle: true }, session.emotes);
  run(
    "départ : objets du sac ET de l'équipement notés acquis, sans liste à la main",
    "apple,key_bronze,sneakers",
    Object.keys(session.acquiredItems).sort().join(",")
  );

  // Défauts : seul startSceneId est requis, le reste part vide.
  const minimal = parseNewGame({ startSceneId: "demo" }, REGISTRY).start;
  run("départ minimal : sac vide", 0, minimal.bag.length);
  run("départ minimal : slots vides", null, minimal.equipment.feet);
  run("départ minimal : aucun compagnon", 0, minimal.companions.length);
  run("départ minimal : argent à 0", 0, minimal.money);
  run.same("départ minimal : aucune émote connue", {}, minimal.emotes);

  // --- Rejets au chargement ---
  const rejected = (raw) => throws(() => parseNewGame({ startSceneId: "demo", ...raw }, REGISTRY));
  run("départ : startSceneId manquant rejeté", true, throws(() => parseNewGame({}, REGISTRY)));
  run("départ : champ inconnu rejeté", true, rejected({ gold: 3 }));
  run("départ : argent négatif rejeté", true, rejected({ money: -1 }));
  run("départ : argent non entier rejeté", true, rejected({ money: 1.5 }));
  run("départ : objet inconnu dans le sac rejeté", true, rejected({ bag: [{ type: "not_an_item" }] }));
  run("départ : count nul rejeté", true, rejected({ bag: [{ type: "apple", count: 0 }] }));
  run("départ : champ inconnu d'une entrée de sac rejeté", true, rejected({ bag: [{ type: "apple", quantity: 2 }] }));
  run("départ : slot inconnu rejeté", true, rejected({ equipment: { head: "sneakers" } }));
  run("départ : objet non équipable rejeté", true, rejected({ equipment: { feet: "apple" } }));
  run("départ : objet inconnu équipé rejeté", true, rejected({ equipment: { feet: "not_an_item" } }));
  run("départ : compagnon avec x rejeté (placé près du joueur)", true, rejected({ companions: [{ id: "c", type: "dog", x: 3 }] }));
  run("départ : compagnon de type inconnu rejeté", true, rejected({ companions: [{ id: "c", type: "unicorn" }] }));
  run(
    "départ : deux compagnons de même id rejetés",
    true,
    rejected({ companions: [{ id: "c", type: "dog" }, { id: "c", type: "dog" }] })
  );
  run("départ : comportement de compagnon invalide rejeté", true, rejected({ companions: [{ id: "c", type: "dog", behavior: { kind: "follow", walkMinMs: 1000 } }] }));
  run(
    "départ : plus de MAX_COMPANIONS compagnons rejeté",
    true,
    rejected({ companions: Array.from({ length: MAX_COMPANIONS + 1 }, (_, i) => ({ id: `c${i}`, type: "dog" })) })
  );
  run("départ : variable de partie invalide rejetée", true, rejected({ partyVariables: [{ name: "x", type: "flag", initial: "oui" }] }));
  run("départ : émote inconnue rejetée", true, rejected({ emotes: ["moonwalk"] }));
  run("départ : émote déclarée deux fois rejetée", true, rejected({ emotes: ["clap", "clap"] }));
  run("départ : émotes hors tableau rejetées", true, rejected({ emotes: "clap" }));
  run(
    "départ : le message dit où chercher",
    true,
    (() => {
      try {
        parseNewGame({ startSceneId: "demo", companions: [{ id: "c", type: "unicorn" }] }, REGISTRY);
      } catch (error) {
        return error.message.startsWith("parseNewGame: companions[0] :");
      }
      return false;
    })()
  );

  // --- Le vrai départ du jeu (config/new-game.js) ---
  // Objets, équipement, argent et forme validés pour de vrai ; les types de
  // compagnons, eux, ne sont connus que du registre de la vue : une fixture
  // vide par type suffit ici (le démarrage du jeu les valide en entier).
  const companionTypes = Object.fromEntries((NEW_GAME.companions ?? []).map((companion) => [companion.type, {}]));
  run("départ du jeu : config/new-game.js est valide", false, throws(() => parseNewGame(NEW_GAME, companionTypes)));
}
