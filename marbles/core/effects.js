// Jeu des billes : le MODÈLE D'EFFET. Un effet est une liste de clauses, de la
// donnée (format : en-tête de marbles/config/values.js). Ce module sait la
// valider, lire ce qu'une bille a d'imprimé et l'évaluer sur un triangle ; pur,
// il ne touche à aucun état : appliquer le résultat est l'affaire de
// marbles/core/run.js.
//
// AJOUTER une action ou une condition : une entrée dans CLAUSE_ACTIONS ou
// CONDITIONS, et ses textes dans la vue (marbles/view/narration/effects.js,
// ACTION_TEXTS ou CONDITION_TEXTS). AJOUTER une source de montant : une entrée dans AMOUNT_SOURCES,
// textes compris, rien d'autre ; chaque valeur de partie en est une d'office, par la
// source `tally` (marbles/core/counters.js). Une cible est un emplacement, rien pour la bille
// elle-même, ou un CHOIX du joueur (plus bas).
//
// CIBLE AU CHOIX : `target` vaut { type: "choice", zones, pick, count, mode } :
//   zones  où le joueur choisit, des zones de CHOICE_ZONES (aujourd'hui "hand",
//          "triangle" et "discard" ; le pot et le sac sont déclarés, pas encore
//          disponibles) ;
//   pick   ce qui se choisit sur le triangle : "marble", une bille active
//          (emplacement occupé), ou "slot", un emplacement, vide compris, pour une
//          action qui y a un sens (aucune aujourd'hui) ;
//   count  le nombre N de choix, au moins 1 ;
//   mode   le MODE du choix, explicite, toujours déclaré (CHOICE_MODES) :
//          "optional", FACULTATIF, N choix au plus, moins permis, aucun compris (le
//          joueur ne choisit rien : l'action est ignorée, le journal le note) ;
//          "required", OBLIGATOIRE, exactement N (moins s'il n'y a pas assez de
//          cibles).
// Seules les actions qui déclarent `choice` (leurs zones et ce qu'elles visent)
// l'acceptent. Les choix se font un par un, au déclenchement, sur les cibles valides
// à cet instant (marbles/core/run.js/chooseTargets) ; l'action s'applique ensuite à
// chacune, dans l'ordre des choix.
//
// CIBLE « TOUTES » : `target` vaut { type: "all", filters? } : toutes les billes
// actives, au déclenchement, dans l'ordre horaire (SLOTS), qui passent TOUS les filtres
// (TARGET_FILTERS : aujourd'hui le calibre, { type: "size", size }). Seules les
// actions qui déclarent `all` l'acceptent (Éjecter).
//
// LA SITUATION d'un effet, ce que ses conditions et ses montants calculés lisent au
// déclenchement : { triangle, holder, replacement, tally } ;
//   triangle     le triangle à cet instant ;
//   holder       la bille qui joue l'effet, { marble, zone, turnsInHand } : `zone`
//                dit où elle est (HOLDER_ZONES : "triangle" ; "leaving", en
//                partance, le Final et l'Éjection ; "discard", à la défausse, la
//                Chute ; "thrown", en cours de lancer, la
//                Chiquenaude ; "hand", l'Éveil ; "pot") ; `turnsInHand`, son
//                compteur de tours en main (0 hors de la main ; pendant son lancer,
//                celui qu'elle avait en la quittant) ;
//   replacement  pendant un Tic ou une Éjection, le remplacement en cours,
//                { placed, ejected } (deux ids de bille) ; null sinon ;
//   tally        les valeurs de partie à cet instant (marbles/core/tally.js), lues
//                par tallyValue seulement.
//
// La VALIDATION reçoit un contexte (validateEffect) : le moment où l'effet joue
// (règle des cibles, conditions) et `tallies`, les identifiants des valeurs de
// partie (marbles/core/content.js les fournit), que vérifie la source `tally`.
//
// MONTANT CALCULÉ : `amount` est un entier, ou { base, step, source, max? } :
// base + step × la valeur de `source` (AMOUNT_SOURCES), plafonné à `max` s'il est
// donné, évalué au déclenchement (amountOf). Le seul mécanisme d'un montant qui
// dépend du moment : « Vitesse +1 par minibille active » en est un, base 0, pas 1,
// source activeSize.
// Une condition ne lit jamais un effet déjà modifié (printedStat lit l'effet
// IMPRIMÉ) ; le calibre est statique : aucune dépendance circulaire.
//
// DEUX SORTES D'ACTIONS (`kind`) : les VALEURS (Vitesse, Masse, Pioche), qui
// s'additionnent en un effet, et les actions SUR UNE BILLE (Polissage, Fêlure,
// Empocher, Éjecter), qui agissent sur la bille elle-même, sur celle d'un
// emplacement ou sur des billes choisies, une application par clause, dans l'ordre
// des clauses, après les valeurs.
//
// RÈGLE DES CIBLES : une cible n'a de sens que si l'effet ciblé peut encore se
// produire. Une VALEUR (Vitesse, Masse) donnée à un emplacement modifie l'effet de
// PHASE de sa bille : elle ne vaut que si cette phase peut encore avoir lieu ce
// tour. La validation refuse les cas toujours impossibles (targetProblem) ; les cas
// qui dépendent de la position se tranchent à l'exécution (marbles/core/run.js/
// fireEffect : le bonus est perdu, l'évènement `effect` le note dans `lost`). Une
// action sur une bille peut viser un emplacement depuis n'importe quel moment, la
// bille visée restant sur le triangle. La bille elle-même, elle, n'est visable que
// là où elle est (HOLDER_ZONES) : chaque action déclare les zones où elle la prend
// (`selfZones`) ; en partance (son Final, son Éjection), Empocher la redirige
// vers le pot, Polissage, Fêlure et Éjecter ne la prennent pas.
//
// VALEURS : ce qu'un effet produit, une valeur par action, sous le nom de
// l'action (`{ speed, mass, draw }`). Le core les applique (marbles/core/run.js/fireEffect),
// la vue les dit, la prévision les rend.

