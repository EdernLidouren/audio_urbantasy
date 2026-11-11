// Jeu des billes : tout ce qui se DIT, à partir de l'état, du journal
// (core/marbles.js) et de la prévision (core/marbles-forecast.js). Pur : rend du
// texte, n'annonce rien. `t` est reçu en paramètre, pour que l'écran et le kit
// terminal (tools/marbles/play.js) disent exactement les mêmes phrases.

import { nameRef } from "../../data/i18n/index.js";
import { MARBLE_POCKET, MARBLE_SIZES, MARBLE_TRIGGERS } from "../../config/marbles-values.js";
import { SLOTS, TALLY_COUNTERS, throwsLeft } from "../../core/marbles.js";
import { emptyTally } from "../../core/marbles-tally.js";
import { AMOUNT_SOURCES, CLAUSE_ACTIONS, CONDITIONS, FIRST_IN_HAND, amountOf } from "../../core/marbles-effects.js";
import { forecast } from "../../core/marbles-forecast.js";
import { formatMenuPosition } from "../../lib/menu.js";

export function marbleName(marble, t) {
  return t(`marble.${marble}.name`);
}

export function slotName(slot, t) {
  return t(`marbles.slot.${slot}`);
}

// Le nom d'un calibre (config/marbles-values.js/MARBLE_SIZES) : « calot ».
function sizeName(size, t) {
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

// Les textes de chaque action de clause (core/marbles-effects.js/CLAUSE_ACTIONS),
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
  // (`up`), un emplacement (`slot`, qui reçoit {slot}), la première de la main.
  pocket: { up: "marbles.effect.pocket_self", targets: { slot: "marbles.effect.pocket_slot", [FIRST_IN_HAND]: "marbles.effect.pocket_hand" } },
};

// Une action sans texte, ou un texte sans action, échoue au chargement.
for (const action of new Set([...Object.keys(CLAUSE_ACTIONS), ...Object.keys(ACTION_TEXTS)])) {
  if (!Object.hasOwn(CLAUSE_ACTIONS, action) || !Object.hasOwn(ACTION_TEXTS, action)) {
    throw new Error(`marbles : l'action "${action}" doit avoir ses textes (ACTION_TEXTS) et son entrée (CLAUSE_ACTIONS).`);
  }
}

// Les valeurs d'un effet ({ speed, mass }, une absente comptant zéro) -> ses
// morceaux à dire.
function valueParts(values, t) {
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
    return target === FIRST_IN_HAND ? t(targets[FIRST_IN_HAND]) : t(targets.slot, { slot: slotName(target, t) });
  }
  const text = t(up, { amount });
  return target === undefined ? text : t("marbles.effect.given", { effect: text, slot: slotName(target, t) });
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

function combined(parts, t) {
  return parts.length === 0 ? t("marbles.effect.none") : t("marbles.effect.combined", { parts });
}

// Ce qu'un Empocher PRÉVU a déplacé (core/marbles-forecast.js, `pockets`), dit chez la
// bille qui l'a produit : « porcelaine en poche, à l'entrée : Vitesse +10 », « argile
// en poche », « pot plein : argile perdue » ; une bille piochée à l'aveugle reste
// inconnue.
function pocketPart({ marble, lost, entry }, t) {
  if (marble === null) return t(lost ? "marbles.pocket.lost_unknown" : "marbles.pocket.entered_unknown");
  const ref = nameRef(`marble.${marble}.name`);
  if (lost) return t("marbles.pocket.lost", { marble: ref });
  if (entry === null) return t("marbles.pocket.entered", { marble: ref });
  return t("marbles.pocket.entered_effect", { marble: ref, effect: effectSummary(entry, t) });
}

// Une cible vide PRÉVUE (core/marbles-forecast.js, `empty`) : « pointe vide »,
// « main vide », « agate déjà partie ».
function emptyPart({ slot, target, marble }, t) {
  if (target === FIRST_IN_HAND) return t("marbles.forecast_empty.hand");
  if (target === "self") return t("marbles.forecast_empty.self", { marble: nameRef(`marble.${marble}.name`) });
  return t("marbles.forecast_empty.slot", { slot: slotName(slot, t) });
}

