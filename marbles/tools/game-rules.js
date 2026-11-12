// Boîte à outils des billes : les RÈGLES du jeu, liées une fois pour toutes à la
// table des billes (marbles/core/rules.js). Chaque outil est un programme à part ;
// celui-ci est leur point de composition commun, comme main.js pour le jeu. Pour
// mesurer une autre table (« et si l'argile donnait Vitesse 2 ? »), un outil crée
// ses propres règles avec createMarblesRules(saTable).

import { createMarblesRules } from "../core/rules.js";
import MARBLE_TYPES from "../content/types/index.js";

export const GAME_RULES = createMarblesRules(MARBLE_TYPES);
