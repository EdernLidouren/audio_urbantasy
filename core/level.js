// Parsing et validation d'un niveau. Fonction pure : aucun accès réseau ou
// DOM, aucune chaîne affichable produite (labelKey reste une clé i18n).
// Testable en Node/console sans navigateur : voir le bas du fichier pour un
// exemple d'invocation manuelle.
//
// AMBIENCE_CHANNEL_LIMIT vient d'une donnée neutre (zéro import), jamais de
// lib/audio.js : le core ne doit jamais importer la couche Web Audio/vue.
//
// RECTO/VERSO (modèle B, voir CLAUDE.md, core/state.js) : une scène est
// SIMPLE (comme avant ce modèle) ou À DEUX FACES (recto + verso, jamais un
// seul) — voir parseFace/parseLevel plus bas. Une face porte exactement ce
// qu'une scène simple portait déjà (entités + habillage sonore/surface),
// jamais dupliqué entre les deux cas.

import { AMBIENCE_CHANNEL_LIMIT } from "../config/audio-channels.js";
import { BODY_RADIUS } from "./state.js";
import BEHAVIORS from "./behaviors/index.js";
import { SURFACE_REGISTRY, DEFAULT_SURFACE } from "./surfaces.js";
import { CONDITION_TYPES } from "./presence.js";
import { TAG_REGISTRY } from "./tags.js";
import { IMPROVEMENT_REGISTRY } from "./improvements.js";
import { WEATHER_STATES } from "../config/weather-values.js";
import { parseVariables, VARIABLE_SCOPES, isValidValueForType } from "./variables.js";
import { ACTION_EFFECT_TYPES } from "./effects.js";
import { validateDistribution } from "./distribution.js";
import { validateCatalog } from "./catalog.js";

function fail(message) {
  throw new Error(`parseLevel: ${message}`);
}

// Parsing TOTAL (voir header) : l'ABSENCE d'un champ de scène retombe
// toujours sur un défaut sensé, jamais une erreur — seule sa PRÉSENCE
// malformée échoue. Ces trois défauts couvrent les champs qui n'avaient
// jusqu'ici AUCUN filet (id/titleKey/length étaient requis) ; les autres
// champs de scène (entities, defaultSurface, segments, indoor,
// playerStart) ont déjà le leur plus bas. `{}` doit rester un niveau
// valide et jouable : id/titre génériques, longueur minimale mais non
// nulle (traversable).
const DEFAULT_LEVEL_ID = "level";
const DEFAULT_LEVEL_TITLE_KEY = "level.default.title";
const DEFAULT_LEVEL_LENGTH = 10;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

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

// Un effet porté par une règle de presence[] : { type: "presence", present:
// boolean } ou { type: "behavior", behavior: <objet behavior, même forme
// que entities[].behavior — voir parseBehavior plus bas, réutilisé TEL
// QUEL, aucune duplication>. Aiguillage EXPLICITE par type, PAS un registre
// comme CONDITION_TYPES (voir core/presence.js, header) : un effet a une
// validation propre à son type — une simple chaîne booléenne pour
// "presence", une sous-validation complète de comportement pour
// "behavior" — qu'un registre de noms ne suffirait pas à couvrir. `describe`
// : préfixe du message d'erreur fourni par l'appelant (même patron que
// validateCondition plus bas) — ce SEUL aiguillage sert `presence[].effects`
// (voir parsePresenceRule) ; les effets d'ÉCRITURE de variable
// (setVariable/toggleVariable/addVariable, déclenchés à l'ACTIVATION d'une
// action, jamais au TICK) vivent dans un aiguillage VOISIN mais DISTINCT,
// voir parseActionEffect plus bas — deux natures d'effet différentes,
// jamais mélangées dans le même registre.
function parseEffect(rawEffect, describe, index, id) {
  if (typeof rawEffect !== "object" || rawEffect === null) {
    fail(`${describe} n'est pas un objet.`);
  }
  const { type } = rawEffect;
  if (type === "presence") {
    if (typeof rawEffect.present !== "boolean") {
      fail(`${describe}.present doit être un booléen.`);
    }
    return { type: "presence", present: rawEffect.present };
  }
  if (type === "behavior") {
    // behavior: null -> RETRAIT explicite du comportement actif (voir
    // core/scripting.md, "Effets"/"behavior") : l'entité redevient immobile,
    // comme si elle n'en avait jamais eu — SEULE valeur acceptée en dehors
    // d'un objet behavior valide (jamais `undefined`, qui signifierait
    // "aucun effet à ce champ", pas "retire-le" ; core/presence.js/
    // resolveEntityRules distingue les deux). Nécessaire pour qu'un cycle de
    // routine "goto" reste réenclenchable : sans repasser par un `kind`
    // différent de "goto" (ou par ce retrait), `entity.gotoArrived` — jamais
    // remis à faux ailleurs — laisserait la condition "arrived" bloquée à
    // vrai pour toujours après la première arrivée.
    if (rawEffect.behavior === null) {
      return { type: "behavior", behavior: null };
    }
    return { type: "behavior", behavior: parseBehavior(rawEffect.behavior, index, id) };
  }
  fail(`${describe}.type "${type}" inconnu (attendu : "presence" | "behavior").`);
}

// Le TYPE connu d'une variable référencée par sa portée + son nom — undefined
// si non vérifiable ICI (portée "party", voir validateVariableReference) ou
// si le nom n'existe pas dans le sac déjà résolu de sa portée.
function resolveKnownVariableType(scope, name, entityVariables, sceneVariables) {
  if (scope === "entity") return entityVariables?.[name]?.type;
  if (scope === "scene") return sceneVariables?.[name]?.type;
  return undefined;
}

// Valide qu'une référence de variable (condition "variable", effets
// setVariable/toggleVariable/addVariable — voir core/variables.js) porte
// une PORTÉE connue, un NOM non vide, et — SEULEMENT quand c'est vérifiable
// au chargement — une EXISTENCE réelle sur le sac déjà résolu de sa portée :
//   - "entity" : contre `entityVariables`, LE SAC DE CETTE ENTITÉ (parseEntity
//     résout `entity.variables` AVANT tout ce qui peut le référencer — voir
//     son ordre de parsing) — une référence à une variable jamais déclarée
//     sur CETTE entité échoue clairement, exactement comme un tag inconnu
//     (voir hasEquipmentTag ci-dessus).
//   - "scene" : contre `sceneVariables`, LE SAC DE LA SCÈNE (racine du
//     niveau, résolu par parseLevel AVANT tout parseFace/parseEntity — voir
//     son ordre d'appel) — même exigence.
//   - "party" : AUCUNE vérification d'existence possible ICI — les
//     déclarations de partie n'existent qu'à createInitialState
//     (core/state.js), hors de portée d'un parseLevel qui ne connaît qu'UN
//     niveau à la fois. LIMITE CONNUE, documentée (voir
//     core/scripting.md/"Variables") plutôt que silencieusement ignorée :
//     une variable de partie mal orthographiée dans une condition/un effet
//     ne sera détectée qu'à l'ÉVALUATION (repli sur false/no-op, voir
//     core/presence.js/core/variables.js), jamais au chargement du niveau.
function validateVariableReference(scope, name, entityVariables, sceneVariables, describe) {
  if (!VARIABLE_SCOPES.includes(scope)) {
    fail(`${describe}.scope "${scope}" inconnu (attendu : ${VARIABLE_SCOPES.join(" | ")}).`);
  }
  if (!isNonEmptyString(name)) {
    fail(`${describe}.name manquant ou invalide.`);
  }
  if (scope === "entity" && (!entityVariables || entityVariables[name] === undefined)) {
    fail(`${describe} référence la variable "${name}" (portée "entity"), jamais déclarée sur cette entité.`);
  }
  if (scope === "scene" && (!sceneVariables || sceneVariables[name] === undefined)) {
    fail(`${describe} référence la variable "${name}" (portée "scene"), jamais déclarée sur cette scène.`);
  }
}

// Natures reconnues pour l'effet "playSound" (voir plus bas) — DIÉGÉTIQUE
// (positionné, filtré comme un beacon/vocal) ou MÉTA (centré joueur, sans
// filtre) ; défaut dérivé de la PROVENANCE côté vue quand absente, jamais
// codé ici (voir view/interaction.js/resolvePlaySoundNature).
const PLAY_SOUND_NATURES = ["diegetic", "meta"];

