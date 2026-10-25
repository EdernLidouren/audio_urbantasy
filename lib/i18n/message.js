// GABARITS DE TEXTE : analyse et rendu d'un sous-ensemble d'ICU
// MessageFormat classique (plural, selectordinal, select), plus trois
// extensions propres à ce moteur : les formes de nom ({scene:def}), le
// choix sur un attribut de nom ({item:gender, select, …}) et les listes
// ({details, list}). La grammaire complète, ses écarts avec ICU et ses
// exemples vivent dans doc/i18n.md/"Grammaire des textes" ; ce fichier n'en
// répète que ce qu'il faut pour lire le code.
//
// Portable : aucune connaissance d'aucun jeu ni d'aucune langue. Les règles
// propres à une langue viennent d'Intl (PluralRules, NumberFormat,
// ListFormat) ; les formes et attributs de nom qu'une langue reconnaît sont
// reçus en paramètre (normalizeGrammar), jamais codés ici.
//
// Deux temps, comme pour les scènes : parseMessage valide et compile UNE
// fois, au chargement (une faute lève une erreur claire, le texte n'est
// jamais rendu cassé en silence) ; renderMessage rend un gabarit déjà
// compilé, sans jamais lever : un paramètre manquant ou du mauvais type est
// signalé (env.warn) et dégradé proprement.
//
// Écart volontaire avec ICU : l'apostrophe est TOUJOURS littérale (aucun
// échappement, « l'hôtel » s'écrit tel quel) et il n'existe aucune accolade
// littérale — une accolade isolée est une erreur.

// Référence à un NOM, passée en paramètre à la place d'un texte déjà
// traduit : le gabarit choisit lui-même la forme dont sa langue a besoin
// ({scene:def}), ou la forme de base par défaut ({scene}). Une classe
// plutôt qu'un objet littéral : `instanceof` distingue sans ambiguïté une
// référence d'une valeur ordinaire.
export class NameRef {
  constructor(key) {
    this.key = key;
  }
}

export function nameRef(key) {
  return new NameRef(key);
}

// Types de bloc reconnus après « {param, ». Tout autre mot est une erreur.
const BLOCK_TYPES = new Set(["plural", "selectordinal", "select", "list"]);

// Un identifiant : nom de paramètre, de forme, d'attribut, de type de bloc,
// ou clé de branche (catégorie de pluriel, valeur de select).
const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;

// Forme toujours présente d'un nom, jamais déclarable comme forme ou
// attribut (voir normalizeGrammar).
const BASE_FORM = "base";

// --- Grammaire déclarée d'une langue ---------------------------------------

// Grammaire d'UNE langue telle que déclarée par le contenu :
// { forms: ["def", ...], attributes: { gender: ["m", "f"], ... } }, les
// deux champs optionnels. Rend { forms: Set, attributes: Map(nom -> Set) }.
// Lève sur toute forme invalide : un nom qui n'est pas un identifiant, une
// forme ou un attribut nommé "base", un nom déclaré deux fois, un attribut
// sans valeurs, un champ inconnu.
export function normalizeGrammar(raw = {}) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("la grammaire doit être un objet { forms, attributes }");
  }
  for (const field of Object.keys(raw)) {
    if (field !== "forms" && field !== "attributes") throw new Error(`champ de grammaire inconnu « ${field} »`);
  }
  const forms = raw.forms ?? [];
  const attributes = raw.attributes ?? {};
  if (!Array.isArray(forms)) throw new Error("« forms » doit être un tableau de noms");
  if (attributes === null || typeof attributes !== "object" || Array.isArray(attributes)) {
    throw new Error("« attributes » doit être un objet { nom: [valeurs] }");
  }

  const declared = new Set();
  const declare = (name, what) => {
    if (typeof name !== "string" || !isIdentifier(name)) throw new Error(`${what} invalide : ${JSON.stringify(name)}`);
    if (name === BASE_FORM) throw new Error(`« ${BASE_FORM} » est la forme implicite de tout nom, jamais déclarée`);
    if (declared.has(name)) throw new Error(`« ${name} » déclaré deux fois (forme ou attribut)`);
    declared.add(name);
  };

  for (const form of forms) declare(form, "nom de forme");
  const attributeValues = new Map();
  for (const [name, values] of Object.entries(attributes)) {
    declare(name, "nom d'attribut");
    if (!Array.isArray(values) || values.length === 0) throw new Error(`l'attribut « ${name} » doit lister ses valeurs`);
    for (const value of values) {
      if (typeof value !== "string" || !isIdentifier(value)) {
        throw new Error(`valeur invalide pour l'attribut « ${name} » : ${JSON.stringify(value)}`);
      }
    }
    attributeValues.set(name, new Set(values));
  }
  return { forms: new Set(forms), attributes: attributeValues };
}

