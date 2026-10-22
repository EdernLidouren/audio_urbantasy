// Vérifications du core — domaine « inventory ». Inventaire : argent, sac,
// équipement, tags, objet au sol générique, ramassage sur deux faces. Lancées
// par core/checks/index.js/runChecks (voir ce fichier). Pur : aucun DOM,
// aucun fetch ; chaque scène est construite en dur via un objet littéral
// passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState, getActiveWorld, switchSide, removeEntity } from "../state.js";
import { addMoney, pickupEntity, lootUniqueEntity } from "../money.js";
import { addItem, pickupItemEntity, removeItem, dropItem } from "../bag.js";
import { ITEM_REGISTRY, itemProps, validateItemTags, itemSounds } from "../items.js";
import { EQUIPMENT_SLOTS, createEmptyEquipment, gaitOf, equipItem, unequipItem, equippedTags } from "../equipment.js";
import { TAG_REGISTRY, tagProps } from "../tags.js";
import { evaluateCondition } from "../presence.js";
import { ownedQuantity } from "../trade.js";
import { throws } from "../../lib/check.js";
import { ITEM_START, RAW_SCENE, EMPTY_REGISTRY, buildMoneyScene } from "./helpers.js";

export default function checkInventory(run) {
  // --- Argent (core/money.js) : scalaire de partie + effet pickup ---

  const moneyScene = buildMoneyScene();
  const moneyState = createInitialState(moneyScene);

  run("argent : une partie neuve démarre à 0", 0, moneyState.money);

  const afterAdd = addMoney(moneyState, 7);
  run("argent : addMoney incrémente du montant donné", 7, afterAdd.money);
  run("argent : addMoney cumule (pas un remplacement)", 10, addMoney(afterAdd, 3).money);
  run("argent : addMoney ne mute jamais l'original", 0, moneyState.money);

  run("argent : removeEntity retire l'entité ciblée", false, getActiveWorld(removeEntity(moneyState, "coin-1")).entities.some((e) => e.id === "coin-1"));
  run(
    "argent : removeEntity laisse les autres entités intactes",
    true,
    getActiveWorld(removeEntity(moneyState, "coin-1")).entities.some((e) => e.id === "other-1")
  );
  run("argent : removeEntity — id absent -> référence INCHANGÉE (no-op sûr)", moneyState, removeEntity(moneyState, "does-not-exist"));

  const afterPickup = pickupEntity(moneyState, "coin-1", 7);
  run("argent : pickupEntity ajoute le montant", 7, afterPickup.money);
  run("argent : pickupEntity retire l'entité ramassée", false, getActiveWorld(afterPickup).entities.some((e) => e.id === "coin-1"));
  run("argent : pickupEntity laisse les autres entités intactes", true, getActiveWorld(afterPickup).entities.some((e) => e.id === "other-1"));

  // Double appel (id déjà retiré, ex. tentative périmée) : effet ATOMIQUE,
  // jamais un second gain sans entité à retirer — voir le commentaire du
  // module.
  run("argent : pickupEntity sur une entité déjà retirée -> aucun second gain", 7, pickupEntity(afterPickup, "coin-1", 7).money);
  run("argent : pickupEntity sur une entité déjà retirée -> référence INCHANGÉE", afterPickup, pickupEntity(afterPickup, "coin-1", 7));

  // --- Sac d'objets (core/bag.js/addItem + pickupItemEntity, core/items.js/ITEM_REGISTRY) ---
  // Deuxième tiers de l'inventaire, même statut que l'argent ci-dessus.

  run("sac : ITEM_REGISTRY.apple est empilable", true, itemProps("apple").stackable);
  run("sac : ITEM_REGISTRY.key_bronze n'est PAS empilable", false, itemProps("key_bronze").stackable);
  run("sac : itemProps sur un type inconnu -> undefined", undefined, itemProps("does-not-exist"));

  // Partie SANS départ : sac vide, pour tester le MÉCANISME du sac
  // (addItem/removeItem/pickupItemEntity/dropItem) en isolation.
  const bagState = createInitialState(moneyScene);
  run("sac : partie sans départ -> sac vide", 0, bagState.bag.length);

  // Empilable : le PREMIER ajout crée l'entrée, les SUIVANTS incrémentent
  // quantity — jamais une seconde entrée pour le même type.
  const afterOneApple = addItem(bagState, "apple", 1);
  run("sac : addItem (empilable) — une entrée créée", 1, afterOneApple.bag.length);
  run("sac : addItem (empilable) — quantity posée à count", 1, afterOneApple.bag[0].quantity);
  const afterTwoApples = addItem(afterOneApple, "apple", 1);
  run("sac : addItem (empilable) — EMPILE, toujours une seule entrée", 1, afterTwoApples.bag.length);
  run("sac : addItem (empilable) — quantity incrémentée (2)", 2, afterTwoApples.bag[0].quantity);
  const afterFiveMoreApples = addItem(bagState, "apple", 5);
  run("sac : addItem(count=5) en un seul appel — quantity posée directement à 5", 5, afterFiveMoreApples.bag[0].quantity);

  // Non empilable : CHAQUE ajout crée une entrée DISTINCTE, jamais de
  // quantity (toujours 1 par construction, voir le header du module).
  const afterOneKey = addItem(bagState, "key_bronze", 1);
  const afterTwoKeys = addItem(afterOneKey, "key_bronze", 1);
  run("sac : addItem (non empilable) — DEUX entrées distinctes, jamais fusionnées", 2, afterTwoKeys.bag.length);
  run("sac : addItem (non empilable) — aucune entrée ne porte de quantity", true, afterTwoKeys.bag.every((e) => e.quantity === undefined));
  const afterThreeKeysAtOnce = addItem(bagState, "key_bronze", 3);
  run("sac : addItem(count=3) sur non empilable — 3 entrées distinctes en un appel", 3, afterThreeKeysAtOnce.bag.length);

  // Type INCONNU du registre : dégrade en non empilable (jamais un crash —
  // voir le commentaire de addItem).
  const afterUnknownType = addItem(bagState, "does-not-exist", 2);
  run("sac : addItem sur un type inconnu — dégrade en non empilable (2 entrées), jamais un crash", 2, afterUnknownType.bag.length);

  run("sac : addItem NE MUTE JAMAIS l'original", 0, bagState.bag.length);

  // pickupItemEntity : effet atomique (objet + retrait), même patron que
  // pickupEntity (argent) ci-dessus.
  const ITEM_TEST_REGISTRY = { item: { nameKey: "entity.item.name" } };
  const itemScene = parseScene(
    {
      id: "movement-check-item",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 0,
      entities: [
        { id: "apple-1", type: "item", x: 5, interactable: true, action: { kind: "pickup", item: "apple", count: 1 } },
        { id: "other-1", type: "item", x: 6, interactable: true, action: { kind: "pickup", item: "key_bronze", count: 1 } },
      ],
    },
    ITEM_TEST_REGISTRY
  );
  // Sac VIDÉ ici aussi — même raison que bagState plus haut (une partie
  // neuve démarre en réalité avec des rangers dedans, hors-sujet pour ce
  // test de mécanisme).
  const itemState = { ...createInitialState(itemScene), bag: [] };

  const afterApplePickup = pickupItemEntity(itemState, "apple-1", "apple", 1);
  run("sac : pickupItemEntity ajoute l'objet au sac", 1, afterApplePickup.bag.length);
  run("sac : pickupItemEntity — quantity 1 pour une pomme", 1, afterApplePickup.bag[0].quantity);
  run(
    "sac : pickupItemEntity retire l'entité ramassée",
    false,
    getActiveWorld(afterApplePickup).entities.some((e) => e.id === "apple-1")
  );
  run(
    "sac : pickupItemEntity laisse les autres entités intactes",
    true,
    getActiveWorld(afterApplePickup).entities.some((e) => e.id === "other-1")
  );

  // Double appel (id déjà retiré, ex. tentative périmée) : effet ATOMIQUE,
  // jamais un second gain sans entité à retirer — même garantie que
  // pickupEntity.
  run(
    "sac : pickupItemEntity sur une entité déjà retirée -> aucun second ajout",
    1,
    pickupItemEntity(afterApplePickup, "apple-1", "apple", 1).bag[0].quantity
  );
  run(
    "sac : pickupItemEntity sur une entité déjà retirée -> référence INCHANGÉE",
    afterApplePickup,
    pickupItemEntity(afterApplePickup, "apple-1", "apple", 1)
  );

  // removeItem : inverse d'addItem — voir le commentaire du module pour la
  // sémantique exacte (décrémente/retire pour un empilable, retire une
  // entrée exacte pour un non empilable).
  const afterRemoveOneApple = removeItem(afterTwoApples, "apple", 1);
  run("sac : removeItem (empilable) — décrémente sans retirer l'entrée", 1, afterRemoveOneApple.bag.length);
  run("sac : removeItem (empilable) — quantity décrémentée (2 -> 1)", 1, afterRemoveOneApple.bag[0].quantity);
  const afterRemoveAllApples = removeItem(afterTwoApples, "apple", 2);
  run("sac : removeItem (empilable) — count == quantity -> entrée retirée entièrement", 0, afterRemoveAllApples.bag.length);
  // count > quantity disponible : CLAMPÉ, jamais un stock négatif.
  const afterRemoveTooManyApples = removeItem(afterTwoApples, "apple", 99);
  run("sac : removeItem (empilable) — count > disponible, clampé (entrée retirée, jamais négatif)", 0, afterRemoveTooManyApples.bag.length);

  const afterRemoveOneKey = removeItem(afterTwoKeys, "key_bronze", 1);
  run("sac : removeItem (non empilable) — retire UNE entrée exacte", 1, afterRemoveOneKey.bag.length);

  run("sac : removeItem sur un type absent du sac -> référence INCHANGÉE", bagState, removeItem(bagState, "apple", 1));
  run("sac : removeItem NE MUTE JAMAIS l'original", 2, afterTwoApples.bag[0].quantity);

  // dropItem : effet "Poser" — removeItem + spawnEphemeral, ATOMIQUEMENT
  // (voir view/menus/inventory/bag-and-equipment.js/setDropItemHandler). Un objet posé
  // en pile (count > 1) donne UNE SEULE entité éphémère portant toute la
  // quantité, jamais N éparpillées — voir core/bag.js/dropItem.
  const DROP_SPEC = {
    type: "item",
    labelKey: "item.apple.name",
    descriptionKey: "item.apple.description",
    blocksMovement: false,
    observable: true,
    interactable: true,
    action: { kind: "pickup", item: "apple", count: 1 },
  };
  const afterDrop = dropItem(afterApplePickup, "apple", 1, DROP_SPEC, 3);
  run("sac : dropItem retire l'objet du sac", 0, afterDrop.bag.length);
  const droppedEntity = getActiveWorld(afterDrop).entities.find((e) => e.ephemeral);
  run("sac : dropItem fait apparaître UNE entité éphémère", true, Boolean(droppedEntity));
  run("sac : dropItem pose l'entité à la position x demandée", 3, droppedEntity && droppedEntity.x);
  run("sac : dropItem reporte l'action pickup (count) telle quelle", 1, droppedEntity && droppedEntity.action.count);
  run("sac : dropItem NE MUTE JAMAIS l'original", 1, afterApplePickup.bag[0].quantity);

  // --- Équipement (core/equipment.js) — troisième tiers de l'inventaire ---
  // Slots nommés, gait DÉRIVÉ (jamais stocké), equipItem/unequipItem.

  run.same("équipement : EQUIPMENT_SLOTS ne couvre que 'feet' aujourd'hui", ["feet"], EQUIPMENT_SLOTS);
  run("équipement : createEmptyEquipment — slot feet à null", null, createEmptyEquipment().feet);

  // gaitOf : dérivation pure, jamais stockée sur le joueur (entities/player.js).
  run("gaitOf : slot vide -> barefoot", "barefoot", gaitOf({ feet: null }));
  run("gaitOf : baskets équipées -> shoes", "shoes", gaitOf({ feet: { type: "sneakers" } }));
  run("gaitOf : bottes en cuir équipées -> boots", "boots", gaitOf({ feet: { type: "leather_boots" } }));
  run("gaitOf : rangers équipées -> boots (même pool que les bottes en cuir)", "boots", gaitOf({ feet: { type: "combat_boots" } }));
  run("gaitOf : type retiré du registre entre-temps -> repli barefoot", "barefoot", gaitOf({ feet: { type: "does-not-exist" } }));

  const equipmentScene = parseScene(RAW_SCENE, EMPTY_REGISTRY);
  run("équipement : partie sans départ -> pieds nus", "barefoot", gaitOf(createInitialState(equipmentScene).equipment));
  // Départ d'objets de test (./helpers.js/ITEM_START) : baskets équipées,
  // rangers et escarpins dans le sac.
  const freshEquipState = createInitialState(equipmentScene, undefined, ITEM_START);
  run("équipement : départ -> baskets ÉQUIPÉES", "sneakers", freshEquipState.equipment.feet.type);
  run("équipement : départ -> rangers ET escarpins DANS LE SAC (pas équipés)", "combat_boots,high_heels", freshEquipState.bag.map((e) => e.type).join(","));
  run("équipement : gait de départ -> shoes", "shoes", gaitOf(freshEquipState.equipment));

  // equipItem : ÉCHANGE — équiper des bottes (sac) alors que des baskets
  // sont déjà au slot -> les bottes prennent le slot, les baskets
  // retournent au sac. Jamais dans les deux à la fois (voir plus bas).
  const withBootsInBag = addItem(freshEquipState, "leather_boots", 1);
  const afterEquipBoots = equipItem(withBootsInBag, "leather_boots");
  run("equipItem : le slot feet porte maintenant les bottes", "leather_boots", afterEquipBoots.equipment.feet.type);
  run(
    "equipItem : les bottes ne sont PLUS dans le sac (retirées)",
    false,
    afterEquipBoots.bag.some((entry) => entry.type === "leather_boots")
  );
  run(
    "equipItem : l'ancien occupant (baskets) est REVENU dans le sac (échange)",
    true,
    afterEquipBoots.bag.some((entry) => entry.type === "sneakers")
  );
  run("equipItem : gait suit l'équipement -> boots", "boots", gaitOf(afterEquipBoots.equipment));
  run("equipItem : NE MUTE JAMAIS l'original", "sneakers", withBootsInBag.equipment.feet.type);

  // equipItem : cas dégradés, RÉFÉRENCE INCHANGÉE, jamais une exception.
  const withApple = addItem(withBootsInBag, "apple", 1);
  run("equipItem : type NON equippable (apple, dans le sac) -> référence inchangée", withApple, equipItem(withApple, "apple"));
  run("equipItem : type absent du sac -> référence inchangée", freshEquipState, equipItem(freshEquipState, "leather_boots"));
  run("equipItem : type inconnu du registre -> référence inchangée", withBootsInBag, equipItem(withBootsInBag, "does-not-exist"));

  // unequipItem : inverse d'equipItem — retire du slot, remet au sac.
  const afterUnequip = unequipItem(afterEquipBoots, "feet");
  run("unequipItem : le slot feet est vidé", null, afterUnequip.equipment.feet);
  run(
    "unequipItem : les bottes sont revenues dans le sac",
    true,
    afterUnequip.bag.some((entry) => entry.type === "leather_boots")
  );
  run("unequipItem : gait retombe à barefoot, slot vide", "barefoot", gaitOf(afterUnequip.equipment));
  run("unequipItem : slot déjà vide -> référence inchangée", afterUnequip, unequipItem(afterUnequip, "feet"));
  run("unequipItem : NE MUTE JAMAIS l'original", "leather_boots", afterEquipBoots.equipment.feet.type);

  // Invariant : un objet donné n'est JAMAIS à la fois dans le sac ET équipé.
  run(
    "équipement : invariant — un objet équipé n'est jamais AUSSI dans le sac",
    false,
    afterEquipBoots.bag.some((entry) => entry.type === afterEquipBoots.equipment.feet.type)
  );

  // --- Tags d'objets (core/tags.js, core/items.js/ITEM_REGISTRY.tags,
  // core/equipment.js/equippedTags, condition "hasEquipmentTag") ---

  run("tags : registre — military a la bonne clé i18n", "tag.military", tagProps("military").labelKey);
  run("tags : registre — clé inconnue -> undefined", undefined, tagProps("does-not-exist"));
  run("tags : registre — tagProps délègue à TAG_REGISTRY", TAG_REGISTRY.military, tagProps("military"));
  run("tags : ITEM_REGISTRY — les rangers portent le tag military", true, ITEM_REGISTRY.combat_boots.tags.includes("military"));
  run("tags : ITEM_REGISTRY — les escarpins portent le tag chic", true, ITEM_REGISTRY.high_heels.tags.includes("chic"));
  run("tags : ITEM_REGISTRY — les escarpins imposent le gait high_heels", "high_heels", ITEM_REGISTRY.high_heels.gait);
  run("gaitOf : escarpins équipés -> high_heels", "high_heels", gaitOf({ feet: { type: "high_heels" } }));

  // validateItemTags : même filet que la validation des surfaces contre
  // SURFACE_REGISTRY — un tag inconnu échoue clairement, jamais un mismatch
  // silencieux. ITEM_REGISTRY lui-même a déjà passé ce filet au chargement
  // de core/items.js (sinon ce fichier n'aurait jamais fini de s'importer) ;
  // testé ICI contre un registre de test pour prouver l'échec SANS corrompre
  // le vrai registre.
  const unknownItemTagThrew = throws(() => validateItemTags({ fake_item: { stackable: false, tags: ["does-not-exist"] } }));
  run("tags : validateItemTags — tag inconnu sur un objet -> échec clair", true, unknownItemTagThrew);
  run(
    "tags : validateItemTags — tags valides ou absents -> aucune erreur",
    false,
    throws(() => validateItemTags({ a: { stackable: false, tags: ["military"] }, b: { stackable: false } }))
  );

  // equippedTags : UNIFIÉ — même fonction pour le joueur (session.equipment)
  // qu'un compagnon/PNJ hypothétique (n'importe quel objet de même forme),
  // aucun cas spécial par type de porteur.
  run("tags : equippedTags — slot vide -> aucun tag", 0, equippedTags({ feet: null }).size);
  run("tags : equippedTags — objet sans tags (baskets) -> aucun tag", 0, equippedTags({ feet: { type: "sneakers" } }).size);
  run("tags : equippedTags — objet tagué (rangers) -> tag présent", true, equippedTags({ feet: { type: "combat_boots" } }).has("military"));
  run("tags : equippedTags — escarpins équipés -> tag chic présent", true, equippedTags({ feet: { type: "high_heels" } }).has("chic"));
  const fakeNpcEquipment = { feet: { type: "combat_boots" } };
  run(
    "tags : equippedTags — même résultat pour un porteur quelconque (compagnon/PNJ simulé)",
    true,
    equippedTags(fakeNpcEquipment).has("military")
  );

  // Dérivé, jamais stocké : équiper/déséquiper fait apparaître/disparaître
  // le tag IMMÉDIATEMENT, sans code de synchro (même vérification que
  // gaitOf plus haut). freshEquipState.bag[0] est déjà les rangers de départ
  // (voir le test "rangers DANS LE SAC" plus haut).
  const afterEquipRangers = equipItem(freshEquipState, "combat_boots");
  run("tags : equippedTags — absent avant d'équiper les rangers", false, equippedTags(freshEquipState.equipment).has("military"));
  run("tags : equippedTags — présent dès l'équipement des rangers", true, equippedTags(afterEquipRangers.equipment).has("military"));
  const afterUnequipRangers = unequipItem(afterEquipRangers, "feet");
  run("tags : equippedTags — de nouveau absent après déséquipement", false, equippedTags(afterUnequipRangers.equipment).has("military"));

  // Même vérification pour les escarpins (tag "chic") — freshEquipState.bag[1]
  // est déjà les escarpins de départ (voir test "escarpins de départ" plus
  // haut).
  const afterEquipHeels = equipItem(freshEquipState, "high_heels");
  run("tags : equippedTags — absent avant d'équiper les escarpins", false, equippedTags(freshEquipState.equipment).has("chic"));
  run("tags : equippedTags — présent dès l'équipement des escarpins", true, equippedTags(afterEquipHeels.equipment).has("chic"));
  const afterUnequipHeels = unequipItem(afterEquipHeels, "feet");
  run("tags : equippedTags — de nouveau absent après déséquipement des escarpins", false, equippedTags(afterUnequipHeels.equipment).has("chic"));

  // Condition "hasEquipmentTag" — branchée dans l'aiguillage existant
  // (evaluateCondition), lit context.playerEquipment via equippedTags —
  // PAS context.entity (voir core/presence.js/evaluateHasEquipmentTag,
  // "CLÉ DE CONTEXTE DÉDIÉE, PAS context.entity" : context.entity désigne
  // TOUJOURS l'entité qui PORTE la condition, jamais le joueur — voir
  // variables.check.js).
  run(
    "tags : hasEquipmentTag — joueur équipé du tag -> vraie",
    true,
    evaluateCondition({ type: "hasEquipmentTag", tag: "military" }, { playerEquipment: { feet: { type: "combat_boots" } } })
  );
  run(
    "tags : hasEquipmentTag — joueur équipé d'un autre objet (sans le tag) -> fausse",
    false,
    evaluateCondition({ type: "hasEquipmentTag", tag: "military" }, { playerEquipment: { feet: { type: "sneakers" } } })
  );
  run(
    "tags : hasEquipmentTag — playerEquipment absent -> fausse (jamais une exception)",
    false,
    evaluateCondition({ type: "hasEquipmentTag", tag: "military" }, {})
  );
  run(
    "tags : hasEquipmentTag — context.entity présent mais playerEquipment absent -> fausse (les deux clés sont INDÉPENDANTES)",
    false,
    evaluateCondition({ type: "hasEquipmentTag", tag: "military" }, { entity: { equipment: { feet: { type: "combat_boots" } } } })
  );
  run(
    "tags : hasEquipmentTag — tag chic (escarpins équipés) -> vraie",
    true,
    evaluateCondition({ type: "hasEquipmentTag", tag: "chic" }, { playerEquipment: { feet: { type: "high_heels" } } })
  );

  // Validation au chargement (core/script-parse.js/parsePresenceRule) : un tag de
  // condition inconnu échoue clairement, même principe que la surface d'un
  // segment (voir surfaces.check.js).
  const TAG_TRIGGER_REGISTRY = { dog: { nameKey: "entity.dog.name" } };
  let validTagConditionAccepted = false;
  try {
    parseScene(
      {
        id: "movement-check-tags-valid",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "tag-rule-ok",
            type: "dog",
            x: 5,
            presence: [{ when: { type: "hasEquipmentTag", tag: "military" }, present: true }],
          },
        ],
      },
      TAG_TRIGGER_REGISTRY
    );
    validTagConditionAccepted = true;
  } catch {
    validTagConditionAccepted = false;
  }
  run("tags : hasEquipmentTag avec un tag valide -> chargé sans erreur", true, validTagConditionAccepted);

  const unknownTagConditionThrew = throws(() => {
    parseScene(
      {
        id: "movement-check-tags-invalid",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        entities: [
          {
            id: "tag-rule-bad",
            type: "dog",
            x: 5,
            presence: [{ when: { type: "hasEquipmentTag", tag: "does-not-exist" }, present: true }],
          },
        ],
      },
      TAG_TRIGGER_REGISTRY
    );
  });
  run("tags : hasEquipmentTag avec un tag inconnu -> échec clair au chargement", true, unknownTagConditionThrew);

  // --- Objet au sol générique (type "item") : nom, description et sons
  // repris de l'objet ramassé (core/entity-parse.js/genericItemDefaults,
  // core/items.js/itemSounds), toujours redéfinissables par l'instance. ---
  const GENERIC_ITEM_REGISTRY = { item: { nameKey: "entity.item.name", descriptionKey: "entity.item.description", sounds: { beacon: { path: "generic", loop: true } } } };
  const genericItemScene = parseScene(
    {
      id: "generic-item", titleKey: "scene.demo.name", length: 10, playerStart: 0,
      entities: [
        { id: "res", type: "item", x: 2, action: { kind: "pickup", item: "resistor", count: 1 } },
        { id: "res-named", type: "item", x: 4, nameKey: "custom.name", action: { kind: "pickup", item: "resistor", count: 1 } },
        { id: "boots", type: "item", x: 6, action: { kind: "pickup", item: "combat_boots", count: 1 } },
      ],
    },
    GENERIC_ITEM_REGISTRY
  );
  const genericById = Object.fromEntries(genericItemScene.entities.map((e) => [e.id, e]));
  run("objet au sol : nom repris de l'objet", "item.resistor.name", genericById.res.labelKey);
  run("objet au sol : description reprise de l'objet", "item.resistor.description", genericById.res.descriptionKey);
  run("objet au sol : beacon = son de l'objet, en boucle", `${ITEM_REGISTRY.resistor.sound}/true`, `${genericById.res.sounds.beacon.path}/${genericById.res.sounds.beacon.loop}`);
  run("objet au sol : ramassage = même son", ITEM_REGISTRY.resistor.sound, genericById.res.sounds.pickup.path);
  run("objet au sol : nom de l'instance prioritaire", "custom.name", genericById["res-named"].labelKey);
  run("objet au sol : objet sans son -> sons de l'archétype", "generic", genericById.boots.sounds.beacon.path);
  run("objet au sol : itemSounds d'un objet sans son -> rien", undefined, itemSounds("apple"));

  // --- Ramassage et loot dans une scène à DEUX FACES : l'entité est
  // cherchée sur la face active (core/state.js/activeFaceEntities), un
  // monde à deux faces n'ayant pas de liste d'entités propre. ---
  {
    const twoFaced = parseScene(
      {
        id: "two-faced-pickup", titleKey: "scene.demo.name", length: 10, playerStart: 0,
        recto: { entities: [] },
        verso: { entities: [
          { id: "comp", type: "item", x: 3, action: { kind: "pickup", item: "resistor", count: 1 } },
          { id: "cash", type: "item", x: 5, action: { kind: "pickup", item: "apple", count: 1 } },
        ] },
      },
      GENERIC_ITEM_REGISTRY
    );
    let state = createInitialState(twoFaced, "two-faced");
    state = switchSide(state, 3);
    const picked = pickupItemEntity(state, "comp", "resistor", 1);
    run("deux faces : objet ramassé au sac", 1, ownedQuantity(picked.bag, "resistor"));
    run("deux faces : entité retirée de la face", false, getActiveWorld(picked).entities.some((e) => e.id === "comp"));
    const paid = pickupEntity(state, "cash", 5);
    run("deux faces : argent ramassé", state.money + 5, paid.money);
    run("deux faces : loot unique -> consumed", true, getActiveWorld(lootUniqueEntity(state, "cash")).entities.find((e) => e.id === "cash").consumed);
  }
}
