# Le format déclaratif du jeu ("le script")

Référence UNIQUE du vocabulaire déclaratif partagé par tout le contenu : CONDITIONS,
EFFETS, RÈGLES, ACTIONS (et leurs conditions d'accès), VARIABLES, TAGS. SEUL endroit
qui documente la GRAMMAIRE de ce vocabulaire (formes, sémantique, exemples) — jamais
dupliqué ailleurs : `doc/level-format.md` et `doc/entity-model.md` s'y RENVOIENT
plutôt que de recopier une condition/un effet/un kind. Détail spécifique-Templeton
(dormance, collectible persistant, entités éphémères, modèle de son) : toujours
`doc/entity-model.md`. Contrat JSON exact d'un niveau (types, cascades, filets) :
toujours `doc/level-format.md`. Horloge dont dérive `"timeRange"` : `doc/time.md`.

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
(minutes de jeu, voir `doc/time.md`) et `entity` (l'entité dont on évalue une
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
`core/state.js`/`markConsumed`, voir `doc/entity-model.md`/"Collectible persistant").
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

Vraie si `context.playerEquipment` porte, sur un slot occupé, un objet marqué de
`tag` (délègue à `core/equipment.js`/`equippedTags`, qui fait l'union des tags de
tout ce qui est équipé). Contexte sans `playerEquipment` → fausse, jamais une
exception. `tag` est validé contre `core/tags.js`/`TAG_REGISTRY` au chargement (voir
"Validation" plus haut) — voir "Tags" plus bas pour le registre.

**Clé de contexte DÉDIÉE, PAS `context.entity`** — TOUJOURS le JOUEUR, quel que soit
le CONSOMMATEUR : `context.entity`, lui, désigne systématiquement l'entité qui PORTE
la condition évaluée (l'entité elle-même pour `presence[].when` — voir
`core/presence.js`/`resolveEntityRules`, qui construit `{ ...context, entity }` —
l'entité qui déclare l'action pour `action.condition`, voir "Conditions d'action"
plus bas) — jamais le joueur qui déclenche une action sur une AUTRE entité (une
porte n'a pas d'équipement). Les deux rôles ont chacun leur clé PRÉCISÉMENT parce
qu'ils doivent pouvoir COEXISTER dans la MÊME condition composite (`allOf` d'un
`hasEquipmentTag` et d'un `"variable"` scope `"entity"`, voir plus bas) sans se
marcher dessus.

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

Exemple réel — combinée à `perceptionActive` via `"allOf"` (voir plus bas), un loup
surnaturel visible seulement perception active ET brume : `cumuloLupus`
(`entities/types/cumulo-lupus.js`).

### `allOf` — composite, ET logique entre plusieurs conditions

```js
{ type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] }
```

Vraie si TOUTES les sous-conditions de `conditions` le sont — délègue à
`evaluateCondition` pour CHACUNE (n'importe quel type du registre, y compris un autre
`"allOf"` imbriqué) : MÊME registre, MÊME évaluateur, jamais un second mécanisme de
composition. `conditions` validé au chargement (`core/level.js`/`validateCondition`,
factorisée : tableau NON VIDE, chaque élément revalidé RÉCURSIVEMENT par la même
fonction) — une sous-condition mal formée échoue donc exactement comme si elle était au
premier niveau. Un tableau à un SEUL élément est légal (seul un tableau VIDE est
rejeté) — redondant avec la sous-condition seule, mais pas une erreur.

Imbrication réelle — un `"allOf"` DANS un `"allOf"` (ici combiné à une troisième
condition sœur, `"consumed"`) :

```js
{
  type: "allOf",
  conditions: [
    { type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] },
    { type: "consumed" },
  ],
}
```

`evaluateCondition` s'appelle elle-même sans traitement spécial pour ce cas : le
`"allOf"` externe évalue son second élément (`"consumed"`) exactement comme le premier
(`"allOf"` imbriqué), qui lui-même redélègue à `evaluateCondition` pour ses deux
sous-conditions — aucune limite de profondeur codée en dur, testé jusqu'à deux niveaux
dans `core/movement.check.js`.

**Piège à connaître** : un consommateur qui inspecte `entity.presence[].when.type`
DIRECTEMENT (ex. `view/audio/city-scene.js`/`isPerceptionGated`, qui détecte une entité
SURNATURELLE pour l'exempter du filtre d'étouffement mondain) doit chercher la condition
recherchée RÉCURSIVEMENT à l'intérieur d'un `"allOf"` — pas seulement au premier niveau —
sous peine de rater une entité dont la condition est désormais COMPOSÉE (voir
`conditionRequiresPerception`, `view/audio/city-scene.js`, qui fait cette recherche pour
`isPerceptionGated`).

Exemple réel complet — `cumuloLupus` (`entities/types/cumulo-lupus.js`), présent
seulement perception ACTIVE ET météo BRUMEUSE (perception seule ou brume seule ne
suffisent pas) :

```js
presence: [
  {
    when: { type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] },
    present: true,
  },
],
```

Côté VUE (`view/audio/city-scene.js`), un changement de `session.weather.state` déclenche
AUSSI une AMBIANCE SONORE dédiée : une couche GLOBALE (`lib/audio.js`/
`setWeatherAmbienceLayer`), SUPERPOSÉE à l'ambiance du lieu (jamais à sa place,
contrairement à la couche `"state"` de perception qui REMPLACE le lieu) et persistante
au niveau module — elle continue SANS COUPURE à travers une transition de scène tant que
NI la météo NI le contexte indoor/outdoor de la scène active ne changent (diffing PAR
COUCHE, `lib/audio.js`/`syncAmbienceLayers` : une couche dont la source déclarée n'a pas
changé garde EXACTEMENT ses flux, jamais fondue), et ne fond (crossfade existant) qu'à
une vraie transition météo OU de contexte, SANS jamais toucher l'ambiance de lieu au
passage. `WEATHER_STATES[state].ambience` (optionnel, `config/weather-values.js`)
déclare DEUX pools DISTINCTS par contexte (`{ outdoor?, indoor? }`, modèle A — deux
matériaux sonores réels, jamais un filtre) : le rendu LIT le pool du contexte de la scène
active (`indoor`, propriété de FACE — voir `core/level.js`/`parseFace` et
`doc/level-format.md`), il ne le COMPOSE jamais. Un contexte absent pour un état donné
reste silencieux dans CE contexte (ex. la brume, inaudible à l'intérieur). Hors de
portée de ce document (format déclaratif du core) : détail complet côté vue dans les
commentaires de `view/audio/city-scene.js` (`declareWeatherAmbience`) et `lib/audio.js`
(`syncAmbienceLayers`, `desiredAmbienceSlots`).

### `variable` — lecture d'une variable, avec comparaison

```js
{ type: "variable", scope: "entity", name: "isOpen", equals: false }
{ type: "variable", scope: "party", name: "friendship_margot", greaterThan: 50 }
```

Voir "Variables" plus bas pour le MODÈLE (déclaration, portées, persistance) — cette
section couvre seulement la LECTURE. `scope` ∈ `"entity" | "scene" | "party"` :

- `"entity"` : la variable de l'entité qui PORTE la condition (`context.entity` —
  l'entité elle-même pour `presence[].when`, l'entité qui déclare l'action pour
  `action.condition`, voir "Conditions d'action" plus bas et le piège
  `hasEquipmentTag` ci-dessus pour la distinction avec `context.playerEquipment`).
