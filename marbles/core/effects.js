// Jeu des billes : le MODÈLE D'EFFET. Un effet est une liste de clauses, de la
// donnée (format : en-tête de marbles/content/types/index.js). Ce module sait la
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
// à cet instant (marbles/core/choices.js/chooseTargets) ; l'action s'applique ensuite à
// chacune, dans l'ordre des choix.
//
// CIBLE « TOUTES » : `target` vaut { type: "all", filters? } : toutes les billes
// actives, au déclenchement, dans l'ordre horaire (SLOTS), qui passent le filtre
// (TARGET_FILTERS : le calibre, la famille, la rareté ; un seul aujourd'hui). Seules
// les actions qui déclarent `all` l'acceptent (Éjecter, Défausser, Rebond).
//
// LA SITUATION d'un effet, ce que ses conditions et ses montants calculés lisent au
// déclenchement : { triangle, holder, replacement, tally, state, statuses } ;
//   triangle     le triangle à cet instant ;
//   state        l'état de la partie à cet instant, d'où se comptent les ZONES
//                (GAME_ZONES : conditions d'état, nombre de billes par zone) ; une
//                bille en transit n'y est dans aucune zone. Absent (null) d'une fiche
//                hors de toute partie ;
//   statuses     la table des statuts (marbles/core/statuses.js), que lit la capacité
//                en vigueur d'une zone (ses caractéristiques) ; absente : aucune ;
//   holder       la bille qui joue l'effet, { marble, zone, slot, turnsInHand,
//                departed } : `slot`, l'emplacement d'où elle agit (null hors du
//                triangle et sans référence) ; `departed`, sa trace si elle vient de
//                quitter le triangle ({ wear, phases }, marbles/core/path.js/
//                departedRecord ; son Final, son Éjection, sa Chute), null sinon ; `zone`
//                dit où elle est (HOLDER_ZONES : "triangle" ; "leaving", en
//                partance, le Final et l'Éjection ; "discard", à la défausse, la
//                Chute ; "thrown", en cours de lancer, la
//                Chiquenaude ; "hand", l'Éveil ; "pot" ; "status", un statut qui
//                réagit, sans bille) ; `turnsInHand`, son
//                compteur de tours en main (0 hors de la main ; pendant son lancer,
//                celui qu'elle avait en la quittant) ;
//   replacement  pendant un Tic ou une Éjection, le remplacement en cours,
//                { placed, ejected, departed } (deux ids de bille, et la trace de
//                l'éjectée) ; null sinon ;
//   copying      (facultatif) vrai pendant l'évaluation d'un effet pour la source
//                otherBase : une copie n'en copie jamais une autre ;
//   onHiddenRead (facultatif) appelé quand une source lit l'identité d'une bille
//                CACHÉE (UNKNOWN_MARBLE, à l'aveugle : un filtre, une famille) : la
//                prévision se dit alors incertaine (marbles/core/run.js) ;
//   tally        les valeurs de partie à cet instant (marbles/core/tally.js), lues
//                par tallyValue seulement.
//
// La VALIDATION reçoit un contexte (validateEffect) : le moment où l'effet joue
// (règle des cibles, conditions) et `tallies`, les identifiants des valeurs de
// partie (marbles/core/content.js les fournit), que vérifie la source `tally`.
//
// SINON : une clause qui a une condition (`when`) peut porter `otherwise`, une autre
// clause, jouée À SA PLACE quand la condition est fausse : « Vitesse +3 si une autre
// bille active est un calot, sinon Vitesse +1 ». La clause de remplacement peut avoir
// sa propre condition et son propre `otherwise` : une chaîne, dont seule la première
// branche vraie (ou la dernière, sans condition) joue. Chaque branche se valide comme
// une clause du même champ (clauseBranches les énumère).
//
// MONTANT CALCULÉ : `amount` est un entier, ou { base, step, source, max? } :
// base + step × la valeur de `source` (AMOUNT_SOURCES), plafonné à `max` s'il est
// donné, évalué au déclenchement (amountOf). Le seul mécanisme d'un montant qui
// dépend du moment : « Vitesse +1 par minibille active » en est un, base 0, pas 1,
// source zoneCount sur le triangle, filtrée par calibre.
// Une condition ne lit jamais un effet déjà modifié (printedStat lit l'effet
// IMPRIMÉ) ; le calibre est statique : aucune dépendance circulaire.
//
// TROIS SORTES D'ACTIONS (`kind`) : les VALEURS (Vitesse, Masse, Pioche), qui
// s'additionnent en un effet ; les actions SUR UNE BILLE (Polissage, Fêlure,
// Empocher, Éjecter…), qui agissent sur la bille elle-même, sur celle d'un
// emplacement ou sur des billes choisies ; les actions de STATUT (Appliquer un
// statut), qui donnent un statut à la partie. Les deux dernières : une application
// par clause, dans l'ordre des clauses, après les valeurs.
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
// (`selfZones`) ; en partance (son Final, son Éjection), Empocher et Rebond la
// redirigent (vers le pot, vers la main), Polissage, Fêlure et Éjecter ne la prennent
// pas.
//
// VALEURS : ce qu'un effet produit, une valeur par action, sous le nom de
// l'action (`{ speed, mass, draw }`). Le core les applique (marbles/core/run.js/fireEffect),
// la vue les dit, la prévision les rend.

import { MARBLES_SETTINGS, MARBLE_FAMILIES, MARBLE_RARITIES, MARBLE_SIZES } from "../config/values.js";
import { rejectUnknownFields } from "../../lib/validate.js";
import { TALLY_SCOPES, tallyValue } from "./tally.js";
import { NO_STATUSES, STATUS_DURATIONS, definitionOf, statusApplication } from "./statuses.js";
import { CHOICE_ZONES, GAME_ZONES, HOLDER_ZONES, NO_REFERENCE_ZONES, SLOTS, ZONE_STATES, nextSlot, previousSlot, zoneCount } from "./zones.js";

// Un calibre connu (marbles/config/values.js/MARBLE_SIZES) ?
export function isMarbleSize(size) {
  return Number.isInteger(size) && Object.hasOwn(MARBLE_SIZES, size);
}

// Une famille connue (marbles/config/values.js/MARBLE_FAMILIES) ?
export function isMarbleFamily(family) {
  return MARBLE_FAMILIES.includes(family);
}

// Une rareté connue (marbles/config/values.js/MARBLE_RARITIES) ?
export function isMarbleRarity(rarity) {
  return MARBLE_RARITIES.includes(rarity);
}

// Les familles DIFFÉRENTES de billes : chaque famille comptée une fois, une bille à
// plusieurs familles comptant pour chacune. Une bille INCONNUE (piochée à l'aveugle,
// dans la prévision) n'en apporte aucune, comme elle ne passe aucun filtre : son
// identité est cachée.
export function distinctFamilies(marbles, types) {
  return new Set(marbles.filter((marble) => marble !== UNKNOWN_MARBLE).flatMap((marble) => types[marble].families)).size;
}

