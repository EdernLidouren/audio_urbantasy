// Vérifications du core — domaine « emotes ». Émotes (core/emotes.js) :
// registre, stockage, effets learnEmote/forgetEmote, condition knowsEmote et
// son court-circuit debug, sauvegarde. Lancées par
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
  const entry = { nameKey: "emote.x.name", descriptionKey: "emote.x.description", soundPath: "assets/sounds/emotes/x" };
  const rejected = (registry) => throws(() => validateEmoteRegistry(registry));
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
