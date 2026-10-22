// Vérifications du core — domaine « collections ». Collections
// (core/collections.js). Lancées par core/checks/index.js/runChecks (voir ce
// fichier). Pur : aucun DOM, aucun fetch ; chaque scène est construite en dur
// via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState } from "../state.js";
import { SAVE_VERSION, serializeGame, deserializeGame } from "../save.js";
import { addItem, removeItem } from "../bag.js";
import { ITEM_REGISTRY } from "../items.js";
import {
  validateCollection,
  collectionEntries,
  collectionProgress,
  newlyDiscoveredEntries,
  revealAllCollections,
  resetAllCollections,
} from "../collections.js";
import { throws } from "../../lib/check.js";
import { ITEM_START } from "./helpers.js";

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
    collectionEntries("parts", TEST_COLLECTIONS.parts, collAppleGone.acquiredItems).map((e) => `${e.item}:${e.discovered}`).join(",")
  );
  run("collections : clés de texte déduites des ids", "collection.parts.entry.coin.name", collectionEntries("parts", TEST_COLLECTIONS.parts, {})[1].nameKey);
  run("collections : progression", "2/3", (({ discovered, total }) => `${discovered}/${total}`)(collectionProgress(TEST_COLLECTIONS.parts, collAppleGone.acquiredItems)));
  run(
    "collections : diff -> seule la nouvelle entrée",
    "parts/coin",
    newlyDiscoveredEntries(TEST_COLLECTIONS, collAppleGone.acquiredItems, addItem(collAppleGone, "coin").acquiredItems).map((e) => `${e.collectionId}/${e.item}`).join(",")
  );
  run("collections : diff sans changement -> rien", 0, newlyDiscoveredEntries(TEST_COLLECTIONS, collAppleGone.acquiredItems, collAppleGone.acquiredItems).length);
  const collCollectionThrows = (def) => {
    return throws(() => validateCollection("x", def, ITEM_REGISTRY));
  };
  run("collections : collection valide acceptée", false, collCollectionThrows(TEST_COLLECTIONS.parts));
  run("collections : objet inconnu refusé", true, collCollectionThrows({ entries: [{ item: "not_an_item" }] }));
  run("collections : doublon refusé", true, collCollectionThrows({ entries: [{ item: "apple" }, { item: "apple" }] }));
  run("collections : liste vide refusée", true, collCollectionThrows({ entries: [] }));
  const collRevealed = revealAllCollections(collFreshCollections, TEST_COLLECTIONS);
  run("collections debug : tout révéler", "3/3", (({ discovered, total }) => `${discovered}/${total}`)(collectionProgress(TEST_COLLECTIONS.parts, collRevealed.acquiredItems)));
  const collResetDone = resetAllCollections(collRevealed, TEST_COLLECTIONS);
  run("collections debug : tout réinitialiser", 0, collectionProgress(TEST_COLLECTIONS.parts, collResetDone.acquiredItems).discovered);
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
    (({ discovered, total }) => `${discovered}/${total}`)(collectionProgress(TEST_COLLECTIONS.parts, { apple: true, item_removed_since: true }))
  );
}
