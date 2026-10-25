// Point d'entrée : câblage core <-> vue. Au chargement : focus la zone de
// jeu, branche le clavier, pousse le menu principal comme premier écran,
// démarre la boucle à pas fixe (qui tick uniquement l'écran actif au sommet
// de la pile), puis charge la scène en tâche de fond.

import { pushScreen, popScreen, activeScreen, tickActive, tickFrame } from "./lib/screens.js";
import { initInput, onGlobalPress } from "./lib/input.js";
import { ensureAudioUnlocked } from "./lib/audio.js";
import { applyVolumePreferences } from "./view/audio/city-scene.js";
import { applyLocalePreference } from "./view/locale.js";
import { MOVE_KEYS, GLOBAL_BINDINGS } from "./view/input.js";
import { createMainMenu } from "./view/menus/main-menu.js";
import { setGameStartHandler } from "./view/menus/save-menu.js";
import { makeMenuScreen, configureMenuPreferences, configureMenuSounds } from "./lib/menu.js";
import { playMenuSound } from "./view/menu-sounds.js";
import { makeCityScreen } from "./view/city-screen.js";
import { t } from "./data/i18n/index.js";
import { runChecks } from "./core/checks/index.js";
import { isDebugEnabled, setDebugEnabled } from "./config/debug.js";
import { startLoop } from "./lib/loop.js";
import { loadSceneById } from "./scenes/load.js";
import registry from "./entities/types/index.js";
import { createInitialState } from "./core/state.js";
import { parseNewGame } from "./core/new-game.js";
import { validateEntityRegistry } from "./core/entity-parse.js";
import { NEW_GAME } from "./config/new-game.js";
import { getPref, setPref } from "./config/preferences.js";
import { configureAssetManifest } from "./lib/assets.js";
import { checkAutoSaveTimer } from "./view/autosave-timer.js";
import { loadGame } from "./view/save-storage.js";
import { reportSaveRepairs } from "./view/debug-warnings.js";
import { announceNewDiscoveries } from "./view/collection-discoveries.js";

// Préférences de menu (sliders/toggles + cyclage/étoile/suffixe, voir
// lib/menu.js) injectées UNE FOIS ici, point de composition unique — tout
// écran-menu construit ensuite (makeMenuScreen(menu, t)) en hérite sans
// avoir à les repasser.
configureMenuPreferences({ getPref, setPref });
// Sons d'interaction des menus (wrap/block/select/cancel/toggle), même
// patron d'injection que les préférences ci-dessus — voir lib/menu.js et
// view/menu-sounds.js.
configureMenuSounds(playMenuSound);

// Registre des types d'entité et départ d'une partie neuve
// (config/new-game.js), validés UNE FOIS ici, au démarrage : une erreur
// arrête le jeu tout de suite, avec son message, plutôt qu'au premier
// "Nouvelle partie" ou à la première scène qui utilise le type fautif.
validateEntityRegistry(registry);
const newGame = parseNewGame(NEW_GAME, registry);

// Un import n'expose rien au scope global : on l'attache explicitement à
// window pour pouvoir appeler runChecks() depuis la console (voir
// core/checks/index.js : runChecks("spawn") pour un seul domaine). Un
// script type="module" s'exécute après le parsing du DOM (comme s'il avait
// "defer"), donc le DOM est déjà prêt ici.
window.runChecks = runChecks;
console.log("Vérifs dispo : tape runChecks()");

// Mode DEBUG (voir config/debug.js) : PAS de menu — bascule DEPUIS LA
// CONSOLE (window.toggleDebug, comme runChecks ci-dessus) OU par la
// combinaison Ctrl+D EN JEU (voir onGlobalPress plus bas, lib/input.js) —
// deux chemins, UNE seule fonction, jamais deux logiques à maintenir.
// Une fois activé, il ouvre aussi les touches de debug en ville (ex. "e",
// voir view/city-screen.js/KEY_ACTIONS et view/debug-effects.js).
function toggleDebug() {
  setDebugEnabled(!isDebugEnabled());
  console.log(`Mode debug : ${isDebugEnabled() ? "activé" : "désactivé"}`);
}
window.toggleDebug = toggleDebug;
console.log("Mode debug : tape toggleDebug() ou Ctrl+D en jeu");

