// Vérifications du contenu — domaine « i18n-content ». Les VRAIES tables de
// textes du jeu (data/i18n/) passées au moteur de lib/i18n.js : grammaire
// déclarée pour chaque langue, mêmes paramètres d'une langue à l'autre,
// réglage de langue aligné sur les langues chargées, et rendu de gabarits
// du jeu (pluriels, listes, dates, formes de nom). Le moteur lui-même est
// vérifié à part, sur des tables de test (lib/checks/i18n.check.js).
// Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js i18n-content`).

import { parseMessage, normalizeGrammar, messageParams } from "../../lib/i18n/message.js";
import {
  LOCALE_TABLES,
  GRAMMAR,
  t as gameT,
  setLocale,
  getLocale,
  availableLocales,
  nameRef as gameNameRef,
} from "../../data/i18n/index.js";
import { PREF_CONSTRAINTS } from "../../config/preferences.js";

// Espace fine insécable : le séparateur de milliers du français
// (Intl.NumberFormat), et l'espace avant « ; ! ? » des textes français.
const NNBSP = "\u202f";
// Espace insécable : avant « : » dans les textes français (posée par
// tools/check_i18n_parity.py --sort, voir doc/i18n.md/"Typographie").
const NBSP = "\u00a0";

export default function checkI18nContent(run) {
  // --- Vraies données : toutes les tables du jeu se chargent (sinon
  // l'import de data/i18n/index.js aurait déjà levé, avec la liste des
  // fautes), et la grammaire déclarée couvre les deux langues.
  run.same("grammaire déclarée : langues", Object.keys(LOCALE_TABLES).sort(), Object.keys(GRAMMAR).sort());
  run("tables du jeu : une clé se rend", true, typeof gameT("menu.position", { index: 1, total: 2 }) === "string");

  // Parité des PARAMÈTRES entre langues, sur les vraies tables : une même
  // clé utilise les mêmes noms de paramètres dans chaque langue (un
  // « {cout} » au lieu de « {count} » passerait le chargement, puis
  // s'annoncerait tel quel en jeu). Formes de nom et catégories de pluriel
  // restent libres, propres à chaque langue. Référence : le français, comme
  // tools/check_i18n_parity.py.
  {
    const paramsByLocale = {};
    for (const [locale, table] of Object.entries(LOCALE_TABLES)) {
      const grammar = normalizeGrammar(GRAMMAR[locale]);
      paramsByLocale[locale] = {};
      for (const [key, value] of Object.entries(table)) {
        if (typeof value === "string") paramsByLocale[locale][key] = messageParams(parseMessage(value, { locale, grammar }));
      }
    }
    const mismatches = [];
    for (const [locale, keys] of Object.entries(paramsByLocale)) {
      if (locale === "fr") continue;
      for (const [key, reference] of Object.entries(paramsByLocale.fr)) {
        const other = keys[key];
        if (other !== undefined && other.join(",") !== reference.join(",")) {
          mismatches.push(`${key} : fr {${reference.join(", ")}} / ${locale} {${other.join(", ")}}`);
        }
      }
    }
    run.same("tables du jeu : mêmes paramètres dans chaque langue", [], mismatches);
  }

  // Réglage de langue (config/preferences.js, Options > Langue) : "auto"
  // puis exactement les langues chargées, chacune avec son libellé dans
  // chaque langue — une langue ajoutée sans son entrée de réglage, ou
  // l'inverse, échoue ici.
  run.same("réglage de langue : auto + langues chargées", ["auto", ...availableLocales()].sort(), [...PREF_CONSTRAINTS.locale.values].sort());
  run(
    "réglage de langue : libellés présents",
    true,
    PREF_CONSTRAINTS.locale.values.every((value) =>
      Object.values(LOCALE_TABLES).every((table) => typeof table[`menu.options.language.${value}`] === "string")
    )
  );

  // --- Vrais gabarits du jeu : pluriels et date, rendus dans chaque langue
  // (la langue du jeu est toujours remise comme avant).
  const previousLocale = getLocale();
  try {
    checkGameTemplates(run);
  } finally {
    setLocale(previousLocale);
  }
}

// Rend une vraie clé du jeu dans une langue.
function game(locale, key, params) {
  setLocale(locale);
  return gameT(key, params);
}

