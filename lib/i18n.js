// Brique portable : le MOTEUR de localisation, aucune connaissance d'aucune
// locale ni d'aucun projet. Reçoit ses tables de traduction en paramètre —
// ne les importe jamais lui-même, pour rester déposable tel quel ailleurs.

// Charge et assemble EN UNE TABLE PLATE les fichiers JSON d'UNE langue —
// fetch générique, SANS bundler, même patron que level/load.js pour les
// niveaux : ce module ignore tout des DOMAINES eux-mêmes (`files`, la
// liste des noms de fichiers, est une connaissance DE CONTENU, fournie
// par l'appelant — voir data/i18n/fr/index.js). Chaque fichier doit être
// un objet JSON plat { clé: valeur } ; aucune clé ne doit se chevaucher
// entre fichiers d'une même langue — Object.assign écraserait
// silencieusement un doublon, jamais détecté ici (responsabilité du
// contenu, pas du moteur).
async function loadJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`loadLocale: échec réseau pour "${url}" : ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`loadLocale: réponse HTTP ${response.status} pour "${url}".`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`loadLocale: JSON invalide dans "${url}" : ${error.message}`);
  }
}

export async function loadLocale(baseUrl, files) {
  const tables = await Promise.all(files.map((name) => loadJson(`${baseUrl}/${name}.json`)));
  return Object.assign({}, ...tables);
}

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
