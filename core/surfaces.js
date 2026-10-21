// Registre des surfaces de sol — données pures, structuré comme le registre
// de types d'entités (entities/types/index.js), mais ICI dans core/ : à la
// différence du registre d'entités (contenu, jamais lu par le core), une
// surface est prête à porter une future propriété de PHYSIQUE (ex. un
// ralentissement) que core/reduce.js ou core/physics/ liront un jour
// directement — c'est pourquoi ce registre vit dans core/, importé
// DIRECTEMENT comme config/tuning-values.js, jamais injecté en paramètre
// comme le registre d'entités (voir core/scene.js/parseScene).
//
// `neutral` : true = sol NEUTRE, le son de pas vient de l'ENTITÉ (gait/
// naturalWalk, voir doc/entity-model.md) ; false = sol SPÉCIAL, le son vient
// DU SOL et domine (le gait de l'entité est ignoré) — la résolution du son
// lui-même reste entièrement à la VUE (voir view/audio/city-scene.js),
// jamais ici : ce registre ne connaît AUCUN chemin de fichier, seulement ce
// flag déclaratif.
//
// EXTENSIBILITÉ (voir CLAUDE.md, "prêt à accueillir") : `neutral` est la
// SEULE propriété aujourd'hui, mais chaque entrée est un objet plat conçu
// pour en recevoir d'autres PLUS TARD (ex. `speedFactor` pour un
// ralentissement) SANS changer la forme du registre ni la logique de
// résolution ci-dessous (surfaceAt/surfaceProps) — ajouter une propriété de
// gameplay, c'est ajouter une clé à chaque entrée concernée, jamais une
// nouvelle fonction. Ajouter une SURFACE, c'est ajouter une entrée ici,
// jamais une catégorie ou un cas en dur ailleurs (même principe que les
// PRESETS d'entités, voir doc/entity-model.md).
export const SURFACE_REGISTRY = {
  asphalt: { neutral: true },
  carpet: { neutral: false },
  concrete: { neutral: true },
  dirt: { neutral: false },
  grass: { neutral: false },
  gravel: { neutral: false },
  light_snow: { neutral: false },
  metal: { neutral: false },
  mud: { neutral: false },
  sand: { neutral: false },
  shallow_water: { neutral: false },
  snow: { neutral: false },
  wood: { neutral: false },
};

// Repli SILENCIEUX de defaultSurface quand une scène ne le déclare pas (voir
// core/scene.js/parseScene) — DOIT exister dans SURFACE_REGISTRY. "concrete"
// : la surface la plus neutre possible, celle qui correspond déjà au son de
// pas actuel du jeu — choisie pour que toute scène existante qui ne déclare
// rien sonne EXACTEMENT comme avant l'introduction des surfaces.
export const DEFAULT_SURFACE = "concrete";

// Propriétés d'UNE surface par son nom — point d'extension gameplay futur
// (voir header) : un appelant qui voudra lire `speedFactor` demain appelle
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
// forme, voir core/scene.js/core/state.js).
export function surfaceAt(world, x) {
  const segment = world.segments.find((s) => x >= s.from && x <= s.to);
  return segment ? segment.surface : world.defaultSurface;
}

// Raccourci : propriétés de la surface au point x, plutôt que
// surfaceProps(surfaceAt(world, x)) répété à chaque appelant.
export function surfacePropsAt(world, x) {
  return surfaceProps(surfaceAt(world, x));
}
