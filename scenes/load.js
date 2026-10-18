// Chargeur de scène AU BORD : fetch + parsing JSON, hors du core. La
// validation/normalisation reste dans core/scene.js (parseScene), pure et
// testable sans réseau.

import { parseScene } from "../core/scene.js";
import scenePaths from "./index.js";

export async function loadScene(url, registry) {
  let response;
  try {
    // "no-cache" : le navigateur redemande TOUJOURS au serveur si le fichier
    // a changé (réponse 304 sans contenu s'il n'a pas bougé, donc presque
    // gratuit). Sans ça, une scène modifiée peut se charger dans une
    // version gardée en cache, en développement comme pour les joueurs
    // après une mise à jour publiée.
    response = await fetch(url, { cache: "no-cache" });
  } catch (error) {
    throw new Error(`loadScene: échec réseau pour "${url}" : ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`loadScene: réponse HTTP ${response.status} pour "${url}".`);
  }

  let raw;
  try {
    raw = await response.json();
  } catch (error) {
    throw new Error(`loadScene: JSON invalide dans "${url}" : ${error.message}`);
  }

  return parseScene(raw, registry);
}

// Charge une scène par SON ID (ex. target d'une porte, voir
// doc/scene-format.md) plutôt que par chemin explicite — résout l'id via
// scenes/index.js, puis délègue à loadScene.
export async function loadSceneById(id, registry) {
  const url = scenePaths[id];
  if (!url) {
    throw new Error(`loadSceneById: id de scène "${id}" absent du registre (scenes/index.js).`);
  }
  return loadScene(url, registry);
}