- `"scene"` : la scène ACTIVE (`context.world`).
- `"party"` : global (`context.session`).

Un SEUL comparateur par condition : `"equals"` (flag ET int) ou, pour un int
SEULEMENT, `"greaterThan"` / `"lessThan"` / `"greaterOrEqual"` / `"lessOrEqual"`.
Délègue à `core/variables.js`/`getVariable(context, scope, name)` — variable
introuvable (nom jamais déclaré, ou porteur absent du contexte, ex. `"scene"`/
`"party"` dans une condition d'action aujourd'hui, `view/interaction.js` ne fournit
encore que `context.entity`) → `undefined` → AUCUN comparateur ne peut être vrai,
même repli défensif que le reste de ce registre.

**Validation au chargement** (`core/level.js`/`validateVariableReference`) :
`scope` connu, `name` non vide, EXACTEMENT un comparateur — et, SEULEMENT quand le
TYPE réel de la variable est vérifiable (portées `"entity"`/`"scene"`, dont le sac
est déjà résolu au moment où `parseLevel` atteint cette condition), cohérence
comparateur/type (`greaterThan` etc. refusés sur un `"flag"`, seul `"equals"` y est
permis) ET valeur/type du comparateur lui-même. **Limite connue, documentée plutôt
que silencieuse** : la portée `"party"` n'est JAMAIS vérifiable au chargement d'un
niveau (ses déclarations n'existent qu'à `createInitialState`, hors de portée d'un
`parseLevel` qui ne connaît qu'UN niveau) — une variable de partie mal orthographiée
n'est détectée qu'à l'ÉVALUATION (repli sur `false`), jamais au chargement.

Composable dans un `allOf` comme toute autre condition (variable ET météo, variable
ET `hasEquipmentTag`...). Exemple réel complet — la fenêtre (voir "Actions multiples
filtrées par condition" plus bas).

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
4. Ajoute une sous-section ICI (forme + exemple réel) — SEUL endroit, jamais dupliqué :
   `doc/level-format.md` ne fait que RENVOYER à cette section pour la grammaire des
   conditions, rien à synchroniser côté contrat JSON.

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
Voir `doc/entity-model.md`/"Présence : la valeur résolue" pour la sémantique complète
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
`level/demo2.json`/`npc-resident-home` — voir `doc/entity-model.md`/"Présence
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
`doc/entity-model.md` pour la discussion complète de ce choix).

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
requis pour tout `type: "door"`, voir `doc/level-format.md`). Délègue au gestionnaire de
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
`doc/entity-model.md`/"Entités éphémères", `core/state.js`/`spawnEphemeral`.

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
face) : `doc/level-format.md`/"Scène à deux faces (recto/verso)".