// Faces et modes de transition reconnus pour l'effet "teleport" (voir plus
// bas) — "side" : face d'arrivée si la cible est une scène à deux faces
// (ignorée sinon, comme partout ailleurs) ; "transition" : "fade" (sas +
// fondu, comportement historique d'une porte) ou "instant" (aucun sas,
// déplacement immédiat).
const TELEPORT_SIDES = ["recto", "verso"];
const TELEPORT_TRANSITIONS = ["fade", "instant"];

// Un effet déclenché à l'ACTIVATION d'une action (voir core/effects.js pour
// la partition CORE/VUE, core/variables.js/applyActionEffects,
// view/interaction.js, core/scripting.md/"Effets d'action") — AIGUILLAGE
// DISTINCT de parseEffect ci-dessus (presence/behavior, appliqués au TICK) :
// ces effets n'ont de sens qu'au moment d'une interaction ponctuelle, jamais
// réévalués en continu, jamais mélangés dans le même registre. RÉUTILISÉ TEL
// QUEL pour `action.effects` (condition RÉUSSIT) ET `action.refusalEffects`
// (condition ÉCHOUE, voir parseSingleAction) — MÊME vocabulaire, MÊME
// validation, un effet ne sait pas duquel des deux il fait partie.
//
// TROIS types d'ÉTAT (setVariable/toggleVariable/addVariable, appliqués par
// le CORE) : même esprit d'extensibilité (un cas de plus par type) et même
// validation de RÉFÉRENCE que la condition "variable" (voir
// validateVariableReference/resolveKnownVariableType) — scope/name
// existants, opération cohérente avec le TYPE réel de la variable quand il
// est connu (toggle sur un "flag", add sur un "int" — jamais l'inverse).
//
// DEUX types de RENDU (playSound/announce, exécutés par la VUE, jamais ici) :
// validés en FORME SEULEMENT, comme `action.sound`/`action.announceKey`
// l'étaient avant l'introduction de ce vocabulaire unifié — le core ignore
// tout du SENS (quel fichier, quelle traduction), il ne fait que garantir
// qu'un contenu malformé échoue au CHARGEMENT plutôt qu'à l'interaction.
//
// UN type MIXTE (`"teleport"`, JOUEUR uniquement — voir "Sources de vérité",
// core/effects.js) : validé en FORME comme les effets de RENDU (le core ne
// l'applique jamais lui-même), mais la VUE délègue son EXÉCUTION à des
// fonctions du core DÉJÀ EXISTANTES (core/state.js/travelToWorld,
// placePlayer) plutôt que de la réinventer. La PORTE n'est plus un cas
// spécial (voir parseEntity, ci-dessous — plus de champ `target` dédié) :
// une porte est une action ORDINAIRE dont `effects` contient un `"teleport"`,
// comme n'importe quel autre contenu.
// `playSound` porte le DESCRIPTEUR DE SON PARTAGÉ (voir lib/audio.js/
// playDescribedOneShot, view/audio/city-scene.js) réduit à ses sous-champs
// COMMUNS : `path` (requis, résolu via resolveAsset côté vue) ;
// `gain`/`pitchVariation`/`reverbSend` (optionnels, nombres finis — mêmes
// noms que les rôles positionnés beacon/vocal, jamais un vocabulaire
// parallèle) ; `at` (optionnel, id d'entité — PROVENANCE, une surcharge
// explicite) et `nature` (optionnel, `"diegetic"`/`"meta"` — une surcharge
// explicite) : le core ne fait que transporter/valider leur FORME, TOUTE
// résolution de DÉFAUT (provenance dérivée de l'entité porteuse de
// l'action, nature dérivée de la provenance) vit côté vue (voir
// view/interaction.js/runPlaySoundEffect) — le core ne connaît même pas
// l'existence de cette cascade.
function parseActionEffect(rawEffect, describe, entityVariables, sceneVariables) {
  if (typeof rawEffect !== "object" || rawEffect === null) {
    fail(`${describe} n'est pas un objet.`);
  }
  const { type, scope, name } = rawEffect;
  if (type === "setVariable") {
    validateVariableReference(scope, name, entityVariables, sceneVariables, describe);
    const knownType = resolveKnownVariableType(scope, name, entityVariables, sceneVariables);
    if (knownType && !isValidValueForType(knownType, rawEffect.value)) {
      fail(`${describe}.value incohérent avec le type "${knownType}" (reçu : ${JSON.stringify(rawEffect.value)}).`);
    }
    return { type: "setVariable", scope, name, value: rawEffect.value };
  }
  if (type === "toggleVariable") {
    validateVariableReference(scope, name, entityVariables, sceneVariables, describe);
    const knownType = resolveKnownVariableType(scope, name, entityVariables, sceneVariables);
    if (knownType && knownType !== "flag") {
      fail(`${describe} : "toggleVariable" ne s'applique qu'à une variable "flag" (portée "${scope}", type réel "${knownType}").`);
    }
    return { type: "toggleVariable", scope, name };
  }
  if (type === "addVariable") {
    validateVariableReference(scope, name, entityVariables, sceneVariables, describe);
    const knownType = resolveKnownVariableType(scope, name, entityVariables, sceneVariables);
    if (knownType && knownType !== "int") {
      fail(`${describe} : "addVariable" ne s'applique qu'à une variable "int" (portée "${scope}", type réel "${knownType}").`);
    }
    if (!Number.isInteger(rawEffect.amount)) {
      fail(`${describe}.amount doit être un entier (reçu : ${JSON.stringify(rawEffect.amount)}).`);
    }
    return { type: "addVariable", scope, name, amount: rawEffect.amount };
  }
  // "giveImprovement"/"removeImprovement" { id } — ÉTAT, comme les trois
  // effets de variable ci-dessus (voir core/improvements.js/
  // giveImprovement/removeImprovement, core/variables.js/
  // applyActionEffects, qui les applique dans le MÊME passage). `id`
  // validé contre IMPROVEMENT_REGISTRY, même sévérité que hasEquipmentTag/
  // hasImprovement (voir validateCondition plus haut) : une faute de frappe
  // échoue au CHARGEMENT plutôt que de ne jamais débloquer silencieusement.
  if (type === "giveImprovement" || type === "removeImprovement") {
    if (!isNonEmptyString(rawEffect.id) || !IMPROVEMENT_REGISTRY[rawEffect.id]) {
      fail(`${describe}.id "${rawEffect.id}" absent du registre d'improvements.`);
    }
    return { type, id: rawEffect.id };
  }
  if (type === "playSound") {
    if (!isNonEmptyString(rawEffect.path)) {
      fail(`${describe}.path doit être une chaîne non vide.`);
    }
    for (const field of ["gain", "pitchVariation", "reverbSend"]) {
      if (rawEffect[field] !== undefined && !isFiniteNumber(rawEffect[field])) {
        fail(`${describe}.${field} doit être un nombre si présent.`);
      }
    }
    // at (id d'entité, PROVENANCE) / nature ("diegetic"|"meta") : TRANSPORT
    // pur comme le reste de cet effet — le core ignore tout du SENS (quelle
    // entité, quel filtrage), seule la vue (view/interaction.js/
    // resolvePlaySoundTarget/resolvePlaySoundNature) résout des DÉFAUTS
    // dérivés du contexte quand l'un ou l'autre est absent. Validés ici pour
    // qu'une déclaration malformée échoue au CHARGEMENT, comme le reste de
    // ce vocabulaire.
    if (rawEffect.at !== undefined && !isNonEmptyString(rawEffect.at)) {
      fail(`${describe}.at doit être une chaîne non vide si présent.`);
    }
    if (rawEffect.nature !== undefined && !PLAY_SOUND_NATURES.includes(rawEffect.nature)) {
      fail(`${describe}.nature "${rawEffect.nature}" inconnue (attendu : ${PLAY_SOUND_NATURES.map((n) => `"${n}"`).join(" | ")}).`);
    }
    const effect = { type: "playSound", path: rawEffect.path };
    if (rawEffect.gain !== undefined) effect.gain = rawEffect.gain;
    if (rawEffect.pitchVariation !== undefined) effect.pitchVariation = rawEffect.pitchVariation;
    if (rawEffect.reverbSend !== undefined) effect.reverbSend = rawEffect.reverbSend;
    if (rawEffect.at !== undefined) effect.at = rawEffect.at;
    if (rawEffect.nature !== undefined) effect.nature = rawEffect.nature;
    return effect;
  }
  if (type === "announce") {
    if (!isNonEmptyString(rawEffect.key)) {
      fail(`${describe}.key doit être une chaîne non vide.`);
    }
    if (rawEffect.assertive !== undefined && typeof rawEffect.assertive !== "boolean") {
      fail(`${describe}.assertive doit être un booléen si présent.`);
    }
    const effect = { type: "announce", key: rawEffect.key };
    if (rawEffect.assertive !== undefined) effect.assertive = rawEffect.assertive;
    return effect;
  }
  if (type === "teleport") {
    if (!isNonEmptyString(rawEffect.target)) {
      fail(`${describe}.target doit être une chaîne non vide.`);
    }
    if (rawEffect.x !== undefined && !isFiniteNumber(rawEffect.x)) {
      fail(`${describe}.x doit être un nombre si présent.`);
    }
    if (rawEffect.side !== undefined && !TELEPORT_SIDES.includes(rawEffect.side)) {
      fail(`${describe}.side "${rawEffect.side}" inconnue (attendu : ${TELEPORT_SIDES.map((s) => `"${s}"`).join(" | ")}).`);
    }
    if (rawEffect.reloadIfSame !== undefined && typeof rawEffect.reloadIfSame !== "boolean") {
      fail(`${describe}.reloadIfSame doit être un booléen si présent.`);
    }
    if (rawEffect.transition !== undefined && !TELEPORT_TRANSITIONS.includes(rawEffect.transition)) {
      fail(`${describe}.transition "${rawEffect.transition}" inconnue (attendu : ${TELEPORT_TRANSITIONS.map((t) => `"${t}"`).join(" | ")}).`);
    }
    const effect = { type: "teleport", target: rawEffect.target };
    if (rawEffect.x !== undefined) effect.x = rawEffect.x;
    if (rawEffect.side !== undefined) effect.side = rawEffect.side;
    if (rawEffect.reloadIfSame !== undefined) effect.reloadIfSame = rawEffect.reloadIfSame;
    if (rawEffect.transition !== undefined) effect.transition = rawEffect.transition;
    return effect;
  }
  fail(`${describe}.type "${type}" inconnu (attendu : ${ACTION_EFFECT_TYPES.map((t) => `"${t}"`).join(" | ")}).`);
}

