// VOYAGE et VUE DU MONDE ACTIF. Ce module est le SEUL propriétaire de la vue
// du monde (view/world-view.js : audio, occupation, annonces d'ambiance) :
// il la monte, la détruit et la remonte à chaque changement de monde, de
// face ou de partie. Tous les autres la lisent AU MOMENT de s'en servir, via
// current() — jamais une copie gardée, qui désignerait l'ancien monde après
// un voyage. current() vaut null hors partie, et pendant l'attente d'un
// teleport holdForSound (la vue d'arrivée n'est montée qu'à la fin du son
// de départ, voir performTransition) — jeu gelé dans les deux cas. Sinon,
// une scène à charger est lue AVANT de démonter quoi que ce soit, et le
// remontage est synchrone.

import { announce } from "../lib/announce.js";
import { rampEntityLayerGain } from "../lib/audio.js";
import { playInterfaceSound } from "./menu-sounds.js";
import { pushScreen, popScreen } from "../lib/screens.js";
import { t } from "../data/i18n/index.js";
import registry from "../entities/types/index.js";
import { loadSceneById } from "../scenes/load.js";
import { travelToWorld, switchSide, placePlayer, reloadActiveWorld, isTwoSided } from "../core/state.js";
import { prepareLoadedWorld } from "../core/world-load.js";
import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";
import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { resolveTuning } from "../config/tuning.js";
import { createWorldView, stopPersistentAudioLayers } from "./world-view.js";
import { clearInteractionCooldowns } from "./interaction.js";
import { announceSceneName } from "./status-announcements.js";
import { reportSceneLoadFailure, reportSceneReloadFailure } from "./debug-warnings.js";
import { muteNextDiscoveryCheck } from "./discoveries.js";
import { saveGame } from "./save-storage.js";

// Fondu de la couche entités pendant le sas d'une téléportation.
const DOOR_TRANSITION_FADE_OUT_MS = TUNING_DEFAULTS.doorTransitionFadeOutMs;
const DOOR_TRANSITION_FADE_IN_MS = TUNING_DEFAULTS.doorTransitionFadeInMs;
// Attente maximale du son de départ d'un teleport holdForSound.
const TELEPORT_HOLD_MAX_MS = TUNING_DEFAULTS.teleportHoldMaxMs;
// Durée du croisement de faces ; le nombre de pas de trajet en découle
// (voir view/audio/footsteps.js/TRANSITION_STEP_INTERVAL_MS).
const FACE_SWITCH_FADE_MS = TUNING_DEFAULTS.faceSwitchFadeMs;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Attend la fin d'un son de départ (`holdUntil`, voir runTeleportSas),
// jamais plus de TELEPORT_HOLD_MAX_MS : un son qui ne signalerait pas sa
// fin ne bloque pas le joueur.
function holdFor(holdUntil) {
  return Promise.race([holdUntil, wait(TELEPORT_HOLD_MAX_MS)]);
}

// Son d'un passage de face, s'il en déclare un (`transitionSound`, cascade
// instance -> archétype, absent par défaut : silence). Diégétique par
// défaut : positionné sur le passage, ANCRÉ (joué avant le croisement, il
// n'a pas à en suivre l'étouffement — on passe à travers la grille, on ne
// s'en éloigne pas), avec la réverb de la face quittée, dont la scène
// audio garde la queue après la bascule (voir view/audio/city-scene.js/
// destroy). `transitionSoundNature: "meta"` : non positionné, volume de
// l'interface, pour un passage qui n'est pas un objet du monde.
function playSideSwitchSound(worldView, entity) {
  const path = resolveTuning("transitionSound", entity);
  if (!path) return; // rien de déclaré : silence, pas une erreur
  if (resolveTuning("transitionSoundNature", entity) === "meta") {
    playInterfaceSound(path, "bascule de face");
    return;
  }
  worldView.playEntityOneShot(entity.id, { path, tracked: false });
}

