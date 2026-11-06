// Jeu des billes : les POINTS D'ACCROCHE sonores, un par type d'évènement du
// journal (core/marbles.js). Aucun son n'est branché aujourd'hui : brancher un
// son, c'est remplacer son `null` par une clé d'asset ou de pool
// ("assets/sounds/marbles/impact"), rien d'autre. Joués au moment où l'étape
// de résolution qui les porte est annoncée (view/marbles/screen.js), au
// volume de la catégorie "interface" (view/menu-sounds.js/playInterfaceSound).
// Un son manquant avertit en console, jamais de plantage.
//
// Une étape porte plusieurs évènements (phase, effet, usure) : leurs sons
// partent ENSEMBLE. Les étaler dans le temps (l'usure juste après l'effet, une
// hauteur qui monte avec l'Impact...) se fera ici, le jour où ils existeront.
// Un évènement `effect` dit aussi ce qui l'a déclenché (`trigger` : "phase",
// "hit", "knockout"), pour un son propre au Tic ou à l'Éjection ; de même
// `discarded` et sa cause ("replacement", "wear").

import { playInterfaceSound } from "../menu-sounds.js";

export const MARBLE_EVENT_SOUNDS = {
  turnStarted: null,
  draw: null,
  drawSkipped: null,
  bagRegenerated: null,
  swapped: null,
  knockout: null,
  removed: null,
  discarded: null,
  placed: null,
  hit: null,
  phase: null,
  phaseSkipped: null,
  effect: null,
  wear: null,
  impact: null,
  rotation: null,
  turnEnded: null,
  gameOver: null,
};

export function playMarbleEventSounds(events) {
  for (const event of events) {
    const path = MARBLE_EVENT_SOUNDS[event.type];
    if (path) playInterfaceSound(path, `billes, ${event.type}`);
  }
}
