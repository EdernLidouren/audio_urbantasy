// Instanciation spécifique-jeu du moteur i18n générique (lib/i18n.js) avec
// les données de Templeton : un JSON pur par domaine et par langue
// (data/i18n/<langue>/<domaine>.json, voir doc/i18n.md), chargés par fetch
// (lib/i18n.js/loadLocale), jamais importés comme modules JS. POINT D'ACCÈS
// UNIQUE (t, hasKey, setLocale, getLocale, availableLocales) : le reste du
// code appelle t(clé) sans savoir que les données sont éclatées en fichiers
// ni chargées par le réseau.
// `await` au niveau module : tout consommateur qui importe ce module attend
// que les données soient prêtes avant que son propre code ne s'exécute.
// Un texte invalide (gabarit mal formé, forme non déclarée...) fait échouer
// cet import, donc le démarrage, avec la liste des fautes (lib/i18n.js/
// createI18n).

import { createI18n, loadLocale, loadJson } from "../../lib/i18n.js";

// Référence à un nom, à passer en paramètre de t() quand un gabarit en
// choisit la forme ({scene:def}, voir doc/i18n.md/"Grammaire des textes").
export { nameRef } from "../../lib/i18n.js";

// Domaines (noms de fichiers .json), les MÊMES pour toutes les langues —
// une seule liste, la parité des contenus est vérifiée par
// tools/check_i18n_parity.py.
const DOMAINS = [
  "audio",
  "collections",
  "entities",
  "help",
  "improvements",
  "interaction",
  "inventory",
  "items",
  "map",
  "menus",
  "navigation",
  "perception",
  "save",
  "scenes",
  "shop",
  "status",
  "weather",
];

// Formes et attributs de nom reconnus par chaque langue (data/i18n/
// grammar.json) : une donnée, hors des domaines de clés, que la parité ne
// compare pas — chaque langue déclare ce dont ses propres gabarits ont
// besoin.
const [fr, en, grammar] = await Promise.all([
  loadLocale("data/i18n/fr", DOMAINS),
  loadLocale("data/i18n/en", DOMAINS),
  loadJson("data/i18n/grammar.json"),
]);

export const {
  t,
  hasKey,
  setLocale,
  getLocale,
  availableLocales,
  browserLocale,
  // Branché par main.js sur le journal d'avertissements (voir
  // view/debug-warnings.js/reportI18nWarning) : pas ici, le journal
  // importe lui-même t.
  setWarningHandler: setI18nWarningHandler,
} = createI18n({ fr, en }, { grammar });

// Grammaire déclarée, en LECTURE pour les vérifications (lib/checks/
// i18n.check.js) et l'audit du contenu.
export const GRAMMAR = grammar;

// Tables brutes par langue, en LECTURE pour les outils de dev qui vérifient
// une clé langue par langue (tools/content-audit.js) — hasKey, lui, se
// replie sur la langue par défaut. Le jeu passe toujours par t().
export const LOCALE_TABLES = { fr, en };
