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
2. sinon, si le sac a une bille, on la pioche, puis son Éveil joue, avec tout ce qu'il déclenche, avant la bille suivante ;
3. sinon, si la défausse n'est pas vide, elle est mélangée et devient le sac (la régénération), puis la Trouvaille de chaque bille active joue, puis les billes du pot qui réagissent au mélange, et la pioche reprend du début ;
4. sinon, le sac et la défausse sont vides : il n'y a plus rien à piocher.

Le premier arrêt interrompt la pioche : les billes restantes ne sont pas piochées.

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

Un effet peut en déclencher d'autres. Ils se jouent dans l'ordre où ils surviennent, l'un après l'autre. Quelques exceptions se règlent jusqu'au bout tout de suite, avant la suite : l'Éveil d'une bille piochée, avant la bille suivante ; les Trouvailles d'une régénération, puis les réactions du pot à ce mélange, avant que la pioche ne reprenne ; l'Éjection et le Final d'une bille en partance, avant son arrivée ; et l'arrivée d'une bille à la défausse ou au pot.

Quand plusieurs billes réagissent au même évènement, l'ordre est fixe : l'ordre horaire (base droite, base gauche, pointe), puis la main de la première à la dernière.

### Les bonus et la règle des cibles

Une valeur avec une cible donne un bonus à la phase de la bille visée. Le jeu dit le don chez la bille qui le fait (« Vitesse +4 à la pointe »), et le bonus s'ajoute à l'effet de phase de la bille visée, qui le compte dans ses valeurs. Il suit la bille dans un échange, se perd si elle est remplacée, et disparaît à la fin de la résolution.

Une cible n'a de sens que si l'effet visé peut encore se produire :

- un bonus ne vaut que si la phase de la bille visée n'a pas encore eu lieu ce tour ; sinon, ou si l'emplacement est vide, il est perdu. Les phases suivant l'ordre horaire, une base droite peut donner un bonus à la base gauche, jamais l'inverse ;
- une bille ne prévoit jamais de bonus que rien ne pourrait recevoir : pas de bonus dans un Final, ni à chaque résolution du pot, ni depuis la pointe, dont la phase est la dernière ;
- un Polissage, une Fêlure, une Éjection ou une mise en poche peuvent viser un emplacement à tout moment ;
- une bille ne peut agir sur elle-même que là où elle est : pas d'usure sur elle-même hors du triangle, pas d'Éjecter sur elle-même hors du triangle, pas d'Empocher sur elle-même pendant son lancer ni depuis le pot.

### Les conditions

Une clause peut porter une condition, évaluée au moment où l'effet joue ; fausse, la clause ne produit rien. Trois conditions existent :

- **l'effet imprimé d'une autre bille** : la bille d'un emplacement donne au moins une certaine valeur, à cet emplacement. Seul compte ce qui est imprimé sur la bille, jamais un effet déjà modifié ;
- **le calibre relatif**, pendant un remplacement seulement : la bille posée ou la bille chassée est plus petite, ou plus grosse, que l'autre. Quand c'est un effet Éjecter qui chasse, la bille qui éjecte tient le rôle de la bille posée, où qu'elle soit ;
- **le calibre d'un emplacement** : la bille d'un emplacement est d'un calibre donné.

### Les montants calculés

Un montant peut dépendre du moment, par exemple « Vitesse +1 par minibille active ». Il se calcule au déclenchement, avec un plafond éventuel, à partir de :

- **les tours en main** de la bille elle-même ;
- **les billes actives d'un calibre**, la bille elle-même comprise si elle est sur le triangle (en partance ou en cours de lancer, elle ne compte pas) ;
- **une valeur de partie**, ce tour ou cette partie (section 10).

Un montant qui vaut 0 ne produit rien.

### Le choix du joueur

Certains effets laissent le joueur choisir leur cible : une bille de sa main, une ou plusieurs billes actives, une ou plusieurs billes de la défausse (dans l'ordre d'arrivée).

