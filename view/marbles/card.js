// Jeu des billes : la FICHE d'une bille (lib/detail-card.js). Lit le modèle
// d'assemblage déclaré dans config/marbles-values.js/MARBLE_CARD_MODEL et les
// effets IMPRIMÉS de la table : ce qu'une bille promet, pas ce qu'elle fera sur ce
// triangle, qui est l'affaire de la prévision. Pur : rend du texte.
//
// Un champ du modèle : `field`, le champ de la bille dans la table, et `labelKey`,
// son gabarit, qui reçoit {effect}. `variantLabelKey` (facultatif) : l'effet peut
// différer selon la base, et ce gabarit reçoit alors {left} et {right}.
//
// Un montant calculé se dit avec sa valeur ACTUELLE, là où se trouve la bille : son
// compteur de tours en main dans la main, 0 ailleurs (narration.js/cardSituation).

import { MARBLE_CARD_MODEL } from "../../config/marbles-values.js";
import { assembleCard, validateCardModel } from "../../lib/detail-card.js";
import { cardSituation, describePrinted } from "./narration.js";

validateCardModel(MARBLE_CARD_MODEL);

function readField(marble, entry, situation, rules, t) {
  if (entry.variantLabelKey !== undefined) {
    const left = rules.effectAt(marble, "leftBase");
    const right = rules.effectAt(marble, "rightBase");
    if (left !== right) return t(entry.variantLabelKey, { left: describePrinted(left, situation, t), right: describePrinted(right, situation, t) });
    return t(entry.labelKey, { effect: describePrinted(left, situation, t) });
  }
  const clauses = rules.types[marble][entry.field];
  if (clauses === undefined && !entry.required) return null;
  return t(entry.labelKey, { effect: describePrinted(clauses ?? [], situation, t) });
}

// La fiche d'une bille. `main` : son annonce principale, qui dépend de l'endroit
// où elle se trouve. `rules` : les règles du jeu (core/marbles-rules.js), d'où
// viennent la table et les effets imprimés. `options` (facultatif) : `turnsInHand`,
// le compteur de la bille si elle est en main (0 sinon) ; `model`, un autre modèle,
// pour les vérifications.
export function marbleCard(marble, main, rules, t, { turnsInHand = 0, model = MARBLE_CARD_MODEL } = {}) {
  const situation = cardSituation(marble, turnsInHand);
  return assembleCard(model, { main, readField: (entry) => readField(marble, entry, situation, rules, t), t });
}
