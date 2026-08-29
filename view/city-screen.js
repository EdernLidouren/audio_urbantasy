// Écran "ville" : possède l'onTick continu (déplacement) et la scène audio
// spatiale qui suit la position du joueur. Ne détient aucune donnée de
// partie en propre — vue sur la session (état du core), lue/écrite via les
// accesseurs fournis par main.js.

import { getMoveIntent } from "./input.js";
import { announce } from "../lib/announce.js";
import { t } from "../i18n/index.js";
import { ensureAudioUnlocked } from "../lib/audio.js";
import { createCityAudioScene } from "./audio/city-scene.js";
import {
  interact,
  chooseInteractionTarget,
  setDoorTransitionHandler,
  setPickupHandler,
  setLootHandler,
  setLootSpawnHandler,
} from "./interaction.js";
import { openPauseMenu } from "./menus/pause-menu.js";
import { setGameReplaceHandler } from "./menus/save-menu.js";
import { tick } from "../core/actions.js";
import { reduce } from "../core/reduce.js";
import { loadLevelById } from "../level/load.js";
import { getActiveWorld, travelToWorld, spawnEphemeral } from "../core/state.js";
import { pickupEntity, lootEntity, lootEntitySpawn } from "../core/money.js";
import { isDebugEnabled } from "../config/debug.js";
import { advanceTime, minuteOfHour, hourOfDay, dayOfMonth, monthOfYear, seasonOfYear, yearNumber, SEASON_KEYS } from "../core/time.js";
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

