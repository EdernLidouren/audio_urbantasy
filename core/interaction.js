// INTERACTION DU JOUEUR — les RÈGLES de ce qui est à sa portée et de ce qu'une
// activation (Entrée) fait, pures. La vue les appelle et n'orchestre que le rendu :
// l'annonce d'occupation et les candidats d'Espace et d'Entrée
// (view/occupancy.js), puis l'activation d'une entité choisie (view/interaction.js).
// Les transactions qui suivent une activation (ramasser, fouiller, acheter...)
// vivent dans leur domaine (core/money.js, core/bag.js, core/spawn.js...).

import { evaluateCondition, selectMatchingAction } from "./conditions.js";
import { isSearchable } from "./spawn.js";
import { offeredArticle } from "./display.js";

// Les entités dont la zone d'interaction englobe la position `x`, triées de gauche
// à droite. Exclues : les entités dormantes (core/conditions.js) et celles qui
// n'offrent rien à Espace ni à Entrée (décor, émetteur de son). `rangeOf(entity)` :
// la portée d'interaction de chaque entité (le réglage `interactRange`, en cascade).
// Elle est INJECTÉE : sa résolution (config/tuning.js) lit le registre des
// entités, que le core n'importe jamais.
export function entitiesInReach(entities, x, rangeOf) {
  return entities
    .filter((entity) => {
      if (entity.present === false) return false;
      if (!entity.observable && !entity.interactable) return false;
      return Math.abs(entity.x - x) <= rangeOf(entity);
    })
    .sort((a, b) => a.x - b.x);
}

// Une entité qui n'a PLUS rien à offrir à Entrée, sans pour autant disparaître :
// conteneur vidé (`time` : l'heure de jeu, qui dit s'il est regarni), présentoir
// vide.
function isSpentForActivation(entity, time) {
  if (entity.container) return !isSearchable(entity, time);
  if (entity.display) return offeredArticle(entity) === null;
  return false;
}

// Les candidats d'un verbe parmi les entités à portée (entitiesInReach) :
// "describe" (Espace), celles qu'on peut observer ; "activate" (Entrée), celles
// avec lesquelles on interagit. Un conteneur VIDÉ ou un présentoir VIDE ne reste
// candidat à Entrée que s'il n'y a rien d'autre à activer : ramasser les objets
// tombés autour ne propose jamais de menu de désambiguïsation avec lui, et seul il
// annonce son état (view/action-execution.js/handleSearch, handleBuy).
export function interactionCandidates(inReach, kind, time) {
  if (kind === "describe") return inReach.filter((entity) => entity.observable);
  const interactable = inReach.filter((entity) => entity.interactable);
  const live = interactable.filter((entity) => !isSpentForActivation(entity, time));
  return live.length > 0 ? live : interactable;
}

// CE QUE FAIT UNE ACTIVATION (Entrée) de `entity`, dans le contexte d'action
// `context` (core/conditions.js/actionContextOf) :
//   null                       rien : pas d'action déclarée, aucune candidate dont
//                              la condition tient, ou un collectible persistant
//                              déjà consommé (sans ce verrou, les effets de son
//                              action, joués avant son kind, se rejoueraient) ;
//   { action, refused: true }  la condition de l'action est fausse : son refus
//                              informatif (`refusalEffects`), aucun effet de
//                              succès ;
//   { action, refused: false } l'action a lieu.
// ACTIONS MULTIPLES (doc/scripting.md/"Actions multiples filtrées par
// condition") : `entity.action` est une action, ou une liste de candidates dont la
// PREMIÈRE qui tient est choisie (selectMatchingAction) ; sa condition, déjà vraie,
// se relit sans dommage (fonction pure, même contexte).
export function activationOf(entity, context) {
  if (!entity.action) return null;
  const action = Array.isArray(entity.action) ? selectMatchingAction(entity.action, context) : entity.action;
  if (!action) return null;
  if (action.kind === "loot" && entity.consumed) return null;
  if (action.condition && !evaluateCondition(action.condition, context)) return { action, refused: true };
  return { action, refused: false };
}
