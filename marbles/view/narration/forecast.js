// Jeu des billes, ce qui se dit : la PRÉVISION ET LA CONFIRMATION. Les lignes de la
// confirmation d'une pose (placementLines) et la vue d'ensemble du tour, touche R
// (describeOverview), lues dans la prévision (marbles/core/forecast.js, par
// rules.forecast) : emplacements, régénérations et leurs Trouvailles, pot,
// incertitudes. Pur. Point d'entrée et vue d'ensemble : marbles/view/narration.js.

import { nameRef } from "../../../data/i18n/index.js";
import { MARBLE_POCKET, MARBLE_TRIGGERS } from "../../config/values.js";
import { SLOTS } from "../../core/marbles.js";
import { describeEffect, describeOutcome, formatCounter, marbleName, outcomeLine, slotName } from "./effects.js";

// La ligne des valeurs prévues d'une pose : celles de la phase de la bille posée,
// puis ce qui s'y ajoute avec son emplacement (son Final, si elle s'use ce tour) :
// « Vitesse +6. Final : Pioche 1. ».
function placedValues(predicted, slot, t) {
  // Retirée avant sa phase (une Fêlure de son Tic) : elle n'a pas de valeurs.
  if (predicted.phases[slot] === null) return forecastSlotLine(predicted, slot, t);
  const values = describeEffect(predicted.phases[slot], t);
  const notes = slotNotes(predicted, slot, t);
  return notes.length === 0 ? values : [`${values}.`, ...notes].join(" ");
}

// Les déclencheurs qui ont leur ligne dans la confirmation (marbles/config/values.js/
// MARBLE_TRIGGERS), dans l'ordre réel de leurs évènements.
const PLACEMENT_LINES = MARBLE_TRIGGERS.filter((trigger) => trigger.forecast.line === "placement").sort((a, b) => a.forecast.order - b.forecast.order);

// Les lignes de lecture d'une confirmation de pose, chacune { key, params } : la
// question, puis, sur sa propre ligne, ce que la bille produirait à sa phase sur le
// triangle simulé, au format de la vue d'ensemble (valeurs produites seulement, bonus
// reçus compris, ni texte d'effet ni bonus donné : celui-là s'entend chez qui le
// reçoit) ; puis une ligne par déclencheur de la pose, dans l'ordre réel des
// évènements, toujours présentes, « aucun effet » s'il n'y en a pas : la Chiquenaude,
// puis, sur un emplacement occupé, Éjection et Tic (ceux-là disent « aucun effet »
// si la Chiquenaude vide l'emplacement) ; le menu garde la même structure. Enfin, si
// la pose et la résolution régénéreraient le sac, une ligne par régénération, chacune
// suivie d'une ligne par Trouvaille qu'elle déclencherait (regenerationLines) ;
// « Éveils possibles. » si la prévision est incertaine (uncertainLines) ; enfin, juste
// avant « Annuler », toujours, les réactions du pot que la pose provoquerait
// (potReactionLine). La pose doit être permise (placeRefusal).
export function placementLines(game, handIndex, slot, rules, t) {
  const { marble } = game.hand[handIndex];
  const predicted = rules.forecast(game, { type: "place", handIndex, slot });
  const lines = [
    { key: "marbles.place.question", params: { marble: marbleName(marble, t), slot: slotName(slot, t) } },
    { key: "marbles.place.values", params: { effect: placedValues(predicted, slot, t) } },
  ];
  const occupant = game.triangle[slot];
  const concerned = { occupant: occupant?.marble, placed: marble };
  for (const trigger of PLACEMENT_LINES) {
    // Un déclencheur de remplacement n'a sa ligne que s'il y a une occupante.
    if (trigger.replacement === true && occupant === null) continue;
    lines.push({
      key: trigger.texts.placement,
      params: { marble: nameRef(`marble.${concerned[trigger.forecast.marble]}.name`), effect: describeOutcome(predicted[trigger.id], t) },
    });
  }
  return [...lines, ...regenerationLines(predicted, t), ...uncertainLines(predicted), potReactionLine(predicted, t)];
}

// Les gabarits des déclencheurs prévus avec un emplacement (MARBLE_TRIGGERS,
// forecast.line "slot", `texts.slot`).
const SLOT_TEMPLATES = Object.fromEntries(
  MARBLE_TRIGGERS.filter((trigger) => trigger.forecast.line === "slot").map((trigger) => [trigger.id, trigger.texts.slot])
);

// Un emplacement dans la prévision : sa bille et son effet de phase, ou la bille
// retirée avant sa phase (« pointe, porcelaine : retirée avant sa phase. »), suivis de
// ce que la prévision y ajoute (son Final).
function forecastSlotLine(predicted, slot, t) {
  const notes = slotNotes(predicted, slot, t);
  const cleared = predicted.cleared[slot];
  if (predicted.phases[slot] === null && cleared !== null) {
    return [t("marbles.outcome.removed", { slot: slotName(slot, t), marble: nameRef(`marble.${cleared}.name`) }), ...notes].join(" ");
  }
  return outcomeLine(slot, predicted.phases[slot], t, notes);
}

