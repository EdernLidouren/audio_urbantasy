// Jeu des billes : l'ÉCRAN de jeu, au clavier et au lecteur d'écran. Aucune règle
// ici : chaque geste passe par les règles (marbles/core/rules.js, rules.reduce et ses
// refus), et tout ce qui se dit par la narration (marbles/view/narration.js). La
// partie appartient à main.js (getGame/setGame, comme la session du jeu principal) ;
// ne restent ici que le curseur, la sélection et ce que l'écran présente, le temps
// d'un écran. Le comportement de chaque touche, du mode choix, de la séquence de
// résolution et des sons : doc/marbles.md, « Écran de jeu ».
//
// Ce que l'écran délègue :
//   marbles/view/resolution.js   la résolution présentée en séquence (Maj+R) ;
//   marbles/view/choice.js       le mode choix, quand un effet fait choisir une cible ;
//   marbles/view/navigation.js   le curseur sur la table ;
//   marbles/view/card.js         les fiches (Ctrl+haut, Ctrl+bas) ;
//   marbles/view/pile-screen.js, status-screen.js  les menus des piles et des
//                                statuts (Maj+S, Maj+D, Maj+P, Maj+A) ;
//   marbles/view/history.js      l'historique du tour précédent (L) ;
//   marbles/view/sounds.js       les sons, étalés par une file (sound-queue.js).
//
// TEMPS RÉEL : la séquence, la file de sons et les roulements avancent par un même
// battement (lib/real-time.js), appelé à chaque image ET par une minuterie : en
// arrière-plan, les images s'arrêtent, la minuterie continue, et la séquence avec
// elle, sans étape sautée ni annonces en rafale au retour. Un menu ouvert
// par-dessus fige tout : seul l'écran du sommet reçoit le temps.
//
// LE MONDE EXTÉRIEUR (`io`, facultatif) : ce que l'écran annonce, ses textes, ses
// sons, son horloge et sa minuterie. Par défaut les vrais ; le banc d'essai des
// vérifications (marbles/checks/fixtures/screen-bench.js) les remplace pour jouer
// l'écran sous Node, sans DOM ni audio. Les menus ouverts par l'écran gardent leurs
// vrais modules.

import { announce } from "../../lib/announce.js";
import { activeScreen, popScreen } from "../../lib/screens.js";
import { createRealTimeDriver } from "../../lib/real-time.js";
import { resolveAction, defineBindings } from "../../lib/input.js";
import { jumpMenuCursor, stepMenuCursor, announceMenuLine } from "../../lib/menu.js";
import { detailAfterMainMove, detailLine, mainWithDetail, stepDetail } from "../../lib/detail-card.js";
import { t } from "../../data/i18n/index.js";
import { MARBLES_SETTINGS } from "../config/values.js";
import { isDebugEnabled } from "../../config/debug.js";
import { SLOTS } from "../core/marbles.js";
import { isOptionalChoice } from "../core/effects.js";
import { playMenuSound } from "../../view/menu-sounds.js";
import { openConfirmation } from "../../view/menus/confirmation.js";
import { INITIAL_CURSOR, cursorOn, placementStart, stepCursor, zoneOf } from "./navigation.js";
import { choiceAnswer, choiceCursorAfterAnswer, choiceFocusLine, choiceHandOptions, choiceListEntry, choiceStartCursor, stepChoiceCursor } from "./choice.js";
import { marbleCard } from "./card.js";
import { openPileMenu } from "./pile-screen.js";
import { openStatusMenu } from "./status-screen.js";
import { openGoalMenu } from "./goal-screen.js";
import { ordinaryInstances } from "../core/statuses.js";
import {
  bagDisplayOrder,
  buildSteps,
  describeChoicePrompt,
  stepsText,
  describeBag,
  describeOverview,
  describeDiscard,
  describePot,
  describeStatuses,
  describeGoal,
  describeOpening,
  refusalText,
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
  discardPlace,
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
import { choicePromptStep, createResolutionPresenter } from "./resolution.js";
import { EMPTY_HISTORY, recordSteps } from "./history.js";
import { openHistoryMenu } from "./history-screen.js";
import { openTallyMenu } from "./tally-screen.js";
import { keywordsText, openKeywordsMenu } from "./keywords.js";
import { openMarblesHelp } from "./help-screen.js";

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
  pot: { keys: ["p"], mods: [] },
  potMenu: { keys: ["p"], mods: ["shift"] },
  // Les statuts de la partie : leur résumé, puis leur menu (marbles/view/status-screen.js).
  statuses: { keys: ["a"], mods: [] },
  statusesMenu: { keys: ["a"], mods: ["shift"] },
  // L'objectif et sa progression ; le menu de l'objectif et des règles.
  goal: { keys: ["o"], mods: [] },
  goalMenu: { keys: ["o"], mods: ["shift"] },
  overview: { keys: ["r"], mods: [] },
  resolve: { keys: ["r"], mods: ["shift"] },
  history: { keys: ["l"], mods: [] },
  keywords: { keys: ["e"], mods: [] },
  keywordsMenu: { keys: ["e"], mods: ["shift"] },
  // Terminer un choix facultatif (sur le triangle surtout : la main a son entrée
  // « Ne rien choisir », puis « Terminer »). Libre dans cet écran.
  finish: { keys: ["t"], mods: [] },
  // L'aide du jeu des billes. Libre dans cet écran : F1 et Maj+H sont des touches
  // globales (l'aide des touches), H seul n'est lié à rien.
  help: { keys: ["h"], mods: [] },
  // Mode debug seulement (voir DEBUG_ACTIONS). La démonstration des places est sur
  // Maj+B (« balises ») : Maj+P ouvre le menu du pot.
  placesDemo: { keys: ["b"], mods: ["shift"] },
  tally: { keys: ["l"], mods: ["shift"] },
});

