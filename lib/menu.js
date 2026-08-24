// Brique portable : construit un écran de menu (consommable par la pile
// générique screens.js) à partir d'un menu littéral. Aucune connaissance
// d'aucun jeu ni d'aucune locale : la fonction de traduction (t) est reçue
// en paramètre, jamais importée depuis un module i18n concret — c'est ce qui
// permet de déposer ce fichier tel quel dans un autre projet. Même principe
// pour les préférences (getPref/setPref) : reçues via configureMenuPreferences
// (voir plus bas), jamais un store concret importé ici (voir
// config/preferences.js côté Templeton).
//
// Modèle :
//   menu   = { title, entries, closable, cursor }
//   entrée = { kind?, label, onActivate }                          (action, kind par défaut)
//          | { kind:"slider", labelKey, prefKey, min, max,
//              step?, bigStep?, unit?, default?, format?, onChange? } (slider)
//          | { kind:"toggle", labelKey, prefKey, default, onChange? } (bascule oui/non)
// title, entry.label et entry.labelKey sont des CLÉS de traduction, jamais
// des chaînes déjà résolues.
//
// "action" (kind omis ou "action") : Entrée/Espace -> onActivate. Inchangé
// depuis avant l'introduction des sliders.
// "slider" : valeur numérique bornée [min,max], portée par une préférence
// (prefKey, lue/écrite via getPref/setPref). Gauche/droite -/+ step, Ctrl+
// gauche/droite -/+ bigStep.
// "toggle" : valeur booléenne (prefKey). Gauche = non/false, droite =
// oui/true — pas de maintien (rien à répéter sur une valeur à 2 états).
// Sur un slider ou un toggle, Entrée/Espace ne fait rien (ré-annonce juste
// la ligne). onChange(value), optionnel, est appelé après chaque ajustement
// — pour qu'un effet déjà en cours (ex. un son qui joue) se mette à jour
// tout de suite, sans attendre un futur tick qui ne viendra pas forcément
// (un menu au sommet de la pile arrête le tick de l'écran dessous).
//
// Maintien de gauche/droite sur un slider : PAS basé sur event.repeat (les
// répétitions clavier n'atteignent jamais onKeyDown, voir lib/input.js), le
// même modèle que le déplacement du joueur — isHeld() relu à chaque tick
// (le loop tourne en permanence, peu importe l'écran actif). Le premier
// appui ajuste immédiatement (chemin onKeyDown) ; au-delà, un ajustement
// supplémentaire toutes les SLIDER_REPEAT_INTERVAL_MS tant que la touche
// reste tenue, Ctrl relu à chaque déclenchement (donc son état peut changer
// en cours de maintien, sans figer step/bigStep au premier appui).
//
// Cyclage haut/bas (préférence "menuCycling") : à la première entrée,
// flèche haut (ou dernière entrée, flèche bas) déclenche un son de limite
// (playBoundarySound, pas encore assigné) puis, si le cyclage est permis,
// le curseur boucle vers l'autre bout ; sinon il reste sur place. Dans les
// deux cas, l'annonce de l'entrée résultante est préfixée d'une étoile
// ("* ...") si la préférence "menuStarPrefix" l'autorise — marqueur textuel
// pour les utilisateurs braille ou sans son, qui doivent pouvoir détecter
// ce cas sans dépendre du son.
//
// Home/End : vont directement à la première/dernière entrée et l'annoncent,
// étoilée si le curseur n'a PAS bougé (déjà sur cette entrée) — fonctionne
// même avec une seule entrée (dans ce cas, toujours "inchangé").
//
// Retour arrière (Backspace) : annonce le titre de l'écran, puis (ici,
// toujours vrai — ce module ne produit que des écrans-menus) l'entrée
// actuellement sélectionnée. Réutilise exactement le format de
// buildOpenAnnouncement.
//
// reannounceActiveMenuEntry() : ré-annonce la ligne de l'entrée courante de
// l'écran-menu actuellement au sommet de la pile — utile à un appelant
// EXTÉRIEUR (ex. après un import de préférences asynchrone, voir
// view/menus/audio-menu.js) qui n'a pas de référence directe vers l'écran.
// Aucun état parallèle : la pile (screens.js, activeScreen()) est la SEULE
// source de vérité sur "quel écran est actif" ; un écran-menu se reconnaît
// via son marqueur isMenuScreen.

