// Vérifications du core — domaine « marbles-families ». Les FAMILLES et les RARETÉS
// des billes (marbles/config/values.js/MARBLE_FAMILIES, MARBLE_RARITIES ;
// doc/marbles.md, « Familles et raretés ») : leur validation au chargement, les
// filtres (cible « toutes », source d'un modificateur de statut, nombre de billes
// d'une zone), les conditions d'emplacement (famille, rareté, calibre relatif), les
// sources de montant (nombre de billes filtré, familles différentes), dans la partie,
// la fiche et la prévision ; et ce qu'en dit la vue (annonce d'une bille hors du
// triangle, touche F). Sur des billes fabriquées, une bicolore comprise. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-families`).

import { throws } from "../../lib/check.js";
import { LOCALE_TABLES, getLocale, setLocale, t as realT } from "../../data/i18n/index.js";
import { LARGE, MARBLE_FAMILIES, MARBLE_RARITIES, MEDIUM, SMALL } from "../config/values.js";
import { NEXT_SLOT, allActive, eject, familyAt, familyCount, familyIs, rarityAt, rarityIs, sizeAt, sizeIs, speed, zoneCount } from "../content/effects.js";
import { CONDITIONS, UNKNOWN_MARBLE, amountOf, distinctFamilies, passesFilters } from "../core/effects.js";
import { validateMarbleTypes } from "../core/validation.js";
import { modifyStat } from "../core/statuses.js";
import { marbleCard } from "../view/card.js";
import { describePrinted, cardSituation, marbleListLine } from "../view/narration.js";
import { identityText } from "../view/marble-info.js";
import { fixtureRules } from "./fixtures/marbles.js";
import { caughtMessage, fabricatedRules, forecastMatches, inHand, keyText as t, marblesPlayState, mustReduce, placed, statusInstance, triangleOf, validateTable, withSizes } from "./helpers.js";

export default function checkMarblesFamilies(run) {
  run.section("déclarations et validation", checkDeclarations);
  run.section("filtres", checkFilters);
  run.section("conditions", checkConditions);
  run.section("sources de montant", checkSources);
  run.section("textes", checkTexts);
}

// La table de ces vérifications : des billes de chaque sorte, et une BICOLORE (Brume et
// Astres), qui compte pour chacune de ses familles.
const TABLE = {
  plain: {},
  mist: { families: ["mist"], rarity: "rare", size: SMALL },
  stars: { families: ["stars"], rarity: "epic", size: LARGE },
  bicolor: { families: ["mist", "stars"], rarity: "rare" },
};

function checkDeclarations(run) {
  run.same("familles : six, dans l'ordre de la roue, puis les Classiques", ["treasure", "stars", "mist", "bestiary", "blast", "classics"], [...MARBLE_FAMILIES]);
  run.same("raretés : cinq, de la plus commune à la plus rare", ["common", "uncommon", "rare", "epic", "legendary"], [...MARBLE_RARITIES]);

  // Ces tables-là ne passent pas par withSizes : c'est la validation des champs
  // obligatoires qu'on vérifie.
  const complete = { size: MEDIUM, families: ["mist"], rarity: "rare" };
  const refused = (name, type, reason) => run(`validation, refusée : ${name}`, true, caughtMessage(() => validateMarbleTypes({ a: type })).includes(reason));
  run("validation : une bille complète acceptée", false, throws(() => validateMarbleTypes({ a: complete })));
  run("validation : une bicolore acceptée", false, throws(() => validateMarbleTypes({ a: { ...complete, families: ["mist", "stars"] } })));
  run("validation : les Classiques, une famille comme une autre", false, throws(() => validateMarbleTypes({ a: { ...complete, families: ["classics"] } })));
  refused("sans familles", { size: MEDIUM, rarity: "rare" }, "families");
  refused("liste de familles vide", { ...complete, families: [] }, "families");
  refused("une famille en texte, pas en liste", { ...complete, families: "mist" }, "families");
  refused("famille inconnue", { ...complete, families: ["fire"] }, "famille inconnue");
  refused("famille en double", { ...complete, families: ["mist", "mist"] }, "double");
  refused("sans rareté", { size: MEDIUM, families: ["mist"] }, "rareté");
  refused("rareté inconnue", { ...complete, rarity: "mythic" }, "rareté");
  refused("deux raretés", { ...complete, rarity: ["rare", "epic"] }, "rareté");
}

