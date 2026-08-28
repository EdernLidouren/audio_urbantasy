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
| Paramètres sonores        | `reverbSend`, `beaconMode`, `beaconInterval`, `beaconIntervalVariation`, `beaconGain`, `vocalInterval`, `vocalIntervalVariation`, `vocalGain`, `pitchVariation`, `movementStepMultiplier`, `movementGain`, `enterSoundGain`, `exitSoundGain` | voir "Paramètres sonores" ci-dessous, surchargeables à l'instance via `tuning` (voir "Le palier INSTANCE") |
| Drapeaux                 | `blocksMovement`                                                   | collision (core) |
| Capacités d'interaction  | `observable`, `interactable` (cascade instance -> type, comme `blocksMovement`) | voir "Interaction (niveau 0)" plus bas |
| Présence conditionnelle  | `presence` (cascade instance -> type, comme `blocksMovement`)      | voir "Présence conditionnelle" plus bas |

Aucun de ces champs n'est obligatoire, pas même `sounds.beacon` (voir
"Beacon vs vocal" ci-dessous — une entité peut n'avoir aucun son positionné,
un seul rôle, ou les deux) : tout ce qui manque retombe sur le défaut global
(`config/tuning-values.js`).

## Interaction (niveau 0)

Deux capacités INDÉPENDANTES (`observable`, `interactable`, booléens,
cascade instance -> type -> défaut `false` — voir `core/level.js`) : les
QUATRE combinaisons sont valides, aucun cas spécial. Chaque verbe (Espace /
Entrée, voir `view/interaction.js`) ne considère QUE les entités portant SA
capacité — un décor `observable:false` n'apparaît JAMAIS candidat à Espace,
une balise `interactable:false` jamais candidate à Entrée, même à portée.

- **`observable`** — candidate à Espace (description riche, voir plus bas).
  Exemples : `rock`/`bird`/`fountain`/`hound`/`dog`/`buddy`/`neon`
  (observables, non interactables), `decor` (aucune des deux — preset de
  référence pour ce cas, voir `entities/types/decor.js`).
- **`interactable`** — candidate à Entrée. Aujourd'hui, une action
  GÉNÉRIQUE (stub, voir `view/interaction.js`/`interact`) — sauf `door`, qui
  déclenche déjà sa transition. `npc`/`object` sont interactables dès ce
  niveau 0 EN ANTICIPATION d'un futur type d'action différencié
  (parler/ramasser — pas codé ici, voir le commentaire "IMPORTANT" dans
  `core/level.js`/`parseEntity`) : le booléen d'aujourd'hui n'est qu'une
  valeur POSSIBLE du champ, une entité future pourra y porter un descripteur
  plus riche (ex. `{ type: "talk" }`) sans que le FILTRAGE par verbe n'ait à
  changer — il ne teste jamais que la véracité du champ (`Boolean(...)`),
  jamais son type exact.

Deux niveaux de PERCEPTION, à ne pas confondre :

- **Occupation** (couche légère, inchangée) : le NOM de l'entité, annoncé à
  l'approche (`view/audio/city-scene.js`/`occupiedEntities`) — ne connaît
  aucune capacité, toute entité à portée y figure.
- **Observation** (Espace, couche riche) : la DESCRIPTION d'une entité
  `observable` ciblée. Résolue via une INDIRECTION
  (`view/interaction.js`/`resolveDescription`) plutôt qu'un accès direct à
  `descriptionKey` : aujourd'hui une simple clé i18n, demain une entité
  pourra fournir une description DYNAMIQUE (méthode plutôt que clé statique)
  en changeant SEULEMENT cette fonction, jamais ses appelants.

Résolution de candidats PAR VERBE
(`view/audio/city-scene.js`/`getInteractionCandidates(kind)`) : filtre
l'ensemble d'occupation courant par la capacité du verbe pressé
(`observable` pour Espace, `interactable` pour Entrée) — MÊME portée
(`interactRange`) que l'occupation, pas de zone séparée. La désambiguïsation
(`view/interaction.js`/`chooseInteractionTarget`) n'est JAMAIS dupliquée ni
rendue consciente du verbe elle-même : elle reçoit un ensemble DÉJÀ filtré,
donc un menu ne s'ouvre que s'il y a PLUSIEURS candidats POUR CE VERBE
précis (une entité interactable au milieu de trois observables : Entrée agit
direct, Espace ouvre un menu à trois). Aucun candidat -> `null` ->
SILENCE TOTAL, jamais un son ou une annonce vide (accessibilité assumée : un
bip parasite pollue plus qu'il n'informe).

## Présence conditionnelle et triggers de comportement

