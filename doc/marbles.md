# Jeu des billes

Minijeu de stratégie solo, sans adresse ni adversaire, lancé depuis le menu principal.
Prototype : indépendant de la partie principale (ni inventaire, ni collection, ni
sauvegarde). Le joueur pose des billes sur un triangle à trois emplacements qui tourne
à chaque tour, et marque en synchronisant leurs effets.

Le jeu des billes a son arbre à lui, `marbles/`, avec les mêmes règles que le jeu
(CLAUDE.md) : `core/` (la simulation, qui ne lit jamais `content/` ni `view/`),
`content/` (les billes), `config/` (les réglages), `view/` (l'écran), `checks/` (ses
vérifications) et `tools/` (sa boîte à outils). Il ne dépend du jeu principal que
par `lib/` (dont le PRNG seedé, `lib/rng.js`), les textes (`data/i18n/*/marbles.json`),
les sons (`assets/`), et quelques briques de la vue (sons de menu, confirmation,
volumes). `main.js` le compose (les règles liées aux tables des billes et des statuts)
et l'ouvre depuis le menu principal.

**Deux documents, deux rôles.** Les règles telles que le joueur les vit (le tour, la
pioche, le pot, les choix, les statuts) sont dans `doc/marbles-rules.md`, et seulement
là. Ce document-ci dit le MÉCANISME : où vit quoi, les déclarations, les fonctions, les
évènements du journal, et l'écran. Il renvoie aux sections des règles plutôt que de
les redire.

## La carte des modules

Les modules du core, du plus fondamental au réducteur, sont aussi listés dans
l'en-tête de `marbles/core/marbles.js`.

