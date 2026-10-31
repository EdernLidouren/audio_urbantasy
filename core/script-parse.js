// Parsing du FORMAT DÉCLARATIF ("le script", voir doc/scripting.md) dans une
// scène : conditions, effets (de tick et d'action), actions, triggers, règles
// de présence, références de variables. Valide la FORME au chargement — une
// donnée malformée échoue ici, jamais en jeu ; le SENS reste au moteur (core)
// ou à la vue selon la nature de l'effet (voir core/effects.js). Pur.

import { CONDITION_TYPES, conditionFields } from "./presence.js";
import { TAG_REGISTRY } from "./tags.js";
import { IMPROVEMENT_REGISTRY } from "./improvements.js";
import { EMOTE_REGISTRY } from "./emotes.js";
import { WEATHER_STATES } from "../config/weather-values.js";
import { VARIABLE_SCOPES, VARIABLE_TYPES, isValidValueForType } from "./variables.js";
import { ACTION_EFFECT_TYPES, MIXED_EFFECT_TYPES } from "./effects.js";
import { TRIGGER_KINDS } from "./triggers.js";
import { validateActionKind } from "./action-kinds.js";
import { TIME_CONFIG } from "../config/time-values.js";
import { fail, isNonEmptyString, isFiniteNumber, parseBehavior, parseBehaviorAt, rejectUnknownFields } from "./parse-common.js";

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
    rejectUnknownFields(rawEffect, ["type", "present"], describe);
    if (typeof rawEffect.present !== "boolean") {
      fail(`${describe}.present doit être un booléen.`);
    }
    return { type: "presence", present: rawEffect.present };
  }
  if (type === "behavior") {
    rejectUnknownFields(rawEffect, ["type", "behavior"], describe);
    // behavior: null -> RETRAIT explicite du comportement actif (voir
    // doc/scripting.md, "Effets"/"behavior") : l'entité redevient immobile,
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
//   - "entity" : contre `entityVariables`, LE SAC DE CETTE ENTITÉ
//     (core/entity-parse.js/parseEntity résout `entity.variables` AVANT
//     tout ce qui peut le référencer — voir son ordre de parsing) — une
//     référence à une variable jamais déclarée sur CETTE entité échoue
//     clairement, exactement comme un tag inconnu (voir hasEquipmentTag
//     dans validateCondition, plus bas).
//   - "scene" : contre `sceneVariables`, LE SAC DE LA SCÈNE (racine de la
//     scène, résolu par parseScene AVANT tout parseFace/parseEntity — voir
//     son ordre d'appel) — même exigence.
//   - "party" : AUCUNE vérification d'existence possible ICI — les
//     déclarations de partie n'existent qu'à createInitialState
//     (core/state.js), hors de portée d'un parseScene qui ne connaît qu'UNE
//     scène à la fois. LIMITE CONNUE, documentée (voir
//     doc/scripting.md/"Variables") plutôt que silencieusement ignorée :
//     une variable de partie mal orthographiée dans une condition/un effet
//     ne sera détectée qu'à l'ÉVALUATION (repli sur false/no-op, voir
//     core/presence.js et core/variables.js), jamais au chargement de la scène.
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
// codé ici (voir view/effect-runner.js/resolvePlaySoundNature).
const PLAY_SOUND_NATURES = ["diegetic", "meta"];

// Rôles de son qu'un "playSound" peut jouer par `role` au lieu d'un `path`
// (voir plus bas) : les rôles PONCTUELS d'une entité. Pas la balise ni les
// pas ni la boucle de proximité (sons continus ou cadencés par le
// mouvement), pas le ramassage (son MÉTA d'un objet, voir
// view/effect-runner.js/playPickupSound). Exporté pour la vérification du
// rôle sur l'entité porteuse (core/entity-parse.js).
export const PLAY_SOUND_ROLES = ["vocal", "enterSound", "exitSound", "approachSound", "leaveSound"];

// Faces et modes de transition reconnus pour l'effet "teleport" (voir plus
// bas) — "side" : face d'arrivée si la cible est une scène à deux faces
// (ignorée sinon, comme partout ailleurs) ; "transition" : "fade" (sas +
// fondu, le défaut d'une porte) ou "instant" (aucun sas, déplacement
// immédiat).
// Rôles qu'un "stopSounds" peut cibler (voir parseActionEffect).
const STOP_SOUNDS_ROLES = ["vocal"];

const TELEPORT_SIDES = ["recto", "verso"];
const TELEPORT_TRANSITIONS = ["fade", "instant"];

// Champs de chaque type d'effet d'action, en plus de `type` — tout autre
// champ est rejeté (voir parseActionEffect). Mêmes types que
// core/effects.js/ACTION_EFFECT_TYPES, vérifié au chargement du module :
// un type ajouté là sans ses champs ici échoue tout de suite.
const ACTION_EFFECT_FIELDS = {
  setVariable: ["scope", "name", "value"],
  toggleVariable: ["scope", "name"],
  addVariable: ["scope", "name", "amount"],
  giveImprovement: ["id"],
  removeImprovement: ["id"],
  learnEmote: ["id"],
  forgetEmote: ["id"],
  startle: [],
  temporaryBehavior: ["behavior", "durationMs"],
  dormantUntil: ["hour"],
  spawn: ["spec"],
  wait: ["ms", "variationMs"],
  playSound: ["path", "role", "gain", "pitchVariation", "reverbSend", "at", "nature", "tracked"],
  stopSounds: ["role"],
  announce: ["key", "assertive"],
  teleport: ["target", "x", "side", "reloadIfSame", "transition", "holdForSound"],
};
{
  const declared = Object.keys(ACTION_EFFECT_FIELDS);
  const missing = ACTION_EFFECT_TYPES.filter((type) => !declared.includes(type));
  const extra = declared.filter((type) => !ACTION_EFFECT_TYPES.includes(type));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `core/script-parse.js : ACTION_EFFECT_FIELDS désaccordé avec ACTION_EFFECT_TYPES (manquants : ${missing.join(", ") || "aucun"} ; en trop : ${extra.join(", ") || "aucun"}).`
    );
  }
}

