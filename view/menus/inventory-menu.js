// Menu du SAC (touche "i", voir view/city-screen.js) — écran-menu STANDARD
// (pile d'écrans, met le jeu en pause comme tout menu, voir CLAUDE.md),
// entries construites DYNAMIQUEMENT depuis session.bag — même patron que le
// menu de désambiguïsation (view/interaction.js), pas un menu littéral fixe
// comme pause-menu.js/options-menu.js.
//
// Navigation à TROIS niveaux, chacun un écran de la pile (lib/screens.js) :
// LISTE (une ligne par entrée de sac) -> MENU D'ACTIONS (Poser, Annuler —
// TOUJOURS un menu, même à une seule action, jamais une activation directe
// imprévisible) -> SÉLECTEUR DE QUANTITÉ (uniquement pour un stack > 1).
// Échap/Annuler à un niveau retire SON écran et révèle celui du dessous,
// qui se réannonce (comportement natif de lib/screens.js/popScreen) — voir
// le commentaire d'executeDrop plus bas pour la SEULE exception (retour
// après un dépôt réussi, qui saute directement au sommet plutôt que de
// remonter niveau par niveau).

import { t } from "../../i18n/index.js";
import { pushScreen, popScreen, composeHook } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { announce } from "../../lib/announce.js";
import { playMenuSound } from "../menu-sounds.js";
import { ITEM_REGISTRY } from "../../core/items.js";
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

// (type, count) => void — applique l'effet d'ÉTAT du "Poser" (retrait du
// sac + apparition au sol, voir core/bag.js/dropItem), fourni par
// city-screen.js qui seul détient getSession/setSession — même principe
// d'injection que view/interaction.js/setPickupHandler (ce module ne
// connaît jamais le core).
let dropItemHandler = null;

