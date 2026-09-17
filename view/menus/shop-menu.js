// POINT DE VENTE (voir doc/entity-model.md/"Vente et achat", entities/types/
// shop_counter.js) — écrans sur la pile (lib/screens.js) :
//   1. MENU D'ACTIONS (lib/menu.js) : "Acheter", "Vendre", "Annuler". TOUJOURS
//      un menu — même prévisibilité que view/menus/inventory-menu.js.
//   2. MENU À SLIDERS INLINE (écran CUSTOM, openQuantityList ci-dessous), UN
//      SEUL écran paramétré pour la VENTE (lignes = objets vendables du sac,
//      plafond = possédé) et l'ACHAT (lignes = articles du catalogue, plafond
//      = STOCK, condition d'incrément = ARGENT). Écran custom plutôt qu'un
//      slider lib/menu.js pour les mêmes raisons structurelles que le
//      sélecteur de quantité de l'inventaire (valeur TRANSITOIRE, pas une
//      préférence persistée ; Entrée = +1 ; Suppr = 0 ; Maj = grand pas) —
//      voir view/menus/inventory-menu.js/openQuantitySelector.
// ERGONOMIE lecteur d'écran : l'entrée COMPLÈTE n'est dite qu'à la
// NAVIGATION ; un ajustement n'annonce que "<quantité>, <sous-total de la
// ligne>" (fluide en ajustement répété, maintien de touche compris) ; le
// GRAND TOTAL est à la demande (Retour arrière) — jamais imposé à chaque cran.
// Les TRANSACTIONS sont des effets d'état du core (core/trade.js/sellItems,
// buyItems), appliqués par les gestionnaires injectés depuis
// view/city-screen.js — ce module ne lit la session qu'en LECTURE.

import { t } from "../../data/i18n/index.js";
import { pushScreen, popScreen, composeHook } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { announce } from "../../lib/announce.js";
import { playMenuSound } from "../menu-sounds.js";
import { resolveAction, checkBindingsForCollisions, isHeld, isModActive } from "../../lib/input.js";
import { getPref } from "../../config/preferences.js";
import { ITEM_REGISTRY } from "../../core/items.js";
import { getActiveWorld } from "../../core/state.js";
import { isSellable, sellValueOf, ownedQuantity, shopArticles } from "../../core/trade.js";

// (sales: [{ type, quantity }]) => void — effet d'ÉTAT de la vente
// (core/trade.js/sellItems), fourni par city-screen.js qui seul détient
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

// Bindings du menu à sliders. Entrée/Espace : +1 sur une ligne, ACTIVE une
// entrée d'action ("Valider"/"Annuler"). Maj+flèche : grand pas (±5).
// Suppr : remise à 0. Retour arrière : grand total. Maj+A : valider depuis
// n'importe où. Maj+G : argent actuel (même annonce que "g" en ville) — Maj
// parce que les lettres NUES restent réservées à un futur saut par initiale
// dans les listes d'objets. Chaque combinaison est une action DISTINCTE
// (mods exige une correspondance EXACTE, voir lib/input.js).
const LIST_BINDINGS = {
  up: { keys: ["ArrowUp"], mods: [] },
  down: { keys: ["ArrowDown"], mods: [] },
  home: { keys: ["Home"], mods: [] },
  end: { keys: ["End"], mods: [] },
  decrease: { keys: ["ArrowLeft"], mods: [] },
  decreaseBig: { keys: ["ArrowLeft"], mods: ["shift"] },
  increase: { keys: ["ArrowRight"], mods: [] },
  increaseBig: { keys: ["ArrowRight"], mods: ["shift"] },
  reset: { keys: ["Delete"], mods: [] },
  confirm: { keys: ["Enter", " "], mods: [] },
  total: { keys: ["Backspace"], mods: [] },
  validate: { keys: ["a"], mods: ["shift"] },
  money: { keys: ["g"], mods: ["shift"] },
  cancel: { keys: ["Escape"], mods: [] },
};
checkBindingsForCollisions(LIST_BINDINGS, "view/menus/shop-menu.js LIST_BINDINGS");

const STEP = 1;
const BIG_STEP = 5;
// Maintien gauche/droite — mêmes rythmes que lib/menu.js : un DÉLAI INITIAL
// après le premier cran (une pression brève n'en produit jamais qu'un), puis
// une cadence de répétition.
const SLIDER_REPEAT_DELAY_MS = 400;
const SLIDER_REPEAT_INTERVAL_MS = 150;

