// Menu du journal d'avertissements (MODE DEBUG, Shift+L — voir
// view/city-screen.js et view/debug-warnings.js). Une entrée par
// avertissement, parcourue aux flèches : rien n'est coupé par l'annonce
// suivante, contrairement à une annonce ponctuelle. Dernière entrée :
// "Vider le journal". Ouvrir le menu marque tout comme vu.
//
// Ouvert aussi automatiquement (openDebugWarningsIfUnseen) en mode debug,
// quand une partie démarre ou est importée et que le journal contient des
// avertissements pas encore consultés.

import { t } from "../../data/i18n/index.js";
import { announce } from "../../lib/announce.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen, makeMessageScreen } from "../../lib/menu.js";
import { isDebugEnabled } from "../../config/debug.js";
import { warningLog } from "../debug-warnings.js";

export function openDebugWarningsMenu() {
  const warnings = warningLog.entries();
  warningLog.markAllSeen();

  if (warnings.length === 0) {
    pushScreen(makeMessageScreen("debug.warnings.empty", t));
    return;
  }

  const entries = warnings.map(({ key, params }) => ({
    label: key,
    labelParams: params,
    // Lecture seule : Entrée ne fait rien, la flèche suffit à parcourir.
    onActivate: () => {},
  }));
  entries.push({
    label: "debug.warnings.clear",
    onActivate: () => {
      warningLog.clear();
      popScreen();
      announce(t("debug.warnings.cleared"), { assertive: true });
    },
  });

  pushScreen(
    makeMenuScreen({ title: "debug.warnings.title", titleParams: { count: warnings.length }, closable: true, entries }, t)
  );
}

// Ouverture automatique, MODE DEBUG seulement, s'il y a du nouveau depuis
// la dernière consultation. Rien sinon.
export function openDebugWarningsIfUnseen() {
  if (isDebugEnabled() && warningLog.unseenCount() > 0) openDebugWarningsMenu();
}
