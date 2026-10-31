# Horloge de partie

Référence pour le système de temps : le compteur, ses dérivations, le calendrier
simplifié, l'avancement accéléré, la pause, la persistance, et son premier
consommateur (la phase jour/nuit). Ce document décrit le cœur temporel
(`core/time.js` + `session.time`) ET ce premier consommateur — le reste (événements
datés, simulation d'absence...) n'est pas câblé, voir "Chantiers réservés, pas
câblés" en fin de document.

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
| `weekdayOf`      | jour de semaine, index 0-6 (voir `WEEKDAY_KEYS`, "Jour de semaine" plus bas) |
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

Les MOIS gardent leurs noms grégoriens (janvier..décembre, `MONTH_KEYS`,
`data/i18n/*/status.json`) même si le calendrier de jeu les fait tous durer 30 jours — un
choix de NOMS, pas une reconstitution du calendrier lui-même.

## Jour de semaine

`weekdayOf(time)` : dérivation PURE, comme les autres — jours écoulés depuis
l'origine (`Math.floor(time / MINUTES_PER_DAY)`, le jour 1 valant 0 jour
écoulé) MODULO 7, décalés par `weekdayOrigin` (`config/time-values.js` :
jour de semaine du jour 1, 0 = lundi dans `WEEKDAY_KEYS`). PAS un découpage
en semaines calées sur le mois/l'année : un cycle de 7 qui tourne en continu
sur le compteur unique, indépendant des frontières de mois/année.

Conséquence ASSUMÉE, pas un bug : l'année de jeu fait 360 jours, non
multiple de 7 — le jour de semaine du jour 1 d'une année dérive donc d'une
année sur l'autre (l'année 2 ne commence pas nécessairement le même jour de
semaine que l'année 1). Sans conséquence tant qu'aucun gameplay ne se cale
sur un jour de semaine précis.

## Avancement accéléré

`TIME_CONFIG.timeScale` (`config/time-values.js`, défaut 60) : minutes de jeu par
seconde réelle. Avec 60, une journée de jeu (24 h) dure 24 minutes réelles. Seul le
menu debug du temps (Shift+T) le modifie, temporairement (`setTimeScale`/
`resetTimeScale`, retour à la valeur de référence `DEFAULT_TIME_SCALE`) ; relu à
chaque frame, un changement prend effet aussitôt.

Le core ne lit **jamais** l'horloge réelle — `advanceTime(session, minutes)` est la
SEULE fonction qui avance le compteur, et `minutes` est un delta déjà exprimé en
minutes de jeu, mesuré et converti au BORD :

1. `lib/loop.js` mesure le delta réel écoulé entre deux frames `requestAnimationFrame`
   (`performance.now`, PAS le nombre de ticks à pas fixe exécutés — un tick catch-up
   en rafale après une frame lente ne doit jamais accélérer ou ralentir l'horloge par
   rapport au temps réel). Ce delta est exposé via un second paramètre optionnel de
   `startLoop(onTick, onFrame)`, routé à l'écran actif au sommet de la pile via
   `lib/screens.js`/`tickFrame` (même mécanisme que `tickActive`/`onTick`).
2. `view/game-clock.js`/`onFrame(deltaMs)` convertit ce delta en minutes de jeu :
   `minutes = (deltaMs / 1000) * (TIME_CONFIG.timeScale / minutesPerHour)`, puis
   avance l'horloge (`advance`, voir "Triggers horaires" plus bas) par
   `advanceTime(session, minutes)`.

