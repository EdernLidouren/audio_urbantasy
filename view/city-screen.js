// Écran "ville" : possède l'onTick continu (déplacement) et la scène audio
// spatiale qui suit la position du joueur. Ne détient aucune donnée de
// partie en propre — vue sur la session (état du core), lue/écrite via les
// accesseurs fournis par main.js.

import { getMoveIntent } from "./input.js";
import { announce } from "./announce.js";
import { t } from "../i18n/index.js";
import { ensureAudioUnlocked } from "./audio.js";
import { createCityAudioScene } from "./audio/city-scene.js";
import { tick } from "../core/actions.js";
import { reduce } from "../core/reduce.js";

export function makeCityScreen(getSession, setSession) {
  let scene = null;

  return {
    onEnter() {
      ensureAudioUnlocked();
      scene = createCityAudioScene(getSession);
      document.getElementById("game").focus();
      announce(t(getSession().level.titleKey), { assertive: true });
    },
    onTick() {
      setSession(reduce(getSession(), tick(getMoveIntent())));
      scene.update();
    },
    onExit() {
      scene.destroy();
      scene = null;
    },
  };
}
