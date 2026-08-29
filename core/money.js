// Argent — SCALAIRE de la PARTIE (cercle session, comme l'horloge — voir
// core/time.js/advanceTime), pas une collection d'objets : un compteur,
// jamais un item de sac/équipement (futur, découplé volontairement). SEUL
// point d'écriture : addMoney — aucun autre endroit du code n'incrémente
// session.money directement.

import { removeEntity, markConsumed } from "./state.js";

export function addMoney(session, amount) {
  return { ...session, money: session.money + amount };
}

// Effet "pickup" (voir view/interaction.js, ACTION_HANDLERS.pickup) :
// ajoute l'argent ET retire l'entité ramassée du lieu actif, DANS LE MÊME
// nouvel état — jamais l'un sans l'autre (une entité ramassée mais pas
// payée, ou payée mais toujours là, serait un état incohérent observable).
// entityId DÉJÀ absent du lieu actif (déjà ramassée, id périmé, ex. double
// appel) -> RÉFÉRENCE INCHANGÉE, aucun gain supplémentaire : vérifié
// EXPLICITEMENT avant d'ajouter l'argent (pas seulement délégué à
// removeEntity, qui dégraderait le retrait sans empêcher un second
// paiement) — l'effet reste atomique, jamais l'un sans l'autre dans AUCUN
// sens.
export function pickupEntity(session, entityId, amount) {
  const world = session.worlds[session.activeWorldId];
  if (!world.entities.some((entity) => entity.id === entityId)) return session;
  return removeEntity(addMoney(session, amount), entityId);
}

// Effet "loot" (voir view/interaction.js, ACTION_HANDLERS.loot) : COLLECTIBLE
// PERSISTANT — donne `amount` UNE SEULE FOIS puis marque l'entité consumed
// (voir core/state.js/markConsumed), mais NE LA RETIRE JAMAIS du lieu (voir
// entities/model.md/"Collectible persistant") — distinct de pickupEntity
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
  const world = session.worlds[session.activeWorldId];
  const entity = world.entities.find((e) => e.id === entityId);
  if (!entity || entity.consumed) return session;
  return markConsumed(addMoney(session, amount), entityId);
}