// Comparateurs reconnus par la condition "variable" (voir plus bas) — un
// SEUL par condition, "equals" valant pour flag ET int, les quatre autres
// réservés aux int (voir la vérification de cohérence plus bas).
const VARIABLE_COMPARATORS = ["equals", "greaterThan", "lessThan", "greaterOrEqual", "lessOrEqual"];

// Valide un objet CONDITION ({ type, ... }) — RÉUTILISÉ par presence[].when
// (voir parsePresenceRule) ET action.condition (voir parseEntity, actions
// CONDITIONNELLES) : MÊME forme déclarative, MÊME registre (CONDITION_TYPES),
// MÊME validation — une condition ne sait pas d'où elle est appelée, jamais
// dupliquée entre les deux. `describe` : préfixe du message d'erreur (ex.
// `presence[0].when` ou `action.condition`), pour situer l'échec sans
// dupliquer cette fonction par appelant. `entityVariables`/`sceneVariables` :
// les sacs déjà résolus des portées "entity"/"scene" du PORTEUR courant
// (voir validateVariableReference plus bas) — UNIQUEMENT nécessaires pour
// valider une condition "variable", `undefined` sans effet sur tout autre
// type de condition.
function validateCondition(cond, describe, entityVariables, sceneVariables) {
  if (typeof cond !== "object" || cond === null || !isNonEmptyString(cond.type)) {
    fail(`${describe} doit être un objet avec un type.`);
  }
  if (!CONDITION_TYPES.includes(cond.type)) {
    fail(`${describe}.type "${cond.type}" absent du registre de conditions.`);
  }
  // "hasEquipmentTag" : EN PLUS de son type (déjà validé ci-dessus), son
  // champ `tag` référence un tag de contenu (core/tags.js/TAG_REGISTRY) —
  // même traitement qu'une surface de segment (voir parseSegment plus bas) :
  // une faute de frappe ici échouerait SILENCIEUSEMENT à l'évaluation
  // (core/presence.js/evaluateHasEquipmentTag replie sur false pour un tag
  // absent), donc elle est refusée ICI, au chargement, plutôt que de laisser
  // une règle de contenu ne jamais se déclencher sans qu'on sache pourquoi.
  if (cond.type === "hasEquipmentTag" && (!isNonEmptyString(cond.tag) || !TAG_REGISTRY[cond.tag])) {
    fail(`${describe}.tag "${cond.tag}" absent du registre de tags.`);
  }
  // "hasImprovement" : EN PLUS de son type, son champ `id` référence une
  // amélioration du registre (core/improvements.js/IMPROVEMENT_REGISTRY) —
  // même traitement que hasEquipmentTag.tag ci-dessus : une faute de frappe
  // échouerait SILENCIEUSEMENT à l'évaluation (core/presence.js/
  // evaluateHasImprovement replie sur false pour un id absent, HORS mode
  // debug — voir son commentaire), donc refusée ICI, au chargement.
  if (cond.type === "hasImprovement" && (!isNonEmptyString(cond.id) || !IMPROVEMENT_REGISTRY[cond.id])) {
    fail(`${describe}.id "${cond.id}" absent du registre d'improvements.`);
  }
  // "weather" : EN PLUS de son type, son champ `state` référence un état de
  // la table météo (config/weather-values.js/WEATHER_STATES) — même
  // traitement que hasEquipmentTag.tag ci-dessus : une faute de frappe
  // échouerait SILENCIEUSEMENT à l'évaluation (core/presence.js/
  // evaluateWeather replie sur false pour un état qui ne matche jamais),
  // donc refusée ICI, au chargement.
  if (cond.type === "weather" && (!isNonEmptyString(cond.state) || !WEATHER_STATES[cond.state])) {
    fail(`${describe}.state "${cond.state}" absent de la table météo.`);
  }
  // "allOf" : composite — son champ `conditions` doit être un tableau NON
  // VIDE, chaque élément revalidé RÉCURSIVEMENT par cette même fonction
  // (une sous-condition peut être de n'importe quel type du registre, y
  // compris un autre "allOf" imbriqué) — jamais un second chemin de
  // validation, voir core/scripting.md.
  if (cond.type === "allOf") {
    if (!Array.isArray(cond.conditions) || cond.conditions.length === 0) {
      fail(`${describe}.conditions doit être un tableau non vide pour "allOf".`);
    }
    cond.conditions.forEach((subCond, i) =>
      validateCondition(subCond, `${describe}.conditions[${i}]`, entityVariables, sceneVariables)
    );
  }
  // "variable" : LECTURE d'une variable (voir core/presence.js/
  // evaluateVariable, core/variables.js) — scope/name validés contre les
  // sacs déjà résolus du porteur (voir validateVariableReference, y
  // compris sa limite documentée sur la portée "party"), EXACTEMENT UN
  // comparateur requis (VARIABLE_COMPARATORS), et — SEULEMENT quand le
  // TYPE réel de la variable est connu — cohérence comparateur/type
  // ("greaterThan" etc. refusés sur un "flag", seul "equals" y est permis)
  // ET valeur/type du comparateur lui-même (ex. equals:1 sur un "flag").
  if (cond.type === "variable") {
    validateVariableReference(cond.scope, cond.name, entityVariables, sceneVariables, describe);

    const usedComparators = VARIABLE_COMPARATORS.filter((c) => cond[c] !== undefined);
    if (usedComparators.length !== 1) {
      fail(`${describe} doit porter EXACTEMENT un comparateur (${VARIABLE_COMPARATORS.join(" | ")}).`);
    }
    const comparator = usedComparators[0];
    const knownType = resolveKnownVariableType(cond.scope, cond.name, entityVariables, sceneVariables);
    if (knownType) {
      if (comparator !== "equals" && knownType !== "int") {
        fail(`${describe} : comparateur "${comparator}" invalide sur une variable "flag" (seul "equals" est permis).`);
      }
      if (!isValidValueForType(knownType, cond[comparator])) {
        fail(`${describe}.${comparator} incohérent avec le type "${knownType}" (reçu : ${JSON.stringify(cond[comparator])}).`);
      }
    }
  }
}

