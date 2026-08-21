// Moteur de localisation minimal, sans dépendance. Aucun accès au core :
// c'est un outil de vue, consommé par les modules qui produisent du texte
// affiché/annoncé (menus, etc.).

import fr from "./fr.js";
import en from "./en.js";

const LOCALES = { fr, en };

// Locale de repli ultime : utilisée comme filet quand une clé manque dans la
// locale courante, et comme choix par défaut si navigator.language n'est pas
// une locale supportée.
const DEFAULT_LOCALE = "en";

function detectInitialLocale() {
  if (typeof navigator === "undefined" || !navigator.language) {
    return DEFAULT_LOCALE;
  }
  const base = navigator.language.split("-")[0].toLowerCase();
  return LOCALES[base] ? base : DEFAULT_LOCALE;
}

let currentLocale = detectInitialLocale();

// Remplace chaque {placeholder} par params[placeholder]. Un placeholder sans
// valeur correspondante est laissé tel quel et signalé (jamais silencieux).
function interpolate(template, params, key) {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (params && params[name] !== undefined) {
      return String(params[name]);
    }
    console.warn(`i18n: placeholder "{${name}}" manquant pour la clé "${key}".`);
    return match;
  });
}

export function t(key, params = {}) {
  const table = LOCALES[currentLocale];
  let template = table && table[key];

  if (template === undefined) {
    const fallbackTable = LOCALES[DEFAULT_LOCALE];
    template = fallbackTable && fallbackTable[key];
  }

  if (template === undefined) {
    console.warn(`i18n: clé "${key}" introuvable (locale "${currentLocale}", repli "${DEFAULT_LOCALE}").`);
    return key;
  }

  return interpolate(template, params, key);
}

export function setLocale(locale) {
  if (!LOCALES[locale]) {
    console.warn(`i18n: locale "${locale}" non supportée, ignorée.`);
    return;
  }
  currentLocale = locale;
}

export function getLocale() {
  return currentLocale;
}

export function availableLocales() {
  return Object.keys(LOCALES);
}
