// Brique portable : le MOTEUR de localisation, aucune connaissance d'aucune
// locale ni d'aucun projet. Reçoit ses tables de traduction en paramètre —
// ne les importe jamais lui-même, pour rester déposable tel quel ailleurs.

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

export function createI18n(locales, { defaultLocale = "en" } = {}) {
  // Locale de repli ultime : utilisée comme filet quand une clé manque dans
  // la locale courante, et comme choix par défaut si navigator.language
  // n'est pas une locale supportée par ce projet.
  function detectInitialLocale() {
    if (typeof navigator === "undefined" || !navigator.language) {
      return defaultLocale;
    }
    const base = navigator.language.split("-")[0].toLowerCase();
    return locales[base] ? base : defaultLocale;
  }

  let currentLocale = detectInitialLocale();

  function t(key, params = {}) {
    const table = locales[currentLocale];
    let template = table && table[key];

    if (template === undefined) {
      const fallbackTable = locales[defaultLocale];
      template = fallbackTable && fallbackTable[key];
    }

    if (template === undefined) {
      console.warn(`i18n: clé "${key}" introuvable (locale "${currentLocale}", repli "${defaultLocale}").`);
      return key;
    }

    return interpolate(template, params, key);
  }

  function setLocale(locale) {
    if (!locales[locale]) {
      console.warn(`i18n: locale "${locale}" non supportée, ignorée.`);
      return;
    }
    currentLocale = locale;
  }

  return {
    t,
    setLocale,
    getLocale: () => currentLocale,
    availableLocales: () => Object.keys(locales),
  };
}
