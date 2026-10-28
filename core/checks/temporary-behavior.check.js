// Vérifications du core — domaine « temporary-behavior ». Comportement
// temporaire (core/temporary-behavior.js) : validation de l'effet, pose,
// décompte au tick, retour à la base, oubli au chargement, compagnons,
// sauvegarde. Lancées par core/checks/index.js/runChecks. Pur : aucun DOM,
// aucun fetch.

import { parseScene } from "../scene.js";
import { createInitialState, applyEntityActionEffects, applyCompanionActionEffects } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { parseNewGame } from "../new-game.js";
import { applyEmoteTriggers } from "../triggers.js";
import { serializeGame, deserializeGame } from "../save.js";
import {
  activeBehaviorOf,
  countDownTemporaryBehavior,
  withBaseBehavior,
  forgetTemporaryBehaviors,
} from "../temporary-behavior.js";
import { TICK_MS } from "../../lib/loop.js";
import { TIME_CONFIG } from "../../config/time-values.js";
import { auditNonSerializable, throws } from "../../lib/check.js";

const REGISTRY = { dog: { nameKey: "entity.dog.name" } };
const BARK = { type: "playSound", path: "assets/sounds/entities/dog_medium_vocal" };
const CALL = { type: "temporaryBehavior", behavior: { kind: "follow", speed: 1.6, maxDistance: 1.5 }, durationMs: 1000 };
const CALL_TICKS = Math.round(1000 / TICK_MS);
const WANDER = { kind: "wander", walkMinMs: 1000, walkMaxMs: 2000, pauseMinMs: 3000, pauseMaxMs: 6000 };

