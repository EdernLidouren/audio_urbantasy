// Écran "ville" : possède l'onTick continu (déplacement) et la scène audio
// spatiale qui suit la position du joueur. Ne détient aucune donnée de
// partie en propre — vue sur la session (état du core), lue/écrite via les
// accesseurs fournis par main.js.

import { getMoveIntent, CITY_BINDINGS } from "./input.js";
import { resolveAction } from "../lib/input.js";
import { announce } from "../lib/announce.js";
import { t } from "../i18n/index.js";
import { ensureAudioUnlocked } from "../lib/audio.js";
import { createCityAudioScene } from "./audio/city-scene.js";
import {
  interact,
  chooseInteractionTarget,
  setDoorTransitionHandler,
  setPickupHandler,
  setItemPickupHandler,
  setLootHandler,
  setLootSpawnHandler,
  setSideSwitchHandler,
  setPlayerEquipmentProvider,
} from "./interaction.js";
import { openPauseMenu } from "./menus/pause-menu.js";
import {
  openInventoryMenu,
  openEquipmentMenu,
  setDropItemHandler,
  setEquipItemHandler,
  setUnequipItemHandler,
} from "./menus/inventory-menu.js";
import { setGameReplaceHandler } from "./menus/save-menu.js";
import { tick } from "../core/actions.js";
import { reduce } from "../core/reduce.js";
import { loadLevelById } from "../level/load.js";
import { getActiveWorld, travelToWorld, switchSide, spawnEphemeral, isTwoSided } from "../core/state.js";
import { pickupEntity, lootEntity, lootEntitySpawn } from "../core/money.js";
import { pickupItemEntity, dropItem } from "../core/bag.js";
import { equipItem, unequipItem } from "../core/equipment.js";
import { ITEM_REGISTRY } from "../core/items.js";
import { isDebugEnabled } from "../config/debug.js";
import {
  advanceTime,
  minuteOfHour,
  hourOfDay,
  dayOfMonth,
  monthOfYear,
  seasonOfYear,
  yearNumber,
  SEASON_KEYS,
  MONTH_KEYS,
} from "../core/time.js";
import registry from "../entities/types/index.js";
import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";
import { saveGame } from "./save-storage.js";
import { TIME_CONFIG } from "../config/time-values.js";

// Outil de VÉRIFICATION du système de temps (voir core/time.md) : formate
// et annonce heure + date courantes, sur demande (touche "t", voir
// onKeyDown plus bas) — rien d'autre ne consomme encore session.time. Deux
// chiffres systématiques (padStart) pour une lecture d'horloge stable,
// jamais "9 h 5".
function pad2(n) {
  return String(n).padStart(2, "0");
}

// Composants NOMMÉS fournis au gabarit "time.announce" — le code ne décide
// d'AUCUN ordre ni ponctuation, seule la chaîne i18n (une par langue) le
// fait (voir i18n/fr.js/en.js, forme "heure, jour mois, saison, année" —
// l'ordre jour/mois lui-même reste propre à chaque langue) : month/season
// sont déjà résolus en texte ICI (t(...) sur leur clé) avant d'être
// interpolés — interpolate() ne fait que remplacer des chaînes dans un
// gabarit, jamais une traduction imbriquée. weekday (voir core/time.js/
// weekdayOf, WEEKDAY_KEYS) ne fait PAS partie de cette forme — sa
// dérivation reste dans le core, prête pour un futur gabarit qui la
// redemanderait, mais rien ici ne la lit plus.
function announceGameTime(session) {
  const { time } = session;
  announce(
    t("time.announce", {
      hour: pad2(hourOfDay(time)),
      minute: pad2(minuteOfHour(time)),
      day: dayOfMonth(time),
      month: t(MONTH_KEYS[monthOfYear(time) - 1]),
      season: t(SEASON_KEYS[seasonOfYear(time)]),
      year: yearNumber(time),
    })
  );
}

