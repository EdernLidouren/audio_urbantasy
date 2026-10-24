// SONS DE PROXIMITÉ : une entité qui RÉPOND à l'approche du joueur —
// approachSound quand il entre dans sa zone d'interaction, leaveSound quand
// il en sort (ex. une porte automatique qui s'ouvre puis se referme, voir
// entities/types/automatic_sliding_door.js, doc/entity-model.md/"Sons de
// proximité"). Rendu PUR : aucune règle de jeu, rien dans le core ni dans
// la sauvegarde — l'interaction avec l'entité reste libre, quel que soit
// l'état de ses sons.
//
// Chaque entité concernée a un petit état, `open` (« ouverte » : le dernier
// son joué est son approachSound) et `busy` (un de ses deux sons joue
// encore), et deux règles :
//   - joueur DANS la zone, entité fermée, aucun son en cours -> approachSound ;
//   - joueur HORS de la zone depuis proximityHoldMs, entité ouverte, aucun
//     son en cours -> leaveSound.
// Ce qui se passe entre les deux en découle sans cas particulier : un départ
// pendant l'approachSound attend sa fin ET le délai ; un retour pendant le
// délai l'annule ; un retour pendant le leaveSound rouvre à sa fin. Un son
// n'est jamais coupé. Une entité qui ne déclare qu'un des deux rôles bascule
// en silence pour l'autre.
//
// Temps compté en TICKS de la scène (voir lib/loop.js/TICK_MS), jamais à
// l'horloge murale : un menu ouvert fige la scène, et le délai avec elle.
// Une entité déjà dans la zone à la première mise à jour (le joueur arrive
// par elle) est OUVERTE d'emblée, sans son. Une entité dormante (present
// false) ou disparue oublie son état : elle repart de zéro à son retour.

import { TICK_MS } from "../../lib/loop.js";

export function createProximitySounds({ entities, oneShots, effectiveMuffle }) {
  // id d'entité -> { open, busy, outsideMs }. outsideMs : temps de jeu
  // passé hors de la zone depuis la dernière sortie (0 dans la zone).
  const states = new Map();
  // Une fin de son peut arriver après la destruction de la scène (bascule de
  // face, transition) : elle ne doit plus toucher à rien.
  let destroyed = false;

  function play(entry, live, sound, state, x) {
    state.busy = true;
    oneShots.playTransitionSound(entry, live.x - x, sound, effectiveMuffle(entry), {
      onEnd: () => {
        if (!destroyed) state.busy = false;
      },
    });
  }

  // À chaque tick de la scène, avec la position du joueur et la photo des
  // entités vivantes du tick (voir ./entity-sounds.js/liveEntitiesById).
  function update(x, liveById) {
    for (const entry of entities.entitySounds) {
      if (!entry.approachSound && !entry.leaveSound) continue;
      const id = entry.entity.id;
      const live = liveById.get(id);
      if (!live || live.present === false) {
        states.delete(id);
        continue;
      }
      const inside = Math.abs(live.x - x) <= entry.interactRange;
      let state = states.get(id);
      if (!state) {
        states.set(id, { open: inside, busy: false, outsideMs: 0 });
        continue;
      }
      state.outsideMs = inside ? 0 : state.outsideMs + TICK_MS;
      if (state.busy) continue;
      if (inside && !state.open) {
        state.open = true;
        if (entry.approachSound) play(entry, live, entry.approachSound, state, x);
      } else if (!inside && state.open && state.outsideMs >= entry.proximityHoldMs) {
        state.open = false;
        if (entry.leaveSound) play(entry, live, entry.leaveSound, state, x);
      }
    }
  }

  function destroy() {
    destroyed = true;
    states.clear();
  }

  return { update, destroy };
}
