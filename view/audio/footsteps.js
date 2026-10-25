// PAS — choix du fichier de pas (pur), déclenchement à la distance
// parcourue (pur), et sons du JOUEUR : pas de marche, pas de trajet et
// d'arrivée d'une bascule de face, sons de collision. Les pas des ENTITÉS
// mobiles réutilisent les mêmes briques (voir ./entity-audio.js).

import { playOneShot } from "../../lib/audio.js";
import { resolveAsset, hasAsset } from "../../lib/assets.js";
import { TUNING_DEFAULTS, resolveTuning } from "../../config/tuning.js";
import { MOVE_STEP, getActiveWorld } from "../../core/state.js";
import { surfaceAt, surfaceProps } from "../../core/surfaces.js";
import { gaitOf } from "../../core/equipment.js";
import { ITEM_REGISTRY } from "../../core/items.js";
import player from "../../entities/player.js";
import { footstepVolumeFactor } from "./volume-factors.js";

// Pas du joueur : réglage global (le joueur n'est pas une entité).
export const STEP_DISTANCE = TUNING_DEFAULTS.stepDistance;

// Tous les gaits que le JOUEUR peut porter : "barefoot" (rien aux pieds) +
// celui de chaque objet équipable au slot "feet". Déduit du registre : un
// nouvel objet équipable s'y ajoute seul. Sert au préchargement : on peut
// changer de chaussures en pleine visite.
export const PLAYER_GAIT_POOL = [
  "barefoot",
  ...new Set(Object.values(ITEM_REGISTRY).filter((props) => props.slot === "feet").map((props) => props.gait)),
];

// Son de déplacement du joueur. Son envoi de réverb a son propre défaut
// (footstepReverbSend), délibérément distinct de celui des entités.
export const MOVEMENT_SOUND = player.sounds.movement;
const FOOTSTEP_REVERB_SEND =
  MOVEMENT_SOUND.reverbSend !== undefined ? MOVEMENT_SOUND.reverbSend : TUNING_DEFAULTS.footstepReverbSend;

// Anti-mitraillette du son de COLLISION seulement : le pas, lui, est borné
// par la distance (voir stepWalker), jamais par le temps.
const MIN_STEP_INTERVAL_MS = TUNING_DEFAULTS.minStepIntervalMs;

// Cadence des pas de trajet d'une bascule de face (voir playTransitionSteps).
const TRANSITION_STEP_INTERVAL_MS = TUNING_DEFAULTS.transitionStepIntervalMs;
const TRANSITION_STEP_DELAY_MS = TUNING_DEFAULTS.transitionStepDelayMs;

// Clé d'asset "<name>_walk" sous assets/sounds/footsteps/<catégorie>/ —
// "surfaces" (le sol) ou "gaits" (chaussure/allure, et pas naturel : un
// naturalWalk peut réutiliser un nom de gait, ex. "barefoot"). Toujours UNE
// dimension, jamais un produit surface × chaussure (voir doc/entity-model.md,
// "Surfaces de sol et son de pas").
export function footstepKey(category, name) {
  return `assets/sounds/footsteps/${category}/${name}_walk`;
}

// Plancher garanti : le SEUL chemin dont l'existence n'est jamais vérifiée —
// il doit toujours exister dans assets/.
export const FOOTSTEP_FLOOR_PATH = footstepKey("gaits", "shoes");

// Chemin du son de pas d'un mobile (joueur ou entité) au point x d'un monde.
// La vue dérive le fichier du drapeau `neutral` de core/surfaces.js (le core
// ne connaît aucun son). Chaque cran est vérifié avec hasAsset :
//   - sol SPÉCIAL (neutral:false) : "<surface>_walk" s'il existe, sinon on
//     continue comme sur un sol neutre (jamais un silence) ;
//   - "<gait>_walk" si le mobile a un gait et que le pool existe ;
//   - sinon "<naturalWalk>_walk" ;
//   - sinon son propre son (ownPath), sinon le plancher garanti.
// `airborne` (entité isFlying) : le sol n'a aucune prise, la branche
// spéciale est sautée.
export function resolveFootstepPath(world, x, { gait, naturalWalk, ownPath, airborne = false } = {}) {
  const surface = surfaceAt(world, x);
  const props = surfaceProps(surface);

  if (!airborne && props && !props.neutral) {
    const specialKey = footstepKey("surfaces", surface);
    if (hasAsset(specialKey)) return specialKey;
  }

  if (gait) {
    const gaitKey = footstepKey("gaits", gait);
    if (hasAsset(gaitKey)) return gaitKey;
  }

  if (naturalWalk) {
    const naturalKey = footstepKey("gaits", naturalWalk);
    if (hasAsset(naturalKey)) return naturalKey;
  }

  return ownPath || FOOTSTEP_FLOOR_PATH;
}

