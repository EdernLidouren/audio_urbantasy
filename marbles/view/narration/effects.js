// Jeu des billes, ce qui se dit : le VOCABULAIRE ET LES EFFETS. Les noms (bille,
// emplacement, calibre), les compteurs signés, et LA façon de dire un effet, joué ou
// prévu (describeEffect), imprimé (describePrinted) ou à son emplacement
// (outcomeLine) : actions, cibles, conditions, montants calculés. Les autres modules
// de la narration en sont faits. Pur. Point d'entrée et vue d'ensemble :
// marbles/view/narration.js.

import { nameRef } from "../../../data/i18n/index.js";
import { MARBLE_SIZES } from "../../config/values.js";
import { TALLY_COUNTERS } from "../../core/content.js";
import { emptyTally } from "../../core/tally.js";
import {
  AMOUNT_SOURCES,
  CHOICE_ZONES,
  CLAUSE_ACTIONS,
  CONDITIONS,
  FIRST_IN_HAND,
  LAST_DISCARDED,
  TARGET_FILTERS,
  amountOf,
  isAll,
  isBag,
  isChoice,
} from "../../core/effects.js";

export function marbleName(marble, t) {
  return t(`marble.${marble}.name`);
}

export function slotName(slot, t) {
  return t(`marbles.slot.${slot}`);
}

// Le nom d'un calibre (marbles/config/values.js/MARBLE_SIZES) : « calot ».
export function sizeName(size, t) {
  return t(`marbles.size.${MARBLE_SIZES[size]}.name`);
}

// La référence au nom d'un calibre, pour un gabarit qui en choisit la forme
// (« un calot », « par minibille active »).
function sizeRef(size) {
  return nameRef(`marbles.size.${MARBLE_SIZES[size]}.name`);
}

// Un compteur qui peut être négatif (Vitesse, Masse), avec le vrai signe moins
// (U+2212) : un lecteur d'écran le lit, là où il peut taire un trait d'union, et
// « Vitesse 3 » dirait le contraire. Les gabarits d'effet font de même.
export function formatCounter(value) {
  return String(value).replace("-", "−");
}

// Les textes de chaque action de clause (marbles/core/effects.js/CLAUSE_ACTIONS),
// dans l'ordre où ses valeurs se disent : `up` pour une valeur positive, `down`
// pour une négative (absent : l'action n'en produit jamais, sa validation le
// refuse). Chacun reçoit {amount}, toujours positif.
const ACTION_TEXTS = {
  speed: { up: "marbles.effect.speed_up", down: "marbles.effect.speed_down" },
  mass: { up: "marbles.effect.mass_up", down: "marbles.effect.mass_down" },
  draw: { up: "marbles.effect.draw" },
  polish: { up: "marbles.effect.polish" },
  crack: { up: "marbles.effect.crack" },
  // Sans montant ; son texte dépend de sa cible (actionText) : la bille elle-même
  // (`up`), un emplacement (`slot`, qui reçoit {slot}), la première de la main, une
  // bille au choix (`choice`, qui reçoit {target}).
  pocket: {
    up: "marbles.effect.pocket_self",
    targets: { slot: "marbles.effect.pocket_slot", [FIRST_IN_HAND]: "marbles.effect.pocket_hand", choice: "marbles.effect.pocket_choice" },
  },
  // Sans montant, comme Empocher ; « toutes » (`all`) reçoit {target}, le sac
  // (`bag`) reçoit {count}.
  discard: {
    up: "marbles.effect.discard_self",
    targets: {
      slot: "marbles.effect.discard_slot",
      [FIRST_IN_HAND]: "marbles.effect.discard_hand",
      choice: "marbles.effect.discard_choice",
      all: "marbles.effect.discard_all",
      bag: "marbles.effect.discard_bag",
    },
  },
  // Sans montant ; la bille elle-même, un emplacement, un choix, « toutes ».
  bounce: {
    up: "marbles.effect.bounce_self",
    targets: { slot: "marbles.effect.bounce_slot", choice: "marbles.effect.bounce_choice", all: "marbles.effect.bounce_all" },
  },
  // Sans montant ; jamais la bille elle-même : la dernière arrivée à la défausse, ou
  // un choix.
  retrieve: {
    up: "marbles.effect.retrieve_last",
    targets: { [LAST_DISCARDED]: "marbles.effect.retrieve_last", choice: "marbles.effect.retrieve_choice" },
  },
  // Sans montant, comme Empocher ; « toutes » (`all`) reçoit {target}.
  eject: {
    up: "marbles.effect.eject_self",
    targets: { slot: "marbles.effect.eject_slot", choice: "marbles.effect.eject_choice", all: "marbles.effect.eject_all" },
  },
};

