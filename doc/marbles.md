# Jeu des billes

Minijeu de stratégie solo, sans adresse ni adversaire, lancé depuis le menu principal.
Prototype : indépendant de la partie principale (ni inventaire, ni collection, ni
sauvegarde). Le joueur pose des billes sur un triangle à trois emplacements qui tourne
à chaque tour, et marque en synchronisant leurs effets.

| Fichier | Rôle |
|---|---|
| `config/marbles-values.js` | Réglages, table des billes, sac de test (donnée pure) |
| `core/marbles.js` | La simulation : état, réducteur, écouteurs, journal, codes de refus |
| `core/marbles-effects.js` | Le modèle d'effet : clauses, actions, conditions, effet imprimé |
| `core/marbles-bus.js` | Le bus d'évènements interne à la simulation |
| `core/marbles-forecast.js` | La prévision : le vrai moteur sur une copie de l'état |
| `view/marbles/screen.js` | L'écran de jeu et sa table de touches |
| `view/marbles/pile-screen.js` | Le menu d'une pile de billes, sac ou défausse |
| `view/marbles/card.js` | La fiche d'une bille, lue dans le modèle `MARBLE_CARD_MODEL` |
| `lib/detail-card.js` | Le mécanisme générique des fiches : assemblage et curseur secondaire |
| `view/marbles/narration.js` | Ce qui se dit, à partir de l'état, du journal et de la prévision (pur) |
| `view/marbles/navigation.js` | Le curseur dans le triangle, les zones (pur) |
| `view/marbles/sounds.js` | Les points d'accroche sonores |
| `tools/play-marbles.js` | Partie au terminal |
| `core/checks/marbles.check.js`, `marbles-bus.check.js`, `marbles-forecast.check.js`, `marbles-view.check.js` | Vérifications |

## Déroulement d'un tour

1. **Pioche** : 5 billes au premier tour, 1 ensuite (`firstTurnDraw`, `drawPerTurn`). Main
   pleine (`maxHandSize`, 5) : la pioche est sautée et la bille reste au sac. Sac vide
   alors qu'il faut une bille : la défausse mélangée devient le sac, et la partie s'arrête
   si ce sac compte moins de 3 billes. Ce test n'a lieu qu'à une régénération.
2. **Échange** (facultatif, une fois par tour, avant toute pose) : le contenu de deux
   emplacements, usure comprise. Un emplacement vide en fait un déplacement ; deux vides
   sont refusés, pour ne pas gâcher l'échange du tour. Ni Tic ni Éjection.
