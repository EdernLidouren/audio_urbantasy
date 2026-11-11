# Jeu des billes

Minijeu de stratégie solo, sans adresse ni adversaire, lancé depuis le menu principal.
Prototype : indépendant de la partie principale (ni inventaire, ni collection, ni
sauvegarde). Le joueur pose des billes sur un triangle à trois emplacements qui tourne
à chaque tour, et marque en synchronisant leurs effets.

| Fichier | Rôle |
|---|---|
| `marbles/types/` | Les billes, une par fichier, et leur registre `index.js` (donnée pure) |
| `marbles/effects.js` | Les formes courtes des clauses, `speed(n)`, `mass(n)`, `draw(n)`, `polish(n, cible?)`, `crack(n, cible?)` et `pocket(cible?)` (avec `FIRST_IN_HAND`), et les sources `turnsInHand()`, `activeSize(calibre)` et `tally(valeur, portée)` des montants calculés |
| `config/marbles-values.js` | Réglages, phases, déclencheurs, mot-clé En poche, valeurs de partie, modèle de fiche, sac de test, sons (donnée pure) |
| `core/marbles-rules.js` | Les règles liées à une table de billes : le point d'entrée de la simulation hors du core |
| `core/marbles.js` | La simulation : état, réducteur, écouteurs, journal, codes de refus |
| `core/marbles-effects.js` | Le modèle d'effet : clauses, actions, conditions, effet imprimé |
| `core/marbles-bus.js` | Le bus d'évènements interne à la simulation |
| `core/marbles-tally.js` | Le registre des valeurs de partie : le seul à les écrire, et leur lecture publique |
| `core/marbles-counters.js` | Les compteurs des valeurs de partie : générés (mots-clés, actions, Vitesse et Masse) et déclarés (évènements réels) |
| `core/marbles-forecast.js` | La prévision : le vrai moteur sur une copie de l'état |
| `view/marbles/screen.js` | L'écran de jeu et sa table de touches |
| `view/marbles/pile-screen.js` | Le menu d'une pile de billes, sac ou défausse |
| `view/marbles/card.js` | La fiche d'une bille, lue dans le modèle `MARBLE_CARD_MODEL` |
| `lib/detail-card.js` | Le mécanisme générique des fiches : assemblage et curseur secondaire |
| `lib/real-time.js` | L'horloge temps réel à deux moteurs (images et minuterie) de l'écran |
| `view/marbles/narration.js` | Ce qui se dit, à partir de l'état, du journal et de la prévision (pur) |
| `view/marbles/sequence.js` | La file d'étapes de la séquence de résolution et ses pauses (pur) |
| `view/marbles/history.js` | L'historique : les messages de jeu du tour précédent (pur) |
| `view/marbles/history-screen.js` | Le menu de l'historique |
| `view/marbles/keywords.js` | L'aide des mots-clés de la bille sous le curseur (E, Maj+E) |
| `view/marbles/tally-screen.js` | Le menu de debug des valeurs de partie (Maj+L) |
| `view/marbles/navigation.js` | Le curseur dans le triangle, les zones, l'ouverture de la sélection d'emplacement (pur) |
| `view/marbles/sounds.js` | Les sons de l'écran : repères des évènements, roulements, balise au survol, musique |
| `view/marbles/sound-queue.js` | La file de sons, qui étale ceux d'un même geste (pur) |
| `view/marbles/rolls.js` | Le mouvement d'une bille qui roule : durée, position, vitesse (pur) |
| `tools/marbles/` | La boîte à outils : partie au terminal, cas construits, simulateur (`doc/marbles-tools.md`) |
| `core/checks/marbles.check.js`, `marbles-bus.check.js`, `marbles-tally.check.js`, `marbles-forecast.check.js`, `marbles-view.check.js`, `marbles-sequence.check.js` | Vérifications |

## Déroulement d'un tour

1. **Pioche** : 5 billes au premier tour, 1 ensuite (`firstTurnDraw`, `drawPerTurn`), par
   la pioche unifiée (voir plus bas). Juste avant, chaque bille déjà en main gagne un tour
   à son **compteur de tours en main** (voir « Simulation ») ; une bille piochée ce tour
   reste à 0.
2. **Échange** (facultatif, une fois par tour, avant toute pose) : le contenu de deux
   emplacements, usure comprise. Un emplacement vide en fait un déplacement ; deux vides
   sont refusés, pour ne pas gâcher l'échange du tour. Ni Tic ni Éjection. Ce n'est pas un
   lancer.
