// Archétype "window" — voir entities/types/index.js pour le registre complet
// et doc/entity-model.md pour le vocabulaire du modèle d'entité. Donnée
// pure : aucun import.
//
// CAS DE RÉFÉRENCE pour les ACTIONS MULTIPLES FILTRÉES PAR CONDITION (voir
// doc/scripting.md, "approche B" — deux actions aux conditions opposées,
// zéro structure de contrôle impérative) ET pour les EFFETS DE PREMIÈRE
// CLASSE (playSound/announce mélangés à setVariable dans `effects`, voir
// doc/scripting.md/"Effets") : DEUX candidates, l'une valable FERMÉE
// (l'ouvre), l'autre valable OUVERTE (la ferme) — mutuellement EXCLUSIVES
// par construction (isOpen ne peut être QUE true ou false), jamais deux qui
// matchent en même temps. `refusalEffects` est OPTIONNEL par candidate
// (voir core/level.js/parseSingleAction) — délibérément ABSENT ici : l'union
// des deux conditions couvre tout l'espace du flag, une des deux matche
// TOUJOURS, un refus n'est donc jamais réellement atteignable. Le SON des
// volets suffit comme retour ; aucun texte de confirmation/refus imposé.
//
// isOpen : VARIABLE D'INSTANCE (portée "entity", voir core/variables.js),
// PAS déclarée ici — le TYPE ne cascade jamais de variable (contrairement à
// `action`/`behavior`/`presence`, voir core/level.js/parseEntity) : chaque
// instance qui utilise ce type DOIT déclarer SA PROPRE `isOpen` (flag,
// initial false, VOLATILE — une fenêtre repart fermée à chaque
// rechargement, voir level/town_square.json). Sans cette déclaration
// d'instance, le chargement du niveau échoue clairement (variable
// référencée jamais déclarée).
export default {
  nameKey: "entity.window.name",
  descriptionKey: "entity.window.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/window_beacon_1.mp3", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  action: [
    {
      kind: "applyEffects",
      condition: { type: "variable", scope: "entity", name: "isOpen", equals: false },
      effects: [
        { type: "playSound", path: "assets/sounds/effects/window_blinds_open" },
        { type: "setVariable", scope: "entity", name: "isOpen", value: true }
      ],
    },
    {
      kind: "applyEffects",
      condition: { type: "variable", scope: "entity", name: "isOpen", equals: true },
      effects: [
        { type: "playSound", path: "assets/sounds/effects/window_blinds_close" },
        { type: "setVariable", scope: "entity", name: "isOpen", value: false }
      ],
    },
  ],
};