// Le texte de chaque filtre d'une cible « toutes » (marbles/core/effects.js/
// TARGET_FILTERS) : la cible entière qu'il qualifie, { key, params }. « toutes les
// minibilles actives ». Un filtre sans texte échoue au chargement.
const FILTER_TEXTS = {
  size: (filter) => ({ key: "marbles.target.all_size", params: { size: sizeRef(filter.size) } }),
};
for (const type of Object.keys(TARGET_FILTERS)) {
  if (!Object.hasOwn(FILTER_TEXTS, type)) throw new Error(`marbles : le filtre de cible "${type}" doit avoir son texte (FILTER_TEXTS).`);
}

// Ce que dit une cible « toutes » : « toutes les billes actives », ou, filtrée, le
// texte de son filtre (un seul type de filtre existe aujourd'hui : deux filtres
// demanderont une phrase qui les combine).
function allTarget(target, t) {
  const [filter] = target.filters ?? [];
  if (filter === undefined) return t("marbles.target.all");
  const { key, params } = FILTER_TEXTS[filter.type](filter);
  return t(key, params);
}

// Ce que dit une CIBLE AU CHOIX (marbles/core/effects.js, en-tête) : « une bille
// active », « 2 billes de votre main », « jusqu'à 2 billes actives ». `count` : le
// nombre à dire, celui de la cible par défaut (ce qui reste à choisir, sinon). Les
// zones se disent dans l'ordre de leur déclaration (CHOICE_ZONES) : une clé par
// combinaison de zones et par ce qui se vise, `marbles.choice.noun.<zones>_<pick>`.
const ZONE_ORDER = Object.keys(CHOICE_ZONES);

export function choiceTarget(choice, t, count = choice.count, upTo = choice.upTo === true) {
  const zones = ZONE_ORDER.filter((zone) => choice.zones.includes(zone)).join("_");
  const noun = t(`marbles.choice.noun.${zones}_${choice.pick}`, { count });
  return upTo ? t("marbles.choice.up_to", { target: noun }) : noun;
}

// Une action sans texte, ou un texte sans action, échoue au chargement.
for (const action of new Set([...Object.keys(CLAUSE_ACTIONS), ...Object.keys(ACTION_TEXTS)])) {
  if (!Object.hasOwn(CLAUSE_ACTIONS, action) || !Object.hasOwn(ACTION_TEXTS, action)) {
    throw new Error(`marbles : l'action "${action}" doit avoir ses textes (ACTION_TEXTS) et son entrée (CLAUSE_ACTIONS).`);
  }
}

// Les valeurs d'un effet ({ speed, mass }, une absente comptant zéro) -> ses
// morceaux à dire.
export function valueParts(values, t) {
  const parts = [];
  for (const [action, { up, down }] of Object.entries(ACTION_TEXTS)) {
    const value = values[action] ?? 0;
    if (value > 0) parts.push(t(up, { amount: value }));
    if (value < 0) parts.push(t(down, { amount: -value }));
  }
  return parts;
}

// Le texte d'une action sur une bille, sa cible comprise : « Polissage 1 », « Fêlure
// 1 à la pointe ». Une action qui a ses propres textes par cible (Empocher) les dit
// elle-même : « Empocher cette bille », « Empocher la bille en pointe », « Empocher la
// première bille de la main ».
function actionText(action, amount, target, t) {
  const { up, targets } = ACTION_TEXTS[action];
  if (targets !== undefined) {
    if (target === undefined) return t(up);
    if (isChoice(target)) return t(targets.choice, { target: choiceTarget(target, t) });
    if (isAll(target)) return t(targets.all, { target: allTarget(target, t) });
    if (isBag(target)) return t(targets.bag, { count: target.count });
    if (target === FIRST_IN_HAND || target === LAST_DISCARDED) return t(targets[target]);
    return t(targets.slot, { slot: slotName(target, t) });
  }
  const text = t(up, { amount });
  return target === undefined ? text : targetedText(text, target, t);
}

