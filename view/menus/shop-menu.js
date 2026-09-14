// POINT DE VENTE (voir doc/entity-model.md/"Vente", entities/types/
// shop_counter.js) — deux écrans sur la pile (lib/screens.js) :
//   1. MENU D'ACTIONS (lib/menu.js) : "Vendre" (+ "Acheter" plus tard,
//      structure prête), "Annuler". TOUJOURS un menu, même à une action —
//      même prévisibilité que view/menus/inventory-menu.js.
//   2. MENU DE VENTE (écran CUSTOM, ci-dessous) : liste des objets VENDABLES
//      du sac, chaque entrée étant un SLIDER INLINE (quantité à vendre, de 0
//      au possédé), puis "Valider la vente" et "Annuler". Écran custom plutôt
//      qu'un slider lib/menu.js pour les mêmes raisons structurelles que le
//      sélecteur de quantité de l'inventaire (valeur TRANSITOIRE, pas une
//      préférence persistée ; Entrée = +1 ; Suppr = 0 ; Maj = grand pas) —
//      voir view/menus/inventory-menu.js/openQuantitySelector.
// ERGONOMIE lecteur d'écran : l'entrée COMPLÈTE n'est dite qu'à la
// NAVIGATION ; un ajustement n'annonce que "<quantité>, <sous-total de la
// ligne>" (fluide en ajustement répété, maintien de touche compris) ; le
// GRAND TOTAL est à la demande (Retour arrière) — jamais imposé à chaque cran.
// La TRANSACTION est un effet d'état du core (core/trade.js/sellItems),
// appliqué par le gestionnaire injecté depuis view/city-screen.js — ce
// module ne connaît ni session.money ni le sac autrement qu'en LECTURE.

import { t } from "../../data/i18n/index.js";
import { pushScreen, popScreen, composeHook } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { announce } from "../../lib/announce.js";
import { playMenuSound } from "../menu-sounds.js";
import { resolveAction, checkBindingsForCollisions, isHeld, isModActive } from "../../lib/input.js";
import { getPref } from "../../config/preferences.js";
import { ITEM_REGISTRY } from "../../core/items.js";
import { isSellable, sellValueOf, ownedQuantity } from "../../core/trade.js";

// (sales: [{ type, quantity }]) => void — applique l'effet d'ÉTAT de la vente
// (core/trade.js/sellItems), fourni par city-screen.js qui seul détient
// getSession/setSession — même injection que inventory-menu.js/
// setDropItemHandler.
let sellHandler = null;

export function setSellHandler(handler) {
  sellHandler = handler;
}

// Bindings du menu de vente. Entrée/Espace : +1 sur une ligne, ACTIVE une
// entrée d'action ("Valider"/"Annuler"). Maj+flèche : grand pas (±5).
// Suppr : remise à 0. Retour arrière : grand total. Maj+A : valider depuis
// n'importe où. Chaque combinaison est une action DISTINCTE (mods exige une
// correspondance EXACTE, voir lib/input.js).
const SELL_BINDINGS = {
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
  cancel: { keys: ["Escape"], mods: [] },
};
checkBindingsForCollisions(SELL_BINDINGS, "view/menus/shop-menu.js SELL_BINDINGS");

const STEP = 1;
const BIG_STEP = 5;
// Cadence du maintien gauche/droite — même rythme que lib/menu.js.
const SLIDER_REPEAT_INTERVAL_MS = 150;

function stripTrailingPeriod(text) {
  return text.endsWith(".") ? text.slice(0, -1) : text;
}

// Une LIGNE de vente par TYPE vendable du sac (agrégée : un non-empilable
// possédé en plusieurs exemplaires fait une seule ligne, quantité = nombre
// d'entrées). `selected` : quantité choisie, TRANSITOIRE, propre à cette
// ouverture du menu.
function buildSaleLines(bag) {
  const types = [...new Set(bag.map((entry) => entry.type))].filter(isSellable);
  return types.map((type) => ({
    type,
    labelKey: ITEM_REGISTRY[type].label,
    descriptionKey: ITEM_REGISTRY[type].descriptionKey,
    owned: ownedQuantity(bag, type),
    price: sellValueOf(type),
    selected: 0,
  }));
}

function currentSales(lines) {
  return lines.filter((line) => line.selected > 0).map((line) => ({ type: line.type, quantity: line.selected }));
}

function selectedCount(lines) {
  return lines.reduce((count, line) => count + line.selected, 0);
}

function selectedTotal(lines) {
  return lines.reduce((total, line) => total + line.selected * line.price, 0);
}

// "Pomme × 3, Pièce × 2" — récapitulatif de ce qui part (confirmation,
// résultat).
function saleDetails(lines) {
  return lines
    .filter((line) => line.selected > 0)
    .map((line) => t("shop.sell.detail", { item: t(line.labelKey), quantity: line.selected }))
    .join(", ");
}

