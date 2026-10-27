// DÉPART d'une partie neuve : lit et valide la déclaration de départ
// (config/new-game.js) et la résout en options prêtes pour
// core/state.js/createInitialState. Même patron que parseScene(raw,
// registry) : le registre des types d'entité est INJECTÉ (le core ne
// l'importe jamais), et toute donnée invalide lève une erreur claire au
// chargement, jamais en jeu. Appelée une fois au démarrage par main.js.
// Pur.
//
// Forme résolue : { startSceneId, start }, où `start` porte money, bag
// (entrées de sac, forme de core/bag.js), equipment (slots, forme de
// core/equipment.js), companions (entités complètes, cascade de leur
// archétype comprise), partyVariables (déclarations brutes, validées ici,
// résolues par createInitialState comme pour tout appelant) et emotes
// (émotes connues, forme de session.emotes, voir core/emotes.js).

import { ITEM_REGISTRY } from "./items.js";
import { EQUIPMENT_SLOTS, createEmptyEquipment } from "./equipment.js";
import { addItem } from "./bag.js";
import { parseEntity } from "./entity-parse.js";
import { parseVariables } from "./variables.js";
import { isNonEmptyString } from "./parse-common.js";
import { rejectUnknownFields as rejectUnknown } from "../lib/validate.js";
import { MAX_COMPANIONS } from "../config/companions.js";
import { EMOTE_REGISTRY, learnEmote } from "./emotes.js";

const FIELDS = ["startSceneId", "money", "bag", "equipment", "companions", "partyVariables", "emotes"];
const BAG_ENTRY_FIELDS = ["type", "count"];

function fail(message) {
  throw new Error(`parseNewGame: ${message}`);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(value, allowed, describe) {
  rejectUnknown(value, allowed, describe, fail);
}

// Déclaré `[{ type, count }]` (count : 1 par défaut), résolu par addItem
// comme n'importe quel ajout en jeu : un objet empilable donne une entrée
// avec quantité, un objet non empilable une entrée par exemplaire.
function parseBag(bag) {
  if (!Array.isArray(bag)) fail("bag doit être un tableau.");
  let inventory = { bag: [] };
  bag.forEach((entry, index) => {
    const describe = `bag[${index}]`;
    if (!isPlainObject(entry)) fail(`${describe} doit être un objet { type, count }.`);
    rejectUnknownFields(entry, BAG_ENTRY_FIELDS, describe);
    const { type, count = 1 } = entry;
    if (!Object.hasOwn(ITEM_REGISTRY, type)) fail(`${describe} : objet "${type}" absent de core/items.js.`);
    if (!Number.isInteger(count) || count < 1) fail(`${describe} : count doit être un entier >= 1.`);
    inventory = addItem(inventory, type, count);
  });
  return inventory.bag;
}

// Déclaré `{ <slot>: "<objet>" }` : chaque objet doit exister, être
// équipable et aller dans CE slot. Les slots non déclarés restent vides.
function parseEquipment(equipment) {
  if (!isPlainObject(equipment)) fail("equipment doit être un objet { <slot>: <objet> }.");
  const resolved = createEmptyEquipment();
  for (const [slot, type] of Object.entries(equipment)) {
    if (!EQUIPMENT_SLOTS.includes(slot)) fail(`equipment : slot "${slot}" inconnu (${EQUIPMENT_SLOTS.join(" | ")}).`);
    const props = ITEM_REGISTRY[type];
    if (!props) fail(`equipment.${slot} : objet "${type}" absent de core/items.js.`);
    if (!props.equippable || props.slot !== slot) fail(`equipment.${slot} : "${type}" ne s'équipe pas dans ce slot.`);
    resolved[slot] = { type };
  }
  return resolved;
}

// Un compagnon se déclare comme une entité de scène, SANS `x` : il est
// toujours placé près du joueur (core/state.js/repositionCompanions). Même
// parseur qu'une entité de scène, donc même cascade depuis son archétype
// (sons, capacités) — jamais une copie à tenir à jour. Hors de toute scène :
// aucune variable de scène à sa portée.
function parseCompanions(companions, registry) {
  if (!Array.isArray(companions)) fail("companions doit être un tableau.");
  if (companions.length > MAX_COMPANIONS) {
    fail(`companions : ${companions.length} compagnons déclarés, au plus ${MAX_COMPANIONS} (config/companions.js).`);
  }
  const seenIds = new Set();
  return companions.map((raw, index) => {
    if (!isPlainObject(raw)) fail(`companions[${index}] doit être un objet.`);
    if (raw.x !== undefined) fail(`companions[${index}] : pas de x, un compagnon est placé près du joueur.`);
    try {
      return parseEntity({ ...raw, x: 0 }, index, registry, 0, seenIds, {});
    } catch (error) {
      // Message du parseur d'entité, préfixé par "parseScene:" : on le
      // garde, mais on dit où chercher.
      fail(`companions[${index}] : ${error.message.replace(/^parseScene: /, "")}`);
    }
  });
}

// Déclaré `["<id>", ...]` : chaque émote doit exister dans le registre,
// une seule fois. Résolu par learnEmote, comme un apprentissage en jeu.
function parseEmotes(emotes) {
  if (!Array.isArray(emotes)) fail("emotes doit être un tableau d'ids d'émote.");
  let known = {};
  emotes.forEach((id, index) => {
    if (!Object.hasOwn(EMOTE_REGISTRY, id)) fail(`emotes[${index}] : émote "${id}" absente de core/emotes.js.`);
    if (known[id]) fail(`emotes[${index}] : émote "${id}" déclarée deux fois.`);
    known = learnEmote(known, id);
  });
  return known;
}

export function parseNewGame(raw, registry) {
  if (!isPlainObject(raw)) fail("le départ doit être un objet.");
  rejectUnknownFields(raw, FIELDS, "départ");
  const { startSceneId, money = 0, bag = [], equipment = {}, companions = [], partyVariables, emotes = [] } = raw;

  if (!isNonEmptyString(startSceneId)) fail("startSceneId est requis (id de scène, voir scenes/index.js).");
  if (!Number.isInteger(money) || money < 0) fail("money doit être un entier >= 0.");
  parseVariables(partyVariables, "partyVariables", fail);

  return {
    startSceneId,
    start: {
      money,
      bag: parseBag(bag),
      equipment: parseEquipment(equipment),
      companions: parseCompanions(companions, registry),
      partyVariables,
      emotes: parseEmotes(emotes),
    },
  };
}
