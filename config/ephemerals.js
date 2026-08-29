// Constante NEUTRE, zéro import — même esprit que config/companions.js
// (MAX_COMPANIONS) : une CAPACITÉ structurelle (sécurité anti-
// prolifération), pas un réglage de feeling. Lue par core/state.js pour ne
// jamais laisser le nombre d'entités ÉPHÉMÈRES du lieu actif dépasser cette
// taille — les entités DÉCLARÉES (JSON) ne sont JAMAIS concernées, leur
// nombre est maîtrisé à l'écriture (voir entities/model.md/"Entités
// éphémères").
export const MAX_EPHEMERALS = 50;
