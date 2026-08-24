// Constante NEUTRE, zéro import — comme config/tuning-values.js, mais
// distincte de lui : cette valeur n'est pas un réglage de feeling qu'on
// tourne à l'oreille, c'est une CAPACITÉ structurelle (nombre max de flux
// simultanés sur le canal ambiance). Lue à la fois par core/level.js
// (validation du format de niveau) et lib/audio.js (lecture audio, entrée
// "ambience" de GLOBAL_CHANNELS) — une seule source, deux lecteurs, aucun
// couplage core<->audio : le core importe cette donnée pure, jamais
// lib/audio.js lui-même.
//
// Monter cette valeur (ex. 2 -> 3) suffit à autoriser 3 ambiances de bout en
// bout : parseLevel acceptera un tableau plus long, et lib/audio.js pourra
// effectivement en jouer 3 en simultané — aucune autre modification requise
// dans core/level.js ni lib/audio.js.
export const AMBIENCE_CHANNEL_LIMIT = 2;
