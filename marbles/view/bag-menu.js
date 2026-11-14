// JEU DES BILLES — le MENU DU CHOIX DU SAC, ouvert par « Partie de billes » du menu
// principal (main.js) avant de lancer la partie. Un menu vertical (lib/menu.js) : les
// sacs du joueur (ses emplacements occupés, s'il en a : une partie sauvegardée), puis
// les sacs préfaits, puis « Retour » ; Échap revient au menu principal.
//
// Une ligne par sac, son nom et son nombre de billes (« sac 1, 17 billes », « sac du
// Trésor, 15 billes »). Un sac INVALIDE selon les règles de construction de la
// définition lancée et la collection (rules.bagProblems) se dit « invalide » et ne se
// lance pas : Entrée dit son premier problème et leur nombre. Un sac valide referme le
// menu, puis lance la partie avec lui (`onChoose(bag)`) : la quitter ramène au menu
// principal.
//
// Le curseur s'ouvre sur le DERNIER SAC UTILISÉ (store.lastUsed()) s'il existe encore et
// qu'il est valide, sinon sur le premier sac valide.

import { announce } from "../../lib/announce.js";
import { popScreen } from "../../lib/screens.js";
import { playBagSound } from "./bag-sounds.js";
import { bagLineParams, describeLaunchRefusal } from "./narration/bags.js";

// La définition du menu (lib/menu.js). `deps` : `store`, le magasin des sacs du joueur
// (marbles/host/bag-store.js) ; `rules`, les règles du jeu des billes, sacs préfaits
// compris ; `definition`, la définition lancée ; `unlocked`, les billes débloquées ;
// `onChoose(bag)` ; `t`, la traduction.
export function createBagMenu({ store, rules, definition, unlocked, onChoose, t }) {
  const playerBags = store.available() ? store.slots().filter((bag) => bag !== null) : [];
  const bags = [...playerBags, ...Object.values(rules.bags)];
  const problemsOf = bags.map((bag) => rules.bagProblems(bag, definition, unlocked));
  const entries = bags.map((bag, index) => {
    const problems = problemsOf[index];
    if (problems.length > 0) {
      return {
        label: "marbles.bagMenu.line_invalid",
        labelParams: bagLineParams(bag, t),
        onActivate: () => {
          playBagSound("refused");
          announce(describeLaunchRefusal(problems, t), { assertive: true });
        },
      };
    }
    return { label: "marbles.bagMenu.line", labelParams: bagLineParams(bag, t), closesMenu: true, onActivate: () => onChoose(bag) };
  });
  const lastUsed = store.available() ? store.lastUsed() : null;
  const valid = (index) => index >= 0 && problemsOf[index].length === 0;
  const remembered = bags.findIndex((bag) => bag.id === lastUsed);
  const cursor = valid(remembered) ? remembered : Math.max(0, problemsOf.findIndex((problems) => problems.length === 0));
  return {
    title: "marbles.bagMenu.title",
    closable: true,
    cursor,
    entries: [...entries, { label: "marbles.bagMenu.back", onActivate: () => popScreen() }],
  };
}