// Une bille dont l'identité est cachée : au sac ou en défausse dans la copie de la
// prévision, ou piochée à l'aveugle (drawOne). Jamais dans une vraie partie.
export const UNKNOWN_MARBLE = null;


// Les CIBLES RELATIVES : l'emplacement suivant ou précédent (nextSlot, previousSlot)
// de l'emplacement d'où la bille agit, sa RÉFÉRENCE : son emplacement sur le
// triangle ; pendant sa Chiquenaude, l'emplacement visé par la pose ; en partance
// (son Final, son Éjection) ou à sa Chute depuis le triangle, l'emplacement qu'elle
// quitte. Acceptées partout où une action accepte un emplacement, et par le champ
// `slot` des conditions qui lisent un emplacement. Traduites en emplacement au
// déclenchement (resolveRelative) ; sans référence (une Chute depuis la main), la
// clause est sans cible : aucun effet, noté au journal. Refusées au chargement là où
// la bille n'a jamais de référence (l'Éveil, en main ; en poche).
export const NEXT_SLOT = "nextSlot";
export const PREVIOUS_SLOT = "previousSlot";
const RELATIVE_TARGETS = { [NEXT_SLOT]: { step: nextSlot, word: "next" }, [PREVIOUS_SLOT]: { step: previousSlot, word: "previous" } };

// Une cible (ou un emplacement de condition) est-elle relative ?
export function isRelative(target) {
  return typeof target === "string" && Object.hasOwn(RELATIVE_TARGETS, target);
}

// Le mot d'une cible relative pour ses textes : "next", "previous".
export function relativeWord(target) {
  return RELATIVE_TARGETS[target].word;
}

// L'emplacement que désigne une cible relative depuis `reference` (un emplacement),
// ou null sans référence.
function resolveRelative(target, reference) {
  return reference === null || reference === undefined ? null : RELATIVE_TARGETS[target].step(reference);
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

// La cible « LA BILLE ÉJECTÉE » (Empocher, Rebond), dans un Tic seulement : la bille
// que la pose déloge, EN PARTANCE pendant le Tic (il joue avant son Éjection). Une
// action qui la vise la REDIRIGE (marbles/core/path.js/redirect) : vers le pot,
// vers la main. Son Éjection joue ensuite, et peut la rediriger à son tour : la
// dernière redirection l'emporte.
export const KNOCKED_OUT = "knockedOut";

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
  // Un pas NÉGATIF (« Vitesse +5, −1 par point d'usure ») : seulement pour une valeur
  // signée (Vitesse, Masse : sans minimum), et sans plafond, qui n'aurait plus de sens.
  if (!Number.isInteger(amount.step) || amount.step === 0) fail(`${where} : step doit être un entier non nul.`);
  if (amount.step < 0 && minimum !== undefined) fail(`${where} : un pas négatif ne vaut que pour la Vitesse et la Masse.`);
  if (amount.step < 0 && amount.max !== undefined) fail(`${where} : un pas négatif n'a pas de maximum.`);
  if (amount.max !== undefined && (!Number.isInteger(amount.max) || amount.max <= amount.base)) fail(`${where} : max doit être un entier plus grand que base.`);
  validateRule(amount.source, AMOUNT_SOURCES, "source", where, fail, context);
  const source = AMOUNT_SOURCES[amount.source.type];
  // Une source SIGNÉE peut valoir moins de 0 : seulement pour une valeur signée.
  if (source.signed && minimum !== undefined) fail(`${where} : la source "${amount.source.type}" peut être négative, elle ne vaut que pour la Vitesse et la Masse.`);
  // Une source ENTIÈRE ne se lit que telle quelle : base 0, pas 1 (« Vitesse égale à… »).
  if (source.whole && (amount.base !== 0 || amount.step !== 1)) fail(`${where} : la source "${amount.source.type}" se prend telle quelle (base 0, step 1).`);
}

function validateInteger(clause, describe, fail, context) {
  validateAmount(clause, describe, fail, context);
}

function validatePositive(clause, describe, fail, context) {
  validateAmount(clause, describe, fail, context, 1);
}

// Une ARRIVÉE (en main, ou à la défausse) d'une bille que l'action `action` a
// déplacée, directement ou par une redirection (`movedBy`, marbles/core/path.js/
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


// Une cible est-elle un choix du joueur ?
export function isChoice(target) {
  return target !== null && typeof target === "object" && target.type === "choice";
}

// Une cible est-elle « toutes les billes actives » ?
export function isAll(target) {
  return target !== null && typeof target === "object" && target.type === "all";
}

// Les FILTRES DE BILLE, déclarés ici et nulle part ailleurs, sur le modèle des
// conditions : `fields`, `validate`, et `test(filter, marble, types)`, la bille
// passe-t-elle le filtre. Trois usages, le même système : la cible « toutes »
// (en-tête), la SOURCE d'un modificateur de statut (marbles/core/statuses.js : seules
// les valeurs produites par une bille qui passe ses filtres sont modifiées) et le
// nombre de billes d'une zone (AMOUNT_SOURCES.zoneCount). Ajouter un filtre (la
// matière, le déclencheur…) : une entrée ici, ses noms (FILTER_NAMES, pour le
// gabarit `marbles.effect.per_zone_<filtre>` du nombre de billes) et ses textes dans
// la vue :
//   marbles/view/narration/effects.js/FILTER_TEXTS ;
//   marbles/view/narration/statuses.js/SOURCE_FILTER_TEXTS.
export const TARGET_FILTERS = {
  // La bille est de calibre `size` (marbles/config/values.js : SMALL, MEDIUM, LARGE).
  size: {
    fields: ["type", "size"],
    validate(filter, describe, fail) {
      validateSize(filter.size, describe, fail);
    },
    test: (filter, marble, types) => types[marble].size === filter.size,
  },
  // La bille est de la famille `family`, parmi d'autres peut-être
  // (marbles/config/values.js/MARBLE_FAMILIES).
  family: {
    fields: ["type", "family"],
    validate(filter, describe, fail) {
      validateFamily(filter.family, describe, fail);
    },
    test: (filter, marble, types) => types[marble].families.includes(filter.family),
  },
  // La bille est de rareté `rarity`, exactement (marbles/config/values.js/
  // MARBLE_RARITIES) : « rare » ne vise ni les épiques ni les légendaires.
  rarity: {
    fields: ["type", "rarity"],
    validate(filter, describe, fail) {
      validateRarity(filter.rarity, describe, fail);
    },
    test: (filter, marble, types) => types[marble].rarity === filter.rarity,
  },
  // La bille est la bille `marble` (un id de la table des billes) : « par abeille dans
  // le pot ». L'id existe-t-il ? La table des billes le vérifie au chargement
  // (marbles/core/validation.js, referencedMarbles), une clause ne la connaissant pas.
  marble: {
    fields: ["type", "marble"],
    validate(filter, describe, fail) {
      validateMarbleId(filter.marble, describe, fail);
    },
    test: (filter, marble) => marble === filter.marble,
  },
};

