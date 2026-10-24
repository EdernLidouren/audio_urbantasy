// Vérifications du core — domaine « conditions ». Présence conditionnelle et
// conditions : intégration au réducteur, bascule observée, weather, allOf,
// anyOf, not, variable de scène. Lancées par core/checks/index.js/runChecks (voir ce
// fichier). Pur : aucun DOM, aucun fetch ; chaque scène est construite en dur
// via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import {
  createInitialState,
  getActiveWorld,
  togglePerception,
  applyEntityActionEffects,
  spawnScatteredEphemerals,
  BODY_RADIUS,
} from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { advanceTime } from "../time.js";
import { TIME_CONFIG } from "../../config/time-values.js";
import { evaluateCondition, isPresent, isBlocking, presenceContextOf } from "../presence.js";
import { setWeather } from "../weather.js";
import { auditNonSerializable } from "../../lib/check.js";
import { TICK_MS } from "../../lib/loop.js";
import { WANDER_REGISTRY, UNKNOWN_FIELD, makeWanderScene, expectSceneParseThrows, sceneParseMessage } from "./helpers.js";

export default function checkConditions(run) {
  // Fixtures partagées avec d'autres domaines (voir ./helpers.js).
  const wanderScene = parseScene(makeWanderScene(), WANDER_REGISTRY);

  // --- Présence conditionnelle (core/presence.js) ---
  // Évaluateur générique (un seul type aujourd'hui : "timeRange"), résolution
  // de présence, et intégration dans reduce() — voir entities/types/neon.js
  // pour le cas d'usage réel (présent la nuit).

  // evaluateCondition/timeRange : dans la plage, hors plage, bornes,
  // passage par minuit, intervalle dégénéré, type inconnu.
  run(
    "presence : timeRange dans la plage normale",
    true,
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 10 * 60 })
  );
  run(
    "presence : timeRange hors plage normale",
    false,
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 22 * 60 })
  );
  run(
    "presence : timeRange borne from incluse",
    true,
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 6 * 60 })
  );
  run(
    "presence : timeRange borne to exclue",
    false,
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 20 * 60 })
  );
  run(
    "presence : timeRange passage minuit — 23h dans [20,6[",
    true,
    evaluateCondition({ type: "timeRange", from: 20, to: 6 }, { time: 23 * 60 })
  );
  run(
    "presence : timeRange passage minuit — 2h dans [20,6[",
    true,
    evaluateCondition({ type: "timeRange", from: 20, to: 6 }, { time: 2 * 60 })
  );
  run(
    "presence : timeRange passage minuit — 10h hors [20,6[",
    false,
    evaluateCondition({ type: "timeRange", from: 20, to: 6 }, { time: 10 * 60 })
  );
  run(
    "presence : timeRange from === to -> jamais vraie (intervalle vide)",
    false,
    evaluateCondition({ type: "timeRange", from: 8, to: 8 }, { time: 8 * 60 })
  );
  run(
    "presence : type de condition inconnu -> false (jamais un throw)",
    false,
    evaluateCondition({ type: "doesNotExist" }, { time: 0 })
  );

  // evaluateCondition/timeRange — VARIATION DE SEUIL PAR INSTANCE (cond.spread,
  // core/temporal-spread.js) : chaque entité obtient un seuil légèrement
  // décalé, de façon DÉTERMINISTE (même id + mêmes bornes -> même décalage,
  // toujours) et STABLE (jamais stocké, recalculé à chaque évaluation).

  // Sans context.entity (comme les tests ci-dessus) : spread ignoré, seuil
  // pile sur from/to — même résultat qu'un appel sans spread du tout.
  run(
    "presence : timeRange spread ignoré sans context.entity (rétrocompat)",
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 6 * 60 }),
    evaluateCondition({ type: "timeRange", from: 6, to: 20, spread: 15 }, { time: 6 * 60 })
  );

  // Sans spread déclaré, MÊME avec une entité fournie : comportement
  // rigoureusement inchangé (seuil exact, aucun décalage).
  run(
    "presence : timeRange sans spread déclaré -> seuil exact (rétrocompat)",
    true,
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 6 * 60, entity: { id: "npc-x" } })
  );

  // Deux entités DIFFÉRENTES, même règle à spread -> décalages différents
  // (déterministe par id) : au moins l'une des deux ne bascule pas exactement
  // à la même minute que l'autre sur une fenêtre resserrée autour du seuil.
  function spreadOffsetMinutesFor(entityId, from, to, spread) {
    // Sonde indirecte : cherche, minute par minute autour de `from`, le
    // premier instant où la condition devient vraie pour CETTE entité —
    // reflète fidèlement ce qu'observerait un joueur (déclenchement réel),
    // plutôt que d'importer temporalThresholdOffset directement ici (ce
    // check vérifie le COMPORTEMENT de l'évaluateur, pas l'implémentation).
    for (let deltaMin = -spread - 1; deltaMin <= spread + 1; deltaMin++) {
      const timeAtCandidate = (from * 60 + deltaMin + MINUTES_PER_DAY_CHECK) % MINUTES_PER_DAY_CHECK;
      const active = evaluateCondition(
        { type: "timeRange", from, to, spread },
        { time: timeAtCandidate, entity: { id: entityId } }
      );
      if (active) return deltaMin;
    }
    return null;
  }
  const MINUTES_PER_DAY_CHECK = TIME_CONFIG.minutesPerHour * TIME_CONFIG.hoursPerDay;
  const npcADeparture = spreadOffsetMinutesFor("npc-bar-a", 6, 20, 5);
  const npcBDeparture = spreadOffsetMinutesFor("npc-bar-b", 6, 20, 5);
  const npcCDeparture = spreadOffsetMinutesFor("npc-bar-c", 6, 20, 5);
  run("presence : spread — décalage trouvé dans la fourchette déclarée (±5 min)", true, [npcADeparture, npcBDeparture, npcCDeparture].every((d) => d !== null && Math.abs(d) <= 5));
  run(
    "presence : spread — trois entités de la même règle NE partent PAS toutes à la même minute décalée",
    true,
    new Set([npcADeparture, npcBDeparture, npcCDeparture]).size >= 2
  );

  // Stabilité : rejouer la même sonde pour la même entité renvoie EXACTEMENT
  // le même décalage — reproduit un "rechargement" (aucun état à recharger,
  // le décalage est recalculé, pas relu).
  run(
    "presence : spread — décalage stable pour une même entité (rejoué deux fois)",
    npcADeparture,
    spreadOffsetMinutesFor("npc-bar-a", 6, 20, 5)
  );

  // Décalage indépendant par RÈGLE : la même entité, sur deux règles à bornes
  // différentes, n'obtient pas nécessairement le même décalage relatif.
  const npcADepartureOther = spreadOffsetMinutesFor("npc-bar-a", 12, 18, 5);
  run("presence : spread — bornes fournies (sanity check, valeur dans la fourchette)", true, npcADepartureOther !== null && Math.abs(npcADepartureOther) <= 5);

  // Wrap minuit : seuil déclaré tout près de minuit (from proche de 0),
  // spread suffisant pour pousser le décalage de l'autre côté de 0h — la
  // condition doit rester évaluable sans jamais planter ni se figer à faux
  // pour toute heure, prouvé en balayant les 24h.
  const midnightWrapActive = [];
  for (let h = 0; h < 24; h++) {
    midnightWrapActive.push(
      evaluateCondition({ type: "timeRange", from: 0.05, to: 6, spread: 10 }, { time: h * 60, entity: { id: "npc-midnight" } })
    );
  }
  run("presence : spread — passage minuit du décalage n'empêche jamais une plage active", true, midnightWrapActive.some(Boolean));
  // Contiguïté CIRCULAIRE (l'heure 23 touche l'heure 0) : exactement deux
  // transitions faux<->vrai sur le cercle des 24h -> UN SEUL bloc actif,
  // qu'il traverse minuit ou non — un simple "chaque heure = précédente+1"
  // se tromperait sur un bloc qui traverse minuit (ex. actif à 23h ET 0h,
  // mais 23 !== 0-1 en arithmétique linéaire).
  let midnightTransitions = 0;
  for (let h = 0; h < 24; h++) {
    if (midnightWrapActive[h] !== midnightWrapActive[(h + 1) % 24]) midnightTransitions++;
  }
  run("presence : spread — plage active reste UN SEUL bloc contigu malgré le passage minuit (pas de trou parasite)", 2, midnightTransitions);

  // spread <= 0 ou non fini -> aucun décalage (même filet que "absent").
  run(
    "presence : spread <= 0 -> comportement inchangé",
    evaluateCondition({ type: "timeRange", from: 6, to: 20 }, { time: 6 * 60, entity: { id: "npc-x" } }),
    evaluateCondition({ type: "timeRange", from: 6, to: 20, spread: 0 }, { time: 6 * 60, entity: { id: "npc-x" } })
  );

  // evaluateCondition/consumed (voir core/state.js/markConsumed, "Collectible
  // persistant" dans doc/entity-model.md) : vrai SEULEMENT si l'entité porte
  // consumed:true — contrairement à timeRange/arrived, ne dépend pas de
  // context.time, seulement de context.entity (posé par resolveEntityRules,
  // voir plus bas).
  run(
    "presence : consumed — entité consumed:true -> vrai",
    true,
    evaluateCondition({ type: "consumed" }, { entity: { consumed: true } })
  );
  run(
    "presence : consumed — entité consumed:false -> faux",
    false,
    evaluateCondition({ type: "consumed" }, { entity: { consumed: false } })
  );
  run(
    "presence : consumed — entité sans champ consumed -> faux",
    false,
    evaluateCondition({ type: "consumed" }, { entity: {} })
  );

  // isPresent : sans champ presence -> toujours présente. Avec règles : la première dont `when`
  // est vraie décide ; aucune ne correspond -> DORMANTE par défaut.
  run("presence : isPresent sans presence -> toujours vrai", true, isPresent({ id: "x" }, { time: 0 }));
  const neonLikeEntity = {
    id: "neon-test",
    presence: [{ when: { type: "timeRange", from: 20, to: 6 }, present: true }],
  };
  run("presence : une règle 'présent la nuit' — la nuit -> présente", true, isPresent(neonLikeEntity, { time: 23 * 60 }));
  run(
    "presence : une règle 'présent la nuit' — le jour -> dormante (aucune règle ne matche)",
    false,
    isPresent(neonLikeEntity, { time: 10 * 60 })
  );
  // Asymétrie documentée : UNE règle present:false ne suffit pas à exprimer
  // "présente en dehors" — sans couverture par une règle qui matche,
  // isPresent retombe TOUJOURS sur false (dormante), qu'un rule ait
  // matché avec present:false OU qu'aucun rule n'ait matché du tout.
  const absentByDay = { id: "absent-day-test", presence: [{ when: { type: "timeRange", from: 6, to: 20 }, present: false }] };
  run("presence : règle present:false matchée -> dormante", false, isPresent(absentByDay, { time: 10 * 60 }));
  run(
    "presence : règle present:false NON matchée -> dormante aussi (aucune couverture, pas 'présente par défaut')",
    false,
    isPresent(absentByDay, { time: 23 * 60 })
  );
  // Deux règles complémentaires : couvre les deux cas explicitement.
  const complementaryRules = {
    id: "complementary-test",
    presence: [
      { when: { type: "timeRange", from: 6, to: 20 }, present: false },
      { when: { type: "timeRange", from: 20, to: 6 }, present: true },
    ],
  };
  run("presence : deux règles complémentaires — jour -> dormante", false, isPresent(complementaryRules, { time: 10 * 60 }));
  run("presence : deux règles complémentaires — nuit -> présente", true, isPresent(complementaryRules, { time: 23 * 60 }));

  // "Collectible persistant" (voir doc/entity-model.md) : effet post-activation
  // "devient dormant" — une règle { when: { type: "consumed" }, present:
  // false } sur l'INSTANCE (voir scenes/demo2.json, "crate-warehouse").
  // ATTENTION (même "asymétrie documentée" que ci-dessus) : CETTE SEULE
  // règle ne suffit PAS à rester présente avant consommation — sans règle
  // couvrant explicitement ce cas, isPresent retombe sur dormante par
  // défaut. Il faut donc une SECONDE règle, "présente par défaut" (ici un
  // timeRange 0..24 — couvre TOUTE heure, jamais une vraie contrainte
  // temporelle, juste le catch-all "présente sinon" — même idiome que la
  // règle 8..24 de l'habitant, voir doc/entity-model.md/"Exemple de
  // référence — l'habitant"), placée APRÈS pour ne jamais l'emporter sur
  // la règle "consumed" (priorité au premier rule actif, voir
  // resolveEntityRules). isPresent lit context.entity (ajouté par
  // resolveEntityRules lui-même) — jamais besoin de le passer ici.
  const dormantOnConsumed = {
    id: "crate-test",
    consumed: false,
    presence: [
      { when: { type: "consumed" }, present: false },
      { when: { type: "timeRange", from: 0, to: 24 }, present: true },
    ],
  };
  run("presence : caisse NON consumed — présente (catch-all)", true, isPresent(dormantOnConsumed, { time: 0 }));
  const consumedCrate = { ...dormantOnConsumed, consumed: true };
  run("presence : caisse consumed:true — dormante (priorité à la 1ère règle)", false, isPresent(consumedCrate, { time: 0 }));

  // isBlocking : blocksMovement ET présente -> bloque ; l'un des deux
  // manquant -> jamais.
  run("presence : isBlocking — blocksMovement + présente -> bloque", true, isBlocking({ blocksMovement: true }, { time: 0 }));
  run("presence : isBlocking — blocksMovement absent -> jamais", false, isBlocking({ blocksMovement: false }, { time: 0 }));
  run(
    "presence : isBlocking — blocksMovement + dormante -> ne bloque pas",
    false,
    isBlocking({ blocksMovement: true, ...neonLikeEntity }, { time: 10 * 60 })
  );
  run(
    "presence : isBlocking — blocksMovement + présente (règle matchée) -> bloque",
    true,
    isBlocking({ blocksMovement: true, ...neonLikeEntity }, { time: 23 * 60 })
  );

  // --- Intégration dans reduce() : présence + blocage + comportement ---

  const PRESENCE_REGISTRY = { wall: { nameKey: "entity.wall.name", blocksMovement: true }, dog: { nameKey: "entity.dog.name" } };
  const NIGHT_ONLY = [{ when: { type: "timeRange", from: 20, to: 6 }, present: true }];

  // Entité BLOQUANTE mais dormante le jour (règle "présente la nuit") : le
  // jour, elle ne doit RIEN bloquer ("comme si absente").
  const presenceBlockScene = parseScene(
    {
      id: "movement-check-presence-block",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 0,
      entities: [{ id: "ghost-wall", type: "wall", x: 5, presence: NIGHT_ONLY }],
    },
    PRESENCE_REGISTRY
  );
  let dayBlockState = createInitialState(presenceBlockScene);
  for (let i = 0; i < 300; i++) dayBlockState = reduce(dayBlockState, tick(1));
  run("presence : entité bloquante mais dormante (jour) laisse le joueur passer", true, dayBlockState.player.x > 5 + BODY_RADIUS);
  run("presence : entité bloquante dormante ne signale jamais de blocage", null, dayBlockState.player.blockedBy);

  // La MÊME entité, la nuit (advanceTime jusqu'à 22h) : redevient bloquante.
  let nightBlockState = createInitialState(presenceBlockScene);
  nightBlockState = advanceTime(nightBlockState, 14 * 60); // 8h (INITIAL_TIME) -> 22h
  for (let i = 0; i < 300; i++) nightBlockState = reduce(nightBlockState, tick(1));
  run("presence : entité bloquante présente (nuit) bloque bien le joueur", "ghost-wall", nightBlockState.player.blockedBy);
  run("presence : joueur arrêté au bord du corps bloquant (nuit)", 5 - BODY_RADIUS, nightBlockState.player.x);

  // Entité DORMANTE (jour) avec comportement wander : pas tickée du tout —
  // ni mouvement, ni tirage PRNG.
  const dormantWanderScene = parseScene(
    {
      id: "movement-check-presence-wander",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "ghost-dog", type: "dog", x: 10, behavior: { kind: "wander"}, presence: NIGHT_ONLY },
      ],
    },
    PRESENCE_REGISTRY
  );
  let dormantWanderState = createInitialState(dormantWanderScene, 42);
  const dormantStartX = getActiveWorld(dormantWanderState).entities[0].x;
  for (let i = 0; i < 100; i++) dormantWanderState = reduce(dormantWanderState, tick(0));
  run(
    "presence : entité dormante (jour) ne bouge jamais (comportement jamais tické)",
    dormantStartX,
    getActiveWorld(dormantWanderState).entities[0].x
  );
  run(
    "presence : entité dormante porte le drapeau present:false dans l'état",
    false,
    getActiveWorld(dormantWanderState).entities[0].present
  );

  // PRNG non consommé pour une entité dormante : rngState après N ticks
  // avec UNE SEULE entité dormante doit être IDENTIQUE à celui d'un monde
  // SANS AUCUNE entité — comparaison exacte, sans dépendre de la mécanique
  // interne du PRNG.
  const emptyPresenceScene = parseScene(
    { id: "movement-check-presence-empty", titleKey: "scene.demo.name", length: 20, playerStart: 0, entities: [] },
    PRESENCE_REGISTRY
  );
  let emptyPresenceState = createInitialState(emptyPresenceScene, 42);
  for (let i = 0; i < 100; i++) emptyPresenceState = reduce(emptyPresenceState, tick(0));
  run(
    "presence : entité dormante ne consomme aucun tirage PRNG (rngState = monde vide)",
    emptyPresenceState.worlds[emptyPresenceScene.id].rngState,
    dormantWanderState.worlds[dormantWanderScene.id].rngState
  );

  // La MÊME entité, la nuit : présente ET réellement tickée (comportement
  // actif, position qui évolue).
  let awakeWanderState = createInitialState(dormantWanderScene, 42);
  awakeWanderState = advanceTime(awakeWanderState, 14 * 60); // -> nuit
  for (let i = 0; i < 100; i++) awakeWanderState = reduce(awakeWanderState, tick(0));
  run("presence : entité présente (nuit) porte present:true", true, getActiveWorld(awakeWanderState).entities[0].present);
  run(
    "presence : entité présente (nuit) bouge réellement (comportement tické)",
    true,
    getActiveWorld(awakeWanderState).entities[0].x !== dormantStartX
  );

  // Entité SANS règle de présence : jamais de champ .present ajouté à son
  // état (réutilise
  // wanderScene, fixture partagée de ./helpers.js, sans presence).
  const noPresenceState = reduce(createInitialState(wanderScene, 42), tick(0));
  run(
    "presence : entité SANS règle ne porte jamais de champ .present",
    undefined,
    getActiveWorld(noPresenceState).entities[0].present
  );

  // --- Bascule de présence OBSERVÉE (presenceChanged) ---
  // Formulation générique (liée à la CONDITION, pas au rouage de dormance —
  // voir core/reduce.js/stepEntities) : "entered"/"exited"/null, jamais de
  // bascule fantôme au tout premier calcul pour une entité.

  const transitionScene = parseScene(
    {
      id: "movement-check-presence-transition",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 0,
      entities: [{ id: "flicker", type: "dog", x: 5, presence: NIGHT_ONLY }],
    },
    PRESENCE_REGISTRY
  );

  // Jour (état de départ) : premier calcul JAMAIS fait pour cette entité ->
  // AUCUNE bascule, quelle que soit la valeur de présence de départ —
  // même dormante dès ce premier calcul, ce n'est pas "une sortie".
  let transitionState = createInitialState(transitionScene);
  transitionState = reduce(transitionState, tick(0));
  run(
    "presence : aucune bascule au tout premier calcul (montage), même dormante",
    null,
    getActiveWorld(transitionState).entities[0].presenceChanged
  );
  run("presence : présence de départ (jour) correctement dormante", false, getActiveWorld(transitionState).entities[0].present);

  // Un tick de plus, TOUJOURS jour : rien ne change -> pas de bascule.
  transitionState = reduce(transitionState, tick(0));
  run(
    "presence : aucune bascule tant que la présence ne change pas (jour -> jour)",
    null,
    getActiveWorld(transitionState).entities[0].presenceChanged
  );

  // Bascule vers la nuit : le tick qui suit le changement d'heure observe
  // dormante -> présente -> "entered".
  transitionState = advanceTime(transitionState, 14 * 60); // 8h -> 22h (nuit)
  transitionState = reduce(transitionState, tick(0));
  run(
    'presence : bascule dormante -> présente détectée ("entered")',
    "entered",
    getActiveWorld(transitionState).entities[0].presenceChanged
  );
  run("presence : présente après la bascule", true, getActiveWorld(transitionState).entities[0].present);

  // Tick de plus, toujours nuit : plus de bascule (déjà présente).
  transitionState = reduce(transitionState, tick(0));
  run(
    "presence : aucune bascule tant que la présence ne change pas (nuit -> nuit)",
    null,
    getActiveWorld(transitionState).entities[0].presenceChanged
  );

  // Retour au jour : présente -> dormante -> "exited".
  transitionState = advanceTime(transitionState, 12 * 60); // 22h -> 10h le lendemain (jour)
  transitionState = reduce(transitionState, tick(0));
  run(
    'presence : bascule présente -> dormante détectée ("exited")',
    "exited",
    getActiveWorld(transitionState).entities[0].presenceChanged
  );
  run("presence : dormante après la bascule", false, getActiveWorld(transitionState).entities[0].present);

  // Une valeur de bascule NON NULLE (pas seulement null) survit elle aussi
  // à un aller-retour JSON — transitionState porte "exited" à cet instant.
  const transitionRoundTrip = JSON.parse(JSON.stringify(transitionState));
  run.same(
    "presence : presenceChanged non nul survit à un aller-retour JSON",
    transitionState,
    transitionRoundTrip
  );

  // Entité SANS règle de présence : jamais de champ .presenceChanged non plus.
  run(
    "presence : entité SANS règle ne porte jamais de champ .presenceChanged",
    undefined,
    getActiveWorld(noPresenceState).entities[0].presenceChanged
  );

  // Sérialisation : une session avec des règles de présence actives
  // survit à un aller-retour JSON, sans fuite de non-sérialisable
  // (auditNonSerializable, voir lib/check.js).
  const presenceRoundTrip = JSON.parse(JSON.stringify(dormantWanderState));
  run.same(
    "presence : session avec règles de présence survit à un aller-retour JSON",
    dormantWanderState,
    presenceRoundTrip
  );
  const presenceLeaks = [];
  auditNonSerializable(dormantWanderState, "presenceSession", new Set(), presenceLeaks);
  run("presence : aucune fuite de non-sérialisable avec des règles de présence actives", 0, presenceLeaks.length);

  // --- Condition "weather" (core/presence.js/evaluateWeather) : réutilise l'évaluateur de conditions
  // existant, un cas de plus à côté de timeRange/perceptionActive.
  run("weather (condition) : evaluateCondition — état courant == état demandé -> vraie", true, evaluateCondition({ type: "weather", state: "fog" }, { weather: "fog" }));
  run("weather (condition) : evaluateCondition — état courant != état demandé -> fausse", false, evaluateCondition({ type: "weather", state: "fog" }, { weather: "clear" }));
  run("weather (condition) : evaluateCondition — champ absent du contexte -> fausse", false, evaluateCondition({ type: "weather", state: "fog" }, {}));
  run(
    "weather (condition) : evaluateCondition — ni state déclaré ni weather au contexte -> fausse (jamais undefined==undefined)",
    false,
    evaluateCondition({ type: "weather" }, {})
  );

  // Validation au chargement (core/script-parse.js/validateCondition) : un état
  // référencé par la condition doit exister dans la VRAIE table météo —
  // même politique que hasEquipmentTag.tag contre TAG_REGISTRY.
  const WEATHER_COND_REGISTRY = {
    wolf: { nameKey: "entity.cumulo_lupus.name", presence: [{ when: { type: "weather", state: "fog" }, present: true }] },
  };
  const weatherCondSceneRaw = () => ({
    id: "movement-check-weather-condition",
    titleKey: "scene.demo.name",
    length: 20,
    playerStart: 0,
    entities: [{ id: "wolf-1", type: "wolf", x: 10, behavior: { kind: "wander", walkMinMs: 1000 * TICK_MS, walkMaxMs: 1000 * TICK_MS } }],
  });
  run(
    "weather (condition) : état inexistant dans la table météo -> erreur claire au chargement",
    true,
    expectSceneParseThrows(
      {
        id: "movement-check-weather-condition-bad",
        titleKey: "scene.demo.name",
        length: 20,
        playerStart: 0,
        entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when: { type: "weather", state: "doesNotExist" }, present: true }] }],
      },
      { wolf: { nameKey: "entity.cumulo_lupus.name" } }
    )
  );
  run("weather (condition) : état valide -> chargement accepté", false, expectSceneParseThrows(weatherCondSceneRaw(), WEATHER_COND_REGISTRY));

  // Intégration : une entité (même patron que entities/types/cumulo-lupus.js)
  // dont la présence est conditionnée par weather=="fog" est DORMANTE tant
  // que la météo n'est pas la brume, PRÉSENTE dès que session.weather.state
  // devient "fog" — via LE MÊME presenceContext que time/perceptionActive
  // (core/reduce.js/TICK), forcée par core/weather.js/setWeather (comme le
  // menu debug le ferait), aucun mécanisme séparé.
  const weatherCondScene = parseScene(weatherCondSceneRaw(), WEATHER_COND_REGISTRY);
  function wolf(state) {
    return getActiveWorld(state).entities.find((e) => e.id === "wolf-1");
  }
  let notFoggyState = createInitialState(weatherCondScene, "weather-cond-check");
  notFoggyState = setWeather(notFoggyState, "clear");
  notFoggyState = reduce(notFoggyState, tick(0));
  run("weather (condition) : entité conditionnée — dormante hors de l'état déclaré", false, wolf(notFoggyState).present);

  let foggyState = setWeather(notFoggyState, "fog");
  foggyState = reduce(foggyState, tick(0));
  run("weather (condition) : entité conditionnée — présente dès que l'état météo correspond", true, wolf(foggyState).present);

  let notFoggyAgainState = setWeather(foggyState, "cloudy");
  notFoggyAgainState = reduce(notFoggyAgainState, tick(0));
  run("weather (condition) : redevient dormante quand la météo change à nouveau", false, wolf(notFoggyAgainState).present);

  // --- Condition "allOf" (core/presence.js/evaluateAllOf) : composite, ET
  // logique entre plusieurs conditions — délègue à evaluateCondition pour
  // chaque sous-condition, jamais un second mécanisme.
  run(
    "allOf : les deux sous-conditions vraies -> vraie",
    true,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, { perceptionActive: true, weather: "fog" })
  );
  run(
    "allOf : une seule sous-condition vraie (perception) -> fausse",
    false,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, { perceptionActive: true, weather: "clear" })
  );
  run(
    "allOf : une seule sous-condition vraie (météo) -> fausse",
    false,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, { perceptionActive: false, weather: "fog" })
  );
  run(
    "allOf : aucune sous-condition vraie -> fausse",
    false,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, { perceptionActive: false, weather: "clear" })
  );
  // Cas limite : "conditions" à un SEUL élément — redondant (revient à la
  // sous-condition seule) mais légal, voir core/script-parse.js/validateCondition
  // (rejette seulement un tableau VIDE, pas un tableau à un élément).
  run(
    "allOf : une seule sous-condition, vraie -> vraie",
    true,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }] }, { perceptionActive: true })
  );
  run(
    "allOf : une seule sous-condition, fausse -> fausse",
    false,
    evaluateCondition({ type: "allOf", conditions: [{ type: "perceptionActive" }] }, { perceptionActive: false })
  );
  run(
    "allOf : imbriqué (allOf dans allOf) — toutes vraies -> vraie",
    true,
    evaluateCondition(
      { type: "allOf", conditions: [{ type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, { type: "consumed" }] },
      { perceptionActive: true, weather: "fog", entity: { consumed: true } }
    )
  );

  // Validation au chargement (core/script-parse.js/validateCondition) :
  // "conditions" doit être un tableau NON VIDE, chaque élément revalidé
  // RÉCURSIVEMENT — une sous-condition mal formée échoue exactement comme
  // au premier niveau.
  run(
    "allOf : conditions vide -> erreur claire au chargement",
    true,
    expectSceneParseThrows(
      { id: "movement-check-allof-empty", titleKey: "scene.demo.name", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when: { type: "allOf", conditions: [] }, present: true }] }] },
      { wolf: { nameKey: "entity.cumulo_lupus.name" } }
    )
  );
  run(
    "allOf : conditions absent (pas un tableau) -> erreur claire au chargement",
    true,
    expectSceneParseThrows(
      { id: "movement-check-allof-missing", titleKey: "scene.demo.name", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when: { type: "allOf" }, present: true }] }] },
      { wolf: { nameKey: "entity.cumulo_lupus.name" } }
    )
  );
  run(
    "allOf : conditions à un seul élément -> légal au chargement (pas d'erreur)",
    false,
    expectSceneParseThrows(
      { id: "movement-check-allof-single", titleKey: "scene.demo.name", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when: { type: "allOf", conditions: [{ type: "perceptionActive" }] }, present: true }] }] },
      { wolf: { nameKey: "entity.cumulo_lupus.name" } }
    )
  );
  run(
    "allOf : sous-condition mal formée (état météo inconnu) -> erreur claire au chargement, RÉCURSIVE",
    true,
    expectSceneParseThrows(
      {
        id: "movement-check-allof-bad-sub",
        titleKey: "scene.demo.name",
        length: 20,
        playerStart: 0,
        entities: [
          {
            id: "wolf-1",
            type: "wolf",
            x: 10,
            presence: [{ when: { type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "doesNotExist" }] }, present: true }],
          },
        ],
      },
      { wolf: { nameKey: "entity.cumulo_lupus.name" } }
    )
  );

  // Intégration : même patron que cumulo-lupus (entities/types/
  // cumulo-lupus.js) — présent SEULEMENT perception ACTIVE ET météo
  // BRUMEUSE, les QUATRE combinaisons vérifiées via reduce(), aucun
  // mécanisme séparé du reste de la présence conditionnelle.
  const ALLOF_REGISTRY = {
    wolf: {
      nameKey: "entity.cumulo_lupus.name",
      presence: [{ when: { type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }, present: true }],
    },
  };
  const allOfScene = parseScene(
    { id: "movement-check-allof-integration", titleKey: "scene.demo.name", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, behavior: { kind: "wander", walkMinMs: 1000 * TICK_MS, walkMaxMs: 1000 * TICK_MS } }] },
    ALLOF_REGISTRY
  );
  function allOfWolf(state) {
    return getActiveWorld(state).entities.find((e) => e.id === "wolf-1");
  }
  let neitherState = createInitialState(allOfScene, "allof-cond-check");
  neitherState = setWeather(neitherState, "clear");
  neitherState = reduce(neitherState, tick(0));
  run("allOf (intégration) : ni perception ni brume -> dormante", false, allOfWolf(neitherState).present);

  let perceptionOnlyState = togglePerception(neitherState);
  perceptionOnlyState = reduce(perceptionOnlyState, tick(0));
  run("allOf (intégration) : perception SEULE (pas de brume) -> dormante", false, allOfWolf(perceptionOnlyState).present);

  let fogOnlyState = setWeather(neitherState, "fog");
  fogOnlyState = reduce(fogOnlyState, tick(0));
  run("allOf (intégration) : brume SEULE (perception inactive) -> dormante", false, allOfWolf(fogOnlyState).present);

  let bothState = togglePerception(fogOnlyState);
  bothState = reduce(bothState, tick(0));
  run("allOf (intégration) : perception ACTIVE ET brume -> présente", true, allOfWolf(bothState).present);

  let bothThenOffState = togglePerception(bothState);
  bothThenOffState = reduce(bothThenOffState, tick(0));
  run("allOf (intégration) : perception redevient inactive -> redevient dormante", false, allOfWolf(bothThenOffState).present);

  // --- Condition "anyOf" (core/presence.js/evaluateAnyOf) : composite, OU
  // logique — cas réel : la bouche d'égout qui ne coule que par temps
  // pluvieux (pluie OU orage, entities/types/storm_drain.js).
  const RAINY = { type: "anyOf", conditions: [{ type: "weather", state: "rain" }, { type: "weather", state: "stormy" }] };
  run("anyOf : première sous-condition vraie -> vraie", true, evaluateCondition(RAINY, { weather: "rain" }));
  run("anyOf : seconde sous-condition vraie -> vraie", true, evaluateCondition(RAINY, { weather: "stormy" }));
  run("anyOf : aucune sous-condition vraie -> fausse", false, evaluateCondition(RAINY, { weather: "clear" }));
  run(
    "anyOf : imbriqué (allOf dans anyOf) -> délègue au même évaluateur",
    true,
    evaluateCondition(
      { type: "anyOf", conditions: [{ type: "consumed" }, { type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }] },
      { perceptionActive: true, weather: "fog", entity: {} }
    )
  );
  run(
    "anyOf : conditions vide -> erreur claire au chargement",
    true,
    expectSceneParseThrows(
      { id: "movement-check-anyof-empty", titleKey: "scene.demo.name", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when: { type: "anyOf", conditions: [] }, present: true }] }] },
      { wolf: { nameKey: "entity.cumulo_lupus.name" } }
    )
  );
  run(
    "anyOf : sous-condition mal formée (état météo inconnu) -> erreur claire au chargement, RÉCURSIVE",
    true,
    expectSceneParseThrows(
      { id: "movement-check-anyof-bad-sub", titleKey: "scene.demo.name", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when: { type: "anyOf", conditions: [{ type: "weather", state: "rain" }, { type: "weather", state: "drizzle" }] }, present: true }] }] },
      { wolf: { nameKey: "entity.cumulo_lupus.name" } }
    )
  );
  run(
    "anyOf : sous-condition valide -> légal au chargement (pas d'erreur)",
    false,
    expectSceneParseThrows(
      { id: "movement-check-anyof-ok", titleKey: "scene.demo.name", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when: RAINY, present: true }] }] },
      { wolf: { nameKey: "entity.cumulo_lupus.name" } }
    )
  );

  // --- Condition "not" (core/presence.js/evaluateNot) : négation, composable ---
  const NOT_PERCEPTION = { type: "not", condition: { type: "perceptionActive" } };
  run("not : perception inactive -> vraie", true, evaluateCondition(NOT_PERCEPTION, { perceptionActive: false }));
  run("not : perception active -> fausse", false, evaluateCondition(NOT_PERCEPTION, { perceptionActive: true }));
  run("not : contexte sans perception -> vraie (sous-condition fausse par repli)", true, evaluateCondition(NOT_PERCEPTION, {}));
  run("not : double négation = la condition d'origine", true, evaluateCondition({ type: "not", condition: NOT_PERCEPTION }, { perceptionActive: true }));
  const NOT_FOGGY_PERCEPTION = { type: "not", condition: { type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] } };
  run("not(allOf) : perception ET brume -> fausse", false, evaluateCondition(NOT_FOGGY_PERCEPTION, { perceptionActive: true, weather: "fog" }));
  run("not(allOf) : perception seule -> vraie", true, evaluateCondition(NOT_FOGGY_PERCEPTION, { perceptionActive: true, weather: "clear" }));
  const FOG_WITHOUT_PERCEPTION = { type: "allOf", conditions: [NOT_PERCEPTION, { type: "weather", state: "fog" }] };
  run("allOf(not) : brume hors perception -> vraie", true, evaluateCondition(FOG_WITHOUT_PERCEPTION, { perceptionActive: false, weather: "fog" }));
  run("allOf(not) : brume EN perception -> fausse", false, evaluateCondition(FOG_WITHOUT_PERCEPTION, { perceptionActive: true, weather: "fog" }));

  const NOT_REGISTRY = { wolf: { nameKey: "entity.cumulo_lupus.name" } };
  const notScene = (when) => ({ id: "movement-check-not", titleKey: "scene.demo.name", length: 20, playerStart: 0, entities: [{ id: "wolf-1", type: "wolf", x: 10, presence: [{ when, present: true }] }] });
  run("not : forme valide -> chargée", false, expectSceneParseThrows(notScene(NOT_PERCEPTION), NOT_REGISTRY));
  run("not : sous-condition absente -> erreur claire au chargement", true, expectSceneParseThrows(notScene({ type: "not" }), NOT_REGISTRY));
  run("not : sous-condition en tableau -> erreur claire au chargement", true, expectSceneParseThrows(notScene({ type: "not", condition: [{ type: "perceptionActive" }] }), NOT_REGISTRY));
  run("not : sous-condition mal formée -> erreur RÉCURSIVE", true, expectSceneParseThrows(notScene({ type: "not", condition: { type: "weather", state: "doesNotExist" } }), NOT_REGISTRY));
  run("not dans allOf, sous-condition mal formée -> erreur RÉCURSIVE", true, expectSceneParseThrows(notScene({ type: "allOf", conditions: [{ type: "not", condition: { type: "nope" } }] }), NOT_REGISTRY));
  run("allOf dans not -> chargé", false, expectSceneParseThrows(notScene(NOT_FOGGY_PERCEPTION), NOT_REGISTRY));

  // Intégration : deux entités superposées, l'une présente HORS perception,
  // l'autre EN perception — jamais les deux, jamais aucune.
  const SWAP_REGISTRY = {
    plainMirror: { nameKey: "mirror.default.name", presence: [{ when: NOT_PERCEPTION, present: true }] },
    magicMirror: { nameKey: "magic_mirror.default.name", presence: [{ when: { type: "perceptionActive" }, present: true }] },
  };
  const swapScene = parseScene(
    { id: "movement-check-not-swap", titleKey: "scene.demo.name", length: 20, playerStart: 5, entities: [{ id: "plain", type: "plainMirror", x: 0 }, { id: "magic", type: "magicMirror", x: 0 }] },
    SWAP_REGISTRY
  );
  const swapPresence = (state) => getActiveWorld(state).entities.map((e) => `${e.id}:${e.present}`).join(",");
  let swapState = reduce(createInitialState(swapScene, "not-swap"), tick(0));
  run("not (intégration) : perception inactive -> ordinaire seul", "plain:true,magic:false", swapPresence(swapState));
  swapState = reduce(togglePerception(swapState), tick(0));
  run("not (intégration) : perception active -> magique seul", "plain:false,magic:true", swapPresence(swapState));
  swapState = reduce(togglePerception(swapState), tick(0));
  run("not (intégration) : perception redevient inactive -> ordinaire seul", "plain:true,magic:false", swapPresence(swapState));

  // --- Présence pilotée par une variable de SCÈNE (presenceContextOf) :
  // le cas "projection / porte cachée" — deux entités en alternance sur une
  // variable que le projecteur écrit. presenceContextOf est le contexte
  // partagé par le TICK et la vue (montage de la scène audio) : sans le
  // monde, la condition vaudrait toujours faux et la vue couperait à tort
  // le beacon d'une entité présente. ---
  const PROJECTOR_ON = (equals) => ({ type: "variable", scope: "scene", name: "projectorOn", equals });
  const SCENE_PRESENCE_REGISTRY = {
    projection: { nameKey: "entity.video_projection.name" },
    door: { nameKey: "door.default.name", interactable: true },
    switcher: { nameKey: "entity.video_projector.name" },
  };
  const scenePresenceScene = parseScene(
    {
      id: "movement-check-scene-presence",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      variables: [{ name: "projectorOn", type: "flag", initial: true }],
      entities: [
        { id: "projection", type: "projection", x: 5, presence: [{ when: PROJECTOR_ON(true), present: true }] },
        { id: "hidden-door", type: "door", x: 5, presence: [{ when: PROJECTOR_ON(false), present: true }] },
        { id: "switcher", type: "switcher", x: 9 },
      ],
    },
    SCENE_PRESENCE_REGISTRY
  );
  let scenePresenceState = createInitialState(scenePresenceScene, "scene-presence");
  const presentAtMount = (state) =>
    getActiveWorld(state).entities.filter((e) => e.presence).map((e) => `${e.id}:${isPresent(e, presenceContextOf(state))}`).join(",");
  run("variable de scène : présence au montage (contexte partagé)", "projection:true,hidden-door:false", presentAtMount(scenePresenceState));
  run(
    "variable de scène : sans le monde, la condition vaudrait faux (le bug évité)",
    false,
    isPresent(getActiveWorld(scenePresenceState).entities[0], { time: scenePresenceState.time, perceptionActive: false, weather: "clear" })
  );
  scenePresenceState = reduce(scenePresenceState, tick(0));
  run("variable de scène : après un tick -> projection seule", "projection:true,hidden-door:false", swapPresence(scenePresenceState).replace(",switcher:undefined", ""));
  scenePresenceState = applyEntityActionEffects(scenePresenceState, "switcher", [{ type: "setVariable", scope: "scene", name: "projectorOn", value: false }]);
  scenePresenceState = reduce(scenePresenceState, tick(0));
  run("variable de scène : projecteur éteint -> porte seule", "projection:false,hidden-door:true", swapPresence(scenePresenceState).replace(",switcher:undefined", ""));
  run(
    "variable de scène : bascule observée des deux côtés",
    "exited,entered",
    getActiveWorld(scenePresenceState).entities.filter((e) => e.presence).map((e) => e.presenceChanged).join(",")
  );

  // --- timeRange : validé au chargement (core/script-parse.js/
  // validateCondition) ---
  const timeRangeScene = (when) => ({
    id: "movement-check-time-range",
    titleKey: "scene.demo.name",
    length: 10,
    playerStart: 0,
    entities: [{ id: "lamp", type: "dog", x: 5, presence: [{ when, present: true }] }],
  });
  const TIME_RANGE_REGISTRY = { dog: { nameKey: "entity.dog.name" } };
  const timeRangeThrows = (when) => expectSceneParseThrows(timeRangeScene({ type: "timeRange", ...when }), TIME_RANGE_REGISTRY);
  run("timeRange : from en chaîne -> erreur au chargement", true, timeRangeThrows({ from: "20", to: 6 }));
  run("timeRange : to absent -> erreur au chargement", true, timeRangeThrows({ from: 20 }));
  run("timeRange : heure hors [0, 24] -> erreur au chargement", true, timeRangeThrows({ from: 20, to: 25 }));
  run("timeRange : from === to (plage vide) -> erreur au chargement", true, timeRangeThrows({ from: 8, to: 8 }));
  run("timeRange : spread négatif -> erreur au chargement", true, timeRangeThrows({ from: 6, to: 7, spread: -5 }));
  run(
    "timeRange : formes valides (passage minuit, 0..24, heure fractionnaire, spread) -> acceptées",
    "false,false,false,false",
    [{ from: 20, to: 6 }, { from: 0, to: 24 }, { from: 6, to: 6.5 }, { from: 6, to: 7, spread: 5 }].map((when) => timeRangeThrows(when)).join(",")
  );

  // --- Placement au sol : la présence d'un obstacle est évaluée dans le
  // contexte COMPLET de la partie (core/presence.js/presenceContextOf) ---
  // Un mur présent seulement sous perception : perception active, il
  // bloque, et l'éparpillement l'évite.
  const perceptionWallScene = parseScene(
    {
      id: "movement-check-perception-wall",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        {
          id: "spirit-wall",
          type: "dog",
          x: 10,
          blocksMovement: true,
          presence: [{ when: { type: "perceptionActive" }, present: true }, { when: { type: "not", condition: { type: "perceptionActive" } }, present: false }],
        },
      ],
    },
    TIME_RANGE_REGISTRY
  );
  const perceptionWallState = togglePerception(createInitialState(perceptionWallScene, 5));
  run("placement : le mur est bien bloquant sous perception", true, isBlocking(getActiveWorld(perceptionWallState).entities[0], presenceContextOf(perceptionWallState)));
  const SCATTER_DOG = { type: "dog", labelKey: "entity.dog.name", interactable: true, action: { kind: "pickup", amount: 1 } };
  const scattered = getActiveWorld(spawnScatteredEphemerals(perceptionWallState, SCATTER_DOG, 10, 12, 3))
    .entities.filter((e) => e.ephemeral)
    .map((e) => e.x);
  run(
    "placement : éparpillement -> aucune position dans un mur présent sous perception",
    true,
    // sourceX (10) est le repli ultime, toujours accepté (voir
    // drawScatteredPosition) : seules les autres positions comptent.
    scattered.some((x) => x !== 10) && scattered.filter((x) => x !== 10).every((x) => Math.abs(x - 10) >= BODY_RADIUS)
  );

  // --- Champs inconnus : conditions et règles (voir CONDITION_EVALUATORS,
  // `fields`) — rejetés POUR leur champ, jamais pour une autre erreur. ---
  const ruleScene = (rule) =>
    makeWanderScene({ entities: [{ id: "wander-1", type: "dog", x: 5, variables: [{ name: "n", type: "int", initial: 0 }], presence: [rule] }] });
  const ruleMessage = (rule) => sceneParseMessage(ruleScene(rule), WANDER_REGISTRY);
  run("champs inconnus : règle de référence acceptée", "accepté", ruleMessage({ when: { type: "timeRange", from: 8, to: 20, spread: 30 }, present: true }));
  run("champs inconnus : timeRange (spred)", true, ruleMessage({ when: { type: "timeRange", from: 8, to: 20, spred: 30 }, present: true }).includes(UNKNOWN_FIELD));
  run("champs inconnus : condition sans champ propre (arrived + target)", true, ruleMessage({ when: { type: "arrived", target: "door" }, present: false }).includes(UNKNOWN_FIELD));
  run(
    "champs inconnus : variable (comparateur mal orthographié)",
    true,
    ruleMessage({ when: { type: "variable", scope: "entity", name: "n", equals: 1, greaterThen: 2 }, present: true }).includes(UNKNOWN_FIELD)
  );
  run(
    "champs inconnus : sous-condition d'un allOf",
    true,
    ruleMessage({ when: { type: "allOf", conditions: [{ type: "consumed", value: true }] }, present: false }).includes(UNKNOWN_FIELD)
  );
  run(
    "champs inconnus : règle (efects)",
    'parseScene: entities[0] ("wander-1") : presence[0] : champ(s) inconnu(s) "efects".',
    ruleMessage({ when: { type: "consumed" }, present: false, efects: [] })
  );
  run(
    "champs inconnus : effet de règle (presence + value)",
    true,
    ruleMessage({ when: { type: "consumed" }, effects: [{ type: "presence", present: false, value: 1 }] }).includes(UNKNOWN_FIELD)
  );
}
