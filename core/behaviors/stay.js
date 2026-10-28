// Comportement "stay" : l'entité RESTE OÙ ELLE EST — aucune intention de
// mouvement, aucun PRNG, aucun paramètre. Différent d'une entité SANS
// comportement : "stay" se POSE, en particulier comme comportement
// temporaire (voir core/temporary-behavior.js) par-dessus une errance ou
// un suivi, pour figer l'entité un instant (le chien sifflé qui s'arrête
// et dresse l'oreille avant d'accourir), puis la rendre à sa base. Demain :
// le chien à qui on dit « assis ».
//
// Même contrat que les autres modules (wander.js, follow.js, goto.js) :
// une intention (ici toujours 0), jamais une position. Une entité figée
// peut encore être poussée par la résolution des chevauchements (voir
// core/physics/overlap.js), comme toute entité immobile.

// Aucun champ en plus de `kind` : un `speed` n'aurait aucun sens.
export const DEFAULTS = {};
export const PARAMS = [];

export function parseParams() {
  return {};
}

// rngState TRANSMIS TEL QUEL, comme follow.js et goto.js.
export function step(entity, context) {
  return { entity, rngState: context.rngState, intent: 0 };
}

export default { DEFAULTS, PARAMS, parseParams, step };
