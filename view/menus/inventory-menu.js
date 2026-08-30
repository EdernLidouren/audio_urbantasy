// Écran d'INVENTAIRE à DEUX ONGLETS — Sac ("i") et Équipement ("q"), voir
// view/city-screen.js. UN SEUL écran RÉEL sur la pile (lib/screens.js) : il
// délègue à un écran-menu INTERNE (lib/menu.js/makeMenuScreen), reconstruit
// pour l'onglet actif à CHAQUE affichage/bascule — jamais un écran séparé
// par onglet. Tab / Maj+Tab basculent ENTRE les deux (TAB_BINDINGS, résolues
// via lib/input.js/resolveAction, comme le reste de ce fichier).
//
// menu.title de chaque onglet EST DÉJÀ son propre nom ("Sac"/"Équipement") —
// rappeler l'onEnter de l'écran-menu interne à la bascule annonce donc
// NATURELLEMENT "<Nom de l'onglet>. <contenu>" (lib/menu.js/
// buildOpenAnnouncement) : exactement l'exigence d'accessibilité demandée
// (le nom de l'onglet AVANT son contenu), sans code d'annonce dédié.
//
// Navigation en PROFONDEUR, depuis CHAQUE onglet : LISTE -> MENU D'ACTIONS
// (TOUJOURS un menu, même à une seule action, jamais une activation directe
// imprévisible) -> SÉLECTEUR DE QUANTITÉ (uniquement "Poser" un stack > 1,
// onglet Sac). Échap/Annuler à un niveau retire SON écran et révèle celui du
// dessous, qui se réannonce (comportement natif de lib/screens.js/
// popScreen) — voir le commentaire d'executeAction plus bas pour la SEULE
// exception (retour après une action réussie : Poser/Équiper/Déséquiper,
// qui saute directement à l'écran des onglets plutôt que de remonter
// niveau par niveau, et sans réannoncer par-dessus le résultat déjà dit).

import { t } from "../../i18n/index.js";
import { pushScreen, popScreen, composeHook } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { announce } from "../../lib/announce.js";
import { playMenuSound } from "../menu-sounds.js";
import { ITEM_REGISTRY } from "../../core/items.js";
import { EQUIPMENT_SLOTS } from "../../core/equipment.js";
import { resolveAction, checkBindingsForCollisions } from "../../lib/input.js";

// Bindings du sélecteur de quantité (voir openQuantitySelector plus bas) —
// aucun -> ±1, Shift -> ±10, Ctrl -> ±100 (convention établie), chacun une
// action DISTINCTE (mods exige une correspondance EXACTE, voir
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
checkBindingsForCollisions(QUANTITY_BINDINGS, "view/menus/inventory-menu.js QUANTITY_BINDINGS");

// Amplitude signée de chaque action d'ajustement — un seul endroit à lire
// pour connaître le pas d'une action donnée, jamais dupliqué dans
// openQuantitySelector.
const QUANTITY_STEP_BY_ACTION = {
  decrease: -1,
  decreaseBig: -10,
  decreaseBigger: -100,
  increase: 1,
  increaseBig: 10,
  increaseBigger: 100,
};

// Bascule d'onglet — GÉNÉRIQUE (aucune connaissance de Sac/Équipement dans
// les noms d'action eux-mêmes, comme MENU_BINDINGS de lib/menu.js) : Tab et
// Maj+Tab font la MÊME chose avec seulement deux onglets (voir otherTab),
// mais restent deux actions distinctes pour rester correct le jour où un
// troisième onglet s'ajouterait (cycle réel avant/arrière plutôt qu'un
// simple basculement).
const TAB_BINDINGS = {
  nextTab: { keys: ["Tab"], mods: [] },
  prevTab: { keys: ["Tab"], mods: ["shift"] },
};
checkBindingsForCollisions(TAB_BINDINGS, "view/menus/inventory-menu.js TAB_BINDINGS");

function otherTab(tab) {
  return tab === "bag" ? "equipment" : "bag";
}

