// BOÎTE À OUTILS DES BILLES — les COMMANDES texte communes au kit de partie
// (play.js) et aux cas construits (case.js) : une ligne « poser 1 pointe »
// devient une action du réducteur (core/marbles.js). Pur, sans Node.
//
//   poser | place <n> <empl.>        pose la bille n de la main (à partir de 1)
//   echanger | swap <empl.> <empl.>  échange deux emplacements
//   piocher | draw                   pioche du tour
//   resoudre | resolve               résolution seule, sans la pioche qui suit
//   prevoir | forecast | r [<n> <empl.>]  prévision, rien ne bouge
// Emplacements : gauche (g, left), droite (d, right), pointe (p, apex).

export const SLOT_ALIASES = {
  gauche: "leftBase",
  g: "leftBase",
  left: "leftBase",
  leftbase: "leftBase",
  droite: "rightBase",
  d: "rightBase",
  right: "rightBase",
  rightbase: "rightBase",
  pointe: "apex",
  p: "apex",
  apex: "apex",
};

const slotOf = (word) => SLOT_ALIASES[word?.toLowerCase()];
const handIndexOf = (word) => (/^\d+$/.test(word ?? "") ? Number(word) - 1 : undefined);

// Une ligne -> { kind, action?, error? } :
//   kind "action"   : `action` à passer au réducteur ;
//   kind "forecast" : `action` la pose envisagée, ou null pour le triangle actuel ;
//   kind "other"    : une commande propre à l'outil (le premier mot, `word`) ;
//   kind "error"    : `error`, l'usage attendu.
export function parseCommand(line) {
  const [word = "", ...params] = line.trim().split(/\s+/);
  switch (word.toLowerCase()) {
    case "poser":
    case "place": {
      const handIndex = handIndexOf(params[0]);
      const slot = slotOf(params[1]);
      if (handIndex === undefined || !slot) return { kind: "error", error: "Usage : poser <n> <gauche|droite|pointe>" };
      return { kind: "action", action: { type: "place", handIndex, slot } };
    }
    case "echanger":
    case "swap": {
      const a = slotOf(params[0]);
      const b = slotOf(params[1]);
      if (!a || !b) return { kind: "error", error: "Usage : echanger <gauche|droite|pointe> <gauche|droite|pointe>" };
      return { kind: "action", action: { type: "swap", a, b } };
    }
    case "piocher":
    case "draw":
      return { kind: "action", action: { type: "draw" } };
    case "resoudre":
    case "resolve":
      return { kind: "action", action: { type: "resolve" } };
    case "prevoir":
    case "forecast":
    case "r": {
      if (params.length === 0) return { kind: "forecast", action: null };
      const handIndex = handIndexOf(params[0]);
      const slot = slotOf(params[1]);
      if (handIndex === undefined || !slot) return { kind: "error", error: "Usage : prevoir [<n> <gauche|droite|pointe>]" };
      return { kind: "forecast", action: { type: "place", handIndex, slot } };
    }
    default:
      return { kind: "other", word: word.toLowerCase(), params };
  }
}
