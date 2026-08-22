// Forme de l'état + construction de l'état initial. Pur, headless : aucun
// DOM, audio, ni API navigateur.

// MOVE_STEP est un réglage de feeling. Le core importe UNIQUEMENT les
// valeurs pures (config/tuning-values.js), jamais config/tuning.js — ce
// dernier connecte aussi le registre d'entités et la logique de cascade, que
// le core n'a aucune raison de draîner pour lire un seul nombre.
import { TUNING_DEFAULTS } from "../config/tuning-values.js";

export const MOVE_STEP = TUNING_DEFAULTS.moveStep;

// Construit l'état de départ à partir d'un niveau déjà validé (sortie de
// parseLevel). Le joueur démarre à level.playerStart.
export function createInitialState(level) {
  return {
    level,
    player: { x: level.playerStart },
  };
}
