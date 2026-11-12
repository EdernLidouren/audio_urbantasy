// Jeu des billes : le REGISTRE DES VALEURS DE PARTIE (Tally). Le mécanisme seul :
// des compteurs tenus dans l'état de la partie (`tally`, { <id>: { turn, game } },
// sérialisé avec lui), chacun en deux portées, « ce tour » (`turn`) et « cette
// partie » (`game`). Quels compteurs existent et ce que chacun compte, c'est
// l'affaire de marbles/core/counters.js, qui les génère et les déclare ; ce module
// les reçoit en paramètre et n'importe rien du jeu.
//
// marbles/core/run.js passe chaque évènement du journal à recordTally À SON ÉMISSION,
// avant que le bus ne le traite, donc avant que les billes n'y réagissent : une
// Chiquenaude qui compte « par chiquenaude ce tour » se compte elle-même. Un
// compteur de quantité réelle (l'usure rendue par un Polissage…) compte l'évènement
// qui dit ce qui s'est appliqué, émis après l'application, plancher et plafond
// compris.
//
// Ce module est le SEUL à écrire les valeurs : recordTally (augmenter, remettre à
// zéro la portée du tour) et emptyTally (le départ d'une partie). Tout le reste les
// lit par tallyValue : les sources de montant (marbles/core/effects.js), la
// prévision (qui les fait évoluer sur sa copie par le même chemin), le menu de debug
// et, plus tard, les succès.
//
// Pur : aucun état caché, chaque fonction rend un nouveau registre.

// Les portées, dans l'ordre où elles se disent.
export const TALLY_SCOPES = ["turn", "game"];

// L'évènement qui ouvre un tour : la portée « ce tour » y revient à zéro, avant que
// les compteurs n'en tiennent compte, donc avant la pioche du tour.
const TURN_START = "turnStarted";

// Le registre d'une partie neuve : chaque compteur à zéro, dans ses deux portées.
// La portée « cette partie » ne revient à zéro qu'ici. `counters` : la liste des
// compteurs (marbles/core/counters.js), chacun { id, count }.
export function emptyTally(counters) {
  return Object.fromEntries(counters.map((counter) => [counter.id, { turn: 0, game: 0 }]));
}

// Le registre après un évènement émis : au début d'un tour, la portée « ce tour »
// revient à zéro ; puis chaque compteur ajoute ce que l'évènement lui apporte
// (`count(event, context)`, 0 s'il ne le concerne pas), dans ses deux portées.
// `context` : { state, types }, l'état à l'émission et la table des billes. Rend le
// même objet si rien ne change.
export function recordTally(tally, event, context, counters) {
  let next = tally;
  if (event.type === TURN_START) {
    next = Object.fromEntries(Object.entries(next).map(([id, values]) => [id, values.turn === 0 ? values : { ...values, turn: 0 }]));
    if (Object.keys(next).every((id) => next[id] === tally[id])) next = tally;
  }
  for (const counter of counters) {
    const added = counter.count(event, context);
    if (added === 0) continue;
    const values = next[counter.id];
    next = { ...next, [counter.id]: { turn: values.turn + added, game: values.game + added } };
  }
  return next;
}

// LA lecture publique : la valeur d'un compteur dans une portée. Un identifiant ou
// une portée inconnus sont une erreur de programmation, jamais un zéro silencieux.
export function tallyValue(tally, id, scope) {
  if (!Object.hasOwn(tally, id)) throw new Error(`marbles : valeur de partie inconnue "${id}".`);
  if (!TALLY_SCOPES.includes(scope)) throw new Error(`marbles : portée inconnue "${scope}" pour la valeur de partie "${id}".`);
  return tally[id][scope];
}
