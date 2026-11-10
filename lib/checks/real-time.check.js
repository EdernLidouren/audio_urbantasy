// Vérifications de lib/ — domaine « real-time ». L'horloge temps réel à deux
// moteurs (lib/real-time.js) : le temps n'est compté qu'une fois quel que soit le
// moteur, un consommateur inactif ne reçoit rien et ne rattrape rien. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js real-time`). Une
// horloge fictive remplace performance.now.

import { createRealTimeDriver } from "../real-time.js";

export default function checkRealTime(run) {
  let clock = 0;
  let active = true;
  const received = [];
  const driver = createRealTimeDriver({ advance: (delta) => received.push(delta), isActive: () => active, now: () => clock });

  driver.pulse();
  run.same("premier battement : rien d'écoulé", [0], received);

  // Deux moteurs, images et minuterie, mêlés : chaque battement compte depuis le
  // précédent, jamais deux fois le même temps.
  clock = 16;
  driver.pulse();
  clock = 30;
  driver.pulse();
  clock = 100;
  driver.pulse();
  run.same("deux moteurs : le temps compté une seule fois", [0, 16, 14, 70], received);
  run("deux moteurs : le total est le temps écoulé", 100, received.reduce((sum, delta) => sum + delta, 0));

  // Arrière-plan : la minuterie seule, ralentie à une fois par seconde.
  received.length = 0;
  for (let second = 1; second <= 3; second++) {
    clock = 100 + second * 1000;
    driver.pulse();
  }
  run.same("arrière-plan : un battement par seconde, chacun sa seconde", [1000, 1000, 1000], received);

  // Inactif (un menu par-dessus) : rien de reçu, et rien à rattraper au retour.
  received.length = 0;
  active = false;
  clock = 10_000;
  driver.pulse();
  clock = 20_000;
  driver.pulse();
  active = true;
  clock = 20_050;
  driver.pulse();
  run.same("inactif : rien reçu, puis seulement le temps depuis le dernier battement", [50], received);

  // Une horloge qui recule (changement d'onglet exotique) ne donne jamais de temps négatif.
  received.length = 0;
  clock = 20_000;
  driver.pulse();
  run.same("horloge qui recule : zéro", [0], received);

  received.length = 0;
  driver.reset();
  clock = 99_999;
  driver.pulse();
  run.same("remis à zéro : le battement suivant ne donne rien d'écoulé", [0], received);
}
