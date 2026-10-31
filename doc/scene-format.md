# Format de scène

Contrat de référence pour les fichiers `scenes/*.json`, tel qu'implémenté par
`core/scene.js` (`parseScene`). Un fichier de scène est un objet JSON déjà
parsé, sans aucune chaîne affichable en dur — uniquement des clés i18n.
Ce document couvre la FORME JSON (quels champs, quel type, quels filets) ;
la GRAMMAIRE des conditions/effets/actions/variables qu'un fichier peut
déclarer (`when`, `action.condition`, `variables`...) vit dans
`doc/scripting.md`, jamais dupliquée ici.

## Scène

**Parsing TOTAL** : `parseScene` accepte `{}` — TOUS les champs de scène sont
optionnels et retombent sur un défaut sensé s'ils sont absents ; seule leur
PRÉSENCE malformée (mauvais type, valeur hors contrainte) échoue clairement.
`parseScene({})` produit donc une scène VALIDE et JOUABLE : sans entité, plat,
surface uniforme, longueur minimale traversable, titre générique, silence
(pas de musique/ambiance) — le joueur y apparaît et s'y déplace sans que rien
ne plante (rendu, tick, audio, interaction, sauvegarde). Vaut aussi pour une
FACE recto/verso vide (`parseFace`, même mécanisme).

**Champs inconnus REJETÉS** : optionnel ne veut pas dire libre. À chaque
niveau (racine de scène, face, segment, plage de collecte, entité, `shop`,
`container`, `display`, `sounds` et ses descripteurs, `tuning`, et tout le format
déclaratif — voir `doc/scripting.md`), un champ que le format ne connaît pas
fait échouer le chargement en le nommant (`parseScene: entities[0] ("dog-1") : champ(s)
inconnu(s) "observabel".`) — une faute de frappe retomberait sinon en
silence sur le défaut du champ visé. Les listes de champs acceptés vivent
dans le code (`core/scene.js`/`SCENE_FIELDS`, `FACE_FIELDS` ;
`core/entity-parse.js`/`ENTITY_FIELDS`, `SOUND_ROLES`, `SOUND_FIELDS` ;
les clés de `tuning` sont celles de `config/tuning-values.js`) ; les
tableaux de ce document les décrivent. Le registre des types lui-même est
validé au démarrage (voir "Registre de types"). Avant de jouer une scène neuve : `tools/content-audit.js` (voir
`doc/README.md`/"Vérifier le contenu") les charge toutes d'un coup.

