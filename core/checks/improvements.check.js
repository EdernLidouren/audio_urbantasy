// Vérifications du core — domaine « improvements ». Améliorations
// (core/improvements.js) : registre, stockage, effets, condition
// hasImprovement. Lancées par core/checks/index.js/runChecks (voir ce
// fichier). Pur : aucun DOM, aucun fetch ; chaque scène est construite en dur
// via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, applyEntityActionEffects } from "../state.js";
import { SAVE_VERSION, serializeGame, deserializeGame } from "../save.js";
import { evaluateCondition } from "../presence.js";
import { applyActionEffects } from "../variables.js";
import {
  IMPROVEMENT_REGISTRY,
  improvementProps,
  hasImprovement,
  giveImprovement,
  removeImprovement,
  validateImprovementRegistry,
  orderedImprovementIds,
} from "../improvements.js";
import { isDebugEnabled, setDebugEnabled } from "../../config/debug.js";
import { throws } from "../../lib/check.js";

export default function checkImprovements(run) {
  // Ces vérifications basculent le mode debug (court-circuit de
  // hasImprovement) : il est TOUJOURS remis dans son état d'avant, même
  // si une vérification lève une exception.
  const debugWasEnabled = isDebugEnabled();
  try {
    checkImprovementsBody(run);
  } finally {
    setDebugEnabled(debugWasEnabled);
  }
}

