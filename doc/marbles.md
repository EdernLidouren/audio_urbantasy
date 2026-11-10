# Jeu des billes

Minijeu de stratégie solo, sans adresse ni adversaire, lancé depuis le menu principal.
Prototype : indépendant de la partie principale (ni inventaire, ni collection, ni
sauvegarde). Le joueur pose des billes sur un triangle à trois emplacements qui tourne
à chaque tour, et marque en synchronisant leurs effets.

| Fichier | Rôle |
|---|---|
| `marbles/types/` | Les billes, une par fichier, et leur registre `index.js` (donnée pure) |
| `marbles/effects.js` | Les formes courtes des clauses, `speed(n)`, `mass(n)`, `draw(n)`, `polish(n, cible?)` et `crack(n, cible?)` |
| `config/marbles-values.js` | Réglages, modèle de fiche, sac de test, sons (donnée pure) |
| `core/marbles-rules.js` | Les règles liées à une table de billes : le point d'entrée de la simulation hors du core |
| `core/marbles.js` | La simulation : état, réducteur, écouteurs, journal, codes de refus |
| `core/marbles-effects.js` | Le modèle d'effet : clauses, actions, conditions, effet imprimé |
| `core/marbles-bus.js` | Le bus d'évènements interne à la simulation |
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
| `view/marbles/navigation.js` | Le curseur dans le triangle, les zones, l'ouverture de la sélection d'emplacement (pur) |
| `view/marbles/sounds.js` | Les sons de l'écran : repères des évènements, roulements, balise au survol, musique |
| `view/marbles/sound-queue.js` | La file de sons, qui étale ceux d'un même geste (pur) |
| `view/marbles/rolls.js` | Le mouvement d'une bille qui roule : durée, position, vitesse (pur) |
| `tools/marbles/` | La boîte à outils : partie au terminal, cas construits, simulateur (`doc/marbles-tools.md`) |
| `core/checks/marbles.check.js`, `marbles-bus.check.js`, `marbles-forecast.check.js`, `marbles-view.check.js`, `marbles-sequence.check.js` | Vérifications |

## Déroulement d'un tour

1. **Pioche** : 5 billes au premier tour, 1 ensuite (`firstTurnDraw`, `drawPerTurn`), par
   la pioche unifiée (voir plus bas).
2. **Échange** (facultatif, une fois par tour, avant toute pose) : le contenu de deux
   emplacements, usure comprise. Un emplacement vide en fait un déplacement ; deux vides
   sont refusés, pour ne pas gâcher l'échange du tour. Ni Tic ni Éjection. Ce n'est pas un
   lancer.
3. **Pose** : chaque pose depuis la main est un **lancer**, sur un emplacement vide ou
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
   Tic et Éjection ont déjà pu modifier. Chaque bille applique son effet (un Polissage ou
   une Fêlure sur elle-même compris) puis prend 1 d'usure, même si cela l'amène à son
   maximum. Une bille qu'une Fêlure a retirée avant sa phase la saute.
5. **Retraits par usure**, dans l'ordre des phases : chaque bille à son usure maximale
   quitte son emplacement, rejoint la défausse, puis son **Final** se déclenche (voir
   « Les déclencheurs »). Pas d'Éjection.
6. **Impact** = max(0, Vitesse) × max(1, Masse), ces planchers ne valant que pour ce
   calcul final, Final compris : les retraits passent avant lui. Il s'ajoute au Score.
7. **Rotation** : base gauche → pointe, pointe → base droite, base droite → base gauche.

### La pioche unifiée

Toute pioche, celle du début de tour comme celle d'un effet (Pioche), suit la même mécanique,
bille par bille (`core/marbles.js`/`drawOne`) :

1. main pleine : la bille reste au sac, sans régénération ;
2. sinon, le sac a une bille : on la pioche ;
3. sinon, la défausse n'est pas vide : mélangée par le hasard de la partie, elle devient le
   sac (`bagRegenerated`), puis on pioche ;
4. sinon (sac et défausse vides) : rien à piocher.

Le premier arrêt interrompt la pioche et se dit (`drawSkipped`, motif `handFull` ou
`noMarbles`, « Plus aucune bille à piocher. ») : les billes restantes ne sont pas piochées.
Une régénération peut donc avoir lieu à tout moment : en début de tour, pendant la phase de
jeu (un Tic qui pioche) ou pendant la résolution.

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

### Déroulé d'une pose

Sur un emplacement vide, la bille le rejoint, sans Tic. Sur un emplacement occupé par une
bille B, la pose d'une bille A se déroule dans cet ordre, visible au journal :

| Étape | Évènement du journal |
|---|---|
| Éjection de B | `knockout`, puis `effect` si B en a une, suivi de ses pioches (`draw`…) si elle pioche |
| B est retirée de son emplacement | `removed` (`cause: "replacement"`) |
| B rejoint la défausse | `discarded` (`cause: "replacement"`) |
| A rejoint l'emplacement | `placed` |
| Tic de A | `hit`, puis `effect` si A en a un, suivi de ses pioches s'il pioche |