// Toutes les clés que resolveFootstepPath pourrait choisir pour ce mobile,
// quel que soit le sol — pour le préchargement seulement.
export function footstepCandidateKeys({ gait, naturalWalk, ownPath } = {}) {
  const keys = [];
  if (gait) keys.push(footstepKey("gaits", gait));
  if (naturalWalk) keys.push(footstepKey("gaits", naturalWalk));
  if (ownPath) keys.push(ownPath);
  return keys;
}

// État d'un "marcheur" (le joueur ou une entité mobile), voir stepWalker.
export function createWalkerState(x) {
  return { lastStepX: x, wasMoving: false, previousX: x };
}

// Déclenchement des pas, UNIQUE pour le joueur et les entités : le débit est
// borné par la DISTANCE parcourue, jamais par un minuteur. `walker` est
// MODIFIÉ en place :
//   - lastStepX : position du dernier pas joué (jalon) ;
//   - wasMoving : le marcheur bougeait-il au tick précédent ;
//   - previousX : sa position au tick précédent — seule façon fiable de
//     distinguer "à l'arrêt" de "entre deux jalons" (lastStepX n'avance que
//     par sauts de stepDistance).
// Au DÉMARRAGE, un pas immédiat (un tapotement bref ne perd jamais son
// premier pas) ; ensuite, un pas par jalon franchi, chacun à SA position
// (donc sur sa propre surface). Un changement de sol ne déclenche rien en
// soi : c'est le jalon suivant qui le fait entendre. Symétrique par
// construction. `playStepAt(atX)` : l'appelant décide COMMENT jouer.
export function stepWalker(walker, x, stepDistance, playStepAt) {
  const isMoving = x !== walker.previousX;

  if (isMoving) {
    if (!walker.wasMoving) {
      playStepAt(x);
      walker.lastStepX = x;
    } else {
      while (Math.abs(x - walker.lastStepX) >= stepDistance) {
        walker.lastStepX += Math.sign(x - walker.lastStepX) * stepDistance;
        playStepAt(walker.lastStepX);
      }
    }
  }

  walker.wasMoving = isMoving;
  walker.previousX = x;
}

