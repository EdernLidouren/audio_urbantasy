// Vérifications du core — domaine « sequence ». Séquences d'effets
// (core/sequence.js, core/pending-effects.js) : découpage par `wait`,
// validation, tranches en attente au tick, triggers, compagnons, oubli au
// chargement, sauvegarde ; et les deux briques qui les accompagnent : le
// comportement "stay" (core/behaviors/stay.js) et "playSound" par `role`.
// Lancées par core/checks/index.js/runChecks. Pur : aucun DOM, aucun fetch.

import { parseScene } from "../scene.js";
import { createInitialState, applyEntityActionEffects, applyCompanionActionEffects } from "../state.js";
import { advanceTick } from "../advance.js";
import { parseNewGame } from "../new-game.js";
import { applyEmoteTriggers, applyDueTriggers } from "../triggers.js";
import { serializeGame, deserializeGame } from "../save.js";
import { sequenceHead, sequenceTail } from "../sequence.js";
import { applyDuePendingEffects, countDownPending, forgetPendingEffects } from "../pending-effects.js";
import { activeBehaviorOf } from "../temporary-behavior.js";
import { TICK_MS } from "../../lib/loop.js";
import { TIME_CONFIG } from "../../config/time-values.js";
import { throws } from "../../lib/check.js";

const VOCAL = { vocal: { path: "assets/sounds/entities/dog_medium_vocal", loop: false } };
const REGISTRY = { dog: { nameKey: "entity.dog.name", sounds: VOCAL }, npc: { nameKey: "entity.npc.name" } };
const BELL = { type: "playSound", path: "assets/sounds/effects/clock_tower_bell" };
const ticksOf = (ms) => Math.max(1, Math.round(ms / TICK_MS));

