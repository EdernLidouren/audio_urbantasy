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
`i18n/*.js`) même si le calendrier de jeu les fait tous durer 30 jours — un
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
en place pour `defaultSurface`/`segments`.

## Lien réservé avec `lastVisited`, pas exploité

Chaque monde rangé (`core/state.js`/`travelToWorld`) note désormais `session.time`
(la minute de jeu courante) dans son `lastVisited`, plutôt qu'un simple compteur de
rangements. **Rien ne lit encore cette valeur.** C'est le crochet pour une future
simulation d'absence (modèle "Animal Crossing" : un lieu quitté pourrait évoluer, ou
simplement rattraper le temps écoulé, à la prochaine visite) — non câblée par ce
chantier.

## Phase jour/nuit — premier consommateur de l'horloge

`phaseAt(time)` (`core/time.js`, pure) dérive `"day"` | `"night"` de `hourOfDay` :
jour = `[dayStartHour, nightStartHour)`, nuit le reste (`config/time-values.js`,
défauts 6h/20h). Un seul palier de chaque côté pour l'instant — **pas** de
troisième état (aube/crépuscule). Le type de retour reste volontairement fermé à
deux cas : un consommateur exhaustif dessus n'a rien à changer le jour où une
phase intermédiaire s'ajoutera, il faudra alors étendre `phaseAt` ET ses
appelants, jamais glisser un troisième cas en silence dans l'un des deux
existants.

**Musique par phase, propriété du lieu** (`level/schema.md`) : `musicDay` /
`musicNight`, optionnels — un lieu qui n'en déclare aucun retombe sur `music`
(champ existant) pour les deux phases, aucune régression pour le contenu déjà
écrit. Même structure prévue pour l'ambiance (`ambiencesDay` / `ambiencesNight`,
validés par `parseLevel`) mais **non exploitée** — seule la musique réagit à la
phase pour l'instant.

**Réaction en VUE, sur la TRANSITION uniquement** (`view/audio/city-scene.js`) :
- `phaseAt` reste pur ; c'est la vue qui compare, à chaque tick, la phase courante
  à une phase MÉMORISÉE (`currentPhase`) — n'agit que sur la différence, jamais en
  continu.
- À l'ENTRÉE dans une scène : joue directement la musique de la phase courante
  (`resolveMusicForPhase`), sans fondu — il n'y a rien dont partir.
- À une bascule EN COURS DE JEU : fondu de sortie UNIVERSEL (`lib/audio.js`/
  `fadeOutMusic`) PUIS une respiration (même pause aléatoire que
  l'enchaînement naturel entre deux morceaux, voir `entities/model.md` et
  `level/schema.md`/"Musique : séquence avec respiration") PUIS démarrage de
  la nouvelle séquence (`switchMusicSequence`) — jamais un fondu croisé avec
  chevauchement comme avant : la sortante s'éteint, un silence s'écoule,
  l'entrante démarre directement (sans fondu d'entrée, comme à l'ouverture
  d'une scène). Durée du fondu réglable à l'oreille :
  `TUNING_DEFAULTS.musicFadeMs` (`config/tuning-values.js`, défaut 2000 ms) ;
  fourchette de respiration : `musicBreatherMinMs`/`musicBreatherMaxMs`.
- Robuste au chevauchement (ex. bascule puis transition de lieu coup sur
  coup) : un compteur de génération dans `lib/audio.js` invalide toute
  respiration/enchaînement en attente d'une séquence périmée — jamais de
  Howl fantôme, jamais deux fondus qui se disputent le canal.

## Présence conditionnelle d'entité — deuxième consommateur

`core/presence.js`/`isPresent` dérive la présence d'une entité de `session.time`
via ses règles déclaratives (`presence: [{ when, present }]`) — condition
`"timeRange"` aujourd'hui, même dérivation d'heure que `phaseAt` mais totalement
DÉCOUPLÉE de la phase jour/nuit (une entité déclare son propre horaire, ex.
`entities/types/neon.js`, "présent 20h..6h", indépendant de `dayStartHour`/
`nightStartHour`). Détail complet (l'aiguillage extensible, les trois plans
coupés par l'état dormant, la réaction vue par diff) : `entities/model.md`,
`level/schema.md`.

## Vérification manuelle (touche "t")

Sur l'écran de jeu, "t" (discrète, sans effet sur le déplacement) annonce heure et
date (canal `liveRegion`, `i18n` : clé `time.announce` + `time.season.*`/
`month.*`/`weekday.*`). C'est l'outil de test à l'oreille : jouer quelques minutes
et appuyer sur "t" régulièrement doit montrer l'heure avancer au rythme de
`TIME_SCALE`, et la date rouler correctement (minuit → jour suivant + jour de
semaine qui avance, fin de mois → mois suivant, fin d'année → saison qui repart à
`printemps`).

`view/city-screen.js`/`announceGameTime` fournit à `t("time.announce", {...})` des
composants NOMMÉS déjà résolus (`weekday`, `day`, `month`, `season`, `year`, `hour`,
`minute` — `weekday`/`month`/`season` déjà traduits via leur propre clé, comme des
sous-traductions résolues AVANT interpolation, `interpolate()` ne faisant jamais de
traduction imbriquée) : le code ignore tout de l'ORDRE d'affichage, qui vit
ENTIÈREMENT dans le gabarit `time.announce` de chaque locale (`i18n/fr.js` place le
jour avant le mois ; `i18n/en.js` le mois avant le jour) — changer de langue change
l'ordre sans toucher au code.

## Chantiers réservés, pas câblés

Au-delà de la phase jour/nuit (musique), de la présence conditionnelle
d'entité et de l'annonce de test ci-dessus, rien d'autre ne consomme encore
`session.time` :

- `ambiencesDay` / `ambiencesNight` : structure validée (voir plus haut), aucun
  fondu ni réaction câblés — même principe que la musique, pas encore fait.
- présence conditionnelle : un seul type de condition (`"timeRange"`) — pas de
  `"season"`/`"weather"`/`"questFlag"` (l'aiguillage est prêt à les accueillir,
  voir "Présence conditionnelle d'entité" plus haut) ;
- description conditionnelle d'entité (texte différent selon la phase, même
  principe que `presence` — voir `entities/model.md`) ;
- pas de troisième phase jour/nuit (aube/crépuscule) — voir "Phase jour/nuit"
  plus haut ;
- pas de simulation d'absence via `lastVisited` (voir plus haut).

Tout ça reste pour de futurs chantiers, qui LIRONT le temps sans jamais le faire
avancer eux-mêmes — `advanceTime` reste le seul point d'écriture.
