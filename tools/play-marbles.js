// KIT TERMINAL du jeu des billes : jouer une partie au clavier ou par un script
// de commandes, sans interface. Outil de développement, jamais chargé par le
// jeu. Il passe par le même réducteur (core/marbles.js) et dit les mêmes
// phrases (view/marbles/narration.js) que l'écran du jeu.
//
//   node tools/play-marbles.js --seed 42
//   node tools/play-marbles.js --seed 42 --lang en
//   node tools/play-marbles.js --seed 42 --json < commandes.txt
//
// --seed : graine imposée (sinon tirée au hasard, et affichée pour rejouer).
// --lang : fr (défaut) ou en.
// --json : en sortie, une dernière ligne JSON (graine, score, état final,
//          journal complet) pour comparer deux parties.
//
// Commandes, une par ligne, sur l'entrée standard (ligne vide ou # : ignorée) :
//   etat | state                     afficher l'état
//   poser | place <n> <emplacement>  poser la bille n de la main (à partir de 1)
//   echanger | swap <empl.> <empl.>  échanger deux emplacements
//   prevoir | forecast               prévoir le tour sur le triangle actuel
//   prevoir | forecast <n> <empl.>   prévoir la pose de la bille n (rien ne bouge)
//   fin | end                        résoudre et finir le tour
//   journal                          afficher le journal brut, en JSON
//   aide | help                      cette liste
//   quitter | quit
// Emplacements : gauche (g, left), droite (d, right), pointe (p, apex).
//
// La pioche est automatique, en début de partie et après chaque tour. Le
// remplacement d'une bille ne demande pas de confirmation : c'est l'affaire de
// l'interface, comme dans le réducteur.

import { createInterface } from "node:readline";
import { installFileFetch } from "./node-fetch.js";

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const lang = optionValue(args, "--lang") ?? "fr";
const jsonOutput = args.includes("--json");
const seedOption = optionValue(args, "--seed");
// Une graine en chiffres reste un nombre : la même que celle du jeu.
const seed = seedOption === undefined ? Math.floor(Math.random() * 2 ** 32) : /^\d+$/.test(seedOption) ? Number(seedOption) : seedOption;

// Avant d'importer les textes, qui se chargent par fetch (voir tools/node-fetch.js).
installFileFetch();
const { t, setLocale } = await import("../data/i18n/index.js");
const { createMarblesGame, marblesReduce, swapRefusal, SLOTS } = await import("../core/marbles.js");
const { forecast } = await import("../core/marbles-forecast.js");
const { buildSteps, describeEffect, describeHandFocus, describeSlotFocus, describeStatus, marbleName, placementLines, slotName } = await import("../view/marbles/narration.js");
setLocale(lang);

const SLOT_ALIASES = {
  gauche: "leftBase",
  g: "leftBase",
  left: "leftBase",
  leftbase: "leftBase",
  droite: "rightBase",
  d: "rightBase",
  right: "rightBase",
  rightbase: "rightBase",
  pointe: "apex",
  p: "apex",
  apex: "apex",
};

const HELP = [
  "etat | state                     afficher l'état",
  "poser | place <n> <emplacement>  poser la bille n de la main (à partir de 1)",
  "echanger | swap <empl.> <empl.>  échanger deux emplacements",
  "prevoir | forecast               prévoir le tour sur le triangle actuel",
  "prevoir | forecast <n> <empl.>   prévoir la pose de la bille n (rien ne bouge)",
  "fin | end                        résoudre et finir le tour",
  "journal                          afficher le journal brut, en JSON",
  "aide | help                      cette liste",
  "quitter | quit",
  "Emplacements : gauche (g, left), droite (d, right), pointe (p, apex).",
];

let game = createMarblesGame(seed);
const journal = [];

// Applique une action, journalise et affiche ce qu'elle a produit ; rend vrai
// si elle est passée.
function act(action) {
  const result = marblesReduce(game, action);
  if (!result.ok) {
    console.log(`Refusé : ${t(`marbles.error.${result.error}`)} (${result.error})`);
    return false;
  }
  game = result.state;
  journal.push(...result.events);
  for (const step of buildSteps(result.events, t)) console.log(step.text);
  return true;
}

