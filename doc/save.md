# Sauvegarde

Format d'une partie sauvegardée, sa relecture, et ce qu'il faut faire quand on
renomme ou supprime du contenu. Code : `core/save.js` (forme, migration, pur),
`view/save-storage.js` (disque, obscurcissement, import/export de fichier),
`config/save-renames.js` (table des renommages).

## Export et import de fichier

Menu Options > Sauvegarde. L'**export** (partie ou préférences) ouvre la
fenêtre « Enregistrer sous » native quand le navigateur la propose (Chrome,
Edge : `showSaveFilePicker`) — l'utilisateur choisit le dossier et le nom ;
sinon (Firefox), le fichier est téléchargé dans le dossier de téléchargements.
Mécanisme : `lib/download.js/saveTextFile`. La description de l'entrée de menu
dit à l'avance lequel des deux s'applique ; une annonce confirme le résultat
APRÈS la fermeture de la fenêtre (« Partie exportée. », « Export annulé. »,
ou le nom du fichier téléchargé). L'**import** d'une partie passe par la
fenêtre d'ouverture native du navigateur et valide le fichier avant toute
chose, puis :
- **en jeu** : confirmation, puis la partie importée REMPLACE la partie en
  cours (`view/world-travel.js/replaceCurrentGame`) ;
- **depuis le menu principal** : la partie importée DÉMARRE, comme
  « Continuer » (`main.js/startImportedGame`, qui referme d'abord les menus
  ouverts pour que quitter la partie ramène au menu principal) — après
  confirmation seulement si une sauvegarde locale existe, puisqu'elle sera
  remplacée à la prochaine sauvegarde.
L'import des préférences est disponible partout, avec ou sans partie.

## Ce qu'une sauvegarde contient

La partie (`session`) est sérialisable de bout en bout : elle EST le format de
sauvegarde, dans une enveloppe versionnée `{ version, data }`
(`serializeGame`). Chaque monde déjà visité y figure tel qu'il était dans la
partie : ses entités avec leur type, leurs clés i18n, leurs chemins de sons,
leurs actions, leurs variables.

**Conséquence à garder en tête** : la relecture d'une sauvegarde
(`deserializeGame`) ne relit jamais le JSON de la scène. Une scène modifiée
après avoir été visitée garde, dans une partie existante, l'état de la
première visite. Pendant le développement, une nouvelle partie montre le
contenu à jour ; une scène jamais visitée est, elle, chargée fraîche. En
mode debug, le menu Shift+M permet aussi de recharger la scène courante
depuis son fichier, ou d'oublier les autres scènes visitées, sans quitter
la partie (voir `doc/entity-model.md`/"Mode debug").

## Relecture : rebouchage, renommages, types inconnus

`deserializeGame(raw, { registry })` enchaîne, dans cet ordre :

1. **Version** : une version inconnue est refusée (`reason: "version"`).
2. **Rebouchage** (`migrateSave`) : tout champ apparu après l'écriture de la
   sauvegarde reçoit un défaut sûr (surfaces, variables, météo,
   améliorations...). La forme reste v1 : compléter n'est pas monter de
   version.
3. **Renommages de contenu** (`config/save-renames.js`, voir plus bas).
   Parmi les rebouchages : `acquiredItems` (objets acquis au moins une fois,
   voir `doc/collections.md`), reconstitué à partir du sac et de
   l'équipement actuels — approximatif, un objet revendu n'y figure plus.
4. **Plausibilité** : structure minimale (joueur, mondes, monde actif...),
   sinon `reason: "invalid"`.
5. **Types inconnus**, seulement si un `registry` est fourni (la vue le
   fournit toujours, le core ne l'importe jamais) : une entité dont le type
   n'existe plus est retirée, et listée dans `droppedEntities`
   (`{ worldId, entityId, type }`, `worldId` null pour un compagnon). On
   perd l'entité, jamais la partie : la garder ferait planter la scène au
   premier accès au registre. La vue la signale quand la sauvegarde devient
   la partie en cours (« Continuer », import confirmé), jamais à la simple
   lecture : console, et journal des avertissements, ouvert de lui-même en
   mode debug (voir `doc/entity-model.md`/"Mode debug").

**Objets inconnus** (toujours, le registre d'objets étant du code du core) :
un objet du sac ou de l'équipement absent de `core/items.js`/`ITEM_REGISTRY`
(supprimé, ou renommé : les ids d'objets n'ont pas de table de renommage)
est retiré, et listé dans `droppedItems` (`{ where, type }`, `where` =
`"bag"` ou le nom du slot). Signalé au même moment que les entités
retirées, dans la console et le journal. Un comptoir dont le catalogue
enregistré cite un tel objet l'ignore simplement (`core/trade.js`/
`shopArticles`).

## Renommer du contenu : `config/save-renames.js`

Quand tu renommes un **type d'entité**, une **clé i18n** ou un **fichier de
son**, ajoute l'ancien et le nouveau nom dans la table correspondante, dans
la même tâche que le renommage :

```js
export const RENAMED_ENTITY_TYPES = { film_projector: "video_projector" };
export const RENAMED_I18N_KEYS = { "entity.film_projector.name": "entity.video_projector.name" };
export const RENAMED_ASSET_PATHS = {
  "assets/sounds/furniture/film_projector_1_beacon": "assets/sounds/furniture/video_projector_1_beacon",
};
```

- Les types sont remplacés dans le champ `type` des entités (mondes, deux
  faces comprises, et compagnons).
- Clés i18n et chemins de sons sont remplacés partout où ils apparaissent
  comme **valeur exacte** (nom, description, titre de scène, clé d'annonce
  d'une action...). Jamais les clés d'objet : noms de variables et ids de
  mondes ne sont pas concernés. Un chemin de son s'écrit comme dans le
  contenu : le pool, sans suffixe de variante.
- Les renommages successifs s'enchaînent (a -> b puis b -> c : une partie
  qui porte encore `a` reçoit `c`). Une boucle fait échouer le chargement du
  module, jamais une migration fausse en silence.
- Une entrée ne s'enlève jamais : une sauvegarde très ancienne peut encore
  en avoir besoin.
- La migration est idempotente : une partie déjà à jour traverse sans
  changement.

Une **suppression** de type ne demande rien : l'entité disparaît des parties
existantes au chargement (étape 5).

**Non couvert aujourd'hui** : les ids d'objets du sac et de l'équipement
(`core/items.js` — un objet renommé est RETIRÉ des sauvegardes, voir plus
haut) et les ids de scènes (clés de `session.worlds`, cibles de
`teleport`). Les renommer casserait les sauvegardes existantes ; une table
dédiée s'ajoutera le jour où le cas se présente.

Vérifications : `core/checks/save.check.js` (`runChecks("save")`), sections
« save renommages » et « save types inconnus ».