// Valeur d'une clé de NOM écrite en objet de formes :
// { "base": "grand-place", "def": "la grand-place", "gender": "f" }.
// `base` obligatoire et non vide ; toute autre clé est une forme ou un
// attribut DÉCLARÉ pour cette langue, de valeur chaîne (une valeur
// d'attribut parmi celles déclarées). Les formes sont du texte LITTÉRAL :
// une accolade y serait un gabarit qui ne s'analyse jamais, refusée.
export function validateNameValue(value, grammar) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("une valeur doit être une chaîne ou un objet de formes { base, ... }");
  }
  if (typeof value.base !== "string" || value.base === "") {
    throw new Error("un objet de formes doit avoir une forme « base » non vide");
  }
  for (const [name, text] of Object.entries(value)) {
    if (typeof text !== "string") throw new Error(`la forme « ${name} » doit être une chaîne`);
    if (name === BASE_FORM || grammar.forms.has(name)) {
      if (/[{}]/.test(text)) throw new Error(`la forme « ${name} » contient une accolade : une forme est du texte littéral`);
      continue;
    }
    const allowed = grammar.attributes.get(name);
    if (!allowed) throw new Error(`forme ou attribut « ${name} » non déclaré pour cette langue (data/i18n/grammar.json)`);
    if (!allowed.has(text)) {
      throw new Error(`valeur « ${text} » inconnue pour l'attribut « ${name} » (attendu : ${[...allowed].join(", ")})`);
    }
  }
}

// --- Analyse -----------------------------------------------------------------

// Compile `text` en une liste de nœuds :
//   { type: "text", value }
//   { type: "arg", name, form }                 — {name} ou {name:form}
//   { type: "pound" }                           — « # » dans une branche de plural/selectordinal
//   { type: "plural" | "selectordinal", name, branches }
//   { type: "select", name, attribute, branches }
//   { type: "list", name }
// `branches` : Map(clé -> nœuds), clé = catégorie, valeur de select ou
// « =N ». `locale` sert à vérifier les catégories de pluriel ; `grammar`
// (sortie de normalizeGrammar) les formes et attributs. Lève une Error
// dont le message situe la faute (position dans le texte).
export function parseMessage(text, { locale, grammar }) {
  const parser = { text, pos: 0, locale, grammar };
  return parseNodes(parser, null);
}

// Nœuds jusqu'à la fin du texte (niveau supérieur, `branch` null) ou
// jusqu'à l'accolade qui ferme la branche en cours (laissée au lecteur
// pour que l'appelant la consomme). `branch.pound` : « # » vaut le nombre.
function parseNodes(parser, branch) {
  const nodes = [];
  let textStart = parser.pos;
  const flushText = () => {
    if (parser.pos > textStart) pushText(nodes, parser.text.slice(textStart, parser.pos));
  };

  while (parser.pos < parser.text.length) {
    const char = parser.text[parser.pos];
    if (char === "{") {
      flushText();
      nodes.push(parsePlaceholder(parser, branch));
      textStart = parser.pos;
    } else if (char === "}") {
      if (!branch) throw syntaxError(parser, "accolade fermante isolée");
      flushText();
      return nodes;
    } else if (char === "#" && branch && branch.pound) {
      flushText();
      nodes.push({ type: "pound" });
      parser.pos += 1;
      textStart = parser.pos;
    } else {
      parser.pos += 1;
    }
  }
  if (branch) throw syntaxError(parser, "branche non fermée (« } » manquante)");
  flushText();
  return nodes;
}

