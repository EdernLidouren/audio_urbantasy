// Vérifications du core — domaine « variables ». Variables : stockage (trois
// portées) et variables branchées (condition "variable", effets d'état,
// actions multiples, la fenêtre). Les effets de rendu et teleport sont dans
// effects.check.js. Lancées par core/checks/index.js/runChecks (voir ce
// fichier). Pur : aucun DOM, aucun fetch ; chaque scène est construite en dur
// via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, applyEntityActionEffects } from "../state.js";
import { evaluateCondition, selectMatchingAction } from "../presence.js";
import { serializeGame, deserializeGame } from "../save.js";
import { applyActionEffects, parseVariables, getVariable, setVariable } from "../variables.js";
import { throws, auditNonSerializable, fail } from "../../lib/check.js";
import { VAR_ACTION_REGISTRY, sceneWithActionEffect } from "./helpers.js";

export default function checkVariables(run) {
  // --- STOCKAGE de variables (core/variables.js) : trois portées (entity/
  // scene/party), même mécanisme — voir doc/scripting.md/"Variables". Ce bloc
  // vérifie le STOCKAGE seul (déclaration, valeur initiale, persistance,
  // sérialisation sélective, accès get/set) — AUCUNE condition/action n'est
  // branchée dessus ici (voir « VARIABLES BRANCHÉES » plus bas).
  {

    // Une scène (portée "scene") et une entité (portée "entity") déclarant
    // chacune une variable PERSISTANTE (défaut) et une variable VOLATILE
    // (persistent: false explicite) — le couple minimal requis par la
    // vérification "modifier les deux, sauvegarder, recharger".
    const VARIABLES_REGISTRY = { npc: { nameKey: "entity.npc.name" } };
    const variablesRawScene = {
      id: "movement-check-variables",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 0,
      variables: [
        { name: "visits", type: "int", initial: 0 },
        { name: "doorUnlocked", type: "flag", initial: false, persistent: false },
      ],
      entities: [
        {
          id: "npc-1",
          type: "npc",
          x: 5,
          variables: [
            { name: "metOnce", type: "flag", initial: false },
            { name: "affinity", type: "int", initial: 0, persistent: false },
          ],
        },
      ],
    };
    const variablesScene = parseScene(variablesRawScene, VARIABLES_REGISTRY);
    const npc1Decl = variablesScene.entities.find((e) => e.id === "npc-1");

    // 1) Déclarées aux trois portées -> stockées, valeurs initiales
    // correctes, persistance résolue (défaut TRUE, explicite FALSE).
    run("variables : scène — visits (int) initial 0", 0, variablesScene.variables.visits.value);
    run("variables : scène — visits persistent PAR DÉFAUT true", true, variablesScene.variables.visits.persistent);
    run("variables : scène — doorUnlocked (flag) initial false", false, variablesScene.variables.doorUnlocked.value);
    run("variables : scène — doorUnlocked persistent EXPLICITE false", false, variablesScene.variables.doorUnlocked.persistent);
    run("variables : entité — metOnce (flag) initial false", false, npc1Decl.variables.metOnce.value);
    run("variables : entité — metOnce persistent PAR DÉFAUT true", true, npc1Decl.variables.metOnce.persistent);
    run("variables : entité — affinity (int) initial 0", 0, npc1Decl.variables.affinity.value);
    run("variables : entité — affinity persistent EXPLICITE false", false, npc1Decl.variables.affinity.persistent);

    let variablesSession = createInitialState(variablesScene, undefined, {
      companions: [],
      partyVariables: [{ name: "score", type: "int", initial: 0 }],
    });
    run("variables : partie — score (int) initial 0", 0, variablesSession.variables.score.value);
    run("variables : partie — score persistent PAR DÉFAUT true", true, variablesSession.variables.score.persistent);

    // Aucune valeur initiale ne doit jamais être undefined (obligatoire à
    // la déclaration, voir core/variables.js/parseVariables).
    run(
      "variables : aucune valeur undefined (scène)",
      true,
      Object.values(variablesScene.variables).every((v) => v.value !== undefined)
    );
    run(
      "variables : aucune valeur undefined (entité)",
      true,
      Object.values(npc1Decl.variables).every((v) => v.value !== undefined)
    );
    run(
      "variables : aucune valeur undefined (partie)",
      true,
      Object.values(variablesSession.variables).every((v) => v.value !== undefined)
    );

    // 2) Accès getVariable/setVariable, POINT D'ENTRÉE UNIQUE (voir
    // core/variables.js) — context { entity, world, session } générique,
    // scope ∈ "entity" | "scene" | "party".
    function variablesContext(session) {
      const world = session.worlds[session.activeWorldId];
      const entity = world.entities.find((e) => e.id === "npc-1");
      return { entity, world, session };
    }
    const ctx = variablesContext(variablesSession);
    run("getVariable : entity/metOnce", false, getVariable(ctx, "entity", "metOnce"));
    run("getVariable : scene/visits", 0, getVariable(ctx, "scene", "visits"));
    run("getVariable : party/score", 0, getVariable(ctx, "party", "score"));
    run("getVariable : nom inconnu -> undefined", undefined, getVariable(ctx, "entity", "doesNotExist"));
    run("getVariable : portée inconnue -> undefined", undefined, getVariable(ctx, "bogus", "metOnce"));

    const afterSetEntity = setVariable(ctx, "entity", "metOnce", true);
    run("setVariable : entity/metOnce -> true", true, afterSetEntity.variables.metOnce.value);
    run("setVariable : renvoie le PORTEUR (référence neuve), pas le contexte", true, afterSetEntity !== ctx.entity);
    run("setVariable : nom inconnu -> porteur INCHANGÉ (même référence)", ctx.entity, setVariable(ctx, "entity", "doesNotExist", true));
    run(
      "setVariable : valeur incohérente avec le type -> porteur INCHANGÉ",
      ctx.entity,
      setVariable(ctx, "entity", "affinity", "not a number")
    );

    // 3) Persistance sélective : modifie une PERSISTANTE et une VOLATILE à
    // CHAQUE portée, sauvegarde, recharge -> la persistante reprend sa
    // valeur modifiée, la volatile repart de sa valeur initiale déclarée.
    // setVariable renvoie le PORTEUR seul (voir core/variables.js/header) :
    // le splice dans la session ci-dessous reproduit ce que fait le
    // gestionnaire d'action (core/state.js/applyEntityActionEffects).
    let rtSession = variablesSession;

    let rtWorld = rtSession.worlds[rtSession.activeWorldId];
    rtWorld = setVariable({ world: rtWorld }, "scene", "visits", 7);
    rtWorld = setVariable({ world: rtWorld }, "scene", "doorUnlocked", true);
    rtSession = { ...rtSession, worlds: { ...rtSession.worlds, [rtSession.activeWorldId]: rtWorld } };

    let rtEntity = rtWorld.entities.find((e) => e.id === "npc-1");
    rtEntity = setVariable({ entity: rtEntity }, "entity", "metOnce", true);
    rtEntity = setVariable({ entity: rtEntity }, "entity", "affinity", 99);
    rtWorld = { ...rtWorld, entities: rtWorld.entities.map((e) => (e.id === "npc-1" ? rtEntity : e)) };
    rtSession = { ...rtSession, worlds: { ...rtSession.worlds, [rtSession.activeWorldId]: rtWorld } };

    // "party" : le porteur EST la session elle-même (voir
    // core/variables.js/carrierForScope) — setVariable renvoie donc déjà
    // une session complète, aucun splice à faire.
    rtSession = setVariable({ session: rtSession }, "party", "score", 42);

    const rtEnvelope = serializeGame(rtSession);
    const savedWorld = rtEnvelope.data.worlds[variablesScene.id];
    const savedEntity = savedWorld.entities.find((e) => e.id === "npc-1");
    run("save : scène — visits (persistante) survit dans l'enveloppe", 7, savedWorld.variables.visits.value);
    run(
      "save : scène — doorUnlocked (volatile) déjà remise à son initial (false) dans l'enveloppe",
      false,
      savedWorld.variables.doorUnlocked.value
    );
    run("save : entité — metOnce (persistante) survit dans l'enveloppe", true, savedEntity.variables.metOnce.value);
    run(
      "save : entité — affinity (volatile) déjà remise à son initial (0) dans l'enveloppe",
      0,
      savedEntity.variables.affinity.value
    );
    run("save : partie — score (persistante) survit dans l'enveloppe", 42, rtEnvelope.data.variables.score.value);

    const rtReload = deserializeGame(rtEnvelope);
    run("save/load : variables — recharge sans erreur", true, rtReload.success);
    if (rtReload.success) {
      const reloadedWorld = rtReload.session.worlds[variablesScene.id];
      const reloadedEntity = reloadedWorld.entities.find((e) => e.id === "npc-1");
      run("save/load : scène — visits (persistante) reprend sa valeur modifiée (7)", 7, reloadedWorld.variables.visits.value);
      run("save/load : scène — doorUnlocked (volatile) repart de son initial (false)", false, reloadedWorld.variables.doorUnlocked.value);
      run("save/load : entité — metOnce (persistante) reprend sa valeur modifiée (true)", true, reloadedEntity.variables.metOnce.value);
      run("save/load : entité — affinity (volatile) repart de son initial (0)", 0, reloadedEntity.variables.affinity.value);
      run("save/load : partie — score (persistante) reprend sa valeur modifiée (42)", 42, rtReload.session.variables.score.value);
    }

    // Audit de sérialisabilité générique (auditNonSerializable, lib/check.js)
    // appliqué à une session qui exerce RÉELLEMENT les trois portées : aucune
    // fonction/NaN/référence circulaire ne doit s'y être glissée.
    const variablesLeakFindings = [];
    auditNonSerializable(rtSession, "variablesSession", new Set(), variablesLeakFindings);
    run("variables : sérialisation — aucune fuite de non-sérialisable", 0, variablesLeakFindings.length);

    // 4) PRÉSENT mais MALFORMÉ -> erreur claire (le défaut ne couvre QUE
    // l'omission). Directement via parseVariables...
    run("variables : type inconnu -> erreur", true, throws(() => parseVariables([{ name: "x", type: "float", initial: 1 }], "test", fail)));
    run(
      "variables : flag avec initial non booléen -> erreur",
      true,
      throws(() => parseVariables([{ name: "x", type: "flag", initial: 1 }], "test", fail))
    );
    run(
      "variables : int avec initial non entier (flottant) -> erreur",
      true,
      throws(() => parseVariables([{ name: "x", type: "int", initial: 1.5 }], "test", fail))
    );
    run(
      "variables : int avec initial non numérique (chaîne) -> erreur",
      true,
      throws(() => parseVariables([{ name: "x", type: "int", initial: "1" }], "test", fail))
    );
    run("variables : initial absent -> erreur", true, throws(() => parseVariables([{ name: "x", type: "int" }], "test", fail)));
    run("variables : name absent -> erreur", true, throws(() => parseVariables([{ type: "int", initial: 0 }], "test", fail)));
    run(
      "variables : name dupliqué -> erreur",
      true,
      throws(() =>
        parseVariables(
          [
            { name: "x", type: "int", initial: 0 },
            { name: "x", type: "flag", initial: true },
          ],
          "test",
          fail
        )
      )
    );
    run(
      "variables : persistent non booléen -> erreur",
      true,
      throws(() => parseVariables([{ name: "x", type: "int", initial: 0, persistent: "yes" }], "test", fail))
    );
    run("variables : pas un tableau -> erreur", true, throws(() => parseVariables({ name: "x" }, "test", fail)));
    run("variables : élément qui n'est pas un objet -> erreur", true, throws(() => parseVariables(["oops"], "test", fail)));
    run("variables : absent -> sac vide, PAS une erreur", false, throws(() => parseVariables(undefined, "test", fail)));

    // ... puis via les VRAIS points d'entrée (core/scene.js, core/state.js),
    // pour confirmer que le branchement, pas seulement la fonction pure,
    // rejette bien un contenu malformé.
    run(
      "variables : scène malformée -> erreur au chargement (parseScene)",
      true,
      throws(() =>
        parseScene({ ...variablesRawScene, variables: [{ name: "bad", type: "unknown", initial: 0 }] }, VARIABLES_REGISTRY)
      )
    );
    run(
      "variables : entité malformée -> erreur au chargement (parseScene)",
      true,
      throws(() =>
        parseScene(
          {
            ...variablesRawScene,
            entities: [{ id: "npc-bad", type: "npc", x: 1, variables: [{ name: "bad", type: "int", initial: "nope" }] }],
          },
          VARIABLES_REGISTRY
        )
      )
    );
    run(
      "variables : partie malformée -> erreur au chargement (createInitialState)",
      true,
      throws(() =>
        createInitialState(variablesScene, undefined, {
          companions: [],
          partyVariables: [{ name: "bad", type: "flag", initial: "nope" }],
        })
      )
    );
  }

  // --- VARIABLES BRANCHÉES (voir doc/scripting.md/"Variables"
  // et "Actions multiples filtrées par condition") : condition "variable"
  // (LECTURE, core/presence.js/evaluateVariable), effets setVariable/
  // toggleVariable/addVariable (ÉCRITURE, core/script-parse.js/parseActionEffect,
  // core/variables.js/applyActionEffects), sélection d'action multiple par
  // condition (core/presence.js/selectMatchingAction). Cas de référence :
  // la FENÊTRE (deux candidates aux conditions opposées).
  {
    // 1) Condition "variable" — direct via evaluateCondition, contexte
    // { entity, world, session } construit à la main (voir
    // core/variables.js/carrierForScope : "entity"->entity, "scene"->world,
    // "party"->session).
    const flagCarrier = { variables: { isOpen: { type: "flag", initial: false, persistent: false, value: false } } };
    const intCarrier = { variables: { friendship: { type: "int", initial: 0, persistent: true, value: 42 } } };
    const varCtx = { entity: flagCarrier, world: intCarrier, session: intCarrier };

    run(
      "variable (condition) : flag equals false -> vraie",
      true,
      evaluateCondition({ type: "variable", scope: "entity", name: "isOpen", equals: false }, varCtx)
    );
    run(
      "variable (condition) : flag equals true -> fausse",
      false,
      evaluateCondition({ type: "variable", scope: "entity", name: "isOpen", equals: true }, varCtx)
    );
    run(
      "variable (condition) : int greaterThan -> vraie",
      true,
      evaluateCondition({ type: "variable", scope: "scene", name: "friendship", greaterThan: 10 }, varCtx)
    );
    run(
      "variable (condition) : int lessThan -> fausse",
      false,
      evaluateCondition({ type: "variable", scope: "scene", name: "friendship", lessThan: 10 }, varCtx)
    );
    run(
      "variable (condition) : int greaterOrEqual (égal) -> vraie",
      true,
      evaluateCondition({ type: "variable", scope: "party", name: "friendship", greaterOrEqual: 42 }, varCtx)
    );
    run(
      "variable (condition) : int lessOrEqual (égal) -> vraie",
      true,
      evaluateCondition({ type: "variable", scope: "party", name: "friendship", lessOrEqual: 42 }, varCtx)
    );
    run(
      "variable (condition) : int equals -> vraie",
      true,
      evaluateCondition({ type: "variable", scope: "party", name: "friendship", equals: 42 }, varCtx)
    );
    run(
      "variable (condition) : nom inconnu -> fausse (jamais une exception)",
      false,
      evaluateCondition({ type: "variable", scope: "entity", name: "doesNotExist", equals: false }, varCtx)
    );
    run(
      "variable (condition) : portée sans porteur dans le contexte -> fausse",
      false,
      evaluateCondition({ type: "variable", scope: "entity", name: "isOpen", equals: false }, {})
    );
    run(
      "variable (condition) : composable dans allOf — toutes vraies -> vraie",
      true,
      evaluateCondition(
        {
          type: "allOf",
          conditions: [
            { type: "variable", scope: "entity", name: "isOpen", equals: false },
            { type: "weather", state: "fog" },
          ],
        },
        { ...varCtx, weather: "fog" }
      )
    );
    run(
      "variable (condition) : composable dans allOf — une fausse -> fausse",
      false,
      evaluateCondition(
        {
          type: "allOf",
          conditions: [
            { type: "variable", scope: "entity", name: "isOpen", equals: false },
            { type: "weather", state: "fog" },
          ],
        },
        { ...varCtx, weather: "clear" }
      )
    );

    // 2) selectMatchingAction — sélection SILENCIEUSE (pas de menu, voir
    // core/presence.js) parmi des candidates, PREMIÈRE dont la condition
    // est vraie.
    const candidateOpen = { kind: "applyEffects", condition: { type: "variable", scope: "entity", name: "isOpen", equals: false } };
    const candidateClose = { kind: "applyEffects", condition: { type: "variable", scope: "entity", name: "isOpen", equals: true } };
    const noConditionCandidate = { kind: "applyEffects" };

    run(
      "selectMatchingAction : choisit la candidate dont la condition est vraie (fermée -> ouvrir)",
      candidateOpen,
      selectMatchingAction([candidateOpen, candidateClose], varCtx)
    );
    const openedCtx = {
      ...varCtx,
      entity: { variables: { isOpen: { type: "flag", initial: false, persistent: false, value: true } } },
    };
    run(
      "selectMatchingAction : choisit l'AUTRE candidate une fois l'état basculé (ouverte -> fermer)",
      candidateClose,
      selectMatchingAction([candidateOpen, candidateClose], openedCtx)
    );
    run("selectMatchingAction : aucune candidate ne matche -> undefined", undefined, selectMatchingAction([candidateOpen], openedCtx));
    run(
      "selectMatchingAction : PRIORITÉ — première déclarée qui matche, même si une autre matche aussi",
      noConditionCandidate,
      selectMatchingAction([noConditionCandidate, candidateOpen], varCtx)
    );
    run(
      "selectMatchingAction : candidate SANS condition matche toujours",
      noConditionCandidate,
      selectMatchingAction([noConditionCandidate], {})
    );

    // 3) applyActionEffects — enchaîne set/toggle/add, renvoie le CONTEXTE
    // avec SEULES les portées touchées mises à jour.
    const effectsCtx = {
      entity: {
        variables: {
          isOpen: { type: "flag", initial: false, persistent: false, value: false },
          affinity: { type: "int", initial: 0, persistent: true, value: 5 },
        },
      },
      world: { variables: { visits: { type: "int", initial: 0, persistent: true, value: 1 } } },
      session: { variables: { score: { type: "int", initial: 0, persistent: true, value: 100 } } },
    };
    const afterSet = applyActionEffects([{ type: "setVariable", scope: "entity", name: "isOpen", value: true }], effectsCtx);
    run("applyActionEffects : setVariable — écrit la valeur", true, afterSet.entity.variables.isOpen.value);
    run("applyActionEffects : setVariable — porteurs NON touchés inchangés (world, référence)", effectsCtx.world, afterSet.world);

    const afterToggle = applyActionEffects([{ type: "toggleVariable", scope: "entity", name: "isOpen" }], effectsCtx);
    run("applyActionEffects : toggleVariable — inverse (false -> true)", true, afterToggle.entity.variables.isOpen.value);
    const afterDoubleToggle = applyActionEffects(
      [
        { type: "toggleVariable", scope: "entity", name: "isOpen" },
        { type: "toggleVariable", scope: "entity", name: "isOpen" },
      ],
      effectsCtx
    );
    run("applyActionEffects : deux toggleVariable enchaînés -> revient à l'initial", false, afterDoubleToggle.entity.variables.isOpen.value);

    const afterAdd = applyActionEffects([{ type: "addVariable", scope: "entity", name: "affinity", amount: 3 }], effectsCtx);
    run("applyActionEffects : addVariable — ajoute (5 + 3 = 8)", 8, afterAdd.entity.variables.affinity.value);
    const afterAddNegative = applyActionEffects([{ type: "addVariable", scope: "entity", name: "affinity", amount: -2 }], effectsCtx);
    run("applyActionEffects : addVariable — amount négatif accepté (5 - 2 = 3)", 3, afterAddNegative.entity.variables.affinity.value);

    const afterMixed = applyActionEffects(
      [
        { type: "setVariable", scope: "entity", name: "isOpen", value: true },
        { type: "addVariable", scope: "scene", name: "visits", amount: 1 },
        { type: "addVariable", scope: "party", name: "score", amount: 10 },
      ],
      effectsCtx
    );
    run("applyActionEffects : liste mixte (3 portées) — entity touchée", true, afterMixed.entity.variables.isOpen.value);
    run("applyActionEffects : liste mixte (3 portées) — scene touchée", 2, afterMixed.world.variables.visits.value);
    run("applyActionEffects : liste mixte (3 portées) — party touchée", 110, afterMixed.session.variables.score.value);
    run(
      "applyActionEffects : nom inconnu -> porteur inchangé (silencieux, même référence)",
      effectsCtx.entity,
      applyActionEffects([{ type: "setVariable", scope: "entity", name: "doesNotExist", value: true }], effectsCtx).entity
    );

    // ROUTAGE core/vue (voir core/effects.js) : une liste MIXTE état+rendu
    // ne fait muter QUE l'état — playSound/announce (à charge de la vue,
    // voir view/effect-runner.js/runEffects) traversent SANS EFFET, jamais une
    // erreur, exactement comme un type totalement inconnu (voir plus haut).
    const afterMixedNature = applyActionEffects(
      [
        { type: "playSound", path: "assets/sounds/effects/window_blinds_open" },
        { type: "setVariable", scope: "entity", name: "isOpen", value: true },
        { type: "announce", key: "entity.window.opened" },
      ],
      effectsCtx
    );
    run("applyActionEffects : liste état+rendu — état muté normalement", true, afterMixedNature.entity.variables.isOpen.value);

    // ROUTAGE : "teleport" (effet MIXTE, voir core/effects.js) traverse
    // applyActionEffects SANS EFFET — exécuté par la vue (view/world-travel.js/
    // executeTeleport), jamais par le core, exactement comme playSound/
    // announce.
    run(
      "applyActionEffects : teleport — ignoré (référence INCHANGÉE)",
      effectsCtx.entity,
      applyActionEffects([{ type: "teleport", target: "elsewhere" }], effectsCtx).entity
    );

    // 4) Validation au CHARGEMENT (core/script-parse.js, appelé par
    // parseScene) — PRÉSENT mais MALFORMÉ ->
    // erreur claire ; ABSENT -> défaut, jamais testé ici (déjà couvert par
    // le stockage, plus haut).
    function sceneWithCondition(cond, entityVariables = [{ name: "isOpen", type: "flag", initial: false }]) {
      return {
        id: "movement-check-var-cond",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        variables: [{ name: "sceneCounter", type: "int", initial: 0 }],
        entities: [{ id: "e1", type: "npc", x: 5, variables: entityVariables, presence: [{ when: cond, present: true }] }],
      };
    }

    run(
      "variable : scope inconnu -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithCondition({ type: "variable", scope: "bogus", name: "isOpen", equals: true }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : nom jamais déclaré sur l'entité (scope entity) -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithCondition({ type: "variable", scope: "entity", name: "doesNotExist", equals: true }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : nom jamais déclaré sur la scène (scope scene) -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithCondition({ type: "variable", scope: "scene", name: "doesNotExist", equals: true }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : nom de PARTIE jamais déclaré NULLE PART -> PAS d'erreur (non vérifiable au chargement d'une scène, voir core/script-parse.js/validateVariableReference)",
      false,
      throws(() => parseScene(sceneWithCondition({ type: "variable", scope: "party", name: "totallyMadeUp", equals: true }), VAR_ACTION_REGISTRY))
    );
    // Portée "party" : type inconnu au chargement, mais la valeur doit au
    // moins être une valeur possible d'une variable.
    run(
      "variable (party) : equals sur une chaîne -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithCondition({ type: "variable", scope: "party", name: "anything", equals: "yes" }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable (party) : comparateur d'ordre sur un booléen -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithCondition({ type: "variable", scope: "party", name: "anything", greaterThan: true }), VAR_ACTION_REGISTRY))
    );
    run(
      "setVariable (party) : sans value -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "setVariable", scope: "party", name: "anything" }), VAR_ACTION_REGISTRY))
    );
    run(
      "setVariable (party) : value chaîne -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "setVariable", scope: "party", name: "anything", value: "on" }), VAR_ACTION_REGISTRY))
    );
    run(
      "setVariable (party) : value booléenne ou entière -> acceptée",
      "false,false",
      [true, 3].map((value) => throws(() => parseScene(sceneWithActionEffect({ type: "setVariable", scope: "party", name: "anything", value }), VAR_ACTION_REGISTRY))).join(",")
    );
    run(
      "variable : aucun comparateur -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithCondition({ type: "variable", scope: "entity", name: "isOpen" }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : DEUX comparateurs -> erreur au chargement",
      true,
      throws(() =>
        parseScene(sceneWithCondition({ type: "variable", scope: "entity", name: "isOpen", equals: true, greaterThan: 0 }), VAR_ACTION_REGISTRY)
      )
    );
    run(
      "variable : greaterThan sur un flag -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithCondition({ type: "variable", scope: "entity", name: "isOpen", greaterThan: 0 }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : equals incohérent avec le type (nombre sur un flag) -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithCondition({ type: "variable", scope: "entity", name: "isOpen", equals: 1 }), VAR_ACTION_REGISTRY))
    );
    run(
      "variable : equals sur un int avec greaterThan valide ailleurs -> chargé sans erreur (cas sain, non-régression)",
      false,
      throws(() =>
        parseScene(
          sceneWithCondition({ type: "variable", scope: "scene", name: "sceneCounter", greaterThan: 0 }, [{ name: "isOpen", type: "flag", initial: false }]),
          VAR_ACTION_REGISTRY
        )
      )
    );

    run(
      "setVariable (effet) : valeur incohérente avec le type -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "setVariable", scope: "entity", name: "isOpen", value: "nope" }), VAR_ACTION_REGISTRY))
    );
    run(
      "toggleVariable (effet) : sur un int -> erreur au chargement",
      true,
      throws(() =>
        parseScene(
          sceneWithActionEffect({ type: "toggleVariable", scope: "entity", name: "counter" }, [{ name: "counter", type: "int", initial: 0 }]),
          VAR_ACTION_REGISTRY
        )
      )
    );
    run(
      "addVariable (effet) : sur un flag -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "addVariable", scope: "entity", name: "isOpen", amount: 1 }), VAR_ACTION_REGISTRY))
    );
    run(
      "addVariable (effet) : amount non entier -> erreur au chargement",
      true,
      throws(() =>
        parseScene(
          sceneWithActionEffect({ type: "addVariable", scope: "entity", name: "counter", amount: 1.5 }, [{ name: "counter", type: "int", initial: 0 }]),
          VAR_ACTION_REGISTRY
        )
      )
    );
    run(
      "setVariable (effet) : nom jamais déclaré -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "setVariable", scope: "entity", name: "doesNotExist", value: true }), VAR_ACTION_REGISTRY))
    );
    run(
      "effet : type inconnu -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "bogusEffect", scope: "entity", name: "isOpen" }), VAR_ACTION_REGISTRY))
    );

    // 5) RÉTROCOMPAT — une entité à action UNIQUE (objet, pas tableau) reste
    // structurellement INCHANGÉE.
    const retrocompatScene = parseScene(
      {
        id: "movement-check-single-action",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [{ id: "e1", type: "npc", x: 5, action: { kind: "switchSide", arrivalX: 3 } }],
      },
      VAR_ACTION_REGISTRY
    );
    run("action unique : PAS un tableau (rétrocompat)", false, Array.isArray(retrocompatScene.entities[0].action));
    run("action unique : kind transporté tel quel", "switchSide", retrocompatScene.entities[0].action.kind);

    // 6) LA FENÊTRE — cas de test bout en bout (voir entities/types/
    // glass-window.js pour l'archétype réel, dupliqué ici en dur — ce fichier ne
    // dépend jamais de entities/, voir header).
    const WINDOW_REGISTRY = { window: { nameKey: "entity.window.name" } };
    const windowRawScene = {
      id: "movement-check-window",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 0,
      entities: [
        {
          id: "window-1",
          type: "window",
          x: 5,
          variables: [{ name: "isOpen", type: "flag", initial: false, persistent: false }],
          action: [
            {
              kind: "applyEffects",
              condition: { type: "variable", scope: "entity", name: "isOpen", equals: false },
              // Pas de refusalEffects (optionnel, voir core/script-parse.js/
              // parseSingleAction) : les deux candidates couvrent tout
              // l'espace du flag, un refus n'est jamais réellement
              // atteignable ici.
              effects: [
                { type: "playSound", path: "assets/sounds/effects/window_blinds_open" },
                { type: "setVariable", scope: "entity", name: "isOpen", value: true },
              ],
            },
            {
              kind: "applyEffects",
              condition: { type: "variable", scope: "entity", name: "isOpen", equals: true },
              effects: [
                { type: "playSound", path: "assets/sounds/effects/window_blinds_close" },
                { type: "setVariable", scope: "entity", name: "isOpen", value: false },
              ],
            },
          ],
        },
      ],
    };
    const windowScene = parseScene(windowRawScene, WINDOW_REGISTRY);
    run("fenêtre : action est un TABLEAU de deux candidates", true, Array.isArray(windowScene.entities[0].action));
    run("fenêtre : isOpen initial false", false, windowScene.entities[0].variables.isOpen.value);

    let windowSession = createInitialState(windowScene, undefined, { companions: [] });

    // Identifie la candidate choisie par le CHEMIN de son "playSound" (open
    // vs close) — aucun effet "announce" ici : le son SEUL sert de retour
    // (ni refusalEffects ni confirmation parlée, voir
    // core/script-parse.js/parseSingleAction, doc/scripting.md/"Conditions
    // d'action" — refusalEffects OPTIONNELLE).
    function playSoundPathOf(chosen) {
      const effect = chosen.effects.find((e) => e.type === "playSound");
      return effect && effect.path;
    }

    // Simule "activer l'entité" : sélectionne la candidate qui matche PUIS
    // applique ses effets — exactement le pipeline de
    // view/interaction.js/interact() ("activate"), sans la vue (le
    // ROUTAGE se vérifie ICI : seul l'effet d'ÉTAT — setVariable — est
    // passé à applyEntityActionEffects/applyActionEffects, playSound/
    // announce y traversent déjà sans effet, voir plus haut — la VUE, elle,
    // ne verrait que ces deux-là).
    function activateWindow(session) {
      const world = session.worlds[session.activeWorldId];
      const entity = world.entities.find((e) => e.id === "window-1");
      const chosen = selectMatchingAction(entity.action, { entity, world, session });
      if (!chosen) return { session, chosen };
      return { session: applyEntityActionEffects(session, entity.id, chosen.effects), chosen };
    }

    const activation1 = activateWindow(windowSession);
    run(
      "fenêtre : 1ère activation — choisit la candidate OUVRIR",
      "assets/sounds/effects/window_blinds_open",
      playSoundPathOf(activation1.chosen)
    );
    run(
      "fenêtre : 1ère activation — isOpen devient true",
      true,
      activation1.session.worlds[windowScene.id].entities[0].variables.isOpen.value
    );
    windowSession = activation1.session;

    const activation2 = activateWindow(windowSession);
    run(
      "fenêtre : 2ème activation — choisit la candidate FERMER",
      "assets/sounds/effects/window_blinds_close",
      playSoundPathOf(activation2.chosen)
    );
    run(
      "fenêtre : 2ème activation — isOpen redevient false",
      false,
      activation2.session.worlds[windowScene.id].entities[0].variables.isOpen.value
    );
    windowSession = activation2.session;

    const activation3 = activateWindow(windowSession);
    run(
      "fenêtre : 3ème activation — alterne de nouveau vers OUVRIR",
      "assets/sounds/effects/window_blinds_open",
      playSoundPathOf(activation3.chosen)
    );
    windowSession = activation3.session;

    // Persistance : isOpen VOLATILE ne survit pas au save/reload — repart
    // FERMÉE même si la fenêtre était ouverte au moment de la sauvegarde
    // (voir core/save.js/resetVolatileInBag).
    run("fenêtre : isOpen ouverte juste avant la sauvegarde (préalable du test)", true, windowSession.worlds[windowScene.id].entities[0].variables.isOpen.value);
    const windowEnvelope = serializeGame(windowSession);
    const windowReload = deserializeGame(windowEnvelope);
    run("fenêtre : save/load réussit", true, windowReload.success);
    if (windowReload.success) {
      run(
        "fenêtre : isOpen (volatile) repart FERMÉE après rechargement",
        false,
        windowReload.session.worlds[windowScene.id].entities[0].variables.isOpen.value
      );
    }

    // 7) BONUS — compteur de PARTIE incrémenté par addVariable, lu par une
    // condition greaterThan (chemin entier, portée "party").
    let bonusSession = createInitialState(windowScene, undefined, {
      companions: [],
      partyVariables: [{ name: "friendship_test", type: "int", initial: 0 }],
    });
    run(
      "bonus : friendship_test greaterThan 3 -> fausse avant incrément",
      false,
      evaluateCondition({ type: "variable", scope: "party", name: "friendship_test", greaterThan: 3 }, { session: bonusSession })
    );
    for (let i = 0; i < 5; i++) {
      bonusSession = applyActionEffects([{ type: "addVariable", scope: "party", name: "friendship_test", amount: 1 }], { session: bonusSession }).session;
    }
    run("bonus : friendship_test vaut 5 après 5 addVariable(+1)", 5, bonusSession.variables.friendship_test.value);
    run(
      "bonus : friendship_test greaterThan 3 -> vraie après incrément (chemin entier condition <- effet)",
      true,
      evaluateCondition({ type: "variable", scope: "party", name: "friendship_test", greaterThan: 3 }, { session: bonusSession })
    );
    const bonusEnvelope = serializeGame(bonusSession);
    const bonusReload = deserializeGame(bonusEnvelope);
    run(
      "bonus : friendship_test (persistante par défaut) survit au save/load",
      5,
      bonusReload.success ? bonusReload.session.variables.friendship_test.value : null
    );

    // 8) Sérialisabilité générique (auditNonSerializable, lib/check.js)
    // sur une session qui exerce RÉELLEMENT les actions multiples + les
    // trois portées de variables.
    const windowLeakFindings = [];
    auditNonSerializable(windowSession, "windowSession", new Set(), windowLeakFindings);
    run("fenêtre : sérialisation — aucune fuite de non-sérialisable", 0, windowLeakFindings.length);
  }
}
