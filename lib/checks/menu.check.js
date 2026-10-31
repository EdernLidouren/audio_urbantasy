// Vérifications de lib/ — domaine « menu ». Les calculs purs du moteur de
// menus (lib/menu.js) : cran de slider, valeur d'un choix, saut par-dessus
// les bouche-trous, pas de curseur dans la liste, règle d'annonce d'un
// ajustement. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js menu`).
//
// Jamais d'écran de menu complet ici : il annoncerait et jouerait des sons,
// et runChecks() se lance aussi dans le jeu (le lecteur d'écran lirait les
// vérifications). Les bornes du curseur, qui jouent "wrap"/"block", restent
// vérifiées en jeu (tools/test-kit.js).

import { sliderStep, choiceIndexOf, findSkipTarget, stepMenuCursor, shouldAnnounceAdjustment } from "../menu.js";

export default function checkMenu(run) {
  // --- Cran de slider : pas normal / grand pas, défauts, bornes.
  const slider = { min: 0, max: 100, step: 2, bigStep: 20 };
  run.same("slider : un cran", { next: 52, blocked: false }, sliderStep(slider, 50, 1, false));
  run.same("slider : un grand cran vers le bas", { next: 30, blocked: false }, sliderStep(slider, 50, -1, true));
  run.same("slider : cran qui dépasse le max -> borné, bloqué", { next: 100, blocked: true }, sliderStep(slider, 99, 1, false));
  run.same("slider : déjà au min -> bloqué", { next: 0, blocked: true }, sliderStep(slider, 0, -1, true));
  run.same("slider : cran qui arrive pile sur la borne -> pas bloqué", { next: 100, blocked: false }, sliderStep(slider, 98, 1, false));
  const bare = { min: 0, max: 100 };
  run.same("slider : step absent -> 1", { next: 11, blocked: false }, sliderStep(bare, 10, 1, false));
  run.same("slider : bigStep absent -> 5", { next: 15, blocked: false }, sliderStep(bare, 10, 1, true));

  // --- Choix : la valeur si elle figure, sinon le défaut, sinon la première.
  const choice = { default: "b", choices: [{ value: "a" }, { value: "b" }, { value: "c" }] };
  run("choix : valeur présente", 2, choiceIndexOf(choice, "c"));
  run("choix : valeur inconnue -> défaut", 1, choiceIndexOf(choice, "z"));
  run("choix : défaut inconnu aussi -> première", 0, choiceIndexOf({ ...choice, default: "z" }, "y"));

  // --- Saut par-dessus les bouche-trous (Ctrl+haut/bas).
  const entries = [{}, { placeholder: true }, { placeholder: true }, {}, { placeholder: true }];
  run.same("saut : prochaine entrée non bouche-trou", { index: 3, found: true }, findSkipTarget(entries, 0, 1));
  run.same("saut : aucune après -> bout de la liste", { index: 4, found: false }, findSkipTarget(entries, 3, 1));
  run.same("saut : vers le haut", { index: 0, found: true }, findSkipTarget(entries, 3, -1));

  // --- Pas de curseur DANS la liste (aucun son, aucune préférence lue).
  run.same("curseur : pas vers le bas", { index: 2, boundary: false }, stepMenuCursor(1, 1, 5));
  run.same("curseur : pas vers le haut", { index: 0, boundary: false }, stepMenuCursor(1, -1, 5));

  // --- Annonce d'un ajustement : une valeur qui change est toujours dite ;
  // contre une borne, seulement à un appui ponctuel.
  run("annonce : valeur changée, appui", true, shouldAnnounceAdjustment(true, false));
  run("annonce : valeur changée, maintien", true, shouldAnnounceAdjustment(true, true));
  run("annonce : borne, appui", true, shouldAnnounceAdjustment(false, false));
  run("annonce : borne, maintien -> silence", false, shouldAnnounceAdjustment(false, true));
}
