// Définition du sous-menu Audio (Options > Audio). Deux sliders de volume,
// tous deux persistés via config/preferences.js (voir lib/menu.js pour le
// mécanisme générique de slider). Export/Import et réinitialisation globale
// vivent dans options-menu.js (ce sont des opérations GLOBALES sur toutes
// les préférences, pas spécifiques à l'audio). title et les labelKey/label
// d'entrées sont des CLÉS de traduction, résolues par lib/menu.js via le t
// reçu en paramètre.

import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMessageScreen } from "../../lib/menu.js";
import { setGlobalVolume } from "../../lib/audio.js";
import { t } from "../../i18n/index.js";
import { setPref, PREF_CONSTRAINTS } from "../../config/preferences.js";
import { refreshActiveBeaconVolumes } from "../audio/city-scene.js";

const BEACON = PREF_CONSTRAINTS.beaconVolume;
const FOOTSTEP = PREF_CONSTRAINTS.footstepVolume;
const MUSIC = PREF_CONSTRAINTS.musicVolume;
const AMBIENCE = PREF_CONSTRAINTS.ambienceVolume;

export function createAudioMenu() {
  // Liste séparée (pas juste inline dans entries) : réutilisée telle quelle
  // par resetToDefaults ci-dessous, chaque slider connaît déjà son propre
  // prefKey/default — pas de liste de clés dupliquée ailleurs. min/max/
  // default viennent de PREF_CONSTRAINTS (config/preferences.js), pas
  // redéfinis ici : même source que la validation de persistance.
  const sliders = [
    {
      kind: "slider",
      labelKey: "audio.beacon_volume",
      prefKey: "beaconVolume",
      min: BEACON.min,
      max: BEACON.max,
      step: 1,
      bigStep: 5,
      unit: "%",
      default: BEACON.default,
      // Les balises sont déjà en train de jouer : sans ce callback, le
      // nouveau volume n'apparaîtrait qu'au prochain tick de la ville —
      // qui ne tourne pas tant que ce menu est au sommet de la pile.
      onChange: () => refreshActiveBeaconVolumes(),
    },
    {
      kind: "slider",
      labelKey: "audio.footstep_volume",
      prefKey: "footstepVolume",
      min: FOOTSTEP.min,
      max: FOOTSTEP.max,
      step: 1,
      bigStep: 5,
      unit: "%",
      default: FOOTSTEP.default,
      // Son PONCTUEL, jamais déjà en cours : la préférence est relue à
      // chaque pas (lib/audio.js, playOneShot), pas besoin de rafraîchir
      // quoi que ce soit ici.
    },
    {
      kind: "slider",
      labelKey: "audio.music_volume",
      prefKey: "musicVolume",
      min: MUSIC.min,
      max: MUSIC.max,
      step: 1,
      bigStep: 5,
      unit: "%",
      default: MUSIC.default,
      // Canal global (lib/audio.js), indépendant de toute scène : pas
      // besoin de passer par city-scene.js, setGlobalVolume s'applique
      // directement à la piste en cours (déjà en train de jouer).
      onChange: (value) => setGlobalVolume("music", value / 100),
    },
    {
      kind: "slider",
      labelKey: "audio.ambience_volume",
      prefKey: "ambienceVolume",
      min: AMBIENCE.min,
      max: AMBIENCE.max,
      step: 1,
      bigStep: 5,
      unit: "%",
      default: AMBIENCE.default,
      // Un seul curseur pour les deux couches éventuelles du canal
      // "ambience" (voir lib/audio.js, setGlobalVolume applique le même
      // facteur à tous les flux du canal).
      onChange: (value) => setGlobalVolume("ambience", value / 100),
    },
  ];

  // Réinitialise UNIQUEMENT les clés de ce sous-menu (pas resetAllPrefs,
  // qui est global) — chaque écriture passe par setPref, jamais d'accès
  // direct au store. Moins destructif qu'un reset global : pas de
  // confirmation nécessaire.
  function resetToDefaults() {
    for (const slider of sliders) {
      setPref(slider.prefKey, slider.default);
    }
    refreshActiveBeaconVolumes();
    setGlobalVolume("music", MUSIC.default / 100);
    setGlobalVolume("ambience", AMBIENCE.default / 100);
    // Écran-message plutôt qu'une simple annonce : le résultat doit être
    // entendu en entier, jamais écrasé par une ré-annonce immédiate de la
    // ligne de menu courante (voir lib/menu.js/makeMessageScreen).
    pushScreen(makeMessageScreen("menu.audio.reset_done", t));
  }

  return {
    title: "menu.audio.title",
    closable: true,
    entries: [
      ...sliders,
      {
        label: "menu.audio.reset",
        onActivate: resetToDefaults,
      },
      {
        label: "menu.options.back",
        onActivate: () => popScreen(),
      },
    ],
  };
}
