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

// --- EXPÉRIMENTATION : suppression des répétitions clavier en phase de capture ---
// Une touche maintenue génère des keydown répétés (event.repeat === true) ;
// la couche d'accessibilité relaie chacun à NVDA, qui traite chaque
// répétition comme un appui et interrompt la parole en cours. On teste si
// avaler ces répétitions le plus tôt possible (phase de capture sur window,
// avant que l'évènement n'atteigne quoi que ce soit d'autre, y compris le
// listener ci-dessus) empêche ce relais.
//
// Additif et réversible : ne touche qu'aux touches listées ci-dessous, et
// seulement quand event.repeat est vrai — le premier appui (repeat: false)
// suit le flux normal, intact. heldKeys reste mis à jour dès ce premier
// appui, donc isHeld()/le déplacement continu ne sont pas affectés par
// l'avalage des répétitions suivantes.
//
// Liste volontairement restreinte et en dur ici, en exception au principe
// habituel de ce module (aucune touche connue) : cette expérimentation a
// justement besoin de cibler des touches précises, et son intérêt dépend
// d'une capture le plus tôt possible au niveau window — donc ici, pas dans
// view/input.js.
const REPEAT_SUPPRESSED_KEYS = new Set(["ArrowLeft", "ArrowRight"]);

let repeatSuppressionEnabled = true;

export function setRepeatSuppression(enabled) {
  repeatSuppressionEnabled = !!enabled;
}

if (typeof window !== "undefined") {
  // Exposition expérimentale sur window pour basculer depuis la console sans
  // recharger, comme window.setAnnounceChannel (lib/announce.js).
  window.setRepeatSuppression = setRepeatSuppression;

  window.addEventListener(
    "keydown",
    (event) => {
      if (!repeatSuppressionEnabled) return;
      if (!event.repeat) return;
      if (!REPEAT_SUPPRESSED_KEYS.has(event.key)) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    },
    { capture: true }
  );
}
