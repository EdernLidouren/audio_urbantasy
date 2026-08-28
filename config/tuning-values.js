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

  // Volume juste après avoir quitté interactRange (palier volontaire, pas
  // une valeur de continuité) : marque clairement la sortie de la zone
  // d'interaction avant de décroître doucement vers 0 à audibleRange. Plus
  // haut = le palier est moins marqué (se rapproche de fullVolume) ; plus
  // bas = la coupure en sortant de interactRange s'entend davantage.
  farVolumeMax: 0.5,

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

  // Durée (ms) du fondu croisé musique à une bascule de phase jour/nuit
  // (voir core/time.js/phaseAt, view/audio/city-scene.js) : la piste
  // sortante descend à 0 puis s'arrête, l'entrante monte de 0 à son volume,
  // sur cette même durée. Réglable à l'oreille — plus haut = transition plus
  // douce/lente ; plus bas = bascule plus nette. Ne s'applique QU'aux
  // bascules en cours de jeu, jamais à l'entrée dans une scène (voir
  // resolveMusicForPhase, jouée directement, sans fondu).
  musicCrossfadeMs: 2000,

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
};
