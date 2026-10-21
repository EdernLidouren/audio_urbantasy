// Instanciation spécifique-jeu du moteur i18n générique (lib/i18n.js) avec
// les données de Templeton : un JSON pur par domaine et par langue
// (data/i18n/<langue>/<domaine>.json, voir doc/i18n.md), chargés par fetch
// (lib/i18n.js/loadLocale), jamais importés comme modules JS. POINT D'ACCÈS
// UNIQUE (t, hasKey, setLocale, getLocale, availableLocales) : le reste du
// code appelle t(clé) sans savoir que les données sont éclatées en fichiers
// ni chargées par le réseau.
// `await` au niveau module : tout consommateur qui importe ce module attend
// que les données soient prêtes avant que son propre code ne s'exécute.

import { createI18n, loadLocale } from "../../lib/i18n.js";

// Domaines (noms de fichiers .json), les MÊMES pour toutes les langues —
// une seule liste, la parité des contenus est vérifiée par
// tools/check_i18n_parity.py.
const DOMAINS = [
  "audio",
  "collections",
  "entities",
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

const [fr, en] = await Promise.all([loadLocale("data/i18n/fr", DOMAINS), loadLocale("data/i18n/en", DOMAINS)]);

export const { t, hasKey, setLocale, getLocale, availableLocales } = createI18n({ fr, en });