// Menu de VENTE — écran custom (voir header). `scene` non utilisé pour les
// balises : le menu d'actions juste dessous les a déjà mises en pause.
function openSellMenu(getSession) {
  const lines = buildSaleLines(getSession().bag);
  // Entrées d'ACTION après les lignes : "Valider la vente", "Annuler".
  const actions = [
    { label: "shop.sell.validate", onActivate: () => validate() },
    { label: "shop.sell.cancel", onActivate: () => cancel() },
  ];
  const total = () => lines.length + actions.length;
  let cursor = 0;
  let lastAdjustAt = -Infinity;

  const isLine = (index) => index < lines.length;

  function position(index) {
    if (!getPref("menuIndexSuffix", true)) return "";
    return t("menu.position", { index: index + 1, total: total() });
  }

  // Ligne COMPLÈTE d'une entrée (navigation, ouverture, Retour arrière) :
  // "{nom} {choisi} sur {possédé}, {prix} pièces : {description}[. position]".
  function entryLine(index) {
    const suffix = position(index);
    let text;
    if (isLine(index)) {
      const line = lines[index];
      text = t("shop.sell.entry", {
        item: t(line.labelKey),
        selected: line.selected,
        owned: line.owned,
        price: line.price,
        description: stripTrailingPeriod(t(line.descriptionKey)),
      });
    } else {
      text = t(actions[index - lines.length].label);
    }
    return suffix ? `${text}. ${suffix}` : text;
  }

  // Titre = grand total courant ("Vendre N objets pour M pièces").
  function title() {
    return t("shop.sell.total", { count: selectedCount(lines), total: selectedTotal(lines) });
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

  // Ajustement d'une ligne : PLANCHER 0, PLAFOND possédé — une tentative
  // au-delà sonne "block" (comme un slider lib/menu.js à sa borne), sinon
  // "toggle". Annonce : quantité + SOUS-TOTAL de la ligne, rien d'autre.
  function setLine(line, value) {
    const next = Math.min(Math.max(value, 0), line.owned);
    playMenuSound(next === value ? "toggle" : "block");
    line.selected = next;
    lastAdjustAt = performance.now();
    announce(t("shop.sell.adjust", { selected: next, subtotal: next * line.price }), { assertive: true });
  }

  function adjust(direction, big) {
    if (!isLine(cursor)) {
      playMenuSound("block");
      return;
    }
    const line = lines[cursor];
    setLine(line, line.selected + direction * (big ? BIG_STEP : STEP));
  }

  function reset() {
    if (!isLine(cursor)) {
      playMenuSound("block");
      return;
    }
    setLine(lines[cursor], 0);
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

  // Validation : rien de sélectionné -> annonce seule, jamais une
  // confirmation vide ; sinon confirmation DÉTAILLÉE (vente destructive).
  function validate() {
    const sales = currentSales(lines);
    if (sales.length === 0) {
      playMenuSound("block");
      announce(t("shop.sell.nothingSelected"), { assertive: true });
      return;
    }
    openSaleConfirmation(lines, sales);
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
    cancel: () => cancel(),
  };

  const screen = {
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
      if (performance.now() - lastAdjustAt < SLIDER_REPEAT_INTERVAL_MS) return;
      adjust(left ? -1 : 1, isModActive("shift"));
    },
    onKeyDown(event) {
      const action = resolveAction(SELL_BINDINGS, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    },
  };

  pushScreen(screen);
}

// Confirmation de VENTE (destructive) : "Annuler" en première entrée (curseur
// par défaut, une pression rapide d'Entrée reste sans effet), "Confirmer"
// ensuite — même patron que main-menu.js/openNewGameConfirmation. Titre
// DYNAMIQUE (lib/menu.js/titleParams) : total + récapitulatif de ce qui part.
// Confirmer -> effet d'état (sellHandler), puis retour DIRECT au jeu (trois
// écrans retirés : confirmation, vente, actions — le jeu ne réannonce rien à
// son reveal, voir view/city-screen.js/onEnter) et annonce du résultat, DERNIÈRE
// écriture donc jamais écrasée.
function openSaleConfirmation(lines, sales) {
  const count = selectedCount(lines);
  const total = selectedTotal(lines);
  const details = saleDetails(lines);
  const menu = {
    title: "shop.sell.confirm.title",
    titleParams: { count, total, details },
    closable: true,
    entries: [
      { label: "shop.sell.confirm.cancel", onActivate: () => popScreen() },
      {
        label: "shop.sell.confirm.confirm",
        onActivate: () => {
          if (!sellHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
          sellHandler(sales);
          popScreen();
          popScreen();
          popScreen();
          announce(t("shop.sell.done", { details, total }), { assertive: true });
        },
      },
    ],
  };
  pushScreen(makeMenuScreen(menu, t));
}

// Confirmation d'ABANDON d'une sélection en cours (Échap/"Annuler" avec au
// moins une ligne > 0) : Confirmer retire la confirmation ET le menu de
// vente (retour au menu d'actions) ; Annuler revient au menu de vente,
// sélection préservée.
function openDiscardConfirmation() {
  const menu = {
    title: "shop.sell.discard.title",
    closable: true,
    entries: [
      { label: "shop.sell.confirm.cancel", onActivate: () => popScreen() },
      {
        label: "shop.sell.confirm.confirm",
        onActivate: () => {
          popScreen();
          popScreen();
        },
      },
    ],
  };
  pushScreen(makeMenuScreen(menu, t));
}

// Activation du point de vente (action "shop", voir view/interaction.js) :
// MENU D'ACTIONS, titre = le nom du point de vente lui-même (entity.labelKey,
// déjà une clé i18n — même idiome que inventory-menu.js/openItemActionsMenu).
// "Vendre" sans rien de vendable au sac -> annonce seule, aucune liste vide.
// Balises en pause tant que ce menu (ou un écran au-dessus) est ouvert.
export function openShopMenu(scene, getSession, entity) {
  const menu = {
    title: entity.labelKey,
    closable: true,
    entries: [
      {
        label: "shop.actions.sell",
        onActivate: () => {
          if (buildSaleLines(getSession().bag).length === 0) {
            playMenuSound("block");
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
