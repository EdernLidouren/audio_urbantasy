// Onglet CAPACITÉS de l'inventaire (touche "m", voir la coquille à onglets,
// view/menus/inventory-menu.js) : une liste simple, sur le patron de
// l'onglet Collections — « améliorations, 1 sur 3 », « émotes, 2 sur 2 » —
// dont chaque ligne ouvre son menu par-dessus l'onglet. En lecture seule :
// ce que le joueur a débloqué ou appris, lu dans l'ÉTAT RÉEL de la partie,
// jamais via une condition (court-circuit debug, voir
// buildImprovementsMenuScreen). L'onglet Collections vit à part
// (./collections-tab.js).

import { t } from "../../../data/i18n/index.js";
import { pushScreen, composeHook } from "../../../lib/screens.js";
import { makeMenuScreen } from "../../../lib/menu.js";
import { announce, stripTrailingPeriod } from "../../../lib/announce.js";
import { randomRate } from "../../../lib/audio.js";
import { TUNING_DEFAULTS } from "../../../config/tuning.js";
import { IMPROVEMENT_REGISTRY, orderedImprovementIds } from "../../../core/improvements.js";
import { EMOTE_REGISTRY, orderedEmoteIds } from "../../../core/emotes.js";
import { createSoundPreview } from "./sound-preview.js";

// Ligne d'UNE amélioration. Débloquée : "{order} - {nom} : {description}",
// Espace/Entrée la réannonce. Non débloquée : "{order} - Inconnue" — le
// numéro révèle qu'un pouvoir existe sans dire lequel ; l'activer ne fait
// rien de plus, et Ctrl+haut/bas la saute (placeholder, voir lib/menu.js).
// Aucune action "utiliser" : les pouvoirs s'activent ailleurs (ex. "p"
// pour la perception).
function improvementEntry(id, owned) {
  const props = IMPROVEMENT_REGISTRY[id];
  if (!owned) {
    return { label: "improvements.entry.unknown", labelParams: { order: props.order }, placeholder: true };
  }
  const labelParams = {
    order: props.order,
    name: t(props.labelKey),
    description: stripTrailingPeriod(t(props.descriptionKey)),
  };
  return {
    label: "improvements.entry.known",
    labelParams,
    onActivate: () => announce(t("improvements.entry.known", labelParams), { assertive: true }),
  };
}

// Combien d'ids d'une liste figurent dans un fait SPARSE { [id]: true }.
function countKnown(ids, known) {
  return ids.filter((id) => known[id]).length;
}

// Menu des améliorations : toutes celles du registre, dans leur `order`
// déclaré. "Débloquée" se lit dans l'ÉTAT RÉEL (session.improvements),
// JAMAIS via la condition hasImprovement : en mode debug, celle-ci répond
// toujours vrai (court-circuit, voir core/presence.js), alors que ce menu
// doit montrer ce que le joueur possède vraiment — sinon impossible de
// vérifier son état en debug.
function buildImprovementsMenuScreen(getSession) {
  const owned = getSession().improvements || {};
  const ids = orderedImprovementIds();
  const menu = {
    title: "improvements.title",
    titleParams: { unlocked: countKnown(ids, owned), total: ids.length },
    closable: true,
    entries: ids.map((id) => improvementEntry(id, Boolean(owned[id]))),
  };
  return makeMenuScreen(menu, t);
}

// Ligne d'UNE émote, sur le patron des améliorations : connue, "{order} -
// {nom} : {description}", avec la mention du raccourci pour celle de la
// touche "e" ; Entrée JOUE son son (une écoute, voir ./sound-preview.js),
// sans rien changer au raccourci, qui se choisit avec Maj+E. Inconnue,
// "{order} - Inconnue", sautée par Ctrl+haut/bas.
function emoteEntry(id, known, isShortcut, preview) {
  const props = EMOTE_REGISTRY[id];
  if (!known) {
    return { label: "emotes.tab.entry.unknown", labelParams: { order: props.order }, placeholder: true };
  }
  return {
    label: isShortcut ? "emotes.tab.entry.shortcut" : "emotes.tab.entry.known",
    labelParams: {
      order: props.order,
      name: t(props.nameKey),
      description: stripTrailingPeriod(t(props.descriptionKey)),
    },
    // Même variation de hauteur qu'en jeu (view/audio/footsteps.js), mais
    // centrée et au volume de l'interface : une écoute, pas un geste.
    onActivate: () => preview.play(props.soundPath, { rate: randomRate(TUNING_DEFAULTS.emotePitchVariation) }),
  };
}

// Menu des émotes : toutes celles du registre, dans leur `order`. "Connue"
// se lit dans l'ÉTAT RÉEL (session.emotes), jamais via la condition
// knowsEmote, qui répond toujours vrai en mode debug — même raison que les
// améliorations. L'écoute en cours se coupe à la fermeture du menu.
function buildEmotesMenuScreen(getSession) {
  const session = getSession();
  const known = session.emotes || {};
  const ids = orderedEmoteIds();
  const preview = createSoundPreview();
  const menu = {
    title: "emotes.tab.title",
    titleParams: { known: countKnown(ids, known), total: ids.length },
    closable: true,
    entries: ids.map((id) => emoteEntry(id, Boolean(known[id]), session.emoteShortcut === id, preview)),
  };
  const screen = makeMenuScreen(menu, t);
  return { ...screen, onExit: composeHook(screen.onExit, preview.stop) };
}

// Onglet Capacités : une ligne par menu, avec sa progression. Ouvrir un
// menu note sa ligne (setReturnCursor, voir la coquille) : Échap y ramène
// le curseur, pas sur la première ligne.
export function buildCapacitiesTabScreen(getSession, setReturnCursor, cursor) {
  const session = getSession();
  const improvementIds = orderedImprovementIds();
  const emoteIds = orderedEmoteIds();
  const lines = [
    {
      nameKey: "capacities.improvements.name",
      known: countKnown(improvementIds, session.improvements || {}),
      total: improvementIds.length,
      build: buildImprovementsMenuScreen,
    },
    {
      nameKey: "capacities.emotes.name",
      known: countKnown(emoteIds, session.emotes || {}),
      total: emoteIds.length,
      build: buildEmotesMenuScreen,
    },
  ];
  const menu = {
    title: "capacities.title",
    cursor,
    closable: true,
    entries: lines.map(({ nameKey, known, total, build }, index) => ({
      label: "capacities.entry",
      labelParams: { name: t(nameKey), known, total },
      onActivate: () => {
        setReturnCursor(index);
        pushScreen(build(getSession));
      },
    })),
  };
  return makeMenuScreen(menu, t);
}
