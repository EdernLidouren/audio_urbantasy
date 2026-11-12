// KIT TERMINAL du jeu des billes : jouer une partie au clavier ou par un script
// de commandes, sans interface. Outil de la boîte à outils des billes
// (doc/marbles-tools.md), jamais chargé par le jeu. Il passe par le même
// réducteur (marbles/core/marbles.js) et dit les mêmes phrases (marbles/view/narration.js)
// que l'écran du jeu.
//
//   node marbles/tools/play.js --seed 42
//   node marbles/tools/play.js --seed 42 --lang en
//   node marbles/tools/play.js --seed 42 --json < commandes.txt
//
// --seed : graine imposée (sinon tirée au hasard, et affichée pour rejouer).
// --lang : fr (défaut) ou en.
// --json : en sortie, une dernière ligne JSON (graine, score, état final,
//          journal complet) pour comparer deux parties.
//
// Commandes, une par ligne, sur l'entrée standard (ligne vide ou # : ignorée) :
//   etat | state                     afficher l'état, comme l'écran le dit
//   brut | raw                       afficher l'état complet (format.js), sac compris
//   poser | place <n> <emplacement>  poser la bille n de la main (à partir de 1)
//   echanger | swap <empl.> <empl.>  échanger deux emplacements
//   prevoir | forecast | r           la vue d'ensemble du tour (touche R)
//   prevoir | forecast <n> <empl.>   prévoir la pose de la bille n (rien ne bouge)
//   fin | end                        résoudre et finir le tour (Maj+R) : une ligne
//                                    par étape de la séquence, sans les pauses
//   choisir | choose <n> | <empl.>   répondre au choix en attente : la bille n de la
//                                    main, ou un emplacement
//   terminer | done                  terminer un choix « jusqu'à N »
//   journal                          le journal de la partie, une ligne par évènement
//   journal json                     le même, brut, en JSON
//   aide | help                      cette liste
//   quitter | quit
// Emplacements : gauche (g, left), droite (d, right), pointe (p, apex)
// (marbles/tools/commands.js).
//
// La pioche est automatique, en début de partie et après chaque tour. Le
// remplacement d'une bille ne demande pas de confirmation : c'est l'affaire de
// l'interface, comme dans le réducteur.

import { createInterface } from "node:readline";
import { installFileFetch } from "../../tools/node-fetch.js";
import { parseCommand } from "./commands.js";
import { GAME_RULES } from "./game-rules.js";

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
const { t, setLocale } = await import("../../data/i18n/index.js");
const { swapRefusal, SLOTS } = await import("../core/marbles.js");
const { buildSteps, resolutionSteps, describeBag, describeChoicePrompt, describeDiscard, describeHandFocus, describeOverview, describeSlotFocus, describeTurn, placementLines } = await import(
  "../view/narration.js"
);
const { marbleCard } = await import("../view/card.js");
const { choiceLine, formatEvent, formatState, tallyList } = await import("./format.js");
setLocale(lang);
const name = (id) => t(`marble.${id}.name`);

const HELP = [
  "etat | state                     afficher l'état",
  "brut | raw                       afficher l'état complet, sac compris",
  "poser | place <n> <emplacement>  poser la bille n de la main (à partir de 1)",
  "echanger | swap <empl.> <empl.>  échanger deux emplacements",
  "prevoir | forecast | r           la vue d'ensemble du tour (touche R)",
  "prevoir | forecast <n> <empl.>   prévoir la pose de la bille n (rien ne bouge)",
  "fin | end                        résoudre et finir le tour (Maj+R)",
  "choisir | choose <n> | <empl.>   répondre au choix en attente : la bille n de la main, ou un emplacement",
  "terminer | done                  terminer un choix « jusqu'à N »",
  "journal                          le journal, une ligne par évènement",
  "journal json                     le journal brut, en JSON",
  "aide | help                      cette liste",
  "quitter | quit",
  "Emplacements : gauche (g, left), droite (d, right), pointe (p, apex).",
];

let game = GAME_RULES.createGame(seed);
const journal = [];

// Applique une action et la journalise ; rend ses évènements, ou null si elle
// est refusée (déjà dit).
function apply(action) {
  const result = GAME_RULES.reduce(game, action);
  if (!result.ok) {
    console.log(`Refusé : ${t(`marbles.error.${result.error}`)} (${result.error})`);
    return null;
  }
  game = result.state;
  journal.push(...result.events);
  return result.events;
}

// Le choix en attente, s'il y en a un : sa question, comme l'écran, puis ses cibles,
// à désigner par « choisir ».
function printChoice() {
  if (game.pendingChoice === null) return;
  console.log(describeChoicePrompt(game.pendingChoice, t));
  console.log(`  ${choiceLine(game.pendingChoice, name)}`);
}

