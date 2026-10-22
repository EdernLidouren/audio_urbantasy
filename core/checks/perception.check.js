// Vérifications du core — domaine « perception ». Perception surnaturelle
// (togglePerception). Lancées par core/checks/index.js/runChecks (voir ce
// fichier). Pur : aucun DOM, aucun fetch ; chaque scène est construite en dur
// via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, togglePerception } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { SAVE_VERSION, serializeGame, deserializeGame } from "../save.js";
import { evaluateCondition } from "../presence.js";
import { TICK_MS } from "../../lib/loop.js";
import { RAW_SCENE, EMPTY_REGISTRY, createAuditFixture } from "./helpers.js";

export default function checkPerception(run) {
  // Fixtures partagées avec d'autres domaines (voir ./helpers.js).
  const scene = parseScene(RAW_SCENE, EMPTY_REGISTRY);
  const { auditSession } = createAuditFixture();

  // --- Perception surnaturelle (core/state.js/togglePerception,
  // core/presence.js/"perceptionActive") : état + condition, CORE pur.
  // La bascule sonore (crossfade musique/ambiance, filtre d'étouffement des
  // entités mondaines) reste ENTIÈREMENT côté vue (view/perception-toggle.js,
  // view/audio/layers.js, view/audio/muffle.js) — hors de portée d'un check
  // terminal.

  run("perception : createInitialState — perceptionActive false par défaut", false, createInitialState(scene).perceptionActive);

  const perceptionSession = createInitialState(scene);
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
    dog: { nameKey: "entity.dog.name" },
    spirit: { nameKey: "entity.ghost.name", presence: [{ when: { type: "perceptionActive" }, present: true }] },
  };
  const spiritScene = parseScene(
    {
      id: "movement-check-perception",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [{ id: "spirit-1", type: "spirit", x: 10, behavior: { kind: "wander", walkMinMs: 1000 * TICK_MS, walkMaxMs: 1000 * TICK_MS } }],
    },
    SPIRIT_REGISTRY
  );
  function spirit(state) {
    return getActiveWorld(state).entities.find((e) => e.id === "spirit-1");
  }

  let perceptionOffState = createInitialState(spiritScene, 5);
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
  // jamais réinitialisée — même politique que le néon (voir
  // conditions.check.js, "présence conditionnelle").
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
}
