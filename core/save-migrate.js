// MONTÉE D'UNE SAUVEGARDE lue (doc/save.md) : ce que core/save.js/deserializeGame
// fait d'une enveloppe de la version courante avant de la rendre jouable. Dans
// l'ordre : rebouchage des champs apparus depuis (migrateSave), renommages de
// contenu (config/save-renames.js), conversion des anciennes durées d'errance en
// ticks ; puis, toujours, les objets inconnus retirés (dropUnknownItems), les
// références de contenu cassées neutralisées (repairContentReferences), et, avec
// un registre injecté, les entités d'un type inconnu retirées
// (dropUnknownEntityTypes). Pur, comme core/save.js : aucun accès disque.

import { DEFAULT_SURFACE } from "../config/surfaces-values.js";
import { INITIAL_TIME } from "./time.js";
import { createEmptyEquipment } from "./equipment-slots.js";
import { isTwoSided, deriveAcquiredItems } from "./state.js";
import { createInitialWeather } from "./weather.js";
import { ITEM_REGISTRY } from "../config/items-values.js";
import { validateDistribution } from "./distribution.js";
import { validateCatalog } from "./catalog.js";
import { validateDisplayDistribution, displayArticleInfo } from "./display.js";
import { WEATHER_STATES, DEFAULT_WEATHER_STATE } from "../config/weather-values.js";
import { RENAMED_ENTITY_TYPES, RENAMED_I18N_KEYS, RENAMED_ASSET_PATHS, RENAMED_SCENE_IDS } from "../config/save-renames.js";
import { TICK_MS } from "../lib/loop.js";

// --- Renommages de contenu (config/save-renames.js, doc/save.md) ---------

// Résout les chaînes de renommage une fois pour toutes (a -> b, b -> c
// donne a -> c, b -> c). Une boucle est une table cassée : erreur au
// chargement du module, comme une table météo invalide (core/weather.js).
function resolveRenameChains(table, label) {
  const resolved = {};
  for (const start of Object.keys(table)) {
    const seen = new Set([start]);
    let current = table[start];
    while (Object.hasOwn(table, current)) {
      if (seen.has(current)) {
        throw new Error(`config/save-renames.js : boucle de renommage dans ${label} ("${start}").`);
      }
      seen.add(current);
      current = table[current];
    }
    resolved[start] = current;
  }
  return resolved;
}

const ENTITY_TYPE_RENAMES = resolveRenameChains(RENAMED_ENTITY_TYPES, "RENAMED_ENTITY_TYPES");
// Un id de scène (snake_case) a la même forme qu'un id ou un type
// d'entité, un id d'objet ou une valeur de variable : il n'est renommé
// QU'AUX endroits où il figure (voir renameSceneIds), jamais par une passe
// sur toutes les valeurs, qui renommerait aussi une entité homonyme.
const SCENE_ID_RENAMES = resolveRenameChains(RENAMED_SCENE_IDS, "RENAMED_SCENE_IDS");
// Clés i18n et chemins de sons ne peuvent pas se confondre (forme pointée
// contre chemin de dossier), ni avec rien d'autre : une seule passe sur
// toutes les valeurs.
const VALUE_RENAMES = {
  ...resolveRenameChains(RENAMED_I18N_KEYS, "RENAMED_I18N_KEYS"),
  ...resolveRenameChains(RENAMED_ASSET_PATHS, "RENAMED_ASSET_PATHS"),
};

// Parcourt toute la donnée en profondeur : `visit(value)` reçoit chaque
// valeur (chaîne, nombre, tableau, objet) APRÈS ses enfants, et renvoie la
// valeur à garder. Une branche inchangée garde sa référence.
function mapDeep(value, visit) {
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const mapped = mapDeep(item, visit);
      if (mapped !== item) changed = true;
      return mapped;
    });
    return visit(changed ? out : value);
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const mapped = mapDeep(item, visit);
      if (mapped !== item) changed = true;
      out[key] = mapped;
    }
    return visit(changed ? out : value);
  }
  return visit(value);
}

// Remplace, partout dans la donnée, toute VALEUR chaîne exactement égale à
// une ancienne clé ou à un ancien chemin. Jamais les clés d'objet (noms de
// variables, ids de mondes) : seules les valeurs portent du contenu
// renommable.
function renameValues(data) {
  return mapDeep(data, (value) =>
    typeof value === "string" && Object.hasOwn(VALUE_RENAMES, value) ? VALUE_RENAMES[value] : value
  );
}

