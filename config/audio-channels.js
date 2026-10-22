// Constante NEUTRE, zéro import — comme config/tuning-values.js, mais
// distincte de lui : cette valeur n'est pas un réglage de feeling qu'on
// tourne à l'oreille, c'est une CAPACITÉ structurelle (nombre max de flux
// simultanés sur le canal ambiance). Lue à la fois par core/scene.js
// (validation du format de scène) et view/audio/layers.js, qui la fournit
// à lib/audio (setAmbienceLimit) — une seule source, deux lecteurs, aucun
// couplage core<->audio, et lib/ n'importe jamais le jeu.
//
// Monter cette valeur (ex. 2 -> 3) suffit à autoriser 3 ambiances de bout en
// bout : parseScene accepte alors un tableau plus long, et lib/audio/ en
// joue effectivement 3 en simultané — aucune autre modification requise
// dans core/scene.js ni lib/audio/.
export const AMBIENCE_CHANNEL_LIMIT = 2;
