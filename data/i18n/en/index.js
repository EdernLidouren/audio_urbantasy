// Assemble tous les domaines anglais en une seule table plate { clé:
// texte } (voir data/i18n/README.md). Domaines PURS en JSON (voir chaque
// .json de ce dossier), chargés par fetch (lib/i18n.js/loadLocale, même
// patron que scenes/load.js pour les scènes) — jamais un import de module
// JS pour de la donnée. La LISTE des fichiers est la seule connaissance
// spécifique-Templeton ici ; le mécanisme de chargement reste générique
// dans lib/i18n.js. Même liste que fr/index.js : la parité fr/en est
// vérifiée par tools/check_i18n_parity.py.
import { loadLocale } from "../../../lib/i18n.js";

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

export default await loadLocale("data/i18n/en", DOMAINS);
