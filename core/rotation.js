// Messages en rotation — logique PURE, sans aucune connaissance du contenu :
// les séries (fichiers de données, rotations/*.js) sont toujours PASSÉES en
// paramètre, jamais importées ici (le core n'importe pas de contenu).
// Référence : doc/entity-model.md/"Messages en rotation".
//
// Une série = { entries: ["arpulse", "gremlins", ...] } : une liste d'ids de
// messages, dont les TEXTES vivent sous rotation.<série>.<id>
// (data/i18n/<langue>/rotations.json). L'id nomme le message, pas sa
// phrase : chaque langue écrit le sien, adaptation plutôt que traduction.
//
// Le message affiché à un instant n'est JAMAIS stocké : il se DÉDUIT de
// l'heure de jeu, de la série et d'un sel propre à celui qui l'affiche (le
// panneau). Rien à sauvegarder ni à migrer, gelé avec le temps de jeu, aucun
// rattrapage si des heures passent loin du panneau : même sel + même heure
// -> même message, toujours.
//
// Tirage en PIOCHE plutôt qu'au hasard pur : sur un cycle d'autant de
// périodes que la série a de messages, chacun passe UNE fois, dans un ordre
// mélangé ; le cycle suivant remélange. Jamais deux fois le même message de
// suite, jonction de deux cycles comprise.

import { createSeed, nextRandom } from "./rng.js";

const ENTRY_ID_PATTERN = /^[a-z0-9_]+$/;

// Clé i18n d'un message, DÉDUITE des ids : jamais déclarée dans la série,
// donc jamais divergente (même principe que core/collections.js).
export function rotationTextKey(rotationId, entry) {
  return `rotation.${rotationId}.${entry}`;
}

// Valide UNE série : entrées non vides, ids en minuscules (ils entrent dans
// une clé i18n), aucun doublon. Lève une erreur claire : une série mal
// écrite échoue au chargement, jamais un message introuvable en silence.
export function validateRotation(rotationId, rotation) {
  const where = `série de messages "${rotationId}"`;
  if (typeof rotation !== "object" || rotation === null || Array.isArray(rotation)) {
    throw new Error(`${where} : doit être un objet.`);
  }
  const unknown = Object.keys(rotation).filter((field) => field !== "entries");
  if (unknown.length > 0) {
    throw new Error(`${where} : champ(s) inconnu(s) ${unknown.map((field) => `"${field}"`).join(", ")}.`);
  }
  if (!Array.isArray(rotation.entries) || rotation.entries.length === 0) {
    throw new Error(`${where} : entries doit être un tableau non vide.`);
  }
  const seen = new Set();
  rotation.entries.forEach((entry, index) => {
    if (typeof entry !== "string" || !ENTRY_ID_PATTERN.test(entry)) {
      throw new Error(`${where} : entries[${index}] doit être un id en minuscules (lettres, chiffres, _), reçu ${JSON.stringify(entry)}.`);
    }
    if (seen.has(entry)) {
      throw new Error(`${where} : entries[${index}] répète "${entry}".`);
    }
    seen.add(entry);
  });
}

// Ordre mélangé (Fisher-Yates) des indices 0..count-1, tiré d'un PRNG
// seedé par `seedText` : le même texte donne toujours le même ordre.
function shuffledOrder(count, seedText) {
  let rngState = createSeed(seedText);
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = count - 1; i > 0; i--) {
    const step = nextRandom(rngState);
    rngState = step.state;
    const j = Math.floor(step.value * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Ordre du cycle `cycle` (trois messages ou plus). S'il s'ouvrait sur le
// message qui a clos le cycle précédent, ses deux premiers échangent leur
// place. L'échange ne touche jamais la DERNIÈRE place (au moins trois
// messages) : le dernier du cycle précédent se lit donc dans son ordre brut,
// sans remonter plus loin.
function cycleOrder(count, salt, cycle) {
  const order = shuffledOrder(count, `${salt}:${cycle}`);
  if (cycle > 0) {
    const previousLast = shuffledOrder(count, `${salt}:${cycle - 1}`)[count - 1];
    if (order[0] === previousLast) [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}

// Indice du message de la période `periodIndex` (entier >= 0) dans une
// série de `count` messages, pour le sel `salt`. Un seul message : toujours
// lui. Deux : ils alternent (une pioche les répéterait à la jonction), le
// premier tiré du sel.
export function rotationEntryIndex(count, salt, periodIndex) {
  if (count === 1) return 0;
  if (count === 2) {
    const offset = nextRandom(createSeed(salt)).value < 0.5 ? 0 : 1;
    return (periodIndex + offset) % 2;
  }
  const cycle = Math.floor(periodIndex / count);
  return cycleOrder(count, salt, cycle)[periodIndex % count];
}

// Message (id) d'une série à l'instant `time` (minutes de jeu, voir
// core/time.js), le message changeant toutes les `periodMinutes` minutes,
// au début de chaque période (à l'heure pile pour 60).
export function rotationEntryAt(rotation, salt, time, periodMinutes) {
  const periodIndex = Math.floor(time / periodMinutes);
  return rotation.entries[rotationEntryIndex(rotation.entries.length, salt, periodIndex)];
}
