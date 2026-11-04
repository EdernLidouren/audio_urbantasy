// ANNONCES D'AMBIANCE : le passage du jour à la nuit (et inversement) et les
// changements de météo, déduits du DIFF entre deux états de la partie. En
// POLI : ils s'insèrent entre deux lectures sans rien couper.

import { announce } from "../lib/announce.js";
import { t } from "../data/i18n/index.js";
import { phaseAt } from "../core/time.js";
import { getActiveWorld } from "../core/state.js";

// Message d'un changement de météo : fin de l'ancien état + début du
// nouveau, assemblés par les gabarits i18n ("weather.transition.both" /
// ".startOnly"). Un fragment VIDE est omis (ex. "dégagé" n'a rien à dire en
// partant) — règle générale, jamais un cas codé en dur.
function composeWeatherTransitionMessage(fromState, toState) {
  const end = t(`weather.transition.${fromState}.end`);
  const start = t(`weather.transition.${toState}.start`);
  if (end && start) return t("weather.transition.both", { end, start });
  if (start) return t("weather.transition.startOnly", { start });
  if (end) return t("weather.transition.startOnly", { start: end });
  return "";
}

// Rend { update() }. L'état de départ est celui du montage : arriver dans un
// monde n'annonce ni la phase ni la météo, seules leurs bascules le sont.
export function createAmbientAnnouncements(getSession) {
  let currentPhase = phaseAt(getSession().time);
  let weatherState = getSession().weather.state;

  function update() {
    const session = getSession();
    const phase = phaseAt(session.time);
    if (phase !== currentPhase) {
      currentPhase = phase;
      // Même règle que la météo ci-dessous, pour une face qui ne voit pas le ciel.
      if (getActiveWorld(session).phaseAnnouncements) {
        announce(t(currentPhase === "night" ? "time.phase.nightBegins" : "time.phase.dayBegins"));
      }
    }
    if (session.weather.state !== weatherState) {
      const previousWeatherState = weatherState;
      weatherState = session.weather.state;
      // Une face coupée de la météo (`weatherAnnouncements`) la laisse passer
      // sans rien dire. L'état reste suivi : en sortir n'annonce pas après
      // coup un changement que personne n'a vu venir.
      if (getActiveWorld(session).weatherAnnouncements) {
        announce(composeWeatherTransitionMessage(previousWeatherState, weatherState));
      }
    }
  }

  return { update };
}
