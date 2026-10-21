// HORLOGE DE PARTIE en ville : SEUL point d'avancement du temps (la boucle,
// à chaque frame, et les sauts de debug). Le core ne lit jamais l'horloge :
// on lui injecte des minutes.

import { runRenderEffects } from "./interaction.js";
import { advanceTime } from "../core/time.js";
import { advanceWeather } from "../core/weather.js";
import { applyDueTriggers } from "../core/triggers.js";
import { TIME_CONFIG } from "../config/time-values.js";

export function createGameClock({ getSession, setSession }) {
  // Avance de `minutes` : le temps, PUIS la météo (qui avance et gèle avec
  // lui, sans code de pause dédié), PUIS les triggers horaires
  // (core/triggers.js) — le core applique leurs effets d'état et rend les
  // effets de rendu dus, joués ici comme ceux d'une action (positionnés sur
  // l'entité).
  function advance(minutes) {
    const before = getSession();
    const { session, fired } = applyDueTriggers(advanceWeather(advanceTime(before, minutes)), before.time);
    setSession(session);
    for (const { entity, effects } of fired) runRenderEffects(entity, effects);
  }

  // Une frame de jeu : le delta RÉEL de la frame (pas le nombre de ticks),
  // converti en minutes de jeu par l'échelle de temps courante. Un menu au
  // sommet de la pile empêche l'appel (voir lib/screens.js/tickFrame) : le
  // temps se fige de lui-même.
  function onFrame(deltaMs) {
    const minutes = (deltaMs / 1000) * (TIME_CONFIG.timeScale / TIME_CONFIG.minutesPerHour);
    advance(minutes);
  }

  return { advance, onFrame };
}
