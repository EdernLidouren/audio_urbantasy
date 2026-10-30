// INTERACTION avec une entité de la scène ville (Espace : observer, Entrée :
// activer), déclenchée par des touches DISCRÈTES (voir city-screen.js) —
// pas de maintien, donc aucun souci d'auto-interruption NVDA ici. Aucune
// RÈGLE de jeu propre ici (le core reste la seule source de vérité) :
// description, choix de la candidate et condition (lectures pures du core,
// core/presence.js), cooldown d'entrée, menu de choix entre entités. Le
// reste est délégué :
//   - ./effect-runner.js : effets d'une action (état délégué, rendu joué) ;
//   - ./action-execution.js : exécution par kind (son, annonce, état) ;
//   - ./interaction-handlers.js : gestionnaires injectés, qui seuls
//     écrivent l'état.

import { announce } from "../lib/announce.js";
import { t, nameRef } from "../data/i18n/index.js";
import { pushScreen, popScreen } from "../lib/screens.js";
import { withPausedBeacons } from "./paused-beacons.js";
import { makeMenuScreen } from "../lib/menu.js";
import { evaluateCondition, selectMatchingAction, selectDescriptionKey, actionContextOf } from "../core/presence.js";
import { resolveDescriptionText } from "./description-resolver.js";
import { resolveTuning } from "../config/tuning.js";
import { sessionProvider, observationHandler } from "./interaction-handlers.js";
import { runEffects } from "./effect-runner.js";
import { executeAction } from "./action-execution.js";
import { openConfirmation } from "./menus/confirmation.js";
import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";
import { offeredArticle, presentedLabelKey } from "../core/display.js";

// Description RICHE d'une entité (interaction "describe"), distincte du nom
// annoncé à l'approche (occupation, voir view/occupancy.js).
// INDIRECTION délibérée plutôt qu'un accès direct à descriptionKey : la clé
// choisie est résolue par description-resolver.js/resolveDescriptionText,
// PAS un accès direct à t(key) — DYNAMIQUE (gabarit i18n rempli du
// CONTEXTE courant, voir son en-tête), recalculée à CHAQUE appel, jamais
// stockée. Contexte = EXACTEMENT actionContext(entity) (voir ci-dessous) —
// MÊME source que l'évaluation de condition, aucune seconde forme de
// contexte à maintenir. undefined si l'entité n'a rien à décrire (ex.
// descriptionKey absent malgré observable:true) — le filtrage par capacité
// (getInteractionCandidates) évite déjà ce cas en pratique, ce repli reste
// défensif.
//
// consumedDescriptionKey (voir core/entity-parse.js, doc/entity-model.md/
// "Collectible persistant") : description ALTERNATIVE une fois
// entity.consumed — effet POST-ACTIVATION "changer d'état perceptible"
// d'un collectible persistant (core/money.js/lootEntity), déclaré par
// l'entité elle-même, jamais un cas spécial câblé ici. Absente -> repli sur
// descriptionKey normal (une entité consommée sans description alternative
// déclarée garde simplement la même description qu'avant). Cette clé PEUT
// elle aussi porter un gabarit, comme n'importe quelle descriptionKey.
//
// descriptionRules (voir doc/scripting.md/"Descriptions conditionnelles") :
// une description choisie par CONDITION (ex. la porte du magasin, rideau
// baissé la nuit), prioritaire sur les deux précédentes. Le choix de la clé
// est fait par le core (selectDescriptionKey), contre le MÊME contexte que
// le remplissage du gabarit.
//
// Présentoir GARNI (voir doc/entity-model.md/"Présentoirs") : il décrit
// l'article qu'il expose, prix en tête — le nom vient d'être dit par
// l'occupation. Vide : sa propre description, par le chemin ordinaire.
function resolveDescription(entity) {
  const article = offeredArticle(entity);
  if (article) return t("shop.display.offer", { price: article.price, description: t(article.descriptionKey) });
  const context = actionContext(entity);
  const key = selectDescriptionKey(entity, context);
  if (!key) return undefined;
  return resolveDescriptionText(key, context);
}

