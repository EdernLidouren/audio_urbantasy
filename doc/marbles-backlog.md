# Jeu des billes : points en suspens

Les points repoussés « à plus tard », une ligne par point, avec son origine (l'itération du minijeu, ou le fichier qui l'annonce). Les règles qu'ils touchent sont décrites dans `doc/marbles-rules.md`, la technique dans `doc/marbles.md`. Un point traité sort de la liste.

## Son

- Avec une réaction du pot provoquée par une phase, le son d'usure de cette phase part avec l'étape de la réaction. (Itération 15.)
- Le Final, Éjecter, les choix et les réactions du pot n'ont pas de son à eux : ce sont des points d'accroche muets. Le Polissage et la Fêlure ont le leur ; le reste de la conception sonore attend une version stable. (Itérations 14 à 18, `doc/marbles.md`, « Sons ».)
- Un profil sonore n'a qu'une voix par rôle ; plusieurs voix par calibre sont prévues. (`marbles/config/values.js`.)

## Extensions prévues par la structure

- Choix dans le pot ou le sac : zones déclarées, pas encore disponibles. (Itération 17 ; la défausse l'est depuis l'itération 21, pour Ramasser.)
- Défausser depuis le pot : la manipulation du pot sera réservée à des effets exceptionnels. (Itération 21.)
- Un déclencheur d'arrivée en main (après un Rebond ou un Ramasser), sur le modèle de la Chute à la défausse. (Itération 21.)
- Choix d'un emplacement vide : prévu, aucune action n'y a de sens aujourd'hui. (Itération 17.)
- Filtres de cible autres que le calibre, et la phrase qui en combine deux. (Itération 18.)
- Un filtre de cible « les autres », pour que « toutes les billes actives » et les choix puissent exclure la bille qui les pose. (Décision après l'itération 19.)
- Rotation de plus d'un cran par tour, que l'évènement de rotation dira. (`doc/marbles.md`, « Sons ».)
- Un système de fin de partie à concevoir à neuf : conditions multiples, modes de partie (un Impact minimal à atteindre…), exportables dans les règles de partie. Aujourd'hui, la partie finit au tour `turnCount`, et seulement là ; l'ancienne fin par pioche impossible a été retirée, devenue illogique avec les bonus de pioche. (`doc/marbles.md`, « Fin de partie ».)
- Les succès, qui liront les valeurs de partie. (`doc/marbles.md`, « Valeurs de partie ».)
- Une étape de séquence qui attendrait la fin d'un son au lieu d'une durée. (`doc/marbles.md`, « Séquence de résolution ».)
