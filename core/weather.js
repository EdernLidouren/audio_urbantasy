// Moteur MÉTÉO — machine à états GLOBALE (une seule météo pour toute la
// ville/partie), pilotée par le TEMPS DE JEU (voir
// core/time.js). PRNG seedé (core/rng.js) -> déterministe : même seed +
// même succession d'avancées de temps -> même succession météo, toujours.
//
// session.weather = { state, nextTransitionAt, rngState } : l'état
// courant, le moment (minutes de jeu) de la PROCHAINE transition, et le
// flux PRNG dédié (jamais partagé avec world.rngState ni
// companionsRngState — voir core/state.js, même principe de flux
// indépendants). SEUL point d'écriture en cours de partie : advanceWeather
// ci-dessous, appelé par le bord (view/game-clock.js/advance) EXACTEMENT
// là où core/time.js/advanceTime avance déjà .time — jamais dans
// core/reduce.js (TICK n'avance jamais .time, voir core/time.js/header) :
// la météo avance donc AVEC .time, et gèle quand .time gèle (un menu au
// sommet de la pile arrête déjà onFrame, voir lib/screens.js) — aucun code
// de pause dédié ici, c'est une conséquence gratuite de ce branchement.
//
// Ce moteur ne fait qu'ÉVOLUER l'état ; ceux qui le LISENT : l'ambiance
// sonore météo (config/weather-values.js/ambience, view/audio/layers.js),
// la condition "weather" (doc/scripting.md), les annonces (touche "w",
// view/status-announcements.js ; transitions, view/ambient-announcements.js).
// Pas encore de contenu qui apparaisse selon la météo.

import { WEATHER_STATES, DEFAULT_WEATHER_STATE } from "../config/weather-values.js";
import { createSeed, nextRandom, pickWeighted } from "./rng.js";
import { INITIAL_TIME } from "./time.js";

// Valide la table météo — ÉTAT PAR ÉTAT (durée cohérente, au moins une
// transition de poids POSITIF — jamais d'état sans issue — chaque cible
// référencée existe réellement), PUIS l'ATTEIGNABILITÉ de l'ENSEMBLE
// (parcours depuis DEFAULT_WEATHER_STATE ; un état jamais visité est un
// état MORT). Erreur claire et immédiate (throw), jamais une météo
// bloquée en silence. EXPORTÉE pour que core/checks/weather.check.js puisse la
// vérifier directement contre une table FABRIQUÉE (jamais la vraie, pour
// tester le rejet sans casser le jeu) ; ce module s'auto-valide aussi
// contre la vraie table plus bas, dès son chargement.
export function validateWeatherStates(states) {
  const names = Object.keys(states);
  if (names.length === 0) {
    throw new Error("weather: table météo vide.");
  }

  for (const name of names) {
    const def = states[name];
    const duration = def && def.duration;
    if (
      !duration ||
      !Number.isInteger(duration.min) ||
      !Number.isInteger(duration.max) ||
      duration.min < 1 ||
      duration.min > duration.max
    ) {
      throw new Error(`weather: état "${name}" — duration invalide (min/max entiers, 1 <= min <= max).`);
    }

    const transitions = def.transitions;
    if (!transitions || typeof transitions !== "object" || Array.isArray(transitions)) {
      throw new Error(`weather: état "${name}" sans transitions.`);
    }

    let hasPositiveWeight = false;
    for (const [target, weight] of Object.entries(transitions)) {
      if (!Number.isFinite(weight) || weight < 0) {
        throw new Error(`weather: état "${name}" -> "${target}" : poids invalide (${weight}).`);
      }
      if (!states[target]) {
        throw new Error(`weather: état "${name}" référence une cible inconnue "${target}".`);
      }
      if (weight > 0) hasPositiveWeight = true;
    }
    if (!hasPositiveWeight) {
      throw new Error(`weather: état "${name}" n'a aucune transition de poids positif (état sans issue).`);
    }
  }

  if (!states[DEFAULT_WEATHER_STATE]) {
    throw new Error(`weather: DEFAULT_WEATHER_STATE "${DEFAULT_WEATHER_STATE}" absent de la table.`);
  }

  // Atteignabilité : parcours depuis DEFAULT_WEATHER_STATE, via les
  // transitions de poids positif — tout état jamais visité est un état
  // MORT (jamais atteint depuis le point de départ réel d'une partie).
  const reachable = new Set([DEFAULT_WEATHER_STATE]);
  const queue = [DEFAULT_WEATHER_STATE];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const [target, weight] of Object.entries(states[current].transitions)) {
      if (weight > 0 && !reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    }
  }
  const unreachable = names.filter((name) => !reachable.has(name));
  if (unreachable.length > 0) {
    throw new Error(`weather: état(s) inatteignable(s) depuis "${DEFAULT_WEATHER_STATE}" : ${unreachable.join(", ")}.`);
  }
}

// Auto-validation de la VRAIE table au chargement du module — même
// garantie que view/input.js/checkBindingsForCollisions pour les
// bindings : un contenu cassé échoue au DÉMARRAGE de l'app, jamais
// silencieusement en cours de partie.
validateWeatherStates(WEATHER_STATES);

