// Jeu des billes : les COMPTEURS des valeurs de partie, générés ou déclarés, en une
// seule liste (le registre qui les tient : core/marbles-tally.js). Chacun :
//   { id, category, listenable, count(event, context) }
// `count` dit ce qu'un évènement du journal lui apporte (0 s'il ne le concerne pas),
// lu à l'émission ; `context` : { state, types }, l'état à l'émission et la table des
// billes. Ses textes découlent de son id : `marbles.tally.<id>.name` (le menu de
// debug, au pluriel) et `marbles.tally.<id>.unit` (« par chiquenaude »).
//
// QUATRE CATÉGORIES, dans l'ordre du menu de debug :
//   "trigger"  les MOTS-CLÉS DE DÉCLENCHEMENT, générés : un par déclencheur
//              (config/marbles-values.js/MARBLE_TRIGGERS) et par phase (pointe,
//              base, base gauche, base droite), et par moment du mot-clé En poche
//              (MARBLE_POCKET : pocketEntry, pocketResolution), sous l'id du mot-clé
//              ou de l'effet du moment. +1, par bille,
//              quand le mot-clé se déclenche chez une bille qui a un effet pour ce
//              moment : son champ n'est pas vide (pour une base, l'effet de base ou
//              sa variante de l'emplacement), ou elle a reçu un effet extérieur pour
//              ce moment (un bonus ciblé sur sa phase). Un effet dont la condition
//              est fausse compte (le champ existe) ; une phase sautée ne compte pas
//              (elle n'émet pas `phase`) ;
//   "action"   les ACTIONS MOTS-CLÉS, générées depuis core/marbles-effects.js/
//              CLAUSE_ACTIONS (celles qui déclarent `keyword`) : leurs
//              déclenchements, sous l'id de l'action, et, si elles en déclarent
//              une, leur quantité réelle, sous `<id>Quantity` ;
//   "stat"     VITESSE ET MASSE, générées depuis les actions de valeur qui ne sont
//              pas des mots-clés : pour chacune, `<id>Gains` et `<id>Losses` (les
//              occurrences de valeurs positives, négatives), `<id>Gained` et
//              `<id>Lost` (les totaux, en valeur absolue). Les valeurs sont celles
//              d'un évènement `effect`, celles réellement appliquées aux compteurs
//              du tour : bonus reçu compris, bonus perdu jamais appliqué, avant les
//              planchers de l'Impact ; une occurrence par effet joué ;
//   "event"    les ÉVÈNEMENTS RÉELS, déclarés (config/marbles-values.js/
//              MARBLE_TALLIES).
//
// Un mot-clé et l'évènement auquel il réagit sont deux compteurs : une pose sur un
// emplacement occupé dont l'occupante n'a pas d'Éjection donne +1 bille éjectée
// (ejectedMarbles), +0 éjection (knockout).
//
// ÉCOUTABLE (`listenable`) : une bille du pot peut réagir à chacun de ses incréments
// (En poche, à chaque (occurrence) : config/marbles-values.js/MARBLE_POCKET). Le
// sont les évènements réels, les déclenchements de mots-clés (déclencheurs, phases,
// moments fixes d'En poche) et ceux des actions. Ne le sont pas : les quantités
// réelles et Vitesse et Masse (« stat »), qui comptent des points plutôt que des
// occurrences, ni les réactions elles-mêmes (un moment déclaré non écoutable), qui
// se répondraient sans fin. Un compteur ajouté d'une catégorie écoutable l'est par
// construction.

import { MARBLE_SIZES } from "../config/marbles-values.js";
import { effectAt } from "./marbles-effects.js";
import { rejectUnknownFields } from "../lib/validate.js";

export const TALLY_CATEGORIES = ["trigger", "action", "stat", "event"];

// La bille a-t-elle quelque chose dans ce champ ? Une bille inconnue (piochée à
// l'aveugle dans la prévision) ne déclenche jamais rien : elle ne compte pas.
function hasField(types, marble, field) {
  return marble !== null && marble !== undefined && (types[marble][field]?.length ?? 0) > 0;
}

