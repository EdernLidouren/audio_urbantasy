// Jeu des billes : l'ÉCRAN de jeu. Aucune règle ici : tout passe par le
// réducteur (core/marbles.js), et tout ce qui se dit par
// view/marbles/narration.js. La partie appartient à main.js (getGame/setGame,
// comme la session du jeu principal) ; ne restent ici que le curseur, la
// sélection et les étapes de résolution à dire, le temps d'un écran.
//
// PRENDRE ET POSER, un seul geste (Entrée) : sur une bille de la main, la
// sélectionne ; sur un emplacement ensuite, ouvre la confirmation de la pose, qui
// dit ce qu'elle produirait (prévision, core/marbles-forecast.js).
// Sur un emplacement sans sélection, le prend pour l'échange ; sur un second
// emplacement ensuite, échange les deux. Refaire Entrée sur la sélection, ou
// Échap, l'annule.
//
// VUE D'ENSEMBLE (R) : la prévision du tour puis chaque emplacement, d'un bloc.
//
// RÉSOLUTION (Maj+R) : la simulation résout tout d'un coup ; ce qui suit n'est
// que la présentation, une file d'étapes (view/marbles/sequence.js) qui se dit
// avec une pause après chacune, avancée par onFrame. Entrée la passe et amène au
// tour suivant (ou à la fin de partie), sans rien changer à l'état. Tant qu'elle
// dure, tout le reste est refusé d'un son de blocage, sans parole pour ne pas la
// couper : l'état est déjà celui d'après la résolution, et le dévoilerait.
//
// FICHES : le curseur principal annonce court, Ctrl+haut et Ctrl+bas parcourent le
// détail de la bille sous lui (view/marbles/card.js, lib/detail-card.js). Maj+S et
// Maj+D ouvrent les menus du sac et de la défausse (view/marbles/pile-screen.js).

import { announce } from "../../lib/announce.js";
import { popScreen } from "../../lib/screens.js";
import { resolveAction, defineBindings } from "../../lib/input.js";
import { jumpMenuCursor, stepMenuCursor, announceMenuLine } from "../../lib/menu.js";
import { detailAfterMainMove, detailLine, mainWithDetail, stepDetail } from "../../lib/detail-card.js";
import { t } from "../../data/i18n/index.js";
import { MARBLES_SETTINGS } from "../../config/marbles-values.js";
import { marblesReduce, swapRefusal, placeRefusal } from "../../core/marbles.js";
import { playMenuSound } from "../menu-sounds.js";
import { openConfirmation } from "../menus/confirmation.js";
import { INITIAL_CURSOR, stepCursor, zoneOf } from "./navigation.js";
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
  withHeldMark,
} from "./narration.js";
import { playMarbleEventSounds } from "./sounds.js";
import { advanceSequence, restartPause, skipSequence, startSequence } from "./sequence.js";

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
});