`knockout` et `hit` portent le remplacement en cours, `replacement: { placed, ejected }`
(les ids de A et de B), que lit la condition de calibre relatif (voir « Conditions »).

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

Les champs d'effet (`base`, `baseVariant`, `apex`, et un par déclencheur : `hit`, `knockout`,
`final`) sont tous facultatifs :
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

- **action** : ce que fait la clause, avec son `amount` :
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
- **cible** (`target`, facultative, pour les actions qui l'acceptent) : un emplacement.
  Pour une Vitesse ou une Masse, sans cible, la clause agit sur le compteur du tour ou
  s'ajoute à l'effet de la bille ; avec une cible, elle donne un **bonus** à la bille de
  cet emplacement. Pour un Polissage ou une Fêlure, sans cible, la bille elle-même ; avec
  une cible, la bille de cet emplacement (un emplacement vide : sans effet, noté au
  journal, `targetEmpty`) ;
- **condition** (`when`, facultative) : évaluée au déclenchement ; fausse, la clause ne
  produit rien ;
- **comptage** (`per`, facultatif) : `amount` est multiplié par ce qu'il compte au
  déclenchement ; zéro, la clause ne produit rien.

### Conditions

Une condition ou un comptage lit la **situation** de l'effet au déclenchement
(`core/marbles-effects.js`) : le triangle, la bille qui joue l'effet (sur le triangle ou
déjà retirée) et, pendant un Tic ou une Éjection, le remplacement en cours.

