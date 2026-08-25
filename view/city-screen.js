// Écran "ville" : possède l'onTick continu (déplacement) et la scène audio
// spatiale qui suit la position du joueur. Ne détient aucune donnée de
// partie en propre — vue sur la session (état du core), lue/écrite via les
// accesseurs fournis par main.js.

import { getMoveIntent } from "./input.js";
import { announce } from "../lib/announce.js";
import { t } from "../i18n/index.js";
import { ensureAudioUnlocked } from "../lib/audio.js";
import { createCityAudioScene } from "./audio/city-scene.js";
import { interact, chooseInteractionTarget, setDoorTransitionHandler } from "./interaction.js";
import { openPauseMenu } from "./menus/pause-menu.js";
import { setGameReplaceHandler } from "./menus/save-menu.js";
import { tick } from "../core/actions.js";
import { reduce } from "../core/reduce.js";
import { loadLevelById } from "../level/load.js";
import { getActiveWorld, travelToWorld } from "../core/state.js";
import registry from "../entities/types.js";
import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";
import { saveGame } from "./save-storage.js";

export function makeCityScreen(getSession, setSession) {
  let scene = null;

  // Transition FRANCHE par porte (pas de fondu, pas d'animation) :
  // scene.destroy() arrête et décharge TOUT ce que possédait le lieu
  // courant — balises, réverb, ET canaux globaux musique/ambiance (voir
  // view/audio/city-scene.js) — donc aucun Howl résiduel, rien de plus à
  // nettoyer ici. Le monde quitté est RANGÉ (gelé) dans session.worlds, pas
  // détruit : une re-visite le ressort tel quel (voir core/state.js,
  // travelToWorld). Le fetch reste ici, au bord — SEULEMENT si la cible
  // n'est pas déjà connue de la partie ; sinon aucun réseau, la cible
  // ressort directement de worlds. Nouvelle scène audio sur le monde actif,
  // annonce du titre.
  //
  // scene reste null le temps de l'attente réseau (éventuelle) : onTick et
  // onKeyDown s'en gardent (voir plus bas) plutôt que d'accéder une scène
  // absente — aucune touche n'a d'effet pendant cette brève fenêtre.
  async function transitionThroughDoor(targetId) {
    scene.destroy();
    scene = null;

    const session = getSession();
    const alreadyVisited = Boolean(session.worlds[targetId]);
    const freshLevel = alreadyVisited ? null : await loadLevelById(targetId, registry);

    setSession(travelToWorld(session, targetId, freshLevel));
    scene = createCityAudioScene(getSession);
    announce(t(getActiveWorld(getSession()).titleKey), { assertive: true });

    // Auto-save SUR TRANSITION (préférence autoSaveOnTransition, défaut
    // true) : la transition vient d'atteindre un point de cohérence
    // naturel (nouveau monde actif, ancien rangé) — après l'annonce du
    // titre, saveGame() ajoute sa propre annonce de confirmation, qui prime
    // alors sur la ligne assertive. SANS le son (playSound:false) : une
    // simple traversée de porte ne doit jamais se superposer au reste de
    // l'ambiance sonore — seules la sauvegarde manuelle et l'auto-save
    // temporelle (voir view/autosave-timer.js) le jouent.
    if (getPref("autoSaveOnTransition", PREF_CONSTRAINTS.autoSaveOnTransition.default)) {
      saveGame(getSession(), { playSound: false });
    }
  }

  // Remplace la partie EN COURS par une session importée (voir
  // view/menus/save-menu.js) : même mécanique que transitionThroughDoor
  // (détruit la scène, remplace la session, reconstruit la scène sur le
  // nouveau monde actif) — pour ne jamais laisser un Howl résiduel de
  // l'ancien monde ni une scène désynchronisée de la session. Le son +
  // l'annonce "Partie importée" restent à la charge de l'appelant (voir
  // save-menu.js), symétrique à saveGame qui gère les siens lui-même.
  function replaceCurrentGame(newSession) {
    scene.destroy();
    scene = null;
    setSession(newSession);
    scene = createCityAudioScene(getSession);
  }

  // Enregistrés une fois, pour la durée de vie de cet écran ville : mêmes
  // principe et portée que setDoorTransitionHandler (voir
  // view/interaction.js) — un module qui déclenche un effet possédé par
  // city-screen.js (scene/session) sans avoir besoin de les connaître.
  setDoorTransitionHandler(transitionThroughDoor);
  setGameReplaceHandler(replaceCurrentGame);

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
      announce(t(getActiveWorld(getSession()).titleKey), { assertive: true });
    },
    onTick() {
      // scene momentanément null pendant une transition par porte (voir
      // transitionThroughDoor) : rien à mettre à jour, on saute ce tick.
      if (!scene) return;
      setSession(reduce(getSession(), tick(getMoveIntent())));
      scene.update();
    },
    // Espace/Entrée : touches discrètes (screens.js ne route que la touche
    // non répétée), pas de souci d'auto-interruption ici. N'agit que quand
    // la ville est au sommet de la pile : le stack routing s'en charge par
    // construction (voir CLAUDE.md), aucune vérification à faire ici.
    onKeyDown(event) {
      // Même garde qu'onTick : aucune interaction possible pendant la brève
      // fenêtre où scene est null (transition par porte en cours).
      if (!scene) return;

      if (event.key === "Escape") {
        event.preventDefault();
        openPauseMenu(scene, getSession);
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
      setDoorTransitionHandler(null);
      setGameReplaceHandler(null);
      // Invariant documenté (CLAUDE.md) : session est null hors partie.
      // Seul chemin de sortie de la ville aujourd'hui (menu pause -> retour
      // au menu principal, voir view/menus/pause-menu.js).
      setSession(null);
    },
  };
}
