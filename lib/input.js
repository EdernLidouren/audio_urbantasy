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
// DEUX canaux, tous deux arbitrés par la MÊME règle de modificateurs :
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
//
// RÈGLE D'ARBITRAGE (sans elle, une bascule par modificateur+"d"
// déclencherait AUSSI un déplacement lié à "d") : resolveAction et
// isActionActive n'activent un binding QUE si les modificateurs ACTIFS
// correspondent EXACTEMENT à ceux qu'il exige — mods:[] exige l'ABSENCE de
// TOUT modificateur, jamais une correspondance partielle. Une combinaison
// touche+modificateurs ne résout donc jamais deux bindings à la fois dans
// une même table.
//
// Bindings GLOBAUX (onGlobalPress) : résolus AVANT tout routage vers
// l'écran actif, INDÉPENDAMMENT de la pile (ex. bascule debug, disponible
// même depuis un menu), fournis par le point de composition du jeu,
// toujours interceptés (jamais aussi routés à l'écran actif).
//
// Remappage FUTUR : une table de bindings est un objet plat ordinaire,
// remplaçable à tout moment par quiconque la détient (ex. un futur écran
// d'options rechargerait la table de jeu) — structuré pour ça, mais AUCUNE
// interface de remappage n'est construite ici : on ne construit pas par
// anticipation ce qu'aucun besoin réel ne demande.
//
// NEUTRALISATION SYSTÉMATIQUE (voir ALWAYS_NEUTRALIZED_BINDINGS plus bas) :
// tout en tête du traitement, AVANT même la détection du premier appui et
// tout routage, quelques touches dont le comportement PAR DÉFAUT du
// navigateur piège l'utilisateur hors du jeu sont neutralisées
// INCONDITIONNELLEMENT — mécanisme générique, pas une liste de bindings
// fournie par un appelant (contrairement à `preventDefaultKeys`, propre au
// jeu, voir initInput). Aujourd'hui : Tab/Maj+Tab uniquement.
//
// RÈGLE DE CONCEPTION LIÉE : aucun binding de JEU (dans AUCUNE table, ici,
// dans ./menu.js ou chez l'appelant) n'utilise Alt. Alt reste réservé à
// l'utilisateur/au navigateur/au lecteur d'écran (menus système, bascule
// d'onglet, sortie de la page) — jamais intercepté ni comme modificateur
// requis, jamais neutralisé. C'est cette même réservation qui explique
// pourquoi ALWAYS_NEUTRALIZED_BINDINGS n'inclut délibérément aucune
// combinaison avec Ctrl (Ctrl+Tab/Ctrl+Maj+Tab = changement d'onglet
// NAVIGATEUR, qui appartient à l'utilisateur, jamais au jeu) ni avec Alt.

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