function checkFilters(run) {
  const types = withSizes(TABLE);
  run.same(
    "filtre de famille : la bicolore passe ses deux familles, pas une autre",
    [true, true, false],
    ["mist", "stars", "classics"].map((family) => passesFilters("bicolor", [familyIs(family)], types))
  );
  run.same("filtre de rareté : exacte, « rare » ne vise pas une épique", [true, false], ["mist", "stars"].map((marble) => passesFilters(marble, [rarityIs("rare")], types)));
  run("filtre : une bille inconnue (à l'aveugle) ne passe aucun filtre", false, passesFilters(UNKNOWN_MARBLE, [familyIs("mist")], types));
  run("filtre : sans filtre, une bille inconnue passe", true, passesFilters(UNKNOWN_MARBLE, [], types));

  // La cible « toutes », filtrée par famille, puis par rareté, en partie.
  const made = fabricatedRules({
    ...TABLE,
    mistPurger: { apex: [eject(allActive(familyIs("mist")))] },
    rarePurger: { apex: [eject(allActive(rarityIs("rare")))] },
  });
  const ejected = (purger) =>
    mustReduce(made, marblesPlayState(made, { triangle: triangleOf(placed("bicolor"), placed("stars"), placed(purger)) }), { type: "resolve" })
      .events.filter((event) => event.type === "eject")
      .map((event) => event.marble);
  run.same("toutes les Brume actives : la bicolore, pas l'Astres", ["bicolor"], ejected("mistPurger"));
  run.same("toutes les rares actives : la bicolore, pas l'épique", ["bicolor"], ejected("rarePurger"));

  // Validation : un seul filtre à la fois, une famille et une rareté connues.
  run("validation : deux filtres refusés", true, caughtMessage(() => validateTable({ a: { apex: [eject(allActive(familyIs("mist"), rarityIs("rare")))] } })).includes("un seul filtre"));
  run("validation : filtre de famille inconnue refusé", true, throws(() => validateTable({ a: { apex: [eject(allActive(familyIs("fire")))] } })));
  run("validation : filtre de rareté inconnue refusé", true, throws(() => validateTable({ a: { apex: [eject(allActive(rarityIs("mythic")))] } })));

  // La source d'un modificateur de statut, filtrée par famille : seules les valeurs
  // d'une bille de la famille sont modifiées.
  const statuses = {
    mistBoost: { stacking: "unique", duration: { kind: "game" }, behaviors: [{ type: "modifier", point: "speedGain", operation: "add", value: 2, filters: [familyIs("mist")] }] },
  };
  const source = (marble) => ({ marble, matches: (filters) => passesFilters(marble, filters, types) });
  const boost = [statusInstance("mistBoost", { remaining: null })];
  run("source filtrée par famille : une bicolore Brume, modifiée", 5, modifyStat(boost, statuses, "speed", 3, source("bicolor")).value);
  run("source filtrée par famille : une Astres, intacte", 3, modifyStat(boost, statuses, "speed", 3, source("stars")).value);
  const boosted = fixtureRules(withSizes({ ...TABLE, mistSpeed: { families: ["mist"], apex: [speed(1)] } }), statuses);
  const effect = mustReduce(boosted, marblesPlayState(boosted, { triangle: triangleOf(null, null, placed("mistSpeed")), statuses: boost }), { type: "resolve" }).events.find((event) => event.type === "effect");
  run("source filtrée par famille : en partie, Vitesse +1 devenue +3", 3, effect.speedDelta);
}

