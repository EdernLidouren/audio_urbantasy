// JEU DES BILLES — l'ÉDITEUR D'UN SAC du joueur, ouvert depuis « Mes sacs »
// (marbles/view/my-bags.js). Il travaille sur une COPIE DE TRAVAIL : rien n'est
// enregistré avant que le joueur le demande, en quittant (Échap, « Enregistrer »).
// Les opérations et leurs refus sont pures (marbles/core/bag-editing.js), les règles
// sont celles de la validation existante ; ce qui se dit : marbles/view/narration/bags.js.
//
// DEUX ZONES, la navigation de l'écran de jeu :
//   le SAC, en haut : une entrée par bille distincte du sac (« rubis, 2 sur 2
//     maximum »), « Sac vide » sinon ;
//   la COLLECTION, en bas : les billes débloquées, filtrées par famille (G) et par
//     rareté (Maj+G) (« rubis, normale, Trésor, rare. Dans le sac : 2 sur 2 »).
// Les deux dans le même ordre stable : famille, rareté, nom (sortedMarbles). Haut et
// bas changent de zone (son nom s'annonce, avec un point final) ; gauche et droite
// parcourent la zone, avec le cyclage des menus ; Origine et Fin vont aux bornes ;
// Ctrl+haut et Ctrl+bas parcourent la fiche de la bille (marbles/view/card.js) ; V, F,
// E et Maj+E disent sa description, son identité, ses mots-clés.
//
// GESTES : Entrée ajoute un exemplaire de la bille sous le curseur (dans les deux
// zones), Suppr en retire un ; une entrée du sac qui tombe à 0 disparaît, et le
// curseur passe à sa voisine. R dit le résumé du sac (taille, validité, répartition),
// Maj+R ouvre le menu de ses problèmes. Échap quitte : directement si la copie de
// travail a la même composition que le sac enregistré, sinon par le menu
// « Enregistrer les modifications ? » (Enregistrer, Quitter sans enregistrer,
// Continuer). H et F1 : l'aide des touches.
//
// `io` (comme l'écran de jeu) : { announce, announceMenuLine, t, sounds } remplacent
// le monde extérieur sous Node (marbles/checks/fixtures/screen-bench.js) ; `sounds` :
// { menu(name), bag(name), beacon(marble), stopBeacon() }.

import { announce as realAnnounce } from "../../lib/announce.js";
import { popScreen, pushScreen } from "../../lib/screens.js";
import { defineBindings, resolveAction } from "../../lib/input.js";
import { announceMenuLine as realAnnounceMenuLine, jumpMenuCursor, makeMenuScreen, stepMenuCursor } from "../../lib/menu.js";
import { detailAfterMainMove, detailLine, mainWithDetail, stepDetail } from "../../lib/detail-card.js";
import { t as realT } from "../../data/i18n/index.js";
import { MARBLES_SETTINGS, MARBLE_FAMILIES, MARBLE_RARITIES } from "../config/values.js";
import { addMarble, bagStatus, copiesOf, removeMarble, sameComposition } from "../core/bag-editing.js";
import { playMenuSound } from "../../view/menu-sounds.js";
import { playBagSound } from "./bag-sounds.js";
import { playFocusBeacon, stopFocusBeacon } from "./sounds.js";
import { marbleCard } from "./card.js";
import { withPosition } from "./card-menu.js";
import { descriptionText, identityText } from "./marble-info.js";
import { keywordsText, openKeywordsMenu } from "./keywords.js";
import {
  addedText,
  bagEditRefusal,
  bagEntryLine,
  bagHeadText,
  bagName,
  bagSummaryText,
  collectionLine,
  describeBagProblem,
  filterText,
  removedText,
  sortedMarbles,
} from "./narration/bags.js";

