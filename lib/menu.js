// Brique portable : construit un écran de menu (consommable par la pile
// générique screens.js) à partir d'un menu littéral. Aucune connaissance
// d'aucun jeu ni d'aucune locale : la fonction de traduction (t) est reçue
// en paramètre, jamais importée depuis un module i18n concret — c'est ce qui
// permet de déposer ce fichier tel quel dans un autre projet. Même principe
// pour les préférences (getPref/setPref) : reçues via configureMenuPreferences
// (voir plus bas), jamais un store concret importé ici (c'est le jeu qui
// fournit le sien). Même principe encore pour les sons d'interaction :
// reçus via configureMenuSounds (voir plus bas), jamais Howler ni un chemin
// de fichier importés ici.
//
// Modèle :
//   menu   = { title, entries, closable, cursor }
//   entrée = { kind?, label, labelParams?, descriptionKey?, onActivate } (action, kind par défaut)
//          | { kind:"slider", labelKey, descriptionKey?, prefKey, min, max,
//              step?, bigStep?, unit?, default?, format?, onChange? } (slider)
//          | { kind:"toggle", labelKey, descriptionKey?, prefKey, default, onChange? } (bascule oui/non)
// title, entry.label et entry.labelKey sont des CLÉS de traduction, jamais
// des chaînes déjà résolues. entry.labelParams (optionnel, entrée "action"
// SEULEMENT) : objet de paramètres passé à t(label, labelParams) pour
// interpoler un texte qui varie d'une instance de menu à l'autre — voir
// actionLine plus bas. menu.titleParams (optionnel) : même principe pour le
// TITRE (t(title, titleParams)) — un titre qui varie (ex. une confirmation
// qui récapitule ce qu'elle engage) reste une clé + des paramètres, jamais
// une chaîne déjà résolue. entry.descriptionKey (optionnel) : clé i18n
// expliquant CE QUE l'entrée fait — forme "<label>, <valeur> :
// <description>" pour un slider/toggle (voir buildValueLine plus bas),
// "<label> : <description>" pour une action (voir actionLine).
// Absente -> ligne courte ("<label>, <valeur>.", sans description),
// jamais requise par ce module générique : un consommateur qui n'en fournit
// pas garde une ligne valide.
//
// "action" (kind omis ou "action") : Entrée/Espace -> onActivate.
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
// appui ajuste immédiatement (chemin onKeyDown) ; la RÉPÉTITION ne démarre
// qu'après un DÉLAI INITIAL (SLIDER_REPEAT_DELAY_MS, comme la répétition
// clavier de l'OS — une pression brève ne produit donc JAMAIS qu'un seul
// cran), puis un ajustement supplémentaire toutes les
// SLIDER_REPEAT_INTERVAL_MS tant que la touche reste tenue, isModActive("ctrl")
// relu à chaque déclenchement (donc son
// état peut changer en cours de maintien, sans figer step/bigStep au
// premier appui) — isHeld/isModActive restent MODIFICATEUR-AGNOSTIQUES
// (bas niveau, lib/input.js) : contrairement au mouvement du joueur, Ctrl
// est ici une ENTRÉE à composer, pas un motif d'exclusion.
//
// Cyclage haut/bas (préférence "menuCycling") : à la première entrée,
// flèche haut (ou dernière entrée, flèche bas) déclenche un son de limite
// ("wrap" si le cyclage a lieu, "block" sinon — voir playBoundarySound) puis,
// si le cyclage est permis, le curseur boucle vers l'autre bout ; sinon il
// reste sur place. Dans les deux cas, l'annonce de l'entrée résultante est
// préfixée d'une étoile ("* ...") si la préférence "menuStarPrefix"
// l'autorise — marqueur textuel pour les utilisateurs braille ou sans son,
// qui doivent pouvoir détecter ce cas sans dépendre du son.
//
// Sons d'interaction (voir configureMenuSounds) : "select" sur une action
// qui s'exécute (Entrée/Espace), "block" sur une tentative sans effet
// (Entrée/Espace sur un slider/toggle, cyclage refusé, slider déjà à sa
// borne), "toggle" sur un changement de VALEUR (bascule OU slider ajusté
// dans ses bornes, y compris en maintien — voir onTick), "cancel" sur
// Échap, "wrap" sur un cyclage qui boucle effectivement. Ces noms sont
// abstraits : ce fichier ignore tout des fichiers audio réels qui leur
// correspondent.
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
// EXTÉRIEUR (ex. après un import de préférences asynchrone) qui n'a pas de
// référence directe vers l'écran.
// Aucun état parallèle : la pile (screens.js, activeScreen()) est la SEULE
// source de vérité sur "quel écran est actif" ; un écran-menu se reconnaît
// via son marqueur isMenuScreen.

