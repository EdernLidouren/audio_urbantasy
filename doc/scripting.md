# Le format déclaratif du jeu ("le script")

Référence UNIQUE du vocabulaire déclaratif partagé par tout le contenu : CONDITIONS,
EFFETS, RÈGLES, ACTIONS (et leurs conditions d'accès), VARIABLES, TAGS. SEUL endroit
qui documente la GRAMMAIRE de ce vocabulaire (formes, sémantique, exemples) — jamais
dupliqué ailleurs : `doc/scene-format.md` et `doc/entity-model.md` s'y RENVOIENT
plutôt que de recopier une condition/un effet/un kind. Détail spécifique-Templeton
(dormance, collectible persistant, entités éphémères, modèle de son) : toujours
`doc/entity-model.md`. Contrat JSON exact d'une scène (types, cascades, filets) :
toujours `doc/scene-format.md`. Horloge dont dérive `"timeRange"` : `doc/time.md`.

**Principe anti-divergence, lu avant d'écrire ici** : ce document explique des
CONCEPTS et une STRUCTURE stables, illustrés par des exemples RÉELS et complets. Il
ne recopie JAMAIS une liste qui vit dans le code (elle finirait fausse) — chaque
liste exhaustive (types de condition, kinds d'action, tags) renvoie au fichier
source. Chaque section porte une ligne **⚠️ À jour avec** qui nomme ce fichier :
si tu ajoutes un type/kind/tag, mets à jour le CODE d'abord, puis complète la
section correspondante ICI (nouvel exemple si le concept le justifie) — cette
maintenance fait partie du travail, voir `CLAUDE.md`.

## Vue d'ensemble : une seule couche de conditions, quatre consommateurs

Le même objet condition (`{ type, ...champs }`) et le même évaluateur
(`core/presence.js`/`evaluateCondition`) servent aujourd'hui à QUATRE usages, sans
jamais quatre mécanismes séparés :

1. **Présence conditionnelle** — `entity.presence` décide si une entité est
   affichée/simulée (voir "Règles" plus bas).
2. **Triggers de comportement** — une règle de présence peut AUSSI poser un
   comportement de mouvement à la bascule (même tableau `presence`, effet
   `"behavior"`).
3. **Conditions d'action** — `entity.action.condition` décide si une action
   (applyEffects, pickup, loot...) s'exécute ou déclenche un refus.
4. **Beacon conditionnel** — `sounds.beacon.condition` décide si le beacon d'une
   entité sonne (ex. un vidéoprojecteur allumé/éteint par une variable) ; voir
   `doc/entity-model.md`/"Beacon conditionnel".

Un futur PNJ qui ne parle qu'à condition, ou un dialogue conditionnel, RÉUTILISERAIT
cette même couche (nouveau CONSOMMATEUR du même évaluateur), jamais un système de
conditions parallèle.

## Conditions

**Forme** : `{ type: "<clé>", ...champs propres au type }`. `type` est un aiguillage
tenu par un REGISTRE — `CONDITION_EVALUATORS` dans `core/presence.js` — chaque
entrée réduite à la même signature `(cond, context) -> boolean`. `evaluateCondition`
délègue au bon évaluateur ; un `type` inconnu à l'ÉVALUATION (hors du chemin validé
au chargement, ex. un appel direct depuis `core/checks/conditions.check.js`) renvoie `false`,
jamais une exception.

`context` transporte ce dont un évaluateur peut avoir besoin — aujourd'hui `time`
(minutes de jeu, voir `doc/time.md`) et `entity` (l'entité dont on évalue une
propriété PROPRE, ajoutée AVANT l'appel par l'appelant — voir la nuance
`hasEquipmentTag` plus bas, où "l'entité" concernée n'est pas toujours celle qui
porte la règle). Étendre `context` demain (`season`, `weather`...) ne change jamais
la signature d'`evaluateCondition`, seulement ce que l'appelant y met.

**Validation au chargement** (`core/script-parse.js`/`validateCondition`, FACTORISÉE et
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
quelques minutes chacun (voir `core/checks/routines.check.js`, section "le bar") :

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

Exemple réel complet — `crate-warehouse` (`scenes/demo2.json`), qui devient
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

### `hasImprovement` — le joueur possède une AMÉLIORATION

```js
{ type: "hasImprovement", id: "supernatural_perception" }
```

Vraie si le joueur possède l'amélioration `id` (voir "Améliorations
(improvements)" plus bas pour le registre/le stockage complets). Lit
`context.session.improvements` — MÊME clé de contexte qu'une condition
`"variable"` scope `"party"` (`context.session`, voir "Variables" plus bas) :
une improvement est cercle PARTIE comme une variable de partie, jamais un
second mécanisme de contexte. Contexte sans `session` → fausse, même repli
défensif que les autres évaluateurs. `id` validé contre
`core/improvements.js`/`IMPROVEMENT_REGISTRY` au chargement (voir
"Validation" plus haut) — même sévérité que `hasEquipmentTag`/`tag`.

**COURT-CIRCUIT DEBUG** (`config/debug.js`/`isDebugEnabled`) : en mode debug,
cette condition répond TOUJOURS vraie, SANS même consulter
`context.session.improvements` — voir "Améliorations (improvements)" plus
bas pour le principe complet (lecture ment, écriture jamais touchée).

### `perceptionActive` — perception surnaturelle active

```js
{ type: "perceptionActive" }
```

Sans champ propre. Vraie si `context.perceptionActive` est vrai — posé par
`core/reduce.js`/TICK dans `presenceContext` (construit par
`core/presence.js`/`presenceContextOf`, voir `variable` plus bas), PARTAGÉ
par tout le tick, exactement comme `time`), lui-même dérivé de
`session.perceptionActive` (`core/state.js`/`togglePerception`, bascule via une
touche dédiée — GATÉE par l'improvement `supernatural_perception`, voir
`view/perception-toggle.js`/`toggle` et "Améliorations
(improvements)" plus bas — jamais cette condition elle-même, qui reste un
simple miroir de `session.perceptionActive`). Contexte SANS `perceptionActive`
(ex. `action.condition`, voir "Conditions d'action" plus bas) →
`context.perceptionActive` vaut `undefined` → `Boolean(undefined)` → fausse,
même repli défensif que les autres évaluateurs.

Une entité SURNATURELLE n'est RIEN DE PLUS qu'une entité normale dont la présence
est conditionnée par cette condition — aucun champ d'entité dédié, aucun mécanisme
séparé (voir `entities/types/ghost.js`, le pendant de `neon.js` pour `timeRange`) :
DORMANTE (silencieuse, non examinable, jamais bloquante) tant que la perception est
inactive, PRÉSENTE dès qu'elle s'active — état conservé à la désactivation (comme
tout `present:false`), jamais réinitialisé.

Exemple réel complet — `spirit_1` (`scenes/demo.json`) :

```json
"presence": [{ "when": { "type": "perceptionActive" }, "present": true }]
```

Côté VUE (`view/audio/city-scene.js`), la bascule de perception déclenche AUSSI un
crossfade musique/ambiance vers des pools surnaturels globaux
(`config/perception.js`) et un fondu du filtre d'étouffement des entités MONDAINES
(MÊME chaîne de rendu que l'occlusion RECTO/VERSO, mais son PROPRE profil
de réglage : `config/tuning-values.js`/`perceptionMufflingLowpassHz`/
`perceptionMufflingGain`, indépendant de `faceMuffling*`) — une entité dont
la présence porte cette
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
`presenceContext`, construit par `presenceContextOf`, PARTAGÉ par tout le tick —
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
composition. `conditions` validé au chargement (`core/script-parse.js`/`validateCondition`,
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
dans `core/checks/conditions.check.js`.

**Piège à connaître** : un consommateur qui inspecte `entity.presence[].when.type`
DIRECTEMENT (ex. `view/audio/entity-sound-entry.js`/`isPerceptionGated`, qui détecte une entité
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
`setWeatherAmbienceLayer`), SUPERPOSÉE à l'ambiance de la scène (jamais à sa place,
contrairement à la couche `"state"` de perception qui REMPLACE celle de la scène) et persistante
au niveau module — elle continue SANS COUPURE à travers une transition de scène tant que
NI la météo NI le contexte indoor/outdoor de la scène active ne changent (diffing PAR
COUCHE, `lib/audio/ambience.js`/`syncAmbienceLayers` : une couche dont la source déclarée n'a pas
changé garde EXACTEMENT ses flux, jamais fondue), et ne fond (crossfade existant) qu'à
une vraie transition météo OU de contexte, SANS jamais toucher l'ambiance de scène au
passage. `WEATHER_STATES[state].ambience` (optionnel, `config/weather-values.js`)
déclare DEUX pools DISTINCTS par contexte (`{ outdoor?, indoor? }`, modèle A — deux
matériaux sonores réels, jamais un filtre) : le rendu LIT le pool du contexte de la scène
active (`indoor`, propriété de FACE — voir `core/scene.js`/`parseFace` et
`doc/scene-format.md`), il ne le COMPOSE jamais. Un contexte absent pour un état donné
reste silencieux dans CE contexte (ex. la brume, inaudible à l'intérieur). Hors de
portée de ce document (format déclaratif du core) : détail complet côté vue dans les
commentaires de `view/audio/city-scene.js` (`declareWeatherAmbience`) et `lib/audio.js`
(`syncAmbienceLayers`, `desiredAmbienceSlots`).

Le MÊME changement déclenche AUSSI une ANNONCE (non-assertive, canal ambiance) —
`view/ambient-announcements.js`/`composeWeatherTransitionMessage` : {fin de l'état QUITTÉ} +
{début de l'état REJOINT}, composés PAR GABARIT i18n (`weather.transition.both`/
`weather.transition.startOnly`, `data/i18n/*/weather.json`), jamais une concaténation en
dur — un fragment i18n vide (ex. `weather.transition.clear.end`, "dégagé" n'a rien à dire
en partant) omet proprement sa partie de la phrase (gabarit "un seul", pas de virgule
orpheline). MÊME principe pour la bascule de PHASE jour/nuit (`phaseAt`,
`time.phase.dayBegins`/`time.phase.nightBegins`) — deux clés fixes, aucune composition
nécessaire (une seule phase à la fois, jamais de fragment à assembler).

### `not` — composite, négation logique

```js
{ type: "not", condition: { type: "perceptionActive" } }
```

Vraie si SA sous-condition `condition` est fausse — délègue à `evaluateCondition`,
n'importe quel type du registre, y compris `"allOf"` ou un autre `"not"` : même
registre, même évaluateur que `"allOf"`, jamais un second mécanisme. `condition` est
OBLIGATOIRE (un objet, jamais un tableau), revalidée RÉCURSIVEMENT au chargement
(`core/script-parse.js`/`validateCondition`). Composable dans les deux sens : `"not"` dans un
`"allOf"` (« brume ET hors perception ») comme `"allOf"` dans un `"not"` (« pas à la
fois perception et brume »).

Utile surtout pour la PRÉSENCE : une entité qu'aucune règle ne couvre est dormante par
défaut, `"not"` est donc le moyen d'écrire « présente SAUF quand… ». Pas de `anyOf`
pour l'instant : aucun cas concret (un « ou » d'action s'écrit en candidates
multiples, voir "Actions multiples filtrées par condition").

**Piège à connaître — inverse de celui d'`"allOf"`** : un inspecteur de structure qui
cherche une condition dans `presence[].when` (ex. `view/audio/entity-sound-entry.js`/
`conditionRequiresPerception`, qui repère les entités SURNATURELLES) ne doit PAS
descendre dans un `"not"` comme dans un `"allOf"`. `{ not: perceptionActive }` décrit
une entité MONDAINE, présente hors perception : la prendre pour surnaturelle
l'exempterait à tort de l'étouffement mondain. `conditionRequiresPerception` ne
parcourt donc jamais `"not"` (une double négation y est traitée comme mondaine,
prudemment).

Exemple réel complet — les deux miroirs superposés de
`scenes/clock-tower-weight-shaft.json` (archétypes `entities/types/mirror.js`
et `magic_mirror.js`), jamais présents ensemble, jamais absents ensemble :

```js
// Miroir ordinaire — présent HORS perception.
presence: [{ when: { type: "not", condition: { type: "perceptionActive" } }, present: true }]
// Miroir magique — présent EN perception.
presence: [{ when: { type: "perceptionActive" }, present: true }]
```

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

**Contexte d'évaluation.** Pour les règles de présence, il vient TOUJOURS de
`core/presence.js`/`presenceContextOf(session)` : `{ time, perceptionActive,
weather, world, session }`, `world` étant le monde RACINE (variables de scène
partagées entre recto et verso). C'est la SOURCE UNIQUE, utilisée par le TICK
et par la vue quand elle doit connaître une présence hors tick (montage de la
scène audio, qui coupe d'emblée le beacon d'une entité dormante). Ne jamais
reconstruire ce contexte à la main : sans `world` ni `session`, une condition
de portée `"scene"`/`"party"` vaut toujours faux. Les conditions d'action
(`view/interaction.js`/`actionContext`) et les beacons conditionnels
(`view/audio/entity-audio.js`/`beaconConditionAllows`) reçoivent les mêmes
porteurs, plus l'équipement du joueur.

**Exemple réel — deux entités en alternance sur un état de la salle**
(`scenes/town-square-town-hall-meeting-room.json`). Le vidéoprojecteur du recto
écrit une variable de SCÈNE `projectorOn` (son instance remplace l'action et la
condition de beacon de son archétype par leur version `scope: "scene"`) ; la projection est
présente quand elle vaut `true`, une porte cachée quand elle vaut `false`
(même principe que les deux miroirs et `perceptionActive`). Une entité ne lit
jamais les variables d'une AUTRE entité : un état partagé par plusieurs
entités appartient à la scène.

```json
"variables": [{ "name": "projectorOn", "type": "flag", "initial": true }],
"entities": [
  { "id": "video_projection_1", "type": "video_projection", "x": 5,
    "presence": [{ "when": { "type": "variable", "scope": "scene", "name": "projectorOn", "equals": true }, "present": true }] },
  { "id": "hidden_door_1", "type": "door", "x": 5,
    "presence": [{ "when": { "type": "variable", "scope": "scene", "name": "projectorOn", "equals": false }, "present": true }] }
]
```

Un SEUL comparateur par condition : `"equals"` (flag ET int) ou, pour un int
SEULEMENT, `"greaterThan"` / `"lessThan"` / `"greaterOrEqual"` / `"lessOrEqual"`.
Délègue à `core/variables.js`/`getVariable(context, scope, name)` — variable
introuvable (nom jamais déclaré, ou porteur absent du contexte) → `undefined` →
AUCUN comparateur ne peut être vrai, même repli défensif que le reste de ce
registre.

**Validation au chargement** (`core/script-parse.js`/`validateVariableReference`) :
`scope` connu, `name` non vide, EXACTEMENT un comparateur — et, SEULEMENT quand le
TYPE réel de la variable est vérifiable (portées `"entity"`/`"scene"`, dont le sac
est déjà résolu au moment où `parseScene` atteint cette condition), cohérence
comparateur/type (`greaterThan` etc. refusés sur un `"flag"`, seul `"equals"` y est
permis) ET valeur/type du comparateur lui-même. **Limite connue, documentée plutôt
que silencieuse** : la portée `"party"` n'est JAMAIS vérifiable au chargement d'une
scène (ses déclarations n'existent qu'à `createInitialState`, hors de portée d'un
`parseScene` qui ne connaît qu'UNE scène) — une variable de partie mal orthographiée
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
   `core/script-parse.js`/`validateCondition`, sur le modèle du bloc `hasEquipmentTag`.
   Sinon, rien à valider en plus (dégradation silencieuse acceptée).
4. Ajoute une sous-section ICI (forme + exemple réel) — SEUL endroit, jamais dupliqué :
   `doc/scene-format.md` ne fait que RENVOYER à cette section pour la grammaire des
   conditions, rien à synchroniser côté contrat JSON.

## Effets

Un effet porté par une règle : `{ type: "<clé>", ...champs }`. Contrairement aux
conditions, PAS un registre uniforme — aiguillage EXPLICITE (`core/script-parse.js`/
`parseEffect` pour la validation, `core/presence.js`/`resolveEntityRules` pour
l'application) car chaque effet a une validation ET une application propres à son
type, qu'un registre de noms ne suffirait pas à couvrir.

**⚠️ À jour avec `core/script-parse.js`/`parseEffect` ET `core/presence.js`/
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
`behavior` d'une entité, validé par `core/parse-common.js`/`parseBehavior`, qui délègue à
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

#### Allure : `speed` (commun) et paramètres de `wander`

`speed` (nombre `> 0`, optionnel) est accepté par les TROIS kinds (`wander`,
`follow`, `goto`) : facteur de vitesse, 1 = allure du joueur (2,4 cases par
seconde). Il PRIME sur le `speed` de l'entité (champ d'entité, défaut 1). Une règle
qui change de comportement change donc aussi d'allure — « calme le jour, frénétique
la nuit » s'écrit avec deux objets `behavior` qui portent chacun leur `speed`. Jamais
lu par le comportement lui-même : appliqué à la résolution physique
(`core/reduce.js`/`resolveIntents`).

`wander` (`core/behaviors/wander.js`, défauts dans `DEFAULTS`) — machine à deux
phases, durées en TICKS (60 ticks = 1 seconde) :

- `walkMin` / `walkMax` : durée d'une marche, tirée dans la fourchette.
- `pauseMin` / `pauseMax` : durée d'une pause.
- `continueBias` (0 à 1, défaut 0,65) : probabilité de repartir dans la MÊME
  direction après une pause. 0 = demi-tour à chaque pause (garde qui fait les cent
  pas), proche de 1 = ne revient presque jamais sur ses pas (seuls les bords et les
  obstacles la retournent).

Exemple réel — le miravi de l'espace miroir (`scenes/clock-tower-weight-shaft-mirror-space.json`),
un ARPENTEUR : des marches plus longues que la traversée de la salle, courtes pauses,
il parcourt la salle d'un bout à l'autre et fait demi-tour au bord :

```json
"behavior": { "kind": "wander", "walkMin": 1300, "walkMax": 1600, "pauseMin": 30, "pauseMax": 90, "speed": 2 }
```

### Ajouter un type d'effet

1. Un cas dans `core/script-parse.js`/`parseEffect` : valide la FORME propre à ce type,
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
<boolean> }` (sans `effects`) — normalisé par `core/script-parse.js`/`parsePresenceRule`
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
complémentaires** (`scenes/demo.json`/`npc-resident` et
`scenes/demo2.json`/`npc-resident-home` — voir `doc/entity-model.md`/"Présence
conditionnelle et triggers de comportement" pour la sémantique complète, et
`core/checks/routines.check.js`, section "Routine complète", pour la vérification tick
par tick d'un cycle équivalent) :

`npc-resident` (`scenes/demo.json`) — présent le jour (8h-20h, erre), part vers
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

`npc-resident-home` (`scenes/demo2.json`) — CYCLE INVERSÉ ET COMPLÉMENTAIRE :
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

## Triggers — effets déclenchés par une TRANSITION d'horloge

`entity.triggers` (optionnel, cascade instance -> type comme `action`) : un
TABLEAU non vide de `{ on: "hour", hour?: 0..23, effects: [<effet d'action>,
...] }`. Point d'accroche GÉNÉRAL (`core/triggers.js`) : le clocher n'est que
son premier client. Un seul mécanisme, paramétré :

- `hour` ABSENT -> les effets s'exécutent à CHAQUE nouvelle heure (le
  clocher) ;
- `hour` PRÉCISÉ -> SEULEMENT quand l'horloge arrive à cette heure (futurs :
  coq à l'aube, commerce à 8h, lampadaires à 20h...).

`effects` : le MÊME vocabulaire que les effets d'action (voir "Effets
d'action" plus bas — état `setVariable`/`giveImprovement`..., rendu
`playSound`/`announce`), MÊME validation (`core/script-parse.js`/`parseTrigger` ->
`parseActionEffect`), MÊME routage (`core/effects.js`) : le core applique
les effets d'ÉTAT (`core/state.js`/`applyEntityActionEffects`, sur la face
qui porte l'entité), la vue rejoue les effets de RENDU dus
(`view/interaction.js`/`runRenderEffects`, câblé par `view/game-clock.js`/
`advance`). Un `playSound` sans `at` émane de l'entité porteuse, donc
DIÉGÉTIQUE (voir `"playSound"` plus bas) : entendu ÉTOUFFÉ depuis l'autre
face par la chaîne d'occlusion existante, rien de spécial à déclarer. Les
effets MIXTES (`teleport`, déplacement du JOUEUR) sont REFUSÉS au
chargement : ils n'ont pas de sens sur un trigger.

**Déclenchement sur TRANSITION, jamais une condition continue** : à chaque
avancement de l'horloge, le core compare l'index d'heure ABSOLU d'avant et
d'après (`hourChanged`) — même patron que le jour/nuit ou la météo. Un tick
"dans l'heure" ne fait rien ; on ne rejoue jamais un trigger tant que
l'heure ne change pas.

**Sauts de temps (menu debug, retour après absence) : résolution
PARESSEUSE.** On reflète l'heure d'ARRIVÉE, jamais les heures franchies
entre-temps — pas de rafale de cloches, pas de passé simulé : "à chaque
heure" tire UNE fois à l'arrivée ; "à Xh" tire SEULEMENT si Xh est l'heure
d'arrivée (Xh simplement FRANCHIE pendant le saut ne tire pas). Un saut de
24 h exactes compte comme un changement d'heure (index absolu, pas heure du
jour). La PAUSE gèle l'horloge (aucun delta injecté, voir `doc/time.md`),
donc ne déclenche rien — aucun code dédié.

**Portée** : le MONDE ACTIF, ses DEUX faces (recto ET verso, même si le
joueur n'en occupe qu'une). Les autres mondes sont gelés, comme le reste de
leur simulation. Une entité DORMANTE (`present: false`, voir "Règles") ne
tire pas ; une entité dont la présence n'a pas encore été résolue par un
tick compte comme présente.

**Exemple réel — le clocher** (`scenes/town-square.json`, `clocktower_1`, au
RECTO seulement — pas sur son miroir du verso, pour ne pas doubler la
cloche : c'est justement l'écho étouffé qui traverse depuis le recto qu'on
entend de l'autre face) :

```json
"triggers": [{ "on": "hour", "effects": [{ "type": "playSound", "path": "assets/sounds/effects/clock_tower_bell" }] }]
```

Un trigger CIBLÉ, forme complète (pas encore de contenu réel) :

```json
"triggers": [
  { "on": "hour", "hour": 20, "effects": [{ "type": "setVariable", "scope": "entity", "name": "lit", "value": true }] },
  { "on": "hour", "hour": 6, "effects": [{ "type": "setVariable", "scope": "entity", "name": "lit", "value": false }] }
]
```

Un trigger n'accepte QUE `on`, `hour` et `effects` : toute autre clé échoue
au chargement — un réglage de son (`gain`, `pitchVariation`...) se déclare
sur l'EFFET `playSound`, jamais sur le trigger, et une faute de niveau ne
doit pas passer en silence.

Un kind de trigger de plus demain (météo, phase...) = une entrée dans
`TRIGGER_KINDS` (`core/triggers.js`) + sa détection dans
`dueTriggerEffects`, jamais un second mécanisme. Vérification terminal :
`core/checks/triggers.check.js`.

## Actions

`entity.action` (optionnel, cascade instance → type) : `{ kind: <string>,
...paramètres }`. Le CORE (`core/scene.js`) valide seulement la FORME (objet,
`kind` non vide) — jamais `kind` contre une liste connue : cet aiguillage vit
ENTIÈREMENT côté vue (`view/interaction.js`/`ACTION_HANDLERS`, même principe que
`CONDITION_EVALUATORS` mais côté vue). `kind` déclaré mais absent de ce registre →
`console.warn`, jamais audible ni fatal pour le joueur.

**⚠️ À jour avec `view/interaction.js`/`ACTION_HANDLERS`** — kinds existants :

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

**Son de ramassage** : rôle `sounds.pickup` de l'ARCHÉTYPE de l'objet
(cascade instance -> archétype, voir `doc/entity-model.md`/"Son de
ramassage"), SANS défaut — non déclaré, l'objet se ramasse en silence (juste
l'annonce). Aucun son générique imposé par le système ; vaut aussi pour
`"loot"`.

### `"loot"` — collectible PERSISTANT, TROIS formes

Crédit direct (l'entité N'EST JAMAIS retirée, contrairement à `"pickup"` — elle
passe seulement à `consumed: true`) :

```js
// entities/types/crate.js
action: { kind: "loot", amount: 100 },
```

Éparpillement d'entités éphémères autour de la source, au lieu d'un crédit direct :

```json
// scenes/demo2.json, crate-stash
"action": {
  "kind": "loot",
  "spawn": { "spec": { "type": "money", "amount": 20 }, "count": 3, "spread": 1.5 }
}
```

`spec` (minimal, résolu en descripteur COMPLET par le parseur d'entité —
`core/spawn.js`/`ephemeralArchetypeSpec`) est le vocabulaire de la "spec
éphémère" : `{ type: <clé du registre d'entités>, amount?, count? }` (`amount`
et `count` remplacent ce champ dans l'action de l'archétype). Détail complet
(limite anti-prolifération, éviction du plus ancien, exclusion de sauvegarde) :
`doc/entity-model.md`/"Entités éphémères", `core/state.js`/`spawnEphemeral`.

**Objet unique** (troisième forme) : ni `amount` ni `spawn`, la substance de
l'objet est dans les `effects` de l'action (exécutés avant, comme pour tout
kind). Le ramasser joue son son `pickup` (s'il en déclare un), le marque
`consumed` (`core/money.js`/`lootUniqueEntity`), sans crédit ni annonce
propre : c'est au contenu de dire ce qu'on a pris. Associé à une présence
« non consommé », l'objet disparaît pour de bon une fois pris.

```js
// entities/types/old_survey_map.js — le vieux cadastre
action: {
  kind: "loot",
  effects: [
    { type: "giveImprovement", id: "old_plans" },
    { type: "announce", key: "entity.old_survey_map.taken" },
  ],
},
presence: [{ when: { type: "not", condition: { type: "consumed" } }, present: true }],
```

Pour les trois formes, un collectible déjà `consumed` ne fait plus RIEN à
l'activation : ni effets, ni son (`view/interaction.js`, verrou avant
l'exécution des effets).

### `"search"` — FOUILLE d'un conteneur de collecte régénérant

```js
// entities/types/bush.js
container: { distribution: { table: "default" } },
action: { kind: "search" },
```

Aucun paramètre sur l'action elle-même : ce qui tombe vient de
`entity.container` (`{ distribution, count?, regenerates? }`, voir
`doc/scene-format.md`/"Entité" et `doc/entity-model.md`/"Collecte" pour le
modèle complet — conteneur garni à chaque cycle quotidien de `count`
TIRAGES dans une distribution pondérée : `{ table: "<nom>" }` référençant
`config/spawn-values.js`/`SPAWN_TABLES`, `{ items: { <objet>: <poids> } }`
inline, ou plusieurs tables `{ tables: [{ table | items, weight? }] }` ;
la clé réservée `nothing` y est une issue « rien » pondérée ;
`regenerates: false` = garni une seule fois).

```js
// entities/types/broken_computer.js — démonté une fois, puis plus rien
container: {
  distribution: {
    tables: [
      { table: "electronics", weight: 3 },
      { items: { nothing: 1 }, weight: 1 },
    ],
  },
  count: 3,
  regenerates: false,
},
action: { kind: "search" },
```
 Effet d'état : `core/spawn.js`/`searchContainer` — le stock TOMBE
AU SOL, une entité ÉPHÉMÈRE par objet, éparpillée autour du conteneur
(`spawnScatteredEphemerals`, MÊME geste que le `"loot"` à spawn ci-dessus),
à ramasser ensuite via `"pickup"` ou à laisser ; le conteneur est noté vidé
(`stock: null`) pour le cycle courant. Retour : une annonce seule (les
balises des objets tombés font le reste) — `interaction.searchSpawn`,
`interaction.searchSpawnOne` (un objet) ou `interaction.searchNothing`
(tous les tirages tombés sur `nothing`) ; aucun son de fouille imposé.

**Candidature liée à l'état** (`core/spawn.js`/`containerStatus`) : un
conteneur VIDÉ n'est candidat à Entrée que s'il n'y a RIEN d'autre à
activer à portée (`view/occupancy.js`/`getInteractionCandidates`) —
jamais de menu de désambiguïsation avec les objets tombés autour. Seul, il
annonce son état : `interaction.searchAlreadyToday` (régénérant, fouillable
de nouveau dès qu'un cycle est passé) ou `interaction.searchDepleted` (non
régénérant). Il reste occupé, observable (Espace) et audible. Contrairement
à `"loot"`, l'entité n'est jamais `consumed`.

### `"shop"` — POINT DE VENTE, ouvre le menu du comptoir

```js
// entities/types/shop_counter.js
action: { kind: "shop" },
```

Aucun paramètre sur l'action : activer l'entité ouvre le MENU D'ACTIONS du
point de vente (`view/menus/shop-menu.js`/`openShopMenu` — "Vendre",
"Acheter"), puis un menu à sliders inline. Tout est VUE (pile d'écrans, jeu
en pause) ; seules les TRANSACTIONS sont des effets d'état du core
(`core/trade.js`/`sellItems` : retrait du sac + crédit de `session.money` ;
`buyItems` : débit + ajout au sac + décrément du stock — atomiques). Vente :
prix = `value` de l'objet (`core/items.js`/`ITEM_REGISTRY`), sans `value` ->
non vendable. Achat : catalogue déclaré par l'entité (`shop: { catalog }`,
voir `doc/scene-format.md`/"Entité" — `{ table: "<nom de SHOP_CATALOGS>" }`
ou `{ items: { <objet>: { stock, price? } } }`, `config/shop-values.js`),
stock FINI rechargé au cycle de collecte. Détail (ergonomie, annonces,
confirmations, double plafond) : `doc/entity-model.md`/"Vente et achat".

### `"switchSide"` — bascule recto/verso (scène à deux faces)

```json
// entities/types/passage.js (défaut) + instance de scène (scenes/demo3.json)
{ "id": "alley-gap-recto", "type": "passage", "x": 8, "action": { "kind": "switchSide", "arrivalX": 8 } }
```

`arrivalX` (nombre, requis) : point d'arrivée sur l'AUTRE face du MÊME monde —
comme `target`/`x` pour l'effet `"teleport"` (voir "Effets d'action" plus bas),
mais on ne change jamais de monde (`activeWorldId` inchangé). Délègue à
`core/state.js`/`switchSide` (bascule `player.side` + repositionne joueur/
compagnons — RÉUTILISE `placePlayer`, la MÊME primitive qu'un teleport
`reloadIfSame:false`) PUIS reconstruit la scène audio sur la nouvelle face
(`view/world-travel.js`/`sideSwitch`, même soin que `performTransition` :
aucun Howl résiduel), et joue le marqueur sonore de bascule DÉCLARÉ par le
passage (`transitionSound`, cascade instance -> archétype -> défaut ABSENT
— voir `doc/entity-model.md`/"Recto/verso", `config/tuning-values.js`) :
silence côté son de passage si rien n'est déclaré, jamais un son générique
imposé. `arrivalX` n'est PAS validé en bornes au chargement (comme tout `action.*`,
transport générique) — clampé à l'exécution par `switchSide`, jamais un
plantage. Détail complet du modèle à deux faces (persistance, gel de l'autre
face) : `doc/scene-format.md`/"Scène à deux faces (recto/verso)".

### `"applyEffects"` — kind sans substance propre, PORTE SEULEMENT des effets

```json
{
  "kind": "applyEffects",
  "effects": [
    { "type": "playSound", "path": "assets/sounds/effects/window_blinds_open" },
    { "type": "setVariable", "scope": "entity", "name": "isOpen", "value": true },
    { "type": "announce", "key": "entity.window.opened" }
  ]
}
```

Le SEUL kind GÉNÉRIQUE de cet aiguillage : aucun état "métier" propre
(contrairement à `pickup`/`loot`/`switchSide`, chacun lié à un système du jeu).
`effects` (voir "Effets d'action" plus bas pour le vocabulaire complet — état
ET rendu ET mixte, librement mélangés) est en réalité exécutée GÉNÉRIQUEMENT
par `view/interaction.js`/`interact` pour TOUT kind dont la condition réussit
(ou qui n'a pas de condition) — `"applyEffects"` n'a donc RIEN de plus à faire
lui-même (`view/interaction.js`/`handleApplyEffects` est un NO-OP délibéré) :
ce kind existe seulement pour donner un `kind` valide à une entité dont
l'action se résume à ses effets, sans ramassage ni aucun autre comportement
propre.

**La PORTE n'est PLUS un cas spécial** (ancien kind `"transit"`, ancien champ
`entity.target` — tous deux disparus) : une porte est une entité `door`
ORDINAIRE dont l'action est `"applyEffects"` avec un effet `"teleport"` dans
`effects` (voir "Effets d'action" plus bas, exemple réel `scenes/demo.json`/
`door_exit`). `entities/types/door.js` ne porte plus AUCUNE cascade `action`
(la cible varie par INSTANCE, jamais un défaut d'archétype) : chaque porte
déclare la sienne en entier.

Exemple réel complet (fenêtre) : `entities/types/glass-window.js` (voir
"Actions multiples filtrées par condition" plus bas pour le cas complet,
deux candidates `applyEffects` aux conditions opposées).

### Ajouter un kind d'action

1. Un cas dans `ACTION_HANDLERS` (`view/interaction.js`) — CÔTÉ VUE uniquement, le
   core n'a rien à valider de plus que la forme générique déjà en place.
2. Ajoute une sous-section ICI (forme + exemple réel).
3. Si le nouveau kind doit pouvoir être bloqué par condition, rien à faire de
   spécial : "Conditions d'action" ci-dessous s'applique à TOUT kind sans
   modification.

## Effets d'action

Un effet déclenché à l'ACTIVATION d'une action (`action.effects` — condition
RÉUSSIT — ou `action.refusalEffects` — condition ÉCHOUE, voir "Conditions
d'action" plus bas) : `{ type: "<clé>", ...champs }`. AIGUILLAGE DISTINCT de
"Effets" plus haut (`"presence"`/`"behavior"`, appliqués au TICK par
`core/presence.js`/`resolveEntityRules`) : ceux-ci n'ont de sens qu'au moment
d'une interaction PONCTUELLE, jamais réévalués en continu, jamais mélangés
dans le même registre (`core/script-parse.js`/`parseActionEffect`, PAS `parseEffect`).

**⚠️ À jour avec `core/effects.js`** (SEULE source de vérité sur la NATURE de
chaque type) **ET `core/script-parse.js`/`parseActionEffect`** — types existants :

**Routage CORE/VUE, le principe central** (`core/effects.js`) : une liste
`effects`/`refusalEffects` MÉLANGE librement des effets d'ÉTAT
(`setVariable`/`toggleVariable`/`addVariable`) et des effets de RENDU
(`playSound`/`announce`) — l'humain la lit comme UN SEUL script, le système la
ROUTE par nature, frontière STRICTE :

- le CORE (`core/variables.js`/`applyActionEffects`) applique SEULEMENT les
  effets d'ÉTAT — un type qu'il ne reconnaît pas (donc tout effet de rendu)
  TRAVERSE SANS EFFET, jamais une erreur ; le core ne joue JAMAIS de son
  ni n'annonce JAMAIS rien lui-même.
- la VUE (`view/interaction.js`/`runEffects`) exécute SEULEMENT les effets de
  RENDU — appelle `applyActionEffects` (via le gestionnaire enregistré,
  `setVariableEffectsHandler`) EN UN SEUL LOT pour l'état, PUIS rejoue
  `playSound`/`announce` DANS L'ORDRE DÉCLARÉ (l'ordre relatif à un effet
  d'état — invisible/inaudible au moment où il s'applique — n'a aucune
  importance observable ; seul l'ordre ENTRE effets de rendu compte, ex. le
  son AVANT la confirmation parlée).

### `"setVariable"` / `"toggleVariable"` / `"addVariable"` — état, CORE

```js
{ type: "setVariable", scope: "entity", name: "isOpen", value: true }
{ type: "toggleVariable", scope: "entity", name: "isOpen" }
{ type: "addVariable", scope: "party", name: "friendship_test", amount: -2 }
```

- `"setVariable"` `{ scope, name, value }` : assigne (flag ou entier, cohérent avec
  le type déclaré).
- `"toggleVariable"` `{ scope, name }` : inverse un FLAG (erreur au chargement sur
  un int, quand le type est vérifiable).
- `"addVariable"` `{ scope, name, amount }` : ajoute `amount` (ENTIER, négatif
  accepté) à un INT (erreur au chargement sur un flag).

**Validation** : MÊME `validateVariableReference` que la condition `"variable"`
(scope/name/existence, même limite documentée sur `"party"`) + cohérence
opération/type quand il est connu. **Application** : voir "Variables"/"Accès"
plus bas pour `applyActionEffects` en détail (enchaînement séquentiel,
lecture-avant-écriture pour toggle/add, splice dans la session).

### `"giveImprovement"` / `"removeImprovement"` — état, CORE

```js
{ type: "giveImprovement", id: "supernatural_perception" }
{ type: "removeImprovement", id: "supernatural_perception" }
```

`{ id }` — ajoute/retire l'amélioration `id` de `session.improvements` (voir
"Améliorations (improvements)" plus bas pour le registre/le stockage
complets). `id` validé contre `core/improvements.js`/`IMPROVEMENT_REGISTRY`
au chargement, même sévérité que `setVariable`/`hasEquipmentTag`. TOUJOURS
portée PARTIE (pas de champ `scope` : une improvement n'a qu'UN porteur
possible, le joueur) — appliqués par `applyActionEffects`
(`core/variables.js`) dans le MÊME passage que les effets de variable, MÊME
clé de contexte `context.session` que la portée `"party"`. Idempotents
(donner une improvement déjà possédée, ou en retirer une déjà absente,
laisse `session.improvements` à une RÉFÉRENCE INCHANGÉE).

### `"playSound"` — son ponctuel, VUE, DEUX natures de rendu

```js
// Cas courant : aucune déclaration de provenance/nature — DÉFAUTS
// intelligents dérivés du contexte (voir plus bas).
{ type: "playSound", path: "assets/sounds/effects/window_blinds_open", gain: 0.8, pitchVariation: 0.1 }

// Surcharges explicites, cas exotiques :
{ type: "playSound", path: "...", at: "far-away-bell" }        // provenance : une AUTRE entité
{ type: "playSound", path: "...", nature: "meta" }              // nature forcée, ignore les filtres
```

`path` (requis) : chemin/pool résolu via `lib/assets.js`/`resolveAsset`, comme
tout chemin de son du projet. `gain`/`pitchVariation`/`reverbSend` (optionnels,
nombres) : le **DESCRIPTEUR DE SON PARTAGÉ** — les sous-champs COMMUNS aux
rôles de son POSITIONNÉS (`sounds.beacon`/`sounds.vocal`, voir
`doc/entity-model.md`/"Paramètres sonores").

Pour un rendu **diégétique**, ce triplet n'est PAS lu tel quel sur l'effet :
il passe par la MÊME résolution en cascade que `enterSound`/`exitSound`
(`view/audio/entity-sound-entry.js`/`resolveTransitionSound`, cascade
`resolveTuning` : effet -> `tuning` d'instance -> archétype -> défaut
global, voir "Résolution en cascade" de `doc/entity-model.md`) —
`PLAY_SOUND_TUNING_KEYS` pour `gain` (clé littérale `"gain"`, un playSound
n'a pas de rôle fixe comme `beaconGain`/`vocalGain`), `pitchVariation`/
`reverbSend` PARTAGENT la MÊME clé que tout autre rôle positionné. Un champ
NON déclaré retombe donc sur le défaut de l'entité/de l'archétype/global
(`reverbSend` -> 0.5 par défaut, `config/tuning-values.js`) — **jamais sur
`undefined` silencieux** : c'est ce qui garantit qu'un playSound diégétique
sans `reverbSend` déclaré profite quand même de la réverb de la scène, EXACTEMENT
comme un beacon qui n'en déclare pas non plus. Un champ déclaré explicitement
reste prioritaire (`resolveTuning` teste d'abord le descripteur lui-même) :
la cascade ne fait qu'ajouter un FILET, jamais une contrainte.
Pour un rendu **méta**, ce triplet reste lu TEL QUEL sur l'effet
(`view/interaction.js`/`playMetaSound` -> `lib/audio.js`/
`playDescribedOneShot`) — aucune cascade, aucun bus de réverb accessible
(voir NATURE ci-dessous) : `reverbSend` y reste sans effet en pratique,
`gain`/`pitchVariation` n'ont pas de défaut au-delà de 1/0.

MÊME primitive de calcul rate/volume (`lib/audio.js`/`playDescribedOneShot`,
`randomRate`) et, pour un rendu diégétique, MÊME chaîne positionnée que
beacon/vocal (`view/audio/oneshots.js`/`playPositionedOneShot` via
`playTransitionSound`) — un seul point de calcul partout, jamais dupliqué.

**PROVENANCE — `at` (optionnel, id d'entité)** : d'où émane le son dans
l'espace (`view/interaction.js`/`resolvePlaySoundTarget`) :

- `at` fourni → le son émane de LA POSITION de CETTE entité (utile pour un
  son émis AILLEURS que par l'entité qui porte l'action).
- `at` absent, DANS le contexte d'une action d'entité (le cas COURANT : une
  entité `interactable` déclenche l'effet) → l'entité PORTEUSE elle-même —
  aucune déclaration nécessaire, elle produit son propre son (ex. la fenêtre
  grince à SA position).
- `at` absent, HORS contexte d'entité (futur effet global/trigger de partie,
  sans entité porteuse) → aucune cible résolue, CENTRÉ JOUEUR (voir NATURE
  ci-dessous).

**NATURE — `nature` (optionnel, `"diegetic"` | `"meta"`)** : filtré ou non
(`view/interaction.js`/`resolvePlaySoundNature`) — DÉFAUT DÉRIVÉ DE LA
PROVENANCE, jamais déclaré dans le cas courant :

- une cible résolue (positionné) → **`"diegetic"`** par défaut : rendu
  IDENTIQUE à un beacon/vocal à cet instant — `view/audio/oneshots.js`/
  `playEntityOneShot(entityId, descriptor)` (câblé par `view/action-handlers.js`/
  `setPositionedSoundPlayer`) retrouve l'entrée déjà construite pour cette
  entité (`entitySounds`, ou `otherEntitySounds` pour l'AUTRE face) + sa
  position LIVE, puis délègue à `playTransitionSound`/`playPositionedOneShot`
  — MÊMES filtres actifs que n'importe quelle balise : distance/pan
  (`interactRange`/`audibleRange`/`panSaturation`), occlusion RECTO/VERSO
  (`forcedMuffle` selon la face qui porte l'entité) et étouffement de
  perception (`effectiveMuffleAmount`, qui exempte déjà les entités
  surnaturelles) — AUCUN filtre réinventé. `gain`/`pitchVariation`/
  `reverbSend` résolus par la MÊME cascade que `enterSound`/`exitSound` (voir
  plus haut) — un `reverbSend` non déclaré rejoint donc le bus de réverb de la
  scène au défaut global, comme un beacon au même endroit. Volume composé avec
  `beaconVolume` (préférence "Volume des balises", même catégorie qu'un
  enterSound/exitSound), pas `interfaceVolume`.
- aucune cible résolue (centré joueur) → **`"meta"`** par défaut : rendu
  IDENTIQUE au comportement d'avant cette cascade (chemin `playDescribedOneShot`
  non positionné, `interfaceVolume`) — IGNORE tout filtre actif, "parle"
  directement au joueur, comme un son d'UI/confirmation.
- `nature` explicite force l'un ou l'autre rendu indépendamment de la
  provenance (rare, ex. un son positionné qu'on veut quand même méta) — un
  `"diegetic"` sans cible résolvable (surcharge sans `at` ni contexte
  d'entité) ou sans provider câblé (hors ville) se replie défensivement sur
  `"meta"`, jamais un son perdu en silence.

Défensif comme tout son du projet : fichier absent, ou id `at` introuvable/
dormant (`view/audio/oneshots.js`/`playEntityOneShot`) → `console.warn`,
jamais un plantage, le reste de la liste d'effets (état, annonce) continue
normalement.

**Exemple réel — la fenêtre** (`entities/types/glass-window.js`) : ne déclare NI
`at` NI `nature` → son diégétique, positionné À LA FENÊTRE elle-même, étouffé
si le joueur est de l'autre face ou en perception active — exactement le
rendu d'un beacon au même endroit.

**SUIVI ou ANCRÉ — `tracked` (optionnel, booléen, défaut `true`)** : un son
positionné qui DURE est-il re-spatialisé pendant qu'il joue ? Ne concerne
que le rendu DIÉGÉTIQUE : un son méta n'a pas de position, rien à suivre ni
à ancrer, le flag y est sans effet.

- `tracked: true` (défaut) — **SUIVI** : la source est enregistrée comme
  active pendant toute sa lecture et réévaluée à CHAQUE tick selon la
  position COURANTE du joueur, avec le rendu spatial COMPLET d'une balise
  (pan, volume et passe-bas de distance, occlusion recto/verso et
  perception — `view/audio/oneshots.js`/`updateTrackedOneShots`, MÊME
  formule que les balises continues, `spatialRendering`). Retirée à la fin
  du son, jamais une source fantôme. C'est le cas courant : une source
  VIVANTE à une position, autour de laquelle le joueur se déplace — la
  cloche du clocher (`scenes/town-square.json`) passe de gauche à droite
  quand on la dépasse pendant qu'elle résonne, le volet de la fenêtre
  s'atténue quand on s'en éloigne, un son entendu pendant une bascule de
  face suit le MÊME fondu que les balises (`crossfadeFaceSwap`), survit à la
  reconstruction de scène du sas et reprend son suivi au tick sans second
  saut. Un son suivi appartient à son MONDE : quitter ce monde (porte,
  téléportation) l'arrête par un fondu bref (`sceneExitSoundFadeMs`,
  `config/tuning-values.js`), même si le monde d'arrivée a une entité au même
  id. Avant ce flag, tout playSound positionné était
  calculé une fois au démarrage puis figé : la cloche restait à gauche après
  qu'on avait dépassé le clocher.
- `tracked: false` — **ANCRÉ** : spatialisé UNE fois au départ, puis figé à
  son point d'émission tel qu'entendu à cet instant. Pour un ÉVÉNEMENT
  PONCTUEL qui "s'est produit là" et n'a pas à suivre la tête du joueur : un
  impact, une chute, une détonation lointaine. Convient aussi aux sons très
  courts, où le suivi n'apporterait rien (économie d'un suivi au tick).
  Ce n'est PAS un oubli ni un mode dégradé : c'est un choix de contenu, le
  son représente un instant, pas une source.

```js
// Suivi (défaut, rien à déclarer) : la cloche VIT sur le clocher.
{ type: "playSound", path: "assets/sounds/effects/clock_tower_bell" }

// Ancré : l'éboulement s'est produit là-bas, à cet instant — figé.
{ type: "playSound", path: "assets/sounds/effects/big_rock_collision", tracked: false }
```

Déclaré sur l'EFFET, jamais sur le fichier : le même son peut être suivi
dans un contexte et ancré dans un autre, le suivi dépend de l'usage.

**SON DE DÉPART — un `playSound` dans la même liste qu'un `"teleport"`.** Une
porte joue son grincement par un effet `playSound` placé AVANT son `teleport`
(la grammaire d'effets, jamais le sas : une porte fait un fondu, pas une
chorégraphie). Ce son appartient à l'acte de partir : il reste diégétique et
positionné sur la porte, mais il est joué ANCRÉ et HORS de la couche des
entités que le sas éteint (`view/interaction.js`/`runEffects`,
`view/audio/oneshots.js`/`playEntityOneShot`). Il finit donc de résonner
pendant le fondu au lieu d'être coupé, comme les pas de transition d'une
bascule de face. Sa réverb appartient au monde quitté et s'éteint avec lui.
Rien à déclarer : c'est la présence du `teleport` dans la liste qui le
décide. `"nature": "meta"` reste réservé aux sons qui ne viennent d'aucun
objet du monde (ex. le passage d'un miroir).

```json
"action": {
  "kind": "applyEffects",
  "effects": [
    { "type": "playSound", "path": "assets/sounds/doors/metal_door_1_open" },
    { "type": "teleport", "target": "clock_tower_main", "x": 12 }
  ]
}
```

Le MÊME flag, avec le même défaut, existe sur les rôles de son INTERMITTENTS
d'une entité — `sounds.vocal` et `sounds.beacon` en mode `"intermittent"`
(voir `doc/entity-model.md`/"Paramètres sonores") : un cri lancé par une entité
rapide la suit au lieu de rester derrière elle. La balise CONTINUE est suivie
par nature (boucle réévaluée à chaque tick) ; les pas (`sounds.movement`) restent
ANCRÉS, chacun émis là où l'entité pose le pied.

### `"announce"` — message parlé, VUE

```js
{ type: "announce", key: "entity.window.opened", assertive: true }
```

`key` (requis) : clé i18n. `assertive` (optionnel, **défaut `true`**) : canal
`lib/announce.js` — `true` (défaut) interrompt pour être entendu immédiatement
(même politique que toute confirmation d'action du projet jusqu'ici), `false`
route vers le canal `polite` (attend son tour). Remplace le rôle des anciens
champs spéciaux `announceKey`/`refusalKey`, disparus de la grammaire : un
`"announce"` est maintenant un effet comme un autre, composable dans n'importe
quelle liste.

### `"teleport"` — déplace le JOUEUR, effet MIXTE (core/vue)

```json
{ "type": "teleport", "target": "demo2" }
```

```json
{ "type": "teleport", "target": "demo", "x": 9, "reloadIfSame": false, "transition": "instant" }
```

Déplace le JOUEUR (jamais une entité — voir "Pas de teleport d'entité"
ci-dessous) vers `target` (id de scène, PEUT être la scène courante).
Remplace l'ancien cas spécial "porte" (kind `"transit"`, champ `entity.target`)
: une porte est maintenant une action `"applyEffects"` ORDINAIRE dont
`effects` contient CET effet (voir `scenes/demo.json`/`door_exit`).

- **`target`** (requis) : id de scène (`scenes/index.js`).
- **`x`** (optionnel) : position d'arrivée. ABSENT → `playerStart` de la
  cible (comportement HISTORIQUE d'une porte, inchangé) si un rechargement a
  lieu, ou la position ACTUELLE du joueur sinon (voir `reloadIfSame`
  ci-dessous) — jamais une valeur arbitraire.
- **`side`** (optionnel, `"recto"`/`"verso"`) : face d'arrivée si `target` est
  une scène à deux faces. ABSENT → `"recto"` si un rechargement a lieu
  (comportement HISTORIQUE), ou la face ACTUELLE du joueur sinon.
- **`reloadIfSame`** (optionnel, **défaut `false`**) — décide SEULEMENT si
  `target` EST la scène active : DIFFÉRENTE de la scène active → toujours un
  rechargement, cette valeur n'a alors aucun effet (comportement HISTORIQUE
  d'une porte : aucune porte existante ne boucle sur sa propre scène).
  MÊME scène → `true` la RECHARGE (état frais, ephémères purgés, joueur
  recentré — un "reset" volontaire, voir "Sélection sur la carte de la
  ville" plus bas) ; `false` déplace SEULEMENT le joueur (+ compagnons),
  SANS toucher au reste du monde (NPC où ils étaient, éphémères intacts).
- **`transition`** (optionnel, `"fade"` | `"instant"`, **défaut `"fade"`**) :
  `"fade"` passe par le SAS + fondu
  historique d'une traversée de porte (voir `view/world-travel.js`/
  `runTeleportSas`) ; `"instant"` saute le sas — déplacement IMMÉDIAT,
  pour un teleport D'AUTORITÉ (le joueur ne choisit pas le moment : un
  vigile qui éjecte, une boutique qui ferme à l'heure).

`reloadIfSame` et `transition` sont ORTHOGONAUX — les QUATRE combinaisons sont
valides (ex. `transition:"instant"` + `reloadIfSame:true` : rechargement sans
sas ; `transition:"fade"` + `reloadIfSame:false` : sas pour un simple
repositionnement dans le monde courant).

**RÉUTILISE le mécanisme de transition de porte HISTORIQUE, GÉNÉRALISÉ**
(`view/world-travel.js`/`executeTeleport`), pas un second chemin :
`performTransition` (rechargement, `core/state.js`/
`travelToWorld`) et `placePlayer` (repositionnement sans rechargement) restent
les DEUX seules primitives d'état, partagées avec le menu-carte
(`travelViaCityMap`) et la bascule recto/verso (`switchSide`). Compagnons
TOUJOURS repositionnés avec le joueur (`repositionCompanions`, dans les deux
primitives) ; auto-save sur transition (`autoSaveOnTransition`) déclenchée
SEULEMENT par un rechargement (`performTransition`), jamais par un simple
repositionnement.

**Actions multiples + teleport conditionnel** : une porte à DESTINATION
CONDITIONNELLE (ex. VIP vers un salon, sinon vers le hall) tombe
GRATUITEMENT des "actions multiples filtrées par condition" ci-dessous —
plusieurs candidates, chacune son propre effet `"teleport"` vers une cible
différente, sélection par condition comme n'importe quelle autre action.
Aucun mécanisme dédié à écrire.

### Pas de teleport d'ENTITÉ

Volontairement ABSENT de ce vocabulaire : `"teleport"` est JOUEUR uniquement.
Déplacer une ENTITÉ entre deux scènes, ou l'y faire apparaître/disparaître,
se fait par la PRÉSENCE CONDITIONNELLE (voir "Règles" plus haut) — dormante
ICI, active LÀ, conditionnée par une variable/un horaire — jamais par un
déplacement d'état entre deux mondes. Conforme au modèle "une entité
APPARTIENT à une scène" (`doc/entity-model.md`) : une entité qui semble
"voyager" est en réalité UNE INSTANCE PAR SCÈNE, chacune conditionnée pour
n'être active que là où elle doit apparaître — jamais une seule instance qui
se déplacerait entre des mondes que le core ne tique jamais simultanément
(voir CLAUDE.md, "un seul monde actif avance").

### Ajouter un type d'effet d'action

1. Sa NATURE — `STATE_EFFECT_TYPES` (ÉTAT, appliqué par le core),
   `RENDER_EFFECT_TYPES` (RENDU, exécuté par la vue, zéro état) ou
   `MIXED_EFFECT_TYPES` (MIXTE : la vue orchestre, en s'appuyant sur des
   fonctions du core DÉJÀ EXISTANTES pour l'état — voir `"teleport"` plus
   haut) — TOUTES trois dans `core/effects.js`, JAMAIS deux à la fois.
2. Un cas dans `core/script-parse.js`/`parseActionEffect` : valide la FORME propre à
   ce type.
3. Effet d'ÉTAT → un cas dans `core/variables.js`/`applyActionEffects`. Effet
   de RENDU ou MIXTE → un cas dans `view/interaction.js`/`runEffects`, JAMAIS
   dans le core (un effet MIXTE y délègue son calcul d'état à une fonction du
   core EXISTANTE, jamais une nouvelle copie de cette logique).
4. Ajoute une sous-section ICI.

## Conditions d'action

Une action peut porter `condition: <objet condition>`, optionnellement accompagnée
de `refusalEffects: [<effet>, ...]` :

```json
// scenes/demo.json, door_club — MÊME kind "applyEffects" que door_exit, juste
// conditionné en plus
{
  "id": "door_club",
  "type": "door",
  "action": {
    "kind": "applyEffects",
    "condition": { "type": "hasEquipmentTag", "tag": "chic" },
    "refusalEffects": [{ "type": "announce", "key": "door.club.dresscode_refused" }],
    "effects": [{ "type": "teleport", "target": "demo2" }]
  }
}
```

`condition` est le MÊME objet déclaratif que `presence[].when` — même registre,
même validation (`core/script-parse.js`/`validateCondition`, factorisée entre les deux
usages). `refusalEffects` (MÊME vocabulaire que `effects`, voir "Effets
d'action" plus haut) est OPTIONNELLE : une RESPONSABILITÉ DE CONTENU, pas une
contrainte du validateur. **RECOMMANDÉE** dès qu'un échec laisserait le joueur
sans AUCUN retour — bloqué sans explication (ex. `door_club`, ci-dessus : sans
`refusalEffects`, tenter d'entrer sans tenue chic ne produirait RIEN, silence
déroutant). **SUPERFLUE/omise** quand aucun échec n'est réellement atteignable
— condition(s) qui couvrent tout l'espace possible, action non bloquante (voir
"Actions multiples filtrées par condition"/la fenêtre plus bas : un
`refusalEffects` y serait du code mort, jamais exécuté). Absente et la
condition échoue → l'action ne s'exécute simplement pas, SANS effet d'aucune
sorte (ni son ni annonce) — échec silencieux ASSUMÉ, à la charge du contenu de
juger si c'est acceptable. PRÉSENTE, elle reste validée comme n'importe quelle
liste d'effets (tableau NON VIDE, même règle qu'`effects` — un champ déclaré
mais vide échoue au chargement, comme un tableau `effects` vide). AUCUN son de
refus GÉNÉRIQUE imposé par le système (l'ancien `assets/sounds/ui/refused` en
dur a disparu) : une action qui ne veut QU'annoncer son refus déclare
`[{ type: "announce", ... }]`, sans `"playSound"` — c'est un choix de CONTENU,
jamais une valeur par défaut.

Évaluation et EXÉCUTION restent entièrement côté VUE
(`view/interaction.js`/`interact`, juste avant de déléguer à
`ACTION_HANDLERS`) : condition vraie (ou absente) → `effects` exécutée
GÉNÉRIQUEMENT pour TOUT kind (voir "Effets d'action" plus haut), PUIS l'action
s'exécute normalement (comportement STRICTEMENT inchangé) ; condition fausse →
`refusalEffects` exécutée À LA PLACE, AUCUN effet de succès, AUCUNE transition.
Action SANS `condition` (tout contenu existant, ex. `door_exit`) → le bloc
condition est sauté entièrement, rétrocompatibilité totale.

`context.entity` porte l'entité qui DÉCLARE l'action (celle qu'on active — voir
`view/interaction.js`/`actionContext`) ; `context.playerEquipment` (séparément,
`view/interaction.js`/`setPlayerEquipmentProvider`, câblé par `view/city-screen.js`)
porte l'équipement du JOUEUR — voir la nuance détaillée dans "Conditions"/
`hasEquipmentTag` plus haut. Une condition `"variable"` scope `"entity"` (voir
"Variables" plus bas) se résout donc contre les variables de L'ENTITÉ-CIBLE elle-même
(ex. `isOpen` d'une fenêtre), jamais contre le joueur. `context.time` (séparément,
`view/interaction.js`/`setTimeProvider`, câblé par `view/city-screen.js`, MÊME clé
que `core/reduce.js`/`presenceContext`) porte l'heure de partie COURANTE : une
condition `"timeRange"` se comporte donc IDENTIQUEMENT sur `action.condition` et sur
`presence[].when` (ex. `door.town_hall_main`, `scenes/town-square.json`).
`context.perceptionActive`/`context.weather`/`context.world`/`context.session`
(séparément, `view/interaction.js`/`setSessionProvider`, câblé par
`view/city-screen.js`, MÊME dérivation que `core/reduce.js`/`presenceContext` — la
session ENTIÈRE, relue à chaque tentative) complètent ce contexte depuis une tâche de
consolidation : `weather`, `perceptionActive`, `hasImprovement` et les variables scope
`"scene"`/`"party"` se comportent donc eux aussi IDENTIQUEMENT sur `action.condition`
et sur `presence[].when` — plus aucune de ces conditions n'est structurellement
condamnée à toujours refuser une action (limitation antérieure, corrigée).

**Extensibilité** : une caisse verrouillée (`"loot"` conditionnée par un futur
`questFlag`), un PNJ qui ne parle qu'à condition (un futur kind `"talk"`)
réutiliseraient cette MÊME vérification, sans y toucher — `action.condition` ne
connaît rien du `kind` qu'il protège.

## Actions multiples filtrées par condition

`entity.action` peut être soit un OBJET UNIQUE (tout ce qui précède, INCHANGÉ —
RÉTROCOMPAT stricte), soit un TABLEAU de candidates — chacune une action complète
(`kind`, `condition`/`refusalEffects` optionnels, `effects` optionnel, voir
"Effets d'action" plus haut), validée EXACTEMENT comme une action unique
(`core/script-parse.js`/`parseSingleAction`, réutilisée à l'identique par les deux formes).

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

**Exemple réel complet — la fenêtre** (`entities/types/glass-window.js`) — CAS
DE RÉFÉRENCE combinant les DEUX
mécanismes de cette page : actions multiples filtrées par condition ET effets
de première classe (état + rendu mélangés) :

```js
// entities/types/glass-window.js — l'ARCHÉTYPE porte l'action (cascade type ->
// instance, comme behavior/presence), mais PAS la variable isOpen : une variable
// ne cascade JAMAIS type -> instance (voir "Variables" plus bas) — chaque
// instance qui utilise ce type DOIT déclarer SA PROPRE isOpen, sinon le
// chargement échoue.
action: [
  {
    kind: "applyEffects",
    condition: { type: "variable", scope: "entity", name: "isOpen", equals: false },
    // Pas de refusalEffects : les deux conditions couvrent tout l'espace du
    // flag, une des deux matche TOUJOURS — un refus n'est jamais réellement
    // atteignable ici, en déclarer un serait du code mort (voir "Conditions
    // d'action" plus haut, refusalEffects OPTIONNELLE).
    effects: [
      { type: "playSound", path: "assets/sounds/effects/window_blinds_open" },
      { type: "setVariable", scope: "entity", name: "isOpen", value: true },
    ],
  },
  {
    kind: "applyEffects",
    condition: { type: "variable", scope: "entity", name: "isOpen", equals: true },
    effects: [
      { type: "playSound", path: "assets/sounds/effects/window_blinds_close" },
      { type: "setVariable", scope: "entity", name: "isOpen", value: false },
    ],
  },
],
```

```json
// scenes/town-square-town-hall-main.json — l'INSTANCE déclare isOpen, VOLATILE
// (repart fermée à chaque rechargement, jamais de mémoire d'ouverture entre
// deux parties)
{
  "id": "glass_window_1",
  "type": "glass_window",
  "x": 1,
  "variables": [{ "name": "isOpen", "type": "flag", "initial": false, "persistent": false }]
}
```

Activer la fenêtre alterne : fermée → ouvre (son + `isOpen: true`) ; ouverte →
ferme (son + `isOpen: false`) — le SON suffit comme retour, aucun texte imposé
(choix de contenu, voir "Conditions d'action" plus haut). Chaque activation
choisit la BONNE candidate parce que `isOpen` a changé depuis la dernière,
jamais un compteur ou une machine à états gérée à la main.

## Variables

**STOCKAGE** (`core/variables.js`) — déclaration, valeur initiale, persistance,
sérialisation sélective, accès pur `getVariable`/`setVariable`, **BRANCHÉ** sur la
LECTURE (type de condition `"variable"`, voir "Conditions"/`variable` plus haut —
composable dans un `allOf` comme toute autre condition) et l'ÉCRITURE (effets
`setVariable`/`toggleVariable`/`addVariable`, voir "Effets d'action" plus haut,
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
| `"entity"` | une entité | `entities[].variables` (scène) | `entity.variables` — SPARSE : absente si l'entité n'en déclare aucune (comme `behavior`/`action`/`presence`), pas de cascade type -> instance |
| `"scene"` | une scène (monde) | `variables` RACINE du fichier de scène (voir `core/scene.js`/`parseScene`) — **PARTAGÉE**, jamais un champ de FACE : une scène à deux faces (recto/verso) n'a qu'UN SEUL sac de variables de scène | `world.variables` — TOUJOURS présent (sac vide `{}` si rien déclaré), comme `defaultSurface`/`indoor` |
| `"party"` | la partie | fourni par l'appelant à `createInitialState(scene, seed, { partyVariables })` — le core n'importe AUCUN fichier de contenu (voir CLAUDE.md, "réglages en cascade") | `session.variables` — TOUJOURS présent, cercle PARTIE comme `money`/`bag`/`weather` |

`money`/`perceptionActive`/`bag`/etc. restent des champs DÉDIÉS (ils ont leur
propre logique de résolution) — ce système est réservé aux variables
GÉNÉRIQUES sans champ dédié : flags de quête, états d'objets, compteurs,
affinité...

**Persistance SÉLECTIVE à la sérialisation** (`core/save.js`) — le point clé :
`serializeGame` REMPLACE la valeur d'une variable VOLATILE par son `initial`
AVANT écriture (jamais la clé elle-même retirée). Pourquoi la valeur et pas la
clé : `deserializeGame` ne repasse JAMAIS par `parseScene`/`parseEntity` (voir
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

**Application par lot** (`core/variables.js`/`applyActionEffects(effects,
context)`, voir "Effets d'action" plus haut pour le VOCABULAIRE complet — cette
fonction ne connaît que les trois types D'ÉTAT, un type qu'elle ne reconnaît pas
traverse SANS EFFET, voir "Routage CORE/VUE") : enchaîne les effets d'UNE liste
SÉQUENTIELLEMENT (le contexte progresse d'un effet au suivant — deux effets qui
touchent la MÊME variable dans la MÊME liste s'appliquent donc dans l'ordre
déclaré, jamais l'un n'écrase l'autre par accident) ; `toggleVariable`/
`addVariable` LISENT la valeur COURANTE (déjà mise à jour par un effet précédent
de CETTE liste, le cas échéant) via `getVariable`, puis délèguent à
`setVariable` — aucune logique d'écriture dupliquée. Renvoie le contexte final
(`{ entity?, world?, session? }`), à SPLICER dans la session par l'appelant —
`core/state.js`/`applyEntityActionEffects(session, entityId, effects)` fait
EXACTEMENT ça pour la vue (résout le contexte depuis le monde ACTIF, splice le
résultat aux emplacements RÉELLEMENT touchés, une liste peut mélanger les trois
portées dans la MÊME activation), point d'entrée de
`view/interaction.js`/`runEffects` (voir "Effets d'action" plus haut).

## Améliorations (improvements)

**Registre** (`core/improvements.js`/`IMPROVEMENT_REGISTRY`) — données pures,
structuré comme `core/tags.js`/`TAG_REGISTRY` : SOURCE DE VÉRITÉ des
améliorations existantes (valide `hasImprovement`/`giveImprovement`/
`removeImprovement`), affichées dans l'onglet Améliorations du menu global
(voir plus bas). Ajouter une amélioration = une entrée ici :

```js
{ order: 1, labelKey: "improvement.supernatural_perception.name", descriptionKey: "improvement.supernatural_perception.description" }
```

`order` (entier >= 1, UNIQUE, validé à l'import par
`validateImprovementRegistry`) : position dans l'onglet et numéro annoncé.
Toujours DÉCLARÉ, jamais dérivé de l'ordre d'insertion du registre —
réarranger le registre ne doit jamais renuméroter les pouvoirs.

**⚠️ À jour avec `core/improvements.js`/`IMPROVEMENT_REGISTRY`.**

**FLAG SIMPLE pour l'instant** (possédée ou non) : un état interne riche (une
amélioration qui porterait ses propres variables) viendrait s'ajouter SI un
cas concret le réclame — ne PAS le construire par anticipation.

**Stockage** — `session.improvements` : `{ [id]: true }`, SPARSE (une
amélioration NON possédée n'a PAS de clé), cercle PARTIE comme `equipment`/
`variables`, PERSISTANT (une amélioration débloquée le reste, JAMAIS
réinitialisée comme une variable volatile). Vide à la création d'une partie
neuve ; rebouché vide pour une sauvegarde antérieure à ce mécanisme (voir
`core/save.js`/`migrateSave`).

**Onglet Améliorations** (`view/menus/inventory-menu.js`, touche "m", troisième
onglet du menu global après Sac et Équipement) : toutes les améliorations du
registre, triées par `order`. Débloquée : `"{order} - {nom} : {description}"` ;
non débloquée : `"{order} - Inconnue"` — le numéro trahit qu'un pouvoir existe,
jamais lequel. Titre : `"Améliorations : {débloquées} sur {total}"`. Aucune
action (les pouvoirs s'activent ailleurs). L'onglet lit `session.improvements`
DIRECTEMENT, jamais la condition `hasImprovement` : en debug, celle-ci répond
toujours vrai (court-circuit plus bas), alors que l'onglet doit montrer ce que
le joueur possède RÉELLEMENT — c'est le seul endroit où vérifier cet état
pendant qu'on joue en debug.

**Lecture** (voir "Conditions"/`hasImprovement` plus haut) : condition
`{ type: "hasImprovement", id }`. **Écriture** (voir "Effets d'action"/
`"giveImprovement"`/`"removeImprovement"` plus haut) : effets d'ÉTAT,
appliqués comme les effets de variable.

**COURT-CIRCUIT DEBUG — le principe central** (`config/debug.js`/
`isDebugEnabled`, mode activable par `window.toggleDebug()`/Ctrl+D) : tant
que le debug est actif, TOUTE RÉSOLUTION de `hasImprovement` répond VRAIE,
pour N'IMPORTE QUELLE amélioration — une porte à `hasImprovement` s'ouvre,
la perception fonctionne, etc. — SANS jamais consulter NI modifier
`session.improvements`. Le joueur ne possède réellement RIEN de plus : une
partie sauvegardée pendant que le debug est actif reste EXACTEMENT aussi
propre qu'avant — `giveImprovement`/`removeImprovement`, EUX, ne sont
JAMAIS court-circuités (le debug ne ment que sur la LECTURE, jamais sur
l'ÉCRITURE). Couper le debug fait retomber INSTANTANÉMENT sur l'état réel au
prochain appel — aucune trace, aucun nettoyage à faire.

**Cas de test réel — la perception débloquable** (`view/perception-toggle.js`/
`toggle`) : la touche "p" est gatée par
`{ type: "hasImprovement", id: "supernatural_perception" }`, évaluée via
`core/presence.js`/`evaluateCondition` (RÉUTILISÉ tel quel, jamais une
vérification maison) AVANT toute bascule — sans l'amélioration, la touche
est SILENCIEUSE (comme une touche non attribuée, aucun son ni annonce) ; en
mode debug, elle fonctionne TOUJOURS.

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
`core/scene.js`), donc `core/items.js` se valide LUI-MÊME au chargement du module
(`validateItemTags(ITEM_REGISTRY)`, appelée en bas du fichier) — tout tag référencé
par un objet DOIT exister dans `TAG_REGISTRY`, sinon `throw` immédiat, nommant le
tag fautif et l'objet concerné. `validateItemTags` est exportée pour rester
testable avec un registre de test (`core/checks/inventory.check.js`), sans avoir à
corrompre le vrai registre.

**Tags EFFECTIVEMENT portés** (`core/equipment.js`/`equippedTags(equipment)`) :
union des tags de chaque objet ÉQUIPÉ, DÉRIVÉE, jamais stockée — même principe que
`gaitOf`. UNIFIÉ joueur/compagnon/PNJ : la fonction ne connaît que la FORME
`equipment` (`{ <slot>: <entrée>|null }`), jamais le type de porteur.

### Ajouter un tag

Une entrée dans `TAG_REGISTRY` (`core/tags.js`), avec son `labelKey` (+ la
traduction dans `data/i18n/fr/items.json`/`data/i18n/en/items.json`). Rien d'autre à
toucher — un objet peut alors le référencer dans son `tags: [...]`.

## Descriptions dynamiques

`descriptionKey`/`consumedDescriptionKey` (voir "Collectible persistant",
`doc/entity-model.md`) restent des clés i18n, mais peuvent porter un GABARIT
à variables — RÉSOLU à chaque lecture (`view/description-resolver.js`/
`resolveDescriptionText`, appelé par `view/interaction.js`/
`resolveDescription`, l'INDIRECTION déjà en place pour "Espace"), JAMAIS
stocké ni mis à jour par effet. Une description SANS `{variable}` reste
STATIQUE, comportement STRICTEMENT inchangé (le gabarit ne fait que
réutiliser `lib/i18n.js`/`interpolate`, qui traverse un gabarit sans
placeholder sans y toucher).

```json
"entity.clock.description": "Une horloge murale... Il est {hour} h {minute}."
```

Examiner l'horloge à 8h → "...il est 08 h 00." ; à 14h30 → "...14 h 30." —
aucun état de description stocké, recalculée à CHAQUE "Espace" avec l'heure
COURANTE (voir `entities/types/clock.js`).

**Valeurs disponibles** : dictionnaire dérivé du CONTEXTE
(`resolveDescriptionText`/`buildDescriptionValues`), MÊMES noms que
`time.announce`/`weather.announce` (`hour`, `minute`, `day`, `month`,
`season`, `year`, `weather`) — EXTENSIBLE : une valeur de plus s'ajoute dans
ce dictionnaire, jamais dans le mécanisme de remplissage
(`resolveDescriptionText`), qui reste agnostique de ce qu'il contient.
Variable de gabarit inconnue ou valeur manquante → dégradation PROPRE
(`{placeholder}` laissé tel quel + avertissement, voir `lib/i18n.js`),
jamais un plantage.

**Contexte de résolution** : EXACTEMENT `actionContext(entity)` (voir
"Conditions d'action" plus haut) — MÊME source que l'évaluation de
condition (`entity`, `time`, `perceptionActive`, `weather`, `world`,
`session`), construit par l'appelant (la vue), jamais lu directement par le
résolveur (PUR : aucun accès à l'horloge réelle ni à un état global).

**Axe d'évolution — niveau RICHE (pas construit)** : le gabarit à variables
est une version DÉGÉNÉRÉE d'une forme future qui choisirait des FRAGMENTS de
texte selon des CONDITIONS (ex. la position d'une grenouille selon la
météo), réutilisant `evaluateCondition` (`core/presence.js`) contre ce MÊME
contexte — jamais une seconde forme de contexte à maintenir. Le riche est
une EXTENSION du simple, jamais un remplacement ; rien dans ce mécanisme
n'empêche de l'ajouter plus tard (voir `doc/entity-model.md`/"Interaction
(niveau 0)").

## Sources de vérité — où lire la liste exhaustive, jamais ici

| Vocabulaire | Registre / aiguillage | Fichier |
|---|---|---|
| Types de condition | `CONDITION_EVALUATORS` | `core/presence.js` |
| Types d'effet (presence/behavior, TICK) | `parseEffect` + `resolveEntityRules` | `core/scene.js`, `core/presence.js` |
| Types d'effet d'action (ACTIVATION, état + rendu + mixte) | `parseActionEffect` (forme) + `STATE_EFFECT_TYPES`/`RENDER_EFFECT_TYPES`/`MIXED_EFFECT_TYPES` (nature/routage) + `applyActionEffects` (état) + `runEffects` (rendu + mixte) | `core/scene.js`, `core/effects.js`, `core/variables.js`, `view/interaction.js` |
| Exécution de l'effet "teleport" (rechargement/repositionnement) | `performTransition`/`placePlayer`/`travelToWorld` | `view/city-screen.js`, `core/state.js` |
| Kinds de trigger (transition d'horloge) | `TRIGGER_KINDS` + `parseTrigger` (forme) + `applyDueTriggers` (détection, état) + `runRenderEffects` (rendu) | `core/triggers.js`, `core/scene.js`, `view/interaction.js` |
| Kinds d'action | `ACTION_HANDLERS` | `view/interaction.js` |
| Kinds de comportement | `BEHAVIORS` | `core/behaviors/index.js` |
| Tags | `TAG_REGISTRY` | `core/tags.js` |
| Améliorations (improvements) | `IMPROVEMENT_REGISTRY` | `core/improvements.js` |
| Objets et leurs tags/gait | `ITEM_REGISTRY` | `core/items.js` |
| Tables de distribution de collecte (standard, référençables) | `SPAWN_TABLES` | `config/spawn-values.js` |
| Catalogues de point de vente (standard, référençables) | `SHOP_CATALOGS` | `config/shop-values.js` |
| Surfaces | `SURFACE_REGISTRY` | `core/surfaces.js` |
| Types de variable | `VARIABLE_TYPES` | `core/variables.js` |
| Portées de variable | `VARIABLE_SCOPES` | `core/variables.js` |
| Valeurs de gabarit de description | `buildDescriptionValues` | `view/description-resolver.js` |

Doc voisines à consulter selon ce qu'on touche : `doc/entity-model.md` (modèle
d'entité, présence en détail, entités éphémères, collectible persistant),
`doc/scene-format.md` (contrat JSON exact d'une scène), `doc/time.md` (horloge dont
dérive `"timeRange"`).