`presence` (optionnel, `core/presence.js`) : une liste de RÈGLES
`{ when: <condition>, effects: [<effet>...] }`, évaluées DANS L'ORDRE
chaque tick. Sans ce champ, une entité reste TOUJOURS présente (comportement
d'avant ce système, inchangé). RACCOURCI rétrocompatible : `{ when, present:
boolean }` sans `effects`, sucre pour `{ when, effects: [{ type: "presence",
present }] }` — voir `entities/types/neon.js` (une seule règle `{ when: {
type: "timeRange", from, to }, present: true }` suffit : le reste de la
journée n'étant simplement couvert par aucune règle).

### Présence : la valeur résolue

Parmi les règles dont `when` est vrai, la PREMIÈRE qui porte un effet
`"presence"` fixe la présence de l'entité pour ce tick (les règles qui
matchent mais n'en portent pas — ex. une règle purement comportementale —
sont ignorées pour CETTE décision, la recherche continue). Aucune règle
couvrante -> DORMANTE par défaut (une entité n'est "montrée" que par une
règle qui la couvre explicitement).

Dormante = un seul drapeau qui coupe TROIS plans d'un coup, "comme si
absente" mais réversible :
- **Comportement** — aucun tick de mouvement, aucun tirage PRNG consommé
  (`core/reduce.js`) ;
- **Rendu audio** — aucune voix maintenue/déclenchée (`view/audio/
  city-scene.js`) ; une balise CONTINUE en cours voit sa voix arrêtée
  proprement à la TRANSITION (jamais en continu), redémarrée si l'entité
  redevient présente — voir aussi "Sons de transition" plus bas ;
- **Interaction** — exclue de l'occupation et de la résolution de cible
  (`view/interaction.js` via `city-scene.js`/`occupiedEntities`), et ne
  bloque jamais le déplacement (`core/presence.js`/`isBlocking`, lu par
  `core/physics/collision.js` et `core/physics/overlap.js` à la place d'un
  simple `blocksMovement`).

La bascule ELLE-MÊME (présence/dormance) est SÈCHE (immédiate, pas de
trajet ni de fondu — raffinement futur possible, même esprit que le fondu
croisé musique jour/nuit) ; le SON qui l'accompagne, lui, existe déjà — voir
"Sons de transition" plus bas.

### Extensibilité : conditions (registre) vs effets (aiguillage explicite)

`when.type` est un AIGUILLAGE tenu par `core/presence.js`/
`CONDITION_EVALUATORS` : `"timeRange"` (dérivé de l'horloge, voir
`core/time.js`) et `"arrived"` (dérivé d'un FAIT de simulation — voir
"Triggers de comportement" plus bas) cohabitent, tous deux réduits à
"condition + contexte -> booléen". Ajouter `"season"`/`"weather"`/
`"questFlag"` demain se fait en ajoutant une entrée à ce registre, jamais en
touchant `isPresent`, `resolveEntityRules`, `core/reduce.js`, ni la vue.
`core/level.js` valide `when.type` au chargement contre ce même registre
(échec clair sur un type inconnu), mais jamais les champs PROPRES à un type
(ex. `from`/`to` de `"timeRange"`) — ça reste à la charge de l'évaluateur
correspondant.

Les types d'EFFET (`"presence"`, `"behavior"`) suivent un AIGUILLAGE
explicite plutôt qu'un registre uniforme comme les conditions : chaque type
d'effet a une validation et une application propres à sa nature (une chaîne
booléenne idempotente pour `"presence"` ; une sous-validation complète de
comportement, réutilisant `parseBehavior`, plus une garde anti-boucle pour
`"behavior"`, voir plus bas) — un simple registre de noms ne suffirait pas à
couvrir cette hétérogénéité. Ajouter un effet demain (ex. `"sound"`) = un cas
de plus dans `core/level.js`/`parseEffect` ET dans `core/presence.js`/
`resolveEntityRules`, même esprit d'extensibilité que les conditions, juste
pas la même mécanique.

Réservé, non requis par ce système (même principe, pas câblé) : une
DESCRIPTION conditionnelle (ex. `descriptionKey` différente selon la phase)
pourrait s'ajouter plus tard via un effet dédié, symétrique à `"presence"`.

### Triggers de comportement

L'effet `"behavior"` (`{ type: "behavior", behavior: <objet behavior, même
forme que le champ `behavior` d'une entité> }`) REMPLACE le comportement
ACTIF de l'entité dès que la condition de SA règle vient de basculer de faux
à vrai. L'effet POSE seulement le comportement — c'est ensuite le pipeline
normal (`core/reduce.js`/`stepEntities`, `module.step()`) qui l'EXÉCUTE au
même tick ; l'effet lui-même ne déplace jamais l'entité.

**Application SEULEMENT sur la bascule, jamais en continu** : contrairement
à `"presence"` (un booléen trivialement idempotent, réévalué frais à chaque
tick sans mémoire), poser un comportement à CHAQUE tick tant que sa
condition reste vraie serait au mieux inutile, au pire cassant pour un futur
comportement à état propre — voir `core/presence.js`/`resolveEntityRules`
pour le mécanisme de mémoire (`entity.ruleActive`, un booléen par règle,
indexé par position — les règles d'une entité sont figées au chargement,
jamais réordonnées en cours de partie). **Nuance sur le TOUT PREMIER
calcul** (à ne pas confondre avec `presenceChanged` ci-dessous) : un effet
`"behavior"` s'applique DÈS le premier calcul si sa condition y est déjà
vraie (une scène ouverte à 22h en pleine fenêtre "rentre chez soi" bascule
donc IMMÉDIATEMENT vers ce comportement, jamais coincée sur le comportement
DÉCLARÉ jusqu'à la bascule suivante) — rien ici à protéger d'un signal
audible fantôme, contrairement à `presenceChanged`.

**Priorité entre règles** : la présence suit l'ordre du tableau (la
première règle avec un effet `"presence"` dont `when` est vrai décide, voir
plus haut). Les effets `"behavior"`, eux, ne se disputent pas un rang : ils
s'appliquent chacun indépendamment sur LEUR PROPRE bascule ; un contenu bien
conçu n'a qu'une seule condition de comportement vraie à un instant donné
(voir l'habitant ci-dessous), mais si plusieurs se chevauchaient, la
DERNIÈRE de la liste l'emporterait simplement (dernière affectation, jamais
un crash).

**Condition `"arrived"`** (`{ type: "arrived" }`, sans champ propre) : vraie
seulement si le comportement ACTIF de l'entité est ENCORE `"goto"` ET que ce
goto a atteint sa cible (`entity.gotoArrived`, posé par `core/behaviors/
goto.js`, jamais remis à faux). Liée au comportement ACTIF plutôt qu'au seul
drapeau : `gotoArrived` reste posé pour toujours une fois atteint, donc sans
cette garde une entité redeviendrait faussement "arrivée" pour toujours
après son tout premier trajet, même une fois son comportement remplacé par
autre chose. Événementielle par nature (contrairement à `"timeRange"`,
purement temporelle) — les deux cohabitent dans le même registre sans
qu'aucun code appelant n'ait à distinguer leur nature.

**Limite connue** (voir le commentaire dédié dans `core/presence.js`) : la
garde ci-dessus se corrige d'elle-même dès le tick SUIVANT une vraie
observation de la bascule, mais si aucun tick n'a lieu pendant tout un
créneau où une règle de comportement serait repassée à faux (onglet mis en
arrière-plan assez longtemps — l'horloge de partie n'est PAS plafonnée, voir
`lib/loop.js`/`onFrame`, contrairement aux ticks de mouvement — ou un monde
resté inactif le temps qu'une fenêtre se referme puis se rouvre ailleurs),
la bascule manquée reste "collée" jusqu'à la PROCHAINE bascule réelle de
cette même règle. Accepté tel quel pour l'instant (hors de portée d'un
plafonnement de l'horloge ou d'un rattrapage multi-monde, ni l'un ni
l'autre demandé).

**Exemple de référence — l'habitant** (`npc-resident` dans `level/demo.json`,
`npc-resident-home` dans `level/demo2.json`) : présent et erre le jour ;
à 20h, part vers la porte (`"behavior"` -> `goto`) tout en restant présent
(en chemin) ; à l'arrivée (`"arrived"`), devient dormant ; FILET DE SECOURS
à minuit (`"timeRange"` de 0h à 8h) — dormant QUAND MÊME, qu'il soit arrivé
ou non (cible manquante, obstacle, trop lent : l'INTENTION "il rentre chez
lui" reste honorée même sans marche réelle possible, jamais visiblement
coincé après minuit) ; au matin (8h), présent + `"behavior"` -> `wander` de
nouveau (nouveau cycle). Voir `core/movement.check.js`, section "Routine
complète", pour la vérification tick par tick, y compris le cas obstrué et
le cas de cible manquante.

**Le même personnage, deux scènes — DEUX déclarations séparées, sans état
partagé** : `npc-resident` (demo1, présent le jour) et `npc-resident-home`
(demo2, présent la nuit, présence simple sans `"behavior"` — un `goto`
depuis la porte d'entrée n'a pas été jugé nécessaire ici, cf. `core/
behaviors/goto.js`) sont deux entités INDÉPENDANTES : un NPC appartient à
UNE scène (contrairement à un compagnon, voir `core/state.js`), la porte
qu'il rejoint n'est que de la couleur narrative ("il rentre chez lui, de
l'autre côté") — jamais une vraie transition d'entité entre scènes, jamais
besoin de synchroniser les deux mondes. Complémentarité (jamais présent aux
deux, jamais absent aux deux) obtenue en PRATIQUE par le CHOIX des horaires
(demo2 démarre à 21h, pas 20h — une heure de battement, largement au-dessus
de la poignée de minutes que prend la marche dans `level/demo.json`), PAS
par une garantie structurelle : sans état partagé, rien n'empêche
STRUCTURELLEMENT une entité lente/obstruée de rester visible au-delà de
21h en même temps que son double nocturne apparaît déjà — un état de
personnage PARTAGÉ (variables d'instance lues au chargement des deux scènes,
ex. "est-il déjà rentré ?") permettrait une synchronisation stricte plus
tard, SANS refonte : ce système de règles n'a pas à changer, seul le
CONTEXTE qu'on lui passe grossirait (comme `{ time }` -> `{ time, weather }`
plus haut). Délibérément DIFFÉRÉ, pas un oubli — aucun consommateur n'en a
besoin aujourd'hui.

### Bascule observée : `presenceChanged`

`core/reduce.js`/`stepEntities` compare, à chaque tick, la présence
FRAÎCHEMENT calculée à `entity.present` (la valeur du tick PRÉCÉDENT, portée
par l'entité elle-même) et expose le résultat sur l'entité :
`presenceChanged: "entered" | "exited" | null`. Formulation volontairement
GÉNÉRIQUE ("la condition vient de basculer"), pas liée au rouage de dormance
lui-même — pensée pour une future généralisation en événements, au-delà du
seul couple présent/dormant.

**Jamais de bascule fantôme au montage** : `entity.present` vaut `undefined`
tant qu'aucun tick n'a encore calculé la présence de cette entité (monde tout
juste créé, ou qui redevient actif après avoir été rangé sans jamais avoir
tické) — ce cas ne compte JAMAIS comme une bascule, quelle que soit la
valeur de départ (présente ou dormante). Entrer dans une scène de nuit avec
un néon déjà présent n'y déclenche donc aucun son : il est "allumé depuis
longtemps", pas en train de s'allumer.

### Sons de transition

`sounds.enterSound` / `sounds.exitSound` (optionnels, indépendants l'un de
l'autre ET du beacon) : rôles PONCTUELS et POSITIONNÉS (position de
l'entité), joués UNE FOIS sur une bascule `presenceChanged` OBSERVÉE —
`enterSound` sur `"entered"`, `exitSound` sur `"exited"`. Distincts du
beacon (son D'ÉTAT, maintenu tant que présente) : ce sont des sons
D'ÉVÉNEMENT, qui ne bouclent jamais. Même cascade de gain que les autres
rôles (`enterSoundGain`/`exitSoundGain`, `reverbSend`, `pitchVariation` —
voir "Paramètres sonores" plus bas) et même catégorie de préférence volume
que le beacon ("Volume des balises" — ces sons accompagnent la présence
d'une entité comme le beacon lui-même).

Ordre à la bascule (`view/audio/city-scene.js`/`applyEntityAudio`) :
`exitSound` joué AVANT l'arrêt du beacon (Howl entièrement séparé — l'arrêt
du beacon ne coupe jamais le one-shot en cours) ; `enterSound` joué AVANT la
reprise du beacon. Ni l'un ni l'autre n'est soumis à la pause sélective des
balises (`sound.pause`/`resume`, réservée à la voix CONTINUE) : un one-shot
Howler joue jusqu'au bout une fois lancé.

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
  Peut compenser un fichier source enregistré à un niveau différent des
  autres sons du jeu, mais À MANIER AVEC PRÉCAUTION : un gain logiciel élevé
  sur un signal déjà faible amplifie aussi son bruit de fond et peut
  introduire des artefacts audibles (crépitement, quasi-mitraillette
  perçue) — préférer corriger le niveau À LA SOURCE (réenregistrer/amplifier
  le fichier) plutôt qu'empiler un gros `movementGain`, réservé aux écarts
  mineurs. Un réglage de CONTENU (propre à l'archétype ou à l'instance), pas
  un curseur de mixage utilisateur.
- **`enterSoundGain`** / **`exitSoundGain`** — même principe que
  `beaconGain`/`vocalGain`, mais pour les rôles PONCTUELS `enterSound`/
  `exitSound` (voir "Sons de transition" plus haut) — un rôle de son, un
  gain qui lui est propre, indépendant de celui du beacon.

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
que le défaut global). En dehors de ce cas, `demo.json` ne surcharge aucun
de ces paramètres au
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
