// Registre des comportements d'entité. Connecteur pur, zéro logique : relie
// chaque kind à son module (voir core/behaviors/wander.js, follow.js,
// goto.js). core/level.js et core/reduce.js consomment ce registre sans
// connaître aucun kind par son nom — ajouter un comportement se fait en
// créant un module + une entrée ici, sans toucher au core lui-même.

import wander from "./wander.js";
import follow from "./follow.js";
import goto from "./goto.js";

export default { wander, follow, goto };
