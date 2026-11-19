// JEU DES BILLES — le CATALOGUE : ce que la partie sait des déclarations avant de
// jouer, lu pendant la partie. Simulation pure, sans DOM, sans son, sans hasard. Ici :
// la validation, à son chargement, des déclarations dont il est fait (déclencheurs,
// phases, moments En poche : marbles/config/values.js), les valeurs de partie
// (TALLY_COUNTERS, et les clés écoutables), les mots-clés (MARBLE_KEYWORDS,
// keywordsOf), les statuts qu'une bille applique, l'usure maximale d'une bille
// (maxWearOf), et le journal : ses types d'évènements (JOURNAL_EVENTS), décrits
// ci-dessous. La validation des tables injectées vit à part (marbles/core/
// validation.js) ; la carte des modules : en-tête de marbles/core/marbles.js.
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
//   polished { slot, marble, amount, applied, wear, maxWear, retires },
//   cracked { slot, marble, amount, applied, wear, maxWear, retires },
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
//   tierReached { tier, score },
//   rotation { triangle, notches }, turnEnded { turn }, gameOver { score, result },
//   statusGained { status, intensity, remaining, pending, kind, stacking, by },
//   statusStrengthened { status, intensity, remaining, pending, kind, stacking, by },
//   statusUnchanged { status, by, locked? }, statusActivated { status },
//   statusCharge { status, remaining }, statusExpired { status },
//   statusReaction { status, counter },
//   valueModified { point, before, after, contributions, by? }.
// LES STATUTS (marbles/core/statuses.js) : `statusGained`, une instance neuve, donnée
// par l'effet `by` (Appliquer un statut) ; `statusStrengthened`, le statut déjà là
// fusionné, son intensité et ce qui lui reste d'après (`kind`, la sorte de sa durée,
// et `stacking`, son cumul, pour le dire) ; `statusUnchanged`, un statut
// unique déjà là, ou une règle (`locked`, verrouillée), sans effet ; `statusActivated`, un statut « le prochain tour »
// qui s'active au début du tour ; `statusCharge`, une charge consommée (`remaining`,
// celles qui restent) ; `statusExpired`, sa fin (fin de tour, après la rotation, ou
// dernière charge) ; `statusReaction`, un statut réagit à un incrément du compteur
// `counter`, comme une bille du pot. `valueModified` : des statuts ont changé une
// valeur à un point d'interception (`point`, MODIFIER_POINTS), de `before` à
// `after`, pas par pas (`contributions`, [{ status, before, after }]) ; l'effet ou
// l'Impact porte déjà la valeur finale, cet évènement les explique (l'historique,
// les charges). Un `effect` d'une réaction de statut a `trigger` "statusReaction",
// `status`, et ni bille ni emplacement (null).
// LA FIN DE PARTIE (marbles/core/definitions.js) : `tierReached`, une partie libre
// dont l'Impact vient de faire passer le score à un palier supérieur (`tier`, le plus
// haut atteint) ; `gameOver`, la partie s'arrête, avec son résultat selon l'objectif
// (`result`, gameResult : { goal, end, score, tier | outcome | held, outcome }).
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
// LE CHEMIN D'UNE BILLE (marbles/core/path.js/travel) : `removed` (son départ du
// triangle, avec sa cause), son déclencheur de sortie (`final`, `knockout`) réglé
// pendant qu'elle est en partance, une `redirected` éventuelle, puis son arrivée,
// `discarded` (la défausse, depuis `from` : "triangle" et son `slot`, "hand" ou
// "discard" et son `index`, "bag"), `pocketed` ou `lost`.
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
// `cause` : "replacement", "wear", "eject", ou l'action qui déplace la bille
// ("pocket", "discard", "bounce", "retrieve"). `trigger` : "phase", l'id d'un
// déclencheur (marbles/config/values.js/MARBLE_TRIGGERS : "awaken", "flick", "hit",
// "windfall", "knockout", "final", "drop"), d'un moment En poche (MARBLE_POCKET :
// "pocketEntry", "pocketResolution", "pocketReaction"), ou "statusReaction" (la
// réaction d'un statut).
// `final` : une bille usée vient de quitter `slot` ; en partance, pas encore arrivée.
// `pocketed` : une bille entre au pot (Empocher) depuis `from` ("triangle", et son
// `slot` ; "hand" ou "discard", et son `index`), produite par l'effet `by`
// ({ trigger, slot, marble }) ; `potIndex`, sa place d'arrivée au pot (la dernière) ;
// ses effets d'entrée (En poche) se règlent aussitôt, une interruption. `lost` : la même, le pot étant plein : perdue, sans effet
// d'entrée. Depuis le triangle, un `removed` de cause "pocket" les précède : ce
// n'est ni une usure ni une éjection, ni Final ni Éjection.
// `potResolution` : une fois par tour, après les phases et avant les retraits,
// chaque bille du pot dans l'ordre d'arrivée (`index`), pour son effet En poche à
// chaque résolution.
// `pocketReaction` : une bille du pot (`index`, sa place d'arrivée) réagit à un
// incrément du compteur écoutable `counter` (En poche, à chaque (occurrence)), une
// fois par incrément ; voir marbles/core/run.js/reactionsOf.
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
// (Terminer, dans un choix facultatif, après au moins un choix), "declined"
// (Terminer sans rien avoir choisi : l'action est ignorée) ou "exhausted" (plus
// aucune cible éligible).
// Aucune cible éligible dès le départ : `targetEmpty` de `target` "choice", et rien
// ne s'ouvre. `choiceUndecided` : à l'aveugle seulement (la prévision), un choix
// que personne n'a tranché : son action n'est pas appliquée.
// `targetEmpty` : une action sur une bille sans bille à prendre, produite par
// l'effet `by` ({ trigger, slot, marble }, comme pocketed et lost) : `slot` vide ;
// ou `slot` null et `target` : "firstInHand" (main vide), "self" (la bille,
// `marble`, n'est plus là), "choice" (aucune cible à choisir), "all" (aucune bille
// visée), "bag" (sac vide), "lastDiscarded" (défausse vide), "handFull" (main
// pleine, Ramasser), "noReference" (une cible relative sans emplacement de
// référence).
// draw `cause` : "turn" (la pioche du début de tour) ou "effect" (une Pioche).
// polished, cracked `applied` : l'usure réellement rendue ou ajoutée, après plancher
// ou plafond (`amount` : celle demandée, statuts compris) ; `retires` : la bille
// atteint son maximum par une Fêlure, et part aussitôt.
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

