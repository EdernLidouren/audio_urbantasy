// Interaction avec une entité de la scène ville. Déclenchée par des touches
// DISCRÈTES (Espace/Entrée, voir city-screen.js) — pas de maintien, donc
// aucun souci d'auto-interruption NVDA ici (contrairement au mouvement en
// touche tenue, voir CLAUDE.md). Vue + contenu : aucune RÈGLE de jeu propre
// ici (le core reste la seule source de vérité), mais réutilise l'évaluateur
// de conditions pur du core (evaluateCondition, voir actionConditionMet plus
// bas) pour les actions conditionnelles — même principe d'import que
// view/audio/city-scene.js/isPresent.

import { announce } from "../lib/announce.js";
import { t } from "../data/i18n/index.js";
import { pushScreen, popScreen, composeHook } from "../lib/screens.js";
import { makeMenuScreen } from "../lib/menu.js";
import { playOneShot } from "../lib/audio.js";
import { resolveAsset } from "../lib/assets.js";
import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";
import { evaluateCondition } from "../core/presence.js";

// Gestionnaires enregistrés UNE FOIS par view/city-screen.js, au moment de
// sa construction — au plus un écran ville vivant à la fois dans cette
// appli (même principe que activeScene, voir view/audio/city-scene.js).
// Permettent à interact() de déclencher un effet qui touche session/scene
// SANS les connaître : il délègue à qui les possède (ce fichier n'importe
// jamais le core, voir le header).
let doorTransitionHandler = null;
let pickupHandler = null;
let itemPickupHandler = null;
let lootHandler = null;
let lootSpawnHandler = null;
let sideSwitchHandler = null;

export function setDoorTransitionHandler(handler) {
  doorTransitionHandler = handler;
}

// (arrivalX) => void — bascule la face courante ET reconstruit la scène
// audio (voir view/city-screen.js/sideSwitchEffect ; core/state.js/
// switchSide ; entities/types/passage.js), même patron que
// setDoorTransitionHandler ci-dessus — PAS un travelToWorld, on reste dans
// le même monde.
export function setSideSwitchHandler(handler) {
  sideSwitchHandler = handler;
}

// (entity) => void — applique l'effet d'ÉTAT du ramassage (argent + retrait
// de l'entité, voir core/money.js/pickupEntity), fourni par city-screen.js
// qui seul détient getSession/setSession. Ce fichier ne fait qu'appeler ce
// qu'on lui a donné, puis gère le retour sensoriel (son, annonce) — jamais
// l'inverse.
export function setPickupHandler(handler) {
  pickupHandler = handler;
}

// (entity, item, count) => void — applique l'effet d'ÉTAT du ramassage vers
// le SAC (objet + retrait de l'entité, voir core/bag.js/pickupItemEntity ;
// entities/model.md/"Sac d'objets"), même patron que setPickupHandler
// ci-dessus mais DISTINCT : pickupHandler écrit dans session.money,
// itemPickupHandler dans session.bag — même verbe ("pickup"), effet choisi
// selon la FORME de l'action (voir handlePickup).
export function setItemPickupHandler(handler) {
  itemPickupHandler = handler;
}

// (entity) => void — applique l'effet d'ÉTAT du "loot" (argent + entity.consumed,
// voir core/money.js/lootEntity ; entités/model.md/"Collectible persistant"),
// même patron que setPickupHandler ci-dessus. Distinct de pickupHandler :
// l'entité looté N'EST JAMAIS retirée, seul son état change.
export function setLootHandler(handler) {
  lootHandler = handler;
}

// (entity, spawn) => void — applique l'effet d'ÉTAT du "loot à spawn"
// (entity.consumed + N entités éphémères éparpillées, voir
// core/money.js/lootEntitySpawn ; entities/model.md/"Entités éphémères"),
// même patron que setLootHandler ci-dessus — variante déclarée via
// action.spawn plutôt qu'action.amount (voir handleLoot).
export function setLootSpawnHandler(handler) {
  lootSpawnHandler = handler;
}

