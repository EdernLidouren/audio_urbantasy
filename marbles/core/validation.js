// JEU DES BILLES — LA VALIDATION des tables INJECTÉES : la table des billes, celle
// des statuts, les définitions de partie et les sacs préfaits. Échouer au chargement,
// jamais en pleine partie : les règles (marbles/core/rules.js) valident leurs tables à
// la composition, main.js et l'audit du contenu le contenu du jeu au démarrage.
// Ce qu'elle lit vient du catalogue (marbles/core/content.js : valeurs de partie,
// champs d'effet, moments En poche), qui valide lui-même, à son chargement, les
// déclarations dont il est fait (déclencheurs, phases, En poche). Pur.

import { BAG_BUILD_RULES, MARBLE_PHASES, MARBLE_POCKET, MARBLE_TRIGGERS } from "../config/values.js";
import { rejectUnknownFields } from "../../lib/validate.js";
import { clauseBranches, isMarbleFamily, isMarbleRarity, isMarbleSize, referencedMarbles, validateEffect, validateFilters } from "./effects.js";
import { EFFECT_FIELDS, FIXED_MOMENTS, LISTENABLE_KEYS, REACTION_KEYS, REACTIVE_MOMENT, TALLY_COUNTERS, TALLY_IDS, pocketClauses, reactionClauses } from "./content.js";
import { CHARACTERISTICS, LOCKS, MODIFIER_OPERATIONS, MODIFIER_POINTS, NO_STATUSES, STATUS_BEHAVIORS, STATUS_DURATIONS, STATUS_STACKINGS } from "./statuses.js";
import { BAG_SOURCES, GOALS, START_KEYS } from "./definitions.js";
import { NO_BAGS, validateBuildRules, validatePresetBags } from "./bags.js";

// La catégorie de chaque valeur de partie (marbles/core/counters.js), que lit le
// garde-fou des boucles directes.
// L'action de chaque compteur d'action (ses déclenchements comme sa quantité réelle).
const COUNTER_ACTIONS = Object.fromEntries(TALLY_COUNTERS.filter((counter) => counter.category === "action").map((counter) => [counter.id, counter.action]));

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
    rejectUnknownFields(type, [...EFFECT_FIELDS, "baseVariant", MARBLE_POCKET.field, "maxWear", "size", "families", "rarity", "beacon"], `bille "${id}"`, fail);
    // Le calibre, obligatoire : lu par les conditions de calibre et par le son.
    if (!isMarbleSize(type.size)) fail(`bille "${id}" : calibre (size) absent ou inconnu "${type.size}".`);
    // Ses familles, obligatoires : une liste d'au moins une famille connue, chacune
    // une fois. Sa rareté, obligatoire : exactement une, connue.
    if (!Array.isArray(type.families) || type.families.length === 0) fail(`bille "${id}" : families doit être une liste d'au moins une famille.`);
    for (const family of type.families) {
      if (!isMarbleFamily(family)) fail(`bille "${id}" : famille inconnue "${family}".`);
    }
    if (new Set(type.families).size !== type.families.length) fail(`bille "${id}" : une famille en double.`);
    if (!isMarbleRarity(type.rarity)) fail(`bille "${id}" : rareté (rarity) absente ou inconnue "${type.rarity}".`);
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
    // Sa balise propre (facultative) : une clé du manifeste audio, que la simulation
    // ne lit jamais ; son existence se vérifie à l'audit du contenu.
    if (type.beacon !== undefined && (typeof type.beacon !== "string" || type.beacon === "")) fail(`bille "${id}" : beacon doit être une clé de son non vide.`);
  }
  // Les billes CITÉES (une condition sur une bille précise, un filtre « bille ») par
  // les billes et par les statuts : la table doit les contenir. Les statuts se valident
  // avant la table (validateMarbleStatuses) : leur citation se vérifie ici, où les deux
  // sont connues.
  const cited = [
    ...Object.entries(types).map(([id, type]) => [`bille "${id}"`, type]),
    ...Object.entries(statuses).map(([id, definition]) => [`statut "${id}"`, definition.behaviors]),
  ];
  for (const [where, data] of cited) {
    for (const marble of referencedMarbles(data)) {
      if (!Object.hasOwn(types, marble)) fail(`${where} : cite la bille inconnue "${marble}".`);
    }
  }
}

