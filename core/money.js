// Argent — SCALAIRE de la PARTIE (cercle session, comme l'horloge — voir
// core/time.js/advanceTime), pas une collection d'objets : un compteur,
// jamais un item de sac/équipement (futur, découplé volontairement). SEUL
// point d'écriture : addMoney — aucun autre endroit du code n'incrémente
// session.money directement.

import { removeEntity, markConsumed, spawnScatteredEphemerals, activeFaceEntities } from "./state.js";

export function addMoney(session, amount) {
  return { ...session, money: session.money + amount };
}

// Effet "pickup" (voir view/interaction.js, ACTION_HANDLERS.pickup) :
// ajoute l'argent ET retire l'entité ramassée du monde actif, DANS LE MÊME
// nouvel état — jamais l'un sans l'autre (une entité ramassée mais pas
// payée, ou payée mais toujours là, serait un état incohérent observable).
// entityId DÉJÀ absent du monde actif (déjà ramassée, id périmé, ex. double
// appel) -> RÉFÉRENCE INCHANGÉE, aucun gain supplémentaire : vérifié
// EXPLICITEMENT avant d'ajouter l'argent (pas seulement délégué à
// removeEntity, qui dégraderait le retrait sans empêcher un second
// paiement) — l'effet reste atomique, jamais l'un sans l'autre dans AUCUN
// sens.
export function pickupEntity(session, entityId, amount) {
  if (!activeFaceEntities(session).some((entity) => entity.id === entityId)) return session;
  return removeEntity(addMoney(session, amount), entityId);
}

// Effet "loot" (voir view/interaction.js, ACTION_HANDLERS.loot) : COLLECTIBLE
// PERSISTANT — donne `amount` UNE SEULE FOIS puis marque l'entité consumed
// (voir core/state.js/markConsumed), mais NE LA RETIRE JAMAIS du monde (voir
// doc/entity-model.md/"Collectible persistant") — distinct de pickupEntity
// ci-dessus, qui retire l'entité. IDEMPOTENCE : une entité déjà consumed ->
// RÉFÉRENCE INCHANGÉE, AUCUN gain supplémentaire — vérifié EXPLICITEMENT
// avant tout écriture (même politique atomique que pickupEntity : jamais
// l'argent ajouté sans l'état posé, ni l'inverse). Les effets POST-
// ACTIVATION (description alternative, dormance) ne sont PAS déclenchés
// ici : ce sont des propriétés DÉCLARATIVES de l'entité (consumedDescriptionKey,
// une règle de présence sur la condition "consumed"), lues ailleurs
// (view/interaction.js, core/presence.js) — ce module ne fait que poser
// l'état dont elles dépendent, jamais leur logique de rendu.
export function lootEntity(session, entityId, amount) {
  const entity = activeFaceEntities(session).find((e) => e.id === entityId);
  if (!entity || entity.consumed) return session;
  return markConsumed(addMoney(session, amount), entityId);
}

// Collectible persistant SANS crédit ni éparpillement (troisième forme de
// l'action "loot", l'objet unique : sa substance est dans les effets de
// l'action, ex. giveImprovement — voir view/interaction.js/handleLoot) :
// marque seulement l'entité consumed. Déjà consumed ou absente -> référence
// INCHANGÉE, même garde que lootEntity.
export function lootUniqueEntity(session, entityId) {
  const entity = activeFaceEntities(session).find((e) => e.id === entityId);
  if (!entity || entity.consumed) return session;
  return markConsumed(session, entityId);
}

// Variante de lootEntity ci-dessus (voir view/interaction.js,
// ACTION_HANDLERS.loot — action.spawn) : AU LIEU de créditer amount
// directement, fait naître `count` entités éphémères ÉPARPILLÉES autour de
// la source (voir core/state.js/spawnScatteredEphemerals) — chacune
// ramassable individuellement via son propre effet "pickup" (voir
// doc/entity-model.md/"Collectible persistant"). MÊME idempotence que
// lootEntity : entité absente OU déjà consumed -> RÉFÉRENCE INCHANGÉE,
// AUCUN spawn (jamais un second lot de pièces sur une caisse déjà
// fouillée) — vérifié AVANT tout, comme partout ailleurs dans ce fichier.
export function lootEntitySpawn(session, entityId, spec, count, spread) {
  const entity = activeFaceEntities(session).find((e) => e.id === entityId);
  if (!entity || entity.consumed) return session;
  return spawnScatteredEphemerals(markConsumed(session, entityId), spec, entity.x, count, spread);
}