### `"applyEffects"` — effets déclaratifs génériques (son + écriture de variable)

```json
{
  "kind": "applyEffects",
  "sound": "assets/sounds/effects/window_blinds_open",
  "announceKey": "entity.window.opened",
  "effects": [{ "type": "setVariable", "scope": "entity", "name": "isOpen", "value": true }]
}
```

Le SEUL kind GÉNÉRIQUE de cet aiguillage : aucun état "métier" propre
(contrairement à `transit`/`pickup`/`loot`/`switchSide`, chacun lié à un système du
jeu) — sa substance est ENTIÈREMENT ce que le contenu déclare :

- `sound` (optionnel, TRANSPORT — comme `action.item`/`action.amount`) : chemin/pool
  joué défensivement (`view/interaction.js`/`handleApplyEffects`, même politique
  d'échec silencieux que `playPickupSound`).
- `announceKey` (optionnel, TRANSPORT) : clé i18n annoncée À LA PAROLE APRÈS
  l'effet — JAMAIS seulement le son (voir CLAUDE.md, accessibilité de premier
  ordre) : une bascule d'état sans confirmation parlée serait invisible à un
  lecteur d'écran.
- `effects` (optionnel) : liste d'EFFETS D'ÉCRITURE de variable — voir
  "Variables"/"Effets d'action" plus bas. Appliqués et SPLICÉS dans la partie par
  `core/state.js`/`applyEntityActionEffects`, via le gestionnaire enregistré
  (`view/interaction.js`/`setVariableEffectsHandler`, câblé par
  `view/city-screen.js`) — ce fichier ne connaît toujours pas le core directement.

Exemple réel complet : `entities/types/window.js` (voir "Actions multiples filtrées
par condition" plus bas pour le cas complet, deux candidates `applyEffects` aux
conditions opposées).

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

