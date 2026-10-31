// CHARGEMENT D'UN MONDE — le seul point d'entrée pour préparer le monde
// actif quand il (re)devient celui du joueur : franchissement d'une porte,
// carte de la ville, nouvelle partie, partie continuée ou importée,
// relecture de debug. Appelé par la vue (view/world-travel.js) AVANT de
// monter la vue du monde, et par les vérifications. Comme core/advance.js
// pour le tick : un appelant qui ferait une partie des étapes en oublierait
// une sans aucune erreur (un oiseau envolé qui ne revient jamais). Pur.
//
// Dans l'ordre :
//   - le garnissage de collecte dû (core/spawn.js/refillDueSpawns) — les
//     collectibles posés sont des entités ordinaires, découvertes au
//     montage comme les autres ;
//   - le retour des entités farouches envolées lors d'une visite
//     précédente, compagnons compris (core/startle.js) ;
//   - le retour des variables volatiles à leur initiale, une volatile ne
//     vaut que pour une visite (core/save.js/resetVisitVariables) ;
//   - l'oubli des comportements temporaires et des séquences en cours (un
//     chien sifflé juste avant de partir, core/temporary-behavior.js,
//     core/pending-effects.js).

import { refillDueSpawns } from "./spawn.js";
import { returnStartledEntities } from "./startle.js";
import { resetVisitVariables } from "./save.js";
import { forgetTemporaryBehaviors } from "./temporary-behavior.js";
import { forgetPendingEffects } from "./pending-effects.js";

// `registry` : le registre des types d'entités, injecté (le garnissage en a
// besoin pour construire les collectibles).
export function prepareLoadedWorld(session, registry) {
  const refilled = returnStartledEntities(refillDueSpawns(session, registry));
  return forgetPendingEffects(forgetTemporaryBehaviors(resetVisitVariables(refilled)));
}
