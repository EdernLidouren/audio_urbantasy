// EFFETS D'ÉTAT des actions de jeu, branchés sur les modules qui les
// déclenchent (view/interaction.js, les menus d'inventaire, de boutique et de
// sauvegarde) sans qu'ils aient à connaître la partie ni la vue du monde.
// Chaque effet passe par le core puis remplace la session ; le son et
// l'annonce restent au module déclencheur.
//
// UNE seule table [enregistreur, gestionnaire] sert à BRANCHER et à
// DÉBRANCHER : une ligne ajoutée ici l'est des deux côtés, jamais un
// gestionnaire oublié à la sortie.

import {
  setTeleportHandler,
  setPickupHandler,
  setItemPickupHandler,
  setLootHandler,
  setLootUniqueHandler,
  setLootSpawnHandler,
  setSideSwitchHandler,
  setSessionProvider,
  setPositionedSoundPlayer,
  setVariableEffectsHandler,
  setSearchHandler,
  setShopHandler,
} from "./interaction-handlers.js";
import { openShopMenu, setSellHandler, setBuyHandler } from "./menus/shop-menu.js";
import { setDropItemHandler, setEquipItemHandler, setUnequipItemHandler } from "./menus/inventory-menu.js";
import { setGameReplaceHandler } from "./menus/save-menu.js";
import registry from "../entities/types/index.js";
import { applyEntityActionEffects } from "../core/state.js";
import { pickupEntity, lootEntity, lootUniqueEntity, lootEntitySpawn } from "../core/money.js";
import { pickupItemEntity, dropItem } from "../core/bag.js";
import { searchContainer, ephemeralArchetypeSpec, ephemeralItemSpec } from "../core/spawn.js";
import { equipItem, unequipItem } from "../core/equipment.js";
import { sellItems, buyItems, restockShopIfDue } from "../core/trade.js";

// Branche tous les gestionnaires et rend la fonction qui les débranche.
// `travel` : view/world-travel.js (voyages, vue du monde COURANTE).
export function registerActionHandlers({ getSession, setSession, travel }) {
  const bindings = [
    // Effet "teleport" (portes et tout autre effet).
    [setTeleportHandler, travel.executeTeleport],
    // Ramassage d'argent (`amount` déjà extrait de l'action résolue par
    // view/interaction.js).
    [setPickupHandler, (entity, amount) => setSession(pickupEntity(getSession(), entity.id, amount))],
    // Ramassage vers le sac.
    [setItemPickupHandler, (entity, item, count) => setSession(pickupItemEntity(getSession(), entity.id, item, count))],
    // Loot d'argent : l'entité passe consommée, jamais retirée.
    [setLootHandler, (entity, amount) => setSession(lootEntity(getSession(), entity.id, amount))],
    // Loot d'un objet unique : l'entité passe consommée, rien d'autre.
    [setLootUniqueHandler, (entity) => setSession(lootUniqueEntity(getSession(), entity.id))],
    // Loot éparpillé : le descripteur minimal (ex. { type: "money", amount:
    // 20 }) est résolu par le core, avec le registre injecté.
    [
      setLootSpawnHandler,
      (entity, spawn) => {
        const spec = ephemeralArchetypeSpec(getSession(), spawn.spec.type, registry, spawn.spec);
        setSession(lootEntitySpawn(getSession(), entity.id, spec, spawn.count, spawn.spread));
      },
    ],
    // Bascule de face par un passage.
    [setSideSwitchHandler, travel.sideSwitch],
    // Écriture de variables (setVariable, toggleVariable, addVariable) : le
    // core résout seul la portée de chaque effet.
    [setVariableEffectsHandler, (entity, effects) => setSession(applyEntityActionEffects(getSession(), entity.id, effects))],
    // Fouille d'un conteneur : rend l'état du conteneur avant la fouille et le
    // nombre d'objets tombés, que view/interaction.js annonce.
    [
      setSearchHandler,
      (entity) => {
        const result = searchContainer(getSession(), entity.id, registry);
        if (result.session !== getSession()) setSession(result.session);
        return { status: result.status, count: result.items.length };
      },
    ],
    // Point de vente : rayon rechargé si un cycle est passé, puis menu (qui a
    // besoin de la vue du monde pour mettre les balises en pause).
    [
      setShopHandler,
      (entity) => {
        setSession(restockShopIfDue(getSession(), entity.id));
        openShopMenu(travel.current, getSession, entity);
      },
    ],
    [setSellHandler, (sales) => setSession(sellItems(getSession(), sales))],
    [setBuyHandler, (entityId, purchases) => setSession(buyItems(getSession(), entityId, purchases))],
    // Poser un objet du sac : il apparaît au sol, aux pieds du joueur.
    [
      setDropItemHandler,
      (type, count) => {
        const session = getSession();
        const spec = ephemeralItemSpec(session, type, count, registry);
        setSession(dropItem(session, type, count, spec, session.player.x));
      },
    ],
    // Équiper : l'ancien occupant de l'emplacement revient au sac.
    [setEquipItemHandler, (type) => setSession(equipItem(getSession(), type))],
    [setUnequipItemHandler, (slot) => setSession(unequipItem(getSession(), slot))],
    // Import d'une partie.
    [setGameReplaceHandler, travel.replaceCurrentGame],
    // Fournisseurs relus à CHAQUE évaluation d'une condition d'action :
    // équiper, changer l'heure ou obtenir une amélioration change le verdict
    // aussitôt, sans code de synchronisation.
    [setSessionProvider, () => getSession()],
    // Effet "playSound" diégétique, sur la vue COURANTE (aucune hors
    // partie : rien ne se passe).
    [
      setPositionedSoundPlayer,
      (entityId, descriptor, options) => {
        const worldView = travel.current();
        return worldView && worldView.playEntityOneShot(entityId, descriptor, options);
      },
    ],
  ];

  for (const [register, handler] of bindings) register(handler);
  return function unregisterActionHandlers() {
    for (const [register] of bindings) register(null);
  };
}
