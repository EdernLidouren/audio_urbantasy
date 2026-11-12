// Jeu des billes : le MENU DES STATUTS de la partie (Maj+A). Un menu horizontal à
// fiches (marbles/view/card-menu.js) : une entrée par statut, dans l'ordre
// d'acquisition (en attente compris), puis « Retour ». L'annonce principale d'une
// entrée : le nom du statut, son intensité s'il le faut, ce qui lui reste ; Ctrl+haut
// et Ctrl+bas parcourent sa fiche (son effet, ce qui reste, son origine :
// marbles/view/narration/statuses.js) ; E dit sa description. Sans statut : « Aucun
// statut. ».
//
// Les statuts sont lus à l'ouverture, rien de la partie n'est modifié. Aucune
// balise : un statut n'a pas de voix.

import { announce } from "../../lib/announce.js";
import { pushScreen } from "../../lib/screens.js";
import { defineBindings } from "../../lib/input.js";
import { t } from "../../data/i18n/index.js";
import { makeCardMenuScreen, withPosition } from "./card-menu.js";
import { instanceLabel, statusCard, statusHelpLine } from "./narration.js";

const STATUS_BINDINGS = defineBindings("marblesStatuses", {
  left: { keys: ["ArrowLeft"], mods: [] },
  right: { keys: ["ArrowRight"], mods: [] },
  home: { keys: ["Home"], mods: [] },
  end: { keys: ["End"], mods: [] },
  detailUp: { keys: ["ArrowUp"], mods: ["ctrl"] },
  detailDown: { keys: ["ArrowDown"], mods: ["ctrl"] },
  activate: { keys: ["Enter", " "], mods: [] },
  reannounce: { keys: ["Backspace"], mods: [] },
  back: { keys: ["Escape"], mods: [] },
  // La description du statut sous le curseur.
  describe: { keys: ["e"], mods: [] },
});

// `instances` : les statuts de la partie (game.statuses), dans l'ordre d'acquisition ;
// `rules` : les règles du jeu, pour leurs définitions.
export function openStatusMenu(instances, rules) {
  pushScreen(
    makeCardMenuScreen({
      bindings: STATUS_BINDINGS,
      helpId: "marblesStatuses",
      titleKey: "marbles.statuses.title",
      count: instances.length,
      emptyKey: "marbles.statuses.none",
      cardAt: (index, total) => statusCard(instances[index], withPosition(instanceLabel(instances[index], rules, t), index, total), rules, t),
      actions: {
        // Hors d'un statut, il n'y a rien à décrire : la ligne se redit.
        describe: (index, line) => {
          if (index === undefined) {
            announce(line, { assertive: true });
            return;
          }
          const { key, params } = statusHelpLine(instances[index].status);
          announce(t(key, params), { assertive: true });
        },
      },
    })
  );
}