// Noms d'affichage des slots d'équipement (core/equipment.js/EQUIPMENT_SLOTS)
// — DONNÉE DE VUE (clé i18n par slot), jamais dérivée du core : un nom de
// slot est un choix de contenu/présentation, pas une propriété structurelle.
// Ajouter un slot (torse, tête...) demande une entrée ici EN PLUS de
// EQUIPMENT_SLOTS côté core — non fait automatiquement, documenté pour ne
// pas oublier.
const EQUIPMENT_SLOT_LABELS = { feet: "equipment.slot.feet" };

// (type, count) => void — applique l'effet d'ÉTAT du "Poser" (retrait du
// sac + apparition au sol, voir core/bag.js/dropItem), fourni par
// city-screen.js qui seul détient getSession/setSession — même principe
// d'injection que view/interaction.js/setPickupHandler (ce module ne
// connaît jamais le core).
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

// La SEULE instance d'écran d'onglets ouverte à la fois (comme activeScene,
// voir view/audio/city-scene.js) : permet aux effets (Poser/Équiper/
// Déséquiper, potentiellement enfouis sous un menu d'actions ET un
// sélecteur de quantité) de revenir SILENCIEUSEMENT à l'onglet À JOUR après
// une action réussie, sans threader une référence à travers chaque niveau
// d'appel (bagEntryLine -> openItemActionsMenu -> confirmX -> executeX).
let currentTabsScreen = null;

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
// ("croquante..") à chaque affichage avec le suffixe de position actif.
function stripTrailingPeriod(text) {
  return text.endsWith(".") ? text.slice(0, -1) : text;
}

function bagEntryLine(scene, getSession, entry) {
  const itemLabelKey = ITEM_REGISTRY[entry.type].label;
  const description = stripTrailingPeriod(t(ITEM_REGISTRY[entry.type].descriptionKey));
  const item = t(itemLabelKey);

  const text =
    entry.quantity !== undefined
      ? { label: "inventory.entry.stack", labelParams: { item, quantity: entry.quantity, description } }
      : { label: "inventory.entry.unique", labelParams: { item, description } };

  return {
    ...text,
    onActivate: () => openItemActionsMenu(scene, getSession, entry, itemLabelKey),
  };
}

// Entrées de l'onglet SAC — un placeholder "Sac vide." (non activable) si
// vide, plutôt qu'un tableau réellement vide : lib/menu.js/makeMenuScreen
// suppose toujours AU MOINS une entrée courante (currentEntry() n'est jamais
// undefined ailleurs dans son code) ; un tableau vide y planterait dès
// onEnter. Même ligne que l'ancienne annonce "Sac vide.", juste portée par
// une entrée plutôt qu'un refus d'ouvrir l'écran (voir openInventoryMenu :
// contrairement à avant les onglets, un sac vide ne doit plus JAMAIS
// empêcher d'atteindre l'onglet Équipement).
function buildBagEntries(scene, getSession) {
  const bag = getSession().bag;
  // "inventory.empty.entry" (SANS point final), pas "inventory.empty" (avec
  // point, réservé aux annonces AUTONOMES — voir buildDropMessage) : cette
  // ligne n'est pas la fin de la phrase, lib/menu.js/actionLine lui ajoute
  // encore ". <position>" — même raison que stripTrailingPeriod plus haut,
  // pour éviter un double point ("vide.. 1 sur 1").
  if (bag.length === 0) return [{ label: "inventory.empty.entry", onActivate: () => {} }];
  return bag.map((entry) => bagEntryLine(scene, getSession, entry));
}

function buildBagTabScreen(scene, getSession) {
  const menu = { title: "inventory.title", closable: true, entries: buildBagEntries(scene, getSession) };
  return makeMenuScreen(menu, t);
}

// Ligne d'UN slot d'équipement — occupé : "<Slot> : <objet>", activer ouvre
// le menu d'actions (Déséquiper/Annuler) ; VIDE : "<Slot> : vide", activer
// annonce juste "Emplacement vide." SANS ouvrir de menu (rien à y faire —
// voir header du module, "entrée sur objet -> menu d'actions" ne s'applique
// qu'à un objet RÉEL).
function equipmentSlotEntry(scene, getSession, slot) {
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
  return {
    label: "inventory.equipment.slot.occupied",
    labelParams: { slot: slotLabel, item: t(itemLabelKey) },
    onActivate: () => openEquipmentSlotActionsMenu(scene, getSession, slot, itemLabelKey),
  };
}

