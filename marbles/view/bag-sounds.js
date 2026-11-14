// JEU DES BILLES — les SONS DE LA GESTION DES SACS (écrans « Mes sacs » et éditeur) :
// des points d'accroche (marbles/config/values.js/MARBLES_BAG_AUDIO). Un point sans
// fichier joue son son de menu de repli ; un son d'interface, centré, au volume de
// l'interface, jamais un plantage (view/menu-sounds.js).

import { MARBLES_BAG_AUDIO } from "../config/values.js";
import { playInterfaceSound, playMenuSound } from "../../view/menu-sounds.js";

export function playBagSound(name) {
  const hook = MARBLES_BAG_AUDIO[name];
  if (hook === undefined) throw new Error(`marbles : son de sac inconnu "${name}".`);
  if (hook.key === null) playMenuSound(hook.fallback);
  else playInterfaceSound(hook.key, `sacs, ${name}`);
}