| Fichier | Rôle |
|---|---|
| `marbles/content/types/` | Les billes, une par fichier, et leur registre `index.js` (donnée pure) |
| `marbles/content/statuses/` | Les statuts, un par fichier, et leur registre `index.js` (donnée pure) |
| `marbles/content/effects.js` | Les formes courtes des clauses : une par action (`speed(n)`, `pocket(cible?)`, `applyStatus(id, { intensity, duration })`…), les cibles (`NEXT_SLOT`, `FIRST_IN_HAND`, `nextInBag(n)`, `choice({ zones, count, mode })`, `allActive(...filtres)`…), les sources des montants calculés et les conditions ; la liste est le fichier lui-même |
| `marbles/config/values.js` | Réglages, phases, déclencheurs, mot-clé En poche, valeurs de partie, modèles de fiche (billes et statuts), sac de test, sons (donnée pure) |
| `marbles/core/zones.js` | Les zones : les emplacements et l'ordre horaire (`SLOTS`, `nextSlot`, `previousSlot`), les zones de la partie et leurs états (`GAME_ZONES`, `ZONE_STATES`), celles d'un choix (`CHOICE_ZONES`), celles de la bille qui joue un effet (`HOLDER_ZONES`, `NO_REFERENCE_ZONES`) |
| `marbles/core/statuses.js` | Les statuts : leur modèle, les caractéristiques en vigueur (l'accès unique), les modificateurs de valeur, le cumul, les durées, les réactions |
| `marbles/core/effects.js` | Le modèle d'effet : clauses, actions (`CLAUSE_ACTIONS`), cibles, conditions, sources de montant, effet imprimé, la bille inconnue de la prévision (`UNKNOWN_MARBLE`) |
| `marbles/core/counters.js` | Les compteurs des valeurs de partie : générés (mots-clés, actions, Vitesse et Masse) et déclarés (évènements réels) |
| `marbles/core/tally.js` | Le registre des valeurs de partie : le seul à les écrire, et leur lecture publique |
| `marbles/core/content.js` | Le catalogue : ce que la partie sait des déclarations avant de jouer (leur validation à son chargement : déclencheurs, phases, moments En poche), les valeurs de partie et les clés écoutables, les mots-clés, les statuts qu'une bille applique, l'usure maximale (`maxWearOf`), les types d'évènements du journal (décrits dans son en-tête) |
| `marbles/core/validation.js` | La validation des tables injectées : billes (`validateMarbleTypes`), statuts (`validateMarbleStatuses`), réglages d'une partie (`validateGameSettings`), contenu du jeu au démarrage (`validateMarblesContent`) |
| `marbles/core/bus.js` | Le bus d'évènements interne à la simulation |
| `marbles/core/path.js` | Le chemin des billes : tout départ, déclencheur de sortie, destination et arrivée (`travel`, `arrive`, `redirect`), les déplacements des actions, l'éjection (`ejectFromSlot`), le retrait par usure (`retireMarble`), la place libre en main (`handRoom`) |
| `marbles/core/choices.js` | Les cibles au choix : les cibles valides par zone, le choix lui-même (`chooseTargets`, qui suspend l'action par `ChoiceSuspension`), la réponse rejouée (`answerOf`), le refus d'une réponse (`chooseRefusal`), la forme publique d'une cible (`targetRef`) |
| `marbles/core/run.js` | Le déroulé d'une action : bus et écouteurs, effets des billes, réactions (le pot, les statuts), valeurs passées par les statuts (`intercept`, `noteModification`), actions sur une bille, pioche, journal |
| `marbles/core/marbles.js` | Le réducteur : état, mise en place, refus et codes de refus, actions (pioche du tour, échange, pose, résolution, choix) ; son en-tête porte la carte des modules du core |
| `marbles/core/forecast.js` | La prévision : le vrai moteur sur une copie à l'aveugle (`blindCopy`) |
| `marbles/core/rules.js` | Les règles liées aux tables des billes et des statuts : le point d'entrée de la simulation hors du core |
| `marbles/view/screen.js` | L'écran de jeu et sa table de touches |
| `marbles/view/card-menu.js` | Le menu horizontal à fiches, commun aux menus des piles et à celui des statuts |
| `marbles/view/pile-screen.js` | Le menu d'une pile de billes : sac, défausse ou pot (Maj+S, Maj+D, Maj+P) |
| `marbles/view/status-screen.js` | Le menu des statuts de la partie (Maj+A) |
| `marbles/view/card.js` | La fiche d'une bille, lue dans le modèle `MARBLE_CARD_MODEL` |
| `lib/detail-card.js` | Le mécanisme générique des fiches : assemblage et curseur secondaire |
| `lib/real-time.js` | L'horloge temps réel à deux moteurs (images et minuterie) de l'écran |
| `marbles/view/narration.js` | Ce qui se dit, à partir de l'état, du journal et de la prévision (pur), point d'entrée de ses modules (`marbles/view/narration/`) : `effects.js` (vocabulaire, effets joués, prévus et imprimés), `focus.js` (lignes de curseur et d'état), `forecast.js` (confirmation d'une pose, vue d'ensemble R), `journal.js` (étapes du journal, question d'un choix), `statuses.js` (les statuts : étiquette, touche A, fiche, aide E) |
| `marbles/view/resolution.js` | La présentation de la résolution : sa séquence, la résolution qu'un choix interrompt, la garde après un saut |
| `marbles/view/sequence.js` | La file d'étapes de la séquence de résolution et ses pauses (pur) |
| `marbles/view/history.js` | L'historique : les messages de jeu du tour précédent (pur) |
| `marbles/view/history-screen.js` | Le menu de l'historique |
| `marbles/view/keywords.js` | L'aide des mots-clés de la bille sous le curseur (E, Maj+E) |
| `marbles/view/tally-screen.js` | Le menu de debug des valeurs de partie (Maj+L) |
| `marbles/view/navigation.js` | Le curseur dans le triangle, les zones, l'ouverture de la sélection d'emplacement (pur) |
| `marbles/view/sounds.js` | Les sons de l'écran, point d'entrée de ses modules (`marbles/view/sounds/`) : `validation.js` (réglages sonores, au chargement), `space.js` (places, positions, rendu), `timeline.js` (repères des évènements, ligne de temps), `playback.js` (lecture, roulements, balise au survol, musique) |
| `marbles/view/help-screen.js` | L'aide du jeu des billes (touche H) : rubriques courtes, puis l'aide des touches |
| `marbles/view/sound-queue.js` | La file de sons, qui étale ceux d'un même geste (pur) |
| `marbles/view/rolls.js` | Le mouvement d'une bille qui roule : durée, position, vitesse (pur) |
| `marbles/tools/` | La boîte à outils : partie au terminal, cas construits, simulateur, comparateur, annexe du document de règles ; ses modules sont listés dans `doc/marbles-tools.md` |
| `marbles/tools/args.js` | La lecture stricte de la ligne de commande, commune aux outils : une option inconnue, une valeur manquante ou un argument en trop est une erreur |
| `doc/marbles-rules.md` | Les règles pour un joueur et pour le concepteur, sans code ; son annexe des billes et sa liste des statuts de test sont générées |
| `doc/marbles-backlog.md` | Les points en suspens, une ligne chacun, avec leur origine |
| `marbles/checks/` | Ses vérifications, un fichier par domaine, listés dans `marbles/checks/index.js` (`MARBLES_SUITES`) et lancés par le point d'entrée unique, `core/checks/index.js` ; leurs fixtures partagées, `marbles/checks/helpers.js` ; leur table de billes, `marbles/checks/fixtures/marbles.js`, et le banc d'essai de l'écran, `marbles/checks/fixtures/screen-bench.js` (organisation et domaines : `doc/marbles-tools.md`, « Les vérifications du jeu des billes ») |

## L'ordre horaire

Le triangle n'a qu'un ordre, le **sens horaire**, déclaré une fois dans
`marbles/core/zones.js` (`SLOTS`) : base droite, base gauche, pointe, puis de nouveau
base droite. Il en dérive l'**emplacement suivant** (`nextSlot` : base droite -> base
gauche, base gauche -> pointe, pointe -> base droite) et l'**emplacement précédent**
(`previousSlot`, le sens inverse), réexportés par `marbles/core/marbles.js` ; les
cibles relatives les lisent (voir « La règle des cibles »).

Cet ordre est celui de tout ce qui énumère les emplacements : les phases de la
résolution (la pointe reste la dernière), les retraits par usure, les billes actives
visées ensemble (« toutes les billes actives »), les écouteurs du bus, les Trouvailles, la
prévision, la touche R, la séquence de résolution, les actions légales, la position du
curseur à l'ouverture d'une pose (le premier emplacement vide) et l'ordre des cibles d'un
choix sur le triangle. La règle des cibles le suit aussi : une base droite peut donner un
bonus à la base gauche, jamais l'inverse. La **rotation** de fin de tour fait avancer
chaque bille vers son emplacement suivant (base gauche vers la pointe, pointe vers la
base droite, base droite vers la base gauche). La disposition spatiale de l'écran et sa
navigation n'en dépendent pas : pointe en haut, base gauche à gauche, base droite à
droite.

## Le tour

Le tour tel que le joueur le joue : `doc/marbles-rules.md`, sections 3 (« Le score »),
5 (« Le déroulé d'un tour ») et 6 (« La pioche et la régénération du sac »). Côté
simulation (`marbles/core/marbles.js`) :

- **Les étapes** (`stage`) : `"draw"`, la pioche du tour reste à faire (action `draw`,
  `drawTurn` : `turnStarted`, l'activation des statuts en attente, un tour de plus au
  compteur des billes déjà en main, puis la pioche, `firstTurnDraw` billes au premier
  tour et `drawPerTurn` ensuite, passée par les statuts) ; `"play"`, l'échange (`swap`),
  les poses (`place`) et la résolution (`resolve`) ; `"over"`, la partie finie. Les
  réglages sont dans `MARBLES_SETTINGS` (`marbles/config/values.js`).
- **Les lancers** : `throwsUsed` compte les poses du tour, bornées par la
  caractéristique « lancers » en vigueur (`throwsPerTurn`, plus les statuts). Lancers
  épuisés : `noThrowsLeft`, que l'écran oppose dès la prise de la bille
  (`rules.throwRefusal`). Pourquoi une limite : une boucle pilotée par le joueur (un
  Tic qui pioche à chaque pose, par exemple) est faite d'actions du joueur, que la
  limite de sécurité du bus ne couvre pas (voir « Le bus d'évènements »).
- **Le joueur est seul responsable de ses poses** : `placeRefusal` ne refuse jamais une
  pose qui laisserait des emplacements impossibles à remplir, et `resolve` est permise
  à tout moment de la phase de jeu, triangle plein, partiel ou vide, premier tour
  compris.
- **La résolution** (`resolveTurn`) : les phases (`resolvePhases` : l'effet, puis
  l'usure de phase, passée par les statuts), l'étape du pot (`potResolution`), les
  retraits par usure, l'Impact (`impactOf`, ses planchers, puis les statuts), la
  rotation (`rotation`), la fin des statuts comptés en tours (sauf au dernier tour),
  `turnEnded`, puis `gameOver` ou le tour suivant, à l'étape `"draw"`. Les retraits
  passent avant l'Impact : ce qu'ils déclenchent compte pour le tour. La résolution ne
  pioche jamais : l'écran envoie la pioche du tour suivant aussitôt après (voir
  « Séquence de résolution »).

### La pioche

Toute pioche, celle du début de tour comme celle d'un effet (Pioche), passe par
`marbles/core/run.js`/`drawMarbles`, bille par bille (`drawOne`), dans l'ordre que
décrivent les règles (section 6, « La pioche unifiée »). Au journal :

- `draw { marble, cause }` (`"turn"` ou `"effect"`), puis l'Éveil de la bille
  (`awaken`, une interruption, réglée jusqu'au bout avant la bille suivante), puis les
  réactions à la pioche ;
- `bagRegenerated { size }` : la défausse, mélangée par le hasard de la partie
  (`regenerateBag`), devient le sac ; puis une `windfall` par bille active, dans l'ordre
  horaire, puis les réactions au mélange ; puis la pioche reprend en relisant ses
  conditions (une Trouvaille a pu remplir la main, prendre la bille ou remplir la
  défausse) ;
- `drawSkipped { reason }` au premier arrêt (`handFull`, ou `noMarbles`, « Plus aucune
  bille à piocher. ») : les billes restantes ne sont pas piochées.

Vitesse et Masse étant remises à 0 et 1 à la fin de la résolution, ce que joue la
pioche du début de tour (Éveils, Trouvailles, réactions) compte pour le tour qui
commence. Un Éveil qui pioche en enchaîne d'autres, bornés par le sac, la défausse, la
main pleine et la limite du bus.

### Fin de partie

Une seule : la résolution du tour `turnCount` (réglage de `MARBLES_SETTINGS`), après la
rotation. `stage` passe à `"over"`, `turn` reste sur le dernier tour joué (jamais
« 11 sur 10 »), et le journal finit par `gameOver { score }` (« Partie terminée. Score
final : … »). Une pioche impossible n'arrête rien (`drawSkipped`, `noMarbles`) : un sac
de départ vide, ou plus petit que le triangle, se joue jusqu'au bout. Des conditions de
fin plus riches (modes de partie) seront conçues à neuf (`doc/marbles-backlog.md`).

### Le pot

Le pot tel que le joueur le vit : `doc/marbles-rules.md`, section 9, « Le pot ». Deux
zones de l'état, sérialisées (`marbles/core/marbles.js`, en-tête) :

- `pot` : les billes en poche, dans l'ordre d'arrivée, au plus la capacité en vigueur
  à leur arrivée (`potCapacity`, réglage de `MARBLES_SETTINGS`, plus les statuts :
  `marbles/core/statuses.js`/`characteristic`) ;
- `lost` : les **billes perdues**, envoyées au pot plein.

Aucune bille ne quitte aujourd'hui l'une ou l'autre, ni ne revient au sac à un mélange.

**Empocher** (`pocket`, sans montant) déplace une bille vers le pot, depuis là où elle
est. Sa cible :

- aucune : **la bille elle-même**, où qu'elle soit au déclenchement : sur son emplacement
  (phase, Tic, Trouvaille), en main (à son Éveil), à la défausse (à sa Chute), en
  partance (son Final, son Éjection : Empocher REDIRIGE alors sa destination, voir « Le
  chemin des billes »). Refusée à la validation dans une Chiquenaude (en cours de
  lancer) et dans le pot ;
- un emplacement : la bille qui y est ;
- `FIRST_IN_HAND` (`"firstInHand"`) : la première bille de la main, dans l'ordre affiché ;
- un choix, dans la main ou sur le triangle (voir « Cibles au choix »).

Une cible vide (emplacement vide, main vide, bille qui n'est plus là) : sans effet, noté
au journal (`targetEmpty`, « Main vide : rien à empocher. »). Le déplacement suit le
chemin des billes : depuis le triangle, `removed` (cause `"pocket"`), ni Final ni
Éjection ; empochée pendant sa propre Éjection ou son propre Final, la bille va au pot
sans passer par la défausse (`redirected`, puis son arrivée, `redirected: true`). À
l'arrivée, `pocketed` (« X est mise en poche. »), puis son entrée au pot ; pot plein,
`lost` (« Le pot est plein : X est perdue. »), rien d'autre. Une perte se règle comme
toute arrivée.

**En poche** (`pocketed`) est un champ de bille, un objet de **moments**, déclarés une fois
dans `marbles/config/values.js`/`MARBLE_POCKET` :

```js
pocketed: { entry: [speed(10)] },              // à l'entrée au pot
pocketed: { resolution: [mass(1)] },           // à chaque résolution
pocketed: { flick: [speed(2)] },               // à chaque chiquenaude (une réaction)
pocketed: { shuffles: [polish(1, "apex")] },   // à chaque mélange (une réaction)
```

| Moment | Effet (`trigger`) | Évènement | Joue |
|---|---|---|---|
| `entry`, à l'entrée | `pocketEntry` | `pocketed` | quand la bille entre effectivement au pot, juste après son arrivée (jamais si elle est perdue) |
| `resolution`, à chaque résolution | `pocketResolution` | `potResolution` | une fois par tour, après les trois phases et avant les retraits, chaque bille du pot dans l'ordre d'arrivée (une bille empochée plus tôt dans la résolution comprise) |
| à chaque (occurrence), le moment réactif (`reactive: true`) | `pocketReaction` | `pocketReaction` `{ index, marble, counter }` | une fois par incrément du compteur écouté, à tout moment (voir « Les réactions ») |

Chaque moment déclare son id, son effet, son évènement, son moment pour la règle des cibles
(`anytime` à l'entrée et en réaction, `afterPhases` à chaque résolution : une Vitesse ou une
Masse ciblée y est refusée, les phases étant passées ; Polissage, Fêlure, Empocher et Pioche
ciblés passent ; en réaction, un bonus ciblé dont la phase est passée est perdu, noté au
journal) et ses textes (fiche, journal, R). Aucune action sur la bille elle-même dans le
pot. Vitesse et Masse vont aux compteurs du tour en cours. **Ajouter un moment fixe** : une
entrée dans `moments`, ses textes, et l'émission de son évènement dans `marbles/core/run.js` ;
ses valeurs de partie, sa ligne de fiche et ses écouteurs suivent.

### Les réactions

Une **réaction** répond à chaque incrément d'un compteur ÉCOUTABLE des valeurs de partie,
à la manière des reliques d'autres jeux. Deux sources réactives
(`marbles/core/run.js`/`reactionsOf`) : les billes du pot (« En poche, à chaque
(occurrence) ») et les statuts qui ont un comportement de réaction (voir « Statuts »).
Les règles pour le joueur : `doc/marbles-rules.md`, section 9, « Les réactions en
poche », et section 12, « Les réactions des statuts ».

- **Ce qui s'écoute** : les clés du moment réactif dans le champ `pocketed` (et le `on`
  d'une réaction de statut) ne sont pas un id fixe mais les compteurs écoutables
  (`marbles/core/content.js`/`REACTION_KEYS`), sans autre liste à tenir. Le sont, par
  catégorie (`marbles/core/counters.js`, `listenable`) : les évènements réels déclarés
  (`MARBLE_TALLIES`), les déclenchements de mots-clés (déclencheurs, phases, moments
  fixes d'En poche) et ceux des actions mots-clés. Ne le sont pas, refusés au chargement
  avec leur raison : les quantités réelles (`<action>Quantity`) et Vitesse et Masse
  (`speedGains`…), qui comptent des points plutôt que des occurrences, et les réactions
  elles-mêmes (`pocketReaction`), qui se répondraient sans fin. Un compteur ajouté d'une
  catégorie écoutable devient écoutable par construction. Attention aux deux sens d'un
  même mot : `flick`, la Chiquenaude, ne compte que chez une bille qui en a une ; « à
  chaque bille lancée » est `thrownMarbles`.
- **Une réaction par incrément** du compteur écouté : trois billes piochées, trois
  réactions ; un évènement qui augmente deux compteurs écoutés (une éjection est aussi une
  sortie du triangle), une réaction pour chacun.
- **UNE SEULE RÈGLE D'ORDRE** : l'évènement est émis et compté (`record`, à l'émission) ;
  la bille concernée joue d'abord son propre effet (son Tic, sa phase ; l'Éveil après la
  pioche ; le Final ou l'Éjection après son départ ; les Trouvailles des billes actives
  après un mélange) ; puis les billes du pot réagissent, dans l'ordre d'arrivée (pour une
  même bille, dans l'ordre des valeurs de partie) ; puis les statuts, dans l'ordre
  d'acquisition. Le même ordre partout : la pioche du tour comme une Pioche d'effet, un
  retrait à l'étape des retraits comme par une Fêlure ; une perte au pot plein se règle
  comme toute arrivée.
- **Le mécanisme** : les réactions sont relevées à l'émission (`reactionsOf`, sur le pot
  et les statuts de cet instant : une source arrivée plus tard ne réagit pas à ce qui
  l'a précédée), puis émises dans la file après le traitement de l'évènement
  (`handleEvent`), sans récursion. Trois évènements entrent au journal sans passer par
  la file (`run.record`) : `draw`, `removed` et `bagRegenerated` ; leurs réactions se
  règlent juste après l'Éveil, le déclencheur de sortie ou les Trouvailles, comme des
  interruptions (`settleReactions`).
- **Sa propre arrivée ne compte pas** : la bille qui entre au pot ne réagit pas à sa
  propre mise en poche (elle a pour cela son moment « à l'entrée »), un statut ni à sa
  réception ni à son renforcement ; chacun réagit aux occurrences suivantes.
- **Boucles** : réagir au déclenchement d'une action qu'on produit soi-même (« à chaque
  polissage : Polissage 1 ») est refusé au chargement, pour une bille comme pour un
  statut. Une boucle indirecte (deux billes du pot, l'une qui fêle à chaque polissage,
  l'autre qui polit à chaque fêlure) est coupée par la limite de sécurité du bus (voir
  « Le bus d'évènements ») : seule cette chaîne s'arrête, le journal le note
  (`chainInterrupted`), « Enchaînement interrompu. » se dit, et l'action reprend. Dans
  les vérifications et le simulateur, c'est une anomalie.

### Le chemin des billes

Les règles pour le joueur : `doc/marbles-rules.md`, section 7, « Le chemin d'une
bille ». Toute sortie d'une bille de sa zone passe par **un seul déroulé**
(`marbles/core/path.js`/`travel`), dans cet ordre :

1. **Départ** : la bille quitte sa zone (`ORIGINS` : le triangle, la main, la défausse, le
   haut du sac) et devient **en
   partance**. Elle n'appartient plus à aucune zone : ni active (la source `activeSize`, les
   conditions sur un emplacement), ni en main, ni à la défausse (un mélange du sac ne la
   prend pas). Depuis le triangle, `removed` le dit, avec sa cause ; sa phase, si elle
   n'avait pas eu lieu, est sautée. `removed` entre au journal sans passer par la file
   (`run.record`) : ses réactions se règlent après le déclencheur de sortie (voir « Les
   réactions »).
2. **Déclencheur de sortie**, s'il y en a un : le **Final** (`final`, une sortie par
   usure, normale ou par Fêlure) ou l'**Éjection** (`knockout`, par une pose ou par
   Éjecter), une interruption réglée jusqu'au bout. La bille y est `"leaving"`
   (`HOLDER_ZONES`) : Polissage, Fêlure et Éjecter sur elle-même y sont refusés à la
   validation ; Empocher sur elle-même **redirige** sa destination (`redirected`). Son
   départ, lui, est acquis : rien ne l'annule.
3. **Destination** : la défausse par défaut, celle de l'action qui la déplace
   (`CLAUSE_ACTIONS`, `moves` : le pot pour Empocher, la défausse pour Défausser, la main
   pour Rebond et Ramasser), ou la dernière qu'une redirection a posée (Empocher : le pot ;
   Rebond : la main). L'action responsable est notée sur l'arrivée (`movedBy`), que lisent
   ses compteurs.
4. **Arrivée** : à la défausse (`discarded`, une interruption, `from` : `"triangle"` et son
   `slot`, `"hand"` ou `"discard"` et son `index`, et sa `cause`), où sa **Chute** joue
   (son déclencheur d'arrivée) ; au pot (`pocketed`, son entrée ; pot plein, `lost`, sans
   entrée) ; en main (`returned`, à 0 tour en main, à la place `handIndex`, sans
   déclencheur ; main pleine, la défausse à la place, `discarded` avec `handFull`). Toute
   arrivée porte son origine : `from` et sa place (`slot` depuis le triangle, `index`
   depuis la main ou la défausse).

Le trajet en cours est dans `run.inTransit` (nature `"leaving"`, depuis l'emplacement
`slot`, ou null hors du triangle) le temps du déclencheur de sortie : un choix qui
s'ouvre alors l'emporte (`pendingChoice.inTransit`), et l'écran annonce « En partance :
X. » sur l'emplacement quitté (voir « Cibles au choix »). Exemple, une bille dont le
Final pioche : sa Pioche ne peut pas la remélanger dans un sac régénéré pendant ce
Final, puisqu'elle n'est pas encore à la défausse. Les cas autrefois traités à part (une bille empochée pendant sa propre Éjection
ou son propre Final, une Fêlure qui retire une bille, une Chiquenaude qui vide l'emplacement
visé) passent tous par ce déroulé. La pioche (Éveil) et la pose (Chiquenaude, Tic) gardent
leur déroulé à elles.

### Déroulé d'une pose

Toute pose d'une bille A commence par sa **Chiquenaude** : A quitte la main (son compteur de
tours en main avec elle) et, **en cours de lancer**, n'est ni en main ni sur le triangle ;
elle ne compte ni dans la main (une Pioche y trouve sa place libre) ni parmi les billes
actives (la source `activeSize`) ; une régénération pendant son lancer ne lui donne pas de
Trouvaille. Elle est **en transit** (voir « Cibles au choix », `inTransit`) : dans aucune
zone, jamais une cible, mais un choix ouvert pendant son lancer la connaît, avec
l'emplacement qu'elle vise. L'emplacement visé se lit ensuite : sur un emplacement
vide, A le rejoint, sans Éjection ni Tic. Sur un emplacement occupé par une bille B, dans
cet ordre, visible au journal :

| Étape | Évènement du journal |
|---|---|
| Chiquenaude de A | `flick` (`turnsInHand` : son compteur en quittant la main), puis `effect` si A en a une, suivi de ses pioches et de ses actions sur une bille |
| B quitte son emplacement, en partance | `removed` (`cause: "replacement"`) |
| Éjection de B | `knockout`, puis `effect` si B en a une, suivi de ses pioches (`draw`…) si elle pioche |
| B arrive à la défausse (sauf redirection) | `discarded` (`cause: "replacement"`) |
| A rejoint l'emplacement | `placed` |
| Tic de A | `hit`, puis `effect` si A en a un, suivi de ses pioches s'il pioche |

`knockout` et `hit` portent le remplacement en cours, `replacement: { placed, ejected }`
(les ids de A et de B), que lit la condition de calibre relatif (voir « Conditions »).

**Une Chiquenaude qui vide l'emplacement visé** : une Fêlure qui amène B à son usure
maximale (B suit le retrait par usure habituel, `removed`, `cause: "wear"`, son Final,
puis `discarded`), Éjecter (une Chiquenaude qui éjecte la pointe, posée en pointe : B
joue son Éjection et part, `cause: "eject"`), ou Empocher. La pose se poursuit alors comme sur un
emplacement vide, sans Éjection par la pose ni Tic. La pose reste un lancer dans tous les
cas.

## Une bille

Un fichier de `marbles/content/types/`, de la donnée pure, inscrit dans le registre
`marbles/content/types/index.js`, dont l'en-tête détaille les champs. Seuls imports permis : les
formes courtes des clauses (`marbles/content/effects.js`) et les constantes de calibre
(`marbles/config/values.js`). Une bille d'exemple (les vraies sont dans
`marbles/content/types/`, et changent à chaque itération de design) :

```js
// Importés : speed, draw, applyStatus (les formes courtes), SMALL (un calibre).
export default {
  base: [speed(1)],
  // En base gauche, renforce la pointe si elle donne de la Vitesse.
  baseVariant: {
    leftBase: [{ ...speed(4), target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }],
  },
  apex: [speed(2), draw(1)],
  knockout: [applyStatus("fatigue")],
  size: SMALL,
};
```

Le registre est un **contenu** : le core ne l'importe jamais (CLAUDE.md), pas plus que
celui des statuts (`marbles/content/statuses/index.js`). On lie les deux tables UNE fois
aux règles du jeu, puis on joue avec elles :

```js
const marbles = createMarblesRules(MARBLE_TYPES, MARBLE_STATUSES); // marbles/core/rules.js
let game = marbles.createGame(seed);
const { ok, state, events } = marbles.reduce(game, { type: "draw" });
marbles.forecast(state);
```

Les règles valident leurs tables à la composition et exposent tout ce qui lit une bille
ou un statut : ce qu'elles exposent, et ce qui s'importe directement parce que cela ne
lit ni l'une ni l'autre, est dit dans l'en-tête de `marbles/core/rules.js`. Ce qui
dépend des caractéristiques (lancers restants, refus de lancer et de pose, actions
légales) passe par elles, qui y lient les statuts. Les fonctions du core qui prennent
`types` ou `statuses` restent sa plomberie interne.

- **Le jeu** compose ses règles dans `main.js`, qui les passe à l'écran des billes ; l'écran
  les passe à la narration, aux fiches et aux menus des piles, comme il leur passe `t`.
- **La boîte à outils** a son point de composition, `marbles/tools/game-rules.js`.
- **Les vérifications** créent les leurs, avec leur propre table, figée
  (`marbles/checks/fixtures/marbles.js`), ou une table fabriquée ; aucune ne retombe en
  silence sur celle du jeu, qui n'a que son contrat (domaine `marbles-content`).
- **Les sons** lisent le calibre d'une bille directement dans le registre : son profil
  sonore et la force de ses chocs en viennent.

Le registre et le sac de test sont validés ensemble au démarrage
(`marbles/core/validation.js`/`validateMarblesContent`, appelé par `main.js` et par l'audit du
contenu). L'ordre du registre compte : les sacs aléatoires du simulateur y tirent leurs
billes.

Les champs d'effet (`base`, `baseVariant`, `apex`, un par déclencheur, le `field` de
chaque entrée de `MARBLE_TRIGGERS`, de `awaken` à `drop`, et `pocketed`, En poche) sont
tous facultatifs :
absent, aucun effet. `maxWear` vaut 3 par défaut. Un champ obligatoire, validé au
chargement par la simulation (`validateMarbleTypes`) :

- `size`, son **calibre** (Size) : `SMALL`, `MEDIUM` ou `LARGE`, toujours par ces
  constantes de `marbles/config/values.js`. Un entier derrière elles (1, 2, 3), pour que les
  comparaisons (plus petit, plus grand, écart) se fassent sur lui, et seulement là. Ses noms :
  minibille, normale, calot (peewee, standard, boulder), `marbles.size.<id>.name`, l'id
  venant de `MARBLE_SIZES`. **Statique** : aucune action ne le change. Lu par les
  conditions de calibre et par le son, qui en tire le profil sonore et la force des chocs
  (voir « Sons ») : une seule source de vérité pour la taille d'une bille.

**Ajouter une bille** : son fichier dans `marbles/content/types/` avec son calibre, sa ligne dans
`marbles/content/types/index.js`, son nom dans chaque langue (vérifié par le domaine
`marbles-content`), et sa place dans `STARTING_BAG` pour la mettre en jeu. En français, le nom
porte sa forme `de` (« d'argile », « de gorille ») : `{ "base": "argile", "de": "d'argile" }`,
pour « Tic d'argile ». Un sac est une liste d'ids : les doublons y sont permis.

### Effets et clauses

Un effet est une liste de clauses (`marbles/core/effects.js`) :

- **action** : ce que fait la clause, avec son `amount` (un entier, ou un **montant
  calculé**, voir plus bas) :
  - `speed`, `mass` : ajoutent `amount` (négatif permis) à la Vitesse ou à la Masse ;
  - `draw`, la **Pioche** : la bille pioche `amount` billes (au moins 1) par la pioche
    unifiée, à tout moment du tour. Jamais de cible. Utilisable dans tout champ d'effet
    (`draw(1)` dans un Tic, une Éjection, une base…). Une bille piochée pendant la phase de jeu (par un Tic, une Éjection) se joue aussitôt,
    dans la limite des lancers ; une bille piochée pendant la résolution attend le tour
    suivant ;
  - `polish`, le **Polissage** : retire `amount` d'usure (au moins 1), jamais sous 0. Une
    bille arrivée à son maximum pendant la résolution, puis polie avant l'étape des
    retraits, n'est plus retirée ;
  - `crack`, la **Fêlure** : ajoute `amount` d'usure (au moins 1), jamais au-delà du
    maximum. Si elle l'y amène, la bille est retirée AUSSITÔT, comme par usure, par le
    chemin des billes (son Final en partance, puis la défausse), et son emplacement
    devient vide. En résolution, sa phase est sautée si elle n'avait pas eu lieu ; en
    phase de jeu, l'emplacement peut recevoir une pose, sans Tic. L'usure de phase (+1)
    continue de retirer les billes à l'étape des retraits. `polished` et `cracked`
    portent l'usure demandée (`amount`), celle réellement appliquée (`applied`) et
    `retires`, vrai si la bille part ;
  - `pocket`, **Empocher**, sans montant : envoie au pot la bille elle-même, celle d'un
    emplacement ou la première de la main (voir « Le pot ») ;
  - `eject`, **Éjecter**, sans montant : chasse une ou plusieurs billes actives du
    triangle, sans pose (voir « Éjecter ») ;
  - `discard`, **Défausser**, sans montant : envoie à la défausse la bille elle-même (sur
    le triangle, en main à son Éveil), celle d'un emplacement, la première de la main, des
    billes de la main ou actives au choix, toutes les billes actives filtrées, ou les N
    prochaines billes du sac (`nextInBag(n)`, `{ type: "bag", count }` : du haut, une par
    une, sans les révéler avant ; un sac plus court donne ce qu'il a, sans régénération ;
    vide, `targetEmpty`, cible `"bag"`). Jamais depuis le pot ;
  - `bounce`, **Rebond**, sans montant : renvoie en main la bille elle-même (sur le
    triangle, ou en partance : une redirection), celle d'un emplacement, des billes
    actives au choix, ou toutes les billes actives filtrées ; à 0 tour en main, sans
    Éveil. Main pleine à l'arrivée : la défausse à la place (`discarded`, `handFull`), et
    sa Chute ;
  - `retrieve`, **Ramasser**, sans montant, toujours une cible : reprend en main la
    dernière bille arrivée à la défausse (`LAST_DISCARDED`) ou des billes de la défausse au
    choix ; sans Éveil. Main pleine : la bille reste à la défausse (`targetEmpty`, cible
    `"handFull"`) ; un choix est plafonné aux places libres (`handLimited`), et ne s'ouvre
    pas sans place ;
  - `applyStatus`, **Appliquer un statut** : donne un statut à la partie, l'intensité en
    `amount`, jamais de cible (voir « Statuts ») ;
- **cible** (`target`, facultative, pour les actions qui l'acceptent) : un emplacement.
  Pour une Vitesse ou une Masse, sans cible, la clause agit sur le compteur du tour ou
  s'ajoute à l'effet de la bille ; avec une cible, elle donne un **bonus** à la bille de
  cet emplacement. Pour un Polissage ou une Fêlure, sans cible, la bille elle-même ; avec
  une cible, la bille de cet emplacement (un emplacement vide : sans effet, noté au
  journal, `targetEmpty`). La cible peut aussi être un **choix du joueur** (voir « Cibles
  au choix ») : `choice({ zones: ["triangle"], count: 2, mode: "optional" })` ; ou
  **toutes les billes actives**, filtrées : `allActive(sizeIs(SMALL))`. Chaque action
  déclare ce qu'elle accepte dans `CLAUSE_ACTIONS` (`targets`, `choice`, `all`) :
  aujourd'hui, Éjecter, Défausser et Rebond acceptent « toutes ». Empocher, Éjecter,
  Défausser, Rebond et Ramasser passent par le chemin des billes (voir « Le chemin des
  billes ») ;
- **condition** (`when`, facultative) : évaluée au déclenchement ; fausse, la clause ne
  produit rien.

### Montants calculés

Un `amount` peut être **calculé** au déclenchement : `{ base, step, source, max? }`, soit
`base + step × la valeur de source`, plafonné à `max` s'il est donné
(`marbles/core/effects.js`/`amountOf`). `step` vaut au moins 1, `max` dépasse `base` ; pour
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
| `{ type: "activeSize", size }` | les billes actives (sur le triangle) de calibre `size`, la bille elle-même comprise si elle en est (en transit, non : en partance, dans un Final ou une Éjection, ni en cours de lancer, dans une Chiquenaude) | « Base : Vitesse +1 par minibille active. » (grès) |
| `{ type: "zoneCount", zone }` (`zoneCount(zone)`) | le nombre de billes de la zone de la partie `zone` (`GAME_ZONES` : `triangle`, les actives ; `hand`, `bag`, `discard`, `pot`, `lost`), au déclenchement ; une bille en transit ne compte nulle part ; la fiche dit la valeur actuelle dans la partie en cours (`needsState`) | « Base : Vitesse +1 par bille en main, maximum +5, actuellement +3. » (verre) |
| `{ type: "tally", tally, scope }` (`tally(id, portée)`) | la valeur de partie `tally` dans la portée `scope` (`"turn"`, ce tour ; `"game"`, cette partie), lue dans le registre au déclenchement (voir « Valeurs de partie ») | « Chiquenaude : Vitesse +2 par chiquenaude ce tour, maximum +6, actuellement +4. » (loupe) |

Chaque source est déclarée UNE fois, dans `marbles/core/effects.js`/`AMOUNT_SOURCES` :
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
(`marbles/core/effects.js`) : le triangle, la bille qui joue l'effet (sur le triangle, en
main, en partance ou en cours de lancer, avec son compteur de tours en main) et, pendant un
Tic ou une Éjection, le remplacement en cours.

| Condition (`when`) | Vraie si | Exemple (fiche) |
|---|---|---|
| `{ type: "printedStat", slot, stat, atLeast }` | la bille de `slot` a, imprimé à cet emplacement, au moins `atLeast` de `stat` (une action à montant : Empocher et Éjecter refusés au chargement) ; emplacement vide : faux | « Vitesse +4 à la pointe si son effet de pointe donne au moins Vitesse +1 » (loupe) |
| `{ type: "relativeSize", marble, is }` | pendant un remplacement, la bille `marble` (`ejected`, l'éjectée, ou `placed`, la posée) est `is` (`smaller` ou `larger`) que l'autre ; calibres égaux : ni l'un ni l'autre | « Tic : Vitesse +4 si la bille éjectée est plus petite. » (gorille), « Éjection : Pioche 1 si la bille posée est plus grosse. » (mica) |
| `{ type: "sizeAt", slot, size }` | la bille de `slot` est de calibre `size` ; emplacement vide : faux | « Pointe : Masse +1 et Masse +2 si la base gauche est un calot. » (agate) |
| `{ type: "zone", zone, state }` (`zoneIs(zone, état)`) | la zone de la partie `zone` est dans l'état `state` au déclenchement (`ZONE_STATES` : `empty`, aucune bille ; `single`, une seule ; `full`, autant que sa capacité en vigueur, taille de main ou capacité du pot) ; chaque zone déclare ses états (`GAME_ZONES`, `states`), un autre est refusé au chargement ; une bille en transit ne compte nulle part | « Pointe : Vitesse +6 si le triangle est plein. » (argile), « Tic : Pioche 1 si la main est vide. » (œil-de-chat), « En poche, à chaque résolution : Masse +2 si le pot est plein. » (agate) |

Les ZONES DE LA PARTIE (`marbles/core/zones.js`/`GAME_ZONES`) se déclarent une fois, avec
leur décompte, leur capacité éventuelle et leurs états ; ajouter une zone ou un état : une
entrée et ses textes (`marbles.condition.zone.<zone>.<état>`, `marbles.effect.per_zone`).
La situation d'un effet porte l'état de la partie (`state`), d'où elles se comptent. Le
`slot` de `printedStat` et de `sizeAt` peut être une cible relative (voir « La règle des
cibles ») ; sans référence, la condition est fausse.

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
se disent chez la bille qui les produit (« Base gauche, X : Fêlure 1 à la pointe. »),
jamais dans la valeur de phase de celle qui les reçoit.

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
  elle-même dans un Final ou une Éjection, où elle est en partance, ni dans une
  Chiquenaude, où elle n'y est pas encore (refusé à la validation).
- Une **Chiquenaude** joue pendant la phase de jeu : une Vitesse ou une Masse ciblée y est
  valide, toutes les phases restant à venir.
- Une **cible relative** (`NEXT_SLOT`, `PREVIOUS_SLOT`, `marbles/core/effects.js`) vise
  l'emplacement suivant ou précédent (`nextSlot`, `previousSlot`) de la RÉFÉRENCE de la
  bille : son emplacement sur le triangle (phase, Tic, Trouvaille) ; l'emplacement visé,
  pendant sa Chiquenaude ; l'emplacement quitté, en partance (Final, Éjection) ou à sa
  Chute depuis le triangle. Elle est traduite au déclenchement
  (`resolveClauses`, appelé par `marbles/core/run.js`/`fireEffect`), la cible et le
  `slot` des conditions ; la suite est celle d'un emplacement fixe (bonus perdu si sa
  phase est passée, noté dans `lost` ; Polissage, Fêlure, Empocher, Éjecter, Défausser,
  Rebond valides ; emplacement vide, `targetEmpty`). Sans référence (une Chute depuis la
  main) : la clause reste à sa place, sa cible devient `NO_REFERENCE`, elle s'évalue
  comme les autres (condition, montant), puis ne fait rien et se note à sa place
  (`targetEmpty`, cible `"noReference"`, « Pas d'emplacement de référence : sans
  effet. ») si sa condition tient. Acceptée partout où une action accepte un
  emplacement ; refusée au chargement là où la bille n'a jamais de référence
  (`NO_REFERENCE_ZONES` : l'Éveil, en main ; le pot ; un statut), et, pour une Vitesse ou
  une Masse, dans un Final. Jamais refusée pour une phase passée : la position décide, à
  l'exécution, comme depuis la pointe vers la base droite. Une Éjection qui éjecte la
  suivante fait ricocher l'éjection, chaque bille par le chemin des billes ; le ricochet
  s'arrête sur un emplacement déjà vidé.
- Une **cible au choix** suit la même règle, à l'ÉLIGIBILITÉ : seules les cibles valides
  au moment du choix se proposent. Un bonus de Vitesse ou de Masse au choix ne propose
  que les billes actives dont la phase n'a pas commencé ; la validation refuse un bonus au
  choix là où aucune phase ne peut plus le recevoir (un Final, à chaque résolution du pot,
  une pointe). Une bille en partance (son Éjection, son Final) a déjà quitté le
  triangle : jamais éligible.

Le moment de chaque champ vient de la phase (ses emplacements) ou du déclencheur
(`moment` de `MARBLE_TRIGGERS` : `play`, `afterPhases` ou `anytime`, la Trouvaille, que la
validation ne refuse jamais : un bonus ciblé dont la phase est passée se perd à l'exécution,
noté dans `lost` ; `marble`, pour la bille hors du
triangle).

**Ajouter** une action : une entrée dans `CLAUSE_ACTIONS` (`marbles/core/effects.js`), sur
le modèle des conditions, qui déclare ses champs (`fields` : une action sans `target` refuse
toute cible à la validation), sa validation (`validate`) et ce qu'elle ajoute aux valeurs
(`apply`) ; puis ses textes dans `marbles/view/narration/effects.js`/`ACTION_TEXTS` (`up` pour une
valeur positive, `down` pour une négative), lus par les fiches, R, la confirmation et la
séquence. Une action sans textes fait échouer le chargement. Si son application touche à
l'état autrement qu'un compteur, comme la Pioche, `fireEffect` (`marbles/core/run.js`) l'exécute
après l'annonce de l'effet. Une condition : une entrée dans `CONDITIONS` et son texte dans
`CONDITION_TEXTS` ; une condition sans texte fait échouer le chargement. Une source de
montant : voir « Montants calculés ». Un nom de calibre glissé
dans un texte passe par `nameRef`, avec ses formes françaises et anglaises `indef` (« un
calot »), `noun` (« bille normale ») et `plural` (« minibilles », pour « toutes les
minibilles actives » ; une forme déclarée dans `data/i18n/grammar.json`).

### Éjecter

**Éjecter** (`eject`, mot-clé d'action, `marbles/core/effects.js`/`CLAUSE_ACTIONS`) chasse
une ou plusieurs billes actives du triangle par un effet, sans pose. Sa cible :

- aucune : **la bille elle-même**, seulement si elle est sur le triangle (refusé à la
  validation dans une Chiquenaude, un Final, un Éveil, en poche, et dans sa propre
  Éjection, `selfRefusedIn` : elle y est déjà en train d'être chassée ; à l'exécution, une
  bille déjà partie : sans effet, noté) ;
- un **emplacement** : sa bille ;
- des billes actives **au choix** (`choice({ zones: ["triangle"], count, mode })`, voir
  « Cibles au choix ») : dans l'ordre de sélection ;
- **toutes les billes actives** (`allActive(...filtres)`), la bille elle-même comprise si
  elle y est : relevées au déclenchement, chassées dans l'ordre horaire ; une bille
  déjà partie entre-temps n'est plus visée.

**Les filtres de cible**, déclarés une fois (`TARGET_FILTERS`, sur le modèle des
conditions : champs, validation, test) : une cible « toutes » porte `filters`, une liste ;
une bille doit les passer TOUS ; un même type de filtre une seule fois. Aujourd'hui, le
calibre seul : `{ type: "size", size }` (forme courte `sizeIs(SMALL)`). Ajouter un filtre
(la matière…) : une entrée dans `TARGET_FILTERS` et son texte dans
`marbles/view/narration/effects.js`/`FILTER_TEXTS` (un filtre sans texte fait échouer le
chargement). Les textes ne combinent pas encore deux filtres : le jour où un second type
existera, sa phrase combinée s'écrira avec lui.

**Déroulé**, pour chaque bille B chassée par une bille A (`marbles/core/path.js`/`ejectFromSlot`) :

1. `eject` (« A éjecte B. ») ;
2. son trajet (voir « Le chemin des billes ») : elle quitte son emplacement (`removed`,
   cause `"eject"`), puis son **Éjection** (`knockout`) joue pendant qu'elle est en
   partance, une interruption réglée jusqu'au bout (« Éjection de B : Vitesse +3. … »),
   puis les réactions à son départ ;
   ses conditions de calibre relatif ont pour référence la bille qui éjecte
   (`replacement.placed`), où qu'elle soit ;
3. elle arrive à la défausse (`discarded`, cause `"eject"`), sauf redirection ; ni son
   départ ni son arrivée ne se disent, ils suivent l'annonce précédente, avec le roulement
   vers la défausse d'une bille usée.

Ni Tic (rien n'arrive), ni Final (ce n'est pas une usure). Pendant la résolution, une bille
chassée avant sa phase la saute. Partie dès son départ, elle n'est plus sur le triangle
pendant son Éjection : rien ne peut la chasser une seconde fois, et une Éjection qui vise
son propre emplacement le trouve vide (sans effet, noté).
« Toutes les billes actives » et les choix comprennent la bille qui éjecte (une règle
voulue ; un filtre « les autres » est en suspens). Cible vide ou aucune bille
visée : sans effet, noté (`targetEmpty`, « Aucune bille visée : sans effet. »).

**Compteurs** : billes éjectées (`ejectedMarbles`, causes `"replacement"` et `"eject"`) et
sorties du triangle ; Éjection (`knockout`) seulement si la bille chassée a un effet
d'Éjection ; Éjecter (`eject`, un par bille visée, cible vide comprise) et sa quantité
réelle (`ejectQuantity`, les billes réellement chassées). Les réactions du pot « à chaque
bille éjectée » suivent.

**Affichage** : la fiche dit « Éjecter la bille en pointe », « Éjecter une bille active au
choix », « Éjecter toutes les minibilles actives » (la forme `plural` des calibres,
`data/i18n/grammar.json`). R et la confirmation le disent chez la bille qui éjecte, avec ce
qu'elle chasse et l'Éjection provoquée : « Chiquenaude de A : Éjecter la bille en
pointe, puis B éjectée, Éjection : Vitesse +3 » ; une bille chassée avant sa phase se
dit comme retirée avant (« pointe, B : retirée avant sa phase. »). Une bille dont la
Chiquenaude éjecte la pointe, posée en pointe sur une bille, l'éjecte par sa
Chiquenaude : la pose se poursuit comme sur un emplacement vide, sans Éjection par la
pose ni Tic (« Éjection de … : aucun effet » et « Tic de A : aucun effet » dans la
confirmation).

### Cibles au choix

Un effet peut laisser le joueur **choisir sa cible** : « une bille de votre main au choix »,
« jusqu'à 2 billes actives au choix ». Le mécanisme est construit une fois, dans la
simulation et dans l'écran, pour tous les effets.

**Déclaration** (`marbles/core/effects.js`, en-tête ; forme courte `choice`,
`marbles/content/effects.js`) : `target: { type: "choice", zones, pick, count, mode }`.

- `zones` : où le joueur choisit, parmi `marbles/core/zones.js`/`CHOICE_ZONES` : aujourd'hui `hand`, `triangle`
  et `discard` (la défausse, dans l'ordre d'arrivée, une cible `{ zone: "discard", index,
  marble }`) ; `pot` et `bag` y sont déclarés, pas encore disponibles (refusés au
  chargement). Ajouter une zone : `available` à vrai, ses cibles
  (`marbles/core/choices.js`/`CHOICE_TARGETS`), ses textes (`marbles.choice.noun.*`).
- `pick` : sur le triangle, `marble` (une bille active) ou `slot` (un emplacement, vide
  compris) ; aucune action actuelle n'a de sens sur un emplacement vide, `slot` est donc
  refusé pour toutes aujourd'hui.
- `count` : le nombre N de choix ;
- `mode`, le **mode**, explicite et toujours déclaré (`CHOICE_MODES`, une cible sans mode
  est refusée au chargement) : `"optional"`, **facultatif**, N choix au plus, moins
  permis, aucun compris (rien de choisi : l'action est ignorée, `choiceEnded` de raison
  `declined`) ; `"required"`, **obligatoire**, exactement N (moins s'il n'y a pas assez
  de cibles), Terminer refusé (`choiceRequired`).
- Les actions qui l'acceptent le déclarent (`CLAUSE_ACTIONS`, `choice` : ses zones et ce
  qui s'y choisit). Aujourd'hui, toutes celles qui acceptent une cible : Empocher et
  Défausser dans la main et sur le triangle, Ramasser dans la défausse, les autres sur
  le triangle (Polissage, Fêlure, Éjecter, Rebond, et Vitesse et Masse en bonus). Ramasser, vers la main
  (`handLimited`), ne propose jamais plus de choix que de places libres ; sans place, rien
  ne s'ouvre (`targetEmpty`, cible `"handFull"`). Plusieurs billes choisies dans la
  défausse s'y suivent par leur place, décalée des précédentes déjà parties.
  Une combinaison impossible est refusée au chargement (une zone sans sens pour l'action,
  un bonus sans phase à venir).

**Déroulé** (`marbles/core/choices.js`/`chooseTargets`) : les N choix se font un par un ; une cible
déjà choisie n'est plus éligible ; la sélection s'arrête à N choix, dès qu'il ne reste
aucune cible éligible, ou sur Terminer (facultatif seulement). Aucune cible éligible dès le
départ : l'effet ne fait rien, le journal le note (`targetEmpty`, cible `"choice"`, « Aucune
cible à choisir : sans effet. ») et rien ne s'ouvre. La sélection finie, l'action
s'applique à chaque cible, dans l'ordre des choix ; une bille de la main se suit par son
entrée (la main change quand une autre part au pot). Un bonus au choix se choisit avant
l'annonce de l'effet ; une action sur une bille, après sa Pioche, à sa place dans les
clauses. Journal : `choice` (ouverture), `chosen` (chaque validation, « X choisie. »),
`choiceEnded` (`reason` : `count`, `declined` « Rien de choisi : l'action est ignorée. »
(Terminer d'un choix facultatif sans aucune cible), `done` « Choix terminé. », `exhausted` « Plus rien à
choisir. ») ; points d'accroche sonores, sans son aujourd'hui.

**Suspension et reprise par rejeu.** Un choix INTERROMPT l'action en cours (pioche, pose,
résolution, réaction du pot…) : le réducteur rend l'état du déroulé à cet instant, avec
`pendingChoice`, et les évènements jusque-là.

```js
pendingChoice: {
  action, amount?, zones, pick, count, mode, by,   // la question, l'effet qui la pose
  eligible, chosen, remaining,                     // cibles valides, déjà choisies, reste
  inTransit,                                       // billes en transit, pour information
  resume: { from, action, answers, seen, eventLimit? },
}
```

**Billes en transit** (`inTransit`) : les billes sorties d'une zone et pas encore arrivées
dans la suivante à l'instant du choix, `[{ kind, marble, slot }]`, souvent vide. Elles
n'appartiennent à aucune zone : jamais une cible ni un écouteur, l'interface les annonce
seulement. Deux natures (`kind`) :

- `"thrown"`, **en cours de lancer** : la bille posée, de sa sortie de la main à son
  arrivée (`placeMarble`), vers l'emplacement visé, `slot` (voir « Déroulé d'une
  pose ») ;
- `"leaving"`, **en partance** : la bille qui a quitté sa zone, le temps de son
  déclencheur de sortie (son Final, son Éjection), depuis l'emplacement quitté, `slot`,
  ou null hors du triangle (voir « Le chemin des billes »).

Le déroulé les tient (`run.inTransit`, `marbles/core/run.js`/`transact`) et les copie
dans le choix qui suspend l'action : l'état n'en a pas d'autre trace, elles ne peuvent
donc exister hors d'un choix en attente.

Une cible : `{ zone: "hand", index, marble }`, `{ zone: "discard", index, marble }` ou
`{ zone: "triangle", slot, marble }` ; sa forme publique, celle de l'action « choisir »,
est `targetRef`.
`resume.from` est l'état d'AVANT l'action suspendue, `resume.action` cette action,
`resume.answers` les réponses déjà données, `resume.seen` le nombre d'évènements déjà
rendus. L'action publique **`{ type: "choose", target }`** (ou `{ type: "choose", done:
true }`, Terminer) rejoue l'action depuis `from` avec une réponse de plus
(`replayAction`) : la simulation étant déterministe (le hasard est dans l'état), le rejeu
refait exactement le même chemin, file du bus comprise, consomme les réponses au même
point, et continue jusqu'à la fin ou au choix suivant ; seuls les évènements d'après `seen`
sont rendus. Pourquoi un rejeu : une pile d'appels JavaScript ne se fige ni ne se
sérialise ; l'état de départ et les réponses, si. Tout reste pur et synchrone, et l'état en
attente se sérialise (vérifié par un aller-retour JSON). L'état suspendu se lit (l'écran
y montre le triangle du moment), il ne se rejoue jamais : c'est un instantané en pleine
action, où une bille peut être en cours de lancer.

**Refus** : tant qu'un choix attend, toute autre action est refusée (`choicePending`) ;
`choose` sans choix en attente : `noChoicePending` ; une cible non éligible :
`invalidChoice` ; Terminer d'un choix obligatoire : `choiceRequired`. `legalActions` rend
alors les réponses (les cibles, puis Terminer s'il est permis).

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
chaque bille ACTIVE, dans l'ordre horaire, avant que la pioche ne reprenne : une
interruption du bus, voir « Le bus d'évènements » ; ses valeurs vont aux compteurs du tour
en cours ; une bille en main, au sac, en défausse ou en cours de lancer n'en a pas ; une
bille retirée par une Trouvaille précédente non plus), l'**Éjection**
(`knockout`, remplacée par une pose, ou chassée par Éjecter, en partance), le **Final**
(`final`, retirée par usure, en partance, avant son arrivée à la défausse ; jamais à une
éjection, un échange ou une pose) et la **Chute** (`drop`, à chaque arrivée de la bille à
la défausse, d'où qu'elle vienne, au bout de son trajet ; jamais après une redirection ;
son évènement est `discarded`, sa bille `"dropped"`, à la défausse : Empocher sur
elle-même l'en fait partir ; ses valeurs vont au tour, la règle des cibles se tranche à
l'exécution ; sa prévision, sur la ligne de l'emplacement qu'elle a quitté, après le
Final). Ils sont déclarés UNE fois, dans
`marbles/config/values.js`/`MARBLE_TRIGGERS`, une entrée chacun :

```js
{
  id: "final",              // la valeur `trigger` de l'évènement `effect`
  field: "final",           // le champ d'effet de la bille
  event: "final",           // l'évènement du journal qui le déclenche
  marble: "leaving",        // la bille concernée : "onSlot" (sur l'emplacement de
                            // l'évènement), "leaving" (en partance, que l'évènement nomme),
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
dérivé, dans l'ordre de la liste, celui de la vie d'une bille, de l'Éveil à la Chute),
l'aide des mots-clés et les outils (chiffres par
déclencheur ; leurs mots, `marbles/tools/format.js`/`TRIGGER_WORDS`, échouent au
chargement s'il en manque un). La liste est validée au chargement du core
(`validateMarbleTriggers`) : un déclencheur sans nom ni description de mot-clé échoue ; ses
textes, par le domaine `marbles-view`. **Ajouter un déclencheur** : son entrée, ses textes
FR et EN (dont son nom et sa description de mot-clé), ses mots dans les outils, et
l'émission de son évènement au bon moment du tour (`marbles/core/marbles.js`,
`marbles/core/run.js` ou `marbles/core/path.js`) ; ses valeurs de
partie et sa place dans l'aide des mots-clés suivent d'office.

Les **phases** sont déclarées de même, dans `marbles/config/values.js`/`MARBLE_PHASES` :
`{ id, field, slots, texts: { name, description } }` (deux entrées : la pointe, et la
base sur ses deux emplacements), validées au chargement (`validateMarblePhases` : chaque emplacement dans une
phase, une seule ; nom et description obligatoires). Le core en tire les champs de phase,
le moment de chacun (règle des cibles) et les mots-clés de phase des valeurs de partie.
L'ordre où les phases JOUENT n'est pas celui de cette liste, mais l'ordre horaire des
emplacements (`SLOTS`) : base droite, base gauche, pointe.

## Simulation

Le réducteur, `reduce(state, action)` des règles (`marbles/core/marbles.js`/`marblesReduce` derrière), est pur et rend toujours `{ ok, state, events, error }`.
L'en-tête de `marbles/core/marbles.js` décrit l'état et les actions ; celui de
`marbles/core/content.js`, chaque évènement du journal.
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
(Maj+L) et, plus tard, les succès. Le mécanisme, `marbles/core/tally.js`, ne sait rien du
jeu ; les compteurs viennent de `marbles/core/counters.js`, en une liste
(`marbles/core/content.js`/`TALLY_COUNTERS`), chacun `{ id, category, count(event, context) }`.

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

La liste des compteurs n'est écrite nulle part à la main : elle se lit dans le code
(`marbles/core/counters.js`, en-tête ; le menu Maj+L la montre). Quatre catégories :

| Catégorie | Source | Compte |
|---|---|---|
| Déclenchements (`trigger`) | générés : un par déclencheur de `MARBLE_TRIGGERS`, un par mot-clé de phase (`marbles/core/content.js`/`PHASE_KEYWORDS`, tirés de `MARBLE_PHASES` : pointe, base, base gauche, base droite), un par moment En poche (`MARBLE_POCKET`), sous l'id du mot-clé ou de l'effet du moment | +1, par bille, quand le mot-clé se déclenche chez une bille qui a un effet pour ce moment : son champ n'est pas vide (pour une base : l'effet de base, ou sa variante de l'emplacement), ou elle a reçu un effet extérieur pour ce moment (un bonus ciblé sur sa phase). Un effet à condition fausse compte ; une phase sautée (emplacement vide, bille retirée avant) ne compte pas. `base` = `leftBase` + `rightBase` |
| Actions (`action`) | générés depuis les actions de `CLAUSE_ACTIONS` qui déclarent `keyword` : leurs déclenchements, sous l'id de l'action, et, si elles en déclarent une, leur quantité réelle, sous `<id>Quantity` | les déclenchements : un par application (une Pioche par effet joué qui pioche ; les autres, une par application, cible vide comprise) ; la quantité réelle : ce qui s'est vraiment appliqué (billes réellement piochées par une Pioche, usure réellement rendue ou ajoutée, billes réellement déplacées ou chassées), que chaque action déclare |
| Vitesse et Masse (`stat`) | générés depuis les actions de valeur sans `keyword` : `<id>Gains`, `<id>Losses` (les occurrences) et `<id>Gained`, `<id>Lost` (les totaux en valeur absolue) | dans chaque effet joué (`effect`), la valeur réellement appliquée aux compteurs du tour (bonus reçu compris, statuts compris ; un bonus perdu n'est jamais appliqué), avant les planchers de l'Impact : une occurrence de gain ou de perte par effet, et le total |
| Évènements (`event`) | déclarés : `marbles/config/values.js`/`MARBLE_TALLIES`, un évènement réel du journal chacun (billes lancées, éjectées, piochées, mélanges, statuts reçus…) | +1 par évènement qui correspond à la déclaration (voir plus bas) |

**Écoutables** (`listenable`) : les compteurs auxquels une bille du pot ou un statut peut
réagir (voir « Les réactions ») : tous les évènements réels, tous les déclenchements de
mots-clés et d'actions, sauf `pocketReaction`. **Les réactions comptent ensemble** : un
seul compteur, `pocketReaction`, +1 par réaction de bille du pot jouée, quelle que soit
l'occurrence écoutée. Un compteur par occurrence doublerait la liste pour une question
que les compteurs écoutés disent déjà ; les réactions d'une bille se lisent dans le simulateur
(« en réaction au pot »). Il n'est pas écoutable.

Un évènement réel se déclare ainsi :

```js
{ id: "wornMarbles", events: ["removed"], match: { cause: "wear" } },
// filter: { type: "size", size: MEDIUM }  facultatif : la bille de l'évènement
```

`match` : des champs de l'évènement et leur valeur. `filter` : la bille que nomme
l'évènement est de ce calibre, seulement sur des évènements qui nomment une bille toujours
connue (`marbles/core/content.js`/`JOURNAL_EVENTS`), jamais la pioche, dont la bille est cachée
dans la prévision.

- **Textes** : par convention, `marbles.tally.<id>.name` (le menu, au pluriel :
  « chiquenaudes ») et `marbles.tally.<id>.unit` (la source, au singulier : « par
  chiquenaude »), vérifiés dans chaque langue par le domaine `marbles-view`.
- **Un seul écrivain** : `marbles/core/tally.js` (`recordTally`, appelé par `transact` à
  chaque émission, et `emptyTally`). Tout le reste lit par `tallyValue(tally, id, portée)`,
  qui lève sur un identifiant ou une portée inconnus.
- **Validation au chargement** : identifiants uniques ; pour les évènements déclarés,
  évènements connus (dans `JOURNAL_EVENTS`, dont la vérification `marbles-tally` contrôle
  qu'il suit le moteur), `match` et filtre.

**Ajouter** : un déclencheur ou une action mot-clé ont leurs compteurs d'office ; un
évènement réel, une entrée dans `MARBLE_TALLIES`. Dans tous les cas, leurs deux textes
dans chaque langue, rien d'autre : chaque compteur devient une source de montant dans ses
deux portées et une ligne du menu de debug.

### Statuts

Un STATUT est un effet durable porté par la partie (`marbles/core/statuses.js`, son
en-tête porte le modèle complet). Les définitions sont un contenu,
`marbles/content/statuses/` (un statut par fichier, registre `index.js`), que le core
n'importe jamais : `createMarblesRules(types, statuses)` les valide
(`marbles/core/validation.js`/`validateMarbleStatuses`) et les lie, comme la table des
billes ; le déroulé les reçoit par `options.statuses` (`run.statuses`). Une définition :
`stacking` (`"intensity"`, `"duration"`, `"unique"`), `duration` (`{ kind, count? }` :
`turn`, `turns`, `nextTurn`, `game`, `charges`), `behaviors`, trois sortes :

| Comportement | Forme | Effet |
|---|---|---|
| caractéristique | `{ type: "stat", stat, amount }` | `throws`, `handSize` ou `potCapacity` augmentée de `amount` × l'intensité |
| modificateur | `{ type: "modifier", point, operation, value }` | à un point d'interception (`MODIFIER_POINTS`, la liste ; ce que chacun modifie et quand : `doc/marbles-rules.md`, section 12, « Les points d'interception »), `add` (`value` × l'intensité) ou `multiply` (`value` à la puissance de l'intensité) |
| réaction | `{ type: "reaction", on, effect }` | un effet de billes joué à chaque incrément du compteur écoutable `on`, comme une bille du pot (voir « Les réactions ») ; l'intensité ne la module pas |

Les INSTANCES sont dans l'état, sérialisées avec lui (`state.statuses`, l'ordre de la
liste étant l'ordre d'acquisition) : `{ status, holder, intensity, remaining, pending,
origin }`, `holder` valant `"game"` (la forme est prête pour une bille, un point en
suspens : `doc/marbles-backlog.md`). Une seule par statut : une nouvelle application se
fusionne (`applyStatus`, selon le cumul).

- **Caractéristiques** : `characteristic(state, key, statuses)`, l'accès unique, lu
  partout où une règle en dépend (lancers restants, pioche, choix vers la main, arrivées
  au pot, zones pleines, `GAME_ZONES`), réglages de la partie plus statuts en vigueur,
  puis planchers (main 1, lancers 0, pot 0). Les règles l'exposent, avec ce qui en
  dépend (en-tête de `marbles/core/rules.js`) ; hors du core, la vue et les outils
  passent par elles. `rules.nextTurnDraw` dit la pioche du prochain début de tour,
  statuts compris (ceux qui prendront fin à ce tour retirés, ceux en attente activés),
  sans consommer de charge : la touche S la lit.
- **Modificateurs** : chaque point déclare sa nature (`MODIFIER_POINTS`, `nature`). UNE
  SEULE AIDE fait passer une valeur par les statuts, `marbles/core/run.js`/`intercept(run,
  modify, ...args)` : la modification (`modify`, l'une des trois ci-dessous), puis les
  charges des statuts qui l'ont vraiment changée, consommées aussitôt ; puis, APRÈS
  l'évènement qui porte la valeur finale, `noteModification` dit les pas et les charges.
  Valeurs signées : `modifyStat` sur la Vitesse et la Masse qu'un effet applique
  (`marbles/core/run.js`/`fireEffect`, bonus reçu compris, par le signe d'avant la
  modification, sur la grandeur, signe remis). Quantités, plancher 0 :
  `modifyQuantity` sur l'Impact (`marbles/core/marbles.js`/`resolveTurn`), la pioche
  du début de tour (`drawTurn`) et l'usure de phase (`resolvePhases`, plafonnée
  ensuite au maximum) ; `modifyActionAmount` sur le montant d'une action de clause qui
  déclare son point (`action` : `effectDraw` pour le total des Pioches d'un effet,
  `polish`, `crack` par clause), dans `fireEffect`, avant que l'effet ne s'émette : ses
  `operations` et son `draw` portent les quantités finales, une quantité ramenée à 0
  retire l'action ; un montant nul n'est intercepté par rien. Ajouter Empocher ou une
  autre action : une entrée de `MODIFIER_POINTS` avec son `action`, et ses textes
  (`marbles.statuses.point.<id>`). Additions puis multiplications, ordre
  d'acquisition, plancher 0. L'évènement `effect` ou `impact` porte la valeur finale ;
  `valueModified` (muet) dit les pas, puis `statusCharge` et `statusExpired` à leur
  place. Un pas ne COMPTE que s'il change la valeur, plancher compris : lui seul entre
  dans les `contributions` et consomme une charge (`useCharges`). Une multiplication
  après une addition qui a ramené la valeur à 0 (plancher) ne change rien : ni
  contribution, ni charge consommée.
- **Réactions** : après le pot, dans l'ordre d'acquisition, selon la règle d'ordre unique
  (voir « Les réactions ») ; un statut ne réagit pas à sa propre réception ni à son
  renforcement. L'effet d'une réaction a `trigger` `"statusReaction"`, `status`, ni bille
  ni emplacement : une cible relative y est refusée au chargement.
- **Durées** : `activatePending` au début du tour, après `turnStarted` (`statusActivated`,
  muet) ; `endTurn` après la rotation, jamais au dernier tour (`statusExpired`).
- **Action** `applyStatus` (`CLAUSE_ACTIONS`, `kind` `"status"`, mot-clé Appliquer un
  statut) : `{ action, status, amount, duration? }`, l'intensité en `amount` ; ses
  `operations` portent l'application résolue (`statusApplication` : durée, cumul).
- **Prévision** : les statuts sont dans la copie ; `statusEffects` et `statusReactions`
  regroupent leurs réactions par statut ; la propriété « prévision = réel » tient.

Ajouter un statut : son fichier et sa ligne dans `marbles/content/statuses/index.js`,
`marbles.status.<id>.name` et `.description` dans chaque langue. Une sorte de
comportement, de durée ou un point d'interception : sa déclaration dans
`marbles/core/statuses.js`, sa validation, ses textes.

### Le bus d'évènements

Chaque action déroule ses évènements par un bus (`marbles/core/bus.js`), synchrone et
déterministe, sans aucun lien avec le DOM. Il vit le temps d'une action : la logique reste
dans le réducteur, et rien d'extérieur ne s'y abonne.

- **Journal d'abord** : chaque évènement entre au journal, puis les billes l'écoutent. Le
  journal reste la seule interface vers l'écran et le son.
- **Ordre des écouteurs, fixe** : l'ordre horaire (base droite, base gauche, pointe), puis la main de la
  première à la dernière (`marbleListeners`).
- **Pas de récursion** : un évènement émis pendant le traitement d'un autre attend dans une
  file, premier entré, premier sorti.
- **Une exception, l'interruption** (`settle`) : son évènement et tout ce qui en découle se
  règlent jusqu'au bout tout de suite, dans une file à part, avant ce qui attendait. En
  sont : la Trouvaille, puis les réactions au mélange, qui se jouent entre la
  régénération et la reprise de la pioche ; l'Éveil, puis les réactions à la pioche,
  entre la pioche d'une bille et celle de la suivante, même quand cette pioche vient d'un
  effet en plein traitement (un Tic qui pioche) ; l'Éjection d'une bille chassée par
  Éjecter ou par une pose, et le Final d'une bille usée, pendant qu'elles sont en
  partance, puis les réactions à leur départ ; l'arrivée d'une bille à la défausse.
- **Le journal s'écrit à l'émission**, dans l'ordre où l'état change : la file étant premier
  entré, premier sorti, c'est l'ordre de traitement, sauf pour une interruption, réglée
  avant ce qui attendait mais émise après. Les valeurs de partie aussi (voir plus haut).
- **Une chaîne** : ce qu'un évènement émis hors de tout traitement déclenche, de proche en
  proche, interruptions comprises. Le corps d'une action en ouvre plusieurs (une par
  phase de la résolution, par exemple).
- **Limite de sécurité** : `MAX_EVENTS_PER_CHAIN` évènements par chaîne. Atteinte, SEULE
  CETTE CHAÎNE est coupée : ce qui en restait est abandonné, le journal le note
  (`chainInterrupted`), et l'action reprend normalement à la chaîne suivante, qui repart
  de zéro (une pose se pose, une résolution joue ses phases suivantes, ses retraits, son
  Impact). Rien n'est levé, aucune action n'est refusée. « Enchaînement interrompu. » se dit à sa place, et dans R et la
  confirmation si la prévision l'atteint (`interrupted`). Une anomalie : la fumée
  (`marbles`), les vérifications et le simulateur la guettent.

- **Un choix suspend l'action** (voir « Cibles au choix ») : le déroulé s'arrête au
  milieu, file comprise, et reprend par rejeu ; le bus n'a rien à garder.

`EVENT_TRIGGERS` dit quels évènements déclenchent un effet : les phases, les
déclencheurs de `MARBLE_TRIGGERS`, les moments du pot et les réactions des statuts. Les
autres passent au journal, prêts à servir.

### La prévision

La prévision, `forecast(state, action)` des règles (`marbles/core/forecast.js`), dit ce
qu'une action produirait, sans écrire de règle : elle copie l'état, applique l'action sur la copie (ou rien, pour le triangle actuel), lance la vraie
résolution (`runResolution`) et lit le journal. Elle ne peut donc pas diverger du moteur :
la vérification `marbles-forecast` le contrôle sur des centaines d'états aléatoires.

**À l'aveugle** : la copie (`marbles/core/forecast.js`/`blindCopy`) ne connaît du sac que son nombre de billes,
jamais leur identité ni leur ordre ; la défausse, que le joueur consulte dans l'ordre
d'arrivée, y reste telle quelle (Ramasser la lit), et un mélange à l'aveugle la cache. La
copie n'a pas le hasard de la partie ; le
déroulé est aveugle (`reduce(…, { blind: true })`). Une Pioche y a lieu avec ses arrêts
(main pleine, plus de billes) mais pioche une bille inconnue
(`marbles/core/effects.js`/`UNKNOWN_MARBLE`) ; une
régénération s'annonce sans mélange. La prévision ne lit ni n'avance donc jamais le hasard
réel, et seules une pose ou un échange s'envisagent. Elle rend, en plus des valeurs :
`slotEffects`, par emplacement, les effets prévus avec lui (le Final d'une bille qui
atteindra son usure maximale ce tour, rien sinon) ; `regenerations`, chaque régénération
du sac en chemin, dans l'ordre, `{ effects }` : les effets prévus avec elle (les
Trouvailles des billes actives, connues : seule l'identité des billes piochées reste
cachée), `[]` sans régénération ; `cleared`, par emplacement, la bille
retirée avant sa phase (une Fêlure, Empocher ou Éjecter) ; `wear` et `retired`, les changements d'usure et les
retraits, dans l'ordre ; `drawn`, les billes que l'action et la
résolution piocheraient ; `tally`, les valeurs de partie à la fin de la résolution (la
copie porte le registre, qui y évolue comme dans la partie ; le registre réel n'est jamais
touché) ; `statusEffects` et `statusReactions`, les réactions des statuts pendant la
résolution et pendant l'action, regroupées par statut ; `uncertain`, vrai si une bille
inconnue aurait pu réagir selon son identité, ses chiffres n'étant alors pas sûrs : un
Éveil possible (`awakenPossible`, voir plus bas), une bille inconnue au pot (piochée à
l'aveugle puis empochée), ou une bille inconnue qu'un déclencheur aurait pu concerner
(une Chute d'une bille défaussée du sac, par exemple).

**Le pot** est déterministe et inclus : `potEffects`, ce que chaque bille du pot jouerait
pendant la résolution, son effet à chaque résolution et ses réactions regroupés en un effet
(valeurs additionnées, actions et résultats à la suite, par `potIndex`), dans l'ordre
d'arrivée, une bille qui ne joue rien absente ; `potReactions`, de même pour les réactions
pendant l'action envisagée (la pose) ; chaque effet prévu porte, s'il a empoché, `pockets`
(`{ marble, lost, entry }`, la bille déplacée, perdue ou non, et l'effet de son entrée),
rattaché à l'effet qui l'a produite (le `by` de `pocketed` et `lost`). `cleared` compte
aussi une bille empochée avant sa phase.

**Les éjections** se prévoient de même : un effet prévu porte, s'il a chassé des billes,
`ejected` (`{ marble, slot, knockout }`, la bille, son emplacement et l'effet de son
Éjection provoquée), rattaché par le `by` de `eject`. L'Éjection provoquée n'est jamais
celle de la pose (son `effect` porte `ejectedBy`) ; `cleared` compte une bille chassée
avant sa phase.

**Les défausses** se prévoient de même : un effet prévu porte, s'il a envoyé des billes à
la défausse depuis la main ou le sac (Défausser), `discards` (`{ marble, drop }`, la bille
et l'effet de sa Chute), rattaché par le `by` de `discarded` ; une bille défaussée depuis
le triangle se dit sur son emplacement (`cleared`, puis sa Chute avec les effets de
l'emplacement). Une bille défaussée du sac est inconnue à l'aveugle (`marble` null, « une
bille du sac défaussée ») : la prévision est alors incertaine (sa Chute ne se prévoit pas).
Un Rebond depuis le triangle compte aussi dans `cleared`.

**Les cibles vides** se prévoient de même : un effet prévu porte, si une de ses actions sur
une bille (Polissage, Fêlure, Empocher) n'a rien trouvé, `empty` (les évènements
`targetEmpty`, rattachés par leur `by`) : emplacement vide, main vide, bille déjà partie.
Le moteur le sait aussi sûrement qu'il joue le coup. R et la confirmation le disent chez
l'effet, avant ce qu'il a empoché : « Tic de X : Vitesse +4 et Empocher une bille de
votre main au choix, aucune cible au choix », « Final : Polissage 1 à la pointe et Empocher
cette bille, pointe vide, puis X en poche ». La séquence, elle, le dit à part, comme avant
(« Main vide : rien à empocher. »).

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

**L'exception du choix** : la prévision ne devine jamais le choix du joueur. Une cible au
choix y reste indécise (`choiceUndecided`) : son action n'est pas appliquée, l'effet le
porte (`undecided`) et R comme la confirmation le disent chez lui, « Tic de X :
Polissage 1, jusqu'à une bille active au choix, selon votre choix » ; `choiceDependent` est vrai.
Une cible au choix sans aucune cible éligible se prévoit, elle (« aucune cible au
choix »). La propriété « prévision = résultat réel » vaut donc pour tout ce qui ne dépend
ni d'un Éveil ni d'un choix : la vérification saute un résultat réel où un choix attend,
et contrôle que la prévision l'avait dit.

**Prévoir une réponse** : un choix en attente, `forecast(state, { type: "choose", … })`
rejoue l'action suspendue à l'aveugle depuis son état de départ, avec les réponses déjà
données plus celle-ci, puis la résolution si l'action n'en était pas une : l'Impact prévu
du tour avec ce choix, les choix suivants restant indécis. Ce que le joueur a vu piocher
depuis le début de l'action y redevient inconnu ; un rejeu qui en dépendrait diverge, et
le choix concerné reste indécis. Le joueur glouton s'en sert. Pendant un choix, R est
refusé : rien ne se prévoit au milieu d'une action.

## Écran de jeu

Haut et bas changent d'étage (main, bases, pointe), gauche et droite parcourent la main
ou passent d'une base à l'autre. Origine et Fin vont à la première et à la dernière bille,
comme dans un menu ; dans le triangle, elles sont silencieuses. Dans la main, gauche et
droite suivent l'option de cyclage des menus ; jamais dans le triangle. Changer de zone
s'annonce d'abord (« Triangle. », « Main. »), le point final faisant marquer une pause au
lecteur d'écran.
Les touches sont dans la table `marbles` de `marbles/view/screen.js`, l'aide (F1) en est
générée (`doc/help.md`).

Ce qui se dit, selon l'endroit :

| Où | Annonce |
|---|---|
| Bille en main, au sac, en défausse | « argile, normale, usure 3. 1 sur 5 » |
| Bille active, sans sélection | « gorille, calot, pointe, usure 1 sur 3. » |
| Emplacement vide, sans sélection | « pointe, vide. » |
| Emplacement occupé, bille sélectionnée | « pointe, gorille : Vitesse +10. » (la prévision) |
| Emplacement vide, bille sélectionnée | « pointe » |
| R | la vue d'ensemble du tour (voir plus bas) |
| L | le menu de l'historique (voir plus bas) |
| I | tour, score, Vitesse et Masse du tour, lancers restants, échange |
| S | nombre de billes au sac, et la pioche du prochain début de tour, statuts compris (`rules.nextTurnDraw`) |
| D | nombre de billes en défausse |
| P | le pot : ses billes sur sa capacité en vigueur, et les billes perdues |
| A | les statuts de la partie (voir « Statuts (A, Maj+A) ») |

Ces lignes d'état ont leurs textes sous `marbles.state.*` (`bag`, `discard`, `pot`,
`turn`, `throws`, `swap_*`) ; `marbles.status.<id>.*` reste le nom et la description d'un
statut.

Le calibre se dit juste après le nom, dans l'annonce principale seulement ; la fiche n'en dit
rien de plus, ses conditions de calibre passant par les champs d'effet.

Une valeur négative porte le vrai signe moins, collé au nombre (« Vitesse −3 », U+2212) :
un lecteur d'écran le lit, là où il peut taire un trait d'union. Un gabarit d'effet
l'écrit lui-même ; un compteur passe par `marbles/view/narration/effects.js`/`formatCounter`.

**Poser** : Entrée sur une bille la sélectionne et ouvre la **sélection d'emplacement**.
Le curseur passe sur le premier emplacement vide dans l'ordre horaire (base droite,
base gauche, pointe), sur la base droite si tout est occupé, et le dit : « Sélection :
X. Choisissez un emplacement. Base droite ». Tant qu'elle dure, seuls les trois
emplacements sont accessibles : la main n'existe plus pour le curseur, Bas sous une base
bute (`stepCursor(…, triangleOnly)`). Échap l'annule et ramène sur la bille, dans la main ;
après la pose, le curseur revient aussi dans la main.

Entrée sur un emplacement ouvre une confirmation (`view/menus/confirmation.js`, le modèle
commun à tout le jeu), toujours, même sur un emplacement vide. Ses lignes d'information se
lisent et ne s'activent pas (Entrée n'y fait rien) :

(`marbles/view/narration/forecast.js`/`placementLines`), pour la pose d'une bille A sur
un emplacement, occupé ou non par une bille B :

1. « Poser A en pointe ? » ;
2. les valeurs prévues, sur leur propre ligne, au format de la vue d'ensemble (R) :
   « Vitesse +6 », valeurs produites, non nulles, bonus reçu compris, et ce que la bille
   donne à une autre (« Vitesse +4 à la pointe ») ; « aucun effet » si rien ; suivies du
   Final de la bille posée si elle
   atteint son usure maximale ce tour (« Vitesse +6. Final : Pioche 1. ») ;
3. toujours, « Chiquenaude de A : Vitesse +2 », ou « … : aucun effet » ;
4. sur un emplacement occupé, « Éjection de B : Vitesse +3 », ou « … : aucun effet » ;
5. sur un emplacement occupé, « Tic de A : Vitesse +2 », ou « … : aucun effet ». Un
   Empocher prévu s'y dit chez la bille qui le produit, avec ce qu'il déplace et l'entrée
   au pot : « Tic de A : Vitesse +4 et Empocher la première bille de la main, puis
   X en poche, à l'entrée : Vitesse +10 » (pot plein : « …, puis pot plein :
   X perdue ») ; une cible vide, de même, avant (« …, main vide ») ; de même
   dans les valeurs prévues de la bille posée ;
