# Règles du jeu des billes

Ce document décrit les règles du jeu des billes telles qu'elles s'appliquent aujourd'hui. Il s'adresse au joueur et au concepteur. Les valeurs citées sont les valeurs actuelles ; les billes de l'annexe sont des billes de test, appelées à changer.

## 1. Le but du jeu

Le jeu des billes est un jeu de stratégie en solitaire, sans adresse ni adversaire. Le joueur pose des billes sur un triangle à trois emplacements, qui tourne d'un cran à chaque tour. Chaque bille a des effets, qui se déclenchent à des moments précis.

Le but est de marquer le plus de points possible. Chaque tour se termine par une résolution, qui produit un Impact ; l'Impact s'ajoute au Score. Le Score final est celui de la fin de partie.

La partie se termine après la résolution du dernier tour, le dixième aujourd'hui, et seulement là. Ni le sac vide ni la main vide ne la terminent : un tour sans bille à poser se résout à vide.

## 2. Le lexique

### Les zones

- **Le sac** : les billes qui attendent d'être piochées. Le joueur en connaît le contenu, jamais l'ordre.
- **La main** : les billes piochées, prêtes à être lancées.
- **Le triangle** : trois emplacements, la base gauche, la base droite et la pointe. La pointe est en haut, les deux bases en dessous.
- **L'ordre horaire** : le seul ordre des emplacements, base droite, base gauche, pointe, puis de nouveau base droite. Il définit l'emplacement suivant (de la base droite à la base gauche, de la base gauche à la pointe, de la pointe à la base droite) et l'emplacement précédent (le sens inverse). Tout ce qui parcourt le triangle le suit : les phases, les retraits, les billes visées ensemble, les réactions des billes.
- **La défausse** : les billes qui ont quitté le triangle. Quand le sac est vide, la défausse est mélangée et devient le nouveau sac.
- **Le pot** : les billes mises en poche par un effet. Elles y restent toute la partie et leurs effets En poche y jouent.
- **Les billes perdues** : les billes envoyées au pot alors qu'il était plein. Elles sont perdues pour la partie et n'ont plus aucun effet.

### Les billes et leurs états

- **Dormante** : une bille dans le sac.
- **En main** : une bille piochée. Elle a un compteur de tours en main, qui part de zéro le tour où elle est piochée et gagne un à chaque début de tour suivant.
- **Active** : une bille posée sur un emplacement du triangle. Elle seule a une usure.
- **Morte** : une bille dans la défausse. Elle redevient dormante quand la défausse reconstitue le sac.
- **En poche** : une bille dans le pot.
- **Perdue** : une bille envoyée au pot plein.

Une bille ne garde rien en changeant de zone : en quittant le triangle, elle perd son usure et son bonus ; en quittant la main, elle perd son compteur de tours en main.

### Les billes en transit

Une bille **en transit** a quitté une zone sans être encore arrivée dans la suivante. Elle n'appartient à aucune zone : elle n'est ni en main ni active, et elle n'est jamais proposée comme cible. Le jeu l'annonce seulement, pour information (section 9, « Le choix du joueur »).

- **En cours de lancer** : la bille lancée, entre la main et le triangle, pendant sa Chiquenaude et jusqu'à son arrivée sur l'emplacement.
- **En partance** : une bille qui a quitté sa zone et n'est pas encore arrivée à sa destination, le temps de son déclencheur de sortie (son Final, son Éjection ; section 7, « Le chemin d'une bille »). Elle ne compte nulle part pour les conditions et les montants : ni parmi les billes actives, ni en main, ni à la défausse.

### Les calibres

Chaque bille a un calibre, qui ne change jamais :

- la minibille, la plus petite ;
- la bille normale ;
- le calot, le plus gros.

Le calibre se compare : une minibille est plus petite qu'une bille normale, elle-même plus petite qu'un calot. Deux billes de même calibre ne sont ni plus petites ni plus grosses l'une que l'autre. Le calibre règle aussi le son de la bille.

## 3. Le score

Deux compteurs vivent le temps d'un tour :

- **la Vitesse**, qui part de 0 ;
- **la Masse**, qui part de 1.

Les effets des billes les augmentent ou les diminuent, tout au long du tour : pendant la pioche, pendant la phase de jeu et pendant la résolution. Ils peuvent devenir négatifs en cours de tour.

À la fin de la résolution :

- **l'Impact** vaut la Vitesse multipliée par la Masse ;
- deux planchers s'appliquent à ce seul calcul : une Vitesse négative compte pour 0, une Masse inférieure à 1 compte pour 1 ;
- l'Impact s'ajoute au **Score** ;
- la Vitesse revient à 0 et la Masse à 1 pour le tour suivant.

Les planchers ne valent qu'au calcul final. Pendant le tour, une Vitesse de moins 3 qu'un effet augmente ensuite de 4 vaut 1.

## 4. Les caractéristiques du joueur

- **Taille de la main** : 5 billes. Une pioche qui trouve la main pleine s'arrête, et la bille reste au sac.
- **Lancers par tour** : 5. Chaque pose depuis la main est un lancer ; l'échange n'en est pas un.
- **Capacité du pot** : 3 billes.
- **Pioche** : 5 billes au premier tour, 1 à chaque tour suivant.
- **Nombre de tours** : 10.
- **Usure maximale** d'une bille : 3, sauf si la bille en indique une autre.

Les lancers par tour, la taille de la main et la capacité du pot sont des valeurs de départ : des statuts peuvent les changer pendant la partie (section 12). Toute règle lit la valeur en vigueur, statuts compris.

## 5. Le déroulé d'un tour

### Début de tour et pioche

1. Chaque bille déjà en main gagne un tour à son compteur de tours en main.
2. La pioche du tour : 5 billes au premier tour, 1 ensuite, une par une, selon la pioche unifiée (section 6).
3. Si cette pioche n'a pu donner aucune bille faute de billes, le jeu le dit, et le tour se joue avec la main qu'on a.

### La phase de jeu

Le joueur fait ensuite, dans l'ordre qu'il veut, sauf pour l'échange :

