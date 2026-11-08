// Jeu des billes : la FILE DE SONS, qui étale dans le temps les sons d'un même
// geste (le brassage puis chaque balise de pioche, les deux billes d'un échange).
// Pour le son seulement : rien n'attend la file, le joueur garde la main. Pure :
// aucun son ni minuteur ; l'écran (view/marbles/screen.js) la fait avancer à chaque
// frame (onFrame : un menu ouvert par-dessus la fige, comme la séquence de
// résolution) et joue les repères qu'elle lui rend.
//
// Un REPÈRE : { atMs, sound, ... }, à jouer `atMs` après sa mise en file
// (view/marbles/sounds.js/eventCues) ; pour la file, le reste ne compte pas. La file : une liste de { remainingMs, cue },
// dans l'ordre de mise en file.

export const EMPTY_SOUND_QUEUE = [];

export function enqueueCues(queue, cues) {
  return [...queue, ...cues.map((cue) => ({ remainingMs: cue.atMs, cue }))];
}

// Le temps passe. -> { queue, due } : la file d'après, et les repères à jouer
// maintenant, dans l'ordre de leur échéance (à égalité, de leur mise en file).
// Appelée avec 0 juste après une mise en file : un repère immédiat part aussitôt,
// sans attendre la frame suivante.
export function advanceSoundQueue(queue, deltaMs) {
  const next = queue.map((item) => ({ ...item, remainingMs: item.remainingMs - deltaMs }));
  const due = next
    .map((item, order) => ({ ...item, order }))
    .filter((item) => item.remainingMs <= 0)
    .sort((a, b) => a.remainingMs - b.remainingMs || a.order - b.order)
    .map((item) => item.cue);
  return { queue: next.filter((item) => item.remainingMs > 0), due };
}
