// Écran "ville" : possède l'onTick continu (déplacement) et la scène audio
// spatiale qui suit la position du joueur. Ne détient aucune donnée de
// partie en propre — vue sur la session (état du core), lue/écrite via les
// accesseurs fournis par main.js.

import { getMoveIntent, CITY_BINDINGS } from "./input.js";
import { resolveAction } from "../lib/input.js";
import { announce } from "../lib/announce.js";
import { t } from "../data/i18n/index.js";
import { ensureAudioUnlocked, playOneShot, rampEntityLayerGain } from "../lib/audio.js";
import { resolveAsset } from "../lib/assets.js";
import { pushScreen, popScreen } from "../lib/screens.js";
import { createCityAudioScene, stopPersistentAudioLayers } from "./audio/city-scene.js";
import {
  interact,
  chooseInteractionTarget,
  setTeleportHandler,
  setPickupHandler,
  setItemPickupHandler,
  setLootHandler,
  setLootSpawnHandler,
  setSideSwitchHandler,
  setPlayerEquipmentProvider,
  setTimeProvider,
  setSessionProvider,
  setPositionedSoundPlayer,
  setVariableEffectsHandler,
  setSearchHandler,
} from "./interaction.js";
import { openPauseMenu } from "./menus/pause-menu.js";
import { openWeatherDebugMenu } from "./menus/debug-weather-menu.js";
import { openTimeDebugMenu } from "./menus/debug-time-menu.js";
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
import {
  getActiveWorld,
  travelToWorld,
  switchSide,
  placePlayer,
  spawnEphemeral,
  isTwoSided,
  togglePerception,
  applyEntityActionEffects,
} from "../core/state.js";
import { advanceWeather, setWeather, triggerNextWeatherTransition } from "../core/weather.js";
import { evaluateCondition } from "../core/presence.js";
import { pickupEntity, lootEntity, lootEntitySpawn } from "../core/money.js";
import { pickupItemEntity, dropItem } from "../core/bag.js";
import { refillDueSpawns, searchContainer } from "../core/spawn.js";
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
import { TIME_CONFIG, DEFAULT_TIME_SCALE, setTimeScale, resetTimeScale } from "../config/time-values.js";
import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { resolveTuning } from "../config/tuning.js";

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
// fait (voir data/i18n/fr/status.json et en/status.json, forme "heure, jour
// mois, saison, année" — l'ordre jour/mois lui-même reste propre à chaque
// langue) : month/season
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

// Consultation pure du TITRE de la scène active (touche Retour arrière, voir
// onKeyDown plus bas) — même patron que announceGameTime ci-dessous, mais
// réutilisé aussi à l'ENTRÉE dans une scène et après une transition (voir
// plus bas) : MÊME annonce dans les trois cas, jamais une seconde version.
// Miroir du Retour arrière des écrans-menus (lib/menu.js, "titre. entrée
// courante") : ici, pas d'entrée sélectionnée à réannoncer, seulement le nom
// de la scène — l'équivalent le plus proche pour un écran qui n'est pas un
// menu.
function announceSceneName(session) {
  announce(t(getActiveWorld(session).titleKey), { assertive: true });
}

// Consultation pure de session.money (touche "g", voir onKeyDown plus bas) —
// même patron que announceGameTime : aucune action, juste une lecture d'état
// annoncée. Canal liveRegion par défaut (announce() sans option), comme le
// temps.
function announceMoney(session) {
  announce(t("money.announce", { amount: session.money }));
}

// Consultation pure de session.weather (touche "w", voir onKeyDown plus
// bas ; core/weather.js) — même patron que announceGameTime/announceMoney.
// Clé i18n DÉRIVÉE de l'état (`weather.state.${state}`), jamais une table
// de correspondance à part à tenir à jour — même technique que
// announcePlayerX/`side.${session.player.side}` plus bas.
function announceWeather(session) {
  announce(t("weather.announce", { state: t(`weather.state.${session.weather.state}`) }));
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
    labelKey: typeDef.nameKey,
    descriptionKey: typeDef.descriptionKey,
    // sounds : AUCUNE surcharge d'instance possible pour un éphémère (pas
    // de fusion ici, contrairement à core/level.js/parseEntity) — le
    // rendu audio (view/audio/city-scene.js/buildEntitySoundEntry) lit
    // `entity.sounds`, jamais le registre directement, donc CE champ doit
    // être porté explicitement, même sans surcharge.
    sounds: typeDef.sounds,
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
//     `entity.sounds` — `spec.type` doit donc rester une clé RÉELLE du
//     registre d'entités, jamais le type d'OBJET brut),
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
    sounds: generic.sounds,
    blocksMovement: Boolean(generic.blocksMovement),
    observable: Boolean(generic.observable),
    interactable: Boolean(generic.interactable),
    action: { kind: "pickup", item: type, count },
  };
}

