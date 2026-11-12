# Boîte à outils des billes

Les outils de développement du jeu des billes, réunis dans `marbles/tools/`. Ils ne
sont jamais chargés par le jeu, passent par le vrai réducteur (`marbles/core/marbles.js`) et
la vraie prévision (`marbles/core/forecast.js`), et ne changent ni règle ni valeur :
ils jouent, montrent et mesurent. Leur sortie se lit au lecteur d'écran : des phrases
et des lignes simples, jamais de tableau. Les règles elles-mêmes : `doc/marbles-rules.md` ;
leur mécanisme : `doc/marbles.md`.

## Les outils

| Outil | À quoi il sert |
|---|---|
| `marbles/tools/play.js` | Jouer une partie au terminal, à graine imposée, au clavier ou par un fichier de commandes |
| `marbles/tools/case.js` | Construire un état précis à la main, lui appliquer des actions, lire le journal |
| `marbles/tools/simulate.js` | Le simulateur : des milliers de parties jouées par un joueur automatique, et un rapport |
| `marbles/tools/compare.js` | Le comparateur : les six simulations de référence sur un commit et sur le code en cours, et ce qui change entre leurs rapports |
| `marbles/tools/rules-doc.js` | Le document de règles (`doc/marbles-rules.md`) : génère son annexe des billes depuis la table (`--write`), et vérifie qu'elle est à jour et que chaque mot-clé y figure avec sa description exacte (lancé par `tools/verify.js`) |

Les modules qu'ils partagent, purs (sans Node, donc vérifiables) :

| Module | Rôle |
|---|---|
| `marbles/tools/game-rules.js` | Les règles du jeu, liées une fois aux tables des billes et des statuts : le point de composition des outils |
| `marbles/tools/args.js` | La lecture stricte de la ligne de commande, commune aux outils : une option inconnue, une option à valeur sans sa valeur, une option donnée deux fois ou un argument en trop sont une erreur claire, jamais un silence |
| `marbles/tools/commands.js` | Les commandes texte (« poser 1 pointe ») communes à `play.js` et `case.js` |
| `marbles/tools/format.js` | L'état et le journal en lignes lisibles : chaque type d'évènement, chaque cible vide (main pleine, pas d'emplacement de référence…) et chaque fin de choix (dont `declined`, rien choisi) |
| `marbles/tools/state-builder.js` | L'état construit à la main (`buildState`) et l'application d'actions (`applyActions`) |
| `marbles/tools/players.js` | Les joueurs automatiques et la vue publique qu'ils reçoivent |
| `marbles/tools/drawn-value.js` | La valeur d'une bille gagnée en main pour le glouton, et comment elle a été mesurée |
| `marbles/tools/simulation.js` | Les parties du simulateur, les graines dérivées, les sacs |
| `marbles/tools/stats.js` | Le résumé chiffré d'une simulation |
| `marbles/tools/report.js` | Le rapport en phrases, et ses observations |
| `marbles/tools/report-diff.js` | La différence de deux rapports, ligne à ligne, rangée sous sa section et sa bille |
| `marbles/tools/export.js` | L'export JSON ou CSV |

## Jouer une partie

```
node marbles/tools/play.js --seed 42
node marbles/tools/play.js --seed 42 --json < commandes.txt
```

Le mode d'emploi est en tête du fichier : `etat`, `brut` (l'état complet, sac
compris), `poser`, `echanger`, `prevoir`, `fin`, `journal` (lisible) ou `journal json`.
Un choix en attente se dit avec sa question et ses cibles ; on y répond par `choisir 2`
(la bille 2 de la main), `choisir pointe`, `choisir defausse 3` (la bille 3 de la défausse,
dans l'ordre d'arrivée), ou `terminer` (un choix facultatif : sans cible, l'action est
ignorée) ; pendant une
résolution, la suite se dit après la réponse.

## Construire un cas

```
node marbles/tools/case.js marbles/tools/examples/replacement.json
```

Un fichier JSON : `state`, la description de l'état (format en tête de
`marbles/tools/state-builder.js` : tour, triangle avec usure, main avec tours en main
(`"clay:2"`), sac du haut vers le
bas, défausse, pot et billes perdues (`"pot": ["agate"]`, dans l'ordre d'arrivée, jamais
plus que la capacité du pot en vigueur), compteurs, valeurs de partie (`"tally": { "flick": { "turn": 1, "game": 3 } }`, le
reste à zéro), statuts (`"statuses": ["cushion:2", { "status": "extraThrow", "pending": true }]`,
dans l'ordre d'acquisition, ce qui n'est pas dit venant de la définition ; les bornes
de la main, des lancers et du pot se lisent aux caractéristiques en vigueur, statuts
compris), réglages), et `actions`, des commandes texte (`poser 1
pointe`, `echanger gauche pointe`, `resoudre`, `piocher`, `prevoir`, `choisir 2`,
`choisir pointe`, `terminer`) ou des actions brutes du réducteur ; une action suspendue
sur un choix affiche le choix en attente et ses cibles, la suivante y répond. L'outil affiche l'état de départ, le journal ou le refus de chaque
action, puis l'état final ; `prevoir` y dit aussi les réactions des statuts et l'usure
prévue ; `--json` ajoute tout cela brut. La ligne de commande se lit strictement
(`marbles/tools/args.js`) : le fichier du cas, et `--json`. Une description fausse
(bille, champ ou emplacement inconnu, usure impossible) lève une erreur claire.

