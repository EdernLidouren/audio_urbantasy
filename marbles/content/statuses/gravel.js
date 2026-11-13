// Statut « gravier » (gravel), une RÈGLE de partie (marbles/content/definitions/).
// Donnée pure : les champs sont décrits dans marbles/content/statuses/index.js.
import { LARGE } from "../../config/values.js";

export default {
  // Les gains de Vitesse et de Masse produits par un calot, divisés par deux (arrondis
  // vers zéro) : un filtre sur la SOURCE de la valeur.
  stacking: "unique",
  duration: { kind: "game" },
  behaviors: [
    { type: "modifier", point: "speedGain", operation: "multiply", value: 0.5, filters: [{ type: "size", size: LARGE }] },
    { type: "modifier", point: "massGain", operation: "multiply", value: 0.5, filters: [{ type: "size", size: LARGE }] },
  ],
};
