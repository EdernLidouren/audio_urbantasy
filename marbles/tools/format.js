// BOÎTE À OUTILS DES BILLES — l'AFFICHAGE LISIBLE d'un état et d'un journal
// (marbles/core/marbles.js), pour le terminal : des phrases courtes, une ligne par
// élément, jamais de tableau semi-graphique, pour qu'un lecteur d'écran les lise
// d'un trait. Pur, sans Node. Les identifiants restent visibles à côté des noms :
// ce sont eux qu'on écrit dans un cas construit ou un sac.
//
// `name(id)` : le nom d'une bille ; par défaut son id. Les lanceurs passent le nom
// français (data/i18n), les vérifications l'id.

import { MARBLE_POCKET, MARBLE_TRIGGERS } from "../config/values.js";
import { SLOTS } from "../core/marbles.js";
import { NO_STATUSES, characteristic } from "../core/statuses.js";
import { formatCounter } from "../view/narration.js";
import { GAME_RULES } from "./game-rules.js";

const SLOT_NAMES = { leftBase: "base gauche", rightBase: "base droite", apex: "pointe" };
const CAUSES = {
  replacement: "remplacement",
  wear: "usure",
  pocket: "mise en poche",
  eject: "éjectée par un effet",
  discard: "défaussée par un effet",
  bounce: "renvoyée en main",
  retrieve: "ramassée",
};
// Où va une bille redirigée pendant son déclencheur de sortie.
const DESTINATIONS = { pot: "le pot", hand: "la main", discard: "la défausse" };
// D'où vient une bille mise en poche ou perdue.
const POCKET_ORIGINS = { triangle: "le triangle", hand: "la main", discard: "la défausse", bag: "le sac" };
// Les mots du terminal pour chaque déclencheur, la phase comprise : son nom, son
// effet, ce qu'il produit (rapport) et, pour un déclencheur de pose, ce qu'il apporte
// (rapport, section des remplacements). Un par entrée de MARBLE_TRIGGERS
// (marbles/config/values.js) : un déclencheur sans ses mots lève au chargement.
export const TRIGGER_WORDS = {
  phase: { name: "Phase", effect: "Effet de phase", produced: "en phase" },
  awaken: { name: "Éveil", effect: "Effet d'éveil", produced: "en éveil" },
  flick: { name: "Chiquenaude", effect: "Effet de chiquenaude", produced: "en chiquenaude", brought: "les chiquenaudes" },
  hit: { name: "Tic", effect: "Effet de tic", produced: "en tic", brought: "les tics" },
  windfall: { name: "Trouvaille", effect: "Effet de trouvaille", produced: "en trouvaille" },
  knockout: { name: "Éjection", effect: "Effet d'éjection", produced: "en éjection", brought: "les éjections" },
  final: { name: "Final", effect: "Effet final", produced: "en final" },
  drop: { name: "Chute", effect: "Effet de chute", produced: "en chute" },
  // Les moments En poche (marbles/config/values.js/MARBLE_POCKET).
  pocketEntry: { name: "En poche, à l'entrée", effect: "Effet d'entrée au pot", produced: "à l'entrée au pot" },
  pocketResolution: { name: "En poche, à chaque résolution", effect: "Effet du pot", produced: "au pot" },
  pocketReaction: { name: "En poche, à chaque occurrence", effect: "Réaction du pot", produced: "en réaction au pot" },
};
for (const trigger of MARBLE_TRIGGERS) {
  if (!Object.hasOwn(TRIGGER_WORDS, trigger.id)) throw new Error(`outils des billes : le déclencheur "${trigger.id}" n'a pas ses mots (TRIGGER_WORDS).`);
}