// Avertit UNE FOIS (au chargement de chaque table, voir defineBindings)
// si deux actions d'UNE MÊME
// table se disputent EXACTEMENT la même touche+modificateurs : un binding
// ne doit jamais résoudre deux actions à la fois (voir header). Purement
// défensif — une erreur de contenu à corriger, jamais un crash :
// resolveAction renverrait simplement la PREMIÈRE des deux, sans ce
// contrôle. `label` : nom de la table dans le message, pour identifier
// laquelle sans avoir à deviner depuis la pile d'appel.
function checkBindingsForCollisions(table, label) {
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

// REGISTRE des tables de bindings : chaque table est déclarée une fois,
// sous un identifiant stable, par defineBindings. Lu par l'aide des touches
// (./help.js), qui y trouve les raccourcis de l'écran actif, et par l'audit
// du contenu, qui vérifie qu'aucune action n'est sans description. Une
// table reste un objet plat ordinaire, résolu par resolveAction comme
// avant : le registre ne fait que la rendre trouvable.
const bindingTables = new Map();

// Déclare une table : vérifie ses collisions (voir
// checkBindingsForCollisions) et l'enregistre sous `id`. Rend la table
// elle-même. Un id déjà pris est une erreur de programmation : deux tables
// se disputeraient les mêmes descriptions d'aide.
export function defineBindings(id, table) {
  if (bindingTables.has(id)) throw new Error(`lib/input: table de bindings "${id}" déclarée deux fois.`);
  checkBindingsForCollisions(table, id);
  bindingTables.set(id, table);
  return table;
}

export function bindingTable(id) {
  return bindingTables.get(id);
}

export function bindingTableIds() {
  return [...bindingTables.keys()];
}

// Retire une table du registre — pour les VÉRIFICATIONS seulement : une
// table d'essai ne doit rester visible ni de l'aide ni de l'audit, et une
// seconde passe des vérifications doit pouvoir la redéclarer.
export function removeBindings(id) {
  bindingTables.delete(id);
}

// NOMS DE TOUCHES, pour l'aide (./help.js). Une lettre ou un chiffre
// s'écrit tel quel, en majuscule, une touche de fonction aussi (F1) ;
// toute autre touche a un nom fourni par la langue, à la clé de contrat
// keyNameKey(touche) ("key.ArrowUp", "key.Space" pour l'espace), et chaque
// modificateur à "key.mod.<mod>". Ordre des modificateurs : Ctrl, Alt, Maj.
const MOD_DISPLAY_ORDER = ["ctrl", "alt", "shift"];

export function needsKeyName(key) {
  return !((key.length === 1 && key !== " ") || /^F\d{1,2}$/.test(key));
}

export function keyNameKey(key) {
  return key === " " ? "key.Space" : `key.${key}`;
}

// Nom lisible de chaque touche d'un binding, modificateurs compris :
// ["Flèche gauche", "Q", "A"], ["Maj+S"]. `t` : la fonction de traduction.
export function describeBinding(binding, t) {
  const mods = MOD_DISPLAY_ORDER.filter((mod) => binding.mods.includes(mod)).map((mod) => t(`key.mod.${mod}`));
  return binding.keys.map((key) => [...mods, needsKeyName(key) ? t(keyNameKey(key)) : key.toUpperCase()].join("+"));
}

// Neutralisation SYSTÉMATIQUE (voir header) — liste FERMÉE et volontairement
// minimale aujourd'hui, mais EXTENSIBLE si un autre piège de ce type
// apparaissait (ne pas anticiper au-delà de Tab : rien par anticipation).
// Tab/Maj+Tab SEULS (mods:[] / mods:["shift"]) : la navigation de focus
// native du navigateur sortirait sinon le focus de #game vers la barre
// d'adresse ou un autre élément de page, SANS retour possible autrement
// qu'un rechargement complet — piège critique, en particulier au lecteur
// d'écran. Ctrl+Tab/Ctrl+Maj+Tab sont volontairement ABSENTS de cette liste
// (changement d'onglet NAVIGATEUR, appartient à l'utilisateur — les avaler
// serait une capture clavier abusive), tout comme n'importe quelle
// combinaison avec Alt (réservé à l'utilisateur, voir header).
const ALWAYS_NEUTRALIZED_BINDINGS = [
  { keys: ["Tab"], mods: [] },
  { keys: ["Tab"], mods: ["shift"] },
];

function matchesBinding(binding, key, mods) {
  return modsSignature(binding.mods) === modsSignature(mods) && binding.keys.some((k) => normalizeKey(k) === normalizeKey(key));
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

// Bindings GLOBAUX (voir header) — un seul jeu à la fois, fourni par le
// point de composition du jeu.
let globalPressListener = null;

export function onGlobalPress(table, listener) {
  globalPressListener = { table, listener };
}

export function initInput(target, { onFirstInput, preventDefaultKeys = [] } = {}) {
  let firstInputHandled = false;
  // Touches dont le comportement PAR DÉFAUT du navigateur (ex. défilement
  // de page sur les flèches) doit toujours être supprimé, quel que soit
  // l'écran actif ou l'auto-répétition OS : ce module reste l'UNIQUE
  // attache d'écouteur, cette liste (ex. les touches de mouvement du jeu)
  // lui est simplement fournie par l'appelant, sans qu'il ait besoin de
  // connaître leur nom.
  const preventDefaultSet = new Set(preventDefaultKeys.map(normalizeKey));

  target.addEventListener("keydown", (event) => {
    const mods = activeModsFrom(event);

    // Neutralisation SYSTÉMATIQUE — tout en tête, avant même la détection du
    // premier appui : voir ALWAYS_NEUTRALIZED_BINDINGS plus haut.
    if (ALWAYS_NEUTRALIZED_BINDINGS.some((binding) => matchesBinding(binding, event.key, mods))) {
      event.preventDefault();
    }

    if (!firstInputHandled) {
      firstInputHandled = true;
      if (onFirstInput) onFirstInput();
    }

    if (preventDefaultSet.has(normalizeKey(event.key))) {
      event.preventDefault();
    }

    activeMods = mods;
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
    // Modificateurs présents AU MOMENT du relâchement — recalculés depuis
    // CET évènement, jamais ceux mémorisés à l'appui.
    activeMods = activeModsFrom(event);
  });

  // Perte de focus fenêtre (alt-tab, etc.) : sans ça, une touche ou un
  // modificateur resterait "actif" pour toujours après avoir quitté la
  // fenêtre avec la touche encore enfoncée.
  window.addEventListener("blur", () => {
    heldKeys.clear();
    activeMods = [];
  });
}
