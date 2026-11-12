// JEU DES BILLES — LA VALIDATION des tables INJECTÉES : la table des billes, celle
// des statuts, et les réglages d'une partie avec leur sac. Échouer au chargement,
// jamais en pleine partie : les règles (marbles/core/rules.js) valident leurs tables à
// la composition, main.js et l'audit du contenu le contenu du jeu au démarrage.
// Ce qu'elle lit vient du catalogue (marbles/core/content.js : valeurs de partie,
// champs d'effet, moments En poche), qui valide lui-même, à son chargement, les
// déclarations dont il est fait (déclencheurs, phases, En poche). Pur.

import { MARBLES_SETTINGS, MARBLE_PHASES, MARBLE_POCKET, MARBLE_TRIGGERS, STARTING_BAG } from "../config/values.js";
import { rejectUnknownFields } from "../../lib/validate.js";
import { isMarbleSize, validateEffect } from "./effects.js";
import { EFFECT_FIELDS, FIXED_MOMENTS, LISTENABLE_KEYS, REACTION_KEYS, REACTIVE_MOMENT, TALLY_COUNTERS, TALLY_IDS, pocketClauses, reactionClauses } from "./content.js";
import { CHARACTERISTICS, MODIFIER_OPERATIONS, MODIFIER_POINTS, NO_STATUSES, STATUS_BEHAVIORS, STATUS_DURATIONS, STATUS_STACKINGS } from "./statuses.js";

// La catégorie de chaque valeur de partie (marbles/core/counters.js), que lit le
// garde-fou des boucles directes.
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

// --- Table des billes ---

// Échoue sur une table mal formée. La vraie est validée au démarrage
// (validateMarblesContent) ; exportée aussi pour vérifier le rejet sur des tables
// fabriquées. `statuses` : la table des statuts, que vérifie l'action Appliquer un
// statut (aucune par défaut : un statut cité est alors inconnu).
export function validateMarbleTypes(types, statuses = NO_STATUSES) {
  const fail = (message) => {
    throw new Error(`marbles : ${message}`);
  };
  // Le contexte de validation d'un effet : son moment, les valeurs de partie et les
  // statuts que ses clauses peuvent citer.
  const contextOf = (moment) => ({ ...moment, tallies: TALLY_IDS, statuses });
  if (Object.keys(types).length === 0) fail("table des billes vide.");
  for (const [id, type] of Object.entries(types)) {
    rejectUnknownFields(type, [...EFFECT_FIELDS, "baseVariant", MARBLE_POCKET.field, "maxWear", "size"], `bille "${id}"`, fail);
    // Le calibre, obligatoire : lu par les conditions de calibre et par le son.
    if (!isMarbleSize(type.size)) fail(`bille "${id}" : calibre (size) absent ou inconnu "${type.size}".`);
    for (const field of EFFECT_FIELDS) {
      if (type[field] !== undefined) validateEffect(type[field], `bille "${id}", ${field}`, fail, contextOf(FIELD_CONTEXTS[field]));
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
        if (effect !== null) validateEffect(effect, `${describe}.${moment.id}`, fail, contextOf({ moment: moment.moment, marble: "pot" }));
      }
      for (const key of REACTION_KEYS) {
        const effect = reactionClauses(type, key);
        if (effect === null) continue;
        validateEffect(effect, `${describe}.${key}`, fail, contextOf({ moment: REACTIVE_MOMENT.moment, marble: "pot" }));
        rejectDirectLoop(effect, key, `${describe}.${key}`, fail);
      }
    }
    if (type.baseVariant !== undefined) {
      rejectUnknownFields(type.baseVariant, ["leftBase", "rightBase"], `bille "${id}", baseVariant`, fail);
      for (const [slot, effect] of Object.entries(type.baseVariant)) {
        validateEffect(effect, `bille "${id}", baseVariant.${slot}`, fail, contextOf({ phaseSlots: [slot] }));
      }
    }
    if (type.maxWear !== undefined && (!Number.isInteger(type.maxWear) || type.maxWear < 1)) {
      fail(`bille "${id}" : maxWear doit être un entier >= 1.`);
    }
  }
}

// La boucle directe : réagir au déclenchement d'une action qu'on produit soi-même
// (« à chaque polissage : Polissage 1 ») se relancerait sans fin. Une bille du pot
// comme un statut.
function rejectDirectLoop(effect, key, describe, fail) {
  if (COUNTER_CATEGORIES[key] === "action" && effect.some((clause) => clause.action === key)) {
    fail(`${describe} : réagit à « ${key} » en le produisant, une boucle sans fin.`);
  }
}

// --- Table des statuts ---