// ACTIONS CONDITIONNELLES (voir core/script-parse.js/parseSingleAction,
// action.condition/refusalEffects) — GÉNÉRIQUE à TOUT kind (voir
// view/action-execution.js), pas
// un cas spécial d'un kind précis : une porte (teleport conditionné, voir
// "Effets d'action"/`"teleport"`), une caisse verrouillée, un PNJ qui ne
// parle qu'à condition réutilisent tous cette MÊME vérification, jamais un
// second mécanisme.
// Réutilise TEL QUEL l'évaluateur de conditions du core
// (core/presence.js/evaluateCondition) — même objet déclaratif que
// presence[].when, déjà validé au chargement (core/script-parse.js/
// validateCondition).
//
// context.entity PORTE ICI L'ENTITÉ-CIBLE (celle qui déclare l'action —
// une variable de portée "entity" référencée par la condition, voir
// core/presence.js/evaluateVariable, se résout donc contre SES PROPRES
// variables), JAMAIS le joueur — voir context.playerEquipment ci-dessous
// pour la distinction. L'équipement du JOUEUR vit dans sa PROPRE clé,
// `playerEquipment` (voir core/presence.js/evaluateHasEquipmentTag, qui la
// lit spécifiquement) — les deux rôles ne peuvent PAS partager `context.entity` sans se marcher dessus dès qu'une
// condition "variable" et une condition "hasEquipmentTag" coexistent (ex.
// dans un allOf) sur la MÊME action.
//
// Le reste du contexte (heure, météo, perception, monde, session) est
// celui de la présence (core/presence.js/actionContextOf) : une condition
// se comporte donc IDENTIQUEMENT sur action.condition et sur
// presence[].when (voir doc/scripting.md/"Conditions d'action"). Sans
// fournisseur de session (cas limite, jamais en jeu réel) : seule l'entité,
// chaque évaluateur se replie sur faux.
function actionContext(entity) {
  return sessionProvider ? actionContextOf(sessionProvider(), entity) : { entity };
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
// appelée par view/world-travel.js/performTransition et sideSwitch) :
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

// Exécute l'action RÉSOLUE (candidate choisie, condition vérifiée, et
// confirmation donnée s'il en fallait une) : effets de succès, PUIS handler
// propre au kind.
function runResolvedAction(entity, action) {
  if (!departsWithTeleport(action.effects)) lastActivationAt.set(entity.id, performance.now());

  // Effets de succès exécutés GÉNÉRIQUEMENT pour TOUT kind (voir
  // view/effect-runner.js/runEffects), AVANT le handler propre au kind :
  // n'importe quel kind peut déclarer `effects`, pas seulement
  // "applyEffects" (voir view/action-execution.js/handleApplyEffects, NO-OP
  // pour cette raison).
  runEffects(entity, action.effects);
  executeAction(entity, action);
}

// Question de CONFIRMATION d'une action `confirm` (voir
// core/script-parse.js/parseSingleAction, doc/scripting.md/"Confirmation
// d'une action") : elle nomme la scène de DESTINATION de son "teleport",
// par la convention de titre `scene.<id>.name` (voir doc/i18n.md, vérifiée
// par tools/content-audit.js) — la scène cible n'est pas chargée à ce
// stade, son titre ne peut pas être lu dans son fichier. Une RÉFÉRENCE au
// nom, pas un texte traduit : le gabarit de chaque langue en choisit la
// forme (« la grand-place », « Main Street »), voir doc/i18n.md/
// "Grammaire des textes".
function confirmationParams(action) {
  const teleport = action.effects.find((effect) => effect.type === "teleport");
  return { scene: nameRef(`scene.${teleport.target}.name`) };
}

// `getWorldView` : la vue du monde courante, dont les balises se taisent
// pendant un menu ouvert par l'interaction (confirmation).
export function interact(entity, kind, getWorldView) {
  // Une description réussie note le type comme OBSERVÉ (bestiaire, voir
  // core/observations.js) ; la découverte éventuelle s'annonce après elle
  // (view/discoveries.js).
  if (kind === "describe") {
    const description = resolveDescription(entity);
    if (!description) return;
    announce(description, { assertive: true });
    if (observationHandler) observationHandler(entity);
    return;
  }

  if (kind === "activate") {
    // Pas d'action différenciée déclarée (ex. npc/object, interactables
    // mais sans kind câblé) -> silence, comportement STUB générique pour ce
    // contenu-là.
    if (!entity.action) return;

    // Cooldown (voir lastActivationAt plus haut) : ignoré en silence.
    if (isInCooldown(entity)) return;

    // ACTIONS MULTIPLES CANDIDATES (voir core/entity-parse.js/parseEntity,
    // core/presence.js/selectMatchingAction, doc/scripting.md/"Actions
    // multiples filtrées par condition") : entity.action est soit un OBJET
    // UNIQUE (resolvedAction EST cet objet), soit un
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

    // Condition fausse -> REFUS informatif (refusalEffects, voir
    // view/effect-runner.js/runEffects), AUCUN effet de succès, AUCUNE transition : l'action est
    // simplement bloquée, proprement. Action sans condition -> ce bloc est
    // sauté entièrement. Pour une action choisie DANS un tableau, cette
    // condition est déjà connue vraie (voir selectMatchingAction) — la
    // revérifier ici reste correct (fonction pure, même contexte) et évite
    // un second chemin de code.
    if (resolvedAction.condition && !actionConditionMet(resolvedAction.condition, entity)) {
      lastActivationAt.set(entity.id, performance.now());
      runEffects(entity, resolvedAction.refusalEffects);
      return;
    }

    // Action à CONFIRMER (une sortie d'une scène principale vers une autre,
    // vérifié par l'audit du contenu) : RIEN ne s'exécute avant la réponse —
    // ni son de départ, ni état. Annuler (ou Échap) ne laisse aucune trace.
    // La condition, elle, est déjà vérifiée : un refus reste un refus, sans
    // question. Préférence confirmSceneChange désactivée : l'action part
    // directement, comme une porte.
    const confirmWanted = getPref("confirmSceneChange", PREF_CONSTRAINTS.confirmSceneChange.default);
    if (resolvedAction.confirm && confirmWanted) {
      openConfirmation("interaction.travelConfirm", () => runResolvedAction(entity, resolvedAction), {
        titleParams: confirmationParams(resolvedAction),
        getWorldView,
      });
      return;
    }

    runResolvedAction(entity, resolvedAction);
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
// getWorldView : la vue du monde courante, dont les balises se taisent
// pendant le menu (voir view/paused-beacons.js).
function openDisambiguationMenu(candidates, kind, getWorldView) {
  const menu = {
    // Titre propre au verbe (Espace/observer vs Entrée/interagir) : les deux
    // menus partagent le même mécanisme (makeMenuScreen), jamais le même
    // intitulé — l'utilisateur doit savoir CE QU'IL choisit, pas seulement
    // PARMI QUOI.
    title: kind === "describe" ? "menu.interaction.observe.title" : "menu.interaction.title",
    closable: true, // Échap ferme sans rien faire
    entries: candidates.map((entity) => ({
      // Même nom que l'occupation (un présentoir garni : son article).
      label: presentedLabelKey(entity),
      onActivate: () => {
        popScreen();
        interact(entity, kind, getWorldView);
      },
    })),
  };

  pushScreen(withPausedBeacons(makeMenuScreen(menu, t), getWorldView));
}

// candidates = entités dont la zone d'interaction englobe le joueur, DÉJÀ
// triées par x croissant — même ensemble, même tri que l'annonce
// d'occupation (voir view/occupancy.js, occupiedEntities). getWorldView :
// voir openDisambiguationMenu ci-dessus.
export function chooseInteractionTarget(candidates, kind, getWorldView) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // 2+ candidats : le choix ne peut plus être immédiat, il devient
  // asynchrone (menu). null signale à l'appelant qu'il n'y a rien à faire
  // MAINTENANT — le futur choix appellera interact() lui-même (onActivate
  // ci-dessus), avec le kind mémorisé ici.
  openDisambiguationMenu(candidates, kind, getWorldView);
  return null;
}
