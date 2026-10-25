// MESSAGES EN ROTATION côté vue (voir core/rotation.js pour le tirage,
// doc/entity-model.md/"Messages en rotation") : le texte du message qu'une
// entité affiche EN CE MOMENT, glissé dans sa description par {message}
// (view/description-resolver.js). Jamais stocké : recalculé à chaque
// lecture, depuis l'heure de jeu du contexte.
//
// Seul module à importer le registre des séries (rotations/index.js) : il
// les valide à son chargement, et vérifie que chaque archétype qui cite une
// série (messageRotation) cite une série connue — une erreur arrête le jeu
// au démarrage, jamais un message introuvable en silence (même politique
// que view/collection-discoveries.js).

import rotations from "../rotations/index.js";
import registry from "../entities/types/index.js";
import { validateRotation, rotationEntryAt, rotationTextKey } from "../core/rotation.js";
import { resolveTuning } from "../config/tuning.js";
import { t } from "../data/i18n/index.js";

for (const [rotationId, rotation] of Object.entries(rotations)) {
  validateRotation(rotationId, rotation);
}
for (const [type, archetype] of Object.entries(registry)) {
  const rotationId = archetype.messageRotation;
  if (rotationId !== undefined && !Object.hasOwn(rotations, rotationId)) {
    throw new Error(`type "${type}" : messageRotation "${rotationId}" absent de rotations/index.js.`);
  }
}

// Texte du message affiché par `context.entity` à l'heure `context.time`,
// ou undefined si l'entité n'affiche aucune série (ou hors partie). Le SEL
// du tirage est l'entité dans son monde : deux panneaux ne passent pas la
// même réclame à la même heure, et un panneau garde sa propre suite d'une
// visite à l'autre. (Toute partie a aujourd'hui la même seed, que la
// session ne garde pas ; une seed de partie rejoindrait ce sel.)
export function rotationMessage(context) {
  const entity = context?.entity;
  const rotationId = entity && registry[entity.type]?.messageRotation;
  if (!rotationId || context.time === undefined) return undefined;
  const salt = `${context.session?.activeWorldId}:${entity.id}`;
  const entry = rotationEntryAt(rotations[rotationId], salt, context.time, resolveTuning("messageRotationMinutes", entity));
  return t(rotationTextKey(rotationId, entry));
}