import { MARBLE_SIZES } from "../config/values.js";
import { rejectUnknownFields } from "../../lib/validate.js";
import { TALLY_SCOPES, tallyValue } from "./tally.js";

// Un calibre connu (marbles/config/values.js/MARBLE_SIZES) ?
export function isMarbleSize(size) {
  return Number.isInteger(size) && Object.hasOwn(MARBLE_SIZES, size);
}

// LES EMPLACEMENTS, dans l'ORDRE HORAIRE, le seul ordre du triangle, déclaré ici
// seulement : base droite, base gauche, pointe, puis de nouveau base droite. Il est
// celui de la résolution (les phases, la pointe en dernier), des retraits par usure,
// des billes actives visées ensemble, des écouteurs du bus, de la prévision et de
// tout ce que l'écran énumère ; la disposition spatiale de l'écran, elle, n'en
// dépend pas. Il définit l'emplacement SUIVANT (nextSlot) et le PRÉCÉDENT
// (previousSlot) : la rotation de fin de tour fait avancer chaque bille vers son
// suivant.
export const SLOTS = Object.freeze(["rightBase", "leftBase", "apex"]);

function slotIndex(slot) {
  const index = SLOTS.indexOf(slot);
  if (index < 0) throw new Error(`marbles : emplacement inconnu "${slot}".`);
  return index;
}

// L'emplacement suivant dans le sens horaire : base droite -> base gauche, base
// gauche -> pointe, pointe -> base droite.
export function nextSlot(slot) {
  return SLOTS[(slotIndex(slot) + 1) % SLOTS.length];
}

// L'emplacement précédent, le sens inverse : base gauche -> base droite, pointe ->
// base gauche, base droite -> pointe.
export function previousSlot(slot) {
  return SLOTS[(slotIndex(slot) + SLOTS.length - 1) % SLOTS.length];
}

// Le même « aucun effet » partout : comparer deux effets par identité dit si
// une bille a une variante de base.
const NO_EFFECT = Object.freeze([]);

// L'effet de PHASE d'une bille à un emplacement, variante de base comprise.
export function effectAt(marble, slot, types) {
  const type = types[marble];
  if (slot === "apex") return type.apex ?? NO_EFFECT;
  return type.baseVariant?.[slot] ?? type.base ?? NO_EFFECT;
}

// Ce que des clauses donnent à coup sûr pour `stat` : les clauses sans cible
// (celles d'une autre bille ne sont pas l'effet de celle-ci), sans condition, à
// montant fixe (les évaluer rouvrirait la porte aux dépendances circulaires).
export function printedStat(clauses, stat) {
  const printed = (clause) => clause.action === stat && clause.target === undefined && clause.when === undefined && Number.isInteger(clause.amount);
  return clauses.filter(printed).reduce((total, clause) => total + clause.amount, 0);
}

// La cible « la première bille de la main », dans l'ordre affiché de la main
// (Empocher, Défausser).
export const FIRST_IN_HAND = "firstInHand";

// La cible « la dernière bille arrivée à la défausse » (Ramasser).
export const LAST_DISCARDED = "lastDiscarded";

// Une cible est-elle « les N prochaines billes du sac », { type: "bag", count }
// (Défausser) ? Elles partent du haut du sac, une par une, sans être révélées
// avant ; un sac qui en a moins donne ce qu'il a, sans régénération.
export function isBag(target) {
  return target !== null && typeof target === "object" && target.type === "bag";
}

// Les champs d'une clause. `target` n'appartient qu'aux actions qui ont un sens
// pour un autre emplacement : une action qui ne le déclare pas refuse toute cible
// à la validation. `when` : sa condition (CONDITIONS).
const TARGETED_FIELDS = ["action", "amount", "target", "when"];
const SELF_FIELDS = ["action", "amount", "when"];

// Le montant d'une clause : un entier (au moins `minimum`, s'il y en a un), ou un
// montant calculé (en-tête). Calculé, sa base peut valoir `minimum - 1` : un montant
// évalué à 0 ne produit rien.
function validateAmount(clause, describe, fail, context, minimum) {
  const { amount } = clause;
  if (Number.isInteger(amount)) {
    if (minimum !== undefined && amount < minimum) fail(`${describe} : amount doit être un entier >= ${minimum}.`);
    return;
  }
  if (amount === null || typeof amount !== "object" || Array.isArray(amount)) fail(`${describe} : amount doit être un entier ou un montant calculé.`);
  const where = `${describe}, montant calculé`;
  rejectUnknownFields(amount, ["base", "step", "source", "max"], where, fail);
  if (!Number.isInteger(amount.base)) fail(`${where} : base doit être un entier.`);
  if (minimum !== undefined && amount.base < minimum - 1) fail(`${where} : base doit être un entier >= ${minimum - 1}.`);
  if (!Number.isInteger(amount.step) || amount.step < 1) fail(`${where} : step doit être un entier >= 1.`);
  if (amount.max !== undefined && (!Number.isInteger(amount.max) || amount.max <= amount.base)) fail(`${where} : max doit être un entier plus grand que base.`);
  validateRule(amount.source, AMOUNT_SOURCES, "source", where, fail, context);
}

function validateInteger(clause, describe, fail, context) {
  validateAmount(clause, describe, fail, context);
}

function validatePositive(clause, describe, fail, context) {
  validateAmount(clause, describe, fail, context, 1);
}

// Une ARRIVÉE (en main, ou à la défausse) d'une bille que l'action `action` a
// déplacée, directement ou par une redirection (`movedBy`, marbles/core/run.js/
// arrive).
function movedArrival(event, action) {
  return (event.type === "returned" || event.type === "discarded") && event.movedBy === action;
}

