// Les domaines de vérification du JEU DES BILLES, dans leur ordre d'exécution.
// Lancés par le point d'entrée unique des vérifications (core/checks/index.js,
// `node tools/run-checks.js marbles-screen` pour un seul), qui les ajoute aux
// siens : même forme qu'un domaine du core (un ./<domaine>.check.js qui exporte
// par défaut `function check<Domaine>(run)`).
//
// Ils jouent la table de billes figée des vérifications (./fixtures/marbles.js),
// jamais les vraies billes ; celles-ci n'ont que leur contrat, domaine
// marbles-content. Seuls les outils (domaine marbles-tools), qui servent les vraies
// billes, les jouent aussi, sans attente sur l'effet d'une bille. Les fixtures communes à plusieurs domaines des billes vivent
// dans ./helpers.js, ou dans ./fixtures/ quand elles forment un tout (la propriété
// « prévision = réel », ./fixtures/forecast-property.js). L'écran des billes se
// joue au clavier par son banc d'essai, ./fixtures/screen-bench.js (domaine
// marbles-screen, `nodeOnly` : sauté dans la console du jeu, où il écrirait dans
// les vraies régions d'annonce, que NVDA lirait). Organisation :
// doc/marbles-tools.md, « Les vérifications du jeu des billes ».

import checkMarbles from "./marbles.check.js";
import checkMarblesDefinitions from "./marbles-definitions.check.js";
import checkMarblesPocket from "./marbles-pocket.check.js";
import checkMarblesPath from "./marbles-path.check.js";
import checkMarblesZones from "./marbles-zones.check.js";
import checkMarblesFamilies from "./marbles-families.check.js";
import checkMarblesRelative from "./marbles-relative.check.js";
import checkMarblesStatuses from "./marbles-statuses.check.js";
import checkMarblesChoice from "./marbles-choice.check.js";
import checkMarblesBus from "./marbles-bus.check.js";
import checkMarblesTally from "./marbles-tally.check.js";
import checkMarblesForecast from "./marbles-forecast.check.js";
import checkMarblesView from "./marbles-view.check.js";
import checkMarblesSequence from "./marbles-sequence.check.js";
import checkMarblesTools from "./marbles-tools.check.js";
import checkMarblesContent from "./marbles-content.check.js";
import checkMarblesScreen from "./marbles-screen.check.js";

export const MARBLES_SUITES = [
  { name: "marbles", check: checkMarbles },
  { name: "marbles-definitions", check: checkMarblesDefinitions },
  { name: "marbles-pocket", check: checkMarblesPocket },
  { name: "marbles-path", check: checkMarblesPath },
  { name: "marbles-zones", check: checkMarblesZones },
  { name: "marbles-families", check: checkMarblesFamilies },
  { name: "marbles-relative", check: checkMarblesRelative },
  { name: "marbles-statuses", check: checkMarblesStatuses },
  { name: "marbles-choice", check: checkMarblesChoice },
  { name: "marbles-bus", check: checkMarblesBus },
  { name: "marbles-tally", check: checkMarblesTally },
  { name: "marbles-forecast", check: checkMarblesForecast },
  { name: "marbles-view", check: checkMarblesView },
  { name: "marbles-sequence", check: checkMarblesSequence },
  { name: "marbles-tools", check: checkMarblesTools },
  { name: "marbles-content", check: checkMarblesContent },
  { name: "marbles-screen", check: checkMarblesScreen, nodeOnly: true },
];