// La boucle directe : réagir au déclenchement d'une action qu'on produit soi-même
// (« à chaque polissage : Polissage 1 ») se relancerait sans fin. Une bille du pot
// comme un statut.
function rejectDirectLoop(effect, key, describe, fail) {
  if (Object.hasOwn(COUNTER_ACTIONS, key) && effect.flatMap(clauseBranches).some((clause) => clause.action === COUNTER_ACTIONS[key])) {
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
    rejectUnknownFields(behavior, ["type", "point", "operation", "value", "filters"], where, fail);
    if (!Object.hasOwn(MODIFIER_POINTS, behavior.point)) fail(`${where} : point d'interception inconnu "${behavior.point}" (${Object.keys(MODIFIER_POINTS).join(", ")}).`);
    if (!Object.hasOwn(MODIFIER_OPERATIONS, behavior.operation)) fail(`${where} : opération inconnue "${behavior.operation}" (${Object.keys(MODIFIER_OPERATIONS).join(", ")}).`);
    // Une addition entière ; une multiplication par un nombre positif (×0,5 permis :
    // la valeur s'arrondit vers zéro), jamais négatif (le signe ne s'inverse jamais).
    if (behavior.operation === "add" && (!Number.isInteger(behavior.value) || behavior.value === 0)) fail(`${where} : une addition est un entier non nul.`);
    if (behavior.operation === "multiply" && (typeof behavior.value !== "number" || !Number.isFinite(behavior.value) || behavior.value < 0 || behavior.value === 1)) {
      fail(`${where} : un multiplicateur est un nombre >= 0, autre que 1 (le signe ne s'inverse jamais).`);
    }
    // Un filtre sur la source : seulement là où une valeur a une bille source.
    if (behavior.filters !== undefined) {
      if (!MODIFIER_POINTS[behavior.point].sourced) fail(`${where} : « ${behavior.point} » n'a jamais de bille source, un filtre n'y correspondrait à rien.`);
      validateFilters(behavior.filters, `${where}, filtres de source`, fail);
    }
  } else if (behavior.type === "lock") {
    if (!Object.hasOwn(LOCKS, behavior.lock)) fail(`${where} : verrou inconnu "${behavior.lock}" (${Object.keys(LOCKS).join(", ")}).`);
    rejectUnknownFields(behavior, LOCKS[behavior.lock].fields, `${where} ${behavior.lock}`, fail);
    if (behavior.lock === "trigger" && !MARBLE_TRIGGERS.some((trigger) => trigger.id === behavior.trigger)) {
      fail(`${where} : déclencheur inconnu "${behavior.trigger}" (${MARBLE_TRIGGERS.map((trigger) => trigger.id).join(", ")}).`);
    }
  } else {
    rejectUnknownFields(behavior, ["type", "on", "effect"], where, fail);
    if (!LISTENABLE_KEYS.includes(behavior.on)) fail(`${where} : « ${behavior.on} » n'est pas une valeur de partie écoutable.`);
    validateEffect(behavior.effect, `${where} ${behavior.on}`, fail, { moment: "anytime", marble: "status", tallies: TALLY_IDS, statuses });
    rejectDirectLoop(behavior.effect, behavior.on, `${where} ${behavior.on}`, fail);
  }
}

// --- Définitions de partie ---

// Échoue sur une définition de partie mal formée (format : en-tête de
// marbles/core/definitions.js), du registre ou lue d'un fichier : une valeur fausse
// échouerait sinon en pleine partie. Aucun minimum lié au triangle : le joueur est seul
// responsable de ses poses, et la résolution se lance quel que soit l'état du
// triangle. `bags` : le registre des sacs préfaits, que cite un sac imposé (aucun par
// défaut : un sac cité est alors inconnu).
export function validateGameDefinition(definition, types, statuses = NO_STATUSES, bags = NO_BAGS) {
  const fail = (message) => {
    throw new Error(`marbles, définition "${definition?.id}" : ${message}`);
  };
  if (definition === null || typeof definition !== "object" || Array.isArray(definition)) fail("une définition est un objet.");
  rejectUnknownFields(definition, ["id", "start", "bag", "turns", "goal", "rules"], "définition", fail);
  if (typeof definition.id !== "string" || definition.id === "") fail("id doit être un texte non vide.");
  validateStart(definition.start, fail);
  validateBagSource(definition.bag, types, bags, fail);
  const { goal } = definition;
  if (goal === null || typeof goal !== "object" || !Object.hasOwn(GOALS, goal.kind)) fail(`objectif (goal) inconnu "${goal?.kind}" (${Object.keys(GOALS).join(", ")}).`);
  rejectUnknownFields(goal, GOALS[goal.kind].fields, `objectif ${goal.kind}`, fail);
  GOALS[goal.kind].validate(goal, (message) => fail(`objectif ${goal.kind} : ${message}`));
  // Le nombre de tours : un entier, ou null pour un objectif qui le permet (sans
  // limite) ; une partie sans limite finit alors par son objectif ou faute de billes.
  const unlimited = definition.turns === null && GOALS[goal.kind].turns === "optional";
  if (!unlimited && (!Number.isInteger(definition.turns) || definition.turns < 1)) {
    fail(GOALS[goal.kind].turns === "optional" ? "turns doit être un entier >= 1, ou null (sans limite)." : "turns doit être un entier >= 1.");
  }
  validateRules(definition.rules, statuses, fail);
}

