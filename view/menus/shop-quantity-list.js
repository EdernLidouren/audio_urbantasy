// LISTE À SLIDERS INLINE du point de vente (voir view/menus/shop-menu.js) :
// UN SEUL écran paramétré pour la VENTE (lignes = objets vendables du sac,
// plafond = possédé) et l'ACHAT (lignes = articles du catalogue, plafond =
// STOCK, condition d'incrément = ARGENT). Écran custom plutôt qu'un slider
// lib/menu.js pour les mêmes raisons structurelles que le sélecteur de
// quantité de l'inventaire (valeur TRANSITOIRE, pas une préférence
// persistée ; Entrée = +1 ; Suppr = 0 ; Maj = pas intermédiaire, Ctrl =
// grand pas) — voir view/menus/inventory/bag-and-equipment.js/
// openQuantitySelector. Même maintien, mêmes sons et même règle d'annonce
// à la borne que les sliders de lib/menu.js (createHoldRepeat,
// shouldAnnounceAdjustment).
// ERGONOMIE lecteur d'écran : l'entrée COMPLÈTE n'est dite qu'à la
// NAVIGATION ; un ajustement n'annonce que "<quantité>, <sous-total de la
// ligne>" (fluide en ajustement répété, maintien de touche compris) ; le
// GRAND TOTAL est à la demande (Retour arrière) — jamais imposé à chaque cran.

import { t } from "../../data/i18n/index.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { openConfirmation } from "./confirmation.js";
import { createHoldRepeat, heldStep, shouldAnnounceAdjustment } from "../../lib/menu.js";
import { TUNING_DEFAULTS } from "../../config/tuning-values.js";
import { announce, stripTrailingPeriod } from "../../lib/announce.js";
import { playMenuSound } from "../menu-sounds.js";
import { resolveAction, defineBindings } from "../../lib/input.js";
import { getPref } from "../../config/preferences.js";

// Bindings du menu à sliders. Entrée/Espace : +1 sur une ligne, ACTIVE une
// entrée d'action ("Valider"/"Annuler"). Maj+flèche : pas intermédiaire,
// Ctrl+flèche : grand pas (voir QUANTITY_STEPS). Suppr : remise à 0.
// Retour arrière : grand total. Maj+A : valider depuis n'importe où. Maj+G : argent actuel (même annonce que "g" en ville) — Maj
// parce que les lettres NUES restent réservées à un futur saut par initiale
// dans les listes d'objets. Chaque combinaison est une action DISTINCTE
// (mods exige une correspondance EXACTE, voir lib/input.js).
const LIST_BINDINGS = defineBindings("shopList", {
  up: { keys: ["ArrowUp"], mods: [] },
  down: { keys: ["ArrowDown"], mods: [] },
  home: { keys: ["Home"], mods: [] },
  end: { keys: ["End"], mods: [] },
  decrease: { keys: ["ArrowLeft"], mods: [] },
  decreaseMedium: { keys: ["ArrowLeft"], mods: ["shift"] },
  decreaseBig: { keys: ["ArrowLeft"], mods: ["ctrl"] },
  increase: { keys: ["ArrowRight"], mods: [] },
  increaseMedium: { keys: ["ArrowRight"], mods: ["shift"] },
  increaseBig: { keys: ["ArrowRight"], mods: ["ctrl"] },
  reset: { keys: ["Delete"], mods: [] },
  confirm: { keys: ["Enter", " "], mods: [] },
  total: { keys: ["Backspace"], mods: [] },
  validate: { keys: ["a"], mods: ["shift"] },
  money: { keys: ["g"], mods: ["shift"] },
  cancel: { keys: ["Escape"], mods: [] },
});

// Amplitude d'un cran selon le modificateur (config/tuning-values.js).
const QUANTITY_STEPS = {
  normal: 1,
  medium: TUNING_DEFAULTS.shopQuantityMediumStep,
  big: TUNING_DEFAULTS.shopQuantityBigStep,
};

export function selectedCount(lines) {
  return lines.reduce((count, line) => count + line.selected, 0);
}

