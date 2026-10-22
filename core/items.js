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