Même delta injecté → même compteur résultant : le déterminisme du core
s'étend donc à l'horloge, malgré sa source réelle (l'horloge murale) —
c'est la conversion au bord qui absorbe cette impureté, jamais le core lui-même.

## Pause gratuite par construction

Le temps n'avance QUE quand `onFrame` reçoit un delta. Deux gels vérifiés
(`core/checks/time.check.js` pour le premier ; le second se déduit du même mécanisme,
non testable en terminal) :

- **Menu/pause ouvert** : la pile d'écrans (`lib/screens.js`) ne route `onTick`/
  `onFrame` qu'au sommet. Un menu poussé par-dessus la ville en devient le sommet —
  `onFrame` de la ville n'est simplement plus appelé, sans condition à écrire nulle
  part pour ça.
- **Transition de scène** : la lecture d'une scène jamais visitée se fait sous un
  écran vide poussé sur la pile (`view/world-travel.js`/`loadTargetScene`, comme le
  sas d'une porte) — même gel que le menu ci-dessus. Et sans vue du monde, `onFrame`
  de la ville s'en garde exactement comme `onTick` (`view/city-screen.js`) : aucun
  delta injecté pendant le chargement, le temps ne "mange" rien.

## Persistance

`session.time` est un nombre plat : couvert par construction par l'audit de
sérialisabilité (`core/checks/save.check.js`), étendu explicitement à ce champ. Une
sauvegarde sans cette clé est rebouchée à `INITIAL_TIME` par
`core/save.js`/`migrateSave`, même principe que le rebouchage de
`defaultSurface`/`segments`.

## Lien réservé avec `lastVisited`, pas exploité

Chaque monde rangé (`core/state.js`/`travelToWorld`) note `session.time` (la minute
de jeu courante) dans son `lastVisited`. **Rien ne lit encore cette valeur.** C'est le
crochet pour une future simulation d'absence (modèle "Animal Crossing" : un monde quitté pourrait évoluer, ou
simplement rattraper le temps écoulé, à la prochaine visite) — non câblée.

## Phase jour/nuit — premier consommateur de l'horloge

`phaseAt(time)` (`core/time.js`, pure) dérive `"day"` | `"night"` de `hourOfDay` :
jour = `[dayStartHour, nightStartHour)`, nuit le reste (`config/time-values.js`,
défauts 6h/20h). Un seul palier de chaque côté pour l'instant — **pas** de
troisième état (aube/crépuscule). Le type de retour reste volontairement fermé à
deux cas : un consommateur exhaustif dessus n'a rien à changer le jour où une
phase intermédiaire s'ajoutera, il faudra alors étendre `phaseAt` ET ses
appelants, jamais glisser un troisième cas en silence dans l'un des deux
existants.

**Musique par phase, propriété de la scène** (`doc/scene-format.md`) : `musicDay` /
`musicNight`, optionnels — une scène qui n'en déclare aucun retombe sur `music`
pour les deux phases. Même structure pour l'ambiance (`ambiencesDay` /
`ambiencesNight`, retombant sur `ambiences`) — une liste vide déclarée pour une
phase y signifie silence.

**Réaction en VUE, sur la TRANSITION uniquement** (musique et ambiances : `view/audio/layers.js` ;
annonce « La nuit tombe. » / « Le jour se lève. » : `view/ambient-announcements.js`) :
- `phaseAt` reste pur ; c'est la vue qui compare, à chaque tick, la phase courante
  à une phase MÉMORISÉE (`currentPhase`) — n'agit que sur la différence, jamais en
  continu.
- À l'ENTRÉE dans une scène : joue directement la musique de la phase courante
  (`resolveMusicForPhase`), sans fondu — il n'y a rien dont partir.
- À une bascule EN COURS DE JEU : fondu de sortie UNIVERSEL (`lib/audio.js`/
  `fadeOutMusic`) PUIS une respiration (même pause aléatoire que
  l'enchaînement naturel entre deux morceaux, voir `doc/entity-model.md` et
  `doc/scene-format.md`/"Musique : séquence avec respiration") PUIS démarrage de
  la nouvelle séquence (`switchMusicSequence`) — jamais un fondu croisé avec
  chevauchement : la sortante s'éteint, un silence s'écoule,
  l'entrante démarre directement (sans fondu d'entrée, comme à l'ouverture
  d'une scène). Durée du fondu réglable à l'oreille :
  `TUNING_DEFAULTS.musicFadeMs` (`config/tuning-values.js`, défaut 2000 ms) ;
  fourchette de respiration : `musicBreatherMinMs`/`musicBreatherMaxMs`.
- Robuste au chevauchement (ex. bascule puis transition de scène coup sur
  coup) : un compteur de génération dans `lib/audio/music.js` invalide toute
  respiration/enchaînement en attente d'une séquence périmée — jamais de
  Howl fantôme, jamais deux fondus qui se disputent le canal.
- Les AMBIANCES suivent la même transition, plus simplement : fondu croisé
  vers celles de la nouvelle phase (`resolveAmbiencesForPhase`), sans
  respiration, et rien du tout si la liste est la même aux deux phases.

## Présence conditionnelle d'entité — deuxième consommateur