## Le simulateur

```
node marbles/tools/simulate.js --games 1000 --player greedy
node marbles/tools/simulate.js --player random --random-bag 13 --max-copies 2
node marbles/tools/simulate.js --bag-file marbles/tools/examples/bag.txt --turns 12
node marbles/tools/simulate.js --games 200 --export resultats.csv
```

Toutes les options sont en tête de `marbles/tools/simulate.js` : nombre de parties,
graine de départ, joueur, poses envisagées par le glouton, valeur d'une bille gagnée en
main (`--drawn-value`), sac (de test, aléatoire avec une limite d'exemplaires, ou d'un
fichier), surcharges des réglages (taille de main, lancers, capacité du pot `--pot`,
pioches, nombre de tours, pour cette simulation seulement) et export. Comme tous les
outils, il lit sa ligne de commande strictement (`marbles/tools/args.js`) : une option
inconnue, une valeur manquante ou un argument en trop l'arrête sur une erreur.

**Déterminisme** : chaque partie reçoit ses graines dérivées de la graine de départ
(partie, joueur, sac). Mêmes options, même rapport au caractère près, sauf la dernière
ligne, la durée.

**Les joueurs** (`marbles/tools/players.js`) ne savent que ce qu'un humain sait : ils
reçoivent une vue publique de l'état, billes du sac inconnues (seul leur nombre reste) et
hasard de la partie retiré, et n'agissent que par les actions du réducteur, validées
comme celles d'un humain, lancers compris. Pour planifier, le glouton passe par le
réducteur à l'aveugle : une Pioche y donne une bille inconnue, qu'il ne planifie pas. Leurs
choix aléatoires passent par leur propre générateur. Un **choix en attente** revient au
joueur, même au milieu de la pioche du tour : sa vue publique voile aussi l'état de départ
que le choix garde. L'aléatoire répond au hasard parmi les cibles éligibles, Terminer
compris, par un générateur à part ; le glouton prend la réponse au meilleur Impact prévu
du tour (« prévoir une réponse », `doc/marbles.md`), un choix après l'autre, et saute
dans son plan une bille qu'un choix aurait empochée entre-temps.

