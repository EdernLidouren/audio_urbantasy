// Collections — logique PURE, sans aucune connaissance du contenu : les
// collections (fichiers de données, collections/*.js) sont toujours PASSÉES
// en paramètre, jamais importées ici (le core n'importe pas de contenu).
// Référence : doc/collections.md.
//
// Une collection = { discoverySound?, entries: [{ item }, ...] } : une liste
// ORDONNÉE d'entrées, chacune référençant un objet du sac
// (core/items.js/ITEM_REGISTRY). L'ordre d'affichage est l'ordre de
// déclaration, fixe. Une entrée est DÉCOUVERTE dès que son objet a été
// acquis au moins une fois (session.acquiredItems, posé par
// core/bag.js/addItem) : la découverte n'est jamais stockée, elle se LIT dans
// ce fait neutre. Conséquence assumée : une entrée ajoutée plus tard pour un
// objet déjà acquis apparaît découverte d'emblée.
//
// Extension prévue, pas construite : une entrée découverte par OBSERVATION
// d'une entité (futur bestiaire) déclarerait `{ entity: <type> }` et se lirait
// dans un second fait neutre (session.observedEntityTypes) — seul
// isEntryDiscovered ci-dessous aurait à choisir le bon fait.

// Clés i18n d'une collection et de ses entrées, DÉDUITES de leurs ids
// (data/i18n/<langue>/collections.json) : jamais déclarées dans le fichier de
// collection, donc jamais divergentes.
export function collectionNameKey(collectionId) {
  return `collection.${collectionId}.name`;
}
export function entryTextKeys(collectionId, item) {
  const base = `collection.${collectionId}.entry.${item}`;
  return { nameKey: `${base}.name`, descriptionKey: `${base}.description` };
}

// Valide UNE collection : entrées non vides, chacune un objet du registre,
// aucun doublon, son de découverte (optionnel) en chaîne. `itemRegistry`
// injecté (core/items.js/ITEM_REGISTRY). Lève une erreur claire : une
// collection mal écrite échoue au chargement, jamais une entrée introuvable
// en silence (même politique que la table météo, core/weather.js).
export function validateCollection(collectionId, collection, itemRegistry) {
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
    const item = entry && entry.item;
    if (typeof item !== "string" || !Object.hasOwn(itemRegistry, item)) {
      throw new Error(`${where} : entries[${index}].item "${item}" absent du registre d'objets.`);
    }
    if (seen.has(item)) {
      throw new Error(`${where} : entries[${index}] répète l'objet "${item}".`);
    }
    seen.add(item);
  });
}

function isEntryDiscovered(entry, acquired) {
  return Boolean(acquired && acquired[entry.item]);
}

// Les entrées d'une collection, dans leur ordre déclaré, avec leur état.
export function collectionEntries(collectionId, collection, acquired) {
  return collection.entries.map((entry) => ({
    item: entry.item,
    discovered: isEntryDiscovered(entry, acquired),
    ...entryTextKeys(collectionId, entry.item),
  }));
}

export function collectionProgress(collection, acquired) {
  const discovered = collection.entries.filter((entry) => isEntryDiscovered(entry, acquired)).length;
  return { discovered, total: collection.entries.length };
}

// Entrées découvertes ENTRE deux états du fait "acquis" (diff, pour
// l'annonce de découverte côté vue) : celles découvertes dans `next` mais
// pas dans `prev`, dans l'ordre des collections puis des entrées.
// `collections` : { [id]: collection }.
export function newlyDiscoveredEntries(collections, prevAcquired, nextAcquired) {
  if (prevAcquired === nextAcquired) return [];
  const found = [];
  for (const [collectionId, collection] of Object.entries(collections)) {
    for (const entry of collection.entries) {
      if (isEntryDiscovered(entry, nextAcquired) && !isEntryDiscovered(entry, prevAcquired)) {
        found.push({ collectionId, item: entry.item });
      }
    }
  }
  return found;
}

// OUTILS DE DEBUG (menu Shift+C, voir view/menus/debug-collections-menu.js)
// : écrivent RÉELLEMENT le fait "acquis", pour les seuls objets des
// collections — jamais un court-circuit de lecture comme hasImprovement,
// puisqu'on veut aussi pouvoir tout réinitialiser.
function collectionItems(collections) {
  return Object.values(collections).flatMap((collection) => collection.entries.map((entry) => entry.item));
}
export function revealAllCollections(session, collections) {
  const acquiredItems = { ...(session.acquiredItems || {}) };
  for (const item of collectionItems(collections)) acquiredItems[item] = true;
  return { ...session, acquiredItems };
}
export function resetAllCollections(session, collections) {
  const acquiredItems = { ...(session.acquiredItems || {}) };
  for (const item of collectionItems(collections)) delete acquiredItems[item];
  return { ...session, acquiredItems };
}
