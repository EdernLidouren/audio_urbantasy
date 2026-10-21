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
// pause gèle l'horloge (aucun delta injecté, voir view/city-screen.js), donc
// ne déclenche rien — rien à coder ici.
//
// PORTÉE : le MONDE ACTIF, ses DEUX faces (une cloche au recto doit se
// faire entendre, étouffée, depuis le verso — le rendu diégétique de
// "playSound" emprunte la chaîne d'occlusion existante, voir
// view/audio/oneshots.js/playEntityOneShot). Les autres mondes ne tirent
// pas : ils sont gelés, comme le reste de leur simulation. Une entité
// DORMANTE (present:false) ne tire pas non plus, comme elle ne tique pas.
//
// FRONTIÈRE : le core APPLIQUE les effets d'ÉTAT (core/state.js/
// applyEntityActionEffects, même chemin qu'une action) et RENVOIE les effets
// de RENDU dus (`fired`), que la vue rejoue (view/interaction.js/
// runRenderEffects) — même partition que core/effects.js. Les effets MIXTES
// (teleport) sont refusés au chargement (core/scene.js/parseTrigger).

import { TIME_CONFIG } from "../config/time-values.js";
import { hourOfDay } from "./time.js";
import { isTwoSided, applyEntityActionEffects } from "./state.js";
import { isRenderEffect } from "./effects.js";

// Kinds de trigger reconnus (`on`) — SEULE liste, lue par core/scene.js
// pour la validation. Un kind de plus demain (météo, phase...) = une entrée
// ici + sa détection dans dueTriggerEffects.
export const TRIGGER_KINDS = ["hour"];

// Index ABSOLU de l'heure (pas l'heure du jour) : un saut de 24 h exactes
// change bien d'heure au sens de ce compteur, même si hourOfDay est égal.
function hourIndex(time) {
  return Math.floor(Math.floor(time) / TIME_CONFIG.minutesPerHour);
}

export function hourChanged(previousTime, nextTime) {
  return hourIndex(previousTime) !== hourIndex(nextTime);
}

// Effets dus pour UNE entité entre deux instants, dans l'ordre déclaré.
export function dueTriggerEffects(entity, previousTime, nextTime) {
  if (!entity.triggers || entity.present === false) return [];
  if (!hourChanged(previousTime, nextTime)) return [];
  const hour = hourOfDay(nextTime);
  return entity.triggers
    .filter((trigger) => trigger.on === "hour" && (trigger.hour === undefined || trigger.hour === hour))
    .flatMap((trigger) => trigger.effects);
}

// Applique les triggers dus entre `previousTime` et `session.time` sur le
// monde actif (les deux faces). Renvoie { session, fired } : la session
// après les effets d'ÉTAT, et les effets de RENDU dus, par entité, à
// rejouer par la vue. Aucun trigger dû -> MÊME référence de session, fired
// vide.
export function applyDueTriggers(session, previousTime) {
  const world = session.worlds[session.activeWorldId];
  const sides = isTwoSided(world) ? ["recto", "verso"] : [session.player.side];
  let next = session;
  const fired = [];

  for (const side of sides) {
    const face = isTwoSided(world) ? world[side] : world;
    for (const entity of face.entities) {
      const effects = dueTriggerEffects(entity, previousTime, session.time);
      if (effects.length === 0) continue;
      next = applyEntityActionEffects(next, entity.id, effects, side);
      const renderEffects = effects.filter(isRenderEffect);
      if (renderEffects.length > 0) fired.push({ entity, effects: renderEffects });
    }
  }

  return { session: next, fired };
}
