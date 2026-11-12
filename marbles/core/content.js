// JEU DES BILLES — le CONTENU : ce que déclarent les billes et ce que la partie en
// sait avant de jouer. Simulation pure, sans DOM, sans son, sans hasard. Ici :
// la validation des déclencheurs, des phases et des moments En poche
// (marbles/config/values.js), celle d'une table de billes (validateMarbleTypes) et
// des réglages d'une partie, les valeurs de partie (TALLY_COUNTERS), les mots-clés
// (MARBLE_KEYWORDS, keywordsOf), l'usure maximale d'une bille (maxWearOf), et le
// journal : ses types d'évènements (JOURNAL_EVENTS), décrits ci-dessous.
// Les deux autres modules du jeu : le réducteur (marbles/core/marbles.js, l'état et les
// actions) et le déroulé (marbles/core/run.js, ce qui joue les évènements).
//
// JOURNAL — `events`, dans l'ordre où ça se passe. Interface et son s'appuient
// sur lui seul (marbles/view/narration.js, marbles/view/sounds.js) :
//   turnStarted { turn, turnCount }, draw { marble, cause }, drawSkipped { reason },
//   bagRegenerated { size }, swapped { a, b },
//   awaken { marble }, flick { slot, marble, turnsInHand }, windfall { slot, marble },
//   knockout { slot, marble, replacement, by? }, removed { slot, marble, cause },
//   discarded { marble, from, slot?, index?, cause, handFull?, movedBy?, redirected?, by? },
//   redirected { marble, destination, action, by },
//   returned { marble, from, slot?, index?, handIndex, cause, movedBy?, redirected?, by? },
//   placed { slot, marble },
//   hit { slot, marble, replacement }, final { slot, marble },
//   phase { slot, marble }, phaseSkipped { slot },
//   effect { trigger, slot, marble, speedDelta, massDelta, draw, operations, given, lost, speed, mass },
//   polished { slot, marble, amount, applied, wear, maxWear },
//   cracked { slot, marble, amount, applied, wear, maxWear },
//   targetEmpty { action, slot, target?, marble?, by },
//   pocketed { marble, from, slot?, index?, potIndex, by }, lost { marble, from, slot?, index?, by },
//   potResolution { index, marble }, pocketReaction { index, marble, counter },
//   chainInterrupted {},
//   choice { action, amount?, zones, pick, count, mode, by },
//   chosen { zone, index?, slot?, marble, by },
//   choiceEnded { reason, chosen, by }, choiceUndecided { action, by },
//   eject { slot, marble, by },
//   wear { slot, marble, wear, maxWear },
//   impact { speed, mass, impact, score },
//   rotation { triangle, notches }, turnEnded { turn }, gameOver { score }.
// `awaken` : juste après chaque `draw` d'une bille réellement piochée, la bille
// désormais en main (à 0 tour en main) ; son Éveil et tout ce qui en découle se
// règlent avant la bille suivante (une interruption, comme la Trouvaille). À
// l'aveugle, sa bille est UNKNOWN_MARBLE : aucun Éveil ne se prévoit.
// `flick` : la bille vient de quitter la main pour être posée en `slot` ;
// `turnsInHand`, le compteur qu'elle avait en main, que lit sa Chiquenaude.
// `windfall` : après un `bagRegenerated`, une par bille active, dans l'ordre des
// phases ; sa Trouvaille et tout ce qui en découle se règlent avant la suite.
// `replacement` (Tic, Éjection) : le remplacement en cours, { placed, ejected }, lu
// par les conditions de calibre relatif (marbles/core/effects.js/relativeSize).
// LE CHEMIN D'UNE BILLE (marbles/core/run.js/travel) : `removed` (son départ du
// triangle, avec sa cause), son déclencheur de sortie (`final`, `knockout`) réglé
// pendant qu'elle est en partance, une `redirected` éventuelle, puis son arrivée,
// `discarded` (la défausse, depuis `from` : "triangle" et son `slot`, "hand" et son
// `index`), `pocketed` ou `lost`.
// `eject` : l'action Éjecter (marbles/core/effects.js) chasse la bille de `slot`,
// produite par l'effet `by` ; suivent `removed` de cause "eject", son Éjection
// (`knockout`, avec `by` et le remplacement { placed: la bille qui éjecte, ejected },
// une interruption), puis son arrivée. Un `effect` d'une Éjection ainsi provoquée
// porte `ejectedBy` (le `by` de l'éjection) : ce n'est pas celle d'une pose.
// `redirected` : pendant son déclencheur de sortie, une action sur elle-même
// (Empocher, Rebond) a redirigé la bille en partance vers `destination` ("pot",
// "hand"), par l'effet `by` ; son arrivée porte alors `redirected: true`.
// `returned` : une bille arrive en MAIN (Rebond, Ramasser), à 0 tour en main, sans
// Éveil, à la place `handIndex` ; depuis `from` ("triangle" et son `slot`,
// "discard" et son `index`). Une bille renvoyée vers une main pleine arrive à la
// défausse à la place : `discarded` porte `handFull`.
// `movedBy` (arrivées) : l'action qui a déplacé la bille (Empocher, Défausser,
// Rebond, Ramasser), directement ou par une redirection ; lu par leurs compteurs.
// `cause` : "replacement", "wear", "pocket" ou "eject". `trigger` : "phase", l'id d'un
// déclencheur (marbles/config/values.js/MARBLE_TRIGGERS : "awaken", "flick", "hit",
// "windfall", "knockout", "final") ou d'un moment En poche (MARBLE_POCKET :
// "pocketEntry", "pocketResolution", "pocketReaction").
// `final` : une bille usée vient de quitter `slot` ; en partance, pas encore arrivée.
// `pocketed` : une bille entre au pot (Empocher) depuis `from` ("triangle", et son
// `slot` ; "hand", et son `index`), produite par l'effet `by`
// ({ trigger, slot, marble }) ; `potIndex`, sa place d'arrivée au pot (la dernière) ;
// ses effets d'entrée (En poche) se règlent aussitôt, une interruption. `lost` : la même, le pot étant plein : perdue, sans effet
// d'entrée. Depuis le triangle, un `removed` de cause "pocket" les précède : ce
// n'est ni une usure ni une éjection, ni Final ni Éjection.
// `potResolution` : une fois par tour, après les phases et avant les retraits,
// chaque bille du pot dans l'ordre d'arrivée (`index`), pour son effet En poche à
// chaque résolution.
// `pocketReaction` : une bille du pot (`index`, sa place d'arrivée) réagit à un
// incrément du compteur écoutable `counter` (En poche, à chaque (occurrence)), une
// fois par incrément ; voir marbles/core/run.js/pocketReactionsOf.
// `chainInterrupted` : la limite de sécurité du bus a coupé une chaîne
// (marbles/core/bus.js) ; ce qui en restait n'est pas traité, l'action reprend
// ensuite. Une anomalie dans les vérifications et le simulateur.
// Un `effect` d'une bille du pot (entrée, étape du pot, réaction) porte aussi
// `potIndex`, sa place d'arrivée.
// `rotation` : le triangle a tourné de `notches` crans (nextSlot, un cran par
// tour aujourd'hui), `triangle` étant celui d'après.
// `choice` : un choix commence (au moins une cible éligible), le point d'accroche de
// son ouverture ; `chosen` : une cible choisie, celui de sa validation ;
// `choiceEnded` : la sélection est finie, `reason` "count" (N choix faits), "done"
// (Terminer, en mode « jusqu'à N ») ou "exhausted" (plus aucune cible éligible).
// Aucune cible éligible dès le départ : `targetEmpty` de `target` "choice", et rien
// ne s'ouvre. `choiceUndecided` : à l'aveugle seulement (la prévision), un choix
// que personne n'a tranché : son action n'est pas appliquée.
// `targetEmpty` : une action sur une bille sans bille à prendre, produite par
// l'effet `by` ({ trigger, slot, marble }, comme pocketed et lost) : `slot` vide ;
// ou, pour Empocher, `slot` null et `target` "firstInHand" (main vide) ou "self" (la
// bille, `marble`, n'est plus là).
// draw `cause` : "turn" (la pioche du début de tour) ou "effect" (une Pioche).
// polished, cracked `applied` : l'usure réellement rendue ou ajoutée, après plancher
// ou plafond (`amount` : celle demandée).
// drawSkipped `reason` : "handFull" (la bille reste au sac) ou "noMarbles" (sac
// et défausse vides). Une pioche, une régénération ou un arrêt de pioche peuvent
// avoir lieu à tout moment : début de tour, pose (un Tic qui pioche), résolution.
// À l'aveugle (prévision), `draw` a pour bille UNKNOWN_MARBLE.
// `given` : ce que l'effet a donné aux autres emplacements occupés,
// [{ slot, marble, speed, mass }]. `speedDelta` et `massDelta` comptent le bonus
// reçu : c'est le total effectif de la bille, tel qu'il s'annonce. `operations` :
// les actions sur une bille que l'effet joue ([{ action, amount, target? }], ce que
// la bille promet) ; chacune est suivie de son évènement (polished, cracked), ou de
// targetEmpty si l'emplacement visé est vide. `wear` y est l'usure d'après. `draw` : les
// billes que l'effet demande à piocher (Pioche), dont les `draw` qui le suivent
// disent combien l'ont vraiment été.
//
// `types` (paramètre OBLIGATOIRE des fonctions qui lisent une bille) : la table
// des billes, un registre de contenu (marbles/content/types/index.js) que ce module
// n'importe jamais (CLAUDE.md) : la vue, les outils et les vérifications le lui
// passent. Les vérifications y passent aussi des tables fabriquées, qui testent
// ce qu'aucune bille actuelle ne produit (une Masse négative).

