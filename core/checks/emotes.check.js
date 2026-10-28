// Vérifications du core — domaine « emotes ». Émotes (core/emotes.js) :
// registre, stockage, effets learnEmote/forgetEmote, condition knowsEmote et
// son court-circuit debug, triggers d'émote (core/triggers.js), sauvegarde. Lancées par
// core/checks/index.js/runChecks. Pur : aucun DOM, aucun fetch.

import { parseScene } from "../scene.js";
import { createInitialState, applyEntityActionEffects } from "../state.js";
import { SAVE_VERSION, serializeGame, deserializeGame } from "../save.js";
import { evaluateCondition } from "../presence.js";
import {
  EMOTE_REGISTRY,
  emoteProps,
  knowsEmote,
  learnEmote,
  forgetEmote,
  setEmoteShortcut,
  validateEmoteRegistry,
  orderedEmoteIds,
} from "../emotes.js";
import { applyEmoteTriggers, emoteTriggerRange } from "../triggers.js";
import { isDebugEnabled, setDebugEnabled } from "../../config/debug.js";
import { throws } from "../../lib/check.js";

export default function checkEmotes(run) {
  // Le court-circuit debug est testé ici : le mode est TOUJOURS remis dans
  // son état d'avant, même si une vérification lève une exception.
  const debugWasEnabled = isDebugEnabled();
  try {
    setDebugEnabled(false);
    checkEmotesBody(run);
  } finally {
    setDebugEnabled(debugWasEnabled);
  }
}