// Les déclencheurs, la phase en tête : l'ordre des chiffres dans les outils.
export const TRIGGER_IDS = ["phase", ...MARBLE_TRIGGERS.map((trigger) => trigger.id), ...MARBLE_POCKET.moments.map((moment) => moment.trigger)];
for (const moment of MARBLE_POCKET.moments) {
  if (!Object.hasOwn(TRIGGER_WORDS, moment.trigger)) throw new Error(`outils des billes : le moment En poche "${moment.trigger}" n'a pas ses mots (TRIGGER_WORDS).`);
}
// Les déclencheurs d'une pose, avec leur effet dans la prévision.
export const PLACEMENT_TRIGGERS = MARBLE_TRIGGERS.filter((trigger) => trigger.forecast.line === "placement");
export const triggerLabel = (id) => TRIGGER_WORDS[id].name;

export const slotLabel = (slot) => SLOT_NAMES[slot] ?? slot;
export const counter = formatCounter;
const signed = (value) => (value > 0 ? `+${value}` : formatCounter(value));

// « argile (clay) », ou l'id seul quand le nom est l'id.
export function marbleLabel(id, name = (value) => value) {
  const shown = name(id);
  return shown === id ? id : `${shown} (${id})`;
}

function listOf(ids, name) {
  return ids.length === 0 ? "aucune" : ids.map((id) => marbleLabel(id, name)).join(", ");
}

// La main, avec le compteur de tours en main de chaque bille : « argile (clay), 2
// tours en main ».
function handList(hand, name) {
  if (hand.length === 0) return "aucune";
  return hand.map(({ marble, turnsInHand }) => `${marbleLabel(marble, name)}, ${turnsLabel(turnsInHand)}`).join(" ; ");
}

const turnsLabel = (turns) => `${turns} tour${turns > 1 ? "s" : ""} en main`;

// Un emplacement : « base gauche : argile (clay), usure 1 sur 3, bonus Vitesse +4. »
function slotLine(state, slot, name) {
  const placed = state.triangle[slot];
  if (placed === null) return `${slotLabel(slot)} : vide.`;
  let line = `${slotLabel(slot)} : ${marbleLabel(placed.marble, name)}, usure ${placed.wear} sur ${GAME_RULES.maxWearOf(placed.marble)}`;
  if (placed.bonus) line += `, bonus Vitesse ${signed(placed.bonus.speed)} et Masse ${signed(placed.bonus.mass)}`;
  return `${line}.`;
}

// Les valeurs de partie (marbles/core/tally.js) qui ne sont pas à zéro, sous leur
// identifiant, ce tour puis cette partie : « flick 2/5, shuffles 0/1 ».
export function tallyList(tally) {
  const counted = Object.entries(tally).filter(([, values]) => values.turn !== 0 || values.game !== 0);
  return counted.length === 0 ? "aucune" : counted.map(([id, values]) => `${id} ${values.turn}/${values.game}`).join(", ");
}

// Les statuts de la partie, dans l'ordre d'acquisition : « cushion intensité 2,
// reste 3 (tours) ; extraThrow intensité 1, reste 1 (tours), en attente ».
function statusList(instances) {
  if (instances.length === 0) return "aucun";
  return instances
    .map(({ status, intensity, remaining, pending }) => `${status} intensité ${intensity}, reste ${remaining ?? "toute la partie"}${pending ? ", en attente" : ""}`)
    .join(" ; ");
}

