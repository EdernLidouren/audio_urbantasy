// Brique portable : capture clavier générique. Ne connaît ni les touches
// "utiles" au jeu (aucune liste de touches en dur), ni l'audio — c'est au
// projet consommateur de brancher ce qu'il veut sur onFirstInput.
//
// Deux rôles nets :
//  (a) CONTINU — suivi de TOUTES les touches tenues, exposé via isHeld(key).
//      Ce module ne sait pas lesquelles sont "de mouvement" ni qui les lit :
//      c'est au projet de les interpréter (voir view/input.js pour
//      Templeton).
//  (b) DISCRET — toute touche non répétée est transmise telle quelle
//      (l'objet KeyboardEvent complet) à screens.handleKeyDown, qui la route
//      vers l'écran actif au sommet de la pile.

import { handleKeyDown } from "./screens.js";

// Les touches lettres varient en casse selon Maj/Verr.Maj ; les touches
// nommées (ArrowLeft, Enter, ...) ne le sont pas et doivent rester intactes.
function normalizeKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

const heldKeys = new Set();

export function initInput(target, { onFirstInput } = {}) {
  let firstInputHandled = false;

  target.addEventListener("keydown", (event) => {
    if (!firstInputHandled) {
      firstInputHandled = true;
      if (onFirstInput) onFirstInput();
    }

    heldKeys.add(normalizeKey(event.key));

    // Auto-repeat de l'OS sur une touche discrète : sans ce garde-fou, tenir
    // une touche déclencherait son action en rafale une fois le délai
    // initial de répétition dépassé. Une pression doit rester ponctuelle.
    // (heldKeys.add ci-dessus reste appelé à chaque répétition : c'est un
    // Set, donc idempotent, et l'état continu doit refléter la touche tenue
    // dès le premier keydown, sans attendre l'auto-repeat.)
    if (event.repeat) return;

    handleKeyDown(event);
  });

  target.addEventListener("keyup", (event) => {
    heldKeys.delete(normalizeKey(event.key));
  });

  // Perte de focus fenêtre (alt-tab, etc.) : sans ça, une touche relâchée
  // hors focus resterait "tenue" pour toujours.
  window.addEventListener("blur", () => {
    heldKeys.clear();
  });
}

export function isHeld(key) {
  return heldKeys.has(normalizeKey(key));
}
