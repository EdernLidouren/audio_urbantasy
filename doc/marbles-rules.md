# Règles du jeu des billes

Ce document décrit les règles du jeu des billes telles qu'elles s'appliquent aujourd'hui. Il s'adresse au joueur et au concepteur. Les valeurs citées sont les valeurs actuelles ; les billes de l'annexe sont celles du premier set, dans sa version révisée de novembre 2026, aux valeurs provisoires, appelées à changer.

## 1. Le but du jeu

Le jeu des billes est un jeu de stratégie en solitaire, sans adresse ni adversaire. Le joueur pose des billes sur un triangle à trois emplacements, qui tourne d'un cran à chaque tour. Chaque bille a des effets, qui se déclenchent à des moments précis.

Chaque tour se termine par une résolution, qui produit un Impact ; l'Impact s'ajoute au Score. Le Score final est celui de la fin de partie.

Une partie se joue selon sa **définition** (section 13) : ses valeurs de départ, son sac, son objectif et ses règles. Elle se joue avec un **sac**, comme un deck dans un jeu de cartes, composé selon des règles de construction (section 14). La partie habituelle est une partie libre : marquer le plus de points possible en dix tours, le résultat se jugeant au palier atteint. La partie s'arrête aussi quand il ne reste plus aucune bille à jouer. Un sac vide ou une main vide seuls ne l'arrêtent pas : un tour sans bille à poser se résout à vide, tant qu'une bille reste en jeu.

## 2. Le lexique

### Les zones

- **Le sac** : les billes qui attendent d'être piochées. Le joueur en connaît le contenu, jamais l'ordre.
- **La main** : les billes piochées, prêtes à être lancées.
- **Le triangle** : trois emplacements, la base gauche, la base droite et la pointe. La pointe est en haut, les deux bases en dessous.
- **L'ordre horaire** : le seul ordre des emplacements, base droite, base gauche, pointe, puis de nouveau base droite. Il définit l'emplacement suivant (de la base droite à la base gauche, de la base gauche à la pointe, de la pointe à la base droite) et l'emplacement précédent (le sens inverse). Tout ce qui parcourt le triangle le suit : les phases, les retraits, les billes visées ensemble, les réactions des billes.
- **La défausse** : les billes qui ont quitté le triangle. Quand le sac est vide, la défausse est mélangée et devient le nouveau sac.
- **Le pot** : les billes empochées par un effet. Elles y restent toute la partie et leurs effets En poche y jouent.
- **Les billes perdues** : les billes envoyées au pot alors qu'il était plein. Elles sont perdues pour la partie et n'ont plus aucun effet.

### Les billes et leurs états

- **Dormante** : une bille dans le sac.
- **En main** : une bille piochée. Elle a un compteur de tours en main, qui part de zéro le tour où elle est piochée et gagne un à chaque début de tour suivant.
- **Active** : une bille posée sur un emplacement du triangle. Elle seule a une usure.
- **Morte** : une bille dans la défausse. Elle redevient dormante quand la défausse est mélangée et devient le sac.
- **En poche** : une bille dans le pot.
- **Perdue** : une bille envoyée au pot plein.

Une bille ne garde rien en changeant de zone : en quittant le triangle, elle perd son usure et son bonus ; en quittant la main, elle perd son compteur de tours en main. Seuls ses propres effets de départ (son Final, son Éjection, sa Chute) et le Tic de la bille qui la chasse lisent encore l'usure et les tours passés sur le triangle qu'elle avait en partant.

### Les billes en transit

Une bille **en transit** a quitté une zone sans être encore arrivée dans la suivante. Elle n'appartient à aucune zone : elle n'est ni en main ni active, et elle n'est jamais proposée dans un choix. Le jeu l'annonce seulement, pour information (section 9, « Le choix du joueur »). Seuls ses propres effets, et le Tic de la bille qui la chasse, peuvent changer sa destination.

- **En cours de lancer** : la bille lancée, entre la main et le triangle, pendant sa Chiquenaude et jusqu'à son arrivée sur l'emplacement.
- **En partance** : une bille qui a quitté sa zone et n'est pas encore arrivée à sa destination, le temps de son déclencheur de sortie (son Final, son Éjection ; section 7, « Le chemin d'une bille ») ; chassée par une pose, aussi le temps du Tic de la bille posée, qui joue avant son Éjection. Elle ne compte nulle part pour les conditions et les montants : ni parmi les billes actives, ni en main, ni à la défausse.

### Les calibres

Chaque bille a un calibre, qui ne change jamais :

- la minibille, la plus petite ;
- la bille normale ;
- le calot, le plus gros.

Le calibre se compare : une minibille est plus petite qu'une bille normale, elle-même plus petite qu'un calot. Deux billes de même calibre ne sont ni plus petites ni plus grosses l'une que l'autre. Le calibre règle aussi le son de la bille, sauf pour une bille qui a sa propre voix.

### Les familles et les raretés

Chaque bille appartient à au moins une famille, parfois plusieurs (une bille bicolore), et a exactement une rareté. Ni l'une ni l'autre ne change jamais.

- Les familles : Trésor, Astres, Brume, Bestiaire, Souffle, Classiques. Les Classiques sont une famille comme les autres, sans aucune exception de règle.
- Les raretés, de la plus commune à la plus rare : commune, peu commune, rare, épique, légendaire.

