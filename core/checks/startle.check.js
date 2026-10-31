// Vérifications du core — domaine « startle ». Entités farouches
// (core/startle.js) : champ `startle`, fuite à l'approche, effet "startle",
// dormance observée, retour au chargement du monde, isolement des faces,
// déterminisme. Lancées par core/checks/index.js/runChecks (voir ce
// fichier). Pur : aucun DOM, aucun fetch ; chaque scène est construite en
// dur via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, applyEntityActionEffects } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { STATE_EFFECT_TYPES } from "../effects.js";
import { startleRangeOf, returnStartledEntities } from "../startle.js";
import { TUNING_DEFAULTS } from "../../config/tuning-values.js";
import { auditNonSerializable, throws } from "../../lib/check.js";

const STARTLE_REGISTRY = {
  bird: {
    nameKey: "entity.bird.name",
    startle: {},
    action: { kind: "applyEffects", effects: [{ type: "startle" }] },
  },
  crow: { nameKey: "entity.crow.name", startle: { range: 4 } },
  rock: { nameKey: "entity.rock.name", action: { kind: "applyEffects", effects: [{ type: "startle" }] } },
};

function startleScene(entities, overrides = {}) {
  return { id: "startle-check", titleKey: "scene.demo.name", length: 20, playerStart: 1, entities, ...overrides };
}

function entityOf(state, id) {
  return getActiveWorld(state).entities.find((e) => e.id === id);
}

// Avance (vers la droite par défaut) jusqu'à ce que `id` soit marquée, au
// plus `limit` ticks ; rend { state, ticks } (ticks = -1 si jamais marquée).
function tickUntilStartled(state, id, dir = 1, limit = 400) {
  let current = state;
  for (let i = 1; i <= limit; i++) {
    current = reduce(current, tick(dir));
    if (entityOf(current, id).startled) return { state: current, ticks: i };
  }
  return { state: current, ticks: -1 };
}