// Un effet dit avec sa cible : un emplacement (« Polissage 1 à la pointe ») ou un
// choix (« Polissage 1 à une bille active au choix », « Polissage 1, jusqu'à 2 billes
// actives au choix » : `upTo` choisit la tournure, jamais « à jusqu'à »).
function targetedText(text, target, t) {
  if (isChoice(target)) return t("marbles.effect.given_choice", { effect: text, target: choiceTarget(target, t), upTo: target.upTo === true ? "yes" : "no" });
  return t("marbles.effect.given", { effect: text, slot: slotName(target, t) });
}

// Les actions sur une bille d'un effet ([{ action, amount?, target? }]) -> leurs
// morceaux. Elles se disent chez la bille qui les produit, jamais chez celle qui les
// reçoit.
function operationParts(operations = [], t) {
  return operations.map(({ action, amount, target }) => actionText(action, amount, target, t));
}

// Tout ce qu'un effet joué ou prévu produit chez sa bille : ses valeurs, puis ses
// actions sur une bille.
function effectParts(effect, t) {
  return [...valueParts(effect, t), ...operationParts(effect.operations, t)];
}

export function combined(parts, t) {
  return parts.length === 0 ? t("marbles.effect.none") : t("marbles.effect.combined", { parts });
}

// Ce qu'un Empocher PRÉVU a déplacé (marbles/core/forecast.js, `pockets`), dit chez la
// bille qui l'a produit : « porcelaine en poche, à l'entrée : Vitesse +10 », « argile
// en poche », « pot plein : argile perdue » ; une bille piochée à l'aveugle reste
// inconnue.
function pocketPart({ marble, lost, entry }, t) {
  if (marble === null) return t(lost ? "marbles.pocket.lost_unknown" : "marbles.pocket.entered_unknown");
  const ref = nameRef(`marble.${marble}.name`);
  if (lost) return t("marbles.pocket.lost", { marble: ref });
  if (entry === null) return t("marbles.pocket.entered", { marble: ref });
  return t("marbles.pocket.entered_effect", { marble: ref, effect: describeEffect(entry, t) });
}

// Une cible vide PRÉVUE (marbles/core/forecast.js, `empty`) : « pointe vide »,
// « main vide », « agate déjà partie », « aucune cible au choix ».
function emptyPart({ slot, target, marble }, t) {
  if (target === FIRST_IN_HAND) return t("marbles.forecast_empty.hand");
  if (target === "choice") return t("marbles.forecast_empty.choice");
  if (target === "all") return t("marbles.forecast_empty.all");
  if (target === "self") return t("marbles.forecast_empty.self", { marble: nameRef(`marble.${marble}.name`) });
  if (target === "bag") return t("marbles.forecast_empty.bag");
  if (target === LAST_DISCARDED) return t("marbles.forecast_empty.discard");
  if (target === "handFull") return t("marbles.forecast_empty.hand_full");
  return t("marbles.forecast_empty.slot", { slot: slotName(slot, t) });
}

// Le texte d'un effet prévu suivi de ses résultats : ses cibles vides, ses choix
// indécis, puis ce que ses Empocher ont déplacé (« Polissage 1 à la pointe, pointe
// vide » ; « Polissage 1 à une bille active au choix, selon votre choix » ; « Empocher
// la bille en pointe, puis porcelaine en poche, à l'entrée : Vitesse +10 »). Un effet
// joué n'en a pas : la séquence les dit à part.
function withResults(text, effect, t) {
  const empty = effect.empty ?? [];
  const withEmptyOnly = empty.length === 0 ? text : t("marbles.forecast_empty.after", { effect: text, empty: t("marbles.effect.combined", { parts: empty.map((target) => emptyPart(target, t)) }) });
  // La prévision ne devine pas le choix du joueur : elle le dit, une fois par effet.
  const withEmpty = (effect.undecided?.length ?? 0) === 0 ? withEmptyOnly : t("marbles.forecast_choice.after", { effect: withEmptyOnly });
  // Ce que l'effet a chassé (Éjecter), puis ce qu'il a empoché, puis défaussé.
  const parts = [
    ...(effect.ejected ?? []).map((ejected) => ejectedPart(ejected, t)),
    ...(effect.pockets ?? []).map((moved) => pocketPart(moved, t)),
    ...(effect.discards ?? []).map((moved) => discardPart(moved, t)),
  ];
  if (parts.length === 0) return withEmpty;
  return t("marbles.pocket.then", { effect: withEmpty, pockets: t("marbles.effect.combined", { parts }) });
}

