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
| `floors`      | number   | optionnel, entier `>= 1` : nombre d'étages du lieu. **FILET, jamais rejeté** : absent ou invalide (non entier, `< 1`) -> repli sur `1` (`console.warn` uniquement si une valeur a été fournie et est invalide — absent reste silencieux, c'est le cas normal). Réservé pour la verticalité future : voir "Verticalité (réservé)" plus bas. Totalement INERTE aujourd'hui — aucune mécanique n'en dépend. |
| `entities`    | Entity[] | voir ci-dessous                                   |
| `music`       | string   | optionnel : chemin vers la musique du lieu (`assets/musics/...`), canal global non spatialisé — voir `view/audio/city-scene.js` |
| `musicDay` / `musicNight` | string | optionnels : musique PAR PHASE jour/nuit (voir `core/time.js`/`phaseAt`, "Phase jour/nuit" plus bas). Un lieu qui n'en déclare aucune des deux retombe sur `music` pour les deux phases (rétrocompatible, aucune régression). Bascule en cours de jeu par FONDU CROISÉ (`view/audio/city-scene.js`) ; à l'entrée dans une scène, la phase courante joue directement, sans fondu. |
| `ambiences`   | string[] | optionnel : 0 à `AMBIENCE_CHANNEL_LIMIT` chemins d'ambiance (`assets/ambiances/...`, voir `config/audio-channels.js`), canal global non spatialisé, jusqu'à autant de couches simultanées — voir `view/audio/city-scene.js` |
| `ambiencesDay` / `ambiencesNight` | string[] | optionnels, même forme que `ambiences`. **RÉSERVÉS** : structure validée par `parseLevel` mais AUCUN consommateur ne les lit encore — seule la musique réagit à la phase pour l'instant (voir `core/time.md`). |
| `reverbDurationSec` | number | optionnel, `> 0` : surcharge PAR LIEU la durée de la réponse impulsionnelle du bus de réverb (défaut global : `config/tuning-values.js`) |
| `reverbDecay` | number | optionnel, `> 0` : surcharge PAR LIEU le taux de déclin de la réverb (défaut global : `config/tuning-values.js`) |
| `defaultSurface` | string | optionnel : nom de surface (voir "Surfaces de sol" plus bas) couvrant tout le `x` non-segmenté. **FILET SILENCIEUX si absent** (repli sur `DEFAULT_SURFACE`, `core/surfaces.js` — comportement audible inchangé pour toute scène qui n'en déclare pas). **Échec clair si fourni mais absent du registre** (comme un type d'entité inconnu) — une référence de contenu erronée n'est jamais dégradée en silence. |
| `segments`    | Segment[] | optionnel : zones qui PATCHENT `defaultSurface` sur des portions du lieu (voir "Surfaces de sol" plus bas). Absent -> `[]`, `defaultSurface` partout. |

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
ci-dessus) en tirent la musique du lieu, avec un fondu croisé à chaque
bascule en cours de jeu (`view/audio/city-scene.js`). Détail complet :
`core/time.md`.

## Entité

| Champ     | Type   | Contrainte                                                    |
|-----------|--------|------------------------------------------------------------------|
| `id`      | string | non vide, unique dans le niveau                                  |
| `type`    | string | doit exister dans le registre `entities/types/index.js`          |
| `x`       | number | dans `[0, length]`                                                |
| `target`  | string | **requis** si `type === "door"` : id d'un niveau du registre (`level/index.js`) — l'action "activate" sur la porte y transitionne (voir `view/interaction.js`, `view/city-screen.js`) |
| `nameKey` | string | optionnel (npc/object) : clé i18n spécifique à l'instance          |
| `descriptionKey` | string | optionnel : clé i18n de description spécifique à l'instance, utilisée par l'interaction "describe" (touche Espace) |

`parseLevel` normalise chaque entité en ajoutant `labelKey` et
`descriptionKey` : `entity.nameKey` si présent sinon `registry[type].label`
pour le premier ; `entity.descriptionKey` (du JSON) si présent sinon
`registry[type].descriptionKey` pour le second (peut rester `undefined`, ex.
`decor`). Les champs bruts du JSON source une fois résolus (`nameKey`,
`descriptionKey`) ne sont pas reportés tels quels dans l'entité normalisée —
seuls `labelKey` et `descriptionKey` (résolus) sont exposés.

## Registre de types (`entities/types/index.js`)

Donnée neutre, sans import — un fichier par archétype sous `entities/types/`,
rassemblés par `index.js` en un objet `{ [type]: TypeDef }` :

| Champ            | Type    | Lu par        | Rôle                                         |
|------------------|---------|---------------|-----------------------------------------------|
| `label`          | string  | vue           | clé i18n du libellé par défaut du type        |
| `descriptionKey` | string  | vue           | optionnel : clé i18n de la description par défaut du type, utilisée par l'interaction "describe" si l'instance n'en fournit pas |
| `sounds`         | object  | vue           | descripteurs de son du type, par rôle (`{ beacon, ... }`) — voir `entities/model.md` |
| `blocksMovement` | boolean | core (prévu)  | prévu pour empêcher le déplacement au travers de l'entité |
| `enterable`      | boolean | core (prévu)  | prévu pour déclencher une action à l'entrée (ex. porte)   |

`blocksMovement` et `enterable` existent dans la donnée et sont documentés ici,
mais **ne sont pas encore lus** : `core/reduce.js` ignore aujourd'hui les
entités du niveau — ni collision, ni entrée en porte. Le déplacement se limite
aux bornes `[0, length]` du niveau. Ces deux champs sont le point d'ancrage
prévu pour cette logique, le jour où elle sera implémentée.

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

## Verticalité (réservé)

`floors` (voir tableau "Niveau" ci-dessus) pose la place pour une future
verticalité, sans l'implémenter : un lieu aura des étages DISCRETS (paliers
francs, jamais un déplacement Y continu — l'axe Y étant peu lisible à
l'oreille, on le discrétise en paliers plutôt que de le rendre continu comme
l'axe x). La mécanique elle-même (position d'étage, palier actif, navigation
entre étages, audio des autres étages) n'existe pas encore et s'appuiera sur
ce champ le jour où elle sera construite — aucune entité, aucun état de
partie, aucun rendu audio n'en dépend à ce stade.

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
