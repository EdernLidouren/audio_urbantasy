// POINT DE VENTE (voir doc/entity-model.md/"Vente et achat", entities/types/
// shop_counter.js) — écrans sur la pile (lib/screens.js) :
//   1. MENU D'ACTIONS (lib/menu.js) : "Acheter", "Vendre", "Annuler". TOUJOURS
//      un menu — même prévisibilité que view/menus/inventory-menu.js.
//   2. LISTE À SLIDERS INLINE (view/menus/shop-quantity-list.js), un seul
//      écran paramétré ici pour la VENTE et pour l'ACHAT (voir openSellMenu,
//      openBuyMenu) ;
//   3. CONFIRMATION de la transaction (view/menus/confirmation.js).
// Les TRANSACTIONS sont des effets d'état du core (core/trade.js/sellItems,
// buyItems), appliqués par les gestionnaires injectés depuis
// view/action-handlers.js — ce module ne lit la session qu'en LECTURE.

import { t } from "../../data/i18n/index.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { withPausedBeacons } from "../paused-beacons.js";
import { openConfirmation } from "./confirmation.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { openQuantityList, selectedCount, selectedTotal } from "./shop-quantity-list.js";
import { announce } from "../../lib/announce.js";
import { playMenuSound } from "../menu-sounds.js";
import { ITEM_REGISTRY } from "../../core/items.js";
import { getActiveWorld } from "../../core/state.js";
import { isSellable, sellValueOf, ownedQuantity, shopArticles } from "../../core/trade.js";

// (sales: [{ type, quantity }]) => void — effet d'ÉTAT de la vente
// (core/trade.js/sellItems), fourni par view/action-handlers.js qui seul détient
// getSession/setSession — même injection que inventory-menu.js/
// setDropItemHandler.
let sellHandler = null;

export function setSellHandler(handler) {
  sellHandler = handler;
}

// (entityId, purchases: [{ type, quantity }]) => void — effet d'ÉTAT de
// l'achat (core/trade.js/buyItems), même injection.
let buyHandler = null;

export function setBuyHandler(handler) {
  buyHandler = handler;
}

// Entité VIVANTE du point de vente (état de stock à jour), relue dans la
// session — jamais le snapshot reçu à l'activation.
function liveShop(getSession, entityId) {
  return getActiveWorld(getSession()).entities.find((e) => e.id === entityId);
}

// Une LIGNE de vente par TYPE vendable du sac (agrégée : un non-empilable
// possédé en plusieurs exemplaires fait une seule ligne, `max` = nombre
// d'entrées). `selected` : quantité choisie, TRANSITOIRE, propre à cette
// ouverture du menu.
function buildSaleLines(bag) {
  const types = [...new Set(bag.map((entry) => entry.type))].filter(isSellable);
  return types.map((type) => ({
    type,
    labelKey: ITEM_REGISTRY[type].label,
    descriptionKey: ITEM_REGISTRY[type].descriptionKey,
    max: ownedQuantity(bag, type),
    price: sellValueOf(type),
    selected: 0,
  }));
}

// Une LIGNE d'achat par ARTICLE du catalogue, épuisés compris (`max` = 0 :
// le joueur sait qu'il existe et reviendra au prochain cycle).
function buildPurchaseLines(shopEntity) {
  return shopArticles(shopEntity).map((article) => ({
    type: article.type,
    labelKey: ITEM_REGISTRY[article.type].label,
    descriptionKey: ITEM_REGISTRY[article.type].descriptionKey,
    max: article.stock,
    price: article.price,
    selected: 0,
  }));
}

function selectedQuantities(lines) {
  return lines.filter((line) => line.selected > 0).map((line) => ({ type: line.type, quantity: line.selected }));
}

// "Pomme × 3, Pièce × 2" — récapitulatif (confirmation, résultat).
function details(lines) {
  return lines
    .filter((line) => line.selected > 0)
    .map((line) => t("shop.detail", { item: t(line.labelKey), quantity: line.selected }))
    .join(", ");
}

// Confirmation de TRANSACTION (voir ./confirmation.js). Titre DYNAMIQUE :
// total + récapitulatif. Confirmer -> `apply()` (effet d'état) puis retour
// DIRECT au jeu (confirmation, liste et menu d'actions retirés — le jeu ne
// réannonce rien à son reveal, voir view/city-screen.js/onEnter) et annonce
// du résultat, DERNIÈRE écriture donc jamais écrasée.
function openTransactionConfirmation(titleKey, titleParams, apply, doneMessage) {
  openConfirmation(
    titleKey,
    () => {
      if (apply() === false) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
      popScreen(); // la liste
      popScreen(); // le menu d'actions
      announce(doneMessage(), { assertive: true });
    },
    { titleParams }
  );
}

