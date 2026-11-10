// CAS CONSTRUIT du jeu des billes : un état décrit à la main, des actions, et ce
// qu'elles produisent, sans jouer la partie jusque-là. Outil de la boîte à outils
// des billes (doc/marbles-tools.md), jamais chargé par le jeu.
//
//   node tools/marbles/case.js tools/marbles/examples/replacement.json
//   node tools/marbles/case.js tools/marbles/examples/replacement.json --json
//
// Le fichier (JSON) :
//   {
//     "state": { ...description, voir tools/marbles/state-builder.js },
//     "actions": ["prevoir", "poser 1 pointe", "resoudre", { "type": "swap", "a": "apex", "b": "leftBase" }]
//   }
// Une action est une commande texte (tools/marbles/commands.js : poser, echanger,
// piocher, resoudre, prevoir) ou une action brute du réducteur. Ici « resoudre » ne
// pioche pas : chaque action est exactement celle du réducteur.
//
// Sortie : l'état de départ, puis pour chaque action son journal (une ligne par
// évènement) ou son refus, et l'état final. --json : une dernière ligne JSON
// (état final, actions et leurs journaux bruts).

import { readFile } from "node:fs/promises";
import { installFileFetch } from "../node-fetch.js";
import { parseCommand } from "./commands.js";
import { GAME_RULES } from "./game-rules.js";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
if (!file) {
  console.log("Usage : node tools/marbles/case.js <cas.json> [--json]");
  process.exit(1);
}

installFileFetch();
const { t } = await import("../../data/i18n/index.js");
const { forecast } = await import("../../core/marbles-forecast.js");
const { SLOTS } = await import("../../core/marbles.js");
const { buildState, applyActions } = await import("./state-builder.js");
const { PLACEMENT_TRIGGERS, counter, formatEvent, formatState, marbleLabel, slotLabel, triggerLabel } = await import("./format.js");
const name = (id) => t(`marble.${id}.name`);

const spec = JSON.parse(await readFile(file, "utf-8"));
let state = buildState(spec.state ?? {});
const record = [];

console.log("État de départ :");
formatState(state, name).forEach((line) => console.log(`  ${line}`));

// La prévision d'une pose envisagée (ou du triangle actuel), en chiffres bruts.
function printForecast(action) {
  const predicted = GAME_RULES.forecast(state, action);
  if (!predicted.ok) {
    console.log(`  Prévision refusée : ${predicted.error}.`);
    return;
  }
  for (const trigger of PLACEMENT_TRIGGERS) {
    const outcome = predicted[trigger.id];
    if (outcome) console.log(`  ${triggerLabel(trigger.id)} : Vitesse ${counter(outcome.speed)}, Masse ${counter(outcome.mass)}.`);
  }
  for (const slot of SLOTS) {
    const phase = predicted.phases[slot];
    console.log(`  ${slotLabel(slot)} : ${phase === null ? "vide" : `${marbleLabel(phase.marble, name)}, Vitesse ${counter(phase.speed)}, Masse ${counter(phase.mass)}`}.`);
    for (const effect of predicted.slotEffects[slot]) {
      console.log(`    ${triggerLabel(effect.trigger)} : Vitesse ${counter(effect.speed)}, Masse ${counter(effect.mass)}, Pioche ${effect.draw}.`);
    }
  }
  console.log(`  Prévu : Vitesse ${counter(predicted.speed)}, Masse ${counter(predicted.mass)}, Impact ${predicted.impact}.`);
}

for (const entry of spec.actions ?? []) {
  const shown = typeof entry === "string" ? entry : JSON.stringify(entry);
  console.log(`> ${shown}`);
  const command = typeof entry === "string" ? parseCommand(entry) : { kind: "action", action: entry };
  if (command.kind === "error" || command.kind === "other") {
    console.log(`  ${command.error ?? `Commande inconnue : ${command.word}`}`);
    continue;
  }
  if (command.kind === "forecast") {
    printForecast(command.action);
    continue;
  }
  const { state: next, steps } = applyActions(state, [command.action]);
  const [step] = steps;
  record.push(step);
  if (!step.ok) console.log(`  Refusé : ${step.error}.`);
  else step.events.forEach((event) => console.log(`  ${formatEvent(event, name)}`));
  state = next;
}

console.log("État final :");
formatState(state, name).forEach((line) => console.log(`  ${line}`));
if (args.includes("--json")) console.log(JSON.stringify({ state, steps: record }));
