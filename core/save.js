// Forme d'une SAUVEGARDE de partie : enveloppe versionnée { version, data }
// — même patron que config/preferences.js (voir migratePrefs là-bas), pour
// une seule logique de montée de version dans tout le projet. Pur : aucun
// accès disque ici (ça reste à la charge de la vue, voir
// view/save-storage.js), juste la forme et sa validation. La partie
// (session) est déjà sérialisable de bout en bout (voir l'audit dans
// core/movement.check.js) : ce module se contente de l'envelopper/
// désenvelopper et de vérifier sa structure minimale au désenveloppement —
// jamais de confiance aveugle dans une donnée qui vient du disque.
//
// EN CLAIR pour l'instant (aucun encodage/compression) : volontaire, voir
// view/save-storage.js. L'obscurcissement viendra dans un prompt séparé.

export const SAVE_VERSION = 1;

export function serializeGame(session) {
  return { version: SAVE_VERSION, data: session };
}

// Migre une sauvegarde déjà déballée { version, data } vers la partie
// courante. v1 -> v1 : identité, pour l'instant — point d'ancrage documenté
// pour de futures montées (v1 -> v2 -> ... -> courante, jamais en sautant
// une étape, même principe que migratePrefs). Version inconnue -> null
// (aucun chemin de montée), traité comme un échec par deserializeGame.
function migrateSave(raw) {
  if (raw.version === SAVE_VERSION) return raw.data;
  return null;
}

// Valide la forme MINIMALE d'une partie déjà migrée : player/worlds/
// activeWorldId présents, du bon type, et le monde actif réellement
// présent dans worlds. Ne revalide pas chaque champ d'entité un par un (ce
// serait dupliquer parseLevel) — l'objectif est de détecter une donnée
// manifestement corrompue ou étrangère, pas de rejouer la validation de
// niveau.
function isPlausibleSession(data) {
  if (!data || typeof data !== "object") return false;
  if (!data.player || typeof data.player !== "object" || typeof data.player.x !== "number") return false;
  if (!data.worlds || typeof data.worlds !== "object") return false;
  if (typeof data.activeWorldId !== "string") return false;
  if (!data.worlds[data.activeWorldId]) return false;
  return true;
}

// Désenveloppe et valide une sauvegarde brute (donnée SUSPECTE par
// définition : disque, futur import fichier...) -> { success, session } ou
// { success: false, reason }. Ne lève jamais : toute donnée douteuse donne
// un échec clair, jamais une partie à moitié chargée.
// reason ∈ "format" (pas un objet exploitable), "version" (inconnue, aucune
// migration), "invalid" (migrée mais structure implausible).
export function deserializeGame(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.version !== "number") {
    return { success: false, reason: "format" };
  }

  const data = migrateSave(raw);
  if (data === null) {
    return { success: false, reason: "version" };
  }
  if (!isPlausibleSession(data)) {
    return { success: false, reason: "invalid" };
  }

  return { success: true, session: data };
}
