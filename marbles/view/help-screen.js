// Jeu des billes : l'AIDE GÉNÉRALE (touche H), un menu vertical de lib/menu.js. Une
// entrée par rubrique, dans cet ordre : but du jeu, score, triangle et rotation,
// usure, main, lancers et pioche, zones, mots-clés, statuts ; Entrée sur une rubrique en dit
// le texte, de quelques phrases, tiré du document de règles (doc/marbles-rules.md).
// Puis « Les touches », qui ouvre l'aide des touches de l'écran des billes, la même
// que F1 (lib/help.js, générée) ; enfin « Fermer ». Échap ferme aussi.
//
// Les valeurs citées (tours, main, lancers, pioche, pot) viennent de la définition de
// la partie en cours (marbles/core/definitions.js), jamais recopiées dans les textes.

import { announce } from "../../lib/announce.js";
import { popScreen, pushScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { t } from "../../data/i18n/index.js";

// Les rubriques, dans l'ordre du menu : `marbles.help.<id>.title` et `.text`.
export const MARBLES_HELP_TOPICS = ["goal", "score", "triangle", "wear", "hand", "zones", "keywords", "statuses"];

// Les valeurs que les textes citent : les valeurs de départ de la définition.
function helpParams({ turns, start }) {
  return { turns, hand: start.handSize, throws: start.throws, firstDraw: start.firstTurnDraw, draw: start.drawPerTurn, pot: start.potCapacity };
}

// Le texte d'une rubrique, tel qu'il se dit, pour la définition de la partie.
export function helpTopicText(id, definition, translate = t) {
  return translate(`marbles.help.${id}.text`, helpParams(definition));
}

// Le menu, sans l'ouvrir (vérifiable au terminal). `openKeyHelp()` : ouvre l'aide des
// touches de l'écran des billes, par-dessus ce menu ; `definition` : celle de la partie.
export function marblesHelpMenu(openKeyHelp, definition) {
  return {
    title: "marbles.help.title",
    closable: true,
    entries: [
      ...MARBLES_HELP_TOPICS.map((id) => ({
        label: `marbles.help.${id}.title`,
        onActivate: () => announce(helpTopicText(id, definition), { assertive: true }),
      })),
      { label: "marbles.help.keys.title", onActivate: () => openKeyHelp() },
      { label: "marbles.help.close", onActivate: () => popScreen() },
    ],
  };
}

export function openMarblesHelp(openKeyHelp, definition) {
  pushScreen(makeMenuScreen(marblesHelpMenu(openKeyHelp, definition), t));
}
