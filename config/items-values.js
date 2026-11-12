// OBJETS DU SAC — donnée pure (aucun import), le registre des objets. Lu par le
// core (core/items.js : validation au chargement, accès, valeur ; core/bag.js :
// empilable ou non) et par la vue (noms, descriptions, sons). Ajouter un objet :
// une entrée ici.
//
// Le core en a besoin STRUCTURELLEMENT pour décider comment une entrée de sac
// se comporte (empilable ou non, voir core/bag.js/addItem), pas seulement pour
// l'affichage : c'est une DONNÉE de config/, qu'il lit directement — contrairement
// au registre de types d'entités (entities/types/index.js), contenu de RENDU
// qu'on lui injecte. nameKey/descriptionKey sont lus par la VUE (menu
// d'inventaire, voir view/menus/inventory-menu.js) mais restent ici, dans ce
// MÊME registre : un objet et ses métadonnées d'affichage sont une seule et
// même donnée de contenu, pas deux registres séparés à garder synchronisés.
//
// EXTENSIBILITÉ (même esprit que config/surfaces-values.js/SURFACE_REGISTRY) : `stackable`/`nameKey`/
// `descriptionKey` sont la base commune à tout objet ; `equippable`/`slot`/
// `gait` s'y ajoutent pour un objet ÉQUIPABLE (voir core/equipment.js) —
// chaque entrée reste un objet plat conçu pour en recevoir d'autres PLUS
// TARD (ex. `usable`, un effet à l'utilisation...) SANS changer la forme du
// registre ni la logique de core/bag.js — ajouter un OBJET, c'est ajouter
// une entrée ; ajouter une CAPACITÉ, c'est ajouter une clé à chaque entrée
// concernée, jamais une nouvelle fonction ni une hiérarchie de types.
//
// `equippable` (booléen) : peut être placé dans un slot d'équipement
// (core/equipment.js/equipItem) plutôt que de rester simple contenu du sac.
// `slot` : NOM du slot qu'il occupe (voir core/equipment-slots.js/EQUIPMENT_SLOTS)
// — aujourd'hui seulement "feet". `gait` : pool de son de pas (voir
// doc/entity-model.md, "Surfaces de sol et son de pas") que cet objet impose
// une fois équipé — lu par core/equipment.js/gaitOf, JAMAIS stocké ailleurs
// (voir entities/player.js). Les objets équipables déclarés ici (slot
// "feet") couvrent QUATRE pools de pas disponibles : `barefoot_walk`
// (défaut, aucun objet équipé), `shoes_walk` (baskets), `boots_walk` (bottes
// en cuir ET rangers — DEUX objets peuvent partager le même gait/pool, rien
// n'impose une correspondance 1:1), `high_heels_walk` (escarpins).
//
// `tags` (optionnel, tableau de clés — voir core/tags.js/TAG_REGISTRY) :
// classification HORIZONTALE d'un objet (ex. "military"), indépendante de
// stackable/equippable/slot — un objet équipé PORTE ses tags (voir
// core/equipment-slots.js/equippedTags), une future vérification de contenu (PNJ,
// événement) les lit via la condition "hasEquipmentTag" (core/conditions.js).
// Absent ou vide -> aucun tag.
//
// `value` (optionnel, entier > 0) : VALEUR de l'objet en pièces — prix de
// vente unitaire (voir core/trade.js/sellValueOf ; pleine valeur pour
// l'instant, la marge marchand viendra avec l'achat). Absente ou 0 -> objet
// NON VENDABLE (ex. une clé de quête), jamais listé au comptoir.
export const ITEM_REGISTRY = {
  apple: { stackable: true, nameKey: "item.apple.name", descriptionKey: "item.apple.description", value: 5 },
  // Pièce : objet EMPILABLE du sac, distinct de session.money (voir
  // entities/types/coin.js vs money.js).
  coin: { stackable: true, nameKey: "item.coin.name", descriptionKey: "item.coin.description", value: 1 },
  key_bronze: { stackable: false, nameKey: "item.key_bronze.name", descriptionKey: "item.key_bronze.description" },
  sneakers: {
    stackable: false,
    nameKey: "item.sneakers.name",
    descriptionKey: "item.sneakers.description",
    value: 20,
    equippable: true,
    slot: "feet",
    gait: "shoes",
  },
  leather_boots: {
    stackable: false,
    nameKey: "item.leather_boots.name",
    descriptionKey: "item.leather_boots.description",
    value: 40,
    equippable: true,
    slot: "feet",
    gait: "boots",
  },
  combat_boots: {
    stackable: false,
    nameKey: "item.combat_boots.name",
    descriptionKey: "item.combat_boots.description",
    value: 60,
    equippable: true,
    slot: "feet",
    gait: "boots",
    tags: ["military"],
  },
  high_heels: {
    stackable: false,
    nameKey: "item.high_heels.name",
    descriptionKey: "item.high_heels.description",
    value: 50,
    equippable: true,
    slot: "feet",
    gait: "high_heels",
    tags: ["chic"],
  },
  // Composants électroniques — collection "electronics"
  // (collections/electronics.js), générés depuis la liste fournie par
  // l'auteur. rarity : 1 (commun) à 5 (légendaire), voir
  // config/spawn-values.js/RARITY_LEVELS ; value = rarity × 20 (provisoire).
  // sound : beacon de l'objet au sol, rejoué une fois au ramassage (voir
  // itemSounds plus bas).
  resistor: { stackable: true, nameKey: "item.resistor.name", descriptionKey: "item.resistor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  ceramic_capacitor: { stackable: true, nameKey: "item.ceramic_capacitor.name", descriptionKey: "item.ceramic_capacitor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  electrolytic_capacitor: { stackable: true, nameKey: "item.electrolytic_capacitor.name", descriptionKey: "item.electrolytic_capacitor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  inductor: { stackable: true, nameKey: "item.inductor.name", descriptionKey: "item.inductor.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  quartz_crystal: { stackable: true, nameKey: "item.quartz_crystal.name", descriptionKey: "item.quartz_crystal.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  ferrite_core: { stackable: true, nameKey: "item.ferrite_core.name", descriptionKey: "item.ferrite_core.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_metal_1_beacon" },
  diode: { stackable: true, nameKey: "item.diode.name", descriptionKey: "item.diode.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  led: { stackable: true, nameKey: "item.led.name", descriptionKey: "item.led.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  transistor: { stackable: true, nameKey: "item.transistor.name", descriptionKey: "item.transistor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  power_transistor: { stackable: true, nameKey: "item.power_transistor.name", descriptionKey: "item.power_transistor.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_metal_1_beacon" },
  bridge_rectifier: { stackable: true, nameKey: "item.bridge_rectifier.name", descriptionKey: "item.bridge_rectifier.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  laser_diode: { stackable: true, nameKey: "item.laser_diode.name", descriptionKey: "item.laser_diode.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  timer_555: { stackable: true, nameKey: "item.timer_555.name", descriptionKey: "item.timer_555.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  op_amp: { stackable: true, nameKey: "item.op_amp.name", descriptionKey: "item.op_amp.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  sim_card: { stackable: true, nameKey: "item.sim_card.name", descriptionKey: "item.sim_card.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  ram_module: { stackable: true, nameKey: "item.ram_module.name", descriptionKey: "item.ram_module.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  microcontroller: { stackable: true, nameKey: "item.microcontroller.name", descriptionKey: "item.microcontroller.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  cpu: { stackable: true, nameKey: "item.cpu.name", descriptionKey: "item.cpu.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_metal_1_beacon" },
  uv_eprom: { stackable: true, nameKey: "item.uv_eprom.name", descriptionKey: "item.uv_eprom.description", value: 80, rarity: 4, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  relay: { stackable: true, nameKey: "item.relay.name", descriptionKey: "item.relay.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  toggle_switch: { stackable: true, nameKey: "item.toggle_switch.name", descriptionKey: "item.toggle_switch.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  potentiometer: { stackable: true, nameKey: "item.potentiometer.name", descriptionKey: "item.potentiometer.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  rotary_switch: { stackable: true, nameKey: "item.rotary_switch.name", descriptionKey: "item.rotary_switch.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  vibration_motor: { stackable: true, nameKey: "item.vibration_motor.name", descriptionKey: "item.vibration_motor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_motor_1_beacon" },
  cooling_fan: { stackable: true, nameKey: "item.cooling_fan.name", descriptionKey: "item.cooling_fan.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_motor_1_beacon" },
  stepper_motor: { stackable: true, nameKey: "item.stepper_motor.name", descriptionKey: "item.stepper_motor.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_motor_1_beacon" },
  piezo_buzzer: { stackable: true, nameKey: "item.piezo_buzzer.name", descriptionKey: "item.piezo_buzzer.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_beep_1_beacon" },
  small_speaker: { stackable: true, nameKey: "item.small_speaker.name", descriptionKey: "item.small_speaker.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_radio_1_beacon" },
  photoresistor: { stackable: true, nameKey: "item.photoresistor.name", descriptionKey: "item.photoresistor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  thermistor: { stackable: true, nameKey: "item.thermistor.name", descriptionKey: "item.thermistor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  electret_microphone: { stackable: true, nameKey: "item.electret_microphone.name", descriptionKey: "item.electret_microphone.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  pir_sensor: { stackable: true, nameKey: "item.pir_sensor.name", descriptionKey: "item.pir_sensor.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  hall_sensor: { stackable: true, nameKey: "item.hall_sensor.name", descriptionKey: "item.hall_sensor.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  tilt_switch: { stackable: true, nameKey: "item.tilt_switch.name", descriptionKey: "item.tilt_switch.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  mercury_switch: { stackable: true, nameKey: "item.mercury_switch.name", descriptionKey: "item.mercury_switch.description", value: 80, rarity: 4, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  coin_cell: { stackable: true, nameKey: "item.coin_cell.name", descriptionKey: "item.coin_cell.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  nine_volt_battery: { stackable: true, nameKey: "item.nine_volt_battery.name", descriptionKey: "item.nine_volt_battery.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_static_1_beacon" },
  phone_battery: { stackable: true, nameKey: "item.phone_battery.name", descriptionKey: "item.phone_battery.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  solar_cell: { stackable: true, nameKey: "item.solar_cell.name", descriptionKey: "item.solar_cell.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  small_transformer: { stackable: true, nameKey: "item.small_transformer.name", descriptionKey: "item.small_transformer.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_power_1_beacon" },
  supercapacitor: { stackable: true, nameKey: "item.supercapacitor.name", descriptionKey: "item.supercapacitor.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  glass_fuse: { stackable: true, nameKey: "item.glass_fuse.name", descriptionKey: "item.glass_fuse.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  dial_lamp: { stackable: true, nameKey: "item.dial_lamp.name", descriptionKey: "item.dial_lamp.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  neon_indicator: { stackable: true, nameKey: "item.neon_indicator.name", descriptionKey: "item.neon_indicator.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  variable_capacitor: { stackable: true, nameKey: "item.variable_capacitor.name", descriptionKey: "item.variable_capacitor.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  vacuum_tube: { stackable: true, nameKey: "item.vacuum_tube.name", descriptionKey: "item.vacuum_tube.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  nixie_tube: { stackable: true, nameKey: "item.nixie_tube.name", descriptionKey: "item.nixie_tube.description", value: 80, rarity: 4, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  magic_eye: { stackable: true, nameKey: "item.magic_eye.name", descriptionKey: "item.magic_eye.description", value: 100, rarity: 5, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  core_memory: { stackable: true, nameKey: "item.core_memory.name", descriptionKey: "item.core_memory.description", value: 100, rarity: 5, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  // Minéraux — collection "minerals" (collections/minerals.js), générés
  // depuis la liste fournie par l'auteur, même modèle que les composants :
  // rarity 1 à 5, value = rarity × 20 (provisoire), étiquette "mineral",
  // sound parmi neuf (items/mineral_<son>_1_beacon).
  // Roches
  limestone: { stackable: true, nameKey: "item.limestone.name", descriptionKey: "item.limestone.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  sandstone: { stackable: true, nameKey: "item.sandstone.name", descriptionKey: "item.sandstone.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  flint: { stackable: true, nameKey: "item.flint.name", descriptionKey: "item.flint.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  slate: { stackable: true, nameKey: "item.slate.name", descriptionKey: "item.slate.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  granite: { stackable: true, nameKey: "item.granite.name", descriptionKey: "item.granite.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  basalt: { stackable: true, nameKey: "item.basalt.name", descriptionKey: "item.basalt.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  pumice: { stackable: true, nameKey: "item.pumice.name", descriptionKey: "item.pumice.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  obsidian: { stackable: true, nameKey: "item.obsidian.name", descriptionKey: "item.obsidian.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_glass_stone_1_beacon" },
  // Minerais
  hematite: { stackable: true, nameKey: "item.hematite.name", descriptionKey: "item.hematite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  pyrite: { stackable: true, nameKey: "item.pyrite.name", descriptionKey: "item.pyrite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  chalcopyrite: { stackable: true, nameKey: "item.chalcopyrite.name", descriptionKey: "item.chalcopyrite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  bauxite: { stackable: true, nameKey: "item.bauxite.name", descriptionKey: "item.bauxite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  magnetite: { stackable: true, nameKey: "item.magnetite.name", descriptionKey: "item.magnetite.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  galena: { stackable: true, nameKey: "item.galena.name", descriptionKey: "item.galena.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  cassiterite: { stackable: true, nameKey: "item.cassiterite.name", descriptionKey: "item.cassiterite.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  cinnabar: { stackable: true, nameKey: "item.cinnabar.name", descriptionKey: "item.cinnabar.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  // Métaux natifs
  native_copper: { stackable: true, nameKey: "item.native_copper.name", descriptionKey: "item.native_copper.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_metal_nuggets_1_beacon" },
  native_silver: { stackable: true, nameKey: "item.native_silver.name", descriptionKey: "item.native_silver.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_metal_nuggets_1_beacon" },
  gold_nugget: { stackable: true, nameKey: "item.gold_nugget.name", descriptionKey: "item.gold_nugget.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_metal_nuggets_1_beacon" },
  platinum_nugget: { stackable: true, nameKey: "item.platinum_nugget.name", descriptionKey: "item.platinum_nugget.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_metal_nuggets_1_beacon" },
  iron_meteorite: { stackable: true, nameKey: "item.iron_meteorite.name", descriptionKey: "item.iron_meteorite.description", value: 100, rarity: 5, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  // Minéraux et cristaux
  quartz: { stackable: true, nameKey: "item.quartz.name", descriptionKey: "item.quartz.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  calcite: { stackable: true, nameKey: "item.calcite.name", descriptionKey: "item.calcite.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  mica: { stackable: true, nameKey: "item.mica.name", descriptionKey: "item.mica.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  talc: { stackable: true, nameKey: "item.talc.name", descriptionKey: "item.talc.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_crumbly_stone_1_beacon" },
  gypsum: { stackable: true, nameKey: "item.gypsum.name", descriptionKey: "item.gypsum.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_crumbly_stone_1_beacon" },
  halite: { stackable: true, nameKey: "item.halite.name", descriptionKey: "item.halite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  sulfur: { stackable: true, nameKey: "item.sulfur.name", descriptionKey: "item.sulfur.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_crumbly_stone_1_beacon" },
  fluorite: { stackable: true, nameKey: "item.fluorite.name", descriptionKey: "item.fluorite.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  // Pierres fines
  rose_quartz: { stackable: true, nameKey: "item.rose_quartz.name", descriptionKey: "item.rose_quartz.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  jasper: { stackable: true, nameKey: "item.jasper.name", descriptionKey: "item.jasper.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  amethyst: { stackable: true, nameKey: "item.amethyst.name", descriptionKey: "item.amethyst.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  agate: { stackable: true, nameKey: "item.agate.name", descriptionKey: "item.agate.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  tigers_eye: { stackable: true, nameKey: "item.tigers_eye.name", descriptionKey: "item.tigers_eye.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  malachite: { stackable: true, nameKey: "item.malachite.name", descriptionKey: "item.malachite.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  turquoise: { stackable: true, nameKey: "item.turquoise.name", descriptionKey: "item.turquoise.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  lapis_lazuli: { stackable: true, nameKey: "item.lapis_lazuli.name", descriptionKey: "item.lapis_lazuli.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  // Pierres précieuses
  garnet: { stackable: true, nameKey: "item.garnet.name", descriptionKey: "item.garnet.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  opal: { stackable: true, nameKey: "item.opal.name", descriptionKey: "item.opal.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  ruby: { stackable: true, nameKey: "item.ruby.name", descriptionKey: "item.ruby.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  sapphire: { stackable: true, nameKey: "item.sapphire.name", descriptionKey: "item.sapphire.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  emerald: { stackable: true, nameKey: "item.emerald.name", descriptionKey: "item.emerald.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  alexandrite: { stackable: true, nameKey: "item.alexandrite.name", descriptionKey: "item.alexandrite.description", value: 100, rarity: 5, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  rough_diamond: { stackable: true, nameKey: "item.rough_diamond.name", descriptionKey: "item.rough_diamond.description", value: 100, rarity: 5, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  geode: { stackable: true, nameKey: "item.geode.name", descriptionKey: "item.geode.description", value: 100, rarity: 5, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  // Fossiles et curiosités
  ammonite: { stackable: true, nameKey: "item.ammonite.name", descriptionKey: "item.ammonite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_fossile_1_beacon" },
  shark_tooth: { stackable: true, nameKey: "item.shark_tooth.name", descriptionKey: "item.shark_tooth.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_fossile_1_beacon" },
  fern_fossil: { stackable: true, nameKey: "item.fern_fossil.name", descriptionKey: "item.fern_fossil.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  trilobite: { stackable: true, nameKey: "item.trilobite.name", descriptionKey: "item.trilobite.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_fossile_1_beacon" },
  amber: { stackable: true, nameKey: "item.amber.name", descriptionKey: "item.amber.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  fulgurite: { stackable: true, nameKey: "item.fulgurite.name", descriptionKey: "item.fulgurite.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_glass_stone_1_beacon" },
  fossil_egg: { stackable: true, nameKey: "item.fossil_egg.name", descriptionKey: "item.fossil_egg.description", value: 100, rarity: 5, tags: ["mineral"], sound: "assets/sounds/items/mineral_fossile_1_beacon" },
};
