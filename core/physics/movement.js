// Physique : applique et CONTRAINT les intentions de mouvement — jamais ne
// décide de bouger (ça, c'est core/behaviors/ : wander décide d'une
// direction, l'input du joueur produit son intention via action.dir). Cette
// séparation est structurelle : le comportement ne connaît pas les
// collisions ; la physique ne connaît pas les intentions, seulement un
// déplacement voulu à résoudre. Voir aussi collision.js (corps impassables)
// et overlap.js (chevauchement) pour le reste de la physique du jeu.
//
// Deux formes de blocage aujourd'hui, la même idée ("mobile empêché ->
// réaction") : les bornes de la scène (moveAndBounce ci-dessous, pour un
// mobile qui persiste sa propre direction — ex. wander) et le corps d'une
// entité impassable (collision.js, pour le joueur). Elles restent deux
// fonctions distinctes (le joueur n'a pas de direction stockée à inverser,
// contrairement à wander), mais c'est la même famille de règle physique.
//
// Futur (pas codé ici, porte laissée ouverte) : c'est ici que viendraient
// d'éventuelles règles de monde supplémentaires — inertie, gravité — le
// jour où elles deviendraient nécessaires. Aucune n'existe aujourd'hui,
// aucune n'est anticipée en code mort.

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Applique un déplacement de `delta` depuis `x`, borné à [0, length] — le
// seul pas fixe du jeu. Pure.
export function moveWithinBounds(x, delta, length) {
  return clamp(x + delta, 0, length);
}

// Applique un déplacement de dir * delta depuis x, borné à [0, length],
// pour un mobile qui PERSISTE sa propre direction d'un tick à l'autre (ex.
// wander — voir behaviors/wander.js), à la différence du joueur (direction
// relue depuis l'entrée à chaque tick, jamais stockée — voir
// collision.js/resolvePlayerMove). Contrat de blocage aux bornes, choisi
// pour préserver EXACTEMENT le comportement d'avant ce refacto (rebond
// immédiat, jamais un tick de retard) : quand le déplacement voulu
// dépasserait [0, length], la position est bornée ET la direction renvoyée
// est DÉJÀ inversée, dans le MÊME appel — pas de signal différé que le
// comportement encaisserait au tick suivant (ça collerait le mobile un
// tick de trop contre la borne au lieu de repartir aussitôt). Pure.
export function moveAndBounce(x, dir, delta, length) {
  const rawX = x + dir * delta;
  const hitLower = rawX <= 0;
  const hitUpper = rawX >= length;
  const nextX = clamp(rawX, 0, length);
  const nextDir = hitLower ? 1 : hitUpper ? -1 : dir;
  return { x: nextX, dir: nextDir };
}