// Une règle de presence[] : { when: { type, ... }, effects: [<effet>...] }.
// `when` est reporté TEL QUEL (transport générique, comme `tuning` plus
// bas) — son évaluateur (core/presence.js) gère seul ses propres champs, y
// compris leur absence/malformation (repli défensif -> false). RACCOURCI
// rétrocompatible avec la présence seule (avant ce système généralisé) :
// `{ when, present: boolean }` sans `effects`, normalisé ICI en forme
// canonique `{ when, effects: [{ type: "presence", present }] }` — tout
// consommateur d'une entité PARSÉE (vue, sauvegarde...) ne voit plus qu'une
// seule forme, jamais les deux. Une règle sans AUCUN effet ne sert à rien
// (échec clair plutôt qu'une règle muette qu'on croirait active) : l'un des
// deux (`effects` ou `present`) est requis.
function parsePresenceRule(rawRule, ruleIndex, index, id, entityVariables, sceneVariables) {
  if (typeof rawRule !== "object" || rawRule === null) {
    fail(`entities[${index}] ("${id}") : presence[${ruleIndex}] n'est pas un objet.`);
  }
  const { when, present, effects } = rawRule;
  validateCondition(when, `entities[${index}] ("${id}") : presence[${ruleIndex}].when`, entityVariables, sceneVariables);

  if (effects !== undefined) {
    if (!Array.isArray(effects) || effects.length === 0) {
      fail(`entities[${index}] ("${id}") : presence[${ruleIndex}].effects doit être un tableau non vide si présent.`);
    }
    return {
      when,
      effects: effects.map((effect, i) =>
        parseEffect(effect, `entities[${index}] ("${id}") : presence[${ruleIndex}].effects[${i}]`, index, id)
      ),
    };
  }
  if (typeof present !== "boolean") {
    fail(`entities[${index}] ("${id}") : presence[${ruleIndex}] doit fournir "effects" ou "present" (booléen).`);
  }
  return { when, effects: [{ type: "presence", present }] };
}

// Valide UNE candidate d'action — RÉUTILISÉE À L'IDENTIQUE que `action` soit
// un objet UNIQUE ou un élément d'un TABLEAU de candidates (voir
// parseEntity) : la forme d'une candidate ne dépend jamais du nombre de
// candidates.
//
// `effects` (optionnel) : la LISTE D'EFFETS exécutée si la condition RÉUSSIT
// (ou s'il n'y a pas de condition — comportement d'une action ordinaire),
// MÊME vocabulaire que `refusalEffects` ci-dessous (voir parseActionEffect,
// core/effects.js) — état (setVariable/toggleVariable/addVariable) ET rendu
// (playSound/announce) librement mélangés, le ROUTAGE core/vue se fait à
// l'EXÉCUTION (view/interaction.js), jamais ici.
//
// `refusalEffects` : SYMÉTRIQUE d'`effects`, exécutée si la condition
// ÉCHOUE — OPTIONNELLE : une action conditionnelle peut s'en passer si
// l'échec est un choix de conception ASSUMÉ, jamais atteignable en pratique
// (ex. entities/types/window.js, dont les deux candidates couvrent tout
// l'espace de leur variable — aucun refus n'est jamais réellement possible,
// en déclarer un serait du code mort). RECOMMANDÉE dès que l'échec
// laisserait le joueur sans aucun retour (ex. porte à dresscode/horaires) —
// c'est désormais une RESPONSABILITÉ DE CONTENU, plus une contrainte du
// validateur (voir doc/scripting.md/"Conditions d'action"). Absente ->
// l'action ne s'exécute simplement pas si la condition échoue, SANS effet
// (ni son ni annonce) ; PRÉSENTE, elle reste validée comme n'importe quelle
// liste d'effets (tableau NON VIDE, MÊME vocabulaire qu'`effects`) — un
// champ déclaré s'engage à servir à quelque chose, jamais un tableau vide
// laissé en trace. Aucun son de refus GÉNÉRIQUE imposé ici : une action qui
// ne veut QU'annoncer son refus déclare `[{ type: "announce", ... }]`, sans
// playSound — c'est un choix de CONTENU, jamais une valeur par défaut du
// système.
function parseSingleAction(rawAction, describe, entityVariables, sceneVariables) {
  if (typeof rawAction !== "object" || rawAction === null || Array.isArray(rawAction)) {
    fail(`${describe} doit être un objet.`);
  }
  if (!isNonEmptyString(rawAction.kind)) {
    fail(`${describe}.kind doit être une chaîne non vide.`);
  }
  if (rawAction.condition !== undefined) {
    validateCondition(rawAction.condition, `${describe}.condition`, entityVariables, sceneVariables);
  }
  const result = { ...rawAction };
  if (rawAction.effects !== undefined) {
    if (!Array.isArray(rawAction.effects) || rawAction.effects.length === 0) {
      fail(`${describe}.effects doit être un tableau non vide si présent.`);
    }
    result.effects = rawAction.effects.map((effect, i) =>
      parseActionEffect(effect, `${describe}.effects[${i}]`, entityVariables, sceneVariables)
    );
  }
  if (rawAction.refusalEffects !== undefined) {
    if (!Array.isArray(rawAction.refusalEffects) || rawAction.refusalEffects.length === 0) {
      fail(`${describe}.refusalEffects doit être un tableau non vide si présent.`);
    }
    result.refusalEffects = rawAction.refusalEffects.map((effect, i) =>
      parseActionEffect(effect, `${describe}.refusalEffects[${i}]`, entityVariables, sceneVariables)
    );
  }
  return result;
}

