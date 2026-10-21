// CONFIRMATION d'une action destructive ou engageante (nouvelle partie,
// réinitialisation, import, transaction, outils de debug...) : un menu
// "Annuler" / "Confirmer", toujours dans cet ordre — "Annuler" est l'entrée
// par défaut, une pression rapide ou accidentelle d'Entrée reste sans effet.
// Échap annule aussi.

import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { t } from "../../data/i18n/index.js";

// `title` : clé i18n de la question, `titleParams` ses valeurs de gabarit.
// "Confirmer" retire la confirmation PUIS appelle `onConfirm` : l'action
// s'exécute depuis l'écran d'où la question a été posée (elle peut retirer
// d'autres écrans, annoncer son résultat...).
export function openConfirmation(title, onConfirm, { titleParams } = {}) {
  pushScreen(
    makeMenuScreen(
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
    )
  );
}
