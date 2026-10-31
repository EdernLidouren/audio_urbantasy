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
//   entrée = { kind?, label, labelParams?, descriptionKey?, placeholder?, onActivate?, closesMenu? } (action,
//              kind par défaut ; sans onActivate : ligne en lecture seule, Entrée n'y fait rien ;
//              closesMenu : le menu se ferme AVANT onActivate, qui peut alors ouvrir un autre écran ou
//              annoncer sur l'écran révélé)
//          | { kind:"slider", labelKey, descriptionKey?, prefKey | getValue+setValue,
//              min, max, step?, bigStep?, unit?, default?, format?, onChange? } (slider)
//          | { kind:"toggle", labelKey, descriptionKey?, prefKey, default, onChange? } (bascule oui/non)
//          | { kind:"choice", labelKey, descriptionKey?, prefKey, default,
//              choices: [{ value, labelKey }], onChange? } (une valeur parmi plusieurs)
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
// gauche/droite -/+ bigStep. Valeur TRANSITOIRE (propre à une ouverture du
// menu, jamais écrite sur disque) : getValue()/setValue(value) à la place
// de prefKey, l'appelant la garde.
// "toggle" : valeur booléenne (prefKey). Gauche = non/false, droite =
// oui/true — pas de maintien (rien à répéter sur une valeur à 2 états).
// "choice" : une valeur parmi `choices`, dans leur ordre (prefKey). Gauche/
// droite passent à la précédente/suivante, son "toggle" et annonce du
// libellé de la nouvelle valeur ; au bout de la liste, son "block" et
// ré-annonce de la valeur courante — jamais de bouclage, comme un slider.
// Une préférence absente ou inconnue de `choices` se lit comme `default`.
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
// SLIDER_REPEAT_INTERVAL_MS tant que la touche reste tenue (voir
// createHoldRepeat, partagé avec les écrans d'ajustement écrits à part),
// isModActive("ctrl") relu à chaque déclenchement (donc son
// état peut changer en cours de maintien, sans figer step/bigStep au
// premier appui) — isHeld/isModActive restent MODIFICATEUR-AGNOSTIQUES
// (bas niveau, lib/input.js) : contrairement au mouvement du joueur, Ctrl
// est ici une ENTRÉE à composer, pas un motif d'exclusion.
//
// Cyclage haut/bas (préférence "menuCycling") : à la première entrée,
// flèche haut (ou dernière entrée, flèche bas) déclenche un son de limite
// ("wrap" si le cyclage a lieu, "block" sinon — voir stepMenuCursor) puis,
// si le cyclage est permis, le curseur boucle vers l'autre bout ; sinon il
// reste sur place. Dans les deux cas, l'annonce de l'entrée résultante est
// préfixée d'une étoile ("* ...") si la préférence "menuStarPrefix"
// l'autorise — marqueur textuel pour les utilisateurs braille ou sans son,
// qui doivent pouvoir détecter ce cas sans dépendre du son.
//
// Sons d'interaction (voir configureMenuSounds) : "select" sur une action
// qui s'exécute (Entrée/Espace), "block" sur une tentative sans effet
// (Entrée/Espace sur un slider/toggle ou sur une ligne sans onActivate,
// cyclage refusé, slider déjà à sa borne, bascule déjà sur la valeur
// demandée), "toggle" sur un changement de VALEUR (bascule OU slider ajusté
// dans ses bornes, y compris en maintien — voir onTick), "cancel" sur
// Échap, "wrap" sur un cyclage qui boucle effectivement. Ces noms sont
// abstraits : ce fichier ignore tout des fichiers audio réels qui leur
// correspondent.
//
// Home/End : vont directement à la première/dernière entrée et l'annoncent,
// étoilée si le curseur n'a PAS bougé (déjà sur cette entrée) — fonctionne
// même avec une seule entrée (dans ce cas, toujours "inchangé").
//
// Ctrl+haut/bas : saute à l'entrée précédente/suivante qui n'est PAS un
// bouche-trou (entry.placeholder, ex. une entrée encore inconnue d'une
// liste de découvertes — ce module ignore ce qu'elle représente). Annonce
// comme une flèche simple, précédée du nombre d'entrées sautées s'il y en
// a ("3 éléments ignorés. ..."), jamais un "0" redondant. Aucune entrée
// trouvée : le curseur va à la première/dernière entrée, son "block" et
// étoile, comme une limite. Ne boucle JAMAIS, même cyclage activé (comme
// Home/End) : sauter d'un bout à l'autre perdrait le joueur. Dans un menu
// sans bouche-trou, se comporte exactement comme une flèche simple.
//
// Retour arrière (Backspace) : annonce le titre de l'écran, puis (ici,
// toujours vrai — ce module ne produit que des écrans-menus) l'entrée
// actuellement sélectionnée. Réutilise exactement le format de
// buildOpenAnnouncement.
//
// Contrat i18n des lignes décrites : la locale fournit "menu.described"
// ({text}, {description}) — « {text} : {description} » en français,
// « {text}: {description} » en anglais : la ponctuation entre un libellé et
// sa description appartient à la langue, jamais à ce module.
//
// Contrat i18n du saut : la locale fournit "menu.skipped" ({count}, un
// nombre : le gabarit accorde lui-même son pluriel), jamais lue pour 0,
// l'annonce est alors omise.
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
import { isHeld, isModActive, resolveAction, defineBindings } from "./input.js";