// Applique `transform(entities) -> entities` à chaque liste d'entités de la
// partie : chaque face de chaque monde, plus les compagnons. Une liste
// inchangée garde sa référence, et le monde aussi.
function mapEntityLists(data, transform) {
  const mapFace = (face) => {
    if (!face || !Array.isArray(face.entities)) return face;
    const entities = transform(face.entities);
    return entities === face.entities ? face : { ...face, entities };
  };

  let result = data;
  if (data.worlds && typeof data.worlds === "object") {
    const worlds = {};
    let anyChanged = false;
    for (const [id, world] of Object.entries(data.worlds)) {
      let next = world;
      if (world && world.recto !== undefined && world.verso !== undefined) {
        const recto = mapFace(world.recto);
        const verso = mapFace(world.verso);
        if (recto !== world.recto || verso !== world.verso) next = { ...world, recto, verso };
      } else {
        next = mapFace(world);
      }
      worlds[id] = next;
      if (next !== world) anyChanged = true;
    }
    if (anyChanged) result = { ...result, worlds };
  }
  if (Array.isArray(data.companions)) {
    const companions = transform(data.companions);
    if (companions !== data.companions) result = { ...result, companions };
  }
  return result;
}

function renameEntityTypes(entities) {
  let changed = false;
  const out = entities.map((entity) => {
    if (!entity) return entity;
    const typed = Object.hasOwn(ENTITY_TYPE_RENAMES, entity.type) ? { ...entity, type: ENTITY_TYPE_RENAMES[entity.type] } : entity;
    const next = mapEntityEffects(typed, renameSpawnSpecType);
    if (next !== entity) changed = true;
    return next;
  });
  return changed ? out : entities;
}

// Les clés d'une plage de types (`entities` d'un `spawnRanges`, figée avec la
// face) sont des types d'entité : renommées aussi, sinon la plage perdrait le
// type renommé sans rien dire. Deux anciennes clés qui mènent au même nom : la
// première garde son poids (aucun poids n'est inventé).
function renameSpawnRangeTypes(data) {
  if (!data.worlds || typeof data.worlds !== "object") return data;
  const renameFace = (face) => {
    if (!face || !Array.isArray(face.spawnRanges)) return face;
    let changed = false;
    const spawnRanges = face.spawnRanges.map((range) => {
      if (!range?.entities || typeof range.entities !== "object") return range;
      if (!Object.keys(range.entities).some((type) => Object.hasOwn(ENTITY_TYPE_RENAMES, type))) return range;
      changed = true;
      const entities = {};
      for (const [type, weight] of Object.entries(range.entities)) {
        const renamed = Object.hasOwn(ENTITY_TYPE_RENAMES, type) ? ENTITY_TYPE_RENAMES[type] : type;
        if (!Object.hasOwn(entities, renamed)) entities[renamed] = weight;
      }
      return { ...range, entities };
    });
    return changed ? { ...face, spawnRanges } : face;
  };
  const worlds = {};
  let anyChanged = false;
  for (const [id, world] of Object.entries(data.worlds)) {
    let next = world;
    if (world && world.recto !== undefined && world.verso !== undefined) {
      const recto = renameFace(world.recto);
      const verso = renameFace(world.verso);
      if (recto !== world.recto || verso !== world.verso) next = { ...world, recto, verso };
    } else {
      next = renameFace(world);
    }
    worlds[id] = next;
    if (next !== world) anyChanged = true;
  }
  return anyChanged ? { ...data, worlds } : data;
}

// Le `spec` d'un effet "spawn" (core/script-parse.js) porte lui aussi un
// type d'entité, figé avec la scène dans les listes d'effets de l'entité.
function renameSpawnSpecType(effect) {
  if (effect.type !== "spawn" || !effect.spec || !Object.hasOwn(ENTITY_TYPE_RENAMES, effect.spec.type)) return effect;
  return { ...effect, spec: { ...effect.spec, type: ENTITY_TYPE_RENAMES[effect.spec.type] } };
}

// La cible d'un "teleport" (une porte figée dans un monde) est un id de
// scène.
function renameTeleportTarget(effect) {
  if (effect.type !== "teleport" || !Object.hasOwn(SCENE_ID_RENAMES, effect.target)) return effect;
  return { ...effect, target: SCENE_ID_RENAMES[effect.target] };
}

