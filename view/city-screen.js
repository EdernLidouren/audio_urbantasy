// ÉCRAN "VILLE" : l'écran de jeu, sur la pile d'écrans (voir lib/screens.js).
// Il ne détient aucune donnée de partie en propre — il lit et écrit la
// session par les accesseurs fournis par main.js — et compose :
//   - view/world-travel.js       : la vue du monde actif et les voyages ;
//   - view/action-handlers.js    : les effets d'état des actions ;
//   - view/game-clock.js         : l'horloge de partie ;
//   - view/perception-toggle.js  : la perception surnaturelle ;
//   - view/emotes.js             : les émotes du joueur ;
//   - view/debug-effects.js      : les outils de debug ;
//   - view/status-announcements.js : les annonces d'état à la demande.
// Seul le sommet de la pile reçoit tick, frame et clavier : un menu ouvert
// par-dessus fige le jeu et le temps, par construction.

import { getMoveIntent, CITY_BINDINGS } from "./input.js";
import { resolveAction } from "../lib/input.js";
import { ensureAudioUnlocked } from "../lib/audio.js";
import { stopPersistentAudioLayers } from "./world-view.js";
import { interact, chooseInteractionTarget } from "./interaction.js";
import { openPauseMenu } from "./menus/pause-menu.js";
import { withPausedBeacons } from "./paused-beacons.js";
import { saveGame } from "./save-storage.js";
import { openWeatherDebugMenu } from "./menus/debug-weather-menu.js";
import { openTimeDebugMenu } from "./menus/debug-time-menu.js";
import { openTeleportDebugMenu } from "./menus/debug-teleport-menu.js";
import { openDebugWarningsMenu, openDebugWarningsIfUnseen } from "./menus/debug-warnings-menu.js";
import { openCollectionsDebugMenu } from "./menus/debug-collections-menu.js";
import { openInventoryMenu, openEquipmentMenu, openImprovementsMenu, openCollectionsMenu } from "./menus/inventory-menu.js";
import { advanceTick } from "../core/advance.js";
import { addMoney } from "../core/money.js";
import { runRenderEffects } from "./effect-runner.js";
import { isDebugEnabled } from "../config/debug.js";
import { createWorldTravel } from "./world-travel.js";
import { registerActionHandlers } from "./action-handlers.js";
import { createGameClock } from "./game-clock.js";
import { createPerceptionToggle } from "./perception-toggle.js";
import { createEmotes } from "./emotes.js";
import { createDebugEffects } from "./debug-effects.js";
import { announceGameTime, announceSceneName, announceMoney, announceWeather, announcePlayerX } from "./status-announcements.js";

