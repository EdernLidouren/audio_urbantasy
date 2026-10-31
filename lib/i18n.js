// Brique portable : le MOTEUR de localisation, aucune connaissance d'aucune
// locale ni d'aucun projet. Reçoit ses tables de traduction en paramètre —
// ne les importe jamais lui-même, pour rester déposable tel quel ailleurs.
// Point d'entrée des modules de lib/i18n/ : l'analyse et le rendu des
// gabarits (pluriel, choix, formes de nom, listes) vivent dans
// ./i18n/message.js, la grammaire complète dans doc/i18n.md/"Grammaire des
// textes".

import { parseMessage, renderMessage, normalizeGrammar, validateNameValue, nameRef, NameRef } from "./i18n/message.js";

export { nameRef, NameRef };

// Charge un fichier JSON — fetch générique, erreurs réseau et JSON invalide
// remontées avec un message clair. Exporté pour les données i18n qui ne
// sont pas un domaine de clés (la grammaire déclarée par langue).
export async function loadJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`loadJson: échec réseau pour "${url}" : ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`loadJson: réponse HTTP ${response.status} pour "${url}".`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`loadJson: JSON invalide dans "${url}" : ${error.message}`);
  }
}

// Charge et assemble EN UNE TABLE PLATE les fichiers JSON d'UNE langue —
// fetch générique, SANS bundler : ce module ignore tout des DOMAINES
// eux-mêmes (`files`, la liste des noms de fichiers, est une connaissance
// DE CONTENU, fournie par l'appelant). Chaque fichier doit être
// un objet JSON plat { clé: valeur } ; aucune clé ne doit se chevaucher
// entre fichiers d'une même langue — Object.assign écraserait
// silencieusement un doublon, jamais détecté ici (responsabilité du
// contenu, pas du moteur).
export async function loadLocale(baseUrl, files) {
  const tables = await Promise.all(files.map((name) => loadJson(`${baseUrl}/${name}.json`)));
  return Object.assign({}, ...tables);
}

// `locales` : { langue: { clé: valeur } }, une valeur étant un gabarit
// (chaîne) ou un nom écrit en objet de formes ({ base, ... }).
// `grammar` : { langue: { forms, attributes } }, les formes et attributs de
// nom que chaque langue reconnaît (voir ./i18n/message.js/normalizeGrammar) ;
// une langue absente n'en déclare aucun.
//
// TOUT est validé ICI, à la construction : chaque gabarit de chaque langue
// est compilé une fois, chaque objet de formes vérifié. Les fautes sont
// rassemblées (langue, clé, motif) et levées ENSEMBLE : un texte cassé
// empêche le démarrage au lieu d'être lu de travers au lecteur d'écran.
export function createI18n(locales, { defaultLocale = "en", grammar = {} } = {}) {
  const compiled = {};
  const errors = [];

  for (const locale of Object.keys(grammar)) {
    if (!locales[locale]) errors.push(`grammaire déclarée pour une langue inconnue « ${locale} »`);
  }

  for (const [locale, table] of Object.entries(locales)) {
    let localeGrammar;
    try {
      localeGrammar = normalizeGrammar(grammar[locale]);
    } catch (error) {
      errors.push(`grammaire de « ${locale} » : ${error.message}`);
      continue;
    }
    const messages = new Map();
    for (const [key, value] of Object.entries(table)) {
      try {
        if (typeof value === "string") messages.set(key, parseMessage(value, { locale, grammar: localeGrammar }));
        else validateNameValue(value, localeGrammar);
      } catch (error) {
        errors.push(`${locale}, « ${key} » : ${error.message}`);
      }
    }
    compiled[locale] = messages;
  }

  if (errors.length > 0) {
    throw new Error(`i18n : ${errors.length} texte(s) invalide(s) :\n  - ${errors.join("\n  - ")}`);
  }

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

  // Avertissements de RENDU (clé introuvable, paramètre manquant, forme de
  // nom absente...) : jamais une exception, un texte dégradé et ce
  // signalement. Console par défaut ; le jeu peut le rediriger
  // (setWarningHandler), par exemple vers un journal lisible au lecteur
  // d'écran. Les fautes de CHARGEMENT, elles, lèvent (voir plus haut).
  let warningHandler = (message) => console.warn(`i18n: ${message}`);
  const reportWarning = (message) => warningHandler(message);

  // Valeur d'une clé et la langue d'où elle vient : la courante, sinon la
  // langue de repli. Un gabarit se rend avec les règles de SA langue (un
  // texte anglais de repli garde le pluriel anglais).
  function lookup(key) {
    const table = locales[currentLocale];
    if (table && table[key] !== undefined) return { locale: currentLocale, value: table[key] };
    const fallbackTable = locales[defaultLocale];
    if (fallbackTable && fallbackTable[key] !== undefined) return { locale: defaultLocale, value: fallbackTable[key] };
    return undefined;
  }

  // Texte de `key`, gabarit rendu avec `params`. Un nom écrit en objet de
  // formes rend sa base. Une référence de nom passée en paramètre
  // (nameRef) est résolue dans la langue courante, comme t() le ferait.
  function t(key, params = {}) {
    const found = lookup(key);
    if (found === undefined) {
      reportWarning(`clé "${key}" introuvable (locale "${currentLocale}", repli "${defaultLocale}").`);
      return key;
    }
    if (typeof found.value !== "string") return found.value.base;

    return renderMessage(compiled[found.locale].get(key), params, {
      locale: found.locale,
      lookupName: (nameKey) => lookup(nameKey)?.value,
      warn: (message) => reportWarning(`${message} pour la clé "${key}" (locale "${found.locale}").`),
    });
  }

  function setLocale(locale) {
    if (!locales[locale]) {
      reportWarning(`locale "${locale}" non supportée, ignorée.`);
      return;
    }
    currentLocale = locale;
  }

  // La clé existe-t-elle (locale courante, sinon locale de repli) ? Même
  // recherche que t(), sans avertissement : pour un appelant qui VÉRIFIE
  // un contenu (ex. textes déclarés ailleurs) plutôt qu'il ne l'affiche.
  function hasKey(key) {
    return lookup(key) !== undefined;
  }

  return {
    t,
    hasKey,
    setLocale,
    getLocale: () => currentLocale,
    availableLocales: () => Object.keys(locales),
    // Langue que le navigateur demande (si le projet la fournit, sinon la
    // langue de repli) : ce que vaut un réglage « automatique ».
    browserLocale: detectInitialLocale,
    // Remplace la sortie des avertissements de rendu : handler(message),
    // message en texte brut, sans préfixe.
    setWarningHandler: (handler) => {
      warningHandler = handler;
    },
  };
}
