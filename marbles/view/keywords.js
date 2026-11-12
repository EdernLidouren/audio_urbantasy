// Jeu des billes : l'AIDE DES MOTS-CLÉS de la bille sous le curseur, partout où une
// bille peut l'être (triangle, main, menus du sac et de la défausse).
//   E      une seule annonce : « Pointe : description. Base : description. » ;
//   Maj+E  un menu vertical de lib/menu.js, une entrée par mot-clé (« Pointe :
//          description. »), puis « Fermer » ; Échap ferme aussi.
// Sans bille sous le curseur : « Aucune bille. » ; une bille sans mot-clé : « Aucun
// mot-clé. » (dans le menu, cette entrée seule, puis « Fermer »).
//
// Les mots-clés d'une bille et leur ordre viennent du core
// (marbles/core/content.js/keywordsOf, par les règles) : seulement ceux présents sur la
// bille, chacun une fois, déclencheurs, En poche, actions mots-clés, puis pointe et
// base ; leurs noms et descriptions sont déclarés à côté d'eux (MARBLE_TRIGGERS,
// MARBLE_POCKET, CLAUSE_ACTIONS, MARBLE_PHASES). Pur, sauf l'ouverture du menu.

import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { nameRef, t } from "../../data/i18n/index.js";

// Les lignes des mots-clés d'une bille, chacune { key, params }. `marble` : son id,
// ou undefined s'il n'y a pas de bille sous le curseur. Noms et descriptions passent
// en références, jamais en textes déjà traduits : la ligne se rend dans la langue du
// moment où elle se dit.
function keywordLines(marble, rules) {
  if (marble === undefined || marble === null) return [{ key: "marbles.keyword.no_marble" }];
  const keywords = rules.keywordsOf(marble);
  if (keywords.length === 0) return [{ key: "marbles.keyword.none" }];
  return keywords.map(({ texts }) => ({ key: "marbles.keyword.line", params: { name: nameRef(texts.name), description: nameRef(texts.description) } }));
}

// La touche E : toutes les lignes, d'une seule annonce.
export function keywordsText(marble, rules, translate = t) {
  return keywordLines(marble, rules)
    .map(({ key, params }) => translate(key, params))
    .join(" ");
}

// Le menu de Maj+E, sans l'ouvrir (vérifiable au terminal).
export function keywordsMenu(marble, rules) {
  const known = marble !== undefined && marble !== null;
  return {
    title: known ? "marbles.keyword.title" : "marbles.keyword.title_none",
    titleParams: known ? { marble: nameRef(`marble.${marble}.name`) } : undefined,
    closable: true,
    entries: [
      ...keywordLines(marble, rules).map(({ key, params }) => ({ label: key, labelParams: params })),
      { label: "marbles.keyword.close", onActivate: () => popScreen() },
    ],
  };
}

export function openKeywordsMenu(marble, rules) {
  pushScreen(makeMenuScreen(keywordsMenu(marble, rules), t));
}