// Un déclencheur (MARBLE_TRIGGERS) : la bille concernée est celle que nomme son
// évènement, sur l'emplacement, retirée ou en cours de lancer.
function triggerCounter(trigger) {
  return {
    id: trigger.id,
    category: "trigger",
    listenable: true,
    count: (event, { types }) => (event.type === trigger.event && hasField(types, event.marble, trigger.field) ? 1 : 0),
  };
}

// Une phase : `slots`, les emplacements où ce mot-clé joue. Effet de phase de la
// bille à cet emplacement, ou bonus reçu pour cette phase (un effet extérieur).
function phaseCounter({ id, slots }) {
  return {
    id,
    category: "trigger",
    listenable: true,
    count(event, { state, types }) {
      if (event.type !== "phase" || !slots.includes(event.slot)) return 0;
      const ownEffect = effectAt(event.marble, event.slot, types).length > 0;
      const received = state.triangle[event.slot]?.bonus !== undefined;
      return ownEffect || received ? 1 : 0;
    },
  };
}

// Un moment du mot-clé En poche (à l'entrée, à chaque résolution, à chaque
// occurrence) : la bille du pot que nomme son évènement, si elle a un effet pour ce
// moment (`clauses(event, types)`, celles de cet évènement). `listenable` : vrai sauf
// pour les réactions.
function pocketMomentCounter({ id, event: eventType, clauses, listenable }) {
  return {
    id,
    category: "trigger",
    listenable,
    count: (event, { types }) => (event.type === eventType && event.marble !== null && (clauses(event, types)?.length ?? 0) > 0 ? 1 : 0),
  };
}

// Une action mot-clé : `keyword.triggers`, ses déclenchements ; `keyword.quantity`
// (facultatif), sa quantité réelle.
function actionCounters(id, { keyword }) {
  const counters = [{ id, category: "action", listenable: true, count: keyword.triggers }];
  if (keyword.quantity) counters.push({ id: `${id}Quantity`, category: "action", listenable: false, count: keyword.quantity });
  return counters;
}

// Un compteur du tour (Vitesse, Masse) : ses gains et ses pertes, lus dans les
// valeurs appliquées d'un effet joué (`<id>Delta`).
function statCounters(id) {
  const delta = (event) => (event.type === "effect" ? event[`${id}Delta`] : 0);
  return [
    { id: `${id}Gains`, category: "stat", listenable: false, count: (event) => (delta(event) > 0 ? 1 : 0) },
    { id: `${id}Gained`, category: "stat", listenable: false, count: (event) => Math.max(0, delta(event)) },
    { id: `${id}Losses`, category: "stat", listenable: false, count: (event) => (delta(event) < 0 ? 1 : 0) },
    { id: `${id}Lost`, category: "stat", listenable: false, count: (event) => Math.max(0, -delta(event)) },
  ];
}

// Les filtres d'un compteur d'évènement, sur le modèle des conditions des billes :
// leurs champs, leur validation, et le test d'un évènement (qui nomme une bille
// connue).
const EVENT_FILTERS = {
  // La bille que nomme l'évènement est de calibre `size`.
  size: {
    fields: ["type", "size"],
    validate(filter, describe, fail) {
      if (!Number.isInteger(filter.size) || !Object.hasOwn(MARBLE_SIZES, filter.size)) fail(`${describe} : calibre inconnu "${filter.size}".`);
    },
    test: (filter, event, types) => types[event.marble].size === filter.size,
  },
};

// Un évènement réel déclaré (MARBLE_TALLIES).
function eventCounter({ id, events, match = {}, filter }) {
  return {
    id,
    category: "event",
    listenable: true,
    count(event, { types }) {
      if (!events.includes(event.type)) return 0;
      if (!Object.entries(match).every(([field, value]) => event[field] === value)) return 0;
      if (filter !== undefined && !EVENT_FILTERS[filter.type].test(filter, event, types)) return 0;
      return 1;
    },
  };
}