function checkConditions(run) {
  const types = withSizes(TABLE);
  const triangle = triangleOf(placed("plain"), placed("bicolor"), placed("stars"));
  const test = (when) => CONDITIONS[when.type].test(when, { triangle }, types);
  run.same("famille d'un emplacement : la bicolore est Brume et Astres, pas Classiques", [true, true, false], ["mist", "stars", "classics"].map((family) => test(familyAt("rightBase", family))));
  run("famille d'un emplacement : les Classiques comptent", true, test(familyAt("leftBase", "classics")));
  run("famille d'un emplacement vide : non", false, CONDITIONS.familyAt.test(familyAt("apex", "mist"), { triangle: triangleOf(null, null, null) }, types));
  run.same("rareté d'un emplacement : exacte", [true, false], ["epic", "rare"].map((rarity) => test(rarityAt("apex", rarity))));

  // Relatives, en partie : la bille de la base droite lit l'emplacement suivant, la
  // base gauche.
  const made = fabricatedRules({
    ...TABLE,
    mistWatcher: { base: [{ ...speed(2), when: familyAt(NEXT_SLOT, "mist") }] },
    rareWatcher: { base: [{ ...speed(2), when: rarityAt(NEXT_SLOT, "rare") }] },
    // La Tornade : Éjecter la bille de l'emplacement suivant si c'est une minibille.
    tornado: { base: [{ ...eject(NEXT_SLOT), when: sizeAt(NEXT_SLOT, SMALL) }] },
  });
  const speedOf = (watcher, next) =>
    mustReduce(made, marblesPlayState(made, { triangle: triangleOf(placed(next), placed(watcher), null) }), { type: "resolve" })
      .events.find((event) => event.type === "effect" && event.marble === watcher).speedDelta;
  run.same("famille relative : l'emplacement suivant Brume, oui ; Classiques, non", [2, 0], ["bicolor", "plain"].map((next) => speedOf("mistWatcher", next)));
  run.same("rareté relative : l'emplacement suivant rare, oui ; épique, non", [2, 0], ["mist", "stars"].map((next) => speedOf("rareWatcher", next)));
  const ejects = (next) =>
    mustReduce(made, marblesPlayState(made, { triangle: triangleOf(placed(next), placed("tornado"), null) }), { type: "resolve" }).events.some((event) => event.type === "eject");
  run.same("calibre relatif (la Tornade) : une minibille suivante éjectée, un calot non", [true, false], ["mist", "stars"].map(ejects));

  // Validation : un emplacement relatif sans référence (l'Éveil) ; une famille et une
  // rareté connues.
  run("validation : famille relative à l'Éveil refusée", true, throws(() => validateTable({ a: { awaken: [{ ...speed(1), when: familyAt(NEXT_SLOT, "mist") }] } })));
  run("validation : famille relative en base, permise", false, throws(() => validateTable({ a: { base: [{ ...speed(1), when: familyAt(NEXT_SLOT, "mist") }] } })));
  run("validation : condition de famille inconnue refusée", true, throws(() => validateTable({ a: { apex: [{ ...speed(1), when: familyAt("leftBase", "fire") }] } })));
  run("validation : condition de rareté inconnue refusée", true, throws(() => validateTable({ a: { apex: [{ ...speed(1), when: rarityAt("leftBase", "mythic") }] } })));
}

