// Jeu des billes, ce qui se dit : le VOCABULAIRE ET LES EFFETS. Les noms (bille,
// emplacement, calibre), les compteurs signés, et LA façon de dire un effet, joué ou
// prévu (describeEffect), imprimé (describePrinted) ou à son emplacement
// (outcomeLine) : actions, cibles, conditions, montants calculés. Les autres modules
// de la narration en sont faits. Pur. Point d'entrée et vue d'ensemble :
// marbles/view/narration.js.

import { nameRef } from "../../../data/i18n/index.js";
import { MARBLE_POCKET, MARBLE_SIZES, MARBLE_TRIGGERS } from "../../config/values.js";
import { TALLY_COUNTERS } from "../../core/content.js";
import { emptyTally } from "../../core/tally.js";
import { NO_STATUSES, definitionOf, statusApplication } from "../../core/statuses.js";
import { CHOICE_ZONES } from "../../core/zones.js";
import {
  AMOUNT_SOURCES,
  CLAUSE_ACTIONS,
  CONDITIONS,
  FIRST_IN_HAND,
  KNOCKED_OUT,
  LAST_DISCARDED,
  TARGET_FILTERS,
  amountOf,
  isAll,
  isBag,
  isChoice,
  isRelative,
  relativeWord,
  isOptionalChoice,
} from "../../core/effects.js";

export function marbleName(marble, t) {
  return t(`marble.${marble}.name`);
}

// La RÉFÉRENCE au nom d'une bille, pour un gabarit qui en choisit la forme
// (« d'argile », « l'agate », son genre) : jamais un texte déjà traduit.
export function marbleRef(marble) {
  return nameRef(`marble.${marble}.name`);
}

// LE MOMENT D'UN EFFET, celui qui pose un choix ou donne un statut (`by` des
// évènements : { trigger, slot, marble, status? }), pour le dire : { kind, params }.
// `kind` : "status" (la réaction d'un statut, { status }) ; "phase" ({ slot,
// marble }) ; "potEntry" et "pot" (une bille du pot, { marble }) ; "hit" (le Tic, à
// part : en anglais « Hit from gorilla », pas « of ») ; "trigger" (un autre
// déclencheur, { moment, marble }). Chaque usage a ses gabarits par sorte.
const POCKET_ENTRY_TRIGGERS = new Set(MARBLE_POCKET.moments.filter((moment) => moment.event === "pocketed").map((moment) => moment.trigger));
const POCKET_TRIGGERS = new Set(MARBLE_POCKET.moments.map((moment) => moment.trigger));
const TRIGGER_NAMES = Object.fromEntries(MARBLE_TRIGGERS.map((trigger) => [trigger.id, trigger.texts.name]));

