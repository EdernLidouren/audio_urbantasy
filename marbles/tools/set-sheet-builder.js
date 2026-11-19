// BOÎTE À OUTILS DES BILLES — la FICHE DU SET, sa construction (la ligne de commande :
// marbles/tools/set-sheet.js) : un fichier texte qui liste toutes les
// billes du jeu telles qu'elles sont, pour travailler le contenu hors du code (relire,
// annoter, proposer une révision). Générée depuis la table des billes, jamais écrite à
// la main : noms français et anglais, familles, rareté, calibre, usure maximale,
// descriptions (touche V) dans les deux langues, effets tels que la fiche du jeu les
// dit en français (marbles/view/card.js), puis la composition des sacs préfaits.
// Même structure que les fiches de set de l'auteur (dev/gameplay/marbles/).
//
// Pur, sans rien de Node : il se charge aussi dans le navigateur (domaine de
// vérification marbles-tools).

import { getLocale, setLocale, t } from "../../data/i18n/index.js";
import { MARBLES_SETTINGS, MARBLE_FAMILIES, MARBLE_RARITIES, MARBLE_SIZES } from "../config/values.js";
import { PRESET_BAGS } from "../content/bags/index.js";
import { marbleCard } from "../view/card.js";
import { GAME_RULES } from "./game-rules.js";

// Les espaces insécables des textes français deviennent des espaces ordinaires.
const plain = (text) => text.replace(/[  ]/g, " ");
const capitalized = (text) => text[0].toUpperCase() + text.slice(1);
// Un nom anglais en titre : « Snow Globe », « Cat's Eye ».
const titled = (text) => text.split(" ").map(capitalized).join(" ");

// Les CONVENTIONS rappelées en tête de fiche : comment la lire.
const CONVENTIONS = [
  "- Format : Nom FR / Nom EN — famille — rareté — calibre — usure maximale (3 si non précisée).",
  "- Description FR puis EN : texte d'ambiance pur (flavor), lu avec la touche V.",
  '- Effets : tels que le jeu les dit sur la fiche (Ctrl+flèches), dans son ordre : pointe et base, puis les déclencheurs, puis En poche. "Base gauche / Base droite" : variante de base propre à un côté.',
  '- "par bille X active" inclut la bille elle-même si elle en fait partie.',
  '- "Familles différentes" : nombre de familles distinctes parmi les billes comptées ; les Classiques sont une famille comme les autres et comptent ; une bille à plusieurs familles compte pour chacune.',
  '- Montants calculés : "Vitesse +2, +1 par X, maximum +6" = base 2 + 1 × X, plafonné à 6 au total.',
  '- "Sinon" : la clause qui suit joue à la place de la précédente quand sa condition est fausse. Une condition porte sur tout ce qui la précède jusqu\'au point-virgule précédent.',
  "- Toutes les valeurs sont provisoires (pas d'équilibrage à ce stade).",
];

// La date du jour, AAAA-MM-JJ, à l'heure locale.
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// LA FICHE DU SET, un texte. `date` : celle qu'elle dit (aujourd'hui par défaut) ;
// `rules` et `bags` : la table des billes et les sacs préfaits (ceux du jeu par
// défaut). La langue en vigueur est rendue telle qu'elle était.
export function buildSetSheet({ date = today(), rules = GAME_RULES, bags = PRESET_BAGS } = {}) {
  const before = getLocale();
  // Le texte d'une clé dans une langue (la forme de base pour un nom à formes).
  const said = (key, locale) => {
    setLocale(locale);
    return plain(t(key));
  };
  const lines = [];
  try {
    const marbles = Object.keys(rules.types);
    lines.push(
      `BILLES — FICHE DU SET (${marbles.length} billes)`,
      `Généré à partir du jeu le ${date}.`,
      "",
      "CONVENTIONS",
      ...CONVENTIONS,
      "",
      `Familles : ${MARBLE_FAMILIES.map((family) => `${said(`marbles.family.${family}.name`, "fr")} (${said(`marbles.family.${family}.name`, "en")})`).join(", ")}.`,
      `Raretés : ${MARBLE_RARITIES.map((rarity) => `${said(`marbles.rarity.${rarity}.name`, "fr")} (${said(`marbles.rarity.${rarity}.name`, "en")})`).join(", ")}.`,
      ""
    );
    // Les billes, dans l'ordre de la table, une section à chaque changement de famille
    // (la première de la bille).
    let section = null;
    marbles.forEach((marble, index) => {
      const type = rules.types[marble];
      const [family] = type.families;
      if (family !== section) {
        section = family;
        const title = said(`marbles.family.${family}.name`, "fr").toUpperCase();
        lines.push("", `==================== ${family === "classics" ? `${title} (neutre)` : title} ====================`, "");
      }
      const families = type.families.map((id) => said(`marbles.family.${id}.name`, "fr")).join(" et ");
      const maxWear = type.maxWear ?? MARBLES_SETTINGS.defaultMaxWear;
      const wear = maxWear === MARBLES_SETTINGS.defaultMaxWear ? "" : ` — usure ${maxWear}`;
      lines.push(
        `${index + 1}. ${capitalized(said(`marble.${marble}.name`, "fr"))} / ${titled(said(`marble.${marble}.name`, "en"))} — ${families} — ${said(`marbles.rarity.${type.rarity}.name`, "fr")} — ${said(`marbles.size.${MARBLE_SIZES[type.size]}.name`, "fr")}${wear}`,
        `FR : ${said(`marble.${marble}.description`, "fr")}`,
        `EN : ${said(`marble.${marble}.description`, "en")}`
      );
      setLocale("fr");
      const { above, below } = marbleCard(marble, "", rules, t, { timeless: true });
      // Une phase sans effet ne se recopie pas.
      for (const field of [...above, ...below].map(plain)) {
        if (!/: aucun effet\.$/.test(field)) lines.push(field);
      }
      lines.push("");
    });
    // Les sacs préfaits, leur composition.
    lines.push("", "==================== SACS PRÉFAITS ====================", "");
    for (const [id, bag] of Object.entries(bags)) {
      const total = bag.marbles.reduce((sum, entry) => sum + entry.count, 0);
      const content = bag.marbles.map(({ marble, count }) => `${said(`marble.${marble}.name`, "fr")}${count > 1 ? ` ${count}` : ""}`).join(", ");
      lines.push(`${capitalized(said(`marbles.bag.${id}.name`, "fr"))} (${total} billes) : ${content}.`);
    }
  } finally {
    setLocale(before);
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n\n")}\n`;
}