- **un échange**, facultatif, une fois par tour, avant toute pose. Il échange le contenu de deux emplacements, usure et bonus compris. Avec un emplacement vide, c'est un déplacement. Échanger deux emplacements vides est refusé. L'échange ne déclenche rien.
- **des poses**, dans la limite des lancers. Le joueur pose une bille de sa main sur un emplacement, vide ou occupé (section 9 pour l'ordre exact). Rien ne l'oblige à remplir le triangle.
- **la résolution**, à tout moment, quel que soit le triangle, plein, partiel ou vide.

Une pose se déroule ainsi :

1. **Chiquenaude** : la bille quitte la main ; si elle a une Chiquenaude, son effet joue. La bille est alors en cours de lancer.
2. Si l'emplacement visé est occupé :
   - la bille qui s'y trouve quitte l'emplacement : elle est en partance ;
   - **Éjection** : son effet d'Éjection joue, s'il existe ;
   - elle arrive à la défausse, sauf si son Éjection l'a envoyée ailleurs ;
   - la bille lancée arrive sur l'emplacement ;
   - **Tic** : l'effet de Tic de la bille lancée joue, s'il existe.
3. Si l'emplacement visé est vide, la bille lancée y arrive, sans Éjection ni Tic.

Si la Chiquenaude a vidé l'emplacement visé, la pose se poursuit comme sur un emplacement vide.

### La résolution

1. **Les phases**, dans l'ordre horaire : base droite, base gauche, pointe. Un emplacement vide saute sa phase. La bille de l'emplacement joue son effet de phase, puis prend 1 d'usure, même si cela l'amène à son maximum. Une bille qui a quitté le triangle avant sa phase la saute.
2. **Le pot** : chaque bille du pot, dans l'ordre d'arrivée, joue son effet En poche à chaque résolution, si elle en a un.
3. **Les retraits par usure**, dans l'ordre horaire : chaque bille à son usure maximale quitte son emplacement, son Final joue pendant qu'elle est en partance, puis elle arrive à la défausse (sauf si son Final l'envoie ailleurs), avant la bille suivante.
4. **L'Impact** se calcule et s'ajoute au Score.
5. **La rotation** : chaque bille avance d'un cran vers son emplacement suivant, la base droite vers la base gauche, la base gauche vers la pointe, la pointe vers la base droite. Les emplacements vides tournent aussi. Les bonus disparaissent.
6. Si c'était le dernier tour, la partie se termine ; sinon, le tour suivant commence.

Une bille piochée pendant la phase de jeu peut être lancée aussitôt, dans la limite des lancers. Une bille piochée pendant la résolution attend le tour suivant.

## 6. La pioche et la régénération du sac

### La pioche unifiée

Toute pioche, celle du début de tour comme celle d'un effet, se fait bille par bille, ainsi :

1. si la main est pleine, la pioche s'arrête et la bille reste au sac, sans régénération ;
2. sinon, si le sac a une bille, on la pioche, puis son Éveil joue, avec tout ce qu'il déclenche, puis les billes du pot et les statuts qui réagissent à la pioche, avant la bille suivante ;
3. sinon, si la défausse n'est pas vide, elle est mélangée et devient le sac (la régénération), puis la Trouvaille de chaque bille active joue, puis les billes du pot et les statuts qui réagissent au mélange, et la pioche reprend du début ;
4. sinon, le sac et la défausse sont vides : il n'y a plus rien à piocher.

Le premier arrêt interrompt la pioche : les billes restantes ne sont pas piochées.

La pioche du début de tour et la Pioche d'un effet suivent exactement le même ordre. Ce que joue la pioche du début de tour (Éveils, Trouvailles, réactions) compte pour le tour qui commence.

### La régénération du sac

Une régénération peut avoir lieu à tout moment : en début de tour, pendant la phase de jeu ou pendant la résolution. Les billes du pot et les billes perdues n'y reviennent jamais. Ses Trouvailles et les réactions du pot au mélange comptent pour le tour en cours ; elles jouent toutes juste après le mélange, avant que la pioche ne reprenne.

## 7. L'usure, le polissage, la fêlure et les retraits

### L'usure

Seule une bille active a une usure. Elle arrive sur le triangle à 0. Elle prend 1 d'usure à chaque phase jouée. Son usure maximale est de 3, sauf indication contraire de la bille.

### Le polissage

Un Polissage retire de l'usure, jamais en dessous de 0. Une bille arrivée à son maximum pendant la résolution, puis polie avant les retraits, n'est plus retirée.

### La fêlure

Une Fêlure ajoute de l'usure, jamais au-delà du maximum. Si elle amène la bille à son maximum, la bille est retirée aussitôt, comme par usure : elle quitte le triangle, son Final joue, puis elle arrive à la défausse. Pendant la résolution, sa phase est sautée si elle n'avait pas eu lieu. Pendant la phase de jeu, l'emplacement vidé peut recevoir une pose, sans Tic.

### Les façons de quitter le triangle

- **Par usure** : à l'étape des retraits, ou aussitôt par une Fêlure. Son Final joue, puis elle arrive à la défausse.
- **Par remplacement** : une pose sur son emplacement. Son Éjection joue, puis elle arrive à la défausse. Pas de Final.
- **Par Éjecter** : un effet la chasse. Son Éjection joue, puis elle arrive à la défausse. Pas de Final, pas de Tic.
- **Par Empocher** : un effet l'envoie au pot. Ni Éjection, ni Final.
- **Par Défausser** : un effet l'envoie à la défausse. Ni Éjection, ni Final ; sa Chute joue à son arrivée.
- **Par Rebond** : un effet la renvoie en main. Ni Éjection, ni Final ; main pleine, elle part à la défausse, et sa Chute joue.

Dans tous les cas, elle compte parmi les billes sorties du triangle.

### Le chemin d'une bille

Toute sortie d'une bille de sa zone suit le même chemin, dans cet ordre :

1. **Le départ** : la bille quitte sa zone et devient en partance. Ce départ est acquis : rien ne l'annule.
2. **Le déclencheur de sortie**, s'il y en a un : le Final (une sortie par usure) ou l'Éjection (un remplacement, Éjecter). Il joue entièrement, avec tout ce qu'il déclenche, pendant que la bille est en partance.
3. **La destination** : la défausse, sauf si un effet de la bille elle-même l'a redirigée pendant son déclencheur de sortie (Empocher : le pot ; Rebond : la main). Si plusieurs effets la redirigent, le dernier l'emporte. Une action qui déplace une bille (Empocher, Défausser, Rebond, Ramasser) pose elle-même sa destination.
4. **L'arrivée** : la bille entre dans sa destination. À la défausse, sa Chute joue. Au pot, son effet d'entrée joue ; si le pot est plein, elle est perdue, sans effet d'entrée. En main, rien ne se déclenche ; si la main est pleine, elle arrive à la défausse à la place.

Pendant son Final ou son Éjection, une bille ne peut ni se polir ni se fêler : son départ est acquis. Elle n'est pas encore à la défausse : une Pioche de son Final qui mélange la défausse ne la remet pas dans le sac. Une bille ne passe ainsi qu'une fois d'une zone à l'autre : empochée pendant sa propre Éjection ou son propre Final, elle va au pot sans passer par la défausse.

## 8. Les mots-clés

Les mots-clés se consultent en jeu, sur la bille sous le curseur, avec la touche E (une annonce) ou Maj+E (un menu). Leurs descriptions ci-dessous sont celles du jeu.

### Les mots-clés de déclenchement

- Pointe : effet joué pendant la phase de pointe, quand la bille est posée en pointe.
  - Moment : pendant la résolution, à la phase de pointe, la dernière.
- Base : effet joué pendant la phase de base, quand la bille est posée en base droite ou en base gauche. Il peut différer selon le côté.
  - Moment : pendant la résolution, à la phase de base droite puis à celle de base gauche.
- Éveil : se déclenche quand la bille est piochée.
  - Moment : juste après la pioche de la bille, avant la bille suivante, à tout moment du tour. La bille est en main, à 0 tour en main. Jamais pour une bille restée au sac faute de place.
- Chiquenaude : se déclenche quand la bille est lancée depuis la main, avant qu'elle n'arrive sur le triangle.
  - Moment : au début de chaque pose, sur un emplacement vide ou occupé. La bille est en cours de lancer.
- Tic : se déclenche quand la bille est posée sur un emplacement occupé, après avoir chassé la bille qui s'y trouvait.
  - Moment : à la fin d'une pose sur un emplacement occupé, après l'Éjection de l'occupante et son départ.
- Trouvaille : se déclenche quand le sac est reconstitué à partir de la défausse, si la bille est sur le triangle.
  - Moment : juste après chaque régénération du sac, chez chaque bille active, dans l'ordre horaire, avant que la pioche ne reprenne. Une bille en main, au sac, à la défausse ou en cours de lancer n'en a pas.
- Éjection : se déclenche quand la bille est chassée du triangle.
  - Moment : quand une pose la remplace, ou quand un effet Éjecter la chasse, juste après son départ de l'emplacement, pendant qu'elle est en partance. Une bille qui s'éjecte elle-même déclenche aussi son Éjection.
- Final : se déclenche quand la bille est usée et quitte le triangle, avant qu'elle n'arrive à la défausse : si son Final l'empoche, elle va au pot sans passer par la défausse.
  - Moment : à son retrait par usure, à l'étape des retraits ou aussitôt après une Fêlure. Jamais à un remplacement, à un échange, à une éjection ni à une mise en poche.
- Chute : se déclenche quand la bille arrive à la défausse, d'où qu'elle vienne.
  - Moment : à son arrivée à la défausse, au bout de son chemin : après son Final ou son Éjection s'il y en a un, depuis le triangle, la main ou le sac. Jamais si un effet l'a envoyée ailleurs (au pot). Ses valeurs vont aux compteurs du tour. À la défausse, Empocher sur elle-même l'envoie au pot.
- En poche : effets actifs uniquement lorsque la bille est dans le pot : à son entrée, à chaque résolution, ou en réaction à ce qui se passe pendant la partie.
  - Trois moments : à l'entrée au pot, juste après l'arrivée de la bille (jamais si elle est perdue) ; à chaque résolution, à l'étape du pot ; à chaque occurrence d'un évènement de la partie, une réaction (section 9).

### Les mots-clés d'action

- Pioche : pioche des billes du sac. Si le sac est vide, la défausse est mélangée pour le reconstituer.
  - Pioche selon la pioche unifiée, à tout moment du tour. Jamais de cible.
- Polissage : retire de l'usure à une bille, qui reste ainsi plus longtemps sur le triangle.
  - Cible : la bille elle-même, un emplacement, ou des billes actives au choix.
- Fêlure : ajoute de l'usure à une bille. Si elle atteint son maximum, la bille est usée et quitte aussitôt le triangle.
  - Cible : la bille elle-même, un emplacement, ou des billes actives au choix.
- Empocher : envoie une bille au pot, où qu'elle soit : sur le triangle, en main ou dans la défausse. Si le pot est plein, la bille est perdue pour la partie.
  - Cible : la bille elle-même, où qu'elle soit (sauf en cours de lancer et dans le pot ; en partance, pendant son Final ou son Éjection, elle est redirigée vers le pot) ; un emplacement ; la première bille de la main ; ou une bille au choix, de la main ou du triangle.
- Éjecter : chasse une bille du triangle : son effet d'éjection se déclenche, puis elle part à la défausse.
  - Cible : la bille elle-même, seulement si elle est sur le triangle, jamais dans son Final ni dans sa propre Éjection, où elle est en partance ; un emplacement ; des billes actives au choix ; ou toutes les billes actives, éventuellement d'un seul calibre (« toutes les minibilles actives »).
  - « Toutes les billes actives » comprend la bille qui éjecte, si elle est sur le triangle et passe le filtre. De même, un choix parmi les billes actives peut porter sur la bille qui le pose.
- Défausser : envoie une bille à la défausse.
  - Cible : la bille elle-même, sur le triangle ou en main (à son Éveil), jamais en cours de lancer, en partance, à la défausse ni dans le pot ; un emplacement ; la première bille de la main ; une ou plusieurs billes de la main ou du triangle au choix ; toutes les billes actives, éventuellement d'un seul calibre ; les N prochaines billes du sac, sans les révéler avant.
  - La bille suit son chemin jusqu'à la défausse, où sa Chute joue. Depuis le triangle, ce n'est ni une usure ni une éjection : ni Final ni Éjection ; elle compte parmi les billes sorties du triangle, et sa phase est sautée si elle n'avait pas eu lieu.
  - Depuis le sac : les billes partent du haut, une par une. Un sac qui en a moins donne ce qu'il a, sans mélanger la défausse ; un sac vide ne donne rien.
- Rebond : renvoie une bille du triangle dans la main. Si la main est pleine, elle part à la défausse.
  - Cible : la bille elle-même, sur le triangle, ou en partance pendant son Final ou son Éjection (elle est alors redirigée vers la main) ; un emplacement ; des billes actives au choix ; toutes les billes actives, éventuellement d'un seul calibre.
  - La bille arrive en main à 0 tour en main, et repartira à usure 0 à sa prochaine pose. Ce n'est pas une pioche : pas d'Éveil. Pendant la phase de jeu, elle peut être rejouée ce tour, dans la limite des lancers.
  - Depuis le triangle : ni Final ni Éjection ; elle compte parmi les billes sorties du triangle, et sa phase est sautée si elle n'avait pas eu lieu. Main pleine : elle arrive à la défausse à la place, et sa Chute joue.
- Ramasser : reprend une bille de la défausse dans la main.
  - Cible : la dernière bille arrivée à la défausse ; une ou plusieurs billes de la défausse au choix, dans l'ordre d'arrivée. Jamais la bille elle-même : en partance, elle n'est pas encore à la défausse.
  - La bille arrive en main à 0 tour en main. Ce n'est pas une pioche : pas d'Éveil.
  - Main pleine : la bille reste à la défausse, sans effet pour elle. Un choix ne propose jamais plus de billes qu'il n'y a de places en main ; sans place, il ne s'ouvre pas.

- Appliquer un statut : donne à la partie un statut, un effet durable qui change une caractéristique, modifie une valeur ou réagit à ce qui arrive, pour ce tour, plusieurs tours, le prochain tour, toute la partie ou un nombre de charges.
  - Les statuts en détail : section 12. Jamais de cible : c'est la partie qui porte le statut. Une intensité (1 par défaut), et une durée, celle du statut ; une bille peut en changer le nombre de tours ou de charges, jamais la sorte.
  - Se dit avec l'effet qui le donne : « Tic d'argile : statut lancer supplémentaire, le prochain tour. ».

### Les valeurs

Vitesse et Masse ne sont pas des mots-clés : un effet les augmente ou les diminue (« Vitesse +2 », « Masse −1 »). Sans cible, la valeur va aux compteurs du tour. Avec une cible, elle devient un bonus pour la bille d'un autre emplacement (section 9).

## 9. Les règles fines

### L'ordre exact d'une pose

1. La bille quitte la main et sa Chiquenaude joue, avec tout ce qu'elle déclenche.
2. L'emplacement visé se lit à ce moment.
3. Occupé : l'occupante quitte l'emplacement, en partance ; son Éjection joue, avec tout ce qu'elle déclenche ; puis elle arrive à sa destination, la défausse sauf redirection.
4. La bille lancée arrive sur l'emplacement.
5. Si l'emplacement était occupé, son Tic joue.

### L'ordre exact d'une résolution

1. Phase de base droite, puis de base gauche, puis de pointe : pour chacune, l'effet, puis 1 d'usure.
2. L'étape du pot, dans l'ordre d'arrivée.
3. Les retraits par usure, dans l'ordre horaire : pour chaque bille, son départ, son Final, puis son arrivée.
4. L'Impact.
5. La rotation, puis la fin du tour.

### L'ordre des clauses d'un effet

Un effet peut faire plusieurs choses : « Pioche 1 et Éjecter toutes les minibilles actives ». Ses clauses s'appliquent dans l'ordre où elles sont écrites : ici, la Pioche, puis l'éjection. Seules deux précisions : les valeurs (Vitesse, Masse, Pioche) d'un même effet s'additionnent et se disent ensemble, avant les actions sur une bille ; et un bonus au choix se choisit avant que l'effet ne se dise.

### Ce qui se déclenche en chaîne

Un effet peut en déclencher d'autres. Ils se jouent dans l'ordre où ils surviennent, l'un après l'autre. Quelques exceptions se règlent jusqu'au bout tout de suite, avant la suite : l'Éveil d'une bille piochée, puis les réactions à la pioche, avant la bille suivante ; les Trouvailles d'une régénération, puis les réactions à ce mélange, avant que la pioche ne reprenne ; l'Éjection et le Final d'une bille en partance, puis les réactions à son départ, avant son arrivée ; et l'arrivée d'une bille à la défausse ou au pot.

Quand plusieurs billes réagissent au même évènement, l'ordre est fixe : l'ordre horaire (base droite, base gauche, pointe), puis la main de la première à la dernière.

### Les bonus et la règle des cibles

Une valeur avec une cible donne un bonus à la phase de la bille visée. Le jeu dit le don chez la bille qui le fait (« Vitesse +4 à la pointe »), et le bonus s'ajoute à l'effet de phase de la bille visée, qui le compte dans ses valeurs. Il suit la bille dans un échange, se perd si elle est remplacée, et disparaît à la fin de la résolution.

Une cible n'a de sens que si l'effet visé peut encore se produire :

- un bonus ne vaut que si la phase de la bille visée n'a pas encore eu lieu ce tour ; sinon, ou si l'emplacement est vide, il est perdu. Les phases suivant l'ordre horaire, une base droite peut donner un bonus à la base gauche, jamais l'inverse ;
- une bille ne prévoit jamais de bonus que rien ne pourrait recevoir : pas de bonus dans un Final, ni à chaque résolution du pot, ni depuis la pointe, dont la phase est la dernière ;
- un Polissage, une Fêlure, une Éjection, une mise en poche, une Défausse ou un Rebond peuvent viser un emplacement à tout moment ;
- une bille ne peut agir sur elle-même que là où elle est : pas d'usure sur elle-même hors du triangle, pas d'Éjecter sur elle-même hors du triangle, pas d'Empocher sur elle-même pendant son lancer ni depuis le pot.

### Les cibles relatives

Une action qui vise un emplacement peut viser, au lieu d'un emplacement fixe, l'**emplacement suivant** ou l'**emplacement précédent**, dans l'ordre horaire (suivant : base droite → base gauche → pointe → base droite ; précédent : le sens inverse). « Vitesse +2 à la bille de l'emplacement suivant », « Éjecter la bille de l'emplacement suivant ».

- **La référence** est l'emplacement d'où la bille agit : sur le triangle, son emplacement ; pendant sa Chiquenaude, l'emplacement visé par la pose ; en partance, pendant son Final ou son Éjection, l'emplacement qu'elle quitte ; à sa Chute, l'emplacement qu'elle a quitté si elle vient du triangle.
- **Sans référence** (une Chute d'une bille défaussée de la main, par exemple) : l'effet est sans cible, il ne fait rien, et le journal le note. Une bille n'a jamais de référence à son Éveil ni dans le pot : une cible relative y est refusée.
- **La règle des cibles s'applique comme d'habitude** : un bonus de Vitesse ou de Masse dont la phase visée est passée est perdu, et le journal le note (depuis la pointe, l'emplacement suivant est la base droite, déjà résolue) ; un Polissage, une Fêlure, Empocher, Éjecter, Défausser et Rebond restent valides. Un emplacement visé vide : sans effet, noté.
- **En chaîne** : une Éjection qui éjecte la bille de l'emplacement suivant fait ricocher l'éjection d'emplacement en emplacement ; chaque bille suit son chemin, et le ricochet s'arrête sur un emplacement déjà vidé.

### Les conditions

Une clause peut porter une condition, évaluée au moment où l'effet joue ; fausse, la clause ne produit rien. Quatre sortes de conditions existent :

- **l'effet imprimé d'une autre bille** : la bille d'un emplacement donne au moins une certaine valeur, à cet emplacement. Seul compte ce qui est imprimé sur la bille, jamais un effet déjà modifié ;
- **le calibre relatif**, pendant un remplacement seulement : la bille posée ou la bille chassée est plus petite, ou plus grosse, que l'autre. Quand c'est un effet Éjecter qui chasse, la bille qui éjecte tient le rôle de la bille posée, où qu'elle soit ;
- **le calibre d'un emplacement** : la bille d'un emplacement est d'un calibre donné. L'emplacement peut être relatif : « si la bille de l'emplacement suivant est un calot » ;
- **l'état d'une zone de la partie** : le triangle est plein, vide, ou n'a qu'une bille ; la main est vide, ou pleine ; le sac est vide ; la défausse est vide ; le pot est plein, ou vide. « Pleine » et « plein » se comparent aux caractéristiques en vigueur : la taille de la main, la capacité du pot. Une bille en transit (en cours de lancer, en partance) n'est dans aucune zone et ne compte nulle part : pendant sa Chiquenaude, la bille lancée n'est plus en main ; pendant son Éjection, la bille chassée n'est plus sur le triangle. « Pointe : Vitesse +6 si le triangle est plein. », « Tic : Pioche 1 si la main est vide. », « En poche, à chaque résolution : Masse +2 si le pot est plein. ».

### Les montants calculés

Un montant peut dépendre du moment, par exemple « Vitesse +1 par minibille active ». Il se calcule au déclenchement, avec un plafond éventuel, à partir de :

- **les tours en main** de la bille elle-même ;
- **les billes actives d'un calibre**, la bille elle-même comprise si elle est sur le triangle (en partance ou en cours de lancer, elle ne compte pas) ;
- **une valeur de partie**, ce tour ou cette partie (section 10) ;
- **le nombre de billes d'une zone** : actives, en main, dans le sac, à la défausse, dans le pot, perdues. Une bille en transit ne compte nulle part. La fiche dit la valeur actuelle : « Base : Vitesse +1 par bille en main, maximum +5, actuellement +3. ».

Un montant qui vaut 0 ne produit rien.

### Le choix du joueur

Certains effets laissent le joueur choisir leur cible : une bille de sa main, une ou plusieurs billes actives, une ou plusieurs billes de la défausse (dans l'ordre d'arrivée).

Chaque choix a un mode, écrit sur la bille :

- **Choix obligatoire** : le joueur choisit exactement le nombre demandé, ou moins s'il n'y a pas assez de cibles. « Vous devez choisir une bille active à éjecter. », « Vous devez choisir 2 billes actives à éjecter. ».
- **Choix facultatif** : le joueur choisit au plus le nombre demandé ; il peut s'arrêter avant, et même ne rien choisir. Ne rien choisir n'est pas une erreur : l'action est ignorée, et le jeu le dit. « Vous pouvez éjecter une bille active. », « Vous pouvez éjecter jusqu'à 2 billes actives. ».
- Les choix se font un par un. Une cible déjà choisie n'est plus proposée.
- Seules les cibles valides au moment du choix sont proposées : pour un bonus, seules les billes dont la phase n'a pas eu lieu.
- La sélection s'arrête quand le nombre est atteint, quand le joueur termine, ou quand plus rien n'est proposé.
- L'effet s'applique ensuite à chaque cible, dans l'ordre des choix.
- La question nomme la bille et le moment qui la posent : « Tic de gorille : vous devez choisir une bille de votre main à empocher. », « Final de porcelaine : vous pouvez polir jusqu'à 2 billes actives. ».
- Le jeu attend le choix : rien d'autre ne peut se faire tant qu'il n'est pas fait. Pendant la résolution, elle s'arrête sur la question et reprend après le choix.
- Une bille en transit n'est jamais proposée (section 2). Pendant un choix sur le triangle, l'emplacement vers lequel se dirige une bille en cours de lancer l'annonce après son contenu : « Agate, calot, pointe, usure 2 sur 3. En approche : loupe. ». Un emplacement vide l'annonce de même : « Pointe, vide. En approche : loupe. ».
- Dans un choix facultatif, le menu propose « Ne rien choisir » tant que rien n'est choisi, puis « Terminer » ; sur le triangle, la touche T fait de même. Échap valide la sélection en cours ; sans aucune cible choisie, l'action est ignorée. Dans un choix obligatoire, ni « Ne rien choisir » ni « Terminer » : Échap redit la question.

### Les cibles vides

Une action dont la cible est vide ne fait rien, et le journal le dit : un emplacement vide, une main vide, une bille qui n'est plus là, aucune cible à choisir, aucune bille visée. Rien ne s'ouvre quand il n'y a rien à choisir.

### Le pot

- Une bille n'entre au pot que par un effet Empocher, jamais par un geste du joueur.
- Le pot garde ses billes dans l'ordre d'arrivée, au plus sa capacité en vigueur : 3 au départ, qu'un statut peut changer (section 12).
- **Pot plein** : la bille envoyée est perdue pour la partie. Elle n'a pas d'effet d'entrée, ni aucun autre.
- Une bille au pot n'en sort jamais, et ne revient jamais au sac.
- Ses effets En poche jouent : à son entrée, à chaque résolution, et en réaction.
- Une bille empochée pendant la résolution, avant l'étape du pot, y joue son effet à chaque résolution dès ce tour.
- Ses gains de Vitesse et de Masse comptent pour le tour en cours.

### Les réactions en poche

Une bille du pot peut réagir à ce qui se passe pendant la partie : « En poche, à chaque chiquenaude : Vitesse +2 ».

- Elle peut écouter un évènement de la partie, le déclenchement d'un mot-clé chez une bille qui en a l'effet, ou le déclenchement d'une action : les valeurs de partie de ces trois catégories (section 10, « Les catégories »).
- Elle n'écoute jamais une quantité (comme les points d'usure rendus), ni les gains et pertes de Vitesse et de Masse, ni les réactions elles-mêmes.
- Elle réagit une fois par occurrence : trois billes piochées, trois réactions. Un évènement qui compte pour deux occurrences écoutées donne deux réactions.
- **L'ordre, une seule règle** : l'évènement se produit et les valeurs de partie sont comptées ; la bille concernée joue d'abord son propre effet (l'Éveil après sa pioche, le Final ou l'Éjection après son départ du triangle, les Trouvailles des billes actives après un mélange) ; puis les billes du pot réagissent, dans l'ordre d'arrivée ; puis les statuts, dans l'ordre où ils ont été reçus (section 12). Le même ordre partout : pour la pioche du début de tour comme pour une Pioche d'effet, pour un retrait à l'étape des retraits comme pour un retrait par une Fêlure. Une bille perdue au pot plein suit cet ordre comme toute arrivée. Après un mélange, les réactions jouent avant que la pioche ne reprenne.
- Une bille qui entre au pot ne réagit pas à sa propre mise en poche ; elle réagit aux occurrences suivantes. Une bille entrée plus tard ne réagit pas à ce qui l'a précédée.
- Un bonus de réaction dont la phase est passée est perdu.

### Les garde-fous contre les boucles

- Une bille ne peut pas réagir au déclenchement d'une action qu'elle produit elle-même (« à chaque polissage : Polissage 1 ») : une telle bille ne peut pas exister. Un statut non plus.
- Un statut ne réagit jamais à sa propre réception ni à son propre renforcement.
- Une bille ne peut pas s'éjecter elle-même dans sa propre Éjection : une telle bille ne peut pas exister. Une Éjection qui viserait l'emplacement de sa propre bille ne fait rien : elle est déjà en train d'être chassée.
- Une chaîne d'effets qui ne s'arrêterait pas, comme deux billes du pot qui se répondent, est coupée par une limite de sécurité. Le jeu annonce « Enchaînement interrompu. » ; seule cette chaîne est coupée, et le geste ou la résolution reprend ensuite normalement (phases suivantes, retraits, Impact). C'est une anomalie, que les outils de test signalent.
- La limite de lancers par tour empêche les boucles pilotées par le joueur.

## 10. Les valeurs de partie

Les valeurs de partie sont des compteurs tenus pendant la partie. Les montants calculés peuvent les lire, et les réactions en poche les écouter. Chaque compteur a deux portées :

- **ce tour**, qui revient à zéro au début de chaque tour, avant sa pioche ;
- **cette partie**, qui ne revient jamais à zéro.

### Les catégories

- **Les déclenchements de mots-clés** : Éveil, Chiquenaude, Tic, Trouvaille, Éjection, Final, Chute, pointe, base, base droite, base gauche, et les effets En poche (entrée, résolution, réactions).
- **Les actions** : pour chaque mot-clé d'action, ses déclenchements, et sa quantité réelle (billes piochées, usure rendue ou ajoutée, billes déplacées au pot, billes chassées, billes défaussées, renvoyées en main, ramassées).
- **Vitesse et Masse** : les gains et les pertes, en nombre et en total.
- **Les évènements** : billes lancées, tiquées, éjectées, mélanges, billes piochées, usées, sorties du triangle, mises en poche, perdues, défaussées (toute arrivée à la défausse, d'où qu'elle vienne) ; statuts reçus, renforcés, charges de statut utilisées, statuts terminés.

### Les règles de comptage

- Un compteur augmente au moment de son évènement, avant que les billes n'y réagissent. Une Chiquenaude qui compte les chiquenaudes de ce tour se compte elle-même : la première du tour lit 1.
- Un mot-clé ne compte que chez une bille qui en a l'effet, ou qui a reçu un bonus pour cette phase. Un effet dont la condition est fausse compte quand même. Une phase sautée ne compte pas.
- Un mot-clé et l'évènement auquel il réagit sont deux compteurs : une pose qui remplace une bille sans Éjection compte une bille éjectée, et aucune Éjection.
- Une action compte un déclenchement par application, cible vide comprise. Sa quantité réelle compte ce qui s'est vraiment appliqué, après plancher ou plafond.
- Les billes éjectées comptent celles d'un remplacement et celles d'un effet Éjecter.

## 11. La prévision

La prévision dit ce que le tour produirait, sans rien changer à la partie. Elle s'entend de deux façons :

- **la vue d'ensemble**, touche R : la Vitesse, la Masse et l'Impact prévus, puis ce que chaque emplacement et chaque bille du pot produiraient ;
- **la confirmation d'une pose** : ce que la bille posée produirait, sa Chiquenaude, l'Éjection et le Tic éventuels, et les réactions du pot.

Elle joue les vraies règles sur une copie de la partie, sans jamais révéler l'ordre du sac : une bille qui serait piochée y reste inconnue. Elle montre aussi les régénérations du sac et leurs Trouvailles, les Finals, les billes qui seraient chassées ou mises en poche, les cibles vides, et les billes retirées avant leur phase.

Elle a deux exceptions :

- **le choix** : la prévision ne devine pas le choix du joueur. L'effet concerné se dit « selon votre choix », et ce qui en dépend n'est pas calculé ;
- **l'Éveil** : la bille piochée étant inconnue, son Éveil ne se prévoit jamais. Quand un Éveil est possible, la prévision finit par « Éveils possibles. ».

De même, une bille piochée puis aussitôt empochée reste inconnue dans la prévision. En dehors de ces cas, la prévision donne exactement le résultat réel.

## 12. Les statuts

Un **statut** est un effet durable que reçoit la partie, donné par une bille (le mot-clé d'action Appliquer un statut). La partie le porte : il reste quand la bille qui l'a donné quitte le triangle.

### Ce qu'un statut peut faire

- **Changer une caractéristique** (section 4) : les lancers par tour, la taille de la main, la capacité du pot, d'un nombre par intensité. Planchers : une main d'au moins une bille, des lancers et un pot jamais négatifs. Un lancer de plus reçu pendant la phase de jeu s'ajoute aussitôt aux lancers restants. Une zone au-delà de sa capacité (le pot, quand le statut qui l'agrandissait prend fin) garde ses billes : elle compte comme pleine, et rien n'en sort.
- **Modifier une valeur** : les gains de Vitesse, les pertes de Vitesse, les gains de Masse, les pertes de Masse, et l'Impact du tour.
  - Un gain ou une perte se reconnaît au signe de la Vitesse ou de la Masse qu'un effet applique, bonus reçu compris, avant toute modification.
  - Le statut agit sur la grandeur (une perte de 3 est une grandeur 3), qui ne descend jamais sous 0 : une perte réduite reste une perte, ou devient nulle, jamais un gain. « Amorti : pertes de Vitesse, −1 » fait d'une Vitesse −3 une Vitesse −2.
  - L'Impact se modifie après son calcul habituel (Vitesse × Masse et leurs planchers), puis ne descend jamais sous 0.
  - Plusieurs statuts sur la même valeur : d'abord toutes les additions, puis toutes les multiplications, chacune dans l'ordre où les statuts ont été reçus ; le plancher à la fin.
  - L'effet et l'Impact se disent avec leur valeur finale, partout : la séquence, R, la confirmation.
- **Modifier une quantité** : le nombre de billes de la pioche du début de tour, le N des Pioches d'un effet, le N d'un Polissage, le N d'une Fêlure, et l'usure qu'une bille prend à sa phase (1 d'habitude).
  - Le même ordre que pour les valeurs : additions, puis multiplications, dans l'ordre où les statuts ont été reçus, plancher 0 à la fin. Une quantité ne devient jamais négative : un Polissage réduit ne devient jamais une Fêlure, ni l'inverse.
  - La pioche du début de tour (celle du premier tour comme des suivants) et la Pioche d'un effet sont deux quantités séparées : un statut sur l'une ne touche pas l'autre. Les Pioches d'un effet se modifient ensemble, une fois par effet ; un effet sans Pioche n'a rien à modifier.
  - Un Polissage ou une Fêlure se modifie une fois par clause, quand l'effet joue ; la quantité finale vaut pour chacune de ses cibles. Une charge sert donc à toute la clause, et se consomme même si la cible se révèle vide.
  - Les limites habituelles viennent APRÈS : la main pleine et le sac vide arrêtent la pioche, l'usure ne descend pas sous 0 ni ne dépasse son maximum. Les quantités réelles des valeurs de partie comptent ce qui s'est vraiment passé.
  - Une quantité ramenée à 0 ne fait rien : l'action ne se joue pas, ne se dit pas, et ne compte pas comme un déclenchement de son mot-clé. Une usure de phase ramenée à 0 : la bille joue sa phase sans s'user.
  - Une usure de phase augmentée peut amener la bille à son maximum (jamais au-delà) : elle part à l'étape des retraits. Une Fêlure augmentée qui l'y amène la retire aussitôt.
  - L'effet se dit avec ses quantités finales : « Polissage 2 à la pointe » pour un Polissage 1, sous un statut qui ajoute 1 aux Polissages. La fiche d'une bille garde son effet imprimé.
- **Réagir à ce qui se passe**, comme une bille du pot (section 9) : « Ferveur : à chaque chiquenaude, Vitesse +2 ». La réaction se dit avec le nom du statut : « Ferveur : Vitesse +2. ». Elle ne vise jamais « cette bille » ni un emplacement relatif : un statut n'a pas de bille.

### Les points d'interception

Tous les endroits où un statut peut modifier une valeur, dans l'ordre où ils se déclarent :

| Point | La valeur modifiée | Quand |
|---|---|---|
| gains de Vitesse | une Vitesse positive qu'un effet applique, sur sa grandeur | quand l'effet joue, bonus reçu compris |
| pertes de Vitesse | une Vitesse négative qu'un effet applique, sur sa grandeur | quand l'effet joue, bonus reçu compris |
| gains de Masse | une Masse positive qu'un effet applique | quand l'effet joue |
| pertes de Masse | une Masse négative qu'un effet applique | quand l'effet joue |
| Impact | l'Impact du tour | après son calcul habituel |
| pioche du début de tour | le nombre de billes à piocher au début du tour | avant de piocher |
| Pioches par effet | le total des Pioches d'un effet | quand l'effet joue, avant de piocher |
| Polissages | le N d'une clause Polissage | quand l'effet joue, avant le plancher d'usure |
| Fêlures | le N d'une clause Fêlure | quand l'effet joue, avant le plafond d'usure |
| usure de phase | l'usure prise par une bille à sa phase | après son effet de phase, avant le plafond |

Tous ont un plancher de 0. Empocher, Éjecter, Défausser, Rebond et Ramasser n'en ont pas.

Un statut ne compte, pour une charge comme pour ce qui se dit, que s'il change vraiment la valeur, plancher compris : un doublement d'une perte déjà ramenée à 0 ne change rien, et ne consomme aucune charge.

### L'intensité et le cumul

- **L'intensité** multiplie ce qu'un statut ajoute (une caractéristique, une addition) : un amorti d'intensité 2 réduit les pertes de 2. Une multiplication s'applique autant de fois que l'intensité : ×2 à l'intensité 2 fait ×4. Une réaction n'est pas modulée.
- **Le même statut appliqué de nouveau** ne fait jamais deux exemplaires. Selon son cumul :
  - **en intensité** : l'intensité s'ajoute, et la durée la plus longue des deux reste ;
  - **en durée** : la durée s'ajoute (tours ou charges), l'intensité la plus forte reste ;
  - **unique** : sans effet, « Statut déjà actif, sans effet : ferveur. ».
- Un renforcement se dit : « Statut renforcé : amorti, intensité 2, 3 tours. ». L'intensité ne se dit que pour un statut qui se cumule en intensité, et seulement au-delà de 1.
- Un statut « le prochain tour » reçu de nouveau : encore en attente, il se renforce et attend toujours ; déjà en vigueur, il se renforce aussitôt et dure aussi le prochain tour.

### La durée

- **Ce tour** : il prend fin à la fin du tour.
- **N tours** : le tour en cours compte pour un ; reçu pendant la résolution aussi.
- **Le prochain tour** : en attente jusqu'au début du tour suivant, où il s'active, en silence, avant la pioche. En attente, il n'agit pas et ne réagit pas.
- **Toute la partie** : il ne prend jamais fin.
- **N charges** : une charge se consomme chaque fois qu'un de ses modificateurs change vraiment une valeur ; à sa dernière charge, il prend fin aussitôt : « Coup de fouet : une charge utilisée. Fin du statut : coup de fouet. ».
- Les fins de tour se disent après la rotation, dans l'ordre où les statuts ont été reçus : « Fin du statut : amorti. ». Jamais au dernier tour : la partie s'arrête là.

### Les réactions des statuts

- L'ordre est la règle unique des réactions (section 9, « Les réactions en poche ») : l'évènement se produit, il est compté, la bille concernée joue son propre effet (l'Éveil après sa pioche, le Final ou l'Éjection après son départ), puis les billes du pot réagissent, dans l'ordre d'arrivée, puis les statuts, dans l'ordre où ils ont été reçus.
- Un statut ne réagit jamais à sa propre réception ni à son renforcement ; il réagit aux occurrences suivantes, tant qu'il est en vigueur.

### Les consulter

- **A** : « 2 statuts : amorti, intensité 2, 3 tours. Lancer supplémentaire, à partir du prochain tour. », ou « Aucun statut. ».
- **Maj+A** : le menu des statuts, de gauche à droite, puis « Retour » (sans statut, « Aucun statut. » avant « Retour ») ; Échap ferme. Chaque entrée dit le nom, l'intensité s'il le faut et ce qui reste ; Ctrl+bas parcourt sa fiche : son effet, ce qui lui reste, son origine (« Obtenu par : Tic d'argile. ») ; E dit sa description.
- Sur une bille, sa fiche dit le statut qu'elle donne et sa durée ; E décrit, après ses mots-clés, chaque statut qu'elle peut donner.
- La prévision (R, la confirmation d'une pose) compte les statuts et leurs charges, sur une copie : rien n'est consommé avant le vrai coup. R dit les réactions des statuts pendant la résolution ; la confirmation a une ligne des statuts dès que la partie en a.
- **S** dit la pioche du prochain début de tour, statuts compris, sans rien consommer.

### Les statuts de test

Cette liste est générée à partir de la table des statuts ; elle ne se modifie pas à la main.

<!-- statuts de test : début -->

- **Lancer supplémentaire** : lancers +1 par intensité, le prochain tour. Se cumule en intensité.
- **Poche profonde** : capacité du pot +1 par intensité, toute la partie. Se cumule en intensité.
- **Coup de fouet** : le prochain gain de Vitesse est doublé. Une charge ; chaque nouvelle application en ajoute une.
- **Amorti** : les pertes de Vitesse sont réduites de 1 par intensité, sans jamais devenir un gain. 3 tours ; se cumule en intensité.
- **Ferveur** : à chaque chiquenaude : Vitesse +2. 2 tours ; unique.
- **Coup double** : l'Impact du tour est doublé. Ce tour ; unique.
- **Fatigue** : lancers −1 par intensité, le prochain tour. Se cumule en intensité.
- **Main vive** : pioche du début de tour +1 par intensité. 2 tours ; se cumule en intensité.
- **Inspiration** : la prochaine Pioche d'un effet pioche une bille de plus. Une charge ; chaque nouvelle application en ajoute une.
- **Lustre** : Polissages +1 par intensité, toute la partie. Se cumule en intensité.
- **Fragilité** : Fêlures +1 par intensité. 3 tours ; se cumule en intensité.
- **Répit** : les billes jouent leur phase sans s'user. Ce tour ; unique.
- **Usure accélérée** : usure de phase +1 par intensité, le prochain tour. Se cumule en intensité.

<!-- statuts de test : fin -->

## Annexe : les billes de test

Cette annexe est générée à partir de la table des billes ; elle ne se modifie pas à la main.

<!-- annexe des billes : début -->

### argile

argile, normale, usure 3.

- Pointe : Vitesse +6 si le triangle est plein.
- Base : Vitesse +2 à la bille de l'emplacement suivant.
- Chiquenaude : Vitesse +1 par tour en main, maximum +5.
- Tic : statut lancer supplémentaire, le prochain tour.

### verre

verre, normale, usure 3.

- Pointe : Vitesse +1 par trouvaille cette partie, maximum +10.
- Base : Vitesse +1 par bille en main, maximum +5.
- Tic : Polissage 1, jusqu'à une bille active au choix.

### gorille

gorille, calot, usure 3.

- Pointe : Vitesse +6.
- Base : aucun effet.
- Tic : Vitesse +4 si la bille éjectée est plus petite et Empocher une bille de votre main au choix.
- Éjection : Éjecter la bille de l'emplacement suivant.

### agate

agate, normale, usure 3.

- Pointe : Masse +1 et Masse +2 si la base gauche est un calot.
- Base : Masse +1.
- Tic : statut inspiration, 1 charge.
- Trouvaille : statut lustre, toute la partie.
- Final : statut poche profonde, toute la partie et Empocher cette bille.
- En poche, à chaque résolution : Masse +2 si le pot est plein.

### œil-de-chat

œil-de-chat, normale, usure 3.

- Pointe : Vitesse +3.
- Base droite : Masse +1. Base gauche : Vitesse +3.
- Tic : Pioche 1 si la main est vide.
- Éjection : Ramasser jusqu'à une bille de la défausse au choix.

### porcelaine

porcelaine, minibille, usure 2.

- Pointe : Vitesse +5 et Vitesse +2 à la bille de l'emplacement suivant.
- Base : Vitesse +2.
- Chiquenaude : Masse +1 à la bille de l'emplacement précédent.
- Final : Vitesse +4 et Polissage 1, jusqu'à 2 billes actives au choix.
- Chute : statut fragilité, 3 tours.
- En poche, à l'entrée : Vitesse +10.

### plombée

plombée, calot, usure 3.

- Pointe : Vitesse −3.
- Base : statut usure accélérée, le prochain tour.
- Chiquenaude : Éjecter la bille en pointe.
- Éjection : statut coup de fouet, 1 charge.

### mica

mica, minibille, usure 3.

- Pointe : Vitesse +2 et Polissage 1 à la bille de l'emplacement suivant.
- Base : Pioche 1.
- Éveil : Pioche 1.
- Éjection : Pioche 1 si la bille posée est plus grosse.
- Final : Rebond de cette bille.
- En poche, à chaque mélange : statut ferveur, 2 tours.

### sulfure

sulfure, calot, usure 3.

- Pointe : Masse +3 et Rebond de la bille en base droite.
- Base : Empocher la bille en pointe.
- Trouvaille : Fêlure 1 à la base droite.
- En poche, à chaque résolution : Vitesse +2 par minibille active.

### grès

grès, normale, usure 3.

- Pointe : aucun effet.
- Base : Vitesse +1 par minibille active.
- Tic : Défausser jusqu'à une bille de votre main au choix.
- Éjection : statut main vive, 2 tours.
- En poche, à chaque bille éjectée : Masse +1.

### tigrée

tigrée, normale, usure 4.

- Pointe : Vitesse −1.
- Base : Éjecter une bille active au choix.
- Éveil : statut répit, ce tour.
- Trouvaille : Vitesse +3.
- Final : statut amorti, 3 tours.
- En poche, à chaque chiquenaude : Vitesse +2.

### géante

géante, calot, usure 1.

- Pointe : Vitesse +6.
- Base : Vitesse +6.
- Éveil : Polissage 1 à la pointe.
- Final : Pioche 1 et statut coup double, ce tour.

### loupe

loupe, minibille, usure 3.

- Pointe : Vitesse +2 et Défausser la prochaine bille du sac.
- Base droite : Vitesse +1. Base gauche : Vitesse +4 à la pointe si son effet de pointe donne au moins Vitesse +1.
- Chiquenaude : Vitesse +2 par chiquenaude ce tour, maximum +6.
- Éjection : statut fatigue, le prochain tour.

<!-- annexe des billes : fin -->
