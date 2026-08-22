// Module d'annonce : seule brique qui fait parler le lecteur d'écran.
// Écrit dans les live regions ARIA déjà présentes dans index.html
// (#announce-polite, #announce-assertive). Pas de speechSynthesis :
// on laisse le lecteur d'écran de l'utilisateur (NVDA, etc.) lire avec
// SA voix, SON débit, SES réglages — on ne parle jamais par-dessus lui.
//
// Fait partie de la vue : aucune règle de jeu ici, aucun import du core.

let politeRegion = null;
let assertiveRegion = null;
let regionsResolved = false;

// Récupère et met en cache les deux live regions, une seule fois.
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

export function announce(text, { assertive = false } = {}) {
  resolveRegions();

  const clean = sanitize(text);
  if (clean === "") return;

  const region = assertive ? assertiveRegion : politeRegion;
  if (!region) return;

  writeWithRetrigger(region, clean);
}

export function clearAnnouncements() {
  resolveRegions();

  if (politeRegion) politeRegion.textContent = "";
  if (assertiveRegion) assertiveRegion.textContent = "";
}
