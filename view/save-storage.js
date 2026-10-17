// Accès disque pour la SAUVEGARDE DE PARTIE (localStorage ET fichier —
// export/import, voir exportGame/importGame plus bas) — distinct de
// config/preferences.js (clé différente, format différent : une PARTIE, pas
// des réglages). La forme/validation reste dans core/save.js (pur) ; ce
// module ne fait QUE lire/écrire le disque, brancher l'obscurcissement (voir
// lib/obfuscate.js) et le retour sensoriel (son seul, voir playSaveSound)
// d'une sauvegarde réussie — jamais de logique de partie ici. importGame en particulier ne
// REMPLACE rien elle-même : elle renvoie une session candidate, à charge de
// l'appelant de décider de l'appliquer (voir view/menus/save-menu.js).
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
import registry from "../entities/types/index.js";
import { obfuscate, deobfuscate } from "../lib/obfuscate.js";
import { playOneShot } from "../lib/audio.js";
import { resolveAsset } from "../lib/assets.js";
import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";

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

// Clé de POOL, chemin complet (assets/<dossier>/<pool>) — comme partout
// ailleurs dans le manifeste (voir tools/build_audio_manifest.py) : jamais
// juste le nom du pool seul, resolveAsset ne le trouverait pas.
// resolveAsset reste défensif si le fichier ou le manifeste manquait
// (intercepté ci-dessous, jamais de crash, juste pas de son).
const SAVE_SOUND_KEY = "assets/sounds/ui/save";

// Exporté : réutilisé tel quel pour le retour sensoriel d'un import de
// partie réussi (voir view/menus/save-menu.js) — même son que la
// sauvegarde, traité comme le repère général "donnée écrite/restaurée avec
// succès", pas seulement "sauvegarde". Préférence saveSoundEnabled (Options
// > Sauvegarde) vérifiée ICI, au point d'émission unique : couvre les deux
// appelants (sauvegarde ET import) sans dupliquer le garde-fou.
export function playSaveSound() {
  if (!getPref("saveSoundEnabled", PREF_CONSTRAINTS.saveSoundEnabled.default)) return;

  try {
    // Catégorie "interface" (Options > Audio) : même son que les menus, même
    // curseur de volume — voir config/preferences.js/interfaceVolume et
    // view/menu-sounds.js.
    const factor = getPref("interfaceVolume", PREF_CONSTRAINTS.interfaceVolume.default) / 100;
    playOneShot(resolveAsset(SAVE_SOUND_KEY), { volume: factor });
  } catch (error) {
    console.warn(`saveGame: son de sauvegarde indisponible ("${SAVE_SOUND_KEY}") : ${error.message}`);
  }
}

// Sérialise + écrit la partie sur disque. Retour sensoriel UNIQUEMENT si
// l'écriture a réellement réussi — jamais si localStorage a échoué (quota,
// mode privé, désactivé), pour ne jamais laisser croire à une sauvegarde
// qui n'a pas eu lieu. Volontairement SANS annonce parlée (juste le son,
// voir playSaveSound) : une sauvegarde manuelle ou temporelle est un
// évènement fréquent, une confirmation lue à chaque fois serait plus
// bruyante qu'utile — le son suffit, et reste lui-même désactivable (voir
// la préférence saveSoundEnabled). SON optionnel côté appelant (playSound,
// défaut true) — la sauvegarde auto sur TRANSITION (voir city-screen.js) le
// désactive explicitement, pour ne jamais se superposer au reste de
// l'ambiance sonore d'une simple traversée de porte. Ne lève jamais :
// { success } pour que l'appelant puisse réagir en plus (ex. fermer un
// menu) sans dupliquer la détection d'échec.
export function saveGame(session, { playSound = true } = {}) {
  try {
    const json = JSON.stringify(serializeGame(session));
    localStorage.setItem(STORAGE_KEY, encodeForStorage(json));
  } catch (error) {
    console.warn("saveGame: écriture localStorage impossible, partie non sauvegardée.", error);
    return { success: false };
  }

  if (playSound) playSaveSound();
  return { success: true };
}

// Désenveloppe une sauvegarde déjà décodée, avec le registre de types
// (core/save.js/deserializeGame) : une entité d'un type disparu est retirée
// plutôt que de faire planter la scène. Point commun de loadGame et
// importGame.
function readSave(parsed) {
  const result = deserializeGame(parsed, { registry });
  if (result.success && result.droppedEntities.length > 0) {
    console.warn(
      "Sauvegarde : entités retirées, type inconnu (à ajouter dans config/save-renames.js si c'est un renommage) :",
      result.droppedEntities
    );
  }
  return result;
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

  const result = readSave(parsed);
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

// Déclenche le téléchargement d'un fichier texte — même mécanique que
// config/preferences.js/exportPreferences (Blob + <a download> détaché,
// jamais ajouté au DOM), généralisée ici pour être réutilisée par
// exportGame ci-dessous sans dupliquer la logique.
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Lit un File en texte — même mécanique que config/preferences.js/
// importPreferences (FileReader), généralisée ici pour être réutilisée par
// importGame ci-dessous.
function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("lecture du fichier impossible"));
    reader.onload = () => resolve(reader.result);
    reader.readAsText(file);
  });
}

// Exporte la partie COURANTE dans un fichier, OBSCURCIE — même couche et
// même format que le stockage local (préfixe + blob), pour rester
// cohérente et non éditable trivialement. Non destructif : aucune
// confirmation nécessaire (voir importGame pour l'inverse).
export function exportGame(session) {
  const json = JSON.stringify(serializeGame(session));
  downloadTextFile("templeton-partie.json", encodeForStorage(json));
}

// Lit un fichier de partie exportée -> { success, session } ou { success:
// false, reason }. Gère l'obscurci ET le clair en repli (même détection de
// préfixe que loadGame ci-dessus). Ne REMPLACE rien elle-même : renvoie
// juste une session CANDIDATE, la décision de l'appliquer (destructif)
// revient à l'appelant (voir view/menus/save-menu.js, qui demande
// confirmation avant). Ne lève jamais.
// reason ∈ "read" (FileReader), "obfuscation" (désobscurcissement), "parse"
// (JSON invalide), ou une raison de deserializeGame ("format"/"version"/
// "invalid").
export async function importGame(file) {
  let raw;
  try {
    raw = await readTextFile(file);
  } catch {
    return { success: false, reason: "read" };
  }

  let json;
  try {
    json = decodeFromStorage(raw);
  } catch {
    return { success: false, reason: "obfuscation" };
  }

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { success: false, reason: "parse" };
  }

  const result = readSave(parsed);
  if (!result.success) {
    return { success: false, reason: result.reason };
  }
  return { success: true, session: result.session };
}
