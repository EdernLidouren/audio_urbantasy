// Définition du menu principal. Un fichier par menu : voir aussi
// options-menu.js. Ne contient aucune règle de jeu, uniquement de la
// structure de menu + des callbacks d'activation.
//
// title et les labels d'entrées sont des CLÉS de traduction (jamais des
// chaînes déjà traduites) : lib/menu.js les résout via le t reçu en
// paramètre, au moment de l'annonce.
//
// Composition DYNAMIQUE : "Continuer" n'apparaît que si une sauvegarde
// CHARGEABLE existe (voir main.js, qui recalcule ça à chaque ouverture de ce
// menu et reconstruit les entrées en conséquence — createMainMenu() ne fait
// que traduire un état déjà connu en entrées, jamais sa propre détection).

import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { t } from "../../data/i18n/index.js";
import { createOptionsMenu } from "./options-menu.js";
import { hasSave } from "../save-storage.js";

// Écran de confirmation, DESTRUCTIF par écrasement PARESSEUX (voir
// startNewGame côté appelant : rien n'est effacé ici, seule la PROCHAINE
// sauvegarde écrasera l'ancienne) — même principe et mêmes clés génériques
// "Annuler"/"Confirmer" que options-menu.js/openResetAllConfirmation et
// save-menu.js/openImportConfirmation : "Annuler" en première entrée
// (curseur par défaut), une pression rapide/accidentelle d'Entrée reste sans
// effet.
function openNewGameConfirmation(startNewGame) {
  const menu = {
    title: "menu.main.new_game_confirm_title",
    closable: true, // Échap = annuler
    entries: [
      {
        label: "menu.options.reset_all_cancel",
        onActivate: () => popScreen(),
      },
      {
        label: "menu.options.reset_all_confirm",
        onActivate: () => {
          popScreen();
          startNewGame();
        },
      },
    ],
  };
  pushScreen(makeMenuScreen(menu, t));
}

// Sauvegarde PRÉSENTE (même illisible) -> confirmation d'abord (elle sera
// écrasée) ; absente -> démarre directement, rien à confirmer. Note : cette
// détection (hasSave, présence brute) est volontairement DIFFÉRENTE de celle
// qui gouverne "Continuer" (une sauvegarde CHARGEABLE, voir main.js) — une
// sauvegarde corrompue n'offre jamais de reprise, mais reste bien un risque
// d'écrasement à confirmer. GÉNÉRIQUE sur le callback de démarrage : sert
// aussi bien "Nouvelle partie" que "Ville test" ci-dessous (MÊME risque
// d'écrasement, une session neuve dans les deux cas), jamais une seconde
// fonction dupliquée pour la même confirmation.
function activateNewGame(startGame) {
  if (hasSave()) {
    openNewGameConfirmation(startGame);
  } else {
    startGame();
  }
}

// canContinue/continueGame/startNewGame/startTestCityGame/getSession : état
// + callbacks fournis par main.js (seul propriétaire de session/level).
// Menu racine : jamais fermable (rien en dessous vers quoi revenir).
export function createMainMenu({ canContinue, continueGame, startNewGame, startTestCityGame, getSession }) {
  const entries = [];

  // "Ville test" : EN TÊTE de menu (avant même "Continuer"), raccourci de
  // développement/démo vers l'ancienne scène de départ ("demo", voir
  // main.js/startTestCityGame) — réutilise TEL QUEL le même garde-fou de
  // confirmation qu'une "Nouvelle partie" normale (activateNewGame
  // ci-dessus), puisque c'est exactement la même opération : une session
  // neuve qui écrasera la sauvegarde à sa prochaine écriture.
  entries.push({
    label: "menu.main.test_city",
    onActivate: () => activateNewGame(startTestCityGame),
  });

  if (canContinue) {
    entries.push({
      label: "menu.main.continue",
      onActivate: continueGame,
    });
  }

  entries.push({
    label: "menu.main.new_game",
    onActivate: () => activateNewGame(startNewGame),
  });

  entries.push({
    label: "menu.main.options",
    onActivate: () => pushScreen(makeMenuScreen(createOptionsMenu(getSession), t)),
  });

  return {
    title: "menu.main.title",
    closable: false,
    entries,
  };
}
