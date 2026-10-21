// Onglets SAC et ÉQUIPEMENT de l'inventaire (voir la coquille à onglets,
// view/menus/inventory-menu.js) : leurs lignes, le MENU D'ACTIONS d'un objet
// (Équiper, Poser, Déséquiper), le SÉLECTEUR DE QUANTITÉ à poser, et le
// retour silencieux vers l'onglet à jour après une action réussie (voir
// executeAction). Les effets d'état passent par des gestionnaires injectés
// (view/action-handlers.js) : ce module ne LIT que des registres et des
// lectures pures du core, il n'écrit jamais l'état.

import { t } from "../../../data/i18n/index.js";
import { pushScreen, popScreen } from "../../../lib/screens.js";
import { withPausedBeacons } from "../../paused-beacons.js";
import { makeMenuScreen } from "../../../lib/menu.js";
import { announce, stripTrailingPeriod } from "../../../lib/announce.js";
import { playMenuSound } from "../../menu-sounds.js";
import { ITEM_REGISTRY } from "../../../core/items.js";
import { EQUIPMENT_SLOTS } from "../../../core/equipment.js";
import { resolveAction, checkBindingsForCollisions } from "../../../lib/input.js";
import { TUNING_DEFAULTS } from "../../../config/tuning-values.js";

// Bindings du sélecteur de quantité (voir openQuantitySelector plus bas) —
// aucun -> ±1, Maj -> pas intermédiaire, Ctrl -> grand pas (réglages
// bagQuantity*Step, config/tuning-values.js), chacun une action DISTINCTE (mods exige une correspondance EXACTE, voir
// lib/input.js) plutôt qu'un magnitude lue sur l'évènement.
const QUANTITY_BINDINGS = {
  decrease: { keys: ["ArrowLeft"], mods: [] },
  decreaseBig: { keys: ["ArrowLeft"], mods: ["shift"] },
  decreaseBigger: { keys: ["ArrowLeft"], mods: ["ctrl"] },
  increase: { keys: ["ArrowRight"], mods: [] },
  increaseBig: { keys: ["ArrowRight"], mods: ["shift"] },
  increaseBigger: { keys: ["ArrowRight"], mods: ["ctrl"] },
  confirm: { keys: ["Enter", " "], mods: [] },
  cancel: { keys: ["Escape"], mods: [] },
};
checkBindingsForCollisions(QUANTITY_BINDINGS, "view/menus/inventory/bag-and-equipment.js QUANTITY_BINDINGS");

// Amplitude signée de chaque action d'ajustement — un seul endroit à lire
// pour connaître le pas d'une action donnée, jamais dupliqué dans
// openQuantitySelector.
const QUANTITY_STEP_BY_ACTION = {
  decrease: -1,
  decreaseBig: -TUNING_DEFAULTS.bagQuantityMediumStep,
  decreaseBigger: -TUNING_DEFAULTS.bagQuantityBigStep,
  increase: 1,
  increaseBig: TUNING_DEFAULTS.bagQuantityMediumStep,
  increaseBigger: TUNING_DEFAULTS.bagQuantityBigStep,
};

// Noms d'affichage des slots d'équipement (core/equipment.js/EQUIPMENT_SLOTS)
// — DONNÉE DE VUE (clé i18n par slot), jamais dérivée du core : un nom de
// slot est un choix de contenu/présentation, pas une propriété structurelle.
// Ajouter un slot (torse, tête...) demande une entrée ici EN PLUS de
// EQUIPMENT_SLOTS côté core — non fait automatiquement, documenté pour ne
// pas oublier.
const EQUIPMENT_SLOT_LABELS = { feet: "equipment.slot.feet" };

// (type, count) => void — applique l'effet d'ÉTAT du "Poser" (retrait du
// sac + apparition au sol, voir core/bag.js/dropItem), fourni par
// view/action-handlers.js qui seul détient getSession/setSession — même
// principe d'injection que view/interaction-handlers.js/setPickupHandler (ce module
// ne LIT que des registres et des lectures pures du core, jamais il n'écrit
// l'état).
let dropItemHandler = null;

export function setDropItemHandler(handler) {
  dropItemHandler = handler;
}