// L'état entier, une ligne par élément. Le sac se lit du haut (prochaine pioche)
// vers le bas : c'est un outil de test, il voit ce que le joueur ne voit pas.
// `statuses` : la table des statuts, pour les caractéristiques en vigueur (lancers,
// main, pot) ; aucune par défaut.
export function formatState(state, name, statuses = NO_STATUSES) {
  const value = (key) => characteristic(state, key, statuses);
  const yesNo = (value) => (value ? "oui" : "non");
  const lines = [
    `Tour ${state.turn} sur ${state.turnCount}, étape ${state.stage}.`,
    `Score ${state.score}. Vitesse ${formatCounter(state.speed)}, Masse ${formatCounter(state.mass)}.`,
    `Échange utilisé : ${yesNo(state.swapUsed)}. Lancers : ${state.throwsUsed} sur ${value("throws")}.`,
    ...SLOTS.map((slot) => slotLine(state, slot, name)),
    `Main, ${state.hand.length} sur ${value("handSize")} : ${handList(state.hand, name)}.`,
    `Sac, ${state.bag.length}, du haut vers le bas : ${listOf(state.bag, name)}.`,
    `Défausse, ${state.discard.length} : ${listOf(state.discard, name)}.`,
    `Pot, ${state.pot.length} sur ${value("potCapacity")}, dans l'ordre d'arrivée : ${listOf(state.pot, name)}. Perdues, ${state.lost.length} : ${listOf(state.lost, name)}.`,
    `Statuts : ${statusList(state.statuses)}.`,
    `Pioche : ${state.firstTurnDraw} au premier tour, ${state.drawPerTurn} ensuite.`,
    `Valeurs de partie (ce tour/cette partie) : ${tallyList(state.tally)}.`,
    ...(state.pendingChoice ? [choiceLine(state.pendingChoice, name)] : []),
  ];
  return lines;
}

// Une cible de choix : « main 2 : agate (agate) », « pointe : argile (clay) ».
export function targetLabel(target, name) {
  const marble = target.marble === null || target.marble === undefined ? "vide" : marbleLabel(target.marble, name);
  if (target.zone === "hand") return `main ${target.index + 1} : ${marble}`;
  if (target.zone === "discard") return `défausse ${target.index + 1} : ${marble}`;
  return `${slotLabel(target.slot)} : ${marble}`;
}

// Le choix en attente, d'une ligne : l'action, le mode, ce qui est fait, les cibles,
// puis les billes en transit (en cours de lancer), jamais des cibles.
export function choiceLine(pending, name) {
  const mode = pending.mode === "optional" ? `facultatif, jusqu'à ${pending.count}` : `${pending.count} obligatoire${pending.count > 1 ? "s" : ""}`;
  const chosen = pending.chosen.length === 0 ? "" : ` Déjà choisies : ${pending.chosen.map((target) => targetLabel(target, name)).join(", ")}.`;
  const finish = pending.mode === "optional" ? ", ou terminer (rien choisi : l'action est ignorée)" : "";
  const transit =
    pending.inTransit.length === 0 ? "" : ` En transit : ${pending.inTransit.map((moving) => `${marbleLabel(moving.marble, name)} vers ${slotLabel(moving.slot)}`).join(", ")}.`;
  return `Choix en attente : ${pending.action}, ${mode}, encore ${pending.remaining}, par ${marbleLabel(pending.by.marble, name)} (${pending.by.trigger}).${chosen} Cibles : ${pending.eligible.map((target) => targetLabel(target, name)).join(", ")}${finish}.${transit}`;
}

// Les effets d'une bille du pot (les moments En poche).
const POT_TRIGGERS = new Set(MARBLE_POCKET.moments.map((moment) => moment.trigger));

function effectLine(event, name) {
  if (event.trigger === "statusReaction") return `Effet du statut ${event.status} : Vitesse ${signed(event.speedDelta)}, Masse ${signed(event.massDelta)} ; compteurs Vitesse ${formatCounter(event.speed)}, Masse ${formatCounter(event.mass)}.`;
  // Une bille sans emplacement est au pot (En poche) ou en main (l'Éveil).
  const where = POT_TRIGGERS.has(event.trigger) ? "au pot" : event.slot === null || event.slot === undefined ? "en main" : `en ${slotLabel(event.slot)}`;
  let line = `${TRIGGER_WORDS[event.trigger]?.effect ?? `Effet ${event.trigger}`}, ${marbleLabel(event.marble, name)} ${where} : Vitesse ${signed(event.speedDelta)}, Masse ${signed(event.massDelta)}`;
  for (const gift of event.given ?? []) {
    line += `, donne Vitesse ${signed(gift.speed)} et Masse ${signed(gift.mass)} à ${slotLabel(gift.slot)}`;
  }
  return `${line} ; compteurs Vitesse ${formatCounter(event.speed)}, Masse ${formatCounter(event.mass)}.`;
}