// Applique `mapEffect(effect) -> effect` à chaque effet figé avec la scène
// dans une entité : action (et ses refus), triggers, séquence en attente.
// Référence inchangée si rien ne change.
function mapEntityEffects(entity, mapEffect) {
  let next = entity;
  if (entity.action && typeof entity.action === "object") {
    const actions = Array.isArray(entity.action) ? entity.action : [entity.action];
    const mapped = actions.map((action) => mapEffectsIn(action, ["effects", "refusalEffects"], mapEffect));
    if (mapped.some((action, i) => action !== actions[i])) next = { ...next, action: Array.isArray(entity.action) ? mapped : mapped[0] };
  }
  for (const key of ["triggers", "pendingEffects"]) {
    if (!Array.isArray(entity[key])) continue;
    const mapped = entity[key].map((holder) => mapEffectsIn(holder, ["effects"], mapEffect));
    if (mapped.some((holder, i) => holder !== entity[key][i])) next = { ...next, [key]: mapped };
  }
  return next;
}

function mapEffectsIn(holder, keys, mapEffect) {
  let next = holder;
  for (const key of keys) {
    if (!holder || !Array.isArray(holder[key])) continue;
    let changed = false;
    const effects = holder[key].map((effect) => {
      if (!effect) return effect;
      const mapped = mapEffect(effect);
      if (mapped !== effect) changed = true;
      return mapped;
    });
    if (changed) next = { ...next, [key]: effects };
  }
  return next;
}

function renameTeleportTargets(entities) {
  let changed = false;
  const out = entities.map((entity) => {
    if (!entity) return entity;
    const next = mapEntityEffects(entity, renameTeleportTarget);
    if (next !== entity) changed = true;
    return next;
  });
  return changed ? out : entities;
}

// Ids de scène, là où ils figurent : le monde actif, l'id recopié dans
// chaque monde, et la cible des "teleport" figés dans les entités. Les clés
// de session.worlds sont renommées à part (renameWorldIds).
function renameSceneIds(data) {
  if (Object.keys(SCENE_ID_RENAMES).length === 0) return data;
  let result = mapEntityLists(data, renameTeleportTargets);
  if (Object.hasOwn(SCENE_ID_RENAMES, result.activeWorldId)) {
    result = { ...result, activeWorldId: SCENE_ID_RENAMES[result.activeWorldId] };
  }
  if (result.worlds && typeof result.worlds === "object") {
    const ids = Object.entries(result.worlds).filter(([, world]) => world && Object.hasOwn(SCENE_ID_RENAMES, world.id));
    if (ids.length > 0) {
      const worlds = { ...result.worlds };
      for (const [key, world] of ids) worlds[key] = { ...world, id: SCENE_ID_RENAMES[world.id] };
      result = { ...result, worlds };
    }
  }
  return result;
}

// Clés de session.worlds : un monde rangé sous l'ancien id de sa scène
// passe sous le nouveau. Si les deux existent (scène revisitée après un
// renommage manuel), le monde déjà rangé sous le nouvel id est gardé : c'est
// le plus récent.
function renameWorldIds(data) {
  if (!data.worlds || typeof data.worlds !== "object") return data;
  if (!Object.keys(data.worlds).some((id) => Object.hasOwn(SCENE_ID_RENAMES, id))) return data;
  const worlds = {};
  for (const [id, world] of Object.entries(data.worlds)) {
    const renamed = Object.hasOwn(SCENE_ID_RENAMES, id) ? SCENE_ID_RENAMES[id] : id;
    if (renamed !== id && Object.hasOwn(data.worlds, renamed)) continue;
    worlds[renamed] = world;
  }
  return { ...data, worlds };
}

// Renommages de contenu d'une partie déjà rebouchée : types d'entité (des
// entités et des plages de types), ids de scènes (clés des mondes, puis là où
// ils sont cités), puis clés i18n et chemins de sons. Idempotent : une
// sauvegarde déjà à jour traverse sans changement.
function applyContentRenames(data) {
  return renameValues(renameSceneIds(renameWorldIds(renameSpawnRangeTypes(mapEntityLists(data, renameEntityTypes)))));
}

// --- Durées d'errance en ticks (doc/save.md) ----------------------------

// Les durées du comportement "wander" (core/behaviors/wander.js) se
// déclaraient en ticks ; elles se déclarent en ms. Une sauvegarde fige les
// comportements de ses mondes (`behavior` d'une entité, effets "behavior"
// de ses règles) : sans conversion, ces champs seraient ignorés et
// l'entité retomberait sur les défauts. ms = ticks × TICK_MS, arrondi :
// le tirage, qui reconvertit en ticks par arrondi, retombe exactement sur
// les durées d'origine.
const WANDER_TICK_FIELDS = {
  walkMin: "walkMinMs",
  walkMax: "walkMaxMs",
  pauseMin: "pauseMinMs",
  pauseMax: "pauseMaxMs",
};