| Joueur | Ce qu'il fait |
|---|---|
| `random` | Uniforme parmi les actions légales (`legalActions` des règles, statuts compris), résolution comprise : la référence basse |
| `greedy` | Évalue par la prévision chaque combinaison du tour (pas d'échange ou chaque échange, puis jusqu'à `--max-placements` poses, 1 par défaut ; au premier tour, chaque remplissage de tout ou partie du triangle, aucune règle ne l'exigeant) et joue celle de la plus haute valeur : l'Impact prévu, plus `--drawn-value` par bille que le plan piocherait ; à égalité, la plus simple |
| `greedy-no-replacement` | Le même, sans jamais poser sur un emplacement occupé : l'écart avec `greedy` mesure ce que rapportent le tic et l'éjection |

Ils sont myopes : aucun ne prévoit au-delà du tour. Un nouveau joueur est une entrée de
plus dans `PLAYERS`, sans toucher au simulateur.

**La valeur d'une bille gagnée en main** (`marbles/tools/drawn-value.js`, 12,68 par défaut) :
le glouton ne voit que l'Impact du tour, et jugerait nulles les billes qui piochent. Elle est
mesurée sur le rapport glouton de référence, d'avant la Pioche : score moyen 164,825 pour 13
billes piochées par partie. `--drawn-value 0` rend le glouton d'avant.

**Le rapport** (ses sections : `marbles/tools/report.js`/`REPORT_HEADINGS`) : score final
(moyenne, médiane, extrêmes, centiles 10, 25, 75 et 90, par interpolation linéaire),
Impact moyen par tour et par numéro de tour, poses (poses sur un emplacement occupé, et
ce qu'apportent la Chiquenaude, l'Éjection et le Tic), pioche et lancers (billes piochées
par des effets, régénérations du sac dont celles en cours de tour, lancers par tour
joué), puis chaque
bille (billes que ses effets ont fait piocher, s'il y en a : chacune revient à l'effet à
Pioche qui l'a demandée, même quand une réaction au mélange ou l'Éveil d'une autre bille
se glisse entre la Pioche et ses billes, `marbles/tools/simulation.js/recordEvents` ;
poses et remplacements,
éjections, retraits par usure,
Vitesse et Masse produites en phase et par chaque déclencheur, en tic, en éjection et
en final, et, avec des sacs
aléatoires, le score moyen avec et sans elle). Les moyennes d'une bille sont prises sur
les parties où elle est dans le sac ; un bonus reçu se compte chez la bille qui le
reçoit, comme dans la vue d'ensemble. Il finit par des observations, sans jamais
proposer de valeur, par le nombre d'actions refusées au joueur (toujours 0 : sinon,
c'est une faute du joueur), et par le nombre d'enchaînements interrompus par la limite de
sécurité du bus (toujours 0 : sinon, une boucle de billes, signalée « ANOMALIE » dans les
observations ; colonne `interruptions` de l'export). Les réactions du pot se lisent par
bille, « en réaction au pot ».

**L'export** : `.json`, un fichier (paramètres, résumé, une entrée par partie) ; `.csv`,
deux fichiers, `<nom>-games.csv` (une ligne par partie) et `<nom>-marbles.csv` (une
ligne par bille). Les chiffres par bille sont ceux du rapport, arrondis au centième une
seule fois (`marbles/tools/stats.js`).

**Durée** : environ 30 secondes pour 1 000 parties gloutonnes (le glouton prévoit chaque
combinaison du tour), quelques secondes pour l'aléatoire.

## Comparer avant et après

```
node marbles/tools/compare.js
node marbles/tools/compare.js --games 300
node marbles/tools/compare.js --ref main --save comparaison
```

Les six simulations de référence (les trois joueurs, sur le sac de test et sur des sacs
aléatoires de 13 billes à 2 exemplaires au plus), jouées sur un commit (`--ref`, le
dernier par défaut) et sur le code en cours, à mêmes graines. Le commit est extrait dans
un dossier temporaire (`git archive`), effacé à la fin : ni le dépôt ni l'index ne sont
touchés. Le côté « avant » joue avec le simulateur du commit : un changement du
simulateur lui-même se voit aussi.

La sortie, d'abord une ligne par simulation : « identique », ou combien de lignes
changent et si les résultats (score final, Impact par tour :
`REPORT_RESULT_HEADINGS`) en font partie. Puis chaque ligne changée, « avant : » et « après : », sous son contexte : le titre
de sa section, ou sa bille dans la section des billes. Enfin un bilan : rapports
identiques, résultats, actions refusées et enchaînements interrompus après le changement
(toujours 0 : sinon, « ANOMALIE »). La durée n'est jamais comparée. `--save <dossier>`
garde les rapports (`avant/` et `apres/`). Environ 7 secondes à 200 parties et 40 à 1 000, toutes les
simulations tournant en parallèle.

## Vérifier les outils

```
node tools/run-checks.js marbles-tools
```

Domaine `marbles-tools` (`marbles/checks/marbles-tools.check.js`) : état construit,
journal lisible (chaque type de `JOURNAL_EVENTS`), vue publique des joueurs, choix du
glouton contre une recherche exhaustive, aucune action refusée sur 50 parties par
joueur, glouton meilleur que l'aléatoire, déterminisme du rapport, surcharges, sacs,
égalité des chiffres entre rapport et exports, attribution des pioches à l'effet qui
les demande, et différence de deux rapports (titres connus du comparateur, contexte,
résultats, durée ignorée). Les outils étant liés à la vraie table
(`marbles/tools/game-rules.js`), ces vérifications la jouent aussi, mais n'en attendent
aucun chiffre : ce qu'elles comparent se déduit de la table et des réglages.

## Les vérifications du jeu des billes

Les billes du jeu (`marbles/content/types/`) changent à chaque itération de design. Les
vérifications des MÉCANISMES ne passent donc jamais par elles :

- **Une table figée** : `marbles/checks/fixtures/marbles.js`, une bille par mécanisme
  (`aging_flick`, `hit_pocket`, `one_shot`…), écrites en entier, usure comprise, et
  `CHOICELESS_TYPES`, la même sans cible au choix ni Éjecter. Ses parties prennent leurs
  réglages dans `FIXTURE_SETTINGS`, jamais dans `MARBLES_SETTINGS` :
  `fixtureRules()` en compose les règles. Pour vérifier un mécanisme nouveau, mieux
  vaut y AJOUTER une bille que changer une bille existante.
- **Les textes par leurs clés** : les vérifications de vue passent la traduction de test
  `marbles/checks/helpers.js`/`keyText` là où la vue attend `t`. Elles lisent le gabarit et
  ses valeurs (`event.draw{marbles: [<aging_flick>]}`), jamais la rédaction : réécrire un
  texte ne les casse pas. Les phrases complètes ont une dizaine de TÉMOINS par langue
  (domaine `marbles-view`, `checkWitnesses`), sur des billes fabriquées qui ne prennent
  aux vraies que leur nom.
- **Le contrat des vraies billes** : domaine `marbles-content`. La table et le sac de
  départ se valident, chaque bille a son nom et ses textes sans gabarit brut, un profil
  sonore complet, des parties au hasard gardent leurs invariants, et la prévision
  correspond au réel. Aucune attente chiffrée sur une bille.
- **Des sections** : chaque domaine découpe ses vérifications par `run.section`
  (`lib/check.js`) ; une exception n'arrête que sa section, comptée comme un échec.
- **Les fixtures partagées** sont dans `marbles/checks/helpers.js` (état de partie,
  billes posées, parties au hasard, traduction de test, une instance de statut posée à
  la main, `statusInstance`, et la propriété « prévision = réel » sur un cas,
  `forecastMatches(rules, state, action)`), la propriété « prévision = réel » sur des
  états aléatoires dans `marbles/checks/fixtures/forecast-property.js`.

**Les domaines** : la liste qui fait foi, dans leur ordre d'exécution, est
`marbles/checks/index.js`/`MARBLES_SUITES` ; ils sont lancés par le point d'entrée unique
des vérifications (`node tools/run-checks.js` pour tous, `node tools/run-checks.js
<domaine>` pour un seul). Ce que vérifie chacun, aujourd'hui : `marbles` (les règles du
réducteur), `marbles-pocket` (le pot), `marbles-path` (le chemin des billes : la Chute,
Défausser, Rebond, Ramasser), `marbles-zones` (conditions d'état et nombre de billes par
zone), `marbles-relative` (les cibles relatives), `marbles-statuses` (les statuts :
définitions, cumuls, caractéristiques, modificateurs, réactions, durées, quantités, sur
la table des statuts de test `FIXTURE_STATUSES`), `marbles-choice` (cibles au choix et
Éjecter), `marbles-bus` (le bus d'évènements), `marbles-tally` (les valeurs de partie),
`marbles-forecast` (la prévision), `marbles-view` (la narration et ses textes),
`marbles-sequence` (la séquence de résolution), `marbles-tools` (les outils, ci-dessus),
`marbles-content` (le contrat des vraies billes), `marbles-screen` (l'écran,
ci-dessous). Un domaine ajouté à `MARBLES_SUITES` doit l'être aussi ici.

## Vérifier l'écran au terminal

```
node tools/run-checks.js marbles-screen
```

Domaine `marbles-screen` (`marbles/checks/marbles-screen.check.js`) : l'écran des billes
joué au clavier sous Node, par son banc d'essai (`marbles/checks/fixtures/screen-bench.js`).
Le banc ouvre l'écran sur la vraie pile d'écrans, sur un état de la table des
vérifications, et lui passe son monde extérieur (`io`, en-tête de
`marbles/view/screen.js`) : les annonces relevées, les textes par leurs clés, les sons
relevés sans rien jouer, une horloge FACTICE avancée à la main, une minuterie qui ne part
jamais. Les menus que l'écran ouvre gardent leurs vrais modules ; un faux `document`
relève ce qu'ils annoncent.

```
const bench = openScreenBench(rules, state);   // l'écran ouvert sur `state`
bench.key("Enter"); bench.key("r", ["shift"]); // des touches, au sommet de la pile
bench.advance(500);                            // 500 ms d'horloge, un battement
bench.said; bench.sounds; bench.game(); bench.top(); bench.close();
```

Il vérifie : l'ouverture, prendre et poser (sélection, confirmation, Échap), l'échange et
son refus, la séquence de résolution (une étape par battement, Retour arrière,
blocage, passage et sa garde contre un second Entrée), un menu qui fige la séquence, un
choix au milieu d'une résolution, la fin de partie. Domaine `nodeOnly`
(`core/checks/index.js`) : dans la console du jeu, `runChecks()` le saute et le dit,
pour ne jamais écrire dans les vraies régions d'annonce.

## Tester l'écran dans le navigateur

Le banc d'essai (domaine `marbles-screen`) joue les touches de l'écran, mais sans le
lecteur d'écran, le son ni le vrai temps réel. Pour eux : le kit de test en jeu
(`tools/test-kit.js`, mode d'emploi en tête), `startMarbles`, qui ouvre l'écran des
billes sur une partie neuve à graine imposée, ou sur un état construit (le format de
`marbles/tools/state-builder.js`) après des actions déjà jouées : par exemple, une
résolution suspendue sur un choix, pour en essayer les touches. L'écran s'ouvre alors
sans pioche, sur la question, et reprend la résolution après la réponse comme s'il
l'avait lancée.
