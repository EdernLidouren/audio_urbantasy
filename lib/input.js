// Brique portable : MOTEUR D'ENTRÉE clavier central — SEULE chose qui
// attache des écouteurs DOM bruts (keydown/keyup/blur). Ne connaît AUCUNE
// touche "utile" au jeu par son nom : la sémantique (quelle touche fait
// quoi) vit dans des tables de BINDINGS déclaratives, fournies par CHAQUE
// consommateur au moment de la résolution (resolveAction/isActionActive
// ci-dessous), jamais importées ou stockées ici — même séparation
// mécanisme/valeurs que lib/tuning.js ou lib/i18n.js. Un binding :
//   { keys: [<touches>...], mods: [<"alt"|"ctrl"|"shift">...] }
// (keys au pluriel : plusieurs touches physiques peuvent porter la même
// action, ex. flèche gauche ET "q" pour "aller à gauche" — mods précise les
// modificateurs REQUIS, jamais optionnels.)
//
// TROIS canaux, tous arbitrés par la MÊME règle de modificateurs :
//  a. CONTINU (isHeld / isModActive / isActionActive) — polling, pour une
//     intention qui dure tant qu'une touche reste tenue (ex. mouvement).
//     Réévalué à CHAQUE appel, jamais mis en cache : presser un
//     modificateur en cours de maintien invalide immédiatement une action
//     dont les mods requis ne correspondent plus, le relâcher la restaure
//     aussitôt.
//  b. APPUI — ponctuel, routé vers l'écran actif au sommet de la pile via
//     lib/screens.js/handleKeyDown (câblé une fois en bas de ce fichier),
//     jamais sur l'auto-répétition OS. L'évènement transmis porte un champ
//     `.mods` (modificateurs actifs, résolus ICI) en plus des champs
//     natifs du KeyboardEvent — chaque écran/menu résout ensuite SA PROPRE
//     table via resolveAction(table, event.key, event.mods), jamais une
//     comparaison directe à event.key/event.ctrlKey.
//  c. RELÂCHEMENT (onRelease) — ponctuel, INFRASTRUCTURE (aucun
//     consommateur gameplay aujourd'hui, voir CLAUDE.md/YAGNI) : un seul
//     abonné à la fois, identifié par la touche PHYSIQUE + les
//     modificateurs présents AU MOMENT du relâchement (recalculés depuis
//     CET évènement, jamais ceux de l'appui initial — un relâchement se
//     résout indépendamment).
//
// RÈGLE D'ARBITRAGE (corrige le bug historique : la bascule debug par
// modificateur+"d" déclenchait AUSSI le déplacement "d", faute d'arbitrage
// des modificateurs) : resolveAction et
// isActionActive n'activent un binding QUE si les modificateurs ACTIFS
// correspondent EXACTEMENT à ceux qu'il exige — mods:[] exige l'ABSENCE de
// TOUT modificateur, jamais une correspondance partielle. Une combinaison
// touche+modificateurs ne résout donc jamais deux bindings à la fois dans
// une même table.
//
// Bindings GLOBAUX (onGlobalPress) : résolus AVANT tout routage vers
// l'écran actif, INDÉPENDAMMENT de la pile (ex. bascule debug, disponible
// même depuis un menu) — mêmes principe et portée que l'ancien écouteur
// dédié qu'ils remplacent (voir main.js), toujours interceptés (jamais
// aussi routés à l'écran actif).
//
// Remappage FUTUR : une table de bindings est un objet plat ordinaire,
// remplaçable à tout moment par quiconque la détient (ex. un futur écran
// d'options rechargerait la table de view/input.js) — structuré pour ça,
// mais AUCUNE interface de remappage n'est construite ici (YAGNI, voir
// CLAUDE.md).

import { handleKeyDown } from "./screens.js";

// Touches lettres : varient en casse selon Maj/Verr.Maj, normalisées en
// minuscule. Touches nommées (ArrowLeft, Enter, Escape...) : jamais
// affectées par la casse, laissées intactes.
function normalizeKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

const MODIFIER_EVENT_FLAGS = { alt: "altKey", ctrl: "ctrlKey", shift: "shiftKey" };

// Modificateurs actifs sur UN évènement DOM donné — seule lecture directe
// de altKey/ctrlKey/shiftKey de tout ce fichier, jamais dupliquée ailleurs.
function activeModsFrom(event) {
  return Object.keys(MODIFIER_EVENT_FLAGS).filter((mod) => event[MODIFIER_EVENT_FLAGS[mod]]);
}

// Signature comparable d'un ensemble de modificateurs, indépendante de leur
// ordre de déclaration.
function modsSignature(mods) {
  return [...mods].sort().join("+");
}

// Résolution PURE, sans état : parcourt `table` (petite par construction,
// jamais plus d'une poignée d'actions par écran/menu) et renvoie le nom de
// l'action dont une touche correspond à `key` ET dont `mods` correspond
// EXACTEMENT à `activeMods` — undefined si aucune. Réutilisable par
// n'importe quelle table : chaque écran/menu porte la sienne (voir header),
// ce module n'en connaît ni ne conserve aucune.
export function resolveAction(table, key, activeMods) {
  const normalized = normalizeKey(key);
  const signature = modsSignature(activeMods);
  for (const [action, binding] of Object.entries(table)) {
    if (modsSignature(binding.mods) !== signature) continue;
    if (binding.keys.some((k) => normalizeKey(k) === normalized)) return action;
  }
  return undefined;
}

