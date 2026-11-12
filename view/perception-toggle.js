// BASCULE DE LA PERCEPTION SURNATURELLE (touche "p") : l'état et sa règle (core,
// core/state.js/togglePerception : il faut l'amélioration), puis le retour
// sensoriel (son, annonce). Ici, seulement le délai entre deux bascules, sur
// l'horloge murale.

import { announce } from "../lib/announce.js";
import { t } from "../data/i18n/index.js";
import { perceptionAvailable, togglePerception } from "../core/state.js";
import { playInterfaceSound } from "./menu-sounds.js";
import { TUNING_DEFAULTS } from "../config/tuning-values.js";

// Deux sons distincts : activation et désactivation se reconnaissent à
// l'oreille avant l'annonce. Non positionnés, volume de l'interface.
const PERCEPTION_ACTIVATION_SOUND_KEY = "assets/sounds/ui/supernatural_perception_activation";
const PERCEPTION_DEACTIVATION_SOUND_KEY = "assets/sounds/ui/supernatural_perception_disactivation";

function playPerceptionToggleSound(active) {
  playInterfaceSound(active ? PERCEPTION_ACTIVATION_SOUND_KEY : PERCEPTION_DEACTIVATION_SOUND_KEY, "bascule de perception");
}

export function createPerceptionToggle({ getSession, setSession }) {
  // Délai minimal entre deux bascules (perceptionCooldownMs, dérivé de la
  // durée du fondu audio) sur l'horloge MURALE : le fondu est mené en temps
  // réel. Vit aussi longtemps que l'écran de ville : traverser une porte en
  // plein fondu ne le contourne pas.
  let cooldownUntil = 0;

  // La touche a-t-elle un effet ? Lu aussi par l'aide des touches
  // (view/city-screen.js), qui ne la montre que débloquée : la règle du core,
  // une seule pour la touche et pour l'aide.
  function isAvailable() {
    return perceptionAvailable(getSession());
  }

  // Sans l'amélioration (le core refuse, la session ne change pas) ou pendant le
  // délai : rien du tout (ni son ni annonce), comme une touche non attribuée.
  function toggle() {
    if (!isAvailable()) return;

    const now = performance.now();
    if (now < cooldownUntil) return;

    const next = togglePerception(getSession());
    if (next === getSession()) return;
    cooldownUntil = now + TUNING_DEFAULTS.perceptionCooldownMs;
    setSession(next);
    const active = getSession().perceptionActive;
    playPerceptionToggleSound(active);
    announce(t(active ? "perception.activated" : "perception.deactivated"), { assertive: true });
  }

  return { toggle, isAvailable };
}