6. pour chaque régénération du sac que la pose et la résolution provoqueraient, « Le sac
   sera régénéré. » (« Le sac sera de nouveau régénéré. » pour les suivantes), puis une
   ligne par Trouvaille qu'elle déclencherait (« Trouvaille de X : Vitesse +3. ») ;
   enfin, si un Éveil est possible, « Éveils possibles. », et si la limite de sécurité
   arrêterait la chaîne, « Enchaînement interrompu. » ;
7. toujours, les réactions du pot que la pose provoquerait (`potReactions`), par bille
   dans l'ordre d'arrivée : « Pot : X, Masse +1 ; Y, Vitesse +2 », ou « Pot :
   aucun effet » ;
8. dès que la partie a des statuts, les réactions des statuts que la pose provoquerait
   (`statusReactions`) : « Statuts : ferveur, Vitesse +2 », ou « Statuts : aucun
   effet » ;
9. Annuler (Échap aussi : la sélection d'emplacement reprend) ;
10. Confirmer.

Une Chiquenaude qui viderait l'emplacement visé (une Chiquenaude qui éjecte la pointe,
posée en pointe) laisse les lignes d'Éjection et de Tic à « aucun effet » : elles
n'auront pas lieu, et le menu garde sa structure.

Une Pioche s'y dit comme une valeur (« Tic de A : Pioche 1 »), sans jamais nommer une
bille du sac.