// () => equipment — fournit l'ÉQUIPEMENT DU JOUEUR pour l'évaluation d'une
// condition d'action (voir actionConditionMet plus bas), même principe
// d'injection que les gestionnaires ci-dessus. TOUJOURS l'équipement du
// JOUEUR : c'est lui qui DÉCLENCHE l'action, jamais l'entité-cible
// (une porte n'a pas d'équipement) — contrairement à
// core/presence.js/context.entity, qui porte l'entité RÉGIE par SA PROPRE
// règle de présence.
let playerEquipmentProvider = null;

export function setPlayerEquipmentProvider(provider) {
  playerEquipmentProvider = provider;
}

const PICKUP_SOUND_KEY = "assets/sounds/ui/pickup";

// Défensif comme tout son d'UI du projet (voir view/save-storage.js/
// playSaveSound, view/menu-sounds.js) : un fichier absent avertit, ne
// plante jamais. Catégorie "interface" : un retour de ramassage n'est pas
// positionné dans l'espace, comme un son de menu.
function playPickupSound() {
  try {
    const factor = getPref("interfaceVolume", PREF_CONSTRAINTS.interfaceVolume.default) / 100;
    playOneShot(resolveAsset(PICKUP_SOUND_KEY), { volume: factor });
  } catch (error) {
    console.warn(`interact: son de ramassage indisponible ("${PICKUP_SOUND_KEY}") : ${error.message}`);
  }
}

// Placeholder — aucun fichier fourni pour l'instant (comme PICKUP_SOUND_KEY
// à l'origine) : le try/catch ci-dessous reste le filet, jamais un plantage.
const REFUSAL_SOUND_KEY = "assets/sounds/ui/refused";

function playRefusalSound() {
  try {
    const factor = getPref("interfaceVolume", PREF_CONSTRAINTS.interfaceVolume.default) / 100;
    playOneShot(resolveAsset(REFUSAL_SOUND_KEY), { volume: factor });
  } catch (error) {
    console.warn(`interact: son de refus indisponible ("${REFUSAL_SOUND_KEY}") : ${error.message}`);
  }
}

// Marqueur sonore de bascule recto<->verso (voir CLAUDE.md/"RECTO/VERSO") —
// "metal_gate" (une grille métallique qu'on referme/ouvre) : signale
// clairement le changement de face à l'oreille, en plus du décor sonore
// différent qui suit (nouvelle scène audio, voir sideSwitchHandler). Non
// positionné (comme PICKUP_SOUND_KEY) : le joueur vient de changer de face,
// un pan/volume basé sur sa position n'aurait aucun sens ici. Défensif
// (try/catch ci-dessous) comme tout son d'UI du projet, malgré la présence
// du fichier aujourd'hui : un contenu futur pourrait renommer/retirer le
// pool sans que ce marqueur ne devienne un plantage.
const SIDE_SWITCH_SOUND_KEY = "assets/sounds/doors/metal_gate";

function playSideSwitchSound() {
  try {
    const factor = getPref("interfaceVolume", PREF_CONSTRAINTS.interfaceVolume.default) / 100;
    playOneShot(resolveAsset(SIDE_SWITCH_SOUND_KEY), { volume: factor });
  } catch (error) {
    console.warn(`interact: son de bascule indisponible ("${SIDE_SWITCH_SOUND_KEY}") : ${error.message}`);
  }
}

// Description RICHE d'une entité (interaction "describe"), distincte du nom
// annoncé à l'approche (occupation, voir view/audio/city-scene.js). INDIRECTION
// délibérée plutôt qu'un accès direct à descriptionKey : aujourd'hui une
// simple clé i18n, mais un type d'entité pourra un jour fournir une
// description DYNAMIQUE (méthode plutôt que clé statique) en changeant
// SEULEMENT cette fonction, jamais ses appelants. undefined si l'entité n'a
// rien à décrire (ex. descriptionKey absent malgré observable:true) — le
// filtrage par capacité (getInteractionCandidates) évite déjà ce cas en
// pratique, ce repli reste défensif.
//
// consumedDescriptionKey (voir core/level.js, entities/model.md/
// "Collectible persistant") : description ALTERNATIVE une fois
// entity.consumed — effet POST-ACTIVATION "changer d'état perceptible"
// d'un collectible persistant (core/money.js/lootEntity), déclaré par
// l'entité elle-même, jamais un cas spécial câblé ici. Absente -> repli sur
// descriptionKey normal (une entité consommée sans description alternative
// déclarée garde simplement la même description qu'avant).
function resolveDescription(entity) {
  const key = entity.consumed && entity.consumedDescriptionKey ? entity.consumedDescriptionKey : entity.descriptionKey;
  if (!key) return undefined;
  return t(key);
}

