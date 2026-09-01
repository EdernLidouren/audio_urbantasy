# Format de niveau

Contrat de référence pour les fichiers `level/*.json`, tel qu'implémenté par
`core/level.js` (`parseLevel`). Un fichier de niveau est un objet JSON déjà
parsé, sans aucune chaîne affichable en dur — uniquement des clés i18n.

## Niveau

| Champ         | Type     | Contrainte                                      |
|---------------|----------|--------------------------------------------------|
| `id`          | string   | non vide                                          |
| `titleKey`    | string   | non vide, clé i18n du titre du niveau             |
| `length`      | number   | `> 0` — longueur en unités le long de l'axe x     |
| `playerStart` | number   | point d'arrivée PAR DÉFAUT du lieu. **FILET, jamais rejeté** : absent ou hors `[0, length]` -> repli sur `0` (avec un `console.warn`), jamais d'exception. Des points d'arrivée NOMMÉS (ex. par porte) pourront s'ajouter plus tard, sans toucher à ce filet. |
| `entities`    | Entity[] | voir ci-dessous                                   |
| `music`       | string   | optionnel : musique du lieu — une clé de POOL (plusieurs fichiers, voir `assets/manifest.json`) ou un membre précis, résolue par `resolveAsset` comme tout autre pool. Canal global non spatialisé — voir `view/audio/city-scene.js`. Par défaut, lue en SÉQUENCE avec respiration (voir "Musique : séquence avec respiration" plus bas), jamais en boucle simple. |
| `musicDay` / `musicNight` | string | optionnels : musique PAR PHASE jour/nuit (voir `core/time.js`/`phaseAt`, "Phase jour/nuit" plus bas), même forme que `music` (pool ou membre précis). Un lieu qui n'en déclare aucune des deux retombe sur `music` pour les deux phases (rétrocompatible, aucune régression). Bascule en cours de jeu par FONDU UNIVERSEL puis respiration puis nouvelle séquence (`view/audio/city-scene.js`) ; à l'entrée dans une scène, la phase courante joue directement, sans fondu. |
| `musicLoop`   | boolean  | optionnel, défaut `false` : `true` fait jouer la musique du lieu en BOUCLE CONTINUE (comportement historique), sans enchaînement ni respiration — pour les deux phases, un seul drapeau par lieu. Voir "Musique : séquence avec respiration" plus bas. |
| `ambiences`   | string[] | optionnel : 0 à `AMBIENCE_CHANNEL_LIMIT` chemins d'ambiance (`assets/ambiances/...`, voir `config/audio-channels.js`), canal global non spatialisé, jusqu'à autant de couches simultanées — voir `view/audio/city-scene.js` |
| `ambiencesDay` / `ambiencesNight` | string[] | optionnels, même forme que `ambiences`. **RÉSERVÉS** : structure validée par `parseLevel` mais AUCUN consommateur ne les lit encore — seule la musique réagit à la phase pour l'instant (voir `core/time.md`). |
| `reverbDurationSec` | number | optionnel, `> 0` : surcharge PAR LIEU la durée de la réponse impulsionnelle du bus de réverb (défaut global : `config/tuning-values.js`) |
| `reverbDecay` | number | optionnel, `> 0` : surcharge PAR LIEU le taux de déclin de la réverb (défaut global : `config/tuning-values.js`) |
| `defaultSurface` | string | optionnel : nom de surface (voir "Surfaces de sol" plus bas) couvrant tout le `x` non-segmenté. **FILET SILENCIEUX si absent** (repli sur `DEFAULT_SURFACE`, `core/surfaces.js` — comportement audible inchangé pour toute scène qui n'en déclare pas). **Échec clair si fourni mais absent du registre** (comme un type d'entité inconnu) — une référence de contenu erronée n'est jamais dégradée en silence. |
| `segments`    | Segment[] | optionnel : zones qui PATCHENT `defaultSurface` sur des portions du lieu (voir "Surfaces de sol" plus bas). Absent -> `[]`, `defaultSurface` partout. |
| `indoor`      | boolean  | optionnel, défaut `false` (extérieur) : propriété de NATURE DE LIEU — TOUJOURS résolue en booléen sur une face parsée (comme `defaultSurface`, jamais `undefined`). Aujourd'hui consultée par le rendu d'ambiance météo pour choisir le pool outdoor/indoor de l'état courant (voir `core/scripting.md`/"weather", `config/weather-values.js`) — délibérément générique, un futur consommateur (réverb, sons ambiants...) pourra la lire aussi sans rien changer ici. |

