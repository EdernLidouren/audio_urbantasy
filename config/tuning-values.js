// Valeurs de réglage de gameplay/feeling. Donnée pure : AUCUN import — même
// le core peut la lire sans jamais draîner le registre d'entités ni la
// logique de cascade (voir config/tuning.js pour resolveTuning). Ne contient
// que des valeurs qu'on peut tourner à l'oreille sans rien casser — pas
// d'invariant structurel (ceux-là restent dans le fichier qui en dépend :
// TICK_MS/MAX_FRAME_MS dans lib/loop.js, les bornes [-1,1] du pan dans
// view/audio/city-scene.js, etc.).
//
// Dernier recours de la cascade (voir lib/tuning.js / resolveTuning) : le
// registre d'entités et les instances peuvent tout ignorer, tout retombe ici.

export const TUNING_DEFAULTS = {
  // Unités parcourues par tick de déplacement (à 60 ticks/s). Plus haut =
  // marche plus rapide ; plus bas = plus lente.
  moveStep: 0.04,

  // Distance parcourue entre deux bruits de pas. Plus haut = pas plus
  // espacés (marche qui sonne plus "lente"/plus grande foulée) ; plus bas =
  // pas plus rapprochés.
  stepDistance: 0.6,

  // Distance au-delà de laquelle une entité devient inaudible (volume 0).
  // Plus haut = on l'entend de plus loin ; plus bas = elle disparaît vite.
  audibleRange: 20,

  // Distance latérale à laquelle le pan atteint le maximum gauche/droite.
  // Plus bas = la scène sonore paraît plus étroite/resserrée au centre ;
  // plus haut = il faut s'éloigner davantage pour l'entendre franchement
  // d'un côté.
  panSaturation: 10,

  // Distance en-deçà de laquelle une entité est à portée d'interaction, et
  // donc à plein volume (voir fullVolume). Plus haut = la zone
  // d'interaction est plus large ; plus bas = il faut être plus proche.
  interactRange: 1.0,

  // Volume à l'intérieur de interactRange : plateau plein et stable, le
  // signal "cette entité est interactible". Ne descend jamais en dessous.
  fullVolume: 1.0,

  // Volume juste après avoir quitté interactRange (palier volontaire, pas
  // une valeur de continuité) : marque clairement la sortie de la zone
  // d'interaction avant de décroître doucement vers 0 à audibleRange. Plus
  // haut = le palier est moins marqué (se rapproche de fullVolume) ; plus
  // bas = la coupure en sortant de interactRange s'entend davantage.
  farVolumeMax: 0.5,

  // Intervalle minimum (ms) entre deux bruits de pas, quelle que soit leur
  // origine (premier pas immédiat ou cadence). Anti-mitraillette sur appuis
  // répétés rapides — n'affecte que le SON, jamais le déplacement. Doit
  // rester nettement sous l'intervalle de marche soutenue (~330ms avec les
  // valeurs actuelles) pour rester invisible en marche normale ; plus haut
  // = pas plus espacés/étouffés sur des à-coups ; plus bas = plus permissif.
  minStepIntervalMs: 150,

  // Fréquence de coupure (Hz) du passe-bas d'une entité au plus loin
  // (dist proche de audibleRange) : plus bas = plus étouffé/sourd de loin ;
  // plus haut = perd son effet d'éloignement (se rapproche de cutoffMax).
  cutoffMin: 500,

  // Fréquence de coupure (Hz) d'une entité proche (dist <= interactRange) :
  // le son est clair, non filtré. 20000 Hz est au-delà de l'audible humain,
  // donc sans effet perceptible. Plus bas = même de près, le son reste
  // légèrement voilé.
  cutoffMax: 20000,
};