// Aiguillage par TYPE D'ACTION (entity.action.kind, voir core/level.js) —
// même principe que core/presence.js/CONDITION_EVALUATORS : SEUL endroit
// qui connaît les kinds. Ajouter "talk"/"activate" demain = une entrée de
// plus ici, jamais une refonte d'interact() ni de ses appelants (le core,
// lui, ne valide QUE la forme de `action` — voir son commentaire — jamais
// le kind contre ce registre, qui reste entièrement côté vue).

// "transit" (porte) : MIGRÉ dans cet aiguillage depuis l'ancien
// court-circuit `entity.type === "door"` — même effet exactement (délègue
// au gestionnaire enregistré), juste posé comme n'importe quel autre kind
// désormais (voir entities/types/door.js, action:{kind:"transit"}).
function handleTransit(entity) {
  if (doorTransitionHandler) doorTransitionHandler(entity.target);
}

// "switchSide" (point de passage recto<->verso, voir entities/types/
// passage.js) : MÊME PATRON que handleTransit — délègue tout l'effet
// d'ÉTAT + AUDIO au gestionnaire enregistré (voir view/city-screen.js/
// sideSwitchEffect), PUIS joue le marqueur sonore de bascule ICI (comme
// handlePickup/handleLoot jouent LEUR retour sensoriel après avoir délégué
// l'effet d'état). arrivalX : donnée de CONTENU (action.arrivalX, jamais
// validée en FORME par core/level.js — voir son commentaire sur `action`,
// même politique que amount/spawn ci-dessous) — un contenu mal formé se
// dégrade en avertissement, jamais un plantage.
function handleSwitchSide(entity) {
  const arrivalX = entity.action.arrivalX;
  if (!Number.isFinite(arrivalX)) {
    console.warn(`interact: action "switchSide" sur "${entity.id}" sans arrivalX numérique valide.`);
    return;
  }
  if (!sideSwitchHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  sideSwitchHandler(arrivalX);
  playSideSwitchSound();
}

// "pickup" : effet d'ÉTAT délégué au gestionnaire enregistré — PUIS retour
// sensoriel, vue pure ici (son défensif, annonce brève). DEUX formes
// possibles pour action.kind:"pickup", jamais mélangées sur une même
// entité (distinguées par la PRÉSENCE du champ, même principe que
// handleLoot pour action.spawn/amount) :
//   - action.item : vers le SAC (voir core/bag.js/pickupItemEntity,
//     entities/model.md/"Sac d'objets") — le nom affiché ("Ramassé :
//     <objet>") vient de entity.labelKey, déjà résolu par le core (voir
//     core/level.js) : ce fichier n'importe jamais le core, donc jamais le
//     registre d'objets (core/items.js) — c'est au contenu de niveau de
//     donner à l'entité le MÊME nameKey que ITEM_REGISTRY[type].label pour
//     que le nom ramassé corresponde à celui du sac (convention, jamais
//     une contrainte structurelle).
//   - action.amount : vers session.money (comportement d'origine).
function handlePickup(entity) {
  const item = entity.action.item;
  if (item !== undefined) {
    const count = entity.action.count ?? 1;
    if (typeof item !== "string" || item === "" || !Number.isInteger(count) || count <= 0) {
      console.warn(`interact: action "pickup" (item) sur "${entity.id}" mal formée.`);
      return;
    }
    if (!itemPickupHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
    itemPickupHandler(entity, item, count);
    playPickupSound();
    announce(t("interaction.pickupItem", { item: t(entity.labelKey) }), { assertive: true });
    return;
  }

  const amount = entity.action.amount;
  if (!Number.isFinite(amount)) {
    console.warn(`interact: action "pickup" sur "${entity.id}" sans amount numérique valide.`);
    return;
  }
  if (!pickupHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  pickupHandler(entity);
  playPickupSound();
  announce(t("interaction.pickup", { amount }), { assertive: true });
}

// "loot" : COLLECTIBLE PERSISTANT (voir core/money.js/lootEntity,
// entities/model.md/"Collectible persistant") — même structure que
// handlePickup ci-dessus (amount validé, son défensif, annonce), mais
// l'entité N'EST JAMAIS retirée : elle change d'état (consumed:true), avec
// ses effets post-activation DÉCLARATIFS (description alternative —
// resolveDescription ci-dessus ; devenir dormant — une règle de présence
// sur la condition "consumed", voir core/presence.js) résolus ailleurs,
// jamais ici. IDEMPOTENCE côté retour SENSORIEL, pas seulement en core :
// sans cette garde, réactiver une entité déjà consumed rejouerait le son +
// l'annonce "trouvé N pièces" alors qu'aucun argent n'est réellement ajouté
// (lootEntity, lui, se dégrade déjà silencieusement — voir son commentaire)
// — le piège exact que ce système doit éviter.
//
// DEUX formes possibles pour action.kind:"loot", jamais mélangées sur une
// même entité — voir entities/model.md/"Entités éphémères" :
//   - action.amount : crédite directement (comportement d'origine, ex.
//     crate-port/crate-warehouse) ;
//   - action.spawn : { spec, count, spread } — fait naître `count` entités
//     éphémères ÉPARPILLÉES autour de la source AU LIEU de créditer
//     directement (ex. crate-stash, level/demo2.json) ; chacune se
//     ramasse ensuite individuellement via sa PROPRE action "pickup" (déjà
//     robuste, rien à ajouter). `spec` (minimal, ex. { type: "money",
//     amount: 20 }) est résolu en descripteur COMPLET par lootSpawnHandler
//     (voir view/city-screen.js/resolveEphemeralSpec) — ce fichier n'en
//     connaît que la forme brute, jamais le registre.
function handleLoot(entity) {
  if (entity.consumed) return;

  const spawn = entity.action.spawn;
  if (spawn) {
    if (!Number.isInteger(spawn.count) || spawn.count <= 0 || !spawn.spec || !spawn.spec.type) {
      console.warn(`interact: action "loot" (spawn) sur "${entity.id}" mal formée.`);
      return;
    }
    if (!lootSpawnHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
    lootSpawnHandler(entity, spawn);
    playPickupSound();
    // Pas de MONTANT ici (contrairement au cas action.amount ci-dessous) :
    // rien n'est encore GAGNÉ, seulement RÉPANDU autour de la source — le
    // joueur ramassera chaque pièce individuellement, chacune annonçant
    // déjà son propre gain (voir handlePickup).
    announce(t("interaction.lootSpawn", { count: spawn.count }), { assertive: true });
    return;
  }

  const amount = entity.action.amount;
  if (!Number.isFinite(amount)) {
    console.warn(`interact: action "loot" sur "${entity.id}" sans amount numérique valide.`);
    return;
  }
  if (!lootHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)
  lootHandler(entity);
  playPickupSound();
  announce(t("interaction.loot", { amount }), { assertive: true });
}

const ACTION_HANDLERS = {
  transit: handleTransit,
  pickup: handlePickup,
  loot: handleLoot,
  switchSide: handleSwitchSide,
};

// ACTIONS CONDITIONNELLES (voir core/level.js, action.condition/refusalKey)
// — GÉNÉRIQUE à TOUT kind de ACTION_HANDLERS ci-dessus, pas un cas spécial
// de "transit" : une caisse verrouillée, un PNJ qui ne parle qu'à condition
// réutiliseront cette MÊME vérification, jamais un second mécanisme.
// Réutilise TEL QUEL l'évaluateur de conditions du core
// (core/presence.js/evaluateCondition) — même objet déclaratif que
// presence[].when, déjà validé au chargement (core/level.js). context.entity
// porte l'équipement du JOUEUR (voir setPlayerEquipmentProvider) : c'est lui
// qui DÉCLENCHE l'action, jamais l'entité-cible (une porte n'a pas
// d'équipement).
function actionConditionMet(condition) {
  const equipment = playerEquipmentProvider ? playerEquipmentProvider() : undefined;
  return evaluateCondition(condition, { entity: { equipment } });
}

// kind ∈ { "describe", "activate" }. entity est déjà un candidat FILTRÉ par
// capacité (voir view/audio/city-scene.js/getInteractionCandidates) — cette
// fonction fait confiance à son appelant, elle ne revérifie pas
// observable/interactable elle-même.
export function interact(entity, kind) {
  if (kind === "describe") {
    const description = resolveDescription(entity);
    if (!description) return;
    announce(description, { assertive: true });
    return;
  }

  if (kind === "activate") {
    // Pas d'action différenciée déclarée (ex. npc/object aujourd'hui,
    // interactables mais sans kind encore câblé) -> silence, comportement
    // STUB générique inchangé pour ce contenu-là.
    if (!entity.action) return;

    // Condition fausse -> REFUS informatif (message + son), AUCUN effet,
    // AUCUNE transition : l'action est simplement bloquée, proprement.
    // Action sans condition (tout contenu existant) -> ce bloc est
    // sauté entièrement, comportement STRICTEMENT inchangé.
    if (entity.action.condition && !actionConditionMet(entity.action.condition)) {
      playRefusalSound();
      announce(t(entity.action.refusalKey), { assertive: true });
      return;
    }

    const handler = ACTION_HANDLERS[entity.action.kind];
    if (!handler) {
      // Kind DÉCLARÉ mais inconnu de ce registre : un vrai bug de contenu,
      // signalé au développeur (console), mais jamais audible/annoncé au
      // joueur ni fatal — même politique de dégradation que le reste de
      // l'aiguillage par kind du projet (voir core/presence.js).
      console.warn(`interact: type d'action "${entity.action.kind}" inconnu sur l'entité "${entity.id}".`);
      return;
    }
    handler(entity);
    return;
  }
}

// Menu de désambiguïsation : un candidat par entrée, dans l'ordre déjà trié
// reçu (donc pas de tri ici). Construit sur makeMenuScreen — aucun système
// de menu réinventé. kind est celui de la touche pressée à l'ouverture
// (Espace/Entrée) : il voyage jusqu'à l'activation d'une entrée, pour que
// interact(entité, kind) reçoive le BON kind quel que soit le candidat
// choisi.
//
// scene fournit pauseBeacons()/resumeBeacons() (voir
// view/audio/city-scene.js) : seules les balises positionnées de la scène
// sont mises en pause pendant le menu, jamais le contexte audio global —
// une future musique/ambiance continuerait derrière ce menu.
function openDisambiguationMenu(candidates, kind, scene) {
  const menu = {
    // Titre propre au verbe (Espace/observer vs Entrée/interagir) : les deux
    // menus partagent le même mécanisme (makeMenuScreen), jamais le même
    // intitulé — l'utilisateur doit savoir CE QU'IL choisit, pas seulement
    // PARMI QUOI.
    title: kind === "describe" ? "menu.interaction.observe.title" : "menu.interaction.title",
    closable: true, // Échap ferme sans rien faire
    entries: candidates.map((entity) => ({
      label: entity.labelKey,
      onActivate: () => {
        popScreen();
        interact(entity, kind);
      },
    })),
  };

  const screen = makeMenuScreen(menu, t);

  // makeMenuScreen ne connaît rien de l'audio : on enveloppe onEnter/onExit
  // ici plutôt que d'y toucher, pour garder ce module générique inchangé.
  // Composition (voir composeHook) : onEnter de base (annonce d'ouverture)
  // PUIS pause des balises ; onExit de base (actuellement aucun, mais
  // composé quand même par principe) PUIS reprise des balises.
  screen.onEnter = composeHook(screen.onEnter, () => scene.pauseBeacons());
  screen.onExit = composeHook(screen.onExit, () => scene.resumeBeacons());

  pushScreen(screen);
}

// candidates = entités dont la zone d'interaction englobe le joueur, DÉJÀ
// triées par x croissant — même ensemble, même tri que l'annonce
// d'occupation (voir view/audio/city-scene.js, occupiedEntities). scene :
// voir openDisambiguationMenu ci-dessus.
export function chooseInteractionTarget(candidates, kind, scene) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // 2+ candidats : le choix ne peut plus être immédiat, il devient
  // asynchrone (menu). null signale à l'appelant qu'il n'y a rien à faire
  // MAINTENANT — le futur choix appellera interact() lui-même (onActivate
  // ci-dessus), avec le kind mémorisé ici.
  openDisambiguationMenu(candidates, kind, scene);
  return null;
}
