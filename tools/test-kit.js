// KIT DE TEST EN JEU — outil de développement pour Claude, jamais chargé par
// le jeu. Prépare une situation (scène, face, heure, position) et observe ce
// qui se passe (sons, annonces, état) depuis la console du navigateur, sans
// parcourir les menus de debug à l'aveugle. Il ne REMPLACE pas un test de
// l'interface : quand c'est une touche ou un menu qu'on vérifie, on passe
// par eux (`press`).
//
// MODE D'EMPLOI (panneau navigateur, serveur de dev lancé) :
//   1. Modules modifiés depuis le dernier chargement : les relire, PUIS
//      recharger la page (sinon le navigateur garde l'ancienne version) :
//        const k = await import("/tools/test-kit.js");
//        await k.refresh(["/core/<fichier>.js", "/view/<fichier>.js"]); location.reload();
//   2. const k = await import("/tools/test-kit.js");
//      await k.start();                       // partie "Ville test", debug, espions
//      await k.goTo("main_street", { side: "verso", x: 35 });
//      k.setTime(23);                         // 23 h 00, jour courant ou suivant
//      k.giveMoney(500);                      // argent pour tester un achat
//      k.mark(); await k.emote("whistle"); await k.wait(1500);
//      k.sounds({ match: /neon|whistle/ });   // sons depuis mark(), dt en ms
//      k.entity("defective_neon_1_v");        // l'entité, avec sa face
//   3. TOUJOURS finir par : await k.cleanup();  // audio, espions, stockage
//      puis fermer l'onglet et arrêter le serveur (tabs_close, preview_stop).
//      Après cleanup(), la page n'a plus d'audio : la recharger avant tout
//      nouveau start().
//
// TEMPS — deux horloges, ne pas les confondre :
//   - le JEU avance par ticks (TICK_MS) : `advance(ms)` les joue d'un bloc,
//     sans attendre — séquences, comportements, horloge de partie ;
//   - l'horloge MURALE (performance.now) règle les vocaux et balises
//     intermittentes, les délais entre émotes et de la perception : `wait(ms)`
//     attend vraiment, en faisant tiquer le jeu si la boucle rAF ne tourne pas.
//     document.visibilityState ne dit PAS si elle tourne (le panneau peut se
//     dire "visible" sans aucune frame) : le kit écoute une pulsation rAF et
//     ne tique à la main que si aucune frame réelle n'est passée depuis
//     RAF_SILENCE_MS. Ne jamais ajouter son propre setInterval de ticks : il
//     doublerait la vraie boucle dès qu'elle reprend.
//
// SONS — `sounds()` relit les lectures de Howl (play, stop, fade), une
// entrée par lecture : Howler rappelle play() plusieurs fois pour un même
// son (chargement), ces rappels sur la même instance à moins de 50 ms sont
// fusionnés. `src` est le chemin court ("effects/neon_bulb_burst_3.mp3").
//
// ANNONCES — `announcements()` : une entrée par message réellement posé
// dans une région live (la même phrase reposée après un effacement compte
// à nouveau, c'est une relecture voulue de lib/announce.js).
//
// Accès au jeu : window.debugSession() (copie de la partie) et
// window.debugActions() (actions de debug de l'écran de ville, voir
// view/city-screen.js/debugActions), tous deux en mode debug seulement.

import { tickActive, tickFrame } from "../lib/screens.js";
import { TICK_MS } from "../lib/loop.js";
import { isDebugEnabled } from "../config/debug.js";
import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { TIME_CONFIG } from "../config/time-values.js";
import { WEATHER_STATES } from "../config/weather-values.js";

const STORAGE_KEYS = ["templeton-save", "templeton-preferences"];
// Sauvegarde du stockage du panneau AVANT les tests, en sessionStorage pour
// survivre à un rechargement de page en cours de test.
const BACKUP_KEY = "templeton:testKitBackup";
const MINUTES_PER_DAY = TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour;
// Rappels de play() par Howler sur une même instance : fusionnés en deçà.
const REPLAY_MERGE_MS = 50;
// Sans frame rAF depuis ce délai, la vraie boucle est considérée arrêtée.
const RAF_SILENCE_MS = 100;

