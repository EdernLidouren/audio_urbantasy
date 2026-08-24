// Chargeur de niveau AU BORD : fetch + parsing JSON, hors du core. La
// validation/normalisation reste dans core/level.js (parseLevel), pure et
// testable sans réseau.

import { parseLevel } from "../core/level.js";
import levelPaths from "./index.js";

export async function loadLevel(url, registry) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`loadLevel: échec réseau pour "${url}" : ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`loadLevel: réponse HTTP ${response.status} pour "${url}".`);
  }

  let raw;
  try {
    raw = await response.json();
  } catch (error) {
    throw new Error(`loadLevel: JSON invalide dans "${url}" : ${error.message}`);
  }

  return parseLevel(raw, registry);
}

// Charge un niveau par SON ID (ex. target d'une porte, voir
// level/schema.md) plutôt que par chemin explicite — résout l'id via
// level/index.js, puis délègue à loadLevel.
export async function loadLevelById(id, registry) {
  const url = levelPaths[id];
  if (!url) {
    throw new Error(`loadLevelById: id de niveau "${id}" absent du registre (level/index.js).`);
  }
  return loadLevel(url, registry);
}
