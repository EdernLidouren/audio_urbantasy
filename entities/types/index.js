// Registre des types d'entités. Connecteur pur, zéro logique : rassemble
// chaque archétype (un fichier par type, voir door.js/npc.js/object.js/
// rock.js/dog.js/decor.js) en un seul objet — même patron que
// core/behaviors/index.js. Donnée neutre au global : aucun import, ni du
// core ni de la vue. blocksMovement est lu par core/level.js (baké dans
// l'entité parsée) puis exploité par core/reduce.js pour arrêter le joueur
// au bord du corps d'une entité bloquante (voir BODY_RADIUS, uniforme pour
// l'instant). enterable reste PRÉVU (entrée en porte) mais pas encore
// câblé. La vue lit sounds/label/collisionSound pour le rendu audio et les
// annonces. Ni l'un ni l'autre ne dépend de l'autre, seulement de ce
// registre.
//
// label est une CLÉ i18n (jamais une chaîne affichable directement).
//
// descriptionKey (optionnel) : CLÉ i18n de la description utilisée par
// l'interaction "describe" (touche Espace, voir view/interaction.js).
// Défaut par type, surchargeable par instance via le champ
// `descriptionKey` du niveau (level/*.json) — cascade instance -> type
// identique à celle de nameKey/label (résolue dans core/level.js).
//
// sounds regroupe les descripteurs de son du type PAR RÔLE (voir
// entities/model.md pour le vocabulaire complet). `beacon` est la boucle
// positionnée qui signale l'entité dans l'espace (loop:true) — le seul rôle
// utilisé aujourd'hui. D'autres rôles pourront s'ajouter au besoin (ex. un
// son d'interaction ponctuel) sans toucher à ce qui existe.
//
// Un type peut optionnellement porter des défauts de réglage (ex.
// audibleRange, panSaturation, interactRange, reverbSend — voir
// config/tuning.js) : ils interviennent dans la cascade de resolveTuning
// entre le son/l'instance et le défaut global. Aucun type n'en définit pour
// l'instant : le reverbSend des balises retombe donc sur le défaut global,
// comportement identique à avant l'introduction du modèle de son.
//
// Les archétypes (door/npc/object/rock/dog/decor) sont des PRESETS de
// propriétés — des objets plats indépendants, jamais une hiérarchie ni de
// l'héritage : voir entities/model.md. Aucun n'a de `behavior` par défaut
// (voir dog.js) : le comportement se déclare toujours à l'instance.

import door from "./door.js";
import npc from "./npc.js";
import object from "./object.js";
import rock from "./rock.js";
import dog from "./dog.js";
import decor from "./decor.js";

export default { door, npc, object, rock, dog, decor };