function convertWanderTicks(data) {
  return mapDeep(data, (value) => {
    if (!value || typeof value !== "object" || value.kind !== "wander") return value;
    const oldFields = Object.keys(WANDER_TICK_FIELDS).filter((field) => Object.hasOwn(value, field));
    if (oldFields.length === 0) return value;
    const converted = { ...value };
    for (const field of oldFields) {
      // Une valeur qui n'est pas un nombre (donnée corrompue) est retirée
      // sans remplaçant : l'entité retombe sur le défaut de ce champ.
      if (typeof converted[field] === "number") {
        converted[WANDER_TICK_FIELDS[field]] = Math.round(converted[field] * TICK_MS);
      }
      delete converted[field];
    }
    return converted;
  });
}

// Retire du sac et de l'équipement les objets absents du registre d'objets
// (objet supprimé, ou renommé — les ids d'objets n'ont pas de table de
// renommage). Les garder ferait planter le menu du sac au premier accès à
// leur fiche ; on perd l'objet, jamais la partie. ITEM_REGISTRY est du code
// du core : aucune injection nécessaire, contrairement au registre
// d'entités. Renvoie la partie et les objets retirés, `{ where, type }`
// (where : "bag" ou le nom du slot), pour que l'appelant puisse avertir.
export function dropUnknownItems(data) {
  const dropped = [];
  const known = (type) => Object.hasOwn(ITEM_REGISTRY, type);
  let result = data;

  const bag = data.bag.filter((entry) => {
    if (entry && known(entry.type)) return true;
    dropped.push({ where: "bag", type: entry && entry.type });
    return false;
  });
  if (bag.length !== data.bag.length) result = { ...result, bag };

  if (data.equipment && typeof data.equipment === "object") {
    let equipmentChanged = false;
    const equipment = { ...data.equipment };
    for (const [slot, content] of Object.entries(data.equipment)) {
      if (content && !known(content.type)) {
        dropped.push({ where: slot, type: content.type });
        equipment[slot] = null;
        equipmentChanged = true;
      }
    }
    if (equipmentChanged) result = { ...result, equipment };
  }
  return { data: result, dropped };
}

// --- Références de contenu figées (doc/save.md) -------------------------
//
// Une sauvegarde garde, telles qu'à la première visite, les distributions
// de collecte (conteneurs, plages, entités minables), les stocks tirés, les catalogues des
// points de vente, les tables et articles des présentoirs, et l'état météo.
// Une table, un catalogue, un objet, un article ou un état météo retiré ou
// renommé depuis ferait planter le garnissage, la boutique ou la météo. Ces
// références sont revalidées avec les MÊMES
// validateurs que le chargement d'une scène ; une référence cassée est
// NEUTRALISÉE et listée pour que l'appelant avertisse : on perd la
// référence, jamais la partie.
//   - distribution invalide -> `distribution: null`, la source ne donne plus
//     rien (core/spawn.js) ;
//   - objet inconnu dans un stock tiré ou un butin fixe -> retiré ;
//   - catalogue invalide -> `catalog: null`, rayon vide (core/catalog.js) ;
//   - table de présentoir invalide -> `distribution: null`, le présentoir
//     n'expose plus rien (core/display.js/drawOffer) ;
//   - article exposé inconnu -> `offer: null`, présentoir vide jusqu'au
//     prochain garnissage ;
//   - état météo inconnu -> état par défaut, même rendez-vous.

// Message d'erreur d'un validateur de contenu (qui lève via `fail`), ou
// null si la valeur est valide.
function validationProblem(validate, value, describe) {
  try {
    validate(value, describe, (message) => {
      throw new Error(message);
    });
    return null;
  } catch (error) {
    return error.message;
  }
}

