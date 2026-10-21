// PRÉCHARGEMENT d'une scène : amorce le décodage de tout ce qu'elle pourrait
// jouer AVANT que le jeu ne reprenne. Une lecture demandée avant la fin du
// décodage est mise en attente par Howler : audible comme un pas en retard
// (observé : chaque membre d'un pool de pas jamais tiré était "à froid" à
// son premier tirage). Asynchrone, jamais bloquant : seule la création des
// Howl a lieu ici.
//
// L'autre face d'une scène à deux faces n'est pas préchargée : entendue
// étouffée, jamais au premier plan, elle doublerait les requêtes au montage
// pour un gain marginal.

import { playOneShot, preloadOneShot, preloadMusic } from "../../lib/audio.js";
import { resolveAsset, assetKeyMembers } from "../../lib/assets.js";
import { gaitOf } from "../../core/equipment.js";
import player from "../../entities/player.js";
import {
  PLAYER_GAIT_POOL,
  MOVEMENT_SOUND,
  FOOTSTEP_FLOOR_PATH,
  footstepKey,
  resolveFootstepPath,
  footstepCandidateKeys,
} from "./footsteps.js";
import { resolveMusicForPhase } from "./layers.js";

// `world` : le monde actif au montage ; `entitySounds` : les entrées de la
// face courante ; `collisionSoundFor(id)` : leur son de collision (voir
// ./entity-sounds.js).
export function preloadSceneAudio(session, world, entitySounds, collisionSoundFor) {
  warmUpFootsteps(session, world, entitySounds);
  preloadSceneSounds(world, entitySounds, collisionSoundFor);
  preloadSceneMusic(world);
}

// "Réchauffe" le premier pas de chaque mobile EN PREMIER : une vraie lecture
// à volume 0 force l'allocation complète de la voix, et placer ces fichiers
// en tête garantit qu'ils partent parmi les premières requêtes (le
// navigateur plafonne à ~6 requêtes simultanées par origine). Le balayage
// complet qui suit retrouve ces Howl déjà créés (dédoublonnage par chemin).
function warmUpFootsteps(session, world, entitySounds) {
  const warmUp = (atX, candidates) => playOneShot(resolveAsset(resolveFootstepPath(world, atX, candidates)), { volume: 0 });
  warmUp(session.player.x, {
    gait: gaitOf(session.equipment),
    naturalWalk: player.naturalWalk,
    ownPath: MOVEMENT_SOUND.path,
  });
  for (const { entity, movementPath, gait, naturalWalk } of entitySounds) {
    if (!movementPath) continue;
    warmUp(entity.x, { gait, naturalWalk, ownPath: movementPath });
  }
}

// TOUS les membres des pools que la scène pourrait tirer : sources
// intermittentes, pas possibles de chaque entité et du joueur (tous ses
// gaits : on peut changer de chaussures en pleine visite), sons de collision
// et de transition, sols de la scène (sol par défaut compris).
function preloadSceneSounds(world, entitySounds, collisionSoundFor) {
  const preloadKeys = new Set();
  for (const { intermittentSources, movementPath, gait, naturalWalk, entity, enterSound, exitSound } of entitySounds) {
    for (const src of intermittentSources) preloadKeys.add(src.path);
    for (const key of footstepCandidateKeys({ gait, naturalWalk, ownPath: movementPath })) preloadKeys.add(key);
    const collisionSound = collisionSoundFor(entity.id);
    if (collisionSound) preloadKeys.add(collisionSound);
    if (enterSound) preloadKeys.add(enterSound.path);
    if (exitSound) preloadKeys.add(exitSound.path);
  }
  for (const gait of PLAYER_GAIT_POOL) {
    for (const key of footstepCandidateKeys({ gait, naturalWalk: player.naturalWalk, ownPath: MOVEMENT_SOUND.path })) {
      preloadKeys.add(key);
    }
  }
  preloadKeys.add(FOOTSTEP_FLOOR_PATH);
  preloadKeys.add(footstepKey("surfaces", world.defaultSurface));
  for (const segment of world.segments) preloadKeys.add(footstepKey("surfaces", segment.surface));

  for (const key of preloadKeys) {
    for (const member of assetKeyMembers(key)) preloadOneShot(member);
  }
}

// Musique : les pools de jour ET de nuit (une bascule de phase ne doit
// jamais tomber sur un morceau jamais amorcé).
function preloadSceneMusic(world) {
  for (const phase of ["day", "night"]) {
    const musicKey = resolveMusicForPhase(world, phase);
    if (musicKey) {
      for (const member of assetKeyMembers(musicKey)) preloadMusic(member);
    }
  }
}