| Condition (`when`) | Vraie si | Exemple (fiche) |
|---|---|---|
| `{ type: "printedStat", slot, stat, atLeast }` | la bille de `slot` a, imprimé à cet emplacement, au moins `atLeast` de `stat` ; emplacement vide : faux | « Vitesse +4 à la pointe si son effet de pointe donne au moins Vitesse +1 » (loupe) |
| `{ type: "relativeSize", marble, is }` | pendant un remplacement, la bille `marble` (`ejected`, l'éjectée, ou `placed`, la posée) est `is` (`smaller` ou `larger`) que l'autre ; calibres égaux : ni l'un ni l'autre | « Tic : Vitesse +4 si la bille éjectée est plus petite. » (gorille), « Éjection : Pioche 1 si la bille posée est plus grosse. » (mica) |
| `{ type: "sizeAt", slot, size }` | la bille de `slot` est de calibre `size` ; emplacement vide : faux | « Pointe : Masse +1 et Masse +2 si la base gauche est un calot. » (agate) |

`relativeSize` n'existe que pendant un remplacement : la validation la refuse hors d'un champ
de déclencheur marqué `replacement` dans `MARBLE_TRIGGERS` (le Tic, vu par la posée ;
l'Éjection, vue par l'éjectée).

| Comptage (`per`) | Compte | Exemple (fiche) |
|---|---|---|
| `{ type: "activeSize", size }` | les billes actives (sur le triangle) de calibre `size`, la bille elle-même comprise si elle en est (déjà retirée, dans un Final, elle s'ajoute) | « Base : Vitesse +1 par minibille active. » (grès) |

Dans R, la confirmation et la séquence, seules les **valeurs finales** se disent (« base
gauche, grès : Vitesse +2. »), jamais la condition ni le comptage : ils ne s'entendent que
dans la fiche.

**Règle anti-boucle** : une condition lit toujours l'effet IMPRIMÉ d'une bille
(`printedStat`), jamais un effet déjà modifié ; le calibre est statique. Aucune dépendance
circulaire n'est possible, et le joueur raisonne à partir de ce qu'il entend. L'imprimé
compte les clauses sans cible, sans condition ni comptage.

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
  Final compris : la bille visée reste sur le triangle. Mais pas la bille elle-même dans
  un Final, qui a déjà quitté le triangle (refusé à la validation).

Le moment de chaque champ vient de la phase (ses emplacements) ou du déclencheur
(`moment` de `MARBLE_TRIGGERS` : `play` ou `afterPhases`).

**Ajouter** une action : une entrée dans `CLAUSE_ACTIONS` (`core/marbles-effects.js`), sur
le modèle des conditions, qui déclare ses champs (`fields` : une action sans `target` refuse
toute cible à la validation), sa validation (`validate`) et ce qu'elle ajoute aux valeurs
(`apply`) ; puis ses textes dans `view/marbles/narration.js`/`ACTION_TEXTS` (`up` pour une
valeur positive, `down` pour une négative), lus par les fiches, R, la confirmation et la
séquence. Une action sans textes fait échouer le chargement. Si son application touche à
l'état autrement qu'un compteur, comme la Pioche, `fireEffect` (`core/marbles.js`) l'exécute
après l'annonce de l'effet. Une condition : une entrée dans `CONDITIONS` et son texte dans
`CONDITION_TEXTS` ; un comptage : une entrée dans `COUNTS` et son texte dans `COUNT_TEXTS`.
Une condition ou un comptage sans texte fait échouer le chargement. Un nom de calibre glissé
dans un texte passe par `nameRef`, avec ses formes françaises et anglaises `indef` (« un
calot ») et `noun` (« bille normale »).

### Les déclencheurs

Hors la phase (base, pointe), une bille réagit par ses **déclencheurs** : le **Tic** (`hit`,
posée sur un emplacement occupé, après l'éjection de l'occupante), l'**Éjection**
(`knockout`, remplacée) et le **Final** (`final`, retirée par usure, une fois à la
défausse ; jamais à une éjection, un échange ou une pose). Ils sont déclarés UNE fois, dans
`config/marbles-values.js`/`MARBLE_TRIGGERS`, une entrée chacun :

```js
{
  id: "final",              // la valeur `trigger` de l'évènement `effect`
  field: "final",           // le champ d'effet de la bille
  event: "final",           // l'évènement du journal qui le déclenche
  marble: "removed",        // la bille concernée : "onSlot" (sur l'emplacement de
                            // l'évènement) ou "removed" (déjà retirée, que l'évènement nomme)
  forecast: { line: "slot" }, // sa prévision : avec l'emplacement de la bille, ou
                            // { line: "placement", marble, order }, une ligne de confirmation
  texts: { card: "marbles.card.final", effect: "marbles.event.effect_final", slot: "marbles.outcome.final" },
  card: "below",            // sa place dans la fiche, au-dessous de l'annonce principale
}
```

Tout ce qui les connaît lit cette liste, jamais une copie : la validation de la table (les
champs permis), les écouteurs du core (`EVENT_TRIGGERS`, construit depuis elle, la phase
seule y étant écrite à la main), la prévision, la narration (gabarits, lignes de
confirmation, évènements muets), le modèle de fiche (`MARBLE_CARD_MODEL.below` en est
dérivé, dans l'ordre de la liste : tic, éjection, final) et les outils (chiffres par
déclencheur ; leurs mots, `tools/marbles/format.js`/`TRIGGER_WORDS`, échouent au
chargement s'il en manque un). La liste est validée au chargement du core
(`validateMarbleTriggers`) ; ses textes, par le domaine `marbles-view`. **Ajouter un
déclencheur** : son entrée, ses textes FR et EN, ses mots dans les outils, et l'émission de
son évènement dans `core/marbles.js` au bon moment du tour.

## Simulation

Le réducteur, `reduce(state, action)` des règles (`core/marbles.js`/`marblesReduce` derrière), est pur et rend toujours `{ ok, state, events, error }`.
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

`EVENT_TRIGGERS` dit quels évènements déclenchent un effet : les phases, et les
déclencheurs de `MARBLE_TRIGGERS` (Tic, Éjection, Final). Les autres passent au journal,
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
atteindra son usure maximale ce tour, rien sinon) ; `cleared`, par emplacement, la bille
retirée avant sa phase par une Fêlure ; `wear` et `retired`, les changements d'usure et les
retraits, dans l'ordre ; `drawn`, les billes que l'action et la
résolution piocheraient ; `regenerates`, vrai si le
sac serait régénéré ; `uncertain`, vrai si une bille inconnue aurait pu réagir selon son
identité (un déclencheur qui écoute la main : aucun aujourd'hui), ses chiffres n'étant alors
pas sûrs. La vérification `marbles-forecast` contrôle que Vitesse, Masse, Impact, billes
piochées et régénération prévues sont celles du réel.

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
3. sur un emplacement occupé, « Éjection de gorille : Vitesse +3 », ou « … : aucun effet » ;
4. sur un emplacement occupé, « Tic d'argile : Vitesse +2 », ou « … : aucun effet » ;
5. si la pose et la résolution régénéreraient le sac, « Le sac sera régénéré. » ;
6. Annuler (Échap aussi : la sélection d'emplacement reprend) ;
7. Confirmer.

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

Au-dessous, les champs des déclencheurs, facultatifs, dans l'ordre tic, éjection, final
(« Final : Masse +1. ») : ils viennent de `MARBLE_TRIGGERS`.

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
régénéré. » termine l'annonce. Même gabarit que les
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
   droite, vide. », avec les règles de la vue d'ensemble ; une phase qui pioche est suivie
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
l'usure et la fin de tour la précédente, pour que leurs sons partent avec elle. Deux
règles d'ordre seulement : les pioches consécutives se disent en une liste, et le début
de tour vient après sa pioche. Un effet d'un nouveau déclencheur s'insère donc comme une
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
  plusieurs, l'une après l'autre (`outStaggerMs`). Son
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
- **Régler à l'oreille** : en mode debug, **Maj+P** fait entendre la balise de la bille sous
  le curseur (de l'argile sinon) à chaque place, de la plus proche à la plus lointaine : la
  main à gauche, au centre, à droite, les deux bases, la pointe. Hors mode debug, la touche
  ne fait rien et n'est pas dans l'aide.

**Volumes** : balises (pioche, phase et survol) au volume des balises, elles ont vocation à être
positionnées ; brassage, chutes, collisions et roulements au volume de l'interface. Tous les sons des billes sont
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
