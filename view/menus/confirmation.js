// CONFIRMATION d'une action destructive ou engageante (nouvelle partie,
// réinitialisation, import, transaction, outils de debug...) : un menu
// "Annuler" / "Confirmer", toujours dans cet ordre — "Annuler" est l'entrée
// par défaut, une pression rapide ou accidentelle d'Entrée reste sans effet.
// Échap annule aussi.

import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { t } from "../../data/i18n/index.js";
import { withPausedBeacons } from "../paused-beacons.js";

// `title` : clé i18n de la question, `titleParams` ses valeurs de gabarit.
// "Confirmer" retire la confirmation PUIS appelle `onConfirm` : l'action
// s'exécute depuis l'écran d'où la question a été posée (elle peut retirer
// d'autres écrans, annoncer son résultat...). `getWorldView` (optionnel) :
// question posée EN JEU, par-dessus la scène, dont les balises se taisent
// le temps du menu (voir view/paused-beacons.js) ; sans lui, rien à mettre
// en pause (menus hors partie, ou déjà par-dessus un menu qui l'a fait).
export function openConfirmation(title, onConfirm, { titleParams, getWorldView } = {}) {
  const screen = makeMenuScreen(
    {
      title,
      titleParams,
      closable: true,
      entries: [
        { label: "menu.confirm.cancel", onActivate: () => popScreen() },
        {
          label: "menu.confirm.confirm",
          onActivate: () => {
            popScreen();
            onConfirm();
          },
        },
      ],
    },
    t
  );
  pushScreen(getWorldView ? withPausedBeacons(screen, getWorldView) : screen);
}
