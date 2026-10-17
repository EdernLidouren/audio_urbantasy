// Assemble tous les domaines français en une seule table plate — MÊME
// forme qu'avant (voir data/i18n/README.md). Domaines PURS en JSON (voir
// chaque .json de ce dossier), chargés par fetch (lib/i18n.js/loadLocale,
// même patron que scenes/load.js pour les scènes) — jamais un import de
// module JS pour de la donnée. La LISTE des fichiers est la seule
// connaissance spécifique-Templeton ici ; le mécanisme de chargement
// reste générique dans lib/i18n.js.
import { loadLocale } from "../../../lib/i18n.js";

const DOMAINS = [
  "audio",
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
  "shop",
  "status",
  "weather",
];

export default await loadLocale("data/i18n/fr", DOMAINS);
