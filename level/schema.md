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
| `playerStart` | number   | dans `[0, length]` — position x de départ         |
| `entities`    | Entity[] | voir ci-dessous                                   |

## Entité

| Champ     | Type   | Contrainte                                                    |
|-----------|--------|------------------------------------------------------------------|
| `id`      | string | non vide, unique dans le niveau                                  |
| `type`    | string | doit exister dans le registre `entities/types.js`                |
| `x`       | number | dans `[0, length]`                                                |
| `target`  | string | **requis** si `type === "door"` : identifiant du niveau cible, prévu pour un futur chargement de niveau — non câblé aujourd'hui (aucun mécanisme ne charge encore un niveau par id) |
| `nameKey` | string | optionnel (npc/object) : clé i18n spécifique à l'instance          |
| `descriptionKey` | string | optionnel : clé i18n de description spécifique à l'instance, utilisée par l'interaction "describe" (touche Espace) |

`parseLevel` normalise chaque entité en ajoutant `labelKey` et
`descriptionKey` : `entity.nameKey` si présent sinon `registry[type].label`
pour le premier ; `entity.descriptionKey` (du JSON) si présent sinon
`registry[type].descriptionKey` pour le second (peut rester `undefined`, ex.
`decor`). Les champs bruts du JSON source une fois résolus (`nameKey`,
`descriptionKey`) ne sont pas reportés tels quels dans l'entité normalisée —
seuls `labelKey` et `descriptionKey` (résolus) sont exposés.

## Registre de types (`entities/types.js`)

Donnée neutre, sans import. Un objet `{ [type]: TypeDef }` :

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

## Chargement

- `core/level.js` — `parseLevel(raw, registry)` : fonction pure, valide et
  normalise un objet déjà parsé. Utilisable en Node/console, sans réseau ni
  DOM. Toute violation lève une `Error` nommant le champ ou l'entité fautive.
- `level/load.js` — `loadLevel(url, registry)` : chargeur au bord (`fetch` +
  `parseLevel`). Erreurs réseau et JSON invalide remontées avec un message
  clair.
