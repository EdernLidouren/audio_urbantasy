// JEU DES BILLES, HÔTE — le CONTRAT AVEC TEMPLETON : un point d'entrée unique pour
// lancer une partie, une sortie unique pour en rendre le résultat.
//
// ENTRÉE : launchMarbles({ definition, bag, collection, seed, onEnd })
//   definition  la définition de partie (marbles/core/definitions.js) ;
//   bag         le sac du joueur (marbles/core/bags.js) si la définition en attend un,
//               null si elle impose ou génère le sien ;
//   collection  le fournisseur de collection (marbles/host/collection.js) ;
//   seed        la graine de la partie ;
//   onEnd(result)  appelé UNE fois, quand l'écran des billes se ferme (partie finie,
//               ou quittée : un abandon), avec le RÉSULTAT (marbles/core/outcome.js).
// -> { ok: true }, l'écran ouvert ; ou { ok: false, problems }, la partie refusée pour
// un sac invalide (marbles/core/bags.js, « Les problèmes »), rien d'ouvert : à
// l'appelant de les dire (marbles/view/narration/bags.js/describeBagRefusal).
//
// Le minijeu ne décide d'aucune récompense ni d'aucun déblocage : c'est le rôle de
// Templeton, d'après le résultat.
//
// Le lanceur se compose une fois (main.js) avec les règles liées (marbles/core/rules.js)
// et `openGame(state, onClose)`, qui ouvre l'écran des billes sur cet état et appelle
// `onClose(état final)` à sa fermeture : l'hôte garde la partie en cours, l'écran n'en
// détient pas de copie. Aucun DOM ici.

import { marblesOutcome } from "../core/outcome.js";

export function createMarblesLauncher({ rules, openGame }) {
  return function launchMarbles({ definition, bag = null, collection, seed, onEnd = () => {} }) {
    const start = rules.startGame(seed, definition, { bag, unlocked: collection.unlockedMarbles() });
    if (!start.ok) return { ok: false, problems: start.problems };
    let ended = false;
    openGame(start.state, (finalState) => {
      if (ended) return;
      ended = true;
      onEnd(marblesOutcome(finalState));
    });
    return { ok: true };
  };
}