### Choisir une cible

Quand un effet laisse choisir, l'écran passe en **mode choix** tant que le choix attend
(`marbles/view/choice.js`, pur ; branché dans `marbles/view/screen.js`). La question se dit
après ce que l'action a déjà fait, avec la bille et le moment qui la posent (`by`), comme
ses effets se disent, sa phrase selon le MODE (`marbles/view/narration/journal.js`/
`describeChoicePrompt`, construite de l'action et de la zone). Ce que disent les
questions, dans chaque mode, et des exemples : `doc/marbles-rules.md`, section 9, « Le
choix du joueur ». Les gabarits :

- la question, `marbles.choice.question.optional` ou `.required`, qui reçoit le verbe de
  l'action (`marbles.choice.verb.<action>`) et le nom de la cible selon la zone
  (`marbles.choice.noun.*`) ; un bonus a sa phrase à lui, `marbles.choice.may.<action>`
  (`target`, `limit`, `effect`), pour éviter « à jusqu'à » : « vous pouvez donner Vitesse
  +2 à 2 billes actives au plus » ;
- après une cible, `marbles.choice.more.optional` ou `.required` ;
- dans un choix facultatif, l'indication de la touche T, « T pour ne rien choisir. »
  tant que rien n'est choisi, « T pour terminer. » ensuite (`decline_hint`,
  `finish_hint`) ;
