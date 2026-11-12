// Vérifications du core — domaine « interaction ». Les règles de l'interaction du
// joueur (core/interaction.js) : ce qui est à sa portée, les candidats d'Espace et
// d'Entrée, et ce que fait une activation (action choisie, refus, collectible déjà
// consommé). Lancées par core/checks/index.js/runChecks. Pur : des entités
// littérales, aucune scène, aucun DOM ; la vue (view/occupancy.js,
// view/interaction.js) ne fait qu'en rendre le résultat.

import { activationOf, entitiesInReach, interactionCandidates } from "../interaction.js";

export default function checkInteraction(run) {
  // --- La portée : injectée (le réglage interactRange, en cascade, côté vue).
  const entities = [
    { id: "far", x: 10, observable: true, interactable: true },
    { id: "right", x: 3, observable: true, interactable: true },
    { id: "left", x: -2, observable: true, interactable: false },
    { id: "decor", x: 1, observable: false, interactable: false },
    { id: "dormant", x: 0, observable: true, interactable: true, present: false },
    { id: "wide", x: 6, observable: false, interactable: true, range: 6 },
  ];
  const rangeOf = (entity) => entity.range ?? 3;
  const ids = (list) => list.map((entity) => entity.id);
  run.same(
    "portée : à portée, triées de gauche à droite, sans décor ni dormante",
    ["left", "right", "wide"],
    ids(entitiesInReach(entities, 0, rangeOf))
  );
  run.same("portée : la portée de chaque entité, injectée", ["right", "wide"], ids(entitiesInReach(entities, 4, (entity) => entity.range ?? 1)));

  // --- Les candidats d'un verbe.
  const inReach = entitiesInReach(entities, 0, rangeOf);
  run.same("candidats : Espace, celles qu'on observe", ["left", "right"], ids(interactionCandidates(inReach, "describe", 0)));
  run.same("candidats : Entrée, celles avec qui on interagit", ["right", "wide"], ids(interactionCandidates(inReach, "activate", 0)));
  const spent = { id: "empty_display", x: 0, interactable: true, observable: true, display: {}, offer: null };
  const coin = { id: "coin", x: 1, interactable: true, observable: true };
  run.same("candidats : un présentoir vide s'efface devant ce qui reste à prendre", ["coin"], ids(interactionCandidates([spent, coin], "activate", 0)));
  run.same("candidats : seul, il reste candidat (il dira son état)", ["empty_display"], ids(interactionCandidates([spent], "activate", 0)));

  // --- L'activation.
  const perceiving = { type: "perceptionActive" };
  const on = { perceptionActive: true };
  const off = { perceptionActive: false };
  const door = { id: "door", action: { kind: "applyEffects", condition: perceiving, refusalEffects: [] } };
  run("activation : sans action déclarée, rien", null, activationOf({ id: "npc" }, off));
  run.same("activation : condition vraie, l'action a lieu", { kind: "applyEffects", refused: false }, summary(activationOf(door, on)));
  run.same("activation : condition fausse, refus", { kind: "applyEffects", refused: true }, summary(activationOf(door, off)));
  const multiple = {
    id: "shrine",
    action: [
      { kind: "applyEffects", condition: perceiving, effects: [{ type: "playSound", sound: "magic" }] },
      { kind: "loot", amount: 1 },
    ],
  };
  run("activation : actions multiples, la première qui tient", "magic", activationOf(multiple, on).action.effects[0].sound);
  run("activation : actions multiples, sinon la suivante", "loot", activationOf(multiple, off).action.kind);
  run("activation : aucune candidate ne tient, rien", null, activationOf({ id: "sealed", action: [{ kind: "applyEffects", condition: perceiving }] }, off));
  const chest = { id: "chest", action: { kind: "loot", amount: 5 } };
  run.same("activation : un collectible à prendre", { kind: "loot", refused: false }, summary(activationOf(chest, off)));
  run("activation : un collectible déjà consommé, rien (ses effets ne se rejouent pas)", null, activationOf({ ...chest, consumed: true }, off));
}

// L'essentiel d'une activation : le kind de son action et le refus.
function summary(activation) {
  return activation === null ? null : { kind: activation.action.kind, refused: activation.refused };
}
