// BOÎTE À OUTILS DES BILLES — la FICHE DES MÉCANIQUES, sa construction (la ligne de
// commande : marbles/tools/mechanics-sheet.js) : un fichier texte qui recense ce
// avec quoi une bille peut s'écrire, pour concevoir le contenu hors du code. Générée
// depuis les tables du jeu, jamais écrite à la main :
//   - le vocabulaire : zones, calibres, familles, raretés ;
//   - les MOTS-CLÉS (marbles/core/content.js/MARBLE_KEYWORDS), leurs noms et leurs
//     descriptions de l'aide (touches E et Maj+E) dans les deux langues ;
//   - les CONDITIONS, les MONTANTS CALCULÉS, leurs filtres et les CIBLES, chacun par
//     un exemple que le jeu dit lui-même (marbles/view/narration/effects.js/
//     describePrinted), dans les deux langues ;
//   - les ÉVÈNEMENTS et VALEURS DE PARTIE (marbles/core/content.js/TALLY_COUNTERS),
//     ceux auxquels une bille du pot ou un statut peut réagir ;
//   - les STATUTS, leurs textes, leur effet, leur cumul et leur durée ; les
//     caractéristiques, points d'interception et verrous qu'un statut peut toucher ;
//   - les DÉFINITIONS DE PARTIE et leurs règles.
// Chaque entrée dit les billes du set qui s'en servent : « aucune bille », une
// mécanique prête que rien n'utilise encore.
//
// Les seuls textes écrits ici sont les intitulés des exemples et des catégories, en
// français (la fiche est un document de travail de l'auteur) ; chaque table du jeu
// qu'ils couvrent doit en avoir un par entrée, sinon la construction échoue : une
// condition, une source de montant, un filtre ajoutés sans exemple se voient aussitôt
// (domaine de vérification marbles-tools).
//
// Pur, sans rien de Node : il se charge aussi dans le navigateur.

import { getLocale, setLocale, t } from "../../data/i18n/index.js";
import { LARGE, MARBLE_FAMILIES, MARBLE_RARITIES, MARBLE_SIZES, SMALL } from "../config/values.js";
import { EFFECT_FIELDS, FIXED_MOMENTS, MARBLE_KEYWORDS, TALLY_COUNTERS, appliedStatusesOf, keywordsOf } from "../core/content.js";
import { TALLY_CATEGORIES } from "../core/counters.js";
import { AMOUNT_SOURCES, CLAUSE_ACTIONS, CONDITIONS, FIRST_IN_HAND, KNOCKED_OUT, LAST_DISCARDED, TARGET_FILTERS, isRelative } from "../core/effects.js";
import { CHARACTERISTICS, LOCKS, MODIFIER_POINTS, STATUS_STACKINGS } from "../core/statuses.js";
import { GAME_ZONES } from "../core/zones.js";
import {
  NEXT_SLOT,
  PREVIOUS_SLOT,
  allActive,
  allOf,
  bounce,
  choice,
  conditioned,
  count,
  crack,
  discard,
  familyAt,
  familyCount,
  familyIs,
  marbleAt,
  marbleIs,
  mass,
  nextInBag,
  not,
  orElse,
  otherBase,
  pocket,
  polish,
  rarityAt,
  rarityIs,
  replacementSize,
  retrieve,
  sizeAt,
  sizeIs,
  slotIs,
  speed,
  statIs,
  tally,
  turnStat,
  turnsInHand,
  turnsOnTriangle,
  wear,
  zoneCount,
  zoneIs,
} from "../content/effects.js";
import { describePrinted } from "../view/narration/effects.js";
import { behaviorsText } from "../view/narration/statuses.js";
import { GAME_RULES } from "./game-rules.js";

// Les espaces insécables des textes français deviennent des espaces ordinaires.
const plain = (text) => text.replace(/[\u00a0\u202f]/g, " ");
const capitalized = (text) => text[0].toUpperCase() + text.slice(1);

// Les CONVENTIONS rappelées en tête de fiche : comment la lire.
const CONVENTIONS = [
  "- Noms : français / anglais. Descriptions : FR puis EN, celles de l'aide du jeu (touches E et Maj+E pour les mots-clés, Maj+A pour les statuts).",
  "- Les exemples sont dits par le jeu lui-même, comme une fiche de bille les dirait. Ils illustrent la mécanique : ce ne sont pas des billes du set.",
  '- "Billes" : les billes du set qui s\'en servent aujourd\'hui. "Aucune bille" : la mécanique existe et marche, aucune bille ne l\'utilise encore.',
  "- Le détail des règles (ordre d'une pose, d'une résolution, garde-fous contre les boucles) : doc/marbles-rules.md.",
];