function parseEntity(rawEntity, index, registry, length, seenIds, sceneVariables) {
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
  } = rawEntity;

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

  // sounds : cascade instance -> archétype PAR FUSION PROFONDE (voir
  // deepMergeOverride ci-dessus) — SEUL champ fusionné plutôt que
  // remplacé/transporté : une instance ne déclare QUE ce qu'elle CHANGE,
  // fusionné récursivement avec le sounds de l'archétype (ex. { beacon: {
  // gain: 0.8 } } surcharge juste ce champ, hérite le reste du rôle ET les
  // autres rôles). TROIS états, voir doc/entity-model.md/"Cascade de
  // sounds" : champ/rôle ABSENT -> hérite ; déclaré en OBJET -> fusionne ;
  // déclaré à `null` -> RETIRE ce palier (ex. beacon: null retire le
  // beacon sans toucher vocal/movement — le cas "passage sans beacon").
  // Toujours un objet en sortie (`?? {}`), jamais undefined : la vue lit
  // `entity.sounds` comme structurellement présent.
  if (sounds !== undefined && sounds !== null && (typeof sounds !== "object" || Array.isArray(sounds))) {
    fail(`entities[${index}] ("${id}") : sounds doit être un objet (ou null) si présent.`);
  }
  const resolvedSounds = deepMergeOverride(registry[type].sounds, sounds) ?? {};

  const labelKey = isNonEmptyString(nameKey) ? nameKey : registry[type].nameKey;
  // Même cascade instance -> type que labelKey, pour la description utilisée
  // par l'interaction "describe" (voir view/interaction.js). Peut rester
  // undefined si ni l'instance ni le type n'en fournissent une (ex. decor).
  const resolvedDescriptionKey = isNonEmptyString(descriptionKey) ? descriptionKey : registry[type].descriptionKey;
  // consumedDescriptionKey : même cascade instance -> type que
  // descriptionKey ci-dessus — description ALTERNATIVE une fois l'entité
  // "consumed" (voir core/state.js/markConsumed, entities/model.md/
  // "Collectible persistant"). TRANSPORT pur, comme descriptionKey : le
  // core ignore tout du sens de "consumed" en dehors de sa propre condition
  // de présence (core/presence.js) — c'est view/interaction.js qui choisit
  // laquelle des deux clés annoncer, jamais ici.
  const resolvedConsumedDescriptionKey = isNonEmptyString(consumedDescriptionKey)
    ? consumedDescriptionKey
    : registry[type].consumedDescriptionKey;
  // blocksMovement : même cascade instance -> type que labelKey/
  // descriptionKey ci-dessus. Bakée ici, pas lue directement par
  // core/reduce.js dans le registre : le core ne connaît le registre qu'à
  // travers ce que parseLevel en extrait, jamais en l'important lui-même.
  if (blocksMovement !== undefined && typeof blocksMovement !== "boolean") {
    fail(`entities[${index}] ("${id}") : blocksMovement doit être un booléen si présent.`);
  }
  const resolvedBlocksMovement = blocksMovement !== undefined ? blocksMovement : Boolean(registry[type].blocksMovement);
  // observable/interactable : DEUX capacités indépendantes (système
  // d'interaction niveau 0, voir view/interaction.js) — même cascade que
  // blocksMovement, même défaut global (false, silence par défaut plutôt
  // qu'une capacité surprise). Volontairement des booléens PLATS ici (pas
  // de sous-objet "capabilities") : la richesse du TYPE d'action (voir
  // `action` plus bas) s'ajoute EN PLUS via un champ séparé, jamais en
  // remplaçant celui-ci — le filtrage par verbe
  // (view/audio/city-scene.js/getInteractionCandidates) ne lit jamais plus
  // que ces deux booléens.
  if (observable !== undefined && typeof observable !== "boolean") {
    fail(`entities[${index}] ("${id}") : observable doit être un booléen si présent.`);
  }
  const resolvedObservable = observable !== undefined ? observable : Boolean(registry[type].observable);
  if (interactable !== undefined && typeof interactable !== "boolean") {
    fail(`entities[${index}] ("${id}") : interactable doit être un booléen si présent.`);
  }
  const resolvedInteractable = interactable !== undefined ? interactable : Boolean(registry[type].interactable);
  // isFlying : même cascade/même défaut (false) que observable/interactable
  // ci-dessus — marqueur PUR, aucune logique ici ni ailleurs dans le core
  // (pas d'axe Y, pas de position verticale). Lu UNIQUEMENT par la vue
  // (view/audio/city-scene.js) pour déclencher une chaîne de filtres qui
  // SUGGÈRE la hauteur — voir config/tuning-values.js/flyingHighpassHz et
  // consorts, entities/model.md.
  if (isFlying !== undefined && typeof isFlying !== "boolean") {
    fail(`entities[${index}] ("${id}") : isFlying doit être un booléen si présent.`);
  }
  const resolvedIsFlying = isFlying !== undefined ? isFlying : Boolean(registry[type].isFlying);
  // speed : même cascade instance -> type que isFlying ci-dessus, défaut `1`
  // (jamais `false`/`0` — une vitesse nulle immobiliserait un mobile à
  // intention sans le distinguer d'une entité VRAIMENT sans comportement).
  // Facteur MULTIPLICATIF de MOVE_STEP, consommé par la PHYSIQUE de
  // résolution (core/physics/collision.js/resolveBodyMove), JAMAIS par un
  // comportement (wander/follow/goto) : ceux-ci ne produisent toujours
  // qu'une intention de direction, ignorant tout de la vitesse — c'est
  // core/reduce.js qui lit CE champ pour résoudre le déplacement voulu de
  // chaque mobile à intention. Baké ici (pas relu dans le registre par
  // core/reduce.js) pour la même raison que blocksMovement/isFlying : le
  // core ne connaît le registre qu'à travers ce que parseLevel en extrait.
  // Cadence de pas INCHANGÉE par ailleurs (view/audio/city-scene.js/
  // stepWalker) : elle dérive déjà de la distance parcourue, donc un mobile
  // deux fois plus lent voit SES PAS s'espacer deux fois plus, sans le
  // moindre réglage de cadence séparé à toucher.
  if (speed !== undefined && (!isFiniteNumber(speed) || speed <= 0)) {
    fail(`entities[${index}] ("${id}") : speed doit être un nombre > 0 si présent.`);
  }
  const resolvedSpeed = speed !== undefined ? speed : registry[type].speed !== undefined ? registry[type].speed : 1;
  const entity = {
    id,
    type,
    x,
    labelKey,
    sounds: resolvedSounds,
    blocksMovement: resolvedBlocksMovement,
    observable: resolvedObservable,
    interactable: resolvedInteractable,
    isFlying: resolvedIsFlying,
    speed: resolvedSpeed,
  };
  // Clé ajoutée SEULEMENT si résolue (jamais explicitement undefined) :
  // l'état doit rester de la donnée pure, un aller-retour JSON ne doit rien
  // changer à sa forme (voir movement.check.js, audit de sérialisabilité).
  // Même principe que behavior/action plus bas.
  if (resolvedDescriptionKey !== undefined) {
    entity.descriptionKey = resolvedDescriptionKey;
  }
  if (resolvedConsumedDescriptionKey !== undefined) {
    entity.consumedDescriptionKey = resolvedConsumedDescriptionKey;
  }

  // variables : optionnel, STOCKAGE de variables PROPRES à cette entité
  // (portée "entity", voir core/variables.js/CLAUDE.md) — PAS de cascade
  // instance -> type (contrairement à presence/behavior/action plus bas) :
  // une variable est un compteur/flag d'INSTANCE (ex. l'état d'UNE porte
  // précise), jamais un défaut partagé par tout un archétype. Absente ->
  // entity.variables reste undefined (aucun sac à porter), même politique
  // SPARSE que presence/behavior/action ci-dessous — jamais un objet vide
  // imposé à chaque entité qui n'en a pas besoin. Résolue ICI, AVANT
  // action/presence : les deux peuvent RÉFÉRENCER une variable d'entité
  // (condition "variable", effets setVariable/toggleVariable/addVariable),
  // leur validation a donc besoin du sac déjà résolu — voir
  // validateVariableReference (core/level.js).
  if (variables !== undefined) {
    entity.variables = parseVariables(variables, `entities[${index}] ("${id}") : variables`, fail);
  }

  // behavior : optionnel, donnée (pas une classe) décrivant un comportement
  // de mouvement au tick (voir core/reduce.js). Sans behavior, une entité
  // reste immobile — comportement inchangé pour tout le contenu existant.
  if (behavior !== undefined) {
    entity.behavior = parseBehavior(behavior, index, id);
  }

  // action : optionnel, TYPE D'ACTION porté par une entité interactable
  // (voir view/interaction.js) — { kind: <string>, ...paramètres }. Cascade
  // instance -> type, comme behavior. TRANSPORT générique comme tuning
  // plus bas : validé en FORME seulement (objet avec un kind non vide),
  // JAMAIS le kind lui-même contre un registre de types connus — cet
  // aiguillage reste entièrement côté vue (ACTION_HANDLERS,
  // view/interaction.js), le core ignore tout du SENS d'un kind, comme il
  // ignore déjà le sens d'une clé de tuning. Un kind inconnu à
  // l'INTERACTION (pas au chargement) se dégrade proprement, voir
  // view/interaction.js.
  //
  // action.condition (optionnel, ACTIONS CONDITIONNELLES) : MÊME objet
  // déclaratif que presence[].when, MÊME registre (CONDITION_TYPES),
  // GÉNÉRIQUE à TOUT kind (transit, pickup, loot...) — validé ICI via
  // validateCondition, exactement comme une condition de présence. Contexte
  // d'évaluation et EXÉCUTION (bloquer l'action, exécuter refusalEffects)
  // restent entièrement côté vue (voir view/interaction.js) : le core ne
  // fait que transporter et valider la FORME, comme pour `kind`.
  // refusalEffects (voir parseSingleAction) est OPTIONNELLE : RECOMMANDÉE
  // quand une condition qui échoue laisserait l'action bloquée sans aucun
  // retour, mais jamais imposée — un échec structurellement inatteignable
  // (voir entities/types/window.js) n'a pas à en déclarer une.
  //
  // ACTIONS MULTIPLES CANDIDATES (voir core/scripting.md/"Actions multiples
  // filtrées par condition", core/presence.js/selectMatchingAction) :
  // `action` peut être un OBJET UNIQUE (comme ci-dessus, INCHANGÉ) ou un
  // TABLEAU de candidates, chacune validée EXACTEMENT comme une action
  // unique (voir parseSingleAction) — à l'ACTIVATION, la vue choisit celle
  // dont la condition est vraie (view/interaction.js). RÉTROCOMPAT
  // STRICTE : une entité qui déclare `action` comme un objet suit la MÊME
  // branche qu'avant ce mécanisme, structurellement inchangée.
  const resolvedAction = action !== undefined ? action : registry[type].action;
  if (resolvedAction !== undefined) {
    if (Array.isArray(resolvedAction)) {
      if (resolvedAction.length === 0) {
        fail(`entities[${index}] ("${id}") : action ne peut pas être un tableau vide.`);
      }
      entity.action = resolvedAction.map((candidate, i) =>
        parseSingleAction(candidate, `entities[${index}] ("${id}") : action[${i}]`, entity.variables, sceneVariables)
      );
    } else {
      entity.action = parseSingleAction(
        resolvedAction,
        `entities[${index}] ("${id}") : action`,
        entity.variables,
        sceneVariables
      );
    }
  }

  // tuning : surcharges d'INSTANCE pour la cascade de réglages
  // (lib/tuning.js/resolveTuning, config/tuning.js) — TRANSPORT générique,
  // jamais interprété ici. Le core ignore tout du SENS de ces clés (sonore
  // ou non) : il se contente de les porter jusqu'à l'entité parsée, palier
  // le plus spécifique après le descripteur de son lui-même (voir
  // entities/model.md). Aucune clé nommée en dur — ajouter demain un
  // nouveau paramètre résolu en cascade (config/tuning-values.js) le rend
  // automatiquement surchargeable ici, sans jamais rouvrir ce fichier.
  // Même statut que music/ambiences/reverbDurationSec/reverbDecay plus bas
  // dans parseLevel (niveau LIEU, pas entité) : simple passage validé en
  // FORME (un objet), jamais en contenu.
  if (tuning !== undefined) {
    if (typeof tuning !== "object" || tuning === null || Array.isArray(tuning)) {
      fail(`entities[${index}] ("${id}") : tuning doit être un objet si présent.`);
    }
    entity.tuning = tuning;
  }

  // container : optionnel, SOURCE DE COLLECTE régénérante (voir core/spawn.js,
  // doc/entity-model.md/"Collecte") — { distribution, count? } (référence à
  // une table standard ou table inline, voir core/distribution.js ; count
  // entier >= 1, défaut config/spawn-values.js/SPAWN_CONTAINER_DEFAULT_COUNT
  // résolu par le moteur). Cascade instance -> type comme action/behavior.
  // Seule la forme est validée ici ; le garnissage (stock/stockCycle, champs
  // RUNTIME) reste au moteur, et l'action "search" qui l'exploite reste côté
  // vue.
  const resolvedContainer = container !== undefined ? container : registry[type].container;
  if (resolvedContainer !== undefined) {
    if (typeof resolvedContainer !== "object" || resolvedContainer === null || Array.isArray(resolvedContainer)) {
      fail(`entities[${index}] ("${id}") : container doit être un objet si présent.`);
    }
    validateDistribution(resolvedContainer.distribution, `entities[${index}] ("${id}") : container.distribution`, fail);
    if (resolvedContainer.count !== undefined && (!Number.isInteger(resolvedContainer.count) || resolvedContainer.count < 1)) {
      fail(`entities[${index}] ("${id}") : container.count doit être un entier >= 1 si présent.`);
    }
    entity.container = { distribution: resolvedContainer.distribution };
    if (resolvedContainer.count !== undefined) entity.container.count = resolvedContainer.count;
  }

  // shop : optionnel, POINT DE VENTE (voir core/catalog.js, core/trade.js,
  // doc/entity-model.md/"Vente et achat") — { catalog } (référence à un
  // catalogue standard ou catalogue inline), cascade instance -> type comme
  // container. Le stock courant (shopStock/shopCycle, champs RUNTIME) reste
  // au moteur ; l'action "shop" qui l'exploite reste côté vue.
  const resolvedShop = shop !== undefined ? shop : registry[type].shop;
  if (resolvedShop !== undefined) {
    if (typeof resolvedShop !== "object" || resolvedShop === null || Array.isArray(resolvedShop)) {
      fail(`entities[${index}] ("${id}") : shop doit être un objet si présent.`);
    }
    validateCatalog(resolvedShop.catalog, `entities[${index}] ("${id}") : shop.catalog`, fail);
    entity.shop = { catalog: resolvedShop.catalog };
  }

  // presence : optionnel, RÈGLES DÉCLARATIVES de présence conditionnelle
  // (voir core/presence.js) — cascade INSTANCE -> TYPE, même principe que
  // blocksMovement (ex. "neon" est TOUJOURS nocturne par archétype, voir
  // entities/types/neon.js ; une instance pourrait surcharger son propre
  // calendrier si besoin un jour). Ni l'un ni l'autre -> toujours présente,
  // comportement STRICTEMENT inchangé pour tout contenu existant (voir
  // core/presence.js/isPresent).
  const resolvedPresence = presence !== undefined ? presence : registry[type].presence;
  if (resolvedPresence !== undefined) {
    if (!Array.isArray(resolvedPresence)) {
      fail(`entities[${index}] ("${id}") : presence doit être un tableau si présent.`);
    }
    entity.presence = resolvedPresence.map((rule, i) =>
      parsePresenceRule(rule, i, index, id, entity.variables, sceneVariables)
    );
  }

  return entity;
}