## Scène à deux faces (recto/verso)

Étape 1/2 (voir CLAUDE.md/"RECTO/VERSO") : une scène est SIMPLE (comme
ci-dessus, `entities`/`music`/... à la racine) OU À DEUX FACES — `recto` ET
`verso` déclarés ENSEMBLE, jamais un seul. `id`/`titleKey`/`length`/
`playerStart` restent TOUJOURS à la racine, PARTAGÉS par les deux faces
(même longueur d'axe x) ; tous les autres champs du tableau "Niveau"
ci-dessus (`entities`, `music`/`musicDay`/`musicNight`/`musicLoop`,
`ambiences`/`ambiencesDay`/`ambiencesNight`, `reverbDurationSec`/
`reverbDecay`, `defaultSurface`, `segments`, `indoor`) sont des champs de FACE :
déclarés dans `recto`/`verso` pour une scène à deux faces, à la racine pour
une scène simple — **jamais mélangés** : `parseLevel` échoue clairement si
un de ces champs apparaît à la racine EN MÊME TEMPS que `recto`/`verso`.

```json
{
  "id": "alley",
  "titleKey": "level.alley.title",
  "length": 10,
  "playerStart": 1,
  "recto": { "music": "assets/musics/streets_day", "entities": [ /* ... */ ] },
  "verso":  { "music": "assets/musics/mystery",     "entities": [ /* ... */ ] }
}
```

Une scène SIMPLE (ni `recto` ni `verso`) se comporte EXACTEMENT comme avant
ce modèle — RÉTROCOMPAT STRICTE, aucune régression pour tout niveau
existant (`demo.json`, `demo2.json`).

**Face courante et bascule** : le joueur porte `player.side`
(`"recto"|"verso"`, défaut `"recto"`), sérialisé avec lui. En entrant dans
une scène à deux faces depuis un autre lieu (porte), on arrive TOUJOURS sur
le recto. Depuis l'étape 2/2, LES DEUX faces tiquent à chaque tour
(`core/reduce.js`/TICK) — mais ISOLÉES : collision, ciblage de comportement
(`follow`/`goto`), interaction et occupation restent bornés à la face de
l'entité (voir `entities/model.md`/"Recto/verso" pour le détail complet de
cette isolation). "Face courante" ne veut donc plus dire "seule face
active", mais "celle qui porte le joueur/les compagnons ET se rend
normalement" — l'autre se rend en ÉTOUFFÉ (voir "Coexistence audible" plus
bas), jamais gelée. Basculer de face reste DANS le même monde
(`core/state.js`/`switchSide`) — PAS un `travelToWorld` : `activeWorldId` ne
change pas, seuls `player.side`/`player.x` et l'audio de scène (voir plus
bas) le font.

**Point de passage** (`entities/types/passage.js`) : une entité
interactable avec `action: { kind: "switchSide", arrivalX: <number> }` —
`arrivalX` est le point d'arrivée sur l'AUTRE face (comme `target` pour une
`door`, mais on reste dans le même monde). Une entité par face, chacune
déclarant l'arrivée sur l'autre (voir l'exemple ci-dessous) — jamais une
entité "des deux côtés à la fois". `arrivalX` n'est PAS validé en bornes par `parseLevel` (comme tout
champ `action.*`, voir le tableau "Entité" plus haut) — clampé à
l'exécution par `core/state.js`/`switchSide`, jamais un plantage sur un
contenu mal formé.

```json
{ "id": "gap-recto", "type": "passage", "x": 8, "action": { "kind": "switchSide", "arrivalX": 8 } }
```