// Un montant calculé : « +1 par … », plafonné ou non.
const per = (source, { base = 0, step = 1, max } = {}) => ({ base, step, source, ...(max === undefined ? {} : { max }) });
// Une clause sous une condition.
const when = (clause, condition) => ({ ...clause, when: condition });

// LES CONDITIONS (marbles/core/effects.js/CONDITIONS) : un exemple par type.
const CONDITION_EXAMPLES = {
  printedStat: { label: "Valeur imprimée d'une bille", clauses: [when(speed(2), { type: "printedStat", slot: "apex", stat: "mass", atLeast: 1 })] },
  relativeSize: { label: "Calibre comparé pendant un remplacement (Tic, Éjection)", clauses: [when(speed(4), { type: "relativeSize", marble: "ejected", is: "larger" })] },
  zone: { label: "État d'une zone (pleine, vide, une seule bille)", clauses: [when(mass(1), zoneIs("triangle", "full"))] },
  sizeAt: { label: "Calibre de la bille d'un emplacement", clauses: [when(speed(2), sizeAt(NEXT_SLOT, SMALL))] },
  familyAt: { label: "Famille de la bille d'un emplacement", clauses: [when(speed(2), familyAt("apex", "mist"))] },
  rarityAt: { label: "Rareté de la bille d'un emplacement", clauses: [when(speed(2), rarityAt(PREVIOUS_SLOT, "rare"))] },
  marbleAt: { label: "Bille précise sur un emplacement", clauses: [when(speed(3), marbleAt(PREVIOUS_SLOT, "bee"))] },
  slotIs: { label: "Emplacement vide ou occupé", clauses: [when(speed(-2), slotIs(NEXT_SLOT, "empty"))] },
  replacementSize: { label: "Calibre de l'éjectée ou de la posée pendant un remplacement", clauses: [when(speed(4), replacementSize("ejected", SMALL))] },
  count: { label: "Un nombre comparé à une borne (toute source de montant calculé)", clauses: [when(speed(3), count(zoneCount("hand"), { atMost: 3 }))] },
  all: {
    label: "Plusieurs conditions à la fois",
    clauses: [when(speed(4), allOf(count(zoneCount("triangle", sizeIs(SMALL)), { atLeast: 1 }), count(zoneCount("triangle", sizeIs(LARGE)), { atLeast: 1 })))],
  },
  stat: { label: "Compteur du tour (Vitesse, Masse) comparé à une borne", clauses: [when(speed(4), statIs("mass", { atMost: 1 }))] },
};

// LES FORMES d'une condition, communes à toutes : la négation, le sinon, une
// condition sur plusieurs clauses.
const FORM_EXAMPLES = {
  not: { label: "Condition niée", clauses: [when(crack(1, NEXT_SLOT), not(familyAt(NEXT_SLOT, "bestiary")))] },
  otherwise: { label: "Sinon : une autre clause quand la condition est fausse", clauses: [orElse(speed(4), statIs("mass", { atMost: 1 }), speed(1))] },
  grouped: { label: "Une condition pour plusieurs clauses", clauses: conditioned(count(zoneCount("triangle"), { atMost: 1 }), speed(5), mass(1)) },
};

// LES SOURCES DE MONTANT CALCULÉ (marbles/core/effects.js/AMOUNT_SOURCES) : un exemple
// par type.
const SOURCE_EXAMPLES = {
  turnsInHand: { label: "Tours passés en main", clauses: [speed(per(turnsInHand(), { max: 5 }))] },
  zoneCount: { label: "Nombre de billes d'une zone, ou de plusieurs (filtrable)", clauses: [speed(per(zoneCount(["hand", "triangle"]), { max: 6 }))] },
  familyCount: { label: "Nombre de familles différentes", clauses: [speed(per(familyCount(), { step: 2, max: 8 }))] },
  stat: { label: "Compteur du tour (Vitesse, Masse)", clauses: [speed(per(turnStat("speed"), { max: 8 }))] },
  otherBase: { label: "Ce que donne l'autre base", clauses: [speed(per(otherBase("speed")))] },
  wear: { label: "Usure d'une bille (pas négatif possible)", clauses: [speed(per(wear(), { base: 5, step: -1 }))] },
  turnsOnTriangle: { label: "Tours passés sur le triangle", clauses: [speed(per(turnsOnTriangle(), { max: 4 }))] },
  tally: { label: "Une valeur de partie, ce tour ou cette partie (liste plus bas)", clauses: [speed(per(tally("flick", "turn"), { step: 2, max: 6 }))] },
};

