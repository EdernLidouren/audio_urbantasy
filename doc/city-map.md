# Carte de la ville

Contrat de référence pour `level/city-map.js` (topologie) et
`view/menus/city-map-menu.js` (menu-carte). Voir CLAUDE.md/"Carte de la
ville" pour le résumé.

## Topologie (`level/city-map.js`)

Donnée pure (aucun import), déclarée À LA MAIN — pas de spaghetti
d'adjacences auto-calculées, la grille EST le fichier, lisible d'un coup
d'œil (une ligne de source = une ligne de carte).

- `CITY_MAP_WIDTH` / `CITY_MAP_HEIGHT` : dimensions fixes de la grille
  (5×5 aujourd'hui).
- `CITY_MAP_GRID` : tableau `[y][x]` — `y` = ligne (0 en haut), `x` =
  colonne (0 à gauche). `CITY_MAP_GRID[y][x]` est TOUJOURS l'ordre d'accès
  (voir `cityMapCellAt(x, y)`, qui l'encapsule).

Une case a l'une de TROIS natures, jamais confondues :

| Nature | Forme | Sélectionnable |
|---|---|---|
| Zone réelle | `{ levelId, nameKey, descriptionKey, spawnX }` | Oui |
| En chantier | le marqueur partagé `UNDER_CONSTRUCTION` (interne au module) | Non |
| Vide | `null` | Non |

- `levelId` : référence `level/index.js` (chargeable via `level/load.js`).
- `nameKey` / `descriptionKey` : clés i18n, jamais des chaînes déjà
  résolues (même convention que `entities/types/*.js`).
- `spawnX` : point de TÉLÉPORTATION PAR DÉFAUT de cette case — PAS
  forcément le `playerStart` du niveau (voir "Sélection" plus bas). Réservé
  pour une future case avec plusieurs entrées (playerStart reste réservé à
  l'arrivée PAR PORTE).

Accesseurs exportés (seule interface recommandée, jamais indexer
`CITY_MAP_GRID` directement en dehors de ce fichier) :

- `cityMapCellAt(x, y)` — case à `(x, y)`, `undefined` hors grille (jamais
  d'exception).
- `isRealCityMapZone(cell)` / `isCityMapUnderConstruction(cell)` —
  prédicats de nature.
- `findCityMapCoordinates(levelId)` — coordonnées `{ x, y }` de la case
  dont `levelId` correspond, ou `null` si ce lieu n'est pas (encore)
  représenté sur la carte.

**Réservé, pas codé** : une téléportation de bord de map (sortir d'une
zone par son bord réel plutôt que par une porte déclarée) réutiliserait
cette MÊME grille comme source de vérité de l'adjacence — rien à ajouter à
la structure pour ça le jour venu.

## Menu-carte (`view/menus/city-map-menu.js`)

Écran CUSTOM (objet plat consommé par `lib/screens.js`), PAS construit via
`lib/menu.js` : ce dernier réserve gauche/droite à l'ajustement
slider/toggle, incompatible avec un déplacement de curseur 2D. Ouvert
depuis le menu pause ("Carte de la ville") — REMPLACE la pause
(`popScreen()` puis `pushScreen` la carte, jamais un empilement) : une
sélection ne ferme donc que CET écran pour retomber directement sur le
jeu, jamais sur la pause restée en dessous.

- **Navigation** : flèches haut/bas/gauche/droite déplacent le curseur de
  case en case. **Comportements de bordure REPRODUITS depuis les menus
  verticaux** (`lib/menu.js`/`moveCursor`), transposés aux deux axes
  indépendamment (une touche fléchée ne bouge jamais qu'un seul axe) :
  - un bord atteint joue un son (`view/menu-sounds.js`/`playMenuSound`) —
    `"wrap"` si le cyclage boucle effectivement, `"block"` sinon ;
  - le CYCLAGE (préférence `menuCycling`, même clé que les menus
    classiques) boucle le curseur vers le bord opposé de l'axe concerné si
    activé, sinon le curseur reste sur place ;
  - dans les DEUX cas, ré-annonce de la case courante, ÉTOILÉE (`"* ..."`,
    préférence `menuStarPrefix`, même clé/mêmes règles que les menus
    classiques) — l'utilisateur doit savoir qu'il est à une limite.
- **Curseur de départ** : sur la case du lieu ACTUELLEMENT actif
  (`findCityMapCoordinates(session.activeWorldId)`), lu UNE FOIS à
  l'ouverture — repli sur `(0, 0)` si ce lieu n'est pas représenté sur la
  carte.
- **Annonce à chaque déplacement**, trois natures distinctes :
  - zone réelle : `"<nom> : <description>"` (`t(nameKey)`/`t(descriptionKey)`).
  - en chantier : `t("cityMap.underConstruction")`.
  - vide : `t("cityMap.empty")`.
- **Touche "x" — coordonnées** : annonce la position de la case courante,
  voir "Coordonnées" plus bas — indépendante du contenu de la case,
  jamais étoilée (simple consultation, pas un évènement de bordure).
- **Consultation NON DESTRUCTIVE** : ouvrir, naviguer, refermer (Échap) ne
  charge ni ne décharge RIEN — aucun accès à `core/state.js` en dehors
  d'une VRAIE sélection (voir plus bas). Échap = `popScreen()`, retour
  EXACT à l'état d'avant ouverture.
- **Pause/reprise des balises PROPRE à cet écran** (`scene.pauseBeacons()`/
  `resumeBeacons()`, composées sur `onEnter`/`onExit`) : puisqu'il REMPLACE
  le menu pause plutôt que de s'empiler dessus, il ne peut plus hériter de
  sa pause/reprise — même principe que `view/menus/pause-menu.js`, dupliqué
  ici pour la même raison (deux ÉCRANS DIFFÉRENTS, jamais simultanément
  actifs, chacun responsable de son propre passage).

## Coordonnées (`lib/coordinate-label.js`)

Brique PORTABLE (aucune connaissance d'aucun jeu, d'aucune grille concrète
ni d'aucune préférence — reçues en PARAMÈTRE par l'appelant) qui traduit
des coordonnées de grille 0-indexées internes en langage humain, pour la
touche "x" ci-dessus. Forme annoncée : `"<x> - <y>"` (ex. `"A - 1"` ou
`"1 - 1"`).

- **x (colonne)** : toujours 1-indexée. Alphabétisée si la préférence
  `cityMapAlphaCoordinates` (Options > Navigation, **oui par défaut**) est
  active — `1=A, 2=B, ..., 26=Z, 27=AA, 28=AB, ...` (numérotation
  "tableur", voir `alphaLabel`) ; sinon un nombre tel quel.
- **y (ligne)** : toujours 1-indexée, mais DEPUIS LE BAS de la grille par
  défaut (préférence `cityMapInvertY`, **non par défaut**) — la case
  BAS-gauche de la grille est donc `"1 - 1"` (ou `"A - 1"`), PAS `"1 - 1"`
  pour la case HAUT-gauche : `formatCoordinateY(y, height, inverted)` vaut
  `height - y` par défaut. Si `cityMapInvertY` est activée, le sens
  s'inverse (`y + 1`) : la case HAUT-gauche devient alors `"1 - 1"`,
  compté à l'envers du défaut.

Les deux préférences vivent dans `config/preferences.js`
(`PREF_CONSTRAINTS.cityMapAlphaCoordinates`/`cityMapInvertY`), réglables
via Options > Navigation (`view/menus/navigation-menu.js`) — lues
DIRECTEMENT par `view/menus/city-map-menu.js`, jamais via l'injection de
`lib/menu.js` (ce module-là reste portable, il ignore tout de la carte).

## Sélection

Entrée sur une case :

- **Zone réelle** : ferme la carte (`popScreen()`) PUIS délègue à
  `onSelectZone(levelId, spawnX)`, fourni par l'appelant
  (`view/city-screen.js`/`travelViaCityMap`) — ce module ignore tout de ce
  qui se passe ensuite (destroy/`travelToWorld`/recreate, voir plus bas).
- **En chantier / vide** : PAS sélectionnable — petit retour (ré-annonce
  de la case), aucun chargement.
- **Re-sélectionner sa PROPRE zone** : AUCUN cas spécial — `travelToWorld`
  range puis re-ressort le MÊME monde (éphémères purgés, comme toute
  sortie de scène), joueur replacé à `spawnX`. Recentrage volontaire
  (confort assumé, jeu sans challenge) : pas de "vous y êtes déjà".

`view/city-screen.js`/`travelViaCityMap(levelId, spawnX)` réutilise
`performTransition` — LA MÊME transition franche qu'une porte
(`transitionThroughDoor`) : `scene.destroy()` (aucun Howl résiduel),
`travelToWorld` (core, inchangé), `spawnX` REMPLACE le `playerStart` déjà
posé si fourni, nouvelle scène audio, annonce du titre, auto-save sur
transition (comme toute transition). Le core reste pur : cette fonction vit
entièrement côté vue, `travelToWorld` n'est ni modifié ni contourné.
