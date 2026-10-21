// Module d'annonce : la seule brique qui fait parler le lecteur d'écran.
// Trois CANAUX (channel) possibles, sélectionnables par appel ou globalement
// via setAnnounceChannel :
//   - "liveRegion" (DÉFAUT, utilisé en pur-navigateur) : écrit dans les deux
//     live regions ARIA déjà présentes dans index.html (#announce-polite,
//     #announce-assertive). C'est la vraie voix du lecteur d'écran de
//     l'utilisateur (NVDA, etc.) — notre choix pour les menus et le jeu tant
//     qu'on reste en pur-web.
//   - "ariaNotify" (WAI-ARIA 1.3, Chromium/Edge) : annonce par programme,
//     hors DOM. Canal DORMANT, jamais activé par défaut — conservé derrière
//     la couture pour un futur passage en coque native (Electron) ou comme
//     repli optionnel. Repli automatique sur liveRegion si le navigateur ne
//     le supporte pas.
//   - "speech" : nom de canal réservé, PAS encore implémenté (repli sur
//     liveRegion). Canal DORMANT lui aussi — jamais de vrai speechSynthesis
//     en pur-navigateur : on laisse le lecteur d'écran de l'utilisateur lire
//     avec SA voix, SON débit, SES réglages, on ne parle jamais par-dessus
//     lui. Resterait réservé à un contexte natif où ce choix aurait du sens.
//
// En pur-navigateur, l'annonce temps réel via liveRegion subit une
// limitation connue et irréductible côté web : NVDA peut s'auto-interrompre
// en touche maintenue (chaque répétition de la touche relance sa propre
// lecture). Pas de correctif web fiable identifié ; résolution prévue via
// une future coque native, d'où les canaux dormants ci-dessus gardés en
// réserve plutôt que supprimés.
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

// Chaque phrase d'une annonce commence par une majuscule. Les données du jeu
// gardent leurs NOMS en minuscules (pour pouvoir les insérer en milieu de
// phrase) ; c'est ici, au seul point de sortie, qu'on capitalise quand un nom
// ouvre une phrase — en tête ("pomme : un fruit." -> "Pomme : un fruit.") ou
// après une fin de phrase, car une annonce en assemble souvent plusieurs
// ("Observer. ordinateur cassé. 1 sur 2" -> "Observer. Ordinateur cassé.
// 1 sur 2"). Seule une lettre MINUSCULE qui ouvre une phrase change : un
// sigle ou un nom propre reste tel quel, et un nom après ":" ou "," reste en
// minuscules.
function capitalizeSentences(text) {
  return text.replace(/(^|[.!?…]\s+)(\p{Ll})/gu, (match, before, letter) => before + letter.toLocaleUpperCase());
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
// Une écriture plus récente annule une relecture encore en attente : le
// texte le plus récent gagne, un ancien texte ne vient jamais l'écraser
// après coup.
const pendingRetriggers = new Map();

function cancelPendingRetrigger(region) {
  if (!pendingRetriggers.has(region)) return;
  clearTimeout(pendingRetriggers.get(region));
  pendingRetriggers.delete(region);
}

function writeWithRetrigger(region, text) {
  cancelPendingRetrigger(region);

  if (region.textContent !== text) {
    region.textContent = text;
    return;
  }

  region.textContent = "";
  pendingRetriggers.set(region, setTimeout(() => {
    pendingRetriggers.delete(region);
    region.textContent = text;
  }, 0));
}

function announceViaLiveRegion(text, assertive) {
  resolveRegions();

  const region = assertive ? assertiveRegion : politeRegion;
  if (!region) return;

  writeWithRetrigger(region, text);
}

// Canal dormant (WAI-ARIA 1.3) : annonce par programme, hors DOM. Repli sur
// liveRegion si non supporté (ex. Firefox), pour ne jamais rester muet sur
// un navigateur incompatible.
function announceViaAriaNotify(text, assertive) {
  if (typeof document.ariaNotify !== "function") {
    console.warn("announce.js: document.ariaNotify indisponible sur ce navigateur, repli sur liveRegion.");
    announceViaLiveRegion(text, assertive);
    return;
  }

  document.ariaNotify(text, { priority: assertive ? "high" : "normal" });
}

// Canal dormant, réservé, pas encore implémenté : repli sur liveRegion, avec
// un avertissement distinct de celui de ariaNotify (absence d'implémentation,
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

// Canal par défaut du module. liveRegion en pur-navigateur ; modifiable à
// chaud (voir setAnnounceChannel) pour tester manuellement les canaux
// dormants sans recharger la page, ou pour un futur passage natif.
let defaultChannel = "liveRegion";

export function setAnnounceChannel(channel) {
  if (!CHANNELS[channel]) {
    console.warn(`announce.js: canal "${channel}" inconnu, ignoré.`);
    return;
  }
  defaultChannel = channel;
}

// Exposition sur window pour basculer manuellement depuis la console sans
// recharger (test des canaux dormants). Affectation ici, pas dans main.js :
// ce module reste le seul point de contact pour le choix du canal.
if (typeof window !== "undefined") {
  window.setAnnounceChannel = setAnnounceChannel;
}

export function announce(text, { assertive = false, channel = defaultChannel } = {}) {
  const sanitized = sanitize(text);
  if (sanitized === "") return;
  const clean = capitalizeSentences(sanitized);

  const handler = CHANNELS[channel] || announceViaLiveRegion;
  handler(clean, assertive);
}

export function clearAnnouncements() {
  resolveRegions();

  if (politeRegion) {
    cancelPendingRetrigger(politeRegion);
    politeRegion.textContent = "";
  }
  if (assertiveRegion) {
    cancelPendingRetrigger(assertiveRegion);
    assertiveRegion.textContent = "";
  }
}
