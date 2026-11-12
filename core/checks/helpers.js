// Fixtures PARTAGÉES par plusieurs domaines de vérification (core/checks/
// *.check.js) : constantes de test, constructeurs de scènes, parties de
// référence. Une fixture n'est ici QUE si plusieurs domaines s'en servent ;
// sinon elle reste dans son domaine. Chaque constructeur rend des objets
// NEUFS (aucun état partagé entre domaines).

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, travelToWorld } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import { addMoney } from "../money.js";
import { addItem } from "../bag.js";
import { parseNewGame } from "../new-game.js";
import { throws } from "../../lib/check.js";
import { NameRef } from "../../lib/i18n.js";
import { MEDIUM } from "../../config/marbles-values.js";
import { SLOTS, legalActions, validateMarbleTypes } from "../marbles.js";
import { nextRandom } from "../rng.js";
import { fixtureRules } from "./fixtures/marbles.js";

// Départ d'OBJETS des vérifications d'inventaire et de collections : le kit
// de test de config/new-game.js (rangers et escarpins dans le sac, baskets
// équipées), sans compagnon, résolu par le vrai parseNewGame. Écrit ici
// plutôt que lu dans config/new-game.js : changer le kit du jeu ne doit pas
// casser ces vérifications.
export const ITEM_START = parseNewGame(
  { startSceneId: "check", bag: [{ type: "combat_boots" }, { type: "high_heels" }], equipment: { feet: "sneakers" } },
  {}
).start;

// Une table de billes FABRIQUÉE, complétée d'un calibre (obligatoire) pour chaque
// bille qui n'en déclare pas : MEDIUM, quand la vérification ne porte pas sur lui.
export function withSizes(table) {
  return Object.fromEntries(Object.entries(table).map(([id, type]) => [id, { size: MEDIUM, ...type }]));
}

// Répond aux choix en attente d'un résultat du réducteur des billes, toujours par
// la première réponse légale (la première cible éligible) : les parties jouées par
// les vérifications vont au bout. -> le résultat final, son journal complété de ceux
// des réponses. `rules` : core/marbles-rules.js.
export function answerChoices(rules, result) {
  let current = result;
  const events = [...result.events];
  while (current.ok && current.state.pendingChoice) {
    current = rules.reduce(current.state, legalActions(current.state)[0]);
    events.push(...current.events);
  }
  return { ...current, events };
}

// Une partie des billes au sac VIDE, base des états fabriqués par les domaines
// marbles* : rien n'y est mélangé, son hasard reste celui de la graine, et les
// régénérations fabriquées gardent leur ordre. `rules` : core/marbles-rules.js.
export function emptyBagMarblesGame(rules, seed) {
  return rules.createGame(seed, { bag: [] });
}

// Une main de billes (core/marbles.js, en-tête) depuis leurs ids, toutes à
// `turnsInHand` tours en main (0 par défaut), pour les états fabriqués des
// domaines marbles*.
export function inHand(ids, turnsInHand = 0) {
  return ids.map((marble) => ({ marble, turnsInHand }));
}

// Les ids des billes d'une main, dans l'ordre : ce que les attentes comparent.
export function handIds(state) {
  return state.hand.map((held) => held.marble);
}

// Les règles d'une table FABRIQUÉE, complétée d'un calibre (withSizes), aux réglages
// et au sac des vérifications (core/checks/fixtures/marbles.js/fixtureRules).
export function fabricatedRules(table) {
  return fixtureRules(withSizes(table));
}

// Valide une table de billes FABRIQUÉE, complétée d'un calibre (withSizes) : lève si
// la table est refusée (core/marbles.js/validateMarbleTypes).
export function validateTable(table) {
  validateMarbleTypes(withSizes(table));
}

// Le message de l'exception que lève `fn`, ou "" : pour vérifier qu'un refus vient
// bien de la raison attendue.
export function caughtMessage(fn) {
  try {
    fn();
  } catch (error) {
    return error.message;
  }
  return "";
}

// Une bille posée sur le triangle, à `wear` d'usure (0 par défaut).
export function placed(marble, wear = 0) {
  return { marble, wear };
}

// Un triangle, ses trois emplacements dans l'ordre des phases.
export function triangleOf(leftBase, rightBase, apex) {
  return { leftBase, rightBase, apex };
}

// Les types des évènements d'un journal, dans l'ordre.
export function eventTypes(events) {
  return events.map((event) => event.type);
}

