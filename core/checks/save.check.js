// Vérifications du core — domaine « save ». Sauvegarde : sérialisabilité de
// l'état, enveloppe, renommages de contenu, types et objets inconnus, aller-
// retour d'une partie qui cumule tous les systèmes (panier plein). Lancées
// par core/checks/index.js/runChecks (voir ce fichier). Pur : aucun DOM,
// aucun fetch ; chaque scène est construite en dur via un objet littéral
// passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, travelToWorld, togglePerception, switchSide } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { SAVE_VERSION, serializeGame, deserializeGame } from "../save.js";
import { addItem } from "../bag.js";
import { INITIAL_TIME } from "../time.js";
import { setWeather } from "../weather.js";
import { addMoney } from "../money.js";
import { applyActionEffects, setVariable } from "../variables.js";
import { hasImprovement } from "../improvements.js";
import { DEFAULT_SURFACE, surfaceAt } from "../surfaces.js";
import { throws, auditNonSerializable, diffStructure } from "../../lib/check.js";
import { NO_COMPANIONS, WORLD_A_REGISTRY, TWO_FACED_RAW_SCENE, createAuditFixture } from "./helpers.js";

export default function checkSave(run) {
  // Fixtures partagées avec d'autres domaines (voir ./helpers.js).
  const twoFacedScene = parseScene(TWO_FACED_RAW_SCENE, WORLD_A_REGISTRY);
  const twoFaceWorldId = twoFacedScene.id;

  // --- Audit de sérialisabilité (avant tout système de sauvegarde) ---
  // Objectif : confirmer que l'état de partie survit à un aller-retour JSON
  // en restant structurellement identique ET fonctionnel — pas un système
  // de sauvegarde, juste la garantie que rien de non-sérialisable ne s'est
  // glissé dans l'état. C'est l'invariant "l'état est le save", tenu depuis
  // le début du projet (voir CLAUDE.md), qui doit rester vrai avant qu'un
  // vrai système de save s'appuie dessus.

  // Auto-test du détecteur lui-même, sur une fuite SYNTHÉTIQUE (fonction,
  // NaN, Infinity, cycle) : doit être repérée, sinon un "aucune fuite"
  // trouvé plus bas sur la vraie partie ne prouverait rien.
  const syntheticLeaky = { a: 1, b: () => {}, c: NaN, d: Infinity };
  syntheticLeaky.self = syntheticLeaky; // référence circulaire
  const syntheticFindings = [];
  auditNonSerializable(syntheticLeaky, "synthetic", new Set(), syntheticFindings);
  run("sérialisation : le détecteur repère une fonction synthétique", true, syntheticFindings.some((f) => f.includes("fonction")));
  run("sérialisation : le détecteur repère un nombre non fini synthétique", true, syntheticFindings.some((f) => f.includes("non fini")));
  run("sérialisation : le détecteur repère une référence circulaire synthétique", true, syntheticFindings.some((f) => f.includes("circulaire")));

  // Partie d'audit partagée (voir ./helpers.js/createAuditFixture).
  const { auditWorldA, auditWorldB, auditCompanion, auditSession } = createAuditFixture();
  const auditDogXParked = auditSession.worlds[auditWorldA.id].entities[0].x;

  // 1) Détection de fuite AVANT toute tentative de sérialisation réelle.
  const leakFindings = [];
  auditNonSerializable(auditSession, "session", new Set(), leakFindings);
  if (leakFindings.length > 0) {
    console.warn("Audit sérialisabilité : fuites détectées —", leakFindings);
  }
  run("sérialisation : aucune fuite de non-sérialisable dans la partie", 0, leakFindings.length);
  // Argent : présent et NOMBRE (jamais undefined) dans la partie AVANT tout
  // aller-retour — confirme session.money comme n'importe quel autre champ
  // du cercle partie (voir core/state.js).
  run("sérialisation : session.money est un nombre (jamais undefined)", true, typeof auditSession.money === "number");
  // Sac : présent et TABLEAU (jamais undefined), même précédent que money.
  run("sérialisation : session.bag est un tableau (jamais undefined)", true, Array.isArray(auditSession.bag));
  // Équipement : présent et OBJET (jamais undefined), même précédent — déjà
  // NON vide par défaut (baskets de départ, voir core/state.js), aucun
  // ajout explicite nécessaire ici contrairement à money.
  run(
    "sérialisation : session.equipment est un objet (jamais undefined)",
    true,
    typeof auditSession.equipment === "object" && auditSession.equipment !== null
  );

  // 2) Aller-retour JSON réel, capturé pour détecter un throw (ex. cycle)
  // au lieu de laisser l'exception interrompre toute la suite de checks.
  let auditRoundTripped = null;
  const auditRoundTripThrew = throws(() => auditRoundTripped = JSON.parse(JSON.stringify(auditSession)));
  run("sérialisation : JSON.stringify/parse ne lève pas", false, auditRoundTripThrew);
  if (!auditRoundTripThrew) {
    run("sérialisation : money survit à l'aller-retour JSON", auditSession.money, auditRoundTripped.money);
    run.same("sérialisation : bag survit à l'aller-retour JSON", auditSession.bag, auditRoundTripped.bag);
    run.same(
      "sérialisation : equipment survit à l'aller-retour JSON",
      auditSession.equipment,
      auditRoundTripped.equipment
    );
  }

  // 3) Divergence structurelle précise entre avant/après.
  const structureDiffs = [];
  if (auditRoundTripped) {
    diffStructure(auditSession, auditRoundTripped, "session", structureDiffs);
  }
  if (structureDiffs.length > 0) {
    console.warn("Audit sérialisabilité : divergences structurelles —", structureDiffs);
  }
  run("sérialisation : structure identique après aller-retour JSON", 0, structureDiffs.length);

  // 4) Fonctionnel : la partie reparse doit rester simulable sans erreur —
  // quelques ticks dans le monde actif (B), retour vers A (déjà connu, pas
  // de fetch). Le PNJ de A doit avoir survécu au voyage EXACTEMENT, vérifié
  // IMMÉDIATEMENT au retour, AVANT tout nouveau tick sur A (A était rangé
  // pendant tout l'aller-retour, sa position ne devait pas bouger d'un
  // iota) — puis, séparément, on retick A pour confirmer qu'il redevient
  // normalement simulable (sa position DOIT alors recommencer à évoluer,
  // ce n'est plus la même assertion).
  if (auditRoundTripped) {
    let revived = auditRoundTripped;
    let revivalThrew = false;
    let dogXOnReturn = null;
    try {
      for (let i = 0; i < 10; i++) revived = reduce(revived, tick(1));
      revived = travelToWorld(revived, auditWorldA.id);
      dogXOnReturn = getActiveWorld(revived).entities[0].x;
      for (let i = 0; i < 10; i++) revived = reduce(revived, tick(-1));
    } catch {
      revivalThrew = true;
    }
    run("sérialisation : la partie reparse reste jouable (aucune erreur)", false, revivalThrew);
    if (!revivalThrew) {
      run("sérialisation : le PNJ du monde reparse a survécu au voyage", auditDogXParked, dogXOnReturn);
      run("sérialisation : le monde reparse redevient normalement simulable", true, getActiveWorld(revived).entities[0].x !== dogXOnReturn);

      // Compagnon : mêmes garanties que le PNJ ci-dessus, PLUS
      // la garantie propre aux compagnons (jamais rangés avec un monde
      // quitté, voir core/state.js/getActiveWorld) — vérifiées ICI, sur la
      // partie RECONSTRUITE depuis JSON, pas sur l'originale (qui n'a
      // jamais transité par une désérialisation).
      run.same(
        "sérialisation : le compagnon garde son comportement et sa cible après rechargement",
        auditCompanion.behavior,
        revived.companions.find((c) => c.id === "audit-companion").behavior
      );
      run(
        "sérialisation : aucun résidu du compagnon dans le monde quitté (B) après rechargement",
        false,
        revived.worlds[auditWorldB.id].entities.some((e) => e.id === "audit-companion")
      );
      run(
        "sérialisation : le compagnon reparu est injecté une seule fois dans le monde actif",
        1,
        getActiveWorld(revived).entities.filter((e) => e.id === "audit-companion").length
      );

      // Suivi toujours actif : le joueur s'éloigne largement (vers la
      // droite, où le monde A laisse de la marge, playerStart=2/length=20) —
      // le compagnon reconstruit depuis JSON doit encore réagir (targetId
      // "player" toujours résolu, comportement follow intact).
      const companionXAfterReturn = revived.companions.find((c) => c.id === "audit-companion").x;
      for (let i = 0; i < 300; i++) revived = reduce(revived, tick(1));
      const companionXAfterChase = revived.companions.find((c) => c.id === "audit-companion").x;
      run(
        "sérialisation : le compagnon suit toujours après un aller-retour JSON",
        true,
        companionXAfterChase !== companionXAfterReturn
      );
    }
  }

  // --- core/save.js : enveloppe de sauvegarde (forme, pas le disque) ---

  const saveEnvelope = serializeGame(auditSession);
  run("save : serializeGame enveloppe avec la version courante", SAVE_VERSION, saveEnvelope.version);

  const saveResult = deserializeGame(saveEnvelope);
  run("save : deserializeGame réussit sur une enveloppe valide", true, saveResult.success);
  if (saveResult.success) {
    run.same("save : la partie désérialisée est identique à l'originale", auditSession, saveResult.session);
  }

  run("save : format non exploitable rejeté", false, deserializeGame({ notASave: true }).success);
  run("save : version inconnue rejetée", false, deserializeGame({ version: SAVE_VERSION + 1, data: auditSession }).success);
  run("save : structure implausible rejetée", false, deserializeGame({ version: SAVE_VERSION, data: { player: {} } }).success);

  // --- Renommages de contenu (config/save-renames.js) et types inconnus ---
  // Une partie ancienne porte des noms figés à la première visite : le
  // type, les clés i18n et les chemins de sons d'un vidéoprojecteur d'avant
  // le renommage doivent ressortir sous leurs nouveaux noms.
  const renameWorldId = auditSession.activeWorldId;
  const renameWorld = auditSession.worlds[renameWorldId];
  const legacyProjector = {
    id: "legacy-projector",
    type: "film_projector",
    x: 1,
    nameKey: "entity.film_projector.name",
    descriptionKey: "entity.film_projector.description",
    sounds: { beacon: { path: "assets/sounds/furniture/film_projector_1_beacon", loop: true } },
  };
  const ghostEntity = { id: "vanished", type: "type_that_no_longer_exists", x: 2, sounds: {} };
  const ghostCompanion = { id: "vanished-companion", type: "type_that_no_longer_exists", x: 0, sounds: {} };
  const renameSave = {
    version: SAVE_VERSION,
    data: {
      ...auditSession,
      worlds: { ...auditSession.worlds, [renameWorldId]: { ...renameWorld, entities: [...renameWorld.entities, legacyProjector, ghostEntity] } },
      companions: [...auditSession.companions, ghostCompanion],
    },
  };
  const renameResult = deserializeGame(renameSave);
  const migratedProjector = renameResult.success
    ? renameResult.session.worlds[renameWorldId].entities.find((e) => e.id === "legacy-projector")
    : undefined;
  run("save renommages : type renommé", "video_projector", migratedProjector && migratedProjector.type);
  run("save renommages : clé i18n renommée", "entity.video_projector.name", migratedProjector && migratedProjector.nameKey);
  run("save renommages : chemin de son renommé", "assets/sounds/furniture/video_projector_1_beacon", migratedProjector && migratedProjector.sounds.beacon.path);
  run.same(
    "save renommages : idempotent (une partie déjà migrée ne change plus)",
    renameResult.session,
    deserializeGame({ version: SAVE_VERSION, data: renameResult.session }).session
  );
  run.same("save renommages : partie à jour -> identique à l'originale", auditSession, deserializeGame(saveEnvelope).session);
  run("save types inconnus : sans registre, rien n'est retiré", true, renameResult.session.worlds[renameWorldId].entities.some((e) => e.id === "vanished"));
  const knownTypes = { video_projector: {} };
  for (const world of Object.values(auditSession.worlds)) {
    for (const face of world.recto ? [world.recto, world.verso] : [world]) for (const e of face.entities) knownTypes[e.type] = {};
  }
  for (const companion of auditSession.companions) knownTypes[companion.type] = {};
  const filteredResult = deserializeGame(renameSave, { registry: knownTypes });
  run("save types inconnus : entité retirée du monde", false, filteredResult.session.worlds[renameWorldId].entities.some((e) => e.id === "vanished"));
  run("save types inconnus : compagnon retiré", false, filteredResult.session.companions.some((e) => e.id === "vanished-companion"));
  run("save types inconnus : entité renommée conservée", true, filteredResult.session.worlds[renameWorldId].entities.some((e) => e.id === "legacy-projector"));
  run(
    "save types inconnus : retraits listés pour l'avertissement",
    `${renameWorldId}/vanished:type_that_no_longer_exists,null/vanished-companion:type_that_no_longer_exists`,
    filteredResult.droppedEntities.map((d) => `${d.worldId}/${d.entityId}:${d.type}`).join(",")
  );
  run("save types inconnus : partie saine -> rien de retiré", 0, deserializeGame(saveEnvelope, { registry: knownTypes }).droppedEntities.length);

  // Sauvegarde ANTÉRIEURE à defaultSurface/segments (voir
  // core/scene.js/parseScene) : ses mondes n'ont jamais eu ces clés, et une
  // relecture de sauvegarde ne repasse jamais par parseScene — sans
  // rebouchage (core/save.js/backfillWorld), surfaceAt(world, x) plante sur
  // world.segments.find(...) dès qu'un tel monde redevient actif (bug réel,
  // trouvé en jeu).
  const oldWorlds = {};
  for (const [id, world] of Object.entries(auditSession.worlds)) {
    const { defaultSurface, segments, ...oldWorld } = world;
    oldWorlds[id] = oldWorld;
  }
  const oldSave = { version: SAVE_VERSION, data: { ...auditSession, worlds: oldWorlds } };
  const oldSaveResult = deserializeGame(oldSave);
  run("save : sauvegarde antérieure aux surfaces acceptée (reboutchée)", true, oldSaveResult.success);
  if (oldSaveResult.success) {
    const revivedWorld = oldSaveResult.session.worlds[oldSaveResult.session.activeWorldId];
    run("save : monde rebouché — defaultSurface par défaut", DEFAULT_SURFACE, revivedWorld.defaultSurface);
    run("save : monde rebouché — segments par défaut (tableau vide)", 0, revivedWorld.segments.length);
    const surfaceAtThrew = throws(() => surfaceAt(revivedWorld, 0));
    run("save : surfaceAt ne plante jamais sur un monde rebouché", false, surfaceAtThrew);
  }

  // Sauvegarde ANTÉRIEURE à `indoor` (voir core/scene.js/parseFace, "nature
  // de scène") : ses mondes n'ont jamais eu cette clé — sans rebouchage
  // (core/save.js/backfillFace), le rendu d'ambiance météo lirait
  // `undefined` (ni indoor ni outdoor) au lieu d'un booléen.
  const oldIndoorWorlds = {};
  for (const [id, world] of Object.entries(auditSession.worlds)) {
    const { indoor, ...oldWorld } = world;
    oldIndoorWorlds[id] = oldWorld;
  }
  const oldIndoorSave = { version: SAVE_VERSION, data: { ...auditSession, worlds: oldIndoorWorlds } };
  const oldIndoorSaveResult = deserializeGame(oldIndoorSave);
  run("save : sauvegarde antérieure à indoor acceptée (rebouchée)", true, oldIndoorSaveResult.success);
  if (oldIndoorSaveResult.success) {
    const revivedIndoorWorld = oldIndoorSaveResult.session.worlds[oldIndoorSaveResult.session.activeWorldId];
    run("save : monde rebouché — indoor par défaut (false, extérieur)", false, revivedIndoorWorld.indoor);
  }

  // Sauvegarde encore plus ancienne, avec un champ de scène depuis RETIRÉ
  // du format (ex. un ancien jalon de contenu jamais devenu actif) : ni
  // rejeté ni traité spécialement — simplement transporté tel quel, comme
  // n'importe quel champ que plus aucun code ne lit.
  const worldsWithLegacyField = {};
  for (const [id, world] of Object.entries(auditSession.worlds)) {
    worldsWithLegacyField[id] = { ...world, legacyField: 3 };
  }
  const legacyFieldSave = { version: SAVE_VERSION, data: { ...auditSession, worlds: worldsWithLegacyField } };
  const legacyFieldResult = deserializeGame(legacyFieldSave);
  run("save : sauvegarde avec un champ de scène retiré du format — se charge sans erreur", true, legacyFieldResult.success);
  if (legacyFieldResult.success) {
    const revivedLegacyWorld = legacyFieldResult.session.worlds[legacyFieldResult.session.activeWorldId];
    run("save : champ retiré du format — transporté tel quel, jamais nettoyé", 3, revivedLegacyWorld.legacyField);
  }

  // Sauvegarde ANTÉRIEURE à l'horloge de partie (voir core/time.js) : jamais
  // eu de clé .time — sans rebouchage (core/save.js/migrateSave), toute
  // dérivation (minuteOfHour, etc.) recevrait undefined au lieu d'un nombre.
  const { time: _droppedTime, ...auditSessionWithoutTime } = auditSession;
  const oldTimeSave = { version: SAVE_VERSION, data: auditSessionWithoutTime };
  const oldTimeSaveResult = deserializeGame(oldTimeSave);
  run("save : sauvegarde antérieure à l'horloge acceptée (rebouchée)", true, oldTimeSaveResult.success);
  if (oldTimeSaveResult.success) {
    run("save : partie rebouchée — time par défaut (INITIAL_TIME)", INITIAL_TIME, oldTimeSaveResult.session.time);
  }

  // Sauvegarde ANTÉRIEURE à l'argent (voir core/money.js) : même précédent
  // exact que time/surfaces ci-dessus — jamais eu de clé .money.
  const { money: _droppedMoney, ...auditSessionWithoutMoney } = auditSession;
  const oldMoneySave = { version: SAVE_VERSION, data: auditSessionWithoutMoney };
  const oldMoneySaveResult = deserializeGame(oldMoneySave);
  run("save : sauvegarde antérieure à l'argent acceptée (rebouchée)", true, oldMoneySaveResult.success);
  if (oldMoneySaveResult.success) {
    run("save : partie rebouchée — money par défaut (0)", 0, oldMoneySaveResult.session.money);
  }

  // Sauvegarde ANTÉRIEURE au sac (voir core/bag.js) : même précédent exact
  // — jamais eu de clé .bag.
  const { bag: _droppedBag, ...auditSessionWithoutBag } = auditSession;
  const oldBagSave = { version: SAVE_VERSION, data: auditSessionWithoutBag };
  const oldBagSaveResult = deserializeGame(oldBagSave);
  run("save : sauvegarde antérieure au sac acceptée (rebouchée)", true, oldBagSaveResult.success);
  if (oldBagSaveResult.success) {
    run("save : partie rebouchée — bag par défaut (tableau vide)", 0, oldBagSaveResult.session.bag.length);
  }
  // Un bag manifestement CORROMPU (pas un tableau) suit le MÊME chemin que
  // "absent" — migrateSave le rebouche AVANT toute validation de forme,
  // exactement comme companions (voir migrateSave) : jamais rejeté, jamais
  // un crash, juste ramené à un sac vide sûr.
  const corruptedBagResult = deserializeGame({ version: SAVE_VERSION, data: { ...auditSession, bag: "not-an-array" } });
  run("save : bag corrompu (pas un tableau) accepté (rebouché, comme companions)", true, corruptedBagResult.success);
  if (corruptedBagResult.success) {
    run("save : bag corrompu rebouché — tableau vide", 0, corruptedBagResult.session.bag.length);
  }

  // Sauvegarde ANTÉRIEURE à l'équipement (voir core/equipment.js) : même
  // précédent exact que time/money/bag ci-dessus — jamais eu de clé
  // .equipment. REBOUCHÉ VIDE (jamais avec des baskets par défaut, voir le
  // commentaire de migrateSave) : une vieille partie ne doit pas se
  // retrouver rétroactivement chaussée.
  const { equipment: _droppedEquipment, ...auditSessionWithoutEquipment } = auditSession;
  const oldEquipmentSave = { version: SAVE_VERSION, data: auditSessionWithoutEquipment };
  const oldEquipmentSaveResult = deserializeGame(oldEquipmentSave);
  run("save : sauvegarde antérieure à l'équipement acceptée (rebouchée)", true, oldEquipmentSaveResult.success);
  if (oldEquipmentSaveResult.success) {
    run("save : partie rebouchée — équipement par défaut (slot feet vide)", null, oldEquipmentSaveResult.session.equipment.feet);
  }

  // Sauvegarde ANTÉRIEURE au modèle recto/verso (voir CLAUDE.md/
  // "RECTO/VERSO") : jamais eu de clé `player.side` — sans rebouchage
  // (core/save.js/migrateSave), une scène à deux faces qu'on visiterait
  // plus tard n'aurait aucune face "courante" définie.
  const { side: _droppedSide, ...auditPlayerWithoutSide } = auditSession.player;
  const oldSideSave = {
    version: SAVE_VERSION,
    data: { ...auditSession, player: auditPlayerWithoutSide },
  };
  const oldSideSaveResult = deserializeGame(oldSideSave);
  run("save : sauvegarde antérieure à recto/verso acceptée (player.side rebouché)", true, oldSideSaveResult.success);
  if (oldSideSaveResult.success) {
    run("save : partie rebouchée — player.side par défaut 'recto'", "recto", oldSideSaveResult.session.player.side);
  }

  // Sauvegarde d'une scène à DEUX FACES, ANTÉRIEURE à defaultSurface/
  // segments/nextEphemeralId/indoor — même précédent que le monde simple
  // ci-dessus (core/save.js/backfillFace), mais chaque face doit être
  // rebouchée INDÉPENDAMMENT (voir core/save.js/backfillWorld).
  const freshTwoFaceSession = createInitialState(twoFacedScene, 42, NO_COMPANIONS);
  const freshTwoFaceWorld = freshTwoFaceSession.worlds[twoFaceWorldId];
  const {
    defaultSurface: _droppedRectoSurface,
    segments: _droppedRectoSegments,
    nextEphemeralId: _droppedRectoNextId,
    indoor: _droppedRectoIndoor,
    ...oldRectoFace
  } = freshTwoFaceWorld.recto;
  const {
    defaultSurface: _droppedVersoSurface,
    segments: _droppedVersoSegments,
    nextEphemeralId: _droppedVersoNextId,
    indoor: _droppedVersoIndoor,
    ...oldVersoFace
  } = freshTwoFaceWorld.verso;
  const oldTwoFaceWorldSave = {
    version: SAVE_VERSION,
    data: {
      ...freshTwoFaceSession,
      worlds: { ...freshTwoFaceSession.worlds, [twoFaceWorldId]: { ...freshTwoFaceWorld, recto: oldRectoFace, verso: oldVersoFace } },
    },
  };
  const oldTwoFaceWorldResult = deserializeGame(oldTwoFaceWorldSave);
  run("save : scène à deux faces antérieure aux surfaces acceptée (chaque face rebouchée)", true, oldTwoFaceWorldResult.success);
  if (oldTwoFaceWorldResult.success) {
    const revivedTwoFaceWorld = oldTwoFaceWorldResult.session.worlds[twoFaceWorldId];
    run("save : deux faces rebouchées — defaultSurface par défaut (recto)", DEFAULT_SURFACE, revivedTwoFaceWorld.recto.defaultSurface);
    run("save : deux faces rebouchées — defaultSurface par défaut (verso)", DEFAULT_SURFACE, revivedTwoFaceWorld.verso.defaultSurface);
    run("save : deux faces rebouchées — segments par défaut (recto)", 0, revivedTwoFaceWorld.recto.segments.length);
    run("save : deux faces rebouchées — segments par défaut (verso)", 0, revivedTwoFaceWorld.verso.segments.length);
    run("save : deux faces rebouchées — indoor par défaut (recto)", false, revivedTwoFaceWorld.recto.indoor);
    run("save : deux faces rebouchées — indoor par défaut (verso)", false, revivedTwoFaceWorld.verso.indoor);
  }

  // Round-trip complet d'une session à deux faces via le vrai système de
  // save (pas juste JSON.stringify/parse) : les deux faces ET player.side
  // survivent, identiques.
  const twoFaceSaveEnvelope = serializeGame(freshTwoFaceSession);
  const twoFaceSaveResult = deserializeGame(twoFaceSaveEnvelope);
  run("save : session à deux faces se recharge sans erreur", true, twoFaceSaveResult.success);
  if (twoFaceSaveResult.success) {
    run.same(
      "save : session à deux faces identique après un aller-retour save/load complet",
      freshTwoFaceSession,
      twoFaceSaveResult.session
    );
  }

  // --- Sauvegarde : objet absent du registre retiré du sac / de
  // l'équipement, et listé pour l'avertissement. ---
  {
    const base = createInitialState(parseScene({ id: "items", titleKey: "scene.demo.name", length: 5, playerStart: 0, entities: [] }, {}), "items", NO_COMPANIONS);
    const corrupted = {
      ...base,
      bag: [...base.bag, { type: "removed_item", quantity: 2 }],
      equipment: { ...base.equipment, feet: { type: "removed_boots" } },
    };
    const reloaded = deserializeGame({ version: SAVE_VERSION, data: corrupted });
    run("save objets inconnus : retirés du sac", false, reloaded.session.bag.some((e) => e.type === "removed_item"));
    run("save objets inconnus : objets connus conservés", base.bag.length, reloaded.session.bag.length);
    run("save objets inconnus : slot d'équipement vidé", null, reloaded.session.equipment.feet);
    run("save objets inconnus : retraits listés", "bag:removed_item,feet:removed_boots", reloaded.droppedItems.map((d) => `${d.where}:${d.type}`).join(","));
    run("save objets inconnus : partie saine -> rien de retiré", 0, deserializeGame(serializeGame(base)).droppedItems.length);
  }

  // 12) PANIER PLEIN : chaque système a son propre round-trip
  // serializeGame/deserializeGame DÉDIÉ et rigoureux (variables, improvements,
  // weather, recto/verso — voir leurs domaines), mais aucun ne les exerce TOUS À
  // LA FOIS. Une vraie partie peut pourtant les cumuler : amélioration
  // possédée + météo non-défaut + joueur sur le VERSO + variables des 3
  // portées (entité/scène/partie) + compagnon + argent/sac/équipement, en
  // même temps. Round-trip RÉEL (serializeGame/deserializeGame, pas un
  // JSON.stringify brut) + audit générique de fuite (auditNonSerializable)
  // + diff structurel sur cette composition.
  {
    const PANIER_PLEIN_REGISTRY = { dog: { nameKey: "entity.dog.name" } };
    const panierPleinScene = parseScene(
      {
        id: "movement-check-panier-plein",
        titleKey: "scene.demo.name",
        length: 12,
        playerStart: 2,
        variables: [{ name: "sceneFlag", type: "flag", initial: false }],
        recto: { entities: [{ id: "recto-dog", type: "dog", x: 3, variables: [{ name: "metOnce", type: "flag", initial: false }] }] },
        verso: { entities: [{ id: "verso-dog", type: "dog", x: 7 }] },
      },
      PANIER_PLEIN_REGISTRY
    );

    const panierCompanion = {
      id: "panier-companion",
      type: "dog",
      x: 1,
      behavior: { kind: "follow", targetId: "player", minDistance: 1, maxDistance: 3 },
    };
    let panierSession = createInitialState(panierPleinScene, "panier-plein", {
      companions: [panierCompanion],
      partyVariables: [{ name: "partyFlag", type: "flag", initial: false }],
    });

    // Cumule TOUT à la fois — chaque étape réutilise une primitive DÉJÀ
    // testée isolément dans son domaine, jamais réinventée ici.
    panierSession = addMoney(panierSession, 25);
    panierSession = addItem(panierSession, "apple", 2);
    panierSession = setWeather(panierSession, "rain");
    panierSession = togglePerception(panierSession);
    panierSession = switchSide(panierSession, 4);
    panierSession = applyActionEffects([{ type: "giveImprovement", id: "supernatural_perception" }], { session: panierSession }).session;
    panierSession = applyActionEffects(
      [{ type: "setVariable", scope: "party", name: "partyFlag", value: true }],
      { session: panierSession }
    ).session;

    let panierWorld = setVariable({ world: panierSession.worlds[panierPleinScene.id] }, "scene", "sceneFlag", true);
    const rectoDog = setVariable({ entity: panierWorld.recto.entities[0] }, "entity", "metOnce", true);
    panierWorld = { ...panierWorld, recto: { ...panierWorld.recto, entities: [rectoDog] } };
    panierSession = { ...panierSession, worlds: { ...panierSession.worlds, [panierPleinScene.id]: panierWorld } };

    for (let i = 0; i < 5; i++) panierSession = reduce(panierSession, tick(1));

    const panierLeakFindings = [];
    auditNonSerializable(panierSession, "panierPleinSession", new Set(), panierLeakFindings);
    if (panierLeakFindings.length > 0) {
      console.warn("Panier plein : fuites détectées —", panierLeakFindings);
    }
    run("panier plein : aucune fuite de non-sérialisable (tous systèmes cumulés)", 0, panierLeakFindings.length);

    const panierEnvelope = serializeGame(panierSession);
    const panierReload = deserializeGame(panierEnvelope);
    run("panier plein : save/load réussit", true, panierReload.success);
    if (panierReload.success) {
      const revived = panierReload.session;
      run("panier plein : argent survit", 25, revived.money);
      run.same("panier plein : sac survit", panierSession.bag, revived.bag);
      run("panier plein : météo (état) survit", "rain", revived.weather.state);
      run("panier plein : perception surnaturelle survit", true, revived.perceptionActive);
      run("panier plein : côté du joueur (verso) survit", "verso", revived.player.side);
      run("panier plein : amélioration possédée survit", true, hasImprovement(revived.improvements, "supernatural_perception"));
      run("panier plein : variable de PARTIE survit", true, revived.variables.partyFlag.value);
      run("panier plein : variable de SCÈNE survit", true, revived.worlds[panierPleinScene.id].variables.sceneFlag.value);
      run(
        "panier plein : variable d'ENTITÉ (recto) survit",
        true,
        revived.worlds[panierPleinScene.id].recto.entities.find((e) => e.id === "recto-dog").variables.metOnce.value
      );
      run("panier plein : verso toujours présent après rechargement", "verso-dog", revived.worlds[panierPleinScene.id].verso.entities[0].id);
      run.same(
        "panier plein : compagnon reparu avec son comportement intact",
        panierCompanion.behavior,
        revived.companions.find((c) => c.id === "panier-companion").behavior
      );

      // Divergence structurelle précise (diffStructure, lib/check.js) sur
      // la composition ENTIÈRE — pas seulement les champs vérifiés un par un
      // ci-dessus. Toutes les variables posées ici sont PERSISTANTES (défaut
      // de parseVariables) : round-trip JSON direct == round-trip par
      // enveloppe, aucune divergence attendue.
      const panierRoundTripped = JSON.parse(JSON.stringify(panierSession));
      const panierDiffs = [];
      diffStructure(panierSession, panierRoundTripped, "panierPleinSession", panierDiffs);
      if (panierDiffs.length > 0) {
        console.warn("Panier plein : divergences structurelles —", panierDiffs);
      }
      run("panier plein : structure identique après round-trip JSON direct", 0, panierDiffs.length);

      // La partie reparse doit rester simulable (comme les blocs de
      // sérialisation des autres domaines) — quelques ticks sur les deux faces + le
      // compagnon.
      let revivedPlayable = revived;
      const revivalThrew = throws(() => {
        for (let i = 0; i < 5; i++) revivedPlayable = reduce(revivedPlayable, tick(1));
      });
      run("panier plein : la partie reparse reste jouable (aucune erreur)", false, revivalThrew);
    }
  }
}
