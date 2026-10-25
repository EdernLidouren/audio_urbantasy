// Vérifications du core — domaine « rotation ». Messages en rotation
// (core/rotation.js) : validation d'une série, tirage en pioche déterministe.
// Lancées par core/checks/index.js/runChecks (voir ce fichier). Pur : aucun
// DOM, aucun fetch.

import { validateRotation, rotationEntryIndex, rotationEntryAt, rotationTextKey } from "../rotation.js";
import { throws } from "../../lib/check.js";

// Suite des indices tirés sur `periods` périodes consécutives.
function sequence(count, salt, periods) {
  return Array.from({ length: periods }, (_, period) => rotationEntryIndex(count, salt, period));
}

// Vrai si chaque cycle complet de `count` périodes contient chaque indice
// exactement une fois.
function everyCycleIsADeck(seq, count) {
  for (let start = 0; start + count <= seq.length; start += count) {
    const cycle = seq.slice(start, start + count).sort((a, b) => a - b);
    if (cycle.some((value, index) => value !== index)) return false;
  }
  return true;
}

function hasImmediateRepeat(seq) {
  return seq.some((value, index) => index > 0 && value === seq[index - 1]);
}

export default function checkRotation(run) {
  // --- Validation d'une série ---
  const rotationThrows = (def) => throws(() => validateRotation("x", def));
  run("rotation : série valide acceptée", false, rotationThrows({ entries: ["a", "b_2"] }));
  run("rotation : liste vide refusée", true, rotationThrows({ entries: [] }));
  run("rotation : entries absent refusé", true, rotationThrows({}));
  run("rotation : doublon refusé", true, rotationThrows({ entries: ["a", "a"] }));
  run("rotation : id hors minuscules refusé", true, rotationThrows({ entries: ["Arpulse"] }));
  run("rotation : id non chaîne refusé", true, rotationThrows({ entries: [3] }));
  run("rotation : champ inconnu refusé", true, rotationThrows({ entries: ["a"], weights: {} }));
  run("rotation : clé de texte déduite des ids", "rotation.billboard_ads.arpulse", rotationTextKey("billboard_ads", "arpulse"));

  // --- Tirage en pioche ---
  const periods = 600;
  for (const count of [3, 4, 7]) {
    const seq = sequence(count, "main_street:billboard", periods);
    run(`rotation : ${count} messages -> chacun une fois par cycle`, true, everyCycleIsADeck(seq, count));
    run(`rotation : ${count} messages -> jamais deux fois de suite (jonctions comprises)`, false, hasImmediateRepeat(seq));
  }
  const pair = sequence(2, "s", 50);
  run("rotation : 2 messages -> alternance stricte", false, hasImmediateRepeat(pair));
  run("rotation : 1 message -> toujours lui", true, sequence(1, "s", 20).every((value) => value === 0));
  run(
    "rotation : déterministe (même sel, même période -> même message)",
    sequence(5, "w:a", 40).join(","),
    sequence(5, "w:a", 40).join(",")
  );
  run(
    "rotation : deux sels -> deux suites différentes",
    true,
    sequence(5, "w:a", 40).join(",") !== sequence(5, "w:b", 40).join(",")
  );
  const shuffled = sequence(5, "w:a", 50);
  run("rotation : la pioche remélange d'un cycle à l'autre", true, new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45].map((start) => shuffled.slice(start, start + 5).join(","))).size > 1);

  // --- Changement au début de chaque période (minutes de jeu) ---
  const rotation = { entries: ["a", "b", "c", "d"] };
  run("rotation : même message pendant toute l'heure", rotationEntryAt(rotation, "s", 600, 60), rotationEntryAt(rotation, "s", 659, 60));
  run("rotation : nouveau message à l'heure pile", true, rotationEntryAt(rotation, "s", 659, 60) !== rotationEntryAt(rotation, "s", 660, 60));
  run("rotation : rend un id de la série", true, rotation.entries.includes(rotationEntryAt(rotation, "s", 12345, 60)));
}