// Ce que la prévision ajoute à un emplacement après l'effet de phase de sa bille :
// « Final : Vitesse +4. » si elle atteint son usure maximale ce tour. Les valeurs
// produites seulement, comme une phase.
function slotNotes(predicted, slot, t) {
  return predicted.slotEffects[slot].map((effect) => t(SLOT_TEMPLATES[effect.trigger], { effect: describeEffect(effect, t) }));
}

// Les gabarits des déclencheurs prévus avec une régénération (MARBLE_TRIGGERS,
// forecast.line "regeneration", `texts.regeneration`).
const REGENERATION_TEMPLATES = Object.fromEntries(
  MARBLE_TRIGGERS.filter((trigger) => trigger.forecast.line === "regeneration").map((trigger) => [trigger.id, trigger.texts.regeneration])
);

// Ce que la prévision sait du sac sans le dévoiler, chaque morceau { key, params } :
// CHAQUE régénération en chemin, dans l'ordre, suivie de ce qu'elle déclencherait
// chez les billes actives, chacune nommée (« Trouvaille de tigrée : Vitesse +3. »),
// les valeurs produites seulement ; la deuxième et les suivantes se disent « de
// nouveau ». Une Trouvaille s'entend ainsi avec la régénération qui la déclenche,
// comme dans la séquence. Rien sans régénération. Une ligne de la confirmation, ou
// une phrase de R.
function regenerationLines(predicted, t) {
  return predicted.regenerations.flatMap(({ effects }, index) => [
    { key: index === 0 ? "marbles.forecast.regenerates" : "marbles.forecast.regenerates_again" },
    ...effects.map((effect) => ({
      key: REGENERATION_TEMPLATES[effect.trigger],
      params: { marble: nameRef(`marble.${effect.marble}.name`), effect: describeEffect(effect, t) },
    })),
  ]);
}

// Ce que la prévision ignore ou ne mène pas à terme, à la fin de ce qu'elle dit :
// « Éveils possibles. » quand un Éveil est possible (marbles/core/forecast.js,
// `awakenPossible` : une bille piochée, et une bille qui pouvait l'être a un Éveil) ;
// « Enchaînement interrompu. » si la limite de sécurité arrêterait la chaîne
// (`interrupted`, une anomalie). Rien sinon.
function uncertainLines(predicted) {
  return [
    ...(predicted.awakenPossible ? [{ key: "marbles.forecast.awakenings" }] : []),
    ...(predicted.interrupted ? [{ key: "marbles.forecast.interrupted" }] : []),
  ];
}

// La ligne du pot d'une confirmation : les réactions des billes du pot que la pose
// provoquerait (marbles/core/forecast.js, `potReactions`), par bille dans l'ordre
// d'arrivée, « Pot : tigrée, Vitesse +2 ; grès, Masse +1 », ou « Pot : aucun
// effet ». Toujours présente, le menu garde sa structure.
function potReactionLine(predicted, t) {
  const parts = predicted.potReactions.map((effect) => t("marbles.place.pot_marble", { marble: nameRef(`marble.${effect.marble}.name`), effect: describeEffect(effect, t) }));
  const reactions = parts.length === 0 ? t("marbles.effect.none") : parts.reduce((first, rest) => t("marbles.place.pot_more", { first, rest }));
  return { key: "marbles.place.pot", params: { reactions } };
}

// Les billes du pot qui joueraient quelque chose pendant la résolution (leur effet à
// chaque résolution et leurs réactions, regroupés : `potEffects`), après les trois
// emplacements, dans l'ordre d'arrivée : « Pot, agate : Masse +1. ». Aucune ligne
// pour les autres.
const POT_FORECAST_TEMPLATE = MARBLE_POCKET.moments.find((moment) => moment.texts.forecast !== undefined)?.texts.forecast;

function potLines(predicted, t) {
  return predicted.potEffects.map((effect) => t(POT_FORECAST_TEMPLATE, { marble: nameRef(`marble.${effect.marble}.name`), effect: describeEffect(effect, t) }));
}

function forecastNotes(predicted, t) {
  return [...regenerationLines(predicted, t), ...uncertainLines(predicted)].map(({ key, params }) => t(key, params));
}

// La vue d'ensemble du tour (touche R), d'un bloc : la prévision d'abord, Vitesse et
// Masse comprenant ce que le tour a déjà gagné (Tic, Éjection), l'Impact avec ses
// planchers ; puis chaque emplacement dans l'ordre horaire (une Pioche y est une
// valeur comme une autre, « Pioche 1 ») ; enfin la régénération du sac, si la
// résolution la provoquerait. Le triangle actuel, sans action envisagée. null hors
// de la phase de jeu, où rien ne se prévoit.
export function describeOverview(game, rules, t) {
  const predicted = rules.forecast(game);
  if (!predicted.ok) return null;
  const summary = t("marbles.overview.summary", {
    speed: formatCounter(predicted.speed),
    mass: formatCounter(predicted.mass),
    impact: predicted.impact,
  });
  const slots = SLOTS.map((slot) => forecastSlotLine(predicted, slot, t));
  return [summary, ...slots, ...potLines(predicted, t), ...forecastNotes(predicted, t)].join(" ");
}
