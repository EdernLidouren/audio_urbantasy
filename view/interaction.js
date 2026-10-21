// Interaction avec une entité de la scène ville. Déclenchée par des touches
// DISCRÈTES (Espace/Entrée, voir city-screen.js) — pas de maintien, donc
// aucun souci d'auto-interruption NVDA ici (contrairement au mouvement en
// touche tenue, voir CLAUDE.md). Vue + contenu : aucune RÈGLE de jeu propre
// ici (le core reste la seule source de vérité), mais réutilise l'évaluateur
// de conditions pur du core (evaluateCondition, voir actionConditionMet plus
// bas) pour les actions conditionnelles — même principe d'import que
// view/audio/entity-sound-entry.js/isPresent.

import { announce } from "../lib/announce.js";
import { t } from "../data/i18n/index.js";
import { pushScreen, popScreen, composeHook } from "../lib/screens.js";
import { makeMenuScreen } from "../lib/menu.js";
import { playDescribedOneShot } from "../lib/audio.js";
import { resolveAsset } from "../lib/assets.js";
import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";
import { evaluateCondition, selectMatchingAction } from "../core/presence.js";
import { resolveDescriptionText } from "./description-resolver.js";
import { resolveTuning } from "../config/tuning.js";

// Gestionnaires enregistrés UNE FOIS par view/city-screen.js, au moment de
// sa construction — au plus un écran ville vivant à la fois dans cette
// appli (même principe que activeScene, voir view/audio/city-scene.js).
// Permettent à interact() de déclencher un effet qui touche session/scene
// SANS les connaître : il délègue à qui les possède (ce fichier n'importe
// jamais le core, voir le header).
let teleportHandler = null;
let pickupHandler = null;
let itemPickupHandler = null;
let lootHandler = null;
let lootUniqueHandler = null;
let lootSpawnHandler = null;
let sideSwitchHandler = null;
let variableEffectsHandler = null;
let searchHandler = null;
let shopHandler = null;

// (effect) => void — exécute l'effet MIXTE "teleport" (voir core/effects.js,
// core/scripting.md/"Effets d'action") : une PORTE n'est plus un cas
// spécial, juste une action dont `effects` contient CET effet (voir
// runEffects plus bas) — le gestionnaire (view/city-screen.js) est le
// SEUL chemin de téléportation JOUEUR, qu'il soit déclenché par une porte
// ou par n'importe quel autre effet. Asynchrone (sas + fondu, voir
// view/city-screen.js), mais JAMAIS attendu ici (comme l'ancien
// doorTransitionHandler qu'il remplace) : le gestionnaire gère seul son
// propre séquençage.
export function setTeleportHandler(handler) {
  teleportHandler = handler;
}

// (arrivalX, entity) => Promise<void> — bascule la face courante via un SAS
// animé (croisement des filtres d'occlusion, pas de TRAJET/ARRIVÉE PUIS
// reconstruction de la scène audio, voir view/city-screen.js/
// sideSwitchEffect ; core/state.js/switchSide ; entities/types/passage.js),
// même patron que setTeleportHandler ci-dessus — PAS un travelToWorld, on
// reste dans le même monde. Asynchrone comme teleportHandler, mais
// handleSwitchSide ne l'attend pas : le gestionnaire gère seul son propre
// sas. `entity` : LE PASSAGE lui-même — transmis tel quel (jamais relu ici,
// ce fichier ignore tout du son) pour que le gestionnaire puisse résoudre
// SES flags (transitionSteps/transitionSurface, cascade instance ->
// archétype -> défaut, voir config/tuning-values.js), exactement comme un
// effet playSound diégétique reçoit l'entité porteuse (voir
// runPlaySoundEffect plus haut).
export function setSideSwitchHandler(handler) {
  sideSwitchHandler = handler;
}

// (entity, amount) => void — applique l'effet d'ÉTAT du ramassage (argent +
// retrait de l'entité, voir core/money.js/pickupEntity), fourni par
// city-screen.js qui seul détient getSession/setSession. Ce fichier ne fait
// qu'appeler ce qu'on lui a donné, puis gère le retour sensoriel (son,
// annonce) — jamais l'inverse. `amount` : DÉJÀ EXTRAIT de l'action RÉSOLUE
// par handlePickup (voir plus bas) — jamais entity.action.amount relu ici
// ou par l'appelant, qui ne doit rien savoir de la forme (objet unique ou
// candidate choisie dans un tableau, voir core/scripting.md/"Actions
// multiples filtrées par condition").
export function setPickupHandler(handler) {
  pickupHandler = handler;
}

// (entity, item, count) => void — applique l'effet d'ÉTAT du ramassage vers
// le SAC (objet + retrait de l'entité, voir core/bag.js/pickupItemEntity ;
// doc/entity-model.md/"Sac d'objets"), même patron que setPickupHandler
// ci-dessus mais DISTINCT : pickupHandler écrit dans session.money,
// itemPickupHandler dans session.bag — même verbe ("pickup"), effet choisi
// selon la FORME de l'action (voir handlePickup).
export function setItemPickupHandler(handler) {
  itemPickupHandler = handler;
}

// (entity, amount) => void — applique l'effet d'ÉTAT du "loot" (argent +
// entity.consumed, voir core/money.js/lootEntity ; entités/model.md/
// "Collectible persistant"), même patron que setPickupHandler ci-dessus
// (`amount` déjà extrait, même raison). Distinct de pickupHandler : l'entité
// looté N'EST JAMAIS retirée, seul son état change.
export function setLootHandler(handler) {
  lootHandler = handler;
}

