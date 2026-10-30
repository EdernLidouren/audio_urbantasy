// REGISTRE des entrées sonores d'une scène (voir ./entity-sound-entry.js) :
// la face courante et, pour une scène à deux faces, l'AUTRE face. Suit la vie
// des entités pendant la scène — apparitions (entités éphémères...),
// disparitions (ramassage), consommation — et fournit l'entité VIVANTE de
// chaque entrée (position et état du tick courant, jamais la copie figée au
// montage).

import registry from "../../entities/types/index.js";
import { getActiveWorld, getInactiveFace } from "../../core/state.js";
import { offeredArticle } from "../../core/display.js";
import { buildEntitySoundEntry } from "./entity-sound-entry.js";

// `handover` : balises continues transmises par la scène précédente (voir
// buildEntitySoundEntry). Les entrées sont construites AVANT le bus de
// réverb : créer un Howl garantit que Howler.ctx existe quand le bus est
// construit (voir ./city-scene.js) — d'où connectReverb, appelé ensuite.
export function createEntitySounds({ getSession, handover = null }) {
  const initialWorld = getActiveWorld(getSession());
  const entitySounds = initialWorld.entities.map((entity) => buildEntitySoundEntry(entity, getSession(), { handover }));

  // AUTRE face : null pour une scène simple. Jamais de compagnons ici
  // (getInactiveFace) : ils suivent le joueur.
  const initialOtherFace = getInactiveFace(getSession());
  const otherEntitySounds = initialOtherFace
    ? initialOtherFace.entities.map((entity) =>
        buildEntitySoundEntry(entity, getSession(), {
          otherFace: true,
          handover,
        })
      )
    : null;

  // Son de collision par entité (optionnel). Le joueur ne heurte jamais
  // l'autre face (isolation stricte) : face courante seulement.
  const collisionSoundByEntityId = new Map(entitySounds.map(({ entity }) => [entity.id, registry[entity.type].collisionSound]));

  // Ids déjà traités, pour n'arrêter une balise qu'une fois : entité
  // disparue du monde, ou balise coupée pour de bon — collectible consommé,
  // présentoir vidé (l'entité, elle, reste dans le monde).
  const removedEntityIds = new Set();
  const spentBeaconIds = new Set();

  let reverbBusInput = null;

  // Branche les balises continues au bus de réverb de la scène, puis toute
  // entrée ajoutée plus tard.
  function connectReverb(reverbBus) {
    reverbBusInput = reverbBus.input;
    for (const { sound, beaconReverbSend } of [...entitySounds, ...(otherEntitySounds ?? [])]) {
      if (sound) sound.sendToReverb(reverbBusInput, beaconReverbSend);
    }
  }

  // Entité apparue EN COURS de scène : même construction qu'au montage.
  // Pas de préchargement pour elle : au pire, un premier son légèrement en
  // retard le temps du décodage.
  function addLateEntitySoundEntry(entity) {
    const entry = buildEntitySoundEntry(entity, getSession());
    entitySounds.push(entry);
    if (entry.sound) entry.sound.sendToReverb(reverbBusInput, entry.beaconReverbSend);
    collisionSoundByEntityId.set(entity.id, registry[entity.type].collisionSound);
    return entry;
  }

  function addLateOtherEntitySoundEntry(entity) {
    const entry = buildEntitySoundEntry(entity, getSession(), {
      otherFace: true,
    });
    otherEntitySounds.push(entry);
    if (entry.sound) entry.sound.sendToReverb(reverbBusInput, entry.beaconReverbSend);
    return entry;
  }

  // Ajoute une entrée pour toute entité apparue depuis le dernier tick. Les
  // listes ne font que CROÎTRE pendant la vie de la scène (une disparition
  // est traitée par cleanupRemovedEntities) : un id connu le reste.
  function syncNewEntitySounds(world) {
    const knownIds = new Set(entitySounds.map(({ entity }) => entity.id));
    for (const entity of world.entities) {
      if (!knownIds.has(entity.id)) addLateEntitySoundEntry(entity);
    }
  }

  function syncNewOtherEntitySounds(otherFace) {
    if (!otherEntitySounds) return;
    const knownIds = new Set(otherEntitySounds.map(({ entity }) => entity.id));
    for (const entity of otherFace.entities) {
      if (!knownIds.has(entity.id)) addLateOtherEntitySoundEntry(entity);
    }
  }

  // Entités VIVANTES par id. Une entité retirée du monde (ramassée...) y
  // figure "éteinte" (present:false) plutôt qu'absente : tous les appelants
  // savent déjà traiter present:false comme "comme si absente". Aucune
  // bascule "exited" n'est synthétisée ici (plusieurs appelants hors tick) :
  // l'arrêt réel du son est fait par cleanupRemovedEntities.
  function liveEntitiesById() {
    const byId = new Map(getActiveWorld(getSession()).entities.map((entity) => [entity.id, entity]));
    for (const { entity } of entitySounds) {
      if (!byId.has(entity.id)) byId.set(entity.id, { ...entity, present: false });
    }
    return byId;
  }

  function liveOtherEntitiesById(otherFace) {
    const byId = new Map(otherFace.entities.map((entity) => [entity.id, entity]));
    for (const { entity } of otherEntitySounds) {
      if (!byId.has(entity.id)) byId.set(entity.id, { ...entity, present: false });
    }
    return byId;
  }

  // Entrée sonore + entité VIVANTE d'un id : face courante d'abord
  // (forcedMuffle 0), puis l'autre face (forcedMuffle 1). Relu à chaque
  // appel : après une bascule de face, le même id change de face. `live` est
  // null si l'entité a quitté le monde.
  function findEntitySource(targetId) {
    const session = getSession();
    const activeEntry = entitySounds.find((e) => e.entity.id === targetId);
    if (activeEntry) {
      const live = getActiveWorld(session).entities.find((e) => e.id === targetId) || null;
      return { entry: activeEntry, live, forcedMuffle: 0 };
    }
    const otherEntry = otherEntitySounds && otherEntitySounds.find((e) => e.entity.id === targetId);
    if (otherEntry) {
      const otherFace = getInactiveFace(session);
      const live = (otherFace && otherFace.entities.find((e) => e.id === targetId)) || null;
      return { entry: otherEntry, live, forcedMuffle: 1 };
    }
    return null;
  }

  // Arrête pour de bon la balise d'une entité disparue du monde (jamais de
  // résidu sonore après un ramassage). Pas d'exitSound : une disparition
  // n'est pas une bascule de présence.
  function cleanupRemovedEntities(world) {
    const liveIds = new Set(world.entities.map((entity) => entity.id));
    for (const entry of entitySounds) {
      if (liveIds.has(entry.entity.id) || removedEntityIds.has(entry.entity.id)) continue;
      removedEntityIds.add(entry.entity.id);
      if (entry.sound) entry.sound.stop();
    }
  }

  // Vrai si la balise de l'entité vivante doit se taire pour de bon : un
  // collectible consommé dont le type déclare muteOnConsumed (voir
  // doc/entity-model.md/"Collectible persistant"), ou un présentoir dont
  // l'article vient d'être acheté (voir doc/entity-model.md/"Présentoirs" —
  // un présentoir vide ne sonne rien ; au montage suivant, sa balise n'est
  // même pas construite).
  function isSpent(entry, live) {
    if (entry.muteOnConsumed && live.consumed) return true;
    return Boolean(live.display) && offeredArticle(live) === null;
  }

  // Coupe pour de bon les balises éteintes (voir isSpent) — y compris une
  // entité déjà consommée retrouvée au montage.
  function muteSpentBeacons(world) {
    for (const entry of entitySounds) {
      if (!entry.sound || spentBeaconIds.has(entry.entity.id)) continue;
      const live = world.entities.find((entity) => entity.id === entry.entity.id);
      if (live && isSpent(entry, live)) {
        entry.sound.stop();
        spentBeaconIds.add(entry.entity.id);
      }
    }
  }

  return {
    initialWorld,
    entitySounds,
    otherEntitySounds,
    connectReverb,
    syncNewEntitySounds,
    syncNewOtherEntitySounds,
    liveEntitiesById,
    liveOtherEntitiesById,
    findEntitySource,
    cleanupRemovedEntities,
    muteSpentBeacons,
    isBeaconSpent: (entityId) => spentBeaconIds.has(entityId),
    collisionSoundFor: (entityId) => collisionSoundByEntityId.get(entityId),
  };
}
