// Parsing d'une ENTITÉ de scène (voir doc/scene-format.md/"Entité",
// doc/entity-model.md) : chaque champ validé, puis résolu en cascade instance
// -> archétype (registre de types INJECTÉ, jamais importé par le core). Sert
// aux entités déclarées dans une scène ET à celles que le moteur de collecte
// pose en jeu (parseSpawnedEntity). Pur.

import { parseVariables } from "./variables.js";
import { ITEM_REGISTRY, itemSounds } from "./items.js";
import { validateDistribution } from "./distribution.js";
import { validateCatalog } from "./catalog.js";
import { fail, isNonEmptyString, isFiniteNumber, parseBehavior, rejectUnknownFields } from "./parse-common.js";
import { validateCondition, parsePresenceRule, parseSingleAction, parseTrigger } from "./script-parse.js";
import { ACTION_KINDS } from "./action-kinds.js";

// Fusion PROFONDE d'une surcharge sur une base — utilisée par `sounds`
// (voir parseEntity plus bas), SEUL champ cascadé PAR FUSION plutôt que par
// simple remplacement (labelKey, blocksMovement...) ou transport brut
// (tuning). Appliquée récursivement, TROIS cas :
//   - override === undefined (clé absente) -> hérite `base` telle quelle.
//   - override === null -> RETIRE ce palier (résultat undefined ici — le
//     parent, en itérant ses clés, en fait alors l'absence).
//   - override objet ET base objet -> fusionne clé par clé (récursif) ;
//     sinon (override terminal : chaîne, nombre, pool, tableau...) ->
//     REMPLACE base entièrement, jamais fusionné (un path ne "fusionne"
//     pas avec un autre).
function deepMergeOverride(base, override) {
  if (override === null) return undefined;
  if (override === undefined) return base;

  const overrideIsObject = typeof override === "object" && !Array.isArray(override);
  const baseIsObject = typeof base === "object" && base !== null && !Array.isArray(base);
  if (!overrideIsObject || !baseIsObject) return override;

  const merged = { ...base };
  for (const key of Object.keys(override)) {
    const mergedValue = deepMergeOverride(base[key], override[key]);
    if (mergedValue === undefined) {
      delete merged[key];
    } else {
      merged[key] = mergedValue;
    }
  }
  return merged;
}

// Type d'entité générique d'un objet au sol (entities/types/item.js),
// utilisé pour tout objet du sac SANS archétype dédié : il reprend le nom,
// la description et les sons de l'objet qu'il porte (voir
// genericItemDefaults). Exporté pour core/spawn.js, qui pose ces objets.
export const GENERIC_ITEM_TYPE = "item";

// Nom, description et sons repris de l'objet porté par une entité "item"
// (voir parseEntity). Rien pour un autre type, une action qui ne ramasse
// pas d'objet, ou un objet inconnu (validé ailleurs) : `{}`.
function genericItemDefaults(type, action) {
  if (type !== GENERIC_ITEM_TYPE || !action || Array.isArray(action)) return {};
  if (action.kind !== "pickup" || typeof action.item !== "string") return {};
  const props = ITEM_REGISTRY[action.item];
  if (!props) return {};
  return { nameKey: props.label, descriptionKey: props.descriptionKey, sounds: itemSounds(action.item) };
}

// --- Champs d'une entité, un validateur par champ ou groupe de champs. ---
// `at` : préfixe des messages d'erreur, `entities[<index>] ("<id>")`.
// Cascade instance -> archétype partout : une valeur d'instance remplace
// celle de l'archétype, sauf `sounds` (fusion profonde, voir
// deepMergeOverride).

// Identité : id non vide et unique dans la face, type connu du registre, x
// dans les bornes de la scène.
function validateIdentity({ id, type, x }, index, registry, length, seenIds) {
  if (!isNonEmptyString(id)) {
    fail(`entities[${index}].id manquant ou invalide.`);
  }
  if (seenIds.has(id)) {
    fail(`entities[${index}].id "${id}" est dupliqué.`);
  }
  seenIds.add(id);

  if (!isNonEmptyString(type) || !registry[type]) {
    fail(`entities[${index}] ("${id}") : type "${type}" absent du registre.`);
  }

  if (!isFiniteNumber(x) || x < 0 || x > length) {
    fail(`entities[${index}] ("${id}") : x (${x}) hors des bornes [0, ${length}].`);
  }
}

