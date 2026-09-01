# Le format déclaratif du jeu ("le script")

Référence UNIQUE du vocabulaire déclaratif partagé par tout le contenu : CONDITIONS,
EFFETS, RÈGLES, ACTIONS (et leurs conditions d'accès), TAGS. Avant ce document, ce
vocabulaire était éparpillé entre `core/presence.js`, `core/level.js`,
`view/interaction.js`, `entities/model.md` et `level/schema.md` — ce fichier ne les
remplace pas, il les RELIE et donne le point d'entrée. Détail spécifique-Templeton
(dormance, collectible persistant, entités éphémères, modèle de son) : toujours
`entities/model.md`. Contrat JSON exact d'un niveau (types, cascades, filets) :
toujours `level/schema.md`. Horloge dont dérive `"timeRange"` : `core/time.md`.

**Principe anti-divergence, lu avant d'écrire ici** : ce document explique des
CONCEPTS et une STRUCTURE stables, illustrés par des exemples RÉELS et complets. Il
ne recopie JAMAIS une liste qui vit dans le code (elle finirait fausse) — chaque
liste exhaustive (types de condition, kinds d'action, tags) renvoie au fichier
source. Chaque section porte une ligne **⚠️ À jour avec** qui nomme ce fichier :
si tu ajoutes un type/kind/tag, mets à jour le CODE d'abord, puis complète la
section correspondante ICI (nouvel exemple si le concept le justifie) — cette
maintenance fait partie du travail, voir `CLAUDE.md`.

## Vue d'ensemble : une seule couche de conditions, trois consommateurs

Le même objet condition (`{ type, ...champs }`) et le même évaluateur
(`core/presence.js`/`evaluateCondition`) servent aujourd'hui à TROIS usages, sans
jamais trois mécanismes séparés :

1. **Présence conditionnelle** — `entity.presence` décide si une entité est
   affichée/simulée (voir "Règles" plus bas).
2. **Triggers de comportement** — une règle de présence peut AUSSI poser un
   comportement de mouvement à la bascule (même tableau `presence`, effet
   `"behavior"`).
3. **Conditions d'action** — `entity.action.condition` décide si une action
   (transit, pickup, loot...) s'exécute ou déclenche un refus.

Un futur PNJ qui ne parle qu'à condition, ou un dialogue conditionnel, RÉUTILISERAIT
cette même couche (nouveau CONSOMMATEUR du même évaluateur), jamais un quatrième
système de conditions.

## Conditions

**Forme** : `{ type: "<clé>", ...champs propres au type }`. `type` est un aiguillage
tenu par un REGISTRE — `CONDITION_EVALUATORS` dans `core/presence.js` — chaque
entrée réduite à la même signature `(cond, context) -> boolean`. `evaluateCondition`
délègue au bon évaluateur ; un `type` inconnu à l'ÉVALUATION (hors du chemin validé
au chargement, ex. un appel direct depuis `core/movement.check.js`) renvoie `false`,
jamais une exception.

`context` transporte ce dont un évaluateur peut avoir besoin — aujourd'hui `time`
(minutes de jeu, voir `core/time.md`) et `entity` (l'entité dont on évalue une
propriété PROPRE, ajoutée AVANT l'appel par l'appelant — voir la nuance
`hasEquipmentTag` plus bas, où "l'entité" concernée n'est pas toujours celle qui
porte la règle). Étendre `context` demain (`season`, `weather`...) ne change jamais
la signature d'`evaluateCondition`, seulement ce que l'appelant y met.

**Validation au chargement** (`core/level.js`/`validateCondition`, FACTORISÉE et
réutilisée à l'identique par `presence[].when` et `action.condition`) :
`type` doit exister dans `CONDITION_TYPES` (dérivé de `CONDITION_EVALUATORS`,
jamais dupliqué) — échec clair si inconnu, comme un type d'entité. Les champs
PROPRES à un type (ex. `from`/`to`) ne sont PAS validés en général (dégradation
silencieuse à l'évaluation) — SAUF `hasEquipmentTag.tag`, qui référence un REGISTRE
de contenu externe (`core/tags.js`) et est donc validé explicitement, comme une
surface de segment.

**⚠️ À jour avec `core/presence.js`/`CONDITION_EVALUATORS`** — types existants :

### `timeRange` — heure du jour

```js
{ type: "timeRange", from: 20, to: 6 }
```

Vraie si l'heure courante (dérivée de `context.time`, en HEURE FRACTIONNAIRE —
`core/presence.js`/`hourOfDayFraction`, pas l'entier de `core/time.js`/`hourOfDay` :
nécessaire pour que `spread` ci-dessous ait un effet observable à la minute) tombe
dans `[from, to[`, en gérant le passage par minuit (`from > to`, comme ci-dessus).
`from === to`, ou l'un des deux non fini, → toujours fausse (jamais une ambiguïté
"toujours vraie").

Exemple réel complet — le néon (`entities/types/neon.js`), présent uniquement la
nuit :

```js
presence: [{ when: { type: "timeRange", from: 20, to: 6 }, present: true }],
```

#### Variation de seuil par instance (`spread`)

```js
{ type: "timeRange", from: 6, to: 6.5, spread: 5 }
```

`spread` (optionnel, en MINUTES) désynchronise des entités qui partagent la MÊME
règle temporelle — le pendant TEMPOREL de l'éparpillement spatial
(`core/state.js`/`spawnScatteredEphemerals`) : même esprit ("désynchroniser sans
introduire d'état"), mécanisme différent. Vaut pour TOUT seuil temporel, pas
seulement un départ de PNJ — une lumière "vers le soir", un commerce qui ouvre
"vers 8h", etc. se désynchronisent exactement de la même façon.

Chaque entité obtient un décalage effectif dans `[-spread, +spread]` (minutes),
appliqué IDENTIQUEMENT à `from` ET `to` (la fenêtre entière glisse, sa largeur ne
change jamais) — trois PNJ partageant `{ from: 6, to: 6.5, spread: 5 }` basculent
chacun à SA propre minute entre 5h55 et 6h05, jamais tous à 6h00 pile.

Le décalage n'est PAS un délai ni une attente : le déclenchement reste INSTANTANÉ,
c'est le SEUIL lui-même qui diffère par entité. Dérivé de façon DÉTERMINISTE de
l'id de l'entité + les bornes `from`/`to` de la règle (voir
`core/temporal-spread.js`/`temporalThresholdOffset`) — jamais stocké ni
sérialisé : recalculé à l'identique à CHAQUE évaluation, donc STABLE à travers
ticks, rechargements et re-visites de scène (même entité + même règle → toujours
le même décalage). Le passage par minuit du DÉCALAGE lui-même (un seuil proche de
0h peut se retrouver de l'autre côté après décalage) est géré indépendamment du
passage par minuit de la FENÊTRE `from`/`to` — les deux cohabitent sans conflit.

Sans `spread` déclaré (ou évalué hors d'une entité de monde, ex.
`action.condition`, voir `view/interaction.js`/`actionConditionMet`) : décalage
nul, comportement EXACTEMENT inchangé — seuil pile sur `from`/`to`, comme avant ce
mécanisme.

Exemple — trois habitués d'un bar, même règle de départ partagée, décalés de
quelques minutes chacun (voir `core/movement.check.js`, section "le bar") :

```js
const departureRule = {
  when: { type: "timeRange", from: 6, to: 6.5, spread: 5 },
  effects: [{ type: "behavior", behavior: { kind: "goto", targetId: "door-bar-exit" } }],
};
// Les trois patrons portent LA MÊME règle (même objet ou un clone identique) —
// c'est leur id d'entité, seul, qui fait varier le décalage effectif.
```

### `arrived` — un `goto` a atteint sa cible

```js
{ type: "arrived" }
```

Sans champ propre. Vraie si le comportement ACTIF de `context.entity` est ENCORE
`"goto"` ET que ce goto a posé `entity.gotoArrived` (voir `core/behaviors/goto.js`).
La garde sur le comportement ACTIF (pas seulement le drapeau, qui reste posé pour
toujours) évite qu'une entité redevienne faussement "arrivée" après un nouveau cycle
`wander` → `goto`. Événementielle (dépend d'un FAIT de simulation), contrairement à
`timeRange`, purement temporelle — les deux cohabitent dans le même registre sans
qu'aucun code appelant n'ait à distinguer leur nature. Voir "Règles" plus bas pour
un exemple complet en contexte (routine d'un PNJ).

### `consumed` — collectible persistant activé

```js
{ type: "consumed" }
```

Sans champ propre. Vraie si `context.entity.consumed === true` (posé par
`core/state.js`/`markConsumed`, voir `entities/model.md`/"Collectible persistant").
PERMANENT : `consumed` ne repasse jamais à `false`, donc une règle sur cette
condition bascule une fois pour toutes.

Exemple réel complet — `crate-warehouse` (`level/demo2.json`), qui devient
dormante une fois son contenu récupéré (DEUX règles requises, la seconde étant le
filet "présente sinon" — sans elle, l'entité serait dormante en permanence, avant
*et* après activation) :

```json
"presence": [
  { "when": { "type": "consumed" }, "present": false },
  { "when": { "type": "timeRange", "from": 0, "to": 24 }, "present": true }
]
```

### `hasEquipmentTag` — un équipement porte un tag

```js
{ type: "hasEquipmentTag", tag: "chic" }
```

Vraie si `context.entity.equipment` porte, sur un slot occupé, un objet marqué de
`tag` (délègue à `core/equipment.js`/`equippedTags`, qui fait l'union des tags de
tout ce qui est équipé). Entité sans champ `equipment` → fausse, jamais une
exception. `tag` est validé contre `core/tags.js`/`TAG_REGISTRY` au chargement (voir
"Validation" plus haut) — voir "Tags" plus bas pour le registre.

**Nuance capitale, propre à cette condition** : "l'entité concernée"
(`context.entity`) N'EST PAS TOUJOURS la même chose selon le CONSOMMATEUR :

- dans une règle de **présence/comportement** (`entity.presence`), `context.entity`
  est l'entité RÉGIE par SA PROPRE règle (voir `core/presence.js`/
  `resolveEntityRules`, qui construit `{ ...context, entity }`) — un futur
  compagnon/PNJ équipé vérifierait SON PROPRE équipement.
- dans une **condition d'action** (`action.condition`), `context.entity` porte
  l'équipement du JOUEUR (voir "Conditions d'action" plus bas) — c'est lui qui
  DÉCLENCHE l'action, jamais l'entité-cible (une porte n'a pas d'équipement).

Le champ s'appelle pareil, l'évaluateur est identique, mais QUI il désigne dépend du
point d'appel — à documenter explicitement dans tout nouveau consommateur.

### `perceptionActive` — perception surnaturelle active

```js
{ type: "perceptionActive" }
```

Sans champ propre. Vraie si `context.perceptionActive` est vrai — posé par
`core/reduce.js`/TICK dans `presenceContext` (`{ time, perceptionActive }`, PARTAGÉ
par tout le tick, exactement comme `time`), lui-même dérivé de
`session.perceptionActive` (`core/state.js`/`togglePerception`, bascule via une
touche dédiée, voir `view/city-screen.js`). Contexte SANS `perceptionActive` (ex.
`action.condition`, voir "Conditions d'action" plus bas) → `context.perceptionActive`
vaut `undefined` → `Boolean(undefined)` → fausse, même repli défensif que les autres
évaluateurs.

Une entité SURNATURELLE n'est RIEN DE PLUS qu'une entité normale dont la présence
est conditionnée par cette condition — aucun champ d'entité dédié, aucun mécanisme
séparé (voir `entities/types/ghost.js`, le pendant de `neon.js` pour `timeRange`) :
DORMANTE (silencieuse, non examinable, jamais bloquante) tant que la perception est
inactive, PRÉSENTE dès qu'elle s'active — état conservé à la désactivation (comme
tout `present:false`), jamais réinitialisé.

Exemple réel complet — `spirit-1` (`level/demo.json`) :

```json
"presence": [{ "when": { "type": "perceptionActive" }, "present": true }]
```

Côté VUE (`view/audio/city-scene.js`), la bascule de perception déclenche AUSSI un
crossfade musique/ambiance vers des pools surnaturels globaux
(`config/perception.js`) et un fondu du filtre d'étouffement des entités MONDAINES
(réutilise la chaîne d'occlusion RECTO/VERSO, `config/tuning-values.js`/
`mufflingLowpassHz`/`mufflingGain`) — une entité dont la présence porte cette
condition (`isPerceptionGated`, `view/audio/city-scene.js`) en est TOUJOURS
exemptée, elle émerge pleine et claire. Détail complet côté vue : voir les
commentaires de `view/audio/city-scene.js` (`effectiveMuffleAmount`,
`currentMundaneMuffleAmount`) — hors de portée de ce document, qui ne couvre que le
format déclaratif du core.

Exemple réel complet : voir "Conditions d'action" (la porte à dresscode).

### `weather` — météo courante

```js
{ type: "weather", state: "fog" }
```

Vraie si l'état météo courant (`context.weather`, posé par `core/reduce.js`/TICK dans
`presenceContext`, `{ time, perceptionActive, weather }`, PARTAGÉ par tout le tick —
même patron que `perceptionActive` ci-dessus, dérivé de `session.weather.state`, voir
`core/weather.js`) est EXACTEMENT `state`. `state` est validé au chargement contre
`config/weather-values.js`/`WEATHER_STATES` (comme `hasEquipmentTag.tag` contre
`TAG_REGISTRY`) — un état inconnu échoue clairement plutôt que de dégrader vers "jamais
vraie". Contexte SANS `weather` (ex. `action.condition`) → `context.weather` vaut
`undefined` → jamais égal à un `state` déclaré → fausse, même repli défensif que les
autres évaluateurs.

Testable EN JEU sans attendre le hasard via le menu debug météo (Shift+W, mode debug —
voir `view/menus/debug-weather-menu.js`), qui force directement `session.weather.state`
(`core/weather.js`/`setWeather`).

Exemple réel complet — `cumuloLupus` (`entities/types/cumulo-lupus.js`), présent
seulement sous la brume :

```js
presence: [{ when: { type: "weather", state: "fog" }, present: true }],
```

Note de composition : cette condition ne se combine PAS (pas de `ET` entre deux types de
condition dans une même règle aujourd'hui) — un loup à la fois surnaturel ET brumeux
demanderait une future condition composite (`allOf`), pas construite tant qu'un seul cas
d'usage ne la justifie pas (voir CLAUDE.md/anti-abstraction prématurée).

Côté VUE (`view/audio/city-scene.js`), un changement de `session.weather.state` déclenche
AUSSI une AMBIANCE SONORE dédiée : une couche GLOBALE (`lib/audio.js`/
`setWeatherAmbienceLayer`), SUPERPOSÉE à l'ambiance du lieu (jamais à sa place,
contrairement à la couche `"state"` de perception qui REMPLACE le lieu) et persistante
au niveau module — elle continue SANS COUPURE à travers une transition de scène tant que
NI la météo NI le contexte indoor/outdoor de la scène active ne changent, et ne fond
(crossfade existant, `lib/audio.js`/`crossfadeAmbience`) qu'à une vraie transition météo
OU de contexte. `WEATHER_STATES[state].ambience` (optionnel, `config/weather-values.js`)
déclare DEUX pools DISTINCTS par contexte (`{ outdoor?, indoor? }`, modèle A — deux
matériaux sonores réels, jamais un filtre) : le rendu LIT le pool du contexte de la scène
active (`indoor`, propriété de FACE — voir `core/level.js`/`parseFace` et
`level/schema.md`), il ne le COMPOSE jamais. Un contexte absent pour un état donné
reste silencieux dans CE contexte (ex. la brume, inaudible à l'intérieur). Hors de
portée de ce document (format déclaratif du core) : détail complet côté vue dans les
commentaires de `view/audio/city-scene.js` (`declareWeatherAmbience`) et `lib/audio.js`
(`targetAmbience`).

### Ajouter un type de condition

1. Un cas dans `CONDITION_EVALUATORS` (`core/presence.js`) : `(cond, context) ->
   boolean`, jamais un throw (dégrade sur `false`).
2. Rien à faire côté `CONDITION_TYPES` (dérivé automatiquement du registre) ni côté
   `isPresent`/`resolveEntityRules`/`core/reduce.js` — l'aiguillage est déjà
   générique.
3. Si le type référence un registre de CONTENU externe (comme `hasEquipmentTag` ↔
   `TAG_REGISTRY`) : ajoute une validation dédiée dans
   `core/level.js`/`validateCondition`, sur le modèle du bloc `hasEquipmentTag`.
   Sinon, rien à valider en plus (dégradation silencieuse acceptée).
4. Ajoute une sous-section ICI (forme + exemple réel) et complète les tableaux de
   `level/schema.md`/"Présence conditionnelle" (même table, dupliquée là pour le
   contrat JSON — les deux DOIVENT rester synchronisés).

## Effets

Un effet porté par une règle : `{ type: "<clé>", ...champs }`. Contrairement aux
conditions, PAS un registre uniforme — aiguillage EXPLICITE (`core/level.js`/
`parseEffect` pour la validation, `core/presence.js`/`resolveEntityRules` pour
l'application) car chaque effet a une validation ET une application propres à son
type, qu'un registre de noms ne suffirait pas à couvrir.

**⚠️ À jour avec `core/level.js`/`parseEffect` ET `core/presence.js`/
`resolveEntityRules`** — types existants :

### `"presence"` — décide si l'entité est affichée/simulée

```js
{ type: "presence", present: true }
```

`present` (booléen, requis). Parmi les règles dont `when` est vrai, la PREMIÈRE qui
porte un effet `"presence"` décide (les autres, actives mais sans cet effet, sont
ignorées pour cette décision précise). Aucune règle couvrante → dormante par défaut.
Voir `entities/model.md`/"Présence : la valeur résolue" pour la sémantique complète
(les trois plans coupés par l'état dormant).

### `"behavior"` — pose un comportement de mouvement

```js
{ type: "behavior", behavior: { kind: "goto", targetId: "door-1" } }
```

`behavior` (objet, requis, OU `null`) : un objet — MÊME forme que le champ
`behavior` d'une entité, validé par `core/level.js`/`parseBehavior`, qui délègue à
`core/behaviors/index.js` (registre des kinds — `wander`, `follow`, `goto`
aujourd'hui, chacun avec ses propres paramètres et sa propre validation, voir leurs
fichiers respectifs) ; ou `null` — RETRAIT explicite du comportement actif (l'entité
redevient immobile, comme si elle n'en avait jamais eu). Appliqué SEULEMENT sur la
bascule (faux → vrai) de SA PROPRE condition, jamais réappliqué en continu tant
qu'elle reste vraie (sinon un `goto` déjà en cours serait sans cesse réarmé) —
EXCEPTION : le tout premier calcul d'une entité compte comme une bascule, pour
qu'une entité chargée en pleine fenêtre active ne reste pas coincée sur son
comportement DÉCLARÉ. Plusieurs effets `"behavior"` actifs à la fois ne se
disputent pas un rang comme `"presence"` : ils s'appliquent chacun sur leur propre
bascule ; en cas de chevauchement (non recommandé), le dernier de la liste gagne.

**Pourquoi `null` existe** : `entity.gotoArrived` n'est JAMAIS remis à `false`
(voir `arrived` plus haut) — la SEULE façon de neutraliser un `arrived` périmé est
de changer `behavior.kind` pour autre chose que `"goto"`. Une entité qui alterne
`wander` ↔ `goto` (comme l'habitant de `demo.json`, voir "Règles" plus bas) le fait
naturellement à chaque cycle. Une entité qui n'a AUCUN comportement de repos
(`"aucun"`, ex. `npc-resident-home` de `demo2.json`) n'a rien d'autre vers quoi
"changer" — sans ce retrait explicite, elle resterait bloquée `arrived` (donc
dormante) pour toujours dès sa première arrivée. `behavior: null` comble ce vide :
il fait basculer `behavior.kind` à `undefined` (via `entity.behavior = null`),
suffisant pour que `arrived` redevienne fausse au cycle suivant, SANS lui donner de
comportement de repos pour autant.

### Ajouter un type d'effet

1. Un cas dans `core/level.js`/`parseEffect` : valide la FORME propre à ce type,
   renvoie `{ type, ...champs validés }`.
2. Un cas dans `core/presence.js`/`resolveEntityRules` : décrit ce que l'effet
   PRODUIT (une valeur résolue comme `"presence"`, ou un objet pour l'appelant comme
   `"behavior"` → `behaviorEffect`).
3. TOUJOURS ces DEUX endroits (contrairement à une condition, qui n'en a qu'un) —
   c'est la différence structurelle entre "registre uniforme" et "aiguillage
   explicite", voir le premier paragraphe de cette section.
4. Ajoute une sous-section ICI.

## Règles

Une règle : `{ when: <condition>, effects: [<effet>, ...] }`. RACCOURCI
rétrocompatible, encore accepté en entrée : `{ when: <condition>, present:
<boolean> }` (sans `effects`) — normalisé par `core/level.js`/`parsePresenceRule`
en forme canonique `{ when, effects: [{ type: "presence", present }] }` ; tout
consommateur d'une entité PARSÉE ne voit plus que la forme canonique. Une règle
sans AUCUN effet (ni `effects` ni `present`) échoue au chargement — une règle
muette qu'on croirait active serait pire qu'une erreur claire.

`entity.presence` est un TABLEAU de règles, évaluées DANS L'ORDRE à chaque tick
(voir `core/presence.js`/`resolveEntityRules`) :
- la présence résolue = celle du PREMIER effet `"presence"` dont la règle est
  active (recherche continue si une règle active n'en porte pas) ;
- chaque effet `"behavior"` s'applique sur SA PROPRE bascule, indépendamment du
  rang de sa règle.

**Exemple réel — le néon** (une seule règle, déjà vu plus haut dans "Conditions") :
présent la nuit, aucune règle ne couvre le jour → dormant par défaut, sans
deuxième règle explicite.

**Exemple réel complet — le même PNJ, DEUX déclarations séparées, DEUX cycles
complémentaires** (`level/demo.json`/`npc-resident` et
`level/demo2.json`/`npc-resident-home` — voir `entities/model.md`/"Présence
conditionnelle et triggers de comportement" pour la sémantique complète, et
`core/movement.check.js`, section "Routine complète", pour la vérification tick
par tick d'un cycle équivalent) :

`npc-resident` (`level/demo.json`) — présent le jour (8h-20h, erre), part vers
la porte de sortie à 20h, dormant à l'arrivée, filet de sécurité à 23h :

```json
"behavior": { "kind": "wander" },
"presence": [
  { "when": { "type": "arrived" }, "effects": [{ "type": "presence", "present": false }] },
  { "when": { "type": "timeRange", "from": 23, "to": 8 }, "effects": [{ "type": "presence", "present": false }] },
  {
    "when": { "type": "timeRange", "from": 8, "to": 20 },
    "effects": [
      { "type": "presence", "present": true },
      { "type": "behavior", "behavior": { "kind": "wander" } }
    ]
  },
  {
    "when": { "type": "timeRange", "from": 20, "to": 23 },
    "effects": [
      { "type": "presence", "present": true },
      { "type": "behavior", "behavior": { "kind": "goto", "targetId": "door-exit" } }
    ]
  }
]
```

`npc-resident-home` (`level/demo2.json`) — CYCLE INVERSÉ ET COMPLÉMENTAIRE :
présent la nuit (20h-8h, immobile — "aucun" comportement de repos, contrairement
à son double diurne), part vers la porte à 8h, dormant à l'arrivée, filet de
sécurité à 11h :

```json
"presence": [
  { "when": { "type": "arrived" }, "effects": [{ "type": "presence", "present": false }] },
  { "when": { "type": "timeRange", "from": 11, "to": 20 }, "effects": [{ "type": "presence", "present": false }] },
  {
    "when": { "type": "timeRange", "from": 20, "to": 8 },
    "effects": [
      { "type": "presence", "present": true },
      { "type": "behavior", "behavior": null }
    ]
  },
  {
    "when": { "type": "timeRange", "from": 8, "to": 11 },
    "effects": [
      { "type": "presence", "present": true },
      { "type": "behavior", "behavior": { "kind": "goto", "targetId": "door-back" } }
    ]
  }
]
```

Sans comportement de repos vers lequel revenir, `npc-resident-home` a besoin du
retrait explicite `behavior: null` (voir "Effets"/`"behavior"` plus haut) au
moment où la présence reprend (20h) — SINON `entity.gotoArrived`, jamais remis à
`false`, et `behavior.kind` resté à `"goto"` depuis le trajet du matin
laisseraient la condition `"arrived"` durablement vraie, et l'entité durablement
dormante dès la deuxième journée. `npc-resident` n'a pas ce problème : sa règle
diurne réassigne `wander` (un `kind` différent de `"goto"`), ce qui neutralise
`"arrived"` par le même mécanisme, sans retrait explicite nécessaire — DEUX
solutions au même problème structurel, à choisir selon qu'une entité a ou non un
comportement de repos actif.

Cet exemple illustre aussi pourquoi l'ORDRE des règles compte pour `"presence"`
(la règle `"arrived"` doit précéder les fenêtres "présent", sinon ces dernières
gagneraient toujours) mais pas pour `"behavior"` (chaque bascule s'applique
indépendamment de l'ordre) — et pourquoi le personnage vit en DEUX instances
totalement indépendantes, sans état partagé entre les deux mondes (voir
`entities/model.md` pour la discussion complète de ce choix).

## Actions

`entity.action` (optionnel, cascade instance → type) : `{ kind: <string>,
...paramètres }`. Le CORE (`core/level.js`) valide seulement la FORME (objet,
`kind` non vide) — jamais `kind` contre une liste connue : cet aiguillage vit
ENTIÈREMENT côté vue (`view/interaction.js`/`ACTION_HANDLERS`, même principe que
`CONDITION_EVALUATORS` mais côté vue). `kind` déclaré mais absent de ce registre →
`console.warn`, jamais audible ni fatal pour le joueur.

**⚠️ À jour avec `view/interaction.js`/`ACTION_HANDLERS`** — kinds existants :

### `"transit"` — franchir une porte

```js
action: { kind: "transit" }
```

Aucun paramètre propre : la cible vit dans `entity.target` (champ d'entité à part,
requis pour tout `type: "door"`, voir `level/schema.md`). Délègue au gestionnaire de
transition enregistré par `view/city-screen.js`. Exemple réel —
`entities/types/door.js` (défaut de l'archétype `door`, hérité par toute porte qui
ne le surcharge pas).

### `"pickup"` — ramassage, DEUX formes

Vers `session.money` :

```js
// entities/types/money.js
action: { kind: "pickup", amount: 5 },
```

Vers le sac (`session.bag`, voir `core/bag.js`/`pickupItemEntity`) :

```js
// entities/types/apple.js
action: { kind: "pickup", item: "apple", count: 1 },
```

Distinguées par la PRÉSENCE de `item` (jamais mélangées sur une même entité).
`item` doit être une clé de `core/items.js`/`ITEM_REGISTRY`.

### `"loot"` — collectible PERSISTANT, DEUX formes

Crédit direct (l'entité N'EST JAMAIS retirée, contrairement à `"pickup"` — elle
passe seulement à `consumed: true`) :

```js
// entities/types/crate.js
action: { kind: "loot", amount: 100 },
```

Éparpillement d'entités éphémères autour de la source, au lieu d'un crédit direct :

```json
// level/demo2.json, crate-stash
"action": {
  "kind": "loot",
  "spawn": { "spec": { "type": "money", "amount": 20 }, "count": 3, "spread": 1.5 }
}
```

`spec` (minimal, résolu en descripteur COMPLET côté vue —
`view/city-screen.js`/`resolveEphemeralSpec`) est le vocabulaire de la "spec
éphémère" : `{ type: <clé du registre d'entités>, ...surcharges }`. Détail complet
(limite anti-prolifération, éviction du plus ancien, exclusion de sauvegarde) :
`entities/model.md`/"Entités éphémères", `core/state.js`/`spawnEphemeral`.

### `"switchSide"` — bascule recto/verso (scène à deux faces)

```json
// entities/types/passage.js (défaut) + instance de niveau (level/demo3.json)
{ "id": "alley-gap-recto", "type": "passage", "x": 8, "action": { "kind": "switchSide", "arrivalX": 8 } }
```

`arrivalX` (nombre, requis) : point d'arrivée sur l'AUTRE face du MÊME monde —
comme `target` pour `"transit"`, mais on ne change jamais de monde
(`activeWorldId` inchangé). Délègue à `core/state.js`/`switchSide` (bascule
`player.side` + repositionne joueur/compagnons) PUIS reconstruit la scène audio
sur la nouvelle face (`view/city-screen.js`/`sideSwitchEffect`, même soin que
`transitionThroughDoor` : aucun Howl résiduel), et joue un marqueur sonore de
bascule (`view/interaction.js`, "metal_gate" — `assets/sounds/doors/metal_gate`).
`arrivalX` n'est PAS validé en bornes au chargement (comme tout `action.*`,
transport générique) — clampé à l'exécution par `switchSide`, jamais un
plantage. Détail complet du modèle à deux faces (persistance, gel de l'autre
face) : `level/schema.md`/"Scène à deux faces (recto/verso)".

### Ajouter un kind d'action

1. Un cas dans `ACTION_HANDLERS` (`view/interaction.js`) — CÔTÉ VUE uniquement, le
   core n'a rien à valider de plus que la forme générique déjà en place.
2. Ajoute une sous-section ICI (forme + exemple réel).
3. Si le nouveau kind doit pouvoir être bloqué par condition, rien à faire de
   spécial : "Conditions d'action" ci-dessous s'applique à TOUT kind sans
   modification.

## Conditions d'action

Une action peut porter `condition: <objet condition>` + `refusalKey: <clé i18n>` :

```json
// level/demo.json, door-club — MÊME kind "transit" que door-exit, juste
// conditionné en plus
{
  "id": "door-club",
  "type": "door",
  "target": "demo2",
  "action": {
    "kind": "transit",
    "condition": { "type": "hasEquipmentTag", "tag": "chic" },
    "refusalKey": "door.dresscode_refused"
  }
}
```

`condition` est le MÊME objet déclaratif que `presence[].when` — même registre,
même validation (`core/level.js`/`validateCondition`, factorisée entre les deux
usages). `refusalKey` est REQUISE dès que `condition` est présente (échec clair au
chargement sinon) : une condition sans refus laisserait l'action échouer en
silence, exactement ce que ce système évite.

Évaluation et EFFET restent entièrement côté VUE (`view/interaction.js`/`interact`,
juste avant de déléguer à `ACTION_HANDLERS`) : condition vraie → l'action s'exécute
normalement (comportement STRICTEMENT inchangé) ; condition fausse → AUCUN effet,
AUCUNE transition, juste le message `refusalKey` annoncé + un son défensif
(`assets/sounds/ui/refused`, absent aujourd'hui — avertit sans jamais planter, même
politique que tout son d'UI du projet). Action SANS `condition` (tout contenu
existant, ex. `door-exit`) → ce bloc est sauté entièrement, rétrocompatibilité
totale.

`context.entity` porte l'équipement du JOUEUR (`view/interaction.js`/
`setPlayerEquipmentProvider`, câblé par `view/city-screen.js`), PAS celui de
l'entité-cible — voir la nuance détaillée dans "Conditions"/`hasEquipmentTag`
plus haut.

**Extensibilité** : une caisse verrouillée (`"loot"` conditionnée par un futur
`questFlag`), un PNJ qui ne parle qu'à condition (un futur kind `"talk"`)
réutiliseraient cette MÊME vérification, sans y toucher — `action.condition` ne
connaît rien du `kind` qu'il protège.

## Tags

Registre de mots-étiquettes (`core/tags.js`/`TAG_REGISTRY`) pour la classification
HORIZONTALE d'un objet et de futures vérifications (PNJ, événements) — indépendant
de `stackable`/`equippable`/`slot`. Un tag est un IDENTIFIANT STABLE (la clé du
registre), traduit SEULEMENT à l'affichage via `labelKey` — jamais le texte traduit
dans une vérification, qui cesserait de matcher au changement de langue.

**⚠️ À jour avec `core/tags.js`/`TAG_REGISTRY`** pour la liste complète (aujourd'hui
: `military`, `chic`, `metal` — exemples, pas une liste garantie à jour).

Un objet porte ses tags dans `core/items.js`/`ITEM_REGISTRY[type].tags`, un tableau
optionnel :

```js
// core/items.js
combat_boots: { /* ... */ tags: ["military"] },
high_heels: { /* ... */ tags: ["chic"] },
```

**Validation stricte** : `ITEM_REGISTRY` est du CODE (pas du JSON parsé par
`core/level.js`), donc `core/items.js` se valide LUI-MÊME au chargement du module
(`validateItemTags(ITEM_REGISTRY)`, appelée en bas du fichier) — tout tag référencé
par un objet DOIT exister dans `TAG_REGISTRY`, sinon `throw` immédiat, nommant le
tag fautif et l'objet concerné. `validateItemTags` est exportée pour rester
testable avec un registre de test (`core/movement.check.js`), sans avoir à
corrompre le vrai registre.

**Tags EFFECTIVEMENT portés** (`core/equipment.js`/`equippedTags(equipment)`) :
union des tags de chaque objet ÉQUIPÉ, DÉRIVÉE, jamais stockée — même principe que
`gaitOf`. UNIFIÉ joueur/compagnon/PNJ : la fonction ne connaît que la FORME
`equipment` (`{ <slot>: <entrée>|null }`), jamais le type de porteur.

### Ajouter un tag

Une entrée dans `TAG_REGISTRY` (`core/tags.js`), avec son `labelKey` (+ la
traduction dans `data/i18n/fr/items.json`/`data/i18n/en/items.json`). Rien d'autre à
toucher — un objet peut alors le référencer dans son `tags: [...]`.

## Sources de vérité — où lire la liste exhaustive, jamais ici

| Vocabulaire | Registre / aiguillage | Fichier |
|---|---|---|
| Types de condition | `CONDITION_EVALUATORS` | `core/presence.js` |
| Types d'effet | `parseEffect` + `resolveEntityRules` | `core/level.js`, `core/presence.js` |
| Kinds d'action | `ACTION_HANDLERS` | `view/interaction.js` |
| Kinds de comportement | `BEHAVIORS` | `core/behaviors/index.js` |
| Tags | `TAG_REGISTRY` | `core/tags.js` |
| Objets et leurs tags/gait | `ITEM_REGISTRY` | `core/items.js` |
| Surfaces | `SURFACE_REGISTRY` | `core/surfaces.js` |

Doc voisines à consulter selon ce qu'on touche : `entities/model.md` (modèle
d'entité, présence en détail, entités éphémères, collectible persistant),
`level/schema.md` (contrat JSON exact d'un niveau), `core/time.md` (horloge dont
dérive `"timeRange"`).