3. **Pose** : chaque pose depuis la main est un **lancer**, ouvert par la **Chiquenaude** de
   la bille (voir « Déroulé d'une pose »), sur un emplacement vide ou
   occupé ; `throwsPerTurn` (5) par tour, à côté de `maxHandSize` dans les réglages (deux
   capacités du joueur, qui pourront devenir ses caractéristiques). Lancers épuisés : la
   pose est refusée (`noThrowsLeft`), dès la prise de la bille dans l'écran. La limite
   empêche une boucle pilotée par le joueur, un Tic qui pioche à chaque pose par exemple,
   que la limite du bus ne couvre pas : ce sont des actions du joueur. Le joueur est
   **seul responsable de ses poses** : la résolution se lance à tout moment de la phase de
   jeu, quel que soit l'état du triangle (plein, partiel ou vide), premier tour compris, et
   rien ne refuse une pose qui laisserait des emplacements impossibles à remplir.
4. **Phases** : base gauche, base droite, pointe ; un emplacement vide saute sa phase.
   Elles partent des compteurs du tour : Vitesse (0 en début de tour) et Masse (1), que
   Chiquenaude, Tic et Éjection ont déjà pu modifier. Chaque bille applique son effet (un Polissage ou
   une Fêlure sur elle-même compris) puis prend 1 d'usure, même si cela l'amène à son
   maximum. Une bille qu'une Fêlure a retirée, ou qu'Empocher a envoyée au pot, avant sa
   phase la saute.
5. **Pot** : chaque bille du pot, dans l'ordre d'arrivée, joue son effet **En poche, à
   chaque résolution** (voir « Le pot »). Une bille sans cet effet passe sans rien dire.
6. **Retraits par usure**, dans l'ordre des phases : chaque bille à son usure maximale
   quitte son emplacement, rejoint la défausse, puis son **Final** se déclenche (voir
   « Les déclencheurs »). Pas d'Éjection.
7. **Impact** = max(0, Vitesse) × max(1, Masse), ces planchers ne valant que pour ce
   calcul final, pot et Final compris : ils passent avant lui. Il s'ajoute au Score.
8. **Rotation** : base gauche → pointe, pointe → base droite, base droite → base gauche.

### La pioche unifiée

Toute pioche, celle du début de tour comme celle d'un effet (Pioche), suit la même mécanique,
bille par bille (`core/marbles.js`/`drawOne`) :

1. main pleine : la bille reste au sac, sans régénération ;
2. sinon, le sac a une bille : on la pioche (`draw`), puis son **Éveil** (`awaken`, voir
   « Les déclencheurs »), réglé jusqu'au bout, ce qu'il déclenche compris (une Pioche qui
   pioche à son tour), avant la bille suivante ;
3. sinon, la défausse n'est pas vide : mélangée par le hasard de la partie, elle devient le
   sac (`bagRegenerated`) ; puis la **Trouvaille** de chaque bille active, dans l'ordre des
   phases (voir « Les déclencheurs ») ; puis la pioche reprend, en relisant ces conditions
   depuis le début (une Trouvaille a pu remplir la main, prendre la bille ou remplir la
   défausse) ;
4. sinon (sac et défausse vides) : rien à piocher.

Le premier arrêt interrompt la pioche et se dit (`drawSkipped`, motif `handFull` ou
`noMarbles`, « Plus aucune bille à piocher. ») : les billes restantes ne sont pas piochées.
Une régénération peut donc avoir lieu à tout moment : en début de tour, pendant la phase de
jeu (un Tic qui pioche) ou pendant la résolution. Ses Trouvailles vont aux compteurs du tour
en cours : en début de tour, celui qui commence, la résolution précédente ayant remis
Vitesse et Masse à 0 et 1. De même pour un Éveil : une bille piochée en début de tour
s'éveille au compte du tour qui commence.

L'ordre complet d'une bille piochée : (régénération éventuelle, puis Trouvailles), pioche de
la bille, son Éveil et ce qu'il déclenche, puis la bille suivante s'il y en a. L'Éveil du
mica (Pioche 1) peut ainsi en enchaîner d'autres, bornés par le sac, la défausse, la main
pleine et la limite du bus.

### Fin de partie

Toutes les conditions de fin vivent à un seul endroit, `END_CONDITIONS` de
`core/marbles.js`, chacune consultée à un moment du tour (après la pioche du début de tour,
ou en fin de résolution). Aujourd'hui :

- `outOfMarbles` : la pioche du début de tour n'a pu donner aucune bille, faute de billes
  (sac et défausse vides dès la première). Une main pleine n'est jamais une fin de partie ;
- `turnsCompleted` : le dernier tour est résolu.

Un futur mode (un Impact minimal à atteindre…) y branche les siennes ; chaque raison a son
texte, `marbles.event.game_over.<raison>`. Un sac de départ peut compter moins de billes
que le triangle ; vide, la partie s'arrête à la première pioche (`outOfMarbles`).

### Le pot

Le **pot** garde des billes **en poche** toute la partie : leurs effets **En poche** y
jouent, comme des effets permanents construits pendant la partie. Une bille n'y entre
jamais par un geste du joueur, seulement par l'action **Empocher** d'une bille. Deux zones
de l'état, sérialisées (`core/marbles.js`, en-tête) :

- `pot` : les billes en poche, dans l'ordre d'arrivée, au plus `potCapacity` (3 par défaut,
  `MARBLES_SETTINGS.potCapacity`, à côté de `maxHandSize` et `throwsPerTurn` : trois
  capacités du joueur) ;
- `lost` : les **billes perdues**, envoyées au pot plein. Elles n'y entrent pas, et n'en
  ont donc pas les effets.

Ni l'une ni l'autre ne revient jamais dans le sac à un mélange, ni ne quitte sa zone : une
bille n'en sort pas aujourd'hui.

**Empocher** (`pocket`, sans montant) déplace une bille vers le pot, depuis là où elle est.
Sa cible :

- aucune : **la bille elle-même**, où qu'elle soit au déclenchement : sur son emplacement
  (phase, Tic, Trouvaille, Éjection), en main (à son Éveil), déjà à la défausse (à son
  Final). Refusée à la validation dans une Chiquenaude (en cours de lancer) et dans le pot ;
- un emplacement : la bille qui y est ;
- `FIRST_IN_HAND` (`"firstInHand"`) : la première bille de la main, dans l'ordre affiché.

Une cible vide (emplacement vide, main vide, bille qui n'est plus là) : sans effet, noté au
journal (`targetEmpty`, « Main vide : rien à empocher. »). Une bille empochée **depuis le
triangle** quitte son emplacement (`removed`, cause `"pocket"`) : ce n'est ni une usure ni
une éjection, donc ni Final ni Éjection ; elle compte dans « billes sorties du triangle » ;
sa phase, si elle n'avait pas eu lieu, est sautée. Une bille ne passe qu'**une fois** d'une
zone à l'autre : empochée pendant sa propre Éjection, elle va au pot, jamais à la défausse ;
pendant son propre Final, déjà défaussée, elle quitte la défausse pour le pot (elle n'est
jamais aux deux). Puis, au pot (`pocketed`, « porcelaine est mise en poche. ») ses effets
d'entrée se règlent aussitôt ; pot plein (`lost`, « Le pot est plein : porcelaine est
perdue. »), rien d'autre.

**En poche** (`pocketed`) est un champ de bille, un objet de **moments**, déclarés une fois
dans `config/marbles-values.js`/`MARBLE_POCKET` :

```js
pocketed: { entry: [speed(10)] },          // la porcelaine
pocketed: { resolution: [mass(1)] },       // l'agate
```

| Moment | Effet (`trigger`) | Évènement | Joue |
|---|---|---|---|
| `entry`, à l'entrée | `pocketEntry` | `pocketed` | quand la bille entre effectivement au pot, juste après son arrivée (jamais si elle est perdue) |
| `resolution`, à chaque résolution | `pocketResolution` | `potResolution` | une fois par tour, après les trois phases et avant les retraits, chaque bille du pot dans l'ordre d'arrivée (une bille empochée plus tôt dans la résolution comprise) |

Chaque moment déclare son id, son effet, son évènement, son moment pour la règle des cibles
(`anytime` à l'entrée, `afterPhases` à chaque résolution : une Vitesse ou une Masse ciblée y
est refusée, les phases étant passées ; Polissage, Fêlure, Empocher et Pioche ciblés passent)
et ses textes (fiche, journal, R). Aucune action sur la bille elle-même dans le pot. Vitesse
et Masse vont aux compteurs du tour. **Ajouter un moment** (une réaction à un évènement
global) : une entrée dans `moments`, ses textes, et l'émission de son évènement dans
`core/marbles.js` ; ses valeurs de partie, sa ligne de fiche et ses écouteurs suivent.

### Déroulé d'une pose

Toute pose d'une bille A commence par sa **Chiquenaude** : A quitte la main (son compteur de
tours en main avec elle) et, **en cours de lancer**, n'est ni en main ni sur le triangle ;
elle ne compte ni dans la main (une Pioche y trouve sa place libre) ni parmi les billes
actives (la source `activeSize`) ; une régénération pendant son lancer ne lui donne pas de
Trouvaille. L'emplacement visé se lit ensuite : sur un emplacement
vide, A le rejoint, sans Éjection ni Tic. Sur un emplacement occupé par une bille B, dans
cet ordre, visible au journal :

| Étape | Évènement du journal |
|---|---|
| Chiquenaude de A | `flick` (`turnsInHand` : son compteur en quittant la main), puis `effect` si A en a une, suivi de ses pioches et de ses actions sur une bille |
| Éjection de B | `knockout`, puis `effect` si B en a une, suivi de ses pioches (`draw`…) si elle pioche |
| B est retirée de son emplacement | `removed` (`cause: "replacement"`) |
| B rejoint la défausse | `discarded` (`cause: "replacement"`) |
| A rejoint l'emplacement | `placed` |
| Tic de A | `hit`, puis `effect` si A en a un, suivi de ses pioches s'il pioche |

`knockout` et `hit` portent le remplacement en cours, `replacement: { placed, ejected }`
(les ids de A et de B), que lit la condition de calibre relatif (voir « Conditions »).

**Une Chiquenaude qui vide l'emplacement visé** (une Fêlure qui amène B à son usure
maximale, comme celle de la plombée) : B suit le retrait par usure habituel (`removed` et
`discarded`, `cause: "wear"`, puis son Final), et la pose se poursuit comme sur un
emplacement vide, sans Éjection ni Tic. La pose reste un lancer dans tous les cas.

## Une bille

Un fichier de `marbles/types/`, de la donnée pure, inscrit dans le registre
`marbles/types/index.js`, dont l'en-tête détaille les champs. Seuls imports permis : les
formes courtes des clauses (`marbles/effects.js`) et les constantes de calibre
(`config/marbles-values.js`). Par exemple `marbles/types/magnifier.js` :

```js
export default {
  base: [speed(1)],
  // En base gauche, renforce la pointe si elle donne de la Vitesse.
  baseVariant: {
    leftBase: [{ ...speed(4), target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }],
  },
  apex: [speed(2)],
  size: SMALL,
};
```

Le registre est un **contenu** : le core ne l'importe jamais (CLAUDE.md). On le lie UNE fois
aux règles du jeu, puis on joue avec elles :

```js
const marbles = createMarblesRules(MARBLE_TYPES); // core/marbles-rules.js
let game = marbles.createGame(seed);
const { ok, state, events } = marbles.reduce(game, { type: "draw" });
marbles.forecast(state);
```

Les règles valident la table à la composition et exposent ce qui lit une bille :
`createGame`, `reduce`, `forecast`, `maxWearOf`, `effectAt`, et la table elle-même
(`types`). Ce qui ne lit aucune bille (`legalActions`, les refus, `SLOTS`…) s'importe
directement de `core/marbles.js`. Les fonctions du core qui prennent `types` restent sa
plomberie interne.

- **Le jeu** compose ses règles dans `main.js`, qui les passe à l'écran des billes ; l'écran
  les passe à la narration, aux fiches et aux menus des piles, comme il leur passe `t`.
- **La boîte à outils** a son point de composition, `tools/marbles/game-rules.js`.
- **Les vérifications** créent les leurs, avec la vraie table ou une table fabriquée ; une
  table fabriquée ne retombe jamais en silence sur celle du jeu.
- **Les sons** lisent le calibre d'une bille directement dans le registre : son profil
  sonore et la force de ses chocs en viennent.

Le registre et le sac de test sont validés ensemble au démarrage
(`core/marbles.js`/`validateMarblesContent`, appelé par `main.js` et par l'audit du
contenu). L'ordre du registre compte : les sacs aléatoires du simulateur y tirent leurs
billes.

Les champs d'effet (`base`, `baseVariant`, `apex`, et un par déclencheur : `flick`, `hit`,
`knockout`, `final`) sont tous facultatifs :
absent, aucun effet. `maxWear` vaut 3 par défaut. Un champ obligatoire, validé au
chargement par la simulation (`validateMarbleTypes`) :

- `size`, son **calibre** (Size) : `SMALL`, `MEDIUM` ou `LARGE`, toujours par ces
  constantes de `config/marbles-values.js`. Un entier derrière elles (1, 2, 3), pour que les
  comparaisons (plus petit, plus grand, écart) se fassent sur lui, et seulement là. Ses noms :
  minibille, normale, calot (peewee, standard, boulder), `marbles.size.<id>.name`, l'id
  venant de `MARBLE_SIZES`. **Statique** : aucune action ne le change. Lu par les
  conditions de calibre et par le son, qui en tire le profil sonore et la force des chocs
  (voir « Sons ») : une seule source de vérité pour la taille d'une bille.

