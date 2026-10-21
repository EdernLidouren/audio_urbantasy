// TRACE AUDIO de référence — outil de développement, jamais chargé par le
// jeu. Rejoue un scénario FIXE contre la vraie scène audio de la ville
// (view/audio/city-scene.js et les modules qu'elle compose) et enregistre
// chaque appel audio de bas niveau
// (Howl créé, joué, arrêté, volume, pan, vitesse, fondu ; paramètres Web
// Audio : gain, fréquence de coupure ; branchements entre nœuds) ainsi que
// les annonces. Deux traces identiques = le rendu audio n'a pas bougé :
// c'est le filet de sécurité de tout remaniement de la vue audio, l'équivalent
// de runChecks() pour le core.
//
// Utilisation, depuis la console du jeu (serveur de dev lancé) :
//   1. RECHARGER la page, sans lancer de partie (l'état interne de
//      lib/audio/ doit être vierge) ;
//   2. const t = await import("/tools/audio-trace.js");
//      await t.saveAudioTraceBaseline();   // AVANT le remaniement
//   3. après le remaniement : recharger la page, puis
//      const t = await import("/tools/audio-trace.js");
//      await t.compareAudioTraceToBaseline();
// La référence vit dans le localStorage du navigateur
// (clé AUDIO_TRACE_BASELINE_KEY).
//
// Déterminisme : pendant la trace, le hasard (Math.random, tiré d'une graine
// fixe), l'horloge (performance.now, AudioContext.currentTime) et les
// minuteries (setTimeout/setInterval) sont REMPLACÉS par des versions
// pilotées par le scénario ; Howl est remplacé par un faux qui n'émet aucun
// son et répond comme un vrai (identifiants, évènements "end"/"stop"/
// "fade"). Tout est restauré à la fin, même en cas d'erreur. Les nombres
// sont arrondis à 6 chiffres significatifs : un calcul réordonné (a*b*c au
// lieu de a*(b*c)) ne doit pas passer pour un changement de rendu.
//
// La trace prouve que les APPELS sont identiques ; elle ne remplace pas
// l'écoute.

import registry from "../entities/types/index.js";
import { loadSceneById } from "../scenes/load.js";
import { createInitialState, togglePerception, switchSide, getActiveWorld } from "../core/state.js";
import { reduce } from "../core/reduce.js";
import { tick } from "../core/actions.js";
import { advanceTime } from "../core/time.js";
import { setWeather } from "../core/weather.js";
import { refillDueSpawns, searchContainer } from "../core/spawn.js";
import { pickupItemEntity } from "../core/bag.js";
import { TICK_MS } from "../lib/loop.js";
import { refreshActiveBeaconVolumes } from "../view/audio/city-scene.js";
import { createWorldView, stopPersistentAudioLayers } from "../view/world-view.js";

export const AUDIO_TRACE_BASELINE_KEY = "templeton:audioTraceBaseline";

// Durée simulée d'un son ponctuel (son "end" émis au bout de ce délai).
const FAKE_SOUND_DURATION_MS = 900;

// --- Mise en forme -------------------------------------------------------

function num(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
  return String(Number(value.toPrecision(6)));
}