// Une action SUR UNE BILLE mot-clé (Polissage, Fêlure) : un déclenchement par
// application, sur une bille (son évènement) ou sur un emplacement vide
// (`targetEmpty`) ; sa quantité réelle, l'usure réellement changée (`applied` de son
// évènement, après plancher ou plafond).
function marbleActionKeyword(action, eventType) {
  return {
    texts: { name: `marbles.keyword.${action}.name`, description: `marbles.keyword.${action}.description` },
    triggers: (event) => (event.type === eventType || (event.type === "targetEmpty" && event.action === action) ? 1 : 0),
    quantity: (event) => (event.type === eventType ? event.applied : 0),
  };
}

// Les ZONES où un joueur peut choisir une cible, déclarées ici et nulle part
// ailleurs : `available`, le choix y est possible aujourd'hui (les cibles de chaque
// zone disponible : marbles/core/run.js/CHOICE_TARGETS) ; `picks`, ce qui s'y choisit.
// Ajouter le pot ou le sac : `available` à vrai, ses cibles dans le core, ses textes
// dans la vue.
export const CHOICE_ZONES = {
  hand: { available: true, picks: ["marble"] },
  triangle: { available: true, picks: ["marble", "slot"] },
  pot: { available: false, picks: ["marble"] },
  // La défausse, dans l'ordre d'arrivée (Ramasser).
  discard: { available: true, picks: ["marble"] },
  bag: { available: false, picks: ["marble"] },
};

// Une cible est-elle un choix du joueur ?
export function isChoice(target) {
  return target !== null && typeof target === "object" && target.type === "choice";
}

// Une cible est-elle « toutes les billes actives » ?
export function isAll(target) {
  return target !== null && typeof target === "object" && target.type === "all";
}

// Les FILTRES d'une cible « toutes » (en-tête), déclarés ici et nulle part ailleurs,
// sur le modèle des conditions : `fields`, `validate`, et `test(filter, marble,
// types)`, la bille passe-t-elle le filtre. Ajouter un filtre (la matière…) : une
// entrée ici et son texte dans la vue (marbles/view/narration/effects.js/FILTER_TEXTS).
export const TARGET_FILTERS = {
  // La bille est de calibre `size` (marbles/config/values.js : SMALL, MEDIUM, LARGE).
  size: {
    fields: ["type", "size"],
    validate(filter, describe, fail) {
      validateSize(filter.size, describe, fail);
    },
    test: (filter, marble, types) => types[marble].size === filter.size,
  },
};

// Une bille passe-t-elle tous ces filtres (aucun : oui) ?
export function passesFilters(marble, filters = [], types) {
  return filters.every((filter) => TARGET_FILTERS[filter.type].test(filter, marble, types));
}

// Ajoute le montant de la clause à la valeur de son action.
function addAmount(values, clause) {
  return { ...values, [clause.action]: values[clause.action] + clause.amount };
}

// Chaque action, sur le modèle des conditions :
//   kind      "value" : elle produit une VALEUR de l'effet (`apply`), qui va aux
//             compteurs du tour, ou en bonus à la phase d'un autre emplacement si
//             elle a une cible ;
//   fields    les champs qu'elle accepte ;
//   validate  la validation de ses valeurs ;
//   apply     (valeur) ce qu'elle ajoute aux valeurs d'un effet, (values, clause) -> values ;
//   wear      (sur une bille) l'usure d'après, (wear, amount, maxWear) -> wear ;
//   event     (sur une bille) l'évènement de chaque application ;
//   retires   (sur une bille) une bille amenée à son maximum est retirée aussitôt ;
//   moves     (sur une bille) au lieu de changer son usure, elle la DÉPLACE vers
//             cette destination, par le chemin des billes (marbles/core/run.js/
//             travel) : "pot", Empocher ; "discard", Défausser ; "hand",
//             Rebond et Ramasser ;
//   handLimited (facultatif) vers la main, la bille n'y va que s'il y a de la
//             place, sinon elle reste où elle est (Ramasser ; Rebond, lui, l'envoie
//             à la défausse à l'arrivée) ;
//   bag       (facultatif) la cible peut être les N prochaines billes du sac
//             (isBag : Défausser) ;
//   amountless (facultatif) l'action n'a pas de montant (Empocher) ;
//   targets   (facultatif) ses cibles permises, les emplacements sinon ;
//   choice    (facultatif) la cible peut être un CHOIX du joueur (en-tête) : `zones`,
//             celles où il a un sens ; `picks`, ce qui s'y vise ("marble" : une
//             bille active ; "slot" : un emplacement, vide compris) ;
//   all       (facultatif) la cible peut être « toutes les billes actives »,
//             filtrées (en-tête) ;
//   ejects    (sur une bille) au lieu de changer son usure, elle la CHASSE du
//             triangle : Éjecter (marbles/core/run.js/ejectFromSlot) ;
//   selfZones (sur une bille) les zones (HOLDER_ZONES) où elle peut viser la bille
//             elle-même, sans cible ; ailleurs, la validation refuse
//             (targetProblem) ;
//   keyword   (facultatif) l'action est un MOT-CLÉ : `texts`, son nom et sa
//             description (aide des mots-clés, touches E et Maj+E ; sans eux, le
//             chargement échoue, marbles/core/content.js) ; ses valeurs de partie
//             (marbles/core/counters.js) : `triggers(event)`, ce qu'un évènement du
//             journal ajoute à ses déclenchements ; `quantity(event)` (facultatif),
//             à sa quantité réelle. Une action de valeur sans mot-clé (Vitesse,
//             Masse) a ses gains et ses pertes.
// Le `kind` "marble" : une action sur une bille. Ses textes :
// marbles/view/narration/effects.js/ACTION_TEXTS.

