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
| `target`  | string | **requis** si `type === "door"` : id du niveau de destination     |
| `nameKey` | string | optionnel (npc/object) : clé i18n spécifique à l'instance          |

`parseLevel` normalise chaque entité en ajoutant `labelKey` :
`entity.nameKey` si présent, sinon `registry[type].label`. Les champs
supplémentaires du JSON source non listés ci-dessus (par ex. `nameKey` une
fois résolu) ne sont pas reportés dans l'entité normalisée — seul `labelKey`
est exposé.

## Registre de types (`entities/types.js`)

Donnée neutre, sans import. Un objet `{ [type]: TypeDef }` :

| Champ            | Type    | Lu par | Rôle                                         |
|------------------|---------|--------|-----------------------------------------------|
| `label`          | string  | vue    | clé i18n du libellé par défaut du type        |
| `sound`          | string  | vue    | chemin placeholder vers l'asset audio         |
| `blocksMovement` | boolean | core   | l'entité empêche-t-elle le déplacement au travers ? |
| `enterable`      | boolean | core   | l'entité déclenche-t-elle une action à l'entrée (ex. porte) ? |

Types de départ : `door`, `npc`, `object`.

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
