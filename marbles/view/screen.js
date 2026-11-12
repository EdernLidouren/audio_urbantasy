// Jeu des billes : l'ÉCRAN de jeu. Aucune règle ici : tout passe par le
// réducteur (marbles/core/marbles.js), et tout ce qui se dit par
// marbles/view/narration.js. La partie appartient à main.js (getGame/setGame,
// comme la session du jeu principal) ; ne restent ici que le curseur et la
// sélection, le temps d'un écran ; la résolution à dire a son module
// (marbles/view/resolution.js).
//
// PRENDRE ET POSER, un seul geste (Entrée) : sur une bille de la main, la
// sélectionne et ouvre la SÉLECTION D'EMPLACEMENT : le curseur passe sur le premier
// emplacement vide (dans l'ordre des phases, base gauche sinon) et ne quitte plus le
// triangle, la main n'existe plus pour lui. Entrée sur un emplacement ouvre la
// confirmation de la pose, qui dit ce qu'elle produirait (prévision,
// marbles/core/forecast.js) ; Échap annule et ramène sur la bille dans la main, où
// le curseur revient aussi après la pose.
// Sur un emplacement sans sélection, le prend pour l'échange ; sur un second
// emplacement ensuite, échange les deux. Refaire Entrée sur la sélection, ou
// Échap, l'annule.
//
// HISTORIQUE (L) : les messages de jeu du tour précédent, dans un menu
// (marbles/view/history.js, history-screen.js). Tout ce qui se dit par une étape y
// entre, au moment où l'étape est construite : une séquence passée y est entière.
//
// VUE D'ENSEMBLE (R) : la prévision du tour puis chaque emplacement, d'un bloc.
//
// RÉSOLUTION (Maj+R) : la simulation résout tout d'un coup ; ce qui suit n'est
// que la présentation (marbles/view/resolution.js), une file d'étapes
// (marbles/view/sequence.js) qui se dit avec une pause après chacune, avancée par le
// TEMPS RÉEL de l'écran (plus bas). Entrée la passe et amène au
// tour suivant (ou à la fin de partie), sans rien changer à l'état ; un second Entrée
// trop proche est ignoré (MARBLES_SETTINGS.skipGuardMs). Tant qu'elle dure, tout le
// reste est refusé d'un son de blocage, sans parole pour ne pas la couper : l'état
// est déjà celui d'après la résolution, et le dévoilerait. Seuls Retour arrière
// (redire l'étape), F1, H et Échap (quitter, qui se confirme et fige la séquence)
// restent permis.
//
// SONS (marbles/view/sounds.js) : la musique de l'écran, de son ouverture à sa
// sortie ; les sons des gestes (brassage, pioche, pose, échange) passent par une
// file de sons (marbles/view/sound-queue.js) qui les étale sans jamais faire
// attendre le joueur, avancée par onFrame comme la séquence ; la balise d'une
// bille quand le curseur arrive sur elle, dans la main ou sur le triangle.
//
// AIDE (H) : un menu de rubriques courtes sur les règles, puis l'aide des touches de
// l'écran (marbles/view/help-screen.js). F1 et Maj+H, touches globales, ouvrent
// directement l'aide des touches.
//
// FICHES : le curseur principal annonce court, Ctrl+haut et Ctrl+bas parcourent le
// détail de la bille sous lui (marbles/view/card.js, lib/detail-card.js). Maj+S,
// Maj+D et Maj+P ouvrent les menus du sac, de la défausse et du pot
// (marbles/view/pile-screen.js) ; P dit le pot et les billes perdues.
// E dit les mots-clés de la bille sous le curseur, Maj+E les ouvre en menu
// (marbles/view/keywords.js). En mode debug, Maj+L ouvre le menu des valeurs de partie
// (marbles/view/tally-screen.js).
//
// CHOIX : quand un effet laisse le joueur choisir sa cible, la simulation suspend
// l'action (marbles/core/marbles.js, `pendingChoice`) ; l'écran passe en MODE CHOIX tant que
// le choix attend (marbles/view/choice.js) : la question se dit (après les étapes
// déjà jouées), la main ne propose que les billes éligibles (et « Terminer » en mode
// « jusqu'à N »), le triangle garde sa forme, ses emplacements non éligibles se
// disent et bloquent. Entrée choisit, T termine un choix « jusqu'à N », Échap aussi ;
// dans un choix obligatoire, Échap redit la question (il ne se ferme pas). Fiches et mots-clés y marchent. Pendant
// une résolution, la séquence s'arrête sur la question (la passer aussi), le choix
// se fait, puis la suite de la résolution reprend en séquence.
//
// TEMPS RÉEL : la séquence, la file de sons et les roulements avancent par un même
// battement (lib/real-time.js), appelé à chaque image (onFrame) ET par une
// minuterie : les images s'arrêtent quand la fenêtre passe en arrière-plan, la
// minuterie continue (ralentie), et la séquence avec elle. Le temps n'est compté
// qu'une fois, et la séquence ne dit qu'une étape par battement : au retour au
// premier plan, ni étape sautée ni annonces en rafale. Un menu ouvert par-dessus
// (aide, abandon) fige tout, comme avant : seul l'écran du sommet reçoit le temps.
//
// LE MONDE EXTÉRIEUR (`io`, facultatif) : ce que l'écran annonce, ses textes, ses
// sons, son horloge et sa minuterie. Par défaut les vrais (le jeu, main.js, n'en
// passe aucun) ; le banc d'essai des vérifications (core/checks/fixtures/
// screen-bench.js) les remplace pour jouer l'écran sous Node, sans DOM ni audio. Les
// menus ouverts par l'écran (confirmation, aide, piles) gardent leurs vrais modules.

