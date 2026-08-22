// Spécifique-jeu : quelles touches signifient quoi pour Templeton. Construit
// sur lib/input.js (suivi générique des touches tenues) — n'attache aucun
// écouteur pour lire l'état, ne fait qu'interroger isHeld().

import { isHeld } from "../lib/input.js";

// Déplacement : flèche gauche / q / a -> gauche ; flèche droite / d -> droite.
const LEFT_KEYS = ["ArrowLeft", "q", "a"];
const RIGHT_KEYS = ["ArrowRight", "d"];
const MOVE_KEYS = new Set([...LEFT_KEYS, ...RIGHT_KEYS]);

function normalizeKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

// lib/input.js est générique : il ne connaît pas ces touches et ne peut donc
// pas empêcher leur comportement par défaut (défilement de page). Câblé ici
// en écouteur indépendant de la pile d'écrans, pour s'appliquer à CHAQUE
// keydown — y compris les répétitions OS d'un appui maintenu, sinon le
// défilement reprendrait une fois l'auto-repeat enclenché — quel que soit
// l'écran actif. Appelé depuis main.js, à côté de initInput.
export function preventMovementKeyScrolling(target) {
  target.addEventListener("keydown", (event) => {
    if (MOVE_KEYS.has(normalizeKey(event.key))) {
      event.preventDefault();
    }
  });
}

// -1 (gauche), 0 (immobile), +1 (droite). Gauche+droite tenues ensemble
// s'annulent.
export function getMoveIntent() {
  const left = LEFT_KEYS.some(isHeld);
  const right = RIGHT_KEYS.some(isHeld);

  if (left === right) return 0;
  return left ? -1 : 1;
}
