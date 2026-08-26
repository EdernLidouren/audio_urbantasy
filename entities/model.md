# Modèle d'entité

Contrat de référence pour le contenu du jeu : la forme d'une entité, le
vocabulaire de sons qu'elle porte, l'ordre de résolution des réglages, et la
place du joueur dans ce modèle. Complète `level/schema.md` (le format des
fichiers de niveau) : ce document-ci décrit le MODÈLE de contenu, pas le
format JSON qui l'instancie.

## Le descripteur d'entité partagé

Une entité (registre `entities/types/index.js`, un fichier par archétype dans
`entities/types/` ; instance dans un fichier de niveau) porte :

| Catégorie              | Champs                                                          | Rôle |
|-------------------------|-------------------------------------------------------------------|------|
| Position                | `x` (instance uniquement, voir `level/schema.md`)                  | où l'entité se trouve dans le niveau |
| Type                    | `type` (instance), `label` (registre, clé i18n)                    | quoi et comment l'annoncer |
| Sons par rôle            | `sounds: { <rôle>: descripteur }`                                  | voir "Vocabulaire de sons" ci-dessous |
| Propriétés spatiales      | `audibleRange`, `panSaturation`, `interactRange`, `cutoffMin`, `cutoffMax`, `reverbSend` | résolues en cascade, voir plus bas |
| Drapeaux                 | `blocksMovement`, `enterable`                                      | prévus pour le core (collision, entrée), non câblés à ce jour |

Aucun de ces champs n'est obligatoire au-delà de `sounds.beacon` : tout le
reste retombe sur le défaut global (`config/tuning-values.js`) si absent.

## Vocabulaire de sons

Un descripteur de son est un objet plat :

```js
{ path, loop, reverbSend?, pitchVariation? }
```

- `path` — chemin du fichier, sous `/sounds`.
- `loop` — le SEUL champ qui distingue les deux modes de lecture Web Audio :
  - `loop: true` → **balise** (*beacon*) : une boucle positionnée, créée une
    fois via `createPositionedSound` et maintenue pour la durée de vie de la
    scène (pan/volume/filtre mis à jour à chaque tick). C'est ainsi qu'une
    entité "sonne" en continu dans l'espace.
  - `loop: false` → **ponctuel** : joué à la demande via `playOneShot`, pas
    de position maintenue dans le temps. Le mouvement du joueur (rôle
    `movement`) en est un exemple : ce n'est pas une boucle Web Audio native,
    même si la marche elle-même est continue — c'est `view/audio/city-scene.js`
    qui le rejoue à la cadence de marche (`STEP_DISTANCE`).
- `reverbSend` (optionnel) — part du signal envoyée au bus de réverb partagé.
  Absent → cascade (voir plus bas).
- `pitchVariation` (optionnel) — réservé, pas encore consommé par aucun code.
  Structurellement résoluble dès aujourd'hui via la cascade, pour qu'un futur
  usage n'ait pas à toucher au mécanisme.

`sounds` regroupe ces descripteurs **par rôle** (une clé arbitraire du type :
`beacon`, `movement`, et d'autres à venir sans casser l'existant — ex. un son
d'interaction ponctuel un jour). Un rôle donné a un mode (`loop`) cohérent
avec son usage, mais rien ne l'impose structurellement — c'est une convention
respectée par ce projet, pas une contrainte du modèle.

## Résolution en cascade

`resolveTuning(key, entity?, sound?)` (`lib/tuning.js`, instancié dans
`config/tuning.js`) résout une clé de réglage du plus spécifique au plus
général :

1. `sound[key]` — le descripteur de son lui-même, s'il en porte un ;
2. `entity[key]` — l'instance de niveau, si elle surcharge ;
3. `registry[entity.type][key]` — le défaut du type ;
4. `defaults[key]` — le défaut global (`config/tuning-values.js`), dernier
   recours.

`entity` et `sound` sont tous deux optionnels et indépendants : un appel peut
ne fournir que `sound` (ex. un réglage propre à un descripteur de son sans
lien avec une instance de niveau — c'est le cas du joueur, voir plus bas).

Aujourd'hui, aucune balise du registre ni aucune instance de `demo.json` ne
surcharge `reverbSend` : la résolution retombe systématiquement sur le
défaut global, donc le son des entités existantes est identique à avant
l'introduction de ce modèle.

## Les sous-types sont des PRESETS, pas une hiérarchie

`door`, `npc`, `object`, `rock`, `dog`, `decor` (un fichier par archétype
sous `entities/types/`, rassemblés par `entities/types/index.js`) sont des
objets plats **indépendants** — chacun définit l'intégralité de ses
propriétés. Il n'y a ni héritage, ni classe de base, ni "entité générique"
dont les autres dériveraient : ajouter un type, c'est ajouter un fichier
autonome au dossier, jamais étendre une chaîne de prototypes. Cohérent avec
l'anti-ECS et l'anti-hiérarchie-de-classes de `CLAUDE.md`.

## Le joueur : même modèle, mais AUDITEUR

`entities/player.js` porte un descripteur de contenu qui suit le même
vocabulaire (`sounds.movement`), mais le joueur **n'est pas une entité** au
sens du niveau :

- Il n'apparaît **jamais** dans `level.entities`.
- Il n'a ni `id`, ni `type`, ni `x` dans son descripteur — sa position vient
  de `session.player.x` (l'état du core), pas d'une instance de niveau.
- La scène audio (`view/audio/city-scene.js`) ne crée **aucune voix
  positionnée** pour lui : sa position sert uniquement d'ORIGINE, celle par
  rapport à laquelle chaque entité calcule sa distance/son pan. Le joueur
  est celui qui écoute, pas quelque chose qu'on écoute depuis ailleurs.

Le son de pas (`movement`, ponctuel) est l'exception qui confirme la règle :
il est joué par `playOneShot`, centré (aucun pan), pas par une voix
positionnée maintenue comme une balise d'entité.