// Le texte d'un effet prévu suivi de ses résultats : ses cibles vides, puis ce que
// ses Empocher ont déplacé (« Polissage 1 à la pointe, pointe vide » ; « Empocher la
// bille en pointe, puis porcelaine en poche, à l'entrée : Vitesse +10 »). Un effet
// joué n'en a pas : la séquence les dit à part.
function withResults(text, effect, t) {
  const empty = effect.empty ?? [];
  const withEmpty = empty.length === 0 ? text : t("marbles.forecast_empty.after", { effect: text, empty: t("marbles.effect.combined", { parts: empty.map((target) => emptyPart(target, t)) }) });
  if (!effect.pockets?.length) return withEmpty;
  return t("marbles.pocket.then", { effect: withEmpty, pockets: t("marbles.effect.combined", { parts: effect.pockets.map((moved) => pocketPart(moved, t)) }) });
}

// Un effet prévu, d'une phrase : ses valeurs et ses actions, puis ses résultats.
function effectSummary(effect, t) {
  return withResults(combined(effectParts(effect, t), t), effect, t);
}

// Un effet JOUÉ ou PRÉVU : { speed, mass, draw, given } -> « Vitesse +1 et Masse
// +2 », « Pioche 1 », « Vitesse +4 à la pointe », « aucun effet ».
export function describeEffect(effect, t) {
  const parts = effectParts(effect, t);
  for (const gift of effect.given ?? []) {
    parts.push(t("marbles.effect.given", { effect: combined(valueParts(gift, t), t), slot: slotName(gift.slot, t) }));
  }
  return withResults(combined(parts, t), effect, t);
}

// Prévu, s'il y en a un (null : rien à prévoir), sinon « aucun effet ».
function describeOutcome(outcome, t) {
  return outcome === null ? t("marbles.effect.none") : describeEffect(outcome, t);
}

// Le texte de chaque condition (core/marbles-effects.js/CONDITIONS), lu dans une
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
// (core/marbles-effects.js/AMOUNT_SOURCES) : « Vitesse +1 par tour en main »,
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

// Un MONTANT CALCULÉ (core/marbles-effects.js, en-tête) : « Vitesse +1 par minibille
// active », « Vitesse +1 par tour en main, maximum +5, actuellement +2 », ou, avec une
// base, « Vitesse +2, +1 par tour en main… ». La valeur actuelle, dans `situation`,
// seulement pour une source qui la connaît hors de tout déclenchement (`current`).
function computedText(action, amount, situation, t) {
  const step = amount.base === 0 ? combined(valueParts({ [action]: amount.step }, t), t) : amountNumber(action, amount.step);
  let text = sourceText(amount.source, step, t);
  if (amount.base !== 0) text = t("marbles.effect.computed_base", { base: combined(valueParts({ [action]: amount.base }, t), t), effect: text });
  if (amount.max !== undefined) text = t("marbles.effect.computed_max", { effect: text, max: amountNumber(action, amount.max) });
  if (!AMOUNT_SOURCES[amount.source.type].current) return text;
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
  if (clause.target !== undefined) text = t("marbles.effect.given", { effect: text, slot: slotName(clause.target, t) });
  if (clause.when !== undefined) text = t("marbles.effect.conditional", { effect: text, condition: CONDITION_TEXTS[clause.when.type](clause.when, t) });
  return text;
}

// Un effet imprimé : une liste de clauses. `situation` (cardSituation) : où en est la
// bille, pour la valeur actuelle de ses montants calculés.
export function describePrinted(clauses, situation, t) {
  return combined(clauses.map((clause) => describeClause(clause, situation, t)), t);
}

// L'annonce principale d'une bille hors du triangle (main, sac, défausse) : son
// nom, son calibre juste après, son usure maximale, puis « x sur y » : « gorille,
// calot, usure 3. ». Le détail est dans sa fiche (view/marbles/card.js).
export function describeMarbleInList(marble, index, total, rules, t) {
  const line = t("marbles.list.line", { name: marbleName(marble, t), size: sizeName(rules.types[marble].size, t), maxWear: rules.maxWearOf(marble) });
  const position = formatMenuPosition(index, total, t);
  return position ? `${line}. ${position}` : `${line}.`;
}

// Une place de la main sous le curseur. Main vide : le dit.
export function describeHandFocus(game, index, rules, t) {
  if (game.hand.length === 0) return t("marbles.hand.empty");
  return describeMarbleInList(game.hand[index].marble, index, game.hand.length, rules, t);
}

