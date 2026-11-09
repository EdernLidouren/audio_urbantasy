// Vérifications du core — domaine « marbles-bus ». Le bus d'évènements du jeu
// des billes (core/marbles-bus.js) : file premier entré, premier sorti, aucune
// récursion, limite de sécurité ; l'ordre fixe des écouteurs et le refus propre
// du réducteur. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-bus`).

import { throws } from "../../lib/check.js";
import { MAX_EVENTS_PER_ACTION, MarbleEventLimitError, createEventBus } from "../marbles-bus.js";
import { createMarblesGame, marbleListeners, marblesReduce } from "../marbles.js";
import MARBLE_TYPES from "../../marbles/types/index.js";
import { createMarblesRules } from "../marbles-rules.js";

// Les règles du jeu, liées à la vraie table (core/marbles-rules.js).
const rules = createMarblesRules(MARBLE_TYPES);

export default function checkMarblesBus(run) {
  // File : un évènement émis pendant un traitement attend son tour.
  const order = [];
  let depth = 0;
  let deepest = 0;
  const chained = createEventBus((event) => {
    depth += 1;
    deepest = Math.max(deepest, depth);
    order.push(event);
    if (event === "a") {
      chained.emit("b");
      chained.emit("c");
    }
    if (event === "b") chained.emit("d");
    depth -= 1;
  });
  chained.emit("a");
  run.same("bus : premier entré, premier sorti", ["a", "b", "c", "d"], order);
  run("bus : aucune récursion", 1, deepest);

  // Synchrone : tout est traité quand emit rend la main, et le bus resservira.
  chained.emit("c");
  run("bus : synchrone, et réutilisable", "c", order.at(-1));

  // Limite de sécurité : une boucle lève, avec une erreur qui se comprend.
  let caught = null;
  const looping = createEventBus((event) => looping.emit(event), 10);
  try {
    looping.emit("tour");
  } catch (error) {
    caught = error;
  }
  run("limite : une boucle lève", true, caught instanceof MarbleEventLimitError);
  run("limite : le message dit la limite et la boucle", true, /10 évènements.*boucle/.test(caught?.message ?? ""));

  let handled = 0;
  const exact = createEventBus(() => {
    handled += 1;
  }, 3);
  exact.emit("un");
  exact.emit("deux");
  exact.emit("trois");
  run("limite : atteinte sans être dépassée, tout passe", 3, handled);
  run("limite : le suivant est refusé", true, throws(() => exact.emit("quatre")));
  run("limite : largement au-dessus d'une action réelle", true, MAX_EVENTS_PER_ACTION >= 100);

  // Le réducteur refuse proprement : un code, l'état d'avant, un journal vide.
  const game = rules.createGame(3);
  const refused = rules.reduce(game, { type: "draw" }, { eventLimit: 3 });
  run("réducteur : au-delà de la limite, refus", false, refused.ok);
  run("réducteur : code du refus", "eventLimit", refused.error);
  run("réducteur : état inchangé", game, refused.state);
  run.same("réducteur : journal vide", [], refused.events);
  run("réducteur : sous la limite, l'action passe", true, rules.reduce(game, { type: "draw" }, { eventLimit: 6 }).ok);

  // L'ordre fixe des écouteurs : base gauche, base droite, pointe, puis la main.
  const listening = {
    ...game,
    hand: ["mica", "tiger"],
    triangle: { apex: { marble: "clay", wear: 0 }, rightBase: { marble: "glass", wear: 0 }, leftBase: { marble: "agate", wear: 0 } },
  };
  run.same(
    "écouteurs : ordre fixe",
    ["triangle:leftBase:agate", "triangle:rightBase:glass", "triangle:apex:clay", "hand:0:mica", "hand:1:tiger"],
    marbleListeners(listening).map((listener) => `${listener.zone}:${listener.slot ?? listener.index}:${listener.marble}`)
  );
  const holes = { ...listening, hand: [], triangle: { leftBase: null, rightBase: { marble: "glass", wear: 0 }, apex: null } };
  run("écouteurs : un emplacement vide n'écoute pas", 1, marbleListeners(holes).length);
}