// Les RÈGLES d'une définition : des statuts de la table, chacun une fois, de durée
// « toute la partie » (une règle vaut pour toute la partie : des tours ou des charges
// n'y auraient pas de sens, et elle ne s'use jamais).
function validateRules(rules, statuses, fail) {
  if (!Array.isArray(rules)) fail("rules doit être une liste d'ids de statuts.");
  const seen = new Set();
  for (const id of rules) {
    if (!Object.hasOwn(statuses, id)) fail(`règle : statut inconnu "${id}".`);
    if (seen.has(id)) fail(`règle "${id}" en double.`);
    seen.add(id);
    if (statuses[id].duration.kind !== "game") fail(`règle "${id}" : un statut de durée « toute la partie » (game), pas "${statuses[id].duration.kind}".`);
  }
}

// Les valeurs de départ : toutes entières ; les pioches, la main et les lancers d'au
// moins 1, un pot de capacité 0 se conçoit (toute bille empochée y serait perdue) ;
// une main qui tient la première pioche.
function validateStart(start, fail) {
  if (start === null || typeof start !== "object") fail("start doit être un objet de valeurs de départ.");
  rejectUnknownFields(start, START_KEYS, "start", fail);
  for (const key of START_KEYS) {
    const min = key === "potCapacity" ? 0 : 1;
    if (!Number.isInteger(start[key]) || start[key] < min) fail(`start.${key} doit être un entier >= ${min}.`);
  }
  if (start.handSize < start.firstTurnDraw) fail("start.handSize doit valoir au moins start.firstTurnDraw.");
}

// La source du sac (BAG_SOURCES) : des règles de construction bien formées ; un sac
// préfait connu ; un tirage possible.
function validateBagSource(bag, types, bags, fail) {
  if (bag === null || typeof bag !== "object" || !Object.hasOwn(BAG_SOURCES, bag.kind)) fail(`source de sac (bag) inconnue "${bag?.kind}" (${Object.keys(BAG_SOURCES).join(", ")}).`);
  rejectUnknownFields(bag, BAG_SOURCES[bag.kind].fields, `sac ${bag.kind}`, fail);
  if (bag.kind === "player") {
    if (bag.buildRules !== undefined) validateBuildRules(bag.buildRules, (message) => fail(`buildRules : ${message}`), { allowNull: true });
    return;
  }
  if (bag.kind === "preset") {
    if (!Object.hasOwn(bags, bag.bag)) fail(`sac préfait inconnu "${bag.bag}" (${Object.keys(bags).join(", ") || "aucun"}).`);
    return;
  }
  if (!Number.isInteger(bag.size) || bag.size < 1) fail("bag.size doit être un entier >= 1.");
  if (bag.maxCopies !== null && (!Number.isInteger(bag.maxCopies) || bag.maxCopies < 1)) fail("bag.maxCopies doit être un entier >= 1, ou null.");
  const count = Object.keys(types).length;
  if (bag.maxCopies !== null && bag.size > bag.maxCopies * count) fail(`${bag.size} billes impossibles avec ${bag.maxCopies} exemplaire(s) au plus de ${count} billes.`);
}

// Le registre des définitions : un objet { id: définition }, chaque définition
// nommée par sa clé.
export function validateGameDefinitions(definitions, types, statuses = NO_STATUSES, bags = NO_BAGS) {
  if (definitions === null || typeof definitions !== "object" || Array.isArray(definitions)) throw new Error("marbles : le registre des définitions est un objet { id: définition }.");
  for (const [id, definition] of Object.entries(definitions)) {
    if (definition?.id !== id) throw new Error(`marbles : la définition "${id}" doit porter son id ("${definition?.id}").`);
    validateGameDefinition(definition, types, statuses, bags);
  }
}

// Les règles de construction par défaut (marbles/config/values.js/BAG_BUILD_RULES) :
// chaque sorte connue, bien formée.
function validateDefaultBuildRules(rules = BAG_BUILD_RULES) {
  validateBuildRules(rules, (message) => {
    throw new Error(`marbles, règles de construction par défaut : ${message}`);
  });
}

// Le contenu du jeu des billes, au démarrage (main.js, l'audit du contenu) : la
// table des statuts, celle des billes, les règles de construction par défaut, les sacs
// préfaits (valides selon ces règles) et les définitions de partie, qui ne citent que
// des billes, des statuts et des sacs connus. Une erreur ici échouerait sinon en
// pleine partie.
export function validateMarblesContent(types, statuses, definitions, bags = NO_BAGS) {
  validateMarbleStatuses(statuses);
  validateMarbleTypes(types, statuses);
  validateDefaultBuildRules();
  validatePresetBags(bags, types, BAG_BUILD_RULES);
  validateGameDefinitions(definitions, types, statuses, bags);
}
