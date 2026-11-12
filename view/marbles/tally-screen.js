// Jeu des billes : le MENU DE DEBUG des valeurs de partie (Maj+L, mode debug
// seulement : la garde vit dans view/marbles/screen.js, DEBUG_ACTIONS). Un menu
// vertical de lib/menu.js, en lecture seule, regroupé par catégorie
// (core/marbles-counters.js/TALLY_CATEGORIES : déclenchements, actions, Vitesse et
// Masse, évènements) : le titre de chaque catégorie, puis une ligne par compteur avec
// ses deux portées (« Chiquenaudes : 2 ce tour, 5 cette partie. »), dans l'ordre de
// la liste des compteurs ; enfin « Fermer ». Échap ferme aussi.
//
// Un instantané pris à l'ouverture, lu par la lecture publique du registre
// (core/marbles-tally.js/tallyValue) : le jeu est figé tant que le menu est au
// sommet de la pile (lib/screens.js), rien ne change sous lui.

import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { nameRef, t } from "../../data/i18n/index.js";
import { TALLY_COUNTERS } from "../../core/marbles-content.js";
import { TALLY_CATEGORIES } from "../../core/marbles-counters.js";
import { tallyValue } from "../../core/marbles-tally.js";

// Les entrées du menu, sans l'ouvrir (vérifiable au terminal). `tally` : les valeurs
// de partie de l'état (game.tally) ; `counters` : la liste des compteurs.
export function tallyMenu(tally, counters = TALLY_COUNTERS) {
  const entries = TALLY_CATEGORIES.flatMap((category) => {
    const lines = counters
      .filter((counter) => counter.category === category)
      .map((counter) => ({
        label: "marbles.tally.line",
        // Une référence de nom, jamais un texte déjà traduit : la ligne se rend dans
        // la langue du moment où elle se dit.
        labelParams: {
          name: nameRef(`marbles.tally.${counter.id}.name`),
          turn: tallyValue(tally, counter.id, "turn"),
          game: tallyValue(tally, counter.id, "game"),
        },
      }));
    return lines.length === 0 ? [] : [{ label: `marbles.tally.category.${category}` }, ...lines];
  });
  return {
    title: "marbles.tally.title",
    closable: true,
    entries: [...entries, { label: "marbles.tally.close", onActivate: () => popScreen() }],
  };
}

export function openTallyMenu(tally) {
  pushScreen(makeMenuScreen(tallyMenu(tally), t));
}