`core/presence.js`/`isPresent` dérive la présence d'une entité de `session.time`
via ses règles déclaratives (`presence: [{ when, present }]`) — condition
`"timeRange"` aujourd'hui, même dérivation d'heure que `phaseAt` mais totalement
DÉCOUPLÉE de la phase jour/nuit (une entité déclare son propre horaire, ex.
`entities/types/neon.js`, "présent 22h..6h", indépendant de `dayStartHour`/
`nightStartHour`). Détail complet (l'aiguillage extensible, les trois plans
coupés par l'état dormant, la réaction vue par diff) : `doc/entity-model.md`,
`doc/scripting.md`, `doc/scene-format.md`.

## Cycle de collecte quotidien — troisième consommateur

`core/spawn.js`/`spawnCycleAt(time)` dérive un INDEX DE CYCLE (jours écoulés
depuis l'origine, frontière à `config/spawn-values.js`/`SPAWN_CYCLE_HOUR`,
minuit) — dérivation PURE comme les autres, jamais stockée à part. Le moteur
de collecte le compare au dernier cycle matérialisé d'un monde
(`world.spawnCycle`) AU CHARGEMENT du monde : aucun code ne s'exécute au
tick ni dans `onFrame` — le temps avance, la collecte le LIT. Détail complet
(sources, file, persistance) : `doc/entity-model.md`/"Collecte".

## Triggers horaires — quatrième consommateur

`core/triggers.js`/`applyDueTriggers` compare l'index d'heure ABSOLU d'avant
et d'après chaque avancement (`hourChanged`) et exécute les triggers
`{ on: "hour", hour?, condition?, effects }` déclarés par les entités du
monde actif (ses deux faces) et par les compagnons —
sur TRANSITION seulement, à l'heure d'ARRIVÉE seulement (un saut de
plusieurs heures ne rejoue pas les heures franchies). Câblé au SEUL point
d'avancement de l'horloge en ville (`view/game-clock.js`/`advance` :
temps, puis météo, puis triggers — `onFrame` ET le saut du menu debug) :
la pause gèle donc les triggers avec l'horloge, sans code dédié. Grammaire
et sémantique complètes : `doc/scripting.md`/"Triggers".

## Vérification manuelle (touche "t")

Sur l'écran de jeu, "t" (discrète, sans effet sur le déplacement) annonce heure et
date (canal `liveRegion`, `i18n` : clé `time.announce` + `time.season.*`/
`month.*`). C'est l'outil de test à l'oreille : jouer quelques minutes
et appuyer sur "t" régulièrement doit montrer l'heure avancer au rythme de
`TIME_CONFIG.timeScale`, et la date rouler correctement (minuit → jour suivant, fin de mois →
mois suivant, fin d'année → saison qui repart à `printemps`).

`view/status-announcements.js`/`announceGameTime` fournit à `t("time.announce", {...})` des
composants NOMMÉS déjà résolus (`day`, `month`, `season`, `year`, `hour`, `minute` —
`month`/`season` déjà traduits via leur propre clé, comme des sous-traductions
résolues AVANT d'être passées au gabarit) : le code ignore tout de l'ORDRE d'affichage, qui vit ENTIÈREMENT dans le
gabarit `time.announce` de chaque locale — forme commune "heure, jour mois, saison,
année" (`data/i18n/fr/status.json` place le jour avant le mois ;
`data/i18n/en/status.json` le mois avant le jour, forme "heure, mois jour, saison,
année"). Le jour est un NOMBRE, accordé en ordinal par le gabarit
(`selectordinal`, voir `doc/i18n.md`/"Grammaire des textes") : « 1er janvier »,
« 2 janvier » ; « January 1st », « January 22nd ». Changer de langue, réordonner, ou
retirer un composant ne touche QUE ce gabarit, jamais le code. `weekday`
(`core/time.js`/`weekdayOf`, `WEEKDAY_KEYS`) reste dérivable mais n'est pas fourni
à ce gabarit — sa dérivation pure est testée indépendamment (voir
`core/checks/time.check.js`), prête pour un futur gabarit qui la redemanderait.

## Chantiers réservés, pas câblés

Au-delà de la phase jour/nuit (musique, ambiances), de la présence conditionnelle
d'entité, du cycle de collecte quotidien, des triggers horaires et de
l'annonce de test ci-dessus, rien d'autre ne consomme encore `session.time` :

- présence conditionnelle : seule `"timeRange"` dérive du TEMPS (les autres
  types de condition, voir `doc/scripting.md`, lisent autre chose) — aucune
  condition `"season"` ni autre dérivation calendaire n'existe encore ;
- description conditionnelle d'entité (texte différent selon la phase, même
  principe que `presence` — voir `doc/entity-model.md`) ;
- pas de troisième phase jour/nuit (aube/crépuscule) — voir "Phase jour/nuit"
  plus haut ;
- pas de simulation d'absence via `lastVisited` (voir plus haut).

Tout ça reste pour de futurs chantiers, qui LIRONT le temps sans jamais le faire
avancer eux-mêmes — `advanceTime` reste le seul point d'écriture.
