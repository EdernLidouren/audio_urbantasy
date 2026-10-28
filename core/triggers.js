// TRIGGERS de transition d'horloge (voir doc/scripting.md/"Triggers") —
// une entité déclare `triggers: [{ on: "hour", hour?, effects }]` : ses
// effets s'exécutent quand l'horloge FRANCHIT une heure (à CHAQUE heure sans
// `hour`, SEULEMENT à l'heure `hour` sinon). Déclenchement sur TRANSITION
// (diff entre l'instant d'avant et l'instant d'après, même patron que le
// jour/nuit ou la météo), jamais une condition continue "il est Xh".
//
// SAUTS de temps (menu debug, retour après absence) : résolution PARESSEUSE
// — on reflète l'heure d'ARRIVÉE, jamais les heures franchies entre-temps
// (aucune rafale, aucun passé simulé). Un trigger "à chaque heure" tire UNE
// fois ; un trigger "à Xh" tire SEULEMENT si Xh est l'heure d'arrivée. La
// pause gèle l'horloge (aucun delta injecté, voir view/game-clock.js), donc
// ne déclenche rien — rien à coder ici.
//
// PORTÉE : le MONDE ACTIF, ses DEUX faces (une cloche au recto doit se
// faire entendre, étouffée, depuis le verso — le rendu diégétique de
// "playSound" emprunte la chaîne d'occlusion existante, voir
// view/audio/oneshots.js/playEntityOneShot), PUIS les COMPAGNONS, toujours
// avec le joueur (comme pour les émotes). Les autres mondes ne tirent
// pas : ils sont gelés, comme le reste de leur simulation. Une entité
// DORMANTE (present:false) ne tire pas non plus, comme elle ne tique pas.
//
// FRONTIÈRE : le core APPLIQUE les effets d'ÉTAT (core/state.js/
// applyEntityActionEffects, même chemin qu'une action) et RENVOIE les effets
// de RENDU dus (`fired`), que la vue rejoue (view/effect-runner.js/
// runRenderEffects) — même partition que core/effects.js. Les effets MIXTES
// (teleport) sont refusés au chargement (core/script-parse.js/parseTrigger).
//
// TRIGGERS D'ÉMOTE — `{ on: "emote", emote?, range?, effects }` : les
// effets s'exécutent quand le joueur fait une émote (voir core/emotes.js)
// à portée de l'entité. Ce n'est pas une transition d'horloge mais un
// évènement ponctuel, résolu par applyEmoteTriggers plus bas ; même
// frontière core/vue, même vocabulaire d'effets.
//
// CONDITION (`condition`, tous kinds, facultative) : le trigger ne répond
// que si elle est vraie. Évaluée sur l'état d'AVANT le déclenchement, pour
// TOUS les triggers d'un même évènement : sans cela, un trigger qui fait
// passer une variable de 1 à 2 réveillerait aussitôt, dans la même passe,
// celui qui attend 2 (un seul sifflement ferait éclater le néon défectueux
// au lieu de le dérégler). `context` : celui d'une condition d'action
// (core/presence.js/actionContextOf), construit sur la session d'avant.

import { TIME_CONFIG } from "../config/time-values.js";
import { hourOfDay } from "./time.js";
import { isTwoSided, resolveFace, applyEntityActionEffects, applyCompanionActionEffects } from "./state.js";
import { evaluateCondition, actionContextOf } from "./presence.js";
import { isRenderEffect } from "./effects.js";
import { EMOTE_REGISTRY } from "./emotes.js";
import { sequenceHead } from "./sequence.js";

// Kinds de trigger reconnus (`on`) — SEULE liste, lue par
// core/script-parse.js/parseTrigger pour la validation. Un kind de plus
// demain (météo, phase...) = une entrée ici + sa détection (dueTriggerEffects
// pour l'horloge, emoteTriggerEffects pour les émotes).
export const TRIGGER_KINDS = ["hour", "emote"];

// Index ABSOLU de l'heure (pas l'heure du jour) : un saut de 24 h exactes
// change bien d'heure au sens de ce compteur, même si hourOfDay est égal.
function hourIndex(time) {
  return Math.floor(Math.floor(time) / TIME_CONFIG.minutesPerHour);
}

export function hourChanged(previousTime, nextTime) {
  return hourIndex(previousTime) !== hourIndex(nextTime);
}

// La condition d'un trigger est-elle remplie ? Sans condition : oui. Sans
// session (vérifications qui interrogent un trigger seul) : une condition
// ne peut pas être évaluée, le trigger ne répond pas.
function conditionHolds(trigger, entity, session) {
  if (!trigger.condition) return true;
  return session !== undefined && evaluateCondition(trigger.condition, actionContextOf(session, entity));
}

// Triggers horaires dus pour UNE entité entre deux instants, dans l'ordre
// déclaré. `session` : l'état d'avant, pour les conditions.
export function dueTriggers(entity, previousTime, nextTime, session) {
  if (!entity.triggers || entity.present === false) return [];
  if (!hourChanged(previousTime, nextTime)) return [];
  const hour = hourOfDay(nextTime);
  return entity.triggers.filter(
    (trigger) => trigger.on === "hour" && (trigger.hour === undefined || trigger.hour === hour) && conditionHolds(trigger, entity, session)
  );
}

// Leurs effets, mis bout à bout (lecture seule, pour les vérifications).
export function dueTriggerEffects(entity, previousTime, nextTime, session) {
  return dueTriggers(entity, previousTime, nextTime, session).flatMap((trigger) => trigger.effects);
}

