// Vérifications du core — domaine « worlds ». Partie multi-mondes : voyage,
// placePlayer, outils de recharge de scène. Lancées par
// core/checks/index.js/runChecks (voir ce fichier). Pur : aucun DOM, aucun
// fetch ; chaque scène est construite en dur via un objet littéral passé à
// parseScene.

import { parseScene } from "../scene.js";
import {
  createInitialState,
  getActiveWorld,
  travelToWorld,
  placePlayer,
  applyEntityActionEffects,
  reloadActiveWorld,
  forgetInactiveWorlds,
} from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { addMoney } from "../money.js";
import { INITIAL_TIME } from "../time.js";
import { throws } from "../../lib/check.js";
import { NO_COMPANIONS, WORLD_A_REGISTRY } from "./helpers.js";

export default function checkWorlds(run) {
  // --- Partie multi-mondes (modèle "Animal Crossing") ---

  const worldA = parseScene(
    {
      id: "movement-check-world-a",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 2,
      entities: [{ id: "npc-a", type: "dog", x: 10, behavior: { kind: "wander"} }],
    },
    WORLD_A_REGISTRY
  );
  const worldB = parseScene(
    { id: "movement-check-world-b", titleKey: "scene.demo.name", length: 15, playerStart: 3, entities: [] },
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

  // Transition A -> B : B jamais visité, fourni via freshScene.
  partie = travelToWorld(partie, worldB.id, worldB);
  run("partie : transition active bien la cible", worldB.id, partie.activeWorldId);
  run("partie : joueur replacé à playerStart du monde cible", worldB.playerStart, partie.player.x);
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

  // Retour A -> re-visite : B est déjà connu (pas de freshScene nécessaire),
  // A ressort tel quel (PNJ où il avait été laissé, PAS réinitialisé à x=10).
  partie = travelToWorld(partie, worldA.id);
  run("partie : re-visite ressort l'état sauvegardé (PNJ non réinitialisé)", npcXParked, getActiveWorld(partie).entities[0].x);
  run("partie : joueur replacé à playerStart du monde re-visité", worldA.playerStart, partie.player.x);
  run("partie : état du joueur toujours conservé après un aller-retour", "conserve-moi", partie.player.testMarker);

  // Cible ni visitée ni fournie -> échec clair, pas d'état à moitié construit.
  const travelToUnknownRejected = throws(() => travelToWorld(partie, "movement-check-world-unknown"));
  run("partie : transition vers un monde inconnu sans scène fournie est rejetée", true, travelToUnknownRejected);

  // --- travelToWorld : x/side EXPLICITES (voir core/effects.js/"teleport")
  // — sans eux, défauts d'une porte ordinaire ci-dessus (playerStart, "recto").
  // Fournis, ils REMPLACENT ces défauts, compagnons repositionnés AUTOUR DU
  // POINT RÉEL (jamais playerStart) EN UNE SEULE PASSE — voir le commentaire
  // de travelToWorld.
  let partieWithArrival = travelToWorld(partie, worldB.id, undefined, { x: 7, side: "verso" });
  run("travelToWorld : x explicite -> remplace playerStart", 7, partieWithArrival.player.x);
  run("travelToWorld : side explicite -> remplace le défaut recto", "verso", partieWithArrival.player.side);
  run(
    "travelToWorld : x/side absents -> défauts historiques inchangés (playerStart/recto)",
    true,
    (() => {
      const back = travelToWorld(partieWithArrival, worldA.id);
      return back.player.x === worldA.playerStart && back.player.side === "recto";
    })()
  );

  // --- placePlayer (voir core/state.js) — repositionnement SANS quitter le
  // monde actif : ni activeWorldId ni worlds ne changent, contrairement à
  // travelToWorld. Primitive PARTAGÉE avec switchSide (voir faces.check.js,
  // "bascule DANS le même monde").
  const beforePlace = createInitialState(worldA, 1, NO_COMPANIONS);
  const afterPlace = placePlayer(beforePlace, 12, "verso");
  run("placePlayer : déplace le joueur à x", 12, afterPlace.player.x);
  run("placePlayer : pose la face demandée", "verso", afterPlace.player.side);
  run("placePlayer : activeWorldId INCHANGÉ", beforePlace.activeWorldId, afterPlace.activeWorldId);
  run("placePlayer : x bordé dans [0, longueur]", worldA.length, placePlayer(beforePlace, 9999, "recto").player.x);

  // --- Outils de debug : recharger la scène active depuis son fichier,
  // oublier les autres mondes (core/state.js/reloadActiveWorld,
  // forgetInactiveWorlds). L'état du monde rechargé repart de zéro, le
  // reste de la partie (argent, compagnons, autres mondes) est intact. ---
  const RELOAD_REGISTRY = { box: { nameKey: "entity.office_table.name" } };
  const reloadSceneA = (patch = {}) =>
    parseScene(
      {
        id: "reload-a",
        titleKey: "scene.demo.name",
        length: 20,
        playerStart: 2,
        variables: [{ name: "projectorOn", type: "flag", initial: true }],
        recto: { entities: [{ id: "box-r", type: "box", x: 5 }] },
        verso: { entities: [{ id: "box-v", type: "box", x: 6 }] },
        ...patch,
      },
      RELOAD_REGISTRY
    );
  const reloadSceneB = parseScene({ id: "reload-b", titleKey: "scene.demo.name", length: 10, playerStart: 1, entities: [] }, RELOAD_REGISTRY);
  const reloadPet = { id: "pet", type: "box", x: 2 };
  let reloadState = createInitialState(reloadSceneA(), "reload", { companions: [reloadPet] });
  reloadState = addMoney(reloadState, 5);
  reloadState = travelToWorld(reloadState, "reload-b", reloadSceneB);
  reloadState = travelToWorld(reloadState, "reload-a", null, { x: 15, side: "verso" });
  reloadState = applyEntityActionEffects(reloadState, "box-v", [{ type: "setVariable", scope: "scene", name: "projectorOn", value: false }]);
  const worldBBefore = reloadState.worlds["reload-b"];

  // Même scène relue : état du monde remis à neuf, joueur à sa place.
  const reloadedSame = reloadActiveWorld(reloadState, reloadSceneA());
  run("rechargement : variable de scène revenue à sa valeur initiale", true, reloadedSame.worlds["reload-a"].variables.projectorOn.value);
  run("rechargement : joueur à la même position", 15, reloadedSame.player.x);
  run("rechargement : joueur sur la même face (scène toujours à deux faces)", "verso", reloadedSame.player.side);
  run("rechargement : argent conservé", 5, reloadedSame.money);
  run("rechargement : autre monde intact (même référence)", worldBBefore, reloadedSame.worlds["reload-b"]);
  run("rechargement : compagnon conservé, replacé près du joueur", "pet@15", reloadedSame.companions.map((c) => `${c.id}@${c.x}`).join(","));

  // Scène modifiée : plus courte et à une seule face.
  const shorterScene = reloadSceneA({ length: 12, recto: undefined, verso: undefined, entities: [{ id: "box-new", type: "box", x: 3 }] });
  const reloadedShorter = reloadActiveWorld(reloadState, shorterScene);
  run("rechargement : position bordée à la nouvelle longueur", 12, reloadedShorter.player.x);
  run("rechargement : plus de verso -> recto", "recto", reloadedShorter.player.side);
  run("rechargement : contenu relu", "box-new", getActiveWorld(reloadedShorter).entities.filter((e) => e.id !== "pet").map((e) => e.id).join(","));
  run("rechargement : compagnon bordé lui aussi", 12, reloadedShorter.companions[0].x);
  const reloadIdMismatchThrew = throws(() => reloadActiveWorld(reloadState, reloadSceneB));
  run("rechargement : id de scène différent -> erreur", true, reloadIdMismatchThrew);

  const forgotten = forgetInactiveWorlds(reloadState);
  run("oubli : seul le monde actif reste", "reload-a", Object.keys(forgotten.worlds).join(","));
  run("oubli : monde actif intact (même référence)", reloadState.worlds["reload-a"], forgotten.worlds["reload-a"]);
  run("oubli : joueur et argent intacts", "15/5", `${forgotten.player.x}/${forgotten.money}`);
}
