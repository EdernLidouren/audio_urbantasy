// Vérifications de lib/ — domaine « check ». Le moteur de vérifications lui-même
// (lib/check.js) : comptes, et surtout les SECTIONS, qui gardent une exception dans
// leur section au lieu d'interrompre tout le domaine. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js check`). Les suites
// essayées ici écrivent dans un journal muet : rien ne s'affiche.

import { runCheckSuites } from "../check.js";

export default function checkCheck(run) {
  const silent = () => {};

  // Une section qui lève : un échec, nommé, et la section suivante tourne.
  const lines = [];
  const result = runCheckSuites(
    [
      {
        name: "essai",
        check(inner) {
          inner("avant", 1, 1);
          inner.section("cassée", (r) => {
            r("dans la section, avant l'exception", 1, 1);
            throw new Error("boum");
          });
          inner.section("saine", (r) => r("après la section cassée", 2, 2));
          inner("après", 3, 3);
        },
      },
    ],
    { log: (line) => lines.push(line) }
  );
  run("section : les vérifications passées comptent", 4, result.passed);
  run("section : l'exception compte comme UN échec", 5, result.total);
  run("section : l'échec nomme la section", true, lines.some((line) => line.includes("cassée : exception")));

  // Sans section, une exception arrête le domaine (le comportement de repli).
  const bare = runCheckSuites(
    [
      {
        name: "nu",
        check(inner) {
          inner("avant", 1, 1);
          throw new Error("boum");
        },
      },
      { name: "suivant", check: (inner) => inner("domaine suivant", 1, 1) },
    ],
    { log: silent }
  );
  run.same("domaine : une exception l'interrompt, le suivant tourne", { nu: { passed: 1, total: 2 }, suivant: { passed: 1, total: 1 } }, bare.domains);

  // run.same compare les structures, ordre des clés indifférent.
  const same = runCheckSuites([{ name: "s", check: (inner) => inner.same("structure", { a: 1, b: [2] }, { b: [2], a: 1 }) }], { log: silent });
  run("run.same : structures égales", 1, same.passed);
}
