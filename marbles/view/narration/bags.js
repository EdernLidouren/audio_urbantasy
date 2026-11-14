// JEU DES BILLES — ce que la vue DIT des sacs (marbles/core/bags.js) : leurs noms,
// leurs problèmes, leurs lignes dans les menus (« Mes sacs », choix du sac au
// lancement), et tout ce que dit l'éditeur (marbles/view/bag-editor.js). Des fonctions
// pures de `t`, sans DOM : les écrans, main.js, les outils et les vérifications s'en
// servent.
//
// LE NOM d'un sac : celui qu'un joueur lui a donné (`name`, aucune saisie aujourd'hui) ;
// sinon, pour un sac du joueur, celui de son emplacement (« sac 1 »,
// `marbles.bagSlot.name`) ; pour un sac préfait, celui de son id
// (`marbles.bag.<id>.name`). En minuscules : la majuscule de début de phrase vient à
// l'annonce.

import { nameRef } from "../../../data/i18n/index.js";
import { MARBLE_FAMILIES, MARBLE_RARITIES, MARBLE_SIZES } from "../../config/values.js";
import { bagSize, slotIndexOf } from "../../core/bags.js";
import { familyNames, familyRef, marbleRef, rarityName, rarityRef, sizeName, sizeRef } from "./effects.js";

// --- Noms et lignes de menu ---

// Le nom générique de l'emplacement `index` (à partir de 0) : « sac 1 ».
export function slotBagName(index, t) {
  return t("marbles.bagSlot.name", { slot: index + 1 });
}

// Le NOM d'un sac (en-tête), texte ou référence : une référence pour un sac préfait
// (jamais traduit d'avance), un texte pour un sac du joueur.
function bagNameParam(bag, t) {
  if (bag.name !== undefined) return bag.name;
  const slot = slotIndexOf(bag.id);
  return slot === null ? nameRef(`marbles.bag.${bag.id}.name`) : slotBagName(slot, t);
}

// Le nom d'un sac, en texte.
export function bagName(bag, t) {
  const name = bagNameParam(bag, t);
  return typeof name === "string" ? name : t(`marbles.bag.${bag.id}.name`);
}

// Les paramètres de la ligne d'un sac dans un menu (`marbles.bagMenu.line`) : « sac du
// Trésor, 15 billes ».
export function bagLineParams(bag, t) {
  return { name: bagNameParam(bag, t), count: bagSize(bag) };
}

// La clé de la ligne d'un emplacement de « Mes sacs » : « sac 1, 17 billes, valide »,
// « emplacement 3, vide ». `valid` : la validité calculée du sac.
export function slotLineKey(bag, valid) {
  if (bag === null) return "marbles.myBags.slot_empty";
  return valid ? "marbles.myBags.slot_valid" : "marbles.myBags.slot_invalid";
}

// Ses paramètres ; `index`, l'emplacement (à partir de 0).
export function slotLineParams(bag, index, t) {
  return bag === null ? { slot: index + 1 } : bagLineParams(bag, t);
}

// --- Les problèmes ---

// Les paramètres du texte d'un problème : le nom d'une bille CONNUE par sa référence
// (le gabarit en choisit la forme : « d'agate ») ; une bille inconnue n'a pas de nom,
// son id se dit tel quel.
function problemParams({ code, ...params }) {
  if (params.marble === undefined || code === "unknownMarble") return params;
  return { ...params, marble: marbleRef(params.marble) };
}

// Un PROBLÈME de sac, lisible à l'oreille : « Trop d'exemplaires de pierre de sang : 2
// sur 1 maximum. »
export function describeBagProblem(problem, t) {
  return t(`marbles.bagProblem.${problem.code}`, problemParams(problem));
}

// Les problèmes d'un sac, à la suite.
function describeBagProblems(problems, t) {
  return problems.map((problem) => describeBagProblem(problem, t)).join(" ");
}

// L'annonce d'une partie refusée pour un sac invalide : la phrase, puis ses problèmes.
export function describeBagRefusal(problems, t) {
  return t("marbles.bagProblem.refused", { problems: describeBagProblems(problems, t) });
}

// Un sac invalide choisi au lancement : son premier problème, et leur nombre.
export function describeLaunchRefusal(problems, t) {
  return t("marbles.bagMenu.refused", { problem: describeBagProblem(problems[0], t), total: problems.length });
}

// --- L'éditeur ---

// Les billes `ids` dans l'ORDRE STABLE de l'éditeur : la famille (sa première, dans
// l'ordre de la roue), puis la rareté (de commune à légendaire), puis le nom dans la
// langue du moment. Une bille inconnue (absente de `types`) va à la fin, par id.
export function sortedMarbles(ids, types, t) {
  const rank = (id) => (Object.hasOwn(types, id) ? [MARBLE_FAMILIES.indexOf(types[id].families[0]), MARBLE_RARITIES.indexOf(types[id].rarity)] : [MARBLE_FAMILIES.length, 0]);
  const name = (id) => (Object.hasOwn(types, id) ? t(`marble.${id}.name`) : id);
  return [...ids].sort((a, b) => {
    const [familyA, rarityA] = rank(a);
    const [familyB, rarityB] = rank(b);
    return familyA - familyB || rarityA - rarityB || name(a).localeCompare(name(b));
  });
}

// Les exemplaires au plus de `marble` selon `rules` (les règles de construction) ;
// sans règle d'exemplaires, `fallback`.
function maxCopiesOf(marble, types, rules, fallback = null) {
  return rules.copies?.[types[marble].rarity] ?? fallback;
}