- **Choix obligatoire** : le joueur choisit exactement le nombre demandé, ou moins s'il n'y a pas assez de cibles.
- **Choix « jusqu'à N »** : le joueur peut s'arrêter avant, et même ne rien choisir, en terminant.
- Les choix se font un par un. Une cible déjà choisie n'est plus proposée.
- Seules les cibles valides au moment du choix sont proposées : pour un bonus, seules les billes dont la phase n'a pas eu lieu.
- La sélection s'arrête quand le nombre est atteint, quand le joueur termine, ou quand plus rien n'est proposé.
- L'effet s'applique ensuite à chaque cible, dans l'ordre des choix.
- La question nomme la bille et le moment qui la posent : « Tic de gorille : choisissez une bille de votre main à empocher. », « Final de porcelaine : choisissez jusqu'à 2 billes actives à polir. ».
- Le jeu attend le choix : rien d'autre ne peut se faire tant qu'il n'est pas fait. Pendant la résolution, elle s'arrête sur la question et reprend après le choix.
- Une bille en transit n'est jamais proposée (section 2). Pendant un choix sur le triangle, l'emplacement vers lequel se dirige une bille en cours de lancer l'annonce après son contenu : « Agate, calot, pointe, usure 2 sur 3. En approche : loupe. ». Un emplacement vide l'annonce de même : « Pointe, vide. En approche : loupe. ».
- Dans un choix « jusqu'à N », Échap valide la sélection en cours, comme Terminer. Dans un choix obligatoire, Échap redit la question.

### Les cibles vides

Une action dont la cible est vide ne fait rien, et le journal le dit : un emplacement vide, une main vide, une bille qui n'est plus là, aucune cible à choisir, aucune bille visée. Rien ne s'ouvre quand il n'y a rien à choisir.

### Le pot

- Une bille n'entre au pot que par un effet Empocher, jamais par un geste du joueur.
- Le pot garde ses billes dans l'ordre d'arrivée, au plus 3.
- **Pot plein** : la bille envoyée est perdue pour la partie. Elle n'a pas d'effet d'entrée, ni aucun autre.
- Une bille au pot n'en sort jamais, et ne revient jamais au sac.
- Ses effets En poche jouent : à son entrée, à chaque résolution, et en réaction.
- Une bille empochée pendant la résolution, avant l'étape du pot, y joue son effet à chaque résolution dès ce tour.
- Ses gains de Vitesse et de Masse comptent pour le tour en cours.

### Les réactions en poche

Une bille du pot peut réagir à ce qui se passe pendant la partie : « En poche, à chaque chiquenaude : Vitesse +2 ».

- Elle peut écouter un évènement de la partie (bille lancée, tiquée, éjectée, piochée, usée, sortie du triangle, mise en poche, perdue, mélange du sac), le déclenchement d'un mot-clé chez une bille qui en a l'effet, ou le déclenchement d'une action.
- Elle n'écoute jamais une quantité (comme les points d'usure rendus), ni les gains et pertes de Vitesse et de Masse, ni les réactions elles-mêmes.
- Elle réagit une fois par occurrence : trois billes piochées, trois réactions. Un évènement qui compte pour deux occurrences écoutées donne deux réactions.
- L'ordre : l'évènement se produit, les valeurs de partie sont comptées, la bille concernée joue son propre effet, puis les billes du pot qui écoutent réagissent, dans l'ordre d'arrivée. Pour un mélange du sac, les billes concernées sont les billes actives (leur Trouvaille), et les réactions jouent avant que la pioche ne reprenne.
- Une bille qui entre au pot ne réagit pas à sa propre mise en poche ; elle réagit aux occurrences suivantes. Une bille entrée plus tard ne réagit pas à ce qui l'a précédée.
- Un bonus de réaction dont la phase est passée est perdu.