| Champ         | Type     | Contrainte                                      |
|---------------|----------|--------------------------------------------------|
| `id`          | string   | optionnel, non vide si présent — **FILET si absent** : repli sur `"scene"` (`DEFAULT_SCENE_ID`) |
| `titleKey`    | string   | optionnel, non vide si présent, clé i18n du titre de la scène — **FILET si absent** : repli sur `"scene.default.name"` (`DEFAULT_SCENE_TITLE_KEY`, "Scène sans nom"/"Unnamed scene") |
| `length`      | number   | optionnel, `> 0` si présent — longueur en unités le long de l'axe x — **FILET si absent** : repli sur `10` (`DEFAULT_SCENE_LENGTH`, petite étendue traversable, jamais `0`) |
| `playerStart` | number   | point d'arrivée PAR DÉFAUT de la scène. **FILET, jamais rejeté** : absent ou hors `[0, length]` -> repli sur `0` (avec un `console.warn`), jamais d'exception. Des points d'arrivée NOMMÉS (ex. par porte) pourront s'ajouter plus tard, sans toucher à ce filet. |
| `entities`    | Entity[] | optionnel — **FILET si absent** : repli sur `[]` (scène sans entité, toujours jouable). Voir ci-dessous pour la forme d'une entité. |
| `music`       | string   | optionnel : musique de la scène — une clé de POOL (plusieurs fichiers, voir `assets/manifest.json`) ou un membre précis, résolue par `resolveAsset` comme tout autre pool. Canal global non spatialisé — voir `view/audio/layers.js`. Par défaut, lue en SÉQUENCE avec respiration (voir "Musique : séquence avec respiration" plus bas), jamais en boucle simple. |
| `musicDay` / `musicNight` | string | optionnels : musique PAR PHASE jour/nuit (voir `core/time.js`/`phaseAt`, "Phase jour/nuit" plus bas), même forme que `music` (pool ou membre précis). Une scène qui n'en déclare aucune des deux retombe sur `music` pour les deux phases. Bascule en cours de jeu par FONDU UNIVERSEL puis respiration puis nouvelle séquence (`view/audio/layers.js`) ; à l'entrée dans une scène, la phase courante joue directement, sans fondu. |
| `musicLoop`   | boolean  | optionnel, défaut `false` : `true` fait jouer la musique de la scène en BOUCLE CONTINUE, sans enchaînement ni respiration — pour les deux phases, un seul drapeau par scène. Voir "Musique : séquence avec respiration" plus bas. |
| `ambiences`   | string[] | optionnel : 0 à `AMBIENCE_CHANNEL_LIMIT` chemins d'ambiance (`assets/ambiances/...`, voir `config/audio-channels.js`), canal global non spatialisé, jusqu'à autant de couches simultanées — voir `view/audio/layers.js` |
| `ambiencesDay` / `ambiencesNight` | string[] | optionnels, même forme que `ambiences` : ambiances PAR PHASE jour/nuit, comme `musicDay`/`musicNight`. La phase qui n'en déclare pas retombe sur `ambiences` ; une liste VIDE déclarée (`"ambiencesNight": []`) veut dire silence à cette phase. Bascule en cours de jeu par fondu (`view/audio/layers.js`), sauf si la liste est la même d'une phase à l'autre. Exemple réel : `scenes/main-street.json` (trafic le jour, rien la nuit). |
| `reverbDurationSec` | number | optionnel, `> 0` : surcharge PAR SCÈNE la durée de la réponse impulsionnelle du bus de réverb (défaut global : `config/tuning-values.js`) |
| `reverbPreset` | string | optionnel : nom d'un préréglage de réverb (`config/reverb-values.js`), résolu au chargement en `reverbDurationSec`/`reverbDecay`/`reverbWet` ; un de ces champs déclaré par la face prime sur le préréglage. Voir "Réverbération" plus bas |
| `reverbDecay` | number | optionnel, `> 0` : surcharge PAR SCÈNE le taux de déclin de la réverb (défaut global : `config/tuning-values.js`). La queue s'éteint en environ `7 ÷ reverbDecay` secondes : garder `reverbDurationSec` assez long pour qu'elle soit retombée d'au moins 50 dB à la coupure (`reverbDecay × reverbDurationSec >= 5,8`) |
| `reverbWet` | number | optionnel, entre `0` et `1` : surcharge PAR SCÈNE le niveau de retour de la réverb, donc sa QUANTITÉ (défaut global : `config/tuning-values.js`). Durée et decay n'en changent que la COULEUR : le navigateur normalise l'énergie de la réverb. Un extérieur se distingue d'un intérieur surtout par une valeur basse (environ 0,1) |
| `defaultSurface` | string | optionnel : nom de surface (voir "Surfaces de sol" plus bas) couvrant tout le `x` non-segmenté. **FILET SILENCIEUX si absent** (repli sur `DEFAULT_SURFACE`, `core/surfaces.js` — comportement audible inchangé pour toute scène qui n'en déclare pas). **Échec clair si fourni mais absent du registre** (comme un type d'entité inconnu) — une référence de contenu erronée n'est jamais dégradée en silence. |
| `segments`    | Segment[] | optionnel : zones qui PATCHENT `defaultSurface` sur des portions de la scène (voir "Surfaces de sol" plus bas). Absent -> `[]`, `defaultSurface` partout. |
| `spawnRanges` | SpawnRange[] | optionnel : PLAGES de collecte au sol (voir `doc/entity-model.md`/"Collecte", `core/spawn.js`) — `{ from, to, count?, distribution }` : bornes comme un segment (`from < to`, dans `[0, length]`), `count` entier `>= 1` (défaut `config/spawn-values.js`/`SPAWN_RANGE_DEFAULT_COUNT`), `distribution` = `{ table: "<nom de SPAWN_TABLES>" }`, `{ items: { <objet ITEM_REGISTRY>: <poids> } }` ou `{ tables: [{ table | items, weight? }, ...] }` (plusieurs tables, voir `doc/entity-model.md`/"Collecte") ; dans toute table, la clé réservée `nothing` est une issue « rien » pondérée (validée au chargement, échec clair). `count` = nombre de TIRAGES : un tirage « rien » ne pose rien. SPARSE : absent -> aucune clé. Champ de FACE (chaque face d'une scène à deux faces déclare les siennes). À chaque cycle quotidien (au CHARGEMENT du monde), `count` collectibles y sont posés à des positions tirées au PRNG seedé — entités RUNTIME marquées `spawned: true`, ramassables via `"pickup"`, remplacées au cycle suivant. |
| `indoor`      | boolean  | optionnel, défaut `false` (extérieur) : propriété de NATURE DE SCÈNE — TOUJOURS résolue en booléen sur une face parsée (comme `defaultSurface`, jamais `undefined`). Aujourd'hui consultée par le rendu d'ambiance météo pour choisir le pool outdoor/indoor de l'état courant (voir `doc/scripting.md`/"weather", `config/weather-values.js`) — délibérément générique, un futur consommateur (réverb, sons ambiants...) pourra la lire aussi sans rien changer ici. |
| `faceMufflingGain` | number | optionnel, **scène à deux faces seulement** (refusé sinon) : facteur de volume (0-1) appliqué à tout son entendu depuis l'AUTRE face — ce qui sépare les deux faces (mur épais, cloison...). Absent -> défaut de `config/tuning-values.js`. Validé en bornes au chargement. |
| `faceMufflingLowpassHz` | number | optionnel, **scène à deux faces seulement** : passe-bas (Hz, > 0) du même étouffement. Absent -> défaut de `config/tuning-values.js`. |
| `variables`   | Variable[] | optionnel : déclarations de portée **"scene"** (voir `doc/scripting.md`/"Variables" pour le modèle complet — nom/type/valeur initiale/persistance). RACINE PARTAGÉE, jamais un champ de FACE (une scène à deux faces n'a qu'UN SEUL sac, commun à recto ET verso). **TOUJOURS résolu** (sac vide `{}` si absent, jamais `undefined`), comme `defaultSurface`/`indoor` — contrairement au sac SPARSE d'une entité (voir tableau "Entité" plus bas). |

## Scène à deux faces (recto/verso)

Une scène est SIMPLE (comme
ci-dessus, `entities`/`music`/... à la racine) OU À DEUX FACES — `recto` ET
`verso` déclarés ENSEMBLE, jamais un seul. `id`/`titleKey`/`length`/
`playerStart` restent TOUJOURS à la racine, PARTAGÉS par les deux faces
(même longueur d'axe x) ; tous les autres champs du tableau "Scène"
ci-dessus (`entities`, `music`/`musicDay`/`musicNight`/`musicLoop`,
`ambiences`/`ambiencesDay`/`ambiencesNight`, `reverbPreset`,
`reverbDurationSec`/`reverbDecay`/`reverbWet`, `defaultSurface`, `segments`, `indoor`, `spawnRanges`) sont des champs de FACE :
déclarés dans `recto`/`verso` pour une scène à deux faces, à la racine pour
une scène simple — **jamais mélangés** : `parseScene` échoue clairement si
un de ces champs apparaît à la racine EN MÊME TEMPS que `recto`/`verso`.

```json
{
  "id": "alley",
  "titleKey": "scene.alley.name",
  "length": 10,
  "playerStart": 1,
  "recto": { "music": "assets/musics/streets_day", "entities": [ /* ... */ ] },
  "verso":  { "music": "assets/musics/mystery",     "entities": [ /* ... */ ] }
}
```

Une scène SIMPLE (ni `recto` ni `verso`) n'a qu'une face, sans bascule
(ex. `demo.json`, `demo2.json`).

**Face courante et bascule** : le joueur porte `player.side`
(`"recto"|"verso"`, défaut `"recto"`), sérialisé avec lui. En entrant dans
une scène à deux faces depuis une autre scène (porte), on arrive TOUJOURS sur
le recto. LES DEUX faces tiquent à chaque tour
(`core/reduce.js`/TICK) — mais ISOLÉES : collision, ciblage de comportement
(`follow`/`goto`), interaction et occupation restent bornés à la face de
l'entité (voir `doc/entity-model.md`/"Recto/verso" pour le détail complet de
cette isolation). "Face courante" ne veut donc pas dire "seule face
active", mais "celle qui porte le joueur/les compagnons ET se rend
normalement" — l'autre se rend en ÉTOUFFÉ (voir "Coexistence audible" plus
bas), jamais gelée. Basculer de face reste DANS le même monde
(`core/state.js`/`switchSide`) — PAS un `travelToWorld` : `activeWorldId` ne
change pas, seuls `player.side`/`player.x` et l'audio de scène (voir plus
bas) le font.

