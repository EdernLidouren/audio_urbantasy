// Jeu des billes : ce qu'une bille EST, hors de ses effets, sur demande, pour la
// bille sous le curseur, partout où une bille peut l'être (main, triangle, menus du
// sac, de la défausse et du pot, choix) :
//   V  sa DESCRIPTION, un texte d'ambiance pur, sans effet de jeu ;
//   F  son IDENTITÉ : ses familles, son calibre et sa rareté (« Trésor, normale,
//      rare. »), sur le triangle aussi, où son annonce principale ne les dit pas.
// Les effets restent dans la fiche (marbles/view/card.js), les mots-clés dans
// marbles/view/keywords.js. Pur : `translate` et `has` s'injectent (les vérifications
// lisent les clés), ceux du jeu par défaut.

import { t, hasKey } from "../../data/i18n/index.js";
import { familyNames, rarityName, sizeName } from "./narration/effects.js";

// La clé de la description d'une bille, déduite de son id comme son nom :
// `marble.<id>.description`. FACULTATIVE : une bille sans texte n'en a pas.
export const descriptionKey = (marble) => `marble.${marble}.description`;

// La description de `marble` (touche V). Sans bille sous le curseur (emplacement vide,
// main vide, hors d'une entrée : undefined ou null) : « Aucune bille. » ; sans
// texte : « Aucune description. ».
export function descriptionText(marble, translate = t, has = hasKey) {
  if (marble === undefined || marble === null) return translate("marbles.no_marble");
  const key = descriptionKey(marble);
  return has(key) ? translate(key) : translate("marbles.description.none");
}

// L'identité de `marble` (touche F) : ses familles, son calibre, sa rareté. Sans bille
// sous le curseur : « Aucune bille. ».
export function identityText(marble, rules, translate = t) {
  if (marble === undefined || marble === null) return translate("marbles.no_marble");
  return translate("marbles.identity.line", { families: familyNames(marble, rules.types, translate), size: sizeName(rules.types[marble].size, translate), rarity: rarityName(marble, rules.types, translate) });
}