// Les actions sans effet hors mode debug, absentes alors de l'aide. Le mode debug
// est celui de tout le projet (config/debug.js, Ctrl+D ou toggleDebug() en console).
const DEBUG_ACTIONS = new Set(["placesDemo", "tally"]);

// La minuterie du temps réel (voir l'en-tête), en millisecondes : assez fine pour
// que les sons tombent juste quand les images manquent, le navigateur la ralentit
// de lui-même en arrière-plan. Un invariant technique, pas un réglage de jeu.
const REAL_TIME_PULSE_MS = 50;

// Les sons de l'écran, tels qu'il les appelle : ce qu'un `io.sounds` peut remplacer.
const SCREEN_SOUNDS = {
  advanceRolls,
  closeTableReverb,
  openTableReverb,
  playCue,
  playFocusBeacon,
  playMenuSound,
  preloadMarblesAudio,
  startMarblesMusic,
  stopFocusBeacon,
  stopMarblesMusic,
  stopRolls,
};

// Leurs noms : ce qu'un banc d'essai doit remplacer, tous, pour que rien ne joue
// pour de vrai (marbles/checks/fixtures/screen-bench.js).
export const SCREEN_SOUND_NAMES = Object.freeze(Object.keys(SCREEN_SOUNDS));

// Le monde extérieur par défaut, le vrai (voir l'en-tête).
const REAL_IO = {
  announce,
  announceMenuLine,
  t,
  now: () => performance.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};