function checkImprovementsBody(run) {
  // --- Improvements (core/improvements.js) — registre, stockage,
  // effets give/remove, condition hasImprovement + court-circuit DEBUG.
  {

    run("improvements : registre porte supernatural_perception", true, Boolean(IMPROVEMENT_REGISTRY.supernatural_perception));
    run("improvements : improvementProps id inconnu -> undefined", undefined, improvementProps("does-not-exist"));
    // `order` : déclaré, unique, et seul critère de tri de l'onglet.
    run("improvements : chaque entrée porte un order entier >= 1", true, Object.values(IMPROVEMENT_REGISTRY).every((p) => Number.isInteger(p.order) && p.order >= 1));
    run("improvements : ordre d'affichage suit order", "supernatural_perception,flashlight,mirror_pass,master_key,skeleton_key,old_plans", orderedImprovementIds().join(","));
    run("improvements : tri indépendant de l'ordre d'insertion", "b,a", orderedImprovementIds({ a: { order: 2 }, b: { order: 1 } }).join(","));
    const improvementRegistryRejected = (registry) => {
      return throws(() => validateImprovementRegistry(registry));
    };
    run("improvements : order dupliqué rejeté", true, improvementRegistryRejected({ a: { order: 1 }, b: { order: 1 } }));
    run("improvements : order absent rejeté", true, improvementRegistryRejected({ a: {} }));
    run("improvements : order non entier rejeté", true, improvementRegistryRejected({ a: { order: 1.5 } }));
    run("improvements : registre réel valide", false, improvementRegistryRejected(IMPROVEMENT_REGISTRY));

    // Primitives PURES (core/improvements.js) — sac SPARSE, référence
    // INCHANGÉE si rien à faire (même politique que setVariable).
    run("improvements : hasImprovement sur sac vide -> faux", false, hasImprovement({}, "flashlight"));
    const givenOnce = giveImprovement({}, "flashlight");
    run("improvements : giveImprovement ajoute la clé", true, hasImprovement(givenOnce, "flashlight"));
    run("improvements : giveImprovement idempotent -> RÉFÉRENCE inchangée si déjà possédée", givenOnce, giveImprovement(givenOnce, "flashlight"));
    const removedAgain = removeImprovement(givenOnce, "flashlight");
    run("improvements : removeImprovement retire la clé", false, hasImprovement(removedAgain, "flashlight"));
    run("improvements : removeImprovement idempotent -> RÉFÉRENCE inchangée si déjà absente", removedAgain, removeImprovement(removedAgain, "flashlight"));

    // Validation au CHARGEMENT (core/script-parse.js : validateCondition,
    // parseActionEffect) — condition ET effets.
    const IMPROVEMENT_TEST_REGISTRY = { dog: { nameKey: "entity.dog.name" } };
    function sceneWithHasImprovement(id) {
      return {
        id: "movement-check-has-improvement",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [{ id: "e1", type: "dog", x: 5, presence: [{ when: { type: "hasImprovement", id }, present: true }] }],
      };
    }
    run(
      "hasImprovement : id valide -> chargé sans erreur",
      true,
      !throws(() => parseScene(sceneWithHasImprovement("supernatural_perception"), IMPROVEMENT_TEST_REGISTRY))
    );
    run(
      "hasImprovement : id inconnu -> échec clair au chargement",
      true,
      throws(() => parseScene(sceneWithHasImprovement("does-not-exist"), IMPROVEMENT_TEST_REGISTRY))
    );
    function sceneWithImprovementEffect(effect) {
      return {
        id: "movement-check-improvement-effect",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [{ id: "e1", type: "dog", x: 5, action: { kind: "applyEffects", effects: [effect] } }],
      };
    }
    run(
      "giveImprovement : id valide -> chargé sans erreur",
      true,
      !throws(() => parseScene(sceneWithImprovementEffect({ type: "giveImprovement", id: "mirror_pass" }), IMPROVEMENT_TEST_REGISTRY))
    );
    run(
      "giveImprovement : id inconnu -> échec clair au chargement",
      true,
      throws(() => parseScene(sceneWithImprovementEffect({ type: "giveImprovement", id: "does-not-exist" }), IMPROVEMENT_TEST_REGISTRY))
    );
    run(
      "removeImprovement : id inconnu -> échec clair au chargement",
      true,
      throws(() => parseScene(sceneWithImprovementEffect({ type: "removeImprovement", id: "does-not-exist" }), IMPROVEMENT_TEST_REGISTRY))
    );

    // Évaluation RUNTIME — condition "hasImprovement" (core/presence.js).
    run(
      "evaluateCondition hasImprovement : possédée -> vrai",
      true,
      evaluateCondition({ type: "hasImprovement", id: "flashlight" }, { session: { improvements: { flashlight: true } } })
    );
    run(
      "evaluateCondition hasImprovement : non possédée -> faux",
      false,
      evaluateCondition({ type: "hasImprovement", id: "flashlight" }, { session: { improvements: {} } })
    );
    run(
      "evaluateCondition hasImprovement : contexte sans session -> faux (repli défensif)",
      false,
      evaluateCondition({ type: "hasImprovement", id: "flashlight" }, {})
    );

    // COURT-CIRCUIT DEBUG — LECTURE ment TOUJOURS vrai, jamais d'écriture.
    // Réinitialisé en finally : un test qui laisserait le debug allumé
    // pollueraît TOUT le reste de cette suite (module-level, voir
    // config/debug.js).
    try {
      run("improvements debug : désactivé par défaut au début de ce bloc", false, isDebugEnabled());
      setDebugEnabled(true);
      run(
        "improvements debug : hasImprovement répond vrai SANS improvement réelle",
        true,
        evaluateCondition({ type: "hasImprovement", id: "flashlight" }, { session: { improvements: {} } })
      );
      run(
        "improvements debug : hasImprovement répond vrai même contexte totalement absent",
        true,
        evaluateCondition({ type: "hasImprovement", id: "flashlight" }, {})
      );
      // debugShortCircuit: false (carte de la ville) : l'état RÉEL, même en debug.
      run(
        "improvements debug : debugShortCircuit:false -> état réel (rien possédé)",
        false,
        evaluateCondition({ type: "hasImprovement", id: "flashlight" }, { session: { improvements: {} }, debugShortCircuit: false })
      );
      run(
        "improvements debug : debugShortCircuit:false -> état réel (possédé)",
        true,
        evaluateCondition({ type: "hasImprovement", id: "flashlight" }, { session: { improvements: { flashlight: true } }, debugShortCircuit: false })
      );
      setDebugEnabled(false);
      run(
        "improvements debug : coupé -> reconsulte l'état réel INSTANTANÉMENT (faux ici, rien de réellement possédé)",
        false,
        evaluateCondition({ type: "hasImprovement", id: "flashlight" }, { session: { improvements: {} } })
      );
    } finally {
      setDebugEnabled(false);
    }

    // applyActionEffects (core/variables.js) — giveImprovement/
    // removeImprovement appliqués dans le MÊME passage que setVariable,
    // MÊME clé de contexte "session" (portée PARTIE, comme "party").
    const improvementEffectsCtx = { session: { improvements: {} } };
    const afterGive = applyActionEffects([{ type: "giveImprovement", id: "mirror_pass" }], improvementEffectsCtx);
    run("applyActionEffects : giveImprovement — improvement ajoutée", true, hasImprovement(afterGive.session.improvements, "mirror_pass"));
    const afterRemove = applyActionEffects([{ type: "removeImprovement", id: "mirror_pass" }], afterGive);
    run("applyActionEffects : removeImprovement — improvement retirée", false, hasImprovement(afterRemove.session.improvements, "mirror_pass"));
    // Liste MIXTE variable + improvement — les DEUX portées "party"
    // touchées dans la MÊME activation, sans se marcher dessus (MÊME clé
    // de contexte "session", mais des champs DIFFÉRENTS : variables vs
    // improvements).
    const mixedPartyCtx = { session: { improvements: {}, variables: { friendship: { type: "int", initial: 0, persistent: true, value: 0 } } } };
    const afterMixedParty = applyActionEffects(
      [
        { type: "giveImprovement", id: "flashlight" },
        { type: "addVariable", scope: "party", name: "friendship", amount: 1 },
      ],
      mixedPartyCtx
    );
    run("applyActionEffects : liste mixte — improvement ET variable de partie touchées", true, hasImprovement(afterMixedParty.session.improvements, "flashlight") && afterMixedParty.session.variables.friendship.value === 1);

    // applyEntityActionEffects (core/state.js) — bout en bout : improvements
    // survit au splice final de la portée "party", au même titre que
    // .variables (les deux sont repris de result.session, jamais l'un sans
    // l'autre).
    const IMPROVEMENT_ENTITY_REGISTRY = { npc: { nameKey: "entity.npc.name" } };
    const improvementWorld = parseScene(
      {
        id: "movement-check-improvement-world",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [{ id: "unlocker", type: "npc", x: 5 }],
      },
      IMPROVEMENT_ENTITY_REGISTRY
    );
    let improvementSession = createInitialState(improvementWorld, 1, { companions: [] });
    run("improvements : session neuve démarre sans AUCUNE improvement", 0, Object.keys(improvementSession.improvements).length);
    improvementSession = applyEntityActionEffects(improvementSession, "unlocker", [{ type: "giveImprovement", id: "supernatural_perception" }]);
    run(
      "applyEntityActionEffects : giveImprovement — improvement réellement possédée après splice",
      true,
      hasImprovement(improvementSession.improvements, "supernatural_perception")
    );

    // Persistance : improvement réelle -> survit au save/reload (contraste
    // avec le test DEBUG plus bas, jamais réellement possédée).
    const improvementEnvelope = serializeGame(improvementSession);
    const improvementReload = deserializeGame(improvementEnvelope);
    run("improvements : save/load réussit", true, improvementReload.success);
    if (improvementReload.success) {
      run(
        "improvements : possédée RÉELLEMENT -> survit au rechargement",
        true,
        hasImprovement(improvementReload.session.improvements, "supernatural_perception")
      );
    }

    // DEBUG + sauvegarde : activer le debug fait passer TOUTES les gates,
    // mais NE MODIFIE JAMAIS session.improvements — une partie sauvegardée
    // en debug reste PROPRE, aucune improvement fictive n'y apparaît.
    try {
      let cleanSession = createInitialState(improvementWorld, 2, { companions: [] });
      setDebugEnabled(true);
      const debugPasses = evaluateCondition({ type: "hasImprovement", id: "supernatural_perception" }, { session: cleanSession });
      run("improvements debug : la gate passe pendant le debug", true, debugPasses);
      run("improvements debug : session.improvements JAMAIS modifiée par la simple LECTURE", 0, Object.keys(cleanSession.improvements).length);
      const cleanEnvelope = serializeGame(cleanSession);
      setDebugEnabled(false);
      const cleanReload = deserializeGame(cleanEnvelope);
      run("improvements debug : rechargement (debug coupé) réussit", true, cleanReload.success);
      if (cleanReload.success) {
        run(
          "improvements debug : sauvegarde propre — AUCUNE improvement réellement possédée après reload",
          0,
          Object.keys(cleanReload.session.improvements).length
        );
        run(
          "improvements debug : la gate échoue de nouveau (debug coupé, rien de réel)",
          false,
          evaluateCondition({ type: "hasImprovement", id: "supernatural_perception" }, { session: cleanReload.session })
        );
      }
    } finally {
      setDebugEnabled(false);
    }

    // Rebouchage d'une VIEILLE sauvegarde (voir core/save.js/migrateSave) —
    // antérieure au mécanisme d'improvements, `improvements` absent du
    // blob brut.
    const oldSaveWithoutImprovements = { version: SAVE_VERSION, data: { ...improvementSession } };
    delete oldSaveWithoutImprovements.data.improvements;
    const oldSaveReload = deserializeGame(oldSaveWithoutImprovements);
    run("improvements : vieille save sans le champ -> rechargement réussit", true, oldSaveReload.success);
    if (oldSaveReload.success) {
      run("improvements : vieille save rebouchée -> sac vide, jamais d'exception", 0, Object.keys(oldSaveReload.session.improvements).length);
    }
  }
}
