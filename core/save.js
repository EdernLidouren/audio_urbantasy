// Forme d'une SAUVEGARDE de partie : enveloppe versionnée { version, data }
// — même patron que config/preferences.js (voir migratePrefs là-bas), pour
// une seule logique de montée de version dans tout le projet. Pur : aucun
// accès disque ici (ça reste à la charge de la vue, voir
// view/save-storage.js), juste la forme et sa validation. La partie
// (session) est déjà sérialisable de bout en bout (voir l'audit dans
// core/checks/save.check.js) : ce module se contente de l'envelopper/
// désenvelopper et de vérifier sa structure minimale au désenveloppement —
// jamais de confiance aveugle dans une donnée qui vient du disque.
//
// La forme est EN CLAIR ici ; l'obscurcissement sur disque est l'affaire
// de view/save-storage.js (voir lib/obfuscate.js).

import { DEFAULT_SURFACE } from "./surfaces.js";
import { INITIAL_TIME } from "./time.js";
import { createEmptyEquipment } from "./equipment.js";
import { stripEphemeralsFromWorld, isTwoSided, deriveAcquiredItems, withActiveWorld } from "./state.js";
import { createInitialWeather } from "./weather.js";
import { ITEM_REGISTRY } from "./items.js";
import { validateDistribution } from "./distribution.js";
import { validateCatalog } from "./catalog.js";
import { WEATHER_STATES, DEFAULT_WEATHER_STATE } from "../config/weather-values.js";
import { RENAMED_ENTITY_TYPES, RENAMED_I18N_KEYS, RENAMED_ASSET_PATHS, RENAMED_SCENE_IDS } from "../config/save-renames.js";
import { TICK_MS } from "../lib/loop.js";

export const SAVE_VERSION = 1;

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
// Clés i18n et chemins de sons ne peuvent pas se confondre (forme pointée
// contre chemin de dossier) : une seule passe sur toutes les valeurs.
const SCENE_ID_RENAMES = resolveRenameChains(RENAMED_SCENE_IDS, "RENAMED_SCENE_IDS");
// Un id de scène (snake_case, sans point ni barre oblique) ne se confond
// pas non plus avec une clé i18n ou un chemin : même passe sur les valeurs
// (activeWorldId, cible d'un "teleport", id recopié dans le monde). La clé
// du monde dans session.worlds, elle, est renommée à part (renameWorldIds).
const VALUE_RENAMES = {
  ...resolveRenameChains(RENAMED_I18N_KEYS, "RENAMED_I18N_KEYS"),
  ...resolveRenameChains(RENAMED_ASSET_PATHS, "RENAMED_ASSET_PATHS"),
  ...SCENE_ID_RENAMES,
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
    const next = renameSpawnSpecTypes(typed);
    if (next !== entity) changed = true;
    return next;
  });
  return changed ? out : entities;
}

// Le `spec` d'un effet "spawn" (core/script-parse.js) porte lui aussi un
// type d'entité, figé avec la scène dans les listes d'effets de l'entité :
// action (et ses refus), triggers, séquence en attente. Référence inchangée
// si rien n'est renommé.
function renameSpawnSpecTypes(entity) {
  let next = entity;
  if (entity.action && typeof entity.action === "object") {
    const actions = Array.isArray(entity.action) ? entity.action : [entity.action];
    const renamed = actions.map((action) => renameSpawnsIn(action, ["effects", "refusalEffects"]));
    if (renamed.some((action, i) => action !== actions[i])) next = { ...next, action: Array.isArray(entity.action) ? renamed : renamed[0] };
  }
  for (const key of ["triggers", "pendingEffects"]) {
    if (!Array.isArray(entity[key])) continue;
    const renamed = entity[key].map((holder) => renameSpawnsIn(holder, ["effects"]));
    if (renamed.some((holder, i) => holder !== entity[key][i])) next = { ...next, [key]: renamed };
  }
  return next;
}