**Point de passage** (`entities/types/passage.js`) : une entité
interactable avec `action: { kind: "switchSide", arrivalX: <number> }` —
`arrivalX` est le point d'arrivée sur l'AUTRE face (comme `x` pour l'effet
`"teleport"` d'une porte, voir `doc/scripting.md`/"Effets d'action", mais on
reste dans le même monde). Une entité par face, chacune
déclarant l'arrivée sur l'autre (voir l'exemple ci-dessous) — jamais une
entité "des deux côtés à la fois". `arrivalX` est validé au chargement
dans `[0, length]` (`core/action-kinds.js`, comme les autres champs
d'action, voir le tableau "Entité" plus bas) ; `core/state.js`/`switchSide`
le borne encore à l'exécution.

```json
{ "id": "gap-recto", "type": "passage", "x": 8, "action": { "kind": "switchSide", "arrivalX": 8 } }
```

**Audio de bascule (VUE)** : un SAS animé (jeu gelé, même mécanisme qu'un
teleport en mode "fade" — voir `view/world-travel.js`/`runTeleportSas`),
mais un geste différent : PAS un fondu vers le silence (rien ne disparaît,
les deux faces coexistent déjà), un CROISEMENT DES DEUX FILTRES D'OCCLUSION
(`view/audio/face-crossfade.js`/`crossfadeFaceSwap`) — la face courante ferme
son filtre (nette → étouffée) pendant que l'autre ouvre le sien (étouffée →
nette), en parallèle, toutes deux restant audibles. Un marqueur sonore de
passage DÉCLARÉ (`transitionSound`, cascade instance -> archétype -> défaut
ABSENT — voir `doc/entity-model.md`/"Recto/verso") joue juste après le gel
s'il y en a un, positionné sur le passage par défaut (`transitionSoundNature`) ; sinon, silence côté son de passage (défensif si le fichier
venait à manquer, même si déclaré). Des pas de trajet/arrivée jouent en
plus, indépendamment (voir `doc/entity-model.md`, même section). Le
croisement terminé, `scene.destroy()` puis reconstruction sur la
nouvelle face active (voir `view/world-travel.js`/`sideSwitch`) —
SANS effet audible : le croisement a déjà amené le son là où la scène
fraîche le poserait.

**Coexistence audible** : dans `core/reduce.js`/TICK, LES DEUX
faces tiquent à chaque tour — l'autre face n'est jamais gelée, mais ISOLATION
STRICTE (voir `doc/entity-model.md`/"Recto/verso") : collision, ciblage de
comportement (`follow`/`goto`), interaction et occupation restent bornés à
la face de l'entité, jamais croisés. Seul le SON traverse : les entités de
l'autre face sont rendues en ÉTOUFFÉ (passe-bas + atténuation de gain,
champs racine `faceMufflingGain`/`faceMufflingLowpassHz` ci-dessous, sinon
`config/tuning-values.js`), directionnelles (même pan/distance que
d'habitude), chaque rôle dosé par son gain "autre face" — par défaut le
beacon n'y est pas entendu (voir `doc/entity-model.md`/"Recto/verso" pour
les réglages par rôle). Au basculement de face, normal et étouffé
s'inversent — c'est ce croisement qui l'anime, plutôt qu'un échange
instantané.

