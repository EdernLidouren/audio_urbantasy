// Point d'entrée des vérifications du core, sans DOM : au terminal avec Node
// (`node tools/run-checks.js`, voir son en-tête), ou depuis la console du
// navigateur. Exposé par main.js sur `window`, chargé seulement à l'appel (le
// jeu ne charge jamais les vérifications au démarrage ; le résultat arrive par
// une promesse) :
//   runChecks()                    -> tous les domaines
//   runChecks("spawn")             -> un seul domaine
//   runChecks(["save", "faces"])   -> plusieurs domaines
//   runChecks(undefined, { verbose: true }) -> affiche aussi les réussites
// Chaque domaine (./<domaine>.check.js) est AUTONOME : il construit ses
// propres scènes, ne lit aucune variable d'un autre domaine, et peut être
// lancé seul. Les fixtures communes à plusieurs domaines vivent dans
// ./helpers.js, ou dans ./fixtures/ quand elles forment un tout (la table de
// billes des vérifications, ./fixtures/marbles.js ; la propriété « prévision =
// réel », ./fixtures/forecast-property.js) ; le moteur générique (compteurs,
// sections, récapitulatif, audit de sérialisabilité) dans lib/check.js. Un
// domaine se découpe en sections (`run.section`) : une exception n'arrête que
// la sienne.
// Les domaines des billes (marbles*) jouent la table figée de ./fixtures/, jamais
// les vraies billes ; celles-ci n'ont que leur contrat, domaine marbles-content
// (doc/marbles-tools.md, « Les vérifications du jeu des billes »).
//
// Ajouter un domaine : un fichier ./<domaine>.check.js qui exporte par
// défaut `function check<Domaine>(run)`, et sa ligne dans SUITES (l'ordre
// de SUITES est l'ordre d'exécution et d'affichage). Un mécanisme PORTABLE
// de lib/ range ses vérifications dans lib/checks/<domaine>.check.js, même
// forme, et passe par ce même point d'entrée (domaines "i18n", "check"...).

import { runCheckSuites } from "../../lib/check.js";
import checkMovement from "./movement.check.js";
import checkBehaviors from "./behaviors.check.js";
import checkEntities from "./entities.check.js";
import checkWorlds from "./worlds.check.js";
import checkFaces from "./faces.check.js";
import checkTime from "./time.check.js";
import checkConditions from "./conditions.check.js";
import checkCompanions from "./companions.check.js";
import checkRoutines from "./routines.check.js";
import checkSurfaces from "./surfaces.check.js";
import checkSave from "./save.check.js";
import checkInventory from "./inventory.check.js";
import checkImprovements from "./improvements.check.js";
import checkEmotes from "./emotes.check.js";
import checkActions from "./actions.check.js";
import checkPerception from "./perception.check.js";
import checkWeather from "./weather.check.js";
import checkEphemerals from "./ephemerals.check.js";
import checkScene from "./scene.check.js";
import checkVariables from "./variables.check.js";
import checkEffects from "./effects.check.js";
import checkTrade from "./trade.check.js";
import checkDisplay from "./display.check.js";
import checkSpawn from "./spawn.check.js";
import checkMining from "./mining.check.js";
import checkCollections from "./collections.check.js";
import checkTriggers from "./triggers.check.js";
import checkNewGame from "./new-game.check.js";
import checkStartle from "./startle.check.js";
import checkDormancy from "./dormancy.check.js";
import checkTemporaryBehavior from "./temporary-behavior.check.js";
import checkSequence from "./sequence.check.js";
import checkRotation from "./rotation.check.js";
import checkMarbles from "./marbles.check.js";
import checkMarblesPocket from "./marbles-pocket.check.js";
import checkMarblesChoice from "./marbles-choice.check.js";
import checkMarblesBus from "./marbles-bus.check.js";
import checkMarblesTally from "./marbles-tally.check.js";
import checkMarblesForecast from "./marbles-forecast.check.js";
import checkMarblesView from "./marbles-view.check.js";
import checkMarblesSequence from "./marbles-sequence.check.js";
import checkMarblesTools from "./marbles-tools.check.js";
import checkMarblesContent from "./marbles-content.check.js";
// Domaines de lib/ (mécanismes portables), lancés par le même point
// d'entrée : une seule commande, un seul récapitulatif.
import checkI18n from "../../lib/checks/i18n.check.js";
import checkI18nContent from "./i18n-content.check.js";
import checkInput from "../../lib/checks/input.check.js";
import checkMenu from "../../lib/checks/menu.check.js";
import checkDetailCard from "../../lib/checks/detail-card.check.js";
import checkHelp from "../../lib/checks/help.check.js";
import checkAudioRetention from "../../lib/checks/audio-retention.check.js";
import checkRealTime from "../../lib/checks/real-time.check.js";
import checkCheck from "../../lib/checks/check.check.js";