// L'effet de phase de ce tour d'une bille active : la prévision si le tour se
// joue, sinon ce qu'elle a d'imprimé.
function phaseText(game, slot, rules, t) {
  const predicted = rules.forecast(game);
  if (predicted.ok) return describeEffect(predicted.phases[slot], t);
  const { marble } = game.triangle[slot];
  return describePrinted(rules.effectAt(marble, slot), cardSituation(marble, 0, game.tally), t);
}

// L'annonce principale d'un emplacement sous le curseur : la bille, son calibre
// juste après, sa place et son usure, ou « vide ». Le détail est dans sa fiche.
export function describeSlotFocus(game, slot, rules, t) {
  const placed = game.triangle[slot];
  if (placed === null) return t("marbles.slot_line.empty", { slot: slotName(slot, t) });
  return t("marbles.slot_line.occupied", {
    slot: slotName(slot, t),
    name: marbleName(placed.marble, t),
    size: sizeName(rules.types[placed.marble].size, t),
    wear: placed.wear,
    maxWear: rules.maxWearOf(placed.marble),
  });
}

// Un emplacement sous le curseur pendant qu'on cherche où poser : ce qui compte
// pour décider, la bille déjà là et ce qu'elle ferait ce tour.
export function describeSlotForPlacement(game, slot, rules, t) {
  const placed = game.triangle[slot];
  if (placed === null) return t("marbles.slot_line.placing_empty", { slot: slotName(slot, t) });
  return t("marbles.slot_line.placing_occupied", {
    slot: slotName(slot, t),
    name: marbleName(placed.marble, t),
    effect: phaseText(game, slot, rules, t),
  });
}

// La ligne des valeurs prévues d'une pose : celles de la phase de la bille posée,
// puis ce qui s'y ajoute avec son emplacement (son Final, si elle s'use ce tour) :
// « Vitesse +6. Final : Pioche 1. ».
function placedValues(predicted, slot, t) {
  // Retirée avant sa phase (une Fêlure de son Tic) : elle n'a pas de valeurs.
  if (predicted.phases[slot] === null) return forecastSlotLine(predicted, slot, t);
  const values = effectSummary(predicted.phases[slot], t);
  const notes = slotNotes(predicted, slot, t);
  return notes.length === 0 ? values : [`${values}.`, ...notes].join(" ");
}

// Les déclencheurs qui ont leur ligne dans la confirmation (config/marbles-values.js/
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
// suivie d'une ligne par Trouvaille qu'elle déclencherait (regenerationLines) ; et
// « Éveils possibles. » si la prévision est incertaine (uncertainLines). La pose doit
// être permise (placeRefusal).
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
  return [...lines, ...regenerationLines(predicted, t), ...uncertainLines(predicted)];
}

// Le sac : combien il en reste, et combien on en pioche à chaque tour.
export function describeBag(game, t) {
  return t("marbles.status.bag", { count: game.bag.length, draw: game.drawPerTurn });
}

// Le pot (touche P) : « 2 billes sur 3 dans le pot, 1 bille perdue. ».
export function describePot(game, t) {
  return t("marbles.status.pot", { count: game.pot.length, capacity: game.potCapacity, lost: game.lost.length });
}

export function describeDiscard(game, t) {
  return t("marbles.status.discard", { count: game.discard.length });
}

// Où en est le tour. Avec les lancers restants et la disponibilité de l'échange :
// rien d'autre ne permet de les savoir sans essayer.
export function describeTurn(game, swapAvailable, t) {
  const line = t("marbles.status.turn", {
    turn: game.turn,
    turnCount: game.turnCount,
    score: game.score,
    speed: formatCounter(game.speed),
    mass: formatCounter(game.mass),
  });
  const throws = t("marbles.status.throws", { count: throwsLeft(game) });
  return `${line} ${throws} ${t(swapAvailable ? "marbles.status.swap_available" : "marbles.status.swap_unavailable")}`;
}

// L'ordre dans lequel le menu du sac se dit : alphabétique, sur le nom prononcé.
// Il ne doit jamais révéler l'ordre de la pioche : il ne dépend donc que du contenu
// du sac, et ne demande aucun hasard, ni celui de la partie ni un autre.
export function bagDisplayOrder(bag, t) {
  return [...bag].sort((a, b) => marbleName(a, t).localeCompare(marbleName(b, t)));
}

