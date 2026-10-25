// Registre des séries de messages en rotation : id -> définition. Connecteur
// pur, zéro logique, même patron que collections/index.js. Une série est
// citée par un archétype (champ messageRotation, voir doc/entity-model.md/
// "Messages en rotation").
import billboardAds from "./billboard-ads.js";

export default {
  billboard_ads: billboardAds,
};