function describe(value) {
  if (typeof value === "number") return num(value);
  if (typeof value === "function") return "fn";
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return `[${value.map(describe).join(",")}]`;
  if (typeof value === "object") {
    if (value.__traceName) return value.__traceName;
    return `{${Object.keys(value).sort().map((key) => `${key}:${describe(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashLines(lines) {
  let h = 2166136261;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      h ^= line.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 10;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

// --- Environnement déterministe -----------------------------------------

// PRNG à graine (mulberry32) : remplace Math.random le temps de la trace.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Installe les remplacements et rend { log, lines, advance, restore }.
function installEnvironment(seed) {
  const lines = [];
  const log = (line) => lines.push(line);
  const restorers = [];
  const replace = (target, key, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, writable: true, value });
    restorers.push(() => {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else delete target[key];
    });
  };

  // Horloge et minuteries pilotées.
  let now = 0;
  let timerSeq = 0;
  const timers = new Map(); // id -> { at, fn, args, every }
  replace(Math, "random", seededRandom(seed));
  replace(performance, "now", () => now);
  const fakeSetTimeout = (fn, delay = 0, ...args) => {
    const id = ++timerSeq;
    timers.set(id, { at: now + Math.max(0, Number(delay) || 0), fn, args, every: null });
    return id;
  };
  const fakeSetInterval = (fn, delay = 0, ...args) => {
    const id = ++timerSeq;
    const every = Math.max(1, Number(delay) || 0);
    timers.set(id, { at: now + every, fn, args, every });
    return id;
  };
  const fakeClear = (id) => timers.delete(id);
  replace(window, "setTimeout", fakeSetTimeout);
  replace(window, "setInterval", fakeSetInterval);
  replace(window, "clearTimeout", fakeClear);
  replace(window, "clearInterval", fakeClear);

  // Avance l'horloge de `ms`, en déclenchant les minuteries échues dans
  // l'ordre (échéance, puis ordre de création).
  function advance(ms) {
    const target = now + ms;
    for (;;) {
      let nextId = null;
      let next = null;
      for (const [id, timer] of timers) {
        if (timer.at <= target && (!next || timer.at < next.at || (timer.at === next.at && id < nextId))) {
          next = timer;
          nextId = id;
        }
      }
      if (!next) break;
      now = next.at;
      if (next.every) next.at += next.every;
      else timers.delete(nextId);
      next.fn(...next.args);
    }
    now = target;
  }

  // Web Audio : le vrai contexte de Howler, avec une horloge pilotée et des
  // nœuds/paramètres nommés pour la trace.
  const ctx = Howler.ctx;
  // Getter posé sur l'INSTANCE : il masque le getter natif du prototype,
  // et `delete` (voir restore) le fait réapparaître.
  Object.defineProperty(ctx, "currentTime", { configurable: true, get: () => now / 1000 });
  const nodeSeq = {};
  const nameNode = (node, kind) => {
    nodeSeq[kind] = (nodeSeq[kind] ?? 0) + 1;
    node.__traceName = `${kind}#${nodeSeq[kind]}`;
    for (const param of ["gain", "frequency", "Q", "detune"]) {
      if (node[param] instanceof AudioParam) node[param].__traceName = `${node.__traceName}.${param}`;
    }
    return node;
  };
  Howler.masterGain.__traceName = "master";
  Howler.masterGain.gain.__traceName = "master.gain";
  ctx.destination.__traceName = "destination";
  const contextProto = Object.getPrototypeOf(Object.getPrototypeOf(ctx)); // BaseAudioContext
  const originalCreateGain = contextProto.createGain;
  for (const [method, kind] of [["createGain", "gain"], ["createBiquadFilter", "biquad"], ["createConvolver", "convolver"]]) {
    const original = contextProto[method];
    replace(contextProto, method, function (...args) {
      const node = nameNode(original.apply(this, args), kind);
      log(`create ${node.__traceName}`);
      return node;
    });
  }
  for (const method of ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime", "setTargetAtTime", "cancelScheduledValues", "cancelAndHoldAtTime"]) {
    const original = AudioParam.prototype[method];
    replace(AudioParam.prototype, method, function (...args) {
      log(`${this.__traceName ?? "param?"}.${method}(${args.map(describe).join(",")})`);
      return original.apply(this, args);
    });
  }
  const valueDescriptor = Object.getOwnPropertyDescriptor(AudioParam.prototype, "value");
  Object.defineProperty(AudioParam.prototype, "value", {
    configurable: true,
    get() {
      return valueDescriptor.get.call(this);
    },
    set(v) {
      log(`${this.__traceName ?? "param?"}.value=${describe(v)}`);
      valueDescriptor.set.call(this, v);
    },
  });
  restorers.push(() => Object.defineProperty(AudioParam.prototype, "value", valueDescriptor));
  const filterTypeDescriptor = Object.getOwnPropertyDescriptor(BiquadFilterNode.prototype, "type");
  Object.defineProperty(BiquadFilterNode.prototype, "type", {
    configurable: true,
    get() {
      return filterTypeDescriptor.get.call(this);
    },
    set(v) {
      log(`${this.__traceName ?? "biquad?"}.type=${v}`);
      filterTypeDescriptor.set.call(this, v);
    },
  });
  restorers.push(() => Object.defineProperty(BiquadFilterNode.prototype, "type", filterTypeDescriptor));
  for (const method of ["connect", "disconnect"]) {
    const original = AudioNode.prototype[method];
    replace(AudioNode.prototype, method, function (...args) {
      log(`${this.__traceName ?? "node?"}.${method}(${args.map(describe).join(",")})`);
      return original.apply(this, args);
    });
  }

  // Faux Howl : aucun son, mais la même surface que celle utilisée par
  // lib/audio/ (identifiants de son, évènements, instances). Comme Howler :
  // une instance par lecture, chacune avec son nœud (`_node`) ; une
  // instance terminée est réutilisée par la lecture suivante, sinon une
  // nouvelle est créée.
  let howlSeq = 0;
  class FakeHowl {
    constructor(options) {
      howlSeq += 1;
      this.__traceName = `howl#${howlSeq}`;
      this._src = options.src[0];
      this._loop = Boolean(options.loop);
      this._volume = options.volume ?? 1;
      this._rate = options.rate ?? 1;
      this._stereo = 0;
      this._playing = new Set();
      this._soundSeq = 0;
      this._listeners = [];
      this._sounds = [];
      this._newSound();
      const { src, ...rest } = options;
      log(`new ${this.__traceName} ${this._src} ${describe(rest)}`);
    }
    _newSound() {
      const node = originalCreateGain.call(ctx);
      const suffix = this._sounds.length === 0 ? "" : String(this._sounds.length + 1);
      node.__traceName = `${this.__traceName}.node${suffix}`;
      node.gain.__traceName = `${this.__traceName}.node${suffix}.gain`;
      const sound = { _id: null, _node: node, _ended: true, _panner: null };
      this._sounds.push(sound);
      return sound;
    }
    _soundById(id) {
      return this._sounds.find((sound) => sound._id === id) ?? null;
    }
    _emit(event, id) {
      const listeners = this._listeners.filter((l) => l.event === event && (l.id === undefined || l.id === id));
      this._listeners = this._listeners.filter((l) => !(l.once && listeners.includes(l)));
      for (const l of listeners) l.fn(id);
    }
    play(id) {
      let soundId = id;
      if (soundId === undefined || typeof soundId !== "number") {
        this._soundSeq += 1;
        soundId = this._soundSeq;
        const sound = this._sounds.find((s) => s._ended) ?? this._newSound();
        sound._id = soundId;
        sound._ended = false;
      }
      this._playing.add(soundId);
      log(`${this.__traceName}.play(${id ?? ""}) -> ${soundId}`);
      if (!this._loop) {
        setTimeout(() => {
          if (!this._playing.has(soundId)) return;
          this._playing.delete(soundId);
          this._markEnded(soundId);
          this._emit("end", soundId);
        }, FAKE_SOUND_DURATION_MS);
      }
      return soundId;
    }
    stop(id) {
      log(`${this.__traceName}.stop(${id ?? ""})`);
      const ids = id === undefined ? [...this._playing] : [id];
      for (const soundId of ids) {
        this._playing.delete(soundId);
        this._markEnded(soundId);
        this._emit("stop", soundId);
      }
      return this;
    }
    _markEnded(soundId) {
      const sound = this._soundById(soundId);
      if (sound) sound._ended = true;
    }
    pause(id) {
      log(`${this.__traceName}.pause(${id ?? ""})`);
      if (id === undefined) this._playing.clear();
      else this._playing.delete(id);
      return this;
    }
    playing(id) {
      return id === undefined ? this._playing.size > 0 : this._playing.has(id);
    }
    _accessor(name, field, args) {
      if (args.length === 0) return this[field];
      if (args.length === 1 && typeof args[0] !== "number") return this[field];
      log(`${this.__traceName}.${name}(${args.map(describe).join(",")})`);
      if (args.length === 1 || args[1] === undefined) this[field] = args[0];
      return this;
    }
    volume(...args) {
      return this._accessor("volume", "_volume", args);
    }
    rate(...args) {
      return this._accessor("rate", "_rate", args);
    }
    stereo(...args) {
      if (typeof args[1] === "number") {
        const sound = this._soundById(args[1]);
        if (sound) sound._panner = sound._panner ?? {};
      }
      return this._accessor("stereo", "_stereo", args);
    }
    loop(...args) {
      return this._accessor("loop", "_loop", args);
    }
    fade(from, to, duration, id) {
      log(`${this.__traceName}.fade(${describe(from)},${describe(to)},${describe(duration)},${id ?? ""})`);
      setTimeout(() => this._emit("fade", id), duration);
      return this;
    }
    once(event, fn, id) {
      this._listeners.push({ event, fn, id, once: true });
      return this;
    }
    on(event, fn, id) {
      this._listeners.push({ event, fn, id, once: false });
      return this;
    }
    off(event, fn, id) {
      this._listeners = this._listeners.filter((l) => !(l.event === event && (!fn || l.fn === fn) && (id === undefined || l.id === id)));
      return this;
    }
    seek() {
      return 0;
    }
    duration() {
      return FAKE_SOUND_DURATION_MS / 1000;
    }
    state() {
      return "loaded";
    }
    unload() {
      log(`${this.__traceName}.unload()`);
      this._playing.clear();
      return null;
    }
  }
  replace(window, "Howl", FakeHowl);

  // Annonces : relevé des deux live regions après chaque étape.
  const regions = ["announce-polite", "announce-assertive"].map((id) => document.getElementById(id));
  const lastAnnouncement = regions.map((region) => region?.textContent ?? "");
  function snapshotAnnouncements() {
    regions.forEach((region, i) => {
      const text = region?.textContent ?? "";
      if (text !== lastAnnouncement[i]) {
        lastAnnouncement[i] = text;
        if (text) log(`announce ${region.id}: ${text}`);
      }
    });
  }

  function restore() {
    for (const undo of restorers.reverse()) undo();
    delete ctx.currentTime; // retire le getter piloté : retour au getter natif
  }

  return { log, lines, advance, restore, snapshotAnnouncements };
}

// --- Scénario ------------------------------------------------------------

// Rejoue le scénario fixe et rend { hash, count, lines }. Les scènes sont
// chargées AVANT la mise en place de l'environnement piloté (fetch réel).
export async function runAudioTrace({ seed = 20261021 } = {}) {
  if (typeof Howler === "undefined" || !Howler.ctx || !Howler.masterGain) {
    throw new Error("audio-trace : Howler.ctx absent — appuyer une fois sur une touche dans le jeu (déverrouillage audio), puis relancer.");
  }
  const demo = await loadSceneById("demo", registry);
  const tower = await loadSceneById("clock_tower_main", registry);
  const env = installEnvironment(seed);
  const { log, advance, snapshotAnnouncements } = env;

  let session = null;
  const getSession = () => session;
  let scene = null;

  // Un pas de simulation : réducteur, horloge, rendu, relevé des annonces.
  const steps = (count, direction) => {
    for (let i = 0; i < count; i++) {
      session = reduce(session, tick(direction));
      advance(TICK_MS);
      scene.update();
      snapshotAnnouncements();
    }
  };
  const mark = (label) => log(`--- ${label} (x=${num(session.player.x)})`);
  const logCandidates = () => {
    for (const kind of ["describe", "activate"]) {
      log(`candidates ${kind}: ${scene.getInteractionCandidates(kind).map((e) => e.id).join(",")}`);
    }
  };

  try {
    // A) Scène simple, extérieure, peuplée (demo).
    session = refillDueSpawns(createInitialState(demo, 7), registry);
    mark("A montage demo");
    scene = createWorldView(getSession);
    snapshotAnnouncements();
    steps(90, 0);
    mark("A marche vers la droite");
    for (let i = 0; i < 12; i++) {
      steps(40, 1);
      logCandidates();
    }
    mark("A fouille du buisson + ramassage");
    session = searchContainer(session, "bush_1", registry).session;
    steps(30, 0);
    logCandidates();
    session = pickupItemEntity(session, "resistor_1", "resistor", 1);
    steps(20, 0);
    mark("A son ponctuel suivi");
    scene.playEntityOneShot("npc_resident", { path: "assets/sounds/effects/pouring_water" });
    steps(60, 0);
    mark("A pause / reprise des balises");
    scene.pauseBeacons();
    advance(500);
    scene.resumeBeacons();
    refreshActiveBeaconVolumes();
    scene.refreshBeaconVolumes();
    steps(10, 0);
    mark("A passage à la nuit");
    session = advanceTime(session, 14 * 60);
    steps(20, 0);
    mark("A pluie");
    session = setWeather(session, "rain");
    steps(20, 0);
    mark("A perception on");
    session = togglePerception(session);
    steps(120, -1);
    mark("A perception off");
    session = togglePerception(session);
    steps(120, -1);
    mark("A pas de trajet / d'arrivée");
    const door = getActiveWorld(session).entities.find((e) => e.id === "door_club");
    scene.playTransitionSteps(door, 1200);
    advance(1300);
    scene.playArrivalStep(door, 9);
    steps(30, -1);
    mark("A destruction");
    scene.destroy();
    advance(2000);

    // B) Scène à deux faces (clocher) : changement de face avec relais.
    session = createInitialState(tower, 3);
    mark("B montage clocher");
    scene = createWorldView(getSession);
    snapshotAnnouncements();
    steps(90, 0);
    steps(120, -1);
    logCandidates();
    mark("B croisement de face");
    const crossfade = scene.crossfadeFaceSwap(600);
    advance(620);
    await crossfade;
    session = switchSide(session, session.player.x);
    const handover = scene.destroy({ handover: true });
    log(`handover: ${[...handover.keys()].sort().join(",")}`);
    scene = createWorldView(getSession, { handover });
    snapshotAnnouncements();
    steps(90, 0);
    steps(120, 1);
    logCandidates();
    mark("B destruction");
    scene.destroy();
    stopPersistentAudioLayers();
    advance(3000);
    snapshotAnnouncements();
  } finally {
    env.restore();
  }

  return { hash: hashLines(env.lines), count: env.lines.length, lines: env.lines };
}

// Enregistre la trace courante comme RÉFÉRENCE (localStorage).
export async function saveAudioTraceBaseline(options) {
  const trace = await runAudioTrace(options);
  localStorage.setItem(AUDIO_TRACE_BASELINE_KEY, JSON.stringify({ hash: trace.hash, lines: trace.lines }));
  return { hash: trace.hash, count: trace.count };
}

// Compare la trace courante à la référence : { same, hash, baselineHash,
// count, firstDifference } — firstDifference donne l'index et quelques
// lignes de contexte des deux côtés.
export async function compareAudioTraceToBaseline(options) {
  const stored = localStorage.getItem(AUDIO_TRACE_BASELINE_KEY);
  if (!stored) throw new Error("audio-trace : aucune référence enregistrée (saveAudioTraceBaseline).");
  const baseline = JSON.parse(stored);
  const trace = await runAudioTrace(options);
  const result = { same: trace.hash === baseline.hash, hash: trace.hash, baselineHash: baseline.hash, count: trace.count, baselineCount: baseline.lines.length };
  if (!result.same) {
    const length = Math.max(trace.lines.length, baseline.lines.length);
    let i = 0;
    while (i < length && trace.lines[i] === baseline.lines[i]) i++;
    result.firstDifference = {
      index: i,
      baseline: baseline.lines.slice(Math.max(0, i - 3), i + 4),
      current: trace.lines.slice(Math.max(0, i - 3), i + 4),
    };
  }
  return result;
}
