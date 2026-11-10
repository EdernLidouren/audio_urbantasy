// Jeu des billes : l'ÉCRAN de jeu. Aucune règle ici : tout passe par le
// réducteur (core/marbles.js), et tout ce qui se dit par
// view/marbles/narration.js. La partie appartient à main.js (getGame/setGame,
// comme la session du jeu principal) ; ne restent ici que le curseur, la
// sélection et les étapes de résolution à dire, le temps d'un écran.
//
// PRENDRE ET POSER, un seul geste (Entrée) : sur une bille de la main, la
// sélectionne et ouvre la SÉLECTION D'EMPLACEMENT : le curseur passe sur le premier
// emplacement vide (dans l'ordre des phases, base gauche sinon) et ne quitte plus le
// triangle, la main n'existe plus pour lui. Entrée sur un emplacement ouvre la
// confirmation de la pose, qui dit ce qu'elle produirait (prévision,
// core/marbles-forecast.js) ; Échap annule et ramène sur la bille dans la main, où
// le curseur revient aussi après la pose.
// Sur un emplacement sans sélection, le prend pour l'échange ; sur un second
// emplacement ensuite, échange les deux. Refaire Entrée sur la sélection, ou
// Échap, l'annule.
//
// HISTORIQUE (L) : les messages de jeu du tour précédent, dans un menu
// (view/marbles/history.js, history-screen.js). Tout ce qui se dit par une étape y
// entre, au moment où l'étape est construite : une séquence passée y est entière.
//
// VUE D'ENSEMBLE (R) : la prévision du tour puis chaque emplacement, d'un bloc.
//
// RÉSOLUTION (Maj+R) : la simulation résout tout d'un coup ; ce qui suit n'est
// que la présentation, une file d'étapes (view/marbles/sequence.js) qui se dit
// avec une pause après chacune, avancée par le TEMPS RÉEL de l'écran (plus bas). Entrée la passe et amène au
// tour suivant (ou à la fin de partie), sans rien changer à l'état. Tant qu'elle
// dure, tout le reste est refusé d'un son de blocage, sans parole pour ne pas la
// couper : l'état est déjà celui d'après la résolution, et le dévoilerait.
//
// SONS (view/marbles/sounds.js) : la musique de l'écran, de son ouverture à sa
// sortie ; les sons des gestes (brassage, pioche, pose, échange) passent par une
// file de sons (view/marbles/sound-queue.js) qui les étale sans jamais faire
// attendre le joueur, avancée par onFrame comme la séquence ; la balise d'une
// bille quand le curseur arrive sur elle, dans la main ou sur le triangle.
//
// FICHES : le curseur principal annonce court, Ctrl+haut et Ctrl+bas parcourent le
// détail de la bille sous lui (view/marbles/card.js, lib/detail-card.js). Maj+S et
// Maj+D ouvrent les menus du sac et de la défausse (view/marbles/pile-screen.js).
// En mode debug, Maj+L ouvre celui des valeurs de partie (view/marbles/tally-screen.js).
//
// TEMPS RÉEL : la séquence, la file de sons et les roulements avancent par un même
// battement (lib/real-time.js), appelé à chaque image (onFrame) ET par une
// minuterie : les images s'arrêtent quand la fenêtre passe en arrière-plan, la
// minuterie continue (ralentie), et la séquence avec elle. Le temps n'est compté
// qu'une fois, et la séquence ne dit qu'une étape par battement : au retour au
// premier plan, ni étape sautée ni annonces en rafale. Un menu ouvert par-dessus
// (aide, abandon) fige tout, comme avant : seul l'écran du sommet reçoit le temps.