**Persistance** : une scène à deux faces sauvegarde SES DEUX FACES
(entités, rngState, compteur d'éphémères) — `core/save.js` traite un monde à
deux faces comme deux faces indépendantes (purge d'éphémères,
rebouchage `defaultSurface`/`segments`/`nextEphemeralId`). Une sauvegarde
antérieure à ce modèle n'a jamais de `recto`/`verso` (scènes simples
inchangées) ni de `player.side` (rebouché à `"recto"`).

## Segment (surface)

| Champ     | Type   | Contrainte                                                    |
|-----------|--------|------------------------------------------------------------------|
| `from`    | number | `>= 0`, `< to`                                                    |
| `to`      | number | `<= length`, `> from`                                             |
| `surface` | string | doit exister dans le registre de surfaces (`core/surfaces.js`) — **TOUJOURS explicite, aucun filet** : en déclarer un est un choix délibéré, une surface inconnue est une vraie erreur de contenu -> `parseScene` échoue clairement. |

## Surfaces de sol

Toute la scène est couverte par une surface, SANS TROU — c'est un invariant
garanti par construction, pas une validation à part : `defaultSurface`
couvre toute la scène comme une couche de base, les `segments` ne font que la
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
  entièrement à la charge de la VUE (voir `doc/entity-model.md`, "Surfaces de
  sol et son de pas").
- `surfaceAt(world, x)` — nom de la surface au point `x`, TOUJOURS défini
  (segment couvrant, sinon `defaultSurface`), jamais `null`/`undefined`.
  Pure, testable au terminal.
- `surfaceProps(name)` / `surfacePropsAt(world, x)` — propriétés du
  registre pour une surface (dont `neutral`) : le point d'extension
  gameplay futur, un appelant qui voudra lire `speedFactor` demain appelle
  exactement ces fonctions, rien à ajouter au mécanisme.

Aucune mécanique n'exploite encore ce champ au-delà du son de pas (voir
`doc/entity-model.md`) : pas de position Y, pas de ralentissement réel — le
registre est prêt à en accueillir, rien de plus aujourd'hui.

## Réverbération

Trois champs de face (voir le tableau "Scène") : `reverbDurationSec` et
`reverbDecay` donnent la COULEUR de la réverb (courte et serrée, ou longue et
traînante), `reverbWet` sa QUANTITÉ — le navigateur normalise l'énergie de la
réverb, seul `reverbWet` la rend plus ou moins présente. Un extérieur se
distingue d'un intérieur surtout par un `reverbWet` bas.

**Préréglages** : plutôt que de recopier des nombres, une face nomme un type
d'espace avec `reverbPreset`. La liste, avec ce que chaque préréglage
représente et des exemples, vit dans `config/reverb-values.js` (jamais
recopiée ici). Un nom inconnu fait échouer le chargement. Le préréglage est
RÉSOLU au chargement de la scène en ses trois champs ; un champ déclaré par la
face prime sur le sien :

```json
"reverbPreset": "large_hall",
"reverbWet": 0.6
```