function checkEmotesBody(run) {
  // --- Registre ---
  run("emotes : registre réel valide", false, throws(() => validateEmoteRegistry(EMOTE_REGISTRY)));
  run("emotes : ordre du menu suit order", "whistle,clap", orderedEmoteIds().join(","));
  run("emotes : tri indépendant de l'ordre d'insertion", "b,a", orderedEmoteIds({ a: { order: 2 }, b: { order: 1 } }).join(","));
  run("emotes : emoteProps id inconnu -> undefined", undefined, emoteProps("moonwalk"));
  const entry = { nameKey: "emote.x.name", descriptionKey: "emote.x.description", soundPath: "assets/sounds/emotes/x", range: 10 };
  const rejected = (registry) => throws(() => validateEmoteRegistry(registry));
  run("emotes : entrée de test complète acceptée", false, rejected({ a: { ...entry, order: 1 } }));
  run("emotes : order dupliqué rejeté", true, rejected({ a: { ...entry, order: 1 }, b: { ...entry, order: 1 } }));
  run("emotes : order non entier rejeté", true, rejected({ a: { ...entry, order: 1.5 } }));
  run("emotes : son manquant rejeté", true, rejected({ a: { order: 1, nameKey: entry.nameKey, descriptionKey: entry.descriptionKey } }));
  run("emotes : champ inconnu rejeté", true, rejected({ a: { ...entry, order: 1, cooldownMs: 500 } }));

  // --- Primitives pures : sac SPARSE, référence inchangée si rien à faire ---
  run("emotes : knowsEmote sur sac vide -> faux", false, knowsEmote({}, "clap"));
  const learned = learnEmote({}, "clap");
  run("emotes : learnEmote ajoute la clé", true, knowsEmote(learned, "clap"));
  run("emotes : learnEmote idempotent -> même référence", learned, learnEmote(learned, "clap"));
  const forgotten = forgetEmote(learned, "clap");
  run("emotes : forgetEmote retire la clé", false, knowsEmote(forgotten, "clap"));
  run("emotes : forgetEmote idempotent -> même référence", forgotten, forgetEmote(forgotten, "clap"));

  // --- Validation au chargement : condition et effets ---
  const TEST_REGISTRY = { npc: { nameKey: "entity.npc.name" } };
  const sceneWith = (entity) => ({ id: "emotes-check", titleKey: "scene.demo.name", length: 10, playerStart: 0, entities: [{ id: "e1", type: "npc", x: 5, ...entity }] });
  const withCondition = (id) => sceneWith({ presence: [{ when: { type: "knowsEmote", id }, present: true }] });
  const withEffect = (effect) => sceneWith({ action: { kind: "applyEffects", effects: [effect] } });
  run("knowsEmote : id valide chargé", false, throws(() => parseScene(withCondition("whistle"), TEST_REGISTRY)));
  run("knowsEmote : id inconnu rejeté au chargement", true, throws(() => parseScene(withCondition("moonwalk"), TEST_REGISTRY)));
  run("learnEmote : id valide chargé", false, throws(() => parseScene(withEffect({ type: "learnEmote", id: "clap" }), TEST_REGISTRY)));
  run("learnEmote : id inconnu rejeté au chargement", true, throws(() => parseScene(withEffect({ type: "learnEmote", id: "moonwalk" }), TEST_REGISTRY)));
  run("forgetEmote : id inconnu rejeté au chargement", true, throws(() => parseScene(withEffect({ type: "forgetEmote", id: "moonwalk" }), TEST_REGISTRY)));
  run("learnEmote : champ inconnu rejeté", true, throws(() => parseScene(withEffect({ type: "learnEmote", id: "clap", scope: "party" }), TEST_REGISTRY)));

  // --- Évaluation de la condition ---
  const knowsClap = { type: "knowsEmote", id: "clap" };
  run("knowsEmote : connue -> vrai", true, evaluateCondition(knowsClap, { session: { emotes: { clap: true } } }));
  run("knowsEmote : inconnue -> faux", false, evaluateCondition(knowsClap, { session: { emotes: {} } }));
  run("knowsEmote : contexte sans session -> faux", false, evaluateCondition(knowsClap, {}));

  // --- Effets appliqués à une partie, bout en bout ---
  const world = parseScene(
    { id: "emotes-check-world", titleKey: "scene.demo.name", length: 10, playerStart: 0, entities: [{ id: "teacher", type: "npc", x: 5 }] },
    TEST_REGISTRY
  );
  let session = createInitialState(world, 1);
  run.same("emotes : partie sans départ -> aucune émote connue", {}, session.emotes);
  run.same("emotes : départ déclaré -> émotes posées", { whistle: true }, createInitialState(world, 1, { emotes: { whistle: true } }).emotes);
  session = applyEntityActionEffects(session, "teacher", [{ type: "learnEmote", id: "whistle" }]);
  run("applyEntityActionEffects : learnEmote -> émote connue après splice", true, knowsEmote(session.emotes, "whistle"));
  const withVariableToo = applyEntityActionEffects(session, "teacher", [{ type: "learnEmote", id: "clap" }, { type: "forgetEmote", id: "whistle" }]);
  run.same("applyEntityActionEffects : learn puis forget dans la même liste", { clap: true }, withVariableToo.emotes);

  // --- Raccourci ---
  run("emotes : partie neuve -> aucun raccourci", null, createInitialState(world, 1).emoteShortcut);
  session = setEmoteShortcut(session, "whistle");
  run("emotes : setEmoteShortcut pose le raccourci", "whistle", session.emoteShortcut);
  run("emotes : setEmoteShortcut identique -> même référence", session, setEmoteShortcut(session, "whistle"));
  run("emotes : setEmoteShortcut id inconnu -> exception", true, throws(() => setEmoteShortcut(session, "moonwalk")));

  // --- Triggers d'émote (core/triggers.js) : validation, portée,
  // application sur la face du joueur ---
  run("emotes : portée manquante rejetée", true, rejected({ a: { ...entry, order: 1, range: undefined } }));
  run("emotes : portée nulle rejetée", true, rejected({ a: { ...entry, order: 1, range: 0 } }));

  const BELL = { type: "playSound", path: "assets/sounds/effects/clock_tower_bell" };
  const withTrigger = (trigger) => sceneWith({ triggers: [trigger] });
  const triggerLoads = (trigger) => !throws(() => parseScene(withTrigger(trigger), TEST_REGISTRY));
  run("emote trigger : forme complète chargée", true, triggerLoads({ on: "emote", emote: "clap", range: 8, effects: [BELL] }));
  run("emote trigger : sans emote ni range chargé", true, triggerLoads({ on: "emote", effects: [BELL] }));
  run("emote trigger : range égal à la portée de l'émote chargé", true, triggerLoads({ on: "emote", emote: "clap", range: 12, effects: [BELL] }));
  run("emote trigger : range plus long que l'émote nommée rejeté", false, triggerLoads({ on: "emote", emote: "clap", range: 13, effects: [BELL] }));
  run("emote trigger : range > 12 sans emote chargé (borné à l'émote faite)", true, triggerLoads({ on: "emote", range: 20, effects: [BELL] }));
  run("emote trigger : range nul rejeté", false, triggerLoads({ on: "emote", range: 0, effects: [BELL] }));
  run("emote trigger : range non numérique rejeté", false, triggerLoads({ on: "emote", range: "8", effects: [BELL] }));
  run("emote trigger : émote inconnue rejetée", false, triggerLoads({ on: "emote", emote: "moonwalk", effects: [BELL] }));
  run("emote trigger : hour sur un trigger d'émote rejeté", false, triggerLoads({ on: "emote", hour: 8, effects: [BELL] }));
  run("emote trigger : emote sur un trigger horaire rejeté", false, triggerLoads({ on: "hour", emote: "clap", effects: [BELL] }));
  run("emote trigger : range sur un trigger horaire rejeté", false, triggerLoads({ on: "hour", range: 3, effects: [BELL] }));
  run("emote trigger : effet mixte rejeté", false, triggerLoads({ on: "emote", effects: [{ type: "teleport", target: "x" }] }));
  const parsedTrigger = parseScene(withTrigger({ on: "emote", effects: [BELL] }), TEST_REGISTRY).entities[0].triggers[0];
  run("emote trigger : champs absents -> absents (sparse)", "effects,on", Object.keys(parsedTrigger).sort().join(","));

  run("emoteTriggerRange : sans range -> portée de l'émote", 12, emoteTriggerRange({}, "clap"));
  run("emoteTriggerRange : range plus court -> le sien", 8, emoteTriggerRange({ range: 8 }, "clap"));
  run("emoteTriggerRange : range plus long (sans emote) -> borné par l'émote", 12, emoteTriggerRange({ range: 20 }, "clap"));
  run("emoteTriggerRange : même trigger, émote qui porte plus loin", 20, emoteTriggerRange({ range: 20 }, "whistle"));

  // Scène à deux faces, joueur au recto en x 0. Le pigeon fuit à 8, le
  // chat à 3, l'écho répond à toute émote qu'il entend, le pigeon du verso
  // est sur l'autre face (isolée).
  const startleAndBell = [{ type: "startle" }, BELL];
  const emoteScene = parseScene(
    {
      id: "emotes-check-triggers",
      titleKey: "scene.demo.name",
      length: 40,
      playerStart: 0,
      recto: {
        entities: [
          { id: "pigeon", type: "npc", x: 8, triggers: [{ on: "emote", emote: "clap", range: 8, effects: startleAndBell }] },
          { id: "cat", type: "npc", x: 5, triggers: [{ on: "emote", emote: "clap", range: 3, effects: startleAndBell }] },
          { id: "echo", type: "npc", x: 20, triggers: [{ on: "emote", effects: [BELL] }] },
        ],
      },
      verso: {
        entities: [{ id: "pigeon_v", type: "npc", x: 1, triggers: [{ on: "emote", emote: "clap", effects: startleAndBell }] }],
      },
    },
    TEST_REGISTRY
  );
  const emoteBase = createInitialState(emoteScene, 1);
  const rectoOf = (s, id) => s.worlds[emoteScene.id].recto.entities.find((e) => e.id === id);
  const firedIds = (result) => result.fired.map((f) => f.entity.id).join(",");

  const clapped = applyEmoteTriggers(emoteBase, "clap", 0);
  run("applyEmoteTriggers : claquement à 0 -> le pigeon (8 <= 8) seul", "pigeon", firedIds(clapped));
  run("applyEmoteTriggers : effet d'état appliqué (pigeon enfui)", true, rectoOf(clapped.session, "pigeon").startled);
  run("applyEmoteTriggers : le chat (5 > 3) ne bouge pas", undefined, rectoOf(clapped.session, "cat").startled);
  run("applyEmoteTriggers : effets de rendu seuls dans `fired`", "playSound", clapped.fired[0].effects.map((e) => e.type).join(","));
  run("applyEmoteTriggers : l'autre face n'entend rien", true, Object.is(clapped.session.worlds[emoteScene.id].verso, emoteBase.worlds[emoteScene.id].verso));
  run("applyEmoteTriggers : claquement depuis x 4 -> pigeon et chat", "pigeon,cat", firedIds(applyEmoteTriggers(emoteBase, "clap", 4)));
  run("applyEmoteTriggers : sifflement -> l'écho (20 <= 25), pas les triggers du claquement", "echo", firedIds(applyEmoteTriggers(emoteBase, "whistle", 0)));
  run("applyEmoteTriggers : claquement depuis x 7 -> l'écho à 13 n'entend pas (portée 12)", "pigeon,cat", firedIds(applyEmoteTriggers(emoteBase, "clap", 7)));
  run("applyEmoteTriggers : déjà enfui -> ne réagit plus", "", firedIds(applyEmoteTriggers(clapped.session, "clap", 0)));
  const nothing = applyEmoteTriggers(emoteBase, "clap", 30);
  run("applyEmoteTriggers : rien à portée -> MÊME référence de session", true, Object.is(nothing.session, emoteBase));
  run.same("applyEmoteTriggers : déterministe", firedIds(applyEmoteTriggers(emoteBase, "clap", 4)), firedIds(applyEmoteTriggers(emoteBase, "clap", 4)));
  const onVerso = { ...emoteBase, player: { ...emoteBase.player, side: "verso" } };
  run("applyEmoteTriggers : joueur au verso -> le pigeon du verso, pas ceux du recto", "pigeon_v", firedIds(applyEmoteTriggers(onVerso, "clap", 0)));

  // Condition d'un trigger : validée au chargement comme toute condition,
  // évaluée sur l'état d'AVANT l'émote pour TOUS les triggers. Le néon à
  // deux étapes : un premier sifflement le dérègle (phase 1 -> 2), le
  // second seulement le fait éclater — jamais les deux en un.
  const phaseIs = (equals) => ({ type: "variable", scope: "entity", name: "phase", equals });
  const PHASE = [{ name: "phase", type: "int", initial: 1 }];
  const conditionLoads = (condition) =>
    !throws(() => parseScene(sceneWith({ variables: PHASE, triggers: [{ on: "emote", condition, effects: [BELL] }] }), TEST_REGISTRY));
  run("emote trigger : condition chargée", true, conditionLoads(phaseIs(1)));
  run("emote trigger : condition sur une variable inconnue rejetée", false, conditionLoads({ type: "variable", scope: "entity", name: "stage", equals: 1 }));
  run("emote trigger : condition malformée rejetée", false, conditionLoads({ type: "moonPhase" }));
  run("hour trigger : condition chargée aussi", true, !throws(() => parseScene(sceneWith({ variables: PHASE, triggers: [{ on: "hour", condition: phaseIs(1), effects: [BELL] }] }), TEST_REGISTRY)));
  const neonScene = parseScene(
    sceneWith({
      variables: PHASE,
      triggers: [
        { on: "emote", emote: "whistle", condition: phaseIs(1), effects: [{ type: "setVariable", scope: "entity", name: "phase", value: 2 }] },
        { on: "emote", emote: "whistle", condition: phaseIs(2), effects: [{ type: "startle" }, BELL] },
      ],
    }),
    TEST_REGISTRY
  );
  const neonBase = createInitialState(neonScene, 1);
  const neonOf = (s) => s.worlds[neonScene.id].entities[0];
  const firstWhistle = applyEmoteTriggers(neonBase, "whistle", 0);
  run("condition : premier sifflement -> phase 2", 2, neonOf(firstWhistle.session).variables.phase.value);
  run("condition : premier sifflement -> le trigger de phase 2 ne répond PAS dans la même passe", undefined, neonOf(firstWhistle.session).startled);
  run("condition : premier sifflement -> aucun rendu (la phase 1 n'en a pas)", "", firedIds(firstWhistle));
  const secondWhistle = applyEmoteTriggers(firstWhistle.session, "whistle", 0);
  run("condition : second sifflement -> le trigger de phase 2 répond", true, neonOf(secondWhistle.session).startled);
  run("condition : second sifflement -> phase inchangée", 2, neonOf(secondWhistle.session).variables.phase.value);
  run("condition : second sifflement -> son rendu", "e1", firedIds(secondWhistle));

  // --- Court-circuit debug : la lecture ment, l'écriture jamais ---
  setDebugEnabled(true);
  run("knowsEmote debug : vrai sans émote réelle", true, evaluateCondition(knowsClap, { session: { emotes: {} } }));
  run("knowsEmote debug : debugShortCircuit:false -> état réel", false, evaluateCondition(knowsClap, { session: { emotes: {} }, debugShortCircuit: false }));
  const fresh = createInitialState(world, 2);
  evaluateCondition(knowsClap, { session: fresh });
  run("knowsEmote debug : la lecture n'écrit rien", 0, Object.keys(fresh.emotes).length);
  setDebugEnabled(false);
  run("knowsEmote : debug coupé -> retombe sur l'état réel", false, evaluateCondition(knowsClap, { session: fresh }));

  // --- Sauvegarde ---
  const reload = deserializeGame(serializeGame(session));
  run("emotes : save/load réussit", true, reload.success);
  if (reload.success) run("emotes : émote apprise -> survit au rechargement", true, knowsEmote(reload.session.emotes, "whistle"));
  if (reload.success) run("emotes : raccourci -> survit au rechargement", "whistle", reload.session.emoteShortcut);
  const oldSave = { version: SAVE_VERSION, data: { ...session } };
  delete oldSave.data.emotes;
  delete oldSave.data.emoteShortcut;
  const oldReload = deserializeGame(oldSave);
  run("emotes : vieille save sans le champ -> rechargement réussit", true, oldReload.success);
  if (oldReload.success) run.same("emotes : vieille save rebouchée -> aucune émote", {}, oldReload.session.emotes);
  if (oldReload.success) run("emotes : vieille save rebouchée -> aucun raccourci", null, oldReload.session.emoteShortcut);
}
