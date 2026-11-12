// Jeu des billes, sons de l'écran : l'ESPACE, pur. Une place de la table (main,
// emplacement, défausse, pot) devient une position, puis un rendu : panoramique et
// profondeur (volume, passe-bas, part de réverbération) ; une bille qui roule, le
// rendu de sa position au fil du trajet. Point d'entrée et vue d'ensemble :
// marbles/view/sounds.js.

import { MARBLES_ROLLS, MARBLES_SOUND_DEPTH, MARBLES_SOUND_PLACES } from "../../config/values.js";
import { rollAt, rollEnvelope } from "../rolls.js";


// La position d'une place : { x, y } (voir l'en-tête).
export function positionOf(place, places = MARBLES_SOUND_PLACES) {
  if (place.kind === "slot") return places[place.slot];
  if (place.kind === "discard") return places.discard;
  if (place.kind === "pot") return places.pot;
  const { fromX, toX, y } = places.hand;
  if (place.size <= 1) return { x: (fromX + toX) / 2, y };
  return { x: fromX + ((toX - fromX) * place.index) / (place.size - 1), y };
}

// Le rendu d'une place : { pan, gain, lowpassHz, reverbSend }. `gain` multiplie le
// volume de la catégorie ; `lowpassHz` est absent au plus près (aucun filtre).
// Sans place : centre, plein volume, sec.
export function renderAt(place, places = MARBLES_SOUND_PLACES, depth = MARBLES_SOUND_DEPTH) {
  if (!place) return { pan: 0, gain: 1, lowpassHz: undefined, reverbSend: 0 };
  return renderPosition(positionOf(place, places), depth);
}

// Le rendu d'une POSITION de la table, celle d'une place ou celle d'une bille qui
// roule entre deux.
export function renderPosition({ x, y }, depth = MARBLES_SOUND_DEPTH) {
  return {
    pan: x,
    gain: 10 ** ((depth.farGainDb * y) / 20),
    // L'oreille entend la fréquence sur une échelle logarithmique : une rampe
    // linéaire sonnerait comme un saut puis presque rien.
    lowpassHz: y > 0 ? depth.nearLowpassHz * (depth.farLowpassHz / depth.nearLowpassHz) ** y : undefined,
    reverbSend: depth.nearReverbSend + (depth.farReverbSend - depth.nearReverbSend) * y,
  };
}

export const slotPlace = (slot) => ({ kind: "slot", slot });
export const handPlace = (index, size) => ({ kind: "hand", index, size });
export const discardPlace = () => ({ kind: "discard" });
export const potPlace = () => ({ kind: "pot" });

// Le rendu d'une bille qui roule, `elapsedMs` après son départ, au volume `volume`
// de sa catégorie -> { pan, volume, rate, lowpassHz, reverbSend }. `roll` : `path`
// en positions, `durationMs`, `endRatio` (marbles/view/rolls.js), et `gain`
// (facultatif, 1 par défaut). Le passe-bas est toujours là, ouvert au plus près,
// pour être piloté tout le trajet.
export function rollRendering(roll, elapsedMs, volume, rolls = MARBLES_ROLLS, depth = MARBLES_SOUND_DEPTH) {
  const { position, speedRatio } = rollAt(roll, elapsedMs);
  const rendered = renderPosition(position, depth);
  const gain = roll.gain ?? 1;
  return {
    pan: rendered.pan,
    volume: volume * gain * rendered.gain * speedRatio * rollEnvelope(elapsedMs, roll.durationMs, rolls.fadeMs),
    rate: rolls.restRate + (1 - rolls.restRate) * speedRatio,
    lowpassHz: rendered.lowpassHz ?? depth.nearLowpassHz,
    reverbSend: rendered.reverbSend,
  };
}