import { MARBLES_SETTINGS, MARBLE_PHASES, MARBLE_POCKET, MARBLE_TALLIES, MARBLE_TRIGGERS, STARTING_BAG } from "../config/values.js";
import { rejectUnknownFields } from "../../lib/validate.js";
import { CLAUSE_ACTIONS, SLOTS, effectAt, isMarbleSize, validateEffect } from "./effects.js";
import { buildTallyCounters } from "./counters.js";

// Les types d'évènements du journal (voir l'en-tête), chacun avec vrai s'il nomme
// toujours une bille CONNUE, même dans la prévision : faux pour la pioche, dont la
// bille y est cachée, et pour ceux qui ne nomment aucune bille. Lu par la validation
// des valeurs de partie déclarées (un compteur ne peut compter qu'un évènement qui
// existe ; un filtre sur la bille, qu'un évènement qui la connaît).
export const JOURNAL_EVENTS = Object.freeze({
  turnStarted: false,
  draw: false,
  awaken: false,
  drawSkipped: false,
  bagRegenerated: false,
  swapped: false,
  flick: true,
  windfall: true,
  knockout: true,
  removed: true,
  // La bille défaussée peut venir du sac, cachée dans la prévision.
  discarded: false,
  // La bille ramassée peut venir du sac, défaussée à l'aveugle.
  returned: false,
  redirected: true,
  placed: true,
  hit: true,
  final: true,
  phase: true,
  phaseSkipped: false,
  effect: true,
  polished: true,
  cracked: true,
  targetEmpty: false,
  // La bille mise en poche ou perdue peut être une bille piochée à l'aveugle (la
  // première de la main) ; celles du pot aussi, du coup.
  pocketed: false,
  lost: false,
  potResolution: false,
  pocketReaction: false,
  chainInterrupted: false,
  choice: false,
  // La bille choisie peut être une bille piochée à l'aveugle (la prévision).
  chosen: false,
  choiceEnded: false,
  choiceUndecided: false,
  eject: true,
  wear: true,
  impact: false,
  rotation: false,
  turnEnded: false,
  gameOver: false,
});