// Bindings de NAVIGATION menu — GÉNÉRIQUES (aucune connaissance du jeu),
// un vocabulaire propre à ce module comme menuCycling/
// menuStarPrefix ci-dessous : ce fichier définit ses propres noms d'action,
// pas un projet consommateur. Résolus via lib/input.js/resolveAction — ce
// module ne lit jamais event.key/event.ctrlKey directement (voir
// onKeyDown plus bas). leftBig/rightBig : Ctrl+flèche, une action DISTINCTE
// (mods exige une correspondance EXACTE, voir lib/input.js) plutôt qu'un
// paramètre booléen lu sur l'évènement.
const MENU_BINDINGS = defineBindings("menu", {
  up: { keys: ["ArrowUp"], mods: [] },
  down: { keys: ["ArrowDown"], mods: [] },
  upSkip: { keys: ["ArrowUp"], mods: ["ctrl"] },
  downSkip: { keys: ["ArrowDown"], mods: ["ctrl"] },
  left: { keys: ["ArrowLeft"], mods: [] },
  leftBig: { keys: ["ArrowLeft"], mods: ["ctrl"] },
  right: { keys: ["ArrowRight"], mods: [] },
  rightBig: { keys: ["ArrowRight"], mods: ["ctrl"] },
  home: { keys: ["Home"], mods: [] },
  end: { keys: ["End"], mods: [] },
  backspace: { keys: ["Backspace"], mods: [] },
  confirm: { keys: ["Enter", " "], mods: [] },
  cancel: { keys: ["Escape"], mods: [] },
});

// Cible d'un saut Ctrl+haut/bas : la première entrée non bouche-trou
// (`placeholder`) après `cursor` dans le sens `delta` (-1 ou 1) ->
// { index, found: true } ; aucune -> le bout de la liste dans ce sens,
// { index, found: false }. Pure, sans état de menu.
export function findSkipTarget(entries, cursor, delta) {
  for (let i = cursor + delta; i >= 0 && i < entries.length; i += delta) {
    if (!entries[i].placeholder) return { index: i, found: true };
  }
  return { index: delta < 0 ? 0 : entries.length - 1, found: false };
}

// Un cran de slider depuis `value` : `direction` -1 ou 1, `big` pour le
// grand pas (bigStep, sinon DEFAULT_BIG_STEP ; pas normal : step, sinon
// DEFAULT_STEP). -> { next, blocked } : la valeur bornée [min, max], et
// `blocked` si le cran voulu dépassait une borne (la valeur était déjà au
// bord, ou y arrive). Pure : l'écran joue le son, écrit et annonce.
export function sliderStep(entry, value, direction, big) {
  const step = big ? entry.bigStep ?? DEFAULT_BIG_STEP : entry.step ?? DEFAULT_STEP;
  const raw = value + direction * step;
  const next = clamp(raw, entry.min, entry.max);
  return { next, blocked: raw !== next };
}

// Index de `value` dans les `choices` d'un choix : la valeur si elle y
// figure, sinon `default`, sinon la première. Pure.
export function choiceIndexOf(entry, value) {
  const index = entry.choices.findIndex((choice) => choice.value === value);
  if (index >= 0) return index;
  return Math.max(0, entry.choices.findIndex((choice) => choice.value === entry.default));
}

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
// répétition ; INTERVAL : cadence de la répétition ensuite. Un écran à
// sliders écrit à part garde le même rythme via createHoldRepeat.
const SLIDER_REPEAT_DELAY_MS = 400;
const SLIDER_REPEAT_INTERVAL_MS = 150;

