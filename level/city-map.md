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
depuis le menu pause ("Carte de la ville").

- **Navigation** : flèches haut/bas/gauche/droite déplacent le curseur de
  case en case, BORNÉ à la grille — jamais de cyclage aux bords
  (contrairement à `lib/menu.js`/`moveCursor`) : à un bord, la touche vers
  l'extérieur ne fait rien.
- **Curseur de départ** : sur la case du lieu ACTUELLEMENT actif
  (`findCityMapCoordinates(session.activeWorldId)`), lu UNE FOIS à
  l'ouverture — repli sur `(0, 0)` si ce lieu n'est pas représenté sur la
  carte.
- **Annonce à chaque déplacement**, trois natures distinctes :
  - zone réelle : `"<nom> : <description>"` (`t(nameKey)`/`t(descriptionKey)`).
  - en chantier : `t("cityMap.underConstruction")`.
  - vide : `t("cityMap.empty")`.
- **Consultation NON DESTRUCTIVE** : ouvrir, naviguer, refermer (Échap) ne
  charge ni ne décharge RIEN — aucun accès à `core/state.js` en dehors
  d'une VRAIE sélection (voir plus bas). Échap = `popScreen()`, retour
  EXACT à l'état d'avant ouverture.
- **Pas de pause/reprise de balises propre** : cet écran n'est jamais
  ouvert autrement que par-dessus le menu pause, qui l'a déjà fait à SA
  propre ouverture.

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