// --- Déclencheurs ---

// Les champs d'effet de PHASE d'une bille, à part des déclencheurs.
const PHASE_FIELDS = MARBLE_PHASES.map((phase) => phase.field);
const TRIGGER_MARBLES = ["onSlot", "leaving", "dropped", "thrown", "drawn"];
const TRIGGER_MOMENTS = ["play", "afterPhases", "anytime"];
const PLACEMENT_MARBLES = ["occupant", "placed"];

// Échoue sur une liste de déclencheurs mal formée (marbles/config/values.js/
// MARBLE_TRIGGERS, décrite là) : la vraie est validée au chargement de ce module.
// Les textes, eux, sont vérifiés par le domaine marbles-view.
export function validateMarbleTriggers(triggers) {
  const fail = (message) => {
    throw new Error(`marbles, déclencheurs : ${message}`);
  };
  const seen = { id: new Set(), field: new Set(), event: new Set() };
  for (const trigger of triggers) {
    const describe = `déclencheur "${trigger.id}"`;
    rejectUnknownFields(trigger, ["id", "field", "event", "marble", "moment", "replacement", "forecast", "texts", "card"], describe, fail);
    if (trigger.replacement !== undefined && typeof trigger.replacement !== "boolean") fail(`${describe} : replacement doit valoir true ou false.`);
    for (const key of ["id", "field", "event"]) {
      if (typeof trigger[key] !== "string" || trigger[key] === "") fail(`${describe} : ${key} doit être un texte.`);
      if (seen[key].has(trigger[key])) fail(`${describe} : ${key} "${trigger[key]}" en double.`);
      seen[key].add(trigger[key]);
    }
    if (trigger.id === "phase" || [...PHASE_FIELDS, "baseVariant"].includes(trigger.field)) fail(`${describe} : la phase n'est pas un déclencheur.`);
    if (!TRIGGER_MARBLES.includes(trigger.marble)) fail(`${describe} : marble inconnu "${trigger.marble}".`);
    if (!TRIGGER_MOMENTS.includes(trigger.moment)) fail(`${describe} : moment inconnu "${trigger.moment}".`);
    const { forecast, texts } = trigger;
    validateKeywordTexts(texts, describe, fail);
    if (typeof texts?.card !== "string" || typeof texts?.effect !== "string") fail(`${describe} : textes card et effect obligatoires.`);
    if (forecast?.line === "placement") {
      rejectUnknownFields(forecast, ["line", "marble", "order"], describe, fail);
      if (!PLACEMENT_MARBLES.includes(forecast.marble)) fail(`${describe} : forecast.marble inconnu "${forecast.marble}".`);
      if (!Number.isInteger(forecast.order)) fail(`${describe} : forecast.order doit être un entier.`);
      if (typeof texts.placement !== "string") fail(`${describe} : texte placement obligatoire.`);
    } else if (forecast?.line === "slot" || forecast?.line === "regeneration") {
      rejectUnknownFields(forecast, ["line"], describe, fail);
      if (typeof texts[forecast.line] !== "string") fail(`${describe} : texte ${forecast.line} obligatoire.`);
    } else if (forecast?.line === "none") {
      rejectUnknownFields(forecast, ["line"], describe, fail);
    } else {
      fail(`${describe} : forecast.line doit valoir "placement", "slot", "regeneration" ou "none".`);
    }
    if (trigger.card !== undefined && trigger.card !== "below") fail(`${describe} : card doit valoir "below".`);
  }
}