const BAG_EDITOR_BINDINGS = defineBindings("marblesBagEditor", {
  up: { keys: ["ArrowUp"], mods: [] },
  down: { keys: ["ArrowDown"], mods: [] },
  left: { keys: ["ArrowLeft"], mods: [] },
  right: { keys: ["ArrowRight"], mods: [] },
  home: { keys: ["Home"], mods: [] },
  end: { keys: ["End"], mods: [] },
  detailUp: { keys: ["ArrowUp"], mods: ["ctrl"] },
  detailDown: { keys: ["ArrowDown"], mods: ["ctrl"] },
  add: { keys: ["Enter", " "], mods: [] },
  remove: { keys: ["Delete"], mods: [] },
  reannounce: { keys: ["Backspace"], mods: [] },
  summary: { keys: ["r"], mods: [] },
  problems: { keys: ["r"], mods: ["shift"] },
  familyFilter: { keys: ["g"], mods: [] },
  rarityFilter: { keys: ["g"], mods: ["shift"] },
  description: { keys: ["v"], mods: [] },
  identity: { keys: ["f"], mods: [] },
  keywords: { keys: ["e"], mods: [] },
  keywordsMenu: { keys: ["e"], mods: ["shift"] },
  help: { keys: ["h"], mods: [] },
  back: { keys: ["Escape"], mods: [] },
});

const REAL_IO = {
  announce: realAnnounce,
  announceMenuLine: realAnnounceMenuLine,
  t: realT,
  sounds: {
    menu: playMenuSound,
    bag: playBagSound,
    beacon: (marble, types) => playFocusBeacon(marble, undefined, types),
    stopBeacon: stopFocusBeacon,
  },
};

// Le filtre suivant d'une liste (null : tous, puis chaque valeur, puis tous).
function nextFilter(current, values) {
  const index = current === null ? -1 : values.indexOf(current);
  return index + 1 < values.length ? values[index + 1] : null;
}

