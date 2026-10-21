// Vérifications du core — domaine « faces ». Scène à deux faces (recto/verso)
// : construction, isolation, étouffement déclaré par la scène. Lancées par
// core/checks/index.js/runChecks (voir ce fichier). Pur : aucun DOM, aucun
// fetch ; chaque scène est construite en dur via un objet littéral passé à
// parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, travelToWorld, switchSide, spawnEphemeral } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { throws } from "../../lib/check.js";
import { NO_COMPANIONS, RAW_SCENE, EMPTY_REGISTRY, WORLD_A_REGISTRY, TWO_FACED_RAW_SCENE } from "./helpers.js";

export default function checkFaces(run) {
  // Fixtures partagées avec d'autres domaines (voir ./helpers.js).
  const scene = parseScene(RAW_SCENE, EMPTY_REGISTRY);

  // --- Scène à deux faces (recto/verso) : construction (voir CLAUDE.md/
  // "RECTO/VERSO", doc/scene-format.md, core/state.js/isTwoSided) ---

  // Validation au chargement : recto/verso requis ENSEMBLE, jamais un seul
  // champ de face à la racine en même temps.

  const twoFacedRawScene = TWO_FACED_RAW_SCENE;

  const missingVersoRejected = throws(() => parseScene({ ...twoFacedRawScene, verso: undefined }, WORLD_A_REGISTRY));
  run("deux faces : recto déclaré sans verso est rejeté", true, missingVersoRejected);

  const leakedFaceFieldRejected = throws(() => parseScene({ ...twoFacedRawScene, entities: [] }, WORLD_A_REGISTRY));
  run("deux faces : un champ de face (entities) à la racine est rejeté", true, leakedFaceFieldRejected);

  const twoFacedScene = parseScene(twoFacedRawScene, WORLD_A_REGISTRY);
  run("deux faces : parseScene construit recto ET verso", true, Boolean(twoFacedScene.recto) && Boolean(twoFacedScene.verso));
  run("deux faces : aucun `entities` à la racine de la scène parsée", undefined, twoFacedScene.entities);
  run("deux faces : recto porte ses propres entités", "recto-dog", twoFacedScene.recto.entities[0].id);
  run("deux faces : verso porte ses propres entités", "verso-dog", twoFacedScene.verso.entities[0].id);

  // Rétrocompat stricte : une scène simple (`scene`, parsée en tête de fichier)
  // ne porte jamais recto/verso.
  run("scène simple : jamais de recto/verso (rétrocompat)", undefined, scene.recto);

  // Construction : recto/verso ont chacun leur PROPRE rngState (graines
  // distinctes, voir core/state.js/createFaceState) — jamais la même suite
  // de tirages pour les deux faces d'un même monde.
  let twoFaceSession = createInitialState(twoFacedScene, 99, NO_COMPANIONS);
  run("deux faces : player.side par défaut 'recto'", "recto", twoFaceSession.player.side);
  const twoFaceWorldId = twoFacedScene.id;
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

  // TICK — COEXISTENCE (voir CLAUDE.md/"RECTO/VERSO", core/reduce.js) :
  // LES DEUX faces avancent à chaque tick, chacune dans sa PROPRE suite de tirages (isolation de
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

  // --- Isolation stricte (voir doc/entity-model.md/"Recto/verso") : collision
  // ET ciblage de comportement restent bornés à la face de l'entité, jamais
  // croisés entre recto et verso.

  const ISOLATION_REGISTRY = { npc: { nameKey: "entity.npc.name" }, blocker: { nameKey: "entity.blocker.name", blocksMovement: true } };

  // Collision : un bloqueur de l'AUTRE face ne doit JAMAIS arrêter le
  // joueur — deux espaces disjoints qui partagent seulement l'axe x.
  const isolationBlockOnRecto = parseScene(
    {
      id: "movement-check-isolation-block-recto",
      titleKey: "scene.demo.name",
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
  const isolationBlockOnVerso = parseScene(
    {
      id: "movement-check-isolation-block-verso",
      titleKey: "scene.demo.name",
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
  const targetingScene = parseScene(
    {
      id: "movement-check-isolation-targeting",
      titleKey: "scene.demo.name",
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
  let targetingSession = createInitialState(targetingScene, 1, NO_COMPANIONS);
  for (let i = 0; i < 40; i++) targetingSession = reduce(targetingSession, tick(0));
  run(
    "isolation : un goto de la face courante ne peut jamais cibler une entité de l'autre face",
    2,
    targetingSession.worlds[targetingScene.id].recto.entities[0].x
  );
  run(
    "isolation : un goto de l'autre face ne peut jamais cibler le joueur (absent de cette face)",
    2,
    targetingSession.worlds[targetingScene.id].verso.entities.find((e) => e.id === "verso-seeker").x
  );

  // arrivalX est une donnée de CONTENU, jamais validée en bornes au
  // chargement (voir core/scene.js/parseEntity, action) — clampée à
  // l'exécution par switchSide, jamais un joueur hors carte.
  const clampedSwitch = switchSide(createInitialState(twoFacedScene, 1, NO_COMPANIONS), 9999);
  run("switchSide : arrivalX hors bornes est clampé au bord droit", twoFacedScene.length, clampedSwitch.player.x);

  // Éphémères : spawnEphemeral/removeEntity/markConsumed sont scopés à la
  // face COURANTE (session.player.side), jamais l'autre.
  let twoFaceEphemeralSession = createInitialState(twoFacedScene, 3, NO_COMPANIONS);
  const TWO_FACE_EPHEMERAL_SPEC = { type: "dog", labelKey: "entity.dog.name" };
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

  // travelToWorld QUITTE le monde (pas juste la face) : purge les éphémères
  // des DEUX faces, remet player.side à "recto" (comme playerStart).
  twoFaceEphemeralSession = switchSide(twoFaceEphemeralSession, 5);
  twoFaceEphemeralSession = spawnEphemeral(twoFaceEphemeralSession, TWO_FACE_EPHEMERAL_SPEC, 5);
  run(
    "deux faces : contrôle — un éphémère sur CHAQUE face avant le départ",
    true,
    twoFaceEphemeralSession.worlds[twoFaceWorldId].recto.entities.some((e) => e.ephemeral) &&
      twoFaceEphemeralSession.worlds[twoFaceWorldId].verso.entities.some((e) => e.ephemeral)
  );
  const twoFaceOtherWorld = parseScene(
    { id: "movement-check-twoface-elsewhere", titleKey: "scene.demo.name", length: 5, playerStart: 0, entities: [] },
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
  // sérialisabilité", save.check.js), vérifiée ICI dédiée à ce modèle.
  const twoFaceRoundTripped = JSON.parse(JSON.stringify(afterLeavingTwoFace));
  run.same(
    "deux faces : structure identique après aller-retour JSON",
    afterLeavingTwoFace,
    twoFaceRoundTripped
  );

  // --- Étouffement de l'autre face déclaré par la SCÈNE (racine,
  // core/scene.js/parseScene) : transporté sur la scène parsée puis sur le
  // monde, validé en bornes, réservé aux scènes à deux faces. ---
  const mufflingScene = (extra, twoFaced = true) => ({
    id: "muffling",
    titleKey: "scene.demo.name",
    length: 10,
    playerStart: 0,
    ...(twoFaced ? { recto: { entities: [] }, verso: { entities: [] } } : { entities: [] }),
    ...extra,
  });
  const parsedMuffling = parseScene(mufflingScene({ faceMufflingGain: 0.2, faceMufflingLowpassHz: 600 }), {});
  run("étouffement de scène : transporté", "0.2/600", `${parsedMuffling.faceMufflingGain}/${parsedMuffling.faceMufflingLowpassHz}`);
  run(
    "étouffement de scène : présent sur la face active du monde",
    0.2,
    getActiveWorld(createInitialState(parsedMuffling, "muffling", NO_COMPANIONS)).faceMufflingGain
  );
  run("étouffement de scène : absent -> non défini (défaut résolu par la vue)", undefined, parseScene(mufflingScene({}), {}).faceMufflingGain);
  const mufflingThrows = (raw) => {
    return throws(() => parseScene(raw, {}));
  };
  run("étouffement de scène : gain > 1 refusé", true, mufflingThrows(mufflingScene({ faceMufflingGain: 1.5 })));
  run("étouffement de scène : passe-bas nul refusé", true, mufflingThrows(mufflingScene({ faceMufflingLowpassHz: 0 })));
  run("étouffement de scène : refusé sur une scène simple", true, mufflingThrows(mufflingScene({ faceMufflingGain: 0.3 }, false)));
}
