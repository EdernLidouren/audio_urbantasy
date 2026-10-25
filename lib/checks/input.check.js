// Vérifications de lib/ — domaine « input ». Moteur d'entrée (lib/input.js) :
// registre des tables (defineBindings) et noms de touches pour l'aide
// (describeBinding, needsKeyName, keyNameKey). Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js input`).

import { defineBindings, bindingTable, removeBindings, describeBinding, needsKeyName, keyNameKey } from "../input.js";
import { throws } from "../check.js";

// Noms de touches de test : la clé elle-même, entre crochets, pour voir
// quel nom l'aide a demandé.
const t = (key) => `[${key}]`;

export default function checkInput(run) {
  // --- Registre : une table se retrouve par son id, un id ne sert qu'une fois.
  // Table d'essai retirée en fin de passe, quoi qu'il arrive.
  try {
    const table = defineBindings("checks.input.sample", { act: { keys: ["a"], mods: [] } });
    run("registre : la table rendue est celle déclarée", table, bindingTable("checks.input.sample"));
    run("registre : id déjà pris refusé", true, throws(() => defineBindings("checks.input.sample", {})));
    run("registre : id inconnu -> undefined", undefined, bindingTable("checks.input.absent"));
  } finally {
    removeBindings("checks.input.sample");
  }
  run("registre : table d'essai retirée", undefined, bindingTable("checks.input.sample"));

  // --- Touches à nommer : lettres, chiffres et touches de fonction
  // s'écrivent telles quelles, tout le reste a un nom de la langue.
  run("lettre : écrite telle quelle", false, needsKeyName("q"));
  run("chiffre : écrit tel quel", false, needsKeyName("5"));
  run("touche de fonction : écrite telle quelle", false, needsKeyName("F1"));
  run("flèche : nommée", true, needsKeyName("ArrowUp"));
  run("espace : nommée", true, needsKeyName(" "));
  run("espace : clé key.Space", "key.Space", keyNameKey(" "));
  run("touche nommée : clé key.<touche>", "key.Escape", keyNameKey("Escape"));

  // --- Description d'un binding : une chaîne par touche, modificateurs
  // en tête, dans l'ordre Ctrl, Alt, Maj.
  run.same("plusieurs touches", ["[key.ArrowLeft]", "Q", "A"], describeBinding({ keys: ["ArrowLeft", "q", "a"], mods: [] }, t));
  run.same("lettre avec Maj", ["[key.mod.shift]+S"], describeBinding({ keys: ["s"], mods: ["shift"] }, t));
  run.same("ordre des modificateurs", ["[key.mod.ctrl]+[key.mod.shift]+[key.ArrowUp]"], describeBinding({ keys: ["ArrowUp"], mods: ["shift", "ctrl"] }, t));
  run.same("touche de fonction", ["F1"], describeBinding({ keys: ["F1"], mods: [] }, t));
  run.same("espace", ["[key.Space]"], describeBinding({ keys: [" "], mods: [] }, t));
}
