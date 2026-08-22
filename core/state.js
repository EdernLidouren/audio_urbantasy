// Forme de l'état + construction de l'état initial. Pur, headless : aucun
// DOM, audio, ni API navigateur.

// MOVE_STEP est un réglage de feeling (le core lit une valeur numérique
// importée, sans dépendre de la logique de résolution) : voir
// config/tuning.js pour la valeur et son commentaire.
import { TUNING_DEFAULTS } from "../config/tuning.js";

export const MOVE_STEP = TUNING_DEFAULTS.moveStep;

// Construit l'état de départ à partir d'un niveau déjà validé (sortie de
// parseLevel). Le joueur démarre à level.playerStart.
export function createInitialState(level) {
  return {
    level,
    player: { x: level.playerStart },
  };
}
