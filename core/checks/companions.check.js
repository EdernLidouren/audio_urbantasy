// Vérifications du core — domaine « companions ». Compagnons :
// infrastructure, voyage avec la partie, robustesse. Lancées par
// core/checks/index.js/runChecks (voir ce fichier). Pur : aucun DOM, aucun
// fetch ; chaque scène est construite en dur via un objet littéral passé à
// parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, travelToWorld, addCompanion, applyCompanionActionEffects } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { MAX_COMPANIONS } from "../../config/companions.js";
import { parseNewGame } from "../new-game.js";
import { WANDER_REGISTRY, makeWanderScene, runTicks } from "./helpers.js";

export default function checkCompanions(run) {
  // Fixtures partagées avec d'autres domaines (voir ./helpers.js).
  const wanderScene = parseScene(makeWanderScene(), WANDER_REGISTRY);

  // --- Compagnons : infrastructure — persistance, injection, traversée
  // (voir core/state.js) ---

  const COMPANION_REGISTRY = { dog: { nameKey: "entity.dog.name" }, npc: { nameKey: "entity.npc.name" } };
  const companionScene = parseScene(
    {
      id: "movement-check-companion-a",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 5,
      entities: [{ id: "npc-a", type: "npc", x: 15 }],
    },
    COMPANION_REGISTRY
  );

  // Sans départ : aucun compagnon.
  run("compagnons : partie sans départ -> aucun compagnon", 0, createInitialState(companionScene, 1).companions.length);

  // Départ avec UN compagnon "follow", déclaré comme dans
  // config/new-game.js et résolu par le vrai parseNewGame.
  const COMPANION_START = parseNewGame(
    { startSceneId: "check", companions: [{ id: "companion-test-dog", type: "dog", behavior: { kind: "follow" } }] },
    COMPANION_REGISTRY
  ).start;
  let companionState = createInitialState(companionScene, 1, COMPANION_START);
  run("compagnons : le compagnon du départ est présent", 1, companionState.companions.length);
  run("compagnons : nom hérité de son archétype", "entity.dog.name", companionState.companions[0].labelKey);
  run("compagnons : positionné près du joueur à la création", companionScene.playerStart, companionState.companions[0].x);

  // Injection à la LECTURE (voir core/state.js/getActiveWorld) : présent
  // dans le flux d'entités du monde actif (compagnon + npc-a, l'entité
  // native) — mais ABSENT du monde BRUT stocké (session.worlds[...]
  // .entities), qui ne contient QUE npc-a. C'est tout le mécanisme :
  // stocké dans le cercle partie, injecté pour être rendu/tické.
  run("compagnons : injecté dans le flux d'entités du monde actif (native + compagnon)", 2, getActiveWorld(companionState).entities.length);
  run("compagnons : ABSENT du monde brut stocké (pas persisté avec le monde)", 1, companionState.worlds[companionScene.id].entities.length);

  // Comportement "follow" (voir core/behaviors/follow.js) : co-localisé
  // avec le joueur à la création (distance 0 < minDistance) -> reste
  // immobile tant que le joueur ne s'éloigne pas — contrairement à wander,
  // rien de spontané.
  for (let i = 0; i < 10; i++) companionState = reduce(companionState, tick(0));
  run(
    "compagnons : ne bouge pas tant que le joueur reste proche (zone morte)",
    companionScene.playerStart,
    companionState.companions[0].x
  );

  // Le joueur s'éloigne (tick(1)) : une fois hors de maxDistance, le
  // compagnon suit.
  for (let i = 0; i < 200; i++) companionState = reduce(companionState, tick(1));
  run(
    "compagnons : suit le joueur une fois hors de la zone morte (comportement follow)",
    true,
    companionState.companions[0].x !== companionScene.playerStart
  );

  // PRNG séparé (companionsRngState) : la présence d'un compagnon ne change
  // RIEN à la trajectoire d'une entité DU MONDE (comparaison directe,
  // réutilise wanderScene/runTicks, fixtures partagées de ./helpers.js) — sinon, deux
  // suites de tirages partageant le même flux se marcheraient dessus, et le
  // comportement d'une entité existante dépendrait silencieusement de la
  // présence ou non d'un compagnon.
  run.same(
    "compagnons : n'affecte pas la trajectoire d'une entité du monde (PRNG séparés)",
    runTicks(createInitialState(wanderScene, 42), 50).positions,
    runTicks(createInitialState(wanderScene, 42, COMPANION_START), 50).positions
  );

  // MAX_COMPANIONS : la liste ne dépasse jamais cette limite, même fournie
  // en surnombre explicitement (ex. futur système de recrutement).
  const tooManyCompanions = Array.from({ length: MAX_COMPANIONS + 3 }, (_, i) => ({
    id: `extra-companion-${i}`,
    type: "dog",
    labelKey: "entity.dog.name",
    blocksMovement: false,
    x: 0,
    dir: 1,
  }));
  const cappedState = createInitialState(companionScene, 1, { companions: tooManyCompanions });
  run("compagnons : la liste ne dépasse jamais MAX_COMPANIONS", MAX_COMPANIONS, cappedState.companions.length);

  // --- Compagnons : traversée d'un monde à l'autre avec la partie ---

  const companionWorldB = parseScene(
    { id: "movement-check-companion-b", titleKey: "scene.demo.name", length: 12, playerStart: 3, entities: [] },
    COMPANION_REGISTRY
  );

  let companionPartie = createInitialState(companionScene, 1, COMPANION_START);
  // Le joueur avance, le compagnon (follow) le suit : garantit qu'il ne se
  // retrouve pas "par coïncidence" déjà à la position attendue après la
  // transition (contrairement à wander, il ne bouge jamais
  // spontanément — il faut faire bouger sa cible pour l'entraîner).
  for (let i = 0; i < 200; i++) companionPartie = reduce(companionPartie, tick(1));
  const companionXBeforeLeaving = companionPartie.companions[0].x;

  companionPartie = travelToWorld(companionPartie, companionWorldB.id, companionWorldB);

  run(
    "compagnons : réapparaît dans le nouveau monde, repositionné près du joueur",
    companionWorldB.playerStart,
    companionPartie.companions[0].x
  );
  run(
    "compagnons : a RÉELLEMENT traversé (position différente d'avant le départ)",
    true,
    companionPartie.companions[0].x !== companionXBeforeLeaving
  );
  run(
    "compagnons : flux d'entités du nouveau monde = natives (0) + compagnons (1), rien de plus",
    1,
    getActiveWorld(companionPartie).entities.length
  );
  run(
    "compagnons : jamais en double (un seul compagnon dans le nouveau monde)",
    1,
    getActiveWorld(companionPartie).entities.filter((e) => e.id === "companion-test-dog").length
  );
  run(
    "compagnons : PAS de résidu dans l'ancien monde (monde brut A, toujours sa seule entité native)",
    1,
    companionPartie.worlds[companionScene.id].entities.length
  );

  // Retour au monde de départ : de nouveau repositionné près du joueur — pas
  // laissé où il avait fini de suivre avant le premier départ (il n'a pas
  // d'état "de monde" à restaurer, contrairement à un PNJ rangé dans un monde).
  companionPartie = travelToWorld(companionPartie, companionScene.id);
  run(
    "compagnons : re-visite -> repositionné près du joueur, pas resté où il suivait",
    companionScene.playerStart,
    companionPartie.companions[0].x
  );
  run("compagnons : toujours pas de résidu dans le monde B quitté", 0, companionPartie.worlds[companionWorldB.id].entities.length);

  // --- Compagnons : robustesse ---
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

  // --- Effets d'action d'un compagnon : les champs de PARTIE écrits par
  // ses effets (variable "party", amélioration, émote) sont tous repris
  // dans la session, comme pour une entité (core/state.js/
  // PARTY_EFFECT_FIELDS) ; sans effet de partie, ils traversent par
  // référence inchangée. ---
  const PARTY_START = parseNewGame(
    {
      startSceneId: "check",
      companions: [{ id: "companion-test-dog", type: "dog", behavior: { kind: "follow" } }],
      partyVariables: [{ name: "petted", type: "flag", initial: false }],
    },
    COMPANION_REGISTRY
  ).start;
  const partyStart = createInitialState(companionScene, 1, PARTY_START);
  const partyAfter = applyCompanionActionEffects(partyStart, "companion-test-dog", [
    { type: "setVariable", scope: "party", name: "petted", value: true },
    { type: "giveImprovement", id: "supernatural_perception" },
    { type: "learnEmote", id: "clap" },
  ]);
  run("compagnons : effet de partie -> variable de partie reprise", true, partyAfter.variables.petted.value);
  run("compagnons : effet de partie -> amélioration reprise", true, Boolean(partyAfter.improvements.supernatural_perception));
  run("compagnons : effet de partie -> émote reprise", true, Boolean(partyAfter.emotes.clap));
  const entityOnly = applyCompanionActionEffects(partyStart, "companion-test-dog", [
    { type: "setVariable", scope: "entity", name: "sniffed", value: true },
  ]);
  run("compagnons : sans effet de partie -> variables de partie inchangées (référence)", partyStart.variables, entityOnly.variables);
  run("compagnons : sans effet de partie -> améliorations inchangées (référence)", partyStart.improvements, entityOnly.improvements);
}
