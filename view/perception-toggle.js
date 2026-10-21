// BASCULE DE LA PERCEPTION SURNATURELLE (touche "p") : l'état (core), puis le
// retour sensoriel (son, annonce).

import { announce } from "../lib/announce.js";
import { playOneShot } from "../lib/audio.js";
import { resolveAsset } from "../lib/assets.js";
import { t } from "../data/i18n/index.js";
import { togglePerception } from "../core/state.js";
import { evaluateCondition } from "../core/presence.js";
import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";
import { TUNING_DEFAULTS } from "../config/tuning-values.js";

// Débloquée par l'amélioration "supernatural_perception", vérifiée avec
// l'évaluateur de conditions du core — la MÊME condition qu'une action
// déclarerait. Le court-circuit debug de hasImprovement s'applique.
const SUPERNATURAL_PERCEPTION_IMPROVEMENT = { type: "hasImprovement", id: "supernatural_perception" };

// Deux sons distincts : activation et désactivation se reconnaissent à
// l'oreille avant l'annonce. Non positionnés, volume de l'interface.
const PERCEPTION_ACTIVATION_SOUND_KEY = "assets/sounds/ui/supernatural_perception_activation";
const PERCEPTION_DEACTIVATION_SOUND_KEY = "assets/sounds/ui/supernatural_perception_disactivation";

function playPerceptionToggleSound(active) {
  const key = active ? PERCEPTION_ACTIVATION_SOUND_KEY : PERCEPTION_DEACTIVATION_SOUND_KEY;
  try {
    const factor = getPref("interfaceVolume", PREF_CONSTRAINTS.interfaceVolume.default) / 100;
    playOneShot(resolveAsset(key), { volume: factor });
  } catch (error) {
    console.warn(`perception-toggle: son de bascule de perception indisponible ("${key}") : ${error.message}`);
  }
}

export function createPerceptionToggle({ getSession, setSession }) {
  // Délai minimal entre deux bascules (perceptionCooldownMs, dérivé de la
  // durée du fondu audio) sur l'horloge MURALE : le fondu est mené en temps
  // réel. Vit aussi longtemps que l'écran de ville : traverser une porte en
  // plein fondu ne le contourne pas.
  let cooldownUntil = 0;

  // Sans l'amélioration ou pendant le délai : rien du tout (ni son ni
  // annonce), comme une touche non attribuée.
  function toggle() {
    if (!evaluateCondition(SUPERNATURAL_PERCEPTION_IMPROVEMENT, { session: getSession() })) return;

    const now = performance.now();
    if (now < cooldownUntil) return;
    cooldownUntil = now + TUNING_DEFAULTS.perceptionCooldownMs;

    setSession(togglePerception(getSession()));
    const active = getSession().perceptionActive;
    playPerceptionToggleSound(active);
    announce(t(active ? "perception.activated" : "perception.deactivated"), { assertive: true });
  }

  return { toggle };
}
