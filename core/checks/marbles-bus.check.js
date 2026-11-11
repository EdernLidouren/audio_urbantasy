// Vérifications du core — domaine « marbles-bus ». Le bus d'évènements du jeu
// des billes (core/marbles-bus.js) : file premier entré, premier sorti, aucune
// récursion, limite de sécurité qui arrête la chaîne proprement ; l'ordre fixe des
// écouteurs et l'arrêt propre d'une action du réducteur. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-bus`).

import { MAX_EVENTS_PER_CHAIN, createEventBus } from "../marbles-bus.js";
import { createMarblesGame, marbleListeners, marblesReduce } from "../marbles.js";
import MARBLE_TYPES from "../../marbles/types/index.js";
import { createMarblesRules } from "../marbles-rules.js";
import { inHand } from "./helpers.js";

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

  // Interruption (settle) : réglée jusqu'au bout tout de suite, ce qu'elle émet
  // compris, avant ce qui attendait déjà ; la file en attente reprend ensuite.
  const interrupted = [];
  const interrupting = createEventBus((event) => {
    interrupted.push(event);
    if (event === "pose") {
      interrupting.emit("en attente");
      interrupting.settle("régénération");
      interrupting.emit("pioche");
    }
    if (event === "régénération") interrupting.emit("trouvaille");
  });
  interrupting.emit("pose");
  run.same("interruption : réglée avant ce qui attendait", ["pose", "régénération", "trouvaille", "en attente", "pioche"], interrupted);
  const outside = [];
  const alone = createEventBus((event) => outside.push(event));
  alone.settle("seul");
  run.same("interruption : hors de tout traitement, comme emit", ["seul"], outside);
  let settleStops = 0;
  let settled = 0;
  const loopingSettle = createEventBus(
    (event) => {
      settled += 1;
      loopingSettle.settle(event);
    },
    10,
    () => (settleStops += 1)
  );
  loopingSettle.settle("tour");
  run("interruption : une boucle d'interruptions s'arrête aussi, sans lever", 1, settleStops);
  run("interruption : arrêtée à la limite", 10, settled);

  // Limite de sécurité : une boucle coupe SA chaîne, sans lever ; `onLimit` une fois
  // pour elle ; la chaîne suivante repart de zéro et se traite normalement.
  let stops = 0;
  let turns = 0;
  const after = [];
  const looping = createEventBus(
    (event) => {
      if (event === "après") {
        after.push(event);
        return;
      }
      turns += 1;
      looping.emit(event);
      looping.emit("autre");
    },
    10,
    () => (stops += 1)
  );
  looping.emit("tour");
  run("limite : une boucle s'arrête à la limite", 10, turns);
  run("limite : signalée une fois", 1, stops);
  run("limite : le bus compte la chaîne coupée", 1, looping.interruptions());
  looping.emit("après");
  looping.settle("après");
  run.same("limite : la chaîne suivante se traite normalement", ["après", "après"], after);
  run("limite : la boucle ne reprend pas", 10, turns);
  run("limite : une seule chaîne coupée", 1, stops);

  // La limite vaut par chaîne : trois chaînes de deux évènements passent sous une
  // limite de trois.
  let handled = 0;
  const perChain = createEventBus((event) => {
    handled += 1;
    if (event !== "suite") perChain.emit("suite");
  }, 3);
  perChain.emit("un");
  perChain.emit("deux");
  perChain.emit("trois");
  run("limite : par chaîne, jamais cumulée sur l'action", 6, handled);
  run("limite : aucune chaîne coupée", 0, perChain.interruptions());
  run("limite : largement au-dessus d'une chaîne réelle", true, MAX_EVENTS_PER_CHAIN >= 100);

  // Le réducteur finit son action : chaque chaîne coupée se note au journal, l'action
  // aboutit, l'état reçu reste intact. Une limite nulle coupe chaque chaîne d'emblée.
  const game = rules.createGame(3);
  const frozen = structuredClone(game);
  const halted = rules.reduce(game, { type: "draw" }, { eventLimit: 0 });
  run("réducteur : au-delà de la limite, l'action aboutit", true, halted.ok);
  run("réducteur : les chaînes coupées sont notées", true, halted.events.some((event) => event.type === "chainInterrupted"));
  run.same("réducteur : l'état reçu n'est pas touché", frozen, game);
  run("réducteur : la pioche du tour se finit (le corps de l'action continue)", "play", halted.state.stage);
  run("réducteur : toutes les billes piochées quand même", 5, halted.state.hand.length);
  run("réducteur : sous la limite, rien de noté", false, rules.reduce(game, { type: "draw" }).events.some((event) => event.type === "chainInterrupted"));

  // L'ordre fixe des écouteurs : base gauche, base droite, pointe, puis la main.
  const listening = {
    ...game,
    hand: inHand(["mica", "tiger"]),
    triangle: { apex: { marble: "clay", wear: 0 }, rightBase: { marble: "glass", wear: 0 }, leftBase: { marble: "agate", wear: 0 } },
  };
  run.same(
    "écouteurs : ordre fixe",
    ["triangle:leftBase:agate", "triangle:rightBase:glass", "triangle:apex:clay", "hand:0:mica", "hand:1:tiger"],
    marbleListeners(listening).map((listener) => `${listener.zone}:${listener.slot ?? listener.index}:${listener.marble}`)
  );
  const holes = { ...listening, hand: inHand([]), triangle: { leftBase: null, rightBase: { marble: "glass", wear: 0 }, apex: null } };
  run("écouteurs : un emplacement vide n'écoute pas", 1, marbleListeners(holes).length);
}
