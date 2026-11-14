// Boîte à outils des billes : l'option --definition des outils au terminal
// (simulateur, partie au terminal). Sa valeur est l'id d'une définition du registre
// (marbles/content/definitions/), ou le chemin d'un fichier JSON qui en décrit une, de
// la même forme (marbles/core/definitions.js, en-tête), validée à la création de la
// partie. Sans l'option : la définition du jeu. Node seulement.

import { readFile } from "node:fs/promises";
import { DEFAULT_GAME_DEFINITION, GAME_RULES, definitionById, gameSetup } from "./game-rules.js";

export async function readDefinitionOption(value) {
  if (value === undefined) return DEFAULT_GAME_DEFINITION;
  if (!value.endsWith(".json")) return definitionById(value);
  let definition;
  try {
    definition = JSON.parse(await readFile(value, "utf-8"));
  } catch (error) {
    throw new Error(`définition illisible "${value}" : ${error.message}`);
  }
  // Validée tout de suite, par le départ d'une partie avec le sac de sa définition :
  // une erreur claire avant de jouer.
  const setup = gameSetup(definition);
  GAME_RULES.createGame(0, setup.definition, setup.options);
  return definition;
}