// Applique une action des billes qui DOIT passer : une action refusée est une faute
// du test, nommée telle quelle plutôt qu'un échec plus loin. -> le résultat.
export function mustReduce(rules, state, action) {
  const result = rules.reduce(state, action);
  if (!result.ok) throw new Error(`action refusée (${result.error}) : ${JSON.stringify(action)}`);
  return result;
}

// Une partie de billes en cours de tour, base des états fabriqués : le tour 2, phase
// de jeu, sac vide (emptyBagMarblesGame). `over` remplace ce que le test veut fixer.
export function marblesPlayState(rules, over = {}) {
  return { ...emptyBagMarblesGame(rules, 1), turn: 2, stage: "play", ...over };
}

// Toutes les billes d'une partie, où qu'elles soient : sac, main, défausse,
// triangle, pot et billes perdues. Aucune ne se crée ni ne disparaît.
export function marbleCount(state) {
  const onTriangle = SLOTS.filter((slot) => state.triangle[slot] !== null).length;
  return state.bag.length + state.hand.length + state.discard.length + onTriangle + state.pot.length + state.lost.length;
}

// Fige récursivement : une écriture dans un état reçu lèverait (modules ES, donc
// mode strict), et prouverait que le réducteur ou la prévision n'est pas pur.
export function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Un tirage d'entiers à graine, pour les parties jouées au hasard des
// vérifications : pick(n) rend un entier de 0 à n - 1.
export function createPicker(seed) {
  let rngState = seed >>> 0;
  return (count) => {
    const { value, state } = nextRandom(rngState);
    rngState = state;
    return Math.floor(value * count);
  };
}

// Joue une partie de billes par choix ALÉATOIRES, à graine (le tirage du test,
// jamais le hasard de la partie), actions refusées comprises, et en vérifie les
// invariants à chaque action : aucune bille créée ni perdue, score jamais négatif
// ni en baisse, main bornée, compteurs remis à zéro, tour dans les bornes, aucune
// bille usée restée sur le triangle, aucun bonus resté. Partagée par la fumée de la
// table des vérifications (domaine marbles) et celle de la vraie table (domaine
// marbles-content). -> les fautes trouvées (des phrases) ; `seenTypes` (un Set)
// reçoit les types d'évènements vus.
export function playRandomMarblesGame(rules, seed, options, seenTypes) {
  const pick = createPicker(seed);
  let state = rules.createGame(seed, options);
  const total = marbleCount(state);
  const faults = [];
  let score = 0;
  let actions = 0;

  const verify = (result) => {
    state = result.state;
    actions += 1;
    for (const event of result.events) seenTypes.add(event.type);
    // Un état suspendu sur un choix est un instantané en pleine action : une bille
    // peut y être en cours de lancer, ni en main ni sur le triangle. Le compte se
    // vérifie hors choix.
    if (!state.pendingChoice && marbleCount(state) !== total) faults.push(`billes : ${marbleCount(state)} au lieu de ${total}`);
    if (state.score < 0) faults.push(`score négatif : ${state.score}`);
    if (state.score < score) faults.push(`score en baisse : ${score} -> ${state.score}`);
    score = state.score;
    if (state.hand.length > state.maxHandSize) faults.push(`main trop grande : ${state.hand.length}`);
    if (state.stage !== "play" && (state.speed !== 0 || state.mass !== 1)) faults.push(`compteurs non remis à zéro : ${state.speed}, ${state.mass}`);
    if (state.turn > state.turnCount) faults.push(`tour hors bornes : ${state.turn}`);
    for (const slot of SLOTS) {
      const placedHere = state.triangle[slot];
      if (placedHere !== null && placedHere.wear >= rules.maxWearOf(placedHere.marble) && state.stage === "draw") {
        faults.push(`bille à usure maximale restée sur le triangle : ${placedHere.marble}`);
      }
      if (placedHere?.bonus !== undefined && state.stage !== "play") faults.push(`bonus resté après la résolution : ${placedHere.marble}`);
    }
  };

  // Borne large : une partie sans issue la dépasserait, et serait signalée.
  while (state.stage !== "over" && actions < 2000) {
    // Un choix en attente : une réponse légale au hasard (Terminer compris), mais
    // aussi, une fois sur quatre, une autre action, qui doit être refusée.
    if (state.pendingChoice) {
      if (pick(4) === 0) {
        const refusedResult = rules.reduce(state, { type: "resolve" });
        if (refusedResult.ok || refusedResult.error !== "choicePending") faults.push(`action acceptée pendant un choix : ${refusedResult.error}`);
      }
      const answers = legalActions(state);
      verify(rules.reduce(state, answers[pick(answers.length)]));
      continue;
    }
    if (state.stage === "draw") {
      verify(rules.reduce(state, { type: "draw" }));
      continue;
    }
    switch (pick(6)) {
      case 0:
        verify(rules.reduce(state, { type: "swap", a: SLOTS[pick(3)], b: SLOTS[pick(3)] }));
        break;
      case 1:
      case 2:
      case 3:
        verify(rules.reduce(state, { type: "place", handIndex: pick(state.maxHandSize), slot: SLOTS[pick(3)] }));
        break;
      default:
        verify(rules.reduce(state, { type: "resolve" }));
    }
  }
  if (state.stage !== "over") faults.push("partie sans issue");
  return faults;
}