// Consultation pure de session.money (touche "g", voir onKeyDown plus bas) —
// même patron que announceGameTime : aucune action, juste une lecture d'état
// annoncée. Canal liveRegion par défaut (announce() sans option), comme le
// temps.
function announceMoney(session) {
  announce(t("money.announce", { amount: session.money }));
}

// Consultation pure de session.player.x (touche "x", voir onKeyDown plus
// bas) — même patron que announceGameTime/announceMoney (aucune action,
// juste une lecture d'état annoncée), désormais DISPONIBLE EN JEU NORMAL
// (plus réservée au debug) : c'est la PRÉCISION de {x} qui varie selon
// isDebugEnabled() (config/debug.js), jamais la disponibilité de la touche
// ni le reste du gabarit.
//   - mode debug : flottant à deux décimales (toFixed) — session.player.x
//     dérive d'additions répétées de MOVE_STEP (core/state.js), donc porte
//     souvent une dizaine de décimales de bruit flottant sans intérêt à
//     l'oreille (ex. 14.679999999999863) ; deux décimales restent largement
//     assez précises pour un diagnostic de position.
//   - mode normal : entier ARRONDI (Math.round, jamais tronqué/Math.floor)
//     — lisible pour le joueur, sans le bruit flottant ni la fausse
//     précision d'un outil de diagnostic.
// {length} (world.length, PARTAGÉ même pour une scène à deux faces — voir
// core/level.js) situe {x} dans l'étendue du lieu, dans les DEUX modes.
//
// Face courante (RECTO/VERSO, voir CLAUDE.md) : annoncée EN PLUS, mais
// SEULEMENT si le monde actif a réellement deux faces (isTwoSided) —
// aucune info de face pour une scène simple, où elle n'aurait aucun sens.
function announcePlayerX(session) {
  const world = session.worlds[session.activeWorldId];
  const x = isDebugEnabled() ? session.player.x.toFixed(2) : Math.round(session.player.x);
  if (isTwoSided(world)) {
    announce(t("position.announceWithSide", { x, length: world.length, side: t(`side.${session.player.side}`) }));
    return;
  }
  announce(t("position.announce", { x, length: world.length }));
}

// Résout un descripteur ÉPHÉMÈRE MINIMAL (type + surcharges, ex. { type:
// "money", amount: 20 } — même forme qu'une instance de niveau) en spec
// COMPLET pour spawnEphemeral/spawnScatteredEphemerals (core/state.js) :
// EXACTEMENT la forme qu'une instance { type } SANS surcharge obtiendrait
// en sortie de core/level.js/parseEntity, résolue ICI à la main — la vue
// connaît déjà le registre, contrairement au core (spawnEphemeral ne fait
// que porter ce descripteur, jamais l'interpréter). `overrides.amount`/
// `overrides.count`, s'ils sont fournis, REMPLACENT DANS `action` UNIQUEMENT
// le champ concerné (jamais de fusion profonde — même principe que
// core/level.js pour `action`/`behavior` d'instance) : une pièce éparpillée
// à 20 plutôt que les 5 par défaut de "money" (`amount`), ou N exemplaires
// d'un objet posé plutôt que le 1 par défaut de son type (`count`), sans
// toucher au reste de l'action (kind, etc.). TROIS appelants aujourd'hui :
// la touche debug "e" (voir onKeyDown plus bas), l'effet "loot à spawn"
// (voir lootSpawnEffect ci-dessous, `amount`) et l'effet "Poser" (voir
// resolveDroppedItemSpec/dropItemEffect ci-dessous, `count`) — assez pour
// justifier cette petite factorisation, pas plus.
function resolveEphemeralSpec(type, overrides = {}) {
  const typeDef = registry[type];
  let action = typeDef.action;
  if (overrides.amount !== undefined) action = { ...action, amount: overrides.amount };
  if (overrides.count !== undefined) action = { ...action, count: overrides.count };
  return {
    type,
    labelKey: typeDef.label,
    descriptionKey: typeDef.descriptionKey,
    blocksMovement: Boolean(typeDef.blocksMovement),
    observable: Boolean(typeDef.observable),
    interactable: Boolean(typeDef.interactable),
    action,
  };
}

