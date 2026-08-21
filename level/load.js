// Chargeur de niveau AU BORD : fetch + parsing JSON, hors du core. La
// validation/normalisation reste dans core/level.js (parseLevel), pure et
// testable sans réseau.

import { parseLevel } from "../core/level.js";

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