// Ce qu'une bille produit À SON EMPLACEMENT, sur le triangle prévu ou pendant la
// résolution : « base gauche, argile : Vitesse +1. », « base droite, vide. ».
// `outcome` : { marble, speed, mass }, ou null pour un emplacement vide. Seules les
// valeurs effectivement produites se disent, bonus reçu compris, sans texte d'effet
// ni de condition : ce que la bille donne à une autre s'entend chez celle-ci.
// `notes` : ce qui se prévoit en plus avec cet emplacement (slotNotes), à la suite.
function outcomeLine(slot, outcome, t, notes = []) {
  if (outcome === null) return t("marbles.outcome.empty", { slot: slotName(slot, t) });
  const line = t("marbles.outcome.slot", {
    slot: slotName(slot, t),
    marble: marbleName(outcome.marble, t),
    effect: effectSummary(outcome, t),
  });
  return [line, ...notes].join(" ");
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
  return predicted.slotEffects[slot].map((effect) => t(SLOT_TEMPLATES[effect.trigger], { effect: effectSummary(effect, t) }));
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
      params: { marble: nameRef(`marble.${effect.marble}.name`), effect: effectSummary(effect, t) },
    })),
  ]);
}

// Ce que la prévision ignore, à la fin de ce qu'elle dit : « Éveils possibles. »
// quand un Éveil est possible (core/marbles-forecast.js, `awakenPossible` : une bille
// piochée, et une bille qui pouvait l'être a un Éveil). Rien sinon.
function uncertainLines(predicted) {
  return predicted.awakenPossible ? [{ key: "marbles.forecast.awakenings" }] : [];
}

// Les billes du pot qui ont un effet à chaque résolution, après les trois
// emplacements, dans l'ordre d'arrivée : « Pot, agate : Masse +1. ». Aucune ligne pour
// les autres.
const POT_FORECAST_TEMPLATE = MARBLE_POCKET.moments.find((moment) => moment.texts.forecast !== undefined)?.texts.forecast;

function potLines(predicted, t) {
  return predicted.potEffects.map((effect) => t(POT_FORECAST_TEMPLATE, { marble: nameRef(`marble.${effect.marble}.name`), effect: effectSummary(effect, t) }));
}

function forecastNotes(predicted, t) {
  return [...regenerationLines(predicted, t), ...uncertainLines(predicted)].map(({ key, params }) => t(key, params));
}

// La vue d'ensemble du tour (touche R), d'un bloc : la prévision d'abord, Vitesse et
// Masse comprenant ce que le tour a déjà gagné (Tic, Éjection), l'Impact avec ses
// planchers ; puis chaque emplacement dans l'ordre des phases (une Pioche y est une
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

// La rotation du moteur (core/marbles.js/rotated) : un cran, dans le sens horaire
// (base gauche -> pointe -> base droite). Paramètres du texte, pour le jour où elle
// variera ; son évènement les portera alors.
const ROTATION = { steps: 1, direction: "clockwise" };

// Le gabarit d'un effet déclenché par un évènement, celui de son déclencheur
// (MARBLE_TRIGGERS, `texts.effect`) ; celui d'une phase se dit comme le résultat de
// son emplacement (outcomeLine).
const EFFECT_TEMPLATES = Object.fromEntries([
  ...MARBLE_TRIGGERS.map((trigger) => [trigger.id, trigger.texts.effect]),
  // Les moments En poche : « Entrée au pot de porcelaine : Vitesse +10. … », « Pot,
  // agate : Masse +1. ».
  ...MARBLE_POCKET.moments.map((moment) => [moment.trigger, moment.texts.effect]),
]);

function effectText(event, t) {
  if (event.trigger === "phase") {
    return outcomeLine(event.slot, { marble: event.marble, speed: event.speedDelta, mass: event.massDelta, draw: event.draw, operations: event.operations }, t);
  }
  const template = EFFECT_TEMPLATES[event.trigger];
  if (!template) throw new Error(`marbles : effet sans gabarit pour le déclencheur "${event.trigger}".`);
  return t(template, {
    marble: nameRef(`marble.${event.marble}.name`),
    effect: describeEffect({ speed: event.speedDelta, mass: event.massDelta, draw: event.draw, operations: event.operations, given: event.given }, t),
    speed: formatCounter(event.speed),
    mass: formatCounter(event.mass),
  });
}