// (type) => void — applique l'effet d'ÉTAT "Équiper" (core/equipment.js/
// equipItem), même principe d'injection que dropItemHandler ci-dessus.
let equipItemHandler = null;

export function setEquipItemHandler(handler) {
  equipItemHandler = handler;
}

// (slot) => void — applique l'effet d'ÉTAT "Déséquiper" (core/equipment.js/
// unequipItem), même principe.
let unequipItemHandler = null;

export function setUnequipItemHandler(handler) {
  unequipItemHandler = handler;
}

// L'écran d'onglets ouvert (au plus un à la fois), signalé par la coquille
// (view/menus/inventory-menu.js, voir setCurrentTabsScreen) : permet aux
// effets (Poser/Équiper/Déséquiper, potentiellement enfouis sous un menu
// d'actions ET un sélecteur de quantité) de revenir SILENCIEUSEMENT à
// l'onglet À JOUR après une action réussie, sans threader une référence à
// travers chaque niveau d'appel (bagEntryLine -> openItemActionsMenu ->
// confirmX -> executeAction).
let currentTabsScreen = null;

export function setCurrentTabsScreen(screen) {
  currentTabsScreen = screen;
}

// { label, labelParams } pour UNE entrée du sac — voir core/bag.js pour la
// forme d'une entrée : { type, quantity } EMPILABLE (quantity présent) ->
// "<objet> × <quantité> : <description>" ; { type } SEUL (non empilable) ->
// "<objet> : <description>", quantité omise (elle n'a pas de sens). Le nom
// annoncé D'ABORD, la description EN QUEUE : qui ne veut que le nom l'a déjà
// entendu et peut passer à l'objet suivant, la description reste
// non-bloquante par construction. Le nom et la description sont déjà résolus
// ICI (t(...)) avant interpolation dans lib/menu.js : interpolate() ne fait
// que remplacer des chaînes dans un gabarit, jamais une traduction imbriquée.
// Point final de la description RETIRÉ avant interpolation : cette ligne
// n'est pas la fin de la phrase (lib/menu.js/actionLine lui ajoute encore
// ". <position>", voir "1 sur 2") — sans ce retrait, la description
// (toujours terminée par un point dans i18n/) produirait un double point
// ("croquante..") à chaque affichage avec le suffixe de position actif
// (voir lib/announce.js/stripTrailingPeriod).

// Texte AUTONOME (phrase complète, point final CONSERVÉ) pour une entrée du
// sac — réservé à la réannonce après retrait (voir bagRemovalAnnouncement
// plus bas), jamais à la ligne de menu elle-même (bagEntryLine ci-dessous,
// qui strip le point pour laisser la place au suffixe de position ajouté
// par lib/menu.js).
function describeBagEntry(entry) {
  const item = t(ITEM_REGISTRY[entry.type].label);
  const description = t(ITEM_REGISTRY[entry.type].descriptionKey);
  return entry.quantity !== undefined
    ? t("inventory.entry.stack", { item, quantity: entry.quantity, description })
    : t("inventory.entry.unique", { item, description });
}

function bagEntryLine(getWorldView, getSession, entry, index) {
  const itemLabelKey = ITEM_REGISTRY[entry.type].label;
  const description = stripTrailingPeriod(t(ITEM_REGISTRY[entry.type].descriptionKey));
  const item = t(itemLabelKey);

  const text =
    entry.quantity !== undefined
      ? { label: "inventory.entry.stack", labelParams: { item, quantity: entry.quantity, description } }
      : { label: "inventory.entry.unique", labelParams: { item, description } };

  return {
    ...text,
    onActivate: () => openItemActionsMenu(getWorldView, getSession, entry, itemLabelKey, index),
  };
}

// Index où le curseur doit atterrir après le RETRAIT de l'entrée `index` du
// sac (RÈGLE GÉNÉRALE — voir executeAction/bagRemovalAnnouncement) :
// l'entrée qui prend sa place (même index, décalée), sinon la précédente,
// sinon 0 — seul index valide de l'état "sac vide" (voir buildBagEntries, un
// placeholder unique). Appelé APRÈS l'effet (bag déjà à jour).
function bagCursorAfterRemoval(bag, index) {
  return Math.min(index, Math.max(bag.length - 1, 0));
}

