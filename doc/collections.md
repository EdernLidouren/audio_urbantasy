# Collections

Des listes d'objets à acquérir ou d'entités à observer, consultables dans le
menu global. Deux collections : les composants électroniques et les entités
surnaturelles. Code : `core/collections.js` (logique pure), `collections/`
(données), `core/observations.js` (le fait « observé »),
`view/discoveries.js` (validation, annonce de découverte),
`view/menus/inventory/collections-tab.js` (onglet et fiches),
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
- **`supernatural`** — le bestiaire : le ghosten (rue commerçante, après
  l'éclatement du néon défectueux), le Cumulo Lupus et le miravi. Chaque
  entrée est un TYPE d'entité, découvert à sa première observation (Espace) :
  il faut approcher l'entité, perception surnaturelle active. Fiches
  provisoires (textes « à venir »).

## Modèle

Une collection = un fichier de données pur dans `collections/`, enregistré dans
`collections/index.js` (même patron que `entities/types/`). C'est le fichier de
collection qui déclare ses entrées, jamais les objets qui déclarent leur
appartenance.

```js
// collections/electronics.js
export default {
  discoverySound: "assets/sounds/ui/scientific_reward",
  entries: [{ item: "resistor" }, { item: "capacitor" }, { item: "transistor" }],
};
```

- `entries` : liste ORDONNÉE ; l'ordre d'affichage est l'ordre de
  déclaration, fixe — une entrée ne change pas de place en étant découverte.
- Une entrée est `{ item }` OU `{ entity }`, jamais les deux (une même
  collection peut mêler les deux genres) :
  - `item` : un objet du sac (`core/items.js`/`ITEM_REGISTRY`) ;
  - `entity` : un type d'entité (`entities/types/index.js`, la clé du
    registre, ex. `cumuloLupus`).
  L'objet ou le type sert aussi d'identifiant de l'entrée (unique dans sa
  collection).
- `discoverySound` (optionnel) : le son joué à chaque découverte de CETTE
  collection. Un son d'INTERFACE (`assets/sounds/ui/`), joué non spatialisé,
  au volume de l'interface : `ui/scientific_reward` pour les composants,
  `ui/supernatural_reward` pour le bestiaire.
- L'ordre des collections dans `collections/index.js` est leur ordre dans
  l'onglet.

**Validation au démarrage** (`core/collections.js`/`validateCollection`,
appelée par `view/discoveries.js`, registres d'objets et de types
injectés) : entrées non vides, objets et types existants, un seul genre par
entrée, aucun doublon. Une collection mal écrite fait échouer le
chargement, jamais une entrée introuvable en silence.

## Découverte : deux faits neutres, lus par les collections

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

**Annonce et son** (`view/discoveries.js`) : déduits du DIFF entre
deux états de la partie (`newlyDiscoveredEntries`), au `setSession` de
`main.js`, qui voit passer toute mise à jour — jamais d'émission dans les
sources d'acquisition. Une annonce POLIE dédiée, « Nouvelle découverte :
résistance, composants électroniques. », différée d'un instant pour passer
APRÈS l'annonce de ramassage ou d'achat, plus le `discoverySound` de la
collection, retardé de `discoverySoundDelayMs` (`config/tuning-values.js`,
300 ms) pour ne pas chevaucher le son de ramassage. Plusieurs
découvertes simultanées : une seule annonce, un son par collection. Rien n'est
annoncé quand la partie est remplacée en bloc (import) ou modifiée par un outil
de debug (`muteNextDiscoveryCheck`).

**Découverte par observation** (entrées `{ entity }`) : second fait neutre,
`session.observedEntityTypes = { [type]: true }`, écrit par
`core/observations.js`/`markObserved` après une description réussie (Espace,
`view/interaction.js`, par le gestionnaire injecté `setObservationHandler`).
Toute entité observée y entre, de la collection ou non ; définitif comme
`acquiredItems`, vide au départ d'une partie. Les deux faits se passent
ensemble aux fonctions de `core/collections.js` (`discoveryFacts(session)`) ;
seul le test de découverte choisit le bon. La découverte s'annonce juste
APRÈS la description.

Pas de condition « entrée découverte » ou « collection complète » dans le
format déclaratif pour l'instant.

## Textes

Dans `data/i18n/<langue>/collections.json`, DÉDUITS des ids (jamais déclarés
dans le fichier de collection) :

