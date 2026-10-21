// Brique portable : le MÉCANISME de cascade de réglages, aucune connaissance
// d'aucun projet. Reçoit ses défauts et son registre de types en paramètres —
// ne les importe jamais lui-même, pour rester déposable tel quel ailleurs.

// Résolution en cascade, du plus spécifique au plus général :
//   a. sound[key]                 — surcharge portée par le descripteur de
//                                    son (le niveau le plus fin, ex. un son
//                                    précis avec son propre reverbSend) ;
//   b. entity.tuning[key]         — surcharge portée par l'INSTANCE (le
//                                    jeu transporte tuning tel quel depuis
//                                    sa donnée de scène, jamais en clé à
//                                    clé nommée en dur) ;
//   c. registry[entity.type][key] — défaut du type ;
//   d. defaults[key]              — défaut global (dernier recours).
// entity et sound peuvent être omis (ou ne rien préciser) : la cascade
// retombe alors directement sur le défaut global. sound sans entity est
// valide (ex. le son du joueur, qui n'est l'instance d'aucun type).
// entity.tuning (plutôt que des propriétés directement sur entity) : espace
// de noms RÉSERVÉ pour cette cascade, jamais mélangé aux autres champs
// d'une entité (ex. id/type/x/nameKey...), qui restent la donnée propre au
// jeu, jamais résolue par ce mécanisme.
export function createTuningResolver(defaults, registry) {
  return function resolveTuning(key, entity = null, sound = null) {
    if (sound && sound[key] !== undefined) {
      return sound[key];
    }

    if (entity && entity.tuning && entity.tuning[key] !== undefined) {
      return entity.tuning[key];
    }

    const typeDefaults = entity && registry[entity.type];
    if (typeDefaults && typeDefaults[key] !== undefined) {
      return typeDefaults[key];
    }

    return defaults[key];
  };
}
