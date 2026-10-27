// ÉMOTES DU JOUEUR (touche "e") : un menu des émotes connues, puis le son de
// celle choisie, joué sur le joueur (voir core/emotes.js pour le registre et
// la connaissance, view/audio/footsteps.js/playEmoteSound pour le rendu).
// Pour l'instant une émote ne fait que sonner : rien dans le monde n'y
// réagit encore, d'où aucun appel au core ici en dehors de la lecture.

import { pushScreen, popScreen } from "../lib/screens.js";
import { makeMenuScreen } from "../lib/menu.js";
import { t } from "../data/i18n/index.js";
import { EMOTE_REGISTRY, orderedEmoteIds } from "../core/emotes.js";
import { evaluateCondition, presenceContextOf } from "../core/presence.js";
import { withPausedBeacons } from "./paused-beacons.js";
import { TUNING_DEFAULTS } from "../config/tuning-values.js";

// `getWorldView` : la vue du monde COURANTE, relue à chaque usage (voir
// view/world-travel.js/current) — un voyage la remplace.
export function createEmotes({ getSession, getWorldView }) {
  // Délai minimal entre deux émotes (emoteCooldownMs), sur l'horloge MURALE
  // comme la perception (view/perception-toggle.js) : il court aussi
  // pendant que le menu est ouvert.
  let cooldownUntil = 0;
  // Dernière émote faite : le menu se rouvre dessus, Entrée la refait.
  // Confort de navigation, comme le curseur d'un menu, jamais un état de
  // partie.
  let lastEmoteId = null;

  // Émotes connues, dans l'ordre du registre — lues par la condition
  // knowsEmote, la MÊME qu'un script déclarerait : en mode debug, toutes.
  function knownEmoteIds() {
    const context = presenceContextOf(getSession());
    return orderedEmoteIds().filter((id) => evaluateCondition({ type: "knowsEmote", id }, context));
  }

  // La touche a-t-elle un effet ? Lu aussi par l'aide des touches
  // (view/city-screen.js) : la touche n'y figure qu'avec au moins une émote.
  function isAvailable() {
    return knownEmoteIds().length > 0;
  }

  // Pendant le délai : rien du tout, comme une touche non attribuée.
  function perform(id) {
    const now = performance.now();
    if (now < cooldownUntil) return;
    cooldownUntil = now + TUNING_DEFAULTS.emoteCooldownMs;
    lastEmoteId = id;
    getWorldView()?.playEmoteSound(EMOTE_REGISTRY[id].soundPath);
  }

  // Le menu se ferme AVANT le son : les balises reprennent, et l'émote
  // sonne dans la scène vivante.
  function openMenu() {
    const ids = knownEmoteIds();
    if (ids.length === 0) return;
    const menu = {
      title: "menu.emotes.title",
      closable: true,
      cursor: Math.max(0, ids.indexOf(lastEmoteId)),
      entries: ids.map((id) => ({
        label: EMOTE_REGISTRY[id].nameKey,
        onActivate: () => {
          popScreen();
          perform(id);
        },
      })),
    };
    pushScreen(withPausedBeacons(makeMenuScreen(menu, t), getWorldView));
  }

  return { openMenu, isAvailable };
}