// Ce qui ne se dit pas : l'évènement rejoint l'étape SUIVANTE (son son avec elle).
// La phase se dit par son effet, qui la suit toujours ; le retrait, par la défausse ;
// le Tic et l'Éjection, par leur effet s'ils en ont un.
const SILENT = () => null;
// Ce qui ne se dit pas et prolonge l'étape PRÉCÉDENTE : l'usure suit l'effet de sa
// phase, la fin de tour suit la rotation, l'évènement d'un déclencheur de la bille
// piochée (l'Éveil) suit sa pioche, sans couper la liste des pioches consécutives
// (son effet, s'il en a un, ouvre sa propre étape et la coupe).
const TRAILING = new Set([
  "wear",
  "turnEnded",
  ...MARBLE_TRIGGERS.filter((trigger) => trigger.marble === "drawn").map((trigger) => trigger.event),
]);

// Le texte de chaque type d'évènement, ou null s'il ne se dit pas. `context` :
// { gameEndsBeforeNextTurn(index) }, pour la rotation.
const EVENT_TEXTS = {
  turnStarted: (event, t) => t("marbles.event.turn_started", { turn: event.turn }),
  // Les pioches consécutives se disent en une liste : buildSteps les regroupe.
  draw: (event, t) => marbleName(event.marble, t),
  drawSkipped: (event, t) => t(`marbles.event.draw_skipped.${event.reason}`),
  bagRegenerated: (event, t) => t("marbles.event.bag_regenerated", { size: event.size }),
  swapped: (event, t) => t("marbles.event.swapped", { a: slotName(event.a, t), b: slotName(event.b, t) }),
  // L'évènement d'un déclencheur se dit par son effet, s'il en a un.
  ...Object.fromEntries(MARBLE_TRIGGERS.map((trigger) => [trigger.event, SILENT])),
  removed: SILENT,
  phase: SILENT,
  wear: SILENT,
  turnEnded: SILENT,
  // Polissage, Fêlure : la bille qui les reçoit, et son usure d'après.
  polished: (event, t) => t("marbles.event.polished", { marble: nameRef(`marble.${event.marble}.name`), wear: event.wear, maxWear: event.maxWear }),
  cracked: (event, t) => t("marbles.event.cracked", { marble: nameRef(`marble.${event.marble}.name`), wear: event.wear, maxWear: event.maxWear }),
  // Une cible vide : un emplacement, la main (Empocher la première bille de la
  // main), ou la bille elle-même qui n'est plus là.
  targetEmpty: (event, t) => {
    if (event.target === FIRST_IN_HAND) return t("marbles.event.target_empty_hand");
    if (event.target === "self") return t("marbles.event.target_empty_self", { marble: nameRef(`marble.${event.marble}.name`) });
    return t("marbles.event.target_empty", { slot: slotName(event.slot, t) });
  },
  // La mise en poche et la perte, dites avec la bille ; une bille piochée à
  // l'aveugle n'apparaît que dans la prévision, qui ne passe jamais par ici.
  pocketed: (event, t) => t("marbles.event.pocketed", { marble: nameRef(`marble.${event.marble}.name`) }),
  lost: (event, t) => t("marbles.event.lost", { marble: nameRef(`marble.${event.marble}.name`) }),
  // L'étape du pot se dit par l'effet de la bille, si elle en a un.
  potResolution: SILENT,
  discarded: (event, t) => t(`marbles.event.discarded.${event.cause}`, { marble: nameRef(`marble.${event.marble}.name`) }),
  placed: (event, t) => t("marbles.event.placed", { marble: marbleName(event.marble, t), slot: slotName(event.slot, t) }),
  phaseSkipped: (event, t) => outcomeLine(event.slot, null, t),
  effect: effectText,
  impact: (event, t) => t("marbles.event.impact", { impact: event.impact, score: event.score }),
  // Au dernier tour, la partie finit avant que le triangle ne serve : la rotation
  // ne se dit pas.
  rotation: (event, t, context) => (context.endsBeforeNextTurn ? null : t("marbles.event.rotation", ROTATION)),
  gameOver: (event, t) => t(`marbles.event.game_over.${event.reason}`, { score: event.score }),
};

// La partie finit-elle après `index`, avant tout nouveau tour ?
function endsBeforeNextTurn(events, index) {
  const next = events.slice(index + 1).find((event) => event.type === "gameOver" || event.type === "turnStarted");
  return next?.type === "gameOver";
}

