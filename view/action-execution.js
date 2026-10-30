// EXÉCUTION par kind d'action : le retour sensoriel (son, annonce) et
// l'appel du gestionnaire d'état injecté (view/interaction-handlers.js).
// La liste des kinds et la forme de leurs champs vivent dans le core
// (core/action-kinds.js/ACTION_KINDS), validées au chargement : un handler
// reçoit donc toujours une action bien formée. Les clés de ACTION_HANDLERS
// sont vérifiées contre ce registre au chargement du module.

import { announce } from "../lib/announce.js";
import { t } from "../data/i18n/index.js";
import { ACTION_KINDS } from "../core/action-kinds.js";
import { playEntityPickupSound } from "./effect-runner.js";
import {
  pickupHandler,
  itemPickupHandler,
  lootHandler,
  lootUniqueHandler,
  lootSpawnHandler,
  sideSwitchHandler,
  searchHandler,
  shopHandler,
  displayHandler,
} from "./interaction-handlers.js";

// "switchSide" (point de passage recto<->verso, voir entities/types/
// passage.js) : délègue TOUT l'effet
// (état + son de passage + croisement d'occlusion + pas de trajet/arrivée,
// voir view/world-travel.js/sideSwitch, qui orchestre son propre sas)
// au gestionnaire enregistré, jamais de son joué ICI (contrairement à
// handlePickup/handleLoot) : le son de bascule appartient à la SÉQUENCE du
// sas, dont le timing (juste après le gel, AVANT le croisement de filtres)
// ce fichier n'a aucune raison de connaître. `entity` (le passage)
// transmis tel quel au gestionnaire, voir
// view/interaction-handlers.js/setSideSwitchHandler.
function handleSwitchSide(entity, action) {
  if (!sideSwitchHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  sideSwitchHandler(action.arrivalX, entity);
}

// "pickup" : effet d'ÉTAT délégué au gestionnaire enregistré — PUIS retour
// sensoriel, vue pure ici (son, annonce brève). DEUX formes, distinguées
// par la PRÉSENCE du champ (voir core/action-kinds.js) :
//   - action.item : vers le SAC (voir core/bag.js/pickupItemEntity,
//     doc/entity-model.md/"Sac d'objets") — le nom affiché ("Ramassé :
//     <objet>") est entity.labelKey, déjà résolu par le core (un objet au
//     sol reprend le nom de l'objet, voir core/entity-parse.js/
//     genericItemDefaults) ;
//   - action.amount : vers session.money.
function handlePickup(entity, action) {
  if (action.item !== undefined) {
    if (!itemPickupHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
    playEntityPickupSound(entity); // avant le retrait : l'entité a encore sa voix
    itemPickupHandler(entity, action.item, action.count ?? 1);
    announce(t("interaction.pickupItem", { item: t(entity.labelKey) }), { assertive: true });
    return;
  }

  if (!pickupHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  playEntityPickupSound(entity);
  pickupHandler(entity, action.amount);
  announce(t("interaction.pickup", { amount: action.amount }), { assertive: true });
}

// "loot" : COLLECTIBLE PERSISTANT (voir core/money.js/lootEntity,
// doc/entity-model.md/"Collectible persistant") — même structure que
// handlePickup ci-dessus (son, annonce), mais
// l'entité N'EST JAMAIS retirée : elle change d'état (consumed:true), avec
// ses effets post-activation DÉCLARATIFS (description alternative —
// view/interaction.js/resolveDescription ; devenir dormant — une règle de présence
// sur la condition "consumed", voir core/presence.js) résolus ailleurs,
// jamais ici. IDEMPOTENCE côté retour SENSORIEL, pas seulement en core :
// sans cette garde, réactiver une entité déjà consumed rejouerait le son +
// l'annonce "trouvé N pièces" alors qu'aucun argent n'est réellement ajouté
// (lootEntity, lui, se dégrade déjà silencieusement — voir son commentaire)
// — le piège exact que ce système doit éviter.
//
// DEUX formes possibles pour action.kind:"loot", jamais mélangées sur une
// même entité — voir doc/entity-model.md/"Entités éphémères" :
//   - action.amount : crédite directement (ex. crate-port/crate-warehouse) ;
//   - action.spawn : { spec, count, spread } — fait naître `count` entités
//     éphémères ÉPARPILLÉES autour de la source AU LIEU de créditer
//     directement (ex. crate-stash, scenes/demo2.json) ; chacune se
//     ramasse ensuite individuellement via sa PROPRE action "pickup" (déjà
//     robuste, rien à ajouter). `spec` (minimal, ex. { type: "money",
//     amount: 20 }) est résolu en descripteur COMPLET par lootSpawnHandler
//     (voir core/spawn.js/ephemeralArchetypeSpec) — ce fichier n'en
//     connaît que la forme brute, jamais le registre.
function handleLoot(entity, action) {
  if (entity.consumed) return;

  const spawn = action.spawn;
  if (spawn) {
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
  // giveImprovement + annonce) ont déjà été exécutés par interact. Aucune
  // annonce propre ici : c'est au contenu de dire ce qu'on a pris.
  if (amount === undefined) {
    if (!lootUniqueHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
    playEntityPickupSound(entity);
    lootUniqueHandler(entity);
    return;
  }
  if (!lootHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  playEntityPickupSound(entity);
  lootHandler(entity, amount);
  announce(t("interaction.loot", { amount }), { assertive: true });
}

// "applyEffects" : kind GÉNÉRIQUE, sans état "métier" propre (contrairement
// à pickup/loot/switchSide/search/shop) — sa SEULE substance est ce que le
// contenu déclare via `action.effects` (voir view/effect-runner.js/runEffects,
// doc/scripting.md/"Effets"), déjà exécutés GÉNÉRIQUEMENT pour TOUT kind
// par view/interaction.js/interact AVANT ce dispatch : ce handler n'a donc
// RIEN de plus à faire — NO-OP délibéré, présent dans ACTION_HANDLERS
// parce que chaque kind du registre du core doit y avoir son handler
// (contrôle au chargement du module, voir plus bas). Cas d'usage de
// référence : la fenêtre (deux actions candidates opposées, voir
// doc/scripting.md/"Actions multiples filtrées par condition").
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
  // Fouille faite : tous les tirages ont pu tomber sur "nothing". Un ou
  // plusieurs objets : le gabarit accorde lui-même son pluriel.
  if (count === 0) announce(t("interaction.searchNothing"), { assertive: true });
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

// "buy" : PRÉSENTOIR du magasin (voir entities/types/shop_display.js,
// doc/entity-model.md/"Présentoirs") — confirmation puis achat de l'article
// exposé, ou l'annonce de ce qui l'empêche (vide, déjà possédé, fonds) :
// tout vit dans view/menus/display-purchase.js. Un présentoir VIDE n'arrive
// ici que s'il était le seul candidat à portée (voir view/occupancy.js/
// getInteractionCandidates).
function handleBuy(entity) {
  if (!displayHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  displayHandler(entity);
}

const ACTION_HANDLERS = {
  pickup: handlePickup,
  loot: handleLoot,
  switchSide: handleSwitchSide,
  applyEffects: handleApplyEffects,
  search: handleSearch,
  shop: handleShop,
  buy: handleBuy,
};

// Un handler par kind du registre du core, ni plus ni moins : un kind
// ajouté d'un seul côté échoue au chargement, jamais à l'activation.
{
  const missing = Object.keys(ACTION_KINDS).filter((kind) => !ACTION_HANDLERS[kind]);
  const extra = Object.keys(ACTION_HANDLERS).filter((kind) => !ACTION_KINDS[kind]);
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`action-execution: ACTION_HANDLERS et core/action-kinds.js divergent (sans handler : ${missing.join(", ") || "-"} ; hors registre : ${extra.join(", ") || "-"}).`);
  }
}

// Exécute l'action RÉSOLUE (candidate choisie, condition déjà vérifiée,
// effets déjà joués — voir view/interaction.js/interact). Kind connu par
// construction (validé au chargement, voir le contrôle ci-dessus).
export function executeAction(entity, action) {
  ACTION_HANDLERS[action.kind](entity, action);
}