`context.entity` porte l'entité qui DÉCLARE l'action (celle qu'on active — voir
`view/interaction.js`/`actionContext`) ; `context.playerEquipment` (séparément,
`view/interaction.js`/`setPlayerEquipmentProvider`, câblé par `view/city-screen.js`)
porte l'équipement du JOUEUR — voir la nuance détaillée dans "Conditions"/
`hasEquipmentTag` plus haut. Une condition `"variable"` scope `"entity"` (voir
"Variables" plus bas) se résout donc contre les variables de L'ENTITÉ-CIBLE elle-même
(ex. `isOpen` d'une fenêtre), jamais contre le joueur.

**Extensibilité** : une caisse verrouillée (`"loot"` conditionnée par un futur
`questFlag`), un PNJ qui ne parle qu'à condition (un futur kind `"talk"`)
réutiliseraient cette MÊME vérification, sans y toucher — `action.condition` ne
connaît rien du `kind` qu'il protège.

## Actions multiples filtrées par condition

`entity.action` peut être soit un OBJET UNIQUE (tout ce qui précède, INCHANGÉ —
RÉTROCOMPAT stricte), soit un TABLEAU de candidates — chacune une action complète
(`kind`, `condition`/`refusalKey` optionnels, `sound`/`effects` optionnels si
`applyEffects`, voir plus haut), validée EXACTEMENT comme une action unique
(`core/level.js`/`parseSingleAction`, réutilisée à l'identique par les deux formes).

**Sélection SILENCIEUSE, pas un menu** (`core/presence.js`/`selectMatchingAction`) :
à l'ACTIVATION, la PREMIÈRE candidate (ordre de déclaration) dont la `condition` est
vraie est choisie et exécutée — entièrement dictée par l'état du jeu, aucun choix
JOUEUR. Très proche de la désambiguïsation d'ENTITÉS
(`view/interaction.js`/`chooseInteractionTarget`, qui ouvre un menu quand plusieurs
entités se chevauchent) mais un mécanisme DIFFÉRENT : ici on choisit parmi les
actions d'UNE SEULE entité, jamais via un menu. Une candidate SANS `condition`
matche TOUJOURS (utile en dernier recours, en fin de liste). **PRIORITÉ documentée**
: si plusieurs candidates matchent en même temps (contenu mal conçu — des
conditions qui ne sont pas mutuellement exclusives), UNE SEULE s'applique, la
PREMIÈRE déclarée, jamais les deux. Si AUCUNE ne matche → rien, exactement comme une
action unique à condition non remplie.

**Approche B — conditions opposées, zéro structure de contrôle impérative** : pour
une bascule à deux états (une fenêtre ouverte/fermée), DEUX candidates aux
conditions EXACTEMENT opposées (`equals: false` / `equals: true` sur la MÊME
variable) — jamais un `if`/`else` ni une machine à états codée en dur, juste deux
règles déclaratives dont l'union couvre tout l'espace du flag.

**Exemple réel complet — la fenêtre** (`entities/types/window.js`, instance dans
`level/town_square.json`) :

```js
// entities/types/window.js — l'ARCHÉTYPE porte l'action (cascade type -> instance,
// comme behavior/presence), mais PAS la variable isOpen : une variable ne cascade
// JAMAIS type -> instance (voir "Variables" plus bas) — chaque instance qui utilise
// ce type DOIT déclarer SA PROPRE isOpen, sinon le chargement échoue.
action: [
  {
    kind: "applyEffects",
    condition: { type: "variable", scope: "entity", name: "isOpen", equals: false },
    refusalKey: "entity.window.refusal", // requis dès qu'il y a une condition,
    // mais STRUCTURELLEMENT inatteignable ici : les deux conditions couvrent
    // tout l'espace du flag, une des deux matche toujours.
    sound: "assets/sounds/effects/window_blinds_open",
    announceKey: "entity.window.opened",
    effects: [{ type: "setVariable", scope: "entity", name: "isOpen", value: true }],
  },
  {
    kind: "applyEffects",
    condition: { type: "variable", scope: "entity", name: "isOpen", equals: true },
    refusalKey: "entity.window.refusal",
    sound: "assets/sounds/effects/window_blinds_close",
    announceKey: "entity.window.closed",
    effects: [{ type: "setVariable", scope: "entity", name: "isOpen", value: false }],
  },
],
```

```json
// level/town_square.json — l'INSTANCE déclare isOpen, VOLATILE (repart fermée à
// chaque rechargement, jamais de mémoire d'ouverture entre deux parties)
{
  "id": "window-1",
  "type": "window",
  "x": 17,
  "variables": [{ "name": "isOpen", "type": "flag", "initial": false, "persistent": false }]
}
```

Activer la fenêtre alterne : fermée → ouvre (son + `isOpen: true` + confirmation
parlée) ; ouverte → ferme (son + `isOpen: false` + confirmation parlée) — chaque
activation choisit la BONNE candidate parce que `isOpen` a changé depuis la
dernière, jamais un compteur ou une machine à états gérée à la main.

## Variables

**STOCKAGE** (`core/variables.js`) — déclaration, valeur initiale, persistance,
sérialisation sélective, accès pur `getVariable`/`setVariable`, **BRANCHÉ** sur la
LECTURE (type de condition `"variable"`, voir "Conditions"/`variable` plus haut —
composable dans un `allOf` comme toute autre condition) et l'ÉCRITURE (effets
`setVariable`/`toggleVariable`/`addVariable`, voir "Effets d'action" plus bas,
consommés par "Actions multiples filtrées par condition" ci-dessus). Rend le
stockage VIVANT : une condition peut désormais LIRE une variable, une action
ACTIVÉE peut l'ÉCRIRE — voir l'exemple complet de la fenêtre plus haut.

**Modèle** : deux types SEULEMENT — `"flag"` (booléen) et `"int"` (entier
strict, jamais un flottant) — flottants/chaînes viendront si un cas concret
les réclame, comme `"allOf"` est venu avec le loup (voir "Conditions"/`allOf`
plus haut). Une déclaration :

```js
{ name: "friendship", type: "int", initial: 0 }
{ name: "doorUnlocked", type: "flag", initial: false, persistent: false }
```

`name` (non vide, unique dans SA liste), `type`, `initial` (OBLIGATOIRE,
cohérent avec `type` — un flag à `true`/`false`, un int à un entier) et
`persistent` (optionnel, **défaut `true`**) : validés au chargement
(`core/variables.js`/`parseVariables`, réutilisée À L'IDENTIQUE par les trois
porteurs ci-dessous — un seul mécanisme, jamais trois). Résultat stocké,
même forme partout : `{ [name]: { type, initial, persistent, value } }` —
`value` démarre TOUJOURS égale à `initial`.

**Trois PORTÉES, même mécanisme, où l'objet `variables` est rangé change
seul** :

| Portée (API) | "Porteur" | Déclarée dans | Stockée dans |
|---|---|---|---|
| `"entity"` | une entité | `entities[].variables` (niveau) | `entity.variables` — SPARSE : absente si l'entité n'en déclare aucune (comme `behavior`/`action`/`presence`), pas de cascade type -> instance |
| `"scene"` | une scène (monde) | `variables` RACINE du fichier de niveau (voir `core/level.js`/`parseLevel`) — **PARTAGÉE**, jamais un champ de FACE : une scène à deux faces (recto/verso) n'a qu'UN SEUL sac de variables de scène | `world.variables` — TOUJOURS présent (sac vide `{}` si rien déclaré), comme `defaultSurface`/`indoor` |
| `"party"` | la partie | fourni par l'appelant à `createInitialState(level, seed, { partyVariables })` — le core n'importe AUCUN fichier de contenu (voir CLAUDE.md, "réglages en cascade") | `session.variables` — TOUJOURS présent, cercle PARTIE comme `money`/`bag`/`weather` |

`money`/`perceptionActive`/`bag`/etc. restent des champs DÉDIÉS (ils ont leur
propre logique de résolution) — ce système est réservé aux variables
GÉNÉRIQUES sans champ dédié : flags de quête, états d'objets, compteurs,
affinité...

**Persistance SÉLECTIVE à la sérialisation** (`core/save.js`) — le point clé :
`serializeGame` REMPLACE la valeur d'une variable VOLATILE par son `initial`
AVANT écriture (jamais la clé elle-même retirée). Pourquoi la valeur et pas la
clé : `deserializeGame` ne repasse JAMAIS par `parseLevel`/`parseEntity` (voir
"Chargement" plus bas) — il n'a donc AUCUN accès à la déclaration d'origine
une fois celle-ci effacée. Réinitialiser la valeur ICI, à l'écriture, est le
seul moyen pour qu'une relecture retrouve "sa valeur initiale déclarée" sans
un second mécanisme de reconstruction au chargement : ce qui atterrit sur le
disque pour une volatile EST déjà son état "comme neuve", la charger ne fait
que la lire telle quelle. Une variable PERSISTANTE (le défaut) traverse
INCHANGÉE. Sauvegarde antérieure à ce mécanisme -> sac vide `{}` (`variables`
absente, portées "scene"/"party" seulement — voir `core/save.js`/
`backfillWorld`/`migrateSave`, même politique que `defaultSurface`/`indoor`).

**Accès** (`core/variables.js`) — point d'entrée UNIQUE que le futur type de
condition et les futures actions d'écriture réutiliseront :

```js
getVariable(context, scope, name) // -> value, ou undefined si nom/portée inconnus
setVariable(context, scope, name, value) // -> le PORTEUR mis à jour (pas le contexte entier)
```

`context` : `{ entity?, world?, session? }`, assemblé par l'appelant.
`setVariable` renvoie le PORTEUR seul (entité/monde/session), jamais
recomposé dans l'état global — pour la portée `"party"`, le porteur EST déjà la
session (aucun splice nécessaire) ; pour `"entity"`/`"scene"`, l'appelant
doit replacer le porteur mis à jour au bon endroit (`session.worlds[id]`,
`face.entities[i]`) — exactement ce qu'un futur gestionnaire d'action fera,
pas codé ici. Écriture SILENCIEUSE sur nom inconnu ou valeur incohérente avec
le type (porteur renvoyé INCHANGÉ, même référence) : jamais une exception à
l'ÉCRITURE, contrairement à `parseVariables`, strict au CHARGEMENT.

### Effets d'action — `setVariable` / `toggleVariable` / `addVariable`

```js
{ type: "setVariable", scope: "entity", name: "isOpen", value: true }
{ type: "toggleVariable", scope: "entity", name: "isOpen" }
{ type: "addVariable", scope: "party", name: "friendship_test", amount: -2 }
```

Trois effets D'ÉCRITURE, déclenchés à l'ACTIVATION d'une action (`action.effects`,
voir "Actions"/`"applyEffects"` et "Actions multiples filtrées par condition"
plus haut) — AIGUILLAGE DISTINCT de "Effets" ci-dessus (`"presence"`/`"behavior"`,
appliqués au TICK par `core/presence.js`/`resolveEntityRules`) : ces trois-là n'ont
de sens qu'au moment d'une interaction PONCTUELLE, jamais réévalués en continu,
jamais mélangés dans le même registre (`core/level.js`/`parseActionEffect`, PAS
`parseEffect`).