export default function checkSequence(run) {
  // --- Découpage pur ---
  const plain = [BELL, { type: "startle" }];
  run("sequenceHead : sans wait -> même référence", plain, sequenceHead(plain));
  run("sequenceTail : sans wait -> aucune tranche", 0, sequenceTail(plain, 1).chunks.length);
  const list = [BELL, { type: "wait", ms: 500 }, { type: "startle" }, { type: "wait", ms: 250 }, { type: "wait", ms: 250 }, BELL];
  run("sequenceHead : effets avant le premier wait", "playSound", sequenceHead(list).map((e) => e.type).join(","));
  const tail = sequenceTail(list, 1).chunks;
  run("sequenceTail : une tranche par segment, les wait accolés additionnés", 2, tail.length);
  run("sequenceTail : délai de la première tranche", ticksOf(500), tail[0].ticksLeft);
  run("sequenceTail : délais CUMULÉS (500 + 250 + 250)", ticksOf(500) + ticksOf(250) + ticksOf(250), tail[1].ticksLeft);
  run("sequenceTail : wait en tête -> tête vide, tout attend", "0,1", [sequenceHead([{ type: "wait", ms: 100 }, BELL]).length, sequenceTail([{ type: "wait", ms: 100 }, BELL], 1).chunks.length].join(","));
  run("sequenceTail : jamais moins d'un tick", 1, sequenceTail([{ type: "wait", ms: 1 }, BELL], 1).chunks[0].ticksLeft);

  // Variation seedée : dans [ms - v, ms + v], même graine -> même délai,
  // aucun tirage sans variation.
  run("variation : sans variationMs, le PRNG n'avance pas", 42, sequenceTail(list, 42).rngState);
  const varied = [{ type: "wait", ms: 700, variationMs: 150 }, BELL];
  const draws = Array.from({ length: 40 }, (_, seed) => sequenceTail(varied, seed + 1).chunks[0].ticksLeft);
  run("variation : toujours dans la fourchette", true, draws.every((t) => t >= ticksOf(550) && t <= ticksOf(850)));
  run("variation : les délais varient d'une graine à l'autre", true, new Set(draws).size > 5);
  run("variation : même graine -> même délai", sequenceTail(varied, 7).chunks[0].ticksLeft, sequenceTail(varied, 7).chunks[0].ticksLeft);
  run("variation : le PRNG avance d'un pas par wait qui varie", true, sequenceTail(varied, 7).rngState !== 7);
  const counted = countDownPending([{ ticksLeft: 1, effects: [BELL] }, { ticksLeft: 3, effects: [BELL] }]);
  run("countDownPending : échue d'un côté, décomptée de l'autre", "1,2", [counted.due.length, counted.remaining[0].ticksLeft].join(","));

  // --- Validation au chargement ---
  const sceneWith = (entity) => ({ id: "sequence-check-parse", titleKey: "scene.demo.name", length: 10, playerStart: 0, entities: [{ id: "d", type: "dog", x: 5, ...entity }] });
  const actionLoads = (effects) => !throws(() => parseScene(sceneWith({ action: { kind: "applyEffects", effects } }), REGISTRY));
  run("wait : séquence valide chargée", true, actionLoads([BELL, { type: "wait", ms: 300 }, { type: "startle" }]));
  run("wait : ms manquant rejeté", false, actionLoads([BELL, { type: "wait" }, BELL]));
  run("wait : ms nul rejeté", false, actionLoads([BELL, { type: "wait", ms: 0 }, BELL]));
  run("wait : champ inconnu rejeté", false, actionLoads([BELL, { type: "wait", ms: 300, jitter: 50 }, BELL]));
  run("wait : variationMs chargée", true, actionLoads([BELL, { type: "wait", ms: 300, variationMs: 50 }, BELL]));
  run("wait : variationMs plus grande que ms rejetée", false, actionLoads([BELL, { type: "wait", ms: 300, variationMs: 301 }, BELL]));
  run("wait : variationMs négative rejetée", false, actionLoads([BELL, { type: "wait", ms: 300, variationMs: -1 }, BELL]));
  run("wait : en dernier rejeté (il n'attend rien)", false, actionLoads([BELL, { type: "wait", ms: 300 }]));
  run("wait : teleport après un wait rejeté", false, actionLoads([BELL, { type: "wait", ms: 300 }, { type: "teleport", target: "demo" }]));
  run("wait : teleport avant le wait rejeté (la suite serait perdue dans le monde quitté)", false, actionLoads([{ type: "teleport", target: "demo" }, { type: "wait", ms: 300 }, BELL]));
  run(
    "wait : dans les effets de refus aussi",
    false,
    !throws(() => parseScene(sceneWith({ action: { kind: "applyEffects", condition: { type: "arrived" }, refusalEffects: [BELL, { type: "wait", ms: 300 }] } }), REGISTRY))
  );
  const triggerLoads = (effects) => !throws(() => parseScene(sceneWith({ triggers: [{ on: "emote", effects }] }), REGISTRY));
  run("wait : séquence dans un trigger chargée", true, triggerLoads([{ type: "startle" }, { type: "wait", ms: 300 }, BELL]));

  // stay : aucun paramètre, pas même speed.
  run("stay : chargé comme comportement d'entité", true, !throws(() => parseScene(sceneWith({ behavior: { kind: "stay" } }), REGISTRY)));
  run("stay : speed rejeté", false, !throws(() => parseScene(sceneWith({ behavior: { kind: "stay", speed: 2 } }), REGISTRY)));

  // playSound par rôle.
  run("role : rôle de l'entité chargé", true, actionLoads([{ type: "playSound", role: "vocal" }]));
  run("role : path ET role rejetés", false, actionLoads([{ type: "playSound", role: "vocal", path: BELL.path }]));
  run("role : ni path ni role rejetés", false, actionLoads([{ type: "playSound" }]));
  run("role : rôle hors liste rejeté (beacon)", false, actionLoads([{ type: "playSound", role: "beacon" }]));
  run("role : nature meta rejetée", false, actionLoads([{ type: "playSound", role: "vocal", nature: "meta" }]));
  run(
    "role : rôle absent de l'entité porteuse rejeté",
    false,
    !throws(() => parseScene({ ...sceneWith({}), entities: [{ id: "n", type: "npc", x: 5, triggers: [{ on: "emote", effects: [{ type: "playSound", role: "vocal" }] }] }] }, REGISTRY))
  );
  run(
    "role : avec at, rôle d'une autre entité, non vérifié ici",
    true,
    !throws(() => parseScene({ ...sceneWith({}), entities: [{ id: "n", type: "npc", x: 5, action: { kind: "applyEffects", effects: [{ type: "playSound", role: "vocal", at: "d" }] } }] }, REGISTRY))
  );

  // --- Tranches en attente au tick ---
  // Le chien en x 20 : la réaction au sifflement, telle que dans le
  // contenu (figé, jappe, marque un temps, accourt).
  const REACTION = [
    { type: "temporaryBehavior", behavior: { kind: "stay" }, durationMs: 1500 },
    { type: "wait", ms: 700 },
    { type: "playSound", role: "vocal" },
    { type: "wait", ms: 500 },
    { type: "temporaryBehavior", behavior: { kind: "follow", speed: 1.6, maxDistance: 1.5 }, durationMs: 10000 },
  ];
  const WANDER = { kind: "wander", walkMinMs: 300, walkMaxMs: 600, pauseMinMs: 100, pauseMaxMs: 200 };
  const scene = parseScene(
    {
      id: "sequence-check",
      titleKey: "scene.demo.name",
      length: 40,
      playerStart: 2,
      entities: [
        { id: "dog", type: "dog", x: 20, behavior: WANDER, triggers: [{ on: "emote", emote: "whistle", effects: REACTION }] },
        { id: "sleeper", type: "dog", x: 35, presence: [{ when: { type: "timeRange", from: 0, to: 1 }, present: true }] },
      ],
    },
    REGISTRY
  );
  const dogOf = (s, id = "dog") => s.worlds[scene.id].entities.find((e) => e.id === id);
  // Un tick de jeu complet, celui de la vue (core/advance.js).
  const step = (s) => advanceTick(s, 0);
  const steps = (s, n) => {
    let next = s;
    const fired = [];
    for (let i = 0; i < n; i++) {
      const result = step(next);
      next = result.session;
      fired.push(...result.fired.map((f) => `${i + 1}:${f.entity.id}:${f.effects.map((e) => e.type).join("+")}`));
    }
    return { session: next, fired };
  };
  const start = { ...createInitialState(scene, 5), time: 9 * TIME_CONFIG.minutesPerHour };

  const whistled = applyEmoteTriggers(start, "whistle", 2);
  run("sifflement : rien de rendu tout de suite (le jappement attend)", 0, whistled.fired.length);
  run("sifflement : figé tout de suite (stay posé)", "stay", activeBehaviorOf(dogOf(whistled.session)).kind);
  run("sifflement : deux tranches en attente", 2, dogOf(whistled.session).pendingEffects.length);
  const x0 = dogOf(whistled.session).x;
  const frozen = steps(whistled.session, ticksOf(700) - 1);
  run("pendant l'attente : immobile malgré son errance", x0, dogOf(frozen.session).x);
  run("pendant l'attente : rien de rendu", 0, frozen.fired.length);
  const barked = steps(whistled.session, ticksOf(700));
  run("à 700 ms : le jappement, une seule fois, au bon tick", `${ticksOf(700)}:dog:playSound`, barked.fired.join(","));
  run("à 700 ms : toujours figé", "stay", activeBehaviorOf(dogOf(barked.session)).kind);
  const running = steps(whistled.session, ticksOf(700) + ticksOf(500));
  run("à 1,2 s : le suivi rapide remplace l'immobilité", "follow", activeBehaviorOf(dogOf(running.session)).kind);
  run("à 1,2 s : plus rien en attente (champ retiré)", false, "pendingEffects" in dogOf(running.session));
  run("ensuite : il accourt", true, dogOf(steps(running.session, 30).session).x < x0 - 1);
  run("rien en attente -> même référence de session", running.session, applyDuePendingEffects(running.session).session);

  // Variation en jeu : deux chiens sifflés ensemble, des délais tirés dans
  // le PRNG de leur face, qui avance ; même partie rejouée, mêmes délais.
  const VARIED = [
    { type: "temporaryBehavior", behavior: { kind: "stay" }, durationMs: 1500 },
    { type: "wait", ms: 700, variationMs: 150 },
    { type: "playSound", role: "vocal" },
  ];
  const pack = parseScene(
    {
      ...sceneWith({}),
      id: "sequence-check-pack",
      length: 40,
      entities: ["a", "b", "c", "d"].map((id, i) => ({ id, type: "dog", x: 5 + i, triggers: [{ on: "emote", emote: "whistle", effects: VARIED }] })),
    },
    REGISTRY
  );
  const packStart = createInitialState(pack, 9);
  const packWhistled = applyEmoteTriggers(packStart, "whistle", 0).session;
  const delays = packWhistled.worlds[pack.id].entities.map((e) => e.pendingEffects[0].ticksLeft);
  run("variation en jeu : les chiens ne jappent pas tous au même tick", true, new Set(delays).size > 1);
  run("variation en jeu : le PRNG de la face a avancé", true, packWhistled.worlds[pack.id].rngState !== packStart.worlds[pack.id].rngState);
  run.same("variation en jeu : même partie rejouée -> mêmes délais", delays, applyEmoteTriggers(packStart, "whistle", 0).session.worlds[pack.id].entities.map((e) => e.pendingEffects[0].ticksLeft));

  // Un second sifflement pendant la réaction : elle reprend au début.
  const again = applyEmoteTriggers(steps(whistled.session, 30).session, "whistle", 2).session;
  run("second sifflement : la séquence est remplacée, pas ajoutée", 2, dogOf(again).pendingEffects.length);
  run("second sifflement : délai repartant de zéro", ticksOf(700), dogOf(again).pendingEffects[0].ticksLeft);
  // Une liste sans wait ne touche pas à la séquence en cours.
  const untouched = applyEntityActionEffects(whistled.session, "dog", [BELL]);
  run("liste sans wait : séquence en cours intacte", dogOf(whistled.session).pendingEffects, dogOf(untouched).pendingEffects);

  // Dormante : l'état passe, le rendu non.
  const sleeperSeq = applyEntityActionEffects(steps(start, 1).session, "sleeper", [{ type: "wait", ms: 100 }, BELL, { type: "startle" }]);
  const sleeperAfter = steps(sleeperSeq, ticksOf(100));
  run("dormante : effet d'état appliqué à l'échéance", true, dogOf(sleeperAfter.session, "sleeper").startled);
  run("dormante : aucun rendu", 0, sleeperAfter.fired.length);

  // --- Triggers : chaque séquence à part ---
  const twoTriggers = parseScene(
    {
      ...sceneWith({}),
      id: "sequence-check-two",
      entities: [
        {
          id: "d",
          type: "dog",
          x: 5,
          triggers: [
            { on: "emote", effects: [{ type: "wait", ms: 500 }, BELL] },
            { on: "emote", effects: [{ type: "playSound", role: "vocal" }] },
          ],
        },
      ],
    },
    REGISTRY
  );
  const both = applyEmoteTriggers(createInitialState(twoTriggers, 1), "clap", 0);
  run("deux triggers : le wait du premier ne retarde pas le second", "playSound", both.fired.map((f) => f.effects.map((e) => e.type).join("+")).join(","));

  // Deux triggers AVEC wait sur le même évènement : les deux suites vont à
  // leur terme, chacune à son heure (la seconde ne remplace pas la
  // première).
  const twoWaits = parseScene(
    {
      ...sceneWith({}),
      id: "sequence-check-two-waits",
      entities: [
        {
          id: "d",
          type: "dog",
          x: 5,
          triggers: [
            { on: "emote", effects: [{ type: "wait", ms: 500 }, { type: "startle" }] },
            { on: "emote", effects: [{ type: "wait", ms: 200 }, BELL] },
          ],
        },
      ],
    },
    REGISTRY
  );
  const bothWaits = applyEmoteTriggers(createInitialState(twoWaits, 1), "clap", 0).session;
  const waitingDog = (s) => s.worlds["sequence-check-two-waits"].entities.find((e) => e.id === "d");
  run("deux triggers avec wait : les deux suites attendent", 2, waitingDog(bothWaits).pendingEffects.length);
  const afterShort = steps(bothWaits, ticksOf(200));
  // Le son d'abord : l'effarouchement rend le chien absent, qui ne
  // jouerait plus rien ensuite.
  run("deux triggers avec wait : la plus courte arrive à son heure", true, afterShort.fired.some((f) => f.endsWith(":d:playSound")));
  run("deux triggers avec wait : la plus longue attend encore", 1, waitingDog(afterShort.session).pendingEffects.length);
  const afterLong = steps(afterShort.session, ticksOf(300));
  run("deux triggers avec wait : la plus longue s'applique aussi", true, waitingDog(afterLong.session).startled === true);
  run("deux triggers avec wait : plus rien n'attend", undefined, waitingDog(afterLong.session).pendingEffects);

  // Trigger horaire de l'AUTRE face : sa séquence va à son terme.
  const HOUR = TIME_CONFIG.minutesPerHour;
  const faces = parseScene(
    {
      id: "sequence-check-faces",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 1,
      recto: { entities: [] },
      verso: {
        entities: [
          {
            id: "lamp",
            type: "npc",
            x: 5,
            variables: [{ name: "lit", type: "flag", initial: false }],
            triggers: [{ on: "hour", effects: [{ type: "wait", ms: 200 }, { type: "setVariable", scope: "entity", name: "lit", value: true }] }],
          },
        ],
      },
    },
    REGISTRY
  );
  const facesStart = { ...createInitialState(faces, 1), time: 10 * HOUR };
  const hourDue = applyDueTriggers(facesStart, 9 * HOUR + 59);
  const lampOf = (s) => s.worlds[faces.id].verso.entities.find((e) => e.id === "lamp");
  run("autre face : rien d'appliqué tout de suite", false, lampOf(hourDue.session).variables.lit.value);
  run("autre face : appliqué à l'échéance", true, lampOf(steps(hourDue.session, ticksOf(200)).session).variables.lit.value);

  // --- Compagnons ---
  const companionStart = parseNewGame(
    {
      startSceneId: "check",
      companions: [{ id: "buddy", type: "dog", behavior: { kind: "follow", minDistance: 2, maxDistance: 8 }, triggers: [{ on: "emote", emote: "whistle", effects: REACTION }] }],
    },
    REGISTRY
  ).start;
  const withBuddy = createInitialState(scene, 5, companionStart);
  const buddyWhistled = applyEmoteTriggers(withBuddy, "whistle", withBuddy.player.x).session;
  run("compagnon : séquence posée", 2, buddyWhistled.companions[0].pendingEffects.length);
  const buddyVaried = applyCompanionActionEffects(withBuddy, "buddy", VARIED);
  run("compagnon : variation tirée dans le PRNG des compagnons", true, buddyVaried.companionsRngState !== withBuddy.companionsRngState);
  const buddyBark = steps(buddyWhistled, ticksOf(700));
  run("compagnon : son jappement à l'échéance", true, buddyBark.fired.some((f) => f === `${ticksOf(700)}:buddy:playSound`));
  run("compagnon : accourt à 1,2 s", "follow,1.5", [activeBehaviorOf(steps(buddyWhistled, ticksOf(1200)).session.companions[0])].map((b) => `${b.kind},${b.maxDistance}`).join(""));

  // --- Oubli au chargement, sauvegarde ---
  run("forget : rien à oublier -> même référence", start, forgetPendingEffects(start));
  const forgotten = forgetPendingEffects(buddyWhistled);
  run("forget : entité et compagnon sans attente", "false,false", ["pendingEffects" in forgotten.companions[0], "pendingEffects" in (dogOf(forgotten) ?? {})].join(","));
  const mid = steps(applyEmoteTriggers(withBuddy, "whistle", withBuddy.player.x).session, 10).session;
  const reload = deserializeGame(serializeGame(mid));
  run("sauvegarde : rechargement réussi", true, reload.success);
  if (reload.success) {
    run.same("sauvegarde : tranches du compagnon conservées", mid.companions[0].pendingEffects, reload.session.companions[0].pendingEffects);
    run.same("sauvegarde : tranches du chien conservées", dogOf(mid).pendingEffects, dogOf(reload.session).pendingEffects);
  }
}
