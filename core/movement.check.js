// Vérifications du déplacement du core, exécutables depuis la console du
// navigateur (Node n'est pas disponible sur cette machine). Pur : aucun DOM,
// aucun fetch. Le niveau est construit en dur via un objet littéral, passé à
// parseLevel — aucune dépendance hors des modules du core.

import { parseLevel } from "./level.js";
import { createInitialState } from "./state.js";
import { tick } from "./actions.js";
import { reduce } from "./reduce.js";

const RAW_LEVEL = {
  id: "movement-check",
  titleKey: "level.demo.title",
  length: 10,
  playerStart: 5,
  entities: [],
};

// Pas d'entité dans le niveau de test : le registre peut rester vide.
const EMPTY_REGISTRY = {};

function check(label, expected, actual) {
  const pass = Object.is(expected, actual);
  console.log(pass ? `OK: ${label}` : `ECHEC: ${label} — attendu ${expected}, obtenu ${actual}`);
  return pass;
}

export function runMovementChecks() {
  let passed = 0;
  let total = 0;

  function run(label, expected, actual) {
    total += 1;
    if (check(label, expected, actual)) passed += 1;
  }

  const level = parseLevel(RAW_LEVEL, EMPTY_REGISTRY);

  // Quelques ticks à droite depuis le centre : x avance de MOVE_STEP par tick.
  let state = createInitialState(level);
  state = reduce(state, tick(1));
  state = reduce(state, tick(1));
  state = reduce(state, tick(1));
  run("3 ticks à droite depuis x=5", 6.5, state.player.x);

  // Clamp à gauche : depuis le bord 0, un tick à gauche reste à 0.
  const leftLevel = parseLevel({ ...RAW_LEVEL, playerStart: 0 }, EMPTY_REGISTRY);
  const leftState = reduce(createInitialState(leftLevel), tick(-1));
  run("clamp à gauche depuis x=0", 0, leftState.player.x);

  // Clamp à droite : depuis le bord length, un tick à droite reste à length.
  const rightLevel = parseLevel({ ...RAW_LEVEL, playerStart: RAW_LEVEL.length }, EMPTY_REGISTRY);
  const rightState = reduce(createInitialState(rightLevel), tick(1));
  run("clamp à droite depuis x=length", RAW_LEVEL.length, rightState.player.x);

  // Action inconnue -> état inchangé, MÊME référence (pas de nouvel objet).
  const before = createInitialState(level);
  const after = reduce(before, { type: "UNKNOWN" });
  run("action inconnue renvoie la même référence", before, after);

  console.log(`Récapitulatif : ${passed} réussis / ${total} total`);
  return { passed, total };
}