// MAINTIEN d'un ajustement gauche/droite (voir l'en-tête), partagé par les
// sliders de ce fichier et par tout écran d'ajustement écrit à part (ex.
// une liste de quantités) : même rythme partout. `press()` à chaque appui
// ponctuel (le cran lui-même est joué par l'appelant) arme le délai
// initial ; `due()`, à chaque tick, rend la direction (-1/1) d'un cran de
// maintien dû MAINTENANT et réarme l'intervalle, ou 0.
// Seul un appui RECONNU arme le maintien : une flèche tenue avec un
// modificateur qui ne mène à aucune action (Alt+Droite, réservé à
// l'utilisateur) ne règle rien. Relâcher les flèches le désarme ;
// `cancel()` aussi, quand le curseur quitte l'entrée réglée (Bas pendant
// que Droite est encore tenue ne règle pas l'entrée suivante).
export function createHoldRepeat() {
  let nextAt = Infinity;
  return {
    press() {
      nextAt = performance.now() + SLIDER_REPEAT_DELAY_MS;
    },
    cancel() {
      nextAt = Infinity;
    },
    due() {
      const left = isHeld("ArrowLeft");
      const right = isHeld("ArrowRight");
      if (!left && !right) nextAt = Infinity; // relâché : désarmé
      if (left === right) return 0; // rien tenu, ou les deux (ambigu)
      if (performance.now() < nextAt) return 0;
      nextAt = performance.now() + SLIDER_REPEAT_INTERVAL_MS;
      return left ? -1 : 1;
    },
  };
}

// Pas d'un cran de MAINTIEN pour un écran à trois paliers, modificateur
// relu à chaque cran : même convention que ses appuis ponctuels (aucun ->
// normal, Maj -> medium, Ctrl -> big ; Ctrl prime sur Maj).
export function heldStep({ normal, medium, big }) {
  if (isModActive("ctrl")) return big;
  if (isModActive("shift")) return medium;
  return normal;
}

// RÈGLE D'ANNONCE commune à tout écran d'ajustement : une valeur qui change
// est toujours dite. Contre une borne (valeur inchangée), elle n'est dite
// qu'à un appui ponctuel, jamais à chaque cran de MAINTIEN : le son "block"
// signale seul le mur, sans que le lecteur d'écran réannonce en boucle (en
// s'interrompant) la même valeur. Relâcher puis rappuyer la redit.
export function shouldAnnounceAdjustment(valueChanged, held) {
  return valueChanged || !held;
}

// COMPORTEMENT AUX BORNES, exporté pour les écrans de navigation écrits à
// part (une grille, une liste à sliders, un écran qui en enveloppe un
// autre) : mêmes préférences, mêmes sons et même étoile que les menus de ce
// fichier, sans jamais les recopier.

// Annonce assertive d'une ligne, ÉTOILÉE ("* ...") si `starred` et si la
// préférence "menuStarPrefix" l'autorise — marqueur pour les utilisateurs
// braille ou sans son (cyclage bouclé ou refusé, Home/End sans
// changement de curseur).
export function announceMenuLine(text, starred = false) {
  const prefixed = starred && menuGetPref("menuStarPrefix", true) ? `* ${text}` : text;
  announce(prefixed, { assertive: true });
}

