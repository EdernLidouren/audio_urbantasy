// JEU DES BILLES — ce que la vue DIT des sacs (marbles/core/bags.js) : leurs problèmes,
// la ligne d'un sac dans un menu, son nom compris. Des fonctions pures de `t`, sans DOM :
// l'écran, le menu des sacs, main.js et les outils au terminal s'en servent.

import { nameRef } from "../../../data/i18n/index.js";
import { bagSize } from "../../core/bags.js";
import { marbleRef } from "./effects.js";

// Les paramètres de la ligne d'un sac dans un menu (`marbles.bagMenu.line`) : « sac du
// Trésor, 15 billes ». Le NOM d'un sac : celui qu'un joueur lui a donné, ou, pour un sac
// préfait, celui de son id (`marbles.bag.<id>.name`, en minuscules), par sa référence,
// jamais traduit d'avance.
export function bagLineParams(bag) {
  return { name: bag.name ?? nameRef(`marbles.bag.${bag.id}.name`), count: bagSize(bag) };
}

// Les paramètres du texte d'un problème : le nom d'une bille CONNUE par sa référence
// (le gabarit en choisit la forme : « d'agate ») ; une bille inconnue n'a pas de nom,
// son id se dit tel quel.
function problemParams({ code, ...params }) {
  if (params.marble === undefined || code === "unknownMarble") return params;
  return { ...params, marble: marbleRef(params.marble) };
}

// Un PROBLÈME de sac, lisible à l'oreille : « Trop d'exemplaires de pierre de sang : 2
// sur 1 maximum. »
export function describeBagProblem(problem, t) {
  return t(`marbles.bagProblem.${problem.code}`, problemParams(problem));
}

// Les problèmes d'un sac, à la suite.
function describeBagProblems(problems, t) {
  return problems.map((problem) => describeBagProblem(problem, t)).join(" ");
}

// L'annonce d'une partie refusée pour un sac invalide : la phrase, puis ses problèmes.
export function describeBagRefusal(problems, t) {
  return t("marbles.bagProblem.refused", { problems: describeBagProblems(problems, t) });
}

