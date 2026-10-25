# Raccourcis clavier et aide des touches

Contrat de référence pour les tables de raccourcis (`lib/input.js`/`defineBindings`)
et l'aide des touches, générée (`lib/help.js`).

## Principe : aucune aide écrite à la main

L'aide des touches n'est JAMAIS un écran tenu à jour : elle se construit à
l'ouverture à partir de deux choses seulement.

- **Les tables de raccourcis**, déclarées une fois chacune par
  `defineBindings(id, table)` (`lib/input.js`). Ce sont les mêmes tables que
  chaque écran résout par `resolveAction` : l'aide lit exactement ce que le jeu
  écoute.
- **Une phrase par action**, à la clé i18n `help.<id>.<action>`
  (`data/i18n/<langue>/help.json`), par exemple `help.city.announceTime` =
  « Annoncer l'heure et la date ».

**Ajouter un raccourci** = sa ligne dans sa table + sa phrase `help.<id>.<action>`
dans chaque langue. Rien d'autre : l'aide le montre d'elle-même. L'audit du contenu
(`tools/content-audit.js`, donc `node tools/verify.js`) signale une action sans sa
phrase, une touche sans son nom, et une phrase restée sans raccourci après un
renommage.

Tables actuelles : `move`, `city`, `global` (`view/input.js`), `menu` (`lib/menu.js`),
`cityMap` (`view/menus/city-map-menu.js`), `inventoryTabs`
(`view/menus/inventory-menu.js`), `dropQuantity`
(`view/menus/inventory/bag-and-equipment.js`), `shopList`
(`view/menus/shop-quantity-list.js`). Une table déclarée dans un nouveau module
ajoute l'import de ce module en tête de `tools/content-audit.js`, pour que l'audit la
voie.

## Ouverture

**F1**, ou **Maj+H** en secours (`view/input.js`/`GLOBAL_BINDINGS`) : raccourcis
GLOBAUX, interceptés avant tout écran (`lib/input.js`/`onGlobalPress`), donc
disponibles depuis le jeu comme depuis n'importe quel menu, et jamais utilisables par
un écran. Le comportement navigateur de F1 (sa propre aide) est neutralisé comme pour
tout raccourci global.

## Contextuelle

L'aide montre les raccourcis de l'écran au SOMMET de la pile, et lui seul, suivis des
raccourcis globaux. Un écran le déclare par un champ optionnel :

```js
helpSections: () => [{ id: "move" }, { id: "city", include: (action) => ... }],
```

- `id` : une table déclarée par `defineBindings` ; l'ordre des sections est l'ordre de
  lecture, puis celui des actions dans chaque table.
- `include(action)` (facultatif) : filtre de pertinence.

| Écran | Sections |
|---|---|
| Jeu (`view/city-screen.js`) | `move`, `city` — les raccourcis de debug seulement en mode debug ; une touche à condition (`available()` dans `KEY_ACTIONS`) seulement quand elle a un effet : la perception surnaturelle (P) une fois l'amélioration débloquée, ou en mode debug, où elle l'est toujours (même règle que la touche) |
| Tout menu (`lib/menu.js`) | `menu`, sans ce qui ne sert à rien dans CE menu : gauche/droite sans entrée réglable, Ctrl+gauche/droite sans curseur gradué, Ctrl+haut/bas sans entrée inconnue, Échap dans un menu qu'on ne ferme pas ainsi |
| Inventaire | `inventoryTabs`, puis les sections de l'onglet courant |
| Carte de la ville | `cityMap` |
| Choix de la quantité à poser | `dropQuantity` |
| Liste d'achat ou de vente | `shopList` |
| Toujours, à la suite | `global` — la bascule debug seulement en mode debug (`main.js`) |

Un écran SANS `helpSections` n'ouvre pas d'aide : c'est le cas de l'écran vide qui
gèle le jeu pendant une transition, que la fin de la transition retire — elle
retirerait l'aide à sa place. L'aide ne s'ouvre pas non plus sur elle-même.

Un écran peut aussi fournir `wrapOverlay(screen)`, appliqué à l'écran d'aide avant de
l'empiler : le jeu s'en sert pour couper ses balises pendant la lecture, comme sous
tout menu.

## L'écran d'aide

Un MENU ordinaire (`lib/menu.js`), en LECTURE SEULE : une entrée par action,
« <action> : <touches> » (gabarit `help.entry`, l'action d'abord), les touches d'une
même action lues en alternative (« Aller à gauche : Flèche gauche, Q ou A »,
`{keys, list, or}`). Entrée ne fait rien : jamais une action exécutée depuis l'aide.
Il hérite de tout ce qu'a un menu (position, étoile de limite, Début/Fin, cyclage) ;
Échap le referme et l'écran couvert se réannonce. Liste plate, sans sous-titres.

## Noms des touches

`lib/input.js`/`describeBinding` : une lettre ou un chiffre s'écrit tel quel en
majuscule, une touche de fonction aussi (F1) ; toute autre touche a un nom fourni par
la langue, `key.<Touche>` (`key.ArrowUp` = « Flèche haut », `key.Space` pour
l'espace), et chaque modificateur `key.mod.<mod>` (« Maj », « Ctrl »), dans l'ordre
Ctrl, Alt, Maj, joints par « + » (« Ctrl+Flèche haut », « Maj+S »).