// L'écran. `spec` :
//   bag         le sac enregistré (ses données ne sont jamais modifiées) ;
//   rules       les règles du jeu des billes (marbles/core/rules.js) : le catalogue, les
//               fiches, les mots-clés ;
//   buildRules  les règles de construction qui s'appliquent (celles par défaut) ;
//   unlocked    les ids des billes débloquées (la collection, par son fournisseur) ;
//   onSave(bag) enregistre la copie de travail (l'écran « Mes sacs ») ;
//   notice      (facultatif) une phrase dite avant la première annonce d'ouverture
//               (« Sac 3 créé. ») ;
//   openKeyHelp(screen)  l'aide des touches (main.js, avec les touches globales).
export function makeBagEditorScreen({ bag, rules, buildRules, unlocked, onSave, notice = null, openKeyHelp = () => {}, io = {} }) {
  const { announce, announceMenuLine, t } = { ...REAL_IO, ...io };
  const sounds = { ...REAL_IO.sounds, ...io.sounds };
  const types = rules.types;
  const context = { types, rules: buildRules, unlocked };
  const saved = structuredClone(bag);
  let working = structuredClone(bag);
  let zone = working.marbles.length > 0 ? "bag" : "collection";
  const cursor = { bag: 0, collection: 0 };
  let detail = 0;
  let family = null;
  let rarity = null;
  // Vrai pendant que l'éditeur se referme (après le menu d'enregistrement) : il ne se
  // réannonce pas en reparaissant un instant.
  let leaving = false;
  let pendingNotice = notice;

  const status = () => bagStatus(working, context);
  const knownUnlocked = sortedMarbles(
    unlocked.filter((id) => Object.hasOwn(types, id)),
    types,
    t
  );

  // Les billes d'une zone, dans leur ordre.
  function items(which = zone) {
    if (which === "bag") return sortedMarbles(working.marbles.map((entry) => entry.marble), types, t);
    return knownUnlocked.filter((id) => (family === null || types[id].families.includes(family)) && (rarity === null || types[id].rarity === rarity));
  }

  // L'indice du curseur dans sa zone, ramené dans ses bornes.
  function index() {
    const total = items().length;
    cursor[zone] = Math.max(0, Math.min(cursor[zone], total - 1));
    return cursor[zone];
  }

  const currentMarble = () => items()[index()];
  const isKnown = (marble) => marble !== undefined && Object.hasOwn(types, marble);

  // La ligne de l'entrée courante, position comprise ; la zone vide le dit.
  function mainLine() {
    const list = items();
    if (list.length === 0) return t(zone === "bag" ? "marbles.bagEditor.bag_empty" : "marbles.bagEditor.collection_empty");
    const marble = list[index()];
    const line = zone === "bag" ? bagEntryLine({ marble, count: copiesOf(working, marble) }, context, t) : collectionLine(marble, copiesOf(working, marble), context, t);
    return withPosition(line, index(), list.length);
  }

  // La fiche de la bille courante (une bille inconnue n'en a pas).
  function currentCard() {
    const marble = currentMarble();
    return isKnown(marble) ? marbleCard(marble, mainLine(), rules, t, { timeless: true }) : null;
  }

  function currentLine() {
    const card = currentCard();
    return card === null ? mainLine() : mainWithDetail(card, detail);
  }

  const zoneName = () => t(zone === "bag" ? "marbles.bagEditor.zone.bag" : "marbles.bagEditor.zone.collection");

  function beacon() {
    const marble = currentMarble();
    if (isKnown(marble)) sounds.beacon(marble, types);
  }

  function opening() {
    return `${t("marbles.bagEditor.title", { name: bagName(working, t) })} ${bagHeadText(working, status(), buildRules, t)} ${zoneName()} ${currentLine()}`;
  }

  // Haut et bas : d'une zone à l'autre ; gauche et droite : dans la zone.
  function move(direction) {
    detail = detailAfterMainMove(detail, MARBLES_SETTINGS.cardResetOnMove);
    if (direction === "up" || direction === "down") {
      const target = direction === "up" ? "bag" : "collection";
      if (target === zone) {
        sounds.menu("block");
        announceMenuLine(currentLine(), true);
        return;
      }
      zone = target;
      announceMenuLine(`${zoneName()} ${currentLine()}`);
      beacon();
      return;
    }
    const total = items().length;
    if (total === 0) {
      sounds.menu("block");
      announceMenuLine(currentLine(), true);
      return;
    }
    const before = index();
    const step = stepMenuCursor(before, direction === "left" ? -1 : 1, total);
    cursor[zone] = step.index;
    announceMenuLine(currentLine(), step.boundary);
    if (step.index !== before) beacon();
  }

  // Origine et Fin : silencieuses dans une zone vide.
  function jump(target) {
    const total = items().length;
    if (total === 0) return;
    const step = jumpMenuCursor(index(), target === "first" ? 0 : total - 1);
    cursor[zone] = step.index;
    detail = detailAfterMainMove(detail, MARBLES_SETTINGS.cardResetOnMove);
    announceMenuLine(currentLine(), step.boundary);
    if (!step.boundary) beacon();
  }

  function moveDetail(direction) {
    const card = currentCard();
    if (card === null) {
      announce(currentLine(), { assertive: true });
      return;
    }
    detail = stepDetail(detail, card, direction);
    announce(detailLine(card, detail), { assertive: true });
  }

  // Aucune bille sous le curseur : la zone vide se redit.
  function withMarble(run) {
    const marble = currentMarble();
    if (marble === undefined) {
      sounds.menu("block");
      announce(currentLine(), { assertive: true });
      return;
    }
    run(marble);
  }

  function add() {
    withMarble((marble) => {
      const result = addMarble(working, marble, context);
      if (!result.ok) {
        sounds.bag("refused");
        announce(bagEditRefusal(result, types, t), { assertive: true });
        return;
      }
      working = result.bag;
      sounds.bag("add");
      announce(addedText(marble, result.count, working, context, t), { assertive: true });
    });
  }

  function remove() {
    withMarble((marble) => {
      const result = removeMarble(working, marble);
      if (!result.ok) {
        sounds.bag("refused");
        announce(bagEditRefusal(result, types, t), { assertive: true });
        return;
      }
      working = result.bag;
      sounds.bag("remove");
      const text = removedText(marble, result.count, working, context, t);
      // L'entrée du sac a disparu : le curseur passe à sa voisine, qui se dit.
      if (zone === "bag" && result.count === 0) {
        detail = 0;
        announce(`${text} ${currentLine()}`, { assertive: true });
        beacon();
        return;
      }
      announce(text, { assertive: true });
    });
  }

  // Les filtres de la Collection : chaque appui passe au suivant ; le curseur reste sur
  // sa bille si elle passe encore le filtre, sinon revient au début.
  function cycleFilter(which) {
    const previous = items("collection")[cursor.collection];
    if (which === "family") family = nextFilter(family, MARBLE_FAMILIES);
    else rarity = nextFilter(rarity, MARBLE_RARITIES);
    const list = items("collection");
    cursor.collection = Math.max(0, list.indexOf(previous));
    sounds.menu("select");
    announce(filterText(family, rarity, list.length, t), { assertive: true });
  }

  function openProblems() {
    const { problems } = status();
    const lines =
      problems.length === 0
        ? [{ label: "marbles.bagEditor.no_problem" }]
        : problems.map((problem) => ({ label: "marbles.bagEditor.problem_line", labelParams: { problem: describeBagProblem(problem, t) } }));
    sounds.menu("select");
    pushScreen(
      makeMenuScreen(
        { title: "marbles.bagEditor.problems_title", closable: true, entries: [...lines, { label: "marbles.bagEditor.close", onActivate: () => popScreen() }] },
        t
      )
    );
  }

  // Quitter : le sac enregistré reste tel quel ; l'éditeur se referme sans se redire.
  function close() {
    leaving = true;
    popScreen();
  }

  function save() {
    sounds.bag("saved");
    onSave(structuredClone(working));
  }

  function back() {
    if (sameComposition(working, saved)) {
      sounds.menu("cancel");
      close();
      return;
    }
    sounds.menu("select");
    pushScreen(
      makeMenuScreen(
        {
          title: "marbles.bagEditor.save_prompt",
          closable: true,
          entries: [
            {
              label: "marbles.bagEditor.save",
              onActivate: () => {
                leaving = true;
                popScreen();
                save();
                popScreen();
              },
            },
            {
              label: "marbles.bagEditor.discard",
              onActivate: () => {
                leaving = true;
                popScreen();
                popScreen();
              },
            },
            { label: "marbles.bagEditor.continue", onActivate: () => popScreen() },
          ],
        },
        t
      )
    );
  }

  const keyHandlers = {
    up: () => move("up"),
    down: () => move("down"),
    left: () => move("left"),
    right: () => move("right"),
    home: () => jump("first"),
    end: () => jump("last"),
    detailUp: () => moveDetail(1),
    detailDown: () => moveDetail(-1),
    add,
    remove,
    reannounce: () => announce(opening(), { assertive: true }),
    summary: () => announce(bagSummaryText(working, status(), context, t), { assertive: true }),
    problems: openProblems,
    familyFilter: () => cycleFilter("family"),
    rarityFilter: () => cycleFilter("rarity"),
    description: () => announce(descriptionText(isKnown(currentMarble()) ? currentMarble() : undefined, t), { assertive: true }),
    identity: () => announce(identityText(isKnown(currentMarble()) ? currentMarble() : undefined, rules, t), { assertive: true }),
    keywords: () => announce(keywordsText(isKnown(currentMarble()) ? currentMarble() : undefined, rules, t), { assertive: true }),
    keywordsMenu: () => {
      sounds.menu("select");
      openKeywordsMenu(isKnown(currentMarble()) ? currentMarble() : undefined, rules);
    },
    help: () => {
      sounds.menu("select");
      openKeyHelp(screen);
    },
    back,
  };

  const screen = {
    helpSections: () => [{ id: "marblesBagEditor" }],
    onEnter() {
      if (leaving) return;
      announce(pendingNotice === null ? opening() : `${pendingNotice} ${opening()}`, { assertive: true });
      pendingNotice = null;
      beacon();
    },
    onExit() {
      sounds.stopBeacon();
    },
    onKeyDown(event) {
      const action = resolveAction(BAG_EDITOR_BINDINGS, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    },
    // Pour les vérifications : la copie de travail et le curseur, sans rien changer.
    inspect: () => ({ working: structuredClone(working), zone, index: index(), family, rarity }),
  };
  return screen;
}
