// Brique portable : obscurcissement de chaîne (PAS du chiffrement). Ne
// connaît QUE des chaînes — ni sauvegarde, ni partie, ni versioning
// (l'intégration et le préfixe de format restent chez l'appelant).
//
// AVERTISSEMENT EXPLICITE, assumé : ceci ne sécurise RIEN. Un XOR à clé
// fixe (fournie par l'appelant) est trivialement inversible par quiconque
// lit le code — et comme le code tourne CÔTÉ CLIENT, toute "clé" qu'il
// contient est par construction publique (livrée telle quelle au
// navigateur). Chiffrer réellement une sauvegarde locale n'aurait de toute
// façon aucun sens : la clé devrait être livrée avec le jeu pour pouvoir la
// relire, donc tout aussi publique. Le seul objectif ici est de décourager
// l'édition triviale d'un fichier de save (garde-fou contre la triche
// accidentelle, pas contre la triche déterminée) — jamais présenté comme
// autre chose.

// Une clé vide ne brouillerait rien (XOR modulo zéro) : refusée, jamais un
// fichier écrit en clair en croyant l'avoir obscurci.
function xorBytes(bytes, key) {
  const keyBytes = new TextEncoder().encode(key ?? "");
  if (keyBytes.length === 0) throw new Error("lib/obfuscate: clé vide.");
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return out;
}

// Uint8Array -> base64. btoa attend une "chaîne binaire" (un caractère par
// octet, code <= 255) : après XOR, c'est toujours vrai (le XOR reste dans
// [0,255]) — la correction UTF-8 se joue EN AMONT, via TextEncoder (voir
// obfuscate ci-dessous), jamais ici.
function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// text (UTF-8, accents compris) -> chaîne obscurcie (base64). Encode
// D'ABORD en octets UTF-8 (TextEncoder) AVANT le XOR : travailler sur les
// octets, jamais sur les code units UTF-16 d'une chaîne JS, est ce qui
// garantit qu'aucun caractère accentué n'est corrompu. `key` : chaîne
// non vide propre au jeu ; la changer rend illisible tout ce qui a été
// obscurci avec l'ancienne.
export function obfuscate(text, key) {
  const utf8Bytes = new TextEncoder().encode(text);
  return bytesToBase64(xorBytes(utf8Bytes, key));
}

// Inverse exact de obfuscate : base64 -> octets -> XOR (auto-inverse, même
// opération) -> décodage UTF-8 STRICT (fatal:true). Peut lever (base64
// invalide, ou octets qui ne forment plus de l'UTF-8 valide après XOR avec
// la mauvaise clé/donnée corrompue) — laissé tel quel à l'appelant : une
// donnée qui ne se désobscurcit pas
// correctement doit être traitée comme suspecte, jamais "réparée" en douce
// (repli silencieux sur des caractères de remplacement).
export function deobfuscate(blob, key) {
  const xored = base64ToBytes(blob);
  const utf8Bytes = xorBytes(xored, key);
  return new TextDecoder("utf-8", { fatal: true }).decode(utf8Bytes);
}
