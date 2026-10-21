// Vérifications du core — domaine « scene ». Parsing TOTAL de scène
// (core/scene.js/parseScene). Lancées par core/checks/index.js/runChecks
// (voir ce fichier). Pur : aucun DOM, aucun fetch ; chaque scène est
// construite en dur via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, MOVE_STEP } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { serializeGame, deserializeGame } from "../save.js";
import { DEFAULT_SURFACE, surfaceAt } from "../surfaces.js";
import { NO_COMPANIONS, EMPTY_REGISTRY, expectSceneParseThrows } from "./helpers.js";

export default function checkScene(run) {
  // --- Parsing TOTAL de scène (core/scene.js/parseScene) : l'ABSENCE de
  // tout champ de scène retombe sur un défaut sensé, {} est une scène
  // valide et jouable — voir doc/scene-format.md/"Parsing TOTAL". Seule la
  // PRÉSENCE malformée d'un champ échoue encore (inchangé).
  {
    const emptyScene = parseScene({}, EMPTY_REGISTRY);
    run("parseScene({}) : id -> défaut générique", "scene", emptyScene.id);
    run("parseScene({}) : titleKey -> défaut générique", "scene.default.name", emptyScene.titleKey);
    run("parseScene({}) : length -> défaut minimal traversable (10)", 10, emptyScene.length);
    run("parseScene({}) : playerStart -> 0 (filet existant)", 0, emptyScene.playerStart);
    run("parseScene({}) : entities -> [] (tableau vide)", 0, emptyScene.entities.length);
    run("parseScene({}) : defaultSurface -> DEFAULT_SURFACE", DEFAULT_SURFACE, emptyScene.defaultSurface);
    run("parseScene({}) : segments -> [] (tableau vide)", 0, emptyScene.segments.length);
    run("parseScene({}) : indoor -> false (extérieur)", false, emptyScene.indoor);
    run("parseScene({}) : aucune musique déclarée (silence valide)", undefined, emptyScene.music);

    // Jouable de bout en bout : spawn, déplacement, surface — jamais de
    // lecture sur du undefined, jamais d'exception.
    let emptyState = createInitialState(emptyScene, undefined, NO_COMPANIONS);
    run("parseScene({}) : le joueur apparaît à playerStart (0)", 0, emptyState.player.x);
    emptyState = reduce(emptyState, tick(1));
    emptyState = reduce(emptyState, tick(1));
    run("parseScene({}) : le joueur s'y déplace (2 ticks à droite)", 2 * MOVE_STEP, emptyState.player.x);
    const emptyWorld = getActiveWorld(emptyState);
    run(
      "parseScene({}) : surfaceAt ne plante jamais sur la scène vide",
      DEFAULT_SURFACE,
      surfaceAt(emptyWorld, emptyState.player.x)
    );

    // Clamp à droite : la longueur minimale reste bornée normalement.
    // Largement assez de ticks (MOVE_STEP par tick) pour dépasser length=10.
    let clampState = createInitialState(emptyScene, undefined, NO_COMPANIONS);
    for (let i = 0; i < 500; i++) clampState = reduce(clampState, tick(1));
    run("parseScene({}) : clamp à droite sur la longueur minimale (10)", 10, clampState.player.x);

    // Save/load : aucune exception, aller-retour fidèle.
    const emptySaveEnvelope = serializeGame(emptyState);
    const emptySaveResult = deserializeGame(emptySaveEnvelope);
    run("parseScene({}) : save/load réussit sans exception", true, emptySaveResult.success);
    if (emptySaveResult.success) {
      run.same(
        "parseScene({}) : session rechargée identique après aller-retour",
        emptyState,
        emptySaveResult.session
      );
    }
  }

  // Face recto/verso vide : même filet, partagé via parseFace.
  {
    const emptyTwoFacedScene = parseScene({ recto: {}, verso: {} }, EMPTY_REGISTRY);
    run("parseScene : face recto vide -> entities []", 0, emptyTwoFacedScene.recto.entities.length);
    run("parseScene : face verso vide -> entities []", 0, emptyTwoFacedScene.verso.entities.length);
    run("parseScene : scène à deux faces vides -> length par défaut (10)", 10, emptyTwoFacedScene.length);
  }

  // Chaque champ omis INDIVIDUELLEMENT -> son propre défaut (les autres
  // champs restant fournis, pour isoler l'effet du filet testé).
  run(
    "parseScene : sans defaultSurface -> DEFAULT_SURFACE (filet préexistant)",
    DEFAULT_SURFACE,
    parseScene({ id: "x", titleKey: "scene.demo.name", length: 5, entities: [] }, EMPTY_REGISTRY).defaultSurface
  );
  run(
    "parseScene : sans length -> 10 (filet nouveau)",
    10,
    parseScene({ id: "x", titleKey: "scene.demo.name", entities: [] }, EMPTY_REGISTRY).length
  );
  run(
    "parseScene : sans titleKey -> scene.default.name (filet nouveau)",
    "scene.default.name",
    parseScene({ id: "x", length: 5, entities: [] }, EMPTY_REGISTRY).titleKey
  );
  run(
    "parseScene : sans id -> scene (filet nouveau)",
    "scene",
    parseScene({ titleKey: "scene.demo.name", length: 5, entities: [] }, EMPTY_REGISTRY).id
  );

  // PRÉSENT mais MALFORMÉ -> erreur claire, INCHANGÉ (le défaut ne couvre
  // que l'omission, jamais une valeur fournie invalide).
  run(
    "parseScene : id présent mais vide -> erreur",
    true,
    expectSceneParseThrows({ id: "", titleKey: "scene.demo.name", length: 5, entities: [] }, EMPTY_REGISTRY)
  );
  run(
    "parseScene : titleKey présent mais vide -> erreur",
    true,
    expectSceneParseThrows({ id: "x", titleKey: "", length: 5, entities: [] }, EMPTY_REGISTRY)
  );
  run(
    "parseScene : length présent mais <= 0 -> erreur",
    true,
    expectSceneParseThrows({ id: "x", titleKey: "scene.demo.name", length: 0, entities: [] }, EMPTY_REGISTRY)
  );
  run(
    "parseScene : length présent mais mauvais type -> erreur",
    true,
    expectSceneParseThrows({ id: "x", titleKey: "scene.demo.name", length: "10", entities: [] }, EMPTY_REGISTRY)
  );
  run(
    "parseScene : entities présent mais pas un tableau -> erreur",
    true,
    expectSceneParseThrows({ id: "x", titleKey: "scene.demo.name", length: 5, entities: "oops" }, EMPTY_REGISTRY)
  );
}