- le préfixe, la bille et le moment qui la posent (`marbles.choice.by_*` : une phase, un
  déclencheur, le pot, une entrée au pot, un statut) ;
- chaque cible choisie se dit (`marbles.choice.chosen`, « X choisie. »).

- **Main** : un menu horizontal des SEULES billes éligibles, dans l'ordre de la main, puis,
  en mode facultatif, « Ne rien choisir » tant que rien n'est choisi, « Terminer » ensuite ;
  positions comptées dans ce menu. En mode obligatoire, ni l'un ni l'autre.
- **Défausse** (Ramasser) : le même menu horizontal, à la même place du curseur, des
  billes éligibles de la défausse dans l'ordre d'arrivée ; fiches et mots-clés (E, Maj+E)
  sur chaque option, la balise au survol à la défausse. Un choix n'a jamais à la fois la
  main et la défausse.
- **Triangle** : la même forme et la même navigation que l'écran habituel (pointe en haut,
  bases en dessous). Les emplacements non éligibles restent accessibles, pour garder le
  repère, mais se disent « Non éligible. » et Entrée y bloque (son de blocage).
- **Bille en transit** (`pendingChoice.inTransit`) : l'emplacement lié à une bille en
  transit l'annonce après son contenu, avant « Non éligible. » s'il y a lieu, selon sa
  nature (`marbles.choice.in_transit.<kind>`) : l'emplacement que vise une bille en cours
  de lancer (`thrown`, « Base droite, vide. En approche : X. Non éligible. »), celui que
  vient de quitter une bille en partance pendant son Final ou son Éjection (`leaving`,
  « Pointe, vide. En partance : X. »). Jamais une cible ; rien de plus dans un choix de
  la main seule, où le triangle n'est pas parcouru, ni pour une bille en partance hors
  du triangle.