function repairEntityReferences(entity, report) {
  if (!entity || typeof entity !== "object") return entity;
  let next = entity;

  if (entity.container && entity.container.distribution !== null) {
    const problem = validationProblem(validateDistribution, entity.container.distribution, "container.distribution");
    if (problem) {
      report(entity.id, problem);
      next = { ...next, container: { ...next.container, distribution: null } };
    }
  }
  // Butin fixe : pas de distribution à valider, seulement ses objets.
  if (entity.mineable && entity.mineable.drops) {
    const drops = Object.entries(entity.mineable.drops).filter(([item]) => {
      if (Object.hasOwn(ITEM_REGISTRY, item)) return true;
      report(entity.id, `objet ${JSON.stringify(item)} retiré du butin, absent de ITEM_REGISTRY.`);
      return false;
    });
    if (drops.length !== Object.keys(entity.mineable.drops).length) {
      next = { ...next, mineable: { ...next.mineable, drops: Object.fromEntries(drops) } };
    }
  } else if (entity.mineable && entity.mineable.distribution !== null) {
    const problem = validationProblem(validateDistribution, entity.mineable.distribution, "mineable.distribution");
    if (problem) {
      report(entity.id, problem);
      next = { ...next, mineable: { ...next.mineable, distribution: null } };
    }
  }
  if (Array.isArray(entity.stock)) {
    const stock = entity.stock.filter((type) => {
      if (Object.hasOwn(ITEM_REGISTRY, type)) return true;
      report(entity.id, `objet ${JSON.stringify(type)} retiré du stock, absent de ITEM_REGISTRY.`);
      return false;
    });
    if (stock.length !== entity.stock.length) next = { ...next, stock };
  }
  if (entity.shop && entity.shop.catalog !== null) {
    const problem = validationProblem(validateCatalog, entity.shop.catalog, "shop.catalog");
    if (problem) {
      report(entity.id, problem);
      next = { ...next, shop: { ...next.shop, catalog: null } };
    }
  }
  if (entity.display && entity.display.distribution !== null) {
    const problem = validationProblem(validateDisplayDistribution, entity.display.distribution, "display.distribution");
    if (problem) {
      report(entity.id, problem);
      next = { ...next, display: { ...next.display, distribution: null } };
    }
  }
  if (entity.display && entity.offer !== undefined && entity.offer !== null && displayArticleInfo(entity.offer) === null) {
    report(entity.id, `article ${JSON.stringify(entity.offer)} retiré du présentoir, absent de DISPLAY_ARTICLES.`);
    next = { ...next, offer: null };
  }
  return next;
}

function repairFaceReferences(face, report) {
  if (!face || typeof face !== "object") return face;
  let next = face;
  if (Array.isArray(face.entities)) {
    const entities = face.entities.map((entity) => repairEntityReferences(entity, report));
    if (entities.some((entity, i) => entity !== face.entities[i])) next = { ...next, entities };
  }
  if (Array.isArray(face.spawnRanges)) {
    const spawnRanges = face.spawnRanges.map((range, index) => {
      // Une plage de types (`entities`) n'a pas de distribution : sans
      // registre ici, ses types se vérifient au garnissage (core/spawn.js).
      if (!range || range.distribution === null || range.distribution === undefined) return range;
      const source = `spawnRanges[${index}]`;
      const problem = validationProblem(validateDistribution, range.distribution, "distribution");
      if (!problem) return range;
      report(source, problem);
      return { ...range, distribution: null };
    });
    if (spawnRanges.some((range, i) => range !== face.spawnRanges[i])) next = { ...next, spawnRanges };
  }
  return next;
}

// Renvoie la partie réparée et les références neutralisées,
// `{ worldId, source, problem }` (worldId null pour la météo ; source : id
// d'entité, "spawnRanges[i]" ou "weather").
export function repairContentReferences(data) {
  const broken = [];
  let result = data;

  for (const [worldId, world] of Object.entries(data.worlds)) {
    const report = (source, problem) => broken.push({ worldId, source, problem });
    let next;
    if (isTwoSided(world)) {
      const recto = repairFaceReferences(world.recto, report);
      const verso = repairFaceReferences(world.verso, report);
      next = recto === world.recto && verso === world.verso ? world : { ...world, recto, verso };
    } else {
      next = repairFaceReferences(world, report);
    }
    if (next !== world) result = { ...result, worlds: { ...result.worlds, [worldId]: next } };
  }

  if (!Object.hasOwn(WEATHER_STATES, data.weather.state)) {
    broken.push({
      worldId: null,
      source: "weather",
      problem: `état ${JSON.stringify(data.weather.state)} absent de WEATHER_STATES, remplacé par ${JSON.stringify(DEFAULT_WEATHER_STATE)}.`,
    });
    result = { ...result, weather: { ...result.weather, state: DEFAULT_WEATHER_STATE } };
  }
  return { data: result, broken };
}

