// Registre des types d'entités. Connecteur pur, zéro logique : rassemble
// chaque archétype (un fichier par type, voir les imports ci-dessous) en
// un seul objet — même patron que core/behaviors/index.js. Donnée neutre au global : aucun import, ni du
// core ni de la vue. blocksMovement est lu par core/entity-parse.js (baké
// dans l'entité parsée) puis exploité par core/reduce.js pour arrêter le joueur
// au bord du corps d'une entité bloquante (voir BODY_RADIUS, uniforme pour
// l'instant). observable/interactable (système d'interaction niveau 0, voir
// view/interaction.js et doc/entity-model.md) sont bakés de la même façon,
// cascade instance -> type -> défaut (false), et filtrent les candidats PAR
// VERBE (view/occupancy.js/getInteractionCandidates).
// La vue lit sounds/nameKey/collisionSound pour le rendu audio et les
// annonces. Ni l'un ni l'autre ne dépend de l'autre, seulement de ce
// registre.
//
// nameKey est une CLÉ i18n (jamais une chaîne affichable directement),
// forme "<namespace>.name" (ex. "entity.window.name") — SYMÉTRIQUE à
// descriptionKey ci-dessous : même nom de champ à l'archétype ET à
// l'instance (scenes/*.json), jamais un champ "label" séparé.
//
// descriptionKey (optionnel) : CLÉ i18n de la description utilisée par
// l'interaction "describe" (touche Espace, voir view/interaction.js).
// Défaut par type, surchargeable par instance via le champ
// `descriptionKey` de la scène (scenes/*.json) — cascade instance -> type
// identique à celle de nameKey (résolue dans core/entity-parse.js).
//
// sounds regroupe les descripteurs de son du type PAR RÔLE (voir
// doc/entity-model.md pour le vocabulaire complet et la liste des paramètres
// sonores résolus en cascade — beaconMode, vocalInterval, pitchVariation,
// les gains propres par source...). `beacon` (LOCALISATION, continue ou
// intermittente), `vocal` (EXPRESSION, toujours intermittente, voir dog.js/
// hound.js/npc.js) et `movement` (pas d'une entité mobile, voir dog.js) sont
// les trois rôles principaux (liste complète : doc/entity-model.md/
// "Vocabulaire de sons"), tous OPTIONNELS et indépendants —
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
// cascade (voir doc/entity-model.md), aucune logique de résolution ici,
// seulement la donnée.
//
// Les archétypes sont des PRESETS de
// propriétés — des objets plats indépendants, jamais une hiérarchie ni de
// l'héritage : voir doc/entity-model.md. Aucun n'a de `behavior` par défaut
// (voir dog.js) : le comportement se déclare toujours à l'instance.

import apple from "./apple.js";
import automaticSlidingDoor from "./automatic_sliding_door.js";
import bird1 from "./bird_1.js";
import bird2 from "./bird_2.js";
import bird3 from "./bird_3.js";
import buddy from "./buddy.js";
import brokenComputer from "./broken_computer.js";
import bush from "./bush.js";
import chair from "./chair.js";
import clock from "./clock.js";
import clockTower from "./clock_tower.js";
import clockTowerEscapement from "./clock_tower_escapement.js";
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
import magicMirror from "./magic_mirror.js";
import miravi from "./miravi.js";
import mirror from "./mirror.js";
import mopAndBucket from "./mop_and_bucket.js";
import money from "./money.js";
import neon from "./neon.js";
import npc from "./npc.js";
import object from "./object.js";
import officeChair from "./office_chair.js";
import officeComputer from "./office_computer.js";
import officeSupplyBox from "./office_supply_box.js";
import officeTable from "./office_table.js";
import officeWaterCooler from "./office_water_cooler.js";
import oldSurveyMap from "./old_survey_map.js";
import passage from "./passage.js";
import pottedPlant from "./potted_plant.js";
import reversedClockTowerEscapement from "./reversed_clock_tower_escapement.js";
import reversedLargeWindingMechanism from "./reversed_large_winding_mechanism.js";
import reversedWeightShaft from "./reversed_weight_shaft.js";
import river from "./river.js";
import rock from "./rock.js";
import sceneExit from "./scene_exit.js";
import shopCounter from "./shop_counter.js";
import soundEmitter from "./sound_emitter.js";
import statue from "./statue.js";
import turretClockwork from "./turret_clockwork.js";
import videoProjection from "./video_projection.js";
import videoProjector from "./video_projector.js";
import weightShaft from "./weight_shaft.js";

export default {
  apple,
  automatic_sliding_door: automaticSlidingDoor,
  bird_1: bird1,
  bird_2: bird2,
  bird_3: bird3,
  buddy,
  broken_computer: brokenComputer,
  bush,
  chair,
  clock,
  clock_tower: clockTower,
  clock_tower_escapement: clockTowerEscapement,
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
  magic_mirror: magicMirror,
  miravi,
  mirror,
  money,
  mop_and_bucket: mopAndBucket,
  neon,
  npc,
  object,
  office_chair: officeChair,
  office_computer: officeComputer,
  office_supply_box: officeSupplyBox,
  office_table: officeTable,
  office_water_cooler: officeWaterCooler,
  old_survey_map: oldSurveyMap,
  passage,
  potted_plant: pottedPlant,
  reversed_clock_tower_escapement: reversedClockTowerEscapement,
  reversed_large_winding_mechanism: reversedLargeWindingMechanism,
  reversed_weight_shaft: reversedWeightShaft,
  river,
  rock,
  scene_exit: sceneExit,
  shop_counter: shopCounter,
  sound_emitter: soundEmitter,
  statue,
  turret_clockwork: turretClockwork,
  video_projection: videoProjection,
  video_projector: videoProjector,
  weight_shaft: weightShaft,
};