// Avertit UNE FOIS (au chargement — voir les tables de view/input.js,
// lib/menu.js, view/menus/inventory-menu.js) si deux actions d'UNE MÊME
// table se disputent EXACTEMENT la même touche+modificateurs : un binding
// ne doit jamais résoudre deux actions à la fois (voir header). Purement
// défensif — une erreur de contenu à corriger, jamais un crash :
// resolveAction renverrait simplement la PREMIÈRE des deux, sans ce
// contrôle. `label` : nom de la table dans le message, pour identifier
// laquelle sans avoir à deviner depuis la pile d'appel.
export function checkBindingsForCollisions(table, label) {
  const seen = new Map();
  for (const [action, binding] of Object.entries(table)) {
    for (const key of binding.keys) {
      const signature = `${normalizeKey(key)}|${modsSignature(binding.mods)}`;
      if (seen.has(signature)) {
        console.warn(`lib/input: collision de binding dans "${label}" sur "${signature}" (${seen.get(signature)} et ${action}).`);
      }
      seen.set(signature, action);
    }
  }
}

// État CONTINU : touches tenues (brutes, sans arbitrage de modificateur) et
// modificateurs actuellement actifs — mis à jour à CHAQUE keydown/keyup,
// jamais recalculé après coup.
const heldKeys = new Set();
let activeMods = [];

// Bas niveau, modificateur-agnostique : utile à un consommateur qui doit
// composer lui-même (ex. lib/menu.js, maintien gauche/droite d'un slider,
// où Ctrl est une entrée à part entière — pas un motif d'exclusion comme
// pour le mouvement, voir isActionActive ci-dessous).
export function isHeld(key) {
  return heldKeys.has(normalizeKey(key));
}

export function isModActive(mod) {
  return activeMods.includes(mod);
}

// Continu ARBITRÉ : `action` est active si au moins une de ses touches est
// tenue ET que les modificateurs ACTIFS À CET INSTANT correspondent
// EXACTEMENT à ceux exigés par le binding — jamais mis en cache, réévalué à
// chaque appel (voir header, canal (a)). C'est cette réévaluation continue
// qui fait que presser Alt en cours de marche coupe immédiatement le
// mouvement, et que le relâcher (touche de direction encore tenue) le
// reprend aussitôt.
export function isActionActive(table, action) {
  const binding = table[action];
  if (!binding) return false;
  if (modsSignature(activeMods) !== modsSignature(binding.mods)) return false;
  return binding.keys.some((key) => heldKeys.has(normalizeKey(key)));
}

// Canal RELÂCHEMENT — un seul abonné à la fois (voir header), comme les
// gestionnaires enregistrés ailleurs dans ce projet (ex.
// view/interaction.js/setPickupHandler). INFRASTRUCTURE : aucun appelant
// permanent aujourd'hui — vérifié une fois via un test manuel, jamais câblé
// depuis main.js tant qu'aucun gameplay n'en a besoin.
let releaseListener = null;

export function onRelease(listener) {
  releaseListener = listener;
}

// Bindings GLOBAUX (voir header) — un seul jeu à la fois, fourni par le
// point de composition (main.js).
let globalPressListener = null;

export function onGlobalPress(table, listener) {
  globalPressListener = { table, listener };
}

export function initInput(target, { onFirstInput, preventDefaultKeys = [] } = {}) {
  let firstInputHandled = false;
  // Touches dont le comportement PAR DÉFAUT du navigateur (ex. défilement
  // de page sur les flèches) doit toujours être supprimé, quel que soit
  // l'écran actif ou l'auto-répétition OS — remplace l'ancien écouteur
  // indépendant preventMovementKeyScrolling (view/input.js) : ce module
  // reste l'UNIQUE attache d'écouteur, cette liste (les touches de
  // mouvement de Templeton) lui est simplement fournie par l'appelant, sans
  // qu'il ait besoin de connaître leur nom.
  const preventDefaultSet = new Set(preventDefaultKeys.map(normalizeKey));

  target.addEventListener("keydown", (event) => {
    if (!firstInputHandled) {
      firstInputHandled = true;
      if (onFirstInput) onFirstInput();
    }

    if (preventDefaultSet.has(normalizeKey(event.key))) {
      event.preventDefault();
    }

    activeMods = activeModsFrom(event);
    heldKeys.add(normalizeKey(event.key));

    // Auto-répétition OS sur une touche tenue : l'état CONTINU ci-dessus
    // reste à jour (heldKeys.add est idempotent), mais jamais un second
    // appui ponctuel — une pression reste ponctuelle.
    if (event.repeat) return;

    if (globalPressListener) {
      const action = resolveAction(globalPressListener.table, event.key, activeMods);
      if (action) {
        event.preventDefault();
        globalPressListener.listener(action);
        return; // un binding global intercepte, jamais aussi routé à l'écran actif.
      }
    }

    event.mods = activeMods;
    handleKeyDown(event);
  });

  target.addEventListener("keyup", (event) => {
    heldKeys.delete(normalizeKey(event.key));
    // Modificateurs présents AU MOMENT du relâchement (voir header, canal
    // (c)) — recalculés depuis CET évènement, jamais ceux mémorisés à
    // l'appui.
    activeMods = activeModsFrom(event);

    if (releaseListener) {
      event.mods = activeMods;
      releaseListener(event);
    }
  });

  // Perte de focus fenêtre (alt-tab, etc.) : sans ça, une touche ou un
  // modificateur resterait "actif" pour toujours après avoir quitté la
  // fenêtre avec la touche encore enfoncée.
  window.addEventListener("blur", () => {
    heldKeys.clear();
    activeMods = [];
  });
}