// OÙ EST LA BILLE ELLE-MÊME quand son effet joue : sa ZONE, selon la valeur `marble`
// de son déclencheur (marbles/config/values.js/MARBLE_TRIGGERS ; "pot" pour un moment
// En poche ; une phase, qui n'en a pas, est sur le triangle comme "onSlot"). C'est la
// `zone` de holder (la situation, en-tête) et des écouteurs (marbles/core/run.js) ;
// `where` dit à la validation pourquoi une action ne l'y prend pas (targetProblem).
// Chaque valeur `marble` d'un déclencheur y a son entrée (vérifié au chargement,
// marbles/core/run.js).
export const HOLDER_ZONES = {
  onSlot: { zone: "triangle", where: "elle est sur le triangle" },
  drawn: { zone: "hand", where: "elle vient d'être piochée, en main (son Éveil)" },
  thrown: { zone: "thrown", where: "elle est en cours de lancer (sa Chiquenaude)" },
  leaving: { zone: "leaving", where: "elle est en partance (son Final, son Éjection)" },
  dropped: { zone: "discard", where: "elle vient d'arriver à la défausse (sa Chute)" },
  pot: { zone: "pot", where: "elle est dans le pot" },
};

// La zone de la bille elle-même dans un contexte de validation (validateEffect).
const holderZoneOf = (context) => HOLDER_ZONES[context.marble ?? "onSlot"];

// L'usure et l'éjection n'existent que sur le triangle.
const ON_TRIANGLE = ["triangle"];

