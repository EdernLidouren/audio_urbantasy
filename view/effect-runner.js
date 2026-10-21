// EXÉCUTION DES EFFETS d'une action (voir core/effects.js pour la partition
// core/vue, doc/scripting.md/"Effets d'action") : les effets d'ÉTAT sont
// délégués au core par le gestionnaire injecté, les effets de RENDU
// (playSound, announce) et l'effet MIXTE (teleport) sont joués ici, dans
// l'ordre déclaré. Utilisé par l'interaction (view/interaction.js), par les
// handlers de kind (son de ramassage, view/action-execution.js) et par les
// triggers horaires (rendu seul, view/game-clock.js).

import { announce } from "../lib/announce.js";
import { t } from "../data/i18n/index.js";
import { playDescribedOneShot } from "../lib/audio.js";
import { resolveAsset } from "../lib/assets.js";
import { interfaceVolumeFactor } from "./audio/volume-factors.js";
import { teleportHandler, variableEffectsHandler, positionedSoundPlayer } from "./interaction-handlers.js";

// Son de RAMASSAGE : rôle `sounds.pickup` DÉCLARÉ par l'archétype de l'objet
// (cascade instance -> archétype par fusion, comme tout rôle de `sounds` —
// voir doc/entity-model.md/"Vocabulaire de sons"), SANS défaut : un objet
// sans ce rôle est ramassé en silence (l'annonce suffit) : aucun son
// générique imposé ("tout son est déclaré, jamais imposé"). Rendu DIÉGÉTIQUE
// via le même chemin qu'un effet "playSound" (runPlaySoundEffect ci-dessous :
// positionné sur l'entité, soumis aux filtres de scène) — à appeler AVANT
// l'effet d'état qui retire l'entité, tant qu'elle a encore une voix dans
// la scène.
export function playEntityPickupSound(entity) {
  const descriptor = entity.sounds && entity.sounds.pickup;
  if (!descriptor) return;
  runPlaySoundEffect(entity, descriptor);
}

// Effet "playSound" (voir core/effects.js, doc/scripting.md/"Effets
// d'action") — DEUX NATURES DE RENDU, jamais un troisième mécanisme :
//
// MÉTA : son CENTRÉ, NON positionné,
// IGNORE tout filtre actif — le descripteur partagé { path, gain?,
// pitchVariation?, reverbSend? } joué via playDescribedOneShot
// (lib/audio.js), composé avec `interfaceVolume` comme tout son d'UI/
// interaction du projet (view/menu-sounds.js). Aucun bus de réverb
// accessible depuis ce fichier : reverbSend
// reste donc sans effet en pratique ici.
//
// DIÉGÉTIQUE : son POSITIONNÉ sur une entité de la scène, soumis
// aux MÊMES filtres actifs qu'un beacon/vocal à cet instant (occlusion
// RECTO/VERSO, étouffement de perception, distance) — délégué ENTIÈREMENT à
// positionedSoundPlayer (voir view/interaction-handlers.js, view/audio/oneshots.js/
// playEntityOneShot) : AUCUNE logique de filtrage dupliquée ici, ce fichier
// ne fait que router vers la BONNE primitive.
//
// PROVENANCE (résout la cible, voir resolvePlaySoundTarget ci-dessous) et
// NATURE (résout diégétique/méta, voir resolvePlaySoundNature ci-dessous)
// sont calculées séparément, puis composées ICI. Aucun son de refus
// GÉNÉRIQUE en dur : un effet "playSound" est un CHOIX DE CONTENU explicite
// (voir refusalEffects, view/interaction.js), jamais une valeur par défaut
// du système. Défensif comme tout son du
// projet : fichier absent -> avertit, ne plante jamais.

// `effect.at` (optionnel, id d'entité) : PROVENANCE explicite — le son émane
// de LA POSITION de CETTE entité, pas forcément celle qui porte l'action
// (ex. un effet sur une porte qui fait sonner une AUTRE entité, plus loin).
// Non précisé, DANS le contexte d'une action d'entité (`entity` fourni) ->
// l'entité PORTEUSE elle-même (cas courant : la fenêtre grince à SA
// position, aucune déclaration nécessaire). Non précisé, HORS contexte
// d'entité (`entity` absent — futur effet global/trigger de partie) ->
// `undefined`, résolu ensuite en CENTRÉ JOUEUR par resolvePlaySoundNature.
function resolvePlaySoundTarget(entity, effect) {
  if (effect.at !== undefined) return effect.at;
  return entity ? entity.id : undefined;
}

