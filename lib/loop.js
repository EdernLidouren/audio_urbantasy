// Boucle de jeu à pas fixe, avec accumulateur. Aucune connaissance du
// gameplay : appelle onTick() à cadence fixe, rien d'autre. Pas d'import du
// core — le câblage core <-> vue se fait dans main.js.

export const TICK_MS = 1000 / 60;
export const MAX_FRAME_MS = 250; // plafond anti-spirale de la mort

let rafId = null;
let accumulator = 0;
let lastTime = null;

export function startLoop(onTick) {
  // Idempotent : redémarrer annule d'abord toute boucle déjà active, pour
  // éviter d'empiler des chaînes de rAF concurrentes.
  stopLoop();
  accumulator = 0;
  lastTime = null;

  function frame(now) {
    const delta = lastTime === null ? 0 : now - lastTime;
    lastTime = now;

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