export function makeMarblesScreen(getGame, setGame) {
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

  const isNarrating = () => sequence !== null;
  const isOver = () => getGame().stage === "over" && !isNarrating();

  function speak(text) {
    spoken = text;
    announce(text, { assertive: true });
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
    const result = marblesReduce(getGame(), action);
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
    if (cursor.place === "hand") {
      const index = clampedHandIndex();
      const line = describeHandFocus(game, index, t);
      return held?.kind === "hand" && held.index === index ? withHeldMark(line, t) : line;
    }
    if (held?.kind === "hand") return describeSlotForPlacement(game, cursor.place, t);
    const line = describeSlotFocus(game, cursor.place, t);
    return held?.kind === "slot" && held.slot === cursor.place ? `${line} ${t("marbles.slot_line.held")}` : line;
  }

  // La fiche de la bille sous le curseur, avec ce qu'on entendrait à sa position
  // par défaut ; null sur un emplacement vide ou une main vide.
  function currentCard() {
    const game = getGame();
    const marble = cursor.place === "hand" ? game.hand[clampedHandIndex()] : game.triangle[cursor.place]?.marble;
    return marble === undefined ? null : marbleCard(marble, focusLine(), t);
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
      const { index, boundary } = stepMenuCursor(clampedHandIndex(), direction === "left" ? -1 : 1, total);
      cursor = { ...cursor, handIndex: index };
      announceFocus(boundary);
      return;
    }
    const next = stepCursor(cursor, direction);
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

  function releaseSelection() {
    held = null;
    playMenuSound("cancel");
    announce(t("marbles.take.released"), { assertive: true });
  }

  // Le son d'une pose est celui de la confirmation qui vient de la lancer.
  function performPlace(handIndex, slot) {
    const events = dispatch({ type: "place", handIndex, slot });
    if (!events) return;
    held = null;
    cursor = { ...cursor, handIndex: clampedHandIndex() };
    resetDetailAfterMove();
    playMarbleEventSounds(events);
    speak(stepsText(buildSteps(events, t)));
  }

  function performSwap(a, b) {
    const events = dispatch({ type: "swap", a, b });
    held = null;
    if (!events) return;
    resetDetailAfterMove();
    playMenuSound("select");
    playMarbleEventSounds(events);
    speak(stepsText(buildSteps(events, t)));
  }

  function activateHand() {
    const game = getGame();
    if (game.hand.length === 0) {
      playMenuSound("block");
      announceFocus();
      return;
    }
    const index = clampedHandIndex();
    if (held?.kind === "hand" && held.index === index) {
      releaseSelection();
      return;
    }
    held = { kind: "hand", index };
    playMenuSound("select");
    announce(t("marbles.take.hand", { name: marbleName(game.hand[index], t) }), { assertive: true });
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
      lines: placementLines(game, handIndex, slot, t),
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
    playMarbleEventSounds(step.events);
    speak(withOverHint(step.text));
  }

  function activate() {
    if (isNarrating()) follow(skipSequence(sequence));
    else if (isOver()) popScreen();
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
    const steps = resolutionSteps(turn, [...resolved, ...drawn], t);
    // La première fois, comment la passer.
    if (turn === 1) steps[0] = { ...steps[0], text: `${steps[0].text} ${t("marbles.resolution.hint")}` };
    follow(startSequence(steps));
  }

  function resolveKey() {
    if (blockedByNarration()) return;
    startResolution();
  }

  // R : la vue d'ensemble, d'un bloc et sans pause.
  function announceOverview() {
    if (blockedByNarration()) return;
    announce(describeOverview(getGame(), t), { assertive: true });
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
    openPileMenu("marbles.pile.bag", bagDisplayOrder(getGame().bag, t));
  }

  // Dans l'ordre d'arrivée : de la plus ancienne à la plus récente.
  function openDiscardMenu() {
    if (blockedDuringSequence()) return;
    playMenuSound("select");
    openPileMenu("marbles.pile.discard", getGame().discard);
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
  };

  // Première ouverture : la pioche du tour 1. Ensuite (retour d'une
  // confirmation, de l'aide), l'écran redit où l'on en est.
  function start() {
    started = true;
    const events = dispatch({ type: "draw" });
    playMarbleEventSounds(events);
    speak(withOverHint(`${t("marbles.intro")} ${stepsText(buildSteps(events, t))} ${isOver() ? "" : focusLine()}`));
  }

  return {
    helpSections: () => [{ id: "marbles" }],
    onEnter() {
      if (started) reannounce();
      else start();
    },
    onExit() {
      setGame(null);
    },
    // Le temps réel de la séquence : seul l'écran du sommet le reçoit, un menu
    // ouvert par-dessus (aide, abandon) la fige donc.
    onFrame(deltaMs) {
      if (isNarrating()) follow(advanceSequence(sequence, deltaMs));
    },
    onKeyDown(event) {
      const action = resolveAction(MARBLES_BINDINGS, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    },
  };
}
