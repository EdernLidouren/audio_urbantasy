// MAGASIN DE PRÉFÉRENCES : un store clé -> valeur des choix de l'utilisateur,
// persisté automatiquement (localStorage) et exportable ou importable à la main
// (un fichier JSON). Mécanisme générique : un jeu le crée avec SES contraintes
// (createPreferenceStore) et n'en voit que getPref/setPref/reset/export/import.
// Aucun autre module n'a à connaître le format de persistance.
//
// CONTRAINTES, par clé : { type, default, min?, max?, values? }, type ∈ "number"
// (borné [min, max]), "boolean" (sans bornes), "string" (une valeur parmi
// `values`). SOURCE UNIQUE des bornes et des défauts : la validation de ce qui
// est lu (stockage, fichier importé) et les réglages qui les affichent lisent les
// mêmes.
//
// FORMAT stocké et exporté : { version, prefs }. Une donnée lue est SUSPECTE par
// définition (corrompue, périmée, trafiquée) : migrée selon sa version, puis
// chaque entrée validée contre les contraintes, sinon ignorée sans bruit. Les
// montées de version futures s'ajouteront à migratePrefs (v1 -> v2 -> ... ->
// courante, jamais en sautant une étape) ; pour l'instant, une seule version.

import { saveTextFile } from "./download.js";

// Valide UNE valeur pour une clé CONNUE : type + bornes de ses contraintes. Clé
// absente des contraintes -> invalide par construction (jamais persistée ni
// acceptée à l'import, quelle que soit sa valeur).
function isValidPrefValue(constraints, key, value) {
  const constraint = constraints[key];
  if (!constraint) return false;
  if (typeof value !== constraint.type) return false;
  if (constraint.type === "number" && (value < constraint.min || value > constraint.max)) return false;
  // Une préférence texte n'existe qu'avec la liste de ses valeurs : sans
  // elle, aucune valeur n'est valide (jamais une exception sur `values`).
  if (constraint.type === "string" && !(constraint.values ?? []).includes(value)) return false;
  return true;
}

function isValidKey(key) {
  return typeof key === "string" && key !== "";
}

// `raw` : objet JSON déjà parsé (stockage ou fichier importé). Convertit vers le
// format courant selon raw.version ; absent ou inconnu -> aucun chemin de montée
// connu, on repart des défauts (objet de préférences vide).
function migratePrefs(raw, version) {
  if (!raw || typeof raw !== "object") return {};
  if (raw.version === version) {
    return raw.prefs && typeof raw.prefs === "object" ? raw.prefs : {};
  }
  return {};
}

// Valide chaque entrée d'un objet de préférences déjà migré, sinon l'ignore.
// Chemin PARTAGÉ par le stockage et l'import fichier : mêmes garanties.
function validatePrefs(constraints, rawPrefs) {
  const valid = {};
  for (const [key, value] of Object.entries(rawPrefs)) {
    if (isValidPrefValue(constraints, key, value)) valid[key] = value;
  }
  return valid;
}

// Crée le magasin, et le CHARGE tout de suite depuis le stockage.
//   storageKey       la clé du stockage ;
//   version          la version du format courant ;
//   constraints      les contraintes, par clé (en-tête) ;
//   fileName, fileDescription  le nom et la description du fichier exporté ;
//   storage          (facultatif) le stockage : localStorage par défaut (absent,
//                    sous Node : les défauts seulement, sans avertir) ; un faux
//                    pour les vérifications.
// -> { getPref, setPref, resetAllPrefs, exportPreferences, importPreferences }.
export function createPreferenceStore({ storageKey, version, constraints, fileName, fileDescription, storage = globalThis.localStorage }) {
  const store = new Map();

  // Toute défaillance (stockage indisponible — mode privé, quota, désactivé — ou
  // JSON illisible) -> store vide (défauts), jamais d'exception : le jeu démarre
  // toujours.
  function load() {
    if (storage === undefined) return;
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return;
      const prefs = validatePrefs(constraints, migratePrefs(JSON.parse(raw), version));
      for (const [key, value] of Object.entries(prefs)) store.set(key, value);
    } catch (error) {
      console.warn("preferences: lecture du stockage impossible, repli sur les défauts.", error);
    }
  }

  function serialize(indent) {
    return JSON.stringify({ version, prefs: Object.fromEntries(store) }, null, indent);
  }

  // Best-effort : une écriture qui échoue (quota, mode privé, désactivé)
  // n'interrompt jamais l'appelant, juste un avertissement discret.
  function persist() {
    try {
      storage.setItem(storageKey, serialize());
    } catch (error) {
      console.warn("preferences: écriture du stockage impossible, non persisté.", error);
    }
  }

  function getPref(key, fallback) {
    if (!isValidKey(key)) {
      console.warn("preferences: clé de préférence invalide, repli sur le défaut fourni.");
      return fallback;
    }
    return store.has(key) ? store.get(key) : fallback;
  }

  function setPref(key, value) {
    if (!isValidKey(key)) {
      console.warn("preferences: clé de préférence invalide, écriture ignorée.");
      return;
    }
    store.set(key, value);
    persist();
  }

  // Réinitialise TOUTES les préférences connues à leur défaut, via setPref —
  // jamais d'accès direct au store : même chemin, mêmes garanties. Robuste par
  // construction à l'ajout d'une préférence : il suffit de la déclarer dans les
  // contraintes.
  function resetAllPrefs() {
    for (const [key, constraint] of Object.entries(constraints)) setPref(key, constraint.default);
  }

  // Télécharge un fichier JSON des préférences courantes, au même format que le
  // stockage, donc ré-importable tel quel. Rend la promesse de
  // lib/download.js/saveTextFile ("saved" | "cancelled" | "downloaded"), que
  // l'appelant annonce.
  function exportPreferences() {
    return saveTextFile(fileName, serialize(2), { description: fileDescription });
  }

  // Lit, migre, valide et applique un fichier de préférences : toute donnée
  // suspecte passe par le même chemin de validation que le stockage. Ne lève
  // jamais : { success, reason? }, pour que l'appelant décide quoi annoncer.
  // reason ∈ "read" (FileReader), "parse" (JSON invalide), "empty" (aucune
  // préférence valide reconnue une fois migrée et validée).
  function importPreferences(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve({ success: false, reason: "read" });
      reader.onload = () => {
        let parsed;
        try {
          parsed = JSON.parse(reader.result);
        } catch (error) {
          resolve({ success: false, reason: "parse" });
          return;
        }
        const prefs = validatePrefs(constraints, migratePrefs(parsed, version));
        if (Object.keys(prefs).length === 0) {
          resolve({ success: false, reason: "empty" });
          return;
        }
        // setPref persiste aussi (une écriture par clé : store minuscule, pas
        // besoin d'optimiser en une seule écriture groupée).
        for (const [key, value] of Object.entries(prefs)) setPref(key, value);
        resolve({ success: true });
      };
      reader.readAsText(file);
    });
  }

  load();
  return { getPref, setPref, resetAllPrefs, exportPreferences, importPreferences };
}