const kit = {
  spies: null, // { originals, entries }
  observer: null,
  announcements: [],
  markAt: 0,
  // Index de mark() dans chaque journal : le filtre « depuis mark() » se
  // fait par position, l'horloge étant trop grossière pour départager deux
  // évènements du même instant.
  markSound: 0,
  markAnnouncement: 0,
  lastEmoteAt: -Infinity,
  lastPerceptionAt: -Infinity,
  lastFrameAt: -Infinity,
  heartbeat: false,
  cleanedUp: false,
};

// Pulsation rAF : date de la dernière frame réelle (voir wait).
function startHeartbeat() {
  if (kit.heartbeat) return;
  kit.heartbeat = true;
  const beat = () => {
    kit.lastFrameAt = performance.now();
    requestAnimationFrame(beat);
  };
  requestAnimationFrame(beat);
}

function realLoopRunning() {
  return performance.now() - kit.lastFrameAt < RAF_SILENCE_MS;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function game() {
  return document.getElementById("game");
}

function actions() {
  const result = window.debugActions && window.debugActions();
  if (!result) throw new Error("test-kit : pas de partie en cours, ou mode debug coupé (start()).");
  return result;
}

// --- Fichiers modifiés ------------------------------------------------------

// Relit chaque fichier en contournant le cache ; recharger la page ensuite.
// Rend la taille lue, pour repérer un fichier introuvable (0).
export async function refresh(paths) {
  const sizes = {};
  for (const path of paths) {
    const response = await fetch(path, { cache: "reload" });
    sizes[path] = response.ok ? (await response.text()).length : 0;
  }
  return sizes;
}

// --- Mise en place ----------------------------------------------------------

// Partie "Ville test" (scène demo) si aucune n'est en cours, mode debug
// actif, stockage sauvegardé, espions sons et annonces posés. Rend l'état
// de départ résumé.
export async function start() {
  if (kit.cleanedUp) throw new Error("test-kit : cleanup() a déchargé l'audio de cette page, la recharger avant un nouveau start().");
  // Juste après un rechargement, main.js peut ne pas avoir fini de se
  // charger : ses accès console n'existent pas encore.
  for (let i = 0; i < 100 && typeof window.toggleDebug !== "function"; i++) await sleep(50);
  if (typeof window.toggleDebug !== "function") throw new Error("test-kit : main.js n'est pas chargé.");
  if (!isDebugEnabled()) window.toggleDebug();
  startHeartbeat();
  backupStorage();
  installSoundSpy();
  installAnnouncementObserver();
  if (!window.debugSession()) {
    // Menu principal : "Ville test" est la première entrée, curseur remis
    // en tête à chaque affichage.
    press("Enter");
    for (let i = 0; i < 100 && !window.debugSession(); i++) await sleep(50);
    if (!window.debugSession()) throw new Error("test-kit : la partie n'a pas démarré (menu principal au sommet ?).");
    tick(5);
  }
  return where();
}

// Téléportation directe, sans sas ni menu. `side`/`x` facultatifs (défaut :
// recto et départ de la scène pour un autre monde, position courante pour
// le monde actif).
export async function goTo(sceneId, { side, x } = {}) {
  await actions().teleport(sceneId, { x, side });
  tick(2);
  const now = where();
  if (now.scene !== sceneId) throw new Error(`test-kit : arrivé dans "${now.scene}" au lieu de "${sceneId}".`);
  return now;
}

// Change de face sur place (Shift+X).
export function switchSide() {
  actions().switchSide();
  tick(2);
  return where();
}

// Règle l'horloge à `hour`:`minute`, en avançant (jamais en reculant) : le
// jour suivant si l'heure est déjà passée. Même chemin qu'un saut du menu
// debug (météo, triggers horaires).
export function setTime(hour, minute = 0) {
  const time = window.debugSession().time;
  const target = hour * TIME_CONFIG.minutesPerHour + minute;
  const delta = (target - (Math.floor(time) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (delta > 0) actions().advanceTime(delta);
  tick(2);
  return clock();
}

// Ajoute `amount` pièces à la partie (achats) ; rend le nouveau solde.
export function giveMoney(amount) {
  actions().giveMoney(amount);
  tick(1);
  return window.debugSession().money;
}

// Saute de `minutes` minutes de jeu.
export function advanceTime(minutes) {
  actions().advanceTime(minutes);
  tick(2);
  return clock();
}

// `state` : une clé de config/weather-values.js/WEATHER_STATES ("rain",
// pas "rainy").
export function setWeather(state) {
  if (!Object.hasOwn(WEATHER_STATES, state)) {
    throw new Error(`test-kit : météo "${state}" inconnue (${Object.keys(WEATHER_STATES).join(", ")}).`);
  }
  actions().forceWeather(state);
  tick(1);
  return window.debugSession().weather.state;
}

// Perception surnaturelle : `on` vrai ou faux. Attend le délai entre deux
// bascules (horloge murale) s'il le faut.
export async function perception(on) {
  if (window.debugSession().perceptionActive === on) return on;
  const remaining = kit.lastPerceptionAt + TUNING_DEFAULTS.perceptionCooldownMs - performance.now();
  if (remaining > 0) await wait(remaining + 20);
  actions().togglePerception();
  kit.lastPerceptionAt = performance.now();
  tick(1);
  return window.debugSession().perceptionActive;
}

// --- Pilotage ---------------------------------------------------------------

// Une touche (keydown + keyup) sur la zone de jeu, comme le clavier.
// `mods` : { shift, ctrl, alt }.
export function press(key, { shift = false, ctrl = false, alt = false } = {}) {
  const init = { key, bubbles: true, shiftKey: shift, ctrlKey: ctrl, altKey: alt };
  const target = game();
  target.focus();
  target.dispatchEvent(new KeyboardEvent("keydown", init));
  target.dispatchEvent(new KeyboardEvent("keyup", init));
}

// `n` ticks de jeu d'un bloc (simulation + horloge de partie).
export function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    tickActive();
    tickFrame(TICK_MS);
  }
}

// Avance le JEU de `ms` millisecondes, par ticks, en rendant la main de
// temps en temps (des milliers de ticks d'affilée saturent la file de
// chargement de Howler).
export async function advance(ms) {
  const ticks = Math.round(ms / TICK_MS);
  for (let i = 0; i < ticks; i++) {
    tick(1);
    if (i % 300 === 299) await sleep(30);
  }
}

// Attend `ms` millisecondes RÉELLES. Le jeu tique pendant l'attente : par
// la vraie boucle si elle tourne, sinon à la main (voir l'en-tête, TEMPS).
export async function wait(ms) {
  startHeartbeat();
  const timer = setInterval(() => {
    if (!realLoopRunning()) tick(1);
  }, TICK_MS);
  try {
    await sleep(ms);
  } finally {
    clearInterval(timer);
  }
}

// Marche jusqu'à `x` (flèche tenue, ticks synchrones). S'arrête si le
// joueur ne progresse plus (obstacle). Rend la position atteinte.
export async function walkTo(x, { maxTicks = 5000 } = {}) {
  const start = window.debugSession().player.x;
  if (Math.abs(start - x) < 0.05) return start;
  const key = x < start ? "ArrowLeft" : "ArrowRight";
  const target = game();
  target.focus();
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  let last = start;
  let stuck = 0;
  try {
    for (let i = 0; i < maxTicks; i++) {
      tick(1);
      const now = window.debugSession().player.x;
      if (key === "ArrowLeft" ? now <= x : now >= x) break;
      stuck = Math.abs(now - last) < 1e-6 ? stuck + 1 : 0;
      if (stuck > 60) break;
      last = now;
      if (i % 300 === 299) await sleep(20);
    }
  } finally {
    target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  }
  tick(2);
  return window.debugSession().player.x;
}

// Joue l'émote `id` (son, puis réactions du monde), sans passer par le
// raccourci. Attend le délai entre deux émotes s'il le faut.
export async function emote(id) {
  const remaining = kit.lastEmoteAt + TUNING_DEFAULTS.emoteCooldownMs - performance.now();
  if (remaining > 0) await wait(remaining + 20);
  actions().performEmote(id);
  kit.lastEmoteAt = performance.now();
}

// --- Observation ------------------------------------------------------------

// Résumé de la position du joueur.
export function where() {
  const session = window.debugSession();
  return { scene: session.activeWorldId, side: session.player.side, x: session.player.x, ...clock() };
}

// Heure de jeu lisible.
export function clock() {
  const time = window.debugSession().time;
  const inDay = Math.floor(time) % MINUTES_PER_DAY;
  return {
    day: Math.floor(time / MINUTES_PER_DAY) + 1,
    hour: Math.floor(inDay / TIME_CONFIG.minutesPerHour),
    minute: inDay % TIME_CONFIG.minutesPerHour,
  };
}

// Copie de la partie (window.debugSession).
export function state() {
  return window.debugSession();
}

// Une entité du monde actif (ses deux faces) ou un compagnon, par id, avec
// `face` ("recto", "verso", "single" ou "companion"). `null` si absente.
export function entity(id) {
  return entities((e) => e.id === id)[0] ?? null;
}

// Entités du monde actif et compagnons qui satisfont `filter`.
export function entities(filter = () => true) {
  const session = window.debugSession();
  const world = session.worlds[session.activeWorldId];
  const faces = world.recto ? [["recto", world.recto], ["verso", world.verso]] : [["single", world]];
  const found = [];
  for (const [face, holder] of faces) {
    for (const e of holder.entities) if (filter(e)) found.push({ ...e, face });
  }
  for (const c of session.companions) if (filter(c)) found.push({ ...c, face: "companion" });
  return found;
}

// Point zéro des mesures : sounds() et announcements() comptent depuis lui.
// Les annonces déjà posées mais pas encore vues par l'observateur
// (asynchrone) sont d'abord rangées AVANT le repère.
export function mark() {
  flushAnnouncements();
  kit.markAt = performance.now();
  kit.markSound = kit.spies ? kit.spies.entries.length : 0;
  kit.markAnnouncement = kit.announcements.length;
  return kit.markAt;
}

// Sons depuis mark() : [{ dt, kind: "play"|"stop"|"fade", src, args? }].
// `match` (RegExp) filtre sur src ; `kind` sur le type ; `all: true` depuis
// le début.
export function sounds({ match, kind, all = false } = {}) {
  if (!kit.spies) return [];
  return kit.spies.entries
    .slice(all ? 0 : kit.markSound)
    .filter((e) => (!match || match.test(e.src)) && (!kind || e.kind === kind))
    .map((e) => ({ dt: Math.round(e.t - kit.markAt), kind: e.kind, src: e.src, ...(e.args ? { args: e.args } : {}) }));
}

// Écarts (ms) entre lectures successives des sons qui satisfont `match`,
// depuis mark() : la cadence d'un vocal.
export function cadence(match) {
  const plays = sounds({ match, kind: "play" });
  return plays.slice(1).map((p, i) => p.dt - plays[i].dt);
}

// Annonces depuis mark() : [{ dt, region, text }]. `all: true` depuis le début.
export function announcements({ all = false } = {}) {
  flushAnnouncements();
  return kit.announcements
    .slice(all ? 0 : kit.markAnnouncement)
    .map((a) => ({ dt: Math.round(a.t - kit.markAt), region: a.region, text: a.text }));
}

// Dernière annonce, espaces insécables normalisés.
export function lastAnnouncement() {
  flushAnnouncements();
  const last = kit.announcements[kit.announcements.length - 1];
  return last ? last.text.replace(/[  ]/g, " ") : null;
}

// Voix Howler en cours de lecture (balises, sons ponctuels).
export function playingCount() {
  return Howler._howls.reduce((n, howl) => n + howl._sounds.filter((s) => !s._paused && !s._ended).length, 0);
}

// --- Nettoyage --------------------------------------------------------------

// Retire les espions, coupe et décharge tout l'audio, rend au stockage son
// état d'avant start(). Ne ferme ni l'onglet ni le serveur.
export async function cleanup() {
  kit.cleanedUp = true;
  uninstallSoundSpy();
  if (kit.observer) kit.observer.disconnect();
  kit.observer = null;
  if (typeof Howler !== "undefined") {
    Howler.stop();
    Howler.unload();
  }
  restoreStorage();
  return STORAGE_KEYS.map((key) => [key, localStorage.getItem(key) === null ? "absent" : "présent"]);
}

// --- Rouages ----------------------------------------------------------------

function backupStorage() {
  if (sessionStorage.getItem(BACKUP_KEY) !== null) return; // déjà pris (page rechargée)
  const backup = Object.fromEntries(STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]));
  sessionStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
}

