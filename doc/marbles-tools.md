# Boîte à outils des billes

Les outils de développement du jeu des billes, réunis dans `tools/marbles/`. Ils ne
sont jamais chargés par le jeu, passent par le vrai réducteur (`core/marbles.js`) et
la vraie prévision (`core/marbles-forecast.js`), et ne changent ni règle ni valeur :
ils jouent, montrent et mesurent. Leur sortie se lit au lecteur d'écran : des phrases
et des lignes simples, jamais de tableau. Les règles elles-mêmes : `doc/marbles.md`.

## Les outils

| Outil | À quoi il sert |
|---|---|
| `tools/marbles/play.js` | Jouer une partie au terminal, à graine imposée, au clavier ou par un fichier de commandes |
| `tools/marbles/case.js` | Construire un état précis à la main, lui appliquer des actions, lire le journal |
| `tools/marbles/simulate.js` | Le simulateur : des milliers de parties jouées par un joueur automatique, et un rapport |
| `tools/marbles/rules-doc.js` | Le document de règles (`doc/marbles-rules.md`) : génère son annexe des billes depuis la table (`--write`), et vérifie qu'elle est à jour et que chaque mot-clé y figure avec sa description exacte (lancé par `tools/verify.js`) |

Les modules qu'ils partagent, purs (sans Node, donc vérifiables) :

| Module | Rôle |
|---|---|
| `tools/marbles/game-rules.js` | Les règles du jeu, liées une fois à la table des billes : le point de composition des outils |
| `tools/marbles/commands.js` | Les commandes texte (« poser 1 pointe ») communes à `play.js` et `case.js` |
| `tools/marbles/format.js` | L'état et le journal en lignes lisibles |
| `tools/marbles/state-builder.js` | L'état construit à la main (`buildState`) et l'application d'actions (`applyActions`) |
| `tools/marbles/players.js` | Les joueurs automatiques et la vue publique qu'ils reçoivent |
| `tools/marbles/drawn-value.js` | La valeur d'une bille gagnée en main pour le glouton, et comment elle a été mesurée |
| `tools/marbles/simulation.js` | Les parties du simulateur, les graines dérivées, les sacs |
| `tools/marbles/stats.js` | Le résumé chiffré d'une simulation |
| `tools/marbles/report.js` | Le rapport en phrases, et ses observations |
| `tools/marbles/export.js` | L'export JSON ou CSV |

## Jouer une partie

```
node tools/marbles/play.js --seed 42
node tools/marbles/play.js --seed 42 --json < commandes.txt
```

Le mode d'emploi est en tête du fichier : `etat`, `brut` (l'état complet, sac
compris), `poser`, `echanger`, `prevoir`, `fin`, `journal` (lisible) ou `journal json`.
Un choix en attente se dit avec sa question et ses cibles ; on y répond par `choisir 2`
(la bille 2 de la main), `choisir pointe`, ou `terminer` (« jusqu'à N ») ; pendant une
résolution, la suite se dit après la réponse.

## Construire un cas

```
node tools/marbles/case.js tools/marbles/examples/replacement.json
```

Un fichier JSON : `state`, la description de l'état (format en tête de
`tools/marbles/state-builder.js` : tour, triangle avec usure, main avec tours en main
(`"clay:2"`), sac du haut vers le
bas, défausse, pot et billes perdues (`"pot": ["agate"]`, dans l'ordre d'arrivée, jamais
plus que `potCapacity`), compteurs, valeurs de partie (`"tally": { "flick": { "turn": 1, "game": 3 } }`, le
reste à zéro), réglages), et `actions`, des commandes texte (`poser 1
pointe`, `echanger gauche pointe`, `resoudre`, `piocher`, `prevoir`, `choisir 2`,
`choisir pointe`, `terminer`) ou des actions brutes du réducteur ; une action suspendue
sur un choix affiche le choix en attente et ses cibles, la suivante y répond. L'outil affiche l'état de départ, le journal ou le refus de chaque
action, puis l'état final ; `--json` ajoute tout cela brut. Une description fausse
(bille, champ ou emplacement inconnu, usure impossible) lève une erreur claire.

## Le simulateur

```
node tools/marbles/simulate.js --games 1000 --player greedy
node tools/marbles/simulate.js --player random --random-bag 13 --max-copies 2
node tools/marbles/simulate.js --bag-file tools/marbles/examples/bag.txt --turns 12
node tools/marbles/simulate.js --games 200 --export resultats.csv
```

Toutes les options sont en tête de `tools/marbles/simulate.js` : nombre de parties,
graine de départ, joueur, poses envisagées par le glouton, valeur d'une bille gagnée en
main (`--drawn-value`), sac (de test, aléatoire avec une limite d'exemplaires, ou d'un
fichier), surcharges des réglages (taille de main, lancers, pioches, nombre de tours, pour
cette simulation seulement) et export.

**Déterminisme** : chaque partie reçoit ses graines dérivées de la graine de départ
(partie, joueur, sac). Mêmes options, même rapport au caractère près, sauf la dernière
ligne, la durée.

**Les joueurs** (`tools/marbles/players.js`) ne savent que ce qu'un humain sait : ils
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
| `random` | Uniforme parmi les actions légales (`core/marbles.js/legalActions`), résolution comprise : la référence basse |
| `greedy` | Évalue par la prévision chaque combinaison du tour (pas d'échange ou chaque échange, puis jusqu'à `--max-placements` poses, 1 par défaut ; au premier tour, chaque remplissage de tout ou partie du triangle, aucune règle ne l'exigeant) et joue celle de la plus haute valeur : l'Impact prévu, plus `--drawn-value` par bille que le plan piocherait ; à égalité, la plus simple |
| `greedy-no-replacement` | Le même, sans jamais poser sur un emplacement occupé : l'écart avec `greedy` mesure ce que rapportent le tic et l'éjection |

Ils sont myopes : aucun ne prévoit au-delà du tour. Un nouveau joueur est une entrée de
plus dans `PLAYERS`, sans toucher au simulateur.

**La valeur d'une bille gagnée en main** (`tools/marbles/drawn-value.js`, 12,68 par défaut) :
le glouton ne voit que l'Impact du tour, et jugerait nulles les billes qui piochent. Elle est
mesurée sur le rapport glouton de référence, d'avant la Pioche : score moyen 164,825 pour 13
billes piochées par partie. `--drawn-value 0` rend le glouton d'avant.

**Le rapport** : score final (moyenne, médiane, extrêmes, centiles 10, 25, 75 et 90,
par interpolation linéaire), Impact moyen par tour et par numéro de tour, fins de partie,
remplacements, pioche et lancers (billes piochées par des effets, régénérations du sac dont
celles en cours de tour, lancers par tour joué, fins par pioche impossible), puis chaque
bille (billes que ses effets ont fait piocher, s'il y en a, poses et remplacements,
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
seule fois (`tools/marbles/stats.js`).

**Durée** : environ 3 secondes pour 1 000 parties gloutonnes.

## Vérifier les outils

```
node tools/run-checks.js marbles-tools
```

Domaine `marbles-tools` (`core/checks/marbles-tools.check.js`) : état construit,
journal lisible, vue publique des joueurs, choix du glouton contre une recherche
exhaustive, aucune action refusée sur des centaines de parties, glouton meilleur que
l'aléatoire, déterminisme du rapport, surcharges, sacs, et égalité des chiffres entre
rapport et exports.