import { MARBLES_SETTINGS, MARBLE_PHASES, MARBLE_POCKET, MARBLE_TALLIES, MARBLE_TRIGGERS } from "../config/values.js";
import { rejectUnknownFields } from "../../lib/validate.js";
import { CLAUSE_ACTIONS, clauseBranches, effectAt } from "./effects.js";
import { SLOTS } from "./zones.js";
import { buildTallyCounters } from "./counters.js";

// Les types d'évènements du journal (voir l'en-tête), chacun avec vrai s'il nomme
// toujours une bille CONNUE, même dans la prévision : faux pour la pioche, dont la
// bille y est cachée, et pour ceux qui ne nomment aucune bille (un `effect` d'une
// réaction de statut n'en a pas). Lu par la validation
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
  // Celui d'une réaction de statut ne nomme aucune bille.
  effect: false,
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
  tierReached: false,
  rotation: false,
  turnEnded: false,
  gameOver: false,
  statusGained: false,
  statusStrengthened: false,
  statusUnchanged: false,
  statusActivated: false,
  statusCharge: false,
  statusExpired: false,
  statusReaction: false,
  valueModified: false,
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
    rejectUnknownFields(trigger, ["id", "field", "event", "marble", "moment", "replacement", "scope", "atLeast", "forecast", "texts", "card"], describe, fail);
    if (trigger.replacement !== undefined && typeof trigger.replacement !== "boolean") fail(`${describe} : replacement doit valoir true ou false.`);
    if (trigger.scope !== undefined && !["self", "any"].includes(trigger.scope)) fail(`${describe} : scope inconnu "${trigger.scope}" (self, any).`);
    if (trigger.scope !== undefined && trigger.marble !== "onSlot") fail(`${describe} : scope ne vaut que pour une bille sur le triangle (onSlot).`);
    if (trigger.atLeast !== undefined && (trigger.atLeast === null || typeof trigger.atLeast !== "object" || !Object.values(trigger.atLeast).every(Number.isInteger))) {
      fail(`${describe} : atLeast est un objet de minimums entiers.`);
    }
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
export const EFFECT_FIELDS = [...PHASE_FIELDS, ...MARBLE_TRIGGERS.map((trigger) => trigger.field)];