Chaque préréglage est vérifié au chargement : couleur complète, et queue
retombée d'au moins 50 dB à la coupure (`reverbDecay × reverbDurationSec >=
5,8`). Une face qui écrit ses propres nombres reste libre, mais une queue
coupée trop tôt s'entend comme une porte qu'on referme sur la réverb.

Exemples réels : `town-square.json` (`open_outdoor` au recto,
`street_outdoor` au verso), `town-square-town-hall-main.json` (`large_hall`),
`clock-tower-main.json` (`stone_tower`). Sans réglage, une face prend le
défaut global de `config/tuning-values.js`, une pièce moyenne.

Une ENTITÉ peut en plus doser sa propre part envoyée à la réverb
(`reverbSend` dans un descripteur de son ou dans `tuning`, voir
`doc/entity-model.md`/"Paramètres sonores") : par exemple une machinerie qui
doit remplir un clocher.

## Phase jour/nuit

`phaseAt(time)` (`core/time.js`, pur, dérivée de l'horloge de partie — voir
`doc/time.md`) renvoie `"day"` ou `"night"` selon l'heure courante
(`dayStartHour`/`nightStartHour`, `config/time-values.js`). Premier
consommateur de l'horloge : `musicDay`/`musicNight` (voir tableau "Scène"
ci-dessus) en tirent la musique de la scène, avec un fondu universel puis une
respiration puis la nouvelle séquence à chaque bascule en cours de jeu
(`view/audio/layers.js`, voir section suivante). `ambiencesDay`/
`ambiencesNight` en tirent les ambiances, par simple fondu croisé. Détail complet de
l'horloge : `doc/time.md`.

## Musique : séquence avec respiration

Par défaut (`musicLoop` absent ou `false`), la musique d'une scène n'est pas
une boucle mais une SÉQUENCE (`lib/audio/music.js`/`startMusicSequence`) : un
morceau joue une fois (`loop:false`), se termine, une PAUSE aléatoire
("respiration" — `musicBreatherMinMs`/`musicBreatherMaxMs`,
`config/tuning-values.js`, ~3 à 8s par défaut) s'écoule en silence complet,
puis un nouveau morceau démarre — tiré du même pool (`music`/`musicDay`/
`musicNight`), SANS répéter immédiatement le précédent si le pool en compte
plusieurs (`resolveAsset`/`pickFromPool`, voir `lib/assets.js` — un pool à
un seul élément rejoue simplement ce même élément).
Recommence indéfiniment tant que la scène reste active.

`musicLoop: true` bascule la scène ENTIÈRE (les deux phases) en boucle
continue à la place — pour une scène qui veut une ambiance ininterrompue (ex. magasin, tension) : aucun enchaînement,
aucune respiration.

**Unification avec la bascule de phase** : une bascule jour/nuit réutilise
EXACTEMENT le même mécanisme de respiration que l'enchaînement naturel
(`lib/audio/music.js`/`switchMusicSequence`) — fondu du morceau courant, PUIS la
même pause aléatoire, PUIS démarrage de la musique de la nouvelle phase.

**Fondu de sortie universel** (`musicFadeMs`, `config/tuning-values.js`,
`lib/audio/music.js`/`fadeOutMusic`) : TOUT arrêt de musique (bascule de phase,
transition de scène) descend en volume avant de s'arrêter, jamais une
coupure sèche. À une transition de scène, la transition elle-même reste
IMMÉDIATE (la scène suivante démarre tout de suite) — seule la musique
sortante fond en arrière-plan, par-dessus le début de la nouvelle scène.
Robuste au chevauchement (une bascule suivie de près d'une transition, par
exemple) : jamais de voix orpheline ni de fondus qui se disputent le canal.

## Entité

| Champ     | Type   | Contrainte                                                    |
|-----------|--------|------------------------------------------------------------------|
| `id`      | string | non vide, unique dans la scène, les DEUX faces confondues (la vue audio rend les deux faces ensemble et repère une entité par son id) |
| `type`    | string | doit exister dans le registre `entities/types/index.js`          |
| `x`       | number | dans `[0, length]`                                                |
| `nameKey` | string | optionnel (npc/object) : clé i18n spécifique à l'instance, forme `<namespace>.name` (ex. `door.club.name`) |
| `descriptionKey` | string | optionnel : clé i18n de description spécifique à l'instance, utilisée par l'interaction "describe" (touche Espace) |
| `consumedDescriptionKey` | string | optionnel : clé i18n de description ALTERNATIVE une fois l'entité `consumed` (voir "Collectible persistant" plus bas et `doc/entity-model.md`). Cascade instance -> type -> absente, comme `descriptionKey` |
| `blocksMovement` | boolean | optionnel : surcharge d'instance, cascade -> défaut du type (`entities/types/index.js`) -> `false` |
| `observable` | boolean | optionnel : idem, candidate à l'interaction "describe" (voir "Interaction (niveau 0)", `doc/entity-model.md`) |
| `interactable` | boolean | optionnel : idem, candidate à l'interaction "activate" |
| `isFlying` | boolean | optionnel : idem (cascade, défaut `false`) — marqueur PUR, aucune logique ici ni ailleurs dans le core (pas d'axe Y). Fait passer les sons de l'entité par une chaîne de filtres qui SUGGÈRE la hauteur, côté vue uniquement (voir "Verticalité" et `isFlying`, `doc/entity-model.md`, `config/tuning-values.js`) |
| `action` | `{ kind, condition?, refusalEffects?, effects?, ... }` OU un TABLEAU de plusieurs objets de cette forme | optionnel : TYPE D'ACTION pour l'interaction "activate", cascade instance -> type comme `behavior`. Validée au chargement, candidate par candidate : `kind` connu du registre (`core/action-kinds.js`/`ACTION_KINDS`), champs propres du kind bien formés, aucun champ inconnu. Objet UNIQUE : une seule action. TABLEAU (non vide) : PLUSIEURS candidates, chacune filtrée par sa propre `condition`, sélection SILENCIEUSE de la première qui matche à l'activation — voir `doc/scripting.md`/"Actions"/"Effets d'action"/"Actions multiples filtrées par condition" pour la grammaire complète (kinds, `condition`/`refusalEffects`, le vocabulaire `effects` — état ET rendu). |
| `descriptionRules` | `{ when, descriptionKey }[]` | optionnel : descriptions CONDITIONNELLES, la première règle vraie donne la description lue à Espace, sinon la description habituelle. Cascade instance -> type, EN BLOC comme `presence`. Voir `doc/scripting.md`/"Descriptions conditionnelles" |
| `presence` | `PresenceRule[]` | optionnel : règles DÉCLARATIVES de présence conditionnelle, cascade instance -> type (voir `doc/scripting.md`/"Règles" pour la grammaire, `doc/entity-model.md` pour la sémantique de dormance). Sans règle (ni à l'instance ni au type) : toujours présente. |
| `triggers` | `Trigger[]` | optionnel : TABLEAU non vide de `{ on: "hour", hour?, effects }` — effets déclenchés au FRANCHISSEMENT d'une heure (à chaque heure sans `hour`, à l'heure `hour` sinon) — ou de `{ on: "emote", emote?, range?, effects }` — effets déclenchés par une émote du joueur à portée —, chacun avec une `condition?` facultative, cascade instance -> type comme `action`. `effects` : même vocabulaire que les effets d'action, effets mixtes (`teleport`) refusés. Grammaire et sémantique (transition, sauts de temps, portée) : `doc/scripting.md`/"Triggers". SPARSE : absent si non déclaré. |
| `startle` | `{ range? }` | optionnel : entité FAROUCHE, qui s'enfuit (devient dormante) quand le joueur passe à `range` ou moins (nombre `> 0`, défaut `config/tuning-values.js`/`startleRange`), et revient au chargement du monde — voir `doc/entity-model.md`/"Entités farouches". Cascade instance -> type, l'instance remplace en bloc ; toute autre clé est refusée. Champ RUNTIME associé, jamais en entrée : `startled` (`true` une fois envolée, retiré au chargement du monde). |
| `variables` | Variable[] | optionnel : déclarations de portée **"entity"** (voir `doc/scripting.md`/"Variables"). PAS de cascade instance -> type (contrairement à `behavior`/`action`/`presence`) : une variable est un compteur/flag D'INSTANCE, jamais un défaut d'archétype. SPARSE : absente si non déclarée (`entity.variables` reste `undefined`), jamais un sac vide imposé. |
| `shop` | `{ catalog }` | optionnel : POINT DE VENTE (voir `doc/entity-model.md`/"Vente et achat", `core/catalog.js`, `core/trade.js`), cascade instance -> type comme `action`. `catalog` : `{ table: "<nom de SHOP_CATALOGS>" }` (`config/shop-values.js`) ou `{ items: { <objet ITEM_REGISTRY>: { stock, price? } } }` — `stock` entier `>= 0` (rayon PAR CYCLE), `price` entier `> 0` optionnel (défaut : `value` de l'objet ; un article sans prix résolvable est rejeté). L'action `"shop"` (voir `doc/scripting.md`) l'exploite. Champs RUNTIME associés, jamais en entrée : `shopStock` (`{ <objet>: n }`, décrémenté aux achats, rechargé au cycle), `shopCycle`. |
| `container` | `{ distribution, count?, regenerates? }` | optionnel : CONTENEUR de collecte (voir `doc/entity-model.md`/"Collecte", `core/spawn.js`), cascade instance -> type comme `action`. `distribution` : même forme que pour `spawnRanges` ci-dessus (`{ table }`, `{ items }` ou `{ tables }`, clé `nothing` permise), validée au chargement ; `count` entier `>= 1` (défaut `config/spawn-values.js`/`SPAWN_CONTAINER_DEFAULT_COUNT`), tirages par cycle ; `regenerates` booléen (défaut `true`) — `false` : garni une seule fois, jamais regarni. Toute autre clé est refusée. L'action `"search"` (voir `doc/scripting.md`) fait tomber le stock au sol. Champs RUNTIME associés, jamais en entrée : `stock` (tableau des objets tirés, éventuellement vide, ou `null` une fois fouillé — un conteneur vidé n'est plus candidat à Entrée que s'il est seul à portée, pour annoncer son état), `stockCycle` (cycle du dernier stock). |
| `display` | `{ distribution }` | optionnel : PRÉSENTOIR du magasin (voir `doc/entity-model.md`/"Présentoirs", `core/display.js`), cascade instance -> type comme `action`. `distribution` : `{ table: "<nom de DISPLAY_TABLES>" }` (`config/shop-values.js`) ou `{ articles: { <article de DISPLAY_ARTICLES>: <poids> } }` — poids nombre ou niveau de rareté, clé `nothing` permise, au moins un vrai article de poids `> 0`. Jamais combiné avec `container` ni `shop`. Toute autre clé est refusée. Champ RUNTIME associé, jamais en entrée : `offer` (id de l'article exposé, `null` une fois vendu ou si rien n'a été tiré, absent avant le premier garnissage). |

`parseScene` normalise chaque entité en ajoutant `labelKey` et
`descriptionKey` : `entity.nameKey` (du JSON) si présent sinon
`registry[type].nameKey` pour le premier ; `entity.descriptionKey` (du JSON) si présent sinon
`registry[type].descriptionKey` pour le second (peut rester `undefined`, ex.
`decor`). Les champs bruts du JSON source une fois résolus (`nameKey`,
`descriptionKey`) ne sont pas reportés tels quels dans l'entité normalisée —
seuls `labelKey` et `descriptionKey` (résolus) sont exposés.

## Présence conditionnelle et triggers de comportement

Une `PresenceRule` : `{ when: <condition>, effects: [<effet>...] }`, ou en
RACCOURCI `{ when: <condition>, present: boolean }` (sans
`effects`), normalisé par `parseScene` en `{ when, effects: [{ type:
"presence", present }] }` — tout consommateur d'une entité PARSÉE ne voit
plus que la forme canonique.

**La GRAMMAIRE complète des conditions/effets (chaque type, sa forme, sa
sémantique, des exemples réels) vit ENTIÈREMENT dans `doc/scripting.md`**,
jamais recopiée ici : ce document-ci ne couvre que ce qui touche le PARSING
JSON — `when.type` doit exister dans le registre de conditions (échec clair
si inconnu, comme un type d'entité) ; les champs propres à un type sont
validés quand une faute ferait échouer la règle EN SILENCE à l'évaluation
(référence de contenu inconnue, bornes, sous-conditions des composites,
validées RÉCURSIVEMENT) — cas par cas dans `core/script-parse.js`/
`validateCondition`, jamais recopiés ici. Détail de CHAQUE type, des effets (`"presence"`/
`"behavior"`), et des RÈGLES (priorité, exemples réels) : `doc/scripting.md`.
Sémantique de la dormance côté entité (les trois plans coupés, la garde
anti-boucle) : `doc/entity-model.md`.

MÊME registre, MÊME validation (`validateCondition`, factorisée dans
`core/script-parse.js`) pour `entities[].action.condition` (voir tableau "Entité"
plus haut) — une condition ne sait pas d'où elle est appelée,
`presence[].when` et `action.condition` partagent exactement ce chemin.

## Collectible persistant

`consumed` (booléen, RUNTIME — jamais un champ d'entrée du JSON de scène,
comme `present`/`gotoArrived`) : marque une entité activée une seule fois via
l'action `"loot"` (voir "Registre de types" plus bas et `doc/entity-model.md`),
posé par `core/state.js`/`markConsumed`, JAMAIS retiré du monde (contrairement
à l'action `"pickup"`, voir `core/money.js`). Deux effets POST-ACTIVATION
composables, DÉCLARÉS par l'entité : `consumedDescriptionKey` (voir tableau
"Entité" plus haut) et/ou une règle de présence sur la condition `"consumed"`
(voir tableau "Présence conditionnelle" ci-dessus) pour devenir dormant.
Détail complet (idempotence, exemples, muteOnConsumed) : `doc/entity-model.md`.

## Collectibles posés par la collecte

`spawned` (booléen, RUNTIME — jamais un champ d'entrée du JSON de scène,
comme `consumed`/`ephemeral`) : marque une entité posée au sol par le moteur
de collecte (`core/spawn.js`, depuis une plage `spawnRanges`, voir tableau
"Scène"). Contrairement à un éphémère, elle est PERSISTANTE (sérialisée,
jamais purgée au départ) : elle reste jusqu'à être ramassée ou remplacée au
cycle suivant. Au niveau du MONDE (racine, partagé par les deux faces),
`spawnCycle` (RUNTIME) mémorise le dernier cycle matérialisé. Détail complet :
`doc/entity-model.md`/"Collecte".

## Entités éphémères

`ephemeral` (booléen, RUNTIME — jamais un champ d'entrée du JSON de scène,
comme `consumed`) : marque une entité créée EN COURS DE JEU via
`core/state.js`/`spawnEphemeral`, jamais déclarée dans un fichier de scène.
Exclue de la sérialisation (`core/save.js`/`serializeGame`) et purgée du
monde au départ (`core/state.js`/`travelToWorld`) — aucune entité éphémère
n'apparaît donc jamais dans un fichier de scène ni dans une sauvegarde.
Limite anti-prolifération : `MAX_EPHEMERALS` (`config/ephemerals.js`).
Détail complet : `doc/entity-model.md`/"Entités éphémères".

## Registre de types (`entities/types/index.js`)

Donnée neutre, sans import — un fichier par archétype sous `entities/types/`,
rassemblés par `index.js` en un objet `{ [type]: TypeDef }` :

| Champ            | Type    | Lu par        | Rôle                                         |
|------------------|---------|---------------|-----------------------------------------------|
| `nameKey`        | string  | vue           | clé i18n du nom par défaut du type, forme `<namespace>.name` — même champ qu'à l'instance (`entity.nameKey` ci-dessus), symétrique à `descriptionKey` |
| `descriptionKey` | string  | vue           | optionnel : clé i18n de la description par défaut du type, utilisée par l'interaction "describe" si l'instance n'en fournit pas |
| `sounds`         | object  | vue           | descripteurs de son du type, par rôle (`{ beacon, ... }`) — voir `doc/entity-model.md` |
| `triggers` | `Trigger[]` | core | optionnel : défaut de type des triggers (horloge, émote), cascadé comme `action` — voir tableau "Entité" plus haut, `doc/scripting.md`/"Triggers" |
| `startle` | `{ range? }` | core | optionnel : défaut de type de l'entité farouche, cascadé comme `action` — voir tableau "Entité" plus haut |
| `blocksMovement` | boolean | core           | empêche le déplacement au travers de l'entité (`core/physics/collision.js`) |
| `observable`     | boolean | vue            | candidate à l'interaction "describe" (touche Espace) — voir "Interaction (niveau 0)", `doc/entity-model.md` |
| `interactable`   | boolean | vue            | candidate à l'interaction "activate" (touche Entrée) — idem |
| `isFlying`       | boolean | vue            | optionnel, défaut du type — chaîne de filtres "hauteur suggérée" sur les sons, voir `isFlying` dans `doc/entity-model.md` |
| `action`         | object OU tableau | vue   | `{ kind, ... }` (ou plusieurs candidates) par défaut du type — voir tableau "Entité" plus haut, `doc/scripting.md`/"Actions" |
| `consumedDescriptionKey` | string | vue    | optionnel : défaut de type, cascadé comme `descriptionKey` — voir "Collectible persistant" plus haut |
| `descriptionRules` | `{ when, descriptionKey }[]` | vue | optionnel : défaut de type, remplacé EN BLOC par celui de l'instance — voir `doc/scripting.md`/"Descriptions conditionnelles" |
| `muteOnConsumed` | boolean | vue           | optionnel, REGISTRE SEULEMENT (jamais cascadé par instance) : arrête le beacon continu une fois l'entité `consumed` — voir "Collectible persistant" plus haut, `doc/entity-model.md` |
| `container` | `{ distribution, count?, regenerates? }` | core | optionnel : défaut de type d'un conteneur de collecte, cascadé comme `action` — voir tableau "Entité" plus haut, `doc/entity-model.md`/"Collecte" |
| `shop` | `{ catalog }` | core | optionnel : défaut de type d'un point de vente, cascadé comme `action` — voir tableau "Entité" plus haut, `doc/entity-model.md`/"Vente et achat" |
| `display` | `{ distribution }` | core | optionnel : défaut de type d'un présentoir, cascadé comme `action` — voir tableau "Entité" plus haut, `doc/entity-model.md`/"Présentoirs" |
| `collisionSound` | string | vue | optionnel, REGISTRE SEULEMENT : son joué quand le joueur bute contre l'entité |
| `messageRotation` | string | vue | optionnel, REGISTRE SEULEMENT : id d'une série de `rotations/`, dont le message du moment remplit `{message}` dans la description — voir `doc/entity-model.md`/"Messages en rotation" |

Un archétype peut aussi porter, à son premier niveau, toute clé de réglage de
`config/tuning-values.js` (palier "type" de la cascade, voir
`doc/entity-model.md`/"Résolution en cascade"). Tout autre champ est REJETÉ :
le registre est validé au démarrage du jeu
(`core/entity-parse.js`/`validateEntityRegistry`, appelée par `main.js`), sans
attendre qu'une scène utilise le type fautif.

`blocksMovement`/`observable`/`interactable`/`isFlying` sont tous les quatre
cascadés instance -> type -> défaut `false` (voir
`core/entity-parse.js`/`parseEntity`), donc également déclarables au niveau ENTITÉ
(voir le tableau "Entité" plus haut), pas seulement au niveau du type.

Liste EXHAUSTIVE des archétypes disponibles : `entities/types/index.js` (un
fichier par type sous `entities/types/`), jamais recopiée ici — elle
évoluerait plus vite que cette doc. Le modèle complet (descripteurs de son,
cascade de réglages, sous-types comme presets, la place du joueur) est
documenté dans `doc/entity-model.md`.

## Exemple minimal

```json
{
  "id": "demo",
  "titleKey": "scene.demo.name",
  "length": 40,
  "playerStart": 2,
  "entities": [
    { "id": "npc_merchant", "type": "npc", "x": 15, "nameKey": "npc.merchant.name" },
    {
      "id": "door_exit",
      "type": "door",
      "x": 38,
      "action": { "kind": "applyEffects", "effects": [{ "type": "teleport", "target": "demo-next" }] }
    }
  ]
}
```

Encore plus minimal : `{}` est une scène valide (voir "Parsing TOTAL" plus
haut) — une scène vide, plate, traversable, sans rien à configurer. Utile pour
un test/lab rapide sans avoir à écrire un fichier de scène complet.

## Verticalité — par SOUS-SCÈNES, pas par axe Y

Aucun champ dédié : la verticalité (ex. "les toits" au-dessus de la rue) se
fait EXACTEMENT comme un changement de scène horizontal — une scène séparée
(`scenes/*.json` à part entière), relié par une entité interactable dont
l'effet `"teleport"` y mène (voir `doc/scripting.md`/"Effets d'action" —
un "escalier"/une "échelle", au même titre qu'une `door`, voir
`doc/entity-model.md`). Jamais un axe Y discrétisé dans
UNE scène (aucune notion de palier/étage actif à maintenir) : le mécanisme
de transition de scène déjà en place couvre tout, sans champ ni système
supplémentaire.

## Chargement

- `core/scene.js` — `parseScene(raw, registry)` : fonction pure, valide et
  normalise un objet déjà parsé. Utilisable en Node/console, sans réseau ni
  DOM. Toute violation, champ inconnu compris (voir "Scène"), lève une
  `Error` nommant le champ ou l'entité fautive.
- `scenes/load.js` — `loadScene(url, registry)` : chargeur au bord (`fetch` +
  `parseScene`). Erreurs réseau et JSON invalide remontées avec un message
  clair. `loadSceneById(id, registry)` : résout `id` en chemin via
  `scenes/index.js` puis délègue à `loadScene` — utilisé pour l'effet
  "teleport" (`target` = id, pas un chemin, voir `doc/scripting.md`/"Effets
  d'action").
- `scenes/index.js` — registre `{ id: chemin }` des scènes existantes, et
  `MAIN_SCENE_IDS`, la liste des scènes PRINCIPALES : les grandes zones de
  la ville, celles que pointent les cases de la carte (`doc/city-map.md`).
  Toute autre scène est une SOUS-SCÈNE (un intérieur, un étage), rattachée
  par `MAIN_SCENE_OF` à la scène principale où elle se trouve
  géographiquement (la carte s'ouvre sur celle-ci, voir `doc/city-map.md`).
  Déclarées à la main, jamais déduites, et tenues hors des fichiers de scène : une
  sauvegarde fige un monde à sa première visite (`doc/save.md`), un drapeau
  recopié dans le monde ne suivrait pas un changement d'avis. L'audit du
  contenu vérifie que chaque id existe, que chaque scène est soit
  principale soit rattachée à une principale, que chaque case de la carte
  pointe vers une scène principale et qu'une action `confirm` n'en relie que deux
  (voir `doc/scripting.md`/"Confirmation d'une action").
