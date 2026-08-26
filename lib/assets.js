// Brique portable : résolution d'une CLÉ d'asset vers un CHEMIN de fichier,
// à partir d'un manifeste { pool: [chemins...] } (voir
// tools/build_audio_manifest.py). Aucune connaissance de Howler, de l'audio
// spatial, ni du core — cette fonction rend un chemin, elle ne joue rien.
// Le manifeste lui-même est chargé AILLEURS (au bord, voir main.js) puis
// injecté ici via configureAssetManifest, jamais fetché par ce module —
// même principe que configureMenuPreferences (lib/menu.js) : ce fichier
// reste déposable tel quel dans un autre projet.
//
// resolveAsset(key) :
//   - key est une clé de PREMIER NIVEAU du manifeste (un pool) -> tire un
//     fichier de ce pool (voir pickFromPool).
//   - sinon, key correspond à un MEMBRE précis d'un pool (chemin complet
//     avec extension, ex. "assets/musics/city_by_day_2.mp3", OU sans
//     extension, ex. "assets/musics/city_by_day_2") -> ce fichier exact,
//     sans tirage. Un chemin déjà complet vers un fichier réellement listé
//     dans le manifeste rentre dans ce cas — il se résout à lui-même.
//   - sinon -> erreur, nommant la clé (jamais d'échec muet).

let manifest = null;
// "chemin sans extension" ET "chemin avec extension" -> chemin complet
// (avec extension) : construit une seule fois à la configuration, pas à
// chaque appel de resolveAsset.
let memberIndex = null;

export function configureAssetManifest(loadedManifest) {
  manifest = loadedManifest;
  memberIndex = new Map();
  for (const files of Object.values(manifest)) {
    for (const file of files) {
      const dot = file.lastIndexOf(".");
      const withoutExt = dot >= 0 ? file.slice(0, dot) : file;
      memberIndex.set(file, file);
      memberIndex.set(withoutExt, file);
    }
  }
}

// Dernier fichier tiré par pool — isolé ici pour que la politique de tirage
// (aujourd'hui : équiprobable sauf répétition immédiate) reste facile à
// ajuster plus tard (ex. pondération) sans toucher à resolveAsset.
const lastPicked = new Map();

function pickFromPool(poolKey, files) {
  if (files.length === 1) return files[0];

  // Exclut le dernier tiré de CE pool avant de tirer : jamais de boucle de
  // re-tirage, un seul Math.random(), résultat déterministe même dans le
  // pire cas.
  const previous = lastPicked.get(poolKey);
  const candidates = previous === undefined ? files : files.filter((file) => file !== previous);
  const pick = candidates[Math.floor(Math.random() * candidates.length)];

  lastPicked.set(poolKey, pick);
  return pick;
}

export function resolveAsset(key) {
  if (!manifest) {
    throw new Error(`resolveAsset: manifeste non chargé (clé "${key}").`);
  }

  const pool = manifest[key];
  if (pool) {
    return pickFromPool(key, pool);
  }

  const member = memberIndex.get(key);
  if (member) {
    return member;
  }

  throw new Error(`resolveAsset: clé "${key}" introuvable (ni pool, ni fichier membre d'un pool).`);
}

// Vérifie l'existence d'une clé SANS résoudre ni tirer (jamais d'exception,
// contrairement à resolveAsset) — pour un appelant qui doit choisir entre
// PLUSIEURS clés candidates par ordre de préférence (voir
// view/audio/city-scene.js, résolution du son de pas par surface/gait) et a
// besoin de savoir AVANT d'appeler resolveAsset laquelle existe réellement.
// Manifeste non chargé -> false, jamais une exception : un appelant qui
// teste l'existence avant de résoudre doit pouvoir dégrader proprement.
export function hasAsset(key) {
  if (!manifest) return false;
  return Boolean(manifest[key]) || memberIndex.has(key);
}
