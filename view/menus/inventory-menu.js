// Écran d'INVENTAIRE à CINQ ONGLETS — Sac ("i"), Équipement ("q"),
// Améliorations ("m"), Émotes (par Tab depuis les Améliorations) et
// Collections ("c"), voir view/city-screen.js. UN SEUL écran RÉEL sur la
// pile (lib/screens.js) : il délègue à un écran-menu INTERNE
// (lib/menu.js/makeMenuScreen), reconstruit pour l'onglet actif à CHAQUE
// affichage/bascule — jamais un écran séparé par onglet. Tab / Maj+Tab
// parcourent les onglets en cycle, dans les deux sens (TAB_BINDINGS,
// résolues via lib/input.js/resolveAction, comme le reste de ce fichier).
//
// menu.title de chaque onglet EST DÉJÀ son propre nom ("Sac"/"Équipement") —
// rappeler l'onEnter de l'écran-menu interne à la bascule annonce donc
// NATURELLEMENT "<Nom de l'onglet>. <contenu>" (lib/menu.js/
// buildOpenAnnouncement) : exactement l'exigence d'accessibilité demandée
// (le nom de l'onglet AVANT son contenu), sans code d'annonce dédié.
//
// Navigation en PROFONDEUR, depuis CHAQUE onglet : LISTE -> MENU D'ACTIONS
// (TOUJOURS un menu, même à une seule action, jamais une activation directe
// imprévisible) -> SÉLECTEUR DE QUANTITÉ (uniquement "Poser" un stack > 1,
// onglet Sac). Échap/Annuler à un niveau retire SON écran et révèle celui du
// dessous, qui se réannonce (comportement natif de lib/screens.js/
// popScreen) — voir le commentaire d'executeAction
// (./inventory/bag-and-equipment.js) pour la SEULE
// exception (retour après une action réussie : Poser/Équiper/Déséquiper,
// qui saute directement à l'écran des onglets plutôt que de remonter
// niveau par niveau, et sans réannoncer par-dessus le résultat déjà dit).
//
// Ce fichier est la COQUILLE à onglets ; le contenu des onglets vit dans
// ./inventory/ :
//   - bag-and-equipment.js : Sac et Équipement, menus d'actions, sélecteur
//     de quantité, retour silencieux après une action ;
//   - progress-tabs.js : Améliorations, Émotes et Collections (lecture
//     seule).

import { pushScreen } from "../../lib/screens.js";
import { withPausedBeacons } from "../paused-beacons.js";
import { resolveAction, defineBindings } from "../../lib/input.js";
import { buildBagTabScreen, buildEquipmentTabScreen, setCurrentTabsScreen } from "./inventory/bag-and-equipment.js";
import { buildImprovementsTabScreen, buildEmotesTabScreen, buildCollectionsTabScreen } from "./inventory/progress-tabs.js";

// Gestionnaires d'état des actions du sac et de l'équipement, injectés par
// view/action-handlers.js.
export { setDropItemHandler, setEquipItemHandler, setUnequipItemHandler } from "./inventory/bag-and-equipment.js";

// Bascule d'onglet — GÉNÉRIQUE (aucune connaissance des onglets dans les
// noms d'action eux-mêmes, comme MENU_BINDINGS de lib/menu.js) : Tab avance,
// Maj+Tab recule, en cycle sur TABS (voir cycleTab).
const TAB_BINDINGS = defineBindings("inventoryTabs", {
  nextTab: { keys: ["Tab"], mods: [] },
  prevTab: { keys: ["Tab"], mods: ["shift"] },
});

// Ordre des onglets, celui du cycle Tab / Maj+Tab.
const TABS = ["bag", "equipment", "improvements", "emotes", "collections"];

function cycleTab(tab, direction) {
  const index = TABS.indexOf(tab);
  return TABS[(index + direction + TABS.length) % TABS.length];
}

// `cursor` : seul l'onglet Sac en a l'usage (voir buildBagTabScreen) — les
// listes des autres onglets ne changent pas de longueur pendant qu'on les
// parcourt, rien à repositionner de ce côté.
function buildTabScreen(tab, getWorldView, getSession, cursor) {
  if (tab === "equipment") return buildEquipmentTabScreen(getWorldView, getSession);
  if (tab === "improvements") return buildImprovementsTabScreen(getSession);
  if (tab === "emotes") return buildEmotesTabScreen(getSession);
  if (tab === "collections") return buildCollectionsTabScreen(getSession);
  return buildBagTabScreen(getWorldView, getSession, cursor);
}

