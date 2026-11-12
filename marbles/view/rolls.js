// Jeu des billes : le MOUVEMENT d'une bille qui roule de place en place, pour le
// son seulement. Pur : aucun son ni minuteur, que des positions { x, y } de la
// table (marbles/view/sounds/space.js/positionOf) et des durées. Les sons de l'écran
// (marbles/view/sounds.js) s'en servent deux fois : pour placer l'arrivée sur la ligne
// de temps d'un geste (rollDurationMs, marbles/view/sounds/timeline.js), puis, frame
// après frame, pour déplacer la boucle de roulement (rollAt,
// marbles/view/sounds/space.js).
//
// Un trajet est un CHEMIN : la suite des positions par où passe la bille, deux au
// moins (départ et arrivée). Elle passe par les étapes sans s'arrêter, comme le
// triangle qui tourne de plusieurs crans d'un seul élan.
//
// Le modèle : la bille part à sa vitesse et ralentit RÉGULIÈREMENT jusqu'à
// `endRatio` fois celle-ci à l'arrivée (marbles/config/values.js/MARBLES_ROLLS),
// sur tout le chemin. Une décélération constante : elle parcourt plus de chemin au
// début qu'à la fin, et l'oreille entend une bille qui s'essouffle, pas une bille
// qu'on traîne.

export function distance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

// La longueur d'un chemin, étape par étape.
export function pathLength(path) {
  let length = 0;
  for (let index = 1; index < path.length; index++) length += distance(path[index - 1], path[index]);
  return length;
}

// La durée du trajet, en millisecondes. Un style à vitesse (`speed`) : la longueur
// divisée par la vitesse moyenne, qui est la moyenne des vitesses de départ et
// d'arrivée sous une décélération constante. Un style à crans (`notchMs`) : une
// durée par étape, quelle que soit sa longueur — les billes d'un triangle qui
// tourne partent et arrivent ensemble, comme un bloc.
export function rollDurationMs(path, style) {
  if (style.notchMs !== undefined) return style.notchMs * (path.length - 1);
  return (1000 * pathLength(path)) / ((style.speed * (1 + style.endRatio)) / 2);
}

// Le point du chemin à `length` de son départ.
function pointAlong(path, length) {
  let remaining = length;
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];
    const segment = distance(from, to);
    if (remaining <= segment && segment > 0) {
      const share = remaining / segment;
      return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
    }
    remaining -= segment;
  }
  return path[path.length - 1];
}

// Où en est la bille `elapsedMs` après son départ -> { position, speedRatio,
// done } : sa position sur la table, sa vitesse en part de celle du départ (1 au
// départ, `endRatio` à l'arrivée), et si elle est arrivée.
export function rollAt({ path, durationMs, endRatio }, elapsedMs) {
  const progress = durationMs > 0 ? Math.min(1, Math.max(0, elapsedMs / durationMs)) : 1;
  // Part du chemin parcourue : l'intégrale de la vitesse, ramenée à 1 à l'arrivée.
  const slowdown = 1 - endRatio;
  const covered = (progress - (slowdown * progress * progress) / 2) / (1 - slowdown / 2);
  return {
    position: progress >= 1 ? path[path.length - 1] : pointAlong(path, covered * pathLength(path)),
    speedRatio: 1 - slowdown * progress,
    done: progress >= 1,
  };
}

// L'enveloppe de volume de la boucle : un fondu de `fadeMs` à l'entrée et à la
// sortie, contre les clics ; la sortie s'achève à l'arrivée, où la chute ou le
// choc prend le relais.
export function rollEnvelope(elapsedMs, durationMs, fadeMs) {
  if (fadeMs <= 0) return 1;
  return Math.max(0, Math.min(1, elapsedMs / fadeMs, (durationMs - elapsedMs) / fadeMs));
}
