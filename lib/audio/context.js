// Contexte audio (déverrouillage, maintien éveillé) et GAIN DE COUCHE ENTITÉS
// (le fondu de transition de scène, sous lequel passent tous les sons
// d'entité et la réverb).

// Le contexte audio démarre suspendu tant qu'aucun geste utilisateur n'a eu
// lieu (règle autoplay des navigateurs). À invoquer au premier keydown.
export function ensureAudioUnlocked() {
  if (Howler.ctx && Howler.ctx.state === "suspended") {
    Howler.ctx.resume();
  }
}

// Empêche l'auto-suspension du contexte (comportement par défaut de
// Howler : le contexte se suspend après une période d'inactivité audio,
// pour économiser des ressources) — si le joueur reste immobile un moment
// avant son premier pas, le contexte peut déjà être suspendu au moment du
// déclenchement, ajoutant un resume() asynchrone au décodage à froid
// (voir preloadOneShot) : deux causes cumulables du même symptôme ("le pas
// saute au début"). Réveille aussi le contexte s'il est déjà suspendu, même
// logique qu'ensureAudioUnlocked mais réutilisable indépendamment du tout
// premier appui touche. Voir view/audio/city-scene.js, appelé au montage
// d'une scène — jamais réactivé ensuite, le contexte reste éveillé pour
// toute la session de jeu une fois une scène entrée.
export function keepAudioContextAwake() {
  Howler.autoSuspend = false;
  if (Howler.ctx && Howler.ctx.state === "suspended") {
    Howler.ctx.resume();
  }
}

// --- Gain de couche ENTITÉS (fondu de transition de scène) ---
//
// Un SEUL GainNode, au-dessus de TOUTE la couche sonore POSITIONNÉE/
// D'ENTITÉS (balises continues, vocaux, pas, one-shots positionnés, bus de
// réverb — voir ./oneshots.js/routeInstance, ./positioned.js/
// createPositionedSound et ./reverb.js/createReverbBus, tous branchés ICI
// plutôt que directement sur Howler.masterGain) — JAMAIS la musique ni
// l'ambiance (canaux globaux séparés, voir ./channels.js/GLOBAL_CHANNELS, qui
// restent branchés directement sur Howler.masterGain, hors de portée de ce
// nœud). Sert le "fondu au noir sonore" d'une transition de scène (voir
// view/world-travel.js/performTransition) : fondre ce gain à 0 avant de
// détruire la scène courante, le remonter à 1 une fois la scène cible
// construite — musique et ambiance suivent leur PROPRE logique de
// continuité/crossfade en parallèle, entièrement indifférentes à ce nœud.
//
// Rampe via l'AUTOMATION NATIVE de l'AudioParam (linearRampToValueAtTime),
// PAS le mécanisme de rampe JS par relecture périodique déjà utilisé pour
// le fondu du filtre d'étouffement mondain (mundaneMuffleRampFrom/To/
// StartedAt, voir view/audio/city-scene.js) : cette dernière dépend d'une
// relecture déclenchée par le TICK de jeu (applyEntityAudio, appelé depuis
// onTick) — or la séquence de transition tourne PENDANT que le jeu est
// gelé (sas, aucun tick, voir performTransition), donc rien n'y rappelle
// cette relecture. L'automation native d'un AudioParam, elle, progresse sur
// l'horloge du contexte audio, indépendamment de tout tick JS : c'est la
// SEULE des deux approches qui fonctionne pendant un gel — même PRINCIPE
// directeur (de/vers une valeur, sur une durée, jamais un saut sec) que la
// rampe existante, porté par l'outil natif adapté à un simple paramètre de
// nœud Web Audio plutôt que recopié tel quel.
let entityLayerGainNode = null;

export function ensureEntityLayerGain() {
  if (!Howler.ctx) return null;
  if (entityLayerGainNode) return entityLayerGainNode;
  entityLayerGainNode = Howler.ctx.createGain();
  entityLayerGainNode.gain.value = 1;
  entityLayerGainNode.connect(Howler.masterGain);
  return entityLayerGainNode;
}

// Programme la rampe (voir header) : ANNULE toute automation en cours
// (cancelScheduledValues) et repart de la valeur COURANTE (setValueAtTime)
// — un fondu interrompu par un autre reprend proprement depuis où il en
// est, jamais un saut. Sans contexte audio (Howler.ctx absent, ex. premier
// geste utilisateur pas encore fait), no-op silencieux : la séquence de
// transition (voir son appelant) continue quand même, simplement sans
// effet audible à faire fondre.
export function rampEntityLayerGain(target, durationMs) {
  const gain = ensureEntityLayerGain();
  if (!gain) return;
  const now = Howler.ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(target, now + durationMs / 1000);
}
