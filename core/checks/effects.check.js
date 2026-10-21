// Vérifications du core — domaine « effects ». Effets d'action : rendu
// (playSound/announce), effet mixte teleport (forme et portes), contexte
// d'action complet, chaînage de giveImprovement/removeImprovement. Lancées
// par core/checks/index.js/runChecks (voir ce fichier). Pur : aucun DOM,
// aucun fetch ; chaque scène est construite en dur via un objet littéral
// passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, togglePerception } from "../state.js";
import { evaluateCondition, selectMatchingAction } from "../presence.js";
import { setWeather } from "../weather.js";
import { applyActionEffects, setVariable } from "../variables.js";
import { throws } from "../../lib/check.js";
import { VAR_ACTION_REGISTRY, sceneWithActionEffect } from "./helpers.js";

export default function checkEffects(run) {
  // --- Effets d'action : RENDU (playSound/announce) et forme de l'effet
  // MIXTE teleport (voir core/effects.js, doc/scripting.md/"Effets d'action") ---
  {
    // --- Effets de RENDU (playSound/announce, voir core/effects.js) —
    // validés en FORME seulement ICI (comme sound/announceKey avant eux) :
    // le core ignore leur SENS, la vue les exécute (hors de portée d'un
    // test terminal, voir "Vérifie (oreille)").
    const playSoundScene = parseScene(
      sceneWithActionEffect({ type: "playSound", path: "assets/sounds/effects/window_blinds_open", gain: 0.8, pitchVariation: 0.1, reverbSend: 0.2 }),
      VAR_ACTION_REGISTRY
    );
    const parsedPlaySound = playSoundScene.entities[0].action.effects[0];
    run("playSound : forme valide -> chargé sans erreur, path transporté", "assets/sounds/effects/window_blinds_open", parsedPlaySound.path);
    run("playSound : gain/pitchVariation/reverbSend transportés tels quels", true, parsedPlaySound.gain === 0.8 && parsedPlaySound.pitchVariation === 0.1 && parsedPlaySound.reverbSend === 0.2);
    run(
      "playSound : path manquant -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "playSound" }), VAR_ACTION_REGISTRY))
    );
    run(
      "playSound : gain non numérique -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "playSound", path: "x", gain: "loud" }), VAR_ACTION_REGISTRY))
    );
    // tracked (suivi vs ancré, voir doc/scripting.md/"playSound") :
    // transporté tel quel, absent si non déclaré (le défaut vit côté vue).
    run("playSound : tracked absent -> champ absent (défaut résolu par la vue)", false, "tracked" in parsedPlaySound);
    const anchoredScene = parseScene(sceneWithActionEffect({ type: "playSound", path: "x", tracked: false }), VAR_ACTION_REGISTRY);
    run("playSound : tracked:false transporté tel quel", false, anchoredScene.entities[0].action.effects[0].tracked);
    run(
      "playSound : tracked non booléen -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "playSound", path: "x", tracked: "yes" }), VAR_ACTION_REGISTRY))
    );

    // PROVENANCE (at) / NATURE (nature) — voir view/interaction.js/
    // resolvePlaySoundTarget/resolvePlaySoundNature pour la résolution des
    // défauts (hors de portée d'un test core, pure vue) ; ici seulement la
    // FORME transportée.
    const playSoundPlacementScene = parseScene(
      sceneWithActionEffect({ type: "playSound", path: "x", at: "far-bell", nature: "meta" }),
      VAR_ACTION_REGISTRY
    );
    const parsedPlaySoundPlacement = playSoundPlacementScene.entities[0].action.effects[0];
    run(
      "playSound : at/nature valides -> transportés tels quels",
      true,
      parsedPlaySoundPlacement.at === "far-bell" && parsedPlaySoundPlacement.nature === "meta"
    );
    run(
      "playSound : at vide -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "playSound", path: "x", at: "" }), VAR_ACTION_REGISTRY))
    );
    run(
      "playSound : nature inconnue -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "playSound", path: "x", nature: "bogus" }), VAR_ACTION_REGISTRY))
    );

    const announceScene = parseScene(sceneWithActionEffect({ type: "announce", key: "entity.window.opened", assertive: false }), VAR_ACTION_REGISTRY);
    const parsedAnnounce = announceScene.entities[0].action.effects[0];
    run("announce : forme valide -> chargé sans erreur, key/assertive transportés", true, parsedAnnounce.key === "entity.window.opened" && parsedAnnounce.assertive === false);
    run(
      "announce : key manquante -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "announce" }), VAR_ACTION_REGISTRY))
    );
    run(
      "announce : assertive non booléen -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "announce", key: "x", assertive: "oui" }), VAR_ACTION_REGISTRY))
    );

    // --- Effet MIXTE "teleport" (JOUEUR uniquement, voir core/effects.js)
    // — validé en FORME ici comme playSound/announce ; l'EXÉCUTION (core/
    // state.js/travelToWorld, placePlayer) est testée dans worlds.check.js.
    const teleportScene = parseScene(
      sceneWithActionEffect({ type: "teleport", target: "elsewhere", x: 4, side: "verso", reloadIfSame: true, transition: "instant" }),
      VAR_ACTION_REGISTRY
    );
    const parsedTeleport = teleportScene.entities[0].action.effects[0];
    run(
      "teleport : forme complète valide -> tous les champs transportés tels quels",
      true,
      parsedTeleport.target === "elsewhere" &&
        parsedTeleport.x === 4 &&
        parsedTeleport.side === "verso" &&
        parsedTeleport.reloadIfSame === true &&
        parsedTeleport.transition === "instant"
    );
    const minimalTeleportScene = parseScene(sceneWithActionEffect({ type: "teleport", target: "elsewhere" }), VAR_ACTION_REGISTRY);
    run(
      "teleport : target seul -> forme valide, aucun champ optionnel imposé",
      "elsewhere",
      minimalTeleportScene.entities[0].action.effects[0].target
    );
    run(
      "teleport : target manquant -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "teleport" }), VAR_ACTION_REGISTRY))
    );
    run(
      "teleport : x non numérique -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "teleport", target: "x", x: "loin" }), VAR_ACTION_REGISTRY))
    );
    run(
      "teleport : side inconnue -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "teleport", target: "x", side: "milieu" }), VAR_ACTION_REGISTRY))
    );
    run(
      "teleport : reloadIfSame non booléen -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "teleport", target: "x", reloadIfSame: "oui" }), VAR_ACTION_REGISTRY))
    );
    run(
      "teleport : transition inconnue -> erreur au chargement",
      true,
      throws(() => parseScene(sceneWithActionEffect({ type: "teleport", target: "x", transition: "boom" }), VAR_ACTION_REGISTRY))
    );

    // Liste MIXTE (état + rendu) : le core la valide/transporte comme UN
    // SEUL vocabulaire, jamais deux registres — voir core/effects.js.
    const mixedRenderStateScene = parseScene(
      {
        id: "movement-check-mixed-render-state",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "e1",
            type: "npc",
            x: 5,
            variables: [{ name: "isOpen", type: "flag", initial: false }],
            action: {
              kind: "applyEffects",
              effects: [
                { type: "playSound", path: "assets/sounds/effects/window_blinds_open" },
                { type: "setVariable", scope: "entity", name: "isOpen", value: true },
                { type: "announce", key: "entity.window.opened" },
              ],
            },
          },
        ],
      },
      VAR_ACTION_REGISTRY
    );
    run("effets mixtes : liste de 3 types différents chargée sans erreur", 3, mixedRenderStateScene.entities[0].action.effects.length);

    run(
      "action : tableau vide -> erreur au chargement",
      true,
      throws(() =>
        parseScene(
          { id: "movement-check-empty-action", titleKey: "scene.demo.name", length: 10, playerStart: 0, entities: [{ id: "e1", type: "npc", x: 5, action: [] }] },
          VAR_ACTION_REGISTRY
        )
      )
    );
    run(
      "action : candidate sans refusalEffects malgré une condition -> chargé sans erreur (optionnel, RÉUTILISE la même règle, par candidate)",
      false,
      throws(() =>
        parseScene(
          {
            id: "movement-check-candidate-no-refusal",
            titleKey: "scene.demo.name",
            length: 10,
            playerStart: 0,
            entities: [
              {
                id: "e1",
                type: "npc",
                x: 5,
                variables: [{ name: "isOpen", type: "flag", initial: false }],
                action: [
                  {
                    kind: "applyEffects",
                    condition: { type: "variable", scope: "entity", name: "isOpen", equals: false },
                    effects: [{ type: "setVariable", scope: "entity", name: "isOpen", value: true }],
                  },
                ],
              },
            ],
          },
          VAR_ACTION_REGISTRY
        )
      )
    );
  }

  // 9) TELEPORT — la porte n'est plus un cas spécial (voir core/scene.js,
  // entities/types/door.js) : deux confirmations structurelles,
  // l'EXÉCUTION (view/world-travel.js/executeTeleport) restant
  // hors de portée d'un test core (voir "Vérifie (oreille)").
  {
    // a) Actions multiples filtrées par condition, teleport vers des
    // cibles DIFFÉRENTES — tombe GRATUITEMENT du mécanisme existant
    // (core/presence.js/selectMatchingAction), aucun code dédié. Condition
    // "variable" scope "entity" (même patron que la fenêtre, actions.check.js) :
    // une porte VIP dont la destination dépend d'un flag PROPRE à cette
    // porte (ex. posé par un effet ailleurs dans la partie).
    const CONDITIONAL_TELEPORT_REGISTRY = { door: { nameKey: "entity.door.name" } };
    const conditionalTeleportScene = parseScene(
      {
        id: "movement-check-conditional-teleport",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "fancy-door",
            type: "door",
            x: 5,
            variables: [{ name: "vipUnlocked", type: "flag", initial: false }],
            action: [
              {
                kind: "applyEffects",
                condition: { type: "variable", scope: "entity", name: "vipUnlocked", equals: true },
                refusalEffects: [{ type: "announce", key: "entity.door.description" }],
                effects: [{ type: "teleport", target: "vip-lounge" }],
              },
              { kind: "applyEffects", effects: [{ type: "teleport", target: "main-hall" }] },
            ],
          },
        ],
      },
      CONDITIONAL_TELEPORT_REGISTRY
    );
    const fancyDoor = conditionalTeleportScene.entities[0];
    const lockedChoice = selectMatchingAction(fancyDoor.action, { entity: fancyDoor });
    run("teleport conditionnel : flag à false -> candidate catch-all, cible 'main-hall'", "main-hall", lockedChoice.effects[0].target);
    const unlockedDoor = { ...fancyDoor, variables: { vipUnlocked: { ...fancyDoor.variables.vipUnlocked, value: true } } };
    const unlockedChoice = selectMatchingAction(unlockedDoor.action, { entity: unlockedDoor });
    run("teleport conditionnel : flag à true -> PREMIÈRE candidate, cible 'vip-lounge'", "vip-lounge", unlockedChoice.effects[0].target);

    // b) teleport déclenché par une entité qui N'EST PAS une porte (trigger
    // temporel, vigile...) — même vocabulaire, aucune restriction de type.
    const NON_DOOR_TELEPORT_REGISTRY = { npc: { nameKey: "entity.npc.name" } };
    const nonDoorTeleportScene = parseScene(
      {
        id: "movement-check-non-door-teleport",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "closing-time-guard",
            type: "npc",
            x: 5,
            action: { kind: "applyEffects", effects: [{ type: "teleport", target: "demo", x: 2, transition: "instant" }] },
          },
        ],
      },
      NON_DOOR_TELEPORT_REGISTRY
    );
    run(
      "teleport hors porte : un NPC porte un teleport valide -> chargé sans erreur",
      "teleport",
      nonDoorTeleportScene.entities[0].action.effects[0].type
    );
  }

  // 10) CONTEXTE D'ACTION complet : une `action.condition` doit voir
  // `session` (hasImprovement, weather, perceptionActive, variable scope
  // "scene"/"party"), sinon ces conditions seraient STRUCTURELLEMENT
  // toujours fausses hors mode debug (view/interaction.js/actionContext).
  // Ce fichier reste headless : il ne peut PAS importer view/interaction.js (Howler/DOM en
  // cascade) pour appeler le VRAI actionContext — il reconstruit ici, à la
  // main, EXACTEMENT la forme que actionContext produit désormais (même
  // dérivation, reprise au mot près : perceptionActive/weather/world lus
  // depuis la session, comme core/reduce.js/presenceContext), et vérifie que
  // evaluateCondition (le SEUL évaluateur, partagé avec presence[].when) s'y
  // comporte enfin comme sur presence[].when — DANS LES DEUX SENS (fausse
  // PUIS vraie), pour ne pas juste remplacer un "toujours faux" par un
  // "toujours vrai" sans le prouver. Le câblage RÉEL de la vue (le provider,
  // city-screen.js) reste hors de portée d'un test core, à vérifier à
  // l'oreille (voir CLAUDE.md, "Vérifie (oreille)").
  {
    const ANGLE_MORT_REGISTRY = { door: { nameKey: "entity.door.name" } };
    const angleMortScene = parseScene(
      {
        id: "movement-check-action-context",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        variables: [{ name: "doorUnlocked", type: "flag", initial: false }],
        entities: [{ id: "gated-door", type: "door", x: 5 }],
      },
      ANGLE_MORT_REGISTRY
    );
    const angleMortSession = createInitialState(angleMortScene, "action-context-check", {
      companions: [],
      partyVariables: [{ name: "questDone", type: "flag", initial: false }],
    });
    const doorEntity = angleMortSession.worlds[angleMortScene.id].entities[0];

    // Forme EXACTE produite par view/interaction.js/actionContext(entity)
    // depuis ce correctif — voir header de ce bloc.
    function buildActionContextLike(session, entity) {
      return {
        entity,
        playerEquipment: session.equipment,
        time: session.time,
        perceptionActive: session.perceptionActive,
        weather: session.weather.state,
        world: session.worlds[session.activeWorldId],
        session,
      };
    }

    const withFlashlight = applyActionEffects([{ type: "giveImprovement", id: "flashlight" }], { session: angleMortSession }).session;
    run(
      "action.condition (contexte réel) : hasImprovement fausse sans l'amélioration",
      false,
      evaluateCondition({ type: "hasImprovement", id: "flashlight" }, buildActionContextLike(angleMortSession, doorEntity))
    );
    run(
      "action.condition (contexte réel) : hasImprovement vraie une fois possédée — angle mort comblé",
      true,
      evaluateCondition({ type: "hasImprovement", id: "flashlight" }, buildActionContextLike(withFlashlight, doorEntity))
    );

    const rainySession = setWeather(angleMortSession, "rain");
    run(
      "action.condition (contexte réel) : weather fausse hors de l'état demandé",
      false,
      evaluateCondition({ type: "weather", state: "rain" }, buildActionContextLike(angleMortSession, doorEntity))
    );
    run(
      "action.condition (contexte réel) : weather vraie dans l'état demandé — angle mort comblé",
      true,
      evaluateCondition({ type: "weather", state: "rain" }, buildActionContextLike(rainySession, doorEntity))
    );

    const perceivingSession = togglePerception(angleMortSession);
    run(
      "action.condition (contexte réel) : perceptionActive fausse par défaut",
      false,
      evaluateCondition({ type: "perceptionActive" }, buildActionContextLike(angleMortSession, doorEntity))
    );
    run(
      "action.condition (contexte réel) : perceptionActive vraie une fois activée — angle mort comblé",
      true,
      evaluateCondition({ type: "perceptionActive" }, buildActionContextLike(perceivingSession, doorEntity))
    );

    const unlockedWorld = setVariable({ world: angleMortSession.worlds[angleMortScene.id] }, "scene", "doorUnlocked", true);
    const unlockedSession = { ...angleMortSession, worlds: { ...angleMortSession.worlds, [angleMortScene.id]: unlockedWorld } };
    run(
      "action.condition (contexte réel) : variable scope scene fausse avant setVariable",
      false,
      evaluateCondition({ type: "variable", scope: "scene", name: "doorUnlocked", equals: true }, buildActionContextLike(angleMortSession, doorEntity))
    );
    run(
      "action.condition (contexte réel) : variable scope scene vraie après setVariable — angle mort comblé",
      true,
      evaluateCondition({ type: "variable", scope: "scene", name: "doorUnlocked", equals: true }, buildActionContextLike(unlockedSession, doorEntity))
    );

    const questDoneSession = applyActionEffects(
      [{ type: "setVariable", scope: "party", name: "questDone", value: true }],
      { session: angleMortSession }
    ).session;
    run(
      "action.condition (contexte réel) : variable scope party fausse avant setVariable",
      false,
      evaluateCondition({ type: "variable", scope: "party", name: "questDone", equals: true }, buildActionContextLike(angleMortSession, doorEntity))
    );
    run(
      "action.condition (contexte réel) : variable scope party vraie après setVariable — angle mort comblé",
      true,
      evaluateCondition({ type: "variable", scope: "party", name: "questDone", equals: true }, buildActionContextLike(questDoneSession, doorEntity))
    );
  }

  // 11) Chaînage défensif de giveImprovement/removeImprovement (voir audit
  // de santé, point de consolidation modéré ; core/variables.js/
  // applyActionEffects) : un contexte SANS `session` (incomplet — même genre
  // de trou que le point 10 ci-dessus, mais côté ÉCRITURE plutôt que
  // lecture) doit dégrader en NO-OP PROPRE, jamais lever une exception,
  // exactement comme setVariable/toggleVariable/addVariable le font déjà
  // via carrierForScope.
  {
    const contextWithoutSession = { entity: {} };
    let gaveThrew = false;
    let afterGive = contextWithoutSession;
    try {
      afterGive = applyActionEffects([{ type: "giveImprovement", id: "flashlight" }], contextWithoutSession);
    } catch {
      gaveThrew = true;
    }
    run("applyActionEffects : giveImprovement sur contexte sans session -> ne lève pas", false, gaveThrew);
    run("applyActionEffects : giveImprovement sur contexte sans session -> contexte inchangé", contextWithoutSession, afterGive);

    let removeThrew = false;
    let afterRemove = contextWithoutSession;
    try {
      afterRemove = applyActionEffects([{ type: "removeImprovement", id: "flashlight" }], contextWithoutSession);
    } catch {
      removeThrew = true;
    }
    run("applyActionEffects : removeImprovement sur contexte sans session -> ne lève pas", false, removeThrew);
    run("applyActionEffects : removeImprovement sur contexte sans session -> contexte inchangé", contextWithoutSession, afterRemove);
  }
}
