// VÉRIFICATIONS DU CORE au terminal, avec Node — les mêmes que runChecks()
// dans la console du jeu (core/checks/index.js), sans navigateur ni serveur.
//
//   node tools/run-checks.js                  -> tous les domaines
//   node tools/run-checks.js spawn save       -> seulement ces domaines
//   node tools/run-checks.js --verbose        -> affiche aussi les réussites
//   node tools/run-checks.js --warnings       -> affiche les avertissements
//
// Les vérifications provoquent volontairement des avertissements (scène dont
// le départ tombe dans un mur, chevauchements...) : masqués par défaut pour
// que le résultat reste lisible, comptés en fin de sortie. Code de sortie
// 1 si au moins une vérification échoue, pour un enchaînement scripté.

import { installFileFetch } from "./node-fetch.js";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const showWarnings = args.includes("--warnings");
const domains = args.filter((arg) => !arg.startsWith("--"));

installFileFetch();

let hiddenWarnings = 0;
if (!showWarnings) {
  console.warn = () => {
    hiddenWarnings += 1;
  };
}

const { runChecks } = await import("../core/checks/index.js");
const result = runChecks(domains.length > 0 ? domains : undefined, { verbose });

if (hiddenWarnings > 0) {
  console.log(`(${hiddenWarnings} avertissement(s) attendu(s) masqué(s), --warnings pour les voir)`);
}
process.exitCode = result.passed === result.total ? 0 : 1;