import { announce, stripTrailingPeriod } from "./announce.js";
import { clamp } from "./math.js";
import { popScreen, activeScreen } from "./screens.js";
import { isHeld, isModActive, resolveAction, checkBindingsForCollisions } from "./input.js";

// Bindings de NAVIGATION menu — GÉNÉRIQUES (aucune connaissance du jeu),
// un vocabulaire propre à ce module comme menuCycling/
// menuStarPrefix ci-dessous : ce fichier définit ses propres noms d'action,
// pas un projet consommateur. Résolus via lib/input.js/resolveAction — ce
// module ne lit jamais event.key/event.ctrlKey directement (voir
// onKeyDown plus bas). leftBig/rightBig : Ctrl+flèche, une action DISTINCTE
// (mods exige une correspondance EXACTE, voir lib/input.js) plutôt qu'un
// paramètre booléen lu sur l'évènement.
const MENU_BINDINGS = {
  up: { keys: ["ArrowUp"], mods: [] },
  down: { keys: ["ArrowDown"], mods: [] },
  left: { keys: ["ArrowLeft"], mods: [] },
  leftBig: { keys: ["ArrowLeft"], mods: ["ctrl"] },
  right: { keys: ["ArrowRight"], mods: [] },
  rightBig: { keys: ["ArrowRight"], mods: ["ctrl"] },
  home: { keys: ["Home"], mods: [] },
  end: { keys: ["End"], mods: [] },
  backspace: { keys: ["Backspace"], mods: [] },
  confirm: { keys: ["Enter", " "], mods: [] },
  cancel: { keys: ["Escape"], mods: [] },
};
checkBindingsForCollisions(MENU_BINDINGS, "lib/menu.js MENU_BINDINGS");

export function reannounceActiveMenuEntry() {
  const screen = activeScreen();
  if (screen && screen.isMenuScreen) screen.reannounceCurrentEntry();
}

// Écran-message : un menu à UNE entrée ("OK"), pour toute annonce
// IMPORTANTE qui doit être entendue en entier plutôt que risquer d'être
// écrasée par une annonce suivante (ex. "opération réussie" immédiatement
// suivi d'une ré-annonce de la ligne de menu courante, qui écraserait le
// résultat avant qu'il ait pu être lu — deux écritures assertive coup sur
// coup, sans délai, la seconde gagne toujours). Le message EST le titre :
// à l'ouverture, l'annonce lit "<message>. OK. 1 sur 1" ; rien d'autre ne
// s'exécute avant que l'utilisateur n'acquitte (Entrée/Espace sur OK, ou
// Échap — les deux équivalents ici, aucune destructivité à confirmer), donc
// rien ne peut l'écraser. Empilé via pushScreen par l'appelant, comme
// n'importe quel autre écran-menu.
//
// Contrat i18n (même principe que menu.toggle.yes/no plus haut) : la
// locale doit fournir "menu.message.ok". messageKey : CLÉ de traduction,
// jamais une chaîne déjà résolue.
export function makeMessageScreen(messageKey, t) {
  const menu = {
    title: messageKey,
    closable: true,
    entries: [
      {
        label: "menu.message.ok",
        onActivate: () => popScreen(),
      },
    ],
  };
  return makeMenuScreen(menu, t);
}

// Préférences de comportement des menus (cyclage, étoile, suffixe de
// position) : injectées UNE FOIS depuis le point de composition du jeu,
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

// Sons d'interaction des menus : même principe d'injection que les
// préférences ci-dessus — ce fichier ne connaît que des noms d'ÉVÈNEMENTS
// abstraits ("wrap"/"block"/"select"/"cancel"/"toggle"), jamais un chemin de
// fichier ni Howler (le jeu fournit le mapping vers des assets concrets,
// injecté depuis son point de composition). Repli sûr tant
// qu'aucune configuration n'a eu lieu : no-op silencieux.
let menuPlaySound = () => {};

