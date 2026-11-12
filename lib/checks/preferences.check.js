// Vérifications de lib/ — domaine « preferences ». Le magasin de préférences
// générique (lib/preferences.js) : chargement validé depuis le stockage, lecture et
// écriture, réinitialisation, et sa résistance à un stockage corrompu ou absent.
// Un faux stockage en mémoire ; l'export et l'import d'un fichier (téléchargement,
// FileReader) restent hors de portée d'un terminal. Lancées par
// core/checks/index.js/runChecks.

import { createPreferenceStore } from "../preferences.js";

// Un stockage en mémoire, au contrat de localStorage (getItem, setItem).
function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    read: (key) => JSON.parse(items.get(key)),
  };
}

const CONSTRAINTS = {
  volume: { type: "number", min: 0, max: 100, default: 50 },
  cycling: { type: "boolean", default: false },
  locale: { type: "string", values: ["auto", "fr"], default: "auto" },
};

function storeOn(storage) {
  return createPreferenceStore({ storageKey: "prefs", version: 1, constraints: CONSTRAINTS, fileName: "prefs.json", fileDescription: "Préférences", storage });
}

// Les avertissements attendus (stockage illisible) sont tus le temps de l'appel.
function quietly(fn) {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
  }
}

export default function checkPreferences(run) {
  const empty = storeOn(memoryStorage());
  run("préférences : sans rien de stocké, le défaut fourni", 42, empty.getPref("volume", 42));

  const stored = memoryStorage({
    prefs: JSON.stringify({ version: 1, prefs: { volume: 30, cycling: true, locale: "de", unknown: 1, extra: "x" } }),
  });
  const loaded = storeOn(stored);
  run("préférences : une valeur valide est chargée", 30, loaded.getPref("volume", 50));
  run("préférences : un booléen valide est chargé", true, loaded.getPref("cycling", false));
  run("préférences : une valeur hors de la liste est ignorée", "auto", loaded.getPref("locale", "auto"));
  run("préférences : une clé inconnue est ignorée", undefined, loaded.getPref("unknown"));

  const bounded = storeOn(memoryStorage({ prefs: JSON.stringify({ version: 1, prefs: { volume: 300 } }) }));
  run("préférences : une valeur hors bornes est ignorée", 50, bounded.getPref("volume", 50));
  const otherVersion = storeOn(memoryStorage({ prefs: JSON.stringify({ version: 9, prefs: { volume: 30 } }) }));
  run("préférences : une version inconnue repart des défauts", 50, otherVersion.getPref("volume", 50));
  const corrupted = quietly(() => storeOn(memoryStorage({ prefs: "{ pas du JSON" })));
  run("préférences : un stockage illisible repart des défauts, sans lever", 50, corrupted.getPref("volume", 50));
  const absent = storeOn(undefined);
  run("préférences : sans stockage du tout, les défauts", 50, absent.getPref("volume", 50));

  const writing = memoryStorage();
  const written = storeOn(writing);
  written.setPref("volume", 70);
  run("préférences : une écriture se lit", 70, written.getPref("volume", 50));
  run.same("préférences : une écriture est persistée, au format { version, prefs }", { version: 1, prefs: { volume: 70 } }, writing.read("prefs"));
  run("préférences : relue par un nouveau magasin", 70, storeOn(writing).getPref("volume", 50));

  written.resetAllPrefs();
  run.same(
    "préférences : réinitialiser remet chaque préférence à son défaut",
    { volume: 50, cycling: false, locale: "auto" },
    { volume: written.getPref("volume"), cycling: written.getPref("cycling"), locale: written.getPref("locale") }
  );
}
