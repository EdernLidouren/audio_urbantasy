// Brique portable : AIDE DES TOUCHES, GÉNÉRÉE. Aucun écran d'aide n'est
// écrit à la main : tout vient des tables de bindings déclarées par
// lib/input.js/defineBindings, et de la description de chaque action,
// rangée à la clé i18n "help.<table>.<action>" (voir helpKey). Ajouter un
// raccourci = sa ligne dans sa table + sa phrase ; l'aide le montre
// d'elle-même, et une vérification de contenu signale une phrase manquante.
//
// CONTEXTUELLE : l'aide montre les raccourcis de l'écran au sommet de la
// pile, et lui seul. Un écran le déclare par un champ optionnel
// `helpSections()` -> [{ id, include? }] : les tables qui s'appliquent à
// lui (`id`, celui passé à defineBindings), dans l'ordre où les lire, avec
// un filtre de pertinence facultatif (`include(action)`, ex. un raccourci
// de debug hors mode debug, un ajustement dans un menu sans réglage). Les
// raccourcis GLOBAUX (disponibles partout) sont ajoutés à la suite par
// l'appelant (`globalSections`). Un écran sans helpSections (ex. l'écran
// vide qui gèle le jeu pendant une transition) n'ouvre pas d'aide : la
// transition fermerait l'aide à la place de son propre écran.
//
// Un écran peut aussi fournir `wrapOverlay(screen)`, appliqué à l'écran
// d'aide avant de l'empiler (ex. le jeu fait taire ses balises sous un
// menu) — ce module ignore tout de ce que l'écran couvert en fait.
//
// L'écran d'aide est un MENU ordinaire (./menu.js) en lecture seule : une
// entrée par action, « <action> : <touches> », jamais une action exécutée
// depuis l'aide. Il hérite de tout ce qu'a un menu (position, étoile de
// limite, Début/Fin, cyclage) ; Échap le referme et l'écran couvert se
// réannonce.
//
// Contrat i18n (la langue les fournit, comme menu.position) :
//   "help.title"  — titre de l'écran d'aide ;
//   "help.entry"  — une ligne, {action} (sa description) et {keys} (la
//                   liste des touches, à rendre en alternative :
//                   {keys, list, or}, voir lib/i18n/message.js) ;
//   "help.<table>.<action>" — la description de chaque action ;
//   "key.<Touche>" / "key.mod.<mod>" — noms de touches (voir
//                   ./input.js/describeBinding).

import { activeScreen, pushScreen } from "./screens.js";
import { makeMenuScreen } from "./menu.js";
import { bindingTable, describeBinding } from "./input.js";

// Clé i18n de la description d'une action.
export function helpKey(tableId, action) {
  return `help.${tableId}.${action}`;
}

// Entrées de l'aide pour des sections [{ id, include? }], dans leur ordre
// puis dans celui des actions de chaque table. Une table inconnue est une
// erreur de programmation (un id mal recopié), jamais une section muette.
function helpEntries(sections, t) {
  const entries = [];
  for (const { id, include } of sections) {
    const table = bindingTable(id);
    if (!table) throw new Error(`lib/help: table de bindings "${id}" inconnue (voir lib/input.js/defineBindings).`);
    for (const [action, binding] of Object.entries(table)) {
      if (include && !include(action)) continue;
      entries.push({
        label: "help.entry",
        labelParams: { action: t(helpKey(id, action)), keys: describeBinding(binding, t) },
        // Lecture seule : Entrée ne fait rien (voir en-tête).
        onActivate: () => {},
      });
    }
  }
  return entries;
}

// Ouvre l'aide de l'écran actif, suivie des sections globales. Rend false
// (sans rien ouvrir) si l'écran actif ne déclare pas d'aide, ou s'il est
// déjà une aide : jamais une aide de l'aide empilée par un second appui.
export function openHelp(t, { globalSections = [] } = {}) {
  const covered = activeScreen();
  if (!covered || covered.isHelpScreen || typeof covered.helpSections !== "function") return false;

  const entries = helpEntries([...covered.helpSections(), ...globalSections], t);
  let screen = makeMenuScreen({ title: "help.title", closable: true, entries }, t);
  screen.isHelpScreen = true;
  if (typeof covered.wrapOverlay === "function") screen = covered.wrapOverlay(screen);
  pushScreen(screen);
  return true;
}
