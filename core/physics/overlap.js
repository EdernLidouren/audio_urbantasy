// Physique : résolution curative de chevauchement de corps. Le game design
// évite ce cas, mais le code ne doit pas en dépendre — voir movement.js
// pour la frontière physique/comportement (cette passe ne connaît aucune
// intention, seulement des positions déjà résolues à recontraindre).

import { BODY_RADIUS } from "../state.js";
import { clamp } from "./movement.js";
import { isBlocking } from "../presence.js";

// Sépare deux positions sur l'axe pour atteindre un écart minGap, borné à
// [0, length]. weightA/weightB pondèrent qui bouge en priorité (0 = ne bouge
// que si l'autre n'a plus de marge, 1 = bouge en premier ; 0/1 pour la
// priorité joueur, 0.5/0.5 pour une séparation symétrique entre deux
// entités). Si un bord de niveau coupe court au déplacement prévu d'un
// côté, le manque est reporté sur l'autre (déterministe) ; si aucun des
// deux n'a de marge (niveau plus court que minGap — cas dégénéré), léger
// chevauchement résiduel accepté : rester dans [0, length] est la seule
// garantie ferme. Pure.
export function separate(xA, weightA, xB, weightB, minGap, length) {
  const gap = xB - xA;
  const absGap = Math.abs(gap);
  if (absGap >= minGap) return { xA, xB };

  const overlap = minGap - absGap;
  const dir = gap >= 0 ? 1 : -1; // B est du côté "dir" de A (égalité -> +1, déterministe)
  const totalWeight = weightA + weightB;
  const shareA = totalWeight > 0 ? weightA / totalWeight : 0.5;
  const shareB = totalWeight > 0 ? weightB / totalWeight : 0.5;

  let newXA = clamp(xA - dir * overlap * shareA, 0, length);
  let newXB = clamp(xB + dir * overlap * shareB, 0, length);

  // Deux relances de compensation (B d'abord, puis A) : suffisant pour
  // reporter un manque d'un côté sur l'autre quel que soit lequel a heurté
  // un bord en premier, sans viser une résolution générale multi-corps.
  let shortfall = minGap - Math.abs(newXB - newXA);
  if (shortfall > 0) newXB = clamp(newXB + dir * shortfall, 0, length);
  shortfall = minGap - Math.abs(newXB - newXA);
  if (shortfall > 0) newXA = clamp(newXA - dir * shortfall, 0, length);

  return { xA: newXA, xB: newXB };
}

// Résolution de chevauchement des corps (curatif) : le game design évite ce
// cas, mais le code ne doit pas en dépendre. Appelée APRÈS le mouvement de
// tous les mobiles au tick. Une entité NON BLOQUANTE (isBlocking : passable,
// OU impassable mais DORMANTE — voir core/presence.js) n'a pas de zone
// d'exclusion propre : seule une paire impliquant AU MOINS UNE entité
// bloquante est résolue. Une seule passe déterministe (ordre = celui de
// level.entities), pas une résolution multi-corps itérative jusqu'à
// convergence — hors périmètre pour un cas que le level design évite par
// construction. Idempotente sur un état déjà sans chevauchement (aucune
// paire n'entre dans les `if`) : rejouée à un tick suivant où rien d'autre
// ne bouge, elle ne change rien -> pas de jitter.
export function resolveOverlaps(playerX, entities, length, presenceContext) {
  let resolvedPlayerX = playerX;
  let pushedBy = null;

  // 1) Joueur vs chaque entité bloquante : PRIORITÉ au joueur (weight 0),
  // c'est l'entité qui s'écarte (weight 1) — sauf si elle n'a plus de marge
  // (bord de niveau), auquel cas le report de séparation (voir `separate`)
  // fait bouger le joueur en dernier recours, du minimum nécessaire.
  const afterPlayer = entities.map((entity) => {
    if (!isBlocking(entity, presenceContext)) return entity;
    if (Math.abs(resolvedPlayerX - entity.x) >= BODY_RADIUS) return entity;

    const { xA, xB } = separate(resolvedPlayerX, 0, entity.x, 1, BODY_RADIUS, length);
    if (xA !== resolvedPlayerX) {
      resolvedPlayerX = xA;
      pushedBy = entity.id;
    }
    return xB === entity.x ? entity : { ...entity, x: xB };
  });

  // 2) Paires d'entités (hors joueur) impliquant au moins une bloquante :
  // séparation symétrique (weight 0.5/0.5). O(n²) mais le nombre d'entités
  // par niveau reste petit — pas un souci de performance ici.
  const resolvedEntities = afterPlayer.slice();
  for (let i = 0; i < resolvedEntities.length; i++) {
    for (let j = i + 1; j < resolvedEntities.length; j++) {
      const a = resolvedEntities[i];
      const b = resolvedEntities[j];
      if (!isBlocking(a, presenceContext) && !isBlocking(b, presenceContext)) continue;

      const { xA, xB } = separate(a.x, 0.5, b.x, 0.5, 2 * BODY_RADIUS, length);
      if (xA !== a.x) resolvedEntities[i] = { ...a, x: xA };
      if (xB !== b.x) resolvedEntities[j] = { ...b, x: xB };
    }
  }

  return { playerX: resolvedPlayerX, entities: resolvedEntities, pushedBy };
}
