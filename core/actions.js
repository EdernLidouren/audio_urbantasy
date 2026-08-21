// Constructeurs d'actions. Le core n'a ni horloge ni clavier : il reçoit une
// intention de déplacement par tick, câblée depuis l'extérieur.

// dir : -1 (gauche), 0 (immobile), +1 (droite). Toute autre valeur -> 0.
export function tick(dir) {
  const validDir = dir === -1 || dir === 1 ? dir : 0;
  return { type: "TICK", dir: validDir };
}