### Les garde-fous contre les boucles

- Une bille ne peut pas réagir au déclenchement d'une action qu'elle produit elle-même (« à chaque polissage : Polissage 1 ») : une telle bille ne peut pas exister.
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
- **Les évènements** : billes lancées, tiquées, éjectées, mélanges, billes piochées, usées, sorties du triangle, mises en poche, perdues, défaussées (toute arrivée à la défausse, d'où qu'elle vienne).

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

## Annexe : les billes de test

Cette annexe est générée à partir de la table des billes ; elle ne se modifie pas à la main.

<!-- annexe des billes : début -->

### argile

argile, normale, usure 3.

- Pointe : Vitesse +4.
- Base : Vitesse +1.
- Chiquenaude : Vitesse +1 par tour en main, maximum +5.
- Tic : Vitesse +2.

### verre

verre, normale, usure 3.

- Pointe : Vitesse +1 par trouvaille cette partie, maximum +10.
- Base : Masse +1.
- Tic : Polissage 1 à une bille active au choix.

### gorille

gorille, calot, usure 3.

- Pointe : Vitesse +6.
- Base : aucun effet.
- Tic : Vitesse +4 si la bille éjectée est plus petite et Empocher une bille de votre main au choix.
- Éjection : Vitesse +3.

### agate

agate, normale, usure 3.

- Pointe : Masse +1 et Masse +2 si la base gauche est un calot.
- Base : Masse +1.
- Tic : Masse +1.
- Trouvaille : Polissage 1.
- Final : Polissage 1 à la pointe et Empocher cette bille.
- En poche, à chaque résolution : Masse +1.

### œil-de-chat

œil-de-chat, normale, usure 3.

- Pointe : Vitesse +3.
- Base droite : Masse +1. Base gauche : Vitesse +3.
- Tic : Pioche 1.
- Éjection : Ramasser une bille de la défausse au choix.

### porcelaine

porcelaine, minibille, usure 2.

- Pointe : Vitesse +5.
- Base : Vitesse +2.
- Chiquenaude : Masse +1.
- Final : Vitesse +4 et Polissage 1, jusqu'à 2 billes actives au choix.
- Chute : Vitesse +3.
- En poche, à l'entrée : Vitesse +10.

### plombée

plombée, calot, usure 3.

- Pointe : Vitesse −3.
- Base : Masse +2.
- Chiquenaude : Éjecter la bille en pointe.
- Éjection : Masse +1.

### mica

mica, minibille, usure 3.

- Pointe : Vitesse +2 et Polissage 1.
- Base : Pioche 1.
- Éveil : Pioche 1.
- Éjection : Pioche 1 si la bille posée est plus grosse.
- Final : Rebond de cette bille.
- En poche, à chaque mélange : Polissage 1 à la pointe.

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
- Tic : Défausser une bille de votre main au choix.
- Éjection : Pioche 1.
- En poche, à chaque bille éjectée : Masse +1.

### tigrée

tigrée, normale, usure 4.

- Pointe : Vitesse −1.
- Base : Éjecter une bille active au choix.
- Éveil : Vitesse +2.
- Trouvaille : Vitesse +3.
- Final : Masse +1.
- En poche, à chaque chiquenaude : Vitesse +2.

### géante

géante, calot, usure 1.

- Pointe : Vitesse +6.
- Base : Vitesse +6.
- Éveil : Polissage 1 à la pointe.
- Final : Pioche 1 et Éjecter toutes les minibilles actives.

### loupe

loupe, minibille, usure 3.

- Pointe : Vitesse +2 et Défausser la prochaine bille du sac.
- Base droite : Vitesse +1. Base gauche : Vitesse +4 à la pointe si son effet de pointe donne au moins Vitesse +1.
- Chiquenaude : Vitesse +2 par chiquenaude ce tour, maximum +6.
- Éjection : Vitesse +3.

<!-- annexe des billes : fin -->
