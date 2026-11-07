// Brique portable : FICHES DE DÉTAIL. Un élément porte plusieurs champs
// d'information : tout annoncer en bloc est lourd au lecteur d'écran et pousse à
// réécouter. Une fiche, c'est une annonce principale courte et des champs à
// parcourir un par un avec un curseur secondaire. Aucune connaissance de ce que
// l'élément représente : le contenu est lu par l'appelant, et le texte de repli
// par `t`, reçu en paramètre. Pur : rien n'est annoncé ici.
//
// MODÈLE d'assemblage, de la donnée déclarée par le jeu :
//   { above: [entrée...], below: [entrée...], emptyBelowKey? }
// `above` et `below` listent les champs du plus proche de l'annonce principale
// au plus éloigné. Une entrée est un objet libre, passé tel quel à `readField` ;
// seul `required` (facultatif) a un sens ici : un champ obligatoire doit avoir un
// texte, un champ facultatif sans texte n'existe pas sur cet élément.
// `emptyBelowKey` : clé i18n du champ de repli placé au-dessous quand aucun champ
// n'y existe, pour qu'un geste vers le bas réponde toujours quelque chose.
//
// CURSEUR SECONDAIRE : un entier, 0 pour l'annonce principale, positif au-dessus,
// négatif au-dessous. Ajouter un champ se fait dans le modèle : la navigation
// ci-dessous n'a pas à le connaître.

import { stripTrailingPeriod } from "./announce.js";

// Échoue au chargement sur un modèle mal formé.
export function validateCardModel(model) {
  const fail = (message) => {
    throw new Error(`fiche : ${message}`);
  };
  if (!Array.isArray(model?.above) || !Array.isArray(model?.below)) fail("above et below doivent être des listes.");
  if (model.above.length + model.below.length === 0) fail("modèle sans aucun champ.");
  if (model.emptyBelowKey !== undefined && typeof model.emptyBelowKey !== "string") fail("emptyBelowKey doit être une clé i18n.");
}

// La fiche d'un élément : { main, above: [texte...], below: [texte...] }.
// `readField(entrée)` rend le texte du champ, ou null si l'élément ne l'a pas.
export function assembleCard(model, { main, readField, t }) {
  const read = (entry) => {
    const text = readField(entry);
    if (text === null && entry.required) throw new Error(`fiche : champ obligatoire sans texte : ${JSON.stringify(entry)}.`);
    return text;
  };
  const present = (entries) => entries.map(read).filter((text) => text !== null);
  const above = present(model.above);
  const below = present(model.below);
  if (below.length === 0 && model.emptyBelowKey !== undefined) below.push(t(model.emptyBelowKey));
  return { main, above, below };
}

// Une position gardée d'un élément à l'autre peut dépasser les champs du nouveau.
function clampPosition(position, card) {
  return Math.max(-card.below.length, Math.min(card.above.length, position));
}

// Un pas du curseur secondaire, `direction` 1 (vers le haut) ou -1 (vers le bas).
// En butée, il ne bouge pas : pas de cyclage, le champ se réannonce.
export function stepDetail(position, card, direction) {
  return clampPosition(clampPosition(position, card) + direction, card);
}

// Ce qu'annonce le curseur secondaire à cette position.
export function detailLine(card, position) {
  const clamped = clampPosition(position, card);
  if (clamped === 0) return card.main;
  return clamped > 0 ? card.above[clamped - 1] : card.below[-clamped - 1];
}

// L'annonce principale, suivie du champ si le curseur secondaire n'est pas à sa
// position par défaut : ce qu'on entend en arrivant sur un élément sans que le
// curseur ait été réinitialisé, ou en demandant où l'on en est.
export function mainWithDetail(card, position) {
  if (clampPosition(position, card) === 0) return card.main;
  return `${stripTrailingPeriod(card.main)}. ${detailLine(card, position)}`;
}

// La position après un déplacement du curseur principal.
export function detailAfterMainMove(position, resetOnMove) {
  return resetOnMove ? 0 : position;
}