export default function checkTemporaryBehavior(run) {
  // --- Validation de l'effet ---
  const sceneWithEffect = (effect) => ({
    id: "temporary-check-parse",
    titleKey: "scene.demo.name",
    length: 10,
    playerStart: 0,
    entities: [{ id: "d", type: "dog", x: 5, action: { kind: "applyEffects", effects: [effect] } }],
  });
  const loads = (effect) => !throws(() => parseScene(sceneWithEffect(effect), REGISTRY));
  run("temporaryBehavior : forme complète chargée", true, loads(CALL));
  run("temporaryBehavior : durationMs manquant rejeté", false, loads({ type: "temporaryBehavior", behavior: CALL.behavior }));
  run("temporaryBehavior : durationMs nul rejeté", false, loads({ ...CALL, durationMs: 0 }));
  run("temporaryBehavior : durationMs non numérique rejeté", false, loads({ ...CALL, durationMs: "10s" }));
  run("temporaryBehavior : behavior null rejeté (retirer la base n'est pas son rôle)", false, loads({ ...CALL, behavior: null }));
  run("temporaryBehavior : kind inconnu rejeté", false, loads({ ...CALL, behavior: { kind: "fly" } }));
  run("temporaryBehavior : paramètre de comportement inconnu rejeté", false, loads({ ...CALL, behavior: { kind: "follow", walkMinMs: 3 } }));
  run("temporaryBehavior : paramètre incohérent rejeté (min >= max)", false, loads({ ...CALL, behavior: { kind: "follow", minDistance: 2, maxDistance: 1 } }));
  run("temporaryBehavior : champ inconnu rejeté", false, loads({ ...CALL, until: "arrived" }));

  // --- Primitives pures ---
  const based = { id: "x", behavior: WANDER };
  run("activeBehaviorOf : sans temporaire -> la base", "wander", activeBehaviorOf(based).kind);
  const covered = { ...based, temporaryBehavior: { behavior: CALL.behavior, ticksLeft: 2 } };
  run("activeBehaviorOf : avec temporaire -> le temporaire", "follow", activeBehaviorOf(covered).kind);
  run("countDown : sans temporaire -> même référence", based, countDownTemporaryBehavior(based));
  run("countDown : une unité de moins", 1, countDownTemporaryBehavior(covered).temporaryBehavior.ticksLeft);
  const spent = countDownTemporaryBehavior({ ...based, temporaryBehavior: { behavior: CALL.behavior, ticksLeft: 0 } });
  run("countDown : épuisé -> champ retiré", false, "temporaryBehavior" in spent);
  run("countDown : épuisé -> la base reste", "wander", spent.behavior.kind);
  run("withBaseBehavior : base absente -> aucune clé behavior", false, "behavior" in withBaseBehavior({ id: "x", behavior: CALL.behavior }, undefined));

  // --- Pose, décompte au tick, retour à la base ---
  // Joueur en x 2. Le chien errant (base wander) en x 20 ; le chien couché
  // (aucune base) en x 30 ; le chien endormi (dormant à 9h) en x 35.
  const scene = parseScene(
    {
      id: "temporary-check",
      titleKey: "scene.demo.name",
      length: 40,
      playerStart: 2,
      entities: [
        { id: "stray", type: "dog", x: 20, behavior: WANDER, triggers: [{ on: "emote", emote: "whistle", effects: [CALL, BARK] }] },
        { id: "lying", type: "dog", x: 30 },
        { id: "sleeper", type: "dog", x: 35, presence: [{ when: { type: "timeRange", from: 0, to: 1 }, present: true }] },
      ],
    },
    REGISTRY
  );
  const entityOf = (s, id) => s.worlds[scene.id].entities.find((e) => e.id === id);
  const ticks = (s, n) => {
    let next = s;
    for (let i = 0; i < n; i++) next = reduce(next, tick(0));
    return next;
  };
  const start = { ...createInitialState(scene, 7), time: 9 * TIME_CONFIG.minutesPerHour };

  const called = applyEntityActionEffects(start, "stray", [CALL]);
  run("pose : décompte en ticks (durationMs / TICK_MS)", CALL_TICKS, entityOf(called, "stray").temporaryBehavior.ticksLeft);
  run("pose : la base n'est pas touchée", "wander", entityOf(called, "stray").behavior.kind);
  const recalled = applyEntityActionEffects(ticks(called, 10), "stray", [CALL]);
  run("pose : un second appel relance le décompte", CALL_TICKS, entityOf(recalled, "stray").temporaryBehavior.ticksLeft);

  // Accourt vers le joueur : speed 1.6, soit 1,6 fois l'allure du joueur —
  // au moins 1,5 case en une demi-seconde, toujours en direction du joueur.
  const halfway = ticks(called, 30);
  run("tick : le chien appelé accourt vers le joueur", true, 20 - entityOf(halfway, "stray").x >= 1.5);
  run("tick : la base reste en place pendant l'appel", "wander", entityOf(halfway, "stray").behavior.kind);
  run("tick : le décompte avance d'une unité par tick", CALL_TICKS - 30, entityOf(halfway, "stray").temporaryBehavior.ticksLeft);
  const ended = ticks(called, CALL_TICKS + 1);
  run("échéance : champ retiré au tick qui suit la dernière unité", false, "temporaryBehavior" in entityOf(ended, "stray"));
  run("échéance : retour à la base (wander)", "wander", activeBehaviorOf(entityOf(ended, "stray")).kind);
  run("échéance : la veille, encore là", true, "temporaryBehavior" in entityOf(ticks(called, CALL_TICKS), "stray"));

  // Entité SANS base : elle suit, puis retombe immobile, sans clé
  // `behavior` fantôme (forme sérialisée de sa scène).
  const lyingCalled = ticks(applyEntityActionEffects(start, "lying", [CALL]), 20);
  run("sans base : le temporaire la fait bouger", true, entityOf(lyingCalled, "lying").x < 30);
  run("sans base : aucune clé behavior pendant l'appel", false, "behavior" in entityOf(lyingCalled, "lying"));
  const lyingEnded = ticks(lyingCalled, CALL_TICKS);
  run("sans base : à l'échéance, plus rien (ni temporaire ni behavior)", "false,false", ["temporaryBehavior", "behavior"].map((k) => k in entityOf(lyingEnded, "lying")).join(","));
  const lyingX = entityOf(lyingEnded, "lying").x;
  run("sans base : immobile ensuite", lyingX, entityOf(ticks(lyingEnded, 30), "lying").x);

  // Dormante : le temps passe pour elle aussi.
  const sleeperCalled = applyEntityActionEffects(ticks(start, 1), "sleeper", [CALL]);
  run("dormante : bien dormante à 9h", false, entityOf(ticks(sleeperCalled, 1), "sleeper").present);
  run("dormante : le décompte avance quand même", false, "temporaryBehavior" in entityOf(ticks(sleeperCalled, CALL_TICKS + 1), "sleeper"));

  // Déterminisme : mêmes entrées, même état.
  run.same("déterminisme : même appel, mêmes ticks -> même entité", entityOf(ticks(called, 45), "stray"), entityOf(ticks(called, 45), "stray"));

  // --- Par un trigger d'émote : sifflement -> appel + jappement ---
  const whistled = applyEmoteTriggers(start, "whistle", 2);
  run("trigger : le sifflement pose le temporaire", "follow", activeBehaviorOf(entityOf(whistled.session, "stray")).kind);
  run("trigger : le jappement remonte comme effet de rendu", "playSound", whistled.fired.map((f) => f.effects.map((e) => e.type).join("+")).join(","));

  // --- Oubli au chargement ---
  run("forget : rien à oublier -> même référence", start, forgetTemporaryBehaviors(start));
  const forgotten = forgetTemporaryBehaviors(whistled.session);
  run("forget : temporaire retiré", false, "temporaryBehavior" in entityOf(forgotten, "stray"));
  run("forget : la base reste", "wander", entityOf(forgotten, "stray").behavior.kind);
  run("forget : les autres entités gardent leur référence", entityOf(whistled.session, "lying"), entityOf(forgotten, "lying"));

  // --- Compagnons : atteints par les triggers d'émote ---
  const companionStart = parseNewGame(
    {
      startSceneId: "check",
      companions: [
        {
          id: "buddy",
          type: "dog",
          behavior: { kind: "follow", minDistance: 2, maxDistance: 7 },
          triggers: [{ on: "emote", emote: "whistle", effects: [CALL, BARK] }],
        },
      ],
    },
    REGISTRY
  ).start;
  const withBuddy = createInitialState(scene, 7, companionStart);
  const buddyWhistled = applyEmoteTriggers(withBuddy, "whistle", withBuddy.player.x);
  run("compagnon : le sifflement l'atteint", "follow,1.5", [activeBehaviorOf(buddyWhistled.session.companions[0])].map((b) => `${b.kind},${b.maxDistance}`).join(""));
  run("compagnon : sa base (suivi lâche) reste dessous", 7, buddyWhistled.session.companions[0].behavior.maxDistance);
  run("compagnon : son jappement remonte, après l'errant", "stray,buddy", buddyWhistled.fired.map((f) => f.entity.id).join(","));
  run("compagnon : le claquement ne l'atteint pas", "", applyEmoteTriggers(withBuddy, "clap", withBuddy.player.x).fired.map((f) => f.entity.id).join(","));
  run("compagnon : id absent -> session inchangée", withBuddy, applyCompanionActionEffects(withBuddy, "nobody", [CALL]));
  run("compagnon : décompté au tick", CALL_TICKS - 5, ticks(buddyWhistled.session, 5).companions[0].temporaryBehavior.ticksLeft);
  run("compagnon : oublié au chargement", false, "temporaryBehavior" in forgetTemporaryBehaviors(buddyWhistled.session).companions[0]);

  // --- Sauvegarde : donnée pure, survit au rechargement ---
  const midCall = ticks(buddyWhistled.session, 10);
  const leaks = [];
  auditNonSerializable(midCall, "midCall", new Set(), leaks);
  run("sauvegarde : aucune fuite de non-sérialisable", 0, leaks.length);
  const reload = deserializeGame(serializeGame(midCall));
  run("sauvegarde : rechargement réussi", true, reload.success);
  if (reload.success) {
    run.same("sauvegarde : temporaire du monde conservé", entityOf(midCall, "stray").temporaryBehavior, entityOf(reload.session, "stray").temporaryBehavior);
    run.same("sauvegarde : temporaire du compagnon conservé", midCall.companions[0].temporaryBehavior, reload.session.companions[0].temporaryBehavior);
  }
}
