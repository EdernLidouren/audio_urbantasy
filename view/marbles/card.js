// Jeu des billes : la FICHE d'une bille (lib/detail-card.js). Lit le modèle
// d'assemblage déclaré dans config/marbles-values.js/MARBLE_CARD_MODEL et les
// effets IMPRIMÉS de la table : ce qu'une bille promet, pas ce qu'elle fera sur ce
// triangle, qui est l'affaire de la prévision. Pur : rend du texte.
//
// Un champ du modèle : `field`, le champ de la bille dans la table, et `labelKey`,
// son gabarit, qui reçoit {effect}. `variantLabelKey` (facultatif) : l'effet peut
// différer selon la base, et ce gabarit reçoit alors {left} et {right}. `reactive`
// (facultatif, En poche) : une ligne par occurrence que la bille écoute, dans l'ordre
// des valeurs de partie (core/marbles.js/REACTION_KEYS), son gabarit recevant aussi
// {occurrence} (`marbles.tally.<id>.each`, « à chaque chiquenaude »).
//
// Un montant calculé se dit avec sa valeur ACTUELLE, là où se trouve la bille : son
// compteur de tours en main dans la main, 0 ailleurs, et les valeurs de partie de la
// partie en cours (narration.js/cardSituation).

import { MARBLE_CARD_MODEL } from "../../config/marbles-values.js";
import { REACTION_KEYS } from "../../core/marbles.js";
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
  // Un champ d'objet de moments (En poche) : la clé `part`.
  const field = rules.types[marble][entry.field];
  const clauses = entry.part === undefined ? field : field?.[entry.part];
  if (clauses === undefined && !entry.required) return null;
  return t(entry.labelKey, { effect: describePrinted(clauses ?? [], situation, t), ...(entry.occurrence && { occurrence: t(entry.occurrence) }) });
}

// Le modèle tel qu'il se lit pour une bille : le moment réactif devient une entrée
// par occurrence que la bille écoute (aucune si elle n'en écoute pas).
function modelFor(marble, model, rules) {
  const expand = (entries) =>
    entries.flatMap((entry) => {
      if (!entry.reactive) return [entry];
      const field = rules.types[marble][entry.field] ?? {};
      return REACTION_KEYS.filter((key) => Object.hasOwn(field, key)).map((key) => ({
        field: entry.field,
        part: key,
        labelKey: entry.labelKey,
        occurrence: `marbles.tally.${key}.each`,
      }));
    });
  return { ...model, above: expand(model.above), below: expand(model.below) };
}

// La fiche d'une bille. `main` : son annonce principale, qui dépend de l'endroit
// où elle se trouve. `rules` : les règles du jeu (core/marbles-rules.js), d'où
// viennent la table et les effets imprimés. `options` (facultatif) : `turnsInHand`,
// le compteur de la bille si elle est en main (0 sinon) ; `tally`, les valeurs de
// partie de la partie en cours (à zéro sinon) ; `model`, un autre modèle, pour les
// vérifications.
// `timeless` : la fiche hors de toute partie, sans valeur actuelle des montants
// calculés (l'annexe des règles, tools/marbles/rules-doc.js).
export function marbleCard(marble, main, rules, t, { turnsInHand = 0, tally, model = MARBLE_CARD_MODEL, timeless = false } = {}) {
  const situation = timeless ? null : cardSituation(marble, turnsInHand, tally);
  return assembleCard(modelFor(marble, model, rules), { main, readField: (entry) => readField(marble, entry, situation, rules, t), t });
}
