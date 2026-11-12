// CAS CONSTRUIT du jeu des billes : un état décrit à la main, des actions, et ce
// qu'elles produisent, sans jouer la partie jusque-là. Outil de la boîte à outils
// des billes (doc/marbles-tools.md), jamais chargé par le jeu.
//
//   node marbles/tools/case.js marbles/tools/examples/replacement.json
//   node marbles/tools/case.js marbles/tools/examples/replacement.json --json
//
// Le fichier (JSON) :
//   {
//     "state": { ...description, voir marbles/tools/state-builder.js },
//     "actions": ["prevoir", "poser 1 pointe", "resoudre", { "type": "swap", "a": "apex", "b": "leftBase" }]
//   }
// Une action est une commande texte (marbles/tools/commands.js : poser, echanger,
// piocher, resoudre, prevoir, choisir, terminer) ou une action brute du réducteur.
// Ici « resoudre » ne pioche pas : chaque action est exactement celle du réducteur.
// Une action suspendue sur un choix affiche le choix en attente et ses cibles ; la
// suivante y répond (« choisir 2 », « choisir pointe », « terminer »).
//
// Sortie : l'état de départ, puis pour chaque action son journal (une ligne par
// évènement) ou son refus, et l'état final. --json : une dernière ligne JSON
// (état final, actions et leurs journaux bruts).

import { readFile } from "node:fs/promises";
import { installFileFetch } from "../../tools/node-fetch.js";
import { parseCommand } from "./commands.js";
import { GAME_RULES } from "./game-rules.js";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
if (!file) {
  console.log("Usage : node marbles/tools/case.js <cas.json> [--json]");
  process.exit(1);
}

installFileFetch();
const { t } = await import("../../data/i18n/index.js");
const { SLOTS } = await import("../core/marbles.js");
const { buildState, applyActions } = await import("./state-builder.js");
const { PLACEMENT_TRIGGERS, choiceLine, counter, formatEvent, formatState, marbleLabel, slotLabel, triggerLabel } = await import("./format.js");
const name = (id) => t(`marble.${id}.name`);

const spec = JSON.parse(await readFile(file, "utf-8"));
let state = buildState(spec.state ?? {});
const record = [];

console.log("État de départ :");
formatState(state, name, GAME_RULES.statuses).forEach((line) => console.log(`  ${line}`));

// Ce qu'un effet prévu a produit en plus de ses valeurs : billes chassées (et leur
// Éjection), mises en poche ou perdues, cibles vides, choix indécis.
function results(outcome) {
  const parts = [
    ...(outcome.ejected ?? []).map(({ marble, knockout }) => `chasse ${marbleLabel(marble, name)}${knockout ? ` (Éjection : Vitesse ${counter(knockout.speed)}, Masse ${counter(knockout.mass)})` : ""}`),
    ...(outcome.pockets ?? []).map(({ marble, lost }) => `${marble === null ? "une bille piochée" : marbleLabel(marble, name)} ${lost ? "perdue, pot plein" : "en poche"}`),
    ...(outcome.empty ?? []).map(({ action, target, slot }) => `${action} sans cible (${target ?? slotLabel(slot)})`),
    ...(outcome.undecided ?? []).map(({ action }) => `${action} selon le choix`),
  ];
  return parts.length === 0 ? "" : ` ; ${parts.join(", ")}`;
}

// La prévision d'une pose envisagée (ou du triangle actuel), en chiffres bruts.
function printForecast(action) {
  const predicted = GAME_RULES.forecast(state, action);
  if (!predicted.ok) {
    console.log(`  Prévision refusée : ${predicted.error}.`);
    return;
  }
  for (const trigger of PLACEMENT_TRIGGERS) {
    const outcome = predicted[trigger.id];
    if (outcome) console.log(`  ${triggerLabel(trigger.id)} : Vitesse ${counter(outcome.speed)}, Masse ${counter(outcome.mass)}${results(outcome)}.`);
  }
  for (const slot of SLOTS) {
    const phase = predicted.phases[slot];
    const cleared = predicted.cleared[slot] === null ? "vide" : `${marbleLabel(predicted.cleared[slot], name)} retirée avant sa phase`;
    console.log(`  ${slotLabel(slot)} : ${phase === null ? cleared : `${marbleLabel(phase.marble, name)}, Vitesse ${counter(phase.speed)}, Masse ${counter(phase.mass)}${results(phase)}`}.`);
    for (const effect of predicted.slotEffects[slot]) {
      console.log(`    ${triggerLabel(effect.trigger)} : Vitesse ${counter(effect.speed)}, Masse ${counter(effect.mass)}, Pioche ${effect.draw}${results(effect)}.`);
    }
  }
  for (const effect of predicted.potReactions) {
    console.log(`  Pot, pendant la pose, ${marbleLabel(effect.marble, name)} : Vitesse ${counter(effect.speed)}, Masse ${counter(effect.mass)}${results(effect)}.`);
  }
  for (const effect of predicted.potEffects) {
    console.log(`  Pot, ${marbleLabel(effect.marble, name)} : Vitesse ${counter(effect.speed)}, Masse ${counter(effect.mass)}${results(effect)}.`);
  }
  for (const { effects } of predicted.regenerations) {
    console.log("  Régénération du sac prévue.");
    for (const effect of effects) {
      console.log(`    ${triggerLabel(effect.trigger)}, ${marbleLabel(effect.marble, name)} en ${slotLabel(effect.slot)} : Vitesse ${counter(effect.speed)}, Masse ${counter(effect.mass)}, Pioche ${effect.draw}.`);
    }
  }
  const notes = [predicted.choiceDependent && "selon le choix", predicted.awakenPossible && "éveils possibles", predicted.interrupted && "enchaînement interrompu"].filter(Boolean);
  console.log(`  Prévu : Vitesse ${counter(predicted.speed)}, Masse ${counter(predicted.mass)}, Impact ${predicted.impact}${notes.length === 0 ? "" : ` (${notes.join(", ")})`}.`);
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
  // Une action suspendue sur un choix : ses cibles, à désigner par « choisir ».
  if (state.pendingChoice) console.log(`  ${choiceLine(state.pendingChoice, name)}`);
}

console.log("État final :");
formatState(state, name, GAME_RULES.statuses).forEach((line) => console.log(`  ${line}`));
if (args.includes("--json")) console.log(JSON.stringify({ state, steps: record }));