import { announce } from "./announce.js";
import { popScreen, activeScreen } from "./screens.js";
import { isHeld } from "./input.js";

export function reannounceActiveMenuEntry() {
  const screen = activeScreen();
  if (screen && screen.isMenuScreen) screen.reannounceCurrentEntry();
}

// Préférences de comportement des menus (cyclage, étoile, suffixe de
// position) : injectées UNE FOIS depuis le point de composition (main.js),
// pas par appel de makeMenuScreen — elles sont globales à l'application,
// jamais propres à un menu particulier, donc inutile de les repasser à
// chaque construction d'écran (contrairement à getPref/setPref pour un
// slider/toggle CONCRET, qui restent portés par les préférences DU menu,
// mais viennent de la même source unique). Repli sûr tant qu'aucune
// configuration n'a eu lieu : lecture -> fallback fourni, écriture -> no-op.
let menuGetPref = (key, fallback) => fallback;
let menuSetPref = () => {};

export function configureMenuPreferences({ getPref, setPref }) {
  menuGetPref = getPref;
  menuSetPref = setPref;
}

const DEFAULT_STEP = 1;
const DEFAULT_BIG_STEP = 5;
// Cadence du maintien sur un slider (pas un invariant structurel, juste un
// rythme raisonnable pour un ajustement répété) : en dur ici, comme
// DEFAULT_STEP/DEFAULT_BIG_STEP — ce fichier ne doit importer aucune valeur
// de tuning spécifique à Templeton (voir CLAUDE.md, lib/ vs specific).
const SLIDER_REPEAT_INTERVAL_MS = 150;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Son de limite (cyclage refusé, ou effectué) : prévu, pas encore assigné —
// aucun fichier ni canal audio choisi pour l'instant (voir lib/audio.js
// pour la primitive à brancher le jour venu, ex. playOneShot). Le
// comportement (curseur, annonce, étoile) fonctionne déjà indépendamment de
// ce son ; cyclingHappened distingue les deux cas pour un futur son propre
// à chacun.
function playBoundarySound(cyclingHappened) {
  // TODO : jouer un son une fois désigné.
}

