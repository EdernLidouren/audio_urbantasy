// Vérifications de lib/ — domaine « i18n ». Moteur de localisation
// (lib/i18n.js, lib/i18n/message.js) : syntaxe des gabarits, pluriel,
// ordinaux, choix, formes de nom, listes, nombres, et chargement des vraies
// tables du jeu. Lancées par core/checks/index.js/runChecks, comme les
// domaines du core (`node tools/run-checks.js i18n`). Les tables de test
// sont écrites en dur ; seule la dernière section lit les vraies données.

import { createI18n, nameRef } from "../i18n.js";
import { throws } from "../check.js";
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

// Grammaire de test : la forme « def » et un attribut « gender » en
// français ; « def » seule en anglais.
const TEST_GRAMMAR = {
  fr: { forms: ["def"], attributes: { gender: ["m", "f"] } },
  en: { forms: ["def"] },
};

// Moteur de test sur une table fr et une table en, langue choisie.
function engine(fr, en = {}, locale = "fr", grammar = TEST_GRAMMAR) {
  const i18n = createI18n({ fr, en }, { defaultLocale: "en", grammar });
  i18n.setLocale(locale);
  return i18n;
}

// Rend `template` dans une langue, sur une table d'une seule clé posée dans
// CETTE langue seulement (ses catégories de pluriel ne valent pas pour
// l'autre).
function render(locale, template, params, grammar) {
  const table = { k: template };
  return locale === "fr" ? engine(table, {}, "fr", grammar).t("k", params) : engine({}, table, "en", grammar).t("k", params);
}

// Message de l'erreur levée à la construction (ou "accepté").
function loadError(table, locale = "fr", grammar = TEST_GRAMMAR) {
  try {
    createI18n(locale === "fr" ? { fr: table, en: {} } : { fr: {}, en: table }, { grammar });
    return "accepté";
  } catch (error) {
    return error.message;
  }
}

// Avertissements émis pendant `fn` (console.warn remplacé le temps de
// l'appel, toujours restauré).
function warningsOf(fn) {
  const warnings = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = original;
  }
}

// Espace fine insécable : le séparateur de milliers du français
// (Intl.NumberFormat).
const NNBSP = " ";

