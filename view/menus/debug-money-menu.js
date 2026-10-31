// Menu DEBUG de l'argent (Shift+G, MODE DEBUG UNIQUEMENT — la garde vit
// dans view/city-screen.js/onKeyDown), même famille que Shift+W/T/M/L/C :
// de quoi tester les achats sans ramasser des pièces. Un slider de montant
// (pas de 1, grand pas de 50 avec Ctrl, de 0 à 1 000 000), "Valider" qui
// AJOUTE ce montant à l'argent actuel, et "Remettre l'argent à zéro", qui
// vide l'argent POSSÉDÉ par le joueur (pas le slider). Les deux
// actions ferment le menu, comme les autres menus de debug, puis annoncent
// le nouveau solde (voir view/debug-effects.js/giveMoney).
//
// Le montant est une valeur TRANSITOIRE (slider getValue/setValue, voir
// lib/menu.js) : propre à cette ouverture, jamais une préférence écrite sur
// disque ; il repart de 0 à chaque ouverture.

import { t } from "../../data/i18n/index.js";
import { pushScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";

const AMOUNT_STEP = 1;
const AMOUNT_BIG_STEP = 50;
const AMOUNT_MAX = 1000000;

export function openMoneyDebugMenu(giveMoneyEffect, resetMoneyEffect) {
  let amount = 0;

  const entries = [
    {
      kind: "slider",
      labelKey: "money.debug.amount",
      getValue: () => amount,
      setValue: (value) => {
        amount = value;
      },
      min: 0,
      max: AMOUNT_MAX,
      step: AMOUNT_STEP,
      bigStep: AMOUNT_BIG_STEP,
    },
    { label: "money.debug.add", closesMenu: true, onActivate: () => giveMoneyEffect(amount) },
    { label: "money.debug.reset", closesMenu: true, onActivate: resetMoneyEffect },
  ];

  pushScreen(makeMenuScreen({ title: "money.debug.title", closable: true, entries }, t));
}