function printState() {
  console.log(describeStatus(game, swapRefusal(game) === null, t));
  for (const slot of SLOTS) console.log(`  ${describeSlotFocus(game, slot, t)}`);
  if (game.hand.length === 0) console.log(`  ${describeHandFocus(game, 0, t)}`);
  game.hand.forEach((_, index) => console.log(`  ${describeHandFocus(game, index, t)}`));
  console.log(`  [sac, du haut vers le bas : ${game.bag.join(", ") || "-"}]`);
  console.log(`  [défausse : ${game.discard.join(", ") || "-"}]`);
}

// La prévision, dite avec les mêmes phrases que l'écran. `action` : null pour le
// triangle actuel, sinon la pose envisagée.
function printForecast(action) {
  const predicted = forecast(game, action);
  if (!predicted.ok) {
    console.log(`Refusé : ${t(`marbles.error.${predicted.error}`)} (${predicted.error})`);
    return;
  }
  if (action !== null) {
    for (const line of placementLines(game, action.handIndex, action.slot, t)) console.log(`  ${t(line.key, line.params)}`);
  }
  for (const slot of SLOTS) {
    const phase = predicted.phases[slot];
    if (phase !== null) console.log(`  [${slotName(slot, t)}, ${marbleName(phase.marble, t)} : ${describeEffect(phase, t)}]`);
  }
  console.log(`  [Vitesse ${predicted.speed}, Masse ${predicted.mass}, Impact ${predicted.impact}]`);
}

// La commande d'une ligne ; rend faux pour arrêter.
function runCommand(line) {
  const [command, ...params] = line.trim().split(/\s+/);
  switch (command.toLowerCase()) {
    case "etat":
    case "state":
      printState();
      break;
    case "poser":
    case "place": {
      const slot = SLOT_ALIASES[params[1]?.toLowerCase()];
      if (!/^\d+$/.test(params[0] ?? "") || !slot) console.log("Usage : poser <n> <gauche|droite|pointe>");
      else act({ type: "place", handIndex: Number(params[0]) - 1, slot });
      break;
    }
    case "echanger":
    case "swap": {
      const a = SLOT_ALIASES[params[0]?.toLowerCase()];
      const b = SLOT_ALIASES[params[1]?.toLowerCase()];
      if (!a || !b) console.log("Usage : echanger <gauche|droite|pointe> <gauche|droite|pointe>");
      else act({ type: "swap", a, b });
      break;
    }
    case "prevoir":
    case "forecast": {
      if (params.length === 0) {
        printForecast(null);
        break;
      }
      const slot = SLOT_ALIASES[params[1]?.toLowerCase()];
      if (!/^\d+$/.test(params[0] ?? "") || !slot) console.log("Usage : prevoir [<n> <gauche|droite|pointe>]");
      else printForecast({ type: "place", handIndex: Number(params[0]) - 1, slot });
      break;
    }
    case "fin":
    case "end":
      if (act({ type: "resolve" }) && game.stage === "draw") act({ type: "draw" });
      break;
    case "journal":
      for (const event of journal) console.log(JSON.stringify(event));
      break;
    case "aide":
    case "help":
      HELP.forEach((text) => console.log(text));
      break;
    case "quitter":
    case "quit":
      return false;
    default:
      console.log(`Commande inconnue : ${command} (aide : help)`);
  }
  return true;
}

console.log(`Partie de billes, graine ${seed}.`);
act({ type: "draw" });

const lines = createInterface({ input: process.stdin, terminal: false });
for await (const line of lines) {
  if (line.trim() === "" || line.trim().startsWith("#")) continue;
  console.log(`> ${line.trim()}`);
  if (!runCommand(line)) break;
  if (game.stage === "over") break;
}
lines.close();

console.log(`Score : ${game.score}.`);
if (jsonOutput) console.log(JSON.stringify({ seed, score: game.score, state: game, journal }));