// Une ligne de la zone Sac : « rubis, 2 sur 2 maximum ». Une bille inconnue :
// « bille inconnue : xyz, 2 exemplaires » ; non débloquée : la ligne, et « non
// débloquée ». `context` : { types, rules, unlocked } (unlocked : une liste, ou null).
export function bagEntryLine({ marble, count }, { types, rules, unlocked }, t) {
  if (!Object.hasOwn(types, marble)) return t("marbles.bagEditor.bag_line_unknown", { marble, count });
  const key = unlocked !== null && !unlocked.includes(marble) ? "marbles.bagEditor.bag_line_locked" : "marbles.bagEditor.bag_line";
  return t(key, { marble: marbleRef(marble), count, max: maxCopiesOf(marble, types, rules, count) });
}

// Une ligne de la zone Collection : « rubis, normale, Trésor, rare. Dans le sac : 2 sur
// 2 ».
export function collectionLine(marble, count, { types, rules }, t) {
  return t("marbles.bagEditor.collection_line", {
    marble: marbleRef(marble),
    size: sizeName(types[marble].size, t),
    families: familyNames(marble, types, t),
    rarity: rarityName(marble, types, t),
    count,
    max: maxCopiesOf(marble, types, rules, count),
  });
}

// Un exemplaire AJOUTÉ : « rubis ajouté, 2 sur 2. Sac : 14 billes. »
export function addedText(marble, count, bag, { types, rules }, t) {
  return t("marbles.bagEditor.added", { marble: marbleRef(marble), count, max: maxCopiesOf(marble, types, rules, count), size: bagSize(bag) });
}

// Un exemplaire RETIRÉ : « rubis retiré, 1 sur 2. Sac : 13 billes. » ; une bille
// inconnue : « bille inconnue xyz retirée, 1 restant. Sac : 13 billes. »
export function removedText(marble, count, bag, { types, rules }, t) {
  if (!Object.hasOwn(types, marble)) return t("marbles.bagEditor.removed_unknown", { marble, count, size: bagSize(bag) });
  return t("marbles.bagEditor.removed", { marble: marbleRef(marble), count, max: maxCopiesOf(marble, types, rules, count), size: bagSize(bag) });
}

// Un REFUS de la gestion des sacs (marbles/core/bag-editing.js/BAG_EDIT_REFUSALS) :
// « Maximum atteint pour rubis : 2. », « Sac plein : 20 billes. » Un emplacement se
// dit par son numéro, à partir de 1.
export function bagEditRefusal({ error, ok, ...params }, types, t) {
  const named = params.marble !== undefined && Object.hasOwn(types, params.marble) ? { ...params, marble: marbleRef(params.marble) } : params;
  const slotted = params.slot !== undefined ? { ...named, slot: params.slot + 1 } : named;
  return t(`marbles.bagEdit.${error}`, slotted);
}

// L'en-tête d'un sac : « 14 billes sur 12 à 20, valide. » ; sans règle de taille :
// « 14 billes, valide. »
export function bagHeadText(bag, status, rules, t) {
  const valid = status.valid ? "yes" : "no";
  if (rules.size === undefined) return t("marbles.bagEditor.head_free", { size: bagSize(bag), valid });
  return t("marbles.bagEditor.head", { size: bagSize(bag), min: rules.size.min, max: rules.size.max, valid });
}

// La RÉPARTITION d'un sac (touche R, après l'en-tête) : par famille (une bille de
// plusieurs familles compte dans chacune), par calibre, par rareté, seulement les
// valeurs non nulles, puis ses billes inconnues.
export function bagSummaryText(bag, status, { types, rules }, t) {
  const known = bag.marbles.filter(({ marble }) => Object.hasOwn(types, marble));
  const unknown = bag.marbles.filter(({ marble }) => !Object.hasOwn(types, marble)).reduce((total, { count }) => total + count, 0);
  const tally = (values, valuesOf, refOf) =>
    values
      .map((value) => ({ value, count: known.filter((entry) => valuesOf(entry.marble).includes(value)).reduce((total, entry) => total + entry.count, 0) }))
      .filter(({ count }) => count > 0)
      .map(({ value, count }) => t("marbles.bagEditor.summary_item", { name: refOf(value), count }));
  const sections = [
    ["families", tally(MARBLE_FAMILIES, (marble) => types[marble].families, familyRef)],
    ["sizes", tally(Object.keys(MARBLE_SIZES).map(Number), (marble) => [types[marble].size], sizeRef)],
    ["rarities", tally(MARBLE_RARITIES, (marble) => [types[marble].rarity], rarityRef)],
  ];
  const parts = [bagHeadText(bag, status, rules, t)];
  for (const [section, items] of sections) if (items.length > 0) parts.push(t(`marbles.bagEditor.summary_${section}`, { items }));
  if (unknown > 0) parts.push(t("marbles.bagEditor.summary_unknown", { count: unknown }));
  return parts.join(" ");
}

// L'annonce d'un FILTRE de la zone Collection : « Filtre : Astres, 5 billes. »
// (`family`, `rarity` : null pour toutes).
export function filterText(family, rarity, count, t) {
  let filter;
  if (family === null && rarity === null) filter = t("marbles.bagEditor.filter_none");
  else if (rarity === null) filter = familyRef(family);
  else if (family === null) filter = rarityRef(rarity);
  else filter = t("marbles.bagEditor.filter_both", { family: familyRef(family), rarity: rarityRef(rarity) });
  return t("marbles.bagEditor.filter", { filter, count });
}

// Un sac ENREGISTRÉ : « sac 1 enregistré, 9 billes, invalide. »
export function savedText(bag, status, t) {
  return t("marbles.bagEditor.saved", { name: bagName(bag, t), count: bagSize(bag), valid: status.valid ? "yes" : "no" });
}
