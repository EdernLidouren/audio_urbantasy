// Vérifications de lib/ — domaine « help ». Les entrées de l'aide des
// touches (lib/help.js/helpEntries), générées depuis le registre des tables
// (lib/input.js/defineBindings) : une ligne par action, dans l'ordre,
// filtre `include`, table inconnue refusée, lignes en lecture seule.
// Lancées par core/checks/index.js/runChecks (`node tools/run-checks.js help`).
// L'ouverture de l'écran d'aide (openHelp) n'est pas vérifiée ici : elle
// pousse un écran qui s'annonce, et runChecks() se lance aussi dans le jeu.

import { helpEntries, helpKey } from "../help.js";
import { defineBindings, removeBindings } from "../input.js";
import { throws } from "../check.js";

// Traduction de test : la clé elle-même, entre crochets.
const t = (key) => `[${key}]`;

export default function checkHelp(run) {
  run("clé d'aide : help.<table>.<action>", "help.city.moveLeft", helpKey("city", "moveLeft"));

  // Tables d'essai retirées en fin de passe, quoi qu'il arrive.
  try {
    defineBindings("checks.help.a", {
      open: { keys: ["o"], mods: [] },
      close: { keys: ["Escape"], mods: [] },
    });
    defineBindings("checks.help.b", { jump: { keys: ["j"], mods: ["shift"] } });

    const entries = helpEntries([{ id: "checks.help.a" }, { id: "checks.help.b" }], t);
    run.same(
      "entrées : une par action, sections puis actions dans l'ordre",
      ["[help.checks.help.a.open]", "[help.checks.help.a.close]", "[help.checks.help.b.jump]"],
      entries.map((entry) => entry.labelParams.action)
    );
    run.same("entrées : touches décrites", ["O"], entries[0].labelParams.keys);
    run("entrées : lecture seule (pas d'onActivate)", false, entries.some((entry) => "onActivate" in entry));

    const filtered = helpEntries([{ id: "checks.help.a", include: (action) => action !== "close" }], t);
    run.same("filtre include : action retirée", ["[help.checks.help.a.open]"], filtered.map((entry) => entry.labelParams.action));

    run("table inconnue : refusée", true, throws(() => helpEntries([{ id: "checks.help.absent" }], t)));
  } finally {
    removeBindings("checks.help.a");
    removeBindings("checks.help.b");
  }
}
