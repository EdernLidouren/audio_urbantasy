// SURFACES DE SOL — donnée pure (aucun import), le registre des surfaces et la
// surface par défaut d'une scène. Lu par le core (core/surfaces.js : accès,
// surface à une position ; core/scene.js : validation des scènes) et par la vue
// (son de pas).
//
// Structuré comme le registre de types d'entités (entities/types/index.js), mais
// à la différence de lui (contenu de rendu, injecté), une surface est prête à
// porter une future propriété de PHYSIQUE (ex. un ralentissement) que
// core/reduce.js ou core/physics/ liront un jour directement : une DONNÉE de
// config/, que le core importe directement comme config/tuning-values.js,
// jamais injectée en paramètre comme le registre d'entités (voir
// core/scene.js/parseScene).
//
// `neutral` : true = sol NEUTRE, le son de pas vient de l'ENTITÉ (gait/
// naturalWalk, voir doc/entity-model.md) ; false = sol SPÉCIAL, le son vient
// DU SOL et domine (le gait de l'entité est ignoré) — la résolution du son
// lui-même reste entièrement à la VUE (voir view/audio/footsteps.js),
// jamais ici : ce registre ne connaît AUCUN chemin de fichier, seulement ce
// flag déclaratif.
//
// EXTENSIBILITÉ : `neutral` est la
// SEULE propriété aujourd'hui, mais chaque entrée est un objet plat conçu
// pour en recevoir d'autres PLUS TARD (ex. `speedFactor` pour un
// ralentissement) SANS changer la forme du registre ni la logique de
// résolution (core/surfaces.js/surfaceAt, surfaceProps) — ajouter une propriété de
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
  rock: { neutral: false },
  sand: { neutral: false },
  shallow_water: { neutral: false },
  snow: { neutral: false },
  wood: { neutral: false },
};
// Repli SILENCIEUX de defaultSurface quand une scène ne le déclare pas (voir
// core/scene.js/parseScene) — DOIT exister dans SURFACE_REGISTRY. "concrete"
// : la surface la plus neutre possible (le son de pas vient alors de
// l'entité) — une scène qui ne déclare rien sonne comme un sol de ville
// ordinaire, sans aucune couleur de sol particulière.
export const DEFAULT_SURFACE = "concrete";