// Applique une action et affiche ce qu'elle a produit, puis le choix qu'elle attend.
function act(action) {
  const events = apply(action);
  if (events) for (const step of buildSteps(events, t)) console.log(step.text);
  printChoice();
}

// La résolution en cours, tant qu'un choix peut l'interrompre : { turn, first }.
let resolving = null;

// La résolution et la pioche du tour suivant, dites comme la séquence de l'écran ;
// un choix l'interrompt, sa suite se dit après la réponse (continueTurn).
function resolveTurn() {
  const { turn } = game;
  const resolved = apply({ type: "resolve" });
  if (!resolved) return;
  resolving = { turn, first: true };
  continueTurn(resolved);
}

function continueTurn(events) {
  let all = events;
  if (game.pendingChoice === null && game.stage === "draw") all = [...all, ...(apply({ type: "draw" }) ?? [])];
  const steps = resolving.first ? resolutionSteps(resolving.turn, all, t) : buildSteps(all, t);
  resolving.first = false;
  for (const step of steps) console.log(step.text);
  if (game.pendingChoice === null) resolving = null;
  printChoice();
}

// Une réponse au choix : pendant une résolution, sa suite.
function answer(action) {
  const events = apply(action);
  if (!events) return;
  if (resolving !== null) continueTurn(events);
  else {
    for (const step of buildSteps(events, t)) console.log(step.text);
    printChoice();
  }
}

// Une bille et sa fiche, à plat : ce que l'écran donne champ par champ.
function printMarble(marble, main, turnsInHand = 0) {
  console.log(`  ${main}`);
  const { above, below } = marbleCard(marble, main, GAME_RULES, t, { turnsInHand, tally: game.tally });
  for (const field of [...above, ...below]) console.log(`      ${field}`);
}

function printState() {
  console.log(`${describeBag(game, t)} ${describeDiscard(game, t)}`);
  console.log(describeTurn(game, swapRefusal(game) === null, t));
  for (const slot of SLOTS) {
    const placed = game.triangle[slot];
    if (placed === null) console.log(`  ${describeSlotFocus(game, slot, GAME_RULES, t)}`);
    else printMarble(placed.marble, describeSlotFocus(game, slot, GAME_RULES, t));
  }
  if (game.hand.length === 0) console.log(`  ${describeHandFocus(game, 0, GAME_RULES, t)}`);
  game.hand.forEach(({ marble, turnsInHand }, index) => printMarble(marble, describeHandFocus(game, index, GAME_RULES, t), turnsInHand));
  console.log(`  [sac, du haut vers le bas : ${game.bag.join(", ") || "-"}]`);
  console.log(`  [défausse : ${game.discard.join(", ") || "-"}]`);
  console.log(`  [valeurs de partie, ce tour/cette partie : ${tallyList(game.tally)}]`);
}

// La prévision, dite avec les mêmes phrases que l'écran. `action` : null pour la
// vue d'ensemble du triangle actuel (touche R), sinon la confirmation de la pose
// envisagée.
function printForecast(action) {
  const predicted = GAME_RULES.forecast(game, action);
  if (!predicted.ok) {
    console.log(`Refusé : ${t(`marbles.error.${predicted.error}`)} (${predicted.error})`);
    return;
  }
  if (action === null) console.log(`  ${describeOverview(game, GAME_RULES, t)}`);
  else for (const line of placementLines(game, action.handIndex, action.slot, GAME_RULES, t)) console.log(`  ${t(line.key, line.params)}`);
}

// La commande d'une ligne ; rend faux pour arrêter.
function runCommand(line) {
  const command = parseCommand(line);
  if (command.kind === "error") {
    console.log(command.error);
    return true;
  }
  if (command.kind === "forecast") {
    // Comme l'écran (touche R) : rien ne se prévoit au milieu d'une action.
    if (game.pendingChoice !== null) console.log(`Refusé : ${t("marbles.error.choicePending")} (choicePending)`);
    else printForecast(command.action);
    return true;
  }
  if (command.kind === "action") {
    // La pioche reste automatique, et la résolution passe par « fin », qui pioche
    // dans la foulée comme l'écran.
    if (command.action.type === "resolve") resolveTurn();
    else if (command.action.type === "draw") console.log("La pioche est automatique ici.");
    else if (command.action.type === "choose") answer(command.action);
    else act(command.action);
    return true;
  }
  switch (command.word) {
    case "etat":
    case "state":
      printState();
      break;
    case "brut":
    case "raw":
      formatState(game, name).forEach((text) => console.log(text));
      break;
    case "fin":
    case "end":
      resolveTurn();
      break;
    case "journal":
      for (const event of journal) console.log(command.params[0] === "json" ? JSON.stringify(event) : formatEvent(event, name));
      break;
    case "aide":
    case "help":
      HELP.forEach((text) => console.log(text));
      break;
    case "quitter":
    case "quit":
      return false;
    default:
      console.log(`Commande inconnue : ${command.word} (aide : help)`);
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
