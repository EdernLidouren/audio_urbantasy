// Écran-carte de la ville : navigation en GRILLE 2D (haut/bas/gauche/droite
// déplacent le curseur de case en case, BORNÉ à la grille — jamais de
// cyclage aux bords, contrairement à lib/menu.js/moveCursor) — voir
// level/city-map.js pour la topologie. Écran CUSTOM, PAS construit via
// lib/menu.js : ce module réserve déjà gauche/droite à l'ajustement
// slider/toggle, incompatible avec un déplacement de curseur 2D — même
// patron générique que view/city-screen.js (objet plat consommé par
// lib/screens.js), juste bâti à la main.
//
// CONSULTATION NON DESTRUCTIVE : ouvrir/naviguer/refermer (Échap) ne
// charge ni ne décharge RIEN — seule une SÉLECTION (Entrée) sur une zone
// RÉELLE déclenche `onSelectZone`, fourni par l'appelant (voir
// view/city-screen.js/travelViaCityMap) : ce module reste entièrement
// ignorant du cycle de vie de la scène audio (destroy/travelToWorld/
// recreate) — il délègue, jamais n'importe core/state.js lui-même.
//
// Pas de pause/reprise de balises ICI (contrairement à
// view/menus/pause-menu.js) : cet écran n'est jamais ouvert autrement que
// PAR-DESSUS le menu pause (voir son entrée "Carte de la ville"), qui a
// déjà mis les balises en pause à SA propre ouverture — rien à dupliquer.

import { t } from "../../i18n/index.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { resolveAction, checkBindingsForCollisions } from "../../lib/input.js";
import { announce } from "../../lib/announce.js";
import {
  CITY_MAP_WIDTH,
  CITY_MAP_HEIGHT,
  cityMapCellAt,
  isRealCityMapZone,
  isCityMapUnderConstruction,
  findCityMapCoordinates,
} from "../../level/city-map.js";

const CITY_MAP_BINDINGS = {
  up: { keys: ["ArrowUp"], mods: [] },
  down: { keys: ["ArrowDown"], mods: [] },
  left: { keys: ["ArrowLeft"], mods: [] },
  right: { keys: ["ArrowRight"], mods: [] },
  confirm: { keys: ["Enter", " "], mods: [] },
  cancel: { keys: ["Escape"], mods: [] },
};
checkBindingsForCollisions(CITY_MAP_BINDINGS, "view/menus/city-map-menu.js CITY_MAP_BINDINGS");

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// "<nom> : <description>" (zone réelle) / "En chantier." / "Vide." — TROIS
// annonces distinctes, jamais confondues (voir header du fichier) : le
// joueur sait TOUJOURS sur quelle nature de case porte son curseur.
function announceCell(x, y) {
  const cell = cityMapCellAt(x, y);
  if (isRealCityMapZone(cell)) {
    announce(`${t(cell.nameKey)} : ${t(cell.descriptionKey)}`, { assertive: true });
    return;
  }
  if (isCityMapUnderConstruction(cell)) {
    announce(t("cityMap.underConstruction"), { assertive: true });
    return;
  }
  announce(t("cityMap.empty"), { assertive: true });
}

// getSession : pour situer le curseur de DÉPART sur la case du lieu actif
// (voir findCityMapCoordinates) — lu UNE FOIS à l'ouverture, jamais
// resuivi ensuite (la carte ne change pas pendant qu'elle est ouverte,
// consultation non destructive — voir header). Lieu actif absent de la
// carte (pas encore atteignable autrement, cas limite) -> repli sur (0,0),
// jamais une exception. onSelectZone(levelId, spawnX) : effet de sélection
// fourni par l'appelant (voir view/city-screen.js/travelViaCityMap).
export function openCityMapMenu(getSession, onSelectZone) {
  const start = findCityMapCoordinates(getSession().activeWorldId) ?? { x: 0, y: 0 };
  let cursorX = start.x;
  let cursorY = start.y;

  // Bornée, JAMAIS de cyclage (contrairement à lib/menu.js) : à un bord de
  // la grille, la touche vers l'extérieur ne fait rien — ni mouvement ni
  // nouvelle annonce (l'annonce de la case courante reste valide, inutile
  // de la répéter).
  function moveCursor(dx, dy) {
    const nextX = clamp(cursorX + dx, 0, CITY_MAP_WIDTH - 1);
    const nextY = clamp(cursorY + dy, 0, CITY_MAP_HEIGHT - 1);
    if (nextX === cursorX && nextY === cursorY) return;
    cursorX = nextX;
    cursorY = nextY;
    announceCell(cursorX, cursorY);
  }

  // Entrée sur une zone RÉELLE -> sélection : ferme la carte PUIS délègue
  // tout le reste (destroy/travelToWorld/recreate, MÊME re-sélectionner sa
  // propre zone) à onSelectZone. Sur "en chantier"/vide : PAS
  // sélectionnable (voir header) — petit retour (ré-annonce de la case),
  // aucun chargement.
  function selectCurrent() {
    const cell = cityMapCellAt(cursorX, cursorY);
    if (!isRealCityMapZone(cell)) {
      announceCell(cursorX, cursorY);
      return;
    }
    popScreen();
    onSelectZone(cell.levelId, cell.spawnX);
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
  };

  const screen = {
    onEnter() {
      announceCell(cursorX, cursorY);
    },
    onKeyDown(event) {
      const action = resolveAction(CITY_MAP_BINDINGS, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    },
  };

  pushScreen(screen);
}
