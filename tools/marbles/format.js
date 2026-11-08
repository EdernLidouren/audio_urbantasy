// BOÎTE À OUTILS DES BILLES — l'AFFICHAGE LISIBLE d'un état et d'un journal
// (core/marbles.js), pour le terminal : des phrases courtes, une ligne par
// élément, jamais de tableau semi-graphique, pour qu'un lecteur d'écran les lise
// d'un trait. Pur, sans Node. Les identifiants restent visibles à côté des noms :
// ce sont eux qu'on écrit dans un cas construit ou un sac.
//
// `name(id)` : le nom d'une bille ; par défaut son id. Les lanceurs passent le nom
// français (data/i18n), les vérifications l'id.

import { SLOTS, maxWearOf } from "../../core/marbles.js";
import { formatCounter } from "../../view/marbles/narration.js";
import MARBLE_TYPES from "../../marbles/types/index.js";

const SLOT_NAMES = { leftBase: "base gauche", rightBase: "base droite", apex: "pointe" };
const CAUSES = { replacement: "remplacement", wear: "usure" };
const TRIGGERS = { phase: "Effet de phase", hit: "Effet de tic", knockout: "Effet d'éjection" };

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

// Un emplacement : « base gauche : argile (clay), usure 1 sur 3, bonus Vitesse +4. »
function slotLine(state, slot, name) {
  const placed = state.triangle[slot];
  if (placed === null) return `${slotLabel(slot)} : vide.`;
  let line = `${slotLabel(slot)} : ${marbleLabel(placed.marble, name)}, usure ${placed.wear} sur ${maxWearOf(placed.marble, MARBLE_TYPES)}`;
  if (placed.bonus) line += `, bonus Vitesse ${signed(placed.bonus.speed)} et Masse ${signed(placed.bonus.mass)}`;
  return `${line}.`;
}

// L'état entier, une ligne par élément. Le sac se lit du haut (prochaine pioche)
// vers le bas : c'est un outil de test, il voit ce que le joueur ne voit pas.
export function formatState(state, name) {
  const yesNo = (value) => (value ? "oui" : "non");
  const lines = [
    `Tour ${state.turn} sur ${state.turnCount}, étape ${state.stage}${state.endReason ? `, fin : ${state.endReason}` : ""}.`,
    `Score ${state.score}. Vitesse ${formatCounter(state.speed)}, Masse ${formatCounter(state.mass)}.`,
    `Échange utilisé : ${yesNo(state.swapUsed)}. Pose faite ce tour : ${yesNo(state.hasPlaced)}.`,
    ...SLOTS.map((slot) => slotLine(state, slot, name)),
    `Main, ${state.hand.length} sur ${state.maxHandSize} : ${listOf(state.hand, name)}.`,
    `Sac, ${state.bag.length}, du haut vers le bas : ${listOf(state.bag, name)}.`,
    `Défausse, ${state.discard.length} : ${listOf(state.discard, name)}.`,
    `Pioche : ${state.firstTurnDraw} au premier tour, ${state.drawPerTurn} ensuite.`,
  ];
  return lines;
}

function effectLine(event, name) {
  let line = `${TRIGGERS[event.trigger] ?? `Effet ${event.trigger}`}, ${marbleLabel(event.marble, name)} en ${slotLabel(event.slot)} : Vitesse ${signed(event.speedDelta)}, Masse ${signed(event.massDelta)}`;
  for (const gift of event.given ?? []) {
    line += `, donne Vitesse ${signed(gift.speed)} et Masse ${signed(gift.mass)} à ${slotLabel(gift.slot)}`;
  }
  return `${line} ; compteurs Vitesse ${formatCounter(event.speed)}, Masse ${formatCounter(event.mass)}.`;
}

const EVENT_LINES = {
  turnStarted: (event) => `Début du tour ${event.turn} sur ${event.turnCount}.`,
  draw: (event, name) => `Pioche : ${marbleLabel(event.marble, name)}.`,
  drawSkipped: (event) => `Pioche sautée (${event.reason}).`,
  bagRegenerated: (event) => `Sac régénéré depuis la défausse : ${event.size} billes.`,
  swapped: (event) => `Échange : ${slotLabel(event.a)} et ${slotLabel(event.b)}.`,
  knockout: (event, name) => `Éjection : ${marbleLabel(event.marble, name)} en ${slotLabel(event.slot)}.`,
  removed: (event, name) => `Retrait : ${marbleLabel(event.marble, name)}, ${slotLabel(event.slot)} (${CAUSES[event.cause] ?? event.cause}).`,
  discarded: (event, name) => `Défausse : ${marbleLabel(event.marble, name)} (${CAUSES[event.cause] ?? event.cause}).`,
  placed: (event, name) => `Pose : ${marbleLabel(event.marble, name)} en ${slotLabel(event.slot)}.`,
  hit: (event, name) => `Tic : ${marbleLabel(event.marble, name)} en ${slotLabel(event.slot)}.`,
  phase: (event, name) => `Phase de ${slotLabel(event.slot)} : ${marbleLabel(event.marble, name)}.`,
  phaseSkipped: (event) => `Phase de ${slotLabel(event.slot)} : vide.`,
  effect: (event, name) => effectLine(event, name),
  wear: (event, name) => `Usure : ${marbleLabel(event.marble, name)}, ${event.wear} sur ${event.maxWear}.`,
  impact: (event) => `Impact ${event.impact} (Vitesse ${formatCounter(event.speed)}, Masse ${formatCounter(event.mass)}). Score ${event.score}.`,
  rotation: (event, name) =>
    `Rotation : ${SLOTS.map((slot) => `${slotLabel(slot)} ${event.triangle[slot] === null ? "vide" : marbleLabel(event.triangle[slot].marble, name)}`).join(", ")}.`,
  turnEnded: (event) => `Fin du tour ${event.turn}.`,
  gameOver: (event) => `Fin de partie (${event.reason}), score ${event.score}.`,
};

// Un évènement du journal en une ligne. Un type inconnu (ajouté depuis) se lit
// en JSON plutôt que de lever : l'outil reste utilisable.
export function formatEvent(event, name) {
  const line = EVENT_LINES[event.type];
  return line ? line(event, name) : `${event.type} : ${JSON.stringify(event)}`;
}
