// LANGUE de l'interface : applique la préférence "locale" (Options >
// Langue, voir config/preferences.js) au moteur i18n ET à la page. Le
// lecteur d'écran choisit sa voix et ses règles de prononciation d'après
// l'attribut `lang` du document : un texte anglais sous lang="fr" serait lu
// avec la voix française. lib/i18n.js reste sans DOM ; c'est ici que la
// page suit la langue : son attribut lang, son titre et le nom de la zone de
// jeu (aria-label, lu par le lecteur d'écran à la prise de focus), écrits en
// dur dans index.html pour le tout premier affichage.
//
// Appelée au démarrage (main.js), à chaque changement du réglage, après une
// réinitialisation des réglages et après un import de préférences.

import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";
import { t, setLocale, getLocale, browserLocale } from "../data/i18n/index.js";

export function applyLocalePreference() {
  const wanted = getPref("locale", PREF_CONSTRAINTS.locale.default);
  setLocale(wanted === "auto" ? browserLocale() : wanted);
  document.documentElement.lang = getLocale();
  document.title = t("menu.page.title");
  document.getElementById("game").setAttribute("aria-label", t("menu.page.game_area"));
}
