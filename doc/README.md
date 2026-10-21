# Documentation de référence

Ce dossier regroupe toute la doc de RÉFÉRENCE du projet — descriptive,
consultée AU BESOIN quand on touche un domaine précis : un document par
domaine, le détail du code vivant dans les en-têtes de fichiers.

## Index

| Document | Domaine |
|---|---|
| [`scene-format.md`](scene-format.md) | Contrat JSON d'un fichier `scenes/*.json` : scène simple ou à deux faces (recto/verso), entité, segment, surfaces de sol, musique/ambiance, registre de types. |
| [`scripting.md`](scripting.md) | Le format déclaratif du jeu ("le script") : conditions, effets, règles, triggers horaires, actions (et leurs conditions d'accès), variables, tags — LA grammaire, jamais dupliquée ailleurs. |
| [`entity-model.md`](entity-model.md) | Modèle d'entité spécifique-Templeton : capacités d'interaction, dormance, collectible persistant, entités éphémères, collecte (conteneurs régénérants, plages au sol, cycle quotidien), vente et achat (point de vente, catalogue à stock cyclique, menu à sliders inline), mode debug, sac/équipement, vocabulaire de sons et cascade de réglages, presets, recto/verso (isolation), le joueur. |
| [`time.md`](time.md) | Horloge de partie : le compteur, ses dérivations, le calendrier simplifié, l'avancement accéléré, la persistance, la phase jour/nuit. |
| [`city-map.md`](city-map.md) | Topologie de la carte de la ville et le menu-carte. |
| [`i18n.md`](i18n.md) | Convention `data/i18n/` : découpage par domaine, parité fr/en, où va une nouvelle clé de traduction. |
| [`collections.md`](collections.md) | Collections : modèle (un fichier par collection), découverte par acquisition (`addItem`), textes, onglet Collections, sauvegarde, debug, extension par observation. |
| [`save.md`](save.md) | Sauvegarde : contenu, relecture (rebouchage, renommages de contenu, types inconnus), table `config/save-renames.js`. |

## Où va une nouvelle info ? (convention)

Avant d'écrire quoi que ce soit, trouve le domaine — chaque fait vit à
UN SEUL endroit, jamais recopié :

| Tu ajoutes/modifies... | Ça va dans... |
|---|---|
| Un champ de scène/face/entité dans le JSON (nouveau champ, nouvelle contrainte) | `doc/scene-format.md` |
| Un type de CONDITION, un type d'EFFET (tick ou action), un kind d'ACTION, un kind de TRIGGER, un tag, le modèle de VARIABLES | `doc/scripting.md` |
| Une règle spécifique au MODÈLE d'entité (dormance, collectible, éphémère, son, presets, recto/verso, le joueur) | `doc/entity-model.md` |
| Une dérivation ou un comportement de l'horloge de partie | `doc/time.md` |
| La grille de la ville ou le menu-carte | `doc/city-map.md` |
| Une nouvelle FAMILLE de clés i18n, ou une convention de traduction | `doc/i18n.md` |
| Une collection, ses entrées, la découverte ou l'onglet Collections | `doc/collections.md` |
| Le format de sauvegarde, sa migration, ou un RENOMMAGE de type/clé i18n/son (à reporter dans `config/save-renames.js`) | `doc/save.md` |
| Une liste EXHAUSTIVE (types de condition, kinds d'action, types d'entité, tags...) | **NULLE PART en doc** — elle vit dans le CODE (le registre/l'aiguillage concerné), la doc y RENVOIE toujours plutôt que de la recopier, pour ne jamais diverger |

Si aucune ligne ne correspond : c'est un nouveau domaine — crée un fichier
`doc/<domaine>.md` sur le même modèle (référence descriptive, exemples réels,
renvoi au code pour les listes exhaustives) et ajoute-le à l'index ci-dessus.

**La maintenance de cette doc fait partie du travail** : toute tâche qui ajoute/modifie un
condition/effet/kind/champ met à jour le document du domaine concerné DANS
LA MÊME tâche, jamais en différé — une doc qui diverge du code est pire que
son absence.

## Principe anti-divergence

Chaque document explique des CONCEPTS et une STRUCTURE stables, illustrés
par des exemples RÉELS et complets tirés du contenu du jeu. Aucun document
ne recopie une liste qui vit dans le code (types de condition, kinds
d'action, types d'entité, tags...) — ces listes-là RESTENT dans le registre
ou l'aiguillage source, cité par son nom et son fichier, jamais reproduites
ici : une liste dupliquée finit toujours par diverger du code.
