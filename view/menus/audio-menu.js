// Définition du sous-menu Audio (Options > Audio). Deux sliders de volume,
// tous deux persistés via config/preferences.js (voir lib/menu.js pour le
// mécanisme générique de slider). Export/Import et réinitialisation globale
// vivent dans options-menu.js (ce sont des opérations GLOBALES sur toutes
// les préférences, pas spécifiques à l'audio). title et les labelKey/label
// d'entrées sont des CLÉS de traduction, résolues par lib/menu.js via le t
// reçu en paramètre.

import { announce } from "../../lib/announce.js";
import { popScreen } from "../../lib/screens.js";
import { reannounceActiveMenuEntry } from "../../lib/menu.js";
import { setMusicVolume } from "../../lib/audio.js";
import { t } from "../../i18n/index.js";
import { setPref, PREF_CONSTRAINTS } from "../../config/preferences.js";
import { refreshActiveBeaconVolumes } from "../audio/city-scene.js";

const BEACON = PREF_CONSTRAINTS.beaconVolume;
const FOOTSTEP = PREF_CONSTRAINTS.footstepVolume;
const MUSIC = PREF_CONSTRAINTS.musicVolume;

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
      // Canal global (lib/audio.js), singleton indépendant de toute scène :
      // pas besoin de passer par city-scene.js, setMusicVolume s'applique
      // directement à la piste en cours (déjà en train de jouer).
      onChange: (value) => setMusicVolume(value / 100),
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
    setMusicVolume(MUSIC.default / 100);
    announce(t("menu.audio.reset_done"), { assertive: true });
    // Ré-annonce la ligne courante avec sa nouvelle valeur (le curseur est
    // resté sur "Réinitialiser", mais le principe reste générique — voir
    // reannounceActiveMenuEntry).
    reannounceActiveMenuEntry();
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