// Joue une partie de billes jusqu'au bout, chaque action tirée par `pick`
// (createPicker) parmi les actions légales (core/marbles.js/legalActions), réponses
// aux choix comprises. `onResult(result, before)` reçoit chaque résultat et l'état
// d'avant. -> l'état final.
export function playLegalGame(rules, state, pick, onResult = () => {}) {
  let current = state;
  while (current.stage !== "over") {
    const actions = legalActions(current);
    const result = rules.reduce(current, actions[pick(actions.length)]);
    onResult(result, current);
    current = result.state;
  }
  return current;
}

export const RAW_SCENE = {
  id: "movement-check",
  titleKey: "scene.demo.name",
  length: 10,
  playerStart: 5,
  entities: [],
};

// Pas d'entité dans la scène de test : le registre peut rester vide.
export const EMPTY_REGISTRY = {};

// --- Errance (behavior wander) : registre, scène, boucle de ticks ---

export const WANDER_REGISTRY = { dog: { nameKey: "entity.dog.name" }, wall: { nameKey: "entity.wall.name", blocksMovement: true } };

export function makeWanderScene(overrides = {}) {
  return {
    id: "movement-check-wander",
    titleKey: "scene.demo.name",
    length: 10,
    playerStart: 5,
    entities: [{ id: "wander-1", type: "dog", x: 5, behavior: { kind: "wander" } }],
    ...overrides,
  };
}

export function runTicks(startState, count) {
  const positions = [];
  const phases = [];
  let current = startState;
  for (let i = 0; i < count; i++) {
    current = reduce(current, tick(0));
    const entity = getActiveWorld(current).entities[0];
    positions.push(entity.x);
    phases.push(entity.wander.phase);
  }
  return { state: current, positions, phases };
}

// --- Multi-mondes ---

export const WORLD_A_REGISTRY = { dog: { nameKey: "entity.dog.name" } };

// --- Scène à deux faces (recto/verso) : scène brute de référence ---

export const TWO_FACED_RAW_SCENE = {
  id: "movement-check-twoface",
  titleKey: "scene.demo.name",
  length: 10,
  playerStart: 1,
  recto: { entities: [{ id: "recto-dog", type: "dog", x: 3, behavior: { kind: "wander" } }] },
  verso: { entities: [{ id: "verso-dog", type: "dog", x: 7, behavior: { kind: "wander" } }] },
};

// --- Sauvegarde ---

// Partie d'AUDIT : activité réelle (joueur qui avance, chien qui erre,
// compagnon explicite, argent, sac) ET une transition (deux mondes, un actif
// et un rangé) — le cas le plus représentatif d'un vrai save. Reconstruite
// à chaque appel (déterministe : même seed -> même partie) : aucun domaine
// ne partage d'objet avec un autre.
export function createAuditFixture() {
  const AUDIT_REGISTRY = { dog: { nameKey: "entity.dog.name" }, door: { nameKey: "entity.door.name" } };
  const auditWorldA = parseScene(
    {
      id: "movement-check-audit-a",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 2,
      music: "assets/musics/a_warm_night_in_harlem.mp3",
      entities: [
        { id: "audit-dog", type: "dog", x: 10, behavior: { kind: "wander"} },
        { id: "audit-door", type: "door", x: 15 },
      ],
    },
    AUDIT_REGISTRY
  );
  const auditWorldB = parseScene(
    { id: "movement-check-audit-b", titleKey: "scene.demo.name", length: 15, playerStart: 3, entities: [] },
    AUDIT_REGISTRY
  );

  // Compagnon construit à la main (forme d'entité résolue) : targetId
  // écrit en dur plutôt que laissé au défaut interne de follow.js, pour que
  // l'aller-retour JSON exerce réellement cette clé.
  const auditCompanion = {
    id: "audit-companion",
    type: "dog",
    x: 2,
    behavior: { kind: "follow", targetId: "player", minDistance: 1, maxDistance: 3 },
  };
  let auditSession = createInitialState(auditWorldA, 77, { companions: [auditCompanion] });
  auditSession = addMoney(auditSession, 12); // argent NON nul dans l'audit — voir plus bas, doit survivre au même titre que le reste
  auditSession = addItem(auditSession, "apple", 3); // sac NON vide dans l'audit — même raison
  for (let i = 0; i < 25; i++) auditSession = reduce(auditSession, tick(1));
  auditSession = travelToWorld(auditSession, auditWorldB.id, auditWorldB);
  for (let i = 0; i < 10; i++) auditSession = reduce(auditSession, tick(-1));
  return { AUDIT_REGISTRY, auditWorldA, auditWorldB, auditCompanion, auditSession };
}