export default function checkI18n(run) {
  // --- Texte simple et apostrophes : toujours littérales, aucun
  // échappement, y compris collées à un paramètre.
  run("apostrophe seule", "l'hôtel", render("fr", "l'hôtel"));
  run("apostrophe avant un paramètre", "Aujourd'hui, Lou arrive.", render("fr", "Aujourd'hui, {name} arrive.", { name: "Lou" }));
  run("apostrophe juste avant le paramètre", "l'escalier", render("fr", "l'{name}", { name: "escalier" }));
  run("apostrophe juste après le paramètre", "Lou's office", render("en", "{name}'s office", { name: "Lou" }));
  run("apostrophes répétées", "c'est l'heure, aujourd'hui", render("fr", "c'est l'heure, aujourd'hui"));
  run(
    "apostrophe dans une branche",
    "1 pièce d'or",
    render("fr", "{count, plural, one {# pièce d'or} other {# pièces d'or}}", { count: 1 })
  );
  run("dièse hors branche : littéral", "#3", render("fr", "#{n}", { n: "3" }));
  run("espaces autour du nom de paramètre", "Lou", render("fr", "{ name }", { name: "Lou" }));
  run("texte vide", "", render("fr", ""));

  // --- Accolades : aucune accolade littérale, toute accolade isolée ou mal
  // fermée est une erreur au chargement.
  run("accolade ouvrante isolée refusée", true, loadError({ k: "Partir {" }).includes("« k »"));
  run("accolade fermante isolée refusée", true, loadError({ k: "Partir }" }).includes("accolade fermante isolée"));
  run("paramètre non fermé refusé", true, loadError({ k: "Partir vers {scene ?" }) !== "accepté");
  run("branche non fermée refusée", true, loadError({ k: "{n, plural, one {# pièce other {# pièces}}" }) !== "accepté");
  run("bloc non fermé refusé", true, loadError({ k: "{n, plural, one {# pièce} other {# pièces}" }).includes("non fermé"));
  run("type de bloc inconnu refusé", true, loadError({ k: "{n, number}" }).includes("type de bloc inconnu"));
  run(
    "fautes rassemblées : toutes nommées",
    true,
    (() => {
      const message = loadError({ a: "x {", b: "y }", c: "ok" });
      return message.includes("2 texte(s)") && message.includes("« a »") && message.includes("« b »");
    })()
  );

  // --- Pluriel (ICU) : catégories de la langue, « other » obligatoire,
  // « =N » prioritaire, « # » formaté.
  const coins = "{n, plural, one {# pièce} many {# de pièces} other {# pièces}}";
  run("pluriel fr : 0 au singulier", "0 pièce", render("fr", coins, { n: 0 }));
  run("pluriel fr : 1", "1 pièce", render("fr", coins, { n: 1 }));
  run("pluriel fr : 2", "2 pièces", render("fr", coins, { n: 2 }));
  run("pluriel fr : million rond -> many", `1${NNBSP}000${NNBSP}000 de pièces`, render("fr", coins, { n: 1000000 }));
  run("pluriel fr : million et un -> other", `1${NNBSP}000${NNBSP}001 pièces`, render("fr", coins, { n: 1000001 }));
  const enCoins = "{n, plural, one {# coin} other {# coins}}";
  run("pluriel en : 0 au pluriel", "0 coins", render("en", enCoins, { n: 0 }));
  run("pluriel en : 1", "1 coin", render("en", enCoins, { n: 1 }));
  run("pluriel en : milliers", "1,500 coins", render("en", enCoins, { n: 1500 }));
  run("pluriel : =0 prioritaire", "aucune pièce", render("fr", "{n, plural, =0 {aucune pièce} one {# pièce} other {# pièces}}", { n: 0 }));
  run("pluriel sans other refusé", true, loadError({ k: "{n, plural, one {# pièce}}" }).includes("other"));
  run("catégorie inconnue de la langue refusée (few en fr)", true, loadError({ k: "{n, plural, few {#} other {#}}" }).includes("few"));
  run("catégorie connue d'une langue acceptée (few en ru)", "accepté", (() => {
    try {
      createI18n({ ru: { k: "{n, plural, one {#} few {#} many {#} other {#}}" } }, { defaultLocale: "ru" });
      return "accepté";
    } catch (error) {
      return error.message;
    }
  })());
  run("branche en double refusée", true, loadError({ k: "{n, plural, one {a} one {b} other {c}}" }).includes("deux fois"));
  run("plural sur une forme refusé", true, loadError({ k: "{n:def, plural, other {#}}" }) !== "accepté");
  run(
    "deux blocs côte à côte acceptés",
    "Acheter 1 article pour 3 pièces",
    render("fr", "Acheter {count, plural, one {# article} other {# articles}} pour {total, plural, one {# pièce} other {# pièces}}", {
      count: 1,
      total: 3,
    })
  );
  run(
    "paramètre dans une branche",
    "3 pommes pour Lou",
    render("fr", "{n, plural, one {# pomme pour {name}} other {# pommes pour {name}}}", { n: 3, name: "Lou" })
  );
  run("bloc imbriqué refusé", true, loadError({ k: "{n, plural, other {{m, plural, other {#}}}}" }).includes("imbriqué"));
  run("liste imbriquée refusée", true, loadError({ k: "{n, plural, other {{items, list}}}" }).includes("imbriqué"));

  // --- Ordinaux (selectordinal) : règles ordinales de la langue.
  const frDay = "{day, selectordinal, one {#er} other {#}} janvier";
  run("ordinal fr : 1er", "1er janvier", render("fr", frDay, { day: 1 }));
  run("ordinal fr : 2", "2 janvier", render("fr", frDay, { day: 2 }));
  run("ordinal fr : 21", "21 janvier", render("fr", frDay, { day: 21 }));
  const enDay = "January {day, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}";
  const enOrdinals = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map((day) => render("en", enDay, { day }).slice("January ".length));
  run.same("ordinaux en", ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd"], enOrdinals);
  run("ordinal : catégorie inconnue refusée (two en fr)", true, loadError({ k: "{d, selectordinal, two {#} other {#}}" }).includes("two"));

  // --- Choix (select) : sur un paramètre chaîne, ou sur un attribut de nom.
  const side = "{side, select, recto {devant} verso {derrière} other {ailleurs}}";
  run("select : branche choisie", "derrière", render("fr", side, { side: "verso" }));
  run("select : valeur inconnue -> other", "ailleurs", render("fr", side, { side: "toit" }));
  run("select sans other refusé", true, loadError({ k: "{side, select, recto {devant}}" }).includes("other"));
  run("select : =N refusé", true, loadError({ k: "{side, select, =1 {a} other {b}}" }) !== "accepté");
  {
    const i18n = engine({
      "item.lamp.name": { base: "lampe", def: "la lampe", gender: "f" },
      "item.box.name": { base: "carton", def: "le carton", gender: "m" },
      heavy: "{item:gender, select, f {Elle est trop lourde.} other {Il est trop lourd.}}",
    });
    run("select sur attribut : féminin", "Elle est trop lourde.", i18n.t("heavy", { item: nameRef("item.lamp.name") }));
    run("select sur attribut : masculin -> other", "Il est trop lourd.", i18n.t("heavy", { item: nameRef("item.box.name") }));
  }
  run(
    "select sur attribut : valeur non déclarée refusée",
    true,
    loadError({ k: "{item:gender, select, n {a} other {b}}" }).includes("« n »")
  );
  run("select sur attribut non déclaré refusé", true, loadError({ k: "{item:color, select, other {a}}" }).includes("color"));
  run("attribut affiché seul refusé", true, loadError({ k: "{item:gender}" }).includes("ne s'affiche pas"));

  // --- Formes de nom (extension) : chaîne = base ; objet = base + formes
  // déclarées ; t() d'un nom rend sa base.
  {
    const fr = {
      "scene.square.name": { base: "grand-place", def: "la grand-place" },
      "scene.alley.name": "ruelle",
      travel: "Partir vers {scene:def} ?",
      title: "{scene}",
    };
    const en = {
      "scene.square.name": { base: "town square", def: "the town square" },
      "scene.alley.name": "alley",
      travel: "Head to {scene:def}?",
      title: "{scene}",
    };
    const i18n = engine(fr, en);
    run("forme : def en fr", "Partir vers la grand-place ?", i18n.t("travel", { scene: nameRef("scene.square.name") }));
    run("forme : base par t() direct", "grand-place", i18n.t("scene.square.name"));
    run("forme : base par {scene}", "grand-place", i18n.t("title", { scene: nameRef("scene.square.name") }));
    run("forme : nom en chaîne, base", "ruelle", i18n.t("title", { scene: nameRef("scene.alley.name") }));
    const fallback = warningsOf(() => i18n.t("travel", { scene: nameRef("scene.alley.name") }));
    run("forme absente : repli sur la base", "Partir vers ruelle ?", fallback.result);
    run("forme absente : signalée", true, fallback.warnings.some((w) => w.includes("forme « def » absente")));
    const notRef = warningsOf(() => i18n.t("travel", { scene: "grand-place" }));
    run("forme sur une chaîne : rendue telle quelle", "Partir vers grand-place ?", notRef.result);
    run("forme sur une chaîne : signalée", true, notRef.warnings.some((w) => w.includes("nameRef")));
    i18n.setLocale("en");
    run("forme : def en en", "Head to the town square?", i18n.t("travel", { scene: nameRef("scene.square.name") }));
    run("forme : nom propre en milieu de phrase", "Head to Main Street?", engine({}, {
      "scene.main.name": { base: "main street", def: "Main Street" },
      travel: "Head to {scene:def}?",
    }, "en").t("travel", { scene: nameRef("scene.main.name") }));
  }
  run("forme non déclarée dans un gabarit refusée", true, loadError({ k: "{scene:acc}" }).includes("« acc » non déclarée"));
  run("forme non déclarée dans un objet refusée", true, loadError({ n: { base: "pomme", Def: "la pomme" } }).includes("Def"));
  run("objet sans base refusé", true, loadError({ n: { def: "la pomme" } }).includes("base"));
  run("objet à base vide refusé", true, loadError({ n: { base: "" } }).includes("base"));
  run("forme avec accolade refusée", true, loadError({ n: { base: "pomme", def: "la {pomme}" } }).includes("accolade"));
  run("valeur d'attribut non déclarée refusée", true, loadError({ n: { base: "pomme", gender: "n" } }).includes("« n »"));
  run("forme d'une autre langue refusée (gender en en)", true, loadError({ n: { base: "apple", gender: "f" } }, "en").includes("gender"));
  run("grammaire : forme nommée base refusée", true, loadError({}, "fr", { fr: { forms: ["base"] } }).includes("base"));
  run("grammaire : langue inconnue refusée", true, loadError({}, "fr", { de: { forms: [] } }).includes("« de »"));
  run("grammaire : champ inconnu refusé", true, loadError({}, "fr", { fr: { cases: [] } }).includes("cases"));

  // --- Nombres : un nombre est formaté à la langue, une chaîne jamais.
  run("nombre formaté fr", `1${NNBSP}500 pièces`, render("fr", "{n} pièces", { n: 1500 }));
  run("décimale fr", "x0,5", render("fr", "x{n}", { n: 0.5 }));
  run("nombre formaté en", "1,500 coins", render("en", "{n} coins", { n: 1500 }));
  run("chaîne jamais reformatée", "12.50", render("fr", "{x}", { x: "12.50" }));

  // --- Listes (extension) : Intl.ListFormat de la langue.
  const list = "{items, list}";
  run("liste fr : un élément", "pomme", render("fr", list, { items: ["pomme"] }));
  run("liste fr : deux éléments", "pomme et clé", render("fr", list, { items: ["pomme", "clé"] }));
  run("liste fr : trois éléments", "pomme × 2, clé et LED × 3", render("fr", list, { items: ["pomme × 2", "clé", "LED × 3"] }));
  run("liste en : trois éléments", "apple, key, and LED", render("en", list, { items: ["apple", "key", "LED"] }));
  run("liste avec forme refusée", true, loadError({ k: "{items:def, list}" }) !== "accepté");

  // --- Paramètres manquants : laissés tels quels, signalés, jamais une
  // exception.
  {
    const missing = warningsOf(() => render("fr", "Partir vers {scene} ?", {}));
    run("paramètre manquant laissé tel quel", "Partir vers {scene} ?", missing.result);
    run("paramètre manquant signalé", true, missing.warnings.length === 1);
    run("pluriel sans nombre : other", "? pièces", warningsOf(() => render("fr", coins, { n: "?" })).result);
  }

  // --- Sortie des avertissements remplaçable (setWarningHandler) : le
  // handler reçoit le message brut, la console n'est plus appelée.
  {
    const i18n = engine({ k: "Partir vers {scene} ?" });
    const received = [];
    i18n.setWarningHandler((message) => received.push(message));
    const output = warningsOf(() => i18n.t("k", {}));
    run("handler : texte toujours rendu", "Partir vers {scene} ?", output.result);
    run("handler : reçoit l'avertissement", true, received.length === 1 && received[0].includes("{scene}") && received[0].includes('clé "k"'));
    run("handler : message sans préfixe", false, received[0].startsWith("i18n:"));
    run("handler : la console n'est plus appelée", 0, output.warnings.length);
    i18n.t("absente");
    run("handler : clé introuvable aussi", true, received.some((message) => message.includes('clé "absente" introuvable')));
  }

  // --- Repli de langue : un gabarit de repli garde les règles de SA langue.
  {
    const i18n = engine({}, { k: "{n, plural, one {# coin} other {# coins}}" }, "fr");
    run("repli en : pluriel anglais à 0", "0 coins", warningsOf(() => i18n.t("k", { n: 0 })).result);
  }

  // --- Vraies données : toutes les tables du jeu se chargent (sinon
  // l'import de data/i18n/index.js aurait déjà levé, avec la liste des
  // fautes), et la grammaire déclarée couvre les deux langues.
  run.same("grammaire déclarée : langues", Object.keys(LOCALE_TABLES).sort(), Object.keys(GRAMMAR).sort());
  run("tables du jeu : une clé se rend", true, typeof gameT("menu.position", { index: 1, total: 2 }) === "string");
  run("throws disponible", true, throws(() => createI18n({ fr: { k: "{" } })));

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
  run("jeu fr : ramassé 1 pièce", "Ramassé : 1 pièce.", game("fr", "interaction.pickup", { amount: 1 }));

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
    "Vendu : pomme × 1. 1 pièce encaissée.",
    game("fr", "shop.sell.done", { details: ["pomme × 1"], total: 1 })
  );
  run(
    "jeu fr : récapitulatif en liste",
    "Acheté : pomme × 2, clé × 1 et LED × 3. 7 pièces dépensées.",
    game("fr", "shop.buy.done", { details: ["pomme × 2", "clé × 1", "LED × 3"], total: 7 })
  );
  run(
    "jeu en : récapitulatif en liste",
    "Sell 2 items for 4 coins? apple × 1 and key × 1",
    game("en", "shop.sell.confirm.title", { count: 2, total: 4, details: ["apple × 1", "key × 1"] })
  );

  run(
    "jeu fr : oubli d'une scène",
    "Oublier 1 scène visitée ? Son état dans la partie sera perdu",
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
  run("jeu fr : partir vers la grand-place", "Partir vers la grand-place ?", travel("fr", "town_square"));
  run("jeu fr : partir vers la rue commerçante", "Partir vers la rue commerçante ?", travel("fr", "main_street"));
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