// Sons du JOUEUR pour une scène : pas, collision, pas de trajet et
// d'arrivée. `reverbBusInput` : l'entrée du bus de réverb de la scène ;
// `collisionSoundFor(id)` : le son de collision d'une entité (ou rien).
export function createPlayerFootsteps({ getSession, reverbBusInput, collisionSoundFor }) {
  const playerWalker = createWalkerState(getSession().player.x);
  // Collision : canal SÉPARÉ du pas (qui n'a aucun cooldown). Sur le tick
  // où le joueur vient buter, il fait encore un pas normal PUIS heurte : un
  // cooldown commun ferait taire le son de collision.
  const collisionCooldown = { lastAt: -Infinity };
  // Distance que le joueur AURAIT parcourue depuis le début de la butée
  // (x ne bouge pas pendant une butée).
  let collisionAccumX = 0;
  let wasBlocked = false;

  // Son centré sur le joueur, sauté s'il arrive trop tôt après le
  // précédent (pas de file d'attente). Pool résolu à chaque appel : chaque
  // déclenchement peut tirer un fichier différent.
  function playPacedSound(path, reverbSend, cooldown) {
    const now = performance.now();
    if (now - cooldown.lastAt < MIN_STEP_INTERVAL_MS) return false;
    playOneShot(resolveAsset(path), {
      reverbSend,
      reverbBusInput,
      volume: footstepVolumeFactor(),
      entityLayer: true,
    });
    cooldown.lastAt = now;
    return true;
  }

  // Pas du joueur à une position donnée. Le gait est relu dans l'équipement
  // COURANT à chaque pas : changer de chaussures change le pas suivant.
  function playFootstep(atX, world) {
    const gait = gaitOf(getSession().equipment);
    const path = resolveFootstepPath(world, atX, { gait, naturalWalk: player.naturalWalk, ownPath: MOVEMENT_SOUND.path });
    playOneShot(resolveAsset(path), {
      reverbSend: FOOTSTEP_REVERB_SEND,
      reverbBusInput,
      volume: footstepVolumeFactor(),
      entityLayer: true,
    });
  }

  // Pas "MÉTA" (bascule de face) : même choix de fichier, mais ni réverb ni
  // couche entités — c'est le joueur qui marche entre les deux faces, pas un
  // son de l'une d'elles : net quel que soit l'étouffement en cours.
  function playMetaFootstepAt(world, atX, gait) {
    const path = resolveFootstepPath(world, atX, { gait, naturalWalk: player.naturalWalk, ownPath: MOVEMENT_SOUND.path });
    playOneShot(resolveAsset(path), { volume: footstepVolumeFactor() });
  }

  function playCollisionSound(entityId) {
    const path = collisionSoundFor(entityId);
    if (path) playPacedSound(path, FOOTSTEP_REVERB_SEND, collisionCooldown);
  }

  // À chaque tick : pas du joueur (centré, sans pan), puis collision. Une
  // butée contre une entité bloquante (blockedBy, core/reduce.js) REMPLACE
  // le pas : son immédiat au début de la butée (un appui bref doit
  // s'entendre), puis à la cadence de marche tant que le joueur pousse.
  function update(world, x, blockedBy) {
    stepWalker(playerWalker, x, STEP_DISTANCE, (atX) => playFootstep(atX, world));

    const isBlocked = blockedBy !== null;
    if (isBlocked && !wasBlocked) {
      playCollisionSound(blockedBy);
    }
    wasBlocked = isBlocked;

    if (isBlocked) {
      collisionAccumX += MOVE_STEP;
      while (collisionAccumX >= STEP_DISTANCE) {
        collisionAccumX -= STEP_DISTANCE;
        playCollisionSound(blockedBy);
      }
    } else {
      collisionAccumX = 0;
    }
  }

  // Pas de TRAJET d'une bascule de face (voir view/world-travel.js/
  // sideSwitch) : le jeu est gelé et le joueur ne bouge pas, d'où une
  // simple minuterie par pas sur `durationMs`. Sol : celui déclaré par le
  // passage (transitionSurface), sinon le sol par défaut de la face de
  // départ. `transitionSteps` à false (cascade) : aucun pas.
  // Le nombre de pas se compte sur TOUTE la durée ; le premier attend
  // TRANSITION_STEP_DELAY_MS (le son du passage attaque d'abord) et les
  // suivants se répartissent dans le reste : aucun pas perdu, et le pas
  // d'arrivée tombe à la même cadence que les autres.
  function playTransitionSteps(entity, durationMs) {
    if (!resolveTuning("transitionSteps", entity)) return;
    const departureFace = getActiveWorld(getSession());
    const surfaceName = resolveTuning("transitionSurface", entity) ?? departureFace.defaultSurface;
    const transitWorld = { defaultSurface: surfaceName, segments: [] };
    const gait = gaitOf(getSession().equipment);
    const stepCount = Math.max(1, Math.round(durationMs / TRANSITION_STEP_INTERVAL_MS));
    const delayMs = Math.min(TRANSITION_STEP_DELAY_MS, durationMs);
    for (let i = 0; i < stepCount; i++) {
      setTimeout(() => playMetaFootstepAt(transitWorld, 0, gait), delayMs + (i * (durationMs - delayMs)) / stepCount);
    }
  }

  // Pas d'ARRIVÉE, un seul, joué APRÈS la bascule (la face active est déjà
  // celle d'arrivée) sur le VRAI sol du point d'atterrissage : le signal "je
  // pose le pied de l'autre côté".
  function playArrivalStep(entity, arrivalX) {
    if (!resolveTuning("transitionSteps", entity)) return;
    const destinationFace = getActiveWorld(getSession());
    const gait = gaitOf(getSession().equipment);
    playMetaFootstepAt(destinationFace, arrivalX, gait);
  }

  return { update, playTransitionSteps, playArrivalStep };
}