validateMarbleTriggers(MARBLE_TRIGGERS);

// Les textes d'un MOT-CLÉ (phase, déclencheur, action) : son nom et sa description,
// que l'aide des mots-clés dit (touches E et Maj+E). Obligatoires : un mot-clé sans
// eux échoue au chargement. Leur présence dans chaque langue : domaine marbles-view.
function validateKeywordTexts(texts, describe, fail) {
  if (typeof texts?.name !== "string" || typeof texts?.description !== "string") fail(`${describe} : textes name et description obligatoires (mot-clé).`);
}

// Échoue sur une liste de phases mal formée (marbles/config/values.js/MARBLE_PHASES,
// décrite là) : la vraie est validée au chargement de ce module.
export function validateMarblePhases(phases) {
  const fail = (message) => {
    throw new Error(`marbles, phases : ${message}`);
  };
  const seen = new Set();
  for (const phase of phases) {
    const describe = `phase "${phase?.id}"`;
    rejectUnknownFields(phase, ["id", "field", "slots", "texts"], describe, fail);
    if (typeof phase.id !== "string" || seen.has(phase.id)) fail(`${describe} : id absent ou en double.`);
    seen.add(phase.id);
    if (typeof phase.field !== "string") fail(`${describe} : field doit être un texte.`);
    if (!Array.isArray(phase.slots) || phase.slots.length === 0 || !phase.slots.every((slot) => SLOTS.includes(slot))) fail(`${describe} : slots doit lister des emplacements.`);
    validateKeywordTexts(phase.texts, describe, fail);
  }
  const covered = phases.flatMap((phase) => phase.slots);
  if (covered.length !== SLOTS.length || !SLOTS.every((slot) => covered.includes(slot))) fail("chaque emplacement doit appartenir à une phase, une seule.");
}