import { announce } from "../../lib/announce.js";
import { activeScreen, popScreen } from "../../lib/screens.js";
import { createRealTimeDriver } from "../../lib/real-time.js";
import { resolveAction, defineBindings } from "../../lib/input.js";
import { jumpMenuCursor, stepMenuCursor, announceMenuLine } from "../../lib/menu.js";
import { detailAfterMainMove, detailLine, mainWithDetail, stepDetail } from "../../lib/detail-card.js";
import { t } from "../../data/i18n/index.js";
import { MARBLES_SETTINGS } from "../config/values.js";
import { isDebugEnabled } from "../../config/debug.js";
import { SLOTS, swapRefusal, placeRefusal, throwRefusal } from "../core/marbles.js";
import { playMenuSound } from "../../view/menu-sounds.js";
import { openConfirmation } from "../../view/menus/confirmation.js";
import { INITIAL_CURSOR, cursorOn, placementStart, stepCursor, zoneOf } from "./navigation.js";
import { choiceAnswer, choiceCursorAfterAnswer, choiceFocusLine, choiceHandOptions, choiceMarbleAt, choiceStartCursor, stepChoiceCursor } from "./choice.js";
import { marbleCard } from "./card.js";
import { openPileMenu } from "./pile-screen.js";
import {
  bagDisplayOrder,
  buildSteps,
  describeChoicePrompt,
  stepsText,
  describeBag,
  describeOverview,
  describeDiscard,
  describePot,
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
  overview: { keys: ["r"], mods: [] },
  resolve: { keys: ["r"], mods: ["shift"] },
  history: { keys: ["l"], mods: [] },
  keywords: { keys: ["e"], mods: [] },
  keywordsMenu: { keys: ["e"], mods: ["shift"] },
  // Terminer un choix « jusqu'à N » (sur le triangle surtout : la main a son entrée
  // « Terminer »). Libre dans cet écran.
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
  const {
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
  } = { ...SCREEN_SOUNDS, ...io.sounds };
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
    // Une étape commence : ses sons, son texte.
    onStep: (step) => {
      playEventSounds(step.events, { handSize: step.handSize });
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
    due.forEach((cue) => playCue(cue, rules.types));
  }

  // Les sons d'un geste, d'après son journal : en file, les immédiats aussitôt.
  // `shuffleFirst` : le sac vient d'être constitué (ouverture de la partie).
  // `placeFrom` : d'où part la bille posée, sa place dans la main avant la pose.
  // `handSize` : la taille de la main juste après ces évènements, quand l'état est
  // déjà plus loin (une étape de séquence) ; par défaut, la main actuelle.
  function playEventSounds(events, { shuffleFirst = false, placeFrom, handSize } = {}) {
    const { triangle, hand } = getGame();
    // Les tailles des billes, pour la force des chocs : celles de la table de l'écran.
    const cues = eventCues(events, { triangleAfter: triangle, handAfter: hand, handSize, shuffleFirst, placeFrom }, MARBLES_SETTINGS, { types: rules.types });
    soundQueue = enqueueCues(soundQueue, cues);
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

  // L'entrée de la main sous le curseur ({ marble, turnsInHand }, et sa place dans
  // la main), ou null : pendant un choix, l'option du menu du choix.
  function handEntryUnderCursor() {
    const game = getGame();
    if (cursor.place !== "hand") return null;
    if (game.pendingChoice) {
      const option = choiceHandOptions(game.pendingChoice)[clampedHandIndex()];
      return option?.kind === "marble" ? { ...game.hand[option.index], index: option.index } : null;
    }
    const index = clampedHandIndex();
    return game.hand[index] === undefined ? null : { ...game.hand[index], index };
  }

  // La bille sous le curseur, ou undefined (emplacement vide, main vide, Terminer).
  function marbleUnderCursor() {
    const game = getGame();
    if (game.pendingChoice) return choiceMarbleAt(game, { ...cursor, handIndex: clampedHandIndex() })?.marble;
    return cursor.place === "hand" ? handEntryUnderCursor()?.marble : game.triangle[cursor.place]?.marble;
  }

  // Le curseur vient d'arriver quelque part : la voix de la bille qui s'y trouve,
  // là où elle est sur la table.
  function beaconUnderCursor() {
    const marble = marbleUnderCursor();
    if (marble === undefined) return;
    const place = cursor.place === "hand" ? handPlace(handEntryUnderCursor().index, getGame().hand.length) : slotPlace(cursor.place);
    playFocusBeacon(marble, place, rules.types);
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

  // Dit ce qu'on est en train d'écouter : l'étape (sa pause repart de zéro), la fin
  // de partie, la question d'un choix suivie du curseur (elle se perdrait sinon, Échap
  // terminant un choix « jusqu'à N »), ou le curseur.
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
      const total = handCount();
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
    const pending = getGame().pendingChoice;
    const next = pending ? stepChoiceCursor(pending, cursor, direction) : stepCursor(cursor, direction, held?.kind === "hand");
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

  // Ce qu'un geste a fait se dit, suivi, si l'action attend un choix, de sa
  // question ; le curseur s'y ouvre (sur une nouvelle question) ou y reste (un choix
  // multiple qui continue).
  function speakWithChoice(events) {
    const text = stepsText(recorded(buildSteps(events, t)));
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
      playMenuSound("block");
      announce(t("marbles.choice.not_eligible"), { assertive: true });
      return;
    }
    answerChoice(answer.action);
  }

  // T : terminer un choix « jusqu'à N » ; un choix obligatoire le refuse.
  function finishChoice() {
    if (blockedByNarration()) return;
    const pending = getGame().pendingChoice;
    if (pending === null) {
      playMenuSound("block");
      return;
    }
    if (!pending.upTo) {
      refuse("choiceRequired");
      return;
    }
    answerChoice({ type: "choose", done: true });
  }

  // La réponse part au réducteur, qui reprend l'action suspendue. Pendant une
  // résolution, la suite se dit en séquence, chaque étape avec ses sons ; ailleurs,
  // d'un bloc. Le choix fini, le curseur revient dans la main.
  function answerChoice(action) {
    const events = dispatch(action);
    if (!events) return;
    playMenuSound("select");
    if (resolution.isResolving()) {
      resolution.resume(events);
      return;
    }
    playEventSounds(events);
    if (getGame().pendingChoice === null) cursor = { ...cursor, place: "hand", handIndex: 0 };
    speakWithChoice(events);
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
    playMenuSound("select");
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

  // P : le pot et les billes perdues, d'une annonce ; Maj+P : le menu du pot, dans
  // l'ordre d'arrivée, fiches et mots-clés compris (marbles/view/pile-screen.js).
  function announcePot() {
    if (blockedDuringSequence()) return;
    announce(describePot(getGame(), t), { assertive: true });
  }

  function openPotMenu() {
    if (blockedDuringSequence()) return;
    playMenuSound("select");
    openPileMenu("marbles.pile.pot", getGame().pot, rules, getGame().tally);
  }

  // L : l'historique du tour précédent. Aussi en fin de partie : celui du dernier
  // tour. Pas pendant la séquence, qui le remplit.
  function openHistory() {
    if (blockedDuringSequence()) return;
    playMenuSound("select");
    openHistoryMenu(history.previous);
  }

  // Maj+B, mode debug : une balise à chaque place, pour régler l'espace à l'oreille.
  // Celle de la bille sous le curseur, sinon de l'argile.
  function playPlacesDemo() {
    if (blockedDuringSequence()) return;
    soundQueue = enqueueCues(soundQueue, placesDemoCues(marbleUnderCursor() ?? "clay"));
    flushSounds(0);
    announce(t("marbles.debug.places_demo"), { assertive: true });
  }

  // H : l'aide du jeu des billes, à tout moment (elle ne dévoile rien de la partie ; un
  // menu ouvert par-dessus fige la séquence, comme les autres).
  function openHelpMenu() {
    playMenuSound("select");
    openMarblesHelp(() => openKeyHelp(screen));
  }

  // E : les mots-clés de la bille sous le curseur, d'une annonce ; Maj+E : en menu.
  // Pas pendant la séquence, comme les autres annonces de consultation.
  function announceKeywords() {
    if (blockedDuringSequence()) return;
    announce(keywordsText(marbleUnderCursor(), rules, t), { assertive: true });
  }

  function openKeywords() {
    if (blockedDuringSequence()) return;
    playMenuSound("select");
    openKeywordsMenu(marbleUnderCursor(), rules);
  }

  // Maj+L, mode debug : les valeurs de partie. Pas pendant la séquence, dont l'état
  // est déjà celui d'après la résolution : ce serait la dévoiler.
  function openTally() {
    if (blockedDuringSequence()) return;
    playMenuSound("select");
    openTallyMenu(getGame().tally);
  }

  // Échap : pendant un choix « jusqu'à N », valide la sélection en cours, comme
  // Terminer ; pendant un choix obligatoire, redit la question (il ne se ferme pas, le
  // jeu ne peut continuer sans lui) ; sinon annule la sélection, ou propose de quitter.
  function back() {
    const pending = pendingChoice();
    if (isOver()) popScreen();
    else if (pending?.upTo) answerChoice({ type: "choose", done: true });
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
    turnInfo: announceTurn,
    bag: announceBag,
    discard: announceDiscard,
    bagMenu: openBagMenu,
    discardMenu: openDiscardMenu,
    pot: announcePot,
    potMenu: openPotMenu,
    overview: announceOverview,
    resolve: resolveKey,
    history: openHistory,
    keywords: announceKeywords,
    keywordsMenu: openKeywords,
    finish: finishChoice,
    help: openHelpMenu,
    placesDemo: playPlacesDemo,
    tally: openTally,
  };

  // Première ouverture : la musique, le sac qu'on brasse et la pioche du tour 1.
  // Une partie déjà piochée (un état construit par la console de test,
  // window.debugStartMarbles) s'ouvre sans pioche, sur sa phase de jeu ou son choix
  // en attente. Ensuite (retour d'une confirmation, de l'aide), l'écran redit où
  // l'on en est.
  function start() {
    started = true;
    preloadMarblesAudio();
    // Après le préchargement : la réverbération a besoin du contexte audio.
    openTableReverb();
    startMarblesMusic();
    const drawing = getGame().stage === "draw" && getGame().pendingChoice === null;
    const events = drawing ? dispatch({ type: "draw" }) : [];
    playEventSounds(events, { shuffleFirst: true });
    const pending = getGame().pendingChoice;
    if (pending !== null) cursor = choiceStartCursor(pending, cursor);
    // Un état construit ouvert sur un choix qui suspend une résolution : la suite se
    // dira en séquence, puis le tour suivant se piochera, comme si l'écran l'avait
    // lancée.
    if (pending?.resume.action.type === "resolve") resolution.adopt(getGame().turn);
    const next = pending !== null ? describeChoicePrompt(pending, t) : isOver() ? "" : focusLine();
    speak(withOverHint(`${t("marbles.intro")} ${stepsText(recorded(buildSteps(events, t)))} ${next}`));
  }

  // Le temps réel reçu : la séquence (une étape au plus), puis les billes déjà en
  // route avant que d'autres ne partent (un roulement qui part à ce battement
  // commence au début de son trajet), puis les sons dus.
  function advanceRealTime(deltaMs) {
    resolution.advance(deltaMs);
    advanceRolls(deltaMs);
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
