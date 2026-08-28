# Horloge de partie

Référence pour le système de temps : le compteur, ses dérivations, le calendrier
simplifié, l'avancement accéléré, la pause, la persistance. Ce document décrit
UNIQUEMENT le cœur temporel (`core/time.js` + `session.time`). Rien dans le jeu ne
consomme encore ce temps (pas de jour/nuit, pas d'événements) — voir "Chantiers
réservés, pas câblés" en fin de document.

## Source de vérité unique

`session.time` est un seul nombre : les minutes de jeu écoulées depuis l'origine de
la partie (jour 1, mois 1, à `TIME_CONFIG.startHour`:00 — voir `config/time-values.js`
pour la valeur). Rien d'autre n'est stocké — pas de champ `hour`, `day`, `month`
séparé. Toute unité affichable se DÉRIVE de ce seul nombre, par division entière,
dans `core/time.js` :

| Fonction         | Renvoie                              |
|------------------|---------------------------------------|
| `minuteOfHour`   | minute dans l'heure courante, 0-59    |
| `hourOfDay`      | heure dans le jour courant, 0-23      |
| `dayOfMonth`     | jour dans le mois courant, 1-30       |
| `monthOfYear`    | mois dans l'année courante, 1-12      |
| `seasonOfYear`   | index de saison, 0-3 (voir `SEASON_KEYS`) |
| `yearNumber`     | année de partie, 1-indexée            |

Les secondes ne sont **jamais** exposées : la granularité affichable est la minute
de jeu. `session.time` lui-même peut porter une fraction de minute (voir "Avancement
accéléré" ci-dessous) — seules les fonctions de dérivation la tronquent
(`Math.floor`), jamais le compteur stocké.

## Calendrier simplifié

Pas une reconstitution du calendrier grégorien : 12 mois de longueur ÉGALE (30
jours chacun, donc 360 jours/an), 4 saisons de 3 mois (90 jours), aucune année
bissextile. Choisi pour que chaque dérivation reste une division entière simple —
jamais de table de longueurs de mois irrégulière, jamais de règle bissextile à
maintenir.

Toutes les longueurs (`minutesPerHour`, `hoursPerDay`, `daysPerMonth`,
`monthsPerYear`, `monthsPerSeason`) sont des constantes déclaratives dans
`config/time-values.js` (`TIME_CONFIG`), zéro import, lues directement par
`core/time.js` — jamais codées en dur dans la logique de dérivation.

## Avancement accéléré

`TIME_SCALE` (`config/time-values.js`, défaut 60) : minutes de jeu par seconde
réelle. Avec 60, une journée de jeu (24 h) dure 24 minutes réelles.

Le core ne lit **jamais** l'horloge réelle — `advanceTime(session, minutes)` est la
SEULE fonction qui avance le compteur, et `minutes` est un delta déjà exprimé en
minutes de jeu, mesuré et converti au BORD :

1. `lib/loop.js` mesure le delta réel écoulé entre deux frames `requestAnimationFrame`
   (`performance.now`, PAS le nombre de ticks à pas fixe exécutés — un tick catch-up
   en rafale après une frame lente ne doit jamais accélérer ou ralentir l'horloge par
   rapport au temps réel). Ce delta est exposé via un second paramètre optionnel de
   `startLoop(onTick, onFrame)`, routé à l'écran actif au sommet de la pile via
   `lib/screens.js`/`tickFrame` (même mécanisme que `tickActive`/`onTick`).
2. `view/city-screen.js`/`onFrame(deltaMs)` convertit ce delta en minutes de jeu :
   `minutes = (deltaMs / 1000) * (TIME_SCALE / minutesPerHour)`, puis appelle
   `advanceTime(getSession(), minutes)`.

Même delta injecté → même compteur résultant : le déterminisme du core (voir
CLAUDE.md) s'étend donc à l'horloge, malgré sa source réelle (l'horloge murale) —
c'est la conversion au bord qui absorbe cette impureté, jamais le core lui-même.

## Pause gratuite par construction

Le temps n'avance QUE quand `onFrame` reçoit un delta. Deux gels vérifiés
(`core/movement.check.js` pour le premier ; le second se déduit du même mécanisme,
non testable en terminal) :

- **Menu/pause ouvert** : la pile d'écrans (`lib/screens.js`) ne route `onTick`/
  `onFrame` qu'au sommet. Un menu poussé par-dessus la ville en devient le sommet —
  `onFrame` de la ville n'est simplement plus appelé, sans condition à écrire nulle
  part pour ça.
- **Transition de scène** : `scene` reste `null` le temps d'un éventuel chargement
  réseau (voir `view/city-screen.js`/`transitionThroughDoor`). `onFrame` s'en garde
  exactement comme `onTick` (`if (!scene) return;`) — aucun delta injecté pendant le
  chargement, le temps ne "mange" rien.

## Persistance

`session.time` est un nombre plat : couvert par construction par l'audit de
sérialisabilité (`core/movement.check.js`), étendu explicitement à ce champ. Une
sauvegarde antérieure à l'introduction de l'horloge n'a jamais eu cette clé — rebouchée
à `INITIAL_TIME` par `core/save.js`/`migrateSave`, même principe que le rebouchage déjà
en place pour `floors`/`defaultSurface`/`segments`.

## Lien réservé avec `lastVisited`, pas exploité

Chaque monde rangé (`core/state.js`/`travelToWorld`) note désormais `session.time`
(la minute de jeu courante) dans son `lastVisited`, plutôt qu'un simple compteur de
rangements. **Rien ne lit encore cette valeur.** C'est le crochet pour une future
simulation d'absence (modèle "Animal Crossing" : un lieu quitté pourrait évoluer, ou
simplement rattraper le temps écoulé, à la prochaine visite) — non câblée par ce
chantier.

## Vérification manuelle (touche "t")

Sur l'écran de jeu, "t" (discrète, sans effet sur le déplacement) annonce heure puis
date (canal `liveRegion`, `i18n` : clé `time.announce` + `time.season.*`). C'est
l'outil de test à l'oreille : jouer quelques minutes et appuyer sur "t" régulièrement
doit montrer l'heure avancer au rythme de `TIME_SCALE`, et la date rouler
correctement (minuit → jour suivant, fin de mois → mois suivant, fin d'année → saison
qui repart à `printemps`).

## Chantiers réservés, pas câblés

Ce prompt pose uniquement le cœur temporel. Rien ne consomme encore `session.time`
en dehors de l'annonce de test ci-dessus :

- pas de cycle jour/nuit (rendu, audio d'ambiance selon l'heure...) ;
- pas d'événements datés (PNJ absent la nuit, ambiance saisonnière...) ;
- pas de simulation d'absence via `lastVisited` (voir plus haut).

Tout ça reste pour de futurs chantiers, qui LIRONT le temps sans jamais le faire
avancer eux-mêmes — `advanceTime` reste le seul point d'écriture.