// (entity) => void — applique l'effet d'ÉTAT du "loot" OBJET UNIQUE (ni
// montant ni éparpillement : entity.consumed seul, voir
// core/money.js/lootUniqueEntity). La substance de cet objet est dans les
// effets de l'action (ex. giveImprovement), exécutés avant, comme pour
// tout kind.
export function setLootUniqueHandler(handler) {
  lootUniqueHandler = handler;
}

// (entity, spawn) => void — applique l'effet d'ÉTAT du "loot à spawn"
// (entity.consumed + N entités éphémères éparpillées, voir
// core/money.js/lootEntitySpawn ; doc/entity-model.md/"Entités éphémères"),
// même patron que setLootHandler ci-dessus — variante déclarée via
// action.spawn plutôt qu'action.amount (voir handleLoot).
export function setLootSpawnHandler(handler) {
  lootSpawnHandler = handler;
}

// (entity, effects) => void — applique une LISTE d'effets D'ÉCRITURE de
// variable (setVariable/toggleVariable/addVariable, voir core/scene.js/
// parseActionEffect, core/variables.js/applyActionEffects), fournie par
// city-screen.js qui seul détient getSession/setSession — même patron que
// setPickupHandler ci-dessus. Utilisé par le kind "applyEffects" (voir
// handleApplyEffects plus bas), le premier kind GÉNÉRIQUE de cet aiguillage
// (aucun état "métier" propre, contrairement à transit/pickup/loot/
// switchSide) : sa SEULE substance est la liste d'effets déclarée par le
// contenu.
export function setVariableEffectsHandler(handler) {
  variableEffectsHandler = handler;
}

// (entity) => { status, count } — applique l'effet d'ÉTAT de la FOUILLE d'un conteneur
// de collecte (voir core/spawn.js/searchContainer, doc/entity-model.md/
// "Collecte"), même patron que setLootSpawnHandler : le stock TOMBE au sol
// en éphémères éparpillés. Renvoie { status, count } (état du conteneur
// avant la fouille, nombre d'objets tombés) — le retour sensoriel (annonce)
// reste ici, voir handleSearch.
export function setSearchHandler(handler) {
  searchHandler = handler;
}

// (entity) => void — ouvre le menu du POINT DE VENTE (voir view/menus/
// shop-menu.js/openShopMenu), fourni par city-screen.js qui seul détient
// scene/getSession — même patron que les gestionnaires ci-dessus. Aucun
// effet d'état ici : la transaction, elle, passe par le gestionnaire de
// vente injecté dans shop-menu.js.
export function setShopHandler(handler) {
  shopHandler = handler;
}

// () => equipment — fournit l'ÉQUIPEMENT DU JOUEUR pour l'évaluation d'une
// condition d'action (voir actionConditionMet plus bas), même principe
// d'injection que les gestionnaires ci-dessus. TOUJOURS l'équipement du
// JOUEUR : c'est lui qui DÉCLENCHE l'action, jamais l'entité-cible
// (une porte n'a pas d'équipement) — contrairement à
// core/presence.js/context.entity, qui porte l'entité RÉGIE par SA PROPRE
// règle de présence.
let playerEquipmentProvider = null;

export function setPlayerEquipmentProvider(provider) {
  playerEquipmentProvider = provider;
}

// () => session.time — fournit L'HEURE DE PARTIE pour l'évaluation d'une
// condition d'action (voir actionConditionMet plus bas), même principe
// d'injection que playerEquipmentProvider ci-dessus. Sans ce provider,
// context.time reste undefined et une condition "timeRange" sur
// action.condition est STRUCTURELLEMENT toujours fausse (voir
// core/presence.js/evaluateTimeRange, hourOfDayFraction(undefined)) — c'est
// ce que ce provider corrige, sans changer l'évaluateur lui-même (déjà
// partagé avec presence[].when, voir core/scripting.md/"Conditions d'action").
let timeProvider = null;

export function setTimeProvider(provider) {
  timeProvider = provider;
}

// () => session — fournit LA SESSION COMPLÈTE pour l'évaluation d'une
// condition d'action (voir actionContext plus bas), même principe
// d'injection que playerEquipmentProvider/timeProvider ci-dessus. Corrige un
// trou identifié par l'audit de santé (Finding 1) : sans ce provider,
// perceptionActive/weather/world/session restent undefined dans le contexte
// d'action, et hasImprovement/weather/perceptionActive/variable scope
// "scene"/"party" y sont STRUCTURELLEMENT toujours fausses (voir
// core/presence.js) — même si le joueur possède réellement ce qui est
// demandé. Un OUBLI, pas un choix d'architecture : rien n'empêchait de
// suivre le MÊME patron d'injection que playerEquipment/time dès le départ
// (voir "AVANT ce provider" dans actionContext ci-dessous). L'évaluateur
// reste un PUR consommateur de données (core/presence.js/evaluateCondition,
// core/variables.js) — lui passer une référence à `session` ne lui donne
// aucun moyen de MUTER l'état ni de toucher DOM/audio, la frontière core/vue
// tient : ce fichier lit `session` pour construire un contexte, il ne
// l'écrit jamais (toute écriture reste déléguée aux handlers enregistrés
// plus haut, qui seuls détiennent setSession).
let sessionProvider = null;

export function setSessionProvider(provider) {
  sessionProvider = provider;
}

