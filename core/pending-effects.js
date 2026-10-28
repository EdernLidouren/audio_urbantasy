// TRANCHES EN ATTENTE d'une séquence d'effets (voir core/sequence.js,
// doc/scripting.md/"Séquences : wait") — `entity.pendingEffects =
// [{ ticksLeft, effects }]`, posé par core/state.js/applyEntityActionEffects
// (ou sa version compagnon) quand une liste d'effets contient un `wait`.
// Pur, headless. Comme le comportement temporaire : donnée pure,
// sauvegardée, gelée sous un menu (aucun tick), oubliée au chargement du
// monde.
//
// Un passage par TICK (applyDuePendingEffects), juste après le réducteur,
// dans le tick complet (core/advance.js/advanceTick), exactement comme les
// triggers horaires le sont par l'horloge : le core applique les effets
// d'ÉTAT dus et RENVOIE les effets de RENDU, que la vue rejoue. Portée : le
// monde actif, ses DEUX faces (une séquence lancée par un trigger horaire
// de l'autre face va à son terme), et les compagnons.
//
// Une entité DORMANTE au moment d'une tranche : ses effets d'état
// s'appliquent (le temps passe pour elle aussi), son rendu non — elle
// n'est pas là pour l'émettre.

import { isTwoSided, withFace, withActiveWorld, applyEntityActionEffects, applyCompanionActionEffects } from "./state.js";
import { isRenderEffect } from "./effects.js";

// Un tick passe sur une liste de tranches : celles qui arrivent à échéance
// (`due`, dans l'ordre), et les autres, une unité plus près (`remaining`).
export function countDownPending(pending) {
  const due = [];
  const remaining = [];
  for (const chunk of pending) {
    const ticksLeft = chunk.ticksLeft - 1;
    if (ticksLeft <= 0) due.push(chunk);
    else remaining.push({ ...chunk, ticksLeft });
  }
  return { due, remaining };
}

function withPending(entity, pending) {
  if (pending.length > 0) return { ...entity, pendingEffects: pending };
  const { pendingEffects, ...rest } = entity;
  return rest;
}

function withoutPending(entity) {
  return entity.pendingEffects ? withPending(entity, []) : entity;
}

// Remplace UNE entité d'une face du monde actif (`side` null : monde simple).
function updateFaceEntity(session, side, entityId, update) {
  const world = session.worlds[session.activeWorldId];
  const face = side === null ? world : world[side];
  const entities = face.entities.map((entity) => (entity.id === entityId ? update(entity) : entity));
  return withActiveWorld(session, withFace(world, side, { entities }));
}

function updateCompanion(session, companionId, update) {
  return { ...session, companions: session.companions.map((c) => (c.id === companionId ? update(c) : c)) };
}

// Décompte d'abord (la suite en attente est déjà à jour quand les effets dus
// s'appliquent, eux ne la touchent jamais : une tranche n'a pas de `wait`),
// puis applique les tranches dues dans l'ordre, avec le rendu de chacune.
function stepEntity(session, entity, setEntity, apply, fired) {
  const { due, remaining } = countDownPending(entity.pendingEffects);
  let next = setEntity(session, (current) => withPending(current, remaining));
  const renderEffects = [];
  for (const chunk of due) {
    next = apply(next, chunk.effects);
    renderEffects.push(...chunk.effects.filter(isRenderEffect));
  }
  if (renderEffects.length > 0 && entity.present !== false) fired.push({ entity, effects: renderEffects });
  return next;
}

// Un tick : renvoie { session, fired } comme core/triggers.js/
// applyDueTriggers. Rien en attente -> MÊME référence de session, fired vide.
export function applyDuePendingEffects(session) {
  const world = session.worlds[session.activeWorldId];
  const sides = isTwoSided(world) ? ["recto", "verso"] : [null];
  let next = session;
  const fired = [];

  for (const side of sides) {
    const face = side === null ? world : world[side];
    for (const entity of face.entities) {
      if (!entity.pendingEffects) continue;
      const applySide = side ?? session.player.side;
      next = stepEntity(
        next,
        entity,
        (s, update) => updateFaceEntity(s, side, entity.id, update),
        (s, effects) => applyEntityActionEffects(s, entity.id, effects, applySide),
        fired
      );
    }
  }
  for (const companion of session.companions) {
    if (!companion.pendingEffects) continue;
    next = stepEntity(
      next,
      companion,
      (s, update) => updateCompanion(s, companion.id, update),
      (s, effects) => applyCompanionActionEffects(s, companion.id, effects),
      fired
    );
  }

  return { session: next, fired };
}

// Chargement d'un monde : plus aucune tranche en attente, sur ses deux faces
// ni chez les compagnons. Références conservées quand il n'y a rien à
// retirer.
export function forgetPendingEffects(session) {
  const world = session.worlds[session.activeWorldId];
  const sides = isTwoSided(world) ? ["recto", "verso"] : [null];
  let nextWorld = world;
  for (const side of sides) {
    const face = side === null ? world : world[side];
    if (!face.entities.some((entity) => entity.pendingEffects)) continue;
    nextWorld = withFace(nextWorld, side, { entities: face.entities.map(withoutPending) });
  }
  const next = nextWorld === world ? session : withActiveWorld(session, nextWorld);
  if (!session.companions.some((companion) => companion.pendingEffects)) return next;
  return { ...next, companions: next.companions.map(withoutPending) };
}
