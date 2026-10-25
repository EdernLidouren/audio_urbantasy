// Point d'entrée des vérifications du core, sans DOM : au terminal avec Node
// (`node tools/run-checks.js`, voir son en-tête), ou depuis la console du
// navigateur. Exposé par main.js sur `window` :
//   runChecks()                    -> tous les domaines
//   runChecks("spawn")             -> un seul domaine
//   runChecks(["save", "faces"])   -> plusieurs domaines
//   runChecks(undefined, { verbose: true }) -> affiche aussi les réussites
// Chaque domaine (./<domaine>.check.js) est AUTONOME : il construit ses
// propres scènes, ne lit aucune variable d'un autre domaine, et peut être
// lancé seul. Les fixtures communes à plusieurs domaines vivent dans
// ./helpers.js ; le moteur générique (compteurs, récapitulatif, audit de
// sérialisabilité) dans lib/check.js.
//
// Ajouter un domaine : un fichier ./<domaine>.check.js qui exporte par
// défaut `function check<Domaine>(run)`, et sa ligne dans SUITES (l'ordre
// de SUITES est l'ordre d'exécution et d'affichage). Un mécanisme PORTABLE
// de lib/ range ses vérifications dans lib/checks/<domaine>.check.js, même
// forme, et passe par ce même point d'entrée (domaine "i18n").

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
import checkActions from "./actions.check.js";
import checkPerception from "./perception.check.js";
import checkWeather from "./weather.check.js";
import checkEphemerals from "./ephemerals.check.js";
import checkScene from "./scene.check.js";
import checkVariables from "./variables.check.js";
import checkEffects from "./effects.check.js";
import checkTrade from "./trade.check.js";
import checkSpawn from "./spawn.check.js";
import checkCollections from "./collections.check.js";
import checkTriggers from "./triggers.check.js";
import checkNewGame from "./new-game.check.js";
import checkStartle from "./startle.check.js";
// Domaines de lib/ (mécanismes portables), lancés par le même point
// d'entrée : une seule commande, un seul récapitulatif.
import checkI18n from "../../lib/checks/i18n.check.js";
import checkInput from "../../lib/checks/input.check.js";

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
  { name: "actions", check: checkActions },
  { name: "perception", check: checkPerception },
  { name: "weather", check: checkWeather },
  { name: "ephemerals", check: checkEphemerals },
  { name: "scene", check: checkScene },
  { name: "variables", check: checkVariables },
  { name: "effects", check: checkEffects },
  { name: "trade", check: checkTrade },
  { name: "spawn", check: checkSpawn },
  { name: "collections", check: checkCollections },
  { name: "triggers", check: checkTriggers },
  { name: "new-game", check: checkNewGame },
  { name: "startle", check: checkStartle },
  { name: "i18n", check: checkI18n },
  { name: "input", check: checkInput },
];

// Noms des domaines, dans l'ordre d'exécution.
export const CHECK_DOMAINS = SUITES.map((suite) => suite.name);

// Lance les vérifications (toutes, ou les domaines nommés par `only`) ;
// rend `{ passed, total, domains }` (voir lib/check.js/runCheckSuites).
export function runChecks(only, options = {}) {
  return runCheckSuites(SUITES, { only, ...options });
}