export const CLAUSE_ACTIONS = {
  // Ajoute `amount` (négatif permis) à la Vitesse. Au choix : un bonus à la phase d'une
  // bille active dont la phase peut encore avoir lieu ; un emplacement vide le
  // perdrait, la main n'a pas de phase.
  speed: { kind: "value", fields: TARGETED_FIELDS, validate: validateInteger, apply: addAmount, choice: { zones: ["triangle"], picks: ["marble"] } },
  // Ajoute `amount` (négatif permis) à la Masse. Au choix : comme la Vitesse.
  mass: { kind: "value", fields: TARGETED_FIELDS, validate: validateInteger, apply: addAmount, choice: { zones: ["triangle"], picks: ["marble"] } },
  // Pioche : `amount` billes (au moins 1), piochées par la bille elle-même au
  // déclenchement (marbles/core/run.js/drawMarbles), à tout moment du tour. Sans
  // cible : piocher pour une autre bille n'a pas de sens.
  // Mot-clé : un déclenchement par effet joué qui pioche ; sa quantité réelle, les
  // billes réellement piochées par un effet (« Pioche 2 » avec une seule bille
  // disponible : 1 déclenchement, 1 bille).
  draw: {
    kind: "value",
    fields: SELF_FIELDS,
    validate: validatePositive,
    apply: addAmount,
    keyword: {
      texts: { name: "marbles.keyword.draw.name", description: "marbles.keyword.draw.description" },
      triggers: (event) => (event.type === "effect" && event.draw > 0 ? 1 : 0),
      quantity: (event) => (event.type === "draw" && event.cause === "effect" ? 1 : 0),
    },
  },
  // Polissage : retire `amount` d'usure (au moins 1), jamais sous 0. Une bille
  // arrivée à son maximum et polie avant l'étape des retraits n'est plus retirée.
  polish: {
    kind: "marble",
    fields: TARGETED_FIELDS,
    validate: validatePositive,
    wear: (wear, amount) => Math.max(0, wear - amount),
    event: "polished",
    retires: false,
    selfZones: ON_TRIANGLE,
    // L'usure n'existe que sur le triangle.
    choice: { zones: ["triangle"], picks: ["marble"] },
    keyword: marbleActionKeyword("polish", "polished"),
  },
  // Fêlure : ajoute `amount` d'usure (au moins 1), jamais au-delà du maximum ; à son
  // maximum, la bille est retirée aussitôt, comme par usure (marbles/core/run.js/
  // retireMarble).
  crack: {
    kind: "marble",
    fields: TARGETED_FIELDS,
    validate: validatePositive,
    wear: (wear, amount, maxWear) => Math.min(maxWear, wear + amount),
    event: "cracked",
    retires: true,
    selfZones: ON_TRIANGLE,
    choice: { zones: ["triangle"], picks: ["marble"] },
    keyword: marbleActionKeyword("crack", "cracked"),
  },
  // Empocher : envoie une bille au POT, sans montant. Cible : la bille elle-même, où
  // qu'elle soit (sur le triangle, en main à son Éveil, en partance pendant son
  // Final ou son Éjection, ce qui REDIRIGE sa destination, à la défausse pendant sa
  // Chute) ; un emplacement ; la
  // première bille de la main (FIRST_IN_HAND). Pot plein : la bille est perdue. Cible
  // vide : sans effet, noté au journal.
  // Mot-clé : un déclenchement par application, cible vide comprise (une
  // redirection, `redirected`, en est une, et l'arrivée qui la suit ne se recompte
  // pas) ; sa quantité réelle, les billes réellement arrivées au pot ou perdues.
  pocket: {
    kind: "marble",
    fields: ["action", "target", "when"],
    validate() {},
    amountless: true,
    targets: [...SLOTS, FIRST_IN_HAND],
    moves: "pot",
    // Une bille de la main ou une bille active ; un emplacement vide n'a rien à
    // empocher.
    choice: { zones: ["hand", "triangle"], picks: ["marble"] },
    // Ni en cours de lancer, ni déjà dans le pot. En partance, la redirige vers le
    // pot (marbles/core/run.js/travel) ; à la défausse (sa Chute), l'en fait partir.
    selfZones: ["triangle", "hand", "leaving", "discard"],
    keyword: {
      texts: { name: "marbles.keyword.pocket.name", description: "marbles.keyword.pocket.description" },
      triggers: (event) =>
        ((event.type === "pocketed" || event.type === "lost") && event.redirected !== true) ||
        (event.type === "redirected" && event.action === "pocket") ||
        (event.type === "targetEmpty" && event.action === "pocket")
          ? 1
          : 0,
      quantity: (event) => (event.type === "pocketed" || event.type === "lost" ? 1 : 0),
    },
  },
  // Éjecter : CHASSE une bille active du triangle par un effet, sans pose, sans
  // montant. Cible : la bille elle-même (sur le triangle seulement) ; un
  // emplacement ; des billes actives au choix ; toutes les billes actives, filtrées.
  // Pour chaque bille : son Éjection (la référence de ses conditions de calibre : la
  // bille qui éjecte), puis elle quitte son emplacement et rejoint la défausse. Ni
  // Tic (rien n'arrive), ni Final (ce n'est pas une usure). Cible vide : sans
  // effet, noté. Mot-clé : un déclenchement par bille visée, cible vide comprise ; sa
  // quantité réelle, les billes réellement chassées (`removed`, cause "eject").
  eject: {
    kind: "marble",
    fields: ["action", "target", "when"],
    validate() {},
    amountless: true,
    targets: SLOTS,
    ejects: true,
    choice: { zones: ["triangle"], picks: ["marble"] },
    all: true,
    selfZones: ON_TRIANGLE,
    keyword: {
      texts: { name: "marbles.keyword.eject.name", description: "marbles.keyword.eject.description" },
      triggers: (event) => (event.type === "eject" || (event.type === "targetEmpty" && event.action === "eject") ? 1 : 0),
      quantity: (event) => (event.type === "removed" && event.cause === "eject" ? 1 : 0),
    },
  },
  // Défausser : envoie une bille à la DÉFAUSSE (sa Chute s'y déclenche), sans
  // montant, par le chemin des billes (marbles/core/run.js/travel). Cible : la bille
  // elle-même (sur le triangle, en main à son Éveil) ; un emplacement ; la première
  // bille de la main (FIRST_IN_HAND) ; des billes de la main ou actives au choix ;
  // toutes les billes actives, filtrées ; les N prochaines billes du sac (isBag).
  // Depuis le triangle, ni usure ni éjection : ni Final ni Éjection ; une phase qui
  // n'avait pas eu lieu est sautée. Jamais depuis le pot. Cible vide : sans effet,
  // noté au journal.
  // Mot-clé : un déclenchement par bille visée, cible vide comprise ; sa quantité
  // réelle, les billes réellement arrivées à la défausse par lui.
  discard: {
    kind: "marble",
    fields: ["action", "target", "when"],
    validate() {},
    amountless: true,
    targets: [...SLOTS, FIRST_IN_HAND],
    moves: "discard",
    choice: { zones: ["hand", "triangle"], picks: ["marble"] },
    all: true,
    bag: true,
    // Ni en cours de lancer, ni en partance (elle a déjà sa destination), ni à la
    // défausse, ni dans le pot.
    selfZones: ["triangle", "hand"],
    keyword: {
      texts: { name: "marbles.keyword.discard.name", description: "marbles.keyword.discard.description" },
      triggers: (event) => ((event.type === "discarded" && event.cause === "discard") || (event.type === "targetEmpty" && event.action === "discard") ? 1 : 0),
      quantity: (event) => (event.type === "discarded" && event.cause === "discard" ? 1 : 0),
    },
  },
  // Rebond : RENVOIE une bille active, ou la bille elle-même en partance, dans la
  // MAIN, sans montant, par le chemin des billes (destination "hand"). Elle y
  // arrive à 0 tour en main, sans Éveil (ce n'est pas une pioche), et repartira à
  // usure 0 à sa prochaine pose. Main pleine à l'arrivée : elle va à la défausse à
  // la place, et sa Chute joue. Cible : la bille elle-même (sur le triangle, ou en
  // partance pendant son Final ou son Éjection, ce qui REDIRIGE sa destination) ;
  // un emplacement ; des billes actives au choix ; toutes les billes actives,
  // filtrées. Depuis le triangle, ni Final ni Éjection ; une phase qui n'avait pas
  // eu lieu est sautée.
  // Mot-clé : un déclenchement par bille visée, cible vide comprise (une
  // redirection en est une) ; sa quantité réelle, les billes réellement déplacées
  // par lui, en main ou, main pleine, à la défausse.
  bounce: {
    kind: "marble",
    fields: ["action", "target", "when"],
    validate() {},
    amountless: true,
    targets: SLOTS,
    moves: "hand",
    choice: { zones: ["triangle"], picks: ["marble"] },
    all: true,
    selfZones: ["triangle", "leaving"],
    keyword: {
      texts: { name: "marbles.keyword.bounce.name", description: "marbles.keyword.bounce.description" },
      triggers: (event) => (movedArrival(event, "bounce") && event.redirected !== true) || (event.type === "redirected" && event.action === "bounce") || (event.type === "targetEmpty" && event.action === "bounce") ? 1 : 0,
      quantity: (event) => (movedArrival(event, "bounce") ? 1 : 0),
    },
  },
  // Ramasser : REPREND une bille de la DÉFAUSSE dans la main, sans montant, par le
  // chemin des billes (destination "hand"), à 0 tour en main, sans Éveil. Main
  // pleine : la bille reste à la défausse, sans effet pour elle ; un choix ne
  // propose jamais plus de billes qu'il n'y a de places (`handLimited`). Cible : la
  // dernière bille arrivée à la défausse (LAST_DISCARDED) ; des billes de la défausse
  // au choix. Jamais la bille elle-même : une bille en partance n'est pas encore à la
  // défausse.
  // Mot-clé : un déclenchement par bille visée, cible vide comprise ; sa quantité
  // réelle, les billes réellement ramassées.
  retrieve: {
    kind: "marble",
    fields: ["action", "target", "when"],
    validate() {},
    amountless: true,
    targets: [LAST_DISCARDED],
    moves: "hand",
    handLimited: true,
    choice: { zones: ["discard"], picks: ["marble"] },
    selfZones: [],
    keyword: {
      texts: { name: "marbles.keyword.retrieve.name", description: "marbles.keyword.retrieve.description" },
      triggers: (event) => movedArrival(event, "retrieve") || (event.type === "targetEmpty" && event.action === "retrieve") ? 1 : 0,
      quantity: (event) => (movedArrival(event, "retrieve") ? 1 : 0),
    },
  },
};

const actionsOfKind = (kind) => Object.keys(CLAUSE_ACTIONS).filter((action) => CLAUSE_ACTIONS[action].kind === kind);