// Applique les triggers `triggers` d'UNE entité, UN PAR UN : chaque liste
// d'effets est une séquence à part (core/sequence.js), dont seule la tête
// s'exécute maintenant — mises bout à bout, le `wait` de l'une retarderait
// les effets de la suivante. `apply(session, effects)` : l'application
// (entité d'une face ou compagnon). Les effets de RENDU de la tête de
// chaque séquence vont dans `fired`, regroupés par entité.
function applyTriggers(session, entity, triggers, apply, fired) {
  let next = session;
  const renderEffects = [];
  for (const trigger of triggers) {
    next = apply(next, trigger.effects);
    renderEffects.push(...sequenceHead(trigger.effects).filter(isRenderEffect));
  }
  if (renderEffects.length > 0) fired.push({ entity, effects: renderEffects });
  return next;
}

// Applique les triggers dus entre `previousTime` et `session.time` sur le
// monde actif (les deux faces). Renvoie { session, fired } : la session
// après les effets d'ÉTAT, et les effets de RENDU dus, par entité, à
// rejouer par la vue. Aucun trigger dû -> MÊME référence de session, fired
// vide. Les conditions se lisent toutes sur `session`, l'état d'avant.
export function applyDueTriggers(session, previousTime) {
  const world = session.worlds[session.activeWorldId];
  const sides = isTwoSided(world) ? ["recto", "verso"] : [session.player.side];
  let next = session;
  const fired = [];

  for (const side of sides) {
    const face = isTwoSided(world) ? world[side] : world;
    for (const entity of face.entities) {
      const triggers = dueTriggers(entity, previousTime, session.time, session);
      if (triggers.length === 0) continue;
      next = applyTriggers(next, entity, triggers, (s, effects) => applyEntityActionEffects(s, entity.id, effects, side), fired);
    }
  }
  for (const companion of session.companions) {
    const triggers = dueTriggers(companion, previousTime, session.time, session);
    if (triggers.length === 0) continue;
    next = applyTriggers(next, companion, triggers, (s, effects) => applyCompanionActionEffects(s, companion.id, effects), fired);
  }

  return { session: next, fired };
}

// Portée EFFECTIVE d'un trigger d'émote : celle du trigger (la sensibilité
// de l'entité), bornée par celle de l'émote (jusqu'où le son porte). Sans
// `range`, l'entité réagit dès qu'elle entend. La borne compte aussi pour
// un trigger sans `emote` (toute émote), dont la portée ne peut pas être
// vérifiée au chargement contre une émote précise.
export function emoteTriggerRange(trigger, emoteId) {
  const emoteRange = EMOTE_REGISTRY[emoteId].range;
  return trigger.range === undefined ? emoteRange : Math.min(trigger.range, emoteRange);
}

// Triggers d'émote qui répondent pour UNE entité quand l'émote `emoteId`
// est faite à `distance` d'elle, dans l'ordre déclaré : TOUS (même règle
// que l'horloge, aucun « premier gagnant »). Un trigger sans `emote`
// répond à toutes. Une entité dormante (règle de présence) ou déjà enfuie
// (core/startle.js : `startled`, dormante seulement au tick suivant) ne
// réagit pas : elle n'est déjà plus là. `session` : l'état d'avant
// l'émote, pour les conditions.
export function emoteTriggers(entity, emoteId, distance, session) {
  if (!entity.triggers || entity.present === false || entity.startled) return [];
  return entity.triggers.filter(
    (trigger) =>
      trigger.on === "emote" &&
      (trigger.emote === undefined || trigger.emote === emoteId) &&
      distance <= emoteTriggerRange(trigger, emoteId) &&
      conditionHolds(trigger, entity, session)
  );
}

// Leurs effets, mis bout à bout (lecture seule, pour les vérifications).
export function emoteTriggerEffects(entity, emoteId, distance, session) {
  return emoteTriggers(entity, emoteId, distance, session).flatMap((trigger) => trigger.effects);
}

// Le joueur fait l'émote `emoteId` depuis `sourceX` (sa position — passée
// explicitement : demain, un autre émetteur). Applique les triggers
// d'émote des entités de la FACE DU JOUEUR : l'autre face est isolée en
// simulation, comme pour la fuite à l'approche — PUIS ceux des COMPAGNONS,
// toujours avec le joueur (le buddy qu'on siffle). Distance sur l'axe X
// seul, en unités de scène.
//
// Renvoie { session, fired }, exactement comme applyDueTriggers : la session
// après les effets d'ÉTAT, les effets de RENDU dus par entité pour la vue.
// Aucun trigger dû -> MÊME référence de session, fired vide. Pur et sans
// tirage : même session + même émote = même résultat. Les conditions se
// lisent toutes sur `session`, l'état d'avant l'émote.
export function applyEmoteTriggers(session, emoteId, sourceX) {
  const world = session.worlds[session.activeWorldId];
  const side = session.player.side;
  let next = session;
  const fired = [];

  for (const entity of resolveFace(world, side).entities) {
    const triggers = emoteTriggers(entity, emoteId, Math.abs(entity.x - sourceX), session);
    if (triggers.length === 0) continue;
    next = applyTriggers(next, entity, triggers, (s, effects) => applyEntityActionEffects(s, entity.id, effects, side), fired);
  }
  for (const companion of session.companions) {
    const triggers = emoteTriggers(companion, emoteId, Math.abs(companion.x - sourceX), session);
    if (triggers.length === 0) continue;
    next = applyTriggers(next, companion, triggers, (s, effects) => applyCompanionActionEffects(s, companion.id, effects), fired);
  }

  return { session: next, fired };
}