function restoreStorage() {
  const raw = sessionStorage.getItem(BACKUP_KEY);
  const backup = raw ? JSON.parse(raw) : Object.fromEntries(STORAGE_KEYS.map((key) => [key, null]));
  for (const key of STORAGE_KEYS) {
    if (backup[key] === null) localStorage.removeItem(key);
    else localStorage.setItem(key, backup[key]);
  }
  sessionStorage.removeItem(BACKUP_KEY);
}

function shortSrc(howl) {
  const src = Array.isArray(howl._src) ? howl._src[0] : howl._src;
  return String(src).replace(/^.*sounds\//, "");
}

function installSoundSpy() {
  if (kit.spies || typeof Howl === "undefined") return;
  const originals = { play: Howl.prototype.play, stop: Howl.prototype.stop, fade: Howl.prototype.fade };
  const entries = [];
  const lastPlay = new WeakMap();
  Howl.prototype.play = function (...args) {
    const t = performance.now();
    const previous = lastPlay.get(this);
    if (previous === undefined || t - previous > REPLAY_MERGE_MS) entries.push({ t, kind: "play", src: shortSrc(this) });
    lastPlay.set(this, t);
    return originals.play.apply(this, args);
  };
  Howl.prototype.stop = function (...args) {
    entries.push({ t: performance.now(), kind: "stop", src: shortSrc(this) });
    return originals.stop.apply(this, args);
  };
  Howl.prototype.fade = function (...args) {
    entries.push({ t: performance.now(), kind: "fade", src: shortSrc(this), args: args.slice(0, 3) });
    return originals.fade.apply(this, args);
  };
  kit.spies = { originals, entries };
}

function uninstallSoundSpy() {
  if (!kit.spies) return;
  Object.assign(Howl.prototype, kit.spies.originals);
  kit.spies = null;
}

// Une entrée par message posé : une région n'est relue que si ELLE a changé,
// et la même phrase reposée après un effacement compte de nouveau.
const regionState = {};
function recordMutations(mutations) {
  const touched = new Set(mutations.map((m) => (m.target.nodeType === 1 ? m.target : m.target.parentElement).closest("[id^='announce-']")));
  for (const region of touched) {
    if (!region) continue;
    const text = region.textContent.trim();
    const previous = regionState[region.id] || { text: "", cleared: true };
    if (text === "") {
      regionState[region.id] = { text: previous.text, cleared: true };
      continue;
    }
    if (text !== previous.text || previous.cleared) {
      kit.announcements.push({ t: performance.now(), region: region.id.replace("announce-", ""), text });
    }
    regionState[region.id] = { text, cleared: false };
  }
}

// Range tout de suite les mutations que l'observateur n'a pas encore vues.
function flushAnnouncements() {
  if (kit.observer) recordMutations(kit.observer.takeRecords());
}

function installAnnouncementObserver() {
  if (kit.observer) return;
  kit.observer = new MutationObserver(recordMutations);
  for (const id of ["announce-polite", "announce-assertive"]) {
    kit.observer.observe(document.getElementById(id), { childList: true, subtree: true, characterData: true });
  }
}
