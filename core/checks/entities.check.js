// Vérifications du core — domaine « entities ». Modèle d'entité : capacités
// d'interaction, isFlying, cascade des sons, beacon conditionnel. Lancées par
// core/checks/index.js/runChecks (voir ce fichier). Pur : aucun DOM, aucun
// fetch ; chaque scène est construite en dur via un objet littéral passé à
// parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, applyEntityActionEffects } from "../state.js";
import { evaluateCondition } from "../presence.js";
import { validateEntityRegistry } from "../entity-parse.js";
import { throws } from "../../lib/check.js";
import { UNKNOWN_FIELD, expectSceneParseThrows, sceneParseMessage } from "./helpers.js";

export default function checkEntities(run) {
  // --- Interaction niveau 0 : capacités observable/interactable ---
  // Cascade IDENTIQUE à blocksMovement (instance -> type -> défaut false),
  // voir core/entity-parse.js/parseEntity. Le filtrage par verbe et la
  // désambiguïsation restent côté vue (view/occupancy.js,
  // view/interaction.js), hors de portée
  // d'un check terminal — seule la RÉSOLUTION de ces deux champs est
  // vérifiable ici.

  const INTERACTION_REGISTRY = {
    describable: { nameKey: "entity.dog.name", observable: true, interactable: false },
    actionable: { nameKey: "entity.dog.name", observable: false, interactable: true },
    plain: { nameKey: "entity.dog.name" }, // ni l'un ni l'autre déclaré -> défaut false/false
  };

  const interactionScene = parseScene(
    {
      id: "movement-check-interaction",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "e-describable", type: "describable", x: 5 },
        { id: "e-actionable", type: "actionable", x: 6 },
        { id: "e-plain", type: "plain", x: 7 },
        { id: "e-both", type: "describable", x: 8, interactable: true }, // surcharge d'instance
        { id: "e-neither", type: "actionable", x: 9, interactable: false }, // idem, désactive le défaut du type
      ],
    },
    INTERACTION_REGISTRY
  );
  function interactionEntity(id) {
    return interactionScene.entities.find((e) => e.id === id);
  }

  run("interaction : défaut du type — observable hérité", true, interactionEntity("e-describable").observable);
  run("interaction : défaut du type — interactable hérité (false)", false, interactionEntity("e-describable").interactable);
  run("interaction : défaut du type — interactable hérité (true)", true, interactionEntity("e-actionable").interactable);
  run("interaction : aucun des deux déclaré -> observable false par défaut", false, interactionEntity("e-plain").observable);
  run("interaction : aucun des deux déclaré -> interactable false par défaut", false, interactionEntity("e-plain").interactable);

  // Les QUATRE combinaisons sont valides — surcharge d'instance testée dans
  // les deux sens (active un défaut à false, désactive un défaut à true).
  run("interaction : les deux capacités (surcharge d'instance)", true, interactionEntity("e-both").observable && interactionEntity("e-both").interactable);
  run(
    "interaction : ni l'une ni l'autre (surcharge d'instance désactive le défaut du type)",
    true,
    !interactionEntity("e-neither").observable && !interactionEntity("e-neither").interactable
  );

  // Validation au chargement : type invalide -> échec clair, même politique
  // que blocksMovement.
  function expectInteractionRejected(field, value) {
    return throws(() => {
      parseScene(
        { id: "movement-check-interaction-invalid", titleKey: "scene.demo.name", length: 10, playerStart: 0, entities: [{ id: "bad", type: "plain", x: 5, [field]: value }] },
        INTERACTION_REGISTRY
      );
    });
  }
  run("interaction : observable non booléen rejeté", true, expectInteractionRejected("observable", "oui"));
  run("interaction : interactable non booléen rejeté", true, expectInteractionRejected("interactable", "oui"));

  // --- isFlying : marqueur PUR (voir doc/entity-model.md), même cascade
  // EXACTE que observable/interactable ci-dessus (instance -> type -> défaut
  // false) — le core ne connaît rien du SENS de ce champ (chaîne de filtres
  // audio, entièrement côté vue, hors de portée d'un check terminal), il ne
  // fait que le résoudre et le transporter, comme les deux autres.

  const FLYING_REGISTRY = {
    winged: { nameKey: "entity.bird.name", isFlying: true },
    grounded: { nameKey: "entity.dog.name" }, // non déclaré -> défaut false
  };
  const flyingScene = parseScene(
    {
      id: "movement-check-flying",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "e-winged", type: "winged", x: 5 },
        { id: "e-grounded", type: "grounded", x: 6 },
        { id: "e-override-true", type: "grounded", x: 7, isFlying: true }, // surcharge d'instance
        { id: "e-override-false", type: "winged", x: 8, isFlying: false }, // idem, désactive le défaut du type
      ],
    },
    FLYING_REGISTRY
  );
  function flyingEntity(id) {
    return flyingScene.entities.find((e) => e.id === id);
  }
  run("isFlying : défaut du type — hérité (true)", true, flyingEntity("e-winged").isFlying);
  run("isFlying : non déclaré -> false par défaut", false, flyingEntity("e-grounded").isFlying);
  run("isFlying : surcharge d'instance (true sur un type qui ne le déclare pas)", true, flyingEntity("e-override-true").isFlying);
  run("isFlying : surcharge d'instance (désactive le défaut du type)", false, flyingEntity("e-override-false").isFlying);

  const invalidFlyingRejected = throws(() => {
    parseScene(
      { id: "movement-check-flying-invalid", titleKey: "scene.demo.name", length: 10, playerStart: 0, entities: [{ id: "bad", type: "grounded", x: 5, isFlying: "oui" }] },
      FLYING_REGISTRY
    );
  });
  run("isFlying : non booléen rejeté", true, invalidFlyingRejected);

  // --- sounds : cascade instance -> archétype PAR FUSION PROFONDE (voir
  // doc/entity-model.md/"Cascade de sounds") — SEUL champ cascadé ainsi,
  // TROIS états : absent -> hérite, objet -> fusionne (récursif), null ->
  // retire ce palier. entity.sounds toujours un objet en sortie.
  const SOUNDS_REGISTRY = {
    withSounds: {
      nameKey: "entity.dog.name",
      sounds: {
        beacon: { path: "assets/sounds/a", gain: 0.5, reverbSend: 0.5 },
        vocal: { path: "assets/sounds/b", pitchVariation: 0.1 },
      },
    },
    noSounds: { nameKey: "entity.dog.name" }, // archétype sans sounds du tout
  };
  const soundsScene = parseScene(
    {
      id: "movement-check-sounds",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "e-inherit", type: "withSounds", x: 1 }, // absent -> hérite tout
        { id: "e-merge-field", type: "withSounds", x: 2, sounds: { beacon: { gain: 0.8 } } }, // objet -> fusionne
        { id: "e-remove-role", type: "withSounds", x: 3, sounds: { beacon: null } }, // null -> retire
        { id: "e-replace-path", type: "withSounds", x: 4, sounds: { beacon: { path: "assets/sounds/c" } } },
        { id: "e-add-role", type: "noSounds", x: 5, sounds: { vocal: { path: "assets/sounds/d" } } }, // archétype vide -> objet neuf
        { id: "e-remove-all", type: "withSounds", x: 6, sounds: null }, // null au sommet -> retire tout
        { id: "e-no-archetype-no-instance", type: "noSounds", x: 7 }, // ni l'un ni l'autre -> {}
      ],
    },
    SOUNDS_REGISTRY
  );
  function soundsEntity(id) {
    return soundsScene.entities.find((e) => e.id === id);
  }
  run("sounds : instance sans déclaration -> hérite tout de l'archétype", true, JSON.stringify(soundsEntity("e-inherit").sounds) === JSON.stringify(SOUNDS_REGISTRY.withSounds.sounds));
  run("sounds : fusion — champ surchargé", 0.8, soundsEntity("e-merge-field").sounds.beacon.gain);
  run("sounds : fusion — reste du rôle hérité (path)", "assets/sounds/a", soundsEntity("e-merge-field").sounds.beacon.path);
  run("sounds : fusion — reste du rôle hérité (reverbSend)", 0.5, soundsEntity("e-merge-field").sounds.beacon.reverbSend);
  run("sounds : fusion — autre rôle (vocal) inchangé", "assets/sounds/b", soundsEntity("e-merge-field").sounds.vocal.path);
  run("sounds : null retire le rôle ciblé", undefined, soundsEntity("e-remove-role").sounds.beacon);
  run("sounds : null sur un rôle n'affecte pas les autres rôles", "assets/sounds/b", soundsEntity("e-remove-role").sounds.vocal.path);
  run("sounds : valeur terminale (path) remplacée, jamais fusionnée", "assets/sounds/c", soundsEntity("e-replace-path").sounds.beacon.path);
  run("sounds : archétype sans ce rôle -> objet d'instance pris tel quel", "assets/sounds/d", soundsEntity("e-add-role").sounds.vocal.path);
  run("sounds : null au sommet retire tout (objet vide)", 0, Object.keys(soundsEntity("e-remove-all").sounds).length);
  run("sounds : ni archétype ni instance -> objet vide, jamais undefined", true, typeof soundsEntity("e-no-archetype-no-instance").sounds === "object" && soundsEntity("e-no-archetype-no-instance").sounds !== null);
  run.same("sounds : résolu toujours sérialisable (round-trip JSON identique)", soundsEntity("e-merge-field").sounds, JSON.parse(JSON.stringify(soundsEntity("e-merge-field").sounds)));

  const invalidSoundsRejected = throws(() => {
    parseScene(
      { id: "movement-check-sounds-invalid", titleKey: "scene.demo.name", length: 10, playerStart: 0, entities: [{ id: "bad", type: "withSounds", x: 5, sounds: "oui" }] },
      SOUNDS_REGISTRY
    );
  });
  run("sounds : type invalide (ni objet ni null) rejeté", true, invalidSoundsRejected);

  // action : cascade instance -> type (comme behavior/presence), kind
  // validé contre le registre du core (core/action-kinds.js) : un kind
  // inconnu échoue au chargement, jamais à l'interaction. Les champs propres
  // à chaque kind : core/checks/actions.check.js.
  const ACTION_REGISTRY = {
    withDefault: { nameKey: "entity.dog.name", interactable: true, action: { kind: "pickup", amount: 5 } },
    plain: { nameKey: "entity.dog.name" },
  };
  const actionScene = parseScene(
    {
      id: "movement-check-action",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      entities: [
        { id: "e-default", type: "withDefault", x: 5 },
        { id: "e-override", type: "withDefault", x: 6, action: { kind: "pickup", amount: 99 } },
        { id: "e-no-action", type: "plain", x: 7 },
      ],
    },
    ACTION_REGISTRY
  );
  function actionEntity(id) {
    return actionScene.entities.find((e) => e.id === id);
  }
  run.same("action : défaut du type hérité", { kind: "pickup", amount: 5 }, actionEntity("e-default").action);
  run.same(
    "action : surcharge d'instance REMPLACE (pas de fusion), amount du type ignoré",
    { kind: "pickup", amount: 99 },
    actionEntity("e-override").action
  );
  run("action : absente si ni l'instance ni le type n'en fournissent", undefined, actionEntity("e-no-action").action);
  run("action : kind inconnu du registre rejeté au chargement", true, expectInteractionRejected("action", { kind: "fly-away" }));

  run("action : non-objet rejeté au chargement", true, expectInteractionRejected("action", "pickup"));
  run("action : kind manquant rejeté au chargement", true, expectInteractionRejected("action", {}));
  run("action : kind vide rejeté au chargement", true, expectInteractionRejected("action", { kind: "" }));

  // --- Beacon conditionnel (sounds.beacon.condition, core/entity-parse.js) :
  // validé au chargement comme une condition d'action, une condition
  // d'instance REMPLACE celle de l'archétype, et la condition se lit contre
  // les variables COURANTES de l'entité (évaluation côté vue). ---
  const IS_ON = { type: "variable", scope: "entity", name: "isOn", equals: true };
  const BEACON_COND_REGISTRY = {
    projector: { nameKey: "entity.video_projector.name", sounds: { beacon: { path: "assets/sounds/furniture/video_projector_1_beacon", loop: true, condition: IS_ON } } },
  };
  const IS_ON_VARIABLE = [{ name: "isOn", type: "flag", initial: true, persistent: true }];
  const beaconCondScene = (entity) => ({ id: "movement-check-beacon-condition", titleKey: "scene.demo.name", length: 20, playerStart: 0, entities: [{ id: "projector-1", type: "projector", x: 5, ...entity }] });
  run("beacon conditionnel : variable déclarée -> chargé", false, expectSceneParseThrows(beaconCondScene({ variables: IS_ON_VARIABLE }), BEACON_COND_REGISTRY));
  run("beacon conditionnel : variable absente de l'instance -> erreur au chargement", true, expectSceneParseThrows(beaconCondScene({}), BEACON_COND_REGISTRY));
  run("beacon conditionnel : condition mal formée -> erreur au chargement", true, expectSceneParseThrows(beaconCondScene({ variables: IS_ON_VARIABLE, sounds: { beacon: { condition: { type: "nope" } } } }), BEACON_COND_REGISTRY));
  const nightBeaconScene = parseScene(beaconCondScene({ sounds: { beacon: { condition: { type: "timeRange", from: 20, to: 6 } } } }), BEACON_COND_REGISTRY);
  run.same(
    "beacon conditionnel : condition d'instance REMPLACE celle de l'archétype (jamais fusionnée)",
    { type: "timeRange", from: 20, to: 6 },
    getActiveWorld(createInitialState(nightBeaconScene, "beacon-cond")).entities[0].sounds.beacon.condition
  );
  run("beacon conditionnel : registre intact après remplacement", IS_ON, BEACON_COND_REGISTRY.projector.sounds.beacon.condition);
  let beaconCondState = createInitialState(parseScene(beaconCondScene({ variables: IS_ON_VARIABLE }), BEACON_COND_REGISTRY), "beacon-cond");
  const projectorOf = (state) => getActiveWorld(state).entities.find((e) => e.id === "projector-1");
  run("beacon conditionnel : allumé au départ -> condition vraie", true, evaluateCondition(projectorOf(beaconCondState).sounds.beacon.condition, { entity: projectorOf(beaconCondState) }));
  beaconCondState = applyEntityActionEffects(beaconCondState, "projector-1", [{ type: "setVariable", scope: "entity", name: "isOn", value: false }]);
  run("beacon conditionnel : éteint par effet -> condition fausse", false, evaluateCondition(projectorOf(beaconCondState).sounds.beacon.condition, { entity: projectorOf(beaconCondState) }));

  // --- Champs inconnus : sons, tuning, registre des types (voir
  // core/entity-parse.js/SOUND_ROLES, SOUND_FIELDS, TUNING_KEYS,
  // validateEntityRegistry). ---
  const SOUND_REGISTRY = { lamp: { nameKey: "entity.lamp.name", sounds: { beacon: { path: "assets/sounds/a", loop: true } } } };
  const entityMessage = (fields) =>
    sceneParseMessage({ id: "sounds-check", titleKey: "scene.demo.name", length: 10, entities: [{ id: "lamp-1", type: "lamp", x: 3, ...fields }] }, SOUND_REGISTRY);
  run(
    "champs inconnus : sons et tuning de référence acceptés",
    "accepté",
    entityMessage({ sounds: { beacon: { beaconInterval: 900, condition: { type: "consumed" } }, vocal: null }, tuning: { beaconGain: 1.2, transitionSound: "assets/sounds/b" } })
  );
  run(
    "sons de proximité : approachSound, leaveSound et proximityHoldMs acceptés",
    "accepté",
    entityMessage({ sounds: { beacon: null, approachSound: { path: "assets/sounds/o" }, leaveSound: { path: "assets/sounds/c", leaveSoundGain: 0.8 } }, tuning: { proximityHoldMs: 2000 } })
  );
  run("champs inconnus : rôle de son inconnu (bacon)", true, entityMessage({ sounds: { bacon: { path: "assets/sounds/a" } } }).includes(UNKNOWN_FIELD));
  run("champs inconnus : champ de descripteur (beaconIntervall)", true, entityMessage({ sounds: { beacon: { beaconIntervall: 900 } } }).includes(UNKNOWN_FIELD));
  run(
    "champs inconnus : condition sur un rôle qui ne la lit pas (vocal)",
    true,
    entityMessage({ sounds: { vocal: { path: "assets/sounds/v", condition: { type: "consumed" } } } }).includes(UNKNOWN_FIELD)
  );
  run(
    "champs inconnus : clé de tuning inconnue",
    'parseScene: entities[0] ("lamp-1") : tuning : champ(s) inconnu(s) "audibleRang".',
    entityMessage({ tuning: { audibleRang: 30 } })
  );
  // Réglages de fondu (core/entity-parse.js/validateFadeTuning) : bornes
  // vérifiées dans un descripteur, un `tuning` d'instance et un archétype.
  run(
    "fondu de balise : durée et vitesse valides acceptées",
    "accepté",
    entityMessage({ sounds: { beacon: { beaconFadeMs: 2500, beaconFadeRate: 0.3 } }, tuning: { beaconFadeMs: 0, beaconFadeRate: 1 } })
  );
  run("fondu de balise : vitesse nulle refusée (descripteur)", true, entityMessage({ sounds: { beacon: { beaconFadeRate: 0 } } }).includes("beaconFadeRate"));
  run("fondu de balise : vitesse négative refusée (tuning)", true, entityMessage({ tuning: { beaconFadeRate: -1 } }).includes("beaconFadeRate"));
  run("fondu de balise : durée négative refusée", true, entityMessage({ sounds: { beacon: { beaconFadeMs: -100 } } }).includes("beaconFadeMs"));
  run("fondu de balise : durée non numérique refusée", true, entityMessage({ tuning: { beaconFadeMs: "3000" } }).includes("beaconFadeMs"));
  run("son de passage : nature meta acceptée", "accepté", entityMessage({ tuning: { transitionSound: "assets/sounds/b", transitionSoundNature: "meta" } }));
  run("son de passage : nature inconnue refusée", true, entityMessage({ tuning: { transitionSoundNature: "positioned" } }).includes("transitionSoundNature"));
  const registryThrows = (registry) => {
    try {
      validateEntityRegistry(registry);
    } catch (error) {
      return error.message;
    }
    return "accepté";
  };
  run(
    "registre des types : archétype de référence accepté (réglage au premier niveau)",
    "accepté",
    registryThrows({ lamp: { nameKey: "entity.lamp.name", highlight: 2, gait: "shoes", sounds: { movement: { path: "assets/sounds/m", movementGain: 0.5 } } } })
  );
  run(
    "registre des types : champ inconnu nommé avec son type",
    'entities/types : type "lamp" : champ(s) inconnu(s) "observabel".',
    registryThrows({ lamp: { nameKey: "entity.lamp.name", observabel: true } })
  );
  run("registre des types : son d'archétype inconnu", true, registryThrows({ lamp: { sounds: { beacon: { pth: "assets/sounds/a" } } } }).includes(UNKNOWN_FIELD));
  run("registre des types : un archétype ne retire pas de rôle (null)", true, registryThrows({ lamp: { sounds: { beacon: null } } }) !== "accepté");
  run("registre des types : vitesse de fondu nulle refusée (premier niveau)", true, registryThrows({ lamp: { nameKey: "entity.lamp.name", beaconFadeRate: 0 } }).includes("beaconFadeRate"));
  run("registre des types : nature de son de passage inconnue refusée", true, registryThrows({ lamp: { nameKey: "entity.lamp.name", transitionSoundNature: "Meta" } }).includes("transitionSoundNature"));
  // Messages en rotation : la FORME se vérifie ici, l'existence de la série
  // côté vue (view/message-rotation.js, seule à importer rotations/).
  run("registre des types : messageRotation et sa période acceptés", "accepté", registryThrows({ sign: { nameKey: "entity.sign.name", messageRotation: "ads", messageRotationMinutes: 30 } }));
  run("registre des types : messageRotation vide refusé", true, registryThrows({ sign: { messageRotation: "" } }).includes("messageRotation"));
  run("registre des types : période de rotation nulle refusée", true, registryThrows({ sign: { messageRotationMinutes: 0 } }).includes("messageRotationMinutes"));
  run("tuning : période de rotation négative refusée (instance)", true, entityMessage({ tuning: { messageRotationMinutes: -60 } }).includes("messageRotationMinutes"));
  run("registre des types : vitesse de fondu nulle refusée (descripteur)", true, registryThrows({ lamp: { nameKey: "entity.lamp.name", sounds: { beacon: { path: "assets/sounds/a", beaconFadeRate: 0 } } } }).includes("beaconFadeRate"));

  // --- Cadence conditionnelle du vocal (sounds.vocal.rules, voir
  // core/entity-parse.js/validateVocalRules) : forme validée avec le
  // descripteur, conditions avec l'instance (ses variables), règles de
  // l'instance qui remplacent celles de l'archétype en bloc. ---
  const PHASE_TWO = { type: "variable", scope: "entity", name: "phase", equals: 2 };
  const PHASE_VARIABLE = [{ name: "phase", type: "int", initial: 1 }];
  const vocalRules = (rules, fields = { variables: PHASE_VARIABLE }) => entityMessage({ ...fields, sounds: { vocal: { path: "assets/sounds/v", rules } } });
  run("vocal rules : règle valide acceptée", "accepté", vocalRules([{ when: PHASE_TWO, vocalInterval: 2000, vocalIntervalVariation: 1000 }]));
  run("vocal rules : un seul réglage accepté", "accepté", vocalRules([{ when: PHASE_TWO, vocalInterval: 2000 }]));
  run("vocal rules : tableau vide refusé", true, vocalRules([]).includes("rules"));
  run("vocal rules : règle sans when refusée", true, vocalRules([{ vocalInterval: 2000 }]).includes("when"));
  run("vocal rules : règle qui ne règle rien refusée", true, vocalRules([{ when: PHASE_TWO }]).includes("ne règle rien"));
  run("vocal rules : intervalle nul refusé", true, vocalRules([{ when: PHASE_TWO, vocalInterval: 0 }]).includes("vocalInterval"));
  run("vocal rules : variation négative refusée", true, vocalRules([{ when: PHASE_TWO, vocalIntervalVariation: -1 }]).includes("vocalIntervalVariation"));
  run("vocal rules : autre réglage refusé (gain)", true, vocalRules([{ when: PHASE_TWO, vocalGain: 2 }]).includes(UNKNOWN_FIELD));
  run("vocal rules : condition sur une variable non déclarée refusée", true, vocalRules([{ when: PHASE_TWO, vocalInterval: 2000 }], {}).includes("phase"));
  run("vocal rules : refusées sur un autre rôle (beacon)", true, entityMessage({ sounds: { beacon: { rules: [{ when: PHASE_TWO, vocalInterval: 2000 }] } } }).includes(UNKNOWN_FIELD));
  run(
    "registre des types : règles du vocal vérifiées en forme",
    true,
    registryThrows({ lamp: { nameKey: "entity.lamp.name", sounds: { vocal: { path: "assets/sounds/v", rules: [{ when: PHASE_TWO }] } } } }).includes("ne règle rien")
  );
  const RULES_REGISTRY = {
    neon: { nameKey: "entity.lamp.name", sounds: { vocal: { path: "assets/sounds/v", vocalInterval: 5000, rules: [{ when: PHASE_TWO, vocalInterval: 2000 }] } } },
  };
  const rulesNeon = (fields) =>
    parseScene({ id: "vocal-rules", titleKey: "scene.demo.name", length: 10, entities: [{ id: "neon-1", type: "neon", x: 3, variables: PHASE_VARIABLE, ...fields }] }, RULES_REGISTRY).entities[0];
  run("vocal rules : héritées de l'archétype", 2000, rulesNeon({}).sounds.vocal.rules[0].vocalInterval);
  run("vocal rules : celles de l'instance remplacent en bloc", 1500, rulesNeon({ sounds: { vocal: { rules: [{ when: PHASE_TWO, vocalInterval: 1500 }] } } }).sounds.vocal.rules[0].vocalInterval);
  run("vocal rules : cadence de base gardée", 5000, rulesNeon({}).sounds.vocal.vocalInterval);

  // --- Sons conditionnels : balise ET sons de proximité (voir
  // core/entity-parse.js/applySoundConditions). La condition de l'instance
  // REMPLACE celle de l'archétype, jamais fusionnée clé par clé. ---
  const CONDITIONAL_REGISTRY = {
    shop_door: {
      nameKey: "entity.lamp.name",
      sounds: { proximityLoop: { path: "assets/sounds/bell", condition: { type: "timeRange", from: 8, to: 20, spread: 30 } } },
    },
  };
  const conditionalDoor = (sounds) =>
    parseScene({ id: "conditional-sounds", titleKey: "scene.demo.name", length: 10, entities: [{ id: "door-1", type: "shop_door", x: 3, sounds }] }, CONDITIONAL_REGISTRY).entities[0];
  run.same(
    "sons conditionnels : condition d'archétype gardée sans surcharge",
    { type: "timeRange", from: 8, to: 20, spread: 30 },
    conditionalDoor(undefined).sounds.proximityLoop.condition
  );
  run.same(
    "sons conditionnels : condition d'instance remplace celle de l'archétype en entier",
    { type: "perceptionActive" },
    conditionalDoor({ proximityLoop: { condition: { type: "perceptionActive" } } }).sounds.proximityLoop.condition
  );
  run(
    "sons conditionnels : condition acceptée sur approachSound et leaveSound",
    "accepté",
    sceneParseMessage(
      { id: "conditional-sounds", titleKey: "scene.demo.name", length: 10, entities: [{ id: "door-1", type: "shop_door", x: 3, sounds: { approachSound: { path: "a", condition: { type: "consumed" } }, leaveSound: { path: "b", condition: { type: "consumed" } } } }] },
      CONDITIONAL_REGISTRY
    )
  );
  run(
    "sons conditionnels : condition invalide d'un son de proximité rejetée",
    true,
    sceneParseMessage(
      { id: "conditional-sounds", titleKey: "scene.demo.name", length: 10, entities: [{ id: "door-1", type: "shop_door", x: 3, sounds: { approachSound: { condition: { type: "timeRange", from: 8, to: 8 } } } }] },
      CONDITIONAL_REGISTRY
    ).includes("approachSound.condition")
  );
}
