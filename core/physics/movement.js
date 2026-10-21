// Physique : applique et CONTRAINT les intentions de mouvement — jamais ne
// décide de bouger (ça, c'est core/behaviors/ : wander décide d'une
// direction, l'input du joueur produit son intention via action.dir). Cette
// séparation est structurelle : le comportement ne connaît pas les
// collisions ; la physique ne connaît pas les intentions, seulement un
// déplacement voulu à résoudre. Voir aussi collision.js (corps impassables)
// et overlap.js (chevauchement) pour le reste de la physique du jeu.
//
// Les bornes de la scène se résolvent ici (moveWithinBounds, appelé par
// collision.js pour TOUT mobile, joueur comme entité à intention) ; le
// corps d'une entité impassable dans collision.js. Les comportements ne
// voient jamais ni l'un ni l'autre : un wander bloqué le constate seulement
// a posteriori, par sa position inchangée (voir behaviors/wander.js).
//
// Futur (pas codé ici, porte laissée ouverte) : c'est ici que viendraient
// d'éventuelles règles de monde supplémentaires — inertie, gravité — le
// jour où elles deviendraient nécessaires. Aucune n'existe aujourd'hui,
// aucune n'est anticipée en code mort.

// Applique un déplacement de `delta` depuis `x`, borné à [0, length] — le
// seul pas fixe du jeu. Pure.
import { clamp } from "../../lib/math.js";

export function moveWithinBounds(x, delta, length) {
  return clamp(x + delta, 0, length);
}
