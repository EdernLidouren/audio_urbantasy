// Jeu des billes : réglages du prototype et table des billes. Donnée pure,
// zéro import ; validée au chargement par core/marbles.js/validateMarbleTypes.
//
// Une bille :
//   base        effet joué sur une base (obligatoire, {} : aucun effet) ;
//   apex        effet joué sur la pointe (obligatoire, {} : aucun effet) ;
//   baseVariant (facultatif) effet propre à UNE base, { leftBase?, rightBase? },
//               qui remplace `base` sur cette base seulement : l'exception,
//               jamais un champ de plus à remplir pour les autres billes ;
//   maxWear     (facultatif) usure maximale, sinon MARBLES_SETTINGS.defaultMaxWear.
// Un effet : { speed?, mass? }, des entiers ajoutés (ou retirés, si négatifs)
// à la Vitesse et à la Masse du tour.
//
// Le nom d'une bille se déduit de son id : `marble.<id>.name`
// (data/i18n/<langue>/marbles.json), vérifié par les vérifications
// (domaine marbles-view).

export const MARBLES_SETTINGS = {
  handSize: 5,
  turnCount: 9,
  defaultMaxWear: 3,
};

export const MARBLE_TYPES = {
  clay: { base: { speed: 1 }, apex: { speed: 4 } },
  glass: { base: { mass: 1 }, apex: { speed: 2 } },
  shooter: { base: {}, apex: { speed: 8 } },
  agate: { base: { mass: 1 }, apex: { mass: 2 } },
  cats_eye: { base: { speed: 3 }, baseVariant: { rightBase: { mass: 1 } }, apex: { speed: 3 } },
  porcelain: { base: { speed: 2 }, apex: { speed: 5 }, maxWear: 2 },
  leaded: { base: { mass: 2 }, apex: { speed: -3 } },
  mica: { base: { speed: 1 }, apex: { speed: 1 }, maxWear: 6 },
  sulphide: { base: {}, apex: { mass: 3 } },
  stoneware: { base: { speed: 2 }, apex: {} },
  tiger: { base: { speed: 3 }, apex: { speed: -1 }, maxWear: 4 },
  giant: { base: { speed: 6 }, apex: { speed: 6 }, maxWear: 1 },
};

// Sac de test : un exemplaire de chaque bille. Une liste d'ids, pas un
// dérivé de la table : un sac peut porter plusieurs exemplaires d'une bille.
export const STARTING_BAG = [
  "clay",
  "glass",
  "shooter",
  "agate",
  "cats_eye",
  "porcelain",
  "leaded",
  "mica",
  "sulphide",
  "stoneware",
  "tiger",
  "giant",
];