// Une bille qu'un Défausser PRÉVU a envoyée à la défausse depuis la main ou le sac
// (marbles/core/forecast.js, `discards`), dite chez la bille qui l'a produit, avec
// l'effet de sa Chute : « argile défaussée », « porcelaine défaussée, Chute :
// Vitesse +3 » ; une bille du sac, à l'aveugle, reste inconnue.
function discardPart({ marble, drop }, t) {
  if (marble === null) return t("marbles.discard.discarded_unknown");
  const ref = nameRef(`marble.${marble}.name`);
  if (drop === null) return t("marbles.discard.discarded", { marble: ref });
  return t("marbles.discard.discarded_effect", { marble: ref, effect: describeEffect(drop, t) });
}

// Une bille qu'un Éjecter PRÉVU a chassée (marbles/core/forecast.js, `ejected`), dite
// chez la bille qui l'a produit, avec l'effet de son Éjection : « argile éjectée »,
// « loupe éjectée, Éjection : Vitesse +3 ».
function ejectedPart({ marble, knockout }, t) {
  const ref = nameRef(`marble.${marble}.name`);
  if (knockout === null) return t("marbles.eject.ejected", { marble: ref });
  return t("marbles.eject.ejected_effect", { marble: ref, effect: describeEffect(knockout, t) });
}

// Un effet JOUÉ ou PRÉVU, d'une phrase : { speed, mass, draw, operations, given } ->
// « Vitesse +1 et Masse +2 », « Pioche 1 », « Vitesse +4 à la pointe », « aucun
// effet », puis ses résultats. LA façon de dire un effet, partout (pose, R,
// séquence, fiches) : un don (`given`) se dit chez la bille qui le fait, et la
// bille qui le reçoit le compte dans ses valeurs (sa phase porte le bonus).
export function describeEffect(effect, t) {
  const parts = effectParts(effect, t);
  for (const gift of effect.given ?? []) {
    parts.push(t("marbles.effect.given", { effect: combined(valueParts(gift, t), t), slot: slotName(gift.slot, t) }));
  }
  return withResults(combined(parts, t), effect, t);
}

// Prévu, s'il y en a un (null : rien à prévoir), sinon « aucun effet ».
export function describeOutcome(outcome, t) {
  return outcome === null ? t("marbles.effect.none") : describeEffect(outcome, t);
}

// Le texte de chaque condition (marbles/core/effects.js/CONDITIONS), lu dans une
// fiche après « si » : « si la bille éjectée est plus petite ».
const CONDITION_TEXTS = {
  printedStat: (when, t) =>
    t("marbles.condition.printedStat", {
      slot: slotName(when.slot, t),
      effect: combined(valueParts({ [when.stat]: when.atLeast }, t), t),
    }),
  relativeSize: (when, t) => t("marbles.condition.relativeSize", { marble: when.marble, is: when.is }),
  sizeAt: (when, t) => t("marbles.condition.sizeAt", { slot: slotName(when.slot, t), size: sizeRef(when.size) }),
};

// Une condition sans texte, ou un texte sans condition, échoue au chargement.
for (const type of new Set([...Object.keys(CONDITIONS), ...Object.keys(CONDITION_TEXTS)])) {
  if (!Object.hasOwn(CONDITIONS, type) || !Object.hasOwn(CONDITION_TEXTS, type)) throw new Error(`marbles : la condition "${type}" doit avoir son texte et son entrée.`);
}

// Le texte d'une source de montant calculé, d'après sa déclaration
// (marbles/core/effects.js/AMOUNT_SOURCES) : « Vitesse +1 par tour en main »,
// « Vitesse +1 par minibille active ». `step` : le pas déjà dit.
function sourceText(source, step, t) {
  const { text, params, names } = AMOUNT_SOURCES[source.type];
  const references = Object.fromEntries(Object.entries(names?.(source) ?? {}).map(([param, key]) => [param, nameRef(key)]));
  return t(text, { effect: step, ...(params?.(source) ?? {}), ...references });
}