- **Les deux zones** : on passe de l'une à l'autre comme d'habitude, le nom de la zone
  annoncé ; une seule zone : l'autre n'existe pas pour le curseur.
- **Entrée** choisit ; **T** fait comme « Ne rien choisir » ou « Terminer » dans un choix
  facultatif (partout, sur le triangle surtout, qui n'a pas de menu ; refusé, « Ce choix est
  obligatoire. », sinon) ; **Échap** fait comme T dans un choix facultatif (il valide la
  sélection en cours ; rien de choisi : l'action est ignorée, et cela se dit), et redit la
  question dans un choix obligatoire, qui ne se ferme pas (le jeu ne peut continuer sans
  lui). Ne rien choisir n'est pas une erreur : les joueurs automatiques le peuvent aussi
  (c'est une action légale).
- Fiches (Ctrl+haut, Ctrl+bas) et mots-clés (E, Maj+E) marchent sur chaque option ; R est
  refusé pendant le choix.

T était libre dans l'écran des billes ; elle porte l'aide « Ne rien choisir, ou terminer
un choix facultatif ».

### Fiches de détail

Une bille porte trop d'informations pour une seule annonce. Le curseur principal annonce
court ; **Ctrl+haut** et **Ctrl+bas** parcourent ses champs un par un, sur un axe vertical
autour de cette annonce :

```
Base : Vitesse +1.          <- 2 fois Ctrl+haut
Pointe : Vitesse +4.        <- Ctrl+haut
X, normale, usure 3. 1 sur 5 <- position par défaut
Tic : Vitesse +2.           <- Ctrl+bas
```

Au-dessous, les champs des déclencheurs, facultatifs, dans l'ordre de la vie d'une bille :
éveil, chiquenaude, tic, trouvaille, éjection, final, chute (« Final : Masse +1. ») ; ils viennent de
`MARBLE_TRIGGERS`. En dernier, En poche, un champ par moment fixe (`MARBLE_POCKET` ; dans
le modèle de fiche, `part` désigne le moment) : « En poche, à l'entrée : Vitesse +10. »,
« En poche, à chaque résolution : Masse +1. », puis une ligne par occurrence écoutée, dans
l'ordre des valeurs de partie (`reactive` dans le modèle, déplié par
`marbles/view/card.js`) : « En poche, à chaque chiquenaude : Vitesse +2. ». Chaque
occurrence écoutable a son texte, `marbles.tally.<id>.each` (« à chaque chiquenaude », « à
chaque bille éjectée », « à chaque phase de pointe »), vérifié dans chaque langue. Un montant calculé s'y dit avec sa valeur actuelle (voir « Montants
calculés »).

