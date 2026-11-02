// Collection "minerals" — minéraux, roches et fossiles. Donnée pure, aucun
// import (voir core/collections.js pour la logique, doc/collections.md).
// L'ordre des entrées est l'ordre d'affichage, fixe (celui de la liste de
// l'auteur : roches, minerais, métaux natifs, minéraux et cristaux, pierres
// fines, pierres précieuses, fossiles et curiosités). Chaque entrée
// référence un objet du sac (core/items.js/ITEM_REGISTRY) ; ses textes de
// collection vivent sous collection.minerals.entry.<objet>.*
// (collections.json).
export default {
  // Son d'interface joué à chaque nouvelle découverte de cette collection
  // (le même que les composants : une découverte « savante »).
  discoverySound: "assets/sounds/ui/scientific_reward",
  entries: [
    { item: "limestone" },
    { item: "sandstone" },
    { item: "flint" },
    { item: "slate" },
    { item: "granite" },
    { item: "basalt" },
    { item: "pumice" },
    { item: "obsidian" },
    { item: "hematite" },
    { item: "pyrite" },
    { item: "chalcopyrite" },
    { item: "bauxite" },
    { item: "magnetite" },
    { item: "galena" },
    { item: "cassiterite" },
    { item: "cinnabar" },
    { item: "native_copper" },
    { item: "native_silver" },
    { item: "gold_nugget" },
    { item: "platinum_nugget" },
    { item: "iron_meteorite" },
    { item: "quartz" },
    { item: "calcite" },
    { item: "mica" },
    { item: "talc" },
    { item: "gypsum" },
    { item: "halite" },
    { item: "sulfur" },
    { item: "fluorite" },
    { item: "rose_quartz" },
    { item: "jasper" },
    { item: "amethyst" },
    { item: "agate" },
    { item: "tigers_eye" },
    { item: "malachite" },
    { item: "turquoise" },
    { item: "lapis_lazuli" },
    { item: "garnet" },
    { item: "opal" },
    { item: "ruby" },
    { item: "sapphire" },
    { item: "emerald" },
    { item: "alexandrite" },
    { item: "rough_diamond" },
    { item: "geode" },
    { item: "ammonite" },
    { item: "shark_tooth" },
    { item: "fern_fossil" },
    { item: "trilobite" },
    { item: "amber" },
    { item: "fulgurite" },
    { item: "fossil_egg" },
  ],
};