// `rules` : les règles du jeu, liées à la table des billes une fois pour toutes
// par main.js (marbles/core/rules.js) ; l'écran les passe à ce qui en a besoin.
// `openKeyHelp(screen)` : ouvre l'aide des touches de cet écran (main.js, qui connaît
// les sections globales de l'aide), pour la rubrique « Les touches » de l'aide H.
// `io` : le monde extérieur (voir l'en-tête), { announce, announceMenuLine, t, now,
// setInterval, clearInterval, sounds }, chacun facultatif ; `sounds` remplace tout ou partie de
// SCREEN_SOUNDS.
export function makeMarblesScreen(getGame, setGame, rules, { openKeyHelp = () => {}, io = {} } = {}) {
  // Ces noms masquent les imports du même nom : le corps de l'écran les appelle tels
  // quels, vrais ou remplacés.
  const { announce, announceMenuLine, t, now, setInterval, clearInterval } = { ...REAL_IO, ...io };
  // Les sons, vrais ou remplacés, appelés par leur nom : sound.playCue(...).
  const sound = { ...SCREEN_SOUNDS, ...io.sounds };
  let cursor = INITIAL_CURSOR;
  // Le curseur secondaire, dans la fiche de ce qui est sous le curseur principal.
  let detail = 0;
  // Ce qui est sélectionné : null, { kind: "hand", index } ou { kind: "slot", slot }.
  let held = null;
  // La dernière phrase dite (Retour arrière).
  let spoken = "";
  let started = false;
  // Les messages de jeu du tour en cours et du précédent (marbles/view/history.js).
  let history = EMPTY_HISTORY;
  // Les sons encore à venir d'un geste (marbles/view/sound-queue.js).
  let soundQueue = EMPTY_SOUND_QUEUE;
  // La présentation de la résolution : sa séquence, la résolution qu'un choix
  // interrompt, la garde après un saut (marbles/view/resolution.js). Elle reçoit ce
  // qu'elle dit et joue par l'écran ; les fonctions prêtées sont déclarées plus bas.
  const resolution = createResolutionPresenter({
    getGame,
    draw: () => dispatch({ type: "draw" }) ?? [],
    t,
    now,
    recorded: (steps) => recorded(steps),
    // Une étape commence : ses sons, son texte. L'étape qui dit le début du tour
    // rend la main au joueur : son son (player_turn), que la séquence ait été
    // écoutée ou passée (un saut joue la dernière étape).
    onStep: (step) => {
      playEventSounds(step.events, { handSize: step.handSize, playerTurn: step.startsTurn !== undefined });
      speak(withOverHint(step.text));
    },
    onChoice: (pending) => placeCursorForChoice(pending),
    onDone: () => {
      cursor = { ...cursor, place: "hand", handIndex: 0 };
      detail = 0;
    },
    silence: () => silenceSounds(),
  });

  const isNarrating = () => resolution.isNarrating();
  // Le choix en attente, s'il y en a un et que la séquence a fini de dire ce qui le
  // précède : l'écran est alors en mode choix.
  const pendingChoice = () => (isNarrating() ? null : getGame().pendingChoice);
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
    due.forEach((cue) => sound.playCue(cue, rules.types));
  }

  // Les sons d'un geste, d'après son journal : en file, les immédiats aussitôt.
  // `shuffleFirst` : le sac vient d'être constitué (ouverture de la partie).
  // `placeFrom` : d'où part la bille posée, sa place dans la main avant la pose.
  // `handSize` : la taille de la main juste après ces évènements, quand l'état est
  // déjà plus loin (une étape de séquence) ; par défaut, la main actuelle.
  function playEventSounds(events, { shuffleFirst = false, placeFrom, handSize, playerTurn = false } = {}) {
    const { triangle, hand } = getGame();
    // Les tailles des billes, pour la force des chocs : celles de la table de l'écran.
    const cues = eventCues(events, { triangleAfter: triangle, handAfter: hand, handSize, shuffleFirst, placeFrom, playerTurn }, MARBLES_SETTINGS, { types: rules.types });
    soundQueue = enqueueCues(soundQueue, cues);
    flushSounds(0);
  }

  // Plus aucun son à venir ni en cours de route.
  function silenceSounds() {
    soundQueue = EMPTY_SOUND_QUEUE;
    sound.stopRolls();
  }

  // À la fin de la partie, la dernière phrase dit aussi comment sortir.
  function withOverHint(text) {
    return isOver() ? `${text} ${t("marbles.over_hint")}` : text;
  }

  // Un refus, dit avec sa raison (le statut ou la règle d'un verrou : refusalText).
  function refuse(code) {
    sound.playMenuSound("refusal");
    announce(refusalText(code, getGame(), rules, t), { assertive: true });
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

  // Le nombre de places de la main pour le curseur : ses billes, ou, pendant un
  // choix, les options de son menu.
  function handCount() {
    const pending = getGame().pendingChoice;
    return pending ? choiceHandOptions(pending).length : getGame().hand.length;
  }

  function clampedHandIndex() {
    return Math.max(0, Math.min(cursor.handIndex, handCount() - 1));
  }

  function focusLine() {
    const game = getGame();
    if (game.pendingChoice) return choiceFocusLine(game, { ...cursor, handIndex: clampedHandIndex() }, rules, t);
    if (cursor.place === "hand") return describeHandFocus(game, clampedHandIndex(), rules, t);
    if (held?.kind === "hand") return describeSlotForPlacement(game, cursor.place, rules, t);
    const line = describeSlotFocus(game, cursor.place, rules, t);
    return held?.kind === "slot" && held.slot === cursor.place ? `${line} ${t("marbles.slot_line.held")}` : line;
  }

  // L'entrée de la main sous le curseur ({ marble, turnsInHand, zone }, et sa place
  // dans sa zone), ou null : pendant un choix, l'option du menu du choix, de la main
  // ou de la défausse.
  function handEntryUnderCursor() {
    const game = getGame();
    if (cursor.place !== "hand") return null;
    if (game.pendingChoice) return choiceListEntry(game, choiceHandOptions(game.pendingChoice)[clampedHandIndex()]);
    const index = clampedHandIndex();
    return game.hand[index] === undefined ? null : { ...game.hand[index], zone: "hand", index };
  }

  // La bille sous le curseur, ou undefined (emplacement vide, main vide, Terminer) :
  // dans la main, son entrée (celle du menu d'un choix comprise) ; sur le triangle,
  // sa bille.
  function marbleUnderCursor() {
    return cursor.place === "hand" ? handEntryUnderCursor()?.marble : getGame().triangle[cursor.place]?.marble;
  }

  // Le curseur vient d'arriver quelque part : la voix de la bille qui s'y trouve,
  // là où elle est sur la table.
  function beaconUnderCursor() {
    const marble = marbleUnderCursor();
    if (marble === undefined) return;
    // Une bille de la défausse (le menu d'un choix) s'entend à la défausse.
    const entry = cursor.place === "hand" ? handEntryUnderCursor() : null;
    const place = entry === null ? slotPlace(cursor.place) : entry.zone === "discard" ? discardPlace() : handPlace(entry.index, getGame().hand.length);
    sound.playFocusBeacon(marble, place, rules.types);
  }

  // La fiche de la bille sous le curseur, avec ce qu'on entendrait à sa position
  // par défaut ; null sur un emplacement vide ou une main vide.
  // Ses montants calculés se disent avec les valeurs de partie, et, en main, avec son
  // compteur de tours en main.
  function currentCard() {
    const marble = marbleUnderCursor();
    if (marble === undefined) return null;
    const game = getGame();
    const turnsInHand = cursor.place === "hand" ? handEntryUnderCursor().turnsInHand : 0;
    return marbleCard(marble, focusLine(), rules, t, { turnsInHand, game });
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

  // Dit ce qu'on est en train d'écouter : l'étape (sa pause repart de zéro), la fin
  // de partie, la question d'un choix suivie du curseur (elle se perdrait sinon, Échap
  // terminant un choix facultatif), ou le curseur.
  function reannounce() {
    resolution.restartPause();
    if (isNarrating() || isOver()) speak(spoken);
    else if (pendingChoice()) announce(`${describeChoicePrompt(getGame().pendingChoice, t)} ${focusLine()}`, { assertive: true });
    else announceFocus();
  }

  // Pendant la séquence, l'état est déjà celui d'après : ce qui le dirait ou le
  // changerait attend. Un son, sans parole, pour ne pas couper l'étape. Rend
  // vrai si le geste s'arrête là.
  function blockedDuringSequence() {
    if (!isNarrating()) return false;
    sound.playMenuSound("block");
    return true;
  }

  // Pendant la séquence, ou la partie finie, le curseur ne bouge pas ; à la fin,
  // on redit la fin de partie. Rend vrai si le geste s'arrête là.
  function blockedByNarration() {
    if (blockedDuringSequence()) return true;
    if (!isOver()) return false;
    sound.playMenuSound("block");
    speak(spoken);
    return true;
  }

  function move(direction) {
    if (blockedByNarration()) return;
    resetDetailAfterMove();
    if (cursor.place === "hand" && (direction === "left" || direction === "right")) {
      const total = handCount();
      if (total === 0) {
        sound.playMenuSound("block");
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
    const pending = getGame().pendingChoice;
    const next = pending ? stepChoiceCursor(pending, cursor, direction) : stepCursor(cursor, direction, held?.kind === "hand");
    if (next === null) {
      sound.playMenuSound("block");
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
    const total = handCount();
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
    sound.playMenuSound("cancel");
    if (fromHand === null) {
      announce(t("marbles.take.released"), { assertive: true });
      return;
    }
    cursor = { ...cursor, place: "hand", handIndex: fromHand };
    resetDetailAfterMove();
    announce(`${t("marbles.take.released")} ${t("marbles.zone.hand")} ${currentLine()}`, { assertive: true });
    beaconUnderCursor();
  }

  // Ce qu'un geste a fait se dit, suivi, si l'action attend un choix, de sa
  // question ; le curseur s'y ouvre (sur une nouvelle question) ou y reste (un choix
  // multiple qui continue).
  function speakWithChoice(events, carriedTurn) {
    const text = stepsText(recorded(buildSteps(events, t, { carriedTurn })));
    const pending = getGame().pendingChoice;
    if (pending === null) {
      speak(text);
      return;
    }
    placeCursorForChoice(pending);
    detail = 0;
    const prompt = recorded([choicePromptStep(pending, t)])[0].text;
    speak(text === "" ? prompt : `${text} ${prompt}`);
  }

  // Le curseur d'un choix qui s'ouvre ou continue : à l'ouverture, là où le choix
  // commence ; ensuite sur sa place, bornée, sauf si la main n'a plus d'option.
  function placeCursorForChoice(pending) {
    if (pending.chosen.length === 0) cursor = choiceStartCursor(pending, cursor);
    else cursor = choiceCursorAfterAnswer(pending, { ...cursor, handIndex: clampedHandIndex() });
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
    speakWithChoice(events);
  }

  // Entrée pendant un choix : la cible sous le curseur, ou Terminer ; un emplacement
  // non éligible bloque, et le dit.
  function activateChoice() {
    const pending = getGame().pendingChoice;
    const answer = choiceAnswer(pending, { ...cursor, handIndex: clampedHandIndex() });
    if (answer.refusal) {
      sound.playMenuSound("block");
      announce(t("marbles.choice.not_eligible"), { assertive: true });
      return;
    }
    answerChoice(answer.action);
  }

  // T : terminer un choix facultatif ; un choix obligatoire le refuse.
  function finishChoice() {
    if (blockedByNarration()) return;
    const pending = getGame().pendingChoice;
    if (pending === null) {
      sound.playMenuSound("block");
      return;
    }
    if (!isOptionalChoice(pending)) {
      refuse("choiceRequired");
      return;
    }
    answerChoice({ type: "choose", done: true });
  }

  // La réponse part au réducteur, qui reprend l'action suspendue. Pendant une
  // résolution, la suite se dit en séquence, chaque étape avec ses sons ; ailleurs,
  // d'un bloc. Le choix fini, le curseur revient dans la main.
  function answerChoice(action) {
    // La pioche du tour suspendue par un choix (un Éveil) : son début de tour se dit à
    // la fin de la reprise (buildSteps, carriedTurn), avec le son de la main rendue.
    const carriedTurn = getGame().pendingChoice.resume.action.type === "draw" ? getGame().turn : undefined;
    const events = dispatch(action);
    if (!events) return;
    sound.playMenuSound("select");
    if (resolution.isResolving()) {
      resolution.resume(events, carriedTurn);
      return;
    }
    const handBack = carriedTurn !== undefined && getGame().pendingChoice === null;
    playEventSounds(events, { playerTurn: handBack });
    if (getGame().pendingChoice === null) cursor = { ...cursor, place: "hand", handIndex: 0 };
    speakWithChoice(events, carriedTurn);
  }

  // Un échange refusé lâche aussi la sélection : le refus se dit, puis la sélection
  // annulée, pour que le joueur sache qu'il ne tient plus rien.
  function performSwap(a, b) {
    const events = dispatch({ type: "swap", a, b });
    if (!events) {
      releaseSelection();
      return;
    }
    held = null;
    resetDetailAfterMove();
    sound.playMenuSound("select");
    playEventSounds(events);
    speakWithChoice(events);
  }

  function activateHand() {
    const game = getGame();
    // Un emplacement tenu pour un échange : Entrée dans la main ne prend pas une
    // bille par-dessus sans rien dire, il lâche l'emplacement, et le dit.
    if (held?.kind === "slot") {
      releaseSelection();
      return;
    }
    if (game.hand.length === 0) {
      sound.playMenuSound("block");
      announceFocus();
      return;
    }
    // Plus de lancer : refusé dès la prise, comme l'échange.
    const refusal = rules.throwRefusal(game);
    if (refusal) {
      refuse(refusal);
      return;
    }
    // La sélection d'emplacement s'ouvre sur le premier emplacement vide, et le dit.
    const index = clampedHandIndex();
    held = { kind: "hand", index };
    cursor = cursorOn(cursor, placementStart(game.triangle, SLOTS));
    resetDetailAfterMove();
    sound.playMenuSound("select");
    announce(`${t("marbles.take.hand", { name: marbleName(game.hand[index].marble, t) })} ${focusLine()}`, { assertive: true });
    beaconUnderCursor();
  }

  function placeHeldOn(slot) {
    const game = getGame();
    const handIndex = held.index;
    const refusal = rules.placeRefusal(game, handIndex, slot);
    if (refusal) {
      refuse(refusal);
      return;
    }
    sound.playMenuSound("select");
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
    const refusal = rules.swapRefusal(getGame());
    if (refusal) {
      refuse(refusal);
      return;
    }
    held = { kind: "slot", slot };
    sound.playMenuSound("select");
    announce(t("marbles.take.slot", { slot: slotName(slot, t) }), { assertive: true });
  }

  function activate() {
    if (isNarrating()) {
      // Passer coupe aussi les sons encore à venir des étapes passées.
      resolution.skip();
    } else if (resolution.isSkipGuarded()) {
      // Un second Entrée trop proche du saut : la dernière étape n'a pas pu être
      // entendue (une question, la fin de partie). Ignoré, sans son.
    } else if (isOver()) popScreen();
    else if (pendingChoice()) activateChoice();
    else if (cursor.place === "hand") activateHand();
    else activateSlot();
  }

  // Résolution du tour, et pioche du suivant dans la foulée : l'état est complet
  // avant la première étape (ou jusqu'au premier choix), la séquence ne fait plus
  // que le dire (marbles/view/resolution.js). Le curseur revient sur la main.
  function startResolution() {
    const { turn } = getGame();
    const resolved = dispatch({ type: "resolve" });
    if (!resolved) return;
    held = null;
    cursor = { ...cursor, place: "hand", handIndex: 0 };
    detail = 0;
    resolution.start(turn, resolved);
  }

  function resolveKey() {
    if (blockedByNarration()) return;
    startResolution();
  }

  // R : la vue d'ensemble, d'un bloc et sans pause. Pas pendant un choix : rien ne se
  // prévoit au milieu d'une action.
  function announceOverview() {
    if (blockedByNarration()) return;
    if (getGame().pendingChoice) {
      refuse("choicePending");
      return;
    }
    // Hors de la phase de jeu, rien ne se prévoit : le refus du core, dit comme tel.
    const overview = describeOverview(getGame(), rules, t);
    if (overview === null) {
      refuse(rules.forecast(getGame()).error);
      return;
    }
    announce(overview, { assertive: true });
  }

  // Une CONSULTATION (I, S, D, P, A, E) : jamais pendant la séquence, dont l'état est
  // déjà celui d'après la résolution (la dire la dévoilerait) ; son texte, d'une
  // annonce.
  const consult = (text) => () => {
    if (blockedDuringSequence()) return;
    announce(text(), { assertive: true });
  };
  // Un MENU de consultation (Maj+S, Maj+D, Maj+P, Maj+A, L, Maj+E, Maj+L), de même.
  const openMenu = (open) => () => {
    if (blockedDuringSequence()) return;
    sound.playMenuSound("select");
    open();
  };

  // Maj+B, mode debug : une balise à chaque place, pour régler l'espace à l'oreille.
  // Celle de la bille sous le curseur, sinon de la première de la table.
  function playPlacesDemo() {
    if (blockedDuringSequence()) return;
    soundQueue = enqueueCues(soundQueue, placesDemoCues(marbleUnderCursor() ?? Object.keys(rules.types)[0], rules.characteristic(getGame(), "handSize")));
    flushSounds(0);
    announce(t("marbles.debug.places_demo"), { assertive: true });
  }

  // H : l'aide du jeu des billes, à tout moment (elle ne dévoile rien de la partie ; un
  // menu ouvert par-dessus fige la séquence, comme les autres).
  function openHelpMenu() {
    sound.playMenuSound("select");
    openMarblesHelp(() => openKeyHelp(screen), getGame().definition);
  }

  // Échap : pendant un choix facultatif, valide la sélection en cours, comme
  // Terminer (sans aucune cible : l'action est ignorée) ; pendant un choix
  // obligatoire, redit la question (il ne se ferme pas, le jeu ne peut continuer sans
  // lui) ; sinon annule la sélection, ou propose de quitter.
  function back() {
    const pending = pendingChoice();
    if (isOver()) popScreen();
    else if (pending && isOptionalChoice(pending)) answerChoice({ type: "choose", done: true });
    else if (pending) speak(describeChoicePrompt(pending, t));
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
    // Les lancers restants et l'échange : rien d'autre ne permet de les savoir sans
    // essayer.
    turnInfo: consult(() => describeTurn(getGame(), rules.swapRefusal(getGame()) === null, rules, t)),
    bag: consult(() => describeBag(getGame(), rules, t)),
    discard: consult(() => describeDiscard(getGame(), t)),
    // Le sac dans un ordre qui ne dévoile rien de la pioche ; la défausse et le pot
    // dans l'ordre d'arrivée.
    bagMenu: openMenu(() => openPileMenu("marbles.pile.bag", bagDisplayOrder(getGame().bag, t), rules, getGame())),
    discardMenu: openMenu(() => openPileMenu("marbles.pile.discard", getGame().discard, rules, getGame())),
    pot: consult(() => describePot(getGame(), rules, t)),
    potMenu: openMenu(() => openPileMenu("marbles.pile.pot", getGame().pot, rules, getGame())),
    statuses: consult(() => describeStatuses(getGame(), rules, t)),
    statusesMenu: openMenu(() => openStatusMenu(ordinaryInstances(getGame().statuses), rules)),
    goal: consult(() => describeGoal(getGame(), t)),
    goalMenu: openMenu(() => openGoalMenu(getGame(), rules)),
    overview: announceOverview,
    resolve: resolveKey,
    // L'historique du tour précédent, aussi en fin de partie (celui du dernier tour).
    history: openMenu(() => openHistoryMenu(history.previous)),
    keywords: consult(() => keywordsText(marbleUnderCursor(), rules, t)),
    keywordsMenu: openMenu(() => openKeywordsMenu(marbleUnderCursor(), rules)),
    finish: finishChoice,
    help: openHelpMenu,
    placesDemo: playPlacesDemo,
    // Mode debug : les valeurs de partie.
    tally: openMenu(() => openTallyMenu(getGame().tally)),
  };

  // Première ouverture : la musique, le sac qu'on brasse et la pioche du tour 1.
  // Une partie déjà piochée (un état construit par la console de test,
  // window.debugStartMarbles) s'ouvre sans pioche, sur sa phase de jeu ou son choix
  // en attente. Ensuite (retour d'une confirmation, de l'aide), l'écran redit où
  // l'on en est.
  function start() {
    started = true;
    sound.preloadMarblesAudio();
    // Après le préchargement : la réverbération a besoin du contexte audio.
    sound.openTableReverb();
    sound.startMarblesMusic();
    const drawing = getGame().stage === "draw" && getGame().pendingChoice === null;
    const events = (drawing ? dispatch({ type: "draw" }) : null) ?? [];
    // Le premier tour : la main revient au joueur après sa pioche, pas avant un choix
    // qui la suspend (un Éveil à choix).
    const handBack = events.some((event) => event.type === "turnStarted") && getGame().pendingChoice === null;
    playEventSounds(events, { shuffleFirst: true, playerTurn: handBack });
    const pending = getGame().pendingChoice;
    if (pending !== null) cursor = choiceStartCursor(pending, cursor);
    // Un état construit ouvert sur un choix qui suspend une résolution : la suite se
    // dira en séquence, puis le tour suivant se piochera, comme si l'écran l'avait
    // lancée.
    if (pending?.resume.action.type === "resolve") resolution.adopt(getGame().turn);
    const next = pending !== null ? describeChoicePrompt(pending, t) : isOver() ? "" : focusLine();
    // L'objectif et les règles, une seule annonce, avant celle du premier tour.
    speak(withOverHint(`${t("marbles.intro")} ${describeOpening(getGame(), t)} ${stepsText(recorded(buildSteps(events, t)))} ${next}`));
  }

  // Le temps réel reçu : la séquence (une étape au plus), puis les billes déjà en
  // route avant que d'autres ne partent (un roulement qui part à ce battement
  // commence au début de son trajet), puis les sons dus.
  function advanceRealTime(deltaMs) {
    resolution.advance(deltaMs);
    sound.advanceRolls(deltaMs);
    flushSounds(deltaMs);
  }

  // `screen` : cet écran, pour savoir s'il est au sommet de la pile.
  let screen = null;
  const realTime = createRealTimeDriver({ advance: advanceRealTime, isActive: () => activeScreen() === screen, now });
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
      sound.stopFocusBeacon();
      sound.closeTableReverb();
      sound.stopMarblesMusic();
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