// LES FILTRES DE BILLE (marbles/core/effects.js/TARGET_FILTERS) : un exemple par type,
// sur le nombre de billes d'une zone (ils servent aussi la cible « toutes » et les
// modificateurs de statut).
const FILTER_EXAMPLES = {
  size: { label: "Par calibre", clauses: [speed(per(zoneCount("triangle", sizeIs(SMALL))))] },
  family: { label: "Par famille", clauses: [speed(per(zoneCount("discard", familyIs("mist")), { max: 4 }))] },
  rarity: { label: "Par rareté", clauses: [speed(per(zoneCount("hand", rarityIs("rare"))))] },
  marble: { label: "Par bille précise", clauses: [mass(per(zoneCount("pot", marbleIs("bee"))))] },
};

// LES CIBLES d'une clause : un exemple par sorte (targetKind).
const TARGET_EXAMPLES = {
  // Sans cible : presque toutes les billes, elles ne se listent pas.
  self: { label: "La bille elle-même (sans cible)", clauses: [polish(1)], unlisted: true },
  slot: { label: "Un emplacement du triangle (un bonus de Vitesse ou de Masse s'y donne)", clauses: [{ ...speed(2), target: "apex" }] },
  relative: { label: "L'emplacement suivant ou précédent", clauses: [polish(1, NEXT_SLOT)] },
  [FIRST_IN_HAND]: { label: "La première bille de la main", clauses: [discard(FIRST_IN_HAND)] },
  [LAST_DISCARDED]: { label: "La dernière bille arrivée à la défausse", clauses: [retrieve(LAST_DISCARDED)] },
  [KNOCKED_OUT]: { label: "La bille éjectée, dans un Tic", clauses: [pocket(KNOCKED_OUT)] },
  bag: { label: "Les prochaines billes du sac", clauses: [discard(nextInBag(2))] },
  choice: { label: "Un choix du joueur", clauses: [retrieve(choice({ zones: ["discard"], mode: "optional" }))] },
  // Les actions qui l'acceptent se lisent dans le jeu (CLAUSE_ACTIONS, `all`).
  all: { label: "Toutes les billes actives, filtrées ou non", clauses: [bounce(allActive(sizeIs(SMALL)))], actions: (action) => action.all === true },
};

// Les tables d'exemples, pour les vérifications (domaine marbles-tools).
export const MECHANICS_EXAMPLES = { conditions: CONDITION_EXAMPLES, forms: FORM_EXAMPLES, sources: SOURCE_EXAMPLES, filters: FILTER_EXAMPLES, targets: TARGET_EXAMPLES };

// La sorte d'une cible (TARGET_EXAMPLES).
function targetKind(target) {
  if (target === undefined) return "self";
  if (isRelative(target)) return "relative";
  if ([FIRST_IN_HAND, LAST_DISCARDED, KNOCKED_OUT].includes(target)) return target;
  if (typeof target === "string") return "slot";
  return target.type;
}

// Les intitulés des sortes de mots-clés, dans l'ordre de la fiche.
const KEYWORD_KINDS = { phase: "Phases", trigger: "Déclencheurs", pocket: "En poche", action: "Actions" };

// Les intitulés des catégories de valeurs de partie (marbles/core/counters.js).
const TALLY_TITLES = {
  trigger: "Déclenchements des mots-clés",
  action: "Actions mots-clés : leurs déclenchements, et leur quantité réelle",
  stat: "Vitesse et Masse (gains, pertes, totaux)",
  event: "Évènements réels, quel que soit le mot-clé qui y réagit",
};

// Le cumul d'un statut appliqué alors qu'il est déjà là.
const STACKING_TEXTS = { intensity: "l'intensité s'ajoute", duration: "la durée s'ajoute", unique: "sans effet, il est unique" };

// Une table d'intitulés doit couvrir chaque entrée de la table du jeu qu'elle décrit,
// et rien d'autre : une entrée ajoutée au jeu sans intitulé fait échouer la fiche.
function covered(name, examples, ids) {
  const missing = ids.filter((id) => !Object.hasOwn(examples, id));
  const unknown = Object.keys(examples).filter((id) => !ids.includes(id));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(`fiche des mécaniques, ${name} : ${missing.length > 0 ? `sans exemple : ${missing.join(", ")}` : ""}${missing.length > 0 && unknown.length > 0 ? " ; " : ""}${unknown.length > 0 ? `inconnus du jeu : ${unknown.join(", ")}` : ""}.`);
  }
}