export function setDropItemHandler(handler) {
  dropItemHandler = handler;
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

// Construit l'écran-liste depuis le sac COURANT — factorisé car utilisé à
// DEUX moments : l'ouverture normale ("i", openInventoryMenu) et la
// réouverture silencieuse après un dépôt réussi (voir executeDrop) : même
// contenu, seule l'annonce d'ouverture diffère entre les deux appelants.
function buildInventoryListScreen(scene, getSession) {
  const bag = getSession().bag;
  const menu = {
    title: "inventory.title",
    closable: true,
    entries: bag.map((entry) => bagEntryLine(scene, getSession, entry)),
  };
  return makeMenuScreen(menu, t);
}

// scene : pause/reprise sélective des balises pendant que ce menu est
// ouvert — même patron que le menu de désambiguïsation/le menu pause.
// getSession : relu à CHAQUE reconstruction de liste (voir buildInventoryListScreen)
// — contrairement à avant l'introduction de "Poser", le contenu du sac peut
// désormais changer PENDANT que ce menu reste ouvert (un dépôt le modifie).
export function openInventoryMenu(scene, getSession) {
  if (getSession().bag.length === 0) {
    announce(t("inventory.empty"), { assertive: true });
    return;
  }

  const screen = buildInventoryListScreen(scene, getSession);
  screen.onEnter = composeHook(screen.onEnter, () => scene.pauseBeacons());
  screen.onExit = composeHook(screen.onExit, () => scene.resumeBeacons());
  pushScreen(screen);
}

// Variante SILENCIEUSE de openInventoryMenu — utilisée UNIQUEMENT par
// executeDrop ci-dessous pour revenir à la liste À JOUR juste après un
// dépôt réussi : l'annonce d'ouverture normale de lib/menu.js est ici
// remplacée par rien du tout, parce que executeDrop vient DÉJÀ d'annoncer
// "Posé : ..." — une seconde écriture assertive coup sur coup, sans délai,
// ÉCRASERAIT la première avant que l'utilisateur ait pu l'entendre (même
// raisonnement que lib/menu.js/makeMessageScreen, voir son commentaire).
// Toute réouverture ULTÉRIEURE de l'inventaire (ressortir puis rappuyer sur
// "i") repasse par openInventoryMenu normalement, avec son annonce
// habituelle — cette variante ne sert qu'à CE retour immédiat précis.
function reopenInventoryListSilently(scene, getSession) {
  const screen = buildInventoryListScreen(scene, getSession);
  screen.onEnter = () => scene.pauseBeacons();
  screen.onExit = composeHook(screen.onExit, () => scene.resumeBeacons());
  pushScreen(screen);
}

// Actions disponibles pour UNE entrée de sac — aujourd'hui une seule :
// "Poser". "Équiper"/"Utiliser" s'ajouteront ici plus tard, dans CE MÊME
// menu (une entrée de plus dans ce tableau, jamais une refonte de
// openItemActionsMenu). Extensibilité anti-drop RÉSERVÉE, PAS construite :
// un futur flag `droppable` sur core/items.js/ITEM_REGISTRY (défaut true)
// pourrait un jour retirer "Poser" de cette liste pour un objet donné (ex.
// un objet de quête vital) — non codé ici, aucun objet de ce genre n'existe
// encore ; documenté pour ne pas condamner ce slot par erreur plus tard.
function buildItemActions(scene, getSession, entry, itemLabelKey) {
  return [
    {
      label: "inventory.actions.drop",
      onActivate: () => confirmDrop(scene, getSession, entry, itemLabelKey),
    },
  ];
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

// "Poser" choisi : objet UNIQUE (quantité 1, ou non empilable) -> agit
// DIRECTEMENT, aucun sélecteur (poser LA quantité disponible, toujours 1) ;
// stack > 1 -> ouvre le sélecteur de quantité (voir openQuantitySelector).
function confirmDrop(scene, getSession, entry, itemLabelKey) {
  const available = entry.quantity ?? 1;
  if (available <= 1) {
    // Une seule action-menu au-dessus de la liste à ce stade (voir
    // openItemActionsMenu) : deux niveaux à quitter pour revenir à la
    // liste — voir le paramètre popCount d'executeDrop.
    executeDrop(scene, getSession, entry, itemLabelKey, available, 2);
    return;
  }
  openQuantitySelector(scene, getSession, entry, itemLabelKey, available);
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
        // Trois niveaux au-dessus de la liste à ce stade (sélecteur,
        // menu d'actions) plus la liste elle-même — voir popCount
        // d'executeDrop.
        executeDrop(scene, getSession, entry, itemLabelKey, quantity, 3);
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

// Applique l'effet d'ÉTAT (retrait du sac + apparition au sol, voir
// dropItemHandler), PUIS remonte directement au sommet de la pile
// d'inventaire (`popCount` appels à popScreen — 2 depuis le menu d'actions,
// 3 depuis le sélecteur de quantité), et enfin annonce le résultat +
// rouvre une liste FRAÎCHE (ou "Sac vide" si c'était le dernier objet).
//
// Les popScreen() intermédiaires révèlent chacun un écran encore VALIDE
// (menu d'actions, PUIS liste ENCORE STALE) qui se réannonce normalement à
// son tour — du bruit assertive parasite, mais SANS CONSÉQUENCE : ces
// écritures sont toutes écrasées, synchrone après synchrone, avant que le
// message FINAL (construit ci-dessous) ne soit lui-même écrit — la dernière
// écriture assertive avant que le lecteur d'écran n'ait eu l'occasion de la
// lire est celle qui compte (même raisonnement que lib/menu.js/
// makeMessageScreen). Aucune temporisation nécessaire : tout ceci s'exécute
// de façon strictement synchrone, dans le même tour de boucle JS.
function executeDrop(scene, getSession, entry, itemLabelKey, quantity, popCount) {
  if (!dropItemHandler) return; // aucun gestionnaire enregistré (cas limite, jamais en jeu réel)

  dropItemHandler(entry.type, quantity);

  for (let i = 0; i < popCount; i++) popScreen();

  const item = t(itemLabelKey);
  const isStack = entry.quantity !== undefined;
  const dropMessage = isStack
    ? t("inventory.dropped.stack", { item, quantity })
    : t("inventory.dropped", { item });

  const bagNowEmpty = getSession().bag.length === 0;
  announce(bagNowEmpty ? `${dropMessage} ${t("inventory.empty")}` : dropMessage, { assertive: true });

  if (!bagNowEmpty) reopenInventoryListSilently(scene, getSession);
}