// Descripteur ÉPHÉMÈRE de test (touche "e" en mode debug, voir onKeyDown
// plus bas ; core/state.js/spawnEphemeral) — une PIÈCE ramassable,
// réutilise TEL QUEL l'archétype "money" existant (entities/types/money.js).
const EPHEMERAL_COIN_SPEC = resolveEphemeralSpec("money");

// Résout le spec ÉPHÉMÈRE d'un objet du SAC posé au sol ("Poser", voir
// view/menus/inventory-menu.js/setDropItemHandler ; entities/model.md/"Sac
// d'objets") — DEUX cas selon que `type` (une clé de core/items.js/
// ITEM_REGISTRY, ex. "apple"/"key_bronze") possède ou non son PROPRE
// archétype d'entité dans le registre (convention : même clé, voir
// entities/types/apple.js) :
//   - archétype dédié ("apple") -> resolveEphemeralSpec tel quel, avec
//     `count` substitué dans action.count (comme `overrides.amount` le fait
//     déjà pour "money") ;
//   - aucun archétype dédié ("key_bronze") -> repli sur l'archétype
//     GÉNÉRIQUE "item" (entities/types/item.js) pour `type`/`sounds` (le
//     rendu audio, voir view/audio/city-scene.js/buildEntitySoundEntry, lit
//     TOUJOURS `registry[entity.type].sounds` — `spec.type` doit donc rester
//     une clé RÉELLE du registre d'entités, jamais le type d'OBJET brut),
//     mais avec nameKey/descriptionKey/action PROPRES à l'objet (depuis
//     ITEM_REGISTRY), exactement comme le ferait une instance de niveau qui
//     utiliserait ce type générique (voir le header d'entities/types/item.js).
function resolveDroppedItemSpec(type, count) {
  if (registry[type]) {
    return resolveEphemeralSpec(type, { count });
  }
  const props = ITEM_REGISTRY[type];
  const generic = registry.item;
  return {
    type: "item",
    labelKey: props.label,
    descriptionKey: props.descriptionKey,
    blocksMovement: Boolean(generic.blocksMovement),
    observable: Boolean(generic.observable),
    interactable: Boolean(generic.interactable),
    action: { kind: "pickup", item: type, count },
  };
}

