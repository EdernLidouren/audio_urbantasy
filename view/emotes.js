// ÉMOTES DU JOUEUR : Maj+E choisit l'émote du RACCOURCI dans un menu des
// émotes connues, E la joue sur le joueur (voir core/emotes.js pour le
// registre, la connaissance et le raccourci, view/audio/footsteps.js/
// playEmoteSound pour le rendu). Le monde y réagit par les triggers
// d'émote de ses entités : le core les résout (core/triggers.js/
// applyEmoteTriggers), la vue ne fait que rejouer leur rendu.

import { pushScreen, popScreen } from "../lib/screens.js";
import { makeMenuScreen } from "../lib/menu.js";
import { announce } from "../lib/announce.js";
import { t, nameRef } from "../data/i18n/index.js";
import { EMOTE_REGISTRY, orderedEmoteIds, setEmoteShortcut } from "../core/emotes.js";
import { evaluateCondition, presenceContextOf } from "../core/presence.js";
import { applyEmoteTriggers } from "../core/triggers.js";
import { withPausedBeacons } from "./paused-beacons.js";
import { runRenderEffects } from "./effect-runner.js";
import { TUNING_DEFAULTS } from "../config/tuning-values.js";

// `getWorldView` : la vue du monde COURANTE, relue à chaque usage (voir
// view/world-travel.js/current) — un voyage la remplace.
export function createEmotes({ getSession, setSession, getWorldView }) {
  // Délai minimal entre deux émotes (emoteCooldownMs), sur l'horloge MURALE
  // comme la perception (view/perception-toggle.js).
  let cooldownUntil = 0;

  // Émotes connues, dans l'ordre du registre — lues par la condition
  // knowsEmote, la MÊME qu'un script déclarerait : en mode debug, toutes.
  function knownEmoteIds() {
    const context = presenceContextOf(getSession());
    return orderedEmoteIds().filter((id) => evaluateCondition({ type: "knowsEmote", id }, context));
  }

  // Le raccourci, s'il vise une émote connue ; sinon null (aucun, ou une
  // émote oubliée depuis, voir core/emotes.js/setEmoteShortcut).
  function usableShortcut() {
    const id = getSession().emoteShortcut;
    return id && knownEmoteIds().includes(id) ? id : null;
  }

  // Les touches ont-elles un effet ? Lu aussi par l'aide des touches
  // (view/city-screen.js) : elles n'y figurent qu'avec au moins une émote.
  function isAvailable() {
    return knownEmoteIds().length > 0;
  }

  // Pendant le délai : rien du tout, comme une touche non attribuée — ni
  // son, ni réaction. Le son d'abord, puis les réactions du monde (comme
  // view/game-clock.js/advance pour les triggers horaires) : un oiseau
  // effrayé s'envole au tick suivant, après le claquement.
  function perform(id) {
    const now = performance.now();
    if (now < cooldownUntil) return;
    cooldownUntil = now + TUNING_DEFAULTS.emoteCooldownMs;
    getWorldView()?.playEmoteSound(EMOTE_REGISTRY[id].soundPath);
    const before = getSession();
    const { session, fired } = applyEmoteTriggers(before, id, before.player.x);
    setSession(session);
    for (const { entity, effects } of fired) runRenderEffects(entity, effects);
  }

  // Le choix ferme le menu PUIS s'annonce : rien ne vient couvrir
  // l'annonce. L'émote n'est pas jouée.
  function chooseShortcut(id) {
    popScreen();
    setSession(setEmoteShortcut(getSession(), id));
    announce(t("emote.shortcutSet", { emote: nameRef(EMOTE_REGISTRY[id].nameKey) }), { assertive: true });
  }

  // Maj+E (et E sans raccourci) : « nom : description » par émote, ouvert
  // sur celle du raccourci.
  function openMenu() {
    const ids = knownEmoteIds();
    if (ids.length === 0) return;
    const menu = {
      title: "menu.emotes.title",
      closable: true,
      cursor: Math.max(0, ids.indexOf(usableShortcut())),
      entries: ids.map((id) => ({
        label: EMOTE_REGISTRY[id].nameKey,
        descriptionKey: EMOTE_REGISTRY[id].descriptionKey,
        onActivate: () => chooseShortcut(id),
      })),
    };
    pushScreen(withPausedBeacons(makeMenuScreen(menu, t), getWorldView));
  }

  // E : l'émote du raccourci, sinon le choix.
  function performShortcut() {
    const id = usableShortcut();
    if (id) perform(id);
    else openMenu();
  }

  return { performShortcut, openMenu, isAvailable };
}
