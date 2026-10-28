// Vérifications du core — domaine « collections ». Collections
// (core/collections.js). Lancées par core/checks/index.js/runChecks (voir ce
// fichier). Pur : aucun DOM, aucun fetch ; chaque scène est construite en dur
// via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState } from "../state.js";
import { SAVE_VERSION, serializeGame, deserializeGame } from "../save.js";
import { addItem, removeItem } from "../bag.js";
import { ITEM_REGISTRY } from "../items.js";
import { markObserved } from "../observations.js";
import {
  discoveryFacts,
  validateCollection,
  collectionEntries,
  collectionProgress,
  newlyDiscoveredEntries,
  revealAllCollections,
  resetAllCollections,
} from "../collections.js";
import { throws } from "../../lib/check.js";
import { ITEM_START } from "./helpers.js";

// Registre des types d'entité de test (injecté, comme partout dans le core).
const ENTITY_REGISTRY = { spectre: { nameKey: "entity.ghost.name" }, wisp: { nameKey: "entity.ghost.name" } };

export default function checkCollections(run) {
  // --- Collections (core/collections.js) : le fait neutre "objet acquis"
  // (core/bag.js/addItem), la découverte qui s'en déduit, la sauvegarde. ---
  const TEST_COLLECTIONS = { parts: { entries: [{ item: "apple" }, { item: "coin" }, { item: "sneakers" }] } };
  const collCollectionScene = parseScene({ id: "collections", titleKey: "scene.demo.name", length: 10, playerStart: 0, entities: [] }, {});
  const collFreshCollections = createInitialState(collCollectionScene, "collections", ITEM_START);
  run(
    "collections : départ -> sac et équipement de départ notés acquis",
    "combat_boots,high_heels,sneakers",
    Object.keys(collFreshCollections.acquiredItems).sort().join(",")
  );
  const collWithApple = addItem(collFreshCollections, "apple", 2);
  run("collections : addItem note l'objet acquis", true, Boolean(collWithApple.acquiredItems.apple));
  run("collections : un second ajout ne recrée pas le fait (même référence)", collWithApple.acquiredItems, addItem(collWithApple, "apple", 1).acquiredItems);
  const collAppleGone = removeItem(collWithApple, "apple", 2);
  run("collections : retirer l'objet ne retire pas l'acquisition (définitif)", true, Boolean(collAppleGone.acquiredItems.apple));
  run(
    "collections : entrées dans l'ordre déclaré, avec leur état",
    "apple:true,coin:false,sneakers:true",
    collectionEntries("parts", TEST_COLLECTIONS.parts, discoveryFacts(collAppleGone)).map((e) => `${e.item}:${e.discovered}`).join(",")
  );
  run("collections : clés de texte déduites des ids", "collection.parts.entry.coin.name", collectionEntries("parts", TEST_COLLECTIONS.parts, { items: {} })[1].nameKey);
  run("collections : progression", "2/3", (({ discovered, total }) => `${discovered}/${total}`)(collectionProgress(TEST_COLLECTIONS.parts, discoveryFacts(collAppleGone))));
  run(
    "collections : diff -> seule la nouvelle entrée",
    "parts/coin",
    newlyDiscoveredEntries(TEST_COLLECTIONS, discoveryFacts(collAppleGone), discoveryFacts(addItem(collAppleGone, "coin"))).map((e) => `${e.collectionId}/${e.entry.item}`).join(",")
  );
  run("collections : diff sans changement -> rien", 0, newlyDiscoveredEntries(TEST_COLLECTIONS, discoveryFacts(collAppleGone), discoveryFacts(collAppleGone)).length);
  const collCollectionThrows = (def) => {
    return throws(() => validateCollection("x", def, ITEM_REGISTRY, ENTITY_REGISTRY));
  };
  run("collections : collection valide acceptée", false, collCollectionThrows(TEST_COLLECTIONS.parts));
  run("collections : objet inconnu refusé", true, collCollectionThrows({ entries: [{ item: "not_an_item" }] }));
  run("collections : doublon refusé", true, collCollectionThrows({ entries: [{ item: "apple" }, { item: "apple" }] }));
  run("collections : liste vide refusée", true, collCollectionThrows({ entries: [] }));
  const collRevealed = revealAllCollections(collFreshCollections, TEST_COLLECTIONS);
  run("collections debug : tout révéler", "3/3", (({ discovered, total }) => `${discovered}/${total}`)(collectionProgress(TEST_COLLECTIONS.parts, discoveryFacts(collRevealed))));
  const collResetDone = resetAllCollections(collRevealed, TEST_COLLECTIONS);
  run("collections debug : tout réinitialiser", 0, collectionProgress(TEST_COLLECTIONS.parts, discoveryFacts(collResetDone)).discovered);
  run("collections debug : réinitialiser ne touche pas aux objets hors collection", true, Boolean(collResetDone.acquiredItems.combat_boots));
  // Sauvegarde : fait sérialisé tel quel ; ancienne sauvegarde -> reconstitué
  // depuis le sac et l'équipement ; id inconnu -> simplement ignoré.
  const collCollectionReload = deserializeGame(serializeGame(collWithApple));
  run("collections save : acquiredItems traverse la sauvegarde", true, Boolean(collCollectionReload.session.acquiredItems.apple));
  const { acquiredItems: coll_dropped, ...collOldCollectionSave } = collWithApple;
  const collOldCollectionReload = deserializeGame({ version: SAVE_VERSION, data: collOldCollectionSave });
  run(
    "collections save : ancienne sauvegarde -> reconstitué depuis sac + équipement",
    "apple,combat_boots,high_heels,sneakers",
    Object.keys(collOldCollectionReload.session.acquiredItems).sort().join(",")
  );
  run(
    "collections save : id inconnu ignoré sans erreur",
    "1/3",
    (({ discovered, total }) => `${discovered}/${total}`)(collectionProgress(TEST_COLLECTIONS.parts, { items: { apple: true, item_removed_since: true } }))
  );

  // --- Entrées d'ENTITÉ (bestiaire) : découvertes par observation
  // (core/observations.js/markObserved), lues dans observedEntityTypes. ---
  const BESTIARY = { spirits: { entries: [{ entity: "spectre" }, { item: "apple" }, { entity: "wisp" }] } };
  run("bestiaire : collection mixte objets/entités acceptée", false, collCollectionThrows(BESTIARY.spirits));
  run("bestiaire : type d'entité inconnu refusé", true, collCollectionThrows({ entries: [{ entity: "banshee" }] }));
  run("bestiaire : item ET entity sur une entrée refusés", true, collCollectionThrows({ entries: [{ item: "apple", entity: "spectre" }] }));
  run("bestiaire : entrée sans item ni entity refusée", true, collCollectionThrows({ entries: [{}] }));
  run("bestiaire : champ inconnu refusé", true, collCollectionThrows({ entries: [{ entity: "spectre", rarity: 3 }] }));
  run("bestiaire : doublon refusé", true, collCollectionThrows({ entries: [{ entity: "wisp" }, { entity: "wisp" }] }));
  run("bestiaire : départ -> rien d'observé", 0, Object.keys(collFreshCollections.observedEntityTypes).length);
  const seen = markObserved(collFreshCollections, "spectre");
  run("bestiaire : markObserved note le type", true, Boolean(seen.observedEntityTypes.spectre));
  run("bestiaire : déjà observé -> MÊME session", true, Object.is(markObserved(seen, "spectre"), seen));
  run(
    "bestiaire : entrées avec leur état (entité observée, objet acquis)",
    "spectre:true,apple:false,wisp:false",
    collectionEntries("spirits", BESTIARY.spirits, discoveryFacts(seen)).map((e) => `${e.entity ?? e.item}:${e.discovered}`).join(",")
  );
  run.same(
    "bestiaire : clés de fiche déduites des ids",
    { loreKey: "collection.spirits.entry.wisp.lore", placesKey: "collection.spirits.entry.wisp.places" },
    (({ loreKey, placesKey }) => ({ loreKey, placesKey }))(collectionEntries("spirits", BESTIARY.spirits, discoveryFacts(seen))[2])
  );
  run(
    "bestiaire : diff -> l'entité nouvellement observée",
    "spirits/wisp",
    newlyDiscoveredEntries(BESTIARY, discoveryFacts(seen), discoveryFacts(markObserved(seen, "wisp"))).map((e) => `${e.collectionId}/${e.entry.entity}`).join(",")
  );
  const allSeen = revealAllCollections(collFreshCollections, BESTIARY);
  run("bestiaire debug : tout révéler -> 3/3", 3, collectionProgress(BESTIARY.spirits, discoveryFacts(allSeen)).discovered);
  run("bestiaire debug : tout réinitialiser -> 0", 0, collectionProgress(BESTIARY.spirits, discoveryFacts(resetAllCollections(allSeen, BESTIARY))).discovered);
  const seenReload = deserializeGame(serializeGame(seen));
  run("bestiaire save : observedEntityTypes traverse la sauvegarde", true, seenReload.success && Boolean(seenReload.session.observedEntityTypes.spectre));
  const { observedEntityTypes: seen_dropped, ...oldSeenSave } = seen;
  const oldSeenReload = deserializeGame({ version: SAVE_VERSION, data: oldSeenSave });
  run("bestiaire save : ancienne sauvegarde -> aucun type observé", 0, oldSeenReload.success ? Object.keys(oldSeenReload.session.observedEntityTypes).length : -1);
}
