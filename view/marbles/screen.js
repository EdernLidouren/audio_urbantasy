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
// RÉSOLUTION : au rythme du joueur (Entrée, étape suivante), jamais minutée. On
// ignore à quelle vitesse parle son lecteur d'écran : une étape minutée serait
// coupée ou le ferait attendre. R dit tout le reste d'un coup, sans les sons.
// Tant qu'il reste des étapes, le déplacement et les touches qui disent l'état
// sont refusés : l'état est déjà celui d'après la résolution, et les dévoilerait.
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
  stepsText,
  describeBag,
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
  resolve: { keys: ["r"], mods: [] },
});

export function makeMarblesScreen(getGame, setGame) {
  let cursor = INITIAL_CURSOR;
  // Le curseur secondaire, dans la fiche de ce qui est sous le curseur principal.
  let detail = 0;
  // Ce qui est sélectionné : null, { kind: "hand", index } ou { kind: "slot", slot }.
  let held = null;
  // Étapes de résolution qui restent à dire, et la dernière dite (Retour arrière).
  let pendingSteps = [];
  let spoken = "";
  let started = false;

  const isNarrating = () => pendingSteps.length > 0;
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

  // Dit ce qu'on est en train d'écouter : l'étape, la fin de partie ou le
  // curseur.
  function reannounce() {
    if (isNarrating() || isOver()) speak(spoken);
    else announceFocus();
  }

  // Tant que la résolution se dit, ou la partie finie, le curseur ne bouge pas :
  // on redit ce qu'on écoutait. Rend vrai si le geste s'arrête là.
  function blockedByNarration() {
    if (!isNarrating() && !isOver()) return false;
    playMenuSound("block");
    speak(spoken);
    return true;
  }

  // Pendant les étapes de résolution, l'état est déjà celui d'après : ce qui le
  // dirait attend. Rend vrai si le geste s'arrête là.
  function blockedDuringSteps() {
    if (!isNarrating()) return false;
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

  function nextStep() {
    const step = pendingSteps.shift();
    playMarbleEventSounds(step.events);
    speak(withOverHint(step.text));
  }

  function activate() {
    if (isNarrating()) nextStep();
    else if (isOver()) popScreen();
    else if (cursor.place === "hand") activateHand();
    else activateSlot();
  }

  // Résolution du tour, et pioche du suivant dans la foulée : à la dernière
  // étape, le joueur a sa nouvelle main. Le curseur revient sur la main.
  function startResolution() {
    const firstTurn = getGame().turn === 1;
    const resolved = dispatch({ type: "resolve" });
    if (!resolved) return;
    const drawn = getGame().stage === "draw" ? dispatch({ type: "draw" }) : [];
    held = null;
    cursor = { ...cursor, place: "hand", handIndex: 0 };
    detail = 0;
    pendingSteps = buildSteps([...resolved, ...drawn], t);
    // La première fois, le mode d'emploi de la résolution.
    if (firstTurn) pendingSteps[0].text = `${t("marbles.resolution.hint")} ${pendingSteps[0].text}`;
    nextStep();
  }

  function resolveKey() {
    if (isOver()) {
      playMenuSound("block");
      speak(spoken);
    } else if (isNarrating()) {
      const rest = stepsText(pendingSteps);
      pendingSteps = [];
      speak(withOverHint(rest));
    } else {
      startResolution();
    }
  }

  function announceTurn() {
    if (blockedDuringSteps()) return;
    const game = getGame();
    announce(describeTurn(game, swapRefusal(game) === null, t), { assertive: true });
  }

  function announceBag() {
    if (blockedDuringSteps()) return;
    announce(describeBag(getGame(), t), { assertive: true });
  }

  function announceDiscard() {
    if (blockedDuringSteps()) return;
    announce(describeDiscard(getGame(), t), { assertive: true });
  }

  function openBagMenu() {
    if (blockedDuringSteps()) return;
    playMenuSound("select");
    openPileMenu("marbles.pile.bag", bagDisplayOrder(getGame().bag, t));
  }

  // Dans l'ordre d'arrivée : de la plus ancienne à la plus récente.
  function openDiscardMenu() {
    if (blockedDuringSteps()) return;
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
    onKeyDown(event) {
      const action = resolveAction(MARBLES_BINDINGS, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    },
  };
}