// (entityId, descriptor) => joue un one-shot POSITIONNÉ + FILTRÉ sur
// l'entité `entityId`, exactement comme un beacon/vocal à cet instant (voir
// view/audio/oneshots.js/playEntityOneShot, câblé par view/city-screen.js)
// — fournit le rendu DIÉGÉTIQUE de l'effet "playSound" (voir
// playDescribedSound plus bas pour le rendu MÉTA, non positionné). Même
// principe d'injection que playerEquipmentProvider/timeProvider : ce fichier
// ne connaît toujours ni la scène ni sa chaîne de filtrage, seulement CE
// point d'entrée. Sans provider (hors ville, scène pas encore montée) ->
// repli défensif sur le rendu MÉTA, voir runEffects plus bas.
let positionedSoundPlayer = null;

export function setPositionedSoundPlayer(provider) {
  positionedSoundPlayer = provider;
}

// Son de RAMASSAGE : rôle `sounds.pickup` DÉCLARÉ par l'archétype de l'objet
// (cascade instance -> archétype par fusion, comme tout rôle de `sounds` —
// voir doc/entity-model.md/"Vocabulaire de sons"), SANS défaut : un objet
// sans ce rôle est ramassé en silence (l'annonce suffit). Plus aucun son
// générique imposé ("tout son est déclaré, jamais imposé"). Rendu DIÉGÉTIQUE
// via le même chemin qu'un effet "playSound" (runPlaySoundEffect plus bas :
// positionné sur l'entité, soumis aux filtres de scène) — à appeler AVANT
// l'effet d'état qui retire l'entité, tant qu'elle a encore une voix dans
// la scène.
function playEntityPickupSound(entity) {
  const descriptor = entity.sounds && entity.sounds.pickup;
  if (!descriptor) return;
  runPlaySoundEffect(entity, descriptor);
}

// Effet "playSound" (voir core/effects.js, core/scripting.md/"Effets
// d'action") — DEUX NATURES DE RENDU, jamais un troisième mécanisme :
//
// MÉTA (ce que ce fichier savait déjà faire) : son CENTRÉ, NON positionné,
// IGNORE tout filtre actif — le descripteur partagé { path, gain?,
// pitchVariation?, reverbSend? } joué via playDescribedOneShot
// (lib/audio.js), composé avec `interfaceVolume` comme tout son d'UI/
// interaction du projet (view/menu-sounds.js). Aucun bus de réverb
// accessible depuis ce fichier (voir header, "vue + contenu") : reverbSend
// reste donc sans effet en pratique ici.
//
// DIÉGÉTIQUE (nouveau) : son POSITIONNÉ sur une entité de la scène, soumis
// aux MÊMES filtres actifs qu'un beacon/vocal à cet instant (occlusion
// RECTO/VERSO, étouffement de perception, distance) — délégué ENTIÈREMENT à
// positionedSoundPlayer (voir plus haut, view/audio/oneshots.js/
// playEntityOneShot) : AUCUNE logique de filtrage dupliquée ici, ce fichier
// ne fait que router vers la BONNE primitive.
//
// PROVENANCE (résout la cible, voir resolvePlaySoundTarget ci-dessous) et
// NATURE (résout diégétique/méta, voir resolvePlaySoundNature ci-dessous)
// sont calculées séparément, puis composées ICI. PLUS de son de refus
// GÉNÉRIQUE en dur (ancien REFUSAL_SOUND_KEY) : un effet "playSound" est un
// CHOIX DE CONTENU explicite (voir refusalEffects, actionConditionMet plus
// bas), jamais une valeur par défaut du système. Défensif comme tout son du
// projet : fichier absent -> avertit, ne plante jamais.

// `effect.at` (optionnel, id d'entité) : PROVENANCE explicite — le son émane
// de LA POSITION de CETTE entité, pas forcément celle qui porte l'action
// (ex. un effet sur une porte qui fait sonner une AUTRE entité, plus loin).
// Non précisé, DANS le contexte d'une action d'entité (`entity` fourni) ->
// l'entité PORTEUSE elle-même (cas courant : la fenêtre grince à SA
// position, aucune déclaration nécessaire). Non précisé, HORS contexte
// d'entité (`entity` absent — futur effet global/trigger de partie) ->
// `undefined`, résolu ensuite en CENTRÉ JOUEUR par resolvePlaySoundNature.
function resolvePlaySoundTarget(entity, effect) {
  if (effect.at !== undefined) return effect.at;
  return entity ? entity.id : undefined;
}

// `effect.nature` (optionnel, "diegetic" | "meta") : SURCHARGE explicite,
// pour les cas exotiques (un son positionné qu'on veut méta, ou l'inverse).
// Non précisée -> DÉRIVÉE de la PROVENANCE (resolvePlaySoundTarget) : une
// cible résolue -> diégétique (positionné, filtré) ; aucune cible (centré
// joueur) -> méta (non filtré) — dans le cas courant, on ne déclare NI `at`
// NI `nature`, les deux tombent du contexte.
function resolvePlaySoundNature(effect, targetId) {
  if (effect.nature !== undefined) return effect.nature;
  return targetId !== undefined ? "diegetic" : "meta";
}

function playMetaSound(descriptor) {
  try {
    const factor = getPref("interfaceVolume", PREF_CONSTRAINTS.interfaceVolume.default) / 100;
    playDescribedOneShot(resolveAsset(descriptor.path), {
      gain: descriptor.gain,
      pitchVariation: descriptor.pitchVariation,
      reverbSend: descriptor.reverbSend,
      volumeFactor: factor,
    });
  } catch (error) {
    console.warn(`interact: son d'effet indisponible ("${descriptor.path}") : ${error.message}`);
  }
}