**Ajouter une bille** : son fichier dans `marbles/types/` avec son calibre, sa ligne dans
`marbles/types/index.js`, son nom dans chaque langue (vérifié par le domaine
`marbles-view`), et sa place dans `STARTING_BAG` pour la mettre en jeu. En français, le nom
porte sa forme `de` (« d'argile », « de gorille ») : `{ "base": "argile", "de": "d'argile" }`,
pour « Tic d'argile ». Un sac est une liste d'ids : les doublons y sont permis.

### Effets et clauses

Un effet est une liste de clauses (`core/marbles-effects.js`) :

- **action** : ce que fait la clause, avec son `amount` (un entier, ou un **montant
  calculé**, voir plus bas) :
  - `speed`, `mass` : ajoutent `amount` (négatif permis) à la Vitesse ou à la Masse ;
  - `draw`, la **Pioche** : la bille pioche `amount` billes (au moins 1) par la pioche
    unifiée, à tout moment du tour. Jamais de cible. Utilisable dans tout champ d'effet :
    `{ ...draw(1) }` au Tic de l'œil-de-chat, à l'Éjection du grès, en base du mica.
    Une bille piochée pendant la phase de jeu (par un Tic, une Éjection) se joue aussitôt,
    dans la limite des lancers ; une bille piochée pendant la résolution attend le tour
    suivant ;
  - `polish`, le **Polissage** : retire `amount` d'usure (au moins 1), jamais sous 0. Une
    bille arrivée à son maximum pendant la résolution, puis polie avant l'étape des
    retraits, n'est plus retirée ;
  - `crack`, la **Fêlure** : ajoute `amount` d'usure (au moins 1), jamais au-delà du
    maximum. Si elle l'y amène, la bille est retirée AUSSITÔT, comme par usure : elle
    rejoint la défausse et son Final se déclenche, son emplacement devient vide. En
    résolution, sa phase est sautée si elle n'avait pas eu lieu ; en phase de jeu,
    l'emplacement peut recevoir une pose, sans Tic. L'usure de phase (+1) continue de
    retirer les billes à l'étape des retraits ;
  - `pocket`, **Empocher**, sans montant : envoie au pot la bille elle-même, celle d'un
    emplacement ou la première de la main (voir « Le pot ») ;
- **cible** (`target`, facultative, pour les actions qui l'acceptent) : un emplacement.
  Pour une Vitesse ou une Masse, sans cible, la clause agit sur le compteur du tour ou
  s'ajoute à l'effet de la bille ; avec une cible, elle donne un **bonus** à la bille de
  cet emplacement. Pour un Polissage ou une Fêlure, sans cible, la bille elle-même ; avec
  une cible, la bille de cet emplacement (un emplacement vide : sans effet, noté au
  journal, `targetEmpty`) ;
- **condition** (`when`, facultative) : évaluée au déclenchement ; fausse, la clause ne
  produit rien.

### Montants calculés

Un `amount` peut être **calculé** au déclenchement : `{ base, step, source, max? }`, soit
`base + step × la valeur de source`, plafonné à `max` s'il est donné
(`core/marbles-effects.js`/`amountOf`). `step` vaut au moins 1, `max` dépasse `base` ; pour
une action à montant positif (Pioche, Polissage, Fêlure), `base` vaut au moins 0. Évalué à
0, la clause ne produit rien. Il n'entre jamais dans l'imprimé (`printedStat`). C'est le
SEUL mécanisme d'un montant qui dépend du moment : un « par » (« Vitesse +1 par minibille
active ») en est un, base 0, pas 1. L'argile et le grès :

```js
flick: [speed({ base: 0, step: 1, source: turnsInHand(), max: 5 })],
base: [speed({ base: 0, step: 1, source: activeSize(SMALL) })],
apex: [speed({ base: 0, step: 1, source: tally("windfall", "game"), max: 10 })], // le verre
```

| Source (`source`) | Vaut | Fiche |
|---|---|---|
| `{ type: "turnsInHand" }` | le compteur de tours en main de la bille elle-même : 0 hors de la main ; pendant sa Chiquenaude, celui qu'elle avait en quittant la main | « Chiquenaude : Vitesse +1 par tour en main, maximum +5, actuellement +2. » |
| `{ type: "activeSize", size }` | les billes actives (sur le triangle) de calibre `size`, la bille elle-même comprise si elle en est (déjà retirée, dans un Final, elle s'ajoute ; en cours de lancer, dans une Chiquenaude, non) | « Base : Vitesse +1 par minibille active. » (grès) |
| `{ type: "tally", tally, scope }` (`tally(id, portée)`) | la valeur de partie `tally` dans la portée `scope` (`"turn"`, ce tour ; `"game"`, cette partie), lue dans le registre au déclenchement (voir « Valeurs de partie ») | « Chiquenaude : Vitesse +2 par chiquenaude ce tour, maximum +6, actuellement +4. » (loupe) |

Chaque source est déclarée UNE fois, dans `core/marbles-effects.js`/`AMOUNT_SOURCES` :
ses champs et leur validation, sa valeur dans la situation (`value`), son gabarit (`text`,
qui reçoit `{effect}`, le pas déjà dit), ses paramètres de texte (`params`, des valeurs ;
`names`, des noms par clé i18n, dont la vue fait des références de nom), et `current` :
vrai si sa valeur se connaît hors de tout déclenchement, à partir de la bille seule. La
fiche dit alors la **valeur actuelle** (« actuellement ») là où la bille se trouve : avec
son compteur dans la main, 0 au sac, en défausse et sur le triangle (« Vitesse +2, +1 par
tour en main, actuellement +3 » avec une base), et la valeur de partie du moment, lue
dans le registre de la partie en cours, où que soit la bille (à zéro hors de toute
partie) ; une source qui dépend du moment (`activeSize`) n'en dit pas. R, la
confirmation et la séquence ne disent que la valeur finale, celle de la prévision, qui
fait évoluer le registre sur sa copie (une Chiquenaude de loupe s'y compte elle-même).
**Ajouter une source** : son entrée dans `AMOUNT_SOURCES` et son gabarit dans chaque
langue (vérifié par le domaine `marbles-view`), rien d'autre ; une valeur de partie est
déjà une source, par `tally`, dont la validation vérifie l'identifiant (le contexte de
validation porte la liste des compteurs, `tallies`) et dont le texte se compose :
« {effect} par {unit} {scope} », l'unité de la valeur (`marbles.tally.<id>.unit`) et sa
portée (`marbles.tally.scope.<portée>`).

### Conditions

Une condition ou un montant calculé lit la **situation** de l'effet au déclenchement
(`core/marbles-effects.js`) : le triangle, la bille qui joue l'effet (sur le triangle, en
main, déjà retirée ou en cours de lancer, avec son compteur de tours en main) et, pendant un
Tic ou une Éjection, le remplacement en cours.

| Condition (`when`) | Vraie si | Exemple (fiche) |
|---|---|---|
| `{ type: "printedStat", slot, stat, atLeast }` | la bille de `slot` a, imprimé à cet emplacement, au moins `atLeast` de `stat` ; emplacement vide : faux | « Vitesse +4 à la pointe si son effet de pointe donne au moins Vitesse +1 » (loupe) |
| `{ type: "relativeSize", marble, is }` | pendant un remplacement, la bille `marble` (`ejected`, l'éjectée, ou `placed`, la posée) est `is` (`smaller` ou `larger`) que l'autre ; calibres égaux : ni l'un ni l'autre | « Tic : Vitesse +4 si la bille éjectée est plus petite. » (gorille), « Éjection : Pioche 1 si la bille posée est plus grosse. » (mica) |
| `{ type: "sizeAt", slot, size }` | la bille de `slot` est de calibre `size` ; emplacement vide : faux | « Pointe : Masse +1 et Masse +2 si la base gauche est un calot. » (agate) |

`relativeSize` n'existe que pendant un remplacement : la validation la refuse hors d'un champ
de déclencheur marqué `replacement` dans `MARBLE_TRIGGERS` (le Tic, vu par la posée ;
l'Éjection, vue par l'éjectée).

Le calibre se compte aussi, par la source `activeSize` d'un montant calculé (voir
« Montants calculés »).

Dans R, la confirmation et la séquence, seules les **valeurs finales** se disent (« base
gauche, grès : Vitesse +2. »), jamais la condition ni la source : elles ne s'entendent que
dans la fiche.

**Règle anti-boucle** : une condition lit toujours l'effet IMPRIMÉ d'une bille
(`printedStat`), jamais un effet déjà modifié ; le calibre est statique. Aucune dépendance
circulaire n'est possible, et le joueur raisonne à partir de ce qu'il entend. L'imprimé
compte les clauses sans cible, sans condition, à montant fixe.

**Le bonus** (`bonus`, sur l'entrée du triangle) s'ajoute à l'effet de phase de la bille
qui le reçoit, et s'annonce chez elle avec son total effectif (« Vitesse +10 »). Il suit la
bille dans un échange, se perd si elle est remplacée, et disparaît à la fin de la
résolution : il ne vaut que s'il arrive avant la phase de sa cible. Donné à un emplacement
vide, il est perdu.

**Les valeurs** d'un effet : une par action de valeur, sous son nom (`{ speed, mass,
draw }`). Le core les applique, la vue les dit (« Vitesse +2 », « Pioche 1 »), la prévision
les rend. Les **actions sur une bille** (`polish`, `crack`, `kind: "marble"` dans
`CLAUSE_ACTIONS`) ne s'additionnent pas : chaque clause s'applique, dans l'ordre, après
l'annonce de l'effet et sa pioche, et émet son évènement (`polished`, `cracked`). Elles
se disent chez la bille qui les produit (« Base gauche, sulfure : Fêlure 1 à la
pointe. »), jamais dans la valeur de phase de celle qui les reçoit.

### La règle des cibles

Une cible n'a de sens que si l'effet ciblé peut encore se produire.

- Une **Vitesse ou une Masse ciblée** modifie l'effet de phase de la bille visée : elle ne
  vaut que si cette phase peut encore avoir lieu ce tour. La validation refuse les cas
  TOUJOURS impossibles : une cible dans un Final (après toutes les phases : sa Vitesse et
  sa Masse vont toujours aux compteurs), une pointe qui vise un emplacement, une base qui
  vise la base gauche, une variante de base qui vise sa propre base ou une phase passée.
  Les cas qui dépendent de la position (une base qui vise la base droite, jouée depuis la
  base droite) se tranchent à l'exécution : le bonus est perdu, l'évènement `effect` le
  note dans `lost` (`{ slot, reason, ...valeurs }`, `reason` : `phasePassed` ou
  `emptySlot`), et la prévision n'en montre rien.
- Un **Polissage ou une Fêlure** peut viser un emplacement depuis n'importe quel moment,
  Final et Chiquenaude compris : la bille visée reste sur le triangle. Mais pas la bille
  elle-même dans un Final, qui a déjà quitté le triangle, ni dans une Chiquenaude, où elle
  n'y est pas encore (refusé à la validation).
- Une **Chiquenaude** joue pendant la phase de jeu : une Vitesse ou une Masse ciblée y est
  valide, toutes les phases restant à venir.

Le moment de chaque champ vient de la phase (ses emplacements) ou du déclencheur
(`moment` de `MARBLE_TRIGGERS` : `play`, `afterPhases` ou `anytime`, la Trouvaille, que la
validation ne refuse jamais : un bonus ciblé dont la phase est passée se perd à l'exécution,
noté dans `lost` ; `marble`, pour la bille hors du
triangle).

**Ajouter** une action : une entrée dans `CLAUSE_ACTIONS` (`core/marbles-effects.js`), sur
le modèle des conditions, qui déclare ses champs (`fields` : une action sans `target` refuse
toute cible à la validation), sa validation (`validate`) et ce qu'elle ajoute aux valeurs
(`apply`) ; puis ses textes dans `view/marbles/narration.js`/`ACTION_TEXTS` (`up` pour une
valeur positive, `down` pour une négative), lus par les fiches, R, la confirmation et la
séquence. Une action sans textes fait échouer le chargement. Si son application touche à
l'état autrement qu'un compteur, comme la Pioche, `fireEffect` (`core/marbles.js`) l'exécute
après l'annonce de l'effet. Une condition : une entrée dans `CONDITIONS` et son texte dans
`CONDITION_TEXTS` ; une condition sans texte fait échouer le chargement. Une source de
montant : voir « Montants calculés ». Un nom de calibre glissé
dans un texte passe par `nameRef`, avec ses formes françaises et anglaises `indef` (« un
calot ») et `noun` (« bille normale »).

### Les déclencheurs

Hors la phase (base, pointe), une bille réagit par ses **déclencheurs** : l'**Éveil**
(`awaken`, à chaque bille réellement piochée, du sac à la main, pioche du tour ou effet,
juste après sa pioche et avant la suivante, la bille en main à 0 tour en main ; jamais pour
une bille restée au sac faute de place ; ses valeurs vont aux compteurs du tour en cours ;
une interruption du bus, comme la Trouvaille ; une action sur la bille elle-même y est
refusée, ciblée elle est permise ; jamais prévu, voir « La prévision »), la
**Chiquenaude** (`flick`, à chaque pose depuis la main, vide ou occupé, avant tout le reste,
la bille en cours de lancer), le **Tic** (`hit`,
posée sur un emplacement occupé, après l'éjection de l'occupante), la **Trouvaille**
(`windfall`, à chaque régénération du sac depuis la défausse, à tout moment du tour, chez
chaque bille ACTIVE, dans l'ordre des phases, avant que la pioche ne reprenne : une
interruption du bus, voir « Le bus d'évènements » ; ses valeurs vont aux compteurs du tour
en cours ; une bille en main, au sac, en défausse ou en cours de lancer n'en a pas ; une
bille retirée par une Trouvaille précédente non plus), l'**Éjection**
(`knockout`, remplacée) et le **Final** (`final`, retirée par usure, une fois à la
défausse ; jamais à une éjection, un échange ou une pose). Ils sont déclarés UNE fois, dans
`config/marbles-values.js`/`MARBLE_TRIGGERS`, une entrée chacun :

```js
{
  id: "final",              // la valeur `trigger` de l'évènement `effect`
  field: "final",           // le champ d'effet de la bille
  event: "final",           // l'évènement du journal qui le déclenche
  marble: "removed",        // la bille concernée : "onSlot" (sur l'emplacement de
                            // l'évènement), "removed" (déjà retirée, que l'évènement nomme),
                            // "thrown" (en cours de lancer, que l'évènement nomme) ou
                            // "drawn" (tout juste piochée, en main)
  forecast: { line: "slot" }, // sa prévision : avec l'emplacement de la bille ;
                            // { line: "placement", marble, order }, une ligne de confirmation
                            // (sur un emplacement occupé seulement si `replacement`) ;
                            // { line: "regeneration" }, après « Le sac sera régénéré. » ; ou
                            // { line: "none" }, jamais prévu (l'Éveil)
  texts: {
    name: "marbles.keyword.final.name",               // le nom du mot-clé
    description: "marbles.keyword.final.description", // ce qu'il fait (touches E, Maj+E)
    card: "marbles.card.final",
    effect: "marbles.event.effect_final",
    slot: "marbles.outcome.final",
  },
  card: "below",            // sa place dans la fiche, au-dessous de l'annonce principale
}
```

Tout ce qui les connaît lit cette liste, jamais une copie : la validation de la table (les
champs permis), les écouteurs du core (`EVENT_TRIGGERS`, construit depuis elle, la phase
seule y étant écrite à la main), la prévision, la narration (gabarits, lignes de
confirmation, évènements muets), le modèle de fiche (`MARBLE_CARD_MODEL.below` en est
dérivé, dans l'ordre de la liste, celui de la vie d'une bille : éveil, chiquenaude, tic,
trouvaille, éjection, final), l'aide des mots-clés et les outils (chiffres par
déclencheur ; leurs mots, `tools/marbles/format.js`/`TRIGGER_WORDS`, échouent au
chargement s'il en manque un). La liste est validée au chargement du core
(`validateMarbleTriggers`) : un déclencheur sans nom ni description de mot-clé échoue ; ses
textes, par le domaine `marbles-view`. **Ajouter un déclencheur** : son entrée, ses textes
FR et EN (dont son nom et sa description de mot-clé), ses mots dans les outils, et
l'émission de son évènement dans `core/marbles.js` au bon moment du tour ; ses valeurs de
partie et sa place dans l'aide des mots-clés suivent d'office.

Les **phases** sont déclarées de même, dans `config/marbles-values.js`/`MARBLE_PHASES` :
`{ id, field, slots, texts: { name, description } }` (pointe, puis base, sur ses deux
emplacements), validées au chargement (`validateMarblePhases` : chaque emplacement dans une
phase, une seule ; nom et description obligatoires). Le core en tire les champs de phase,
le moment de chacun (règle des cibles) et les mots-clés de phase des valeurs de partie.

## Simulation

Le réducteur, `reduce(state, action)` des règles (`core/marbles.js`/`marblesReduce` derrière), est pur et rend toujours `{ ok, state, events, error }`.
L'en-tête de `core/marbles.js` décrit l'état, les actions et chaque évènement du journal.
Une action interdite ne lève jamais : `ok` est faux, l'état inchangé, et `error` est un
code de `MARBLE_ERRORS`, dont le texte est `marbles.error.<code>`.

Une bille n'a d'usure que sur le triangle (`{ marble, wear, bonus? }`), et de **compteur de
tours en main** que dans la main (`{ marble, turnsInHand }`) ; au sac et en défausse, c'est
un simple id. Une bille qui revient repart donc à zéro par construction : quitter la main
(pose ou tout autre départ) remet son compteur à 0. Le compteur gagne 1 au début de chaque
tour pour les billes déjà en main avant la pioche ; il se sérialise avec l'état et n'est lu
que par les montants calculés (source `turnsInHand`).

### Valeurs de partie (Tally)

Des compteurs tenus par la simulation, dans l'état (`tally`, `{ <id>: { turn, game } }`,
sérialisé avec lui), que lisent les montants calculés, la prévision, le menu de debug
(Maj+L) et, plus tard, les succès. Le mécanisme, `core/marbles-tally.js`, ne sait rien du
jeu ; les compteurs viennent de `core/marbles-counters.js`, en une liste
(`core/marbles.js`/`TALLY_COUNTERS`), chacun `{ id, category, count(event, context) }`.

**Deux portées pour chaque compteur** : « ce tour » (`turn`) revient à zéro au début de
chaque tour, avant sa pioche (à l'émission de `turnStarted`, le premier évènement de la
pioche du tour) ; « cette partie » (`game`) n'est à zéro qu'en début de partie
(`createGame`). Entre la fin de la résolution et la pioche suivante, « ce tour » garde la
valeur du tour fini.

**Moment** : un compteur de déclenchement ou d'évènement augmente À L'ÉMISSION de son
évènement, avant que le bus ne le traite, donc avant que les billes qui y réagissent ne
soient évaluées : une Chiquenaude qui compte « par chiquenaude ce tour » se compte
elle-même (la première du tour lit 1). Un compteur de quantité réelle augmente à
l'émission de l'évènement qui dit ce qui s'est appliqué, après plancher ou plafond.

**Un mot-clé et l'évènement auquel il réagit sont deux compteurs**, avec deux noms : une
pose sur une bille sans Éjection donne +1 bille éjectée, +0 éjection ; un mélange donne
+1 mélange, et une Trouvaille par bille active qui en a une.

| Catégorie | Compteurs (id) | Source | Compte |
|---|---|---|---|
| Déclenchements | `awaken`, `flick`, `hit`, `windfall`, `knockout`, `final`, `apex`, `base`, `leftBase`, `rightBase`, `pocketEntry`, `pocketResolution` | générés : un par déclencheur de `MARBLE_TRIGGERS`, un par mot-clé de phase (`core/marbles.js`/`PHASE_KEYWORDS`, tirés de `MARBLE_PHASES`), un par moment En poche (`MARBLE_POCKET`) | +1, par bille, quand le mot-clé se déclenche chez une bille qui a un effet pour ce moment : son champ n'est pas vide (pour une base : l'effet de base, ou sa variante de l'emplacement), ou elle a reçu un effet extérieur pour ce moment (un bonus ciblé sur sa phase). Un effet à condition fausse compte ; une phase sautée (emplacement vide, bille retirée avant) ne compte pas. `base` = `leftBase` + `rightBase` |
| Actions | `draw`, `drawQuantity`, `polish`, `polishQuantity`, `crack`, `crackQuantity`, `pocket`, `pocketQuantity` | générés depuis les actions de `CLAUSE_ACTIONS` qui déclarent `keyword` | les déclencheurs : un par application (une Pioche par effet joué qui pioche ; un Polissage, une Fêlure ou un Empocher par application, cible vide comprise) ; la quantité réelle : billes réellement piochées par une Pioche (`draw` de cause `"effect"`), usure réellement rendue ou ajoutée (`applied` de `polished`, `cracked`), billes réellement déplacées par Empocher (`pocketed` ou `lost`) |
| Vitesse et Masse | `speedGains`, `speedGained`, `speedLosses`, `speedLost`, et les mêmes pour `mass` | générés depuis les actions de valeur sans `keyword` | dans chaque effet joué (`effect`), la valeur réellement appliquée aux compteurs du tour (bonus reçu compris ; un bonus perdu n'est jamais appliqué), avant les planchers de l'Impact : une occurrence de gain ou de perte par effet, et le total en valeur absolue |
| Évènements | `thrownMarbles`, `hitMarbles`, `ejectedMarbles`, `shuffles`, `drawnMarbles`, `wornMarbles`, `triangleExits`, `pocketedMarbles`, `lostMarbles` | déclarés : `config/marbles-values.js`/`MARBLE_TALLIES` | billes lancées (`flick`), tiquées (`hit` : posées sur un emplacement occupé), éjectées (`removed`, cause `"replacement"`), mélanges (`bagRegenerated`), billes piochées (`draw`, toutes causes), usées (`removed`, cause `"wear"`), sorties du triangle (`removed`, toutes causes : aujourd'hui, usées + éjectées + mises en poche depuis le triangle), mises en poche (`pocketed`), perdues (`lost`) |

Un évènement réel se déclare ainsi :

```js
{ id: "wornMarbles", events: ["removed"], match: { cause: "wear" } },
// filter: { type: "size", size: MEDIUM }  facultatif : la bille de l'évènement
```

`match` : des champs de l'évènement et leur valeur. `filter` : la bille que nomme
l'évènement est de ce calibre, seulement sur des évènements qui nomment une bille toujours
connue (`core/marbles.js`/`JOURNAL_EVENTS`), jamais la pioche, dont la bille est cachée
dans la prévision.

- **Textes** : par convention, `marbles.tally.<id>.name` (le menu, au pluriel :
  « chiquenaudes ») et `marbles.tally.<id>.unit` (la source, au singulier : « par
  chiquenaude »), vérifiés dans chaque langue par le domaine `marbles-view`.
- **Un seul écrivain** : `core/marbles-tally.js` (`recordTally`, appelé par `transact` à
  chaque émission, et `emptyTally`). Tout le reste lit par `tallyValue(tally, id, portée)`,
  qui lève sur un identifiant ou une portée inconnus.
- **Validation au chargement** : identifiants uniques ; pour les évènements déclarés,
  évènements connus (dans `JOURNAL_EVENTS`, dont la vérification `marbles-tally` contrôle
  qu'il suit le moteur), `match` et filtre.

**Ajouter** : un déclencheur ou une action mot-clé ont leurs compteurs d'office ; un
évènement réel, une entrée dans `MARBLE_TALLIES`. Dans tous les cas, leurs deux textes
dans chaque langue, rien d'autre : chaque compteur devient une source de montant dans ses
deux portées et une ligne du menu de debug.

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
- **Une exception, l'interruption** (`settle`) : son évènement et tout ce qui en découle se
  règlent jusqu'au bout tout de suite, dans une file à part, avant ce qui attendait. Deux
  en sont : la Trouvaille, qui se joue entre la régénération et la reprise de la pioche, et
  l'Éveil, entre la pioche d'une bille et celle de la suivante, même quand cette pioche
  vient d'un effet en plein traitement (un Tic qui pioche).
- **Le journal s'écrit à l'émission**, dans l'ordre où l'état change : la file étant premier
  entré, premier sorti, c'est l'ordre de traitement, sauf pour une interruption, réglée
  avant ce qui attendait mais émise après. Les valeurs de partie aussi (voir plus haut).
- **Limite de sécurité** : `MAX_EVENTS_PER_ACTION`. Au-delà, le bus lève
  `MarbleEventLimitError` et le réducteur refuse l'action (`eventLimit`), l'état reçu
  n'ayant jamais été touché.

`EVENT_TRIGGERS` dit quels évènements déclenchent un effet : les phases, et les
déclencheurs de `MARBLE_TRIGGERS` (Éveil, Chiquenaude, Tic, Trouvaille, Éjection, Final). Les autres passent au journal,
prêts à servir.

### La prévision

La prévision, `forecast(state, action)` des règles (`core/marbles-forecast.js`), dit ce qu'une action produirait, sans écrire de règle : il copie
l'état, applique l'action sur la copie (ou rien, pour le triangle actuel), lance la vraie
résolution (`runResolution`) et lit le journal. Elle ne peut donc pas diverger du moteur :
la vérification `marbles-forecast` le contrôle sur des centaines d'états aléatoires.

**À l'aveugle** : la copie (`blindCopy`) ne connaît du sac et de la défausse que leur nombre
de billes, jamais leur identité ni leur ordre, et n'a pas le hasard de la partie ; le
déroulé est aveugle (`reduce(…, { blind: true })`). Une Pioche y a lieu avec ses arrêts
(main pleine, plus de billes) mais pioche une bille inconnue (`UNKNOWN_MARBLE`) ; une
régénération s'annonce sans mélange. La prévision ne lit ni n'avance donc jamais le hasard
réel, et seules une pose ou un échange s'envisagent. Elle rend, en plus des valeurs :
`slotEffects`, par emplacement, les effets prévus avec lui (le Final d'une bille qui
atteindra son usure maximale ce tour, rien sinon) ; `regenerations`, chaque régénération
du sac en chemin, dans l'ordre, `{ effects }` : les effets prévus avec elle (les
Trouvailles des billes actives, connues : seule l'identité des billes piochées reste
cachée), `[]` sans régénération ; `cleared`, par emplacement, la bille
retirée avant sa phase par une Fêlure ; `wear` et `retired`, les changements d'usure et les
retraits, dans l'ordre ; `drawn`, les billes que l'action et la
résolution piocheraient ; `tally`, les valeurs de partie à la fin de la résolution (la
copie porte le registre, qui y évolue comme dans la partie ; le registre réel n'est jamais
touché) ; `uncertain`, vrai si une bille inconnue aurait pu réagir selon son
identité, ses chiffres n'étant alors pas sûrs : aujourd'hui, un Éveil possible.

**Le pot** est déterministe et inclus : `potEffects`, les effets de chaque résolution des
billes du pot, dans l'ordre d'arrivée ; chaque effet prévu porte, s'il a empoché, `pockets`
(`{ marble, lost, entry }`, la bille déplacée, perdue ou non, et l'effet de son entrée),
rattaché à l'effet qui l'a produite (le `by` de `pocketed` et `lost`). `cleared` compte
aussi une bille empochée avant sa phase.

**L'exception de l'Éveil** : la bille piochée étant inconnue, son Éveil ne se prévoit
jamais. Ses effets ne sont jamais dans les valeurs prévues, ni dans le registre de la copie.
La prévision est `uncertain` dès qu'elle pioche au moins une bille et qu'une bille qui
pouvait l'être a un Éveil : une bille du sac ; si le sac est régénéré en chemin, aussi la
défausse et chaque bille qui y part pendant l'action et la résolution. Rien n'est révélé :
la composition du sac et de la défausse est déjà consultable, pas leur ordre. R et la
confirmation finissent alors par « Éveils possibles. » (`awakenPossible`). De même, une
bille piochée à l'aveugle puis empochée reste inconnue (`marble` null dans `pockets`, « une
bille piochée en poche ») ; la prévision est alors incertaine, sans Éveil pour autant. La propriété « prévision = résultat
réel » vaut pour tout ce qui ne dépend pas d'un Éveil ni d'une bille piochée empochée : la
vérification `marbles-forecast` la contrôle sur tout résultat réel où aucun des deux n'a joué, et vérifie qu'un Éveil réel a
toujours été annoncé possible.

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
| Bille en main, au sac, en défausse | « argile, normale, usure 3. 1 sur 5 » |
| Bille active, sans sélection | « gorille, calot, pointe, usure 1 sur 3. » |
| Emplacement vide, sans sélection | « pointe : vide. » |
| Emplacement occupé, bille sélectionnée | « pointe, gorille : Vitesse +10. » (la prévision) |

Le calibre se dit juste après le nom, dans l'annonce principale seulement ; la fiche n'en dit
rien de plus, ses conditions de calibre passant par les champs d'effet.
| Emplacement vide, bille sélectionnée | « pointe » |
| R | la vue d'ensemble du tour (voir plus bas) |
| L | le menu de l'historique (voir plus bas) |
| I | tour, score, Vitesse et Masse du tour, lancers restants, échange |
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
   « Vitesse +6 », valeurs produites seulement, non nulles, bonus reçu compris, sans
   texte d'effet ; « aucun effet » si rien ; suivies du Final de la bille posée si elle
   atteint son usure maximale ce tour (« Vitesse +6. Final : Pioche 1. ») ;
3. toujours, « Chiquenaude d'argile : Vitesse +2 », ou « … : aucun effet » ;
4. sur un emplacement occupé, « Éjection de gorille : Vitesse +3 », ou « … : aucun effet » ;
5. sur un emplacement occupé, « Tic d'argile : Vitesse +2 », ou « … : aucun effet ». Un
   Empocher prévu s'y dit chez la bille qui le produit, avec ce qu'il déplace et l'entrée
   au pot : « Tic de gorille : Vitesse +4 et Empocher la première bille de la main, puis
   porcelaine en poche, à l'entrée : Vitesse +10 » (pot plein : « …, puis pot plein :
   porcelaine perdue ») ; de même dans les valeurs prévues de la bille posée ;
6. pour chaque régénération du sac que la pose et la résolution provoqueraient, « Le sac
   sera régénéré. » (« Le sac sera de nouveau régénéré. » pour les suivantes), puis une
   ligne par Trouvaille qu'elle déclencherait (« Trouvaille de tigrée : Vitesse +3. ») ;
   enfin, si un Éveil est possible, « Éveils possibles. » ;
7. Annuler (Échap aussi : la sélection d'emplacement reprend) ;
8. Confirmer.

Une Chiquenaude qui viderait l'emplacement visé (la plombée sur une argile en pointe) laisse
les lignes d'Éjection et de Tic à « aucun effet » : elles n'auront pas lieu, et le menu
garde sa structure.

Une Pioche s'y dit comme une valeur (« Tic d'œil-de-chat : Pioche 1 »), sans jamais nommer
une bille du sac.

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

Au-dessous, les champs des déclencheurs, facultatifs, dans l'ordre de la vie d'une bille :
éveil, chiquenaude, tic, trouvaille, éjection, final (« Final : Masse +1. ») ; ils viennent de
`MARBLE_TRIGGERS`. En dernier, En poche, un champ par moment (`MARBLE_POCKET` ; dans le
modèle de fiche, `part` désigne le moment) : « En poche, à l'entrée : Vitesse +10. », « En
poche, à chaque résolution : Masse +1. ». Un montant calculé s'y dit avec sa valeur actuelle (voir « Montants
calculés »).

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

### Sac, défausse et pot

**Maj+S**, **Maj+D** et **Maj+P** ouvrent un menu horizontal : une entrée par bille, puis
« Retour » ; Échap ferme aussi. Bornes, cyclage et étoile sont ceux des menus ; fiches
(Ctrl+haut, Ctrl+bas) et mots-clés (E, Maj+E) y marchent sur chaque bille. **P** dit le
pot : « 2 billes sur 3 dans le pot, 1 bille perdue. » (`describePot`, accords compris). Le
menu du pot suit l'ordre d'arrivée ; les billes perdues n'ont pas de menu.

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
Prévision : Vitesse 7, Masse 2, Impact 14. Base gauche, argile : Vitesse +1.
Base droite, mica : Pioche 1. Pointe, gorille : Vitesse +6.
```

Une bille qui atteint son usure maximale ce tour fait suivre sa phase de son Final, compté
dans le résumé : « Pointe, porcelaine : Vitesse +5. Final : Vitesse +4. ». Une bille qui
ne s'use pas ce tour n'en dit rien, une bille sauvée par un Polissage non plus. Une bille
qu'une Fêlure retirera avant sa phase n'a pas d'effet de phase : « Pointe, porcelaine :
retirée avant sa phase. Final : Vitesse +4. ».

Vitesse et Masse comprennent ce que le tour a déjà gagné (Tic, Éjection) ; l'Impact
applique les planchers. Un emplacement dit les valeurs que sa bille PRODUIT, après
conditions et bonus reçus, jamais un texte d'effet : valeurs nulles omises, « aucun
effet » si rien ; une Pioche est une valeur comme une autre (« Pioche 1 »). Un bonus se
compte chez la bille qui le reçoit : la loupe en base gauche dit « aucun effet », le gorille
qu'elle renforce « Vitesse +10 ». Si la résolution régénérerait le sac, « Le sac sera
régénéré. » termine l'annonce, suivi d'une phrase par Trouvaille qu'elle déclencherait, qui
nomme sa bille (« Trouvaille de tigrée : Vitesse +3. »). Chaque régénération se dit ainsi
avec ses propres Trouvailles, comme dans la séquence, la deuxième « de nouveau » : « Le sac
sera régénéré. Trouvaille de tigrée : Vitesse +3. Le sac sera de nouveau régénéré.
Trouvaille de tigrée : Vitesse +3. ». Après les trois emplacements, une ligne par bille du
pot qui a un effet à chaque résolution, dans l'ordre d'arrivée (« Pot, agate : Masse +1. ») ;
aucune pour les autres. Le résumé les compte. Si un Éveil est possible, « Éveils possibles. »
termine l'annonce. Même gabarit que les
phases de la séquence (`outcomeLine`) : la prévision et la résolution se disent pareil.

### Séquence de résolution (Maj+R)

**Maj+R** lance la résolution, à tout moment de la phase de jeu et quel que soit le
triangle, le modificateur évitant une fausse manipulation. La
simulation résout le tour et pioche le suivant tout de suite ; ce qui suit n'est que de la
présentation, une file d'étapes (`view/marbles/sequence.js`) dite avec une pause après
chacune :

1. « Résolution du tour 3. » (au tour 1, suivi de « Entrée pour passer la résolution. »),
   enchaînée SANS PAUSE sur la phase de base gauche : les deux partagent la première
   étape (`resolutionSteps`), une pause nulle entre deux étapes ferait couper la première
   annonce par la seconde ;
2. à 4. chaque phase, dans l'ordre : « Base gauche, argile : Vitesse +1. », « Base
   droite, vide. », avec les règles de la vue d'ensemble, puis une étape par bille du pot
   qui a un effet à chaque résolution (« Pot, agate : Masse +1. »), avec la pause habituelle,
   avant les retraits ; une mise en poche se dit après l'effet qui la produit (« porcelaine
   est mise en poche. », « Entrée au pot de porcelaine : Vitesse +10. Vitesse 10, Masse 1. »,
   ou « Le pot est plein : porcelaine est perdue. ») ; une phase qui pioche est suivie
   de sa pioche (« Base gauche, mica : Pioche 1. », « Vous piochez agate. ») ; un
   Polissage ou une Fêlure, de son application (« Porcelaine se fêle : usure 2 sur 2. »,
   « Porcelaine est polie : usure 1 sur 2. », « Pointe vide : sans effet. ») et des retraits
   qu'une Fêlure provoque, avec leur Final ;
