// PRÉSENTOIRS du magasin (couche "qu'est-ce qui est exposé aujourd'hui",
// voir doc/entity-model.md/"Présentoirs") — pur, headless. Un présentoir est
// une entité FIXE de la scène qui porte `display: { distribution }` ; à
// chaque cycle de collecte, il tire UN article dans sa table et l'expose
// (`entity.offer`, id d'article) jusqu'à son achat : `offer: null` ensuite,
// emplacement vide jusqu'au prochain garnissage. Un présentoir vu par le
// joueur est VISIBLE (son article se décrit, se sonne) : comme une plage de
// collecte, il ne se regarnit qu'au CHARGEMENT du monde (core/spawn.js/
// refillDueSpawns), jamais paresseusement sur place.
//
// ARTICLE de présentoir (config/shop-values.js/DISPLAY_ARTICLES) : ce qu'on y
// achète, d'UNE des deux natures — un objet du sac ({ item }, prix `price`
// sinon `value` de l'objet) ou une amélioration ({ improvement }, `price`
// obligatoire). Nom et description se DÉDUISENT du registre visé, jamais
// recopiés. Deux articles ne visent jamais la même chose (validé à
// l'import) : l'unicité d'un id d'article EST celle de ce qu'il donne. À ne
// pas confondre avec un article de CATALOGUE de comptoir (core/catalog.js,
// un objet en stock).
//
// TABLE de présentoir : { <article>: <poids> } — mêmes poids que la collecte
// (nombre ou niveau de rareté, core/distribution.js/entryWeight), même issue
// réservée `nothing` (présentoir vide ce jour-là). Référencée par son nom
// ({ table }, DISPLAY_TABLES) ou déclarée inline ({ articles }). Résolue à
// chaque tirage, jamais figée : un monde sauvegardé tire toujours dans la
// table COURANTE.
//
// CONDITION D'APPARITION (`when`, facultative) : une condition du script
// (core/presence.js, MÊME format que partout — jamais un système parallèle),
// lue sur la PARTIE au garnissage : l'article n'est tiré que si elle est
// vraie ce jour-là (ex. le matériel de minage, une fois la lampe-torche
// acquise). Seules les conditions qui ont un sens hors de toute entité y
// sont permises (pas "arrived", "consumed", ni de variable de portée
// "entity" ou "scene"), validées à l'import.
//
// TIRAGE SANS REMISE (drawOffer) : le garnissage d'un monde tire ses
// présentoirs dans un ordre stable (faces, puis entités) en EXCLUANT les
// articles déjà exposés — jamais deux fois le même article dans un magasin —
// et les articles INDISPONIBLES (unavailableArticles) : amélioration déjà
// POSSÉDÉE, ou condition d'apparition fausse. Les deux se lisent sur l'état
// RÉEL de la partie, jamais via le court-circuit debug de hasImprovement
// (il exclurait toutes les améliorations, et ouvrirait toutes les
// conditions) : le magasin montre en debug ce qu'il montrerait en jeu.
// Les poids restants se renormalisent d'eux-mêmes (core/rng.js/
// pickWeighted). Plus aucun article possible : présentoir vide, sans tirage.
//
// Module SÉPARÉ de core/trade.js (comme core/catalog.js) pour que
// core/entity-parse.js, core/save.js et core/spawn.js l'importent sans tirer
// la transaction.

import { DISPLAY_ARTICLES, DISPLAY_TABLES } from "../config/shop-values.js";
import { ITEM_REGISTRY, itemValue } from "./items.js";
import { IMPROVEMENT_REGISTRY, hasImprovement } from "./improvements.js";
import { NOTHING, entryWeight } from "./distribution.js";
import { pickWeighted } from "./rng.js";
import { evaluateCondition, actionContextOf } from "./presence.js";
import { validateCondition } from "./script-parse.js";
import { rejectUnknownFields } from "../lib/validate.js";

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

// Types de condition qui lisent un FAIT d'entité : sans objet au
// garnissage, où aucune entité ne porte la condition (ils vaudraient
// toujours faux, en silence).
const ENTITY_CONDITION_TYPES = ["arrived", "consumed"];

// Tous les types d'une condition, composites parcourus (allOf/anyOf : leurs
// `conditions`, not : sa `condition`). Condition déjà validée.
function conditionTypes(cond) {
  const nested = [...(cond.conditions ?? []), ...(cond.condition ? [cond.condition] : [])];
  return [cond.type, ...nested.flatMap(conditionTypes)];
}

// Valide la condition d'apparition d'un article : le validateur PARTAGÉ du
// script (sans variables d'entité ni de scène : toute référence à ces
// portées y est refusée), puis les types sans objet hors entité. Son
// erreur ("parseScene: ...") est reprise dans celle de l'article.
function validateWhen(when, describe, fail) {
  try {
    validateCondition(when, `${describe}.when`, undefined, undefined);
  } catch (error) {
    fail(error.message.replace(/^parseScene: /, ""));
  }
  const entityType = conditionTypes(when).find((type) => ENTITY_CONDITION_TYPES.includes(type));
  if (entityType) fail(`${describe}.when : condition "${entityType}" sans objet au garnissage (aucune entité ne la porte).`);
}

