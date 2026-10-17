# Modèle d'entité

Contrat de référence pour le contenu du jeu : la forme d'une entité, le
vocabulaire de sons qu'elle porte, l'ordre de résolution des réglages, et la
place du joueur dans ce modèle. Complète `doc/scene-format.md` (le format des
fichiers de scène, la FORME JSON) et `doc/scripting.md` (la GRAMMAIRE des
conditions/effets/actions/variables) : ce document-ci décrit le MODÈLE
spécifique-Templeton — capacités d'interaction, dormance, collectible
persistant, entités éphémères, modèle de son, sous-types comme presets —
jamais la grammaire déclarative elle-même, qui vit exclusivement dans
`doc/scripting.md`.

## Le descripteur d'entité partagé

Une entité (registre `entities/types/index.js`, un fichier par archétype dans
`entities/types/` ; instance dans un fichier de scène) porte :

| Catégorie              | Champs                                                          | Rôle |
|-------------------------|-------------------------------------------------------------------|------|
| Position                | `x` (instance uniquement, voir `doc/scene-format.md`)                  | où l'entité se trouve dans la scène |
| Type                    | `type` (instance), `nameKey` (registre ET instance, clé i18n, forme `<namespace>.name`) | quoi et comment l'annoncer |
| Sons par rôle            | `sounds: { <rôle>: descripteur }` (registre ET instance, cascade PAR FUSION PROFONDE, voir "Cascade de sounds") | voir "Vocabulaire de sons" ci-dessous |
| Portée spatiale           | `audibleRange`, `panSaturation`, `interactRange`, `cutoffMin`, `cutoffMax` | où/comment une entité est perçue dans l'espace — voir "Ce qui n'est PAS un paramètre sonore" |
| Surlignage audio          | `highlight` (cascade instance -> type -> défaut `false`)           | gain de proximité, voir "Surlignage audio de proximité" plus bas — INDÉPENDANT de `observable`/`interactable` |
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
cascade instance -> type -> défaut `false` — voir `core/scene.js`) : les
QUATRE combinaisons sont valides, aucun cas spécial. Chaque verbe (Espace /
Entrée, voir `view/interaction.js`) ne considère QUE les entités portant SA
capacité — un décor `observable:false` n'apparaît JAMAIS candidat à Espace,
une balise `interactable:false` jamais candidate à Entrée, même à portée.

- **`observable`** — candidate à Espace (description riche, voir plus bas).
  Exemples : `rock`/`bird`/`fountain`/`hound`/`dog`/`buddy`/`neon`
  (observables, non interactables), `decor` (aucune des deux — preset de
  référence pour ce cas, voir `entities/types/decor.js`), `sound_emitter`
  (aucune des deux, et aucun son propre : un ÉMETTEUR INVISIBLE, une
  position + des `triggers` déclarés par instance — voir
  `entities/types/sound_emitter.js`, `doc/scripting.md`/"Triggers").
- **Cooldown d'interaction** (`interactCooldownMs`, cascade instance ->
  archétype -> défaut `config/tuning-values.js`, comme `interactRange`) :
  pendant ce délai, un nouvel appui sur Entrée sur la MÊME entité est ignoré
  en silence — l'action entière (succès ou refus, quelle que soit la
  candidate), pour que l'état et le son restent synchronisés. Par entité :
  les autres restent disponibles. Espace n'en a pas. Côté vue
  (`view/interaction.js`), horloge réelle, jamais sauvegardé, purgé à
  chaque changement de monde ou de face (`view/city-screen.js` l'appelle dans
  ses deux transitions). Une action qui téléporte n'arme pas le
  délai : son sas la protège déjà.
- **`interactable`** — candidate à Entrée. `npc`/`object` sont interactables
  dès ce niveau 0 EN ANTICIPATION d'un futur type d'action (parler/
  ramasser) au-delà de `"pickup"` (voir plus bas) : le filtrage par verbe ne
  teste jamais que la véracité du champ (`Boolean(...)`), jamais un type
  exact — une entité interactable SANS `action` déclarée reste un stub
  silencieux (voir "Types d'action" plus bas).

Deux niveaux de PERCEPTION, à ne pas confondre :

- **Occupation** (couche légère, inchangée) : le NOM de l'entité, annoncé à
  l'approche (`view/audio/city-scene.js`/`occupiedEntities`) sur le canal
  POLITE (information de contexte, jamais une urgence : ne coupe pas une
  lecture en cours). Toute entité à portée y figure, SAUF celles qui n'ont
  AUCUNE des deux capacités (`observable:false` ET `interactable:false`,
  ex. `decor`, `sound_emitter`) : rien à offrir à Espace ni à Entrée,
  l'occupation ne nomme que ce qu'on peut interroger.
- **Observation** (Espace, couche riche) : la DESCRIPTION d'une entité
  `observable` ciblée. Résolue via une INDIRECTION
  (`view/interaction.js`/`resolveDescription`) plutôt qu'un accès direct à
  `descriptionKey` — DYNAMIQUE : `descriptionKey` reste une clé i18n, mais
  peut porter un GABARIT à variables (`{hour}`, `{minute}`...), rempli avec
  le contexte COURANT à chaque lecture, jamais stocké (voir
  `view/description-resolver.js`, `doc/scripting.md`/"Descriptions
  dynamiques" pour le détail et l'axe d'évolution vers des fragments choisis
  par condition).

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

### Types d'action et conditions d'action

Une entité `interactable` porte OPTIONNELLEMENT `action` (un objet, ou un
tableau de plusieurs candidates filtrées par condition) — **la grammaire
complète (kinds `"pickup"`/`"loot"`/`"switchSide"`/`"applyEffects"`,
`action.condition`/`refusalEffects`, les effets `playSound`/`announce`/
`teleport`/`setVariable`/`toggleVariable`/`addVariable`, la sélection parmi
plusieurs candidates) vit ENTIÈREMENT dans `doc/scripting.md`/"Actions"/
"Effets d'action", jamais dupliquée ici**. Ce que ce document ajoute,
spécifique au MODÈLE d'entité :

- Entité interactable SANS `action` (ex. `npc`/`object` sans kind dédié) ->
  stub silencieux, pas un cas d'erreur.
- `session.money` : entier, cercle PARTIE (comme `session.time`) — SEUL
  point d'écriture `core/money.js`/`addMoney`. Nom de monnaie ("pièces")
  délibérément bateau et provisoire (i18n uniquement,
  `money.announce`/`interaction.pickup`) — changer le nom ne touche à rien
  du mécanisme. Consultable à tout moment via la touche "g"
  (`view/city-screen.js`), lecture pure, canal liveRegion.
- **Exemple de test — dresscode** (`scenes/demo.json`, `door-club`) : une
  porte conditionnée `hasEquipmentTag: "chic"`. Le sac de départ contient
  déjà des escarpins (`high_heels`, tag `"chic"`, gait `"high_heels"` — voir
  "Objets équipables" plus haut) : équiper/déséquiper fait basculer le
  verdict de la porte immédiatement, sans code de synchro (même dérivation
  que `equippedTags`).

## Collectible persistant

Contrairement à l'action `"pickup"` (`money`, ci-dessus — l'entité DISPARAÎT
du monde), un COLLECTIBLE PERSISTANT (`crate`, voir `entities/types/crate.js`)
reste dans `worlds[x].entities` après activation : il change simplement
d'ÉTAT. Le mécanisme, en trois couches strictement séparées :

