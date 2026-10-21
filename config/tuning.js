// Instanciation spécifique-jeu du mécanisme de cascade générique
// (lib/tuning.js) avec les valeurs (config/tuning-values.js) et le registre
// d'entités (entities/types/index.js) de Templeton. C'est le SEUL fichier à
// connecter les trois — les consommateurs ne voient que
// resolveTuning(key, entity).

import { createTuningResolver } from "../lib/tuning.js";
import { TUNING_DEFAULTS } from "./tuning-values.js";
import registry from "../entities/types/index.js";

export { TUNING_DEFAULTS };
export const resolveTuning = createTuningResolver(TUNING_DEFAULTS, registry);
