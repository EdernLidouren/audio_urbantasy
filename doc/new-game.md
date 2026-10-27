# Départ d'une partie

Ce avec quoi commence une partie neuve : la scène, l'argent, le sac,
l'équipement, les compagnons, les variables de partie et les émotes connues. Déclaré dans
`config/new-game.js` (donnée pure), lu et validé par
`core/new-game.js`/`parseNewGame(raw, registry)`, appliqué par
`core/state.js`/`createInitialState(scene, seed, start)`.

## Le fichier

Exemple réel (`config/new-game.js`) :

```js
export const NEW_GAME = {
  startSceneId: "town_square",
  money: 0,
  bag: [{ type: "combat_boots" }, { type: "high_heels" }],
  equipment: { feet: "sneakers" },
  companions: [{ id: "companion-test-dog", type: "buddy", behavior: { kind: "follow" } }],
  emotes: ["whistle", "clap"],
};
```

- `startSceneId` (requis) : id de la scène de départ, dans `scenes/index.js`.
  « Ville test » démarre sur `demo` avec le reste du même départ.
- `money` : entier `>= 0`, 0 par défaut.
- `bag` : objets dans le sac, NON équipés, `[{ type, count }]` (`count` : 1
  par défaut). Résolus par `core/bag.js`/`addItem`, comme un ajout en jeu :
  un objet empilable donne une entrée avec quantité, un objet non empilable
  une entrée par exemplaire.
- `equipment` : objets ÉQUIPÉS, `{ <slot>: <objet> }`. L'objet doit être
  équipable et aller dans ce slot (`core/items.js`). Un objet équipé n'est
  pas aussi dans le sac : pour avoir les deux, le déclarer aux deux endroits.
- `companions` : déclarés comme une entité de scène (voir
  `doc/scene-format.md`), SANS `x` — un compagnon est toujours placé près du
  joueur. Même parseur qu'une entité de scène, donc même cascade depuis
  l'archétype (sons, capacités) : rien n'est recopié à la main. Au plus
  `MAX_COMPANIONS` (`config/companions.js`).
- `partyVariables` : variables de portée partie, même forme que toute
  déclaration de variables (voir `doc/scripting.md`/"Variables").
- `emotes` : ids des émotes connues d'emblée (`core/emotes.js`), chacune
  une seule fois. Aucune par défaut. Résolues par `learnEmote` en
  `session.emotes`, comme un apprentissage en jeu (voir
  `doc/scripting.md`/"Émotes").

Tout champ inconnu est rejeté.

## Quand c'est vérifié

`main.js` appelle `parseNewGame` une fois, au démarrage, avec le registre des
types d'entité : une erreur dans le fichier (objet inconnu, mauvais slot,
compagnon invalide...) empêche le jeu de démarrer, avec un message préfixé
`parseNewGame:` qui dit où chercher. Une scène de départ inconnue échoue au
chargement de cette scène, au même moment.

## Ce que fait `createInitialState`

Elle reçoit le départ résolu (`start`). Chaque champ absent part VIDE : sans
départ, une partie n'a ni argent, ni objet, ni compagnon. Les vérifications
du core en profitent pour ne déclarer que ce dont elles ont besoin
(`core/checks/helpers.js`/`ITEM_START` pour un départ d'objets).

Les objets du départ ne passent pas par `addItem` pour l'acquisition :
`acquiredItems` (voir `doc/collections.md`) est déduit du sac et de
l'équipement (`core/state.js`/`deriveAcquiredItems`), comme pour une
sauvegarde antérieure aux collections.

Le départ ne concerne que les parties NEUVES : une sauvegarde garde son
propre sac, son équipement et ses compagnons. La graine de partie, elle,
reste fixe (`DEFAULT_SEED`, `core/state.js`).

Vérifications : `core/checks/new-game.check.js` (`runChecks("new-game")`),
y compris la validité du vrai `config/new-game.js`.