- `collection.<id>.name` : nom de la collection ;
- `collection.<id>.entry.<objet>.name` / `.description` : textes de
  l'entrée, distincts de ceux de l'objet ;
- entrée d'entité : son NOM et sa DESCRIPTION sont ceux de son type
  (`nameKey`/`descriptionKey`, ceux qu'annonce le jeu) ; sa fiche ajoute
  `collection.<id>.entry.<type>.lore` (texte encyclopédique) et `.places`
  (lieux de rencontre, ÉCRITS à la main, jamais déduits des scènes).

**Pas de repli** sur les textes de l'objet : un texte manquant est signalé au
démarrage dans le journal d'avertissements (Shift+L) et la console, sans
bloquer le jeu (la clé brute s'affiche à sa place).

## Interface

Onglet **Collections**, 4ᵉ et dernier du menu global (après Capacités, Tab /
Maj+Tab), ouvrable directement avec **C** en ville
(`view/menus/inventory/collections-tab.js`).

- L'onglet liste les collections avec leur progression : « Composants
  électroniques, 1 sur 3 ».
- Entrée sur une collection ouvre ses entrées PAR-DESSUS l'onglet ; Échap
  revient à la liste, sur la ligne de la collection affichée.
- Dans une collection, **Tab / Maj+Tab** passe à la collection suivante /
  précédente, dans l'ordre de l'onglet, annoncée comme à l'ouverture (titre
  puis entrée courante). À la borne : cycle si la préférence « cyclage des
  menus » est active (son « wrap »), sinon on reste (son « block ») ;
  l'annonce est étoilée dans les deux cas, comme une flèche contre la borne
  d'un menu.
- Entrée d'objet découverte : « nom : description » ; non découverte :
  « Inconnu ». Sans numéro, contrairement aux améliorations.
- Entrée d'entité découverte : son nom ; Entrée ouvre sa FICHE par-dessus la
  collection, une ligne par rubrique, chacune réannoncée à Entrée :
  « Nom : … », « Description : … », « Encyclopédie : … », « Lieux de
  rencontre : … », puis « Écouter » si le type a un vocal (joué centré, au
  volume de l'interface, avec le gain et la variation de ton du type, un
  fichier différent du pool à chaque écoute). Une seule écoute à la fois :
  un nouvel appui coupe la précédente (court fondu) avant de relancer ;
  fermer la fiche ou passer à une autre la coupe aussi. Échap revient à la
  liste, sur la ligne de la fiche affichée.
- Dans une fiche, **Tab / Maj+Tab** passe à la fiche DÉCOUVERTE suivante /
  précédente de la même collection, du même saut que Ctrl+haut/bas (les
  entrées inconnues sautées, et les objets, qui n'ont pas de fiche), en
  gardant la ligne courante (bornée à la nouvelle fiche) : on compare ainsi
  deux vocaux d'un Tab. Annonce : celle de Retour arrière (titre puis ligne
  courante). Pas de cycle : à la borne, son « block » et annonce étoilée.
- La progression se lit dans l'état réel, comme le menu des améliorations.

## Sauvegarde

`acquiredItems` et `observedEntityTypes` font partie de l'état, donc de la
sauvegarde. Une sauvegarde antérieure reconstitue le premier à partir du sac
et de l'équipement actuels (`core/save.js`/`migrateSave`) — approximatif : un
objet déjà revendu n'y figure plus ; le second repart vide (rien ne permet de
le reconstituer, une entité se redécouvre à la prochaine observation). Un id inconnu (objet retiré depuis) est simplement ignoré : les
collections LISENT ce fait, elles ne le parcourent jamais.

## Debug

**Shift+C** (mode debug) : « Tout révéler » / « Tout réinitialiser », chacun
derrière une confirmation. Ils écrivent RÉELLEMENT le fait « acquis », pour les
seuls objets des collections, et le fait « observé » pour leurs seuls types
(`revealAllCollections`, `resetAllCollections`), sans annonce de découverte.

## Ajouter une collection

1. Un fichier `collections/<id>.js` et sa ligne dans `collections/index.js`.
2. Ses objets dans `core/items.js` s'ils n'existent pas (ou ses types dans
   `entities/types/`).
3. Ses textes dans `collections.json`, dans les deux langues.

Vérifications : `core/checks/collections.check.js` (`runChecks("collections")`).