export function effectMoment({ trigger, slot, marble, status }, t) {
  if (status !== undefined) return { kind: "status", params: { status: statusName(status, t) } };
  const ref = marbleRef(marble);
  if (trigger === "phase") return { kind: "phase", params: { slot: slotName(slot, t), marble: ref } };
  if (POCKET_ENTRY_TRIGGERS.has(trigger)) return { kind: "potEntry", params: { marble: ref } };
  if (POCKET_TRIGGERS.has(trigger)) return { kind: "pot", params: { marble: ref } };
  if (trigger === "hit") return { kind: "hit", params: { marble: ref } };
  return { kind: "trigger", params: { moment: t(TRIGGER_NAMES[trigger]), marble: ref } };
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
export function sizeRef(size) {
  return nameRef(`marbles.size.${MARBLE_SIZES[size]}.name`);
}

// La référence au nom d'une famille (marbles/config/values.js/MARBLE_FAMILIES) :
// « Brume ».
export function familyRef(family) {
  return nameRef(`marbles.family.${family}.name`);
}

// La référence au nom d'une rareté (marbles/config/values.js/MARBLE_RARITIES), pour
// un gabarit qui en choisit la forme (« rare », « une bille rare », « rares »).
export function rarityRef(rarity) {
  return nameRef(`marbles.rarity.${rarity}.name`);
}

// Les FAMILLES d'une bille, nommées, dans l'ordre de sa déclaration : une liste que
// le gabarit lie (« Trésor et Astres »).
export function familyNames(marble, types, t) {
  return types[marble].families.map((family) => t(`marbles.family.${family}.name`));
}

// Le nom de la rareté d'une bille : « peu commune ».
export function rarityName(marble, types, t) {
  return t(`marbles.rarity.${types[marble].rarity}.name`);
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
// `given` (facultatif) : les tournures d'une action dite par un VERBE suivi de sa
// cible, « Polir de 1 la bille de l'emplacement suivant », au lieu du don d'une
// valeur, « Vitesse +2 à la pointe » (targetedText) ; `self`, la bille elle-même,
// « Polir de 1 cette bille ». Chacune reçoit {effect}, le texte de `up`.
const WEAR_GIVEN = {
  self: "marbles.effect.wear_self",
  slot: "marbles.effect.wear_slot",
  relative: "marbles.effect.wear_relative",
  choice: "marbles.effect.wear_choice",
};
const VALUE_GIVEN = {
  slot: "marbles.effect.given",
  relative: "marbles.effect.given_relative",
  choice: "marbles.effect.given_choice",
};
const ACTION_TEXTS = {
  speed: { up: "marbles.effect.speed_up", down: "marbles.effect.speed_down" },
  mass: { up: "marbles.effect.mass_up", down: "marbles.effect.mass_down" },
  draw: { up: "marbles.effect.draw" },
  polish: { up: "marbles.effect.polish", given: WEAR_GIVEN },
  crack: { up: "marbles.effect.crack", given: WEAR_GIVEN },
  // Sans montant ; son texte dépend de sa cible (actionText) : la bille elle-même
  // (`up`), un emplacement (`slot`, qui reçoit {slot}), la première de la main, une
  // bille au choix (`choice`, qui reçoit {target}).
  pocket: {
    up: "marbles.effect.pocket_self",
    targets: {
      slot: "marbles.effect.pocket_slot",
      relative: "marbles.effect.pocket_relative",
      [FIRST_IN_HAND]: "marbles.effect.pocket_hand",
      [KNOCKED_OUT]: "marbles.effect.pocket_knocked_out",
      choice: "marbles.effect.pocket_choice",
    },
  },
  // Sans montant, comme Empocher ; « toutes » (`all`) reçoit {target}, le sac
  // (`bag`) reçoit {count}.
  discard: {
    up: "marbles.effect.discard_self",
    targets: {
      slot: "marbles.effect.discard_slot",
      relative: "marbles.effect.discard_relative",
      [FIRST_IN_HAND]: "marbles.effect.discard_hand",
      choice: "marbles.effect.discard_choice",
      all: "marbles.effect.discard_all",
      bag: "marbles.effect.discard_bag",
    },
  },
  // Sans montant ; la bille elle-même, un emplacement, un choix, « toutes », la
  // bille éjectée (dans un Tic).
  bounce: {
    up: "marbles.effect.bounce_self",
    targets: {
      slot: "marbles.effect.bounce_slot",
      relative: "marbles.effect.bounce_relative",
      [KNOCKED_OUT]: "marbles.effect.bounce_knocked_out",
      choice: "marbles.effect.bounce_choice",
      all: "marbles.effect.bounce_all",
    },
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
    targets: { slot: "marbles.effect.eject_slot", relative: "marbles.effect.eject_relative", choice: "marbles.effect.eject_choice", all: "marbles.effect.eject_all" },
  },
  // Un statut : son nom, son intensité s'il le faut, sa durée (statusText).
  applyStatus: { up: "marbles.effect.apply_status", intensity: "marbles.effect.apply_status_intensity" },
};

// Le nom d'un statut (marbles/core/statuses.js), en minuscules : « coup de fouet ».
export function statusName(status, t) {
  return t(`marbles.status.${status}.name`);
}

// Une DURÉE de statut, { kind, count? } : « ce tour », « 3 tours », « le prochain
// tour », « toute la partie », « 1 charge ».
function durationText(duration, t) {
  return t(`marbles.statuses.duration.${duration.kind}`, duration.count === undefined ? {} : { count: duration.count });
}

// L'application d'un statut (marbles/core/statuses.js/statusApplication) : « statut
// lancer supplémentaire, le prochain tour », « statut amorti, intensité 2, 3 tours ».
// L'intensité ne se dit que pour un statut qui se cumule en intensité, au-delà de 1.
function statusText({ status, amount, duration, stacking }, t) {
  const params = { status: statusName(status, t), duration: durationText(duration, t) };
  if (stacking === "intensity" && Number.isInteger(amount) && amount > 1) return t(ACTION_TEXTS.applyStatus.intensity, { ...params, intensity: amount });
  return t(ACTION_TEXTS.applyStatus.up, params);
}

// Le texte de chaque filtre d'une cible « toutes » (marbles/core/effects.js/
// TARGET_FILTERS) : la cible entière qu'il qualifie, { key, params }. « toutes les
// minibilles actives ». Un filtre sans texte échoue au chargement.
const FILTER_TEXTS = {
  size: (filter) => ({ key: "marbles.target.all_size", params: { size: sizeRef(filter.size) } }),
  family: (filter) => ({ key: "marbles.target.all_family", params: { family: familyRef(filter.family) } }),
  rarity: (filter) => ({ key: "marbles.target.all_rarity", params: { rarity: rarityRef(filter.rarity) } }),
  marble: (filter) => ({ key: "marbles.target.all_marble", params: { marble: marbleRef(filter.marble) } }),
};
for (const type of Object.keys(TARGET_FILTERS)) {
  if (!Object.hasOwn(FILTER_TEXTS, type)) throw new Error(`marbles : le filtre de cible "${type}" doit avoir son texte (FILTER_TEXTS).`);
}

// Ce que dit une cible « toutes » : « toutes les billes actives », ou, filtrée, le
// texte de son filtre (un seul filtre à la fois aujourd'hui : deux demanderont une
// phrase qui les combine).
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

export function choiceTarget(choice, t, count = choice.count, upTo = isOptionalChoice(choice)) {
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

// Le texte d'une action sur une bille, sa cible comprise : « Polir de 1 cette bille »,
// « Fêler de 1 la bille en pointe ». Une action qui a ses propres textes par cible (Empocher) les dit
// elle-même : « Empocher cette bille », « Empocher la bille en pointe », « Empocher la
// première bille de la main ».
function actionText(action, amount, target, t) {
  const { up, targets } = ACTION_TEXTS[action];
  if (targets !== undefined) {
    if (target === undefined) return t(up);
    if (isChoice(target)) return t(targets.choice, { target: choiceTarget(target, t) });
    if (isAll(target)) return t(targets.all, { target: allTarget(target, t) });
    if (isBag(target)) return t(targets.bag, { count: target.count });
    // Relative : « Éjecter la bille de l'emplacement suivant ».
    if (isRelative(target)) return t(targets.relative, { relative: relativeWord(target) });
    if (target === FIRST_IN_HAND || target === LAST_DISCARDED || target === KNOCKED_OUT) return t(targets[target]);
    return t(targets.slot, { slot: slotName(target, t) });
  }
  return withTarget(t(up, { amount }), action, target, t);
}

// Un texte d'action à montant (`up`) avec sa cible, ou sans cible pour une action qui
// se dit par un verbe (`given.self` : « Polir de 1 cette bille »).
function withTarget(text, action, target, t) {
  if (target !== undefined) return targetedText(text, target, t, ACTION_TEXTS[action].given);
  const self = ACTION_TEXTS[action].given?.self;
  return self === undefined ? text : t(self, { effect: text });
}

// Un effet dit avec sa cible : un emplacement (« Vitesse +2 à la pointe ») ou un
// choix (« Vitesse +2 à une bille active au choix », « Vitesse +2, jusqu'à 2 billes
// actives au choix » : un choix facultatif choisit la tournure, jamais « à
// jusqu'à »). Une action dite par un verbe a ses propres tournures (`given`) :
// « Polir de 1 la bille en pointe ».
function targetedText(text, target, t, given = VALUE_GIVEN) {
  // Relative : « Vitesse +2 à la bille de l'emplacement suivant ».
  if (isRelative(target)) return t(given.relative, { effect: text, relative: relativeWord(target) });
  if (isChoice(target)) return t(given.choice, { effect: text, target: choiceTarget(target, t), upTo: isOptionalChoice(target) ? "yes" : "no" });
  return t(given.slot, { effect: text, slot: slotName(target, t) });
}

// Les actions sur une bille d'un effet ([{ action, amount?, target? }]) -> leurs
// morceaux. Elles se disent chez la bille qui les produit, jamais chez celle qui les
// reçoit.
function operationParts(operations = [], t) {
  return operations.map((operation) =>
    CLAUSE_ACTIONS[operation.action].kind === "status" ? statusText(operation, t) : actionText(operation.action, operation.amount, operation.target, t)
  );
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
// en poche », « le pot déborde : argile perdue », sa Perte comprise (« …, Perte :
// Vitesse +2 ») ; une bille piochée à l'aveugle reste inconnue.
function pocketPart({ marble, lost, entry, loss = null }, t) {
  if (marble === null) return t(lost ? "marbles.pocket.lost_unknown" : "marbles.pocket.entered_unknown");
  const ref = marbleRef(marble);
  if (lost) return loss === null ? t("marbles.pocket.lost", { marble: ref }) : t("marbles.pocket.lost_effect", { marble: ref, effect: describeEffect(loss, t) });
  if (entry === null) return t("marbles.pocket.entered", { marble: ref });
  return t("marbles.pocket.entered_effect", { marble: ref, effect: describeEffect(entry, t) });
}

// Une cible vide PRÉVUE (marbles/core/forecast.js, `empty`) : « pointe vide »,
// « main vide », « agate déjà partie », « aucune cible au choix ».
function emptyPart({ slot, target, marble }, t) {
  if (target === FIRST_IN_HAND) return t("marbles.forecast_empty.hand");
  if (target === "choice") return t("marbles.forecast_empty.choice");
  if (target === "all") return t("marbles.forecast_empty.all");
  if (target === "self") return t("marbles.forecast_empty.self", { marble: marbleRef(marble) });
  if (target === "bag") return t("marbles.forecast_empty.bag");
  if (target === LAST_DISCARDED) return t("marbles.forecast_empty.discard");
  if (target === KNOCKED_OUT) return t("marbles.forecast_empty.knocked_out");
  if (target === "handFull") return t("marbles.forecast_empty.hand_full");
  if (target === "noReference") return t("marbles.forecast_empty.no_reference");
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
  const ref = marbleRef(marble);
  if (drop === null) return t("marbles.discard.discarded", { marble: ref });
  return t("marbles.discard.discarded_effect", { marble: ref, effect: describeEffect(drop, t) });
}

// Une bille qu'un Éjecter PRÉVU a chassée (marbles/core/forecast.js, `ejected`), dite
// chez la bille qui l'a produit, avec l'effet de son Éjection : « argile éjectée »,
// « loupe éjectée, Éjection : Vitesse +3 ».
function ejectedPart({ marble, knockout }, t) {
  const ref = marbleRef(marble);
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
// Une condition niée (`not`, marbles/core/effects.js/conditionHolds) : le
// paramètre `not` de son gabarit, "yes" ou "no".
const negation = (when) => (when.not === true ? "yes" : "no");

// Une borne de comparaison (`atLeast`, `atMost`) : { bound, count }.
const boundParams = (when) => (when.atLeast !== undefined ? { bound: "atLeast", count: when.atLeast } : { bound: "atMost", count: when.atMost });

// Le texte d'une condition « count » par sorte de source (AMOUNT_SOURCES) :
// « vous avez au plus 3 billes en main », « le pot compte au moins 3 abeilles ».
// Une source sans texte échoue au chargement. Le nom compté se dit avec son nombre
// (`marbles.condition.count.noun`, un par sorte de filtre).
const COUNT_TEXTS = {
  zoneCount: (source, bound, t) => {
    const [filter] = source.filters ?? [];
    const names = filter === undefined ? {} : FILTER_REFS[filter.type](filter);
    const noun = t(`marbles.condition.count.noun${filter === undefined ? "" : `_${filter.type}`}`, { count: bound.count, ...names });
    if (source.zones !== undefined) return t("marbles.condition.count.zones", { bound: bound.bound, noun, ...sourceParams(source, t) });
    return t(`marbles.condition.count.zone.${source.zone}`, { bound: bound.bound, noun });
  },
  familyCount: (source, bound, t) =>
    source.zones === undefined ? t("marbles.condition.count.families", bound) : t("marbles.condition.count.families_zones", { ...bound, ...sourceParams(source, t) }),
  stat: (source, bound, t) => t("marbles.condition.count.stat", { ...bound, stat: source.stat }),
  otherBase: (source, bound, t) => t("marbles.condition.count.other_base", { bound: bound.bound, value: combined(valueParts({ [source.stat]: bound.count }, t), t) }),
  wear: (source, bound, t) => t(source.remaining === true ? "marbles.condition.count.wear_remaining" : "marbles.condition.count.wear", { ...bound, marble: source.marble ?? "self" }),
  turnsOnTriangle: (source, bound, t) => t("marbles.condition.count.turns_on_triangle", bound),
  tally: (source, bound, t) =>
    t("marbles.condition.count.tally", {
      ...bound,
      scope: source.scope,
      unit: nameRef(`marbles.tally.${source.tally}.unit`),
      name: nameRef(`marbles.tally.${source.tally}.name`),
    }),
  turnsInHand: (source, bound, t) => t("marbles.condition.count.turns_in_hand", bound),
};
for (const type of new Set([...Object.keys(AMOUNT_SOURCES), ...Object.keys(COUNT_TEXTS)])) {
  if (!Object.hasOwn(AMOUNT_SOURCES, type) || !Object.hasOwn(COUNT_TEXTS, type)) throw new Error(`marbles : la source "${type}" doit avoir son texte de condition (COUNT_TEXTS).`);
}

// Les références de nom d'un filtre, pour un nom compté.
const FILTER_REFS = {
  size: (filter) => ({ size: sizeRef(filter.size) }),
  family: (filter) => ({ family: familyRef(filter.family) }),
  rarity: (filter) => ({ rarity: rarityRef(filter.rarity) }),
  marble: (filter) => ({ marble: marbleRef(filter.marble) }),
};
for (const type of Object.keys(TARGET_FILTERS)) {
  if (!Object.hasOwn(FILTER_REFS, type)) throw new Error(`marbles : le filtre "${type}" doit avoir ses références de nom (FILTER_REFS).`);
}

// Le texte d'une condition qui lit un emplacement, fixe (`<clé>`, {slot}) ou relatif
// (`<clé>_relative`, {relative}).
function slotConditionText(key, when, params, t) {
  if (isRelative(when.slot)) return t(`${key}_relative`, { relative: relativeWord(when.slot), ...params });
  return t(key, { slot: slotName(when.slot, t), ...params });
}

const CONDITION_TEXTS = {
  printedStat: (when, t) => {
    const effect = combined(valueParts({ [when.stat]: when.atLeast }, t), t);
    if (when.slot === KNOCKED_OUT) return t("marbles.condition.printedStat_knocked_out", { effect });
    if (isRelative(when.slot)) return t("marbles.condition.printedStat_relative", { relative: relativeWord(when.slot), effect });
    return t("marbles.condition.printedStat", { slot: slotName(when.slot, t), effect });
  },
  relativeSize: (when, t) => t("marbles.condition.relativeSize", { marble: when.marble, is: when.is }),
  concerned: (when, t) => t(`marbles.condition.concerned.${when.is}`),
  sizeAt: (when, t) => slotConditionText("marbles.condition.sizeAt", when, { size: sizeRef(when.size), not: negation(when) }, t),
  // L'état d'une zone : un texte par zone et par état déclaré.
  zone: (when, t) => t(`marbles.condition.zone.${when.zone}.${when.state}`),
  familyAt: (when, t) => slotConditionText("marbles.condition.familyAt", when, { family: familyRef(when.family), not: negation(when) }, t),
  rarityAt: (when, t) => slotConditionText("marbles.condition.rarityAt", when, { rarity: rarityRef(when.rarity), not: negation(when) }, t),
  marbleAt: (when, t) => slotConditionText("marbles.condition.marbleAt", when, { marble: marbleRef(when.marble), not: negation(when) }, t),
  slotIs: (when, t) => slotConditionText("marbles.condition.slotIs", when, { state: when.state }, t),
  replacementSize: (when, t) => t("marbles.condition.replacementSize", { marble: when.marble, size: sizeRef(when.size), not: negation(when) }),
  count: (when, t) => COUNT_TEXTS[when.source.type](when.source, boundParams(when), t),
  // Toutes : chacune dite, liées en liste (« … et … »).
  all: (when, t) => t("marbles.condition.all", { conditions: when.conditions.map((condition) => CONDITION_TEXTS[condition.type](condition, t)) }),
  stat: (when, t) => {
    const { bound, count } = boundParams(when);
    return t("marbles.condition.stat", { stat: when.stat, bound, value: formatCounter(count) });
  },
};

// Une condition sans texte, ou un texte sans condition, échoue au chargement.
for (const type of new Set([...Object.keys(CONDITIONS), ...Object.keys(CONDITION_TEXTS)])) {
  if (!Object.hasOwn(CONDITIONS, type) || !Object.hasOwn(CONDITION_TEXTS, type)) throw new Error(`marbles : la condition "${type}" doit avoir son texte et son entrée.`);
}

// Le texte d'une source de montant calculé, d'après sa déclaration
// (marbles/core/effects.js/AMOUNT_SOURCES) : « Vitesse +1 par tour en main »,
// « Vitesse +1 par minibille active ». `step` : le pas déjà dit.
function sourceText(source, step, t) {
  const { text, params } = AMOUNT_SOURCES[source.type];
  return t(typeof text === "function" ? text(source) : text, { effect: step, ...sourceParams(source, t) });
}

// Les paramètres de texte d'une source : ses valeurs (`params`), ses noms (`names`,
// des références de nom) et ses listes (`lists`, des textes traduits, dits en liste).
function sourceParams(source, t) {
  const { params, names, lists } = AMOUNT_SOURCES[source.type];
  const references = Object.fromEntries(Object.entries(names?.(source) ?? {}).map(([param, key]) => [param, nameRef(key)]));
  const listed = Object.fromEntries(Object.entries(lists?.(source) ?? {}).map(([param, keys]) => [param, keys.map((key) => t(key))]));
  return { ...(params?.(source) ?? {}), ...references, ...listed };
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
  // Prise telle quelle (base 0, pas 1), une source qui le dit à sa façon : « Vitesse
  // égale à la Vitesse du tour ».
  const { wholeText } = AMOUNT_SOURCES[amount.source.type];
  if (wholeText !== undefined && amount.base === 0 && amount.step === 1) return finishComputed(action, amount, t(wholeText, { action, ...sourceParams(amount.source, t) }), situation, t);
  const step = amount.base === 0 ? combined(valueParts({ [action]: amount.step }, t), t) : amountNumber(action, amount.step);
  let text = sourceText(amount.source, step, t);
  if (amount.base !== 0) text = t("marbles.effect.computed_base", { base: combined(valueParts({ [action]: amount.base }, t), t), effect: text });
  return finishComputed(action, amount, text, situation, t);
}

// La fin d'un montant calculé : son maximum, puis sa valeur actuelle s'il y a lieu.
function finishComputed(action, amount, said, situation, t) {
  let text = said;
  if (amount.max !== undefined) text = t("marbles.effect.computed_max", { effect: text, max: amountNumber(action, amount.max) });
  // Sans situation (une fiche hors de toute partie : l'annexe des règles), jamais de
  // valeur actuelle.
  const { current, needsState } = AMOUNT_SOURCES[amount.source.type];
  if (!current || situation === null || (needsState && !situation.state)) return text;
  return t("marbles.effect.computed_current", { effect: text, current: amountNumber(action, amountOf(amount, situation, situation.types)) });
}

// La situation d'une bille HORS de tout déclenchement, pour dire la valeur actuelle
// de ses montants calculés : la bille elle-même, avec son compteur de tours en main
// (0 hors de la main), les valeurs de partie du moment (`tally`, celles de l'état
// de la partie ; à zéro, celles d'une partie neuve, hors de toute partie), l'état
// de la partie en cours (`state`, d'où se comptent les zones ; null hors de toute
// partie : le nombre de billes d'une zone n'a alors pas de valeur actuelle) et la
// table des billes (`types`, que lisent les filtres et les familles d'un compte).
export function cardSituation(marble, turnsInHand = 0, tally = emptyTally(TALLY_COUNTERS), state = null, types = null) {
  return { triangle: state?.triangle ?? null, holder: { marble, zone: null, turnsInHand }, replacement: null, tally, state, types };
}

// Une clause IMPRIMÉE : ce que la bille promet, son montant calculé (avec sa valeur
// actuelle dans `situation`), sa cible et sa condition comprises. Son action dit sa
// valeur par ses propres textes.
function describeClause(clause, situation, t, statuses) {
  const text = describeBranch(clause, situation, t, statuses);
  if (clause.otherwise === undefined) return text;
  return t("marbles.effect.otherwise", { effect: text, otherwise: describeClause(clause.otherwise, situation, t, statuses) });
}

// Une branche de clause, sans sa chaîne de remplacement (describeClause).
function describeBranch(clause, situation, t, statuses) {
  // Un statut se dit d'après sa définition (la table des statuts) ; une action sans
  // montant (Empocher) dit sa cible elle-même.
  const status = CLAUSE_ACTIONS[clause.action].kind === "status";
  if (status || CLAUSE_ACTIONS[clause.action].amountless) {
    const text = status ? statusText(statusApplication(clause, definitionOf(statuses, clause.status)), t) : actionText(clause.action, undefined, clause.target, t);
    return clause.when === undefined ? text : t("marbles.effect.conditional", { effect: text, condition: CONDITION_TEXTS[clause.when.type](clause.when, t) });
  }
  // Un montant fixe se dit avec sa cible, ou « cette bille » pour une action dite par
  // un verbe ; un montant calculé, sans « cette bille », qui couperait sa phrase.
  let text;
  if (Number.isInteger(clause.amount)) text = withTarget(combined(valueParts({ [clause.action]: clause.amount }, t), t), clause.action, clause.target, t);
  else {
    text = computedText(clause.action, clause.amount, situation, t);
    if (clause.target !== undefined) text = targetedText(text, clause.target, t, ACTION_TEXTS[clause.action].given);
  }
  if (clause.when !== undefined) text = t("marbles.effect.conditional", { effect: text, condition: CONDITION_TEXTS[clause.when.type](clause.when, t) });
  return text;
}

// Un effet imprimé : une liste de clauses. `situation` (cardSituation) : où en est la
// bille, pour la valeur actuelle de ses montants calculés ; `statuses`, la table des
// statuts (celle des règles), que lit une clause Appliquer un statut.
// Deux règles de lecture, pour que la portée d'une condition s'entende :
//   - des clauses qui se suivent avec la MÊME condition, sans sinon, se disent
//     ensemble, la condition une fois : « Vitesse +5 et Masse +1 si … » ;
//   - dès qu'une partie porte une condition, les parties se séparent par un
//     point-virgule plutôt que par « et » : « Polissage 1 à … ; Vitesse −2 si … ».
export function describePrinted(clauses, situation, t, statuses = NO_STATUSES) {
  const parts = sameConditionRuns(clauses).map((run) => {
    if (run.length === 1) return describeClause(run[0], situation, t, statuses);
    const { when } = run[0];
    const effects = combined(run.map(({ when: _when, ...clause }) => describeClause(clause, situation, t, statuses)), t);
    return t("marbles.effect.conditional", { effect: effects, condition: CONDITION_TEXTS[when.type](when, t) });
  });
  const conditional = clauses.some((clause) => clause.when !== undefined);
  if (!conditional || parts.length < 2) return combined(parts, t);
  return parts.reduceRight((rest, part) => t("marbles.effect.semicolon", { first: part, rest }));
}

// Les clauses regroupées par suites de même condition (sans sinon) : [[clause…]…].
function sameConditionRuns(clauses) {
  const runs = [];
  for (const clause of clauses) {
    const last = runs.at(-1);
    const grouped = clause.when !== undefined && clause.otherwise === undefined;
    if (grouped && last !== undefined && last[0].otherwise === undefined && JSON.stringify(last[0].when) === JSON.stringify(clause.when)) last.push(clause);
    else runs.push([clause]);
  }
  return runs;
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