// CE QUE CHAQUE BILLE UTILISE : conditions, formes, sources, filtres, cibles, valeurs
// de partie écoutées ou lues, en parcourant ses clauses selon leur forme (un même
// `type` désigne une condition ou une source selon sa place : « stat », « all »).
function usesOf(type) {
  const uses = { conditions: new Set(), forms: new Set(), sources: new Set(), filters: new Set(), targets: new Set(), tallies: new Set() };
  const walkFilters = (filters = []) => filters.forEach((filter) => uses.filters.add(filter.type));
  const walkSource = (source) => {
    uses.sources.add(source.type);
    if (source.type === "tally") uses.tallies.add(source.tally);
    walkFilters(source.filters);
  };
  const walkCondition = (condition) => {
    uses.conditions.add(condition.type);
    if (condition.not === true) uses.forms.add("not");
    if (condition.type === "all") condition.conditions.forEach(walkCondition);
    if (condition.type === "count") walkSource(condition.source);
  };
  const walkClause = (clause) => {
    if (clause.when !== undefined) walkCondition(clause.when);
    if (clause.otherwise !== undefined) {
      uses.forms.add("otherwise");
      walkClause(clause.otherwise);
    }
    if (clause.amount !== null && typeof clause.amount === "object") walkSource(clause.amount.source);
    if (clause.target !== undefined) uses.targets.add(targetKind(clause.target));
    walkFilters(clause.target?.filters);
  };
  const walkList = (clauses) => {
    clauses.forEach(walkClause);
    // Une même condition sur plusieurs clauses qui se suivent.
    const conditions = clauses.filter((clause) => clause.when !== undefined && clause.otherwise === undefined).map((clause) => JSON.stringify(clause.when));
    if (conditions.some((condition, index) => index > 0 && condition === conditions[index - 1])) uses.forms.add("grouped");
  };
  for (const field of EFFECT_FIELDS) walkList(type[field] ?? []);
  Object.values(type.baseVariant ?? {}).forEach(walkList);
  const fixed = new Set(FIXED_MOMENTS.map((moment) => moment.id));
  for (const [key, clauses] of Object.entries(type.pocketed ?? {})) {
    // Une clé d'En poche qui n'est pas un moment fixe est une valeur de partie écoutée.
    if (!fixed.has(key)) uses.tallies.add(key);
    walkList(clauses);
  }
  return uses;
}