// Réannonce après RETRAIT d'une entrée du sac (RÈGLE GÉNÉRALE, pas
// seulement l'équipement — voir header executeAction) : décrit l'entrée qui
// prend la place de l'index retiré, sinon la précédente, sinon "Sac vide."
// — jamais un silence sur le sac devenu vide, jamais un index invalide.
// Appelé APRÈS l'effet (getSession() déjà à jour).
function bagRemovalAnnouncement(getSession, index) {
  const bag = getSession().bag;
  if (bag.length === 0) return t("inventory.empty");
  return describeBagEntry(bag[bagCursorAfterRemoval(bag, index)]);
}

// Entrées de l'onglet SAC — un placeholder "Sac vide." (non activable) si
// vide, plutôt qu'un tableau réellement vide : lib/menu.js/makeMenuScreen
// suppose toujours AU MOINS une entrée courante (currentEntry() n'est jamais
// undefined ailleurs dans son code) ; un tableau vide y planterait dès
// onEnter. Une entrée plutôt qu'un refus d'ouvrir l'écran (voir
// view/menus/inventory-menu.js/openInventoryMenu) : un sac vide ne doit
// JAMAIS empêcher d'atteindre les
// autres onglets.
function buildBagEntries(getWorldView, getSession) {
  const bag = getSession().bag;
  // "inventory.empty.entry" (SANS point final), pas "inventory.empty" (avec
  // point, réservé aux annonces AUTONOMES — voir buildDropMessage) : cette
  // ligne n'est pas la fin de la phrase, lib/menu.js/actionLine lui ajoute
  // encore ". <position>" — même raison que stripTrailingPeriod plus haut,
  // pour éviter un double point ("vide.. 1 sur 1").
  if (bag.length === 0) return [{ label: "inventory.empty.entry", onActivate: () => {} }];
  return bag.map((entry, index) => bagEntryLine(getWorldView, getSession, entry, index));
}

// `cursor` optionnel : impose la position du curseur (voir
// bagCursorAfterRemoval, view/menus/inventory-menu.js/buildInventoryTabsScreen)
// plutôt que le défaut 0 de
// lib/menu.js/makeMenuScreen.
export function buildBagTabScreen(getWorldView, getSession, cursor) {
  const menu = { title: "inventory.title", closable: true, entries: buildBagEntries(getWorldView, getSession) };
  if (cursor !== undefined) menu.cursor = cursor;
  return makeMenuScreen(menu, t);
}

// Ligne d'UN slot d'équipement — occupé : "<Slot> : <objet> : <description>"
// (trois parties, description en fin — même logique que bagEntryLine :
// point final stripé avant interpolation, pour la même raison, voir
// stripTrailingPeriod), activer ouvre le menu d'actions (Déséquiper/
// Annuler) ; VIDE : "<Slot> : vide" (deux parties, pas de description),
// activer annonce juste "Emplacement vide." SANS ouvrir de menu (rien à y
// faire — voir le header de view/menus/inventory-menu.js, "entrée sur
// objet -> menu d'actions" ne
// s'applique qu'à un objet RÉEL).
function equipmentSlotEntry(getWorldView, getSession, slot) {
  const occupant = getSession().equipment[slot];
  const slotLabel = t(EQUIPMENT_SLOT_LABELS[slot]);

  if (!occupant) {
    return {
      label: "inventory.equipment.slot.empty",
      labelParams: { slot: slotLabel },
      onActivate: () => announce(t("inventory.equipment.slot.emptyAnnounce"), { assertive: true }),
    };
  }

  const itemLabelKey = ITEM_REGISTRY[occupant.type].label;
  const description = stripTrailingPeriod(t(ITEM_REGISTRY[occupant.type].descriptionKey));
  return {
    label: "inventory.equipment.slot.occupied",
    labelParams: { slot: slotLabel, item: t(itemLabelKey), description },
    onActivate: () => openEquipmentSlotActionsMenu(getWorldView, getSession, slot, itemLabelKey),
  };
}

export function buildEquipmentTabScreen(getWorldView, getSession) {
  const menu = {
    title: "inventory.equipment.title",
    closable: true,
    entries: EQUIPMENT_SLOTS.map((slot) => equipmentSlotEntry(getWorldView, getSession, slot)),
  };
  return makeMenuScreen(menu, t);
}