5. une étape par bille usée : « Gorille est usé et part à la défausse. » (l'adjectif
   s'accorde au genre du nom, attribut `gender` des noms français), suivie de son Final
   s'il en a un (« Final de porcelaine : Vitesse +4. ») et de ses pioches ;
6. « Impact 18. Score 42. » ;
7. « Le triangle tourne d'un cran dans le sens horaire. » (le nombre de crans et le sens
   sont des paramètres du texte, constante `ROTATION` de `narration.js`) ;
8. la pioche : « Vous piochez agate. », « Main pleine, pas de pioche. » ou « Plus aucune
   bille à piocher. », précédée s'il y a lieu de « Le sac est vide : la défausse est
   mélangée et forme un nouveau sac. » ;
9. « Début du tour 4, jouez vos billes. »

Au dernier tour, ni rotation ni pioche : les retraits et l'Impact mènent à la fin de
partie. Si la pioche du tour suivant ne trouve plus aucune bille, la fin de partie suit
son arrêt. Une pioche en cours de tour (Tic, Éjection) se dit de la même façon, juste
après l'effet qui la provoque.

**Construite du journal** (`buildSteps`, la même pour une pose, un échange et la pioche
du tour 1) : chaque évènement qui se dit devient une étape, à sa place chronologique ;
un évènement muet (`phase`, `knockout`, `hit`, `removed`) rejoint l'étape suivante,
l'usure, la fin de tour et l'évènement `awaken` la précédente, pour que leurs sons
partent avec elle. Deux règles d'ordre seulement : les pioches consécutives se disent en
une liste, et le début de tour vient après sa pioche. Un Éveil qui a un effet se dit juste
après sa bille piochée (« Vous piochez tigrée. », « Éveil de tigrée : Vitesse +2. Vitesse
2, Masse 1. ») et coupe la liste ; un Éveil sans effet ne la coupe pas. Un effet d'un nouveau déclencheur s'insère donc comme une
étape de plus, sans retoucher la séquence ; il lui faut son gabarit (`EFFECT_TEMPLATES`),
sans quoi `buildSteps` lève.