// Une capacité booléenne (blocksMovement, observable, interactable,
// isFlying) : défaut false. Bakée ici : le core ne lit jamais le registre
// lui-même, seulement ce que parseScene en extrait.
function parseBooleanCapability(name, value, archetypeValue, at) {
  if (value !== undefined && typeof value !== "boolean") {
    fail(`${at} : ${name} doit être un booléen si présent.`);
  }
  return value !== undefined ? value : Boolean(archetypeValue);
}

// Vitesse : facteur de MOVE_STEP lu par la physique (core/physics/
// collision.js), jamais par un comportement. Défaut 1, jamais 0 (une vitesse
// nulle ne se distinguerait pas d'une entité sans comportement).
function parseSpeed(speed, archetypeSpeed, at) {
  if (speed !== undefined && (!isFiniteNumber(speed) || speed <= 0)) {
    fail(`${at} : speed doit être un nombre > 0 si présent.`);
  }
  return speed !== undefined ? speed : archetypeSpeed !== undefined ? archetypeSpeed : 1;
}

// Action : un objet unique, ou un TABLEAU de candidates (la vue choisit à
// l'activation celle dont la condition est vraie, voir doc/scripting.md/
// "Actions multiples filtrées par condition"). Chaque candidate est validée
// (forme commune, kind connu et ses champs, voir parseSingleAction et
// core/action-kinds.js) ; son EXÉCUTION reste à la vue. `kindContext` :
// { registry, length }.
function parseEntityAction(resolvedAction, at, entityVariables, sceneVariables, kindContext) {
  if (Array.isArray(resolvedAction)) {
    if (resolvedAction.length === 0) {
      fail(`${at} : action ne peut pas être un tableau vide.`);
    }
    return resolvedAction.map((candidate, i) =>
      parseSingleAction(candidate, `${at} : action[${i}]`, entityVariables, sceneVariables, kindContext)
    );
  }
  return parseSingleAction(resolvedAction, `${at} : action`, entityVariables, sceneVariables, kindContext);
}

// Un kind qui agit sur un champ de l'entité (ex. "search" sur `container`)
// exige ce champ, après la cascade instance -> archétype (voir
// core/action-kinds.js/ACTION_KINDS, `requires`).
function checkActionRequirements(entity, at) {
  const candidates = Array.isArray(entity.action) ? entity.action : [entity.action];
  for (const action of candidates) {
    const required = ACTION_KINDS[action.kind].requires;
    if (required && entity[required] === undefined) {
      fail(`${at} : action "${action.kind}" sans ${required} sur l'entité.`);
    }
  }
}

// Condition du beacon (voir doc/entity-model.md/"Beacon conditionnel") :
// celle de l'instance REMPLACE celle de l'archétype (une condition est un
// tout, jamais fusionnée clé par clé comme le reste de `sounds`), puis elle
// est validée comme toute condition. Modifie `resolvedSounds` en place.
function applyBeaconCondition(resolvedSounds, instanceSounds, at, entityVariables, sceneVariables) {
  const instanceBeaconCondition = instanceSounds && instanceSounds.beacon ? instanceSounds.beacon.condition : undefined;
  if (resolvedSounds.beacon && instanceBeaconCondition) {
    resolvedSounds.beacon = { ...resolvedSounds.beacon, condition: instanceBeaconCondition };
  }
  if (resolvedSounds.beacon && resolvedSounds.beacon.condition !== undefined) {
    validateCondition(resolvedSounds.beacon.condition, `${at} : sounds.beacon.condition`, entityVariables, sceneVariables);
  }
}

// Conteneur de collecte (voir doc/entity-model.md/"Collecte") :
// { distribution, count?, regenerates? }. Seule la FORME est validée ; le
// garnissage (stock, stockCycle) reste au moteur (core/spawn.js).
// `regenerates` n'est stocké que s'il vaut false.
function parseContainer(container, at) {
  if (typeof container !== "object" || container === null || Array.isArray(container)) {
    fail(`${at} : container doit être un objet si présent.`);
  }
  validateDistribution(container.distribution, `${at} : container.distribution`, fail);
  if (container.count !== undefined && (!Number.isInteger(container.count) || container.count < 1)) {
    fail(`${at} : container.count doit être un entier >= 1 si présent.`);
  }
  if (container.regenerates !== undefined && typeof container.regenerates !== "boolean") {
    fail(`${at} : container.regenerates doit être un booléen si présent.`);
  }
  rejectUnknownFields(container, ["distribution", "count", "regenerates"], `${at} : container`);
  const parsed = { distribution: container.distribution };
  if (container.count !== undefined) parsed.count = container.count;
  if (container.regenerates === false) parsed.regenerates = false;
  return parsed;
}

