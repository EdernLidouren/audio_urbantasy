// Jeu des billes : le REGISTRE DES VALEURS DE PARTIE (Tally). Des compteurs déclarés
// une seule fois (config/marbles-values.js/MARBLE_TALLIES), tenus dans l'état de la
// partie (`tally`, { <id>: nombre }, sérialisé avec lui) et alimentés par le journal :
// core/marbles.js passe chaque évènement à recordTally À SON ÉMISSION, avant que le
// bus ne le traite, donc avant que les billes n'y réagissent. Une Chiquenaude qui
// compte « par chiquenaude ce tour » se compte donc elle-même ; une Trouvaille qui
// compte « par trouvaille cette partie », sa propre régénération.
//
// Ce module est le SEUL à écrire les valeurs : recordTally (augmenter, remettre à
// zéro les compteurs du tour) et emptyTally (le départ d'une partie). Tout le reste
// les lit par tallyValue : les sources de montant (core/marbles-effects.js), la
// prévision (qui les fait évoluer sur sa copie par le même chemin), le menu de debug
// et, plus tard, les succès.
//
// Pur : aucun état caché, chaque fonction rend un nouveau registre.

import { MARBLE_SIZES, MARBLE_TALLIES } from "../config/marbles-values.js";
import { rejectUnknownFields } from "../lib/validate.js";

export const TALLY_SCOPES = ["turn", "game"];

// L'évènement qui ouvre un tour : les compteurs de portée "turn" y reviennent à
// zéro, avant d'en tenir compte (un compteur du tour qui le compterait vaudrait 1).
const TURN_START = "turnStarted";

// Les filtres d'un compteur, sur le modèle des conditions des billes : ses champs,
// leur validation, et le test d'un évènement (qui nomme une bille connue).
const TALLY_FILTERS = {
  // La bille que nomme l'évènement est de calibre `size`.
  size: {
    fields: ["type", "size"],
    validate(filter, describe, fail) {
      if (!Number.isInteger(filter.size) || !Object.hasOwn(MARBLE_SIZES, filter.size)) fail(`${describe} : calibre inconnu "${filter.size}".`);
    },
    test: (filter, event, types) => types[event.marble].size === filter.size,
  },
};

// Échoue sur une liste de compteurs mal formée (config/marbles-values.js, décrite
// là). `journalEvents` : les types d'évènements du journal, chacun avec vrai s'il
// nomme toujours une bille connue (core/marbles.js/JOURNAL_EVENTS). La vraie liste
// est validée au chargement de core/marbles.js ; les textes, par le domaine
// marbles-view.
export function validateTallies(tallies, journalEvents) {
  const fail = (message) => {
    throw new Error(`marbles, valeurs de partie : ${message}`);
  };
  if (!Array.isArray(tallies)) fail("la liste des compteurs doit être une liste.");
  const seen = new Set();
  for (const tally of tallies) {
    const describe = `compteur "${tally?.id}"`;
    rejectUnknownFields(tally, ["id", "scope", "events", "filter", "texts"], describe, fail);
    if (typeof tally.id !== "string" || tally.id === "") fail(`${describe} : id doit être un texte.`);
    if (seen.has(tally.id)) fail(`${describe} : id en double.`);
    seen.add(tally.id);
    if (!TALLY_SCOPES.includes(tally.scope)) fail(`${describe} : portée inconnue "${tally.scope}".`);
    if (!Array.isArray(tally.events) || tally.events.length === 0) fail(`${describe} : events doit être une liste non vide.`);
    for (const event of tally.events) {
      if (!Object.hasOwn(journalEvents, event)) fail(`${describe} : évènement inconnu "${event}".`);
    }
    if (tally.filter !== undefined) {
      const filter = TALLY_FILTERS[tally.filter?.type];
      if (!filter) fail(`${describe} : filtre inconnu "${tally.filter?.type}".`);
      rejectUnknownFields(tally.filter, filter.fields, describe, fail);
      filter.validate(tally.filter, describe, fail);
      // Le filtre lit la bille de l'évènement : elle doit toujours être connue, même
      // dans la prévision, où une bille piochée est cachée.
      const blind = tally.events.filter((event) => !journalEvents[event]);
      if (blind.length > 0) fail(`${describe} : un filtre exige des évènements qui nomment une bille connue, pas "${blind.join('", "')}".`);
    }
    rejectUnknownFields(tally.texts, ["name", "source"], describe, fail);
    if (typeof tally.texts?.name !== "string" || typeof tally.texts?.source !== "string") fail(`${describe} : textes name et source obligatoires.`);
  }
}

// Le registre d'une partie neuve : chaque compteur à zéro.
export function emptyTally(tallies = MARBLE_TALLIES) {
  return Object.fromEntries(tallies.map((tally) => [tally.id, 0]));
}

// Le registre après un évènement émis : au début d'un tour, les compteurs du tour
// reviennent à zéro ; puis chaque compteur que l'évènement concerne (son type, son
// filtre) gagne 1. Rend le même objet si rien ne change. `types` : la table des
// billes, pour les filtres.
export function recordTally(tally, event, types, tallies = MARBLE_TALLIES) {
  let next = tally;
  const set = (id, value) => {
    if (next[id] !== value) next = { ...next, [id]: value };
  };
  if (event.type === TURN_START) for (const counter of tallies) if (counter.scope === "turn") set(counter.id, 0);
  for (const counter of tallies) {
    if (!counter.events.includes(event.type)) continue;
    if (counter.filter !== undefined && !TALLY_FILTERS[counter.filter.type].test(counter.filter, event, types)) continue;
    set(counter.id, next[counter.id] + 1);
  }
  return next;
}

// LA lecture publique : la valeur d'un compteur. Un identifiant inconnu est une
// erreur de programmation, jamais un zéro silencieux.
export function tallyValue(tally, id) {
  if (!Object.hasOwn(tally, id)) throw new Error(`marbles : valeur de partie inconnue "${id}".`);
  return tally[id];
}
