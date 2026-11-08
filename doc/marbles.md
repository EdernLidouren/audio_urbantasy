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
| `view/marbles/sequence.js` | La file d'étapes de la séquence de résolution et ses pauses (pur) |
| `view/marbles/history.js` | L'historique : les messages de jeu du tour précédent (pur) |
| `view/marbles/history-screen.js` | Le menu de l'historique |
| `view/marbles/navigation.js` | Le curseur dans le triangle, les zones, l'ouverture de la sélection d'emplacement (pur) |
| `view/marbles/sounds.js` | Les sons de l'écran : repères des évènements, balise au survol, musique |
| `view/marbles/sound-queue.js` | La file de sons, qui étale ceux d'un même geste (pur) |
| `tools/marbles/` | La boîte à outils : partie au terminal, cas construits, simulateur (`doc/marbles-tools.md`) |
| `core/checks/marbles.check.js`, `marbles-bus.check.js`, `marbles-forecast.check.js`, `marbles-view.check.js`, `marbles-sequence.check.js` | Vérifications |

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
clay: { base: [speed(1)], apex: [speed(4)], hit: [speed(2)], sound: "medium" },
cats_eye: { base: [speed(3)], baseVariant: { rightBase: [mass(1)] }, apex: [speed(3)], sound: "small" },
magnifier: {
  base: [speed(1)],
  baseVariant: {
    leftBase: [{ ...speed(4), target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }],
  },
  apex: [speed(2)],
  sound: "medium",
},
```

Les champs d'effet (`base`, `baseVariant`, `apex`, `hit`, `knockout`) sont tous facultatifs :
absent, aucun effet. `maxWear` vaut 3 par défaut. `sound`, obligatoire, est son profil sonore
(`small`, `medium` ou `large`, voir « Sons ») : de la présentation, que la simulation accepte
sans jamais le lire. **Ajouter une bille** : sa ligne dans la table, avec son profil, son nom
dans chaque langue (vérifié par le domaine `marbles-view`), et sa place dans `STARTING_BAG`
pour la mettre en jeu. En français, le nom porte sa forme `de` (« d'argile »,
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
| R | la vue d'ensemble du tour (voir plus bas) |
| L | le menu de l'historique (voir plus bas) |
| I | tour, score, Vitesse et Masse du tour, échange |
| S | nombre de billes au sac, pioche par tour |
| D | nombre de billes en défausse |

Une valeur négative porte le vrai signe moins, collé au nombre (« Vitesse −3 », U+2212) :
un lecteur d'écran le lit, là où il peut taire un trait d'union. Un gabarit d'effet
l'écrit lui-même ; un compteur passe par `view/marbles/narration.js`/`formatCounter`.

**Poser** : Entrée sur une bille la sélectionne et ouvre la **sélection d'emplacement**.
Le curseur passe sur le premier emplacement vide dans l'ordre des phases (base gauche,
base droite, pointe), sur la base gauche si tout est occupé, et le dit : « Sélection :
agate. Choisissez un emplacement. Base droite ». Tant qu'elle dure, seuls les trois
emplacements sont accessibles : la main n'existe plus pour le curseur, Bas sous une base
bute (`stepCursor(…, triangleOnly)`). Échap l'annule et ramène sur la bille, dans la main ;
après la pose, le curseur revient aussi dans la main.

Entrée sur un emplacement ouvre une confirmation (`view/menus/confirmation.js`, le modèle
commun à tout le jeu), toujours, même sur un emplacement vide. Ses lignes d'information se
lisent et ne s'activent pas (Entrée n'y fait rien) :

1. « Poser argile en pointe ? » ;
2. les valeurs prévues, sur leur propre ligne, au format de la vue d'ensemble (R) :
   « Vitesse +8 », valeurs produites seulement, non nulles, bonus reçu compris, sans
   texte d'effet ; « aucun effet » si rien ;
3. sur un emplacement occupé, « Éjection de calot : Vitesse +3 », ou « … : aucun effet » ;
4. sur un emplacement occupé, « Tic d'argile : Vitesse +2 », ou « … : aucun effet » ;
5. Annuler (Échap aussi : la sélection d'emplacement reprend) ;
6. Confirmer.

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

### Vue d'ensemble (R)

Une seule annonce, d'un bloc et sans pause, tirée de la prévision du triangle actuel
(`describeOverview`) : d'abord le résumé, l'information la plus souvent cherchée, puis
chaque emplacement dans l'ordre des phases.

```
Prévision : Vitesse 9, Masse 2, Impact 18. Base gauche, argile : Vitesse +1.
Base droite, vide. Pointe, calot : Vitesse +8.
```

Vitesse et Masse comprennent ce que le tour a déjà gagné (Tic, Éjection) ; l'Impact
applique les planchers. Un emplacement dit les valeurs que sa bille PRODUIT, après
conditions et bonus reçus, jamais un texte d'effet : valeurs nulles omises, « aucun
effet » si rien. Un bonus se compte chez la bille qui le reçoit : la loupe en base gauche
dit « aucun effet », le calot qu'elle renforce « Vitesse +12 ». Même gabarit que les
phases de la séquence (`outcomeLine`) : la prévision et la résolution se disent pareil.

### Séquence de résolution (Maj+R)

**Maj+R** lance la résolution, le modificateur évitant une fausse manipulation. La
simulation résout le tour et pioche le suivant tout de suite ; ce qui suit n'est que de la
présentation, une file d'étapes (`view/marbles/sequence.js`) dite avec une pause après
chacune :

1. « Résolution du tour 3. » (au tour 1, suivi de « Entrée pour passer la résolution. »),
   enchaînée SANS PAUSE sur la phase de base gauche : les deux partagent la première
   étape (`resolutionSteps`), une pause nulle entre deux étapes ferait couper la première
   annonce par la seconde ;
2. à 4. chaque phase, dans l'ordre : « Base gauche, argile : Vitesse +1. », « Base
   droite, vide. », avec les règles de la vue d'ensemble ;
5. « Impact 18. Score 42. » ;
6. une étape par bille usée : « Calot est usé et part à la défausse. » (l'adjectif
   s'accorde au genre du nom, attribut `gender` des noms français) ;
7. « Le triangle tourne d'un cran dans le sens horaire. » (le nombre de crans et le sens
   sont des paramètres du texte, constante `ROTATION` de `narration.js`) ;
8. la pioche : « Vous piochez agate. » ou « Main pleine, pas de pioche. », précédée s'il
   y a lieu de « Le sac est vide : la défausse est mélangée et forme un nouveau sac. » ;
9. « Début du tour 4, jouez vos billes. »

Au dernier tour, ni rotation ni pioche : l'Impact et les retraits mènent à la fin de
partie. Sur un sac régénéré trop petit, la fin de partie remplace la suite.

**Construite du journal** (`buildSteps`, la même pour une pose, un échange et la pioche
du tour 1) : chaque évènement qui se dit devient une étape, à sa place chronologique ;
un évènement muet (`phase`, `knockout`, `hit`, `removed`) rejoint l'étape suivante,
l'usure et la fin de tour la précédente, pour que leurs sons partent avec elle. Deux
règles d'ordre seulement : les pioches consécutives se disent en une liste, et le début
de tour vient après sa pioche. Un effet d'un nouveau déclencheur s'insère donc comme une
étape de plus, sans retoucher la séquence ; il lui faut son gabarit (`EFFECT_TEMPLATES`),
sans quoi `buildSteps` lève.

**Pauses** : base plus supplément par caractère de l'annonce, deux réglages de
`MARBLES_SETTINGS` (`resolutionPauseBaseMs`, 400 ; `resolutionPausePerCharMs`, 40), validés
au chargement. La file avance par `onFrame` : un menu ouvert par-dessus (aide, abandon) la
fige. Retour arrière redit l'étape et relance sa pause. Une étape pourra un jour attendre
la fin d'un son au lieu d'une durée.

**Pendant la séquence**, tout le reste est refusé d'un son de blocage, sans parole pour ne
pas couper l'étape : pose, échange, Maj+R, R, déplacements, I, S, D, L et leurs menus. La
séquence se termine quand sa dernière étape est dite : le joueur a la main pendant
qu'elle se dit.

**Passer** : Entrée (ou Espace, la même action) amène directement au début du tour
suivant, ou à la fin de partie, sans dire les étapes d'avant ni jouer leurs sons. L'état
ne change pas : il était déjà complet avant la première étape.

### Sons

Les sons du minijeu sont rangés à part, dans `assets/sounds/marbles/` et
`assets/musics/marbles_classic`. Les clés vivent dans `config/marbles-values.js`, vérifiées
par l'audit du contenu ; la lecture, dans `view/marbles/sounds.js`.

**Profils** : chaque bille a un profil sonore (`sound`), qui lui donne sa **balise** (sa
voix, à la pioche et sous le curseur) et sa **chute** (à la pose). Trois profils aujourd'hui,
`small`, `medium` et `large` (`MARBLE_SOUND_PROFILES`), une voix chacun ; les noms de fichier
prévoient plusieurs voix par profil (`marble_small_2_beacon`…). Une bille sans profil connu
fait échouer le chargement.

**Musique** : `marbles_classic`, de l'ouverture de l'écran au retour au menu principal, en
fondu, au volume de la musique. Un seul morceau : en boucle ; plusieurs : enchaînés avec une
respiration, comme en ville. Elle continue sous l'aide et les menus des billes.

**Sons d'évènement** : un point d'accroche par type d'évènement du journal
(`MARBLE_EVENT_CUES`), muet s'il vaut `null`. Il dit quels **repères** l'évènement produit,
et quand, sur la ligne de temps du geste (`eventCues`) :

- brassage du sac (`marbles_shuffling`), à l'ouverture de la partie (la simulation mélange le
  sac à sa création, sans évènement : l'écran le joue) et à chaque `bagRegenerated` ;
- pioche : la balise de chaque bille piochée, l'une après l'autre ; la première attend
  `shuffleToDrawMs` (900 ms) après un brassage, les suivantes `drawSoundIntervalMs` (350 ms) ;
- pose : la chute de la bille posée (remplacement compris, en attendant un son de tic) ;
- phase : pendant la séquence de résolution, la balise de la bille active quand vient la
  phase de son emplacement, avec l'étape qui la dit ; un emplacement vide reste muet ;
- échange : la chute de la bille choisie, puis celle de l'autre `swapSoundDelayMs` (150 ms)
  plus tard ; vers un emplacement vide, une seule chute.

Les repères passent par une **file de sons** (`view/marbles/sound-queue.js`), avancée par
`onFrame` comme la séquence : le son seul attend, le joueur garde la main. Un menu ouvert
par-dessus la fige ; passer la séquence (Entrée) vide ce qui restait à venir. Pendant la
séquence, les sons d'une étape partent avec elle.

**Balise au survol** : la balise de la bille sur laquelle le curseur arrive, dans la main, sur
un emplacement occupé (à l'ouverture de la sélection d'emplacement aussi), et dans les menus
du sac et de la défausse (à l'ouverture et à chaque déplacement). Une seule à la fois : la
suivante coupe la précédente. Une butée, qui laisse le curseur en place, n'en joue pas.

**Stéréo** : un son de bille s'entend à sa place sur la table, en panoramique gauche-droite
(`MARBLES_SOUND_PLACES`, `panAt`) : la main de −0,6 à +0,6, la première bille tout à gauche
(une bille seule au milieu) ; base gauche −0,4, base droite +0,4, pointe au centre. La balise
d'une bille piochée s'entend à sa place dans la main, la cascade de pioche va donc de gauche
à droite ; la chute d'une pose et la balise de phase à l'emplacement ; la balise au survol là
où est le curseur. Le brassage et les menus du sac et de la défausse restent au centre. Pas
encore de profondeur.

**Volumes** : balises (pioche, phase et survol) au volume des balises, elles ont vocation à être
positionnées ; brassage et chutes au volume de l'interface. Tous les sons des billes sont
permanents et préchargés à l'ouverture de l'écran. Les gestes de l'écran gardent les sons de
menu (`select`, `cancel`, `block`, `refusal`).

### Historique (L)

**L** ouvre un menu vertical (`view/marbles/history-screen.js`, un menu de `lib/menu.js`) :
les messages de jeu du tour précédent, du plus ancien en haut au plus récent, puis
« Fermer » ; Échap ferme aussi. Les messages se lisent, Entrée n'y fait rien. Titre :
« Historique du tour 3 ».

Portée : un tour complet, de « Début du tour n−1… » à « Début du tour n… » inclus, rien
d'avant. Il couvre les messages de la phase de jeu (pose, éjection, tic, défausse,
échange) comme ceux de la séquence (ouverture, phases, résultat, retraits, rotation,
pioche). La pioche du tour 1, dite avant le premier début de tour, n'appartient à aucun
tour. Au premier tour : « Aucun historique pour l'instant. », puis « Fermer ». En fin de
partie, L reste permise : la fin de partie ferme le dernier tour, dont l'historique va
jusqu'à elle.

Ne sont retenus que les messages des étapes (`buildSteps`, `resolutionSteps`), qui portent
chacune leurs `messages` (l'ouverture et la base gauche, une étape, restent deux
messages) : jamais une annonce de navigation (curseur, zone, fiche, R, S, D, I), une
sélection, un refus, ni l'indication « Entrée pour passer la résolution. ». L'écran
(`recorded`) les fait entrer au moment où il construit les étapes, pas au moment où elles
se disent : l'historique est complet même après une séquence passée. Pendant la séquence,
L est refusée comme le reste. L'historique (`view/marbles/history.js`) ne vit que le temps
de l'écran, comme la séquence : la partie de billes n'a pas de sauvegarde.

## Tester

```
node tools/run-checks.js marbles marbles-bus marbles-forecast marbles-view marbles-sequence marbles-tools detail-card
node tools/marbles/play.js --seed 42
```

Les autres outils (cas construit à la main, simulateur) : `doc/marbles-tools.md`.

Le mode d'emploi du kit terminal est en tête de `tools/marbles/play.js` : une partie se
joue au clavier ou par un fichier de commandes, `prevoir` dit la prévision sans rien
changer, et `--json` sort le journal complet pour comparer deux parties. En jeu, mode
debug : `window.debugStartMarbles(seed)` et `window.debugMarbles()`.
