// Brique portable : construit un écran de menu (consommable par la pile
// générique screens.js) à partir d'un menu littéral. Aucune connaissance
// d'aucun jeu ni d'aucune locale : la fonction de traduction (t) est reçue
// en paramètre, jamais importée depuis un module i18n concret — c'est ce qui
// permet de déposer ce fichier tel quel dans un autre projet. Même principe
// pour les préférences (getPref/setPref) : reçues en paramètre, jamais un
// store concret importé ici (voir config/preferences.js côté Templeton).
//
// Modèle :
//   menu   = { title, entries, closable, cursor }
//   entrée = { kind?, label, onActivate }                          (action, kind par défaut)
//          | { kind:"slider", labelKey, prefKey, min, max,
//              step?, bigStep?, unit?, default?, format?, onChange? } (slider)
// title, entry.label et entry.labelKey sont des CLÉS de traduction, jamais
// des chaînes déjà résolues.
//
// "action" (kind omis ou "action") : Entrée/Espace -> onActivate. Inchangé
// depuis avant l'introduction des sliders.
// "slider" : valeur numérique bornée [min,max], portée par une préférence
// (prefKey, lue/écrite via getPref/setPref). Gauche/droite -/+ step, Ctrl+
// gauche/droite -/+ bigStep ; Entrée/Espace ne fait rien (ré-annonce juste
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

export function makeMenuScreen(menu, t, { getPref, setPref } = {}) {
  // cursor par défaut à 0 si absent.
  if (menu.cursor === undefined || menu.cursor === null) {
    menu.cursor = 0;
  }

  function formatPosition(index, total) {
    return t("menu.position", { index: index + 1, total });
  }

  function currentEntry() {
    return menu.entries[menu.cursor];
  }

  function isSlider(entry) {
    return entry.kind === "slider";
  }

  // Valeur courante d'un slider : préférence si posée, sinon entry.default
  // (ou min si default absent), toujours bornée [min,max] — protège aussi
  // contre une préférence posée hors bornes par un autre chemin.
  function sliderValue(entry) {
    const fallback = entry.default !== undefined ? entry.default : entry.min;
    return clamp(getPref(entry.prefKey, fallback), entry.min, entry.max);
  }

  // Formatage centralisé : entry.format(value) si fourni, sinon
  // "<valeur><unit>". Un seul endroit à changer pour changer l'affichage
  // (ex. arrondi, unité différente) sans toucher à la logique d'ajustement.
  function formatSliderValue(entry, value) {
    if (typeof entry.format === "function") return entry.format(value);
    return `${value}${entry.unit || ""}`;
  }

  // "<label> - <valeur><unit>" — la ligne entière d'un slider, utilisée à
  // l'arrivée dessus (navigation, ouverture du menu, Entrée/Espace).
  function buildSliderLine(entry) {
    return `${t(entry.labelKey)} - ${formatSliderValue(entry, sliderValue(entry))}`;
  }

  // "titre. entrée. position" (action) ou "titre. <ligne slider>" (slider)
  // — utilisé à l'ouverture et au retour depuis un sous-menu.
  function buildOpenAnnouncement() {
    const entry = currentEntry();
    if (isSlider(entry)) {
      return `${t(menu.title)}. ${buildSliderLine(entry)}`;
    }
    return `${t(menu.title)}. ${t(entry.label)}. ${formatPosition(menu.cursor, menu.entries.length)}`;
  }

  // "entrée. position" (action) ou "<ligne slider>" (slider) — sans le
  // titre, utilisé au déplacement du curseur.
  function buildMoveAnnouncement() {
    const entry = currentEntry();
    if (isSlider(entry)) {
      return buildSliderLine(entry);
    }
    return `${t(entry.label)}. ${formatPosition(menu.cursor, menu.entries.length)}`;
  }

  function moveCursor(delta) {
    const total = menu.entries.length;
    if (total === 0) return;

    menu.cursor = (menu.cursor + delta + total) % total;
    announce(buildMoveAnnouncement(), { assertive: true });
  }

  function activateCurrent() {
    const entry = currentEntry();
    if (entry && typeof entry.onActivate === "function") {
      entry.onActivate();
    }
  }

  // Instant (performance.now()) du dernier ajustement de slider, discret OU
  // de maintien — seule source de vérité pour cadencer le maintien (voir
  // onTick plus bas).
  let lastSliderAdjustAt = -Infinity;

  // Gauche/droite : n'affecte qu'une entrée slider (rien sur une action,
  // conformément à la consigne). direction ∈ {-1, 1} ; big sélectionne
  // bigStep au lieu de step (Ctrl enfoncé).
  function adjustCurrentSlider(direction, big) {
    const entry = currentEntry();
    if (!isSlider(entry)) return;

    const step = big ? entry.bigStep ?? DEFAULT_BIG_STEP : entry.step ?? DEFAULT_STEP;
    const next = clamp(sliderValue(entry) + direction * step, entry.min, entry.max);

    setPref(entry.prefKey, next);
    if (typeof entry.onChange === "function") entry.onChange(next);
    lastSliderAdjustAt = performance.now();

    // Uniquement la valeur, jamais le label : retour immédiat à une action
    // de l'utilisateur, pas le contexte complet déjà entendu à l'arrivée.
    // Annoncé même si la borne était déjà atteinte (next === valeur
    // précédente) : l'utilisateur doit savoir qu'il est au bout.
    announce(formatSliderValue(entry, next), { assertive: true });
  }

  // Entrée/Espace sur un slider : pas d'action, juste une ré-annonce de la
  // ligne entière (utile si l'utilisateur a "perdu le fil"). Sur une action,
  // comportement inchangé.
  function activateOrReannounce() {
    const entry = currentEntry();
    if (isSlider(entry)) {
      announce(buildSliderLine(entry), { assertive: true });
      return;
    }
    activateCurrent();
  }

  const keyHandlers = {
    ArrowUp: () => moveCursor(-1),
    ArrowDown: () => moveCursor(1),
    ArrowLeft: (event) => adjustCurrentSlider(-1, event.ctrlKey),
    ArrowRight: (event) => adjustCurrentSlider(1, event.ctrlKey),
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
    // jamais), sans effet ailleurs.
    onTick() {
      const entry = currentEntry();
      if (!isSlider(entry)) return;

      const left = isHeld("ArrowLeft");
      const right = isHeld("ArrowRight");
      if (left === right) return; // rien tenu, ou les deux (ambigu)

      if (performance.now() - lastSliderAdjustAt < SLIDER_REPEAT_INTERVAL_MS) return;

      adjustCurrentSlider(left ? -1 : 1, isHeld("Control"));
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
