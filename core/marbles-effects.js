// Jeu des billes : le MODÈLE D'EFFET. Un effet est une liste de clauses, de la
// donnée (format : en-tête de config/marbles-values.js). Ce module sait la
// valider, lire ce qu'une bille a d'imprimé et l'évaluer sur un triangle ; pur,
// il ne touche à aucun état : appliquer le résultat est l'affaire de
// core/marbles.js.
//
// AJOUTER une action ou une condition : une entrée dans CLAUSE_ACTIONS ou
// CONDITIONS, et ses textes dans la vue (view/marbles/narration.js, ACTION_TEXTS ou
// CONDITION_TEXTS). AJOUTER une source de montant : une entrée dans AMOUNT_SOURCES,
// textes compris, rien d'autre ; chaque valeur de partie en est une d'office, par la
// source `tally` (core/marbles-counters.js). Une cible est un emplacement, ou rien pour la bille
// elle-même.
//
// LA SITUATION d'un effet, ce que ses conditions et ses montants calculés lisent au
// déclenchement : { triangle, holder, replacement, tally } ;
//   triangle     le triangle à cet instant ;
//   holder       la bille qui joue l'effet, { marble, zone, turnsInHand } : `zone`
//                dit où elle est ("triangle" ; "removed", déjà retirée du triangle,
//                le Final ; "thrown", en cours de lancer, la Chiquenaude ;
//                "hand") ; `turnsInHand`, son compteur de tours en main (0 hors de
//                la main ; pendant son lancer, celui qu'elle avait en la quittant) ;
//   replacement  pendant un Tic ou une Éjection, le remplacement en cours,
//                { placed, ejected } (deux ids de bille) ; null sinon ;
//   tally        les valeurs de partie à cet instant (core/marbles-tally.js), lues
//                par tallyValue seulement.
//
// La VALIDATION reçoit un contexte (validateEffect) : le moment où l'effet joue
// (règle des cibles, conditions) et `tallies`, les identifiants des valeurs de
// partie (core/marbles.js les fournit), que vérifie la source `tally`.
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
// s'additionnent en un effet, et les actions SUR UNE BILLE (Polissage, Fêlure), qui
// changent l'usure de la bille elle-même ou de celle d'un emplacement, une
// application par clause, dans l'ordre des clauses.
//
// RÈGLE DES CIBLES : une cible n'a de sens que si l'effet ciblé peut encore se
// produire. Une VALEUR (Vitesse, Masse) donnée à un emplacement modifie l'effet de
// PHASE de sa bille : elle ne vaut que si cette phase peut encore avoir lieu ce
// tour. La validation refuse les cas toujours impossibles (targetProblem) ; les cas
// qui dépendent de la position se tranchent à l'exécution (core/marbles.js/
// fireEffect : le bonus est perdu, l'évènement `effect` le note dans `lost`). Une
// action sur une bille peut viser un emplacement depuis n'importe quel moment, la
// bille visée restant sur le triangle ; mais pas la bille elle-même une fois
// retirée (le Final).
//
// VALEURS : ce qu'un effet produit, une valeur par action, sous le nom de
// l'action (`{ speed, mass, draw }`). Le core les applique (core/marbles.js/fireEffect),
// la vue les dit, la prévision les rend.

import { MARBLE_SIZES } from "../config/marbles-values.js";
import { rejectUnknownFields } from "../lib/validate.js";
import { TALLY_SCOPES, tallyValue } from "./marbles-tally.js";

// Un calibre connu (config/marbles-values.js/MARBLE_SIZES) ?
export function isMarbleSize(size) {
  return Number.isInteger(size) && Object.hasOwn(MARBLE_SIZES, size);
}