// Retire les entités dont le type n'existe plus dans le registre (type
// supprimé, ou renommé sans entrée dans config/save-renames.js). Les
// garder ferait planter la scène au premier accès au registre ; on perd
// l'entité, jamais la partie. Renvoie la partie et les entités retirées,
// `{ worldId, entityId, type }` (worldId null pour un compagnon), pour que
// l'appelant puisse avertir.
export function dropUnknownEntityTypes(data, registry) {
  const dropped = [];
  const filterFor = (worldId) => (entities) => {
    const kept = entities.filter((entity) => {
      if (entity && Object.hasOwn(registry, entity.type)) return true;
      dropped.push({ worldId, entityId: entity && entity.id, type: entity && entity.type });
      return false;
    });
    return kept.length === entities.length ? entities : kept;
  };

  let result = data;
  for (const [id, world] of Object.entries(data.worlds)) {
    const single = { worlds: { [id]: world } };
    const patched = mapEntityLists(single, filterFor(id)).worlds[id];
    if (patched !== world) result = { ...result, worlds: { ...result.worlds, [id]: patched } };
  }
  const companions = filterFor(null)(data.companions);
  if (companions !== data.companions) result = { ...result, companions };
  return { data: result, dropped };
}

// Rebouche UNE FACE antérieure à defaultSurface/segments (voir
// core/scene.js/parseScene, qui garantit ces trois clés TOUJOURS présentes
// pour un monde fraîchement chargé) — une sauvegarde plus ancienne ne les a
// jamais eues, et une relecture de sauvegarde ne repasse JAMAIS par
// parseScene (qui ne s'applique qu'au chargement réseau d'une scène). Sans
// ce rebouchage, surfaceAt(world, x) plante sur segments.find(...) dès
// qu'une face ANCIENNE redevient active (voir view/audio/footsteps.js).
// Mêmes défauts que parseScene : DEFAULT_SURFACE partout, aucun segment —
// comportement inchangé pour ces faces anciennes. Même précédent pour
// `nextEphemeralId` (voir core/state.js/spawnEphemeral), antérieur aux
// entités éphémères. `face` suspecte (donnée de disque) : jamais de
// confiance aveugle, renvoyée telle quelle si ce n'est manifestement pas un
// objet plutôt que de planter ici. Un champ HÉRITÉ d'une save ancienne mais
// retiré depuis du format (ex. un ancien jalon de contenu jamais devenu
// actif) traverse tel quel, sans être touché ni relu par quoi que ce soit —
// simplement ignoré, jamais nettoyé activement.
function backfillFace(face) {
  if (!face || typeof face !== "object") return face;
  if (
    face.defaultSurface !== undefined &&
    face.segments !== undefined &&
    face.nextEphemeralId !== undefined &&
    face.indoor !== undefined &&
    face.weatherAmbience !== undefined &&
    face.weatherAnnouncements !== undefined &&
    face.phaseAnnouncements !== undefined
  ) {
    return face;
  }
  return {
    ...face,
    defaultSurface: face.defaultSurface !== undefined ? face.defaultSurface : DEFAULT_SURFACE,
    segments: face.segments !== undefined ? face.segments : [],
    // nextEphemeralId : voir core/state.js/spawnEphemeral. Absent d'une
    // sauvegarde antérieure aux entités éphémères -> 0, comme à la création
    // d'un monde neuf (sans ce rebouchage, spawnEphemeral calculerait
    // `undefined + 1` = NaN, et TOUT éphémère suivant recevrait le même id
    // "ephemeral-NaN" — collision garantie dès le second spawn).
    nextEphemeralId: face.nextEphemeralId !== undefined ? face.nextEphemeralId : 0,
    // indoor : voir core/scene.js/parseFace ("nature de scène", TOUJOURS
    // résolue pour un monde fraîchement chargé) — absente d'une sauvegarde
    // antérieure à cette propriété -> false (extérieur), même politique que
    // defaultSurface juste au-dessus.
    indoor: face.indoor !== undefined ? face.indoor : false,
    // weatherAmbience, weatherAnnouncements, phaseAnnouncements : voir
    // core/scene.js/parseFace. Absents d'une sauvegarde antérieure -> true,
    // la météo et le jour se font sentir comme ils l'ont toujours fait.
    weatherAmbience: face.weatherAmbience !== undefined ? face.weatherAmbience : true,
    weatherAnnouncements: face.weatherAnnouncements !== undefined ? face.weatherAnnouncements : true,
    phaseAnnouncements: face.phaseAnnouncements !== undefined ? face.phaseAnnouncements : true,
  };
}

