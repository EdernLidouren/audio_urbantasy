// Menu de DEBUG des collections (Shift+C, mode debug uniquement, la garde
// vit dans view/city-screen.js/onKeyDown) — même famille que Shift+W/T/M/L.
// Deux outils, chacun derrière une confirmation : "Tout révéler" et "Tout
// réinitialiser". Ils écrivent RÉELLEMENT le fait "acquis" des objets de
// collection (core/collections.js/revealAllCollections, resetAllCollections),
// sans annonce de découverte (muteNextDiscoveryCheck) : un outil de test ne
// doit pas déclencher une avalanche d'annonces.

import { t } from "../../data/i18n/index.js";
import { announce } from "../../lib/announce.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { revealAllCollections, resetAllCollections } from "../../core/collections.js";
import { openConfirmation } from "./confirmation.js";
import collections from "../../collections/index.js";
import { muteNextDiscoveryCheck } from "../discoveries.js";
export function openCollectionsDebugMenu(getSession, setSession) {
  function apply(transform, doneKey) {
    popScreen(); // ferme le menu debug lui-même
    muteNextDiscoveryCheck();
    setSession(transform(getSession(), collections));
    announce(t(doneKey), { assertive: true });
  }

  pushScreen(
    makeMenuScreen(
      {
        title: "collections.debug.title",
        closable: true,
        entries: [
          {
            label: "collections.debug.reveal",
            onActivate: () =>
              openConfirmation("collections.debug.revealConfirm", () => apply(revealAllCollections, "collections.debug.revealed")),
          },
          {
            label: "collections.debug.reset",
            onActivate: () =>
              openConfirmation("collections.debug.resetConfirm", () => apply(resetAllCollections, "collections.debug.reset.done")),
          },
        ],
      },
      t
    )
  );
}
