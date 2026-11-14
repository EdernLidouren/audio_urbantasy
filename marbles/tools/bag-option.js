// Boîte à outils des billes : les OPTIONS DE SAC des outils au terminal (simulateur,
// partie au terminal). Pur : la lecture d'un fichier est reçue (`readText`), les
// outils y passent celle de Node, les vérifications un faux disque.
//
//   --bag <id | fichier>   un sac préfait (son id, marbles/content/bags/), ou un sac
//                          décrit dans un fichier : un sac au format du jeu en JSON
//                          ({ id, marbles: [{ marble, count }] }, marbles/core/bags.js),
//                          ou une liste d'ids (JSON, ou texte : ids séparés par
//                          espaces, virgules ou lignes, « # » commente la fin d'une
//                          ligne ; doublons permis, un par exemplaire). Fourni comme
//                          SAC DU JOUEUR, validé selon les règles de construction de la
//                          définition ;
//   --unchecked            avec --bag : sans les règles de construction (un sac hors
//                          taille, trop d'exemplaires) ; une bille inconnue reste
//                          refusée ;
//   --random-bag <n>       un sac GÉNÉRÉ de n billes, tiré dans la table à chaque partie ;
//   --max-copies <n>       avec --random-bag : exemplaires d'une même bille au plus
//                          (sans limite par défaut).
// Sans option : le sac de la définition (le sac de départ pour un sac du joueur).
// -> le choix de sac des outils (marbles/tools/game-rules.js/gameSetup).

import { bagFromList, validateBagFormat } from "../core/bags.js";
import { GAME_RULES } from "./game-rules.js";

// Les options à valeur et sans valeur qu'ajoute la lecture du sac (args.js).
export const BAG_VALUE_OPTIONS = ["--bag", "--random-bag", "--max-copies"];
export const BAG_FLAG_OPTIONS = ["--unchecked"];

function integerOf(value, name) {
  if (!/^\d+$/.test(value)) throw new Error(`${name} attend un entier, pas "${value}".`);
  return Number(value);
}

// Le nom d'un fichier sans son dossier ni son extension, et son extension.
function fileParts(path) {
  const file = path.split(/[\\/]/).at(-1);
  const dot = file.lastIndexOf(".");
  return dot <= 0 ? { stem: file, extension: "" } : { stem: file.slice(0, dot), extension: file.slice(dot) };
}

// Le choix de sac d'après les options lues (`option(nom)`, `flag(nom)` : args.js) ;
// `readText(chemin)` : le texte d'un fichier (une erreur s'il est illisible).
export function readBagChoice(option, flag, readText) {
  const bagValue = option("--bag");
  const randomValue = option("--random-bag");
  const maxCopies = option("--max-copies");
  const unchecked = flag("--unchecked");
  if (bagValue !== undefined && randomValue !== undefined) throw new Error("--bag et --random-bag s'excluent.");
  if (maxCopies !== undefined && randomValue === undefined) throw new Error("--max-copies ne vaut qu'avec --random-bag.");
  if (unchecked && bagValue === undefined) throw new Error("--unchecked ne vaut qu'avec --bag.");
  if (randomValue !== undefined) {
    return { kind: "random", size: integerOf(randomValue, "--random-bag"), maxCopies: maxCopies === undefined ? null : integerOf(maxCopies, "--max-copies") };
  }
  if (bagValue === undefined) return { kind: "definition" };
  if (Object.hasOwn(GAME_RULES.bags, bagValue)) return { kind: "bag", bag: GAME_RULES.bags[bagValue], source: bagValue, unchecked };
  const { stem, extension } = fileParts(bagValue);
  if (extension === "") throw new Error(`sac préfait inconnu "${bagValue}" (connus : ${Object.keys(GAME_RULES.bags).join(", ")}), ou fichier sans extension.`);
  let text;
  try {
    text = readText(bagValue);
  } catch (error) {
    throw new Error(`sac illisible "${bagValue}" : ${error.message}`);
  }
  return { kind: "bag", bag: parseBagText(text, stem), source: bagValue, unchecked };
}

// Un sac décrit en texte (en-tête) ; `id` : celui d'un sac donné en liste. Une forme
// fausse lève ; les billes inconnues se refusent au départ de la partie.
export function parseBagText(text, id) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    const bag = JSON.parse(trimmed);
    validateBagFormat(bag);
    return bag;
  }
  const ids = trimmed.startsWith("[")
    ? JSON.parse(trimmed)
    : text
        .split("\n")
        .map((line) => line.replace(/#.*/, ""))
        .join(" ")
        .split(/[\s,]+/)
        .filter((marble) => marble !== "");
  if (!Array.isArray(ids) || ids.some((marble) => typeof marble !== "string")) throw new Error("un sac en liste est une liste d'ids de billes.");
  return bagFromList(id, ids);
}
