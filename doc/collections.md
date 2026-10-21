# Collections

Des listes d'objets à découvrir, consultables dans le menu global. Première
collection : les composants électroniques. Code : `core/collections.js` (logique
pure), `collections/` (données), `view/collection-discoveries.js` (validation,
annonce de découverte), `view/menus/inventory-menu.js` (onglet),
`view/menus/debug-collections-menu.js` (outils de debug).

Les **améliorations** ne sont pas une collection : ce sont des capacités, elles
gardent leur propre système (`core/improvements.js`).

## Contenu actuel

- **`electronics`** — 49 composants électroniques (passifs, semi-conducteurs,
  puces, électromécaniques, capteurs, énergie, rétro), dans l'ordre de la
  liste de l'auteur. Chacun est un objet empilable de `core/items.js`, avec
  sa rareté (1 à 5), une valeur de vente provisoire (rareté × 20),
  l'étiquette `electronic` et un son parmi dix
  (`items/electronic_component_<son>_1_beacon`), qui sert de beacon au sol
  et de son de ramassage. La table de garnissage `electronics`
  (`config/spawn-values.js`) en est déduite, chaque composant pondéré par sa
  rareté.
- Contenu de test : deux composants à ramasser et un en vente dans la démo ;
  dix composants, un par son, au verso de la démo 3 (x 12 à 48), pour juger
  les sons à l'oreille.

## Modèle

Une collection = un fichier de données pur dans `collections/`, enregistré dans
`collections/index.js` (même patron que `entities/types/`). C'est le fichier de
collection qui déclare ses entrées, jamais les objets qui déclarent leur
appartenance.

```js
// collections/electronics.js
export default {
  discoverySound: "assets/sounds/effects/reward",
  entries: [{ item: "resistor" }, { item: "capacitor" }, { item: "transistor" }],
};
```

- `entries` : liste ORDONNÉE ; l'ordre d'affichage est l'ordre de
  déclaration, fixe — une entrée ne change pas de place en étant découverte.
- `item` : un objet du sac (`core/items.js`/`ITEM_REGISTRY`), qui sert aussi
  d'identifiant de l'entrée (unique dans sa collection).
- `discoverySound` (optionnel) : le son joué à chaque découverte de CETTE
  collection.
- L'ordre des collections dans `collections/index.js` est leur ordre dans
  l'onglet.

**Validation au démarrage** (`core/collections.js`/`validateCollection`,
appelée par `view/collection-discoveries.js`) : entrées non vides, objets
existants, aucun doublon. Une collection mal écrite fait échouer le
chargement, jamais une entrée introuvable en silence.

## Découverte : un fait neutre, lu par les collections

Le core n'importe jamais de contenu. La découverte n'est donc pas stockée par
collection : `core/bag.js`/`addItem`, **point unique d'entrée dans le sac**
(ramassage, achat, retour d'un objet déséquipé, toute source future), note
simplement que l'objet a été acquis au moins une fois :
`session.acquiredItems = { [type]: true }`. Une entrée est **découverte** si
son objet y figure (`collectionEntries`, `collectionProgress`).

- **Définitif** : revendre, poser ou consommer l'objet ne retire rien.
- Le sac et l'équipement de DÉPART (`core/state.js`/`createInitialState`) ne
  passent pas par `addItem` : ils sont notés acquis à la main.
- **Conséquence assumée** : une entrée ajoutée plus tard pour un objet déjà
  acquis apparaît découverte d'emblée.

**Annonce et son** (`view/collection-discoveries.js`) : déduits du DIFF entre
deux états de la partie (`newlyDiscoveredEntries`), au `setSession` de
`main.js`, qui voit passer toute mise à jour — jamais d'émission dans les
sources d'acquisition. Une annonce POLIE dédiée, « Nouvelle découverte :
résistance, composants électroniques. », différée d'un instant pour passer
APRÈS l'annonce de ramassage ou d'achat, plus le `discoverySound` de la
collection. Plusieurs découvertes simultanées : une seule annonce. Rien n'est
annoncé quand la partie est remplacée en bloc (import) ou modifiée par un outil
de debug (`muteNextDiscoveryCheck`).

**Extension prévue, pas construite — découverte par observation** (futur
bestiaire) : une entrée déclarerait `{ entity: <type> }` au lieu de
`{ item }`, et se lirait dans un second fait neutre
(`session.observedEntityTypes`), écrit par l'examen (Espace) via une fonction
du core. Seul le test de découverte de `core/collections.js` aurait à choisir
le bon fait ; l'onglet, l'annonce et la sauvegarde restent tels quels.

Pas de condition « entrée découverte » ou « collection complète » dans le
format déclaratif pour l'instant.

## Textes

Dans `data/i18n/<langue>/collections.json`, DÉDUITS des ids (jamais déclarés
dans le fichier de collection) :

- `collection.<id>.name` : nom de la collection ;
- `collection.<id>.entry.<objet>.name` / `.description` : textes de
  l'entrée, distincts de ceux de l'objet.

**Pas de repli** sur les textes de l'objet : un texte manquant est signalé au
démarrage dans le journal d'avertissements (Shift+L) et la console, sans
bloquer le jeu (la clé brute s'affiche à sa place).

## Interface

Onglet **Collections**, 4ᵉ du menu global (après Améliorations, Tab /
Maj+Tab), ouvrable directement avec **C** en ville.

- L'onglet liste les collections avec leur progression : « Composants
  électroniques, 1 sur 3 ».
- Entrée sur une collection ouvre ses entrées PAR-DESSUS l'onglet ; Échap
  revient à la liste.
- Entrée découverte : « nom : description » ; non découverte : « Inconnu ».
  Sans numéro, contrairement aux améliorations.
- La progression se lit dans l'état réel, comme l'onglet Améliorations.

## Sauvegarde

`acquiredItems` fait partie de l'état, donc de la sauvegarde. Une sauvegarde
antérieure le reconstitue à partir du sac et de l'équipement actuels
(`core/save.js`/`migrateSave`) — approximatif : un objet déjà revendu n'y
figure plus. Un id inconnu (objet retiré depuis) est simplement ignoré : les
collections LISENT ce fait, elles ne le parcourent jamais.

## Debug

**Shift+C** (mode debug) : « Tout révéler » / « Tout réinitialiser », chacun
derrière une confirmation. Ils écrivent RÉELLEMENT le fait « acquis », pour les
seuls objets des collections (`revealAllCollections`, `resetAllCollections`),
sans annonce de découverte.

## Ajouter une collection

1. Un fichier `collections/<id>.js` et sa ligne dans `collections/index.js`.
2. Ses objets dans `core/items.js` s'ils n'existent pas.
3. Ses textes dans `collections.json`, dans les deux langues.

Vérifications : `core/movement.check.js`, section « Collections ».