- `"setVariable"` `{ scope, name, value }` : assigne (flag ou entier, cohérent avec
  le type déclaré).
- `"toggleVariable"` `{ scope, name }` : inverse un FLAG (erreur au chargement sur
  un int, quand le type est vérifiable).
- `"addVariable"` `{ scope, name, amount }` : ajoute `amount` (ENTIER, négatif
  accepté) à un INT (erreur au chargement sur un flag).

**Validation** : MÊME `validateVariableReference` que la condition `"variable"`
(scope/name/existence, même limite documentée sur `"party"`) + cohérence
opération/type quand il est connu.

**Application** (`core/variables.js`/`applyActionEffects(effects, context)`) :
enchaîne les effets d'UNE liste SÉQUENTIELLEMENT (le contexte progresse d'un effet
au suivant — deux effets qui touchent la MÊME variable dans la MÊME liste
s'appliquent donc dans l'ordre déclaré, jamais l'un n'écrase l'autre par accident) ;
`toggleVariable`/`addVariable` LISENT la valeur COURANTE (déjà mise à jour par un
effet précédent de CETTE liste, le cas échéant) via `getVariable`, puis délèguent à
`setVariable` — aucune logique d'écriture dupliquée. Renvoie le contexte final
(`{ entity?, world?, session? }`), à SPLICER dans la session par l'appelant —
`core/state.js`/`applyEntityActionEffects(session, entityId, effects)` fait
EXACTEMENT ça pour la vue (résout le contexte depuis le lieu ACTIF, splice le
résultat aux emplacements RÉELLEMENT touchés, une liste peut mélanger les trois
portées dans la MÊME activation), point d'entrée de
`view/interaction.js`/`setVariableEffectsHandler` (câblé par
`view/city-screen.js`).

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
| Types d'effet (presence/behavior, TICK) | `parseEffect` + `resolveEntityRules` | `core/level.js`, `core/presence.js` |
| Types d'effet d'action (ÉCRITURE de variable, ACTIVATION) | `parseActionEffect` + `applyActionEffects` | `core/level.js`, `core/variables.js` |
| Kinds d'action | `ACTION_HANDLERS` | `view/interaction.js` |
| Kinds de comportement | `BEHAVIORS` | `core/behaviors/index.js` |
| Tags | `TAG_REGISTRY` | `core/tags.js` |
| Objets et leurs tags/gait | `ITEM_REGISTRY` | `core/items.js` |
| Surfaces | `SURFACE_REGISTRY` | `core/surfaces.js` |
| Types de variable | `VARIABLE_TYPES` | `core/variables.js` |
| Portées de variable | `VARIABLE_SCOPES` | `core/variables.js` |

Doc voisines à consulter selon ce qu'on touche : `doc/entity-model.md` (modèle
d'entité, présence en détail, entités éphémères, collectible persistant),
`doc/level-format.md` (contrat JSON exact d'un niveau), `doc/time.md` (horloge dont
dérive `"timeRange"`).
