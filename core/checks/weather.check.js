// Vérifications du core — domaine « weather ». Moteur météo
// (core/weather.js). Lancées par core/checks/index.js/runChecks (voir ce
// fichier). Pur : aucun DOM, aucun fetch ; chaque scène est construite en dur
// via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState } from "../state.js";
import { SAVE_VERSION, serializeGame, deserializeGame } from "../save.js";
import { createSeed } from "../rng.js";
import { INITIAL_TIME } from "../time.js";
import {
  validateWeatherStates,
  advanceWeather,
  pickTransition,
  setWeather,
  triggerNextWeatherTransition,
} from "../weather.js";
import { WEATHER_STATES, DEFAULT_WEATHER_STATE } from "../../config/weather-values.js";
import { throws } from "../../lib/check.js";
import { NO_COMPANIONS, RAW_SCENE, EMPTY_REGISTRY, createAuditFixture } from "./helpers.js";

export default function checkWeather(run) {
  // Fixtures partagées avec d'autres domaines (voir ./helpers.js).
  const { auditSession } = createAuditFixture();

  // --- Moteur météo (core/weather.js, config/weather-values.js) : machine
  // à états GLOBALE pilotée par le temps de jeu, PRNG seedé ->
  // déterministe. Seul le moteur (état + transitions) est vérifié ici ; ses
  // effets (condition "weather") le sont dans conditions.check.js.

  function expectWeatherValidationThrows(states) {
    return throws(() => validateWeatherStates(states));
  }
  run("weather : table vide rejetée", true, expectWeatherValidationThrows({}));
  run(
    "weather : état sans transition de poids positif rejeté (état sans issue)",
    true,
    expectWeatherValidationThrows({ clear: { duration: { min: 10, max: 20 }, transitions: { clear: 0 } } })
  );
  run(
    "weather : transition vers une cible inconnue rejetée",
    true,
    expectWeatherValidationThrows({ clear: { duration: { min: 10, max: 20 }, transitions: { doesNotExist: 1 } } })
  );
  run(
    "weather : poids négatif rejeté",
    true,
    expectWeatherValidationThrows({ clear: { duration: { min: 10, max: 20 }, transitions: { clear: -1 } } })
  );
  run(
    "weather : duration incohérente (min > max) rejetée",
    true,
    expectWeatherValidationThrows({ clear: { duration: { min: 20, max: 10 }, transitions: { clear: 1 } } })
  );
  run(
    "weather : durée non entière rejetée",
    true,
    expectWeatherValidationThrows({ clear: { duration: { min: 1.5, max: 10 }, transitions: { clear: 1 } } })
  );
  run(
    "weather : état inatteignable depuis DEFAULT_WEATHER_STATE rejeté",
    true,
    expectWeatherValidationThrows({
      [DEFAULT_WEATHER_STATE]: { duration: { min: 10, max: 20 }, transitions: { [DEFAULT_WEATHER_STATE]: 1 } },
      orphanState: { duration: { min: 10, max: 20 }, transitions: { orphanState: 1 } },
    })
  );
  run(
    "weather : table valide (deux états, tous atteignables) acceptée",
    false,
    expectWeatherValidationThrows({
      [DEFAULT_WEATHER_STATE]: { duration: { min: 10, max: 20 }, transitions: { [DEFAULT_WEATHER_STATE]: 1, other: 1 } },
      other: { duration: { min: 5, max: 15 }, transitions: { [DEFAULT_WEATHER_STATE]: 1 } },
    })
  );
  run("weather : la VRAIE table (config/weather-values.js) est valide", false, expectWeatherValidationThrows(WEATHER_STATES));

  // Tirage pondéré (pickTransition) — ÉQUITÉ : sur un grand nombre de
  // tirages avec des poids CONNUS (40/40/10/10, indépendants de la vraie
  // table), les fréquences observées doivent rester dans une tolérance
  // large mais significative des proportions attendues (40%/40%/10%/10%
  // sur 4000 tirages, marge ±7 points — assez pour absorber le bruit
  // statistique sans jamais valider un tirage biaisé).
  const FAIRNESS_TRANSITIONS = { a: 40, b: 40, c: 10, d: 10 };
  const fairnessTally = { a: 0, b: 0, c: 0, d: 0 };
  let fairnessRngState = createSeed("weather-fairness-check");
  const FAIRNESS_SAMPLES = 4000;
  for (let i = 0; i < FAIRNESS_SAMPLES; i++) {
    const picked = pickTransition(FAIRNESS_TRANSITIONS, fairnessRngState);
    fairnessTally[picked.target] += 1;
    fairnessRngState = picked.rngState;
  }
  function withinTolerance(observedCount, expectedWeight) {
    const observedPct = (observedCount / FAIRNESS_SAMPLES) * 100;
    return Math.abs(observedPct - expectedWeight) <= 7;
  }
  run(
    "weather : tirage pondéré — fréquences observées proches des poids déclarés (40/40/10/10 ± 7 points)",
    true,
    withinTolerance(fairnessTally.a, 40) &&
      withinTolerance(fairnessTally.b, 40) &&
      withinTolerance(fairnessTally.c, 10) &&
      withinTolerance(fairnessTally.d, 10)
  );
  run(
    "weather : tirage pondéré — poids nul JAMAIS tiré (filet, indépendamment de la tolérance ci-dessus)",
    0,
    (() => {
      let s = createSeed("weather-zero-weight-check");
      let zeroPicked = 0;
      for (let i = 0; i < 500; i++) {
        const picked = pickTransition({ never: 0, always: 1 }, s);
        s = picked.rngState;
        if (picked.target === "never") zeroPicked += 1;
      }
      return zeroPicked;
    })()
  );

  // État initial d'une partie (createInitialState -> createInitialWeather).
  const weatherScene = parseScene(RAW_SCENE, EMPTY_REGISTRY);
  const freshWeatherState = createInitialState(weatherScene, 1, NO_COMPANIONS);
  run("weather : état initial = DEFAULT_WEATHER_STATE", DEFAULT_WEATHER_STATE, freshWeatherState.weather.state);
  run(
    "weather : première transition programmée DANS la fourchette de durée de l'état par défaut",
    true,
    freshWeatherState.weather.nextTransitionAt - INITIAL_TIME >= WEATHER_STATES[DEFAULT_WEATHER_STATE].duration.min &&
      freshWeatherState.weather.nextTransitionAt - INITIAL_TIME <= WEATHER_STATES[DEFAULT_WEATHER_STATE].duration.max
  );

  // Gel : sans avancée de temps, advanceWeather ne fait RIEN — même
  // référence renvoyée (comme le reste du core, voir "action inconnue
  // renvoie la même référence", movement.check.js). C'est CE mécanisme, appelé
  // uniquement depuis view/game-clock.js/onFrame (jamais si un menu est
  // au sommet de la pile), qui donne le gel en pause — rien de spécial à
  // tester côté pause elle-même, purement une conséquence de ce test.
  const frozen = advanceWeather(freshWeatherState);
  run("weather : sans avancée de temps -> référence INCHANGÉE (gel)", freshWeatherState, frozen);

  // Transition simple : franchir le rendez-vous programmé déclenche UNE
  // transition, le nouveau rendez-vous est dans le futur.
  const justPastThreshold = {
    ...freshWeatherState,
    time: freshWeatherState.weather.nextTransitionAt + 1,
  };
  const afterOneTransition = advanceWeather(justPastThreshold);
  run("weather : franchir le rendez-vous déclenche une transition (nouvel objet)", true, afterOneTransition.weather !== freshWeatherState.weather);
  run(
    "weather : après transition, le nouveau rendez-vous est dans le futur",
    true,
    afterOneTransition.weather.nextTransitionAt > afterOneTransition.time
  );

  // Grand saut vs accumulation pas à pas : DOIVENT produire EXACTEMENT le
  // même résultat (même seed, même temps total écoulé) — preuve à la fois
  // du déterminisme ET que le grand saut franchit correctement PLUSIEURS
  // transitions d'affilée (si la boucle n'en traitait qu'UNE à la fois, le
  // grand saut resterait bloqué sur un rendez-vous largement dépassé, très
  // différent du résultat pas à pas).
  const BIG_JUMP_MINUTES = 3000; // largement de quoi franchir plusieurs transitions
  let bigJumpState = createInitialState(weatherScene, 42, NO_COMPANIONS);
  bigJumpState = advanceWeather({ ...bigJumpState, time: bigJumpState.time + BIG_JUMP_MINUTES });

  let smallStepsState = createInitialState(weatherScene, 42, NO_COMPANIONS);
  for (let i = 0; i < BIG_JUMP_MINUTES; i++) {
    smallStepsState = advanceWeather({ ...smallStepsState, time: smallStepsState.time + 1 });
  }
  run.same(
    "weather : un grand saut de temps == une accumulation pas à pas (multi-transitions franchies, déterminisme)",
    smallStepsState.weather,
    bigJumpState.weather
  );

  // Déterminisme direct : même seed + même déroulé -> même succession
  // météo, rejouée deux fois indépendamment.
  function weatherSequence(seed, totalMinutes) {
    let s = createInitialState(weatherScene, seed, NO_COMPANIONS);
    const sequence = [];
    for (let i = 0; i < totalMinutes; i++) {
      const before = s.weather.state;
      s = advanceWeather({ ...s, time: s.time + 1 });
      if (s.weather.state !== before) sequence.push(s.weather.state);
    }
    return sequence;
  }
  const weatherSeq1 = weatherSequence(7, 2000);
  const weatherSeq2 = weatherSequence(7, 2000);
  run.same("weather : même seed + même déroulé -> même succession météo (déterminisme)", weatherSeq1, weatherSeq2);
  run("weather : la météo change réellement au fil du temps (au moins une transition observée)", true, weatherSeq1.length > 0);

  // Save/load : session.weather (état + rendez-vous + rngState) survit à
  // un aller-retour complet.
  const weatherSaveEnvelope = serializeGame(afterOneTransition);
  const weatherSaveResult = deserializeGame(weatherSaveEnvelope);
  run("weather : sauvegarde — round-trip réussi", true, weatherSaveResult.success);
  if (weatherSaveResult.success) {
    run.same(
      "weather : sauvegarde — weather identique après round-trip",
      afterOneTransition.weather,
      weatherSaveResult.session.weather
    );
  }

  // Sauvegarde ANTÉRIEURE à ce mécanisme : jamais eu de clé `weather` —
  // sans rebouchage (core/save.js/migrateSave), une partie ainsi rechargée
  // porterait `undefined`. Reboutchée depuis la minute de jeu COURANTE de
  // CETTE sauvegarde (auditSession.time), jamais depuis zéro.
  const { weather: _droppedWeather, ...auditSessionWithoutWeather } = auditSession;
  const oldWeatherSave = { version: SAVE_VERSION, data: auditSessionWithoutWeather };
  const oldWeatherSaveResult = deserializeGame(oldWeatherSave);
  run("weather : sauvegarde antérieure acceptée (weather rebouché)", true, oldWeatherSaveResult.success);
  if (oldWeatherSaveResult.success) {
    run("weather : partie rebouchée — état par défaut", DEFAULT_WEATHER_STATE, oldWeatherSaveResult.session.weather.state);
    run(
      "weather : partie rebouchée — rendez-vous programmé depuis la minute de jeu COURANTE (jamais depuis zéro)",
      true,
      oldWeatherSaveResult.session.weather.nextTransitionAt > auditSession.time
    );
  }

  // Forçage debug (core/weather.js/setWeather, triggerNextWeatherTransition
  // — voir view/menus/debug-weather-menu.js, Shift+W) : entrée PROPRE dans
  // un état choisi à la main, sans passer par un tirage de CIBLE, mais avec
  // une durée TIRÉE (PRNG toujours sain après coup, voir header du module).
  const forcedBase = createInitialState(weatherScene, "force-check", NO_COMPANIONS);
  const forcedRain = setWeather(forcedBase, "rain");
  run("setWeather : entre bien dans l'état demandé", "rain", forcedRain.weather.state);
  run(
    "setWeather : nouvelle durée dans la fourchette DÉCLARÉE de l'état forcé",
    true,
    forcedRain.weather.nextTransitionAt - forcedBase.time >= WEATHER_STATES.rain.duration.min &&
      forcedRain.weather.nextTransitionAt - forcedBase.time <= WEATHER_STATES.rain.duration.max
  );
  run(
    "setWeather : rngState avance (PRNG non figé après un forçage)",
    true,
    JSON.stringify(forcedRain.weather.rngState) !== JSON.stringify(forcedBase.weather.rngState)
  );
  // Entrée propre : le rendez-vous forcé n'est jamais déjà expiré au
  // moment même du forçage -> advanceWeather juste après reste un no-op
  // (même référence, comme le gel testé plus haut).
  run("setWeather : entrée propre, rendez-vous jamais déjà expiré (advanceWeather juste après = no-op)", forcedRain, advanceWeather(forcedRain));
  // Le moteur reprend son cours normal APRÈS un forçage : dépasser le
  // nouveau rendez-vous transite selon les règles NORMALES de l'état forcé
  // (rain), vers une cible qui lui appartient réellement.
  const afterForcedRun = advanceWeather({ ...forcedRain, time: forcedRain.weather.nextTransitionAt + 1 });
  run(
    "setWeather : après forçage, la transition suivante reste une cible VALIDE de l'état forcé (moteur sain)",
    true,
    WEATHER_STATES.rain.transitions[afterForcedRun.weather.state] > 0
  );

  // triggerNextWeatherTransition : force le moteur à transiter MAINTENANT
  // selon les poids NORMAUX de l'état courant (pas un état choisi à la
  // main, contrairement à setWeather) — chaque cible tirée doit toujours
  // appartenir aux transitions de poids positif de l'état QUITTÉ, sur une
  // longue chaîne d'appels enchaînés (chacun repart de l'état/rngState
  // produit par le précédent), et produire une variété de résultats
  // (preuve qu'il ne renvoie jamais bêtement la même cible).
  let triggerState = createInitialState(weatherScene, "trigger-check", NO_COMPANIONS);
  const triggerTargetsSeen = new Set();
  let allTriggerTargetsValid = true;
  const TRIGGER_SAMPLES = 300;
  for (let i = 0; i < TRIGGER_SAMPLES; i++) {
    const before = triggerState.weather.state;
    triggerState = triggerNextWeatherTransition(triggerState);
    triggerTargetsSeen.add(triggerState.weather.state);
    if (!(WEATHER_STATES[before].transitions[triggerState.weather.state] > 0)) allTriggerTargetsValid = false;
  }
  run(`triggerNextWeatherTransition : chaque cible (${TRIGGER_SAMPLES} tirages enchaînés) appartient aux transitions de l'état quitté`, true, allTriggerTargetsValid);
  run("triggerNextWeatherTransition : produit une variété de cibles (pas toujours la même)", true, triggerTargetsSeen.size > 1);
}
