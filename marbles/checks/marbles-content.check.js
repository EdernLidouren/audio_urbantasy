// Vérifications — domaine « marbles-content ». Le CONTRAT des vraies billes
// (marbles/content/types/) : les billes du jeu, en phase de design, changent à chaque
// itération ; les mécanismes se vérifient sur la table des vérifications
// (marbles/checks/fixtures/marbles.js), et ce domaine-ci ne demande aux vraies billes
// que ce qui doit tenir quelles que soient leurs valeurs :
//   - la table et le sac de départ se valident, les règles se composent ;
//   - chaque bille a son nom dans chaque langue, aucun nom ni aucune description
//     n'est orphelin, chaque famille et chaque rareté a son nom, et tout ce qui se dit
//     d'elle (fiche, main, triangle, confirmation d'une pose, touches V et F) se dit
//     sans gabarit brut ;
//   - chaque bille a un profil sonore complet, celui de son calibre ;
//   - des parties jouées au hasard gardent leurs invariants, sans exception ni
//     chaîne coupée ;
//   - la prévision correspond au réel sur quelques parties.
// Aucune attente chiffrée sur une bille : changer une valeur, une clause ou ajouter
// une bille ne casse rien ici tant que la bille est valide. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-content`).

import { LOCALE_TABLES, t, getLocale, setLocale } from "../../data/i18n/index.js";
import { MARBLE_FAMILIES, MARBLE_RARITIES, MARBLE_SOUND_PROFILES } from "../config/values.js";
import { PRESET_BAGS, STARTER_BAG } from "../content/bags/index.js";
import { BAG_BUILD_RULES } from "../config/values.js";
import { bagFromList, bagMarbles, bagProblems, bagSize } from "../core/bags.js";
import { describeBagProblem } from "../view/narration/bags.js";
import { SLOTS } from "../core/marbles.js";
import { validateMarblesContent } from "../core/validation.js";
import { createMarblesRules } from "../core/rules.js";
import MARBLE_TYPES from "../content/types/index.js";
import MARBLE_STATUSES from "../content/statuses/index.js";
import { DEFAULT_DEFINITION, GAME_DEFINITIONS } from "../content/definitions/index.js";
import { marbleCard } from "../view/card.js";
import { describeHandFocus, describeSlotFocus, describeSlotForPlacement, placementLines } from "../view/narration.js";
import { descriptionText, identityText } from "../view/marble-info.js";
import { throws } from "../../lib/check.js";
import { emptyForecastTally, walkForecastGame } from "./fixtures/forecast-property.js";
import { inHand, isCleanText, marblesPlayState, playRandomMarblesGame } from "./helpers.js";

// Les règles du jeu, liées à la vraie table, aux vrais statuts, aux vraies
// définitions et aux vrais sacs ; une partie neuve est celle de la définition par
// défaut, avec le sac de départ, comme au lancement depuis le menu, ou avec `bag` :
// une liste d'ids (jouée hors règles de construction) ou un sac.
const gameRules = createMarblesRules(MARBLE_TYPES, MARBLE_STATUSES, GAME_DEFINITIONS, PRESET_BAGS);
const rules = Object.freeze({
  ...gameRules,
  createGame: (seed, { bag = PRESET_BAGS[STARTER_BAG] } = {}) =>
    gameRules.createGame(seed, GAME_DEFINITIONS[DEFAULT_DEFINITION], Array.isArray(bag) ? { bag: bagFromList("smoke", bag), unchecked: true } : { bag }),
});
const ids = Object.keys(MARBLE_TYPES);

export default function checkMarblesContent(run) {
  run.section("validation", checkValidation);
  run.section("textes", checkTexts);
  run.section("sons", checkSounds);
  run.section("sacs préfaits", checkPresetBags);
  run.section("sacs : textes des problèmes", checkBagTexts);
  run.section("fumée", checkSmoke);
  run.section("prévision = réel", checkForecast);
}

function checkValidation(run) {
  run("la table, celle des statuts, les sacs et les définitions se valident", false, throws(() => validateMarblesContent(MARBLE_TYPES, MARBLE_STATUSES, GAME_DEFINITIONS, PRESET_BAGS)));
  run("les règles se composent sur les tables", false, throws(() => createMarblesRules(MARBLE_TYPES, MARBLE_STATUSES, GAME_DEFINITIONS, PRESET_BAGS)));
  run("la définition par défaut existe", true, Object.hasOwn(GAME_DEFINITIONS, DEFAULT_DEFINITION));
  run("le sac de départ existe", true, Object.hasOwn(PRESET_BAGS, STARTER_BAG));
  run("une partie neuve se pioche", true, rules.reduce(rules.createGame(1), { type: "draw" }).ok);
}

