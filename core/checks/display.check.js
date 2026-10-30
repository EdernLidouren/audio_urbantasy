// Vérifications du core — domaine « display ». Présentoirs du magasin
// (core/display.js : articles, tables, tirage sans remise ; core/spawn.js :
// garnissage ; core/trade.js/buyOfferedArticle : achat ; core/save.js :
// relecture). Lancées par core/checks/index.js/runChecks. Pur : aucun DOM,
// aucun fetch ; chaque scène est construite en dur via parseScene.

import { parseScene } from "../scene.js";
import { createInitialState } from "../state.js";
import { serializeGame, deserializeGame } from "../save.js";
import { addMoney } from "../money.js";
import { advanceTime } from "../time.js";
import { giveImprovement } from "../improvements.js";
import { ITEM_REGISTRY } from "../items.js";
import { TIME_CONFIG } from "../../config/time-values.js";
import { DISPLAY_ARTICLES, DISPLAY_TABLES } from "../../config/shop-values.js";
import { refillDueSpawns } from "../spawn.js";
import { buyOfferedArticle, ownedQuantity } from "../trade.js";
import {
  validateDisplayArticles,
  validateDisplayTables,
  validateDisplayDistribution,
  displayArticleInfo,
  offeredArticle,
  presentedLabelKey,
  ownedImprovementArticles,
  drawOffer,
} from "../display.js";
import { auditNonSerializable, throws, fail } from "../../lib/check.js";

