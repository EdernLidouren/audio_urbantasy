// Point d'entrée : câblage core <-> vue. Au chargement : focus la zone de
// jeu, branche le clavier, pousse le menu principal comme premier écran,
// démarre la boucle à pas fixe (qui tick uniquement l'écran actif au sommet
// de la pile), puis charge le niveau en tâche de fond.

import { pushScreen, tickActive } from "./lib/screens.js";
import { initInput } from "./lib/input.js";
import { ensureAudioUnlocked } from "./lib/audio.js";
import { preventMovementKeyScrolling } from "./view/input.js";
import { createMainMenu } from "./view/menus/main-menu.js";
import { makeMenuScreen, configureMenuPreferences } from "./lib/menu.js";
import { makeCityScreen } from "./view/city-screen.js";
import { t } from "./i18n/index.js";
import { runMovementChecks } from "./core/movement.check.js";
import { startLoop } from "./lib/loop.js";
import { loadLevel } from "./level/load.js";
import registry from "./entities/types.js";
import { createInitialState } from "./core/state.js";
import { getPref, setPref } from "./config/preferences.js";
import { configureAssetManifest } from "./lib/assets.js";

// Préférences de menu (sliders/toggles + cyclage/étoile/suffixe, voir
// lib/menu.js) injectées UNE FOIS ici, point de composition unique — tout
// écran-menu construit ensuite (makeMenuScreen(menu, t)) en hérite sans
// avoir à les repasser.
configureMenuPreferences({ getPref, setPref });

// Un import n'expose rien au scope global : on l'attache explicitement à
// window pour pouvoir appeler runMovementChecks() depuis la console. Un
// script type="module" s'exécute après le parsing du DOM (comme s'il avait
// "defer"), donc le DOM est déjà prêt ici.
window.runMovementChecks = runMovementChecks;
console.log("Vérifs dispo : tape runMovementChecks()");

const gameZone = document.getElementById("game");

// lib/input.js ne connaît pas l'audio : c'est ici, au point de composition,
// qu'on branche le déverrouillage sur le tout premier appui touche.
initInput(gameZone, { onFirstInput: ensureAudioUnlocked });
preventMovementKeyScrolling(gameZone);
gameZone.focus();

// Niveau chargé en tâche de fond ; enterCity() le lit au moment de
// l'activation (cas limite improbable : niveau pas encore chargé -> no-op).
let level = null;

// Session de la partie en cours (sortie de createInitialState). null hors
// ville : la ville (view/city-screen.js) est une simple vue dessus, elle
// n'en détient pas de copie propre.
let session = null;

function getSession() {
  return session;
}
function setSession(next) {
  session = next;
}

function enterCity() {
  if (!level) return;
  session = createInitialState(level);
  pushScreen(makeCityScreen(getSession, setSession));
}

// Vérif console : logge player.x pendant qu'on tient une touche de
// déplacement. Rendu audio/annonce non requis à ce stade.
window.debugPlayerX = () => {
  if (!session) {
    console.log("debugPlayerX: aucune session en cours (hors ville).");
    return;
  }
  console.log(session.player.x);
};

pushScreen(makeMenuScreen(createMainMenu(enterCity, getSession), t));
startLoop(tickActive);

loadLevel("./level/demo.json", registry)
  .then((loadedLevel) => {
    level = loadedLevel;
  })
  .catch((error) => {
    console.error(error.message);
  });

// Manifeste des pools d'assets audio (voir tools/build_audio_manifest.py),
// chargé UNE FOIS ici et injecté dans lib/assets.js — resolveAsset() ne
// relit jamais le disque. Échec (réseau, JSON invalide, fichier absent) :
// signalé clairement, jamais silencieux — mais ne bloque pas le reste du
// jeu, exactement comme le chargement du niveau ci-dessus.
fetch("assets/manifest.json")
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
