// Le SAC (session.bag) — deuxième tiers de l'inventaire après l'argent
// (voir core/money.js) : une liste d'ENTRÉES, { type, quantity } pour un
// objet EMPILABLE (voir core/items.js/ITEM_REGISTRY) — une SEULE entrée
// par type, quantity incrémentée à chaque ajout — ou { type } SEUL pour un
// objet NON empilable — une entrée PAR EXEMPLAIRE, jamais de quantity
// (toujours 1 par construction : deux clés = deux entrées distinctes).
// SEULS points d'écriture : addItem (ajout) et removeItem (retrait) ci-dessous.
//
// ACQUISITION : addItem est le POINT UNIQUE par lequel un objet entre dans
// le sac (ramassage, achat, retour d'un objet déséquipé, toute source
// future). Il note au passage que l'objet a été acquis au moins une fois
// (session.acquiredItems, `{ [type]: true }`), un fait DÉFINITIF : retirer
// l'objet ne l'efface jamais. Fait neutre, sans aucune connaissance des
// collections, qui le LISENT pour savoir ce qui est découvert (voir
// core/collections.js, doc/collections.md).
//
// PAS de limite de sac, PAS d'id par entrée : YAGNI délibéré — aucune
// contrainte de place n'existe encore. Une limite de place ou un identifiant
// d'entrée s'ajouteront SI le gameplay les réclame, sans changer cette forme
// aujourd'hui — pas construits par anticipation. Action par-entrée : voir
// "Poser" (dropItem plus bas, view/menus/inventory-menu.js) — la PREMIÈRE
// action du sac au-delà de la consultation.

import { removeEntity, spawnEphemeral, activeFaceEntities } from "./state.js";
import { ITEM_REGISTRY } from "./items.js";

// type ABSENT du registre -> traité comme NON empilable (repli sûr, jamais
// un throw pour un typo de contenu — même politique de dégradation que le
// reste du projet, ex. core/presence.js sur une condition inconnue) : crée
// une entrée de plus, silencieusement dégradée, jamais un crash en jeu
// réel.
export function addItem(session, type, count = 1) {
  return markAcquired(addToBag(session, type, count), type);
}

function addToBag(session, type, count) {
  const stackable = Boolean(ITEM_REGISTRY[type] && ITEM_REGISTRY[type].stackable);

  if (stackable) {
    const existingIndex = session.bag.findIndex((entry) => entry.type === type);
    if (existingIndex === -1) {
      return { ...session, bag: [...session.bag, { type, quantity: count }] };
    }
    const bag = session.bag.map((entry, index) =>
      index === existingIndex ? { ...entry, quantity: entry.quantity + count } : entry
    );
    return { ...session, bag };
  }

  const newEntries = Array.from({ length: count }, () => ({ type }));
  return { ...session, bag: [...session.bag, ...newEntries] };
}

// Note `type` comme acquis (voir le header). Déjà noté -> référence
// INCHANGÉE pour acquiredItems (rien de neuf à signaler à un observateur).
export function markAcquired(session, type) {
  const acquired = session.acquiredItems || {};
  if (acquired[type]) return session;
  return { ...session, acquiredItems: { ...acquired, [type]: true } };
}

// Effet "pickup" vers le SAC (voir view/interaction.js, ACTION_HANDLERS.
// pickup — action.item) : ajoute l'objet ET retire l'entité ramassée du
// monde actif, ATOMIQUEMENT — même garantie que core/money.js/pickupEntity
// (jamais l'un sans l'autre, jamais un second gain sur une entité déjà
// ramassée). entityId DÉJÀ absent du monde actif -> RÉFÉRENCE INCHANGÉE,
// vérifié EXPLICITEMENT avant tout ajout, même politique atomique que
// pickupEntity.
export function pickupItemEntity(session, entityId, type, count = 1) {
  if (!activeFaceEntities(session).some((entity) => entity.id === entityId)) return session;
  return removeEntity(addItem(session, type, count), entityId);
}

// Inverse d'addItem — retire `count` exemplaire(s) de `type` du sac : pour
// un objet EMPILABLE, décrémente `quantity` (retire l'entrée entièrement si
// `count` couvre tout ce qui reste) ; pour un objet NON empilable, retire
// UNE entrée exacte (laquelle importe peu : des entrées non empilables du
// même type sont indiscernables entre elles, voir le header du module).
// `count` CLAMPÉ au disponible (jamais un stock négatif) : un appelant qui
// demande plus que ce qui existe reçoit exactement ce qu'il y avait. Type
// absent du sac -> RÉFÉRENCE INCHANGÉE, jamais une exception (même politique
// défensive que removeEntity/markConsumed, voir core/state.js).
export function removeItem(session, type, count = 1) {
  const stackable = Boolean(ITEM_REGISTRY[type] && ITEM_REGISTRY[type].stackable);

  if (stackable) {
    const index = session.bag.findIndex((entry) => entry.type === type);
    if (index === -1) return session;
    const entry = session.bag[index];
    const removed = Math.min(count, entry.quantity);
    if (removed >= entry.quantity) {
      return { ...session, bag: session.bag.filter((_, i) => i !== index) };
    }
    const bag = session.bag.map((e, i) => (i === index ? { ...e, quantity: e.quantity - removed } : e));
    return { ...session, bag };
  }

  const index = session.bag.findIndex((entry) => entry.type === type);
  if (index === -1) return session;
  return { ...session, bag: session.bag.filter((_, i) => i !== index) };
}

// Effet "Poser" (drop) — voir view/menus/inventory-menu.js/setDropItemHandler,
// entities/model.md/"Sac d'objets" : retire `count` exemplaire(s) du sac ET
// fait apparaître UNE entité éphémère au sol portant TOUTE la quantité posée
// EN UNE FOIS (jamais N entités éparpillées — un dépôt n'est pas un
// éclatement de butin comme "loot"/action.spawn, voir entities/model.md pour
// la justification complète), à la position `x` du joueur. `spec` :
// descripteur DÉJÀ RÉSOLU (voir spawnEphemeral, core/state.js), construit par
// l'appelant (view/city-screen.js) — ce module ignore tout du registre de
// types d'entités. Symétrique de pickupItemEntity ci-dessus (removeItem +
// spawnEphemeral au lieu d'addItem + removeEntity) : compose deux fonctions
// déjà pures, aucune nouvelle règle de résolution.
export function dropItem(session, type, count, spec, x) {
  return spawnEphemeral(removeItem(session, type, count), spec, x);
}
