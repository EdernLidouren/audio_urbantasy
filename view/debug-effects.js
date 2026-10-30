// EFFETS DES OUTILS DE DEBUG de l'écran de ville (mode debug seulement) :
// forçage météo (Shift+W), saut et vitesse du temps
// (Shift+T), oubli des scènes visitées (Shift+M), argent (Shift+G). Chaque effet modifie l'état
// par le core, puis annonce le résultat. Le rechargement d'une scène depuis
// son fichier, qui reconstruit la vue du monde, est dans
// view/world-travel.js.

import { announce } from "../lib/announce.js";
import { t } from "../data/i18n/index.js";
import { forgetInactiveWorlds } from "../core/state.js";
import { addMoney } from "../core/money.js";
import { setWeather, triggerNextWeatherTransition } from "../core/weather.js";
import { TIME_CONFIG, DEFAULT_TIME_SCALE, setTimeScale, resetTimeScale } from "../config/time-values.js";
import { announceGameTime, announceWeather, announceMoney } from "./status-announcements.js";

// `clock` : voir view/game-clock.js.
export function createDebugEffects({ getSession, setSession, clock }) {
  function forceWeather(targetState) {
    setSession(setWeather(getSession(), targetState));
    announceWeather(getSession());
  }

  function triggerWeatherTransition() {
    setSession(triggerNextWeatherTransition(getSession()));
    announceWeather(getSession());
  }

  // Saut de temps : exactement le même chemin qu'un écoulement réel (temps,
  // météo, triggers), puis la nouvelle heure. Les réactions qui dépendent
  // d'un tick suivent au tick suivant, dès la fermeture du menu.
  function advanceTime(minutes) {
    clock.advance(minutes);
    announceGameTime(getSession());
  }

  // Vitesse du temps : `scale` null -> valeur normale. L'annonce donne le
  // multiplicateur RÉSULTANT.
  function changeTimeScale(scale) {
    if (scale === null) {
      resetTimeScale();
    } else {
      setTimeScale(scale);
    }
    announce(t("time.debug.speedSet", { multiplier: TIME_CONFIG.timeScale / DEFAULT_TIME_SCALE }));
  }

  // Oublie tous les mondes sauf l'actif : chacun sera relu depuis son
  // fichier à la prochaine visite. Rien à reconstruire.
  function forgetOtherScenes() {
    const count = Object.keys(getSession().worlds).length - 1;
    setSession(forgetInactiveWorlds(getSession()));
    announce(t("teleport.debug.forgotten", { count }), { assertive: true });
  }

  // Argent : par le seul point d'écriture (core/money.js/addMoney), remise
  // à zéro comprise (on retire tout ce qu'on a). Annonce le nouveau solde,
  // comme la touche "g".
  function giveMoney(amount) {
    setSession(addMoney(getSession(), amount));
    announceMoney(getSession());
  }

  function resetMoney() {
    giveMoney(-getSession().money);
  }

  return { forceWeather, triggerWeatherTransition, advanceTime, changeTimeScale, forgetOtherScenes, giveMoney, resetMoney };
}