Famille et rareté servent aux effets, comme le calibre : une cible « toutes les billes actives » filtrée (« toutes les billes Brume actives »), une condition sur un emplacement (« si la bille de l'emplacement suivant est de la famille Brume », « si la pointe est une bille rare »), un montant calculé (« Vitesse +2 par Astres active », « Vitesse +2 par famille différente sur le triangle ») et les modificateurs des statuts. Une rareté se compare exactement : « rare » ne vise ni une épique ni une légendaire.

### Consulter une bille

Sur la bille sous le curseur, partout où une bille peut l'être (main, triangle, menus du sac, de la défausse et du pot, choix) :

- l'annonce principale d'une bille hors du triangle dit, après son nom et son calibre, ses familles et sa rareté, puis son usure maximale : « rubis, normale, Trésor, rare, usure 4. » ; plusieurs familles se lient par « et » (« Trésor et Astres »). Sur le triangle, l'annonce reste celle de l'emplacement ;
- **F** dit ses familles, son calibre et sa rareté : « Trésor, normale, rare. » ;
- **V** dit sa description, un texte d'ambiance sans effet de jeu, ou « Aucune description. » ;
- sur un emplacement vide, F et V disent « Aucune bille. ».

La fiche (Ctrl+flèches) reste réservée aux effets.

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
- **Lancers par tour** : 5. Chaque pose depuis la main est un lancer.
- **Capacité du pot** : 3 billes.
- **Pioche du début de tour** : 5 billes au premier tour, 1 à chaque tour suivant.
- **Nombre de tours** : 10.
- **Usure maximale** d'une bille : 3, sauf si la bille en indique une autre.

Ce sont les valeurs de la partie habituelle ; une autre définition de partie peut en donner d'autres (section 13). Les lancers par tour, la taille de la main et la capacité du pot sont des valeurs de départ : des statuts, et les règles d'une partie, peuvent les changer (section 12). Toute règle lit la valeur en vigueur, statuts compris.

## 5. Le déroulé d'un tour

### Début de tour et pioche

1. Chaque bille déjà en main gagne un tour à son compteur de tours en main.
2. La pioche du tour : 5 billes au premier tour, 1 ensuite, une par une, selon la pioche unifiée (section 6).
3. Si, après cette pioche, il ne reste plus aucune bille à jouer (ni en main, ni sur le triangle, ni au sac, ni à la défausse), la partie s'arrête : c'est la **pioche impossible** (section 13), et le tour n'est pas joué. Les billes du pot et les billes perdues ne comptent pas : elles ne se jouent plus.
4. Sinon, si la pioche n'a pu donner aucune bille faute de billes, le jeu le dit, et le tour se joue avec ce qu'on a.

### La phase de jeu

Le joueur fait ensuite, dans l'ordre qu'il veut :

- **des poses**, dans la limite des lancers. Le joueur pose une bille de sa main sur un emplacement, vide ou occupé (section 9 pour l'ordre exact). Rien ne l'oblige à remplir le triangle.
- **la résolution**, à tout moment, quel que soit le triangle, plein, partiel ou vide.

L'**échange** de deux emplacements est retiré du jeu actuel ; le moteur le garde, et une définition de partie peut le permettre (section 13). Il est alors facultatif, une fois par tour, avant toute pose. Il échange le contenu de deux emplacements, usure et bonus compris. Avec un emplacement vide, c'est un déplacement. Échanger deux emplacements vides est refusé. L'échange ne déclenche rien, et n'est pas un lancer. Sans lui, Entrée sur un emplacement du triangle, sans bille prise dans la main, ne fait rien.

Une pose se déroule ainsi :

1. **Chiquenaude** : la bille quitte la main ; si elle a une Chiquenaude, son effet joue. La bille est alors en cours de lancer.
2. Si l'emplacement visé est occupé :
   - la bille qui s'y trouve quitte l'emplacement : elle est en partance ;
   - la bille lancée arrive sur l'emplacement ;
   - **Tic** : l'effet de Tic de la bille lancée joue, s'il existe. La bille chassée est encore en partance : le Tic peut l'envoyer au pot ou en main (« Empocher la bille éjectée », « Faire rebondir la bille éjectée ») ;
   - **Éjection** : l'effet d'Éjection de la bille chassée joue, s'il existe ;
   - elle arrive à la défausse, sauf si son Éjection ou le Tic l'a envoyée ailleurs.
3. Si l'emplacement visé est vide, la bille lancée y arrive, sans Éjection ni Tic.

Si la Chiquenaude a vidé l'emplacement visé, la pose se poursuit comme sur un emplacement vide.

### La résolution

1. **Les phases**, dans l'ordre horaire : base droite, base gauche, pointe. Un emplacement vide saute sa phase. La bille de l'emplacement joue son effet de phase, puis prend 1 d'usure, même si cela l'amène à son maximum. Une bille qui a quitté le triangle avant sa phase la saute.
2. **Le pot** : chaque bille du pot, dans l'ordre d'arrivée, joue ses réactions retenues pendant les phases (voir plus bas), puis son effet En poche à chaque résolution, si elle en a un, avant la bille suivante. Puis les statuts jouent leurs réactions retenues.
3. **Les retraits par usure**, dans l'ordre horaire : chaque bille à son usure maximale quitte son emplacement, son Final joue pendant qu'elle est en partance, puis elle arrive à la défausse (sauf si son Final l'envoie ailleurs), avant la bille suivante.
4. **L'Impact** se calcule et s'ajoute au Score. En partie libre, un palier franchi se dit aussitôt. Puis les **conditions de fin** d'après l'Impact se vérifient (section 13) : cible atteinte, tour d'endurance raté, dernier tour.
5. **La rotation** : chaque bille avance d'un cran vers son emplacement suivant, la base droite vers la base gauche, la base gauche vers la pointe, la pointe vers la base droite. Les emplacements vides tournent aussi. Les bonus disparaissent.
6. Si une condition de fin est atteinte, la partie se termine ; sinon, le tour suivant commence.

Une bille piochée pendant la phase de jeu peut être lancée aussitôt, dans la limite des lancers. Une bille piochée pendant la résolution attend le tour suivant.

## 6. La pioche et le mélange du sac

### La pioche unifiée

Toute pioche, celle du début de tour comme celle d'un effet, se fait bille par bille, ainsi :

1. si la main est pleine, la pioche s'arrête et la bille reste au sac, sans mélange ;
2. sinon, si le sac a une bille, on la pioche, puis son Éveil joue, avec tout ce qu'il déclenche, puis les billes du pot et les statuts qui réagissent à la pioche, avant la bille suivante ;
3. sinon, si la défausse n'est pas vide, elle est mélangée et devient le sac (le mélange), puis la Trouvaille de chaque bille active joue, puis les billes du pot et les statuts qui réagissent au mélange, et la pioche reprend du début ;
4. sinon, le sac et la défausse sont vides : il n'y a plus rien à piocher.

Le premier arrêt interrompt la pioche : les billes restantes ne sont pas piochées.

La pioche du début de tour et un effet Piocher suivent exactement le même ordre. Ce que joue la pioche du début de tour (Éveils, Trouvailles, réactions) compte pour le tour qui commence.

### Le mélange du sac

Un mélange peut avoir lieu à tout moment : en début de tour, pendant la phase de jeu ou pendant la résolution. Les billes du pot et les billes perdues n'y reviennent jamais. Ses Trouvailles et les réactions du pot au mélange comptent pour le tour en cours ; elles jouent toutes juste après le mélange, avant que la pioche ne reprenne.

## 7. L'usure, le polissage, la fêlure et les retraits

### L'usure

Seule une bille active a une usure. Elle arrive sur le triangle à 0. Elle prend 1 d'usure à chaque phase jouée. Son usure maximale est de 3, sauf indication contraire de la bille.

### Le polissage

Polir retire de l'usure, jamais en dessous de 0. Une bille arrivée à son maximum pendant la résolution, puis polie avant les retraits, n'est plus retirée.

### La fêlure

Fêler ajoute de l'usure, jamais au-delà du maximum. Si cela amène la bille à son maximum, la bille est retirée aussitôt, comme par usure : elle quitte le triangle, son Final joue, puis elle arrive à la défausse. Pendant la résolution, sa phase est sautée si elle n'avait pas eu lieu. Pendant la phase de jeu, l'emplacement vidé peut recevoir une pose, sans Tic.

### Les façons de quitter le triangle

- **Par usure** : à l'étape des retraits, ou aussitôt par un effet Fêler. Son Final joue, puis elle arrive à la défausse.
- **Par remplacement** : une pose sur son emplacement. Son Éjection joue, puis elle arrive à la défausse. Pas de Final.
- **Par Éjecter** : un effet la chasse. Son Éjection joue, puis elle arrive à la défausse. Pas de Final, pas de Tic.
- **Par Empocher** : un effet l'envoie au pot. Ni Éjection, ni Final.
- **Par Défausser** : un effet l'envoie à la défausse. Ni Éjection, ni Final ; sa Chute joue à son arrivée.
- **Par un effet Rebondir** : la bille rebondit dans la main. Ni Éjection, ni Final ; main pleine, elle part à la défausse, et sa Chute joue.

Dans tous les cas, elle compte parmi les billes sorties du triangle.

### Le chemin d'une bille

Toute sortie d'une bille de sa zone suit le même chemin, dans cet ordre :

1. **Le départ** : la bille quitte sa zone et devient en partance. Ce départ est acquis : rien ne l'annule.
2. **Le déclencheur de sortie**, s'il y en a un : le Final (une sortie par usure) ou l'Éjection (un remplacement, Éjecter). Il joue entièrement, avec tout ce qu'il déclenche, pendant que la bille est en partance. Pour un remplacement, la bille posée arrive et son Tic joue d'abord, la bille chassée déjà en partance.
3. **La destination** : la défausse, sauf si un effet l'a redirigée pendant qu'elle était en partance : un effet de la bille elle-même, pendant son déclencheur de sortie, ou le Tic de la bille qui la chasse (Empocher : le pot ; Rebondir : la main). Si plusieurs effets la redirigent, le dernier l'emporte : son Éjection, qui joue après le Tic, a le dernier mot. Une action qui déplace une bille (Empocher, Défausser, Rebond, Ramasser) pose elle-même sa destination.
4. **L'arrivée** : la bille entre dans sa destination. À la défausse, sa Chute joue. Au pot, son effet d'entrée joue ; si le pot est plein, elle est perdue, sans effet d'entrée. En main, rien ne se déclenche ; si la main est pleine, elle arrive à la défausse à la place.

Pendant son Final ou son Éjection, une bille ne peut ni se polir ni se fêler : son départ est acquis. Elle n'est pas encore à la défausse : un effet Piocher de son Final qui mélange la défausse ne la remet pas dans le sac, et le Tic qui la chasse ne peut ni la piocher ni la ramasser. Une bille ne passe ainsi qu'une fois d'une zone à l'autre : empochée pendant sa propre Éjection ou son propre Final, elle va au pot sans passer par la défausse.

## 8. Les mots-clés

Les mots-clés se consultent en jeu, sur la bille sous le curseur, avec la touche E (une annonce) ou Maj+E (un menu). Leurs descriptions ci-dessous sont celles du jeu.

Trois sortes de mots, chacune avec sa forme, pour qu'on entende tout de suite si une bille agit ou subit :

- **Un évènement** est un fait, ce qui arrive à une bille ou à la partie. Il se dit au participe pour une bille (« bille éjectée », « bille piochée », « bille empochée ») et par un nom pour la partie (« mélange », « remplacement »). C'est ce que comptent les valeurs de partie (section 10), et ce qu'on écoute avec « à chaque … ».
- **Un déclencheur** est la réaction d'une bille à un évènement qui la concerne. C'est un nom, avec une majuscule : Éveil, Chiquenaude, Tic, Trouvaille, Éjection, Final, Chute, Polissage, Fêlure. Ses déclenchements se comptent par son nom : « à chaque Éjection déclenchée ».
- **Une action** est ce que fait un effet. C'est un verbe : Piocher, Polir, Fêler, Empocher, Éjecter, Défausser, Rebondir, Ramasser, Appliquer un statut. Ses effets se comptent par son nom, « à chaque effet Éjecter », et ce qu'elle déplace par effet, « à chaque bille éjectée par effet ».

Un même radical peut servir aux trois sans confusion : la bille éjectée (l'évènement), son Éjection (le déclencheur), Éjecter (l'action). En anglais, où le nom et le verbe se confondent, un déclencheur qui a la même racine qu'une action prend le participe : Polished, Cracked.

### Les mots-clés de déclenchement

- Pointe : effet joué pendant la phase de pointe, quand la bille est posée en pointe.
  - Moment : pendant la résolution, à la phase de pointe, la dernière.
- Base : effet joué pendant la phase de base, quand la bille est posée en base droite ou en base gauche. Il peut différer selon le côté.
  - Moment : pendant la résolution, à la phase de base droite puis à celle de base gauche.
- Éveil : se déclenche quand la bille est piochée.
  - Moment : juste après la pioche de la bille, avant la bille suivante, à tout moment du tour. La bille est en main, à 0 tour en main. Jamais pour une bille restée au sac faute de place.
- Chiquenaude : se déclenche quand la bille est lancée depuis la main, avant qu'elle n'arrive sur le triangle.
  - Moment : au début de chaque pose, sur un emplacement vide ou occupé. La bille est en cours de lancer.
- Tic : se déclenche quand la bille est posée sur un emplacement occupé : elle frappe la bille qui s'y trouvait, avant que celle-ci ne parte.
  - Moment : pendant une pose sur un emplacement occupé, juste après l'arrivée de la bille sur l'emplacement ; l'occupante l'a quitté, elle est en partance, et son Éjection suivra.
- Trouvaille : se déclenche quand la défausse est mélangée et devient le sac, si la bille est sur le triangle.
  - Moment : juste après chaque mélange du sac, chez chaque bille active, dans l'ordre horaire, avant que la pioche ne reprenne. Une bille en main, au sac, à la défausse ou en cours de lancer n'en a pas.
- Éjection : se déclenche quand la bille est chassée du triangle ; chassée par une pose, après le Tic de la bille posée.
  - Moment : pendant qu'elle est en partance : quand une pose la remplace, après l'arrivée de la bille posée et son Tic ; quand un effet Éjecter la chasse, juste après son départ de l'emplacement. Une bille qui s'éjecte elle-même déclenche aussi son Éjection.
- Final : se déclenche quand la bille est usée et quitte le triangle, avant qu'elle n'arrive à la défausse : si son Final l'empoche, elle va au pot sans passer par la défausse.
  - Moment : à son retrait par usure, à l'étape des retraits ou aussitôt après un effet Fêler. Jamais à un remplacement, à un échange, à une éjection ni à une mise en poche.
- Chute : se déclenche quand la bille arrive à la défausse, d'où qu'elle vienne.
  - Moment : à son arrivée à la défausse, au bout de son chemin : après son Final ou son Éjection s'il y en a un, depuis le triangle, la main ou le sac. Jamais si un effet l'a envoyée ailleurs (au pot). Ses valeurs vont aux compteurs du tour. À la défausse, Empocher sur elle-même l'envoie au pot.
- Polissage : se déclenche quand cette bille, sur le triangle, est polie d'au moins 1 point d'usure.
  - Moment : juste après l'effet Polir qui l'a polie, à tout moment du tour, comme la Trouvaille. Un effet Polir qui ne retire rien (la bille à usure 0) ne le déclenche pas. Le déclencheur est un nom, Polissage ; l'action, un verbe, Polir.
- Fêlure : se déclenche quand une bille active, celle-ci comprise, est fêlée d'au moins 1 point d'usure.
  - Moment : juste après l'effet Fêler, à tout moment du tour. Chaque bille active qui a cet effet réagit, dans l'ordre horaire ; une bille que l'effet Fêler a amenée à son maximum est déjà partie, et ne réagit plus. Le déclencheur est un nom, Fêlure ; l'action, un verbe, Fêler.
- En poche : effets actifs uniquement lorsque la bille est dans le pot : à son entrée, à chaque résolution, ou en réaction à ce qui se passe pendant la partie.
  - Trois moments : à l'entrée au pot, juste après l'arrivée de la bille (jamais si elle est perdue) ; à chaque résolution, à l'étape du pot ; à chaque occurrence d'un évènement de la partie, une réaction (section 9).

### Les mots-clés d'action

- Piocher : pioche des billes du sac. Si le sac est vide, la défausse est mélangée et devient le sac.
  - Pioche selon la pioche unifiée, à tout moment du tour. Jamais de cible.
- Polir : retire de l'usure à une bille, qui reste ainsi plus longtemps sur le triangle.
  - Cible : la bille elle-même, un emplacement, ou des billes actives au choix. Se dit « Polir de 1 cette bille », « Polir de 1 la bille de l'emplacement suivant ».
- Fêler : ajoute de l'usure à une bille. Si elle atteint son maximum, la bille est usée et quitte aussitôt le triangle.
  - Cible : la bille elle-même, un emplacement, ou des billes actives au choix. Se dit « Fêler de 1 la bille en pointe ».
- Empocher : envoie une bille au pot, où qu'elle soit : sur le triangle, en main, dans la défausse ou, pendant un Tic, la bille qu'il vient de chasser. Si le pot est plein, la bille est perdue pour la partie.
  - Cible : la bille elle-même, où qu'elle soit (sauf en cours de lancer et dans le pot ; en partance, pendant son Final ou son Éjection, elle est redirigée vers le pot) ; un emplacement ; la première bille de la main ; une bille au choix, de la main ou du triangle ; dans un Tic seulement, la bille éjectée, en partance, redirigée vers le pot.
- Éjecter : chasse une bille du triangle : son effet d'éjection se déclenche, puis elle part à la défausse.
  - Cible : la bille elle-même, seulement si elle est sur le triangle, jamais dans son Final ni dans sa propre Éjection, où elle est en partance ; un emplacement ; des billes actives au choix ; ou toutes les billes actives, éventuellement d'un seul calibre, d'une seule famille ou d'une seule rareté (« toutes les minibilles actives », « toutes les billes Brume actives »).
  - « Toutes les billes actives » comprend la bille qui éjecte, si elle est sur le triangle et passe le filtre. De même, un choix parmi les billes actives peut porter sur la bille qui le pose.
- Défausser : envoie une bille à la défausse.
  - Cible : la bille elle-même, sur le triangle ou en main (à son Éveil), jamais en cours de lancer, en partance, à la défausse ni dans le pot ; un emplacement ; la première bille de la main ; une ou plusieurs billes de la main ou du triangle au choix ; toutes les billes actives, éventuellement d'un seul calibre, d'une seule famille ou d'une seule rareté ; les N prochaines billes du sac, sans les révéler avant.
  - La bille suit son chemin jusqu'à la défausse, où sa Chute joue. Depuis le triangle, ce n'est ni une usure ni une éjection : ni Final ni Éjection ; elle compte parmi les billes sorties du triangle, et sa phase est sautée si elle n'avait pas eu lieu.
  - Depuis le sac : les billes partent du haut, une par une. Un sac qui en a moins donne ce qu'il a, sans mélanger la défausse ; un sac vide ne donne rien.
- Rebondir : fait rebondir dans la main une bille du triangle ou, pendant un Tic, la bille qu'il vient de chasser. Si la main est pleine, elle part à la défausse.
  - Se dit « Faire rebondir … » : « Faire rebondir la bille éjectée », « Faire rebondir cette bille ».
  - Cible : la bille elle-même, sur le triangle, ou en partance pendant son Final ou son Éjection (elle est alors redirigée vers la main) ; un emplacement ; des billes actives au choix ; toutes les billes actives, éventuellement d'un seul calibre, d'une seule famille ou d'une seule rareté ; dans un Tic seulement, la bille éjectée, en partance, redirigée vers la main.
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
3. Occupé : l'occupante quitte l'emplacement, en partance.
4. La bille lancée arrive sur l'emplacement.
5. Si l'emplacement était occupé : son Tic joue, avec tout ce qu'il déclenche ; puis l'Éjection de l'occupante, avec tout ce qu'elle déclenche ; puis l'occupante arrive à sa destination, la défausse sauf redirection.

Pendant le Tic, l'occupante n'est nulle part : ni sur le triangle ni à la défausse. Un Tic qui pioche ou qui ramasse ne la trouve donc pas, mais il peut l'empocher ou la renvoyer en main. Pendant son Éjection, la bille posée est déjà sur l'emplacement : une Éjection qui vise des billes actives peut la viser, et un ricochet qui fait le tour du triangle peut la chasser à son tour.

### L'ordre exact d'une résolution

1. Phase de base droite, puis de base gauche, puis de pointe : pour chacune, l'effet, puis 1 d'usure. Pendant les phases, les billes du pot et les statuts ne réagissent pas encore : leurs réactions sont comptées et retenues jusqu'à l'étape du pot. Le triangle joue donc toujours en entier, sans qu'une bille du pot ne s'intercale entre deux phases.
2. L'étape du pot, dans l'ordre d'arrivée, bille par bille : ses réactions retenues, puis son effet à chaque résolution. Puis les réactions retenues des statuts.
3. Les retraits par usure, dans l'ordre horaire : pour chaque bille, son départ, son Final, puis son arrivée.
4. L'Impact.
5. La rotation, puis la fin du tour.

### L'ordre des clauses d'un effet

Un effet peut faire plusieurs choses : « Piocher 1 et Éjecter toutes les minibilles actives ». Ses clauses s'appliquent dans l'ordre où elles sont écrites : ici, la pioche, puis l'éjection. Seules deux précisions : les valeurs (Vitesse, Masse, Piocher) d'un même effet s'additionnent et se disent ensemble, avant les actions sur une bille ; et un bonus au choix se choisit avant que l'effet ne se dise.

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
- **La règle des cibles s'applique comme d'habitude** : un bonus de Vitesse ou de Masse dont la phase visée est passée est perdu, et le journal le note (depuis la pointe, l'emplacement suivant est la base droite, déjà résolue) ; Polir, Fêler, Empocher, Éjecter, Défausser et Rebondir restent valides. Un emplacement visé vide : sans effet, noté.
- **En chaîne** : une Éjection qui éjecte la bille de l'emplacement suivant fait ricocher l'éjection d'emplacement en emplacement ; chaque bille suit son chemin, et le ricochet s'arrête sur un emplacement déjà vidé.

### Les conditions

Une clause peut porter une condition, évaluée au moment où l'effet joue ; fausse, la clause ne produit rien, ou joue son remplacement si elle en a un (« sinon », plus bas). Les sortes de conditions :

- **l'effet imprimé d'une autre bille** : la bille d'un emplacement donne au moins une certaine valeur, à cet emplacement. Seul compte ce qui est imprimé sur la bille, jamais un effet déjà modifié. Dans un Tic, la bille lue peut être la bille éjectée, à l'emplacement qu'elle vient de quitter : « Tic : … si l'effet de la bille éjectée donne au moins Masse +1 » ;
- **le calibre relatif**, pendant un remplacement seulement : la bille posée ou la bille chassée est plus petite, ou plus grosse, que l'autre. Quand c'est un effet Éjecter qui chasse, la bille qui éjecte tient le rôle de la bille posée, où qu'elle soit ;
- **le calibre d'un emplacement** : la bille d'un emplacement est d'un calibre donné. L'emplacement peut être relatif : « si la bille de l'emplacement suivant est un calot » ;
- **la famille d'un emplacement** : la bille d'un emplacement est d'une famille donnée, parmi d'autres peut-être. L'emplacement peut être relatif : « si la bille de l'emplacement suivant est de la famille Brume » ;
- **la rareté d'un emplacement** : la bille d'un emplacement est d'une rareté donnée, exactement. L'emplacement peut être relatif : « si la pointe est une bille rare » ;
- **une bille précise sur un emplacement** : la bille d'un emplacement est une bille donnée. L'emplacement peut être relatif : « si la bille de l'emplacement précédent est une abeille » ;
- **un emplacement vide ou occupé**, fixe ou relatif : « si l'emplacement suivant est vide ». Un emplacement relatif sans référence n'est ni vide ni occupé : la condition est fausse ;
- **le calibre d'une bille d'un remplacement**, pendant un remplacement seulement : la bille éjectée, ou celle qui l'éjecte (la bille posée, ou la bille d'un effet Éjecter), est d'un calibre donné. « Tic : Vitesse +4 si la bille éjectée est une minibille. », « Éjection : Empocher cette bille si la bille qui l'éjecte est un calot. » ;
- **un nombre comparé à une borne**, au moins ou au plus : le nombre de billes d'une zone, filtré ou non, le nombre de familles différentes sur le triangle, une valeur de partie, les tours en main de la bille, les mêmes nombres que les montants calculés (plus bas). « si vous avez au plus 3 billes en main », « si le pot compte au moins 3 abeilles », « si cette partie compte au moins 2 éveils » ;
- **la Vitesse ou la Masse du tour**, comparée à une borne, telle qu'elle est quand l'effet joue, avant ce qu'il produit : « si la Vitesse est d'au moins 10 », « si la Masse est d'au plus 1 » ;
- **l'état d'une zone de la partie** : le triangle est plein, vide, ou n'a qu'une bille ; la main est vide, ou pleine ; le sac est vide ; la défausse est vide ; le pot est plein, ou vide. « Pleine » et « plein » se comparent aux caractéristiques en vigueur : la taille de la main, la capacité du pot. Une bille en transit (en cours de lancer, en partance) n'est dans aucune zone et ne compte nulle part : pendant sa Chiquenaude, la bille lancée n'est plus en main ; pendant son Éjection, la bille chassée n'est plus sur le triangle. « Pointe : Vitesse +6 si le triangle est plein. », « Tic : Pioche 1 si la main est vide. », « En poche, à chaque résolution : Masse +2 si le pot est plein. ».

Les conditions sur la bille d'un emplacement (son calibre, sa famille, sa rareté, une bille précise) et le calibre d'une bille d'un remplacement peuvent se **nier** : « si la bille de l'emplacement suivant n'est pas de la famille Bestiaire ». Un emplacement vide n'a ni calibre, ni famille, ni rareté : la condition niée y est vraie.

**Sinon** : une clause qui porte une condition peut porter un remplacement, joué à sa place quand la condition est fausse : « Base : Vitesse +3 si le triangle compte au moins 1 calot, sinon Vitesse +1. ». Le remplacement peut avoir lui-même sa condition et son remplacement, une chaîne : seule la première clause dont la condition est vraie, ou la dernière, sans condition, joue. « Tic : Vitesse +3 si la bille éjectée est un calot, sinon Vitesse +2 si la bille éjectée est une bille normale, sinon Vitesse +1. ». Les deux branches peuvent faire des choses différentes : « Trouvaille : Empocher la bille de l'emplacement suivant si l'emplacement suivant est occupé, sinon Empocher cette bille. ».

### Les montants calculés

Un montant peut dépendre du moment, par exemple « Vitesse +1 par minibille active ». Il se calcule au déclenchement, avec un plafond éventuel, à partir de :

- **les tours en main** de la bille elle-même ;
- **les tours passés sur le triangle** par la bille elle-même : une phase jouée, un tour. Partie du triangle, ceux qu'elle avait en partant. « Final : Vitesse +2 par tour passé sur le triangle, maximum +10. » ;
- **l'usure** de la bille elle-même, ou de la bille éjectée pendant un remplacement, ou ce qui leur reste avant leur maximum. Partie du triangle, l'usure qu'elle avait en partant ; jamais posée, 0. « Chute : Vitesse +5, −1 par point d'usure de cette bille. » ;
- **la Vitesse ou la Masse du tour**, quand l'effet joue, avant ce qu'il produit ; négative, elle compte pour 0. « Tic : Vitesse égale à la Vitesse du tour, maximum +8. » ;
- **ce que donne la bille de l'autre base**, dans un effet de base seulement : son effet de base, joué comme s'il jouait à ce moment, conditions comprises, sans bonus reçu ni statut, un malus compris. L'autre base vide : 0. Deux billes qui se copieraient l'une l'autre ne copient rien. « Base : Vitesse égale à la Vitesse que donne la bille de l'autre base. » ;
- **une valeur de partie**, ce tour ou cette partie (section 10) ;
- **le nombre de billes d'une zone** : actives, en main, dans le sac, à la défausse, dans le pot, perdues ; toutes, ou seulement celles d'un calibre, d'une famille, d'une rareté, ou une bille précise (« par minibille active », « par Brume à la défausse », « par bille rare en main », « par abeille dans le pot ») ; d'une zone, ou de plusieurs ensemble (« par bille normale en main et sur le triangle »). Une bille active compte, la bille elle-même comprise si elle est sur le triangle ; une bille en transit ne compte nulle part. La fiche dit la valeur actuelle : « Base : Vitesse +1 par bille en main, maximum +5, actuellement +3. » ;
- **le nombre de familles différentes** parmi les billes actives, ou parmi celles de plusieurs zones ensemble : chaque famille compte une fois, Classiques comprises ; une bille à plusieurs familles compte pour chacune ; une bille en transit ne compte pas. « Pointe : Vitesse +2 par famille différente sur le triangle, maximum +6. », « par famille différente sur le triangle et en main ».

Un montant peut aussi diminuer avec ce qu'il compte, pour la Vitesse et la Masse seulement : « Vitesse +5, −1 par point d'usure de cette bille ».

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
- Dans un choix facultatif, le menu propose « Ne rien choisir » tant que rien n'est choisi, puis « Terminer » ; sur le triangle, Maj+Entrée fait de même. Échap valide la sélection en cours ; sans aucune cible choisie, l'action est ignorée. Dans un choix obligatoire, ni « Ne rien choisir » ni « Terminer » : Échap redit la question.

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
- Elle écoute aussi une quantité qui compte des billes, une réaction par bille, pour réagir à chaque bille plutôt qu'à chaque action : « à chaque bille renvoyée par effet », « à chaque bille éjectée par effet », « à chaque bille piochée par effet ». Elle n'écoute jamais une quantité de points (l'usure retirée ou ajoutée), ni les gains et pertes de Vitesse et de Masse, ni les réactions elles-mêmes.
- Elle réagit une fois par occurrence : trois billes piochées, trois réactions. Un évènement qui compte pour deux occurrences écoutées donne deux réactions.
- **L'ordre, une seule règle** : l'évènement se produit et les valeurs de partie sont comptées ; la bille concernée joue d'abord son propre effet (l'Éveil après sa pioche, le Final ou l'Éjection après son départ du triangle, les Trouvailles des billes actives après un mélange) ; puis les billes du pot réagissent, dans l'ordre d'arrivée ; puis les statuts, dans l'ordre où ils ont été reçus (section 12). Le même ordre partout : pour la pioche du début de tour comme pour un effet Piocher, pour un retrait à l'étape des retraits comme pour un retrait par un effet Fêler. Une bille perdue au pot plein suit cet ordre comme toute arrivée. Après un mélange, les réactions jouent avant que la pioche ne reprenne.
- **Une seule exception, les phases de la résolution** : ce qu'elles font réagir (une phase de base, un effet Polir, une pioche…) attend la fin de la phase de pointe. À l'étape du pot, chaque bille joue ses réactions retenues, puis son effet à chaque résolution, avant la bille suivante ; puis les statuts jouent les leurs. Une abeille au pot ne se fait donc entendre qu'après la pointe, deux fois si les deux bases ont joué.
- Une bille qui entre au pot ne réagit pas à sa propre mise en poche ; elle réagit aux occurrences suivantes. Une bille entrée plus tard ne réagit pas à ce qui l'a précédée.
- Un bonus de réaction dont la phase est passée est perdu : c'est toujours le cas d'une réaction retenue pendant les phases.

### Les garde-fous contre les boucles

- Une bille ne peut pas réagir au déclenchement d'une action qu'elle produit elle-même (« à chaque effet Polir : Polir de 1 cette bille ») : une telle bille ne peut pas exister. Un statut non plus.
- Un statut ne réagit jamais à sa propre réception ni à son propre renforcement.
- Une bille ne peut pas s'éjecter elle-même dans sa propre Éjection : une telle bille ne peut pas exister. Une Éjection qui viserait l'emplacement de sa propre bille ne l'y trouve jamais, puisqu'elle est déjà en train d'être chassée : l'emplacement est vide, ou occupé par la bille posée qui la remplace.
- Une chaîne d'effets qui ne s'arrêterait pas, comme deux billes du pot qui se répondent, est coupée par une limite de sécurité. Le jeu annonce « Enchaînement interrompu. » ; seule cette chaîne est coupée, et le geste ou la résolution reprend ensuite normalement (phases suivantes, retraits, Impact). C'est une anomalie, que les outils de test signalent.
- La limite de lancers par tour empêche les boucles pilotées par le joueur.

## 10. Les valeurs de partie

Les valeurs de partie sont des compteurs tenus pendant la partie. Les montants calculés peuvent les lire, et les réactions en poche les écouter. Chaque compteur a deux portées :

- **ce tour**, qui revient à zéro au début de chaque tour, avant sa pioche ;
- **cette partie**, qui ne revient jamais à zéro.

### Les catégories

- **Les déclenchements de mots-clés** : chacun se dit par son mot-clé, « Éjections déclenchées », « à chaque Éjection déclenchée » : Éveil, Chiquenaude, Tic, Trouvaille, Éjection, Final, Chute, Polissage, Fêlure ; les phases de pointe, de base, de base droite, de base gauche ; et les effets En poche (entrée, résolution, réactions).
- **Les actions** : pour chaque mot-clé d'action, ses effets, « effets Éjecter », « à chaque effet Éjecter », et sa quantité réelle, « billes éjectées par effet » (billes piochées, usure retirée ou ajoutée, billes empochées, éjectées, défaussées, renvoyées, ramassées).
- **Vitesse et Masse** : les gains et les pertes, en nombre et en total.
- **Les évènements** : ce qui arrive aux billes, au participe, et à la partie, par un nom : billes lancées, remplacements (une pose sur un emplacement occupé), billes éjectées, billes normales et calots éjectés, mélanges, billes piochées, usées, sorties du triangle, empochées, perdues, défaussées (toute arrivée à la défausse, d'où qu'elle vienne) ; statuts reçus, renforcés, charges de statut utilisées, statuts terminés.

### Les règles de comptage

- Un compteur augmente au moment de son évènement, avant que les billes n'y réagissent. Une Chiquenaude qui compte les chiquenaudes de ce tour se compte elle-même : la première du tour lit 1.
- Un mot-clé ne compte que chez une bille qui en a l'effet, ou qui a reçu un bonus pour cette phase. Un effet dont la condition est fausse compte quand même. Une phase sautée ne compte pas.
- Un mot-clé et l'évènement auquel il réagit sont deux compteurs : une pose qui remplace une bille sans Éjection compte une bille éjectée, et aucune Éjection.
- Une action compte un déclenchement par application, cible vide comprise. Sa quantité réelle compte ce qui s'est vraiment appliqué, après plancher ou plafond.
- Les billes éjectées comptent celles d'un remplacement et celles d'un effet Éjecter.

## 11. La prévision

La prévision dit ce que le tour produirait, sans rien changer à la partie. Elle s'entend de deux façons :

- **la vue d'ensemble**, touche R : la Vitesse, la Masse et l'Impact prévus, puis ce que chaque emplacement et chaque bille du pot produiraient ;
- **la confirmation d'une pose** : ce que la bille posée produirait, sa Chiquenaude, le Tic et l'Éjection éventuels, et les réactions du pot.

Elle joue les vraies règles sur une copie de la partie, sans jamais révéler l'ordre du sac : une bille qui serait piochée y reste inconnue. Elle montre aussi les mélanges du sac et leurs Trouvailles, les Finals, les billes qui seraient chassées ou empochées, les cibles vides, et les billes retirées avant leur phase.

Elle a deux exceptions :

- **le choix** : la prévision ne devine pas le choix du joueur. L'effet concerné se dit « selon votre choix », et ce qui en dépend n'est pas calculé ;
- **l'Éveil** : la bille piochée étant inconnue, son Éveil ne se prévoit jamais. Quand un Éveil est possible, la prévision finit par « Éveils possibles. ».

De même, une bille piochée puis aussitôt empochée reste inconnue dans la prévision. En dehors de ces cas, la prévision donne exactement le résultat réel.

## 12. Les statuts

Un **statut** est un effet durable que reçoit la partie, donné par une bille (le mot-clé d'action Appliquer un statut), ou posé dès le début comme **règle** de la partie (section 13). La partie le porte : il reste quand la bille qui l'a donné quitte le triangle.

### Ce qu'un statut peut faire

- **Changer une caractéristique** (section 4) : les lancers par tour, la taille de la main, la capacité du pot, d'un nombre par intensité. Planchers : une main d'au moins une bille, des lancers et un pot jamais négatifs. Un lancer de plus reçu pendant la phase de jeu s'ajoute aussitôt aux lancers restants. Une zone au-delà de sa capacité (le pot, quand le statut qui l'agrandissait prend fin) garde ses billes : elle compte comme pleine, et rien n'en sort.
- **Modifier une valeur** : les gains de Vitesse, les pertes de Vitesse, les gains de Masse, les pertes de Masse, et l'Impact du tour.
  - Un gain ou une perte se reconnaît au signe de la Vitesse ou de la Masse qu'un effet applique, bonus reçu compris, avant toute modification.
  - Le statut agit sur la grandeur (une perte de 3 est une grandeur 3), qui ne descend jamais sous 0 : une perte réduite reste une perte, ou devient nulle, jamais un gain. « Amorti : pertes de Vitesse, −1 » fait d'une Vitesse −3 une Vitesse −2.
  - L'Impact se modifie après son calcul habituel (Vitesse × Masse et leurs planchers), puis ne descend jamais sous 0.
  - Plusieurs statuts sur la même valeur : d'abord toutes les additions, puis toutes les multiplications, chacune dans l'ordre où les statuts ont été reçus ; le plancher à la fin.
  - Une multiplication peut être une fraction (÷2). Une valeur non entière après modification est **arrondie vers zéro**, à la fin : un gain de Vitesse 3 divisé par deux donne 1 ; un gain de 1, 0.
  - Un modificateur peut ne viser que les valeurs **produites par une bille** d'un certain genre (un calibre, une famille ou une rareté) : « les gains de Vitesse des calots ÷2 », « les gains de Vitesse des billes Brume +1 ». La bille qui produit une valeur est celle dont l'effet joue (une bille du pot comprise ; pour un bonus reçu, la bille qui le reçoit et le joue à sa phase) ; pour l'usure de phase, la bille qui s'use. Une valeur produite sans bille (la réaction d'un statut) ne correspond à aucun de ces filtres. L'Impact et la pioche du début de tour n'ont jamais de bille : aucun filtre ne s'y pose.
  - L'effet et l'Impact se disent avec leur valeur finale, partout : la séquence, R, la confirmation.
- **Modifier une quantité** : le nombre de billes de la pioche du début de tour, le N des effets Piocher d'un effet, le N d'un effet Polir, le N d'un effet Fêler, et l'usure qu'une bille prend à sa phase (1 d'habitude).
  - Le même ordre que pour les valeurs : additions, puis multiplications, dans l'ordre où les statuts ont été reçus, plancher 0 à la fin. Une quantité ne devient jamais négative : un effet Polir réduit ne devient jamais un effet Fêler, ni l'inverse.
  - La pioche du début de tour (celle du premier tour comme des suivants) et les effets Piocher sont deux quantités séparées : un statut sur l'une ne touche pas l'autre. Les clauses Piocher d'un même effet se modifient ensemble, une fois par effet ; un effet sans Piocher n'a rien à modifier.
  - Un effet Polir ou Fêler se modifie une fois par clause, quand l'effet joue ; la quantité finale vaut pour chacune de ses cibles. Une charge sert donc à toute la clause, et se consomme même si la cible se révèle vide.
  - Les limites habituelles viennent APRÈS : la main pleine et le sac vide arrêtent la pioche, l'usure ne descend pas sous 0 ni ne dépasse son maximum. Les quantités réelles des valeurs de partie comptent ce qui s'est vraiment passé.
  - Une quantité ramenée à 0 ne fait rien : l'action ne se joue pas, ne se dit pas, et ne compte pas comme un déclenchement de son mot-clé. Une usure de phase ramenée à 0 : la bille joue sa phase sans s'user.
  - Une usure de phase augmentée peut amener la bille à son maximum (jamais au-delà) : elle part à l'étape des retraits. Un effet Fêler augmenté qui l'y amène la retire aussitôt.
  - L'effet se dit avec ses quantités finales : « Polir de 2 la bille en pointe » pour Polir de 1, sous un statut qui ajoute 1 aux effets Polir. La fiche d'une bille garde son effet imprimé.
- **Réagir à ce qui se passe**, comme une bille du pot (section 9) : « Ferveur : à chaque chiquenaude, Vitesse +2 ». La réaction se dit avec le nom du statut : « Ferveur : Vitesse +2. ». Elle ne vise jamais « cette bille » ni un emplacement relatif : un statut n'a pas de bille.
- **Verrouiller** une action du joueur ou une sorte d'effet (un **verrou**) :
  - **l'échange** : il est refusé, « Échange interdit par le statut : … » ;
  - **le remplacement** : une pose sur un emplacement occupé est refusée ; une pose sur un emplacement vide reste permise ;
  - **un mot-clé de déclenchement** (la Chiquenaude, par exemple) : il ne se déclenche plus. L'évènement a lieu (la bille est bien lancée, et compte parmi les billes lancées), mais son effet ne joue pas, et son compteur de déclenchements ne bouge pas : rien n'y réagit ;
  - **le pot** : les billes du pot n'agissent plus, ni à leur entrée, ni à la résolution, ni en réaction. Elles y entrent toujours, et la capacité ne change pas.
  Une action verrouillée n'est jamais proposée ; la prévision tient compte des verrous. Un verrou ne vise aujourd'hui que la partie ; un verrou sur une bille (« cette bille ne peut pas être éjectée ») est prévu, pas encore joué.

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
| effets Piocher | le total des clauses Piocher d'un effet | quand l'effet joue, avant de piocher |
| effets Polir | le N d'une clause Polir | quand l'effet joue, avant le plancher d'usure |
| effets Fêler | le N d'une clause Fêler | quand l'effet joue, avant le plafond d'usure |
| usure de phase | l'usure prise par une bille à sa phase | après son effet de phase, avant le plafond |

Tous ont un plancher de 0, puis l'arrondi vers zéro. Empocher, Éjecter, Défausser, Rebondir et Ramasser n'en ont pas. Tous ont une bille qui produit la valeur, sauf l'Impact et la pioche du début de tour.

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
- Les fins de tour se disent après la rotation, dans l'ordre où les statuts ont été reçus : « Fin du statut : amorti. ». Jamais au tour où la partie s'arrête.

### Les réactions des statuts

- L'ordre est la règle unique des réactions (section 9, « Les réactions en poche ») : l'évènement se produit, il est compté, la bille concernée joue son propre effet (l'Éveil après sa pioche, le Final ou l'Éjection après son départ), puis les billes du pot réagissent, dans l'ordre d'arrivée, puis les statuts, dans l'ordre où ils ont été reçus. Pendant les phases de la résolution, les réactions des statuts sont retenues comme celles du pot, et jouent après l'étape du pot.
- Un statut ne réagit jamais à sa propre réception ni à son renforcement ; il réagit aux occurrences suivantes, tant qu'il est en vigueur.

### Les consulter

- **A** : « 2 statuts : amorti, intensité 2, 3 tours. Lancer supplémentaire, à partir du prochain tour. », ou « Aucun statut. ». Les règles de la partie n'y sont pas : elles se consultent par O (section 13).
- **Maj+A** : le menu des statuts, de gauche à droite, puis « Retour » (sans statut, « Aucun statut. » avant « Retour ») ; Échap ferme. Chaque entrée dit le nom, l'intensité s'il le faut et ce qui reste ; Ctrl+bas parcourt sa fiche : son effet, ce qui lui reste, son origine (« Obtenu par : Tic d'argile. ») ; E dit sa description.
- Sur une bille, sa fiche dit le statut qu'elle donne et sa durée ; E décrit, après ses mots-clés, chaque statut qu'elle peut donner.
- La prévision (R, la confirmation d'une pose) compte les statuts et leurs charges, sur une copie : rien n'est consommé avant le vrai coup. R dit les réactions des statuts pendant la résolution ; la confirmation a une ligne des statuts dès que la partie en a.
- **S** dit la pioche du prochain début de tour, statuts compris, sans rien consommer.

### Les statuts de test

Cette liste est générée à partir de la table des statuts ; elle ne se modifie pas à la main.

<!-- statuts de test : début -->

- **Lancer supplémentaire** : lancers +1 par intensité, le prochain tour. Se cumule en intensité.
- **Élan** : lancers +1 par intensité, ce tour. Se cumule en intensité.
- **Poche profonde** : capacité du pot +1 par intensité, toute la partie. Se cumule en intensité.
- **Coup de fouet** : le prochain gain de Vitesse est doublé. Une charge ; chaque nouvelle application en ajoute une.
- **Amorti** : les pertes de Vitesse sont réduites de 1 par intensité, sans jamais devenir un gain. 3 tours ; se cumule en intensité.
- **Ferveur** : à chaque chiquenaude : Vitesse +2. 2 tours ; unique.
- **Coup double** : l'Impact du tour est doublé. Ce tour ; unique.
- **Fatigue** : lancers −1 par intensité, le prochain tour. Se cumule en intensité.
- **Main vive** : pioche du début de tour +1 par intensité. 2 tours ; se cumule en intensité.
- **Inspiration** : le prochain effet Piocher pioche une bille de plus. Une charge ; chaque nouvelle application en ajoute une.
- **Lustre** : effets Polir +1 par intensité, toute la partie. Se cumule en intensité.
- **Fragilité** : effets Fêler +1 par intensité. 3 tours ; se cumule en intensité.
- **Répit** : les billes jouent leur phase sans s'user. Ce tour ; unique.
- **Usure accélérée** : usure de phase +1 par intensité, le prochain tour. Se cumule en intensité.
- **Gravier** : les calots rapportent moitié moins de Vitesse et de Masse : leurs gains de Vitesse et de Masse sont divisés par deux, arrondis vers zéro.
- **Un lancer de moins** : un lancer de moins à chaque tour.
- **Échange interdit** : aucun échange n'est permis.
- **Pot inerte** : les billes du pot n'agissent pas : ni à leur entrée, ni à la résolution, ni en réaction.
- **Silence** : le mot-clé Chiquenaude ne se déclenche plus.

<!-- statuts de test : fin -->

## 13. Définitions de partie, objectifs, règles et verrous

### La définition d'une partie

Une partie est décrite entièrement par sa **définition** : ses valeurs de départ (taille de la main, lancers, capacité du pot, pioche du premier tour, pioche par tour), la source de son sac (section 14 : le sac du joueur, un sac imposé, ou un sac tiré au hasard pour les tests), son nombre de tours, ses conditions de fin, son objectif, et ses règles, éventuellement aucune. La partie habituelle est la définition par défaut ; un défi n'est qu'une définition de plus. En jeu, c'est aujourd'hui toujours la partie habituelle, avec le sac de départ.

### Quand la partie s'arrête : les conditions de fin

Elles se vérifient à deux moments fixes, et la première atteinte arrête la partie :

- **Après le calcul de l'Impact** : la cible atteinte (objectif cible), un tour raté (objectif endurance), le dernier tour de la définition. La résolution se termine alors comme au dernier tour : la rotation, la fin du tour, sans fin des statuts.
- **À la pioche du début de tour** : la **pioche impossible**, commune à tous les objectifs. Après la pioche, il ne reste plus aucune bille à jouer, ni en main, ni sur le triangle, ni au sac, ni à la défausse ; le tour n'est pas joué. C'est possible parce que des billes envoyées au pot plein sont perdues pour la partie.

### Comment le résultat se juge : l'objectif

- **Libre** : la partie va jusqu'à son dernier tour. Le résultat est le **palier** atteint par le score : aucun, bronze, argent ou or, selon les seuils de la définition. Chaque palier franchi se dit aussitôt après l'Impact. Une pioche impossible donne un résultat normal.
- **Cible** : atteindre un score donné en un nombre de tours au plus. **Victoire** dès que le score l'atteint, après l'Impact : la partie s'arrête aussitôt, même au dernier tour. **Échec** si le dernier tour se termine sans l'avoir atteint, ou sur une pioche impossible.
- **Endurance** : à chaque tour, l'Impact doit atteindre un minimum. La partie s'arrête à la fin du premier tour raté ; le résultat est le nombre de **tours tenus**, et le score. Un nombre de tours maximal, facultatif, termine la partie en **succès** ; sans lui, la partie ne s'arrête qu'au premier tour raté, ou sur une pioche impossible (un résultat normal : les tours tenus).

### Les règles

Une **règle** est un statut (section 12) posé au début de la partie, pour toute sa durée. Deux particularités :

- elle est **verrouillée** : aucun effet ne peut la retirer, la réduire, la renforcer ni consommer ses charges. Une bille qui donne le même statut est sans effet : « Règle de la partie, sans effet : … » ;
- son **origine** est « une règle de la partie », non une bille.

Une règle peut faire tout ce que fait un statut : changer une caractéristique, modifier une valeur (avec ses filtres), réagir, verrouiller. Les règles ne figurent pas parmi les statuts (touche A), mais avec l'objectif (O, Maj+O). Un même statut peut servir de règle à plusieurs définitions.

### Les verrous

Un **verrou** est un comportement de statut (section 12, « Ce qu'un statut peut faire »), qu'il vienne d'une règle ou d'un statut ordinaire (« pas d'échange ce tour »). Une action verrouillée est refusée avec sa raison : « Échange interdit par la règle : … », « Remplacement interdit par le statut : … ».

### Les consulter

- **À l'ouverture**, une seule annonce, avant celle du premier tour : l'objectif, puis chaque règle. « Objectif : 165 points en 8 tours. Règle : gravier. Les calots rapportent moitié moins de Vitesse et de Masse… »
- **O** : l'objectif, la progression, puis le nombre de règles. « Objectif : 165 points en 8 tours. 110 sur 165, tour 5 sur 8. 1 règle. » ; en partie libre : « Objectif : libre, 10 tours. Tour 5 sur 10. Score 90, aucun palier atteint. Prochain palier : bronze à 177. » ; en endurance : « Objectif : Impact de 10 minimum chaque tour, 20 tours au plus. 4 tours tenus sur 20. »
- **Maj+O** : un menu, de gauche à droite : l'objectif, puis chaque règle, puis « Retour » ; Échap ferme. Ctrl+bas parcourt la fiche de l'objectif (sa progression, ce qui le juge, la pioche impossible) ou d'une règle (son effet) ; E dit la description de la partie ou de la règle.
- **À la fin** : le résultat selon l'objectif, puis le score final. « Partie terminée. Palier argent atteint. Score final : 100. », « Partie terminée. Victoire : objectif atteint. Score final : 80. », « Partie terminée. Fin de l'endurance : 4 tours tenus. Score final : 80. » ; sur une pioche impossible, la raison d'abord : « Plus aucune bille à jouer. ».

### Les définitions de test

Des définitions provisoires, pour tester les mécaniques ; leurs valeurs sont des repères techniques tirés du simulateur (joueur glouton, sac de départ), pas un équilibrage.

| Définition | Objectif | Sac | Règles |
|---|---|---|---|
| partie libre (la partie habituelle) | libre, 10 tours ; paliers bronze 177, argent 199, or 251 | du joueur | aucune |
| défi cible | 165 points en 8 tours | imposé : le sac de départ | aucune |
| défi endurance | Impact de 10 minimum chaque tour, 20 tours au plus | du joueur, exactement 15 billes | aucune |
| gravier | libre, 10 tours | du joueur | gravier : les gains de Vitesse et de Masse produits par un calot sont divisés par deux |
| terrain étroit | libre, 10 tours | du joueur | un lancer de moins |
| sans pot | libre, 10 tours | du joueur | pot inerte : les billes du pot n'agissent pas |
| silence | libre, 10 tours | du joueur | silence : le mot-clé Chiquenaude ne se déclenche plus |

## 14. Les sacs

### Collection, sacs et partie

Une partie se joue avec un **sac**, comme un deck dans un jeu de cartes. Quatre choses à distinguer :

- le **catalogue** : toutes les billes du jeu ;
- la **collection** : les billes que le joueur a débloquées. Une bille débloquée s'utilise librement dans un sac, autant de fois que les règles de construction le permettent : il n'y a pas d'exemplaires possédés. Aujourd'hui, toutes les billes sont débloquées ;
- les **sacs** : des compositions enregistrées, chaque bille avec son nombre d'exemplaires. Le jeu en fournit, les **sacs préfaits**, que le joueur ne modifie pas ; le joueur a les siens, dans 5 emplacements, enregistrés avec sa partie (voir « Mes sacs ») ;
- la **partie** : elle reçoit un sac et en fait une copie, ses billes mélangées dans le sac de pioche. Rien de ce qui arrive en partie (une bille empochée, perdue, défaussée) ne change le sac ni la collection.

### Les règles de construction

Un sac du joueur doit respecter des **règles de construction**. Par défaut :

- **taille** : de 12 à 20 billes ;
- **exemplaires** d'une même bille, au plus, selon sa rareté : commune 3, peu commune 3, rare 2, épique 2, légendaire 1.

Une définition de partie peut avoir ses propres règles de construction : une règle qu'elle donne remplace celle par défaut, les autres restent (le défi endurance demande exactement 15 billes, la limite d'exemplaires restant celle par défaut).

Un sac qui ne les respecte pas ne permet pas de lancer la partie : elle refuse de démarrer, et dit chaque problème. « Sac trop petit : 10 billes sur 12 minimum. », « Sac trop grand : 22 billes sur 20 maximum. », « Trop d'exemplaires de pierre de sang : 2 sur 1 maximum. », « Bille non débloquée : pierre de sang. », « Bille inconnue : … ».

### Le sac d'une partie

Selon sa définition, une partie se joue avec :

- le **sac du joueur**, vérifié selon les règles de construction de la définition ;
- un **sac imposé** : un sac préfait que la définition désigne ; le jeu le prête, ni la collection ni les règles de construction ne s'y appliquent ;
- un **sac généré** au hasard, pour le simulateur et les tests.

La partie habituelle se joue avec le sac du joueur. Lancée depuis le menu principal, elle commence par le **choix du sac** : les sacs du joueur, puis les sacs préfaits, puis « Retour » (« Sac 1, 17 billes. »). Un sac invalide se dit « invalide » et ne se lance pas : Entrée dit son premier problème et leur nombre (« Sac trop petit : 9 billes sur 12 minimum. 2 problèmes au total. »). Le curseur s'ouvre sur le dernier sac utilisé, s'il existe encore et qu'il est valide ; sinon sur le premier sac valide.

### Mes sacs

Les sacs du joueur sont enregistrés avec sa partie : sans partie sauvegardée, il n'en a pas (« Aucune partie sauvegardée : vos sacs vivent dans une partie. »), et une nouvelle partie repart sans sacs. Un sac porte le nom de son emplacement, « sac 1 » à « sac 5 », même copié ou dupliqué.

L'écran « Mes sacs », depuis le menu principal, liste les 5 emplacements (« Sac 1, 17 billes, valide. », « Emplacement 3, vide. »), puis « Sacs préfaits », puis « Retour » :

- un **sac** : Modifier, Dupliquer (vers un emplacement vide ; sans emplacement vide, refusé), Supprimer (« Supprimer le sac 1 ? », Annuler d'abord) ;
- un **emplacement vide** : Créer un sac vide, ou Partir d'un sac préfait (le sac choisi est copié) ; le sac est créé tout de suite, puis l'éditeur s'ouvre ;
- les **sacs préfaits** : la liste, en lecture seule ; un sac se consulte (ses billes, avec leurs fiches) ou se copie dans un emplacement vide.

Un sac invalide (trop petit, une bille inconnue…) s'enregistre comme un brouillon : il est dit « invalide » et ne se joue pas. Un sac enregistré qui ne respecte plus les règles, ou qui cite une bille disparue, se charge quand même, invalide, avec ses problèmes.

### L'éditeur

L'éditeur travaille sur une copie du sac : rien n'est enregistré avant de quitter par « Enregistrer ». Il a deux zones, le **sac** en haut (une entrée par bille : « Rubis, 2 sur 2 maximum. ») et la **collection** en bas (les billes débloquées : « Rubis, normale, Trésor, rare. Dans le sac : 2 sur 2. »), chacune rangée par famille, puis rareté, puis nom. Il suit les règles de construction par défaut.

- **Haut** et **Bas** changent de zone ; **Gauche** et **Droite** parcourent la zone ; **Origine** et **Fin** vont aux bornes ; **Ctrl+Haut** et **Ctrl+Bas**, la fiche de la bille ; **V**, **F**, **E**, sa description, son identité, ses mots-clés.
- **Entrée** ajoute un exemplaire : « Rubis ajouté, 2 sur 2. Sac : 14 billes. » ; refusé au maximum de sa rareté (« Maximum atteint pour rubis : 2. ») ou quand le sac est plein (« Sac plein : 20 billes. »).
- **Suppr** retire un exemplaire : « Rubis retiré, 1 sur 2. Sac : 13 billes. » ; une bille qui n'a plus d'exemplaire quitte la zone du sac, et le curseur passe à sa voisine.
- **R** dit le résumé : « 14 billes sur 12 à 20, valide. », puis la répartition par famille, par calibre et par rareté ; **Maj+R** ouvre la liste des problèmes (« Aucun problème. » pour un sac valide).
- **G** fait défiler le filtre de famille de la collection (toutes, puis chaque famille), **Maj+G** celui de rareté : « Filtre : Astres, 5 billes. ».
- **Échap** quitte ; si le sac a changé : « Enregistrer les modifications ? », Enregistrer, Quitter sans enregistrer, Continuer.
- **H** ou **F1** : l'aide des touches.

### Les sacs préfaits

| Sac | Billes | Composition |
|---|---|---|
| sac de départ | 20 | la commune, la peu commune et la rare de chaque famille, plus une seconde argile et un second œil-de-chat ; ni épique ni légendaire |
| sac du Trésor | 15 | cuivre 3, vive-argent 3, rubis 2, lingotin 2, pierre de sang 1 ; lune, comète, bille de fronde, boule de feu |
| sac des Astres | 15 | lune 3, comète 3, galaxie 2, éclipse 2, étoile 1 ; cuivre, vive-argent, bulle, fantôme |
| sac de la Brume | 15 | bulle 3, fantôme 3, perle 2, océan 2, boule à neige 1 ; lune, comète, abeille, dauphin |
| sac du Bestiaire | 15 | abeille 3, dauphin 3, tortue 2, araignée 2, dragon 1 ; bulle, fantôme, bille de fronde, boule de feu |
| sac du Souffle | 15 | bille de fronde 3, boule de feu 3, tornade 2, grenade 2, diable rouge 1 ; cuivre, vive-argent, abeille, dauphin |
| sac des Classiques | 15 | argile 3, œil-de-chat 3, agate 2, acier 2, soda 1 ; cuivre, lune, bulle, abeille |

Un sac de famille réunit les cinq billes de la famille, chacune au maximum d'exemplaires que permet sa rareté, et la commune et la peu commune de ses deux voisines sur la roue des familles (Trésor, Astres, Brume, Bestiaire, Souffle, puis retour au Trésor) ; celui des Classiques, la commune de quatre familles de la roue.

### La fin de la partie

À la fin de la partie, ou quand le joueur la quitte, le jeu des billes rend un **résultat** : la définition, le sac, l'objectif, l'issue (palier, victoire, échec, tours tenus, ou abandon), le score final, les tours joués, et quelques valeurs de partie (billes lancées, piochées, empochées, perdues, éjectées, défaussées). Le jeu des billes ne décide d'aucune récompense : c'est au jeu qui l'accueille d'en tirer les conséquences. Un abandon n'a ni palier ni victoire.

## Annexe : les billes du premier set

Cette annexe est générée à partir de la table des billes ; elle ne se modifie pas à la main.

<!-- annexe des billes : début -->

### cuivre

cuivre, normale, Trésor, commune, usure 4.

*Ne la lavez pas, elle se couvrira d'un joli vert-de-gris. Toxique, mais très classe.*

- Pointe : Vitesse +3.
- Base : Vitesse égale à la Vitesse que donne la bille de l'autre base.
- Éjection : Vitesse +3.
- Polissage : Vitesse +3.
- En poche, à chaque résolution : Vitesse +2.

### vive-argent

vive-argent, minibille, Trésor, peu commune, usure 3.

*Couleur de mercure, effet liquide : on dirait du vrai. Remarquez, à l'époque, ça se faisait encore. C'était mieux avant.*

- Pointe : Masse +1.
- Base : Vitesse +2.
- Final : Empocher cette bille.
- En poche, à chaque effet Polir : Vitesse +2.

### rubis

rubis, normale, Trésor, rare, usure 4.

*Elle vaudrait moins cher si elle était verte. Au moins vingt fois moins cher.*

- Pointe : Masse +1, +1 par bille dans le pot, maximum +4.
- Base : Polir de 1 la bille de l'emplacement suivant ; Vitesse −2 si l'emplacement suivant est vide.
- En poche, à l'entrée : statut lustre, toute la partie.

### lingotin

lingotin, calot, Trésor, épique, usure 5.

*Une bille coulée dans de l'or pur. Quelle décadence.*

- Pointe : Vitesse +4 et Masse +1.
- Base : Masse +1.
- Tic : Empocher jusqu'à une bille de votre main au choix.
- En poche, à chaque résolution : Masse +1 si le pot est plein.

### pierre de sang

pierre de sang, normale, Trésor, légendaire, usure 3.

*C'est moins grave que ça en a l'air.*

- Pointe : Vitesse +3 et Masse +1.
- Base : Masse +1.
- Final : Empocher cette bille.
- En poche, à l'entrée : statut poche profonde, intensité 2, toute la partie.
- En poche, à chaque bille empochée : Masse +1.

### lune

lune, normale, Astres, commune, usure 3.

*Taillée dans de la roche lunaire de première qualité. Du moins, c'est ce que disait la publicité.*

- Pointe : Vitesse +3.
- Base : Vitesse +3 si le triangle compte au moins 1 calot, sinon Vitesse +1.
- Éveil : Vitesse +3.
- Tic : Vitesse +2.
- Éjection : Vitesse +2.

### comète

comète, minibille, Astres, peu commune, usure 2.

*Quelle chevelure, quelle queue ! Oui, on parle bien d'une bille.*

- Pointe : Vitesse +3.
- Base : Vitesse +1.
- Éveil : Piocher 1.
- Final : Piocher 1 si vous avez au plus 3 billes en main, sinon Vitesse +2.
- En poche, à chaque mélange : Vitesse +3.

### galaxie

galaxie, normale, Astres, rare, usure 3.

*Avant le big bang, l'univers aurait pu s'y loger.*

- Pointe : Vitesse +2 par Astres active, maximum +6.
- Base : Masse +1.
- Chiquenaude : Vitesse +5 et Masse +1 si le triangle compte au plus 1 bille.
- Trouvaille : Masse +1.

### éclipse

éclipse, calot, Astres, épique, usure 3.

*Ne la regardez pas ! Même à travers un téléphone !*

- Pointe : Masse +2.
- Base : Vitesse +2.
- Éveil : statut main vive, 2 tours.
- Trouvaille : statut inspiration, 1 charge.
- Final : Piocher 2.

### étoile

étoile, minibille, Astres, légendaire, usure 4.

*C'est juste un machin qui scintille dans une bille transparente. Mais ça claque.*

- Pointe : Vitesse +2 par Éveil déclenché cette partie, maximum +20.
- Base : Masse +1 par mélange cette partie, maximum +3.
- Éveil : Vitesse +1 par bille en main, maximum +5.
- En poche, à chaque bille piochée : Masse +1.

### bulle

bulle, minibille, Brume, commune, usure 2.

*Rien qu'une bille translucide, un peu bleutée, un peu irisée. Ils se sont pas foulés.*

- Pointe : Vitesse +3.
- Base : Vitesse +4 si la Masse est d'au plus 1, sinon Vitesse +1.
- Chute : Vitesse +5, −1 par point d'usure de cette bille.

### fantôme

fantôme, minibille, Brume, peu commune, usure 2.

*Qui vas-tu appeler ?*

- Pointe : Vitesse +3.
- Base : Vitesse +1.
- Chiquenaude : Vitesse +1 par tour en main, maximum +3.
- Trouvaille : Faire rebondir cette bille.
- Éjection : Vitesse +3.

### perle

perle, minibille, Brume, rare, usure 3.

*Elle est percée de part en part : elle vient d'un collier. Vous vous fichez de moi ?*

- Pointe : Vitesse +2, +1 par Brume à la défausse, maximum +6.
- Base : Masse +1 si vous avez au moins 3 billes en main, sinon Vitesse +1.
- Tic : Vitesse +4 si la bille éjectée est une minibille.
- Chute : statut amorti, 3 tours.
- En poche, à chaque résolution : Vitesse +3.

### océan

océan, calot, Brume, épique, usure 3.

*Si vous la collez à votre oreille, vous entendrez peut-être le bruit des vagues. Et vous aurez sûrement l'air idiot.*

- Pointe : Vitesse +3 par bille défaussée ce tour, maximum +12.
- Base : Masse +1.
- Tic : Ramasser jusqu'à une bille de la défausse au choix.
- Chute : Faire rebondir jusqu'à une bille active au choix.
- En poche, à chaque bille défaussée : Masse +1.

### boule à neige

boule à neige, normale, Brume, légendaire, usure 3.

*Qui est allé foutre de la neige là-dedans ? Encore de l'argent bien employé.*

- Pointe : Vitesse +4 et Faire rebondir toutes les billes actives.
- Base : Vitesse +2.
- Éjection : Masse +2.
- En poche, à chaque bille renvoyée par effet : Masse +1.

### abeille

abeille, minibille, Bestiaire, commune, usure 3.

*Rayée de jaune et de noir, elle a vite fait de s'attirer un coup de savate par mégarde. La sale bête.*

- Pointe : Empocher cette bille si la bille de l'emplacement précédent est une abeille, sinon Vitesse +3.
- Base : Vitesse +2 ; Fêler de 1 la bille de l'emplacement suivant si la bille de l'emplacement suivant n'est pas de la famille Bestiaire.
- Tic : Vitesse +3 si la bille éjectée est un calot, sinon Vitesse +2 si la bille éjectée est une bille normale, sinon Vitesse +1.
- En poche, à chaque résolution : Vitesse +2 par abeille dans le pot ; Masse +1 si le pot compte au moins 3 abeilles.

### dauphin

dauphin, normale, Bestiaire, peu commune, usure 3.

*Aussi jolie et aussi détestable que son modèle.*

- Pointe : Vitesse +3.
- Base : Vitesse +1 par bille éjectée ce tour, maximum +5.
- Tic : Vitesse +3.
- Éjection : Masse +1.
- En poche, à chaque Tic déclenché : Vitesse +3.

### tortue

tortue, calot, Bestiaire, rare, usure 6.

*Elle est verte, striée de brun, de noir et d'orange, et elle vous survivra. Soyez-en assuré.*

- Pointe : Masse +1 par Bestiaire active, maximum +3.
- Base : Polir de 1 la bille de l'emplacement suivant si le triangle est plein.
- Éjection : Empocher cette bille si la bille qui l'éjecte est un calot.
- En poche, à chaque résolution : Masse +1 si le triangle est plein.

### araignée

araignée, normale, Bestiaire, épique, usure 3.

*Une bille transparente au cœur de laquelle brille un faisceau de fils colorés. Celui qui l'a baptisée n'a jamais vu de toile de sa vie.*

- Pointe : Vitesse +2 par Bestiaire active, maximum +6.
- Base : Masse +1 si la Vitesse est d'au moins 10, sinon Vitesse +2.
- Tic : Polir de 1 jusqu'à 2 billes actives au choix.
- Éjection : Masse +1.
- En poche, à chaque Tic déclenché : statut coup de fouet, 1 charge.

### dragon

dragon, calot, Bestiaire, légendaire, usure 4.

*Même chez les billes, il faut qu'il fasse son intéressant.*

- Pointe : Vitesse +4 et Masse +1 par Bestiaire active, maximum +3.
- Base : Vitesse +1 par bille en main, maximum +3.
- Tic : Vitesse +7, Masse +2 et Empocher la bille éjectée si la bille éjectée a au plus 1 point d'usure restant.
- En poche, à chaque Tic déclenché : Masse +1.

### bille de fronde

bille de fronde, minibille, Souffle, commune, usure 2.

*Qui sait, elle a peut-être déjà tué quelqu'un.*

- Pointe : Vitesse +3.
- Base : Vitesse +1.
- Tic : Vitesse +4 si la bille éjectée est plus grosse.
- Chute : Vitesse +2 par minibille active.
- En poche, à chaque éjection d'une bille normale ou d'un calot : Vitesse +2.

### boule de feu

boule de feu, normale, Souffle, peu commune, usure 2.

*Elle est juste orange et brillante, mais vous savez ce que c'est.*

- Pointe : Vitesse +5.
- Base : Vitesse +2.
- Tic : Vitesse égale à la Vitesse du tour, maximum +8 si l'effet de la bille éjectée donne au moins Masse +1.
- Final : Vitesse +6.
- En poche, à chaque Final déclenché : Masse +1.

### tornade

tornade, normale, Souffle, rare, usure 3.

*Est-ce l'ombre d'un requin ? Non, ce serait de mauvais goût.*

- Pointe : Vitesse +3, +2 par bille éjectée ce tour, maximum +11.
- Base : Empocher cette bille si le triangle compte au moins 2 calots, sinon Vitesse +3.
- Tic : Faire rebondir la bille éjectée si la bille éjectée n'est pas un calot.
- Éjection : Piocher 1.
- En poche, à chaque bille éjectée par effet : Vitesse +2.

### grenade

grenade, normale, Souffle, épique, usure 2.

*À jeter en hurlant son nom. Effet garanti.*

- Pointe : Vitesse +5.
- Base : Vitesse +2.
- Chiquenaude : Fêler de 1 jusqu'à 2 billes actives au choix.
- Éjection : Faire rebondir cette bille.
- Final : Vitesse +4 et Masse +1 par calot actif.

### diable rouge

diable rouge, calot, Souffle, légendaire, usure 3.

*Rouge vif barré d'une bande jaune. Il ne lui manque que des cornes. Mais ça roulerait moins bien.*

- Pointe : Vitesse +6, statut coup double, ce tour et statut usure accélérée, le prochain tour.
- Base : Vitesse +3 et Fêler de 1 la bille de l'emplacement suivant.
- Final : Éjecter toutes les billes actives.
- Fêlure : Vitesse +2.
- En poche, à chaque bille usée : Masse +1.

### argile

argile, normale, Classiques, commune, usure 3.

*Personne n'aura l'idée de vous la voler, celle-ci.*

- Pointe : Vitesse +4.
- Base : Vitesse +2.
- Tic : Vitesse +3.
- Éjection : Vitesse +3.

### œil-de-chat

œil-de-chat, normale, Classiques, peu commune, usure 3.

*Plus commune que ça, tu meurs.*

- Pointe : Vitesse +3.
- Base droite : Masse +1. Base gauche : Vitesse +3.
- Éveil : Vitesse +2 par bille normale en main et sur le triangle, maximum +8.
- Tic : Masse +1.
- En poche, à chaque résolution : Masse +1 si le triangle est plein.

### agate

agate, normale, Classiques, rare, usure 4.

*Dit comme ça, ça a l'air précieux. Mais non.*

- Pointe : Vitesse +3 par famille différente sur le triangle et en main, maximum +12.
- Base : Masse +1.
- Trouvaille : Empocher la bille de l'emplacement suivant si l'emplacement suivant est occupé, sinon Empocher cette bille.
- En poche, à chaque résolution : Vitesse +2 par famille différente sur le triangle et en main ; Masse +1 si l'on compte au moins 3 familles différentes sur le triangle et en main.

### acier

acier, calot, Classiques, épique, usure 5.

*Une bille de roulement échappée d'un vieux vélo. On accepte vraiment n'importe qui, de nos jours.*

- Pointe : Masse +2.
- Base : Vitesse +2.
- Tic : Vitesse +3 si la bille éjectée est plus petite.
- Chute : Masse +1.
- En poche, à l'entrée : statut lancer supplémentaire, le prochain tour.

### soda

soda, normale, Classiques, légendaire, usure 5.

*Secouez-la, secouez-la encore, et peut-être, peut-être, vous dis-je, aurez-vous l'air parfaitement stupide.*

- Pointe : Vitesse +1 par bille dans le sac, maximum +7.
- Base : Masse +3 si le triangle compte au moins 1 minibille et le triangle compte au moins 1 calot, sinon Masse +1.
- Chiquenaude : statut élan, ce tour.
- Final : Vitesse +2 par tour passé sur le triangle, maximum +10 ; Masse +2 si elle a passé au moins 4 tours sur le triangle.
- En poche, à chaque Chiquenaude déclenchée : Vitesse +3.

<!-- annexe des billes : fin -->