// Les noms, et tout ce qui se dit de chaque bille, dans chaque langue.
function checkTexts(run) {
  const previousLocale = getLocale();
  try {
    for (const locale of Object.keys(LOCALE_TABLES)) {
      setLocale(locale);
      run.same(`${locale} : chaque bille a son nom`, [], ids.filter((id) => !Object.hasOwn(LOCALE_TABLES[locale], `marble.${id}.name`)));
      run.same(
        `${locale} : chaque famille et chaque rareté a son nom`,
        [],
        [...MARBLE_FAMILIES.map((family) => `marbles.family.${family}.name`), ...MARBLE_RARITIES.map((rarity) => `marbles.rarity.${rarity}.name`)].filter((key) => !Object.hasOwn(LOCALE_TABLES[locale], key))
      );
      run.same(`${locale} : chaque sac préfait a son nom`, [], Object.keys(PRESET_BAGS).filter((id) => !Object.hasOwn(LOCALE_TABLES[locale], `marbles.bag.${id}.name`)));
      // Chaque définition de partie : son nom et sa description (touche E du menu Maj+O).
      run.same(
        `${locale} : chaque définition de partie a son nom et sa description`,
        [],
        Object.keys(GAME_DEFINITIONS).flatMap((id) => ["name", "description"].map((part) => `marbles.definition.${id}.${part}`)).filter((key) => !Object.hasOwn(LOCALE_TABLES[locale], key))
      );
      run.same(
        `${locale} : aucun nom sans bille`,
        [],
        Object.keys(LOCALE_TABLES[locale])
          .filter((key) => key.startsWith("marble."))
          .filter((key) => !Object.hasOwn(MARBLE_TYPES, key.split(".")[1]))
      );
      // Chaque statut a son nom et sa description, obligatoires ; aucun texte de
      // statut sans statut.
      run.same(
        `${locale} : chaque statut a son nom et sa description`,
        [],
        Object.keys(MARBLE_STATUSES)
          .flatMap((id) => [`marbles.status.${id}.name`, `marbles.status.${id}.description`])
          .filter((key) => !Object.hasOwn(LOCALE_TABLES[locale], key))
      );
      run.same(
        `${locale} : aucun texte de statut sans statut`,
        [],
        Object.keys(LOCALE_TABLES[locale])
          .filter((key) => /^marbles\.status\.[^.]+\.(name|description)$/.test(key))
          .filter((key) => !Object.hasOwn(MARBLE_STATUSES, key.split(".")[2]))
      );

      const state = marblesPlayState(rules, { hand: inHand([]) });
      const emptyTriangle = { leftBase: null, rightBase: null, apex: null };
      const lines = [
        // Chaque champ de chaque fiche, et le repli.
        ...ids.flatMap((id) => {
          const card = marbleCard(id, "x", rules, t);
          return [...card.above, ...card.below];
        }),
        ...ids.map((id) => describeHandFocus({ ...state, hand: inHand([id]) }, 0, rules, t)),
        ...ids.flatMap((id) => [descriptionText(id, t), identityText(id, rules, t)]),
        ...ids.flatMap((id) =>
          SLOTS.flatMap((slot) => {
            const game = { ...state, triangle: { ...emptyTriangle, [slot]: { marble: id, wear: 0 } } };
            return [describeSlotFocus(game, slot, rules, t), describeSlotForPlacement(game, slot, rules, t)];
          })
        ),
        // Chaque bille posée, sur un vide et en remplaçant chaque bille : toutes les
        // formes de nom demandées par les gabarits.
        ...ids.flatMap((id) =>
          ids.flatMap((old) =>
            placementLines({ ...state, hand: inHand([id]), triangle: { ...emptyTriangle, apex: { marble: old, wear: 0 } } }, 0, "apex", rules, t).map(({ key, params }) => t(key, params))
          )
        ),
        ...ids.flatMap((id) => placementLines({ ...state, hand: inHand([id]), triangle: emptyTriangle }, 0, "leftBase", rules, t).map(({ key, params }) => t(key, params))),
      ];
      run.same(`${locale} : tout ce qui se dit de chaque bille, sans gabarit brut`, [], lines.filter((text) => !isCleanText(text)).slice(0, 3));
    }
  } finally {
    setLocale(previousLocale);
  }
}

// Le son d'une bille est celui de son calibre : chaque calibre employé a un profil
// complet.
function checkSounds(run) {
  const incomplete = ids.filter((id) => {
    const profile = MARBLE_SOUND_PROFILES[MARBLE_TYPES[id].size];
    return profile === undefined || ["beacon", "drop", "roll", "impact"].some((sound) => typeof profile[sound] !== "string");
  });
  run.same("chaque bille a un profil sonore complet, celui de son calibre", [], incomplete);
}

