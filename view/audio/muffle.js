// ÉTOUFFEMENT des sons d'entités (voir ./spatial.js pour sa forme et son
// application). Deux profils, une seule chaîne de rendu :
//   - l'AUTRE FACE d'une scène à deux faces : toujours entièrement étouffée,
//     profil de la scène (faceMufflingGain/faceMufflingLowpassHz) sinon des
//     défauts de config/tuning-values.js ;
//   - la PERCEPTION surnaturelle : quand elle s'active, les entités MONDAINES
//     de la face courante s'étouffent progressivement (rampe de
//     perceptionFadeMs), les entités surnaturelles émergent claires.

import { TUNING_DEFAULTS } from "../../config/tuning.js";
import { NO_MUFFLE, clamp } from "./spatial.js";

const PERCEPTION_MUFFLE = { gain: TUNING_DEFAULTS.perceptionMufflingGain, lowpassHz: TUNING_DEFAULTS.perceptionMufflingLowpassHz };
const PERCEPTION_FADE_MS = TUNING_DEFAULTS.perceptionFadeMs;

// `world` : le monde actif au montage (profil de l'autre face, fixe pour la
// vie de la scène).
export function createMuffle(getSession, world) {
  const faceMuffle = {
    gain: world.faceMufflingGain ?? TUNING_DEFAULTS.faceMufflingGain,
    lowpassHz: world.faceMufflingLowpassHz ?? TUNING_DEFAULTS.faceMufflingLowpassHz,
  };
  const fullFaceMuffle = Object.freeze({ amount: 1, ...faceMuffle });

  // Rampe de l'étouffement mondain, de rampFrom à rampTo depuis
  // rampStartedAt. Aucune animation au montage : une scène qui s'ouvre en
  // pleine perception démarre déjà étouffée.
  let perceptionActive = getSession().perceptionActive;
  let rampFrom = perceptionActive ? 1 : 0;
  let rampTo = perceptionActive ? 1 : 0;
  let rampStartedAt = performance.now();

  // Dosage courant (0..1), interpolé en temps réel : relu à chaque tick,
  // c'est cette réévaluation qui fait le fondu.
  function currentMundaneMuffleAmount() {
    if (rampFrom === rampTo) return rampTo;
    const progress = clamp((performance.now() - rampStartedAt) / PERCEPTION_FADE_MS, 0, 1);
    return rampFrom + (rampTo - rampFrom) * progress;
  }

  // À chaque tick : une bascule de perception relance la rampe depuis le
  // dosage COURANT (un aller-retour rapide repart d'où il en était).
  function update(session) {
    if (session.perceptionActive === perceptionActive) return;
    perceptionActive = session.perceptionActive;
    rampFrom = currentMundaneMuffleAmount();
    rampTo = perceptionActive ? 1 : 0;
    rampStartedAt = performance.now();
  }

  // Étouffement effectif d'une entrée. `forcedMuffle` > 0 : l'entrée est sur
  // l'autre face (profil de face, prioritaire). Sinon une entité
  // surnaturelle n'est jamais étouffée, et une entité mondaine suit la rampe
  // de perception.
  function effectiveMuffle(entry, forcedMuffle) {
    if (forcedMuffle > 0) return { amount: forcedMuffle, ...faceMuffle };
    if (entry.perceptionGated) return NO_MUFFLE;
    return { amount: currentMundaneMuffleAmount(), ...PERCEPTION_MUFFLE };
  }

  return { faceMuffle, fullFaceMuffle, effectiveMuffle, update };
}
