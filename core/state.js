// Forme de l'état + construction de l'état initial. Pur, headless : aucun
// DOM, audio, ni API navigateur.

// Unités parcourues par tick en déplacement. Levier de vitesse du jeu.
export const MOVE_STEP = 0.5;

// Construit l'état de départ à partir d'un niveau déjà validé (sortie de
// parseLevel). Le joueur démarre à level.playerStart.
export function createInitialState(level) {
  return {
    level,
    player: { x: level.playerStart },
  };
}
