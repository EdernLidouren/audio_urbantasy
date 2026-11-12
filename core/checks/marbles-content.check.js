// Vérifications — domaine « marbles-content ». Le CONTRAT des vraies billes
// (marbles/types/) : les billes du jeu, en phase de design, changent à chaque
// itération ; les mécanismes se vérifient sur la table des vérifications
// (core/checks/fixtures/marbles.js), et ce domaine-ci ne demande aux vraies billes
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
import { MARBLE_SOUND_PROFILES, STARTING_BAG } from "../../config/marbles-values.js";
import { SLOTS, validateMarblesContent } from "../marbles.js";
import { createMarblesRules } from "../marbles-rules.js";
import MARBLE_TYPES from "../../marbles/types/index.js";
import { marbleCard } from "../../view/marbles/card.js";
import { describeHandFocus, describeSlotFocus, describeSlotForPlacement, placementLines } from "../../view/marbles/narration.js";
import { throws } from "../../lib/check.js";
import { emptyForecastTally, walkForecastGame } from "./fixtures/forecast-property.js";
import { inHand, isCleanText, marblesPlayState, playRandomMarblesGame } from "./helpers.js";

// Les règles du jeu, liées à la vraie table.
const rules = createMarblesRules(MARBLE_TYPES);
const ids = Object.keys(MARBLE_TYPES);

export default function checkMarblesContent(run) {
  run.section("validation", checkValidation);
  run.section("textes", checkTexts);
  run.section("sons", checkSounds);
  run.section("fumée", checkSmoke);
  run.section("prévision = réel", checkForecast);
}

function checkValidation(run) {
  run("la table et le sac de départ se valident", false, throws(() => validateMarblesContent(MARBLE_TYPES)));
  run("les règles se composent sur la table", false, throws(() => createMarblesRules(MARBLE_TYPES)));
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
      run.same(
        `${locale} : aucun nom sans bille`,
        [],
        Object.keys(LOCALE_TABLES[locale])
          .filter((key) => key.startsWith("marble."))
          .filter((key) => !Object.hasOwn(MARBLE_TYPES, key.split(".")[1]))
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