// Une bille passe-t-elle tous ces filtres (aucun : oui) ? Une bille INCONNUE (au sac
// ou piochée, dans la copie à l'aveugle de la prévision) n'en passe aucun : son
// identité est cachée.
export function passesFilters(marble, filters = [], types) {
  if (filters.length > 0 && marble === UNKNOWN_MARBLE) return false;
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
//             cette destination, par le chemin des billes (marbles/core/path.js/
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
//             triangle : Éjecter (marbles/core/path.js/ejectFromSlot) ;
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


// La zone de la bille elle-même dans un contexte de validation (validateEffect).
const holderZoneOf = (context) => HOLDER_ZONES[context.marble ?? "onSlot"];

// L'usure et l'éjection n'existent que sur le triangle.
const ON_TRIANGLE = ["triangle"];

// Les évènements d'une APPLICATION de statut (marbles/core/run.js/gainStatus) :
// reçu, renforcé, ou sans effet (unique, déjà là).
const STATUS_APPLICATIONS = new Set(["statusGained", "statusStrengthened", "statusUnchanged"]);

// Appliquer un statut : la clause { action: "applyStatus", status, amount, duration? }.
// `status`, l'id d'un statut de la table (context.statuses, celle des règles) ;
// `amount`, son INTENSITÉ (au moins 1 ; un montant calculé permis) ; `duration`
// (facultatif) le nombre de tours ou de charges, pour une durée comptée seulement :
// la sorte de durée est celle de la définition. Sans cible : le porteur est la partie.
function validateStatusClause(clause, describe, fail, context) {
  validatePositive(clause, describe, fail, context);
  if (context?.statuses === undefined) fail(`${describe} : table des statuts absente du contexte de validation.`);
  if (!Object.hasOwn(context.statuses, clause.status)) fail(`${describe} : statut inconnu "${clause.status}".`);
  if (clause.duration === undefined) return;
  const { kind } = context.statuses[clause.status].duration;
  if (!STATUS_DURATIONS[kind]?.counted) fail(`${describe} : la durée du statut "${clause.status}" (${kind}) ne se compte pas, une clause ne la change pas.`);
  if (!Number.isInteger(clause.duration) || clause.duration < 1) fail(`${describe} : duration doit être un entier >= 1.`);
}

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
  // maximum, la bille est retirée aussitôt, comme par usure (marbles/core/path.js/
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
  // première bille de la main (FIRST_IN_HAND) ; dans un Tic, la bille éjectée
  // (KNOCKED_OUT), redirigée. Pot plein : la bille est perdue. Cible vide : sans
  // effet, noté au journal.
  // Mot-clé : un déclenchement par application, cible vide comprise (une
  // redirection, `redirected`, en est une, et l'arrivée qui la suit ne se recompte
  // pas) ; sa quantité réelle, les billes réellement arrivées au pot ou perdues.
  pocket: {
    kind: "marble",
    fields: ["action", "target", "when"],
    validate() {},
    amountless: true,
    targets: [...SLOTS, FIRST_IN_HAND, KNOCKED_OUT],
    moves: "pot",
    // Une bille de la main ou une bille active ; un emplacement vide n'a rien à
    // empocher.
    choice: { zones: ["hand", "triangle"], picks: ["marble"] },
    // Ni en cours de lancer, ni déjà dans le pot. En partance, la redirige vers le
    // pot (marbles/core/path.js/travel) ; à la défausse (sa Chute), l'en fait partir.
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
  // montant, par le chemin des billes (marbles/core/path.js/travel). Cible : la bille
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
  // filtrées ; dans un Tic, la bille éjectée (KNOCKED_OUT), redirigée. Depuis le
  // triangle, ni Final ni Éjection ; une phase qui n'avait pas eu lieu est sautée.
  // Mot-clé : un déclenchement par bille visée, cible vide comprise (une
  // redirection en est une) ; sa quantité réelle, les billes réellement déplacées
  // par lui, en main ou, main pleine, à la défausse.
  bounce: {
    kind: "marble",
    fields: ["action", "target", "when"],
    validate() {},
    amountless: true,
    targets: [...SLOTS, KNOCKED_OUT],
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
  applyStatus: {
    kind: "status",
    fields: ["action", "status", "amount", "duration", "when"],
    validate: validateStatusClause,
    // Mot-clé : un déclenchement par application, renforcement ou application sans
    // effet comprise.
    keyword: {
      texts: { name: "marbles.keyword.applyStatus.name", description: "marbles.keyword.applyStatus.description" },
      triggers: (event) => (STATUS_APPLICATIONS.has(event.type) ? 1 : 0),
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
  // La bille éjectée n'existe, en partance, que pendant le Tic de celle qui la déloge.
  if (clause.target === KNOCKED_OUT && context.trigger !== "hit") return "la bille éjectée ne se vise que dans un Tic";
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
    // Relative : l'emplacement visé dépend de la référence ; un bonus dont la phase est
    // passée se perd à l'exécution, noté au journal.
    if (isRelative(clause.target)) return null;
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

function validateFamily(family, describe, fail) {
  if (!isMarbleFamily(family)) fail(`${describe} : famille inconnue "${family}" (${MARBLE_FAMILIES.join(", ")}).`);
}

function validateRarity(rarity, describe, fail) {
  if (!isMarbleRarity(rarity)) fail(`${describe} : rareté inconnue "${rarity}" (${MARBLE_RARITIES.join(", ")}).`);
}

function validateSlot(slot, describe, fail) {
  if (!SLOTS.includes(slot)) fail(`${describe} : emplacement inconnu "${slot}".`);
}

// L'emplacement lu par une condition : un emplacement, ou une cible relative là où
// la bille a une référence (`context`, celui de la validation).
function validateConditionSlot(slot, describe, fail, context) {
  if (isRelative(slot)) {
    if (context && NO_REFERENCE_ZONES.includes(holderZoneOf(context).zone)) fail(`${describe} : un emplacement relatif n'a pas de référence ici : ${holderZoneOf(context).where}.`);
    return;
  }
  validateSlot(slot, describe, fail);
}

// Les billes d'un remplacement que relativeSize compare : celle qu'elle nomme,
// comparée à l'autre.
const REPLACEMENT_MARBLES = { ejected: "placed", placed: "ejected" };

// Un id de bille : une chaîne non vide (son existence se vérifie avec la table des
// billes, marbles/core/validation.js).
function validateMarbleId(marble, describe, fail) {
  if (typeof marble !== "string" || marble === "") fail(`${describe} : bille inconnue "${marble}".`);
}

// Une condition NIABLE (`not: true`, facultatif) : vraie quand son test est faux,
// « si la bille de l'emplacement suivant n'est pas de la famille Bestiaire ». Les
// conditions qui le déclarent (`negatable`) l'acceptent, les autres le refusent.
function validateNot(when, describe, fail) {
  if (when.not !== undefined && when.not !== true) fail(`${describe} : not vaut true, ou s'omet.`);
}

// Une BORNE, celle des conditions qui comparent un nombre : exactement une de
// `atLeast` (au moins) et `atMost` (au plus), un entier.
function validateBound(when, describe, fail) {
  const bounds = ["atLeast", "atMost"].filter((bound) => when[bound] !== undefined);
  if (bounds.length !== 1) fail(`${describe} : une borne, atLeast ou atMost, exactement.`);
  if (!Number.isInteger(when[bounds[0]])) fail(`${describe} : ${bounds[0]} doit être un entier.`);
}

// Un nombre respecte-t-il la borne d'une condition ?
function withinBound(value, when) {
  return when.atLeast !== undefined ? value >= when.atLeast : value <= when.atMost;
}

// Les COMPTEURS DU TOUR qu'une condition lit (stat) : la Vitesse et la Masse.
const TURN_STATS = Object.freeze(["speed", "mass"]);

// Les ÉTATS D'UN EMPLACEMENT (slotIs) : vide, occupé.
const SLOT_STATES = { empty: (placed) => placed === null, occupied: (placed) => placed !== null };


// La zone d'une condition ou d'une source : une zone déclarée.
function validateZone(zone, describe, fail) {
  if (!Object.hasOwn(GAME_ZONES, zone)) fail(`${describe} : zone inconnue "${zone}".`);
}

// Chaque condition : ses champs, leur validation (`context` : le moment du champ
// d'effet, voir targetProblem), et son test sur la situation (en-tête).
export const CONDITIONS = {
  // La bille à `slot` a-t-elle, IMPRIMÉ à cet emplacement, au moins `atLeast`
  // de `stat` ? Emplacement vide : non, il n'y a rien à lire. Dans un Tic, `slot`
  // peut être la bille éjectée (KNOCKED_OUT) : son effet imprimé à l'emplacement
  // qu'elle vient de quitter, celui de la bille qui la déloge.
  printedStat: {
    fields: ["type", "slot", "stat", "atLeast"],
    validate(when, describe, fail, context) {
      if (when.slot === KNOCKED_OUT) {
        if (context.trigger !== "hit") fail(`${describe} : la bille éjectée ne se lit que dans un Tic.`);
      } else validateConditionSlot(when.slot, describe, fail, context);
      if (!Object.hasOwn(CLAUSE_ACTIONS, when.stat)) fail(`${describe} : statistique inconnue "${when.stat}".`);
      // Seule une action à montant s'imprime : sur Empocher ou Éjecter, la condition
      // vaudrait toujours 0, jamais vraie dès « au moins 1 ».
      if (!CLAUSE_ACTIONS[when.stat].fields.includes("amount")) fail(`${describe} : "${when.stat}" n'a pas de montant, il n'y a rien d'imprimé à lire.`);
      if (!Number.isInteger(when.atLeast)) fail(`${describe} : atLeast doit être un entier.`);
    },
    test(when, { triangle, holder, replacement }, types) {
      if (when.slot === KNOCKED_OUT) {
        const ejected = replacement?.ejected ?? null;
        if (ejected === null || !SLOTS.includes(holder?.slot)) return false;
        return printedStat(effectAt(ejected, holder.slot, types), when.stat) >= when.atLeast;
      }
      // Un emplacement relatif sans référence (resolveClauses) : rien à lire.
      const placed = triangle[when.slot] ?? null;
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
      // Un statut qui éjecte n'est pas une bille : sans les deux calibres, rien à
      // comparer, la condition est fausse.
      if (subject === null || other === null) return false;
      return SIZE_COMPARISONS[when.is](types[subject].size, types[other].size);
    },
  },
  // L'ÉTAT D'UNE ZONE de la partie au déclenchement (GAME_ZONES, ZONE_STATES) :
  // « si le triangle est plein », « si la main est vide », « si le pot est plein ».
  // Pleine se compare à la capacité en vigueur.
  zone: {
    fields: ["type", "zone", "state"],
    validate(when, describe, fail) {
      validateZone(when.zone, describe, fail);
      if (!GAME_ZONES[when.zone].states.includes(when.state)) fail(`${describe} : la zone "${when.zone}" n'a pas d'état "${when.state}" (${GAME_ZONES[when.zone].states.join(", ") || "aucun"}).`);
    },
    test(when, { state, statuses }) {
      return ZONE_STATES[when.state].test(zoneCount(when.zone, state), GAME_ZONES[when.zone].capacity?.(state, statuses));
    },
  },
  // La bille à `slot` est-elle de calibre `size` ? Emplacement vide : non. Niable :
  // « n'est pas un calot » (emplacement vide : vrai, il n'y a pas de calot).
  sizeAt: {
    fields: ["type", "slot", "size", "not"],
    negatable: true,
    validate(when, describe, fail, context) {
      validateConditionSlot(when.slot, describe, fail, context);
      validateSize(when.size, describe, fail);
    },
    test(when, { triangle }, types) {
      const placed = triangle[when.slot] ?? null;
      return placed !== null && types[placed.marble].size === when.size;
    },
  },
  // La bille à `slot` est-elle de la famille `family` (parmi d'autres peut-être) ?
  // Emplacement vide : non.
  familyAt: {
    fields: ["type", "slot", "family", "not"],
    negatable: true,
    validate(when, describe, fail, context) {
      validateConditionSlot(when.slot, describe, fail, context);
      validateFamily(when.family, describe, fail);
    },
    test(when, { triangle }, types) {
      const placed = triangle[when.slot] ?? null;
      return placed !== null && types[placed.marble].families.includes(when.family);
    },
  },
  // La bille à `slot` est-elle de rareté `rarity`, exactement ? Emplacement vide : non.
  rarityAt: {
    fields: ["type", "slot", "rarity", "not"],
    negatable: true,
    validate(when, describe, fail, context) {
      validateConditionSlot(when.slot, describe, fail, context);
      validateRarity(when.rarity, describe, fail);
    },
    test(when, { triangle }, types) {
      const placed = triangle[when.slot] ?? null;
      return placed !== null && types[placed.marble].rarity === when.rarity;
    },
  },
  // La bille à `slot` est-elle la bille `marble` (un id) ? « si la bille de
  // l'emplacement précédent est une abeille ». Emplacement vide : non. Niable.
  marbleAt: {
    fields: ["type", "slot", "marble", "not"],
    negatable: true,
    validate(when, describe, fail, context) {
      validateConditionSlot(when.slot, describe, fail, context);
      validateMarbleId(when.marble, describe, fail);
    },
    test(when, { triangle }) {
      const placed = triangle[when.slot] ?? null;
      return placed !== null && placed.marble === when.marble;
    },
  },
  // L'emplacement `slot` est-il dans l'état `state` (SLOT_STATES : "empty",
  // "occupied") ? « si l'emplacement suivant est vide ». Un emplacement relatif sans
  // référence n'est ni l'un ni l'autre : faux.
  slotIs: {
    fields: ["type", "slot", "state"],
    validate(when, describe, fail, context) {
      validateConditionSlot(when.slot, describe, fail, context);
      if (!Object.hasOwn(SLOT_STATES, when.state)) fail(`${describe} : état d'emplacement inconnu "${when.state}" (${Object.keys(SLOT_STATES).join(", ")}).`);
    },
    test(when, { triangle }) {
      if (!SLOTS.includes(when.slot)) return false;
      return SLOT_STATES[when.state](triangle[when.slot] ?? null);
    },
  },
  // Pendant un remplacement : la bille `marble` ("ejected", l'éjectée, ou "placed",
  // celle qui l'éjecte : la posée, ou la bille d'un effet Éjecter) est-elle de calibre
  // `size` ? « Tic : Vitesse +4 si la bille éjectée est une minibille », « Éjection :
  // Empocher cette bille si la bille qui l'éjecte est un calot ». Sans bille (un statut
  // qui éjecte) : faux. Niable. Comme relativeSize, dans un Tic ou une Éjection
  // seulement.
  replacementSize: {
    fields: ["type", "marble", "size", "not"],
    negatable: true,
    validate(when, describe, fail, context) {
      if (!Object.hasOwn(REPLACEMENT_MARBLES, when.marble)) fail(`${describe} : bille de remplacement inconnue "${when.marble}".`);
      validateSize(when.size, describe, fail);
      if (context.replacement !== true) fail(`${describe} : replacementSize ne vaut que pendant un remplacement (Tic, Éjection).`);
    },
    test(when, { replacement }, types) {
      const subject = replacement?.[when.marble] ?? null;
      return subject !== null && types[subject].size === when.size;
    },
  },
  // Un NOMBRE comparé à une borne (validateBound) : la valeur d'une source de montant
  // (AMOUNT_SOURCES), « si vous avez au plus 3 billes en main », « si le pot compte au
  // moins 3 abeilles », « si le triangle compte au moins 3 familles différentes ».
  count: {
    fields: ["type", "source", "atLeast", "atMost"],
    validate(when, describe, fail, context) {
      validateRule(when.source, AMOUNT_SOURCES, "source", `${describe}, nombre`, fail, context);
      validateBound(when, describe, fail);
    },
    test(when, situation, types) {
      return withinBound(AMOUNT_SOURCES[when.source.type].value(when.source, situation, types), when);
    },
  },
  // TOUTES ces conditions (`conditions`, au moins deux, chacune validée comme une
  // condition, niée au besoin) : « si le triangle compte au moins 1 minibille et le
  // triangle compte au moins 1 calot ».
  all: {
    fields: ["type", "conditions"],
    validate(when, describe, fail, context) {
      if (!Array.isArray(when.conditions) || when.conditions.length < 2) fail(`${describe} : conditions est une liste d'au moins deux conditions.`);
      for (const condition of when.conditions) {
        validateRule(condition, CONDITIONS, "condition", `${describe}, et`, fail, context);
        validateNot(condition, `${describe}, et`, fail);
      }
    },
    test: (when, situation, types) => when.conditions.every((condition) => conditionHolds(condition, situation, types)),
  },
  // Un COMPTEUR DU TOUR (TURN_STATS), au déclenchement, avant l'effet qui le lit,
  // comparé à une borne : « si la Masse est d'au plus 1 », « si la Vitesse est d'au
  // moins 10 ».
  stat: {
    fields: ["type", "stat", "atLeast", "atMost"],
    validate(when, describe, fail) {
      if (!TURN_STATS.includes(when.stat)) fail(`${describe} : compteur du tour inconnu "${when.stat}" (${TURN_STATS.join(", ")}).`);
      validateBound(when, describe, fail);
    },
    test(when, { state }) {
      return state !== null && state !== undefined && withinBound(state[when.stat], when);
    },
  },
};

// Une condition est-elle vraie dans la situation, sa négation comprise (`not`) ?
export function conditionHolds(when, situation, types) {
  return CONDITIONS[when.type].test(when, situation, types) !== (when.not === true);
}

// Les BRANCHES d'une clause : elle, puis chaque clause de sa chaîne de remplacement
// (`otherwise`, voir l'en-tête « Sinon »), dans l'ordre. Ce qui cherche ce qu'une
// bille sait faire (ses mots-clés, ses statuts, une boucle) les lit toutes.
export function clauseBranches(clause) {
  return clause.otherwise === undefined ? [clause] : [clause, ...clauseBranches(clause.otherwise)];
}

// La branche d'une clause qui JOUE dans la situation : la première dont la condition
// est vraie, ou qui n'en a pas ; aucune (null) si toutes sont fausses.
function playingBranch(clause, situation, types) {
  if (clause.when === undefined || conditionHolds(clause.when, situation, types)) return clause;
  return clause.otherwise === undefined ? null : playingBranch(clause.otherwise, situation, types);
}

// Les BILLES CITÉES par des données d'effet (une condition marbleAt, un filtre
// "marble", où qu'ils soient : condition, cible, montant, chaîne de remplacement),
// que la table des billes doit contenir (marbles/core/validation.js).
export function referencedMarbles(data) {
  if (Array.isArray(data)) return data.flatMap(referencedMarbles);
  if (data === null || typeof data !== "object") return [];
  const own = (data.type === "marbleAt" || data.type === "marble") && typeof data.marble === "string" ? [data.marble] : [];
  return [...own, ...Object.values(data).flatMap(referencedMarbles)];
}

// Chaque SOURCE d'un montant calculé (en-tête), déclarée ICI ET NULLE PART AILLEURS :
//   fields    ses champs ;
//   validate  leur validation ;
//   value     sa valeur dans la situation, un entier >= 0 (sauf `signed`),
//             (source, situation, types) ;
//   signed    (facultatif) sa valeur peut être négative : seulement pour la Vitesse
//             et la Masse (validateAmount) ;
//   whole     (facultatif) elle ne se prend que telle quelle, base 0 et pas 1 ;
//   wholeText (facultatif) son gabarit quand elle se prend telle quelle (base 0, pas
//             1), « Vitesse égale à la Vitesse du tour » : il reçoit {action}, la
//             valeur produite (speed, mass), au lieu de {effect} ;
//   lists     (facultatif) ses paramètres de texte qui sont des LISTES de textes, par
//             clés i18n, (source) -> { param: [clés] } : « en main et sur le
//             triangle » ;
//   text      son gabarit i18n, après le pas, ou (source) -> gabarit : il reçoit
//             {effect} (« Vitesse +1 »), puis les paramètres de `params` et les
//             références de nom de `names` ;
//   params    (facultatif) ses paramètres de texte, des valeurs simples, (source) -> {} ;
//   names     (facultatif) ses paramètres de texte qui sont des NOMS, par clé i18n,
//             (source) -> { param: clé } : la vue en fait des références de nom
//             (nameRef), dont le gabarit choisit la forme ;
//   current   vrai si sa valeur se connaît hors de tout déclenchement, à partir de
//             la bille seule : la fiche dit alors la valeur actuelle (« actuellement
//             +2 ») ; faux si elle dépend du moment (le triangle au déclenchement) ;
//   needsState (facultatif) sa valeur actuelle se lit dans l'état de la partie en
//             cours : une fiche hors de toute partie ne la dit pas.
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
  // Le NOMBRE DE BILLES d'une zone de la partie (GAME_ZONES) au déclenchement : « par
  // bille en main », « par bille active ». FILTRÉ (`filters`, facultatif, un filtre de
  // TARGET_FILTERS) : seules les billes qui le passent, « par Brume à la défausse »,
  // « par minibille active » ; la bille elle-même comptée si elle en est. Une bille en
  // transit ne compte nulle part : en partance (son Final, son Éjection) comme en
  // cours de lancer (sa Chiquenaude). Sa valeur se connaît hors de tout
  // déclenchement, dans la partie en cours (`current`, `needsState` : la fiche la lit
  // dans l'état).
  // PLUSIEURS ZONES (`zones`, au lieu de `zone`) : leurs billes additionnées, « par
  // bille normale en main et sur le triangle ».
  zoneCount: {
    fields: ["type", "zone", "zones", "filters"],
    validate(source, describe, fail) {
      validateZoneChoice(source, describe, fail);
      if (source.filters !== undefined) validateFilters(source.filters, `${describe}, filtres du nombre de billes`, fail);
    },
    value(source, situation, types) {
      const marbles = zoneMarbles(source, situation.state);
      // Un filtre lit l'identité : une bille cachée ne le passe pas, et la prévision
      // ne peut pas dire si elle l'aurait passé.
      if (source.filters !== undefined) noteHidden(marbles, situation);
      return marbles.filter((marble) => passesFilters(marble, source.filters, types)).length;
    },
    // Un gabarit par type de filtre, `marbles.effect.per_zone_<filtre>` ; le calibre a
    // le sien sur le triangle (« par calot actif » : l'accord suit le calibre), comme
    // une bille précise (« par abeille active ») : GENDERED_FILTERS.
    text: (source) => {
      const filter = source.filters === undefined ? "" : `_${source.filters[0].type}`;
      if (source.zones !== undefined) return `marbles.effect.per_zones${filter}`;
      return `marbles.effect.per_zone${filter}${filter !== "" && GENDERED_FILTERS.has(source.filters[0].type) && source.zone === "triangle" ? "_triangle" : ""}`;
    },
    params: (source) => (source.zones === undefined ? { zone: source.zone } : {}),
    lists: (source) => (source.zones === undefined ? {} : { zones: zonePhrases(source.zones) }),
    names: (source) => (source.filters === undefined ? {} : FILTER_NAMES[source.filters[0].type](source.filters[0])),
    current: true,
    needsState: true,
  },
  // Le nombre de FAMILLES DIFFÉRENTES parmi les billes actives (distinctFamilies) :
  // toutes les familles comptent, Classiques comprises ; une bille à plusieurs
  // familles compte pour chacune ; une bille en transit ne compte pas. `zones`
  // (facultatif, au moins deux) : parmi les billes de ces zones ensemble, « par
  // famille différente sur le triangle et en main ».
  familyCount: {
    fields: ["type", "zones"],
    validate(source, describe, fail) {
      if (source.zones !== undefined) validateZoneList(source.zones, describe, fail);
    },
    value(source, situation, types) {
      const marbles = zoneMarbles(source.zones === undefined ? { zone: "triangle" } : source, situation.state);
      noteHidden(marbles, situation);
      return distinctFamilies(marbles, types);
    },
    text: (source) => (source.zones === undefined ? "marbles.effect.per_family" : "marbles.effect.per_family_zones"),
    lists: (source) => (source.zones === undefined ? {} : { zones: zonePhrases(source.zones) }),
    current: true,
    needsState: true,
  },
  // Un COMPTEUR DU TOUR (TURN_STATS : "speed", "mass") au déclenchement, avant
  // l'effet qui le lit ; négatif, il compte pour 0. « Vitesse égale à la Vitesse du
  // tour, maximum +8 » (base 0, pas 1), « Vitesse +2 par point de Masse du tour ».
  stat: {
    fields: ["type", "stat"],
    validate(source, describe, fail) {
      validateTurnStat(source.stat, describe, fail);
    },
    value: (source, { state }) => Math.max(0, state?.[source.stat] ?? 0),
    text: "marbles.effect.per_stat",
    wholeText: "marbles.effect.equal_stat",
    params: (source) => ({ stat: source.stat }),
    current: true,
    needsState: true,
  },
  // Ce que DONNE LA BILLE DE L'AUTRE BASE, `stat` ("speed", "mass") : son effet de
  // phase à son emplacement, joué comme s'il jouait au déclenchement (conditions,
  // sinon et montants calculés compris, sans bonus reçu ni statut), sans rien
  // appliquer. Un malus se copie aussi (signée). Emplacement vide, ou une copie
  // pendant une copie (deux billes qui se copieraient l'une l'autre) : 0. Seulement
  // dans un effet de base, telle quelle : « Vitesse égale à celle que donne la bille
  // de l'autre base ».
  otherBase: {
    fields: ["type", "stat"],
    signed: true,
    whole: true,
    validate(source, describe, fail, context) {
      validateTurnStat(source.stat, describe, fail);
      const bases = ["leftBase", "rightBase"];
      if (!(context?.phaseSlots?.length > 0 && context.phaseSlots.every((slot) => bases.includes(slot)))) fail(`${describe} : otherBase ne vaut que dans un effet de base.`);
    },
    value(source, situation, types) {
      const other = OTHER_BASE[situation.holder?.slot];
      const placed = other === undefined ? null : (situation.triangle?.[other] ?? null);
      if (placed === null || situation.copying === true) return 0;
      const copied = { ...situation, holder: { marble: placed.marble, zone: "triangle", slot: other, turnsInHand: 0, departed: null }, replacement: null, copying: true };
      return evaluateEffect(resolveClauses(effectAt(placed.marble, other, types), other), copied, types).self[source.stat];
    },
    text: "marbles.effect.equal_other_base",
    wholeText: "marbles.effect.equal_other_base",
    params: (source) => ({ stat: source.stat }),
    current: false,
  },
  // L'USURE d'une bille : la sienne (`marble` absent), ou celle de la bille éjectée
  // (`marble: "ejected"`, pendant un remplacement) ; `remaining` (facultatif, true) :
  // ce qui lui reste avant son maximum. Sur le triangle, son usure du moment ; partie
  // du triangle (son Final, son Éjection, sa Chute ; l'éjectée pendant le Tic), celle
  // qu'elle avait en partant (sa trace, `departed`) ; sans usure (jamais posée) : 0.
  // « Chute : Vitesse +5, −1 par point d'usure de cette bille », « Tic : … si la bille
  // éjectée a au plus 1 point d'usure restant ».
  wear: {
    fields: ["type", "marble", "remaining"],
    validate(source, describe, fail, context) {
      if (source.remaining !== undefined && source.remaining !== true) fail(`${describe} : remaining vaut true, ou s'omet.`);
      if (source.marble !== undefined && source.marble !== "ejected") fail(`${describe} : marble vaut "ejected", ou s'omet (la bille elle-même).`);
      if (source.marble === "ejected" && context?.replacement !== true) fail(`${describe} : l'usure de la bille éjectée ne se lit que pendant un remplacement (Tic, Éjection).`);
      if (source.marble === undefined && context !== undefined && WEARLESS_ZONES.includes(holderZoneOf(context).zone)) fail(`${describe} : la bille n'a pas d'usure ici : ${holderZoneOf(context).where}.`);
    },
    value(source, situation, types) {
      const { marble, trace } = wearSubject(source, situation);
      if (marble === null || trace === null) return 0;
      return source.remaining === true ? Math.max(0, (types[marble].maxWear ?? MARBLES_SETTINGS.defaultMaxWear) - trace.wear) : trace.wear;
    },
    text: (source) => (source.remaining === true ? "marbles.effect.per_wear_remaining" : "marbles.effect.per_wear"),
    params: (source) => ({ marble: source.marble ?? "self" }),
    current: false,
  },
  // Les TOURS PASSÉS SUR LE TRIANGLE par la bille elle-même : les phases qu'elle y a
  // jouées (`phases`), celle de ce tour comprise une fois jouée ; partie du triangle,
  // celles d'avant son départ (sa trace). « Final : Vitesse +2 par tour passé sur le
  // triangle, maximum +10 ».
  turnsOnTriangle: {
    fields: ["type"],
    validate(source, describe, fail, context) {
      if (context !== undefined && WEARLESS_ZONES.includes(holderZoneOf(context).zone)) fail(`${describe} : la bille n'est pas passée par le triangle ici : ${holderZoneOf(context).where}.`);
    },
    value(source, situation) {
      const { trace } = wearSubject({}, situation);
      return trace === null ? 0 : trace.phases;
    },
    text: "marbles.effect.per_turn_on_triangle",
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


// L'autre base, depuis une base.
const OTHER_BASE = { leftBase: "rightBase", rightBase: "leftBase" };

// Une source qui lit l'identité de billes, dont une cachée (à l'aveugle) : la situation
// le note (`onHiddenRead`), la prévision se dira incertaine.
function noteHidden(marbles, situation) {
  if (situation.onHiddenRead !== undefined && marbles.includes(UNKNOWN_MARBLE)) situation.onHiddenRead();
}

// Les zones d'où une bille n'a jamais d'usure à lire : en main (son Éveil), en cours
// de lancer, dans le pot, ou sans bille (un statut).
const WEARLESS_ZONES = ["hand", "thrown", "pot", "status"];

// La bille dont une source lit l'usure, et sa TRACE ({ wear, phases }) : sur le
// triangle, son entrée du moment ; partie, sa trace de départ ; l'éjectée d'un
// remplacement, la trace que porte le remplacement. -> { marble, trace }, trace null
// sans usure à lire.
function wearSubject(source, { holder, triangle, replacement }) {
  if (source.marble === "ejected") return { marble: replacement?.ejected ?? null, trace: replacement?.departed ?? null };
  if (holder?.zone === "triangle") {
    const placed = triangle?.[holder.slot] ?? null;
    return { marble: holder.marble, trace: placed === null || placed.marble !== holder.marble ? null : { wear: placed.wear, phases: placed.phases ?? 0 } };
  }
  return { marble: holder?.marble ?? null, trace: holder?.departed ?? null };
}

// Un compteur du tour (TURN_STATS) connu ?
function validateTurnStat(stat, describe, fail) {
  if (!TURN_STATS.includes(stat)) fail(`${describe} : compteur du tour inconnu "${stat}" (${TURN_STATS.join(", ")}).`);
}

// Une liste de zones de la partie : au moins deux, connues, chacune une fois.
function validateZoneList(zones, describe, fail) {
  if (!Array.isArray(zones) || zones.length < 2) fail(`${describe} : zones est une liste d'au moins deux zones.`);
  for (const zone of zones) validateZone(zone, describe, fail);
  if (new Set(zones).size !== zones.length) fail(`${describe} : une zone en double.`);
}

// Le nombre de billes : une zone (`zone`), ou plusieurs (`zones`), jamais les deux.
function validateZoneChoice(source, describe, fail) {
  if ((source.zone === undefined) === (source.zones === undefined)) fail(`${describe} : une zone (zone) ou plusieurs (zones), exactement.`);
  if (source.zone !== undefined) validateZone(source.zone, describe, fail);
  else validateZoneList(source.zones, describe, fail);
}

// Les billes d'une zone (`zone`) ou de plusieurs (`zones`), dans l'état.
function zoneMarbles(source, state) {
  return (source.zones ?? [source.zone]).flatMap((zone) => GAME_ZONES[zone].marbles(state));
}

// Les clés de texte de zones, « en main », « sur le triangle » (une liste dite).
function zonePhrases(zones) {
  return zones.map((zone) => `marbles.zone_where.${zone}`);
}

// Les filtres dont le nom porte le genre (le calibre, une bille précise) : sur le
// triangle, « actif » ou « active » s'accorde avec lui, un gabarit à part.
const GENDERED_FILTERS = new Set(["size", "marble"]);

// Les NOMS d'un filtre, pour le gabarit d'un nombre de billes filtré : { param: clé
// i18n }, dont la vue fait des références de nom (`names` des sources).
const FILTER_NAMES = {
  size: (filter) => ({ size: `marbles.size.${MARBLE_SIZES[filter.size]}.name` }),
  family: (filter) => ({ family: `marbles.family.${filter.family}.name` }),
  rarity: (filter) => ({ rarity: `marbles.rarity.${filter.rarity}.name` }),
  marble: (filter) => ({ marble: `marble.${filter.marble}.name` }),
};
for (const type of Object.keys(TARGET_FILTERS)) {
  if (!Object.hasOwn(FILTER_NAMES, type)) throw new Error(`marbles : le filtre "${type}" doit avoir ses noms (FILTER_NAMES).`);
}

// Un montant (entier, ou calculé : en-tête) évalué dans une situation. La fiche s'en
// sert aussi, pour dire la valeur actuelle d'un montant calculé dont la source est
// `current` (avec la table des billes de la partie, que lisent les filtres).
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

// Une cible « toutes » (en-tête) : ses champs, son filtre (validateFilters).
function validateAll(clause, action, describe, fail) {
  const all = clause.target;
  const where = `${describe}, cible « toutes »`;
  rejectUnknownFields(all, ["type", "filters"], where, fail);
  if (action.all !== true) fail(`${where} : ${clause.action} ne vise pas toutes les billes.`);
  if (all.filters !== undefined) validateFilters(all.filters, where, fail);
}

// Une liste de filtres de bille (TARGET_FILTERS) : UN SEUL filtre aujourd'hui, valide
// (ses textes n'en disent qu'un : deux demanderont une phrase qui les combine). Celle
// d'une cible « toutes », celle d'un modificateur de statut (marbles/core/
// validation.js) et celle d'un nombre de billes.
export function validateFilters(filters, where, fail) {
  if (!Array.isArray(filters) || filters.length === 0) fail(`${where} : filters doit être une liste non vide.`);
  if (filters.length > 1) fail(`${where} : un seul filtre à la fois aujourd'hui (${filters.length} donnés).`);
  for (const filter of filters) validateRule(filter, TARGET_FILTERS, "filtre", where, fail);
}

// Une cible relative : seulement pour une action qui accepte un emplacement, et là
// où la bille a une référence (jamais à l'Éveil ni en poche).
function validateRelative(clause, action, describe, fail, context) {
  const where = `${describe}, cible relative`;
  if (!(action.targets ?? SLOTS).some((target) => SLOTS.includes(target))) fail(`${where} : l'action "${clause.action}" ne vise pas un emplacement.`);
  const { zone, where: holderWhere } = holderZoneOf(context);
  if (context.trigger !== undefined || context.moment !== undefined || context.phaseSlots !== undefined) {
    if (NO_REFERENCE_ZONES.includes(zone)) fail(`${where} : la bille n'a pas d'emplacement de référence ici : ${holderWhere}.`);
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
    // Sinon : seulement après une condition ; la clause de remplacement se valide
    // comme une clause du même champ.
    const { otherwise, ...own } = clause;
    if (otherwise !== undefined) {
      if (clause.when === undefined) fail(`${describe} : otherwise demande une condition (when).`);
      if (otherwise === null || typeof otherwise !== "object" || Array.isArray(otherwise)) fail(`${describe} : otherwise est une clause.`);
      validateEffect([otherwise], `${describe}, sinon`, fail, context);
    }
    rejectUnknownFields(own, action.fields, describe, fail);
    action.validate(clause, describe, fail, context);
    if (isChoice(clause.target)) validateChoice(clause, action, describe, fail);
    else if (isAll(clause.target)) validateAll(clause, action, describe, fail);
    else if (isBag(clause.target)) validateBag(clause, action, describe, fail);
    else if (isRelative(clause.target)) validateRelative(clause, action, describe, fail, context);
    else if (clause.target !== undefined && !(action.targets ?? SLOTS).includes(clause.target)) fail(`${describe} : cible inconnue "${clause.target}".`);
    const problem = targetProblem(clause, context);
    if (problem !== null) fail(`${describe} : ${problem}.`);
    if (clause.when !== undefined) {
      validateRule(clause.when, CONDITIONS, "condition", describe, fail, context);
      validateNot(clause.when, describe, fail);
    }
  }
}

// La cible d'une clause relative SANS RÉFÉRENCE (resolveClauses) : elle reste à sa
// place, évaluée comme les autres (condition, montant), puis ne fait rien, notée au
// journal (marbles/core/run.js/applyOperation).
export const NO_REFERENCE = "noReference";

// Les clauses d'un effet, leurs CIBLES RELATIVES traduites depuis `reference`
// (l'emplacement d'où la bille agit, ou null) : la cible et l'emplacement des
// conditions. Une cible relative sans référence devient NO_REFERENCE ; une condition
// sur un emplacement relatif sans référence est fausse.
export function resolveClauses(clauses, reference) {
  return clauses.map((clause) => resolveClause(clause, reference));
}

// Une clause, et sa chaîne de remplacement (`otherwise`), traduites (resolveClauses).
function resolveClause(clause, reference) {
  let next = clause;
  if (clause.when?.slot !== undefined && isRelative(clause.when.slot)) next = { ...next, when: { ...clause.when, slot: resolveRelative(clause.when.slot, reference) } };
  if (isRelative(clause.target)) next = { ...next, target: resolveRelative(clause.target, reference) ?? NO_REFERENCE };
  if (clause.otherwise !== undefined) next = { ...next, otherwise: resolveClause(clause.otherwise, reference) };
  return next;
}

// Évalue des clauses dans une SITUATION (en-tête), au moment du déclenchement :
//   self        les valeurs de la bille elle-même, toutes présentes ;
//   gifts       ce qui va à d'autres emplacements, [{ slot, ...valeurs donnables }] ;
//               un bonus au choix porte `choice` (sa cible), `action` et `amount` au
//               lieu de `slot` : le core demande le choix (marbles/core/run.js/fireEffect) ;
//   operations  les actions sur une bille et de statut, dans l'ordre des clauses,
//               [{ action, amount, target }] (`target` absent : la bille elle-même ;
//               un choix : la cible au choix, que le core fait trancher ; NO_REFERENCE :
//               une cible relative sans référence, sans effet) ; un statut :
//               [{ action, status, amount, duration, stacking }]
//               (marbles/core/statuses.js/statusApplication).
// Une clause dont la condition échoue joue sa clause de remplacement (`otherwise`), ou
// rien ; une clause dont le montant (calculé s'il l'est) vaut zéro ne produit rien.
// Seules les valeurs finales en sortent.
export function evaluateEffect(clauses, situation, types) {
  let self = ZERO;
  const gifts = [];
  const operations = [];
  for (const written of clauses) {
    const printed = playingBranch(written, situation, types);
    if (printed === null) continue;
    const { kind, apply, amountless } = CLAUSE_ACTIONS[printed.action];
    // Une action sans montant (Empocher) s'applique telle quelle.
    const amount = amountless ? undefined : amountOf(printed.amount, situation, types);
    if (amount === 0) continue;
    const clause = { ...printed, amount };
    const target = clause.target === undefined ? {} : { target: clause.target };
    // Sans référence (resolveClauses) : une action à sa place, sans effet, quelle que
    // soit sa sorte (une valeur pour un autre emplacement comprise).
    if (clause.target === NO_REFERENCE) operations.push({ action: clause.action, ...(amountless ? {} : { amount: clause.amount }), target: NO_REFERENCE });
    else if (kind === "marble") operations.push({ action: clause.action, ...(amountless ? {} : { amount: clause.amount }), ...target });
    // Un statut : son application résolue d'après sa définition (la table de la
    // situation), son intensité et sa durée comprises.
    else if (kind === "status") operations.push({ action: clause.action, ...statusApplication(clause, definitionOf(situation.statuses ?? NO_STATUSES, clause.status)) });
    else if (clause.target === undefined) self = apply(self, clause);
    else if (isChoice(clause.target)) gifts.push({ choice: clause.target, action: clause.action, amount: clause.amount, ...apply(GIFT_ZERO, clause) });
    else gifts.push({ slot: clause.target, ...apply(GIFT_ZERO, clause) });
  }
  return { self, gifts, operations };
}