**Audio de bascule (VUE)** : `scene.destroy()` puis reconstruction sur la
nouvelle face active, même soin que `transitionThroughDoor` pour ne laisser
AUCUN Howl résiduel (voir `view/city-screen.js`/`sideSwitchEffect`), plus un
marqueur sonore de bascule (`view/interaction.js`, "metal_gate" —
`assets/sounds/doors/metal_gate`, défensif si le fichier venait à manquer).

**Coexistence audible (étape 2/2)** : depuis `core/reduce.js`/TICK, LES DEUX
faces tiquent à chaque tour — plus de gel de l'autre face, mais ISOLATION
STRICTE (voir `entities/model.md`/"Recto/verso") : collision, ciblage de
comportement (`follow`/`goto`), interaction et occupation restent bornés à
la face de l'entité, jamais croisés. Seul le SON traverse : les entités de
l'autre face sont rendues en ÉTOUFFÉ (passe-bas + atténuation de gain,
réglages `mufflingLowpassHz`/`mufflingGain` — `config/tuning-values.js`),
directionnelles (même pan/distance que d'habitude), SAUF leur beacon,
jamais audible de l'autre côté (aucune localisation croisée) — voir
`view/audio/city-scene.js`/`includeBeacon`. Au basculement de face (même
mécanisme que ci-dessus), normal et étouffé s'inversent.

**Persistance** : une scène à deux faces sauvegarde SES DEUX FACES
(entités, rngState, compteur d'éphémères) — `core/save.js` traite un monde à
deux faces comme deux faces indépendantes (purge d'éphémères,
rebouchage `defaultSurface`/`segments`/`nextEphemeralId`). Une sauvegarde
antérieure à ce modèle n'a jamais de `recto`/`verso` (scènes simples
inchangées) ni de `player.side` (rebouché à `"recto"`).

**Étape 2/2 : coexistence audible** — voir "Coexistence audible" ci-dessus.
Les deux faces tiquent désormais toujours ensemble, isolées ; le modèle
"une seule face active" de l'étape 1 n'existe plus.

## Segment (surface)

| Champ     | Type   | Contrainte                                                    |
|-----------|--------|------------------------------------------------------------------|
| `from`    | number | `>= 0`, `< to`                                                    |
| `to`      | number | `<= length`, `> from`                                             |
| `surface` | string | doit exister dans le registre de surfaces (`core/surfaces.js`) — **TOUJOURS explicite, aucun filet** : en déclarer un est un choix délibéré, une surface inconnue est une vraie erreur de contenu -> `parseLevel` échoue clairement. |

## Surfaces de sol

Toute la scène est couverte par une surface, SANS TROU — c'est un invariant
garanti par construction, pas une validation à part : `defaultSurface`
couvre tout le lieu comme une couche de base, les `segments` ne font que la
PATCHER par endroits (bornes `from`/`to` incluses). `core/surfaces.js`
(CORE pur) porte :

- `SURFACE_REGISTRY` — un registre `nom -> propriétés`, structuré comme le
  registre de types d'entités (`entities/types/index.js`) mais placé DANS
  `core/`, importé directement (comme `config/tuning-values.js`) : à la
  différence du registre d'entités (contenu, jamais lu par le core), une
  surface est prête à porter une future propriété de PHYSIQUE (ex. un
  ralentissement) que `core/reduce.js`/`core/physics/` liront un jour
  directement. Chaque entrée est un objet plat (`{ neutral: boolean }`
  aujourd'hui) conçu pour en recevoir d'autres PLUS TARD (ex.
  `speedFactor`) sans changer la forme ni la logique de résolution — ajouter
  une surface, c'est ajouter une entrée ; ajouter une propriété de
  gameplay, c'est ajouter une clé à chaque entrée concernée, jamais une
  nouvelle fonction.
- `neutral` — `true` = sol NEUTRE (le son de pas vient de l'ENTITÉ qui
  marche) ; `false` = sol SPÉCIAL (le son vient DU SOL, qui domine). Ce
  registre ne connaît AUCUN chemin de fichier : la dérivation du son est
  entièrement à la charge de la VUE (voir `entities/model.md`, "Surfaces de
  sol et son de pas").
- `surfaceAt(world, x)` — nom de la surface au point `x`, TOUJOURS défini
  (segment couvrant, sinon `defaultSurface`), jamais `null`/`undefined`.
  Pure, testable au terminal.
- `surfaceProps(name)` / `surfacePropsAt(world, x)` — propriétés du
  registre pour une surface (dont `neutral`) : le point d'extension
  gameplay futur, un appelant qui voudra lire `speedFactor` demain appelle
  exactement ces fonctions, rien à ajouter au mécanisme.

Aucune mécanique n'exploite encore ce champ au-delà du son de pas (voir
`entities/model.md`) : pas de position Y, pas de ralentissement réel — le
registre est prêt à en accueillir, rien de plus aujourd'hui.

## Phase jour/nuit

`phaseAt(time)` (`core/time.js`, pur, dérivée de l'horloge de partie — voir
`core/time.md`) renvoie `"day"` ou `"night"` selon l'heure courante
(`dayStartHour`/`nightStartHour`, `config/time-values.js`). Premier
consommateur de l'horloge : `musicDay`/`musicNight` (voir tableau "Niveau"
ci-dessus) en tirent la musique du lieu, avec un fondu universel puis une
respiration puis la nouvelle séquence à chaque bascule en cours de jeu
(`view/audio/city-scene.js`, voir section suivante). Détail complet de
l'horloge : `core/time.md`.

## Musique : séquence avec respiration

Par défaut (`musicLoop` absent ou `false`), la musique d'un lieu n'est pas
une boucle mais une SÉQUENCE (`lib/audio.js`/`startMusicSequence`) : un
morceau joue une fois (`loop:false`), se termine, une PAUSE aléatoire
("respiration" — `musicBreatherMinMs`/`musicBreatherMaxMs`,
`config/tuning-values.js`, ~3 à 8s par défaut) s'écoule en silence complet,
puis un nouveau morceau démarre — tiré du même pool (`music`/`musicDay`/
`musicNight`), SANS répéter immédiatement le précédent si le pool en compte
plusieurs (`resolveAsset`/`pickFromPool`, voir `lib/assets.js` — un pool à
un seul élément rejoue simplement ce même élément, rétrocompatible).
Recommence indéfiniment tant que la scène reste active.

`musicLoop: true` bascule le lieu ENTIER (les deux phases) en boucle
continue à la place — comportement historique préservé pour un lieu qui
veut une ambiance ininterrompue (ex. magasin, tension) : aucun enchaînement,
aucune respiration.

**Unification avec la bascule de phase** : une bascule jour/nuit réutilise
EXACTEMENT le même mécanisme de respiration que l'enchaînement naturel
(`lib/audio.js`/`switchMusicSequence`) — fondu du morceau courant, PUIS la
même pause aléatoire, PUIS démarrage de la musique de la nouvelle phase.

**Fondu de sortie universel** (`musicFadeMs`, `config/tuning-values.js`,
`lib/audio.js`/`fadeOutMusic`) : TOUT arrêt de musique (bascule de phase,
transition de lieu) descend en volume avant de s'arrêter, jamais une
coupure sèche. À une transition de lieu, la transition elle-même reste
IMMÉDIATE (la scène suivante démarre tout de suite) — seule la musique
sortante fond en arrière-plan, par-dessus le début de la nouvelle scène.
Robuste au chevauchement (une bascule suivie de près d'une transition, par
exemple) : jamais de voix orpheline ni de fondus qui se disputent le canal.

## Entité

| Champ     | Type   | Contrainte                                                    |
|-----------|--------|------------------------------------------------------------------|
| `id`      | string | non vide, unique dans le niveau                                  |
| `type`    | string | doit exister dans le registre `entities/types/index.js`          |
| `x`       | number | dans `[0, length]`                                                |
| `target`  | string | **requis** si `type === "door"` : id d'un niveau du registre (`level/index.js`) — l'action "activate" sur la porte y transitionne (voir `view/interaction.js`, `view/city-screen.js`) |
| `nameKey` | string | optionnel (npc/object) : clé i18n spécifique à l'instance          |
| `descriptionKey` | string | optionnel : clé i18n de description spécifique à l'instance, utilisée par l'interaction "describe" (touche Espace) |
| `consumedDescriptionKey` | string | optionnel : clé i18n de description ALTERNATIVE une fois l'entité `consumed` (voir "Collectible persistant" plus bas et `entities/model.md`). Cascade instance -> type -> absente, comme `descriptionKey` |
| `blocksMovement` | boolean | optionnel : surcharge d'instance, cascade -> défaut du type (`entities/types/index.js`) -> `false` |
| `observable` | boolean | optionnel : idem, candidate à l'interaction "describe" (voir "Interaction (niveau 0)", `entities/model.md`) |
| `interactable` | boolean | optionnel : idem, candidate à l'interaction "activate" |
| `isFlying` | boolean | optionnel : idem (cascade, défaut `false`) — marqueur PUR, aucune logique ici ni ailleurs dans le core (pas d'axe Y). Fait passer les sons de l'entité par une chaîne de filtres qui SUGGÈRE la hauteur, côté vue uniquement (voir "Verticalité" et `isFlying`, `entities/model.md`, `config/tuning-values.js`) |
| `action` | `{ kind: string, condition?, refusalKey? ... }` | optionnel : TYPE D'ACTION pour l'interaction "activate", cascade instance -> type comme `behavior`. Forme validée ici (`kind` non vide) ; le `kind` lui-même n'est PAS validé contre un registre au chargement — l'aiguillage reste côté vue (voir "Interaction (niveau 0)", `entities/model.md`). `condition` (optionnel, ACTIONS CONDITIONNELLES) : MÊME objet que `presence[].when`, validé au chargement contre le même registre de conditions (voir tableau plus bas) — GÉNÉRIQUE à tout `kind`. `refusalKey` (clé i18n) : **requise** dès que `condition` est présente — échec clair sinon. |
| `presence` | `PresenceRule[]` | optionnel : règles DÉCLARATIVES de présence conditionnelle, cascade instance -> type (voir "Présence conditionnelle" plus bas et `entities/model.md`). Sans règle (ni à l'instance ni au type) : toujours présente. |

`parseLevel` normalise chaque entité en ajoutant `labelKey` et
`descriptionKey` : `entity.nameKey` si présent sinon `registry[type].label`
pour le premier ; `entity.descriptionKey` (du JSON) si présent sinon
`registry[type].descriptionKey` pour le second (peut rester `undefined`, ex.
`decor`). Les champs bruts du JSON source une fois résolus (`nameKey`,
`descriptionKey`) ne sont pas reportés tels quels dans l'entité normalisée —
seuls `labelKey` et `descriptionKey` (résolus) sont exposés.

## Présence conditionnelle et triggers de comportement

Une `PresenceRule` : `{ when: <condition>, effects: [<effet>...] }`, ou en
RACCOURCI rétrocompatible `{ when: <condition>, present: boolean }` (sans
`effects`), normalisé par `parseLevel` en `{ when, effects: [{ type:
"presence", present }] }` — tout consommateur d'une entité PARSÉE ne voit
plus que la forme canonique. `when.type` doit exister dans le registre de
conditions (`core/presence.js`, `CONDITION_EVALUATORS`) — **échec clair si
inconnu**, comme un type d'entité. Les champs PROPRES à un type de condition
(ex. `from`/`to` de `"timeRange"`) ne sont EN GÉNÉRAL PAS validés par
`parseLevel` : ajouter un nouveau type de condition ne doit jamais obliger à
revenir ici. EXCEPTIONS : `"hasEquipmentTag"` (champ `tag`) et `"weather"`
(champ `state`), dont le champ référence du contenu externe
(`core/tags.js`/`TAG_REGISTRY`, `config/weather-values.js`/`WEATHER_STATES`)
— validés au chargement comme une surface de segment, une faute de frappe y
échoue donc clairement plutôt que de dégrader silencieusement vers "jamais
vraie".
Voir `entities/model.md`/"Présence conditionnelle et triggers de
comportement" pour la sémantique complète (priorité entre règles, les trois
plans coupés par l'état dormant, la garde anti-boucle des effets
`"behavior"`).

MÊME registre, MÊME validation (`validateCondition`, factorisée dans
`core/level.js`) pour `entities[].action.condition` — voir "Actions
conditionnelles" ci-dessus dans le tableau des champs d'entité et
`entities/model.md`/"Actions conditionnelles" : une condition ne sait pas
d'où elle est appelée, `presence[].when` et `action.condition` partagent
exactement ce tableau.

| `when.type` | Champs        | Vrai si...                                                  |
|-------------|---------------|--------------------------------------------------------------|
| `timeRange` | `from`, `to` (heures 0-23), `spread` (minutes, optionnel) | l'heure courante (dérivée de `session.time`) tombe dans `[from, to[`, en gérant le passage par minuit (`from > to`, ex. `20..6`) — `spread` décale ce seuil d'une quantité DÉTERMINISTE et STABLE par entité (voir `core/scripting.md`/"Variation de seuil par instance", `core/temporal-spread.js`), pour désynchroniser des entités qui partagent la même règle |
| `arrived`   | (aucun)       | le comportement actif de l'entité est encore `"goto"` ET a atteint sa cible (`entity.gotoArrived`) |
| `consumed`  | (aucun)       | l'entité porte `consumed: true` (voir `core/state.js`/`markConsumed`, "Collectible persistant" plus bas) — PERMANENT, `consumed` ne repasse jamais à `false` |
| `hasEquipmentTag` | `tag` (clé de `core/tags.js`/`TAG_REGISTRY`, validée au chargement) | l'entité évaluée porte, dans son PROPRE équipement (`context.entity.equipment`), un objet marqué de ce tag (voir `core/equipment.js`/`equippedTags`) — entité sans `equipment` -> jamais vraie |
| `perceptionActive` | (aucun) | la perception surnaturelle (`session.perceptionActive`, voir `core/state.js`/`togglePerception`) est active |
| `weather` | `state` (clé de `config/weather-values.js`/`WEATHER_STATES`, validée au chargement) | l'état météo courant (`session.weather.state`, voir `core/weather.js`) est exactement cet état |

Un `Effect` : `{ type: "presence", present: boolean }` ou `{ type:
"behavior", behavior: <objet behavior, même forme que le champ `behavior`
d'une entité, voir plus bas> }` — un `kind` de comportement inconnu dans un
effet `"behavior"` est rejeté au chargement, exactement comme un `behavior`
d'entité invalide. Un effet `"behavior"` ne s'applique qu'à la BASCULE de sa
règle (faux -> vrai), jamais en continu — voir `entities/model.md`.
`behavior: null` (au lieu d'un objet) est la SEULE valeur spéciale acceptée :
RETRAIT explicite du comportement actif (l'entité redevient immobile) —
nécessaire pour qu'un cycle `"goto"` redevienne réenclenchable sans passer
par un autre `kind` (voir `core/scripting.md`, "Effets").

## Collectible persistant

`consumed` (booléen, RUNTIME — jamais un champ d'entrée du JSON de niveau,
comme `present`/`gotoArrived`) : marque une entité activée une seule fois via
l'action `"loot"` (voir "Registre de types" plus bas et `entities/model.md`),
posé par `core/state.js`/`markConsumed`, JAMAIS retiré du monde (contrairement
à l'action `"pickup"`, voir `core/money.js`). Deux effets POST-ACTIVATION
composables, DÉCLARÉS par l'entité : `consumedDescriptionKey` (voir tableau
"Entité" plus haut) et/ou une règle de présence sur la condition `"consumed"`
(voir tableau "Présence conditionnelle" ci-dessus) pour devenir dormant.
Détail complet (idempotence, exemples, muteOnConsumed) : `entities/model.md`.

## Entités éphémères

`ephemeral` (booléen, RUNTIME — jamais un champ d'entrée du JSON de niveau,
comme `consumed`) : marque une entité créée EN COURS DE JEU via
`core/state.js`/`spawnEphemeral`, jamais déclarée dans un fichier de niveau.
Exclue de la sérialisation (`core/save.js`/`serializeGame`) et purgée du
lieu au départ (`core/state.js`/`travelToWorld`) — aucune entité éphémère
n'apparaît donc jamais dans un fichier de niveau ni dans une sauvegarde.
Limite anti-prolifération : `MAX_EPHEMERALS` (`config/ephemerals.js`).
Détail complet : `entities/model.md`/"Entités éphémères".

## Registre de types (`entities/types/index.js`)

Donnée neutre, sans import — un fichier par archétype sous `entities/types/`,
rassemblés par `index.js` en un objet `{ [type]: TypeDef }` :

| Champ            | Type    | Lu par        | Rôle                                         |
|------------------|---------|---------------|-----------------------------------------------|
| `label`          | string  | vue           | clé i18n du libellé par défaut du type        |
| `descriptionKey` | string  | vue           | optionnel : clé i18n de la description par défaut du type, utilisée par l'interaction "describe" si l'instance n'en fournit pas |
| `sounds`         | object  | vue           | descripteurs de son du type, par rôle (`{ beacon, ... }`) — voir `entities/model.md` |
| `blocksMovement` | boolean | core           | empêche le déplacement au travers de l'entité (`core/physics/collision.js`) |
| `observable`     | boolean | vue            | candidate à l'interaction "describe" (touche Espace) — voir "Interaction (niveau 0)", `entities/model.md` |
| `interactable`   | boolean | vue            | candidate à l'interaction "activate" (touche Entrée) — idem |
| `isFlying`       | boolean | vue            | optionnel, défaut du type — chaîne de filtres "hauteur suggérée" sur les sons, voir `isFlying` dans `entities/model.md` |
| `action`         | object  | vue            | `{ kind, ... }` par défaut du type — voir "Interaction (niveau 0)", `entities/model.md` |
| `consumedDescriptionKey` | string | vue    | optionnel : défaut de type, cascadé comme `descriptionKey` — voir "Collectible persistant" plus haut |
| `muteOnConsumed` | boolean | vue           | optionnel, REGISTRE SEULEMENT (jamais cascadé par instance) : arrête le beacon continu une fois l'entité `consumed` — voir "Collectible persistant" plus haut, `entities/model.md` |

`blocksMovement`/`observable`/`interactable`/`isFlying` sont tous les quatre
cascadés instance -> type -> défaut `false` (voir
`core/level.js`/`parseEntity`), donc également déclarables au niveau ENTITÉ
(voir le tableau "Entité" plus haut), pas seulement au niveau du type.

Types de départ : `door`, `npc`, `object`, `decor` (ce dernier non utilisé
dans `demo.json`). Le modèle complet (descripteurs de son, cascade de
réglages, sous-types comme presets, la place du joueur) est documenté dans
`entities/model.md`.

## Exemple minimal

```json
{
  "id": "demo",
  "titleKey": "level.demo.title",
  "length": 40,
  "playerStart": 2,
  "entities": [
    { "id": "npc-merchant", "type": "npc", "x": 15, "nameKey": "npc.merchant" },
    { "id": "door-exit", "type": "door", "x": 38, "target": "demo-next" }
  ]
}
```

## Verticalité — par SOUS-SCÈNES, pas par axe Y

Aucun champ dédié : la verticalité (ex. "les toits" au-dessus de la rue) se
fait EXACTEMENT comme un changement de lieu horizontal — un lieu séparé
(`level/*.json` à part entière), relié par une entité interactable dont
l'action `"transit"` y mène (un "escalier"/une "échelle", au même titre
qu'une `door` — voir `entities/model.md`). Jamais un axe Y discrétisé dans
UNE scène (aucune notion de palier/étage actif à maintenir) : le mécanisme
de transition de lieu déjà en place couvre tout, sans champ ni système
supplémentaire.

## Chargement

- `core/level.js` — `parseLevel(raw, registry)` : fonction pure, valide et
  normalise un objet déjà parsé. Utilisable en Node/console, sans réseau ni
  DOM. Toute violation lève une `Error` nommant le champ ou l'entité fautive.
- `level/load.js` — `loadLevel(url, registry)` : chargeur au bord (`fetch` +
  `parseLevel`). Erreurs réseau et JSON invalide remontées avec un message
  clair. `loadLevelById(id, registry)` : résout `id` en chemin via
  `level/index.js` puis délègue à `loadLevel` — utilisé pour la transition
  par porte (`target` = id, pas un chemin).
- `level/index.js` — registre `{ id: chemin }` des niveaux existants.
