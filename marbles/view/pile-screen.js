// Jeu des billes : le MENU d'une pile de billes, le sac, la défausse ou le pot (Maj+S,
// Maj+D, Maj+P). Un menu horizontal à fiches (marbles/view/card-menu.js) : une entrée
// par bille, puis « Retour » ; Ctrl+haut et Ctrl+bas parcourent la fiche de la bille
// (marbles/view/card.js) ; E et Maj+E disent ses mots-clés (marbles/view/keywords.js).
//
// La liste est reçue à l'ouverture, dans l'ordre où elle doit se dire : c'est
// l'appelant qui décide de cet ordre. Comme sur l'écran de jeu, le curseur qui arrive
// sur une bille (à l'ouverture, ou en se déplaçant) fait entendre sa balise
// (marbles/view/sounds.js).

import { announce } from "../../lib/announce.js";
import { pushScreen } from "../../lib/screens.js";
import { defineBindings } from "../../lib/input.js";
import { t } from "../../data/i18n/index.js";
import { playMenuSound } from "../../view/menu-sounds.js";
import { marbleCard } from "./card.js";
import { makeCardMenuScreen } from "./card-menu.js";
import { describeMarbleInList } from "./narration.js";
import { playFocusBeacon } from "./sounds.js";
import { keywordsText, openKeywordsMenu } from "./keywords.js";

const PILE_BINDINGS = defineBindings("marblesPile", {
  left: { keys: ["ArrowLeft"], mods: [] },
  right: { keys: ["ArrowRight"], mods: [] },
  home: { keys: ["Home"], mods: [] },
  end: { keys: ["End"], mods: [] },
  detailUp: { keys: ["ArrowUp"], mods: ["ctrl"] },
  detailDown: { keys: ["ArrowDown"], mods: ["ctrl"] },
  activate: { keys: ["Enter", " "], mods: [] },
  reannounce: { keys: ["Backspace"], mods: [] },
  back: { keys: ["Escape"], mods: [] },
  // Les mots-clés de la bille sous le curseur (marbles/view/keywords.js).
  keywords: { keys: ["e"], mods: [] },
  keywordsMenu: { keys: ["e"], mods: ["shift"] },
});

// `titleKey` : le titre du menu, une clé i18n ; `marbles` : les ids à dire, dans
// l'ordre voulu ; `rules` : les règles du jeu, pour les fiches ; `game` : la partie
// en cours (valeurs de partie, zones), pour la valeur actuelle des montants calculés.
export function openPileMenu(titleKey, marbles, rules, game) {
  pushScreen(
    makeCardMenuScreen({
      bindings: PILE_BINDINGS,
      helpId: "marblesPile",
      titleKey,
      count: marbles.length,
      emptyKey: "marbles.pile.empty",
      cardAt: (index, total) => marbleCard(marbles[index], describeMarbleInList(marbles[index], index, total, rules, t), rules, t, { game }),
      onCursor: (index) => playFocusBeacon(marbles[index], undefined, rules.types),
      actions: {
        // Hors d'une bille, `index` vaut undefined : « Aucune bille. ».
        keywords: (index) => announce(keywordsText(marbles[index], rules, t), { assertive: true }),
        keywordsMenu: (index) => {
          playMenuSound("select");
          openKeywordsMenu(marbles[index], rules);
        },
      },
    })
  );
}
