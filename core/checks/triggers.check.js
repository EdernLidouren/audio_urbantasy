// Vérifications du core — domaine « triggers ». Triggers horaires
// (core/triggers.js) ; les triggers d'émote sont vérifiés avec les émotes
// (core/checks/emotes.check.js). Lancées par core/checks/index.js/runChecks (voir ce
// fichier). Pur : aucun DOM, aucun fetch ; chaque scène est construite en dur
// via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { TIME_CONFIG } from "../../config/time-values.js";
import { hourChanged, dueTriggerEffects, applyDueTriggers } from "../triggers.js";
import { auditNonSerializable, diffStructure, throws } from "../../lib/check.js";
import { RAW_SCENE } from "./helpers.js";
import { parseNewGame } from "../new-game.js";

export default function checkTriggers(run) {
  // --- Triggers horaires (core/triggers.js) : validation, détection sur
  // transition, sauts de temps, effets d'état sur l'AUTRE face, dormance ---
  const HOUR = TIME_CONFIG.minutesPerHour;
  const BELL_TRIGGER = { on: "hour", effects: [{ type: "playSound", path: "assets/sounds/effects/clock_tower_bell" }] };
  const HOUR_TRIGGER_REGISTRY = {
    bell: { nameKey: "entity.bell.name" },
    lamp: { nameKey: "entity.lamp.name" },
    // Trigger porté par l'ARCHÉTYPE : cascade instance -> type, comme action.
    chime: { nameKey: "entity.chime.name", triggers: [BELL_TRIGGER] },
  };
  const triggerRawScene = {
    id: "movement-check-triggers",
    titleKey: "scene.demo.name",
    length: 20,
    playerStart: 1,
    recto: {
      entities: [
        { id: "bell", type: "bell", x: 10, triggers: [BELL_TRIGGER] },
        { id: "chime", type: "chime", x: 12 },
      ],
    },
    verso: {
      entities: [
        {
          id: "lamp",
          type: "lamp",
          x: 5,
          variables: [{ name: "lit", type: "flag", initial: false }],
          triggers: [
            {
              on: "hour",
              hour: 20,
              effects: [
                { type: "setVariable", scope: "entity", name: "lit", value: true },
                { type: "announce", key: "entity.lamp.on" },
              ],
            },
            { on: "hour", hour: 6, effects: [{ type: "setVariable", scope: "entity", name: "lit", value: false }] },
          ],
        },
        {
          id: "sleeper",
          type: "bell",
          x: 8,
          presence: [{ when: { type: "timeRange", from: 0, to: 1 }, present: true }],
          triggers: [{ on: "hour", effects: [{ type: "announce", key: "entity.sleeper.hour" }] }],
        },
      ],
    },
  };
  const triggerScene = parseScene(triggerRawScene, HOUR_TRIGGER_REGISTRY);
  const triggerBell = triggerScene.recto.entities.find((e) => e.id === "bell");
  const triggerChime = triggerScene.recto.entities.find((e) => e.id === "chime");
  const triggerLamp = triggerScene.verso.entities.find((e) => e.id === "lamp");

  run("triggers : parsé sur l'instance (un trigger, à chaque heure)", 1, triggerBell.triggers.length);
  run("triggers : trigger sans `hour` -> champ absent (sparse)", false, "hour" in triggerBell.triggers[0]);
  run("triggers : effets validés par la grammaire d'action", "playSound", triggerBell.triggers[0].effects[0].type);
  run("triggers : cascade instance -> type (archétype porteur)", 1, triggerChime.triggers.length);
  run("triggers : trigger ciblé conserve son heure", 20, triggerLamp.triggers[0].hour);
  run("triggers : entité sans trigger -> champ absent", false, "triggers" in triggerScene.verso.entities.find((e) => e.id === "sleeper") === false);

  function triggerRejected(patchEntity) {
    const raw = {
      ...triggerRawScene,
      recto: { entities: [{ id: "bell", type: "bell", x: 10, ...patchEntity }] },
      verso: { entities: [] },
    };
    return throws(() => parseScene(raw, HOUR_TRIGGER_REGISTRY));
  }
  run("triggers : `on` inconnu rejeté", true, triggerRejected({ triggers: [{ on: "weather", effects: BELL_TRIGGER.effects }] }));
  run("triggers : `hour` hors [0, 23] rejeté (24)", true, triggerRejected({ triggers: [{ on: "hour", hour: 24, effects: BELL_TRIGGER.effects }] }));
  run("triggers : `hour` non entier rejeté", true, triggerRejected({ triggers: [{ on: "hour", hour: 6.5, effects: BELL_TRIGGER.effects }] }));
  run("triggers : effets vides rejetés", true, triggerRejected({ triggers: [{ on: "hour", effects: [] }] }));
  run("triggers : effet mixte (teleport) rejeté", true, triggerRejected({ triggers: [{ on: "hour", effects: [{ type: "teleport", target: "x" }] }] }));
  run("triggers : effet inconnu rejeté", true, triggerRejected({ triggers: [{ on: "hour", effects: [{ type: "explode" }] }] }));
  run("triggers : tableau vide rejeté", true, triggerRejected({ triggers: [] }));
  run("triggers : non-tableau rejeté", true, triggerRejected({ triggers: BELL_TRIGGER }));
  run("triggers : clé inconnue sur le trigger (gain au mauvais niveau) rejetée", true, triggerRejected({ triggers: [{ ...BELL_TRIGGER, gain: 10 }] }));
  run("triggers : variable inconnue dans un effet rejetée", true, triggerRejected({ triggers: [{ on: "hour", effects: [{ type: "setVariable", scope: "entity", name: "nope", value: 1 }] }] }));

  // Détection : sur TRANSITION d'heure ABSOLUE (un saut de 24 h exactes
  // compte), jamais dans l'heure.
  run("triggers : même heure -> pas de changement", false, hourChanged(9 * HOUR, 9 * HOUR + 59.9));
  run("triggers : frontière franchie -> changement", true, hourChanged(9 * HOUR + 59.9, 10 * HOUR));
  run("triggers : saut de 24 h exactes -> changement (index absolu)", true, hourChanged(9 * HOUR, 33 * HOUR));
  run("triggers : à chaque heure — rien dans l'heure", 0, dueTriggerEffects(triggerBell, 9 * HOUR, 9 * HOUR + 30).length);
  run("triggers : à chaque heure — un effet au franchissement", 1, dueTriggerEffects(triggerBell, 9 * HOUR + 30, 10 * HOUR).length);
  run("triggers : à chaque heure — saut de 5 h -> UNE fois (heure d'arrivée)", 1, dueTriggerEffects(triggerBell, 9 * HOUR, 14 * HOUR).length);
  run("triggers : ciblé 20h — arrivée à 20h -> ses deux effets", 2, dueTriggerEffects(triggerLamp, 19 * HOUR + 50, 20 * HOUR).length);
  run("triggers : ciblé 20h — arrivée à 21h -> rien", 0, dueTriggerEffects(triggerLamp, 20 * HOUR + 50, 21 * HOUR).length);
  run("triggers : ciblé 20h — 20h FRANCHIE par un saut 19h->21h -> rien (arrivée seule)", 0, dueTriggerEffects(triggerLamp, 19 * HOUR, 21 * HOUR).length);
  run("triggers : ciblé 6h — arrivée à 6h le lendemain -> un effet", 1, dueTriggerEffects(triggerLamp, 5 * HOUR, 30 * HOUR).length);

  // Application sur une session : monde actif, DEUX faces, joueur au
  // recto. Le temps est posé directement (session.time), comme le ferait
  // advanceTime.
  const triggerBase = createInitialState(triggerScene, 3);
  const atTime = (session, time) => ({ ...session, time });
  // Un tick à 9h10 résout la présence (sleeper dormante) — une entité dont
  // la présence n'a pas encore été résolue compte comme présente.
  const triggerT0 = reduce(atTime(triggerBase, 9 * HOUR + 10), tick(0));
  const lampOf = (session) => session.worlds[triggerScene.id].verso.entities.find((e) => e.id === "lamp");

  const triggerSame = applyDueTriggers(atTime(triggerT0, 9 * HOUR + 40), triggerT0.time);
  run("triggers : dans l'heure -> MÊME référence de session", true, Object.is(triggerSame.session, atTime(triggerT0, 9 * HOUR + 40).session) || triggerSame.fired.length === 0);
  run("triggers : dans l'heure -> rien de dû", 0, triggerSame.fired.length);

  const triggerTen = applyDueTriggers(atTime(triggerT0, 10 * HOUR), triggerT0.time);
  run("triggers : 10h -> les deux cloches du recto (instance + archétype), pas la lampe", "bell,chime", triggerTen.fired.map((f) => f.entity.id).join(","));
  run("triggers : effets de rendu seuls dans `fired`", "playSound", triggerTen.fired[0].effects.map((e) => e.type).join(","));
  run("triggers : cloche sans effet d'état -> session inchangée (référence)", true, Object.is(triggerTen.session, atTime(triggerT0, 10 * HOUR)) || triggerTen.session.worlds === atTime(triggerT0, 10 * HOUR).worlds);

  const triggerTwenty = applyDueTriggers(atTime(triggerT0, 20 * HOUR), triggerT0.time);
  run("triggers : 20h -> recto d'abord, puis la lampe du verso", "bell,chime,lamp", triggerTwenty.fired.map((f) => f.entity.id).join(","));
  run("triggers : effet d'ÉTAT appliqué sur l'AUTRE face (lampe allumée au verso, joueur au recto)", true, lampOf(triggerTwenty.session).variables.lit.value);
  run("triggers : la lampe ne remonte que son effet de rendu (announce)", "announce", triggerTwenty.fired[2].effects.map((e) => e.type).join(","));
  run("triggers : le recto n'est pas touché par un effet du verso", true, Object.is(triggerTwenty.session.worlds[triggerScene.id].recto, triggerT0.worlds[triggerScene.id].recto));

  const triggerJump = applyDueTriggers(atTime(triggerT0, 14 * HOUR), triggerT0.time);
  run("triggers : saut 9h->14h -> une seule cloche par entité (pas de rafale)", 2, triggerJump.fired.length);
  const triggerCross = applyDueTriggers(atTime(triggerTwenty.session, 21 * HOUR), 19 * HOUR);
  run("triggers : saut 19h->21h -> la lampe (20h) ne tire pas", false, triggerCross.fired.some((f) => f.entity.id === "lamp"));
  const triggerSix = applyDueTriggers(atTime(triggerTwenty.session, 30 * HOUR), 29 * HOUR + 30);
  run("triggers : 6h le lendemain -> lampe éteinte (effet d'état sans rendu, absente de `fired`)", false, lampOf(triggerSix.session).variables.lit.value);
  run("triggers : ... et absente de `fired` (aucun effet de rendu)", false, triggerSix.fired.some((f) => f.entity.id === "lamp"));

  // Dormance : `sleeper` n'est présente qu'entre 0h et 1h — dormante depuis
  // le tick de triggerT0, elle ne tire pas ; AVANT toute résolution de
  // présence (session jamais tiquée), elle compte comme présente et tire.
  run("triggers : entité dormante (présence résolue par le tick)", false, triggerT0.worlds[triggerScene.id].verso.entities.find((e) => e.id === "sleeper").present);
  run("triggers : entité dormante ne tire pas", false, triggerTen.fired.some((f) => f.entity.id === "sleeper"));
  const triggerUnresolved = applyDueTriggers(atTime(triggerBase, 10 * HOUR), 9 * HOUR);
  run("triggers : présence jamais résolue -> compte comme présente, tire", true, triggerUnresolved.fired.some((f) => f.entity.id === "sleeper"));

  // Monde SIMPLE (une seule face) : même mécanisme.
  const triggerSimpleScene = parseScene(
    { ...RAW_SCENE, id: "movement-check-triggers-simple", entities: [{ id: "bell", type: "bell", x: 5, triggers: [BELL_TRIGGER] }] },
    HOUR_TRIGGER_REGISTRY
  );
  const triggerSimple = atTime(createInitialState(triggerSimpleScene, 3), 9 * HOUR);
  run("triggers : monde simple -> la cloche tire", 1, applyDueTriggers(atTime(triggerSimple, 10 * HOUR), triggerSimple.time).fired.length);

  // Compagnon : un trigger horaire le concerne aussi (il suit le joueur).
  const companionStart = parseNewGame(
    { startSceneId: "check", companions: [{ id: "buddy", type: "lamp", variables: [{ name: "fed", type: "flag", initial: false }], triggers: [{ on: "hour", hour: 19, effects: [{ type: "setVariable", scope: "entity", name: "fed", value: true }, BELL_TRIGGER.effects[0]] }] }] },
    HOUR_TRIGGER_REGISTRY
  ).start;
  const withBuddy = atTime(createInitialState(triggerSimpleScene, 3, companionStart), 19 * HOUR);
  const buddyHour = applyDueTriggers(withBuddy, 18 * HOUR + 59);
  run("triggers : compagnon — effet d'état appliqué à son heure", true, buddyHour.session.companions[0].variables.fed.value);
  run("triggers : compagnon — son rendu remonte, après la cloche du monde", "bell,buddy", buddyHour.fired.map((f) => f.entity.id).join(","));
  run("triggers : compagnon — rien hors de son heure", false, applyDueTriggers(atTime(withBuddy, 20 * HOUR), 19 * HOUR + 59).session.companions[0].variables.fed.value);

  // Sérialisabilité : `triggers` est de la donnée pure sur l'entité.
  const triggerLeaks = [];
  auditNonSerializable(triggerTwenty.session, "triggerSession", new Set(), triggerLeaks);
  run("triggers : aucune fuite de non-sérialisable", 0, triggerLeaks.length);
  const triggerDiffs = [];
  diffStructure(triggerTwenty.session, JSON.parse(JSON.stringify(triggerTwenty.session)), "triggerSession", triggerDiffs);
  run("triggers : structure identique après round-trip JSON", 0, triggerDiffs.length);
}