function checkSources(run) {
  const made = fabricatedRules({
    ...TABLE,
    // Vitesse +2 par famille différente sur le triangle, maximum +6.
    diverse: { apex: [speed({ base: 0, step: 2, source: familyCount(), max: 6 })] },
    // Usée à sa première phase : son Final compte les familles, elle en partance.
    leaver: { families: ["blast"], maxWear: 1, final: [speed({ base: 0, step: 1, source: familyCount() })] },
    // Vitesse +1 par Brume à la défausse.
    pearl: { apex: [speed({ base: 0, step: 1, source: zoneCount("discard", familyIs("mist")) })] },
  });
  const situation = (over) => ({ state: marblesPlayState(made, over) });
  const value = (source, over) => amountOf({ base: 0, step: 1, source }, situation(over), made.types);

  // Le nombre de billes d'une zone, filtré.
  const zones = { discard: ["mist", "bicolor", "stars", "plain"], hand: inHand(["mist", "stars", "bicolor"]), triangle: triangleOf(placed("mist"), placed("plain"), placed("bicolor")) };
  run("par Brume à la défausse : la bicolore comptée", 2, value(zoneCount("discard", familyIs("mist")), zones));
  run("par bille rare en main", 2, value(zoneCount("hand", rarityIs("rare")), zones));
  run("par minibille active", 1, value(zoneCount("triangle", sizeIs(SMALL)), zones));
  run("par Classiques active", 1, value(zoneCount("triangle", familyIs("classics")), zones));

  // Les familles différentes : Classiques comprises, une bicolore pour chacune.
  run("familles différentes : distinctFamilies, chaque famille une fois", 3, distinctFamilies(["plain", "mist", "bicolor", "stars"], made.types));
  run("familles différentes : Classiques, Brume, et Astres par la bicolore", 3, value(familyCount(), { triangle: triangleOf(placed("plain"), placed("mist"), placed("bicolor")) }));
  run("familles différentes : deux Brume, une seule famille", 1, value(familyCount(), { triangle: triangleOf(placed("mist"), placed("mist"), null) }));
  run("familles différentes : triangle vide, aucune", 0, value(familyCount(), {}));
  const diverse = (triangle) => mustReduce(made, marblesPlayState(made, { triangle }), { type: "resolve" }).events.find((event) => event.type === "effect" && event.marble === "diverse").speedDelta;
  run("en partie : elle-même comprise, Classiques et Astres, Vitesse +4", 4, diverse(triangleOf(null, placed("stars"), placed("diverse"))));
  run("en partie : le maximum, +6", 6, diverse(triangleOf(placed("bicolor"), placed("plain"), placed("diverse"))));
  // En transit, une bille ne compte pas : à son Final, la bille usée est en partance.
  const final = mustReduce(made, marblesPlayState(made, { triangle: triangleOf(placed("stars"), null, placed("leaver")) }), { type: "resolve" });
  run("transit : à son Final, la bille en partance ne compte pas (Astres seule)", 1, final.events.find((event) => event.type === "effect" && event.trigger === "final").speedDelta);

  // La prévision, égale au réel.
  const posing = marblesPlayState(made, { hand: inHand(["bicolor"]), triangle: triangleOf(placed("plain"), null, placed("diverse")), discard: ["mist"] });
  run("prévision : familles différentes, égale au réel", true, forecastMatches(made, posing, { type: "place", handIndex: 0, slot: "leftBase" }));
  const pearl = marblesPlayState(made, { hand: inHand(["plain"]), triangle: triangleOf(null, null, placed("pearl")), discard: ["mist", "bicolor"] });
  run("prévision : Brume à la défausse, égale au réel", true, forecastMatches(made, pearl, { type: "place", handIndex: 0, slot: "rightBase" }));

  // Validation.
  run("validation : un nombre de billes à deux filtres refusé", true, throws(() => validateTable({ a: { apex: [speed({ base: 0, step: 1, source: zoneCount("hand", familyIs("mist"), sizeIs(SMALL)) })] } })));
  run("validation : familles différentes, champ inconnu refusé", true, throws(() => validateTable({ a: { apex: [speed({ base: 0, step: 1, source: { type: "familyCount", zone: "hand" } })] } })));
}

