// Module d'annonce : la seule brique qui fait parler le lecteur d'écran.
// Trois CANAUX (channel) possibles, sélectionnables par appel ou globalement
// via setAnnounceChannel — EXPÉRIMENTAL, additif, rien n'est remplacé :
//   - "liveRegion" (défaut, inchangé) : écrit dans les deux live regions
//     ARIA déjà présentes dans index.html (#announce-polite,
//     #announce-assertive).
//   - "ariaNotify" (WAI-ARIA 1.3, Chromium/Edge) : annonce par programme,
//     hors DOM — à comparer à liveRegion pour voir si elle survit mieux au
//     maintien d'une touche (là où NVDA interrompt/relance une live region).
//     Repli automatique sur liveRegion si le navigateur ne le supporte pas.
//   - "speech" : nom de canal réservé, PAS encore implémenté (repli sur
//     liveRegion) — jamais de vrai speechSynthesis ici : on laisse le
//     lecteur d'écran de l'utilisateur (NVDA, etc.) lire avec SA voix, SON
//     débit, SES réglages, on ne parle jamais par-dessus lui.
//
// Fait partie de la vue : aucune règle de jeu ici, aucun import du core.

let politeRegion = null;
let assertiveRegion = null;
let regionsResolved = false;

// Récupère et met en cache les deux live regions, une seule fois — appelé
// UNIQUEMENT par les chemins qui en ont réellement besoin (liveRegion, et le
// repli de ariaNotify/speech). Un ariaNotify qui réussit ne l'appelle
// jamais : tout l'intérêt de ce canal est de ne PAS passer par le DOM.
function resolveRegions() {
  if (regionsResolved) return;
  regionsResolved = true;

  politeRegion = document.getElementById("announce-polite");
  assertiveRegion = document.getElementById("announce-assertive");

  if (!politeRegion) {
    console.warn("announce.js: élément #announce-polite introuvable dans le DOM.");
  }
  if (!assertiveRegion) {
    console.warn("announce.js: élément #announce-assertive introuvable dans le DOM.");
  }
}

// Coerce en chaîne, trim, réduit les espaces multiples à un seul.
function sanitize(text) {
  if (text === null || text === undefined) return "";
  return String(text).trim().replace(/\s+/g, " ");
}

// Réannoncer le même texte deux fois de suite ne redéclenche pas la lecture
// tant que le contenu de la live region ne change pas. Cas normal (texte
// différent) : écriture directe, la live region s'annonce d'elle-même au
// changement, aucune latence ajoutée. Cas identique : on force la relecture
// en vidant la region puis en réécrivant au tick suivant. Le vidage doit
// passer par un macrotask (setTimeout) et non un microtask (queueMicrotask,
// Promise.then) ni requestAnimationFrame : les microtasks se vident avant
// la mise à jour du rendu et de l'arbre d'accessibilité, donc l'état vide
// serait invisible du lecteur d'écran et la relecture forcée casserait en
// silence.
function writeWithRetrigger(region, text) {
  if (region.textContent !== text) {
    region.textContent = text;
    return;
  }

  region.textContent = "";
  setTimeout(() => {
    region.textContent = text;
  }, 0);
}

function announceViaLiveRegion(text, assertive) {
  resolveRegions();

  const region = assertive ? assertiveRegion : politeRegion;
  if (!region) return;

  writeWithRetrigger(region, text);
}

// Canal expérimental (WAI-ARIA 1.3) : annonce par programme, hors DOM.
// Repli sur liveRegion si non supporté (ex. Firefox), pour ne jamais rester
// muet sur un navigateur incompatible.
function announceViaAriaNotify(text, assertive) {
  if (typeof document.ariaNotify !== "function") {
    console.warn("announce.js: document.ariaNotify indisponible sur ce navigateur, repli sur liveRegion.");
    announceViaLiveRegion(text, assertive);
    return;
  }

  document.ariaNotify(text, { priority: assertive ? "high" : "normal" });
}

// Canal réservé, pas encore implémenté : repli sur liveRegion, avec un
// avertissement distinct de celui de ariaNotify (absence d'implémentation,
// pas absence de support navigateur).
function announceViaSpeech(text, assertive) {
  console.warn('announce.js: canal "speech" pas encore implémenté, repli sur liveRegion.');
  announceViaLiveRegion(text, assertive);
}

const CHANNELS = {
  liveRegion: announceViaLiveRegion,
  ariaNotify: announceViaAriaNotify,
  speech: announceViaSpeech,
};

// Canal par défaut du module, modifiable à chaud (voir setAnnounceChannel)
// pour comparer les canaux sur EXACTEMENT le même déclenchement, sans
// recharger la page. Inchangé au démarrage : comportement actuel préservé.
let defaultChannel = "liveRegion";

export function setAnnounceChannel(channel) {
  if (!CHANNELS[channel]) {
    console.warn(`announce.js: canal "${channel}" inconnu, ignoré.`);
    return;
  }
  defaultChannel = channel;
}

// Exposition expérimentale sur window pour basculer depuis la console sans
// recharger. Affectation ici, pas dans main.js (hors périmètre de cette
// expérimentation) : ce module reste le seul point de contact.
if (typeof window !== "undefined") {
  window.setAnnounceChannel = setAnnounceChannel;
}

export function announce(text, { assertive = false, channel = defaultChannel } = {}) {
  const clean = sanitize(text);
  if (clean === "") return;

  const handler = CHANNELS[channel] || announceViaLiveRegion;
  handler(clean, assertive);
}

export function clearAnnouncements() {
  resolveRegions();

  if (politeRegion) politeRegion.textContent = "";
  if (assertiveRegion) assertiveRegion.textContent = "";
}