const gameZone = document.getElementById("game");

// Volumes des préférences appliqués ICI, au point de composition unique,
// PAS à l'import de lib/audio.js (générique, ignore tout de
// config/preferences.js) ni d'un sous-menu (qui ne s'ouvre que sur
// demande) : Howler.volume() est un état global qui reste à son défaut
// (100%) tant que personne ne l'a appelé — sans cet appel, la partie
// démarrerait au volume PLEIN, à l'exact opposé de la sécurité
// d'accessibilité visée par le défaut BAS du volume principal (voir
// config/preferences.js/PREF_CONSTRAINTS.masterVolume).
applyVolumePreferences();

// Langue des préférences appliquée AVANT le premier écran : le menu
// principal s'annonce dans la langue choisie, et l'attribut lang de la page
// la suit (voir view/locale.js), pour que le lecteur d'écran prenne la
// bonne voix.
applyLocalePreference();

// lib/input.js ne connaît pas l'audio : c'est ici, au point de composition,
// qu'on branche le déverrouillage sur le tout premier appui touche.
// preventDefaultKeys (MOVE_KEYS, view/input.js) : supprime le défilement de
// page sur les touches de mouvement, à chaque appui (répétitions OS
// incluses) — lib/input.js reste l'UNIQUE écouteur DOM, cette liste lui est
// simplement fournie, jamais devinée. Le piège de focus Tab est neutralisé
// séparément, INCONDITIONNELLEMENT, DANS lib/input.js lui-même (voir
// ALWAYS_NEUTRALIZED_BINDINGS) — rien à fournir ici pour ça.
initInput(gameZone, { onFirstInput: ensureAudioUnlocked, preventDefaultKeys: MOVE_KEYS });

// Ctrl+D : bascule le mode debug SANS passer par la console (voir
// toggleDebug ci-dessus) — binding GLOBAL (lib/input.js/onGlobalPress),
// résolu INDÉPENDAMMENT de la pile d'écrans, pour rester disponible quel
// que soit l'écran actif (menu, pause, ville...), jamais routé par
// lib/screens.js. preventDefault déjà géré par lib/input.js pour tout
// binding global (Ctrl+D est intercepté par certains navigateurs — ex.
// ajout aux favoris — sans lui). Ctrl plutôt qu'Alt (voir view/input.js/
// GLOBAL_BINDINGS) : Alt seul déplace le focus vers la barre de menus sur
// certains navigateurs, gênant même une fois la combinaison interceptée.
onGlobalPress(GLOBAL_BINDINGS, (action) => {
  if (action === "toggleDebug") toggleDebug();
});

gameZone.focus();

// Scène chargée en tâche de fond ; startNewGame() la lit au moment de
// l'activation (cas limite improbable : scène pas encore chargée -> no-op).
// "Continuer" n'en a pas besoin : une partie sauvegardée embarque déjà l'état
// complet de ses mondes (voir view/save-storage.js/loadGame), aucun fetch
// requis.
let scene = null;

// Session de la partie en cours (sortie de createInitialState). null hors
// ville : la ville (view/city-screen.js) est une simple vue dessus, elle
// n'en détient pas de copie propre.
let session = null;

function getSession() {
  return session;
}
// Toute mise à jour de la partie passe ici : c'est donc ici que la vue
// compare l'avant et l'après pour annoncer les découvertes de collection
// (voir view/collection-discoveries.js).
function setSession(next) {
  announceNewDiscoveries(session, next);
  session = next;
}

// Session candidate d'une sauvegarde CHARGEABLE (pas juste présente : lue,
// désobscurcie, parsée ET validée avec succès — voir loadGame), recalculée à
// chaque (ré)affichage du menu principal (mainMenuScreen.onEnter ci-dessous).
// Sert à la fois à décider si "Continuer" apparaît ET à fournir la session
// à continueGame() sans recharger une seconde fois. Forme : { session,
// repairs } (voir view/save-storage.js/loadGame), ou null.
let loadableSave = null;

