// Boîte à outils des billes : les RÈGLES du jeu, liées une fois pour toutes à la
// table des billes (core/marbles-rules.js). Chaque outil est un programme à part ;
// celui-ci est leur point de composition commun, comme main.js pour le jeu. Pour
// mesurer une autre table (« et si l'argile donnait Vitesse 2 ? »), un outil crée
// ses propres règles avec createMarblesRules(saTable).

import { createMarblesRules } from "../../core/marbles-rules.js";
import MARBLE_TYPES from "../../marbles/types/index.js";

export const GAME_RULES = createMarblesRules(MARBLE_TYPES);