export function createWorldTravel({ getSession, setSession }) {
  let worldView = null;

  // Pose l'état dans lequel la prochaine vue sera montée : la session, les
  // délais d'activation vidés (ils valent pour une entité d'UNE vue, voir
  // view/interaction.js/clearInteractionCooldowns), et, quand un monde
  // (re)devient celui du joueur (`loaded`), sa préparation par le core
  // (core/world-load.js/prepareLoadedWorld, TOUJOURS avant le montage : les
  // collectibles posés sont découverts au montage comme les autres
  // entités). Une bascule de face reste dans le même monde : pas de
  // préparation.
  function enterSession(nextSession, { loaded }) {
    setSession(loaded ? prepareLoadedWorld(nextSession, registry) : nextSession);
    clearInteractionCooldowns();
  }

  // Remplace la vue du monde par une neuve, montée sur `nextSession` (voir
  // enterSession). `keepBeacons` (bascule de face) : les balises continues
  // passent de l'ancienne vue à la nouvelle sans coupure, celles qu'elle ne
  // reprend pas sont arrêtées (voir view/audio/city-scene.js/destroy).
  function remount(nextSession, { loaded, keepBeacons = false }) {
    const handover = worldView.destroy({ handover: keepBeacons });
    worldView = null;
    enterSession(nextSession, { loaded });
    worldView = createWorldView(getSession, { handover });
    if (handover) for (const unused of handover.values()) unused.stop();
  }

  // Première entrée en ville.
  function mountInitial() {
    enterSession(getSession(), { loaded: true });
    worldView = createWorldView(getSession);
  }

  // Sortie de la ville : détruit la vue (musique et ambiances exceptées, voir
  // view/audio/layers.js/stopPersistentAudioLayers).
  function unmount() {
    worldView.destroy();
    worldView = null;
  }

  // Scène cible jamais visitée : lue depuis son fichier, jeu GELÉ pendant la
  // lecture par un écran vide (comme le sas, voir runTeleportSas). Rend
  // `null` pour un monde déjà visité (la partie le ressort tel quel), ou
  // `undefined` si la lecture échoue : rien n'a été démonté, le joueur reste
  // où il est, l'échec est annoncé et noté dans le journal.
  async function loadTargetScene(targetId) {
    if (getSession().worlds[targetId]) return null;
    pushScreen({});
    try {
      return await loadSceneById(targetId, registry);
    } catch (error) {
      reportSceneLoadFailure(targetId, error.message);
      announce(t("teleport.failed"), { assertive: true });
      return undefined;
    } finally {
      popScreen();
    }
  }

  // Changement de MONDE, franc : la cible est chargée si besoin (voir
  // loadTargetScene), PUIS la vue est détruite, le monde quitté est rangé
  // dans la partie (une nouvelle visite le ressort tel quel). Musique et
  // ambiances ne sont pas coupées : la nouvelle vue compare ce qu'elle veut
  // à ce qui joue et ne fond que ce qui change. x/side absents : playerStart
  // de la cible, recto. Puis, si la préférence est active, une sauvegarde
  // automatique SILENCIEUSE.
  // `holdUntil` (teleport holdForSound, voir runTeleportSas) : le monde
  // d'arrivée est rejoint aussitôt, mais sa VUE n'est montée qu'à la fin du
  // son de départ — musique, ambiances et balises de l'arrivée démarrent
  // alors seulement, et l'annonce du nom de la scène dit au joueur qu'il
  // peut de nouveau bouger. Un pas sur
  // le sol d'arrivée marque la sortie de la cabine. Musique et ambiances du
  // monde quitté, elles, fondent au silence dès que la cible est lue : le
  // son de transition se joue seul (le trajet, le changement brutal de
  // décor), et le montage de l'arrivée les redéclare toutes. Pas avant la
  // lecture : si elle échoue, le joueur reste où il est, avec sa musique.
  async function performTransition(targetId, x, side, { holdUntil } = {}) {
    const freshScene = await loadTargetScene(targetId);
    // Lecture échouée, ou partie quittée entre-temps (par sécurité : le jeu
    // était gelé).
    if (freshScene === undefined || !worldView) return;

    if (holdUntil) stopPersistentAudioLayers();
    // Pas de remount : l'attente du son de départ se glisse entre l'état
    // posé et la vue montée.
    worldView.destroy();
    worldView = null;
    enterSession(travelToWorld(getSession(), targetId, freshScene, { x, side }), { loaded: true });
    // Jamais d'`await` sans attente réelle : hors sas (carte de la ville),
    // rendre la main ici laisserait tiquer le jeu sans vue montée.
    if (holdUntil) await holdFor(holdUntil);
    worldView = createWorldView(getSession);
    announceSceneName(getSession());
    if (holdUntil) worldView.playLandingStep(getSession().player.x);

    if (getPref("autoSaveOnTransition", PREF_CONSTRAINTS.autoSaveOnTransition.default)) {
      saveGame(getSession(), { playSound: false });
    }
  }

  // Repositionne le joueur DANS le monde actuel. x/side absents : valeurs
  // COURANTES (jamais "recto" en dur, qui basculerait un joueur du verso).
  function placeInCurrentWorld(x, side) {
    const session = getSession();
    setSession(placePlayer(session, x !== undefined ? x : session.player.x, side !== undefined ? side : session.player.side));
  }

  // SAS de téléportation : un "fondu au noir sonore" qui masque le
  // déplacement (et un éventuel chargement) derrière un silence bref.
  // Musique et ambiances n'y sont pas touchées. Le jeu est GELÉ par un écran
  // vide poussé sur la pile (seul le sommet tique et reçoit le clavier),
  // retiré quoi qu'il arrive. Fondu sortant -> déplacement -> fondu entrant.
  // `holdUntil` (teleport `holdForSound`, voir view/effect-runner.js/
  // runEffects) : une promesse résolue à la fin du son de départ. Le sas
  // reste fermé jusque-là, déplacement fait : le joueur reprend la main
  // quand le son s'achève (une cabine d'ascenseur qui descend puis rouvre
  // ses portes), quelle que soit la durée du fichier. Vers un autre monde,
  // c'est performTransition qui attend, pour ne monter la scène d'arrivée
  // qu'à la fin, après avoir fait taire musique et ambiances (voir
  // là-bas).
  async function runTeleportSas(target, x, side, needsReload, holdUntil) {
    pushScreen({});
    try {
      rampEntityLayerGain(0, DOOR_TRANSITION_FADE_OUT_MS);
      await wait(DOOR_TRANSITION_FADE_OUT_MS);

      if (needsReload) {
        await performTransition(target, x, side, { holdUntil });
      } else {
        // Même monde : la vue relit déjà la position à chaque tick, rien à
        // reconstruire.
        placeInCurrentWorld(x, side);
        if (holdUntil) await holdFor(holdUntil);
      }

      rampEntityLayerGain(1, DOOR_TRANSITION_FADE_IN_MS);
      await wait(DOOR_TRANSITION_FADE_IN_MS);
    } finally {
      popScreen();
    }
  }

  // Effet "teleport" (voir core/effects.js, doc/scripting.md) : SEUL chemin de
  // téléportation du joueur (porte ou tout autre effet). Deux choix
  // indépendants, les quatre combinaisons sont valides :
  //   - recharger : toujours pour un autre monde, sur demande (reloadIfSame)
  //     pour le monde actif ;
  //   - transition "fade" (sas, défaut) ou "instant" (déplacement d'autorité).
  // `side` n'est pas résolue ici : son défaut dépend du chemin (recto pour un
  // rechargement, face courante pour un repositionnement). Rend une promesse
  // résolue à l'arrivée : les effets ne l'attendent pas, l'accès console
  // des tests si (view/city-screen.js/debugActions). `holdUntil` : voir
  // runTeleportSas (le chargement refuse holdForSound sans sas).
  function executeTeleport({ target, x, side, reloadIfSame = false, transition = "fade" }, { holdUntil } = {}) {
    const sameWorld = target === getSession().activeWorldId;
    const needsReload = !sameWorld || reloadIfSame;

    if (transition === "fade") return runTeleportSas(target, x, side, needsReload, holdUntil);
    if (needsReload) return performTransition(target, x, side);
    placeInCurrentWorld(x, side);
    return Promise.resolve();
  }

  // Carte de la ville (voir view/menus/city-map-menu.js) : même transition
  // franche qu'une porte, au point de téléportation de la case. Choisir sa
  // propre zone la recharge (recentrage volontaire), sans cas particulier.
  async function travelViaCityMap(sceneId, spawnX) {
    await performTransition(sceneId, spawnX);
  }

  // Bascule recto <-> verso par un passage (voir entities/types/passage.js) :
  // même gel qu'un sas, mais les deux faces restent audibles et CROISENT
  // leurs filtres (voir view/audio/face-crossfade.js). Son du passage, pas
  // de trajet en parallèle du croisement, bascule dans le core, vue
  // reconstruite sur la nouvelle face, pas d'arrivée. Même monde : ni
  // chargement ni annonce du nom de la scène.
  async function sideSwitch(arrivalX, entity) {
    pushScreen({});
    try {
      playSideSwitchSound(worldView, entity);
      worldView.playTransitionSteps(entity, FACE_SWITCH_FADE_MS);
      await worldView.crossfadeFaceSwap(FACE_SWITCH_FADE_MS);

      // Relais des balises en boucle : la vue reconstruite reprend celles dont
      // elle a besoin, déjà au bon niveau grâce au fondu, sans les relancer
      // (aucune micro-coupure). Les autres, que le fondu a amenées au
      // silence, sont arrêtées ensuite.
      remount(switchSide(getSession(), arrivalX), { loaded: false, keepBeacons: true });
      worldView.playArrivalStep(entity, arrivalX);
    } finally {
      popScreen();
    }
  }

  // DEBUG (Shift+X) : bascule de face SÈCHE — ni passage, ni son, ni
  // croisement des filtres : le joueur passe à la même position sur l'autre
  // face, même sans entité pour l'y accueillir. La vue est reconstruite
  // comme après un passage, sans relais des balises (elles redémarrent :
  // acceptable en debug). Scène à une seule face : annoncé, rien ne bouge.
  function debugSwitchSide() {
    const session = getSession();
    if (!isTwoSided(session.worlds[session.activeWorldId])) {
      announce(t("side.debug.singleSided"), { assertive: true });
      return;
    }
    remount(switchSide(session, session.player.x), { loaded: false });
    announce(t("side.debug.switched", { side: t(`side.${getSession().player.side}`) }), { assertive: true });
  }

  // Remplace la partie en cours par une partie importée (voir
  // view/menus/save-menu.js) : vue détruite puis remontée sur la nouvelle
  // partie. Rien n'est annoncé comme "nouvelle découverte". Le son et
  // l'annonce de l'import restent à l'appelant. L'import se fait sous le
  // menu de pause : la vue neuve naît balises en pause, comme celle qu'elle
  // remplace, et le menu les reprendra en se fermant (voir
  // view/paused-beacons.js).
  function replaceCurrentGame(newSession) {
    muteNextDiscoveryCheck();
    remount(newSession, { loaded: true });
    worldView.pauseBeacons();
  }

  // DEBUG (Shift+M) : relit la scène active depuis son fichier et remplace
  // son monde par un monde neuf. Le fichier est lu AVANT de rien démonter :
  // un fichier invalide laisse la scène intacte, l'erreur part dans le
  // journal des avertissements (Shift+L). Pas de sauvegarde automatique.
  // Jeu GELÉ pendant la lecture (comme loadTargetScene) : une porte
  // franchie entre-temps changerait de monde sous la relecture.
  async function reloadSceneFromFile() {
    const sceneId = getSession().activeWorldId;
    let freshScene;
    pushScreen({});
    try {
      freshScene = await loadSceneById(sceneId, registry);
    } catch (error) {
      reportSceneReloadFailure(sceneId, error.message);
      announce(t("teleport.debug.reloadFailed"), { assertive: true });
      return;
    } finally {
      popScreen();
    }
    // La partie a pu être quittée pendant la lecture, ou (par sécurité) le
    // monde actif a changé : rien n'est démonté.
    if (!worldView || getSession().activeWorldId !== sceneId) return;

    remount(reloadActiveWorld(getSession(), freshScene), { loaded: true });
    announce(t("teleport.debug.reloaded"), { assertive: true });
  }

  return {
    current: () => worldView,
    mountInitial,
    unmount,
    executeTeleport,
    travelViaCityMap,
    sideSwitch,
    debugSwitchSide,
    replaceCurrentGame,
    reloadSceneFromFile,
  };
}
