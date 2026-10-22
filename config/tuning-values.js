// Valeurs de réglage de gameplay/feeling. Donnée pure : AUCUN import — même
// le core peut la lire sans jamais draîner le registre d'entités ni la
// logique de cascade (voir config/tuning.js pour resolveTuning). Ne contient
// que des valeurs qu'on peut tourner à l'oreille sans rien casser — pas
// d'invariant structurel (ceux-là restent dans le fichier qui en dépend :
// TICK_MS/MAX_FRAME_MS dans lib/loop.js, les bornes [-1,1] du pan dans
// view/audio/spatial.js, etc.).
//
// Dernier recours de la cascade (voir lib/tuning.js / resolveTuning) : le
// registre d'entités et les instances peuvent tout ignorer, tout retombe ici.

// Durée (ms) du fondu de la PERCEPTION SURNATURELLE (voir
// core/presence.js/"perceptionActive", view/audio/layers.js,
// view/audio/muffle.js) —
// crossfade musique/ambiance vers les pools surnaturels ET rampe du filtre
// d'étouffement des entités mondaines, LA MÊME durée pour les deux (une
// seule transition ressentie, pas deux désynchronisées). Const à part
// (jamais un littéral direct dans TUNING_DEFAULTS) : perceptionCooldownMs
// juste en dessous DOIT rester >= cette valeur + une marge, un lien
// STRUCTUREL, pas seulement documenté en commentaire.
const PERCEPTION_FADE_MS = 2500;
// Marge (ms) AU-DESSUS du fondu ci-dessus avant que la touche de perception
// ne redevienne active — jamais en dessous, sous peine de fondus qui se
// chevauchent/se battent (voir view/perception-toggle.js).
const PERCEPTION_COOLDOWN_MARGIN_MS = 700;

