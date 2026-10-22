// DÉPART d'une partie neuve ("Nouvelle partie", et "Ville test" hormis sa
// scène). Donnée pure, aucun import : lue par main.js, validée et résolue
// par core/new-game.js/parseNewGame au démarrage — une erreur ici empêche
// le jeu de démarrer, avec un message clair, plutôt que de planter en
// partie. Forme et règles : doc/new-game.md.
//
// Contenu de TEST pour l'instant : les rangers et les escarpins dans le sac
// servent à essayer les pas "boots"/"high_heels" et le tag "chic" (porte à
// dresscode de scenes/demo.json) sans rien ramasser ; les baskets équipées
// donnent un pas chaussé dès le premier mètre ; le chien suit le joueur.

export const NEW_GAME = {
  // Scène où commence la partie (id de scenes/index.js).
  startSceneId: "town_square",
  money: 0,
  // Objets dans le sac, NON équipés : [{ type, count }] (count : 1 par défaut).
  bag: [{ type: "combat_boots" }, { type: "high_heels" }],
  // Objets ÉQUIPÉS : { <slot>: <objet> }. Un objet équipé n'est pas aussi dans le sac.
  equipment: { feet: "sneakers" },
  // Compagnons : déclarés comme une entité de scène, sans x (toujours placés
  // près du joueur). Au plus MAX_COMPANIONS (config/companions.js).
  companions: [{ id: "companion-test-dog", type: "buddy", behavior: { kind: "follow" } }],
};
