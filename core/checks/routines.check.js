// Vérifications du core — domaine « routines ». Routines de PNJ : habitant,
// miroir demo1/demo2, behavior: null, le bar. Lancées par
// core/checks/index.js/runChecks (voir ce fichier). Pur : aucun DOM, aucun
// fetch ; chaque scène est construite en dur via un objet littéral passé à
// parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { advanceTime, minuteOfHour, hourOfDay } from "../time.js";
import { TIME_CONFIG } from "../../config/time-values.js";
import { isPresent, resolveEntityRules } from "../presence.js";
import { throws } from "../../lib/check.js";
import { TICK_MS } from "../../lib/loop.js";
import { NO_COMPANIONS } from "./helpers.js";

export default function checkRoutines(run) {
  // --- Routine complète (habitant) : jour -> départ -> arrivée
  // -> dormant -> filet de minuit -> réveil ---

  const ROUTINE_REGISTRY = { dog: { nameKey: "entity.dog.name" }, wall: { nameKey: "entity.wall.name", blocksMovement: true } };

  function residentRules(doorId) {
    return [
      { when: { type: "arrived" }, effects: [{ type: "presence", present: false }] },
      { when: { type: "timeRange", from: 0, to: 8 }, effects: [{ type: "presence", present: false }] },
      {
        when: { type: "timeRange", from: 8, to: 24 },
        effects: [
          { type: "presence", present: true },
          { type: "behavior", behavior: { kind: "wander"} },
        ],
      },
      {
        when: { type: "timeRange", from: 20, to: 24 },
        effects: [{ type: "behavior", behavior: { kind: "goto", targetId: doorId } }],
      },
    ];
  }

  function makeRoutineScene(overrides = {}) {
    return {
      id: "movement-check-routine",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "door-1", type: "dog", x: 2 },
        {
          id: "resident-1",
          type: "dog",
          x: 15,
          behavior: { kind: "wander"},
          presence: residentRules("door-1"),
        },
      ],
      ...overrides,
    };
  }

  function resident(routineState, id = "resident-1") {
    return getActiveWorld(routineState).entities.find((e) => e.id === id);
  }

  const routineScene = parseScene(makeRoutineScene(), ROUTINE_REGISTRY);

  // Jour (INITIAL_TIME = 8h) : présente, comportement "wander" — jamais
  // "goto" avant 20h.
  let dayRoutineState = createInitialState(routineScene, 7, NO_COMPANIONS);
  for (let i = 0; i < 50; i++) dayRoutineState = reduce(dayRoutineState, tick(0));
  run("routine : le jour — présente", true, resident(dayRoutineState).present);
  run("routine : le jour — comportement 'wander'", "wander", resident(dayRoutineState).behavior.kind);

  // Comportement STABLE tant que rien ne bascule : la référence de
  // `.behavior` ne change PAS d'un tick à l'autre une fois la journée
  // installée (preuve directe de "pas réarmé en boucle" — si l'effet
  // réappliquait `.behavior` à chaque tick, wander.js renverrait la
  // référence PASSÉE en argument, mais l'appel { ...entity, behavior:
  // resolved.behaviorEffect } produirait un OBJET NEUF à chaque fois).
  const behaviorRefBefore = resident(dayRoutineState).behavior;
  const dayRoutineStateNext = reduce(dayRoutineState, tick(0));
  run(
    "routine : le jour — comportement JAMAIS réécrit en boucle (référence stable)",
    true,
    resident(dayRoutineStateNext).behavior === behaviorRefBefore
  );

  // 20h : bascule vers "goto" — se dirige vers la porte, reste présente
  // (elle n'a pas encore atteint la porte).
  let eveningRoutineState = createInitialState(routineScene, 7, NO_COMPANIONS);
  eveningRoutineState = advanceTime(eveningRoutineState, 12 * 60); // 8h -> 20h
  eveningRoutineState = reduce(eveningRoutineState, tick(0));
  run("routine : à 20h — comportement bascule vers 'goto'", "goto", resident(eveningRoutineState).behavior.kind);
  run("routine : à 20h — cible bien 'door-1'", "door-1", resident(eveningRoutineState).behavior.targetId);
  run("routine : à 20h — encore présente (pas encore arrivée)", true, resident(eveningRoutineState).present);

  // Convergence jusqu'à l'arrivée -> dormante.
  for (let i = 0; i < 1000; i++) eveningRoutineState = reduce(eveningRoutineState, tick(0));
  run("routine : arrivée à la porte -> gotoArrived posé", true, resident(eveningRoutineState).gotoArrived);
  run("routine : arrivée à la porte -> dormante (present:false)", false, resident(eveningRoutineState).present);

  // Filet de minuit : un obstacle empêche TOUTE arrivée — reste présente
  // (en route) toute la soirée, jusqu'à ce que minuit force la dormance
  // MALGRÉ l'absence d'arrivée (jamais visiblement "coincée" après minuit).
  const blockedRoutineScene = parseScene(
    makeRoutineScene({
      entities: [
        { id: "door-1", type: "dog", x: 2 },
        { id: "wall-routine", type: "wall", x: 10 },
        {
          id: "resident-1",
          type: "dog",
          x: 15,
          behavior: { kind: "wander"},
          presence: residentRules("door-1"),
        },
      ],
    }),
    ROUTINE_REGISTRY
  );
  let blockedRoutineState = createInitialState(blockedRoutineScene, 7, NO_COMPANIONS);
  blockedRoutineState = advanceTime(blockedRoutineState, 12 * 60); // -> 20h
  for (let i = 0; i < 500; i++) blockedRoutineState = reduce(blockedRoutineState, tick(0));
  run("routine : bloquée par un obstacle — jamais arrivée", undefined, resident(blockedRoutineState).gotoArrived);
  run("routine : bloquée par un obstacle — reste présente avant minuit", true, resident(blockedRoutineState).present);
  blockedRoutineState = advanceTime(blockedRoutineState, 4 * 60 - 1); // -> juste avant minuit
  blockedRoutineState = reduce(blockedRoutineState, tick(0));
  run("routine : juste avant minuit — encore présente (filet pas encore déclenché)", true, resident(blockedRoutineState).present);
  blockedRoutineState = advanceTime(blockedRoutineState, 2); // -> minuit passé
  blockedRoutineState = reduce(blockedRoutineState, tick(0));
  run("routine : minuit — filet force la dormance MALGRÉ le blocage", false, resident(blockedRoutineState).present);
  run("routine : minuit — toujours jamais 'arrivée' (juste dormante de force)", undefined, resident(blockedRoutineState).gotoArrived);

  // Cible manquante (porte absente) : même filet, l'INTENTION ("elle rentre
  // chez elle") reste honorée même sans marche réelle possible — vérifié en
  // passant RÉELLEMENT par 20h (bascule vers "goto" avec une cible
  // introuvable, dégradation immobile propre — voir goto.js) puis minuit.
  const missingDoorRoutineScene = parseScene(
    makeRoutineScene({
      entities: [
        { id: "resident-1", type: "dog", x: 15, behavior: { kind: "wander"}, presence: residentRules("no-such-door") },
      ],
    }),
    ROUTINE_REGISTRY
  );
  let missingDoorRoutineState = createInitialState(missingDoorRoutineScene, 7, NO_COMPANIONS);
  missingDoorRoutineState = advanceTime(missingDoorRoutineState, 12 * 60); // -> 20h
  const missingDoorThrew = throws(() => {
    for (let i = 0; i < 100; i++) missingDoorRoutineState = reduce(missingDoorRoutineState, tick(0));
  });
  run("routine : cible de porte manquante — ne plante jamais", false, missingDoorThrew);
  run("routine : cible de porte manquante — bascule quand même vers 'goto'", "goto", resident(missingDoorRoutineState).behavior.kind);
  run("routine : cible de porte manquante — reste immobile (dégradation propre)", 15, resident(missingDoorRoutineState).x);
  missingDoorRoutineState = advanceTime(missingDoorRoutineState, 4 * 60 + 1); // -> minuit passé
  missingDoorRoutineState = reduce(missingDoorRoutineState, tick(0));
  run(
    "routine : cible de porte manquante — le filet de minuit force quand même la dormance",
    false,
    resident(missingDoorRoutineState).present
  );

  // Réveil (8h le lendemain) : présente à nouveau, comportement 'wander' —
  // repart pour un nouveau cycle. Note de décalage d'UN TICK (~16 ms,
  // imperceptible) : "arrived" reste vraie tant que `.behavior.kind` n'a
  // pas ENCORE été corrigé vers "wander" — au tick où la fenêtre "8h..24h"
  // bascule, l'effet "behavior" s'applique QUAND MÊME (indépendamment de la
  // présence, voir resolveEntityRules) et corrige `.behavior`, mais la
  // PRÉSENCE de CE MÊME tick a déjà été calculée contre l'ancien
  // `.behavior` (encore "goto") -> encore dormante PENDANT UN TICK, puis
  // spontanément corrigée au suivant (voir core/presence.js/
  // evaluateArrived). Documenté ici plutôt que masqué par une boucle large.
  // Détour par la nuit profonde (1h) AVEC un tick réel avant de sauter à
  // 8h : nécessaire pour que `ruleActive` enregistre RÉELLEMENT la fenêtre
  // "8h..24h" comme retombée à faux entre-temps (un saut direct 20h->8h,
  // sans jamais tic ker entre les deux, ne verrait jamais cette bascule —
  // artefact du SAUT de advanceTime, pas du jeu réel, qui tique en continu).
  let morningRoutineState = eveningRoutineState; // déjà arrivée + dormante (soir précédent)
  morningRoutineState = advanceTime(morningRoutineState, 5 * 60); // 20h -> 1h
  morningRoutineState = reduce(morningRoutineState, tick(0));
  morningRoutineState = advanceTime(morningRoutineState, 7 * 60); // 1h -> 8h
  const morningTick1 = reduce(morningRoutineState, tick(0));
  run(
    "routine : réveil (8h), 1er tick — comportement déjà corrigé vers 'wander' (l'effet s'applique même dormante)",
    "wander",
    resident(morningTick1).behavior.kind
  );
  const morningTick2 = reduce(morningTick1, tick(0));
  run("routine : réveil (8h), tick suivant — présente à nouveau", true, resident(morningTick2).present);
  run("routine : réveil (8h), tick suivant — comportement 'wander'", "wander", resident(morningTick2).behavior.kind);

  // --- Miroir demo1/demo2 (même personnage, deux déclarations séparées,
  // AUCUN état partagé) — RÉEL, voir scenes/demo.json/"npc-resident" et
  // scenes/demo2.json/"npc-resident-home" (mêmes horaires EXACTS ici) :
  // away (demo1) présente 8h-20h (wander) + 20h-23h (goto vers "door-exit",
  // filet à 23h) ; home (demo2) présente 20h-8h (immobile, AUCUN
  // comportement de repos) + 8h-11h (goto vers "door-back", filet à 11h).
  // Avec CES horaires précis (fenêtres de transit PARTAGÉES, 20h-23h et
  // 8h-11h), "jamais présent aux deux" NE TIENT PLUS — voir
  // `doc/entity-model.md`/"Chevauchement ASSUMÉ" : le test vérifie donc
  // l'invariant qui RESTE vrai ("jamais absent aux deux") et affirme
  // EXPLICITEMENT le chevauchement aux heures concernées, plutôt que de le
  // laisser accidentellement passer inaperçu.

  function demo1RoutineRules(doorId) {
    return [
      { when: { type: "arrived" }, effects: [{ type: "presence", present: false }] },
      { when: { type: "timeRange", from: 23, to: 8 }, effects: [{ type: "presence", present: false }] },
      {
        when: { type: "timeRange", from: 8, to: 20 },
        effects: [
          { type: "presence", present: true },
          { type: "behavior", behavior: { kind: "wander" } },
        ],
      },
      {
        when: { type: "timeRange", from: 20, to: 23 },
        effects: [
          { type: "presence", present: true },
          { type: "behavior", behavior: { kind: "goto", targetId: doorId } },
        ],
      },
    ];
  }

  function homeRoutineRules(doorId) {
    return [
      { when: { type: "arrived" }, effects: [{ type: "presence", present: false }] },
      { when: { type: "timeRange", from: 11, to: 20 }, effects: [{ type: "presence", present: false }] },
      {
        when: { type: "timeRange", from: 20, to: 8 },
        effects: [
          { type: "presence", present: true },
          { type: "behavior", behavior: null },
        ],
      },
      {
        when: { type: "timeRange", from: 8, to: 11 },
        effects: [
          { type: "presence", present: true },
          { type: "behavior", behavior: { kind: "goto", targetId: doorId } },
        ],
      },
    ];
  }

  // Instantanés RÉALISTES : behavior/gotoArrived hors "arrived" à chaque
  // checkpoint reflètent un état PLAUSIBLE à cette heure (comportement déjà
  // remis à jour par le cycle précédent).
  const mirrorCheckpoints = [
    { hour: 12, awayBehavior: { kind: "wander" }, awayArrived: undefined, homeBehavior: null, homeArrived: true, awayExpected: true, homeExpected: false, label: "12h (jour : away erre, home dormante depuis 11h)" },
    { hour: 21, awayBehavior: { kind: "goto" }, awayArrived: undefined, homeBehavior: null, homeArrived: true, awayExpected: true, homeExpected: true, label: "21h — CHEVAUCHEMENT ASSUMÉ (away en chemin, home déjà réveillée)" },
    { hour: 23, awayBehavior: { kind: "goto" }, awayArrived: undefined, homeBehavior: null, homeArrived: true, awayExpected: false, homeExpected: true, label: "23h (filet away déclenché, MÊME sans arrivée réelle)" },
    { hour: 9, awayBehavior: { kind: "wander" }, awayArrived: true, homeBehavior: { kind: "goto" }, homeArrived: undefined, awayExpected: true, homeExpected: true, label: "9h — CHEVAUCHEMENT ASSUMÉ (away réveillée, home en chemin)" },
    { hour: 11, awayBehavior: { kind: "wander" }, awayArrived: true, homeBehavior: { kind: "goto" }, homeArrived: undefined, awayExpected: true, homeExpected: false, label: "11h (filet home déclenché, MÊME sans arrivée réelle)" },
  ];
  mirrorCheckpoints.forEach(({ hour, awayBehavior, awayArrived, homeBehavior, homeArrived, awayExpected, homeExpected, label }) => {
    const awayInstance = { id: "npc-resident", behavior: awayBehavior, gotoArrived: awayArrived, presence: demo1RoutineRules("door-exit") };
    const homeInstance = { id: "npc-resident-home", behavior: homeBehavior, gotoArrived: homeArrived, presence: homeRoutineRules("door-back") };
    const context = { time: hour * 60 };
    const awayPresent = isPresent(awayInstance, context);
    const homePresent = isPresent(homeInstance, context);
    run(`miroir demo1/demo2 : ${label} — away`, awayExpected, awayPresent);
    run(`miroir demo1/demo2 : ${label} — home`, homeExpected, homePresent);
    run(`miroir demo1/demo2 : ${label} — jamais absent aux deux à la fois`, true, awayPresent || homePresent);
  });

  // --- behavior: null — retrait EXPLICITE d'un comportement (voir
  // core/script-parse.js/parseEffect, doc/scripting.md/"Effets") : nécessaire pour
  // une entité SANS comportement de repos (ex. "npc-resident-home" ci-dessus)
  // — sans lui, entity.gotoArrived (jamais remis à faux) et behavior.kind
  // resté "goto" laisseraient "arrived" bloquée à vrai pour toujours après
  // la PREMIÈRE arrivée, l'entité ne redeviendrait plus jamais présente. ---

  let nullBehaviorEffectAccepted = false;
  let parsedNullBehavior;
  try {
    const nullEffectScene = parseScene(
      {
        id: "movement-check-null-behavior-valid",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "reset-ok",
            type: "dog",
            x: 5,
            presence: [{ when: { type: "timeRange", from: 0, to: 24 }, effects: [{ type: "behavior", behavior: null }] }],
          },
        ],
      },
      ROUTINE_REGISTRY
    );
    nullBehaviorEffectAccepted = true;
    parsedNullBehavior = nullEffectScene.entities[0].presence[0].effects[0].behavior;
  } catch {
    nullBehaviorEffectAccepted = false;
  }
  run("behavior:null — accepté au chargement, aucune erreur", true, nullBehaviorEffectAccepted);
  run("behavior:null — transporté TEL QUEL dans l'entité parsée", null, parsedNullBehavior);

  // Application : resolveEntityRules distingue `undefined` (aucun effet ce
  // tick) de `null` (retrait explicite) — Object.is les sépare, contrairement
  // à un simple test de vérité.
  const nullResetEntity = {
    id: "reset-runtime",
    behavior: { kind: "goto", targetId: "x" },
    gotoArrived: true,
    presence: [{ when: { type: "timeRange", from: 0, to: 24 }, effects: [{ type: "presence", present: true }, { type: "behavior", behavior: null }] }],
  };
  const nullResetResolved = resolveEntityRules(nullResetEntity, { time: 0 });
  run("behavior:null — resolveEntityRules renvoie behaviorEffect === null (jamais confondu avec undefined)", null, nullResetResolved.behaviorEffect);

  // Cycle complet SANS comportement de repos, DEUX jours consécutifs — LE
  // test qui aurait échoué en permanence dès le second réveil sans
  // behavior:null (voir header ci-dessus). Mêmes horaires et gabarit que
  // "npc-resident-home" (scenes/demo2.json).
  function homeResident(state) {
    return getActiveWorld(state).entities.find((e) => e.id === "home-1");
  }
  const homeRoutineScene = parseScene(
    {
      id: "movement-check-home-routine",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "door-h", type: "dog", x: 2 },
        { id: "home-1", type: "dog", x: 15, presence: homeRoutineRules("door-h") },
      ],
    },
    ROUTINE_REGISTRY
  );

  // INITIAL_TIME = 8h : la fenêtre de transit (8h-11h) est donc DÉJÀ active
  // dès la création — comportement "goto" posé au tout premier calcul (voir
  // resolveEntityRules, "premier calcul compte comme une bascule"),
  // convergence vers la porte dès le premier tick, AUCUN comportement de
  // repos déclaré au départ (contrairement à resident-1 plus haut).
  let homeState = createInitialState(homeRoutineScene, 7, NO_COMPANIONS);
  for (let i = 0; i < 1000; i++) homeState = reduce(homeState, tick(0));
  run("routine sans repos (jour 1) : arrivée à la porte -> gotoArrived posé", true, homeResident(homeState).gotoArrived);
  run("routine sans repos (jour 1) : arrivée -> dormante", false, homeResident(homeState).present);

  // 20h (même jour) : SANS behavior:null, cette bascule échouerait pour
  // toujours (behavior.kind resté "goto" + gotoArrived resté vrai depuis
  // l'arrivée du matin ferait gagner "arrived" indéfiniment). Décalage d'UN
  // TICK attendu (~16 ms, imperceptible), même artefact que le réveil de
  // "resident-1" plus haut : l'effet "behavior" s'applique DÈS ce tick
  // (indépendamment de la présence), mais la présence de CE MÊME tick est
  // encore calculée contre l'ancien `.behavior`.
  homeState = advanceTime(homeState, 12 * 60); // 8h -> 20h
  const homeEveningTick1 = reduce(homeState, tick(0));
  run(
    "routine sans repos : 20h, 1er tick — comportement déjà vidé (l'effet s'applique même dormante)",
    null,
    homeResident(homeEveningTick1).behavior
  );
  const homeEveningTick2 = reduce(homeEveningTick1, tick(0));
  run("routine sans repos : 20h, tick suivant — présente à nouveau, JAMAIS bloquée", true, homeResident(homeEveningTick2).present);

  // Jour 2 : le cycle se répète intégralement — nouvelle arrivée, nouvelle
  // dormance, nouveau réveil à 20h. C'est CE second cycle qui aurait échoué
  // silencieusement sans behavior:null (le premier cycle, lui, n'a jamais
  // besoin du retrait : gotoArrived n'est pas encore posé).
  let homeDay2 = advanceTime(homeEveningTick2, 12 * 60); // 20h -> 8h (jour 2)
  for (let i = 0; i < 1000; i++) homeDay2 = reduce(homeDay2, tick(0));
  run("routine sans repos (jour 2) : nouvelle arrivée -> gotoArrived toujours posé", true, homeResident(homeDay2).gotoArrived);
  run("routine sans repos (jour 2) : nouvelle arrivée -> dormante", false, homeResident(homeDay2).present);
  homeDay2 = advanceTime(homeDay2, 12 * 60); // 8h -> 20h (jour 2, soir)
  const homeDay2Tick2 = reduce(reduce(homeDay2, tick(0)), tick(0));
  run("routine sans repos (jour 2) : 20h — présente à nouveau, DEUXIÈME cycle réussi", true, homeResident(homeDay2Tick2).present);

  // Sérialisabilité : ruleActive (mémoire de bascule des effets "behavior")
  // survit à un aller-retour JSON, comme tout autre champ d'entité.
  const serializedResident = JSON.parse(JSON.stringify(resident(eveningRoutineState)));
  run.same(
    "routine : ruleActive survit à un aller-retour JSON",
    resident(eveningRoutineState).ruleActive,
    serializedResident.ruleActive
  );

  // --- "Le bar" : trois PNJ, MÊME règle de départ "vers 6h" à spread,
  // partent de façon ÉCHELONNÉE (voir core/temporal-spread.js,
  // core/presence.js/evaluateTimeRange) — test D'INTÉGRATION (via
  // reduce()/resolveEntityRules(), pas l'évaluateur isolé comme plus haut)
  // qui prouve que le mécanisme fonctionne de bout en bout sur une scène
  // réelle à plusieurs entités partageant un contenu identique.

  const BAR_REGISTRY = { dog: { nameKey: "entity.dog.name" } };

  // Même règle LITTÉRALEMENT partagée (même objet presence[]) par les trois
  // patrons — spread ±5 min autour de 6h, bascule wander -> goto (vers la
  // sortie) à l'entrée de la fenêtre.
  function barPatronPresence() {
    return [
      {
        when: { type: "timeRange", from: 6, to: 6.5, spread: 5 },
        effects: [{ type: "behavior", behavior: { kind: "goto", targetId: "door-bar-exit" } }],
      },
    ];
  }

  const barScene = parseScene(
    {
      id: "movement-check-bar",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "door-bar-exit", type: "dog", x: 18 },
        { id: "npc-bar-a", type: "dog", x: 5, behavior: { kind: "wander", walkMinMs: 1000 * TICK_MS, walkMaxMs: 1000 * TICK_MS }, presence: barPatronPresence() },
        { id: "npc-bar-b", type: "dog", x: 6, behavior: { kind: "wander", walkMinMs: 1000 * TICK_MS, walkMaxMs: 1000 * TICK_MS }, presence: barPatronPresence() },
        { id: "npc-bar-c", type: "dog", x: 7, behavior: { kind: "wander", walkMinMs: 1000 * TICK_MS, walkMaxMs: 1000 * TICK_MS }, presence: barPatronPresence() },
      ],
    },
    BAR_REGISTRY
  );
  const BAR_PATRON_IDS = ["npc-bar-a", "npc-bar-b", "npc-bar-c"];

  function barPatron(state, id) {
    return getActiveWorld(state).entities.find((e) => e.id === id);
  }

  // Avance JUSQU'À une minute-du-jour donnée (toujours vers l'AVANT, jamais
  // en arrière — comme partout ailleurs dans ce fichier), sans dépendre de
  // l'heure de départ exacte d'une partie neuve (INITIAL_TIME).
  function advanceToMinuteOfDay(state, targetMinuteOfDay) {
    const minutesPerDay = TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour;
    const currentMinuteOfDay = hourOfDay(state.time) * TIME_CONFIG.minutesPerHour + minuteOfHour(state.time);
    const delta = ((targetMinuteOfDay - currentMinuteOfDay) % minutesPerDay + minutesPerDay) % minutesPerDay;
    return advanceTime(state, delta);
  }

  // Depuis 5h50 (avant toute fenêtre possible, spread <= 5 min), tique
  // minute par minute et note, pour chaque patron, la minute ÉCOULÉE où son
  // comportement bascule vers "goto" — 20 minutes suffisent à couvrir toute
  // la fourchette possible (5h55 à 6h05) avec marge.
  function runBarDepartures(seed) {
    let state = createInitialState(barScene, seed, NO_COMPANIONS);
    state = advanceToMinuteOfDay(state, 5 * 60 + 50);
    const departureMinute = Object.fromEntries(BAR_PATRON_IDS.map((id) => [id, null]));
    for (let elapsed = 0; elapsed < 20; elapsed++) {
      state = advanceTime(state, 1);
      state = reduce(state, tick(0));
      for (const id of BAR_PATRON_IDS) {
        if (departureMinute[id] === null && barPatron(state, id).behavior.kind === "goto") {
          departureMinute[id] = elapsed;
        }
      }
    }
    return departureMinute;
  }

  const barRun1 = runBarDepartures(2024);
  run("bar : les trois patrons finissent tous par partir (fenêtre observée)", true, Object.values(barRun1).every((minute) => minute !== null));
  run(
    "bar : départs ÉCHELONNÉS — les trois patrons ne partent PAS tous à la même minute",
    true,
    new Set(Object.values(barRun1)).size >= 2
  );

  // Rejeu (même seed, même suite d'actions) -> mêmes minutes de départ pour
  // CHAQUE patron : le décalage ne dépend d'AUCUN état accumulé pendant la
  // simulation (il n'y en a pas à rejouer), seulement de l'id + des bornes
  // de la règle — donc STABLE, y compris à travers un rechargement/une
  // re-visite de scène (mêmes entrées -> même décalage recalculé, jamais
  // relu depuis un état stocké).
  const barRun2 = runBarDepartures(2024);
  run.same("bar : rejeu identique -> mêmes minutes de départ (stable, rien de nouveau sérialisé)", barRun1, barRun2);

  // Sans spread déclaré : les trois partiraient TOUS à la même minute
  // (seuil pile à l'heure déclarée).
  const barSceneNoSpread = parseScene(
    {
      id: "movement-check-bar-no-spread",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "door-bar-exit", type: "dog", x: 18 },
        {
          id: "npc-bar-a",
          type: "dog",
          x: 5,
          behavior: { kind: "wander", walkMinMs: 1000 * TICK_MS, walkMaxMs: 1000 * TICK_MS },
          presence: [{ when: { type: "timeRange", from: 6, to: 6.5 }, effects: [{ type: "behavior", behavior: { kind: "goto", targetId: "door-bar-exit" } }] }],
        },
        {
          id: "npc-bar-b",
          type: "dog",
          x: 6,
          behavior: { kind: "wander", walkMinMs: 1000 * TICK_MS, walkMaxMs: 1000 * TICK_MS },
          presence: [{ when: { type: "timeRange", from: 6, to: 6.5 }, effects: [{ type: "behavior", behavior: { kind: "goto", targetId: "door-bar-exit" } }] }],
        },
      ],
    },
    BAR_REGISTRY
  );
  let noSpreadState = createInitialState(barSceneNoSpread, 2024, NO_COMPANIONS);
  noSpreadState = advanceToMinuteOfDay(noSpreadState, 5 * 60 + 59);
  noSpreadState = advanceTime(noSpreadState, 1);
  noSpreadState = reduce(noSpreadState, tick(0));
  run(
    "bar : sans spread déclaré — tous les patrons partent PILE à la même minute (rétrocompat)",
    "goto",
    barPatron(noSpreadState, "npc-bar-a").behavior.kind
  );
  run(
    "bar : sans spread déclaré — les deux patrons basculent ENSEMBLE",
    barPatron(noSpreadState, "npc-bar-a").behavior.kind,
    barPatron(noSpreadState, "npc-bar-b").behavior.kind
  );
}
