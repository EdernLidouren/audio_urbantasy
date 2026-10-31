// Collections — logique PURE, sans aucune connaissance du contenu : les
// collections (fichiers de données, collections/*.js) et les registres sont
// toujours PASSÉS en paramètre, jamais importés ici (le core n'importe pas
// de contenu). Référence : doc/collections.md.
//
// Une collection = { discoverySound?, entries: [...] } : une liste ORDONNÉE
// d'entrées, de DEUX genres :
//   - `{ item }` : un objet du sac (core/items.js/ITEM_REGISTRY), DÉCOUVERT
//     dès qu'il a été acquis une fois (session.acquiredItems, posé par
//     core/bag.js/addItem) ;
//   - `{ entity }` : un type d'entité (entities/types/), DÉCOUVERT dès que
//     le joueur l'a observé une fois (session.observedEntityTypes, posé par
//     core/observations.js/markObserved) — le bestiaire surnaturel.
// L'ordre d'affichage est l'ordre de déclaration, fixe. La découverte n'est
// jamais stockée : elle se LIT dans ces deux faits neutres (`facts`, voir
// discoveryFacts). Conséquence assumée : une entrée ajoutée plus tard pour
// un objet acquis ou une entité observée apparaît découverte d'emblée.

// Les deux faits neutres d'une partie dont se déduit la découverte.
export function discoveryFacts(session) {
  return { items: session.acquiredItems, entities: session.observedEntityTypes };
}

// Identifiant d'une entrée dans sa collection : l'objet ou le type.
function entryId(entry) {
  return entry.entity !== undefined ? entry.entity : entry.item;
}

// Clés i18n d'une collection et de ses entrées, DÉDUITES de leurs ids
// (data/i18n/<langue>/collections.json) : jamais déclarées dans le fichier de
// collection, donc jamais divergentes. Une entrée d'objet a son nom et sa
// description de collection ; une entrée d'entité garde le nom et la
// description de son type (lus par la vue dans le registre) et ajoute sa
// fiche : texte encyclopédique (`lore`) et lieux de rencontre (`places`).
export function collectionNameKey(collectionId) {
  return `collection.${collectionId}.name`;
}
export function entryTextKeys(collectionId, entry) {
  const base = `collection.${collectionId}.entry.${entryId(entry)}`;
  if (entry.entity !== undefined) return { loreKey: `${base}.lore`, placesKey: `${base}.places` };
  return { nameKey: `${base}.name`, descriptionKey: `${base}.description` };
}

// Valide UNE collection : entrées non vides, chacune un objet du registre
// OU un type d'entité du registre (jamais les deux), aucun doublon, son de
// découverte (optionnel) en chaîne. Registres injectés. Lève une erreur
// claire : une collection mal écrite échoue au chargement, jamais une
// entrée introuvable en silence (même politique que la table météo,
// core/weather.js).
export function validateCollection(collectionId, collection, itemRegistry, entityRegistry) {
  const where = `collection "${collectionId}"`;
  if (typeof collection !== "object" || collection === null) {
    throw new Error(`${where} : doit être un objet.`);
  }
  if (!Array.isArray(collection.entries) || collection.entries.length === 0) {
    throw new Error(`${where} : entries doit être un tableau non vide.`);
  }
  if (collection.discoverySound !== undefined && typeof collection.discoverySound !== "string") {
    throw new Error(`${where} : discoverySound doit être un chemin de son.`);
  }
  const seen = new Set();
  collection.entries.forEach((entry, index) => {
    const at = `${where} : entries[${index}]`;
    if (typeof entry !== "object" || entry === null || (entry.item === undefined) === (entry.entity === undefined)) {
      throw new Error(`${at} doit être { item } ou { entity }, exactement l'un des deux.`);
    }
    const unknown = Object.keys(entry).find((key) => key !== "item" && key !== "entity");
    if (unknown !== undefined) throw new Error(`${at}.${unknown} inconnu.`);
    if (entry.item !== undefined && (typeof entry.item !== "string" || !Object.hasOwn(itemRegistry, entry.item))) {
      throw new Error(`${at}.item "${entry.item}" absent du registre d'objets.`);
    }
    if (entry.entity !== undefined && (typeof entry.entity !== "string" || !Object.hasOwn(entityRegistry, entry.entity))) {
      throw new Error(`${at}.entity "${entry.entity}" absent du registre des types d'entité.`);
    }
    const id = entryId(entry);
    if (seen.has(id)) throw new Error(`${at} répète "${id}".`);
    seen.add(id);
  });
}

function isEntryDiscovered(entry, facts) {
  const fact = entry.entity !== undefined ? facts.entities : facts.items;
  return Boolean(fact && fact[entryId(entry)]);
}

// Les entrées d'une collection, dans leur ordre déclaré, avec leur état.
// `facts` : voir discoveryFacts.
export function collectionEntries(collectionId, collection, facts) {
  return collection.entries.map((entry) => ({
    ...entry,
    discovered: isEntryDiscovered(entry, facts),
    ...entryTextKeys(collectionId, entry),
  }));
}

export function collectionProgress(collection, facts) {
  const discovered = collection.entries.filter((entry) => isEntryDiscovered(entry, facts)).length;
  return { discovered, total: collection.entries.length };
}

// Entrées découvertes ENTRE deux états des faits (diff, pour l'annonce de
// découverte côté vue) : celles découvertes dans `next` mais pas dans
// `prev`, dans l'ordre des collections puis des entrées.
// `collections` : { [id]: collection } ; -> [{ collectionId, entry }].
export function newlyDiscoveredEntries(collections, prevFacts, nextFacts) {
  if (prevFacts.items === nextFacts.items && prevFacts.entities === nextFacts.entities) return [];
  const found = [];
  for (const [collectionId, collection] of Object.entries(collections)) {
    for (const entry of collection.entries) {
      if (isEntryDiscovered(entry, nextFacts) && !isEntryDiscovered(entry, prevFacts)) {
        found.push({ collectionId, entry });
      }
    }
  }
  return found;
}

// OUTILS DE DEBUG (menu Shift+C, voir view/menus/debug-collections-menu.js)
// : écrivent RÉELLEMENT les faits "acquis" et "observé", pour les seules
// entrées des collections — jamais un court-circuit de lecture comme
// hasImprovement, puisqu'on veut aussi pouvoir tout réinitialiser.
function collectionIds(collections, kind) {
  return Object.values(collections).flatMap((collection) =>
    collection.entries.filter((entry) => entry[kind] !== undefined).map((entry) => entry[kind])
  );
}
function writeFacts(session, collections, value) {
  const acquiredItems = { ...(session.acquiredItems || {}) };
  const observedEntityTypes = { ...(session.observedEntityTypes || {}) };
  for (const item of collectionIds(collections, "item")) {
    if (value) acquiredItems[item] = true;
    else delete acquiredItems[item];
  }
  for (const type of collectionIds(collections, "entity")) {
    if (value) observedEntityTypes[type] = true;
    else delete observedEntityTypes[type];
  }
  return { ...session, acquiredItems, observedEntityTypes };
}
export function revealAllCollections(session, collections) {
  return writeFacts(session, collections, true);
}
export function resetAllCollections(session, collections) {
  return writeFacts(session, collections, false);
}