// "Nouvelle partie" (confirmée au préalable si un save existe, voir
// main-menu.js/activateNewGame) : construit une partie NEUVE sur la scène
// de départ. ÉCRASEMENT PARESSEUX voulu : n'efface PAS le save disque ici —
// la nouvelle partie ne remplacera l'ancien save qu'à sa PROCHAINE écriture
// (manuelle ou auto), jamais à cet instant. Quitter avant toute sauvegarde
// laisse donc l'ancien save intact.
function startNewGame() {
  if (!scene) return; // scène pas encore chargée : cas limite improbable
  session = createInitialState(scene, undefined, newGame.start);
  pushScreen(makeCityScreen(getSession, setSession));
}

// "Ville test" (entrée de tête du menu principal, voir main-menu.js) :
// démarre une partie NEUVE directement sur la scène "demo" (scène de test,
// distincte de la scène de départ chargée plus bas, avec le même départ
// d'objets et de compagnons, voir config/new-game.js) — MÊME
// risque d'écrasement qu'une "Nouvelle partie" normale, voir
// activateNewGame/main-menu.js, réutilisé TEL QUEL pour cette entrée.
// Contrairement à `scene` (préchargée en tâche de fond dès le boot, voir plus
// bas), "demo" n'est chargé qu'à la demande via loadSceneById (même chemin
// que la traversée d'une porte, voir view/world-travel.js/performTransition)
// — un raccourci de test n'a pas besoin d'être préchargé au démarrage.
function startTestCityGame() {
  loadSceneById("demo", registry)
    .then((testScene) => {
      session = createInitialState(testScene, undefined, newGame.start);
      pushScreen(makeCityScreen(getSession, setSession));
    })
    .catch((error) => {
      console.error(error.message);
    });
}

// "Continuer" : réutilise la session déjà chargée par mainMenuScreen.onEnter
// (jamais un second appel à loadGame() ici) — cette entrée n'apparaît de
// toute façon que quand loadableSave n'est pas null (voir createMainMenu).
function continueGame() {
  if (!loadableSave) return; // garde-fou, ne devrait pas arriver
  session = loadableSave.session;
  // La sauvegarde devient la partie : c'est ici, et pas à la lecture, que
  // ses réparations sont signalées (voir view/debug-warnings.js).
  reportSaveRepairs(loadableSave.repairs);
  pushScreen(makeCityScreen(getSession, setSession));
}

// Écran-menu du menu principal : construit UNE FOIS puis réutilisé pour
// toute la durée de vie de l'appli (revient au sommet de la pile par
// "reveal" quand on quitte une partie, voir pause-menu.js/main_menu) — mais
// ses ENTRÉES sont reconstruites à CHAQUE affichage (splice en place dans le
// même tableau, jamais un nouvel objet menu : lib/menu.js capture la
// référence `menu` une seule fois, entries/cursor restent mutables dessus).
// Pas composeHook (lib/screens.js) ici : l'ordre compte — le
// rafraîchissement doit avoir lieu AVANT l'annonce d'ouverture, alors que
// composeHook exécute toujours le hook de base (l'annonce) en premier.
const mainMenuDef = createMainMenu({ canContinue: false, continueGame, startNewGame, startTestCityGame, getSession });
const mainMenuScreen = makeMenuScreen(mainMenuDef, t);
const baseMainMenuOnEnter = mainMenuScreen.onEnter;
mainMenuScreen.onEnter = () => {
  loadableSave = loadGame();
  const fresh = createMainMenu({ canContinue: loadableSave !== null, continueGame, startNewGame, startTestCityGame, getSession });
  mainMenuDef.entries.splice(0, mainMenuDef.entries.length, ...fresh.entries);
  mainMenuDef.cursor = 0;
  baseMainMenuOnEnter();
};