3. **Pose** : autant de billes que voulu. Au tour 1, le triangle doit être plein pour
   résoudre, et une pose qui ne laisserait plus assez de billes en main pour y arriver est
   refusée (la partie serait sans issue, la main ne se recomplétant qu'au tour suivant).
4. **Résolution** : base gauche, base droite, pointe ; un emplacement vide saute sa
   phase. Elle part des compteurs du tour : Vitesse (0 en début de tour) et Masse (1), que
   Tic et Éjection ont déjà pu modifier. Chaque bille applique son effet puis prend 1
   d'usure, même si cela l'amène à son maximum. Impact = max(0, Vitesse) × max(1, Masse),
   ces planchers ne valant que pour ce calcul final. Il s'ajoute au Score.
5. **Retrait** : une bille à son usure maximale part à la défausse. Pas d'Éjection.
6. **Rotation** : base gauche → pointe, pointe → base droite, base droite → base gauche.

Fin de partie : après le dernier tour, ou sur un sac régénéré trop petit.

### Déroulé d'une pose

Sur un emplacement vide, la bille le rejoint, sans Tic. Sur un emplacement occupé par une
bille B, la pose d'une bille A se déroule dans cet ordre, visible au journal :

| Étape | Évènement du journal |
|---|---|
| Éjection de B | `knockout`, puis `effect` si B en a une |
| B est retirée de son emplacement | `removed` (`cause: "replacement"`) |
| B rejoint la défausse | `discarded` (`cause: "replacement"`) |
| A rejoint l'emplacement | `placed` |
| Tic de A | `hit`, puis `effect` si A en a un |

## Une bille

Une entrée de `MARBLE_TYPES`, de la donnée validée au chargement
(`core/marbles.js`/`validateMarbleTypes`). L'en-tête de `config/marbles-values.js` détaille
les champs :

```js
clay: { base: [speed(1)], apex: [speed(4)], hit: [speed(2)] },
cats_eye: { base: [speed(3)], baseVariant: { rightBase: [mass(1)] }, apex: [speed(3)] },
magnifier: {
  base: [speed(1)],
  baseVariant: {
    leftBase: [{ ...speed(4), target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }],
  },
  apex: [speed(2)],
},
```

Les champs d'effet (`base`, `baseVariant`, `apex`, `hit`, `knockout`) sont tous facultatifs :
absent, aucun effet. `maxWear` vaut 3 par défaut. **Ajouter une bille** : sa ligne dans la
table, son nom dans chaque langue (vérifié par le domaine `marbles-view`), et sa place dans
`STARTING_BAG` pour la mettre en jeu. En français, le nom porte sa forme `de` (« d'argile »,
« de calot ») : `{ "base": "argile", "de": "d'argile" }`, pour « Tic d'argile ». Un sac est
une liste d'ids : les doublons y sont permis.

### Effets et clauses

Un effet est une liste de clauses (`core/marbles-effects.js`) :

- **action** : ce que fait la clause, aujourd'hui `speed` ou `mass`, avec son `amount` ;
- **cible** (`target`, facultative) : un emplacement. Sans cible, la clause agit sur le
  compteur du tour ou s'ajoute à l'effet de la bille ; avec une cible, elle donne un
  **bonus** à la bille de cet emplacement ;
- **condition** (`when`, facultative) : évaluée au déclenchement.

**Règle anti-boucle** : une condition lit toujours l'effet IMPRIMÉ d'une bille
(`printedStat`), jamais un effet déjà modifié. Aucune dépendance circulaire n'est possible,
et le joueur raisonne à partir de ce qu'il entend. L'imprimé compte les clauses sans cible
et sans condition.

**Le bonus** (`bonus`, sur l'entrée du triangle) s'ajoute à l'effet de phase de la bille
qui le reçoit, et s'annonce chez elle avec son total effectif (« Vitesse +12 »). Il suit la
bille dans un échange, se perd si elle est remplacée, et disparaît à la fin de la
résolution : il ne vaut que s'il arrive avant la phase de sa cible. Donné à un emplacement
vide, il est perdu.

**Ajouter** une action ou une condition : une entrée dans `CLAUSE_ACTIONS` ou `CONDITIONS`,
et son texte dans `view/marbles/narration.js`. Un nouveau moment de déclenchement : une
ligne dans `core/marbles.js`/`EVENT_TRIGGERS`.

## Simulation

`marblesReduce(state, action)` est pur et rend toujours `{ ok, state, events, error }`.
L'en-tête de `core/marbles.js` décrit l'état, les actions et chaque évènement du journal.
Une action interdite ne lève jamais : `ok` est faux, l'état inchangé, et `error` est un
code de `MARBLE_ERRORS`, dont le texte est `marbles.error.<code>`.

Une bille n'a d'usure que sur le triangle (`{ marble, wear, bonus? }`) ; partout ailleurs
c'est un simple id. Une bille qui revient repart donc à zéro par construction.

### Le bus d'évènements

Chaque action déroule ses évènements par un bus (`core/marbles-bus.js`), synchrone et
déterministe, sans aucun lien avec le DOM. Il vit le temps d'une action : la logique reste
dans le réducteur, et rien d'extérieur ne s'y abonne.

- **Journal d'abord** : chaque évènement entre au journal, puis les billes l'écoutent. Le
  journal reste la seule interface vers l'écran et le son.
- **Ordre des écouteurs, fixe** : base gauche, base droite, pointe, puis la main de la
  première à la dernière (`marbleListeners`).
- **Pas de récursion** : un évènement émis pendant le traitement d'un autre attend dans une
  file, premier entré, premier sorti.
- **Limite de sécurité** : `MAX_EVENTS_PER_ACTION`. Au-delà, le bus lève
  `MarbleEventLimitError` et le réducteur refuse l'action (`eventLimit`), l'état reçu
  n'ayant jamais été touché.

`EVENT_TRIGGERS` dit quels évènements déclenchent un effet : aujourd'hui les phases, le Tic
et l'Éjection. Les autres passent au journal, prêts à servir.

### La prévision

`forecast(state, action)` dit ce qu'une action produirait, sans écrire de règle : il copie
l'état, applique l'action sur la copie (ou rien, pour le triangle actuel), lance la vraie
résolution (`runResolution`) et lit le journal. Elle ne peut donc pas diverger du moteur :
la vérification `marbles-forecast` le contrôle sur des centaines d'états aléatoires.

La copie n'a ni sac ni état de hasard, et seules une pose ou un échange s'envisagent : la
prévision ne consomme ni ne révèle rien. Un futur effet de pioche devra s'annoncer
« Pioche 1 » sans tirer. Elle résout aussi un triangle du premier tour encore incomplet,
que l'action `resolve` refuse : c'est ce qui permet de prévoir la première pose.

## Écran de jeu

Haut et bas changent d'étage (main, bases, pointe), gauche et droite parcourent la main
ou passent d'une base à l'autre. Origine et Fin vont à la première et à la dernière bille,
comme dans un menu ; dans le triangle, elles sont silencieuses. Dans la main, gauche et
droite suivent l'option de cyclage des menus ; jamais dans le triangle. Changer de zone
s'annonce d'abord (« Triangle. », « Main. »), le point final faisant marquer une pause au
lecteur d'écran.
Les touches sont dans la table `marbles` de `view/marbles/screen.js`, l'aide (F1) en est
générée (`doc/help.md`).

Ce qui se dit, selon l'endroit :

| Où | Annonce |
|---|---|
| Bille en main, au sac, en défausse | « argile, usure 3. 1 sur 5 » |
| Bille active, sans sélection | « calot, pointe, usure 1 sur 3. » |
| Emplacement vide, sans sélection | « pointe : vide. » |
| Emplacement occupé, bille sélectionnée | « pointe, calot : Vitesse +12. » (la prévision) |
| Emplacement vide, bille sélectionnée | « pointe » |
| I | tour, score, Vitesse et Masse du tour, échange |
| S | nombre de billes au sac, pioche par tour |
| D | nombre de billes en défausse |

Une valeur négative porte le vrai signe moins, collé au nombre (« Vitesse −3 », U+2212) :
un lecteur d'écran le lit, là où il peut taire un trait d'union. Un gabarit d'effet
l'écrit lui-même ; un compteur passe par `view/marbles/narration.js`/`formatCounter`.

**Poser** : Entrée sur une bille la sélectionne, Entrée sur un emplacement ouvre une
confirmation (`view/menus/confirmation.js`, le modèle commun à tout le jeu), toujours, même
sur un emplacement vide. Ses premières lignes se lisent et ne s'activent pas :

1. « Poser argile en pointe ? Vitesse +8 », l'effet de phase sur le triangle simulé ;
2. sur un emplacement occupé, « Éjection de calot : Vitesse +3 », ou « aucun effet » ;
3. sur un emplacement occupé, « Tic d'argile : Vitesse +2 », ou « aucun effet » ;
4. Annuler (Échap aussi : la bille reste sélectionnée) ;
5. Confirmer.

### Fiches de détail

Une bille porte trop d'informations pour une seule annonce. Le curseur principal annonce
court ; **Ctrl+haut** et **Ctrl+bas** parcourent ses champs un par un, sur un axe vertical
autour de cette annonce :

```
Base : Vitesse +1.          <- 2 fois Ctrl+haut
Pointe : Vitesse +4.        <- Ctrl+haut
argile, usure 3. 1 sur 5    <- position par défaut
Tic : Vitesse +2.           <- Ctrl+bas
```

Les champs disent les effets IMPRIMÉS. En butée, le champ se réannonce, sans son ni
cyclage. Revenir à la position par défaut réannonce l'annonce principale. Tout geste du
curseur principal y ramène le curseur secondaire (`MARBLES_SETTINGS.cardResetOnMove`).
Désactivé, le curseur secondaire reste où il est : arriver sur une bille dit alors son
annonce principale et le même champ, pour comparer plusieurs billes.

Les fiches fonctionnent dans la main, sur le triangle (pendant une pose aussi : l'annonce
principale reste alors la prévision) et dans les menus du sac et de la défausse.

**Ajouter un champ** : sa ligne dans `config/marbles-values.js`/`MARBLE_CARD_MODEL` et son
gabarit, sans toucher à la navigation. Le mécanisme (`lib/detail-card.js`) ne sait rien des
billes : une fiche est une annonce principale et une liste de champs.

### Sac et défausse

**Maj+S** et **Maj+D** ouvrent un menu horizontal : une entrée par bille, puis « Retour » ;
Échap ferme aussi. Bornes, cyclage et étoile sont ceux des menus.

Le menu du sac se dit par ordre alphabétique (`bagDisplayOrder`) : l'ordre ne dépend que
du contenu du sac, et ne révèle donc jamais l'ordre de la pioche. Aucun hasard n'y entre,
ni celui de la partie ni un autre. Le menu de la défausse suit l'ordre d'arrivée, de la plus
ancienne à la plus récente. Les deux menus ne font que lire : les ouvrir ne change rien à la
partie.

**La résolution avance au rythme du joueur**, une étape par appui sur Entrée, jamais
minutée : on ignore à quelle vitesse parle son lecteur d'écran. Une étape regroupe
plusieurs évènements (`view/marbles/narration.js`/`buildSteps`) : une phase se dit d'un
bloc (bille, effet, cumul, usure), et le tour suivant vient avec sa pioche. Certains
évènements ne se disent pas eux-mêmes (`knockout`, `hit`, `removed`, `turnEnded`) : ils
servent au son et aux futurs effets.

**Sons** : un point d'accroche par type d'évènement, tous vides aujourd'hui
(`view/marbles/sounds.js`/`MARBLE_EVENT_SOUNDS`). Brancher un son, c'est remplacer son
`null` par une clé d'asset. Les gestes de l'écran gardent les sons de menu (`select`,
`cancel`, `block`, `refusal`).

## Tester

```
node tools/run-checks.js marbles marbles-bus marbles-forecast marbles-view detail-card
node tools/play-marbles.js --seed 42
```

Le mode d'emploi du kit terminal est en tête de `tools/play-marbles.js` : une partie se
joue au clavier ou par un fichier de commandes, `prevoir` dit la prévision sans rien
changer, et `--json` sort le journal complet pour comparer deux parties. En jeu, mode
debug : `window.debugStartMarbles(seed)` et `window.debugMarbles()`.
