// UN TICK DE JEU COMPLET — le seul point d'entrée pour faire avancer le
// monde d'un pas : le réducteur (core/reduce.js, mouvement, comportements,
// présence...), PUIS les tranches de séquence arrivées à échéance
// (core/pending-effects.js). Appelé par la vue à chaque tick
// (view/city-screen.js/onTick) et par les vérifications : un appelant qui
// ferait le réducteur seul oublierait les séquences sans aucune erreur (un
// chien sifflé qui ne jappe jamais). Pur.
//
// L'horloge de partie et ses triggers horaires n'en font pas partie : ils
// avancent avec le temps RÉEL des frames (view/game-clock.js), pas au tick.

import { reduce } from "./reduce.js";
import { tick } from "./actions.js";
import { applyDuePendingEffects } from "./pending-effects.js";

// `dir` : l'intention de déplacement du joueur (-1, 0, +1). Renvoie
// { session, fired } : la session après le tick, et les effets de RENDU dus
// (par entité) que la vue rejoue, comme core/triggers.js/applyDueTriggers.
export function advanceTick(session, dir) {
  return applyDuePendingEffects(reduce(session, tick(dir)));
}