// Actions disponibles pour UNE entrée de sac — "Équiper" seulement si
// equippable (core/items.js/ITEM_REGISTRY), TOUJOURS "Poser". Extensibilité
// anti-drop RÉSERVÉE, PAS construite : un futur flag `droppable` sur
// ITEM_REGISTRY (défaut true) pourrait un jour retirer "Poser" de cette
// liste pour un objet donné (ex. un objet de quête vital) — non codé ici,
// aucun objet de ce genre n'existe encore ; documenté pour ne pas condamner
// ce slot par erreur plus tard.
function buildItemActions(getSession, entry, itemLabelKey, index) {
  const props = ITEM_REGISTRY[entry.type];
  const actions = [];
  if (props.equippable) {
    actions.push({ label: "inventory.actions.equip", onActivate: () => confirmEquip(getSession, entry, itemLabelKey, index) });
  }
  actions.push({
    label: "inventory.actions.drop",
    onActivate: () => confirmDrop(getSession, entry, itemLabelKey, index),
  });
  return actions;
}

// Entrée sur un objet -> TOUJOURS un menu d'actions, même à une seule action
// (prévisibilité : "entrée sur objet" ne bascule jamais entre "ouvre un
// menu" et "agit directement" selon le nombre d'actions disponibles) — SAUF
// si zéro action n'est disponible, auquel cas silence total, aucun menu ne
// s'ouvre (même politique que view/interaction.js : jamais un menu vide).
// Titre : le LABEL DE L'OBJET LUI-MÊME (itemLabelKey, déjà une clé i18n,
// voir bagEntryLine) réutilisé tel quel comme titre de menu ("Pomme. Poser.
// 1 sur 2") — pas de nouvelle clé i18n dédiée, menu.title n'étant qu'une clé
// passée telle quelle à t() par lib/menu.js.
function openItemActionsMenu(getWorldView, getSession, entry, itemLabelKey, index) {
  const actions = buildItemActions(getSession, entry, itemLabelKey, index);

  actions.push({ label: "inventory.actions.cancel", onActivate: () => popScreen() });

  const menu = { title: itemLabelKey, closable: true, entries: actions };
  pushScreen(withPausedBeacons(makeMenuScreen(menu, t), getWorldView));
}

// Menu d'actions d'UN SLOT d'équipement occupé (onglet Équipement) —
// Déséquiper + Annuler, même patron que openItemActionsMenu ci-dessus (un
// menu d'actions par objet, quel que soit l'onglet où il se trouve).
function openEquipmentSlotActionsMenu(getWorldView, getSession, slot, itemLabelKey) {
  const actions = [
    { label: "inventory.actions.unequip", onActivate: () => confirmUnequip(slot, itemLabelKey) },
    { label: "inventory.actions.cancel", onActivate: () => popScreen() },
  ];

  const menu = { title: itemLabelKey, closable: true, entries: actions };
  pushScreen(withPausedBeacons(makeMenuScreen(menu, t), getWorldView));
}

// "Équiper" choisi (onglet Sac) : effet immédiat, jamais de sélecteur (on
// équipe TOUJOURS un seul exemplaire — voir core/equipment.js/equipItem, un
// objet equippable n'est jamais empilable : équiper RETIRE donc TOUJOURS
// l'entrée entière du sac, jamais une simple décrémentation de quantité).
// Un seul niveau au-dessus des onglets à ce stade (le menu d'actions) — voir
// popCount d'executeAction. Réannonce + repositionnement du curseur après
// coup (RÈGLE GÉNÉRALE, voir bagRemovalAnnouncement/executeAction) : `index`
// = position de l'entrée équipée dans le sac AVANT l'effet.
function confirmEquip(getSession, entry, itemLabelKey, index) {
  executeAction(
    1,
    () => {
      if (!equipItemHandler) return false;
      equipItemHandler(entry.type);
    },
    () => `${t("inventory.equipped", { item: t(itemLabelKey) })} ${bagRemovalAnnouncement(getSession, index)}`,
    () => bagCursorAfterRemoval(getSession().bag, index)
  );
}