export default function checkStartle(run) {
  // --- Champ `startle` : cascade, défaut, validation ---
  const parsed = parseScene(
    startleScene([
      { id: "b", type: "bird", x: 8 },
      { id: "b-near", type: "bird", x: 9, startle: { range: 0.5 } },
      { id: "c", type: "crow", x: 10 },
      { id: "r", type: "rock", x: 12 },
    ]),
    STARTLE_REGISTRY
  );
  const byId = (id) => parsed.entities.find((e) => e.id === id);
  run.same("startle : hérité de l'archétype, sans portée -> objet vide", {}, byId("b").startle);
  run("startle : sans portée -> défaut de ressenti", TUNING_DEFAULTS.startleRange, startleRangeOf(byId("b")));
  run("startle : la portée de l'instance remplace l'archétype", 0.5, startleRangeOf(byId("b-near")));
  run("startle : portée de l'archétype", 4, startleRangeOf(byId("c")));
  run("startle : entité non farouche -> champ absent", false, "startle" in byId("r"));
  run("startle : défaut plus grand que la portée d'interaction", true, TUNING_DEFAULTS.startleRange > TUNING_DEFAULTS.interactRange);

  const rejected = (startle) =>
    throws(() => parseScene(startleScene([{ id: "b", type: "rock", x: 5, startle }]), STARTLE_REGISTRY));
  run("startle : portée nulle refusée", true, rejected({ range: 0 }));
  run("startle : portée non numérique refusée", true, rejected({ range: "2" }));
  run("startle : champ inconnu refusé", true, rejected({ distance: 2 }));
  run("startle : booléen refusé (objet attendu)", true, rejected(true));

  // --- Effet d'action "startle" : nature et forme ---
  run("effet startle : effet d'ÉTAT", true, STATE_EFFECT_TYPES.includes("startle"));
  run.same("effet startle : parsé sans champ", [{ type: "startle" }], byId("r").action.effects);
  run(
    "effet startle : champ inconnu refusé",
    true,
    throws(() =>
      parseScene(
        startleScene([{ id: "r", type: "rock", x: 5, action: { kind: "applyEffects", effects: [{ type: "startle", range: 1 }] } }]),
        STARTLE_REGISTRY
      )
    )
  );

  // --- Fuite à l'approche : marquée en fin de tick, dormante au suivant ---
  const approachStart = createInitialState(parseScene(startleScene([{ id: "b", type: "bird", x: 8 }]), STARTLE_REGISTRY), 7);
  const firstTick = reduce(approachStart, tick(0));
  run("approche : loin -> pas marquée", undefined, entityOf(firstTick, "b").startled);
  run("approche : farouche -> présence portée d'un tick à l'autre", true, entityOf(firstTick, "b").present);
  run("approche : farouche sans règle -> aucun ruleActive", false, "ruleActive" in entityOf(firstTick, "b"));

  const reached = tickUntilStartled(firstTick, "b");
  const startledBird = entityOf(reached.state, "b");
  run("approche : le joueur qui avance finit par l'effrayer", true, reached.ticks > 0);
  run(
    "approche : marquée à portée de fuite",
    true,
    Math.abs(startledBird.x - reached.state.player.x) <= TUNING_DEFAULTS.startleRange
  );
  run(
    "approche : marquée AVANT la portée d'interaction",
    true,
    Math.abs(startledBird.x - reached.state.player.x) > TUNING_DEFAULTS.interactRange
  );
  run("approche : encore présente au tick du marquage", true, startledBird.present);
  const exitTick = reduce(reached.state, tick(0));
  run("approche : dormante au tick suivant", false, entityOf(exitTick, "b").present);
  run("approche : bascule \"exited\" observée (son d'envol)", "exited", entityOf(exitTick, "b").presenceChanged);
  const afterExit = reduce(exitTick, tick(0));
  run("approche : bascule vue une seule fois", null, entityOf(afterExit, "b").presenceChanged);
  run("approche : reste dormante", false, entityOf(afterExit, "b").present);

  // Arrivée dans la scène à côté de l'entité : l'envol s'entend quand même.
  const arrivalStart = createInitialState(
    parseScene(startleScene([{ id: "b", type: "bird", x: 2 }]), STARTLE_REGISTRY),
    7
  );
  const arrivalFirst = reduce(arrivalStart, tick(0));
  run("arrivée à portée : marquée dès le premier tick", true, entityOf(arrivalFirst, "b").startled);
  run("arrivée à portée : pas de bascule au premier tick", null, entityOf(arrivalFirst, "b").presenceChanged);
  run("arrivée à portée : \"exited\" au tick suivant", "exited", entityOf(reduce(arrivalFirst, tick(0)), "b").presenceChanged);

  // La distance seule compte : une entité qui vient vers un joueur immobile.
  const comingStart = createInitialState(
    parseScene(
      startleScene([{ id: "b", type: "bird", x: 12, behavior: { kind: "goto", targetId: "player" } }]),
      STARTLE_REGISTRY
    ),
    7
  );
  const coming = tickUntilStartled(comingStart, "b", 0);
  run("approche : l'entité qui vient vers le joueur immobile s'effraie aussi", true, coming.ticks > 0);
  run("approche : le joueur n'a pas bougé", 1, coming.state.player.x);

  // Dormante : plus aucun mouvement.
  let still = reduce(coming.state, tick(0));
  const stillX = entityOf(still, "b").x;
  for (let i = 0; i < 50; i++) still = reduce(still, tick(0));
  run("dormante : ne bouge plus", stillX, entityOf(still, "b").x);

  // Portée propre à l'instance : un oiseau confiant se laisse approcher.
  const tameStart = createInitialState(
    parseScene(startleScene([{ id: "b", type: "bird", x: 8, startle: { range: 0.5 } }]), STARTLE_REGISTRY),
    7
  );
  const tame = tickUntilStartled(tameStart, "b");
  run("portée d'instance : marquée à sa propre portée", true, Math.abs(entityOf(tame.state, "b").x - tame.state.player.x) <= 0.5);

  // Une règle de présence vraie ne la retient pas.
  const ruledStart = createInitialState(
    parseScene(
      startleScene([{ id: "b", type: "bird", x: 2, presence: [{ when: { type: "timeRange", from: 0, to: 0.0001 }, present: false }, { when: { type: "not", condition: { type: "timeRange", from: 0, to: 0.0001 } }, present: true }] }]),
      STARTLE_REGISTRY
    ),
    7
  );
  const ruledFirst = reduce(ruledStart, tick(0));
  run("règles : présente par sa règle au premier tick", true, entityOf(ruledFirst, "b").present);
  run("règles : envolée, dormante malgré sa règle", false, entityOf(reduce(ruledFirst, tick(0)), "b").present);

  // Une entité dormante par ses règles n'est jamais marquée.
  const asleepStart = createInitialState(
    parseScene(
      startleScene([{ id: "b", type: "bird", x: 2, presence: [{ when: { type: "timeRange", from: 0, to: 0.0001 }, present: true }] }]),
      STARTLE_REGISTRY
    ),
    7
  );
  let asleep = asleepStart;
  for (let i = 0; i < 5; i++) asleep = reduce(asleep, tick(0));
  run("dormante par ses règles : jamais marquée", undefined, entityOf(asleep, "b").startled);

  // --- Faces : seule celle du joueur réagit ---
  const twoFaced = createInitialState(
    parseScene(
      {
        id: "startle-check-faces",
        titleKey: "scene.demo.name",
        length: 20,
        playerStart: 1,
        recto: { entities: [] },
        verso: { entities: [{ id: "verso-bird", type: "bird", x: 1 }] },
      },
      STARTLE_REGISTRY
    ),
    7
  );
  let faces = twoFaced;
  for (let i = 0; i < 5; i++) faces = reduce(faces, tick(0));
  run(
    "faces : une entité de l'autre face, à la même position, n'est jamais marquée",
    undefined,
    faces.worlds[faces.activeWorldId].verso.entities[0].startled
  );

  // --- Effet "startle" à l'interaction ---
  const effectStart = createInitialState(
    parseScene(startleScene([{ id: "b", type: "bird", x: 15 }, { id: "r", type: "rock", x: 16 }]), STARTLE_REGISTRY),
    7
  );
  const effectTicked = reduce(effectStart, tick(0));
  const scared = applyEntityActionEffects(effectTicked, "b", entityOf(effectTicked, "b").action.effects);
  run("effet : marque l'entité qui porte l'action", true, entityOf(scared, "b").startled);
  run("effet : n'en touche aucune autre", undefined, entityOf(scared, "r").startled);
  run("effet : déjà envolée -> même session", scared, applyEntityActionEffects(scared, "b", [{ type: "startle" }]));
  const scaredExit = reduce(scared, tick(0));
  run("effet : dormante au tick suivant, bascule observée", "exited", entityOf(scaredExit, "b").presenceChanged);
  const rockScared = reduce(reduce(applyEntityActionEffects(effectTicked, "r", [{ type: "startle" }]), tick(0)), tick(0));
  run("effet : vaut aussi pour une entité non farouche", false, entityOf(rockScared, "r").present);

  // --- Retour au chargement du monde ---
  const back = returnStartledEntities(afterExit);
  const backBird = entityOf(back, "b");
  run("retour : marque retirée", false, "startled" in backBird);
  run("retour : présence mémorisée oubliée", false, "present" in backBird);
  run("retour : bascule oubliée", false, "presenceChanged" in backBird);
  run("retour : rien d'envolé -> même session", firstTick, returnStartledEntities(firstTick));
  const backTicked = reduce(back, tick(0));
  run("retour : présente au tick suivant", true, entityOf(backTicked, "b").present);
  run("retour : aucune bascule \"entered\" fantôme", null, entityOf(backTicked, "b").presenceChanged);
  const rockBack = entityOf(returnStartledEntities(rockScared), "r");
  run("retour : entité non farouche -> forme de sa scène", false, "present" in rockBack || "startled" in rockBack);

  const facesScared = applyEntityActionEffects(twoFaced, "verso-bird", [{ type: "startle" }], "verso");
  const facesBack = returnStartledEntities(facesScared);
  run("retour : les DEUX faces du monde", false, "startled" in facesBack.worlds[facesBack.activeWorldId].verso.entities[0]);

  // Un compagnon effarouché (effet "startle" d'un de ses triggers) revient
  // lui aussi : il suit le joueur, aucun monde ne le ramènerait.
  const scaredCompanion = { ...firstTick, companions: [{ id: "c", type: "dog", x: 1, startled: true, present: false }] };
  const companionBack = returnStartledEntities(scaredCompanion).companions[0];
  run("retour : compagnon effarouché ramené", false, "startled" in companionBack || "present" in companionBack);

  // --- Déterminisme et sérialisabilité ---
  const replay = tickUntilStartled(firstTick, "b");
  run("déterminisme : même suite d'actions -> même tick d'envol", reached.ticks, replay.ticks);
  run.same("déterminisme : même état", reached.state, replay.state);
  const leaks = [];
  auditNonSerializable(afterExit, "startleSession", new Set(), leaks);
  run("sérialisable : aucune fuite", 0, leaks.length);
}
