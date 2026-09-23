// Valeurs de réglage de gameplay/feeling. Donnée pure : AUCUN import — même
// le core peut la lire sans jamais draîner le registre d'entités ni la
// logique de cascade (voir config/tuning.js pour resolveTuning). Ne contient
// que des valeurs qu'on peut tourner à l'oreille sans rien casser — pas
// d'invariant structurel (ceux-là restent dans le fichier qui en dépend :
// TICK_MS/MAX_FRAME_MS dans lib/loop.js, les bornes [-1,1] du pan dans
// view/audio/city-scene.js, etc.).
//
// Dernier recours de la cascade (voir lib/tuning.js / resolveTuning) : le
// registre d'entités et les instances peuvent tout ignorer, tout retombe ici.

// Durée (ms) du fondu de la PERCEPTION SURNATURELLE (voir
// core/presence.js/"perceptionActive", view/audio/city-scene.js) —
// crossfade musique/ambiance vers les pools surnaturels ET rampe du filtre
// d'étouffement des entités mondaines, LA MÊME durée pour les deux (une
// seule transition ressentie, pas deux désynchronisées). Const à part
// (jamais un littéral direct dans TUNING_DEFAULTS) : perceptionCooldownMs
// juste en dessous DOIT rester >= cette valeur + une marge, un lien
// STRUCTUREL, pas seulement documenté en commentaire.
const PERCEPTION_FADE_MS = 2500;
// Marge (ms) AU-DESSUS du fondu ci-dessus avant que la touche de perception
// ne redevienne active — jamais en dessous, sous peine de fondus qui se
// chevauchent/se battent (voir view/city-screen.js).
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

  // Surlignage audio de proximité (voir view/audio/city-scene.js,
  // entities/model.md) : à portée d'interaction (dist <= interactRange),
  // une entité highlight:true saute à fullVolume — SAUT NET, INSTANTANÉ,
  // pas une rampe. Une version rampée (montée/descente progressives sur
  // quelques dizaines à centaines de ms) a été essayée et abandonnée :
  // quasi inaudible à l'oreille en marchant/courant normalement, la
  // fenêtre de présence dans interactRange étant trop courte pour laisser
  // le fondu se terminer (voir l'historique de view/audio/city-scene.js/
  // volumeForDistance). EXPLICITE et INDÉPENDANT de observable/
  // interactable — une entité n'est surlignée QUE si elle (ou son
  // archétype, ou son instance) déclare highlight: true. Ce défaut GLOBAL
  // (false) est le dernier recours de la cascade instance -> archétype ->
  // ce défaut (même mécanisme que gait/naturalWalk) : le décor n'est jamais
  // surligné sans le demander explicitement à l'un de ces deux paliers.
  highlight: false,

  // Pas du joueur pendant une TRANSITION recto/verso (voir
  // entities/types/passage.js, view/audio/city-scene.js/playTransitionSteps/
  // playArrivalStep) : activés PAR DÉFAUT (true) — un passage PHYSIQUE
  // (ruelle, porte dérobée) se traverse à pied, donc se marche à l'oreille.
  // Résolu par la MÊME cascade instance -> archétype -> ce défaut que
  // `highlight` juste au-dessus : un futur passage IMMATÉRIEL (passe-miroir)
  // désactivera ce flag sur SON archétype, sans toucher au défaut global.
  transitionSteps: true,

  // `transitionSurface` (nom de surface, voir core/surfaces.js/
  // SURFACE_REGISTRY) : surcharge OPTIONNELLE de la surface des pas de
  // TRAJET pendant une transition (voir
  // view/audio/city-scene.js/playTransitionSteps) — un passage peut
  // déclarer la sienne (ex. une ruelle PAVÉE, distincte du sol de la
  // scène). AUCUNE entrée ici, comme `gait`/`naturalWalk` (voir
  // doc/entity-model.md) : pas de défaut global sensé pour un nom de
  // surface — non déclaré, `resolveTuning` retombe naturellement sur
  // `undefined`, et c'est CE `undefined` que l'appelant interprète comme
  // "utilise la surface de la face de départ", jamais un défaut figé ici.

  // `transitionSound` (chemin/pool résolu via resolveAsset, voir
  // view/city-screen.js/playSideSwitchSound) : le son DÉCLARÉ d'un
  // franchissement recto/verso (grincement, tintement...) — AUCUNE entrée
  // ici, même raisonnement que `transitionSurface` juste au-dessus : pas
  // de son générique imposé, un passage qui n'en déclare aucun (à
  // l'instance via `tuning`, ou à l'archétype) transite en SILENCE côté
  // son de passage — les rampes d'occlusion et les pas de trajet/arrivée
  // jouent quand même, DEUX choses sonores indépendantes qui se composent
  // (voir playTransitionSteps/playArrivalStep, view/audio/city-scene.js),
  // jamais mélangées à ce son-ci.

  // Intervalle minimum (ms) entre deux bruits de pas d'une MÊME cause
  // (reprise après arrêt + cadence normale d'un côté, changement de sol de
  // l'autre — voir view/audio/city-scene.js, deux cooldowns séparés).
  // Anti-mitraillette sur appuis répétés rapides — n'affecte que le SON,
  // jamais le déplacement. Doit rester nettement sous l'intervalle de
  // marche soutenue (~330ms avec les valeurs actuelles) pour rester
  // invisible en marche normale ; plus haut = pas plus espacés/étouffés sur
  // des à-coups ; plus bas = plus permissif.
  minStepIntervalMs: 150,

  // Écart minimum (ms) entre deux bruits de pas de causes DIFFÉRENTES
  // (reprise après arrêt ET changement de sol, ex. un demi-tour juste après
  // avoir franchi une frontière) — les deux ont leur propre cooldown
  // ci-dessus (l'un ne doit jamais bloquer l'autre, voir city-scene.js),
  // mais sans cet écart minimal les deux clips (souvent 300-650 ms) peuvent
  // se chevaucher presque entièrement et brouiller la transition. Nettement
  // plus court que minStepIntervalMs : juste de quoi séparer les deux
  // attaques à l'oreille, pas de quoi retarder sensiblement la transition.
  footstepOverlapGuardMs: 80,

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
  // "taille" perçue du lieu. Plus haut = pièce plus grande/queue plus
  // longue ; plus bas = espace plus petit/sec.
  reverbDurationSec: 1.2,

  // Taux de déclin (1/s) de l'enveloppe de la réponse impulsionnelle : la
  // "matière" du lieu. Plus haut = la queue s'éteint plus vite (surfaces
  // absorbantes) ; plus bas = elle traîne plus longtemps (pièce réverbérante).
  reverbDecay: 2.5,

  // Niveau de retour (0-1) du bus de réverb vers la sortie. VOLONTAIREMENT
  // BAS par défaut : la réverb ne doit jamais noyer le chemin sec — pan,
  // filtre et volume portent toute la lisibilité spatiale (localisation,
  // distance). Plus haut = sensation d'espace plus marquée, au risque de
  // brouiller la scène sonore ; plus bas = quasi inaudible.
  reverbWet: 0.18,

  // Part (0-1) du signal de CHAQUE voix envoyée au bus de réverb. Uniforme
  // pour toutes les entités dans ce premier passage (pas encore de variation
  // par distance). Plus haut = la voix nourrit davantage la réverb ; plus
  // bas = elle reste presque entièrement sèche.
  reverbSend: 0.5,

  // Part (0-1) du bruit de pas envoyée au bus de réverb — DISTINCTE de
  // reverbSend (les entités) : le pas est proche et centré sur l'auditeur,
  // une valeur MODÉRÉE suffit à lui donner du corps sans noyer la cadence de
  // marche. Plus haut = pas plus "dans la pièce" ; plus bas = pas plus secs.
  footstepReverbSend: 0.15,

  // Durée (ms) du fondu de sortie UNIVERSEL de la musique (voir
  // lib/audio.js/fadeOutMusic, view/audio/city-scene.js) : la piste en cours
  // descend à 0 puis s'arrête, JAMAIS une coupure sèche — réutilisée par
  // TOUT arrêt (bascule de phase jour/nuit, transition de lieu). Réglable à
  // l'oreille — plus haut = fondu plus doux/lent ; plus bas = plus net. Ne
  // s'applique JAMAIS à l'entrée dans une scène (voir resolveMusicForPhase,
  // jouée directement, sans fondu).
  musicFadeMs: 2000,
  // Fourchette (ms) de la PAUSE ("respiration") entre deux morceaux — à la
  // fin naturelle d'un morceau (enchaînement, voir lib/audio.js/
  // startMusicSequence) ET après le fondu d'une bascule de phase (même
  // mécanisme réutilisé, voir switchMusicSequence) : silence complet, tirée
  // aléatoirement à CHAQUE respiration (l'irrégularité fait vivant, même
  // esprit que vocalInterval/vocalIntervalVariation). Sans effet en mode
  // musicLoop:true (boucle continue, voir level/schema.md).
  musicBreatherMinMs: 3000,
  musicBreatherMaxMs: 8000,

  // Fourchette (ms) du délai de démarrage ALÉATOIRE appliqué à toute balise
  // CONTINUE nouvellement créée dont staggerBeacon reste true (voir plus
  // bas ; view/audio/city-scene.js/buildEntitySoundEntry) — désempile les
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
  // défaut global, voir entities/model.md et config/tuning.js/resolveTuning)
  // : les clés ci-dessous rejoignent reverbSend plus haut dans ce même
  // référentiel, résolues exactement de la même façon. Défauts choisis pour
  // ne RIEN changer au comportement des entités existantes tant qu'elles ne
  // déclarent aucune de ces clés.

  // Mode de lecture de la balise (voir view/audio/city-scene.js) :
  // "continu" (défaut, comportement actuel) — boucle positionnée permanente,
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
  // déclenchement (voir la note sur le déterminisme dans
  // view/audio/city-scene.js) : évite une cadence mécanique/prévisible.
  // Sans effet en mode "continu".
  beaconIntervalVariation: 1000,
  // Facteur propre de la balise (multiplicatif, 1 = neutre). INDÉPENDANT de
  // la préférence utilisateur "beaconVolume" (Options > Audio, voir
  // config/preferences.js) qui règle TOUTES les balises à la fois : celui-ci
  // règle CETTE balise. Les deux se multiplient entre eux.
  beaconGain: 1,
  // OPT-OUT du désempilement d'attaques (voir beaconStaggerMinMs/
  // beaconStaggerMaxMs plus bas, view/audio/city-scene.js) : true (défaut)
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
  // [1-pitchVariation, 1+pitchVariation]. 0 = aucune variation (défaut,
  // comportement actuel inchangé). Pour une balise CONTINUE, la variation
  // est tirée UNE SEULE FOIS à la création de la voix (une boucle n'a pas
  // d'évènement "déclenchement" répété).
  pitchVariation: 0,
  // Multiplicateur de cadence du son de déplacement d'une entité (rôle
  // "movement", voir entities/model.md) : la distance parcourue entre deux
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
  // d'expression — aboiement, sifflement... — voir entities/model.md) :
  // TOUJOURS intermittent, jamais de mode continu pour ce rôle. Nettement
  // plus long ET plus variable que beaconInterval par défaut : un vocal est
  // sporadique par nature, pas un signal de repérage régulier comme la
  // balise.
  vocalInterval: 20000,
  // Aléa (ms) appliqué de part et d'autre de vocalInterval, tiré à chaque
  // déclenchement — même mécanisme que beaconIntervalVariation (voir la
  // note sur le déterminisme dans view/audio/city-scene.js), VOLONTAIREMENT
  // large pour renforcer le caractère imprévisible du vocal.
  vocalIntervalVariation: 15000,
  // Facteur propre du vocal (multiplicatif, 1 = neutre) — même principe que
  // beaconGain/movementGain, pour le rôle "vocal".
  vocalGain: 1,

  // Facteurs propres des sons de TRANSITION (voir core/presence.js,
  // entities/model.md) — même principe que beaconGain/vocalGain/
  // movementGain, un par rôle : enterSound (bascule dormant->présent),
  // exitSound (présent->dormant).
  enterSoundGain: 1,
  exitSoundGain: 1,

  // --- Hauteur suggérée (voir entities/model.md, isFlying) : chaîne de
  // filtres appliquée aux sons d'une entité isFlying — SUGGÈRE l'altitude,
  // ne simule PAS un axe Y. Bac à sable de réglage : ces trois valeurs sont
  // le SEUL endroit à toucher pour ajuster l'effet à l'oreille, résolues
  // comme tout paramètre sonore (cascade son -> instance -> archétype ->
  // ce défaut).

  // Fréquence de coupure (Hz) du PASSE-HAUT appliqué aux sons d'une entité
  // isFlying, EN PLUS du passe-bas existant (cutoffMin/cutoffMax) : retire
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
  // view/audio/city-scene.js/effectiveMuffle). Chaque profil = un passe-bas
  // (Hz) + un facteur de volume (0-1) COMPOSÉ avec le volume déjà dérivé de
  // la distance, jamais à sa place. Bac à sable de réglage, même principe
  // que le profil isFlying juste au-dessus. GLOBAL (pas cascadé par
  // entité/type).

  // Profil de l'AUTRE FACE (voir CLAUDE.md/"RECTO/VERSO" étape 2/2) :
  // appliqué à tout son positionné d'une entité de la face que le joueur ne
  // regarde PAS — jamais aux beacons, coupés entièrement. Fixe (amount
  // toujours 1). Bas = très sourd/lointain, haut = à peine étouffé ;
  // l'autre face se DEVINE, elle ne s'entend pas comme si le joueur y était.
  faceMufflingLowpassHz: 1000,
  faceMufflingGain: 0.5,

  // Profil de la PERCEPTION SURNATURELLE (voir doc/scripting.md/
  // "perceptionActive") : appliqué aux entités MONDAINES de la face
  // courante quand la perception est active, en fondu (perceptionFadeMs)
  // — les entités surnaturelles en sont exemptées. Indépendant du profil
  // de face ci-dessus : régler l'un ne touche jamais l'autre.
  perceptionMufflingLowpassHz: 1000,
  perceptionMufflingGain: 0.7,

  // Décalage aléatoire MAX (unités de scène, de part et d'autre de la
  // source) appliqué à une entité éphémère ÉPARPILLÉE (voir
  // core/state.js/spawnScatteredEphemerals, entities/model.md/"Entités
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
  // view/city-screen.js). Ne jamais remplacer par un littéral indépendant.
  perceptionCooldownMs: PERCEPTION_FADE_MS + PERCEPTION_COOLDOWN_MARGIN_MS,

  // Durée (ms) du fondu de l'AMBIANCE MÉTÉO (voir core/weather.js,
  // view/audio/city-scene.js) — couche d'ÉTAT superposée à l'ambiance de
  // lieu (lib/audio.js/setWeatherAmbienceLayer), fondue à chaque
  // transition météo. Plus lent que perceptionFadeMs par défaut : une
  // bascule météo est un changement atmosphérique graduel, jamais aussi
  // net qu'un toggle de perception.
  weatherAmbienceFadeMs: 3000,

  // Durées (ms) du fondu de la couche ENTITÉS pendant le SAS d'un teleport
  // en mode "fade" (voir lib/audio.js/rampEntityLayerGain,
  // view/city-screen.js/runTeleportSas) — le "fondu au noir sonore" qui
  // souligne le changement de lieu/position et masque un éventuel
  // chargement. COURTES par nature (souligner sans ralentir le passage) : sortant
  // avant de détruire la scène quittée, entrant une fois la scène cible
  // prête. Musique/ambiance NE PASSENT PAS par ce gain (voir lib/audio.js,
  // "Gain de couche ENTITÉS") : ces durées n'affectent qu'elles-mêmes.
  doorTransitionFadeOutMs: 250,
  doorTransitionFadeInMs: 300,

  // Durée (ms) du CROISEMENT DE FILTRES d'occlusion pendant une bascule
  // recto/verso (voir view/audio/city-scene.js/crossfadeFaceSwap,
  // view/city-screen.js/sideSwitchEffect) — la face courante se referme
  // pendant que l'autre s'ouvre, EN PARALLÈLE, sur cette même durée.
  // DISTINCTE des durées de transition de porte ci-dessus : pas le même
  // geste (un échange de clarté entre deux faces qui coexistent, jamais un
  // fondu vers le silence). PARAMÈTRE MAÎTRE de toute la traversée : le
  // nombre de pas de TRAJET en DÉRIVE (voir
  // view/audio/city-scene.js/playTransitionSteps,
  // transitionStepIntervalMs ci-dessous) — ajuster CETTE seule valeur
  // recadence les pas EN MÊME TEMPS que les rampes, jamais un second
  // réglage à tenir synchronisé. Doublée (300 -> 600, essai en cours) pour
  // une traversée plus vécue : à réajuster à l'oreille.
  faceSwitchFadeMs: 600,

  // Intervalle (ms) entre deux pas de TRAJET pendant une transition
  // recto/verso (voir view/audio/city-scene.js/playTransitionSteps) —
  // CADENCE NATURELLE de marche (proche de STEP_DISTANCE/moveStep à vitesse
  // normale, ~250ms), mais un LITTÉRAL indépendant plutôt qu'une formule
  // dérivée : ce réglage de FEELING se tourne très bien à l'oreille, sans
  // faire dépendre la vue d'un import du moteur de boucle (lib/loop.js)
  // pour ça. Lu DIRECTEMENT (comme faceSwitchFadeMs ci-dessus), jamais via
  // la cascade resolveTuning : un réglage PARTAGÉ, pas par passage.
  transitionStepIntervalMs: 250,
};
