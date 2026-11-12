// Jeu des billes : les SONS de l'écran. Aucune règle ici : ce qui se passe vient
// du journal (marbles/core/content.js, en-tête), ce que chaque bille fait entendre du profil sonore
// de son CALIBRE (champ `size` de chaque bille, marbles/content/types/, profils dans
// MARBLE_SOUND_PROFILES).
//
// TROIS FAMILLES :
// - les sons d'ÉVÈNEMENT, un point d'accroche par type d'évènement du journal
//   (MARBLE_EVENT_CUES) : il dit quels REPÈRES l'évènement produit, et quand, sur
//   une ligne de temps propre au geste (eventCues). Le brassage du sac, puis chaque
//   pioche, une balise après l'autre ; la bille posée qui roule de la main à son
//   emplacement, puis sa chute ; ou, tirée plus vite, sa collision avec
//   l'occupante, qui roule à la défausse ; les deux billes d'un échange qui roulent l'une vers l'autre ; la
//   balise de la bille active à la phase de son emplacement ; le Polissage et la
//   Fêlure à l'emplacement de la bille touchée ; les sons de déclencheur
//   (Chiquenaude, Éveil, Final, Trouvaille) là où est la bille ; la balise d'une
//   bille du pot qui agit, au pot ; le début du tour du joueur, au centre ; la bille
//   usée qui roule à la défausse ; les billes du triangle qui tournent ensemble, chacune
//   vers l'emplacement suivant. L'écran les met dans sa file de sons
//   (marbles/view/sound-queue.js) et les joue à leur échéance : le son seul
//   attend, jamais le joueur ;
// - la BALISE AU SURVOL (playFocusBeacon) : la voix de la bille sur laquelle le
//   curseur arrive, une seule à la fois : la suivante coupe la précédente, pour que
//   des flèches rapides ne s'empilent pas ;
// - la MUSIQUE de l'écran (startMarblesMusic, stopMarblesMusic).
//
// ESPACE : un son de bille s'entend à sa PLACE sur la table, un repère
// { kind: "hand", index, size } ou { kind: "slot", slot } : la balise d'une bille
// piochée à sa place dans la main, la chute d'une pose, la balise de phase, le
// Polissage et la Fêlure à l'emplacement, la balise au survol là où est le curseur. renderAt traduit la
// place en rendu : panoramique gauche-droite et PROFONDEUR (volume, passe-bas, part
// de réverbération), d'après marbles/config/values.js/MARBLES_SOUND_PLACES et
// MARBLES_SOUND_DEPTH. Stéréo et volume, jamais de HRTF (CLAUDE.md). La table a sa
// propre réverbération, créée à l'ouverture de l'écran et défaite à sa sortie. Sans
// place (brassage, menus des piles) : au centre, sec, plein volume.
//
// ROULEMENTS : un repère "roll" suit un chemin de places. Sa boucle de roulement
// (le `roll` du profil) joue en continu, et chaque frame (advanceRolls, appelée par
// l'onFrame de l'écran) la déplace : position et vitesse viennent de
// marbles/view/rolls.js, le rendu de la position, de renderPosition, comme une
// place. Le volume et la vitesse de lecture suivent la vitesse de la bille. Un
// menu ouvert par-dessus fige l'écran, donc le déplacement : chaque roulement a
// aussi une échéance en temps réel, qui le coupe s'il n'a plus de frames.
//
// COLLISION : un seul repère, "collision", qui joue les sons des deux billes, la
// frappeuse puis la frappée `flamMs` plus tard, au volume de la FORCE du choc,
// tirée de leurs calibres (collisionStrength, marbles/config/values.js/
// MARBLES_COLLISION). L'écart est un retard posé sur l'horloge audio, à la lecture
// (lib/audio.js, `delayMs`), pas sur la ligne de temps : la file avance par frames
// (environ 17 ms), plus gros grain que l'écart lui-même, et un minuteur JS flotte
// de plusieurs millisecondes.
//
// VARIATIONS DE TON : collisions, chutes, roulements, polissages, fêlures et sons de
// déclencheur jouent chacun à une vitesse tirée au hasard autour de 1 (MARBLES_PITCH_VARIATION) ;
// jamais les balises. Un hasard de rendu seulement, que la simulation ne voit pas.
//
// VOLUMES : les balises (pioche, survol) suivent le volume des balises du jeu, elles
// ont vocation à être positionnées ; brassage, chutes, chocs, roulements, polissages,
// fêlures, sons de déclencheur et début de tour, celui de l'interface ; la musique, celui de la musique. Tous les sons des billes sont PERMANENTS (jamais
// purgés, lib/audio/retention.js) et préchargés à l'ouverture
// (preloadMarblesAudio) : la première balise ne part pas en retard sur la touche.
// Un son manquant avertit en console, jamais de plantage.
//
// MODULES (marbles/view/sounds/), ce fichier n'étant que leur point d'entrée :
// - validation.js : la validation au chargement des réglages sonores ;
// - space.js      : l'espace, pur (places, positions, rendu, rendu d'un roulement) ;
// - timeline.js   : la chronologie, pure (repères des évènements, ligne de temps,
//                   force d'une collision, démonstration des places) ;
// - playback.js   : la lecture (repères, réverbération, roulements, balise au
//                   survol, préchargement, musique).
// Les autres modules importent d'ici, jamais des modules eux-mêmes.

export * from "./sounds/validation.js";
export * from "./sounds/space.js";
export * from "./sounds/timeline.js";
export * from "./sounds/playback.js";
