// Brique portable : le MÉCANISME de cascade de réglages, aucune connaissance
// d'aucun projet. Reçoit ses défauts et son registre de types en paramètres —
// ne les importe jamais lui-même, pour rester déposable tel quel ailleurs.

// Résolution en cascade, du plus spécifique au plus général :
//   a. entity[key]                — surcharge portée par l'instance ;
//   b. registry[entity.type][key] — défaut du type ;
//   c. defaults[key]              — défaut global (dernier recours).
// entity peut être omis (ou ne rien préciser) : la cascade retombe alors
// directement sur le défaut global.
export function createTuningResolver(defaults, registry) {
  return function resolveTuning(key, entity = null) {
    if (entity && entity[key] !== undefined) {
      return entity[key];
    }

    const typeDefaults = entity && registry[entity.type];
    if (typeDefaults && typeDefaults[key] !== undefined) {
      return typeDefaults[key];
    }

    return defaults[key];
  };
}