function buildEquipmentTabScreen(scene, getSession) {
  const menu = {
    title: "inventory.equipment.title",
    closable: true,
    entries: EQUIPMENT_SLOTS.map((slot) => equipmentSlotEntry(scene, getSession, slot)),
  };
  return makeMenuScreen(menu, t);
}

function buildTabScreen(tab, scene, getSession) {
  return tab === "equipment" ? buildEquipmentTabScreen(scene, getSession) : buildBagTabScreen(scene, getSession);
}

// L'écran RÉEL (voir header) : reconstruit son écran-menu interne (`inner`)
// à CHAQUE onEnter (première ouverture, bascule d'onglet, OU reveal après
// la fermeture d'un sous-menu — les trois passent par ici) — jamais de
// contenu mis en cache d'un affichage à l'autre, comme le reste de ce
// fichier (voir buildBagEntries). scene.pauseBeacons()/resumeBeacons()
// appelés à CHAQUE onEnter/onExit (y compris un reveal redondant) — sans
// conséquence, même tolérance que le reste de la pile de menus ici (voir
// openItemActionsMenu plus bas).
function buildInventoryTabsScreen(scene, getSession, initialTab) {
  let activeTab = initialTab;
  let inner = null;
  // Consommé UNE FOIS par le prochain onEnter (voir returnSilently) : un
  // retour après une action réussie (Poser/Équiper/Déséquiper) a DÉJÀ
  // annoncé son résultat — une seconde écriture assertive coup sur coup
  // l'écraserait avant que l'utilisateur ait pu l'entendre (même
  // raisonnement que lib/menu.js/makeMessageScreen).
  let silent = false;

  function rebuildInner() {
    inner = buildTabScreen(activeTab, scene, getSession);
  }

  return {
    onEnter() {
      rebuildInner();
      if (silent) {
        silent = false;
      } else {
        inner.onEnter();
      }
      scene.pauseBeacons();
    },
    onExit() {
      if (inner.onExit) inner.onExit();
      scene.resumeBeacons();
      currentTabsScreen = null;
    },
    onTick() {
      if (inner.onTick) inner.onTick();
    },
    onKeyDown(event) {
      const action = resolveAction(TAB_BINDINGS, event.key, event.mods);
      if (action === "nextTab" || action === "prevTab") {
        // Comportement navigateur de Tab déjà neutralisé en amont, voir
        // lib/input.js/ALWAYS_NEUTRALIZED_BINDINGS — rien à prévenir ici.
        activeTab = otherTab(activeTab);
        rebuildInner();
        inner.onEnter(); // annonce "<Nom de l'onglet>. <contenu>" — voir header.
        return;
      }
      inner.onKeyDown(event);
    },
    // Voir la doc de `silent` ci-dessus — appelé par executeAction juste
    // avant de remonter jusqu'ici.
    returnSilently() {
      silent = true;
    },
  };
}

function openInventoryTabs(scene, getSession, initialTab) {
  currentTabsScreen = buildInventoryTabsScreen(scene, getSession, initialTab);
  pushScreen(currentTabsScreen);
}

// "i" — voir view/city-screen.js.
export function openInventoryMenu(scene, getSession) {
  openInventoryTabs(scene, getSession, "bag");
}

// "q" — voir view/city-screen.js.
export function openEquipmentMenu(scene, getSession) {
  openInventoryTabs(scene, getSession, "equipment");
}

