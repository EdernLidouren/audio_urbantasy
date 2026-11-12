// Jeu des billes, ce qui se dit : les STATUTS de la partie (marbles/core/statuses.js).
// Leur étiquette (nom, intensité s'il le faut, ce qui leur reste), le résumé de la
// touche A, la fiche d'un statut dans le menu Maj+A (effet, ce qui reste, origine),
// ses comportements et son origine en mots, et les lignes de l'aide E qui décrivent
// les statuts qu'une bille applique. Pur. Point d'entrée et vue d'ensemble :
// marbles/view/narration.js.

import { nameRef } from "../../../data/i18n/index.js";
import { assembleCard, validateCardModel } from "../../../lib/detail-card.js";
import { STATUS_CARD_MODEL } from "../../config/values.js";
import { MODIFIER_POINTS, definitionOf } from "../../core/statuses.js";
import { combined, describePrinted, effectMoment, formatCounter, statusName } from "./effects.js";

validateCardModel(STATUS_CARD_MODEL);

// Un nombre signé, « +2 », « −1 » (le vrai signe moins, formatCounter).
function signed(value) {
  return value > 0 ? `+${value}` : formatCounter(value);
}

// CE QUI RESTE à une instance (`remaining`, `pending`), selon la sorte de sa durée
// (`kind`) : « ce tour » (le dernier tour), « 3 tours », « à partir du prochain tour »
// (en attente ; « à partir du prochain tour, 2 tours » s'il en couvre plusieurs),
// « toute la partie », « 1 charge ».
export function remainingText({ remaining, pending }, kind, t) {
  if (kind === "game") return t("marbles.statuses.duration.game");
  if (kind === "charges") return t("marbles.statuses.duration.charges", { count: remaining });
  if (pending) return remaining > 1 ? t("marbles.statuses.remaining.pending_turns", { count: remaining }) : t("marbles.statuses.remaining.pending");
  return remaining === 1 ? t("marbles.statuses.duration.turn") : t("marbles.statuses.duration.turns", { count: remaining });
}

// L'ÉTIQUETTE d'une instance : « amorti, intensité 2, 3 tours », « lancer
// supplémentaire, à partir du prochain tour ». L'intensité ne se dit que pour un statut
// qui se cumule en intensité, au-delà de 1. `kind`, `stacking` : ceux de sa définition.
export function statusLabel(instance, { kind, stacking }, t) {
  const params = { status: statusName(instance.status, t), duration: remainingText(instance, kind, t) };
  if (stacking === "intensity" && instance.intensity > 1) return t("marbles.statuses.label_intensity", { ...params, intensity: instance.intensity });
  return t("marbles.statuses.label", params);
}

// L'étiquette d'une instance de la partie, d'après la table des statuts des règles.
export function instanceLabel(instance, rules, t) {
  const definition = definitionOf(rules.statuses, instance.status);
  return statusLabel(instance, { kind: definition.duration.kind, stacking: definition.stacking }, t);
}

// La touche A : « 2 statuts : amorti, intensité 2, 3 tours. Lancer supplémentaire, à
// partir du prochain tour. », dans l'ordre d'acquisition, ou « Aucun statut. ».
export function describeStatuses(game, rules, t) {
  const labels = game.statuses.map((instance) => instanceLabel(instance, rules, t));
  if (labels.length === 0) return t("marbles.statuses.none");
  const [first, ...rest] = labels;
  return [t("marbles.statuses.summary", { count: labels.length, first }), ...rest.map((label) => t("marbles.statuses.item", { status: label }))].join(" ");
}

// Les COMPORTEMENTS d'une définition, à l'intensité donnée : « lancers +2 », « pertes de
// Vitesse, −1 », « gains de Vitesse ×2 », « Polissages +1 », « usure de phase ×0 »,
// « à chaque chiquenaude : Vitesse +2 ».
const BEHAVIOR_TEXTS = {
  stat: (behavior, intensity, t) => t(`marbles.statuses.behavior.stat.${behavior.stat}`, { amount: signed(behavior.amount * intensity) }),
  // Une addition sur un gain ou une perte garde sa virgule (« pertes de Vitesse,
  // −1 » : la perte n'est pas négative) ; sur une quantité, aucune (« Polissages +1 »).
  modifier: (behavior, intensity, t) => {
    const point = t(`marbles.statuses.point.${behavior.point}`);
    if (behavior.operation === "add") {
      const key = MODIFIER_POINTS[behavior.point].nature === "signed" ? "marbles.statuses.behavior.add" : "marbles.statuses.behavior.add_quantity";
      return t(key, { point, value: signed(behavior.value * intensity) });
    }
    return t("marbles.statuses.behavior.multiply", { point, value: behavior.value ** intensity });
  },
  // Une réaction, que l'intensité ne module pas.
  reaction: (behavior, intensity, t, statuses) =>
    t("marbles.statuses.behavior.reaction", { occurrence: t(`marbles.tally.${behavior.on}.each`), effect: describePrinted(behavior.effect, null, t, statuses) }),
};

function behaviorsText(definition, intensity, t, statuses) {
  return combined(
    definition.behaviors.map((behavior) => BEHAVIOR_TEXTS[behavior.type](behavior, intensity, t, statuses)),
    t
  );
}

// L'ORIGINE d'une instance, l'effet qui l'a donnée (`origin`, son `by`), dite comme le
// moment d'un effet (effectMoment) : « Tic d'argile », « base gauche, tigrée », « Final
// de tigrée », « Entrée au pot d'agate », « Pot, mica », ou le statut qui l'a donnée par
// sa réaction.
const ORIGIN_KEYS = {
  status: "marbles.statuses.origin.status",
  phase: "marbles.statuses.origin.phase",
  potEntry: "marbles.statuses.origin.pot_entry",
  pot: "marbles.statuses.origin.pot",
  hit: "marbles.statuses.origin.hit",
  trigger: "marbles.statuses.origin.trigger",
};

export function originText(origin, t) {
  if (origin === null) return t("marbles.statuses.origin.none");
  const { kind, params } = effectMoment(origin, t);
  return t(ORIGIN_KEYS[kind], params);
}

// LA FICHE d'une instance (STATUS_CARD_MODEL) : `main`, son annonce principale ; ses
// champs, son effet à son intensité, ce qui lui reste, son origine.
const STATUS_FIELDS = {
  effect: (instance, definition, rules, t) => t("marbles.statuses.card.effect", { effect: behaviorsText(definition, instance.intensity, t, rules.statuses) }),
  remaining: (instance, definition, rules, t) => t("marbles.statuses.card.remaining", { duration: remainingText(instance, definition.duration.kind, t) }),
  origin: (instance, definition, rules, t) => t("marbles.statuses.card.origin", { origin: originText(instance.origin, t) }),
};

export function statusCard(instance, main, rules, t) {
  const definition = definitionOf(rules.statuses, instance.status);
  return assembleCard(STATUS_CARD_MODEL, { main, readField: (entry) => STATUS_FIELDS[entry.field](instance, definition, rules, t), t });
}

// La ligne d'aide d'un statut : « Statut amorti : les pertes de Vitesse… ». Nom et
// description en références (la ligne se rend dans la langue du moment).
export function statusHelpLine(status) {
  return { key: "marbles.statuses.help_line", params: { status: nameRef(`marbles.status.${status}.name`), description: nameRef(`marbles.status.${status}.description`) } };
}
