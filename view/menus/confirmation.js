// CONFIRMATION d'une action destructive ou engageante (nouvelle partie,
// réinitialisation, import, transaction, outils de debug...) : un menu
// "Annuler" / "Confirmer", toujours dans cet ordre — "Annuler" est l'entrée
// par défaut, une pression rapide ou accidentelle d'Entrée reste sans effet.
// Échap annule aussi. Des lignes à lire avant de répondre (ce que l'action
// engage) peuvent précéder ces deux entrées : en lecture seule, le curseur s'y
// ouvre, et Entrée y reste sans effet.

import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { t } from "../../data/i18n/index.js";
import { withPausedBeacons } from "../paused-beacons.js";

// Les entrées d'une confirmation, dans l'ordre du modèle. `lines` : les lignes à
// lire d'abord, chacune { key, params }. Exportée pour vérifier cet ordre sans
// ouvrir d'écran, qui s'annoncerait.
export function confirmationEntries(onConfirm, lines = []) {
  return [
    ...lines.map(({ key, params }) => ({ label: key, labelParams: params })),
    { label: "menu.confirm.cancel", onActivate: () => popScreen() },
    {
      label: "menu.confirm.confirm",
      onActivate: () => {
        popScreen();
        onConfirm();
      },
    },
  ];
}

// `title` : clé i18n de la question, `titleParams` ses valeurs de gabarit.
// "Confirmer" retire la confirmation PUIS appelle `onConfirm` : l'action
// s'exécute depuis l'écran d'où la question a été posée (elle peut retirer
// d'autres écrans, annoncer son résultat...). `getWorldView` (optionnel) :
// question posée EN JEU, par-dessus la scène, dont les balises se taisent
// le temps du menu (voir view/paused-beacons.js) ; sans lui, rien à mettre
// en pause (menus hors partie, ou déjà par-dessus un menu qui l'a fait).
// `lines` (optionnel) : voir confirmationEntries.
export function openConfirmation(title, onConfirm, { titleParams, getWorldView, lines } = {}) {
  const screen = makeMenuScreen(
    {
      title,
      titleParams,
      closable: true,
      entries: confirmationEntries(onConfirm, lines),
    },
    t
  );
  pushScreen(getWorldView ? withPausedBeacons(screen, getWorldView) : screen);
}