function checkTexts(run) {
  const made = fabricatedRules({
    ...TABLE,
    galaxy: { apex: [speed({ base: 0, step: 2, source: zoneCount("triangle", familyIs("stars")), max: 6 })] },
    agate: { apex: [speed({ base: 0, step: 2, source: familyCount(), max: 6 })] },
    rareCount: { apex: [speed({ base: 0, step: 1, source: zoneCount("hand", rarityIs("rare")) })] },
    smallCount: { apex: [speed({ base: 0, step: 1, source: zoneCount("bag", sizeIs(SMALL)) })] },
    watcher: { base: [{ ...speed(2), when: familyAt(NEXT_SLOT, "mist") }], apex: [{ ...speed(1), when: rarityAt("leftBase", "epic") }] },
  });
  const game = marblesPlayState(made, { triangle: triangleOf(placed("stars"), placed("bicolor"), placed("galaxy")) });
  run(
    "fiche : par Astres active, maximum +6, actuellement +4 (la bicolore comptée ; la bille elle-même, Classiques, non)",
    "card.apex{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_zone_family{effect: effect.combined{parts: [effect.speed_up{amount: 2}]}, zone: triangle, family: <family.stars.name>}, max: +6}, current: +4}]}}",
    marbleCard("galaxy", "x", made, t, { game }).above[0]
  );
  run(
    "fiche : par famille différente sur le triangle",
    "card.apex{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_family{effect: effect.combined{parts: [effect.speed_up{amount: 2}]}}, max: +6}, current: +6}]}}",
    marbleCard("agate", "x", made, t, { game }).above[0]
  );
  run("fiche hors partie : sans valeur actuelle", false, marbleCard("agate", "x", made, t).above[0].includes("computed_current"));
  run("fiche : par bille rare en main", true, marbleCard("rareCount", "x", made, t).above[0].includes("effect.per_zone_rarity{effect: effect.combined{parts: [effect.speed_up{amount: 1}]}, zone: hand, rarity: <rarity.rare.name>}"));
  run("fiche : par minibille dans le sac", true, marbleCard("smallCount", "x", made, t).above[0].includes("effect.per_zone_size{effect: effect.combined{parts: [effect.speed_up{amount: 1}]}, zone: bag, size: <size.small.name>}"));

  // Les phrases, dans chaque langue.
  const locale = getLocale();
  const sentences = {};
  try {
    for (const lang of Object.keys(LOCALE_TABLES)) {
      setLocale(lang);
      const say = (marble, slot = "apex") => describePrinted(made.effectAt(marble, slot), cardSituation(marble, 0, game.tally, game, made.types), realT, made.statuses);
      sentences[lang] = {
        galaxy: say("galaxy"),
        agate: say("agate"),
        rare: say("rareCount"),
        small: say("smallCount"),
        family: say("watcher", "leftBase"),
        rarity: say("watcher"),
        all: describePrinted([eject(allActive(familyIs("mist")))], null, realT, made.statuses),
        allRare: describePrinted([eject(allActive(rarityIs("rare")))], null, realT, made.statuses),
        line: marbleListLine("bicolor", made, realT),
        identity: identityText("bicolor", made, realT),
        none: identityText(undefined, made, realT),
      };
    }
  } finally {
    setLocale(locale);
  }
  run.same("fr : les phrases", {
    galaxy: "Vitesse +2 par Astres active, maximum +6, actuellement +4",
    agate: "Vitesse +2 par famille différente sur le triangle, maximum +6, actuellement +6",
    rare: "Vitesse +1 par bille rare en main, actuellement 0",
    small: "Vitesse +1 par minibille dans le sac, actuellement 0",
    family: "Vitesse +2 si la bille de l'emplacement suivant est de la famille Brume",
    rarity: "Vitesse +1 si la base gauche est une bille épique",
    all: "Éjecter toutes les billes Brume actives",
    allRare: "Éjecter toutes les billes rares actives",
    line: "x, normale, Brume et Astres, rare, usure 3",
    identity: "Brume et Astres, normale, rare.",
    none: "Aucune bille.",
  }, unnamed(sentences.fr));
  run.same("en : les phrases", {
    galaxy: "Speed +2 per active Stars marble, maximum +6, currently +4",
    agate: "Speed +2 per different family on the triangle, maximum +6, currently +6",
    rare: "Speed +1 per rare marble in hand, currently 0",
    small: "Speed +1 per peewee in the bag, currently 0",
    family: "Speed +2 if the marble in the next slot belongs to the Mist family",
    rarity: "Speed +1 if the left base is an epic marble",
    all: "Eject all active Mist marbles",
    allRare: "Eject all active rare marbles",
    line: "x, standard, Mist and Stars, rare, wear 3",
    identity: "Mist and Stars, standard, rare.",
    none: "No marble.",
  }, unnamed(sentences.en));
}

// Les phrases d'une langue, la bille sans nom (fabriquée) dite « x » : la ligne de
// liste commence par son nom, une clé sans texte.
function unnamed(sentences) {
  return { ...sentences, line: sentences.line.replace(/^marble\.bicolor\.name/, "x") };
}
