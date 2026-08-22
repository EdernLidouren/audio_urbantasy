// Entrée clavier de la vue, avec deux rôles nets :
//  (a) CONTINU — suivi des touches de déplacement tenues. Lu à chaque tick
//      via getMoveIntent(), par l'écran actif qui en a besoin (la ville).
//      Ce module ne sait pas qui lit l'intention ni quand : un menu au
//      sommet de la pile ne tick jamais, donc n'appelle jamais
//      getMoveIntent() — le déplacement s'arrête par construction, sans
//      condition à vérifier ici.
//  (b) DISCRET — toute touche qui n'est pas une touche de déplacement est
//      transmise telle quelle (l'objet KeyboardEvent complet, pour l'avenir)
//      à screens.handleKeyDown, qui la route vers l'écran actif au sommet
//      de la pile. Ce module ignore le contenu des écrans.
//
// Aucune règle de jeu ici, seulement de la capture d'entrée.

import { handleKeyDown } from "../lib/screens.js";
import { ensureAudioUnlocked } from "../lib/audio.js";

// Déplacement : flèche gauche / q / a -> gauche ; flèche droite / d -> droite.
const LEFT_KEYS = new Set(["ArrowLeft", "q", "a"]);
const RIGHT_KEYS = new Set(["ArrowRight", "d"]);

// Les touches lettres varient en casse selon Maj/Verr.Maj ; les touches
// nommées (ArrowLeft, Enter, ...) ne le sont pas et doivent rester intactes.
function normalizeKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

const heldMoveKeys = new Set();

// Contexte audio suspendu tant qu'aucun geste utilisateur n'a eu lieu
// (règle autoplay) : on tente le déverrouillage une seule fois, au tout
// premier keydown, sans bloquer le traitement normal de la touche.
let audioUnlockAttempted = false;

export function initInput(target) {
  target.addEventListener("keydown", (event) => {
    if (!audioUnlockAttempted) {
      audioUnlockAttempted = true;
      ensureAudioUnlocked();
    }

    const key = normalizeKey(event.key);

    if (LEFT_KEYS.has(key) || RIGHT_KEYS.has(key)) {
      // add() est idempotent (Set) : le déplacement est piloté par cet état,
      // interrogé au tick, jamais par les keydown eux-mêmes — un repeat OS
      // ne fait donc que re-confirmer un état déjà présent, sans effet. On
      // NE sort PAS tôt ici : preventDefault doit s'appliquer à CHAQUE
      // keydown (y compris les répétitions), sinon le défilement de page
      // reprend une fois l'auto-repeat de l'OS enclenché.
      heldMoveKeys.add(key);
      event.preventDefault();
      return;
    }

    // Auto-repeat de l'OS sur une touche discrète (menu, etc.) : sans ce
    // garde-fou, tenir Entrée/une flèche de menu déclencherait son action en
    // rafale une fois le délai initial de répétition dépassé. Une pression
    // doit rester une action ponctuelle.
    if (event.repeat) return;

    handleKeyDown(event);
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
// s'annulent.
export function getMoveIntent() {
  let left = false;
  let right = false;
  for (const key of heldMoveKeys) {
    if (LEFT_KEYS.has(key)) left = true;
    if (RIGHT_KEYS.has(key)) right = true;
  }

  if (left === right) return 0;
  return left ? -1 : 1;
}
