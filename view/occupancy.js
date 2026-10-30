// OCCUPATION : les entités à portée d'interaction du joueur, sur la face
// courante. Une seule source pour deux usages qui doivent voir le même
// ensemble, dans le même ordre : l'annonce d'occupation (à l'approche) et
// les candidats d'interaction (Espace, Entrée — voir
// view/interaction.js/chooseInteractionTarget).

import { announce } from "../lib/announce.js";
import { resolveTuning } from "../config/tuning.js";
import { t } from "../data/i18n/index.js";
import { getActiveWorld } from "../core/state.js";
import { isSearchable } from "../core/spawn.js";
import { offeredArticle, presentedLabelKey } from "../core/display.js";

// Entité qui n'a PLUS rien à offrir à Entrée, sans pour autant disparaître :
// conteneur vidé, présentoir vide.
function isSpentForActivation(entity, time) {
  if (entity.container) return !isSearchable(entity, time);
  if (entity.display) return offeredArticle(entity) === null;
  return false;
}

// Entités dont la zone d'interaction (interactRange de chaque entité, en
// cascade) englobe le joueur, triées de gauche à droite. Exclues : les
// entités dormantes (voir core/presence.js) et celles qui n'offrent rien à
// Espace ni à Entrée (décor, émetteur de son).
function occupiedEntities(entities, x) {
  return entities
    .filter((entity) => {
      if (entity.present === false) return false;
      if (!entity.observable && !entity.interactable) return false;
      return Math.abs(entity.x - x) <= resolveTuning("interactRange", entity);
    })
    .sort((a, b) => a.x - b.x);
}

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
    const occupied = occupiedEntities(getActiveWorld(session).entities, session.player.x);
    currentOccupied = occupied;
    const occupiedIdsNow = new Set(occupied.map((entity) => entity.id));
    if (!setsEqual(occupiedIdsNow, occupiedIds)) {
      if (occupiedIdsNow.size > 0) {
        // Un présentoir garni se présente sous le nom de son article.
        announce(occupied.map((entity) => t(presentedLabelKey(entity))).join(", "));
      }
      occupiedIds = occupiedIdsNow;
    }
  }

  // Candidats pour un verbe ("describe" -> Espace, "activate" -> Entrée) :
  // l'occupation courante filtrée par la capacité du verbe. Un conteneur
  // VIDÉ ou un présentoir VIDE ne reste candidat à Entrée que s'il n'y a
  // rien d'autre à activer : ramasser les objets tombés autour ne propose
  // jamais de menu de désambiguïsation avec lui, et seul il annonce son état
  // (voir view/action-execution.js/handleSearch, handleBuy).
  function getInteractionCandidates(kind) {
    if (kind === "describe") return currentOccupied.filter((entity) => entity.observable);
    const time = getSession().time;
    const interactable = currentOccupied.filter((entity) => entity.interactable);
    const live = interactable.filter((entity) => !isSpentForActivation(entity, time));
    return live.length > 0 ? live : interactable;
  }

  return { update, getInteractionCandidates };
}