- **`entity.consumed`** (booléen, RUNTIME — comme `present`/`gotoArrived`,
  JAMAIS un champ d'entrée du JSON de scène) : `false`/absent tant que
  l'entité n'a jamais été activée, posé UNE SEULE FOIS à `true` par
  `core/state.js`/`markConsumed`. PERMANENT : rien dans ce système ne le
  remet jamais à `false`.
- **L'action `"loot"`** (`{ kind: "loot", amount: <n> }`, voir "Types
  d'action" plus haut) — `core/money.js`/`lootEntity`, CORE PUR : ajoute
  `amount` à `session.money` ET pose `consumed:true`, ATOMIQUEMENT (même
  garantie que `pickupEntity` : jamais l'un sans l'autre). **IDEMPOTENCE** :
  une entité déjà `consumed` -> RÉFÉRENCE INCHANGÉE, AUCUN gain — vérifié
  EXPLICITEMENT avant toute écriture, le piège à éviter étant une caisse qui
  refile son contenu à chaque activation. Le retour SENSORIEL (son, annonce
  "Trouvé : N pièces") reste vue pure (`view/interaction.js`, même patron que
  `"pickup"`) — mais cette fois la garde d'idempotence y est DUPLIQUÉE
  volontairement (`entity.consumed` revérifié AVANT de jouer le son/annoncer) :
  sans elle, réactiver une caisse déjà vide rejouerait le retour sensoriel
  d'un gain qui n'a, lui, jamais eu lieu une seconde fois — `lootEntity` se
  dégrade déjà silencieusement côté état, mais la VUE doit se taire aussi.
- **Deux effets POST-ACTIVATION, COMPOSABLES** (déclarés par l'entité, au
  choix du concepteur — l'un, l'autre, les deux, ou aucun — jamais un
  comportement codé en dur pour "crate" spécifiquement) :
  - **Changer d'état perceptible** — `consumedDescriptionKey` (cascade
    instance -> type, comme `descriptionKey`, voir `core/scene.js`) :
    description alternative lue par `view/interaction.js`/
    `resolveDescription` dès que `entity.consumed`. `muteOnConsumed`
    (booléen, REGISTRE SEULEMENT — jamais cascadé par instance, contrairement
    à `consumedDescriptionKey`) : arrête PERMANEMMENT le beacon continu de
    l'entité dès que `consumed` passe à `true` (voir `view/audio/
    city-scene.js`/`muteConsumedBeacons`, appelée une fois par tick comme
    `cleanupRemovedEntities`). **Limite volontaire** : seule l'ABSENCE du
    beacon est supportée, jamais un son DIFFÉRENT (un second fichier) —
    remplacer la voix elle-même exigerait de recréer un Howl en cours de
    scène, non construit ici (non exercé par le contenu actuel). L'entité
    RESTE observable/interactable après cet effet seul — c'est ce qui le
    distingue du suivant.
  - **Devenir dormant** — PAS un champ propre à ce système : se déclare avec
    le mécanisme de présence EXISTANT (`core/presence.js`), à l'INSTANCE (pas
    à l'archétype, voir `entities/types/crate.js` qui n'en déclare aucune par
    défaut) — voir `scenes/demo2.json`, `crate-warehouse`. Une entité
    `consumed` alimente le registre de conditions (`core/presence.js`/
    `CONDITION_EVALUATORS.consumed`) exactement comme `"timeRange"`/
    `"arrived"` : AUCUNE retouche à `isPresent`/`resolveEntityRules`/
    `core/reduce.js` n'a été nécessaire pour l'ajouter. PERMANENT par
    construction (`consumed` ne repasse jamais à `false`). **DEUX règles
    requises**, pas une seule (même "asymétrie documentée" que pour toute
    présence conditionnelle, voir plus bas) : `{ when: { type: "consumed" },
    present: false }` D'ABORD (priorité au premier rule actif), PUIS un
    catch-all "présente par défaut" — `{ when: { type: "timeRange", from: 0,
    to: 24 }, present: true }` (couvre TOUTE heure : pas une vraie contrainte
    temporelle, juste l'idiome déjà en place pour "présente sinon", voir
    l'habitant plus bas) — SANS cette seconde règle, l'entité serait dormante
    EN PERMANENCE (avant *et* après consommation), aucune règle ne la
    couvrant explicitement tant qu'elle n'est pas consumed. Coupe les TROIS
    plans habituels de la dormance (comportement, audio, interaction, voir
    "Présence conditionnelle" ci-dessous) une fois consumed, donc silencieuse
    ET non examinable, contrairement à l'effet précédent seul.

Exemple de référence — deux caisses, `scenes/demo2.json` :
`crate-port` (perceptible seul : desc devient "vide", beacon coupé,
reste interactable — réactiver ne redonne rien, silencieusement) et
`crate-warehouse` (devient dormant : donne son contenu puis disparaît de
toute perception, définitivement). Même archétype `crate` pour les deux —
seule la présence D'INSTANCE distingue les deux comportements, illustrant que
ce sont des PRESETS de propriétés composables, jamais une hiérarchie de
sous-types (voir "Les sous-types sont des PRESETS" plus bas).

## Entités éphémères

À l'opposé du collectible persistant ci-dessus (l'entité SURVIT, change
d'état) : une entité ÉPHÉMÈRE est créée EN COURS DE JEU, n'existe que pour
la visite courante, et disparaît TOUJOURS sans laisser de trace — ramassée
OU non. Marque distinctive : `entity.ephemeral === true`, un champ RUNTIME
(comme `consumed`/`present`/`gotoArrived`) — jamais un champ d'entrée du
JSON de scène, une entité ÉPHÉMÈRE n'est par définition jamais DÉCLARÉE.

- **Création** — `core/state.js`/`spawnEphemeral(session, spec, x)` : point
  d'entrée UNIQUE et RÉUTILISABLE pour toute création d'entité en jeu — DEUX
  appelants aujourd'hui, la touche debug "e" (voir "Mode debug" plus bas) et
  l'effet "spawn d'éphémères éparpillés" déclenché par une action (voir
  "Spawn déclenché par une action" plus bas), mais rien dans le mécanisme
  n'est spécifique à l'un ou l'autre : un objet lâché par un compagnon, un
  effet, pourront s'y greffer de la même façon plus tard. `spec` est un
  descripteur d'entité DÉJÀ RÉSOLU
  (`type`, `labelKey`, `sounds`, `blocksMovement`, `observable`,
  `interactable`, `action`...) — EXACTEMENT la forme qu'une entité obtient
  en sortie de `core/scene.js`/`parseEntity`, construit par L'APPELANT (voir
  `createTestCompanion` dans `core/state.js`, même principe pour le
  compagnon de test) : `sounds` DOIT être porté explicitement ici (voir
  "Cascade de sounds" plus bas) — la vue lit `entity.sounds`, jamais le
  registre directement, donc un spec fabriqué à la main qui l'omettrait
  perdrait tout son. Le core ne connaît AUCUN registre de types,
  `spec.type` reste une étiquette opaque. `spawnEphemeral` pose lui-même
  `id` (dérivé d'un compteur DÉDIÉ par monde, `world.nextEphemeralId` —
  JAMAIS `Date.now()`/`Math.random()`, le core reste déterministe), `x` et
  `ephemeral: true`.
- **Rendu** — une entité éphémère est une entité COMME UNE AUTRE côté vue :
  `view/audio/city-scene.js` la découvre au tick suivant sa création
  (`syncNewEntitySounds`, appelée avant tout calcul positionné) et lui
  construit une entrée `entitySounds` EXACTEMENT comme au montage de scène
  (`buildEntitySoundEntry`, factorisée pour les deux cas) — son, occupation,
  interaction fonctionnent sans aucun cas spécial. Seule différence
  acceptée : pas de préchargement dédié (voir le commentaire de
  `addLateEntitySoundEntry`) — un contenu créé en jeu peut accuser un tout
  premier son légèrement en retard le temps d'un décodage à froid, jamais
  un plantage.
- **Ramassage** — réutilise l'action `"pickup"` telle quelle (voir
  `core/money.js`/`pickupEntity`) : une entité éphémère ramassable porte
  `action: { kind: "pickup", amount: <n> }` comme n'importe quelle autre —
  aucune distinction de traitement, la robustesse au retrait déjà en place
  (`view/audio/city-scene.js`/`cleanupRemovedEntities`, `present: false`
  synthétisé pour toute entrée disparue de `world.entities`) couvre déjà ce
  cas sans rien y ajouter.
- **Exclusion de la sérialisation** — `core/save.js`/`serializeGame` retire
  TOUTE entité `ephemeral` de TOUS les mondes avant d'écrire la sauvegarde
  (jamais seulement du monde actif — la garantie ne doit dépendre d'aucun
  autre mécanisme, voir son commentaire). Une partie rechargée ne fait
  donc JAMAIS réapparaître un éphémère, quel que soit le moment de la
  sauvegarde.
- **Purge au départ** — `core/state.js`/`travelToWorld` retire les entités
  éphémères du monde qu'on quitte AU MOMENT de le ranger (geler un monde
  parqué qui en contiendrait encore serait la seule façon dont un éphémère
  pourrait survivre à une sortie de scène, en mémoire, pour une visite
  ultérieure DANS LA MÊME partie — la sérialisation seule ne suffit pas à
  l'empêcher). Revenir dans un monde quitté : aucun éphémère d'avant, qu'il
  ait été ramassé ou non.
- **Limite anti-prolifération** — `MAX_EPHEMERALS` (`config/ephemerals.js`,
  50 par défaut) : SEULES les entités éphémères comptent (jamais les
  entités déclarées, dont le nombre est maîtrisé à l'écriture). Au
  dépassement, `spawnEphemeral` ÉVINCE LE PLUS ANCIEN éphémère VIVANT (le
  premier trouvé dans `world.entities`, dans l'ordre — les éphémères sont
  toujours AJOUTÉS en fin de liste, jamais réordonnés, donc cet ordre EST
  l'ordre de création) : transitoire par nature, cohérent qu'il cède la
  place plutôt que de refuser la création demandée. Alternative "refuser le
  nouveau" possible, non retenue ici.

### Spawn déclenché par une action

Un VRAI déclencheur en jeu (au-delà de la touche debug) : une entité peut
déclarer, sur son `action` (voir "Types d'action" plus haut), un effet
`spawn` qui fait naître PLUSIEURS éphémères ÉPARPILLÉS autour d'elle à
l'activation — ex. `crate-stash` (`scenes/demo2.json`), une caisse dont le
`"loot"` LÂCHE des pièces au lieu d'en créditer une directement :

```json
"action": {
  "kind": "loot",
  "spawn": { "spec": { "type": "money", "amount": 20 }, "count": 3, "spread": 1.5 }
}
```

- **Forme** — `spawn: { spec, count, spread? }`, une SECONDE forme valide
  pour `action.kind: "loot"` (voir "Types d'action" plus haut), jamais
  mélangée avec `amount` sur la même entité : `spec` (minimal — `{ type,
  ...surcharges }`, MÊME forme qu'une instance de scène, pas un descripteur
  déjà résolu) DÉCRIT ce qui naît, `count`/`spread` DÉCRIVENT comment —
  séparation délibérée pour pouvoir un jour faire naître autre chose qu'une
  pièce (`spec` change) sans toucher à la mécanique d'éparpillement elle-même
  (`count`/`spread`, génériques).
- **Effet CORE pur** — `core/money.js`/`lootEntitySpawn` : MÊME idempotence
  que `lootEntity` (entité absente/déjà `consumed` -> référence inchangée,
  aucun spawn) ; sinon, `markConsumed` PUIS `core/state.js`/
  `spawnScatteredEphemerals(session, spec, sourceX, count, spread)` — qui
  appelle `spawnEphemeral` `count` FOIS, à des positions ÉPARPILLÉES.
- **Éparpillement déterministe** — chaque position est `sourceX + décalage`,
  décalage tiré dans `[-spread, +spread]` via le PRNG SEEDÉ du monde
  (`world.rngState` — LE MÊME flux que le comportement des entités, jamais
  un flux séparé : consommer un tirage de plus entre deux ticks reste
  parfaitement déterministe, voir le commentaire de la fonction). Même seed
  + même suite d'actions (ticks ET interactions confondus) -> mêmes
  positions, toujours.
- **Bornes RESPECTÉES À TOUS COUPS** — chaque candidat est d'abord CLAMPÉ
  dans `[0, world.length]` (jamais hors carte) puis, s'il tombe dans le
  corps (`BODY_RADIUS`) d'une entité qui bloque RÉELLEMENT (`isBlocking` —
  une entité dormante ne compte jamais, voir "Présence conditionnelle"
  ci-dessous), RE-TIRÉ (quelques tentatives) — filet ultime : `sourceX`
  lui-même, toujours valide (un collectible n'est jamais `blocksMovement`).
  Aucun éphémère ne peut naître hors map ni dans un mur.
  `spread` optionnel -> `config/tuning-values.js`/`ephemeralScatterSpread`
  (défaut PAR ACTION, lu directement, pas via la cascade `resolveTuning` —
  ce n'est pas un réglage par entité/son).
- **`spec` résolu côté VUE** — `spawn.spec` reste minimal dans le JSON (`{
  type, ...surcharges }`) : c'est `view/city-screen.js`/
  `resolveEphemeralSpec` (même fonction que pour la touche debug — DEUX
  appelants, une seule résolution) qui le traduit en descripteur COMPLET
  avant d'appeler `spawnEphemeral`/`spawnScatteredEphemerals` — le core
  ignore tout du registre, comme partout ailleurs.
- **Ramassage individuel** — chaque pièce éparpillée porte SA PROPRE action
  `"pickup"` (voir "Ramassage" ci-dessus) : rien de spécifique à leur origine
  "spawn groupé", le joueur les ramasse une par une exactement comme
  n'importe quel autre éphémère.
- **`count` FIXE aujourd'hui** — une fourchette (`countMin`/`countMax`,
  tirée comme `spread`) pourra s'ajouter plus tard si besoin ; non construite
  ici, non demandée.

### Mode debug

`config/debug.js` : un drapeau global minimal, désactivé par défaut,
activable depuis la console (`window.toggleDebug()`, voir `main.js`, même
patron que `window.runMovementChecks`) OU par la combinaison **Ctrl+D** en
jeu (même fonction, deux chemins d'accès — voir `lib/input.js`/
`onGlobalPress`, binding GLOBAL résolu indépendamment de la pile d'écrans,
disponible quel que soit l'écran actif — Ctrl plutôt qu'Alt, qui déplace le
focus vers la barre de menus sur certains navigateurs) — jamais un menu, jamais persisté (un mode debug ne doit jamais survivre à un rechargement de
page ni à une sauvegarde, contrairement à `config/preferences.js`). Seul
consommateur aujourd'hui : la touche "e" en ville (`view/city-screen.js`),
qui fait apparaître une pièce éphémère (`spec` = archétype `money` existant,
`entities/types/money.js`, réutilisé tel quel) à la position du joueur —
active SEULEMENT si le drapeau est levé, sinon "e" ne fait RIEN (comportement
inchangé pour tout joueur qui n'a jamais activé le mode). PAS "d" (touche
suggérée à l'origine) : déjà liée au déplacement à droite (`view/input.js`,
`MOVE_BINDINGS.moveRight`, convention ZQSD) — la réutiliser aurait fait
apparaître une pièce à chaque premier appui d'un pas vers la droite en mode
debug si les deux touches menaient à la même action ; elles cohabitent
désormais SANS ambiguïté grâce à l'arbitrage des modificateurs de
`lib/input.js` ("d" seul = mouvement, "d"+Ctrl = bascule debug, "e" = ce
spawn de test), mais le choix de "e" reste inchangé, plus clair à retenir.
Infra volontairement minimale : d'autres outils de debug s'y grefferont plus
tard derrière le MÊME drapeau, jamais un par outil. Menus de debug derrière ce
drapeau, en ville : Shift+W (météo, `view/menus/debug-weather-menu.js`),
Shift+T (temps, `view/menus/debug-time-menu.js`), Shift+M (téléportation vers
n'importe quelle scène du registre `scenes/index.js`, liste générée,
`view/menus/debug-teleport-menu.js` — passe par l'effet `teleport` en mode
`instant`, jamais par un chemin de chargement parallèle).

## Collecte — conteneurs régénérants et plages au sol

Mécanique de SPAWN de collectibles (`core/distribution.js`, `core/spawn.js`) :
UNE logique de garnissage, DEUX matérialisations. Ni un collectible
persistant (`consumed` une fois pour toutes) ni un éphémère (purgé au
départ) : une source se RE-GARNIT chaque jour de jeu, et ce qu'elle produit
persiste avec le monde.

- **Distribution (quoi)** — `{ table: "<nom>" }` référence une table
  standard de `config/spawn-values.js`/`SPAWN_TABLES` ; `{ items: { <objet>:
  <poids> } }` en déclare une inline (`<objet>` = clé de `ITEM_REGISTRY`).
  Poids RELATIFS, tirage via `core/weather.js`/`pickTransition` réutilisé tel
  quel — une seule logique de tirage pondéré. Résolue à CHAQUE tirage, jamais
  figée dans l'état : un monde sauvegardé tire toujours dans la table
  COURANTE. Validée au chargement (`core/scene.js`) ; les tables standard
  s'auto-valident à l'import (`validateSpawnTables`), comme la météo.
- **Sources (où)** — CONTENEUR : entité portant `container: { distribution,
  count? }` (cascade instance -> type, ex. `entities/types/bush.js` ;
  `count` : objets par cycle, défaut `SPAWN_CONTAINER_DEFAULT_COUNT`) +
  action `"search"` ; point fixe, contenu CACHÉ. PLAGE : `face.spawnRanges`
  (`{ from, to, count?, distribution }`, voir `doc/scene-format.md`) ;
  collectibles posés AU SOL à des positions VARIÉES — `drawScatteredPosition`
  (bornes carte, corps bloquants) autour du centre de la plage, re-tirée si
  trop proche d'un collectible déjà posé (`config/tuning-values.js`/
  `spawnMinSpacing`). Chaque collectible posé passe par le MÊME parseur qu'une
  instance de scène (`core/scene.js`/`parseSpawnedEntity`, registre INJECTÉ
  comme pour `parseScene`) : archétype du même nom que l'objet s'il existe
  (`apple`), sinon l'archétype générique `item` avec nameKey/action pickup
  dérivés d'`ITEM_REGISTRY` (même convention que "Poser", voir
  `view/city-screen.js`/`resolveDroppedItemSpec`). Marqué `spawned: true`
  (RUNTIME) ; id `spawn-<cycle>-<plage>-<i>`, déterministe.
- **Cycle (quand)** — quotidien : `spawnCycleAt(time)` = index de jour
  depuis l'origine, frontière à `SPAWN_CYCLE_HOUR` (minuit). SIMPLE pour
  commencer : chaque source garnie à chaque cycle, ni plafond ni
  probabilité (à doser plus tard). Rien ne se matérialise JAMAIS pendant que
  le joueur est dans la scène — aucun code au tick : `refillDueSpawns`
  s'exécute au CHARGEMENT du monde actif (`view/city-screen.js`/
  `refreshSpawns` : première entrée, transition, partie remplacée), et
  `world.spawnCycle` (dernier cycle matérialisé) tient lieu de FILE — un seul
  marqueur, ÉCRASÉ par nature : après N cycles d'absence, UN garnissage, avec
  la distribution du moment, jamais une accumulation. Au garnissage : anciens
  collectibles posés retirés (ramassés ou non), nouveaux posés ; chaque
  conteneur reçoit un `stock`/`stockCycle` neufs ; chaque POINT DE VENTE
  recharge son rayon (`shopStock`, voir "Vente et achat"). Scène à deux
  faces : LES DEUX faces garnies (on charge le monde entier), chacune sur son
  PRNG.
  Exception assumée pour le CONTENEUR : à la fouille, si son `stockCycle`
  diffère du cycle courant, il se re-garnit PARESSEUSEMENT d'abord — un jour
  passé sur place suffit. RAISON de l'asymétrie : le contenu d'un conteneur
  est CACHÉ (rien n'est perceptible tant qu'on ne fouille pas — aucune
  balise, aucune annonce), alors qu'un collectible de plage est VISIBLE dès
  qu'il existe (balise, occupation) — le matérialiser pendant que le joueur
  est là ferait « popper » un son/une entité sous ses pieds, sans cause
  audible. Les plages attendent donc le prochain chargement ; le conteneur
  peut se garnir sur place sans rien trahir.
- **Matérialisation (comment)** — CONTENEUR : action `"search"` (voir
  `doc/scripting.md`) -> `core/spawn.js`/`searchContainer` : le stock TOMBE
  AU SOL — une entité ÉPHÉMÈRE par objet, éparpillée autour du conteneur
  (`spawnScatteredEphemerals`, MÊME geste que la caisse qui lâche des pièces
  : bornes, obstacles, décalage d'attaques des balises), à ramasser ensuite
  objet par objet ou à laisser (purgée au départ comme tout éphémère) ; puis
  `stock: null`. Rien ne va JAMAIS directement au sac. Retour : annonce
  `interaction.searchSpawn` seule. PLAGE ET objets tombés : ramassage
  ordinaire via l'action `"pickup"` que porte chaque collectible
  (`core/bag.js`/`pickupItemEntity`, aucun cas spécial).
- **Fouillabilité liée au garnissage** — un conteneur n'est candidat à
  Entrée QUE garni (`core/spawn.js`/`isSearchable` : stock non vide, OU un
  cycle passé depuis `stockCycle` — garnissage paresseux dû) ; filtré par
  `view/audio/city-scene.js`/`getInteractionCandidates` pour `"activate"`
  seulement. Vidé -> Entrée ne le concerne plus : AUCUN retour (ni "vide",
  ni menu), et il n'entre pas dans la désambiguïsation — ramasser les objets
  tombés autour d'un conteneur vidé ne propose jamais le conteneur. CRUCIAL :
  SEULE la fouille s'éteint. `interactable`/`observable`, présence, beacon,
  occupation restent INCHANGÉS — l'arbre reste un arbre, Espace le décrit
  toujours, il bruisse toujours. Jamais rendu dormant/inerte par ce
  mécanisme.
- **Déterminisme** — tous les tirages (objet, position) consomment
  `face.rngState` (comme `spawnScatteredEphemerals`) : même seed + même cycle
  -> même garnissage, positions comprises.
- **Persistance** — `stock` (tableau d'objets, ou `null` vidé)/`stockCycle`
  (entité), `spawned` (entité posée par une plage), `spawnCycle` (monde) :
  champs plats, sérialisés avec la partie ; save après fouille + reload ->
  conteneur toujours vidé (et non fouillable) jusqu'au cycle suivant,
  collectibles de plage toujours là, marqueur conservé (aucun re-garnissage
  au rechargement dans le même cycle). Les objets TOMBÉS d'une fouille,
  éphémères, sont exclus de la sauvegarde comme tout éphémère. Une sauvegarde antérieure n'a pas de
  `spawnCycle` : absence = cycle dû, garnissage au premier chargement — aucun
  rebouchage nécessaire. Vérifié par l'audit de sérialisabilité
  (`core/movement.check.js`, section "Collecte").

Contenu de test : `scenes/demo.json` ("Ville test") — `bush_1` (x=12, table
`default`) et une plage `[27, 34]` de 3 collectibles. Menu debug du temps
(Shift+T, mode debug) : "Avancer d'une journée" puis refouiller/quitter et
revenir pour observer le cycle.

## Vente et achat — point de vente et menu à sliders inline

Une entité POINT DE VENTE (`entities/types/shop_counter.js`, action
`{ kind: "shop" }` — voir `doc/scripting.md`) s'active pour VENDRE les objets
du sac contre de l'argent, ou ACHETER dans son CATALOGUE. Frontière : tout
le menu est VUE (`view/menus/shop-menu.js`, pile d'écrans, jeu en pause,
balises en pause) ; les TRANSACTIONS sont des effets d'état CORE
(`core/trade.js`/`sellItems`, `buyItems`, injectés depuis
`view/city-screen.js`, même patron que "Poser"). Prix de vente : `value` sur
l'objet (`core/items.js`/`ITEM_REGISTRY`), pleine valeur ; sans `value` (ou
0) -> NON vendable, jamais listé (filtrage par catégories/tags de boutique :
prévu, pas construit). Prix d'achat : `price` de l'article, sinon `value`
(pleine valeur, marge marchand plus tard).

- **Catalogue et stock FINI cyclique** — `entity.shop = { catalog }`
  (cascade instance -> type, comme `container.distribution`) : `{ table:
  "<nom>" }` référence `config/shop-values.js`/`SHOP_CATALOGS`, `{ items: {
  <objet>: { stock, price? } } }` déclare inline (`core/catalog.js`, validé au
  chargement, catalogues standard auto-validés à l'import). L'ÉTAT courant
  du rayon vit sur l'entité, RUNTIME et persistant : `shopStock` (`{ <objet>:
  n }`) / `shopCycle`. Il se RECHARGE à la valeur de table au cycle de
  collecte (`core/spawn.js`/`refillFace` traite un point de vente comme une
  source garnie : `restockShopEntity`, jamais un cumul avec l'invendu), et
  PARESSEUSEMENT à l'activation du comptoir si un cycle est passé sur place
  (`core/trade.js`/`restockShopIfDue` — contenu caché, même asymétrie qu'un
  conteneur). Catalogue dynamique/aléatoire par jour : plus tard.
- **Menu d'actions** — TOUJOURS un menu, titre = nom du comptoir : "Acheter",
  "Vendre", "Annuler". "Acheter" sans catalogue, "Vendre" sans rien de
  vendable au sac -> annonce seule, aucune liste vide.
- **Menu à sliders inline** — UN SEUL écran CUSTOM paramétré pour les deux
  sens (`openQuantityList` ; pas un slider `lib/menu.js`, valeur
  TRANSITOIRE, voir `inventory-menu.js`/`openQuantitySelector` pour les
  mêmes raisons). VENTE : une LIGNE par TYPE vendable du sac (agrégée : un
  non-empilable possédé en N exemplaires = une ligne, plafond N). ACHAT :
  une ligne par ARTICLE du catalogue, ÉPUISÉS COMPRIS (lus "épuisé", le
  joueur sait qu'ils reviendront au cycle suivant), plafond = STOCK
  disponible. Puis "Valider la vente"/"Valider l'achat" et "Annuler".
  Touches : droite/Entrée/Espace +1, gauche -1, Maj+flèche ±5 (maintien pris
  en charge comme un slider `lib/menu.js` : un DÉLAI INITIAL après le
  premier cran — une pression brève n'en produit jamais qu'un — puis une
  cadence de répétition), Suppr -> 0, Retour arrière -> grand total, Maj+A
  -> valider, Maj+G -> argent actuel (même annonce que "g" en ville ; Maj
  parce que les lettres nues sont réservées à un futur saut par initiale
  dans les listes), Échap -> annuler, Home/End, cyclage/étoile/suffixe de
  position selon les préférences de menu.
- **Double plafond à l'achat, UNE seule source de refus** — le STOCK est la
  BORNE du slider (structurelle : un cran au-delà sonne "block", sans
  message, comme le possédé en vente). L'ARGENT est la CONDITION
  d'incrément : un CUMUL (total du panier) est comparé à `session.money`
  avant chaque incrément — un grand pas est réduit à ce que les fonds
  permettent, zéro -> refus "Fonds insuffisants." (seul refus avec message,
  jamais confondu avec le stock).
- **Sons** — tout refus AVEC message (rien à vendre, pas de catalogue, rien
  de sélectionné à la validation, fonds insuffisants) joue "refusal" ;
  "block" reste réservé aux tentatives sans effet et sans message (bornes,
  Entrée hors ligne). Rôles et fichiers : `view/menu-sounds.js`.
- **Annonces** — à la NAVIGATION : entrée complète `"{nom} {choisi} sur
  {plafond}, {prix} pièces : {description}"` ; à l'AJUSTEMENT : SEULEMENT
  `"{choisi}, {sous-total de la ligne}"` (fluide en ajustement répété,
  jamais le grand total à chaque cran) ; le GRAND TOTAL ("Vendre/Acheter N
  … pour M pièces") est le TITRE, dit à l'ouverture et à la demande (Retour
  arrière).
