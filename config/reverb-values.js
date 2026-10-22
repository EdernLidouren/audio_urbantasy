// PRÉRÉGLAGES DE RÉVERBÉRATION, par type d'espace. Donnée pure, aucun
// import. Une face de scène en choisit un par son nom (`reverbPreset`, voir
// doc/scene-format.md/"Réverbération") au lieu de recopier des nombres ;
// ajuster un préréglage ici change toutes les scènes qui l'utilisent (sauf
// les mondes déjà figés dans une sauvegarde, voir doc/save.md).
//
// Chaque préréglage porte les MÊMES champs qu'une face :
//   - reverbDurationSec et reverbDecay, la COULEUR de la réverb : la queue
//     s'éteint en environ 7 ÷ reverbDecay secondes, et doit être retombée
//     d'au moins 50 dB à la coupure (reverbDecay × reverbDurationSec >= 5,8,
//     vérifié au chargement, voir core/scene.js/validateReverbPresets) ;
//   - reverbWet (optionnel), la QUANTITÉ : absent, le défaut global
//     (config/tuning-values.js) s'applique.
// Une face peut surcharger un champ du préréglage qu'elle choisit (ex. un
// hall un peu plus présent : reverbPreset "large_hall" + reverbWet 0.6).

export const REVERB_PRESETS = {
  // Plein air dégagé : le son part et ne revient presque pas. Grand-place,
  // parc, champ, quai ouvert.
  open_outdoor: { reverbDurationSec: 0.5, reverbDecay: 14, reverbWet: 0.08 },

  // Extérieur bordé de façades : quelques retours serrés. Rue, ruelle,
  // place étroite, cour intérieure.
  street_outdoor: { reverbDurationSec: 0.8, reverbDecay: 9, reverbWet: 0.15 },

  // Petite pièce aux surfaces absorbantes (tissus, meubles) : mate. Bureau,
  // chambre, petite boutique.
  small_furnished_room: { reverbDurationSec: 0.5, reverbDecay: 13 },

  // Petite pièce aux surfaces dures et peu meublée : un peu plus vive.
  // Réserve, cave, salle d'eau.
  small_bare_room: { reverbDurationSec: 0.8, reverbDecay: 9 },

  // Pièce moyenne (le défaut global, voir config/tuning-values.js) : salle
  // de réunion modeste, couloir, cuisine.
  medium_room: { reverbDurationSec: 1.2, reverbDecay: 6 },

  // Grand volume qui résonne nettement : hall, salle des fêtes, gare,
  // petite église.
  large_hall: { reverbDurationSec: 3.5, reverbDecay: 3 },

  // Très grand volume de pierre ou de bois, longue queue : intérieur d'un
  // clocher, puits, cathédrale.
  stone_tower: { reverbDurationSec: 5, reverbDecay: 2.5 },

  // Espace irréel, queue très longue : envers du monde, côté miroir,
  // rêve.
  otherworldly: { reverbDurationSec: 7, reverbDecay: 1 },
};
