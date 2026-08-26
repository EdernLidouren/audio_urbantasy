# Modèle d'entité

Contrat de référence pour le contenu du jeu : la forme d'une entité, le
vocabulaire de sons qu'elle porte, l'ordre de résolution des réglages, et la
place du joueur dans ce modèle. Complète `level/schema.md` (le format des
fichiers de niveau) : ce document-ci décrit le MODÈLE de contenu, pas le
format JSON qui l'instancie.

## Le descripteur d'entité partagé

Une entité (registre `entities/types/index.js`, un fichier par archétype dans
`entities/types/` ; instance dans un fichier de niveau) porte :

| Catégorie              | Champs                                                          | Rôle |
|-------------------------|-------------------------------------------------------------------|------|
| Position                | `x` (instance uniquement, voir `level/schema.md`)                  | où l'entité se trouve dans le niveau |
| Type                    | `type` (instance), `label` (registre, clé i18n)                    | quoi et comment l'annoncer |
| Sons par rôle            | `sounds: { <rôle>: descripteur }`                                  | voir "Vocabulaire de sons" ci-dessous |
| Portée spatiale           | `audibleRange`, `panSaturation`, `interactRange`, `cutoffMin`, `cutoffMax` | où/comment une entité est perçue dans l'espace — voir "Ce qui n'est PAS un paramètre sonore" |
| Paramètres sonores        | `reverbSend`, `beaconMode`, `beaconInterval`, `beaconIntervalVariation`, `beaconGain`, `vocalInterval`, `vocalIntervalVariation`, `vocalGain`, `pitchVariation`, `movementStepMultiplier`, `movementGain` | voir "Paramètres sonores" ci-dessous, surchargeables à l'instance via `tuning` (voir "Le palier INSTANCE") |
| Drapeaux                 | `blocksMovement`, `enterable`                                      | prévus pour le core (collision, entrée), non câblés à ce jour |

Aucun de ces champs n'est obligatoire, pas même `sounds.beacon` (voir
"Beacon vs vocal" ci-dessous — une entité peut n'avoir aucun son positionné,
un seul rôle, ou les deux) : tout ce qui manque retombe sur le défaut global
(`config/tuning-values.js`).

## Vocabulaire de sons

Un descripteur de son est un objet plat :

```js
{ path, loop, reverbSend?, beaconMode?, beaconInterval?, beaconIntervalVariation?, beaconGain?, vocalInterval?, vocalIntervalVariation?, vocalGain?, pitchVariation? }
```

- `path` — chemin du fichier, sous `/sounds`. Peut être un pool (voir
  `lib/assets.js`/`resolveAsset`) : un son PONCTUEL (voir `loop` ci-dessous)
  en tire un membre à CHAQUE lecture (variété d'une occurrence à l'autre,
  sans répétition immédiate) ; une balise CONTINUE le résout UNE FOIS, à la
  création de la voix.
- `loop` — indique l'INTENTION du rôle de son (continu vs ponctuel) ; garde
  une valeur documentaire pour `movement`/`vocal` (toujours ponctuels en
  pratique), mais pour `beacon` c'est désormais `beaconMode` (voir
  "Paramètres sonores" ci-dessous) qui gouverne RÉELLEMENT le mode de
  lecture — les deux devraient rester cohérents pour un rôle donné, mais
  rien ne l'impose structurellement.
- Les autres champs (`reverbSend`, `beaconMode`/`beaconInterval`/
  `beaconIntervalVariation`/`beaconGain`, `vocalInterval`/
  `vocalIntervalVariation`/`vocalGain`, `pitchVariation`) sont tous
  optionnels et tous résolus en cascade — voir "Paramètres sonores" et
  "Résolution en cascade" ci-dessous. Absents, ils retombent sur le défaut
  du type puis sur le défaut global.

