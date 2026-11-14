// Le BANC D'ESSAI de l'écran des billes (marbles/view/screen.js), sous Node : l'écran
// se joue au clavier comme dans le jeu, sur la vraie pile d'écrans (lib/screens.js),
// mais sans DOM, sans audio et sans temps réel. Ce qu'il change :
//   - le monde extérieur de l'écran (`io`, voir l'en-tête de screen.js) : ses
//     annonces sont RELEVÉES, ses textes passent par la traduction de test
//     (marbles/checks/helpers.js/keyText), ses sons sont relevés sans rien jouer, son
//     horloge est FACTICE (avancée par `advance`) et sa minuterie ne part jamais ;
//   - un faux `document`, pour les menus que l'écran ouvre (confirmation, aide…),
//     qui gardent leurs vrais modules : ses deux régions d'annonce relèvent ce qu'on
//     y écrit. Posé une fois pour toute la vérification, seulement s'il n'existe
//     aucun document : jamais dans le navigateur, où ce banc ne tourne pas (domaine
//     marbles-screen, `nodeOnly`, core/checks/index.js).
// Les sons d'interface des menus échouent sans Howler, proprement (avertissement
// masqué, view/menu-sounds.js).
//
//   const bench = openScreenBench(rules, state);   // l'écran ouvert sur `state`
//   bench.key("Enter"); bench.key("r", ["shift"]);
//   bench.advance(500);                            // 500 ms d'horloge, un battement
//   bench.said; bench.sounds; bench.game(); bench.top(); bench.close();

import { activeScreen, handleKeyDown, popScreen, pushScreen, tickFrame } from "../../../lib/screens.js";
import { SCREEN_SOUND_NAMES, makeMarblesScreen } from "../../view/screen.js";
import { keyText } from "../helpers.js";

// Les régions d'annonce du faux document : ce que les menus y écrivent, dans
// l'ordre, avec leur région.
const menuAnnouncements = [];

function fakeRegion(id) {
  let text = "";
  return {
    get textContent() {
      return text;
    },
    set textContent(value) {
      text = value;
      if (value !== "") menuAnnouncements.push({ region: id, text: value });
    },
  };
}

// Exportée : les bancs des écrans de sacs (domaine marbles-bag-editor) jouent aussi
// des menus.
export function installFakeDocument() {
  if (typeof document !== "undefined") return;
  const regions = { "announce-polite": fakeRegion("announce-polite"), "announce-assertive": fakeRegion("announce-assertive") };
  globalThis.document = { getElementById: (id) => regions[id] ?? null };
}

// Ce que les menus ont annoncé jusqu'ici, dans l'ordre (les textes).
export function menuAnnouncementTexts() {
  return menuAnnouncements.map((entry) => entry.text);
}

// Les sons de l'écran (marbles/view/screen.js/SCREEN_SOUND_NAMES), tous relevés :
// `name` et ses arguments, dans l'ordre des appels. Un son ajouté à l'écran l'est ici
// d'office, jamais joué pour de vrai sous Node.
const SOUND_NAMES = SCREEN_SOUND_NAMES;

// Ouvre l'écran des billes sur la partie `state` (une partie neuve, ou un état
// fabriqué : en phase de jeu, l'écran s'ouvre sans pioche), avec les règles `rules`.
// La pile d'écrans doit être vide : le banc la laisse vide en se fermant.
export function openScreenBench(rules, state) {
  installFakeDocument();
  if (activeScreen() !== undefined) throw new Error("banc d'essai : la pile d'écrans n'est pas vide");
  let game = state;
  let clock = 0;
  const timers = new Set();
  const said = [];
  const sounds = [];
  const io = {
    announce: (text) => said.push(text),
    // Une ligne de curseur : en butée, étoilée (lib/menu.js/announceMenuLine).
    announceMenuLine: (text, starred = false) => said.push(starred ? `* ${text}` : text),
    t: keyText,
    now: () => clock,
    setInterval: () => {
      const id = Symbol("minuterie");
      timers.add(id);
      return id;
    },
    clearInterval: (id) => timers.delete(id),
    sounds: Object.fromEntries(SOUND_NAMES.map((name) => [name, (...args) => sounds.push({ name, args })])),
  };
  const screen = makeMarblesScreen(
    () => game,
    (next) => (game = next),
    rules,
    { io }
  );
  const menuStart = menuAnnouncements.length;
  pushScreen(screen);
  // Le premier battement fixe l'origine du temps réel (lib/real-time.js) : le temps
  // ne compte qu'à partir de l'ouverture.
  tickFrame(0);

  return {
    screen,
    // Ce que l'écran a dit, dans l'ordre (ses propres annonces ; celles des menus :
    // menuSaid).
    said,
    sounds,
    game: () => game,
    // L'écran du sommet de la pile.
    top: () => activeScreen(),
    // Les minuteries en cours (celle du temps réel, tant que l'écran est ouvert).
    timerCount: () => timers.size,
    // Ce que les menus ont annoncé depuis l'ouverture du banc.
    menuSaid: () => menuAnnouncements.slice(menuStart).map((entry) => entry.text),
    // Une touche, au sommet de la pile, comme lib/input.js la transmet.
    key(key, mods = []) {
      handleKeyDown({ key, mods, preventDefault() {} });
    },
    // `ms` d'horloge, puis UN battement du temps réel (une image).
    advance(ms) {
      clock += ms;
      tickFrame(ms);
    },
    // Les noms des sons relevés depuis la position `from`, sans les avancées des
    // roulements (une par battement).
    soundNames(from = 0) {
      return sounds.slice(from).filter((sound) => sound.name !== "advanceRolls").map((sound) => sound.name);
    },
    // Ferme tout ce qui est ouvert, l'écran compris : la pile revient vide.
    close() {
      while (activeScreen() !== undefined) popScreen();
    },
  };
}
