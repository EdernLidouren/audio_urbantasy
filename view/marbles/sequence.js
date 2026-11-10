// Jeu des billes : la FILE D'ÉTAPES de la séquence de résolution. Présentation
// seulement : la simulation a déjà tout résolu quand la file commence, la passer
// ou l'écouter jusqu'au bout ne change rien à la partie. Pur : aucune annonce,
// aucun minuteur ; l'écran (view/marbles/screen.js) la fait avancer par son temps
// réel (images et minuterie, lib/real-time.js : elle continue en arrière-plan ; un
// menu ouvert par-dessus la fige) et dit les étapes qu'elle lui rend.
//
// Une étape : { text, events, pauseMs }. Elle se dit, ses sons se jouent, puis
// la pause s'écoule avant la suivante. La pause vaut une base plus un
// supplément par caractère (MARBLES_SETTINGS.resolutionPauseBaseMs,
// resolutionPausePerCharMs) : un lecteur d'écran met plus longtemps à dire une
// longue phrase. Une étape qui attendra la fin d'un son au lieu d'une durée
// prendra sa place ici, dans advanceSequence.
//
// La file vit tant qu'il reste des étapes à DIRE : la dernière dite, elle est
// finie (null), et le joueur a la main pendant qu'elle se dit.
//
// État de la file : { steps, index, remainingMs, settings }, l'étape en cours,
// ce qui reste de sa pause et les réglages de pause reçus au départ. Chaque fonction rend { sequence, step } : la file d'après
// (null si finie) et l'étape qui commence à l'instant (null : aucune).

import { MARBLES_SETTINGS } from "../../config/marbles-values.js";

const PAUSE_SETTINGS = ["resolutionPauseBaseMs", "resolutionPausePerCharMs"];

// Échoue au chargement sur un réglage faux, plutôt qu'en pleine séquence.
export function validatePauseSettings(settings) {
  for (const name of PAUSE_SETTINGS) {
    const value = settings[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`marbles : ${name} doit être un nombre >= 0.`);
    }
  }
}

validatePauseSettings(MARBLES_SETTINGS);

// La pause après une annonce, selon sa longueur (en caractères, pas en unités
// UTF-16).
export function pauseAfter(text, settings = MARBLES_SETTINGS) {
  return settings.resolutionPauseBaseMs + settings.resolutionPausePerCharMs * [...text].length;
}

function begin(steps, index, settings) {
  const step = { ...steps[index], pauseMs: pauseAfter(steps[index].text, settings) };
  const isLast = index === steps.length - 1;
  return { sequence: isLast ? null : { steps, index, remainingMs: step.pauseMs, settings }, step };
}

// Commence la file : sa première étape est à dire tout de suite.
export function startSequence(steps, settings = MARBLES_SETTINGS) {
  if (steps.length === 0) return { sequence: null, step: null };
  return begin(steps, 0, settings);
}

// Le temps passe. Une étape au plus commence par appel : après une longue
// absence (onglet caché), on reprend à la suivante sans en sauter.
export function advanceSequence(sequence, deltaMs) {
  const remainingMs = sequence.remainingMs - deltaMs;
  if (remainingMs > 0) return { sequence: { ...sequence, remainingMs }, step: null };
  return begin(sequence.steps, sequence.index + 1, sequence.settings);
}

// Passer : directement à la dernière étape (le début du tour suivant, ou la fin
// de partie), sans dire celles d'avant.
export function skipSequence(sequence) {
  return begin(sequence.steps, sequence.steps.length - 1, sequence.settings);
}

// L'étape en cours se redit (Retour arrière, retour d'un menu) : sa pause repart
// de zéro, pour que la suivante ne la coupe pas.
export function restartPause(sequence) {
  return { ...sequence, remainingMs: pauseAfter(sequence.steps[sequence.index].text, sequence.settings) };
}