// Entité créée EN JEU par le moteur de collecte (core/spawn.js) : MÊME
// parseur qu'une instance de niveau (cascade sounds/capacités/action de
// l'archétype, validation complète), sans contexte de liste — `raw` porte
// déjà un id unique (dérivé du cycle, voir core/spawn.js), aucune
// déduplication à faire ici.
export function parseSpawnedEntity(raw, registry, length, sceneVariables) {
  return parseEntity(raw, 0, registry, length, new Set(), sceneVariables);
}

// Générique : ne connaît aucun kind par son nom. Cherche kind dans le
// registre (comme registry[type] pour les types d'entité juste au-dessus),
// puis délègue la validation propre au comportement à son module (voir
// core/behaviors/wander.js) — parseParams ne renvoie que les champs fournis,
// les défauts se résolvent ailleurs (voir le contrat documenté dans le
// module), jamais ici.
function parseBehavior(behavior, index, id) {
  if (typeof behavior !== "object" || behavior === null) {
    fail(`entities[${index}] ("${id}") : behavior doit être un objet si présent.`);
  }

  const { kind } = behavior;
  const module = BEHAVIORS[kind];
  if (!module) {
    fail(`entities[${index}] ("${id}") : behavior.kind "${kind}" inconnu.`);
  }

  const params = module.parseParams(behavior, (message) => fail(`entities[${index}] ("${id}") : ${message}`));
  return { kind, ...params };
}

// Détection de chevauchement au chargement (préventif, NON bloquant) : le
// level design évite ce cas, mais un niveau mal formé doit se dénoncer au
// chargement plutôt qu'en cours de jeu — même principe de filet que
// playerStart plus bas, un console.warn clair, jamais un fail(). Une
// entité passable n'a pas de zone d'exclusion propre (voir
// core/reduce.js/resolveOverlaps) : seules les paires impliquant au moins
// une entité impassable sont vérifiées.
function warnOnOverlaps(entities, playerStart) {
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    if (a.blocksMovement && Math.abs(playerStart - a.x) < BODY_RADIUS) {
      console.warn(
        `parseLevel: playerStart (${playerStart}) démarre dans le corps de l'entité impassable "${a.id}" (x=${a.x}).`
      );
    }
    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      if (a.blocksMovement && b.blocksMovement && Math.abs(a.x - b.x) < 2 * BODY_RADIUS) {
        console.warn(
          `parseLevel: entités impassables "${a.id}" (x=${a.x}) et "${b.id}" (x=${b.x}) se chevauchent au chargement.`
        );
      }
    }
  }
}

// Un segment PATCHE defaultSurface sur [from, to] (bornes incluses, voir
// surfaceAt/core/surfaces.js) : from < to, les deux dans [0, length].
// TOUJOURS explicite si présent (pas de filet ici, contrairement à
// defaultSurface) : déclarer un segment est un choix délibéré, une surface
// inconnue est une vraie erreur de contenu -> échec clair, comme un type
// d'entité inconnu (voir parseEntity).
function parseSegment(rawSegment, index, length) {
  if (typeof rawSegment !== "object" || rawSegment === null) {
    fail(`segments[${index}] n'est pas un objet.`);
  }

  const { from, to, surface } = rawSegment;
  if (!isFiniteNumber(from) || !isFiniteNumber(to) || from < 0 || to > length || from >= to) {
    fail(
      `segments[${index}] : bornes [from, to] invalides (reçu from=${JSON.stringify(from)}, to=${JSON.stringify(to)}, longueur ${length}).`
    );
  }
  if (!isNonEmptyString(surface) || !SURFACE_REGISTRY[surface]) {
    fail(`segments[${index}] : surface "${surface}" absente du registre de surfaces.`);
  }

  return { from, to, surface };
}

// Champs qu'une FACE porte en propre (recto/verso d'une scène à deux
// faces, OU la scène entière si elle est simple — voir parseLevel) :
// entités + habillage sonore/surface du lieu. Liste PARTAGÉE entre le mode
// simple et le mode deux-faces pour détecter un mélange des deux modèles
// (voir parseLevel) — jamais recopiée en dur ailleurs.
const FACE_FIELDS = [
  "entities",
  "music",
  "musicDay",
  "musicNight",
  "musicLoop",
  "ambiences",
  "ambiencesDay",
  "ambiencesNight",
  "reverbDurationSec",
  "reverbDecay",
  "defaultSurface",
  "segments",
  "indoor",
  "spawnRanges",
];

