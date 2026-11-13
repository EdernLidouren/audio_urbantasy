// Boîte à outils des billes : les RÈGLES du jeu, liées une fois pour toutes à la
// table des billes, à celle des statuts et aux définitions de partie
// (marbles/core/rules.js). Chaque outil est un programme à part ; celui-ci est leur
// point de composition commun, comme main.js pour le jeu. Pour mesurer une autre
// table (« et si l'argile donnait Vitesse 2 ? »), un outil crée ses propres règles
// avec createMarblesRules(saTable).
//
// Et ce que les outils font d'une définition : la trouver par son id, lui appliquer
// des SURCHARGES de valeurs (les options --hand-size, --turns… du simulateur, le champ
// `settings` d'un état construit). Pur, sans Node : la lecture d'une définition dans un
// fichier est l'affaire de marbles/tools/definition-option.js.

import { createMarblesRules } from "../core/rules.js";
import { START_KEYS } from "../core/definitions.js";
import MARBLE_TYPES from "../content/types/index.js";
import MARBLE_STATUSES from "../content/statuses/index.js";
import { DEFAULT_DEFINITION, GAME_DEFINITIONS } from "../content/definitions/index.js";

export const GAME_RULES = createMarblesRules(MARBLE_TYPES, MARBLE_STATUSES, GAME_DEFINITIONS);

// La définition que lance le jeu.
export const DEFAULT_GAME_DEFINITION = GAME_DEFINITIONS[DEFAULT_DEFINITION];

// Les valeurs qu'une surcharge peut changer, dans l'ordre du rapport du simulateur :
// les valeurs de départ (marbles/core/definitions.js, START_KEYS) et le nombre de tours.
export const SETTING_NAMES = ["handSize", "throws", "potCapacity", "firstTurnDraw", "drawPerTurn", "turns"];
if (SETTING_NAMES.filter((name) => name !== "turns").sort().join() !== [...START_KEYS].sort().join()) {
  throw new Error("outils des billes : SETTING_NAMES doit couvrir les valeurs de départ (START_KEYS).");
}

// La définition du registre nommée `id` ; inconnue : une erreur qui liste les autres.
export function definitionById(id) {
  if (!Object.hasOwn(GAME_RULES.definitions, id)) {
    throw new Error(`définition inconnue "${id}" (connues : ${Object.keys(GAME_RULES.definitions).join(", ")}).`);
  }
  return GAME_RULES.definitions[id];
}

// Une définition dont certaines valeurs sont SURCHARGÉES (`settings`, des noms de
// SETTING_NAMES) : une copie, la définition reçue reste intacte. Un nom inconnu lève ;
// les valeurs elles-mêmes sont validées à la création de la partie.
export function withSettings(definition, settings = {}) {
  for (const name of Object.keys(settings)) {
    if (!SETTING_NAMES.includes(name)) throw new Error(`réglage inconnu "${name}" (connus : ${SETTING_NAMES.join(", ")}).`);
  }
  const { turns, ...start } = settings;
  return { ...definition, start: { ...definition.start, ...start }, ...(turns === undefined ? {} : { turns }) };
}

// La valeur d'une définition pour un nom de SETTING_NAMES.
export function settingOf(definition, name) {
  return name === "turns" ? definition.turns : definition.start[name];
}

// Une définition dont le sac de départ est remplacé par cette liste d'ids.
export function withBag(definition, marbles) {
  return { ...definition, bag: { kind: "list", marbles } };
}
