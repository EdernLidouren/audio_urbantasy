// Boucle de jeu à pas fixe, avec accumulateur. Aucune connaissance du
// gameplay : appelle onTick() à cadence fixe, rien d'autre. Pas d'import du
// core — le câblage core <-> vue se fait dans main.js.

export const TICK_MS = 1000 / 60;
export const MAX_FRAME_MS = 250; // plafond anti-spirale de la mort

let rafId = null;
let accumulator = 0;
let lastTime = null;

// onFrame (optionnel) : delta RÉEL brut (ms), UNE fois par frame rAF —
// jamais plafonné à MAX_FRAME_MS (ce plafond est une protection anti-
// spirale de la mort pour l'ACCUMULATEUR à pas fixe ci-dessous, sans
// rapport avec un consommateur qui veut le temps réel écoulé tel quel, ex.
// l'horloge de partie — voir view/city-screen.js). Découplé du nombre de
// ticks exécutés : un onTick() catch-up en rafale (frame lente) ne doit
// jamais faire avancer un consommateur temps-réel plus vite ou plus
// lentement que l'horloge murale.
export function startLoop(onTick, onFrame) {
  // Idempotent : redémarrer annule d'abord toute boucle déjà active, pour
  // éviter d'empiler des chaînes de rAF concurrentes.
  stopLoop();
  accumulator = 0;
  lastTime = null;

  function frame(now) {
    const delta = lastTime === null ? 0 : now - lastTime;
    lastTime = now;

    if (onFrame) onFrame(delta);

    accumulator += Math.min(delta, MAX_FRAME_MS);

    while (accumulator >= TICK_MS) {
      accumulator -= TICK_MS;
      onTick();
    }

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
}

export function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}
