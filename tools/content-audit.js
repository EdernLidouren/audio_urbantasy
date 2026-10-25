// AUDIT DU CONTENU — outil de développement, jamais chargé par le jeu.
// Vérifie d'un coup tout ce que le contenu CITE, au lieu de le découvrir en
// jouant (une scène n'est chargée qu'à sa première visite, une clé i18n
// absente n'est qu'un avertissement en console et se lit brute au lecteur
// d'écran, un son introuvable n'échoue qu'au moment d'être joué) :
//   - chaque scène de scenes/index.js se charge (parseScene, vrai registre),
//     porte l'id de son entrée et un titre `scene.<id>.name`, et le
//     registre des types d'entité lui-même est valide ;
//   - chaque cible de "teleport", chaque scène de la carte de la ville et la
//     scène de départ existent dans scenes/index.js ;
//   - les scènes principales (MAIN_SCENE_IDS) existent, chaque case de la
//     carte pointe vers l'une d'elles, et une action "confirm" ne relie que
//     deux d'entre elles (la préférence confirmSceneChange porte sur les
//     changements de scène principale, jamais sur une sous-scène) ;
//   - chaque scène est soit principale, soit rattachée à une scène
//     principale (MAIN_SCENE_OF), jamais les deux ni aucune ;
//   - chaque nom passé par référence à un gabarit (NAME_SLOTS) porte, dans
//     chaque langue, toutes les formes que ce gabarit demande ({scene:def}) ;
//   - chaque clé i18n citée existe en fr ET en en ;
//   - chaque son cité (chemin "assets/...") existe dans le manifeste audio.
//
// Utilisation, depuis la console du jeu (serveur de dev lancé) :
//   const a = await import("/tools/content-audit.js");
//   await a.auditContent();
// Rend { problems, sources } et affiche les problèmes en console (rien si
// tout va bien). Chaque problème : { source, where, kind, detail }.
//
// Sources parcourues : les scènes (JSON brut), le registre des types
// d'entité, le joueur, les objets, les améliorations, les collections, la
// carte de la ville, le départ de partie, la météo, la perception et les
// catalogues des boutiques.
//
// Repérage : toute valeur chaîne, à n'importe quelle profondeur. Une CLÉ
// i18n est une chaîne pointée en minuscules dont le premier segment est un
// espace de noms des tables de traduction (ex. "entity.dog.name") ; un SON
// est une chaîne qui commence par "assets/". Limites : une clé ou un chemin
// COMPOSÉ par le code (ex. le pas d'une surface, "<namespace>.name" déduit
// d'un id) n'apparaît dans aucune donnée et n'est donc pas vérifié ici.

import registry from "../entities/types/index.js";
import player from "../entities/player.js";
import scenePaths, { MAIN_SCENE_IDS, MAIN_SCENE_OF } from "../scenes/index.js";
import collections from "../collections/index.js";
import { parseScene } from "../core/scene.js";
import { validateEntityRegistry } from "../core/entity-parse.js";
import { ITEM_REGISTRY } from "../core/items.js";
import { IMPROVEMENT_REGISTRY } from "../core/improvements.js";
import { collectionNameKey, entryTextKeys } from "../core/collections.js";
import { CITY_MAP_GRID } from "../map/city-map.js";
import { NEW_GAME } from "../config/new-game.js";
import { WEATHER_STATES } from "../config/weather-values.js";
import { PERCEPTION_MUSIC_POOL, PERCEPTION_AMBIENCE_POOL } from "../config/perception.js";
import { SHOP_CATALOGS } from "../config/shop-values.js";
import { LOCALE_TABLES } from "../data/i18n/index.js";
import { configureAssetManifest, hasAsset } from "../lib/assets.js";

const KEY_PATTERN = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;

// Gabarits qui reçoivent un NOM par référence (nameRef), et les clés de nom
// qu'ils peuvent recevoir : le jeu ne saurait le dire avant d'afficher, il
// est déclaré ici pour que l'audit vérifie les formes en amont (en jeu, une
// forme absente retombe sur la base, signalée). Un nouvel appel de nameRef
// dans la vue ajoute sa ligne ici.
const NAME_SLOTS = [
  // view/interaction.js/confirmationParams : la scène cible d'une action
  // "confirm", toujours une scène principale (vérifié plus bas).
  { template: "interaction.travelConfirm", param: "scene", names: () => MAIN_SCENE_IDS.map((id) => `scene.${id}.name`) },
];

