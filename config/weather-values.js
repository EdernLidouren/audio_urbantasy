// Table météo — machine à états GLOBALE (une seule météo pour toute la
// ville/partie, voir core/weather.js). Donnée pure, ZÉRO import, comme
// config/tuning-values.js : durées ET poids de transition, TOUT exposé
// ici pour un tweak facile — le moteur ne fait que LIRE cette table,
// jamais rien codé en dur ailleurs.
//
// Chaque état déclare :
//   - duration: { min, max } — minutes de jeu (entières), tirées à CHAQUE
//     entrée dans l'état (voir core/weather.js/drawDuration).
//   - transitions: { <état cible>: <poids> } — poids RELATIFS, PAS des
//     pourcentages : le moteur les normalise par leur SOMME au moment du
//     tirage (voir core/weather.js/pickTransition). Ajuster UN poids ne
//     demande donc JAMAIS de recalculer les autres. Une transition d'un
//     état vers LUI-MÊME (ex. sunny -> sunny) est un choix ORDINAIRE : ça
//     veut dire "reste dans cet état encore un moment, avec une nouvelle
//     durée tirée" — pas un cas spécial.
//   - ambience (optionnel) : { outdoor?, indoor? } — DEUX pools DISTINCTS
//     PAR CONTEXTE (résolus par lib/assets.js/resolveAsset, comme
//     world.ambiences ou PERCEPTION_AMBIENCE_POOL), modèle A : deux
//     matériaux sonores réels, jamais un seul filtré à la volée. Le rendu
//     météo (view/audio/city-scene.js/declareWeatherAmbience) LIT le pool
//     du contexte COURANT (indoor de la scène active, voir
//     core/level.js/parseFace) — il ne COMPOSE JAMAIS un nom de pool à
//     partir de l'état (pas de "rain" + "_indoor" deviné) : le lien
//     état+contexte -> pool est déclaré ICI, explicitement, ou nulle part.
//     Un contexte ABSENT pour un état donné (ex. rain SANS indoor
//     ci-dessous) -> SILENCE PROPRE dans ce contexte, jamais un repli
//     inventé (certaines météos ne s'entendent simplement pas à
//     l'intérieur). Un état peut aussi partager LE MÊME pool pour les deux
//     contextes, si déclaré ainsi. Champ de CONTENU, pas structurel —
//     jamais validé par core/weather.js/validateWeatherStates (dégradation
//     silencieuse acceptée pour une clé absente, même politique que le
//     reste du contenu non structurel du projet).
//
// VALIDÉE au chargement (core/weather.js/validateWeatherStates, appelée
// automatiquement contre CETTE table dès l'import du module) : chaque état
// doit avoir au moins une transition de poids positif (jamais d'état sans
// issue) et rester ATTEIGNABLE depuis DEFAULT_WEATHER_STATE — une table
// mal formée échoue clairement au démarrage, jamais une météo bloquée en
// silence.

export const DEFAULT_WEATHER_STATE = "sunny";

export const WEATHER_STATES = {
  sunny: {
    duration: { min: 120, max: 360 },
    transitions: { sunny: 40, cloudy: 40, rain: 10, fog: 10 },
  },
  cloudy: {
    duration: { min: 60, max: 240 },
    transitions: { cloudy: 50, rain: 30, sunny: 15, fog: 5 },
  },
  rain: {
    duration: { min: 30, max: 150 },
    transitions: { rain: 30, cloudy: 50, sunny: 10, fog: 10 },
    // DEUX matériaux RÉELS distincts par contexte (modèle A, voir header
    // ci-dessus) : rain_outdoor_1.mp3 (l'averse elle-même) et
    // rain_indoor_1.mp3 (assourdie/différente, entendue depuis l'abri).
    ambience: { outdoor: "assets/ambiances/rain_outdoor", indoor: "assets/ambiances/rain_indoor" },
  },
  fog: {
    duration: { min: 30, max: 120 },
    transitions: { fog: 30, cloudy: 50, sunny: 15, rain: 5 },
  },
};