// Tire une durée (minutes de jeu, ENTIÈRES) dans [min, max] de l'état visé.
function drawDuration({ min, max }, rngState) {
  const { value, state } = nextRandom(rngState);
  return { minutes: Math.round(min + value * (max - min)), rngState: state };
}

// État météo initial d'une PARTIE (voir core/state.js/createInitialState)
// — DEFAULT_WEATHER_STATE, durée tirée dans SA fourchette, flux PRNG dédié
// DÉRIVÉ du seed de partie (même idiome que companionsRngState,
// core/state.js : createSeed(`weather:${seed}`), jamais le même flux que
// le monde ou les compagnons). `atTime` (défaut INITIAL_TIME) : le moment
// à partir duquel la première transition est programmée — surchargé par
// core/save.js pour reboucher une sauvegarde antérieure à ce mécanisme À
// SA propre minute de jeu courante, jamais depuis zéro.
export function createInitialWeather(seed, atTime = INITIAL_TIME) {
  const rngState = createSeed(`weather:${seed}`);
  const drawn = drawDuration(WEATHER_STATES[DEFAULT_WEATHER_STATE].duration, rngState);
  return {
    state: DEFAULT_WEATHER_STATE,
    nextTransitionAt: atTime + drawn.minutes,
    rngState: drawn.rngState,
  };
}

// Fait avancer la météo — SEUL point d'écriture de session.weather en
// cours de partie. Compare session.time (déjà avancé par
// core/time.js/advanceTime, voir header) au rendez-vous programmé : tant
// qu'il est dépassé, TRANSITE (boucle, jamais un simple `if` — un grand
// saut de temps, ex. timeScale accéléré pour le débogage, peut franchir
// PLUSIEURS transitions d'un coup, chacune consommant SON PROPRE tirage,
// jamais un tirage sauté ; la boucle termine toujours, la validation au
// chargement garantit duration.min >= 1, donc nextTransitionAt avance
// d'AU MOINS une minute à chaque itération). nextTransitionAt s'accumule
// depuis le RENDEZ-VOUS PRÉCÉDENT (jamais depuis session.time au moment du
// dépassement) : la séquence résultante ne dépend donc JAMAIS du découpage
// des appels (un pas par frame ou un seul grand saut produisent
// exactement la même succession météo, pour un même seed) — c'est CE qui
// garantit le déterminisme "même seed + même déroulé -> même succession",
// indépendamment du framerate réel. Référence INCHANGÉE si rien ne
// transite (aucun rendez-vous dépassé), comme le reste du core.
export function advanceWeather(session) {
  let weather = session.weather;
  while (session.time >= weather.nextTransitionAt) {
    const picked = pickWeighted(WEATHER_STATES[weather.state].transitions, weather.rngState);
    const drawn = drawDuration(WEATHER_STATES[picked.key].duration, picked.rngState);
    weather = {
      state: picked.key,
      nextTransitionAt: weather.nextTransitionAt + drawn.minutes,
      rngState: drawn.rngState,
    };
  }
  if (weather === session.weather) return session;
  return { ...session, weather };
}

// Point d'entrée de FORÇAGE propre (menu debug météo, Shift+W — voir
// view/menus/debug-weather-menu.js) : ENTRE dans targetState comme si la
// machine venait tout juste d'y transiter légitimement (nouvelle durée
// tirée, prochaine transition programmée à partir de MAINTENANT —
// session.time). Jamais un état plaqué sans lendemain : après un forçage,
// advanceWeather reprend son cours normal depuis CET état, selon SES
// propres règles (voir config/weather-values.js) — rien de spécial à cet
// état forcé une fois entré. PRNG SAIN après coup : drawDuration consomme
// un tirage, exactement comme le ferait une transition normale — seule la
// reproductibilité STRICTE n'est pas garantie ici (un forçage manuel n'a
// pas vocation à être rejoué à l'identique, contrairement à advanceWeather,
// voir son commentaire) : c'est un outil de debug, pas une trajectoire à
// journaliser.
export function setWeather(session, targetState) {
  const drawn = drawDuration(WEATHER_STATES[targetState].duration, session.weather.rngState);
  return {
    ...session,
    weather: {
      state: targetState,
      nextTransitionAt: session.time + drawn.minutes,
      rngState: drawn.rngState,
    },
  };
}

// "Déclencher la transition suivante" (menu debug météo) : force le moteur
// à transiter MAINTENANT, selon les poids NORMAUX de l'état courant (voir
// pickWeighted) — sans attendre que le temps de jeu rattrape
// nextTransitionAt. Compose sur setWeather : le tirage de CIBLE se fait
// ici, l'entrée propre dans cette cible (durée + rendez-vous) est déléguée
// à setWeather, jamais dupliquée.
export function triggerNextWeatherTransition(session) {
  const picked = pickWeighted(WEATHER_STATES[session.weather.state].transitions, session.weather.rngState);
  return setWeather({ ...session, weather: { ...session.weather, rngState: picked.rngState } }, picked.key);
}
