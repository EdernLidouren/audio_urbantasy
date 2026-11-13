// Statut « silence » (silence), une RÈGLE de partie (marbles/content/definitions/).
// Donnée pure : les champs sont décrits dans marbles/content/statuses/index.js.
export default {
  // Un VERROU : le mot-clé Chiquenaude ne se déclenche plus.
  stacking: "unique",
  duration: { kind: "game" },
  behaviors: [{ type: "lock", lock: "trigger", trigger: "flick" }],
};