function renameSpawnsIn(holder, keys) {
  let next = holder;
  for (const key of keys) {
    if (!holder || !Array.isArray(holder[key])) continue;
    let changed = false;
    const effects = holder[key].map((effect) => {
      if (!effect || effect.type !== "spawn" || !effect.spec || !Object.hasOwn(ENTITY_TYPE_RENAMES, effect.spec.type)) return effect;
      changed = true;
      return { ...effect, spec: { ...effect.spec, type: ENTITY_TYPE_RENAMES[effect.spec.type] } };
    });
    if (changed) next = { ...next, [key]: effects };
  }
  return next;
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

// Renommages de contenu d'une partie déjà rebouchée : types d'entité, ids
// de mondes, puis clés i18n, chemins de sons et ids de scènes cités.
// Idempotent : une sauvegarde déjà à jour traverse sans changement.
function applyContentRenames(data) {
  return renameValues(renameWorldIds(mapEntityLists(data, renameEntityTypes)));
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
function dropUnknownItems(data) {
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
// de collecte (conteneurs, plages), les stocks tirés, les catalogues des
// points de vente, et l'état météo. Une table, un catalogue, un objet ou un
// état météo retiré ou renommé depuis ferait planter le garnissage, la
// boutique ou la météo. Ces références sont revalidées avec les MÊMES
// validateurs que le chargement d'une scène ; une référence cassée est
// NEUTRALISÉE et listée pour que l'appelant avertisse : on perd la
// référence, jamais la partie.
//   - distribution invalide -> `distribution: null`, la source ne donne plus
//     rien (core/spawn.js) ;
//   - objet inconnu dans un stock tiré -> retiré du stock ;
//   - catalogue invalide -> `catalog: null`, rayon vide (core/catalog.js) ;
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
      if (!range || range.distribution === null) return range;
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
function repairContentReferences(data) {
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
function dropUnknownEntityTypes(data, registry) {
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

// Exclut les entités ÉPHÉMÈRES (voir core/state.js/spawnEphemeral,
// doc/entity-model.md/"Entités éphémères") de TOUS les mondes avant
// sérialisation — jamais SEULEMENT le monde actif : une sauvegarde reste
// correcte même si un futur appelant venait à laisser un éphémère dans un
// monde rangé (aujourd'hui exclu par la purge de travelToWorld, mais cette
// fonction ne doit pas EN DÉPENDRE pour tenir sa propre garantie). Réutilise
// stripEphemeralsFromWorld (core/state.js) MONDE PAR MONDE — DEUX FACES
// comprises, jamais dupliqué ici : une scène à deux faces (voir
// core/state.js/isTwoSided) sauvegarde SES DEUX FACES, la gelée y compris.
// Monde sans aucun éphémère -> référence INCHANGÉE (pas de nouvel objet pour
// rien), même politique que le reste du fichier (backfillWorld).
function stripEphemeralEntities(session) {
  const worlds = {};
  let anyChanged = false;
  for (const [id, world] of Object.entries(session.worlds)) {
    const patched = stripEphemeralsFromWorld(world);
    worlds[id] = patched;
    if (patched !== world) anyChanged = true;
  }
  return anyChanged ? { ...session, worlds } : session;
}

// PERSISTANCE SÉLECTIVE des variables (voir core/variables.js,
// doc/scripting.md/"Variables") :
// une variable VOLATILE (persistent: false) ne doit jamais transporter sa
// valeur RÉELLE au disque — sa valeur EST REPLACÉE par sa valeur INITIALE
// déclarée avant sérialisation (jamais la clé elle-même retirée : voir
// note ci-dessous). Une variable PERSISTANTE traverse INCHANGÉE.
//
// Note d'implémentation, pour qui s'attendrait à voir la clé disparaître
// purement et simplement : `deserializeGame` ne REPASSE JAMAIS par
// parseScene/parseEntity (voir migrateSave plus bas, qui travaille
// uniquement sur le blob déjà sauvé) — il n'a donc AUCUN accès à la
// déclaration d'origine (type/valeur initiale) d'une variable une fois son
// contenu retiré. Remplacer la valeur PAR l'initiale ICI, à l'écriture,
// est le seul moyen pour qu'une relecture retrouve "sa valeur initiale
// déclarée" sans réinventer un mécanisme de reconstruction séparé au
// chargement : ce qui atterrit sur le disque pour une volatile EST déjà
// son état "comme neuve", la CHARGER ne fait alors que la lire telle
// quelle, exactement comme une variable qui n'aurait jamais changé.
// Référence INCHANGÉE si rien à réinitialiser, même politique que le reste
// de ce fichier (stripEphemeralEntities/backfillFace).
//
// Une volatile vaut pour UNE VISITE : elle revient aussi à son initiale à
// chaque CHARGEMENT de son monde (resetVisitVariables plus bas), pas
// seulement à l'écriture d'une sauvegarde.
function resetVolatileInBag(variables) {
  if (!variables) return variables;
  let changed = false;
  const reset = {};
  for (const [name, variable] of Object.entries(variables)) {
    if (variable.persistent || Object.is(variable.value, variable.initial)) {
      reset[name] = variable;
    } else {
      changed = true;
      reset[name] = { ...variable, value: variable.initial };
    }
  }
  return changed ? reset : variables;
}

// Applique resetVolatileInBag aux ENTITÉS d'UNE face (portée "entity")
// seulement. Le sac PARTAGÉ de portée "scene" vit à la racine du MONDE,
// jamais par face (voir core/scene.js/parseScene) : il est traité une seule
// fois par resetVolatileVariablesInWorld ci-dessous, qui appelle cette
// fonction pour chaque face (le monde lui-même pour une scène SIMPLE).
// Référence INCHANGÉE si aucune entité n'a changé.
function resetVolatileInFaceEntities(face) {
  const entities = face.entities.map((entity) => {
    const variables = resetVolatileInBag(entity.variables);
    return variables === entity.variables ? entity : { ...entity, variables };
  });
  return entities.every((entity, i) => entity === face.entities[i]) ? face : { ...face, entities };
}

// Un monde ENTIER (portée "scene" à sa racine, portée "entity" par face) —
// SIMPLE ou À DEUX FACES, même distinction que backfillWorld plus bas.
function resetVolatileVariablesInWorld(world) {
  const sceneVariables = resetVolatileInBag(world.variables);
  let patched = sceneVariables === world.variables ? world : { ...world, variables: sceneVariables };

  if (isTwoSided(patched)) {
    const recto = resetVolatileInFaceEntities(patched.recto);
    const verso = resetVolatileInFaceEntities(patched.verso);
    if (recto === patched.recto && verso === patched.verso) return patched;
    return { ...patched, recto, verso };
  }
  return resetVolatileInFaceEntities(patched);
}

// Variables VOLATILES du monde ACTIF, à son CHARGEMENT (appelé par
// view/world-travel.js/prepareLoadedWorld, comme le retour des entités
// farouches) : une volatile de scène ou d'entité ne dure que le temps
// d'une visite — la fenêtre ouverte se retrouve fermée, le néon déréglé
// redevient un néon qui grésille. Les variables de PARTIE et des
// compagnons voyagent avec le joueur : elles ne reviennent à leur
// initiale qu'à la sauvegarde. Référence inchangée si rien à faire.
export function resetVisitVariables(session) {
  const world = session.worlds[session.activeWorldId];
  const reset = resetVolatileVariablesInWorld(world);
  return reset === world ? session : withActiveWorld(session, reset);
}

// Toute la SESSION : variables de partie (racine), de chaque monde (tous,
// pas seulement l'actif — un monde rangé garde ses propres variables) et de
// chaque compagnon (même statut d'entité qu'un habitant de monde, voir
// core/state.js/header — aucun n'en déclare aujourd'hui, mais le mécanisme
// reste correct par construction plutôt que supposé toujours vide).
function resetVolatileVariablesInSession(session) {
  const partyVariables = resetVolatileInBag(session.variables);

  const worlds = {};
  let worldsChanged = false;
  for (const [id, world] of Object.entries(session.worlds)) {
    const patched = resetVolatileVariablesInWorld(world);
    worlds[id] = patched;
    if (patched !== world) worldsChanged = true;
  }

  const companions = session.companions.map((companion) => {
    const variables = resetVolatileInBag(companion.variables);
    return variables === companion.variables ? companion : { ...companion, variables };
  });
  const companionsChanged = companions.some((c, i) => c !== session.companions[i]);

  if (partyVariables === session.variables && !worldsChanged && !companionsChanged) return session;
  return {
    ...session,
    variables: partyVariables,
    worlds: worldsChanged ? worlds : session.worlds,
    companions: companionsChanged ? companions : session.companions,
  };
}

export function serializeGame(session) {
  const withoutEphemerals = stripEphemeralEntities(session);
  const withResetVolatiles = resetVolatileVariablesInSession(withoutEphemerals);
  return { version: SAVE_VERSION, data: withResetVolatiles };
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
    face.indoor !== undefined
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
// que migratePrefs). Version inconnue -> null (aucun chemin de montée),
// traité comme un échec par deserializeGame.
function migrateSave(raw) {
  if (raw.version !== SAVE_VERSION) return null;

  let data = raw.data;
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

  // variables (portée "party", voir core/state.js/createInitialState,
  // core/variables.js) : absent d'une sauvegarde antérieure à ce mécanisme
  // -> sac vide `{}`, même politique que perceptionActive/weather ci-dessus.
  if (!data.variables || typeof data.variables !== "object") {
    data = { ...data, variables: {} };
  }

  // improvements (voir core/improvements.js/IMPROVEMENT_REGISTRY,
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

// Valide la forme MINIMALE d'une partie déjà migrée : player/worlds/
// activeWorldId présents, du bon type, et le monde actif réellement
// présent dans worlds. companions (déjà rebouché par migrateSave si
// absent, voir plus haut) doit être un tableau. Ne revalide pas chaque
// champ d'entité un par un (ce serait dupliquer parseScene) — l'objectif
// est de détecter une donnée manifestement corrompue ou étrangère, pas de
// rejouer la validation de scène.
function isPlausibleSession(data) {
  if (!data || typeof data !== "object") return false;
  if (!data.player || typeof data.player !== "object" || typeof data.player.x !== "number") return false;
  if (!data.worlds || typeof data.worlds !== "object") return false;
  if (typeof data.activeWorldId !== "string") return false;
  if (!data.worlds[data.activeWorldId]) return false;
  if (!Array.isArray(data.companions)) return false;
  if (!Array.isArray(data.bag)) return false;
  return true;
}

// Désenveloppe et valide une sauvegarde brute (donnée SUSPECTE par
// définition : disque, futur import fichier...) -> { success, session } ou
// { success: false, reason }. Ne lève jamais : toute donnée douteuse donne
// un échec clair, jamais une partie à moitié chargée.
// reason ∈ "format" (pas un objet exploitable), "version" (inconnue, aucune
// migration), "invalid" (migrée mais structure implausible).
//
// `registry` (optionnel, INJECTÉ comme pour parseScene — le core n'importe
// jamais le registre de contenu) : s'il est fourni, les entités d'un type
// absent du registre sont retirées et listées dans `droppedEntities`.
// Sans registre, aucun filtrage (vérifications du core). Toujours, quel que
// soit le registre : objets inconnus retirés (`droppedItems`), références
// de contenu cassées neutralisées (`brokenReferences`, voir
// repairContentReferences).
export function deserializeGame(raw, { registry } = {}) {
  if (!raw || typeof raw !== "object" || typeof raw.version !== "number") {
    return { success: false, reason: "format" };
  }

  const data = migrateSave(raw);
  if (data === null) {
    return { success: false, reason: "version" };
  }
  if (!isPlausibleSession(data)) {
    return { success: false, reason: "invalid" };
  }

  // Objets et références : toujours vérifiés (registres et tables du core).
  const items = dropUnknownItems(data);
  const references = repairContentReferences(items.data);
  const repairs = { droppedItems: items.dropped, brokenReferences: references.broken };
  if (!registry) return { success: true, session: references.data, droppedEntities: [], ...repairs };
  const filtered = dropUnknownEntityTypes(references.data, registry);
  return { success: true, session: filtered.data, droppedEntities: filtered.dropped, ...repairs };
}
