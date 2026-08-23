// Brique portable : le MÉCANISME de cascade de réglages, aucune connaissance
// d'aucun projet. Reçoit ses défauts et son registre de types en paramètres —
// ne les importe jamais lui-même, pour rester déposable tel quel ailleurs.

// Résolution en cascade, du plus spécifique au plus général :
//   a. sound[key]                 — surcharge portée par le descripteur de
//                                    son (le niveau le plus fin, ex. un son
//                                    précis avec son propre reverbSend) ;
//   b. entity[key]                — surcharge portée par l'instance ;
//   c. registry[entity.type][key] — défaut du type ;
//   d. defaults[key]              — défaut global (dernier recours).
// entity et sound peuvent être omis (ou ne rien préciser) : la cascade
// retombe alors directement sur le défaut global. sound sans entity est
// valide (ex. le son du joueur, qui n'est l'instance d'aucun type).
export function createTuningResolver(defaults, registry) {
  return function resolveTuning(key, entity = null, sound = null) {
    if (sound && sound[key] !== undefined) {
      return sound[key];
    }

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
