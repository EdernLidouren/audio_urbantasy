// Écran-carte de la ville : navigation en GRILLE 2D (haut/bas/gauche/droite
// déplacent le curseur de case en case) — voir map/city-map.js pour la
// topologie. Écran CUSTOM, PAS construit via lib/menu.js : ce module
// réserve déjà gauche/droite à l'ajustement slider/toggle, incompatible
// avec un déplacement de curseur 2D — même patron générique que
// view/city-screen.js (objet plat consommé par lib/screens.js), juste bâti
// à la main. Reproduit malgré tout les COMPORTEMENTS DE BORDURE des menus
// verticaux (voir lib/menu.js/moveCursor) : son de bordure (wrap/block),
// ré-annonce étoilée, cyclage — mêmes préférences (menuCycling/
// menuStarPrefix), même son (view/menu-sounds.js), lus DIRECTEMENT ici
// (jamais via lib/menu.js, qui reste un module portable et ignore tout de
// ce fichier).
//
// CONSULTATION NON DESTRUCTIVE : ouvrir/naviguer/refermer (Échap) ne
// charge ni ne décharge RIEN — seule une SÉLECTION (Entrée) sur une zone
// RÉELLE déclenche `onSelectZone`, fourni par l'appelant (voir
// view/world-travel.js/travelViaCityMap) — sauf une zone HORS PLAN (voir
// map/city-map.js/onMapWhen), annoncée "Hors plan" et refusée. Ce module
// reste entièrement
// ignorant du cycle de vie de la scène audio (destroy/travelToWorld/
// recreate), il délègue, jamais n'importe core/state.js lui-même.
//
// Cet écran REMPLACE le menu pause (voir view/menus/pause-menu.js, qui le
// popScreen() AVANT de pousser celui-ci) — jamais un empilement par-dessus
// : il gère donc SA PROPRE pause des balises (voir view/paused-beacons.js),
// rien à hériter du menu qu'il remplace.

import { t } from "../../data/i18n/index.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { withPausedBeacons } from "../paused-beacons.js";
import { resolveAction, checkBindingsForCollisions } from "../../lib/input.js";
import { announce } from "../../lib/announce.js";
import { formatCoordinate } from "../../lib/coordinate-label.js";
import { getPref, PREF_CONSTRAINTS } from "../../config/preferences.js";
import { playMenuSound } from "../menu-sounds.js";
import {
  CITY_MAP_WIDTH,
  CITY_MAP_HEIGHT,
  CITY_MAP_GRID,
  cityMapCellAt,
  isRealCityMapZone,
  isCityMapUnderConstruction,
  findCityMapCoordinates,
} from "../../map/city-map.js";
import { evaluateCondition, presenceContextOf, CONDITION_TYPES } from "../../core/presence.js";
import { IMPROVEMENT_REGISTRY } from "../../core/improvements.js";

// La grille est déclarée à la main (map/city-map.js) : une condition
// onMapWhen mal écrite échoue ICI, au chargement du module, plutôt que de
// laisser une case hors plan pour toujours en silence — même politique
// qu'une table météo cassée (core/weather.js). Vérifie la forme et, pour
// hasImprovement, que l'amélioration existe.
for (const row of CITY_MAP_GRID) {
  for (const cell of row) {
    if (!isRealCityMapZone(cell) || cell.onMapWhen === undefined) continue;
    const cond = cell.onMapWhen;
    if (typeof cond !== "object" || cond === null || !CONDITION_TYPES.includes(cond.type)) {
      throw new Error(`map/city-map.js : onMapWhen invalide pour la zone "${cell.sceneId}".`);
    }
    if (cond.type === "hasImprovement" && !Object.hasOwn(IMPROVEMENT_REGISTRY, cond.id)) {
      throw new Error(`map/city-map.js : amélioration inconnue "${cond.id}" dans onMapWhen de "${cell.sceneId}".`);
    }
  }
}