// "Déséquiper" choisi (onglet Équipement) : même patron, un seul niveau au-
// dessus des onglets (son propre menu d'actions).
function confirmUnequip(slot, itemLabelKey) {
  executeAction(
    1,
    () => {
      if (!unequipItemHandler) return false;
      unequipItemHandler(slot);
    },
    () => t("inventory.unequipped", { item: t(itemLabelKey) })
  );
}

// "Poser" choisi : objet UNIQUE (quantité 1, ou non empilable) -> agit
// DIRECTEMENT, aucun sélecteur (poser LA quantité disponible, toujours 1,
// donc TOUJOURS un retrait complet de l'entrée) ; stack > 1 -> ouvre le
// sélecteur de quantité (voir openQuantitySelector, qui peut ou non vider
// l'entrée selon la quantité choisie). `index` : position de l'entrée dans
// le sac AVANT l'effet, transmise pour la réannonce/repositionnement (voir
// bagRemovalAnnouncement/executeAction).
function confirmDrop(getSession, entry, itemLabelKey, index) {
  const available = entry.quantity ?? 1;
  if (available <= 1) {
    // Un seul niveau au-dessus des onglets à ce stade (le menu d'actions) —
    // voir popCount d'executeAction.
    executeAction(
      1,
      () => {
        if (!dropItemHandler) return false;
        dropItemHandler(entry.type, available);
      },
      () => buildDropMessage(getSession, entry, itemLabelKey, available, index),
      () => bagCursorAfterRemoval(getSession().bag, index)
    );
    return;
  }
  openQuantitySelector(getSession, entry, itemLabelKey, available, index);
}

// Message de résultat du dépôt — appelé APRÈS l'effet (voir executeAction) :
// getSession().bag reflète déjà l'état POST-dépôt. `quantity` posée
// couvrant TOUT le disponible AVANT l'effet (entry.quantity, snapshot
// jamais muté) -> retrait complet de l'entrée -> réannonce (RÈGLE GÉNÉRALE,
// voir bagRemovalAnnouncement) ; sinon (dépôt partiel d'un stack, l'entrée
// SURVIT au même index) -> message seul, rien à réannoncer.
function buildDropMessage(getSession, entry, itemLabelKey, quantity, index) {
  const item = t(itemLabelKey);
  const isStack = entry.quantity !== undefined;
  const dropMessage = isStack ? t("inventory.dropped.stack", { item, quantity }) : t("inventory.dropped", { item });
  const fullyRemoved = quantity >= (entry.quantity ?? 1);
  return fullyRemoved ? `${dropMessage} ${bagRemovalAnnouncement(getSession, index)}` : dropMessage;
}