export function makeCityScreen(getSession, setSession) {
  let scene = null;

  // Transition FRANCHE (pas de fondu, pas d'animation) vers `targetId` :
  // scene.destroy() arrête et décharge TOUT ce que possédait le lieu
  // courant — balises, réverb, ET canaux globaux musique/ambiance (voir
  // view/audio/city-scene.js) — donc aucun Howl résiduel, rien de plus à
  // nettoyer ici. Le monde quitté est RANGÉ (gelé) dans session.worlds, pas
  // détruit : une re-visite le ressort tel quel (voir core/state.js,
  // travelToWorld). Le fetch reste ici, au bord — SEULEMENT si la cible
  // n'est pas déjà connue de la partie ; sinon aucun réseau, la cible
  // ressort directement de worlds. Nouvelle scène audio sur le monde actif,
  // annonce du titre.
  //
  // PARTAGÉE par transitionThroughDoor (porte, spawnX omis -> playerStart
  // du niveau cible, comportement STRICTEMENT inchangé) ET travelViaCityMap
  // (carte de la ville, voir plus bas ; view/menus/city-map-menu.js) :
  // spawnX, fourni SEULEMENT dans ce second cas, REMPLACE le playerStart
  // déjà posé par travelToWorld — le point de TÉLÉPORTATION d'une case de
  // carte (level/city-map.js) n'est pas forcément le point d'arrivée par
  // porte.
  //
  // scene reste null le temps de l'attente réseau (éventuelle) : onTick et
  // onKeyDown s'en gardent (voir plus bas) plutôt que d'accéder une scène
  // absente — aucune touche n'a d'effet pendant cette brève fenêtre.
  async function performTransition(targetId, spawnX) {
    scene.destroy();
    scene = null;

    const session = getSession();
    const alreadyVisited = Boolean(session.worlds[targetId]);
    const freshLevel = alreadyVisited ? null : await loadLevelById(targetId, registry);

    let nextSession = travelToWorld(session, targetId, freshLevel);
    if (spawnX !== undefined) {
      nextSession = { ...nextSession, player: { ...nextSession.player, x: spawnX } };
    }
    setSession(nextSession);
    scene = createCityAudioScene(getSession);
    announce(t(getActiveWorld(getSession()).titleKey), { assertive: true });

    // Auto-save SUR TRANSITION (préférence autoSaveOnTransition, défaut
    // true) : la transition vient d'atteindre un point de cohérence
    // naturel (nouveau monde actif, ancien rangé). SANS le son
    // (playSound:false) : une simple traversée de porte ne doit jamais se
    // superposer au reste de l'ambiance sonore — seules la sauvegarde
    // manuelle et l'auto-save temporelle (voir view/autosave-timer.js) le
    // jouent (et seulement si l'utilisateur l'a activé, voir
    // saveSoundEnabled).
    if (getPref("autoSaveOnTransition", PREF_CONSTRAINTS.autoSaveOnTransition.default)) {
      saveGame(getSession(), { playSound: false });
    }
  }

  async function transitionThroughDoor(targetId) {
    await performTransition(targetId);
  }

  // Sélection sur la carte de la ville (voir view/menus/city-map-menu.js,
  // level/city-map.js) : MÊME transition franche qu'une porte, spawnX
  // explicite (point de TP de la case). Fonctionne AUSSI pour
  // re-sélectionner sa PROPRE zone (recentrage volontaire, confort assumé
  // pour un jeu sans challenge) : travelToWorld ne fait AUCUNE distinction
  // particulière, targetId === activeWorldId range puis re-ressort le MÊME
  // monde (éphémères purgés au passage, comme toute sortie de scène),
  // joueur replacé à spawnX — un reset volontaire de la zone courante, pas
  // un cas spécial à coder.
  async function travelViaCityMap(levelId, spawnX) {
    await performTransition(levelId, spawnX);
  }

  // Remplace la partie EN COURS par une session importée (voir
  // view/menus/save-menu.js) : même mécanique que transitionThroughDoor
  // (détruit la scène, remplace la session, reconstruit la scène sur le
  // nouveau monde actif) — pour ne jamais laisser un Howl résiduel de
  // l'ancien monde ni une scène désynchronisée de la session. Le son +
  // l'annonce "Partie importée" restent à la charge de l'appelant (voir
  // save-menu.js), symétrique à saveGame qui gère les siens lui-même.
  function replaceCurrentGame(newSession) {
    scene.destroy();
    scene = null;
    setSession(newSession);
    scene = createCityAudioScene(getSession);
  }

  // Bascule recto<->verso (voir view/interaction.js/ACTION_HANDLERS.
  // switchSide ; entities/types/passage.js ; CLAUDE.md/"RECTO/VERSO") —
  // MÊME SOIN que transitionThroughDoor pour l'audio : scene.destroy()
  // AVANT tout changement d'état, pour n'avoir AUCUN Howl résiduel de la
  // face quittée, scène reconstruite APRÈS la bascule core sur la NOUVELLE
  // face active (getActiveWorld, voir core/state.js, la lit déjà via
  // session.player.side). PAS de travelToWorld : le monde actif ne change
  // pas, juste session.player.side + la position du joueur — pas de
  // fetch réseau, pas de nouveau titre à annoncer (même lieu). Le marqueur
  // sonore de bascule reste à la charge de l'appelant (voir
  // handleSwitchSide, view/interaction.js), symétrique aux autres effets
  // d'état de ce fichier (son/annonce restent côté interaction.js).
  function sideSwitchEffect(arrivalX) {
    scene.destroy();
    scene = null;
    setSession(switchSide(getSession(), arrivalX));
    scene = createCityAudioScene(getSession);
  }

  // Effet d'ÉTAT du ramassage (voir view/interaction.js/ACTION_HANDLERS.
  // pickup) : argent + retrait de l'entité, core pur (core/money.js) —
  // c'est TOUT ce que fait ce gestionnaire, le son/l'annonce restent côté
  // interaction.js, qui l'appelle.
  function pickupEntityEffect(entity) {
    setSession(pickupEntity(getSession(), entity.id, entity.action.amount));
  }

  // Effet d'ÉTAT du ramassage vers le SAC (voir view/interaction.js/
  // ACTION_HANDLERS.pickup, action.item ; entities/model.md/"Sac
  // d'objets") : objet + retrait de l'entité, core pur
  // (core/bag.js/pickupItemEntity) — même patron que pickupEntityEffect
  // ci-dessus, mais écrit dans session.bag plutôt que session.money.
  function itemPickupEntityEffect(entity, item, count) {
    setSession(pickupItemEntity(getSession(), entity.id, item, count));
  }

  // Effet d'ÉTAT du "loot" (voir view/interaction.js/ACTION_HANDLERS.loot ;
  // entities/model.md/"Collectible persistant") : argent + entity.consumed,
  // core pur (core/money.js/lootEntity) — même patron que
  // pickupEntityEffect ci-dessus, mais l'entité N'EST JAMAIS retirée.
  function lootEntityEffect(entity) {
    setSession(lootEntity(getSession(), entity.id, entity.action.amount));
  }

  // Effet d'ÉTAT du "loot à spawn" (voir view/interaction.js/
  // ACTION_HANDLERS.loot, action.spawn ; entities/model.md/"Entités
  // éphémères") : entity.consumed + N entités éphémères ÉPARPILLÉES, core
  // pur (core/money.js/lootEntitySpawn) — même patron que lootEntityEffect
  // ci-dessus, mais `spec` doit d'abord être RÉSOLU (spawn.spec est minimal,
  // ex. { type: "money", amount: 20 }, voir resolveEphemeralSpec plus haut)
  // avant d'être transmis au core, qui ignore tout du registre.
  function lootSpawnEffect(entity, spawn) {
    const spec = resolveEphemeralSpec(spawn.spec.type, spawn.spec);
    setSession(lootEntitySpawn(getSession(), entity.id, spec, spawn.count, spawn.spread));
  }

  // Effet d'ÉTAT du "Poser" (voir view/menus/inventory-menu.js/
  // setDropItemHandler ; entities/model.md/"Sac d'objets") : retire `count`
  // exemplaire(s) du sac ET fait apparaître une entité éphémère au sol,
  // core pur (core/bag.js/dropItem) — même patron que les effets ci-dessus.
  // `spec` résolu ICI (resolveDroppedItemSpec plus haut) : le menu
  // d'inventaire ignore tout du registre de types d'entités, comme le reste
  // de la vue face au core.
  function dropItemEffect(type, count) {
    const session = getSession();
    const spec = resolveDroppedItemSpec(type, count);
    setSession(dropItem(session, type, count, spec, session.player.x));
  }

  // Effet d'ÉTAT du "Équiper" (voir view/menus/inventory-menu.js/
  // setEquipItemHandler ; core/equipment.js/equipItem, entities/model.md/
  // "Équipement") : retire l'objet du sac, l'ÉCHANGE au slot correspondant
  // (l'ancien occupant, s'il y en a un, revient au sac) — core pur, même
  // patron que les effets ci-dessus.
  function equipItemEffect(type) {
    setSession(equipItem(getSession(), type));
  }

  // Effet d'ÉTAT du "Déséquiper" (voir view/menus/inventory-menu.js/
  // setUnequipItemHandler ; core/equipment.js/unequipItem) : retire l'objet
  // du slot, le remet au sac.
  function unequipItemEffect(slot) {
    setSession(unequipItem(getSession(), slot));
  }

  // Enregistrés une fois, pour la durée de vie de cet écran ville : mêmes
  // principe et portée que setDoorTransitionHandler (voir
  // view/interaction.js) — un module qui déclenche un effet possédé par
  // city-screen.js (scene/session) sans avoir besoin de les connaître.
  setDoorTransitionHandler(transitionThroughDoor);
  setPickupHandler(pickupEntityEffect);
  setItemPickupHandler(itemPickupEntityEffect);
  setLootHandler(lootEntityEffect);
  setLootSpawnHandler(lootSpawnEffect);
  setSideSwitchHandler(sideSwitchEffect);
  setDropItemHandler(dropItemEffect);
  setEquipItemHandler(equipItemEffect);
  setUnequipItemHandler(unequipItemEffect);
  setGameReplaceHandler(replaceCurrentGame);
  // Actions CONDITIONNELLES (voir view/interaction.js/actionConditionMet) :
  // fournit l'équipement du JOUEUR, relu à CHAQUE tentative (jamais mis en
  // cache) — équiper/déséquiper change donc le verdict IMMÉDIATEMENT, sans
  // code de synchro, même principe que gaitOf.
  setPlayerEquipmentProvider(() => getSession().equipment);

  return {
    onEnter() {
      // Un écran poussé PAR-DESSUS la ville (menu de désambiguïsation
      // d'interaction, voir view/interaction.js) fait rappeler onEnter à son
      // retrait (lib/screens.js, popScreen révèle l'écran dessous et le
      // "réannonce"). Pour un menu classique c'est voulu ; pour la ville,
      // non : pas de nouvelle scène audio ni de re-annonce du titre à chaque
      // fermeture de sous-menu. scene non nul = ce n'est pas la toute
      // première entrée, on ne fait rien.
      if (scene) return;

      ensureAudioUnlocked();
      scene = createCityAudioScene(getSession);
      document.getElementById("game").focus();
      announce(t(getActiveWorld(getSession()).titleKey), { assertive: true });
    },
    onTick() {
      // scene momentanément null pendant une transition par porte (voir
      // transitionThroughDoor) : rien à mettre à jour, on saute ce tick.
      if (!scene) return;
      setSession(reduce(getSession(), tick(getMoveIntent())));
      scene.update();
    },
    // Horloge de partie (voir core/time.js) : delta RÉEL de frame, PAS le
    // nombre de ticks (voir lib/loop.js) — converti ici en minutes de jeu
    // via TIME_SCALE (config/time-values.js), puis injecté tel quel dans le
    // core, qui ne lit jamais l'horloge lui-même. Même garde que onTick
    // (scene null pendant une transition) : PAUSE GRATUITE par construction
    // — un menu au sommet de la pile empêche cet appel d'avoir lieu du tout
    // (voir lib/screens.js/tickFrame), une transition de porte le no-op ici
    // — dans les deux cas, aucun delta injecté, le temps se fige.
    onFrame(deltaMs) {
      if (!scene) return;
      const minutes = (deltaMs / 1000) * (TIME_CONFIG.timeScale / TIME_CONFIG.minutesPerHour);
      setSession(advanceTime(getSession(), minutes));
    },
    // Discrète (screens.js ne route que la touche non répétée), pas de
    // souci d'auto-interruption ici. N'agit que quand la ville est au
    // sommet de la pile : le stack routing s'en charge par construction
    // (voir CLAUDE.md), aucune vérification à faire ici. Résout SA PROPRE
    // table (CITY_BINDINGS, view/input.js) via lib/input.js/resolveAction —
    // plus aucune comparaison directe à event.key ici (voir lib/input.js
    // pour l'arbitrage des modificateurs).
    onKeyDown(event) {
      // Même garde qu'onTick : aucune interaction possible pendant la brève
      // fenêtre où scene est null (transition par porte en cours).
      if (!scene) return;

      const action = resolveAction(CITY_BINDINGS, event.key, event.mods);

      if (action === "pauseMenu") {
        event.preventDefault();
        openPauseMenu(scene, getSession, travelViaCityMap);
        return;
      }

      // "announceTime" : outil de vérification de l'horloge (voir
      // announceGameTime plus haut, core/time.md) — aucune règle de jeu ne
      // consomme encore le temps, seule cette annonce le lit.
      if (action === "announceTime") {
        announceGameTime(getSession());
        return;
      }

      // "announceMoney" : consultation pure de l'argent courant — même
      // statut que announceTime, aucune action, juste une lecture d'état
      // annoncée.
      if (action === "announceMoney") {
        announceMoney(getSession());
        return;
      }

      // "openInventory" : ouvre le menu du sac (voir
      // view/menus/inventory-menu.js) — met le jeu en PAUSE comme tout
      // écran-menu (mécanisme de la pile, aucun code dédié ici, voir
      // lib/screens.js). Même patron que pauseMenu ci-dessus.
      if (action === "openInventory") {
        openInventoryMenu(scene, getSession);
        return;
      }

      // "openEquipment" ("q") : même écran que "openInventory" ("i"), juste
      // ouvert sur l'onglet Équipement — voir
      // view/menus/inventory-menu.js/openEquipmentMenu. Partage sa touche
      // avec le mouvement (view/input.js/MOVE_BINDINGS.moveLeft) sans
      // ambiguïté, voir le commentaire de CITY_BINDINGS.openEquipment.
      if (action === "openEquipment") {
        openEquipmentMenu(scene, getSession);
        return;
      }

      // "announcePosition" : consultation pure de la position du joueur —
      // même statut que announceTime/announceMoney désormais (DISPONIBLE EN
      // JEU NORMAL, pas seulement en debug) : announcePlayerX ci-dessus lit
      // isDebugEnabled() ELLE-MÊME pour choisir la PRÉCISION de {x} (entier
      // arrondi en mode normal, flottant en debug), donc aucune garde ici.
      if (action === "announcePosition") {
        announcePlayerX(getSession());
        return;
      }

      // "debugSpawn", MODE DEBUG UNIQUEMENT (voir config/debug.js) : fait
      // apparaître une pièce éphémère de test à la position du joueur —
      // éprouve le cycle de vie complet (ramassable, jamais sauvegardée,
      // purgée si non ramassée au départ de la scène). Liée à "e", PAS "d"
      // (déjà liée au déplacement à droite, voir view/input.js/
      // MOVE_BINDINGS) : les deux cohabitent SANS ambiguïté désormais (voir
      // lib/input.js) — "d" seul reste le mouvement, "d"+Ctrl reste
      // toggleDebug, "e" reste ce spawn de test. En mode normal (debug
      // désactivé), ne fait RIEN — comportement inchangé pour tout joueur
      // qui ne l'a jamais activé.
      if (action === "debugSpawn" && isDebugEnabled()) {
        setSession(spawnEphemeral(getSession(), EPHEMERAL_COIN_SPEC, getSession().player.x));
        return;
      }

      if (action !== "interactDescribe" && action !== "interactActivate") return;

      // Surtout pour interactDescribe (Espace) : sans ça, la page
      // défilerait.
      event.preventDefault();

      const kind = action === "interactDescribe" ? "describe" : "activate";
      // scene passé pour la pause/reprise sélective des balises pendant un
      // éventuel menu de désambiguïsation (2+ candidats) — voir
      // chooseInteractionTarget. getInteractionCandidates(kind) filtre déjà
      // par capacité (observable/interactable) — voir son commentaire.
      const target = chooseInteractionTarget(scene.getInteractionCandidates(kind), kind, scene);
      if (!target) return;

      interact(target, kind);
    },
    onExit() {
      scene.destroy();
      scene = null;
      setDoorTransitionHandler(null);
      setPickupHandler(null);
      setItemPickupHandler(null);
      setLootHandler(null);
      setLootSpawnHandler(null);
      setSideSwitchHandler(null);
      setDropItemHandler(null);
      setEquipItemHandler(null);
      setUnequipItemHandler(null);
      setGameReplaceHandler(null);
      setPlayerEquipmentProvider(null);
      // Invariant documenté (CLAUDE.md) : session est null hors partie.
      // Seul chemin de sortie de la ville aujourd'hui (menu pause -> retour
      // au menu principal, voir view/menus/pause-menu.js).
      setSession(null);
    },
  };
}
