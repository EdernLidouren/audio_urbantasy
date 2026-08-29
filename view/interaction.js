// Interaction avec une entité de la scène ville. Déclenchée par des touches
// DISCRÈTES (Espace/Entrée, voir city-screen.js) — pas de maintien, donc
// aucun souci d'auto-interruption NVDA ici (contrairement au mouvement en
// touche tenue, voir CLAUDE.md). Vue + contenu uniquement : aucune règle de
// jeu, aucun import du core.

import { announce } from "../lib/announce.js";
import { t } from "../i18n/index.js";
import { pushScreen, popScreen, composeHook } from "../lib/screens.js";
import { makeMenuScreen } from "../lib/menu.js";
import { playOneShot } from "../lib/audio.js";
import { resolveAsset } from "../lib/assets.js";
import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";

// Gestionnaires enregistrés UNE FOIS par view/city-screen.js, au moment de
// sa construction — au plus un écran ville vivant à la fois dans cette
// appli (même principe que activeScene, voir view/audio/city-scene.js).
// Permettent à interact() de déclencher un effet qui touche session/scene
// SANS les connaître : il délègue à qui les possède (ce fichier n'importe
// jamais le core, voir le header).
let doorTransitionHandler = null;
let pickupHandler = null;
let lootHandler = null;

export function setDoorTransitionHandler(handler) {
  doorTransitionHandler = handler;
}

// (entity) => void — applique l'effet d'ÉTAT du ramassage (argent + retrait
// de l'entité, voir core/money.js/pickupEntity), fourni par city-screen.js
// qui seul détient getSession/setSession. Ce fichier ne fait qu'appeler ce
// qu'on lui a donné, puis gère le retour sensoriel (son, annonce) — jamais
// l'inverse.
export function setPickupHandler(handler) {
  pickupHandler = handler;
}

// (entity) => void — applique l'effet d'ÉTAT du "loot" (argent + entity.consumed,
// voir core/money.js/lootEntity ; entités/model.md/"Collectible persistant"),
// même patron que setPickupHandler ci-dessus. Distinct de pickupHandler :
// l'entité looté N'EST JAMAIS retirée, seul son état change.
export function setLootHandler(handler) {
  lootHandler = handler;
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

// "pickup" : effet d'ÉTAT délégué au gestionnaire enregistré (voir
// setPickupHandler) — PUIS retour sensoriel, vue pure ici (son défensif,
// annonce brève). amount manquant/invalide sur l'entité -> avertit et
// s'arrête, jamais de crash ni d'argent ajouté sans valeur sensée.
function handlePickup(entity) {
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
function handleLoot(entity) {
  if (entity.consumed) return;
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
};

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