export function configureMenuSounds(playSound) {
  menuPlaySound = playSound;
}

const DEFAULT_STEP = 1;
const DEFAULT_BIG_STEP = 5;
// Cadence du maintien sur un slider (pas un invariant structurel, juste un
// rythme raisonnable pour un ajustement répété) : en dur ici, comme
// DEFAULT_STEP/DEFAULT_BIG_STEP — ce fichier, portable, ne doit importer
// aucune valeur de tuning propre à un jeu.
// DELAY : attente entre le premier cran (appui) et le début de la
// répétition ; INTERVAL : cadence de la répétition ensuite. Exportées : un
// écran à sliders écrit à part (ex. une liste de quantités) garde le même
// rythme que les menus.
export const SLIDER_REPEAT_DELAY_MS = 400;
export const SLIDER_REPEAT_INTERVAL_MS = 150;

// Son de limite : "wrap" si le cyclage a effectivement bouclé le curseur,
// "block" s'il a été refusé (préférence désactivée) — deux évènements
// distincts pour deux sons distincts, voir configureMenuSounds ci-dessus.
function playBoundarySound(cyclingHappened) {
  menuPlaySound(cyclingHappened ? "wrap" : "block");
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

  // "<label>, <valeur> : <description>" — la ligne entière d'un
  // slider/toggle, utilisée à l'arrivée dessus (navigation, ouverture du
  // menu, Entrée/Espace). descriptionKey absente -> "<label>, <valeur>."
  // (voir header, jamais requise).
  function buildValueLine(entry) {
    const base = `${t(entry.labelKey)}, ${formatEntryValue(entry)}`;
    return entry.descriptionKey ? `${base} : ${t(entry.descriptionKey)}` : `${base}.`;
  }

  // Suffixe de position ("x sur y"), désactivable via la préférence
  // "menuIndexSuffix" — chaîne vide si désactivé, jamais un fragment
  // orphelin ("Nouvelle partie. " avec rien derrière).
  function formatPosition(index, total) {
    if (!menuGetPref("menuIndexSuffix", true)) return "";
    return t("menu.position", { index: index + 1, total });
  }

  // "<label>[. position]" — une entrée action, avec ou sans suffixe.
  // entry.labelParams (optionnel) : passé tel quel à t(), pour une entrée
  // dont le texte varie (ex. "Pomme, quantité 5" dans un inventaire) sans
  // construire un sous-menu de type slider/toggle (sémantique inadaptée
  // pour une valeur non ajustable).
  // Absent -> t(entry.label) sans second argument.
  // entry.descriptionKey (optionnel) : "<label> : <description>", la
  // description perdant son point final quand la position suit (jamais
  // ".. 4 sur 8").
  function actionLine(entry) {
    const position = formatPosition(menu.cursor, menu.entries.length);
    const label = t(entry.label, entry.labelParams);
    const text = entry.descriptionKey ? `${label} : ${stripTrailingPeriod(t(entry.descriptionKey))}` : label;
    return position ? `${text}. ${position}` : text;
  }

  // "titre. entrée[. position]" (action) ou "titre. <ligne valeur>"
  // (slider/toggle) — utilisé à l'ouverture, au retour depuis un sous-menu,
  // et par Retour arrière (Backspace).
  // Un titre qui finit déjà par une ponctuation (une question de
  // confirmation...) n'en reçoit pas une seconde : jamais "Confirmer ?.".
  function buildOpenAnnouncement() {
    const entry = currentEntry();
    const title = t(menu.title, menu.titleParams);
    const separator = /[.!?…:]\s*$/.test(title) ? " " : ". ";
    if (isAdjustable(entry)) {
      return `${title}${separator}${buildValueLine(entry)}`;
    }
    return `${title}${separator}${actionLine(entry)}`;
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

  // Instant (performance.now()) à partir duquel le maintien peut produire
  // son PROCHAIN cran — posé par chaque ajustement (délai initial après un
  // appui discret, intervalle après un cran de maintien, voir onTick). Seule
  // source de vérité pour cadencer le maintien. Sans objet pour un toggle.
  let nextSliderRepeatAt = -Infinity;

  // `nextDelayMs` : délai avant le prochain cran de MAINTIEN — long après
  // un appui discret (SLIDER_REPEAT_DELAY_MS), court entre deux crans de
  // maintien (SLIDER_REPEAT_INTERVAL_MS).
  function adjustSlider(entry, direction, big, nextDelayMs) {
    const step = big ? entry.bigStep ?? DEFAULT_BIG_STEP : entry.step ?? DEFAULT_STEP;
    const raw = sliderValue(entry) + direction * step;
    const next = clamp(raw, entry.min, entry.max);

    // raw !== next : le déplacement voulu dépassait min/max (que la valeur
    // était déjà à la borne ou pas encore) — même son que le cyclage refusé,
    // même idée : une tentative d'aller au-delà d'une limite. Sinon (dans
    // les bornes), "toggle" : même repère sonore "valeur modifiée" qu'une
    // bascule, particulièrement utile sur les sliders de volume pour
    // entendre chaque cran sans dépendre de l'annonce.
    if (raw !== next) {
      menuPlaySound("block");
    } else {
      menuPlaySound("toggle");
    }

    menuSetPref(entry.prefKey, next);
    if (typeof entry.onChange === "function") entry.onChange(next);
    nextSliderRepeatAt = performance.now() + nextDelayMs;

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
    menuPlaySound("toggle");
    announce(formatToggleValue(value), { assertive: true });
  }

  // Gauche/droite : n'affecte qu'une entrée slider ou toggle (rien sur une
  // action). direction ∈ {-1, 1} ; big sélectionne bigStep au lieu de step
  // (Ctrl enfoncé, ignoré par un toggle : rien à graduer sur 2 valeurs).
  function adjustCurrentEntry(direction, big) {
    const entry = currentEntry();
    if (isSlider(entry)) {
      adjustSlider(entry, direction, big, SLIDER_REPEAT_DELAY_MS);
    } else if (isToggle(entry)) {
      setToggle(entry, direction > 0);
    }
  }

  // Entrée/Espace sur un slider/toggle : pas d'action possible (rien à
  // "activer" sur une entrée qui s'ajuste au clavier gauche/droite) — son
  // "block", même famille que la limite d'un slider ou un cyclage refusé,
  // puis juste une ré-annonce de la ligne entière (utile si l'utilisateur a
  // "perdu le fil"). Sur une action, "select" : l'appui a un effet réel.
  function activateOrReannounce() {
    const entry = currentEntry();
    if (isAdjustable(entry)) {
      menuPlaySound("block");
      announce(buildValueLine(entry), { assertive: true });
      return;
    }
    menuPlaySound("select");
    activateCurrent();
  }

  // Keyed par ACTION (voir MENU_BINDINGS ci-dessus), jamais par touche
  // brute — le geste Ctrl+flèche est déjà distingué EN AMONT par
  // resolveAction (leftBig/rightBig), donc rien à lire sur
  // event.ctrlKey ici.
  const keyHandlers = {
    up: () => moveCursor(-1),
    down: () => moveCursor(1),
    left: () => adjustCurrentEntry(-1, false),
    leftBig: () => adjustCurrentEntry(-1, true),
    right: () => adjustCurrentEntry(1, false),
    rightBig: () => adjustCurrentEntry(1, true),
    home: () => moveCursorTo(0),
    end: () => moveCursorTo(menu.entries.length - 1),
    backspace: () => announce(buildOpenAnnouncement(), { assertive: true }),
    confirm: () => activateOrReannounce(),
    // closable gouverne "cancel" uniquement (une action "Retour" explicite
    // dans les entrées peut retirer l'écran sans passer par ce garde-fou —
    // elle sonnera "select", pas "cancel" : c'est le GESTE clavier qui
    // détermine le son, pas ce que l'entrée fait une fois activée).
    cancel: () => {
      if (menu.closable) {
        menuPlaySound("cancel");
        popScreen();
      }
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

      if (performance.now() < nextSliderRepeatAt) return;

      adjustSlider(entry, left ? -1 : 1, isModActive("ctrl"), SLIDER_REPEAT_INTERVAL_MS);
    },
    onKeyDown(event) {
      const action = resolveAction(MENU_BINDINGS, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler) return;

      // Empêche le comportement par défaut du navigateur (ex. espace qui
      // scrolle la page) puisque role="application" nous laisse tout gérer.
      event.preventDefault();
      handler();
    },
    // Voir reannounceActiveMenuEntry en tête de fichier.
    reannounceCurrentEntry() {
      announce(buildMoveAnnouncement(), { assertive: true });
    },
  };

  return api;
}