export default function checkDisplay(run) {
  // --- Articles (config/shop-values.js/DISPLAY_ARTICLES) ---

  run("articles : DISPLAY_ARTICLES est valide", false, throws(() => validateDisplayArticles(DISPLAY_ARTICLES)));
  run("articles : item ET improvement -> rejeté", true, throws(() => validateDisplayArticles({ a: { item: "sneakers", improvement: "flashlight", price: 5 } })));
  run("articles : ni item ni improvement -> rejeté", true, throws(() => validateDisplayArticles({ a: { price: 5 } })));
  run("articles : objet inconnu -> rejeté", true, throws(() => validateDisplayArticles({ a: { item: "nope" } })));
  run("articles : amélioration inconnue -> rejetée", true, throws(() => validateDisplayArticles({ a: { improvement: "nope", price: 5 } })));
  run("articles : amélioration sans price -> rejetée", true, throws(() => validateDisplayArticles({ a: { improvement: "flashlight" } })));
  run("articles : objet sans value ni price -> rejeté", true, throws(() => validateDisplayArticles({ a: { item: "key_bronze" } })));
  run("articles : objet sans value mais avec price -> accepté", false, throws(() => validateDisplayArticles({ a: { item: "key_bronze", price: 3 } })));
  run("articles : price non entier positif -> rejeté", true, throws(() => validateDisplayArticles({ a: { item: "sneakers", price: 0 } })));
  run("articles : champ inconnu -> rejeté", true, throws(() => validateDisplayArticles({ a: { item: "sneakers", stock: 1 } })));
  run(
    "articles : deux articles visant le même objet -> rejetés",
    true,
    throws(() => validateDisplayArticles({ a: { item: "sneakers" }, b: { item: "sneakers", price: 9 } }))
  );
  run("articles : un article nommé « nothing » -> rejeté", true, throws(() => validateDisplayArticles({ nothing: { item: "sneakers" } })));

  const flashlight = displayArticleInfo("flashlight");
  run("articles : amélioration résolue (nature, prix, nom du registre)", true,
    flashlight.improvement === "flashlight" && flashlight.item === undefined && flashlight.price === DISPLAY_ARTICLES.flashlight.price && flashlight.labelKey === "improvement.flashlight.name");
  const sneakers = displayArticleInfo("sneakers");
  run("articles : objet résolu, prix par défaut = value de l'objet", true,
    sneakers.item === "sneakers" && sneakers.improvement === undefined && sneakers.price === ITEM_REGISTRY.sneakers.value && sneakers.labelKey === ITEM_REGISTRY.sneakers.label);
  run("articles : id inconnu -> null, jamais une exception", null, displayArticleInfo("nope"));
  run("articles : son de l'article repris (amélioration)", DISPLAY_ARTICLES.flashlight.sound, flashlight.sound);
  // Registre fabriqué : aucun article réel ne vise encore un objet sonore.
  run("articles : sans son déclaré, le son de l'objet visé", ITEM_REGISTRY.resistor.sound,
    displayArticleInfo("r", { r: { item: "resistor" } }).sound);
  run("articles : objet sans son -> aucun son (repli du présentoir côté vue)", undefined, sneakers.sound);
  run("articles : sound vide -> rejeté", true, throws(() => validateDisplayArticles({ a: { item: "sneakers", sound: "" } })));
  run.same(
    "articles : ownedImprovementArticles lit les améliorations possédées",
    ["flashlight"],
    [...ownedImprovementArticles(giveImprovement({}, "flashlight"))]
  );
  run("articles : aucune amélioration possédée -> aucun article exclu", 0, ownedImprovementArticles({}).size);

  // --- Tables et distributions ---

  run("tables : DISPLAY_TABLES est valide", false, throws(() => validateDisplayTables(DISPLAY_TABLES)));
  run("tables : article inconnu -> rejeté", true, throws(() => validateDisplayTables({ t: { nope: 1 } })));
  run("tables : table vide -> rejetée", true, throws(() => validateDisplayTables({ t: {} })));
  run("tables : rien que « nothing » -> rejetée", true, throws(() => validateDisplayTables({ t: { nothing: 1 } })));
  run("tables : poids invalide -> rejeté", true, throws(() => validateDisplayTables({ t: { sneakers: "very_rare" } })));
  run("tables : niveau de rareté et « nothing » acceptés", false, throws(() => validateDisplayTables({ t: { sneakers: "rare", nothing: 2 } })));
  run("distribution : { table } connue -> acceptée", false, throws(() => validateDisplayDistribution({ table: "equipment" }, "d", fail)));
  run("distribution : { table } inconnue -> rejetée", true, throws(() => validateDisplayDistribution({ table: "nope" }, "d", fail)));
  run("distribution : table ET articles -> rejetée", true, throws(() => validateDisplayDistribution({ table: "equipment", articles: { sneakers: 1 } }, "d", fail)));
  run("distribution : clé inconnue -> rejetée", true, throws(() => validateDisplayDistribution({ items: { sneakers: 1 } }, "d", fail)));
  run("distribution : { articles } inline valide -> acceptée", false, throws(() => validateDisplayDistribution({ articles: { sneakers: 1 } }, "d", fail)));

  // --- Tirage sans remise (drawOffer) ---

  const RNG = 12345;
  const shoes = { articles: { sneakers: 1, leather_boots: 1 } };
  run("tirage : même PRNG -> même article", drawOffer(shoes, new Set(), RNG).offer, drawOffer(shoes, new Set(), RNG).offer);
  run("tirage : un article exclu n'est jamais tiré", "leather_boots", drawOffer(shoes, new Set(["sneakers"]), RNG).offer);
  run.same("tirage : tout exclu -> vide, sans tirage", { offer: null, rngState: RNG }, drawOffer(shoes, new Set(["sneakers", "leather_boots"]), RNG));
  run.same(
    "tirage : seul « nothing » reste -> vide, sans tirage",
    { offer: null, rngState: RNG },
    drawOffer({ articles: { sneakers: 1, nothing: 3 } }, new Set(["sneakers"]), RNG)
  );
  run.same("tirage : distribution neutralisée -> vide", { offer: null, rngState: RNG }, drawOffer(null, new Set(), RNG));

  // --- Parsing ---

  const DISPLAY_REGISTRY = {
    stand: { nameKey: "entity.dog.name", interactable: true, display: { distribution: { table: "equipment" } } },
    dog: { nameKey: "entity.dog.name" },
  };
  const rawScene = (entities) => ({ id: "display-check-shop", titleKey: "scene.demo.name", length: 20, playerStart: 1, entities });
  const shopScene = parseScene(
    rawScene([
      { id: "improvement-stand", type: "stand", x: 2, display: { distribution: { table: "improvements" } } },
      { id: "shoes-1", type: "stand", x: 4 },
      { id: "shoes-2", type: "stand", x: 6 },
      { id: "shoes-3", type: "stand", x: 8 },
      { id: "shoes-4", type: "stand", x: 10 },
      { id: "shoes-5", type: "stand", x: 12 },
      { id: "dog-1", type: "dog", x: 14 },
    ]),
    DISPLAY_REGISTRY
  );
  run("parsing : display cascadé depuis l'archétype", "equipment", shopScene.entities[1].display.distribution.table);
  run("parsing : display surchargé à l'instance", "improvements", shopScene.entities[0].display.distribution.table);
  run("parsing : display + container -> rejeté", true,
    throws(() => parseScene(rawScene([{ id: "s", type: "stand", x: 2, container: { distribution: { table: "default" } } }]), DISPLAY_REGISTRY)));
  run("parsing : display sans distribution valide -> rejeté", true,
    throws(() => parseScene(rawScene([{ id: "s", type: "stand", x: 2, display: { distribution: { table: "nope" } } }]), DISPLAY_REGISTRY)));
  run("parsing : action « buy » sans display -> rejetée", true,
    throws(() => parseScene(rawScene([{ id: "s", type: "dog", x: 2, interactable: true, action: { kind: "buy" } }]), DISPLAY_REGISTRY)));
  run("parsing : action « buy » sur un présentoir -> acceptée", false,
    throws(() => parseScene(rawScene([{ id: "s", type: "stand", x: 2, action: { kind: "buy" } }]), DISPLAY_REGISTRY)));
  run("parsing : champ inconnu dans display -> rejeté", true,
    throws(() => parseScene(rawScene([{ id: "s", type: "stand", x: 2, display: { distribution: { table: "equipment" }, count: 2 } }]), DISPLAY_REGISTRY)));

  // --- Garnissage (core/spawn.js/refillDueSpawns) ---

  const world = (s) => s.worlds[shopScene.id];
  const entity = (s, id) => world(s).entities.find((e) => e.id === id);
  const offerOf = (s, id) => entity(s, id).offer;
  const shoeIds = ["shoes-1", "shoes-2", "shoes-3", "shoes-4", "shoes-5"];
  const fresh = createInitialState(shopScene);
  run("garnissage : avant le premier garnissage, aucun article exposé", null, offeredArticle(entity(fresh, "shoes-1")));

  const loaded = refillDueSpawns(fresh, DISPLAY_REGISTRY);
  const equipmentCount = Object.keys(DISPLAY_TABLES.equipment).length;
  const shoeOffers = shoeIds.map((id) => offerOf(loaded, id)).filter((offer) => offer !== null);
  run("garnissage : l'amélioration non possédée est exposée", "flashlight", offerOf(loaded, "improvement-stand"));
  run("garnissage : autant de présentoirs garnis que d'articles dans la table", equipmentCount, shoeOffers.length);
  run("garnissage : jamais deux fois le même article", shoeOffers.length, new Set(shoeOffers).size);
  run("garnissage : table épuisée -> le présentoir suivant reste vide", null, offerOf(loaded, "shoes-5"));
  run("garnissage : une entité qui n'est pas un présentoir n'a pas d'offre", undefined, entity(loaded, "dog-1").offer);
  run("nom présenté : présentoir garni -> nom de son article", "improvement.flashlight.name", presentedLabelKey(entity(loaded, "improvement-stand")));
  run("nom présenté : présentoir vide -> son propre nom", "entity.dog.name", presentedLabelKey(entity(loaded, "shoes-5")));
  run("nom présenté : autre entité -> son propre nom", "entity.dog.name", presentedLabelKey(entity(loaded, "dog-1")));
  run("garnissage : même seed -> mêmes articles", shoeIds.map((id) => offerOf(loaded, id)).join(","),
    shoeIds.map((id) => offerOf(refillDueSpawns(fresh, DISPLAY_REGISTRY), id)).join(","));
  run("garnissage : déjà fait ce cycle -> référence INCHANGÉE", loaded, refillDueSpawns(loaded, DISPLAY_REGISTRY));

  const owning = { ...fresh, improvements: giveImprovement(fresh.improvements, "flashlight") };
  run("garnissage : amélioration déjà possédée -> jamais exposée", null, offerOf(refillDueSpawns(owning, DISPLAY_REGISTRY), "improvement-stand"));

  // --- Achat (core/trade.js/buyOfferedArticle) ---

  const price = DISPLAY_ARTICLES.flashlight.price;
  const poor = addMoney(loaded, price - 1);
  const refused = buyOfferedArticle(poor, "improvement-stand");
  run("achat : fonds insuffisants -> refus", "insufficientFunds", refused.status);
  run("achat : fonds insuffisants -> référence INCHANGÉE", poor, refused.session);

  const rich = addMoney(loaded, price + 50);
  const bought = buyOfferedArticle(rich, "improvement-stand");
  run("achat : amélioration achetée", "bought", bought.status);
  run("achat : amélioration acquise", true, Boolean(bought.session.improvements.flashlight));
  run("achat : prix débité", 50, bought.session.money);
  run("achat : présentoir vidé", null, offerOf(bought.session, "improvement-stand"));
  run("achat : l'original n'est jamais muté", "flashlight", offerOf(rich, "improvement-stand"));
  run("achat : présentoir vidé -> « empty », référence INCHANGÉE", true, (() => {
    const again = buyOfferedArticle(bought.session, "improvement-stand");
    return again.status === "empty" && again.session === bought.session;
  })());

  const owned = { ...rich, improvements: giveImprovement(rich.improvements, "flashlight") };
  const ownedResult = buyOfferedArticle(owned, "improvement-stand");
  run("achat : amélioration obtenue ailleurs depuis -> « alreadyOwned »", "alreadyOwned", ownedResult.status);
  run("achat : « alreadyOwned » -> référence INCHANGÉE", owned, ownedResult.session);

  const shoe = offerOf(loaded, "shoes-1");
  const shoeArticle = displayArticleInfo(shoe);
  const shoeBought = buyOfferedArticle(addMoney(loaded, shoeArticle.price), "shoes-1");
  run("achat : objet acheté -> au sac", 1, ownedQuantity(shoeBought.session.bag, shoeArticle.item));
  run("achat : objet acheté -> noté acquis (point unique addItem)", true, Boolean(shoeBought.session.acquiredItems[shoeArticle.item]));
  run("achat : objet acheté -> argent à 0", 0, shoeBought.session.money);
  run("achat : id qui n'est pas un présentoir -> status null", null, buyOfferedArticle(rich, "dog-1").status);

  // Lendemain : tout est re-tiré, l'amélioration achetée ne revient plus.
  const DAY = TIME_CONFIG.minutesPerHour * TIME_CONFIG.hoursPerDay;
  const nextDay = refillDueSpawns(advanceTime(bought.session, DAY), DISPLAY_REGISTRY);
  run("lendemain : l'amélioration achetée n'est plus jamais exposée", null, offerOf(nextDay, "improvement-stand"));
  run("lendemain : les autres présentoirs sont re-garnis", equipmentCount, shoeIds.filter((id) => offerOf(nextDay, id) !== null).length);
  const shoeNextDay = refillDueSpawns(advanceTime(shoeBought.session, DAY), DISPLAY_REGISTRY);
  run("lendemain : un objet acheté peut revenir (seules les améliorations sont exclues)", equipmentCount,
    shoeIds.filter((id) => offerOf(shoeNextDay, id) !== null).length);

  // --- Sauvegarde ---

  const reload = deserializeGame(serializeGame(bought.session));
  run("save : relecture réussie", true, reload.success);
  if (reload.success) {
    run.same("save : articles exposés conservés", shoeIds.map((id) => offerOf(bought.session, id)), shoeIds.map((id) => offerOf(reload.session, id)));
    run("save : présentoir vendu reste vide", null, offerOf(reload.session, "improvement-stand"));
    run("save : rien de neutralisé dans une partie saine", 0, reload.brokenReferences.length);
  }

  // Une sauvegarde fige les présentoirs : table ou article disparus depuis
  // sont neutralisés et listés, jamais un plantage.
  const envelope = serializeGame(loaded);
  const brokenWorld = {
    ...envelope.data.worlds[shopScene.id],
    spawnCycle: undefined,
    entities: envelope.data.worlds[shopScene.id].entities.map((e) => {
      if (e.id === "shoes-1") return { ...e, offer: "article_that_no_longer_exists" };
      if (e.id === "shoes-2") return { ...e, display: { distribution: { table: "table_that_no_longer_exists" } } };
      return e;
    }),
  };
  const broken = deserializeGame({ ...envelope, data: { ...envelope.data, worlds: { ...envelope.data.worlds, [shopScene.id]: brokenWorld } } });
  run("save références : partie chargée malgré des présentoirs cassés", true, broken.success);
  if (broken.success) {
    run("save références : article inconnu -> présentoir vide", null, offerOf(broken.session, "shoes-1"));
    run("save références : table inconnue -> neutralisée", null, entity(broken.session, "shoes-2").display.distribution);
    run("save références : chaque neutralisation listée", "shoes-1,shoes-2", broken.brokenReferences.map((r) => r.source).sort().join(","));
    const regarnished = refillDueSpawns(broken.session, DISPLAY_REGISTRY);
    run("save références : présentoir neutralisé -> vide au garnissage, sans erreur", null, offerOf(regarnished, "shoes-2"));
  }

  const leaks = [];
  auditNonSerializable(bought.session, "displaySession", new Set(), leaks);
  run("save : aucune fuite de non-sérialisable (offer)", 0, leaks.length);
}