// Le journal découpé en ÉTAPES à dire, dans l'ordre chronologique :
// [{ text, events, messages, startsTurn?, endsGame? }]. `messages` : les messages de
// jeu que l'étape porte, pour l'historique (view/marbles/history.js), d'ordinaire
// son seul texte ; `startsTurn` (le numéro du tour) marque le début de tour,
// `endsGame` la fin de partie : ce sont les bornes de l'historique. Chaque évènement qui se dit ouvre son étape ; un évènement
// muet rejoint la suivante (ou la précédente, TRAILING) ; tout évènement appartient
// à une étape et une seule. Deux règles d'ordre :
// - les pioches consécutives se disent en une liste (« Vous piochez argile et verre. ») ;
// - le début de tour se dit APRÈS sa pioche, à la fin du journal reçu : « Début du
//   tour 3, jouez vos billes. » vient quand le joueur a sa main. Une fin de partie
//   avant lui le remplace.
// Un nouvel évènement qui se dit (un effet d'un nouveau déclencheur) devient ainsi une
// étape à sa place, sans autre changement. Un type inconnu lève : c'est une faute de
// programmation, qu'une partie de fumée (domaine marbles-view) trouve avant le joueur.
export function buildSteps(events, t) {
  const steps = [];
  let waiting = [];
  let turnStart = null;

  const open = (text, event) => {
    const step = { text, events: [...waiting, event] };
    waiting = [];
    steps.push(step);
    return step;
  };

  events.forEach((event, index) => {
    const text = EVENT_TEXTS[event.type];
    if (!text) throw new Error(`marbles : évènement sans texte "${event.type}".`);

    // Le début de tour se dit plus tard, mais son évènement reste à sa place : il
    // part (son son avec lui) avec l'étape suivante, la pioche.
    if (event.type === "turnStarted") {
      turnStart = { text: text(event, t), turn: event.turn };
      waiting.push(event);
      return;
    }
    // Le tour qui allait commencer n'aura pas lieu.
    if (event.type === "gameOver") turnStart = null;

    const last = steps[steps.length - 1];
    if (event.type === "draw") {
      if (last?.draws && waiting.length === 0) {
        last.draws.push(marbleName(event.marble, t));
        last.events.push(event);
      } else {
        open(null, event).draws = [marbleName(event.marble, t)];
      }
      return;
    }
    if (TRAILING.has(event.type) && last !== undefined && waiting.length === 0) {
      last.events.push(event);
      return;
    }
    const spoken = text(event, t, { endsBeforeNextTurn: endsBeforeNextTurn(events, index) });
    if (spoken === null) waiting.push(event);
    else open(spoken, event);
  });

  if (turnStart !== null) steps.push({ text: turnStart.text, events: waiting, startsTurn: turnStart.turn });
  else if (waiting.length > 0 && steps.length > 0) steps[steps.length - 1].events.push(...waiting);
  else if (waiting.length > 0) steps.push({ text: "", events: waiting });

  return steps.map((step) => {
    const text = step.draws ? t("marbles.event.draw", { marbles: step.draws }) : step.text;
    const built = { text, events: step.events, messages: text === "" ? [] : [text] };
    if (step.startsTurn !== undefined) built.startsTurn = step.startsTurn;
    if (step.events.some((event) => event.type === "gameOver")) built.endsGame = true;
    return built;
  });
}

// Les étapes d'une RÉSOLUTION (journal de la résolution puis de la pioche qui la
// suit), ouvertes par « Résolution du tour 3. », qui n'est pas un évènement : c'est
// le geste du joueur qui l'ouvre. L'ouverture se dit SANS PAUSE avant la phase de
// base gauche : elle partage sa première étape. Deux étapes à pause nulle ne
// suffiraient pas, la seconde annonce couperait la première. Elles restent deux
// messages pour l'historique. `hint` : la première fois, comment passer la
// résolution, dit après l'ouverture mais hors de l'historique (ce n'est pas un
// message de jeu).
export function resolutionSteps(turn, events, t, { hint = false } = {}) {
  const opening = t("marbles.resolution.opening", { turn });
  const spoken = hint ? `${opening} ${t("marbles.resolution.hint")}` : opening;
  const [first, ...rest] = buildSteps(events, t);
  if (first === undefined) return [{ text: spoken, events: [], messages: [opening] }];
  return [{ ...first, text: `${spoken} ${first.text}`, messages: [opening, ...first.messages] }, ...rest];
}

// Toutes les étapes d'un coup, pour ce qui n'a pas à se dire étape par étape.
export function stepsText(steps) {
  return steps.map((step) => step.text).join(" ");
}
