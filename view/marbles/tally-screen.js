// Jeu des billes : le MENU DE DEBUG des valeurs de partie (Maj+L, mode debug
// seulement : la garde vit dans view/marbles/screen.js, DEBUG_ACTIONS). Un menu
// vertical de lib/menu.js, en lecture seule : une ligne par compteur déclaré
// (config/marbles-values.js/MARBLE_TALLIES), dans l'ordre de la déclaration, avec sa
// valeur (« Chiquenaudes ce tour : 2 »), puis « Fermer » ; Échap ferme aussi.
//
// Un instantané pris à l'ouverture, lu par la lecture publique du registre
// (core/marbles-tally.js/tallyValue) : le jeu est figé tant que le menu est au
// sommet de la pile (lib/screens.js), rien ne change sous lui.

import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { nameRef, t } from "../../data/i18n/index.js";
import { MARBLE_TALLIES } from "../../config/marbles-values.js";
import { tallyValue } from "../../core/marbles-tally.js";

// Les entrées du menu, sans l'ouvrir (vérifiable au terminal). `tally` : les valeurs
// de partie de l'état (game.tally) ; `tallies` : les compteurs déclarés.
export function tallyMenu(tally, tallies = MARBLE_TALLIES) {
  const lines = tallies.map((counter) => ({
    label: "marbles.tally.line",
    // Une référence de nom, jamais un texte déjà traduit : la ligne se rend dans la
    // langue du moment où elle se dit.
    labelParams: { name: nameRef(counter.texts.name), count: tallyValue(tally, counter.id) },
  }));
  return {
    title: "marbles.tally.title",
    closable: true,
    entries: [...lines, { label: "marbles.tally.close", onActivate: () => popScreen() }],
  };
}

export function openTallyMenu(tally) {
  pushScreen(makeMenuScreen(tallyMenu(tally), t));
}
