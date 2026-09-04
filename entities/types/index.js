// Registre des types d'entités. Connecteur pur, zéro logique : rassemble
// chaque archétype (un fichier par type, voir apple.js/bird_1.js/bird_2.js/
// bird_3.js/buddy.js/chair.js/clock.js/clock_tower.js/crate.js/
// cumulo-lupus.js/decor.js/dog.js/door.js/fountain.js/ghost.js/hound.js/
// item.js/money.js/neon.js/npc.js/object.js/passage.js/potted_plant.js/
// river.js/rock.js/statue.js/window.js) en un seul objet — même patron que
// core/behaviors/index.js. Donnée neutre au global : aucun import, ni du
// core ni de la vue. blocksMovement est lu par core/level.js (baké dans
// l'entité parsée) puis exploité par core/reduce.js pour arrêter le joueur
// au bord du corps d'une entité bloquante (voir BODY_RADIUS, uniforme pour
// l'instant). observable/interactable (système d'interaction niveau 0, voir
// view/interaction.js et entities/model.md) sont bakés de la même façon,
// cascade instance -> type -> défaut (false), et filtrent les candidats PAR
// VERBE (view/audio/city-scene.js/getInteractionCandidates).
// La vue lit sounds/nameKey/collisionSound pour le rendu audio et les
// annonces. Ni l'un ni l'autre ne dépend de l'autre, seulement de ce
// registre.
//
// nameKey est une CLÉ i18n (jamais une chaîne affichable directement),
// forme "<namespace>.name" (ex. "entity.window.name") — SYMÉTRIQUE à
// descriptionKey ci-dessous : même nom de champ à l'archétype ET à
// l'instance (level/*.json), jamais un champ "label" séparé.
//
// descriptionKey (optionnel) : CLÉ i18n de la description utilisée par
// l'interaction "describe" (touche Espace, voir view/interaction.js).
// Défaut par type, surchargeable par instance via le champ
// `descriptionKey` du niveau (level/*.json) — cascade instance -> type
// identique à celle de nameKey (résolue dans core/level.js).
//
// sounds regroupe les descripteurs de son du type PAR RÔLE (voir
// entities/model.md pour le vocabulaire complet et la liste des paramètres
// sonores résolus en cascade — beaconMode, vocalInterval, pitchVariation,
// les gains propres par source...). `beacon` (LOCALISATION, continue ou
// intermittente), `vocal` (EXPRESSION, toujours intermittente, voir dog.js/
// hound.js/npc.js) et `movement` (pas d'une entité mobile, voir dog.js) sont
// les trois rôles utilisés aujourd'hui, tous OPTIONNELS et indépendants —
// une entité peut composer librement (hound.js : vocal seul, sans beacon).
// D'autres pourront s'ajouter au besoin sans toucher à ce qui existe.
//
// Un type peut optionnellement porter des défauts de réglage (ex.
// audibleRange, panSaturation, interactRange — voir config/tuning.js) : ils
// interviennent dans la cascade de resolveTuning entre le son/l'instance et
// le défaut global. Les paramètres propres à un RÔLE de son (reverbSend,
// beaconGain/vocalGain/movementGain, beaconMode, pitchVariation...) vivent
// plutôt à l'intérieur du descripteur de son concerné (ex.
// sounds.beacon.beaconMode) — les deux emplacements participent à la MÊME
// cascade (voir entities/model.md), aucune logique de résolution ici,
// seulement la donnée.
//
// Les archétypes (apple/bird_1/bird_2/bird_3/buddy/chair/clock/clock_tower/
// crate/cumuloLupus/decor/dog/door/fountain/ghost/hound/item/money/neon/npc/
// object/passage/potted_plant/river/rock/statue/window) sont des PRESETS de
// propriétés — des objets plats indépendants, jamais une hiérarchie ni de
// l'héritage : voir entities/model.md. Aucun n'a de `behavior` par défaut
// (voir dog.js) : le comportement se déclare toujours à l'instance.

import apple from "./apple.js";
import bird_1 from "./bird_1.js";
import bird_2 from "./bird_2.js";
import bird_3 from "./bird_3.js";
import buddy from "./buddy.js";
import chair from "./chair.js";
import clock from "./clock.js";
import clockTower from "./clock_tower.js";
import crate from "./crate.js";
import cumuloLupus from "./cumulo-lupus.js";
import decor from "./decor.js";
import dog from "./dog.js";
import door from "./door.js";
import fountain from "./fountain.js";
import ghost from "./ghost.js";
import hound from "./hound.js";
import item from "./item.js";
import money from "./money.js";
import neon from "./neon.js";
import npc from "./npc.js";
import object from "./object.js";
import passage from "./passage.js";
import pottedPlant from "./potted_plant.js";
import river from "./river.js";
import rock from "./rock.js";
import statue from "./statue.js";
import window_ from "./window.js";

export default {
  apple,
  bird_1,
  bird_2,
  bird_3,
  buddy,
  chair,
  clock,
  clock_tower: clockTower,
  crate,
  cumuloLupus,
  decor,
  dog,
  door,
  fountain,
  ghost,
  hound,
  item,
  money,
  neon,
  npc,
  object,
  passage,
  potted_plant: pottedPlant,
  river,
  rock,
  statue,
  // Alias d'IMPORT ("window_") pour éviter d'ombrer le global navigateur
  // `window` dans ce module — la CLÉ DE REGISTRE, elle, reste "window" :
  // c'est CE nom que le contenu référence via entities[].type.
  window: window_,
};