// Les valeurs à zéro : toutes celles d'un effet, et celles qu'un effet peut
// DONNER à un autre emplacement (les valeurs qui acceptent une cible).
function zeroValues(actions) {
  return Object.freeze(Object.fromEntries(actions.map((action) => [action, 0])));
}
const VALUE_ACTIONS = actionsOfKind("value");
const ZERO = zeroValues(VALUE_ACTIONS);
const GIFT_ZERO = zeroValues(VALUE_ACTIONS.filter((action) => CLAUSE_ACTIONS[action].fields.includes("target")));

// Le moment où joue un champ d'effet, pour la règle des cibles
// (marbles/core/content.js le construit) :
//   { phaseSlots }  une phase, jouée à l'un de ces emplacements (base : les deux
//                   bases ; une variante : la sienne ; pointe : la pointe) ;
//   { moment }      un déclencheur : "play" (pendant la phase de jeu, avant toute
//                   phase), "afterPhases" (après toutes les phases : le Final) ou
//                   "anytime" (n'importe quand : la Trouvaille, tranchée à
//                   l'exécution) ;
//                   `marble`, sa bille (marbles/config/values.js/MARBLE_TRIGGERS) :
//                   "leaving" (en partance) et "thrown" (en cours de lancer) ne
//                   sont pas sur le triangle ; `trigger`, son id.
// Un emplacement vient-il APRÈS un autre dans l'ordre des phases, l'ordre horaire
// (SLOTS) ?
const phaseIndex = (slot) => SLOTS.indexOf(slot);

// Ce qui rend une clause toujours impossible à ce moment, ou null.
function targetProblem(clause, context) {
  const action = CLAUSE_ACTIONS[clause.action];
  if (action.kind === "marble" && clause.target === undefined) {
    const { zone, where } = holderZoneOf(context);
    if (!action.selfZones.includes(zone)) return `l'action "${clause.action}" ne peut pas viser la bille elle-même ici : ${where}`;
  }
  // Un bonus au choix : il faut qu'au moins une phase puisse encore le recevoir.
  if (action.kind === "value" && isChoice(clause.target)) {
    if (context.moment === "afterPhases") return "un bonus au choix n'a plus aucune phase à modifier : rien ne peut être choisi";
    if (context.phaseSlots && !SLOTS.some((slot) => context.phaseSlots.some((from) => phaseIndex(slot) > phaseIndex(from)))) {
      return "un bonus au choix n'a plus aucune phase à venir quand cet effet joue : rien ne peut être choisi";
    }
    return null;
  }
  if (action.kind === "value" && clause.target !== undefined) {
    if (context.moment === "afterPhases") return "une Vitesse ou une Masse ciblée n'a plus de phase à modifier : elle va aux compteurs, sans cible";
    if (context.phaseSlots && !context.phaseSlots.some((from) => phaseIndex(clause.target) > phaseIndex(from))) {
      return `la phase de ${clause.target} est toujours passée quand cet effet joue`;
    }
  }
  return null;
}

// La somme de deux jeux de valeurs ; une valeur absente de l'un compte zéro.
export function addValues(a, b) {
  const sum = { ...a };
  for (const [key, value] of Object.entries(b)) sum[key] = (sum[key] ?? 0) + value;
  return sum;
}

// Les comparaisons de CALIBRE, sur l'entier (marbles/config/values.js : SMALL <
// MEDIUM < LARGE) et nulle part ailleurs. Deux calibres égaux : ni plus petit ni
// plus gros.
const SIZE_COMPARISONS = {
  smaller: (size, other) => size < other,
  larger: (size, other) => size > other,
};

function validateSize(size, describe, fail) {
  if (!isMarbleSize(size)) fail(`${describe} : calibre inconnu "${size}".`);
}

function validateSlot(slot, describe, fail) {
  if (!SLOTS.includes(slot)) fail(`${describe} : emplacement inconnu "${slot}".`);
}

// Les billes d'un remplacement que relativeSize compare : celle qu'elle nomme,
// comparée à l'autre.
const REPLACEMENT_MARBLES = { ejected: "placed", placed: "ejected" };

// Chaque condition : ses champs, leur validation (`context` : le moment du champ
// d'effet, voir targetProblem), et son test sur la situation (en-tête).
export const CONDITIONS = {
  // La bille à `slot` a-t-elle, IMPRIMÉ à cet emplacement, au moins `atLeast`
  // de `stat` ? Emplacement vide : non, il n'y a rien à lire.
  printedStat: {
    fields: ["type", "slot", "stat", "atLeast"],
    validate(when, describe, fail) {
      validateSlot(when.slot, describe, fail);
      if (!Object.hasOwn(CLAUSE_ACTIONS, when.stat)) fail(`${describe} : statistique inconnue "${when.stat}".`);
      // Seule une action à montant s'imprime : sur Empocher ou Éjecter, la condition
      // vaudrait toujours 0, jamais vraie dès « au moins 1 ».
      if (!CLAUSE_ACTIONS[when.stat].fields.includes("amount")) fail(`${describe} : "${when.stat}" n'a pas de montant, il n'y a rien d'imprimé à lire.`);
      if (!Number.isInteger(when.atLeast)) fail(`${describe} : atLeast doit être un entier.`);
    },
    test(when, { triangle }, types) {
      const placed = triangle[when.slot];
      if (placed === null) return false;
      return printedStat(effectAt(placed.marble, when.slot, types), when.stat) >= when.atLeast;
    },
  },
  // Pendant un remplacement : la bille `marble` ("ejected", l'éjectée, ou
  // "placed", la posée) est-elle `is` ("smaller" ou "larger") que l'autre ? Ni
  // l'un ni l'autre à calibre égal. Seulement dans un Tic (vu par la posée) ou une
  // Éjection (vu par l'éjectée) : ailleurs, il n'y a pas de remplacement.
  relativeSize: {
    fields: ["type", "marble", "is"],
    validate(when, describe, fail, context) {
      if (!Object.hasOwn(REPLACEMENT_MARBLES, when.marble)) fail(`${describe} : bille de remplacement inconnue "${when.marble}".`);
      if (!Object.hasOwn(SIZE_COMPARISONS, when.is)) fail(`${describe} : comparaison inconnue "${when.is}".`);
      if (context.replacement !== true) fail(`${describe} : relativeSize ne vaut que pendant un remplacement (Tic, Éjection).`);
    },
    test(when, { replacement }, types) {
      const subject = replacement[when.marble];
      const other = replacement[REPLACEMENT_MARBLES[when.marble]];
      return SIZE_COMPARISONS[when.is](types[subject].size, types[other].size);
    },
  },
  // La bille à `slot` est-elle de calibre `size` ? Emplacement vide : non.
  sizeAt: {
    fields: ["type", "slot", "size"],
    validate(when, describe, fail) {
      validateSlot(when.slot, describe, fail);
      validateSize(when.size, describe, fail);
    },
    test(when, { triangle }, types) {
      const placed = triangle[when.slot];
      return placed !== null && types[placed.marble].size === when.size;
    },
  },
};

