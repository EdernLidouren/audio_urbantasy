// PRNG déterministe (Mulberry32), pur : jamais de Math.random(), jamais de
// fermeture avec état caché. L'état est un simple entier 32 bits, transporté
// dans state.rngState (voir core/state.js) et repassé explicitement à
// chaque tirage — même seed + même suite d'appels = mêmes valeurs, toujours.

// Dérive un état de graine 32 bits à partir d'un nombre ou d'une chaîne
// (hash simple) — accepte les deux pour rester pratique à l'usage (un id de
// scène, un entier fixe en test...).
export function createSeed(seed) {
  if (typeof seed === "number") return seed >>> 0;

  let hash = 0;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// Une étape pure : à partir de l'état courant, calcule le nouvel état ET une
// valeur dans [0, 1). Algorithme Mulberry32 (implémentation de référence
// largement utilisée), adapté en pur — l'appelant repasse explicitement
// l'état renvoyé au prochain appel, rien n'est muté ici.
export function nextRandom(state) {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a >>> 0 };
}

// Tire une clé de `weights` ({ clé: poids }) au prorata de son poids — poids
// RELATIFS, normalisés ici par leur somme ; un poids nul ou négatif n'est
// jamais tiré. Un seul pas de PRNG. Partagé par la météo (transitions) et
// la collecte (tables d'objets) : une seule logique de tirage pondéré. Les
// appelants garantissent au moins un poids positif (validation au
// chargement). -> { key, rngState }
export function pickWeighted(weights, rngState) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const { value, state } = nextRandom(rngState);
  let threshold = value * total;
  for (const [key, weight] of entries) {
    threshold -= weight;
    if (threshold < 0) return { key, rngState: state };
  }
  // Filet de robustesse flottante (arrondi en fin de parcours).
  return { key: entries[entries.length - 1][0], rngState: state };
}