// Marqueurs sonores DÉDIÉS de bascule de PERCEPTION SURNATURELLE — non
// positionnés (le joueur ne change pas de position), volume UI
// (interfaceVolume), même patron défensif (try/catch) que
// view/interaction.js/playSideSwitchSound. Deux pools DISTINCTS
// (contrairement au pool générique "toggle" utilisé pendant le
// développement) : l'activation et la désactivation doivent se
// reconnaître à l'oreille sans attendre l'annonce.
const PERCEPTION_ACTIVATION_SOUND_KEY = "assets/sounds/ui/supernatural_perception_activation";
const PERCEPTION_DEACTIVATION_SOUND_KEY = "assets/sounds/ui/supernatural_perception_disactivation";

function playPerceptionToggleSound(active) {
  const key = active ? PERCEPTION_ACTIVATION_SOUND_KEY : PERCEPTION_DEACTIVATION_SOUND_KEY;
  try {
    const factor = getPref("interfaceVolume", PREF_CONSTRAINTS.interfaceVolume.default) / 100;
    playOneShot(resolveAsset(key), { volume: factor });
  } catch (error) {
    console.warn(`city-screen: son de bascule de perception indisponible ("${key}") : ${error.message}`);
  }
}

// Durées du fondu de couche entités pendant le sas (voir
// config/tuning-values.js, seule définition, jamais dupliquée ici).
const DOOR_TRANSITION_FADE_OUT_MS = TUNING_DEFAULTS.doorTransitionFadeOutMs;
const DOOR_TRANSITION_FADE_IN_MS = TUNING_DEFAULTS.doorTransitionFadeInMs;

// Marqueur sonore de bascule recto<->verso — voir sideSwitchEffect plus
// bas. DÉCLARABLE, ABSENT par défaut (`resolveTuning("transitionSound",
// entity)`, cascade instance -> archétype -> défaut ABSENT, comme
// `transitionSteps`/`transitionSurface` — voir entities/types/passage.js,
// config/tuning-values.js) : PLUS de son générique imposé à chaque
// passage — un passage qui n'en déclare aucun (via `tuning.transitionSound`
// à l'instance, ou un défaut à l'archétype) transite en SILENCE côté son
// de passage, rampes + pas de trajet/arrivée mis à part (voir
// scene.playTransitionSteps/playArrivalStep, DEUX choses sonores
// indépendantes qui se composent, jamais mélangées). Non positionné,
// volume UI, try/catch pour le cas où le son EST déclaré mais introuvable.
function playSideSwitchSound(entity) {
  const path = resolveTuning("transitionSound", entity);
  if (!path) return; // rien de déclaré : silence, pas une erreur
  try {
    const factor = getPref("interfaceVolume", PREF_CONSTRAINTS.interfaceVolume.default) / 100;
    playOneShot(resolveAsset(path), { volume: factor });
  } catch (error) {
    console.warn(`city-screen: son de bascule indisponible ("${path}") : ${error.message}`);
  }
}

// Durée du croisement de filtres d'occlusion (voir
// config/tuning-values.js, seule définition, jamais dupliquée ici) — le
// nombre de pas de TRAJET en DÉRIVE automatiquement (voir
// scene.playTransitionSteps, view/audio/city-scene.js/
// TRANSITION_STEP_INTERVAL_MS) : ajuster CETTE seule valeur retarde/allonge
// les rampes ET recadence les pas ensemble, jamais un réglage séparé à
// tenir synchronisé.
const FACE_SWITCH_FADE_MS = TUNING_DEFAULTS.faceSwitchFadeMs;