// Un « {...} » : paramètre simple, forme de nom, ou bloc. Le curseur est
// sur l'accolade ouvrante ; il sort juste après l'accolade fermante.
function parsePlaceholder(parser, branch) {
  const start = parser.pos;
  parser.pos += 1;
  skipSpaces(parser);
  const name = readIdentifier(parser, "nom de paramètre attendu après « { »");
  let sub = null;
  if (parser.text[parser.pos] === ":") {
    parser.pos += 1;
    sub = readIdentifier(parser, "nom de forme ou d'attribut attendu après « : »");
  }
  skipSpaces(parser);

  if (parser.text[parser.pos] === "}") {
    parser.pos += 1;
    if (sub !== null) {
      if (parser.grammar.attributes.has(sub)) {
        throw syntaxError(parser, `l'attribut « ${sub} » ne s'affiche pas, il ne sert qu'à un select`, start);
      }
      if (!parser.grammar.forms.has(sub)) {
        throw syntaxError(parser, `forme « ${sub} » non déclarée pour la langue « ${parser.locale} »`, start);
      }
    }
    return { type: "arg", name, form: sub };
  }

  if (parser.text[parser.pos] !== ",") throw syntaxError(parser, "« } » ou « , » attendu");
  parser.pos += 1;
  skipSpaces(parser);
  const type = readIdentifier(parser, "type de bloc attendu (plural, selectordinal, select, list)");
  if (!BLOCK_TYPES.has(type)) throw syntaxError(parser, `type de bloc inconnu « ${type} »`, start);
  // Une branche ne contient que du texte, des paramètres et « # » : une
  // imbrication rendrait les gabarits illisibles, aucun n'en a besoin.
  if (branch) throw syntaxError(parser, `bloc « ${type} » imbriqué dans une branche`, start);
  skipSpaces(parser);

  if (type === "list") {
    if (sub !== null) throw syntaxError(parser, "une liste ne prend ni forme ni attribut", start);
    expectChar(parser, "}");
    return { type: "list", name };
  }
  if (type === "select") {
    if (sub !== null && !parser.grammar.attributes.has(sub)) {
      throw syntaxError(parser, `attribut « ${sub} » non déclaré pour la langue « ${parser.locale} »`, start);
    }
  } else if (sub !== null) {
    throw syntaxError(parser, `un bloc « ${type} » porte sur un nombre, pas sur une forme ni un attribut`, start);
  }
  expectChar(parser, ",");
  const branches = parseBranches(parser, type, sub, start);
  return type === "select" ? { type, name, attribute: sub, branches } : { type, name, branches };
}

// Branches « clé {texte} » jusqu'à l'accolade fermante du bloc.
function parseBranches(parser, type, attribute, start) {
  const branches = new Map();
  const pound = type !== "select";
  for (;;) {
    skipSpaces(parser);
    if (parser.pos >= parser.text.length) throw syntaxError(parser, `bloc « ${type} » non fermé`, start);
    if (parser.text[parser.pos] === "}") {
      parser.pos += 1;
      break;
    }
    let key;
    if (parser.text[parser.pos] === "=") {
      if (type === "select") throw syntaxError(parser, "« =N » n'a de sens que dans un plural ou un selectordinal");
      parser.pos += 1;
      const digits = readWhile(parser, /[0-9]/);
      if (digits === "") throw syntaxError(parser, "nombre attendu après « = »");
      key = `=${digits}`;
    } else {
      key = readIdentifier(parser, "clé de branche attendue");
    }
    if (branches.has(key)) throw syntaxError(parser, `branche « ${key} » déclarée deux fois`);
    skipSpaces(parser);
    if (parser.text[parser.pos] !== "{") throw syntaxError(parser, `« { » attendu après la branche « ${key} »`);
    parser.pos += 1;
    const nodes = parseNodes(parser, { pound });
    parser.pos += 1; // accolade fermante de la branche
    branches.set(key, nodes);
  }
  if (!branches.has("other")) throw syntaxError(parser, `bloc « ${type} » sans branche « other »`, start);
  checkBranchKeys(parser, type, attribute, branches, start);
  return branches;
}

