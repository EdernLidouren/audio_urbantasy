// Instanciation spécifique-jeu du moteur i18n générique (lib/i18n.js) avec
// les données de locale de Templeton, éclatées par domaine ET par fichier
// JSON pur (voir data/i18n/README.md, data/i18n/fr/index.js,
// data/i18n/en/index.js — chargés par fetch, jamais un import de module
// JS de traduction). Les consommateurs (t, setLocale, getLocale,
// availableLocales) ne changent pas — POINT D'ACCÈS UNIQUE, comme avant :
// le reste du code continue d'appeler t(clé) sans jamais savoir que les
// données sont éclatées en fichiers-domaines ni chargées par le réseau.
// `await` au niveau module (top-level await, supporté nativement) :
// fr/index.js et en/index.js font de même sur leur propre chargement —
// tout consommateur qui importe ce module attend donc naturellement que
// les données soient prêtes avant que son propre code ne s'exécute,
// aucune coordination explicite à écrire ailleurs.

import { createI18n } from "../../lib/i18n.js";
import fr from "./fr/index.js";
import en from "./en/index.js";

export const { t, setLocale, getLocale, availableLocales } = createI18n({ fr, en });