// `options.departing` : voir runEffects — transmis tel quel au lecteur
// positionné (view/audio/oneshots.js/playEntityOneShot).
function runPlaySoundEffect(entity, effect, options = {}) {
  const targetId = resolvePlaySoundTarget(entity, effect);
  const nature = resolvePlaySoundNature(effect, targetId);
  // Diégétique sans cible résolvable (ex. nature forcée sans `at` ni
  // contexte d'entité) ou sans provider câblé (hors ville) -> repli MÉTA,
  // défensif, jamais un plantage ni un son perdu en silence.
  if (nature === "diegetic" && targetId !== undefined && positionedSoundPlayer) {
    positionedSoundPlayer(targetId, effect, options);
    return;
  }
  playMetaSound(effect);
}

// Exécute une LISTE d'effets (voir core/effects.js pour la partition
// core/vue, core/scripting.md/"Effets") — `action.effects` (condition
// RÉUSSIT) ou `action.refusalEffects` (condition ÉCHOUE, voir
// actionConditionMet plus bas), MÊME fonction pour les deux, MÊME
// vocabulaire. ROUTAGE : les effets d'ÉTAT (setVariable/toggleVariable/
// addVariable) sont délégués EN UN SEUL APPEL à variableEffectsHandler (le
// gestionnaire enregistré par view/city-screen.js, seul à détenir
// getSession/setSession — voir son commentaire plus haut) — no-op silencieux
// sur un tableau qui n'en contient aucun (core/variables.js/
// applyActionEffects ignore déjà tout type qu'il ne reconnaît pas). Les
// effets de RENDU (playSound/announce) et l'effet MIXTE (teleport, voir
// core/effects.js) sont ensuite REJOUÉS ICI, DANS L'ORDRE DÉCLARÉ — l'ordre
// relatif entre un effet d'état (invisible/inaudible au moment où il
// s'applique) et un effet de rendu/mixte n'a donc aucune importance
// observable, SEUL l'ordre ENTRE effets de rendu/mixtes compte (ex. le son
// AVANT l'annonce de confirmation, voir "Effets" plus haut) — un
// "teleport" typiquement DERNIER de sa liste (le sas gèle le jeu, tout
// effet déclaré APRÈS lui dans la MÊME liste s'exécuterait quand même,
// avant que le sas ne commence, puisque teleportHandler n'est jamais
// attendu ici).
//
// SON DE DÉPART : une liste qui contient un "teleport" décrit l'acte de
// PARTIR — ses playSound (ex. le grincement de la porte) sont joués
// `departing` : positionnés, mais hors du fondu du sas (voir
// view/audio/oneshots.js/playEntityOneShot), pour finir de résonner
// pendant la transition au lieu d'être coupés.
function runEffects(entity, effects) {
  if (!effects) return;
  if (variableEffectsHandler) variableEffectsHandler(entity, effects);
  const departing = effects.some((effect) => effect.type === "teleport");
  for (const effect of effects) {
    if (effect.type === "teleport") {
      if (teleportHandler) teleportHandler(effect);
    } else {
      runRenderEffects(entity, [effect], { departing });
    }
  }
}

// Effets de RENDU seuls (playSound/announce, voir core/effects.js/
// RENDER_EFFECT_TYPES), dans l'ordre déclaré — les autres types traversent
// sans effet. Exporté pour les triggers horaires (view/city-screen.js/
// advanceClock) : le core a DÉJÀ appliqué leurs effets d'état
// (core/triggers.js/applyDueTriggers), seul le rendu reste à jouer ici,
// avec la même provenance (l'entité porteuse) qu'un effet d'action.
export function runRenderEffects(entity, effects, options = {}) {
  for (const effect of effects) {
    if (effect.type === "playSound") {
      runPlaySoundEffect(entity, effect, options);
    } else if (effect.type === "announce") {
      announce(t(effect.key), { assertive: effect.assertive !== false });
    }
  }
}

// Description RICHE d'une entité (interaction "describe"), distincte du nom
// annoncé à l'approche (occupation, voir view/occupancy.js).
// INDIRECTION délibérée plutôt qu'un accès direct à descriptionKey : la clé
// choisie est résolue par description-resolver.js/resolveDescriptionText,
// PAS un accès direct à t(key) — DYNAMIQUE désormais (gabarit i18n rempli du
// CONTEXTE courant, voir son en-tête), recalculée à CHAQUE appel, jamais
// stockée. Contexte = EXACTEMENT actionContext(entity) (voir plus bas) —
// MÊME source que l'évaluation de condition, aucune seconde forme de
// contexte à maintenir. undefined si l'entité n'a rien à décrire (ex.
// descriptionKey absent malgré observable:true) — le filtrage par capacité
// (getInteractionCandidates) évite déjà ce cas en pratique, ce repli reste
// défensif.
//
// consumedDescriptionKey (voir core/scene.js, doc/entity-model.md/
// "Collectible persistant") : description ALTERNATIVE une fois
// entity.consumed — effet POST-ACTIVATION "changer d'état perceptible"
// d'un collectible persistant (core/money.js/lootEntity), déclaré par
// l'entité elle-même, jamais un cas spécial câblé ici. Absente -> repli sur
// descriptionKey normal (une entité consommée sans description alternative
// déclarée garde simplement la même description qu'avant). Cette clé PEUT
// elle aussi porter un gabarit, comme n'importe quelle descriptionKey.
function resolveDescription(entity) {
  const key = entity.consumed && entity.consumedDescriptionKey ? entity.consumedDescriptionKey : entity.descriptionKey;
  if (!key) return undefined;
  return resolveDescriptionText(key, actionContext(entity));
}