// Les MOMENTS du mot-clé En poche (marbles/config/values.js/MARBLE_POCKET), validés
// au chargement : chacun son id, son effet (`trigger`), son évènement et son moment.
export function validatePocketMoments(pocket) {
  const fail = (message) => {
    throw new Error(`marbles, En poche : ${message}`);
  };
  rejectUnknownFields(pocket, ["field", "texts", "moments"], "MARBLE_POCKET", fail);
  if (Array.isArray(pocket.moments) && pocket.moments.filter((moment) => moment?.reactive === true).length > 1) fail("un seul moment réactif.");
  if (typeof pocket.field !== "string" || EFFECT_FIELDS.includes(pocket.field)) fail("field doit être un champ à part.");
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
export const FIXED_MOMENTS = MARBLE_POCKET.moments.filter((moment) => moment.reactive !== true);
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
export const TALLY_IDS = new Set(TALLY_COUNTERS.map((counter) => counter.id));

// Les compteurs ÉCOUTABLES (marbles/core/counters.js), dans leur ordre, celui des
// fiches : ce qu'écoutent les réactions des statuts (marbles/core/statuses.js).
export const LISTENABLE_KEYS = TALLY_COUNTERS.filter((counter) => counter.listenable).map((counter) => counter.id);

// Les OCCURRENCES ÉCOUTABLES par une bille du pot (En poche, à chaque (occurrence)) :
// les compteurs écoutables. Aucune sans moment réactif déclaré. Une clé de moment fixe
// qui serait aussi un compteur rendrait le champ ambigu : refusé au chargement.
export const REACTION_KEYS = REACTIVE_MOMENT === null ? [] : LISTENABLE_KEYS;
for (const moment of FIXED_MOMENTS) {
  if (TALLY_IDS.has(moment.id)) throw new Error(`marbles, En poche : la clé du moment "${moment.id}" est aussi une valeur de partie.`);
}


// --- Mots-clés ---

// Toutes les clauses d'une bille, tous champs d'effet confondus (variantes de base
// comprises).
function clausesOf(type) {
  return [
    ...EFFECT_FIELDS.flatMap((field) => type[field] ?? []),
    ...Object.values(type.baseVariant ?? {}).flat(),
    ...Object.values(type[MARBLE_POCKET.field] ?? {}).flat(),
  ].flatMap(clauseBranches);
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

// Les STATUTS qu'une bille peut appliquer (Appliquer un statut), dans l'ordre de ses
// clauses, chacun une fois : l'aide E les décrit après ses mots-clés.
export function appliedStatusesOf(marble, types) {
  const ids = clausesOf(types[marble]).filter((clause) => clause.action === "applyStatus").map((clause) => clause.status);
  return [...new Set(ids)];
}

// Les mots-clés présents sur une bille, dans l'ordre de l'aide, chacun une fois :
// [{ id, kind, texts }].
export function keywordsOf(marble, types) {
  return MARBLE_KEYWORDS.filter((keyword) => keyword.present(marble, types)).map(({ id, kind, texts }) => ({ id, kind, texts }));
}

export function maxWearOf(marble, types) {
  return types[marble].maxWear ?? MARBLES_SETTINGS.defaultMaxWear;
}