export function makeCityScreen(getSession, setSession) {
  const travel = createWorldTravel({ getSession, setSession });
  const clock = createGameClock({ getSession, setSession });
  const perception = createPerceptionToggle({ getSession, setSession });
  const emotes = createEmotes({ getSession, setSession, getWorldView: () => travel.current() });
  const debug = createDebugEffects({ getSession, setSession, clock });
  // Branchés pour la durée de vie de l'écran, débranchés à sa sortie.
  const unregisterActionHandlers = registerActionHandlers({ getSession, setSession, travel });

  // Interaction (Espace -> "describe", Entrée -> "activate") : les candidats
  // à portée pour ce verbe ; plusieurs -> menu de choix (la vue du monde sert
  // à mettre les balises en pause pendant ce menu).
  function interactWith(kind) {
    const worldView = travel.current();
    const target = chooseInteractionTarget(worldView.getInteractionCandidates(kind), kind, travel.current);
    if (!target) return;
    interact(target, kind, travel.current);
  }

  // Touches de l'écran (actions résolues par view/input.js/CITY_BINDINGS).
  // `debugOnly` : sans effet hors mode debug ; `preventDefault` : la touche a
  // aussi un comportement navigateur à neutraliser ; `available()` (facultatif) :
  // la touche n'a d'effet que si elle rend vrai — l'aide des touches ne la
  // montre qu'alors (voir helpSections).
  const KEY_ACTIONS = {
    pauseMenu: { preventDefault: true, run: () => openPauseMenu(travel.current, getSession, travel.travelViaCityMap) },
    // Même appel que l'entrée "Sauvegarder" du menu pause : même son de
    // confirmation (préférence saveSoundEnabled), aucun son si l'écriture
    // échoue. N'agit qu'en jeu : un menu ou une bascule de face au sommet
    // de la pile ne reçoit pas cette table, jamais de sauvegarde en pleine
    // transition.
    quickSave: { run: () => saveGame(getSession()) },
    announceSceneName: { preventDefault: true, run: () => announceSceneName(getSession()) },
    announceTime: { run: () => announceGameTime(getSession()) },
    announceMoney: { run: () => announceMoney(getSession()) },
    announceWeather: { run: () => announceWeather(getSession()) },
    announcePosition: { run: () => announcePlayerX(getSession()) },
    openInventory: { run: () => openInventoryMenu(travel.current, getSession) },
    openEquipment: { run: () => openEquipmentMenu(travel.current, getSession) },
    openImprovements: { run: () => openImprovementsMenu(travel.current, getSession) },
    openCollections: { run: () => openCollectionsMenu(travel.current, getSession) },
    togglePerception: { run: perception.toggle, available: perception.isAvailable },
    performEmote: { run: emotes.performShortcut, available: emotes.isAvailable },
    chooseEmote: { run: emotes.openMenu, available: emotes.isAvailable },
    interactDescribe: { preventDefault: true, run: () => interactWith("describe") },
    interactActivate: { preventDefault: true, run: () => interactWith("activate") },
    openWeatherDebugMenu: { debugOnly: true, run: () => openWeatherDebugMenu(debug.forceWeather, debug.triggerWeatherTransition) },
    openTimeDebugMenu: { debugOnly: true, run: () => openTimeDebugMenu(getSession, debug.advanceTime, debug.changeTimeScale) },
    openTeleportDebugMenu: {
      debugOnly: true,
      run: () =>
        openTeleportDebugMenu(getSession, travel.executeTeleport, {
          reloadSceneFromFile: travel.reloadSceneFromFile,
          forgetOtherScenes: debug.forgetOtherScenes,
        }),
    },
    switchSideDebug: { debugOnly: true, run: travel.debugSwitchSide },
    openWarningsDebugMenu: { debugOnly: true, run: openDebugWarningsMenu },
    openCollectionsDebugMenu: { debugOnly: true, run: () => openCollectionsDebugMenu(getSession, setSession) },
  };

  // Accès CONSOLE réservé aux tests en jeu (tools/test-kit.js), relayé par
  // main.js en MODE DEBUG seulement : les fonctions que les touches et les
  // menus de debug appellent déjà, sans menu à parcourir. Aucune logique
  // propre ici.
  const debugActions = {
    // Téléportation instantanée (pas de sas) ; promesse résolue à l'arrivée.
    teleport: (target, { x, side, reloadIfSame = false } = {}) =>
      travel.executeTeleport({ target, x, side, reloadIfSame, transition: "instant" }),
    switchSide: travel.debugSwitchSide,
    advanceTime: debug.advanceTime,
    forceWeather: debug.forceWeather,
    togglePerception: perception.toggle,
    performEmote: emotes.perform,
    reloadSceneFromFile: travel.reloadSceneFromFile,
    worldView: travel.current,
    // Argent à volonté (achats au magasin), sans annonce.
    giveMoney: (amount) => setSession(addMoney(getSession(), amount)),
  };

  return {
    debugActions,
    // Aide des touches (lib/help.js) : déplacement puis raccourcis du jeu,
    // ceux de debug seulement en mode debug (même garde que onKeyDown), une
    // touche à condition seulement quand elle a un effet (ex. la perception
    // surnaturelle, une fois débloquée).
    helpSections: () => [
      { id: "move" },
      {
        id: "city",
        include: (action) => {
          const binding = KEY_ACTIONS[action];
          if (binding?.debugOnly && !isDebugEnabled()) return false;
          return binding?.available ? binding.available() : true;
        },
      },
    ],
    // L'aide se lit balises coupées, comme tout menu ouvert sur la ville.
    wrapOverlay: (screen) => withPausedBeacons(screen, travel.current),
    onEnter() {
      // Un menu poussé par-dessus la ville rappelle onEnter en se retirant
      // (lib/screens.js/popScreen) : seule la toute première entrée monte la
      // vue du monde et annonce le nom de la scène.
      if (travel.current()) return;

      ensureAudioUnlocked();
      travel.mountInitial();
      document.getElementById("game").focus();
      announceSceneName(getSession());
      // En mode debug, le journal d'avertissements s'ouvre de lui-même s'il
      // contient du nouveau.
      openDebugWarningsIfUnseen();
    },
    // Pas de simulation sans vue du monde (hors partie : jamais en jeu, un
    // voyage gèle le jeu par un écran vide pendant son chargement).
    // Un tick complet (core/advance.js) : le core rend aussi les effets de
    // rendu des séquences arrivées à échéance, rejoués ici, avant la mise
    // à jour de la vue.
    onTick() {
      const worldView = travel.current();
      if (!worldView) return;
      const { session, fired } = advanceTick(getSession(), getMoveIntent());
      setSession(session);
      for (const { entity, effects } of fired) runRenderEffects(entity, effects);
      worldView.update();
    },
    // Horloge de partie : même garde que onTick.
    onFrame(deltaMs) {
      if (!travel.current()) return;
      clock.onFrame(deltaMs);
    },
    onKeyDown(event) {
      if (!travel.current()) return;
      const binding = KEY_ACTIONS[resolveAction(CITY_BINDINGS, event.key, event.mods)];
      if (!binding || (binding.debugOnly && !isDebugEnabled())) return;
      if (binding.preventDefault) event.preventDefault();
      binding.run();
    },
    // Sortie RÉELLE de la partie (retour au menu principal) : aucune scène
    // suivante ne reprendra musique ni ambiances, on les arrête ici.
    onExit() {
      travel.unmount();
      stopPersistentAudioLayers();
      unregisterActionHandlers();
      setSession(null);
    },
  };
}