export function makeCityScreen(getSession, setSession) {
  let scene = null;
  // COOLDOWN anti-spam de la touche perception (voir view/input.js/
  // CITY_BINDINGS.togglePerception, config/tuning-values.js/
  // perceptionCooldownMs — DÉRIVÉ de la durée du fondu audio + une marge,
  // voir son commentaire) : horloge MURALE (performance.now()), jamais
  // l'horloge de partie (session.time, qui peut avancer différemment/pas
  // du tout selon le contexte) — le fondu lui-même est mené en temps réel
  // par view/audio/city-scene.js, ce cooldown doit rester synchronisé avec
  // LUI, pas avec le jeu. Persiste pour la DURÉE DE VIE de cet écran
  // (au-delà d'une transition de scène, voir performTransition) : un
  // joueur ne doit pas pouvoir contourner le cooldown en traversant une
  // porte en plein fondu.
  let perceptionCooldownUntil = 0;

  // GATE : la perception surnaturelle est débloquée par l'improvement
  // "supernatural_perception" (voir core/improvements.js, core/scripting.md/
  // "Conditions"/`hasImprovement`) — réutilise TEL QUEL l'évaluateur du core
  // (core/presence.js/evaluateCondition), MÊME condition qu'une action/une
  // règle de présence en déclarerait, jamais une vérification maison. Sans
  // l'improvement -> touche p SILENCIEUSE (comme une touche non attribuée,
  // aucun son ni annonce) ; le COURT-CIRCUIT DEBUG (voir
  // evaluateHasImprovement) fait passer cette gate INCONDITIONNELLEMENT tant
  // que le mode debug est actif, sans jamais toucher session.improvements.
  const SUPERNATURAL_PERCEPTION_IMPROVEMENT = { type: "hasImprovement", id: "supernatural_perception" };

  // Bascule la perception (core, pur) PUIS le retour sensoriel (son +
  // annonce) — même patron que les autres effets d'état de ce fichier
  // (ex. sideSwitchEffect). INERTE pendant le cooldown : la touche ne fait
  // ALORS rigoureusement rien, ni bascule ni son ni annonce — jamais de
  // fondu qui se chevauche/se bat (voir view/audio/city-scene.js).
  function togglePerceptionEffect() {
    if (!evaluateCondition(SUPERNATURAL_PERCEPTION_IMPROVEMENT, { session: getSession() })) return;

    const now = performance.now();
    if (now < perceptionCooldownUntil) return;
    perceptionCooldownUntil = now + TUNING_DEFAULTS.perceptionCooldownMs;

    setSession(togglePerception(getSession()));
    const active = getSession().perceptionActive;
    playPerceptionToggleSound(active);
    announce(t(active ? "perception.activated" : "perception.deactivated"), { assertive: true });
  }

  // Effets DEBUG du menu de forçage météo (Shift+W, voir
  // view/menus/debug-weather-menu.js ; core/weather.js/setWeather,
  // triggerNextWeatherTransition) : core pur PUIS annonce, même patron que
  // togglePerceptionEffect ci-dessus — réutilise announceWeather (mêmes
  // mots que la touche "w"), le menu se referme séparément (voir son
  // onActivate).
  function forceWeatherEffect(targetState) {
    setSession(setWeather(getSession(), targetState));
    announceWeather(getSession());
  }

  function triggerWeatherTransitionEffect() {
    setSession(triggerNextWeatherTransition(getSession()));
    announceWeather(getSession());
  }

  // Effet DEBUG du menu du temps (Shift+T, voir
  // view/menus/debug-time-menu.js) : MÊME composition que onFrame plus bas
  // (advanceTime PUIS advanceWeather, jamais l'inverse) — un saut manuel
  // déclenche donc exactement la même réaction météo qu'un écoulement réel
  // du même nombre de minutes. `minutes` toujours positif (voir
  // debug-time-menu.js/minutesToNextOccurrence, le temps ne recule jamais) :
  // aucune garde supplémentaire nécessaire ici. Les réactions qui dépendent
  // d'un TICK (routine PNJ, crossfade jour/nuit) suivent au tick suivant,
  // automatique dès la fermeture du menu — rien à déclencher explicitement
  // ici, voir le header de debug-time-menu.js. Réutilise announceGameTime
  // (mêmes mots que la touche "t") : le nouvel instant s'entend
  // immédiatement après le saut.
  function advanceTimeDebugEffect(minutes) {
    setSession(advanceWeather(advanceTime(getSession(), minutes)));
    announceGameTime(getSession());
  }

  // Vitesse d'écoulement TEMPORAIRE (voir config/time-values.js/setTimeScale/
  // resetTimeScale, relues à CHAQUE frame par onFrame plus bas — un
  // changement ici prend donc effet immédiatement). `scale` null -> restaure
  // la valeur normale. Annonce DÉRIVÉE de l'état résultant (multiplicateur
  // par rapport à DEFAULT_TIME_SCALE), jamais du choix du menu lui-même —
  // même principe que announceWeather (CLAUDE.md, "dérive ses annonces du
  // diff entre deux états").
  function setTimeScaleDebugEffect(scale) {
    if (scale === null) {
      resetTimeScale();
    } else {
      setTimeScale(scale);
    }
    announce(t("time.debug.speedSet", { multiplier: TIME_CONFIG.timeScale / DEFAULT_TIME_SCALE }));
  }

  // Transition FRANCHE côté ÉTAT/ENTITÉS (pas de fondu, pas d'animation) :
  // scene.destroy() arrête et décharge ce que possédait le lieu courant —
  // balises, réverb (voir view/audio/city-scene.js) — donc aucun Howl
  // résiduel d'ENTITÉ, rien de plus à nettoyer ici. Musique/ambiance,
  // elles, NE SONT PLUS coupées par destroy() (voir "Couches persistantes
  // MUSIQUE/AMBIANCE", lib/audio.js) : la scène suivante (createCityAudioScene
  // ci-dessous) compare ce qu'elle veut à ce qui continue et ne fond que ce
  // qui change réellement — jamais de coupure/relance pour une musique ou
  // une ambiance identique entre les deux lieux. Le monde quitté est RANGÉ
  // (gelé) dans session.worlds, pas détruit : une re-visite le ressort tel
  // quel (voir core/state.js, travelToWorld). Le fetch reste ici, au
  // bord — SEULEMENT si la cible n'est pas déjà connue de la partie ; sinon
  // aucun réseau, la cible ressort directement de worlds. Nouvelle scène
  // audio sur le monde actif, annonce du titre.
  //
  // Implémente le RECHARGEMENT de l'effet "teleport" (voir core/effects.js,
  // core/scripting.md/"Effets d'action") — PARTAGÉE par executeTeleport
  // (porte ou tout autre effet, cible DIFFÉRENTE du monde actif OU
  // reloadIfSame:true) ET travelViaCityMap (carte de la ville, voir plus
  // bas ; view/menus/city-map-menu.js). x/side, absents -> comportement
  // HISTORIQUE inchangé (travelToWorld : playerStart de la cible, "recto") —
  // fournis, ils REMPLACENT ces défauts (le point de TÉLÉPORTATION d'une
  // case de carte, ou celui d'un effet "teleport", n'est pas forcément
  // playerStart).
  //
  // scene reste null le temps de l'attente réseau (éventuelle) : onTick et
  // onKeyDown s'en gardent (voir plus bas) plutôt que d'accéder une scène
  // absente — aucune touche n'a d'effet pendant cette brève fenêtre.
  async function performTransition(targetId, x, side) {
    scene.destroy();
    scene = null;

    const session = getSession();
    const alreadyVisited = Boolean(session.worlds[targetId]);
    const freshLevel = alreadyVisited ? null : await loadLevelById(targetId, registry);

    setSession(travelToWorld(session, targetId, freshLevel, { x, side }));
    refreshSpawns();
    scene = createCityAudioScene(getSession);
    announceSceneName(getSession());

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

  // Attend `ms` millisecondes réelles — utilisé UNIQUEMENT pour cadencer le
  // SAS de téléportation ci-dessous (voir runTeleportSas), jamais lié au
  // temps de jeu.
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // SAS de téléportation (mode "fade" de l'effet "teleport", voir
  // core/effects.js) : "fondu au noir SONORE" (à la Animal Crossing) qui
  // souligne le changement de lieu/position et masque un éventuel
  // chargement derrière un silence bref plutôt qu'une coupure sèche des
  // balises ou un blanc audible — comportement HISTORIQUE d'une traversée
  // de porte, désormais généralisé à TOUT teleport en mode "fade", qu'il
  // recharge (needsReload) ou déplace seulement le joueur DANS le lieu
  // courant (voir placePlayer, core/state.js). Musique/ambiance INCHANGÉES :
  // elles suivent leur PROPRE logique de continuité/crossfade (lib/audio.js),
  // entièrement indifférente au gain de couche entités fondu ici (voir son
  // commentaire, lib/audio.js) — cette séquence ne les touche JAMAIS.
  //
  // Jeu GELÉ pendant tout le sas : réutilise le MÊME mécanisme qu'un menu
  // (seul le sommet de la pile tique/reçoit le clavier, voir
  // lib/screens.js) — un écran-sas SANS onTick/onFrame/onKeyDown suffit,
  // aucun code de gel dédié. Popé à la toute fin, quel que soit le résultat
  // (voir finally) : un échec de chargement ne doit jamais laisser le jeu
  // gelé pour de bon.
  //
  // Séquence STRICTE : sas -> fondu SORTANT -> déplacement (rechargement
  // caché derrière le silence, ou simple repositionnement si needsReload
  // est faux) -> fondu ENTRANT (scène prête) -> fin du sas.
  async function runTeleportSas(target, x, side, needsReload) {
    pushScreen({});
    try {
      rampEntityLayerGain(0, DOOR_TRANSITION_FADE_OUT_MS);
      await wait(DOOR_TRANSITION_FADE_OUT_MS);

      if (needsReload) {
        await performTransition(target, x, side);
      } else {
        // Même monde, aucun rechargement : juste replacer le joueur (+
        // compagnons, voir placeInCurrentWorld) — la scène courante n'a
        // besoin d'AUCUNE reconstruction, elle relit déjà
        // session.player.x/side à CHAQUE tick (voir
        // view/audio/city-scene.js/update).
        placeInCurrentWorld(x, side);
      }

      rampEntityLayerGain(1, DOOR_TRANSITION_FADE_IN_MS);
      await wait(DOOR_TRANSITION_FADE_IN_MS);
    } finally {
      popScreen();
    }
  }

  // Exécute l'effet "teleport" (voir core/effects.js, core/scripting.md/
  // "Effets d'action") — SEUL chemin de téléportation JOUEUR, qu'il soit
  // déclenché par une porte (voir entities/types/door.js) ou par n'importe
  // quel autre effet (trigger temporel, effet de partie...). Câblé par
  // setTeleportHandler ci-dessous.
  //
  // reloadIfSame (défaut false) décide SEULEMENT si la cible est le monde
  // ACTIF : différent -> toujours un rechargement (travelToWorld, comme une
  // porte l'a toujours fait). transition ("fade", défaut, ou "instant")
  // choisit SÉPARÉMENT s'il y a un sas — orthogonal au rechargement, les
  // QUATRE combinaisons sont valides (ex. un déplacement instantané qui
  // recharge quand même, ou un sas pour un simple repositionnement). `side`
  // NON pré-résolue ici (contrairement à x) : son défaut dépend du CHEMIN —
  // "recto" pour un rechargement (travelToWorld impose déjà ce défaut,
  // comportement historique d'une porte) mais la face ACTUELLE du joueur
  // pour un simple repositionnement (voir placeInCurrentWorld ci-dessous) —
  // "recto" y serait FAUX (basculerait silencieusement un joueur au verso).
  function executeTeleport({ target, x, side, reloadIfSame = false, transition = "fade" }) {
    const sameWorld = target === getSession().activeWorldId;
    const needsReload = !sameWorld || reloadIfSame;

    if (transition === "fade") {
      runTeleportSas(target, x, side, needsReload);
      return;
    }
    // "instant" : aucun sas, aucun fondu — le déplacement d'autorité prend
    // effet immédiatement (voir core/scripting.md/"teleport", ex. un
    // vigile qui éjecte le joueur).
    if (needsReload) {
      performTransition(target, x, side);
      return;
    }
    placeInCurrentWorld(x, side);
  }

  // Repositionne le joueur DANS LE MONDE ACTUEL (voir core/state.js/
  // placePlayer) — x/side absents -> conservent la valeur COURANTE
  // (jamais "recto" en dur, voir executeTeleport ci-dessus).
  function placeInCurrentWorld(x, side) {
    const session = getSession();
    setSession(placePlayer(session, x !== undefined ? x : session.player.x, side !== undefined ? side : session.player.side));
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
  // view/menus/save-menu.js) : même mécanique que performTransition
  // (détruit la scène, remplace la session, reconstruit la scène sur le
  // nouveau monde actif) — pour ne jamais laisser un Howl résiduel de
  // l'ancien monde ni une scène désynchronisée de la session. Le son +
  // l'annonce "Partie importée" restent à la charge de l'appelant (voir
  // save-menu.js), symétrique à saveGame qui gère les siens lui-même.
  function replaceCurrentGame(newSession) {
    scene.destroy();
    scene = null;
    setSession(newSession);
    refreshSpawns();
    scene = createCityAudioScene(getSession);
  }

  // Garnissage de collecte dû sur le monde ACTIF (voir core/spawn.js/
  // refillDueSpawns, doc/entity-model.md/"Collecte") — appelé à CHAQUE
  // chargement d'un monde (première entrée, transition, partie remplacée),
  // TOUJOURS avant createCityAudioScene : les collectibles posés au sol sont
  // des entités ordinaires, la scène audio les découvre au montage comme le
  // reste. Le registre est injecté ici, le core ne l'importe jamais.
  function refreshSpawns() {
    setSession(refillDueSpawns(getSession(), registry));
  }

  // Effet d'ÉTAT de la FOUILLE (voir view/interaction.js/ACTION_HANDLERS.
  // search ; core/spawn.js/searchContainer) : tirage paresseux + objet au
  // sac + conteneur noté vidé, core pur. Renvoie la clé i18n de l'objet
  // obtenu (core/items.js/ITEM_REGISTRY, même clé que le sac) ou null —
  // interaction.js ne connaît jamais le registre d'objets.
  function searchEffect(entity) {
    const result = searchContainer(getSession(), entity.id);
    setSession(result.session);
    return result.item ? ITEM_REGISTRY[result.item].label : null;
  }

  // SAS de bascule recto<->verso (voir view/interaction.js/ACTION_HANDLERS.
  // switchSide ; entities/types/passage.js ; CLAUDE.md/"RECTO/VERSO") —
  // réutilise le MÊME mécanisme de gel que runTeleportSas (pushScreen
  // vide), mais un geste AUDIO différent : PAS un fondu vers le silence
  // (rien ne disparaît, rien ne se charge — les deux faces COEXISTENT déjà),
  // un CROISEMENT DE FILTRES D'OCCLUSION (voir scene.crossfadeFaceSwap,
  // view/audio/city-scene.js) — la face courante s'étouffe pendant que
  // l'autre s'éclaircit, en parallèle, toutes deux restant audibles.
  //
  // Séquence STRICTE : sas -> son de PASSAGE (DÉCLARÉ, voir
  // playSideSwitchSound ci-dessus — silencieux si le passage n'en déclare
  // aucun ; hors du gain de couche entités comme le son de porte) -> pas de
  // TRAJET (voir scene.playTransitionSteps, EN PARALLÈLE du croisement —
  // même durée, jamais attendu séparément, voir plus bas) + croisement des
  // DEUX filtres -> bascule core (switchSide, position + face) -> pas
  // d'ARRIVÉE (scene.playArrivalStep, sur la scène FRAÎCHE — voir
  // view/audio/city-scene.js pour pourquoi getActiveWorld y désigne déjà
  // la face de destination) -> scène reconstruite sur la NOUVELLE face
  // active (getActiveWorld la lit déjà via session.player.side) -> fin du
  // sas. La reconstruction reste un destroy()+recreate franc (comme avant
  // ce sas) : SANS effet audible sur les DEUX faces, puisque le croisement
  // qui la précède a déjà amené le son exactement là où la scène fraîche
  // le poserait (face active nette, face quittée étouffée/one-shot seul)
  // — PAS de travelToWorld, le monde actif ne change pas, pas de fetch
  // réseau, pas de nouveau titre à annoncer (même lieu).
  async function sideSwitchEffect(arrivalX, entity) {
    pushScreen({});
    try {
      playSideSwitchSound(entity);
      scene.playTransitionSteps(entity, FACE_SWITCH_FADE_MS);
      await scene.crossfadeFaceSwap(FACE_SWITCH_FADE_MS);

      scene.destroy();
      scene = null;
      setSession(switchSide(getSession(), arrivalX));
      scene = createCityAudioScene(getSession);
      scene.playArrivalStep(entity, arrivalX);
    } finally {
      popScreen();
    }
  }

  // Effet d'ÉTAT du ramassage (voir view/interaction.js/ACTION_HANDLERS.
  // pickup) : argent + retrait de l'entité, core pur (core/money.js) —
  // c'est TOUT ce que fait ce gestionnaire, le son/l'annonce restent côté
  // interaction.js, qui l'appelle. `amount` : DÉJÀ EXTRAIT par
  // view/interaction.js/handlePickup de l'action RÉSOLUE (jamais relu ici
  // sur entity.action, qui peut désormais être un TABLEAU de candidates,
  // voir core/scripting.md/"Actions multiples filtrées par condition").
  function pickupEntityEffect(entity, amount) {
    setSession(pickupEntity(getSession(), entity.id, amount));
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
  // pickupEntityEffect ci-dessus (`amount` déjà extrait, même raison), mais
  // l'entité N'EST JAMAIS retirée.
  function lootEntityEffect(entity, amount) {
    setSession(lootEntity(getSession(), entity.id, amount));
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

  // Effet d'ÉTAT des ACTIONS D'ÉCRITURE de variable (voir
  // view/interaction.js/ACTION_HANDLERS.applyEffects, core/level.js/
  // parseActionEffect, core/scripting.md/"Actions multiples filtrées par
  // condition") : setVariable/toggleVariable/addVariable, core pur
  // (core/state.js/applyEntityActionEffects, qui résout seul la portée —
  // entity/scene/party — de chaque effet et splice le résultat au bon
  // endroit) — même patron que les effets ci-dessus, aucun son/annonce ici
  // (le son de l'action, s'il y en a un, est joué par handleApplyEffects
  // lui-même, voir view/interaction.js).
  function variableEffectsEffect(entity, effects) {
    setSession(applyEntityActionEffects(getSession(), entity.id, effects));
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
  // principe et portée que setTeleportHandler (voir view/interaction.js) —
  // un module qui déclenche un effet possédé par city-screen.js
  // (scene/session) sans avoir besoin de les connaître.
  setTeleportHandler(executeTeleport);
  setPickupHandler(pickupEntityEffect);
  setItemPickupHandler(itemPickupEntityEffect);
  setLootHandler(lootEntityEffect);
  setLootSpawnHandler(lootSpawnEffect);
  setSideSwitchHandler(sideSwitchEffect);
  setVariableEffectsHandler(variableEffectsEffect);
  setSearchHandler(searchEffect);
  setDropItemHandler(dropItemEffect);
  setEquipItemHandler(equipItemEffect);
  setUnequipItemHandler(unequipItemEffect);
  setGameReplaceHandler(replaceCurrentGame);
  // Actions CONDITIONNELLES (voir view/interaction.js/actionConditionMet) :
  // fournit l'équipement du JOUEUR, relu à CHAQUE tentative (jamais mis en
  // cache) — équiper/déséquiper change donc le verdict IMMÉDIATEMENT, sans
  // code de synchro, même principe que gaitOf.
  setPlayerEquipmentProvider(() => getSession().equipment);
  // Même principe, pour "timeRange" côté action.condition (voir
  // view/interaction.js/actionContext) : relu à CHAQUE tentative, jamais mis
  // en cache, donc toujours l'heure de partie ACTUELLE.
  setTimeProvider(() => getSession().time);
  // Même principe encore, pour hasImprovement/weather/perceptionActive/
  // variable scope "scene"/"party" côté action.condition (voir
  // view/interaction.js/actionContext, audit de santé Finding 1) : la
  // session ENTIÈRE, relue à CHAQUE tentative — une amélioration tout juste
  // obtenue, une météo qui vient de changer, débloquent donc une action
  // IMMÉDIATEMENT, sans code de synchro, même principe que gaitOf.
  setSessionProvider(() => getSession());
  // Rendu DIÉGÉTIQUE de l'effet "playSound" (voir view/interaction.js/
  // runPlaySoundEffect, view/audio/city-scene.js/playEntityOneShot) — ferme
  // sur `scene` (variable MUTABLE de ce closure, réassignée à chaque
  // transition/bascule, voir performTransition/replaceCurrentGame/
  // sideSwitchEffect) : lit donc TOUJOURS la scène ACTUELLE, jamais une
  // référence figée au moment de l'enregistrement, sans avoir à
  // ré-enregistrer ce provider à chaque recréation de scène. `scene` peut
  // être `null` dans la brève fenêtre d'une transition (voir
  // performTransition) -> no-op silencieux, jamais une exception.
  setPositionedSoundPlayer((entityId, descriptor) => scene && scene.playEntityOneShot(entityId, descriptor));

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
      refreshSpawns();
      scene = createCityAudioScene(getSession);
      document.getElementById("game").focus();
      announceSceneName(getSession());
    },
    onTick() {
      // scene momentanément null pendant un rechargement de teleport (voir
      // performTransition) : rien à mettre à jour, on saute ce tick.
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
      // Météo (voir core/weather.js) : composée JUSTE APRÈS advanceTime,
      // jamais ailleurs — c'est CE branchement qui la fait avancer AVEC le
      // temps de jeu et geler QUAND il gèle (cette méthode entière n'est
      // pas appelée si un menu est au sommet de la pile, voir le
      // commentaire au-dessus), sans code de pause dédié.
      setSession(advanceWeather(advanceTime(getSession(), minutes)));
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

      // "announceSceneName" (Retour arrière) : miroir du Retour arrière des
      // écrans-menus (lib/menu.js), qui réannonce "titre. entrée courante" —
      // ici, aucune entrée à réannoncer, juste le nom de la scène (même
      // annonce qu'à l'entrée/après une transition, voir announceSceneName
      // plus haut). preventDefault comme lib/menu.js/onKeyDown (même touche) :
      // certains navigateurs anciens font naviguer "en arrière" sur Retour
      // arrière hors champ de saisie.
      if (action === "announceSceneName") {
        event.preventDefault();
        announceSceneName(getSession());
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

      // "announceWeather" : consultation pure de la météo courante — même
      // statut que announceTime/announceMoney (voir core/weather.js).
      if (action === "announceWeather") {
        announceWeather(getSession());
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

      // "togglePerception" ("p") : bascule la perception surnaturelle — voir
      // togglePerceptionEffect (cooldown, son, annonce) plus haut. Aucune
      // garde de mode ici (contrairement à "debugSpawn" ci-dessous) :
      // disponible à tout joueur, en jeu normal.
      if (action === "togglePerception") {
        togglePerceptionEffect();
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

      // "openWeatherDebugMenu" (Shift+W), MODE DEBUG UNIQUEMENT (voir
      // config/debug.js) : ouvre le menu de forçage météo — voir
      // forceWeatherEffect/triggerWeatherTransitionEffect plus haut. Hors
      // mode debug, ne fait RIEN, même garde que "debugSpawn" ci-dessus.
      if (action === "openWeatherDebugMenu" && isDebugEnabled()) {
        openWeatherDebugMenu(forceWeatherEffect, triggerWeatherTransitionEffect);
        return;
      }

      // "openTimeDebugMenu" (Shift+T), MODE DEBUG UNIQUEMENT (voir
      // config/debug.js) : ouvre le menu de forçage du temps — voir
      // advanceTimeDebugEffect/setTimeScaleDebugEffect plus haut. Hors mode
      // debug, ne fait RIEN, même garde que "openWeatherDebugMenu" ci-dessus.
      if (action === "openTimeDebugMenu" && isDebugEnabled()) {
        openTimeDebugMenu(getSession, advanceTimeDebugEffect, setTimeScaleDebugEffect);
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
      // Sortie RÉELLE de partie (retour au menu principal) : AUCUNE scène
      // suivante ne reprendra une éventuelle couche musique/ambiance encore
      // en cours (voir view/audio/city-scene.js/destroy, qui ne les touche
      // plus) — SEUL endroit qui les arrête explicitement pour de bon.
      stopPersistentAudioLayers();
      scene = null;
      setTeleportHandler(null);
      setPickupHandler(null);
      setItemPickupHandler(null);
      setLootHandler(null);
      setLootSpawnHandler(null);
      setSideSwitchHandler(null);
      setVariableEffectsHandler(null);
      setSearchHandler(null);
      setDropItemHandler(null);
      setEquipItemHandler(null);
      setUnequipItemHandler(null);
      setGameReplaceHandler(null);
      setPlayerEquipmentProvider(null);
      setTimeProvider(null);
      setSessionProvider(null);
      setPositionedSoundPlayer(null);
      // Invariant documenté (CLAUDE.md) : session est null hors partie.
      // Seul chemin de sortie de la ville aujourd'hui (menu pause -> retour
      // au menu principal, voir view/menus/pause-menu.js).
      setSession(null);
    },
  };
}