validateMarblePhases(MARBLE_PHASES);

// Les champs d'effet d'une bille : ceux de la phase, puis un par déclencheur.
const EFFECT_FIELDS = [...PHASE_FIELDS, ...MARBLE_TRIGGERS.map((trigger) => trigger.field)];

// Les MOMENTS du mot-clé En poche (marbles/config/values.js/MARBLE_POCKET), validés
// au chargement : chacun son id, son effet (`trigger`), son évènement et son moment.
export function validatePocketMoments(pocket) {
  const fail = (message) => {
    throw new Error(`marbles, En poche : ${message}`);
  };
  rejectUnknownFields(pocket, ["field", "texts", "moments"], "MARBLE_POCKET", fail);
  if (Array.isArray(pocket.moments) && pocket.moments.filter((moment) => moment?.reactive === true).length > 1) fail("un seul moment réactif.");
  if (typeof pocket.field !== "string" || [...PHASE_FIELDS, ...MARBLE_TRIGGERS.map((trigger) => trigger.field)].includes(pocket.field)) fail("field doit être un champ à part.");
  validateKeywordTexts(pocket.texts, "MARBLE_POCKET", fail);
  if (!Array.isArray(pocket.moments) || pocket.moments.length === 0) fail("moments doit être une liste non vide.");
  const seen = new Set();
  for (const moment of pocket.moments) {
    const describe = `moment "${moment?.id}"`;
    rejectUnknownFields(moment, ["id", "trigger", "event", "moment", "texts", "reactive"], describe, fail);
    if (moment.reactive !== undefined && moment.reactive !== true) fail(`${describe} : reactive vaut true ou est absent.`);
    for (const key of ["id", "trigger", "event"]) {
      if (typeof moment[key] !== "string" || moment[key] === "" || seen.has(`${key}:${moment[key]}`)) fail(`${describe} : ${key} absent ou en double.`);
      seen.add(`${key}:${moment[key]}`);
    }
    if (MARBLE_TRIGGERS.some((trigger) => trigger.id === moment.trigger || trigger.event === moment.event)) fail(`${describe} : trigger ou event déjà pris par un déclencheur.`);
    if (!TRIGGER_MOMENTS.includes(moment.moment)) fail(`${describe} : moment inconnu "${moment.moment}".`);
    if (typeof moment.texts?.card !== "string" || typeof moment.texts?.effect !== "string") fail(`${describe} : textes card et effect obligatoires.`);
  }
}

validatePocketMoments(MARBLE_POCKET);

// Les moments FIXES d'En poche (à l'entrée, à chaque résolution), chacun sous sa
// clé `id`, et le moment RÉACTIF, s'il est déclaré, dont les clés sont les compteurs
// écoutables (REACTION_KEYS).
const FIXED_MOMENTS = MARBLE_POCKET.moments.filter((moment) => moment.reactive !== true);
export const REACTIVE_MOMENT = MARBLE_POCKET.moments.find((moment) => moment.reactive === true) ?? null;

// Les clauses d'une bille pour un moment fixe En poche, ou null.
export function pocketClauses(type, moment) {
  return type[MARBLE_POCKET.field]?.[moment.id] ?? null;
}

// Les clauses d'une bille du pot en réaction au compteur `counter`, ou null.
export function reactionClauses(type, counter) {
  return type[MARBLE_POCKET.field]?.[counter] ?? null;
}

