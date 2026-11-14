# Jeu des billes : points en suspens

Les points repoussés « à plus tard », une ligne par point, avec son origine (l'itération du minijeu, ou le fichier qui l'annonce). Les règles qu'ils touchent sont décrites dans `doc/marbles-rules.md`, la technique dans `doc/marbles.md`. Un point traité sort de la liste.

## Son

- Avec une réaction du pot provoquée par une phase, le son d'usure de cette phase part avec l'étape de la réaction. (Itération 15.)
- Éjecter, les choix, la Chute, la Pioche et l'entrée au pot n'ont pas de son à eux : ce sont des points d'accroche muets. Le Polissage, la Fêlure, la Chiquenaude, l'Éveil, le Final, la Trouvaille, les billes du pot qui agissent et le début du tour ont le leur ; le reste de la conception sonore attend une version stable. (Itérations 14 à 22, `doc/marbles.md`, « Sons ».)
- Un profil sonore n'a qu'une voix par rôle ; plusieurs voix par calibre sont prévues. (`marbles/config/values.js`.)
- La balise propre d'une bille (`beacon`) est branchée, sans fichier ni bille qui la déclare. (Itération 27, `doc/marbles.md`, « Sons ».)
- Les statuts n'ont aucun son : leurs évènements (reçu, renforcé, charge, fin, réaction) sont des points d'accroche muets. (Itérations 24 et 25, `doc/marbles.md`, « Statuts (A, Maj+A) ».)
- La victoire, l'échec, le palier atteint et la fin de l'endurance ont leurs points d'accroche (`MARBLES_AUDIO`), sans fichier. Un refus de verrou n'a que le son de refus habituel. (Itération 26, `doc/marbles.md`, « Objectif et règles (O, Maj+O) ».)

## Extensions prévues par la structure

- Choix dans le pot ou le sac : zones déclarées, pas encore disponibles. (Itération 17 ; la défausse l'est depuis l'itération 21, pour Ramasser.)
- Défausser depuis le pot : la manipulation du pot sera réservée à des effets exceptionnels. (Itération 21.)
- Un déclencheur d'arrivée en main (après un Rebond ou un Ramasser), sur le modèle de la Chute à la défausse. (Itération 21.)
- Choix d'un emplacement vide : prévu, aucune action n'y a de sens aujourd'hui. (Itération 17.)
- Plusieurs filtres à la fois (« toutes les minibilles Brume actives ») : un seul filtre aujourd'hui, partout (cible « toutes », source d'un modificateur, nombre de billes) ; il manque la phrase qui en combine deux. (Itérations 18 et 27.)
- Une rareté comparée par son rang (« rare ou plus ») : l'ordre des raretés est déclaré, aucune règle ne le lit encore. (Itération 27.)
- Un nombre de billes du sac filtré (« par Brume dans le sac ») ne se prévoit pas : à l'aveugle, une bille du sac est cachée et ne passe aucun filtre. Le joueur connaît pourtant le contenu du sac (Maj+S). (Itération 27, `doc/marbles.md`, « Montants calculés ».)
- Un statut pour le tour EN COURS par une clause : une clause ne change que le nombre de tours ou de charges d'un statut, jamais la sorte de sa durée. La Chiquenaude de la soda (lancer supplémentaire, ce tour) attend cela. (Itération 27, `marbles/content/types/soda.js`.)
- La planification d'une bille gagnée en main (le glouton) n'a plus de vraie bille à jouer : aucune bille du premier set ne pioche de façon prévisible (Tic, Chiquenaude, phase) ; sa vérification est sautée tant qu'il n'y en a pas. (Itération 27, `marbles/checks/marbles-tools.check.js`.)
- Un filtre de cible « les autres », pour que « toutes les billes actives » et les choix puissent exclure la bille qui les pose. (Décision après l'itération 19.)
- Rotation de plus d'un cran par tour, que l'évènement de rotation dira. (`doc/marbles.md`, « Sons ».)
- Des statuts portés par une bille : une instance a déjà son porteur (`holder`), qui vaut toujours la partie aujourd'hui. (Itération 24, `marbles/core/statuses.js`.)
- Des points d'interception pour Empocher, Éjecter, Défausser, Rebond et Ramasser, sur le modèle de ceux de la Pioche, du Polissage et de la Fêlure. (Itération 25, `doc/marbles-rules.md`, « Les points d'interception ».)
- L'option `cardResetOnMove` (`marbles/config/values.js`), le retour du curseur de fiche à l'annonce principale à chaque déplacement, pourra devenir une option du joueur. (Revue du code de `marbles/` après l'itération 25.)
- Un menu de choix de la définition de partie en jeu, et les défis de Templeton (inventaire, récompenses) : en jeu, toujours la partie par défaut. (Itération 26, `marbles/content/definitions/`.)
- Des verrous portés par une bille (« cette bille ne peut pas être éjectée »), sur la forme des instances (`holder`). Un verrou de phase, ou d'une autre action, s'ajoute de même par une entrée de `LOCKS`. (Itération 26, `marbles/core/statuses.js`.)
- Des filtres autres que le calibre, la famille et la rareté (matière, déclencheur…), par une entrée de `TARGET_FILTERS`, ses noms et ses textes. (Itérations 26 et 27.)
- Une règle d'intensité supérieure à 1 : une règle est aujourd'hui un id de statut, à l'intensité 1. (Itération 26.)
- Les succès, qui liront les valeurs de partie. (`doc/marbles.md`, « Valeurs de partie ».)
- Une étape de séquence qui attendrait la fin d'un son au lieu d'une durée. (`doc/marbles.md`, « Séquence de résolution ».)
- Un identifiant par exemplaire dans la copie de partie : un exemplaire n'est qu'un id dans sa zone, son état propre vit dans la zone qui le porte ; il viendra avec la première règle qui suit un exemplaire d'une zone à l'autre (une bille modifiée durablement en partie). (Itération 28, `doc/marbles.md`, « Sacs ».)
- Le renommage d'un sac du joueur, faute de saisie de texte dans le jeu : le champ `name` attend, un sac porte le nom de son emplacement. (Itération 29, `marbles/core/bag-editing.js`.)
- Les sacs du joueur hors du menu principal (en ville, depuis une partie en cours) : aujourd'hui, ils vivent dans la partie sauvegardée, lue au menu principal. (Itération 29, `main.js`.)
- L'adaptateur de la collection de billes de Templeton (proposition : `doc/marbles.md`, « Sacs ») ; aujourd'hui, toutes les billes du catalogue sont débloquées. (Itération 28, `marbles/host/collection.js`.)
- Les récompenses et déblocages tirés du résultat d'une partie, par Templeton : `main.js` n'en fait rien encore. (Itération 28, `marbles/core/outcome.js`.)
- D'autres sortes de règles de construction (« une seule famille », « taille exacte »…), par une entrée de `BUILD_RULE_KINDS`. (Itération 28, `marbles/core/bags.js`.)