**Pauses** : base plus supplément par caractère de l'annonce, deux réglages de
`MARBLES_SETTINGS` (`resolutionPauseBaseMs`, 400 ; `resolutionPausePerCharMs`, 40), validés
au chargement.

**Rythme** : la file avance par le temps réel de l'écran (`lib/real-time.js`), un même
battement appelé à chaque image (`onFrame`) ET par une minuterie (50 ms). Les images
s'arrêtent quand la fenêtre passe en arrière-plan ou que le panneau est masqué ; la
minuterie continue, ralentie par le navigateur (environ une fois par seconde), et la
séquence avec elle. Chaque battement mesure le temps écoulé depuis le précédent, quel que
soit le moteur : rien n'est compté deux fois. Une étape au plus commence par battement
(`advanceSequence`) : au retour au premier plan, aucune étape sautée, aucune annonce en
rafale. La file de sons et les roulements suivent le même battement. Un menu ouvert
par-dessus (aide, abandon) la fige : seul l'écran du sommet reçoit le temps, et
l'horloge se recale au retour. Retour arrière redit l'étape et relance sa pause. Une étape pourra un jour attendre
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

**Profils** : le son d'une bille dépend de son **calibre** (couplage voulu, une seule
source de vérité) : un profil sonore par calibre (`MARBLE_SOUND_PROFILES`, indexé par
`SMALL`, `MEDIUM`, `LARGE`), qui lui donne sa **balise** (sa
voix, à la pioche et sous le curseur), sa **chute** (à l'arrivée d'un roulement), son
**roulement** (une boucle, `marble_<taille>_rolling`) et sa **collision** (`impact`,
`marble_<taille>_collision`, quand elle en déloge une autre ou qu'on la déloge), les fichiers
`small`, `medium` et `large` allant aux calibres minibille, normale et calot. Une voix par
profil aujourd'hui ; les noms de fichier en prévoient plusieurs (`marble_small_2_beacon`…).
Un calibre sans profil, ou un profil incomplet, fait échouer le chargement.

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
- pose sur un emplacement vide : la bille roule de sa place dans la main à l'emplacement,
  puis y tombe ;
- pose sur un emplacement occupé (remplacement) : la bille est **tirée** jusqu'à
  l'emplacement, plus vite et presque sans ralentir, puis la **collision** (voir plus bas),
  puis la délogée part à la défausse, lancée par le choc, s'essouffle et y tombe. Le journal
  dit l'éjection avant la pose : la collision attend l'arrivée de la bille tirée ;
- phase : pendant la séquence de résolution, la balise de la bille active quand vient la
  phase de son emplacement, avec l'étape qui la dit ; un emplacement vide reste muet ;
- échange : la bille choisie roule vers l'autre emplacement, puis l'autre part en sens inverse
  `swapSoundDelayMs` (150 ms) plus tard ; chacune tombe à son arrivée. Vers un emplacement
  vide, une seule bille roule ;
- retrait par usure : la bille usée roule de son emplacement à la défausse et y tombe ;
  plusieurs, l'une après l'autre (`outStaggerMs`) ;
- mise en poche : la bille roule de là où elle était (son emplacement, sa place dans la
  main, la défausse) au **pot**, en haut à gauche, en face de la défausse
  (`MARBLES_SOUND_PLACES.pot`), et y tombe, du même roulement qu'une bille usée (`out`), à la
  suite des autres départs. La perte (`lost`) et l'étape du pot (`potResolution`) sont des
  points d'accroche muets, la perte sans place imposée. Son
  Final n'a pas encore de son propre : l'évènement `final` est un point d'accroche muet
  (`MARBLE_EVENT_CUES`), comme `polished`, `cracked` et `targetEmpty` ; une bille retirée
  par une Fêlure part comme une bille usée ;
- rotation : les billes du triangle roulent ensemble, chacune vers l'emplacement suivant
  (l'ordre du cœur, `ROTATION_NEXT`), puis s'y calent avec une chute discrète ; un
  emplacement vide reste muet. Pas de son de rotation à part : les billes suffisent.

Les repères passent par une **file de sons** (`view/marbles/sound-queue.js`), avancée par
`onFrame` comme la séquence : le son seul attend, le joueur garde la main. Un menu ouvert
par-dessus la fige ; passer la séquence (Entrée) vide ce qui restait à venir. Pendant la
séquence, les sons d'une étape partent avec elle.

**Roulements** : un repère de roulement suit un **chemin**, la suite des places par où passe
la bille (deux au moins, le départ et l'arrivée) ; elle passe par les étapes sans s'y
arrêter. La boucle de roulement du profil joue tout le trajet, et chaque frame la déplace
sur la table : position et vitesse
viennent de `view/marbles/rolls.js`, le rendu de la position est celui d'une place
(panoramique et profondeur, voir « Espace »). La bille part à sa vitesse et ralentit
régulièrement jusqu'à sa vitesse d'arrivée : la durée du trajet est la distance divisée par
la vitesse moyenne, et l'arrivée (chute ou choc) tombe à la fin. Le volume suit la vitesse, et
la vitesse de lecture aussi : une bille qui s'essouffle sonne plus doux et plus grave, comme
une bande qu'on freine. Un fondu de `fadeMs` à l'entrée et à la sortie évite les clics.
Réglages, un style par trajet (`MARBLES_ROLLS`) :

| Style | Trajet | Vitesse au départ | À l'arrivée |
|---|---|---|---|
| `place` | de la main à un emplacement vide | 2 | 80 % |
| `strike` | de la main à un emplacement occupé, la bille tirée | 3 | 95 % |
| `swap` | d'un emplacement à l'autre | 2 | 80 % |
| `knocked` | la délogée, de son emplacement à la défausse | 2 × force du choc | 20 % |
| `out` | l'usée, de son emplacement à la défausse | 1,6 | 20 % |
| `rotation` | d'un emplacement au suivant | 700 ms par cran | 40 % |

La rotation est un bloc rigide : ses billes partent et arrivent ensemble, chacune à sa
vitesse (les côtés du triangle n'ont pas la même longueur), d'où une durée par cran
(`notchMs`) plutôt qu'une vitesse. Chaque bille y joue à `gain` (0,6), trois boucles ensemble
sonnant plus fort qu'une seule, et se cale avec une chute à `dropGain` (0,5). Plusieurs crans
(jusqu'à 3, un tour complet) font un seul élan qui passe par les emplacements et ralentit
sur l'ensemble, comme une roue lancée (`rotationPath`) ; le cœur ne tourne aujourd'hui que
d'un cran par tour, et l'évènement `rotation` dira combien le jour où un effet en ajoutera.

Les vitesses sont en unités de la table par seconde : la table fait 2 de large et 1 de la main
à la pointe. Une bille presque arrêtée lit sa boucle à `restRate` (0,7). Après un choc, la
délogée part `impactToOutMs` (30 ms) plus tard. Un menu ouvert par-dessus fige le
déplacement avec l'écran ; chaque roulement a aussi une échéance en temps réel, qui le coupe
s'il ne reçoit plus de frames. Passer la séquence ou quitter l'écran coupe les roulements en
cours.

**Collision** : quand une bille tirée en déloge une autre, les sons de collision des deux
billes, la frappeuse puis la frappée `flamMs` (12 ms) plus tard (`MARBLES_COLLISION`). Sous
une vingtaine de millisecondes, l'oreille entend un seul choc, plus épais : deux corps. Un
seul repère, `collision`, porte les deux billes ; l'écart est un retard posé sur l'horloge
audio à la lecture (`delayMs` de `lib/audio.js`, précis à l'échantillon), car la file de sons
avance par frames (environ 17 ms), un grain plus gros que l'écart lui-même, et un minuteur JS
flotte de plusieurs millisecondes. La
**force** du choc vient de l'écart de calibre entre la posée et l'éjectée : le rapport des
poids de leurs calibres (`weights` de `MARBLES_COLLISION`, 1, 2 et 3, pour le son seulement),
frappeuse sur frappée, élevé à `weightExponent` (0,3). Un calot sur une minibille frappe à
1,39, une minibille sur un calot à 0,72, deux billes de même calibre à 1. La force règle le
volume des deux sons et la vitesse de départ de la délogée (`collisionStrength`).

**Variations de ton** : collisions, chutes et roulements jouent chacun à une vitesse de
lecture tirée au hasard autour de 1 (`MARBLES_PITCH_VARIATION` : ±4 %, ±3 %, ±2 %, le
roulement une fois par trajet), pour que deux sons de suite ne soient jamais identiques.
Jamais les balises : la balise est l'identité de la bille. Un hasard de rendu, que la
simulation ne voit pas.

**Balise au survol** : la balise de la bille sur laquelle le curseur arrive, dans la main, sur
un emplacement occupé (à l'ouverture de la sélection d'emplacement aussi), et dans les menus
du sac et de la défausse (à l'ouverture et à chaque déplacement). Une seule à la fois : la
suivante coupe la précédente. Une butée, qui laisse le curseur en place, n'en joue pas.

**Espace** : un son de bille s'entend à sa place sur la table (`MARBLES_SOUND_PLACES`,
`renderAt`), en stéréo et en volume, jamais en HRTF. La balise d'une bille piochée s'entend à
sa place dans la main, la cascade de pioche va donc de gauche à droite ; la chute d'une pose
et la balise de phase à l'emplacement ; la balise au survol là où est le curseur ; un
roulement d'une place à l'autre. Le brassage et les menus du sac et de la défausse restent au
centre, secs.

- **Défausse** : à droite, derrière les bases (x 0,8, y 0,7), où roulent et tombent les
  billes délogées ou usées ; le joueur apprend où elles partent.

- **Gauche-droite** (`x`) : la main de −0,6 à +0,6, la première bille tout à gauche (une
  bille seule au milieu) ; base gauche −0,4, base droite +0,4, pointe au centre. Le triangle,
  plus resserré que la main, fait la perspective : plus c'est loin, plus c'est près du centre.
- **Profondeur** (`y`) : la main à 0, les bases à 0,5, la pointe à 1. Trois indices,
  interpolés de la main à la pointe (`MARBLES_SOUND_DEPTH`) : le volume (−6 dB au plus loin),
  un passe-bas discret (de 20 000 à 7 000 Hz, sur une échelle logarithmique ; marqué, il
  voudrait dire « derrière une paroi », comme en ville) et surtout la part de réverbération
  (de 0,05 à 0,35), l'indice qui convainc le plus. La table a sa propre réverbération, créée à
  l'ouverture de l'écran et défaite à sa sortie. Pas de passe-haut : il amincit le son au lieu
  de l'éloigner.
- **Régler à l'oreille** : en mode debug, **Maj+B** (« balises » ; Maj+P ouvre le menu du
  pot) fait entendre la balise de la bille sous
  le curseur (de l'argile sinon) à chaque place, de la plus proche à la plus lointaine : la
  main à gauche, au centre, à droite, les deux bases, la pointe. Hors mode debug, la touche
  ne fait rien et n'est pas dans l'aide.

**Volumes** : balises (pioche, phase et survol) au volume des balises, elles ont vocation à être
positionnées ; brassage, chutes, collisions et roulements au volume de l'interface. Tous les sons des billes sont
permanents et préchargés à l'ouverture de l'écran. Les gestes de l'écran gardent les sons de
menu (`select`, `cancel`, `block`, `refusal`).

### Mots-clés (E, Maj+E)

Sur la bille sous le curseur, partout où une bille peut l'être (triangle, main, menus du
sac et de la défausse : `view/marbles/keywords.js`) :

- **E** : une seule annonce, « Éveil : se déclenche quand la bille est piochée. Final : … » ;
- **Maj+E** : un menu vertical (`lib/menu.js`), titré « Mots-clés de géante », une entrée par
  mot-clé (« Pioche : pioche des billes du sac. … »), puis « Fermer » ; Échap ferme aussi.
  Les entrées se lisent, Entrée n'y fait rien.

Seulement les mots-clés présents sur la bille (`core/marbles.js`/`keywordsOf`) : ses champs
non vides (déclencheurs, En poche, pointe, base, variante comprise) et les actions
mots-clés de ses clauses (Pioche, Polissage, Fêlure, Empocher), chacun une fois, dans
l'ordre : éveil, chiquenaude, tic, trouvaille, éjection, final, en poche, pioche,
polissage, fêlure, empocher, puis **pointe et base en dernier** : présentes sur presque
toutes les billes, elles ne passent pas devant ce qui distingue la bille. Ni Vitesse ni
Masse (ce ne sont pas des mots-clés), ni calibre. Sans bille (emplacement vide, main vide,
« Retour » d'un menu de pile) : « Aucune bille. » ; une bille sans mot-clé : « Aucun
mot-clé. » (dans le menu, cette entrée seule, puis « Fermer »). Refusées pendant la
séquence, comme les autres annonces de consultation.

Les noms et descriptions sont déclarés à côté des mots-clés (`MARBLE_PHASES`,
`MARBLE_TRIGGERS`, `MARBLE_POCKET`, `CLAUSE_ACTIONS` : `keyword.texts`), lus par
`core/marbles.js`/`buildMarbleKeywords` : un mot-clé sans eux échoue au chargement. Pas de
conflit de touches : E n'était lié à rien dans ces écrans (l'émote de l'écran de ville n'y
est jamais active).

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

### Valeurs de partie (Maj+L, mode debug)

En mode debug seulement (le mode du projet, `config/debug.js` : Ctrl+D, ou
`toggleDebug()` dans la console), **Maj+L** ouvre un menu vertical
(`view/marbles/tally-screen.js`, un menu de `lib/menu.js`), regroupé par catégorie :
le titre de chacune (« Déclenchements », « Actions », « Vitesse et Masse »,
« Évènements »), puis une ligne par compteur avec ses deux portées (« Chiquenaudes : 2 ce
tour, 5 cette partie. ») ; enfin « Fermer ». Échap ferme aussi. Les lignes se lisent,
Entrée n'y fait rien. Hors mode debug, la touche ne fait rien et n'est pas dans
l'aide. Refusée pendant la séquence, dont l'état est déjà celui d'après la résolution. Pas
de conflit : dans l'écran des billes, L seule ouvre l'historique, et le Maj+L de l'écran
de ville (journal d'avertissements) n'est jamais actif en même temps (seul le sommet de la
pile reçoit le clavier).

## Tester

```
node tools/run-checks.js marbles marbles-bus marbles-tally marbles-forecast marbles-view marbles-sequence marbles-tools detail-card
node tools/marbles/play.js --seed 42
```

Les autres outils (cas construit à la main, simulateur) : `doc/marbles-tools.md`.

Le mode d'emploi du kit terminal est en tête de `tools/marbles/play.js` : une partie se
joue au clavier ou par un fichier de commandes, `prevoir` dit la prévision sans rien
changer, et `--json` sort le journal complet pour comparer deux parties. En jeu, mode
debug : `window.debugStartMarbles(seed)` et `window.debugMarbles()`.
