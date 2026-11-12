// OCCUPATION : les entités à portée d'interaction du joueur, sur la face
// courante. Une seule source pour deux usages qui doivent voir le même
// ensemble, dans le même ordre : l'annonce d'occupation (à l'approche) et
// les candidats d'interaction (Espace, Entrée — voir
// view/interaction.js/chooseInteractionTarget). Les règles (la portée, les
// candidats d'un verbe) sont celles du core (core/interaction.js) ; ici,
// seulement l'annonce et la portée de chaque entité, résolue en cascade.

import { announce } from "../lib/announce.js";
import { resolveTuning } from "../config/tuning.js";
import { t } from "../data/i18n/index.js";
import { getActiveWorld } from "../core/state.js";
import { presentedNameKey } from "../core/display.js";
import { entitiesInReach, interactionCandidates } from "../core/interaction.js";

// La portée d'interaction d'une entité : le réglage interactRange, en cascade
// (config/tuning.js), injecté dans la règle du core.
const interactRangeOf = (entity) => resolveTuning("interactRange", entity);

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// Rend { update(), getInteractionCandidates(kind) }. Une occupation par
// monde monté (voir view/world-view.js) : à l'arrivée dans un monde, ce qui
// est à portée est annoncé.
export function createOccupancy(getSession) {
  let occupiedIds = new Set();
  let currentOccupied = [];

  // À chaque tick : recalcule l'occupation, et l'annonce par DIFF — en POLI
  // (une information de contexte, jamais une urgence), seulement quand
  // l'ensemble change. L'ensemble vide ne dit rien.
  function update() {
    const session = getSession();
    const occupied = entitiesInReach(getActiveWorld(session).entities, session.player.x, interactRangeOf);
    currentOccupied = occupied;
    const occupiedIdsNow = new Set(occupied.map((entity) => entity.id));
    if (!setsEqual(occupiedIdsNow, occupiedIds)) {
      if (occupiedIdsNow.size > 0) {
        // Un présentoir garni se présente sous le nom de son article.
        announce(occupied.map((entity) => t(presentedNameKey(entity))).join(", "));
      }
      occupiedIds = occupiedIdsNow;
    }
  }

  // Candidats pour un verbe ("describe" -> Espace, "activate" -> Entrée) :
  // l'occupation courante filtrée par la règle du core
  // (core/interaction.js/interactionCandidates).
  function getInteractionCandidates(kind) {
    return interactionCandidates(currentOccupied, kind, getSession().time);
  }

  return { update, getInteractionCandidates };
}