// Des parties jouées au hasard sur le sac de départ, puis sur des sacs d'une seule
// bille (chaque bille en nombre, ce que le sac de départ ne fait jamais).
// LES SEPT SACS PRÉFAITS : valides selon les règles par défaut, et composés comme
// annoncé (marbles/content/bags/, en-tête de chacun).
function checkPresetBags(run) {
  const familyOf = (marble) => MARBLE_TYPES[marble].families[0];
  for (const bag of Object.values(PRESET_BAGS)) run.same(`${bag.id} : valide selon les règles par défaut`, [], bagProblems(bag, BAG_BUILD_RULES, { types: MARBLE_TYPES, unlocked: ids }));
  run("sept sacs préfaits", 7, Object.keys(PRESET_BAGS).length);
  for (const family of MARBLE_FAMILIES) {
    const bag = PRESET_BAGS[family];
    const members = ids.filter((id) => MARBLE_TYPES[id].families.includes(family));
    run(`${family} : 15 billes`, 15, bag === undefined ? 0 : bagSize(bag));
    run(
      `${family} : ses 5 billes, chacune au maximum que permet sa rareté`,
      true,
      members.length === 5 && members.every((id) => bag.marbles.find((entry) => entry.marble === id)?.count === BAG_BUILD_RULES.copies[MARBLE_TYPES[id].rarity])
    );
    run(`${family} : complété par d'autres familles`, true, bag.marbles.filter((entry) => familyOf(entry.marble) !== family).length > 0);
  }
  run("classiques : complété par des familles variées", true, new Set(PRESET_BAGS.classics.marbles.map((entry) => familyOf(entry.marble)).filter((family) => family !== "classics")).size >= 3);
  const starter = PRESET_BAGS[STARTER_BAG];
  run("départ : 20 billes", 20, bagSize(starter));
  run.same("départ : toutes les familles", [...MARBLE_FAMILIES].sort(), [...new Set(bagMarbles(starter).map(familyOf))].sort());
  run("départ : aucune légendaire", false, bagMarbles(starter).some((id) => MARBLE_TYPES[id].rarity === "legendary"));
}

// Chaque problème de sac, lisible à l'oreille, dans chaque langue (les vrais noms).
// Les espaces insécables du français, posées par l'outil de parité, sont écrites ici.
function checkBagTexts(run) {
  const nbsp = "\u00a0";
  const expected = {
    fr: {
      bagTooSmall: "Sac trop petit" + nbsp + ": 10 billes sur 12 minimum.",
      bagTooLarge: "Sac trop grand" + nbsp + ": 22 billes sur 20 maximum.",
      tooManyCopies: "Trop d'exemplaires de pierre de sang" + nbsp + ": 2 sur 1 maximum.",
      tooManyCopiesVowel: "Trop d'exemplaires d'agate" + nbsp + ": 3 sur 2 maximum.",
      unknownMarble: "Bille inconnue" + nbsp + ": nope.",
      lockedMarble: "Bille non débloquée" + nbsp + ": pierre de sang.",
    },
    en: {
      bagTooSmall: "Bag too small: 10 marbles out of 12 minimum.",
      bagTooLarge: "Bag too large: 22 marbles out of 20 maximum.",
      tooManyCopies: "Too many copies of bloodstone: 2 out of 1 maximum.",
      tooManyCopiesVowel: "Too many copies of agate: 3 out of 2 maximum.",
      unknownMarble: "Unknown marble: nope.",
      lockedMarble: "Marble not unlocked: bloodstone.",
    },
  };
  const problems = {
    bagTooSmall: { code: "bagTooSmall", size: 10, min: 12 },
    bagTooLarge: { code: "bagTooLarge", size: 22, max: 20 },
    tooManyCopies: { code: "tooManyCopies", marble: "bloodstone", count: 2, max: 1 },
    tooManyCopiesVowel: { code: "tooManyCopies", marble: "agate", count: 3, max: 2 },
    unknownMarble: { code: "unknownMarble", marble: "nope" },
    lockedMarble: { code: "lockedMarble", marble: "bloodstone" },
  };
  const previousLocale = getLocale();
  try {
    for (const locale of Object.keys(expected)) {
      setLocale(locale);
      for (const [name, problem] of Object.entries(problems)) run(`${locale} : ${name}`, expected[locale][name], describeBagProblem(problem, t));
    }
  } finally {
    setLocale(previousLocale);
  }
}

function checkSmoke(run) {
  const seen = new Set();
  const faults = [];
  const play = (seed, options) => {
    try {
      faults.push(...playRandomMarblesGame(rules, seed, options, seen).map((fault) => `graine ${seed} : ${fault}`));
    } catch (error) {
      faults.push(`graine ${seed} : exception ${error.message}`);
    }
  };
  for (let seed = 1; seed <= 40; seed++) play(seed, {});
  // Chaque sac préfait, quelques parties.
  Object.values(PRESET_BAGS).forEach((bag, index) => [1, 2, 3, 4, 5].forEach((seed) => play(500 + 10 * index + seed, { bag })));
  ids.forEach((id, index) => play(1000 + index, { bag: Array(6).fill(id) }));
  run.same("fumée : invariants tenus, aucune exception", [], faults.slice(0, 5));
  run("fumée : aucun enchaînement interrompu (anomalie)", false, seen.has("chainInterrupted"));
}

function checkForecast(run) {
  const faults = [];
  const tally = emptyForecastTally();
  for (let seed = 1; seed <= 10; seed++) walkForecastGame(rules, seed, {}, faults, tally);
  run.same("la prévision correspond au résultat réel", [], faults.slice(0, 3));
  run("des actions comparées", true, tally.actions > 0);
}
