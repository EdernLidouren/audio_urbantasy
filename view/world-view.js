// VUE DU MONDE ACTIF : ce que le joueur entend et ce qui lui est annoncé du
// monde où il se trouve. Réunit trois briques montées, mises à jour et
// détruites ENSEMBLE (même cycle de vie : un changement de monde, de face ou
// de partie en remonte une neuve) :
//   - la scène audio (view/audio/city-scene.js) ;
//   - l'occupation et les candidats d'interaction (view/occupancy.js) ;
//   - les annonces de phase et de météo (view/ambient-announcements.js).
// Même API que la scène audio, plus getInteractionCandidates.

import { createCityAudioScene } from "./audio/city-scene.js";
import { createOccupancy } from "./occupancy.js";
import { createAmbientAnnouncements } from "./ambient-announcements.js";

export { stopPersistentAudioLayers } from "./audio/city-scene.js";

// `handover` : voir view/audio/city-scene.js/createCityAudioScene.
export function createWorldView(getSession, { handover = null } = {}) {
  const audio = createCityAudioScene(getSession, { handover });
  const occupancy = createOccupancy(getSession);
  const ambient = createAmbientAnnouncements(getSession);

  // Ordre des annonces d'un même tick : phase et météo, puis occupation.
  function update() {
    audio.update();
    ambient.update();
    occupancy.update();
  }

  return {
    ...audio,
    update,
    getInteractionCandidates: occupancy.getInteractionCandidates,
  };
}
