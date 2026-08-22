// Instanciation spécifique-jeu du moteur i18n générique (lib/i18n.js) avec
// les données de locale de Templeton (fr.js, en.js). Les consommateurs
// (t, setLocale, getLocale, availableLocales) ne changent pas.

import { createI18n } from "../lib/i18n.js";
import fr from "./fr.js";
import en from "./en.js";

export const { t, setLocale, getLocale, availableLocales } = createI18n({ fr, en });
