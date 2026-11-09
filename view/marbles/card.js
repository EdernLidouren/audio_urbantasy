// Jeu des billes : la FICHE d'une bille (lib/detail-card.js). Lit le modèle
// d'assemblage déclaré dans config/marbles-values.js/MARBLE_CARD_MODEL et les
// effets IMPRIMÉS de la table : ce qu'une bille promet, pas ce qu'elle fera sur ce
// triangle, qui est l'affaire de la prévision. Pur : rend du texte.
//
// Un champ du modèle : `field`, le champ de la bille dans la table, et `labelKey`,
// son gabarit, qui reçoit {effect}. `variantLabelKey` (facultatif) : l'effet peut
// différer selon la base, et ce gabarit reçoit alors {left} et {right}.

import { MARBLE_CARD_MODEL } from "../../config/marbles-values.js";
import { assembleCard, validateCardModel } from "../../lib/detail-card.js";
import { describePrinted } from "./narration.js";

validateCardModel(MARBLE_CARD_MODEL);

function readField(marble, entry, rules, t) {
  if (entry.variantLabelKey !== undefined) {
    const left = rules.effectAt(marble, "leftBase");
    const right = rules.effectAt(marble, "rightBase");
    if (left !== right) return t(entry.variantLabelKey, { left: describePrinted(left, t), right: describePrinted(right, t) });
    return t(entry.labelKey, { effect: describePrinted(left, t) });
  }
  const clauses = rules.types[marble][entry.field];
  if (clauses === undefined && !entry.required) return null;
  return t(entry.labelKey, { effect: describePrinted(clauses ?? [], t) });
}

// La fiche d'une bille. `main` : son annonce principale, qui dépend de l'endroit
// où elle se trouve. `rules` : les règles du jeu (core/marbles-rules.js), d'où
// viennent la table et les effets imprimés. `options` (facultatif) : un autre
// modèle, pour les vérifications.
export function marbleCard(marble, main, rules, t, { model = MARBLE_CARD_MODEL } = {}) {
  return assembleCard(model, { main, readField: (entry) => readField(marble, entry, rules, t), t });
}