// Chaque SOURCE d'un montant calculé (en-tête), déclarée ICI ET NULLE PART AILLEURS :
//   fields    ses champs ;
//   validate  leur validation ;
//   value     sa valeur dans la situation, un entier >= 0, (source, situation, types) ;
//   text      son gabarit i18n, après le pas : il reçoit {effect} (« Vitesse +1 »),
//             puis les paramètres de `params` et les références de nom de `names` ;
//   params    (facultatif) ses paramètres de texte, des valeurs simples, (source) -> {} ;
//   names     (facultatif) ses paramètres de texte qui sont des NOMS, par clé i18n,
//             (source) -> { param: clé } : la vue en fait des références de nom
//             (nameRef), dont le gabarit choisit la forme ;
//   current   vrai si sa valeur se connaît hors de tout déclenchement, à partir de
//             la bille seule : la fiche dit alors la valeur actuelle (« actuellement
//             +2 ») ; faux si elle dépend du moment (le triangle au déclenchement).
// Une future valeur de partie s'y branche par une entrée ici, son gabarit dans
// chaque langue, rien d'autre.
export const AMOUNT_SOURCES = {
  // Les tours passés en main par la bille elle-même (marbles/core/marbles.js, en-tête) :
  // 0 hors de la main ; pendant son lancer, ceux qu'elle avait en la quittant.
  turnsInHand: {
    fields: ["type"],
    validate() {},
    value(source, { holder }) {
      return holder.turnsInHand;
    },
    text: "marbles.effect.per_turn_in_hand",
    current: true,
  },
  // Les billes ACTIVES (sur le triangle) de calibre `size`, la bille elle-même
  // comprise si elle en est. En transit, elle n'est pas active et ne compte pas : en
  // partance (son Final, son Éjection) comme en cours de lancer (sa Chiquenaude).
  activeSize: {
    fields: ["type", "size"],
    validate(source, describe, fail) {
      validateSize(source.size, describe, fail);
    },
    value(source, { triangle }, types) {
      return SLOTS.filter((slot) => triangle[slot] !== null && types[triangle[slot].marble].size === source.size).length;
    },
    text: "marbles.effect.per_active_size",
    names: (source) => ({ size: `marbles.size.${MARBLE_SIZES[source.size]}.name` }),
    current: false,
  },
  // Une VALEUR DE PARTIE (marbles/core/counters.js) dans une portée : « par
  // chiquenaude ce tour », { type: "tally", tally: "flick", scope: "turn" }. Sa
  // valeur se lit dans le registre de l'état, hors de tout déclenchement aussi
  // (`current`). L'identifiant se vérifie contre `context.tallies`.
  tally: {
    fields: ["type", "tally", "scope"],
    validate(source, describe, fail, context) {
      if (!TALLY_SCOPES.includes(source.scope)) fail(`${describe} : portée inconnue "${source.scope}".`);
      if (!(context?.tallies instanceof Set)) fail(`${describe} : valeurs de partie absentes du contexte de validation.`);
      if (!context.tallies.has(source.tally)) fail(`${describe} : valeur de partie inconnue "${source.tally}".`);
    },
    value: (source, { tally }) => tallyValue(tally, source.tally, source.scope),
    text: "marbles.effect.per_tally",
    names: (source) => ({ unit: `marbles.tally.${source.tally}.unit`, scope: `marbles.tally.scope.${source.scope}` }),
    current: true,
  },
};


// Un montant (entier, ou calculé : en-tête) évalué dans une situation. La fiche s'en
// sert aussi, pour dire la valeur actuelle d'un montant calculé dont la source est
// `current` (elle ne lit alors que la bille, sans `types`).
export function amountOf(amount, situation, types) {
  if (Number.isInteger(amount)) return amount;
  const value = amount.base + amount.step * AMOUNT_SOURCES[amount.source.type].value(amount.source, situation, types);
  return amount.max === undefined ? value : Math.min(amount.max, value);
}

// Valide une condition ou une source d'après sa table.
function validateRule(rule, table, label, describe, fail, context) {
  const entry = table[rule?.type];
  if (!entry) fail(`${describe} : ${label} inconnu(e) "${rule?.type}".`);
  rejectUnknownFields(rule, entry.fields, describe, fail);
  entry.validate(rule, describe, fail, context);
}

// Les modes d'un choix (en-tête) : facultatif, obligatoire.
const CHOICE_MODES = Object.freeze(["optional", "required"]);

// Un choix est-il facultatif (le joueur peut s'arrêter avant N, ou ne rien choisir) ?
export function isOptionalChoice(choice) {
  return choice.mode === "optional";
}