// Échoue sur une table des statuts mal formée (format : en-tête de
// marbles/core/statuses.js). La vraie est validée au démarrage
// (validateMarblesContent) et par les règles (marbles/core/rules.js) ; exportée pour
// vérifier le rejet sur des tables fabriquées. Une réaction est un effet de billes,
// joué sans bille : toute clause, sauf sur la bille elle-même et vers un
// emplacement relatif (comme dans le pot).
export function validateMarbleStatuses(statuses) {
  const fail = (message) => {
    throw new Error(`marbles, statuts : ${message}`);
  };
  if (statuses === null || typeof statuses !== "object" || Array.isArray(statuses)) fail("la table des statuts est un objet { id: définition }.");
  for (const [id, definition] of Object.entries(statuses)) {
    const describe = `statut "${id}"`;
    rejectUnknownFields(definition, ["stacking", "duration", "behaviors"], describe, fail);
    if (!STATUS_STACKINGS.includes(definition.stacking)) fail(`${describe} : cumul (stacking) inconnu "${definition.stacking}" (${STATUS_STACKINGS.join(", ")}).`);
    const { duration } = definition;
    if (duration === null || typeof duration !== "object") fail(`${describe} : duration doit être { kind, count? }.`);
    rejectUnknownFields(duration, ["kind", "count"], `${describe}, durée`, fail);
    const kind = STATUS_DURATIONS[duration.kind];
    if (kind === undefined) fail(`${describe} : durée inconnue "${duration.kind}" (${Object.keys(STATUS_DURATIONS).join(", ")}).`);
    if (kind.counted && (!Number.isInteger(duration.count) || duration.count < 1)) fail(`${describe} : la durée "${duration.kind}" demande un count entier >= 1.`);
    if (!kind.counted && duration.count !== undefined) fail(`${describe} : la durée "${duration.kind}" n'a pas de count.`);
    if (definition.stacking === "duration" && !kind.stackable) fail(`${describe} : un cumul en durée n'a pas de sens pour la durée "${duration.kind}".`);
    if (!Array.isArray(definition.behaviors) || definition.behaviors.length === 0) fail(`${describe} : behaviors doit être une liste non vide.`);
    for (const behavior of definition.behaviors) validateStatusBehavior(behavior, statuses, describe, fail);
    // Une charge ne se consomme qu'à un vrai changement d'une valeur interceptée.
    if (kind.charges && !definition.behaviors.some((behavior) => behavior.type === "modifier")) fail(`${describe} : une durée en charges demande un modificateur, seul à consommer une charge.`);
  }
}

// Un comportement d'un statut (en-tête de marbles/core/statuses.js).
function validateStatusBehavior(behavior, statuses, describe, fail) {
  if (!STATUS_BEHAVIORS.includes(behavior?.type)) fail(`${describe} : comportement inconnu "${behavior?.type}" (${STATUS_BEHAVIORS.join(", ")}).`);
  const where = `${describe}, ${behavior.type}`;
  if (behavior.type === "stat") {
    rejectUnknownFields(behavior, ["type", "stat", "amount"], where, fail);
    if (!Object.hasOwn(CHARACTERISTICS, behavior.stat)) fail(`${where} : caractéristique inconnue "${behavior.stat}" (${Object.keys(CHARACTERISTICS).join(", ")}).`);
    if (!Number.isInteger(behavior.amount) || behavior.amount === 0) fail(`${where} : amount doit être un entier non nul.`);
  } else if (behavior.type === "modifier") {
    rejectUnknownFields(behavior, ["type", "point", "operation", "value"], where, fail);
    if (!Object.hasOwn(MODIFIER_POINTS, behavior.point)) fail(`${where} : point d'interception inconnu "${behavior.point}" (${Object.keys(MODIFIER_POINTS).join(", ")}).`);
    if (!Object.hasOwn(MODIFIER_OPERATIONS, behavior.operation)) fail(`${where} : opération inconnue "${behavior.operation}" (${Object.keys(MODIFIER_OPERATIONS).join(", ")}).`);
    if (!Number.isInteger(behavior.value)) fail(`${where} : value doit être un entier.`);
    if (behavior.operation === "add" && behavior.value === 0) fail(`${where} : ajouter 0 ne change rien.`);
    if (behavior.operation === "multiply" && (behavior.value < 0 || behavior.value === 1)) fail(`${where} : un multiplicateur est un entier >= 0, autre que 1 (le signe ne s'inverse jamais).`);
  } else {
    rejectUnknownFields(behavior, ["type", "on", "effect"], where, fail);
    if (!LISTENABLE_KEYS.includes(behavior.on)) fail(`${where} : « ${behavior.on} » n'est pas une valeur de partie écoutable.`);
    validateEffect(behavior.effect, `${where} ${behavior.on}`, fail, { moment: "anytime", marble: "status", tallies: TALLY_IDS, statuses });
    rejectDirectLoop(behavior.effect, behavior.on, `${where} ${behavior.on}`, fail);
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
// table des statuts, celle des billes, et les réglages avec le sac de test, qui ne
// doit citer que des billes connues. Une erreur ici échouerait sinon en pleine partie.
export function validateMarblesContent(types, statuses) {
  validateMarbleStatuses(statuses);
  validateMarbleTypes(types, statuses);
  validateGameSettings({ ...MARBLES_SETTINGS, bag: STARTING_BAG }, types);
}