`sounds` regroupe ces descripteurs **par rôle** (une clé arbitraire du type :
`beacon`, `vocal`, `movement`, et d'autres à venir sans casser l'existant —
ex. un son d'interaction ponctuel un jour). Un rôle donné a un mode
(`loop`/`beaconMode`) cohérent avec son usage, mais rien ne l'impose
structurellement — c'est une convention respectée par ce projet, pas une
contrainte du modèle.

## Beacon vs vocal : deux rôles positionnés, deux intentions

`beacon` et `vocal` sont TECHNIQUEMENT identiques — tous deux des sons
POSITIONNÉS (même calcul pan/distance, voir `view/audio/city-scene.js`),
tous deux capables d'être intermittents via le MÊME mécanisme de
déclenchement/replanification (`resolveIntermittentSource`/
`updateIntermittentSources`). Ce qui les distingue, c'est leur INTENTION —
et donc leurs valeurs par défaut, contrastées volontairement :

- **`beacon` — LOCALISATION.** Sert à situer une entité dans l'espace :
  continu (le défaut) ou intermittent à cadence RÉGULIÈRE et RAPPROCHÉE
  (`beaconInterval`/`beaconIntervalVariation`, voir "Paramètres sonores").
  On s'attend à pouvoir suivre une balise pour retrouver l'entité.
- **`vocal` — EXPRESSION.** Sert à faire "vivre" une entité (aboiement,
  sifflement...) : TOUJOURS intermittent (aucun mode continu pour ce rôle —
  un vocal en boucle n'aurait aucun sens), à cadence LONGUE et TRÈS VARIABLE
  par défaut (`vocalInterval`/`vocalIntervalVariation`, nettement plus
  grands et plus variables que leurs équivalents beacon — voir
  `config/tuning-values.js`). On n'attend PAS de pouvoir localiser une
  entité par son seul vocal — c'est un effet d'ambiance, pas un repère.

Les deux rôles sont **optionnels et indépendants** — une entité peut avoir
un beacon seul, un vocal seul, les deux, ou ni l'un ni l'autre :
- `dog.js` (le "chien important") a les DEUX : un beacon continu pour le
  retrouver, un vocal pour l'entendre aboiement sporadiquement.
- `hound.js` (le "chien décor") a le VOCAL SEUL : on n'a pas besoin de le
  localiser, seulement de l'entendre en fond — donc pas de beacon, pas de
  bruit de repérage inutile.
- `npc.js` (le "passant") a les DEUX : un beacon "tic tic" pour le suivre,
  un vocal (sifflement) pour l'ambiance.

## Paramètres sonores

Chacun des paramètres ci-dessous est résolu par `resolveTuning` (voir
"Résolution en cascade" plus bas) : valeurs par défaut, bornes et unités
précises vivent TOUTES dans `config/tuning-values.js` (`TUNING_DEFAULTS`),
jamais reprises ici en dur — cette section explique le SENS de chaque
paramètre, pas ses chiffres, pour que la doc ne puisse jamais diverger du
code. Consulter directement ce fichier pour la valeur courante d'un défaut.

- **`reverbSend`** — part du signal de ce son envoyée au bus de réverb
  partagé de la scène. Résolue INDÉPENDAMMENT pour chaque rôle (le `beacon`,
  le `vocal` et le `movement` d'une même entité peuvent avoir des
  `reverbSend` différents — aucun ne reprend celui d'un autre rôle).
- **`beaconMode`** — mode de lecture DU BEACON UNIQUEMENT (le vocal n'en a
  pas, voir "Beacon vs vocal" plus haut : toujours intermittent), une valeur
  parmi deux littéraux : `"continu"` (une boucle positionnée permanente,
  maintenue et mise à jour à chaque tick — pan, volume, passe-bas) ou
  `"intermittent"` (rejouée en son PONCTUEL positionné, à intervalles — voir
  `beaconInterval`/`beaconIntervalVariation`). Un son intermittent n'a PAS
  de passe-bas dépendant de la distance (voir "Ce qui n'est PAS un
  paramètre sonore") : trop court pour qu'un filtre continu ait un sens.
- **`beaconInterval`** / **`beaconIntervalVariation`** — cadence d'un beacon
  `"intermittent"` : durée moyenne entre deux déclenchements, et aléa
  appliqué de part et d'autre à CHAQUE déclenchement (évite une cadence
  mécanique). Les deux en millisecondes. Sans effet en mode `"continu"`.
  Aléa NON déterministe (`Math.random`, jamais le PRNG seedé du core) : voir
  "Déterminisme et rendu audio" plus bas. Par défaut, nettement plus COURTS
  et moins VARIABLES que leurs équivalents vocal ci-dessous (voir "Beacon vs
  vocal").
- **`beaconGain`** — facteur multiplicatif propre à CE beacon (1 = neutre).
  Indépendant de la préférence utilisateur "Volume des balises" (Options >
  Audio, voir `config/preferences.js`) qui agit sur TOUS les beacons ET
  vocaux à la fois (même catégorie utilisateur "présence d'entité", voir
  `view/audio/city-scene.js`) : les deux facteurs se multiplient entre eux,
  l'un global au joueur, l'autre propre au contenu.
- **`vocalInterval`** / **`vocalIntervalVariation`** — mêmes rôles que
  `beaconInterval`/`beaconIntervalVariation`, mais pour le VOCAL (toujours
  intermittent — ces deux réglages s'appliquent donc TOUJOURS, contrairement
  à leurs équivalents beacon). Par défaut, nettement plus LONGS et plus
  VARIABLES : un vocal est sporadique par nature (voir "Beacon vs vocal"),
  pas un signal de repérage régulier. Même politique de déterminisme que
  `beaconIntervalVariation`.
- **`vocalGain`** — même principe que `beaconGain`, mais pour LE VOCAL (1 =
  neutre) — un rôle de son, un gain qui lui est propre.
- **`pitchVariation`** — variation de hauteur (fraction du taux de lecture)
  appliquée aléatoirement à un son PONCTUEL (beacon intermittent, vocal, ou
  son de déplacement) à CHAQUE lecture ; pour un beacon CONTINU, tirée UNE
  SEULE FOIS à la création de la voix (une boucle n'a pas de "déclenchement"
  répété auquel raccrocher une variation). 0 = aucune variation. Résolue
  indépendamment pour chaque rôle de son (le `beacon`, le `vocal` et le
  `movement` d'une même entité peuvent avoir des `pitchVariation`
  différentes).
- **`movementStepMultiplier`** — module la CADENCE du son de déplacement
  d'une entité (rôle `movement`) sans jamais régler une fréquence dans
  l'absolu : la distance parcourue entre deux pas reste la MÊME que celle du
  joueur (`stepDistance`, `config/tuning-values.js`), divisée par ce
  facteur. 1 = même cadence que le joueur à distance parcourue égale — voir
  "Ce qui n'est PAS un paramètre sonore" pour pourquoi la vitesse elle-même
  n'est jamais réglée ici.
- **`movementGain`** — facteur multiplicatif propre au son de déplacement
  (1 = neutre), même principe que `beaconGain` mais pour le rôle `movement`.
  Sert notamment à COMPENSER un fichier source enregistré à un niveau très
  différent des autres sons du jeu — cas réel : `dog.js` compense ainsi une
  amplitude crête mesurée ~10x plus faible que le pas du joueur, sans quoi
  le son se déclenche mais reste quasi inaudible. Un réglage de CONTENU
  (propre à l'archétype ou à l'instance), pas un curseur de mixage utilisateur.

### Déterminisme et rendu audio

`beaconIntervalVariation`, `vocalIntervalVariation` et `pitchVariation`
utilisent `Math.random()`, jamais le PRNG seedé du core (`core/rng.js`) —
même politique pour les deux intervalles, aucune raison de les traiter
différemment. C'est un aléa de RENDU pur,
sans aucun effet sur l'état de partie (position, comportement, save...).
Coupler ce genre de détail cosmétique au PRNG du core reviendrait à faire
porter à la simulation déterministe un souci qui ne la concerne pas — même
principe déjà en place pour le tirage d'un fichier dans un pool
(`lib/assets.js`/`resolveAsset`, `Math.random()` également). Deux
sauvegardes identiques rejouées à l'identique peuvent donc "sonner"
légèrement différemment sans que ce soit un bug : l'état, lui, reste
parfaitement reproductible.

## Résolution en cascade

`resolveTuning(key, entity?, sound?)` (`lib/tuning.js`, instancié dans
`config/tuning.js`) résout une clé de réglage du plus spécifique au plus
général :

1. `sound[key]` — le descripteur de son lui-même, s'il en porte un ;
2. `entity.tuning[key]` — l'instance de niveau, si elle surcharge (voir
   "Le palier INSTANCE" ci-dessous) ;
3. `registry[entity.type][key]` — le défaut du type ;
4. `defaults[key]` — le défaut global (`config/tuning-values.js`), dernier
   recours.

`entity` et `sound` sont tous deux optionnels et indépendants : un appel peut
ne fournir que `sound` (ex. un réglage propre à un descripteur de son sans
lien avec une instance de niveau — c'est le cas du joueur, voir plus bas).

Chaque paramètre sonore listé ci-dessus passe par ce même mécanisme, y
compris ceux peu ou jamais surchargés aujourd'hui — le mécanisme est
générique, rien à étendre pour en ajouter un nouveau. Exemples déjà en place
au niveau ARCHÉTYPE : `entities/types/bird.js` surcharge `beaconMode` (dans
son `sounds.beacon`) ; `entities/types/dog.js` surcharge `vocalInterval`/
`vocalIntervalVariation` (dans son `sounds.vocal`, pour aboyer plus souvent
que le défaut global) ET `movementGain` (voir "Paramètres sonores"). En
dehors de ces cas, `demo.json` ne surcharge aucun de ces paramètres au
niveau INSTANCE : la résolution retombe alors sur le défaut du type puis sur
le défaut global, exactement comme pour tout paramètre non déclaré.

### Le palier INSTANCE

Une instance de niveau (`level/*.json`) surcharge un paramètre en cascade via
un champ RÉSERVÉ, `tuning`, un objet plat de clés -> valeurs :

```json
{ "id": "bird-loud", "type": "bird", "x": 12, "tuning": { "beaconInterval": 1500, "beaconGain": 1.4 } }
```

`core/level.js`/`parseEntity` recopie ce champ TEL QUEL (`entity.tuning`) —
validé en FORME (un objet, sinon `fail()`), jamais en CONTENU : le core
ignore tout du sens de ces clés (sonore ou non), il se contente de les
porter jusqu'à l'entité parsée, exactement comme `music`/`ambiences`/
`reverbDurationSec`/`reverbDecay` au niveau du LIEU (voir `level/schema.md`).
Aucune clé nommée en dur dans `parseEntity` : un futur paramètre ajouté à
`config/tuning-values.js` devient surchargeable à l'instance sans jamais
rouvrir ce fichier. `resolveTuning` lit ensuite `entity.tuning[key]` (palier
2) — voir `lib/tuning.js`. Absent, `entity.tuning` est simplement `undefined`
et la résolution retombe sur le palier ARCHÉTYPE, comportement inchangé pour
toute entité qui ne déclare pas `tuning`.

## Surfaces de sol et son de pas

Le sol de la scène (`defaultSurface`/`segments`, voir `level/schema.md`) et
son registre (`core/surfaces.js`, `neutral: true/false` par surface) sont du
CORE pur — ce document-ci ne couvre que ce que la VUE en tire pour choisir
le fichier du son de pas (`view/audio/city-scene.js`,
`resolveFootstepPath`). Deux propriétés d'ENTITÉ, résolues par la MÊME
cascade que les paramètres sonores ci-dessus (`resolveTuning(key, entity)`,
sans `sound` — comme `audibleRange`/`panSaturation` : une propriété de
l'entité, pas d'un rôle de son) :

- **`gait`** — la CHAUSSURE/allure de l'entité (ex. `"heavy_boots"`),
  optionnelle : la plupart des entités n'en ont pas.
- **`naturalWalk`** — le pas NATUREL de l'entité (ex. `"barefoot"`), pour
  une entité qui n'a pas de gait particulier mais un pas qui lui est propre
  malgré tout. Une entité qui porte déjà son PROPRE son de déplacement
  (`sounds.movement.path`, ex. `dog.js`) n'a besoin d'AUCUN des deux : ce
  son propre sert directement de repli, voir la résolution ci-dessous.

### La règle : le sol domine, ou l'entité domine — jamais les deux

`resolveFootstepPath` choisit un fichier `"<nom>_walk"` sous
`assets/sounds/footsteps/`, en DEUX branches strictement disjointes selon
`neutral` (jamais de croisement surface×chaussure, jamais de produit
cartésien N surfaces × M gaits — chaque cran teste UN nom, une seule
dimension à la fois) :

- **Sol SPÉCIAL** (`neutral: false`, ex. `sand`, `snow`) — `"<surface>_walk"`
  si ce pool existe : LE SOL DOMINE, le `gait`/`naturalWalk` de l'entité est
  ignoré. Absent -> bascule sur la branche NEUTRE ci-dessous (un sol spécial
  sans son dédié sonne comme un sol neutre, jamais comme un silence).
- **Sol NEUTRE** (`neutral: true`, ex. `concrete`, `asphalt`) — L'ENTITÉ
  DOMINE, en cascade : `"<gait>_walk"` si un gait est résolu ET que le
  fichier existe ; sinon le pas NATUREL — `"<naturalWalk>_walk"` si résolu
  ET existant, SINON le son propre de l'entité (`sounds.movement.path`,
  s'il y en a un) ; sinon le PLANCHER GARANTI (le son de pas historique du
  jeu, `concrete_walk` — jamais vérifié, DOIT toujours exister). Trois crans
  au plus, jamais davantage.

`hasAsset` (`lib/assets.js`) teste l'existence d'un pool SANS lever ni
tirer, contrairement à `resolveAsset` — c'est ce qui permet à
`resolveFootstepPath` d'essayer un cran, constater son absence, et basculer
au suivant sans jamais planter : "ne peut jamais échouer" est une garantie
structurelle, pas une convention.

Exemple : `entities/types/buddy.js` déclare `gait: "heavy_boots"` ET
`naturalWalk: "barefoot"` — NI L'UN NI L'AUTRE fichier n'existe aujourd'hui,
la résolution dégrade donc jusqu'au son propre du compagnon
(`dog_medium_walk`), sans qu'aucun nouveau fichier soit requis et sans
changer son comportement audible. Déposer `heavy_boots_walk_*.mp3` demain
suffirait à faire marcher le compagnon différemment, sans toucher à la vue.

## Ce qui n'est PAS un paramètre sonore

Deux catégories voisines, à ne pas confondre avec les paramètres sonores
ci-dessus, même si l'audio en dépend :

- **Le comportement (vitesse de déplacement)** — `behavior.speed` (voir
  `core/behaviors/wander.js`) est une donnée du CORE : elle détermine à
  quelle vitesse une entité avance, donc indirectement À QUELLE FRÉQUENCE
  RÉELLE son son de déplacement se déclenche (plus vite = plus de distance
  parcourue par tick = pas plus rapprochés dans le temps) — mais aucun
  paramètre sonore ne règle cette fréquence dans l'ABSOLU
  (`movementStepMultiplier` ne fait que multiplier la CADENCE PAR DISTANCE,
  jamais indexée sur le temps). Régler l'allure d'une entité, c'est déclarer
  ou ajuster son `behavior` à l'instance (voir `level/schema.md`), jamais un
  paramètre sonore.
- **Les rayons** (`audibleRange`, `interactRange`, et `bodyRadius` — ce
  dernier UNIFORME pour toutes les entités aujourd'hui, voir
  `core/state.js`/`BODY_RADIUS`, pas encore par-entité) — décrivent la
  PRÉSENCE d'une entité dans l'espace (jusqu'où on l'entend, jusqu'où on
  peut interagir, quel encombrement physique) : la scène audio LES LIT pour
  façonner le volume/passe-bas d'une balise (voir `volumeForDistance`/
  `cutoffForDistance`, `view/audio/city-scene.js`), mais ce sont des
  propriétés de l'ENTITÉ elle-même, pas d'un RÔLE de son particulier —
  contrairement à `reverbSend`/`beaconGain`/`vocalGain`/`pitchVariation`,
  qui vivent à l'intérieur d'un descripteur de son précis et peuvent
  différer d'un rôle à l'autre pour la MÊME entité.

## Les sous-types sont des PRESETS, pas une hiérarchie

`door`, `npc`, `object`, `rock`, `dog`, `decor`, `bird`, `fountain`, `hound`
(un fichier par archétype sous `entities/types/`, rassemblés par
`entities/types/index.js`) sont des objets plats **indépendants** — chacun
définit l'intégralité de ses propriétés. Il n'y a ni héritage, ni classe de
base, ni "entité générique" dont les autres dériveraient : ajouter un type,
c'est ajouter un fichier autonome au dossier, jamais étendre une chaîne de
prototypes. Cohérent avec l'anti-ECS et l'anti-hiérarchie-de-classes de
`CLAUDE.md`.

`bird` (beacon `"intermittent"`) et `fountain` (beacon `"continu"`, le
défaut) illustrent ce même principe appliqué à `beaconMode` : deux PRESETS
indépendants, chacun choisissant son propre mode, sans partager de code de
résolution particulier — la même cascade générique s'applique aux deux.
`dog` (beacon + vocal + movement), `hound` (vocal seul) et `npc` (beacon +
vocal) illustrent la même chose pour la COMPOSITION LIBRE des rôles de son
positionné (voir "Beacon vs vocal" plus haut) : chaque archétype déclare
juste ce dont il a besoin, rien de plus.

## Verticalité (réservé)

`level/schema.md` documente `floors` (nombre d'étages d'un lieu) — un champ
RÉSERVÉ, totalement INERTE aujourd'hui : aucune entité de ce modèle n'a de
position d'étage, aucun son n'est rendu différemment selon l'étage. Le jour
où la verticalité sera implémentée (paliers discrets, jamais un axe Y
continu — voir `level/schema.md`), l'audio "des autres étages" (ex. un son
étouffé venant d'un étage voisin) s'appuiera sur le vocabulaire de sons
ci-dessus, pas sur un mécanisme séparé — mais rien de tout cela n'existe
encore, ce paragraphe ne fait qu'ancrer où cette future mécanique viendra se
greffer.

## Le joueur : même modèle, mais AUDITEUR

`entities/player.js` porte un descripteur de contenu qui suit le même
vocabulaire (`sounds.movement`), mais le joueur **n'est pas une entité** au
sens du niveau :

- Il n'apparaît **jamais** dans `level.entities`.
- Il n'a ni `id`, ni `type`, ni `x` dans son descripteur — sa position vient
  de `session.player.x` (l'état du core), pas d'une instance de niveau.
- La scène audio (`view/audio/city-scene.js`) ne crée **aucune voix
  positionnée** pour lui : sa position sert uniquement d'ORIGINE, celle par
  rapport à laquelle chaque entité calcule sa distance/son pan. Le joueur
  est celui qui écoute, pas quelque chose qu'on écoute depuis ailleurs.

Le son de pas (`movement`, ponctuel) est l'exception qui confirme la règle :
il est joué par `playOneShot`, centré (aucun pan), pas par une voix
positionnée maintenue comme une balise d'entité.