// Aiguillage par TYPE D'ACTION (entity.action.kind, voir core/scene.js) —
// même principe que core/presence.js/CONDITION_EVALUATORS : SEUL endroit
// qui connaît les kinds. Ajouter "talk"/"activate" demain = une entrée de
// plus ici, jamais une refonte d'interact() ni de ses appelants (le core,
// lui, ne valide QUE la forme de `action` — voir son commentaire — jamais
// le kind contre ce registre, qui reste entièrement côté vue).

// "switchSide" (point de passage recto<->verso, voir entities/types/
// passage.js) : délègue TOUT l'effet
// (état + son de passage + croisement d'occlusion + pas de trajet/arrivée,
// voir view/city-screen.js/sideSwitchEffect, qui orchestre son propre sas)
// au gestionnaire enregistré, jamais de son joué ICI (contrairement à
// handlePickup/handleLoot) : le son de bascule appartient à la SÉQUENCE du
// sas, dont le timing (juste après le gel, AVANT le croisement de filtres)
// ce fichier n'a aucune raison de connaître. arrivalX : donnée de CONTENU
// (action.arrivalX, jamais validée en FORME par core/scene.js — voir son
// commentaire sur `action`, même politique que amount/spawn ci-dessous) —
// un contenu mal formé se dégrade en avertissement, jamais un plantage.
// `entity` (le passage) transmis tel quel au gestionnaire, voir
// setSideSwitchHandler ci-dessus.
function handleSwitchSide(entity, action) {
  const arrivalX = action.arrivalX;
  if (!Number.isFinite(arrivalX)) {
    console.warn(`interact: action "switchSide" sur "${entity.id}" sans arrivalX numérique valide.`);
    return;
  }
  if (!sideSwitchHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  sideSwitchHandler(arrivalX, entity);
}

// "pickup" : effet d'ÉTAT délégué au gestionnaire enregistré — PUIS retour
// sensoriel, vue pure ici (son défensif, annonce brève). DEUX formes
// possibles pour action.kind:"pickup", jamais mélangées sur une même
// entité (distinguées par la PRÉSENCE du champ, même principe que
// handleLoot pour action.spawn/amount) :
//   - action.item : vers le SAC (voir core/bag.js/pickupItemEntity,
//     doc/entity-model.md/"Sac d'objets") — le nom affiché ("Ramassé :
//     <objet>") vient de entity.labelKey, déjà résolu par le core (voir
//     core/scene.js) : ce fichier n'importe jamais le core, donc jamais le
//     registre d'objets (core/items.js) — c'est au contenu de scène de
//     donner à l'entité le MÊME nameKey que ITEM_REGISTRY[type].label pour
//     que le nom ramassé corresponde à celui du sac (convention, jamais
//     une contrainte structurelle).
//   - action.amount : vers session.money (comportement d'origine).
function handlePickup(entity, action) {
  const item = action.item;
  if (item !== undefined) {
    const count = action.count ?? 1;
    if (typeof item !== "string" || item === "" || !Number.isInteger(count) || count <= 0) {
      console.warn(`interact: action "pickup" (item) sur "${entity.id}" mal formée.`);
      return;
    }
    if (!itemPickupHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
    playEntityPickupSound(entity); // avant le retrait : l'entité a encore sa voix
    itemPickupHandler(entity, item, count);
    announce(t("interaction.pickupItem", { item: t(entity.labelKey) }), { assertive: true });
    return;
  }

  const amount = action.amount;
  if (!Number.isFinite(amount)) {
    console.warn(`interact: action "pickup" sur "${entity.id}" sans amount numérique valide.`);
    return;
  }
  if (!pickupHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  playEntityPickupSound(entity);
  pickupHandler(entity, amount);
  announce(t("interaction.pickup", { amount }), { assertive: true });
}

// "loot" : COLLECTIBLE PERSISTANT (voir core/money.js/lootEntity,
// doc/entity-model.md/"Collectible persistant") — même structure que
// handlePickup ci-dessus (amount validé, son défensif, annonce), mais
// l'entité N'EST JAMAIS retirée : elle change d'état (consumed:true), avec
// ses effets post-activation DÉCLARATIFS (description alternative —
// resolveDescription ci-dessus ; devenir dormant — une règle de présence
// sur la condition "consumed", voir core/presence.js) résolus ailleurs,
// jamais ici. IDEMPOTENCE côté retour SENSORIEL, pas seulement en core :
// sans cette garde, réactiver une entité déjà consumed rejouerait le son +
// l'annonce "trouvé N pièces" alors qu'aucun argent n'est réellement ajouté
// (lootEntity, lui, se dégrade déjà silencieusement — voir son commentaire)
// — le piège exact que ce système doit éviter.
//
// DEUX formes possibles pour action.kind:"loot", jamais mélangées sur une
// même entité — voir doc/entity-model.md/"Entités éphémères" :
//   - action.amount : crédite directement (comportement d'origine, ex.
//     crate-port/crate-warehouse) ;
//   - action.spawn : { spec, count, spread } — fait naître `count` entités
//     éphémères ÉPARPILLÉES autour de la source AU LIEU de créditer
//     directement (ex. crate-stash, scenes/demo2.json) ; chacune se
//     ramasse ensuite individuellement via sa PROPRE action "pickup" (déjà
//     robuste, rien à ajouter). `spec` (minimal, ex. { type: "money",
//     amount: 20 }) est résolu en descripteur COMPLET par lootSpawnHandler
//     (voir view/city-screen.js/resolveEphemeralSpec) — ce fichier n'en
//     connaît que la forme brute, jamais le registre.
function handleLoot(entity, action) {
  if (entity.consumed) return;

  const spawn = action.spawn;
  if (spawn) {
    if (!Number.isInteger(spawn.count) || spawn.count <= 0 || !spawn.spec || !spawn.spec.type) {
      console.warn(`interact: action "loot" (spawn) sur "${entity.id}" mal formée.`);
      return;
    }
    if (!lootSpawnHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
    playEntityPickupSound(entity);
    lootSpawnHandler(entity, spawn);
    // Pas de MONTANT ici (contrairement au cas action.amount ci-dessous) :
    // rien n'est encore GAGNÉ, seulement RÉPANDU autour de la source — le
    // joueur ramassera chaque pièce individuellement, chacune annonçant
    // déjà son propre gain (voir handlePickup).
    announce(t("interaction.lootSpawn", { count: spawn.count }), { assertive: true });
    return;
  }

  const amount = action.amount;
  // OBJET UNIQUE (troisième forme) : ni montant ni éparpillement. Son de
  // ramassage, puis l'entité passe consumed — les effets de l'action (ex.
  // giveImprovement + annonce) ont déjà été exécutés par interact(). Aucune
  // annonce propre ici : c'est au contenu de dire ce qu'on a pris.
  if (amount === undefined) {
    if (!lootUniqueHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
    playEntityPickupSound(entity);
    lootUniqueHandler(entity);
    return;
  }
  if (!Number.isFinite(amount)) {
    console.warn(`interact: action "loot" sur "${entity.id}" sans amount numérique valide.`);
    return;
  }
  if (!lootHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  playEntityPickupSound(entity);
  lootHandler(entity, amount);
  announce(t("interaction.loot", { amount }), { assertive: true });
}

// "applyEffects" : kind GÉNÉRIQUE, sans état "métier" propre (contrairement
// à transit/pickup/loot/switchSide) — sa SEULE substance est ce que le
// contenu déclare via `action.effects` (voir "Effets" plus haut,
// core/scripting.md/"Effets"), déjà exécutés GÉNÉRIQUEMENT pour TOUT kind
// par interact() AVANT ce dispatch (voir runEffects) : ce handler n'a donc
// RIEN de plus à faire — NO-OP délibéré, gardé dans ACTION_HANDLERS
// seulement pour que ce kind reste un kind CONNU (sinon l'aiguillage
// avertirait "type d'action inconnu", voir plus bas). Cas d'usage de
// référence : la fenêtre (deux actions candidates opposées, voir
// core/scripting.md/"Actions multiples filtrées par condition").
function handleApplyEffects() {}

// "search" : FOUILLE d'un conteneur de collecte (voir core/spawn.js/
// searchContainer, doc/entity-model.md/"Collecte") — même geste que le
// "loot" à spawn ci-dessus : le stock TOMBE au sol, éparpillé, à ramasser
// ensuite objet par objet (chacun annonçant et sonnant son propre ramassage,
// voir handlePickup). Aucun son ici : les balises des objets tombés sont le
// retour audible. Un conteneur VIDÉ n'arrive ici que s'il était le seul
// candidat à portée (voir view/occupancy.js/
// getInteractionCandidates) : son état est alors annoncé — jamais un
// silence, jamais un menu parasite.
const SEARCH_EMPTY_KEYS = {
  searchedToday: "interaction.searchAlreadyToday",
  depleted: "interaction.searchDepleted",
};

function handleSearch(entity) {
  if (!searchHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  // { status, count } — voir core/spawn.js/searchContainer.
  const { status, count } = searchHandler(entity);
  if (SEARCH_EMPTY_KEYS[status]) {
    announce(t(SEARCH_EMPTY_KEYS[status]), { assertive: true });
    return;
  }
  if (status !== "searchable") return; // pas un conteneur de la face active (dégradation silencieuse)
  // Fouille faite : tous les tirages ont pu tomber sur "nothing".
  if (count === 0) announce(t("interaction.searchNothing"), { assertive: true });
  else if (count === 1) announce(t("interaction.searchSpawnOne"), { assertive: true });
  else announce(t("interaction.searchSpawn", { count }), { assertive: true });
}

// "shop" : POINT DE VENTE (voir entities/types/shop_counter.js, doc/
// entity-model.md/"Vente") — ouvre le menu d'actions du comptoir ; tout le
// reste (liste de vente, confirmations, transaction) vit dans
// view/menus/shop-menu.js.
function handleShop(entity) {
  if (!shopHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  shopHandler(entity);
}

const ACTION_HANDLERS = {
  pickup: handlePickup,
  loot: handleLoot,
  switchSide: handleSwitchSide,
  applyEffects: handleApplyEffects,
  search: handleSearch,
  shop: handleShop,
};

// ACTIONS CONDITIONNELLES (voir core/scene.js, action.condition/
// refusalEffects) — GÉNÉRIQUE à TOUT kind de ACTION_HANDLERS ci-dessus, pas
// un cas spécial d'un kind précis : une porte (teleport conditionné, voir
// "Effets d'action"/`"teleport"`), une caisse verrouillée, un PNJ qui ne
// parle qu'à condition réutilisent tous cette MÊME vérification, jamais un
// second mécanisme.
// Réutilise TEL QUEL l'évaluateur de conditions du core
// (core/presence.js/evaluateCondition) — même objet déclaratif que
// presence[].when, déjà validé au chargement (core/scene.js).
//
// context.entity PORTE ICI L'ENTITÉ-CIBLE (celle qui déclare l'action —
// une variable de portée "entity" référencée par la condition, voir
// core/presence.js/evaluateVariable, se résout donc contre SES PROPRES
// variables), JAMAIS le joueur — voir context.playerEquipment ci-dessous
// pour la distinction. AVANT ce mécanisme, context.entity portait un
// wrapper synthétique { equipment } pour le JOUEUR : ce rôle vit maintenant
// dans sa PROPRE clé, `playerEquipment` (voir core/presence.js/
// evaluateHasEquipmentTag, qui la lit spécifiquement) — les deux rôles ne
// peuvent PAS partager `context.entity` sans se marcher dessus dès qu'une
// condition "variable" et une condition "hasEquipmentTag" coexistent (ex.
// dans un allOf) sur la MÊME action.
//
// time : injecté via timeProvider ci-dessus, MÊME clé que
// core/reduce.js/presenceContext — une condition "timeRange" se comporte
// donc IDENTIQUEMENT sur presence[].when et sur action.condition.
// perceptionActive/weather/world/session : injectés via sessionProvider
// ci-dessus, dérivés de LA MÊME session avec EXACTEMENT la même formule que
// core/reduce.js/presenceContext (weather : son `.state` ; world : le monde
// ACTIF entier — recto ET verso pour une scène à deux faces, jamais
// seulement la face courante, voir core/variables.js/carrierForScope, scope
// "scene" — PAS core/state.js/getActiveWorld, qui aplatit la face et ferait
// perdre l'autre). hasImprovement/weather/perceptionActive/variable scope
// "scene"/"party" se comportent donc désormais IDENTIQUEMENT sur
// action.condition et sur presence[].when (voir doc/scripting.md, section
// "Conditions d'action"). Sans provider enregistré (cas limite, jamais en
// jeu réel) -> ces clés restent undefined, repli déjà géré par chaque
// évaluateur (core/presence.js).
function actionContext(entity) {
  const equipment = playerEquipmentProvider ? playerEquipmentProvider() : undefined;
  const time = timeProvider ? timeProvider() : undefined;
  const session = sessionProvider ? sessionProvider() : undefined;
  const perceptionActive = session ? session.perceptionActive : undefined;
  const weather = session ? session.weather.state : undefined;
  const world = session ? session.worlds[session.activeWorldId] : undefined;
  return { entity, playerEquipment: equipment, time, perceptionActive, weather, world, session };
}

function actionConditionMet(condition, entity) {
  return evaluateCondition(condition, actionContext(entity));
}

// kind ∈ { "describe", "activate" }. entity est déjà un candidat FILTRÉ par
// capacité (voir view/occupancy.js/getInteractionCandidates) — cette
// fonction fait confiance à son appelant, elle ne revérifie pas
// observable/interactable elle-même.
// COOLDOWN D'INTERACTION (Entrée seulement, PAR ENTITÉ) — limite de cadence
// d'entrée, pas une règle de jeu : jamais dans le core, jamais sauvegardé.
// Dernier appui par id d'entité, horloge réelle monotone (performance.now) :
// indépendant de la vitesse du temps de jeu et de la pause. Pendant
// `interactCooldownMs` (cascade instance -> archétype -> défaut, voir
// config/tuning-values.js), un nouvel appui sur la même entité est ignoré EN
// SILENCE — l'action entière, succès comme refus, quelle que soit la
// candidate qui aurait été choisie : état et rendu restent synchronisés.
// Purgé à chaque changement de scène ou de face (clearInteractionCooldowns,
// appelée par view/city-screen.js/performTransition et sideSwitchEffect) :
// un ancien horodatage ne bloque jamais une entité après un aller-retour.
const lastActivationAt = new Map();

export function clearInteractionCooldowns() {
  lastActivationAt.clear();
}

function isInCooldown(entity) {
  const last = lastActivationAt.get(entity.id);
  if (last === undefined) return false;
  return performance.now() - last < resolveTuning("interactCooldownMs", entity);
}

// Une action qui TÉLÉPORTE se protège d'elle-même (le sas met le jeu en
// pause) : aucun horodatage, pour qu'un retour dans le même monde ne garde
// pas la porte bloquée après coup.
function departsWithTeleport(effects) {
  return Boolean(effects && effects.some((effect) => effect.type === "teleport"));
}

export function interact(entity, kind) {
  if (kind === "describe") {
    const description = resolveDescription(entity);
    if (!description) return;
    announce(description, { assertive: true });
    return;
  }

  if (kind === "activate") {
    // Pas d'action différenciée déclarée (ex. npc/object aujourd'hui,
    // interactables mais sans kind encore câblé) -> silence, comportement
    // STUB générique inchangé pour ce contenu-là.
    if (!entity.action) return;

    // Cooldown (voir lastActivationAt plus haut) : ignoré en silence.
    if (isInCooldown(entity)) return;

    // ACTIONS MULTIPLES CANDIDATES (voir core/scene.js/parseEntity,
    // core/presence.js/selectMatchingAction, core/scripting.md/"Actions
    // multiples filtrées par condition") : entity.action est soit un OBJET
    // UNIQUE (RÉTROCOMPAT stricte — resolvedAction EST cet objet), soit un
    // TABLEAU de candidates — la PREMIÈRE dont la condition est vraie est
    // choisie SILENCIEUSEMENT (pas de menu, contrairement à
    // chooseInteractionTarget plus bas, qui désambiguïse entre ENTITÉS via
    // un choix JOUEUR — ici, la sélection est entièrement dictée par
    // l'état du jeu). AUCUNE candidate ne matche -> rien, exactement comme
    // une action à condition non remplie ci-dessous.
    const resolvedAction = Array.isArray(entity.action)
      ? selectMatchingAction(entity.action, actionContext(entity))
      : entity.action;
    if (!resolvedAction) return;

    // Collectible persistant déjà consommé : plus rien à faire, ni effet ni
    // son. Sans ce verrou, ses effets (exécutés AVANT le handler du kind,
    // voir plus bas) se rejoueraient à chaque Entrée.
    if (resolvedAction.kind === "loot" && entity.consumed) return;

    // Condition fausse -> REFUS informatif (refusalEffects, voir "Effets"
    // plus haut), AUCUN effet de succès, AUCUNE transition : l'action est
    // simplement bloquée, proprement. Action sans condition (tout contenu
    // existant) -> ce bloc est sauté entièrement, comportement STRICTEMENT
    // inchangé. Pour une action choisie DANS un tableau, cette condition est
    // déjà connue vraie (voir selectMatchingAction) — la revérifier ici
    // reste correct (fonction pure, même contexte) et évite un second
    // chemin de code.
    if (resolvedAction.condition && !actionConditionMet(resolvedAction.condition, entity)) {
      lastActivationAt.set(entity.id, performance.now());
      runEffects(entity, resolvedAction.refusalEffects);
      return;
    }

    if (!departsWithTeleport(resolvedAction.effects)) lastActivationAt.set(entity.id, performance.now());

    // Condition VRAIE (ou absente) -> effets de succès exécutés
    // GÉNÉRIQUEMENT pour TOUT kind (voir "Effets" plus haut), AVANT le
    // handler propre au kind — ni transit/pickup/loot/switchSide ne
    // déclarent `effects` aujourd'hui (comportement STRICTEMENT inchangé
    // pour eux), mais rien ne les en empêche demain : ce n'est plus
    // réservé à "applyEffects" (voir handleApplyEffects, désormais NO-OP).
    runEffects(entity, resolvedAction.effects);

    const handler = ACTION_HANDLERS[resolvedAction.kind];
    if (!handler) {
      // Kind DÉCLARÉ mais inconnu de ce registre : un vrai bug de contenu,
      // signalé au développeur (console), mais jamais audible/annoncé au
      // joueur ni fatal — même politique de dégradation que le reste de
      // l'aiguillage par kind du projet (voir core/presence.js).
      console.warn(`interact: type d'action "${resolvedAction.kind}" inconnu sur l'entité "${entity.id}".`);
      return;
    }
    handler(entity, resolvedAction);
    return;
  }
}

// Menu de désambiguïsation : un candidat par entrée, dans l'ordre déjà trié
// reçu (donc pas de tri ici). Construit sur makeMenuScreen — aucun système
// de menu réinventé. kind est celui de la touche pressée à l'ouverture
// (Espace/Entrée) : il voyage jusqu'à l'activation d'une entrée, pour que
// interact(entité, kind) reçoive le BON kind quel que soit le candidat
// choisi.
//
// scene fournit pauseBeacons()/resumeBeacons() (voir
// view/audio/city-scene.js) : seules les balises positionnées de la scène
// sont mises en pause pendant le menu, jamais le contexte audio global —
// une future musique/ambiance continuerait derrière ce menu.
function openDisambiguationMenu(candidates, kind, scene) {
  const menu = {
    // Titre propre au verbe (Espace/observer vs Entrée/interagir) : les deux
    // menus partagent le même mécanisme (makeMenuScreen), jamais le même
    // intitulé — l'utilisateur doit savoir CE QU'IL choisit, pas seulement
    // PARMI QUOI.
    title: kind === "describe" ? "menu.interaction.observe.title" : "menu.interaction.title",
    closable: true, // Échap ferme sans rien faire
    entries: candidates.map((entity) => ({
      label: entity.labelKey,
      onActivate: () => {
        popScreen();
        interact(entity, kind);
      },
    })),
  };

  const screen = makeMenuScreen(menu, t);

  // makeMenuScreen ne connaît rien de l'audio : on enveloppe onEnter/onExit
  // ici plutôt que d'y toucher, pour garder ce module générique inchangé.
  // Composition (voir composeHook) : onEnter de base (annonce d'ouverture)
  // PUIS pause des balises ; onExit de base (actuellement aucun, mais
  // composé quand même par principe) PUIS reprise des balises.
  screen.onEnter = composeHook(screen.onEnter, () => scene.pauseBeacons());
  screen.onExit = composeHook(screen.onExit, () => scene.resumeBeacons());

  pushScreen(screen);
}

// candidates = entités dont la zone d'interaction englobe le joueur, DÉJÀ
// triées par x croissant — même ensemble, même tri que l'annonce
// d'occupation (voir view/occupancy.js, occupiedEntities). scene :
// voir openDisambiguationMenu ci-dessus.
export function chooseInteractionTarget(candidates, kind, scene) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // 2+ candidats : le choix ne peut plus être immédiat, il devient
  // asynchrone (menu). null signale à l'appelant qu'il n'y a rien à faire
  // MAINTENANT — le futur choix appellera interact() lui-même (onActivate
  // ci-dessus), avec le kind mémorisé ici.
  openDisambiguationMenu(candidates, kind, scene);
  return null;
}