// `effect.nature` (optionnel, "diegetic" | "meta") : SURCHARGE explicite,
// pour les cas exotiques (un son positionné qu'on veut méta, ou l'inverse).
// Non précisée -> DÉRIVÉE de la PROVENANCE (resolvePlaySoundTarget) : une
// cible résolue -> diégétique (positionné, filtré) ; aucune cible (centré
// joueur) -> méta (non filtré) — dans le cas courant, on ne déclare NI `at`
// NI `nature`, les deux tombent du contexte.
function resolvePlaySoundNature(effect, targetId) {
  if (effect.nature !== undefined) return effect.nature;
  return targetId !== undefined ? "diegetic" : "meta";
}

function playMetaSound(descriptor) {
  try {
    playDescribedOneShot(resolveAsset(descriptor.path), {
      gain: descriptor.gain,
      pitchVariation: descriptor.pitchVariation,
      reverbSend: descriptor.reverbSend,
      volumeFactor: interfaceVolumeFactor(),
    });
  } catch (error) {
    console.warn(`interact: son d'effet indisponible ("${descriptor.path}") : ${error.message}`);
  }
}

// `options.departing` : voir runEffects — transmis tel quel au lecteur
// positionné (view/audio/oneshots.js/playEntityOneShot).
function runPlaySoundEffect(entity, effect, options = {}) {
  const targetId = resolvePlaySoundTarget(entity, effect);
  const nature = resolvePlaySoundNature(effect, targetId);
  // Diégétique sans cible résolvable (ex. nature forcée sans `at` ni
  // contexte d'entité) ou sans provider câblé (hors ville) -> repli MÉTA,
  // défensif, jamais un plantage ni un son perdu en silence.
  if (nature === "diegetic" && targetId !== undefined && positionedSoundPlayer) {
    positionedSoundPlayer(targetId, effect, options);
    return;
  }
  playMetaSound(effect);
}

// Exécute une LISTE d'effets (voir core/effects.js pour la partition
// core/vue, doc/scripting.md/"Effets") — `action.effects` (condition
// RÉUSSIT) ou `action.refusalEffects` (condition ÉCHOUE, voir
// view/interaction.js/interact), MÊME fonction pour les deux, MÊME
// vocabulaire. ROUTAGE : les effets d'ÉTAT (setVariable/toggleVariable/
// addVariable) sont délégués EN UN SEUL APPEL à variableEffectsHandler (le
// gestionnaire enregistré par view/action-handlers.js, seul à détenir
// getSession/setSession — voir view/interaction-handlers.js) — no-op silencieux
// sur un tableau qui n'en contient aucun (core/variables.js/
// applyActionEffects ignore déjà tout type qu'il ne reconnaît pas). Les
// effets de RENDU (playSound/announce) et l'effet MIXTE (teleport, voir
// core/effects.js) sont ensuite REJOUÉS ICI, DANS L'ORDRE DÉCLARÉ — l'ordre
// relatif entre un effet d'état (invisible/inaudible au moment où il
// s'applique) et un effet de rendu/mixte n'a donc aucune importance
// observable, SEUL l'ordre ENTRE effets de rendu/mixtes compte (ex. le son
// AVANT l'annonce de confirmation) — un
// "teleport" typiquement DERNIER de sa liste (le sas gèle le jeu, tout
// effet déclaré APRÈS lui dans la MÊME liste s'exécuterait quand même,
// avant que le sas ne commence, puisque teleportHandler n'est jamais
// attendu ici).
//
// SON DE DÉPART : une liste qui contient un "teleport" décrit l'acte de
// PARTIR — ses playSound (ex. le grincement de la porte) sont joués
// `departing` : positionnés, mais hors du fondu du sas (voir
// view/audio/oneshots.js/playEntityOneShot), pour finir de résonner
// pendant la transition au lieu d'être coupés.
export function runEffects(entity, effects) {
  if (!effects) return;
  if (variableEffectsHandler) variableEffectsHandler(entity, effects);
  const departing = effects.some((effect) => effect.type === "teleport");
  for (const effect of effects) {
    if (effect.type === "teleport") {
      if (teleportHandler) teleportHandler(effect);
    } else {
      runRenderEffects(entity, [effect], { departing });
    }
  }
}

// Effets de RENDU seuls (playSound/announce, voir core/effects.js/
// RENDER_EFFECT_TYPES), dans l'ordre déclaré — les autres types traversent
// sans effet. Exporté pour les triggers horaires (view/game-clock.js/
// advance) : le core a DÉJÀ appliqué leurs effets d'état
// (core/triggers.js/applyDueTriggers), seul le rendu reste à jouer ici,
// avec la même provenance (l'entité porteuse) qu'un effet d'action.
export function runRenderEffects(entity, effects, options = {}) {
  for (const effect of effects) {
    if (effect.type === "playSound") {
      runPlaySoundEffect(entity, effect, options);
    } else if (effect.type === "announce") {
      announce(t(effect.key), { assertive: effect.assertive !== false });
    }
  }
}
