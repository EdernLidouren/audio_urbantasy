// Brique portable de validation de données : aucune dépendance, utilisable
// par n'importe quel parseur, quel que soit son format — et importable de
// partout sans créer de cycle d'imports.

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Un champ hors de `allowed` est une erreur : une faute de frappe
// (`"descriptonKey"`) retomberait sinon EN SILENCE sur le défaut du champ
// visé. Les champs optionnels restent optionnels : seul un champ que le
// format ne connaît pas échoue. `fail(message)` : l'erreur de l'appelant
// (elle doit lever), pour que le message porte son préfixe.
export function rejectUnknownFields(value, allowed, describe, fail) {
  const unknown = Object.keys(value).filter((field) => !allowed.includes(field));
  if (unknown.length > 0) {
    fail(`${describe} : champ(s) inconnu(s) ${unknown.map((field) => `"${field}"`).join(", ")}.`);
  }
}