// Actions disponibles pour UNE entrée de sac — "Équiper" seulement si
// equippable (core/items.js/ITEM_REGISTRY), TOUJOURS "Poser". Extensibilité
// anti-drop RÉSERVÉE, PAS construite : un futur flag `droppable` sur
// ITEM_REGISTRY (défaut true) pourrait un jour retirer "Poser" de cette
// liste pour un objet donné (ex. un objet de quête vital) — non codé ici,
// aucun objet de ce genre n'existe encore ; documenté pour ne pas condamner
// ce slot par erreur plus tard.
function buildItemActions(scene, getSession, entry, itemLabelKey) {
  const props = ITEM_REGISTRY[entry.type];
  const actions = [];
  if (props.equippable) {
    actions.push({ label: "inventory.actions.equip", onActivate: () => confirmEquip(entry, itemLabelKey) });
  }
  actions.push({ label: "inventory.actions.drop", onActivate: () => confirmDrop(scene, getSession, entry, itemLabelKey) });
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
function openItemActionsMenu(scene, getSession, entry, itemLabelKey) {
  const actions = buildItemActions(scene, getSession, entry, itemLabelKey);
  if (actions.length === 0) return;

  actions.push({ label: "inventory.actions.cancel", onActivate: () => popScreen() });

  const menu = { title: itemLabelKey, closable: true, entries: actions };
  const screen = makeMenuScreen(menu, t);
  screen.onEnter = composeHook(screen.onEnter, () => scene.pauseBeacons());
  screen.onExit = composeHook(screen.onExit, () => scene.resumeBeacons());
  pushScreen(screen);
}

// Menu d'actions d'UN SLOT d'équipement occupé (onglet Équipement) —
// Déséquiper + Annuler, même patron que openItemActionsMenu ci-dessus (un
// menu d'actions par objet, quel que soit l'onglet où il se trouve).
function openEquipmentSlotActionsMenu(scene, getSession, slot, itemLabelKey) {
  const actions = [
    { label: "inventory.actions.unequip", onActivate: () => confirmUnequip(slot, itemLabelKey) },
    { label: "inventory.actions.cancel", onActivate: () => popScreen() },
  ];

  const menu = { title: itemLabelKey, closable: true, entries: actions };
  const screen = makeMenuScreen(menu, t);
  screen.onEnter = composeHook(screen.onEnter, () => scene.pauseBeacons());
  screen.onExit = composeHook(screen.onExit, () => scene.resumeBeacons());
  pushScreen(screen);
}

// "Équiper" choisi (onglet Sac) : effet immédiat, jamais de sélecteur (on
// équipe TOUJOURS un seul exemplaire — voir core/equipment.js/equipItem).
// Un seul niveau au-dessus des onglets à ce stade (le menu d'actions) — voir
// popCount d'executeAction.
function confirmEquip(entry, itemLabelKey) {
  executeAction(
    1,
    () => {
      if (!equipItemHandler) return false;
      equipItemHandler(entry.type);
    },
    () => t("inventory.equipped", { item: t(itemLabelKey) })
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
// DIRECTEMENT, aucun sélecteur (poser LA quantité disponible, toujours 1) ;
// stack > 1 -> ouvre le sélecteur de quantité (voir openQuantitySelector).
function confirmDrop(scene, getSession, entry, itemLabelKey) {
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
      () => buildDropMessage(getSession, entry, itemLabelKey, available)
    );
    return;
  }
  openQuantitySelector(scene, getSession, entry, itemLabelKey, available);
}

// Message de résultat du dépôt — appelé APRÈS l'effet (voir executeAction) :
// getSession().bag reflète déjà l'état POST-dépôt, donc bagNowEmpty est
// fiable.
function buildDropMessage(getSession, entry, itemLabelKey, quantity) {
  const item = t(itemLabelKey);
  const isStack = entry.quantity !== undefined;
  const dropMessage = isStack ? t("inventory.dropped.stack", { item, quantity }) : t("inventory.dropped", { item });
  const bagNowEmpty = getSession().bag.length === 0;
  return bagNowEmpty ? `${dropMessage} ${t("inventory.empty")}` : dropMessage;
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
//     bigStep) ; ce sélecteur en veut TROIS (aucun -> ±1, Shift -> ±10,
//     Ctrl -> ±100).
// La mécanique de SLIDER de lib/menu.js reste donc inutilisée ici (ces deux
// raisons tiennent indépendamment de la refonte du moteur d'entrée — voir
// lib/input.js — qui a, elle, migré ce fichier vers des bindings résolus).
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
function openQuantitySelector(scene, getSession, entry, itemLabelKey, max) {
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
          () => buildDropMessage(getSession, entry, itemLabelKey, quantity)
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
//      va se reconstruire (rebuildInner, voir buildInventoryTabsScreen) dès
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
//      besoin de l'inspecter (voir buildDropMessage, bagNowEmpty).
function executeAction(popCount, applyEffect, buildMessage) {
  if (applyEffect() === false) return;

  if (currentTabsScreen) currentTabsScreen.returnSilently();
  for (let i = 0; i < popCount; i++) popScreen();

  announce(buildMessage(), { assertive: true });
}
