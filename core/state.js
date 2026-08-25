// Forme de l'état + construction de l'état initial. Pur, headless : aucun
// DOM, audio, ni API navigateur.

// MOVE_STEP est un réglage de feeling. Le core importe UNIQUEMENT les
// valeurs pures (config/tuning-values.js), jamais config/tuning.js — ce
// dernier connecte aussi le registre d'entités et la logique de cascade, que
// le core n'a aucune raison de draîner pour lire un seul nombre.
import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { createSeed } from "./rng.js";

export const MOVE_STEP = TUNING_DEFAULTS.moveStep;

// Rayon de corps uniforme pour toute entité blocksMovement — pas encore par
// entité/type. Orthogonal à blocksMovement, qui décide SEUL si ce corps
// arrête/exclut quelque chose (voir core/reduce.js). Vit ici (pas dans
// reduce.js) pour être partagé sans détour par core/level.js (validation au
// chargement) ET core/reduce.js (résolution au tick) — une seule source.
export const BODY_RADIUS = 0.25;

// Graine par défaut du PRNG : fixe, jamais Date.now() — le déterminisme
// (voir CLAUDE.md) s'applique aussi en jeu réel, pas seulement en test.
const DEFAULT_SEED = 1;

// Construit l'état de départ à partir d'un niveau déjà validé (sortie de
// parseLevel). Le joueur démarre à level.playerStart. seed est optionnel
// (les appelants existants n'en fournissent pas) : mêmes seed + suite de
// ticks -> toujours la même trajectoire pour toute entité "wander" (voir
// reduce.js). Les entités "wander" reçoivent ici leur direction initiale
// (dir), seule pièce d'état mobile qui n'existe pas encore sur l'entité
// telle que produite par parseLevel.
export function createInitialState(level, seed = DEFAULT_SEED) {
  return {
    level: {
      ...level,
      entities: level.entities.map((entity) =>
        entity.behavior?.kind === "wander" ? { ...entity, dir: 1 } : entity
      ),
    },
    // blockedBy : id de l'entité bloquante contre laquelle le joueur bute CE
    // tick, ou null. pushedBy : id de l'entité dont la résolution de
    // chevauchement a forcé le joueur à se déplacer CE tick (cas curatif,
    // voir core/reduce.js), ou null — distinct de blockedBy (bute en
    // avançant vs déjà chevauché malgré lui). Les deux transitoires,
    // recalculés à chaque tick, jamais accumulés.
    player: { x: level.playerStart, blockedBy: null, pushedBy: null },
    rngState: createSeed(seed),
  };
}