// L'écran RÉEL (voir header) : reconstruit son écran-menu interne (`inner`)
// à CHAQUE onEnter (première ouverture, bascule d'onglet, OU reveal après
// la fermeture d'un sous-menu — les trois passent par ici) — jamais de
// contenu mis en cache d'un affichage à l'autre (voir
// ./inventory/bag-and-equipment.js/buildBagEntries). Balises en pause tant qu'il est ouvert
// (voir view/paused-beacons.js).
function buildInventoryTabsScreen(getWorldView, getSession, initialTab) {
  let activeTab = initialTab;
  let inner = null;
  // Consommé UNE FOIS par le prochain onEnter (voir returnSilently) : un
  // retour après une action réussie (Poser/Équiper/Déséquiper) a DÉJÀ
  // annoncé son résultat — une seconde écriture assertive coup sur coup
  // l'écraserait avant que l'utilisateur ait pu l'entendre (même
  // raisonnement que lib/menu.js/makeMessageScreen).
  let silent = false;
  // Curseur à IMPOSER au prochain rebuild, consommé UNE FOIS (même patron
  // que `silent` ci-dessus) — voir returnSilently,
  // ./inventory/bag-and-equipment.js/bagCursorAfterRemoval :
  // repositionne le focus du sac après le retrait d'une entrée plutôt que
  // de laisser rebuildInner retomber sur le défaut (index 0) de
  // lib/menu.js/makeMenuScreen.
  let pendingCursor;

  function rebuildInner() {
    inner = buildTabScreen(activeTab, getWorldView, getSession, pendingCursor);
    pendingCursor = undefined;
  }

  return withPausedBeacons({
    onEnter() {
      rebuildInner();
      if (silent) {
        silent = false;
      } else {
        inner.onEnter();
      }
    },
    onExit() {
      if (inner.onExit) inner.onExit();
      setCurrentTabsScreen(null);
    },
    onTick() {
      if (inner.onTick) inner.onTick();
    },
    // Aide des touches (lib/help.js) : les onglets, puis ce que propose
    // l'onglet courant.
    helpSections: () => [{ id: "inventoryTabs" }, ...(inner.helpSections?.() ?? [])],
    onKeyDown(event) {
      const action = resolveAction(TAB_BINDINGS, event.key, event.mods);
      if (action === "nextTab" || action === "prevTab") {
        // Comportement navigateur de Tab déjà neutralisé en amont, voir
        // lib/input.js/ALWAYS_NEUTRALIZED_BINDINGS — rien à prévenir ici.
        activeTab = cycleTab(activeTab, action === "nextTab" ? 1 : -1);
        rebuildInner();
        inner.onEnter(); // annonce "<Nom de l'onglet>. <contenu>" — voir header.
        return;
      }
      inner.onKeyDown(event);
    },
    // Voir la doc de `silent`/`pendingCursor` ci-dessus — appelé par
    // ./inventory/bag-and-equipment.js/executeAction juste avant de remonter
    // jusqu'ici. `cursor` optionnel :
    // omis (ex. Déséquiper, qui ne retire rien de la liste) -> retombe sur
    // le défaut de rebuildInner.
    returnSilently(cursor) {
      silent = true;
      pendingCursor = cursor;
    },
  }, getWorldView);
}

function openInventoryTabs(getWorldView, getSession, initialTab) {
  const screen = buildInventoryTabsScreen(getWorldView, getSession, initialTab);
  setCurrentTabsScreen(screen);
  pushScreen(screen);
}

// "i" — voir view/city-screen.js.
export function openInventoryMenu(getWorldView, getSession) {
  openInventoryTabs(getWorldView, getSession, "bag");
}

// "q" — voir view/city-screen.js.
export function openEquipmentMenu(getWorldView, getSession) {
  openInventoryTabs(getWorldView, getSession, "equipment");
}

// "m" — voir view/city-screen.js.
export function openImprovementsMenu(getWorldView, getSession) {
  openInventoryTabs(getWorldView, getSession, "improvements");
}

// "c" — voir view/city-screen.js.
export function openCollectionsMenu(getWorldView, getSession) {
  openInventoryTabs(getWorldView, getSession, "collections");
}
