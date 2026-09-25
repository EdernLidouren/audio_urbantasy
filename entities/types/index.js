// Registre des types d'entités. Connecteur pur, zéro logique : rassemble
// chaque archétype (un fichier par type, voir apple.js/bird_1.js/bird_2.js/
// bird_3.js/buddy.js/bush.js/chair.js/clock.js/clock_tower.js/
// clock_tower_escapement.js/clock_tower_magic_mirror.js/clock_tower_mirror.js/
// coin.js/crate.js/
// cumulo-lupus.js/decor.js/dog.js/door.js/fountain.js/ghost.js/
// glass-window.js/hound.js/item.js/large_machinery.js/
// large_winding_mechanism.js/machine_1.js/miravi.js/money.js/neon.js/
// npc.js/object.js/office_computer.js/passage.js/potted_plant.js/river.js/
// rock.js/shop_counter.js/sound_emitter.js/statue.js/turret_clockwork.js/
// weight_shaft.js) en
// un seul objet —
// même patron que
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
// Les archétypes (apple/bird_1/bird_2/bird_3/buddy/bush/chair/clock/clock_tower/
// clock_tower_escapement/clock_tower_magic_mirror/clock_tower_mirror/
// coin/crate/cumuloLupus/decor/dog/door/fountain/ghost/glass_window/hound/item/
// large_machinery/large_winding_mechanism/machine_1/miravi/money/neon/npc/object/
// office_computer/passage/potted_plant/
// river/rock/shop_counter/sound_emitter/statue/turret_clockwork/weight_shaft) sont des
// PRESETS de
// propriétés — des objets plats indépendants, jamais une hiérarchie ni de
// l'héritage : voir entities/model.md. Aucun n'a de `behavior` par défaut
// (voir dog.js) : le comportement se déclare toujours à l'instance.

import apple from "./apple.js";
import bird_1 from "./bird_1.js";
import bird_2 from "./bird_2.js";
import bird_3 from "./bird_3.js";
import buddy from "./buddy.js";
import bush from "./bush.js";
import chair from "./chair.js";
import clock from "./clock.js";
import clockTower from "./clock_tower.js";
import clockTowerEscapement from "./clock_tower_escapement.js";
import clockTowerMagicMirror from "./clock_tower_magic_mirror.js";
import clockTowerMirror from "./clock_tower_mirror.js";
import coin from "./coin.js";
import crate from "./crate.js";
import cumuloLupus from "./cumulo-lupus.js";
import decor from "./decor.js";
import dog from "./dog.js";
import door from "./door.js";
import fountain from "./fountain.js";
import ghost from "./ghost.js";
import glassWindow from "./glass-window.js";
import hound from "./hound.js";
import item from "./item.js";
import largeMachinery from "./large_machinery.js";
import largeWindingMechanism from "./large_winding_mechanism.js";
import machine1 from "./machine_1.js";
import miravi from "./miravi.js";
import money from "./money.js";
import neon from "./neon.js";
import npc from "./npc.js";
import object from "./object.js";
import officeComputer from "./office_computer.js";
import passage from "./passage.js";
import pottedPlant from "./potted_plant.js";
import river from "./river.js";
import rock from "./rock.js";
import shopCounter from "./shop_counter.js";
import soundEmitter from "./sound_emitter.js";
import statue from "./statue.js";
import turretClockwork from "./turret_clockwork.js";
import weightShaft from "./weight_shaft.js";

export default {
  apple,
  bird_1,
  bird_2,
  bird_3,
  buddy,
  bush,
  chair,
  clock,
  clock_tower: clockTower,
  clock_tower_escapement: clockTowerEscapement,
  clock_tower_magic_mirror: clockTowerMagicMirror,
  clock_tower_mirror: clockTowerMirror,
  coin,
  crate,
  cumuloLupus,
  decor,
  dog,
  door,
  fountain,
  ghost,
  glass_window: glassWindow,
  hound,
  item,
  large_machinery: largeMachinery,
  large_winding_mechanism: largeWindingMechanism,
  machine_1: machine1,
  miravi,
  money,
  neon,
  npc,
  object,
  office_computer: officeComputer,
  passage,
  potted_plant: pottedPlant,
  river,
  rock,
  shop_counter: shopCounter,
  sound_emitter: soundEmitter,
  statue,
  turret_clockwork: turretClockwork,
  weight_shaft: weightShaft,
};