// Une PLAGE de collecte (voir core/spawn.js, doc/entity-model.md/"Collecte")
// : { from, to, count?, distribution } — bornes comme un segment (from < to,
// dans [0, length]), count entier >= 1 optionnel (défaut :
// config/spawn-values.js/SPAWN_RANGE_DEFAULT_COUNT, résolu par le moteur),
// distribution validée comme celle d'un conteneur.
function parseSpawnRange(rawRange, index, length, prefix) {
  const describe = `${prefix}spawnRanges[${index}]`;
  if (typeof rawRange !== "object" || rawRange === null) {
    fail(`${describe} n'est pas un objet.`);
  }
  const { from, to, count, distribution } = rawRange;
  if (!isFiniteNumber(from) || !isFiniteNumber(to) || from < 0 || to > length || from >= to) {
    fail(
      `${describe} : bornes [from, to] invalides (reçu from=${JSON.stringify(from)}, to=${JSON.stringify(to)}, longueur ${length}).`
    );
  }
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
    fail(`${describe} : count doit être un entier >= 1 si présent (reçu : ${JSON.stringify(count)}).`);
  }
  validateDistribution(distribution, `${describe}.distribution`, fail);
  const range = { from, to, distribution };
  if (count !== undefined) range.count = count;
  return range;
}

// Valide et construit UNE FACE (voir header ci-dessus) : entités +
// habillage sonore/surface, exactement ce qu'une scène SIMPLE portait déjà
// avant l'introduction du modèle à deux faces (voir CLAUDE.md/
// "RECTO/VERSO") — factorisé pour être appelé UNE fois (scène simple, sur
// `raw` directement) ou DEUX (scène à deux faces, une fois par
// recto/verso, voir parseLevel). `describe` préfixe les messages d'erreur
// (ex. "recto" ou "verso"), comme validateCondition le fait déjà pour ses
// propres appelants — jamais dupliqué pour rien de plus qu'un préfixe.
// `sceneVariables` : le sac de variables de portée "scene" DÉJÀ RÉSOLU par
// parseLevel (racine, PARTAGÉ entre les deux faces — voir son commentaire) —
// simplement RELAYÉ jusqu'à chaque entité (voir parseEntity), jamais relu
// ici : une face ne PORTE pas son propre sac de scène.
function parseFace(raw, length, registry, describe, sceneVariables) {
  const prefix = describe ? `${describe}.` : "";
  const {
    entities,
    music,
    musicDay,
    musicNight,
    musicLoop,
    ambiences,
    ambiencesDay,
    ambiencesNight,
    reverbDurationSec,
    reverbDecay,
    defaultSurface,
    segments,
    indoor,
    spawnRanges,
  } = raw;

  // entities : ABSENT -> [] (face vide, toujours jouable) ; PRÉSENT mais pas
  // un tableau -> erreur claire, inchangé.
  if (entities !== undefined && !Array.isArray(entities)) {
    fail(`${prefix}entities doit être un tableau si présent (reçu : ${JSON.stringify(entities)}).`);
  }
  const resolvedEntities = entities !== undefined ? entities : [];
  // defaultSurface : couvre tout le X non-segmenté (voir surfaceAt,
  // core/surfaces.js) — toute la face est TOUJOURS couverte, sans trou.
  // FILET SILENCIEUX si absent (repli sur DEFAULT_SURFACE, comportement
  // audible inchangé pour toute scène existante qui n'en déclare pas
  // encore), mais une valeur FOURNIE doit exister dans le registre -> échec
  // clair sinon (comme un type d'entité inconnu, voir parseEntity) : une
  // référence de surface erronée est un vrai bug de contenu, jamais
  // dégradée en silence.
  if (defaultSurface !== undefined && (!isNonEmptyString(defaultSurface) || !SURFACE_REGISTRY[defaultSurface])) {
    fail(`${prefix}defaultSurface "${JSON.stringify(defaultSurface)}" absente du registre de surfaces.`);
  }
  const resolvedDefaultSurface = defaultSurface !== undefined ? defaultSurface : DEFAULT_SURFACE;
  // indoor : PROPRIÉTÉ DE NATURE DE LIEU (comme defaultSurface juste
  // au-dessus), pas un "flag ambiance météo" — aujourd'hui seul le RENDU de
  // l'ambiance météo la consulte (voir view/audio/city-scene.js, choix du
  // pool outdoor/indoor par état, config/weather-values.js), mais rien
  // n'empêche un futur consommateur (réverb, sons ambiants...) de la lire
  // aussi. TOUJOURS résolue en booléen (comme defaultSurface, jamais
  // `undefined` sur une face parsée) : défaut `false` (extérieur, le cas
  // courant en ville) — comportement inchangé pour tout lieu existant qui
  // ne la déclare pas encore.
  if (indoor !== undefined && typeof indoor !== "boolean") {
    fail(`${prefix}indoor doit être un booléen si présent (reçu : ${JSON.stringify(indoor)}).`);
  }
  const resolvedIndoor = indoor !== undefined ? indoor : false;
  // segments : optionnel, PATCHE defaultSurface sur des zones précises (voir
  // parseSegment) — absent -> tableau vide, toujours resolvedDefaultSurface
  // partout (comportement inchangé). Chaque segment est TOUJOURS explicite
  // (pas de filet par segment, voir parseSegment) : en déclarer un est un
  // choix délibéré.
  if (segments !== undefined && !Array.isArray(segments)) {
    fail(`${prefix}segments doit être un tableau si présent (reçu : ${JSON.stringify(segments)}).`);
  }
  const parsedSegments = (segments ?? []).map((rawSegment, index) => parseSegment(rawSegment, index, length));
  // spawnRanges : optionnel, PLAGES de collecte au sol (voir parseSpawnRange,
  // core/spawn.js) — SPARSE : absent -> aucune clé (une face sans plage
  // n'en porte pas un tableau vide), même politique que music/ambiences.
  if (spawnRanges !== undefined && !Array.isArray(spawnRanges)) {
    fail(`${prefix}spawnRanges doit être un tableau si présent (reçu : ${JSON.stringify(spawnRanges)}).`);
  }
  const parsedSpawnRanges =
    spawnRanges !== undefined ? spawnRanges.map((rawRange, index) => parseSpawnRange(rawRange, index, length, prefix)) : undefined;
  // music : optionnel, chemin vers la musique du lieu (voir
  // view/audio/city-scene.js). Simple passage : parseLevel ne connaît ni
  // Howler ni la lecture audio, juste la présence d'une chaîne.
  if (music !== undefined && !isNonEmptyString(music)) {
    fail(`${prefix}music doit être une chaîne non vide si présent (reçu : ${JSON.stringify(music)}).`);
  }
  // musicDay/musicNight : optionnels, musique PAR PHASE (voir
  // core/time.js/phaseAt, view/audio/city-scene.js) — un lieu qui n'en
  // déclare qu'une (musicDay SEULE, ou aucune des deux) retombe sur `music`
  // pour la phase manquante, jamais de régression pour le contenu existant.
  // Même validation de forme que music, rien de plus ici.
  if (musicDay !== undefined && !isNonEmptyString(musicDay)) {
    fail(`${prefix}musicDay doit être une chaîne non vide si présent (reçu : ${JSON.stringify(musicDay)}).`);
  }
  if (musicNight !== undefined && !isNonEmptyString(musicNight)) {
    fail(`${prefix}musicNight doit être une chaîne non vide si présent (reçu : ${JSON.stringify(musicNight)}).`);
  }
  // musicLoop : optionnel, booléen — voir view/audio/city-scene.js. Bascule
  // TOUTE la face (les deux phases) en boucle continue plutôt que
  // l'enchaînement-avec-respiration par défaut. Simple passage validé en
  // FORME, comme music/ambiences ci-dessus : le core ignore tout du SENS de
  // ce drapeau (boucle vs respiration), pure donnée de contenu.
  if (musicLoop !== undefined && typeof musicLoop !== "boolean") {
    fail(`${prefix}musicLoop doit être un booléen si présent (reçu : ${JSON.stringify(musicLoop)}).`);
  }
  // ambiences : optionnel, tableau de 0 à AMBIENCE_CHANNEL_LIMIT chemins
  // (voir view/audio/city-scene.js, lib/audio.js/setAmbienceLayer). Même
  // passage simple, juste la forme est vérifiée ici — la limite elle-même
  // vient de la source unique partagée avec lib/audio.js.
  if (ambiences !== undefined) {
    if (!Array.isArray(ambiences) || ambiences.length > AMBIENCE_CHANNEL_LIMIT || !ambiences.every(isNonEmptyString)) {
      fail(
        `${prefix}ambiences doit être un tableau d'au plus ${AMBIENCE_CHANNEL_LIMIT} chaînes non vides si présent (reçu : ${JSON.stringify(ambiences)}).`
      );
    }
  }
  // ambiencesDay/ambiencesNight : STRUCTURE RÉSERVÉE, même principe que
  // musicDay/musicNight ci-dessus, mais AUCUN consommateur ne les lit encore
  // (voir view/audio/city-scene.js — seule la musique réagit à la phase
  // pour l'instant, voir core/time.md). Validées en FORME dès maintenant
  // pour qu'une face qui les déclare échoue clairement en cas d'erreur,
  // plutôt que de découvrir une faute de frappe le jour où l'ambiance de
  // phase sera câblée.
  if (ambiencesDay !== undefined) {
    if (
      !Array.isArray(ambiencesDay) ||
      ambiencesDay.length > AMBIENCE_CHANNEL_LIMIT ||
      !ambiencesDay.every(isNonEmptyString)
    ) {
      fail(
        `${prefix}ambiencesDay doit être un tableau d'au plus ${AMBIENCE_CHANNEL_LIMIT} chaînes non vides si présent (reçu : ${JSON.stringify(ambiencesDay)}).`
      );
    }
  }
  if (ambiencesNight !== undefined) {
    if (
      !Array.isArray(ambiencesNight) ||
      ambiencesNight.length > AMBIENCE_CHANNEL_LIMIT ||
      !ambiencesNight.every(isNonEmptyString)
    ) {
      fail(
        `${prefix}ambiencesNight doit être un tableau d'au plus ${AMBIENCE_CHANNEL_LIMIT} chaînes non vides si présent (reçu : ${JSON.stringify(ambiencesNight)}).`
      );
    }
  }
  // reverbDurationSec/reverbDecay : optionnels, surchargent par FACE les
  // défauts globaux du bus de réverb (config/tuning-values.js) — voir
  // view/audio/city-scene.js. Simple passage validé, comme music/ambiences ;
  // aucune logique de résolution ici (ça reste dans la vue).
  if (reverbDurationSec !== undefined && (!isFiniteNumber(reverbDurationSec) || reverbDurationSec <= 0)) {
    fail(`${prefix}reverbDurationSec doit être un nombre > 0 si présent (reçu : ${JSON.stringify(reverbDurationSec)}).`);
  }
  if (reverbDecay !== undefined && (!isFiniteNumber(reverbDecay) || reverbDecay <= 0)) {
    fail(`${prefix}reverbDecay doit être un nombre > 0 si présent (reçu : ${JSON.stringify(reverbDecay)}).`);
  }

  const seenIds = new Set();
  const parsedEntities = resolvedEntities.map((rawEntity, index) =>
    parseEntity(rawEntity, index, registry, length, seenIds, sceneVariables)
  );

  const face = {
    defaultSurface: resolvedDefaultSurface,
    segments: parsedSegments,
    entities: parsedEntities,
    indoor: resolvedIndoor,
  };
  // Clés ajoutées SEULEMENT si présentes (jamais explicitement undefined) :
  // l'état doit rester de la donnée pure, un aller-retour JSON ne doit rien
  // changer à sa forme (voir movement.check.js, audit de sérialisabilité).
  if (music !== undefined) face.music = music;
  if (musicDay !== undefined) face.musicDay = musicDay;
  if (musicNight !== undefined) face.musicNight = musicNight;
  if (musicLoop !== undefined) face.musicLoop = musicLoop;
  if (ambiences !== undefined) face.ambiences = ambiences;
  if (ambiencesDay !== undefined) face.ambiencesDay = ambiencesDay;
  if (ambiencesNight !== undefined) face.ambiencesNight = ambiencesNight;
  if (reverbDurationSec !== undefined) face.reverbDurationSec = reverbDurationSec;
  if (reverbDecay !== undefined) face.reverbDecay = reverbDecay;
  if (parsedSpawnRanges !== undefined) face.spawnRanges = parsedSpawnRanges;

  return face;
}

