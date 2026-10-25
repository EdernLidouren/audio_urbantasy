// RÉSOLVEUR DE DESCRIPTION — point d'extension pour les descriptions
// DYNAMIQUES d'entité (voir doc/entity-model.md/"Interaction (niveau 0)",
// doc/scripting.md/"Descriptions dynamiques"). Niveau SIMPLE aujourd'hui :
// un gabarit i18n à variables (MÊME mécanisme que time.announce/
// weather.announce, voir lib/i18n.js/t — jamais dupliqué ici),
// rempli avec des valeurs dérivées du CONTEXTE au moment de la LECTURE.
// JAMAIS de description stockée ni mise à jour par effet — recalculée à
// CHAQUE appel, avec le contexte du moment.
//
// PUR : reçoit une clé + un contexte déjà construit par l'appelant (voir
// view/interaction.js/actionContext) — ne lit jamais l'horloge réelle ni
// aucun état global lui-même. MÊME FORME que le contexte d'évaluation de
// condition (core/presence.js/evaluateCondition) — point d'extension
// délibéré : le niveau RICHE (fragments choisis par condition, voir
// doc/entity-model.md) réutilisera CE MÊME contexte pour filtrer ses
// fragments, jamais une seconde forme à maintenir en parallèle.

import { t } from "../data/i18n/index.js";
import { rotationMessage } from "./message-rotation.js";
import { hourOfDay, minuteOfHour, dayOfMonth, monthOfYear, seasonOfYear, yearNumber, MONTH_KEYS, SEASON_KEYS } from "../core/time.js";

// Deux chiffres pour une lecture d'horloge stable ("09 h 05", jamais "9 h 5").
function pad2(n) {
  return String(n).padStart(2, "0");
}

// Valeurs de temps des gabarits i18n (heure, minute, jour, mois, saison,
// année) — les mêmes pour une description et pour l'annonce de l'heure
// (view/status-announcements.js). Mois et saison sont traduits avant
// insertion. Le jour reste un NOMBRE (le gabarit l'accorde en ordinal,
// « 1er ») ; l'année passe en TEXTE : un nombre serait groupé par
// Intl.NumberFormat (« année 1 000 »), ce qui ne se fait jamais pour une
// année.
export function timeTemplateValues(time) {
  return {
    hour: pad2(hourOfDay(time)),
    minute: pad2(minuteOfHour(time)),
    day: dayOfMonth(time),
    month: t(MONTH_KEYS[monthOfYear(time) - 1]),
    season: t(SEASON_KEYS[seasonOfYear(time)]),
    year: String(yearNumber(time)),
  };
}

// Dictionnaire de valeurs de gabarit DÉRIVÉ du contexte — SEUL endroit qui
// énumère les valeurs disponibles aujourd'hui (mêmes noms que
// time.announce/weather.announce, voir view/status-announcements.js, pour qu'un
// gabarit de description se comporte comme ces annonces). Ajouter une
// valeur PLUS TARD = une entrée de plus ICI, jamais une réécriture de
// resolveDescriptionText ci-dessous, qui reste agnostique de ce qu'elle
// contient. `context.time` absent (cas limite, hors partie) -> dictionnaire
// vide : chaque placeholder se dégrade alors PROPREMENT via
// lib/i18n/message.js/renderMessage (laissé tel quel + avertissement),
// jamais un crash.
function buildDescriptionValues(context) {
  if (!context || context.time === undefined) return {};
  const values = timeTemplateValues(context.time);
  if (context.weather !== undefined) {
    values.weather = t(`weather.state.${context.weather}`);
  }
  // Message en rotation de l'entité observée (ex. la réclame du panneau
  // publicitaire), seulement si elle en affiche une : voir
  // view/message-rotation.js.
  const message = rotationMessage(context);
  if (message !== undefined) values.message = message;
  return values;
}

// Remplit LA clé de description avec les valeurs du contexte COURANT — un
// gabarit sans placeholder ({...}) traverse tel quel (voir lib/i18n.js) :
// une description statique n'a rien à déclarer de plus.
export function resolveDescriptionText(key, context) {
  if (!key) return undefined;
  return t(key, buildDescriptionValues(context));
}