// Un effet déclenché à l'ACTIVATION d'une action (voir core/effects.js pour
// la partition CORE/VUE, core/variables.js/applyActionEffects,
// view/effect-runner.js, doc/scripting.md/"Effets d'action") — AIGUILLAGE
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
// validés en FORME SEULEMENT — le core ignore tout du SENS (quel fichier, quelle traduction), il ne fait que garantir
// qu'un contenu malformé échoue au CHARGEMENT plutôt qu'à l'interaction.
//
// UN type MIXTE (`"teleport"`, JOUEUR uniquement — voir "Sources de vérité",
// core/effects.js) : validé en FORME comme les effets de RENDU (le core ne
// l'applique jamais lui-même), mais la VUE délègue son EXÉCUTION à des
// fonctions du core DÉJÀ EXISTANTES (core/state.js/travelToWorld,
// placePlayer) plutôt que de la réinventer. Une PORTE n'est pas un cas
// spécial : c'est une action ORDINAIRE dont `effects` contient un
// `"teleport"`, comme n'importe quel autre contenu.
// `playSound` porte le DESCRIPTEUR DE SON PARTAGÉ (voir lib/audio.js/
// playDescribedOneShot, view/audio/oneshots.js) réduit à ses sous-champs
// COMMUNS : `path` (requis, résolu via resolveAsset côté vue) ;
// `gain`/`pitchVariation`/`reverbSend` (optionnels, nombres finis — mêmes
// noms que les rôles positionnés beacon/vocal, jamais un vocabulaire
// parallèle) ; `at` (optionnel, id d'entité — PROVENANCE, une surcharge
// explicite) et `nature` (optionnel, `"diegetic"`/`"meta"` — une surcharge
// explicite) : le core ne fait que transporter/valider leur FORME, TOUTE
// résolution de DÉFAUT (provenance dérivée de l'entité porteuse de
// l'action, nature dérivée de la provenance) vit côté vue (voir
// view/effect-runner.js/runPlaySoundEffect) — le core ne connaît même pas
// l'existence de cette cascade.
function parseActionEffect(rawEffect, describe, entityVariables, sceneVariables) {
  if (typeof rawEffect !== "object" || rawEffect === null) {
    fail(`${describe} n'est pas un objet.`);
  }
  const { type, scope, name } = rawEffect;
  if (Object.hasOwn(ACTION_EFFECT_FIELDS, type)) {
    rejectUnknownFields(rawEffect, ["type", ...ACTION_EFFECT_FIELDS[type]], describe);
  }
  if (type === "setVariable") {
    validateVariableReference(scope, name, entityVariables, sceneVariables, describe);
    const knownType = resolveKnownVariableType(scope, name, entityVariables, sceneVariables);
    if (!isValidVariableValue(knownType, rawEffect.value)) {
      fail(`${describe}.value invalide pour ${describeVariableType(knownType)} (reçu : ${JSON.stringify(rawEffect.value)}).`);
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
  // "learnEmote"/"forgetEmote" { id } — ÉTAT, même forme et même sévérité
  // que giveImprovement/removeImprovement ci-dessus, contre EMOTE_REGISTRY
  // (core/emotes.js).
  if (type === "learnEmote" || type === "forgetEmote") {
    if (!isNonEmptyString(rawEffect.id) || !EMOTE_REGISTRY[rawEffect.id]) {
      fail(`${describe}.id "${rawEffect.id}" absent du registre d'émotes.`);
    }
    return { type, id: rawEffect.id };
  }
  // "wait" { ms, variationMs? } — pas de SÉQUENCE, pas un effet (voir
  // core/sequence.js) : la suite de la liste attend `ms` millisecondes de
  // jeu, à `variationMs` près (tiré dans un PRNG seedé, jamais au-delà de
  // `ms` : une attente ne devient jamais négative). Sa place dans la liste
  // est validée avec la liste entière (validateSequence).
  if (type === "wait") {
    if (!isFiniteNumber(rawEffect.ms) || rawEffect.ms <= 0) {
      fail(`${describe}.ms doit être un nombre > 0 (reçu : ${JSON.stringify(rawEffect.ms)}).`);
    }
    const { variationMs } = rawEffect;
    if (variationMs !== undefined && (!isFiniteNumber(variationMs) || variationMs < 0 || variationMs > rawEffect.ms)) {
      fail(`${describe}.variationMs doit être un nombre entre 0 et ms (${rawEffect.ms}) si présent.`);
    }
    return variationMs ? { type: "wait", ms: rawEffect.ms, variationMs } : { type: "wait", ms: rawEffect.ms };
  }
  // "startle" (sans champ) — ÉTAT : l'entité qui porte l'action s'enfuit
  // (voir core/startle.js, core/variables.js/applyActionEffects).
  if (type === "startle") {
    return { type: "startle" };
  }
  // "temporaryBehavior" { behavior, durationMs } — ÉTAT : un comportement
  // posé PAR-DESSUS celui de l'entité, pour une durée bornée (voir
  // core/variables.js/applyActionEffects, core/reduce.js/stepEntities).
  // `behavior` : même forme et même validation qu'un behavior d'entité,
  // jamais `null` (retirer la base n'est pas son rôle). `durationMs`
  // OBLIGATOIRE et > 0 : un comportement temporaire sans fin ne doit pas
  // pouvoir s'écrire — c'est le filet qui empêche une entité de rester
  // coincée dessus.
  if (type === "temporaryBehavior") {
    const behavior = parseBehaviorAt(rawEffect.behavior, describe);
    if (!isFiniteNumber(rawEffect.durationMs) || rawEffect.durationMs <= 0) {
      fail(`${describe}.durationMs doit être un nombre > 0 (reçu : ${JSON.stringify(rawEffect.durationMs)}).`);
    }
    return { type, behavior, durationMs: rawEffect.durationMs };
  }
  // "dormantUntil" { hour } — ÉTAT : l'entité qui porte l'effet devient
  // DORMANTE jusqu'au prochain début de l'heure `hour` (voir
  // core/variables.js/applyActionEffects, core/presence.js/
  // isForcedDormant), même si le joueur n'est plus là pour le voir.
  if (type === "dormantUntil") {
    if (!Number.isInteger(rawEffect.hour) || rawEffect.hour < 0 || rawEffect.hour >= TIME_CONFIG.hoursPerDay) {
      fail(`${describe}.hour doit être un entier entre 0 et ${TIME_CONFIG.hoursPerDay - 1} (reçu : ${JSON.stringify(rawEffect.hour)}).`);
    }
    return { type, hour: rawEffect.hour };
  }
  // "spawn" { spec } — ÉTAT : fait naître une entité ÉPHÉMÈRE (voir
  // doc/entity-model.md/"Entités éphémères") à la position de l'entité qui
  // porte l'effet. `spec` a la forme d'une instance de scène sans id ni x :
  // seule sa FORME est vérifiée ici ; core/entity-parse.js/
  // resolveSpawnSpecs le résout avec le registre (type connu, cascade de
  // l'archétype), ce module n'en a pas.
  if (type === "spawn") {
    const { spec } = rawEffect;
    if (typeof spec !== "object" || spec === null || Array.isArray(spec) || !isNonEmptyString(spec.type)) {
      fail(`${describe}.spec doit être un objet { type, ...champs d'une instance }.`);
    }
    if (spec.id !== undefined || spec.x !== undefined) {
      fail(`${describe}.spec : ni id ni x (l'éphémère prend un id à sa naissance et la position de l'entité qui le fait naître).`);
    }
    return { type, spec };
  }
  if (type === "playSound") {
    // `path` (un pool, ou un fichier) OU `role` (le son de rôle de l'entité
    // qui émet, avec ses propres réglages — le jappement du chien sifflé),
    // exactement l'un des deux. Un rôle est un son de l'entité DANS
    // L'ESPACE : jamais méta.
    if ((rawEffect.path === undefined) === (rawEffect.role === undefined)) {
      fail(`${describe} : "path" OU "role", exactement l'un des deux.`);
    }
    if (rawEffect.path !== undefined && !isNonEmptyString(rawEffect.path)) {
      fail(`${describe}.path doit être une chaîne non vide.`);
    }
    if (rawEffect.role !== undefined && !PLAY_SOUND_ROLES.includes(rawEffect.role)) {
      fail(`${describe}.role "${rawEffect.role}" inconnu (attendu : ${PLAY_SOUND_ROLES.map((r) => `"${r}"`).join(" | ")}).`);
    }
    if (rawEffect.role !== undefined && rawEffect.nature === "meta") {
      fail(`${describe} : un son de rôle est toujours diégétique (nature "meta" refusée).`);
    }
    for (const field of ["gain", "pitchVariation", "reverbSend"]) {
      if (rawEffect[field] !== undefined && !isFiniteNumber(rawEffect[field])) {
        fail(`${describe}.${field} doit être un nombre si présent.`);
      }
    }
    // at (id d'entité, PROVENANCE) / nature ("diegetic"|"meta") : TRANSPORT
    // pur comme le reste de cet effet — le core ignore tout du SENS (quelle
    // entité, quel filtrage), seule la vue (view/effect-runner.js/
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
    // tracked (booléen, SUIVI vs ANCRÉ d'un son positionné — défaut true,
    // résolu côté vue) : transport pur, comme at/nature.
    if (rawEffect.tracked !== undefined && typeof rawEffect.tracked !== "boolean") {
      fail(`${describe}.tracked doit être un booléen si présent.`);
    }
    const effect = rawEffect.role !== undefined ? { type: "playSound", role: rawEffect.role } : { type: "playSound", path: rawEffect.path };
    if (rawEffect.gain !== undefined) effect.gain = rawEffect.gain;
    if (rawEffect.pitchVariation !== undefined) effect.pitchVariation = rawEffect.pitchVariation;
    if (rawEffect.reverbSend !== undefined) effect.reverbSend = rawEffect.reverbSend;
    if (rawEffect.at !== undefined) effect.at = rawEffect.at;
    if (rawEffect.nature !== undefined) effect.nature = rawEffect.nature;
    if (rawEffect.tracked !== undefined) effect.tracked = rawEffect.tracked;
    return effect;
  }
  // "stopSounds" { role? } — RENDU : coupe, en fondu bref, les sons
  // ponctuels EN COURS de l'entité qui porte l'effet (voir
  // view/audio/oneshots.js/stopEntityOneShots) — tous, ou seulement ceux
  // du rôle `role`. Le néon qui éclate fait taire son grésillement en
  // cours. Seul "vocal" se distingue aujourd'hui ; un autre rôle viendra
  // avec un besoin.
  if (type === "stopSounds") {
    if (rawEffect.role !== undefined && !STOP_SOUNDS_ROLES.includes(rawEffect.role)) {
      fail(`${describe}.role "${rawEffect.role}" inconnu (attendu : ${STOP_SOUNDS_ROLES.map((r) => `"${r}"`).join(" | ")}).`);
    }
    return rawEffect.role !== undefined ? { type, role: rawEffect.role } : { type };
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
    // `holdForSound` : le sas reste fermé jusqu'à la fin du son de départ
    // (voir view/world-travel.js/runTeleportSas). Sans sas
    // (transition "instant"), il n'y a rien à prolonger : refusé. La
    // présence d'un son de départ se vérifie sur la liste entière (voir
    // validateSequence).
    if (rawEffect.holdForSound !== undefined) {
      if (typeof rawEffect.holdForSound !== "boolean") {
        fail(`${describe}.holdForSound doit être un booléen si présent.`);
      }
      if (rawEffect.holdForSound && rawEffect.transition === "instant") {
        fail(`${describe}.holdForSound demande un sas : incompatible avec transition "instant".`);
      }
    }
    const effect = { type: "teleport", target: rawEffect.target };
    if (rawEffect.x !== undefined) effect.x = rawEffect.x;
    if (rawEffect.side !== undefined) effect.side = rawEffect.side;
    if (rawEffect.reloadIfSame !== undefined) effect.reloadIfSame = rawEffect.reloadIfSame;
    if (rawEffect.transition !== undefined) effect.transition = rawEffect.transition;
    if (rawEffect.holdForSound) effect.holdForSound = true;
    return effect;
  }
  fail(`${describe}.type "${type}" inconnu (attendu : ${ACTION_EFFECT_TYPES.map((t) => `"${t}"`).join(" | ")}).`);
}

// Un TRIGGER (voir core/triggers.js, doc/scripting.md/"Triggers") :
// { on: "hour", hour?: 0..23, effects } ou
// { on: "emote", emote?, range?, effects }.
// `effects` : MÊME vocabulaire et MÊME validation qu'une action
// (parseActionEffect ci-dessus), SAUF les effets MIXTES (teleport) — un
// déplacement du JOUEUR déclenché par l'horloge n'a pas de sens, refusé au
// chargement plutôt que silencieusement ignoré. Un trigger sans effet
// échoue, comme une règle muette (voir parsePresenceRule). Un champ propre
// à un AUTRE kind (`hour` sur un trigger d'émote...) échoue aussi.
// `condition` (tous kinds, facultative) : même condition que partout
// ailleurs, le trigger ne répond que si elle est vraie (évaluée sur l'état
// d'AVANT le déclenchement, voir core/triggers.js).
const TRIGGER_FIELDS = ["on", "hour", "emote", "range", "condition", "effects"];
const TRIGGER_KIND_FIELDS = { hour: ["hour"], emote: ["emote", "range"] };

export function parseTrigger(rawTrigger, describe, entityVariables, sceneVariables) {
  if (typeof rawTrigger !== "object" || rawTrigger === null || Array.isArray(rawTrigger)) {
    fail(`${describe} n'est pas un objet.`);
  }
  // Clé inconnue -> échec : un réglage posé au mauvais niveau (ex. `gain`
  // sur le trigger au lieu de son effet playSound) serait sinon ignoré en
  // silence.
  const unknown = Object.keys(rawTrigger).find((key) => !TRIGGER_FIELDS.includes(key));
  if (unknown !== undefined) {
    fail(`${describe}.${unknown} inconnu (attendu : ${TRIGGER_FIELDS.map((k) => `"${k}"`).join(" | ")}).`);
  }
  if (!TRIGGER_KINDS.includes(rawTrigger.on)) {
    fail(`${describe}.on "${rawTrigger.on}" inconnu (attendu : ${TRIGGER_KINDS.map((k) => `"${k}"`).join(" | ")}).`);
  }
  const foreign = Object.entries(TRIGGER_KIND_FIELDS)
    .filter(([kind]) => kind !== rawTrigger.on)
    .flatMap(([, fields]) => fields)
    .find((field) => rawTrigger[field] !== undefined);
  if (foreign !== undefined) {
    fail(`${describe}.${foreign} n'a pas de sens sur un trigger "${rawTrigger.on}".`);
  }
  // Émote : `emote` absent = toutes les émotes. `range` (nombre > 0) ne
  // peut que RACCOURCIR la portée de l'émote nommée : plus long, ce serait
  // une portée jamais atteinte, donc une erreur de contenu. Sans `emote`,
  // la borne s'applique au moment de l'émote (core/triggers.js/
  // emoteTriggerRange).
  if (rawTrigger.emote !== undefined && !Object.hasOwn(EMOTE_REGISTRY, rawTrigger.emote)) {
    fail(`${describe}.emote "${rawTrigger.emote}" absente du registre (core/emotes.js).`);
  }
  if (rawTrigger.range !== undefined) {
    if (!isFiniteNumber(rawTrigger.range) || rawTrigger.range <= 0) {
      fail(`${describe}.range doit être un nombre > 0 si présent.`);
    }
    const emote = rawTrigger.emote !== undefined ? EMOTE_REGISTRY[rawTrigger.emote] : undefined;
    if (emote && rawTrigger.range > emote.range) {
      fail(`${describe}.range ${rawTrigger.range} dépasse la portée de l'émote "${rawTrigger.emote}" (${emote.range}).`);
    }
  }
  if (
    rawTrigger.hour !== undefined &&
    (!Number.isInteger(rawTrigger.hour) || rawTrigger.hour < 0 || rawTrigger.hour >= TIME_CONFIG.hoursPerDay)
  ) {
    fail(`${describe}.hour doit être un entier entre 0 et ${TIME_CONFIG.hoursPerDay - 1} si présent.`);
  }
  if (rawTrigger.condition !== undefined) {
    validateCondition(rawTrigger.condition, `${describe}.condition`, entityVariables, sceneVariables);
  }
  if (!Array.isArray(rawTrigger.effects) || rawTrigger.effects.length === 0) {
    fail(`${describe}.effects doit être un tableau non vide.`);
  }
  const effects = rawTrigger.effects.map((effect, i) =>
    parseActionEffect(effect, `${describe}.effects[${i}]`, entityVariables, sceneVariables)
  );
  validateSequence(effects, `${describe}.effects`);
  const mixed = effects.find((effect) => MIXED_EFFECT_TYPES.includes(effect.type));
  if (mixed) {
    fail(`${describe}.effects : "${mixed.type}" (effet mixte, joueur) n'est pas admis sur un trigger.`);
  }
  const trigger = { on: rawTrigger.on, effects };
  if (rawTrigger.hour !== undefined) trigger.hour = rawTrigger.hour;
  if (rawTrigger.emote !== undefined) trigger.emote = rawTrigger.emote;
  if (rawTrigger.range !== undefined) trigger.range = rawTrigger.range;
  if (rawTrigger.condition !== undefined) trigger.condition = rawTrigger.condition;
  return trigger;
}

// Comparateurs reconnus par la condition "variable" (voir plus bas) — un
// SEUL par condition, "equals" valant pour flag ET int, les quatre autres
// réservés aux int (voir la vérification de cohérence plus bas).
const VARIABLE_COMPARATORS = ["equals", "greaterThan", "lessThan", "greaterOrEqual", "lessOrEqual"];

// Valeur d'une variable, ou d'un comparateur, contre son type. Type inconnu
// au chargement (portée "party", voir validateVariableReference) : on ne
// peut pas la comparer à SON type, mais elle doit au moins être une valeur
// possible d'une variable (jamais absente, jamais une chaîne).
function isValidVariableValue(knownType, value) {
  if (knownType) return isValidValueForType(knownType, value);
  return VARIABLE_TYPES.some((type) => isValidValueForType(type, value));
}

function describeVariableType(knownType) {
  return knownType ? `le type "${knownType}"` : `une variable (${VARIABLE_TYPES.join(" | ")})`;
}

// Valide un objet CONDITION ({ type, ... }) — RÉUTILISÉ par presence[].when
// (voir parsePresenceRule) ET action.condition (voir parseSingleAction, actions
// CONDITIONNELLES) : MÊME forme déclarative, MÊME registre (CONDITION_TYPES),
// MÊME validation — une condition ne sait pas d'où elle est appelée, jamais
// dupliquée entre les deux. `describe` : préfixe du message d'erreur (ex.
// `presence[0].when` ou `action.condition`), pour situer l'échec sans
// dupliquer cette fonction par appelant. `entityVariables`/`sceneVariables` :
// les sacs déjà résolus des portées "entity"/"scene" du PORTEUR courant
// (voir validateVariableReference plus bas) — UNIQUEMENT nécessaires pour
// valider une condition "variable", `undefined` sans effet sur tout autre
// type de condition.
export function validateCondition(cond, describe, entityVariables, sceneVariables) {
  if (typeof cond !== "object" || cond === null || !isNonEmptyString(cond.type)) {
    fail(`${describe} doit être un objet avec un type.`);
  }
  if (!CONDITION_TYPES.includes(cond.type)) {
    fail(`${describe}.type "${cond.type}" absent du registre de conditions.`);
  }
  rejectUnknownFields(cond, ["type", ...conditionFields(cond.type)], describe);
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
  // "knowsEmote" : même traitement, contre le registre des émotes
  // (core/emotes.js/EMOTE_REGISTRY).
  if (cond.type === "knowsEmote" && (!isNonEmptyString(cond.id) || !EMOTE_REGISTRY[cond.id])) {
    fail(`${describe}.id "${cond.id}" absent du registre d'émotes.`);
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
  // "timeRange" : bornes en heures (fractionnaires) dans [0, hoursPerDay] —
  // la borne haute est permise (0..24 couvre toute la journée) ; from ===
  // to serait une fenêtre vide, jamais vraie. `spread` (minutes) optionnel,
  // >= 0. Une faute (ex. "20" en chaîne) rendrait sinon la règle toujours
  // fausse sans que rien ne le signale (core/presence.js/evaluateTimeRange).
  if (cond.type === "timeRange") {
    for (const bound of ["from", "to"]) {
      const hour = cond[bound];
      if (!isFiniteNumber(hour) || hour < 0 || hour > TIME_CONFIG.hoursPerDay) {
        fail(`${describe}.${bound} doit être une heure entre 0 et ${TIME_CONFIG.hoursPerDay} (reçu : ${JSON.stringify(hour)}).`);
      }
    }
    if (cond.from === cond.to) {
      fail(`${describe} : from et to égaux (${cond.from}), la plage serait vide.`);
    }
    if (cond.spread !== undefined && (!isFiniteNumber(cond.spread) || cond.spread < 0)) {
      fail(`${describe}.spread doit être un nombre de minutes >= 0 si présent (reçu : ${JSON.stringify(cond.spread)}).`);
    }
  }
  // "allOf"/"anyOf" : composites — leur champ `conditions` doit être un
  // tableau NON VIDE, chaque élément revalidé RÉCURSIVEMENT par cette même
  // fonction (une sous-condition peut être de n'importe quel type du
  // registre, y compris un autre composite imbriqué) — jamais un second
  // chemin de validation, voir doc/scripting.md.
  if (cond.type === "allOf" || cond.type === "anyOf") {
    if (!Array.isArray(cond.conditions) || cond.conditions.length === 0) {
      fail(`${describe}.conditions doit être un tableau non vide pour "${cond.type}".`);
    }
    cond.conditions.forEach((subCond, i) =>
      validateCondition(subCond, `${describe}.conditions[${i}]`, entityVariables, sceneVariables)
    );
  }
  // "not" : composite — son champ `condition` est OBLIGATOIRE (un objet,
  // jamais un tableau), revalidé RÉCURSIVEMENT par cette même fonction,
  // comme les éléments d'un allOf.
  if (cond.type === "not") {
    if (typeof cond.condition !== "object" || cond.condition === null || Array.isArray(cond.condition)) {
      fail(`${describe}.condition doit être un objet condition pour "not".`);
    }
    validateCondition(cond.condition, `${describe}.condition`, entityVariables, sceneVariables);
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
    if (knownType && comparator !== "equals" && knownType !== "int") {
      fail(`${describe} : comparateur "${comparator}" invalide sur une variable "flag" (seul "equals" est permis).`);
    }
    // Comparateur d'ordre : toujours un entier, type connu ou non.
    const expectedType = comparator === "equals" ? knownType : "int";
    if (!isValidVariableValue(expectedType, cond[comparator])) {
      fail(`${describe}.${comparator} invalide pour ${describeVariableType(expectedType)} (reçu : ${JSON.stringify(cond[comparator])}).`);
    }
  }
}

// Une règle de presence[] : { when: { type, ... }, effects: [<effet>...] }.
// `when` est reporté TEL QUEL (transport générique, comme `tuning` plus
// bas) — son évaluateur (core/presence.js) gère seul ses propres champs, y
// compris leur absence/malformation (repli défensif -> false). RACCOURCI
// pour la présence seule : `{ when, present: boolean }` sans `effects`, normalisé ICI en forme
// canonique `{ when, effects: [{ type: "presence", present }] }` — tout
// consommateur d'une entité PARSÉE (vue, sauvegarde...) ne voit plus qu'une
// seule forme, jamais les deux. Une règle sans AUCUN effet ne sert à rien
// (échec clair plutôt qu'une règle muette qu'on croirait active) : l'un des
// deux (`effects` ou `present`) est requis.
export function parsePresenceRule(rawRule, ruleIndex, index, id, entityVariables, sceneVariables) {
  if (typeof rawRule !== "object" || rawRule === null) {
    fail(`entities[${index}] ("${id}") : presence[${ruleIndex}] n'est pas un objet.`);
  }
  rejectUnknownFields(rawRule, ["when", "present", "effects"], `entities[${index}] ("${id}") : presence[${ruleIndex}]`);
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
// core/entity-parse.js/parseEntityAction) : la forme d'une candidate ne dépend jamais du nombre de
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
// (ex. entities/types/glass-window.js, dont les deux candidates couvrent tout
// l'espace de leur variable — aucun refus n'est jamais réellement possible,
// en déclarer un serait du code mort). RECOMMANDÉE dès que l'échec
// laisserait le joueur sans aucun retour (ex. porte à dresscode/horaires) —
// c'est une RESPONSABILITÉ DE CONTENU, pas une contrainte du validateur
// (voir doc/scripting.md/"Conditions d'action"). Absente ->
// l'action ne s'exécute simplement pas si la condition échoue, SANS effet
// (ni son ni annonce) ; PRÉSENTE, elle reste validée comme n'importe quelle
// liste d'effets (tableau NON VIDE, MÊME vocabulaire qu'`effects`) — un
// champ déclaré s'engage à servir à quelque chose, jamais un tableau vide
// laissé en trace. Aucun son de refus GÉNÉRIQUE imposé ici : une action qui
// ne veut QU'annoncer son refus déclare `[{ type: "announce", ... }]`, sans
// playSound — c'est un choix de CONTENU, jamais une valeur par défaut du
// système.
// `kindContext` : { registry, length } de l'entité porteuse, pour la
// validation propre au kind (voir core/action-kinds.js).
export function parseSingleAction(rawAction, describe, entityVariables, sceneVariables, kindContext) {
  if (typeof rawAction !== "object" || rawAction === null || Array.isArray(rawAction)) {
    fail(`${describe} doit être un objet.`);
  }
  if (!isNonEmptyString(rawAction.kind)) {
    fail(`${describe}.kind doit être une chaîne non vide.`);
  }
  validateActionKind(rawAction, describe, kindContext, fail);
  if (rawAction.condition !== undefined) {
    validateCondition(rawAction.condition, `${describe}.condition`, entityVariables, sceneVariables);
  }
  // `confirm` : la vue demande confirmation au joueur AVANT tout effet (voir
  // view/interaction.js/interact, doc/scripting.md/"Confirmation d'une
  // action"). La question nomme la DESTINATION, donc l'action doit
  // téléporter : un seul "teleport" dans ses effets, sinon la question
  // n'aurait rien à nommer. `false` équivaut à l'absence du champ.
  if (rawAction.confirm !== undefined) {
    if (typeof rawAction.confirm !== "boolean") {
      fail(`${describe}.confirm doit être un booléen si présent.`);
    }
    const teleports = Array.isArray(rawAction.effects) ? rawAction.effects.filter((effect) => effect && effect.type === "teleport") : [];
    if (rawAction.confirm && teleports.length !== 1) {
      fail(`${describe}.confirm demande exactement un effet "teleport" dans effects (la question nomme la destination).`);
    }
  }
  const result = { ...rawAction };
  if (rawAction.effects !== undefined) {
    if (!Array.isArray(rawAction.effects) || rawAction.effects.length === 0) {
      fail(`${describe}.effects doit être un tableau non vide si présent.`);
    }
    result.effects = rawAction.effects.map((effect, i) =>
      parseActionEffect(effect, `${describe}.effects[${i}]`, entityVariables, sceneVariables)
    );
    validateSequence(result.effects, `${describe}.effects`);
  }
  if (rawAction.refusalEffects !== undefined) {
    if (!Array.isArray(rawAction.refusalEffects) || rawAction.refusalEffects.length === 0) {
      fail(`${describe}.refusalEffects doit être un tableau non vide si présent.`);
    }
    result.refusalEffects = rawAction.refusalEffects.map((effect, i) =>
      parseActionEffect(effect, `${describe}.refusalEffects[${i}]`, entityVariables, sceneVariables)
    );
    validateSequence(result.refusalEffects, `${describe}.refusalEffects`);
  }
  return result;
}

// Place des `wait` dans une liste d'effets (voir core/sequence.js) :
//   - jamais en DERNIER : il n'attendrait rien, sûrement un oubli ;
//   - aucun effet MIXTE (teleport) APRÈS un `wait` : le sas et le fondu se
//     jouent à l'activation, pas au détour d'un tick. Pas encore de besoin
//     d'une téléportation différée ; refusée plutôt que mal jouée.
// Et un teleport `holdForSound` suit au moins un playSound de la même liste
// : c'est la fin de ce son de départ que le sas attend.
function validateSequence(effects, describe) {
  if (effects.length > 0 && effects[effects.length - 1].type === "wait") {
    fail(`${describe} : un "wait" en dernier n'attend rien.`);
  }
  const holding = effects.findIndex((effect) => effect.type === "teleport" && effect.holdForSound);
  if (holding >= 0 && !effects.slice(0, holding).some((effect) => effect.type === "playSound")) {
    fail(`${describe} : "teleport" holdForSound demande un "playSound" avant lui (le son de départ à attendre).`);
  }
  const firstWait = effects.findIndex((effect) => effect.type === "wait");
  if (firstWait < 0) return;
  const lateMixed = effects.slice(firstWait).find((effect) => MIXED_EFFECT_TYPES.includes(effect.type));
  if (lateMixed) {
    fail(`${describe} : "${lateMixed.type}" (effet mixte) n'est pas admis après un "wait".`);
  }
}