Les champs disent les effets IMPRIMÉS. En butée, le champ se réannonce, sans son ni
cyclage. Revenir à la position par défaut réannonce l'annonce principale. Tout geste du
curseur principal y ramène le curseur secondaire (`MARBLES_SETTINGS.cardResetOnMove`).
Désactivé, le curseur secondaire reste où il est : arriver sur une bille dit alors son
annonce principale et le même champ, pour comparer plusieurs billes.

Les fiches fonctionnent dans la main, sur le triangle (pendant une pose aussi : l'annonce
principale reste alors la prévision) et dans les menus du sac et de la défausse.

**Ajouter un champ** : sa ligne dans `marbles/config/values.js`/`MARBLE_CARD_MODEL` et son
gabarit, sans toucher à la navigation. Le mécanisme (`lib/detail-card.js`) ne sait rien des
billes : une fiche est une annonce principale et une liste de champs.

### Sac, défausse et pot

**Maj+S**, **Maj+D** et **Maj+P** ouvrent un menu horizontal à fiches
(`marbles/view/pile-screen.js`, sur le menu commun `marbles/view/card-menu.js`, que
partage aussi le menu des statuts) : une entrée par bille, puis « Retour » ; Échap ferme
aussi. Bornes, cyclage et étoile sont ceux des menus ; fiches (Ctrl+haut, Ctrl+bas) et
mots-clés (E, Maj+E) y marchent sur chaque bille. Une pile vide le dit, « Aucune bille. »,
avant « Retour » : le menu ne s'ouvre jamais sur un « Retour » seul, muet sur la raison.
**P** dit le pot : « 2 billes sur 3 dans le pot, 1 bille perdue. » (`describePot`, la
capacité en vigueur, accords compris). Le menu du pot suit l'ordre d'arrivée ; les
billes perdues n'ont pas de menu.

Le menu du sac se dit par ordre alphabétique (`bagDisplayOrder`) : l'ordre ne dépend que
du contenu du sac, et ne révèle donc jamais l'ordre de la pioche. Aucun hasard n'y entre,
ni celui de la partie ni un autre. Le menu de la défausse suit l'ordre d'arrivée, de la plus
ancienne à la plus récente. Les deux menus ne font que lire : les ouvrir ne change rien à la
partie.

### Vue d'ensemble (R)

Une seule annonce, d'un bloc et sans pause, tirée de la prévision du triangle actuel
(`describeOverview`) : d'abord le résumé, l'information la plus souvent cherchée, puis
chaque emplacement dans l'ordre horaire.

```
Prévision : Vitesse 7, Masse 2, Impact 14. Base droite, X : Pioche 1.
Base gauche, Y : Vitesse +1. Pointe, Z : Vitesse +6.
```

Une bille qui atteint son usure maximale ce tour fait suivre sa phase de son Final, compté
dans le résumé : « Pointe, X : Vitesse +5. Final : Vitesse +4. ». Une bille qui ne s'use
pas ce tour n'en dit rien, une bille sauvée par un Polissage non plus. Une bille qu'une
Fêlure retirera avant sa phase n'a pas d'effet de phase : « Pointe, X : retirée avant sa
phase. Final : Vitesse +4. ».

Vitesse et Masse comprennent ce que le tour a déjà gagné (Tic, Éjection) ; l'Impact
applique les planchers. Un emplacement dit les valeurs que sa bille PRODUIT, après
conditions et bonus reçus, jamais un texte de condition : valeurs nulles omises, « aucun
effet » si rien ; une Pioche est une valeur comme une autre (« Pioche 1 »). Un DON se dit
chez la bille qui le fait, et se compte chez celle qui le reçoit : une bille en base
gauche qui donne Vitesse +4 à la pointe dit « Vitesse +4 à la pointe », la bille de
pointe qu'elle renforce, dont la phase donne Vitesse +6, « Vitesse +10 ». C'est la même
façon de dire un effet partout, pose, R, séquence et fiches
(`marbles/view/narration/effects.js`/`describeEffect`). Si la résolution régénérerait le sac, « Le sac sera
régénéré. » termine l'annonce, suivi d'une phrase par Trouvaille qu'elle déclencherait, qui
nomme sa bille (« Trouvaille de X : Vitesse +3. »). Chaque régénération se dit ainsi
avec ses propres Trouvailles, comme dans la séquence, la deuxième « de nouveau » : « Le sac
sera régénéré. Trouvaille de X : Vitesse +3. Le sac sera de nouveau régénéré.
Trouvaille de X : Vitesse +3. ». Après les trois emplacements et avant les régénérations,
une ligne par bille du pot qui jouerait quelque chose pendant la résolution, dans l'ordre
d'arrivée : son effet à chaque résolution et ses réactions, regroupés (« Pot, X : Masse
+1. », « Pot, Y : Polissage 1 à la pointe. ») ; aucune pour les autres. Puis, de même,
une ligne par statut qui réagirait pendant la résolution (`statusEffects`, « Ferveur :
Vitesse +2. »). Le résumé les compte. Si un Éveil est
possible, « Éveils possibles. » termine l'annonce ; si la limite de sécurité arrêterait la
chaîne, « Enchaînement interrompu. ». Même gabarit que les
phases de la séquence (`outcomeLine`) : la prévision et la résolution se disent pareil.

### Séquence de résolution (Maj+R)

**Maj+R** lance la résolution, à tout moment de la phase de jeu et quel que soit le
triangle, le modificateur évitant une fausse manipulation. La
simulation résout le tour et pioche le suivant tout de suite ; ce qui suit n'est que de la
présentation, une file d'étapes (`marbles/view/sequence.js`) dite avec une pause après
chacune :

1. « Résolution du tour 3. » (au tour 1, suivi de « Entrée pour passer la résolution. »),
   enchaînée SANS PAUSE sur la première phase : les deux partagent la première étape
   (`resolutionSteps`), une pause nulle entre deux étapes ferait couper la première
   annonce par la seconde ;
2. à 4. chaque phase, dans l'ordre horaire : « Base droite, X : Vitesse +1. », « Base
   gauche, vide. », « Pointe, Y : Vitesse +6. », avec les règles de la vue d'ensemble,
   puis une étape par bille du pot qui a un effet à chaque résolution (« Pot, X : Masse
   +1. »), avec la pause habituelle, avant les retraits ; une réaction du pot ou d'un
   statut se dit à sa place chronologique, sa propre étape avec la pause habituelle,
   selon la règle d'ordre des réactions (voir « Les réactions » : après l'effet de la
   bille concernée ; « Pot, X : Polissage 1 à la pointe. », après le mélange et la pioche
   qui l'ont provoqué), pendant la résolution comme pendant une pose (« Chiquenaude de
   Y : … », puis « Pot, X : Vitesse +2. », puis « Ferveur : Vitesse +2. »), et entre dans
   l'historique ; une mise en poche se dit après l'effet qui la produit (« X est mise en
   poche. », « Entrée au pot de X : Vitesse +10. Vitesse 10, Masse 1. », ou « Le pot est
   plein : X est perdue. ») ; une phase qui pioche est suivie de sa pioche (« Base
   gauche, X : Pioche 1. », « Vous piochez Y. ») ; un Polissage ou une Fêlure, de son
   application (« X se fêle : usure 2 sur 2. », « X est polie : usure 1 sur 2. »,
   « Pointe, vide : sans effet. ») et des retraits qu'une Fêlure provoque, avec leur
   Final ;
5. une étape par bille usée : « X est usé et part à la défausse. » (l'adjectif
   s'accorde au genre du nom, attribut `gender` des noms français), suivie de son Final
   s'il en a un (« Final de X : Vitesse +4. ») et de ses pioches ;
6. « Impact 18. Score 42. » ;
7. « Le triangle tourne d'un cran dans le sens horaire. » (le nombre de crans et le sens
   sont des paramètres du texte : les crans viennent de l'évènement `rotation`, le sens
   de la constante `ROTATION_DIRECTION` de `marbles/view/narration/journal.js`) ;
8. la pioche : « Vous piochez X. », « Main pleine, pas de pioche. » ou « Plus aucune
   bille à piocher. », précédée s'il y a lieu de « Le sac est vide : la défausse est
   mélangée et forme un nouveau sac. » ;
9. « Début du tour 4, jouez vos billes. »