export function selectedTotal(lines) {
  return lines.reduce((total, line) => total + line.selected * line.price, 0);
}

// Confirmation d'ABANDON d'une sélection en cours (Échap/"Annuler" avec au
// moins une ligne > 0) : Confirmer retire la confirmation ET la liste
// (retour au menu d'actions) ; Annuler revient à la liste, sélection
// préservée.
function openDiscardConfirmation() {
  openConfirmation("shop.discard.title", () => popScreen());
}

// Ouvre la liste, paramétrée par `spec` :
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
export function openQuantityList(spec) {
  const { lines } = spec;
  const actions = [
    { label: spec.validateKey, onActivate: () => validate() },
    { label: "shop.list.cancel", onActivate: () => cancel() },
  ];
  const total = () => lines.length + actions.length;
  let cursor = 0;
  // Cadence du maintien (voir lib/menu.js/createHoldRepeat).
  const hold = createHoldRepeat();

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
  // Annonce : quantité + SOUS-TOTAL de la ligne, rien d'autre, et à une
  // borne ou sur un refus seulement à un appui ponctuel (voir
  // lib/menu.js/shouldAnnounceAdjustment) : un maintien contre le mur ne
  // fait entendre que son son. `step` : amplitude d'un cran
  // (QUANTITY_STEPS). `held` : cran de maintien plutôt qu'appui.
  function adjust(direction, step, held) {
    if (!isLine(cursor)) {
      playMenuSound("block");
      return;
    }
    const line = lines[cursor];
    const wanted = line.selected + direction * step;
    const bounded = Math.min(Math.max(wanted, 0), line.max);
    let delta = bounded - line.selected;
    if (delta > 0 && spec.allowedIncrease) {
      const allowed = spec.allowedIncrease(line, delta);
      if (allowed.delta <= 0) {
        playMenuSound("refusal");
        if (shouldAnnounceAdjustment(false, held)) announce(t(allowed.refusalKey), { assertive: true });
        return;
      }
      delta = allowed.delta;
    }
    playMenuSound(bounded === wanted && delta !== 0 ? "toggle" : "block");
    line.selected += delta;
    if (shouldAnnounceAdjustment(delta !== 0, held)) announceLine(line);
  }

  // Appui ponctuel gauche/droite : arme le maintien, joue le cran.
  function press(direction, step) {
    hold.press();
    adjust(direction, step, false);
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
      adjust(1, QUANTITY_STEPS.normal, false);
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
    decrease: () => press(-1, QUANTITY_STEPS.normal),
    decreaseMedium: () => press(-1, QUANTITY_STEPS.medium),
    decreaseBig: () => press(-1, QUANTITY_STEPS.big),
    increase: () => press(1, QUANTITY_STEPS.normal),
    increaseMedium: () => press(1, QUANTITY_STEPS.medium),
    increaseBig: () => press(1, QUANTITY_STEPS.big),
    reset: () => reset(),
    confirm: () => confirm(),
    total: () => announce(`${title()}. ${entryLine(cursor)}`, { assertive: true }),
    validate: () => validate(),
    // Même clé/gabarit que la touche "g" en ville (view/status-announcements.js/
    // announceMoney) — relu dans la session, jamais un cumul du menu.
    money: () => announce(t("money.announce", { amount: spec.getSession().money }), { assertive: true }),
    cancel: () => cancel(),
  };

  pushScreen({
    // Aide des touches (lib/help.js).
    helpSections: () => [{ id: "shopList" }],
    onEnter() {
      // Ouverture ET retour depuis une confirmation (sélection préservée :
      // `lines` vit dans ce closure) — titre + entrée courante, comme un
      // écran-menu lib/menu.js.
      announce(`${title()}. ${entryLine(cursor)}`, { assertive: true });
    },
    // Maintien gauche/droite sur une ligne (même modèle que lib/menu.js :
    // modificateur relu à chaque cran).
    onTick() {
      if (!isLine(cursor)) return;
      const direction = hold.due();
      if (direction !== 0) adjust(direction, heldStep(QUANTITY_STEPS), true);
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