// Rebouche UN monde entier — SIMPLE (sa seule face, lui-même) ou À DEUX
// FACES (recto/verso, voir core/state.js/isTwoSided) : dans les deux cas,
// chaque face traverse backfillFace, jamais dupliqué ici. Aucune save
// antérieure au modèle à deux faces n'en déclare — ce cas ne concerne donc
// aujourd'hui que des saves ÉCRITES avec ce modèle, mais reste correct par
// construction plutôt que supposé toujours complet.
// variables (portée "scene", voir core/scene.js/parseScene et core/variables.js)
// : RACINE PARTAGÉE du monde, jamais par face (contrairement à
// defaultSurface/segments/indoor ci-dessus) — rebouchée ICI, avant la
// distinction simple/deux-faces, pour n'être backfillée qu'UNE fois même
// pour un monde à deux faces. Absente d'une sauvegarde antérieure à ce
// mécanisme -> sac vide `{}`, même politique que defaultSurface/indoor
// (backfillFace) : une scène ancienne sans variable déclarée se comporte
// exactement comme une scène neuve qui n'en déclare pas.
function backfillWorldVariables(world) {
  if (!world || typeof world !== "object" || world.variables !== undefined) return world;
  return { ...world, variables: {} };
}

function backfillWorld(rawWorld) {
  const world = backfillWorldVariables(rawWorld);
  if (!world || typeof world !== "object") return world;
  if (world.recto !== undefined && world.verso !== undefined) {
    const recto = backfillFace(world.recto);
    const verso = backfillFace(world.verso);
    if (recto === world.recto && verso === world.verso) return world;
    return { ...world, recto, verso };
  }
  return backfillFace(world);
}