function checkGameTemplates(run) {
  const date = (locale, day) => game(locale, "time.announce", { hour: "08", minute: "05", day, month: "M", season: "S", year: 1 });

  run("jeu fr : 0 pièce", "0 pièce.", game("fr", "money.announce", { amount: 0 }));
  run("jeu fr : 1 pièce", "1 pièce.", game("fr", "money.announce", { amount: 1 }));
  run("jeu fr : 2 pièces", "2 pièces.", game("fr", "money.announce", { amount: 2 }));
  run("jeu fr : 1 000 000 de pièces", `1${NNBSP}000${NNBSP}000 de pièces.`, game("fr", "money.announce", { amount: 1000000 }));
  run("jeu en : 0 coins", "0 coins.", game("en", "money.announce", { amount: 0 }));
  run("jeu en : 1 coin", "1 coin.", game("en", "money.announce", { amount: 1 }));

  run("jeu fr : un objet apparaît", "Un objet apparaît.", game("fr", "interaction.searchSpawn", { count: 1 }));
  run("jeu fr : 3 objets apparaissent", "3 objets apparaissent.", game("fr", "interaction.searchSpawn", { count: 3 }));
  run("jeu en : an item appears", "An item appears.", game("en", "interaction.searchSpawn", { count: 1 }));
  run("jeu en : 3 items appear", "3 items appear.", game("en", "interaction.searchSpawn", { count: 3 }));
  run("jeu fr : 1 pièce éparpillée", "1 pièce éparpillée tout autour.", game("fr", "interaction.lootSpawn", { count: 1 }));
  run("jeu fr : ramassé 1 pièce", `Ramassé${NBSP}: 1 pièce.`, game("fr", "interaction.pickup", { amount: 1 }));

  run(
    "jeu fr : achat au singulier",
    "Acheter 1 article pour 1 pièce",
    game("fr", "shop.buy.total", { count: 1, total: 1 })
  );
  run(
    "jeu en : achat au pluriel",
    "Buy 2 items for 1,500 coins",
    game("en", "shop.buy.total", { count: 2, total: 1500 })
  );
  run(
    "jeu fr : vente au singulier",
    `Vendu${NBSP}: pomme × 1. 1 pièce encaissée.`,
    game("fr", "shop.sell.done", { details: ["pomme × 1"], total: 1 })
  );
  run(
    "jeu fr : récapitulatif en liste",
    `Acheté${NBSP}: pomme × 2, clé × 1 et LED × 3. 7 pièces dépensées.`,
    game("fr", "shop.buy.done", { details: ["pomme × 2", "clé × 1", "LED × 3"], total: 7 })
  );
  run(
    "jeu en : récapitulatif en liste",
    "Sell 2 items for 4 coins? apple × 1 and key × 1",
    game("en", "shop.sell.confirm.title", { count: 2, total: 4, details: ["apple × 1", "key × 1"] })
  );

  run(
    "jeu fr : oubli d'une scène",
    `Oublier 1 scène visitée${NNBSP}? Son état dans la partie sera perdu`,
    game("fr", "teleport.debug.forgetConfirm", { count: 1 })
  );
  run(
    "jeu en : oubli de deux scènes",
    "Forget 2 visited scenes? Their state in the game will be lost",
    game("en", "teleport.debug.forgetConfirm", { count: 2 })
  );

  run("jeu fr : 1 élément ignoré", "1 élément ignoré", game("fr", "menu.skipped", { count: 1 }));
  run("jeu fr : 3 éléments ignorés", "3 éléments ignorés", game("fr", "menu.skipped", { count: 3 }));
  run("jeu en : 1 item skipped", "1 item skipped", game("en", "menu.skipped", { count: 1 }));

  const travel = (locale, id) => game(locale, "interaction.travelConfirm", { scene: gameNameRef(`scene.${id}.name`) });
  run("jeu fr : partir vers la grand-place", `Partir vers la grand-place${NNBSP}?`, travel("fr", "town_square"));
  run("jeu fr : partir vers la rue commerçante", `Partir vers la rue commerçante${NNBSP}?`, travel("fr", "main_street"));
  run("jeu en : head to the town square", "Head to the town square?", travel("en", "town_square"));
  run("jeu en : head to Main Street", "Head to Main Street?", travel("en", "main_street"));
  run("jeu fr : titre de scène, base sans article", "grand-place", game("fr", "scene.town_square.name"));
  run("jeu en : titre de scène, base", "main street", game("en", "scene.main_street.name"));

  run("jeu fr : date au 1er", "08 h 05, 1er M, S, année 1.", date("fr", 1));
  run("jeu fr : date au 2", "08 h 05, 2 M, S, année 1.", date("fr", 2));
  run.same(
    "jeu en : dates ordinales",
    ["1st", "2nd", "3rd", "11th", "21st", "22nd"],
    [1, 2, 3, 11, 21, 22].map((day) => date("en", day).split(", ")[1].slice("M ".length))
  );
}
