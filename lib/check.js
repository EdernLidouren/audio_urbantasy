// Petit moteur de VÉRIFICATIONS, générique : ne connaît rien du jeu. Une
// suite est une liste de DOMAINES `{ name, check }` ; `check(run)` appelle,
// pour chaque vérification :
//   - `run(label, expected, actual)` : égalité STRICTE (Object.is) — nombres,
//     chaînes, booléens, ou MÊME référence ;
//   - `run.same(label, expected, actual)` : égalité de STRUCTURE (objets,
//     tableaux, valeurs), clé par clé, ordre des clés indifférent ; en cas
//     d'échec, les premières divergences sont nommées (voir diffStructure).
// Aides : `throws(fn)` (vrai si fn lève une exception) et `fail(message)`
// (lève une exception — le `fail` attendu par les validateurs du jeu).
//
// Sortie : seuls les ÉCHECS sont affichés (plus chaque réussite en mode
// `verbose`), puis un récapitulatif par domaine et un total. Une exception
// dans un domaine compte comme UN échec de ce domaine et n'arrête jamais les
// suivants. Aucune dépendance au DOM : utilisable dans un navigateur comme
// sous Node.

// Lance les domaines de `suites` (tous, ou seulement ceux nommés par `only` :
// un nom ou un tableau de noms) et rend `{ passed, total, domains }`, où
// `domains[name] = { passed, total }`.
export function runCheckSuites(suites, { only, verbose = false, log = console.log } = {}) {
  const wanted = only === undefined ? null : new Set(Array.isArray(only) ? only : [only]);
  const selected = wanted ? suites.filter((suite) => wanted.has(suite.name)) : suites;
  if (wanted) {
    const unknown = [...wanted].filter((name) => !suites.some((suite) => suite.name === name));
    if (unknown.length > 0) {
      log(`Vérifs : domaine(s) inconnu(s) ${unknown.join(", ")}. Domaines : ${suites.map((suite) => suite.name).join(", ")}.`);
    }
  }

  let passed = 0;
  let total = 0;
  const domains = {};
  for (const { name, check } of selected) {
    let domainPassed = 0;
    let domainTotal = 0;
    // Comptabilise UNE vérification ; `describeFailure` n'est appelé qu'en
    // cas d'échec.
    const record = (label, pass, describeFailure) => {
      domainTotal += 1;
      if (pass) {
        domainPassed += 1;
        if (verbose) log(`OK [${name}] : ${label}`);
      } else {
        log(`ECHEC [${name}] : ${label} — ${describeFailure()}`);
      }
    };
    const run = (label, expected, actual) =>
      record(label, Object.is(expected, actual), () => `attendu ${expected}, obtenu ${actual}`);
    run.same = (label, expected, actual) => {
      const diffs = [];
      diffStructure(expected, actual, "valeur", diffs);
      record(label, diffs.length === 0, () => `structures différentes : ${diffs.slice(0, 3).join(" ; ")}${diffs.length > 3 ? " ; ..." : ""}`);
    };
    try {
      check(run);
    } catch (error) {
      domainTotal += 1;
      log(`ECHEC [${name}] : exception, domaine interrompu — ${(error && error.stack) || error}`);
    }
    domains[name] = { passed: domainPassed, total: domainTotal };
    passed += domainPassed;
    total += domainTotal;
  }

  for (const [name, result] of Object.entries(domains)) {
    log(`${result.passed === result.total ? "  " : "! "}${name} : ${result.passed}/${result.total}`);
  }
  log(`Récapitulatif : ${passed} réussis / ${total} total`);
  return { passed, total, domains };
}

// Vrai si `fn()` lève une exception (validation refusée, etc.).
export function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// Lève une exception portant `message` : le `fail` que les validateurs
// attendent en paramètre (ex. `validateDistribution(d, "d", fail)`), pour
// les vérifier avec `throws`.
export function fail(message) {
  throw new Error(message);
}

// --- Audit de sérialisabilité : un état qui doit survivre à un aller-retour
// JSON (sauvegarde) ne doit contenir que de la donnée pure. ---

// Décrit une valeur pour un message de diagnostic : JSON.stringify
// renvoie undefined (la valeur, pas une chaîne) pour une fonction, peu
// lisible tel quel dans un message.
function describeValue(value) {
  return typeof value === "function" ? `[Function ${value.name || "anonyme"}]` : JSON.stringify(value);
}

// Type "logique" d'une valeur pour la comparaison de structure : NaN/
// Infinity/-Infinity partagent un type distinct des nombres finis — JSON
// les convertit TOUS en null, contrairement à un nombre fini qui survit
// tel quel.
function logicalType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && !Number.isFinite(value)) return "non-finite-number";
  return typeof value;
}

// Parcourt `value` et signale toute donnée qui ne survivrait pas à
// JSON.stringify : fonction, nombre non fini, référence circulaire, objet
// non "plain" (Map/Set/Date/instance de classe — JSON les sérialise de
// façon inattendue, parfois vide). Fonctionne même si JSON.stringify
// planterait (cycle) : ne dépend d'aucune tentative de sérialisation
// réelle. `seen` ne piste que la branche COURANTE de la récursion (ajout
// à l'entrée, retrait à la sortie) : partager la même référence depuis
// deux branches distinctes n'est pas un cycle, seul un ancêtre qui se
// retrouve dans son propre sous-arbre en est un.
export function auditNonSerializable(value, path, seen, findings) {
  if (value === null || value === undefined) return;
  const type = typeof value;

  if (type === "function") {
    findings.push(`${path} : fonction (${value.name || "anonyme"}) — disparaîtrait silencieusement`);
    return;
  }
  if (type === "number" && !Number.isFinite(value)) {
    findings.push(`${path} : nombre non fini (${value}) — deviendrait null`);
    return;
  }
  if (type !== "object") return;

  if (seen.has(value)) {
    findings.push(`${path} : référence circulaire`);
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, i) => auditNonSerializable(item, `${path}[${i}]`, seen, findings));
  } else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      findings.push(`${path} : objet non "plain" (${proto?.constructor?.name ?? "?"})`);
    }
    for (const key of Object.keys(value)) {
      auditNonSerializable(value[key], `${path}.${key}`, seen, findings);
    }
  }

  seen.delete(value);
}

// Diffère deux structures déjà décodées (avant/après aller-retour JSON) et
// liste précisément chaque divergence (clé apparue/disparue, changement
// de type, changement de valeur) plutôt qu'un simple pass/fail.
export function diffStructure(a, b, path, diffs) {
  if (Object.is(a, b)) return;

  const typeA = logicalType(a);
  const typeB = logicalType(b);
  if (typeA !== typeB) {
    diffs.push(`${path} : ${typeA} -> ${typeB} (${describeValue(a)} -> ${describeValue(b)})`);
    return;
  }
  if (typeA === "array") {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) diffStructure(a[i], b[i], `${path}[${i}]`, diffs);
    return;
  }
  if (typeA === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const inA = Object.prototype.hasOwnProperty.call(a, key);
      const inB = Object.prototype.hasOwnProperty.call(b, key);
      if (inA && !inB) diffs.push(`${path}.${key} : présent avant, absent après (${describeValue(a[key])})`);
      else if (!inA && inB) diffs.push(`${path}.${key} : absent avant, apparu après (${describeValue(b[key])})`);
      else diffStructure(a[key], b[key], `${path}.${key}`, diffs);
    }
    return;
  }
  diffs.push(`${path} : ${describeValue(a)} -> ${describeValue(b)}`);
}