// Une zone figure-t-elle sur le plan du joueur ? Sans onMapWhen : toujours.
// Évaluée sur l'état RÉEL de la partie, jamais court-circuitée par le mode
// debug (debugShortCircuit: false) : la carte se montre telle que le
// joueur la voit, comme l'onglet Améliorations.
function isZoneOnMap(cell, session) {
  if (!cell.onMapWhen) return true;
  return evaluateCondition(cell.onMapWhen, { ...presenceContextOf(session), debugShortCircuit: false });
}

const CITY_MAP_BINDINGS = {
  up: { keys: ["ArrowUp"], mods: [] },
  down: { keys: ["ArrowDown"], mods: [] },
  left: { keys: ["ArrowLeft"], mods: [] },
  right: { keys: ["ArrowRight"], mods: [] },
  confirm: { keys: ["Enter", " "], mods: [] },
  cancel: { keys: ["Escape"], mods: [] },
  // Coordonnées de la case courante (voir lib/coordinate-label.js) —
  // touche PROPRE à cet écran, sans rapport avec "x"/debugPosition de
  // view/city-screen.js (tables de bindings totalement indépendantes, voir
  // lib/screens.js : seul le sommet de la pile reçoit le clavier).
  coordinates: { keys: ["x"], mods: [] },
};
checkBindingsForCollisions(CITY_MAP_BINDINGS, "view/menus/city-map-menu.js CITY_MAP_BINDINGS");

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function cityMapAlphaPref() {
  return getPref("cityMapAlphaCoordinates", PREF_CONSTRAINTS.cityMapAlphaCoordinates.default);
}
function cityMapInvertYPref() {
  return getPref("cityMapInvertY", PREF_CONSTRAINTS.cityMapInvertY.default);
}

// "<nom> : <description>" (zone réelle) / "Hors plan." / "En chantier." /
// "Vide." — textes distincts, jamais confondus (voir header du fichier).
// Hors plan sur la case où se trouve le joueur : il est situé ("vous êtes
// ici"), sans que la zone soit révélée.
function cellAnnouncementText(x, y, session) {
  const cell = cityMapCellAt(x, y);
  if (isRealCityMapZone(cell) && !isZoneOnMap(cell, session)) {
    return t(cell.sceneId === session.activeWorldId ? "cityMap.offMapHere" : "cityMap.offMap");
  }
  if (isRealCityMapZone(cell)) return `${t(cell.nameKey)} : ${t(cell.descriptionKey)}`;
  if (isCityMapUnderConstruction(cell)) return t("cityMap.underConstruction");
  return t("cityMap.empty");
}

// Étoile en tête d'annonce ("* ..."), désactivable via "menuStarPrefix" —
// MÊME préférence, MÊME principe que lib/menu.js/announceMaybeStarred :
// marqueur pour les utilisateurs braille/sans son face à une bordure
// atteinte (cyclage bouclé ou refusé). starred=false : jamais d'étoile.
function announceMaybeStarred(text, starred) {
  const prefixed = starred && getPref("menuStarPrefix", PREF_CONSTRAINTS.menuStarPrefix.default) ? `* ${text}` : text;
  announce(prefixed, { assertive: true });
}