const SUITES = [
  { name: "movement", check: checkMovement },
  { name: "behaviors", check: checkBehaviors },
  { name: "entities", check: checkEntities },
  { name: "worlds", check: checkWorlds },
  { name: "faces", check: checkFaces },
  { name: "time", check: checkTime },
  { name: "conditions", check: checkConditions },
  { name: "companions", check: checkCompanions },
  { name: "routines", check: checkRoutines },
  { name: "surfaces", check: checkSurfaces },
  { name: "save", check: checkSave },
  { name: "inventory", check: checkInventory },
  { name: "improvements", check: checkImprovements },
  { name: "emotes", check: checkEmotes },
  { name: "actions", check: checkActions },
  { name: "perception", check: checkPerception },
  { name: "weather", check: checkWeather },
  { name: "ephemerals", check: checkEphemerals },
  { name: "scene", check: checkScene },
  { name: "variables", check: checkVariables },
  { name: "effects", check: checkEffects },
  { name: "trade", check: checkTrade },
  { name: "display", check: checkDisplay },
  { name: "spawn", check: checkSpawn },
  { name: "mining", check: checkMining },
  { name: "collections", check: checkCollections },
  { name: "triggers", check: checkTriggers },
  { name: "new-game", check: checkNewGame },
  { name: "startle", check: checkStartle },
  { name: "dormancy", check: checkDormancy },
  { name: "temporary-behavior", check: checkTemporaryBehavior },
  { name: "sequence", check: checkSequence },
  { name: "rotation", check: checkRotation },
  { name: "marbles", check: checkMarbles },
  { name: "marbles-pocket", check: checkMarblesPocket },
  { name: "marbles-choice", check: checkMarblesChoice },
  { name: "marbles-bus", check: checkMarblesBus },
  { name: "marbles-tally", check: checkMarblesTally },
  { name: "marbles-forecast", check: checkMarblesForecast },
  { name: "marbles-view", check: checkMarblesView },
  { name: "marbles-sequence", check: checkMarblesSequence },
  { name: "marbles-tools", check: checkMarblesTools },
  { name: "marbles-content", check: checkMarblesContent },
  { name: "i18n", check: checkI18n },
  { name: "i18n-content", check: checkI18nContent },
  { name: "input", check: checkInput },
  { name: "menu", check: checkMenu },
  { name: "detail-card", check: checkDetailCard },
  { name: "help", check: checkHelp },
  { name: "audio-retention", check: checkAudioRetention },
  { name: "real-time", check: checkRealTime },
  { name: "check", check: checkCheck },
];

// Noms des domaines, dans l'ordre d'exécution.
export const CHECK_DOMAINS = SUITES.map((suite) => suite.name);

// Lance les vérifications (toutes, ou les domaines nommés par `only`) ;
// rend `{ passed, total, domains }` (voir lib/check.js/runCheckSuites).
export function runChecks(only, options = {}) {
  return runCheckSuites(SUITES, { only, ...options });
}