// --- Articles ---

// Prix d'achat d'un article déjà validé : `price` déclaré, sinon `value` de
// l'objet visé. 0 si aucun des deux (refusé à la validation).
function priceOf(article) {
  if (article.price !== undefined) return article.price;
  return article.item !== undefined ? itemValue(article.item) : 0;
}

// Auto-validation des articles au chargement (voir l'appel plus bas) —
// EXPORTÉE pour être testable contre un registre fabriqué
// (core/checks/display.check.js).
export function validateDisplayArticles(articles) {
  const fail = (message) => {
    throw new Error(`shop-values (DISPLAY_ARTICLES) : ${message}`);
  };
  if (!isPlainObject(articles)) fail("doit être un objet { article: { item | improvement, price? } }.");
  // Ce que chaque article donne ("item:sneakers", "improvement:flashlight") :
  // deux articles ne visent jamais la même chose.
  const targets = new Map();
  for (const [id, article] of Object.entries(articles)) {
    const describe = `article "${id}"`;
    if (id === NOTHING) fail(`"${NOTHING}" est une clé réservée des tables, jamais un article.`);
    if (!isPlainObject(article)) fail(`${describe} doit être un objet.`);
    rejectUnknownFields(article, ["item", "improvement", "price", "sound", "when"], describe, fail);
    if (article.sound !== undefined && (typeof article.sound !== "string" || article.sound === "")) {
      fail(`${describe} : sound doit être un chemin de pool de sons si présent.`);
    }
    if (article.when !== undefined) validateWhen(article.when, describe, fail);
    if ((article.item === undefined) === (article.improvement === undefined)) {
      fail(`${describe} doit déclarer SOIT item SOIT improvement, jamais les deux ni aucun.`);
    }
    if (article.item !== undefined && !Object.hasOwn(ITEM_REGISTRY, article.item)) {
      fail(`${describe} : objet ${JSON.stringify(article.item)} absent de ITEM_REGISTRY.`);
    }
    if (article.improvement !== undefined && !Object.hasOwn(IMPROVEMENT_REGISTRY, article.improvement)) {
      fail(`${describe} : amélioration ${JSON.stringify(article.improvement)} absente de IMPROVEMENT_REGISTRY.`);
    }
    if (article.price !== undefined && (!Number.isInteger(article.price) || article.price <= 0)) {
      fail(`${describe} : price doit être un entier > 0 si présent.`);
    }
    if (priceOf(article) <= 0) {
      fail(`${describe} sans prix résolvable (price, ou value de l'objet ; obligatoire pour une amélioration).`);
    }
    const target = article.item !== undefined ? `item:${article.item}` : `improvement:${article.improvement}`;
    if (targets.has(target)) fail(`${describe} et article "${targets.get(target)}" visent la même chose (${target}).`);
    targets.set(target, id);
  }
}

validateDisplayArticles(DISPLAY_ARTICLES);

// Article RÉSOLU, tel que la vue l'annonce, le sonne et que l'achat
// l'applique : { id, item | improvement, price, labelKey, descriptionKey,
// sound? }. `sound` : celui de l'article, sinon celui de l'objet visé,
// absent sinon (la vue prend alors la balise de repli du présentoir). null
// pour un id inconnu (jamais une exception : un présentoir sauvegardé peut
// citer un article retiré depuis, voir core/save.js/repairEntityReferences).
// `articles` : paramètre pour les vérifications (registre fabriqué).
export function displayArticleInfo(id, articles = DISPLAY_ARTICLES) {
  if (typeof id !== "string" || !Object.hasOwn(articles, id)) return null;
  const article = articles[id];
  const price = priceOf(article);
  const withSound = (info, fallback) => {
    const sound = article.sound ?? fallback;
    return sound === undefined ? info : { ...info, sound };
  };
  if (article.item !== undefined) {
    const props = ITEM_REGISTRY[article.item];
    return withSound({ id, item: article.item, price, labelKey: props.label, descriptionKey: props.descriptionKey }, props.sound);
  }
  const props = IMPROVEMENT_REGISTRY[article.improvement];
  return withSound({ id, improvement: article.improvement, price, labelKey: props.labelKey, descriptionKey: props.descriptionKey });
}

// Article exposé par un présentoir, résolu — null si le présentoir est vide
// (vendu, tirage "rien", jamais garni) ou n'en est pas un.
export function offeredArticle(entity) {
  if (!entity || !entity.display || entity.offer === undefined || entity.offer === null) return null;
  return displayArticleInfo(entity.offer);
}

// Clé du NOM sous lequel une entité se présente au joueur (occupation, menu
// de choix) : l'article exposé pour un présentoir garni — on s'approche
// d'une lampe-torche, pas d'un meuble —, son propre nom sinon (présentoir
// vide compris).
export function presentedLabelKey(entity) {
  const article = offeredArticle(entity);
  return article ? article.labelKey : entity.labelKey;
}

