// Archétype "passage" — point de PASSAGE entre les deux FACES (recto/verso)
// d'une même scène (voir CLAUDE.md/"RECTO/VERSO", core/scripting.md, action
// "switchSide" ; entities/model.md). Générique par nature (une ruelle, une
// porte dérobée, un trou dans la palissade...) : label/description restent
// des défauts génériques, `action.arrivalX` (point d'arrivée sur l'AUTRE
// face) est TOUJOURS fourni par l'instance de niveau, jamais par ce défaut
// — il dépend entièrement de la géométrie du lieu qui l'instancie.
//
// beacon : passage_wind_beacon, un souffle de vent en boucle CONTINUE
// (fichier ~12 s, bien au-delà du seuil de 1,5 s exigé par Howler pour une
// boucle fiable, voir doc/entity-model.md) — essai en cours pour signaler
// à l'oreille un passage SANS porte, distinct du beacon ponctuel des portes.
// Un point de passage doit rester LOCALISABLE au clavier/à l'oreille, comme
// une porte. Pour rendre un passage MUET, retirer ce beacon À L'INSTANCE
// via `"sounds": { "beacon": null }` (cascade PAR FUSION, voir
// core/level.js/parseEntity, doc/entity-model.md/"Cascade de sounds") —
// jamais un second archétype dupliqué pour ce cas.
//
// Son de FRANCHISSEMENT (recto<->verso, voir view/city-screen.js/
// playSideSwitchSound) : AUCUN défaut ici — `transitionSound` (cascade
// instance -> archétype -> défaut ABSENT, voir config/tuning-values.js) est
// un choix de CONTENU par instance (via `tuning.transitionSound` au
// niveau), jamais un défaut d'archétype imposé. Voir demo3.json (alley_gap_
// recto/verso) pour un exemple de déclaration.
export default {
  nameKey: "entity.passage.name",
  descriptionKey: "entity.passage.description",
  sounds: {
    beacon: { path: "assets/sounds/doors/passage_wind_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir entities/model.md) : un passage se
  // repère nettement une fois à portée, comme une porte.
  highlight: true,
};