Au dernier tour, ni rotation ni pioche : les retraits et l'Impact mènent à la fin de
partie. Si la pioche du tour suivant ne trouve plus aucune bille, « Plus aucune bille à
piocher. » se dit, et le tour suivant commence quand même. Une pioche en cours de tour
(Tic, Éjection) se dit de la même façon, juste après l'effet qui la provoque.

**Un choix pendant la résolution** (un Final à cible au choix) : la séquence dit les étapes
jusqu'à lui, puis sa question en dernière étape, et s'arrête là ; le geste qui passe la
séquence s'arrête aussi à la question. Le choix fait, la suite de la résolution (et la
pioche qui la suit) reprend en séquence, avec ses pauses, chaque étape avec ses sons ; à
la fin, le curseur revient dans la main. Une bille piochée en cours de séquence s'entend
à sa place dans la main de ce moment, pas dans celle de la fin de la séquence. Un Éveil
à choix pendant la pioche du tour suspend cette pioche : « Début du tour … » ne se dit
qu'après le choix, à la fin de sa reprise (`buildSteps`, `carriedTurn`), quand le joueur a
vraiment sa main.

**Construite du journal** (`buildSteps`, la même pour une pose, un échange et la pioche
du tour 1) : chaque évènement qui se dit devient une étape, à sa place chronologique ;
un évènement muet (`phase`, `knockout`, `hit`, `removed`) rejoint l'étape suivante,
l'usure, la fin de tour et l'évènement `awaken` la précédente, pour que leurs sons
partent avec elle. Deux règles d'ordre seulement : les pioches consécutives se disent en
une liste, et le début de tour vient après sa pioche. Un Éveil qui a un effet se dit juste
après sa bille piochée (« Vous piochez X. », « Éveil de X : Vitesse +2. Vitesse 2,
Masse 1. ») et coupe la liste ; un Éveil sans effet ne la coupe pas. Un effet d'un nouveau déclencheur s'insère donc comme une
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
qu'elle se dit. Restent permis : Retour arrière (redire l'étape), l'aide (F1, H) et
**Échap**, qui propose de quitter la partie : voulu, pour pouvoir partir à tout moment ;
la confirmation ouverte par-dessus fige la séquence, qui reprend si l'on reste.

**Passer** : Entrée (ou Espace, la même action) amène directement au début du tour
suivant, ou à la fin de partie, sans dire les étapes d'avant ni jouer leurs sons. L'état
ne change pas : il était déjà complet avant la première étape. Un second Entrée pressé
dans les `skipGuardMs` (400 ms, `MARBLES_SETTINGS`) qui suivent est ignoré : il
choisirait la cible d'une question, ou quitterait la fin de partie, avant que le lecteur
d'écran ne l'ait dite.

**Retour arrière pendant un choix** redit la question, puis la ligne du curseur : dans un
choix facultatif, Échap terminant le choix, c'est le moyen de la réentendre. La
question entre aussi dans l'historique (L), comme les autres messages de jeu.

### Sons

Les sons du minijeu sont rangés à part, dans `assets/sounds/marbles/` et
`assets/musics/marbles_classic`. Les clés vivent dans `marbles/config/values.js`, vérifiées
par l'audit du contenu ; la lecture, dans `marbles/view/sounds/playback.js`.

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
- sons de DÉCLENCHEUR (`MARBLES_AUDIO` : `flick`, `awaken`, `final`, `windfall`), seulement
  quand le mot-clé se déclenche chez une bille qui en a l'effet, au volume de l'interface,
  avec une légère variation de ton : la **Chiquenaude** à la place qu'occupait la bille
  dans la main (celle de sa balise quand on parcourt la main), au début de la pose, avec
  le départ de son roulement ; l'**Éveil** à la place de la bille piochée dans la main,
  `awakenAfterDrawMs` (250 ms) après sa balise de pioche, la balise suivante l'attendant ;
  le **Final** à l'emplacement que la bille vient de quitter, la **Trouvaille** à
  l'emplacement de la bille active, l'un après l'autre (`triggerSoundIntervalMs`, 120 ms) ;
- **billes du pot qui agissent** (leur effet à chaque résolution, leurs réactions) : leur
  balise, au pot, au moment de leur étape, pendant la résolution comme pendant la phase de
  jeu ; leur entrée au pot, elle, se dit par son roulement et sa chute ;
- **début du tour du joueur** (`MARBLES_AUDIO.playerTurn`, `player_turn`), au centre, quand
  la main lui revient : à l'ouverture de la partie (le premier tour), et à l'étape de la
  séquence qui dit le début du tour, qu'elle ait été écoutée ou passée (un saut joue la
  dernière étape) ; après les balises de pioche du même geste ;
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
  points d'accroche muets, la perte sans place imposée ; une cible vide (`targetEmpty`)
  aussi ;
- Polissage et Fêlure (`polished`, `cracked`) : leur son (`MARBLES_AUDIO.polish`,
  `marble_polishing` ; `MARBLES_AUDIO.crack`, `marble_cracking`), le même pour tous les
  calibres, à l'emplacement de la bille touchée, au volume de l'interface. Seulement quand
  l'usure change (`applied`) : un Polissage d'une bille déjà à 0 reste muet ; une Fêlure
  qui retire une bille déjà à son maximum se fait entendre. Plusieurs dans un même geste
  (un choix de 2 billes) se suivent à `wearSoundIntervalMs` (120 ms). Une bille qu'une
  Fêlure retire part comme une bille usée, `crackToOutMs` (150 ms) après le son de sa
  fêlure, pour qu'on l'entende avant le roulement ;
- déplacements par effet (`depart`) : une bille défaussée de la main roule de sa place
  dans la main à la défausse ; défaussée du triangle, comme une bille usée ; défaussée du
  sac, un point d'accroche muet ; renvoyée ou ramassée en main (`returned`), elle roule de
  son emplacement, ou de la défausse, à sa place dans la main, et y tombe. La Chute et la
  redirection (`redirected`) sont des points d'accroche muets ;
- rotation : les billes du triangle roulent ensemble, chacune vers l'emplacement suivant
  (l'ordre du cœur, `nextSlot`), puis s'y calent avec une chute discrète ; un
  emplacement vide reste muet. Pas de son de rotation à part : les billes suffisent.

Les repères passent par une **file de sons** (`marbles/view/sound-queue.js`), avancée par
`onFrame` comme la séquence : le son seul attend, le joueur garde la main. Un menu ouvert
par-dessus la fige ; passer la séquence (Entrée) vide ce qui restait à venir. Pendant la
séquence, les sons d'une étape partent avec elle.

**Roulements** : un repère de roulement suit un **chemin**, la suite des places par où passe
la bille (deux au moins, le départ et l'arrivée) ; elle passe par les étapes sans s'y
arrêter. La boucle de roulement du profil joue tout le trajet, et chaque frame la déplace
sur la table : position et vitesse
viennent de `marbles/view/rolls.js`, le rendu de la position est celui d'une place
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

**Variations de ton** : collisions, chutes, roulements, polissages, fêlures et sons de
déclencheur (Chiquenaude, Éveil, Final, Trouvaille) jouent chacun à une vitesse de lecture
tirée au hasard autour de 1 (`MARBLES_PITCH_VARIATION` : ±4 %, ±3 %, ±2 %, puis ±3 % pour
les autres, le roulement une fois par trajet), pour que deux sons de suite ne soient
jamais identiques. Le début du tour du joueur n'en a pas.
Jamais les balises : la balise est l'identité de la bille. Un hasard de rendu, que la
simulation ne voit pas.

**Balise au survol** : la balise de la bille sur laquelle le curseur arrive, dans la main, sur
un emplacement occupé (à l'ouverture de la sélection d'emplacement aussi), et dans les menus
du sac et de la défausse (à l'ouverture et à chaque déplacement). Une seule à la fois : la
suivante coupe la précédente. Une butée, qui laisse le curseur en place, n'en joue pas.

**Espace** : un son de bille s'entend à sa place sur la table (`MARBLES_SOUND_PLACES`,
`renderAt`), en stéréo et en volume, jamais en HRTF. La balise d'une bille piochée s'entend à
sa place dans la main, la cascade de pioche va donc de gauche à droite ; la chute d'une pose,
la balise de phase, le Polissage et la Fêlure à l'emplacement ; la balise au survol là où est le curseur ; un
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
sac et de la défausse : `marbles/view/keywords.js`) :

- **E** : une seule annonce, « Éveil : se déclenche quand la bille est piochée. Final : … » ;
- **Maj+E** : un menu vertical (`lib/menu.js`), titré « Mots-clés de géante », une entrée par
  mot-clé (« Pioche : pioche des billes du sac. … »), puis « Fermer » ; Échap ferme aussi.
  Les entrées se lisent, Entrée n'y fait rien.

Seulement les mots-clés présents sur la bille (`marbles/core/content.js`/`keywordsOf`,
exposé par `rules.keywordsOf`) : ses champs non vides (déclencheurs, En poche, pointe,
base, variante comprise) et les actions mots-clés de ses clauses, chacun une fois, dans
l'ordre de `MARBLE_KEYWORDS` (`buildMarbleKeywords`) : les déclencheurs dans l'ordre de
`MARBLE_TRIGGERS`, En poche, les actions mots-clés dans l'ordre de `CLAUSE_ACTIONS`, puis
**pointe et base en dernier** : présentes sur presque toutes les billes, elles ne passent
pas devant ce qui distingue la bille. Ni Vitesse ni
Masse (ce ne sont pas des mots-clés), ni calibre. Sans bille (emplacement vide, main vide,
« Retour » d'un menu de pile) : « Aucune bille. » ; une bille sans mot-clé : « Aucun
mot-clé. » (dans le menu, cette entrée seule, puis « Fermer »). Refusées pendant la
séquence, comme les autres annonces de consultation.

Les noms et descriptions sont déclarés à côté des mots-clés (`MARBLE_PHASES`,
`MARBLE_TRIGGERS`, `MARBLE_POCKET`, `CLAUSE_ACTIONS` : `keyword.texts`), lus par
`marbles/core/content.js`/`buildMarbleKeywords` : un mot-clé sans eux échoue au chargement. Pas de
conflit de touches : E n'était lié à rien dans ces écrans (l'émote de l'écran de ville n'y
est jamais active).

### Statuts (A, Maj+A)

- **A** : `marbles/view/narration/statuses.js`/`describeStatuses`, « 2 statuts : amorti,
  intensité 2, 3 tours. Lancer supplémentaire, à partir du prochain tour. », ou « Aucun
  statut. ».
- **Maj+A** : `marbles/view/status-screen.js`, sur le menu horizontal à fiches commun
  aux piles (`marbles/view/card-menu.js`) : une entrée par statut (ordre d'acquisition,
  en attente compris), puis « Retour » ; sans statut, « Aucun statut. » avant
  « Retour » ; Ctrl+haut et Ctrl+bas parcourent la fiche (`STATUS_CARD_MODEL` : effet,
  reste, origine) ; E dit la description ; Échap ferme. Aucune balise : un statut n'a pas
  de voix.
- Le journal dit le renforcement, une application sans effet, une charge utilisée et la
  fin ; la réception se dit par l'effet qui la donne ; l'activation et les modifications
  sont muettes. Aucun son propre : des points d'accroche `null` (`MARBLE_EVENT_CUES`,
  `marbles/view/sounds/timeline.js` ; des sons sont en suspens, `doc/marbles-backlog.md`).
- La prévision les compte : la confirmation d'une pose a sa ligne « Statuts : … » dès que
  la partie a des statuts, R dit leurs réactions pendant la résolution (voir « Vue
  d'ensemble (R) »).
- E sur une bille ajoute, après ses mots-clés, une ligne par statut qu'elle peut donner
  (`rules.appliedStatusesOf`).

### Aide (H)

**H** ouvre un menu vertical (`marbles/view/help-screen.js`, un menu de `lib/menu.js`), à
tout moment : une entrée par rubrique, dans cet ordre, « But du jeu », « Score : Vitesse,
Masse et Impact », « Le triangle et la rotation », « L'usure », « Main, lancers et
pioche », « Les zones : sac, défausse, pot, billes perdues », « Les mots-clés » ; Entrée y
dit un texte de quelques phrases, tiré de `doc/marbles-rules.md`, ses valeurs lues dans les
réglages. Puis « Les touches », qui ouvre l'aide des touches de l'écran des billes, la même
que F1 (générée, `lib/help.js`, l'écran décrit passé par `covered`), et « Fermer » ; Échap
ferme aussi. H était libre dans cet écran : F1 et Maj+H sont des touches globales, qui
ouvrent directement l'aide des touches.

### Historique (L)

**L** ouvre un menu vertical (`marbles/view/history-screen.js`, un menu de `lib/menu.js`) :
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
chacune leurs `messages` (l'ouverture et la première phase, une étape, restent deux
messages) : jamais une annonce de navigation (curseur, zone, fiche, R, S, D, I), une
sélection, un refus, ni l'indication « Entrée pour passer la résolution. ». L'écran
(`recorded`) les fait entrer au moment où il construit les étapes, pas au moment où elles
se disent : l'historique est complet même après une séquence passée. Pendant la séquence,
L est refusée comme le reste. L'historique (`marbles/view/history.js`) ne vit que le temps
de l'écran, comme la séquence : la partie de billes n'a pas de sauvegarde.

### Valeurs de partie (Maj+L, mode debug)

En mode debug seulement (le mode du projet, `config/debug.js` : Ctrl+D, ou
`toggleDebug()` dans la console), **Maj+L** ouvre un menu vertical
(`marbles/view/tally-screen.js`, un menu de `lib/menu.js`), regroupé par catégorie :
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
node tools/run-checks.js
node marbles/tools/play.js --seed 42
```

La première ligne lance toutes les vérifications, celles des billes comprises ; un
domaine seul se lance par son nom (`node tools/run-checks.js marbles-statuses`). La liste
des domaines des billes et ce que chacun vérifie, les autres outils (cas construit à la
main, simulateur, comparateur), et comment les vérifications sont organisées (table
figée, textes par leurs clés, contrat des vraies billes) : `doc/marbles-tools.md`.

Le mode d'emploi du kit terminal est en tête de `marbles/tools/play.js` : une partie se
joue au clavier ou par un fichier de commandes, `prevoir` dit la prévision sans rien
changer, et `--json` sort le journal complet pour comparer deux parties. En jeu, mode
debug : `window.debugStartMarbles(seed)` et `window.debugMarbles()`.