export function parseLevel(raw, registry) {
  if (typeof raw !== "object" || raw === null) {
    fail("le niveau n'est pas un objet.");
  }
  if (typeof registry !== "object" || registry === null) {
    fail("le registre de types est manquant ou invalide.");
  }

  const { id, titleKey, length, playerStart, recto, verso, variables } = raw;

  // id/titleKey/length : ABSENTS -> défauts génériques (DEFAULT_LEVEL_*,
  // voir header) ; PRÉSENTS mais malformés -> erreur claire, inchangé — la
  // distinction absence/malformation vaut ici comme pour tout autre champ
  // de scène.
  if (id !== undefined && !isNonEmptyString(id)) {
    fail(`id invalide si présent (reçu : ${JSON.stringify(id)}).`);
  }
  const resolvedId = id !== undefined ? id : DEFAULT_LEVEL_ID;
  if (titleKey !== undefined && !isNonEmptyString(titleKey)) {
    fail(`titleKey invalide si présent (reçu : ${JSON.stringify(titleKey)}).`);
  }
  const resolvedTitleKey = titleKey !== undefined ? titleKey : DEFAULT_LEVEL_TITLE_KEY;
  if (length !== undefined && (!isFiniteNumber(length) || length <= 0)) {
    fail(`length doit être un nombre > 0 si présent (reçu : ${JSON.stringify(length)}).`);
  }
  const resolvedLength = length !== undefined ? length : DEFAULT_LEVEL_LENGTH;
  // playerStart : point d'arrivée PAR DÉFAUT du lieu. FILET, pas de rejet :
  // absent ou hors [0, length] -> repli sur 0, jamais d'exception (un lieu
  // mal configuré ne doit pas empêcher d'y entrer). Des points d'arrivée
  // NOMMÉS (ex. arriver à l'entrée précise associée à la porte empruntée)
  // pourront s'ajouter plus tard, sans toucher à ce filet — pas codés ici.
  const resolvedPlayerStart =
    isFiniteNumber(playerStart) && playerStart >= 0 && playerStart <= resolvedLength ? playerStart : 0;
  if (resolvedPlayerStart !== playerStart) {
    console.warn(
      `parseLevel: playerStart (${JSON.stringify(playerStart)}) absent ou hors bornes, repli sur 0.`
    );
  }

  // variables : STOCKAGE de variables de portée "scene" (voir
  // core/variables.js/CLAUDE.md) — RACINE PARTAGÉE, comme id/titleKey/
  // length/playerStart ci-dessus, JAMAIS un champ de FACE (une scène à deux
  // faces n'a qu'UN SEUL sac de variables de scène, partagé par recto ET
  // verso — pas dans FACE_FIELDS, jamais cherché dans recto/verso). TOUJOURS
  // résolu (sac vide `{}` si absent, jamais undefined) — même politique
  // EAGER que defaultSurface/indoor plus bas (parseFace), contrairement au
  // sac SPARSE d'une entité (voir parseEntity) : une scène a TOUJOURS un état
  // de variables, même vide, au même titre que sa surface par défaut.
  const resolvedVariables = parseVariables(variables, "variables", fail);

  // SCÈNE À DEUX FACES (modèle B, voir CLAUDE.md/"RECTO/VERSO",
  // core/state.js) : recto ET verso requis ENSEMBLE (jamais un seul), et
  // AUCUN des champs de face (FACE_FIELDS) au niveau racine — un niveau ne
  // mélange jamais les deux modèles, échec clair plutôt qu'une scène à
  // moitié construite. RÉTROCOMPAT STRICTE sinon : ni recto ni verso ->
  // exactement le comportement d'avant ce modèle, `raw` EST la face unique.
  const isTwoFaced = recto !== undefined || verso !== undefined;
  if (isTwoFaced) {
    if (recto === undefined || verso === undefined) {
      fail("une scène à deux faces doit déclarer recto ET verso, jamais un seul.");
    }
    const leakedField = FACE_FIELDS.find((field) => raw[field] !== undefined);
    if (leakedField) {
      fail(`"${leakedField}" est un champ de FACE : une scène à deux faces le déclare dans recto/verso, jamais à la racine.`);
    }
    const parsedRecto = parseFace(recto, resolvedLength, registry, "recto", resolvedVariables);
    const parsedVerso = parseFace(verso, resolvedLength, registry, "verso", resolvedVariables);
    warnOnOverlaps(parsedRecto.entities, resolvedPlayerStart);
    warnOnOverlaps(parsedVerso.entities, resolvedPlayerStart);
    return {
      id: resolvedId,
      titleKey: resolvedTitleKey,
      length: resolvedLength,
      playerStart: resolvedPlayerStart,
      variables: resolvedVariables,
      recto: parsedRecto,
      verso: parsedVerso,
    };
  }

  const face = parseFace(raw, resolvedLength, registry, null, resolvedVariables);
  warnOnOverlaps(face.entities, resolvedPlayerStart);

  return {
    id: resolvedId,
    titleKey: resolvedTitleKey,
    length: resolvedLength,
    playerStart: resolvedPlayerStart,
    variables: resolvedVariables,
    ...face,
  };
}
