// ACHAT À UN PRÉSENTOIR (voir doc/entity-model.md/"Présentoirs",
// entities/types/shop_display.js) : Entrée sur un présentoir garni pose la
// question de confirmation ("Annuler" d'abord, view/menus/confirmation.js),
// puis achète. Ce module ne lit la session qu'en LECTURE : le refus que
// recevrait l'achat (core/trade.js/offeredArticleRefusal, la règle du core
// lue d'avance) répond SANS ouvrir de question inutile (présentoir vide,
// amélioration déjà possédée, fonds insuffisants).
// La transaction est l'effet d'état du core (core/trade.js/
// buyOfferedArticle), injecté depuis view/action-handlers.js : il revérifie
// tout et rend son statut, annoncé ici.

import { announce } from "../../lib/announce.js";
import { t } from "../../data/i18n/index.js";
import { getActiveWorld } from "../../core/state.js";
import { offeredArticle } from "../../core/display.js";
import { offeredArticleRefusal } from "../../core/trade.js";
import { playMenuSound } from "../menu-sounds.js";
import { openConfirmation } from "./confirmation.js";

// (entityId) => status — effet d'ÉTAT de l'achat (core/trade.js/
// buyOfferedArticle), fourni par view/action-handlers.js qui seul détient
// getSession/setSession — même injection que shop-menu.js/setBuyHandler.
let buyHandler = null;

export function setDisplayBuyHandler(handler) {
  buyHandler = handler;
}

// Article exposé par le présentoir tel qu'il est MAINTENANT (jamais la
// copie de l'entité reçue à l'activation).
function currentArticle(getSession, entityId) {
  const display = getActiveWorld(getSession()).entities.find((entity) => entity.id === entityId);
  return offeredArticle(display);
}

// Annonce d'un refus. Un présentoir vide se dit simplement, comme un
// conteneur déjà fouillé ; les deux autres refus sonnent "refusal", comme au
// comptoir (view/menu-sounds.js).
function announceRefusal(status, article, session) {
  if (status === "empty") {
    announce(t("shop.display.empty"), { assertive: true });
    return;
  }
  playMenuSound("refusal");
  if (status === "alreadyOwned") {
    announce(t("shop.display.alreadyOwned", { item: t(article.labelKey) }), { assertive: true });
  } else if (status === "insufficientFunds") {
    announce(t("shop.display.insufficientFunds", { price: article.price, money: session.money }), { assertive: true });
  }
}

// Activation d'un présentoir (action "buy", voir view/action-execution.js).
// `getWorldView` : la vue du monde, dont les balises se taisent pendant la
// question.
export function openDisplayPurchase(getWorldView, getSession, entity) {
  const article = currentArticle(getSession, entity.id);
  const refusal = offeredArticleRefusal(getSession(), article);
  if (refusal) {
    announceRefusal(refusal, article, getSession());
    return;
  }
  const item = t(article.labelKey);
  openConfirmation(
    "shop.display.confirm",
    () => {
      if (!buyHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
      const status = buyHandler(entity.id);
      if (status === "bought") {
        // La question vient de se fermer et de relancer les balises :
        // celle de l'article vendu se tait dans le même instant.
        getWorldView()?.muteSpentBeacons();
        announce(t("shop.display.done", { item, price: article.price }), { assertive: true });
        return;
      }
      // L'état a changé pendant la question (cas limite) : le core a refusé.
      announceRefusal(status, article, getSession());
    },
    { titleParams: { item, price: article.price }, getWorldView }
  );
}
