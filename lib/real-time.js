// Brique portable : une HORLOGE TEMPS RÉEL qui ne dépend pas de l'affichage.
//
// Le problème : les images du navigateur (requestAnimationFrame, lib/loop.js)
// s'arrêtent quand la fenêtre passe en arrière-plan ou que le panneau est masqué.
// Un rythme qui ne vit que d'elles (une file d'annonces, une file de sons) s'arrête
// avec elles. Les minuteries (setInterval), elles, continuent en arrière-plan,
// ralenties par le navigateur (une fois par seconde environ, plus rarement après
// un long moment).
//
// La solution : un même battement, appelé par DEUX moteurs, les images quand il y en
// a et une minuterie toujours. Chaque battement mesure le temps écoulé depuis le
// précédent, quel que soit le moteur qui l'appelle : les deux ne s'additionnent
// jamais, et le temps n'est compté qu'une fois. Un battement pendant que le
// consommateur est inactif (un menu ouvert par-dessus) ne donne rien et recale
// l'horloge : à son retour, il ne reçoit pas tout le temps passé d'un coup.
//
// Ce que le consommateur fait du temps reçu reste son affaire : pour ne rien dire
// en rafale après une longue absence, il peut n'avancer que d'un pas par
// battement (une file d'annonces qui ne libère qu'une étape à la fois).
//
// Pur à l'injection près : `now` (performance.now par défaut) se remplace dans les
// vérifications (lib/checks/real-time.check.js).

// -> { pulse(), reset() }
//   advance(deltaMs)  ce qui reçoit le temps écoulé ;
//   isActive()        le consommateur reçoit-il le temps en ce moment ?
//   now()             l'horloge, en millisecondes.
export function createRealTimeDriver({ advance, isActive = () => true, now = () => performance.now() }) {
  let last = null;
  return {
    // Un battement, d'un moteur ou de l'autre.
    pulse() {
      const current = now();
      const delta = last === null ? 0 : Math.max(0, current - last);
      last = current;
      if (isActive()) advance(delta);
    },
    // Oublie le dernier battement : le suivant ne donnera rien d'écoulé.
    reset() {
      last = null;
    },
  };
}