- **Validation** — rien de sélectionné -> "Aucun objet/article
  sélectionné.", jamais une confirmation vide ; sinon confirmation DÉTAILLÉE
  (titre dynamique via `lib/menu.js`/`titleParams` : total + "Pomme × 3,
  Pièce × 2"), "Annuler" en première entrée. Confirmer -> `sellItems`
  (quantités clampées au possédé, non vendable ignoré, retrait + crédit dans
  le MÊME état) ou `buyItems` (quantités clampées au stock, FONDS REVÉRIFIÉS
  — jamais de débit partiel —, débit + ajout au sac + décrément du stock dans
  le MÊME état ; aucune capacité de sac à respecter, voir `core/bag.js`) puis
  retour DIRECT au jeu (trois écrans retirés) et annonce du résultat ;
  Annuler -> retour à la liste, SÉLECTION PRÉSERVÉE (elle vit dans le closure
  de l'écran).
- **Annulation** — sélection vide -> fermeture DIRECTE, sans confirmation ;
  sélection en cours -> "Abandonner la sélection en cours ?" (Confirmer ->
  retour au menu d'actions ; Annuler -> sélection préservée).

Contenu de test : `scenes/demo.json`, `counter_1` (x=38, catalogue
`general`).

## Sac d'objets

Deuxième tiers de l'inventaire après l'argent (`session.money`, voir
`core/money.js`) : `session.bag`, liste d'entrées `{ type, quantity? }` —
`quantity` présent pour un objet EMPILABLE (une seule entrée par type,
incrémentée), absent pour un objet NON empilable (une entrée PAR
EXEMPLAIRE). `core/bag.js`/`addItem` et `removeItem` sont les SEULS points
d'écriture (voir son header pour le détail complet de la forme).

- **Consultation** — touche "i", écran-liste
  (`view/menus/inventory-menu.js`). Chaque ligne : "**<nom> × <quantité si
  applicable> : <description>**" — le nom D'ABORD, la description EN QUEUE
  (non-bloquante : qui ne veut que le nom l'a déjà entendu et peut passer à
  l'entrée suivante).
- **Action "Poser"** — Entrée sur une entrée ouvre TOUJOURS un menu
  d'actions (Poser, Annuler), jamais une activation directe même à une
  seule action disponible — prévisibilité : "Entrée sur un objet" ne
  bascule jamais entre "menu" et "agit tout de suite" selon le contenu.
  Objet UNIQUE (quantité 1, ou non empilable) : "Poser" agit DIRECTEMENT,
  aucun sélecteur. Stack > 1 : ouvre un SÉLECTEUR DE QUANTITÉ — un écran
  CUSTOM, délibérément PAS le mécanisme `kind:"slider"` de `lib/menu.js`,
  pour deux raisons structurelles (voir le commentaire d'`openQuantitySelector`,
  `view/menus/inventory-menu.js`) : la valeur y est TRANSITOIRE (propre à
  cette seule ouverture) alors que le slider existant porte la sienne via
  une PRÉFÉRENCE PERSISTÉE (`prefKey`/`config/preferences.js`, localStorage
  réel) ; et ce sélecteur veut TROIS paliers d'incrément (aucun -> ±1, Shift
  -> ±10, Ctrl -> ±100) alors que le slider n'en connaît qu'UN (Ctrl ->
  `bigStep`). `lib/menu.js` reste donc intact — imitation fidèle de son
  esprit (annonce de la seule valeur à l'ajustement, bornée, son "select" à
  la validation), pas une réutilisation littérale.
- **Effet CORE pur** — `core/bag.js`/`dropItem` : `removeItem` (retire la
  quantité choisie du sac) PUIS `spawnEphemeral` (fait apparaître l'objet au
  sol), composés atomiquement. **UNE SEULE entité éphémère porte TOUTE la
  quantité posée** — jamais N entités éparpillées comme "loot"/`action.spawn`
  (voir "Spawn déclenché par une action" plus haut) : poser une pile n'est
  pas faire éclater un butin, c'est laisser un tas à un endroit — un tas
  UNIQUE au sol reste plus lisible à l'oreille (pas de superposition de
  balises identiques) et symétrique de la représentation du sac lui-même
  (une seule entrée par type). `spec` résolu côté VUE
  (`resolveDroppedItemSpec`, `view/city-screen.js`, aux côtés de
  `resolveEphemeralSpec`) : l'archétype DÉDIÉ du type est réutilisé s'il en
  existe un (ex. `apple` -> `entities/types/apple.js`, même son que
  l'original) ; sinon repli sur l'archétype GÉNÉRIQUE `item`
  (`entities/types/item.js`) avec `nameKey`/`descriptionKey`/`action`
  propres à l'objet (depuis `core/items.js`/`ITEM_REGISTRY`) — exactement la
  convention qu'une instance de scène suivrait pour ce même type générique.
- **Objet posé = ÉPHÉMÈRE** — ramassable de nouveau (réutilise l'action
  `"pickup"` telle quelle, déjà robuste), mais **PERDU** si la scène est
  quittée sans le ramasser (purgé comme tout éphémère au départ, jamais
  sérialisé — voir "Entités éphémères" plus haut). Choix ASSUMÉ, pas un
  oubli : "Poser" est un vrai LÂCHER, pas un coffre distant — perdre un
  objet posé puis abandonné est une utilité en soi (se délester quelque
  part, pas juste réorganiser le sac).
- **Extensibilité anti-drop, RÉSERVÉE, PAS construite** : un futur flag
  `droppable` sur `core/items.js`/`ITEM_REGISTRY` (défaut `true`) pourrait un
  jour exclure "Poser" du menu d'actions pour un objet donné (ex. un objet
  de quête vital) — non codé ici, aucun objet de ce genre n'existe encore ;
  documenté pour ne pas condamner ce slot par erreur plus tard.

## Équipement

Troisième tiers de l'inventaire : `session.equipment`, des SLOTS NOMMÉS —
`{ feet: <entrée ou null> }` aujourd'hui, un seul slot. `core/equipment.js`/
`equipItem` et `unequipItem` sont les SEULS points d'écriture ; un objet
donné est SOIT dans le sac SOIT équipé, JAMAIS les deux (les deux fonctions
composent `removeItem`/`addItem`, `core/bag.js`, ATOMIQUEMENT avec
l'écriture du slot).

- **Objets équipables** (`core/items.js`/`ITEM_REGISTRY`) — `equippable:true`,
  `slot` (le nom du slot occupé), `gait` (voir plus bas). Quatre exemples au
  slot "feet" : `sneakers` (gait `"shoes"`, équipées de départ — voir plus
  bas), `leather_boots` et `combat_boots` (toutes deux gait `"boots"` — MÊME
  pool, deux objets distincts : rien n'impose une correspondance 1:1 entre
  objet et gait), `high_heels` (gait `"high_heels"`, tag `"chic"` — voir
  "Tags d'objets" juste en dessous). `combat_boots` ET `high_heels` font
  partie du contenu de départ du sac (voir `core/state.js`/
  `createInitialState`), pas équipés — de quoi tester l'échange ET le tag
  "chic" (porte à dresscode, voir "Actions conditionnelles" plus bas) sans
  avoir à en ramasser en jeu.
- **Tags d'objets** (`core/tags.js`/`TAG_REGISTRY`, `core/items.js`/
  `ITEM_REGISTRY[type].tags`) — classification HORIZONTALE d'un objet (ex.
  `combat_boots` porte `["military"]`), indépendante de `equippable`/`slot`/
  `gait` : un mot-étiquette pour de futures vérifications de contenu (PNJ,
  événements), pas un mécanisme de gameplay en soi. Un tag est un
  IDENTIFIANT STABLE (la clé du registre), traduit SEULEMENT à l'affichage
  via `labelKey` — jamais le texte traduit dans une vérification, qui
  cesserait de matcher au changement de langue. `TAG_REGISTRY` est la SOURCE
  DE VÉRITÉ : un tag référencé par un objet absent de ce registre échoue au
  chargement (`core/items.js`/`validateItemTags`, appelée sur
  `ITEM_REGISTRY` lui-même), même principe que les surfaces contre
  `SURFACE_REGISTRY`.
- **Tags EFFECTIVEMENT portés — DÉRIVÉ, jamais stocké**
  (`core/equipment.js`/`equippedTags`) : union des tags de chaque objet
  ÉQUIPÉ, même principe que `gaitOf` juste en dessous. UNIFIÉ
  joueur/compagnon/PNJ — la fonction ne connaît que la FORME `equipment`
  (`{ <slot>: <entrée>|null }`), jamais le type de porteur ;
  `equippedTags(session.equipment)` pour le joueur,
  `equippedTags(entity.equipment)` pour tout futur compagnon/PNJ équipé,
  aucun cas spécial. Condition `hasEquipmentTag` (voir `doc/scripting.md`/
  "Conditions") : lit `context.playerEquipment` — TOUJOURS l'équipement du
  JOUEUR (`equippedTags(session.equipment)`), jamais celui d'une
  entité-cible.
- **Gait DU JOUEUR — DÉRIVÉ, jamais stocké** (`core/equipment.js`/`gaitOf`) :
  contrairement à une ENTITÉ (`gait` figé dans son archétype/instance, voir
  "Surfaces de sol et son de pas" plus bas), le gait du joueur n'est écrit
  NULLE PART — `gaitOf(equipment)` le recalcule à CHAQUE pas
  (`view/audio/city-scene.js`/`playFootstep`) : l'objet équipé au slot
  "feet" porte-t-il un gait ? oui -> ce gait ; slot vide -> `"barefoot"`
  (défaut). Conséquence directe de la dérivation, PAS un mécanisme séparé :
  équiper/déséquiper change le pas SUIVANT automatiquement, sans
  notification ni code de synchronisation — `entities/player.js` ne porte
  plus aucun gait en dur (voir son commentaire, avant l'introduction de ce
  système).
- **Actions "Équiper"/"Déséquiper"** — même menu d'actions par objet que
  "Poser" (voir "Sac d'objets" plus haut) : un objet `equippable` gagne
  "Équiper" À CÔTÉ de "Poser" dans l'onglet Sac ; un slot OCCUPÉ (onglet
  Équipement) porte "Déséquiper". Équiper un slot déjà occupé -> ÉCHANGE
  (l'ancien occupant retourne au sac), jamais un écrasement silencieux ni
  un refus. Un slot VIDE n'ouvre PAS de menu d'actions (rien à y faire) :
  l'activer annonce juste "Emplacement vide."
- **Interface à trois onglets** (`view/menus/inventory-menu.js`) — UN SEUL
  écran réel sur la pile, trois portes d'entrée ("i" -> Sac, "q" ->
  Équipement, "m" -> Améliorations, voir `doc/scripting.md`/"Améliorations")
  et Tab/Maj+Tab pour parcourir les onglets en cycle une fois ouvert. Le nom de
  l'onglet est TOUJOURS annoncé avant son contenu à la bascule — obtenu
  gratuitement en réutilisant `menu.title` (déjà le nom de l'onglet) et
  l'annonce d'ouverture native de `lib/menu.js`, jamais un second mécanisme
  d'annonce.
- **Persistance** — `session.equipment` traverse la partie comme `bag`/
  `money` (jamais dans un monde). Une sauvegarde ANTÉRIEURE à l'équipement
  est rebouchée VIDE (`core/equipment.js`/`createEmptyEquipment`), JAMAIS
  avec les baskets de départ : ce rebouchage vaut pour une partie DÉJÀ EN
  COURS, pas pour une partie neuve (voir `core/save.js`).

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

### Extensibilité — voir `doc/scripting.md`

Le registre des conditions (`CONDITION_EVALUATORS`), l'aiguillage des effets
(`"presence"`/`"behavior"`, et — hors du tick, à l'activation d'une action —
`"setVariable"`/`"toggleVariable"`/`"addVariable"`) et la marche à suivre pour
en ajouter un vivent ENTIÈREMENT dans `doc/scripting.md` ("Ajouter un type de
condition"/"Ajouter un type d'effet") — jamais recopiés ici.

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

**`behavior: null` — RETRAIT explicite** (au lieu d'un objet behavior) : vide
le comportement actif de l'entité, qui redevient immobile comme si elle
n'en avait jamais eu. Nécessaire pour une entité qui n'a PAS de comportement
de repos vers lequel revenir (voir `npc-resident-home` ci-dessous) : la
condition `"arrived"` reste vraie tant que `behavior.kind` reste `"goto"`
(`entity.gotoArrived` n'est jamais remis à `false` par `core/behaviors/
goto.js`, voir plus bas) — sans un changement de `kind` (vers `"wander"`,
comme `npc-resident`) OU ce retrait explicite, une entité resterait bloquée
dormante pour toujours dès sa PREMIÈRE arrivée, incapable de redevenir
présente au cycle suivant. Validé par `core/scene.js`/`parseEffect` comme
seule valeur spéciale acceptée pour ce champ.

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

**Exemple de référence — l'habitant** (`npc-resident` dans `scenes/demo.json`) :
présent et erre de 8h à 20h ; à 20h, part vers `door-exit` (`"behavior"` ->
`goto`) tout en restant présent (en chemin) ; à l'arrivée (`"arrived"`),
devient dormant ; FILET DE SECOURS à 23h (`"timeRange"` de 23h à 8h) —
dormant QUAND MÊME, qu'il soit arrivé ou non (cible manquante, obstacle, trop
lent : l'INTENTION "il rentre chez lui" reste honorée même sans marche
réelle possible, jamais visiblement coincé) ; au matin (8h), présent +
`"behavior"` -> `wander` de nouveau (nouveau cycle — c'est cette
RÉAFFECTATION à un `kind` différent de `"goto"` qui neutralise la condition
`"arrived"` d'un cycle sur l'autre, voir plus haut). Voir
`core/movement.check.js`, section "Routine complète", pour la vérification
tick par tick d'un cycle équivalent, y compris le cas obstrué et le cas de
cible manquante.

**Le même personnage, deux scènes — DEUX déclarations séparées, sans état
partagé, DEUX cycles inversés** : `npc-resident` (demo1, présent le jour,
ci-dessus) et `npc-resident-home` (`scenes/demo2.json`, présent la nuit — 20h
à 8h) sont deux entités INDÉPENDANTES : un NPC appartient à UNE scène
(contrairement à un compagnon, voir `core/state.js`), la porte qu'il rejoint
n'est que de la couleur narrative ("il rentre chez lui, de l'autre côté") —
jamais une vraie transition d'entité entre scènes, jamais besoin de
synchroniser les deux mondes. `npc-resident-home` suit le MÊME schéma,
inversé et sans comportement de repos (`"aucun"`, contrairement au `wander`
de son double diurne) : présent la nuit (immobile), part vers `door-back` à
8h, dormant à l'arrivée, filet de secours à 11h — via `behavior: null`
plutôt qu'une réaffectation `wander` (voir "Triggers de comportement"
ci-dessus, `behavior: null`).

**Chevauchement ASSUMÉ, pas une garantie de complémentarité stricte** : avec
CES horaires précis (fenêtres de transit 20h-23h ET 8h-11h partagées par les
deux instances), le personnage peut être VISIBLE DANS LES DEUX MONDES À LA
FOIS pendant ces créneaux (ex. `npc-resident` encore en chemin vers
`door-exit` à 21h, `npc-resident-home` déjà présente à demo2 depuis 20h) —
sans état partagé entre les deux déclarations, rien n'empêche
STRUCTURELLEMENT cette simultanéité ; un contenu qui voudrait l'éviter
choisirait des horaires DÉCALÉS (comme l'ancienne version de ce contenu, qui
démarrait la présence nocturne à 21h plutôt que 20h) plutôt qu'exactement
complémentaires. Un état de personnage PARTAGÉ (variables d'instance lues au
chargement des deux scènes, ex. "est-il déjà rentré ?") permettrait une
synchronisation stricte plus tard, SANS refonte : ce système de règles n'a
pas à changer, seul le CONTEXTE qu'on lui passe grossirait (comme `{ time }`
-> `{ time, weather }` plus haut). Délibérément DIFFÉRÉ, pas un oubli —
aucun consommateur n'en a besoin aujourd'hui.

### Triggers horaires — voir `doc/scripting.md`/"Triggers"

Distincts des triggers de COMPORTEMENT ci-dessus (portés par une règle de
présence, réévalués au tick) : `entity.triggers` déclare des EFFETS D'ACTION
(`playSound`, `setVariable`...) exécutés au FRANCHISSEMENT d'une heure — à
chaque heure, ou à une heure précise — par `core/triggers.js`, sur les DEUX
faces du monde actif. Une entité DORMANTE ne tire pas (même règle que le
comportement). Un `playSound` déclenché ainsi est DIÉGÉTIQUE, positionné sur
l'entité : depuis l'autre face il s'entend étouffé, par la chaîne
d'occlusion ordinaire (voir "Recto/verso"). Premier client : la cloche du
clocher (`scenes/town-square.json`, recto seulement). Grammaire, sauts de
temps, portée : `doc/scripting.md`/"Triggers".

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

### Son de ramassage

`sounds.pickup` (optionnel) : rôle PONCTUEL joué quand l'entité est
RAMASSÉE ou LOOTÉE (`"pickup"`/`"loot"`, voir `doc/scripting.md`/"Actions"),
DÉCLARÉ par l'archétype de l'objet (`entities/types/apple.js`, `coin.js`,
`money.js`) et
cascadé instance -> archétype comme tout rôle de `sounds` — SANS défaut : un
objet qui ne le déclare pas se ramasse en silence, l'annonce suffit
(`entities/types/item.js`, `crate.js` aujourd'hui). Plus aucun son de
ramassage générique imposé par le système ("tout son est déclaré, jamais
imposé"). Rendu DIÉGÉTIQUE par le même chemin qu'un effet `"playSound"`
(`view/interaction.js`/`playEntityPickupSound` -> `runPlaySoundEffect`,
positionné sur l'entité, filtres de scène), joué AVANT le retrait de
l'entité — tant qu'elle a encore une voix dans la scène. Même descripteur
qu'un `"playSound"` (`{ path, gain?, pitchVariation?, reverbSend? }`).

## Vocabulaire de sons

Un descripteur de son est un objet plat :

```js
{ path, loop, reverbSend?, beaconMode?, beaconInterval?, beaconIntervalVariation?, beaconGain?, vocalInterval?, vocalIntervalVariation?, vocalGain?, pitchVariation?, tracked? }
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

## Cascade de sounds — fusion profonde, instance -> archétype

`sounds` cascade instance -> archétype (`core/scene.js`/`parseEntity`,
`entity.sounds` déjà RÉSOLU sur l'entité parsée — la vue, voir
`view/audio/city-scene.js`/`buildEntitySoundEntry`, lit `entity.sounds`,
jamais `registry[type].sounds` directement) — mais PAR FUSION PROFONDE
(`deepMergeOverride`, `core/scene.js`), SEUL champ cascadé de cette façon :
contrairement à `nameKey`/`blocksMovement` (remplacement simple, tout ou
rien) ou `tuning` (transport brut, jamais interprété par le core), une
instance ne déclare QUE ce qu'elle CHANGE — le reste du rôle, et les autres
rôles, restent HÉRITÉS de l'archétype.

```json
// entities/types/X.js : sounds: { beacon: { path: "a", gain: 0.5, reverbSend: 0.5 } }
{ "id": "x1", "type": "X", "sounds": { "beacon": { "gain": 0.8 } } }
// -> entity.sounds.beacon = { path: "a", gain: 0.8, reverbSend: 0.5 }
```

**TROIS états, à ne jamais confondre** (récursifs — s'appliquent à n'importe
quel niveau : un rôle entier, ou un champ À L'INTÉRIEUR d'un rôle) :

- **ABSENT** (la clé n'apparaît pas dans `sounds` à l'instance, ou le champ
  n'apparaît pas dans le rôle déclaré) -> HÉRITE tel quel de l'archétype.
  Une instance qui ne déclare `sounds` nulle part hérite donc TOUT,
  inchangé — comportement STRICT rétrocompatible pour tout contenu
  existant.
- **Déclaré en OBJET** -> FUSIONNE récursivement avec l'équivalent de
  l'archétype : chaque champ présent dans l'objet SURCHARGE, chaque champ
  absent reste HÉRITÉ. S'applique aux RÔLES (`beacon`/`vocal`/`movement`)
  ET, à l'intérieur d'un rôle, à SES champs (`path`/`gain`/`pitchVariation`/
  `reverbSend`...).
- **Déclaré à `null`** -> RETIRE ce palier pour cette instance — n'hérite
  PAS, disparaît purement et simplement. `"sounds": { "beacon": null }`
  retire le beacon d'UNE instance (les autres rôles, `vocal`/`movement`,
  restent hérités intacts si l'archétype en porte) — c'est ainsi qu'on
  rend un passage MUET (voir `entities/types/passage.js`) : plus besoin
  d'un second archétype dupliqué pour cette seule différence.

Une valeur TERMINALE (chaîne — même un chemin de pool —, nombre, tableau)
REMPLACE toujours entièrement celle de l'archétype, jamais de fusion à ce
niveau : un `path` n'a pas de sens "fusionné" avec un autre.

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

### Beacon conditionnel

`sounds.beacon.condition` (optionnel) : une condition du script (même forme
et même évaluateur que `action.condition`, voir `doc/scripting.md`/
"Conditions") qui décide si le beacon SONNE. Fausse : la balise se tait ;
redevenue vraie : elle reprend. L'entité reste présente, observable et
interactive : seul son beacon est concerné (contrairement à la présence
conditionnelle, qui rend l'entité dormante).

On ne « change » jamais un beacon par effet : une action modifie l'ÉTAT
(une variable, en général), et le beacon suit cet état. L'état étant
sérialisé, une partie rechargée retrouve le bon son sans rien rejouer.

**Exemple réel — le vidéoprojecteur** (`entities/types/video_projector.js`) :
beacon soumis à la variable d'entité `isOn`, deux actions candidates aux
conditions opposées qui jouent `switch_off`/`switch_on` et basculent `isOn`.
Chaque instance déclare sa propre `isOn` (une variable ne cascade jamais
type -> instance), avec la valeur de départ voulue :

```js
sounds: {
  beacon: { path: "assets/sounds/furniture/video_projector_1_beacon", loop: true,
            condition: { type: "variable", scope: "entity", name: "isOn", equals: true } },
},
```

```json
{ "id": "video_projector_1", "type": "video_projector", "x": 3,
  "variables": [{ "name": "isOn", "type": "flag", "initial": true }] }
```

Règles :
- **Validation au chargement** (`core/scene.js`/`parseEntity`), comme une
  condition d'action : type inconnu ou variable non déclarée -> erreur.
- **Une condition est un tout** : celle d'une instance REMPLACE celle de
  l'archétype, jamais fusionnée clé par clé comme le reste de `sounds`
  (voir "Cascade de sounds"). `condition: null` à l'instance la retire.
- **Évaluée à chaque tick** par la vue (`view/audio/city-scene.js`/
  `beaconConditionAllows`) contre l'entité VIVANTE : le changement s'entend
  dès le tick qui suit l'action. Coupure et reprise sont franches
  (`stop()`/`resume()`, même geste qu'une bascule de présence) : le son de
  l'interrupteur joué par l'action couvre la transition.
- **Continu ou intermittent** : un beacon intermittent dont la condition est
  fausse ne déclenche plus rien, sa cadence est gelée comme celle d'une
  entité dormante.
- **Partout où un beacon peut sonner** : reprise après un menu, balises
  temporaires du croisement recto/verso — une balise éteinte reste éteinte.
- **Beacon seulement** : le `vocal` n'a pas de condition aujourd'hui (aucun
  cas concret), ce serait la même mécanique le jour où il en faut une.

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
- **`tracked`** — rôles INTERMITTENTS seulement (`vocal`, `beacon` en mode
  `"intermittent"`), booléen, défaut `true` : chaque son joué reste SUIVI
  pendant sa lecture (pan, volume et passe-bas de distance, occlusion de face
  et perception réévalués à chaque tick, facteur et passe-haut de hauteur
  `isFlying` conservés). `false` : spatialisé une fois au départ puis figé
  (événement ponctuel « qui s'est produit là »). Lu sur le descripteur du rôle
  seulement, jamais cascadé. Même sémantique que le `tracked` de l'effet
  `playSound` (voir `doc/scripting.md`/"playSound"). Sans objet pour la balise
  continue (suivie par nature) et pour les pas (toujours ancrés).
- **`beaconMode`** — mode de lecture DU BEACON UNIQUEMENT (le vocal n'en a
  pas, voir "Beacon vs vocal" plus haut : toujours intermittent), une valeur
  parmi deux littéraux : `"continu"` (une boucle positionnée permanente,
  maintenue et mise à jour à chaque tick — pan, volume, passe-bas) ou
  `"intermittent"` (rejouée en son PONCTUEL positionné, à intervalles — voir
  `beaconInterval`/`beaconIntervalVariation`). Un son intermittent n'a PAS
  de passe-bas dépendant de la distance (voir "Ce qui n'est PAS un
  paramètre sonore") : trop court pour qu'un filtre continu ait un sens.
  **Durée minimale du fichier, mode `"continu"` — CONTRAINTE DE CONTENU
  CONFIRMÉE :** un fichier de balise continue trop court (constaté sous
  ~1,5 s) peut, selon le navigateur, cesser de boucler après UNE seule
  lecture — silence permanent, sans erreur console. Cause précise non
  isolée avec certitude (probablement liée à la fréquence de réarmement
  d'un mécanisme interne à Howler, plus un fichier est court, plus il se
  réarme souvent — voir le filet de sécurité ci-dessous), mais le
  CORRECTIF EMPIRIQUE, confirmé en conditions réelles (`glass_window`,
  `scenes/town-square-town-hall-main.json`), est net : rallonger le fichier
  au-delà de ce seuil (silence ajouté en fin de fichier si le son lui-même
  est bref) fait disparaître le symptôme. **Règle de contenu à respecter
  pour toute NOUVELLE balise `"continu"` : viser au moins ~1,5 s, quitte à
  padder de silence.**
  **Filet de sécurité anti-blocage** (mode `"continu"` uniquement, voir
  `lib/audio.js`/`createPositionedSound`/`isStuck()`) : Howler (vendor
  v2.2.3) boucle nativement une balise continue, mais tient en parallèle une
  chaîne de `setTimeout` interne qui se réarme à chaque tour pour sa propre
  comptabilité — un seul maillon manqué (dépendant du navigateur) casse
  cette chaîne pour de bon, sans exception, et la balise peut alors rester
  silencieuse indéfiniment. N'A PAS suffi à corriger le cas ci-dessus
  (`howl.playing()` restait vrai malgré le silence réel — la panne se situe
  plus profondément que ce que Howler expose en JS), mais reste en place
  comme filet pour tout AUTRE cas où `playing()` refléterait correctement
  l'arrêt. `applyEntityAudio` (`view/audio/city-scene.js`) détecte ce cas à chaque
  tick (`sound.isStuck()`) et relance la voix — un filet, pas un correctif
  du mécanisme Howler en cause.
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
- **`staggerBeacon`** — booléen, défaut `true`. OPT-OUT du désempilement
  d'attaques (voir "Désempilement d'attaques" plus bas) : `false` fait
  démarrer CETTE balise précisément, sans le léger délai aléatoire appliqué
  par défaut à tout démarrage groupé.
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

### Désempilement d'attaques

Toute balise CONTINUE nouvellement créée (voir `view/audio/city-scene.js`/
`buildEntitySoundEntry`) dont `staggerBeacon` reste `true` voit son
DÉMARRAGE (pas son volume, voir plus bas) retardé d'un court délai aléatoire
— `[beaconStaggerMinMs, beaconStaggerMaxMs]`, `config/tuning-values.js`
(20-180 ms par défaut) — pour désempiler l'attaque de plusieurs balises qui
démarreraient sinon toutes dans la même fenêtre :

- **Deux démarrages GROUPÉS aujourd'hui** : le montage d'une scène (toutes
  les balises initiales créées dans la même boucle) et un spawn GROUPÉ
  d'éphémères (voir "Spawn déclenché par une action" plus bas — plusieurs
  entités découvertes par `syncNewEntitySounds` au même tick). Les DEUX
  passent par `buildEntitySoundEntry`, la MÊME fonction — un seul mécanisme,
  jamais dupliqué entre les deux situations.
- **Appliqué INDISTINCTEMENT**, jamais seulement si "plusieurs à la fois"
  sont détectées : pas de logique de regroupement à maintenir, et un délai
  isolé de quelques dizaines de ms sur une balise seule reste imperceptible
  — la simplicité l'emporte sur une détection inutilement fine.
- **Retarde le DÉMARRAGE réel, pas le volume** (`lib/audio.js`/
  `createPositionedSound`, option `startDelayMs`) : le volume d'une balise
  reste à 0 tant qu'`applyEntityAudio` ne l'a pas calculé de toute façon
  (voir plus bas dans `view/audio/city-scene.js`) — retarder SEULEMENT le
  volume révélerait la voix en cours de boucle, après que son attaque (t=0)
  soit déjà passée silencieusement, ratant l'effet recherché. Retarder
  `howl.play()` lui-même fait tomber l'attaque RÉELLEMENT au moment décalé.
  COURT délibérément : un désempilement d'attaques, jamais un fondu
  d'apparition — une scène doit se sentir présente d'emblée, pas "s'allumer
  une par une".
- **Annulation propre** : si l'entité disparaît ou devient dormante AVANT la
  fin de son délai, `stop()` (déjà appelé dans ces deux cas, voir
  `cleanupRemovedEntities`/`muteConsumedBeacons`/`applyEntityAudio`)
  ANNULE le démarrage différé (timer explicitement annulé, jamais un simple
  drapeau ignoré) — jamais de son fantôme qui partirait quand même après
  coup. Aucun changement requis dans `view/audio/city-scene.js` pour ça :
  TOUT appel existant à `sound.stop()` en bénéficie automatiquement, la
  garantie vit dans `lib/audio.js`.
- **Jamais un beacon déjà en cours** : ce délai ne s'applique qu'à la toute
  PREMIÈRE mise en son (création de la voix) — une reprise après pause/
  bascule de présence (`sound.resume()`) n'est jamais concernée. Revenir
  dans une scène RECONSTRUIT `entitySounds` de zéro (voir
  `createCityAudioScene`) : un nouveau démarrage groupé, donc un nouveau
  décalage à chaque visite — c'est le comportement voulu, pas une fuite.
- **Purement cosmétique, hors core** : n'affecte ni le ramassage, ni aucune
  règle de jeu, ni le déterminisme de la simulation (voir plus bas) — un
  décalage de quelques dizaines de ms sur QUAND un son devient audible,
  rien de plus.

### Déterminisme et rendu audio

`beaconIntervalVariation`, `vocalIntervalVariation`, `pitchVariation` et le
délai de désempilement d'attaques ci-dessus utilisent `Math.random()`,
jamais le PRNG seedé du core (`core/rng.js`) — même politique pour les
quatre, aucune raison de les traiter différemment. C'est un aléa de RENDU pur,
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
2. `entity.tuning[key]` — l'instance de scène, si elle surcharge (voir
   "Le palier INSTANCE" ci-dessous) ;
3. `registry[entity.type][key]` — le défaut du type ;
4. `defaults[key]` — le défaut global (`config/tuning-values.js`), dernier
   recours.

`entity` et `sound` sont tous deux optionnels et indépendants : un appel peut
ne fournir que `sound` (ex. un réglage propre à un descripteur de son sans
lien avec une instance de scène — c'est le cas du joueur, voir plus bas).

Chaque paramètre sonore listé ci-dessus passe par ce même mécanisme, y
compris ceux peu ou jamais surchargés aujourd'hui — le mécanisme est
générique, rien à étendre pour en ajouter un nouveau. Exemples déjà en place
au niveau ARCHÉTYPE : `entities/types/bird_1.js` (et `bird_2.js`/`bird_3.js`)
surchargent `vocalInterval`/`vocalIntervalVariation` (dans leur
`sounds.vocal`, pour chanter par à-coups plus espacés que le défaut
global) ; `entities/types/dog.js` surcharge les MÊMES paramètres en sens
inverse (dans son `sounds.vocal`, pour aboyer plus souvent que le défaut
global). En dehors de ce cas, `demo.json` ne surcharge aucun de ces
paramètres au
niveau INSTANCE : la résolution retombe alors sur le défaut du type puis sur
le défaut global, exactement comme pour tout paramètre non déclaré.

### Le palier INSTANCE

Une instance de scène (`scenes/*.json`) surcharge un paramètre en cascade via
un champ RÉSERVÉ, `tuning`, un objet plat de clés -> valeurs :

```json
{ "id": "bird-loud", "type": "bird_1", "x": 12, "tuning": { "beaconInterval": 1500, "beaconGain": 1.4 } }
```

`core/scene.js`/`parseEntity` recopie ce champ TEL QUEL (`entity.tuning`) —
validé en FORME (un objet, sinon `fail()`), jamais en CONTENU : le core
ignore tout du sens de ces clés (sonore ou non), il se contente de les
porter jusqu'à l'entité parsée, exactement comme `music`/`ambiences`/
`reverbDurationSec`/`reverbDecay` au niveau de la SCÈNE (voir `doc/scene-format.md`).
Aucune clé nommée en dur dans `parseEntity` : un futur paramètre ajouté à
`config/tuning-values.js` devient surchargeable à l'instance sans jamais
rouvrir ce fichier. `resolveTuning` lit ensuite `entity.tuning[key]` (palier
2) — voir `lib/tuning.js`. Absent, `entity.tuning` est simplement `undefined`
et la résolution retombe sur le palier ARCHÉTYPE, comportement inchangé pour
toute entité qui ne déclare pas `tuning`.

## Surfaces de sol et son de pas

Le sol de la scène (`defaultSurface`/`segments`, voir `doc/scene-format.md`) et
son registre (`core/surfaces.js`, `neutral: true/false` par surface) sont du
CORE pur — ce document-ci ne couvre que ce que la VUE en tire pour choisir
le fichier du son de pas (`view/audio/city-scene.js`,
`resolveFootstepPath`). Deux propriétés d'ENTITÉ, résolues par la MÊME
cascade que les paramètres sonores ci-dessus (`resolveTuning(key, entity)`,
sans `sound` — comme `audibleRange`/`panSaturation` : une propriété de
l'entité, pas d'un rôle de son) :

- **`gait`** — la CHAUSSURE/allure de l'entité (ex. `"heavy_boots"`),
  optionnelle : la plupart des entités n'en ont pas. FIGÉ (archétype ou
  instance, cascade `resolveTuning`) — PAS le gait du JOUEUR, qui n'est
  jamais une propriété résolue de cette façon : voir "Équipement" plus haut,
  `core/equipment.js`/`gaitOf` le DÉRIVE de `session.equipment` à chaque
  pas, jamais stocké nulle part (contrairement à cette propriété d'entité).
- **`naturalWalk`** — le pas NATUREL de l'entité (ex. `"barefoot"`), pour
  une entité qui n'a pas de gait particulier mais un pas qui lui est propre
  malgré tout. PARTAGE le MÊME espace de noms que `gait` (voir plus bas,
  "footsteps/gaits/") — `naturalWalk` peut donc réutiliser tel quel un nom
  de gait déjà existant, PAR CONCEPTION (ex. `"barefoot"`, voir le piège vécu
  ci-dessous), jamais un troisième vocabulaire séparé. Une entité qui porte
  déjà son PROPRE son de déplacement (`sounds.movement.path`, ex. `dog.js`)
  n'a besoin d'AUCUN des deux : ce son propre sert directement de repli,
  voir la résolution ci-dessous.

### La règle : le sol domine, ou l'entité domine — jamais les deux

`resolveFootstepPath` choisit un fichier `"<nom>_walk"` sous
`assets/sounds/footsteps/<catégorie>/` — TROIS sous-dossiers de contenu
(`surfaces/`, `gaits/`, `entities/`, voir `view/audio/city-scene.js`/
`footstepKey(category, name)`), mais DEUX branches de RÉSOLUTION strictement
disjointes selon `neutral` (jamais de croisement surface×chaussure, jamais
de produit cartésien N surfaces × M gaits — chaque cran teste UN nom sous
UNE catégorie, une seule dimension à la fois) :

- **Entité VOLANTE** (`isFlying: true`, ex. `miravi`) — le sol n'a aucune
  prise : la branche SPÉCIALE est sautée, l'entité suit toujours la branche
  NEUTRE ci-dessous (en pratique son son propre, un battement d'ailes),
  quel que soit le sol survolé.
- **Sol SPÉCIAL** (`neutral: false`, ex. `sand`, `snow`) —
  `"surfaces/<surface>_walk"` si ce pool existe : LE SOL DOMINE, le
  `gait`/`naturalWalk` de l'entité est ignoré. Absent -> bascule sur la
  branche NEUTRE ci-dessous (un sol spécial sans son dédié sonne comme un
  sol neutre, jamais comme un silence).
- **Sol NEUTRE** (`neutral: true`, ex. `concrete`, `asphalt`) — L'ENTITÉ
  DOMINE, en cascade : `"gaits/<gait>_walk"` si un gait est résolu ET que le
  fichier existe ; sinon le pas NATUREL — `"gaits/<naturalWalk>_walk"`
  (MÊME sous-dossier que `gait`, jamais `entities/`) si résolu ET existant,
  SINON le son propre de l'entité (`sounds.movement.path`, typiquement sous
  `entities/` pour une créature — ex. `dog_medium_walk` — s'il y en a un) ;
  sinon le PLANCHER GARANTI (le son de pas historique du jeu,
  `gaits/shoes_walk` — jamais vérifié, DOIT toujours exister). Trois crans
  au plus, jamais davantage.

`hasAsset` (`lib/assets.js`) teste l'existence d'un pool SANS lever ni
tirer, contrairement à `resolveAsset` — c'est ce qui permet à
`resolveFootstepPath` d'essayer un cran, constater son absence, et basculer
au suivant sans jamais planter : "ne peut jamais échouer" est une garantie
structurelle, pas une convention.

Exemple : `entities/types/dog.js` et `entities/types/buddy.js` ne déclarent
NI `gait` NI `naturalWalk` — la résolution retombe directement sur le son
PROPRE de l'entité (`sounds.movement.path`, `dog_medium_walk`), sans passer
par les deux premiers crans. **Piège vécu** : `buddy.js` a un temps déclaré
`gait: "heavy_boots"` + `naturalWalk: "barefoot"` pour DÉMONTRER la chaîne
complète, sur l'hypothèse qu'aucun des deux pools n'existait encore — un
pool `barefoot_walk` ajouté PLUS TARD (pour le pas nu-pieds du joueur, sans
lien avec le compagnon) a silencieusement court-circuité cette démo et fait
marcher le chien pieds nus (bug réel, corrigé en retirant les deux champs).
Une valeur `gait`/`naturalWalk` de DÉMONSTRATION (plutôt qu'un vrai choix de
contenu) est donc FRAGILE : elle peut se mettre à matcher un pool ajouté
pour une tout autre raison, sans qu'on y touche — à réserver aux entités qui
ont VRAIMENT un gait/pas naturel distinct de leur son propre, jamais comme
illustration.

## Ce qui n'est PAS un paramètre sonore

Deux catégories voisines, à ne pas confondre avec les paramètres sonores
ci-dessus, même si l'audio en dépend :

- **Le comportement (vitesse de déplacement)** — `behavior.speed`, qui prime
  sur le `speed` de l'entité (voir `doc/scripting.md`/"Allure"), est une
  donnée du CORE : elle détermine à
  quelle vitesse une entité avance, donc indirectement À QUELLE FRÉQUENCE
  RÉELLE son son de déplacement se déclenche (plus vite = plus de distance
  parcourue par tick = pas plus rapprochés dans le temps) — mais aucun
  paramètre sonore ne règle cette fréquence dans l'ABSOLU
  (`movementStepMultiplier` ne fait que multiplier la CADENCE PAR DISTANCE,
  jamais indexée sur le temps). Régler l'allure d'une entité, c'est déclarer
  ou ajuster son `behavior` à l'instance (voir `doc/scene-format.md`), jamais un
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

## Surlignage audio de proximité

`highlight` (booléen, cascade instance -> type -> défaut `false`, résolu par
`resolveTuning("highlight", entity)` comme `gait`/`naturalWalk` — voir
"Résolution en cascade") gouverne le SAUT de volume vers `fullVolume` quand
une entité est à portée d'interaction (`dist <= interactRange`) — voir
`volumeForDistance`, `view/audio/city-scene.js`. EXPLICITE et INDÉPENDANT de
`observable`/`interactable` : une entité n'est surlignée QUE si elle (ou son
archétype, ou son instance via `tuning.highlight`) déclare `highlight: true`,
jamais un effet de bord d'une autre capacité. Décor et ambiance (`decor`,
`fountain`, `rock`, `river`, `neon`, créatures...) ne le déclarent pas — hors
zone comme dans, leur volume suit le même plancher continu que tout le monde
(`farVolumeMax` à `dist=0`, décroissance linéaire vers 0 à `audibleRange`,
JAMAIS de plateau/saut). Aujourd'hui déclaré sur les portes, PNJ, passages et
objets/collectibles (`door`/`npc`/`object`/`item`/`money`/`apple`/`crate`/
`passage`/`window`) : ce que le joueur a besoin de repérer précisément.

SAUT INSTANTANÉ, PAS de rampe : `dist <= interactRange` fait passer le
volume DIRECTEMENT à `fullVolume`, sans transition — même mécanique que
l'ancien comportement (avant l'introduction du flag `highlight`), désormais
GOUVERNÉE par ce flag plutôt qu'appliquée à toute entité sans distinction.
Une version rampée (montée/descente progressives) a été essayée puis
abandonnée : à l'oreille, en marchant/courant normalement, la fenêtre de
présence dans `interactRange` est trop courte pour laisser une rampe même
courte (quelques dizaines de ms) se terminer — le pic ne s'entendait alors
quasiment jamais, une régression nette par rapport au saut net d'origine.

## Les sous-types sont des PRESETS, pas une hiérarchie

Chaque archétype (un fichier sous `entities/types/`, rassemblés par
`entities/types/index.js` — liste EXHAUSTIVE toujours à jour là, jamais
recopiée ici) est un objet plat **indépendant** — il définit l'intégralité
de ses propriétés. Il n'y a ni héritage, ni classe de base, ni "entité
générique" dont les autres dériveraient : ajouter un type, c'est ajouter un
fichier autonome au dossier, jamais étendre une chaîne de prototypes.
Cohérent avec l'anti-ECS et l'anti-hiérarchie-de-classes de `CLAUDE.md`.

`bird` (beacon `"intermittent"`) et `fountain` (beacon `"continu"`, le
défaut) illustrent ce même principe appliqué à `beaconMode` : deux PRESETS
indépendants, chacun choisissant son propre mode, sans partager de code de
résolution particulier — la même cascade générique s'applique aux deux.
`dog` (beacon + vocal + movement), `hound` (vocal seul) et `npc` (beacon +
vocal) illustrent la même chose pour la COMPOSITION LIBRE des rôles de son
positionné (voir "Beacon vs vocal" plus haut) : chaque archétype déclare
juste ce dont il a besoin, rien de plus.

## Verticalité — par sous-scènes, pas par axe Y

Pas de champ ni de mécanique dédiés : "monter" (ex. accéder aux toits
au-dessus de la rue) se fait comme tout autre changement de scène — une
sous-scène (`scenes/*.json` séparé) reliée par une entité interactable dont
l'effet `"teleport"` y mène, un "escalier"/une "échelle" jouant exactement
le rôle d'une `door` (voir `doc/scripting.md`/"Effets d'action"/`"teleport"`). Le mécanisme de
transition de scène déjà en place couvre entièrement ce besoin — aucun axe Y
discrétisé, aucun palier actif à maintenir, aucun système supplémentaire à
construire. (Un ancien champ de scène, réservé pour un axe Y jamais
implémenté, a été retiré comme code mort — voir `doc/scene-format.md`.)

## Recto/verso — deux faces d'une scène, isolées, qui coexistent

Voir CLAUDE.md/"RECTO/VERSO", `doc/scene-format.md`/"Scène à deux faces
(recto/verso)" pour le contrat JSON complet, `doc/scripting.md`/
`"switchSide"` pour le format d'action. Une scène PEUT avoir deux faces
(recto/verso) au lieu d'une seule, chacune son propre ensemble d'entités sur
la MÊME longueur d'axe x — deux espaces PHYSIQUEMENT DISJOINTS qui partagent
seulement cet axe. `entities/types/passage.js` est l'archétype du point de
bascule entre les deux (une ruelle, une porte dérobée, un trou dans la
palissade...) — GÉNÉRIQUE comme `door`, sans propriété propre au-delà des
capacités d'interaction : `action.arrivalX` (le point d'arrivée sur l'autre
face) est TOUJOURS fourni par l'instance, jamais par l'archétype, puisqu'il
dépend entièrement de la géométrie de la scène.

Le joueur porte `player.side`, TOUJOURS remis à `"recto"` en entrant dans le
monde par une porte (comme `playerStart`) ; basculer via un `passage` reste
dans le MÊME monde (`core/state.js`/`switchSide`), jamais un `travelToWorld`.

**Coexistence, ISOLÉE (étape 2/2)** : LES DEUX faces tiquent à chaque tour
(`core/reduce.js`/TICK) — fini le gel de l'étape 1. Mais une face reste un
espace fermé pour tout ce qui est spatial/logique :
- **Collision** : une entité ne heurte QUE les entités/le joueur de SA
  PROPRE face (`core/physics/overlap.js`/`resolveEntityOverlaps`, la même
  passe entité-vs-entité que pour une face simple, jamais combinée entre
  faces). Se tenir au même x qu'une entité de l'autre face -> aucun contact,
  on passe "à travers" (un autre plan).
- **Ciblage de comportement** (`follow`/`goto`) : `getTargetPosition` d'une
  face ne résout QUE ses propres entités — "player" y reste INTROUVABLE si
  le joueur est sur l'AUTRE face (jamais résolu par convention, voir
  `core/reduce.js`) : un compagnon ou un PNJ ne vise donc jamais une cible
  de l'autre face, pas même le joueur.
- **Interaction et occupation** : scopées à la face COURANTE (celle du
  joueur) — les entités de l'autre face n'apparaissent JAMAIS dans
  `getInteractionCandidates`/l'annonce d'occupation (voir
  `view/audio/city-scene.js`), même à portée sur l'axe x.
- **PRNG** : chaque face garde son propre `rngState` (déjà distinct depuis
  l'étape 1, voir `createFaceState`) — déterminisme préservé, aucune
  interférence entre les deux flux.

**Seul le SON traverse** — voir `view/audio/city-scene.js` : les entités de
l'AUTRE face sont rendues en ÉTOUFFÉ (passe-bas + atténuation de gain,
profil `faceMufflingLowpassHz`/`faceMufflingGain`, `config/tuning-values.js`
— distinct du profil de perception surnaturelle), toujours
DIRECTIONNELLES (même pan/distance dérivés de leur x que d'habitude) — sauf
leur BEACON, jamais construit pour l'autre face EN JEU NORMAL
(`includeBeacon:false`) : on DEVINE la présence de l'autre face, on ne la
LOCALISE jamais. Au basculement de face, normal et étouffé s'inversent —
ANIMÉ par un SAS (jeu gelé, voir `view/city-screen.js`/`sideSwitchEffect`) :
un CROISEMENT DE FILTRES (`view/audio/city-scene.js`/`crossfadeFaceSwap`)
ferme le filtre de la face quittée pendant qu'il ouvre celui de la face
rejointe, les deux restant AUDIBLES tout du long (pas un fondu vers le
silence). Pour porter ce croisement, `crossfadeFaceSwap` construit des
balises TEMPORAIRES pour les beacons continus de l'autre face — SEULE
exception à `includeBeacon:false`, bornée à la durée du sas et détruite à
sa fin (jamais persistée) : l'invariant "on ne localise jamais l'autre
face" reste vrai en dehors de cette fenêtre. Le croisement terminé, la
scène audio est reconstruite (comme avant ce mécanisme), sans effet
audible puisque le son y est déjà.

**Pas du joueur pendant la transition** (voir
`view/audio/city-scene.js`/`playTransitionSteps`/`playArrivalStep`,
`view/city-screen.js`/`sideSwitchEffect`) : un passage `interactable`
PHYSIQUE se traverse à pied — `transitionSteps` (booléen, cascade instance
-> archétype -> défaut `true`, comme `highlight`) joue par défaut des pas
DU JOUEUR pendant le sas, en DEUX temps distincts, jamais un flou
mi-trajet-mi-arrivée :

- **Trajet**, cadencé sur `transitionStepIntervalMs`
  (`config/tuning-values.js`) EN PARALLÈLE du croisement de filtres — sur la
  surface déclarée par `transitionSurface` (nom de surface, cascade comme
  `transitionSteps`) SINON celle de la face de DÉPART.
- **Arrivée**, UN SEUL pas, joué APRÈS `switchSide` — sur la surface RÉELLE
  du point d'atterrissage (`surfaceAt`, comme un pas normal), pour un
  contraste net si elle diffère de celle du trajet (ex. pavé -> herbe).

Les DEUX sont des sons **MÉTA** (voir `doc/scripting.md`/"playSound", même
vocabulaire diégétique/méta) : ils représentent le joueur, pas une des deux
faces — jamais de bus de réverb, jamais de rampe d'occlusion, jamais de
`entityLayer` (`lib/audio.js`), audibles NETS quel que soit l'état
d'étouffement des faces pendant le croisement. `transitionSteps: false` (un
futur passe-miroir, par exemple) désactive les deux d'un coup — silence
total côté pas, seuls le son de passage (s'il y en a un, voir plus bas) et
le croisement de filtres demeurent.

**Son de franchissement** (voir `view/city-screen.js`/`playSideSwitchSound`)
— DÉCLARABLE, ABSENT par défaut : `transitionSound` (chemin/pool résolu via
`resolveAsset`, cascade instance -> archétype -> défaut ABSENT, comme
`transitionSurface`) est un choix de CONTENU par passage, jamais un son
générique imposé à chaque franchissement. Un passage qui n'en déclare
aucun (à l'instance via `tuning.transitionSound`, ou à l'archétype) transite
en SILENCE côté son de passage — les pas de trajet/arrivée ci-dessus jouent
quand même, DEUX choses sonores INDÉPENDANTES qui se composent, jamais
mélangées (voir `demo3.json`, `alley_gap_recto`/`alley_gap_verso`, pour un
exemple de déclaration).

## `isFlying` — hauteur SUGGÉRÉE par le son, jamais un axe Y

Booléen d'entité (`core/scene.js`, cascade instance -> archétype -> `false`,
même patron que `observable`/`interactable`) : marqueur PUR, aucune logique
dans le core (pas de position verticale, pas de palier — voir "Verticalité"
ci-dessus, qui reste l'unique façon de vraiment CHANGER d'altitude). Lu
UNIQUEMENT par la vue (`view/audio/city-scene.js`) pour faire passer les
sons de l'entité par une CHAÎNE DE FILTRES qui évoque l'altitude à
l'oreille, sans jamais la simuler : passe-haut (retire le grave, son plus
fin/aérien), envoi de réverb plus généreux (ouverture, ciel) et légère
atténuation de volume (composée avec la distance, jamais à sa place). Les
trois valeurs vivent dans `config/tuning-values.js` (`flyingHighpassHz`,
`flyingReverbSend`, `flyingVolumeFactor`) — résolues comme tout paramètre
sonore (cascade son -> instance -> archétype -> ce défaut), pensées comme un
bac à sable de réglage plutôt qu'un effet figé.

Couvre les DEUX modes de beacon (voir "Paramètres sonores" plus haut) :
intermittent (`lib/audio.js`/`playOneShot`, nouveau paramètre `highpassHz`
optionnel, chemin STRICTEMENT inchangé sans lui) et continu
(`lib/audio.js`/`createPositionedSound`, nouvelle méthode `setHighpass`, en
série APRÈS le passe-bas de distance déjà existant). Aucune entité
non-`isFlying` n'appelle jamais ces nouveaux chemins : comportement
STRICTEMENT inchangé pour tout contenu existant.

**Exemple de référence** — `bird_1` (`entities/types/bird_1.js`,
`scenes/demo.json`, instance `bird_1`) : VOCAL SEUL, aucun beacon (même choix
que `hound`, voir "Beacon vs vocal" plus haut), pool DÉDIÉ `bird_1_vocal`,
interval/variation surchargés pour un chant largement espacé. `isFlying:true`
y suffit à lui seul, quel que soit le rôle de son porté (beacon OU vocal) —
aucune autre déclaration nécessaire.

## Le joueur : même modèle, mais AUDITEUR

`entities/player.js` porte un descripteur de contenu qui suit le même
vocabulaire (`sounds.movement`), mais le joueur **n'est pas une entité** au
sens de la scène :

- Il n'apparaît **jamais** dans `scene.entities`.
- Il n'a ni `id`, ni `type`, ni `x` dans son descripteur — sa position vient
  de `session.player.x` (l'état du core), pas d'une instance de scène.
- La scène audio (`view/audio/city-scene.js`) ne crée **aucune voix
  positionnée** pour lui : sa position sert uniquement d'ORIGINE, celle par
  rapport à laquelle chaque entité calcule sa distance/son pan. Le joueur
  est celui qui écoute, pas quelque chose qu'on écoute depuis ailleurs.

Le son de pas (`movement`, ponctuel) est l'exception qui confirme la règle :
il est joué par `playOneShot`, centré (aucun pan), pas par une voix
positionnée maintenue comme une balise d'entité.
