// Préférences utilisateur de Templeton : leurs CONTRAINTES (PREF_CONSTRAINTS,
// défaut et bornes de chaque préférence) et le magasin qui les garde. Le
// mécanisme (stockage local automatique, export et import d'un fichier,
// validation de ce qui est lu) est générique : lib/preferences.js. Sans lien
// avec config/tuning-values.js, qui porte les réglages de feeling, pas les choix
// du joueur. Les appelants ne voient que getPref/setPref/export/import/reset.

import { createPreferenceStore } from "../lib/preferences.js";

// Contraintes par prefKey — SOURCE UNIQUE partagée entre la validation de
// persistance (lib/preferences.js) et les sliders/toggles qui les consomment (voir
// view/menus/*.js, qui lisent min/max/default d'ici plutôt que de les
// redéfinir) : jamais deux définitions divergentes des bornes d'une même
// préférence. type ∈ "number" (borné [min,max]) | "boolean" (bornes non
// pertinentes) | "string" (une valeur parmi `values`).
export const PREF_CONSTRAINTS = {
  // Langue des textes et des annonces (voir view/locale.js). "auto" suit la
  // langue du navigateur ; sinon une langue fournie par data/i18n/ — liste
  // tenue à jour à la main, vérifiée contre les langues réellement chargées
  // (lib/checks/i18n.check.js).
  locale: { type: "string", values: ["auto", "fr", "en"], default: "auto" },
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
  // Question « Partir vers ... ? » avant de passer d'une scène principale à
  // une autre (action "confirm", voir view/interaction.js, doc/scripting.md/
  // "Confirmation d'une action"). Les sous-scènes n'en ont jamais. Activée
  // par défaut : une sortie de scène principale fait changer de quartier,
  // mieux vaut qu'elle ne parte pas sur un appui distrait.
  confirmSceneChange: { type: "boolean", default: true },
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

// Le magasin, chargé dès le premier import de ce module. Format stocké :
// { version, prefs } ; pour l'instant, seule la version 1 existe.
export const { getPref, setPref, resetAllPrefs, exportPreferences, importPreferences } = createPreferenceStore({
  storageKey: "templeton-preferences",
  version: 1,
  constraints: PREF_CONSTRAINTS,
  fileName: "templeton-preferences.json",
  fileDescription: "Préférences Templeton",
});