// Sélecteur de QUANTITÉ à poser (stack > 1 uniquement) — écran CUSTOM,
// PAS un slider lib/menu.js. Deux raisons, toutes deux structurelles :
//   - le slider existant porte sa valeur via une PRÉFÉRENCE PERSISTÉE
//     (prefKey/menuGetPref/menuSetPref, config/preferences.js — localStorage
//     RÉEL) ; la quantité à poser est TRANSITOIRE, propre à CETTE seule
//     ouverture du sélecteur — la détourner vers une fausse préférence
//     écrirait sur disque une valeur qui ne doit jamais survivre à la
//     fermeture de cet écran ;
//   - le slider existant ne connaît qu'UN SEUL palier d'incrément (Ctrl ->
//     bigStep) ; ce sélecteur en veut TROIS (aucun, Maj, Ctrl — voir
//     QUANTITY_STEP_BY_ACTION).
// La mécanique de SLIDER de lib/menu.js reste donc inutilisée ici ; les
// touches du sélecteur passent, elles, par des bindings résolus comme
// partout (lib/input.js/resolveAction).
// Ctrl+Shift+flèche à la fois : mods exige une correspondance EXACTE (voir
// lib/input.js), donc AUCUNE action ne résout pour cette combinaison —
// jamais rencontré en pratique, accepté tel quel. L'imitation reste
// volontairement fidèle à l'esprit d'un slider pour une expérience
// cohérente : annonce de la SEULE valeur à chaque ajustement (comme
// lib/menu.js/adjustSlider), bornée [1, max], son "select" à la validation
// (lib/menu.js le joue automatiquement pour une entrée "action" via
// activateOrReannounce — ici on le déclenche nous-mêmes, cet écran ne passant
// jamais par ce mécanisme). Ne pause/reprend PAS les balises lui-même : le
// menu d'actions juste en-dessous, encore sur la pile, l'a déjà fait à son
// ouverture et ne s'en dépossède qu'à SA propre sortie.
function openQuantitySelector(getSession, entry, itemLabelKey, max, index) {
  let quantity = 1;

  function clampQuantity(value) {
    return Math.min(Math.max(value, 1), max);
  }

  function adjust(delta) {
    quantity = clampQuantity(quantity + delta);
    // Valeur SEULE, jamais le label : retour immédiat à un ajustement,
    // le contexte complet ayant déjà été entendu à l'ouverture.
    announce(String(quantity), { assertive: true });
  }

  const screen = {
    onKeyDown(event) {
      const action = resolveAction(QUANTITY_BINDINGS, event.key, event.mods);

      if (action in QUANTITY_STEP_BY_ACTION) {
        event.preventDefault();
        adjust(QUANTITY_STEP_BY_ACTION[action]);
      } else if (action === "confirm") {
        event.preventDefault();
        playMenuSound("select");
        // Deux niveaux au-dessus des onglets à ce stade (sélecteur, menu
        // d'actions) — voir popCount d'executeAction.
        executeAction(
          2,
          () => {
            if (!dropItemHandler) return false;
            dropItemHandler(entry.type, quantity);
          },
          () => buildDropMessage(getSession, entry, itemLabelKey, quantity, index),
          () => bagCursorAfterRemoval(getSession().bag, index)
        );
      } else if (action === "cancel") {
        event.preventDefault();
        popScreen();
      }
    },
  };

  screen.onEnter = () => {
    announce(t("inventory.quantity.announce", { item: t(itemLabelKey), quantity, max }), { assertive: true });
  };

  pushScreen(screen);
}

// Point COMMUN à toute action réussie du menu d'inventaire (Poser/Équiper/
// Déséquiper) — DEUX callbacks, dans un ordre STRICT et pour deux raisons
// distinctes :
//   1. `applyEffect()` D'ABORD, AVANT tout popScreen() : l'écran des onglets
//      va se reconstruire (rebuildInner, voir
//      view/menus/inventory-menu.js/buildInventoryTabsScreen) dès
//      qu'il est révélé par le DERNIER popScreen() ci-dessous — s'il lisait
//      la session AVANT l'effet, il montrerait un contenu PÉRIMÉ (ex.
//      l'objet fraîchement équipé pas encore retiré du sac affiché). Renvoie
//      `false` -> aucun gestionnaire enregistré (cas limite, jamais en jeu
//      réel) : on abandonne silencieusement, ni popScreen ni annonce.
//   2. `buildMessage()` ENSUITE, APRÈS tous les popScreen() (`popCount` — 1
//      depuis un menu d'actions, 2 depuis le sélecteur de quantité) : ces
//      popScreen() révèlent des écrans encore valides qui se réannoncent
//      normalement au passage (dont l'écran des onglets lui-même — marqué
//      SILENCIEUX juste avant, voir returnSilently) — bruit assertive
//      parasite mais SANS CONSÉQUENCE, écrasé par la présente annonce tant
//      qu'elle reste la DERNIÈRE écriture, strictement après cette boucle
//      (même raisonnement que lib/menu.js/makeMessageScreen). `buildMessage`
//      reçoit donc la session DÉJÀ à jour (l'effet a déjà couru) si elle a
//      besoin de l'inspecter (voir buildDropMessage, bagRemovalAnnouncement).
//   `cursorAfter` optionnel : () => index à imposer au curseur du sac au
//      prochain rebuild (voir bagCursorAfterRemoval) — RÈGLE GÉNÉRALE pour
//      toute action qui retire une entrée d'une liste (équiper, poser),
//      omis pour une action qui n'en retire aucune (ex. Déséquiper).
function executeAction(popCount, applyEffect, buildMessage, cursorAfter) {
  if (applyEffect() === false) return;

  if (currentTabsScreen) currentTabsScreen.returnSilently(cursorAfter ? cursorAfter() : undefined);
  for (let i = 0; i < popCount; i++) popScreen();

  announce(buildMessage(), { assertive: true });
}