// Un pas de curseur de `delta` (-1 ou 1) dans [0, total) -> { index,
// boundary }. Dans la liste : l'index voisin, sans son. À une borne : son
// "wrap" et bouclage si la préférence "menuCycling" le permet, sinon son
// "block" et index inchangé ; `boundary: true` dans les deux cas,
// l'appelant étoile son annonce (l'utilisateur doit savoir qu'il est à une
// limite).
export function stepMenuCursor(index, delta, total) {
  const next = index + delta;
  if (next >= 0 && next < total) return { index: next, boundary: false };
  const cyclingAllowed = menuGetPref("menuCycling", false);
  menuPlaySound(cyclingAllowed ? "wrap" : "block");
  return { index: cyclingAllowed ? (next + total) % total : index, boundary: true };
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
  function isChoice(entry) {
    return entry.kind === "choice";
  }
  function isAdjustable(entry) {
    return isSlider(entry) || isToggle(entry) || isChoice(entry);
  }

  // Index de la valeur courante d'un choix (voir choiceIndexOf).
  function choiceIndex(entry) {
    return choiceIndexOf(entry, menuGetPref(entry.prefKey, entry.default));
  }

  function formatChoiceValue(entry, index) {
    return t(entry.choices[index].labelKey);
  }

  // Valeur courante d'un slider : préférence si posée, sinon entry.default
  // (ou min si default absent), toujours bornée [min,max] — protège aussi
  // contre une préférence posée hors bornes par un autre chemin.
  function sliderValue(entry) {
    const fallback = entry.default !== undefined ? entry.default : entry.min;
    const raw = entry.getValue ? entry.getValue() : menuGetPref(entry.prefKey, fallback);
    return clamp(raw, entry.min, entry.max);
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
    if (isToggle(entry)) return formatToggleValue(toggleValue(entry));
    if (isChoice(entry)) return formatChoiceValue(entry, choiceIndex(entry));
    return formatSliderValue(entry, sliderValue(entry));
  }

  // "<label>, <valeur> : <description>" — la ligne entière d'un
  // slider/toggle, utilisée à l'arrivée dessus (navigation, ouverture du
  // menu, Entrée/Espace). descriptionKey absente -> "<label>, <valeur>."
  // (voir header, jamais requise).
  function buildValueLine(entry) {
    const base = `${t(entry.labelKey)}, ${formatEntryValue(entry)}`;
    return entry.descriptionKey ? t("menu.described", { text: base, description: t(entry.descriptionKey) }) : `${base}.`;
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
    const text = entry.descriptionKey
      ? t("menu.described", { text: label, description: stripTrailingPeriod(t(entry.descriptionKey)) })
      : label;
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

  // Flèche haut/bas : voir stepMenuCursor (cyclage refusé : curseur
  // inchangé, l'entrée courante est réannoncée, étoilée).
  function moveCursor(delta) {
    const total = menu.entries.length;
    if (total === 0) return;

    const { index, boundary } = stepMenuCursor(menu.cursor, delta, total);
    menu.cursor = index;
    hold.cancel();
    announceMenuLine(buildMoveAnnouncement(), boundary);
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
    hold.cancel();
    announceMenuLine(buildMoveAnnouncement(), previous === menu.cursor);
  }

  // Ctrl+haut/bas (voir en-tête) : prochaine entrée non bouche-trou dans le
  // sens `delta`, sinon le bout de la liste. Les entrées sautées sont
  // celles qu'on traverse sans s'y arrêter.
  function moveCursorSkipping(delta) {
    const total = menu.entries.length;
    if (total === 0) return;

    const { index, found } = findSkipTarget(menu.entries, menu.cursor, delta);
    const skipped = Math.max(Math.abs(index - menu.cursor) - 1, 0);
    if (!found) menuPlaySound("block");
    menu.cursor = index;
    hold.cancel();

    const line = buildMoveAnnouncement();
    const text = skipped > 0 ? `${t("menu.skipped", { count: skipped })}. ${line}` : line;
    announceMenuLine(text, !found);
  }

  function activateCurrent() {
    const entry = currentEntry();
    if (!entry || typeof entry.onActivate !== "function") return;
    if (entry.closesMenu) popScreen();
    entry.onActivate();
  }

  // Cadence du maintien (voir createHoldRepeat). Sans objet pour un toggle.
  const hold = createHoldRepeat();

  // `held` : cran de MAINTIEN (onTick) plutôt qu'appui ponctuel — décide
  // de l'annonce à la borne (voir shouldAnnounceAdjustment).
  function adjustSlider(entry, direction, big, held) {
    const previous = sliderValue(entry);
    const { next, blocked } = sliderStep(entry, previous, direction, big);

    // blocked : le déplacement voulu dépassait min/max (que la valeur
    // était déjà à la borne ou pas encore) — même son que le cyclage refusé,
    // même idée : une tentative d'aller au-delà d'une limite. Sinon (dans
    // les bornes), "toggle" : même repère sonore "valeur modifiée" qu'une
    // bascule, particulièrement utile sur les sliders de volume pour
    // entendre chaque cran sans dépendre de l'annonce.
    if (blocked) {
      menuPlaySound("block");
    } else {
      menuPlaySound("toggle");
    }

    if (entry.setValue) {
      entry.setValue(next);
    } else {
      menuSetPref(entry.prefKey, next);
    }
    if (typeof entry.onChange === "function") entry.onChange(next);

    // Uniquement la valeur, jamais le label : retour immédiat à une action
    // de l'utilisateur, pas le contexte complet déjà entendu à l'arrivée.
    if (shouldAnnounceAdjustment(next !== previous, held)) {
      announce(formatSliderValue(entry, next), { assertive: true });
    }
  }

  // Gauche = non/false, droite = oui/true — direct, pas de bascule relative
  // (cohérent avec un slider où gauche/droite vont vers min/max).
  // Déjà sur cette valeur (Droite sur "oui") : tentative sans effet, comme
  // un slider à sa borne — "block", la valeur redite, aucun onChange.
  function setToggle(entry, value) {
    if (toggleValue(entry) === value) {
      menuPlaySound("block");
      announce(formatToggleValue(value), { assertive: true });
      return;
    }
    menuSetPref(entry.prefKey, value);
    if (typeof entry.onChange === "function") entry.onChange(value);
    menuPlaySound("toggle");
    announce(formatToggleValue(value), { assertive: true });
  }

  // Choix : valeur voisine dans `choices`, ou limite (voir en-tête). onChange
  // passe AVANT l'annonce : un choix qui change la langue de l'interface
  // annonce sa nouvelle valeur dans la nouvelle langue.
  function stepChoice(entry, direction) {
    const index = choiceIndex(entry);
    const next = index + direction;
    if (next < 0 || next >= entry.choices.length) {
      menuPlaySound("block");
      announce(formatChoiceValue(entry, index), { assertive: true });
      return;
    }
    const { value } = entry.choices[next];
    menuSetPref(entry.prefKey, value);
    if (typeof entry.onChange === "function") entry.onChange(value);
    menuPlaySound("toggle");
    announce(formatChoiceValue(entry, next), { assertive: true });
  }

  // Gauche/droite : n'affecte qu'une entrée slider, toggle ou choice (rien
  // sur une action). direction ∈ {-1, 1} ; big sélectionne bigStep au lieu
  // de step (Ctrl enfoncé, ignoré par un toggle ou un choix : rien à
  // graduer).
  function adjustCurrentEntry(direction, big) {
    const entry = currentEntry();
    if (isSlider(entry)) {
      hold.press();
      adjustSlider(entry, direction, big, false);
    } else if (isToggle(entry)) {
      setToggle(entry, direction > 0);
    } else if (isChoice(entry)) {
      stepChoice(entry, direction);
    }
  }

  // Entrée/Espace sur un slider/toggle : pas d'action possible (rien à
  // "activer" sur une entrée qui s'ajuste au clavier gauche/droite) — son
  // "block", même famille que la limite d'un slider ou un cyclage refusé,
  // puis juste une ré-annonce de la ligne entière (utile si l'utilisateur a
  // "perdu le fil"). Même chose sur une ligne en LECTURE SEULE (sans
  // onActivate : une ligne d'aide, une entrée encore inconnue). Sur une
  // action, "select" : l'appui a un effet réel.
  function activateOrReannounce() {
    const entry = currentEntry();
    if (isAdjustable(entry)) {
      menuPlaySound("block");
      announce(buildValueLine(entry), { assertive: true });
      return;
    }
    if (typeof entry.onActivate !== "function") {
      menuPlaySound("block");
      announce(buildMoveAnnouncement(), { assertive: true });
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
    upSkip: () => moveCursorSkipping(-1),
    downSkip: () => moveCursorSkipping(1),
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
      const direction = hold.due();
      if (direction !== 0) adjustSlider(entry, direction, isModActive("ctrl"), true);
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
    // Aide des touches (./help.js) : la table des menus, sans ce qui ne
    // sert à rien dans CE menu — gauche/droite sans entrée réglable,
    // Ctrl+gauche/droite sans curseur gradué, Ctrl+haut/bas sans entrée
    // bouche-trou, Échap dans un menu qu'on ne peut pas fermer ainsi.
    helpSections() {
      const entries = menu.entries;
      const has = (predicate) => entries.some(predicate);
      const relevant = {
        left: has(isAdjustable),
        right: has(isAdjustable),
        leftBig: has(isSlider),
        rightBig: has(isSlider),
        upSkip: has((entry) => entry.placeholder),
        downSkip: has((entry) => entry.placeholder),
        cancel: Boolean(menu.closable),
      };
      return [{ id: "menu", include: (action) => relevant[action] ?? true }];
    },
    // Voir reannounceActiveMenuEntry en tête de fichier.
    reannounceCurrentEntry() {
      announce(buildMoveAnnouncement(), { assertive: true });
    },
    // Texte de l'annonce d'ouverture (titre puis entrée courante, celle de
    // Retour arrière), SANS l'annoncer : pour un écran qui enveloppe ce
    // menu et veut la dire à sa façon (ex. étoilée à une limite).
    openAnnouncementText() {
      return buildOpenAnnouncement();
    },
  };

  return api;
}