// Les mots-clés de phase, pour les valeurs de partie : chaque phase (MARBLE_PHASES :
// pointe, base, celle-ci sur ses deux emplacements), puis chaque emplacement d'une
// phase qui en a plusieurs (base droite, base gauche).
const PHASE_KEYWORDS = [
  ...MARBLE_PHASES.map(({ id, slots }) => ({ id, slots })),
  ...MARBLE_PHASES.filter((phase) => phase.slots.length > 1).flatMap((phase) => phase.slots.map((slot) => ({ id: slot, slots: [slot] }))),
];

// TOUS les compteurs des valeurs de partie (marbles/core/counters.js) : générés depuis
// les déclencheurs, les phases et les actions de clause, plus les évènements réels
// déclarés. Construits et validés au chargement de ce module.
export const TALLY_COUNTERS = buildTallyCounters({
  triggers: MARBLE_TRIGGERS,
  phases: PHASE_KEYWORDS,
  // Un compteur par moment En poche, sous l'identifiant de son effet ; celui des
  // réactions n'est pas écoutable (les réactions se répondraient sans fin).
  pocketMoments: MARBLE_POCKET.moments.map((moment) => ({
    id: moment.trigger,
    event: moment.event,
    listenable: moment.reactive !== true,
    clauses: (event, types) => (moment.reactive ? reactionClauses(types[event.marble], event.counter) : pocketClauses(types[event.marble], moment)),
  })),
  actions: CLAUSE_ACTIONS,
  events: MARBLE_TALLIES,
  journalEvents: JOURNAL_EVENTS,
});

// Leurs identifiants, que la validation d'une source de montant `tally` vérifie.
const TALLY_IDS = new Set(TALLY_COUNTERS.map((counter) => counter.id));

// Les OCCURRENCES ÉCOUTABLES par une bille du pot (En poche, à chaque (occurrence)) :
// les compteurs écoutables (marbles/core/counters.js), dans leur ordre, celui des
// fiches. Aucune sans moment réactif déclaré. Une clé de moment fixe qui serait aussi
// un compteur rendrait le champ ambigu : refusé au chargement.
export const REACTION_KEYS = REACTIVE_MOMENT === null ? [] : TALLY_COUNTERS.filter((counter) => counter.listenable).map((counter) => counter.id);
for (const moment of FIXED_MOMENTS) {
  if (TALLY_IDS.has(moment.id)) throw new Error(`marbles, En poche : la clé du moment "${moment.id}" est aussi une valeur de partie.`);
}
const COUNTER_CATEGORIES = Object.fromEntries(TALLY_COUNTERS.map((counter) => [counter.id, counter.category]));

// Le moment où joue chaque champ d'effet, pour la règle des cibles et les
// conditions qui n'ont de sens qu'à certains moments (marbles/core/effects.js/
// validateEffect) ; une variante de base joue sur sa base. `marble` : la bille
// concernée par le déclencheur ; `replacement` : un remplacement est en cours (Tic,
// Éjection).
const FIELD_CONTEXTS = {
  ...Object.fromEntries(MARBLE_PHASES.map((phase) => [phase.field, { phaseSlots: phase.slots }])),
  ...Object.fromEntries(
    MARBLE_TRIGGERS.map((trigger) => [trigger.field, { moment: trigger.moment, marble: trigger.marble, replacement: trigger.replacement === true, trigger: trigger.id }])
  ),
};

// --- Mots-clés ---

// Toutes les clauses d'une bille, tous champs d'effet confondus (variantes de base
// comprises).
function clausesOf(type) {
  return [
    ...EFFECT_FIELDS.flatMap((field) => type[field] ?? []),
    ...Object.values(type.baseVariant ?? {}).flat(),
    ...Object.values(type[MARBLE_POCKET.field] ?? {}).flat(),
  ];
}

