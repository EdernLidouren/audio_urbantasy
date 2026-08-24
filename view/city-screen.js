// Écran "ville" : possède l'onTick continu (déplacement) et la scène audio
// spatiale qui suit la position du joueur. Ne détient aucune donnée de
// partie en propre — vue sur la session (état du core), lue/écrite via les
// accesseurs fournis par main.js.

import { getMoveIntent } from "./input.js";
import { announce } from "../lib/announce.js";
import { t } from "../i18n/index.js";
import { ensureAudioUnlocked } from "../lib/audio.js";
import { createCityAudioScene } from "./audio/city-scene.js";
import { interact, chooseInteractionTarget } from "./interaction.js";
import { openPauseMenu } from "./menus/pause-menu.js";
import { tick } from "../core/actions.js";
import { reduce } from "../core/reduce.js";

export function makeCityScreen(getSession, setSession) {
  let scene = null;

  return {
    onEnter() {
      // Un écran poussé PAR-DESSUS la ville (menu de désambiguïsation
      // d'interaction, voir view/interaction.js) fait rappeler onEnter à son
      // retrait (lib/screens.js, popScreen révèle l'écran dessous et le
      // "réannonce"). Pour un menu classique c'est voulu ; pour la ville,
      // non : pas de nouvelle scène audio ni de re-annonce du titre à chaque
      // fermeture de sous-menu. scene non nul = ce n'est pas la toute
      // première entrée, on ne fait rien.
      if (scene) return;

      ensureAudioUnlocked();
      scene = createCityAudioScene(getSession);
      document.getElementById("game").focus();
      announce(t(getSession().level.titleKey), { assertive: true });
    },
    onTick() {
      setSession(reduce(getSession(), tick(getMoveIntent())));
      scene.update();
    },
    // Espace/Entrée : touches discrètes (screens.js ne route que la touche
    // non répétée), pas de souci d'auto-interruption ici. N'agit que quand
    // la ville est au sommet de la pile : le stack routing s'en charge par
    // construction (voir CLAUDE.md), aucune vérification à faire ici.
    onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        openPauseMenu(scene);
        return;
      }

      if (event.key !== " " && event.key !== "Enter") return;

      // Surtout pour Espace : sans ça, la page défilerait.
      event.preventDefault();

      const kind = event.key === " " ? "describe" : "activate";
      // scene passé pour la pause/reprise sélective des balises pendant un
      // éventuel menu de désambiguïsation (2+ candidats) — voir
      // chooseInteractionTarget.
      const target = chooseInteractionTarget(scene.getInteractionCandidates(), kind, scene);
      if (!target) return;

      interact(target, kind);
    },
    onExit() {
      scene.destroy();
      scene = null;
      // Invariant documenté (CLAUDE.md) : session est null hors partie.
      // Seul chemin de sortie de la ville aujourd'hui (menu pause -> retour
      // au menu principal, voir view/menus/pause-menu.js).
      setSession(null);
    },
  };
}
