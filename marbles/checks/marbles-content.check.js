// Vérifications — domaine « marbles-content ». Le CONTRAT des vraies billes
// (marbles/content/types/) : les billes du jeu, en phase de design, changent à chaque
// itération ; les mécanismes se vérifient sur la table des vérifications
// (marbles/checks/fixtures/marbles.js), et ce domaine-ci ne demande aux vraies billes
// que ce qui doit tenir quelles que soient leurs valeurs :
//   - la table et le sac de départ se valident, les règles se composent ;
//   - chaque bille a son nom dans chaque langue, aucun nom n'est orphelin, et tout
//     ce qui se dit d'elle (fiche, main, triangle, confirmation d'une pose) se dit
//     sans gabarit brut ;
//   - chaque bille a un profil sonore complet, celui de son calibre ;
//   - des parties jouées au hasard gardent leurs invariants, sans exception ni
//     chaîne coupée ;
//   - la prévision correspond au réel sur quelques parties.
// Aucune attente chiffrée sur une bille : changer une valeur, une clause ou ajouter
// une bille ne casse rien ici tant que la bille est valide. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-content`).

import { LOCALE_TABLES, t, getLocale, setLocale } from "../../data/i18n/index.js";
import { MARBLE_SOUND_PROFILES, STARTING_BAG } from "../config/values.js";
import { SLOTS } from "../core/marbles.js";
import { validateMarblesContent } from "../core/validation.js";
import { createMarblesRules } from "../core/rules.js";
import MARBLE_TYPES from "../content/types/index.js";
import MARBLE_STATUSES from "../content/statuses/index.js";
import { DEFAULT_DEFINITION, GAME_DEFINITIONS } from "../content/definitions/index.js";
import { marbleCard } from "../view/card.js";
import { describeHandFocus, describeSlotFocus, describeSlotForPlacement, placementLines } from "../view/narration.js";
import { throws } from "../../lib/check.js";
import { emptyForecastTally, walkForecastGame } from "./fixtures/forecast-property.js";
import { inHand, isCleanText, marblesPlayState, playRandomMarblesGame } from "./helpers.js";

// Les règles du jeu, liées à la vraie table, aux vrais statuts et aux vraies
// définitions ; une partie neuve est celle de la définition par défaut.
const gameRules = createMarblesRules(MARBLE_TYPES, MARBLE_STATUSES, GAME_DEFINITIONS);
const rules = Object.freeze({ ...gameRules, createGame: (seed) => gameRules.createGame(seed, GAME_DEFINITIONS[DEFAULT_DEFINITION]) });
const ids = Object.keys(MARBLE_TYPES);

export default function checkMarblesContent(run) {
  run.section("validation", checkValidation);
  run.section("textes", checkTexts);
  run.section("sons", checkSounds);
  run.section("fumée", checkSmoke);
  run.section("prévision = réel", checkForecast);
}

function checkValidation(run) {
  run("la table, celle des statuts et les définitions se valident", false, throws(() => validateMarblesContent(MARBLE_TYPES, MARBLE_STATUSES, GAME_DEFINITIONS)));
  run("les règles se composent sur les tables", false, throws(() => createMarblesRules(MARBLE_TYPES, MARBLE_STATUSES, GAME_DEFINITIONS)));
  run("la définition par défaut existe", true, Object.hasOwn(GAME_DEFINITIONS, DEFAULT_DEFINITION));
  run.same("le sac de départ ne cite que des billes de la table", [], STARTING_BAG.filter((id) => !Object.hasOwn(MARBLE_TYPES, id)));
  run("une partie neuve se pioche", true, rules.reduce(rules.createGame(1), { type: "draw" }).ok);
}

// Les noms, et tout ce qui se dit de chaque bille, dans chaque langue.
function checkTexts(run) {
  const previousLocale = getLocale();
  try {
    for (const locale of Object.keys(LOCALE_TABLES)) {
      setLocale(locale);
      run.same(`${locale} : chaque bille a son nom`, [], ids.filter((id) => !Object.hasOwn(LOCALE_TABLES[locale], `marble.${id}.name`)));
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