// Les MOTS-CLÉS, dans l'ordre de l'aide : les déclencheurs (MARBLE_TRIGGERS), En
// poche (MARBLE_POCKET, présent si l'un de ses moments a un effet), les actions
// mots-clés (CLAUSE_ACTIONS qui déclarent `keyword`), puis les phases
// (MARBLE_PHASES) en dernier : pointe et base, présentes sur presque toutes les
// billes, ne masquent pas ce qui distingue la bille en tête d'annonce. Chacun { id, kind, texts: { name, description },
// present(marble, types) } : présent sur une bille si son champ n'est pas vide
// (pour une phase, l'effet d'un de ses emplacements, variante comprise), ou, pour
// une action, si une clause de la bille l'utilise. Un mot-clé ajouté à sa liste
// est ici d'office ; un mot-clé sans nom ni description échoue au chargement.
// Exportée pour vérifier ce refus sur des listes fabriquées.
export function buildMarbleKeywords({ phases, triggers, pocket, actions }) {
  const fail = (message) => {
    throw new Error(`marbles, mots-clés : ${message}`);
  };
  const keywords = [
    ...triggers.map((trigger) => ({
      id: trigger.id,
      kind: "trigger",
      texts: { name: trigger.texts?.name, description: trigger.texts?.description },
      present: (marble, types) => (types[marble][trigger.field]?.length ?? 0) > 0,
    })),
    {
      id: pocket.field,
      kind: "pocket",
      texts: pocket.texts,
      // Un moment fixe ou une occurrence écoutée, s'il a un effet.
      present: (marble, types) => Object.values(types[marble][pocket.field] ?? {}).some((clauses) => clauses.length > 0),
    },
    ...Object.entries(actions)
      .filter(([, action]) => action.keyword !== undefined)
      .map(([id, action]) => ({
        id,
        kind: "action",
        texts: action.keyword.texts,
        present: (marble, types) => clausesOf(types[marble]).some((clause) => clause.action === id),
      })),
    ...phases.map((phase) => ({
      id: phase.id,
      kind: "phase",
      texts: phase.texts,
      present: (marble, types) => phase.slots.some((slot) => effectAt(marble, slot, types).length > 0),
    })),
  ];
  for (const keyword of keywords) validateKeywordTexts(keyword.texts, `${keyword.kind} "${keyword.id}"`, fail);
  return keywords;
}

export const MARBLE_KEYWORDS = buildMarbleKeywords({ phases: MARBLE_PHASES, triggers: MARBLE_TRIGGERS, pocket: MARBLE_POCKET, actions: CLAUSE_ACTIONS });

// Les mots-clés présents sur une bille, dans l'ordre de l'aide, chacun une fois :
// [{ id, kind, texts }].
export function keywordsOf(marble, types) {
  return MARBLE_KEYWORDS.filter((keyword) => keyword.present(marble, types)).map(({ id, kind, texts }) => ({ id, kind, texts }));
}

// --- Table des billes ---

