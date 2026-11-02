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
//   - chaque raccourci clavier (tables déclarées par lib/input.js/
//     defineBindings) a sa description d'aide "help.<table>.<action>" et le
//     nom de ses touches dans chaque langue, et aucune description d'aide
//     ne reste sans raccourci ;
//   - chaque série de messages en rotation (rotations/) est valide, a le
//     texte de chacun de ses messages dans chaque langue, et aucun texte
//     "rotation.*" ne reste sans série ; chaque archétype qui cite une série
//     la trouve, et sa description (comme celle de ses instances) porte
//     {message} dans chaque langue — l'inverse, {message} sans série, se
//     lirait brut ;
//   - chaque clé i18n citée existe en fr ET en en ;
//   - chaque son cité (chemin "assets/...") existe dans le manifeste audio.
//
// AVERTISSEMENTS, qui ne font pas échouer l'audit : un id d'entité hors de
// la convention de nommage (doc/scene-format.md/"Nommer les ids d'entités" :
// `<nom>_<n>`, ou `<nom>_<n>_r` / `<nom>_<n>_v` selon la face). Les scènes
// de test (la démo et ses sous-scènes) en sont exemptées : leurs ids sont
// cités tels quels par la trace audio et par la doc.
//
// Utilisation, depuis la console du jeu (serveur de dev lancé) :
//   const a = await import("/tools/content-audit.js");
//   await a.auditContent();
// Rend { problems, warnings, sources } et affiche problèmes et
// avertissements en console (rien si tout va bien). Chaque entrée :
// { source, where, kind, detail }.
//
// Sources parcourues : les scènes (JSON brut), le registre des types
// d'entité, le joueur, les objets, les améliorations, les collections, les
// séries de messages en rotation, la carte de la ville, le départ de partie,
// la météo, la perception et les catalogues des boutiques.
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
import rotations from "../rotations/index.js";
import { parseScene } from "../core/scene.js";
import { validateEntityRegistry, entityEffectLists } from "../core/entity-parse.js";
import { ITEM_REGISTRY } from "../core/items.js";
import { IMPROVEMENT_REGISTRY } from "../core/improvements.js";
import { EMOTE_REGISTRY } from "../core/emotes.js";
import { collectionNameKey, entryTextKeys } from "../core/collections.js";
import { validateRotation, rotationTextKey } from "../core/rotation.js";
import { CITY_MAP_GRID } from "../map/city-map.js";
import { NEW_GAME } from "../config/new-game.js";
import { WEATHER_STATES } from "../config/weather-values.js";
import { PERCEPTION_MUSIC_POOL, PERCEPTION_AMBIENCE_POOL } from "../config/perception.js";
import { SHOP_CATALOGS, DISPLAY_ARTICLES } from "../config/shop-values.js";
import { LOCALE_TABLES } from "../data/i18n/index.js";
import { configureAssetManifest, hasAsset } from "../lib/assets.js";
import { bindingTableIds, bindingTable, needsKeyName, keyNameKey } from "../lib/input.js";
import { helpKey } from "../lib/help.js";
// Modules qui DÉCLARENT les tables de raccourcis (defineBindings, à leur
// chargement) : importés ici pour que l'audit les voie toutes. Une nouvelle
// table dans un autre module ajoute son import à cette liste.
import "../view/input.js";
import "../lib/menu.js";
import "../view/menus/city-map-menu.js";
import "../view/menus/inventory-menu.js";
import "../view/menus/inventory/bag-and-equipment.js";
import "../view/menus/shop-quantity-list.js";

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
  // view/emotes.js/chooseShortcut : l'émote placée en raccourci.
  { template: "emote.shortcutSet", param: "emote", names: () => Object.values(EMOTE_REGISTRY).map((emote) => emote.nameKey) },
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
  const warnings = [];
  const warn = (source, where, kind, detail) => warnings.push({ source, where, kind, detail });

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

  // Provenance d'un "playSound" (`at`, voir doc/scripting.md/"playSound") :
  // l'entité visée doit exister dans la scène (une face ou l'autre, le son
  // traverse) ou être un compagnon du départ ; un son de RÔLE doit être un
  // rôle qu'elle a. Le chargement ne peut pas le vérifier : il lit une
  // entité à la fois. Rôle chez un compagnon : non vérifié ici.
  const companionIds = new Set((NEW_GAME.companions || []).map((companion) => companion.id));
  function checkPlaySoundTargets(source, scene) {
    const entities = scene.recto ? [...scene.recto.entities, ...scene.verso.entities] : scene.entities;
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    for (const entity of entities) {
      for (const [where, effects] of entityEffectLists(entity)) {
        effects.forEach((effect, i) => {
          if (effect.type !== "playSound" || effect.at === undefined) return;
          const at = `${entity.id}.${where}[${i}]`;
          const target = byId.get(effect.at);
          if (!target) {
            if (!companionIds.has(effect.at)) report(source, at, "cible at inconnue", effect.at);
            return;
          }
          if (effect.role !== undefined && !(target.sounds && target.sounds[effect.role])) {
            report(source, at, `rôle "${effect.role}" absent de la cible`, effect.at);
          }
        });
      }
    }
  }

  // Description d'une entité qui affiche une série (ou qui devrait) : le
  // gabarit doit porter {message} dans chaque langue si son type cite une
  // série, et jamais sinon (le placeholder se lirait brut).
  const MESSAGE_PLACEHOLDER = /\{\s*message\s*\}/;
  function checkMessagePlaceholder(source, where, type, descriptionKey) {
    if (typeof descriptionKey !== "string" || !registry[type]) return;
    const expected = registry[type].messageRotation !== undefined;
    for (const [lang, table] of Object.entries(LOCALE_TABLES)) {
      const text = table[descriptionKey];
      if (typeof text !== "string") continue;
      if (expected && !MESSAGE_PLACEHOLDER.test(text)) report(source, where, `{message} absent de la description (${lang})`, descriptionKey);
      if (!expected && MESSAGE_PLACEHOLDER.test(text)) report(source, where, `{message} sans série de messages (${lang})`, descriptionKey);
    }
  }

  // Convention de nommage des ids (voir l'en-tête) : un avertissement par
  // id qui s'en écarte. `<nom>` : mots en minuscules séparés par "_",
  // `<n>` : l'occurrence, toujours écrite.
  const isTestScene = (id) => id === "demo" || MAIN_SCENE_OF[id] === "demo";
  function checkIdConvention(sceneId, raw) {
    if (isTestScene(sceneId)) return;
    const faces = raw.recto || raw.verso ? [["recto", "_r"], ["verso", "_v"]] : [[null, ""]];
    for (const [side, suffix] of faces) {
      const face = side ? raw[side] : raw;
      const pattern = new RegExp(`^[a-z0-9]+(?:_[a-z0-9]+)*_\\d+${suffix}$`);
      for (const entity of face?.entities ?? []) {
        if (typeof entity.id === "string" && !pattern.test(entity.id)) {
          const expected = side ? `<nom>_<n>${suffix} (${side})` : "<nom>_<n>";
          warn(`scène ${sceneId}`, side ?? "entités", `id hors convention, attendu ${expected}`, entity.id);
        }
      }
    }
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
      checkPlaySoundTargets(source, parseScene(raw, registry));
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
    checkIdConvention(id, raw);
    walk(raw, "", () => {}, (object, where) => {
      if (typeof object.type === "string" && object.descriptionKey !== undefined) {
        checkMessagePlaceholder(source, where, object.type, object.descriptionKey);
      }
    });
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
  checkStrings("émotes", EMOTE_REGISTRY);
  checkStrings("météo", WEATHER_STATES);
  checkStrings("perception", { PERCEPTION_MUSIC_POOL, PERCEPTION_AMBIENCE_POOL });
  checkStrings("boutiques", SHOP_CATALOGS);
  // Articles de présentoir : leur son (les noms viennent des registres
  // d'objets et d'améliorations, déjà vérifiés ci-dessus).
  checkStrings("présentoirs", DISPLAY_ARTICLES);

  // Collections : leurs clés sont DÉDUITES des ids (voir core/collections.js),
  // jamais écrites dans la donnée — on les reconstruit pour les vérifier.
  for (const [id, collection] of Object.entries(collections)) {
    const keys = [collectionNameKey(id)];
    for (const entry of collection.entries) {
      keys.push(...Object.values(entryTextKeys(id, entry)));
    }
    checkStrings(`collection ${id}`, keys);
    if (collection.discoverySound !== undefined) {
      checkStrings(`collection ${id}`, { discoverySound: collection.discoverySound });
    }
  }

  // Messages en rotation : clés DÉDUITES des ids (core/rotation.js), comme
  // les collections.
  const rotationTexts = new Set();
  for (const [id, rotation] of Object.entries(rotations)) {
    try {
      validateRotation(id, rotation);
    } catch (error) {
      report(`série ${id}`, "rotations", "série invalide", error.message);
      continue;
    }
    const keys = rotation.entries.map((entry) => rotationTextKey(id, entry));
    keys.forEach((key) => rotationTexts.add(key));
    checkStrings(`série ${id}`, keys);
  }
  for (const [lang, table] of Object.entries(LOCALE_TABLES)) {
    for (const key of Object.keys(table)) {
      if (key.startsWith("rotation.") && !rotationTexts.has(key)) report("messages en rotation", lang, "texte sans série", key);
    }
  }
  for (const [type, archetype] of Object.entries(registry)) {
    if (archetype.messageRotation !== undefined && !Object.hasOwn(rotations, archetype.messageRotation)) {
      report("types d'entité", type, "série de messages inconnue", archetype.messageRotation);
    }
    checkMessagePlaceholder("types d'entité", type, type, archetype.descriptionKey);
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

  // Aide des touches (lib/help.js) : générée des tables, elle n'a besoin
  // que d'une phrase par action et d'un nom par touche.
  const helpTexts = new Set(["help.title", "help.entry"]);
  for (const id of bindingTableIds()) {
    for (const [action, binding] of Object.entries(bindingTable(id))) {
      const keys = [helpKey(id, action), ...binding.mods.map((mod) => `key.mod.${mod}`)];
      for (const key of binding.keys) if (needsKeyName(key)) keys.push(keyNameKey(key));
      helpTexts.add(helpKey(id, action));
      for (const key of keys) {
        const missing = Object.keys(LOCALE_TABLES).filter((lang) => LOCALE_TABLES[lang][key] === undefined);
        if (missing.length > 0) report("aide des touches", `${id}.${action}`, `texte absent (${missing.join(", ")})`, key);
      }
    }
  }
  for (const [lang, table] of Object.entries(LOCALE_TABLES)) {
    for (const key of Object.keys(table)) {
      if (key.startsWith("help.") && !helpTexts.has(key)) report("aide des touches", lang, "description sans raccourci", key);
    }
  }

  if (!sceneExists(NEW_GAME.startSceneId)) report("départ", "startSceneId", "scène inconnue", NEW_GAME.startSceneId);
  checkStrings("départ", NEW_GAME);

  if (warnings.length > 0) {
    console.warn(`Audit du contenu : ${warnings.length} avertissement(s) de nommage.`);
    console.table(warnings);
  }
  const warningNote = warnings.length > 0 ? `, ${warnings.length} avertissement(s) de nommage` : "";
  if (problems.length === 0) {
    console.log(`Audit du contenu : aucun problème${warningNote}.`);
  } else {
    console.warn(`Audit du contenu : ${problems.length} problème(s)${warningNote}.`);
    console.table(problems);
  }
  return { problems, warnings, sources: Object.keys(scenePaths).length };
}