// getSession : pour situer le curseur de DÉPART sur la case du monde actif
// (voir findCityMapCoordinates) — lu UNE FOIS à l'ouverture, jamais
// resuivi ensuite (la carte ne change pas pendant qu'elle est ouverte,
// consultation non destructive — voir header). Monde actif absent de la
// carte (pas encore atteignable autrement, cas limite) -> repli sur (0,0),
// jamais une exception. onSelectZone(sceneId, spawnX) : effet de sélection
// fourni par l'appelant (voir view/world-travel.js/travelViaCityMap).
// getWorldView : la vue du monde courante, voir header.
export function openCityMapMenu(getWorldView, getSession, onSelectZone) {
  const start = findCityMapCoordinates(getSession().activeWorldId) ?? { x: 0, y: 0 };
  let cursorX = start.x;
  let cursorY = start.y;

  // Bordure : MÊME comportement que lib/menu.js/moveCursor, transposé aux
  // DEUX axes indépendamment — un appel ne fait jamais varier x ET y à la
  // fois (chaque touche fléchée ne bouge qu'un seul axe, voir
  // keyHandlers), donc au plus UNE des deux conditions ci-dessous est
  // vraie par appel. À la bordure : son (wrap si le cyclage a lieu, block
  // sinon), cyclage EFFECTIF seulement si la préférence l'autorise
  // (menuCycling), ré-annonce TOUJOURS étoilée (bouclé ou refusé,
  // l'utilisateur doit savoir qu'il est à une limite). Le modulo
  // (x+dx+WIDTH)%WIDTH est un no-op sûr sur l'axe qui n'a pas bougé (dx ou
  // dy vaut 0), appliqué aux deux sans distinction.
  function moveCursor(dx, dy) {
    const hitBoundary =
      (dx < 0 && cursorX === 0) ||
      (dx > 0 && cursorX === CITY_MAP_WIDTH - 1) ||
      (dy < 0 && cursorY === 0) ||
      (dy > 0 && cursorY === CITY_MAP_HEIGHT - 1);

    if (hitBoundary) {
      const cyclingAllowed = getPref("menuCycling", PREF_CONSTRAINTS.menuCycling.default);
      playMenuSound(cyclingAllowed ? "wrap" : "block");
      if (cyclingAllowed) {
        cursorX = (cursorX + dx + CITY_MAP_WIDTH) % CITY_MAP_WIDTH;
        cursorY = (cursorY + dy + CITY_MAP_HEIGHT) % CITY_MAP_HEIGHT;
      }
      announceMaybeStarred(cellAnnouncementText(cursorX, cursorY, getSession()), true);
      return;
    }

    cursorX += dx;
    cursorY += dy;
    announceMaybeStarred(cellAnnouncementText(cursorX, cursorY, getSession()), false);
  }

  // Coordonnées de la case COURANTE (touche "x", voir header) — jamais
  // étoilée (simple consultation, pas un évènement de bordure).
  function announceCoordinates() {
    const label = formatCoordinate(cursorX, cursorY, CITY_MAP_HEIGHT, {
      alphaX: cityMapAlphaPref(),
      invertY: cityMapInvertYPref(),
    });
    announce(label, { assertive: true });
  }

  // Entrée sur une zone RÉELLE -> sélection : ferme la carte PUIS délègue
  // tout le reste (destroy/travelToWorld/recreate, MÊME re-sélectionner sa
  // propre zone) à onSelectZone. Sur "en chantier"/vide : PAS
  // sélectionnable (voir header) — petit retour (ré-annonce de la case,
  // non étoilée), aucun chargement.
  function selectCurrent() {
    const cell = cityMapCellAt(cursorX, cursorY);
    if (!isRealCityMapZone(cell)) {
      announceMaybeStarred(cellAnnouncementText(cursorX, cursorY, getSession()), false);
      return;
    }
    // Hors plan : refus (son + message), même si le joueur s'y trouve.
    if (!isZoneOnMap(cell, getSession())) {
      playMenuSound("refusal");
      announce(t("cityMap.offMapRefusal"), { assertive: true });
      return;
    }
    popScreen();
    onSelectZone(cell.sceneId, cell.spawnX);
  }

  const keyHandlers = {
    up: () => moveCursor(0, -1),
    down: () => moveCursor(0, 1),
    left: () => moveCursor(-1, 0),
    right: () => moveCursor(1, 0),
    confirm: () => selectCurrent(),
    // Non-destructif par construction : popScreen() sans jamais toucher à
    // la session ni à la scène (voir header) — retour EXACT à l'état
    // d'avant ouverture.
    cancel: () => popScreen(),
    coordinates: () => announceCoordinates(),
  };

  const screen = {
    onEnter() {
      announceMaybeStarred(cellAnnouncementText(cursorX, cursorY, getSession()), false);
    },
    onKeyDown(event) {
      const action = resolveAction(CITY_MAP_BINDINGS, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    },
  };

  pushScreen(withPausedBeacons(screen, getWorldView));
}