// Clés permises : pour plural/selectordinal, les catégories que la langue
// connaît (Intl.PluralRules) et « =N » ; pour un select sur un attribut,
// ses valeurs déclarées ; pour un select sur un paramètre, toute clé.
function checkBranchKeys(parser, type, attribute, branches, start) {
  let allowed = null;
  if (type === "plural" || type === "selectordinal") {
    allowed = pluralCategories(parser.locale, type === "plural" ? "cardinal" : "ordinal");
  } else if (attribute !== null) {
    allowed = parser.grammar.attributes.get(attribute);
  }
  if (!allowed) return;
  for (const key of branches.keys()) {
    if (key === "other" || key.startsWith("=")) continue;
    if (!allowed.has(key)) {
      const what = attribute !== null ? `valeur de l'attribut « ${attribute} »` : `catégorie de « ${parser.locale} »`;
      throw syntaxError(parser, `« ${key} » n'est pas une ${what} (permis : ${[...allowed].join(", ")})`, start);
    }
  }
}

function pushText(nodes, value) {
  const last = nodes[nodes.length - 1];
  if (last && last.type === "text") last.value += value;
  else nodes.push({ type: "text", value });
}

function isIdentifier(text) {
  return text.length > 0 && [...text].every((char) => IDENTIFIER_CHAR.test(char));
}

function readWhile(parser, pattern) {
  const start = parser.pos;
  while (parser.pos < parser.text.length && pattern.test(parser.text[parser.pos])) parser.pos += 1;
  return parser.text.slice(start, parser.pos);
}

function readIdentifier(parser, expected) {
  const identifier = readWhile(parser, IDENTIFIER_CHAR);
  if (identifier === "") throw syntaxError(parser, expected);
  return identifier;
}

function skipSpaces(parser) {
  readWhile(parser, /\s/);
}

function expectChar(parser, char) {
  skipSpaces(parser);
  if (parser.text[parser.pos] !== char) throw syntaxError(parser, `« ${char} » attendu`);
  parser.pos += 1;
}

function syntaxError(parser, reason, at = parser.pos) {
  return new Error(`${reason} (position ${at})`);
}

// --- Règles de langue (Intl), mises en cache ------------------------------

const intlCache = new Map();
function cached(id, create) {
  if (!intlCache.has(id)) intlCache.set(id, create());
  return intlCache.get(id);
}

function pluralRules(locale, type) {
  return cached(`plural:${type}:${locale}`, () => new Intl.PluralRules(locale, { type }));
}

function pluralCategories(locale, type) {
  return cached(`categories:${type}:${locale}`, () => new Set(pluralRules(locale, type).resolvedOptions().pluralCategories));
}

// Nombres : séparateurs et décimale de la langue (« 1 000 000 », « 12,5 »
// en français ; « 1,000,000 » en anglais).
function formatNumber(locale, value) {
  return cached(`number:${locale}`, () => new Intl.NumberFormat(locale)).format(value);
}

function formatList(locale, items) {
  return cached(`list:${locale}`, () => new Intl.ListFormat(locale, { type: "conjunction" })).format(items);
}

// --- Rendu -------------------------------------------------------------------

// Rend des nœuds compilés. `env` : { locale (la langue DU GABARIT, celle de
// ses règles de pluriel), lookupName(clé) -> valeur de la clé de nom
// (chaîne, objet de formes ou undefined), warn(message) }. Ne lève jamais.
export function renderMessage(nodes, params, env) {
  return renderNodes(nodes, params ?? {}, env, undefined);
}