// Migre une sauvegarde déjà déballée { version, data } vers la partie
// courante. v1 -> v1 : identité pour l'essentiel, SAUF le rebouchage de
// `companions`/`companionsRngState` (voir core/state.js), de `time` (voir
// core/time.js — absent d'une sauvegarde antérieure à l'horloge de partie),
// de `money` (voir core/money.js — même précédent), de `bag` (voir
// core/bag.js — même précédent), de `equipment` (voir core/equipment.js —
// même précédent, mais rebouché VIDE, jamais avec un objet par défaut), de
// `variables` (portée "party", voir core/variables.js) et, par monde, de
// defaultSurface/segments/variables (portée "scene", voir backfillWorld) —
// absents d'une sauvegarde antérieure à leur introduction, sans que ça
// justifie une montée de version (la forme reste v1, juste complétée par
// des défauts sûrs). Viennent ensuite les renommages de contenu et la
// conversion des anciennes durées d'errance en ticks (voir plus haut),
// mêmes raisons. Point d'ancrage documenté pour de futures montées
// (v1 -> v2 -> ... -> courante, jamais en sautant une étape, même principe
// que lib/preferences.js/migratePrefs). `raw` : les données d'une enveloppe de
// la version courante (une version inconnue, sans chemin de montée, est refusée
// avant, par core/save.js/deserializeGame).
export function migrateSave(raw) {
  let data = raw;
  if (!data || typeof data !== "object") return data;

  if (!Array.isArray(data.companions)) {
    data = { ...data, companions: [], companionsRngState: 0 };
  }

  if (typeof data.time !== "number") {
    data = { ...data, time: INITIAL_TIME };
  }

  if (typeof data.money !== "number") {
    data = { ...data, money: 0 };
  }

  if (!Array.isArray(data.bag)) {
    data = { ...data, bag: [] };
  }

  // equipment (core/equipment.js) : REBOUCHÉ VIDE, jamais avec un objet par
  // défaut — une sauvegarde antérieure représente une partie déjà en cours,
  // lui injecter rétroactivement des baskets serait une surprise, pas un
  // rebouchage neutre (contrairement à createInitialState, qui ne s'applique
  // qu'à une partie VRAIMENT neuve).
  if (!data.equipment || typeof data.equipment !== "object") {
    data = { ...data, equipment: createEmptyEquipment() };
  }

  // player.side (voir core/state.js/isTwoSided, "RECTO/VERSO") : absent
  // d'une sauvegarde antérieure à ce modèle -> "recto", défaut neutre
  // identique à une partie neuve (une scène simple l'ignore de toute
  // façon). Même politique que les autres rebouchages de ce bloc : jamais
  // une exception si data.player est déjà mal formé, isPlausibleSession le
  // détectera ensuite.
  if (!data.player || typeof data.player !== "object" || typeof data.player.side !== "string") {
    data = { ...data, player: { ...data.player, side: "recto" } };
  }

  // perceptionActive (voir core/state.js/togglePerception, "Perception
  // surnaturelle") : absent d'une sauvegarde antérieure à ce mécanisme ->
  // false, défaut neutre identique à une partie neuve — même politique que
  // player.side juste au-dessus.
  if (typeof data.perceptionActive !== "boolean") {
    data = { ...data, perceptionActive: false };
  }

  // weather (voir core/weather.js/createInitialWeather, "Moteur météo") :
  // absent d'une sauvegarde antérieure à ce mécanisme -> état par défaut,
  // prochaine transition programmée depuis la minute de jeu COURANTE de
  // CETTE sauvegarde (data.time, déjà rebouché plus haut si besoin) —
  // jamais depuis zéro, pour ne pas donner l'impression que la partie
  // recommence. Seed de rebouchage FIXE ("migrated"), même politique que
  // companionsRngState ci-dessus (0) : une sauvegarde ancienne n'a aucun
  // seed de partie accessible à réutiliser.
  if (!data.weather || typeof data.weather !== "object" || typeof data.weather.state !== "string") {
    data = { ...data, weather: createInitialWeather("migrated", data.time) };
  }

  // seed : absente d'une sauvegarde antérieure aux graines de partie ->
  // graine fixe, même politique que la météo ci-dessus. Les mondes déjà
  // visités gardent leur flux ; elle ne sert qu'à ceux qui restent à créer.
  if (data.seed === undefined) {
    data = { ...data, seed: "migrated" };
  }

  // variables (portée "party", voir core/state.js/createInitialState,
  // core/variables.js) : absent d'une sauvegarde antérieure à ce mécanisme
  // -> sac vide `{}`, même politique que perceptionActive/weather ci-dessus.
  if (!data.variables || typeof data.variables !== "object") {
    data = { ...data, variables: {} };
  }

  // improvements (voir config/improvements-values.js/IMPROVEMENT_REGISTRY,
  // core/state.js/createInitialState) : absent d'une sauvegarde antérieure
  // à ce mécanisme -> sac VIDE `{}`, même politique que variables/
  // equipment ci-dessus — une sauvegarde ancienne représente une partie
  // déjà en cours, jamais rétroactivement créditée d'improvements qu'elle
  // n'a jamais débloquées.
  if (!data.improvements || typeof data.improvements !== "object") {
    data = { ...data, improvements: {} };
  }

  // emotes (voir core/emotes.js, core/state.js/createInitialState) : même
  // politique que improvements juste au-dessus — une partie déjà en cours
  // n'apprend rétroactivement aucune émote.
  if (!data.emotes || typeof data.emotes !== "object") {
    data = { ...data, emotes: {} };
  }
  // Raccourci d'émote (core/emotes.js/setEmoteShortcut) : absent -> aucun.
  if (typeof data.emoteShortcut !== "string") {
    data = { ...data, emoteShortcut: null };
  }

  // acquiredItems (voir core/bag.js/addItem, core/collections.js) : absent
  // d'une sauvegarde antérieure -> RECONSTITUÉ à partir du sac et de
  // l'équipement actuels. Approximatif par nature : un objet déjà revendu
  // ou perdu n'y figure plus, il ne sera pas compté comme acquis.
  if (!data.acquiredItems || typeof data.acquiredItems !== "object") {
    data = { ...data, acquiredItems: deriveAcquiredItems(data.bag, data.equipment) };
  }

  // observedEntityTypes (voir core/observations.js) : absent d'une
  // sauvegarde antérieure -> aucun, rien ne permet de le reconstituer. Les
  // entités déjà décrites se redécouvrent à la prochaine observation.
  if (!data.observedEntityTypes || typeof data.observedEntityTypes !== "object") {
    data = { ...data, observedEntityTypes: {} };
  }

  if (data.worlds && typeof data.worlds === "object") {
    const patchedWorlds = {};
    let anyChanged = false;
    for (const [id, world] of Object.entries(data.worlds)) {
      const patched = backfillWorld(world);
      patchedWorlds[id] = patched;
      if (patched !== world) anyChanged = true;
    }
    if (anyChanged) data = { ...data, worlds: patchedWorlds };
  }

  // Renommages de contenu (config/save-renames.js) : APRÈS les rebouchages,
  // sur une partie dont la forme est déjà complète.
  data = applyContentRenames(data);
  data = convertWanderTicks(data);

  return data;
}