import { announce } from "../../lib/announce.js";
import { activeScreen, popScreen } from "../../lib/screens.js";
import { createRealTimeDriver } from "../../lib/real-time.js";
import { resolveAction, defineBindings } from "../../lib/input.js";
import { jumpMenuCursor, stepMenuCursor, announceMenuLine } from "../../lib/menu.js";
import { detailAfterMainMove, detailLine, mainWithDetail, stepDetail } from "../../lib/detail-card.js";
import { t } from "../../data/i18n/index.js";
import { MARBLES_SETTINGS } from "../../config/marbles-values.js";
import { isDebugEnabled } from "../../config/debug.js";
import { SLOTS, swapRefusal, placeRefusal, throwRefusal } from "../../core/marbles.js";
import { playMenuSound } from "../menu-sounds.js";
import { openConfirmation } from "../menus/confirmation.js";
import { INITIAL_CURSOR, cursorOn, placementStart, stepCursor, zoneOf } from "./navigation.js";
import { marbleCard } from "./card.js";
import { openPileMenu } from "./pile-screen.js";
import {
  bagDisplayOrder,
  buildSteps,
  resolutionSteps,
  stepsText,
  describeBag,
  describeOverview,
  describeDiscard,
  describeHandFocus,
  describeSlotFocus,
  describeSlotForPlacement,
  describeTurn,
  marbleName,
  placementLines,
  slotName,
} from "./narration.js";
import {
  advanceRolls,
  closeTableReverb,
  eventCues,
  handPlace,
  openTableReverb,
  placesDemoCues,
  playCue,
  playFocusBeacon,
  preloadMarblesAudio,
  slotPlace,
  startMarblesMusic,
  stopFocusBeacon,
  stopMarblesMusic,
  stopRolls,
} from "./sounds.js";
import { EMPTY_SOUND_QUEUE, advanceSoundQueue, enqueueCues } from "./sound-queue.js";
import { advanceSequence, restartPause, skipSequence, startSequence } from "./sequence.js";
import { EMPTY_HISTORY, recordSteps } from "./history.js";
import { openHistoryMenu } from "./history-screen.js";
import { openTallyMenu } from "./tally-screen.js";

const MARBLES_BINDINGS = defineBindings("marbles", {
  up: { keys: ["ArrowUp"], mods: [] },
  down: { keys: ["ArrowDown"], mods: [] },
  left: { keys: ["ArrowLeft"], mods: [] },
  right: { keys: ["ArrowRight"], mods: [] },
  home: { keys: ["Home"], mods: [] },
  end: { keys: ["End"], mods: [] },
  detailUp: { keys: ["ArrowUp"], mods: ["ctrl"] },
  detailDown: { keys: ["ArrowDown"], mods: ["ctrl"] },
  activate: { keys: ["Enter", " "], mods: [] },
  back: { keys: ["Escape"], mods: [] },
  reannounce: { keys: ["Backspace"], mods: [] },
  turnInfo: { keys: ["i"], mods: [] },
  bag: { keys: ["s"], mods: [] },
  discard: { keys: ["d"], mods: [] },
  bagMenu: { keys: ["s"], mods: ["shift"] },
  discardMenu: { keys: ["d"], mods: ["shift"] },
  overview: { keys: ["r"], mods: [] },
  resolve: { keys: ["r"], mods: ["shift"] },
  history: { keys: ["l"], mods: [] },
  // Mode debug seulement (voir DEBUG_ACTIONS).
  placesDemo: { keys: ["p"], mods: ["shift"] },
  tally: { keys: ["l"], mods: ["shift"] },
});

// Les actions sans effet hors mode debug, absentes alors de l'aide. Le mode debug
// est celui de tout le projet (config/debug.js, Ctrl+D ou toggleDebug() en console).
const DEBUG_ACTIONS = new Set(["placesDemo", "tally"]);

// La minuterie du temps réel (voir l'en-tête), en millisecondes : assez fine pour
// que les sons tombent juste quand les images manquent, le navigateur la ralentit
// de lui-même en arrière-plan. Un invariant technique, pas un réglage de jeu.
const REAL_TIME_PULSE_MS = 50;