// Échoue sur une liste de compteurs d'évènements mal formée (config/marbles-values.js/
// MARBLE_TALLIES, décrite là). `journalEvents` : les types d'évènements du journal,
// chacun avec vrai s'il nomme toujours une bille connue (core/marbles.js/
// JOURNAL_EVENTS).
export function validateEventTallies(tallies, journalEvents) {
  const fail = (message) => {
    throw new Error(`marbles, valeurs de partie : ${message}`);
  };
  if (!Array.isArray(tallies)) fail("la liste des compteurs doit être une liste.");
  for (const tally of tallies) {
    const describe = `compteur "${tally?.id}"`;
    rejectUnknownFields(tally, ["id", "events", "match", "filter"], describe, fail);
    if (typeof tally.id !== "string" || tally.id === "") fail(`${describe} : id doit être un texte.`);
    if (!Array.isArray(tally.events) || tally.events.length === 0) fail(`${describe} : events doit être une liste non vide.`);
    for (const event of tally.events) {
      if (!Object.hasOwn(journalEvents, event)) fail(`${describe} : évènement inconnu "${event}".`);
    }
    if (tally.match !== undefined) {
      if (tally.match === null || typeof tally.match !== "object" || Array.isArray(tally.match)) fail(`${describe} : match doit être un objet.`);
      if (Object.values(tally.match).some((value) => value !== null && typeof value === "object")) fail(`${describe} : match n'attend que des valeurs simples.`);
    }
    if (tally.filter !== undefined) {
      const filter = EVENT_FILTERS[tally.filter?.type];
      if (!filter) fail(`${describe} : filtre inconnu "${tally.filter?.type}".`);
      rejectUnknownFields(tally.filter, filter.fields, describe, fail);
      filter.validate(tally.filter, describe, fail);
      // Le filtre lit la bille de l'évènement : elle doit toujours être connue, même
      // dans la prévision, où une bille piochée est cachée.
      const blind = tally.events.filter((event) => !journalEvents[event]);
      if (blind.length > 0) fail(`${describe} : un filtre exige des évènements qui nomment une bille connue, pas "${blind.join('", "')}".`);
    }
  }
}

// TOUS les compteurs, dans l'ordre du menu (catégories, puis l'ordre de leur source) :
//   triggers  les déclencheurs (MARBLE_TRIGGERS) ;
//   phases    les mots-clés de phase, [{ id, slots }] ;
//   pocketMoments  les moments du mot-clé En poche, [{ id, event, clauses(event,
//             types), listenable }] ;
//   actions   les actions de clause (CLAUSE_ACTIONS) ;
//   events    les évènements réels déclarés (MARBLE_TALLIES) ;
//   journalEvents  pour valider ces derniers.
// Un déclencheur ou une action ajoutés à leur liste ont leurs compteurs ici, sans
// autre modification. Échoue sur un identifiant en double.
export function buildTallyCounters({ triggers, phases, pocketMoments = [], actions, events, journalEvents }) {
  validateEventTallies(events, journalEvents);
  const keywordActions = Object.entries(actions).filter(([, action]) => action.keyword !== undefined);
  const statActions = Object.entries(actions).filter(([, action]) => action.keyword === undefined && action.kind === "value");
  const counters = [
    ...triggers.map(triggerCounter),
    ...phases.map(phaseCounter),
    ...pocketMoments.map(pocketMomentCounter),
    ...keywordActions.flatMap(([id, action]) => actionCounters(id, action)),
    ...statActions.flatMap(([id]) => statCounters(id)),
    ...events.map(eventCounter),
  ];
  const seen = new Set();
  for (const { id } of counters) {
    if (seen.has(id)) throw new Error(`marbles, valeurs de partie : identifiant "${id}" en double.`);
    seen.add(id);
  }
  return counters;
}
