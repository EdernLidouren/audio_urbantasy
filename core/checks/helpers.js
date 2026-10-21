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
import { throws } from "../../lib/check.js";

// { companions: [] } : passé explicitement à CHAQUE createInitialState() des
// vérifications qui ne concernent pas les compagnons — sans lui, le défaut
// (UN compagnon de test, voir core/state.js) s'ajouterait à des scénarios
// conçus et vérifiés AVANT son existence, avec des positions attendues
// calculées à la main. Les vérifications dédiées aux compagnons
// (./companions.check.js) l'omettent volontairement pour exercer le défaut
// réel.
export const NO_COMPANIONS = { companions: [] };

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

  // Compagnon EXPLICITE (pas le défaut de createTestCompanion) : targetId
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
