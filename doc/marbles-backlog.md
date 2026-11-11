# Jeu des billes : points en suspens

Les points repoussés « à plus tard », une ligne par point, avec son origine (l'itération du minijeu, ou le fichier qui l'annonce). Les règles qu'ils touchent sont décrites dans `doc/marbles-rules.md`, la technique dans `doc/marbles.md`. Un point traité sort de la liste.

## Règles à trancher

- Éjection d'une bille qui s'éjecte elle-même : la description dit « chassée du triangle par une autre bille », mais une bille qui s'éjecte elle-même déclenche aussi son Éjection. (Itération 18.)
- Éjecter dans sa propre Éjection : la validation l'accepte, et cela ne fait rien à l'exécution ; à refuser dès le chargement ? (Itération 18.)
- « Toutes les billes actives » comprend la bille qui éjecte, et un choix d'Éjecter peut viser la bille elle-même (la base de la tigrée). (Itérations 17 et 18.)
- Ordre dans le Final de la géante : sa Pioche joue avant son Éjecter, dans l'ordre des clauses. (Itération 18.)
- Fin de partie par pioche impossible : la partie se termine même si la main contient encore des billes à jouer. (Itération 6, relevé à l'itération 19.)
- Réaction du pot à un mélange en pleine pioche : elle passe par la file et joue après la reprise de la pioche, alors que la Trouvaille, une interruption, joue avant. (Itération 15.)
- Après une chaîne interrompue par la limite de sécurité, plus aucun effet ne joue jusqu'à la fin du geste, phases comprises. (Itération 15.)
- Description d'En poche (touches E et Maj+E) : elle ne parle pas des moments « à chaque … ». (Itération 15.)
- Pendant un choix, une bille en cours de lancer n'apparaît ni en main ni sur le triangle (un Final au choix déclenché pendant une Chiquenaude). (Itération 17.)
- Échap dans un choix « jusqu'à N » : il redit la question ; il pourrait aussi terminer. (Itération 17.)

## Son

- Avec une réaction du pot provoquée par une phase, le son d'usure de cette phase part avec l'étape de la réaction. (Itération 15.)
- Le Final, Éjecter, les choix et les réactions du pot n'ont pas de son à eux : ce sont des points d'accroche muets. (Itérations 14 à 18, `doc/marbles.md`, « Sons ».)
- Un profil sonore n'a qu'une voix par rôle ; plusieurs voix par calibre sont prévues. (`config/marbles-values.js`.)

## Extensions prévues par la structure

- Choix dans le pot, la défausse ou le sac : zones déclarées, pas encore disponibles. (Itération 17.)
- Choix d'un emplacement vide : prévu, aucune action n'y a de sens aujourd'hui. (Itération 17.)
- Filtres de cible autres que le calibre, et la phrase qui en combine deux. (Itération 18.)
- Rotation de plus d'un cran par tour, que l'évènement de rotation dira. (`doc/marbles.md`, « Sons ».)
- Autres conditions de fin de partie (un Impact minimal à atteindre). (`doc/marbles.md`, « Fin de partie ».)
- Les succès, qui liront les valeurs de partie. (`doc/marbles.md`, « Valeurs de partie ».)
- Une étape de séquence qui attendrait la fin d'un son au lieu d'une durée. (`doc/marbles.md`, « Séquence de résolution ».)

## Outils

- Rapports de référence commités dans `tools/marbles/reports/` : périmés depuis l'itération 6. Proposition faite à l'itération 19 : les remplacer par un rapport unique à jour, ou les supprimer.