// La date du jour, AAAA-MM-JJ, à l'heure locale.
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// LA FICHE DES MÉCANIQUES, un texte. `date` : celle qu'elle dit (aujourd'hui par
// défaut) ; `rules` : les règles du jeu (tables des billes, des statuts, définitions).
// La langue en vigueur est rendue telle qu'elle était.
export function buildMechanicsSheet({ date = today(), rules = GAME_RULES } = {}) {
  covered("conditions", CONDITION_EXAMPLES, Object.keys(CONDITIONS));
  covered("sources de montant", SOURCE_EXAMPLES, Object.keys(AMOUNT_SOURCES));
  covered("filtres", FILTER_EXAMPLES, Object.keys(TARGET_FILTERS));
  covered("sortes de mots-clés", KEYWORD_KINDS, [...new Set(MARBLE_KEYWORDS.map((keyword) => keyword.kind))]);
  covered("catégories de valeurs de partie", TALLY_TITLES, TALLY_CATEGORIES);
  covered("cumuls de statut", STACKING_TEXTS, [...STATUS_STACKINGS]);

  const before = getLocale();
  // Le texte d'une clé dans une langue (la forme de base pour un nom à formes).
  const said = (key, locale, params) => {
    setLocale(locale);
    return plain(t(key, params));
  };
  const both = (key, params) => `${said(key, "fr", params)} / ${said(key, "en", params)}`;
  // Un texte que la vue compose elle-même, en français.
  const inFrench = (compose) => {
    setLocale("fr");
    return plain(compose());
  };
  // Des clauses dites par le jeu, dans une langue.
  const printed = (clauses, locale) => {
    setLocale(locale);
    return `${plain(describePrinted(clauses, null, t, rules.statuses))}.`;
  };
  const marbleNames = (ids) => ids.map((id) => said(`marble.${id}.name`, "fr")).join(", ");
  const marbles = Object.keys(rules.types);
  const uses = Object.fromEntries(marbles.map((marble) => [marble, usesOf(rules.types[marble])]));
  const usersOf = (kind, id) => marbles.filter((marble) => uses[marble][kind].has(id));
  const usersLine = (users) => (users.length === 0 ? "Billes : aucune bille." : `Billes (${users.length}) : ${marbleNames(users)}.`);

  const lines = [];
  const title = (text) => lines.push("", `==================== ${text} ====================`, "");
  const subtitle = (text) => lines.push(`--- ${text} ---`, "");
  // Une entrée d'exemple : son intitulé, l'exemple dans les deux langues, ses billes.
  const examples = (table, kind) => {
    for (const [id, { label, clauses, unlisted = false, actions }] of Object.entries(table)) {
      lines.push(label, `FR : ${printed(clauses, "fr")}`, `EN : ${printed(clauses, "en")}`);
      if (actions !== undefined) {
        const accepting = Object.keys(CLAUSE_ACTIONS).filter((id) => actions(CLAUSE_ACTIONS[id]));
        lines.push(`Actions : ${accepting.map((action) => said(CLAUSE_ACTIONS[action].keyword.texts.name, "fr")).join(", ")}.`);
      }
      if (!unlisted) lines.push(usersLine(usersOf(kind, id)));
      lines.push("");
    }
  };
  try {
    lines.push(`BILLES — FICHE DES MÉCANIQUES`, `Généré à partir du jeu le ${date}.`, "", "CONVENTIONS", ...CONVENTIONS, "");

    title("VOCABULAIRE");
    lines.push(
      `Zones : ${Object.keys(GAME_ZONES).map((zone) => `${said(`marbles.zone_where.${zone}`, "fr")} (${said(`marbles.zone_where.${zone}`, "en")})`).join(", ")}.`,
      `Calibres : ${Object.values(MARBLE_SIZES).map((size) => `${said(`marbles.size.${size}.name`, "fr")} (${said(`marbles.size.${size}.name`, "en")})`).join(", ")}.`,
      `Familles : ${MARBLE_FAMILIES.map((family) => `${said(`marbles.family.${family}.name`, "fr")} (${said(`marbles.family.${family}.name`, "en")})`).join(", ")}.`,
      `Raretés : ${MARBLE_RARITIES.map((rarity) => `${said(`marbles.rarity.${rarity}.name`, "fr")} (${said(`marbles.rarity.${rarity}.name`, "en")})`).join(", ")}.`
    );

    // Les mots-clés, par sorte ; les phases sur presque toutes les billes ne
    // listent pas leurs billes.
    title("MOTS-CLÉS");
    for (const [kind, kindTitle] of Object.entries(KEYWORD_KINDS)) {
      subtitle(kindTitle);
      for (const keyword of MARBLE_KEYWORDS.filter((entry) => entry.kind === kind)) {
        lines.push(
          both(keyword.texts.name),
          `FR : ${capitalized(said(keyword.texts.description, "fr"))}`,
          `EN : ${capitalized(said(keyword.texts.description, "en"))}`
        );
        if (kind !== "phase") lines.push(usersLine(marbles.filter((marble) => keywordsOf(marble, rules.types).some((entry) => entry.id === keyword.id))));
        lines.push("");
      }
    }

    title("CONDITIONS");
    examples(CONDITION_EXAMPLES, "conditions");
    subtitle("Formes d'une condition");
    examples(FORM_EXAMPLES, "forms");

    title("MONTANTS CALCULÉS");
    lines.push('Forme : "Vitesse +2, +1 par X, maximum +6" = base 2 + 1 × X, plafonné à 6 au total. Un pas négatif ne vaut que pour la Vitesse et la Masse, sans maximum.', "");
    examples(SOURCE_EXAMPLES, "sources");
    subtitle("Filtres de bille (nombre de billes d'une zone, cible « toutes », modificateurs de statut)");
    examples(FILTER_EXAMPLES, "filters");

    title("CIBLES");
    examples(TARGET_EXAMPLES, "targets");

    // Les valeurs de partie, par catégorie : leur nom, leur unité (« par … »), et,
    // pour celles qu'on peut écouter, la réaction qu'elles permettent.
    title("ÉVÈNEMENTS ET VALEURS DE PARTIE");
    lines.push(
      "Chacune se compte ce tour et cette partie : un montant calculé peut s'en servir (\"par X ce tour\", \"par X cette partie\"). Une valeur ÉCOUTABLE déclenche aussi une réaction à chacune de ses occurrences : celle d'une bille En poche (\"En poche, à chaque X\") ou d'un statut.",
      ""
    );
    const statusListeners = (id) => Object.keys(rules.statuses).filter((status) => rules.statuses[status].behaviors.some((behavior) => behavior.type === "reaction" && behavior.on === id));
    for (const category of TALLY_CATEGORIES) {
      subtitle(TALLY_TITLES[category]);
      for (const counter of TALLY_COUNTERS.filter((entry) => entry.category === category)) {
        const listening = counter.listenable ? `écoutable : « ${said(`marbles.tally.${counter.id}.each`, "fr")} »` : "non écoutable";
        lines.push(`${both(`marbles.tally.${counter.id}.name`)} — unité : ${said(`marbles.tally.${counter.id}.unit`, "fr")} — ${listening}`);
        const listeners = statusListeners(counter.id);
        if (listeners.length > 0) lines.push(`Statuts qui y réagissent : ${listeners.map((status) => said(`marbles.status.${status}.name`, "fr")).join(", ")}.`);
        const users = usersOf("tallies", counter.id);
        if (users.length > 0) lines.push(usersLine(users));
        lines.push("");
      }
    }

    title("STATUTS");
    for (const [id, definition] of Object.entries(rules.statuses)) {
      const givers = marbles.filter((marble) => appliedStatusesOf(marble, rules.types).includes(id));
      const definitions = Object.keys(rules.definitions).filter((definitionId) => (rules.definitions[definitionId].rules ?? []).includes(id));
      lines.push(
        both(`marbles.status.${id}.name`),
        `FR : ${capitalized(said(`marbles.status.${id}.description`, "fr"))}`,
        `EN : ${capitalized(said(`marbles.status.${id}.description`, "en"))}`,
        `Effet à l'intensité 1 : ${capitalized(inFrench(() => behaviorsText(definition, 1, t, rules.statuses)))}.`,
        `Durée : ${said(`marbles.statuses.duration.${definition.duration.kind}`, "fr", { count: definition.duration.count ?? 1 })} ; cumul : ${STACKING_TEXTS[definition.stacking]}.`
      );
      if (givers.length > 0) lines.push(`Donné par (${givers.length}) : ${marbleNames(givers)}.`);
      if (definitions.length > 0) lines.push(`Règle de : ${definitions.map((definitionId) => said(`marbles.definition.${definitionId}.name`, "fr")).join(", ")}.`);
      if (givers.length === 0 && definitions.length === 0) lines.push("Donné par : aucune bille, aucune définition (statut de test).");
      lines.push("");
    }

    // Ce qu'un statut peut toucher : les caractéristiques de la partie, les points
    // d'interception des valeurs, les verrous.
    title("CE QU'UN STATUT PEUT TOUCHER");
    lines.push(
      `Caractéristiques : ${Object.keys(CHARACTERISTICS).map((key) => `${said(`marbles.statuses.behavior.stat.${key}`, "fr", { amount: "" }).trim()} (${said(`marbles.statuses.behavior.stat.${key}`, "en", { amount: "" }).trim()})`).join(", ")}.`,
      `Points d'interception (ajouter, multiplier) : ${Object.keys(MODIFIER_POINTS).map((point) => `${said(`marbles.statuses.point.${point}`, "fr")} (${said(`marbles.statuses.point.${point}`, "en")})`).join(", ")}.`,
      `Verrous : ${Object.keys(LOCKS).map((lock) => said(`marbles.statuses.behavior.lock.${lock}`, "fr", { trigger: "X" })).join(", ")}.`,
      'Réactions : un effet joué à chaque occurrence d\'une valeur écoutable (voir "Évènements et valeurs de partie").',
      ""
    );

    title("DÉFINITIONS DE PARTIE");
    for (const [id, definition] of Object.entries(rules.definitions)) {
      lines.push(both(`marbles.definition.${id}.name`), `FR : ${said(`marbles.definition.${id}.description`, "fr")}`, `EN : ${said(`marbles.definition.${id}.description`, "en")}`);
      const ruleIds = definition.rules ?? [];
      if (ruleIds.length > 0) lines.push(`Règles : ${ruleIds.map((status) => said(`marbles.status.${status}.name`, "fr")).join(", ")}.`);
      lines.push("");
    }
  } finally {
    setLocale(before);
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n\n").trimEnd()}\n`;
}