// Emplacements, dans l'ordre de RÉSOLUTION (phases de base gauche, de base
// droite, de pointe).
export const SLOTS = ["leftBase", "rightBase", "apex"];

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
//   keyword   (facultatif) l'action est un MOT-CLÉ : `texts`, son nom et sa
//             description (aide des mots-clés, touches E et Maj+E ; sans eux, le
//             chargement échoue, core/marbles.js) ; ses valeurs de partie
//             (core/marbles-counters.js) : `triggers(event)`, ce qu'un évènement du
//             journal ajoute à ses déclenchements ; `quantity(event)` (facultatif),
//             à sa quantité réelle. Une action de valeur sans mot-clé (Vitesse,
//             Masse) a ses gains et ses pertes.
// Le `kind` "marble" : une action sur une bille. Ses textes :
// view/marbles/narration.js/ACTION_TEXTS.
export const CLAUSE_ACTIONS = {
  // Ajoute `amount` (négatif permis) à la Vitesse.
  speed: { kind: "value", fields: TARGETED_FIELDS, validate: validateInteger, apply: addAmount },
  // Ajoute `amount` (négatif permis) à la Masse.
  mass: { kind: "value", fields: TARGETED_FIELDS, validate: validateInteger, apply: addAmount },
  // Pioche : `amount` billes (au moins 1), piochées par la bille elle-même au
  // déclenchement (core/marbles.js/drawMarbles), à tout moment du tour. Sans
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
    keyword: marbleActionKeyword("polish", "polished"),
  },
  // Fêlure : ajoute `amount` d'usure (au moins 1), jamais au-delà du maximum ; à son
  // maximum, la bille est retirée aussitôt, comme par usure (core/marbles.js/
  // retireMarble).
  crack: {
    kind: "marble",
    fields: TARGETED_FIELDS,
    validate: validatePositive,
    wear: (wear, amount, maxWear) => Math.min(maxWear, wear + amount),
    event: "cracked",
    retires: true,
    keyword: marbleActionKeyword("crack", "cracked"),
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

// Le moment où joue un champ d'effet, pour la règle des cibles (core/marbles.js le
// construit) :
//   { phaseSlots }  une phase, jouée à l'un de ces emplacements (base : les deux
//                   bases ; une variante : la sienne ; pointe : la pointe) ;
//   { moment }      un déclencheur : "play" (pendant la phase de jeu, avant toute
//                   phase), "afterPhases" (après toutes les phases : le Final) ou
//                   "anytime" (n'importe quand : la Trouvaille, tranchée à
//                   l'exécution) ;
//                   `marble`, sa bille (config/marbles-values.js/MARBLE_TRIGGERS) :
//                   "removed" (déjà retirée) et "thrown" (en cours de lancer) ne
//                   sont pas sur le triangle.
// Un emplacement vient-il APRÈS un autre dans l'ordre des phases ?
const phaseIndex = (slot) => SLOTS.indexOf(slot);

// Ce qui rend une clause toujours impossible à ce moment, ou null.
function targetProblem(clause, context) {
  const action = CLAUSE_ACTIONS[clause.action];
  if (action.kind === "marble" && clause.target === undefined) {
    if (context.marble === "removed") return "une action sur la bille elle-même n'a plus de bille : elle a quitté le triangle";
    if (context.marble === "thrown") return "une action sur la bille elle-même n'a pas encore de bille : elle est en cours de lancer";
    if (context.marble === "drawn") return "une action sur la bille elle-même n'a pas de bille sur le triangle : elle vient d'être piochée, en main";
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

// Les comparaisons de CALIBRE, sur l'entier (config/marbles-values.js : SMALL <
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
  // Les tours passés en main par la bille elle-même (core/marbles.js, en-tête) :
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
  // comprise si elle en est : sur le triangle, elle s'y compte ; déjà retirée (le
  // Final), elle s'ajoute. En cours de lancer (la Chiquenaude), elle n'est pas
  // active : elle ne compte pas.
  activeSize: {
    fields: ["type", "size"],
    validate(source, describe, fail) {
      validateSize(source.size, describe, fail);
    },
    value(source, { triangle, holder }, types) {
      const onTriangle = SLOTS.filter((slot) => triangle[slot] !== null && types[triangle[slot].marble].size === source.size).length;
      const self = holder.zone === "removed" && types[holder.marble].size === source.size ? 1 : 0;
      return onTriangle + self;
    },
    text: "marbles.effect.per_active_size",
    names: (source) => ({ size: `marbles.size.${MARBLE_SIZES[source.size]}.name` }),
    current: false,
  },
  // Une VALEUR DE PARTIE (core/marbles-counters.js) dans une portée : « par
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
    if (clause.target !== undefined && !SLOTS.includes(clause.target)) fail(`${describe} : cible inconnue "${clause.target}".`);
    const problem = targetProblem(clause, context);
    if (problem !== null) fail(`${describe} : ${problem}.`);
    if (clause.when !== undefined) validateRule(clause.when, CONDITIONS, "condition", describe, fail, context);
  }
}

// Évalue des clauses dans une SITUATION (en-tête), au moment du déclenchement :
//   self        les valeurs de la bille elle-même, toutes présentes ;
//   gifts       ce qui va à d'autres emplacements, [{ slot, ...valeurs donnables }] ;
//   operations  les actions sur une bille, dans l'ordre des clauses,
//               [{ action, amount, target }] (`target` absent : la bille elle-même).
// Une clause dont la condition échoue, ou dont le montant (calculé s'il l'est) vaut
// zéro, ne produit rien. Seules les valeurs finales en sortent.
export function evaluateEffect(clauses, situation, types) {
  let self = ZERO;
  const gifts = [];
  const operations = [];
  for (const printed of clauses) {
    if (printed.when !== undefined && !CONDITIONS[printed.when.type].test(printed.when, situation, types)) continue;
    const amount = amountOf(printed.amount, situation, types);
    if (amount === 0) continue;
    const clause = { ...printed, amount };
    const { kind, apply } = CLAUSE_ACTIONS[clause.action];
    if (kind === "marble") operations.push({ action: clause.action, amount: clause.amount, ...(clause.target === undefined ? {} : { target: clause.target }) });
    else if (clause.target === undefined) self = apply(self, clause);
    else gifts.push({ slot: clause.target, ...apply(GIFT_ZERO, clause) });
  }
  return { self, gifts, operations };
}
