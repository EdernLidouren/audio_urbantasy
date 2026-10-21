// Préférences utilisateur : store clé -> valeur. Les défauts sont ceux de
// PREF_CONSTRAINTS ci-dessous (champ `default`), seule source des bornes et
// défauts de chaque préférence — sans lien avec config/tuning-values.js,
// qui porte les réglages de feeling, pas les choix du joueur. TOUT le stockage vit ici :
// localStorage automatique + export/import fichier manuel. Aucun autre
// module n'importe localStorage ni ne connaît le format de persistance — les
// appelants ne voient que getPref/setPref/export/import/reset.

import { saveTextFile } from "../lib/download.js";

const STORAGE_KEY = "templeton-preferences";

// Format stocké : { version, prefs }. Les montées de version futures
// s'ajoutent à migratePrefs ci-dessous (v1 -> v2 -> ... -> courante, jamais
// en sautant une étape) ; pour l'instant, seule v1 existe.
const PREFS_VERSION = 1;

// Contraintes par prefKey — SOURCE UNIQUE partagée entre la validation de
// persistance (ci-dessous) et les sliders/toggles qui les consomment (voir
// view/menus/*.js, qui lisent min/max/default d'ici plutôt que de les
// redéfinir) : jamais deux définitions divergentes des bornes d'une même
// préférence. type ∈ "number" (borné [min,max]) | "boolean" (bornes non
// pertinentes, ignorées par isValidPrefValue).
export const PREF_CONSTRAINTS = {
  // Gain de sortie GLOBAL, en bout de chaîne (voir lib/audio/channels.js/
  // setMasterVolume) — AU-DESSUS de tous les volumes par canal ci-dessous,
  // jamais un remplaçant. Défaut délibérément BAS (20%, pas 50% comme les
  // autres) : sécurité d'accessibilité. Un jeu qui démarre fort peut couvrir
  // le lecteur d'écran du joueur — qui ne l'entend alors plus assez pour
  // naviguer jusqu'aux options et baisser le son, piégé par le volume même
  // qui l'en empêche. On démarre bas, le joueur monte s'il le souhaite —
  // jamais l'inverse.
  masterVolume: { type: "number", min: 0, max: 100, default: 20 },
  beaconVolume: { type: "number", min: 0, max: 100, default: 50 },
  footstepVolume: { type: "number", min: 0, max: 100, default: 50 },
  musicVolume: { type: "number", min: 0, max: 100, default: 50 },
  // Plus bas que la musique par défaut : une ambiance est un fond, pas un
  // second plan musical.
  ambienceVolume: { type: "number", min: 0, max: 100, default: 35 },
  // Sons d'INTERFACE : menus (wrap/block/select/cancel/toggle, voir
  // view/menu-sounds.js) + retour de sauvegarde (voir view/save-storage.js)
  // — jamais spatialisés, jamais dans la scène ville. Catégorie à part des
  // quatre ci-dessus (qui sont toutes des sons DU MONDE ou de son ambiance).
  interfaceVolume: { type: "number", min: 0, max: 100, default: 50 },
  // Comportement générique des menus (lib/menu.js), pas un réglage audio :
  // cyclage haut/bas, étoile de repli pour braille/sans-son, suffixe de
  // position ("x sur y"). Étoile et suffixe activés par défaut ; cyclage
  // désactivé tant que l'utilisateur ne l'active pas explicitement.
  menuCycling: { type: "boolean", default: false },
  menuStarPrefix: { type: "boolean", default: true },
  menuIndexSuffix: { type: "boolean", default: true },
  // Carte de la ville (voir lib/coordinate-label.js, view/menus/
  // city-map-menu.js) : SEULEMENT l'annonce des coordonnées (touche "x"),
  // jamais le contenu d'une case. Alpha ACTIVÉE par défaut ("A - 1" plus
  // lisible qu'un doublon numérique "1 - 1") ; inversion des ordonnées
  // DÉSACTIVÉE par défaut (compte depuis le BAS de la grille, voir
  // lib/coordinate-label.js/formatCoordinateY pour la convention exacte).
  cityMapAlphaCoordinates: { type: "boolean", default: true },
  cityMapInvertY: { type: "boolean", default: false },
  // Sauvegarde automatique à chaque changement de scène réussi (voir
  // view/world-travel.js/performTransition) — pas un réglage audio ni de
  // menu, mais suit le même patron de persistance que le reste. Activée par
  // défaut : l'état de partie EST le format de sauvegarde (voir
  // doc/save.md), autant qu'elle le soit réellement sans action de
  // l'utilisateur.
  autoSaveOnTransition: { type: "boolean", default: true },
  // Auto-save TEMPORELLE (temps réel, voir view/autosave-timer.js) — 0 =
  // désactivée ("Jamais", formatage spécial côté menu). INDÉPENDANTE
  // d'autoSaveOnTransition : les deux coexistent, jamais couplées.
  autoSaveIntervalMinutes: { type: "number", min: 0, max: 30, default: 5 },
  // Son de confirmation d'une sauvegarde réussie (voir
  // view/save-storage.js/playSaveSound), lue à chaque appel — QUAND jouer un
  // son reste décidé par l'appelant (playSound, jamais sur l'auto-save
  // transition) ; ce réglage décide juste SI l'utilisateur veut l'entendre
  // du tout. Activé par défaut, jusqu'à désactivation explicite.
  saveSoundEnabled: { type: "boolean", default: true },
};