// Échoue sur une table mal formée. La vraie est validée au démarrage
// (validateMarblesContent) ; exportée aussi pour vérifier le rejet sur des tables
// fabriquées.
export function validateMarbleTypes(types) {
  const fail = (message) => {
    throw new Error(`marbles : ${message}`);
  };
  if (Object.keys(types).length === 0) fail("table des billes vide.");
  for (const [id, type] of Object.entries(types)) {
    rejectUnknownFields(type, [...EFFECT_FIELDS, "baseVariant", MARBLE_POCKET.field, "maxWear", "size"], `bille "${id}"`, fail);
    // Le calibre, obligatoire : lu par les conditions de calibre et par le son.
    if (!isMarbleSize(type.size)) fail(`bille "${id}" : calibre (size) absent ou inconnu "${type.size}".`);
    for (const field of EFFECT_FIELDS) {
      if (type[field] !== undefined) validateEffect(type[field], `bille "${id}", ${field}`, fail, { ...FIELD_CONTEXTS[field], tallies: TALLY_IDS });
    }
    // En poche : un objet { <moment>: effet }, chaque effet joué par une bille dans
    // le pot (règle des cibles selon son moment ; rien sur la bille elle-même) : un
    // moment fixe, ou une occurrence écoutable (REACTION_KEYS).
    const pocketed = type[MARBLE_POCKET.field];
    if (pocketed !== undefined) {
      const describe = `bille "${id}", ${MARBLE_POCKET.field}`;
      if (pocketed === null || typeof pocketed !== "object" || Array.isArray(pocketed)) fail(`${describe} : un objet de moments.`);
      for (const key of Object.keys(pocketed)) {
        // Une valeur de partie qui n'est pas écoutable : le dire plutôt qu'« inconnu ».
        if (TALLY_IDS.has(key) && !REACTION_KEYS.includes(key)) fail(`${describe} : « ${key} » ne s'écoute pas (quantité réelle, Vitesse ou Masse, ou réaction).`);
      }
      rejectUnknownFields(pocketed, [...FIXED_MOMENTS.map((moment) => moment.id), ...REACTION_KEYS], describe, fail);
      for (const moment of FIXED_MOMENTS) {
        const effect = pocketClauses(type, moment);
        if (effect !== null) validateEffect(effect, `${describe}.${moment.id}`, fail, { moment: moment.moment, marble: "pot", tallies: TALLY_IDS });
      }
      for (const key of REACTION_KEYS) {
        const effect = reactionClauses(type, key);
        if (effect === null) continue;
        validateEffect(effect, `${describe}.${key}`, fail, { moment: REACTIVE_MOMENT.moment, marble: "pot", tallies: TALLY_IDS });
        // La boucle directe : réagir au déclenchement d'une action qu'on produit
        // soi-même (« à chaque polissage : Polissage 1 ») se relancerait sans fin.
        if (COUNTER_CATEGORIES[key] === "action" && effect.some((clause) => clause.action === key)) {
          fail(`${describe}.${key} : réagit à « ${key} » en le produisant, une boucle sans fin.`);
        }
      }
    }
    if (type.baseVariant !== undefined) {
      rejectUnknownFields(type.baseVariant, ["leftBase", "rightBase"], `bille "${id}", baseVariant`, fail);
      for (const [slot, effect] of Object.entries(type.baseVariant)) {
        validateEffect(effect, `bille "${id}", baseVariant.${slot}`, fail, { phaseSlots: [slot], tallies: TALLY_IDS });
      }
    }
    if (type.maxWear !== undefined && (!Number.isInteger(type.maxWear) || type.maxWear < 1)) {
      fail(`bille "${id}" : maxWear doit être un entier >= 1.`);
    }
  }
}

// La valeur fausse échouerait sinon en pleine partie. Aucun minimum lié au
// triangle : le joueur est seul responsable de ses poses, et la résolution se lance
// quel que soit l'état du triangle, au premier tour comme ensuite. Un sac vide fait
// une partie qui s'arrête à la première pioche, faute de billes.
export function validateGameSettings({ maxHandSize, throwsPerTurn, potCapacity, firstTurnDraw, drawPerTurn, turnCount, bag }, types) {
  const positive = { maxHandSize, throwsPerTurn, firstTurnDraw, drawPerTurn, turnCount };
  for (const [name, value] of Object.entries(positive)) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`marbles : ${name} doit être un entier >= 1.`);
  }
  // Un pot de capacité 0 se conçoit : toute bille empochée y serait perdue.
  if (!Number.isInteger(potCapacity) || potCapacity < 0) throw new Error("marbles : potCapacity doit être un entier >= 0.");
  if (maxHandSize < firstTurnDraw) throw new Error("marbles : maxHandSize doit valoir au moins firstTurnDraw.");
  for (const id of bag) {
    if (!Object.hasOwn(types, id)) throw new Error(`marbles : bille inconnue "${id}" dans le sac.`);
  }
}

// Le contenu du jeu des billes, au démarrage (main.js, l'audit du contenu) : la
// table, et les réglages avec le sac de test, qui ne doit citer que des billes
// connues. Une erreur ici échouerait sinon en pleine partie.
export function validateMarblesContent(types) {
  validateMarbleTypes(types);
  validateGameSettings({ ...MARBLES_SETTINGS, bag: STARTING_BAG }, types);
}

export function maxWearOf(marble, types) {
  return types[marble].maxWear ?? MARBLES_SETTINGS.defaultMaxWear;
}
