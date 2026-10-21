// Bornes de volume et de fréquence de filtre, partagées par les sons
// ponctuels et le son positionné.

// Bornes structurelles de setCutoff (pas un réglage de feeling, une garantie
// de fréquence valide) : au-delà, un BiquadFilterNode lowpass n'a plus grand
// effet audible (trop grave) ou plus aucun (trop aigu, tout passe).
export const MIN_FILTER_FREQ_HZ = 300;
export const MAX_FILTER_FREQ_HZ = 20000;

// Howler IGNORE silencieusement un volume hors [0, 1] (l'appel est rejeté,
// la voix garde sa dernière valeur acceptée) : un gain de contenu élevé
// près d'une source doit SATURER à 1, jamais figer le volume. Appliqué à
// chaque écriture de volume d'un son positionné ou ponctuel (./positioned.js, ./oneshots.js).
export function clampVolume(volume) {
  return Math.min(Math.max(volume, 0), 1);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