// VENTE : lignes = objets vendables du sac, plafond = possédé, aucune
// condition d'incrément.
function openSellMenu(getSession) {
  openQuantityList({
    getSession,
    lines: buildSaleLines(getSession().bag),
    entryKey: "shop.sell.entry",
    totalKey: "shop.sell.total",
    validateKey: "shop.sell.validate",
    nothingSelectedKey: "shop.sell.nothingSelected",
    onValidate: (lines) => {
      const count = selectedCount(lines);
      const total = selectedTotal(lines);
      const summary = details(lines);
      const sales = selectedQuantities(lines);
      openTransactionConfirmation(
        "shop.sell.confirm.title",
        { count, total, details: summary },
        () => {
          if (!sellHandler) return false;
          sellHandler(sales);
        },
        () => t("shop.sell.done", { details: summary, total })
      );
    },
  });
}

// ACHAT : lignes = articles du catalogue (épuisés compris), plafond = STOCK
// (borne du slider), condition d'incrément = ARGENT — un CUMUL (total du
// panier) est comparé à session.money avant chaque incrément ; un grand pas
// est réduit à ce que les fonds permettent, zéro -> refus "fonds
// insuffisants", SEULE source de refus avec message (le stock est déjà la
// borne, jamais confondu avec l'argent).
function openBuyMenu(getSession, entityId) {
  const lines = buildPurchaseLines(liveShop(getSession, entityId));
  openQuantityList({
    getSession,
    lines,
    entryKey: "shop.buy.entry",
    soldOutKey: "shop.buy.entry.soldOut",
    totalKey: "shop.buy.total",
    validateKey: "shop.buy.validate",
    nothingSelectedKey: "shop.buy.nothingSelected",
    allowedIncrease: (line, delta) => {
      const budget = getSession().money - selectedTotal(lines);
      const affordable = Math.min(delta, Math.floor(budget / line.price));
      return affordable > 0 ? { delta: affordable } : { delta: 0, refusalKey: "shop.buy.insufficientFunds" };
    },
    onValidate: (validated) => {
      const count = selectedCount(validated);
      const total = selectedTotal(validated);
      const summary = details(validated);
      const purchases = selectedQuantities(validated);
      openTransactionConfirmation(
        "shop.buy.confirm.title",
        { count, total, details: summary },
        () => {
          if (!buyHandler) return false;
          buyHandler(entityId, purchases);
        },
        () => t("shop.buy.done", { details: summary, total })
      );
    },
  });
}

// Activation du point de vente (action "shop", voir view/interaction.js) :
// MENU D'ACTIONS ("Acheter" d'abord, "Vendre", "Annuler"), titre = le nom du
// point de vente lui-même (entity.labelKey, déjà une clé i18n — même idiome
// que inventory-menu.js/openItemActionsMenu). "Acheter" sans catalogue,
// "Vendre" sans rien de vendable au sac -> son "refusal" + annonce seule,
// aucune liste vide.
// Balises en pause tant que ce menu (ou un écran au-dessus) est ouvert.
export function openShopMenu(getWorldView, getSession, entity) {
  const menu = {
    title: entity.labelKey,
    closable: true,
    entries: [
      {
        label: "shop.actions.buy",
        onActivate: () => {
          const shop = liveShop(getSession, entity.id);
          // Sans catalogue, ou catalogue sans article (neutralisé à la
          // relecture d'une sauvegarde, voir core/save.js) : refus.
          if (!shop || !shop.shop || buildPurchaseLines(shop).length === 0) {
            playMenuSound("refusal");
            announce(t("shop.buy.empty"), { assertive: true });
            return;
          }
          openBuyMenu(getSession, entity.id);
        },
      },
      {
        label: "shop.actions.sell",
        onActivate: () => {
          if (buildSaleLines(getSession().bag).length === 0) {
            playMenuSound("refusal");
            announce(t("shop.sell.empty"), { assertive: true });
            return;
          }
          openSellMenu(getSession);
        },
      },
      { label: "shop.actions.cancel", onActivate: () => popScreen() },
    ],
  };
  pushScreen(withPausedBeacons(makeMenuScreen(menu, t), getWorldView));
}
