// BASCULE DE LA PERCEPTION SURNATURELLE (touche "p") : l'état (core), puis le
// retour sensoriel (son, annonce).

import { announce } from "../lib/announce.js";
import { t } from "../data/i18n/index.js";
import { togglePerception } from "../core/state.js";
import { evaluateCondition, presenceContextOf } from "../core/presence.js";
import { playInterfaceSound } from "./menu-sounds.js";
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
  playInterfaceSound(active ? PERCEPTION_ACTIVATION_SOUND_KEY : PERCEPTION_DEACTIVATION_SOUND_KEY, "bascule de perception");
}

export function createPerceptionToggle({ getSession, setSession }) {
  // Délai minimal entre deux bascules (perceptionCooldownMs, dérivé de la
  // durée du fondu audio) sur l'horloge MURALE : le fondu est mené en temps
  // réel. Vit aussi longtemps que l'écran de ville : traverser une porte en
  // plein fondu ne le contourne pas.
  let cooldownUntil = 0;

  // La touche a-t-elle un effet ? Lu aussi par l'aide des touches
  // (view/city-screen.js), qui ne la montre que débloquée : une seule règle
  // pour la touche et pour l'aide.
  function isAvailable() {
    return evaluateCondition(SUPERNATURAL_PERCEPTION_IMPROVEMENT, presenceContextOf(getSession()));
  }

  // Sans l'amélioration ou pendant le délai : rien du tout (ni son ni
  // annonce), comme une touche non attribuée.
  function toggle() {
    if (!isAvailable()) return;

    const now = performance.now();
    if (now < cooldownUntil) return;
    cooldownUntil = now + TUNING_DEFAULTS.perceptionCooldownMs;

    setSession(togglePerception(getSession()));
    const active = getSession().perceptionActive;
    playPerceptionToggleSound(active);
    announce(t(active ? "perception.activated" : "perception.deactivated"), { assertive: true });
  }

  return { toggle, isAvailable };
}
