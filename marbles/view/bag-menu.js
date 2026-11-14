// JEU DES BILLES — le MENU DES SACS PRÉFAITS, en mode debug seulement : ouvert par
// « Partie de billes » du menu principal avant de lancer la partie (main.js). Un menu
// vertical (lib/menu.js) : une ligne par sac préfait, dans l'ordre du registre
// (marbles/content/bags/index.js), son nom et son nombre de billes (« sac du Trésor,
// 15 billes »), puis « Retour ». Entrée sur un sac referme le menu, puis lance la
// partie avec lui (`onChoose(bag)`) : la quitter ramène au menu principal. Échap ou
// Retour reviennent au menu principal. Hors mode debug, aucun menu : le sac de départ.

import { popScreen } from "../../lib/screens.js";
import { bagLineParams } from "./narration/bags.js";

// La définition du menu (lib/menu.js) ; `bags` : le registre des sacs préfaits.
export function createBagMenu(bags, onChoose) {
  return {
    title: "marbles.bagMenu.title",
    closable: true,
    entries: [
      ...Object.values(bags).map((bag) => ({
        label: "marbles.bagMenu.line",
        labelParams: bagLineParams(bag),
        closesMenu: true,
        onActivate: () => onChoose(bag),
      })),
      { label: "marbles.bagMenu.back", onActivate: () => popScreen() },
    ],
  };
}
