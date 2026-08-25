// Auto-save TEMPORELLE (temps RÉEL, horloge murale — performance.now()),
// INDÉPENDANTE de l'auto-save sur transition (voir city-screen.js) : les
// deux coexistent sans se coupler, chacune sa propre préférence
// (autoSaveIntervalMinutes / autoSaveOnTransition, config/preferences.js).
//
// Câblée directement dans la boucle rAF (voir main.js), PAS dans
// city-screen.js/onTick : ce dernier s'arrête dès qu'un menu est au sommet
// de la pile (seul le sommet reçoit le tick, voir lib/screens.js), alors
// que ce timer doit continuer à courir même menu ouvert — "temps réel"
// signifie explicitement le temps mur du navigateur, indépendant de
// l'écran actif ET de toute future horloge IN-GAME (ticks du core) qui
// pourrait exister séparément un jour.

import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";
import { saveGame } from "./save-storage.js";

let lastAutoSaveAt = performance.now();

// getSession : accesseur, peut renvoyer null hors partie — dans ce cas rien
// à sauvegarder, mais le compteur est quand même réarmé (voir plus bas) :
// pas de sauvegarde "en dette" qui se déclencherait dès l'entrée en jeu
// suivante après une longue attente au menu principal.
export function checkAutoSaveTimer(getSession) {
  const minutes = getPref("autoSaveIntervalMinutes", PREF_CONSTRAINTS.autoSaveIntervalMinutes.default);
  if (minutes <= 0) return; // 0 = désactivée

  const now = performance.now();
  if (now - lastAutoSaveAt < minutes * 60 * 1000) return;

  lastAutoSaveAt = now;

  const session = getSession();
  if (!session) return;

  // Sauvegarde manuelle ou temporelle : le son joue (voir
  // view/save-storage.js) — seule l'auto-save sur TRANSITION le désactive.
  saveGame(session, { playSound: true });
}