function renderNodes(nodes, params, env, count) {
  let out = "";
  for (const node of nodes) out += renderNode(node, params, env, count);
  return out;
}

function renderNode(node, params, env, count) {
  switch (node.type) {
    case "text":
      return node.value;
    case "pound":
      return typeof count === "number" ? formatNumber(env.locale, count) : String(count);
    case "arg":
      return renderArg(node, params, env);
    case "list":
      return renderList(node, params, env);
    case "select":
      return renderSelect(node, params, env);
    default:
      return renderPlural(node, params, env);
  }
}

// Un paramètre manquant est laissé tel quel dans le texte et signalé :
// visible en test, jamais une exception en pleine annonce.
function missing(placeholder, env) {
  env.warn(`placeholder « ${placeholder} » manquant`);
  return placeholder;
}

function renderArg(node, params, env) {
  const value = params[node.name];
  const placeholder = node.form ? `{${node.name}:${node.form}}` : `{${node.name}}`;
  if (value === undefined) return missing(placeholder, env);
  if (!node.form) return displayValue(value, env);
  if (!(value instanceof NameRef)) {
    env.warn(`« ${placeholder} » attend une référence de nom (nameRef)`);
    return displayValue(value, env);
  }
  return nameForm(value, node.form, env);
}

// Valeur affichée telle quelle : nom -> sa forme de base, nombre -> formaté
// à la langue, chaîne -> inchangée (un nombre déjà mis en texte par
// l'appelant, ex. une position arrondie, n'est jamais reformaté).
function displayValue(value, env) {
  if (value instanceof NameRef) return nameForm(value, null, env);
  if (typeof value === "number") return formatNumber(env.locale, value);
  return String(value);
}

// Forme `form` (null : la base) du nom référencé. Une forme absente
// retombe sur la base, signalée : l'audit du contenu la repère en amont.
function nameForm(ref, form, env) {
  const value = env.lookupName(ref.key);
  if (value === undefined) {
    env.warn(`nom « ${ref.key} » introuvable`);
    return ref.key;
  }
  const forms = typeof value === "string" ? { base: value } : value;
  if (form === null) return forms.base;
  if (typeof forms[form] === "string") return forms[form];
  env.warn(`forme « ${form} » absente du nom « ${ref.key} », repli sur sa base`);
  return forms.base;
}

function renderPlural(node, params, env) {
  const count = params[node.name];
  if (count === undefined) return missing(`{${node.name}, ${node.type}, …}`, env);
  if (typeof count !== "number") {
    env.warn(`« {${node.name}, ${node.type}, …} » attend un nombre`);
    return renderNodes(node.branches.get("other"), params, env, count);
  }
  const type = node.type === "plural" ? "cardinal" : "ordinal";
  const branch =
    node.branches.get(`=${count}`) ?? node.branches.get(pluralRules(env.locale, type).select(count)) ?? node.branches.get("other");
  return renderNodes(branch, params, env, count);
}

function renderSelect(node, params, env) {
  const value = params[node.name];
  let selector;
  if (node.attribute !== null) {
    if (value instanceof NameRef) {
      const forms = env.lookupName(value.key);
      selector = forms && typeof forms === "object" ? forms[node.attribute] : undefined;
    } else {
      env.warn(`« {${node.name}:${node.attribute}, select, …} » attend une référence de nom (nameRef)`);
    }
  } else if (value === undefined) {
    env.warn(`placeholder « {${node.name}, select, …} » manquant`);
  } else {
    selector = String(value);
  }
  const branch = (selector !== undefined && node.branches.get(selector)) || node.branches.get("other");
  return renderNodes(branch, params, env, undefined);
}

function renderList(node, params, env) {
  const items = params[node.name];
  if (items === undefined) return missing(`{${node.name}, list}`, env);
  if (!Array.isArray(items)) {
    env.warn(`« {${node.name}, list} » attend un tableau`);
    return displayValue(items, env);
  }
  return formatList(
    env.locale,
    items.map((item) => displayValue(item, env))
  );
}
