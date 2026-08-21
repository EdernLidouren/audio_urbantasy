// Entrée clavier de la vue. Deux usages partagent la même capture : routage
// ponctuel vers le menu (une touche = une action), et suivi des touches de
// déplacement tenues (pour le jeu, lu à chaque tick via getMoveIntent()).
// Aucune règle de jeu ici, seulement de la capture d'entrée.

import { isMenuOpen, moveCursor, activateCurrent, closeTopMenu } from "./menu.js";

const MENU_KEY_HANDLERS = {
  ArrowUp: () => moveCursor(-1),
  ArrowDown: () => moveCursor(1),
  Enter: () => activateCurrent(),
  " ": () => activateCurrent(),
  Escape: () => closeTopMenu(),
};

// Déplacement : flèche gauche / q / a -> gauche ; flèche droite / d -> droite.
const LEFT_KEYS = new Set(["ArrowLeft", "q", "a"]);
const RIGHT_KEYS = new Set(["ArrowRight", "d"]);

// Les touches lettres varient en casse selon Maj/Verr.Maj ; les touches
// nommées (ArrowLeft, Enter, ...) ne le sont pas et doivent rester intactes.
function normalizeKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

const heldMoveKeys = new Set();

export function initInput(target) {
  target.addEventListener("keydown", (event) => {
    const key = normalizeKey(event.key);

    if (LEFT_KEYS.has(key) || RIGHT_KEYS.has(key)) {
      heldMoveKeys.add(key);
      // Empêche le défilement de page par les flèches.
      event.preventDefault();
      return;
    }

    if (!isMenuOpen()) return;

    const handler = MENU_KEY_HANDLERS[event.key];
    if (!handler) return;

    // Empêche le comportement par défaut du navigateur (ex. espace qui
    // scrolle la page) puisque role="application" nous laisse tout gérer.
    event.preventDefault();
    handler();
  });

  target.addEventListener("keyup", (event) => {
    heldMoveKeys.delete(normalizeKey(event.key));
  });

  // Perte de focus fenêtre (alt-tab, etc.) : sans ça, une touche relâchée
  // hors focus resterait "tenue" pour toujours (mouvement qui ne s'arrête
  // jamais).
  window.addEventListener("blur", () => {
    heldMoveKeys.clear();
  });
}

// -1 (gauche), 0 (immobile), +1 (droite). Gauche+droite tenues ensemble
// s'annulent. Un menu ouvert capte le clavier : l'intention est alors
// toujours 0, le déplacement ne s'applique qu'en dehors des menus.
export function getMoveIntent() {
  if (isMenuOpen()) return 0;

  let left = false;
  let right = false;
  for (const key of heldMoveKeys) {
    if (LEFT_KEYS.has(key)) left = true;
    if (RIGHT_KEYS.has(key)) right = true;
  }

  if (left === right) return 0;
  return left ? -1 : 1;
}
