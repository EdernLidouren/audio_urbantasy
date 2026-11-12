// SURFACES DE SOL — les règles du registre des surfaces
// (config/surfaces-values.js, la donnée et l'extensibilité d'une surface) :
// l'accès à une surface, et la surface à une position d'un monde.

import { SURFACE_REGISTRY, DEFAULT_SURFACE } from "../config/surfaces-values.js";

// Propriétés d'UNE surface par son nom — point d'extension gameplay futur
// (voir config/surfaces-values.js) : un appelant qui voudra lire `speedFactor` demain appelle
// EXACTEMENT cette fonction, rien à ajouter ici. Nom inconnu -> undefined,
// jamais d'exception : parseScene a déjà validé qu'une scène ne référence
// que des surfaces existantes (voir core/scene.js), ce cas ne devrait donc
// survenir qu'en cas d'appel direct hors du chemin validé.
export function surfaceProps(name) {
  return SURFACE_REGISTRY[name];
}

// Nom de la surface au point x d'un monde donné : le premier SEGMENT qui
// couvre x (bornes incluses ; en cas de chevauchement entre segments, non
// validé à l'écriture, le PREMIER du tableau gagne — ordre déterministe),
// sinon defaultSurface — JAMAIS undefined/null : toute la scène est
// couverte par construction (defaultSurface est la couche de base, les
// segments ne font que la PATCHER par endroits, voir doc/scene-format.md). Pure,
// testable au terminal. `world` est n'importe quel objet portant
// `defaultSurface`/`segments` (une scène parsée OU un monde d'état — même
// forme, voir core/scene.js et core/state.js).
export function surfaceAt(world, x) {
  const segment = world.segments.find((s) => x >= s.from && x <= s.to);
  return segment ? segment.surface : world.defaultSurface;
}

// Raccourci : propriétés de la surface au point x, plutôt que
// surfaceProps(surfaceAt(world, x)) répété à chaque appelant.
export function surfacePropsAt(world, x) {
  return surfaceProps(surfaceAt(world, x));
}
