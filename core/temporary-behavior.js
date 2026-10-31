// COMPORTEMENT TEMPORAIRE (voir doc/entity-model.md/"Comportement
// temporaire") — un comportement posé PAR-DESSUS celui d'une entité, pour
// une durée bornée : un chien qu'on siffle accourt, suit le joueur un
// moment, puis reprend ce qu'il faisait. Pur, headless.
//
// UN SEUL champ runtime, `entity.temporaryBehavior = { behavior, ticksLeft }`
// (comme `startled`, jamais écrit dans le JSON de scène), et trois moments :
//   - POSE : l'effet d'action d'ÉTAT "temporaryBehavior" (core/variables.js/
//     applyActionEffects), depuis une action ou un trigger. Un nouvel effet
//     REMPLACE le précédent et relance le décompte.
//   - TICK (core/reduce.js/stepEntities) : il PRIME sur `entity.behavior`
//     tant qu'il dure, puis s'efface de lui-même (countDownTemporaryBehavior).
//     La BASE (`entity.behavior`) n'est jamais écrasée : à l'échéance,
//     l'entité retombe sur elle telle qu'elle est À CE MOMENT (une règle de
//     présence a pu la changer entre-temps).
//   - OUBLI AU CHARGEMENT du monde (forgetTemporaryBehaviors, appelé par
//     core/world-load.js à chaque chargement, avec le retour des entités
//     envolées) : un monde quitté pendant un appel ne garde pas l'appel en
//     suspens jusqu'au retour.
//
// FILET DE SÉCURITÉ : la durée est obligatoire et > 0 (validée au
// chargement, core/script-parse.js) — un comportement temporaire sans fin
// n'est pas représentable, une entité ne peut pas rester coincée dessus
// (même bloquée derrière un obstacle, en "follow" qui n'arrive jamais).

import { isTwoSided, withFace, withActiveWorld } from "./state.js";

// Le comportement qui s'exécute : le temporaire s'il y en a un, sinon la
// base. Lu par core/reduce.js pour le pas ET pour l'allure.
export function activeBehaviorOf(entity) {
  return entity.temporaryBehavior ? entity.temporaryBehavior.behavior : entity.behavior;
}

// Un tick passe : une unité de moins, ou le retrait si la dernière a été
// jouée au tick précédent. Décompté pour TOUTE entité, dormante comprise :
// le temps passe pour elle aussi.
export function countDownTemporaryBehavior(entity) {
  const temporary = entity.temporaryBehavior;
  if (!temporary) return entity;
  if (temporary.ticksLeft <= 0) return withoutTemporaryBehavior(entity);
  return { ...entity, temporaryBehavior: { ...temporary, ticksLeft: temporary.ticksLeft - 1 } };
}

// Remet la base sous `behavior` après le pas d'un comportement temporaire
// (le module de comportement ne connaît que ce champ, voir core/reduce.js) —
// sans jamais créer de clé `behavior: undefined` pour une entité qui n'en
// avait pas : sa forme sérialisée reste celle de sa scène.
export function withBaseBehavior(stepped, base) {
  if (base !== undefined) return { ...stepped, behavior: base };
  const { behavior, ...rest } = stepped;
  return rest;
}

function withoutTemporaryBehavior(entity) {
  if (!entity.temporaryBehavior) return entity;
  const { temporaryBehavior, ...rest } = entity;
  return rest;
}

// Chargement d'un monde : plus aucun comportement temporaire, sur ses deux
// faces ni chez les compagnons (ils arrivent avec le joueur). Références
// conservées quand il n'y a rien à retirer.
export function forgetTemporaryBehaviors(session) {
  const world = session.worlds[session.activeWorldId];
  const sides = isTwoSided(world) ? ["recto", "verso"] : [null];
  let nextWorld = world;
  for (const side of sides) {
    const face = side === null ? world : world[side];
    if (!face.entities.some((entity) => entity.temporaryBehavior)) continue;
    nextWorld = withFace(nextWorld, side, { entities: face.entities.map(withoutTemporaryBehavior) });
  }
  const next = nextWorld === world ? session : withActiveWorld(session, nextWorld);
  if (!session.companions.some((companion) => companion.temporaryBehavior)) return next;
  return { ...next, companions: next.companions.map(withoutTemporaryBehavior) };
}
