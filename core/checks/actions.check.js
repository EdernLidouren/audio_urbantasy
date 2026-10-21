// Vérifications du core — domaine « actions ». Actions conditionnelles
// (action.condition, actions multiples). Lancées par
// core/checks/index.js/runChecks (voir ce fichier). Pur : aucun DOM, aucun
// fetch ; chaque scène est construite en dur via un objet littéral passé à
// parseScene.

import { parseScene } from "../scene.js";
import { throws } from "../../lib/check.js";

export default function checkActions(run) {
  // --- Actions CONDITIONNELLES (core/scene.js, action.condition/
  // refusalEffects ; voir view/interaction.js) — GÉNÉRIQUE à TOUT kind,
  // testé ICI en FORME/VALIDATION seulement (au chargement) ; le blocage +
  // l'exécution des effets de refus à l'interaction sont côté vue, hors de
  // portée d'un test terminal — voir "Vérifie (oreille)" pour ce volet.

  const ACTION_CONDITION_REGISTRY = { dog: { nameKey: "entity.dog.name" } };

  let validActionConditionAccepted = false;
  let parsedActionConditionEntity = null;
  try {
    const conditionalActionScene = parseScene(
      {
        id: "movement-check-action-condition-valid",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "conditional-action-ok",
            type: "dog",
            x: 5,
            action: {
              kind: "transit",
              condition: { type: "hasEquipmentTag", tag: "chic" },
              refusalEffects: [{ type: "announce", key: "door.dresscode_refused" }],
            },
          },
        ],
      },
      ACTION_CONDITION_REGISTRY
    );
    validActionConditionAccepted = true;
    parsedActionConditionEntity = conditionalActionScene.entities[0];
  } catch {
    validActionConditionAccepted = false;
  }
  run("actions conditionnelles : condition + refusalEffects valides -> chargé sans erreur", true, validActionConditionAccepted);
  run(
    "actions conditionnelles : condition/refusalEffects transportées telles quelles sur l'entité",
    "door.dresscode_refused",
    parsedActionConditionEntity && parsedActionConditionEntity.action.refusalEffects[0].key
  );

  const unknownActionConditionTagThrew = throws(() => {
    parseScene(
      {
        id: "movement-check-action-condition-bad-tag",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "conditional-action-bad-tag",
            type: "dog",
            x: 5,
            action: {
              kind: "transit",
              condition: { type: "hasEquipmentTag", tag: "does-not-exist" },
              refusalEffects: [{ type: "announce", key: "door.dresscode_refused" }],
            },
          },
        ],
      },
      ACTION_CONDITION_REGISTRY
    );
  });
  run("actions conditionnelles : tag inconnu dans action.condition -> échec clair", true, unknownActionConditionTagThrew);

  // refusalEffects est OPTIONNEL (voir "Conditions d'action"/core/script-parse.js/
  // parseSingleAction) : une condition SANS refusalEffects charge SANS
  // erreur — l'échec devient silencieux, ASSUMÉ (voir entities/types/
  // window.js, dont les deux candidates couvrent tout l'espace du flag
  // isOpen : un refus n'y est jamais réellement atteignable).
  let missingRefusalEffectsAccepted = false;
  try {
    parseScene(
      {
        id: "movement-check-action-condition-no-refusal",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          { id: "conditional-action-no-refusal", type: "dog", x: 5, action: { kind: "transit", condition: { type: "hasEquipmentTag", tag: "chic" } } },
        ],
      },
      ACTION_CONDITION_REGISTRY
    );
    missingRefusalEffectsAccepted = true;
  } catch {
    missingRefusalEffectsAccepted = false;
  }
  run("actions conditionnelles : condition SANS refusalEffects -> chargé sans erreur (optionnel)", true, missingRefusalEffectsAccepted);

  // refusalEffects, quand PRÉSENT, reste validé comme n'importe quelle liste
  // d'effets (MÊME règle qu'`effects`) : présent mais VIDE ([]) échoue —
  // DISTINCT de son absence totale (légale ci-dessus) : un champ déclaré
  // s'engage à servir à quelque chose, jamais un tableau vide laissé en
  // trace.
  const emptyRefusalEffectsThrew = throws(() => {
    parseScene(
      {
        id: "movement-check-action-condition-empty-refusal",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "conditional-action-empty-refusal",
            type: "dog",
            x: 5,
            action: { kind: "transit", condition: { type: "hasEquipmentTag", tag: "chic" }, refusalEffects: [] },
          },
        ],
      },
      ACTION_CONDITION_REGISTRY
    );
  });
  run("actions conditionnelles : refusalEffects PRÉSENT mais vide -> échec clair", true, emptyRefusalEffectsThrew);

  // refusalEffects malformé (présent, mais pas un tableau) -> même filet
  // que vide : la FORME reste validée dès que le champ est déclaré.
  const malformedRefusalEffectsThrew = throws(() => {
    parseScene(
      {
        id: "movement-check-action-condition-malformed-refusal",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "conditional-action-malformed-refusal",
            type: "dog",
            x: 5,
            action: { kind: "transit", condition: { type: "hasEquipmentTag", tag: "chic" }, refusalEffects: "oops" },
          },
        ],
      },
      ACTION_CONDITION_REGISTRY
    );
  });
  run("actions conditionnelles : refusalEffects malformé (pas un tableau) -> échec clair", true, malformedRefusalEffectsThrew);

  // Rétrocompat : une action SANS condition (tout contenu existant) reste
  // inchangée, jamais bloquée implicitement par cette nouvelle validation.
  const unconditionalActionScene = parseScene(
    {
      id: "movement-check-action-no-condition",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 0,
      entities: [{ id: "plain-action", type: "dog", x: 5, action: { kind: "transit" } }],
    },
    ACTION_CONDITION_REGISTRY
  );
  run(
    "actions conditionnelles : action SANS condition -> inchangée (rétrocompat)",
    undefined,
    unconditionalActionScene.entities[0].action.condition
  );
}