// Une cible au choix (en-tête) : ses champs, ses zones disponibles et sensées pour
// l'action, ce qu'elle vise, son nombre, son mode.
function validateChoice(clause, action, describe, fail) {
  const choice = clause.target;
  const where = `${describe}, cible au choix`;
  rejectUnknownFields(choice, ["type", "zones", "pick", "count", "mode"], where, fail);
  if (action.choice === undefined) fail(`${where} : ${clause.action} ne se choisit pas.`);
  if (!Array.isArray(choice.zones) || choice.zones.length === 0 || new Set(choice.zones).size !== choice.zones.length) fail(`${where} : zones doit lister des zones distinctes.`);
  for (const zone of choice.zones) {
    if (!Object.hasOwn(CHOICE_ZONES, zone)) fail(`${where} : zone inconnue "${zone}".`);
    if (!CHOICE_ZONES[zone].available) fail(`${where} : pas encore de choix dans la zone "${zone}".`);
    if (!action.choice.zones.includes(zone)) fail(`${where} : ${clause.action} n'a pas de sens dans la zone "${zone}".`);
    if (!CHOICE_ZONES[zone].picks.includes(choice.pick)) fail(`${where} : la zone "${zone}" ne propose pas "${choice.pick}".`);
  }
  if (!action.choice.picks.includes(choice.pick)) fail(`${where} : ${clause.action} n'a pas de sens sur "${choice.pick}" (un emplacement vide n'a rien à recevoir).`);
  if (!Number.isInteger(choice.count) || choice.count < 1) fail(`${where} : count doit être un entier >= 1.`);
  if (!CHOICE_MODES.includes(choice.mode)) fail(`${where} : mode doit valoir ${CHOICE_MODES.map((mode) => `"${mode}"`).join(" ou ")}.`);
}

// Une cible « toutes » (en-tête) : ses champs, ses filtres, chacun valide et d'un type
// au plus (deux calibres à la fois ne viseraient rien).
function validateAll(clause, action, describe, fail) {
  const all = clause.target;
  const where = `${describe}, cible « toutes »`;
  rejectUnknownFields(all, ["type", "filters"], where, fail);
  if (action.all !== true) fail(`${where} : ${clause.action} ne vise pas toutes les billes.`);
  if (all.filters === undefined) return;
  if (!Array.isArray(all.filters)) fail(`${where} : filters doit être une liste.`);
  const seen = new Set();
  for (const filter of all.filters) {
    validateRule(filter, TARGET_FILTERS, "filtre", where, fail);
    if (seen.has(filter.type)) fail(`${where} : filtre "${filter.type}" en double.`);
    seen.add(filter.type);
  }
}

// Une cible « les N prochaines billes du sac » : seule une action qui la déclare
// (`bag`) l'accepte ; N, un entier au moins 1.
function validateBag(clause, action, describe, fail) {
  const where = `${describe}, cible du sac`;
  if (action.bag !== true) fail(`${where} : l'action "${clause.action}" ne vise pas le sac.`);
  rejectUnknownFields(clause.target, ["type", "count"], where, fail);
  if (!Number.isInteger(clause.target.count) || clause.target.count < 1) fail(`${where} : count doit être un entier >= 1.`);
}

// Échoue au chargement sur un effet mal formé. Un effet absent se vérifie en
// amont : ici, il existe. `context` : le moment où il joue (voir targetProblem),
// {} pour ne pas vérifier les cibles ; `tallies`, les identifiants des valeurs de
// partie (la source `tally`).
export function validateEffect(effect, describe, fail, context = {}) {
  if (!Array.isArray(effect)) fail(`${describe} : un effet est une liste de clauses.`);
  for (const clause of effect) {
    const action = CLAUSE_ACTIONS[clause.action];
    if (!Object.hasOwn(CLAUSE_ACTIONS, clause.action)) fail(`${describe} : action inconnue "${clause.action}".`);
    rejectUnknownFields(clause, action.fields, describe, fail);
    action.validate(clause, describe, fail, context);
    if (isChoice(clause.target)) validateChoice(clause, action, describe, fail);
    else if (isAll(clause.target)) validateAll(clause, action, describe, fail);
    else if (isBag(clause.target)) validateBag(clause, action, describe, fail);
    else if (clause.target !== undefined && !(action.targets ?? SLOTS).includes(clause.target)) fail(`${describe} : cible inconnue "${clause.target}".`);
    const problem = targetProblem(clause, context);
    if (problem !== null) fail(`${describe} : ${problem}.`);
    if (clause.when !== undefined) validateRule(clause.when, CONDITIONS, "condition", describe, fail, context);
  }
}

// Évalue des clauses dans une SITUATION (en-tête), au moment du déclenchement :
//   self        les valeurs de la bille elle-même, toutes présentes ;
//   gifts       ce qui va à d'autres emplacements, [{ slot, ...valeurs donnables }] ;
//               un bonus au choix porte `choice` (sa cible), `action` et `amount` au
//               lieu de `slot` : le core demande le choix (marbles/core/run.js/fireEffect) ;
//   operations  les actions sur une bille, dans l'ordre des clauses,
//               [{ action, amount, target }] (`target` absent : la bille elle-même ;
//               un choix : la cible au choix, que le core fait trancher).
// Une clause dont la condition échoue, ou dont le montant (calculé s'il l'est) vaut
// zéro, ne produit rien. Seules les valeurs finales en sortent.
export function evaluateEffect(clauses, situation, types) {
  let self = ZERO;
  const gifts = [];
  const operations = [];
  for (const printed of clauses) {
    if (printed.when !== undefined && !CONDITIONS[printed.when.type].test(printed.when, situation, types)) continue;
    const { kind, apply, amountless } = CLAUSE_ACTIONS[printed.action];
    // Une action sans montant (Empocher) s'applique telle quelle.
    const amount = amountless ? undefined : amountOf(printed.amount, situation, types);
    if (amount === 0) continue;
    const clause = { ...printed, amount };
    const target = clause.target === undefined ? {} : { target: clause.target };
    if (kind === "marble") operations.push({ action: clause.action, ...(amountless ? {} : { amount: clause.amount }), ...target });
    else if (clause.target === undefined) self = apply(self, clause);
    else if (isChoice(clause.target)) gifts.push({ choice: clause.target, action: clause.action, amount: clause.amount, ...apply(GIFT_ZERO, clause) });
    else gifts.push({ slot: clause.target, ...apply(GIFT_ZERO, clause) });
  }
  return { self, gifts, operations };
}
