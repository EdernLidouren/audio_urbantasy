// Assembles all English domains into a single flat table — SAME shape as
// before (see data/i18n/README.md). Domains are PURE JSON (see each .json
// in this folder), loaded via fetch (lib/i18n.js/loadLocale, same pattern
// as level/load.js for levels) — never a JS module import for data. The
// file LIST is the only Templeton-specific knowledge here; the loading
// mechanism stays generic in lib/i18n.js.
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
  "status",
  "weather",
];

export default await loadLocale("data/i18n/en", DOMAINS);