// Un nombre d'une action signée (Vitesse, Masse : celles qui ont un texte `down`)
// avec son signe, « +5 », « −2 », « 0 » ; celui d'une autre action, tel quel.
function amountNumber(action, value) {
  if (ACTION_TEXTS[action].down === undefined || value === 0) return String(value);
  return value > 0 ? `+${value}` : formatCounter(value);
}

// Un MONTANT CALCULÉ (marbles/core/effects.js, en-tête) : « Vitesse +1 par minibille
// active », « Vitesse +1 par tour en main, maximum +5, actuellement +2 », ou, avec une
// base, « Vitesse +2, +1 par tour en main… ». La valeur actuelle, dans `situation`,
// seulement pour une source qui la connaît hors de tout déclenchement (`current`).
function computedText(action, amount, situation, t) {
  const step = amount.base === 0 ? combined(valueParts({ [action]: amount.step }, t), t) : amountNumber(action, amount.step);
  let text = sourceText(amount.source, step, t);
  if (amount.base !== 0) text = t("marbles.effect.computed_base", { base: combined(valueParts({ [action]: amount.base }, t), t), effect: text });
  if (amount.max !== undefined) text = t("marbles.effect.computed_max", { effect: text, max: amountNumber(action, amount.max) });
  // Sans situation (une fiche hors de toute partie : l'annexe des règles), jamais de
  // valeur actuelle.
  if (!AMOUNT_SOURCES[amount.source.type].current || situation === null) return text;
  return t("marbles.effect.computed_current", { effect: text, current: amountNumber(action, amountOf(amount, situation)) });
}

// La situation d'une bille HORS de tout déclenchement, pour dire la valeur actuelle
// de ses montants calculés : la bille elle-même, avec son compteur de tours en main
// (0 hors de la main), et les valeurs de partie du moment (`tally`, celles de l'état
// de la partie ; à zéro, celles d'une partie neuve, hors de toute partie).
export function cardSituation(marble, turnsInHand = 0, tally = emptyTally(TALLY_COUNTERS)) {
  return { triangle: null, holder: { marble, zone: null, turnsInHand }, replacement: null, tally };
}

// Une clause IMPRIMÉE : ce que la bille promet, son montant calculé (avec sa valeur
// actuelle dans `situation`), sa cible et sa condition comprises. Son action dit sa
// valeur par ses propres textes.
function describeClause(clause, situation, t) {
  // Une action sans montant (Empocher) dit sa cible elle-même.
  if (CLAUSE_ACTIONS[clause.action].amountless) {
    const text = actionText(clause.action, undefined, clause.target, t);
    return clause.when === undefined ? text : t("marbles.effect.conditional", { effect: text, condition: CONDITION_TEXTS[clause.when.type](clause.when, t) });
  }
  let text = Number.isInteger(clause.amount)
    ? combined(valueParts({ [clause.action]: clause.amount }, t), t)
    : computedText(clause.action, clause.amount, situation, t);
  if (clause.target !== undefined) text = targetedText(text, clause.target, t);
  if (clause.when !== undefined) text = t("marbles.effect.conditional", { effect: text, condition: CONDITION_TEXTS[clause.when.type](clause.when, t) });
  return text;
}

// Un effet imprimé : une liste de clauses. `situation` (cardSituation) : où en est la
// bille, pour la valeur actuelle de ses montants calculés.
export function describePrinted(clauses, situation, t) {
  return combined(clauses.map((clause) => describeClause(clause, situation, t)), t);
}

// Ce qu'une bille produit À SON EMPLACEMENT, sur le triangle prévu ou pendant la
// résolution : « base gauche, argile : Vitesse +1. », « base droite, vide. ».
// `outcome` : { marble, speed, mass, given? }, ou null pour un emplacement vide.
// Seules les valeurs effectivement produites se disent, bonus reçu compris, sans
// texte de condition ; ce que la bille donne à une autre se dit aussi chez elle
// (« base gauche, loupe : Vitesse +4 à la pointe. »), comme pendant une pose.
// `notes` : ce qui se prévoit en plus avec cet emplacement (slotNotes), à la suite.
export function outcomeLine(slot, outcome, t, notes = []) {
  if (outcome === null) return t("marbles.outcome.empty", { slot: slotName(slot, t) });
  const line = t("marbles.outcome.slot", {
    slot: slotName(slot, t),
    marble: marbleName(outcome.marble, t),
    effect: describeEffect(outcome, t),
  });
  return [line, ...notes].join(" ");
}
