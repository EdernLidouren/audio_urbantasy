// BRIQUES WEB AUDIO partagées par les modules de lib/audio/ : un filtre, et
// la rampe d'un paramètre sur l'horloge du contexte. Rien d'autre ici : les
// bornes chiffrées vivent dans ./levels.js, le contexte et la couche
// entités dans ./context.js.

// Un BiquadFilterNode de type `type` ("lowpass", "highpass"), réglé sur
// `freqHz`. Le contexte audio doit exister (Howler.ctx).
export function createFilter(type, freqHz) {
  const filter = Howler.ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freqHz;
  return filter;
}

// Rampe linéaire de l'AudioParam `param` vers `target` en `durationMs`, sur
// l'AUTOMATION NATIVE (elle avance sur l'horloge du contexte, jeu gelé ou
// non). ANNULE toute automation en cours et repart de la valeur COURANTE :
// une rampe interrompue par une autre reprend depuis où elle en est,
// jamais un saut. Sans contexte audio, no-op.
export function rampParam(param, target, durationMs) {
  if (!Howler.ctx) return;
  const now = Howler.ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + durationMs / 1000);
}