// Point de vente (voir doc/entity-model.md/"Vente et achat") : { catalog }.
// Le stock courant (shopStock, shopCycle) reste au moteur.
function parseShop(shop, at) {
  if (typeof shop !== "object" || shop === null || Array.isArray(shop)) {
    fail(`${at} : shop doit être un objet si présent.`);
  }
  rejectUnknownFields(shop, ["catalog"], `${at} : shop`);
  validateCatalog(shop.catalog, `${at} : shop.catalog`, fail);
  return { catalog: shop.catalog };
}

// Champs qu'une INSTANCE d'entité peut déclarer (voir doc/scene-format.md/
// "Entité") ; tout autre champ est rejeté (voir rejectUnknownFields). Les
// champs RUNTIME (stock, shopStock, ephemeral, spawned...) n'en font pas
// partie : ils ne s'écrivent jamais dans une scène.
const ENTITY_FIELDS = [
  "id",
  "type",
  "x",
  "nameKey",
  "descriptionKey",
  "consumedDescriptionKey",
  "behavior",
  "blocksMovement",
  "observable",
  "interactable",
  "isFlying",
  "speed",
  "action",
  "tuning",
  "presence",
  "variables",
  "sounds",
  "container",
  "shop",
  "triggers",
];

// Parse UNE entité d'une face. `seenIds` : ids déjà vus dans la face
// (unicité) ; `sceneVariables` : le sac de variables de la scène, qu'une
// condition ou un effet peut référencer. Une clé n'est ajoutée à l'entité
// que si elle est résolue (jamais un `undefined` explicite) : l'état reste de
// la donnée pure, inchangée par un aller-retour JSON.
export function parseEntity(rawEntity, index, registry, length, seenIds, sceneVariables) {
  if (typeof rawEntity !== "object" || rawEntity === null) {
    fail(`entities[${index}] n'est pas un objet.`);
  }

  const {
    id,
    type,
    x,
    nameKey,
    descriptionKey,
    consumedDescriptionKey,
    behavior,
    blocksMovement,
    observable,
    interactable,
    isFlying,
    speed,
    action,
    tuning,
    presence,
    variables,
    sounds,
    container,
    shop,
    triggers,
  } = rawEntity;

  validateIdentity(rawEntity, index, registry, length, seenIds);
  const at = `entities[${index}] ("${id}")`;
  rejectUnknownFields(rawEntity, ENTITY_FIELDS, at);
  const archetype = registry[type];

  // sounds : FUSION PROFONDE instance -> archétype (voir deepMergeOverride,
  // doc/entity-model.md/"Cascade de sounds") — une instance ne déclare que ce
  // qu'elle change ; `null` retire un palier (ex. beacon: null). Toujours un
  // objet en sortie : la vue lit `entity.sounds` comme présent.
  if (sounds !== undefined && sounds !== null && (typeof sounds !== "object" || Array.isArray(sounds))) {
    fail(`${at} : sounds doit être un objet (ou null) si présent.`);
  }
  // Objet au sol générique (type "item") : il reprend le nom, la description
  // et les sons de l'objet qu'il porte, comme un palier entre l'archétype et
  // l'instance. Placer un objet se réduit à { type: "item", x, action:
  // { kind: "pickup", item } }.
  const carried = genericItemDefaults(type, action !== undefined ? action : archetype.action);
  const resolvedSounds = deepMergeOverride(deepMergeOverride(archetype.sounds, carried.sounds), sounds) ?? {};

  // Textes : clés i18n, cascade instance -> objet porté -> archétype. La
  // description "consumed" (voir doc/entity-model.md/"Collectible
  // persistant") est simplement transportée : la vue choisit laquelle dire.
  const labelKey = isNonEmptyString(nameKey) ? nameKey : carried.nameKey ?? archetype.nameKey;
  const resolvedDescriptionKey = isNonEmptyString(descriptionKey) ? descriptionKey : carried.descriptionKey ?? archetype.descriptionKey;
  const resolvedConsumedDescriptionKey = isNonEmptyString(consumedDescriptionKey)
    ? consumedDescriptionKey
    : archetype.consumedDescriptionKey;

  // Capacités : deux verbes d'interaction indépendants (observable ->
  // Espace, interactable -> Entrée), le blocage, et isFlying — un simple
  // marqueur lu par la vue pour SUGGÉRER la hauteur, jamais un axe Y.
  const entity = {
    id,
    type,
    x,
    labelKey,
    sounds: resolvedSounds,
    blocksMovement: parseBooleanCapability("blocksMovement", blocksMovement, archetype.blocksMovement, at),
    observable: parseBooleanCapability("observable", observable, archetype.observable, at),
    interactable: parseBooleanCapability("interactable", interactable, archetype.interactable, at),
    isFlying: parseBooleanCapability("isFlying", isFlying, archetype.isFlying, at),
    speed: parseSpeed(speed, archetype.speed, at),
  };
  if (resolvedDescriptionKey !== undefined) {
    entity.descriptionKey = resolvedDescriptionKey;
  }
  if (resolvedConsumedDescriptionKey !== undefined) {
    entity.consumedDescriptionKey = resolvedConsumedDescriptionKey;
  }

  // Variables PROPRES à cette instance (jamais héritées de l'archétype : un
  // compteur ou un drapeau d'UNE entité précise). Résolues AVANT l'action,
  // les conditions et les triggers, qui peuvent les référencer.
  if (variables !== undefined) {
    entity.variables = parseVariables(variables, `${at} : variables`, fail);
  }

  // Comportement de mouvement au tick (voir core/reduce.js). Sans lui,
  // l'entité est immobile.
  if (behavior !== undefined) {
    entity.behavior = parseBehavior(behavior, index, id);
  }

  const resolvedAction = action !== undefined ? action : archetype.action;
  if (resolvedAction !== undefined) {
    entity.action = parseEntityAction(resolvedAction, at, entity.variables, sceneVariables, { registry, length });
  }

  applyBeaconCondition(resolvedSounds, sounds, at, entity.variables, sceneVariables);

  // Réglages d'INSTANCE pour la cascade (config/tuning.js) : transportés tels
  // quels, jamais interprétés — tout nouveau réglage devient surchargeable
  // ici sans rouvrir ce fichier.
  if (tuning !== undefined) {
    if (typeof tuning !== "object" || tuning === null || Array.isArray(tuning)) {
      fail(`${at} : tuning doit être un objet si présent.`);
    }
    entity.tuning = tuning;
  }

  const resolvedContainer = container !== undefined ? container : archetype.container;
  if (resolvedContainer !== undefined) {
    entity.container = parseContainer(resolvedContainer, at);
  }

  const resolvedShop = shop !== undefined ? shop : archetype.shop;
  if (resolvedShop !== undefined) {
    entity.shop = parseShop(resolvedShop, at);
  }

  if (entity.action !== undefined) checkActionRequirements(entity, at);

  // Triggers horaires (voir core/triggers.js, doc/scripting.md/"Triggers").
  const resolvedTriggers = triggers !== undefined ? triggers : archetype.triggers;
  if (resolvedTriggers !== undefined) {
    if (!Array.isArray(resolvedTriggers) || resolvedTriggers.length === 0) {
      fail(`${at} : triggers doit être un tableau non vide si présent.`);
    }
    entity.triggers = resolvedTriggers.map((trigger, i) =>
      parseTrigger(trigger, `${at} : triggers[${i}]`, entity.variables, sceneVariables)
    );
  }

  // Présence conditionnelle (voir core/presence.js) : sans règle, l'entité
  // est toujours présente.
  const resolvedPresence = presence !== undefined ? presence : archetype.presence;
  if (resolvedPresence !== undefined) {
    if (!Array.isArray(resolvedPresence)) {
      fail(`${at} : presence doit être un tableau si présent.`);
    }
    entity.presence = resolvedPresence.map((rule, i) => parsePresenceRule(rule, i, index, id, entity.variables, sceneVariables));
  }

  return entity;
}

// Entité créée EN JEU par le moteur de collecte (core/spawn.js) : MÊME
// parseur qu'une instance de scène (cascade sounds/capacités/action de
// l'archétype, validation complète), sans contexte de liste — `raw` porte
// déjà un id unique (dérivé du cycle, voir core/spawn.js), aucune
// déduplication à faire ici.
export function parseSpawnedEntity(raw, registry, length, sceneVariables) {
  return parseEntity(raw, 0, registry, length, new Set(), sceneVariables);
}