const store = new Map();

function isValidKey(key) {
  return typeof key === "string" && key !== "";
}

// Valide UNE valeur pour une clé CONNUE : type + bornes de
// PREF_CONSTRAINTS. Clé absente du registre -> invalide par construction
// (jamais persistée ni acceptée à l'import, quelle que soit sa valeur).
function isValidPrefValue(key, value) {
  const constraint = PREF_CONSTRAINTS[key];
  if (!constraint) return false;
  if (typeof value !== constraint.type) return false;
  if (constraint.type === "number" && (value < constraint.min || value > constraint.max)) return false;
  return true;
}

// raw = objet JSON déjà parsé (localStorage ou fichier importé), donnée
// SUSPECTE par définition (corrompue, périmée, trafiquée). Convertit vers
// le format courant selon raw.version ; absent/inconnu -> aucun chemin de
// montée connu, on repart des défauts (objet de préférences vide).
function migratePrefs(raw) {
  if (!raw || typeof raw !== "object") return {};
  if (raw.version === PREFS_VERSION) {
    return raw.prefs && typeof raw.prefs === "object" ? raw.prefs : {};
  }
  return {};
}

// Valide chaque entrée d'un objet de préférences déjà migré : clé connue +
// valeur conforme à PREF_CONSTRAINTS, sinon ignorée silencieusement.
// Chemin PARTAGÉ par localStorage et l'import fichier — mêmes garanties.
function validatePrefs(rawPrefs) {
  const valid = {};
  for (const [key, value] of Object.entries(rawPrefs)) {
    if (isValidPrefValue(key, value)) valid[key] = value;
  }
  return valid;
}

// Chargement au tout premier import de ce module. Toute défaillance
// (localStorage indisponible — mode privé, quota, désactivé — ou JSON
// illisible) -> store vide (défauts), jamais d'exception : le jeu démarre
// toujours.
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const prefs = validatePrefs(migratePrefs(JSON.parse(raw)));
    for (const [key, value] of Object.entries(prefs)) {
      store.set(key, value);
    }
  } catch (error) {
    console.warn("preferences: lecture localStorage impossible, repli sur les défauts.", error);
  }
}
loadFromStorage();

function serializeStore() {
  return JSON.stringify({ version: PREFS_VERSION, prefs: Object.fromEntries(store) });
}

// Best-effort : une écriture qui échoue (quota, mode privé, désactivé)
// n'interrompt jamais l'appelant, juste un avertissement discret.
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, serializeStore());
  } catch (error) {
    console.warn("preferences: écriture localStorage impossible, non persisté.", error);
  }
}

export function getPref(key, fallback) {
  if (!isValidKey(key)) {
    console.warn("preferences: clé de préférence invalide, repli sur le défaut fourni.");
    return fallback;
  }
  return store.has(key) ? store.get(key) : fallback;
}

export function setPref(key, value) {
  if (!isValidKey(key)) {
    console.warn("preferences: clé de préférence invalide, écriture ignorée.");
    return;
  }
  store.set(key, value);
  persist();
}

// Réinitialise TOUTES les préférences connues à leur valeur par défaut
// (PREF_CONSTRAINTS), via setPref — jamais d'accès direct au store : même
// chemin, mêmes garanties que toute autre écriture. Utilisé par
// "Réinitialiser tous les réglages" (menu Options) — robuste par
// construction à l'ajout futur d'une préférence : il suffit de la déclarer
// dans PREF_CONSTRAINTS, ce reset la couvre automatiquement.
export function resetAllPrefs() {
  for (const [key, constraint] of Object.entries(PREF_CONSTRAINTS)) {
    setPref(key, constraint.default);
  }
}

// Déclenche le téléchargement d'un fichier JSON contenant les préférences
// courantes, au même format que le stockage local — donc ré-importable tel
// quel. Rend la promesse de lib/download.js/saveTextFile ("saved" |
// "cancelled" | "downloaded"), que l'appelant annonce.
export function exportPreferences() {
  const text = JSON.stringify({ version: PREFS_VERSION, prefs: Object.fromEntries(store) }, null, 2);
  return saveTextFile("templeton-preferences.json", text, { description: "Préférences Templeton" });
}

// Lit, migre, valide et applique un fichier de préférences (typiquement
// exporté par exportPreferences, mais toute donnée suspecte passe par le
// même chemin de validation que localStorage). Ne lève jamais : résultat
// { success, reason? } pour que l'appelant décide quoi annoncer.
// reason ∈ "read" (FileReader), "parse" (JSON invalide), "empty" (aucune
// préférence valide reconnue une fois migrée/validée).
export function importPreferences(file) {
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

      const prefs = validatePrefs(migratePrefs(parsed));
      if (Object.keys(prefs).length === 0) {
        resolve({ success: false, reason: "empty" });
        return;
      }

      // setPref persiste aussi (une écriture par clé : store minuscule, pas
      // besoin d'optimiser en une seule écriture groupée).
      for (const [key, value] of Object.entries(prefs)) {
        setPref(key, value);
      }
      resolve({ success: true });
    };

    reader.readAsText(file);
  });
}
