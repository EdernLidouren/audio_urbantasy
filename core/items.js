import { TAG_REGISTRY } from "./tags.js";
import { rejectUnknownFields } from "../lib/validate.js";

// Registre d'OBJETS DU SAC — données pures, CORE (comme SURFACE_REGISTRY,
// voir core/surfaces.js) : le core en a besoin STRUCTURELLEMENT pour
// décider comment une entrée de sac se comporte (empilable ou non, voir
// core/bag.js/addItem), pas seulement pour l'affichage — contrairement au
// registre de types d'entités (entities/types/index.js), contenu de RENDU
// pur que le core n'importe JAMAIS (un registre de contenu lui est
// injecté, jamais importé). label/descriptionKey sont lus par la VUE (menu d'inventaire,
// voir view/menus/inventory-menu.js) mais restent ici, dans ce MÊME
// registre : un objet et ses métadonnées d'affichage sont une seule et
// même donnée de contenu, pas deux registres séparés à garder synchronisés.
//
// EXTENSIBILITÉ (même esprit que SURFACE_REGISTRY) : `stackable`/`label`/
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
// `slot` : NOM du slot qu'il occupe (voir core/equipment.js/EQUIPMENT_SLOTS)
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
// core/equipment.js/equippedTags), une future vérification de contenu (PNJ,
// événement) les lit via la condition "hasEquipmentTag" (core/presence.js).
// Absent ou vide -> aucun tag.
//
// `value` (optionnel, entier > 0) : VALEUR de l'objet en pièces — prix de
// vente unitaire (voir core/trade.js/sellValueOf ; pleine valeur pour
// l'instant, la marge marchand viendra avec l'achat). Absente ou 0 -> objet
// NON VENDABLE (ex. une clé de quête), jamais listé au comptoir.
export const ITEM_REGISTRY = {
  apple: { stackable: true, label: "item.apple.name", descriptionKey: "item.apple.description", value: 5 },
  // Pièce : objet EMPILABLE du sac, distinct de session.money (voir
  // entities/types/coin.js vs money.js).
  coin: { stackable: true, label: "item.coin.name", descriptionKey: "item.coin.description", value: 1 },
  key_bronze: { stackable: false, label: "item.key_bronze.name", descriptionKey: "item.key_bronze.description" },
  sneakers: {
    stackable: false,
    label: "item.sneakers.name",
    descriptionKey: "item.sneakers.description",
    value: 20,
    equippable: true,
    slot: "feet",
    gait: "shoes",
  },
  leather_boots: {
    stackable: false,
    label: "item.leather_boots.name",
    descriptionKey: "item.leather_boots.description",
    value: 40,
    equippable: true,
    slot: "feet",
    gait: "boots",
  },
  combat_boots: {
    stackable: false,
    label: "item.combat_boots.name",
    descriptionKey: "item.combat_boots.description",
    value: 60,
    equippable: true,
    slot: "feet",
    gait: "boots",
    tags: ["military"],
  },
  high_heels: {
    stackable: false,
    label: "item.high_heels.name",
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
  resistor: { stackable: true, label: "item.resistor.name", descriptionKey: "item.resistor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  ceramic_capacitor: { stackable: true, label: "item.ceramic_capacitor.name", descriptionKey: "item.ceramic_capacitor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  electrolytic_capacitor: { stackable: true, label: "item.electrolytic_capacitor.name", descriptionKey: "item.electrolytic_capacitor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  inductor: { stackable: true, label: "item.inductor.name", descriptionKey: "item.inductor.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  quartz_crystal: { stackable: true, label: "item.quartz_crystal.name", descriptionKey: "item.quartz_crystal.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  ferrite_core: { stackable: true, label: "item.ferrite_core.name", descriptionKey: "item.ferrite_core.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_metal_1_beacon" },
  diode: { stackable: true, label: "item.diode.name", descriptionKey: "item.diode.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  led: { stackable: true, label: "item.led.name", descriptionKey: "item.led.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  transistor: { stackable: true, label: "item.transistor.name", descriptionKey: "item.transistor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  power_transistor: { stackable: true, label: "item.power_transistor.name", descriptionKey: "item.power_transistor.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_metal_1_beacon" },
  bridge_rectifier: { stackable: true, label: "item.bridge_rectifier.name", descriptionKey: "item.bridge_rectifier.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  laser_diode: { stackable: true, label: "item.laser_diode.name", descriptionKey: "item.laser_diode.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  timer_555: { stackable: true, label: "item.timer_555.name", descriptionKey: "item.timer_555.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  op_amp: { stackable: true, label: "item.op_amp.name", descriptionKey: "item.op_amp.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  sim_card: { stackable: true, label: "item.sim_card.name", descriptionKey: "item.sim_card.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  ram_module: { stackable: true, label: "item.ram_module.name", descriptionKey: "item.ram_module.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  microcontroller: { stackable: true, label: "item.microcontroller.name", descriptionKey: "item.microcontroller.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  cpu: { stackable: true, label: "item.cpu.name", descriptionKey: "item.cpu.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_metal_1_beacon" },
  uv_eprom: { stackable: true, label: "item.uv_eprom.name", descriptionKey: "item.uv_eprom.description", value: 80, rarity: 4, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  relay: { stackable: true, label: "item.relay.name", descriptionKey: "item.relay.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  toggle_switch: { stackable: true, label: "item.toggle_switch.name", descriptionKey: "item.toggle_switch.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  potentiometer: { stackable: true, label: "item.potentiometer.name", descriptionKey: "item.potentiometer.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  rotary_switch: { stackable: true, label: "item.rotary_switch.name", descriptionKey: "item.rotary_switch.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  vibration_motor: { stackable: true, label: "item.vibration_motor.name", descriptionKey: "item.vibration_motor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_motor_1_beacon" },
  cooling_fan: { stackable: true, label: "item.cooling_fan.name", descriptionKey: "item.cooling_fan.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_motor_1_beacon" },
  stepper_motor: { stackable: true, label: "item.stepper_motor.name", descriptionKey: "item.stepper_motor.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_motor_1_beacon" },
  piezo_buzzer: { stackable: true, label: "item.piezo_buzzer.name", descriptionKey: "item.piezo_buzzer.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_beep_1_beacon" },
  small_speaker: { stackable: true, label: "item.small_speaker.name", descriptionKey: "item.small_speaker.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_radio_1_beacon" },
  photoresistor: { stackable: true, label: "item.photoresistor.name", descriptionKey: "item.photoresistor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  thermistor: { stackable: true, label: "item.thermistor.name", descriptionKey: "item.thermistor.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  electret_microphone: { stackable: true, label: "item.electret_microphone.name", descriptionKey: "item.electret_microphone.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  pir_sensor: { stackable: true, label: "item.pir_sensor.name", descriptionKey: "item.pir_sensor.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  hall_sensor: { stackable: true, label: "item.hall_sensor.name", descriptionKey: "item.hall_sensor.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  tilt_switch: { stackable: true, label: "item.tilt_switch.name", descriptionKey: "item.tilt_switch.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  mercury_switch: { stackable: true, label: "item.mercury_switch.name", descriptionKey: "item.mercury_switch.description", value: 80, rarity: 4, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  coin_cell: { stackable: true, label: "item.coin_cell.name", descriptionKey: "item.coin_cell.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  nine_volt_battery: { stackable: true, label: "item.nine_volt_battery.name", descriptionKey: "item.nine_volt_battery.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_static_1_beacon" },
  phone_battery: { stackable: true, label: "item.phone_battery.name", descriptionKey: "item.phone_battery.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_plastic_1_beacon" },
  solar_cell: { stackable: true, label: "item.solar_cell.name", descriptionKey: "item.solar_cell.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  small_transformer: { stackable: true, label: "item.small_transformer.name", descriptionKey: "item.small_transformer.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_power_1_beacon" },
  supercapacitor: { stackable: true, label: "item.supercapacitor.name", descriptionKey: "item.supercapacitor.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  glass_fuse: { stackable: true, label: "item.glass_fuse.name", descriptionKey: "item.glass_fuse.description", value: 20, rarity: 1, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  dial_lamp: { stackable: true, label: "item.dial_lamp.name", descriptionKey: "item.dial_lamp.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  neon_indicator: { stackable: true, label: "item.neon_indicator.name", descriptionKey: "item.neon_indicator.description", value: 40, rarity: 2, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  variable_capacitor: { stackable: true, label: "item.variable_capacitor.name", descriptionKey: "item.variable_capacitor.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_switch_1_beacon" },
  vacuum_tube: { stackable: true, label: "item.vacuum_tube.name", descriptionKey: "item.vacuum_tube.description", value: 60, rarity: 3, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  nixie_tube: { stackable: true, label: "item.nixie_tube.name", descriptionKey: "item.nixie_tube.description", value: 80, rarity: 4, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  magic_eye: { stackable: true, label: "item.magic_eye.name", descriptionKey: "item.magic_eye.description", value: 100, rarity: 5, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_glass_1_beacon" },
  core_memory: { stackable: true, label: "item.core_memory.name", descriptionKey: "item.core_memory.description", value: 100, rarity: 5, tags: ["electronic"], sound: "assets/sounds/items/electronic_component_rattle_1_beacon" },
  // Minéraux — collection "minerals" (collections/minerals.js), générés
  // depuis la liste fournie par l'auteur, même modèle que les composants :
  // rarity 1 à 5, value = rarity × 20 (provisoire), étiquette "mineral",
  // sound parmi neuf (items/mineral_<son>_1_beacon).
  // Roches
  limestone: { stackable: true, label: "item.limestone.name", descriptionKey: "item.limestone.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  sandstone: { stackable: true, label: "item.sandstone.name", descriptionKey: "item.sandstone.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  flint: { stackable: true, label: "item.flint.name", descriptionKey: "item.flint.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  slate: { stackable: true, label: "item.slate.name", descriptionKey: "item.slate.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  granite: { stackable: true, label: "item.granite.name", descriptionKey: "item.granite.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  basalt: { stackable: true, label: "item.basalt.name", descriptionKey: "item.basalt.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  pumice: { stackable: true, label: "item.pumice.name", descriptionKey: "item.pumice.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  obsidian: { stackable: true, label: "item.obsidian.name", descriptionKey: "item.obsidian.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_glass_stone_1_beacon" },
  // Minerais
  hematite: { stackable: true, label: "item.hematite.name", descriptionKey: "item.hematite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  pyrite: { stackable: true, label: "item.pyrite.name", descriptionKey: "item.pyrite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  chalcopyrite: { stackable: true, label: "item.chalcopyrite.name", descriptionKey: "item.chalcopyrite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  bauxite: { stackable: true, label: "item.bauxite.name", descriptionKey: "item.bauxite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  magnetite: { stackable: true, label: "item.magnetite.name", descriptionKey: "item.magnetite.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  galena: { stackable: true, label: "item.galena.name", descriptionKey: "item.galena.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  cassiterite: { stackable: true, label: "item.cassiterite.name", descriptionKey: "item.cassiterite.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  cinnabar: { stackable: true, label: "item.cinnabar.name", descriptionKey: "item.cinnabar.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  // Métaux natifs
  native_copper: { stackable: true, label: "item.native_copper.name", descriptionKey: "item.native_copper.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_metal_nuggets_1_beacon" },
  native_silver: { stackable: true, label: "item.native_silver.name", descriptionKey: "item.native_silver.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_metal_nuggets_1_beacon" },
  gold_nugget: { stackable: true, label: "item.gold_nugget.name", descriptionKey: "item.gold_nugget.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_metal_nuggets_1_beacon" },
  platinum_nugget: { stackable: true, label: "item.platinum_nugget.name", descriptionKey: "item.platinum_nugget.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_metal_nuggets_1_beacon" },
  iron_meteorite: { stackable: true, label: "item.iron_meteorite.name", descriptionKey: "item.iron_meteorite.description", value: 100, rarity: 5, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_heavy_1_beacon" },
  // Minéraux et cristaux
  quartz: { stackable: true, label: "item.quartz.name", descriptionKey: "item.quartz.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  calcite: { stackable: true, label: "item.calcite.name", descriptionKey: "item.calcite.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  mica: { stackable: true, label: "item.mica.name", descriptionKey: "item.mica.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  talc: { stackable: true, label: "item.talc.name", descriptionKey: "item.talc.description", value: 20, rarity: 1, tags: ["mineral"], sound: "assets/sounds/items/mineral_crumbly_stone_1_beacon" },
  gypsum: { stackable: true, label: "item.gypsum.name", descriptionKey: "item.gypsum.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_crumbly_stone_1_beacon" },
  halite: { stackable: true, label: "item.halite.name", descriptionKey: "item.halite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  sulfur: { stackable: true, label: "item.sulfur.name", descriptionKey: "item.sulfur.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_crumbly_stone_1_beacon" },
  fluorite: { stackable: true, label: "item.fluorite.name", descriptionKey: "item.fluorite.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  // Pierres fines
  rose_quartz: { stackable: true, label: "item.rose_quartz.name", descriptionKey: "item.rose_quartz.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  jasper: { stackable: true, label: "item.jasper.name", descriptionKey: "item.jasper.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  amethyst: { stackable: true, label: "item.amethyst.name", descriptionKey: "item.amethyst.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  agate: { stackable: true, label: "item.agate.name", descriptionKey: "item.agate.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  tigers_eye: { stackable: true, label: "item.tigers_eye.name", descriptionKey: "item.tigers_eye.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  malachite: { stackable: true, label: "item.malachite.name", descriptionKey: "item.malachite.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  turquoise: { stackable: true, label: "item.turquoise.name", descriptionKey: "item.turquoise.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  lapis_lazuli: { stackable: true, label: "item.lapis_lazuli.name", descriptionKey: "item.lapis_lazuli.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  // Pierres précieuses
  garnet: { stackable: true, label: "item.garnet.name", descriptionKey: "item.garnet.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  opal: { stackable: true, label: "item.opal.name", descriptionKey: "item.opal.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  ruby: { stackable: true, label: "item.ruby.name", descriptionKey: "item.ruby.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  sapphire: { stackable: true, label: "item.sapphire.name", descriptionKey: "item.sapphire.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  emerald: { stackable: true, label: "item.emerald.name", descriptionKey: "item.emerald.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  alexandrite: { stackable: true, label: "item.alexandrite.name", descriptionKey: "item.alexandrite.description", value: 100, rarity: 5, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  rough_diamond: { stackable: true, label: "item.rough_diamond.name", descriptionKey: "item.rough_diamond.description", value: 100, rarity: 5, tags: ["mineral"], sound: "assets/sounds/items/mineral_gemstone_1_beacon" },
  geode: { stackable: true, label: "item.geode.name", descriptionKey: "item.geode.description", value: 100, rarity: 5, tags: ["mineral"], sound: "assets/sounds/items/mineral_crystal_1_beacon" },
  // Fossiles et curiosités
  ammonite: { stackable: true, label: "item.ammonite.name", descriptionKey: "item.ammonite.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_fossile_1_beacon" },
  shark_tooth: { stackable: true, label: "item.shark_tooth.name", descriptionKey: "item.shark_tooth.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_fossile_1_beacon" },
  fern_fossil: { stackable: true, label: "item.fern_fossil.name", descriptionKey: "item.fern_fossil.description", value: 40, rarity: 2, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_medium_1_beacon" },
  trilobite: { stackable: true, label: "item.trilobite.name", descriptionKey: "item.trilobite.description", value: 60, rarity: 3, tags: ["mineral"], sound: "assets/sounds/items/mineral_fossile_1_beacon" },
  amber: { stackable: true, label: "item.amber.name", descriptionKey: "item.amber.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_stones_small_1_beacon" },
  fulgurite: { stackable: true, label: "item.fulgurite.name", descriptionKey: "item.fulgurite.description", value: 80, rarity: 4, tags: ["mineral"], sound: "assets/sounds/items/mineral_glass_stone_1_beacon" },
  fossil_egg: { stackable: true, label: "item.fossil_egg.name", descriptionKey: "item.fossil_egg.description", value: 100, rarity: 5, tags: ["mineral"], sound: "assets/sounds/items/mineral_fossile_1_beacon" },
};

// Propriétés d'UN objet par son type — point d'extension futur (même
// principe que core/surfaces.js/surfaceProps) : un appelant qui voudra lire
// `usable` demain appelle EXACTEMENT cette fonction, rien à ajouter ici.
// Type inconnu -> undefined, jamais d'exception (voir core/bag.js/addItem,
// qui s'en accommode déjà en dégradant sur "non empilable").
export function itemProps(type) {
  return ITEM_REGISTRY[type];
}

// Sons d'un objet AU SOL, déduits de son champ `sound` (un pool) : beacon en
// boucle, et le même son joué une fois au ramassage. Objet sans `sound` (ou
// inconnu) -> undefined : l'appelant garde alors les sons de l'archétype
// (générique "item", voir entities/types/item.js). Appelé par
// core/entity-parse.js/genericItemDefaults, par où passent toutes les
// façons dont un objet devient une entité : instance de scène, garnissage
// (core/spawn.js), objet posé depuis le sac (core/spawn.js/ephemeralItemSpec).
export function itemSounds(type) {
  const props = ITEM_REGISTRY[type];
  if (!props || !props.sound) return undefined;
  return { beacon: { path: props.sound, loop: true }, pickup: { path: props.sound } };
}

// Champs d'un objet (voir l'en-tête) ; tout autre champ est rejeté.
const ITEM_FIELDS = ["stackable", "label", "descriptionKey", "value", "rarity", "tags", "sound", "equippable", "slot", "gait"];

function failItems(message) {
  throw new Error(`core/items.js: ${message}`);
}

// Valide un registre d'objets : aucun champ inconnu (ITEM_FIELDS), et tout
// tag référencé par CHAQUE objet existe dans
// TAG_REGISTRY — même principe que la validation des surfaces contre
// SURFACE_REGISTRY (core/scene.js), mais ITEM_REGISTRY est du CODE, pas du
// contenu JSON passé à un parseur : ce module se valide donc LUI-MÊME, tout
// de suite (voir l'appel plus bas), plutôt que de dépendre d'un chemin de
// chargement externe. Exporté (plutôt qu'un IIFE anonyme) pour rester
// TESTABLE au terminal avec un registre de test (voir core/checks/inventory.check.js)
// sans avoir à corrompre ITEM_REGISTRY lui-même. Faute de frappe -> échec
// CLAIR (tag + objet concerné), jamais un mismatch silencieux découvert en
// jeu.
export function validateItemRegistry(registry) {
  for (const [type, props] of Object.entries(registry)) {
    rejectUnknownFields(props, ITEM_FIELDS, `objet "${type}"`, failItems);
    for (const tag of props.tags || []) {
      if (!TAG_REGISTRY[tag]) {
        throw new Error(`core/items.js: tag "${tag}" (objet "${type}") absent de TAG_REGISTRY.`);
      }
    }
  }
}

validateItemRegistry(ITEM_REGISTRY);

// Valeur marchande d'un type d'objet (`value` du registre) — 0 si l'objet
// est inconnu ou sans valeur entière positive. Lue par la vente (prix de
// rachat) et par l'achat (prix par défaut d'un article de catalogue).
export function itemValue(type) {
  const value = ITEM_REGISTRY[type] && ITEM_REGISTRY[type].value;
  return Number.isInteger(value) && value > 0 ? value : 0;
}