export const TUNING_DEFAULTS = {
  // Unités parcourues par tick de déplacement (à 60 ticks/s). Plus haut =
  // marche plus rapide ; plus bas = plus lente.
  moveStep: 0.04,

  // Distance parcourue entre deux bruits de pas. Plus haut = pas plus
  // espacés (marche qui sonne plus "lente"/plus grande foulée) ; plus bas =
  // pas plus rapprochés.
  stepDistance: 0.6,

  // Distance au-delà de laquelle une entité devient inaudible (volume 0).
  // Plus haut = on l'entend de plus loin ; plus bas = elle disparaît vite.
  audibleRange: 20,

  // Distance latérale à laquelle le pan atteint le maximum gauche/droite.
  // Plus bas = la scène sonore paraît plus étroite/resserrée au centre ;
  // plus haut = il faut s'éloigner davantage pour l'entendre franchement
  // d'un côté.
  panSaturation: 10,

  // Distance en-deçà de laquelle une entité est à portée d'interaction, et
  // donc à plein volume (voir fullVolume). Plus haut = la zone
  // d'interaction est plus large ; plus bas = il faut être plus proche.
  interactRange: 1.0,

  // Délai (ms) pendant lequel un nouvel appui sur Entrée sur la MÊME entité
  // est ignoré en silence (voir view/interaction.js/interact) : empêche la
  // rafale d'une action qui ne se protège pas d'elle-même (volets, porte
  // verrouillée qui refuse, fouille). Horloge réelle, pas le temps de jeu.
  // Plus haut = action moins répétable ; une entité au son long peut le
  // monter sur son archétype ou son instance.
  interactCooldownMs: 700,

  // Volume à l'intérieur de interactRange : plateau plein et stable, le
  // signal "cette entité est interactible". Ne descend jamais en dessous.
  fullVolume: 1.0,

  // Volume-plancher (hors surlignage) juste après avoir quitté
  // interactRange, avant de décroître doucement vers 0 à audibleRange. Plus
  // haut = ce plancher est plus haut ; plus bas = la décroissance vers 0
  // s'entend davantage. Voir "highlight" ci-dessous : ce plancher s'applique
  // à TOUTE entité, surlignée ou non — fullVolume n'est atteint que par une
  // entité highlight:true, une fois sa zone d'interaction rejointe.
  farVolumeMax: 0.5,

  // Surlignage audio de proximité (voir view/audio/spatial.js/
  // volumeForDistance, view/audio/entity-audio.js, doc/entity-model.md) :
  // à portée d'interaction (dist <= interactRange), une entité
  // highlight:true saute à fullVolume — SAUT NET, INSTANTANÉ, pas une
  // rampe : une montée progressive serait quasi inaudible en marchant ou
  // en courant, la fenêtre de présence dans interactRange étant trop
  // courte pour laisser un fondu se terminer. EXPLICITE et INDÉPENDANT de observable/
  // interactable — une entité n'est surlignée QUE si elle (ou son
  // archétype, ou son instance) déclare highlight: true. Ce défaut GLOBAL
  // (false) est le dernier recours de la cascade instance -> archétype ->
  // ce défaut (même mécanisme que gait/naturalWalk) : le décor n'est jamais
  // surligné sans le demander explicitement à l'un de ces deux paliers.
  highlight: false,

  // Pas du joueur pendant une TRANSITION recto/verso (voir
  // entities/types/passage.js, view/audio/footsteps.js/playTransitionSteps/
  // playArrivalStep) : activés PAR DÉFAUT (true) — un passage PHYSIQUE
  // (ruelle, porte dérobée) se traverse à pied, donc se marche à l'oreille.
  // Résolu par la MÊME cascade instance -> archétype -> ce défaut que
  // `highlight` juste au-dessus : un futur passage IMMATÉRIEL (passe-miroir)
  // désactivera ce flag sur SON archétype, sans toucher au défaut global.
  transitionSteps: true,

  // `transitionSurface` (nom de surface, voir core/surfaces.js/
  // SURFACE_REGISTRY) : surcharge OPTIONNELLE de la surface des pas de
  // TRAJET pendant une transition (voir
  // view/audio/footsteps.js/playTransitionSteps) — un passage peut
  // déclarer la sienne (ex. une ruelle PAVÉE, distincte du sol de la
  // scène). AUCUNE entrée ici, comme `gait`/`naturalWalk` (voir
  // doc/entity-model.md) : pas de défaut global sensé pour un nom de
  // surface — non déclaré, `resolveTuning` retombe naturellement sur
  // `undefined`, et c'est CE `undefined` que l'appelant interprète comme
  // "utilise la surface de la face de départ", jamais un défaut figé ici.

  // `transitionSound` (chemin/pool résolu via resolveAsset, voir
  // view/world-travel.js/playSideSwitchSound) : le son DÉCLARÉ d'un
  // franchissement recto/verso (grincement, tintement...) — AUCUNE entrée
  // ici, même raisonnement que `transitionSurface` juste au-dessus : pas
  // de son générique imposé, un passage qui n'en déclare aucun (à
  // l'instance via `tuning`, ou à l'archétype) transite en SILENCE côté
  // son de passage — les rampes d'occlusion et les pas de trajet/arrivée
  // jouent quand même, DEUX choses sonores indépendantes qui se composent
  // (voir playTransitionSteps/playArrivalStep, view/audio/footsteps.js),
  // jamais mélangées à ce son-ci.

  // Intervalle minimum (ms) entre deux sons de COLLISION du joueur (voir
  // view/audio/footsteps.js/playPacedSound) : un son qui arrive plus tôt
  // est sauté, sans file d'attente. Le pas, lui, n'a aucun cooldown — il
  // est cadencé par la distance parcourue (stepDistance). Doit rester
  // nettement sous la cadence de marche soutenue pour qu'une butée
  // prolongée sonne au rythme des pas ; plus haut = collisions plus
  // espacées sur des à-coups ; plus bas = plus permissif.
  minStepIntervalMs: 150,

  // Fréquence de coupure (Hz) du passe-bas d'une entité au plus loin
  // (dist proche de audibleRange) : plus bas = plus étouffé/sourd de loin ;
  // plus haut = perd son effet d'éloignement (se rapproche de cutoffMax).
  cutoffMin: 500,

  // Fréquence de coupure (Hz) d'une entité proche (dist <= interactRange) :
  // le son est clair, non filtré. 20000 Hz est au-delà de l'audible humain,
  // donc sans effet perceptible. Plus bas = même de près, le son reste
  // légèrement voilé.
  cutoffMax: 20000,

  // Durée (s) de la réponse impulsionnelle générée du bus de réverb : la
  // "taille" perçue de la scène. Plus haut = pièce plus grande/queue plus
  // longue ; plus bas = espace plus petit/sec.
  reverbDurationSec: 1.2,

  // Taux de déclin (1/s) de l'enveloppe de la réponse impulsionnelle : la
  // "matière" de la scène. Plus haut = la queue s'éteint plus vite (surfaces
  // absorbantes) ; plus bas = elle traîne plus longtemps (pièce réverbérante).
  reverbDecay: 2.5,

  // Niveau de retour (0-1) du bus de réverb vers la sortie. VOLONTAIREMENT
  // BAS par défaut : la réverb ne doit jamais noyer le chemin sec — pan,
  // filtre et volume portent toute la lisibilité spatiale (localisation,
  // distance). Plus haut = sensation d'espace plus marquée, au risque de
  // brouiller la scène sonore ; plus bas = quasi inaudible.
  reverbWet: 0.18,

  // Part (0-1) du signal de CHAQUE voix envoyée au bus de réverb. Ne varie
  // pas avec la distance. Plus haut = la voix nourrit davantage la réverb ; plus
  // bas = elle reste presque entièrement sèche.
  reverbSend: 0.5,

  // Part (0-1) du bruit de pas envoyée au bus de réverb — DISTINCTE de
  // reverbSend (les entités) : le pas est proche et centré sur l'auditeur,
  // une valeur MODÉRÉE suffit à lui donner du corps sans noyer la cadence de
  // marche. Plus haut = pas plus "dans la pièce" ; plus bas = pas plus secs.
  footstepReverbSend: 0.15,

  // Durée (ms) du fondu de sortie UNIVERSEL de la musique (voir
  // lib/audio/music.js/fadeOutMusic, view/audio/layers.js) : la piste en cours
  // descend à 0 puis s'arrête, JAMAIS une coupure sèche — réutilisée par
  // TOUT arrêt (bascule de phase jour/nuit, changement de scène). Réglable à
  // l'oreille — plus haut = fondu plus doux/lent ; plus bas = plus net. Ne
  // s'applique JAMAIS à l'entrée dans une scène (voir resolveMusicForPhase,
  // jouée directement, sans fondu).
  musicFadeMs: 2000,
  // Fourchette (ms) de la PAUSE ("respiration") entre deux morceaux — à la
  // fin naturelle d'un morceau (enchaînement, voir lib/audio/music.js/
  // startMusicSequence) ET après le fondu d'une bascule de phase (même
  // mécanisme réutilisé, voir switchMusicSequence) : silence complet, tirée
  // aléatoirement à CHAQUE respiration (l'irrégularité fait vivant, même
  // esprit que vocalInterval/vocalIntervalVariation). Sans effet en mode
  // musicLoop:true (boucle continue, voir doc/scene-format.md).
  musicBreatherMinMs: 3000,
  musicBreatherMaxMs: 8000,

  // Fourchette (ms) du délai de démarrage ALÉATOIRE appliqué à toute balise
  // CONTINUE à sa création dont staggerBeacon reste true (voir plus
  // bas ; view/audio/entity-sound-entry.js/buildEntitySoundEntry) — désempile les
  // attaques d'un démarrage GROUPÉ (montage de scène, spawn groupé
  // d'éphémères), sans jamais détecter s'il y en a réellement plusieurs :
  // appliqué indistinctement, un délai isolé de quelques dizaines de ms
  // reste imperceptible. COURTE délibérément (désempilement d'attaques, pas
  // un fondu d'apparition — une scène doit se sentir présente d'emblée).
  // Lues DIRECTEMENT (comme moveStep/stepDistance plus haut), jamais via la
  // cascade resolveTuning : un réglage PARTAGÉ, pas par entité/son.
  beaconStaggerMinMs: 20,
  beaconStaggerMaxMs: 180,

  // --- Paramètres sonores d'entité (cascade son -> instance -> archétype ->
  // défaut global, voir doc/entity-model.md et config/tuning.js/resolveTuning)
  // : les clés ci-dessous rejoignent reverbSend plus haut dans ce même
  // référentiel, résolues exactement de la même façon. Défauts NEUTRES :
  // une entité qui ne déclare aucune de ces clés garde le comportement de
  // base décrit pour chacune.

  // Mode de lecture de la balise (voir view/audio/entity-sound-entry.js) :
  // "continu" (défaut) — boucle positionnée permanente,
  // pan/volume/passe-bas mis à jour à chaque tick ;
  // "intermittent" — rejouée en ONE-SHOT positionné toutes les
  // beaconInterval ± beaconIntervalVariation (voir les deux réglages
  // suivants), sans boucle Howler permanente ni passe-bas (un one-shot est
  // trop court pour qu'un filtre continu ait un sens).
  beaconMode: "continu",
  // Intervalle moyen (ms) entre deux déclenchements en mode "intermittent".
  // Sans effet en mode "continu". Plus haut = balise plus rare ; plus bas =
  // plus fréquente.
  beaconInterval: 4000,
  // Aléa (ms) appliqué de part et d'autre de beaconInterval, tiré à chaque
  // déclenchement (voir la note sur l'aléa de rendu dans
  // view/audio/entity-sound-entry.js) : évite une cadence mécanique/prévisible.
  // Sans effet en mode "continu".
  beaconIntervalVariation: 1000,
  // Facteur propre de la balise (multiplicatif, 1 = neutre). INDÉPENDANT de
  // la préférence utilisateur "beaconVolume" (Options > Audio, voir
  // config/preferences.js) qui règle TOUTES les balises à la fois : celui-ci
  // règle CETTE balise. Les deux se multiplient entre eux.
  beaconGain: 1,
  // OPT-OUT du désempilement d'attaques (voir beaconStaggerMinMs/
  // beaconStaggerMaxMs plus haut, view/audio/entity-sound-entry.js) : true (défaut)
  // -> cette balise participe au léger délai aléatoire appliqué à tout
  // démarrage GROUPÉ (montage de scène, spawn groupé d'éphémères). false ->
  // démarre PRÉCISÉMENT, sans délai — pour un son dont le retard serait
  // perçu comme de la latence (événement synchronisé, ex. un futur signal
  // temporel exact). Résolu comme tout autre paramètre sonore (cascade
  // son -> instance -> archétype -> ce défaut).
  staggerBeacon: true,
  // Variation de hauteur (fraction du taux de lecture, 0-1) appliquée
  // aléatoirement à chaque lecture d'un son PONCTUEL (balise intermittente
  // ou son de déplacement) : le taux de lecture est tiré uniformément dans
  // [1-pitchVariation, 1+pitchVariation]. 0 = aucune variation (défaut).
  // Pour une balise CONTINUE, la variation
  // est tirée UNE SEULE FOIS à la création de la voix (une boucle n'a pas
  // d'évènement "déclenchement" répété).
  pitchVariation: 0,
  // Multiplicateur de cadence du son de déplacement d'une entité (rôle
  // "movement", voir doc/entity-model.md) : la distance parcourue entre deux
  // pas reste stepDistance (ci-dessus) DIVISÉE par ce facteur — jamais une
  // fréquence réglée indépendamment de la vitesse. 1 = même cadence que le
  // joueur à distance parcourue égale (défaut).
  movementStepMultiplier: 1,
  // Facteur propre du son de déplacement (multiplicatif, 1 = neutre) —
  // même principe que beaconGain, mais pour le rôle "movement". Utile en
  // COMPENSATION d'un asset enregistré à un niveau très différent des
  // autres sons du jeu (ex. dog.js, dont le fichier source de pas est
  // nettement plus discret que celui du joueur) : un réglage de CONTENU,
  // pas de mixage temps réel.
  movementGain: 1,

  // Intervalle moyen (ms) entre deux déclenchements du VOCAL (rôle
  // d'expression — aboiement, sifflement... — voir doc/entity-model.md) :
  // TOUJOURS intermittent, jamais de mode continu pour ce rôle. Nettement
  // plus long ET plus variable que beaconInterval par défaut : un vocal est
  // sporadique par nature, pas un signal de repérage régulier comme la
  // balise.
  vocalInterval: 20000,
  // Aléa (ms) appliqué de part et d'autre de vocalInterval, tiré à chaque
  // déclenchement — même mécanisme que beaconIntervalVariation (voir la
  // note sur l'aléa de rendu dans view/audio/entity-sound-entry.js), VOLONTAIREMENT
  // large pour renforcer le caractère imprévisible du vocal.
  vocalIntervalVariation: 15000,
  // Facteur propre du vocal (multiplicatif, 1 = neutre) — même principe que
  // beaconGain/movementGain, pour le rôle "vocal".
  vocalGain: 1,

  // Facteurs propres des sons de TRANSITION (voir core/presence.js,
  // doc/entity-model.md) — même principe que beaconGain/vocalGain/
  // movementGain, un par rôle : enterSound (bascule dormant->présent),
  // exitSound (présent->dormant).
  enterSoundGain: 1,
  exitSoundGain: 1,

  // --- Hauteur suggérée (voir doc/entity-model.md, isFlying) : chaîne de
  // filtres appliquée aux sons d'une entité isFlying — SUGGÈRE l'altitude,
  // ne simule PAS un axe Y. Bac à sable de réglage : ces trois valeurs sont
  // le SEUL endroit à toucher pour ajuster l'effet à l'oreille, résolues
  // comme tout paramètre sonore (cascade son -> instance -> archétype ->
  // ce défaut).

  // Fréquence de coupure (Hz) du PASSE-HAUT appliqué aux sons d'une entité
  // isFlying, EN PLUS du passe-bas de distance (cutoffMin/cutoffMax) : retire
  // le grave, le son devient plus fin/aérien. Plus haut = effet plus
  // marqué ; plus bas = effet plus subtil (proche de 0 = quasi neutre).
  flyingHighpassHz: 5500,

  // Part (0-1) du signal envoyée au bus de réverb PARTAGÉ pour une entité
  // isFlying, À LA PLACE de reverbSend (jamais les deux à la fois) : plus
  // généreuse par défaut — une touche d'ouverture/de ciel, cohérente avec
  // un son qui vient d'en haut. Plus haut = sensation d'espace plus
  // marquée.
  flyingReverbSend: 0.8,

  // Facteur multiplicatif (0-1) de volume propre à une entité isFlying,
  // COMPOSÉ avec le volume déjà dérivé de la distance (jamais à sa place) :
  // légèrement plus discret, cohérent avec un son qui vient de plus loin/
  // plus haut. 1 = neutre (aucun effet, comportement d'une entité non
  // volante).
  flyingVolumeFactor: 0.4,

  // --- ÉTOUFFEMENT : deux PROFILS, une seule chaîne de rendu (voir
  // view/audio/muffle.js/effectiveMuffle). Chaque profil = un passe-bas
  // (Hz) + un facteur de volume (0-1) COMPOSÉ avec le volume déjà dérivé de
  // la distance, jamais à sa place. Bac à sable de réglage, même principe
  // que le profil isFlying juste au-dessus. Jamais cascadé par entité/type.

  // Profil de l'AUTRE FACE (voir doc/entity-model.md/"Recto/verso") :
  // appliqué à tout son positionné d'une entité de la face que le joueur ne
  // regarde PAS. Fixe (amount toujours 1). Bas = très sourd/lointain, haut
  // = à peine étouffé ; l'autre face se DEVINE, elle ne s'entend pas comme
  // si le joueur y était. DÉFAUTS : une scène à deux faces peut déclarer
  // les siens à sa racine (même nom de champ, voir doc/scene-format.md) —
  // l'étouffement décrit ce qui sépare les deux faces, une propriété de la
  // scène, jamais d'une entité.
  faceMufflingLowpassHz: 1000,
  faceMufflingGain: 0.5,

  // Gain PAR RÔLE d'un son entendu depuis l'AUTRE face (multiplicatif,
  // composé avec l'étouffement ci-dessus et le gain du rôle). Cascade
  // complète : descripteur de son (même nom de champ, ex.
  // sounds.vocal.vocalCrossFaceGain), puis tuning d'instance, puis
  // archétype, puis ce défaut. 0 = jamais entendu depuis l'autre face (et
  // aucun son construit pour elle) ; 1 = étouffement normal ; >1 = porte
  // plus loin. Les sons d'apparition/disparition (enterSound/exitSound)
  // suivent vocalCrossFaceGain.
  beaconCrossFaceGain: 0,
  vocalCrossFaceGain: 1,
  movementCrossFaceGain: 1,

  // Profil de la PERCEPTION SURNATURELLE (voir doc/scripting.md/
  // "perceptionActive") : appliqué aux entités MONDAINES de la face
  // courante quand la perception est active, en fondu (perceptionFadeMs)
  // — les entités surnaturelles en sont exemptées. Indépendant du profil
  // de face ci-dessus : régler l'un ne touche jamais l'autre.
  perceptionMufflingLowpassHz: 1000,
  perceptionMufflingGain: 0.7,

  // Décalage aléatoire MAX (unités de scène, de part et d'autre de la
  // source) appliqué à une entité éphémère ÉPARPILLÉE (voir
  // core/state.js/spawnScatteredEphemerals, doc/entity-model.md/"Entités
  // éphémères") quand l'action qui la fait naître ne précise pas son propre
  // `spawn.spread`. Lu DIRECTEMENT (comme moveStep/stepDistance plus haut),
  // jamais via la cascade resolveTuning : ce n'est pas un réglage
  // PAR ENTITÉ/PAR SON, mais un défaut PAR ACTION. Volontairement BAS : juste
  // assez pour désempiler plusieurs pièces au même point, pas un vrai
  // éparpillement large.
  ephemeralScatterSpread: 2.5,

  // Écart minimal (unités x) entre deux collectibles posés dans une même
  // PLAGE de spawn (voir core/spawn.js, doc/entity-model.md/"Collecte") :
  // évite l'empilement sonore de deux balises au même point. Lu
  // DIRECTEMENT comme ephemeralScatterSpread (défaut PAR MÉCANIQUE, pas
  // par entité/son).
  spawnMinSpacing: 1,

  // Durée (ms) du fondu de la perception surnaturelle — voir
  // PERCEPTION_FADE_MS ci-dessus, seule définition, jamais dupliquée ici.
  // Plus haut = transition plus lente/immersive ; plus bas = plus nette.
  perceptionFadeMs: PERCEPTION_FADE_MS,

  // Durée (ms) pendant laquelle la touche de perception reste INERTE après
  // une bascule — DÉRIVÉE de perceptionFadeMs + une marge (voir
  // PERCEPTION_COOLDOWN_MARGIN_MS ci-dessus) : garantie STRUCTURELLE que le
  // cooldown ne peut jamais tomber sous la durée du fondu qu'il protège
  // (jamais deux fondus qui se chevauchent/se battent, voir
  // view/perception-toggle.js). Ne jamais remplacer par un littéral indépendant.
  perceptionCooldownMs: PERCEPTION_FADE_MS + PERCEPTION_COOLDOWN_MARGIN_MS,

  // Durée (ms) du fondu de l'AMBIANCE MÉTÉO (voir core/weather.js,
  // view/audio/layers.js) — couche d'ÉTAT superposée à l'ambiance de
  // scène (lib/audio/ambience.js/setWeatherAmbienceLayer), fondue à chaque
  // transition météo. Plus lent que perceptionFadeMs par défaut : une
  // bascule météo est un changement atmosphérique graduel, jamais aussi
  // net qu'un toggle de perception.
  weatherAmbienceFadeMs: 3000,

  // Durées (ms) du fondu de la couche ENTITÉS pendant le SAS d'un teleport
  // en mode "fade" (voir lib/audio/context.js/rampEntityLayerGain,
  // view/world-travel.js/runTeleportSas) — le "fondu au noir sonore" qui
  // souligne le changement de scène/position et masque un éventuel
  // chargement. COURTES par nature (souligner sans ralentir le passage) : sortant
  // avant de détruire la scène quittée, entrant une fois la scène cible
  // prête. Musique/ambiance NE PASSENT PAS par ce gain (voir lib/audio/context.js,
  // "Gain de couche ENTITÉS") : ces durées n'affectent qu'elles-mêmes.
  doorTransitionFadeOutMs: 250,
  doorTransitionFadeInMs: 300,

  // Durée (ms) du fondu qui arrête un son SUIVI (cloche, cri...) quand le
  // joueur QUITTE le monde où il a été émis (voir
  // view/audio/oneshots.js/stopForeignTrackedOneShots). Court : il évite
  // seulement le clic d'un arrêt net. Pendant une porte, le sas a déjà
  // éteint la couche entités, ce fondu y est inaudible.
  sceneExitSoundFadeMs: 150,

  // Durée (ms) du CROISEMENT DE FILTRES d'occlusion pendant une bascule
  // recto/verso (voir view/audio/face-crossfade.js/crossfadeFaceSwap,
  // view/world-travel.js/sideSwitch) — la face courante se referme
  // pendant que l'autre s'ouvre, EN PARALLÈLE, sur cette même durée.
  // DISTINCTE des durées de transition de porte ci-dessus : pas le même
  // geste (un échange de clarté entre deux faces qui coexistent, jamais un
  // fondu vers le silence). PARAMÈTRE MAÎTRE de toute la traversée : le
  // nombre de pas de TRAJET en DÉRIVE (voir
  // view/audio/footsteps.js/playTransitionSteps,
  // transitionStepIntervalMs ci-dessous) — ajuster CETTE seule valeur
  // recadence les pas EN MÊME TEMPS que les rampes, jamais un second
  // réglage à tenir synchronisé. Assez longue pour que la traversée se
  // vive : à réajuster à l'oreille.
  faceSwitchFadeMs: 600,

  // Intervalle (ms) entre deux pas de TRAJET pendant une transition
  // recto/verso (voir view/audio/footsteps.js/playTransitionSteps) —
  // CADENCE NATURELLE de marche (proche de STEP_DISTANCE/moveStep à vitesse
  // normale, ~250ms), mais un LITTÉRAL indépendant plutôt qu'une formule
  // dérivée : ce réglage de FEELING se tourne très bien à l'oreille, sans
  // faire dépendre la vue d'un import du moteur de boucle (lib/loop.js)
  // pour ça. Lu DIRECTEMENT (comme faceSwitchFadeMs ci-dessus), jamais via
  // la cascade resolveTuning : un réglage PARTAGÉ, pas par passage.
  transitionStepIntervalMs: 250,

  // Pas des SÉLECTEURS DE QUANTITÉ (flèches gauche/droite), même convention
  // partout : Maj = pas intermédiaire, Ctrl = grand pas (sans modificateur :
  // 1). Boutique (view/menus/shop-quantity-list.js) : stocks et budgets petits ;
  // quantité à poser depuis le sac (view/menus/inventory/bag-and-equipment.js) : des
  // piles pouvant compter des centaines d'objets.
  shopQuantityMediumStep: 5,
  shopQuantityBigStep: 20,
  bagQuantityMediumStep: 10,
  bagQuantityBigStep: 100,

  // Défauts du comportement "wander" (voir core/behaviors/wander.js), pour
  // un rythme CALME : marches courtes (0,75 à 1,5 s), pauses nettement plus
  // longues et notables (2 à 5 s). Durées en ms, converties en ticks par le
  // comportement. Surchargeables champ par champ dans l'objet `behavior` qui
  // déclare l'errance (walkMinMs...), jamais via resolveTuning : le core lit
  // ces valeurs DIRECTEMENT.
  wanderWalkMinMs: 750,
  wanderWalkMaxMs: 1500,
  wanderPauseMinMs: 2000,
  wanderPauseMaxMs: 5000,
  // Probabilité (0 à 1), à l'entrée d'une NOUVELLE marche, de repartir dans
  // la direction de la marche précédente plutôt que de faire demi-tour.
  // 0,65 : évite le ping-pong systématique sans figer l'entité dans un
  // aller simple. 0 = demi-tour à chaque pause (garde qui fait les cent
  // pas), vers 1 = ne revient presque jamais sur ses pas.
  wanderContinueBias: 0.65,

  // Défauts du comportement "follow" (voir core/behaviors/follow.js), en
  // unités de scène : en deçà de followMinDistance le suiveur s'arrête (il ne
  // recule jamais), au-delà de followMaxDistance il se rapproche, entre les
  // deux il ne bouge pas. Plus d'écart = suivi plus lâche ; maxDistance plus
  // haut = le suiveur traîne plus loin derrière. Lus DIRECTEMENT par le core,
  // comme les défauts de wander ci-dessus.
  followMinDistance: 1,
  followMaxDistance: 3,
};