// Partie IMPORTÉE hors partie, depuis Options > Sauvegarde du menu principal
// (voir view/menus/save-menu.js/applyImportedGame) : referme les menus ouverts
// par-dessus le menu principal, puis démarre la partie comme "Continuer" —
// la quitter ramène ainsi au menu principal, jamais au menu de sauvegarde.
function startImportedGame(importedSession) {
  while (activeScreen() && activeScreen() !== mainMenuScreen) popScreen();
  session = importedSession;
  pushScreen(makeCityScreen(getSession, setSession));
}
setGameStartHandler(startImportedGame);

// Vérif console : logge player.x pendant qu'on tient une touche de
// déplacement. Rendu audio/annonce non requis à ce stade.
window.debugPlayerX = () => {
  if (!session) {
    console.log("debugPlayerX: aucune session en cours (hors ville).");
    return;
  }
  console.log(session.player.x);
};

// Vérif console, MODE DEBUG seulement : rend une COPIE de la partie en
// cours (positions, présence, variables...), pour inspecter l'état pendant
// un test sans passer par une sauvegarde. Une copie, jamais la session
// elle-même : la modifier depuis la console ne touche pas au jeu. L'état
// est sérialisable par contrat, structuredClone suffit.
window.debugSession = () => {
  if (!isDebugEnabled()) {
    console.log("debugSession: mode debug désactivé (toggleDebug() ou Ctrl+D).");
    return undefined;
  }
  if (!session) {
    console.log("debugSession: aucune session en cours (hors ville).");
    return undefined;
  }
  return structuredClone(session);
};

// Le jeu démarre TOUJOURS sur le menu principal, jamais en partie : la
// session naît d'un choix ("Continuer"/"Nouvelle partie" ci-dessus), jamais
// d'office. Tant qu'aucun choix n'est fait, session reste null — onTick de
// la ville n'existe pas encore, aucun risque d'accéder à une session
// inexistante (voir aussi checkAutoSaveTimer/view/autosave-timer.js, déjà
// tolérant à session null).
pushScreen(mainMenuScreen);
// checkAutoSaveTimer composé À CÔTÉ de tickActive, pas dedans : il doit
// tourner en continu (temps réel), même quand un menu est au sommet de la
// pile et que tickActive() ne fait donc plus rien (voir
// view/autosave-timer.js).
// Second paramètre : le delta RÉEL de frame, routé au même écran actif que
// tickActive() (voir lib/screens.js/tickFrame) — porte l'horloge de partie
// (view/game-clock.js/onFrame), gelée pour la même raison que le
// déplacement quand un menu est au sommet (rien à faire ici pour ça, c'est
// le routage par pile qui s'en charge).
startLoop(
  () => {
    tickActive();
    checkAutoSaveTimer(getSession);
  },
  (deltaMs) => tickFrame(deltaMs)
);

loadSceneById(newGame.startSceneId, registry)
  .then((loadedScene) => {
    scene = loadedScene;
  })
  .catch((error) => {
    console.error(error.message);
  });

// Manifeste des pools d'assets audio (voir tools/build_audio_manifest.py),
// chargé UNE FOIS ici et injecté dans lib/assets.js — resolveAsset() ne
// relit jamais le disque. Échec (réseau, JSON invalide, fichier absent) :
// signalé clairement, jamais silencieux — mais ne bloque pas le reste du
// jeu, exactement comme le chargement de la scène ci-dessus.
// "no-cache" : revalidé à chaque démarrage, comme les scènes (voir
// scenes/load.js) — un manifeste régénéré après l'ajout de sons ne doit pas
// être servi dans une version gardée en cache.
fetch("assets/manifest.json", { cache: "no-cache" })
  .then((response) => {
    if (!response.ok) {
      throw new Error(`réponse HTTP ${response.status}`);
    }
    return response.json();
  })
  .then((manifest) => {
    configureAssetManifest(manifest);
  })
  .catch((error) => {
    console.error(`Impossible de charger assets/manifest.json : ${error.message}`);
  });
