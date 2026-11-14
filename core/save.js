// Forme d'une SAUVEGARDE de partie : enveloppe versionnée { version, data }
// — même patron que lib/preferences.js (voir migratePrefs là-bas), pour
// une seule logique de montée de version dans tout le projet. Pur : aucun
// accès disque ici (ça reste à la charge de la vue, voir
// view/save-storage.js), juste la forme et sa validation. La partie
// (session) est déjà sérialisable de bout en bout (voir l'audit dans
// core/checks/save.check.js) : ce module se contente de l'envelopper/
// désenvelopper et de vérifier sa structure minimale au désenveloppement —
// jamais de confiance aveugle dans une donnée qui vient du disque.
//
// La forme est EN CLAIR ici ; l'obscurcissement sur disque est l'affaire
// de view/save-storage.js (voir lib/obfuscate.js). La MONTÉE d'une sauvegarde
// lue (rebouchages, renommages de contenu, conversions) et la réparation de ses
// références vivent dans core/save-migrate.js.

import { stripEphemeralsFromWorld, isTwoSided, withActiveWorld } from "./state.js";
import { dropUnknownEntityTypes, dropUnknownItems, migrateSave, repairContentReferences, repairSavedMarbleBags } from "./save-migrate.js";

export const SAVE_VERSION = 1;

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
// parseScene/parseEntity (voir core/save-migrate.js/migrateSave, qui travaille
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
// SIMPLE ou À DEUX FACES, même distinction que core/save-migrate.js/backfillWorld.
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
// core/world-load.js/prepareLoadedWorld, comme le retour des entités
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

// Valide la forme MINIMALE d'une partie déjà migrée : player/worlds/
// activeWorldId présents, du bon type, et le monde actif réellement
// présent dans worlds. companions (déjà rebouché par migrateSave si
// absent) doit être un tableau. Ne revalide pas chaque
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
// repairContentReferences), sacs de billes remis en forme (`marbleBags`, voir
// core/marble-bags.js/repairMarbleBags).
export function deserializeGame(raw, { registry } = {}) {
  if (!raw || typeof raw !== "object" || typeof raw.version !== "number") {
    return { success: false, reason: "format" };
  }

  if (raw.version !== SAVE_VERSION) {
    return { success: false, reason: "version" };
  }
  const data = migrateSave(raw.data);
  if (!isPlausibleSession(data)) {
    return { success: false, reason: "invalid" };
  }

  // Objets et références : toujours vérifiés (registres et tables du core). Les sacs
  // de billes : remis en forme, jamais perdus en silence (core/marble-bags.js).
  const items = dropUnknownItems(data);
  const references = repairContentReferences(items.data);
  const bags = repairSavedMarbleBags(references.data);
  const repairs = { droppedItems: items.dropped, brokenReferences: references.broken, marbleBags: bags.repairs };
  if (!registry) return { success: true, session: bags.data, droppedEntities: [], ...repairs };
  const filtered = dropUnknownEntityTypes(bags.data, registry);
  return { success: true, session: filtered.data, droppedEntities: filtered.dropped, ...repairs };
}