function announceGameTime(session) {
  const { time } = session;
  announce(
    t("time.announce", {
      hour: pad2(hourOfDay(time)),
      minute: pad2(minuteOfHour(time)),
      day: dayOfMonth(time),
      month: monthOfYear(time),
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

// Résout un descripteur ÉPHÉMÈRE MINIMAL (type + surcharges, ex. { type:
// "money", amount: 20 } — même forme qu'une instance de niveau) en spec
// COMPLET pour spawnEphemeral/spawnScatteredEphemerals (core/state.js) :
// EXACTEMENT la forme qu'une instance { type } SANS surcharge obtiendrait
// en sortie de core/level.js/parseEntity, résolue ICI à la main — la vue
// connaît déjà le registre, contrairement au core (spawnEphemeral ne fait
// que porter ce descripteur, jamais l'interpréter). `overrides.amount`,
// s'il est fourni, REMPLACE ENTIÈREMENT `action` du type (jamais de fusion
// profonde — même principe que core/level.js pour `action`/`behavior`
// d'instance) : une pièce éparpillée à 20 plutôt que les 5 par défaut de
// "money", sans toucher au reste de l'action (kind, etc.). DEUX appelants
// aujourd'hui : la touche debug "e" (voir onKeyDown plus bas) et l'effet
// "loot à spawn" (voir lootSpawnEffect ci-dessous) — assez pour justifier
// cette petite factorisation, pas plus.
function resolveEphemeralSpec(type, overrides = {}) {
  const typeDef = registry[type];
  return {
    type,
    labelKey: typeDef.label,
    descriptionKey: typeDef.descriptionKey,
    blocksMovement: Boolean(typeDef.blocksMovement),
    observable: Boolean(typeDef.observable),
    interactable: Boolean(typeDef.interactable),
    action: overrides.amount !== undefined ? { ...typeDef.action, amount: overrides.amount } : typeDef.action,
  };
}

// Descripteur ÉPHÉMÈRE de test (touche "e" en mode debug, voir onKeyDown
// plus bas ; core/state.js/spawnEphemeral) — une PIÈCE ramassable,
// réutilise TEL QUEL l'archétype "money" existant (entities/types/money.js).
const EPHEMERAL_COIN_SPEC = resolveEphemeralSpec("money");

export function makeCityScreen(getSession, setSession) {
  let scene = null;

  // Transition FRANCHE par porte (pas de fondu, pas d'animation) :
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
  // scene reste null le temps de l'attente réseau (éventuelle) : onTick et
  // onKeyDown s'en gardent (voir plus bas) plutôt que d'accéder une scène
  // absente — aucune touche n'a d'effet pendant cette brève fenêtre.
  async function transitionThroughDoor(targetId) {
    scene.destroy();
    scene = null;

    const session = getSession();
    const alreadyVisited = Boolean(session.worlds[targetId]);
    const freshLevel = alreadyVisited ? null : await loadLevelById(targetId, registry);

    setSession(travelToWorld(session, targetId, freshLevel));
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

  // Effet d'ÉTAT du ramassage (voir view/interaction.js/ACTION_HANDLERS.
  // pickup) : argent + retrait de l'entité, core pur (core/money.js) —
  // c'est TOUT ce que fait ce gestionnaire, le son/l'annonce restent côté
  // interaction.js, qui l'appelle.
  function pickupEntityEffect(entity) {
    setSession(pickupEntity(getSession(), entity.id, entity.action.amount));
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

  // Enregistrés une fois, pour la durée de vie de cet écran ville : mêmes
  // principe et portée que setDoorTransitionHandler (voir
  // view/interaction.js) — un module qui déclenche un effet possédé par
  // city-screen.js (scene/session) sans avoir besoin de les connaître.
  setDoorTransitionHandler(transitionThroughDoor);
  setPickupHandler(pickupEntityEffect);
  setLootHandler(lootEntityEffect);
  setLootSpawnHandler(lootSpawnEffect);
  setGameReplaceHandler(replaceCurrentGame);

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
    // Espace/Entrée : touches discrètes (screens.js ne route que la touche
    // non répétée), pas de souci d'auto-interruption ici. N'agit que quand
    // la ville est au sommet de la pile : le stack routing s'en charge par
    // construction (voir CLAUDE.md), aucune vérification à faire ici.
    onKeyDown(event) {
      // Même garde qu'onTick : aucune interaction possible pendant la brève
      // fenêtre où scene est null (transition par porte en cours).
      if (!scene) return;

      if (event.key === "Escape") {
        event.preventDefault();
        openPauseMenu(scene, getSession);
        return;
      }

      // "t" discrète : outil de vérification de l'horloge (voir
      // announceGameTime plus haut, core/time.md) — aucune règle de jeu ne
      // consomme encore le temps, seule cette annonce le lit.
      if (event.key === "t" || event.key === "T") {
        announceGameTime(getSession());
        return;
      }

      // "g" (gold) discrète : consultation pure de l'argent courant — même
      // statut que "t", aucune action, juste une lecture d'état annoncée.
      if (event.key === "g" || event.key === "G") {
        announceMoney(getSession());
        return;
      }

      // "e" (éphémère), MODE DEBUG UNIQUEMENT (voir config/debug.js) : fait
      // apparaître une pièce éphémère de test à la position du joueur —
      // éprouve le cycle de vie complet (ramassable, jamais sauvegardée,
      // purgée si non ramassée au départ de la scène). PAS "d" (touche
      // suggérée à l'origine) : déjà liée au déplacement à droite (voir
      // view/input.js, RIGHT_KEYS ZQSD) — la réutiliser aurait fait
      // apparaître une pièce à CHAQUE premier appui d'un pas vers la
      // droite en mode debug, jamais l'intention. En mode normal (debug
      // désactivé), "e" ne fait RIEN — comportement inchangé pour tout
      // joueur qui ne l'a jamais activé.
      if ((event.key === "e" || event.key === "E") && isDebugEnabled()) {
        setSession(spawnEphemeral(getSession(), EPHEMERAL_COIN_SPEC, getSession().player.x));
        return;
      }

      if (event.key !== " " && event.key !== "Enter") return;

      // Surtout pour Espace : sans ça, la page défilerait.
      event.preventDefault();

      const kind = event.key === " " ? "describe" : "activate";
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
      setLootHandler(null);
      setLootSpawnHandler(null);
      setGameReplaceHandler(null);
      // Invariant documenté (CLAUDE.md) : session est null hors partie.
      // Seul chemin de sortie de la ville aujourd'hui (menu pause -> retour
      // au menu principal, voir view/menus/pause-menu.js).
      setSession(null);
    },
  };
}