// Articles INDISPONIBLES ce jour-là pour la partie : exclus de tout tirage.
// Une amélioration que la partie POSSÈDE déjà, ou une condition
// d'apparition (`when`) fausse — les deux lues sur l'état RÉEL (voir
// header : `debugShortCircuit: false`). Contexte d'une condition d'action
// (heure, météo, variables de partie, équipement du joueur...), sans
// entité. Un Set NEUF à chaque appel : le garnissage y ajoute ensuite ce
// qu'il expose (core/spawn.js).
export function unavailableArticles(session, articles = DISPLAY_ARTICLES) {
  const context = { ...actionContextOf(session, undefined), debugShortCircuit: false };
  const unavailable = new Set();
  for (const [id, article] of Object.entries(articles)) {
    const owned = article.improvement !== undefined && hasImprovement(session.improvements, article.improvement);
    if (owned || (article.when !== undefined && !evaluateCondition(article.when, context))) unavailable.add(id);
  }
  return unavailable;
}

// --- Tables ---

// Une table d'articles : au moins une entrée, chaque clé un article connu
// (ou NOTHING), chaque poids fini >= 0, et au moins un VRAI article de poids
// > 0 — un présentoir qui ne pourrait jamais rien exposer est une erreur de
// contenu (même exigence que core/distribution.js/validateDistribution).
function validateArticleTable(table, describe, fail, articles) {
  if (!isPlainObject(table)) fail(`${describe} doit être un objet { article: poids }.`);
  const entries = Object.entries(table);
  if (entries.length === 0) fail(`${describe} est vide.`);
  let canOffer = false;
  for (const [id, value] of entries) {
    if (id !== NOTHING && !Object.hasOwn(articles, id)) {
      fail(`${describe} : article "${id}" absent de DISPLAY_ARTICLES.`);
    }
    const weight = entryWeight(value);
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      fail(`${describe} : poids invalide pour "${id}" (${JSON.stringify(value)}) — un nombre, ou un niveau de rareté.`);
    }
    if (id !== NOTHING && weight > 0) canOffer = true;
  }
  if (!canOffer) fail(`${describe} ne peut jamais exposer d'article (que "${NOTHING}").`);
}

// Auto-validation des tables STANDARD au chargement (voir l'appel plus bas).
export function validateDisplayTables(tables, articles = DISPLAY_ARTICLES) {
  const fail = (message) => {
    throw new Error(`shop-values (DISPLAY_TABLES) : ${message}`);
  };
  if (!isPlainObject(tables)) fail("doit être un objet { table: { article: poids } }.");
  for (const [name, table] of Object.entries(tables)) {
    validateArticleTable(table, `table "${name}"`, fail, articles);
  }
}

validateDisplayTables(DISPLAY_TABLES);

// Valide la DISTRIBUTION d'un présentoir — `fail` fourni par l'appelant
// (core/entity-parse.js/parseDisplay, core/save.js à la relecture).
// EXACTEMENT une des deux formes : { table } (nom de DISPLAY_TABLES) ou
// { articles } (table inline).
export function validateDisplayDistribution(distribution, describe, fail) {
  if (!isPlainObject(distribution)) fail(`${describe} doit être un objet { table } ou { articles }.`);
  rejectUnknownFields(distribution, ["table", "articles"], describe, fail);
  const { table, articles } = distribution;
  if ((table === undefined) === (articles === undefined)) {
    fail(`${describe} doit déclarer SOIT table SOIT articles, jamais les deux ni aucun.`);
  }
  if (table !== undefined) {
    if (typeof table !== "string" || !Object.hasOwn(DISPLAY_TABLES, table)) {
      fail(`${describe} : table ${JSON.stringify(table)} absente de DISPLAY_TABLES.`);
    }
    return;
  }
  validateArticleTable(articles, `${describe}.articles`, fail, DISPLAY_ARTICLES);
}

// Poids NUMÉRIQUES d'une distribution déjà validée (noms de rareté résolus).
function displayWeights(distribution) {
  const table = distribution.table !== undefined ? DISPLAY_TABLES[distribution.table] : distribution.articles;
  return Object.fromEntries(Object.entries(table).map(([id, value]) => [id, entryWeight(value)]));
}

// Tire l'article du jour d'un présentoir, SANS REMISE : `excluded` (Set
// d'ids) écarte les articles déjà exposés ailleurs dans le magasin et ceux
// d'une amélioration possédée (voir header). `nothing` n'est jamais exclu.
// Rend { offer: id | null, rngState } ; un tirage consommé, sauf s'il ne
// reste aucun article possible (présentoir vide sans tirage — le résultat
// ne dépend toujours que de l'état, déterminisme préservé). Distribution
// `null` (neutralisée à la relecture d'une sauvegarde) : vide.
export function drawOffer(distribution, excluded, rngState) {
  if (distribution === null) return { offer: null, rngState };
  const weights = Object.fromEntries(Object.entries(displayWeights(distribution)).filter(([id]) => !excluded.has(id)));
  const canOffer = Object.entries(weights).some(([id, weight]) => id !== NOTHING && weight > 0);
  if (!canOffer) return { offer: null, rngState };
  const picked = pickWeighted(weights, rngState);
  return { offer: picked.key === NOTHING ? null : picked.key, rngState: picked.rngState };
}