const EVENT_LINES = {
  turnStarted: (event) => `Début du tour ${event.turn} sur ${event.turnCount}.`,
  draw: (event, name) => `Pioche : ${marbleLabel(event.marble, name)}${event.cause === "effect" ? ", par un effet" : ""}.`,
  awaken: (event, name) => `Éveil : ${marbleLabel(event.marble, name)}, en main.`,
  drawSkipped: (event) => `Pioche sautée (${event.reason}).`,
  bagRegenerated: (event) => `Sac régénéré depuis la défausse : ${event.size} billes.`,
  swapped: (event) => `Échange : ${slotLabel(event.a)} et ${slotLabel(event.b)}.`,
  flick: (event, name) => `Chiquenaude : ${marbleLabel(event.marble, name)} lancée vers ${slotLabel(event.slot)}, ${turnsLabel(event.turnsInHand)}.`,
  windfall: (event, name) => `Trouvaille : ${marbleLabel(event.marble, name)} en ${slotLabel(event.slot)}.`,
  knockout: (event, name) => `Éjection : ${marbleLabel(event.marble, name)} en ${slotLabel(event.slot)}.`,
  removed: (event, name) => `Retrait : ${marbleLabel(event.marble, name)}, ${slotLabel(event.slot)} (${CAUSES[event.cause] ?? event.cause}).`,
  discarded: (event, name) => `Défausse : ${marbleLabel(event.marble, name)} (${CAUSES[event.cause] ?? event.cause}).`,
  placed: (event, name) => `Pose : ${marbleLabel(event.marble, name)} en ${slotLabel(event.slot)}.`,
  hit: (event, name) => `Tic : ${marbleLabel(event.marble, name)} en ${slotLabel(event.slot)}.`,
  polished: (event, name) => `Polissage : ${marbleLabel(event.marble, name)} en ${slotLabel(event.slot)}, usure ${event.wear} sur ${event.maxWear}.`,
  cracked: (event, name) => `Fêlure : ${marbleLabel(event.marble, name)} en ${slotLabel(event.slot)}, usure ${event.wear} sur ${event.maxWear}.`,
  targetEmpty: (event, name) => {
    const action = { crack: "Fêlure", polish: "Polissage", pocket: "Empocher", eject: "Éjecter" }[event.action] ?? event.action;
    if (event.target === "firstInHand") return `${action} sans effet : main vide.`;
    if (event.target === "choice") return `${action} sans effet : aucune cible à choisir.`;
    if (event.target === "all") return `${action} sans effet : aucune bille visée.`;
    if (event.target === "self") return `${action} sans effet : ${marbleLabel(event.marble, name)} n'est plus là.`;
    return `${action} sans effet : ${slotLabel(event.slot)} vide.`;
  },
  pocketed: (event, name) => `Mise en poche : ${marbleLabel(event.marble, name)}, depuis ${POCKET_ORIGINS[event.from]}${event.slot ? ` (${slotLabel(event.slot)})` : ""}.`,
  returned: (event, name) => `En main : ${marbleLabel(event.marble, name)}, depuis ${POCKET_ORIGINS[event.from]}${event.slot ? ` (${slotLabel(event.slot)})` : ""} (${CAUSES[event.movedBy] ?? event.movedBy}).`,
  redirected: (event, name) => `Redirigée : ${marbleLabel(event.marble, name)}, en partance, vers ${DESTINATIONS[event.destination] ?? event.destination}.`,
  lost: (event, name) => `Perdue, pot plein : ${marbleLabel(event.marble, name)}, depuis ${POCKET_ORIGINS[event.from]}${event.slot ? ` (${slotLabel(event.slot)})` : ""}.`,
  potResolution: (event, name) => `Pot : ${marbleLabel(event.marble, name)}, ${event.index + 1}e arrivée.`,
  pocketReaction: (event, name) => `Réaction du pot : ${marbleLabel(event.marble, name)}, ${event.index + 1}e arrivée, à ${event.counter}.`,
  choice: (event, name) => `Choix : ${event.action}, ${event.mode === "optional" ? "facultatif, jusqu'à " : ""}${event.count}, zones ${event.zones.join(" et ")}, par ${marbleLabel(event.by.marble, name)}.`,
  chosen: (event, name) => `Choisie : ${targetLabel(event, name)}.`,
  choiceEnded: (event) => `Choix fini (${{ count: "nombre atteint", done: "terminé", exhausted: "plus de cible" }[event.reason]}), ${event.chosen} choisie(s).`,
  choiceUndecided: (event) => `Choix indécis (prévision) : ${event.action}.`,
  eject: (event, name) => `Éjecter : ${marbleLabel(event.by.marble, name)} chasse ${marbleLabel(event.marble, name)} de ${slotLabel(event.slot)}.`,
  chainInterrupted: () => "Enchaînement interrompu : limite de sécurité du bus atteinte (anomalie).",
  final: (event, name) => `Final : ${marbleLabel(event.marble, name)}, usée, partie de ${slotLabel(event.slot)}.`,
  phase: (event, name) => `Phase de ${slotLabel(event.slot)} : ${marbleLabel(event.marble, name)}.`,
  phaseSkipped: (event) => `Phase de ${slotLabel(event.slot)} : vide.`,
  effect: (event, name) => effectLine(event, name),
  wear: (event, name) => `Usure : ${marbleLabel(event.marble, name)}, ${event.wear} sur ${event.maxWear}.`,
  impact: (event) => `Impact ${event.impact} (Vitesse ${formatCounter(event.speed)}, Masse ${formatCounter(event.mass)}). Score ${event.score}.`,
  rotation: (event, name) =>
    `Rotation : ${SLOTS.map((slot) => `${slotLabel(slot)} ${event.triangle[slot] === null ? "vide" : marbleLabel(event.triangle[slot].marble, name)}`).join(", ")}.`,
  turnEnded: (event) => `Fin du tour ${event.turn}.`,
  gameOver: (event) => `Fin de partie, score ${event.score}.`,
  statusGained: (event) => `Statut reçu : ${event.status}, intensité ${event.intensity}, reste ${event.remaining ?? "toute la partie"}${event.pending ? ", en attente" : ""}.`,
  statusStrengthened: (event) => `Statut renforcé : ${event.status}, intensité ${event.intensity}, reste ${event.remaining ?? "toute la partie"}${event.pending ? ", en attente" : ""}.`,
  statusUnchanged: (event) => `Statut déjà là, sans effet : ${event.status}.`,
  statusActivated: (event) => `Statut activé : ${event.status}.`,
  statusCharge: (event) => `Charge utilisée : ${event.status}, reste ${event.remaining}.`,
  statusExpired: (event) => `Fin du statut : ${event.status}.`,
  statusReaction: (event) => `Réaction du statut ${event.status}, à ${event.counter}.`,
  valueModified: (event) => `Valeur modifiée (${event.point}) : ${event.before} -> ${event.after}, par ${(event.contributions ?? []).map((step) => `${step.status} (${step.before} -> ${step.after})`).join(", ")}.`,
};

// Un évènement du journal en une ligne. Un type inconnu (ajouté depuis) se lit
// en JSON plutôt que de lever : l'outil reste utilisable.
export function formatEvent(event, name) {
  const line = EVENT_LINES[event.type];
  return line ? line(event, name) : `${event.type} : ${JSON.stringify(event)}`;
}
