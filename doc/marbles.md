# Jeu des billes

Minijeu de stratégie solo, sans adresse ni adversaire, lancé depuis le menu principal.
Prototype : indépendant de la partie principale (ni inventaire, ni collection, ni
sauvegarde). Le joueur pose des billes sur un triangle à trois emplacements qui tourne
à chaque tour, et marque en synchronisant leurs effets.

| Fichier | Rôle |
|---|---|
| `config/marbles-values.js` | Réglages du prototype, table des billes, sac de test (donnée pure) |
| `core/marbles.js` | La simulation : état, réducteur, journal, codes de refus |
| `view/marbles/screen.js` | L'écran de jeu et sa table de touches |
| `view/marbles/narration.js` | Ce qui se dit, à partir de l'état et du journal (pur) |
| `view/marbles/navigation.js` | Le curseur dans le triangle (pur) |
| `view/marbles/sounds.js` | Les points d'accroche sonores |
| `tools/play-marbles.js` | Partie au terminal |
| `core/checks/marbles.check.js`, `core/checks/marbles-view.check.js` | Vérifications |

## Déroulement d'un tour

1. **Pioche** : la main est complétée. Sac vide alors qu'il manque encore une bille :
   la défausse mélangée devient le sac, et la partie s'arrête si ce sac compte moins de
   3 billes. Ce test n'a lieu qu'à une régénération.
2. **Échange** (facultatif, une fois par tour, avant toute pose) : le contenu de deux
   emplacements, usure comprise. Un emplacement vide en fait un déplacement ; deux vides
   sont refusés, pour ne pas gâcher l'échange du tour.
3. **Pose** : autant de billes que voulu. Poser sur un emplacement occupé envoie
   l'ancienne bille à la défausse. Au tour 1, le triangle doit être plein pour résoudre,
   et une pose qui ne laisserait plus assez de billes en main pour y arriver est refusée
   (la partie serait sans issue, la main ne se recomplétant qu'au tour suivant).
4. **Résolution** : base gauche, base droite, pointe ; un emplacement vide saute sa
   phase. Vitesse part de 0, Masse de 1. Chaque bille applique son effet puis prend 1
   d'usure, même si cela l'amène à son maximum. Impact = max(0, Vitesse) × max(1, Masse),
   ces planchers ne valant que pour ce calcul final. Il s'ajoute au Score.
5. **Retrait** : une bille à son usure maximale part à la défausse.
6. **Rotation** : base gauche → pointe, pointe → base droite, base droite → base gauche.

Fin de partie : après le dernier tour, ou sur un sac régénéré trop petit.

## Une bille

Une entrée de `MARBLE_TYPES`, de la donnée validée au chargement
(`core/marbles.js`/`validateMarbleTypes`) :

```js
cats_eye: { base: { speed: 3 }, baseVariant: { rightBase: { mass: 1 } }, apex: { speed: 3 } },
porcelain: { base: { speed: 2 }, apex: { speed: 5 }, maxWear: 2 },
```

`base` et `apex` sont obligatoires (`{}` : aucun effet) ; `baseVariant` remplace `base`
sur une base précise ; `maxWear` vaut 3 par défaut. **Ajouter une bille** : sa ligne dans
la table, son nom `marble.<id>.name` dans chaque langue (vérifié par le domaine
`marbles-view`), et sa place dans `STARTING_BAG` pour la mettre en jeu. Un sac est une
liste d'ids : les doublons y sont permis.

## Simulation

`marblesReduce(state, action)` est pur et rend toujours `{ ok, state, events, error }`.
L'en-tête de `core/marbles.js` décrit l'état, les actions et chaque évènement du journal.
Une action interdite ne lève jamais : `ok` est faux, l'état inchangé, et `error` est un
code de `MARBLE_ERRORS`, dont le texte est `marbles.error.<code>`.

Une bille n'a d'usure que sur le triangle (`{ marble, wear }`) ; partout ailleurs c'est
un simple id. Une bille qui revient repart donc à zéro par construction.

## Écran de jeu

Haut et bas changent d'étage (main, bases, pointe), gauche et droite parcourent la main
ou passent d'une base à l'autre. Entrée est le seul geste pour poser et échanger : elle
prend une bille ou un emplacement, puis agit sur l'emplacement suivant. Les touches sont
dans la table `marbles` de `view/marbles/screen.js`, l'aide (F1) en est générée
(`doc/help.md`).

**La résolution avance au rythme du joueur**, une étape par appui sur Entrée, jamais
minutée : on ignore à quelle vitesse parle son lecteur d'écran. Une étape regroupe
plusieurs évènements (`view/marbles/narration.js`/`buildSteps`) : une phase se dit d'un
bloc (bille, effet, cumul, usure), et le tour suivant vient avec sa pioche.

**Sons** : un point d'accroche par type d'évènement, tous vides aujourd'hui
(`view/marbles/sounds.js`/`MARBLE_EVENT_SOUNDS`). Brancher un son, c'est remplacer son
`null` par une clé d'asset. Les gestes de l'écran gardent les sons de menu (`select`,
`cancel`, `block`, `refusal`).

## Tester

```
node tools/run-checks.js marbles marbles-view
node tools/play-marbles.js --seed 42
```

Le mode d'emploi du kit terminal est en tête de `tools/play-marbles.js` : une partie se
joue au clavier ou par un fichier de commandes, et `--json` sort le journal complet pour
comparer deux parties. En jeu, mode debug : `window.debugStartMarbles(seed)` et
`window.debugMarbles()`.