// --- Argent ---

// Scène de test de l'argent, réutilisée par la vente (trade).
export function buildMoneyScene() {
  const MONEY_REGISTRY = { dog: { nameKey: "entity.dog.name" } };
  return parseScene(
    {
      id: "movement-check-money",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 0,
      entities: [
        { id: "coin-1", type: "dog", x: 5, interactable: true, action: { kind: "pickup", amount: 7 } },
        { id: "other-1", type: "dog", x: 6 },
      ],
    },
    MONEY_REGISTRY
  );
}

// --- Scènes : validation au chargement ---

// Vrai si parseScene REFUSE la scène (exception au chargement).
export function expectSceneParseThrows(rawScene, registry) {
  return throws(() => parseScene(rawScene, registry));
}

// Message d'erreur de parseScene sur `rawScene`, ou "accepté" : pour vérifier
// qu'un rejet vient bien de la raison attendue, jamais d'une autre erreur
// de la scène de test.
export function sceneParseMessage(rawScene, registry) {
  try {
    parseScene(rawScene, registry);
  } catch (error) {
    return error.message;
  }
  return "accepté";
}

// Fragment commun à tout message de champ inconnu (voir lib/validate.js).
export const UNKNOWN_FIELD = "champ(s) inconnu(s)";

// --- Effets d'action : scène de test portant UN effet sur une action ---

export const VAR_ACTION_REGISTRY = { npc: { nameKey: "entity.npc.name" } };

export function sceneWithActionEffect(effect, entityVariables = [{ name: "isOpen", type: "flag", initial: false }]) {
  return {
    id: "movement-check-var-effect",
    titleKey: "scene.demo.name",
    length: 10,
    playerStart: 0,
    variables: [{ name: "sceneCounter", type: "int", initial: 0 }],
    entities: [{ id: "e1", type: "npc", x: 5, variables: entityVariables, action: { kind: "applyEffects", effects: [effect] } }],
  };
}

// --- Textes : la traduction de test des vérifications de vue ---

// Une valeur de paramètre, telle que keyText l'écrit : une référence de nom
// (nameRef) par sa clé, `<aging_flick>` pour le nom d'une bille ; une liste entre
// crochets ; le reste tel quel.
function keyValue(value) {
  if (value instanceof NameRef) {
    const marble = /^marble\.(.+)\.name$/.exec(value.key);
    return `<${marble ? marble[1] : value.key.replace(/^marbles\./, "")}>`;
  }
  if (Array.isArray(value)) return `[${value.map(keyValue).join(" | ")}]`;
  return String(value);
}

// Un texte DIT, dans une vraie langue, sans défaut visible : non vide, aucun gabarit
// resté brut (accolade, clé non traduite), aucun nombre négatif écrit avec un trait
// d'union, qu'un lecteur d'écran peut taire.
export function isCleanText(text) {
  return typeof text === "string" && text.length > 0 && !/[{}]|marbles?\.\w|-\d/.test(text);
}

// Traduction de TEST, à passer là où la vue attend `t` : rend la clé (sans son
// préfixe `marbles.`) et ses paramètres, `event.draw{marble: <aging_flick>}`, au lieu
// du texte. Les vérifications de vue lisent ainsi CE QUE la vue dit (quel gabarit,
// quelles valeurs) sans dépendre de la rédaction des textes ni des noms des billes :
// réécrire « Vitesse +{amount} » ou renommer une bille ne les casse pas. Les phrases
// complètes ont leurs propres témoins, peu nombreux.
export function keyText(key, params) {
  const short = key.replace(/^marbles\./, "");
  if (params === undefined || Object.keys(params).length === 0) {
    // Le nom d'une bille, demandé tel quel (marbleName) : comme sa référence.
    const marble = /^marble\.(.+)\.name$/.exec(key);
    return marble ? `<${marble[1]}>` : short;
  }
  return `${short}{${Object.entries(params)
    .map(([name, value]) => `${name}: ${keyValue(value)}`)
    .join(", ")}}`;
}