function stripTrailingPeriod(text) {
  return text.endsWith(".") ? text.slice(0, -1) : text;
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

function selectedCount(lines) {
  return lines.reduce((count, line) => count + line.selected, 0);
}

function selectedTotal(lines) {
  return lines.reduce((total, line) => total + line.selected * line.price, 0);
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

// Menu à SLIDERS INLINE, générique vente/achat (voir header). `spec` :
//   getSession       — lecture de la session (argent, Maj+G)
//   lines            — lignes { type, labelKey, descriptionKey, max, price, selected }
//   entryKey         — gabarit de l'entrée complète ({item, selected, max, price, description})
//   soldOutKey?      — gabarit d'une ligne à max 0 (achat : "épuisé")
//   totalKey         — gabarit du titre/grand total ({count, total})
//   validateKey, nothingSelectedKey
//   allowedIncrease(line, delta) -> { delta, refusalKey? } — ce que la
//                      CONDITION d'incrément (argent, pour l'achat) autorise
//                      de `delta` (déjà borné au plafond `max`)
//   onValidate(lines)
// Balises : le menu d'actions juste dessous les a déjà mises en pause.
function openQuantityList(spec) {
  const { lines } = spec;
  const actions = [
    { label: spec.validateKey, onActivate: () => validate() },
    { label: "shop.list.cancel", onActivate: () => cancel() },
  ];
  const total = () => lines.length + actions.length;
  let cursor = 0;
  // Instant à partir duquel le maintien peut produire son prochain cran
  // (voir lib/menu.js, même mécanisme).
  let nextRepeatAt = -Infinity;

  const isLine = (index) => index < lines.length;

  function position(index) {
    if (!getPref("menuIndexSuffix", true)) return "";
    return t("menu.position", { index: index + 1, total: total() });
  }

  // Ligne COMPLÈTE d'une entrée (navigation, ouverture, Retour arrière).
  function entryLine(index) {
    const suffix = position(index);
    let text;
    if (isLine(index)) {
      const line = lines[index];
      const key = line.max === 0 && spec.soldOutKey ? spec.soldOutKey : spec.entryKey;
      text = t(key, {
        item: t(line.labelKey),
        selected: line.selected,
        max: line.max,
        price: line.price,
        description: stripTrailingPeriod(t(line.descriptionKey)),
      });
    } else {
      text = t(actions[index - lines.length].label);
    }
    return suffix ? `${text}. ${suffix}` : text;
  }

  // Titre = grand total courant.
  function title() {
    return t(spec.totalKey, { count: selectedCount(lines), total: selectedTotal(lines) });
  }

  function announceStarred(text, starred) {
    announce(starred && getPref("menuStarPrefix", true) ? `* ${text}` : text, { assertive: true });
  }

  function moveCursor(delta) {
    const count = total();
    const atStart = cursor === 0 && delta < 0;
    const atEnd = cursor === count - 1 && delta > 0;
    if (atStart || atEnd) {
      const cycling = getPref("menuCycling", false);
      playMenuSound(cycling ? "wrap" : "block");
      if (cycling) cursor = (cursor + delta + count) % count;
      announceStarred(entryLine(cursor), true);
      return;
    }
    cursor += delta;
    announce(entryLine(cursor), { assertive: true });
  }

  function moveCursorTo(index) {
    const previous = cursor;
    cursor = index;
    announceStarred(entryLine(cursor), previous === cursor);
  }

  function announceLine(line) {
    announce(t("shop.adjust", { selected: line.selected, subtotal: line.selected * line.price }), { assertive: true });
  }

  // Ajustement : PLANCHER 0, PLAFOND `max` (borne STRUCTURELLE, sonne
  // "block" sans message) ; puis, pour un incrément, la CONDITION de
  // `allowedIncrease` (argent) — SEULE source de refus avec message, et
  // c'est le son "refusal" (voir view/menu-sounds.js) qui l'accompagne.
  // Annonce : quantité + SOUS-TOTAL de la ligne, rien d'autre. `nextDelayMs`
  // : délai avant le prochain cran de maintien (long après un appui, court
  // entre deux crans de maintien) — posé même sur un refus, pour qu'un
  // maintien à la borne ne mitraille pas le son "block".
  function adjust(direction, big, nextDelayMs = SLIDER_REPEAT_DELAY_MS) {
    nextRepeatAt = performance.now() + nextDelayMs;
    if (!isLine(cursor)) {
      playMenuSound("block");
      return;
    }
    const line = lines[cursor];
    const wanted = line.selected + direction * (big ? BIG_STEP : STEP);
    const bounded = Math.min(Math.max(wanted, 0), line.max);
    let delta = bounded - line.selected;
    if (delta > 0 && spec.allowedIncrease) {
      const allowed = spec.allowedIncrease(line, delta);
      if (allowed.delta <= 0) {
        playMenuSound("refusal");
        announce(t(allowed.refusalKey), { assertive: true });
        return;
      }
      delta = allowed.delta;
    }
    playMenuSound(bounded === wanted && delta !== 0 ? "toggle" : "block");
    line.selected += delta;
    announceLine(line);
  }

  function reset() {
    if (!isLine(cursor)) {
      playMenuSound("block");
      return;
    }
    const line = lines[cursor];
    playMenuSound(line.selected === 0 ? "block" : "toggle");
    line.selected = 0;
    announceLine(line);
  }

  // Entrée/Espace : +1 sur une ligne, activation sur une action.
  function confirm() {
    if (isLine(cursor)) {
      adjust(1, false);
      return;
    }
    playMenuSound("select");
    actions[cursor - lines.length].onActivate();
  }

  // Validation : rien de sélectionné -> son "refusal" + annonce seule,
  // jamais une confirmation vide ; sinon confirmation DÉTAILLÉE (voir
  // onValidate).
  function validate() {
    if (selectedCount(lines) === 0) {
      playMenuSound("refusal");
      announce(t(spec.nothingSelectedKey), { assertive: true });
      return;
    }
    spec.onValidate(lines);
  }

  // Annulation : sélection vide -> fermeture DIRECTE (ouvrir/fermer "pour
  // voir" ne doit pas frictionner) ; sélection en cours -> confirmation
  // d'abandon (protège le brouillon).
  function cancel() {
    if (selectedCount(lines) === 0) {
      playMenuSound("cancel");
      popScreen();
      return;
    }
    openDiscardConfirmation();
  }

  const keyHandlers = {
    up: () => moveCursor(-1),
    down: () => moveCursor(1),
    home: () => moveCursorTo(0),
    end: () => moveCursorTo(total() - 1),
    decrease: () => adjust(-1, false),
    decreaseBig: () => adjust(-1, true),
    increase: () => adjust(1, false),
    increaseBig: () => adjust(1, true),
    reset: () => reset(),
    confirm: () => confirm(),
    total: () => announce(`${title()}. ${entryLine(cursor)}`, { assertive: true }),
    validate: () => validate(),
    // Même clé/gabarit que la touche "g" en ville (view/city-screen.js/
    // announceMoney) — relu dans la session, jamais un cumul du menu.
    money: () => announce(t("money.announce", { amount: spec.getSession().money }), { assertive: true }),
    cancel: () => cancel(),
  };

  pushScreen({
    onEnter() {
      // Ouverture ET retour depuis une confirmation (sélection préservée :
      // `lines` vit dans ce closure) — titre + entrée courante, comme un
      // écran-menu lib/menu.js.
      announce(`${title()}. ${entryLine(cursor)}`, { assertive: true });
    },
    // Maintien gauche/droite sur une ligne (même modèle que lib/menu.js :
    // isHeld relu au tick, Maj relue à chaque déclenchement).
    onTick() {
      if (!isLine(cursor)) return;
      const left = isHeld("ArrowLeft");
      const right = isHeld("ArrowRight");
      if (left === right) return;
      if (performance.now() < nextRepeatAt) return;
      adjust(left ? -1 : 1, isModActive("shift"), SLIDER_REPEAT_INTERVAL_MS);
    },
    onKeyDown(event) {
      const action = resolveAction(LIST_BINDINGS, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    },
  });
}

// Confirmation de TRANSACTION (destructive) : "Annuler" en première entrée
// (curseur par défaut, une pression rapide d'Entrée reste sans effet),
// "Confirmer" ensuite — même patron que main-menu.js/openNewGameConfirmation.
// Titre DYNAMIQUE (lib/menu.js/titleParams) : total + récapitulatif.
// Confirmer -> `apply()` (effet d'état) puis retour DIRECT au jeu (trois
// écrans retirés : confirmation, liste, actions — le jeu ne réannonce rien à
// son reveal, voir view/city-screen.js/onEnter) et annonce du résultat,
// DERNIÈRE écriture donc jamais écrasée.
function openTransactionConfirmation(titleKey, titleParams, apply, doneMessage) {
  const menu = {
    title: titleKey,
    titleParams,
    closable: true,
    entries: [
      { label: "shop.confirm.cancel", onActivate: () => popScreen() },
      {
        label: "shop.confirm.confirm",
        onActivate: () => {
          if (apply() === false) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
          popScreen();
          popScreen();
          popScreen();
          announce(doneMessage(), { assertive: true });
        },
      },
    ],
  };
  pushScreen(makeMenuScreen(menu, t));
}

// Confirmation d'ABANDON d'une sélection en cours (Échap/"Annuler" avec au
// moins une ligne > 0) : Confirmer retire la confirmation ET la liste
// (retour au menu d'actions) ; Annuler revient à la liste, sélection
// préservée.
function openDiscardConfirmation() {
  const menu = {
    title: "shop.discard.title",
    closable: true,
    entries: [
      { label: "shop.confirm.cancel", onActivate: () => popScreen() },
      {
        label: "shop.confirm.confirm",
        onActivate: () => {
          popScreen();
          popScreen();
        },
      },
    ],
  };
  pushScreen(makeMenuScreen(menu, t));
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
export function openShopMenu(scene, getSession, entity) {
  const menu = {
    title: entity.labelKey,
    closable: true,
    entries: [
      {
        label: "shop.actions.buy",
        onActivate: () => {
          const shop = liveShop(getSession, entity.id);
          if (!shop || !shop.shop) {
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
  const screen = makeMenuScreen(menu, t);
  screen.onEnter = composeHook(screen.onEnter, () => scene.pauseBeacons());
  screen.onExit = composeHook(screen.onExit, () => scene.resumeBeacons());
  pushScreen(screen);
}