// `rules` : les règles du jeu, liées à la table des billes une fois pour toutes
// par main.js (core/marbles-rules.js) ; l'écran les passe à ce qui en a besoin.
export function makeMarblesScreen(getGame, setGame, rules) {
  let cursor = INITIAL_CURSOR;
  // Le curseur secondaire, dans la fiche de ce qui est sous le curseur principal.
  let detail = 0;
  // Ce qui est sélectionné : null, { kind: "hand", index } ou { kind: "slot", slot }.
  let held = null;
  // La séquence de résolution en cours (null : aucune), et la dernière phrase
  // dite (Retour arrière).
  let sequence = null;
  let spoken = "";
  let started = false;
  // Les messages de jeu du tour en cours et du précédent (view/marbles/history.js).
  let history = EMPTY_HISTORY;
  // Les sons encore à venir d'un geste (view/marbles/sound-queue.js).
  let soundQueue = EMPTY_SOUND_QUEUE;

  const isNarrating = () => sequence !== null;
  const isOver = () => getGame().stage === "over" && !isNarrating();

  function speak(text) {
    spoken = text;
    announce(text, { assertive: true });
  }

  // Le seul chemin des messages de jeu : chaque étape construite entre dans
  // l'historique, qu'elle soit dite d'un coup, en séquence, ou passée.
  function recorded(steps) {
    history = recordSteps(history, steps);
    return steps;
  }

  // Les repères dus partent ; les autres attendent leur échéance.
  function flushSounds(deltaMs) {
    const { queue, due } = advanceSoundQueue(soundQueue, deltaMs);
    soundQueue = queue;
    due.forEach(playCue);
  }

  // Les sons d'un geste, d'après son journal : en file, les immédiats aussitôt.
  // `shuffleFirst` : le sac vient d'être constitué (ouverture de la partie).
  // `placeFrom` : d'où part la bille posée, sa place dans la main avant la pose.
  function playEventSounds(events, { shuffleFirst = false, placeFrom } = {}) {
    const { triangle, hand } = getGame();
    soundQueue = enqueueCues(soundQueue, eventCues(events, { triangleAfter: triangle, handAfter: hand, shuffleFirst, placeFrom }));
    flushSounds(0);
  }

  // Plus aucun son à venir ni en cours de route.
  function silenceSounds() {
    soundQueue = EMPTY_SOUND_QUEUE;
    stopRolls();
  }

  // À la fin de la partie, la dernière phrase dit aussi comment sortir.
  function withOverHint(text) {
    return isOver() ? `${text} ${t("marbles.over_hint")}` : text;
  }

  function refuse(code) {
    playMenuSound("refusal");
    announce(t(`marbles.error.${code}`), { assertive: true });
  }

  // Passe une action au réducteur : ses évènements, ou null si elle est
  // refusée (déjà dit au joueur).
  function dispatch(action) {
    const result = rules.reduce(getGame(), action);
    if (!result.ok) {
      refuse(result.error);
      return null;
    }
    setGame(result.state);
    return result.events;
  }

  function clampedHandIndex() {
    return Math.max(0, Math.min(cursor.handIndex, getGame().hand.length - 1));
  }

  function focusLine() {
    const game = getGame();
    if (cursor.place === "hand") return describeHandFocus(game, clampedHandIndex(), rules, t);
    if (held?.kind === "hand") return describeSlotForPlacement(game, cursor.place, rules, t);
    const line = describeSlotFocus(game, cursor.place, rules, t);
    return held?.kind === "slot" && held.slot === cursor.place ? `${line} ${t("marbles.slot_line.held")}` : line;
  }

  // La bille sous le curseur, ou undefined (emplacement vide, main vide).
  function marbleUnderCursor() {
    const game = getGame();
    return cursor.place === "hand" ? game.hand[clampedHandIndex()]?.marble : game.triangle[cursor.place]?.marble;
  }

  // Le curseur vient d'arriver quelque part : la voix de la bille qui s'y trouve,
  // là où elle est sur la table.
  function beaconUnderCursor() {
    const marble = marbleUnderCursor();
    if (marble === undefined) return;
    const place = cursor.place === "hand" ? handPlace(clampedHandIndex(), getGame().hand.length) : slotPlace(cursor.place);
    playFocusBeacon(marble, place);
  }

  // La fiche de la bille sous le curseur, avec ce qu'on entendrait à sa position
  // par défaut ; null sur un emplacement vide ou une main vide.
  // Ses montants calculés se disent avec les valeurs de partie, et, en main, avec son
  // compteur de tours en main.
  function currentCard() {
    const marble = marbleUnderCursor();
    if (marble === undefined) return null;
    const game = getGame();
    const turnsInHand = cursor.place === "hand" ? game.hand[clampedHandIndex()].turnsInHand : 0;
    return marbleCard(marble, focusLine(), rules, t, { turnsInHand, tally: game.tally });
  }

  // Ce qui se dit du curseur : l'annonce principale, et le champ où se trouve le
  // curseur secondaire s'il n'a pas été réinitialisé.
  function currentLine() {
    const card = currentCard();
    return card === null ? focusLine() : mainWithDetail(card, detail);
  }

  function announceFocus(boundary = false) {
    announceMenuLine(currentLine(), boundary);
  }

  function resetDetailAfterMove() {
    detail = detailAfterMainMove(detail, MARBLES_SETTINGS.cardResetOnMove);
  }

  // Dit ce qu'on est en train d'écouter : l'étape (sa pause repart de zéro),
  // la fin de partie ou le curseur.
  function reannounce() {
    if (isNarrating()) sequence = restartPause(sequence);
    if (isNarrating() || isOver()) speak(spoken);
    else announceFocus();
  }

  // Pendant la séquence, l'état est déjà celui d'après : ce qui le dirait ou le
  // changerait attend. Un son, sans parole, pour ne pas couper l'étape. Rend
  // vrai si le geste s'arrête là.
  function blockedDuringSequence() {
    if (!isNarrating()) return false;
    playMenuSound("block");
    return true;
  }

  // Pendant la séquence, ou la partie finie, le curseur ne bouge pas ; à la fin,
  // on redit la fin de partie. Rend vrai si le geste s'arrête là.
  function blockedByNarration() {
    if (blockedDuringSequence()) return true;
    if (!isOver()) return false;
    playMenuSound("block");
    speak(spoken);
    return true;
  }

  function move(direction) {
    if (blockedByNarration()) return;
    resetDetailAfterMove();
    if (cursor.place === "hand" && (direction === "left" || direction === "right")) {
      const total = getGame().hand.length;
      if (total === 0) {
        playMenuSound("block");
        announceFocus(true);
        return;
      }
      const before = clampedHandIndex();
      const { index, boundary } = stepMenuCursor(before, direction === "left" ? -1 : 1, total);
      cursor = { ...cursor, handIndex: index };
      announceFocus(boundary);
      // Une butée sans cyclage laisse le curseur en place : pas de balise.
      if (index !== before) beaconUnderCursor();
      return;
    }
    const next = stepCursor(cursor, direction, held?.kind === "hand");
    if (next === null) {
      playMenuSound("block");
      announceFocus(true);
      return;
    }
    const zone = zoneOf(next.place);
    const zoneChanged = zone !== zoneOf(cursor.place);
    cursor = { ...next, handIndex: clampedHandIndex() };
    // Le point final du nom de zone fait marquer une pause au lecteur d'écran.
    announceMenuLine(zoneChanged ? `${t(`marbles.zone.${zone}`)} ${currentLine()}` : currentLine());
    beaconUnderCursor();
  }

  // Origine et Fin : première et dernière bille, comme dans un menu. Là où elles
  // n'ont pas d'effet, elles sont silencieuses, sans son de blocage.
  function jump(target) {
    const total = getGame().hand.length;
    if (isNarrating() || isOver() || cursor.place !== "hand" || total === 0) return;
    const { index, boundary } = jumpMenuCursor(clampedHandIndex(), target === "first" ? 0 : total - 1);
    cursor = { ...cursor, handIndex: index };
    resetDetailAfterMove();
    announceFocus(boundary);
    if (!boundary) beaconUnderCursor();
  }

  // Le curseur secondaire : en butée, le champ se réannonce, sans son ni cyclage.
  // Rien sous le curseur principal : il se redit.
  function moveDetail(direction) {
    if (blockedByNarration()) return;
    const card = currentCard();
    if (card === null) {
      announceFocus();
      return;
    }
    detail = stepDetail(detail, card, direction);
    announce(detailLine(card, detail), { assertive: true });
  }

  // Annuler une sélection d'emplacement pour poser ramène sur la bille, dans la
  // main : c'est dit, le curseur ayant changé de zone.
  function releaseSelection() {
    const fromHand = held?.kind === "hand" ? held.index : null;
    held = null;
    playMenuSound("cancel");
    if (fromHand === null) {
      announce(t("marbles.take.released"), { assertive: true });
      return;
    }
    cursor = { ...cursor, place: "hand", handIndex: fromHand };
    resetDetailAfterMove();
    announce(`${t("marbles.take.released")} ${t("marbles.zone.hand")} ${currentLine()}`, { assertive: true });
    beaconUnderCursor();
  }

  // Le son d'une pose est celui de la confirmation qui vient de la lancer. La
  // sélection d'emplacement finie, le curseur revient dans la main.
  function performPlace(handIndex, slot) {
    // La bille roule d'où elle était dans la main, avant que la pose ne l'en retire.
    const placeFrom = handPlace(handIndex, getGame().hand.length);
    const events = dispatch({ type: "place", handIndex, slot });
    if (!events) return;
    held = null;
    cursor = { ...cursor, place: "hand", handIndex: Math.min(handIndex, Math.max(0, getGame().hand.length - 1)) };
    resetDetailAfterMove();
    playEventSounds(events, { placeFrom });
    speak(stepsText(recorded(buildSteps(events, t))));
  }

  function performSwap(a, b) {
    const events = dispatch({ type: "swap", a, b });
    held = null;
    if (!events) return;
    resetDetailAfterMove();
    playMenuSound("select");
    playEventSounds(events);
    speak(stepsText(recorded(buildSteps(events, t))));
  }

  function activateHand() {
    const game = getGame();
    if (game.hand.length === 0) {
      playMenuSound("block");
      announceFocus();
      return;
    }
    // Plus de lancer : refusé dès la prise, comme l'échange.
    const refusal = throwRefusal(game);
    if (refusal) {
      refuse(refusal);
      return;
    }
    // La sélection d'emplacement s'ouvre sur le premier emplacement vide, et le dit.
    const index = clampedHandIndex();
    held = { kind: "hand", index };
    cursor = cursorOn(cursor, placementStart(game.triangle, SLOTS));
    resetDetailAfterMove();
    playMenuSound("select");
    announce(`${t("marbles.take.hand", { name: marbleName(game.hand[index].marble, t) })} ${focusLine()}`, { assertive: true });
    beaconUnderCursor();
  }

  function placeHeldOn(slot) {
    const game = getGame();
    const handIndex = held.index;
    const refusal = placeRefusal(game, handIndex, slot);
    if (refusal) {
      refuse(refusal);
      return;
    }
    playMenuSound("select");
    openConfirmation("marbles.place.menu_title", () => performPlace(handIndex, slot), {
      lines: placementLines(game, handIndex, slot, rules, t),
    });
  }

  function activateSlot() {
    const slot = cursor.place;
    if (held?.kind === "hand") {
      placeHeldOn(slot);
      return;
    }
    if (held?.kind === "slot") {
      if (held.slot === slot) releaseSelection();
      else performSwap(held.slot, slot);
      return;
    }
    const refusal = swapRefusal(getGame());
    if (refusal) {
      refuse(refusal);
      return;
    }
    held = { kind: "slot", slot };
    playMenuSound("select");
    announce(t("marbles.take.slot", { slot: slotName(slot, t) }), { assertive: true });
  }

  // Une étape de la file commence : ses sons, son texte. La file est déjà à jour
  // quand elle se dit : à la dernière étape, la partie peut donc dire comment
  // sortir.
  function follow({ sequence: next, step }) {
    sequence = next;
    if (step === null) return;
    playEventSounds(step.events);
    speak(withOverHint(step.text));
  }

  function activate() {
    if (isNarrating()) {
      // Passer coupe aussi les sons encore à venir des étapes passées.
      silenceSounds();
      follow(skipSequence(sequence));
    } else if (isOver()) popScreen();
    else if (cursor.place === "hand") activateHand();
    else activateSlot();
  }

  // Résolution du tour, et pioche du suivant dans la foulée : l'état est complet
  // avant la première étape, la séquence ne fait plus que le dire. Le curseur
  // revient sur la main.
  function startResolution() {
    const { turn } = getGame();
    const resolved = dispatch({ type: "resolve" });
    if (!resolved) return;
    const drawn = getGame().stage === "draw" ? dispatch({ type: "draw" }) : [];
    held = null;
    cursor = { ...cursor, place: "hand", handIndex: 0 };
    detail = 0;
    // La première fois, comment la passer.
    const steps = recorded(resolutionSteps(turn, [...resolved, ...drawn], t, { hint: turn === 1 }));
    follow(startSequence(steps));
  }

  function resolveKey() {
    if (blockedByNarration()) return;
    startResolution();
  }

  // R : la vue d'ensemble, d'un bloc et sans pause.
  function announceOverview() {
    if (blockedByNarration()) return;
    announce(describeOverview(getGame(), rules, t), { assertive: true });
  }

  function announceTurn() {
    if (blockedDuringSequence()) return;
    const game = getGame();
    announce(describeTurn(game, swapRefusal(game) === null, t), { assertive: true });
  }

  function announceBag() {
    if (blockedDuringSequence()) return;
    announce(describeBag(getGame(), t), { assertive: true });
  }

  function announceDiscard() {
    if (blockedDuringSequence()) return;
    announce(describeDiscard(getGame(), t), { assertive: true });
  }

  function openBagMenu() {
    if (blockedDuringSequence()) return;
    playMenuSound("select");
    openPileMenu("marbles.pile.bag", bagDisplayOrder(getGame().bag, t), rules, getGame().tally);
  }

  // Dans l'ordre d'arrivée : de la plus ancienne à la plus récente.
  function openDiscardMenu() {
    if (blockedDuringSequence()) return;
    playMenuSound("select");
    openPileMenu("marbles.pile.discard", getGame().discard, rules, getGame().tally);
  }

  // L : l'historique du tour précédent. Aussi en fin de partie : celui du dernier
  // tour. Pas pendant la séquence, qui le remplit.
  function openHistory() {
    if (blockedDuringSequence()) return;
    playMenuSound("select");
    openHistoryMenu(history.previous);
  }

  // Maj+P, mode debug : une balise à chaque place, pour régler l'espace à l'oreille.
  // Celle de la bille sous le curseur, sinon de l'argile.
  function playPlacesDemo() {
    if (blockedDuringSequence()) return;
    soundQueue = enqueueCues(soundQueue, placesDemoCues(marbleUnderCursor() ?? "clay"));
    flushSounds(0);
    announce(t("marbles.debug.places_demo"), { assertive: true });
  }

  // Maj+L, mode debug : les valeurs de partie. Pas pendant la séquence, dont l'état
  // est déjà celui d'après la résolution : ce serait la dévoiler.
  function openTally() {
    if (blockedDuringSequence()) return;
    playMenuSound("select");
    openTallyMenu(getGame().tally);
  }

  function back() {
    if (isOver()) popScreen();
    else if (held) releaseSelection();
    else openConfirmation("marbles.quit.confirm", () => popScreen());
  }

  const keyHandlers = {
    up: () => move("up"),
    down: () => move("down"),
    left: () => move("left"),
    right: () => move("right"),
    home: () => jump("first"),
    end: () => jump("last"),
    detailUp: () => moveDetail(1),
    detailDown: () => moveDetail(-1),
    activate,
    back,
    reannounce,
    turnInfo: announceTurn,
    bag: announceBag,
    discard: announceDiscard,
    bagMenu: openBagMenu,
    discardMenu: openDiscardMenu,
    overview: announceOverview,
    resolve: resolveKey,
    history: openHistory,
    placesDemo: playPlacesDemo,
    tally: openTally,
  };

  // Première ouverture : la musique, le sac qu'on brasse et la pioche du tour 1.
  // Ensuite (retour d'une confirmation, de l'aide), l'écran redit où l'on en est.
  function start() {
    started = true;
    preloadMarblesAudio();
    // Après le préchargement : la réverbération a besoin du contexte audio.
    openTableReverb();
    startMarblesMusic();
    const events = dispatch({ type: "draw" });
    playEventSounds(events, { shuffleFirst: true });
    speak(withOverHint(`${t("marbles.intro")} ${stepsText(recorded(buildSteps(events, t)))} ${isOver() ? "" : focusLine()}`));
  }

  // Le temps réel reçu : la séquence (une étape au plus), puis les billes déjà en
  // route avant que d'autres ne partent (un roulement qui part à ce battement
  // commence au début de son trajet), puis les sons dus.
  function advanceRealTime(deltaMs) {
    if (isNarrating()) follow(advanceSequence(sequence, deltaMs));
    advanceRolls(deltaMs);
    flushSounds(deltaMs);
  }

  // `screen` : cet écran, pour savoir s'il est au sommet de la pile.
  let screen = null;
  const realTime = createRealTimeDriver({ advance: advanceRealTime, isActive: () => activeScreen() === screen });
  let pulseTimer = null;

  screen = {
    helpSections: () => [{ id: "marbles", include: (action) => !DEBUG_ACTIONS.has(action) || isDebugEnabled() }],
    onEnter() {
      if (started) {
        reannounce();
        return;
      }
      start();
      pulseTimer = setInterval(() => realTime.pulse(), REAL_TIME_PULSE_MS);
    },
    onExit() {
      clearInterval(pulseTimer);
      pulseTimer = null;
      silenceSounds();
      stopFocusBeacon();
      closeTableReverb();
      stopMarblesMusic();
      setGame(null);
    },
    // Une image : un battement du temps réel, qui mesure lui-même le temps écoulé
    // (le delta de la boucle n'y sert pas : la minuterie en a peut-être déjà compté
    // une part).
    onFrame() {
      realTime.pulse();
    },
    onKeyDown(event) {
      const action = resolveAction(MARBLES_BINDINGS, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler || (DEBUG_ACTIONS.has(action) && !isDebugEnabled())) return;
      event.preventDefault();
      handler();
    },
  };
  return screen;
}