// Formes que `template` demande pour le paramètre `param` : chaque
// « {param:forme} », où qu'il soit (branches comprises).
function formsRequested(template, param) {
  const pattern = new RegExp(`\\{\\s*${param}:(\\w+)\\s*\\}`, "g");
  return [...String(template).matchAll(pattern)].map((match) => match[1]);
}

// Parcourt `value` en profondeur et appelle visit(chaîne, chemin) pour
// chaque chaîne, et visitObject(objet, chemin) pour chaque objet. Le chemin
// ("entities[3].sounds.beacon.path") sert à localiser le problème.
function walk(value, path, visit, visitObject) {
  if (typeof value === "string") {
    visit(value, path);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit, visitObject));
  } else if (value && typeof value === "object") {
    if (visitObject) visitObject(value, path);
    for (const [key, item] of Object.entries(value)) {
      walk(item, path ? `${path}.${key}` : key, visit, visitObject);
    }
  }
}

async function loadManifest() {
  const response = await fetch("assets/manifest.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`content-audit : manifeste audio illisible (HTTP ${response.status}).`);
  configureAssetManifest(await response.json());
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`réponse HTTP ${response.status} pour "${url}"`);
  return response.json();
}

export async function auditContent() {
  await loadManifest();
  const problems = [];
  const report = (source, where, kind, detail) => problems.push({ source, where, kind, detail });

  const namespaces = new Set(Object.values(LOCALE_TABLES).flatMap((table) => Object.keys(table).map((key) => key.split(".")[0])));
  const isKey = (text) => KEY_PATTERN.test(text) && namespaces.has(text.split(".")[0]);
  const sceneExists = (id) => Object.hasOwn(scenePaths, id);
  const isMainScene = (id) => MAIN_SCENE_IDS.includes(id);

  for (const id of MAIN_SCENE_IDS) {
    if (!sceneExists(id)) report("scènes principales", "MAIN_SCENE_IDS", "scène inconnue", id);
  }
  // Rattachement : la carte s'ouvre sur la scène principale d'une
  // sous-scène (view/menus/city-map-menu.js), aucune ne doit en manquer.
  for (const [id, mainId] of Object.entries(MAIN_SCENE_OF)) {
    if (!sceneExists(id)) report("scènes principales", `MAIN_SCENE_OF.${id}`, "scène inconnue", id);
    if (isMainScene(id)) report("scènes principales", `MAIN_SCENE_OF.${id}`, "scène principale rattachée", id);
    if (!isMainScene(mainId)) report("scènes principales", `MAIN_SCENE_OF.${id}`, "rattachée à une sous-scène", mainId);
  }
  for (const id of Object.keys(scenePaths)) {
    if (!isMainScene(id) && !Object.hasOwn(MAIN_SCENE_OF, id)) {
      report("scènes principales", "MAIN_SCENE_OF", "sous-scène sans scène principale", id);
    }
  }

  // Une action "confirm" demande « Partir vers ... ? » sous la préférence
  // confirmSceneChange : elle n'a de sens qu'entre deux scènes principales.
  // Sa forme (un seul "teleport") est déjà vérifiée par parseScene.
  function checkConfirmedActions(sceneId, raw) {
    walk(raw, "", () => {}, (object, where) => {
      if (object.confirm !== true || !Array.isArray(object.effects)) return;
      if (!isMainScene(sceneId)) report(`scène ${sceneId}`, where, "confirmation hors scène principale", sceneId);
      for (const effect of object.effects) {
        if (effect.type === "teleport" && !isMainScene(effect.target)) {
          report(`scène ${sceneId}`, where, "confirmation vers une sous-scène", effect.target);
        }
      }
    });
  }

  // Clés et sons d'une source, à n'importe quelle profondeur.
  function checkStrings(source, value, path = "") {
    walk(
      value,
      path,
      (text, where) => {
        if (text.startsWith("assets/")) {
          if (!hasAsset(text)) report(source, where, "son introuvable", text);
        } else if (isKey(text)) {
          const missing = Object.keys(LOCALE_TABLES).filter((lang) => LOCALE_TABLES[lang][text] === undefined);
          if (missing.length > 0) report(source, where, `clé i18n absente (${missing.join(", ")})`, text);
        }
      },
      (object, where) => {
        if (object.type === "teleport" && typeof object.target === "string" && !sceneExists(object.target)) {
          report(source, where, "scène cible inconnue", object.target);
        }
      }
    );
  }

  // Scènes : chargement réel (une erreur par scène, celle que verrait le
  // jeu), puis références du JSON brut, même si la scène est invalide.
  for (const [id, url] of Object.entries(scenePaths)) {
    const source = `scène ${id}`;
    let raw;
    try {
      raw = await fetchJson(url);
    } catch (error) {
      report(source, url, "fichier illisible", error.message);
      continue;
    }
    try {
      parseScene(raw, registry);
    } catch (error) {
      report(source, url, "scène invalide", error.message);
    }
    // Un id absent prendrait le défaut de parseScene ("scene") : la scène se
    // chargerait, mais sous un autre nom que celui de scenes/index.js.
    if (raw.id !== id) report(source, "id", "id absent ou différent de scenes/index.js", String(raw.id));
    // Convention de titre : la confirmation d'une sortie nomme la scène
    // cible par `scene.<id>.name` sans la charger (voir
    // view/interaction.js/confirmationParams).
    if (raw.titleKey !== `scene.${id}.name`) report(source, "titleKey", "titre hors convention scene.<id>.name", String(raw.titleKey));
    checkStrings(source, raw);
    checkConfirmedActions(id, raw);
  }

  try {
    validateEntityRegistry(registry);
  } catch (error) {
    report("types d'entité", "entities/types", "registre invalide", error.message);
  }
  checkStrings("types d'entité", registry);
  checkStrings("joueur", player);
  checkStrings("objets", ITEM_REGISTRY);
  checkStrings("améliorations", IMPROVEMENT_REGISTRY);
  checkStrings("météo", WEATHER_STATES);
  checkStrings("perception", { PERCEPTION_MUSIC_POOL, PERCEPTION_AMBIENCE_POOL });
  checkStrings("boutiques", SHOP_CATALOGS);

  // Collections : leurs clés sont DÉDUITES des ids (voir core/collections.js),
  // jamais écrites dans la donnée — on les reconstruit pour les vérifier.
  for (const [id, collection] of Object.entries(collections)) {
    const keys = [collectionNameKey(id)];
    for (const { item } of collection.entries) {
      const { nameKey, descriptionKey } = entryTextKeys(id, item);
      keys.push(nameKey, descriptionKey);
    }
    checkStrings(`collection ${id}`, keys);
  }

  CITY_MAP_GRID.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell.sceneId !== undefined && !sceneExists(cell.sceneId)) {
        report("carte de la ville", `[${x}, ${y}]`, "scène inconnue", cell.sceneId);
      } else if (cell.sceneId !== undefined && !isMainScene(cell.sceneId)) {
        report("carte de la ville", `[${x}, ${y}]`, "sous-scène sur la carte", cell.sceneId);
      }
    })
  );
  checkStrings("carte de la ville", CITY_MAP_GRID);

  for (const { template, param, names } of NAME_SLOTS) {
    for (const [lang, table] of Object.entries(LOCALE_TABLES)) {
      const forms = formsRequested(table[template], param);
      for (const nameKey of names()) {
        const value = table[nameKey];
        for (const form of forms) {
          if (value === undefined || typeof value === "string" || typeof value[form] !== "string") {
            report("formes de nom", `${lang} ${template}`, `forme « ${form} » absente`, nameKey);
          }
        }
      }
    }
  }

  if (!sceneExists(NEW_GAME.startSceneId)) report("départ", "startSceneId", "scène inconnue", NEW_GAME.startSceneId);
  checkStrings("départ", NEW_GAME);

  if (problems.length === 0) {
    console.log("Audit du contenu : aucun problème.");
  } else {
    console.warn(`Audit du contenu : ${problems.length} problème(s).`);
    console.table(problems);
  }
  return { problems, sources: Object.keys(scenePaths).length };
}
