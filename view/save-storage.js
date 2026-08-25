// Accès disque pour la SAUVEGARDE DE PARTIE (localStorage) — distinct de
// config/preferences.js (clé différente, format différent : une PARTIE, pas
// des réglages). La forme/validation reste dans core/save.js (pur) ; ce
// module ne fait QUE lire/écrire le disque, brancher l'obscurcissement (voir
// lib/obfuscate.js) et le retour sensoriel (son + annonce) d'une sauvegarde
// réussie — jamais de logique de partie ici.
//
// Obscurcissement, PAS chiffrement (voir lib/obfuscate.js pour l'avertissement
// complet) : décourage l'édition triviale d'un fichier de save, ne sécurise
// rien. Le contenu écrit sur disque est un préfixe EN CLAIR identifiant le
// schéma d'obscurcissement (OBFUSCATION_PREFIX ci-dessous), suivi du blob
// obscurci — lu EN CLAIR avant toute tentative de désobscurcissement, pour
// savoir quel schéma appliquer. DEUX versions distinctes cohabitent, ne
// jamais les confondre : ce préfixe (comment le texte est encodé SUR
// DISQUE) est indépendant de SAVE_VERSION (core/save.js — la FORME de la
// partie une fois désobscurcie/parsée) ; monter l'un n'implique aucune
// migration de l'autre.
import { serializeGame, deserializeGame } from "../core/save.js";
import { obfuscate, deobfuscate } from "../lib/obfuscate.js";
import { playOneShot } from "../lib/audio.js";
import { resolveAsset } from "../lib/assets.js";
import { announce } from "../lib/announce.js";
import { t } from "../i18n/index.js";

const STORAGE_KEY = "templeton-save";

const OBFUSCATION_PREFIX = "OBF1:";

function encodeForStorage(text) {
  return OBFUSCATION_PREFIX + obfuscate(text);
}

// Absence du préfixe connu -> contenu traité comme du JSON EN CLAIR :
// rétrocompatibilité avec les saves écrites avant cette couche, ET repli
// si un futur préfixe inconnu apparaît un jour. Jamais de tentative de
// désobscurcissement à l'aveugle sur une donnée qui n'est peut-être pas
// obscurcie du tout.
function decodeFromStorage(raw) {
  if (raw.startsWith(OBFUSCATION_PREFIX)) {
    return deobfuscate(raw.slice(OBFUSCATION_PREFIX.length));
  }
  return raw;
}

// Clé PLACEHOLDER : le fichier n'existe pas encore, à ajouter plus tard.
// resolveAsset échoue proprement (clé introuvable, ou manifeste pas encore
// chargé) tant qu'il manque — intercepté ci-dessous, jamais de crash, juste
// pas de son.
const SAVE_SOUND_KEY = "ui_save";

function playSaveSound() {
  try {
    playOneShot(resolveAsset(SAVE_SOUND_KEY), { volume: 1 });
  } catch (error) {
    console.warn(`saveGame: son de sauvegarde indisponible ("${SAVE_SOUND_KEY}") : ${error.message}`);
  }
}

// Sérialise + écrit la partie sur disque. Retour sensoriel (son + annonce)
// UNIQUEMENT si l'écriture a réellement réussi — jamais si localStorage a
// échoué (quota, mode privé, désactivé), pour ne jamais laisser croire à
// une sauvegarde qui n'a pas eu lieu. Ne lève jamais : { success } pour que
// l'appelant puisse réagir en plus (ex. fermer un menu) sans dupliquer la
// détection d'échec.
export function saveGame(session) {
  try {
    const json = JSON.stringify(serializeGame(session));
    localStorage.setItem(STORAGE_KEY, encodeForStorage(json));
  } catch (error) {
    console.warn("saveGame: écriture localStorage impossible, partie non sauvegardée.", error);
    return { success: false };
  }

  playSaveSound();
  announce(t("save.done"), { assertive: true });
  return { success: true };
}

// Lit et désenveloppe la partie sauvegardée -> session valide, ou null si
// absente/invalide. Ne lève jamais : lecture disque, JSON invalide et
// structure implausible sont tous des échecs SILENCIEUX côté appelant
// (juste un avertissement console), jamais une exception qui remonterait.
export function loadGame() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn("loadGame: lecture localStorage impossible.", error);
    return null;
  }
  if (!raw) return null;

  let json;
  try {
    json = decodeFromStorage(raw);
  } catch (error) {
    console.warn("loadGame: désobscurcissement impossible, sauvegarde considérée corrompue.", error);
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    console.warn("loadGame: JSON invalide dans la sauvegarde.", error);
    return null;
  }

  const result = deserializeGame(parsed);
  if (!result.success) {
    console.warn(`loadGame: sauvegarde invalide (raison : ${result.reason}).`);
    return null;
  }
  return result.session;
}

export function hasSave() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