export function makeMenuScreen(menu, t) {
  // cursor par défaut à 0 si absent.
  if (menu.cursor === undefined || menu.cursor === null) {
    menu.cursor = 0;
  }

  function currentEntry() {
    return menu.entries[menu.cursor];
  }

  function isSlider(entry) {
    return entry.kind === "slider";
  }
  function isToggle(entry) {
    return entry.kind === "toggle";
  }
  function isAdjustable(entry) {
    return isSlider(entry) || isToggle(entry);
  }

  // Valeur courante d'un slider : préférence si posée, sinon entry.default
  // (ou min si default absent), toujours bornée [min,max] — protège aussi
  // contre une préférence posée hors bornes par un autre chemin.
  function sliderValue(entry) {
    const fallback = entry.default !== undefined ? entry.default : entry.min;
    return clamp(menuGetPref(entry.prefKey, fallback), entry.min, entry.max);
  }

  function toggleValue(entry) {
    return !!menuGetPref(entry.prefKey, entry.default);
  }

  // Formatage centralisé : entry.format(value) si fourni, sinon
  // "<valeur><unit>". Un seul endroit à changer pour changer l'affichage
  // (ex. arrondi, unité différente) sans toucher à la logique d'ajustement.
  function formatSliderValue(entry, value) {
    if (typeof entry.format === "function") return entry.format(value);
    return `${value}${entry.unit || ""}`;
  }

  function formatToggleValue(value) {
    return value ? t("menu.toggle.yes") : t("menu.toggle.no");
  }

  function formatEntryValue(entry) {
    return isToggle(entry) ? formatToggleValue(toggleValue(entry)) : formatSliderValue(entry, sliderValue(entry));
  }

  // "<label> - <valeur>" — la ligne entière d'un slider/toggle, utilisée à
  // l'arrivée dessus (navigation, ouverture du menu, Entrée/Espace).
  function buildValueLine(entry) {
    return `${t(entry.labelKey)} - ${formatEntryValue(entry)}`;
  }

  // Suffixe de position ("x sur y"), désactivable via la préférence
  // "menuIndexSuffix" — chaîne vide si désactivé, jamais un fragment
  // orphelin ("Nouvelle partie. " avec rien derrière).
  function formatPosition(index, total) {
    if (!menuGetPref("menuIndexSuffix", true)) return "";
    return t("menu.position", { index: index + 1, total });
  }

  // "<label>[. position]" — une entrée action, avec ou sans suffixe.
  function actionLine(entry) {
    const position = formatPosition(menu.cursor, menu.entries.length);
    return position ? `${t(entry.label)}. ${position}` : t(entry.label);
  }

  // "titre. entrée[. position]" (action) ou "titre. <ligne valeur>"
  // (slider/toggle) — utilisé à l'ouverture, au retour depuis un sous-menu,
  // et par Retour arrière (Backspace).
  function buildOpenAnnouncement() {
    const entry = currentEntry();
    if (isAdjustable(entry)) {
      return `${t(menu.title)}. ${buildValueLine(entry)}`;
    }
    return `${t(menu.title)}. ${actionLine(entry)}`;
  }

  // "entrée[. position]" (action) ou "<ligne valeur>" (slider/toggle) —
  // sans le titre, utilisé au déplacement du curseur.
  function buildMoveAnnouncement() {
    const entry = currentEntry();
    return isAdjustable(entry) ? buildValueLine(entry) : actionLine(entry);
  }

  // Étoile en tête d'annonce ("* ..."), désactivable via la préférence
  // "menuStarPrefix" — marqueur pour les utilisateurs braille/sans son
  // (cyclage refusé ou bouclé, Home/End sans changement de curseur).
  // starred=false : jamais d'étoile, quelle que soit la préférence.
  function announceMaybeStarred(text, starred) {
    const prefixed = starred && menuGetPref("menuStarPrefix", true) ? `* ${text}` : text;
    announce(prefixed, { assertive: true });
  }

  function moveCursor(delta) {
    const total = menu.entries.length;
    if (total === 0) return;

    const atStart = menu.cursor === 0 && delta < 0;
    const atEnd = menu.cursor === total - 1 && delta > 0;

    if (atStart || atEnd) {
      const cyclingAllowed = menuGetPref("menuCycling", false);
      playBoundarySound(cyclingAllowed);
      if (cyclingAllowed) {
        menu.cursor = (menu.cursor + delta + total) % total;
      }
      // Cyclage refusé : curseur inchangé, on ré-annonce l'entrée courante
      // — étoilée dans les deux cas (bouclé ou refusé), l'utilisateur doit
      // savoir qu'il est à une limite.
      announceMaybeStarred(buildMoveAnnouncement(), true);
      return;
    }

    menu.cursor = menu.cursor + delta;
    announce(buildMoveAnnouncement(), { assertive: true });
  }

  // Home (index 0) / End (dernière entrée). Fonctionne même à une seule
  // entrée : le curseur "ne bouge pas" (il y était déjà), ce qui déclenche
  // l'étoile — annoncer quand même est le comportement demandé, pas un
  // no-op silencieux.
  function moveCursorTo(index) {
    const total = menu.entries.length;
    if (total === 0) return;

    const previous = menu.cursor;
    menu.cursor = index;
    announceMaybeStarred(buildMoveAnnouncement(), previous === menu.cursor);
  }

  function activateCurrent() {
    const entry = currentEntry();
    if (entry && typeof entry.onActivate === "function") {
      entry.onActivate();
    }
  }

  // Instant (performance.now()) du dernier ajustement de slider, discret OU
  // de maintien — seule source de vérité pour cadencer le maintien (voir
  // onTick plus bas). Sans objet pour un toggle (pas de maintien).
  let lastSliderAdjustAt = -Infinity;

  function adjustSlider(entry, direction, big) {
    const step = big ? entry.bigStep ?? DEFAULT_BIG_STEP : entry.step ?? DEFAULT_STEP;
    const next = clamp(sliderValue(entry) + direction * step, entry.min, entry.max);

    menuSetPref(entry.prefKey, next);
    if (typeof entry.onChange === "function") entry.onChange(next);
    lastSliderAdjustAt = performance.now();

    // Uniquement la valeur, jamais le label : retour immédiat à une action
    // de l'utilisateur, pas le contexte complet déjà entendu à l'arrivée.
    // Annoncé même si la borne était déjà atteinte (next === valeur
    // précédente) : l'utilisateur doit savoir qu'il est au bout.
    announce(formatSliderValue(entry, next), { assertive: true });
  }

  // Gauche = non/false, droite = oui/true — direct, pas de bascule relative
  // (cohérent avec un slider où gauche/droite vont vers min/max).
  function setToggle(entry, value) {
    menuSetPref(entry.prefKey, value);
    if (typeof entry.onChange === "function") entry.onChange(value);
    announce(formatToggleValue(value), { assertive: true });
  }

  // Gauche/droite : n'affecte qu'une entrée slider ou toggle (rien sur une
  // action). direction ∈ {-1, 1} ; big sélectionne bigStep au lieu de step
  // (Ctrl enfoncé, ignoré par un toggle : rien à graduer sur 2 valeurs).
  function adjustCurrentEntry(direction, big) {
    const entry = currentEntry();
    if (isSlider(entry)) {
      adjustSlider(entry, direction, big);
    } else if (isToggle(entry)) {
      setToggle(entry, direction > 0);
    }
  }

  // Entrée/Espace sur un slider/toggle : pas d'action, juste une ré-annonce
  // de la ligne entière (utile si l'utilisateur a "perdu le fil"). Sur une
  // action, comportement inchangé.
  function activateOrReannounce() {
    const entry = currentEntry();
    if (isAdjustable(entry)) {
      announce(buildValueLine(entry), { assertive: true });
      return;
    }
    activateCurrent();
  }

  const keyHandlers = {
    ArrowUp: () => moveCursor(-1),
    ArrowDown: () => moveCursor(1),
    ArrowLeft: (event) => adjustCurrentEntry(-1, event.ctrlKey),
    ArrowRight: (event) => adjustCurrentEntry(1, event.ctrlKey),
    Home: () => moveCursorTo(0),
    End: () => moveCursorTo(menu.entries.length - 1),
    Backspace: () => announce(buildOpenAnnouncement(), { assertive: true }),
    Enter: () => activateOrReannounce(),
    " ": () => activateOrReannounce(),
    // closable gouverne Échap uniquement (une action "Retour" explicite dans
    // les entrées peut retirer l'écran sans passer par ce garde-fou).
    Escape: () => {
      if (menu.closable) popScreen();
    },
  };

  const api = {
    // Marqueur : distingue un écran-menu d'un écran quelconque pour un
    // appelant qui n'a que activeScreen() (voir reannounceActiveMenuEntry).
    isMenuScreen: true,
    onEnter() {
      announce(buildOpenAnnouncement(), { assertive: true });
    },
    // Maintien de gauche/droite sur un slider (voir commentaire d'en-tête).
    // No-op immédiat sur tout autre écran-menu (aucune entrée slider) : ce
    // tick tourne pour tous les menus par construction (le loop ne s'arrête
    // jamais), sans effet ailleurs. Un toggle n'y participe jamais non plus
    // (isSlider seul, pas isAdjustable).
    onTick() {
      const entry = currentEntry();
      if (!isSlider(entry)) return;

      const left = isHeld("ArrowLeft");
      const right = isHeld("ArrowRight");
      if (left === right) return; // rien tenu, ou les deux (ambigu)

      if (performance.now() - lastSliderAdjustAt < SLIDER_REPEAT_INTERVAL_MS) return;

      adjustSlider(entry, left ? -1 : 1, isHeld("Control"));
    },
    onKeyDown(event) {
      const handler = keyHandlers[event.key];
      if (!handler) return;

      // Empêche le comportement par défaut du navigateur (ex. espace qui
      // scrolle la page) puisque role="application" nous laisse tout gérer.
      event.preventDefault();
      handler(event);
    },
    // Voir reannounceActiveMenuEntry en tête de fichier.
    reannounceCurrentEntry() {
      announce(buildMoveAnnouncement(), { assertive: true });
    },
  };

  return api;
}
