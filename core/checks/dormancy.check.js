// Vérifications du core — domaine « dormancy ». Dormance FORCÉE par l'effet
// "dormantUntil" (core/variables.js, core/presence.js/isForcedDormant) :
// échéance au prochain début d'heure (core/time.js/nextHourStart),
// validation, dormance observée au tick, réveil à l'échéance, entité sans
// règle de présence, survie au rechargement et au retour dans le monde.
// Lancées par core/checks/index.js/runChecks (voir ce fichier). Pur : aucun
// DOM, aucun fetch ; chaque scène est construite en dur via un objet
// littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, applyEntityActionEffects } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { nextHourStart, MINUTES_PER_DAY } from "../time.js";
import { isForcedDormant, tracksPresence } from "../presence.js";
import { serializeGame, deserializeGame, resetVisitVariables } from "../save.js";
import { returnStartledEntities } from "../startle.js";
import { auditNonSerializable, throws } from "../../lib/check.js";

const HOUR = 60;

const DORMANCY_REGISTRY = {
  // Un néon de nuit, comme entities/types/neon.js.
  neon: { nameKey: "entity.neon.name", presence: [{ when: { type: "timeRange", from: 22, to: 6 }, present: true }] },
  rock: { nameKey: "entity.rock.name" },
};

function dormancyScene(entities) {
  return { id: "dormancy-check", titleKey: "scene.demo.name", length: 20, playerStart: 1, entities };
}

function entityOf(state, id) {
  return getActiveWorld(state).entities.find((e) => e.id === id);
}

const BURST = [{ type: "dormantUntil", hour: 22 }];

export default function checkDormancy(run) {
  // --- Échéance : le prochain début de l'heure, strictement après ---
  run("nextHourStart : à 23 h 10, le 22 h du lendemain", MINUTES_PER_DAY + 22 * HOUR, nextHourStart(23 * HOUR + 10, 22));
  run("nextHourStart : à 3 h, le 22 h du soir même", 22 * HOUR, nextHourStart(3 * HOUR, 22));
  run("nextHourStart : pile à 22 h, celui du lendemain (strictement après)", MINUTES_PER_DAY + 22 * HOUR, nextHourStart(22 * HOUR, 22));
  run("nextHourStart : un autre jour, même règle", 2 * MINUTES_PER_DAY + 22 * HOUR, nextHourStart(MINUTES_PER_DAY + 23 * HOUR, 22));
  run("nextHourStart : minuit, depuis 23 h", MINUTES_PER_DAY, nextHourStart(23 * HOUR, 0));

  // --- Validation au chargement ---
  const effectLoads = (effect) =>
    !throws(() => parseScene(dormancyScene([{ id: "n", type: "neon", x: 5, action: { kind: "applyEffects", effects: [effect] } }]), DORMANCY_REGISTRY));
  run("dormantUntil : forme valide chargée", true, effectLoads({ type: "dormantUntil", hour: 22 }));
  run("dormantUntil : heure 24 rejetée", false, effectLoads({ type: "dormantUntil", hour: 24 }));
  run("dormantUntil : heure non entière rejetée", false, effectLoads({ type: "dormantUntil", hour: 21.5 }));
  run("dormantUntil : heure absente rejetée", false, effectLoads({ type: "dormantUntil" }));
  run("dormantUntil : champ inconnu rejeté", false, effectLoads({ type: "dormantUntil", hour: 22, minutes: 30 }));

  // --- Application : le néon éclate à 23 h, dort jusqu'au 22 h suivant ---
  const scene = parseScene(
    dormancyScene([
      { id: "neon", type: "neon", x: 5 },
      { id: "rock", type: "rock", x: 10 },
    ]),
    DORMANCY_REGISTRY
  );
  const atTime = (state, time) => ({ ...state, time });
  const lit = reduce(atTime(createInitialState(scene, 1), 23 * HOUR), tick(0));
  run("néon : présent à 23 h", true, entityOf(lit, "neon").present);
  const burst = applyEntityActionEffects(lit, "neon", BURST);
  const deadline = MINUTES_PER_DAY + 22 * HOUR;
  run("dormantUntil : échéance posée sur l'entité", deadline, entityOf(burst, "neon").dormantUntil);
  run("dormantUntil : encore présent avant le tick (le son de l'effet joue)", true, entityOf(burst, "neon").present);
  run("dormantUntil : sans effet sur les autres entités", undefined, entityOf(burst, "rock").dormantUntil);

  const out = reduce(burst, tick(0));
  run("dormance : dormant au tick suivant", false, entityOf(out, "neon").present);
  run("dormance : bascule OBSERVÉE (le beacon s'arrête)", "exited", entityOf(out, "neon").presenceChanged);
  run("dormance : forcée -> sortie muette côté vue", true, isForcedDormant(entityOf(out, "neon"), out.time));

  // Les heures passent : dormant pendant toute sa plage de 22 h à 6 h,
  // de nouveau là au 22 h suivant, avec une entrée observée.
  const stillOut = reduce(atTime(out, deadline - 1), tick(0));
  run("dormance : toujours dormant juste avant l'échéance (sa plage horaire n'y peut rien)", false, entityOf(stillOut, "neon").present);
  const back = reduce(atTime(stillOut, deadline), tick(0));
  run("réveil : présent à l'échéance", true, entityOf(back, "neon").present);
  run("réveil : bascule observée (enterSound)", "entered", entityOf(back, "neon").presenceChanged);
  run("réveil : échéance passée -> plus forcé", false, isForcedDormant(entityOf(back, "neon"), back.time));
  const morning = reduce(atTime(back, deadline + 8 * HOUR), tick(0));
  run("réveil : la sortie normale de 6 h n'est pas forcée (exitSound joué)", false, isForcedDormant(entityOf(morning, "neon"), morning.time));

  // --- Entité sans règle de présence : suivie dès qu'elle est endormie ---
  run("sans règle : pas suivie avant l'effet", false, tracksPresence(entityOf(lit, "rock")));
  const rockOut = reduce(applyEntityActionEffects(lit, "rock", [{ type: "dormantUntil", hour: 6 }]), tick(0));
  run("sans règle : suivie après l'effet", true, tracksPresence(entityOf(rockOut, "rock")));
  run("sans règle : dormante", false, entityOf(rockOut, "rock").present);
  const rockBack = reduce(atTime(rockOut, MINUTES_PER_DAY + 6 * HOUR), tick(0));
  run("sans règle : de nouveau présente à l'échéance", true, entityOf(rockBack, "rock").present);

  // --- Survit au retour dans le monde et au rechargement ---
  const revisited = returnStartledEntities(resetVisitVariables(out));
  run("retour : le chargement du monde ne réveille pas", deadline, entityOf(revisited, "neon").dormantUntil);
  const reload = deserializeGame(serializeGame(out));
  run("save/load : réussit", true, reload.success);
  if (reload.success) run("save/load : échéance conservée", deadline, entityOf(reload.session, "neon").dormantUntil);

  const leaks = [];
  auditNonSerializable(out, "session", new Set(), leaks);
  run("dormance : session sérialisable", 0, leaks.length);
}
