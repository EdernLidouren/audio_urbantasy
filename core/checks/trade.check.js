// Vérifications du core — domaine « trade ». Vente et achat (core/trade.js,
// core/catalog.js). Lancées par core/checks/index.js/runChecks (voir ce
// fichier). Pur : aucun DOM, aucun fetch ; chaque scène est construite en dur
// via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState } from "../state.js";
import { serializeGame, deserializeGame } from "../save.js";
import { addMoney } from "../money.js";
import { addItem } from "../bag.js";
import { ITEM_REGISTRY } from "../items.js";
import { advanceTime } from "../time.js";
import { TIME_CONFIG } from "../../config/time-values.js";
import { refillDueSpawns } from "../spawn.js";
import {
  sellValueOf,
  isSellable,
  ownedQuantity,
  sellItems,
  shopArticles,
  restockShopIfDue,
  buyItems,
} from "../trade.js";
import { validateShopCatalogs, validateCatalog, fullStockOf, articlePrice } from "../catalog.js";
import { SHOP_CATALOGS } from "../../config/shop-values.js";
import { auditNonSerializable, throws, fail } from "../../lib/check.js";
import { buildMoneyScene } from "./helpers.js";

export default function checkTrade(run) {
  // Fixtures partagées avec d'autres domaines (voir ./helpers.js).
  const moneyScene = buildMoneyScene();

  // --- Vente (core/trade.js) : prix, vendabilité, transaction ---

  run("vente : sellValueOf lit `value` du registre (pomme)", ITEM_REGISTRY.apple.value, sellValueOf("apple"));
  run("vente : un objet sans `value` (clé) vaut 0", 0, sellValueOf("key_bronze"));
  run("vente : un type inconnu vaut 0", 0, sellValueOf("does-not-exist"));
  run("vente : isSellable vrai si value > 0", true, isSellable("apple"));
  run("vente : isSellable faux sans value", false, isSellable("key_bronze"));

  // Sac de test : 5 pommes (empilable), 2 clés (non empilable, deux
  // entrées), 1 paire de baskets (non empilable, vendable).
  let tradeState = createInitialState(moneyScene);
  tradeState = addItem(tradeState, "apple", 5);
  tradeState = addItem(tradeState, "key_bronze", 2);
  tradeState = addItem(tradeState, "sneakers", 1);
  run("vente : ownedQuantity agrège un empilable", 5, ownedQuantity(tradeState.bag, "apple"));
  run("vente : ownedQuantity compte les entrées d'un non-empilable", 2, ownedQuantity(tradeState.bag, "key_bronze"));
  run("vente : ownedQuantity d'un type absent -> 0", 0, ownedQuantity(tradeState.bag, "coin"));

  const soldPartial = sellItems(tradeState, [{ type: "apple", quantity: 3 }]);
  run("vente : vendre 3 pommes sur 5 -> 2 restent", 2, ownedQuantity(soldPartial.bag, "apple"));
  run("vente : vendre 3 pommes -> argent crédité du total exact", 3 * sellValueOf("apple"), soldPartial.money);
  run("vente : l'original n'est jamais muté", 5, ownedQuantity(tradeState.bag, "apple"));

  const soldMixed = sellItems(tradeState, [
    { type: "apple", quantity: 5 },
    { type: "sneakers", quantity: 1 },
  ]);
  run("vente : vendre tout un stack -> entrée retirée", false, soldMixed.bag.some((e) => e.type === "apple"));
  run("vente : vendre un non-empilable -> son entrée retirée", false, soldMixed.bag.some((e) => e.type === "sneakers"));
  run("vente : total mixte juste", 5 * sellValueOf("apple") + sellValueOf("sneakers"), soldMixed.money);
  run("vente : les objets non vendus restent (clés)", 2, ownedQuantity(soldMixed.bag, "key_bronze"));

  const soldClamped = sellItems(tradeState, [{ type: "apple", quantity: 99 }]);
  run("vente : quantité CLAMPÉE au possédé (jamais de sac négatif)", 0, ownedQuantity(soldClamped.bag, "apple"));
  run("vente : crédit calculé sur la quantité RÉELLEMENT vendue", 5 * sellValueOf("apple"), soldClamped.money);

  run("vente : objet non vendable ignoré -> référence INCHANGÉE", tradeState, sellItems(tradeState, [{ type: "key_bronze", quantity: 2 }]));
  run("vente : type absent du sac -> référence INCHANGÉE", tradeState, sellItems(tradeState, [{ type: "coin", quantity: 1 }]));
  run("vente : liste vide -> référence INCHANGÉE", tradeState, sellItems(tradeState, []));
  run("vente : quantité 0/négative ignorée -> référence INCHANGÉE", tradeState, sellItems(tradeState, [{ type: "apple", quantity: 0 }, { type: "apple", quantity: -2 }]));

  // Save/load : l'état après vente est cohérent.
  const tradeReload = deserializeGame(serializeGame(soldMixed));
  run("vente : save/load réussit après une vente", true, tradeReload.success);
  if (tradeReload.success) {
    run("vente : save/load — argent conservé", soldMixed.money, tradeReload.session.money);
    run.same("vente : save/load — sac conservé", soldMixed.bag, tradeReload.session.bag);
  }

  // --- Achat (core/catalog.js + core/trade.js) : catalogue, stock cyclique, transaction ---
  run("achat : les catalogues standard SHOP_CATALOGS sont valides", false, throws(() => validateShopCatalogs(SHOP_CATALOGS)));
  run("achat : catalogue référençant un objet inconnu -> rejeté", true, throws(() => validateShopCatalogs({ c: { nope: { stock: 1 } } })));
  run("achat : article à stock négatif -> rejeté", true, throws(() => validateShopCatalogs({ c: { apple: { stock: -1 } } })));
  run("achat : article sans prix résolvable (clé sans value) -> rejeté", true, throws(() => validateShopCatalogs({ c: { key_bronze: { stock: 1 } } })));
  run("achat : article avec price explicite mais objet sans value -> accepté", false, throws(() => validateShopCatalogs({ c: { key_bronze: { stock: 1, price: 3 } } })));
  run("achat : validateCatalog { table } inconnue -> rejetée", true, throws(() => validateCatalog({ table: "nope" }, "c", fail)));
  run("achat : validateCatalog table ET items -> rejetée", true, throws(() => validateCatalog({ table: "general", items: {} }, "c", fail)));
  run("achat : articlePrice = price déclaré sinon value de l'objet", true, articlePrice("apple", { stock: 1, price: 9 }) === 9 && articlePrice("apple", { stock: 1 }) === ITEM_REGISTRY.apple.value);
  run.same("achat : fullStockOf reproduit les stocks de la table", { apple: 2, coin: 3 }, fullStockOf({ items: { apple: { stock: 2 }, coin: { stock: 3 } } }));

  const SHOP_REGISTRY = {
    counter: { nameKey: "entity.shop_counter.name", interactable: true, shop: { catalog: { table: "general" } }, action: { kind: "shop" } },
    dog: { nameKey: "entity.dog.name" },
  };
  const shopScene = parseScene(
    {
      id: "movement-check-shop",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 1,
      entities: [
        { id: "counter-1", type: "counter", x: 3 },
        { id: "counter-2", type: "counter", x: 6, shop: { catalog: { items: { apple: { stock: 2, price: 7 } } } } },
        { id: "dog-1", type: "dog", x: 8 },
      ],
    },
    SHOP_REGISTRY
  );
  run("achat : parseScene — shop cascadé depuis l'archétype", "general", shopScene.entities[0].shop.catalog.table);
  run("achat : parseScene — shop surchargé à l'instance (inline)", 7, shopScene.entities[1].shop.catalog.items.apple.price);
  run(
    "achat : parseScene rejette un shop sans catalogue valide",
    true,
    throws(() => parseScene({ id: "s", titleKey: "scene.demo.name", length: 10, playerStart: 1, entities: [{ id: "c", type: "counter", x: 1, shop: {} }] }, SHOP_REGISTRY))
  );

  const shopWorld = (s) => s.worlds[shopScene.id];
  const shopEntity = (s, id) => shopWorld(s).entities.find((e) => e.id === id);
  const shopFresh = { ...createInitialState(shopScene), bag: [] };
  run("achat : avant tout rechargement, les articles sont à stock 0", true, shopArticles(shopEntity(shopFresh, "counter-1")).every((a) => a.stock === 0));

  // Rechargement au CHARGEMENT (cycle de collecte, core/spawn.js) : un point
  // de vente est une source garnie comme un conteneur.
  const shopLoaded = refillDueSpawns(shopFresh, SHOP_REGISTRY);
  run.same("achat : refillDueSpawns recharge le rayon à la valeur de table", fullStockOf({ table: "general" }), shopEntity(shopLoaded, "counter-1").shopStock);
  run("achat : refillDueSpawns note le cycle sur le point de vente", 0, shopEntity(shopLoaded, "counter-1").shopCycle);
  run("achat : catalogue inline -> son propre stock/prix", true, (() => {
    const a = shopArticles(shopEntity(shopLoaded, "counter-2"));
    return a.length === 1 && a[0].type === "apple" && a[0].stock === 2 && a[0].price === 7;
  })());
  run("achat : restockShopIfDue dans le même cycle -> référence INCHANGÉE", shopLoaded, restockShopIfDue(shopLoaded, "counter-1"));
  run("achat : restockShopIfDue sur une entité non marchande -> référence INCHANGÉE", shopLoaded, restockShopIfDue(shopLoaded, "dog-1"));
  run("achat : rechargement PARESSEUX d'un point de vente jamais rechargé", true, (() => {
    const lazy = restockShopIfDue(shopFresh, "counter-1");
    return shopEntity(lazy, "counter-1").shopCycle === 0 && shopArticles(shopEntity(lazy, "counter-1")).some((a) => a.stock > 0);
  })());

  // Transaction : fonds, stock, sac, débit.
  const applePrice = articlePrice("apple", SHOP_CATALOGS.general.apple);
  const appleStock = SHOP_CATALOGS.general.apple.stock;
  const shopRich = addMoney(shopLoaded, 100);

  const bought = buyItems(shopRich, "counter-1", [{ type: "apple", quantity: 3 }]);
  run("achat : acheter 3 pommes -> argent débité du coût exact", 100 - 3 * applePrice, bought.money);
  run("achat : acheter 3 pommes -> pommes au sac", 3, ownedQuantity(bought.bag, "apple"));
  run("achat : acheter 3 pommes -> stock du magasin décrémenté", appleStock - 3, shopEntity(bought, "counter-1").shopStock.apple);
  run("achat : l'original n'est jamais muté", 100, shopRich.money);
  run("achat : l'objet acheté est noté acquis (point unique addItem)", true, Boolean(bought.acquiredItems.apple));

  const boughtAll = buyItems(bought, "counter-1", [{ type: "apple", quantity: 99 }]);
  run("achat : quantité CLAMPÉE au stock", appleStock, ownedQuantity(boughtAll.bag, "apple"));
  run("achat : tout le stock acheté -> article épuisé (0)", 0, shopEntity(boughtAll, "counter-1").shopStock.apple);
  run("achat : article épuisé -> aucun achat possible, référence INCHANGÉE", boughtAll, buyItems(boughtAll, "counter-1", [{ type: "apple", quantity: 1 }]));

  const shopPoor = addMoney(shopLoaded, applePrice - 1);
  run("achat : fonds insuffisants -> référence INCHANGÉE (jamais de débit partiel)", shopPoor, buyItems(shopPoor, "counter-1", [{ type: "apple", quantity: 1 }]));
  run("achat : fonds exacts -> achat accepté, argent à 0", 0, buyItems(addMoney(shopLoaded, applePrice), "counter-1", [{ type: "apple", quantity: 1 }]).money);
  run("achat : article hors catalogue ignoré -> référence INCHANGÉE", shopRich, buyItems(shopRich, "counter-1", [{ type: "combat_boots", quantity: 1 }]));
  run("achat : id non marchand -> référence INCHANGÉE", shopRich, buyItems(shopRich, "dog-1", [{ type: "apple", quantity: 1 }]));
  run("achat : panier vide -> référence INCHANGÉE", shopRich, buyItems(shopRich, "counter-1", []));

  // Cycle suivant sur place : rayon rechargé paresseusement à l'activation.
  const SHOP_DAY = TIME_CONFIG.minutesPerHour * TIME_CONFIG.hoursPerDay;
  const shopNextDay = advanceTime(boughtAll, SHOP_DAY);
  run("achat : jour suivant, avant activation -> stock encore épuisé (rien au tick)", 0, shopEntity(shopNextDay, "counter-1").shopStock.apple);
  const shopRestocked = restockShopIfDue(shopNextDay, "counter-1");
  run("achat : jour suivant, à l'activation -> stock rechargé", appleStock, shopEntity(shopRestocked, "counter-1").shopStock.apple);
  run("achat : rechargement -> cycle 1 noté", 1, shopEntity(shopRestocked, "counter-1").shopCycle);
  run("achat : rechargement -> rachetable", appleStock + 1, ownedQuantity(buyItems(shopRestocked, "counter-1", [{ type: "apple", quantity: 1 }]).bag, "apple"));

  // Save/load : stock du magasin et argent conservés.
  const shopReload = deserializeGame(serializeGame(bought));
  run("achat : save/load réussit", true, shopReload.success);
  if (shopReload.success) {
    run("achat : save/load — argent conservé", bought.money, shopReload.session.money);
    run.same("achat : save/load — stock du magasin conservé", shopEntity(bought, "counter-1").shopStock, shopEntity(shopReload.session, "counter-1").shopStock);
    run("achat : save/load — cycle du magasin conservé (pas de rechargement intempestif)", shopReload.session, restockShopIfDue(shopReload.session, "counter-1"));
  }
  const shopLeaks = [];
  auditNonSerializable(bought, "shopSession", new Set(), shopLeaks);
  run("achat : aucune fuite de non-sérialisable (shopStock/shopCycle)", 0, shopLeaks.length);
}
